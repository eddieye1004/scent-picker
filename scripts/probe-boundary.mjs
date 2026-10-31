// G6 A/B：boundary 惩罚开/关，20 组固定答案的前 3 名对比
import fs from 'node:fs';
const ROOT = 'C:/Users/16256/Documents/deepseek-harness/default-workspace/scent-picker';
const tax = JSON.parse(fs.readFileSync(ROOT + '/data/taxonomy.json', 'utf8'));
const perf = JSON.parse(fs.readFileSync(ROOT + '/data/perfumes.json', 'utf8'));
const perfumes = perf.perfumes || perf;
const { recommend } = await import('file://' + ROOT + '/src/scoring.js');

const CASES = [
  ['citrus', 'cologne'], ['citrus', 'green-citrus'], ['citrus', 'citrus-floral'], ['citrus', 'aromatic-citrus'],
  ['floral', 'rose'], ['floral', 'white-floral'], ['floral', 'powdery-floral'], ['floral', 'soliflore'],
  ['floral', 'fruity-floral'], ['floral', 'green-floral'],
  ['woody', 'sandalwood'], ['woody', 'oud'], ['woody', 'vetiver'], ['woody', 'mossy'],
  ['woody', 'woody-aromatic'], ['woody', 'dry-woody'],
  ['amber', 'leather'], ['amber', 'incense-cold'], ['amber', 'resinous'], ['amber', 'vanilla-amber'],
  ['amber', 'spicy-amber'], ['amber', 'incense-warm'],
  ['fresh', 'aquatic'], ['fresh', 'fougere'],
  ['gourmand', 'vanilla-gourmand'], ['gourmand', 'fruity-gourmand'],
];

const names = (r) => (r.results || []).map((x) => x.perfume.name);
let diff = 0;
const rows = [];
for (const [fam, sub] of CASES) {
  const a = { family: fam, subfamily: sub, intensity: 3 };
  let on, off;
  try {
    on = recommend(a, perfumes, tax, { topN: 3 });
    off = recommend(a, perfumes, tax, { topN: 3, boundary: false });
  } catch (e) {
    rows.push({ case: fam + '/' + sub, err: e.message.slice(0, 50) });
    continue;
  }
  const A = names(on), B = names(off);
  const same = A.join('|') === B.join('|');
  if (!same) diff++;
  rows.push({ c: fam + '/' + sub, A, B, same, mul: (on.results || []).map((x) => x.boundaryMul ?? 1) });
}
console.log('组数', rows.length, '| 前 3 名发生变化的组:', diff, `(${(diff / rows.length * 100).toFixed(0)}%)`);
console.log('');
for (const r of rows) {
  if (r.err) { console.log(r.c.padEnd(24), 'ERR', r.err); continue; }
  console.log(`${r.c.padEnd(24)} ${r.same ? '同' : '变'}  ${r.A.join(' / ').slice(0, 52)}`);
  if (!r.same) console.log(`${''.padEnd(24)} 关惩罚: ${r.B.join(' / ').slice(0, 52)}`);
}
