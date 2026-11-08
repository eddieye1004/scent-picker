/* 诊断：成功的匹配靠中文标题还是英文标题？

   `data/products.candidates.json` 的 `accepted[]` 里每条带 `picked.title`
   （就是最终落库那个商品的标题）。这份文件被后一轮探针覆盖过，
   只剩 179 条样本 —— 但足以回答"命中靠哪种语言"。

   要回答的问题：若绝大多数命中靠中文标题，那品牌别名表就是当前覆盖率的
   第一瓶颈（标题写「祖玛珑」而库里叫「Jo Malone London」，品牌就判不中）。
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/products.candidates.json'), 'utf8'));
const acc = c.accepted || [];
console.log(`accepted ${acc.length} 条（stats: ${JSON.stringify(c.stats)}）\n`);

const HAN = /[\u4e00-\u9fa5]/;
const LAT = /[A-Za-z]/;

let hanOnly = 0, latOnly = 0, mixed = 0, noTitle = 0;
const samples = { hanOnly: [], latOnly: [], mixed: [] };
const byKeywordKind = { nameOnly: 0, withBrand: 0, other: 0 };

for (const a of acc) {
  const t = a?.picked?.title;
  if (!t) { noTitle++; continue; }
  const h = HAN.test(t), l = LAT.test(t);
  if (h && l) { mixed++; if (samples.mixed.length < 8) samples.mixed.push(t.slice(0, 56)); }
  else if (h) { hanOnly++; if (samples.hanOnly.length < 8) samples.hanOnly.push(t.slice(0, 56)); }
  else { latOnly++; if (samples.latOnly.length < 8) samples.latOnly.push(t.slice(0, 56)); }

  const kw = String(a.keyword || '').toLowerCase();
  const brand = String(a.brand || '').toLowerCase();
  if (brand && kw.includes(brand)) byKeywordKind.withBrand++;
  else byKeywordKind.nameOnly++;
}

const n = acc.length - noTitle || 1;
console.log(`纯中文  ${String(hanOnly).padStart(3)}  ${Math.round(hanOnly / n * 100)}%`);
console.log(`中英混  ${String(mixed).padStart(3)}  ${Math.round(mixed / n * 100)}%`);
console.log(`纯拉丁  ${String(latOnly).padStart(3)}  ${Math.round(latOnly / n * 100)}%`);
console.log(`无标题  ${noTitle}`);
console.log(`\n命中时用的查询词：含品牌 ${byKeywordKind.withBrand} | 纯香名 ${byKeywordKind.nameOnly}`);
console.log('\n纯中文标题:'); samples.hanOnly.forEach((s) => console.log('  ' + s));
console.log('中英混标题:'); samples.mixed.forEach((s) => console.log('  ' + s));
console.log('纯拉丁标题:'); samples.latOnly.forEach((s) => console.log('  ' + s));
