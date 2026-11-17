/**
 * probe-amb-visible.mjs — 判定底噪层到底"能不能被看见"，以及看不见的原因。
 *
 * 为什么要单独判一次：截图只能说明"这一屏看起来有没有变化"，说明不了
 * "是因为没接线、还是因为配方太淡、还是因为被 z-index 埋到纸面后头"。
 * 这三种原因的修法完全不同（第一种要接线，第二种要改配方=视觉改动，
 * 第三种要改挂载点），所以必须分开量。
 *
 * 做法：同一屏、同一个方向，把 --amb-strength 从 0 逐档推上去，
 * 每次读 (a) .amb-wash 的 computed opacity、background、以及它的
 * (b) #app 是否建立了层叠上下文、(c) 一块实际像素的颜色。
 * 像素用 CDP 截图裁一小块来读，不依赖任何 npm 包。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9453;
const URL_ = process.env.SHOT_URL || 'http://127.0.0.1:8157/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/16256/work/.legs/edge-probe-${Date.now()}/`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1440,900', 'about:blank',
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
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL_ });
for (let i = 0; i < 100; i++) { await sleep(200); if (await ev(`!!document.querySelector('.disc-sector.lvl1')`)) break; }
await sleep(800);

const out = {};
out.stack = await ev(`(() => {
  const app = document.getElementById('app');
  const wash = document.querySelector('.amb-wash');
  const cs = getComputedStyle(app);
  const ws2 = wash ? getComputedStyle(wash) : null;
  const after = wash ? getComputedStyle(wash, '::after') : null;
  return {
    appPosition: cs.position,
    appZIndex: cs.zIndex,
    appTransform: cs.transform,
    appIsolation: cs.isolation,
    washPosition: ws2 && ws2.position,
    washZIndex: ws2 && ws2.zIndex,
    washOpacity: ws2 && ws2.opacity,
    washBackground: ws2 && ws2.backgroundImage.slice(0, 160),
    afterOpacity: after && after.opacity,
    afterBackground: after && after.backgroundColor,
  };
})()`);

/* 采样：页脚左侧一块纯纸面（盘之外、无文字），以及右侧空白。 */
const sample = async () => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const buf = Buffer.from(r.data, 'base64');
  fs.writeFileSync('C:/Users/16256/work/.legs/probe-tmp.png', buf);
  return buf.length;
};

out.rows = [];
for (const s of [null, 0.34, 0.85]) {
  const info = await ev(`(() => {
    const app = document.getElementById('app');
    if (${s === null ? 'true' : 'false'}) { /* 保持现状 */ } else {
      app.style.setProperty('--amb-strength', '${s}');
      app.style.setProperty('--amb-temp', '${s === null ? 0 : -(0.78 * s)}');
      app.style.setProperty('--amb-light', '${s === null ? 0 : -(0.74 * s)}');
    }
    const wash = document.querySelector('.amb-wash');
    const ws2 = wash ? getComputedStyle(wash) : null;
    const after = wash ? getComputedStyle(wash, '::after') : null;
    return {
      strength: app.style.getPropertyValue('--amb-strength'),
      temp: app.style.getPropertyValue('--amb-temp'),
      light: app.style.getPropertyValue('--amb-light'),
      washOpacity: ws2 && ws2.opacity,
      afterOpacity: after && after.opacity,
      bgFirst: ws2 && ws2.backgroundImage.slice(0, 120),
    };
  })()`);
  await sleep(400);
  const bytes = await sample();
  out.rows.push({ s: s === null ? 'as-is' : s, ...info, pngBytes: bytes });
}

console.log(JSON.stringify(out, null, 2));
ws.close(); proc.kill(); process.exit(0);
