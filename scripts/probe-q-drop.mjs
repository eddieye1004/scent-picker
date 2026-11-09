/**
 * probe-q-drop.mjs — 每一题「删掉」的真实代价
 *
 * 判据与 probe-q-marginal.mjs 不同：
 *   marginal 问的是「这一题答了 A 换答 B，结果变多少」（边际价值）
 *   本脚本问的是「这一题整个不问，结果变多少」（存废判断）
 *
 * 后者才是"要不要删这一题"的依据 —— 一题可以有边际价值但没存废价值
 * （比如它只在你已经答了另外三题时才起作用），也可能反过来。
 *
 * 为什么必须多画像：单一画像会骗人。实测一组
 * {family:floral, subfamily:white-floral, ...} 下，season / intensity /
 * concentration / longevity / mood 五题全部 top-10 重叠 10/10，
 * 因为 family+subfamily 已经把池子收到很窄，别的维度轮不到起作用。
 * 换成没选 subfamily 的画像，结论完全不同。
 *
 * 用法：node scripts/probe-q-drop.mjs [画像数=120]
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8')).perfumes;
const TAX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
const S = await import(pathToFileURL(path.join(ROOT, 'src', 'scoring.js')).href);

const N = Number(process.argv[2] || 120);
let seed = 20261109;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const FAM = TAX.families.map((f) => f.id);
const SUB = Object.fromEntries(TAX.families.map((f) => [f.id, (f.subfamilies || []).map((s) => s.id)]));
const OCC = TAX.occasionMap.map((o) => o.id);
const EMO = TAX.emotionMap.map((e) => e.id);
const NOTE_EN = TAX.noteIndex.entries.map((e) => e.en);
const TAGS = ['fresh', 'clean', 'woody', 'warm', 'sweet', 'green', 'spicy', 'smoky', 'floral', 'citrusy'];

/** 生成一组"用户会真的这么答"的画像。两条入口各占一半。 */
function makeProfile() {
  const byEmotion = rnd() < 0.5;
  const a = byEmotion ? { emotion: pick(EMO) } : { family: pick(FAM) };
  if (!byEmotion && rnd() < 0.55) a.subfamily = pick(SUB[a.family] || []);
  /* 其余维度按真实使用率给：多数人会答场合/浓度，少数人答季节/留香 */
  if (rnd() < 0.75) a.occasion = pick(OCC);
  if (rnd() < 0.60) a.season = pick(['spring', 'summer', 'autumn', 'winter']);
  /* 次选季节 seasonSecond 在 v37 已从 UI 移除（app.js renderContext），
     所以画像里不再生成它。scoring 里那条权重与分支**保留**未删 ——
     它现在是一条休眠路径：没有任何 UI 能写这个字段，
     但老存档/外部调用方传进来仍然按原逻辑算。
     本脚本的维度表里也保留它，用来记录"若有数据，它值多少分"。 */
  if (rnd() < 0.55) a.intensity = 1 + Math.floor(rnd() * 5);
  if (rnd() < 0.70) a.concentration = pick(['eau-de-cologne', 'eau-de-toilette', 'eau-de-parfum', 'extrait']);
  if (rnd() < 0.45) a.longevity = 1 + Math.floor(rnd() * 5);
  if (rnd() < 0.60) a.characterTags = [pick(TAGS), pick(TAGS)];
  if (rnd() < 0.45) a.temperature = pick(['warm', 'cool']);
  if (rnd() < 0.40) a.sweetness = 1 + Math.floor(rnd() * 4);
  if (rnd() < 0.35) a.likedNotes = [pick(NOTE_EN), pick(NOTE_EN)];
  if (rnd() < 0.30) a.dislikedNotes = [pick(NOTE_EN)];
  /* 整族排除：家族入口下这一屏不显示（D61），所以只在情绪入口下给值。
     第一版漏了这行，导致 dislikedFamilies 的有效样本是 0，
     表里显示 10.00/10「可删」—— 那不是测出来的，是没测。 */
  if (byEmotion && rnd() < 0.40) {
    const others = FAM.filter((f) => f !== a.family);
    a.dislikedFamilies = [pick(others)];
  }
  return a;
}

