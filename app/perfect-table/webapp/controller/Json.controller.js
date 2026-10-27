sap.ui.define(["./Base.controller"], function (Base) {
	"use strict";

	/** JSON 소스는 메타데이터가 없으니 스키마를 손으로 준다. 그 밖에는 Base 그대로 */
	return Base.extend("poc.app.controller.Json", {
		onInit() {
			this.byId("table").setJsonSchema({
				entity: "Products",
				properties: [
					{ key: "ProductID", label: "제품 ID", type: "String", maxLength: 10, isKey: true, filterDefault: true },
					{ key: "Name", label: "제품명", type: "String", maxLength: 60, filterDefault: true },
					{ key: "Category", label: "분류", type: "String", maxLength: 30, filterDefault: true },
					{ key: "Supplier", label: "공급업체", type: "String", maxLength: 40 },
					{ key: "Price", label: "단가", type: "Decimal", precision: 13, scale: 2, unit: "Currency" },
					{ key: "Currency", label: "통화", type: "String", maxLength: 3 },
					{ key: "Quantity", label: "수량", type: "Int32" },
					{ key: "Unit", label: "단위", type: "String", maxLength: 3 },
					{ key: "ReleaseDate", label: "출시일", type: "Date", filterDefault: true },
					{ key: "Active", label: "사용", type: "Boolean" },
					{ key: "ID", label: "UUID", type: "Guid", visible: false, editable: false },
					{ key: "modifiedAt", label: "수정 시각", type: "DateTimeOffset", visible: false, editable: false }
				]
			});
		}
	});
});
