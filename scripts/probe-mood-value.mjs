/**
 * probe-mood-value.mjs — 任务 3：「想要什么整体气质」这一步到底值不值得问。
 *
 * 派单要求（只评估、不改代码）：
 *   ① 该步答案在 scoring 里实际被哪些因子消费；无它时分数分布变化多大（探针实测）；
 *   ② 它与第一步圆盘提问（家族选择）在信息上的重叠度；
 *   ③ 去留建议（保留 / 删除 / 合并进圆盘，三选一）。
 *
 * ---------- 关键事实：这一步不是"一个答案"，是"四个字段" ----------
 *   app.js 的 renderMood → 点选一个原型后写回四样东西：
 *     characterTags  ← 原型的 tags 键名（scoring 的 8a 硬匹配）
 *     characterNeg   ← 原型的 neg（8a 的禁止标签扣分）
 *     temperature    ← deriveFromPreset(id)（14 分因子）
 *     sweetness      ← deriveFromPreset(id)（13 分因子）
 *   所以"删掉这一步"= 同时删四个字段，不能只删 characterTags —— 只删它
 *   会留下 temperature/sweetness 两个孤儿字段，测出来的影响偏小。
 *
 * ---------- 三种世界对照 ----------
 *   FULL   满答（气质在场，且冷暖甜度由它反推）
 *   NO     "从没问过这一步"：characterTags / characterNeg / temperature /
 *          sweetness 四个字段一起删
 *   ONLY   只留气质、删掉前面那些"也能推出冷暖甜度"的题？—— 不做。
 *          这里改为测「气质 vs 家族」的重叠，见 §2。
 *
 * 用法：node scripts/probe-mood-value.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8'));
const TAX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
const perfumes = DATA.perfumes;
const { recommend, WEIGHTS, scorePerfume, buildProfile } = await import(
  pathToFileURL(path.join(ROOT, 'src', 'scoring.js')).href
);
const appMod = await import(pathToFileURL(path.join(ROOT, 'app.js')).href).catch(() => null);

/* ---------- 七个气质原型：从 app.js 抄一份不可行（它不是模块导出）。
   用与 app.js 完全相同的表：如果这里与 app.js 漂移，下面所有数字都失效，
   所以脚本启动时先做一次跨文件一致性检查（见 §0）。 ---------- */
const PRESETS = [
  { id: 'clean-clear', zh: '洁净清透', dims: { temp: -1, sweet: -1, weight: -1 },
    tags: ['fresh', 'clean', 'citrusy', 'herbal'], neg: ['sweet', 'resinous', 'leathery', 'smoky'] },
  { id: 'wet-forest', zh: '雨后林地', dims: { temp: -1, sweet: -1, weight: 1 },
    tags: ['earthy', 'woody', 'green', 'herbal'], neg: ['sweet', 'clean', 'floral'] },
  { id: 'iced-fruit', zh: '冰镇果露', dims: { temp: -1, sweet: 1, weight: -1 },
    tags: ['fruity', 'sweet', 'citrusy', 'floral'], neg: ['leathery', 'smoky', 'resinous', 'earthy'] },
  { id: 'dry-herb', zh: '干爽草本', dims: { temp: 1, sweet: -1, weight: -1 },
    tags: ['herbal', 'spicy', 'woody', 'citrusy'], neg: ['sweet', 'creamy', 'floral'] },
  { id: 'leather-tob', zh: '皮革烟草', dims: { temp: 1, sweet: -1, weight: 1 },
    tags: ['leathery', 'smoky', 'resinous', 'woody'], neg: ['fresh', 'citrusy', 'clean', 'fruity'] },
  { id: 'honey-white', zh: '蜜感白花', dims: { temp: 1, sweet: 1, weight: -1 },
    tags: ['floral', 'creamy', 'powdery'], neg: ['leathery', 'smoky', 'citrusy', 'green'] },
  { id: 'caramel-amber', zh: '焦糖琥珀', dims: { temp: 1, sweet: 1, weight: 1 },
    tags: ['sweet', 'creamy', 'amber', 'resinous'], neg: ['fresh', 'citrusy', 'green', 'clean'] },
];

/* deriveFromPreset 的映射（app.js 同名函数）：temp -1→cool / +1→warm；
   sweet -1→1 / +1→3。 */