/** 一题"删掉"= 从画像里永远拿掉这个字段 */
const DIMS = [
  ['第1步 小类 subfamily', ['subfamily']],
  ['第2步 喜欢香调 likedNotes', ['likedNotes']],
  ['第2步 受不了香调 dislikedNotes', ['dislikedNotes']],
  ['第3步 气质原型 characterTags', ['characterTags']],
  ['第3步 气味温度 temperature', ['temperature']],
  ['第3步 甜度 sweetness', ['sweetness']],
  ['第4步 场合 occasion', ['occasion']],
  ['第4步 主季节 season', ['season']],
  ['第4步 次选季节 seasonSecond', ['seasonSecond']],
  ['第5步 浓淡 intensity', ['intensity']],
  ['第5步 浓度 concentration', ['concentration']],
  ['第5步 留香 longevity', ['longevity']],
  ['第6步 整族排除 dislikedFamilies', ['dislikedFamilies']],
];

const profiles = [];
let guard = 0;
while (profiles.length < N && guard++ < N * 20) {
  const a = makeProfile();
  try { S.recommend(a, P, TAX, { topN: 3 }); profiles.push(a); } catch { /* 引擎拒收的画像直接丢 */ }
}

const res = [];
for (const [label, keys] of DIMS) {
  let top1 = 0, top3 = 0, overlapSum = 0, skipped = 0, n = 0;
  for (const a of profiles) {
    const hasAny = keys.some((k) => a[k] != null);
    if (!hasAny) { skipped++; continue; }        /* 本来就没答这题，删它当然没影响 */
    const without = { ...a };
    for (const k of keys) delete without[k];
    let base, cut;
    try {
      base = S.recommend(a, P, TAX, { topN: 10 }).results.map((x) => x.perfume.id);
      cut = S.recommend(without, P, TAX, { topN: 10 }).results.map((x) => x.perfume.id);
    } catch { skipped++; continue; }
    n++;
    if (base[0] !== cut[0]) top1++;
    if (base.slice(0, 3).join() !== cut.slice(0, 3).join()) top3++;
    overlapSum += base.filter((x) => cut.includes(x)).length;
  }
  res.push({
    label, n, skipped,
    top1: n ? top1 / n : 0,
    top3: n ? top3 / n : 0,
    overlap: n ? overlapSum / n : 10,
  });
}

res.sort((x, y) => x.overlap - y.overlap);

console.log(`\n=== 「删掉这一题」的代价（${profiles.length} 组随机画像，只统计真的答过它的）===\n`);
console.log('| 维度 | 有效样本 | top-1 换 | top-3 换 | top-10 平均重叠 | 判定 |');
console.log('|---|---|---|---|---|---|');
for (const r of res) {
  /* 有效样本为 0 时不能给判定 —— 那是「没测到」，不是「没影响」。
     第一版就犯过这个错：表里出现「可删」，原因是画像生成器从没设置过该字段。 */
  const verdict = r.n === 0 ? '⚠ 未测（画像里没出现过）'
    : r.overlap >= 9.5 ? '**可删**'
      : r.overlap >= 8.5 ? '存废边缘'
        : r.overlap >= 6 ? '有用'
          : '**核心**';
  console.log(`| ${r.label} | ${r.n} | ${(r.top1 * 100).toFixed(1)}% | ${(r.top3 * 100).toFixed(1)}% | ${r.overlap.toFixed(2)}/10 | ${verdict} |`);
}

console.log('\n=== 怎么读这张表 ===');
console.log('· top-10 平均重叠 ≥9.5：这一题答不答，前三瓶和前十瓶基本一样 → 该删或合并');
console.log('· 6–9.5：有用，但可以考虑和相邻的题合并成一屏');
console.log('· <6：核心，不能动');
console.log('· 「top-1 换」比「重叠」更严：它说"第一名会不会换人"，用户只看得见这一条。');
console.log('');
console.log(`（跳过数：某维度在该画像里本来就没答 → 不计入。明细见上方「有效样本」列）`);
