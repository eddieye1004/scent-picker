/**
 * verify-wishlist-l3.mjs — 心仪清单 L3「清单页本体」的浏览器级证据（Edge CDP，无第三方依赖）
 *
 * 与 L2 那份同一套手法（真浏览器 + 真点击 + 转储），但这一份要证明的是
 * **清单页这一屏真的长出来了**，而不只是纯函数算得对：
 *
 *   ① 造两条真数据（一条有价格带、一条没有），进清单页，逐项量：
 *      五要素是否都在、价格是否只出现在有数据的那一行、几何（触控 44px、
 *      买/移除/已入手三处是否不相邻）；
 *   ② 已入手切换**刷新后仍在**（持久化，不是只改了一下 DOM 颜色）；
 *   ③ 移除 → 撤销条 → 点撤销 → 那一瓶回来且位置不变；
 *   ④ 空清单的空态（不白屏）+ 满 50 的提示；
 *   ⑤ 存储不可用时的降级提示（沿用 L2 口径）；
 *   ⑥ 截图：桌面 1440 与 390（各含 ≥2 行、一行已入手、一行带价格带）。
 *
 * 用法：
 *   node server.js 8139 &
 *   node scripts/verify-wishlist-l3.mjs --out=<dir> [--base=http://127.0.0.1:8139]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const arg = (k, d) => {
  const hit = process.argv.find((x) => x.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const OUT = path.resolve(arg('out', '.legs/wishlist-l3'));
const BASE = arg('base', 'http://127.0.0.1:8139');
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9700 + Math.floor(Math.random() * 60);
const proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(OUT, `.edge-${Date.now()}`)}`, '--no-first-run',
  '--disable-gpu', '--hide-scrollbars', '--disable-extensions',
  '--disable-component-extensions-with-background-pages',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 140; i++) {
  try {
    const j = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = j.find((x) => x.type === 'page' && x.url === 'about:blank');
    if (target) break;
  } catch { /* 等 */ }
  await sleep(200);
}
if (!target) { console.error('CDP 没起来'); proc.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; pend.set(i, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (x) => (await send('Runtime.evaluate', {
  expression: x, returnByValue: true, awaitPromise: true,
})).result.value;

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-color-scheme', value: 'light' }],
});

const results = { ranAt: new Date().toISOString(), base: BASE, stages: [] };
const log = (k, v) => { results.stages.push({ k, v }); console.log(`  ${k}: ${JSON.stringify(v).slice(0, 300)}`); };

async function viewport(w, h, dpr, mobile) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: dpr, mobile: !!mobile,
  });
}
async function shot(file) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(data, 'base64'));
}

/** 走完问卷到结果页（每屏点第一项，末屏点「看推荐」）。 */
async function runToResult() {
  await send('Page.navigate', { url: BASE + '/index.html' });
  for (let i = 0; i < 90; i++) {
    const ready = await ev("!!document.querySelector('.q-title, .disc-sector')");
    if (ready) break;
    await sleep(200);
  }
  await sleep(700);
  for (let i = 0; i < 14; i++) {
    const done = await ev(`(() => {
      const btns = [...document.querySelectorAll('#app .btn')];
      const f = btns.find((b) => /看推荐/.test(b.textContent));
      if (f) { f.click(); return 'finish'; }
      const opt = document.querySelector('#app .disc-sector, #app .choice, #app .chip, #app [role="radio"]');
      if (opt) opt.click();
      const next = btns.find((b) => /下一步/.test(b.textContent));
      if (next) { next.click(); return 'next'; }
      return 'stuck';
    })()`);
    await sleep(done === 'finish' ? 1300 : 380);
    if (done === 'finish' || done === 'stuck') break;
  }
  await sleep(700);
}

/** 直接写清单存储（比点三次 ♡ 稳，也不会因为推荐结果变化而变）。 */
async function seed(items) {
  return ev(`(() => {
    localStorage.setItem('sp_wishlist_v1', ${JSON.stringify(JSON.stringify(items))});
    localStorage.removeItem('sp_wishlist_owned_v1');
    return localStorage.getItem('sp_wishlist_v1');
  })()`);
}

