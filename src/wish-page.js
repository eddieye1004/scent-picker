/**
 * src/wish-page.js — 「心仪清单」清单页的**纯逻辑层**（L3，2026-11-23）
 *
 * 这一层只回答「这一行该显示什么」，不造 DOM、不写样式、不碰 window。
 * app.js 那边只剩「把这里算出来的东西摆成一行」。
 *
 * 为什么又拆一层（L1 数据 / L2 结果页编排 / L3 清单页解析）：
 * 清单页要显示的五样东西里，有四样**都不在心仪条目里** ——
 *   瓶图、品名、价格带、购买链接 全部要按 id 回现有数据现查；
 *   只有「存入理由」是 L2 存下来的快照。
 * 这些"现查 + 缺了就怎样"的判据（没有价格就不显示价格、没有链接就不显示链接）
 * 正是最容易写成"编一个兜底值"的地方。放进纯函数里，就能在 node 里
 * 一格一格地验，而不必拉起整套 DOM 去截一张图。
 *
 * ==== 三条不许越界的口径 ====
 *  ① **不编价格**：`price-bands.json` 里查不到这瓶 → `price: null`，
 *     UI 不渲染价格格。绝不写「价格未知」「约 XX 元」这种填空话术。
 *  ② **不编链接**：`affiliateLinks()` 没给出条目 → `buy: []`，UI 不渲染购买键。
 *     不拼淘宝首页、不拼搜索词兜底 —— 那不是"这一瓶"的链接。
 *  ③ **不丢条目**：数据里查不到这瓶（下架/改名）时仍然出行，
 *     只是把能查到的部分填上、查不到的部分留空。清单是用户存下的东西，
 *     数据侧的变化不该让他以为瓶子丢了。
 *
 * 与 L1/L2 的依赖方向：wish-page 只认**普通对象**（香水、价格索引、链接数组），
 * 既不碰数据层也不碰编排层 —— 它连"心仪条目长什么样"都不假设，只要求
 * { id, savedAt, reason } 这三个字段存在（L1 白名单已经保证了）。
 * 这样它既能被 app.js 用，也能被测试用一份手写夹具直接喂。
 */
import { WISHLIST_MAX } from './wishlist.js';

/* 提示文案（清单页口径）。与 L2 的 WISH_MSG 分开写在各自的模块里，
   不互相 import —— 两页的两句话本来就该能各自改口径。 */
export const WISH_PAGE_MSG = Object.freeze({
  /* 空态：一句引导 + 一个回结果页的动作（不白屏） */
  emptyTitle: '清单还是空的',
  emptyHint: '在结果页点 ♡ 收藏到这里',
  emptyCta: '去挑一瓶 →',
  /* 满 50：与 L2 同一句口径（都是 WISHLIST_MAX，不另写数字） */
  full: `清单满了（${WISHLIST_MAX} 瓶），先移除一瓶`,
  /* 存储不可用：沿用 L2 已定的那句，不另造一句 */
  unavailable: '本机存储不可用，收藏仅本次有效',
  /* 清单只在本机 */
  deviceOnly: '清单存在这台设备上，换设备或清缓存就没了',
});

/** 一个时间戳 → 「最近存入 11-23」。日期标签写「最近存入」不写「存入日期」：
 *  同一瓶重复存会刷新 savedAt（L1 的 add 语义），写「存入日期」会让用户
 *  以为自己第一次存的那天被改掉了 —— 设计稿 §7.2 明确要求这个措辞。 */
