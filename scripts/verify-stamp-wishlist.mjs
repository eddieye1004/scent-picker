/**
 * verify-stamp-wishlist.mjs — 心仪清单行盖章入口的浏览器级证据（Edge CDP，无第三方依赖）
 *
 * 与 verify-stamp.mjs / verify-wishlist-l3.mjs 同一套手法（真浏览器 + 真点击 +
 * 转储 + 截图），这一份要证明的是**清单行那个入口真的长出来了、并且与档案侧
 * 读写同一条记录**：
 *
 *   ① 390 清单页：能查到的那两行各有一个盖章位（未盖章只留入口、无 chip），
 *      查不到的那一行**没有**入口；
 *   ② 点入口就地打开本体那五档（一行五个、颗颗 ≥44px），点开不落记录；
 *   ③ 选一档保存 → 行内出现 chip（日期 · 档位 · 共 N 次），落盘的键是
 *      「归一化 name|brand」而不是香水 id；
 *   ④ 回到档案面板：**同一瓶**读到同一条记录，两处 chip 文案逐字相同；
 *   ⑤ 回清单页撤销 → 两处同步消失，存储里那条记录整条移除；
 *   ⑥ 几何：无横向滚动、盖章位与五颗章 ≥44px、chip 不出容器；
 *   ⑦ 截图两张（390，DPR2）：一行已盖带 chip / 面板展开。每张回读 PNG 的
 *      IHDR 宽高并与 视口 × DPR 比对（真实尺寸自查）。
 *
 * 用法：
 *   node server.js 8141 &
 *   node scripts/verify-stamp-wishlist.mjs --out=<dir> [--base=http://127.0.0.1:8141]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const arg = (k, d) => {
  const hit = process.argv.find((x) => x.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const OUT = path.resolve(arg('out', '.legs/stamp-wishlist'));
const BASE = arg('base', 'http://127.0.0.1:8141');
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9900 + Math.floor(Math.random() * 60);
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
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r && r.exceptionDetails) {
    /* 页面里抛了不该静默变成 undefined —— 那样后面的断言会报成一堆假失败，
       真正的原因（选择器写错、eval 里语法错）反而看不见。 */
    throw new Error(`页面内求值抛错：${(r.exceptionDetails.exception || {}).description
      || r.exceptionDetails.text}`);
  }
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-color-scheme', value: 'light' }],
});

const results = { ranAt: new Date().toISOString(), base: BASE, stages: [] };
const log = (k, v) => {
  results.stages.push({ k, v });
  /* JSON.stringify(undefined) 返回 undefined（不是字符串）—— log('step', undefined)
     曾在第一次实跑时把整份脚本带崩，所以这里统一走 String() 兜一层。 */
  const text = typeof v === 'undefined' ? 'undefined' : JSON.stringify(v);
  console.log(`  ${k}: ${String(text).slice(0, 360)}`);
};

async function viewport(w, h, dpr, mobile) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: dpr, mobile: !!mobile,
  });
}

/** 截图 + **真实尺寸自查**：回读 PNG 的 IHDR 宽高，与 视口 × DPR 比对。 */
async function shot(file) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const buf = Buffer.from(data, 'base64');
  fs.writeFileSync(path.join(OUT, file), buf);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return { file, w, h, bytes: buf.length };
}

/** 走完问卷到结果页（每屏点第一项，末屏点「看推荐」）。 */
async function runToResult() {
  await send('Page.navigate', { url: BASE + '/index.html' });
  for (let i = 0; i < 90; i++) {
    if (await ev("!!document.querySelector('.q-title, .disc-sector')")) break;
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
    await sleep(done === 'finish' ? 1400 : 380);
    if (done === 'finish' || done === 'stuck') break;
  }
  await sleep(800);
}

