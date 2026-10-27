# PoC 0 결과 — 버퍼 모드 하나로 네 소스를 받는다 (2026-10-27)

## 결론

| 질문 | 답 |
|---|---|
| mdc 위에 "소스 무관" 필터+표 컨트롤을 만들 수 있나 | **된다.** UI5 1.136.10 공개 API 만으로 JSON·V2·V4·반쪽 OData 네 소스를 같은 컨트롤로 띄웠다 |
| 새로 만든 코드의 양 | delegate 2개(각 100행 안팎), 스키마 변환기, EDMX 파서, 버퍼 리더, 조립 컨트롤. 기능 자체는 전부 표준 부품이다 |
| 검증 | 헤드리스(playwright) 30개 항목 전부 통과. 스크린샷은 `test/headless/out/` |

## 무엇이 되는지 (전부 `[화면]` 등급, 헤드리스 렌더링으로 확인)

| 기능 | 표준 부품 | 결과 |
|---|---|---|
| 로드 | `BufferReader` 가 전부 읽어 `JSONModel` 에 넣음 | 네 소스 모두 300행. V4 는 `@odata.nextLink`, V2 는 `__next` 를 따라감 |
| 메타데이터 → 스키마 | `EdmxSchemaProvider` | V2·V4 `$metadata` 에서 라벨·타입·키·쓰기 가능 여부·액션 목록을 읽음. 반쪽 V4 는 `Capabilities` 로 "표준 쓰기 불가 · 액션 saveProducts/getProducts" 가 자동 판정됨 |
| 필터 바 | `sap.ui.mdc.FilterBar` + 자체 delegate | 문자열·숫자·날짜·Boolean 조건, 기본 검색(문자열 전체 Contains) |
| 필터·정렬 | `ListBinding.filter/sort` (클라이언트) | Decimal 이 문자열이라 숫자 비교 함수를 Filter·Sorter 에 붙여 해결 |
| 컬럼 선택·정렬·그룹 개인화 | `mdc.Table p13nMode` | 컬럼 숨김이 즉시 반영 |
| Variant | `sap.ui.fl.variants.VariantManagement` + `LocalStorageConnector` | "다른 이름으로 저장" → 재접속 → 목록에서 선택 → 컬럼 상태 복원 |
| 복사 | `sap.m.plugins.CellSelector` + `CopyProvider` | 선택 행의 2차원 배열 (표시 형식 그대로) |
| 붙여넣기 | `mdc.Table paste` 이벤트 | 보이는 컬럼 순서로 칸을 맞춰 신규 행(C) 생성, 타입별 파싱(`1,234.50`→`1234.5`, `Yes`→`true`) |
| 셀 편집 | `sap.ui.mdc.Field` 의 `editMode` 바인딩 | 템플릿 교체 없이 보기/편집 전환. 키 필드는 신규 행에서만 열림, 삭제 표시 행은 잠김. 수정하면 상태 U |
| 변경 묶음 | `ChangeTracker` | C/U/D 묶음과 RFC 식 `RowState` 배열을 동시에 만듦. PoC 0 은 대화상자로 보여 주는 더미 writer |
| 엑셀 내보내기 | `mdc.Table enableExport` (`sap.ui.export`) | JSON 바인딩에서도 `.xlsx` 가 내려옴 (20KB) |
| 표 유형 | `ResponsiveTableType` / `GridTableType` | 둘 다 같은 delegate 로 동작 |

## 설계 결정

