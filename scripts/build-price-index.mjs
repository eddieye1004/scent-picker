/**
 * build-price-index.mjs — 把「淘宝实测价位」压成问卷可用的一张查价表。
 *
 * 为什么需要这一步：`data/perfumes.json` 是 Scento 开放数据集，**没有价格字段**
 * （`src/scoring.js:7` 的注释与 `docs/DECISIONS.md` 的「是否加价格筛选」一行都记着
 * 这件事）。价位只存在于 `data/products.candidates.json` 的 `picked.price` 里 ——
 * 那是淘宝客按关键词配对的结果，不是瓶级标价。
 *
 * 所以这张表只做一件事：给出「这一瓶的实测价位落在哪个档」，并把它的
 * **可信度边界**一起写进产物，避免下游把它当成精确价格用。
 *
 * ---- 清洗规则（每条都对应一类真实脏数据，2026-11-16 实测）----
 *   ① 剔除「试香 / 小样 / 分装 / 试管 / 合集 / 套装 / Q版」标题：这些是 1–5ml 分装，
 *      标价 ¥8–¥22，与整瓶价差两个数量级。实测命中 17 条（最低 ¥4）。
 *   ② 剔除标题写明容量且 < 30ml 的：同上，容量是比关键词更硬的证据。实测 5 条。
 *   ③ 剩下的仍不是瓶级价：661 条里只有 152 条（23.0%）写了容量，
 *      同一品牌实测价差可达 16 倍（BYREDO ¥298–¥4788）。所以只能分**粗档**，
 *      不能拿来做「¥780 以下」这种精确切分。
 *
 * ---- 覆盖率的诚实交代 ----
 *   1388 瓶里只有 639 瓶（46.0%）有可用价位，**749 瓶没有任何价位**。
 *   因此预算题绝不能做成硬过滤：硬过滤会无条件丢掉一半库。
 *   查表里没有的瓶子一律记 `null`，下游必须按「价位未知」处理，
 *   不能默默当成最便宜那档。
 *
 * 用法：
 *   node scripts/build-price-index.mjs          重建 data/price-index.json
 *   node scripts/build-price-index.mjs --check  只校验是否同步，不同步退出码 1
 *
 * 产物：data/price-index.json
 *   { generatedAt, source, bands:[{id,zh,lo,hi}], stats:{...}, byId:{ id: bandIndex|null } }
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUT = path.join(ROOT, 'data', 'price-index.json');

/* 档位边界来自实测分布（639 瓶可用价位的分位）：
   p5 = ¥75 / p50 = ¥620 / p95 = ¥2598。
   取 300 / 800 / 2000 三刀，四档容量 168 / 207 / 214 / 50 ——
   最窄的一档（≥2000）仍有 50 瓶，够撑 3 瓶推荐，不会出现「选了没结果」。 */
const BANDS = [
  { id: 'b0', zh: '300 元以内', lo: 0, hi: 300 },
  { id: 'b1', zh: '300–800 元', lo: 300, hi: 800 },
  { id: 'b2', zh: '800–2000 元', lo: 800, hi: 2000 },
  { id: 'b3', zh: '2000 元以上', lo: 2000, hi: Infinity },
];

/* 分装/小样的标题特征。任一命中即视为「不是整瓶价」。 */
const SAMPLE_RE = /试香|小样|分装|试管|合集|套装|Q版/i;
/* 容量：命中则取第一个数字，用于判 < 30ml。 */
const ML_RE = /(\d{2,3})\s*(?:ml|ML|Ml|毫升)/;

const perfumes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8')).perfumes;
const cands = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'products.candidates.json'), 'utf8')).accepted || [];

const priceOf = new Map();
let droppedSample = 0;
let droppedSmall = 0;
for (const e of cands) {
  const raw = e && e.picked && e.picked.price;
  if (raw == null || raw === '') continue;
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) continue;
  const title = String(e.picked.title || '');
  if (SAMPLE_RE.test(title)) { droppedSample += 1; continue; }
  const m = title.match(ML_RE);
  if (m && Number(m[1]) < 30) { droppedSmall += 1; continue; }
  /* 同一瓶可能出现多条候选，取最低价 —— 宁可低估，不让用户以为是高价；
     且低估的方向是「仍在预算内」，不会造成「说买得起其实买不起」。 */
  const prev = priceOf.get(e.id);
  if (prev == null || v < prev) priceOf.set(e.id, v);
}

const bandOf = (v) => {
  for (let i = 0; i < BANDS.length; i += 1) {
    if (v >= BANDS[i].lo && v < BANDS[i].hi) return i;
  }
  return BANDS.length - 1;
};

const byId = {};
const bandCount = BANDS.map(() => 0);
let priced = 0;
for (const p of perfumes) {
  const v = priceOf.get(p.id);
  if (v == null) { byId[p.id] = null; continue; }
  const b = bandOf(v);
  byId[p.id] = b;
  bandCount[b] += 1;
  priced += 1;
}

const payload = {
  generatedAt: '2026-11-16',
  source: 'data/products.candidates.json 的 picked.price（淘宝客关键词配对结果，非瓶级标价）',
  caveat: [
    '价位是商品链接标价，不是同规格瓶级标价：661 条里只有 152 条写了容量。',
    '同一品牌实测价差可达 16 倍（BYREDO ¥298–¥4788），所以只做四档粗分，不做精确切分。',
    `1388 瓶中 ${priced} 瓶有可用价位，${perfumes.length - priced} 瓶为 null（价位未知）。`,
    'null ≠ 最便宜。下游必须当作「未知」处理，不得回落到默认档。',
  ],
  bands: BANDS.map(({ id, zh, lo, hi }) => ({ id, zh, lo, hi: hi === Infinity ? null : hi })),
  stats: {
    catalog: perfumes.length,
    priced,
    unpriced: perfumes.length - priced,
    droppedSample,
    droppedSmall,
    bandCount,
  },
  byId,
};

const text = JSON.stringify(payload, null, 1);
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  const same = cur === text;
  console.log(same
    ? `✓ price-index.json 一致（${text.length} 字节，${priced} 瓶有价）`
    : `✗ price-index.json 不同步：现有 ${cur.length} / 应为 ${text.length}`);
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(OUT, text);
console.log(`data/price-index.json 已重建：${priced}/${perfumes.length} 瓶有价`
  + `（剔除分装 ${droppedSample}、小容量 ${droppedSmall}），四档 ${bandCount.join(' / ')}`);
