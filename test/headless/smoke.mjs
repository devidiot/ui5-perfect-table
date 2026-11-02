// PoC 0 헤드리스 검증 (타일 홈 + 화면 5개, DynamicPage + starj.ui5.table FilterBar·Table). 서버(cds serve, 기본 4104)가 떠 있어야 한다.
//   node test/headless/smoke.mjs [baseUrl] [page]   page 기본 index.html(LocalStorage), index-s4.html 이면 S/4HANA LREP
//   page 에 ?lib=dist 를 붙이면 라이브러리를 소스가 아니라 빌드 결과(lib/dist, library-preload.js)로 읽는다. 먼저 npm run build:lib
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:4104";
const PAGE = process.argv[3] || "index.html";
const IS_LREP = PAGE.includes("s4");
const IS_DIST = PAGE.includes("lib=dist");
const OUT = path.resolve("test/headless/out");
fs.mkdirSync(OUT, { recursive: true });
const pfx = (key) => `container-app---${key}--`;
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${detail}`); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
let page = await context.newPage();
const consoleErrors = [];
const hook = (p) => {
  p.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  p.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
};
hook(page);

const ui5 = (fn, ...args) => page.evaluate(({ src, args }) => {
  const Element = sap.ui.require("sap/ui/core/Element");
  const byId = (id) => Element.getElementById(id);
  return new Function("byId", "args", `return (${src})(byId, ...args)`)(byId, args);
}, { src: fn.toString(), args });

const applyState = (id, state) => page.evaluate(async ({ id, state }) => {
  const StateUtil = await new Promise((res) => sap.ui.require(["sap/ui/mdc/p13n/StateUtil"], res));
  const c = sap.ui.require("sap/ui/core/Element").getElementById(id);
  await StateUtil.applyExternalState(c, state);
  if (c.triggerSearch) { await c.triggerSearch(); }
}, { id, state });

const waitEl = (id) => page.waitForFunction((id) => { const E = sap.ui.require("sap/ui/core/Element"); return E && E.getElementById(id); }, id, { timeout: 60000 });
const waitView = () => waitEl("container-app---home--page");
// 페이지 변형(SmartVariantManagement)은 표·필터 바 초기화 뒤 비동기로 붙는다. 기본 변형 적용까지 기다린다
const waitVariant = (filterId) => page.waitForFunction((id) => { const f = sap.ui.require("sap/ui/core/Element").getElementById(id); return f && f._pPageVariant; }, filterId, { timeout: 60000 })
  .then(() => page.evaluate((id) => sap.ui.require("sap/ui/core/Element").getElementById(id)._pPageVariant, filterId));
const waitLoaded = (ptId, min = 1) => page.waitForFunction(({ id, min }) => {
  const E = sap.ui.require("sap/ui/core/Element"); const pt = E.getElementById(id); return pt && pt.getRows && pt.getRows().length >= min;
}, { id: ptId, min }, { timeout: 60000 });
const waitRendered = (tableId, min = 1) => page.waitForFunction(({ id, min }) => {
  const E = sap.ui.require("sap/ui/core/Element"); const t = E.getElementById(id); const inner = t && t._oTable; if (!inner) return false;
  const n = inner.getItems ? inner.getItems().length : inner.getRows().filter((r) => r.getBindingContext("buffer")).length; return n >= min;
}, { id: tableId, min }, { timeout: 60000 });
const waitBindingLength = (tableId, n) => page.waitForFunction(({ id, n }) => {
  const t = sap.ui.require("sap/ui/core/Element").getElementById(id); const b = t.getRowBinding(); return b && b.getLength() === n;
}, { id: tableId, n }, { timeout: 15000 }).then(() => true).catch(() => false);
const bindingLength = (tableId) => ui5((byId, id) => byId(id).getRowBinding().getLength(), tableId);
// 화면 이동: 라우팅으로 뷰가 생기고 → 표가 스키마를 읽어 필터·표를 만든 뒤 → 행이 들어올 때까지 기다린다
const go = async (key) => { await page.evaluate((k) => { location.hash = "#/" + k; }, key); await waitEl(pfx(key) + "table"); await waitLoaded(pfx(key) + "table", 1); await waitEl(pfx(key) + "filter--filterbar"); await waitVariant(pfx(key) + "filter"); };

await page.goto(`${BASE}/perfect-table/webapp/${PAGE}`, { waitUntil: "load" });
await waitView();
await page.screenshot({ path: path.join(OUT, "00-home.png") });

// 0. 홈 타일 → 화면 이동 (라우팅)
await page.click(".sapMGT:has-text('OData V4 (온전)')");
await waitEl(pfx("v4") + "table");
check("홈 타일 → 화면 이동", (await page.evaluate(() => location.hash)) === "#/v4", await page.evaluate(() => location.hash));

// 0-1. 라이브러리: 이름·로드 경로(소스/빌드)·컨트롤 클래스·한국어 문구
await waitLoaded(pfx("v4") + "table", 1);
const libInfo = await page.evaluate(() => {
  const Lib = sap.ui.require("sap/ui/core/Lib"), E = sap.ui.require("sap/ui/core/Element");
  const lib = Lib.all()["starj.ui5.table"];
  const preload = performance.getEntriesByType("resource").some((r) => r.name.endsWith("/starj/ui5/table/library-preload.js"));
  return { loaded: !!lib, version: lib && lib.version, preload, table: E.getElementById("container-app---v4--table").getMetadata().getName(),
    filter: E.getElementById("container-app---v4--filter").getMetadata().getName(), addText: E.getElementById("container-app---v4--table--table--btnAdd").getText() };
});
check(`라이브러리 starj.ui5.table (${IS_DIST ? "빌드 결과" : "소스"})`, libInfo.loaded && libInfo.preload === IS_DIST && libInfo.table === "starj.ui5.table.Table" && libInfo.filter === "starj.ui5.table.FilterBar" && libInfo.addText === "행 추가", JSON.stringify(libInfo));

const TABS = ["json", "v2", "v4", "legacyV2", "legacyV4"].map((key) => ({ key, pt: pfx(key) + "table" }));

// 1. 다섯 소스 모두 300행 로드 + 스키마 (라벨·타입·쓰기 가능 여부·액션)
for (const t of TABS) {
  await go(t.key);
  await waitLoaded(t.pt, 300);
  await waitRendered(t.pt + "--table");
  const info = await ui5((byId, id) => {
    const pt = byId(id), s = pt.getSchema();
    const p = (k) => s.properties.find((x) => x.key === k);
    return { rows: pt.getRows().length, props: s.properties.length, cols: pt.getTable().getColumns().length, odata: s.odataVersion, cap: s.capabilities,
      actions: s.actions.map((a) => a.name), labels: ["ProductID", "Price", "ReleaseDate"].map((k) => p(k).label), types: s.properties.map((x) => x.key + ":" + x.type).join(","), sample: pt.getRows()[0] };
  }, t.pt);
  check(`${t.key} 로드`, info.rows === 300, `rows=${info.rows} props=${info.props} cols=${info.cols} odata=${info.odata} cap=${JSON.stringify(info.cap)} actions=${info.actions}`);
  check(`${t.key} 라벨 (ProductID/Price/ReleaseDate)`, info.labels.join() === "제품 ID,단가,출시일", info.labels.join());
  const layout = await ui5((byId, key) => { const E = (id) => byId(id); const fb = E(key + "filter--filterbar"), vm = E(key + "filter--variant"), pg = E(key + "page");
    return { page: pg && pg.getMetadata().getName(), fb: !!fb, fbItems: fb && fb.getFilterItems().length, vm: vm && vm.getMetadata().getName(), filterAssoc: E(key + "table--table").getFilter() === (fb && fb.getId()) }; }, pfx(t.key));
  check(`${t.key} DynamicPage + FilterBar 연결`, layout.page === "sap.f.DynamicPage" && layout.fb && layout.fbItems > 0 && layout.vm === "sap.ui.comp.smartvariants.SmartVariantManagement" && layout.filterAssoc, JSON.stringify(layout));
  console.log(`      types=${info.types}\n      sample=${JSON.stringify(info.sample)}`);
  await page.screenshot({ path: path.join(OUT, `01-${t.key}.png`) });
}

// 2. JSON 탭: 필터 Category=Laptop
await go("json");
const PT = pfx("json") + "table", TBL = PT + "--table", FB = pfx("json") + "filter--filterbar", VM = pfx("json") + "filter--variant";
const expectedLaptop = await ui5((byId, id) => byId(id).getRows().filter((r) => r.Category === "Laptop").length, PT);
await applyState(FB, { filter: { Category: [{ operator: "EQ", values: ["Laptop"] }] } });
await waitBindingLength(TBL, expectedLaptop);
check("JSON 필터 Category=Laptop", await bindingLength(TBL) === expectedLaptop, `binding=${await bindingLength(TBL)} expected=${expectedLaptop}`);
await page.screenshot({ path: path.join(OUT, "02-filter.png") });

// 3. 숫자 필터 (Price > 1000) + 정렬
const expectedPrice = await ui5((byId, id) => byId(id).getRows().filter((r) => r.Category === "Laptop" && Number(r.Price) > 1000).length, PT);
await applyState(FB, { filter: { Price: [{ operator: "GT", values: ["1000"] }] } });
await waitBindingLength(TBL, expectedPrice);
check("JSON 숫자 필터 Price>1000 (Laptop)", await bindingLength(TBL) === expectedPrice, `binding=${await bindingLength(TBL)} expected=${expectedPrice}`);
await applyState(TBL, { sorters: [{ name: "Price", descending: true }] });
await page.waitForTimeout(1200);
const sorted = await ui5((byId, id) => byId(id).getRowBinding().getContexts(0, 3).map((x) => x.getObject().Price), TBL);
check("JSON 정렬 Price desc (숫자 비교)", Number(sorted[0]) >= Number(sorted[1]) && Number(sorted[1]) >= Number(sorted[2]), `top3=${sorted}`);
await page.screenshot({ path: path.join(OUT, "03-sort.png") });

// 4. 컬럼 개인화 (Supplier 숨김) → 페이지 변형 "다른 이름으로 저장" → LocalStorage 또는 S/4HANA LREP → 재접속 후 유지
const colsBefore = await ui5((byId, id) => byId(id).getColumns().length, TBL);
await applyState(TBL, { items: [{ name: "Supplier", visible: false }] });
await page.waitForTimeout(1200);
const colsAfter = await ui5((byId, id) => byId(id).getColumns().length, TBL);
check("컬럼 개인화 Supplier 숨김", colsAfter === colsBefore - 1, `before=${colsBefore} after=${colsAfter}`);
const modified = await ui5((byId, vm) => byId(vm).currentVariantGetModified(), VM);
check("개인화 → 변형 수정 표시(*)", modified === true);
const VARIANT_NAME = IS_LREP ? `PoC 변형 ${Date.now() % 100000}` : "PoC 변형";
const lrepWrites = [];
page.on("response", (r) => { if (r.url().includes("/sap/bc/lrep/") && r.request().method() === "POST") lrepWrites.push(`${r.status()} ${new URL(r.url()).pathname}`); });
await page.click(`#${VM}-vm-trigger`);
await page.click(`#${VM}-vm-saveas`);
await page.waitForSelector(".sapMDialog input", { timeout: 10000 });
await page.fill(".sapMDialog input >> nth=0", VARIANT_NAME);
await page.click(".sapMDialog button:has-text('저장')");
await page.waitForTimeout(1500);
if (IS_LREP) {
  check("페이지 변형 저장 → S/4HANA LREP POST /variants", lrepWrites.some((w) => w.startsWith("200 /sap/bc/lrep/variants")), lrepWrites.join(", "));
} else {
  const flKeys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("sap.ui.fl")));
  check("페이지 변형 저장 → sap.ui.fl LocalStorage", flKeys.length > 0, `keys=${flKeys.length} ${flKeys.slice(0, 3).join(",")}`);
}
await page.screenshot({ path: path.join(OUT, "04-variant-saved.png") });

