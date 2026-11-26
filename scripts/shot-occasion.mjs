/**
 * shot-occasion.mjs — 场合屏竖向时间轴（redesign-leg3-20261126）的实测与截图
 *
 * 验收集（任务书）：
 *   ① 390×844 整屏无滚动：页头 ≤160px、五行 × 64px = 320px、底栏 72px；
 *   ② 轴线竖向天光渐变；选中段从中心向两端亮起（scaleY 0→1，260ms）；
 *   ③ 方向键上下移动选择；roving tabindex 永远指向当前选中项；
 *   ④ 屏内只有标题 + 底栏一句「不选也能继续」；sticky 题头已撤 ——
 *      在矮视口（390×600，可滚）里滚动后题头必须跟着滚走，不贴顶。
 *
 * 走法与 shot-season.mjs 同一套纪律：按内容找控件（data-fam / data-step /
 * data-occ），不数「下一步」点击次数；截图前把实测数字打印出来当证据。
 *
 * 用法：
 *   node server.js 8199 &
 *   node scripts/shot-occasion.mjs --out=<shots目录> --url=http://127.0.0.1:8199/
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => {
  const hit = process.argv.find((x) => x.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const OUT = path.resolve(arg('out', '.legs/occasion-shots'));
const URL_ = arg('url', 'http://127.0.0.1:8199/');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9660 + Math.floor(Math.random() * 40);
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(OUT, `.edge-${Date.now()}`)}`, '--no-first-run',
  '--disable-gpu', '--hide-scrollbars', '--disable-extensions',
  '--disable-component-extensions-with-background-pages',
  '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });

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
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(OUT, name + '.png');
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  return file;
};
const setViewport = (w, h) => send('Emulation.setDeviceMetricsOverride', {
  width: w, height: h, deviceScaleFactor: 2, mobile: true,
});

const report = { checks: [] };
const check = (name, ok, detail) => {
  report.checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail != null ? ' — ' + JSON.stringify(detail) : ''}`);
};

await send('Page.enable');
await send('Runtime.enable');
await setViewport(390, 844);
await send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-color-scheme', value: 'light' }],
});
await send('Page.navigate', { url: URL_ });

/* 等首屏圆盘画出来。 */
for (let i = 0; i < 160; i++) {
  if (await ev(`!!document.querySelector('.sector-g')`)) break;
  await sleep(120);
}
await sleep(500);

/* ① 选方向（woody），再按 data-step 走到场合屏。 */
await ev(`(() => {
  const g = [...document.querySelectorAll('.sector-g')]
    .find((x) => x.getAttribute('data-fam') === 'woody');
  if (g) g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
})()`);
await sleep(700);
let hops = 0;
while (hops < 8) {
  const step = await ev(`document.getElementById('app').dataset.step`);
  if (step === 'occasion') break;
  await ev(`(() => {
    const b = [...document.querySelectorAll('.actions .btn')]
      .find((x) => /下一步|看推荐/.test(x.textContent));
    if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  })()`);
  await sleep(520);
  hops++;
}
if (await ev(`document.getElementById('app').dataset.step`) !== 'occasion') {
  console.error('没走到场合屏'); proc.kill(); process.exit(1);
}
await sleep(500);

/* ② 390×844 几何验收。 */
const geo = await ev(`(() => {
  const day = document.querySelector('.occ-day');
  const rail = document.querySelector('.occ-rail');
  const acts = document.querySelector('.actions');
  const stops = [...document.querySelectorAll('.occ-stop')];
  return {
    step: document.getElementById('app').dataset.step,
    headerH: Math.round(day.getBoundingClientRect().top),
    railH: Math.round(rail.getBoundingClientRect().height),
    rowHs: stops.map((s) => Math.round(s.getBoundingClientRect().height)),
    actionsH: Math.round(acts.getBoundingClientRect().height),
    pageH: document.documentElement.scrollHeight,
    viewport: [innerWidth, innerHeight],
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    order: stops.map((s) => s.getAttribute('data-occ')),
    times: stops.map((s) => s.querySelector('.occ-time').textContent),
    icons16: stops.every((s) => {
      const i = s.querySelector('.occ-ico');
      return i && Math.round(i.getBoundingClientRect().width) === 16;
    }),
    titleOnly: !document.querySelector('#app .q-kicker') && !document.querySelector('#app .q-help')
      && !document.querySelector('#app .hour-gloss') && !document.querySelector('#app .term-note'),
    hintCount: document.getElementById('app').textContent.split('不选也能继续').length - 1,
    axisBg: getComputedStyle(document.querySelector('.occ-axis')).backgroundImage,
  };
})()`);
report.geo390 = geo;
check('390 页头 ≤160px', geo.headerH <= 160, geo.headerH);
check('五行各 64px、共 320px', geo.railH === 320 && geo.rowHs.every((h) => h === 64), geo.rowHs);
check('底栏 72px', geo.actionsH === 72, geo.actionsH);
check('390×844 整屏无滚动', geo.pageH <= 844, { pageH: geo.pageH });
check('无横向溢出', geo.scrollW <= geo.clientW, [geo.scrollW, geo.clientW]);
check('顺序 commute→daily→outdoor→date→formal',
  geo.order.join(',') === 'commute,daily,outdoor,date,formal', geo.order);
