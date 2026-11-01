// 探针：matchPct 的分布与分母口径对比（G6 / D55）
// 用法：node scripts/probes/probe-matchpct.mjs
// 结论已写进 src/scoring.js 的 G6 注释与 docs/DECISIONS.md D55。
// 
// 它做三件事：
//   ① 按 10 个答题深度各跑 40 组随机答案，看第 1 名 matchPct 的 min/中位/max
//   ② 对比四个候选分母（现状 /275、按已答权重、按库内可达、收缩修正）
//   ③ 逐因子算库内最高贡献，确认"100% 是否可达"
// G6 分布：随机采样大量答案组合，看现有 /275 口径下 matchPct 的真实分布
import { readFile } from 'node:fs/promises';
import { buildProfile, scorePerfume, recommend, WEIGHTS, MATCH_PCT_MIN_DIMS as MIN_DIMS } from '../src/scoring.js';

const perf = JSON.parse(await readFile(new URL('../data/perfumes.json', import.meta.url), 'utf8'));
const tax = JSON.parse(await readFile(new URL('../data/taxonomy.json', import.meta.url), 'utf8'));
const PERFUMES = perf.perfumes || perf;

const SUM_ALL = Object.values(WEIGHTS).reduce((a, b) => a + Math.max(0, b), 0);
const FAM = tax.families.map((f) => f.id);
const OCC = tax.occasionMap.map((o) => o.id);
const EMO = tax.emotionMap.map((e) => e.id);
const SEASON = ['spring', 'summer', 'autumn', 'winter'];
const CONC = ['eau-de-toilette', 'eau-de-parfum', 'extrait'];
const TEMP = ['cool', 'warm', 'neutral'];

// 确定性伪随机，跑两次结果一致
let seed = 20261101;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

function makeAnswers(depth) {
  const a = { family: pick(FAM) };
  if (depth >= 1) a.intensity = 1 + Math.floor(rnd() * 5);
  if (depth >= 2) a.occasion = pick(OCC);
  if (depth >= 3) a.concentration = pick(CONC);
  if (depth >= 4) { a.season = pick(SEASON); a.seasonSecond = pick(SEASON); }
  if (depth >= 5) { a.temperature = pick(TEMP); a.sweetness = Math.floor(rnd() * 4); }
  if (depth >= 6) { a.character = pick(['clean', 'warm', 'sweet', 'fresh']); a.characterTags = [a.character]; }
  if (depth >= 7) a.longevity = Math.floor(rnd() * 5);
  if (depth >= 8) { a.emotion = pick(EMO); a.subfamily = (tax.families.find((f) => f.id === a.family)?.subfamilies || [{}])[0].id; }
  if (depth >= 9) a.likedNotes = ['rose'];
  return a;
}

console.log('旧分母（WEIGHTS 全部正项之和）=', SUM_ALL, '  ← 已不再使用，仅作对照');
console.log('新口径 = 逐因子库内可达之和，且激活维度需 >=', MIN_DIMS, '才显示');
console.log('');
console.log('=== 一、第 1 名 matchPct 随答题深度的分布（新口径）===');
console.log('深度 说明                     样本  第1名匹配度 min/中位/max   前三极差中位');
for (let depth = 0; depth <= 9; depth++) {
  const pcts = [];
  const gaps = [];
  for (let i = 0; i < 40; i++) {
    const a = makeAnswers(depth);
    try {
      const res = recommend(a, PERFUMES, tax);
      if (!res.results.length) continue;
      pcts.push(res.results[0].matchPct);
      const v = res.results.slice(0, 3).map((r) => r.matchPct);
      gaps.push(Math.max(...v) - Math.min(...v));
    } catch { /* 跳过无效组合 */ }
  }
  if (!pcts.length) continue;
  pcts.sort((x, y) => x - y);
  gaps.sort((x, y) => x - y);
  const label = ['只点香型', '+浓度', '+场合', '+浓度档', '+季节', '+冷暖甜度', '+气质', '+留香', '+情绪/小类', '+香调'][depth];
  console.log(
    String(depth).padEnd(5),
    label.padEnd(24),
    String(pcts.length).padEnd(5),
    `${pcts[0]} / ${pcts[Math.floor(pcts.length / 2)]} / ${pcts[pcts.length - 1]}`.padEnd(16),
    gaps[Math.floor(gaps.length / 2)] + '%'
  );
}

// 极值：找全库理论上第 1 名能到多高
console.log('');
console.log('');
console.log('=== 二、四个候选分母的对照（同一批答案，第 1 名中位）===');
/* 这一段是 D55 决策表的复现。
   A = 旧 /275（不区分答了什么）
   C = /已答因子的权重之和
   F = /库内逐因子可达之和（= 新口径，但不设证据门槛）
   G = F 向 50% 收缩，收缩系数 = min(1, 激活维度/12) */
