/**
 * probe-step6-options.mjs — 第 6 步三种处置方案的实测对比
 *
 * 背景：第 6 步「整族排除」在家族入口下几乎无效（榜内换人 0.34/10）。
 * 根因是候选池被 isDominant 过滤成 100% 本族，而扣分条件要求「该族 = 这瓶的主族」。
 *
 * 本脚本把三种方案都跑一遍，给出各自对排序的实际影响：
 *   A 现状      —— 什么都不改（基准）
 *   B 放宽扣分   —— 扣分条件从「该族 = 主族」放宽到「该族权重 ≥ 0.5」
 *   C 改问法     —— 家族入口下改问「除你选的族以外」，即把本族从可选项里去掉
 *
 * 注意：本脚本**只模拟**，不改 scoring.js。B 的实现是在拿到 recommend 结果后
 * 手工重算分数（因为 recommend 内部已经做了扣分），所以 B 的 top-3 是近似值：
 * 真正的 B 会改变 scored 排序再取 topN，这里只做「同池重排」的估计。
 *
 * 用法：node scripts/probe-step6-options.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8')).perfumes;
const TAX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
const S = await import(pathToFileURL(path.join(ROOT, 'src', 'scoring.js')).href);

const mainKey = (o) => {
  const e = Object.entries(o || {}).filter(([k]) => k !== '_');
  e.sort((a, b) => b[1] - a[1]);
  return e[0] ? e[0][0] : null;
};
const PLURAL = { citrus: '柑橘', floral: '花香', woody: '木质', amber: '东方琥珀', fresh: '清新', gourmand: '美食' };

/* ---------------- 方案实现 ---------------- */

/** A 现状：直接调 recommend */
function planA(answers, topN) {
  return S.recommend(answers, P, TAX, { topN }).results.map((x) => ({
    id: x.perfume.id, name: x.perfume.name, score: x.score, main: mainKey(x.perfume.families),
  }));
}

/** B 放宽：在 recommend 给出的候选池上，对「该族权重 ≥ 0.5」的瓶子补扣 */
function planB(answers, topN) {
  const dl = answers.dislikedFamilies || [];
  /* 先拿一个不带排除的结果，避免 recommend 内部已扣过一次 */
  const plain = S.recommend({ ...answers, dislikedFamilies: [] }, P, TAX, { topN: 60 }).results;
  const adjusted = plain.map((x) => {
    const fams = x.perfume.families || {};
    const hits = dl.filter((f) => (fams[f] || 0) >= 0.5);
    return {
      id: x.perfume.id, name: x.perfume.name,
      brand: x.perfume.brand,
      familySource: x.perfume.familySource,
      score: x.score - hits.length * 30,
      main: mainKey(fams), hits: hits.length,
    };
  });
  /* 重排后取 topN，多样性去重口径与原实现一致（按 familySource + brand，不是按主族） */
  adjusted.sort((a, b) => b.score - a.score);
  const out = []; const seenFam = new Set(); const seenBrand = new Set();
  for (const s of adjusted) {
    if (out.length >= topN) break;
    if (seenFam.has(s.familySource) || seenBrand.has(s.brand)) continue;
    seenFam.add(s.familySource); seenBrand.add(s.brand); out.push(s);
  }
  /* 第一轮放宽：允许同源家族，仍不许同品牌 */
  if (out.length < topN) {
    const brandsNow = new Set(out.map((x) => x.brand));
    for (const s of adjusted) {
      if (out.length >= topN) break;
      if (out.includes(s) || brandsNow.has(s.brand)) continue;
      brandsNow.add(s.brand); out.push(s);
    }
  }
  return out;
}

/** C 改问法：家族入口下，把本族从「可排除」里去掉（UI 层改动，打分不变） */
function planC(answers, topN) {
  return planA(answers, topN);
}

/* ---------------- 对比 ---------------- */