const derive = (p) => ({
  temperature: p.dims.temp === -1 ? 'cool' : 'warm',
  sweetness: p.dims.sweet === -1 ? 1 : 3,
});

/* ---------- §0 一致性自检 ----------
   这里必须真的验，否则"脚本里的原型表"与"页面上的"分叉时，报告会安静地错。 */
function selfCheck() {
  const problems = [];
  if (!appMod) {
    problems.push('拿不到 app.js 模块（它需要浏览器 DOM 才能 import）—— 本脚本改为只用 scoring 侧验证');
  }
  /* 无论 app.js 能不能 import，这两条都能验：tags 里的每个标签都必须真的存在
     于数据层（否则那一条永远 0 命中，等于没用）。 */
  const tagPool = new Set();
  for (const p of perfumes) for (const t of (p.character || [])) tagPool.add(t);
  for (const p of PRESETS) {
    const dead = p.tags.filter((t) => !tagPool.has(t));
    if (dead.length) problems.push(`${p.zh}: 标签 ${dead.join('/')} 在 ${perfumes.length} 瓶里 0 命中`);
  }
  return problems;
}

/* ---------- 画像采样 ----------
   为什么用随机采样而不是只看 6 组手写画像：这一步的作用如果只在少数画像上
   明显，结论就不该写死。这里取 1500 组，并**固定 seed**，任何人复跑都是同一批。 */
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261111);
const pickR = (arr) => arr[Math.floor(rnd() * arr.length)];

const FAMILIES = ['citrus', 'floral', 'woody', 'amber', 'fresh', 'gourmand'];
const OCCASIONS = (TAX.occasionMap || []).map((o) => o.id);
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const CONCS = [...new Set(perfumes.map((p) => p.concentration).filter(Boolean))];
const NOTE_POOL = [...new Set(perfumes.flatMap((p) => (p.notesAll || []).slice(0, 4)))].slice(0, 60);

/** 造一份"与所选家族/气质自洽"的答案，避免制造现实中不存在的矛盾画像。 */
function makeProfile(preset) {
  const fam = pickR(preset.tags.filter((t) => FAMILIES.includes(t)).concat(FAMILIES));
  const d = derive(preset);
  const a = {
    family: fam,
    occasion: pickR(OCCASIONS),
    season: pickR(SEASONS),
    intensity: 1 + Math.floor(rnd() * 5),
    concentration: pickR(CONCS),
    characterPreset: preset.id,
    characterTags: preset.tags.slice(),
    characterNeg: preset.neg.slice(),
    temperature: d.temperature,
    sweetness: d.sweetness,
  };
  /* 香调维度随机但"点得少"（真实用户中位数是 0–2 个） */
  if (rnd() < 0.45) a.likedNotes = [pickR(NOTE_POOL)];
  if (rnd() < 0.35) a.dislikedNotes = [pickR(NOTE_POOL)];
  return a;
}

const N = 1500;
const SAMPLE = Array.from({ length: N }, () => pickR(PRESETS)).map(makeProfile);

/* ---------- 跑分 ---------- */
const TOPN = 10;
function run(a) {
  try {
    const r = recommend(a, perfumes, TAX, { topN: TOPN });
    const list = (r.matches || r.items || r.results || r || []).slice(0, TOPN)
      .map((x) => ({ id: x.perfume ? x.perfume.id : x.id, score: x.score ?? x.total ?? 0 }));
    return list;
  } catch { return null; }
}

const stripMood = (a) => {
  const c = { ...a };
  delete c.characterPreset;
  delete c.characterTags;
  delete c.characterNeg;
  delete c.temperature;
  delete c.sweetness;
  return c;
};

/* ---------- §1 因子消费：谁在读这四个字段 ---------- */
console.log('=== §0 前置自检 ===');
{
  const probs = selfCheck();
  console.log(probs.length ? probs.map((p) => `  ⚠ ${p}`).join('\n') : '  ✓ 七个原型的 tags 全部在数据层有命中');
  const tagPool = new Set();
  for (const p of perfumes) for (const t of (p.character || [])) tagPool.add(t);
  console.log(`  character 标签池：${tagPool.size} 种；库里带 character 的瓶数 ` +
    `${perfumes.filter((p) => (p.character || []).length).length}/${perfumes.length}`);
}

