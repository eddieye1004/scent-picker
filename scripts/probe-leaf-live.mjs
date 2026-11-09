/* 探针 4：影响面 —— 漏洞放行的那些瓶，现在是否真的挂在线上库里。
   判据：data/affiliate-links.json 的 taobao 是 {瓶id: url}，
   所以直接查 key 是否存在即可（上一版 probe 误判过一次，这里是正确做法）。
   产物：data/.cache/leaf-live-impact.json */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const LIVE = resolve(root, 'data', 'affiliate-links.json');
const CROSS = resolve(root, 'data', '.cache', 'leaf-cross.json');
const DIST = resolve(root, 'data', '.cache', 'leaf-dist.json');
const OUT = resolve(root, 'data', '.cache', 'leaf-live-impact.json');

const live = JSON.parse(readFileSync(LIVE, 'utf8'));
const tb = live.taobao || {};
const liveKeys = new Set(Object.keys(tb));
const cross = JSON.parse(readFileSync(CROSS, 'utf8'));
const dist = JSON.parse(readFileSync(DIST, 'utf8'));

const isPerfumeLeaf = (leaf) => /^(香水套装|香水)$/.test(String(leaf || '').trim());

const impact = cross.leakRows.map((r) => ({
  ...r,
  liveLinked: liveKeys.has(r.id),
  newVerdict: 'reject',
}));

/* 反向：v2 accepted 里被新判据拒掉的，逐个看线上是否已挂链接 */
const accIds = new Set(dist.rows.filter((r) => r.bucket === 'accepted').map((r) => r.id));

/* 7 条「叶子=香精 但在工业化学类目」的，旧拒新也拒，确认不会误救 */
const industrial = dist.rows
  .filter((r) => r.hasPicked && String(r.leaf || '') === '香精')
  .map((r) => ({ id: r.id, bucket: r.bucket, leaf: r.leaf, categoryText: r.raw, title: r.title, liveLinked: liveKeys.has(r.id) }));

/* 全库口径：live 库里 634 瓶，有多少瓶的类目证据来自漏网叶子（从 v2 反查不到，
   因为 live 只存 url；这里改用 v2 accepted 的叶子分布交叉） */
const acceptedLeaf = new Map();
for (const r of dist.rows) {
  if (r.bucket !== 'accepted' || !r.hasPicked) continue;
  const k = r.leaf || '(空)';
  acceptedLeaf.set(k, (acceptedLeaf.get(k) || 0) + 1);
}

const payload = {
  generatedAt: new Date().toISOString(),
  liveTotal: liveKeys.size,
  liveCoverage: live.coverage,
  leakRows: impact,
  leakLiveLinked: impact.filter((r) => r.liveLinked).length,
  industrialJing: industrial,
  acceptedLeafTop: [...acceptedLeaf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25),
  isPerfumeLeafSample: ['香水', '香水套装', '香精', '空气芳香剂'].map((l) => [l, isPerfumeLeaf(l)]),
};
writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');
console.log('live keys', liveKeys.size, 'coverage', JSON.stringify(live.coverage));
console.log('loophole rows', impact.length, 'of which live-linked', payload.leakLiveLinked);
console.log('\n--- 漏洞行 × 线上是否已挂链接 ---');
for (const r of impact) console.log(`${r.liveLinked ? 'LIVE ' : '     '} ${r.bucket} ${r.id} | leaf=${r.leaf}`);
console.log('\n--- 工业类目叶子=香精（新判据仍拒，确认不误救）---');
for (const r of industrial) console.log(`${r.liveLinked ? 'LIVE ' : '     '} ${r.bucket} ${r.id} | ${r.title}`);
console.log('\n--- accepted 624 的叶子分布 top ---');
for (const [k, v] of payload.acceptedLeafTop) console.log(String(v).padStart(4), k);
