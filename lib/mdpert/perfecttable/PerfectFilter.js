sap.ui.define([
	"sap/ui/core/Control",
	"sap/ui/core/Component",
	"sap/ui/fl/variants/VariantManagement",
	"sap/m/p13n/PersistenceProvider",
	"sap/ui/mdc/FilterBar",
	"sap/ui/mdc/FilterField",
	"sap/ui/mdc/p13n/StateUtil",
	"sap/ui/comp/smartvariants/SmartVariantManagement",
	"sap/ui/comp/smartvariants/PersonalizableInfo",
	"./delegate/Registry",
	"./delegate/BufferFilterBarDelegate",
	"./library"
], function (Control, Component, VariantManagement, PersistenceProvider, FilterBar, FilterField, StateUtil, SmartVariantManagement, PersonalizableInfo,
	Registry, BufferFilterBarDelegate) {
	"use strict";

	/**
	 * 필터 바 컨트롤 (+ Variant 관리).
	 *
	 * 스스로 소스를 모른다. PerfectTable 의 filter 연관으로 붙여 두면,
	 * 표가 스키마를 확정한 뒤 connect() 를 불러 필터 필드를 만든다.
	 *
	 *   <pt:PerfectFilter id="filter"/>
	 *   <pt:PerfectTable  id="table" filter="filter" kind="v2" url="/odata/v2/catalog" entitySet="Products"/>
	 *
	 * Variant 는 두 방식 중 하나로 저장한다 (variantMode).
	 *
	 * - "page"(기본): sap.ui.comp.smartvariants.SmartVariantManagement 의 페이지 변형.
	 *   필터 조건과 연결된 표 전부의 상태(컬럼·정렬·그룹·표 필터)를 변형 하나(compVariant, type "page")에 담는다.
	 *   S/4HANA V2 List Report·SmartFilterBar 와 같은 저장 방식이라 LREP 에 USER(개인)·PUBLIC(공유) 변형으로 남고,
	 *   "기본값으로 설정"·"선택 시 바로 실행"·"뷰 관리"를 그대로 쓴다.
	 *   mdc 개인화는 PersistenceProvider(mode "Transient")로 메모리에만 두고, 저장은 이 변형 하나가 맡는다.
	 * - "control": sap.ui.fl.variants.VariantManagement 의 컨트롤 변형 (FE V4 와 같은 방식). 변경 하나하나가 flex change 로 저장된다.
	 *
	 * 어디에 저장되는지는 앱의 flexibilityServices 가 정한다. LrepConnector 면 S/4HANA LREP, LocalStorageConnector 면 브라우저.
	 */
	const PerfectFilter = Control.extend("mdpert.perfecttable.PerfectFilter", {
		metadata: {
			library: "mdpert.perfecttable",
			properties: {
				showVariant: { type: "boolean", defaultValue: true },
				/** "page" = SmartVariantManagement 페이지 변형, "control" = sap.ui.fl 컨트롤 변형 */
				variantMode: { type: "string", defaultValue: "page" },
				/** 페이지 변형의 저장 키. 비우면 컴포넌트 기준 로컬 ID 를 쓴다. 화면마다 달라야 한다 */
				persistencyKey: { type: "string", defaultValue: "" },
				showSearch: { type: "boolean", defaultValue: true },
				showGoButton: { type: "boolean", defaultValue: true },
				liveMode: { type: "boolean", defaultValue: false }
			},
			aggregations: {
				_variant: { type: "sap.ui.core.Control", multiple: false, visibility: "hidden" },
				_filterBar: { type: "sap.ui.mdc.FilterBar", multiple: false, visibility: "hidden" },
				_persistence: { type: "sap.m.p13n.PersistenceProvider", multiple: false, visibility: "hidden" }
			},
			events: {
				search: {},
				/** 페이지 변형을 읽고 기본 변형까지 적용한 뒤 */
				variantInitialized: {}
			}
		},

		renderer: {
			apiVersion: 2,
			render(rm, c) {
				rm.openStart("div", c).class("mdpertPerfectFilter").openEnd();
				["_variant", "_filterBar"].forEach((a) => {
					const o = c.getAggregation(a);
					if (o) { rm.renderControl(o); }
				});
				rm.close("div");
			}
		},

		init() {
			this._bBuilt = false;
			this._aTableIds = [];
			this._oState = null;
			this._bApplying = false;
			this._fnStateChange = this._onStateChange.bind(this);
		},

		exit() {
			const f = this.getAggregation("_filterBar");
			if (f) { Registry.unregister(f.getId()); }
			StateUtil.detachStateChange(this._fnStateChange);
		},

		getFilterBar() { return this.getAggregation("_filterBar"); },
		getVariantManagement() { return this.getAggregation("_variant"); },

		_isPageMode() { return this.getShowVariant() && this.getVariantMode() !== "control"; },

		/**
		 * PerfectTable 이 스키마를 확정한 뒤 부른다.
		 * @param {object} oCtx   { schema, tableProps, filterProps }
		 * @param {string} sTableId  Variant 가 함께 관리할 mdc Table ID
		 * @returns {string} mdc FilterBar ID (표의 filter 연관에 넣는다)
		 */
		connect(oCtx, sTableId) {
			if (!this._bBuilt) { this._build(oCtx); }
			else { this._ctx.schema = oCtx.schema; this._ctx.filterProps = oCtx.filterProps; }
			if (sTableId && !this._aTableIds.includes(sTableId)) {
				this._aTableIds.push(sTableId);
				if (this._isPageMode()) {
					this.getAggregation("_persistence").addFor(sTableId);
					// 같은 틱에 붙는 표를 모두 받은 뒤 한 번만 변형을 읽는다
					if (!this._pPageVariant) { this._pPageVariant = Promise.resolve().then(() => this._initPageVariant()); }
				} else if (this.getVariantManagement()) {
					this.getVariantManagement().addFor(sTableId);
				}
			}
			return this.getFilterBar().getId();
		},

		_build(oCtx) {
			const sId = this.getId(), sFbId = sId + "--filterbar";
			this._ctx = oCtx;
			Registry.register(sFbId, oCtx);

			// 페이지 변형이면 mdc 개인화를 flex 에 쓰지 않게 먼저 막는다 (엔진은 컨트롤마다 처음 한 번만 판정한다)
			if (this._isPageMode()) {
				this.setAggregation("_persistence", new PersistenceProvider(sId + "--persistence", { mode: "Transient", for: [sFbId] }));
			}

			const oFilterBar = new FilterBar(sFbId, {
				delegate: { name: "mdpert/perfecttable/delegate/BufferFilterBarDelegate", payload: {} },
				p13nMode: ["Item", "Value"],
				showGoButton: this.getShowGoButton(),
				liveMode: this.getLiveMode(),
				search: () => this.fireSearch()
			});
			if (this.getShowSearch()) {
				oFilterBar.setBasicSearchField(new FilterField(sFbId + "--search", {
					delegate: { name: "sap/ui/mdc/field/FieldBaseDelegate", payload: {} },
					dataType: "sap.ui.model.type.String",
					placeholder: "검색",
					conditions: "{$filters>/conditions/$search}",
					propertyKey: "$search",
					maxConditions: 1
				}));
			}
			// 처음 보일 필터: filterDefault 속성 + 키 속성
			oCtx.schema.properties.filter((p) => p.filterable && (p.filterDefault || p.isKey)).forEach((p) => {
				const fp = oCtx.filterProps.find((x) => x.key === p.key);
				oFilterBar.addFilterItem(BufferFilterBarDelegate.createFilterField(oFilterBar, fp, sFbId + "--ff-" + p.key));
			});
			this.setAggregation("_filterBar", oFilterBar);

			if (this.getShowVariant() && !this._isPageMode()) {
				this.setAggregation("_variant", new VariantManagement(sId + "--variant", { for: [sFbId] }));
			}
			this._bBuilt = true;
		},

		// ---- 페이지 변형 (SmartVariantManagement) ----------------------------------------------

		/** 변형에 저장할 때 쓰는 표 키. FLP 처럼 컴포넌트 ID 가 바뀌어도 같은 값이 나오게 컴포넌트 기준 로컬 ID 를 쓴다 */
		_localId(sId) {
			const oComp = this._getComponent();
			return (oComp && oComp.getLocalId(sId)) || sId;
		},

		_getComponent() {
			let o = this;
			while (o && !Component.getOwnerComponentFor(o)) { o = o.getParent(); }
			return o && Component.getOwnerComponentFor(o);
		},

		_getTables() {
			const Element = sap.ui.require("sap/ui/core/Element");
			return this._aTableIds.map((id) => Element.getElementById(id)).filter(Boolean);
		},

		async _initPageVariant() {
			const oFilterBar = this.getFilterBar();
			await oFilterBar.initialized();
			await Promise.all(this._getTables().map((t) => t.initialized()));
			// 표준 변형은 지금 상태다. initialise 가 fetchVariant 를 동기로 부르므로 먼저 캐시해 둔다
			await this._refreshState();

			if (!this.getPersistencyKey()) { this.setProperty("persistencyKey", this._localId(this.getId()), true); }
			// flex 는 앱 컴포넌트로 저장 위치(reference)를 정한다. 비동기로 만드니 소유 컴포넌트를 명시해야 한다
			const fnCreate = () => new SmartVariantManagement(this.getId() + "--variant", {
				persistencyKey: this.getPersistencyKey(),
				showExecuteOnSelection: true,
				personalizableControls: [new PersonalizableInfo({ type: "page", keyName: "persistencyKey", control: this.getId() })]
			});
			const oComp = this._getComponent();
			const oSvm = oComp ? oComp.runAsOwner(fnCreate) : fnCreate();
			this.setAggregation("_variant", oSvm);
			StateUtil.attachStateChange(this._fnStateChange);
			oFilterBar.attachFiltersChanged(this._fnStateChange);

			await new Promise((resolve) => oSvm.initialise(resolve, this));
			await this._pApply;
			this.fireVariantInitialized();
		},

		/** 필터 조건 + 표마다의 외부 상태. fetchVariant 가 동기라 바뀔 때마다 갱신해 둔다 */
		async _refreshState() {
			const oState = { filter: (await StateUtil.retrieveExternalState(this.getFilterBar())).filter || {}, tables: {} };
			for (const t of this._getTables()) {
				// 표 상태: 컬럼(items)·정렬·그룹·집계·표 자체 필터(p13n Filter)·컬럼 폭
				oState.tables[this._localId(t.getId())] = await StateUtil.retrieveExternalState(t);
			}
			this._oState = oState;
			return oState;
		},

		_onStateChange(oEvent) {
			const oControl = oEvent.getParameter && oEvent.getParameter("control");
			const sId = oControl ? oControl.getId() : this.getFilterBar().getId();
			if (sId !== this.getFilterBar().getId() && !this._aTableIds.includes(sId)) { return; }
			this._refreshState().then(() => {
				const oSvm = this.getVariantManagement();
				if (!this._bApplying && oSvm && oSvm.currentVariantSetModified) { oSvm.currentVariantSetModified(true); }
			});
		},

		/** SmartVariantManagement 가 부른다: 저장·표준 변형용 현재 상태 */
		fetchVariant() {
			return JSON.parse(JSON.stringify(this._oState || { filter: {}, tables: {} }));
		},

		/** SmartVariantManagement 가 부른다: 변형 선택·초기 기본 변형 적용 */
		applyVariant(oContent) {
			this._pApply = this._applyState(oContent || {});
			return this._pApply;
		},

		async _applyState(oContent) {
			this._bApplying = true;
			try {
				const oFilterBar = this.getFilterBar();
				const aTargets = [[oFilterBar, { filter: oContent.filter || {} }]];
				this._getTables().forEach((t) => {
					const s = oContent.tables && oContent.tables[this._localId(t.getId())];
					if (s) { aTargets.push([t, s]); }
				});
				// 변형은 "전체 상태"다. 지금 상태와의 차이만 적용해야 이전 변형의 컬럼·조건이 남지 않는다
				for (const [oControl, oTarget] of aTargets) {
					const oCurrent = await StateUtil.retrieveExternalState(oControl);
					const oDiff = await StateUtil.diffState(oControl, oCurrent, Object.assign({}, oCurrent, oTarget));
					await StateUtil.applyExternalState(oControl, oDiff);
				}
				await this._refreshState();
				if (oContent.executeOnSelection) { await oFilterBar.triggerSearch(); }
			} finally {
				// 적용이 일으킨 stateChange 가 비동기로 뒤따라오므로 한 틱 늦게 푼다
				setTimeout(() => { this._bApplying = false; }, 0);
			}
		}
	});

	return PerfectFilter;
});
