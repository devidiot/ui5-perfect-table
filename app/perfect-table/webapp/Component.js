sap.ui.define(["sap/ui/core/UIComponent"], function (UIComponent) {
	"use strict";
	return UIComponent.extend("poc.app.Component", {
		metadata: { manifest: "json", interfaces: ["sap.ui.core.IAsyncContentCreation"] },
		init() {
			UIComponent.prototype.init.apply(this, arguments);
			this.getRouter().initialize();
		}
	});
});
