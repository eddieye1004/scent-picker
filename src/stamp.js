/**
 * src/stamp.js — 「试香盖章」的本地记录层（2026-11-23）
 *
 * 纯数据层：不碰 DOM、不碰样式、不碰页面状态。存储介质由调用方传入
 * （浏览器是 localStorage，测试里是内存对象），模块本身不碰 window ——
 * 所以它能在 node 里直接测，也不会因为隐私模式禁用存储而把页面带崩。
 *
 * ==== 存在哪 ====
 * 键 `scent-picker.tasting.v1`，与档案键 `scent-picker.history.v1`
 * （src/history.js）同一套 `scent-picker.` 前缀、同一套隐私口径：
 * 只在本机、无上传路径、清空即删这一个键。**不另起 sp_ 之类的新前缀** ——
 * 盖章是档案的一部分，不该在存储层看起来像另一个产品。
 *
 * ==== 存什么（刻意只有四键，多一个键都算违约）====
 *   key    瓶的身份键：归一化(name)+'|'+归一化(brand)。档案里每瓶只有
 *          name/brand（src/history.js 刻意不存香水 id），所以身份只能由此构成
 *   name   盖章那一刻的瓶名快照（清理空白后截 120 字）
 *   brand  同上，截 80 字（可为空）
 *   log    盖章序列，新的一枚追加在末尾。每一项只有 { tier, t } 两键：
 *            tier  五档之一（见 STAMP_TIERS）
 *            t     盖章时刻（毫秒）
 *          「最近一次」= log 末项，「共 N 次」= log.length。
 *          保留整串而不是只留最后一枚，是因为**撤销要退回到上一次盖章后的
 *          真实状态**（档位与时间都得回来），只留最后一枚就没法退。
 *          展示层只显示最近一次 + 次数，不铺这张表（任务书第 3 条）。
 *
 * 不存回答、不存香水 id、不存设备信息，也不参与任何打分。
 * 上限 200 瓶：满了再盖**新的一瓶** → 拒绝并返回 { ok:false, status:'full' }，
 * 由 UI 提示「先撤销一瓶」，与心仪清单 L1 同一条口径（不静默丢弃、不挤掉最旧）。
 * 同一瓶重复盖章 = 追加一枚，计数 +1，「最近一次」跟着换。
 * 每次写入前先重读当前存储值再合并，防多标签整表覆盖。
 *
 * 清空只需要删掉这一个键。localStorage 不可用（隐私模式 / 配额满 / 无 storage）→
 * 静默降级：读返回空，写返回 { ok:false, status:'unavailable' }，一律不抛错。
 */
export const STAMP_KEY = 'scent-picker.tasting.v1';
export const STAMP_MAX = 200;
export const STAMP_NAME_MAX = 120;
export const STAMP_BRAND_MAX = 80;

/* 五档（Eddie 2026-11-23 拍板，不许改口径）。
   顺序即语义：从最想要到最不想要，UI 按这个顺序铺五颗章。
   旧提案（tasting-stamp-proposal.md）写的是三档，以这份五档为准。 */
export const STAMP_TIERS = Object.freeze(['love', 'like', 'ok', 'meh', 'no']);
export const STAMP_TIER_ZH = Object.freeze({
  love: '一闻钟情',
  like: '喜欢',
  ok: '还行',
  meh: '无感',
  no: '劝退',
});

/* 白名单：落盘的每条只能有这四个键，log 每项只能有两个键。
   顺序就是落盘时的声明顺序（不是字典序）—— 守卫测试直接拿它比对 JSON 的键序。 */
export const STAMP_ITEM_FIELDS = Object.freeze(['key', 'name', 'brand', 'log']);
export const STAMP_LOG_FIELDS = Object.freeze(['tier', 't']);

function cleanText(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** 归档归一化：NFKC（折叠全角/半角）+ 小写 + 空白归一。同一瓶换个写法仍是同一瓶。 */
function normPart(v, max) {
  const s = cleanText(v, max);
  try {
    return s.normalize('NFKC').toLowerCase();
  } catch {
    return s.toLowerCase();
  }
}

/** 瓶的身份键。没有 name 就是空串 —— 空键不允许落盘（读时丢弃、写时拒绝）。 */
export function stampKeyOf(bottle) {
  const name = normPart(bottle && bottle.name, STAMP_NAME_MAX);
  if (!name) return '';
  return `${name}|${normPart(bottle && bottle.brand, STAMP_BRAND_MAX)}`;
}

export function tierZhOf(tier) {
  return STAMP_TIER_ZH[tier] || '';
}

function validTier(tier) {
  return STAMP_TIERS.includes(tier);
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

function readRaw(storage) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STAMP_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    /* 坏 JSON / 读不到：当作空。一条坏数据不该让整份盖章记录消失。 */
    return null;
  }
}

function normLogItem(v) {
  const tier = v && v.tier;
  const t = Number(v && v.t);
  if (!validTier(tier)) return null;
  return { tier, t: Number.isFinite(t) ? t : 0 };
}

/** 归一化一条记录：只留四键；没有有效 key 或 log 为空 → null（读时丢弃）。 */
function normalizeRecord(v) {
  const key = cleanText(v && v.key, STAMP_NAME_MAX + STAMP_BRAND_MAX + 2);
  if (!key) return null;
  const log = (Array.isArray(v && v.log) ? v.log : []).map(normLogItem).filter(Boolean);
  if (!log.length) return null;
  return {
    key,
    name: cleanText(v && v.name, STAMP_NAME_MAX),
    brand: cleanText(v && v.brand, STAMP_BRAND_MAX),
    log,
  };
}

