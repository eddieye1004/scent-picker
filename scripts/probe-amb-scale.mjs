/**
 * probe-amb-scale.mjs — 底噪在**不动任何 DOM**的前提下，到底改变了多少像素。
 *
 * 为什么不能靠点击来量：点一次香型会让下方详情面板展开（bodyH 1460→1644），
 * 整页重排，逐像素差里混进的全是"文字挪了位置"，量到的不是底噪。
 * 这里改成只改 #app 上的三个 CSS 变量、不点任何东西 —— 这样两帧之间
 * 唯一的差别就是底噪层本身。
 *
 * 采样区：盘左外侧的纯纸面（x 100–420, y 380–820）。那里没有文字、
 * 没有图形，也没有任何随状态变化的元素。
 */
import { spawn } from 'node:child_process';
import zlib from 'node:zlib';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9461;
const URL_ = process.env.SHOT_URL || 'http://127.0.0.1:8080/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodePng(buf) {
  let pos = 8; let w = 0; let h = 0; let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const ch = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const prev = y ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.slice(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 0xff;
    }
  }
  return { w, h, ch, data: out };
}

const proc = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/16256/work/.legs/edge-sc-${Date.now()}/`,
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
  if (r.exceptionDetails) return '__ERR__' + (r.exceptionDetails.exception?.description || '').slice(0, 200);
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
await send('Page.navigate', { url: URL_ });
for (let i = 0; i < 100; i++) { await sleep(200); if (await ev(`!!document.querySelector('.disc-sector.lvl1')`)) break; }
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
await sleep(900);

const gate = await ev(`({ dark: matchMedia('(prefers-color-scheme: dark)').matches, light: matchMedia('(prefers-color-scheme: light)').matches })`);
if (gate.dark || !gate.light) { console.log(JSON.stringify({ gate, aborted: true })); ws.close(); proc.kill(); process.exit(2); }

const grab = async () => decodePng(Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'));
const REGION = { x0: 100, x1: 420, y0: 380, y1: 820 };
function diff(a, b) {
  let sum = 0; let n = 0; let maxd = 0; let ge2 = 0;
  for (let y = REGION.y0; y < REGION.y1; y++) {
    for (let x = REGION.x0; x < REGION.x1; x++) {
      const i = (y * a.w + x) * a.ch;
      const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
      sum += d; n++; if (d > maxd) maxd = d; if (d >= 2) ge2++;
    }
  }
  return { meanDelta: +(sum / n).toFixed(3), maxChannelDelta: maxd, pixelsGe2: ge2, sampled: n };
}

/* 基线：三轴归零（未选大方向） */
await ev(`(() => { const a=document.getElementById('app');
  a.style.setProperty('--amb-temp','0'); a.style.setProperty('--amb-light','0');
  a.style.setProperty('--amb-sat','0'); a.style.setProperty('--amb-strength','0'); })()`);
await sleep(700);
const base = await grab();

/* 逐轴 × 逐档：只改变量，不动 DOM */
const AXES = {
  bright: { temp: -0.12, light: 0.86 },
  clean: { temp: -0.36, light: 0.58 },
  warm: { temp: 0.82, light: 0.14 },
  cold: { temp: -0.78, light: -0.30 },
  mysterious: { temp: 0.28, light: -0.74 },
  lazy: { temp: 0.46, light: -0.16 },
};
const out = { gate, region: REGION, rows: [] };
for (const [name, ax] of Object.entries(AXES)) {
  for (const s of [0.34, 0.79]) {
    await ev(`(() => { const a=document.getElementById('app');
      a.style.setProperty('--amb-temp','${(ax.temp * s).toFixed(4)}');
      a.style.setProperty('--amb-light','${(ax.light * s).toFixed(4)}');
      a.style.setProperty('--amb-strength','${s}'); })()`);
    await sleep(1100);  /* .amb-wash 有 .9s transition，等它走完 */
    out.rows.push({ axis: name, strength: s, ...diff(base, await grab()) });
  }
}
console.log(JSON.stringify(out, null, 2));
ws.close(); proc.kill(); process.exit(0);
