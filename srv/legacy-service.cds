/**
 * 반쪽짜리 OData 흉내. RFC 를 서비스 바인딩으로 감싼 서비스처럼
 *  - 엔티티는 조회 전용이고 키는 행 번호(가짜)다
 *  - 서버는 $filter·$orderby·$top 을 무시하고 전부 돌려준다 (핸들러가 그대로 반환)
 *  - 저장은 POST/PATCH/DELETE 가 아니라 액션 saveProducts 한 개로만 된다
 * V4 는 /odata/v4/legacy, V2 는 어댑터가 /odata/v2/legacy 로 같이 연다
 */
service LegacyService @(path: '/odata/v4/legacy') {

  @readonly
  @cds.persistence.skip
  entity ProductList {
    key RowNo       : Integer     @title: '행번호';
        ProductID   : String(10)  @title: '제품 ID';
        Name        : String(60)  @title: '제품명';
        Category    : String(30)  @title: '분류';
        Supplier    : String(40)  @title: '공급업체';
        Price       : Decimal(13, 2) @title: '단가';
        Currency    : String(3)   @title: '통화';
        Quantity    : Integer     @title: '수량';
        Unit        : String(3)   @title: '단위';
        ReleaseDate : Date        @title: '출시일';
        Active      : Boolean     @title: '사용';
  }

  type ProductRow {
    RowState    : String(1);   // '' | 'C' | 'U' | 'D'
    ProductID   : String(10);
    Name        : String(60);
    Category    : String(30);
    Supplier    : String(40);
    Price       : Decimal(13, 2);
    Currency    : String(3);
    Quantity    : Integer;
    Unit        : String(3);
    ReleaseDate : Date;
    Active      : Boolean;
  }

  type SaveResult {
    Type    : String(1);
    Message : String(220);
    Count   : Integer;
  }

  /** RFC 식 저장: 바뀐 행 묶음을 받아 한 번에 반영 */
  action saveProducts(Rows : many ProductRow) returns SaveResult;

  /** RFC 식 조회: 파라미터로 받는 function */
  function getProducts(Category : String) returns many ProductList;
}
