/* 845 瓶缺链的真实构成（零 API，只读缓存）

   回答一个问题：缺链的瓶子，到底是
     A. 搜过但全被拒（判据问题 / 需要别名）
     B. 搜过但一条都没召回（需要用中文香名）
     C. 缓存里根本没有查询记录（从没搜过）
   这三种的处置完全不同。先量清楚再动手。
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreMatch } from './lib/union-api.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

const perfumes = read('data/perfumes.json').perfumes;
const links = read('data/affiliate-links.json');
const cache = read('data/.cache/union-api.json');
const aliases = read('data/brand-aliases.json');

const have = new Set(Object.keys(links.taobao || {}));
const missing = perfumes.filter((p) => !have.has(p.id));

/* 把缓存按香水 id 归组：key 形如 taobao:<perfume-id>:<keyword> */
const byPerf = new Map();
for (const [key, node] of Object.entries(cache)) {
  const parts = key.split(':');
  if (parts[0] !== 'taobao') continue;
  const id = parts[1];
  if (!byPerf.has(id)) byPerf.set(id, []);
  byPerf.get(id).push({ key, keyword: node.keyword, cands: node.candidates || [] });
}

const buckets = { A: [], B: [], C1: [], C2: [] };
const A_reason = {};

for (const p of missing) {
  const rows = byPerf.get(p.id) || [];
  const searched = rows.filter((r) => r.cands.length > 0);
  if (rows.length === 0) { buckets.C2.push(p); continue; }
  if (searched.length === 0) { buckets.B.push(p); continue; }

  /* 有候选：看最好的一条为什么没过 */
  let best = null;
  for (const r of searched) {
    for (const c of r.cands) {
      const m = scoreMatch(p, c.title, aliases, c.categoryText);
      if (!best || m.score > best.m.score) best = { m, r, c };
    }
  }
  if (best && best.m.accept) {
    /* 缓存里已经有可接受的商品，却没进 affiliate-links.json —— 说明是流水线漏跑 */
    buckets.C1.push({ p, best });
  } else {
    buckets.A.push(p);
    const reason = best ? best.m.reason : '无候选';
    A_reason[reason] = (A_reason[reason] || 0) + 1;
  }
}

const pct = (n) => (n / missing.length * 100).toFixed(1) + '%';
console.log(`缺链 ${missing.length} 瓶`);
console.log(`  A  搜过但全被拒：${buckets.A.length}  ${pct(buckets.A.length)}`);
console.log(`  B  搜过但零召回：${buckets.B.length}  ${pct(buckets.B.length)}`);
console.log(`  C1 缓存已有可接受商品，却没落库：${buckets.C1.length}  ${pct(buckets.C1.length)}   ← 重跑 merge 即可`);
console.log(`  C2 缓存里完全没有查询记录：${buckets.C2.length}  ${pct(buckets.C2.length)}   ← 得重新搜`);

console.log('\nA 类拒收理由分布：');
for (const [k, v] of Object.entries(A_reason).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(3)}  ${k}`);
}

const brandTop = (arr, label) => {
  const m = {};
  for (const p of arr) m[p.brand] = (m[p.brand] || 0) + 1;
  console.log(`\n${label} 品牌 top12：`);
  for (const [b, n] of Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${String(n).padStart(3)}  ${b}`);
  }
};
brandTop(buckets.B, 'B');
brandTop(buckets.A, 'A');

/* 抽样看 B 类长什么样：这些只能用中文香名去救 */
console.log('\nB 类样本 12 瓶：');
for (const p of buckets.B.slice(0, 12)) {
  const kws = (byPerf.get(p.id) || []).map((r) => r.keyword).join(' | ');
  console.log(`  ${p.brand} / ${p.name}  ← 搜过: ${kws}`);
}

/* C1 是白捡的：缓存里已有可接受商品，只是没落库。抽样核对标题对不对 */
console.log('\nC1 样本 10 瓶（缓存里已有可接受商品）：');
for (const { p, best } of buckets.C1.slice(0, 10)) {
  console.log(`  ${p.brand} / ${p.name}`);
  console.log(`      → ${best.c.title.slice(0, 62)}  [cover=${best.m.nameCover.toFixed(2)}]`);
}

console.log('\nC1 按品牌：');
const c1m = {};
for (const { p } of buckets.C1) c1m[p.brand] = (c1m[p.brand] || 0) + 1;
for (const [b, n] of Object.entries(c1m).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(n).padStart(3)}  ${b}`);
}

/* C2 从没搜过：哪些品牌、多少瓶 */
console.log('\nC2 按品牌 top12（从没搜过）：');
const c2m = {};
for (const p of buckets.C2) c2m[p.brand] = (c2m[p.brand] || 0) + 1;
for (const [b, n] of Object.entries(c2m).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(n).padStart(3)}  ${b}`);
}
