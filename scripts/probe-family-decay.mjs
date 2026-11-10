/**
 * probe-family-decay.mjs — 第 2 步实验：家族命中按 1/√n 衰减，值不值得？
 *
 * 背景（CONTROL.md §2 真问题 1）：数据源给每瓶中位数挂 3 个家族（满格 6），
 * 只挂 1 个的仅 188 瓶（14%）。原式 `famHit += pref * w` 是纯点积，
 * 挂得越多越容易拿分：一瓶 woody 1.0 + fresh 0.5 + floral 0.2，在只想要 woody
 * 的用户那里也吃到 1.0，和一瓶纯木质打平。
 *
 * 本脚本用**同一份金标准**（scripts/lib/gold-portraits.mjs）跑多种衰减指数 p
 * （contribution = pref * w * n^(−p)，n = 该瓶所挂家族数），输出全局命中率与
 * 逐画像变化，回答「衰减能不能换来更好的排序」。
 *
 * 为什么走 src/scoring.js 的 opts.familyDecay 而不是改源码：改前改后两组数字
 * 必须出自同一份代码，否则 commit 之间的无关改动会混进结论。p=0 与历史行为逐位一致。
 *
 * 用法:
 *   node scripts/probe-family-decay.mjs            # 0 / 0.25 / 0.5 / 1.0 四档对比
 *   node scripts/probe-family-decay.mjs 0 0.5      # 指定档位
 *
 * 结论（2026-11-10 实测）：p=0.5 让 MAJORITY 2/12 → 0/12，全局退化，方案弃用。
 * 详见 docs/EXPERIMENT-FAMILY-DECAY.md。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recommend } from '../src/scoring.js';
import { PORTRAITS } from './lib/gold-portraits.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8'));
const TAX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
const perfumes = DATA.perfumes;
const byId = new Map(perfumes.map((p) => [p.id, p]));

const argv = process.argv.slice(2).filter((a) => /^[0-9.]+$/.test(a));
const POWERS = argv.length ? argv.map(Number) : [0, 0.25, 0.5, 1.0];

/* 金标准 id 必须都在池内 —— 缺一个就说明香水库被换过，后面的数字全部无意义 */
for (const port of PORTRAITS) {
  for (const id of port.gold) {
    if (!byId.has(id)) throw new Error(`${port.id} 的金标准 id 不在香水库里: ${id}`);
  }
}

function runOne(power) {
  const rows = [];
  for (const port of PORTRAITS) {
    const r = recommend(port.answers, perfumes, TAX, { topN: 5, familyDecay: power });
    const top = r.results.map((x) => x.perfume.id);
    const hits3 = top.slice(0, 3).filter((id) => port.gold.includes(id));
    rows.push({
      id: port.id,
      top,
      hits3: hits3.length,
      top1Hit: port.gold.includes(top[0]),
      maj: hits3.length >= 2,
    });
  }
  return {
    power,
    rows,
    maj: rows.filter((x) => x.maj).length,
    strict: rows.filter((x) => x.top1Hit).length,
  };
}

/* n 分布：说明衰减波及多少瓶 */
const ndist = {};
for (const p of perfumes) {
  const n = Object.entries(p.families || {}).filter(([, w]) => w > 0).length;
  ndist[n] = (ndist[n] || 0) + 1;
}

const N = PORTRAITS.length;
console.log('');
console.log(`金标准 ${N} 画像 · 香水库 ${perfumes.length} 瓶`);
console.log(`所挂家族数分布: ${Object.entries(ndist).map(([k, v]) => `n=${k}:${v}`).join('  ')}`);
console.log('');

const results = POWERS.map(runOne);
const base = results.find((r) => r.power === 0) || results[0];

console.log('衰减指数  衰减系数(n=2/3/4)   MAJORITY      STRICT        Δ vs p=0');
console.log('-'.repeat(84));
for (const r of results) {
  const coef = [2, 3, 4]
    .map((n) => (r.power > 0 ? (1 / Math.pow(n, r.power)).toFixed(2) : '1.00'))
    .join('/');
  const dM = r.maj - base.maj;
  const dS = r.strict - base.strict;
  const fmt = (d) => (d > 0 ? `+${d}` : d === 0 ? '±0' : `${d}`);
  console.log(
    `p=${String(r.power).padEnd(6)}  ${coef.padEnd(20)} ${String(r.maj + '/' + N).padEnd(13)} ` +
      `${String(r.strict + '/' + N).padEnd(13)} MAJ ${fmt(dM)} · STR ${fmt(dS)}`,
  );
}
console.log('-'.repeat(84));

/* 逐画像变化：只列与 p=0 不同的，避免 12 行噪音 */
console.log('');
console.log('逐画像变化（只列与 p=0 不同的）：');
let any = false;
for (let i = 1; i < results.length; i++) {
  const r = results[i];
  const diffs = r.rows
    .map((x, k) => ({ id: x.id, a: base.rows[k].hits3, b: x.hits3, a1: base.rows[k].top1Hit, b1: x.top1Hit }))
    .filter((d) => d.a !== d.b || d.a1 !== d.b1);
  if (!diffs.length) continue;
  any = true;
  const parts = diffs.map((d) => {
    const hit = d.a === d.b ? '' : `top3 命中 ${d.a}→${d.b}`;
    const top1 = d.a1 === d.b1 ? '' : `top1 ${d.a1 ? '✓' : '·'}→${d.b1 ? '✓' : '·'}`;
    return `${d.id}(${[hit, top1].filter(Boolean).join(', ')})`;
  });
  console.log(`  p=${r.power}: ` + parts.join('  '));
}
if (!any) console.log('  （各档位与 p=0 完全一致）');

/* 恶化样本：p=0 时 top1 是 gold，衰减后掉出 top3 —— 用来解释"为什么错" */
for (const r of results.filter((x) => x.power > 0)) {
  const lost = r.rows
    .map((x, k) => ({ id: x.id, was: base.rows[k], now: x }))
    .filter((d) => d.was.top1Hit && !d.now.top1Hit);
  if (!lost.length) continue;
  console.log('');
  console.log(`p=${r.power} 丢失 top1 的画像：`);
  for (const d of lost) {
    console.log(`  ${d.id}: 原 top1 = ${d.was.top[0]}（gold）`);
    console.log(`        现 top3 = ${d.now.top.slice(0, 3).join(', ')}`);
  }
}

console.log('');
console.log(`FAMILY DECAY base(p=0) MAJORITY ${base.maj}/${N} STRICT ${base.strict}/${N}`);
