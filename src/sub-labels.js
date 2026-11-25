/**
 * sub-labels.js — 中圈胶囊的**短标签**（纯显示层，2026-11-25）
 *
 * 为什么需要它（Eddie 2026-11-25 22:37 裁决，1 号方案「缩短标签」）：
 * 中圈胶囊定版是**单行**（16px 图标 + 12px 文字，不换行）。±90° 那两枚
 * 胶囊的宽度正好沿半径展开，可用总宽只有「盘心半径 → 盘沿」这一段
 * （390 档 58.15px、320 档 46.2px），四字词 + 图标横排必然顶穿环带 ——
 * 这是 design-item2 那条腿实测下来否掉单行、退回两行窄版的原因
 * （见 styles/src/95-quiz-v7-design.css Block 15 开头那笔账）。
 * 两行窄版不被接受，所以改的是**词**而不是**版**：把标签缩到 2–3 字，
 * 单行就塞得下了。
 *
 * ==== 缩写规则：去掉与所属大类名重复的后缀 ====
 * 盘心已经写着家族名（「柑橘调」），胶囊里再带一遍「柑橘」是重复信息。
 * 每个小类名去掉与大类名重复的那一段，只留区分性词；
 * 去完之后同族内仍须彼此可区分（无重名）。
 *
 * 两条边界情况，都不是"能去就去"：
 *   ① 去完只剩一个不成词的形容词 → 保留一个家族字。
 *      纯柑橘 → **纯柑**（不是「纯」）：「纯」单字读不出是纯什么。
 *   ② 小类名本身就是家族名 → 原样保留，不能缩成空串。
 *      木质调的「木质」、东方琥珀调的「琥珀」都属此类。
 *
 * 全表（6 族 24 类；标 * 的 8 条是本腿真正改掉的，其余 16 条本来就没有
 * 可去的家族后缀，逐条列出来是为了让"哪些没动"也可核对）：
 *
 *   柑橘调 citrus（家族字：柑橘）
 *     cologne          纯柑橘   → 纯柑    *  （边界 ①）
 *     green-citrus     苦橙叶   → 苦橙叶     （不含「柑橘」，无可去）
 *     citrus-floral    橙花柑橘 → 橙花    *
 *     aromatic-citrus  皂感柑橘 → 皂感    *
 *   花香调 floral（家族字：花香）
 *     rose             玫瑰     → 玫瑰
 *     white-floral     白花     → 白花       （结尾是「花」不是「花香」）
 *     fruity-floral    果香花香 → 果香    *
 *     powdery-floral   粉感花香 → 粉感    *
 *     green-floral     绿叶花香 → 绿叶    *
 *     soliflore        单一花   → 单一花     （边界 ①：去掉「花」只剩「单一」，
 *                                            是形容词不是名词，保留）
 *   木质调 woody（家族字：木质）
 *     sandalwood       檀木     → 檀木
 *     vetiver          香根草   → 香根草
 *     oud              乌木     → 乌木
 *     woody            木质     → 木质       （边界 ②）
 *   东方琥珀调 amber（家族字：琥珀）
 *     amber            琥珀     → 琥珀       （边界 ②）
 *     incense          焚香     → 焚香
 *     resinous         树脂     → 树脂
 *     leather          皮革     → 皮革
 *   清新调 fresh（家族字：清新）
 *     aquatic          水生     → 水生
 *     green            绿意     → 绿意
 *     fougere          馥奇     → 馥奇
 *     tea              茶香     → 茶香
 *   美食调 gourmand（家族字：美食）
 *     vanilla-gourmand 香草美食 → 香草    *
 *     fruity-gourmand  果味美食 → 果味    *
 *
 * 缩完最长 3 字（苦橙叶 / 香根草 / 单一花），其余全是 2 字 ——
 * 单行胶囊的列宽按 3 字标定，见 95-quiz-v7-design.css Block 16。
 *
 * ==== 只改显示层 ====
 * 这张表**只**被中圈胶囊的渲染点消费（app.js 的 renderArcs，
 * `el('span', { class: 'zh' }, subArcIcon(item.id), subShortLabel(item))`）。
 * 数据里的 `zh` / `label` 一个字都没动，以下三处照旧读全名：
 *   · 盘心小类列表（app.js familyText 里的 `.fam-text-item`，「纯柑橘 · 苦橙叶 · …」）
 *   · 盘心主词（app.js scentPlate 里的 `zh = focusSub.label || focusSub.zh`）
 *   · 结果页、推荐理由、无障碍名、文案
 * 所以「数据源头仍是全名」这条不是靠约定，是靠调用点只有一个是真的
 * （scripts/test-render.mjs 有一条断言钉住：盘心读全名、中圈读短名，
 * 两边必须**不相等**才算这条规则真的生效）。
 *
 * ==== 为什么是映射表而不是"渲染时去后缀"函数 ====
 * 去后缀这个动作有上面两条边界情况，写成函数就得把例外再写一张表，
 * 两张表比一张表更难核对。映射表是**枚举完的**：24 条一眼能读完，
 * 也能被测试逐条对照 taxonomy 校验覆盖率（漏一条就红）。
 *
 * 兜底：表里查不到的 id（将来新增小类而忘了补表）回退 `label || zh || id`，
 * 与改动前的口径逐字一致 —— 新增一类不会渲染成空白胶囊。
 */

/* id → 短标签。键是**小类 id**（跨族唯一、比中文名稳定）。 */
export const SUB_SHORT_LABEL = {
  /* 柑橘调 */
  'cologne': '纯柑',
  'green-citrus': '苦橙叶',
  'citrus-floral': '橙花',
  'aromatic-citrus': '皂感',
  /* 花香调 */
  'rose': '玫瑰',
  'white-floral': '白花',
  'fruity-floral': '果香',
  'powdery-floral': '粉感',
  'green-floral': '绿叶',
  'soliflore': '单一花',
  /* 木质调 */
  'sandalwood': '檀木',
  'vetiver': '香根草',
  'oud': '乌木',
  'woody': '木质',
  /* 东方琥珀调 */
  'amber': '琥珀',
  'incense': '焚香',
  'resinous': '树脂',
  'leather': '皮革',
  /* 清新调 */
  'aquatic': '水生',
  'green': '绿意',
  'fougere': '馥奇',
  'tea': '茶香',
  /* 美食调 */
  'vanilla-gourmand': '香草',
  'fruity-gourmand': '果味',
};

/* 数据侧的全名口径（改动前中圈用的就是这条）：label 优先、zh 兜底、id 保底。
   盘心小类列表与盘心主词仍直接读它，不走短标签。 */
export function subFullName(sub) {
  if (!sub) return '';
  return (sub.label || sub.zh || sub.id || '').trim();
}

/* 中圈胶囊唯一消费的取词口。查不到表就退回全名（见文件末尾的兜底说明）。 */
export function subShortLabel(sub) {
  if (!sub) return '';
  const hit = SUB_SHORT_LABEL[sub.id];
  return (hit || subFullName(sub)).trim();
}
