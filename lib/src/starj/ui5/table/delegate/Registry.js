sap.ui.define([], function () {
	"use strict";

	/**
	 * delegate 는 정적 모듈이라 인스턴스 상태를 못 갖는다.
	 * 컨트롤 ID 로 스키마·설정을 찾아 쓰도록 여기 등록한다.
	 */
	const mEntries = new Map();

	return {
		register(sId, oCtx) { mEntries.set(sId, oCtx); },
		unregister(sId) { mEntries.delete(sId); },
		get(oControl) {
			const o = mEntries.get(typeof oControl === "string" ? oControl : oControl.getId());
			if (!o) { throw new Error("starj.ui5.table: no registry entry for " + (oControl.getId ? oControl.getId() : oControl)); }
			return o;
		}
	};
});
