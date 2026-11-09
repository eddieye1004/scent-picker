/**
 * probe-q-value.mjs — 每一道题到底值不值得问？
 *
 * 目的：7 步问卷里，哪些题真的改变了推荐结果，哪些题问了等于没问。
 *
 * 方法：每组画像先跑一次基准，再抽掉一个维度重跑，比较
 *   ① top-1 是否换人  ② top-3 集合是否变  ③ top-10 里有多少瓶挪了位
 *   ④ 原第 1 名被扣掉多少分
 *
 * 第 ③ 项比前两项敏感：像 seasonSecond（+5 分）这种弱因子几乎不可能翻掉第 1 名，
 * 但它能让第 4–10 名重新排。只看 top-1 会低估弱因子的真实作用。
 *
 * 三个容易写错的地方（本文件已经踩过）：
 *   1. `characterTags` 要传**数据层的英文标签**（fresh / clean / woody …），
 *      不是 UI 上的中文名（洁净清透 / 雨后林地）。传中文等于每一项都 0 命中。
 *   2. `dislikedFamilies` 只有在「该族确实是这瓶的主族」时才扣分，
 *      所以要挑与基准结果真冲突的值，随便填一个不冲突的族会得到假的 0 影响。
 *   3. `longevity` 比的是 `p.longevityInferred`（由浓度推断），不是源站字段。
 *
 * 用法：node scripts/probe-q-value.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8'));
const TAX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
const perfumes = DATA.perfumes;
const { recommend, WEIGHTS } = await import(pathToFileURL(path.join(ROOT, 'src', 'scoring.js')).href);

const TOPN = 10;

function run(answers) {
  try {
    const r = recommend(answers, perfumes, TAX, { topN: TOPN });
    const list = (r.matches || r.items || r.results || r || []).slice(0, TOPN).map((x) => ({
      id: x.perfume ? x.perfume.id : x.id,
      score: x.score ?? x.total ?? 0,
    }));
    return list.length ? list : null;
  } catch (e) {
    return null;
  }
}

/* ---------------- 基准画像（满答） ----------------
   每个维度都填满，且填的值彼此一致（不制造自相矛盾的画像）。
   characterTags 用数据层英文标签；dislikedFamilies 用「与本题结果真冲突」的族。 */

const FULL = [
  {
    id: 'F01', label: '花香·约会',
    a: {
      family: 'floral', subfamily: 'white-floral', occasion: 'date', intensity: 4,
      likedNotes: ['jasmine', 'tuberose'], dislikedNotes: ['oud'],
      temperature: 'warm', sweetness: 2, season: 'spring', seasonSecond: 'autumn',
      characterTags: ['floral', 'creamy', 'powdery'], characterNeg: [],
      concentration: 'eau-de-parfum', longevity: 4,
      dislikedFamilies: ['fresh', 'citrus'],
    },
  },
  {
    id: 'F02', label: '木质·正式',
    a: {
      family: 'woody', subfamily: 'sandalwood', occasion: 'formal', intensity: 4,
      likedNotes: ['sandalwood', 'cedar'], dislikedNotes: ['vanilla'],
      temperature: 'cool', sweetness: 1, season: 'winter', seasonSecond: 'autumn',
      characterTags: ['woody', 'earthy'], characterNeg: [],
      concentration: 'eau-de-parfum', longevity: 5,
      dislikedFamilies: ['gourmand', 'floral'],
    },
  },
  {
    id: 'F03', label: '柑橘·通勤',
    a: {
      family: 'citrus', subfamily: 'cologne', occasion: 'commute', intensity: 2,
      likedNotes: ['bergamot', 'neroli'], dislikedNotes: ['amber'],
      temperature: 'cool', sweetness: 1, season: 'summer', seasonSecond: 'spring',
      characterTags: ['citrusy', 'fresh', 'clean'], characterNeg: [],
      concentration: 'eau-de-cologne', longevity: 2,
      dislikedFamilies: ['amber', 'gourmand'],
    },
  },
  {
    id: 'F04', label: '美食·日常',
    a: {
      family: 'gourmand', subfamily: 'vanilla-gourmand', occasion: 'daily', intensity: 3,
      likedNotes: ['vanilla', 'tonka'], dislikedNotes: ['vetiver'],
      temperature: 'warm', sweetness: 3, season: 'autumn', seasonSecond: 'winter',
      characterTags: ['sweet', 'creamy', 'amber'], characterNeg: [],
      concentration: 'eau-de-parfum', longevity: 4,
      dislikedFamilies: ['fresh', 'citrus'],
    },
  },
  {
    id: 'F05', label: '琥珀·神秘',
    a: {
      family: 'amber', subfamily: 'incense', occasion: 'date', intensity: 5,
      likedNotes: ['incense', 'labdanum'], dislikedNotes: ['citrus'],
      temperature: 'warm', sweetness: 2, season: 'winter', seasonSecond: 'autumn',
      characterTags: ['resinous', 'smoky', 'amber'], characterNeg: [],
      concentration: 'extrait', longevity: 5,
      dislikedFamilies: ['fresh', 'citrus'],
    },
  },
  {
    id: 'F06', label: '清新·户外',
    a: {
      family: 'fresh', subfamily: 'aquatic', occasion: 'outdoor', intensity: 2,
      likedNotes: ['calone', 'mint'], dislikedNotes: ['amber'],
      temperature: 'cool', sweetness: 1, season: 'summer', seasonSecond: 'spring',
      characterTags: ['fresh', 'clean', 'salty'], characterNeg: [],
      concentration: 'eau-de-toilette', longevity: 2,
      dislikedFamilies: ['gourmand', 'amber'],
    },
  },
];

