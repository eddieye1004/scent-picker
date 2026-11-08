/* 探针 7：全库重放（终版）—— 直接 import 被测模块，不再抄一份候选实现。
   旧实现保留一份快照（HEAD 原样）作为对照，用来算「新救回 / 新误杀 / 理由改写」。
   语料：scent-picker-v2/data/products.candidates.json（全量快照，只读）
   产物：data/.cache/leaf-replay.json */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categoryGate as newGate } from './lib/union-api.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const V2 = resolve(root, '..', 'scent-picker-v2', 'data', 'products.candidates.json');
const LIVE = resolve(root, 'data', 'affiliate-links.json');
const OUT = resolve(root, 'data', '.cache', 'leaf-replay.json');

/* ---------- 旧实现：git 045b889 原样，逐字节对照 ---------- */
const PERFUME_WORDS = [
  '香水', '香氛', '淡香精', '浓香精', '淡香水', '古龙水', '香精',
  'edp', 'edt', 'eau de parfum', 'eau de toilette', 'parfum', 'cologne', 'perfume',
];
const NON_PERFUME_WORDS = [
  '香皂', '沐浴', '洗发', '护发', '洗手液', '身体乳', '护手霜', '润肤',
  '口红', '唇膏', '唇釉', '粉底', '眼影', '面膜', '精华', '面霜', '洁面',
  '牙膏', '纸巾', '抽纸', '洗衣液', '柔顺剂', '香薰蜡烛', '无火香薰', '车载香',
  '剃须', '须后', '除臭', '止汗', '驱蚊', '空气清新',
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

const leafOf = (cat) => {
  const parts = String(cat || '').split('/').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
};

const v2 = JSON.parse(readFileSync(V2, 'utf8'));
const liveKeys = new Set(Object.keys(JSON.parse(readFileSync(LIVE, 'utf8')).taobao || {}));
const rows = [];
let noPicked = 0;
for (const bucket of ['accepted', 'rejected']) {
  for (const it of v2[bucket]) {
    const p = it.picked;
    if (!p || !p.title) { noPicked++; continue; }
    const o = oldGate(p.title, p.categoryText);
    const n = newGate(p.title, p.categoryText);
    rows.push({
      bucket, id: it.id, brand: it.brand, name: it.name,
      title: p.title, price: p.price ?? null, categoryText: p.categoryText ?? '',
      leaf: leafOf(p.categoryText),
      recordedReason: p.reason ?? null,
      liveLinked: liveKeys.has(it.id),
      oldOk: o.ok, oldReason: o.reason, newOk: n.ok, newReason: n.reason,
    });
  }
}

const rescued = rows.filter((r) => !r.oldOk && r.newOk);
const miskill = rows.filter((r) => r.oldOk && !r.newOk);
const reasonRewritten = rows.filter((r) => !r.oldOk && !r.newOk && r.oldReason !== r.newReason);
const untouched = rows.filter((r) => r.oldOk === r.newOk && r.oldReason === r.newReason);
const leafEmpty = rows.filter((r) => !r.leaf);
const catEmpty = rows.filter((r) => !String(r.categoryText || '').trim());

payloadWrite();

function payloadWrite() {
  const payload = {
    generatedAt: new Date().toISOString(),
    corpus: V2,
    totals: {
      rowsWithPicked: rows.length,
      noPickedSkipped: noPicked,
      oldAccept: rows.filter((r) => r.oldOk).length,
      newAccept: rows.filter((r) => r.newOk).length,
      acceptedBucketTotal: v2.accepted.length,
      rejectedBucketTotal: v2.rejected.length,
      liveLinks: liveKeys.size,
    },
    numbers: {
      rescued: rescued.length,
      miskill: miskill.length,
      reasonRewritten: reasonRewritten.length,
      untouched: untouched.length,
      leafEmpty: leafEmpty.length,
      categoryTextEmpty: catEmpty.length,
    },
    rescued, miskill, reasonRewritten,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');

  console.log('候选带 picked 的条目:', rows.length, '| 无 picked 跳过:', noPicked);
  console.log('旧 accept', payload.totals.oldAccept, '→ 新 accept', payload.totals.newAccept);
  console.log('四个数字:', JSON.stringify(payload.numbers));
  console.log('\n--- 新救回', rescued.length, '---');
  for (const r of rescued) console.log(`  ${r.id} | leaf=${r.leaf} | ${r.title}`);
  console.log('\n--- 新误杀', miskill.length, '---');
  for (const r of miskill) {
    console.log(`  [${r.bucket}${r.liveLinked ? ',LIVE' : ''}] ${r.id} | leaf=${r.leaf} | ¥${r.price}`);
    console.log(`     T: ${r.title}`);
    console.log(`     C: ${r.categoryText}`);
    console.log(`     recorded=${r.recordedReason} → new=${r.newReason}`);
  }
  console.log('\n--- 理由被改写', reasonRewritten.length, '---');
  for (const r of reasonRewritten) console.log(`  ${r.id} | leaf=${r.leaf} | ${r.oldReason} -> ${r.newReason}`);
}
