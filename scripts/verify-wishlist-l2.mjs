/**
 * verify-wishlist-l2.mjs — 心仪清单 L2 的浏览器级证据（Edge CDP，无第三方依赖）
 *
 * 三件事，都要求**真在页面里点**，不接受单元测试代劳：
 *   ① 真实存入一次，转储 localStorage `sp_wishlist_v1` 的原文，
 *      并断言：只有 id/savedAt/reason 三键、reason 与页面上那句理由逐字一致；
 *   ② 存储不可用（setItem 抛）时，界面照常存/删/回显，提示里带「仅本次有效」；
 *   ③ 拍桌面 1440 与 390 两张结果页，含一瓶实心 ♡。
 *
 * 用法：
 *   node server.js 8137 &
 *   node scripts/verify-wishlist-l2.mjs --out=<dir> [--base=http://127.0.0.1:8137]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const arg = (k, d) => {
  const hit = process.argv.find((x) => x.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const OUT = path.resolve(arg('out', '.legs/wishlist-l2'));
const BASE = arg('base', 'http://127.0.0.1:8137');
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9600 + Math.floor(Math.random() * 60);
const proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(OUT, `.edge-${Date.now()}`)}`, '--no-first-run',
  '--disable-gpu', '--hide-scrollbars', '--disable-extensions',
  '--disable-component-extensions-with-background-pages',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 120; i++) {
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
/* 证据截图统一走浅色（与产品默认主题一致）。headless Edge 的默认
   prefers-color-scheme 是 dark —— 不显式钉住的话，截出来的是深色版，
   而深色下 --ink 是 #F5F1E8，实心 ♡ 在白纸语境里读不出"实心"。 */
const setScheme = (v) => send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-color-scheme', value: v }],
});
await setScheme('light');

const results = { ranAt: new Date().toISOString(), base: BASE, out: OUT, stages: [] };
const log = (k, v) => { results.stages.push({ k, v }); console.log(`  ${k}: ${JSON.stringify(v).slice(0, 260)}`); };

/** 走完问卷到结果页（每屏点第一项，末屏点「看推荐」）。 */
async function runToResult(page) {
  await send('Page.navigate', { url: BASE + '/index.html' });
  for (let i = 0; i < 80; i++) {
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
    await sleep(done === 'finish' ? 1200 : 380);
    if (done === 'finish') break;
    if (done === 'stuck') break;
  }
  await sleep(600);
}

const dump = () => ev(`(() => {
  const bar = document.querySelector('.qw-wish-bar');
  return {
    wishKey: localStorage.getItem('sp_wishlist_v1'),
    otherKeys: Object.keys(localStorage).filter((k) => /wishlist/i.test(k)),
    barText: bar ? bar.textContent : null,
    barHidden: bar ? bar.hasAttribute('hidden') : null,
    barPointerEvents: bar ? getComputedStyle(bar).pointerEvents : null,
    hearts: [...document.querySelectorAll('.qw-wish')].map((h) => ({
      id: h.dataset.wish,
      pressed: h.getAttribute('aria-pressed'),
      on: h.classList.contains('is-on'),
      fill: getComputedStyle(h.querySelector('path')).fill,
      box: (() => { const r = h.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: +r.x.toFixed(1), bottom: +r.bottom.toFixed(1) }; })(),
    })),
    buys: [...document.querySelectorAll('.pick .buy-link')].map((b) => {
      const r = b.getBoundingClientRect(); return { t: b.textContent.trim().slice(0, 12), y: +r.top.toFixed(1) };
    }),
  };
})()`);

async function viewport(w, h, dpr, mobile) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: dpr, mobile: !!mobile,
  });
}

async function shot(file) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(data, 'base64'));
}

/* ============ ① 真实存入 + 转储 ============ */
console.log('\n[1] 1440×900 真实存入一次，转储 sp_wishlist_v1');
await viewport(1440, 900, 1, false);
await runToResult();
await ev('window.scrollTo(0,0)');
await sleep(300);

const before = await dump();
log('before-hearts', before.hearts.map((h) => ({ id: h.id, pressed: h.pressed, fill: h.fill })));
log('before-storage', before.wishKey);

/* 卡片上显示的那句理由（第一条 .reasons li），与存进去的必须逐字一致 */
const cardText = await ev(`(() => {
  const c = document.querySelector('.pick');
  const h3 = c.querySelector('h3');
  const li = c.querySelector('.reasons li');
  return { name: h3.textContent, reason: li.textContent.trim() };
})()`);
log('card-first', cardText);

