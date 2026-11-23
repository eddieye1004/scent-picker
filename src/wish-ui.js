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

import { createWishlist, WISHLIST_MAX } from './wishlist.js';

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
 */
export function createWishSession(primary, makeMemoryWish) {
  const makeMemory = typeof makeMemoryWish === 'function'
    ? makeMemoryWish
    : () => createWishlist(createMemoryStore());

  /* 降级后不再回头试真存储：反复试写一个已知失败的介质，
     只会在每次点击上多一次配额异常，而且状态会来回抖（一会儿真一会儿假）。 */
  let fallback = null;

  const active = () => fallback || primary;

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

  return { has, toggle, degraded, msg: WISH_MSG };
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
