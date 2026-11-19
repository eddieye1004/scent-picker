/**
 * build-price-bands.mjs — 从已召回的淘宝候选价生成「价位带索引」
 *
 * 为什么需要它：问卷 v6 的**第 1 屏是预算题**（规格：预算题前置，先圈池再问偏好）。
 * 而 data/perfumes.json 里**没有价格字段**（上游 CC BY 4.0 数据集只给香调），
 * 引擎按设计也拒绝编造价格。价格只存在于 data/products.candidates.json 的
 * `accepted[].picked.price` —— 那是 data/fetch-products.mjs 调淘宝联盟接口
 * 召回、并用 product-skus 核过 itemId 的那批商品。
 *
 * 所以价格这条线走**映射层**：不改引擎、不改 perfumes.json，另出一张
 * 「id → 价位带」的索引，预算屏只决定「把哪一批瓶子交给 recommend()」。
 *
 * ==== 三件必须照实说的事 ====
 *  1. **覆盖不全**：1388 瓶里只有 622 瓶能查到价（44.8%）。其余 766 瓶价位未知。
 *     界面上的守法（见 app.js 的 renderBudget）：选具体档时，价位未知的瓶子
 *     **不参与**，并把这句写进屏内说明。不写就等于把"未知"静默当成"便宜"。
 *  2. **口径不是吊牌价**：这是淘宝商品页的**标价**（含直播间/活动价），不是
 *     同规格同容量的专柜价。跨瓶比价本来就不严格，所以档位只做粗分（4 档），
 *     不做排序、不承诺"最低价"。
 *  3. **有清洗规则**：<50 元基本是小样/分装（会把整档拉向"便宜"），>8000 元是
 *     礼盒/多件套（会把整档拉向"贵"）。两端各截掉，理由与阈值写在清洗函数里。
 *
 * 用法：
 *   node scripts/build-price-bands.mjs [--check]
 *     --check 只校验仓库里的产物与当前数据是否一致，不一致退出码 1。
 *
 * 数据源缺失时（products.candidates.json 被 .gitignore 排除，克隆下来没有）：
 * 脚本**不覆盖**已有产物，只打印"用仓库里现成的那份"，退出码 0。
 * 这样 CI / 新克隆者跑 --check 不会因为缺一个未入库的中间文件而红。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'price-bands.json');
const CHECK = process.argv.includes('--check');

/* 价位带的边界。四档，边界取自分位数实测（见文件末尾的 p20/p40/p60/p80 打印）：
   300 / 600 / 1200 正好把 622 瓶切成 152 / 145 / 160 / 165 四群，
   每档都 >= 145 瓶，且每档里六个香型各至少 11 瓶 —— 圈池之后推荐不会塌成单族。
   再多一档（5 档）会把最贵那档压到 33 瓶，柑橘只剩 2 瓶，那一档等于没货可推。 */
export const BANDS = [
  { id: 'under300', zh: '300 元以内', lo: 0, hi: 300 },
  { id: 'b300-600', zh: '300–600 元', lo: 300, hi: 600 },
  { id: 'b600-1200', zh: '600–1200 元', lo: 600, hi: 1200 },
  { id: 'over1200', zh: '1200 元以上', lo: 1200, hi: Infinity },
];
export const ANY_ID = 'any';

/* 清洗阈值。两端都截掉，理由：
     < 50  ：实测这批里 51 瓶标价 < 100 元，抽样看全是 1–5ml 小样/分装，
             混进来会让「300 元以内」多出一批其实买不到正装的瓶子。
     > 8000：12 瓶，抽样是多件套/礼盒（如 3×100ml 套装），单价被放大 3 倍。
   两条都往"档位失真"的方向拉，所以两侧都截。 */
const MIN_PRICE = 50;
const MAX_PRICE = 8000;

const bandOf = (v) => {
  const b = BANDS.find((x) => v >= x.lo && v < x.hi);
  return b ? b.id : null;
};

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

const candPath = path.join(ROOT, 'data', 'products.candidates.json');
const perfPath = path.join(ROOT, 'data', 'perfumes.json');

const perfumes = loadJson(perfPath)?.perfumes;
if (!Array.isArray(perfumes) || !perfumes.length) {
  console.error('✗ 缺 data/perfumes.json（或结构不对）—— 价位带索引没有 id 可对');
  process.exit(1);
}
const known = new Set(perfumes.map((p) => p.id));

const cand = loadJson(candPath);
let index = null;
let usedCommitted = false;

