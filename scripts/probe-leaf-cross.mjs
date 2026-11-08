/* 探针 2：交叉表 —— 「类目某层含香水」× 叶子实际取值。
   只统计，不改判据。回答一个问题：现在 `cat.includes('香水')` 放行了多少
   叶子根本不是香水的候选？
   输入：data/.cache/leaf-dist.json（探针 1 产物）
   输出：data/.cache/leaf-cross.json + 控制台摘要 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const IN = resolve(root, 'data', '.cache', 'leaf-dist.json');
const OUT = resolve(root, 'data', '.cache', 'leaf-cross.json');

const { rows } = JSON.parse(readFileSync(IN, 'utf8'));
const withPicked = rows.filter((r) => r.hasPicked && r.raw);

const hasXiangshuiAnywhere = (raw) => String(raw).includes('香水');
const leafIsPerfume = (leaf) => /香水|香精|古龙水|淡香|浓香/.test(String(leaf || ''));

const cross = new Map(); // leaf -> {n, catHasPerfume, leafIsPerfume, buckets:Set}
let a = 0; // cat 含香水 & 叶子是香水
let b = 0; // cat 含香水 & 叶子不是香水  ← 漏洞
let c = 0; // cat 不含香水 & 叶子是香水
let d = 0; // cat 不含香水 & 叶子不是香水
for (const r of withPicked) {
  const h = hasXiangshuiAnywhere(r.raw);
  const p = leafIsPerfume(r.leaf);
  if (h && p) a++;
  else if (h && !p) b++;
  else if (!h && p) c++;
  else d++;
  const k = r.leaf || '(空)';
  const e = cross.get(k) || { leaf: k, n: 0, catHasPerfume: 0, buckets: {} };
  e.n++;
  if (h) e.catHasPerfume++;
  e.buckets[r.bucket] = (e.buckets[r.bucket] || 0) + 1;
  cross.set(k, e);
}

const leak = [...cross.values()].filter((e) => e.catHasPerfume > 0 && !leafIsPerfume(e.leaf)).sort((x, y) => y.n - x.n);

/* 漏洞清单：类目里带香水、叶子不是香水 —— 现在会被放行的那些 */
const leakRows = withPicked
  .filter((r) => hasXiangshuiAnywhere(r.raw) && !leafIsPerfume(r.leaf))
  .map((r) => ({ source: r.source, bucket: r.bucket, id: r.id, brand: r.brand, name: r.name, title: r.title, categoryText: r.raw, leaf: r.leaf, reason: r.reason }));

const payload = {
  generatedAt: new Date().toISOString(),
  cells: { catHasPerfume_leafPerfume: a, catHasPerfume_leafOther: b, catNoPerfume_leafPerfume: c, neither: d },
  leakLeafCount: leak.length,
  leakRows,
  leakByLeaf: leak,
};
writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');

console.log('withPicked', withPicked.length);
console.log('交叉表', JSON.stringify(payload.cells));
console.log('漏洞叶子种类', leak.length, '漏洞候选数', leakRows.length);
console.log('--- 漏洞叶子分布 ---');
for (const e of leak) console.log(String(e.n).padStart(4), e.leaf, JSON.stringify(e.buckets));
