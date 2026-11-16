/**
 * build-price-bands.mjs — 把「已备好的价格数据」折成预算题能用的最小表。
 *
 * 为什么需要这一步：预算题要前置（v5 规格），但价格不在 `data/perfumes.json`
 * 里（`docs/TODO-REMAINING.md` §K3 明确「不做价格展示」，`src/scoring.js`
 * 也写着没有 price 字段）。价格只躺在 `data/products.candidates.json` 的
 * `accepted[].picked.price` —— 那个文件 2.2 MB，**不能在首屏拉**。
 *
 * 所以这里只抽一个字段（id → 档位序号），产出一张 18 KB 的表。
 * 只输出**档位序号**，不输出价格数字：本站既有约束是「不展示价格、不做比价」
 * （docs/DECISION-AD-DISCLOSURE-20261110.md 拍板），档位够用了。
 *
 * 另剔除试香/小样：`docs/TODO-REMAINING.md` 记录 661 条 accepted 里
 * 有 24–26 条 ≤¥30（最低 ¥4）是试用装，未经二次闸门清理。预算题问的是
 * 「你愿意为一瓶花多少」，把 ¥9.9 的试香算进「300 以内」会直接把用户
 * 送进小样堆。所以 ≤ SAMPLE_FLOOR 的一律不参与档位（结果 = 无价签）。
 *
 * 用法：
 *   node scripts/build-price-bands.mjs          写 data/price-bands.json
 *   node scripts/build-price-bands.mjs --check  只校验是否同步
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SRC = path.join(ROOT, 'data', 'products.candidates.json');
const OUT = path.join(ROOT, 'data', 'price-bands.json');

/* 档位边界。取自 accepted 661 条的真实分位（实测 2026-11-16）：
   p10 138 / p25 279 / p50 600 / p75 1240 / p90 1866。
   四档把用户分到「试试水 / 日常主力 / 认真买一瓶 / 不设限」四句话上，
   每档都有 ≥109 瓶兜底（最少的是 1500 以上那档）。 */
export const BANDS = [
  { id: 'b1', zh: '300 以内', max: 300 },
  { id: 'b2', zh: '300–700', max: 700 },
  { id: 'b3', zh: '700–1500', max: 1500 },
  { id: 'b4', zh: '1500 以上', max: Infinity },
];
/* 低于这个价一律判为试香/小样，不进任何档位。¥30 是 TODO-REMAINING §K3
   记的那批 26 条的实测上界。 */
export const SAMPLE_FLOOR = 30;

const bandOf = (price) => {
  if (!Number.isFinite(price) || price <= SAMPLE_FLOOR) return null;
  const i = BANDS.findIndex((b) => price <= b.max);
  return i < 0 ? BANDS.length - 1 : i;
};

export function buildBands() {
  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const accepted = Array.isArray(raw.accepted) ? raw.accepted : [];
  const byId = {};
  const stats = { total: accepted.length, priced: 0, sample: 0, bands: BANDS.map(() => 0) };
  for (const a of accepted) {
    const price = Number(a && a.picked && a.picked.price);
    const bi = bandOf(price);
    if (bi == null) { stats.sample += 1; continue; }
    byId[a.id] = bi;
    stats.priced += 1;
    stats.bands[bi] += 1;
  }
  return {
    _readme: '由 scripts/build-price-bands.mjs 生成，不要手改。只存档位序号，不存价格。',
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'data/products.candidates.json → accepted[].picked.price',
    sampleFloor: SAMPLE_FLOOR,
    bands: BANDS.map((b) => ({ id: b.id, zh: b.zh })),
    stats,
    /* id → 档位序号（0 起）。没有这一条 = 库内无价签，预算题不据此排除。 */
    byId,
  };
}

const built = JSON.stringify(buildBands(), null, 0);
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  const inSync = cur.trim() === built.trim();
  console.log(inSync ? '✓ price-bands.json 与源数据一致' : '✗ price-bands.json 与源数据不同步');
  process.exit(inSync ? 0 : 1);
}
fs.writeFileSync(OUT, built);
const d = JSON.parse(built);
console.log(`price-bands.json 已重建：${Object.keys(d.byId).length} 瓶有档位`
  + ` / 源 ${d.stats.total} 条 accepted / 试香剔除 ${d.stats.sample} 条`
  + ` / 各档 ${d.stats.bands.join('·')}`);
