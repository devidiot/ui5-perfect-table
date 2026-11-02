sap.ui.define(["../schema/Schema"], function (Schema) {
	"use strict";

	const S = Schema.STATE_KEY;

	/** 버퍼 안의 행 상태('' | C | U | D) 와 변경 묶음을 다룬다 */
	const ChangeTracker = {

		markUpdated(oRow) {
			if (oRow && !oRow[S]) { oRow[S] = "U"; }
		},

		newRow(oSchema, oValues) {
			const row = {};
			oSchema.properties.forEach((p) => { row[p.path] = oValues && oValues[p.path] !== undefined ? oValues[p.path] : null; });
			row[S] = "C";
			return row;
		},

		/** 신규 행은 바로 지우고, 기존 행은 'D' 로 표시한다 */
		markDeleted(aRows, aAll) {
			const remove = new Set(aRows.filter((r) => r[S] === "C"));
			aRows.forEach((r) => { if (r[S] !== "C") { r[S] = "D"; } });
			return aAll.filter((r) => !remove.has(r));
		},

		strip(oRow) {
			const o = Object.assign({}, oRow);
			delete o[S];
			return o;
		},

		getChanges(aAll) {
			const changes = { created: [], updated: [], deleted: [] };
			aAll.forEach((r) => {
				if (r[S] === "C") { changes.created.push(ChangeTracker.strip(r)); }
				else if (r[S] === "U") { changes.updated.push(ChangeTracker.strip(r)); }
				else if (r[S] === "D") { changes.deleted.push(ChangeTracker.strip(r)); }
			});
			return changes;
		},

		/** RFC 식 액션 payload: RowState 를 붙인 한 배열 */
		toActionRows(aAll) {
			return aAll.filter((r) => r[S]).map((r) => Object.assign({ RowState: r[S] }, ChangeTracker.strip(r)));
		}
	};

	return ChangeTracker;
});
