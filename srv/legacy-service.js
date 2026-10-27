const cds = require('@sap/cds');

/** Products 행을 RFC 결과 구조(행번호 키)로 바꾼다 */
function toRows(products) {
  return products.map((p, i) => ({
    RowNo: i + 1,
    ProductID: p.ProductID, Name: p.Name, Category: p.Category, Supplier: p.Supplier,
    Price: p.Price, Currency: p.Currency, Quantity: p.Quantity, Unit: p.Unit,
    ReleaseDate: p.ReleaseDate, Active: p.Active
  }));
}

module.exports = cds.service.impl(async function () {
  const { Products } = cds.entities('pt');

  // 서버는 $filter·$orderby·$top·$skip 을 무시한다. RFC 래핑 서비스와 같은 동작이다.
  this.on('READ', 'ProductList', async (req) => {
    const q = req.query.SELECT;
    const ignored = ['where', 'orderBy', 'limit'].filter((k) => q[k]);
    if (ignored.length) console.log('[legacy] ignoring query options:', ignored.join(','));
    const products = await SELECT.from(Products).orderBy('ProductID');
    const rows = toRows(products);
    // $count 요청도 전체 건수로 답한다 (서버가 조건을 모르니 당연하다)
    rows.$count = rows.length;
    return rows;
  });

  this.on('getProducts', async (req) => {
    const { Category } = req.data;
    const products = Category
      ? await SELECT.from(Products).where({ Category }).orderBy('ProductID')
      : await SELECT.from(Products).orderBy('ProductID');
    return toRows(products);
  });

  this.on('saveProducts', async (req) => {
    const rows = req.data.Rows || [];
    let count = 0;
    for (const r of rows) {
      const { RowState, ...data } = r;
      if (!data.ProductID) continue;
      if (RowState === 'D') {
        count += await DELETE.from(Products).where({ ProductID: data.ProductID });
      } else {
        const existing = await SELECT.one.from(Products).where({ ProductID: data.ProductID });
        if (existing) {
          count += await UPDATE(Products).set(data).where({ ProductID: data.ProductID });
        } else {
          await INSERT.into(Products).entries(data);
          count += 1;
        }
      }
    }
    return { Type: 'S', Message: `${count} rows saved`, Count: count };
  });
});
