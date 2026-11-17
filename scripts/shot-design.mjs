/**
 * shot-design.mjs — v7 第 1.5 步验收图（第 1 屏圆盘设计层）
 *
 *   node scripts/shot-design.mjs                # 四张静态图
 *   node scripts/shot-design.mjs --only=picked  # 只截一张
 *   node scripts/shot-design.mjs --record       # 另录一段交互（frames → webm）
 *
 * 产物（默认目录 .legs/quiz-v7-step15-shots）：
 *   04-design-layer1-idle.png    只选到"还没选大类"的初始态
 *   05-design-layer1-picked.png  只选大类（盘心有大类标本组）
 *   06-design-layer2.png         进了第二层（中圈弧段 + 落到某一小类）
 *   07-design-mobile.png         390×844 窄视口同态
 *   08-design-interaction.webm   指针跟随 / 点击落定 / 进第二层（--record）
 *
 * ==== 为什么先核对 BUILD_ID ====
 * 踩过两次：端口上跑的是别的工作树（或本树的旧文件名）。截图脚本照样
 * exit 0 照样写出 PNG，而图里根本不是要验的版本 —— 那种图比没有图更糟，
 * 因为它看起来过了。所以页面 dataset.build 与磁盘 app.js 的 BUILD_ID
 * 不一致就 exit 2 且一张图都不落。
 *
 * ==== 交互为什么要用 CDP 的 screencast 而不是逐帧截图 ====
 * 逐帧 Page.captureScreenshot 的往返要 40–80ms，录出来的"动效"其实是
 * 一串不等距的静帧，看不出缓动。Page.startScreencast 由浏览器在合成帧
 * 之后推帧，时间戳是真的 —— 只有它才证明得了"全程连续运动"。
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9461;
const OUT = 'C:/Users/16256/work/.legs/quiz-v7-step15-shots';
const FRAMES = 'C:/Users/16256/work/.legs/quiz-v7-step15-shots/.frames';
const FFMPEG = 'C:/Users/16256/bin/ffmpeg.exe';
const FFPROBE = 'C:/Users/16256/bin/ffprobe.exe';
const URL_ = process.env.SHOT_URL || 'http://127.0.0.1:8080/';
const W = 1440;
const H = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const proc = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/16256/work/.legs/edge-shot-design-${Date.now()}/`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=1',
  `--window-size=${W},${H}`, 'about:blank',
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
if (!target) { console.error('CDP 没起来'); proc.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pend = new Map();
/** screencast 帧回调：录制时逐帧收集 */
let onFrame = null;
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Page.screencastFrame' && onFrame) onFrame(m.params);
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id;
  pend.set(i, (m2) => (m2.error ? rej(new Error(m2.error.message)) : res(m2.result)));
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return '__ERR__' + (r.exceptionDetails.exception?.description || '').slice(0, 400);
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });

/* 等盘心内容真的落定再截。
   nav 之后盘心是空态纹样；点了大类之后是文字签（同步，不需要等网络）；
   落到小类之后才是上色标本（fetch + 内存缓存，要等）。
   三种状态各等各的东西 —— 统一等 .plate-svg 会在前两种状态白等 16 秒。 */
const waitHub = async (kind) => {
  const sel = kind === 'orn' ? '.hub-orn'
    : kind === 'text' ? '.fam-text-item'
      : '.plate-svg';
  for (let i = 0; i < 60; i++) {
    const n = await ev(`document.querySelectorAll('${sel}').length`);
    if (typeof n === 'number' && n > 0) return n;
    await sleep(150);
  }
  return 0;
};

const nav = async () => {
  await send('Page.navigate', { url: URL_ });
  for (let i = 0; i < 120; i++) {
    await sleep(200);
    if (await ev(`!!document.querySelector('.disc-sector.lvl1')`)) break;
  }
  await waitHub('orn');
  await sleep(700);
};
await nav();

/* ---- 构建校验：跑的是哪份代码 ---- */
{
  const diskBuild = (fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8')
    .match(/BUILD_ID = '([^']+)'/) || [])[1];
  const liveBuild = await ev(`document.documentElement.dataset.build`);
  if (diskBuild && liveBuild !== diskBuild) {
    console.error(`构建不符：页面 ${liveBuild} / 磁盘 ${diskBuild}\n`
      + `  ${URL_} 上没有在跑当前 worktree 的代码（换端口，或先 node server.js <port>）`);
    ws.close(); proc.kill(); process.exit(2);
  }
}

