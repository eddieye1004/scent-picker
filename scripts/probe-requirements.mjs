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
};

console.log('=== A. 浓度三分类：EDC 池只剩 5 瓶，推荐会怎样 ===');
for (const conc of ['eau-de-cologne', 'eau-de-toilette', 'eau-de-parfum']) {
  const r = recommend({ ...base, concentration: conc }, PERFS, TAX, { topN: 3 });
  const exact = r.results.filter((p) => p.perfume.concentration === conc).length;
  console.log(`  选 ${conc.padEnd(16)} → 前三里同浓度 ${exact}/3  ` +
    r.results.map((p) => `${p.perfume.name}(${p.perfume.concentration || '未标'})`).join(' | '));
}

console.log('\n=== B. 品牌维度：选「喜欢 Byredo」会不会霸榜 ===');
const byredo = PERFS.filter((p) => p.brand === 'Byredo');
console.log(`  Byredo 有 ${byredo.length} 瓶，分布在 ${new Set(byredo.map((p) => p.familySource)).size} 个源家族`);
const r2 = recommend({ ...base, likedBrands: ['Byredo'] }, PERFS, TAX, { topN: 3 });
console.log('  当前（无品牌因子）前三：', r2.results.map((p) => `${p.perfume.brand} ${p.perfume.name}`).join(' | '));
console.log('  注意：排重逻辑里有 seenBrand，同品牌不许占满前三 ——');
console.log('        这与「用户说他喜欢这个品牌」直接冲突，必须重新设计而不是简单加权。');

console.log('\n=== C. 甜度分档的真实分布（供做选项用）===');
const SWEET = { sweet: 1.0, creamy: 0.7, fruity: 0.5, powdery: 0.3 };
const score = (p) => {
  const ch = p.character || [];
  let s = ch.reduce((a, t) => a + (SWEET[t] || 0), 0);
  s += 1.2 * ((p.families || {}).gourmand || 0);
  return s;
};
const buckets = { 不甜: 0, 微甜: 0, 中甜: 0, 很甜: 0 };
for (const p of PERFS) {
  const s = score(p);
  if (s <= 0.3) buckets['不甜'] += 1;
  else if (s <= 1.0) buckets['微甜'] += 1;
  else if (s <= 1.8) buckets['中甜'] += 1;
  else buckets['很甜'] += 1;
}
console.log(' ', JSON.stringify(buckets));
console.log('  最甜的 5 瓶:', PERFS.map((p) => [p.brand + ' ' + p.name, score(p)])
  .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, s]) => `${n}(${s.toFixed(1)})`).join(' | '));

console.log('\n=== D. 气味温度：暖/凉可否做成"体感"选项 ===');
const WARM = ['warm', 'amber', 'resinous', 'spicy', 'smoky', 'leathery', 'sweet', 'creamy'];
const COOL = ['fresh', 'clean', 'green', 'citrusy', 'herbal', 'salty'];
const rows = { 偏暖: 0, 偏凉: 0, 中性: 0 };
for (const p of PERFS) {
  const ch = p.character || [];
  const w = ch.some((t) => WARM.includes(t));
  const c = ch.some((t) => COOL.includes(t));
  if (w && !c) rows['偏暖'] += 1;
  else if (c && !w) rows['偏凉'] += 1;
  else rows['中性'] += 1;
}
console.log(' ', JSON.stringify(rows));
console.log('  三档都能分到 100+ 瓶，可做');

console.log('\n=== E. 扩散度：数据实况 ===');
console.log('  perfumes 字段里没有 sillage。taxonomy.occasionMap 有 sillageMax，');
console.log('  但 scoring.js:207 只把它写进 profile，**全文再无引用** —— 是一条死字段。');
console.log('  结论：扩散度不能做成筛选；倒是可以先把这条死字段接上（按场合约束），');
console.log('        但数据没有每瓶的扩散值，接了也无从判定 —— 仍不可做。');

console.log('\n=== F. 价格：数据实况 ===');
console.log('  perfumes 里没有 price / msrp / retail 任何字段。');
console.log('  上游 Scento 数据集按 CC BY 4.0 发布，本身不含价格。');
console.log('  结论：不能做价格筛选。可做的是「同品牌价格档位」这类知识性提示，');
console.log('        但需要另取数据源，且必须标来源与日期。');
