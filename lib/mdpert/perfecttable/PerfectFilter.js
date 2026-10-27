sap.ui.define([
	"sap/ui/core/Control",
	"sap/ui/fl/variants/VariantManagement",
	"sap/ui/mdc/FilterBar",
	"sap/ui/mdc/FilterField",
	"./delegate/Registry",
	"./delegate/BufferFilterBarDelegate",
	"./library"
], function (Control, VariantManagement, FilterBar, FilterField, Registry, BufferFilterBarDelegate) {
	"use strict";

	/**
	 * 필터 바 컨트롤 (+ Variant 관리).
	 *
	 * 스스로 소스를 모른다. PerfectTable 의 filter 연관으로 붙여 두면,
	 * 표가 스키마를 확정한 뒤 connect() 를 불러 필터 필드를 만든다.
	 *
	 *   <pt:PerfectFilter id="filter"/>
	 *   <pt:PerfectTable  id="table" filter="filter" kind="v2" url="/odata/v2/catalog" entitySet="Products"/>
	 */
	const PerfectFilter = Control.extend("mdpert.perfecttable.PerfectFilter", {
		metadata: {
			library: "mdpert.perfecttable",
			properties: {
				showVariant: { type: "boolean", defaultValue: true },
				showSearch: { type: "boolean", defaultValue: true },
				showGoButton: { type: "boolean", defaultValue: true },
				liveMode: { type: "boolean", defaultValue: false }
			},
			aggregations: {
				_variant: { type: "sap.ui.fl.variants.VariantManagement", multiple: false, visibility: "hidden" },
				_filterBar: { type: "sap.ui.mdc.FilterBar", multiple: false, visibility: "hidden" }
			},
			events: {
				search: {}
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

		init() { this._bBuilt = false; },

		exit() {
			const f = this.getAggregation("_filterBar");
			if (f) { Registry.unregister(f.getId()); }
		},

		getFilterBar() { return this.getAggregation("_filterBar"); },
		getVariantManagement() { return this.getAggregation("_variant"); },

		/**
		 * PerfectTable 이 스키마를 확정한 뒤 부른다.
		 * @param {object} oCtx   { schema, tableProps, filterProps }
		 * @param {string} sTableId  Variant 가 함께 관리할 mdc Table ID
		 * @returns {string} mdc FilterBar ID (표의 filter 연관에 넣는다)
		 */
		connect(oCtx, sTableId) {
			if (!this._bBuilt) { this._build(oCtx); }
			else { this._ctx.schema = oCtx.schema; this._ctx.filterProps = oCtx.filterProps; }
			const oVariant = this.getVariantManagement();
			if (oVariant && sTableId && !oVariant.getFor().includes(sTableId)) { oVariant.addFor(sTableId); }
			return this.getFilterBar().getId();
		},

		_build(oCtx) {
			const sId = this.getId(), sFbId = sId + "--filterbar";
			this._ctx = oCtx;
			Registry.register(sFbId, oCtx);

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

			if (this.getShowVariant()) {
				this.setAggregation("_variant", new VariantManagement(sId + "--variant", { for: [sFbId] }));
			}
			this._bBuilt = true;
		}
	});

	return PerfectFilter;
});
