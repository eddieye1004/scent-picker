/**
 * notes.js — 香调匹配的唯一实现
 *
 * 为什么单独抽出来：
 *   原来的匹配是 `pn.includes(alias) || alias.includes(pn)` 双向子串，这会造成两类
 *   用户能直接感知的错误（均为实测）：
 *
 *   1) 假阳性：`晚香玉`(tuberose) 命中 72 瓶，真实只有 9 瓶 —— 因为反向子串
 *      `alias.includes(pn)` 让 "tuberose" 里的 "rose" 被当成玫瑰；同理
 *      `玫瑰`(rose) 也会把 Tuberose / Rosemary / Rosewood / Pomarose / Rosehip 全算进来。
 *      子串匹配下「玫瑰」命中 85 瓶，真实 65 瓶。
 *
 *   2) 死链：`雪松`(cedar) 在数据里的实际写法是 "Cedarwood"，原逻辑靠反向子串
 *      `cedar.includes("cedarwood")` 才偶然命中；一旦收紧就会变成 0 命中。
 *
 * 所以改成「按词匹配 + 每个香调显式声明别名」：
 *   - 把香调名按非字母数字切成 token 序列；
 *   - 别名作为 token 子序列出现才算命中（"Turkish Rose" 含 [rose] ✓，
 *     "Tuberose" 是 [tuberose] 不含 [rose] ✗）；
 *   - 特殊写法（Cedarwood / Tea）用 aliases 显式列出，不靠启发式猜。
 *
 * 这样任何一次命中都能反查到是哪个别名、哪个 token 对上的，符合「可解释」约束。
 */

/** 归一化：小写、非字母数字（保留连字符）转空格、压缩空白 */
export function normNote(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 归一化后的 token 序列 */
export function tokenize(s) {
  const n = normNote(s);
  return n ? n.split(' ') : [];
}

/** hay 中是否包含 needle 这段连续 token 子序列 */
export function hasTokenSubsequence(hay, needle) {
  if (!needle.length || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let same = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) { same = false; break; }
    }
    if (same) return true;
  }
  return false;
}

/**
 * 取一个香调条目的全部匹配别名。
 * entry.aliases 优先；否则回退到把 entry.en 按 "/" 拆开
 * （noteIndex 里存在 "neroli / orange blossom" 这种写法）。
 */
export function aliasesOf(entry) {
  const list = Array.isArray(entry?.aliases) && entry.aliases.length
    ? entry.aliases
    : String(entry?.en ?? '').split('/');
  return list.map(normNote).filter(Boolean);
}

/**
 * surface（数据里的原始香调名，如 "Turkish Rose"）是否命中该条目的任一别名。
 * @param {object} entry   noteIndex 条目
 * @param {string} surface 数据里的香调原名
 * @param {string[]} [precomputedSurfaceTokens] 批量调用时传入已切好的 token，省重复切分
 */
export function matchesNote(entry, surface, precomputedSurfaceTokens) {
  const hay = precomputedSurfaceTokens ?? tokenize(surface);
  if (!hay.length) return false;
  return aliasesOf(entry).some((alias) => hasTokenSubsequence(hay, alias.split(' ')));
}

/**
 * 反向用法：给定一条别名（如 "rose"），判断某 surface 是否属于它。
 * 供 emotionMap 锚点、以及「这个 chip 到底命中几瓶」的体检脚本使用。
 */
export function isSurfaceOf(alias, surface) {
  const needle = tokenize(alias);
  return hasTokenSubsequence(tokenize(surface), needle);
}

/**
 * 统计该条目在给定香水集合里命中多少瓶。
 * 用途：把「点了也永远推荐不出东西」的死选项挡在界面上。
 * 实测背景：`可可/cocoa` 在 200 瓶数据里出现 0 次，
 * 用户勾了它却没有任何反馈，等于骗了一次点击。
 */
export function countHits(entry, perfumes, tokenCache) {
  let n = 0;
  for (let i = 0; i < perfumes.length; i++) {
    const toks = tokenCache ? tokenCache[i] : (perfumes[i].notesAll || []).map((x) => tokenize(x));
    if (toks.some((t) => matchesNote(entry, null, t))) n += 1;
  }
  return n;
}

/**
 * 过滤出「至少能命中 1 瓶」的条目，并附带命中数。
 * 顺序保持原样，避免界面每次刷新都换位置。
 */
export function usableEntries(entries, perfumes) {
  const tokenCache = perfumes.map((p) => (p.notesAll || []).map((x) => tokenize(x)));
  return entries
    .map((e) => ({ entry: e, hits: countHits(e, perfumes, tokenCache) }))
    .filter((r) => r.hits > 0)
    .map((r) => ({ ...r.entry, hits: r.hits }));
}
