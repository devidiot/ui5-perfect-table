sap.ui.define([], function () {
	"use strict";

	/**
	 * 중립 스키마.
	 * 소스가 무엇이든 여기 모양으로 맞춘 뒤 mdc PropertyInfo 로 바꾼다.
	 * 값 표현은 OData V4 JSON 을 기준으로 한다: Decimal·Int64 는 문자열, Date 는 "yyyy-MM-dd",
	 * DateTimeOffset 은 ISO 문자열, Int32·Boolean 은 그대로.
	 *
	 * property: { key, path, label, type, maxLength, precision, scale, isKey,
	 *             filterable, sortable, groupable, visible, filterDefault, editable, unit, text }
	 */
	const TYPES = {
		String:         { dataType: "sap.ui.model.odata.type.String",  constraints: (p) => p.maxLength ? { maxLength: p.maxLength } : undefined },
		Guid:           { dataType: "sap.ui.model.odata.type.Guid" },
		Decimal:        { dataType: "sap.ui.model.odata.type.Decimal", numeric: true, constraints: (p) => ({ precision: p.precision || 15, scale: p.scale === undefined ? 2 : p.scale }) },
		Double:         { dataType: "sap.ui.model.odata.type.Double",  numeric: true },
		Single:         { dataType: "sap.ui.model.odata.type.Single",  numeric: true },
		Byte:           { dataType: "sap.ui.model.odata.type.Byte",    numeric: true },
		SByte:          { dataType: "sap.ui.model.odata.type.SByte",   numeric: true },
		Int16:          { dataType: "sap.ui.model.odata.type.Int16",   numeric: true },
		Int32:          { dataType: "sap.ui.model.odata.type.Int32",   numeric: true },
		Int64:          { dataType: "sap.ui.model.odata.type.Int64",   numeric: true },
		Boolean:        { dataType: "sap.ui.model.odata.type.Boolean", single: true },
		Date:           { dataType: "sap.ui.model.odata.type.Date" },
		DateTimeOffset: { dataType: "sap.ui.model.odata.type.DateTimeOffset" },
		TimeOfDay:      { dataType: "sap.ui.model.odata.type.TimeOfDay" }
	};

	const STATE_KEY = "__state";

	const Schema = {
		STATE_KEY,
		TYPES,

		/** 빠진 값을 채워 완전한 스키마로 만든다 */
		normalize(oRaw) {
			const oSchema = Object.assign({ entity: "", keys: [], capabilities: {}, actions: [] }, oRaw);
			oSchema.properties = (oRaw.properties || []).map((p) => {
				const o = Object.assign({
					path: p.key, label: p.key, type: "String",
					filterable: true, sortable: true, groupable: true, visible: true,
					filterDefault: false, editable: true
				}, p);
				if (!TYPES[o.type]) {
					throw new Error("Unknown schema type '" + o.type + "' for " + o.key);
				}
				if (o.isKey && !oSchema.keys.includes(o.key)) {
					oSchema.keys.push(o.key);
				}
				return o;
			});
			return oSchema;
		},

		isNumeric(oProp) { return !!TYPES[oProp.type].numeric; },

		getProperty(oSchema, sKey) { return oSchema.properties.find((p) => p.key === sKey); },

		/** mdc 가 요구하는 타입 3종 세트 */
		typeInfo(oProp) {
			const t = TYPES[oProp.type];
			return {
				dataType: t.dataType,
				constraints: (t.constraints && t.constraints(oProp)) || {},
				formatOptions: oProp.formatOptions || {}
			};
		},

		/** sap.ui.mdc.Table 용 PropertyInfo */
		toTablePropertyInfos(oSchema) {
			const a = oSchema.properties.map((p) => Object.assign({
				key: p.key, path: p.path, label: p.label,
				sortable: p.sortable, filterable: p.filterable, groupable: p.groupable && !Schema.isNumeric(p),
				visible: true, isKey: !!p.isKey, unit: p.unit, text: p.text,
				exportSettings: Schema.exportSettings(p),
				visualSettings: { widthCalculation: { minWidth: 4, maxWidth: 20 } }
			}, Schema.typeInfo(p)));
			a.push({
				key: STATE_KEY, path: STATE_KEY, label: "상태", dataType: "sap.ui.model.odata.type.String",
				sortable: true, filterable: false, groupable: false, visible: true,
				exportSettings: null, visualSettings: { widthCalculation: { minWidth: 4, maxWidth: 6 } }
			});
			return a;
		},

		/** sap.ui.mdc.FilterBar 용 PropertyInfo */
		toFilterPropertyInfos(oSchema) {
			const a = oSchema.properties.filter((p) => p.filterable).map((p) => Object.assign({
				key: p.key, path: p.path, label: p.label,
				maxConditions: TYPES[p.type].single ? 1 : -1,
				caseSensitive: false,
				group: "", groupLabel: ""
			}, Schema.typeInfo(p)));
			a.push({ key: "$search", label: "검색", dataType: "sap.ui.model.type.String", maxConditions: 1 });
			return a;
		},

		/** 이 스키마가 쓰는 UI5 타입 클래스 이름 (미리 로드용) */
		dataTypes(oSchema) {
			return Array.from(new Set(oSchema.properties.map((p) => TYPES[p.type].dataType).concat(["sap.ui.model.odata.type.String", "sap.ui.model.type.String"])));
		},

		exportSettings(p) {
			switch (p.type) {
				case "Decimal": case "Double": case "Single": return { type: "Number", scale: p.scale === undefined ? 2 : p.scale, delimiter: true };
				case "Int16": case "Int32": case "Int64": case "Byte": case "SByte": return { type: "Number", scale: 0, delimiter: true };
				case "Boolean": return { type: "Boolean" };
				case "Date": return { type: "Date", format: "yyyy-MM-dd" };
				case "DateTimeOffset": return { type: "DateTime" };
				default: return { type: "String" };
			}
		}
	};

	return Schema;
});