console.log('\n=== §1 这一屏的答案被哪些因子消费 ===');
{
  /* 逐因子读源码确认 + 用权重表量化。这不是推断：下面每一行的"读的是哪个字段"
     都能在 src/scoring.js 里按因子名搜到。 */
  const consumed = [
    { field: 'characterTags', factor: 'character（8a 硬匹配）', w: WEIGHTS.character, note: '命中任一即给满分 16' },
    { field: 'characterTags[0] → characterFamily', factor: 'character（8a 软回退）', w: WEIGHTS.character, note: '硬匹配落空时按家族重合度给 0–0.6×16' },
    { field: 'characterNeg', factor: 'character 的乘性扣减', w: null, note: '每命中一个禁止标签 ×(1−0.22)，最低归零' },
    { field: 'temperature', factor: 'temperature', w: WEIGHTS.temperature, note: '冷暖三值硬匹配' },
    { field: 'sweetness', factor: 'sweetness', w: WEIGHTS.sweetness, note: '甜度 0–3 档，差值计分' },
  ];
  const total = WEIGHTS.character + WEIGHTS.temperature + WEIGHTS.sweetness;
  for (const c of consumed) {
    console.log(`  · ${c.field.padEnd(30)} → ${c.factor.padEnd(26)} ` +
      `${c.w == null ? '  —' : String(c.w).padStart(3)} 分  ${c.note}`);
  }
  const all = Object.values(WEIGHTS).filter((v) => v > 0).reduce((a, b) => a + b, 0);
  console.log(`  合计直接权重：character ${WEIGHTS.character} + temperature ${WEIGHTS.temperature} ` +
    `+ sweetness ${WEIGHTS.sweetness} = ${total} 分`);
  console.log(`  占全部正权重 ${all} 的 ${(total / all * 100).toFixed(1)}%`);
  console.log('  另需说明：这一步在 UI 上还会顶替「冷暖」「甜度」两问（v37 合并），' +
    '所以删掉它意味着这两维也一起没了 —— 不是"少一个 16 分因子"。');
}

