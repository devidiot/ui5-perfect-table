namespace pt;

using { cuid, managed } from '@sap/cds/common';

/** 온전한 OData(V4·V2)와 JSON REST 가 공유하는 실엔티티 */
entity Products : cuid, managed {
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
