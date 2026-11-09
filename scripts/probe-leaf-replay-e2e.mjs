/* 探针 8：端到端重放 —— 不只看闸门，跑完整 scoreMatch，看最终 accept 变没变。
   为什么要这一层：闸门层「旧收新拒」19 条里，有 12 条的最终结论本来就是 reject
   （品牌关拦下了），改的只是理由。只报闸门层会把 12 条算成误杀，虚高 2.4 倍。
   产物：data/.cache/leaf-replay-e2e.json */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreMatch } from './lib/union-api.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const V2 = resolve(root, '..', 'scent-picker-v2', 'data', 'products.candidates.json');
const LIVE = resolve(root, 'data', 'affiliate-links.json');
const OUT = resolve(root, 'data', '.cache', 'leaf-replay-e2e.json');

/* 旧实现 = 旧闸门 + HEAD 的 scoreMatch 其余部分（闸门之后的所有逻辑本次未改，
   所以只需把旧闸门的结果注入：旧闸门放行则沿用新 scoreMatch 的打分，否则直接拒）。 */
const NON_PERFUME_WORDS = [
  '香皂', '沐浴', '洗发', '护发', '洗手液', '身体乳', '护手霜', '润肤',
  '口红', '唇膏', '唇釉', '粉底', '眼影', '面膜', '精华', '面霜', '洁面',
  '牙膏', '纸巾', '抽纸', '洗衣液', '柔顺剂', '香薰蜡烛', '无火香薰', '车载香',
  '剃须', '须后', '除臭', '止汗', '驱蚊', '空气清新',
];
const PERFUME_WORDS = [
  '香水', '香氛', '淡香精', '浓香精', '淡香水', '古龙水', '香精',
  'edp', 'edt', 'eau de parfum', 'eau de toilette', 'parfum', 'cologne', 'perfume',
];
const CANDLE_PAT = /蜡烛|蜡燭|蠟燭|candle/i;
const SAMPLE_PAT = /小样|试用装|分装|试管|体验装|\b[1-5]\s*ml\b/i;
function oldGate(title, categoryText) {
  const t = String(title || '').toLowerCase();
  const cat = String(categoryText || '');
  const bad = NON_PERFUME_WORDS.find((w) => t.includes(w));
  if (bad) return { ok: false, reason: `非香水品类（命中「${bad}」）` };
  if (CANDLE_PAT.test(t)) return { ok: false, reason: '非香水品类（蜡烛/香薰蜡燭）' };
  if (SAMPLE_PAT.test(t)) return { ok: false, reason: '小样/试用装' };
  if (cat) {
    if (cat.includes('香水')) return { ok: true, reason: '' };
    return { ok: false, reason: `类目不是香水（${cat}）` };
  }
  if (!PERFUME_WORDS.some((w) => t.includes(w))) return { ok: false, reason: '标题无香水品类词' };
  return { ok: true, reason: '' };
}

const aliasMap = JSON.parse(readFileSync(resolve(root, 'data', 'brand-aliases.json'), 'utf8'));
const fragAliases = JSON.parse(readFileSync(resolve(root, 'data', 'fragrance-aliases.json'), 'utf8'));
const liveKeys = new Set(Object.keys(JSON.parse(readFileSync(LIVE, 'utf8')).taobao || {}));
const v2 = JSON.parse(readFileSync(V2, 'utf8'));

const leafOf = (cat) => {
  const parts = String(cat || '').split('/').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
};

/* 一个对新旧闸门都放行的类目，用来把「打分」与「闸门」两个变量拆开。 */
const PERFUME_LEAF_BENIGN = '彩妆/香水/美妆工具/香水';

const rows = [];
for (const bucket of ['accepted', 'rejected']) {
  for (const it of v2[bucket]) {
    const p = it.picked;
    if (!p || !p.title) continue;
    const perfume = { brand: it.brand, name: it.name };
    const fa = fragAliases[`${it.brand}::${it.name}`] || fragAliases[it.id] || null;
    const neu = scoreMatch(perfume, p.title, aliasMap, p.categoryText, fa);
    const og = oldGate(p.title, p.categoryText);
    /* 旧管线 = 旧闸门 + **闸门之后那套打分**（本次只改闸门，打分逻辑逐字节未动）。
       直接用 `og.ok ? neu.accept : false` 是错的：neu 已被新闸门提前拦下，
       accept 恒为 false，会把 19 条闸门层误杀整批吞成 0。
       正确做法是把同一个候选喂给闸门**都放行**的类目（`彩妆/香水/美妆工具/香水`），
       拿到纯打分结果，再与旧闸门结论合并 —— 这样旧管线的结论是独立算出来的。 */
    const scored = scoreMatch(perfume, p.title, aliasMap, PERFUME_LEAF_BENIGN, fa);
    const oldAccept = og.ok && scored.accept;
    rows.push({
      bucket, id: it.id, brand: it.brand, name: it.name,
      title: p.title, price: p.price ?? null, categoryText: p.categoryText ?? '',
      leaf: leafOf(p.categoryText), liveLinked: liveKeys.has(it.id),
      oldAccept, oldReason: og.ok ? scored.reason : og.reason,
      newAccept: neu.accept, newReason: neu.reason, nameCover: scored.nameCover,
    });
  }
}

const rescued = rows.filter((r) => !r.oldAccept && r.newAccept);
const miskill = rows.filter((r) => r.oldAccept && !r.newAccept);
const gainReason = rows.filter((r) => !r.oldAccept && !r.newAccept && r.oldReason !== r.newReason);
const byBucketAccepted = {
  oldAcceptInAcceptedBucket: rows.filter((r) => r.bucket === 'accepted' && r.oldAccept).length,
  newAcceptInAcceptedBucket: rows.filter((r) => r.bucket === 'accepted' && r.newAccept).length,
};

writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  corpus: V2,
  numbers: {
    oldAccept: rows.filter((r) => r.oldAccept).length,
    newAccept: rows.filter((r) => r.newAccept).length,
    rescued: rescued.length,
    miskill: miskill.length,
    reasonRewrittenOnly: gainReason.length,
  },
  byBucketAccepted, rescued, miskill, reasonRewrittenOnly: gainReason,
}, null, 2), 'utf8');

console.log('旧 accept', rows.filter((r) => r.oldAccept).length, '→ 新 accept', rows.filter((r) => r.newAccept).length);
console.log('accepted 桶内旧收', byBucketAccepted.oldAcceptInAcceptedBucket, '→ 新收', byBucketAccepted.newAcceptInAcceptedBucket);
console.log('新救回', rescued.length, '| 新误杀', miskill.length, '| 仅理由改写', gainReason.length);
console.log('\n--- 端到端新误杀 ---');
for (const r of miskill) {
  console.log(`[${r.bucket}${r.liveLinked ? ',LIVE' : ''}] ${r.id} ¥${r.price} leaf=${r.leaf} cover=${r.nameCover}`);
  console.log('   T:', r.title);
  console.log('   C:', r.categoryText);
  console.log('   oldReason:', r.oldReason || '(accept)', '→ new:', r.newReason);
}
