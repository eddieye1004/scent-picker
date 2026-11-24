/**
 * src/wish-ui.js — 心仪清单结果页入口的**纯逻辑层**（L2，2026-11-23）
 *
 * 只管三件事，全部不碰 DOM：
 *   ① 一次「存 / 删」的编排：先在真存储上做，遇到 status:'unavailable'
 *      就换一份页面内存介质重做同一次动作；
 *   ② 提示文案（四句，逐字由任务书钉死）；
 *   ③ 降级判定（degraded）—— 一旦降级就不再回头试真存储。
 *
 * 为什么单独成模块：这几条判据全是纯函数/纯状态，不 import 任何 DOM，
 * 所以在 node 里可以直接喂内存存储来测「满 50」「隐私模式」这两条
 * 平时在浏览器里很难复现的路径。app.js 那边只剩「画一颗心、点一下、
 * 说一句话」。
 *
 * 数据层（src/wishlist.js）一个字节没动：内存兜底不是给数据层开洞，
 * 而是给它换一个存储介质 —— createWishlist(storageOrGetter) 本来就是
 * 为这件事留的注入口。
 */

import {
  createWishlist, WISHLIST_MAX, WISHLIST_ID_MAX, WISHLIST_REASON_MAX, WISHLIST_OWNED_KEY,
} from './wishlist.js';

/** 四句提示，逐字对应任务书。 */
export const WISH_MSG = Object.freeze({
  saved: '已存入心仪清单 · 在香水档案里看',
  removed: '已移出心仪清单',
  full: `清单满了（${WISHLIST_MAX} 瓶），先移除一瓶`,
  unavailable: '本机存储不可用，收藏仅本次有效',
});

/**
 * 内存版 localStorage（形状与真的一样：getItem / setItem / removeItem）。
 * 之所以不是「一个数组顶替」：数据层要的是存储接口，不是数据本身 ——
 * 给它同一套接口，里面存的仍然是 sp_wishlist_v1 的 JSON，
 * 形状与落盘时逐字节同构，将来要转存/导出不用另写一套。
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
 * @param {object}   primary         真存储上的清单实例（浏览器里是 wishlist）
 * @param {function} [makeMemoryWish] 造内存清单实例的工厂，测试可注入
 * @param {object|function} [realStorage]
 *   真存储介质本身（localStorage 或返回它的函数）。
 *   为什么要显式传：会话里有两个动作（撤销移除、取消已入手）不属于 L1 的
 *   API，得自己读写那个键。它们必须写在**这个实例真正用的介质**上 ——
 *   测试里注入的是内存对象，浏览器里是 localStorage。不去猜 globalThis，
 *   否则测试与浏览器会走两条不同的路（那正是"测试全绿、线上不对"的成因）。
 */
