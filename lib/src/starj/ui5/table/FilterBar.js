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
	"./util/Texts",
	"./library"
], function (Control, Component, VariantManagement, PersistenceProvider, MdcFilterBar, FilterField, StateUtil, SmartVariantManagement, PersonalizableInfo,
	Registry, BufferFilterBarDelegate, Texts, library) {
	"use strict";

	const VariantMode = library.VariantMode;

	/**
	 * 필터 바와 변형(뷰) 관리를 한데 묶은 컨트롤.
	 *
	 * 스스로는 소스를 모릅니다. {@link starj.ui5.table.Table} 의 `filter` 연관으로 이 컨트롤을 가리키면,
	 * 표가 스키마를 읽은 뒤 필터 필드를 만들어 줍니다. 처음에는 키 속성과 스키마에서 `filterDefault` 인 속성만 보이고,
	 * 나머지는 "필터 조정" 에서 사용자가 꺼냅니다. 기본 검색 필드는 문자열 속성 전체에서 부분 일치로 찾습니다.
	 *
	 * 변형은 기본값 {@link starj.ui5.table.VariantMode.Page Page} 방식으로 저장합니다.
	 * 필터 조건과 연결된 표의 컬럼·정렬·그룹·표 필터·컬럼 폭을 변형 하나에 담고,
	 * "기본값으로 설정", "공용", "선택 시 바로 실행", "뷰 관리" 를 그대로 씁니다.
	 * 어디에 저장되는지는 앱의 flex 설정이 정합니다. FLP 에서는 S/4HANA LREP 의 사용자(USER)·공용(PUBLIC) 레이어에 저장됩니다.
	 *
	 * ```xml
	 * <mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns:f="sap.f" xmlns:sj="starj.ui5.table">
	 *   <f:DynamicPage>
	 *     <f:header><f:DynamicPageHeader><sj:FilterBar id="filter" liveMode="true"/></f:DynamicPageHeader></f:header>
	 *     <f:content><sj:Table id="table" filter="filter" kind="v4" url="/odata/v4/catalog" entitySet="Products"/></f:content>
	 *   </f:DynamicPage>
	 * </mvc:View>
	 * ```
	 *
	 * @caution 변형은 앱 컴포넌트 안에서만 저장됩니다. 컴포넌트 없이 띄운 단독 HTML 에서는 저장할 때 `Parameter 'reference' is missing` 오류가 납니다.
	 * @caution 한 화면에 이 컨트롤을 둘 이상 두면 {@link #setPersistencyKey persistencyKey} 가 서로 달라야 변형이 섞이지 않습니다. 비워 두면 컨트롤 ID 로 정하므로 ID 를 다르게 주면 됩니다.
	 *
	 * @extends sap.ui.core.Control
	 * @alias starj.ui5.table.FilterBar
	 * @public
	 */
	const FilterBar = Control.extend("starj.ui5.table.FilterBar", {
		metadata: {
			library: "starj.ui5.table",
			properties: {
				/** 변형 관리(뷰 선택)를 보일지 정합니다. 기본값 `true`. `false` 면 변형을 저장하지 않고 필터 조건은 화면을 떠나면 사라집니다. */
				showVariant: { type: "boolean", defaultValue: true },
				/**
				 * 변형 저장 방식. 기본값 {@link starj.ui5.table.VariantMode.Page Page} 는 필터와 표 상태를 한 변형에 담습니다.
				 * {@link starj.ui5.table.VariantMode.Control Control} 은 `sap.ui.fl` 컨트롤 변형으로, 바뀐 내용을 하나하나 저장합니다.
				 * 처음 그린 뒤에 바꾸면 반영되지 않습니다. `showVariant` 가 `false` 면 무시합니다.
				 */
				variantMode: { type: "starj.ui5.table.VariantMode", defaultValue: VariantMode.Page },
				/**
				 * 페이지 변형의 저장 키. 비우면 앱 컴포넌트 기준 로컬 ID(예: `orders--filter`)를 씁니다.
				 * FLP 에서 컴포넌트 ID 가 바뀌어도 같은 값이 나오므로 대개 비워 두면 됩니다.
				 * 이미 저장된 변형이 있는 화면에서 키를 바꾸면 그 변형들이 목록에서 사라집니다.
				 */
				persistencyKey: { type: "string", defaultValue: "" },
				/** 기본 검색 필드를 보일지 정합니다. 기본값 `true`. 문자열 속성 전체에서 대소문자 구분 없이 부분 일치로 찾습니다. */
				showSearch: { type: "boolean", defaultValue: true },
				/** "이동(Go)" 버튼을 보일지 정합니다. 기본값 `true`. `liveMode` 를 켰으면 끄십시오. */
				showGoButton: { type: "boolean", defaultValue: true },
				/** 기본값 `false`. `true` 면 조건을 바꿀 때마다 바로 거릅니다. 버퍼 방식이라 행이 수천 건이면 켜도 빠릅니다. */
				liveMode: { type: "boolean", defaultValue: false }
			},
			aggregations: {
				_variant: { type: "sap.ui.core.Control", multiple: false, visibility: "hidden" },
				_filterBar: { type: "sap.ui.mdc.FilterBar", multiple: false, visibility: "hidden" },
				_persistence: { type: "sap.m.p13n.PersistenceProvider", multiple: false, visibility: "hidden" }
			},
			events: {
				/** "이동" 버튼을 누르거나, `liveMode` 에서 조건이 바뀌거나, 변형을 "선택 시 바로 실행" 으로 고르면 납니다. 매개변수는 없습니다. */
				search: {},
				/**
				 * 페이지 변형 목록을 읽고 기본 변형을 적용한 뒤 한 번 납니다. 앱이 기본 변형이 적용된 조건으로 무언가를 해야 할 때 씁니다.
				 * `variantMode` 가 `Control` 이거나 `showVariant` 가 `false` 면 나지 않습니다. 매개변수는 없습니다.
				 */
				variantInitialized: {}
			}
		},

		renderer: {
			apiVersion: 2,
			render(rm, control) {
				rm.openStart("div", control).class("starj-filter-bar").openEnd();
				["_variant", "_filterBar"].forEach((sAggregation) => {
					const oChild = control.getAggregation(sAggregation);
					if (oChild) { rm.renderControl(oChild); }
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

		/**
		 * 안에서 그리는 `sap.ui.mdc.FilterBar` 를 돌려줍니다. 조건을 코드로 읽거나 넣을 때 씁니다.
		 * @returns {sap.ui.mdc.FilterBar|null} 표가 연결되기 전에는 `null`
		 * @public
		 */
		getFilterBar() { return this.getAggregation("_filterBar"); },

		/**
		 * 변형 관리 컨트롤을 돌려줍니다. `Page` 방식이면 `sap.ui.comp.smartvariants.SmartVariantManagement`,
		 * `Control` 방식이면 `sap.ui.fl.variants.VariantManagement` 입니다.
		 * @returns {sap.ui.core.Control|null} 변형을 쓰지 않거나 아직 만들기 전이면 `null`
		 * @public
		 */
		getVariantManagement() { return this.getAggregation("_variant"); },

		_isPageMode() { return this.getShowVariant() && this.getVariantMode() !== VariantMode.Control; },

		/**
		 * 표가 스키마를 읽은 뒤 부른다. 앱 코드에서 부르지 않는다.
		 * @param {object} oCtx   { schema, tableProps, filterProps }
		 * @param {string} sTableId  변형이 함께 관리할 mdc Table ID
		 * @returns {string} mdc FilterBar ID (표의 filter 연관에 넣는다)
		 * @private
		 * @ui5-restricted starj.ui5.table.Table
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

			const oFilterBar = new MdcFilterBar(sFbId, {
				delegate: { name: "starj/ui5/table/delegate/BufferFilterBarDelegate", payload: {} },
				p13nMode: ["Item", "Value"],
				showGoButton: this.getShowGoButton(),
				liveMode: this.getLiveMode(),
				search: () => this.fireSearch()
			});
			if (this.getShowSearch()) {
				oFilterBar.setBasicSearchField(new FilterField(sFbId + "--search", {
					delegate: { name: "sap/ui/mdc/field/FieldBaseDelegate", payload: {} },
					dataType: "sap.ui.model.type.String",
					placeholder: Texts.get("FILTER_SEARCH"),
					label: Texts.get("FILTER_SEARCH"),
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

		/**
		 * SmartVariantManagement 가 부른다: 저장·표준 변형용 현재 상태.
		 * @returns {object} `{ filter, tables: { <로컬 ID>: 표 상태 } }`
		 * @private
		 * @ui5-restricted sap.ui.comp.smartvariants.SmartVariantManagement
		 */
		fetchVariant() {
			return JSON.parse(JSON.stringify(this._oState || { filter: {}, tables: {} }));
		},

		/**
		 * SmartVariantManagement 가 부른다: 변형 선택·초기 기본 변형 적용.
		 * @param {object} oContent fetchVariant 가 돌려준 모양
		 * @returns {Promise<void>} 적용이 끝나면 끝나는 Promise
		 * @private
		 * @ui5-restricted sap.ui.comp.smartvariants.SmartVariantManagement
		 */
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

	return FilterBar;
});
