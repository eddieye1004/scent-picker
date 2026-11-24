/**
 * shot-avoid-capsule.mjs — 避雷屏截图（qoder/avoid-capsule 视觉定版腿）
 *
 * 套路与 shot-season.mjs 同款：headless Edge + CDP，按内容找控件
 * （data-fam / data-sub / data-step），截图前把屏 id 与三态读数打印成证据。
 * 改前（基线）与改后各跑一次，同一脚本保证两版截图路径一致。
 *
 * 用法：
 *   node scripts/shot-avoid-capsule.mjs --out=<dir> --url=http://127.0.0.1:8199/ \
 *     --width=1440 --height=900 --family=citrus --sub=cologne --states=1 --name=avoid-1440
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => {
  const hit = process.argv.find((x) => x.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const OUT = path.resolve(arg('out', '.legs/avoid-shots'));
const URL_ = arg('url', 'http://127.0.0.1:8199/');
const W = Number(arg('width', '1440'));
const H = Number(arg('height', '900'));
const FAMILY = arg('family', 'citrus');
const SUB = arg('sub', 'cologne');
const STATES = arg('states', '1') === '1';
const NAME = arg('name', `avoid-${W}`);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9620 + Math.floor(Math.random() * 40);
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
  width: W, height: H, deviceScaleFactor: W < 621 ? 2 : 1, mobile: W < 621,
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

/* ① 选大类。 */
const clickedFam = await ev(`(() => {
  const g = [...document.querySelectorAll('.sector-g')]
    .find((x) => x.getAttribute('data-fam') === ${JSON.stringify(FAMILY)});
  if (!g) return false;
  g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return true;
})()`);
if (!clickedFam) { console.error('找不到家族扇区：' + FAMILY); proc.kill(); process.exit(1); }
await sleep(700);

/* ② 落到小类（锚点要有图标，就得走小类那一路）。 */
if (SUB) {
  const clickedSub = await ev(`(() => {
    const g = [...document.querySelectorAll('.sub-g')]
      .find((x) => x.getAttribute('data-sub') === ${JSON.stringify(SUB)});
    if (!g) return false;
    g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
  })()`);
  if (!clickedSub) { console.error('找不到小类扇区：' + SUB); proc.kill(); process.exit(1); }
  await sleep(700);
}

/* ③ 走到避雷屏。按 data-step 判屏，不数点击次数（某些方向整屏跳过）。 */
let hops = 0;
while (hops < 8) {
  const step = await ev(`document.getElementById('app').dataset.step`);
  if (step === 'unwanted') break;
  await ev(`(() => {
    const b = [...document.querySelectorAll('.actions .btn')]
      .find((x) => /下一步|看推荐/.test(x.textContent));
    if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  })()`);
  await sleep(520);
  hops++;
}
const stepNow = await ev(`document.getElementById('app').dataset.step`);
if (stepNow !== 'unwanted') {
  console.error(`没走到避雷屏，当前 ${stepNow}（跳了 ${hops} 次）`);
  proc.kill(); process.exit(1);
}
/* 等候选算出来（perfumes.json 现拉，.avoid-card 出现为止）。 */
for (let i = 0; i < 120; i++) {
  if (await ev(`!!document.querySelector('.avoid-card')`)) break;
  await sleep(150);
}
await sleep(400);

/* ④ 三态入镜：第一张点「这个不要」、第二张点「没闻过」（--states=1 时）。 */
if (STATES) {
  await ev(`(() => {
    const rows = [...document.querySelectorAll('.avoid-row')];
    if (rows[0]) rows[0].querySelector('.avoid-card')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    if (rows[1]) rows[1].querySelector('.avoid-nope')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  })()`);
  await sleep(500);
}

/* ⑤ 读证据：屏 id / 卡片数 / 三态 / 锚点（改版后才有）/ 溢出与一屏读数。 */
const meta = await ev(`(() => {
  const cards = [...document.querySelectorAll('.avoid-card')];
  const anchor = document.querySelector('.avoid-anchor');
  const nav = document.querySelector('.nav-bar, .actions');
  const last = cards[cards.length - 1];
  const lr = last ? last.getBoundingClientRect() : null;
  const nr = nav ? nav.getBoundingClientRect() : null;
  return {
    step: document.getElementById('app').dataset.step,
    family: ${JSON.stringify(FAMILY)}, sub: ${JSON.stringify(SUB)},
    cards: cards.length,
    stateOn: cards.filter((c) => c.classList.contains('is-on')).length,
    stateUnknown: cards.filter((c) => c.classList.contains('is-unknown')).length,
    nopeOn: document.querySelectorAll('.avoid-nope.is-on').length,
    undo: document.querySelectorAll('.avoid-undo').length,
    anchor: anchor ? {
      text: anchor.textContent.trim(),
      hasIcon: !!anchor.querySelector('svg'),
      inViewport: (r => r.top >= 0 && r.bottom <= innerHeight)(anchor.getBoundingClientRect()),
    } : null,
    lastCardBottom: lr ? Math.round(lr.bottom) : null,
    navTop: nr ? Math.round(nr.top) : null,
    viewport: [innerWidth, innerHeight],
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  };
})()`);

const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
const file = path.join(OUT, NAME + '.png');
fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
console.log(JSON.stringify({ shot: file, ...meta }, null, 2));
ws.close(); proc.kill(); process.exit(0);
