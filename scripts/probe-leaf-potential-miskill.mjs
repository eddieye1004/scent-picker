/* 探针 9：新拒收的条目里，有多少「标题看起来是正装香水」——
   用来找闸门层之外的潜在误杀（不是只看那 7 条 accepted 桶）。
   判据（全部来自标题原文，不靠推断）：
     · 标题含 PERFUME_WORDS 之一
     · 标题不含任何 NON_PERFUME_WORDS / 蜡烛 / 小样词
     · 价格 >= 200（试用装与小样在实测语料里都远低于这个数）
   产物：data/.cache/leaf-potential-miskill.json */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categoryGate } from './lib/union-api.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const V2 = resolve(root, '..', 'scent-picker-v2', 'data', 'products.candidates.json');
const LIVE = resolve(root, 'data', 'affiliate-links.json');
const OUT = resolve(root, 'data', '.cache', 'leaf-potential-miskill.json');

const PERFUME_WORDS = ['香水', '香氛', '淡香精', '浓香精', '淡香水', '古龙水', '香精',
  'edp', 'edt', 'eau de parfum', 'eau de toilette', 'parfum', 'cologne', 'perfume'];
const NON_PERFUME_WORDS = ['香皂', '沐浴', '洗发', '护发', '洗手液', '身体乳', '护手霜', '润肤',
  '口红', '唇膏', '唇釉', '粉底', '眼影', '面膜', '精华', '面霜', '洁面',
  '牙膏', '纸巾', '抽纸', '洗衣液', '柔顺剂', '香薰蜡烛', '无火香薰', '车载香',
  '剃须', '须后', '除臭', '止汗', '驱蚊', '空气清新'];
const CANDLE_PAT = /蜡烛|蜡燭|蠟燭|candle/i;
const SAMPLE_PAT = /小样|试用装|分装|试管|体验装|\b[1-5]\s*ml\b/i;
const leafOf = (c) => String(c || '').split('/').map((s) => s.trim()).filter(Boolean).pop() || '';

const v2 = JSON.parse(readFileSync(V2, 'utf8'));
const liveKeys = new Set(Object.keys(JSON.parse(readFileSync(LIVE, 'utf8')).taobao || {}));

const suspects = [];
const rejectedByCat = [];
for (const bucket of ['accepted', 'rejected']) {
  for (const it of v2[bucket]) {
    const p = it.picked;
    if (!p || !p.title) continue;
    const g = categoryGate(p.title, p.categoryText);
    if (g.ok) continue;
    const isCatReason = /叶子|类目|试香礼盒/.test(g.reason);
    if (!isCatReason) continue;
    rejectedByCat.push({ bucket, id: it.id, leaf: leafOf(p.categoryText), reason: g.reason,
      title: p.title, price: Number(p.price) || 0, categoryText: p.categoryText, live: liveKeys.has(it.id) });
    const t = String(p.title).toLowerCase();
    const looksFullBottle =
      PERFUME_WORDS.some((w) => t.includes(w)) &&
      !SAMPLE_PAT.test(t) && !CANDLE_PAT.test(t) &&
      !NON_PERFUME_WORDS.some((w) => t.includes(w));
    const price = Number(p.price) || 0;
    if (looksFullBottle && price >= 200) suspects.push({ bucket, id: it.id, leaf: leafOf(p.categoryText),
      reason: g.reason, title: p.title, price, categoryText: p.categoryText, live: liveKeys.has(it.id) });
  }
}

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), rejectedByCat, suspects }, null, 2), 'utf8');
console.log('新判据按类目拒收:', rejectedByCat.length, '| 其中「标题像正装且价>=200」的潜在误杀:', suspects.length);
for (const s of suspects) {
  console.log(`\n[${s.bucket}${s.live ? ',LIVE' : ''}] ${s.id} ¥${s.price} leaf=${s.leaf}`);
  console.log('   T:', s.title);
  console.log('   C:', s.categoryText);
}
console.log('\n--- 全部类目拒收按叶子计数 ---');
const m = new Map();
for (const r of rejectedByCat) m.set(r.leaf, (m.get(r.leaf) || 0) + 1);
for (const [k, v] of [...m].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4), k);
