/**
 * probe-q-ab.mjs — 问卷重设计 A/B 量化（G7 分母 + 入口覆盖）
 *
 * 目的：把「问卷改动」和「权重改动」两个变量的影响分开量。
 * 三套变体，同一批 26 组答案，同一份香水库：
 *
 *   V1 旧问卷 + 旧权重  —— 只跑「有 family」的答案（旧 finish() 的硬守卫能放行的那些）
 *   V2 新问卷 + 旧权重  —— 同样 26 组，emotion-only 那几组也能出结果（新入口放开）
 *   V3 新问卷 + 新权重  —— 再叠 G7 分母修正
 *
 * 为什么要三套而不是两套：如果只做「旧 vs 新」，分母和入口两个变量同时动，
 * 分不清前三名变化是入口带来的（新增答案类型）还是分母带来的（排序被改写）。
 *
 * 变体的实现方式：读 src/scoring.js 原文 → 打字符串补丁 → 落到系统临时目录 →
 * import。这样不改仓库文件就能同时持有多个权重版本。
 * 临时副本里 `./notes.js` 的导入被改写成绝对 file URL，否则解不开。
 *
 * 用法：node scripts/probe-q-ab.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8'));
const TAX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
const perfumes = DATA.perfumes;

/* ---------------- 变体构造 ---------------- */

/* 现行源码已经是 V6 的形态（`famDenom = profile.family ? 1.0 : 1.2`）。
   探针必须能同时持有「旧分母 1.2」与「现行分母」，所以把现行两行整体替换，
   而不是只替换其中一个数字 —— 否则锚点会随着源码演进失效（本文件已经因此
   报过一次 `补丁锚点不存在（V3）`）。 */
const CUR_DENOM = [
  'const famDenom = profile.family ? 1.0 : 1.2;',
  '  const famScore = clamp01(famHit / famDenom) * (WEIGHTS.emotionFamily + WEIGHTS.occasionFamily);',
].join('\n');
const OLD_DENOM = 'const famScore = clamp01(famHit / 1.2) * (WEIGHTS.emotionFamily + WEIGHTS.occasionFamily);';
const NEW_LINE = 'const famScore = clamp01(famHit / DENOM_PLACEHOLDER) * (WEIGHTS.emotionFamily + WEIGHTS.occasionFamily);';

const tmpFiles = [];
function makeVariant(name, patches) {
  let code = fs.readFileSync(path.join(SRC, 'scoring.js'), 'utf8');
  // 临时副本不在 src/ 里，相对导入会解不开 → 改写成绝对 file URL。
  code = code.replace(/from\s+'\.\/notes\.js'/, `from '${pathToFileURL(path.join(SRC, 'notes.js')).href}'`);
  for (const [from, to] of patches) {
    if (!code.includes(from)) throw new Error(`补丁锚点不存在（${name}）：${from.slice(0, 60)}`);
    code = code.split(from).join(to);
  }
  const file = path.join(os.tmpdir(), `probe-q-ab-${name}-${process.pid}.mjs`);
  fs.writeFileSync(file, code, 'utf8');
  tmpFiles.push(file);
  return import(pathToFileURL(file).href);
}

/* ---------------- 26 组典型答案 ----------------
   覆盖：6 家族独选 / 家族+小类 / 家族+场合 / 家族+香调+讨厌 /
        6 情绪独选 / 情绪+场合 / 满答（含锚点）/ 情绪+排斥家族
   旧的 finish() 有 `if (!state.answers.family) return` 硬守卫，
   所以「旧问卷」只能产出带 family 的那些 —— 这一点在统计里单列。 */

