/**
 * probe-disc.mjs — 圆盘实测探针（任务 2 / 任务 4 用）。
 *
 * 为什么这个探针必须存在：场合屏圆盘「看起来还是旧的」这个问题，
 * 病根是**选择器不匹配**——CSS 里那段代码在、D63 的验收数字也是真的，
 * 但它一条都没命中。静态读 CSS 只能证明"文件里有"，证明不了"生效了"。
 * 唯一能下结论的证据是浏览器算出来的 getComputedStyle。
 *
 * 2026-11-11 实测抓到过的真实故障：`#app[data-step="context"]` 里的
 * `context` 在 `be23110` 被改名成 `occasion`，25 条规则静默失效三天。
 *
 * 用法：
 *   node server.js 8093                # 另开一个终端
 *   node scripts/probe-disc.mjs [url]
 *
 * 输出：每个视口 × 明暗 下，各屏 `.disc` 的半径 / 底色 / 投影 / 扇区描边，
 *       以及圆盘底部与吸底动作条的重叠量。全部是运行时值，不是源码推断。
 *
 * 依赖：本机 Edge（Windows 自带）。不需要 npm 包 —— 直接走 CDP WebSocket。
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9451;
const URL_ = process.argv[2] || 'http://127.0.0.1:8093/';
const PROFILE = path.join(os.tmpdir(), `disc-probe-${Date.now()}`);
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
  } catch { /* 还没起来 */ }
  await sleep(250);
}
if (!target) { console.error('CDP 没起来（Edge 路径可用 EDGE_PATH 覆盖）'); proc.kill(); process.exit(1); }

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

/* 走到第 N 屏：靠真实点击，不注入 state —— 注入会绕过 navBar 与进度条，
   量到的可能不是用户真走到的那一屏。 */
async function gotoStep(n) {
  await ev(`(() => { const b = document.querySelector('.disc-sector.lvl1'); if (b) b.click(); })()`);
  await sleep(500);
  for (let i = 0; i < n; i++) {
    await ev(`(() => {
      const b = [...document.querySelectorAll('.btn')].find((x) => /下一步|看推荐/.test(x.textContent));
      if (b) b.click();
    })()`);
    await sleep(430);
  }
}

/* 探针只管两屏：首屏（.disc.wheel）与场合屏（.disc 无 wheel）。
   这两屏是唯一有圆盘的地方，也正是"新旧两套"对照的现场。 */
const CASES = [
  { name: 'family', step: 0, sel: '.disc.wheel' },
  { name: 'occasion', step: 4, sel: '#app .disc:not(.wheel)' },
];
const VIEWS = [[1440, 900], [1366, 768], [390, 844]];
const rows = [];

for (const [W, H] of VIEWS) {
  for (const scheme of ['light', 'dark']) {
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await send('Page.navigate', { url: URL_ });
    for (let i = 0; i < 80; i++) { await sleep(250); if (await ev(`!!document.querySelector('.disc-sector.lvl1')`)) break; }
    await sleep(350);

    for (const c of CASES) {
      if (c.step > 0) await gotoStep(c.step);
      const m = await ev(`(() => {
        const d = document.querySelector(${JSON.stringify(c.sel)});
        if (!d) return { none: true };
        const cs = getComputedStyle(d);
        const hub = d.querySelector('.disc-hub');
        const hv = hub ? getComputedStyle(hub) : null;
        const sec = d.querySelector('.sector-shape');
        const sv = sec ? getComputedStyle(sec) : null;
        const dr = d.getBoundingClientRect();
        const bar = document.querySelector('.actions');
        const br = bar ? bar.getBoundingClientRect() : null;
        const secBottoms = [...d.querySelectorAll('.disc-sector')].map((b) => b.getBoundingClientRect().bottom);
        return {
          radius: cs.borderRadius,
          bg: cs.backgroundColor,
          shadow: cs.boxShadow === 'none' ? 'none' : 'has',
          hubRadius: hv ? hv.borderRadius : null,
          hubPad: hv ? hv.padding : null,
          strokeW: sv ? sv.strokeWidth : null,
          strokeColor: sv ? sv.stroke : null,
          width: Math.round(dr.width),
          discBottom: Math.round(dr.bottom),
          barTop: br ? Math.round(br.top) : null,
          overlap: br ? Math.round(dr.bottom - br.top) : null,
          labelHidden: br ? secBottoms.some((b) => b > br.top) : null,
        };
      })()`);
      rows.push({ viewport: `${W}x${H}`, scheme, screen: c.name, ...m });
      /* 从第 4 屏回第 0 屏不可能靠 prev 循环，重开一局最省事 */
      if (c.step > 0) {
        await send('Page.navigate', { url: URL_ });
        for (let i = 0; i < 80; i++) { await sleep(200); if (await ev(`!!document.querySelector('.disc-sector.lvl1')`)) break; }
        await sleep(250);
      }
    }
  }
}

console.table(rows);
ws.close(); proc.kill();
process.exit(0);
