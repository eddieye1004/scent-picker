/**
 * probe-amb-delta.mjs — 底噪三轴各自"到底改变了多少像素"。
 *
 * 前一个探针（probe-amb-pixels.mjs）只在四个点上采样，得出"六个家族像素完全相同"
 * 这个结论，但那个结论可能是采样点选错了（径向渐变只在带的范围内可见）。
 * 这里改成**全图逐像素求差**：同一次会话里先拍一张未选态作基线，
 * 再逐族点击，逐族与基线比，报 (a) 最大单通道差、(b) 差 >= 2 的像素数、
 * (c) 差 >= 2 的像素落在哪几个纵向分带（每 100px 一带）。
 *
 * 判据：若某族的三个数全是 0，说明这一轴在当前配方下**不产生任何可见变化** ——
 * 那不是"底噪很淡"，是"底噪没画出来"，两者的修法完全不同。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9457;
const URL_ = process.env.SHOT_URL || 'http://127.0.0.1:8080/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodePng(buf) {
  let pos = 8; let w = 0; let h = 0; let bitDepth = 0; let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
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
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
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
  `--user-data-dir=C:/Users/16256/work/.legs/edge-dt-${Date.now()}/`,
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
await sleep(900);

const grab = async () => decodePng(Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'));

/* 只比"盘以外"的像素：盘本身会随选中态变化（盘心文字、弧段填色），
   把它算进来会把"盘的选中反馈"误记成"底噪"。盘占据中央 470–970 × 300–800，
   所以只统计左右两条边带。 */
const BANDS = [[0, 470], [970, 1440]];
function diff(a, b) {
  let maxd = 0; let n2 = 0; let n1 = 0;
  const rows = new Map();
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      if (!BANDS.some(([l, r]) => x >= l && x < r)) continue;
      const i = (y * a.w + x) * a.ch;
      const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
      if (d > maxd) maxd = d;
      if (d >= 1) n1++;
      if (d >= 2) { n2++; const k = Math.floor(y / 100) * 100; rows.set(k, (rows.get(k) || 0) + 1); }
    }
  }
  return { maxChannelDelta: maxd, pixelsGe1: n1, pixelsGe2: n2, byBand: Object.fromEntries([...rows.entries()].sort((p, q) => p[0] - q[0])) };
}

const base = await grab();
const out = { url: URL_, baseline: 'family 未选', rows: [] };
const fams = await ev(`[...document.querySelectorAll('.sector-g')].map(g => g.getAttribute('data-fam'))`);
for (let i = 0; i < fams.length; i++) {
  await ev(`(() => { const g = document.querySelectorAll('.sector-g')[${i}]; g.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`);
  await sleep(1000);
  const st = await ev(`(() => { const a=document.getElementById('app'); const cs=getComputedStyle(a);
    const w=document.querySelector('.amb-wash'); const ws2=w?getComputedStyle(w):null; const af=w?getComputedStyle(w,'::after'):null;
    return { amb: a.dataset.amb, strength: cs.getPropertyValue('--amb-strength').trim(),
      temp: cs.getPropertyValue('--amb-temp').trim(), light: cs.getPropertyValue('--amb-light').trim(),
      washOpacity: ws2&&ws2.opacity, afterOpacity: af&&af.opacity, afterBg: af&&af.backgroundColor }; })()`);
  out.rows.push({ family: fams[i], ...st, ...diff(base, await grab()) });
}
console.log(JSON.stringify(out, null, 2));
ws.close(); proc.kill(); process.exit(0);
