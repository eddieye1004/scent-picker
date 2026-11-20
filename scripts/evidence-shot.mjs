/**
 * evidence-shot.mjs — 证据截图（一次启动，多张）
 *
 *   node scripts/evidence-shot.mjs --out=<dir> --prefix=t1 \
 *     --url=http://127.0.0.1:8080/ [--width=1440] [--height=900] \
 *     [--family=citrus] [--dark]
 *
 * 默认截第 1 屏（圆盘页）。--family 会点一下对应大类，等中圈展开。
 * 不写文件以外的状态，不改页面。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => {
  const hit = process.argv.find((x) => x.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const OUT = path.resolve(arg('out', '.legs/qoder-work-shots'));
const PREFIX = arg('prefix', 'shot');
const URL_ = arg('url', 'http://127.0.0.1:8080/');
const W = Number(arg('width', '1440'));
const H = Number(arg('height', '900'));
const FAMILY = arg('family', '');
const DARK = process.argv.includes('--dark');
const TAG = arg('tag', '');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9480 + Math.floor(Math.random() * 50);
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(OUT, `.edge-shot-${Date.now()}`)}`, '--no-first-run',
  '--disable-gpu', '--hide-scrollbars', '--disable-extensions',
  '--disable-component-extensions-with-background-pages',
  `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });

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
await send('Emulation.setDeviceMetricsOverride', {
  width: W, height: H, deviceScaleFactor: 1, mobile: W < 600,
});
await send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-color-scheme', value: DARK ? 'dark' : 'light' }],
});
await send('Page.navigate', { url: URL_ });
for (let i = 0; i < 150; i++) {
  if (await ev(`!!document.querySelector('.sector-g')`)) break;
  await sleep(120);
}
await sleep(700);
if (FAMILY) {
  await ev(`(() => {
    const g = [...document.querySelectorAll('.sector-g')]
      .find((x) => x.getAttribute('data-fam') === ${JSON.stringify(FAMILY)});
    if (g) g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  })()`);
  await sleep(900);
}
const name = `${PREFIX}${TAG ? '-' + TAG : ''}.png`;
const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
const meta = await ev(`({
  href: location.href,
  step: document.getElementById('app')?.dataset.step,
  size: [innerWidth, innerHeight],
  scrollW: document.documentElement.scrollWidth,
})`);
console.log(JSON.stringify({ shot: path.join(OUT, name), ...meta }, null, 2));
ws.close(); proc.kill(); process.exit(0);
