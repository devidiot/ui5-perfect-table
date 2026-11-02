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
	"./source/Schema",
	"./source/EdmxSchemaProvider",
	"./source/BufferReader",
	"./edit/ChangeTracker",
	"./delegate/Registry",
	"./delegate/BufferTableDelegate",
	"./util/Texts",
	"./library"
], function (Control, Element, JSONModel, MdcTable, ResponsiveTableType, GridTableType,
	ActionToolbarAction, Button, MessageToast, MessageBox, CopyProvider, CellSelector, TypeMap,
	Schema, EdmxSchemaProvider, BufferReader, ChangeTracker, Registry, BufferTableDelegate, Texts, library) {
	"use strict";

	const TableType = library.TableType;

	/**
	 * 소스를 속성으로 받아 스키마를 읽고, 행 전체를 버퍼에 올려 보여 주고 고치게 하는 표.
	 *
	 * OData 소스는 `$metadata` 에서 컬럼·라벨·타입을 읽고, JSON 소스는 {@link #setJsonSchema jsonSchema} 로 스키마를 직접 줍니다.
	 * 행은 처음에 전부 읽어(서버 페이징은 끝까지 따라감) 클라이언트에서 필터·정렬·그룹을 합니다.
	 * 편집한 행은 상태(`C` 신규, `U` 수정, `D` 삭제)가 붙고, 저장 버튼을 누르면 {@link #event:save save} 이벤트로 변경 묶음을 넘깁니다.
	 * 서버에 쓰는 일은 앱이 그 이벤트에서 합니다.
	 *
	 * 툴바에는 행 추가, 삭제, 편집, 저장, 다시 읽기 버튼과 표 설정(톱니바퀴)·엑셀 내보내기·붙여넣기가 들어 있습니다.
	 * 엑셀에서 복사한 칸을 붙여넣으면 보이는 컬럼 순서대로 값을 맞춰 신규 행으로 넣습니다.
	 *
	 * 필터 바를 붙이려면 {@link starj.ui5.table.FilterBar} 를 {@link #setFilter filter} 연관에 넣으십시오.
	 * 표가 스키마를 읽은 뒤 필터 바에 넘기므로 필터 바에는 소스를 주지 않습니다.
	 *
	 * ```xml
	 * <mvc:View controllerName="my.app.controller.Orders" xmlns:mvc="sap.ui.core.mvc" xmlns:f="sap.f" xmlns:sj="starj.ui5.table">
	 *   <f:DynamicPage>
	 *     <f:header><f:DynamicPageHeader><sj:FilterBar id="filter"/></f:DynamicPageHeader></f:header>
	 *     <f:content>
	 *       <sj:Table id="table" filter="filter" kind="v2" url="/sap/opu/odata/sap/ZORDER_SRV" entitySet="OrderSet"
	 *         hide="CreatedBy,ChangedBy" tableType="GridTable" save=".onSave"/>
	 *     </f:content>
	 *   </f:DynamicPage>
	 * </mvc:View>
	 * ```
	 *
	 * ```js
	 * // my/app/controller/Orders.controller.js
	 * onSave(event) {
	 *   const changes = event.getParameter("changes");   // { created: [], updated: [], deleted: [] }
	 *   return fetch("/my/write/endpoint", { method: "POST", body: JSON.stringify(changes) });
	 * }
	 * ```
	 *
	 * @caution 행 전체를 브라우저에 올리는 버퍼 방식입니다. 수만 행을 넘는 소스는 느려지므로 서버 쪽 조건으로 줄여서 주십시오.
	 * @caution 저장 버튼은 변경 묶음을 이벤트로 넘길 뿐 서버에 쓰지 않습니다. {@link #event:save save} 를 처리하지 않으면 변경은 화면에만 남습니다.
	 *
	 * @extends sap.ui.core.Control
	 * @alias starj.ui5.table.Table
	 * @public
	 */
	const Table = Control.extend("starj.ui5.table.Table", {
		metadata: {
			library: "starj.ui5.table",
			properties: {
				/**
				 * 소스 종류. `"json"`, `"v2"`, `"v4"` 중 하나입니다.
				 *
				 * - `"json"`: {@link #setUrl url} 에서 JSON 배열(또는 `value`·`d` 속성 아래 배열)을 받습니다. 스키마는 {@link #setJsonSchema jsonSchema} 로 줍니다.
				 * - `"v2"`·`"v4"`: {@link #setUrl url} 을 서비스 루트로 보고 `$metadata` 와 {@link #setEntitySet entitySet} 을 읽습니다.
				 *
				 * 비워 두면 {@link #setSource source} 를 줄 때까지 아무것도 읽지 않습니다.
				 */
				kind: { type: "string", defaultValue: "" },
				/** `kind` 가 `"json"` 이면 데이터 URL, `"v2"`·`"v4"` 면 서비스 루트 URL 입니다. */
				url: { type: "string", defaultValue: "" },
				/** OData 엔티티 셋 이름. `kind` 가 `"v2"`·`"v4"` 일 때만 씁니다. */
				entitySet: { type: "string", defaultValue: "" },
				/**
				 * 표와 필터 바에서 뺄 속성 이름. XML 에서는 쉼표로 이어 씁니다(`hide="ID,createdAt"`).
				 * 빠진 속성은 표 설정(톱니바퀴)의 컬럼 목록에도 나오지 않습니다.
				 */
				hide: { type: "string[]", defaultValue: [] },
				/**
				 * `kind` 가 `"json"` 일 때의 스키마. `{ entity, properties: [{ key, label, type, isKey, ... }] }` 모양입니다.
				 * `type` 은 `String`, `Decimal`, `Int32`, `Boolean`, `Date`, `DateTimeOffset` 같은 OData 기본 타입 이름입니다.
				 */
				jsonSchema: { type: "object" },
				/**
				 * `kind`·`url`·`entitySet`·`hide`·`jsonSchema` 를 한 객체로 줍니다. 주면 위 속성보다 앞서고, 줄 때마다 다시 읽습니다.
				 * 화면을 연 뒤 소스를 바꿔야 할 때 씁니다. 모양: `{ kind, url | serviceUrl, entitySet, hide, schema }`.
				 */
				source: { type: "object" },
				/** 툴바 제목. 비우면 스키마의 엔티티 이름을 씁니다. */
				header: { type: "string", defaultValue: "" },
				/**
				 * 셀 편집 모드. 기본값 `false` 는 보기 전용입니다. `true` 면 셀이 입력 필드로 바뀝니다.
				 * 편집 모드에서도 키 속성과 `editable: false` 속성은 신규 행에서만 열리고, 삭제 표시 행은 잠깁니다.
				 * 행 추가·붙여넣기를 하면 자동으로 `true` 가 됩니다.
				 */
				editable: { type: "boolean", defaultValue: false },
				/**
				 * 안에서 그릴 표 종류. 기본값은 {@link starj.ui5.table.TableType.ResponsiveTable ResponsiveTable} 입니다.
				 * 행이 많거나 엑셀처럼 넓은 표를 고치는 화면은 {@link starj.ui5.table.TableType.GridTable GridTable} 로 바꾸십시오.
				 * 처음 그린 뒤에 바꾸면 반영되지 않습니다.
				 */
				tableType: { type: "starj.ui5.table.TableType", defaultValue: TableType.ResponsiveTable }
			},
			associations: {
				/** 함께 쓸 필터 바. 표가 스키마를 읽은 뒤 필터 필드를 만들고, 그 조건으로 행을 거릅니다. */
				filter: { type: "starj.ui5.table.FilterBar", multiple: false }
			},
			aggregations: {
				_table: { type: "sap.ui.mdc.Table", multiple: false, visibility: "hidden" }
			},
			events: {
				/**
				 * 스키마와 행을 다 읽은 뒤 납니다. 처음 읽을 때와 {@link #reload} 때마다 납니다.
				 * `count` 는 읽은 행 수, `schema` 는 컬럼·타입·쓰기 가능 여부(`capabilities`)·액션 목록을 담은 스키마입니다.
				 */
				loaded: { parameters: { count: { type: "int" }, schema: { type: "object" } } },
				/** 스키마나 행을 읽다가 실패하면 납니다. 이때 표는 오류 대화상자도 띄웁니다. `error` 는 던져진 오류입니다. */
				loadFailed: { parameters: { error: { type: "object" } } },
				/**
				 * 툴바의 저장 버튼을 누르면 납니다.
				 * `changes` 는 `{ created, updated, deleted }` 행 배열 묶음이고,
				 * `actionRows` 는 같은 내용을 `RowState`(`C`·`U`·`D`) 를 붙인 한 배열로 편 것입니다. RFC 를 감싼 액션에 넘길 때 씁니다.
				 */
				save: { parameters: { changes: { type: "object" }, actionRows: { type: "object[]" } } }
			}
		},

		renderer: {
			apiVersion: 2,
			render(rm, control) {
				rm.openStart("div", control).class("starj-table").style("height", "100%").openEnd();
				const innerTable = control.getAggregation("_table");
				if (innerTable) { rm.renderControl(innerTable); }
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
			this.setModel(this._oSettings, "$sj");
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

		setEditable(bEditable) {
			this.setProperty("editable", bEditable, true);
			this._oSettings.setProperty("/editMode", bEditable ? "Editable" : "Display");
			return this;
		},

		/**
		 * 읽은 스키마를 돌려줍니다. 읽기 전에는 `undefined` 입니다.
		 * @returns {object|undefined} `{ entity, keys, properties, capabilities, actions, odataVersion }`
		 * @public
		 */
		getSchema() { return this._ctx && this._ctx.schema; },

		/**
		 * 버퍼의 행 배열을 그대로 돌려줍니다. 행마다 상태 속성 `__state`(`""`·`C`·`U`·`D`)가 붙어 있습니다.
		 * @returns {object[]} 행 배열 (복사본이 아니므로 고치면 화면에 반영됩니다)
		 * @public
		 */
		getRows() { return this._oBuffer.getProperty("/rows"); },

		/**
		 * 상태가 붙은 행을 `{ created, updated, deleted }` 로 묶어 돌려줍니다. 상태 속성은 뺀 복사본입니다.
		 * @returns {{created: object[], updated: object[], deleted: object[]}} 변경 묶음
		 * @public
		 */
		getChanges() { return ChangeTracker.getChanges(this.getRows()); },

		/**
		 * 상태가 붙은 행을 `RowState` 속성을 붙인 한 배열로 돌려줍니다. RFC 를 감싼 액션에 행 테이블로 넘길 때 씁니다.
		 * @returns {object[]} `{ RowState, ...행 값 }` 배열
		 * @public
		 */
		getActionRows() { return ChangeTracker.toActionRows(this.getRows()); },

		/**
		 * 안에서 그리는 `sap.ui.mdc.Table` 을 돌려줍니다. 툴바 액션을 더 붙이거나 개인화 상태를 다룰 때 씁니다.
		 * @returns {sap.ui.mdc.Table|null} 스키마를 읽기 전에는 `null`
		 * @public
		 */
		getTable() { return this.getAggregation("_table"); },

		/**
		 * {@link #setFilter filter} 연관이 가리키는 필터 바를 돌려줍니다.
		 * @returns {starj.ui5.table.FilterBar|null} 연관이 없으면 `null`
		 * @public
		 */
		getFilterControl() { const sId = this.getFilter(); return sId ? Element.getElementById(sId) : null; },

		/**
		 * 소스를 다시 읽습니다. 버퍼의 변경 내용은 버립니다. 끝나면 {@link #event:loaded loaded} 가 납니다.
		 * @returns {Promise<void>} 다 읽으면 끝나는 Promise
		 * @public
		 */
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

			const oType = this.getTableType() === TableType.GridTable
				? new GridTableType({ rowCountMode: "Auto" })
				: new ResponsiveTableType({ growingMode: "Scroll" });

			const oTable = new MdcTable(sTableId, {
				header: this.getHeader() || oSchema.entity,
				delegate: { name: "starj/ui5/table/delegate/BufferTableDelegate", payload: {} },
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
					new ActionToolbarAction({ action: new Button(sTableId + "--btnAdd", { text: Texts.get("TABLE_ADD_ROW"), icon: "sap-icon://add", press: this._onAddRow.bind(this) }) }),
					new ActionToolbarAction({ action: new Button(sTableId + "--btnDelete", { text: Texts.get("TABLE_DELETE"), icon: "sap-icon://delete", press: this._onDeleteRows.bind(this) }) }),
					new ActionToolbarAction({ action: new Button(sTableId + "--btnEdit", { text: Texts.get("TABLE_TOGGLE_EDIT"), icon: "sap-icon://edit", press: () => this.setEditable(!this.getEditable()) }) }),
					new ActionToolbarAction({ action: new Button(sTableId + "--btnSave", { text: Texts.get("TABLE_SAVE"), icon: "sap-icon://save", type: "Emphasized", press: this._onSave.bind(this) }) }),
					new ActionToolbarAction({ action: new Button(sTableId + "--btnReload", { text: Texts.get("TABLE_RELOAD"), icon: "sap-icon://refresh", press: () => this._load() }) })
				]
			});
			// 처음 보일 컬럼: visible 속성 + 상태 컬럼
			oSchema.properties.filter((p) => p.visible).forEach((p) => {
				oTable.addColumn(BufferTableDelegate.createColumn(oTable, p, sTableId + "--col-" + p.key));
			});
			oTable.addColumn(BufferTableDelegate.createColumn(oTable, { key: Schema.STATE_KEY, path: Schema.STATE_KEY, label: Texts.get("TABLE_STATE_COLUMN"), type: "String" }, sTableId + "--col-" + Schema.STATE_KEY));
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
			if (!aSel.length) { MessageToast.show(Texts.get("TABLE_SELECT_ROWS_FIRST")); return; }
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
			MessageToast.show(Texts.get("TABLE_ROWS_PASTED", [aNew.length]));
		},

		_onSave() {
			const changes = this.getChanges();
			const actionRows = this.getActionRows();
			this.fireSave({ changes, actionRows });
		}
	});

	return Table;
});
