sap.ui.define([
	"sap/ui/core/Lib",
	"sap/ui/core/library",
	"sap/m/library",
	"sap/ui/mdc/library",
	"sap/ui/fl/library",
	"sap/ui/comp/library"
], function (Library) {
	"use strict";

	/**
	 * mdpert.perfecttable
	 * sap.ui.mdc 위에 얹는 "필터 + 표" 조립 라이브러리.
	 * 데이터 소스(JSON·OData V2·OData V4·반쪽 OData)에 상관없이 같은 컨트롤로 쓴다.
	 */
	return Library.init({
		name: "mdpert.perfecttable",
		version: "0.0.1",
		apiVersion: 2,
		dependencies: ["sap.ui.core", "sap.m", "sap.ui.mdc", "sap.ui.fl", "sap.ui.comp"],
		types: [],
		interfaces: [],
		controls: ["mdpert.perfecttable.PerfectFilter", "mdpert.perfecttable.PerfectTable"],
		elements: [],
		noLibraryCSS: true
	});
});
