/**
 * probe-hubfit2.mjs — 盘心溢出复测（可在任意 worktree 上跑）
 *   node probe-hubfit2.mjs <port> [tag]
 * 只量三件事：盘心内容是否被裁（overflowY/X）、标本盒四角是否越出盘心圆、
 * 以及标本盒的下沿是否压到盘心边界。
 */
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9461;
const TARGET_PORT = process.argv[2] || '8088';
const TAG = process.argv[3] || '';
const URL_ = `http://127.0.0.1:${TARGET_PORT}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/16256/work/.legs/edge-fit2-${Date.now()}/`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,980', 'about:blank'], { stdio: 'ignore' });
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
  if (r.exceptionDetails) return '__ERR__' + (r.exceptionDetails.exception?.description || '').slice(0, 200);
  return r.result.value;
};
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });

const VIEWS = [[1440, 980], [768, 900], [390, 844], [360, 780]];
const rows = [];
for (const [w, h] of VIEWS) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  await send('Page.navigate', { url: URL_ });
  for (let i = 0; i < 60; i++) { await sleep(200); if (await ev(`!!document.querySelector('.disc-sector.lvl1')`)) break; }
  await sleep(1400);
  for (const fam of ['citrus', 'amber', 'floral']) {
    await ev(`(() => { const g = document.querySelector('.sector-g[data-fam="${fam}"]');
      if (g) g.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`);
    await sleep(1300);
    for (const stage of ['fam', 'sub']) {
      if (stage === 'sub') {
        await ev(`(() => { const b = document.querySelector('.disc-sector.lvl2');
          if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`);
        await sleep(900);
      }
      const m = await ev(`(() => {
        const hub = document.querySelector('.disc-hub');
        const plate = document.querySelector('.hub-plate');
        const hr = hub.getBoundingClientRect();
        const pr = plate ? plate.getBoundingClientRect() : null;
        const cx = hr.left + hr.width / 2, cy = hr.top + hr.height / 2;
        const corners = pr ? [[pr.left, pr.top], [pr.right, pr.top], [pr.left, pr.bottom], [pr.right, pr.bottom]]
          .map(([x, y]) => Math.hypot(x - cx, y - cy)) : [];
        return {
          ovY: hub.scrollHeight - hub.clientHeight, ovX: hub.scrollWidth - hub.clientWidth,
          hubW: +hr.width.toFixed(1), hubH: +hr.height.toFixed(1),
          plate: pr ? { w: +pr.width.toFixed(1), h: +pr.height.toFixed(1) } : null,
          insetB: pr ? +(hr.bottom - pr.bottom).toFixed(1) : null,
          outC: corners.length ? +(Math.max(...corners) - hr.width / 2).toFixed(1) : null,
        };
      })()`);
      rows.push({ view: `${w}x${h}`, fam, stage, ...m });
    }
  }
}
console.log(`### ${TAG || URL_}`);
for (const r of rows) {
  console.log(`${r.view.padEnd(10)} ${r.fam.padEnd(7)} ${r.stage.padEnd(4)} ovY=${String(r.ovY).padStart(3)} ovX=${String(r.ovX).padStart(3)} outC=${String(r.outC).padStart(7)} plate=${r.plate ? r.plate.w + 'x' + r.plate.h : '-'} insetB=${r.insetB}`);
}
ws.close(); proc.kill(); process.exit(0);