1. **값 표현은 OData V4 JSON 을 기준으로 통일한다.** Decimal·Int64 는 문자열, Date 는 `yyyy-MM-dd`, DateTimeOffset 은 ISO. V2 의 `/Date(ms)/` 와 CAP V4 의 숫자형 Decimal 은 리더가 바꾼다. 타입은 전부 `sap.ui.model.odata.type.*` 이고 TypeMap 은 `sap/ui/mdc/odata/v4/TypeMap` 하나다.
2. **읽기와 쓰기를 가른다.** PoC 0 은 읽기 = 버퍼 모드만 구현했다. 쓰기는 `getChanges()`(C/U/D 묶음)와 `getActionRows()`(RowState 배열) 두 모양을 다 내놓으므로, PoC 1 에서 V4 batch · V2 submitChanges · 액션 호출 · REST 를 writer 로 끼우면 된다.
3. **셀은 `mdc.Field` 하나.** 보기/편집 전환은 `$pt>/editMode` 모델 값으로만 한다. 템플릿 교체 + rebind 는 ResponsiveTable 에서 셀이 안 바뀌어 버렸다.
4. **delegate 는 정적 모듈이라 `Registry` 로 인스턴스 상태를 찾는다.** 컨트롤 ID → 스키마·PropertyInfo.

## 걸린 함정 (다음에 반복하지 않도록)

| 증상 | 원인 | 해결 |
|---|---|---|
| `i.type.isA is not a function` 로 표가 빈다 | `mdc.Field` 의 `value` 바인딩에 타입 **이름 문자열**을 줬다. XML 뷰는 프로세서가 인스턴스로 바꿔 주지만 JS 에서는 안 된다 | `TypeMap.getDataTypeInstance(...)` 로 인스턴스를 만들어 넣는다 |
| `[FUTURE FATAL] DataType ... module not loaded` | 타입 클래스가 아직 로드되지 않은 채 인스턴스를 만들었다 | 스키마 확정 직후 `TypeMap.retrieveDataTypeClasses(이름 목록)` 을 `await` 한다 |
| `PropertyInfoValidator: missing mandatory property 'dataTypeFormatOptions'` | `FilterField` 에 `dataTypeConstraints/FormatOptions` 를 `undefined` 로 줬다 | 빈 객체 `{}` 라도 준다 |
| V2 에서 라벨이 속성 이름으로 나온다 | cov2ap(그리고 SAP Gateway)는 V2 문서 안에 V4 식 `<Annotations Target=...><Annotation Term="Common.Label">` 로 싣는다. `sap:label` 만 보면 놓친다 | `sap:label` → 없으면 V4 식 Annotations 순으로 본다 |
| 편집 전환이 안 보인다 | `Column.setTemplate` 로 바꿔도 ResponsiveTable 의 기존 아이템 셀은 그대로다 | `mdc.Field` + `editMode` 바인딩 |
| Variant 를 저장했는데 재접속하면 표준뷰 | 저장 때 "기본값" 을 켜지 않으면 표준뷰가 뜨는 게 정상이다 | 목록에서 고르면 복원된다. 테스트도 그 흐름으로 바꿨다 |
| `sap.ui.fl` 이 `changes/flexibility-bundle.json` 404 | 빌드하지 않은 앱이라 번들이 없다 | 빈 번들 파일을 둔다 (빌드하면 자동 생성) |
| `Component-preload.js`·`library-preload.js` 404 | 빌드 없는 로컬 실행 | `data-sap-ui-xx-componentPreload="off"`, `data-sap-ui-xx-libraryPreloadFiles="mdpert.perfecttable:none"` |
| CopyProvider 가 빈 배열 | 삭제 뒤 `clearSelection()` 한 상태에서 호출했다 | 테스트 순서 문제. 플러그인은 정상 |

## 재사용 모습 (2026-10-27 분리)

처음엔 Variant + FilterBar + Table 을 한 컨트롤(PerfectTable)에 묶었다. 화면마다 틀이 다를 수 있으니(필터 없는 표, 표 둘에 필터 하나, DynamicPage 헤더에 필터) **PerfectFilter 와 PerfectTable 로 갈랐다.**

