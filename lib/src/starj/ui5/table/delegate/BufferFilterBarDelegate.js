sap.ui.define([
	"sap/ui/core/Element",
	"sap/ui/mdc/FilterBarDelegate",
	"sap/ui/mdc/FilterField",
	"sap/ui/mdc/odata/v4/TypeMap",
	"./Registry"
], function (Element, FilterBarDelegate, FilterField, TypeMap, Registry) {
	"use strict";

	/** 버퍼 모드 필터 바 delegate. 스키마의 filterable 속성을 FilterField 로 만든다 */
	const BufferFilterBarDelegate = Object.assign({}, FilterBarDelegate);

	BufferFilterBarDelegate.getTypeMap = function () { return TypeMap; };

	BufferFilterBarDelegate.fetchProperties = async function (oFilterBar) {
		return Registry.get(oFilterBar).filterProps;
	};

	BufferFilterBarDelegate.createFilterField = function (oFilterBar, oProp, sId) {
		return new FilterField(sId, {
			dataType: oProp.dataType,
			dataTypeConstraints: oProp.constraints || {},
			dataTypeFormatOptions: oProp.formatOptions || {},
			conditions: "{$filters>/conditions/" + oProp.key + "}",
			propertyKey: oProp.key,
			label: oProp.label,
			maxConditions: oProp.maxConditions,
			delegate: { name: "sap/ui/mdc/field/FieldBaseDelegate", payload: {} }
		});
	};

	BufferFilterBarDelegate.addItem = async function (oFilterBar, sPropertyKey) {
		const oProp = Registry.get(oFilterBar).filterProps.find((p) => p.key === sPropertyKey);
		const sId = oFilterBar.getId() + "--ff-" + sPropertyKey;
		return Element.getElementById(sId) || BufferFilterBarDelegate.createFilterField(oFilterBar, oProp, sId);
	};

	return BufferFilterBarDelegate;
});
