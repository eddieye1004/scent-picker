/**
 * shot-icons-zoom.mjs — 圆盘图标核验（v7 第 1 步收尾腿）
 *
 *   node scripts/shot-icons-zoom.mjs
 *
 * 为什么需要它：上一腿只截了「未选」与「选了大类」两张整屏图，两张里
 * 盘心都没有图标 —— 因为标本只在**落到具体小类**时才画（app.js paint() 的
 * `if (focusSub)`）。于是"24 个香型图标已恢复且实际渲染"这条验收，
 * 单看那两张图证不了。
 *
 * 本脚本做两件事，都走真实点击（不注入 state，注入会绕过 onChange 与 paint）：
 *   ① 逐族逐子类点过去，量盘心里那枚 .plate-svg 的图元数与签名，
 *      把 24 格的"渲染出来了 / 各有各的图形"变成可引用的数字；
 *   ② 停在某一格，把盘心按 clip + scale 放大截一张
 *      → 03-wheel-icons-zoom.png（图标要能看清，这是本腿的图证）。
 *
 * 判据（stdout 的 JSON，回执直接引用）：
 *   · 每格 shapes >= 2（盘心真画出几何，不是空 svg 占位）
 *   · 24 格签名两两不同（同族不同小类不是同一枚图）
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9452;
const OUT = 'C:/Users/16256/work/.legs/quiz-v7-step1-shots';
const URL_ = process.env.SHOT_URL || 'http://127.0.0.1:8080/';
const W = 1440;
const H = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const proc = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/16256/work/.legs/edge-icons-${Date.now()}/`,
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
  pend.set(i, (m2) => (m2.error ? rej(new Error(m2.error.message)) : res(m2.result)));
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
/* 24 枚是 fetch + 内存缓存，预热完成前盘心会空一小会儿（app.js 有意不画线稿兜底） */
for (let i = 0; i < 60; i++) {
  const n = await ev(`document.querySelectorAll('.plate-svg path, .plate-svg circle, .plate-svg ellipse').length`);
  if (typeof n === 'number' && n > 0) break;
  await sleep(200);
}
await sleep(600);

/* ---- 构建校验：先核对"跑的是哪份代码"，再截图 ----
   实测踩过：端口上跑的是**另一个 worktree** 的 server.js（服务 v6 的 app.js），
   脚本照样"成功"产出截图，而图里根本没有圆盘。所以不一致就退出，不产假图。 */
const diskBuild = (fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  .match(/BUILD_ID = '([^']+)'/) || [])[1];

const build = await ev(`document.documentElement.dataset.build`);
if (diskBuild && build !== diskBuild) {
  console.error(`构建不符：页面 ${build} / 磁盘 ${diskBuild}\n`
    + `  ${URL_} 上没有在跑当前 worktree 的代码（换端口，或先 node server.js <port>）`);
  ws.close(); proc.kill(); process.exit(2);
}
const fams = await ev(`[...document.querySelectorAll('.sector-g')].map((g) => g.getAttribute('data-fam'))`);
const famZh = await ev(`[...document.querySelectorAll('.sector-g')].map((g) => (g.querySelector('.zh') || {}).textContent || '')`);

const measure = `(() => {
  const svg = document.querySelectorAll('.plate-svg')[0];
  const cap = (document.querySelector('.plate-cap') || {}).textContent || '';
  const hub = document.querySelector('.disc-hub');
  if (!svg) return { svg: 0, shapes: 0, cap, hub: hub && hub.className, sig: '' };
  const shapes = svg.querySelectorAll('path,circle,ellipse,rect,polygon').length;
  const sig = [...svg.querySelectorAll('path,circle,ellipse,rect,polygon')]
    .map((q) => (q.getAttribute('d') || '') + '|' + (q.getAttribute('r') || '') + '|'
      + (q.getAttribute('cx') || '') + '|' + (q.getAttribute('fill') || '')).join('~');
  return { svg: 1, shapes, cap, hub: hub && hub.className, sig: sig.slice(0, 160), sigFull: sig.length };
})()`;

const cells = [];
for (let fi = 0; fi < fams.length; fi += 1) {
  await ev(`(() => { const g = document.querySelector('.sector-g[data-fam="${fams[fi]}"]');
    if (g) g.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`);
  await sleep(900);
  const subs = await ev(`[...document.querySelectorAll('.disc-sector.lvl2')].map((b) => b.getAttribute('data-sub'))`);
  for (let si = 0; si < subs.length; si += 1) {
    await ev(`(() => { const b = document.querySelector('.disc-sector.lvl2[data-sub="${subs[si]}"]');
      if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`);
    await sleep(420);
    const m = await ev(measure);
    cells.push({ fam: fams[fi], famZh: famZh[fi], sub: subs[si], ...m });
  }
}

const withSvg = cells.filter((c) => c.svg === 1).length;
const thick = cells.filter((c) => c.shapes >= 2).length;
const sigs = cells.map((c) => c.sigFull + '#' + c.sig);
const uniq = new Set(sigs).size;

/* ---------- 放大图：停在「东方琥珀调 / 树脂」那种能看清笔画的格上 ----------
   选 amber 族的第 1 个子类，取盘心 bounding box，clip + scale 放大 4 倍。
   scale 是 CDP 的截图倍率（等效 DPR），不是 CSS 缩放 —— 不会改变版式。 */
const pick = cells.find((c) => c.fam === 'amber' && c.svg === 1) || cells.find((c) => c.svg === 1);
await ev(`(() => { const g = document.querySelector('.sector-g[data-fam="${pick.fam}"]');
  if (g) g.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`);
await sleep(900);
await ev(`(() => { const b = document.querySelector('.disc-sector.lvl2[data-sub="${pick.sub}"]');
  if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`);
await sleep(1200);

const box = await ev(`(() => {
  const hub = document.querySelector('.disc-hub');
  if (!hub) return null;
  const r = hub.getBoundingClientRect();
  /* pad 让盘心周围留一圈盘面，看得出这是盘心而不是孤立一张图 */
  const pad = 6;
  return { x: r.left - pad, y: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
})()`);

const spec = { format: 'png', captureBeyondViewport: false };
if (box && box.width > 0) spec.clip = { ...box, scale: 4 };
const shot = await send('Page.captureScreenshot', spec);
const outPath = path.join(OUT, '03-wheel-icons-zoom.png');
fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));

console.log(JSON.stringify({
  build,
  families: fams.length,
  cells: cells.length,
  cellsWithSvg: withSvg,
  cellsWithGeometry: thick,
  uniqueSignatures: uniq,
  zoom: { file: outPath, clip: box, scale: spec.clip ? spec.clip.scale : 1, sub: pick.sub, fam: pick.fam },
  detail: cells.map((c) => ({ fam: c.fam, sub: c.sub, shapes: c.shapes, cap: c.cap })),
}, null, 2));

ws.close();
proc.kill();
process.exit(0);
