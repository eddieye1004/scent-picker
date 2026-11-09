/* 探针 12：7 条已上线错配的**实际影响面**。
   问题：live 里 634 瓶的链接来自 v2 快照时期选出的候选。快照里那 7 瓶选中的是彩妆，
   但当前 data/.cache/union-api.json 已被刷新成全量 1388 键，同一个瓶重跑 pickBest
   可能已经选到真香水了。
   所以「新判据会不会让这 7 瓶掉链接」不能只看 v2 快照，要看**当前缓存重跑**的结果。
   产物：data/.cache/leaf-live-repick.json */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickBest, categoryGate } from './lib/union-api.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const CACHE = resolve(root, 'data', '.cache', 'union-api.json');
const V2 = resolve(root, '..', 'scent-picker-v2', 'data', 'products.candidates.json');
const LIVE = resolve(root, 'data', 'affiliate-links.json');
const OUT = resolve(root, 'data', '.cache', 'leaf-live-repick.json');

const cache = JSON.parse(readFileSync(CACHE, 'utf8'));
const v2 = JSON.parse(readFileSync(V2, 'utf8'));
const alias = JSON.parse(readFileSync(resolve(root, 'data', 'brand-aliases.json'), 'utf8'));
const fa = JSON.parse(readFileSync(resolve(root, 'data', 'fragrance-aliases.json'), 'utf8'));
const live = JSON.parse(readFileSync(LIVE, 'utf8')).taobao || {};

const SUSPECTS = ['lancome-idole', 'narciso-rodriguez-narciso', 'azzaro-the-most-wanted-parfum',
  'amouage-guidance', 'guerlain-terracotta', 'amouage-search', 'valentino-valentina-parfum'];

const v2ById = new Map();
for (const b of ['accepted', 'rejected']) for (const it of v2[b]) v2ById.set(it.id, it);

const rows = [];
for (const id of SUSPECTS) {
  const it = v2ById.get(id);
  const keys = Object.keys(cache).filter((k) => k.startsWith(`taobao:${id}:`));
  const cands = keys.flatMap((k) => cache[k].candidates || []);
  const best = cands.length ? pickBest({ brand: it.brand, name: it.name }, cands, alias, fa[id] || null) : null;
  /* live 里的链接是哪个候选的？用来确认线上挂的到底是哪件商品 */
  const liveUrl = live[id] || '';
  const liveCand = cands.find((c) => c.clickUrl === liveUrl || c.couponShareUrl === liveUrl
    || 'https:' + c.clickUrl === liveUrl || 'https:' + c.couponShareUrl === liveUrl);
  rows.push({
    id, brand: it.brand, name: it.name,
    liveLinked: !!liveUrl,
    liveItemTitle: liveCand ? liveCand.title : null,
    liveItemCategory: liveCand ? liveCand.categoryText : null,
    snapshotPicked: { title: it.picked?.title ?? null, categoryText: it.picked?.categoryText ?? null },
    cacheKeys: keys.length, cacheCandidates: cands.length,
    repick: best ? { title: best.title, categoryText: best.categoryText, accept: best.accept, reason: best.reason, score: best.score } : null,
  });
}

/* 全库口径：当前缓存能否给 live 的 634 瓶重新选到 accept 的候选 */
let relinkable = 0, notLinkable = 0, noCache = 0;
const unlinkable = [];
for (const id of Object.keys(live)) {
  const it = v2ById.get(id) || null;
  const keys = Object.keys(cache).filter((k) => k.startsWith(`taobao:${id}:`));
  if (!keys.length) { noCache++; continue; }
  const cands = keys.flatMap((k) => cache[k].candidates || []);
  const perfume = it ? { brand: it.brand, name: it.name } : null;
  const best = perfume ? pickBest(perfume, cands, alias, fa[id] || null) : null;
  if (best?.accept) relinkable++;
  else { notLinkable++; if (unlinkable.length < 15) unlinkable.push({ id, reason: best?.reason ?? 'no perfume meta', title: best?.title ?? null }); }
}

const payload = { generatedAt: new Date().toISOString(), suspects: rows,
  liveRepick: { liveTotal: Object.keys(live).length, noCache, relinkable, notLinkable, unlinkableSample: unlinkable } };
writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');

for (const r of rows) {
  console.log(`\n### ${r.id} | live=${r.liveLinked} | cacheKeys=${r.cacheKeys} cands=${r.cacheCandidates}`);
  console.log('  快照选中 :', r.snapshotPicked.title, '||', r.snapshotPicked.categoryText);
  console.log('  线上商品 :', r.liveItemTitle, '||', r.liveItemCategory);
  console.log('  当前重选 :', r.repick ? `${r.repick.accept ? 'ACCEPT' : 'REJECT'} | ${r.repick.title} || ${r.repick.categoryText} | ${r.repick.reason}` : 'NO CACHE');
}
console.log('\n=== live 634 瓶用当前缓存重跑 ===');
console.log(JSON.stringify(payload.liveRepick, null, 1));
