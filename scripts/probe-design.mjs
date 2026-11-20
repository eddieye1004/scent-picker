/**
 * probe-design.mjs — 第 1 屏圆盘设计层的几何探针（临时诊断用，可常驻仓库）
 *
 *   node scripts/probe-design.mjs
 *
 * 量的是"在真实浏览器里，中圈/外圈标签有没有越界、盘心装不装得下内容"，
 * 这些量在测试桩里都拿不到（桩没有布局）。输出是一个 JSON，供回执引用。
 */
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9471;
const URL_ = process.env.PROBE_URL || 'http://127.0.0.1:8080/';
const VIEWS = [[1440, 900], [390, 844], [360, 780]];

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
  if (r.exceptionDetails) return 'ERR ' + JSON.stringify(r.exceptionDetails).slice(0, 200);
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');

const report = {};
for (const [w, h] of VIEWS) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 620 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await send('Page.navigate', { url: URL_ });
  for (let i = 0; i < 120; i++) {
    await sleep(200);
    if (await ev(`!!document.querySelector('.disc-sector.lvl1')`)) break;
  }
  await sleep(900);

  const measure = await ev(`(() => {
    const wheel = document.querySelector('.wheel').getBoundingClientRect();
    const hub = document.querySelector('.disc-hub').getBoundingClientRect();
    const outOfWheel = (r) => Math.max(0, wheel.left - r.left, r.right - wheel.right,
      wheel.top - r.top, r.bottom - wheel.bottom);
    const lab = [...document.querySelectorAll('.disc-sector.lvl1')].map((b) => {
      const zh = b.querySelector('.zh');
      const notes = b.querySelector('.notes');
      const br = b.getBoundingClientRect();
      const nr = notes ? notes.getBoundingClientRect() : null;
      return {
        fam: b.getAttribute('data-fam'),
        btn: [Math.round(br.width), Math.round(br.height)],
        zh: [Math.round(zh.getBoundingClientRect().width), Math.round(zh.getBoundingClientRect().height)],
        notes: nr ? [Math.round(nr.width), Math.round(nr.height)] : null,
        notesVisibleH: nr ? Math.round(Math.max(0, Math.min(nr.height, br.bottom) - Math.max(nr.top, br.top))) : 0,
        outBox: Math.round(outOfWheel(br)),
      };
    });
    const docOver = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    return {
      wheelW: Math.round(wheel.width),
      hub: [Math.round(hub.width), Math.round(hub.height)],
      hubOverflow: [hub.scrollWidth - hub.clientWidth, hub.scrollHeight - hub.clientHeight],
      labels: lab,
      docOverflowX: docOver,
      docH: document.documentElement.scrollHeight,
      viewH: document.documentElement.clientHeight,
    };
  })()`);

  /* 再量第二层（选一个大类 + 一个小类） */
  const box = await ev(`(() => { const g=[...document.querySelectorAll('.sector-g')].find(x=>x.getAttribute('data-fam')==='amber');
    const b=g.querySelector('.sector-shape').getBoundingClientRect();
    return {x:Math.round(b.left+b.width/2), y:Math.round(b.top+b.height/2)}; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, button: 'none' });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await sleep(1400);

  const measure2 = await ev(`(() => {
    const wheel = document.querySelector('.wheel').getBoundingClientRect();
    const hub = document.querySelector('.disc-hub').getBoundingClientRect();
    const outOfWheel = (r) => Math.max(0, wheel.left - r.left, r.right - wheel.right,
      wheel.top - r.top, r.bottom - wheel.bottom);
    const back = document.querySelector('.wheel-back');
    const br = back ? back.getBoundingClientRect() : null;
    const lab2 = [...document.querySelectorAll('.disc-sector.lvl2')].map((b) => {
      const r = b.getBoundingClientRect();
      return { sub: b.getAttribute('data-sub'), w: Math.round(r.width), h: Math.round(r.height), outBox: Math.round(outOfWheel(r)) };
    });
    return {
      hub: [Math.round(hub.width), Math.round(hub.height)],
      hubOverflow: [hub.scrollWidth - hub.clientWidth, hub.scrollHeight - hub.clientHeight],
      /* 只选大类时的盘心：文字项数与图标数分开数 —— 裁定要求图标必须为 0，
         两个数放在一起，一眼就能看出"文字有、图标没有"这件事成立。 */
      famTextItems: document.querySelectorAll('.fam-text-item').length,
      famTextSubIcons: document.querySelectorAll('.fam-text .fam-glyph-svg, .fam-text svg').length,
      lvl2: lab2,
      back: br ? {
        cx: Math.round(br.left + br.width / 2 - wheel.left),
        cy: Math.round(br.top + br.height / 2 - wheel.top),
        w: Math.round(br.width), h: Math.round(br.height),
        // 胶囊中心与盘半径的距离比：≈0.492 表示压在盘口线上
        onRim: +(Math.hypot(br.left + br.width / 2 - (wheel.left + wheel.width / 2),
          br.top + br.height / 2 - (wheel.top + wheel.height / 2)) / (wheel.width / 2)).toFixed(3),
        overlapsSub: [...document.querySelectorAll('.disc-sector.lvl2')].some((b) => {
          const r = b.getBoundingClientRect();
          return !(r.right < br.left || r.left > br.right || r.bottom < br.top || r.top > br.bottom);
        }),
      } : null,
      docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  })()`);

  report[w + 'x' + h] = { layer1: measure, layer2: measure2 };
}

console.log(JSON.stringify(report, null, 1));
ws.close();
proc.kill();
process.exit(0);
