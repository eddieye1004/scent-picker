/**
 * src/wishlist.js — 「心仪清单」的本地数据层（L1）
 *
 * 纯数据层：不碰 DOM、不碰样式、不碰页面状态。存储介质由调用方传入
 * （浏览器是 localStorage，测试里是内存对象），模块本身不碰 window ——
 * 所以它能直接在 node 里测，也不会因为隐私模式禁用存储而把页面带崩。
 *
 * 存什么（刻意只有这三项，多一个键都算违约）：
 *   id       香水 id（字符串）
 *   savedAt  收藏时间戳（毫秒），列表按它倒序
 *   reason   收藏那一刻的理由快照（清理空白后截 200 字，可为空）
 *
 * 上限 50：满了再存新的 → 拒绝并返回 { ok:false, status:'full' }，
 * 由 UI 层提示「先移除一瓶」，数据层不静默丢弃、也不挤掉最旧的一条。
 * 同一 id 重复存 → 更新 savedAt 与 reason 并置顶，不重复占位。
 * 每次写入前先重读当前存储值再合并，防多标签整表覆盖。
 *
 * 已入手标记存独立键 sp_wishlist_owned_v1（纯 id 数组），不污染上面的三键白名单。
 * localStorage 不可用（隐私模式 / 配额满 / 无 storage）→ 静默降级：
 * 读返回空，写返回 { ok:false, status:'unavailable' }，一律不抛错打断调用方。
 * 清空只需要删掉对应的一个键。
 */
export const WISHLIST_KEY = 'sp_wishlist_v1';
export const WISHLIST_OWNED_KEY = 'sp_wishlist_owned_v1';
export const WISHLIST_MAX = 50;
export const WISHLIST_REASON_MAX = 200;
export const WISHLIST_ID_MAX = 240;

/* 白名单：落盘的每条只能有这三个键。顺序固定，方便肉眼比对。 */
const ITEM_FIELDS = ['id', 'savedAt', 'reason'];

function cleanText(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

/* id 只认字符串与有限数字：对象/数组/布尔一律视为无效，
   否则脏数据会被 String() 成 "[object Object]" 混进清单。 */
function cleanId(v) {
  if (typeof v === 'string') return cleanText(v, WISHLIST_ID_MAX);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

/** 存储可以是对象，也可以是「返回存储」的函数（浏览器里 localStorage 可能拿不到）。 */
function resolveStorage(src) {
  if (typeof src === 'function') {
    try {
      return src() || null;
    } catch {
      return null;
    }
  }
  return src || null;
}

function readRaw(storage, key) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    /* 坏 JSON / 读不到：当作空，一条坏数据不该让整个清单消失。 */
    return null;
  }
}

/** 归一化一条记录：只留三键；没有有效 id 的条目返回 null（读时丢弃）。 */
function normalizeItem(v) {
  const id = cleanId(v && v.id);
  if (!id) return null;
  const savedAt = Number(v && v.savedAt);
  return {
    id,
    savedAt: Number.isFinite(savedAt) ? savedAt : 0,
    reason: cleanText(v && v.reason, WISHLIST_REASON_MAX),
  };
}

function sortDesc(items) {
  /* 新记录在前；Array.prototype.sort 稳定，时间戳相同时保持「刚写入的那条在前」。 */
  return items.slice().sort((a, b) => b.savedAt - a.savedAt);
}

function readItems(storage) {
  const arr = readRaw(storage, WISHLIST_KEY);
  if (!Array.isArray(arr)) return [];
  return sortDesc(arr.map(normalizeItem).filter(Boolean)).slice(0, WISHLIST_MAX);
}

/** 落盘：写入前已按三键重建，所以磁盘上不可能出现白名单以外的键。 */
function writeItems(storage, items) {
  if (!storage) return false;
  try {
    storage.setItem(WISHLIST_KEY, JSON.stringify(items.map(normalizeItem).filter(Boolean)));
    return true;
  } catch {
    /* 配额满 / 隐私模式：这次不落盘，由返回值告诉调用方。 */
    return false;
  }
}