/** 从结果页进清单页（点档案区那枚入口）。 */
async function openList() {
  return ev(`(() => {
    const b = document.querySelector('.qw-wl-entry');
    if (!b) return 'no-entry';
    b.click();
    return 'clicked';
  })()`);
}

const dumpList = () => ev(`(() => {
  const page = document.querySelector('.qw-wl-page');
  if (!page) return { page: false };
  const rows = [...page.querySelectorAll('.qw-wl-row')].map((r) => {
    const box = (n) => { if (!n) return null; const b = n.getBoundingClientRect();
      return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), bottom: +b.bottom.toFixed(1) }; };
    return {
      id: r.getAttribute('data-wish-id'),
      name: (r.querySelector('.qw-wl-name') || {}).textContent || null,
      brand: (r.querySelector('.qw-wl-brand') || {}).textContent || null,
      reason: (r.querySelector('.qw-wl-reason') || {}).textContent || null,
      date: (r.querySelector('.qw-wl-date') || {}).textContent || null,
      price: (r.querySelector('.qw-wl-price') || {}).textContent || null,
      hasPhoto: !!r.querySelector('.qw-wl-art img'),
      hasBottleArt: !!r.querySelector('.qw-wl-art svg'),
      owned: (r.querySelector('.qw-wl-owned') || {}).getAttribute
        ? r.querySelector('.qw-wl-owned').getAttribute('aria-pressed') : null,
      ownedText: (r.querySelector('.qw-wl-owned') || {}).textContent || null,
      ownedBox: box(r.querySelector('.qw-wl-owned')),
      buy: (() => { const a = r.querySelector('.qw-wl-buy');
        return a ? { text: a.textContent, href: a.getAttribute('href'),
          rel: a.getAttribute('rel'), affiliate: a.getAttribute('data-affiliate') } : null; })(),
      buyBox: box(r.querySelector('.qw-wl-buy')),
      removeBox: box(r.querySelector('.qw-wl-remove')),
      rowBox: box(r),
    };
  });
  const notes = [...page.querySelectorAll('.qw-wl-note')].map((n) => ({ kind: n.getAttribute('data-note'), text: n.textContent }));
  const empty = page.querySelector('.qw-wl-empty');
  return {
    page: true,
    step: document.querySelector('#app').getAttribute('data-step'),
    title: (page.querySelector('.qw-wl-title') || {}).textContent || null,
    sub: (page.querySelector('.qw-wl-sub') || {}).textContent || null,
    rows,
    notes,
    empty: empty ? {
      title: (empty.querySelector('.qw-wl-empty-title') || {}).textContent,
      hint: (empty.querySelector('.qw-wl-empty-hint') || {}).textContent,
      cta: (empty.querySelector('.qw-wl-empty-cta') || {}).textContent,
    } : null,
    listCount: page.querySelectorAll('.qw-wl-list').length,
    scrollH: document.documentElement.scrollHeight,
    bodyText: (document.body.textContent || '').slice(0, 80),
  };
})()`);

const storage = () => ev(`({
  wish: localStorage.getItem('sp_wishlist_v1'),
  owned: localStorage.getItem('sp_wishlist_owned_v1'),
})`);

/* ============================================================
   ① 两条真数据：一条有价格带、一条没有；看一眼五要素
   ============================================================ */
console.log('\n[1] 桌面 1440：两条数据（一条有价格带 + 一条没有），逐项量五要素');
await viewport(1440, 900, 1, false);
await runToResult();

/* 选两瓶：一瓶确定有价位带（b600-1200 里的 fico-di-amalfi），
   一瓶确认**没有**价位带（从真实数据里挑，不靠猜）。
   第三条刻意留空理由 —— 空理由那一格必须整格不出现。 */
const picked = await ev(`(async () => {
  const pb = await (await fetch('./data/price-bands.json')).json();
  const all = Object.values(pb.bandOfId || {}).flat();
  const priced = all[0];
  const pf = await (await fetch('./data/perfumes.json')).json();
  const ids = new Set(pf.perfumes.map((p) => p.id));
  const unpriced = pf.perfumes.map((p) => p.id).find((x) => !all.includes(x));
  return { priced, unpriced, pricedInLib: ids.has(priced), unpricedInLib: ids.has(unpriced) };
})()`);
log('picked-ids', picked);