const SETS = [
  // --- 只有家族（旧问卷最常见的一步答完） ---
  { id: 'S01', label: '家族·柑橘', a: { family: 'citrus' } },
  { id: 'S02', label: '家族·花香', a: { family: 'floral' } },
  { id: 'S03', label: '家族·木质', a: { family: 'woody' } },
  { id: 'S04', label: '家族·东方琥珀', a: { family: 'amber' } },
  { id: 'S05', label: '家族·清新', a: { family: 'fresh' } },
  { id: 'S06', label: '家族·美食', a: { family: 'gourmand' } },

  // --- 家族 + 小类 ---
  { id: 'S07', label: '花香·玫瑰', a: { family: 'floral', subfamily: 'rose' } },
  { id: 'S08', label: '木质·乌木', a: { family: 'woody', subfamily: 'oud' } },

  // --- 家族 + 场合 ---
  { id: 'S09', label: '柑橘·通勤', a: { family: 'citrus', occasion: 'commute' } },
  { id: 'S10', label: '琥珀·约会', a: { family: 'amber', occasion: 'date' } },
  { id: 'S11', label: '木质·正式', a: { family: 'woody', occasion: 'formal' } },
  { id: 'S12', label: '清新·户外', a: { family: 'fresh', occasion: 'outdoor' } },

  // --- 家族 + 香调 + 讨厌 ---
  { id: 'S13', label: '柑橘+香调', a: { family: 'citrus', likedNotes: ['bergamot', 'neroli'], dislikedNotes: ['musk'] } },
  { id: 'S14', label: '美食+讨厌乌木', a: { family: 'gourmand', likedNotes: ['vanilla'], dislikedNotes: ['oud'] } },

  // --- 只有情绪（旧问卷走不到：finish() 硬守卫拦掉） ---
  { id: 'S15', label: '情绪·清冷', a: { emotion: 'cold' } },
  { id: 'S16', label: '情绪·温暖', a: { emotion: 'warm' } },
  { id: 'S17', label: '情绪·干净', a: { emotion: 'clean' } },
  { id: 'S18', label: '情绪·神秘', a: { emotion: 'mysterious' } },
  { id: 'S19', label: '情绪·明亮', a: { emotion: 'bright' } },
  { id: 'S20', label: '情绪·慵懒', a: { emotion: 'lazy' } },

  // --- 情绪 + 场合 ---
  { id: 'S21', label: '干净·通勤', a: { emotion: 'clean', occasion: 'commute' } },
  { id: 'S22', label: '温暖·约会', a: { emotion: 'warm', occasion: 'date' } },
  { id: 'S23', label: '神秘·正式', a: { emotion: 'mysterious', occasion: 'formal' } },

  // --- 满答 ---
  {
    id: 'S24', label: '满答（家族路线）',
    a: {
      family: 'floral', subfamily: 'white-floral', occasion: 'date', intensity: 4,
      likedNotes: ['jasmine', 'tuberose'], dislikedNotes: ['oud'],
      temperature: 'warm', sweetness: 2, season: 'spring', seasonSecond: 'summer',
      concentration: 'eau-de-parfum', longevity: 4,
      anchorNotes: ['jasmine', 'bergamot', 'musk'],
      dislikedFamilies: ['gourmand'],
    },
  },
  {
    id: 'S25', label: '满答（情绪路线）',
    a: {
      emotion: 'lazy', occasion: 'daily', intensity: 2,
      likedNotes: ['fig', 'sandalwood'], temperature: 'cool', sweetness: 1,
      season: 'autumn', concentration: 'eau-de-toilette', longevity: 3,
      anchorNotes: ['fig', 'coconut'], dislikedFamilies: ['amber'],
    },
  },
  {
    id: 'S26', label: '情绪·明亮（最简）',
    a: { emotion: 'bright', intensity: 1 },
  },
];

const OLD_SERVABLE = (a) => !!a.family;   // 旧 finish() 硬守卫：没有 family 直接退回第 1 步

/* ---------------- 跑分 ---------------- */