/* ---------------- 要抽掉的维度 ---------------- */

const DIMS = [
  { key: 'subfamily', label: '第1步·小类（中圈）' },
  { key: 'likedNotes', label: '第2步·喜欢的香调' },
  { key: 'dislikedNotes', label: '第2步·受不了的香调' },
  { key: 'temperature', label: '第3步·气温' },
  { key: 'sweetness', label: '第3步·甜度' },
  { key: 'characterTags', label: '第3步·气质原型' },
  { key: 'occasion', label: '第4步·场合' },
  { key: 'season', label: '第4步·季节' },
  { key: 'seasonSecond', label: '第4步·次要季节' },
  { key: 'intensity', label: '第5步·浓淡' },
  { key: 'concentration', label: '第5步·浓度' },
  { key: 'longevity', label: '第5步·留香' },
  { key: 'dislikedFamilies', label: '第6步·整族排除' },
];

/* ---------------- 跑 ---------------- */

const pad = (s, n) => {
  const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 127 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, n - w));
};

console.log('=== 每一道题对推荐排序的实际贡献 ===');
console.log(`样本：${FULL.length} 组满答画像；库 ${perfumes.length} 瓶；比较 top-${TOPN}\n`);

const rows = [];
for (const d of DIMS) {
  let t1 = 0, t3 = 0, total = 0;
  let shiftSum = 0, shiftN = 0;
  let dropSum = 0, dropN = 0;

  for (const s of FULL) {
    if (s.a[d.key] === undefined) continue;
    const base = run(s.a);
    const cut = { ...s.a };
    delete cut[d.key];
    const without = run(cut);
    if (!base || !without) continue;
    total++;

    if (base[0].id !== without[0].id) t1++;
    const b3 = base.slice(0, 3).map((x) => x.id).join(',');
    const w3 = without.slice(0, 3).map((x) => x.id).join(',');
    if (b3 !== w3) t3++;

    /* top-10 里每瓶的排名位移，取平均 */
    const posBase = new Map(base.map((x, i) => [x.id, i]));
    const posWithout = new Map(without.map((x, i) => [x.id, i]));
    let shift = 0, cnt = 0;
    for (const [id, pb] of posBase) {
      const pw = posWithout.has(id) ? posWithout.get(id) : TOPN;  // 掉出榜按末尾算
      shift += Math.abs(pb - pw);
      cnt++;
    }
    if (cnt) { shiftSum += shift / cnt; shiftN++; }

    /* 原第 1 名被扣掉多少分 */
    const still = without.find((x) => x.id === base[0].id);
    if (still) { dropSum += base[0].score - still.score; dropN++; }
  }

  rows.push({
    dim: d.label,
    n: total,
    t1,
    t3,
    shift: shiftN ? (shiftSum / shiftN).toFixed(2) : '—',
    drop: dropN ? (dropSum / dropN).toFixed(2) : '—',
  });
}

/* 按「对 top-10 的平均位移」排序 —— 这是最能反映真实影响力的指标 */
rows.sort((a, b) => parseFloat(b.shift === '—' ? -1 : b.shift) - parseFloat(a.shift === '—' ? -1 : a.shift));

console.log(pad('维度', 24) + pad('top-1 换', 11) + pad('top-3 变', 11) + pad('top-10 均位移', 15) + '首名掉分');
console.log('-'.repeat(76));
for (const r of rows) {
  const flag = parseFloat(r.shift) < 0.15 ? '  ← 几乎无影响' : '';
  console.log(pad(r.dim, 24) + pad(`${r.t1}/${r.n}`, 11) + pad(`${r.t3}/${r.n}`, 11) + pad(r.shift, 15) + r.drop + flag);
}

console.log('\n【读法】top-10 均位移 < 0.15 基本等于「这道题答不答一个样」。');
console.log('【权重对照】character 16 / concentration 12 / longevity 10 / seasonSecond 5 /');
console.log('            season 10 / intensity 18 / likedNotes 14 / dislikedNotes -40 / dislikedFamily -30');