const FACTOR_SRC = {
  family: ['family', 'emotion', 'occasion'], familyPick: ['family'],
  subfamilyHits: ['subfamily'], emotionNotes: ['emotion', 'likedNotes'],
  intensity: ['intensity'], season: ['season'], seasonSecond: ['seasonSecond'],
  timeOfDay: ['occasion'], likedNotes: ['likedNotes'],
  character: ['character', 'characterTags'], concentration: ['concentration'],
  longevity: ['longevity'], temperature: ['temperature'], sweetness: ['sweetness'],
  anchor: ['anchorPerfume', 'anchorNotes', 'anchorPerfumeNotes'], popularity: null,
};
const fw = (f) => (f === 'family'
  ? WEIGHTS.emotionFamily + WEIGHTS.occasionFamily : Math.max(0, WEIGHTS[f] || 0));
const NEGS = new Set(['dislikedNotes', 'dislikedFamily']);

console.log('深度    A/275    C/已答权   F/可达    G/收缩');
for (let depth = 0; depth <= 9; depth += 2) {
  const acc = { A: [], C: [], F: [], G: [] };
  for (let i = 0; i < 25; i++) {
    const a = makeAnswers(depth);
    const hasV = (k) => { const v = a[k]; if (v == null || v === '') return false; return Array.isArray(v) ? v.length > 0 : true; };
    const act = {};
    for (const [f, srcs] of Object.entries(FACTOR_SRC)) act[f] = srcs === null ? true : srcs.some(hasV);
    const actW = Object.entries(act).filter(([, v]) => v).reduce((s2, [f]) => s2 + fw(f), 0);
    const actN = Object.values(act).filter(Boolean).length;

    const profile = buildProfile(a, tax);
    const poolMax = {};
    const rows = [];
    for (const p of PERFUMES) {
      const r = scorePerfume(p, profile, tax);
      let pos = 0;
      for (const b of r.breakdown) {
        if (!b || typeof b.score !== 'number' || NEGS.has(b.factor) || !act[b.factor]) continue;
        pos += b.score;
        poolMax[b.factor] = Math.max(poolMax[b.factor] || 0, b.score);
      }
      rows.push({ score: r.score, pos });
    }
    rows.sort((x, y) => y.score - x.score);
    const top = rows[0];
    if (!top) continue;
    const reach = Object.values(poolMax).reduce((s2, v) => s2 + v, 0);
    const evid = Math.min(1, actN / 12);
    acc.A.push(top.score / SUM_ALL * 100);
    acc.C.push(actW ? top.pos / actW * 100 : 0);
    acc.F.push(reach ? top.pos / reach * 100 : 0);
    acc.G.push(reach ? 50 + (top.pos / reach * 100 - 50) * evid : 50);
  }
  const med = (arr) => { if (!arr.length) return NaN; const q = [...arr].sort((x, y) => x - y); return q[Math.floor(q.length / 2)]; };
  console.log(
    String(depth).padEnd(6),
    (med(acc.A).toFixed(0) + '%').padEnd(9),
    (med(acc.C).toFixed(0) + '%').padEnd(10),
    (med(acc.F).toFixed(0) + '%').padEnd(9),
    med(acc.G).toFixed(0) + '%'
  );
}
console.log('注：C 与 F 在深度 0 就到 90%+ —— 分母被砍到只剩那几项，数学自洽但读起来是虚假承诺。');
console.log('');

console.log('=== 单个因子在库内的实际最高贡献（决定"100% 是否可达"）===');
const oneAnswer = { family: 'floral', intensity: 3, occasion: 'commute', concentration: 'eau-de-parfum',
  season: 'spring', seasonSecond: 'autumn', temperature: 'cool', sweetness: 2,
  character: 'clean', characterTags: ['clean'], longevity: 3, emotion: 'cold',
  subfamily: 'rose', likedNotes: ['rose', 'bergamot'], anchorPerfume: 'creed-aventus' };
const prof = buildProfile(oneAnswer, tax);
const maxima = {};
for (const p of PERFUMES) {
  const r = scorePerfume(p, prof, tax);
  for (const b of r.breakdown) {
    if (!b || typeof b.score !== 'number' || b.factor === 'dislikedNotes' || b.factor === 'dislikedFamily') continue;
    maxima[b.factor] = Math.max(maxima[b.factor] || 0, b.score);
  }
}
let sum = 0;
for (const [k, v] of Object.entries(maxima).sort((a, b) => b[1] - a[1])) {
  const w = k === 'family' ? WEIGHTS.emotionFamily + WEIGHTS.occasionFamily : WEIGHTS[k];
  console.log(`  ${k.padEnd(16)} 库内最高 ${v.toFixed(1).padStart(6)}  权重 ${String(w).padStart(4)}  达成 ${w ? (v / w * 100).toFixed(0) + '%' : '-'}`);
  sum += v;
}
console.log(`  逐因子最高之和 = ${sum.toFixed(1)}（这是"每项都拿满分"的假想瓶，实际不存在）`);
console.log(`  占当前分母 ${SUM_ALL} 的 ${(sum / SUM_ALL * 100).toFixed(1)}%`);
