// 시드 데이터 생성기. `node db/data/gen-products.js` 로 pt-Products.csv 를 다시 만든다.
const fs = require('fs');
const path = require('path');
const categories = ['Laptop', 'Monitor', 'Keyboard', 'Mouse', 'Printer', 'Scanner', 'Headset', 'Webcam', 'Docking', 'Cable'];
const suppliers = ['Alpha Supply', 'Beta Trading', 'Gamma Tech', 'Delta Parts', 'Epsilon Co', 'Zeta Logistics'];
const currencies = ['KRW', 'USD', 'EUR'];
const units = ['EA', 'BOX', 'SET'];
const N = 300;
let seed = 42;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const lines = ['ID;ProductID;Name;Category;Supplier;Price;Currency;Quantity;Unit;ReleaseDate;Active'];
for (let i = 1; i <= N; i++) {
  const cat = pick(categories);
  const cur = pick(currencies);
  const price = cur === 'KRW' ? Math.round(rnd() * 2000000) : (rnd() * 2000).toFixed(2);
  const d = new Date(2020, 0, 1 + Math.floor(rnd() * 2400));
  const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  lines.push([id, `P${String(i).padStart(5, '0')}`, `${cat} ${i}`, cat, pick(suppliers), price, cur,
    Math.floor(rnd() * 500), pick(units), d.toISOString().slice(0, 10), rnd() > 0.2].join(';'));
}
fs.writeFileSync(path.join(__dirname, 'pt-Products.csv'), lines.join('\n') + '\n');
console.log(`wrote ${N} rows`);