await ev("document.querySelector('.pick .qw-wish').click()");
await sleep(400);
const afterSave = await dump();
log('after-save-storage', afterSave.wishKey);
log('after-save-hearts', afterSave.hearts.map((h) => ({ id: h.id, pressed: h.pressed, on: h.on, fill: h.fill })));
log('after-save-bar', { text: afterSave.barText, hidden: afterSave.barHidden, pe: afterSave.barPointerEvents });

/* 硬断言：形状与内容 */
{
  const parsed = JSON.parse(afterSave.wishKey || '[]');
  const keysOk = parsed.length === 1 && Object.keys(parsed[0]).join(',') === 'id,savedAt,reason';
  const reasonOk = parsed.length === 1 && parsed[0].reason === cardText.reason;
  const savedOk = afterSave.hearts.filter((h) => h.on).length === 1
    && afterSave.hearts.find((h) => h.on).id === parsed[0].id;
  log('assert-keys', { ok: keysOk, keys: parsed[0] ? Object.keys(parsed[0]) : null });
  log('assert-reason-verbatim', { ok: reasonOk, stored: parsed[0] && parsed[0].reason, shown: cardText.reason });
  log('assert-heart-solid', { ok: savedOk, on: afterSave.hearts.filter((h) => h.on).map((h) => h.id) });
  results.assert1 = { keysOk, reasonOk, savedOk };
}

/* 实心 ♡ 状态的截图（含提示条） */
await shot('result-desktop-saved.png');
const cardOnly = await ev(`(() => {
  const c = document.querySelector('.pick');
  const r = c.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
})()`);
{
  const { data } = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: cardOnly.x, y: cardOnly.y, width: cardOnly.w, height: cardOnly.h, scale: 2 },
  });
  fs.writeFileSync(path.join(OUT, 'card-desktop-saved.png'), Buffer.from(data, 'base64'));
}

/* 再点一次 → 删存提示 */
await ev("document.querySelector('.pick .qw-wish').click()");
await sleep(350);
const afterRemove = await dump();
log('after-remove-storage', afterRemove.wishKey);
log('after-remove-bar', { text: afterRemove.barText, hidden: afterRemove.barHidden });
results.assert1.removeMsg = afterRemove.barText === '已移出心仪清单';
results.assert1.removeCleared = JSON.parse(afterRemove.wishKey || '[]').length === 0;