const seeded = await seed([
  { id: picked.priced, savedAt: Date.now() - 1000, reason: '主体就是柑橘调，底下垫着木质调' },
  { id: picked.unpriced, savedAt: Date.now() - 5000, reason: '' },
]);
log('seeded', seeded);

await openList();
await sleep(900);
const list1 = await dumpList();
log('list-step', { page: list1.page, step: list1.step, title: list1.title, sub: list1.sub });
log('list-rows', list1.rows.map((r) => ({
  id: r.id, name: r.name, price: r.price, hasPhoto: r.hasPhoto, hasBottleArt: r.hasBottleArt,
  reason: r.reason, date: r.date, buy: r.buy && r.buy.text, owned: r.owned,
})));

{
  const a = list1.rows.find((r) => r.id === picked.priced);
  const b = list1.rows.find((r) => r.id === picked.unpriced);
  results.assert1 = {
    enteredPage: list1.page === true && list1.step === 'wishlist',
    twoRows: list1.rows.length === 2,
    /* 有数据的行：五要素齐全 */
    hasName: !!a && !!a.name,
    hasBrand: !!a && !!a.brand,
    hasReason: !!a && !!a.reason,
    hasPrice: !!a && /参考价/.test(a.price || ''),
    hasDate: !!a && /最近存入/.test(a.date || ''),
    hasArt: !!a && (a.hasPhoto || a.hasBottleArt),
    /* 没价格的那行：不许出现价格格（更不许编） */
    noPriceWhenMissing: !!b && b.price === null,
    /* 空理由那行：整格不出现 */
    noReasonWhenEmpty: !!b && b.reason === null,
    /* 排序：savedAt 倒序（先存的那条在下面） */
    orderDesc: list1.rows[0].id === picked.priced && list1.rows[1].id === picked.unpriced,
  };
  log('assert-1', results.assert1);
}

/* ============================================================
   ② 几何：触控 44px、三个动作互不相邻
   ============================================================ */
{
  const r0 = list1.rows[0];
  const ownedH = r0.ownedBox ? r0.ownedBox.h : 0;
  const removeH = r0.removeBox ? r0.removeBox.h : 0;
  /* 「买」与「移除」垂直间距：两者在同一动作列里，必须留出空隙；
     而「已入手」在左侧，与它们横向隔着整行宽度。 */
  const gapBuyRemove = (r0.buyBox && r0.removeBox)
    ? +(r0.removeBox.y - r0.buyBox.bottom).toFixed(1) : null;
  const gapOwnedBuy = (r0.ownedBox && r0.buyBox)
    ? +(r0.buyBox.x - (r0.ownedBox.x + r0.ownedBox.w)).toFixed(1) : null;
  results.assert2 = {
    owned44: ownedH >= 44,
    remove44: removeH >= 44,
    gapBuyRemove,
    gapOwnedBuy,
  };
  log('assert-2-geometry', results.assert2);
}

await shot('list-desktop.png');

/* 整页长图（含页脚），供人眼复核这一屏的完整观感 */
{
  const h = await ev('document.documentElement.scrollHeight');
  const { data } = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: 1440, height: Math.min(h, 2400), scale: 1 },
  });
  fs.writeFileSync(path.join(OUT, 'list-desktop-full.png'), Buffer.from(data, 'base64'));
}

/* ============================================================
   ③ 已入手切换 + 持久化（刷新后仍在）
   ============================================================ */