await page.reload({ waitUntil: "load" });   // 해시 #/json 유지 → 같은 화면
await waitEl(PT); await waitLoaded(PT, 300); await waitRendered(TBL); await waitVariant(pfx("json") + "filter");
await page.waitForTimeout(2000);
// 기본값으로 저장하지 않았으니 재접속 직후는 표준뷰다. 목록에서 저장한 변형을 고르면 컬럼 상태가 돌아와야 한다
const titleBefore = await ui5((byId, vm) => document.getElementById(vm).textContent.trim().slice(0, 40), VM);
await page.click(`#${VM}-vm-trigger`);
await page.waitForSelector(".sapMPopover", { timeout: 10000 });
const listed = await page.locator(`.sapMPopover li:has-text('${VARIANT_NAME}')`).count();
check("재접속 후 Variant 목록에 저장한 변형이 있음", listed > 0, `before="${titleBefore}" listed=${listed}`);
if (listed) { await page.click(`.sapMPopover li:has-text('${VARIANT_NAME}')`); await page.waitForTimeout(2000); }
const after = await ui5((byId, tbl, vm) => ({ cols: byId(tbl).getColumns().map((c) => c.getPropertyKey()), title: document.getElementById(vm).textContent.trim().slice(0, 40) }), TBL, VM);
check("변형 선택 → Supplier 숨김 복원", !after.cols.includes("Supplier") && after.title.includes(VARIANT_NAME), `cols=${after.cols.length} title="${after.title}"`);
await page.screenshot({ path: path.join(OUT, "05-after-reload.png") });

