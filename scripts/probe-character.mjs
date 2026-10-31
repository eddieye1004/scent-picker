import fs from 'node:fs';
const ROOT = 'C:/Users/16256/Documents/deepseek-harness/default-workspace/scent-picker';
const list = JSON.parse(fs.readFileSync(ROOT + '/data/perfumes.json', 'utf8')).perfumes;
const N = list.length;
const src = fs.readFileSync(ROOT + '/app.js', 'utf8');

// 从 app.js 切出原型
const s0 = src.indexOf('const CHARACTER_PRESET = [');
let d = 0, e0 = -1;
for (let i = src.indexOf('[', s0); i < src.length; i++) {
  if (src[i] === '[') d++; else if (src[i] === ']') { d--; if (!d) { e0 = i + 1; break; } }
}
const PRESET = new Function(src.slice(s0, e0) + '; return CHARACTER_PRESET;')();
console.log('原型数:', PRESET.length);

// 与评分侧同一套算法（含 neg 扣分）
const scoreOf = (p, pr) => {
  const ch = p.character || [];
  let hit = 0, max = 0;
  for (const [t, w] of Object.entries(pr.tags)) { max += w; if (ch.includes(t)) hit += w; }
  let s = max ? hit / max : 0;
  const bad = (pr.neg || []).filter((t) => ch.includes(t)).length;
  if (bad) s = Math.max(0, s * (1 - 0.22 * bad));
  return s;
};

console.log('\n=== 每项覆盖（得分 > 0 的瓶数）与前三瓶 ===');
for (const pr of PRESET) {
  const ranked = list.map((p) => ({ p, s: scoreOf(p, pr) })).sort((a, b) => b.s - a.s);
  const nz = ranked.filter((x) => x.s > 0).length;
  console.log(`  ${pr.zh.padEnd(6)} 非零 ${String(nz).padStart(4)} (${(nz / N * 100).toFixed(0)}%)  ` +
    ranked.slice(0, 3).map((x) => x.p.name).join(' / ').slice(0, 50));
}

// 前 200 名集合的两两重合
const topSet = (pr, k = 200) => new Set(list.map((p, i) => ({ i, s: scoreOf(p, pr) }))
  .sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.i));
let mx = 0, mxp = '';
for (let i = 0; i < PRESET.length; i++) {
  for (let j = i + 1; j < PRESET.length; j++) {
    const A = topSet(PRESET[i]), B = topSet(PRESET[j]);
    let n = 0; for (const x of A) if (B.has(x)) n++;
    if (n / 200 > mx) { mx = n / 200; mxp = PRESET[i].zh + ' × ' + PRESET[j].zh; }
  }
}
console.log(`\n两两重合最高 ${(mx * 100).toFixed(0)}%  (${mxp})`);

// 并列率
const gaps = [];
for (const p of list) {
  const a = PRESET.map((pr) => ({ id: pr.id, s: scoreOf(p, pr) })).sort((x, y) => y.s - x.s);
  gaps.push(a[0].s - a[1].s);
}
gaps.sort((a, b) => a - b);
const tie = gaps.filter((x) => x < 0.05).length;
console.log(`top1 与 top2 分差：最小 ${(gaps[0] * 100).toFixed(0)}% | 中位 ${(gaps[Math.floor(gaps.length / 2)] * 100).toFixed(0)}% | 并列(<5%) ${tie} 瓶 (${(tie / N * 100).toFixed(0)}%)`);

// 与旧版对照
const OLD = [
  ['清爽干净', { fresh: 1, clean: 1, green: 1, citrusy: 1 }, []],
  ['清冷疏离', { woody: 1, earthy: 1, herbal: 1 }, []],
  ['温暖亲和', { warm: 1, amber: 1, resinous: 1 }, []],
  ['甜而柔软', { sweet: 1, creamy: 1 }, []],
  ['花香温柔', { floral: 1, powdery: 1 }, []],
  ['明亮有神', { citrusy: 1, fruity: 1, green: 1 }, []],
  ['深沉神秘', { smoky: 1, leathery: 1, resinous: 1, spicy: 1 }, []],
  ['贴肤慵懒', { musky: 1, powdery: 1, creamy: 1 }, []],
].map(([zh, tags, neg]) => ({ zh, tags, neg }));
const topSetOld = (pr, k = 200) => new Set(list.map((p, i) => ({ i, s: scoreOf(p, pr) }))
  .sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.i));
let omx = 0, omp = '';
for (let i = 0; i < OLD.length; i++) {
  for (let j = i + 1; j < OLD.length; j++) {
    const A = topSetOld(OLD[i]), B = topSetOld(OLD[j]);
    let n = 0; for (const x of A) if (B.has(x)) n++;
    if (n / 200 > omx) { omx = n / 200; omp = OLD[i].zh + ' × ' + OLD[j].zh; }
  }
}
const og = [];
for (const p of list) {
  const a = OLD.map((pr) => ({ s: scoreOf(p, pr) })).sort((x, y) => y.s - x.s);
  og.push(a[0].s - a[1].s);
}
og.sort((a, b) => a - b);
console.log(`旧 8 项对照：重合最高 ${(omx * 100).toFixed(0)}% (${omp})，并列 ${og.filter((x) => x < 0.05).length} 瓶 (${(og.filter((x) => x < 0.05).length / N * 100).toFixed(0)}%)`);

// 推导一致性
const d0 = src.indexOf('const FAM_WEIGHT = {');
const d1 = src.indexOf('/* 七个选项按');
const r0 = src.indexOf('function rankCharacterPresets');
let d2 = 0, rEnd = -1;
for (let i = src.indexOf('{', r0); i < src.length; i++) {
  if (src[i] === '{') d2++; else if (src[i] === '}') { d2--; if (!d2) { rEnd = i + 1; break; } }
}
const fn = new Function(src.slice(s0, e0) + ';' + src.slice(d0, d1) + src.slice(r0, rEnd) + ' return rankCharacterPresets;')();
console.log('\n=== 推导一致性 ===');
const CASES = [
  [{ temperature: 'cool', sweetness: 0, family: 'fresh' }, '洁净清透'],
  [{ temperature: 'cool', sweetness: 0, family: 'woody' }, '雨后林地'],
  [{ temperature: 'cool', sweetness: 3, family: 'floral' }, '冰镇果露'],
  [{ temperature: 'warm', sweetness: 0, family: 'fresh' }, '干爽草本'],
  [{ temperature: 'warm', sweetness: 0, family: 'woody' }, '皮革烟草'],
  [{ temperature: 'warm', sweetness: 3, family: 'floral' }, '蜜感白花'],
  [{ temperature: 'warm', sweetness: 3, family: 'gourmand' }, '焦糖琥珀'],
];
let ok = 0;
for (const [ans, want] of CASES) {
  const got = fn(ans)[0].zh;
  if (got === want) ok++;
  console.log(`  ${JSON.stringify(ans).padEnd(54)} → ${got.padEnd(6)}${got === want ? ' ✓' : ' ✗ 期望 ' + want}`);
}
console.log(`一致性 ${ok}/${CASES.length}`);
