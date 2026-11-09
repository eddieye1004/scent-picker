/**
 * probe-q-marginal.mjs — 每道题的边际价值（随机画像版）
 *
 * 上一版 probe-q-value.mjs 用 6 组手写满答画像，结论会被画像本身的选择带偏
 * （比如气质标签恰好和榜单匹配，就显得"没用"）。这一版改成随机采样：
 * 从题库里随机抽答案组合，每组都抽掉一个维度，统计跨样本的平均影响。
 *
 * 两个指标：
 *   orderChange — top-10 里有多少位换了人（0..10），比"top-1 换没换"稳定得多
 *   kendall     — top-10 顺序的肯德尔距离，衡量"顺序被打乱多少"
 *
 * 用法：node scripts/probe-q-marginal.mjs [样本数]
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const N = Number(process.argv[2]) || 40;

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8'));
const TAX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
const perfumes = DATA.perfumes;
const { recommend } = await import(pathToFileURL(path.join(ROOT, 'src', 'scoring.js')).href);

const TOPN = 10;

function run(answers) {
  try {
    const r = recommend(answers, perfumes, TAX, { topN: TOPN });
    const list = (r.results || []).slice(0, TOPN).map((x) => ({ id: x.perfume.id, score: x.score }));
    return list.length ? list : null;
  } catch (e) { return null; }
}

/* ---------- 随机画像生成 ---------- */

let seed = 20261108;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const pickN = (arr, n) => {
  const c = [...arr]; const out = [];
  for (let i = 0; i < n && c.length; i++) out.push(c.splice(Math.floor(rnd() * c.length), 1)[0]);
  return out;
};

const FAMILIES = TAX.families.map((f) => f.id);
const SUBFAMS = TAX.families.flatMap((f) => (f.subfamilies || []).map((s) => ({ fam: f.id, sub: s.id })));
const CHAR_TAGS = [...new Set(perfumes.flatMap((p) => p.character || []))];
/* 香调要从 noteIndex.entries 取 —— 那是唯一「引擎认得的」香调表（60 条）。
   别用 perfumes.notesAll：那里是 412 个源站自由文本（"Jasmine Sambac"、
   "Floral notes"），与 noteIndex 的 en 字段零重合，喂进去永远匹配不到任何瓶子，
   探针会得出「第 2 步完全无效」的假结论。 */
const ALL_NOTES = TAX.noteIndex.entries.map((e) => e.en);

function randomProfile() {
  const onlyEmotion = rnd() < 0.3;
  const a = {};
  if (onlyEmotion) {
    a.emotion = pick(TAX.emotionMap).id;
  } else {
    const fam = pick(FAMILIES);
    a.family = fam;
    const subs = SUBFAMS.filter((s) => s.fam === fam);
    if (subs.length && rnd() < 0.6) a.subfamily = pick(subs).sub;
  }
  if (rnd() < 0.8) a.occasion = pick(TAX.occasionMap).id;
  a.intensity = 1 + Math.floor(rnd() * 5);
  if (rnd() < 0.7) a.concentration = pick(['extrait', 'parfum', 'eau-de-parfum', 'eau-de-toilette', 'eau-de-cologne', 'elixir']);
  if (rnd() < 0.7) a.longevity = 1 + Math.floor(rnd() * 5);
  if (rnd() < 0.7) a.likedNotes = pickN(ALL_NOTES, 2);
  if (rnd() < 0.7) a.dislikedNotes = pickN(ALL_NOTES, 2);
  if (rnd() < 0.6) a.temperature = pick(['warm', 'cool', 'neutral']);
  if (rnd() < 0.6) a.sweetness = Math.floor(rnd() * 4);
  if (rnd() < 0.6) a.characterTags = pickN(CHAR_TAGS, 3);
  if (rnd() < 0.6) a.season = pick(['spring', 'summer', 'autumn', 'winter']);
  if (rnd() < 0.4) a.seasonSecond = pick(['spring', 'summer', 'autumn', 'winter']);
  if (rnd() < 0.5) a.dislikedFamilies = pickN(FAMILIES, 1);
  return a;
}

