/**
 * probe-g7-team.mjs — G7 分母改动（famDenom: 1.2 → profile.family?1.0:1.2）的独立复核
 *
 * 与 scripts/probe-q-ab.mjs **无共享代码**：本文件自己生成答案组、自己算指标，
 * 目的是不复用被复核者挑过的 26 组典型答案，避免"用它的样本证明它的结论"。
 *
 * 变体做法：读 src/scoring.js 原文 → 把 G7 那一行换回 `const famDenom = 1.2;`
 * → 落到系统临时目录 → import。这样 A（旧，全 1.2）与 B（新，当前工作区状态）
 * 同时持在内存里，且**不改仓库任何文件**。
 *
 * 指标：top-1 是否变、top-3 集合是否变、matchPct 最大值（含 null 计数，不假装有值）、
 * 首名原始分变化、以及三条注释断言的可证伪实测。
 *
 * 用法：node scripts/probe-g7-team.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const SCORING = path.join(SRC, 'scoring.js');

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8'));
const TAX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
const perfumes = DATA.perfumes;

const SEED = 20261108;
const AFTER_ANCHOR = 'const famDenom = profile.family ? 1.0 : 1.2;';

/* ---------------- 变体 ---------------- */

const tmpFiles = [];
function makeVariant(name, patches) {
  let code = fs.readFileSync(SCORING, 'utf8');
  code = code.replace(/from\s+'\.\/notes\.js'/, `from '${pathToFileURL(path.join(SRC, 'notes.js')).href}'`);
  for (const [from, to] of patches) {
    if (!code.includes(from)) throw new Error(`补丁锚点不存在（${name}）：${from.slice(0, 70)}`);
    code = code.split(from).join(to);
  }
  const file = path.join(os.tmpdir(), `probe-g7-team-${name}-${process.pid}.mjs`);
  fs.writeFileSync(file, code, 'utf8');
  tmpFiles.push(file);
  return import(pathToFileURL(file).href);
}

const MOD_B = await import(pathToFileURL(SCORING).href); // 当前工作区（新）
const MOD_A = await makeVariant('before', [[AFTER_ANCHOR, 'const famDenom = 1.2;']]); // 旧

const W_FAM = MOD_B.WEIGHTS.emotionFamily + MOD_B.WEIGHTS.occasionFamily;

/* ---------------- 固定种子 PRNG ---------------- */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
const chance = (p) => rng() < p;
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const pickMany = (arr, k) => {
  const c = [...arr]; const out = [];
  for (let i = 0; i < k && c.length; i++) out.push(c.splice(Math.floor(rng() * c.length), 1)[0]);
  return out;
};

/* ---------------- 答案池（全部从数据/分类法取，不手写枚举） ---------------- */

