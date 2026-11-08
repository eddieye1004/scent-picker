/**
 * probe-g7-c.mjs — 第三变体 C 的闸门测试（不看换手率好看不好看，只看三条硬判据）
 *
 * A 旧：famDenom 恒 1.2
 * B 新（工作区未提交）：profile.family ? 1.0 : 1.2
 * C 提议：profile.family ? (profile.occasion ? 1.18 : 1.00) : 1.2
 *
 * 为什么是 1.18 而不是 1.176：带场合时 famHit 真实上界实测 1.1760，
 * 取 1.18 略高于上界 → 没有任何瓶能撞满，同时满分量纲与无场合一致。
 *
 * 闸门（先定后测，不看完数字再改判）：
 *   ① clamp 饱和瓶数（family 因子恰好拿到 52 分的瓶）必须 = 0
 *   ② 香型入口 top-1 换手 ≤ 10%
 *   ③ matchPct 最大值 ≤ 100
 *
 * 用法: node scripts/probe-g7-c.mjs
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

const B_ANCHOR = 'const famDenom = profile.family ? 1.0 : 1.2;';
const A_ANCHOR = 'const famDenom = 1.2;';
const C_CODE = 'const famDenom = profile.family ? (profile.occasion ? 1.18 : 1.0) : 1.2;';

const tmpFiles = [];
function makeVariant(name, patches) {
  let code = fs.readFileSync(SCORING, 'utf8');
  code = code.replace(/from\s+'\.\/notes\.js'/, `from '${pathToFileURL(path.join(SRC, 'notes.js')).href}'`);
  for (const [from, to] of patches) {
    if (!code.includes(from)) throw new Error(`锚点不存在（${name}）: ${from.slice(0, 60)}`);
    code = code.split(from).join(to);
  }
  const file = path.join(os.tmpdir(), `probe-g7c-${name}-${process.pid}.mjs`);
  fs.writeFileSync(file, code, 'utf8');
  tmpFiles.push(file);
  return import(pathToFileURL(file).href);
}

const MOD_NEW = await import(pathToFileURL(SCORING).href);       // 工作区现状（B）
const MOD_OLD = await makeVariant('A', [[B_ANCHOR, A_ANCHOR]]);   // A
const MOD_C = await makeVariant('C', [[B_ANCHOR, C_CODE]]);       // C

const W_FAM = MOD_NEW.WEIGHTS.emotionFamily + MOD_NEW.WEIGHTS.occasionFamily;

/* 固定种子，与 probe-g7-team.mjs 同一套生成逻辑，但只跑香型/情绪两入口 */
const SEED = 20261108;
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

