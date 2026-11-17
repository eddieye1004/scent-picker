/**
 * probe-amb-light.mjs — 在**确定是浅色**的前提下，量六族底噪各自改变了多少像素。
 *
 * 上一版探针的坑：它没验证 prefers-color-scheme 是否真的生效，结果量到的是
 * 深色配方（::after 的背景取到 rgb(20,18,14)），整屏都在变，数字全部虚高。
 * 这里先把 matchMedia 的结果打出来当门禁 —— 门禁不过就直接退出，
 * 不产出会误导人的数字。
 *
 * 量法：只统计盘以外的两条边带（盘自身会随选中态变化，算进来会把
 * "选中反馈"误记成"底噪"），报每族相对未选态的
 * (a) 平均绝对差、(b) 最大单通道差、(c) 差>=1 的像素数。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9459;
const URL_ = process.env.SHOT_URL || 'http://127.0.0.1:8157/';
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
  `--user-data-dir=C:/Users/16256/work/.legs/edge-lt-${Date.now()}/`,
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
/* 先设 emulated media 再导航，导航后**再设一次**：实测只设一次时，
   页面导航会把媒体特性重置回宿主默认（这次宿主是深色）。 */
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
await send('Page.navigate', { url: URL_ });
for (let i = 0; i < 100; i++) { await sleep(200); if (await ev(`!!document.querySelector('.disc-sector.lvl1')`)) break; }
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
await sleep(900);

const gate = await ev(`({
  dark: matchMedia('(prefers-color-scheme: dark)').matches,
  light: matchMedia('(prefers-color-scheme: light)').matches,
  bodyBg: getComputedStyle(document.body).backgroundColor,
})`);
if (gate.dark || !gate.light) {
  console.log(JSON.stringify({ gate, aborted: '不是浅色模式，拒绝产出会误导人的数字' }, null, 2));
  ws.close(); proc.kill(); process.exit(2);
}

const grab = async () => decodePng(Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'));
const BANDS = [[0, 470], [970, 1440]];
function diff(a, b) {
  let sum = 0; let n = 0; let maxd = 0; let ge1 = 0;
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      if (!BANDS.some(([l, r]) => x >= l && x < r)) continue;
      const i = (y * a.w + x) * a.ch;
      const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
      sum += d; n++;
      if (d > maxd) maxd = d;
      if (d >= 1) ge1++;
    }
  }
  return { meanDelta: +(sum / n).toFixed(3), maxChannelDelta: maxd, pixelsChanged: ge1, sampled: n };
}

const base = await grab();
const out = { gate, rows: [] };
const fams = await ev(`[...document.querySelectorAll('.sector-g')].map(g => g.getAttribute('data-fam'))`);
for (let i = 0; i < fams.length; i++) {
  await ev(`(() => { const g = document.querySelectorAll('.sector-g')[${i}]; g.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`);
  await sleep(1000);
  const st = await ev(`(() => { const a=document.getElementById('app'); const cs=getComputedStyle(a);
    const w=document.querySelector('.amb-wash'); const ws2=w&&getComputedStyle(w); const af=w&&getComputedStyle(w,'::after');
    return { amb: a.dataset.amb, strength: cs.getPropertyValue('--amb-strength').trim(),
      temp: cs.getPropertyValue('--amb-temp').trim(), light: cs.getPropertyValue('--amb-light').trim(),
      washOpacity: ws2&&ws2.opacity, afterOpacity: af&&af.opacity }; })()`);
  out.rows.push({ family: fams[i], ...st, ...diff(base, await grab()) });
}
console.log(JSON.stringify(out, null, 2));
ws.close(); proc.kill(); process.exit(0);