const probe = `(() => {
  const app = document.getElementById('app');
  const hub = document.querySelector('.disc-hub');
  const wheel = document.querySelector('.wheel');
  const wx = wheel ? wheel.getBoundingClientRect() : null;
  return {
    build: document.documentElement.dataset.build || null,
    step: app ? app.dataset.step : null,
    lvl1: document.querySelectorAll('.disc-sector.lvl1').length,
    lvl2: document.querySelectorAll('.disc-sector.lvl2').length,
    plate: document.querySelectorAll('.plate-svg').length,
    plateShapes: document.querySelectorAll('.plate-svg path, .plate-svg circle').length,
    /* 只选大类时的盘心（纯文字裁定）：文字项数与 SVG 数分开报，
       两个数并排就是要证明"文字有、图标没有"。 */
    famTextItems: document.querySelectorAll('.fam-text-item').length,
    famTextCount: (document.querySelector('.fam-text-count') || {}).textContent || null,
    famTextSvgs: document.querySelectorAll('.fam-text svg, .hub-glyph svg:not(.plate-svg)').length,
    hubOrn: document.querySelectorAll('.hub-orn').length,
    plateRim: document.querySelectorAll('.plate-rim').length,
    plateDots: document.querySelectorAll('.plate-dot').length,
    ringTicks: document.querySelectorAll('.ring-tick').length,
    glass: document.querySelectorAll('.glass').length,
    bgRings: !!document.querySelector('.plate-bg'),
    bgCx: (document.querySelector('.plate-bg')||{style:{}}).style.getPropertyValue('--plate-cx'),
    bgCy: (document.querySelector('.plate-bg')||{style:{}}).style.getPropertyValue('--plate-cy'),
    hubClass: hub ? hub.className : null,
    hubZh: (document.querySelector('.hub-zh')||{}).textContent || null,
    kicker: (document.querySelector('.hub-kicker')||{}).textContent || null,
    backShown: !!document.querySelector('.wheel-back') && !document.querySelector('.wheel-back').hidden,
    backPos: (() => { const b = document.querySelector('.wheel-back'); if (!b) return null;
      const r = b.getBoundingClientRect(); return wx ? {
        bx: Math.round(r.left + r.width/2 - wx.left), by: Math.round(r.top + r.height/2 - wx.top),
        w: Math.round(wx.width) } : null; })(),
    progressMeta: (document.querySelector('.progress-meta')||{}).textContent || null,
    nextBg: (() => { const b=[...document.querySelectorAll('.actions .btn')].find(x=>/下一步/.test(x.textContent));
      return b ? getComputedStyle(b).backgroundColor + ' / r=' + getComputedStyle(b).borderRadius : null; })(),
    nextDisabled: (() => { const b=[...document.querySelectorAll('.actions .btn')].find(x=>/下一步/.test(x.textContent));
      return b ? b.disabled : null; })(),
    ambTickTop: (() => { const t=document.querySelector('.amb-tick'); if(!t) return null;
      const r=t.getBoundingClientRect(); return Math.round(r.top); })(),
    scrollH: document.documentElement.scrollHeight,
    clientH: document.documentElement.clientHeight,
  };
})()`;

const shot = async (file) => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const p = path.join(OUT, file);
  fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
  return p;
};

/* 用真实指针事件点某个家族扇区（不是 dispatchEvent 一个合成 click）：
   本步要验的正是"按下 → 落定"这条连续反馈，合成 click 没有 pointerdown。 */
const clickAtFam = async (famId) => {
  const box = await ev(`(() => {
    const g = [...document.querySelectorAll('.sector-g')].find((x) => x.getAttribute('data-fam') === '${famId}');
    if (!g) return null;
    const b = g.querySelector('.sector-shape').getBoundingClientRect();
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
  })()`);
  if (!box) throw new Error('找不到扇区 ' + famId);
  await mouse('mouseMoved', box.x, box.y);
  await sleep(90);
  await mouse('mousePressed', box.x, box.y);
  await sleep(80);
  await mouse('mouseReleased', box.x, box.y);
  return box;
};
const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', {
  type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1, ...extra,
});

const only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];
const wantRecord = process.argv.includes('--record');
const results = {};

/* ---------- ① 初始态 ---------- */
if (!only || only === 'idle') {
  results.idle = { shot: await shot('04-design-layer1-idle.png'), ...(await ev(probe)) };
}

