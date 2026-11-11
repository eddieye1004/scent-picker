/**
 * shot.mjs — 通用截图探针（任务 2 / 任务 4 的前后对照都用它）。
 *
 * 为什么不用现成的截图脚本：仓库里历史脚本散在 C:/Users/16256/ego/ 下，
 * 每个都绑死了某个视口和某个步骤。这里只留一件事：给一个 URL、一个视口、
 * 一个步骤序号，截一张图。
 *
 * 用法：
 *   node _probe/shot.mjs <out.png> <stepIndex> [w] [h] [url]
 *   stepIndex = 0 首屏 / 1 想要的味道 / ... / 5 场合
 * 输出：写到 out.png，并把该屏的标题与关键实测值打到 stdout。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9435 + Number(process.env.SHOT_OFFSET || 0);

const [outFile, stepArg, wArg, hArg, urlArg] = process.argv.slice(2);
if (!outFile) { console.error('用法见文件头'); process.exit(1); }
const STEP = Number(stepArg || 0);
const W = Number(wArg || 1440);
const H = Number(hArg || 900);
const URL_ = urlArg || 'http://127.0.0.1:8093/';
const SCHEME = process.env.SHOT_SCHEME || 'light';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/16256/ego/shot-${PORT}${Date.now()}/`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars',
  `--window-size=${W},${H}`, 'about:blank',
], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 60; i++) {
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
  if (r.exceptionDetails) return '__ERR__' + (r.exceptionDetails.exception?.description || '').slice(0, 200);
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 });
await send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-color-scheme', value: SCHEME }],
});
await send('Page.navigate', { url: URL_ });
for (let i = 0; i < 80; i++) { await sleep(250); if (await ev(`!!document.querySelector('.disc-sector.lvl1')`)) break; }
await sleep(500);

/* 用真实交互前进，而不是注入 state —— 注入会绕过 navBar 与进度条，
   截到的那一屏可能和用户真走到的不是同一张。 */
if (STEP > 0) {
  await ev(`(() => { const b = document.querySelector('.disc-sector.lvl1'); if (b) b.click(); })()`);
  await sleep(600);
  for (let i = 0; i < STEP; i++) {
    await ev(`(() => {
      const b = [...document.querySelectorAll('.btn')].find((x) => /下一步|看推荐/.test(x.textContent));
      if (b) b.click();
    })()`);
    await sleep(500);
  }
}
/* 字体与图片可能还在路上，等一拍再截 */
await sleep(700);
const info = await ev(`(() => {
  const d = document.querySelector('.disc');
  const cs = d ? getComputedStyle(d) : null;
  return {
    step: document.getElementById('app').dataset.step,
    title: (document.querySelector('.q-title')||{}).textContent||'',
    discRadius: cs ? cs.borderRadius : null,
    sectorStrokeW: d ? getComputedStyle(d.querySelector('.sector-shape') || d).strokeWidth : null,
    bodyH: document.documentElement.scrollHeight,
  };
})()`);

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
console.log(JSON.stringify({ out: outFile, viewport: `${W}x${H}`, scheme: SCHEME, ...info }));
ws.close(); proc.kill(); process.exit(0);
