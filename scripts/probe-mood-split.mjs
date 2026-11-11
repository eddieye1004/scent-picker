/**
 * probe-mood-split.mjs — 任务 3 的补测：把「气质屏」那 43 分拆成几块，逐块消融。
 *
 * 为什么需要它：probe-mood-value.mjs 只测了「四字段一起删」，得出的 74.3% top-1
 * 变化不能直接说成"这一步的信息量"——里面混着 character(16)、temperature(14)、
 * sweetness(13) 三块的贡献，而且删掉整块 43 分本身就会让所有候选掉分。
 * 要判断值不值得问，得知道：哪一块在真正区分候选、这个区分度在同量级的
 * 其他屏幕因子里算大还是算小。
 *
 * 做法：同一批 1500 组画像（同 seed），对每个候选块做单块消融，比 top-1 换人率、
 * top-3 集合变化率、top-10 平均位移。为了让"删掉 43 分的量级"可比，另外
 * 加一个等量级对照组（likedNotes + anchorNotes = 40 分）。
 *
 * 用法：node scripts/probe-mood-split.mjs
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

/* 与 probe-mood-value.mjs 完全同表（两处漂移会让结论互相打架，改一处必须改两处） */
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
const derive = (p) => ({
  temperature: p.dims.temp === -1 ? 'cool' : 'warm',
  sweetness: p.dims.sweet === -1 ? 1 : 3,
});

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
  if (rnd() < 0.45) a.likedNotes = [pickR(NOTE_POOL)];
  if (rnd() < 0.35) a.dislikedNotes = [pickR(NOTE_POOL)];
  return a;
}
const N = 1500;
const SAMPLE = Array.from({ length: N }, () => pickR(PRESETS)).map(makeProfile);

const TOPN = 10;
function run(a) {
  try {
    const r = recommend(a, perfumes, TAX, { topN: TOPN });
    return (r.matches || r.items || r.results || r || []).slice(0, TOPN)
      .map((x) => ({ id: x.perfume ? x.perfume.id : x.id, score: x.score ?? x.total ?? 0 }));
  } catch { return null; }
}
const drop = (a, keys) => { const c = { ...a }; for (const k of keys) delete c[k]; return c; };

const ABL = [
  ['气质整屏（char+temp+sweet）', ['characterPreset', 'characterTags', 'characterNeg', 'temperature', 'sweetness'], 43],
  ['只删 character（标签+禁止）', ['characterPreset', 'characterTags', 'characterNeg'], 16],
  ['只删 temperature', ['temperature'], 14],
  ['只删 sweetness', ['sweetness'], 13],
  ['只删 temp+sweet（留 character）', ['temperature', 'sweetness'], 27],
  ['对照：emotionFamily', ['emotionFamily'], 30],
  ['对照：likedNotes', ['likedNotes'], 14],
  ['对照：likedNotes+anchorNotes', ['likedNotes', 'anchorNotes'], 40],
  ['对照：occasionFamily', ['occasionFamily'], 22],
];

console.log(`样本 ${SAMPLE.length} 组 · 库 ${perfumes.length} 瓶 · top-${TOPN} · seed 20261111`);
console.log('块消融（每次只从同一份画像里删这一块）');
console.log('  ' + '块'.padEnd(34) + '名义分  top1换人  top3变化  top10位移');
for (const [label, keys, nominal] of ABL) {
  let t1 = 0, t3 = 0, shift = 0, n = 0;
  for (const a of SAMPLE) {
    const base = run(a);
    const cut = run(drop(a, keys));
    if (!base || !cut || !base.length || !cut.length) continue;
    n++;
    if (base[0].id !== cut[0].id) t1++;
    const b3 = base.slice(0, 3).map((x) => x.id).sort().join(','), c3 = cut.slice(0, 3).map((x) => x.id).sort().join(',');
    if (b3 !== c3) t3++;
    let s = 0, m = 0;
    for (const [i, x] of base.entries()) {
      const j = cut.findIndex((y) => y.id === x.id);
      s += Math.abs(i - (j < 0 ? TOPN : j)); m++;
    }
    shift += s / m;
  }
  const p = (x) => `${(x / n * 100).toFixed(1)}%`;
  console.log('  ' + label.padEnd(34) + String(nominal).padStart(5) + '  ' +
    p(t1).padStart(8) + '  ' + p(t3).padStart(8) + '  ' + (shift / n).toFixed(2).padStart(8) + ' 位');
}

/* 第二问：把气质屏的四个字段换成"随机一个其他原型"，看排序动多少。
   这测的不是"删掉会怎样"，而是"答错会怎样"——如果答错几乎无代价，
   说明这些字段实际没在区分；如果代价大，说明用户在这一屏的选择是有后果的。 */
console.log('\n反向对照：把气质换成随机另一个原型（答错的代价）');
{
  let t1 = 0, n = 0, sSum = 0;
  for (const a of SAMPLE) {
    const others = PRESETS.filter((p) => p.id !== a.characterPreset);
    const other = others[Math.floor(Math.random() * others.length)];
    const b = { ...a, characterPreset: other.id, characterTags: other.tags.slice(), characterNeg: other.neg.slice(), ...derive(other) };
    const base = run(a), cut = run(b);
    if (!base || !cut) continue;
    n++;
    if (base[0].id !== cut[0].id) t1++;
    let s = 0;
    for (const [i, x] of base.entries()) {
      const j = cut.findIndex((y) => y.id === x.id);
      s += Math.abs(i - (j < 0 ? TOPN : j));
    }
    sSum += s / base.length;
  }
  console.log(`  top-1 换人 ${(t1 / n * 100).toFixed(1)}%（${t1}/${n}）· top-10 平均位移 ${(sSum / n).toFixed(2)} 位`);
}

/* 第三问：33 分的 temp+sweet 里，有多少分是"白给"的？
   原型 → temp/sweet 是二值映射，所以对任意一族候选，命中 temp 或 sweet 的比例
   决定这两项是"区分器"还是"常数项"。这里统计温/甜两项的命中率分布。 */
console.log('\n温度/甜度两项在候选池上的命中率（决定它们是区分器还是常数项）');
{
  const byTemp = { cool: 0, warm: 0 }, bySweet = { 1: 0, 3: 0 };
  let tot = 0;
  for (const p of perfumes) {
    const ch = p.character || [];
    let mine;
    let r = 0;
    for (const t of ch) { if (t === 'warm') r++; else if (['fresh', 'cool', 'clean', 'green', 'citrusy'].includes(t)) r--; }
    mine = r > 0 ? 'warm' : r < 0 ? 'cool' : 'neutral';
    if (byTemp[mine] != null) byTemp[mine]++;
    const sw = ch.includes('sweet') || ch.includes('creamy');
    bySweet[sw ? 3 : 1]++;
    tot++;
  }
  console.log(`  temp  cool ${(byTemp.cool / tot * 100).toFixed(1)}%  warm ${(byTemp.warm / tot * 100).toFixed(1)}%  neutral ${((tot - byTemp.cool - byTemp.warm) / tot * 100).toFixed(1)}%`);
  console.log(`  sweet 不甜档(1) ${(bySweet[1] / tot * 100).toFixed(1)}%  甜档(3) ${(bySweet[3] / tot * 100).toFixed(1)}%`);
  console.log(`  （口径与 scoring 的 temperatureOf/sweetnessOf 未必逐位一致，只用于看量级）`);
}