export function savedLabel(savedAt) {
  const t = Number(savedAt);
  if (!Number.isFinite(t) || t <= 0) return '最近存入';
  const d = new Date(t);
  if (!Number.isFinite(d.getTime())) return '最近存入';
  const p = (n) => String(n).padStart(2, '0');
  try {
    return `最近存入 ${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  } catch {
    return '最近存入';
  }
}

/**
 * 价格索引 → 某一瓶的价位带。
 *
 * 数据形状（data/price-bands.json）：`bandOfId = { <bandId>: [perfumeId, ...] }`。
 * 也就是说它是**反向索引**（带 → 瓶子们），不是「瓶子 → 带」。
 * 1388 瓶里只有 622 瓶有价格，另外 766 瓶查不到 —— 查不到就是 null，
 * 这是数据事实，不是缺陷，所以调用方必须能表达"没有价格"。
 *
 * 建一张正向表再查，而不是每次线性扫四个数组：清单最多 50 行，
 * 每行扫 4 个数组 × 最多 200 个 id，翻一次清单就是 4 万次字符串比较。
 * 缓存在 WeakMap 上（按索引对象身份），索引换了就自动失效。
 *
 * @returns {{ id:string, zh:string, lo:number, hi:number|null }|null}
 */
const bandIndexCache = new WeakMap();

function bandLookup(priceIndex) {
  if (!priceIndex || typeof priceIndex !== 'object') return null;
  const cached = bandIndexCache.get(priceIndex);
  if (cached) return cached;

  const map = new Map();
  const bands = Array.isArray(priceIndex.bands) ? priceIndex.bands : [];
  const byId = new Map(bands.map((b) => [b && b.id, b]));
  const bandOfId = priceIndex.bandOfId && typeof priceIndex.bandOfId === 'object'
    ? priceIndex.bandOfId
    : {};

  for (const [bandId, ids] of Object.entries(bandOfId)) {
    const band = byId.get(bandId);
    if (!band || !Array.isArray(ids)) continue;
    for (const id of ids) {
      const sid = String(id == null ? '' : id);
      /* 先到先得：一瓶理论上只属于一个带，真出现重复时按 bands 里的先后定，
         不静默取最后一个（那样改数据顺序就会改动页面）。 */
      if (sid && !map.has(sid)) map.set(sid, band);
    }
  }
  bandIndexCache.set(priceIndex, map);
  return map;
}

/**
 * 某一瓶的价位带（无价格 → null）。
 * @param {string} id
 * @param {object|null} priceIndex data/price-bands.json 的内容
 */
export function priceBandOf(id, priceIndex) {
  const sid = String(id == null ? '' : id);
  if (!sid) return null;
  const map = bandLookup(priceIndex);
  if (!map) return null;
  const band = map.get(sid);
  if (!band) return null;
  /* 只交出展示需要的三项，不把整条 band 交出去 —— 免得 UI 顺手读了
     lo/hi 去拼「最低 300 元」这种我们并没有的数据。 */
  return { id: String(band.id || ''), zh: String(band.zh || ''), lo: band.lo, hi: band.hi == null ? null : band.hi };
}

/** 价位带的展示文案：带「参考价」前缀。**没有数据就返回 null**，由 UI 整格不渲染。 */
export function priceLabelOf(id, priceIndex) {
  const band = priceBandOf(id, priceIndex);
  if (!band || !band.zh) return null;
  return `参考价 ${band.zh}`;
}

/**
 * 按 id 建香水表的查询器。data/perfumes.json 是 `{ meta, perfumes: [...] }`，
 * 但也容忍直接传数组（测试夹具更短）。重复 id 取第一条，与打分侧的取法一致。
 */
export function perfumeIndex(data) {
  const list = Array.isArray(data) ? data : (data && Array.isArray(data.perfumes) ? data.perfumes : []);
  const map = new Map();
  for (const p of list) {
    const id = String((p && p.id) == null ? '' : p.id);
    if (id && !map.has(id)) map.set(id, p);
  }
  return map;
}

/**
 * 清单页的一行。
 *
 * @param {{id:string, savedAt:number, reason:string}} item   L1 的心仪条目
 * @param {object} deps
 * @param {Map|object} deps.perfumes   香水表（perfumeIndex 的产物，或可 get 的对象）
 * @param {object|null} deps.priceIndex data/price-bands.json
 * @param {Array} [deps.links]         这一瓶的购买链接（affiliateLinks 的产物）
 * @param {Set|Array} [deps.owned]     已入手的 id 集合
 * @returns {{
 *   id:string, name:string, brand:string, photo:string|null,
 *   reason:string, savedAtLabel:string, price:string|null,
 *   buy:Array, owned:boolean, missing:boolean
 * }}
 */
export function wishRowOf(item, deps = {}) {
  const id = String((item && item.id) == null ? '' : item.id);
  const perfumes = deps.perfumes;
  const p = perfumes && typeof perfumes.get === 'function'
    ? perfumes.get(id)
    : (perfumes && perfumes[id]) || null;

  /* 查不到这瓶：仍然出行（见文件头第③条）。名字退成 id 本身，
     不用「未知香水」这类占位词 —— id 至少能让用户认出是哪一瓶。 */
  const missing = !p;

  const photoMap = deps.photos && typeof deps.photos === 'object' ? deps.photos : null;
  const photoRaw = photoMap ? photoMap[id] : null;
  const photo = typeof photoRaw === 'string' && photoRaw ? photoRaw : null;

  const ownedSet = deps.owned;
  const owned = ownedSet instanceof Set
    ? ownedSet.has(id)
    : Array.isArray(ownedSet) ? ownedSet.includes(id) : false;

  const links = Array.isArray(deps.links) ? deps.links : [];

  return {
    id,
    name: (p && p.name) || id,
    brand: (p && p.brand) || '',
    photo,
    /* 理由：L2 存下的那一句原文，原样展示、不重算、不改写。
       空串就是空串 —— UI 那一格不渲染，不补「暂无理由」。 */
    reason: String((item && item.reason) == null ? '' : item.reason),
    savedAtLabel: savedLabel(item && item.savedAt),
    price: priceLabelOf(id, deps.priceIndex),
    buy: links,
    owned,
    missing,
  };
}

/**
 * 整页的模型：行 + 三个状态的判据。
 *
 * 空态 / 满额提示 / 降级提示各自是**独立布尔**，不互斥猜测：
 *  - `degraded` 与 `rows.length` 无关（存储写不进去时清单可能是空的）；
 *  - `full` 只在真的满 50 时为真 —— 它提示的是"下一瓶会存不进来"，
 *    清单没满时说这句话是假警报。
 *
 * @param {Array} items L1 list() 的产物（已按 savedAt 倒序）
 * @param {object} deps 同 wishRowOf，外加：
 * @param {function} [deps.linksOf] 按 (id, perfume) 取链接数组；不传则本行无购买键
 * @param {boolean} [deps.degraded] 存储降级（来自 createWishSession().degraded()）
 */
export function wishListModel(items, deps = {}) {
  const list = Array.isArray(items) ? items : [];
  const perfumes = deps.perfumes instanceof Map
    ? deps.perfumes
    : perfumeIndex(deps.perfumes);
  const linksOf = typeof deps.linksOf === 'function' ? deps.linksOf : null;

  const rows = list.map((item) => {
    const id = String((item && item.id) == null ? '' : item.id);
    const p = perfumes.get(id) || null;
    let links = [];
    if (linksOf) {
      try {
        links = linksOf(id, p) || [];
      } catch {
        /* 取链接的适配器抛了不该让整页白屏：这一行没有购买键，其余照常。 */
        links = [];
      }
    }
    return wishRowOf(item, {
      perfumes, priceIndex: deps.priceIndex, photos: deps.photos, owned: deps.owned, links,
    });
  });

  return {
    rows,
    empty: rows.length === 0,
    full: rows.length >= WISHLIST_MAX,
    count: rows.length,
    degraded: deps.degraded === true,
  };
}

/**
 * 清空的两段式状态机。
 *
 * 为什么不是原生 `confirm()`：它在部分 WebView 里会阻塞整页，也和本页
 * 视觉语言不是一套（档案区块当年就是因为这个改成两段式）。
 * 这里只算"下一句该说什么"，DOM 由 app.js 改。
 *
 * @param {{armed:boolean}} st
 * @returns {{armed:boolean, label:string, changed:boolean}}
 */
export const CLEAR_LABEL = '清空清单';
export const CLEAR_ARM_LABEL = '再点一次确认清空';

export function nextClearState(st, now = Date.now()) {
  const armed = !!(st && st.armed);
  if (!armed) {
    return { armed: true, label: CLEAR_ARM_LABEL, changed: false, at: now };
  }
  return { armed: false, label: CLEAR_LABEL, changed: true, at: now };
}

/**
 * 撤销条：移除后给 5 秒反悔窗口（设计稿 §11.1「一点即删会丢老瓶子」）。
 *
 * 这里只做一件事：把**存储里的原条目**裹成一个显式的「可撤销」对象，
 * 让调用方没法误把展示模型塞进来。
 *
 * 为什么值得单独包一层（这是实测踩到的真缺陷）：清单行的展示模型里
 * 时间字段叫 `savedAtLabel`（"最近存入 11-23"），**没有** `savedAt`。
 * 直接把展示模型交给撤销，写回去的 savedAt 就是 undefined → 落成 0 →
 * 那一瓶掉到清单最末。用户点了撤销，瓶子回来了却换了位置，
 * 比不给撤销更让人怀疑数据。所以这里显式只认 `savedAt`，
 * 拿不到就退回 0 并在 UI 上照常显示（不编一个"现在"）。
 *
 * @returns {{id:string, item:{id:string, savedAt:number, reason:string}}|null}
 */
export function removableOf(item) {
  const id = String((item && item.id) == null ? '' : item.id);
  if (!id) return null;
  const t = Number(item && item.savedAt);
  return {
    id,
    item: {
      id,
      savedAt: Number.isFinite(t) && t > 0 ? t : 0,
      reason: String((item && item.reason) == null ? '' : item.reason),
    },
  };
}
