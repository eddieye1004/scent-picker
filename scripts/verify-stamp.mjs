/**
 * verify-stamp.mjs — 试香盖章的浏览器级证据（Edge CDP，无第三方依赖）
 *
 * 与 L2/L3 那两份同一套手法（真浏览器 + 真点击 + 转储 + 截图），
 * 这一份要证明的是**盖章这一屏真的长出来了、并且真的落盘**：
 *
 *   ① 档案面板展开后每一瓶右端都有盖章位（未盖章态「试过？盖章」）；
 *   ② 点开是五档面板（不是旧提案的三档），五颗章都在，未选档时保存不可点；
 *   ③ 选一档 → 保存 → 落盘 + chip 显示「最近一次 + 共 N 次」；
 *   ④ 再盖一次 → 计数 2、最近一次跟着换；撤销 → 计数回落；
 *   ⑤ 盖「一闻钟情」后心仪清单键一个字节都没变（无一键联动）；
 *   ⑥ 几何：盖章位与五颗章 ≥44px、390 下五颗章一行放得下、无横向滚动；
 *   ⑦ 截图三张：档案详情盖章入口（未盖）/ 五档展开 / 盖后状态（含共 N 次）。
 *      每张都回读真实像素尺寸并与视口 × DPR 比对（真实尺寸自查）。
 *
 * 用法：
 *   node server.js 8139 &
 *   node scripts/verify-stamp.mjs --out=<dir> [--base=http://127.0.0.1:8139]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const arg = (k, d) => {
  const hit = process.argv.find((x) => x.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const OUT = path.resolve(arg('out', '.legs/stamp'));
const BASE = arg('base', 'http://127.0.0.1:8139');
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9800 + Math.floor(Math.random() * 80);
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
const log = (k, v) => {
  results.stages.push({ k, v });
  console.log(`  ${k}: ${JSON.stringify(v).slice(0, 320)}`);
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
  /* PNG: 8 字节签名 + 4 长度 + 'IHDR' + 宽(4) + 高(4)，大端。 */
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

/** 展开档案面板（点那枚「查看」）。 */
const openArchive = () => ev(`(() => {
  const t = document.querySelector('.qw-history-toggle');
  if (!t) return 'no-toggle';
  if (t.getAttribute('aria-expanded') !== 'true') t.click();
  return t.getAttribute('aria-expanded');
})()`);

