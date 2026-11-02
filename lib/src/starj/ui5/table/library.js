sap.ui.define([
	"sap/ui/core/Lib",
	"sap/ui/base/DataType",
	"sap/ui/core/library",
	"sap/m/library",
	"sap/ui/mdc/library",
	"sap/ui/fl/library",
	"sap/ui/comp/library"
], function (Library, DataType) {
	"use strict";

	/**
	 * 데이터 소스에 상관없이 같은 모양으로 쓰는 "필터 바 + 표" 라이브러리.
	 *
	 * JSON(REST), OData V2, OData V4, RFC 를 감싼 반쪽 OData 처럼 Fiori Elements 가 받지 못하는 소스를
	 * 같은 컨트롤 두 개({@link starj.ui5.table.FilterBar}, {@link starj.ui5.table.Table})로 띄웁니다.
	 * 내부는 `sap.ui.mdc` 로 그리고, 변형은 `sap.ui.comp` 의 SmartVariantManagement 로 S/4HANA LREP 에 저장합니다.
	 *
	 * 어떤 것을 써야 하나:
	 *
	 * | 상황 | 권장 |
	 * |---|---|
	 * | RAP OData V4 서비스가 온전하고 화면이 List Report·Object Page 틀에 맞는다 | Fiori Elements (`sap.fe`) |
	 * | OData V2 이고 화면이 SmartFilterBar·SmartTable 틀에 맞는다 | `sap.ui.comp.smarttable.SmartTable` |
	 * | 소스가 JSON·반쪽 OData 이거나, 엑셀처럼 표 안에서 고치고 붙여넣어 한 번에 저장해야 한다 | 이 라이브러리 |
	 *
	 * ```xml
	 * <mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns:sj="starj.ui5.table">
	 *   <sj:FilterBar id="filter"/>
	 *   <sj:Table id="table" filter="filter" kind="v4" url="/sap/opu/odata4/sap/zsb_order/srvd/sap/zsd_order/0001" entitySet="Orders"/>
	 * </mvc:View>
	 * ```
	 *
	 * @namespace
	 * @alias starj.ui5.table
	 * @public
	 */
	const thisLib = Library.init({
		name: "starj.ui5.table",
		version: "${version}",
		apiVersion: 2,
		dependencies: ["sap.ui.core", "sap.m", "sap.ui.mdc", "sap.ui.fl", "sap.ui.comp"],
		types: ["starj.ui5.table.TableType", "starj.ui5.table.VariantMode"],
		interfaces: [],
		controls: ["starj.ui5.table.FilterBar", "starj.ui5.table.Table"],
		elements: [],
		noLibraryCSS: true
	});

	// UI5 enum 은 XML 속성 문자열을 키로 찾으므로 키와 값을 같은 PascalCase 로 둔다 (프레임워크 규약)

	/**
	 * {@link starj.ui5.table.Table} 이 안에서 그릴 표의 종류.
	 *
	 * @enum {string}
	 * @public
	 */
	thisLib.TableType = {
		/**
		 * `sap.m.Table`. 행 높이가 내용에 맞춰 늘고 화면 폭이 좁으면 컬럼을 접습니다. 수백 행 이하, 모바일 겸용 화면에 맞습니다.
		 * @public
		 */
		ResponsiveTable: "ResponsiveTable",
		/**
		 * `sap.ui.table.Table`. 보이는 행만 그려 수천 행도 빠르고, 컬럼을 고정 폭으로 가로 스크롤합니다. 엑셀형 편집 화면에 맞습니다.
		 * @public
		 */
		GridTable: "GridTable"
	};
	DataType.registerEnum("starj.ui5.table.TableType", thisLib.TableType);

	/**
	 * {@link starj.ui5.table.FilterBar} 가 변형을 저장하는 방식.
	 *
	 * @enum {string}
	 * @public
	 */
	thisLib.VariantMode = {
		/**
		 * SmartVariantManagement 페이지 변형. 필터 조건과 연결된 표의 상태를 변형 하나에 담습니다.
		 * S/4HANA List Report(V2)·SmartFilterBar 와 같은 방식입니다.
		 * @public
		 */
		Page: "Page",
		/**
		 * `sap.ui.fl.variants.VariantManagement` 컨트롤 변형. 바뀐 내용 하나하나가 flex change 로 저장됩니다. Fiori Elements V4 와 같은 방식입니다.
		 * @public
		 */
		Control: "Control"
	};
	DataType.registerEnum("starj.ui5.table.VariantMode", thisLib.VariantMode);

	return thisLib;
});
