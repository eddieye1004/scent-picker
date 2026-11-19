/**
 * build-prices.mjs — 从 data/products.candidates.json 抽出「id → 挂牌价」小表
 *
 * 为什么要有这一步：products.candidates.json 是 2.2 MB 的采集中间产物，
 * 里面每瓶只留了一个被选中的商品（picked），带 price 字段；而问卷的预算题
 * 只需要 id → 价格区间，不需要标题、店铺、跳转串。整份塞进前端等于让首屏
 * 多下 2 MB 去读 661 个数字。
 *
 * 产物 data/prices.json 只有 ~20 KB，结构与 photos.json 同一套降级语义：
 *   { _meta: {...}, prices: { '<perfume-id>': <整数元> } }
 * 文件缺失 / 解析失败 / 值不是有限正数 → 调用方一律当作「这瓶没有价」。
 *
 * 口径（写进产物 _meta，页面也会原样披露）：
 *   · 价格取自采集时（2026-11-09）淘宝/京东**商品详情页挂牌价**，单位元；
 *   · 不是实时比价，也不是最低价 —— 促销、尺码（30/50/100ml）、套装都会让
 *     实际成交价偏离这个数；
 *   · 只有 661 / 1388 瓶采到价，其余 727 瓶**没有价**，选预算后它们会退出
 *     候选池。这一点必须在界面上说清，否则用户会以为「选了预算就推荐变差了」。
 *
 * 用法：node scripts/build-prices.mjs [--check]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SRC = path.join(ROOT, 'data', 'products.candidates.json');
const OUT = path.join(ROOT, 'data', 'prices.json');
const CHECK = process.argv.includes('--check');

/* 合理区间：低于 100 元的多是小样 / 分装 / 旅行装，高于 5000 元的多是
   礼盒或大容量，两者都会把「预算」这一维搞成噪声。落区间外的仍写进表
   （不丢数据），但打分侧只把它当「有价」而不是「这个价」。
   区间本身写进 _meta，页面文案与它同源。 */
const BAND_MIN = 100;
const BAND_MAX = 5000;

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const accepted = Array.isArray(raw.accepted) ? raw.accepted : [];

const prices = {};
const stats = { candidates: accepted.length, parsed: 0, dropped: 0, inBand: 0 };
for (const row of accepted) {
  if (!row || typeof row.id !== 'string') continue;
  const p = row.picked || {};
  /* 价格在源数据里是字符串（"920" / "1,280" / "¥299"）。只认能完整解析成
     有限正数的，宁可少一瓶也不要写一个猜出来的数 —— 预算题拿错数比没有更糟。 */
  const n = Number(String(p.price == null ? '' : p.price).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) { stats.dropped += 1; continue; }
  stats.parsed += 1;
  prices[row.id] = Math.round(n);
  if (n >= BAND_MIN && n <= BAND_MAX) stats.inBand += 1;
}

const doc = {
  _meta: {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'data/products.candidates.json（淘宝/京东 商品详情页挂牌价快照，2026-11-09 采集）',
    currency: 'CNY',
    unit: '元 / 瓶（挂牌价，非实时比价、非最低价）',
    note: '挂牌价随促销、容量（30/50/100ml）、套装浮动；这里只做粗档筛选，不做比价。',
    coverage: `${Object.keys(prices).length} / 1388 瓶`,
    sensibleBand: [BAND_MIN, BAND_MAX],
    stats,
  },
  prices: Object.fromEntries(Object.entries(prices).sort(([a], [b]) => (a < b ? -1 : 1))),
};

if (CHECK) {
  if (!fs.existsSync(OUT)) {
    console.error('✗ data/prices.json 不存在，先跑 node scripts/build-prices.mjs');
    process.exit(1);
  }
  const cur = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const same = JSON.stringify(cur.prices) === JSON.stringify(doc.prices);
  if (!same) {
    console.error('✗ data/prices.json 与源数据不同步，重跑 node scripts/build-prices.mjs');
    process.exit(1);
  }
  console.log(`✓ data/prices.json 与源数据一致（${Object.keys(doc.prices).length} 瓶有价）`);
  process.exit(0);
}

fs.writeFileSync(OUT, JSON.stringify(doc, null, 0) + '\n');
const bytes = fs.statSync(OUT).size;
console.log(`✓ 写出 data/prices.json：${Object.keys(doc.prices).length} 瓶有价 / ${bytes} 字节`);
console.log(`  解析成功 ${stats.parsed}，丢弃（无价或非法）${stats.dropped}，`
  + `落在合理区间 ${BAND_MIN}–${BAND_MAX} 的 ${stats.inBand}`);