/** 造夹具：清单三行（两瓶能查到、一瓶查不到）+ 档案里同一瓶 Aventus。 */
const seed = () => ev(`(() => {
  const wish = [
    { id: 'creed-aventus', savedAt: Date.now() - 60000, reason: '冬天穿得住' },
    { id: 'diptyque-philosykos-parfum', savedAt: Date.now() - 120000, reason: '' },
    { id: 'ghost-bottle-xyz', savedAt: Date.now() - 180000, reason: '这家下架了' },
  ];
  localStorage.setItem('sp_wishlist_v1', JSON.stringify(wish));
  localStorage.removeItem('sp_wishlist_owned_v1');
  localStorage.setItem('scent-picker.history.v1', JSON.stringify([
    { t: Date.now() - 600000, entry: 'family',
      results: [{ name: 'Aventus', brand: 'Creed' }, { name: 'Philosykos', brand: 'Diptyque' }] },
  ]));
  localStorage.removeItem('scent-picker.tasting.v1');
  return { wish: localStorage.getItem('sp_wishlist_v1'),
    history: localStorage.getItem('scent-picker.history.v1') };
})()`);

const openWishPage = () => ev(`(() => {
  const b = document.querySelector('.qw-wl-entry');
  if (!b) return 'no-entry';
  b.click();
  return 'clicked';
})()`);
const openArchive = () => ev(`(() => {
  const t = document.querySelector('.qw-history-toggle');
  if (!t) return 'no-toggle';
  if (t.getAttribute('aria-expanded') !== 'true') t.click();
  return t.getAttribute('aria-expanded');
})()`);

const dump = () => ev(`(() => {
  const box = (n) => { if (!n) return null; const b = n.getBoundingClientRect();
    return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const rows = [...document.querySelectorAll('.qw-wl-row')].map((r) => {
    const slot = r.querySelector('.qw-stamp-slot');
    const chip = r.querySelector('.qw-stamp-chip');
    return {
      id: r.getAttribute('data-wish-id'),
      name: (r.querySelector('.qw-wl-name') || {}).textContent || null,
      hasSlot: !!slot,
      key: slot ? slot.getAttribute('data-stamp-key') : null,
      surface: slot ? slot.getAttribute('data-stamp-surface') : null,
      openText: (r.querySelector('.qw-stamp-open') || {}).textContent || null,
      openBox: box(r.querySelector('.qw-stamp-open')),
      chipText: chip ? chip.textContent : null,
      chipCount: chip ? chip.getAttribute('data-stamp-count') : null,
      chipBox: box(chip),
      undoInline: !!r.querySelector('.qw-stamp-undo-inline'),
    };
  });
  const tiers = [...document.querySelectorAll('.qw-stamp-tier')].map((b) => ({
    zh: b.textContent, checked: b.getAttribute('aria-checked'), box: box(b),
  }));
  const panel = document.querySelector('.qw-stamp-panel');
  return {
    step: (document.getElementById('app') || {}).dataset ? document.getElementById('app').dataset.step : null,
    rows,
    panelOpen: !!panel,
    panelBox: box(panel),
    panelInWishRow: panel ? (() => {
      let n = panel.parentNode;
      while (n) { if (n.classList && n.classList.contains('qw-wl-stamp-row')) return true; n = n.parentNode; }
      return false;
    })() : false,
    tierCount: tiers.length,
    tiers,
    tierRowTop: tiers.length ? Math.min(...tiers.map((t) => t.box.y)) : null,
    savedDisabled: (() => {
      const s = document.querySelector('.qw-stamp-save');
      return s ? s.getAttribute('disabled') !== null : null;
    })(),
    store: localStorage.getItem('scent-picker.tasting.v1'),
    wishStore: localStorage.getItem('sp_wishlist_v1'),
    barText: (document.querySelector('.qw-wish-bar') || {}).textContent || null,
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  };
})()`);

/** 档案面板侧：某一瓶的 chip 文案（找不到就是 null）。 */
const archiveChipOf = (name) => ev(`(() => {
  const row = [...document.querySelectorAll('.qw-history-name-row')].find((r) => {
    const n = r.querySelector('.qw-history-name');
    return n && n.textContent === ${JSON.stringify(name)};
  });
  if (!row) return { found: false };
  const chip = row.querySelector('.qw-stamp-chip');
  return { found: true, chipText: chip ? chip.textContent : null,
    count: chip ? chip.getAttribute('data-stamp-count') : null };
})()`);

/* ============================================================
   ① 390×844 DPR2：清单页三行，能查到的两行有盖子，查不到的那行没有
   ============================================================ */
