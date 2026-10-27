using { pt } from '../db/schema';

/** 순수 JSON. 메타데이터 없이 /rest/catalog/Products 로 배열만 준다 */
@protocol: 'rest'
service RestService @(path: '/rest/catalog') {
  entity Products as projection on pt.Products;
}
