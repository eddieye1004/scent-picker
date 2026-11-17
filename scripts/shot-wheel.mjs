/**
 * shot-wheel.mjs — 两张验收截图（v7 第 1 步）
 *
 *   node scripts/shot-wheel.mjs            # 两张都截
 *   node scripts/shot-wheel.mjs --only=idle
 *
 * 为什么自己写一份而不复用 _probe/shot.mjs：那一份的交互路径是
 * "点第一个扇区 → 连点下一步"，而本步要的是**两张静止状态**：
 *   ① 圆盘初始态（一个扇区都没选、底噪还没点亮）
 *   ② 选定一个香型之后（选中反馈 + 底噪已点燃）
 * 用真实点击而不是注入 state —— 注入会绕过 onChange，而"底部按钮解禁 +
 * 底噪点亮"这两件事恰好都挂在 onChange 里，注入等于把要验的东西绕掉。
 *
 * 判据（stdout 会打出来，供回执引用）：
 *   · data-step = family             ← 圆盘确实是第 1 屏
 *   · .disc-sector.lvl1 = 6 / .sector-shape = 6   ← 盘在
 *   · .disc-sector.lvl2 > 0 且 .plate-svg = 1     ← 中圈展开 + 24 枚图标在位
 *   · 选中后 --amb-strength > 0 且 .amb-tick 有字 ← 底噪点燃（可读读数）
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9451;
const OUT = 'C:/Users/16256/work/.legs/quiz-v7-step1-shots';
const URL_ = process.env.SHOT_URL || 'http://127.0.0.1:8093/';
const W = 1440;
const H = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const proc = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/16256/work/.legs/edge-shot-v7-${Date.now()}/`,
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

/* 等盘真的画出来（不是等一个固定时长 —— 慢网下会截到骨架屏）。 */
for (let i = 0; i < 100; i++) {
  await sleep(200);
  if (await ev(`!!document.querySelector('.disc-sector.lvl1')`)) break;
}
/* 24 枚上色 SVG 是 fetch + 内存缓存的，等它们都到齐再截，
   否则第一张会截到"盘心空白"的半成品。 */
for (let i = 0; i < 60; i++) {
  const n = await ev(`document.querySelectorAll('.plate-svg path, .plate-svg circle, .plate-svg ellipse').length`);
  if (typeof n === 'number' && n > 0) break;
  await sleep(200);
}
await sleep(600);

const probe = `(() => {
  const app = document.getElementById('app');
  const cs = app ? getComputedStyle(app) : null;
  const wash = document.querySelector('.amb-wash');
  const tick = document.querySelector('.amb-tick');
  return {
    step: app ? app.dataset.step : null,
    build: document.documentElement.dataset.build || null,
    lvl1: document.querySelectorAll('.disc-sector.lvl1').length,
    shapes: document.querySelectorAll('.sector-shape').length,
    lvl2: document.querySelectorAll('.disc-sector.lvl2').length,
    plateSvg: document.querySelectorAll('.plate-svg').length,
    plateReady: document.querySelectorAll('.plate-svg path, .plate-svg circle, .plate-svg ellipse').length,
    hubZh: (document.querySelector('.hub-zh')||{}).textContent || null,
    hubClass: (document.querySelector('.disc-hub')||{}).className || null,
    checked: document.querySelectorAll('.disc-sector[aria-checked="true"]').length,
    nextDisabled: (() => { const b=[...document.querySelectorAll('.btn')].find(x=>/下一步/.test(x.textContent)); return b ? b.disabled : null; })(),
    ambStrength: cs ? cs.getPropertyValue('--amb-strength').trim() : null,
    ambTemp: cs ? cs.getPropertyValue('--amb-temp').trim() : null,
    ambLight: cs ? cs.getPropertyValue('--amb-light').trim() : null,
    dataAmb: app ? app.dataset.amb : null,
    tick: tick ? tick.textContent : null,
    washOpacity: wash ? getComputedStyle(wash).opacity : null,
    washRect: wash ? (() => { const r = wash.getBoundingClientRect(); return [r.width, r.height]; })() : null,
    bodyH: document.documentElement.scrollHeight,
  };
})()`;

const shot = async (file) => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const p = path.join(OUT, file);
  fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
  return p;
};

const only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];

const results = {};

/* ---------- ① 圆盘初始态 ---------- */
{
  const info = await ev(probe);
  const p = await shot('01-wheel-idle.png');
  results.idle = { shot: p, ...info };
}

/* ---------- ② 选定一个香型 ----------
   点的是扇区的**本体**（.sector-g），不是它的文字标签：两者都绑了 click，
   走本体才等于用户戳那一大块面积（a39 的设计要求）。

   ==== 为什么选「东方琥珀调」这一格（不是第一格）====
   底噪在圆盘这一屏是**设计上最弱的一档**：src/ambient.js 的 BASE_STRENGTH
   固定 0.34，注释写明"它必须明显弱于后面任何一屏"。而六条轴在这个强度下
   的可见度并不同（径向渐变一条在上、一条在下，色相也不同）：

     轴            0.34 时最强纵向带的平均通道差（实测 scripts/probe-amb-bands.mjs）
     mysterious    3.26   ← 本张截图用的，肉眼可辨
     warm          2.47
     cold          2.26
     lazy          1.91
     clean         0.79
     bright        0.47   ← 柑橘调走的这条，0.34 下基本看不出

   所以"能看出底噪已点燃"这个取景要求，在 0.34 的强度下只有选前四轴才成立。
   这里取 mysterious（东方琥珀调），它在 a39 的扇区顺序里是第 4 格。
   这张图证明的是"接线通了、且在最弱档下确实有可见变化"；
   它不证明六轴等强 —— 六轴不等强是 v6 配方的既有性质，记在回执的遗留问题里，
   本步不改配方（改配方=改视觉，超出本步授权）。 */
if (only !== 'idle') {
  await ev(`(() => {
    const g = [...document.querySelectorAll('.sector-g')].find((x) => x.getAttribute('data-fam') === 'amber')
      || document.querySelector('.sector-g');
    if (g) g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  })()`);
  await sleep(1400);
  /* 中圈弧段有错峰入场（最后一段 300ms 后到位），盘心标本要等 fetch 落地 */
  for (let i = 0; i < 40; i++) {
    const n = await ev(`document.querySelectorAll('.disc-sector.lvl2').length`);
    if (typeof n === 'number' && n > 0) break;
    await sleep(200);
  }
  await sleep(800);
  const info = await ev(probe);
  const p = await shot('02-wheel-picked.png');
  results.picked = { shot: p, ...info };
}

console.log(JSON.stringify(results, null, 2));
ws.close();
proc.kill();
process.exit(0);