/* ---------- ② 只选大类（盘心是纯文字签）---------- */
if (!only || only === 'picked') {
  await nav();
  await clickAtFam('amber');
  await waitHub('text');
  await sleep(700);
  /* 只选了大类、没落到小类 —— 这一张就是缺陷 ③ 的证据。
     probe 里 famTextItems 与 famTextSvgs 并排：前者 >0、后者 ==0
     才算"文字有、图标没有"这条裁定落实了。 */
  results.picked = { shot: await shot('05-design-layer1-picked.png'), ...(await ev(probe)) };
}

/* ---------- ③ 第二层 ---------- */
if (!only || only === 'layer2') {
  await nav();
  await clickAtFam('amber');
  await sleep(1000);
  /* 点中圈第一段弧（走真实指针：弧段本身接事件） */
  const arc = await ev(`(() => {
    const a = document.querySelector('.sub-arc');
    if (!a) return null;
    const b = a.getBoundingClientRect();
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
  })()`);
  if (arc) {
    await mouse('mouseMoved', arc.x, arc.y);
    await sleep(120);
    await mouse('mousePressed', arc.x, arc.y);
    await sleep(90);
    await mouse('mouseReleased', arc.x, arc.y);
  }
  await sleep(1100);
  await waitHub('plate');
  results.layer2 = { shot: await shot('06-design-layer2.png'), ...(await ev(probe)) };
}

