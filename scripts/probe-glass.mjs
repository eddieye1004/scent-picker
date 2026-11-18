/**
 * probe-glass.mjs — 玻璃层的像素证据（第 1.5 步 · 清单 1）
 *
 * 要回答的问题只有一个，而且必须是量出来的：
 *   「一张静止截图里，玻璃看得见吗？」
 * 上一版的失败方式正是"看的人说没改，改的人说改了"，双方都只有印象、
 * 没有数字。所以本探针不落观感结论，只报四组像素量（全部在**静止态**、
 * 指针从未移动过的那一帧上量）：
 *
 *   ① 盘缘镜面线  峰亮度 vs 内侧基线亮度（Δ 级），以及峰的半径位置
 *   ② 折射暗影    亮线之外的那一缕收暗（Δ 为负才成立）
 *   ③ 透镜口亮线  盘心外沿外那圈（Δ 级）
 *   ④ 斜向光泽带  同一半径上六个族的亮度极差 + 每族亮度
 *   ⑤ 分色是否被洗白  六族实测色与 --spec-tint-* 设计色的偏离（RGB 距离）
 *      —— 这条是"玻璃不许盖住扇区分色"的反向闸：偏离越大说明洗得越狠。
 *
 * 几何不从图片猜：盘心 / 盘径 / 六个族的角都由页面自己报
 * （.wheel 的 rect 与 .disc-sector.lvl1 的 rect），所以断点变了也不用改脚本。
 *
 * 用法：
 *   node server.js 8080                 # 另一个终端，跑本 worktree
 *   node scripts/probe-glass.mjs                # 打印并落一张 .probe-glass.png
 *   node scripts/probe-glass.mjs --json         # 只吐 JSON
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9471;
const OUT = 'C:/Users/16256/work/.legs/quiz-v7-step15-shots';
const FFMPEG = 'C:/Users/16256/bin/ffmpeg.exe';
const URL_ = process.env.SHOT_URL || 'http://127.0.0.1:8080/';
const W = 1440;
const H = 900;
const asJson = process.argv.includes('--json');
const say = (...a) => { if (!asJson) console.log(...a); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/16256/work/.legs/edge-probe-glass-${Date.now()}/`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars',
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
/* 与 shot-design 同一套视口与配色，量出来的数才能和验收图对上 */
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
await send('Page.navigate', { url: URL_ });
for (let i = 0; i < 120; i++) {
  await sleep(200);
  if (await ev(`!!document.querySelector('.disc-sector.lvl1')`)) break;
}
/* 指针全程不进画面：这一帧就是"用户还没动过鼠标"的那一帧，
   玻璃要成立只能靠这一帧。 */
await sleep(900);

const shotPng = path.join(OUT, '.probe-glass.png');
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync(shotPng, Buffer.from(shot.data, 'base64'));

const geo = await ev(`(() => {
  const w = document.querySelector('.wheel').getBoundingClientRect();
  const fams = [...document.querySelectorAll('.label-layer .disc-sector.lvl1')]
    .filter((x) => x.getAttribute('data-fam'))
    .map((x) => {
      const b = x.getBoundingClientRect();
      const cx = b.left + b.width / 2 - w.left - w.width / 2;
      const cy = b.top + b.height / 2 - w.top - w.height / 2;
      return { fam: x.getAttribute('data-fam'), deg: Math.atan2(cy, cx) * 180 / Math.PI,
               r: Math.hypot(cx, cy) / w.width };
    });
  const cs = getComputedStyle(document.querySelector('.wheel'));
  return { cx: w.left + w.width / 2, cy: w.top + w.height / 2, box: w.width, fams,
           hub: (document.querySelector('.disc-hub')||{}).getBoundingClientRect
             ? Math.round(document.querySelector('.disc-hub').getBoundingClientRect().width / w.width * 1000) / 1000 : null };
})()`);
if (typeof geo !== 'object') { console.error('取几何失败：' + geo); ws.close(); proc.kill(); process.exit(1); }

/* PNG → 裸 rgb24（没有 npm 包，解码交给本机 ffmpeg） */
const rawPath = path.join(OUT, '.probe-glass.rgb');
const dec = spawnSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error',
  '-i', shotPng, '-f', 'rawvideo', '-pix_fmt', 'rgb24', rawPath], { encoding: 'utf8' });