// 4-1. 표 설정(톱니바퀴) 대화상자가 열린다 (필터 탭이 필드를 못 만들면 대화상자 전체가 안 열린다)
const errBefore = consoleErrors.length;
await page.click(`#${TBL}-settings`);
const gearOpened = await page.waitForSelector(".sapMDialog .sapMITBHead", { timeout: 15000 }).then(() => true).catch(() => false);
check("표 설정(톱니바퀴) 대화상자 열림", gearOpened && consoleErrors.length === errBefore, consoleErrors.slice(errBefore).join(" | ").slice(0, 200));
await page.screenshot({ path: path.join(OUT, "05-1-table-settings.png") });
await page.keyboard.press("Escape");
await page.waitForSelector(".sapMDialog", { state: "detached", timeout: 10000 }).catch(() => {});

// 5. 붙여넣기 → 신규 행(C) + 타입 파싱
await applyState(FB, { filter: { Category: [{ operator: "EQ", values: ["Laptop"], filtered: false }], Price: [{ operator: "GT", values: ["1000"], filtered: false }] } });
await page.waitForTimeout(800);
const colOrder = await ui5((byId, id) => byId(id).getColumns().map((c) => c.getPropertyKey()), TBL);
console.log("      visible column order:", colOrder.join(","));
const values = { ProductID: "P99901", Name: "Pasted Laptop", Category: "Laptop", Supplier: "X", Price: "1,234.50", Currency: "USD", Quantity: "7", Unit: "EA", ReleaseDate: "2026-01-02", Active: "Yes" };
const pasteRow = colOrder.filter((k) => k !== "__state").map((k) => values[k] ?? "");
await ui5((byId, id, row) => byId(id).firePaste({ data: [row] }), TBL, pasteRow);
await page.waitForTimeout(800);
const pasted = await ui5((byId, id) => byId(id).getRows()[0], PT);
check("붙여넣기 → 신규 행", pasted.__state === "C" && pasted.ProductID === "P99901", JSON.stringify(pasted));
check("붙여넣기 타입 파싱", (pasted.Price === "1234.5" || pasted.Price === "1234.50") && pasted.Quantity === 7 && pasted.ReleaseDate === "2026-01-02" && pasted.Active === true, `Price=${pasted.Price} Quantity=${pasted.Quantity} ReleaseDate=${pasted.ReleaseDate} Active=${pasted.Active}`);
check("붙여넣기 후 편집 모드", await ui5((byId, id) => byId(id).getEditable(), PT));
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, "06-paste-edit.png") });

