using { pt } from '../db/schema';

/** 온전한 OData. V4 는 /odata/v4/catalog, V2 는 어댑터가 /odata/v2/catalog 로 같이 연다 */
service CatalogService @(path: '/odata/v4/catalog') {
  entity Products as projection on pt.Products;
}
