/**
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
 * `C:/Users/16256/work/season-copy-24-final-20261123.md`（Eddie 2026-11-23 拍板）。
 * 本文件由 `scripts/gen-season-copy.mjs` 从该 md 生成，**不要手改句子**：
 * 手改之后 `scripts/verify-season-copy.mjs` 会逐句报出差异。
 *
 * ==== 查不到怎么办 ====
 * `seasonScene()` 查不到时返回空串，调用方（app.js 的 renderSeason）回退到
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
  fresh: '清新',
  floral: '花香',
  citrus: '果香',
  woody: '木质',
  amber: '东方',
  gourmand: '美食',
};

/* 定版的 24 句。键是**方向名**（与定版文件第一列逐字相同），
   不是 family id —— 这样 diff 脚本可以直接按同一个键两边对齐，
   不需要在比对里再做一次映射（映射错位本身就是一种可以静默发生的错）。 */
export const SEASON_SCENES = {
  '清新': {
    spring: '雨后骑车上班，风里都是青草味',
    summer: '冰镇柠檬水，一口下去醒过来',
    autumn: '清晨下楼，台阶上还挂着露水',
    winter: '雪后清晨推开门，吸一口冷空气',
  },
  '花香': {
    spring: '花店抱一束花回家，一路都在香',
    summer: '傍晚阳台乘凉，茉莉悄悄开了',
    autumn: '桂花开了，整条街都是甜的',
    winter: '桌上一盆水仙，年味就近了',
  },
  '果香': {
    spring: '草莓上市，洗好一碗端到窗边',
    summer: '冰西瓜切半，勺子挖最中间那口',
    autumn: '剥开一只橘子，汁水溅到手指',
    winter: '围炉煮茶，顺手烤几颗砂糖橘',
  },
  '木质': {
    spring: '雨后山里徒步，木头潮湿的气息',
    summer: '推开老屋木门，一股阴凉扑来',
    autumn: '收拾柴堆，松木味沾满袖口',
    winter: '壁炉柴火噼啪，毛衣再裹紧一点',
  },
  '东方': {
    spring: '乍暖还寒的夜里，点一支线香',
    summer: '仲夏夜出门赴约，晚风还是热的',
    autumn: '外婆晒陈皮，阳台一片橘黄',
    winter: '泡一壶普洱，茶烟在灯下打转',
  },
  '美食': {
    spring: '周末烤饼干，黄油香飘满厨房',
    summer: '冰淇淋快化了，赶紧舔一口',
    autumn: '糖炒栗子刚出锅，隔着纸袋烫手',
    winter: '被窝里捧热可可，看窗外下雪',
  },
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