console.log('\n[1] 390 清单页：每行一个盖章位（未盖章只留入口）');
await viewport(390, 844, 2, true);
await runToResult();
log('seeded', await seed());
await ev("(() => { const b = document.querySelector('.qw-wl-entry'); if (b) b.click(); })()");
await sleep(1400);
const s1 = await dump();
log('rows', s1.rows.map((r) => ({
  id: r.id, name: r.name, hasSlot: r.hasSlot, key: r.key, surface: r.surface,
  openText: r.openText, chipText: r.chipText, openH: r.openBox && r.openBox.h,
})));
log('step', s1.step);

results.assert1 = {
  onWishPage: s1.step === 'wishlist',
  threeRows: s1.rows.length === 3,
  twoSlots: s1.rows.filter((r) => r.hasSlot).length === 2,
  keysAreNameBrand: s1.rows.filter((r) => r.hasSlot).map((r) => r.key).sort().join(',')
    === 'aventus|creed,philosykos|diptyque',
  surfaceWish: s1.rows.filter((r) => r.hasSlot).every((r) => r.surface === 'wish'),
  noChipYet: s1.rows.every((r) => r.chipText === null),
  entryText: s1.rows.filter((r) => r.hasSlot).every((r) => r.openText === '试过？盖章'),
  entry44: s1.rows.filter((r) => r.hasSlot).every((r) => r.openBox && r.openBox.h >= 44),
  missingBottleNoSlot: (() => {
    const ghost = s1.rows.find((r) => r.id === 'ghost-bottle-xyz');
    return !!ghost && ghost.hasSlot === false;
  })(),
  noHorizontalScroll: s1.scrollW <= s1.innerW + 2,
  noStoreYet: s1.store == null,
};

/* ============================================================
   ② 点入口 → 本体那五档（一行五个、颗颗 44px）；点开不落记录
   ============================================================ */
console.log('\n[2] 点行内入口 → 五档面板');
await ev(`(() => {
  const row = [...document.querySelectorAll('.qw-wl-row')]
    .find((r) => r.getAttribute('data-wish-id') === 'creed-aventus');
  const b = row && row.querySelector('.qw-stamp-open');
  if (b) b.click();
})()`);
await sleep(500);
const s2 = await dump();
log('panel', {
  open: s2.panelOpen, inWishRow: s2.panelInWishRow, tiers: s2.tiers.length,
  tops: [...new Set(s2.tiers.map((t) => t.box.y))],
  boxes: s2.tiers.map((t) => ({ zh: t.zh, x: t.box.x, w: t.box.w, h: t.box.h })),
  savedDisabled: s2.savedDisabled, scrollW: s2.scrollW, innerW: s2.innerW,
});

results.assert2 = {
  panelOpened: s2.panelOpen === true,
  panelInsideWishRow: s2.panelInWishRow === true,
  stillOnWishPage: s2.step === 'wishlist',
  noStoreAfterOpen: s2.store == null,
  fiveTiers: s2.tierCount === 5,
  tiersZhExact: s2.tiers.map((t) => t.zh).join('/') === '一闻钟情/喜欢/还行/无感/劝退',
  noneChecked: s2.tiers.every((t) => t.checked === 'false'),
  tiersOneRow: new Set(s2.tiers.map((t) => t.box.y)).size === 1,
  tiers44: s2.tiers.every((t) => t.box && t.box.h >= 44),
  tiersInsideViewport: s2.tiers.every((t) => t.box.x >= 0 && t.box.x + t.box.w <= s2.innerW + 1),
  saveDisabledBeforePick: s2.savedDisabled === true,
  noHorizontalScroll: s2.scrollW <= s2.innerW + 2,
};

/* 面板展开那张截图（任务书要的第二张）：让面板居中进视口 */
await ev(`(() => { const p = document.querySelector('.qw-stamp-panel'); if (p) p.scrollIntoView({ block: 'center' }); })()`);
await sleep(400);
const shotPanel = await shot('wish-stamp-2-panel-390.png');
log('shot-panel', shotPanel);

