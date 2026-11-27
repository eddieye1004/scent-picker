/**
 * shot-season.mjs — 390px 季节屏截图（两个不同方向各一张，文案入镜）
 *
 * 为什么单独写一个而不是套 scripts/evidence-shot.mjs：那个脚本停在首屏（或只点
 * 一个大类），要走完圆盘 → 避雷 → 场合 到第 4 屏季节，需要按真实交互一路点下去。
 * 硬编码"点第 N 个元素"会在屏序变化时静默截错屏 —— 所以这里**按内容找控件**
 * （data-fam / data-step / data-season），并在截图前把屏 id 与文案一起打印出来
 * 当证据：图里有什么，stdout 就有什么。
 *
 * 用法：
 *   node scripts/shot-season.mjs --out=<dir> --url=http://127.0.0.1:8199/ \
 *     --family=woody --season=autumn --name=season-390-wooden
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => {
  const hit = process.argv.find((x) => x.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const OUT = path.resolve(arg('out', '.legs/season-shots'));
const URL_ = arg('url', 'http://127.0.0.1:8199/');
const W = Number(arg('width', '390'));
const H = Number(arg('height', '844'));
const FAMILY = arg('family', 'woody');
const SEASON = arg('season', 'autumn');
const NAME = arg('name', `season-${W}-${FAMILY}-${SEASON}`);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9560 + Math.floor(Math.random() * 40);
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(OUT, `.edge-${Date.now()}`)}`, '--no-first-run',
  '--disable-gpu', '--hide-scrollbars', '--disable-extensions',
  '--disable-component-extensions-with-background-pages',
  `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 120; i++) {
  try {
    const j = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = j.find((x) => x.type === 'page' && x.url === 'about:blank');
    if (target) break;
  } catch { /* 等 CDP 起来 */ }
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
  const i = ++id;
  pend.set(i, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (x) => (await send('Runtime.evaluate', {
  expression: x, returnByValue: true, awaitPromise: true,
})).result.value;

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: W, height: H, deviceScaleFactor: 2, mobile: true,
});
await send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-color-scheme', value: 'light' }],
});
await send('Page.navigate', { url: URL_ });

/* 等首屏圆盘画出来（.sector-g 存在即数据到位）。 */
for (let i = 0; i < 160; i++) {
  if (await ev(`!!document.querySelector('.sector-g')`)) break;
  await sleep(120);
}
await sleep(500);

/* ① 选方向：点 data-fam 对应的扇区。 */
const clickedFam = await ev(`(() => {
  const g = [...document.querySelectorAll('.sector-g')]
    .find((x) => x.getAttribute('data-fam') === ${JSON.stringify(FAMILY)});
  if (!g) return false;
  g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return true;
})()`);
if (!clickedFam) { console.error('找不到家族扇区：' + FAMILY); proc.kill(); process.exit(1); }
await sleep(700);

/* ② 往后走到季节屏。按 data-step 判当前屏，而不是数点了几个「下一步」——
   避雷屏在某些方向下会被整屏跳过（共 5 步），数点击次数会错位。 */
const nextLabel = () => ev(`(() => {
  const b = [...document.querySelectorAll('.actions .btn')]
    .find((x) => /下一步|看推荐/.test(x.textContent));
  return b ? b.textContent.trim() : null;
})()`);

let hops = 0;
while (hops < 8) {
  const step = await ev(`document.getElementById('app').dataset.step`);
  if (step === 'season') break;
  const lbl = await nextLabel();
  if (!lbl) { console.error(`屏 ${step} 上找不到前进按钮`); proc.kill(); process.exit(1); }
  await ev(`(() => {
    const b = [...document.querySelectorAll('.actions .btn')]
      .find((x) => /下一步|看推荐/.test(x.textContent));
    if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  })()`);
  await sleep(520);
  hops++;
}
const stepNow = await ev(`document.getElementById('app').dataset.step`);
if (stepNow !== 'season') {
  console.error(`没走到季节屏，当前 ${stepNow}（跳了 ${hops} 次）`);
  proc.kill(); process.exit(1);
}
await sleep(450);

/* ③ 点季节落点（data-season）。 */
const clickedSeason = await ev(`(() => {
  const b = [...document.querySelectorAll('.season-cell')]
    .find((x) => x.getAttribute('data-season') === ${JSON.stringify(SEASON)});
  if (!b) return false;
  b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return true;
})()`);
if (!clickedSeason) { console.error('找不到季节落点：' + SEASON); proc.kill(); process.exit(1); }
await sleep(700);

/* ④ 读证据：屏 id / 情境句文本 / 是否可见 / 视口与横向溢出 / 该句是否在视口内。 */
const meta = await ev(`(() => {
  const s = document.querySelector('.season-scene');
  const g = document.querySelector('.temp-gloss');
  const r = s ? s.getBoundingClientRect() : null;
  return {
    step: document.getElementById('app').dataset.step,
    family: ${JSON.stringify(FAMILY)},
    season: ${JSON.stringify(SEASON)},
    sceneText: s ? s.textContent : null,
    sceneHidden: s ? !!s.hidden : null,
    sceneInViewport: r ? (r.top >= 0 && r.bottom <= innerHeight) : null,
    sceneBox: r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) } : null,
    glossText: g ? g.textContent : null,
    viewport: [innerWidth, innerHeight],
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    pageH: document.documentElement.scrollHeight,
  };
})()`);

const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
const file = path.join(OUT, NAME + '.png');
fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
console.log(JSON.stringify({ shot: file, ...meta }, null, 2));
ws.close(); proc.kill(); process.exit(0);
