/**
 * gen-season-copy.mjs — 从定版文案生成 src/season-copy.js
 *
 * 为什么不让模型/人手工往 app.js 里抄 24 句：这 24 句的验收线是「与定版文件
 * 逐字 diff 为 0」。手工抄写有两种错法都很难靠肉眼发现 —— 抄错一个字（
 * 「砂糖橘」写成「沙糖橘」）、抄串一行（把 木质×夏 的句子放进 木质×秋）。
 * 两者都能正常渲染、都不报错，只有逐句比对才发现。
 *
 * 所以：**定版 md 是唯一来源，本文件是唯一的生成入口**，运行时模块由它产出。
 * 想改句子先改 md，再重跑本脚本，再跑 scripts/verify-season-copy.mjs。
 *
 * 用法：
 *   node scripts/gen-season-copy.mjs           写出 src/season-copy.js
 *   node scripts/gen-season-copy.mjs --check   只比对（不写盘），不一致退出码 1
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
/* 定版文案不在仓库里（它是决策产物，不是代码资产），所以路径只能在脚本里给。
   用环境变量可以覆盖：换机器或换文件名时不必改代码。
   默认值是本机那份；拿不到就报错退出，不静默用空表生成一份"看着成功"的空模块。 */
const SRC_MD = process.env.SEASON_COPY_MD
  || 'C:/Users/16256/work/season-copy-24-final-20261123.md';
const OUT = path.join(ROOT, 'src', 'season-copy.js');

if (!fs.existsSync(SRC_MD)) {
  console.error(`✗ 找不到定版文案：${SRC_MD}\n  用环境变量指定：SEASON_COPY_MD=<path> node scripts/gen-season-copy.mjs`);
  process.exit(1);
}

/* 定版文件里的 6 个「方向」是给用户看的词，不是引擎里的 family id。
   两侧的对应关系必须写在代码里、并且能被 diff 脚本读到 ——
   否则"文案对上了"只证明文字没错，不证明它挂在了正确的方向上。

     清新 ↔ fresh   （taxonomy: 清新调）
     花香 ↔ floral  （花香调）
     果香 ↔ citrus  （柑橘调 —— 见下面 SEASON_DIRECTION_NOTE 的说明）
     木质 ↔ woody   （木质调）
     东方 ↔ amber   （东方琥珀调）
     美食 ↔ gourmand（美食调） */
const FAMILY_OF_DIRECTION = [
  ['清新', 'fresh'],
  ['花香', 'floral'],
  ['果香', 'citrus'],
  ['木质', 'woody'],
  ['东方', 'amber'],
  ['美食', 'gourmand'],
];

const SEASON_ID = { 春: 'spring', 夏: 'summer', 秋: 'autumn', 冬: 'winter' };
const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];

/** 解析定版 md 的表格：| 方向 | 季 | 定版句 | 出处 | */
function parseFinal() {
  const text = fs.readFileSync(SRC_MD, 'utf8');
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    // split 后首尾各有一个空串：['', 方向, 季, 句, 出处, '']
    const dir = cells[1];
    const seasonZh = cells[2];
    const sentence = cells[3];
    if (!dir || !seasonZh || !sentence) continue;
    if (!FAMILY_OF_DIRECTION.some(([d]) => d === dir)) continue;  // 表头/分隔行
    if (!SEASON_ID[seasonZh]) continue;
    rows.push({ dir, season: SEASON_ID[seasonZh], sentence });
  }
  return rows;
}

const rows = parseFinal();
const dirOrder = FAMILY_OF_DIRECTION.map(([d]) => d);

/* 结构自检：正好 6×4，且每格恰好一句。少一格是漏抄，多一格是重复行 ——
   两者都会在渲染时表现为"某一格永远显示回退 desc"，不报错。 */
const problems = [];
const seen = new Set();
for (const r of rows) {
  const k = r.dir + '|' + r.season;
  if (seen.has(k)) problems.push('重复格：' + k);
  seen.add(k);
}
for (const d of dirOrder) {
  for (const s of SEASON_ORDER) {
    if (!seen.has(d + '|' + s)) problems.push('缺格：' + d + '|' + s);
  }
}
if (rows.length !== 24) problems.push(`总格数 ${rows.length}（应为 24）`);
if (problems.length) {
  console.error('✗ 定版文件解析失败：\n  ' + problems.join('\n  '));
  process.exit(1);
}

const q = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

const tableLines = dirOrder.map((d) => {
  const cells = SEASON_ORDER.map((s) => {
    const hit = rows.find((r) => r.dir === d && r.season === s);
    return `${s}: ${q(hit.sentence)}`;
  });
  return `  '${d}': {\n${cells.map((c) => '    ' + c + ',').join('\n')}\n  },`;
}).join('\n');

