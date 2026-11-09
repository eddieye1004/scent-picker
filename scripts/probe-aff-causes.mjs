/* 缺链原因分类器 —— 把 751 瓶缺链按**可执行动作**归类，而不是按报错文案归类。

   为什么不用现成的 reason 字符串：`products.candidates.json` 里的 reason 是
   scoreMatch 的拒收理由，只覆盖跑过的那批（5 瓶）；而真实的缺链是 764 / 751 瓶。
   两者口径完全不同，混着引用会得出错的分布。

   分类维度（每条都能落到一个动作）：
     A. 接口对该查询词返回 0 条 —— 淘宝上就是没有这瓶的推广计划
     B. 召回但判据拒（香名覆盖率 / 品牌未命中 / 小样 / 类目 / 性别）
     C. 判据拒的原因本身可修（品牌别名缺中文、译名缺条目）
     D. 结构性不可达（合并系列，标题只写系列名）

   只读。用法：node scripts/probe-aff-causes.mjs
*/
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const rj = async (p) => JSON.parse(await readFile(path.join(ROOT, p), 'utf8'));

const perfumes = (await rj('data/perfumes.json')).perfumes;
const aff = await rj('data/affiliate-links.json');
const has = new Set(Object.keys(aff.taobao || {}));
const ALIAS = await rj('data/brand-aliases.json');
const FRAG = await rj('data/fragrance-aliases.json');

const LADDER = path.join(ROOT, 'data/.cache', `aff-ladder-${new Date().toISOString().slice(0, 10)}.json`);
const ladder = existsSync(LADDER) ? JSON.parse(await readFile(LADDER, 'utf8')) : { results: [] };
const ran = new Map((ladder.results || []).map((r) => [r.id, r]));
const VERIFY = path.join(ROOT, 'data/.cache', `aff-verify-${new Date().toISOString().slice(0, 10)}.json`);
const verify = existsSync(VERIFY) ? JSON.parse(await readFile(VERIFY, 'utf8')) : { rows: [] };
const rejBySecondGate = new Map((verify.rows || [])
  .filter((r) => r.verdict === 'ambiguous' || r.verdict === 'fail').map((r) => [r.id, r]));

const missing = perfumes.filter((p) => !has.has(p.id));

/* 合并系列（与 probe-aff-series.mjs 同一判据，前缀 2 词） */
const norm = (s) => String(s || '').toLowerCase().replace(/[’‘`´]/g, "'")
  .replace(/[^\p{L}\p{N}']+/gu, ' ').trim();
const pre = (p) => { const w = norm(p.name).split(' ').filter(Boolean); return w.length > 2 ? w.slice(0, 2).join(' ') : null; };
const grp = new Map();
for (const p of missing) { const k = p.brand + '||' + pre(p); if (k.endsWith('||null')) continue; grp.set(k, (grp.get(k) || 0) + 1); }
const isSeries = (p) => (grp.get(p.brand + '||' + pre(p)) || 0) >= 3;

const cat = {
  A_接口无结果: [],
  B_召回但判据拒: [],
  F_二次闸门拒收: [],
  C_可修_缺中文品牌别名: [],
  D_结构性_合并系列: [],
  E_未跑阶梯: [],
};
for (const p of missing) {
  const r = ran.get(p.id);
  const second = rejBySecondGate.get(p.id);
  /* 二次闸门优先判：接口召回了、scoreMatch 也接受了，但复核认定是同款/罗列页。
     这一类必须单列，不能混进 A（接口层面无结果）—— 性质完全不同。 */
  if (second) { cat.F_二次闸门拒收.push(p.id); continue; }
  if (isSeries(p) && !(r?.winner)) { cat.D_结构性_合并系列.push(p.id); continue; }
  if (!r) {
    const hasCnBrand = (ALIAS[p.brand] || []).some((s) => /[\u4e00-\u9fa5]/.test(s));
    const hasFrag = Boolean(FRAG[p.id]);
    if (!hasCnBrand || !hasFrag) cat.C_可修_缺中文品牌别名.push(p.id);
    else cat.E_未跑阶梯.push(p.id);
    continue;
  }
  const anyCand = (r.stages || []).some((s) => s.n > 0);
  if (!anyCand) cat.A_接口无结果.push(p.id);
  else cat.B_召回但判据拒.push(p.id);
}

for (const [k, v] of Object.entries(cat)) {
  console.log(`${k}: ${v.length}`);
}
console.log(`合计 ${Object.values(cat).reduce((a, b) => a + b.length, 0)} / 缺链 ${missing.length}`);
console.log(`\n跑过阶梯 ${ran.size} 瓶，命中 ${[...ran.values()].filter((r) => r.winner).length}`);

/* B 类细看：把这一批里"最后一层拒绝理由"归并 */
const why = new Map();
for (const id of cat.B_召回但判据拒) {
  const r = ran.get(id);
  const last = [...(r.stages || [])].reverse().find((s) => s.n > 0);
  const k = last ? last.verdict.replace(/（.*$/, '') : '(无)';
  why.set(k, (why.get(k) || 0) + 1);
}
console.log('\nB 类按最后拒绝理由：');
for (const [k, v] of [...why.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);

console.log('\n样本（各 5 条）：');
for (const [k, v] of Object.entries(cat)) console.log(`  ${k}: ${v.slice(0, 5).join(', ') || '—'}`);