check('时刻递增且图标 16px', geo.times.join(',') === '08:00,12:00,15:00,19:00,21:00' && geo.icons16, geo.times);
check('屏内只有标题 + 底栏一句', geo.titleOnly && geo.hintCount === 1, { hintCount: geo.hintCount });
/* computed style 会把默认 180deg 序列化省略 —— 竖向 = 无角度且无横向关键词。
   源 CSS 的 180deg 由 test-render 钉住。 */
check('轴是竖向渐变', geo.axisBg.startsWith('linear-gradient(') && !/90deg|to right|to left/.test(geo.axisBg), geo.axisBg.slice(0, 80));
report.shots = [];
report.shots.push(await shot('leg3-occasion-390-idle'));

/* ③ 选中「约会」：亮段 260ms 从中心向两端。 */
await ev(`(() => {
  const b = [...document.querySelectorAll('.occ-stop')]
    .find((x) => x.getAttribute('data-occ') === 'date');
  b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
})()`);
await sleep(120);
const midAnim = await ev(`(() => {
  const seg = document.querySelector('.occ-stop.is-on .occ-seg');
  const cs = getComputedStyle(seg);
  return { transform: cs.transform, duration: cs.transitionDuration, origin: cs.transformOrigin };
})()`);
await sleep(400);
const sel = await ev(`(() => {
  const on = [...document.querySelectorAll('.occ-stop.is-on')];
  const seg = document.querySelector('.occ-stop.is-on .occ-seg');
  return {
    onCount: on.length,
    onId: on[0] ? on[0].getAttribute('data-occ') : null,
    ariaChecked: on[0] ? on[0].getAttribute('aria-checked') : null,
    segTransform: getComputedStyle(seg).transform,
    tabbable: [...document.querySelectorAll('.occ-stop')].map((s) => s.getAttribute('tabindex')),
  };
})()`);
report.selection = { midAnim, sel };
/* origin 50% 50% 在 4×64 的亮段上序列化为 "2px 32px" —— 就是中心。 */
check('选中段 260ms、origin 居中', midAnim.duration === '0.26s' && midAnim.origin === '2px 32px', midAnim);
check('亮起完成 scaleY(1)（matrix 纵向=1）', /matrix\(1,\s*0,\s*0,\s*1,/.test(sel.segTransform), sel.segTransform);
check('恰好一站选中（date）', sel.onCount === 1 && sel.onId === 'date' && sel.ariaChecked === 'true', sel);
check('Tab 落点=选中项（其余 -1）', sel.tabbable.join(',') === '-1,-1,-1,0,-1', sel.tabbable);
report.shots.push(await shot('leg3-occasion-390-selected'));

/* ④ 键盘：ArrowDown / ArrowUp 移动选择；焦点离开再回（roving）。 */
await ev(`document.querySelector('.occ-stop.is-on').focus()`);
await ev(`document.querySelector('.occ-stop.is-on').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))`);
await sleep(350);
const kd = await ev(`(() => {
  const on = document.querySelector('.occ-stop.is-on');
  return { id: on.getAttribute('data-occ'), focused: document.activeElement === on,
    tabbable: [...document.querySelectorAll('.occ-stop')].map((s) => s.getAttribute('tabindex')) };
})()`);
check('ArrowDown → formal 且焦点跟随', kd.id === 'formal' && kd.focused, kd);
await ev(`document.querySelector('.occ-stop.is-on').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))`);
await sleep(350);
const ku = await ev(`document.querySelector('.occ-stop.is-on').getAttribute('data-occ')`);
check('ArrowUp → 回到 date', ku === 'date', ku);
await ev(`document.activeElement.blur()`);
const reentry = await ev(`(() => {
  const zero = [...document.querySelectorAll('.occ-stop')].filter((s) => s.getAttribute('tabindex') === '0');
  return { count: zero.length, id: zero[0] ? zero[0].getAttribute('data-occ') : null };
})()`);
check('焦点离开后组内唯一 Tab 落点仍是选中项', reentry.count === 1 && reentry.id === 'date', reentry);

/* ⑤ 反复点选稳定性：连点五站，始终恰好一站 is-on、五段亮光节点不增生。 */
const stable = await ev(`(async () => {
  const ids = ['commute', 'daily', 'outdoor', 'date', 'formal', 'daily'];
  for (const id of ids) {
    const b = [...document.querySelectorAll('.occ-stop')].find((x) => x.getAttribute('data-occ') === id);
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
  }
  return {
    onCount: document.querySelectorAll('.occ-stop.is-on').length,
    onId: document.querySelector('.occ-stop.is-on').getAttribute('data-occ'),
    segCount: document.querySelectorAll('.occ-seg').length,
    stopCount: document.querySelectorAll('.occ-stop').length,
  };
})()`);
check('连点六次后仍恰好一站选中、节点不增生',
  stable.onCount === 1 && stable.onId === 'daily' && stable.segCount === 5 && stable.stopCount === 5, stable);

/* ⑥ 灰度对照：场合（竖向时间轴）vs 季节（本树仍是温度光带）。 */
await ev(`document.documentElement.style.filter = 'grayscale(1)'`);
await sleep(150);
report.shots.push(await shot('leg3-occasion-390-gray'));
await ev(`(() => {
  const b = [...document.querySelectorAll('.actions .btn')].find((x) => /下一步/.test(x.textContent));
  b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
})()`);
await sleep(600);
report.shots.push(await shot('leg3-season-390-gray'));
await ev(`document.documentElement.style.filter = ''`);

/* ⑦ sticky 已撤：矮视口（390×600）可滚，滚动后题头必须跟着滚走。 */
await ev(`(() => {
  const b = [...document.querySelectorAll('.actions .btn')].find((x) => /上一题/.test(x.textContent));
  b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
})()`);
await sleep(600);
await setViewport(390, 600);
await sleep(300);
const scrollProbe = await ev(`(() => {
  window.scrollTo(0, 200);
  const t = document.querySelector('.q-title');
  const r = t.getBoundingClientRect();
  return {
    step: document.getElementById('app').dataset.step,
    scrollY: Math.round(scrollY),
    titleTop: Math.round(r.top),
    stickyCount: [...document.querySelectorAll('#app *')]
      .filter((n) => getComputedStyle(n).position === 'sticky' && !n.classList.contains('actions')).length,
    pageH: document.documentElement.scrollHeight,
  };
})()`);
report.scrollProbe = scrollProbe;
check('矮视口可滚且题头不贴顶（sticky 已撤）',
  scrollProbe.scrollY > 0 && scrollProbe.titleTop < 0 && scrollProbe.stickyCount === 0, scrollProbe);
report.shots.push(await shot('leg3-occasion-390x600-scrolled'));

/* ⑧ 320 窄屏与 1440 桌面：无横向溢出、无运行时错。 */
await ev(`window.scrollTo(0, 0)`);
await setViewport(320, 568);
await sleep(300);
await ev(`window.scrollTo(0, 0)`);
const w320 = await ev(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`);
check('320 宽无横向溢出', w320.sw <= w320.cw, w320);
report.shots.push(await shot('leg3-occasion-320'));
await setViewport(1440, 900);
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(300);
await ev(`window.scrollTo(0, 0)`);
const w1440 = await ev(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
  railH: Math.round(document.querySelector('.occ-rail').getBoundingClientRect().height) })`);
check('1440 桌面无横向溢出、轴仍 320px', w1440.sw <= w1440.cw && w1440.railH === 320, w1440);
report.shots.push(await shot('leg3-occasion-1440'));

const errs = await ev(`window.__leg3Errors || []`);
report.runtimeErrors = errs;
const fails = report.checks.filter((c) => !c.ok);
console.log(`\n${fails.length === 0 ? 'ALL PASS' : 'FAIL ' + fails.length} （${report.checks.length} 项）`);
fs.writeFileSync(path.join(OUT, 'leg3-report.json'), JSON.stringify(report, null, 2));
ws.close(); proc.kill();
process.exit(fails.length === 0 ? 0 : 1);