const mapLines = FAMILY_OF_DIRECTION
  .map(([d, fam]) => `  ${fam}: '${d}',`)
  .join('\n');

const out = `/**
 * src/season-copy.js — 季节屏「方向 × 季节」24 句（定版 2026-11-23）
 *
 * ==== 这一层为什么单独成文件 ====
 * 改之前 app.js 的 SEASONS 每季只有一句 desc（体感概括，例如「干爽。木质与微甜
 * 都能上场」），它是**按季节**的一句话，没有「方向」这根轴。而这一批文案是按
 * 6 方向 × 4 季 给的 24 格 —— 数据结构上要多一根轴，所以拆成独立模块：
 *   · app.js 的 SEASONS 保持原样（温度 temp 与 desc 都还在，desc 现在是回退项）；
 *   · 24 句只活在这里，来源单一，便于逐字比对。
 *
 * ==== 唯一来源 ====
 * \`C:/Users/16256/work/season-copy-24-final-20261123.md\`（Eddie 2026-11-23 拍板）。
 * 本文件由 \`scripts/gen-season-copy.mjs\` 从该 md 生成，**不要手改句子**：
 * 手改之后 \`scripts/verify-season-copy.mjs\` 会逐句报出差异。
 *
 * ==== 查不到怎么办 ====
 * \`seasonScene()\` 查不到时返回空串，调用方（app.js 的 renderSeason）回退到
 * 该季原有的 desc。空串而不是抛错，是因为"没选方向"是完全正常的一步 ——
 * 用情绪入口进来的用户没有 family，那一屏必须照常渲染。
 */

/* 方向 → 家族（引擎侧 id）。表的方向顺序与定版文件一致。
 *
 * 果香 ↔ citrus 是这批文案里唯一的**推断**，其余五项都是有字面对应
 * （清新调 / 花香调 / 木质调 / 东方琥珀调 / 美食调 就是 taxonomy 的 zh）。
 * 依据：taxonomy 里 citrus 的 zh 是「柑橘调」、oneLine 是「明亮、干净、
 * 像刚剥开的果皮」；而 果香 那四格写的全是动手剥/切果子的画面
 * （草莓 / 冰西瓜 / 橘子 / 砂糖橘），六族里没有第二个"水果"方向。
 * 反过来说，若把 citrus 留空，柑橘调用户四季都会落回 desc —— 这在本腿
 * 的验收里是可接受的降级，但它会让"24 句都上屏"少掉四格，所以选择了映射。
 * 这一处已在回执里单列，等 Eddie 一句话就能改成留空。 */
export const SEASON_DIRECTION_OF_FAMILY = {
${mapLines}
};

/* 定版的 24 句。键是**方向名**（与定版文件第一列逐字相同），
   不是 family id —— 这样 diff 脚本可以直接按同一个键两边对齐，
   不需要在比对里再做一次映射（映射错位本身就是一种可以静默发生的错）。 */
export const SEASON_SCENES = {
${tableLines}
};

const SEASON_IDS = ['spring', 'summer', 'autumn', 'winter'];

/**
 * 取「该方向 × 该季节」那一句。
 * @param {string|null} familyId  state.answers.family（引擎侧家族 id）
 * @param {string|null} seasonId  'spring' | 'summer' | 'autumn' | 'winter'
 * @returns {string} 查到返回句子，查不到返回空串（调用方回退到 desc）
 */
export function seasonScene(familyId, seasonId) {
  if (!familyId || !seasonId) return '';
  if (!SEASON_IDS.includes(seasonId)) return '';
  const dir = SEASON_DIRECTION_OF_FAMILY[familyId];
  if (!dir) return '';
  const row = SEASON_SCENES[dir];
  if (!row) return '';
  return row[seasonId] || '';
}

/** 24 格全部句子（给比对脚本用，顺序固定：方向按定版表，季节春夏秋冬）。 */
export const SEASON_SCENE_CELLS = Object.keys(SEASON_SCENES).flatMap((dir) =>
  SEASON_IDS.map((season) => ({
    dir,
    season,
    family: Object.keys(SEASON_DIRECTION_OF_FAMILY)
      .find((f) => SEASON_DIRECTION_OF_FAMILY[f] === dir) || null,
    sentence: SEASON_SCENES[dir][season],
  })));
`;

if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== out) {
    console.error(`✗ ${path.basename(OUT)} 与定版文件不同步。`);
    process.exit(1);
  }
  console.log(`✓ ${path.basename(OUT)} 与定版文件同步（24 句）`);
  process.exit(0);
}

fs.writeFileSync(OUT, out);
console.log(`✓ 写出 ${path.relative(ROOT, OUT)}（${rows.length} 句）`);
