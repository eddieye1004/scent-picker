/* 三个新因子（气味温度 / 甜度 / 已知锚点）是否真的改变了推荐。
   判据不是"变了就好"，而是：
     ① 每个新因子都进得了 breakdown（不参与=白加）
     ② 用户选的那一档，前三名确实更符合（用独立指标核对，不看分数）
     ③ 锚点屏确实按 notesAll 的重合度生效 */
import { recommend } from '../src/scoring.js';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TAX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));
const PERFS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8')).perfumes;

const base = {
  family: 'floral', subfamily: null, emotion: null, occasion: 'commute', intensity: 3,
  likedNotes: [], dislikedNotes: [], likedZh: {}, dislikedZh: {},
  characterPreset: null, characterTags: [], season: null, seasonSecond: null,
  concentration: null, longevity: null, dislikedFamilies: [],
  temperature: null, sweetness: null, anchorNotes: [], anchorPerfumeNotes: [],
};

const WARM = ['warm', 'amber', 'resinous', 'spicy', 'smoky', 'leathery', 'sweet', 'creamy'];
const COOL = ['fresh', 'clean', 'green', 'citrusy', 'herbal', 'salty'];
const SW = { sweet: 1.0, creamy: 0.7, fruity: 0.5, powdery: 0.3 };
const sweetOf = (p) => {
  let v = 0;
  for (const t of (p.character || [])) v += SW[t] || 0;
  v += 1.2 * ((p.families || {}).gourmand || 0);
  return Math.min(1, v / 2.9);
};

const run = (a) => recommend(a, PERFS, TAX, { topN: 3 }).results;

console.log('=== A. 气味温度：选「偏凉」后，前三名是不是真的更凉 ===');
const cool = run({ ...base, temperature: 'cool' });
const noTemp = run(base);
const coolness = (p) => {
  const ch = p.perfume.character || [];
  const w = ch.some((t) => WARM.includes(t));
  const c = ch.some((t) => COOL.includes(t));
  return c ? (w ? 0.5 : 1) : 0;
};
const avg = (arr, f) => (arr.reduce((a, p) => a + f(p), 0) / arr.length).toFixed(2);
console.log('  不选温度时前三平均凉度:', avg(noTemp, coolness));
console.log('  选偏凉后前三平均凉度:  ', avg(cool, coolness));
console.log('  前三：', cool.map((p) => p.perfume.name).join(' | '));
const tempInReasons = cool.some((p) => p.reasons.some((r) => r.includes('偏凉')));
console.log('  理由里出现「偏凉」:', tempInReasons ? '✓' : '✗');

console.log('\n=== B. 甜度：选「完全不甜」vs「很甜」 ===');
const dry = run({ ...base, sweetness: 0 });
const sweet = run({ ...base, sweetness: 3 });
console.log('  选完全不甜 前三平均甜度:', avg(dry, (p) => sweetOf(p.perfume)));
console.log('  选很甜     前三平均甜度:', avg(sweet, (p) => sweetOf(p.perfume)));
console.log('  不甜前三：', dry.map((p) => p.perfume.name).join(' | '));
console.log('  很甜前三：', sweet.map((p) => p.perfume.name).join(' | '));

console.log('\n=== C. 锚点：用一瓶真实香水当输入，看前三名与它的香调重合 ===');
/* 选一个 baseline 前三里没有的锚点，否则测不出锚点是否生效 ——
   第一版拿 Shalimar 当锚点，而它本来就是 floral 的第一名，
   于是「有锚点/无锚点」两次结果完全相同，看起来像锚点没起作用。 */
const baseline = new Set(run(base).map((p) => p.perfume.id));
const seed = PERFS.find((p) => !baseline.has(p.id) && (p.notesAll || []).length >= 8);
const seedNotes = seed.notesAll.map((n) => n.toLowerCase());
const overlap = (p) => {
  const set = new Set((p.notesAll || []).map((x) => x.toLowerCase()));
  return seedNotes.filter((n) => set.has(n)).length;
};
const withAnchor = run({ ...base, anchorNotes: seedNotes, anchorPerfumeNotes: seedNotes });
const without = run(base);
console.log(`  锚点 = ${seed.brand} ${seed.name}（${seedNotes.length} 个香调）`);
console.log('  无锚点 前三平均重合:', (without.reduce((a, p) => a + overlap(p.perfume), 0) / 3).toFixed(1));
console.log('  有锚点 前三平均重合:', (withAnchor.reduce((a, p) => a + overlap(p.perfume), 0) / 3).toFixed(1));
withAnchor.forEach((p) => {
  console.log(`    ${p.perfume.brand} ${p.perfume.name}  重合 ${overlap(p.perfume)} 个  | ${p.reasons.find((r) => r.includes('点名那瓶')) || '(无锚点理由)'}`);
});

console.log('\n=== D. 三个新因子是否都进了理由 ===');
const all = [...cool, ...dry, ...sweet, ...withAnchor];
const tally = {};
all.forEach((p) => p.breakdown.forEach((b) => {
  if (['temperature', 'sweetness', 'anchor'].includes(b.factor)) tally[b.factor] = (tally[b.factor] || 0) + 1;
}));
for (const f of ['temperature', 'sweetness', 'anchor']) {
  console.log(`  ${f.padEnd(14)} ${String(tally[f] || 0).padStart(2)} 次 ${tally[f] ? '✓ 参与' : '✗ 未参与'}`);
}

console.log('\n=== E. 锚点权重是否过高（会不会压掉第 1 步的家族选择）===');
let sameFam = 0;
for (const p of withAnchor) {
  const top = Object.entries(p.perfume.families).filter(([k]) => k !== '_').sort((a, b) => b[1] - a[1])[0][0];
  if (top === 'floral') sameFam += 1;
}
console.log(`  选了花香 + 锚点为 Shalimar（本身是花香）→ 前三主导仍是花香 ${sameFam}/3`);
const cross = run({ ...base, family: 'citrus', anchorNotes: seedNotes, anchorPerfumeNotes: seedNotes });
let citrusTop = 0;
for (const p of cross) {
  const top = Object.entries(p.perfume.families).filter(([k]) => k !== '_').sort((a, b) => b[1] - a[1])[0][0];
  if (top === 'citrus') citrusTop += 1;
}
console.log(`  选了柑橘 + 锚点为 Shalimar（花香）→ 前三主导仍是柑橘 ${citrusTop}/3  ` +
  `（<3 说明锚点在跟第 1 步打架，需要降权）`);