const VARIANTS = [
  {
    key: 'V1', name: '旧问卷+旧权重',
    desc: '只统计旧入口能产出的 15 组；分母强制回 1.2',
    patches: [[CUR_DENOM, OLD_DENOM]],
  },
  {
    key: 'V2', name: '新问卷+旧权重',
    desc: '26 组全跑；分母强制回 1.2（与 V1 同一套权重，只差覆盖率）',
    patches: [[CUR_DENOM, OLD_DENOM]],
  },
  {
    key: 'V3', name: '新问卷+新权重(G7 全改 /1.0)',
    desc: '两条入口的分母都改成 1.0，让家族因子库内可达满分',
    patches: [[CUR_DENOM, NEW_LINE.replace('DENOM_PLACEHOLDER', '1.0')]],
  },
  {
    key: 'V4', name: '新问卷+新权重(G7 自重归一)',
    desc: '分母改成这瓶自己六族权重之和：语义变成「这瓶有多大比例正是你要的」',
    patches: [[CUR_DENOM,
      'const famSum = Object.values(p.families).reduce((acc, v) => acc + (typeof v === \'number\' ? v : 0), 0);\n'
      + '  const famScore = (famSum > 0 ? clamp01(famHit / famSum) : 0) * (WEIGHTS.emotionFamily + WEIGHTS.occasionFamily);']],
  },
  {
    key: 'V5', name: '新问卷+新权重(G7 按入口可达上界)',
    desc: '分母 = 该入口下 famHit 的库内上界（family 1.0 / family+场合 1.04 / 情绪 1.52 / 情绪+场合 1.53）',
    patches: [[CUR_DENOM,
      'const famDenom = profile.family\n'
      + '    ? (profile.occasion ? 1.04 : 1.00)\n'
      + '    : (profile.occasion ? 1.53 : 1.52);\n'
      + '  const famScore = clamp01(famHit / famDenom) * (WEIGHTS.emotionFamily + WEIGHTS.occasionFamily);']],
  },
  {
    key: 'V6', name: '新问卷+新权重(G7 只修家族入口)',
    desc: '家族入口分母 1.2 → 1.0（该入口可达上界）；情绪入口保持 1.2 —— 即现行源码',
    patches: [[CUR_DENOM, CUR_DENOM]],
  },
];

const origMod = await import(pathToFileURL(path.join(SRC, 'scoring.js')).href);

const rows = [];
for (const v of VARIANTS) {
  const mod = v.patches ? await makeVariant(v.key, v.patches) : origMod;
  for (const s of SETS) {
    if (v.key === 'V1' && !OLD_SERVABLE(s.a)) continue;
    const r = mod.recommend({ ...s.a }, perfumes, TAX, { topN: 3 });
    const top = r.results.map((x) => ({
      id: x.perfume.id,
      label: `${x.perfume.brand} ${x.perfume.name}`,
      score: x.score,
      matchPct: x.matchPct,
      famPct: (() => {
        const p = mod.buildProfile(s.a, TAX);
        const sc = mod.scorePerfume(x.perfume, p, TAX);
        const b = sc.breakdown.find((y) => y.factor === 'family');
        return b ? b.score : 0;
      })(),
      reasons: x.reasons,
    }));
    rows.push({ variant: v.key, set: s.id, label: s.label, top, activeDims: r.profile.activeDims });
  }
}

/* ---------------- 汇总 ---------------- */

const byKey = new Map();
for (const r of rows) byKey.set(`${r.variant}/${r.set}`, r);

const top1Of = (k) => byKey.get(k)?.top[0]?.id ?? null;
const top3Of = (k) => (byKey.get(k)?.top || []).map((t) => t.id).join('|');

function changeRate(aKey, bKey) {
  const ids = SETS.map((s) => s.id).filter((id) => byKey.has(`${aKey}/${id}`) && byKey.has(`${bKey}/${id}`));
  let t1 = 0, t3 = 0;
  for (const id of ids) {
    if (top1Of(`${aKey}/${id}`) !== top1Of(`${bKey}/${id}`)) t1++;
    if (top3Of(`${aKey}/${id}`) !== top3Of(`${bKey}/${id}`)) t3++;
  }
  return { n: ids.length, t1, t3, t1pct: (t1 / ids.length) * 100, t3pct: (t3 / ids.length) * 100 };
}

