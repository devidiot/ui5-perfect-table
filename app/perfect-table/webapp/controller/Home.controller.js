sap.ui.define(["sap/ui/core/mvc/Controller"], function (Controller) {
	"use strict";
	return Controller.extend("poc.app.controller.Home", {
		onTilePress(oEvent) {
			this.getOwnerComponent().getRouter().navTo(oEvent.getSource().data("route"));
		}
	});
});
