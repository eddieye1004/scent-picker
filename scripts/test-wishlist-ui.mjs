/**
 * test-wishlist-ui.mjs — 心仪清单 L2「结果页 ♡ 入口」的守门测试
 *
 * 两层：
 *   ① 纯逻辑（src/wish-ui.js）：存/删编排、满额、存储不可用降级、
 *      理由快照取哪一句、四句提示的逐字文案；
 *   ② 源码/产物守卫：app.js 是否真的把 ♡ 放进瓶名行、是否把提示挂到
 *      document.body、styles.css（产物）里是否有对应规则、以及
 *      src/wishlist.js（L1 数据层）是否**一个字节都没被改**。
 *
 * 为什么这一套不 import app.js：app.js 是 DOM 驱动的，拉起它要一整套
 * 渲染桩（见 test-render.mjs）。这里要守的是**判据**与**接线**，
 * 用内存存储 + 源码扫描就能钉死，跑得也快。渲染层的断言在 test-render.mjs。
 *
 * 用法：node scripts/test-wishlist-ui.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WISHLIST_KEY, WISHLIST_MAX, createWishlist, WISHLIST_ITEM_FIELDS,
} from '../src/wishlist.js';
import {
  WISH_MSG, createMemoryStore, createWishSession, wishMessage, wishReasonOf,
} from '../src/wish-ui.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
const fails = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + name); } else {
    fails.push(name);
    console.log('  ✗ ' + name + (detail ? ' :: ' + detail : ''));
  }
};

/* ---------- 内存存储（与 test-wishlist 的 MemStore 同形） ---------- */
class MemStore {
  constructor(seed = {}) { this.map = new Map(Object.entries(seed)); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

/* 配额满 / 隐私模式：setItem 一律抛。数据层会把它报成 unavailable。 */
class QuotaStore extends MemStore {
  setItem() { throw new Error('QuotaExceededError'); }
}

function clock(start = 1763600000000) {
  let t = start;
  return () => { t += 1000; return t; };
}

console.log('\n===== ① 理由快照：取哪一句、要不要去前缀 =====');
{
  ok('取 reasons[0]（引擎给的第一句）',
    wishReasonOf({ reasons: ['主体就是柑橘调，底下垫着木质调', '厚重感 0.11'] })
      === '主体就是柑橘调，底下垫着木质调',
    wishReasonOf({ reasons: ['主体就是柑橘调，底下垫着木质调', '厚重感 0.11'] }));

  /* ⚠️ 前缀是「持香推断」这类警告行的标记。结果卡与分享卡渲染时都去掉了它
     （app.js `t.replace('⚠️ ', '')`），存进去的必须是同一句 ——
     存的与看到的不一致是这个功能最不该出的错。 */
  ok('⚠️ 前缀被去掉，与卡片上显示的一致',
    wishReasonOf({ reasons: ['⚠️ 持香 2/5，比你想要的短'] }) === '持香 2/5，比你想要的短',
    wishReasonOf({ reasons: ['⚠️ 持香 2/5，比你想要的短'] }));
  ok('没有 ⚠️ 时不改动原文',
    wishReasonOf({ reasons: ['厚重感 0.42，比你要的 5/5 更清透'] }) === '厚重感 0.42，比你要的 5/5 更清透');

  ok('reasons 为空 → 空串（不编造理由）', wishReasonOf({ reasons: [] }) === '');
  ok('reasons 缺失 → 空串，不抛', wishReasonOf({}) === '' && wishReasonOf(null) === '');
  ok('reasons 不是数组 → 空串，不抛', wishReasonOf({ reasons: 'x' }) === '');
}

console.log('\n===== ② 四句提示：逐字对应任务书 =====');
{
  ok('存入提示', WISH_MSG.saved === '已存入心仪清单 · 在香水档案里看', WISH_MSG.saved);
  ok('移出提示', WISH_MSG.removed === '已移出心仪清单', WISH_MSG.removed);
  ok('满额提示带上限', WISH_MSG.full === `清单满了（${WISHLIST_MAX} 瓶），先移除一瓶`, WISH_MSG.full);
  ok('满额提示里的数字与数据层常量同源（不是另写一个 50）',
    String(WISHLIST_MAX) === '50' && WISH_MSG.full.includes('50'));
  ok('不可用提示', WISH_MSG.unavailable === '本机存储不可用，收藏仅本次有效', WISH_MSG.unavailable);

  ok('存成功 → 存入提示',
    wishMessage({ ok: true, status: 'added', saved: true }) === WISH_MSG.saved,
    wishMessage({ ok: true, status: 'added', saved: true }));
  ok('删成功 → 移出提示',
    wishMessage({ ok: true, status: 'removed', saved: false }) === WISH_MSG.removed,
    wishMessage({ ok: true, status: 'removed', saved: false }));
  ok('满额被拒 → 满额提示（不说"已移出"）',
    wishMessage({ ok: false, status: 'full', saved: false }) === WISH_MSG.full,
    wishMessage({ ok: false, status: 'full', saved: false }));

  /* 判据顺序：先看有没有成功，再看存没存上。反过来的话
     「满额被拒 + 当前未存」会被读成「已移出」—— 用户刚点的是存。 */
  ok('满额即使当前是未存态也不说"已移出"',
    !wishMessage({ ok: false, status: 'full', saved: false }).includes('已移出'));

  ok('降级时提示里追加"仅本次有效"',
    wishMessage({ ok: true, status: 'added', saved: true, degraded: true })
      === `${WISH_MSG.saved}（${WISH_MSG.unavailable}）`,
    wishMessage({ ok: true, status: 'added', saved: true, degraded: true }));
  ok('降级 + 移出也带说明',
    wishMessage({ ok: true, status: 'removed', saved: false, degraded: true }).includes('仅本次有效'));
  ok('没降级时不追加（正常路径不啰嗦）',
    !wishMessage({ ok: true, status: 'added', saved: true }).includes('仅本次有效'));
}

console.log('\n===== ③ 存 / 删 / 回显：真存储路径 =====');
{
  const store = new MemStore();
  const w = createWishlist(store, { now: clock() });
  const s = createWishSession(w);

  ok('初始未存', s.has('p1') === false);
  const a = s.toggle('p1', '主体就是柑橘调');
  ok('点一下 → 存上，返回 saved:true', a.ok && a.saved === true, JSON.stringify(a));
  ok('回显读的是同一个存储', s.has('p1') === true);
  ok('没降级', a.degraded === false && s.degraded() === false);

  const raw = JSON.parse(store.getItem(WISHLIST_KEY));
  ok('落盘只有三键', raw.length === 1 && Object.keys(raw[0]).join(',') === 'id,savedAt,reason',
    JSON.stringify(raw[0]));
  ok('reason 就是传进去的那句原文', raw[0].reason === '主体就是柑橘调', raw[0].reason);

  const b = s.toggle('p1', '第二句');
  ok('再点一下 → 移掉，返回 saved:false', b.ok && b.saved === false, JSON.stringify(b));
  ok('移掉后回显是 false', s.has('p1') === false);
  ok('移掉后磁盘是空数组', store.getItem(WISHLIST_KEY) === '[]', store.getItem(WISHLIST_KEY));

  /* 消息要与状态一致地成对出现 */
  ok('存上给"存入"、移掉给"移出"',
    wishMessage(a) === WISH_MSG.saved && wishMessage(b) === WISH_MSG.removed);
}

console.log('\n===== ④ 满 50：拒绝新的，提示给"先移除一瓶" =====');
{
  const store = new MemStore();
  const w = createWishlist(store, { now: clock() });
  const s = createWishSession(w);
  for (let i = 0; i < WISHLIST_MAX; i++) s.toggle('f' + i, 'r' + i);

  ok(`存满 ${WISHLIST_MAX} 条`, w.list().length === WISHLIST_MAX, String(w.list().length));
  const rej = s.toggle('overflow', '第 51 瓶');
  ok('第 51 瓶被拒，status = full', rej.ok === false && rej.status === 'full', JSON.stringify(rej.status));
  ok('被拒后回显仍是"未存"', rej.saved === false);
  ok('被拒后长度不变', JSON.parse(store.getItem(WISHLIST_KEY)).length === WISHLIST_MAX);
  ok('被拒的提示是满额那句', wishMessage(rej) === WISH_MSG.full, wishMessage(rej));
  ok('满额时不算降级（磁盘是好的，只是满了）', rej.degraded === false);

  /* 满额后**更新**已有条目仍然可以（不算新增）—— 否则用户存不进去也改不了 */
  const upd = s.toggle('f0', '换个理由');
  ok('满额时对已存在的那瓶再点 = 移出（切换语义）', upd.ok && upd.saved === false, JSON.stringify(upd.status));
  const back = s.toggle('f0', '换个理由');
  ok('再点回去能存回来（腾出一位后）', back.ok && back.saved === true, JSON.stringify(back.status));
}

console.log('\n===== ⑤ 存储不可用：本页内存兜底 =====');
{
  /* 用 QuotaStore：true 存储存在但 setItem 抛 → 数据层报 unavailable。
     这正是隐私模式 / 配额满在浏览器里的实际形状。 */
  const realStore = new QuotaStore();
  const w = createWishlist(realStore, { now: clock() });
  const s = createWishSession(w);

  ok('降级前未存', s.has('p1') === false && s.degraded() === false);

  const a = s.toggle('p1', '主体就是柑橘调');
  ok('真存储写不了 → 仍然存上了（内存兜底）', a.ok === true && a.saved === true, JSON.stringify(a));
  ok('结果标了 degraded', a.degraded === true);
  ok('会话标了 degraded', s.degraded() === true);
  ok('回显是"已存"（空心 → 实心照常工作）', s.has('p1') === true);
  ok('提示里注明"仅本次有效"', wishMessage(a).includes('仅本次有效'), wishMessage(a));

  /* 关键：兜底不是"假装成功"。真存储必须仍然是空的 ——
     如果我们往一个坏介质上硬写并报成功，用户下次打开就什么都没了。 */
  ok('真存储没有被写入假数据', realStore.getItem(WISHLIST_KEY) == null,
    String(realStore.getItem(WISHLIST_KEY)));

  const b = s.toggle('p1', '');
  ok('兜底里的删也照常工作', b.ok && s.has('p1') === false, JSON.stringify(b.status));
  ok('删的时候仍标 degraded（提示要继续说明"仅本次有效"）', b.degraded === true);

  /* 多瓶：内存兜底是完整清单，不是只记住最近一瓶 */
  s.toggle('p2', '二');
  s.toggle('p3', '三');
  ok('兜底里能同时存多瓶', s.has('p2') && s.has('p3'));
  const again = s.toggle('p2', '二');
  ok('兜底里对已存的再点 → 移出', again.ok && s.has('p2') === false && s.has('p3') === true);

  /* 降级一次就长住：不再回头试真存储（否则状态会来回抖） */
  let writes = 0;
  const counting = new QuotaStore();
  const origSet = counting.setItem.bind(counting);
  counting.setItem = (k, v) => { writes++; return origSet(k, v); };
  const s2 = createWishSession(createWishlist(counting, { now: clock() }));
  s2.toggle('q1', 'a');            // 这一次会撞配额 → 降级
  ok('第一次点击确实碰了真存储（并失败）', s2.degraded() === true);
  s2.toggle('q2', 'b');
  s2.toggle('q3', 'c');
  ok('降级后不再反复试真存储（真存储零成功写入）',
    counting.getItem(WISHLIST_KEY) == null);

  /* 取存储就抛（某些浏览器直接访问 localStorage 就抛 SecurityError） */
  const throwing = createWishlist(() => { throw new Error('SecurityError'); });
  const s3 = createWishSession(throwing);
  const c = s3.toggle('p9', '取存储都抛');
  ok('取存储抛错 → 仍然兜底成功', c.ok === true && c.saved === true, JSON.stringify(c));
}

console.log('\n===== ⑥ 内存介质本身：形状与落盘一致 =====');
{
  const mem = createMemoryStore();
  ok('有 getItem / setItem / removeItem 三件套',
    ['getItem', 'setItem', 'removeItem'].every((k) => typeof mem[k] === 'function'));
  ok('没写的键读出来是 null（与 localStorage 同）', mem.getItem('nope') === null);

  const w = createWishlist(mem, { now: clock() });
  w.add('p1', '理由');
  const raw = JSON.parse(mem.getItem(WISHLIST_KEY));
  ok('内存里存的仍是 sp_wishlist_v1 的 JSON 数组', Array.isArray(raw) && raw.length === 1);
  ok('内存里的每条也只有三键',
    Object.keys(raw[0]).join(',') === WISHLIST_ITEM_FIELDS.join(','), Object.keys(raw[0]).join(','));
  ok('setItem 会 String() 化（与真 localStorage 同语义）',
    typeof mem.getItem(WISHLIST_KEY) === 'string');
  mem.removeItem(WISHLIST_KEY);
  ok('removeItem 能清掉', mem.getItem(WISHLIST_KEY) === null);
}

console.log('\n===== ⑦ 接线守卫：app.js 真的接到了它们 =====');
{
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

  ok('app.js 引入 wish-ui 的三个出口',
    /from '\.\/src\/wish-ui\.js'/.test(app)
    && /createWishSession/.test(app) && /wishMessage/.test(app) && /wishReasonOf/.test(app),
    (app.match(/wish-ui\.js[^;]*/g) || []).join(' | '));
  ok('app.js 用 L1 的默认实例（不另造存储）',
    /import \{ wishlist \} from '\.\/src\/wishlist\.js'/.test(app));
  ok('会话是单例（模块级 const，不在 render 里新建）',
    /const wishSession = createWishSession\(/.test(app));

  /* ♡ 必须挂在瓶名行里 —— 这是"与购买按钮分列两端"的结构保证 */
  ok('♡ 挂在 .pick-name-row 内、h3 之后',
    /class: 'pick-name-row' \},[\s\S]{0,120}el\('h3'[\s\S]{0,200}wishHeart\(p, r, sayWish\)/.test(app),
    '结构变了就说明 ♡ 离开了瓶名行，防误触的前提不再成立');
  ok('购买按钮组仍在卡片页脚（与 ♡ 不同区域）',
    /class: 'pick-foot'/.test(app) && /pick-buy-group/.test(app));

  /* 存入时传的是理由原文，不是拼出来的句子 */
  ok('点击时把 wishReasonOf(r) 交给 toggle（不是空串/自己拼）',
    /wishSession\.toggle\(id, wishReasonOf\(r\)\)/.test(app));
  ok('toggle 的返回直接交给 wishMessage（提示与状态同源）',
    /say\(wishMessage\(res\)\)/.test(app));

  /* 提示必须挂 body：留在结果区 DOM 里会被带 transform 的 .fade-in 收成包含块，
     实测 y=2698（视口 900）—— 整条跑到屏幕外，用户什么也看不到。 */
  ok('提示条是单例（ensureWishBar + 模块级缓存）',
    /let WISH_BAR = null/.test(app) && /function ensureWishBar\(\)/.test(app));
  ok('提示条挂到 document.body（躲开 .fade-in 的 transform 包含块）',
    /document\.body\.appendChild\(WISH_BAR\)/.test(app));
  ok('提示条带 role=status + aria-live=polite（读屏播报不打断）',
    /'aria-live': 'polite'/.test(app) && /role: 'status'/.test(app));
  ok('提示自动消失（setTimeout 里 setAttribute hidden）',
    /setTimeout\(\(\) => \{[\s\S]{0,160}setAttribute\('hidden', ''\)/.test(app));

  /* 心形是 SVG 而不是 ♡ 字符：390 下字形大小由系统字体决定，不可控 */
  ok('心形用内联 SVG（空心/实心只差 fill）',
    /createElementNS\(SVG_NS, 'svg'\)/.test(app) && /qw-wish-glyph/.test(app));
  ok('初始化与回显都调 wishIsSaved（空心/实心同源）',
    /const saved0 = wishIsSaved\(id\)/.test(app) && /const on = wishIsSaved\(id\)/.test(app));
  ok('aria-pressed 跟着状态走',
    /setAttribute\('aria-pressed', on \? 'true' : 'false'\)/.test(app));
}

console.log('\n===== ⑧ 产物守卫：styles.css 里有对应规则 =====');
{
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const src = fs.readFileSync(path.join(ROOT, 'styles', 'src', '99-wishlist.css'), 'utf8');

  ok('styles.css 里有 .pick-name-row 规则', /\.pick-name-row\s*\{/.test(css));
  ok('styles.css 里有 .qw-wish 规则', /\.qw-wish\s*\{/.test(css));
  ok('styles.css 里有实心态 .qw-wish.is-on', /\.qw-wish\.is-on/.test(css));
  ok('styles.css 里有提示条 .qw-wish-bar', /\.qw-wish-bar/.test(css));

  /* 触控下限 44px：与 .btn / .chip / .disc-sector 同一档 */
  const block = src.slice(src.indexOf('.qw-wish {'), src.indexOf('}', src.indexOf('.qw-wish {')));
  ok('♡ 的命中方框 44×44（与 .btn 同档）', /width:\s*44px/.test(block) && /height:\s*44px/.test(block),
    block.replace(/\s+/g, ' ').slice(0, 120));
  ok('♡ 有 min-height:44px（test-contrast 的触控判据按它读）', /min-height:\s*44px/.test(block));

  /* 提示不挡操作：不在命中测试里 */
  ok('提示条 pointer-events: none（点击穿透）', /pointer-events:\s*none/.test(src));
  ok('提示条是 fixed（贴视口，不是文档流）', /\.qw-wish-bar\s*\{[^}]*position:\s*fixed/.test(src));
  ok('提示条 hidden 时显式 display:none（不被层叠掉）',
    /\.qw-wish-bar\[hidden\]\s*\{\s*display:\s*none/.test(src));

  /* 字号下限 12px（test-contrast 的同一道门，这里提前拦） */
  const sizes = [...src.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => parseFloat(m[1]));
  ok('本层所有字号 ≥ 12px', sizes.every((n) => n >= 12), sizes.join(','));

  /* 焦点环：与全站同一条蓝环，不新增色值 */
  ok('♡ 有 :focus-visible 蓝环', /\.qw-wish:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--blue\)/.test(src));
  const hexes = [...src.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  ok('本层不新增硬编码色值（全走 token）', hexes.length === 0, hexes.join(','));

  /* 构建脚本要收这一层，否则再跑一次 build-css 就把它丢了 */
  const build = fs.readFileSync(path.join(ROOT, 'scripts', 'build-css.mjs'), 'utf8');
  ok('build-css 的 PARTS 里收了 99-wishlist.css', /'99-wishlist\.css'/.test(build));
  ok('99 层排在 98-avoid-wall 之后（顺序即语义）',
    build.indexOf("'99-wishlist.css'") > build.indexOf("'98-avoid-wall.css'"),
    `${build.indexOf("'98-avoid-wall.css'")} → ${build.indexOf("'99-wishlist.css'")}`);
}

console.log('\n===== ⑨ L1 数据层零改动守卫 =====');
{
  const wl = fs.readFileSync(path.join(ROOT, 'src', 'wishlist.js'), 'utf8');
  ok('数据层仍然不碰 DOM', !/document\.|querySelector|classList|innerHTML/.test(wl));
  ok('数据层仍然没有任何上传路径', !/fetch\(|XMLHttpRequest|sendBeacon/.test(wl));
  ok('数据层仍然不 import UI 层（依赖方向只能 app → wish-ui → wishlist）',
    !/wish-ui/.test(wl));
  ok('键名与上限仍与约定一致',
    wl.includes("'sp_wishlist_v1'") && wl.includes("'sp_wishlist_owned_v1'") && WISHLIST_MAX === 50);
  ok('三键白名单导出仍是 id,savedAt,reason',
    WISHLIST_ITEM_FIELDS.join(',') === 'id,savedAt,reason');

  /* 依赖方向：wish-ui 可以依赖 wishlist，反过来不行。这条是分层的唯一硬约束。 */
  const ui = fs.readFileSync(path.join(ROOT, 'src', 'wish-ui.js'), 'utf8');
  ok('wish-ui 依赖 wishlist（正向）', /from '\.\/wishlist\.js'/.test(ui));
  ok('wish-ui 不碰 DOM（所以能在 node 里直接测）',
    !/document\.|window\.|querySelector|classList|innerHTML/.test(ui));
}

console.log('\n===== 心仪清单 L2 结果页入口测试 =====');
console.log(`PASS ${pass}  FAIL ${fails.length}`);
if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exitCode = 1;
}