/* ============ ② 存储不可用：内存兜底 ============ */
console.log('\n[2] 让 sp_wishlist_v1 的 setItem 抛错（模拟隐私模式/配额满），验内存兜底');
/* 为什么用 addScriptToEvaluateOnNewDocument 而不是当场 patch：
  ② 的验法是「重新走一遍问卷到结果页」，那是一次整页导航 ——
  当场写在 window 上的 patch 会随文档一起销毁（第一版就踩了这个：
  补丁没了，于是写入正常成功，assert 报 storageStillEmpty:false）。
  改成注入到每个新文档，开关读 localStorage 里的 __wish_block
  （换一个键当开关，才不会被自己拦掉）。 */
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    try {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        /* 只拦清单键；开关自己读写的是另一个键，不会递归。 */
        if (String(k) === 'sp_wishlist_v1') {
          let blocked = false;
          try { blocked = this.getItem('__wish_block') === '1'; } catch (e) { blocked = true; }
          if (blocked) throw new DOMException('QuotaExceededError', 'QuotaExceededError');
        }
        return orig.call(this, k, v);
      };
    } catch (e) { /* 已经 patch 过 */ }
  })();`,
});
await ev("localStorage.setItem('__wish_block','1'); localStorage.removeItem('sp_wishlist_v1'); 'ok'");

await runToResult();
await ev('window.scrollTo(0,0)');
await sleep(300);
const preFallback = await dump();
log('fallback-prestate', { storage: preFallback.wishKey, hearts: preFallback.hearts.map((h) => h.pressed) });

await ev("document.querySelector('.pick .qw-wish').click()");
await sleep(400);
const fb = await dump();
log('fallback-after-save', { storage: fb.wishKey, bar: fb.barText, hearts: fb.hearts.map((h) => ({ p: h.pressed, on: h.on })) });
{
  const savedOn = fb.hearts.filter((h) => h.on).length;
  results.assert2 = {
    storageStillEmpty: fb.wishKey == null || JSON.parse(fb.wishKey).length === 0,
    uiSaved: savedOn === 1,
    barMentionsSessionOnly: /仅本次有效/.test(fb.barText || ''),
    barText: fb.barText,
  };
  log('assert-fallback', results.assert2);
}
/* 兜底里再点一次 → 移出照常 */
await ev("document.querySelector('.pick .qw-wish').click()");
await sleep(350);
const fb2 = await dump();
log('fallback-after-remove', { bar: fb2.barText, on: fb2.hearts.filter((h) => h.on).length });
results.assert2.removeWorks = fb2.hearts.filter((h) => h.on).length === 0;
results.assert2.removeBarMentionsSession = /仅本次有效/.test(fb2.barText || '');

/* ============ ③ 桌面 + 390 截图（含实心 ♡） ============ */
console.log('\n[3] 截图：桌面 1440 + 390（各含一瓶实心 ♡）');
/* 撤掉拦截，回到正常存储 */
await ev("localStorage.setItem('__wish_block','0'); try { localStorage.removeItem('sp_wishlist_v1'); } catch (e) {}");

/* 桌面 */
await viewport(1440, 900, 1, false);
await runToResult();
await ev('window.scrollTo(0,0)');
await sleep(400);
await ev("document.querySelector('.pick .qw-wish').click()");
await sleep(450);
const desk = await dump();
await shot('result-desktop.png');
{
  const c = await ev(`(() => { const r = document.querySelector('.pick').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const { data } = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: Math.max(0, c.x - 12), y: c.y, width: c.w + 24, height: c.h, scale: 2 },
  });
  fs.writeFileSync(path.join(OUT, 'card-desktop.png'), Buffer.from(data, 'base64'));
}
log('desktop-final', {
  storage: desk.wishKey,
  on: desk.hearts.filter((h) => h.on).map((h) => h.id),
  heartBox: desk.hearts[0].box,
  gapToBuy: +(Math.min(...desk.buys.map((b) => b.y)) - desk.hearts[0].box.bottom).toFixed(1),
});

/* 390：清库重走一遍，只点亮第 1 瓶 */
await ev('localStorage.removeItem("sp_wishlist_v1")');
await viewport(390, 844, 2, true);
await runToResult();
await ev('window.scrollTo(0,0)');
await sleep(500);
await ev("document.querySelector('.pick .qw-wish').click()");
await sleep(450);
const mob = await dump();
await shot('result-390.png');
{
  /* 移动端这条裁切不能沿用桌面的做法（实测踩到）：
     在 setDeviceMetricsOverride(mobile:true) 下，Page.captureScreenshot 的
     clip 用的不是 getBoundingClientRect + scrollY 那套坐标系，裁出来会
     从卡片左侧 10px 处开始，把「候选 01」切掉半个字。
     改成「把卡片滚到视口顶、直接拍视口」—— 不做坐标换算，就不存在换错的机会。
     留出的上边距 8px 是为了不把卡片顶线贴死在截图边上。 */
  await ev(`(() => {
    const c = document.querySelector('.pick');
    const y = c.getBoundingClientRect().top + window.scrollY - 8;
    window.scrollTo(0, y);
  })()`);
  await sleep(350);
  await shot('card-390.png');
  await ev('window.scrollTo(0,0)');
  await sleep(200);
}
log('mobile-final', {
  storage: mob.wishKey,
  on: mob.hearts.filter((h) => h.on).map((h) => h.id),
  heartBox: mob.hearts[0].box,
  gapToBuy: +(Math.min(...mob.buys.map((b) => b.y)) - mob.hearts[0].box.bottom).toFixed(1),
});
{
  const hb = mob.hearts[0].box;
  const gap = Math.min(...mob.buys.map((b) => b.y)) - hb.bottom;
  results.assert3 = {
    heart44: hb.w >= 44 && hb.h >= 44,
    gapPx: +gap.toFixed(1),
    gapPositive: gap > 100,
    solidCount: mob.hearts.filter((h) => h.on).length,
  };
  log('assert-390', results.assert3);
}

fs.writeFileSync(path.join(OUT, 'verify-wishlist-l2.json'), JSON.stringify(results, null, 1));
console.log(`\n证据已写入 ${path.join(OUT, 'verify-wishlist-l2.json')}`);

ws.close();
proc.kill();