/* ---------- ④ 窄视口 ---------- */
if (!only || only === 'mobile') {
  await send('Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await nav();
  await clickAtFam('amber');
  await waitHub('text');
  await sleep(700);
  results.mobile = { shot: await shot('07-design-mobile.png'), ...(await ev(probe)) };
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
}

/* ---------- ⑤ 交互录屏 ----------
   screencast 推帧 → 落成 PNG 序列 → ffmpeg 合成 VP9 webm。
   动线刻意覆盖验收要求的三段：
     ① 指针在大圈上绕一段 90°（高光跟随 + 悬停反馈）
     ② 点中「东方琥珀调」（按下 → 涟漪 → 弹性落定 → 进第二层）
     ③ 中圈再点一段（第二层里的落定）
   指针位移用 18 步小位移而不是一步跳过去 —— 要的是连续轨迹，不是两帧。 */
/* 帧序列 → webm。抽成函数是因为它是**唯一会因编码器参数变动而失败**的一步，
   而录一遍要跑 30 多秒的真实交互；参数写错时不该被迫连交互一起重录。
   用法：--encode-only 只重编码地上已有的帧序列。 */
const encodeFrames = () => {
  const out = path.join(OUT, '08-design-interaction.webm');
  const frames = fs.existsSync(FRAMES)
    ? fs.readdirSync(FRAMES).filter((f) => f.endsWith('.png')).sort() : [];
  if (frames.length < 10 || !fs.existsSync(FFMPEG)) {
    return { frames: frames.length, error: 'ffmpeg 缺失或帧数不足，帧序列留在 ' + FRAMES };
  }
  /* 用 concat demuxer + 固定时长单位（1/25 s）：screencast 的帧间隔不均，
     按固定 25fps 编码会略微变速，但"连续运动"这件事仍然成立，且不引入
     编码器的可变帧率兼容问题（VFR webm 在部分播放器上会只播第一帧）。
     25fps 是选出来的：低于 20 看着卡，高于 30 文件大一倍而看不出差别。

     **每一条 file 后面必须跟一行 duration**：concat demuxer 对静态图
     只按"一帧"计时，不给 duration 时 336 张会被压成 0.16 秒（实测：
     0.16s / 49634 字节，看着像"生成了"，播起来什么都没有）。
     最后一张要再写一次，否则 concat 会把它当成"没有时长"直接丢掉。

     `-fps_mode cfr` 而不是 `-vsync vfr`：本机 ffmpeg 9.0.2 已经把
     `-vsync` 整个删了（跑出来是 "Unrecognized option 'vsync'"），
     而这两者是同一件事的新旧写法 —— 老写法会让整条命令直接失败、
     帧序列留在地上、webm 一个字节都没有（实测踩过）。 */
  const list = path.join(FRAMES, 'list.txt');
  const DUR = 0.04;   // 1/25 s
  const lines = [];
  frames.forEach((f) => {
    lines.push(`file '${path.join(FRAMES, f).replace(/\\/g, '/')}'`);
    lines.push(`duration ${DUR}`);
  });
  lines.push(`file '${path.join(FRAMES, frames[frames.length - 1]).replace(/\\/g, '/')}'`);
  fs.writeFileSync(list, lines.join('\n'));
  const r = spawnSync(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', list,
    '-fps_mode', 'cfr', '-r', '25',
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-pix_fmt', 'yuv420p',
    '-an', out,
  ], { encoding: 'utf8' });
  return {
    frames: frames.length,
    webm: out,
    ffmpegErr: (r.stderr || '').slice(-400),
    bytes: fs.existsSync(out) ? fs.statSync(out).size : 0,
    durationSec: fs.existsSync(out)
      ? Number(spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', out], { encoding: 'utf8' }).stdout.trim()) || 0
      : 0,
  };
};

if (process.argv.includes('--encode-only')) {
  results.record = encodeFrames();
  console.log(JSON.stringify({ record: results.record }, null, 2));
  ws.close(); proc.kill(); process.exit(0);
}

if (wantRecord) {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  await nav();
  let seq = 0;
  onFrame = (p) => {
    /* 帧名带序号，编码时按名字排（screencast 的帧就是按推出的顺序来的） */
    fs.writeFileSync(path.join(FRAMES, `f${String(seq++).padStart(5, '0')}.png`),
      Buffer.from(p.data, 'base64'));
    send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
  };
  await send('Page.startScreencast', {
    format: 'png', maxWidth: W, maxHeight: H, everyNthFrame: 1,
  });
  await sleep(400);

  /* ① 指针绕外圈：从右侧 −20° 走到 200°，18 步 */
  const geo = await ev(`(() => { const w = document.querySelector('.wheel').getBoundingClientRect();
    return { cx: w.left + w.width/2, cy: w.top + w.height/2, r: w.width * 0.40 }; })()`);
  for (let i = 0; i <= 18; i++) {
    const deg = -20 + (220 / 18) * i;
    const rad = (deg * Math.PI) / 180;
    await mouse('mouseMoved', Math.round(geo.cx + geo.r * Math.cos(rad)), Math.round(geo.cy + geo.r * Math.sin(rad)));
    await sleep(42);            // ≈24fps 的输入节奏，帧率由浏览器推
  }
  await sleep(260);

  /* ② 点中东方琥珀调：按下 → 停 120ms → 抬起（让"按下态"真的进画面） */
  const amber = await ev(`(() => {
    const g = [...document.querySelectorAll('.sector-g')].find((x) => x.getAttribute('data-fam') === 'amber');
    const b = g.querySelector('.sector-shape').getBoundingClientRect();
    return { x: Math.round(b.left + b.width/2), y: Math.round(b.top + b.height/2) };
  })()`);
  for (let i = 0; i <= 8; i++) {   // 指针移到目标（8 步）
    await mouse('mouseMoved', amber.x + Math.round((i - 8) * 6), amber.y + Math.round((8 - i) * 3));
    await sleep(38);
  }
  await mouse('mousePressed', amber.x, amber.y);
  await sleep(150);
  await mouse('mouseReleased', amber.x, amber.y);
  await sleep(1500);               // 入场动画 + 盘心标本落地

  /* ③ 中圈：指针扫过弧段，再点一段 */
  for (let i = 0; i <= 12; i++) {
    const a = (i * 30) * Math.PI / 180;
    await mouse('mouseMoved',
      Math.round(geo.cx + geo.r * 0.62 * Math.cos(a)),
      Math.round(geo.cy + geo.r * 0.62 * Math.sin(a)));
    await sleep(40);
  }
  const arc = await ev(`(() => { const a = document.querySelector('.sub-arc');
    if (!a) return null; const b = a.getBoundingClientRect();
    return { x: Math.round(b.left + b.width/2), y: Math.round(b.top + b.height/2) }; })()`);
  if (arc) {
    await mouse('mouseMoved', arc.x, arc.y);
    await sleep(120);
    await mouse('mousePressed', arc.x, arc.y);
    await sleep(140);
    await mouse('mouseReleased', arc.x, arc.y);
  }
  await sleep(1400);

  await send('Page.stopScreencast');
  onFrame = null;
  await sleep(200);

  results.record = encodeFrames();
}

console.log(JSON.stringify(results, null, 2));
ws.close();
proc.kill();
process.exit(0);
