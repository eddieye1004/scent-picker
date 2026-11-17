/**
 * shot-center-family.mjs — 只选大类时的盘心截图（两张，不同大类）
 *
 *   node shot-center-family.mjs            # 两张都截
 *
 * 与 shot-wheel.mjs 的区别：那份截整屏，这份截**盘心**并按 3× 放大，
 * 因为要验的是"盘心那枚图是不是大类图"，整屏图里盘心只有 88px 看不清。
 *
 * 纪律照旧（踩过的坑，见 shot-wheel.mjs 注释）：
 *   · 先核对 BUILD_ID —— 端口上跑的可能不是这个 worktree 的代码；
 *   · 用真实点击而不是注入 state —— 注入绕过 onChange / paint，
 *     "盘心长出图"这件事恰好挂在 paint() 里。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9453;
const OUT = 'C:/Users/16256/work/.legs/icon-step-shots';
const URL_ = process.env.SHOT_URL || 'http://127.0.0.1:8088/';
const W = 1440;
const H = 980;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const proc = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/16256/work/.legs/edge-center-${Date.now()}/`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars',
  `--window-size=${W},${H}`, 'about:blank',
], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 80; i++) {
  try {
    const j = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = j.find((x) => x.type === 'page');
    if (target) break;
  } catch { /* 等 */ }
  await sleep(250);
}
if (!target) { console.error('CDP 没起来'); proc.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pend = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id;
  pend.set(i, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return '__ERR__' + (r.exceptionDetails.exception?.description || '').slice(0, 300);
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
await send('Page.navigate', { url: URL_ });

for (let i = 0; i < 100; i++) {
  await sleep(200);
  if (await ev(`!!document.querySelector('.disc-sector.lvl1')`)) break;
}
for (let i = 0; i < 60; i++) {
  const n = await ev(`document.querySelectorAll('.plate-svg path, .plate-svg circle, .plate-svg ellipse').length`);
  if (typeof n === 'number' && n > 0) break;
  await sleep(200);
}
await sleep(700);

/* ---- 构建校验：先核对"跑的是哪份代码"，再截图 ---- */
const diskBuild = (fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  .match(/BUILD_ID = '([^']+)'/) || [])[1];
const liveBuild = await ev(`document.documentElement.dataset.build`);
if (diskBuild && liveBuild !== diskBuild) {
  console.error(`构建不符：页面 ${liveBuild} / 磁盘 ${diskBuild}\n`
    + `  ${URL_} 上没有在跑当前 worktree 的代码（换端口，或先 node server.js <端口>）`);
  ws.close(); proc.kill(); process.exit(2);
}

/* 两个不同大类。取柑橘（第一格）与东方琥珀（第四格，与 v7 第 1 步那张
   截图同一格，便于和旧图对照）。不取"悬停"路径 —— 悬停不画图是既有断言。 */
const PICKS = [
  { fam: 'citrus', file: '02-center-family-a.png' },
  { fam: 'amber', file: '03-center-family-b.png' },
];

const results = { build: liveBuild, url: URL_, shots: [] };
for (const p of PICKS) {
  await ev(`(() => { const g = document.querySelector('.sector-g[data-fam="${p.fam}"]');
    if (g) g.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`);
  await sleep(1500);
  /* 中圈要长出来、盘心图要 fetch 落地 */
  for (let i = 0; i < 40; i++) {
    const n = await ev(`document.querySelectorAll('.disc-sector.lvl2').length`);
    if (typeof n === 'number' && n > 0) break;
    await sleep(200);
  }
  for (let i = 0; i < 40; i++) {
    const n = await ev(`document.querySelectorAll('.hub-plate .plate-svg path, .hub-plate .plate-svg circle').length`);
    if (typeof n === 'number' && n > 2) break;
    await sleep(200);
  }
  await sleep(600);

  const info = await ev(`(() => {
    const hub = document.querySelector('.disc-hub');
    const plate = document.querySelector('.hub-plate');
    const svg = document.querySelector('.hub-plate .plate-svg');
    const shapes = svg ? svg.querySelectorAll('path,circle,ellipse,rect,polygon').length : 0;
    const r = hub.getBoundingClientRect();
    return {
      hubZh: (document.querySelector('.hub-zh') || {}).textContent,
      kicker: (document.querySelector('.hub-kicker') || {}).textContent,
      hubClass: hub.className,
      hasGlyph: hub.classList.contains('has-glyph'),
      picked: hub.classList.contains('is-picked'),
      plates: document.querySelectorAll('.plate-svg').length,
      shapes,
      cap: (document.querySelector('.plate-cap') || {}).textContent || '',
      aria: plate ? plate.getAttribute('aria-label') : null,
      viewBox: svg ? svg.getAttribute('viewBox') : null,
      firstFill: svg && svg.querySelector('path') ? svg.querySelector('path').getAttribute('fill') : null,
      box: { x: r.left - 8, y: r.top - 8, width: r.width + 16, height: r.height + 16 },
    };
  })()`);

  const spec = { format: 'png', captureBeyondViewport: false };
  if (info.box && info.box.width > 0) spec.clip = { ...info.box, scale: 3 };
  const shot = await send('Page.captureScreenshot', spec);
  fs.writeFileSync(path.join(OUT, p.file), Buffer.from(shot.data, 'base64'));
  results.shots.push({ fam: p.fam, file: path.join(OUT, p.file), clip: info.box, scale: 3, ...info, box: undefined });
}

console.log(JSON.stringify(results, null, 2));
ws.close();
proc.kill();
process.exit(0);