// 6. 셀 편집 (mdc Field 안 Input 타이핑) → 상태 U. 키 필드는 기존 행에서 잠겨야 한다
const cellInfo = await ui5((byId, id) => {
  const inner = byId(id)._oTable; const item = inner.getItems()[1];
  const cells = item.getCells().filter((c) => c.isA("sap.ui.mdc.Field"));
  const name = cells.find((c) => c.getBindingPath("value") === "Name");
  const key = cells.find((c) => c.getBindingPath("value") === "ProductID");
  const content = name && name.getCurrentContent()[0];
  return { inputId: content && content.getId(), inputType: content && content.getMetadata().getName(), keyMode: key && key.getEditMode(), nameMode: name && name.getEditMode() };
}, TBL);
check("편집 모드 셀: Name 은 Editable, 키는 Display", cellInfo.nameMode === "Editable" && cellInfo.keyMode === "Display", JSON.stringify(cellInfo));
if (cellInfo.inputId) {
  await page.fill(`#${cellInfo.inputId}-inner`, "Edited Name");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(600);
  const edited = await ui5((byId, id) => byId(id)._oTable.getItems()[1].getBindingContext("buffer").getObject(), TBL);
  check("셀 편집 → 상태 U", edited.__state === "U" && edited.Name === "Edited Name", `${edited.ProductID} ${edited.Name} state=${edited.__state}`);
} else { check("셀 편집 → 상태 U", false, "Input 을 못 찾음"); }