/* ---------- §2 无它时，分数分布变化多大 ---------- */
console.log('\n=== §2 抽掉整屏（四个字段一起）后的实测 ===');
{
  let t1 = 0, t3set = 0, total = 0;
  let shiftSum = 0, shiftMax = 0;
  let topScoreDrop = 0, topScoreDropN = 0;
  let spreadBefore = 0, spreadAfter = 0, spreadN = 0;
  /* 分差：第 1 名与第 10 名的原始分差 —— 衡量"排序有多确定" */
  let gapBefore = 0, gapAfter = 0;
  const movedPct = [];

  for (const a of SAMPLE) {
    const base = run(a);
    const cut = run(stripMood(a));
    if (!base || !cut || !base.length || !cut.length) continue;
    total++;
    if (base[0].id !== cut[0].id) t1++;
    const b3 = base.slice(0, 3).map((x) => x.id).sort().join(',');
    const c3 = cut.slice(0, 3).map((x) => x.id).sort().join(',');
    if (b3 !== c3) t3set++;

    const posB = new Map(base.map((x, i) => [x.id, i]));
    const posC = new Map(cut.map((x) => [x.id, 0]));
    let s = 0, n = 0;
    for (const [id, i] of posB) {
      const j = cut.findIndex((x) => x.id === id);
      s += Math.abs(i - (j < 0 ? TOPN : j));
      n++;
    }
    if (n) { const avg = s / n; shiftSum += avg; shiftMax = Math.max(shiftMax, avg); }

    const still = cut.find((x) => x.id === base[0].id);
    if (still) { topScoreDrop += base[0].score - still.score; topScoreDropN++; }
    else if (cut[0]) { topScoreDrop += base[0].score - cut[0].score; topScoreDropN++; }
    gapBefore += base[0].score - base[base.length - 1].score;
    gapAfter += cut[0].score - cut[cut.length - 1].score;
    spreadBefore += base[0].score;
    spreadAfter += cut[0].score;
    spreadN++;

    /* 第 1 名的分数变化幅度，相对它的原分数 */
    if (base[0].score > 0) movedPct.push((still ? base[0].score - still.score : 0) / base[0].score);
  }

  const pct = (x) => `${(x / total * 100).toFixed(1)}%`;
  console.log(`  样本 ${total} 组（seed 20261111，库 ${perfumes.length} 瓶，top-${TOPN}）`);
  console.log(`  top-1 换人        ${t1} / ${total} = ${pct(t1)}`);
  console.log(`  top-3 集合变化    ${t3set} / ${total} = ${pct(t3set)}`);
  console.log(`  top-10 平均位移   ${(shiftSum / total).toFixed(2)} 位（最坏一组 ${shiftMax.toFixed(2)} 位）`);
  console.log(`  原第 1 名掉分     ${(topScoreDrop / Math.max(1, topScoreDropN)).toFixed(1)} 分（均）`);
  console.log(`  第 1 名原始分     ${(spreadBefore / spreadN).toFixed(1)} → ${(spreadAfter / spreadN).toFixed(1)}` +
    `（差 ${((spreadAfter - spreadBefore) / spreadN).toFixed(1)}）`);
  console.log(`  首尾分差（同一次推荐内 top1 − top10） ` +
    `${(gapBefore / spreadN).toFixed(1)} → ${(gapAfter / spreadN).toFixed(1)}`);

  /* 分布形态：把"第 1 名分数"分桶，看分布怎么移动 —— 只报均值会掩盖双峰 */
  const bucket = (a) => {
    const list = SAMPLE.map((x) => run(a(x))).filter(Boolean).map((r) => r[0].score);
    const edges = [80, 90, 100, 110, 120, 130, 140, 160, 999];
    const counts = new Array(edges.length).fill(0);
    for (const s of list) {
      const i = edges.findIndex((e) => s < e);
      counts[i < 0 ? edges.length - 1 : i]++;
    }
    return { counts, edges, n: list.length };
  };
  const b = bucket((x) => x);
  const c = bucket(stripMood);
  console.log('  第 1 名分数分布（占比）：');
  for (let i = 0; i < b.counts.length; i++) {
    const lo = i === 0 ? 0 : b.edges[i - 1];
    const hi = b.edges[i];
    const pb = (b.counts[i] / b.n * 100).toFixed(1);
    const pc = (c.counts[i] / c.n * 100).toFixed(1);
    if (b.counts[i] === 0 && c.counts[i] === 0) continue;
    console.log(`    ${String(lo).padStart(3)}–${String(Math.min(hi, 999)).padStart(3)}  ${pb.padStart(5)}%  →  ${pc.padStart(5)}%`);
  }
}

