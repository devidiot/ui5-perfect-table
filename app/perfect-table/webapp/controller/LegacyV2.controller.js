sap.ui.define(["./Base.controller", "sap/m/MessageBox"], function (Base, MessageBox) {
	"use strict";

	/** 반쪽 OData: 표준 CUD 가 없고 액션(saveProducts)만 있으니 RowState 배열을 보낸다 (PoC 0 은 보여 주기만) */
	return Base.extend("poc.app.controller.LegacyV2", {
		onSave(oEvent) {
			const aRows = oEvent.getParameter("actionRows");
			MessageBox.information(
				`saveProducts(Rows) 에 보낼 ${aRows.length}행\n\n` + JSON.stringify(aRows.slice(0, 5), null, 2) + (aRows.length > 5 ? "\n..." : ""),
				{ title: "액션 호출 payload (더미 writer)" }
			);
		}
	});
});