/* ============================================================
   ③ 选「喜欢」→ 保存 → 行内 chip；落盘键是 name|brand
   ============================================================ */
console.log('\n[3] 选「喜欢」→ 保存');
await ev(`(() => {
  const t = [...document.querySelectorAll('.qw-stamp-tier')].find((b) => b.textContent === '喜欢');
  if (t) t.click();
})()`);
await sleep(250);
await ev(`(() => { const s = document.querySelector('.qw-stamp-save'); if (s) s.click(); })()`);
await sleep(700);
const s3 = await dump();
log('after-save', {
  chips: s3.rows.map((r) => ({ name: r.name, chipText: r.chipText, count: r.chipCount })),
  store: s3.store, barText: s3.barText, scrollW: s3.scrollW, innerW: s3.innerW,
});
const parsed = (() => { try { return JSON.parse(s3.store || 'null'); } catch { return null; } })();
results.assert3 = {
  chipAppeared: s3.rows.filter((r) => r.chipText).length === 1,
  chipShowsTier: /喜欢/.test((s3.rows.find((r) => r.chipText) || {}).chipText || ''),
  chipShowsCount: /共 1 次/.test((s3.rows.find((r) => r.chipText) || {}).chipText || ''),
  chipCountAttr: (s3.rows.find((r) => r.chipText) || {}).chipCount === '1',
  chipHasDate: /\d\d-\d\d/.test((s3.rows.find((r) => r.chipText) || {}).chipText || ''),
  chipInsideRow: (() => {
    const r = s3.rows.find((x) => x.chipText);
    return !!r && !!r.chipBox && r.chipBox.x >= 0 && r.chipBox.x + r.chipBox.w <= s3.innerW + 1;
  })(),
  otherBottleUntouched: (s3.rows.find((r) => r.id === 'diptyque-philosykos-parfum') || {}).chipText === null,
  storedKeyIsNameBrand: Array.isArray(parsed) && parsed.length === 1 && parsed[0].key === 'aventus|creed',
  storedNotPerfumeId: Array.isArray(parsed) && !/creed-aventus/.test(JSON.stringify(parsed)),
  storedShape: Array.isArray(parsed) && Object.keys(parsed[0]).join(',') === 'key,name,brand,log',
  storedLogShape: Array.isArray(parsed) && Object.keys(parsed[0].log[0]).join(',') === 'tier,t',
  storedTier: Array.isArray(parsed) && parsed[0].log[0].tier === 'like',
  wishKeyUnchanged: s3.wishStore === s1.wishStore,
  toastSaysSaved: /已盖章/.test(s3.barText || ''),
  noHorizontalScroll: s3.scrollW <= s3.innerW + 2,
};

/* 已盖 chip 那张截图（任务书要的第一张）：滚到那一行，chip 与瓶名同行可见 */
await ev(`(() => {
  const row = [...document.querySelectorAll('.qw-wl-row')]
    .find((r) => r.getAttribute('data-wish-id') === 'creed-aventus');
  if (row) row.scrollIntoView({ block: 'center' });
})()`);
await sleep(400);
const shotChip = await shot('wish-stamp-1-chip-390.png');
const chipRow = s3.rows.find((r) => r.chipText);
log('shot-chip', shotChip);
log('chip-row', chipRow);

/* ============================================================
   ④ 回档案面板：同一瓶读到同一条记录，两处 chip 逐字相同
   ============================================================ */
console.log('\n[4] 档案侧读同一条记录');
await ev(`(() => {
  const row = [...document.querySelectorAll('.qw-wl-row')]
    .find((r) => r.getAttribute('data-wish-id') === 'creed-aventus');
  const undo = row && row.querySelector('.qw-stamp-undo-inline');
  if (undo) undo.click();          // 只为把面板收起，下面还会再盖一次
})()`);
await sleep(500);
/* 重新盖一次（撤销后记录已空），再去档案侧比对 */
await ev(`(() => {
  const row = [...document.querySelectorAll('.qw-wl-row')]
    .find((r) => r.getAttribute('data-wish-id') === 'creed-aventus');
  const open = row && row.querySelector('.qw-stamp-open');
  if (open) open.click();
})()`);
await sleep(400);
await ev(`(() => {
  const t = [...document.querySelectorAll('.qw-stamp-tier')].find((b) => b.textContent === '喜欢');
  if (t) t.click();
})()`);
await sleep(200);
await ev(`(() => { const s = document.querySelector('.qw-stamp-save'); if (s) s.click(); })()`);
await sleep(700);
const wishChipText = ((await dump()).rows.find((r) => r.chipText) || {}).chipText || null;