export function createWishSession(primary, makeMemoryWish, realStorage) {
  /* 兜底介质要留一个句柄出来（L3 加）。
     原因：清单页的「已入手」开关与「移除后撤销」都要写存储，而存储不可用
     时整页已经切到这份内存介质上了。若这两个动作还去直接摸 localStorage，
     就会变成「移除是内存里的事、撤销写进磁盘」这种一半真一半假的状态。
     留出 memoryStore() 让上层能拿到**当前真正在用的**那一份。 */
  let memStore = null;
  const makeMemory = typeof makeMemoryWish === 'function'
    ? makeMemoryWish
    : () => {
      memStore = createMemoryStore();
      return createWishlist(memStore);
    };

  /* 降级后不再回头试真存储：反复试写一个已知失败的介质，
     只会在每次点击上多一次配额异常，而且状态会来回抖（一会儿真一会儿假）。 */
  let fallback = null;

  const active = () => fallback || primary;

  /** 真存储介质：优先用调用方给的，其次才回落到浏览器全局。 */
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
    return browserStorage();
  }

  function has(id) {
    try {
      return active().has(id);
    } catch {
      /* 数据层承诺不抛，这里只是不让一次意外把整张结果页带崩。 */
      return false;
    }
  }

  function degraded() {
    return fallback != null;
  }

  /** 已入手回显也要跟着介质走 —— 否则降级时打了标记却读不出来。 */
  function isOwned(id) {
    try {
      return active().isOwned(id);
    } catch {
      return false;
    }
  }

  /** 当前真正在用的兜底介质（没降级时是 null，上层该用真存储）。 */
  function memoryStore() {
    return fallback ? memStore : null;
  }

  /**
   * 把一条被移除的条目**原样**写回（savedAt 不刷新）。
   *
   * 为什么不用 add()：add 会把 savedAt 刷成"现在"，于是撤销之后那瓶
   * 跳到清单最前面 —— 用户点了撤销却发现瓶子换了位置，比不给撤销更糟。
   *
   * 为什么可以直接写 JSON 而不是又造一个实例：L1 的落盘形状就是
   * `[{id, savedAt, reason}]`，且它**读时也会归一化**（normalizeItem +
   * sortDesc）。这里写进去的三项已按 L1 自己的常量（ID_MAX / REASON_MAX）
   * 夹过、键序一致，所以即便绕过一次 add()，磁盘上的形状与 L1 写的仍然同构，
   * 下一次读回来仍是三条键、仍按 savedAt 倒序。上限不用管：这是把刚删掉的
   * 一条放回去，长度只会回到删除前的值（≤50）。
   *
   * @returns {boolean} 是否写回成功
   */
  function undoRemove(item) {
    const id = cleanIdOf(item && item.id, WISHLIST_ID_MAX);
    if (!id) return false;
    const storage = degraded() ? memStore : realStore();
    if (!storage) return false;
    try {
      const raw = storage.getItem('sp_wishlist_v1');
      const cur = raw ? JSON.parse(raw) : [];
      const arr = Array.isArray(cur) ? cur : [];
      /* 已经在里面（比如别的标签页刚存回）→ 当作成功，不重复写。 */
      if (arr.some((x) => x && String(x.id) === id)) return true;
      const savedAt = Number(item.savedAt);
      storage.setItem('sp_wishlist_v1', JSON.stringify([...arr, {
        id,
        /* 原 savedAt 照抄；坏值退回 0（L1 对 0 的处理是排最后）——
           塞一个当前时间会把"没有可信时间"伪装成"刚刚存过"。 */
        savedAt: Number.isFinite(savedAt) && savedAt > 0 ? savedAt : 0,
        reason: cleanReasonOf(item.reason),
      }]));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 存/删一口。
   * @returns {{ ok:boolean, status:string, saved:boolean, degraded:boolean }}
   */
  function toggle(id, reason) {
    let res = active().toggle(id, reason);

    if (res && res.status === 'unavailable') {
      /* 真存储这一下没写成（隐私模式 / 配额满 / 无 storage）。
         换内存介质把**同一次动作**重做 —— 用户点的是「存」，
         不该因为我们落不了盘就变成什么都没发生。 */
      if (!fallback) fallback = makeMemory();
      res = fallback.toggle(id, reason);
      return {
        ...res,
        saved: has(id),
        degraded: true,
      };
    }

    return { ...res, saved: has(id), degraded: degraded() };
  }

  /**
   * 取消一条「已入手」。
   *
   * 为什么不走数据层新 API：src/wishlist.js 是 L1 已验收件，任务书明确
   * 「不许动三键白名单与上限逻辑」，而 L1 的守卫测试**正面比对**了它的
   * 全部 export 名 —— 加一个导出就会让那条守卫变红。它的已入手键语义很简单
   * （纯 id 数组、读时去重），这里按同一形状读写，不引入第二种形态。
   *
   * 介质同 undoRemove：降级时写兜底介质，不碰磁盘。
   *
   * @returns {boolean} 是否写成功
   */
  function unmarkOwned(id) {
    const sid = cleanIdOf(id, WISHLIST_ID_MAX);
    if (!sid) return false;
    const storage = degraded() ? memStore : realStore();
    if (!storage) return false;
    try {
      const raw = storage.getItem(WISHLIST_OWNED_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return false;
      const next = arr.map((v) => String(v == null ? '' : v)).filter((v) => v && v !== sid);
      storage.setItem(WISHLIST_OWNED_KEY, JSON.stringify([...new Set(next)]));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 「已入手」标记一次（幂等）。存储不可用时写进兜底介质，与存/删同一条路。
   * @returns {{ok:boolean, status:string, degraded:boolean}}
   */
  function toggleOwned(id) {
    let res = active().markOwned(id);
    if (res && res.status === 'unavailable') {
      if (!fallback) fallback = makeMemory();
      res = fallback.markOwned(id);
      return { ...res, degraded: true };
    }
    return { ...res, degraded: degraded() };
  }

  return {
    has, toggle, toggleOwned, unmarkOwned, isOwned, degraded, memoryStore, undoRemove, msg: WISH_MSG,
  };
}

/** 浏览器全局那份 localStorage（拿不到就是不可用）。 */
function browserStorage() {
  try {
    return typeof globalThis !== 'undefined' && globalThis.localStorage
      ? globalThis.localStorage
      : null;
  } catch {
    /* 隐私模式下访问 localStorage 本身就抛 SecurityError。 */
    return null;
  }
}

/* 撤销要按 L1 的同一套夹取规则重建三项 —— 常量与清理函数都从 L1 取，
   不在这里另写一份（另写一份就会在 L1 改规则时静默分叉）。 */
function cleanIdOf(v, max) {
  if (typeof v === 'string') {
    return String(v).replace(/\s+/g, ' ').trim().slice(0, max);
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

function cleanReasonOf(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, WISHLIST_REASON_MAX);
}

/**
 * 动作结果 → 一行提示。
 *
 * 判据顺序是有意的：**先看有没有成功**，再看存没存上。
 * 反过来的话，「满额被拒 + 当前是未存状态」会被读成「已移出心仪清单」——
 * 用户刚点的是「存」，却看到一句「已移出」，是最容易让人以为数据坏了的提示。
 *
 * @param {{ok:boolean,status:string,saved:boolean,degraded:boolean}} res
 * @param {{ full?:string, unavailable?:string }} [MSGS] 允许注入文案，测试用
 */
export function wishMessage(res, MSGS = WISH_MSG) {
  let text;
  if (res && res.status === 'full') text = MSGS.full;
  else if (res && res.saved) text = MSGS.saved;
  else text = MSGS.removed;

  /* 兜底生效时必须在提示里说清「只这一次有效」——
     否则用户下次打开发现清单是空的，会以为我们吞了他存的东西。 */
  if (res && res.degraded) text += `（${MSGS.unavailable}）`;
  return text;
}

/**
 * 存入时带的那句理由：**本轮结果里引擎给的原话**（reasons[0]）。
 *
 * ⚠️ 前缀是「持香推断」这类警告行的标记，结果卡与分享卡显示时都会去掉它
 * （app.js 的 li 渲染用 `t.replace('⚠️ ', '')`）。存进去的必须是
 * **去掉前缀后的同一句** —— 存的与看到的不一致，是这个功能最不该出的错。
 *
 * 必须是**数组**才取第 0 项：`'abc'[0]` 在 JS 里是 `'a'` ——
 * 初版就是少了这道判断，reason 被写成了单个字符（本套测试抓到的真缺陷）。
 * reasons 缺失 / 不是数组 / 空数组一律给空串：没理由就存空串，
 * 不编造（数据层也是同一条口径：reason 可为空）。
 */
export function wishReasonOf(r) {
  const list = r && r.reasons;
  if (!Array.isArray(list) || !list.length) return '';
  return String(list[0] == null ? '' : list[0]).replace(/^⚠️\s*/, '');
}