if (dec.status !== 0) { console.error('ffmpeg 解码失败：' + (dec.stderr || '').slice(-300)); ws.close(); proc.kill(); process.exit(1); }
let px = fs.readFileSync(rawPath);
const at = (x, y) => {
  const i = (Math.round(y) * W + Math.round(x)) * 3;
  return [px[i], px[i + 1], px[i + 2]];
};
const lum = ([r, g, b]) => {
  const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
/* 亮度按 0–255 报"级"，肉眼阈值 ~1–2 级：报相对亮度通道的均值更贴近"看得出" */
const chL = ([r, g, b]) => (r + g + b) / 3;
const raySample = (deg, rFrac, n = 1) => {
  /* rFrac 是相对 .wheel 盒边长 W 的半径分数；deg 按屏幕角（0=右，顺时针向下） */
  const a = deg * Math.PI / 180;
  const acc = [];
  for (let k = 0; k < n; k++) {
    const rf = rFrac + (k - (n - 1) / 2) * 0.0012;
    acc.push(at(geo.cx + Math.cos(a) * rf * geo.box, geo.cy + Math.sin(a) * rf * geo.box));
  }
  const m = [0, 1, 2].map((c) => acc.reduce((s, p) => s + p[c], 0) / acc.length);
  return { rgb: m.map((v) => Math.round(v)), L: chL(m) };
};
const band = (deg, r0, r1, step = 0.0015) => {
  const out = [];
  for (let r = r0; r <= r1 + 1e-9; r += step) out.push({ r, ...raySample(deg, r) });
  return out;
};

const RIMS = [0, 45, 90, 135, 180, 225, 270, 315];
const report = { box: Math.round(geo.box), hubRatio: geo.hub, rim: [], sheen: [], fams: [] };

say(`盘盒 ${Math.round(geo.box)}px · 盘心 ${(geo.cx).toFixed(0)},${(geo.cy).toFixed(0)} · 盘心/盘径 = ${geo.hub}`);
say('');
say('① 盘缘镜面线 + ② 折射暗影（Δ = 峰亮度 − 内侧基线；dip = 暗影谷 − 峰）');
for (const deg of RIMS) {
  const prof = band(deg, 0.330, 0.496);
  const inner = prof.filter((p) => p.r >= 0.390 && p.r <= 0.435);
  const base = inner.reduce((s, p) => s + p.L, 0) / inner.length;
  const peakP = prof.filter((p) => p.r >= 0.440 && p.r <= 0.480).reduce((a, b) => (b.L > a.L ? b : a));
  const dipP = prof.filter((p) => p.r >= 0.474 && p.r <= 0.500).reduce((a, b) => (b.L < a.L ? b : a));
  const row = {
    deg, base: Math.round(base), peak: Math.round(peakP.L), peakAt: +peakP.r.toFixed(3),
    delta: Math.round(peakP.L - base), dip: Math.round(dipP.L - peakP.L), dipAt: +dipP.r.toFixed(3),
  };
  report.rim.push(row);
  say(`  ${String(deg).padStart(3)}°  基线 ${String(row.base).padStart(3)}  镜面峰 ${String(row.peak).padStart(3)} @${(row.peakAt * geo.box / 2).toFixed(1)}px  Δ${row.delta >= 0 ? '+' : ''}${row.delta}   暗影 ${row.dip} @${(row.dipAt * geo.box / 2).toFixed(1)}px`);
}

say('');
say('③ 透镜口亮线（盘心外沿之外 0.004–0.022W）');
for (const deg of RIMS) {
  const prof = band(deg, 0.332, 0.372);
  const peak = prof.reduce((a, b) => (b.L > a.L ? b : a));
  const out = prof.filter((p) => p.r >= 0.356).reduce((s, p) => s + p.L, 0) / prof.filter((p) => p.r >= 0.356).length;
  say(`  ${String(deg).padStart(3)}°  峰 ${Math.round(peak.L)} @${(peak.r * geo.box / 2).toFixed(1)}px  比外圈 ${Math.round(peak.L - out) >= 0 ? '+' : ''}${Math.round(peak.L - out)}`);
  report.sheen.push({ deg, peak: Math.round(peak.L), vs: Math.round(peak.L - out) });
}

say('');
say('④ 斜向光泽带 + ⑤ 六族分色是否被洗白（瓦面取样：半径 0.366W、族中线 ±16° 取中位数，避开标签）');
const TINT = { citrus: [248, 239, 210], floral: [249, 236, 230], woody: [234, 228, 212], amber: [242, 224, 198], fresh: [230, 238, 224], gourmand: [244, 227, 217] };
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
for (const f of geo.fams) {
  const prof = band(f.deg, 0.345, 0.470, 0.004);
  const Ls = prof.map((p) => p.L);
  const arc = [];
  for (let a = f.deg - 16; a <= f.deg + 16; a += 1.6) {
    const p = raySample(a, 0.366);
    arc.push(p.rgb);
  }
  const med = [0, 1, 2].map((c) => median(arc.map((p) => p[c])));
  const chroma = Math.max(...med) - Math.min(...med);
  const chromaDesign = Math.max(...TINT[f.fam]) - Math.min(...TINT[f.fam]);
  const d = [0, 1, 2].map((c) => Math.round(med[c]) - TINT[f.fam][c]);
  say(`  ${f.fam.padEnd(9)} @${f.deg.toFixed(0)}°  瓦面 ${med.map((v) => Math.round(v)).join(',')}  光泽带内亮度极差 ${Math.round(Math.max(...Ls) - Math.min(...Ls))}  彩度 ${chroma}（设计 ${chromaDesign}，被吃掉 ${chromaDesign - chroma}）  Δrgb ${d.join('/')}`);
  report.fams.push({ fam: f.fam, deg: +f.deg.toFixed(1), rgb: med.map(Math.round), sheenRange: Math.round(Math.max(...Ls) - Math.min(...Ls)), chroma, chromaDesign, washD: d });
}
say('');
say('注：「被吃掉 N」= 玻璃把该族的最大−最小通道差压掉 N 级；<=8 视为分色仍成立，>18 说明洗过头。');

/* ---- ⑥ A/B：把玻璃层的 paint 摘掉，同一批像素再量一遍 ----
   ①–⑤ 报的是"这一帧这里有多亮"，里面混着扇区分色、标本底环、纸底暗角，
   都不全是玻璃的功劳。要回答"玻璃到底改了多少像素"，只有一个办法：
   同一页、同一几何、只让 .glass 不画（display:none 连它的 ::before/::after
   一起消失），再截一帧，逐点相减。差值才是玻璃的贡献，正=提亮、负=压暗。
   盘、瓦、图标、标签一个节点都没动，也没碰过指针。 */
const RADII = [0.400, 0.455, 0.468, 0.472, 0.479, 0.490];
const RLBL = ['面 .400', '晕内 .455', '晕外 .468', '线峰 .472', '折射 .479', '盘外 .490'];
const snap = () => RIMS.map((deg) => RADII.map((r) => raySample(deg, r).L));
const scanGrid = [];
for (let deg = 0; deg < 360; deg += 3) for (let r = 0.350; r <= 0.470; r += 0.004) scanGrid.push([deg, r]);
const faceScan = () => scanGrid.map(([deg, r]) => raySample(deg, r).L);

const snapA = snap();
const faceA = faceScan();

await ev(`(() => { const g = document.querySelector('.wheel .glass'); g.style.display = 'none'; return 1; })()`);
await sleep(150);
const shotB = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
const rawB = path.join(OUT, '.probe-noglass.rgb');
fs.writeFileSync(path.join(OUT, '.probe-noglass.png'), Buffer.from(shotB.data, 'base64'));
const decB = spawnSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error',
  '-i', path.join(OUT, '.probe-noglass.png'), '-f', 'rawvideo', '-pix_fmt', 'rgb24', rawB], { encoding: 'utf8' });
