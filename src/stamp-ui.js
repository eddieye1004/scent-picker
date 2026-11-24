/**
 * src/stamp-ui.js — 「试香盖章」的**纯逻辑层**（2026-11-23）
 *
 * 只管四件事，全部不碰 DOM：
 *   ① 一次「盖章 / 撤销」的编排：先在真存储上做，遇到 status:'unavailable'
 *      就换一份页面内存介质重做同一次动作；
 *   ② 展示模型：最近一次盖章结果 + 「共 N 次」，不铺全量历史；
 *   ③ 提示文案（口径与心仪清单 L2 一致：`本机存储不可用，…仅本次有效`）；
 *   ④ 降级判定（degraded）—— 一旦降级就不再回头试真存储。
 *
 * 为什么单独成模块：这几条判据全是纯函数/纯状态，不 import 任何 DOM，
 * 所以在 node 里可以直接喂内存存储来测「满 200」「隐私模式」这两条
 * 平时在浏览器里很难复现的路径。app.js 那边只剩「画五颗章、点一下、说一句话」。
 *
 * 数据层（src/stamp.js）一个字节不用动：内存兜底不是给数据层开洞，
 * 而是给它换一个存储介质 —— createStamps(storageOrGetter) 本来就是
 * 为这件事留的注入口。
 */
import { createStamps, STAMP_MAX, STAMP_TIERS, STAMP_TIER_ZH, stampKeyOf } from './stamp.js';

/**
 * 四句提示。降级那句与心仪清单 L2 的 `本机存储不可用，收藏仅本次有效`
 * 同一条口径，只把动词换成「盖章」—— 两个功能说同一件事时，用户不该
 * 读到两种句式。守卫测试逐字比对前缀与后缀。
 */
export const STAMP_MSG = Object.freeze({
  saved: '已盖章',
  undone: '已撤销上次盖章',
  removed: '已撤销这瓶的盖章',
  full: `盖章记录满了（${STAMP_MAX} 瓶），先撤销一瓶`,
  unavailable: '本机存储不可用，盖章仅本次有效',
});

/**
 * 内存版 localStorage（形状与真的一样：getItem / setItem / removeItem）。
 * 与 src/wish-ui.js 的 createMemoryStore 同形 —— 数据层要的是存储接口，
 * 不是数据本身；给它同一套接口，里面存的仍是那一个键的 JSON。
 */
export function createMemoryStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

/**
 * 造一个页面会话。
 *
 * @param {object}   primary         真存储上的盖章实例（浏览器里是 stamps）
 * @param {function} [makeMemory]    造内存盖章实例的工厂，测试可注入
 * @param {object|function} [realStorage] 真存储介质本身（localStorage 或返回它的函数）
 */
export function createStampSession(primary, makeMemory, realStorage) {
  let memStore = null;
  const makeMem = typeof makeMemory === 'function'
    ? makeMemory
    : () => {
      memStore = createMemoryStore();
      return createStamps(memStore);
    };

  /* 降级后不再回头试真存储：反复试写一个已知失败的介质，
     只会在每次点击上多一次配额异常，而且状态会来回抖。 */
  let fallback = null;

  const active = () => fallback || primary;

  function realStore() {
    const src = realStorage;
    if (src) {
      try {
        const v = typeof src === 'function' ? src() : src;
        if (v) return v;
      } catch {
        /* 取存储本身抛（隐私模式）：当作不可用。 */
      }
    }
    try {
      return typeof globalThis !== 'undefined' && globalThis.localStorage
        ? globalThis.localStorage
        : null;
    } catch {
      return null;
    }
  }

  function degraded() {
    return fallback != null;
  }

  /** 当前真正在用的兜底介质（没降级时是 null）。 */
  function memoryStore() {
    return fallback ? memStore : null;
  }

  /** 某一瓶的记录（读也走同一个介质，否则降级时盖了章却读不出来）。 */
  function get(bottle) {
    try {
      return active().get(bottle) || null;
    } catch {
      return null;
    }
  }

  function list() {
    try {
      return active().list();
    } catch {
      return [];
    }
  }

  /**
   * 盖一枚章。
   * @returns {{ ok:boolean, status:string, record?:object, records?:Array, degraded:boolean }}
   */
  function stamp(bottle, tier) {
    let res = active().stamp(bottle, tier);
    if (res && res.status === 'unavailable') {
      if (!fallback) fallback = makeMem();
      res = fallback.stamp(bottle, tier);
      return { ...res, degraded: true };
    }
    return { ...res, degraded: degraded() };
  }

  /**
   * 撤销最近一次盖章。降级时写在兜底介质上 —— 不能"盖是内存的事、退写进磁盘"。
   * @returns {{ ok:boolean, status:string, record?:object|null, records?:Array, degraded:boolean }}
   */
  function undo(bottle) {
    let res = active().undo(bottle);
    if (res && res.status === 'unavailable') {
      if (!fallback) fallback = makeMem();
      res = fallback.undo(bottle);
      return { ...res, degraded: true };
    }
    return { ...res, degraded: degraded() };
  }

  function clear() {
    let res = active().clear();
    if (res && res.status === 'unavailable') {
      if (!fallback) makeMem();
      res = fallback.clear();
      return { ...res, degraded: true };
    }
    return { ...res, degraded: degraded() };
  }

  return { get, list, stamp, undo, clear, degraded, memoryStore, msg: STAMP_MSG };
}