if (cand && Array.isArray(cand.accepted)) {
  /* 一瓶只取第一条能用的价：同一瓶可能召回多个候选（不同店铺/规格），
     取第一条 = 召回声明的那个"picked"商品，与站上购买入口指向的是同一件。 */
  const priceById = new Map();
  let raw = 0; let droppedLow = 0; let droppedHigh = 0; let droppedNoId = 0;
  for (const r of cand.accepted) {
    const v = r && r.picked ? Number(r.picked.price) : NaN;
    if (!Number.isFinite(v) || v <= 0) continue;
    raw += 1;
    if (!known.has(r.id)) { droppedNoId += 1; continue; }
    if (priceById.has(r.id)) continue;
    if (v < MIN_PRICE) { droppedLow += 1; continue; }
    if (v > MAX_PRICE) { droppedHigh += 1; continue; }
    priceById.set(r.id, v);
  }

  const bands = {};
  for (const b of BANDS) bands[b.id] = [];
  const counts = {};
  for (const p of perfumes) {
    const v = priceById.get(p.id);
    if (v == null) continue;
    const id = bandOf(v);
    if (!id) continue;
    bands[id].push(p.id);
    counts[id] = (counts[id] || 0) + 1;
  }
  for (const b of BANDS) bands[b.id].sort();

  index = {
    _readme: '价位带索引。由 scripts/build-price-bands.mjs 生成，不要手改。'
      + ' id → 价位带；perfumes.json 没有价格字段，引擎也不编造价格，'
      + ' 预算屏只决定把哪一批瓶子交给 recommend()。',
    generatedFrom: 'data/products.candidates.json（accepted[].picked.price，淘宝商品标价）',
    generatedAt: new Date().toISOString().slice(0, 10),
    bands: BANDS.map((b) => ({
      id: b.id,
      zh: b.zh,
      lo: b.lo,
      hi: b.hi === Infinity ? null : b.hi,
    })),
    anyId: ANY_ID,
    /* 统计：界面上的数字全部从这里取，不在 app.js 里另抄一份。
     * 抄一份就会分叉 —— 这类"说得具体反而拆自己台"的文字必须跟数据同源。 */
    stats: {
      totalPerfumes: perfumes.length,
      priced: [...priceById.values()].length,
      unpriced: perfumes.length - priceById.size,
      counts,
      cleaning: {
        min: MIN_PRICE, max: MAX_PRICE,
        droppedBelowMin: droppedLow,
        droppedAboveMax: droppedHigh,
        droppedUnknownId: droppedNoId,
        rawAccepted: raw,
      },
    },
    bandOfId: bands,
  };
} else {
  /* 没有原始候选表：用仓库里已入库的那份，别把产物覆盖成空的。 */
  const prev = loadJson(OUT);
  if (prev && prev.bandOfId) {
    index = prev;
    usedCommitted = true;
  } else {
    console.error('✗ 既没有 data/products.candidates.json，仓库里也没有 data/price-bands.json');
    console.error('  前者被 .gitignore 排除（含未采用候选），新克隆者需要先跑 scripts/fetch-products.mjs');
    process.exit(1);
  }
}

const text = JSON.stringify(index, null, 1) + '\n';

if (usedCommitted) {
  console.log(`· 缺 data/products.candidates.json，沿用仓库里现成的 index（${index.stats.priced} 瓶有价）`);
  if (CHECK) console.log('✓ 无可比对象，跳过一致性校验（不判失败）');
  process.exit(0);
}

if (CHECK) {
  const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (prev === text) {
    console.log(`✓ data/price-bands.json 与当前数据一致（${index.stats.priced}/${index.stats.totalPerfumes} 瓶有价）`);
    process.exit(0);
  }
  // generatedAt 天然每天变，比较时剥掉它，只比内容
  const strip = (s) => s.replace(/"generatedAt": "[^"]*",\n/, '');
  if (strip(prev) === strip(text)) {
    console.log('✓ 内容一致（仅 generatedAt 不同）');
    process.exit(0);
  }
  console.error('✗ data/price-bands.json 与当前数据不同步，跑 node scripts/build-price-bands.mjs 重建');
  process.exit(1);
}

fs.writeFileSync(OUT, text);
const s = index.stats;
console.log(`✓ data/price-bands.json：${s.priced}/${s.totalPerfumes} 瓶能查到价，${s.unpriced} 瓶未知`);
for (const b of BANDS) console.log(`   ${b.zh.padEnd(12)} ${String(s.counts[b.id] || 0).padStart(4)} 瓶`);
console.log(`   清洗：<${MIN_PRICE} 元丢 ${s.cleaning.droppedBelowMin}，>${MAX_PRICE} 元丢 ${s.cleaning.droppedAboveMax}，`
  + `id 不在香水库丢 ${s.cleaning.droppedUnknownId}（原始 accepted ${s.cleaning.rawAccepted} 条）`);
