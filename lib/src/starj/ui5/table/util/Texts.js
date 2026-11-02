sap.ui.define(["sap/ui/core/Lib"], function (Library) {
	"use strict";

	/**
	 * 라이브러리 화면 문구. `messagebundle*.properties` 에서 UI5 언어(`sap-ui-language`, 없으면 브라우저 언어)에 맞는 것을 읽는다.
	 * @private
	 */
	return {
		get(sKey, aArgs) {
			return Library.getResourceBundleFor("starj.ui5.table").getText(sKey, aArgs);
		}
	};
});