/** 一个时间戳 → 「11-23」。坏时间返回空串（UI 那一格不渲染，不写「时间未知」）。 */
export function stampDateLabel(t) {
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(n);
  if (!Number.isFinite(d.getTime())) return '';
  const p = (x) => String(x).padStart(2, '0');
  try {
    return `${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  } catch {
    return '';
  }
}

/**
 * 某一瓶的展示模型：**只显示最近一次 + 共 N 次**（任务书第 3 条：
 * 不铺全量历史列表）。所以这里算出来的东西里没有任何"历史数组"——
 * 调用方拿不到列表，也就不会顺手把它铺开。
 *
 * @param {object|null} record 数据层的记录（stamp.js 的形状）
 * @returns {{
 *   has:boolean, count:number, tier:string, tierZh:string,
 *   dateLabel:string, countLabel:string, summary:string, canUndo:boolean
 * }}
 */
export function stampViewOf(record) {
  const log = record && Array.isArray(record.log) ? record.log : [];
  const count = log.length;
  const last = count ? log[count - 1] : null;
  const tier = last && STAMP_TIERS.includes(last.tier) ? last.tier : '';
  const tierZh = STAMP_TIER_ZH[tier] || '';
  const dateLabel = last ? stampDateLabel(last.t) : '';
  return {
    has: count > 0,
    count,
    tier,
    tierZh,
    dateLabel,
    countLabel: count ? `共 ${count} 次` : '',
    /* 一行摘要：日期 · 档位 · 次数。没有日期就少一格，不补「时间未知」。 */
    summary: count
      ? `${dateLabel ? dateLabel + ' · ' : ''}${tierZh} · ${`共 ${count} 次`}`
      : '',
    canUndo: count > 0,
  };
}

/**
 * 动作结果 → 一行提示。
 *
 * 判据顺序：先看有没有成功，再看结果。反过来会把「满额被拒」读成「已撤销」——
 * 用户刚点的是「保存」，却看到一句「已撤销」，是最容易让人以为数据坏了的提示。
 *
 * @param {{ok:boolean,status:string,degraded:boolean}} res
 * @param {{saved?:string,undone?:string,removed?:string,full?:string,unavailable?:string}} [MSGS]
 */
export function stampMessage(res, MSGS = STAMP_MSG) {
  let text;
  if (res && res.status === 'full') text = MSGS.full;
  else if (res && res.status === 'undone') text = MSGS.undone;
  else if (res && res.status === 'removed') text = MSGS.removed;
  else if (res && res.status === 'empty') text = MSGS.removed;
  else text = MSGS.saved;

  /* 兜底生效时必须在提示里说清「只这一次有效」——
     否则用户下次打开发现记录没了，会以为我们吞了他的盖章。 */
  if (res && res.degraded) text += `（${MSGS.unavailable}）`;
  return text;
}

/** 五档的展示清单（顺序即 STAMP_TIERS，UI 按它铺五颗章）。 */
export function stampTiers() {
  return STAMP_TIERS.map((id) => ({ id, zh: STAMP_TIER_ZH[id] }));
}

export { stampKeyOf, STAMP_TIERS, STAMP_TIER_ZH, STAMP_MAX };
