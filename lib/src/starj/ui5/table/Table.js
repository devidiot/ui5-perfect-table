sap.ui.define([
	"sap/ui/core/Control",
	"sap/ui/core/Element",
	"sap/ui/model/json/JSONModel",
	"sap/ui/mdc/Table",
	"sap/ui/mdc/table/ResponsiveTableType",
	"sap/ui/mdc/table/GridTableType",
	"sap/ui/mdc/actiontoolbar/ActionToolbarAction",
	"sap/m/Button",
	"sap/m/MessageToast",
	"sap/m/MessageBox",
	"sap/m/plugins/CopyProvider",
	"sap/m/plugins/CellSelector",
	"sap/ui/mdc/odata/v4/TypeMap",
	"./schema/Schema",
	"./schema/EdmxSchemaProvider",
	"./data/BufferReader",
	"./data/ChangeTracker",
	"./delegate/Registry",
	"./delegate/BufferTableDelegate",
	"./library"
], function (Control, Element, JSONModel, Table, ResponsiveTableType, GridTableType,
	ActionToolbarAction, Button, MessageToast, MessageBox, CopyProvider, CellSelector, TypeMap,
	Schema, EdmxSchemaProvider, BufferReader, ChangeTracker, Registry, BufferTableDelegate) {
	"use strict";

	/**
	 * 표 컨트롤 (버퍼 모드).
	 *
	 * 소스는 XML 속성으로 바로 준다 (OData 는 $metadata 에서 스키마를 읽는다):
	 *   <pt:PerfectTable kind="v2" url="/odata/v2/catalog" entitySet="Products" hide="ID,createdAt"/>
	 *   <pt:PerfectTable kind="v4" url="/odata/v4/legacy"  entitySet="ProductList"/>
	 *   <pt:PerfectTable kind="json" url="/rest/catalog/Products" jsonSchema="{/schema}"/>   (JSON 은 스키마를 손으로)
	 * 또는 JS 에서 setSource({ kind, url|serviceUrl, entitySet, hide, schema }) 로 준다.
	 *
	 * 필터 바를 붙이려면 PerfectFilter 를 filter 연관에 넣는다. 스키마는 표가 읽어 필터에 넘긴다.
	 */
	const PerfectTable = Control.extend("mdpert.perfecttable.PerfectTable", {
		metadata: {
			library: "mdpert.perfecttable",
			properties: {
				kind: { type: "string", defaultValue: "" },          // json | v2 | v4
				url: { type: "string", defaultValue: "" },           // json: 데이터 URL, v2/v4: 서비스 루트
				entitySet: { type: "string", defaultValue: "" },
				hide: { type: "string[]", defaultValue: [] },        // 표·필터에서 숨길 속성
				jsonSchema: { type: "object" },                      // kind=json 일 때 스키마
				source: { type: "object" },                          // 위 속성 대신 한 번에 주는 객체
				header: { type: "string", defaultValue: "" },
				editable: { type: "boolean", defaultValue: false },
				tableType: { type: "string", defaultValue: "ResponsiveTable" }
			},
			associations: {
				filter: { type: "mdpert.perfecttable.PerfectFilter", multiple: false }
			},
			aggregations: {
				_table: { type: "sap.ui.mdc.Table", multiple: false, visibility: "hidden" }
			},
			events: {
				loaded: { parameters: { count: { type: "int" }, schema: { type: "object" } } },
				loadFailed: { parameters: { error: { type: "object" } } },
				save: { parameters: { changes: { type: "object" }, actionRows: { type: "object[]" } } }
			}
		},

		renderer: {
			apiVersion: 2,
			render(rm, c) {
				rm.openStart("div", c).class("mdpertPerfectTable").style("height", "100%").openEnd();
				const o = c.getAggregation("_table");
				if (o) { rm.renderControl(o); }
				rm.close("div");
			}
		},

		init() {
			this._oBuffer = new JSONModel({ rows: [] });
			this._oBuffer.setSizeLimit(100000);
			this._oBuffer.attachPropertyChange((e) => {
				const ctx = e.getParameter("context");
				if (ctx) { ChangeTracker.markUpdated(ctx.getObject()); }
			});
			this.setModel(this._oBuffer, "buffer");
			this._oSettings = new JSONModel({ editMode: "Display" });
			this.setModel(this._oSettings, "$pt");
			this._bBuilt = false;
			this._bLoadStarted = false;
		},

		exit() {
			const t = this.getAggregation("_table");
			if (t) { Registry.unregister(t.getId()); }
		},

		/** XML 속성만으로 소스를 줬을 때: 첫 렌더링 직전에 한 번 읽는다 */
		onBeforeRendering() {
			if (!this._bLoadStarted && this._getSource()) { this._load(); }
		},

		setSource(oSource) {
			this.setProperty("source", oSource, true);
			if (oSource) { this._load(); }
			return this;
		},

		setEditable(b) {
			this.setProperty("editable", b, true);
			this._oSettings.setProperty("/editMode", b ? "Editable" : "Display");
			return this;
		},

		getSchema() { return this._ctx && this._ctx.schema; },
		getRows() { return this._oBuffer.getProperty("/rows"); },
		getChanges() { return ChangeTracker.getChanges(this.getRows()); },
		getActionRows() { return ChangeTracker.toActionRows(this.getRows()); },
		getTable() { return this.getAggregation("_table"); },
		getFilterControl() { const s = this.getFilter(); return s ? Element.getElementById(s) : null; },
		reload() { return this._load(); },

		_getSource() {
			if (this.getSource()) { return this.getSource(); }
			if (!this.getKind()) { return null; }
			const o = { kind: this.getKind(), entitySet: this.getEntitySet(), hide: this.getHide(), schema: this.getJsonSchema() };
			if (o.kind === "json") { o.url = this.getUrl(); } else { o.serviceUrl = this.getUrl(); }
			return o;
		},

		async _resolveSchema(oSource) {
			if (oSource.kind === "json") { return Schema.normalize(oSource.schema); }
			return EdmxSchemaProvider.load(oSource);
		},

		async _load() {
			const oSource = this._getSource();
			if (!oSource) { return; }
			this._bLoadStarted = true;
			try {
				const oSchema = await this._resolveSchema(oSource);
				// Field 템플릿이 타입 인스턴스를 만들기 전에 타입 모듈을 미리 로드한다
				await TypeMap.retrieveDataTypeClasses(Schema.dataTypes(oSchema));
				if (!this._bBuilt) { this._build(oSchema); }
				else { this._ctx.schema = oSchema; }
				const aRows = await BufferReader.load(oSource, oSchema);
				this._oBuffer.setData({ rows: aRows });
				this.fireLoaded({ count: aRows.length, schema: oSchema });
			} catch (err) {
				this.fireLoadFailed({ error: err });
				MessageBox.error(String(err && err.message || err));
			}
		},

		_build(oSchema) {
			const sTableId = this.getId() + "--table";
			this._ctx = {
				schema: oSchema,
				tableProps: Schema.toTablePropertyInfos(oSchema),
				filterProps: Schema.toFilterPropertyInfos(oSchema),
				editable: this.getEditable()
			};
			Registry.register(sTableId, this._ctx);

			const oType = this.getTableType() === "GridTable"
				? new GridTableType({ rowCountMode: "Auto" })
				: new ResponsiveTableType({ growingMode: "Scroll" });

			const oTable = new Table(sTableId, {
				header: this.getHeader() || oSchema.entity,
				delegate: { name: "mdpert/perfecttable/delegate/BufferTableDelegate", payload: {} },
				p13nMode: ["Column", "Sort", "Filter", "Group"],
				type: oType,
				enableExport: true,
				enablePaste: true,
				showPasteButton: true,
				enableColumnResize: true,
				selectionMode: "Multi",
				showRowCount: true,
				threshold: 100,
				copyProvider: new CopyProvider(),
				cellSelector: new CellSelector(),
				paste: this._onPaste.bind(this),
				actions: [
					new ActionToolbarAction({ action: new Button(sTableId + "--btnAdd", { text: "행 추가", icon: "sap-icon://add", press: this._onAddRow.bind(this) }) }),
					new ActionToolbarAction({ action: new Button(sTableId + "--btnDelete", { text: "삭제", icon: "sap-icon://delete", press: this._onDeleteRows.bind(this) }) }),
					new ActionToolbarAction({ action: new Button(sTableId + "--btnEdit", { text: "편집 전환", icon: "sap-icon://edit", press: () => this.setEditable(!this.getEditable()) }) }),
					new ActionToolbarAction({ action: new Button(sTableId + "--btnSave", { text: "저장(변경 내역)", icon: "sap-icon://save", type: "Emphasized", press: this._onSave.bind(this) }) }),
					new ActionToolbarAction({ action: new Button(sTableId + "--btnReload", { text: "다시 읽기", icon: "sap-icon://refresh", press: () => this._load() }) })
				]
			});
			// 처음 보일 컬럼: visible 속성 + 상태 컬럼
			oSchema.properties.filter((p) => p.visible).forEach((p) => {
				oTable.addColumn(BufferTableDelegate.createColumn(oTable, p, sTableId + "--col-" + p.key));
			});
			oTable.addColumn(BufferTableDelegate.createColumn(oTable, { key: Schema.STATE_KEY, path: Schema.STATE_KEY, label: "상태", type: "String" }, sTableId + "--col-" + Schema.STATE_KEY));
			this.setAggregation("_table", oTable);

			// 필터 바가 붙어 있으면 같은 스키마로 필터 필드를 만들고, 표의 filter 연관에 건다
			const oFilter = this.getFilterControl();
			if (oFilter) { oTable.setFilter(oFilter.connect(this._ctx, sTableId)); }
			this._bBuilt = true;
		},

		_onAddRow() {
			const aRows = this.getRows();
			aRows.unshift(ChangeTracker.newRow(this._ctx.schema));
			this._oBuffer.setProperty("/rows", aRows);
			if (!this.getEditable()) { this.setEditable(true); }
		},

		_onDeleteRows() {
			const oTable = this.getTable();
			const aSel = oTable.getSelectedContexts().map((c) => c.getObject());
			if (!aSel.length) { MessageToast.show("행을 먼저 선택하세요"); return; }
			this._oBuffer.setProperty("/rows", ChangeTracker.markDeleted(aSel, this.getRows()));
			oTable.clearSelection();
		},

		/** 엑셀 붙여넣기: 현재 보이는 컬럼 순서대로 칸을 맞춰 새 행으로 넣는다 */
		_onPaste(oEvent) {
			const aData = oEvent.getParameter("data") || [];
			const oTable = this.getTable();
			const aCols = oTable.getColumns().map((c) => c.getPropertyKey()).filter((k) => k !== Schema.STATE_KEY);
			const oTypeMap = BufferTableDelegate.getTypeMap();
			const aNew = aData.map((aCells) => {
				const oValues = {};
				aCols.forEach((sKey, i) => {
					const p = Schema.getProperty(this._ctx.schema, sKey);
					if (!p || aCells[i] === undefined) { return; }
					if (p.type === "Boolean") {
						const s = String(aCells[i]).trim();
						oValues[p.path] = s === "" ? null : /^(true|x|1|yes|y|예|참)$/i.test(s);
						return;
					}
					const t = Schema.typeInfo(p);
					try {
						const oType = oTypeMap.getDataTypeInstance(t.dataType, t.formatOptions, t.constraints);
						oValues[p.path] = aCells[i] === "" ? null : oType.parseValue(aCells[i], "string");
					} catch (e) {
						oValues[p.path] = aCells[i];
					}
				});
				return ChangeTracker.newRow(this._ctx.schema, oValues);
			});
			const aRows = this.getRows();
			this._oBuffer.setProperty("/rows", aNew.concat(aRows));
			if (!this.getEditable()) { this.setEditable(true); }
			MessageToast.show(aNew.length + "행을 붙여 넣었습니다");
		},

		_onSave() {
			const changes = this.getChanges();
			const actionRows = this.getActionRows();
			this.fireSave({ changes, actionRows });
		}
	});

	return PerfectTable;
});
