/* 探针 6：把所有「类目路径含香水」的叶子逐个列出来，带样例标题与桶归属，
   用来决定新判据是白名单（只认叶子=香水/香水套装）还是黑名单（只拒已知彩妆）。
   这一步必须先看全，再定判据 —— 上一轮就是凭印象把 candle 规则写晚了。
   产物：data/.cache/leaf-under-perfume.json */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const V2 = resolve(root, '..', 'scent-picker-v2', 'data', 'products.candidates.json');
const LIVE = resolve(root, 'data', 'affiliate-links.json');
const OUT = resolve(root, 'data', '.cache', 'leaf-under-perfume.json');

const v2 = JSON.parse(readFileSync(V2, 'utf8'));
const liveKeys = new Set(Object.keys(JSON.parse(readFileSync(LIVE, 'utf8')).taobao || {}));
const leafOf = (c) => String(c || '').split('/').map((s) => s.trim()).filter(Boolean).pop() || '';

const groups = new Map();
for (const bucket of ['accepted', 'rejected']) {
  for (const it of v2[bucket]) {
    const p = it.picked;
    if (!p || !p.title) continue;
    const cat = String(p.categoryText || '');
    if (!cat.includes('香水')) continue;
    const leaf = leafOf(cat);
    const g = groups.get(leaf) || { leaf, n: 0, accepted: 0, rejected: 0, parents: new Set(), samples: [] };
    g.n++;
    g[bucket]++;
    g.parents.add(cat.split('/').slice(0, -1).join('/'));
    if (g.samples.length < 6) g.samples.push({ id: it.id, bucket, title: p.title, cat, price: p.price, live: liveKeys.has(it.id) });
    groups.set(leaf, g);
  }
}

const out = [...groups.values()]
  .map((g) => ({ ...g, parents: [...g.parents] }))
  .sort((a, b) => b.n - a.n);

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), leaves: out }, null, 2), 'utf8');

console.log('类目含「香水」的叶子种类:', out.length, '总条数:', out.reduce((s, g) => s + g.n, 0));
for (const g of out) {
  console.log(`\n### ${g.leaf}  n=${g.n} (acc=${g.accepted} rej=${g.rejected})`);
  console.log('   parents:', g.parents.join(' | '));
  for (const s of g.samples) console.log(`   [${s.live ? 'LIVE' : '    '}] ${s.bucket} ${s.id} ¥${s.price} :: ${s.title}`);
}
