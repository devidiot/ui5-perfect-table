sap.ui.define(["./Schema"], function (Schema) {
	"use strict";

	/**
	 * 버퍼 모드 읽기. 소스에서 행을 전부 받아 중립 값 표현으로 바꾼다.
	 * 서버 페이징(V4 @odata.nextLink, V2 __next)은 끝까지 따라간다.
	 */
	const V2_DATE = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/;

	function v2DateToIso(sVal) {
		const m = V2_DATE.exec(sVal);
		if (!m) { return sVal; }
		return new Date(Number(m[1])).toISOString();
	}

	function normalizeRow(oRaw, oSchema, sKind) {
		const row = {};
		oSchema.properties.forEach((p) => {
			let v = oRaw[p.path];
			if (v === undefined) { return; }
			if (v !== null) {
				switch (p.type) {
					case "Decimal": case "Int64":
						v = String(v); break;
					case "Date":
						if (sKind === "v2" && typeof v === "string" && V2_DATE.test(v)) { v = v2DateToIso(v); }
						if (typeof v === "string" && v.length > 10) { v = v.slice(0, 10); }
						break;
					case "DateTimeOffset":
						if (sKind === "v2" && typeof v === "string" && V2_DATE.test(v)) { v = v2DateToIso(v); }
						break;
					default: break;
				}
			}
			row[p.path] = v;
		});
		row[Schema.STATE_KEY] = "";
		return row;
	}

	async function getJson(sUrl) {
		const res = await fetch(sUrl, { headers: { Accept: "application/json" } });
		if (!res.ok) { throw new Error("GET " + sUrl + " -> " + res.status); }
		return res.json();
	}

	const BufferReader = {

		async load(oSource, oSchema) {
			const sKind = oSource.kind;
			let aRows = [];
			if (sKind === "json") {
				const body = await getJson(oSource.url);
				aRows = Array.isArray(body) ? body : (body.value || body.d || []);
			} else if (sKind === "v2") {
				let sUrl = oSource.serviceUrl.replace(/\/$/, "") + "/" + oSource.entitySet + "?$format=json";
				while (sUrl) {
					const body = await getJson(sUrl);
					aRows = aRows.concat(body.d.results || body.d);
					sUrl = body.d.__next || null;
				}
			} else if (sKind === "v4") {
				const base = oSource.serviceUrl.replace(/\/$/, "");
				let sUrl = base + "/" + oSource.entitySet;
				while (sUrl) {
					const body = await getJson(sUrl);
					aRows = aRows.concat(body.value);
					const next = body["@odata.nextLink"];
					sUrl = next ? (next.startsWith("http") || next.startsWith("/") ? next : base + "/" + next) : null;
				}
			} else {
				throw new Error("Unknown source kind: " + sKind);
			}
			return aRows.map((r) => normalizeRow(r, oSchema, sKind));
		}
	};

	return BufferReader;
});
