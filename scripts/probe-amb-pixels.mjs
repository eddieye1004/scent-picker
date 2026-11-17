/**
 * probe-amb-pixels.mjs — 底噪到底"可见到什么程度"的像素级测量。
 *
 * 为什么需要它：任务书要求截图②"能看出底噪已点燃"。截图只能说明"我看着像有/没有"，
 * 说明不了差多少、也说明不了是哪一轴没表达。这里在**同一屏、同一个位置**
 * 取三组像素（未选 / 选木质调 / 选柑橘调），逐通道求差 ——
 * 差值为 0 就是"这一轴在当前配方下不产生任何可见变化"。
 *
 * 采样点选在盘的左侧空白（x=120,y=250）：那里没有文字、没有图形，
 * 只有纸面与底噪，量的就是底噪本身。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9455;
const URL_ = process.env.SHOT_URL || 'http://127.0.0.1:8080/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 极简 PNG 解码：只处理 8bit RGB/RGBA、无隔行 —— CDP 截出来就是这种。 */
function decodePng(buf) {
  let pos = 8;
  let w = 0;
  let h = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) throw new Error(`unsupported PNG ${bitDepth}/${colorType}`);
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
  return { w, h, ch, data: out, at(x, y) { const i = (y * w + x) * ch; return [out[i], out[i + 1], out[i + 2]]; } };
}

const proc = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/16256/work/.legs/edge-px-${Date.now()}/`,
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
/* 必须显式指定浅色：headless 默认可能是深色，而深色配方是另一套数字
   （90-quiz-v6.css 的 dark 段强度再乘 0.6），混着量会得出错误结论。 */
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
await send('Page.navigate', { url: URL_ });
for (let i = 0; i < 100; i++) { await sleep(200); if (await ev(`!!document.querySelector('.disc-sector.lvl1')`)) break; }
await sleep(800);

const grab = async () => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  return decodePng(Buffer.from(r.data, 'base64'));
};
const points = [[120, 300], [1320, 300], [120, 700], [720, 120]];
const readPoints = (img) => points.map(([x, y]) => img.at(x, y));

const results = { points, rows: [] };

const snap = async (label) => {
  const img = await grab();
  const state = await ev(`(() => { const a=document.getElementById('app'); const cs=getComputedStyle(a);
    return { amb: a.dataset.amb, strength: cs.getPropertyValue('--amb-strength').trim(),
             temp: cs.getPropertyValue('--amb-temp').trim(), light: cs.getPropertyValue('--amb-light').trim(),
             hub: (document.querySelector('.hub-zh')||{}).textContent || null }; })()`);
  results.rows.push({ label, ...state, pixels: readPoints(img) });
};

await snap('idle-未选');

/* 依次点外圈六个扇区，每次都拍一组像素 —— 这样"哪几轴可见"是一次量完的，
   不是靠挑一个好看的方向截一张。 */
const fams = await ev(`[...document.querySelectorAll('.sector-g')].map(g => g.getAttribute('data-fam'))`);
for (let i = 0; i < fams.length; i++) {
  await ev(`(() => { const g = document.querySelectorAll('.sector-g')[${i}]; g.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`);
  await sleep(900);
  await snap(`${fams[i]}`);
}

console.log(JSON.stringify(results, null, 2));
ws.close(); proc.kill(); process.exit(0);
