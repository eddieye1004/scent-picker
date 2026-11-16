/**
 * probe-dark-tiers.mjs — 深色盘面三处 tier（扇区分块 / 缝 / 盘心浮层）的实测探针
 *
 * 为什么要有它：这三层不是三个独立元素，颜色来源分三处 ——
 *   ① 扇区填充：闭合态走 app.js 的 gFamXxxD 渐变，展开态与场合屏走 CSS
 *   ② 扇区缝：.sector-shape 的 stroke
 *   ③ 盘心面：.disc-hub 的 background
 * 静态读 CSS 只能看到其中一层；另两层的真实取值必须问浏览器。
 *
 * 与 .legs/dark-3layers-finish.json（PR #3 那次的逐层差分实测）的关系：
 *   那边的方法是「逐层关掉 → 截图逐像素差分」，把抗锯齿也算进比值；
 *   这边读**实际生效色**再按 WCAG 相对亮度算，可复算、无截图依赖。
 *   两组数差 ≤0.1、方向一致。判据不依赖哪一种读法：三处都落在
 *   深色方案已有元素（盘面刻线 minor 1.65–1.71）所在的对比带里。
 *
 * 用法：
 *   node server.js 8093
 *   node scripts/probe-dark-tiers.mjs [dark|light] [url]
 *
 * 输出：JSON，闭父态 / 展开态 / 场合屏三个状态下，三层各自的实测色与比值。
 * 依赖：本机 Edge + CDP，不需要 npm 包（与 probe-disc.mjs 同一套）。
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9461 + Number(process.env.TIER_OFFSET || 0);
const SCHEME = (process.argv[2] || 'dark').toLowerCase();
const URL_ = process.argv[3] || 'http://127.0.0.1:8093/';
const PROFILE = path.join(os.tmpdir(), `tier-probe-${Date.now()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, '--no-first-run', '--disable-gpu',
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 60; i++) {
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
  pend.set(i, (x) => (x.error ? rej(new Error(x.error.message)) : res(x.result)));
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
await send('Page.navigate', { url: URL_ });
for (let i = 0; i < 80; i++) { await sleep(250); if (await ev(`!!document.querySelector('.sector-shape')`)) break; }
/* 媒体特性必须在导航**之后**重设一次：Chrome 的 CDP 在部分版本上会随
   导航重置 Emulation 覆盖，先设后导航会得到浅色页面而没有任何报错 ——
   本探针第一版就踩了这个坑（量出来 pageBg 是 #FAF7F1，三处比值全虚高）。
   这里导航后再设一次，并断言 matchMedia 真的报 dark/light，否则直接退出。 */
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: SCHEME }] });
await sleep(400);
{
  const actual = await ev(`matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'`);
  if (actual !== SCHEME) {
    console.error(`媒体特性没生效：期望 ${SCHEME}，页面报 ${actual}`);
    ws.close(); proc.kill(); process.exit(1);
  }
}
await sleep(300);

/* 在页面里把色值归一成 rgb 三元组再算比值。fill 可能是 url("#grad")，
   要顺着 id 取渐变 stop —— 取 0.58 那一档：它是扇区的主体面积所在，
   首末两档各只覆盖一两成，拿它们算会把"厚度"当成主色。 */
const MEASURE = `(() => {
  const toRgb = (s) => {
    if (!s) return null;
    s = String(s).trim();
    if (s === 'transparent' || s === 'none' || s === 'rgba(0, 0, 0, 0)') return null;
    let m = s.match(/^rgba?\\(([^)]+)\\)$/);
    if (m) {
      const p = m[1].split(/[,\\s/]+/).filter(Boolean).map(Number);
      if (p.length >= 3 && (p.length < 4 || p[3] > 0)) return [p[0], p[1], p[2]];
      return null;
    }
    m = s.match(/^#([0-9a-f]{3,8})$/i);
    if (m) {
      let h = m[1];
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    return null;
  };
  const lum = (c) => {
    const f = c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const ratio = (a, b) => {
    const la = lum(a), lb = lum(b);
    return Number(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)).toFixed(3));
  };
  const hex = (c) => c ? '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase() : null;

  const disc = document.querySelector('.disc');
  if (!disc) return { none: true };
  const svg = disc.querySelector('.disc-svg');
  const shape = svg && svg.querySelector('.sector-shape');
  const hub = disc.querySelector('.disc-hub');

  let fillRaw = shape ? (shape.getAttribute('fill') || getComputedStyle(shape).fill) : null;
  let fill = toRgb(fillRaw);
  let fillNote = 'plain';
  /* computed fill 是 url("#gFamCitrusD") —— **带引号**，正则要吃掉引号，
     否则会被当成"不是渐变"而退回 null。 */
  if (!fill && fillRaw && /^url\\(\\s*["']?#/.test(String(fillRaw))) {
    const gid = String(fillRaw).match(/url\\(\\s*["']?#([^"')]+)/)[1];
    const g = svg.querySelector('#' + gid) || document.querySelector('#' + gid);
    if (g) {
      const stops = [...g.querySelectorAll('stop')].map((s) => ({
        off: Number(s.getAttribute('offset')), col: s.getAttribute('stop-color'),
      })).filter((s) => s.col && toRgb(s.col));
      if (stops.length) {
        const mid = stops.reduce((a, b) => (Math.abs(b.off - 0.58) < Math.abs(a.off - 0.58) ? b : a));
        fill = toRgb(mid.col);
        fillNote = gid + ' @' + mid.off + ' = ' + mid.col;
      }
    }
  }

  const stroke = shape ? toRgb(getComputedStyle(shape).stroke) : null;
  const discBg = toRgb(getComputedStyle(disc).backgroundColor) || toRgb(getComputedStyle(document.body).backgroundColor);
  const hubBg = hub ? toRgb(getComputedStyle(hub).backgroundColor) : null;
  const pageBg = toRgb(getComputedStyle(document.body).backgroundColor);

  return {
    step: document.getElementById('app').dataset.step,
    discCls: disc.className,
    discBg: hex(discBg),
    pageBg: hex(pageBg),
    fill: hex(fill), fillNote,
    stroke: hex(stroke),
    strokeW: shape ? getComputedStyle(shape).strokeWidth : null,
    hubBg: hex(hubBg),
    /* 三条判据与 .legs 那份差分实测一一对应：
         L1 填充 vs 盘底 —— 扇区面能不能从盘底里分出来
         L2 缝   vs 填充 —— 六块是不是被切开的两块料
         L3 盘心 vs 盘底 —— 盘心是不是浮在盘上的一层 */
    L1: fill && discBg ? ratio(fill, discBg) : null,
    L2: stroke && fill ? ratio(stroke, fill) : null,
    L3: hubBg && discBg ? ratio(hubBg, discBg) : null,
  };
})()`;

const closed = await ev(MEASURE);
await ev(`(() => { const b = document.querySelector('.disc-sector'); if (b) b.click(); })()`);
await sleep(800);
const open = await ev(MEASURE);

/* 场合屏是另一个 .disc（buildDisc 画的单层盘），色源与本屏不同，也要量。 */
for (let i = 0; i < 6; i++) {
  await ev(`(() => { const b = [...document.querySelectorAll('.actions .btn')].find((x) => /下一步|看推荐/.test(x.textContent)); if (b) b.click(); })()`);
  await sleep(450);
  if (await ev(`document.getElementById('app').dataset.step === 'occasion'`)) break;
}
const occasion = await ev(MEASURE);

console.log(JSON.stringify({ scheme: SCHEME, viewport: '1440x900', closed, open, occasion }, null, 1));
ws.close();
proc.kill();
process.exit(0);
