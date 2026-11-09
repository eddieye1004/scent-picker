/* 探针 10：本地 85 条缓存（另一个作业正在往里写）上的影响面。
   注意：这个文件**正在被主线作业覆写**，两次读到的内容可能不同，
   所以本探针的结论只作参考，全库结论以 v2 快照为准（probe-leaf-replay*）。
   用**逐字节的旧实现**做对照，不用近似规则。
   产物：data/.cache/leaf-cache-delta.json */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categoryGate } from './lib/union-api.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const OUT = resolve(root, 'data', '.cache', 'leaf-cache-delta.json');
const FILES = {
  'data/.cache/union-api.json': resolve(root, 'data', '.cache', 'union-api.json'),
  'data/.cache/reject-snapshot-union-api.json': resolve(root, 'data', '.cache', 'reject-snapshot-union-api.json'),
};

const PERFUME_WORDS = ['香水', '香氛', '淡香精', '浓香精', '淡香水', '古龙水', '香精',
  'edp', 'edt', 'eau de parfum', 'eau de toilette', 'parfum', 'cologne', 'perfume'];
const NON_PERFUME_WORDS = ['香皂', '沐浴', '洗发', '护发', '洗手液', '身体乳', '护手霜', '润肤',
  '口红', '唇膏', '唇釉', '粉底', '眼影', '面膜', '精华', '面霜', '洁面',
  '牙膏', '纸巾', '抽纸', '洗衣液', '柔顺剂', '香薰蜡烛', '无火香薰', '车载香',
  '剃须', '须后', '除臭', '止汗', '驱蚊', '空气清新'];
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
const leafOf = (c) => String(c || '').split('/').map((s) => s.trim()).filter(Boolean).pop() || '';

const report = {};
for (const [label, file] of Object.entries(FILES)) {
  if (!existsSync(file)) { report[label] = { error: 'missing' }; continue; }
  let d;
  try { d = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { report[label] = { error: e.message }; continue; }
  const deltas = [];
  let n = 0;
  for (const [key, v] of Object.entries(d)) {
    for (const c of v.candidates || []) {
      n++;
      const o = oldGate(c.title, c.categoryText);
      const nn = categoryGate(c.title, c.categoryText);
      if (o.ok !== nn.ok) deltas.push({ key, leaf: leafOf(c.categoryText), title: c.title, categoryText: c.categoryText,
        oldOk: o.ok, newOk: nn.ok, oldReason: o.reason, newReason: nn.reason });
    }
  }
  const rescued = deltas.filter((x) => !x.oldOk && x.newOk);
  const killed = deltas.filter((x) => x.oldOk && !x.newOk);
  report[label] = { candidates: n, keys: Object.keys(d).length, delta: deltas.length,
    rescued: rescued.length, killed: killed.length, rescuedSample: rescued.slice(0, 10), killedSample: killed.slice(0, 10),
    killedByLeaf: [...killed.reduce((m, x) => m.set(x.leaf, (m.get(x.leaf) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]) };
  console.log(`\n### ${label}  keys=${Object.keys(d).length} candidates=${n}`);
  console.log(`  判定变化 ${deltas.length}：新救回 ${rescued.length} / 新拒 ${killed.length}`);
  console.log('  新拒按叶子:', JSON.stringify(report[label].killedByLeaf.slice(0, 12)));
  for (const x of killed.slice(0, 8)) console.log(`    [kill] ${x.key} leaf=${x.leaf} :: ${x.title} :: ${x.categoryText}`);
  for (const x of rescued.slice(0, 8)) console.log(`    [save] ${x.key} leaf=${x.leaf} :: ${x.title} :: ${x.categoryText}`);
}
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), note: 'local caches may be rewritten by the mainline cache job; v2 snapshot is authoritative', report }, null, 2), 'utf8');