console.log('\n[2] 点「已入手」→ 刷新 → 状态仍在（持久化）');
{
  const before = await ev(`(() => {
    const r = [...document.querySelectorAll('.qw-wl-row')][0];
    return r.querySelector('.qw-wl-owned').getAttribute('aria-pressed');
  })()`);
  await ev(`document.querySelector('.qw-wl-row .qw-wl-owned').click()`);
  await sleep(700);
  const after = await ev(`(() => {
    const r = [...document.querySelectorAll('.qw-wl-row')][0];
    const b = r.querySelector('.qw-wl-owned');
    return { pressed: b.getAttribute('aria-pressed'), text: b.textContent,
      on: b.classList.contains('is-on'), rowOwned: r.classList.contains('is-owned'),
      store: localStorage.getItem('sp_wishlist_owned_v1') };
  })()`);
  log('owned-toggle', { before, after });

  /* 刷新（不是重画）—— 证明写进了存储，而不是只改了 DOM 颜色 */
  const back = await openListAfterReload();
  log('owned-after-reload', back);

  results.assert3 = {
    beforeOff: before === 'false',
    afterOn: after.pressed === 'true' && after.on === true,
    rowMarked: after.rowOwned === true,
    storedInKey: typeof after.store === 'string' && after.store.includes(list1.rows[0].id),
    survivesReload: back.pressed === 'true' && back.on === true,
  };
  log('assert-3', results.assert3);
}

/** 刷新页面后重新进清单页（localStorage 保留，state 重置）。 */
async function openListAfterReload() {
  await send('Page.navigate', { url: BASE + '/index.html' });
  for (let i = 0; i < 90; i++) {
    const ready = await ev("!!document.querySelector('.masthead')");
    if (ready) break;
    await sleep(200);
  }
  await sleep(900);
  /* 刷新后落在首页（问卷第 1 屏），先走到结果页才能看到档案区入口。
     走问卷会清掉清单吗？不会 —— 清单在 localStorage，与问卷无关。 */
  await runToResultInPlace();
  await openList();
  await sleep(800);
  return ev(`(() => {
    const r = [...document.querySelectorAll('.qw-wl-row')][0];
    if (!r) return { pressed: null, on: false };
    const b = r.querySelector('.qw-wl-owned');
    return { pressed: b.getAttribute('aria-pressed'), on: b.classList.contains('is-on'),
      text: b.textContent, rows: document.querySelectorAll('.qw-wl-row').length };
  })()`);
}

/** 在**当前已导航**的页面里走问卷到结果页（不重新 navigate）。 */
async function runToResultInPlace() {
  for (let i = 0; i < 90; i++) {
    const ready = await ev("!!document.querySelector('.q-title, .disc-sector, .pick')");
    if (ready) break;
    await sleep(200);
  }
  for (let i = 0; i < 14; i++) {
    const done = await ev(`(() => {
      const btns = [...document.querySelectorAll('#app .btn')];
      const f = btns.find((b) => /看推荐/.test(b.textContent));
      if (f) { f.click(); return 'finish'; }
      const opt = document.querySelector('#app .disc-sector, #app .choice, #app .chip, #app [role="radio"]');
      if (opt) opt.click();
      const next = btns.find((b) => /下一步/.test(b.textContent));
      if (next) { next.click(); return 'next'; }
      return 'stuck';
    })()`);
    await sleep(done === 'finish' ? 1300 : 380);
    if (done === 'finish' || done === 'stuck') break;
  }
  await sleep(700);
}

/* 桌面截图重拍一张（含已入手那一行）—— 断言 ③ 已经把首行标成已入手 */
await shot('list-desktop-owned.png');

/* ============================================================
   ④ 移除 → 撤销条 → 点撤销 → 回来且位置不变
   ============================================================ */