function readOwned(storage) {
  const arr = readRaw(storage, WISHLIST_OWNED_KEY);
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const ids = [];
  for (const v of arr) {
    const id = cleanId(v);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function writeOwned(storage, ids) {
  if (!storage) return false;
  try {
    storage.setItem(WISHLIST_OWNED_KEY, JSON.stringify(ids));
    return true;
  } catch {
    return false;
  }
}

/**
 * 造一个绑定到指定存储的清单实例。
 * @param {object|function|null} storageOrGetter localStorage 或返回它的函数
 * @param {{ now?: () => number }} [options] 时间源可注入，测试用
 */
export function createWishlist(storageOrGetter, options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const resolve = () => resolveStorage(storageOrGetter);

  function nowMs() {
    const t = Number(now());
    return Number.isFinite(t) ? t : 0;
  }

  /** 当前清单，按 savedAt 倒序；存储不可用返回空数组。 */
  function list() {
    return readItems(resolve());
  }

  function has(id) {
    const sid = cleanId(id);
    if (!sid) return false;
    return readItems(resolve()).some((it) => it.id === sid);
  }

  /**
   * 存一瓶。
   * @returns {{ ok:boolean, status:'added'|'updated'|'full'|'invalid'|'unavailable',
   *            item?:object, items:object[], limit?:number }}
   */
  function add(id, reason) {
    const sid = cleanId(id);
    if (!sid) return { ok: false, status: 'invalid', items: list() };

    const storage = resolve();
    if (!storage) return { ok: false, status: 'unavailable', items: [] };

    /* 写前重读：别的标签页刚写进来的内容也要算进合并基数。 */
    const cur = readItems(storage);
    const exists = cur.some((it) => it.id === sid);
    if (!exists && cur.length >= WISHLIST_MAX) {
      return { ok: false, status: 'full', items: cur, limit: WISHLIST_MAX };
    }

    const item = { id: sid, savedAt: nowMs(), reason: cleanText(reason, WISHLIST_REASON_MAX) };
    const items = sortDesc([item, ...cur.filter((it) => it.id !== sid)]).slice(0, WISHLIST_MAX);
    if (!writeItems(storage, items)) return { ok: false, status: 'unavailable', items: cur };
    return { ok: true, status: exists ? 'updated' : 'added', item, items };
  }

  /** 移一瓶；本来就没有也算成功（absent），不抛错。 */
  function remove(id) {
    const sid = cleanId(id);
    if (!sid) return { ok: false, status: 'invalid', items: list() };

    const storage = resolve();
    if (!storage) return { ok: false, status: 'unavailable', items: [] };

    const cur = readItems(storage);
    const items = cur.filter((it) => it.id !== sid);
    if (items.length === cur.length) return { ok: true, status: 'absent', items: cur };
    if (!writeItems(storage, items)) return { ok: false, status: 'unavailable', items: cur };
    return { ok: true, status: 'removed', items };
  }

  /** 心形开关：在就删，不在就存。满额时与 add 一样返回 full。 */
  function toggle(id, reason) {
    const sid = cleanId(id);
    if (!sid) return { ok: false, status: 'invalid', items: list() };
    if (has(sid)) return remove(sid);
    return add(sid, reason);
  }

  /** 清空心仪清单，不动已入手标记。 */
  function clear() {
    const storage = resolve();
    if (!storage) return { ok: false, status: 'unavailable', items: [] };
    try {
      storage.removeItem(WISHLIST_KEY);
    } catch {
      return { ok: false, status: 'unavailable', items: list() };
    }
    return { ok: true, status: 'cleared', items: [] };
  }

  /** 已入手：独立键，纯 id 数组；重复标记幂等。 */
  function markOwned(id) {
    const sid = cleanId(id);
    if (!sid) return { ok: false, status: 'invalid', ids: [] };

    const storage = resolve();
    if (!storage) return { ok: false, status: 'unavailable', ids: [] };

    const cur = readOwned(storage);
    if (cur.includes(sid)) return { ok: true, status: 'exists', ids: cur };
    const ids = [...cur, sid];
    if (!writeOwned(storage, ids)) return { ok: false, status: 'unavailable', ids: cur };
    return { ok: true, status: 'marked', ids };
  }

  function isOwned(id) {
    const sid = cleanId(id);
    if (!sid) return false;
    return readOwned(resolve()).includes(sid);
  }

  /* 已入手标记清空与心仪分开，各自独立。 */
  function clearOwned() {
    const storage = resolve();
    if (!storage) return { ok: false, status: 'unavailable', ids: [] };
    try {
      storage.removeItem(WISHLIST_OWNED_KEY);
    } catch {
      return { ok: false, status: 'unavailable', ids: [] };
    }
    return { ok: true, status: 'cleared', ids: [] };
  }

  return { add, remove, toggle, list, has, clear, markOwned, isOwned, clearOwned };
}

/* 默认实例：调用时才去解析 localStorage（隐私模式下取它就抛的那类浏览器也照顾到）。 */
export const wishlist = createWishlist(() => globalThis.localStorage);

export const add = (id, reason) => wishlist.add(id, reason);
export const remove = (id) => wishlist.remove(id);
export const toggle = (id, reason) => wishlist.toggle(id, reason);
export const list = () => wishlist.list();
export const has = (id) => wishlist.has(id);
export const clear = () => wishlist.clear();
export const markOwned = (id) => wishlist.markOwned(id);
export const isOwned = (id) => wishlist.isOwned(id);

/* 三键白名单对外只读导出，守卫测试直接拿它比对落盘内容。 */
export const WISHLIST_ITEM_FIELDS = Object.freeze(ITEM_FIELDS.slice());

export default wishlist;