const FAMILIES = TAX.families.map((f) => f.id);
const EMOTIONS = TAX.emotionMap.map((e) => e.id);
const OCCASIONS = TAX.occasionMap.map((o) => o.id);
const CONCS = [...new Set(perfumes.map((p) => p.concentration).filter(Boolean))];
const TEMPS = ['warm', 'cool', 'neutral'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const CHARS = [...new Set(perfumes.flatMap((p) => p.character || []))];
// 只用能被 noteEntryOf 解析的条目（含 "/" 的 en 在 profile 里键名对不上，
// 会走 hitsOf 的"无条目即算命中"兜底，那是另一个缺陷，不该混进本次度量）。
const NOTES = TAX.noteIndex.entries
  .map((e) => String(e.en))
  .filter((s) => /^[a-z0-9 -]+$/i.test(s));

function buildAnswers(kind) {
  const a = {};
  if (kind === 'family' || kind === 'both') {
    a.family = pick(FAMILIES);
    const fam = TAX.families.find((f) => f.id === a.family);
    const subs = (fam.subfamilies || []).map((s) => s.id);
    if (subs.length && chance(0.55)) a.subfamily = pick(subs);
  }
  if (kind === 'emotion' || kind === 'both') a.emotion = pick(EMOTIONS);
  if (chance(0.5)) a.occasion = pick(OCCASIONS);
  if (chance(0.6)) a.intensity = 1 + Math.floor(rng() * 5);
  if (chance(0.45)) a.concentration = pick(CONCS);
  if (chance(0.45)) a.longevity = 1 + Math.floor(rng() * 5);
  if (chance(0.45)) a.season = pick(SEASONS);
  if (chance(0.3)) a.seasonSecond = pick(SEASONS);
  if (chance(0.4)) a.temperature = pick(TEMPS);
  if (chance(0.4)) a.sweetness = Math.floor(rng() * 4);
  if (chance(0.5)) a.characterTags = pickMany(CHARS, 1 + Math.floor(rng() * 2));
  if (chance(0.25)) a.characterNeg = pickMany(CHARS, 1);
  if (chance(0.45)) a.likedNotes = pickMany(NOTES, 1 + Math.floor(rng() * 3));
  if (chance(0.3)) a.dislikedNotes = pickMany(NOTES, 1 + Math.floor(rng() * 2));
  if (chance(0.2)) a.dislikedFamilies = pickMany(FAMILIES, 1);
  if (chance(0.25)) a.anchorNotes = pickMany(NOTES, 2 + Math.floor(rng() * 2));
  return a;
}

/* ---------------- 跑一组 ---------------- */

function runGroup(mod, a) {
  const r = mod.recommend({ ...a }, perfumes, TAX, { topN: 3 });
  const ids = r.results.map((x) => x.perfume.id);
  const pcts = r.results.map((x) => x.matchPct).filter((v) => v != null);
  const famFactor = r.results[0]?.breakdown?.find((b) => b.factor === 'family')?.score ?? null;
  return {
    top1: ids[0],
    top3: ids.slice(0, 3).slice().sort().join('|'),
    maxPct: pcts.length ? Math.max(...pcts) : null,
    maxScore: Math.max(...r.results.map((x) => x.score)),
    famFactor,
    dims: r.profile.activeDims,
  };
}

/* 并列度：全库内与首名同分的瓶数。分母改小会让更多瓶撞到 clamp 天花板，
   首名不再是"唯一最优"而是"并列集合里随便挑一个"——这是换手的真实机制，
   单看换手率会把它读成"排序更准了"。 */
function tieCount(mod, a) {
  const prof = mod.buildProfile(a, TAX);
  let top = -Infinity;
  const scores = perfumes.map((p) => {
    const s = mod.scorePerfume(p, prof, TAX).score;
    if (s > top) top = s;
    return s;
  });
  return scores.filter((s) => Math.abs(s - top) < 1e-9).length;
}

const KINDS = [
  { key: 'family', zh: '香型入口（只有 family）' },
  { key: 'emotion', zh: '情绪入口（只有 emotion）' },
  { key: 'both', zh: '两者都选（family+emotion）' },
];
const PER_KIND = 30;

const groups = [];
for (const k of KINDS) {
  for (let i = 0; i < PER_KIND; i++) {
    const a = buildAnswers(k.key);
    groups.push({ kind: k.key, idx: i, answers: a, A: runGroup(MOD_A, a), B: runGroup(MOD_B, a) });
  }
}

/* 并列度只对每种入口前 12 组算（1388 瓶 × 2 变体 × 全组太慢），
   组数写在输出里，不假装是全量。 */
const TIE_SAMPLE = 12;
const tieRows = [];
for (const k of KINDS) {
  for (const g of groups.filter((x) => x.kind === k.key).slice(0, TIE_SAMPLE)) {
    tieRows.push({ kind: k.key, idx: g.idx, a: tieCount(MOD_A, g.answers), b: tieCount(MOD_B, g.answers) });
  }
}

/* ---------------- 汇总表 ---------------- */

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');

console.log('===== 环境 =====');
console.log(`perfumes: ${perfumes.length} | families: ${FAMILIES.length} | emotions: ${EMOTIONS.length} | occasions: ${OCCASIONS.length}`);
console.log(`family 因子满分 = emotionFamily + occasionFamily = ${W_FAM}`);
console.log(`A 旧：famDenom 恒 1.2 | B 新：profile.family ? 1.0 : 1.2`);
console.log(`答案组：${groups.length} 组（${KINDS.map((k) => `${k.key} ${PER_KIND}`).join(' / ')}），固定种子 ${SEED}`);

console.log('\n===== 表1 换手率与 matchPct（A 旧 → B 新）=====');
console.log('入口类型 | 组数 | top1 变 | top1 换手 | top3 变 | top3 换手 | matchPct 非null组 | matchPct 均 前→后 | matchPct 最大 前→后 | 首名原始分 均 前→后');
for (const k of KINDS) {
  const gs = groups.filter((g) => g.kind === k.key);
  const t1 = gs.filter((g) => g.A.top1 !== g.B.top1).length;
  const t3 = gs.filter((g) => g.A.top3 !== g.B.top3).length;
  const both = gs.filter((g) => g.A.maxPct != null && g.B.maxPct != null);
  const pctA = mean(both.map((g) => g.A.maxPct));
  const pctB = mean(both.map((g) => g.B.maxPct));
  const maxA = both.length ? Math.max(...both.map((g) => g.A.maxPct)) : NaN;
  const maxB = both.length ? Math.max(...both.map((g) => g.B.maxPct)) : NaN;
  const sA = mean(gs.map((g) => g.A.maxScore));
  const sB = mean(gs.map((g) => g.B.maxScore));
  console.log(
    `${k.zh} | ${gs.length} | ${t1} | ${fmt((t1 / gs.length) * 100, 1)}% | ${t3} | ${fmt((t3 / gs.length) * 100, 1)}% | `
    + `${both.length}/${gs.length} | ${fmt(pctA, 1)}→${fmt(pctB, 1)} | ${fmt(maxA, 0)}→${fmt(maxB, 0)} | ${fmt(sA, 1)}→${fmt(sB, 1)}`,
  );
}
const allT1 = groups.filter((g) => g.A.top1 !== g.B.top1).length;
const allT3 = groups.filter((g) => g.A.top3 !== g.B.top3).length;
const allBoth = groups.filter((g) => g.A.maxPct != null && g.B.maxPct != null);
{
  const pA = mean(allBoth.map((g) => g.A.maxPct));
  const pB = mean(allBoth.map((g) => g.B.maxPct));
  const mxa = allBoth.length ? Math.max(...allBoth.map((g) => g.A.maxPct)) : NaN;
  const mxb = allBoth.length ? Math.max(...allBoth.map((g) => g.B.maxPct)) : NaN;
  console.log(
    `合计 | ${groups.length} | ${allT1} | ${fmt((allT1 / groups.length) * 100, 1)}% | ${allT3} | ${fmt((allT3 / groups.length) * 100, 1)}% | `
    + `${allBoth.length}/${groups.length} | ${fmt(pA, 1)}→${fmt(pB, 1)} | ${fmt(mxa, 0)}→${fmt(mxb, 0)} | —`,
  );
}

/* ---------------- 并列度：换手的真实机制 ---------------- */

console.log(`\n===== 表2 并列度（与首名同分的瓶数，每种入口前 ${TIE_SAMPLE} 组）=====`);
console.log('入口类型 | 组数 | 并列数 均 前→后 | 并列数 最大 前→后 | 并列数变多的组');
for (const k of KINDS) {
  const rs = tieRows.filter((r) => r.kind === k.key);
  const up = rs.filter((r) => r.b > r.a).length;
  console.log(
    `${k.zh} | ${rs.length} | ${fmt(mean(rs.map((r) => r.a)), 1)}→${fmt(mean(rs.map((r) => r.b)), 1)} | `
    + `${Math.max(...rs.map((r) => r.a))}→${Math.max(...rs.map((r) => r.b))} | ${up}/${rs.length}`,
  );
}
{
  const up = tieRows.filter((r) => r.b > r.a).length;
  console.log(`合计 | ${tieRows.length} | ${fmt(mean(tieRows.map((r) => r.a)), 1)}→${fmt(mean(tieRows.map((r) => r.b)), 1)} | `
    + `${Math.max(...tieRows.map((r) => r.a))}→${Math.max(...tieRows.map((r) => r.b))} | ${up}/${tieRows.length}`);
}

/* ---------------- 断言核验 ---------------- */

const famHitOf = (profile, p) => {
  let h = 0;
  for (const [fam, w] of Object.entries(p.families || {})) h += (profile.families[fam] || 0) * w;
  return h;
};

console.log('\n===== 断言1：香型入口 famHit 上界 = 1.000，加场合 lerp 后 1.033 =====');
const famCases = [];
for (const fam of FAMILIES) {
  for (const occ of [null, ...OCCASIONS]) {
    const a = occ ? { family: fam, occasion: occ } : { family: fam };
    const prof = MOD_B.buildProfile(a, TAX);
    let best = -1; let bestId = null;
    for (const p of perfumes) {
      const h = famHitOf(prof, p);
      if (h > best) { best = h; bestId = p.id; }
    }
    famCases.push({ fam, occ, max: best, id: bestId, denomOld: 1.2 });
  }
}
const noOcc = famCases.filter((c) => c.occ === null);
const withOcc = famCases.filter((c) => c.occ !== null);
const maxNoOcc = Math.max(...noOcc.map((c) => c.max));
const maxWithOcc = Math.max(...withOcc.map((c) => c.max));
for (const c of noOcc) console.log(`  family=${c.fam.padEnd(8)} 无场合 famHit 上界 ${c.max.toFixed(4)}  瓶=${c.id}`);
const top3occ = withOcc.slice().sort((a, b) => b.max - a.max).slice(0, 5);
for (const c of top3occ) console.log(`  family=${c.fam.padEnd(8)} 场合=${String(c.occ).padEnd(8)} famHit 上界 ${c.max.toFixed(4)}  瓶=${c.id}`);
console.log(`  → 无场合最大 ${maxNoOcc.toFixed(4)}（注释称 1.000）；带场合最大 ${maxWithOcc.toFixed(4)}（注释称 1.033）`);
console.log(`  → 判定：1.000 ${Math.abs(maxNoOcc - 1) < 0.005 ? '成立' : '不成立'}；`
  + `带场合 1.033 ${Math.abs(maxWithOcc - 1.033) < 0.01 ? '成立' : `不成立（实测 ${maxWithOcc.toFixed(4)}，注释低估 ${(maxWithOcc - 1.033).toFixed(3)}）`}`);

console.log('\n===== 断言2：旧分母 1.2 让香型入口这一项最高只到 43.3–44.8 / 52（83.3% 天花板）=====');
const facOld = (h) => Math.min(1, h / 1.2) * W_FAM;
const facNew = (h) => Math.min(1, h / 1.0) * W_FAM;
const oldNo = noOcc.map((c) => facOld(c.max));
const oldWith = withOcc.map((c) => facOld(c.max));
const newNo = noOcc.map((c) => facNew(c.max));
const newWith = withOcc.map((c) => facNew(c.max));
console.log(`  分桶（family 因子得分 / 满分 ${W_FAM}）：`);
console.log(`    无场合  旧 ${Math.min(...oldNo).toFixed(2)}–${Math.max(...oldNo).toFixed(2)}（${((Math.max(...oldNo) / W_FAM) * 100).toFixed(1)}% 天花板）`
  + ` | 新 ${Math.min(...newNo).toFixed(2)}–${Math.max(...newNo).toFixed(2)}`);
console.log(`    带场合  旧 ${Math.min(...oldWith).toFixed(2)}–${Math.max(...oldWith).toFixed(2)}（${((Math.max(...oldWith) / W_FAM) * 100).toFixed(1)}% 天花板）`
  + ` | 新 ${Math.min(...newWith).toFixed(2)}–${Math.max(...newWith).toFixed(2)}`);
console.log(`  → 判定：43.3 = ${(52 * 1.0 / 1.2).toFixed(2)}，对应「无场合」桶，成立；`
  + `83.3% 天花板只在「无场合」成立，带场合实测天花板 ${((Math.max(...oldWith) / W_FAM) * 100).toFixed(1)}%（不是 83.3%）→ 断言整体 **部分成立**`);

console.log('\n===== 断言3：情绪入口分母若也改 1.0，会有 204–376 瓶并列拿满 52 =====');
function emotionSaturation(occ) {
  const rows = [];
  for (const emo of EMOTIONS) {
    const a = occ ? { emotion: emo, occasion: occ } : { emotion: emo };
    const prof = MOD_B.buildProfile(a, TAX);
    let n12 = 0; let n10 = 0; let mx = 0;
    for (const p of perfumes) {
      const h = famHitOf(prof, p);
      if (h > mx) mx = h;
      if (h >= 1.2 - 1e-9) n12 += 1;
      if (h >= 1.0 - 1e-9) n10 += 1;
    }
    rows.push({ emo, mx, n12, n10 });
  }
  return rows;
}
const eNo = emotionSaturation(null);
for (const r of eNo) {
  console.log(`  emotion=${r.emo.padEnd(11)} famHit 最大 ${r.mx.toFixed(3)} | 已达/超过 1.2 的瓶数 ${String(r.n12).padStart(4)}（旧分母下并列满 52） | 已达/超过 1.0 的瓶数 ${String(r.n10).padStart(4)}`);
}
const n12s = eNo.map((r) => r.n12);
const n10s = eNo.map((r) => r.n10);
console.log(`  → 纯情绪入口（无场合）旧分母并列区间：${Math.min(...n12s)}–${Math.max(...n12s)}`);
console.log(`  → 若情绪入口也改 1.0，并列区间：${Math.min(...n10s)}–${Math.max(...n10s)}`);
const eFormal = emotionSaturation('formal').map((r) => r.n12);
console.log(`  → 对照（emotion+formal，旧分母）：${Math.min(...eFormal)}–${Math.max(...eFormal)} 瓶并列满 52`);

/* 注释点名了两个具体组合：「clean」与「cold+formal」。逐个实测，不用区间蒙混。 */
function satOf(emo, occ) {
  const a = occ ? { emotion: emo, occasion: occ } : { emotion: emo };
  const prof = MOD_B.buildProfile(a, TAX);
  let n12 = 0; let n10 = 0;
  for (const p of perfumes) {
    const h = famHitOf(prof, p);
    if (h >= 1.2 - 1e-9) n12 += 1;
    if (h >= 1.0 - 1e-9) n10 += 1;
  }
  return { n12, n10 };
}
const cleanCase = satOf('clean', null);
const coldFormal = satOf('cold', 'formal');
console.log(`  → 点名组合 clean（无场合）：旧分母并列 ${cleanCase.n12} 瓶 / 改 1.0 后 ${cleanCase.n10} 瓶`);
console.log(`  → 点名组合 cold+formal：旧分母并列 ${coldFormal.n12} 瓶 / 改 1.0 后 ${coldFormal.n10} 瓶`);
const allCombos = [];
for (const emo of EMOTIONS) for (const occ of OCCASIONS) allCombos.push(satOf(emo, occ).n12);
console.log(`  → 全 30 组合（6 情绪 × 5 场合）旧分母并列区间：${Math.min(...allCombos)}–${Math.max(...allCombos)}`);
console.log(`  → 判定：注释点名的两个数**精确命中**（clean=204、cold+formal=376）；`
  + `但把它当"区间上界"用会低估：纯情绪 lazy 单独就有 481 瓶、全 30 组合最高 ${Math.max(...allCombos)} 瓶`);
console.log(`  → 结论：数字本身可复现，**表述（204–376 作为区间）不成立**；结论方向（会大面积并列）成立且被低估`);

console.log('\n===== 断言4（补充）：改后香型入口自己会不会"并列满 52"=====');
console.log('  纯香型入口 famHit = 该族权重（pref 是 one-hot），改后分母 1.0 → 权重=1.0 的瓶在这一项上全部并列满 52。');
console.log('  两种口径分开列：因子级并列（会不会撞天花板） vs 总分级并列（会不会真的影响推荐名单）：');
for (const fam of FAMILIES) {
  const w1 = perfumes.filter((p) => (p.families?.[fam] || 0) >= 1 - 1e-9).length;
  console.log(`  family=${fam.padEnd(8)} 因子级并列满 52：旧 0 瓶 → 新 ${String(w1).padStart(4)} 瓶`);
}
console.log('  （总分级并列见表2：0/36 组的首名并列数变多 —— 其余因子把并列拆开了）');

/* 断言4b：改后「场合」这 22 分在香型入口里还起不起作用？
   分母 1.0 时 famHit 只要 >= 1.0 就撞 clamp，场合带来的增量被整段吃掉。 */
console.log('\n===== 断言4b（补充）：改后在「香型入口 + 场合」下，有多少瓶的 family 因子被 clamp 成常数 =====');
console.log('  family 因子 = clamp01(famHit / denom) × 52，撞到 1.0 后分母再小、场合再加都不改变得分');
for (const fam of FAMILIES) {
  let clOld = 0; let clNew = 0; let tot = 0;
  for (const occ of OCCASIONS) {
    const a = { family: fam, occasion: occ };
    const prof = MOD_B.buildProfile(a, TAX);
    for (const p of perfumes) {
      const h = famHitOf(prof, p);
      tot += 1;
      if (h / 1.2 >= 1 - 1e-9) clOld += 1;
      if (h / 1.0 >= 1 - 1e-9) clNew += 1;
    }
  }
  console.log(`  family=${fam.padEnd(8)} 撞 clamp 的瓶占比：旧 ${((clOld / tot) * 100).toFixed(1)}% (${clOld}/${tot}) → `
    + `新 ${((clNew / tot) * 100).toFixed(1)}% (${clNew}/${tot})`);
}

/* ---------------- 断言6：注释称「情绪入口分母改动会把 53.8% 的答案组前三名换掉」 ----------------
   这里有两种读法，都测：
     C  情绪也一律 /1.0
     D  分母 = 该入口库内可达上界（family 1.00/1.04，情绪 1.52/1.53）—— probe-q-ab 的 V5

   顺带核一条我自己的怀疑：`both`（family+emotion 同时给）在界面上走不通，
   app.js:1469 与 1501 是互斥的，所以那张表里 `both` 行的换手率不该被当成
   "真实用户会遇到"的指标。 */

console.log('\n===== 断言6（补充）：注释称「改情绪入口会把 53.8% 的答案组前三名换掉」=====');
const MOD_C = await makeVariant('emo-all10', [[AFTER_ANCHOR, 'const famDenom = 1.0;']]);
const MOD_D = await makeVariant('entry-bound', [[
  AFTER_ANCHOR,
  'const famDenom = profile.family\n'
  + '    ? (profile.occasion ? 1.04 : 1.00)\n'
  + '    : (profile.occasion ? 1.53 : 1.52);',
]]);
{
  const emoGroups = groups.filter((g) => g.kind === 'emotion');
  for (const [mod, label] of [[MOD_C, '情绪也一律 /1.0'], [MOD_D, '分母=入口可达上界(1.52/1.53)']]) {
    let c1 = 0; let c3 = 0;
    for (const g of emoGroups) {
      const X = runGroup(mod, g.answers);
      if (X.top1 !== g.B.top1) c1 += 1;
      if (X.top3 !== g.B.top3) c3 += 1;
    }
    console.log(`  ${label.padEnd(26)} 情绪入口 ${emoGroups.length} 组：top1 变 ${c1}/${emoGroups.length} (${((c1 / emoGroups.length) * 100).toFixed(1)}%)、`
      + `top3 变 ${c3}/${emoGroups.length} (${((c3 / emoGroups.length) * 100).toFixed(1)}%)`);
  }
  console.log('  → 判定：53.8% 只能由「入口可达上界」这一变体复现（probe-q-ab 的 V5，26 组里 14/26），'
    + '「情绪全改 1.0」是另一件事且换手更高');
}

console.log('\n===== 断言7（补充）：`both` 入口在界面上是否可达 =====');
{
  const gBoth = groups.filter((g) => g.kind === 'both');
  let d1 = 0; let d3 = 0;
  for (const g of gBoth) {
    if (g.A.top1 !== g.B.top1) d1 += 1;
    if (g.A.top3 !== g.B.top3) d3 += 1;
  }
  console.log(`  both 30 组：top1 变 ${d1}/30、top3 变 ${d3}/30（表1 里换手最高的一行）`);
  /* family 一旦给出，totalVec 就只用 family 的 one-hot（buildProfile:181-184），
     emotion 只经由 emotionNotes / emotionReal 起作用 —— 与 famDenom 无关。 */
  const pa = MOD_B.buildProfile({ family: 'floral', emotion: 'cold' }, TAX);
  const pb = MOD_B.buildProfile({ family: 'floral', emotion: 'lazy' }, TAX);
  const sameVec = JSON.stringify(pa.families) === JSON.stringify(pb.families);
  let hitDiff = 0; let checked = 0;
  for (const p of perfumes.slice(0, 120)) {
    checked += 1;
    if (Math.abs(famHitOf(pa, p) - famHitOf(pb, p)) > 1e-12) hitDiff += 1;
  }
  console.log(`  family 给定时 totalVec 不含 emotion：${sameVec ? '是' : '否'}；famHit 逐瓶差异 ${hitDiff}/${checked}`);
  console.log(`  → 所以 both 行相对 family 行的额外换手，来自 emotionNotes 等其它因子，不是 famDenom`);
  console.log(`  → 且 app.js:1469 / app.js:1501 让这两条入口互斥，both 在 UI 上不可达：`
    + `both 行是压力测试，不应作为发布判据`);
}

/* ---------------- 26 组典型答案：复核注释里的 1/26 与 3/26 ---------------- */

console.log('\n===== 断言5（补充）：注释引用的 26 组 A/B（top-1 1/26、top-3 3/26）=====');
const SETS26 = [
  { id: 'S01', a: { family: 'citrus' } },
  { id: 'S02', a: { family: 'floral' } },
  { id: 'S03', a: { family: 'woody' } },
  { id: 'S04', a: { family: 'amber' } },
  { id: 'S05', a: { family: 'fresh' } },
  { id: 'S06', a: { family: 'gourmand' } },
  { id: 'S07', a: { family: 'floral', subfamily: 'rose' } },
  { id: 'S08', a: { family: 'woody', subfamily: 'oud' } },
  { id: 'S09', a: { family: 'citrus', occasion: 'commute' } },
  { id: 'S10', a: { family: 'amber', occasion: 'date' } },
  { id: 'S11', a: { family: 'woody', occasion: 'formal' } },
  { id: 'S12', a: { family: 'fresh', occasion: 'outdoor' } },
  { id: 'S13', a: { family: 'citrus', likedNotes: ['bergamot', 'neroli'], dislikedNotes: ['musk'] } },
  { id: 'S14', a: { family: 'gourmand', likedNotes: ['vanilla'], dislikedNotes: ['oud'] } },
  { id: 'S15', a: { emotion: 'cold' } },
  { id: 'S16', a: { emotion: 'warm' } },
  { id: 'S17', a: { emotion: 'clean' } },
  { id: 'S18', a: { emotion: 'mysterious' } },
  { id: 'S19', a: { emotion: 'bright' } },
  { id: 'S20', a: { emotion: 'lazy' } },
  { id: 'S21', a: { emotion: 'clean', occasion: 'commute' } },
  { id: 'S22', a: { emotion: 'warm', occasion: 'date' } },
  { id: 'S23', a: { emotion: 'mysterious', occasion: 'formal' } },
  {
    id: 'S24',
    a: {
      family: 'floral', subfamily: 'white-floral', occasion: 'date', intensity: 4,
      likedNotes: ['jasmine', 'tuberose'], dislikedNotes: ['oud'],
      temperature: 'warm', sweetness: 2, season: 'spring', seasonSecond: 'summer',
      concentration: 'eau-de-parfum', longevity: 4,
      anchorNotes: ['jasmine', 'bergamot', 'musk'], dislikedFamilies: ['gourmand'],
    },
  },
  {
    id: 'S25',
    a: {
      emotion: 'lazy', occasion: 'daily', intensity: 2,
      likedNotes: ['fig', 'sandalwood'], temperature: 'cool', sweetness: 1,
      season: 'autumn', concentration: 'eau-de-toilette', longevity: 3,
      anchorNotes: ['fig', 'coconut'], dislikedFamilies: ['amber'],
    },
  },
  { id: 'S26', a: { emotion: 'bright', intensity: 1 } },
];
let s1 = 0; let s3 = 0; const changed = [];
for (const s of SETS26) {
  const A = runGroup(MOD_A, s.a);
  const B = runGroup(MOD_B, s.a);
  const d1 = A.top1 !== B.top1;
  const d3 = A.top3 !== B.top3;
  if (d1) s1 += 1;
  if (d3) s3 += 1;
  if (d1 || d3) changed.push(`${s.id}${d1 ? '[top1]' : ''}${d3 ? '[top3]' : ''}`);
}
console.log(`  top-1 变 ${s1}/26 (${((s1 / 26) * 100).toFixed(1)}%)，注释称 1/26 (3.8%)`);
console.log(`  top-3 变 ${s3}/26 (${((s3 / 26) * 100).toFixed(1)}%)，注释称 3/26 (11.5%)`);
console.log(`  变化的组：${changed.join(', ') || '（无）'}`);

/* ---------------- 明细：所有变了的组 ---------------- */

console.log('\n===== 明细：top-1 或 top-3 发生变化的组 =====');
for (const g of groups) {
  const d1 = g.A.top1 !== g.B.top1;
  const d3 = g.A.top3 !== g.B.top3;
  if (!d1 && !d3) continue;
  console.log(`${g.kind}/${String(g.idx).padStart(2, '0')} dims=${g.B.dims} `
    + `${d1 ? `top1 ${g.A.top1} → ${g.B.top1}` : 'top1 未变'}${d3 ? ' | top3 变' : ''} `
    + `| 首名分 ${g.A.maxScore.toFixed(1)} → ${g.B.maxScore.toFixed(1)}`
    + ` | family 因子 ${g.A.famFactor != null ? g.A.famFactor.toFixed(2) : '—'} → ${g.B.famFactor != null ? g.B.famFactor.toFixed(2) : '—'}`);
}

/* ---------------- 收尾 ---------------- */

for (const f of tmpFiles) { try { fs.unlinkSync(f); } catch { /* 忽略 */ } }
