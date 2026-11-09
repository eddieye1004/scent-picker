/* 探针 13：线上 641 瓶的「可重链」数，新旧判据各算一遍。
   这是本任务唯一有实际后果的口径：新判据会不会让已上线的瓶子掉链接。
   做法：用当前 data/.cache/union-api.json（全量 1388 键）对 live 的每个瓶重跑 pickBest，
   分别用新判据与旧判据（旧闸门函数本文件内自带）看能否选到 accept 的候选。
   产物：data/.cache/leaf-live-relink.json */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickBest } from './lib/union-api.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const CACHE = resolve(root, 'data', '.cache', 'union-api.json');
const V2 = resolve(root, '..', 'scent-picker-v2', 'data', 'products.candidates.json');
const LIVE = resolve(root, 'data', 'affiliate-links.json');
const OUT = resolve(root, 'data', '.cache', 'leaf-live-relink.json');

const cache = JSON.parse(readFileSync(CACHE, 'utf8'));
const v2 = JSON.parse(readFileSync(V2, 'utf8'));
const alias = JSON.parse(readFileSync(resolve(root, 'data', 'brand-aliases.json'), 'utf8'));
const fa = JSON.parse(readFileSync(resolve(root, 'data', 'fragrance-aliases.json'), 'utf8'));
const live = JSON.parse(readFileSync(LIVE, 'utf8')).taobao || {};

const v2ById = new Map();
for (const b of ['accepted', 'rejected']) for (const it of v2[b]) v2ById.set(it.id, it);

/* 旧判据下的 pickBest：把每条候选的 categoryText 抹成「彩妆/香水/美妆工具/香水」
   只有在旧闸门放行时才这么做 —— 这样打分完全不变，只把闸门变量单独拆出来。 */
const PERFUME_WORDS = ['香水', '香氛', '淡香精', '浓香精', '淡香水', '古龙水', '香精',
  'edp', 'edt', 'eau de parfum', 'eau de toilette', 'parfum', 'cologne', 'perfume'];
const NON_PERFUME_WORDS = ['香皂', '沐浴', '洗发', '护发', '洗手液', '身体乳', '护手霜', '润肤',
  '口红', '唇膏', '唇釉', '粉底', '眼影', '面膜', '精华', '面霜', '洁面',
  '牙膏', '纸巾', '抽纸', '洗衣液', '柔顺剂', '香薰蜡烛', '无火香薰', '车载香',
  '剃须', '须后', '除臭', '止汗', '驱蚊', '空气清新'];
const CANDLE_PAT = /蜡烛|蜡燭|蠟燭|candle/i;
const SAMPLE_PAT = /小样|试用装|分装|试管|体验装|\b[1-5]\s*ml\b/i;
function oldGateOk(title, categoryText) {
  const t = String(title || '').toLowerCase();
  const cat = String(categoryText || '');
  if (NON_PERFUME_WORDS.find((w) => t.includes(w))) return false;
  if (CANDLE_PAT.test(t)) return false;
  if (SAMPLE_PAT.test(t)) return false;
  if (cat) return cat.includes('香水');
  return PERFUME_WORDS.some((w) => t.includes(w));
}
const BENIGN = '彩妆/香水/美妆工具/香水';

let oldOk = 0, newOk = 0, noCache = 0;
const newlyUnlinkable = [];
const newlyLinkable = [];
for (const id of Object.keys(live)) {
  const it = v2ById.get(id);
  const keys = Object.keys(cache).filter((k) => k.startsWith(`taobao:${id}:`));
  if (!it || !keys.length) { noCache++; continue; }
  const cands = keys.flatMap((k) => cache[k].candidates || []);
  const perfume = { brand: it.brand, name: it.name };
  const bestNew = pickBest(perfume, cands, alias, fa[id] || null);
  const candsOld = cands.map((c) => (oldGateOk(c.title, c.categoryText) ? { ...c, categoryText: BENIGN } : { ...c, categoryText: '无关类目' }));
  const bestOld = pickBest(perfume, candsOld, alias, fa[id] || null);
  const o = !!bestOld?.accept, n = !!bestNew?.accept;
  if (o) oldOk++;
  if (n) newOk++;
  if (o && !n) newlyUnlinkable.push({ id, brand: it.brand, name: it.name,
    bestTitle: bestNew?.title ?? null, bestCat: bestNew?.categoryText ?? null, reason: bestNew?.reason ?? null });
  if (!o && n) newlyLinkable.push({ id, brand: it.brand, name: it.name,
    bestTitle: bestNew?.title ?? null, bestCat: bestNew?.categoryText ?? null });
}

writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  liveTotal: Object.keys(live).length, noCache,
  oldRelinkable: oldOk, newRelinkable: newOk,
  newlyUnlinkable, newlyLinkable,
}, null, 2), 'utf8');

console.log('live 瓶数', Object.keys(live).length, '| 无 v2 元数据或无缓存', noCache);
console.log('旧判据可重链', oldOk, '→ 新判据可重链', newOk);
console.log('新判据下掉链接（旧能选到/新选不到）:', newlyUnlinkable.length);
for (const x of newlyUnlinkable) {
  console.log(`  ${x.id} (${x.brand} ${x.name})`);
  console.log(`     新判据选出: ${x.bestTitle} || ${x.bestCat}`);
  console.log(`     理由: ${x.reason}`);
}
console.log('新判据下新增可链接:', newlyLinkable.length);
for (const x of newlyLinkable) console.log(`  ${x.id} :: ${x.bestTitle} || ${x.bestCat}`);
