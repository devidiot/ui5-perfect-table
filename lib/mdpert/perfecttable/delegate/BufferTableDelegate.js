sap.ui.define([
	"sap/ui/core/Element",
	"sap/ui/mdc/TableDelegate",
	"sap/ui/mdc/table/Column",
	"sap/ui/mdc/Field",
	"sap/ui/mdc/odata/v4/TypeMap",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/ObjectStatus",
	"./Registry",
	"../schema/Schema"
], function (Element, TableDelegate, Column, Field, TypeMap, Filter, FilterOperator, ObjectStatus, Registry, Schema) {
	"use strict";

	/**
	 * 버퍼 모드 표 delegate.
	 * 행은 "buffer>/rows" (JSONModel) 에 있고, 필터·정렬은 클라이언트에서 한다.
	 * 숫자 속성은 값이 문자열(Decimal)이라 비교 함수를 따로 붙인다.
	 * 셀은 sap.ui.mdc.Field 하나로 두고 editMode 만 바꿔 보기/편집을 전환한다 (템플릿 교체·rebind 없음).
	 */
	const BufferTableDelegate = Object.assign({}, TableDelegate);

	const MODEL = "buffer";
	const SETTINGS = "$pt";

	function numericCompare(a, b) {
		const x = Number(a), y = Number(b);
		if (isNaN(x) || isNaN(y)) { return a === b ? 0 : (a < b ? -1 : 1); }
		return x === y ? 0 : (x < y ? -1 : 1);
	}

	function walkFilters(aFilters, fn) {
		(aFilters || []).forEach((f) => {
			if (f.aFilters) { walkFilters(f.aFilters, fn); } else { fn(f); }
		});
	}

	BufferTableDelegate.getTypeMap = function () { return TypeMap; };

	BufferTableDelegate.fetchProperties = async function (oTable) {
		return Registry.get(oTable).tableProps;
	};

	/**
	 * editMode 계산: 표 전체가 보기 모드면 Display.
	 * 편집 모드에서도 키·편집 불가 속성은 신규 행(C)에서만 열리고, 삭제 표시(D) 행은 잠근다.
	 */
	function editModeFormatter(oProp) {
		return function (sMode, sState) {
			if (sMode !== "Editable" || sState === "D") { return "Display"; }
			if (oProp.editable === false || oProp.isKey) { return sState === "C" ? "Editable" : "Display"; }
			return "Editable";
		};
	}

	BufferTableDelegate.createTemplate = function (oTable, oProp) {
		if (oProp.key === Schema.STATE_KEY) {
			return new ObjectStatus({
				text: { path: MODEL + ">" + Schema.STATE_KEY, formatter: (s) => ({ C: "신규", U: "수정", D: "삭제" }[s] || "") },
				state: { path: MODEL + ">" + Schema.STATE_KEY, formatter: (s) => ({ C: "Success", U: "Warning", D: "Error" }[s] || "None") }
			});
		}
		const t = Schema.typeInfo(oProp);
		// Field 는 바인딩의 type 을 인스턴스로 요구한다 (XML 뷰에서는 프로세서가 해 주지만 JS 에서는 직접 만든다)
		const oType = TypeMap.getDataTypeInstance(t.dataType, t.formatOptions, t.constraints);
		return new Field({
			value: { path: MODEL + ">" + oProp.path, type: oType },
			editMode: { parts: [{ path: SETTINGS + ">/editMode" }, { path: MODEL + ">" + Schema.STATE_KEY }], formatter: editModeFormatter(oProp) },
			textAlign: Schema.isNumeric(oProp) ? "End" : "Begin",
			width: "100%",
			delegate: { name: "sap/ui/mdc/field/FieldBaseDelegate", payload: {} }
		});
	};

	BufferTableDelegate.createColumn = function (oTable, oProp, sId) {
		return new Column(sId, {
			propertyKey: oProp.key,
			header: oProp.label,
			hAlign: Schema.isNumeric(oProp) ? "End" : "Begin",
			template: BufferTableDelegate.createTemplate(oTable, oProp)
		});
	};

	BufferTableDelegate.addItem = async function (oTable, sPropertyKey) {
		const ctx = Registry.get(oTable);
		const oProp = ctx.tableProps.find((p) => p.key === sPropertyKey);
		const sId = oTable.getId() + "--col-" + sPropertyKey;
		const oSchemaProp = Schema.getProperty(ctx.schema, sPropertyKey) || { key: sPropertyKey, path: sPropertyKey, label: oProp.label, type: "String" };
		return Element.getElementById(sId) || BufferTableDelegate.createColumn(oTable, oSchemaProp, sId);
	};

	BufferTableDelegate.updateBindingInfo = function (oTable, oBindingInfo) {
		TableDelegate.updateBindingInfo.call(BufferTableDelegate, oTable, oBindingInfo);
		const ctx = Registry.get(oTable);
		oBindingInfo.path = MODEL + ">/rows";
		oBindingInfo.templateShareable = true;
		(oBindingInfo.sorter || []).forEach((oSorter) => {
			const p = ctx.schema.properties.find((x) => x.path === oSorter.sPath);
			if (p && Schema.isNumeric(p)) { oSorter.fnCompare = numericCompare; }
		});
	};

	BufferTableDelegate.getFilters = function (oTable) {
		const ctx = Registry.get(oTable);
		let aFilters = TableDelegate.getFilters.call(BufferTableDelegate, oTable);
		walkFilters(aFilters, (f) => {
			const p = ctx.schema.properties.find((x) => x.path === f.sPath);
			if (p && Schema.isNumeric(p)) { f.fnCompare = numericCompare; }
		});
		// 기본 검색: 문자열 속성 전부에 Contains OR
		const oFilterBar = oTable.getFilter() && Element.getElementById(oTable.getFilter());
		const sSearch = oFilterBar && oFilterBar.getSearch && oFilterBar.getSearch();
		if (sSearch) {
			const aKeys = ctx.schema.properties.filter((p) => p.type === "String").map((p) => p.path);
			aFilters = aFilters.concat([new Filter(aKeys.map((k) => new Filter({ path: k, operator: FilterOperator.Contains, value1: sSearch, caseSensitive: false })), false)]);
		}
		return aFilters;
	};

	return BufferTableDelegate;
});