const cmp12 = changeRate('V1', 'V2');
const cmp23 = changeRate('V2', 'V3');
const cmp24 = changeRate('V2', 'V4');
const cmp25 = changeRate('V2', 'V5');
const cmp26 = changeRate('V2', 'V6');
const cmp13 = changeRate('V1', 'V3');

console.log('\n===== 覆盖 =====');
console.log(`旧问卷可服务答案组：${SETS.filter((s) => OLD_SERVABLE(s.a)).length} / ${SETS.length}`);
console.log(`新问卷可服务答案组：${SETS.length} / ${SETS.length}`);
console.log(`新增可服务：${SETS.filter((s) => !OLD_SERVABLE(s.a)).map((s) => s.id).join(', ')}`);

console.log('\n===== 前三名变化率（同一批答案，两两比）=====');
const pr = (t, mm) => console.log(`${t.padEnd(26)} n=${String(mm.n).padStart(2)}  top1 变 ${mm.t1}/${mm.n} (${mm.t1pct.toFixed(1)}%)   top3 变 ${mm.t3}/${mm.n} (${mm.t3pct.toFixed(1)}%)`);
pr('V1 旧问卷+旧权重', cmp12);
pr('V2 新问卷+旧权重', cmp23);
pr('V2 → V4 自重归一', cmp24);
pr('V2 → V5 入口上界', cmp25);
pr('V2 → V6 只修家族入口', cmp26);
pr('V3 新问卷+新权重', cmp13);

console.log('\n===== 家族因子达成率（首名的 family 项 / 52）=====');
for (const vk of ['V1', 'V2', 'V3', 'V4', 'V5', 'V6']) {
  const vals = rows.filter((r) => r.variant === vk).map((r) => r.top[0].famPct);
  const mx = Math.max(...vals), mn = Math.min(...vals);
  console.log(`${vk} 首名 family 分：min ${mn.toFixed(2)} / max ${mx.toFixed(2)} / 满分 52 → 达成率 ${(mn / 52 * 100).toFixed(1)}%–${(mx / 52 * 100).toFixed(1)}%`);
}

for (const [vk, label] of [['V3', 'V3 /1.0'], ['V4', 'V4 自重归一'], ['V5', 'V5 入口上界'], ['V6', 'V6 只修家族入口']]) {
  const still = SETS.filter((s) => top3Of(`V2/${s.id}`) === top3Of(`${vk}/${s.id}`)).map((s) => s.id);
  console.log(`\n===== ${label} 相对 V2：前 3 名完全没动的组（${still.length}/${SETS.length}）=====`);
  console.log(still.join(', ') || '（无）');
}

/* 首名理由样例：确认 family 因子进榜时是不是循环句（G7 相关的文案缺陷）。 */
console.log('\n===== 首名理由（V2 / V6）=====');
for (const s of [SETS[1], SETS[15], SETS[20]]) {
  for (const vk of ['V2', 'V6']) {
    const r = byKey.get(`${vk}/${s.id}`);
    if (!r) continue;
    console.log(`${vk} ${s.id} ${s.label}: ${JSON.stringify(r.top[0].reasons)}`);
  }
}

/* family 因子进 top-3 理由的比例：分母修完后这一项更常拿满分，
   要是理由里出现「主调是X，在你选的「X」里占大头」这种自指句，就得同时修 reasonText。 */
console.log('\n===== 首名理由里 family 因子的自指句出现次数 =====');
for (const vk of ['V2', 'V3', 'V6']) {
  let n = 0;
  for (const s of SETS) {
    const r = byKey.get(`${vk}/${s.id}`);
    if (!r) continue;
    if (r.top[0].reasons.some((t) => /在你选的「(.+?)」里占大头/.test(t)
      && t.includes('主调是') && new RegExp('主调是(.*?)，在你选的「\\1」').test(t))) n++;
  }
  console.log(`${vk}: ${n} / ${rows.filter((r) => r.variant === vk).length}`);
}

for (const f of tmpFiles) { try { fs.unlinkSync(f); } catch { /* 忽略 */ } }