await ev(`(() => { const b = document.querySelector('.qw-wl-back'); if (b) b.click(); })()`);
await sleep(500);
await openArchive();
await sleep(700);
const arch = await archiveChipOf('Aventus');
log('archive', arch);
log('wish-chip', wishChipText);

results.assert4 = {
  archiveHasChip: arch.found === true && !!arch.chipText,
  sameText: !!wishChipText && arch.chipText === wishChipText,
  sameCount: arch.count === '1',
  wishChipText,
  archiveChipText: arch.chipText,
};

/* ============================================================
   ⑤ 回清单页撤销 → 两处同步消失
   ============================================================ */
console.log('\n[5] 清单侧撤销 → 两处同步消失');
await ev(`(() => { const b = document.querySelector('.qw-wl-entry'); if (b) b.click(); })()`);
await sleep(900);
await ev(`(() => {
  const row = [...document.querySelectorAll('.qw-wl-row')]
    .find((r) => r.getAttribute('data-wish-id') === 'creed-aventus');
  const undo = row && row.querySelector('.qw-stamp-undo-inline');
  if (undo) undo.click();
})()`);
await sleep(700);
const s5 = await dump();
log('after-undo', {
  chips: s5.rows.filter((r) => r.chipText).length,
  opens: s5.rows.filter((r) => r.openText).length,
  store: s5.store, barText: s5.barText,
});
const afterUndoStore = (() => {
  try { const a = JSON.parse(s5.store || 'null'); return Array.isArray(a) ? a.length : -1; } catch { return -1; }
})();

await ev(`(() => { const b = document.querySelector('.qw-wl-back'); if (b) b.click(); })()`);
await sleep(500);
await openArchive();
await sleep(700);
const archAfter = await archiveChipOf('Aventus');
log('archive-after-undo', archAfter);

results.assert5 = {
  wishChipsGone: s5.rows.every((r) => r.chipText === null),
  wishEntriesBack: s5.rows.filter((r) => r.openText === '试过？盖章').length === 2,
  storeEmptied: afterUndoStore === 0 || afterUndoStore === -1,
  archiveChipGone: archAfter.found === true && archAfter.chipText === null,
  undoToast: /已撤销这瓶的盖章/.test(s5.barText || ''),
};

/* ============================================================
   ⑥ 截图真实尺寸自查（390×844 @ DPR2 = 780×1688）
   ============================================================ */
results.assert6 = {
  panelShotIs780x1688: shotPanel.w === 780 && shotPanel.h === 1688,
  chipShotIs780x1688: shotChip.w === 780 && shotChip.h === 1688,
  panelShotBytes: shotPanel.bytes,
  chipShotBytes: shotChip.bytes,
};

/* ============================================================
   汇总
   ============================================================ */
const flat = Object.entries(results).filter(([k]) => k.startsWith('assert'));
let bad = 0;
for (const [k, v] of flat) {
  const fails = Object.entries(v).filter(([kk, vv]) => vv === false || vv == null
    || (typeof vv === 'string' && vv === ''));
  if (fails.length) bad += fails.length;
  console.log(`\n${fails.length ? '✗' : '✓'} ${k}  ${fails.length ? fails.map(([kk]) => kk).join(', ') : 'all pass'}`);
}

fs.writeFileSync(path.join(OUT, 'verify-stamp-wishlist.json'), JSON.stringify({ results, bad }, null, 1));
console.log(`\n证据已写入 ${path.join(OUT, 'verify-stamp-wishlist.json')}`);
console.log('截图：wish-stamp-1-chip-390.png / wish-stamp-2-panel-390.png');
try { ws.close(); } catch { /* 关不掉就算了 */ }
proc.kill();
if (bad) process.exitCode = 1;