function sortDesc(records) {
  /* 最近盖过章的在前；Array.prototype.sort 稳定，末枚时间相同时保持原顺序。 */
  return records.slice().sort((a, b) => lastOf(b).t - lastOf(a).t);
}

function lastOf(record) {
  return record.log[record.log.length - 1];
}

function readRecords(storage) {
  const arr = readRaw(storage);
  if (!Array.isArray(arr)) return [];
  return sortDesc(arr.map(normalizeRecord).filter(Boolean)).slice(0, STAMP_MAX);
}

/** 落盘：写入前已按四键重建，所以磁盘上不可能出现白名单以外的键。 */
function writeRecords(storage, records) {
  if (!storage) return false;
  try {
    storage.setItem(STAMP_KEY, JSON.stringify(records.map(normalizeRecord).filter(Boolean)));
    return true;
  } catch {
    /* 配额满 / 隐私模式：这次不落盘，由返回值告诉调用方。 */
    return false;
  }
}

/**
 * 造一个绑定到指定存储的盖章实例。
 * @param {object|function|null} storageOrGetter localStorage 或返回它的函数
 * @param {{ now?: () => number }} [options] 时间源可注入，测试用
 */
export function createStamps(storageOrGetter, options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const resolve = () => resolveStorage(storageOrGetter);

  function nowMs() {
    const t = Number(now());
    return Number.isFinite(t) ? t : 0;
  }

  /** 全部记录，最近盖过的在前；存储不可用返回空数组。 */
  function list() {
    return readRecords(resolve());
  }

  /** 某一瓶的记录，没有就是 null。 */
  function get(bottle) {
    const key = stampKeyOf(bottle);
    if (!key) return null;
    return readRecords(resolve()).find((r) => r.key === key) || null;
  }

  /**
   * 盖一枚章。
   * @returns {{ ok:boolean, status:'stamped'|'invalid'|'full'|'unavailable',
   *            record?:object, records:object[], limit?:number }}
   */
  function stamp(bottle, tier) {
    const key = stampKeyOf(bottle);
    if (!key || !validTier(tier)) {
      return { ok: false, status: 'invalid', records: list() };
    }

    const storage = resolve();
    if (!storage) return { ok: false, status: 'unavailable', records: [] };

    /* 写前重读：别的标签页刚写进来的内容也要算进合并基数。 */
    const cur = readRecords(storage);
    const exists = cur.some((r) => r.key === key);
    if (!exists && cur.length >= STAMP_MAX) {
      return { ok: false, status: 'full', records: cur, limit: STAMP_MAX };
    }

    const old = cur.find((r) => r.key === key) || null;
    const record = {
      key,
      /* 名字取**这一次**传入的写法：改名/合并后按盖章时的快照显示，
         不去新库里猜（与 tasting-stamp-proposal.md §4 的异常路径同一条）。 */
      name: cleanText(bottle && bottle.name, STAMP_NAME_MAX),
      brand: cleanText(bottle && bottle.brand, STAMP_BRAND_MAX),
      log: [...(old ? old.log : []), { tier, t: nowMs() }],
    };
    const records = sortDesc([record, ...cur.filter((r) => r.key !== key)]);
    if (!writeRecords(storage, records)) return { ok: false, status: 'unavailable', records: cur };
    return { ok: true, status: 'stamped', record, records };
  }

  /**
   * 撤销最近一次盖章。
   *
   * 语义（本腿定的，写进回执与断言）：log 弹出末项 →
   *   · 弹完还有内容：档位/时间回到**上一次盖章后的真实状态**，计数 -1；
   *   · 弹完空了：这一瓶的盖章记录整体移除，回到"未盖章"。
   * 为什么可以一直退：留的是整串 log，每一步都能还原成当时的真实值，
   * 不会出现"退了一次以后档位是编的"。
   *
   * @returns {{ ok:boolean, status:'undone'|'removed'|'empty'|'unavailable',
   *            record?:object|null, records:object[] }}
   */
  function undo(bottle) {
    const key = stampKeyOf(bottle);
    if (!key) return { ok: false, status: 'invalid', records: list() };

    const storage = resolve();
    if (!storage) return { ok: false, status: 'unavailable', records: [] };

    const cur = readRecords(storage);
    const old = cur.find((r) => r.key === key) || null;
    if (!old) return { ok: true, status: 'empty', records: cur };

    const log = old.log.slice(0, -1);
    const rest = cur.filter((r) => r.key !== key);
    if (!log.length) {
      const records = rest;
      if (!writeRecords(storage, records)) return { ok: false, status: 'unavailable', records: cur };
      return { ok: true, status: 'removed', record: null, records };
    }
    const record = { key: old.key, name: old.name, brand: old.brand, log };
    const records = sortDesc([record, ...rest]);
    if (!writeRecords(storage, records)) return { ok: false, status: 'unavailable', records: cur };
    return { ok: true, status: 'undone', record, records };
  }

  /** 清空全部盖章（不动档案、不动心仪、不动已入手）。 */
  function clear() {
    const storage = resolve();
    if (!storage) return { ok: false, status: 'unavailable', records: [] };
    try {
      storage.removeItem(STAMP_KEY);
    } catch {
      return { ok: false, status: 'unavailable', records: list() };
    }
    return { ok: true, status: 'cleared', records: [] };
  }

  return { list, get, stamp, undo, clear };
}

/* 默认实例：调用时才去解析 localStorage（隐私模式下取它就抛的那类浏览器也照顾到）。 */
export const stamps = createStamps(() => globalThis.localStorage);

export const list = () => stamps.list();
export const get = (bottle) => stamps.get(bottle);
export const stamp = (bottle, tier) => stamps.stamp(bottle, tier);
export const undo = (bottle) => stamps.undo(bottle);
export const clear = () => stamps.clear();

export default stamps;