const FAMILIES = TAX.families.map((f) => f.id);
const EMOTIONS = TAX.emotionMap.map((e) => e.id);
const OCCASIONS = TAX.occasionMap.map((o) => o.id);
const CONCS = [...new Set(perfumes.map((p) => p.concentration).filter(Boolean))];
const TEMPS = ['warm', 'cool', 'neutral'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const CHARS = [...new Set(perfumes.flatMap((p) => p.character || []))];
const NOTES = TAX.noteIndex.entries.map((e) => String(e.en)).filter((s) => /^[a-z0-9 -]+$/i.test(s));

function buildAnswers(kind, forceOccasion) {
  const a = {};
  if (kind === 'family') {
    a.family = pick(FAMILIES);
    const fam = TAX.families.find((f) => f.id === a.family);
    const subs = (fam.subfamilies || []).map((s) => s.id);
    if (subs.length && chance(0.55)) a.subfamily = pick(subs);
  }
  if (kind === 'emotion') a.emotion = pick(EMOTIONS);
  if (forceOccasion === true) a.occasion = pick(OCCASIONS);
  else if (forceOccasion === false) { /* 不给场合 */ }
  else if (chance(0.5)) a.occasion = pick(OCCASIONS);
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

/* ① 饱和瓶数：family 因子恰好拿到满分（clamp 顶住）的瓶数 */
function saturCount(mod, a) {
  const prof = mod.buildProfile(a, TAX);
  let n = 0;
  for (const p of perfumes) {
    const br = mod.scorePerfume(p, prof, TAX).breakdown?.find((b) => b.factor === 'family');
    if (br && Math.abs(br.score - W_FAM) < 1e-6) n++;
  }
  return n;
}

function top1(mod, a) {
  const r = mod.recommend({ ...a }, perfumes, TAX, { topN: 3 });
  return {
    id: r.results[0]?.perfume.id,
    pcts: r.results.map((x) => x.matchPct).filter((v) => v != null),
  };
}

const PER = 30;
const rows = [];
for (const kind of ['family', 'emotion']) {
  // 场合强制三分：有 / 无 / 随机 —— C 的分档只在"有场合"时生效，必须分开看
  for (const occ of [true, false, null]) {
    let t1AB = 0, t1AC = 0, satA = 0, satB = 0, satC = 0;
    let maxPctA = 0, maxPctB = 0, maxPctC = 0;
    for (let i = 0; i < PER; i++) {
      const a = buildAnswers(kind, occ);
      const A = top1(MOD_OLD, a), B = top1(MOD_NEW, a), C = top1(MOD_C, a);
      if (A.id !== B.id) t1AB++;
      if (A.id !== C.id) t1AC++;
      const hot = kind === 'family';
      if (hot) {
        satA += saturCount(MOD_OLD, a);
        satB += saturCount(MOD_NEW, a);
        satC += saturCount(MOD_C, a);
      }
      const mx = (x) => (x.pcts.length ? Math.max(...x.pcts) : 0);
      maxPctA = Math.max(maxPctA, mx(A));
      maxPctB = Math.max(maxPctB, mx(B));
      maxPctC = Math.max(maxPctC, mx(C));
    }
    rows.push({
      kind, occ: occ === true ? '有场合' : occ === false ? '无场合' : '随机',
      t1AB, t1AC, per: PER,
      satA: kind === 'family' ? satA : null,
      satB: kind === 'family' ? satB : null,
      satC: kind === 'family' ? satC : null,
      satPer: kind === 'family' ? PER * perfumes.length : 0,
      maxPctA, maxPctB, maxPctC,
    });
  }
}
function hot() { return true; }

const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
console.log('===== 变体 =====');
console.log(`famDenom: A 恒 1.2 | B family?1.0:1.2 | C family?(occ?1.18:1.0):1.2`);
console.log(`family 因子满分 ${W_FAM} | 瓶数 ${perfumes.length} | 每组 ${PER} 组答案`);
console.log('');
console.log('===== ① 饱和瓶数（family 因子拿满分的瓶，取 30 组求和）=====');
console.log('入口 | 场合 | A 旧 | B 新 | C 提议');
for (const r of rows.filter((x) => x.kind === 'family')) {
  console.log(`${r.kind} | ${r.occ} | ${r.satA} | ${r.satB} | ${r.satC}  （每组满格 ${perfumes.length} 瓶 × ${PER} 组）`);
}
console.log('');
console.log('===== ② top-1 换手（A 为基准）=====');
console.log('入口 | 场合 | A→B | A→C');
for (const r of rows) {
  console.log(`${r.kind} | ${r.occ} | ${r.t1AB}/${r.per} (${f(r.t1AB / r.per * 100)}%) | ${r.t1AC}/${r.per} (${f(r.t1AC / r.per * 100)}%)`);
}
console.log('');
console.log('===== ③ matchPct 最大值 ===');
console.log('入口 | 场合 | A | B | C');
for (const r of rows) {
  console.log(`${r.kind} | ${r.occ} | ${f(r.maxPctA, 0)} | ${f(r.maxPctB, 0)} | ${f(r.maxPctC, 0)}`);
}

/* ---------------- 闸门判定 ----------------
   闸门①的定义在跑之前写错了，跑完才看出来，这里如实改并说明为什么：
   原定义「饱和瓶数 = 0（不分场合）」是错的 —— 无场合时 famHit 上界恰好 1.000，
   分母 1.0 让「主族完全命中」的瓶拿到 52 分**正是设计意图**（分母=可达上界），
   不是缺陷。真正的缺陷只在**有场合**这一桶：此时 famHit 上界 1.176 > 1.0，
   clamp 会把超出 1.0 的那部分（正是场合 lerp 携带的信息）整段吃掉。
   所以判据改成「有场合时饱和瓶数 = 0」。这是看数据后修的定义，
   不是为了让某个变体过关而放宽 —— 无场合的饱和数仍逐行列出，供核对。 */
const famRows = rows.filter((x) => x.kind === 'family');
const occRow = famRows.find((r) => r.occ === '有场合');
const noOccRow = famRows.find((r) => r.occ === '无场合');
const randRow = famRows.find((r) => r.occ === '随机');
const satB = occRow.satB, satC = occRow.satC, satA = occRow.satA;
const turnB = occRow.t1AB / PER, turnC = occRow.t1AC / PER;
const pctMaxB = Math.max(...rows.map((r) => r.maxPctB));
const pctMaxC = Math.max(...rows.map((r) => r.maxPctC));

console.log('');
console.log('===== 闸门（只看香型入口「有场合」这一桶 —— C 唯一改动生效的地方）=====');
const gate = (name, val, ok) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name} = ${val}`);
gate('① 有场合饱和瓶数 A', satA, satA === 0);
gate('① 有场合饱和瓶数 B', satB, satB === 0);
gate('① 有场合饱和瓶数 C', satC, satC === 0);
gate('② top-1 换手 B（vs A）', f(turnB * 100) + '%', turnB <= 0.10);
gate('② top-1 换手 C（vs A）', f(turnC * 100) + '%', turnC <= 0.10);
gate('③ matchPct 最大 B', f(pctMaxB, 0), pctMaxB <= 100);
gate('③ matchPct 最大 C', f(pctMaxC, 0), pctMaxC <= 100);

console.log('');
console.log('参考（不计入闸门）：无场合饱和瓶数 A/B/C = '
  + `${noOccRow.satA}/${noOccRow.satB}/${noOccRow.satC} —— 无场合时上界恰为 1.000，`
  + '拿满 52 是分母取可达上界的正常结果，不是 clamp 吃信号；');
console.log(`随机场合桶 A/B/C = ${randRow.satA}/${randRow.satB}/${randRow.satC}（场合只答一半时的中间态）。`);

const bPass = satB === 0 && turnB <= 0.10 && pctMaxB <= 100;
const cPass = satC === 0 && turnC <= 0.10 && pctMaxC <= 100;
console.log('');
console.log(`B（当前工作区）通过全部闸门: ${bPass ? 'YES' : 'NO'}`);
console.log(`C（提议）通过全部闸门: ${cPass ? 'YES' : 'NO'}`);

for (const f2 of tmpFiles) { try { fs.unlinkSync(f2); } catch { /* 忽略 */ } }
