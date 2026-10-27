sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/m/MessageBox"
], function (Controller, MessageBox) {
	"use strict";

	/** 다섯 화면이 공유하는 것: 홈 이동, 로드 결과 표시, PoC 0 의 더미 writer */
	return Controller.extend("poc.app.controller.Base", {

		onNavHome() { this.getOwnerComponent().getRouter().navTo("home"); },

		onLoaded(oEvent) {
			const s = oEvent.getParameter("schema"), cap = s.capabilities || {};
			const sWrite = [cap.insertable !== false ? "C" : "-", cap.updatable !== false ? "U" : "-", cap.deletable !== false ? "D" : "-"].join("");
			this.byId("info").setText(`${oEvent.getParameter("count")}행 · 속성 ${s.properties.length}개 · OData ${s.odataVersion || "없음"} · 표준 쓰기 ${sWrite} · 액션 ${(s.actions || []).map((a) => a.name).join("/") || "없음"}`);
		},

		/** 더미 writer: 변경 묶음(C/U/D)을 보여 주기만 한다. 실제 writer 는 PoC 1 */
		onSave(oEvent) {
			const c = oEvent.getParameter("changes");
			MessageBox.information(
				`신규 ${c.created.length} / 수정 ${c.updated.length} / 삭제 ${c.deleted.length}\n\n` + JSON.stringify(c, null, 2).slice(0, 1500),
				{ title: "변경 내역 (더미 writer)" }
			);
		}
	});
});