if (decB.status !== 0) { console.error('ffmpeg 解码 B 帧失败：' + (decB.stderr || '').slice(-300)); ws.close(); proc.kill(); process.exit(1); }
px = fs.readFileSync(rawB);
const snapB = snap();
const faceB = faceScan();
fs.unlinkSync(rawB);
await ev(`(() => { const g = document.querySelector('.wheel .glass'); g.style.display = ''; return 1; })()`);
px = fs.readFileSync(rawPath);

say('');
say('⑥ A/B —— 玻璃层造成的像素差（+提亮 / −压暗；盘外 .490 应当 ≈ 0，即不许漫到纸上）');
say('     ' + RLBL.map((s) => s.padStart(10)).join(''));
const ab = [];
RIMS.forEach((deg, i) => {
  const d = RADII.map((r, j) => snapA[i][j] - snapB[i][j]);
  ab.push({ deg, d: d.map((v) => Math.round(v * 10) / 10) });
  say(`  ${String(deg).padStart(3)}°` + d.map((v) => (v >= 0 ? '+' : '') + (Math.round(v * 10) / 10).toFixed(1).padStart(9)).join(''));
});
report.ab = ab;
const fd = faceA.map((v, i) => v - faceB[i]);
const bright = fd.filter((v) => v >= 8).length;
const dark = fd.filter((v) => v <= -8).length;
const mx = Math.max(...fd);
const mn = Math.min(...fd);
const atMax = fd.indexOf(mx);
const atMin = fd.indexOf(mn);
const where = (i) => `${scanGrid[i][0]}° @${scanGrid[i][1].toFixed(3)}W  玻璃下 ${Math.round(faceB[i])} → 玻璃上 ${Math.round(faceA[i])}`;
say(`  盘面扫描 ${fd.length} 点（0.350–0.470W × 120 角）：最亮被抬起 ${Math.round(mx)} 级、最深被压掉 ${Math.round(mn)} 级；|Δ|>=8 级的点 ${bright + dark} 个（提亮 ${bright} / 压暗 ${dark}）`);
say(`      最亮点：${where(atMax)}`);
say(`      最暗点：${where(atMin)}`);
report.face = { samples: fd.length, max: Math.round(mx), min: Math.round(mn), bright, dark,
                maxAt: scanGrid[atMax], minAt: scanGrid[atMin] };
say('  判读：一条光泽带要一眼可见，盘面上至少要有成片 |Δ|>=8 级的点；0 个就等于"没改"。');

if (asJson) console.log(JSON.stringify(report));
else console.log(JSON.stringify(report.rim));
fs.unlinkSync(rawPath);
ws.close();
proc.kill();
process.exit(0);
