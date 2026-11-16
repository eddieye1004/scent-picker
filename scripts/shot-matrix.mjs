/**
 * shot-matrix.mjs — 本腿要交的截图矩阵（问卷全流程 + 结果页 + 深色 tier 前后）
 *
 * 为什么单独写一个而不是复用 probe-shot.mjs：那份只认「第 N 屏」一个下标，
 * 而本轮要的是「同一个状态下、明暗 × 桌面移动四个组合、逐屏都要」，
 * 并且必须**真走一遍问卷**再截结果页（注入 state 会绕过 navBar 与进度条，
 * 截到的屏可能与用户真走到的不是同一张 —— probe-print 那次踩过）。
 *
 * 用法：
 *   node server.js 8111
 *   node scripts/shot-matrix.mjs <outDir> <url> [prefix]
 *
 * 输出：outDir 下按 `<prefix><scheme>-<viewport>-<step>.png` 命名，并打一份
 * 同样内容的 manifest.json（每一步的标题、指针位置、可见卡片数等实测值）。
 * 依赖：本机 Edge + CDP，不需要 npm 包。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = process.argv[2];
const URL_ = process.argv[3] || 'http://127.0.0.1:8111/';
const PREFIX = process.argv[4] || '';
if (!OUT) { console.error('用法：node scripts/shot-matrix.mjs <outDir> [url] [prefix]'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const PORT = 9561 + Number(process.env.SHOT_OFFSET || 0);
const PROFILE = path.join(os.tmpdir(), `shotmatrix-${Date.now()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEWPORTS = [
  { id: 'desktop', w: 1440, h: 900, mobile: false },
  { id: 'mobile', w: 390, h: 844, mobile: true },
];
const SCHEMES = ['light', 'dark'];

const proc = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars',
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
  if (r.exceptionDetails) return '__ERR__' + (r.exceptionDetails.exception?.description || '').slice(0, 160);
  return r.result.value;
};
const shot = async (file) => {
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
  return fs.statSync(file).size;
};

await send('Page.enable');
await send('Runtime.enable');

const manifest = [];
const setScheme = (scheme) => send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-color-scheme', value: scheme }],
});

for (const vp of VIEWPORTS) {
  for (const scheme of SCHEMES) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile,
    });
    await send('Page.navigate', { url: URL_ });
    for (let i = 0; i < 80; i++) { await sleep(250); if (await ev(`!!document.querySelector('.disc-sector, .choice')`)) break; }
    /* 导航后再设一次媒体特性 —— 先设后导航会被重置（本仓库 probe-print 踩过）。 */
    await setScheme(scheme);
    await sleep(400);
    const mm = await ev(`matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'`);
    if (mm !== scheme) { console.error(`媒体特性没生效 ${scheme}→${mm}`); process.exit(1); }
    await sleep(300);

    /* 逐屏：先截当前屏，再点「下一步」，直到出现结果页。 */
    let guard = 0;
    let resultShot = null;
    let seq = 0;
    const seenSteps = new Map();
    while (guard++ < 16) {
      const info = await ev(`(() => {
        const app = document.getElementById('app');
        const title = (document.querySelector('.q-title') || document.querySelector('.result-head h2') || {}).textContent || '';
        const kicker = (document.querySelector('.q-kicker') || {}).textContent || '';
        const disc = document.querySelector('.disc');
        return {
          step: app.dataset.step,
          title: title.trim(),
          kicker: kicker.trim(),
          isResult: app.dataset.step === 'result',
          bodyH: document.documentElement.scrollHeight,
          picks: document.querySelectorAll('.pick').length,
          /* 圆盘状态是「家族环是否展开」——首屏会先截一张闭合、再截一张展开，
             两张都叫 -family.png 会互相覆盖，所以要带状态后缀。 */
          discOpen: disc ? disc.classList.contains('is-open') : null,
          btnLabels: [...document.querySelectorAll('.actions .btn')].map((b) => b.textContent.trim()),
        };
      })()`);
      /* 同一步出现两次时加序号后缀，否则后一张会覆盖前一张。
         首屏就是这种情况：闭合态（未选）与展开态（选完大类）都要留证。 */
      seq += 1;
      const dup = seenSteps.get(info.step) || 0;
      seenSteps.set(info.step, dup + 1);
      const suffix = dup ? `-${dup + 1}` : '';
      const name = `${PREFIX}${scheme}-${vp.id}-${info.step}${suffix}.png`;
      const bytes = await shot(path.join(OUT, name));
      manifest.push({ scheme, viewport: vp.id, w: vp.w, h: vp.h, file: name, bytes, seq, ...info });
      if (info.isResult) { resultShot = name; break; }

      const clicked = await ev(`(() => {
        const acts = document.querySelector('.actions');
        if (!acts) return false;
        /* 优先点「下一步 / 看推荐」；没有时点那一屏的主选项（点选即前进的屏）。
           顺序很重要：先按钮、后选项 —— 反过来会在有按钮的屏上误点选项。 */
        const btn = [...acts.querySelectorAll('button.btn')]
          .find((b) => !b.disabled && /下一步|看推荐/.test(b.textContent));
        if (btn) { btn.click(); return 'btn'; }
        return false;
      })()`);
      if (!clicked) {
        /* 首屏没有可用的「下一步」（未选香型）：点第一个扇区再走。 */
        await ev(`(() => { const b = document.querySelector('.disc-sector'); if (b) b.click(); })()`);
      }
      await sleep(650);
    }
    if (!resultShot) manifest.push({ scheme, viewport: vp.id, note: '结果页没走到', guard });
  }
}

fs.writeFileSync(path.join(OUT, `${PREFIX}manifest.json`), JSON.stringify(manifest, null, 1));
console.log(JSON.stringify({ out: OUT, files: manifest.length, sample: manifest.slice(0, 3) }, null, 1));
ws.close();
proc.kill();
process.exit(0);