console.log('\n[3] 移除 → 撤销条 → 点撤销');
{
  const beforeIds = await ev(`[...document.querySelectorAll('.qw-wl-row')].map((r) => r.getAttribute('data-wish-id'))`);
  /* 移除第 2 行（没价格那条），撤销后它必须回到第 2 位 */
  await ev(`[...document.querySelectorAll('.qw-wl-row')][1].querySelector('.qw-wl-remove').click()`);
  await sleep(500);
  const afterRemove = await ev(`(() => {
    const bar = document.querySelector('.qw-wish-bar');
    return {
      ids: [...document.querySelectorAll('.qw-wl-row')].map((r) => r.getAttribute('data-wish-id')),
      barText: bar ? bar.textContent : null,
      barHidden: bar ? bar.hasAttribute('hidden') : null,
      hasUndo: !!(bar && bar.querySelector('.qw-wl-undo')),
      storeLen: (JSON.parse(localStorage.getItem('sp_wishlist_v1') || '[]')).length,
    };
  })()`);
  log('after-remove', afterRemove);

  /* 撤销 */
  await ev(`document.querySelector('.qw-wish-bar .qw-wl-undo') && document.querySelector('.qw-wish-bar .qw-wl-undo').click()`);
  await sleep(600);
  const afterUndo = await ev(`(() => ({
    ids: [...document.querySelectorAll('.qw-wl-row')].map((r) => r.getAttribute('data-wish-id')),
    store: JSON.parse(localStorage.getItem('sp_wishlist_v1') || '[]'),
  }))()`);
  log('after-undo', { ids: afterUndo.ids, store: afterUndo.store.map((x) => ({ id: x.id, savedAt: x.savedAt })) });

  results.assert4 = {
    removed: afterRemove.ids.length === beforeIds.length - 1,
    undoBarShown: afterRemove.hasUndo === true && afterRemove.barHidden === false,
    undoBarSaysRemoved: /已移除/.test(afterRemove.barText || ''),
    restored: afterUndo.ids.length === beforeIds.length,
    /* 位置不变：撤销保留原 savedAt，所以顺序与删除前一致 */
    orderRestored: JSON.stringify(afterUndo.ids) === JSON.stringify(beforeIds),
    stillThreeKeys: afterUndo.store.length > 0
      && Object.keys(afterUndo.store[0]).join(',') === 'id,savedAt,reason',
  };
  log('assert-4', results.assert4);
}

/* ============================================================
   ⑤ 空态（不白屏）+ 满 50 提示 + 降级提示
   ============================================================ */
console.log('\n[4] 空态 / 满 50 / 存储不可用降级');
{
  await ev("localStorage.setItem('sp_wishlist_v1','[]'); localStorage.removeItem('sp_wishlist_owned_v1')");
  await ev(`(() => { const b = document.querySelector('.qw-wl-back'); if (b) b.click(); })()`);
  await sleep(400);
  await openList();
  await sleep(700);
  const empty = await dumpList();
  log('empty', { page: empty.page, empty: empty.empty, listCount: empty.listCount, bodyText: empty.bodyText });
  results.assert5 = {
    emptyShown: !!empty.empty && !!empty.empty.title,
    emptyHasHint: !!(empty.empty && empty.empty.hint && /♡/.test(empty.empty.hint)),
    emptyHasCta: !!(empty.empty && /→/.test(empty.empty.cta || '')),
    noBlankPage: (empty.bodyText || '').length > 0,
    noEmptyList: empty.listCount === 0,
  };
  log('assert-5-empty', results.assert5);
  await shot('list-empty.png');

  /* 满 50：造 50 条，进清单页看提示 */
  const full = await ev(`(() => {
    const items = [];
    for (let i = 0; i < 50; i++) items.push({ id: 'f' + i, savedAt: Date.now() - i * 1000, reason: '' });
    localStorage.setItem('sp_wishlist_v1', JSON.stringify(items));
    return items.length;
  })()`);
  await ev(`(() => { const b = document.querySelector('.qw-wl-back'); if (b) b.click(); })()`);
  await sleep(400);
  await openList();
  await sleep(900);
  const fullList = await dumpList();
  log('full', { count: fullList.rows.length, notes: fullList.notes, sub: fullList.sub });
  results.assert5.fullNotice = fullList.notes.some((n) => n.kind === 'full' && /清单满了/.test(n.text));
  results.assert5.fullCount = fullList.rows.length === 50;
  results.assert5.fullShows50 = fullList.notes.some((n) => /50/.test(n.text));
  await shot('list-full.png');
}

/* ============================================================
   ⑥ 存储不可用：降级提示沿用 L2 口径
   ============================================================ */