const dumpStamp = () => ev(`(() => {
  const box = (n) => { if (!n) return null; const b = n.getBoundingClientRect();
    return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const rows = [...document.querySelectorAll('.qw-history-name-row')].map((r) => ({
    name: (r.querySelector('.qw-history-name') || {}).textContent || null,
    key: (r.querySelector('.qw-stamp-slot') || {}).getAttribute
      ? r.querySelector('.qw-stamp-slot').getAttribute('data-stamp-key') : null,
    openText: (r.querySelector('.qw-stamp-open') || {}).textContent || null,
    openBox: box(r.querySelector('.qw-stamp-open')),
    chipText: (r.querySelector('.qw-stamp-chip') || {}).textContent || null,
    chipCount: (r.querySelector('.qw-stamp-chip') || {}).getAttribute
      ? r.querySelector('.qw-stamp-chip').getAttribute('data-stamp-count') : null,
    chipBox: box(r.querySelector('.qw-stamp-chip')),
    undoInline: !!r.querySelector('.qw-stamp-undo-inline'),
  }));
  const panel = document.querySelector('.qw-stamp-panel');
  const tiers = [...document.querySelectorAll('.qw-stamp-tier')].map((b) => ({
    zh: b.textContent, checked: b.getAttribute('aria-checked'), box: box(b),
  }));
  return {
    rows,
    /* panelOpen 是「五档面板开没开」（点入口之后才有）；
       档案面板本身的开合另给一个字段，别把两者混成一个布尔 ——
       第一版就是混着比，报出一条假的 archiveOpen 失败。 */
    archiveOpen: (() => {
      const p = document.querySelector('.qw-history-panel');
      return !!p && !p.hasAttribute('hidden');
    })(),
    panelOpen: !!panel,
    panelBox: box(panel),
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

/* ============================================================
   ① 桌面 1440：档案面板里的盖章入口（未盖章态）+ 截图
   ============================================================ */
console.log('\n[1] 桌面 1440：档案面板里每一瓶的盖章入口（未盖章）');
await viewport(1440, 900, 1, false);
await runToResult();
/* 造一份确定的档案（不依赖推荐结果随机性）：两瓶，其中一瓶是确定存在的真 id 不必要 ——
   档案里的瓶子只有 name/brand，直接写进去最稳。 */
const seeded = await ev(`(() => {
  const rec = {
    history: JSON.stringify([
      { t: ${Date.now()} - 600000, entry: 'family', results: [{ name: 'Santal 33', brand: 'Le Labo' }, { name: 'Aventus', brand: 'Creed' }] },
    ]),
  };
  localStorage.setItem('scent-picker.history.v1', rec.history);
  localStorage.removeItem('scent-picker.tasting.v1');
  return rec.history;
})()`);
log('seeded-history', seeded);
/* 重画一次让档案面板读到新数据 */
await ev(`(() => { const b = [...document.querySelectorAll('.qw-wl-back')][0]; if (b) b.click(); })()`);
await sleep(300);
const opened = await openArchive();
await sleep(600);
const s1 = await dumpStamp();
log('archive-step', { opened, panelOpen: s1.panelOpen });
log('rows', s1.rows.map((r) => ({ name: r.name, key: r.key, openText: r.openText, openBox: r.openBox })));

/* 滚到档案区，让入口在视口内（截图要能看见它，不是要它跑到屏幕外） */
await ev(`(() => { const h = document.querySelector('.qw-history'); if (h) h.scrollIntoView({ block: 'start' }); })()`);
await sleep(400);
const shot1 = await shot('stamp-1-entry-1440.png');
log('shot-1', shot1);

results.assert1 = {
  archiveOpen: s1.archiveOpen === true,
  everyBottleHasSlot: s1.rows.length === 2 && s1.rows.every((r) => !!r.key),
  twoEntries: s1.rows.every((r) => r.openText === '试过？盖章'),
  entry44: s1.rows.every((r) => r.openBox && r.openBox.h >= 44),
  noChipYet: s1.rows.every((r) => r.chipText === null),
  noStoreYet: s1.store == null,
  shotIs1440x900: shot1.w === 1440 && shot1.h === 900,
};

/* ============================================================
   ② 点开五档面板：五颗章都在、未选档时保存不可点
   ============================================================ */
console.log('\n[2] 点开五档面板');
await ev(`(() => { const b = document.querySelector('.qw-stamp-open'); if (b) b.click(); })()`);
await sleep(500);
const s2 = await dumpStamp();
log('panel', {
  tierCount: s2.tierCount,
  tiers: s2.tiers.map((t) => ({ zh: t.zh, checked: t.checked, h: t.box.h, w: t.box.w })),
  savedDisabled: s2.savedDisabled,
  store: s2.store,
});

/* 让面板完整进视口再截 —— 五颗章要一张图里全看见 */
await ev(`(() => { const p = document.querySelector('.qw-stamp-panel'); if (p) p.scrollIntoView({ block: 'center' }); })()`);
await sleep(400);
const shot2 = await shot('stamp-2-tiers-1440.png');
log('shot-2', shot2);

results.assert2 = {
  fiveTiers: s2.tierCount === 5,
  tiersZh: s2.tiers.map((t) => t.zh).join('/'),
  tiersZhExact: s2.tiers.map((t) => t.zh).join('/') === '一闻钟情/喜欢/还行/无感/劝退',
  noneChecked: s2.tiers.every((t) => t.checked === 'false'),
  tiers44: s2.tiers.every((t) => t.box && t.box.h >= 44),
  saveDisabledBeforePick: s2.savedDisabled === true,
  /* 两段式第一段：点开面板**没有**落记录 */
  noStoreAfterOpen: s2.store == null,
  panelInViewport: s2.panelBox != null && s2.panelBox.y >= 0 && s2.panelBox.y < 900,
  shotIs1440x900: shot2.w === 1440 && shot2.h === 900,
};

/* ============================================================
   ③ 选「喜欢」→ 保存 → 落盘 + chip 显示「最近一次 + 共 N 次」
   ============================================================ */
console.log('\n[3] 选「喜欢」→ 保存');
await ev(`(() => {
  const t = [...document.querySelectorAll('.qw-stamp-tier')].find((b) => b.textContent === '喜欢');
  if (t) t.click();
})()`);
await sleep(250);
const afterPick = await dumpStamp();
log('after-pick', {
  checked: afterPick.tiers.map((t) => t.checked),
  savedDisabled: afterPick.savedDisabled,
});
await ev(`(() => { const s = document.querySelector('.qw-stamp-save'); if (s) s.click(); })()`);
await sleep(600);
const s3 = await dumpStamp();
log('after-save', {
  chips: s3.rows.map((r) => ({ name: r.name, chipText: r.chipText, count: r.chipCount })),
  store: s3.store,
  barText: s3.barText,
});
await ev(`(() => { const h = document.querySelector('.qw-history'); if (h) h.scrollIntoView({ block: 'start' }); })()`);
await sleep(400);
const shot3 = await shot('stamp-3-saved-1440.png');
log('shot-3', shot3);

const parsed = (() => { try { return JSON.parse(s3.store || 'null'); } catch { return null; } })();
results.assert3 = {
  pickedMarksSave: afterPick.tiers.filter((t) => t.checked === 'true').length === 1,
  saveEnabledAfterPick: afterPick.savedDisabled === false,
  storedOne: Array.isArray(parsed) && parsed.length === 1,
  storedShape: Array.isArray(parsed) && Object.keys(parsed[0]).join(',') === 'key,name,brand,log',
  storedLogShape: Array.isArray(parsed) && Object.keys(parsed[0].log[0]).join(',') === 'tier,t',
  storedTier: Array.isArray(parsed) && parsed[0].log[0].tier === 'like',
  chipShowsTier: /喜欢/.test(s3.rows[0].chipText || ''),
  chipShowsCount: /共 1 次/.test(s3.rows[0].chipText || ''),
  chipCountAttr: s3.rows[0].chipCount === '1',
  otherBottleUntouched: s3.rows[1].chipText === null && s3.rows[1].openText === '试过？盖章',
  toastSaysSaved: /已盖章/.test(s3.barText || ''),
  shotIs1440x900: shot3.w === 1440 && shot3.h === 900,
};

/* ============================================================
   ④ 再盖一次（改成一闻钟情）→ 计数 2；撤销 → 计数回落
   ============================================================ */
console.log('\n[4] 重复盖章 → 计数 +1；撤销 → 回落');
await ev(`(() => { const c = document.querySelector('.qw-stamp-chip'); if (c) c.click(); })()`);
await sleep(400);
const reopened = await dumpStamp();
log('reopen-prefill', reopened.tiers.map((t) => t.checked));
await ev(`(() => {
  const t = [...document.querySelectorAll('.qw-stamp-tier')].find((b) => b.textContent === '一闻钟情');
  if (t) t.click();
})()`);
await sleep(200);
await ev(`(() => { const s = document.querySelector('.qw-stamp-save'); if (s) s.click(); })()`);
await sleep(600);
const s4 = await dumpStamp();
log('after-second-stamp', {
  chipText: s4.rows[0].chipText, count: s4.rows[0].chipCount,
});

await ev(`(() => { const u = document.querySelector('.qw-stamp-undo-inline'); if (u) u.click(); })()`);
await sleep(600);
const s5 = await dumpStamp();
log('after-undo', { chipText: s5.rows[0].chipText, count: s5.rows[0].chipCount, barText: s5.barText });

results.assert4 = {
  prefillRecentTier: reopened.tiers.filter((t) => t.checked === 'true').length === 1
    && reopened.tiers[1].checked === 'true',
  countBecomes2: s4.rows[0].chipCount === '2' && /共 2 次/.test(s4.rows[0].chipText || ''),
  recentTierSwitched: /一闻钟情/.test(s4.rows[0].chipText || ''),
  undoReturnsCount1: s5.rows[0].chipCount === '1' && /共 1 次/.test(s5.rows[0].chipText || ''),
  undoReturnsTier: /喜欢/.test(s5.rows[0].chipText || '') && !/一闻钟情/.test(s5.rows[0].chipText || ''),
  undoToast: /已撤销上次盖章/.test(s5.barText || ''),
};

/* ============================================================
   ⑤ 盖最高档「一闻钟情」→ 心仪键一个字节都没变（无一键联动）
   ============================================================ */
console.log('\n[5] 盖「一闻钟情」→ 心仪清单键不变（无一键联动）');
{
  const wishBefore = await ev("localStorage.getItem('sp_wishlist_v1')");
  await ev(`(() => {
    const o = document.querySelector('.qw-stamp-open');
    if (o) o.click();
  })()`);
  await sleep(350);
  await ev(`(() => {
    const t = [...document.querySelectorAll('.qw-stamp-tier')].find((b) => b.textContent === '一闻钟情');
    if (t) t.click();
  })()`);
  await sleep(200);
  await ev(`(() => { const s = document.querySelector('.qw-stamp-save'); if (s) s.click(); })()`);
  await sleep(600);
  const wishAfter = await ev("localStorage.getItem('sp_wishlist_v1')");
  const s6 = await dumpStamp();
  log('wish-key', { before: wishBefore, after: wishAfter });
  log('after-love', s6.rows.map((r) => ({ name: r.name, chipText: r.chipText, count: r.chipCount })));

  results.assert5 = {
    wishKeyUnchanged: wishBefore === wishAfter,
    /* 空存储与"没这个键"是两种状态，都算"没被写" */
    wishKeyStillEmpty: wishAfter == null || wishAfter === '[]',
    loveStampStored: /一闻钟情/.test(s6.rows[1].chipText || ''),
    loveChipCount1: s6.rows[1].chipCount === '1',
    historyKeyUntouched: await ev(`(() => {
      const raw = localStorage.getItem('scent-picker.history.v1');
      if (!raw) return false;
      const arr = JSON.parse(raw);
      return arr.every((x) => Object.keys(x).sort().join(',') === 'entry,results,t');
    })()`),
  };
}

/* ============================================================
   ⑥ 390×844 DPR2：五颗章必须一行放得下、无横向滚动、截图真实尺寸
   ============================================================ */
console.log('\n[6] 390×844 DPR2：五档一行 + 无横向滚动 + 截图');
await viewport(390, 844, 2, true);
await send('Page.navigate', { url: BASE + '/index.html' });
for (let i = 0; i < 90; i++) {
  if (await ev("!!document.querySelector('.masthead')")) break;
  await sleep(200);
}
await sleep(900);
await runToResult();
await ev(`(() => {
  localStorage.setItem('scent-picker.history.v1', JSON.stringify([
    { t: ${Date.now()} - 600000, entry: 'family', results: [{ name: 'Santal 33', brand: 'Le Labo' }] },
  ]));
  localStorage.removeItem('scent-picker.tasting.v1');
})()`);
await ev(`(() => { const b = [...document.querySelectorAll('.qw-wl-back')][0]; if (b) b.click(); })()`);
await sleep(300);
await openArchive();
await sleep(600);
const m1 = await dumpStamp();
log('m-before', { rows: m1.rows.map((r) => ({ openText: r.openText, openBox: r.openBox })), innerW: m1.innerW });
await ev(`(() => { const h = document.querySelector('.qw-history'); if (h) h.scrollIntoView({ block: 'start' }); })()`);
await sleep(400);
const mShot1 = await shot('stamp-1-entry-390.png');
log('m-shot-1', mShot1);

await ev(`(() => { const b = document.querySelector('.qw-stamp-open'); if (b) b.click(); })()`);
await sleep(450);
await ev(`(() => {
  const t = [...document.querySelectorAll('.qw-stamp-tier')].find((b) => b.textContent === '一闻钟情');
  if (t) t.click();
})()`);
await sleep(200);
const m2 = await dumpStamp();
log('m-tiers', {
  count: m2.tierCount,
  tops: [...new Set(m2.tiers.map((t) => t.box.y))],
  boxes: m2.tiers.map((t) => ({ zh: t.zh, x: t.box.x, w: t.box.w, h: t.box.h })),
  scrollW: m2.scrollW, innerW: m2.innerW,
});
await ev(`(() => { const p = document.querySelector('.qw-stamp-panel'); if (p) p.scrollIntoView({ block: 'center' }); })()`);
await sleep(400);
const mShot2 = await shot('stamp-2-tiers-390.png');
log('m-shot-2', mShot2);

await ev(`(() => { const s = document.querySelector('.qw-stamp-save'); if (s) s.click(); })()`);
await sleep(700);
/* 再盖一次，让 390 那张"盖后状态"也带着「共 2 次」—— 一次盖不出计数，
   而任务书要的截图就是"含共 N 次"的那一态。 */
await ev(`(() => { const c = document.querySelector('.qw-stamp-chip'); if (c) c.click(); })()`);
await sleep(350);
await ev(`(() => {
  const t = [...document.querySelectorAll('.qw-stamp-tier')].find((b) => b.textContent === '还行');
  if (t) t.click();
})()`);
await sleep(200);
await ev(`(() => { const s = document.querySelector('.qw-stamp-save'); if (s) s.click(); })()`);
await sleep(700);
const m3 = await dumpStamp();
log('m-after', { chipText: m3.rows[0].chipText, count: m3.rows[0].chipCount, scrollW: m3.scrollW });
await ev(`(() => { const h = document.querySelector('.qw-history'); if (h) h.scrollIntoView({ block: 'start' }); })()`);
await sleep(400);
const mShot3 = await shot('stamp-3-saved-390.png');
log('m-shot-3', mShot3);

results.assert6 = {
  tiersOneRow: new Set(m2.tiers.map((t) => t.box.y)).size === 1,
  tiersInsidePanel: m2.tiers.every((t) => t.box.x >= 0 && t.box.x + t.box.w <= m2.innerW + 1),
  tiers44: m2.tiers.every((t) => t.box.h >= 44),
  noHorizontalScroll: m2.scrollW <= m2.innerW + 2,
  chipShowsCount2: m3.rows[0].chipCount === '2' && /共 2 次/.test(m3.rows[0].chipText || ''),
  /* 真实尺寸自查：390×844 @ DPR2 = 780×1688 */
  shot1Is780x1688: mShot1.w === 780 && mShot1.h === 1688,
  shot2Is780x1688: mShot2.w === 780 && mShot2.h === 1688,
  shot3Is780x1688: mShot3.w === 780 && mShot3.h === 1688,
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

fs.writeFileSync(path.join(OUT, 'verify-stamp.json'), JSON.stringify({ results, bad }, null, 1));
console.log(`\n证据已写入 ${path.join(OUT, 'verify-stamp.json')}`);
console.log(`截图：stamp-1-entry-390.png / stamp-2-tiers-390.png / stamp-3-saved-390.png（+ 1440 三张）`);
if (bad) process.exitCode = 1;

ws.close();
proc.kill();
