/* 探针 11：给报告用的汇总数字（一次跑完，避免报告里手工抄数字）。
   只读既有产物 + 现场重算 v2 分布，不改任何判据。
   产物：data/.cache/leaf-report-numbers.json */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categoryGate } from './lib/union-api.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const V2 = resolve(root, '..', 'scent-picker-v2', 'data', 'products.candidates.json');
const LIVE = resolve(root, 'data', 'affiliate-links.json');
const OUT = resolve(root, 'data', '.cache', 'leaf-report-numbers.json');

const v2 = JSON.parse(readFileSync(V2, 'utf8'));
const liveKeys = new Set(Object.keys(JSON.parse(readFileSync(LIVE, 'utf8')).taobao || {}));
const replay = JSON.parse(readFileSync(resolve(root, 'data', '.cache', 'leaf-replay.json'), 'utf8'));
const e2e = JSON.parse(readFileSync(resolve(root, 'data', '.cache', 'leaf-replay-e2e.json'), 'utf8'));
const dist = JSON.parse(readFileSync(resolve(root, 'data', '.cache', 'leaf-dist.json'), 'utf8'));
const potential = JSON.parse(readFileSync(resolve(root, 'data', '.cache', 'leaf-potential-miskill.json'), 'utf8'));

const leafOf = (c) => String(c || '').split('/').map((s) => s.trim()).filter(Boolean).pop() || '';

/* v2 全库口径：带 picked 的 907 条，叶子分布（前 20） */
const withPicked = [];
for (const bucket of ['accepted', 'rejected']) {
  for (const it of v2[bucket]) {
    if (!it.picked || !it.picked.title) continue;
    withPicked.push({ bucket, id: it.id, leaf: leafOf(it.picked.categoryText), cat: it.picked.categoryText || '',
      title: it.picked.title, price: it.picked.price });
  }
}
const leafCount = new Map();
for (const r of withPicked) leafCount.set(r.leaf || '(空)', (leafCount.get(r.leaf || '(空)') || 0) + 1);
const leafTop = [...leafCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
  .map(([leaf, n]) => ({ leaf, n }));

/* 只统计「类目路径含香水」的 721 条 —— 闸门漏洞的作用域 */
const inPerfumePath = withPicked.filter((r) => r.cat.includes('香水'));
const pathLeaf = new Map();
for (const r of inPerfumePath) {
  const e = pathLeaf.get(r.leaf) || { leaf: r.leaf, n: 0, accepted: 0, rejected: 0, newPass: 0, newReject: 0, samples: [] };
  e.n++;
  e[r.bucket]++;
  const g = categoryGate(r.title, r.cat);
  if (g.ok) e.newPass++; else e.newReject++;
  if (e.samples.length < 3) e.samples.push({ id: r.id, bucket: r.bucket, title: r.title, price: r.price, categoryText: r.cat, verdict: g.ok ? 'PASS' : 'REJECT', reason: g.reason });
  pathLeaf.set(r.leaf, e);
}
const pathLeaves = [...pathLeaf.values()].sort((a, b) => b.n - a.n);

/* 无 picked（零召回）的 481 条：闸门根本没跑过，不是「类目为空」 */
const noPicked = v2.accepted.concat(v2.rejected).filter((i) => !i.picked);
const noPickedByBucket = { accepted: noPicked.filter((i) => v2.accepted.includes(i)).length, rejected: noPicked.filter((i) => v2.rejected.includes(i)).length };

const payload = {
  generatedAt: new Date().toISOString(),
  corpus: { file: V2, accepted: v2.accepted.length, rejected: v2.rejected.length, rowsWithPicked: withPicked.length, rowsNoPicked: noPicked.length, noPickedByBucket },
  live: { taobaoLinked: liveKeys.size },
  gateLevel: replay.numbers,
  gateLevelTotals: replay.totals,
  e2e: e2e.numbers,
  e2eByBucket: e2e.byBucketAccepted,
  leafTopOverAll: leafTop,
  perfumePath: { rows: inPerfumePath.length, distinctLeaves: pathLeaves.length, leaves: pathLeaves },
  potentialMiskill: { count: potential.suspects.length, rows: potential.suspects },
  categoryTextEmpty: withPicked.filter((r) => !r.cat.trim()).length,
};

writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');
console.log('rows withPicked', withPicked.length, '| 类目含香水', inPerfumePath.length, '| 叶子种类', pathLeaves.length);
console.log('gate', JSON.stringify(replay.numbers), '| e2e', JSON.stringify(e2e.numbers));
console.log('\n--- 类目含香水的叶子（新判定）---');
for (const e of pathLeaves) console.log(String(e.n).padStart(5), e.leaf, '| PASS', e.newPass, 'REJECT', e.newReject);
