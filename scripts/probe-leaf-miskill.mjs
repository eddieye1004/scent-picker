/* 探针 3：为「新误杀」逐条取证。
   对 7 条「旧判据收、新判据会拒」的 accepted 条目，拉出价格、店铺、
   是否已在 live 的 data/affiliate-links.json 里，以及它们在标题/类目上的原话，
   供报告逐条定性（真误杀 / 本来就错）。
   产物：data/.cache/leaf-miskill.json */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const V2 = resolve(root, '..', 'scent-picker-v2', 'data', 'products.candidates.json');
const LIVE = resolve(root, 'data', 'affiliate-links.json');
const CROSS = resolve(root, 'data', '.cache', 'leaf-cross.json');
const OUT = resolve(root, 'data', '.cache', 'leaf-miskill.json');

const v2 = JSON.parse(readFileSync(V2, 'utf8'));
const live = JSON.parse(readFileSync(LIVE, 'utf8'));
const cross = JSON.parse(readFileSync(CROSS, 'utf8'));

const liveIds = new Set();
const collect = (o) => {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) return o.forEach(collect);
  if (o.id) liveIds.add(String(o.id));
  if (o.perfumeId) liveIds.add(String(o.perfumeId));
  for (const v of Object.values(o)) collect(v);
};
collect(live);

const accById = new Map(v2.accepted.map((i) => [i.id, i]));
const rows = cross.leakRows
  .filter((r) => r.bucket === 'accepted')
  .map((r) => {
    const it = accById.get(r.id) || {};
    return {
      id: r.id,
      brand: it.brand ?? r.brand,
      name: it.name ?? r.name,
      keyword: it.keyword,
      leaf: r.leaf,
      categoryText: r.categoryText,
      title: it.picked?.title ?? r.title,
      price: it.picked?.price ?? null,
      shop: it.picked?.shop ?? null,
      itemId: it.picked?.itemId ?? null,
      inLiveDb: liveIds.has(String(r.id)),
      inV2Accepted: !!it,
    };
  });

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2), 'utf8');
for (const r of rows) {
  console.log('---');
  console.log('id      :', r.id, '| live:', r.inLiveDb);
  console.log('title   :', r.title);
  console.log('cat     :', r.categoryText, '| leaf:', r.leaf);
  console.log('price   :', r.price, '| shop:', r.shop);
}

/* 附带：live 库里现在还挂着哪些 id 的类目叶子不是香水 —— 这才是真实影响面 */
const liveLeak = [];
const liveById = new Map();
const walk = (o) => {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) return o.forEach(walk);
  if (o.id && (o.taobao || o.jd || o.title)) liveById.set(String(o.id), o);
  for (const v of Object.values(o)) walk(v);
};
walk(live);
for (const [id, o] of liveById) {
  const cat = String(o.categoryText || o.category || '');
  if (!cat || !cat.includes('香水')) continue;
  const leaf = cat.split('/').filter(Boolean).pop() || '';
  if (/香水|香水套装/.test(leaf)) continue;
  liveLeak.push({ id, leaf, categoryText: cat, title: o.title ?? null });
}
console.log('\n=== live affiliate-links 里类目叶子非香水、当前被放行的条目:', liveLeak.length, '===');
for (const r of liveLeak) console.log(r.id, '|', r.leaf, '|', r.title);

writeFileSync(resolve(root, 'data', '.cache', 'leaf-live-leak.json'), JSON.stringify({ generatedAt: new Date().toISOString(), liveLeak }, null, 2), 'utf8');
