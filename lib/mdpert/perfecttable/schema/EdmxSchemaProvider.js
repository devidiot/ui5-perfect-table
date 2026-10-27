sap.ui.define(["./Schema"], function (Schema) {
	"use strict";

	/**
	 * OData $metadata(EDMX XML) 를 읽어 중립 스키마로 바꾼다. V2 와 V4 를 같이 다룬다.
	 * 라벨은 V2 sap:label, V4 Common.Label 에서 받는다.
	 * 쓰기 가능 여부(capabilities)와 액션 목록도 함께 돌려주어 "쓰기 방식" 을 고를 수 있게 한다.
	 */
	const NS_COMMON = "com.sap.vocabularies.Common.v1";
	const NS_CAP = "Org.OData.Capabilities.V1";

	function attr(el, name) { return el ? el.getAttribute(name) : null; }

	function mapEdmType(sEdm, oPropEl, bV2) {
		const t = (sEdm || "Edm.String").replace(/^Edm\./, "");
		if (t === "DateTime") {
			return attr(oPropEl, "sap:display-format") === "Date" ? "Date" : "DateTimeOffset";
		}
		if (t === "Time") { return "TimeOfDay"; }
		if (t === "Binary" || t === "Stream") { return "String"; }
		return Schema.TYPES[t] ? t : "String";
	}

	const EdmxSchemaProvider = {

		async load(oSource) {
			const sUrl = oSource.serviceUrl.replace(/\/$/, "") + "/$metadata";
			const res = await fetch(sUrl, { headers: { Accept: "application/xml" } });
			if (!res.ok) { throw new Error("$metadata " + res.status + " " + sUrl); }
			return EdmxSchemaProvider.parse(await res.text(), oSource);
		},

		parse(sXml, oSource) {
			const doc = new DOMParser().parseFromString(sXml, "application/xml");
			const all = (name) => Array.from(doc.getElementsByTagNameNS("*", name));
			const edmx = all("Edmx")[0];
			const bV2 = attr(edmx, "Version") === "1.0";

			// 별칭 (V4: edmx:Include Alias)
			const alias = {};
			all("Include").forEach((inc) => { if (attr(inc, "Alias")) { alias[attr(inc, "Namespace")] = attr(inc, "Alias"); } });
			const commonAlias = alias[NS_COMMON] || "Common";
			const capAlias = alias[NS_CAP] || "Capabilities";

			const entitySet = all("EntitySet").find((s) => attr(s, "Name") === oSource.entitySet);
			if (!entitySet) { throw new Error("EntitySet not found: " + oSource.entitySet); }
			const sTypeFQ = attr(entitySet, "EntityType");
			const sTypeName = sTypeFQ.split(".").pop();
			const schemaEl = all("Schema").find((s) => sTypeFQ.startsWith(attr(s, "Namespace") + "."));
			const ns = attr(schemaEl, "Namespace");
			const entityType = all("EntityType").find((t) => attr(t, "Name") === sTypeName && t.parentNode === schemaEl)
				|| all("EntityType").find((t) => attr(t, "Name") === sTypeName);

			const keys = Array.from(entityType.getElementsByTagNameNS("*", "PropertyRef")).map((k) => attr(k, "Name"));

			// V4 어노테이션 (Target = NS.Type/Prop)
			const annoByTarget = {};
			all("Annotations").forEach((a) => { annoByTarget[attr(a, "Target")] = a; });
			const v4Anno = (target, term) => {
				const a = annoByTarget[target];
				if (!a) { return null; }
				return Array.from(a.getElementsByTagNameNS("*", "Annotation")).find((x) => attr(x, "Term") === term);
			};

			const hide = new Set(oSource.hide || []);
			const properties = Array.from(entityType.children).filter((c) => c.localName === "Property").map((p) => {
				const name = attr(p, "Name");
				const type = mapEdmType(attr(p, "Type"), p, bV2);
				// V2 는 sap:label, 없으면 (SAP Gateway·cov2ap 처럼) V2 문서 안에 V4 식으로 실린 Common.Label 을 본다
				let label = attr(p, "sap:label");
				if (!label) {
					const la = v4Anno(sTypeFQ + "/" + name, commonAlias + ".Label") || v4Anno(sTypeFQ + "/" + name, NS_COMMON + ".Label");
					label = la ? attr(la, "String") : null;
				}
				const o = {
					key: name, path: name, label: label || name, type,
					isKey: keys.includes(name),
					filterable: attr(p, "sap:filterable") !== "false",
					sortable: attr(p, "sap:sortable") !== "false",
					visible: !hide.has(name),
					editable: attr(p, "sap:updatable") !== "false" && !keys.includes(name)
				};
				if (attr(p, "MaxLength") && attr(p, "MaxLength") !== "Max") { o.maxLength = Number(attr(p, "MaxLength")); }
				if (attr(p, "Precision")) { o.precision = Number(attr(p, "Precision")); }
				if (attr(p, "Scale") && attr(p, "Scale") !== "variable") { o.scale = Number(attr(p, "Scale")); }
				return o;
			});

			// 쓰기 가능 여부
			const capabilities = { insertable: true, updatable: true, deletable: true };
			if (bV2) {
				capabilities.insertable = attr(entitySet, "sap:creatable") !== "false";
				capabilities.updatable = attr(entitySet, "sap:updatable") !== "false";
				capabilities.deletable = attr(entitySet, "sap:deletable") !== "false";
			} else {
				const container = all("EntityContainer")[0];
				const target = ns + "." + attr(container, "Name") + "/" + oSource.entitySet;
				const check = (term, prop) => {
					const a = v4Anno(target, capAlias + "." + term) || v4Anno(target, NS_CAP + "." + term);
					if (!a) { return true; }
					const pv = Array.from(a.getElementsByTagNameNS("*", "PropertyValue")).find((x) => attr(x, "Property") === prop);
					return !pv || attr(pv, "Bool") !== "false";
				};
				capabilities.insertable = check("InsertRestrictions", "Insertable");
				capabilities.updatable = check("UpdateRestrictions", "Updatable");
				capabilities.deletable = check("DeleteRestrictions", "Deletable");
			}

			// 액션·함수 목록
			const actions = bV2
				? all("FunctionImport").map((f) => ({ name: attr(f, "Name"), method: attr(f, "m:HttpMethod") || f.getAttribute("m:HttpMethod") || "GET", returns: attr(f, "ReturnType") }))
				: all("Action").map((a) => ({ name: attr(a, "Name"), method: "POST" })).concat(all("Function").map((f) => ({ name: attr(f, "Name"), method: "GET" })));

			return Schema.normalize({
				entity: oSource.entitySet, odataVersion: bV2 ? "2.0" : "4.0",
				keys, properties, capabilities, actions
			});
		}
	};

	return EdmxSchemaProvider;
});