console.log('\n[5] 存储不可用（setItem 抛）→ 清单页显示降级提示，不报错页');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    try {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (String(k) === 'sp_wishlist_v1') {
          let blocked = false;
          try { blocked = this.getItem('__wish_block') === '1'; } catch (e) { blocked = true; }
          if (blocked) throw new DOMException('QuotaExceededError', 'QuotaExceededError');
        }
        return orig.call(this, k, v);
      };
    } catch (e) {}
  })();`,
});
{
  /* 先把清单存好（此时还没开拦截），再开拦截并刷新 —— 于是"存得进读得出，
     但页面会话一旦尝试写就会被判成 unavailable"。 */
  await ev("localStorage.setItem('__wish_block','0'); localStorage.setItem('sp_wishlist_v1', JSON.stringify([{id:'acqua-di-parma-fico-di-amalfi',savedAt:Date.now(),reason:'主体就是柑橘调'}]))");
  await ev("localStorage.setItem('__wish_block','1')");
  await send('Page.navigate', { url: BASE + '/index.html' });
  for (let i = 0; i < 90; i++) {
    if (await ev("!!document.querySelector('.masthead')")) break;
    await sleep(200);
  }
  await sleep(900);
  await runToResultInPlace();
  /* 在结果页点一次 ♡ → 触发一次写 → 判成 unavailable → 会话降级 */
  await ev(`(() => { const h = document.querySelector('.pick .qw-wish'); if (h) h.click(); })()`);
  await sleep(600);
  await openList();
  await sleep(700);
  const deg = await dumpList();
  log('degraded', { page: deg.page, notes: deg.notes, rows: deg.rows.length, bodyText: deg.bodyText });
  results.assert6 = {
    pageStillRenders: deg.page === true,
    noticeShown: deg.notes.some((n) => n.kind === 'unavailable'),
    noticeText: (deg.notes.find((n) => n.kind === 'unavailable') || {}).text,
    usesL2Wording: deg.notes.some((n) => /本机存储不可用，收藏仅本次有效/.test(n.text)),
    notErrorPage: !/加载失败/.test(deg.bodyText || ''),
  };
  log('assert-6', results.assert6);
  await shot('list-degraded.png');
}

/* ============================================================
   ⑦ 390 截图：≥2 行、一行已入手、一行带价格带
   ============================================================ */
console.log('\n[6] 390×844 DPR2 截图');
await ev("localStorage.setItem('__wish_block','0')");
await viewport(390, 844, 2, true);
{
  /* 用第 ①步那两条真数据重种一遍（有价格 + 没价格），并把首行标成已入手 */
  const pricedId = picked.priced;
  const unpricedId = picked.unpriced;
  await send('Page.navigate', { url: BASE + '/index.html' });
  for (let i = 0; i < 90; i++) {
    if (await ev("!!document.querySelector('.masthead')")) break;
    await sleep(200);
  }
  await sleep(900);
  await runToResultInPlace();
  await ev(`(() => {
    localStorage.setItem('sp_wishlist_v1', JSON.stringify([
      { id: ${JSON.stringify(pricedId)}, savedAt: Date.now() - 1000, reason: '主体就是柑橘调，底下垫着木质调' },
      { id: ${JSON.stringify(unpricedId)}, savedAt: Date.now() - 6000, reason: '像雨后的树皮，干净但不单薄' }
    ]));
    localStorage.setItem('sp_wishlist_owned_v1', JSON.stringify([${JSON.stringify(pricedId)}]));
  })()`);
  await openList();
  await sleep(1000);
  const mob = await dumpList();
  log('mobile', {
    rows: mob.rows.map((r) => ({ id: r.id, price: r.price, owned: r.owned, buy: r.buy && r.buy.text })),
    rowBox: mob.rows[0] && mob.rows[0].rowBox,
  });
  await ev('window.scrollTo(0,0)');
  await sleep(300);
  await shot('list-390.png');

  results.assert7 = {
    twoRows: mob.rows.length === 2,
    oneOwned: mob.rows.filter((r) => r.owned === 'true').length === 1,
    onePriced: mob.rows.filter((r) => /参考价/.test(r.price || '')).length === 1,
    noHorizontalScroll: await ev('document.documentElement.scrollWidth <= window.innerWidth + 2'),
  };
  log('assert-7', results.assert7);
}

/* 收尾：撤掉拦截，把清单恢复成一个可用的状态（不留给下一个跑的人一堆 f0..f49） */
await ev("localStorage.removeItem('__wish_block')");

fs.writeFileSync(path.join(OUT, 'verify-wishlist-l3.json'), JSON.stringify(results, null, 1));
console.log(`\n证据已写入 ${path.join(OUT, 'verify-wishlist-l3.json')}`);

ws.close();
proc.kill();