// 7. 복사 (CopyProvider) — 행 선택 뒤 클립보드 데이터
await ui5((byId, id) => { const inner = byId(id)._oTable; inner.setSelectedItem(inner.getItems()[2], true); }, TBL);
await page.waitForTimeout(300);
const copyData = await ui5((byId, id) => { const cp = byId(id).getCopyProvider(); return cp.getSelectionData(); }, TBL);
check("CopyProvider 선택 데이터", Array.isArray(copyData) && copyData.length === 1 && copyData[0].length >= 9, JSON.stringify(copyData && copyData[0]));

// 8. 삭제 표시 (선택 행) + 변경 묶음 + 저장 대화상자 (더미 writer)
await page.click(`#${TBL}--btnDelete`);
await page.waitForTimeout(500);
const changes = await ui5((byId, id) => byId(id).getChanges(), PT);
check("삭제 표시 + 변경 묶음 C/U/D", changes.created.length === 1 && changes.updated.length === 1 && changes.deleted.length === 1, `C=${changes.created.length} U=${changes.updated.length} D=${changes.deleted.length}`);
const delMode = await ui5((byId, id) => { const item = byId(id)._oTable.getItems()[2]; const f = item.getCells().find((c) => c.isA("sap.ui.mdc.Field")); return { state: item.getBindingContext("buffer").getObject().__state, mode: f.getEditMode() }; }, TBL);
check("삭제 표시 행은 잠김", delMode.state === "D" && delMode.mode === "Display", JSON.stringify(delMode));
await page.click(`#${TBL}--btnSave`);
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, "07-save-dialog.png") });
check("저장 버튼 → 변경 내역 대화상자", await page.locator(".sapMMessageBox").count() > 0);
await page.keyboard.press("Escape");

// 9. 엑셀 내보내기 (다운로드 발생)
const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }).catch(() => null), page.click(`#${TBL}-export`)]);
if (download) {
  const f = path.join(OUT, download.suggestedFilename()); await download.saveAs(f);
  check("엑셀 내보내기", f.endsWith(".xlsx") && fs.statSync(f).size > 1000, `${download.suggestedFilename()} ${fs.statSync(f).size}B`);
} else { check("엑셀 내보내기", false, "다운로드 이벤트 없음"); }

// 10. 반쪽 OData V2: 서버가 $filter 를 무시해도 버퍼가 거른다
await go("legacyV2");
const LPT = pfx("legacyV2") + "table", LTBL = LPT + "--table", LFB = pfx("legacyV2") + "filter--filterbar";
const expLegacy = await ui5((byId, id) => byId(id).getRows().filter((r) => r.Category === "Monitor").length, LPT);
await applyState(LFB, { filter: { Category: [{ operator: "EQ", values: ["Monitor"] }] } });
await waitBindingLength(LTBL, expLegacy);
check("반쪽 V2 클라이언트 필터 Category=Monitor", await bindingLength(LTBL) === expLegacy, `binding=${await bindingLength(LTBL)} expected=${expLegacy}`);
await page.screenshot({ path: path.join(OUT, "08-legacy-v2-filter.png") });

// 11. 반쪽 V4 (GridTable) 도 같은 식으로
await go("legacyV4");
const GPT = pfx("legacyV4") + "table", GTBL = GPT + "--table", GFB = pfx("legacyV4") + "filter--filterbar";
await applyState(GFB, { filter: { Active: [{ operator: "EQ", values: [true] }] } });
const expActive = await ui5((byId, id) => byId(id).getRows().filter((r) => r.Active === true).length, GPT);
await waitBindingLength(GTBL, expActive);
check("반쪽 V4 GridTable 필터 Active=true", await bindingLength(GTBL) === expActive, `binding=${await bindingLength(GTBL)} expected=${expActive}`);
await page.waitForTimeout(1000);   // 화면 전환 애니메이션이 끝난 뒤 찍는다
await page.screenshot({ path: path.join(OUT, "09-legacy-v4-grid.png") });

const realErrors = consoleErrors.filter((e) => !/favicon|Failed to load resource/.test(e));
check("콘솔 오류 없음 (리소스 404 제외)", realErrors.length === 0, realErrors.slice(0, 5).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