const CASES = [
  { label: '家族 floral，排除 woody', a: { family: 'floral', dislikedFamilies: ['woody'] } },
  { label: '家族 floral，排除 fresh', a: { family: 'floral', dislikedFamilies: ['fresh'] } },
  { label: '家族 woody，排除 amber', a: { family: 'woody', dislikedFamilies: ['amber'] } },
  { label: '家族柑橘，排除美食', a: { family: 'citrus', dislikedFamilies: ['gourmand'] } },
  { label: '情绪 cold，排除 fresh', a: { emotion: 'cold', dislikedFamilies: ['fresh'] } },
];

console.log('=== 第 6 步三种方案对 top-3 的实际影响 ===\n');

for (const c of CASES) {
  const noFilter = planA({ ...c.a, dislikedFamilies: [] }, 3);
  const a = planA(c.a, 3);
  const b = planB(c.a, 3);

  const sig = (list) => list.map((x) => x.id).join(',');
  const sameNoFilter = sig(noFilter) === sig(a);
  const sameA = sig(a) === sig(b);

  console.log(`【${c.label}】`);
  console.log(`  不排除     : ${noFilter.map((x) => `${x.name}(${x.score.toFixed(1)})`).join('  ')}`);
  console.log(`  A 现状     : ${a.map((x) => `${x.name}(${x.score.toFixed(1)})`).join('  ')}` +
    (sameNoFilter ? '   ← 与不排除完全相同，这一步白问' : ''));
  console.log(`  B 放宽扣分 : ${b.map((x) => `${x.name}(${x.score.toFixed(1)})${x.hits ? '✳' : ''}`).join('  ')}` +
    (sameA ? '   ← 与 A 相同' : '   ← 与 A 不同'));
  console.log('');
}

/* ---------------- 汇总数字 ---------------- */

console.log('=== 各家族「第 6 步可作用瓶数」 ===');
console.log('（L1 = 主族是该族的瓶子；L2 = 该族权重 ≥0.5 的瓶子。第 6 步只能作用于 L1 之外的瓶子）\n');
for (const f of TAX.families) {
  const l1 = P.filter((p) => mainKey(p.families) === f.id).length;
  const l2 = P.filter((p) => (p.families || {})[f.id] >= 0.5).length;
  const notMain = P.filter((p) => (p.families || {})[f.id] >= 0.5 && mainKey(p.families) !== f.id).length;
  console.log(`  ${f.zh.padEnd(8)} L1=${String(l1).padStart(4)}  L2=${String(l2).padStart(4)}  可作用 ${String(notMain).padStart(3)} 瓶`);
}

console.log('\n=== 30 种「选一族 + 排除另一族」组合的汇总 ===');
{
  const F = TAX.families.map((f) => f.id);
  let total = 0, changedA = 0, changedB = 0;
  for (const fam of F) {
    for (const df of F) {
      if (df === fam) continue;
      const a = { family: fam, dislikedFamilies: [df] };
      const no = S.recommend({ ...a, dislikedFamilies: [] }, P, TAX, { topN: 3 }).results.map((x) => x.perfume.id).join(',');
      const A = S.recommend(a, P, TAX, { topN: 3 }).results.map((x) => x.perfume.id).join(',');
      const B = planB(a, 3).map((x) => x.id).join(',');
      total++;
      if (A !== no) changedA++;
      if (B !== no) changedB++;
    }
  }
  console.log(`  A 现状 改了 top-3 的组合: ${changedA}/${total}`);
  console.log(`  B 放宽 改了 top-3 的组合: ${changedB}/${total}`);
}

console.log('\n=== 结论 ===');
console.log('A（现状）：家族入口下 0/30 组合会改变结果 —— 这一屏对家族入口用户完全白问。');
console.log('B（放宽扣分）：30 种组合里 10 种会改 top-3。有效，但两个代价：');
console.log('   ① 每族有 63–170 瓶「别族权重≥0.5」的候选会被 -30，对"只带一点"过重；');
console.log('   ② 情绪入口本来已生效，放宽后会连带改变它的结果（实测 cold/排除 fresh 三瓶全换）。');
console.log('   建议：B 只在 profile.family 存在时生效，情绪入口保持原规则 → 情绪侧零回归。');
console.log('C（改问法）：不改打分，只让这一屏说得通。用户点了一样没效果 —— 是欺骗，不是修复。');
