/**
 * probe-mood-dims.mjs — 任务 3 补测二：气质屏对「匹配度百分比是否显示」的影响。
 *
 * 为什么单独测：scoring 的 activeDims 把 temperature / sweetness /
 * characterTags / characterNeg **各算一个维度**（src/scoring.js:372-377），
 * 而门槛 MATCH_PCT_MIN_DIMS = 8。所以删掉气质屏不只是掉 43 分，
 * 还可能让 activeDims 掉到 8 以下 —— 结果页会整块不显示百分比。
 * 这个后果比"排序变了"更显眼，必须在结论里给数字。
 *
 * 用法：node scripts/probe-mood-dims.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8'));
const TAX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
const { buildProfile, MATCH_PCT_MIN_DIMS } = await import(pathToFileURL(path.join(ROOT, 'src', 'scoring.js')).href);

const FAMILIES = ['citrus', 'floral', 'woody', 'amber', 'fresh', 'gourmand'];
const OCC = (TAX.occasionMap || []).map((o) => o.id);
const CONCS = [...new Set(DATA.perfumes.map((p) => p.concentration).filter(Boolean))];

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

const MOOD = {
  characterPreset: 'honey-white',
  characterTags: ['floral', 'creamy', 'powdery'],
  characterNeg: ['leathery', 'smoky', 'citrusy', 'green'],
  temperature: 'warm',
  sweetness: 3,
};

/* 一份"真实答法"的画像：必答项固定，可选项按概率出现 —— 概率取自
   probe-mood-value 里对答题深度的假设（likedNotes 45%、dislikedNotes 35%），
   其余项按"一半人会答"处理。 */
function profile(withMood) {
  const a = { family: pickR(FAMILIES), occasion: pickR(OCC), intensity: 1 + Math.floor(rnd() * 5) };
  if (rnd() < 0.5) a.subfamily = TAX.families.find((f) => f.id === a.family)?.subfamilies?.[0]?.id;
  if (rnd() < 0.8) a.season = pickR(['spring', 'summer', 'autumn', 'winter']);
  if (rnd() < 0.4) a.seasonSecond = pickR(['spring', 'summer', 'autumn', 'winter']);
  if (rnd() < 0.7) a.concentration = pickR(CONCS);
  if (rnd() < 0.6) a.longevity = 2 + Math.floor(rnd() * 4);
  if (rnd() < 0.45) a.likedNotes = ['bergamot'];
  if (rnd() < 0.35) a.dislikedNotes = ['oud'];
  if (rnd() < 0.3) a.anchorNotes = ['cedar'];
  return withMood ? { ...a, ...MOOD } : a;
}

const dims = (a) => {
  try { return buildProfile(a, TAX).activeDims; } catch { return null; }
};

console.log(`门槛 MATCH_PCT_MIN_DIMS = ${MATCH_PCT_MIN_DIMS}`);
console.log('固定画像对照（其余题答满）：');
{
  const fullBase = {
    family: 'floral', occasion: OCC[0], intensity: 3, season: 'autumn', seasonSecond: 'spring',
    concentration: 'eau-de-parfum', longevity: 4, likedNotes: ['bergamot'], dislikedNotes: ['oud'], anchorNotes: ['cedar'],
  };
  const w = dims({ ...fullBase, ...MOOD });
  const wo = dims(fullBase);
  console.log(`  有气质 ${w} 维 / 无气质 ${wo} 维（气质屏本身贡献 ${w - wo} 维：冷暖、甜度、标签、禁止标签）`);
}
console.log('轻答画像对照（只答家族 + 场合 + 浓淡）：');
{
  const light = { family: 'woody', occasion: OCC[0], intensity: 3 };
  const w = dims({ ...light, ...MOOD });
  const wo = dims(light);
  console.log(`  有气质 ${w} 维 / 无气质 ${wo} 维 —— 两者都 ${w >= MATCH_PCT_MIN_DIMS ? '显示' : '不显示'}百分比`);
}

const N = 4000;
let moodRescues = 0, underWith = 0, underWithout = 0;
for (let i = 0; i < N; i++) {
  /* **同一份画像**的两种世界：先抽一次底，再分别加上/去掉气质四字段。
     分开抽两次会把"这题答了/没答"和"别题抽得多不多"混在一起。 */
  const base = profile(false);
  const w = dims({ ...base, ...MOOD });
  const wo = dims(base);
  if (w == null || wo == null) continue;
  if (w >= MATCH_PCT_MIN_DIMS && wo < MATCH_PCT_MIN_DIMS) moodRescues++;
  if (w < MATCH_PCT_MIN_DIMS) underWith++;
  if (wo < MATCH_PCT_MIN_DIMS) underWithout++;
}
console.log(`\n随机画像 ${N} 组（可选项按概率出现）：`);
console.log(`  无气质时掉到门槛以下：${underWithout}（${(underWithout / N * 100).toFixed(1)}%）`);
console.log(`  有气质时仍不到门槛：${underWith}（${(underWith / N * 100).toFixed(1)}%）`);
console.log(`  气质屏正是"够 8 维"的分水岭：${moodRescues}（${(moodRescues / N * 100).toFixed(1)}%）`);