| 컨트롤 | 아는 것 | 모르는 것 | 공개 API |
|---|---|---|---|
| `PerfectTable` | 소스(kind/url/entitySet 또는 source 객체), 스키마, 버퍼, 변경 추적, 툴바 액션 | 필터 UI | `filter` 연관, `loaded`·`save` 이벤트, `getRows/getChanges/getActionRows/getSchema`, `reload()` |
| `PerfectFilter` | 필터 필드·기본 검색·Variant | 소스. 표가 `connect(ctx, tableId)` 로 스키마를 넘겨 줘야 필드가 생긴다 | `showVariant/showSearch/showGoButton/liveMode`, `search` 이벤트, `getFilterBar()` |

연결은 한 줄이다: `<pt:PerfectTable filter="filter" .../>`. 표가 `$metadata` 를 읽어 스키마를 확정하면 필터를 만들고, mdc Table 의 `filter` 연관과 VariantManagement 의 `for` 를 함께 건다. 그래서 **같은 필터 바가 JSON 화면에서는 손으로 준 스키마로, V2·V4 화면에서는 `$metadata` 로** 채워진다.

화면 5개가 서로 다른 것은 `PerfectTable` 의 XML 속성뿐이다.

| 화면 | 다른 것 | 컨트롤러 고유 코드 |
|---|---|---|
| JSON | `kind="json" url="/rest/catalog/Products"` | `setJsonSchema({...})` (메타데이터가 없으니) |
| V2 온전 | `kind="v2" url="/odata/v2/catalog" entitySet="Products" hide="..."` | 없음 (Base 상속) |
| V4 온전 | `kind="v4" url="/odata/v4/catalog" ...` | 없음 |
| 반쪽 V2 | `kind="v2" url="/odata/v2/legacy" entitySet="ProductList"` | `onSave` 가 `actionRows`(RowState 배열)를 보여 줌 |
| 반쪽 V4 | 위 + `tableType="GridTable"` | 반쪽 V2 상속 |

헤드리스 검증은 36개 항목(홈 타일 이동 1 + 화면별 DynamicPage·필터 연결 5 추가)이다.

## 남은 것 (PoC 1 후보)

1. **writer 4종**: V4 `$batch`(PATCH/POST/DELETE), V2 `submitChanges`, 반쪽 OData 액션 호출(`saveProducts` 에 RowState 배열), REST. 반쪽 V2 는 V2 function import 가 복합 타입 배열을 받는지 cov2ap 에서 먼저 확인한다.
2. **서버 모드**: 온전한 V4·V2 를 바인딩 직결(서버 필터·페이징)로 읽는 두 번째 읽기 경로. SAP V4 delegate 를 감싸면 된다.
3. **Boolean 셀**: `mdc.Field` 가 편집 모드에서 Input 으로 그린다. FE 처럼 CheckBox 로 바꾸는 content 설정이 필요하다.
4. **ResponsiveTable 팝인**: 컬럼이 11개를 넘으면 `상태` 컬럼이 아래 줄로 내려간다(온전한 V2·V4 화면에서 보임). `importance`·최소 폭 조정.
10. **Variant 위치**: 지금은 PerfectFilter 가 DynamicPage 헤더 안에 Variant 를 그린다. Fiori 표준처럼 DynamicPageTitle 의 heading 으로 올리는 옵션.
11. **표 하나에 필터 없이, 또는 필터 하나에 표 둘**: 구조상 되지만 아직 화면으로 확인하지 않았다.
5. **값 도움말**: `mdc.ValueHelp` + 버퍼 delegate (고정값 목록부터).
6. **엑셀 가져오기**: SheetJS 로 파싱 → 붙여넣기 경로로 합류.
7. **Variant 를 LREP 로**: ABAP BSP 로 배포하고 `flexibilityServices` 를 떼면 서버 USER 레이어에 저장되는지. FLP 에서 확인.
8. **라이브러리 빌드**: ui5-tooling `library.js` 빌드, 앱 `manifest.json` 의존성, BSP 배포.
9. **대량 데이터**: 버퍼 모드는 클라이언트 처리라 수만 행이면 느리다. 상한을 재고, 넘으면 서버 모드나 RFC 조건으로 유도한다.
