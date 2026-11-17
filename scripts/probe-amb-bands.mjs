/**
 * probe-amb-bands.mjs — 六轴底噪各自**在屏幕的哪个纵向区带**产生可见变化。
 *
 * 为什么必须分带量：底噪是两条径向渐变（暖光在顶部 at 50% -10%、
 * 冷光在底部 at 50% 110%），所以同一个强度下，"暖"只在页面上半部有像素，
 * "冷"只在下半部有。只量一个区域会得出"某轴完全无效"的错误结论 ——
 * 上一版探针量中部就得出过 warm = 0。
 *
 * 输出：每轴 × 每档 × 每 100px 带的平均绝对差。用途是给截图挑一个
 * "在这个强度下真的看得见"的方向，并把选择依据留成可复算的数字。
 */
import { spawn } from 'node:child_process';
import zlib from 'node:zlib';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9463;
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
  `--user-data-dir=C:/Users/16256/work/.legs/edge-bd-${Date.now()}/`,
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
const gate = await ev(`({ dark: matchMedia('(prefers-color-scheme: dark)').matches })`);
if (gate.dark) { console.log(JSON.stringify({ gate, aborted: true })); ws.close(); proc.kill(); process.exit(2); }

const grab = async () => decodePng(Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'));
const BANDS = [[0, 470], [970, 1440]];
function bandDiff(a, b) {
  const acc = new Map();
  for (let y = 0; y < a.h; y++) {
    const k = Math.floor(y / 100) * 100;
    let s = 0; let n = 0;
    for (let x = 0; x < a.w; x++) {
      if (!BANDS.some(([l, r]) => x >= l && x < r)) continue;
      const i = (y * a.w + x) * a.ch;
      s += Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
      n++;
    }
    if (n) { const p = acc.get(k) || { s: 0, n: 0 }; acc.set(k, { s: p.s + s, n: p.n + n }); }
  }
  const out = {};
  [...acc.entries()].sort((p, q) => p[0] - q[0]).forEach(([k, v]) => { out[k] = +(v.s / v.n).toFixed(2); });
  return out;
}

await ev(`(() => { const a=document.getElementById('app');
  ['--amb-temp','--amb-light','--amb-sat','--amb-strength'].forEach(k=>a.style.setProperty(k,'0')); })()`);
await sleep(700);
const base = await grab();

const AXES = {
  bright: { temp: -0.12, light: 0.86 },
  clean: { temp: -0.36, light: 0.58 },
  warm: { temp: 0.82, light: 0.14 },
  cold: { temp: -0.78, light: -0.3 },
  mysterious: { temp: 0.28, light: -0.74 },
  lazy: { temp: 0.46, light: -0.16 },
};
const out = { gate, rows: [] };
for (const [name, ax] of Object.entries(AXES)) {
  for (const s of [0.34, 0.79]) {
    await ev(`(() => { const a=document.getElementById('app');
      a.style.setProperty('--amb-temp','${(ax.temp * s).toFixed(4)}');
      a.style.setProperty('--amb-light','${(ax.light * s).toFixed(4)}');
      a.style.setProperty('--amb-strength','${s}'); })()`);
    await sleep(1100);
    const bands = bandDiff(base, await grab());
    const vals = Object.values(bands);
    out.rows.push({
      axis: name, strength: s,
      maxBand: Math.max(...vals), meanOfBands: +(vals.reduce((p, q) => p + q, 0) / vals.length).toFixed(2),
      bands,
    });
  }
}
console.log(JSON.stringify(out, null, 2));
ws.close(); proc.kill(); process.exit(0);