/* ---------- 肯德尔距离（只比较前 10 的内部顺序） ---------- */

function kendall(a, b) {
  const ra = new Map(a.map((x, i) => [x.id, i]));
  const rb = new Map(b.map((x, i) => [x.id, i]));
  const common = a.filter((x) => rb.has(x.id)).map((x) => x.id);
  let d = 0, n = 0;
  for (let i = 0; i < common.length; i++)
    for (let j = i + 1; j < common.length; j++) {
      const sa = Math.sign(ra.get(common[i]) - ra.get(common[j]));
      const sb = Math.sign(rb.get(common[i]) - rb.get(common[j]));
      if (sa !== sb) d++;
      n++;
    }
  /* 掉出榜的瓶子按"排到末尾"计，每掉一个算 1 个位置差 */
  const dropped = a.filter((x) => !rb.has(x.id)).length;
  return { kendall: n ? d / n : 0, dropped };
}

const DIMS = [
  { key: 'subfamily', label: '第1步·小类' },
  { key: 'likedNotes', label: '第2步·喜欢' },
  { key: 'dislikedNotes', label: '第2步·受不了' },
  { key: 'temperature', label: '第3步·气温' },
  { key: 'sweetness', label: '第3步·甜度' },
  { key: 'characterTags', label: '第3步·气质' },
  { key: 'occasion', label: '第4步·场合' },
  { key: 'season', label: '第4步·季节' },
  { key: 'seasonSecond', label: '第4步·次要季节' },
  { key: 'intensity', label: '第5步·浓淡' },
  { key: 'concentration', label: '第5步·浓度' },
  { key: 'longevity', label: '第5步·留香' },
  { key: 'dislikedFamilies', label: '第6步·整族排除' },
];

/* ---------- 跑 ---------- */

const samples = [];
while (samples.length < N) {
  const a = randomProfile();
  if (run(a)) samples.push(a);
}

console.log(`=== 每道题的边际价值（${samples.length} 组随机画像，top-${TOPN}）===\n`);

const rows = [];
for (const d of DIMS) {
  let n = 0, orderSum = 0, kSum = 0, dropSum = 0, top1 = 0;
  for (const a of samples) {
    if (a[d.key] === undefined) continue;
    const base = run(a);
    const cut = { ...a }; delete cut[d.key];
    const without = run(cut);
    if (!base || !without) continue;
    n++;
    if (base[0].id !== without[0].id) top1++;
    const baseIds = new Set(base.map((x) => x.id));
    const wIds = new Set(without.map((x) => x.id));
    /* 榜内换人：基准的 10 个位置里，有多少个被换掉了 */
    let changed = 0;
    for (let i = 0; i < base.length; i++) if (!wIds.has(base[i].id)) changed++;
    orderSum += changed;
    const k = kendall(base, without);
    kSum += k.kendall; dropSum += k.dropped;
  }
  rows.push({
    dim: d.label, n,
    top1: `${top1}/${n}`,
    changed: (orderSum / n).toFixed(2),
    kendall: (kSum / n).toFixed(3),
    dropped: (dropSum / n).toFixed(2),
  });
}

rows.sort((a, b) => parseFloat(b.changed) - parseFloat(a.changed));

const pad = (s, n) => {
  const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 127 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, n - w));
};
console.log(pad('维度', 22) + pad('样本', 7) + pad('top-1换', 10) + pad('榜内换人', 10) + pad('顺序紊乱', 10) + '掉出榜');
console.log('-'.repeat(76));
for (const r of rows) {
  const dead = parseFloat(r.changed) < 0.5 ? '  ← 几乎无效' : '';
  console.log(pad(r.dim, 22) + pad(r.n, 7) + pad(r.top1, 10) + pad(r.changed, 10) + pad(r.kendall, 10) + r.dropped + dead);
}
console.log('\n榜内换人：抽掉该维度后，基准 top-10 里有几个位置换了瓶子（0 = 完全没影响，10 = 全换）');
console.log('顺序紊乱：top-10 内部顺序的肯德尔距离（0 = 顺序不变，0.5 = 完全颠倒）');