/* ---------- §3 与第一步（家族圆盘）的重叠度 ---------- */
console.log('\n=== §3 与第 1 步「家族选择」的信息重叠 ===');
{
  /* ① 硬重叠：原型的 tags 里有多少本身就是家族 id。
     命中就等于"这一步在复读第 1 步"。 */
  let tagTotal = 0, tagIsFamily = 0;
  const per = [];
  for (const p of PRESETS) {
    const fam = p.tags.filter((t) => FAMILIES.includes(t));
    tagTotal += p.tags.length;
    tagIsFamily += fam.length;
    per.push(`${p.zh} ${fam.length}/${p.tags.length}${fam.length ? '（' + fam.join('/') + '）' : ''}`);
  }
  console.log('  ① 原型标签里直接就是家族名的比例：');
  for (const line of per) console.log(`     ${line}`);
  console.log(`     合计 ${tagIsFamily}/${tagTotal} = ${(tagIsFamily / tagTotal * 100).toFixed(0)}%`);

  /* ② 结构重叠：原型能被家族+冷暖+甜度**完全确定**吗？
     deriveDims 把 family 折成 weight 一维，加上 temp/sweet 共三维；
     七个原型的 dims 也是这三元组 —— 若三维组合与原型一一对应，
     则"给定家族 + 冷暖 + 甜度"必然唯一确定原型，等于没有再提供信息。 */
  const combos = new Map();
  for (const p of PRESETS) {
    const k = `${p.dims.temp}|${p.dims.sweet}|${p.dims.weight}`;
    combos.set(k, (combos.get(k) || []).concat(p.zh));
  }
  const dup = [...combos.entries()].filter(([, v]) => v.length > 1);
  console.log(`  ② 三维坐标（冷暖×甜度×轻重）与原型是否一一对应：${combos.size} 个不同坐标 / ${PRESETS.length} 个原型`);
  console.log(`     ${dup.length ? '有重合：' + dup.map(([k, v]) => `${k}=${v.join('=')}`).join('；') : '一一对应 —— 没有两个原型共享同一坐标'}`);

  /* ③ 实测重叠：只选家族时，rankCharacterPresets 会预选哪个原型？
     如果"每个家族只对应 1–2 个原型"，那么这一步对大多数用户只是在确认第 1 步。 */
  const FAM_WEIGHT = { citrus: -1, floral: -1, fresh: -1, woody: 1, amber: 1, gourmand: 1 };
  function rankPresets(answers) {
    const t = answers.temperature;
    const s = answers.sweetness;
    const fam = answers.family;
    const temp = t === 'cool' ? -1 : t === 'warm' ? 1 : 0;
    const sweet = s == null ? 0 : (Number(s) / 3) * 2 - 1;
    const weight = fam && FAM_WEIGHT[fam] != null ? FAM_WEIGHT[fam] : 0;
    const d = { temp, sweet, weight };
    const W = { temp: 1.0, sweet: 0.8, weight: 0.6 };
    const scored = PRESETS.map((c, i) => {
      let dist = 0, norm = 0;
      for (const k of ['temp', 'sweet', 'weight']) {
        if (!d[k]) continue;
        dist += W[k] * ((c.dims[k] - d[k]) / 2) ** 2;
        norm += W[k];
      }
      return { item: c, dist: norm ? dist / norm : 0, order: i };
    });
    scored.sort((a, b) => (a.dist - b.dist) || (a.order - b.order));
    return scored.map((x) => x.item);
  }
  const seen = new Map();
  for (const f of FAMILIES) {
    const first = rankPresets({ family: f })[0];
    seen.set(f, first.zh);
  }
  console.log('  ③ 只选家族（未答冷暖/甜度）时会被预选的原型：');
  for (const [f, zh] of seen) console.log(`     ${f.padEnd(9)} → ${zh}`);
  console.log(`     6 个家族 → ${new Set(seen.values()).size} 个不同原型（` +
    `${[...new Set(seen.values())].join('、')}）`);

  /* ④ 实测：给定 family 后，"气质那一步的四个字段"还能带来多少**额外**信息？
     做法：固定 family（以及其他所有字段），只对比「有气质」与「无气质」的 top-3，
     按家族分组统计 —— 若某族几乎不变，说明该族下这一步等于没问。 */
  console.log('  ④ 按家族分组：抽掉气质后 top-3 变化的概率');
  const byFam = new Map();
  for (const a of SAMPLE) {
    const base = run(a);
    const cut = run(stripMood(a));
    if (!base || !cut) continue;
    const fam = a.family;
    if (!byFam.has(fam)) byFam.set(fam, { n: 0, ch: 0 });
    const s = byFam.get(fam);
    s.n++;
    const b3 = base.slice(0, 3).map((x) => x.id).sort().join(',');
    const c3 = cut.slice(0, 3).map((x) => x.id).sort().join(',');
    if (b3 !== c3) s.ch++;
  }
  for (const f of FAMILIES) {
    const s = byFam.get(f);
    if (!s || !s.n) continue;
    console.log(`     ${f.padEnd(9)} ${(s.ch / s.n * 100).toFixed(1)}%  （${s.ch}/${s.n}）`);
  }
}

/* ---------- §4 若"合并进圆盘"，能省掉什么 ---------- */
console.log('\n=== §4 三种做法的代价对照（供裁决用） ===',
);
{
  console.log('  保留：总分里 43 分（character 16 + temperature 14 + sweetness 13）由这一步产生；');
  console.log('        代价是 1 屏 + 用户要理解 7 个文学化原型名。');
  console.log('  删除：这 43 分全部消失，且冷暖/甜度两维一起没了（它们由原型反推）。');
  console.log('        实测影响见 §2 —— 这是"删掉"要付的账。');
  console.log('  合并：把原型并进第 1 步圆盘，等于让圆盘的 6 个扇区各自带一个"默认原型"；');
  console.log('        但 §3 ① 显示原型标签里有家族成分，合并会让两套语义互相污染。');
}
