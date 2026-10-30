# ui5-perfect-table — PoC

`sap.ui.mdc` 위에 얹는 **필터 바 + 표 조립 라이브러리**의 개념 검증입니다. 데이터 소스가 JSON 이든, OData V2·V4 든, RFC 를 서비스 바인딩으로 감싼 반쪽짜리 OData 든 **같은 컨트롤 하나**로 개인화·Variant·필터·정렬·복사·붙여넣기·엑셀 내보내기·편집 추적을 쓰는 것이 목표입니다.

백엔드는 S/4HANA 가 아니라 **CAP(Node.js)** 으로 네 가지 소스를 직접 흉내 냈습니다. 결과와 결정은 [docs/poc-0-결과.md](docs/poc-0-결과.md) 에 있습니다.

## 실행

```bash
npm install
npm start                      # http://localhost:4104
open http://localhost:4104/perfect-table/webapp/index.html   # 타일 홈 → 화면 5개 (#/json, #/v2, #/v4, #/legacyV2, #/legacyV4)
npm run test:headless          # 서버가 떠 있어야 한다. 스크린샷은 test/headless/out/
```

### Variant 를 S/4HANA LREP 에 저장하기

```bash
npm run start:s4               # SAP_ENV_FILE(기본 ../../rap-guideline-docs/.env)의 SAP_URL·SAP_USER·SAP_PASSWORD·SAP_CLIENT 로 /sap/bc/lrep 를 프록시
open http://localhost:4104/perfect-table/webapp/index-s4.html#/json
node test/headless/smoke.mjs http://localhost:4104 index-s4.html
```

`index.html` 은 LocalStorageConnector(브라우저 저장), `index-s4.html` 은 LrepConnector(S/4HANA 저장)다. 다른 것은 없다.
LREP 는 인증 없는 요청에 HTML 로그온 페이지를 돌려주므로 프록시가 `.env` 계정으로 Basic 인증을 붙인다. 그래서 변형은 그 계정의 USER 레이어에 쌓이고, 프록시는 이 PC(loopback)에서 온 요청만 받는다.
ABAP BSP 로 배포해 FLP 에서 띄우면 프록시 없이 로그온 사용자 이름으로 저장된다.

UI5 는 CDN(1.136.10) 에서 받습니다. 처음 접속은 몇 초 걸립니다.

## 구조

```
db/            schema.cds, data/pt-Products.csv (300행, gen-products.js 로 재생성)
srv/           catalog-service   온전한 OData  → /odata/v4/catalog, /odata/v2/catalog (cov2ap)
               legacy-service    반쪽 OData    → /odata/v4/legacy,  /odata/v2/legacy  ($filter 무시, 저장은 액션뿐)
               rest-service      순수 JSON     → /rest/catalog/Products
lib/mdpert/perfecttable/
               PerfectFilter.js              필터 바 컨트롤 (mdc FilterBar + 페이지 변형). 소스를 모르고, 표가 넘기는 스키마로 필드를 만든다
               PerfectTable.js               표 컨트롤 (mdc Table + 툴바 액션 + 버퍼·변경 추적). XML 속성 kind/url/entitySet 로 소스를 받는다
               schema/Schema.js              중립 스키마 → mdc PropertyInfo, 타입 매핑
               schema/EdmxSchemaProvider.js  V2·V4 $metadata → 중립 스키마 (라벨·키·쓰기 가능 여부·액션)
               data/BufferReader.js          전부 읽어 버퍼(JSONModel)에 넣기, 값 표현 통일
               data/ChangeTracker.js         행 상태(C/U/D)와 변경 묶음
               delegate/BufferTableDelegate.js, BufferFilterBarDelegate.js, Registry.js
app/perfect-table/webapp/   PoC 앱. 타일 홈(Home) + 화면 5개(Json · V2 · V4 · LegacyV2 · LegacyV4), 화면마다 View+Controller 한 쌍
                            모든 화면은 DynamicPage > (header) PerfectFilter + (content) PerfectTable. 공통 코드는 controller/Base.controller.js
test/headless/ smoke.mjs (playwright, 36개 항목), diag.mjs (콘솔 오류 수집)
```

## 화면 한 장에 필요한 것

```xml
<f:DynamicPage>
  <f:header><f:DynamicPageHeader><pt:PerfectFilter id="filter"/></f:DynamicPageHeader></f:header>
  <f:content>
    <pt:PerfectTable id="table" filter="filter" kind="v2" url="/odata/v2/catalog" entitySet="Products"
                     hide="ID,createdAt,createdBy,modifiedAt,modifiedBy" save=".onSave"/>
  </f:content>
</f:DynamicPage>
```

온전한 V2·V4 화면의 컨트롤러는 Base 를 상속할 뿐 고유 코드가 없다. JSON 화면만 스키마를 `setJsonSchema()` 로 주고, 반쪽 OData 화면만 `onSave` 를 액션 payload(`actionRows`)로 바꾼다.

## 소스 설정 예 (JS 로 줄 때)

```js
{ kind: "json", url: "/rest/catalog/Products", schema: { properties: [ { key: "ProductID", type: "String", isKey: true, filterDefault: true }, ... ] } }
{ kind: "v2", serviceUrl: "/odata/v2/catalog", entitySet: "Products", hide: ["ID", "createdAt"] }
{ kind: "v4", serviceUrl: "/odata/v4/legacy",  entitySet: "ProductList", writer: { kind: "action", name: "saveProducts" } }
```
