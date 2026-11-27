/**
 * verify-qoder.mjs — Qoder 三项改造的浏览器端验收（一次性脚本）
 *
 *   node scripts/verify-qoder.mjs
 *
 * 做的事：起一个无头 Edge，走完 6 屏问卷，在结果页上验证
 *   ① 我的香水档案：写入形状、展开、计数、清空两段式；
 *   ② 分享卡片 PNG：真点按钮、拦 blob，落一张 PNG 到磁盘；
 *   ③ PWA：manifest 字段、SW 注册、缓存清单、断网重载。
 * 顺带出桌面 / 窄屏 / 深色三组截图。
 *
 * 产物：.legs/qoder-work-shots/
 *   q1-result-desktop.png      结果页顶部
 *   q2-share-history.png       分享按钮 + 档案折叠态
 *   q3-history-open.png        档案展开态
 *   q4-share-card.png          导出的 1080×1620 PNG 原件
 *   q5-mobile-result.png       390×844 结果页
 *   q6-dark-result.png         深色模式结果页
 *   q7-offline-reload.png      断网后重载（SW 缓存命中）
 *   report.json                全部断言与采集结果
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9471;
const URL_ = process.env.VERIFY_URL || 'http://127.0.0.1:8080/';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUT = path.join(ROOT, '.legs', 'qoder-work-shots');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass: !!pass, detail: String(detail) });

const proc = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(OUT, `.edge-${Date.now()}`)}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars',
  /* 本机装有 Tampermonkey：不禁扩展时它会自己开一个更新页并抢走
     「第一个 page target」，脚本就会对着扩展页跑（实测踩过）。 */
  '--disable-extensions', '--disable-component-extensions-with-background-pages',
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 100; i++) {
  try {
    const j = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = j.find((x) => x.type === 'page' && x.url === 'about:blank') || null;
    if (target) break;
  } catch { /* 等 */ }
  await sleep(250);
}
if (!target) {
  /* 兜底：直接新建一个目标，不依赖「第一个 page」是谁 */
  target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL_)}`, { method: 'PUT' })).json();
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error');
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });

const shot = async (file) => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, 'base64'));
  return file;
};

const waitFor = async (expr, timeout = 15000) => {
  const dead = Date.now() + timeout;
  while (Date.now() < dead) {
    if (await ev(`!!(${expr})`)) return true;
    await sleep(120);
  }
  return false;
};

const clickText = async (re) => ev(`(() => {
  const rx = ${re};
  const list = [...document.querySelectorAll('button, [role="radio"], .choice, .tag')];
  const t = list.find((x) => !x.disabled && rx.test(x.textContent || ''));
  if (!t) return false;
  t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return true;
})()`);

const next = async () => ev(`(() => {
  /* 只认底部动作条里的主按钮。圆盘盘心还有一颗「直接下一步」(.hub-go)，
     文案也含"下一步"，但它的语义是"中圈不选了"——会 onChange(f, null)
     清掉 subfamily。早先按全文档 button 顺序找，先命中它（hidden 也接合成
     click），于是避雷屏拿不到小类、规则①失效。这里限定 .actions 并跳过 hidden。 */
  const pool = [...document.querySelectorAll('.actions button')];
  const b = (pool.length ? pool : [...document.querySelectorAll('button')])
    .find((x) => !x.disabled && !x.hidden && /下一步|看推荐/.test(x.textContent || ''));
  if (!b) return false;
  b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return true;
})()`);

/* 首屏入口卡只负责切界面；走原有圆盘流程前先显式选卡。 */
const enterFamily = async () => {
  const ready = await waitFor(`document.querySelector('.entry-card[data-entry="family"]') || document.querySelector('.sector-g')`);
  if (!ready) return false;
  const card = await ev(`!!document.querySelector('.entry-card[data-entry="family"]')`);
  if (card) await ev(`document.querySelector('.entry-card[data-entry="family"]').click()`);
  return waitFor(`document.querySelector('.sector-g')`);
};

/* 避雷屏是否真的出现过、点卡是否真的翻成「这个不要」。
   walk 会跑三遍（桌面/窄屏/深色），每遍都重置再采集。 */
let sawAvoid = false;
let avoidToggleOk = false;
let avoidCount = 0;

/** 走完当前 6 屏问卷（手机/深色复用同一套动作）。
    实际顺序：family → unwanted(避雷) → occasion → season → concentration → budget。
    避雷屏可能被「算不出模糊带」整屏跳过，所以按 data-step 自适应。
    每个真实选项都必须点中；旧版忽略 clickText 的 false，曾让已删除的
    预算/情绪/想要味道步骤静默跳过，仅凭到达结果页形成验收假阳性。 */
const walk = async () => {
  sawAvoid = false; avoidToggleOk = false; avoidCount = 0;
  await enterFamily();
  /* SVG <g> 没有 HTMLElement.click()，统一走冒泡的合成 click */
  await ev(`document.querySelectorAll('.sector-g')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await sleep(500);
  await ev(`document.querySelectorAll('.disc-sector.lvl2')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await sleep(400);
  await next();                       // 1 → 2
  await sleep(450);
  /* 2 避雷（unwanted）：柑橘·古龙水型方向必有模糊带，不会跳过。
     点第一张卡＝「这个不要」，验 aria-pressed 翻 true，再下一步。 */
  if (await ev(`document.getElementById('app').dataset.step === 'unwanted'`)) {
    sawAvoid = true;
    avoidCount = await ev(`document.querySelectorAll('.avoid-card').length`);
    avoidToggleOk = await ev(`(() => {
      const c = document.querySelector('.avoid-card');
      if (!c) return false;
      const before = c.getAttribute('aria-pressed');
      c.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return before === 'false' && c.getAttribute('aria-pressed') === 'true' && c.classList.contains('is-on');
    })()`);
    await sleep(250);
    await next();
    if (!await waitFor(`document.getElementById('app').dataset.step === 'occasion'`)) return false;
  }
  if (!await clickText('/上班\\/上课/')) return false; // 3 场合
  await next();
  if (!await waitFor(`document.getElementById('app').dataset.step === 'season'`)) return false;
  if (!await clickText('/^春/')) return false;            // 4 季节
  await next();
  if (!await waitFor(`document.getElementById('app').dataset.step === 'concentration'`)) return false;
  if (!await clickText('/淡香水 EDT/')) return false;      // 5 浓度
  await sleep(350);
  await next();
  if (!await waitFor(`document.getElementById('app').dataset.step === 'budget'`)) return false;
  if (!await clickText('/300–600 元/')) return false;       // 6 预算
  await next();                       // 看推荐
  return waitFor(`document.getElementById('app').dataset.step === 'result'`, 20000);
};

/** 单独导航到避雷屏（第 2 位）用于截图：选柑橘·古龙水型 → 下一步。 */
const gotoAvoid = async () => {
  await send('Page.navigate', { url: URL_ });
  await enterFamily();
  await ev(`document.querySelectorAll('.sector-g')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await sleep(500);
  await ev(`document.querySelectorAll('.disc-sector.lvl2')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await sleep(400);
  await next();
  await sleep(500);
  return waitFor(`document.getElementById('app').dataset.step === 'unwanted'`, 8000);
};

/* ================= ① 桌面结果页 ================= */
await send('Page.navigate', { url: URL_ });
await enterFamily();
const diskBuild = (fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').match(/BUILD_ID = '([^']+)'/) || [])[1];
const liveBuild = await ev(`document.documentElement.dataset.build`);
check('页面跑的是当前工作树的构建', diskBuild && liveBuild === diskBuild, `${liveBuild} / 磁盘 ${diskBuild}`);

const reached = await walk();
check('6 屏走完到达结果页', reached);
check('流程经过动态避雷屏（第 2 位）', sawAvoid);
check('避雷屏点卡＝这个不要（aria-pressed 翻 true）', avoidToggleOk);
check('避雷屏候选封顶 6 张', avoidCount > 0 && avoidCount <= 6, `${avoidCount} 张`);
await sleep(900);
check('结果页有分享 PNG 按钮',
  await ev(`!!document.querySelector('.qw-share-btn')`));
check('结果页有「我的香水档案」区块',
  await ev(`!!document.querySelector('.qw-history')`));
check('档案标题与隐私说明在位',
  await ev(`(() => { const s = document.querySelector('.qw-history'); return !!s && /我的香水档案/.test(s.textContent) && /只保存在这台设备/.test(s.textContent); })()`));

const hist = await ev(`(() => {
  const raw = localStorage.getItem('scent-picker.history.v1');
  return { raw, n: JSON.parse(raw || '[]').length };
})()`);
check('本次结果已写入 localStorage', hist.n === 1, `记录 ${hist.n} 条`);
const rec = JSON.parse(hist.raw || '[]')[0] || {};
const keys = Object.keys(rec).sort().join(',');
check('记录只有 t / entry / results 三个字段', keys === 'entry,results,t', keys);
const itemKeysOk = (rec.results || []).every((x) => Object.keys(x).sort().join(',') === 'brand,name');
check('记录不含答案、ID、设备信息',
  itemKeysOk && Object.keys(rec).sort().join(',') === 'entry,results,t' && JSON.stringify(rec).length < 400,
  `字段 ${Object.keys(rec).join(',')} · 每条 ${Object.keys(rec.results?.[0] || {}).join(',')}`);
check('记录里有 3 瓶名字与品牌',
  rec.results?.length === 3 && rec.results.every((x) => x.name && x.brand),
  (rec.results || []).map((x) => `${x.name}/${x.brand}`).join(' · '));
check('入口类型记为香型圆盘', rec.entry === 'family');

await ev(`window.scrollTo(0,0)`);
await sleep(250);
const s1 = await shot('q1-result-desktop.png');

const toggleLabel = await ev(`document.querySelector('.qw-history-toggle').textContent`);
check('折叠态按钮带计数', /查看（1）/.test(toggleLabel), toggleLabel);

await ev(`document.querySelector('.qw-share-row').scrollIntoView({block:'center'})`);
await sleep(400);
const s2 = await shot('q2-share-history.png');

await ev(`document.querySelector('.qw-history-toggle').click()`);
await sleep(400);
const panel = await ev(`(() => {
  const p = document.querySelector('.qw-history-panel');
  return { open: !p.hidden, text: p.innerText, items: p.querySelectorAll('.qw-history-item').length,
    toggle: document.querySelector('.qw-history-toggle').textContent };
})()`);
check('档案展开后有列表', panel.open && panel.items === 1, `${panel.items} 条`);
check('展开态按钮变「收起（1）」', /收起（1）/.test(panel.toggle), panel.toggle);
const savedNames = (rec.results || []).map((x) => x.name);
check('列表含时间 / 入口 / 三瓶名',
  /\d{2}\/\d{2} \d{2}:\d{2}/.test(panel.text) && /香型圆盘/.test(panel.text)
  && savedNames.every((n) => panel.text.includes(n)),
  `${panel.text.replace(/\n/g, ' | ').slice(0, 120)}`);
const s3 = await shot('q3-history-open.png');

/* ================= ② PNG 导出 ================= */
const png = await ev(`(async () => {
  let blob = null;
  const oc = URL.createObjectURL;
  URL.createObjectURL = function (b) { blob = b; return oc.call(URL, b); };
  const ok = HTMLAnchorElement.prototype.click;
  const meta = {};
  HTMLAnchorElement.prototype.click = function () { meta.name = this.download; meta.kind = this.href.slice(0, 5); };
  document.querySelector('.qw-share-btn').click();
  await new Promise((r) => setTimeout(r, 2600));
  HTMLAnchorElement.prototype.click = ok;
  URL.createObjectURL = oc;
  if (!blob) return { error: 'no blob' };
  const data = await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
  return { size: blob.size, type: blob.type, name: meta.name, kind: meta.kind,
    dataUrl: data, btnText: document.querySelector('.qw-share-btn').textContent };
})()`);
check('点击按钮产出真实 PNG blob', png.type === 'image/png' && png.size > 50000, `${png.size} 字节`);
check('下载文件名带时间戳', /^scent-picker-\d{8}-\d{4}\.png$/.test(png.name || ''), png.name);
check('走的是 blob: 本地地址（无外部请求）', png.kind === 'blob:', png.kind);
if (png.dataUrl) {
  fs.writeFileSync(path.join(OUT, 'q4-share-card.png'), Buffer.from(png.dataUrl.split(',')[1], 'base64'));
}
const cardDims = await ev(`(async () => {
  const img = new Image();
  img.src = ${JSON.stringify(png.dataUrl || '')};
  await img.decode();
  return { w: img.naturalWidth, h: img.naturalHeight };
})()`);
check('卡片尺寸 1080×1620', cardDims.w === 1080 && cardDims.h === 1620, `${cardDims.w}×${cardDims.h}`);

/* ================= ③ PWA ================= */
const manifest = await ev(`fetch('./manifest.json').then((r) => r.json())`);
check('manifest 名称 / start_url / display',
  manifest.name === '零基础香水选择器' && manifest.start_url === './' && manifest.display === 'standalone',
  `${manifest.name} · ${manifest.start_url} · ${manifest.display}`);
check('manifest 含 192 / 512 / maskable 图标',
  manifest.icons.some((i) => i.sizes === '192x192')
  && manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')
  && manifest.icons.some((i) => i.purpose === 'maskable'),
  manifest.icons.map((i) => `${i.sizes}:${i.purpose || 'any'}`).join(' '));
check('index.html 接了 manifest 与 theme-color',
  await ev(`!!document.querySelector('link[rel="manifest"]') && document.querySelector('meta[name="theme-color"]').content === '#FAF7F1'`));

/* .ready 在注册失败时永远不 resolve，必须自己加超时 —— 否则线上一次
   SW 注册异常会把整个验收脚本挂死（本地已验证过，线上要单独给上限）。 */
const swReady = await ev(`Promise.race([
  navigator.serviceWorker.ready.then((r) => !!r.active).catch(() => false),
  new Promise((r) => setTimeout(() => r(false), 12000)),
])`);
check('service worker 已激活', swReady);
await sleep(1200);
const cacheInfo = await ev(`(async () => {
  try {
    const keys = await caches.keys();
    const c = await caches.open(keys.find((k) => k.startsWith('scent-picker-v7-1-')) || keys[0]);
    const reqs = await c.keys();
    return { keys, count: reqs.length, paths: reqs.map((r) => new URL(r.url).pathname) };
  } catch (e) { return { keys: [], count: 0, paths: [], error: String(e) }; }
})()`);
check('缓存已建立', cacheInfo.count > 20, `${cacheInfo.keys.join(',')} · ${cacheInfo.count} 项`);
for (const must of ['/', '/app.js', '/styles.css', '/manifest.json', '/data/perfumes.json',
  '/src/history.js', '/src/share-card.js', '/icons/icon-192.png',
  '/src/avoid.js', '/src/avoid-map.js', '/data/avoid-scenarios.json']) {
  check(`缓存含 ${must}`, cacheInfo.paths.includes(must));
}

/* ================= 断网重载 ================= */
await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await send('Page.reload', { ignoreCache: true });
const offlineOk = await waitFor(`document.querySelector('.entry-card[data-entry="family"]')`, 15000);
const offlineTitle = await ev(`document.title`);
check('断网后重载仍能打开入口二选一', offlineOk, offlineTitle);
await sleep(500);
const s7 = await shot('q7-offline-reload.png');
await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

/* ================= 避雷屏截图（桌面）================= */
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
const avoidDesktop = await gotoAvoid();
check('桌面到达避雷屏（第 2 位）', avoidDesktop);
await sleep(450);
/* 「大卡片纵列一屏看完」：1440×900 下六张卡必须不滚动就全看见，且最后一张
   完整落在 sticky 导航条之上（.actions 贴底时会盖住超出的内容）。
   不用整文档 scrollHeight —— 页脚在全站每一屏都在折叠线以下，不算"没看完"。 */
const avoidFit = await ev(`(() => {
  const cards = [...document.querySelectorAll('.avoid-card')];
  const last = cards[cards.length - 1].getBoundingClientRect();
  const nav = document.querySelector('.actions').getBoundingClientRect();
  return { lastBottom: Math.round(last.bottom), navTop: Math.round(nav.top), vh: innerHeight };
})()`);
check('桌面避雷屏一屏看完（末卡完整在导航之上）',
  avoidFit.lastBottom <= avoidFit.navTop + 1 && avoidFit.lastBottom <= avoidFit.vh,
  `末卡底 ${avoidFit.lastBottom} / 导航顶 ${avoidFit.navTop} / 视口 ${avoidFit.vh}`);
/* 标本小图走 innerHTML 注入（与圆盘同源）：逐张核里面真有 path，
   防"源 SVG 解析失败 → 空图/破图"这类静默缺陷（woody-vetiver 曾踩中）。 */
const specOk = await ev(`[...document.querySelectorAll('.avoid-spec')].every((s) => s.querySelectorAll('path').length > 0)`);
check('避雷屏每张标本小图都真实渲染（无空图/破图）', specOk);
/* 三条硬规则在真实上屏清单上再核一遍（走的是柑橘·古龙水型）：
   ① 自己的核心元素不问 → citrus-peel（bergamot/lemon）不许在；
   ③ 模糊带候选在 → after-rain / rose-garden 必须在。 */
const avoidIds = await ev(`[...document.querySelectorAll('.avoid-card')].map((c) => c.dataset.phrase)`);
check('规则①上屏：古龙水型屏不问自己的核心元素（citrus-peel 不在）',
  !avoidIds.includes('citrus-peel'), avoidIds.join(','));
check('规则③上屏：模糊带候选在屏上（after-rain / rose-garden）',
  avoidIds.includes('after-rain') && avoidIds.includes('rose-garden'), avoidIds.join(','));
await shot('avoid-desktop.png');

/* ================= 窄屏 ================= */
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
/* 390px 避雷屏截图 */
const avoid390 = await gotoAvoid();
check('390px 到达避雷屏（第 2 位）', avoid390);
await sleep(450);
await shot('avoid-390.png');
/* 390px 结果页（重新走一遍完整流程）*/
await send('Page.navigate', { url: URL_ });
await enterFamily();
const mobileReached = await walk();
check('390×844 也能走完 6 屏', mobileReached);
await sleep(800);
const overflow = await ev(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`);
check('窄屏无横向溢出', overflow.sw <= overflow.cw + 1, `${overflow.sw} / ${overflow.cw}`);
await ev(`document.querySelector('.qw-share-btn').scrollIntoView({block:'center'})`);
await sleep(350);
await ev(`document.querySelector('.qw-history-toggle').click()`);
await sleep(350);
const s5 = await shot('q5-mobile-result.png');

/* ================= 深色 ================= */
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
await send('Page.navigate', { url: URL_ });
await enterFamily();
const darkReached = await walk();
check('深色模式也能走完 6 屏', darkReached);
await sleep(800);
await ev(`document.querySelector('.qw-share-btn').scrollIntoView({block:'center'})`);
await sleep(350);
await ev(`document.querySelector('.qw-history-toggle').click()`);
await sleep(350);
const s6 = await shot('q6-dark-result.png');
const darkBg = await ev(`getComputedStyle(document.body).backgroundColor`);
check('深色模式背景不是纸白', !/250, 247, 241/.test(darkBg), darkBg);

/* ================= 档案清空 ================= */
const clearRes = await ev(`(async () => {
  const b = document.querySelector('.qw-history-clear');
  b.click();
  const armed = b.textContent;
  await new Promise((r) => setTimeout(r, 120));
  b.click();
  await new Promise((r) => setTimeout(r, 200));
  return { armed, raw: localStorage.getItem('scent-picker.history.v1'),
    empty: document.querySelector('.qw-history-empty')?.textContent || '',
    toggle: document.querySelector('.qw-history-toggle').textContent };
})()`);
check('清空是两段式（先确认再清）', /再点一次确认清空/.test(clearRes.armed), clearRes.armed);
check('清空后 localStorage 移除记录', !clearRes.raw, String(clearRes.raw));
check('清空后显示空态并复位计数', /还没有记录/.test(clearRes.empty) && /^收起$/.test(clearRes.toggle),
  `${clearRes.toggle} · ${clearRes.empty}`);

const report = {
  build: { live: liveBuild, disk: diskBuild },
  screenshots: { desktop: s1, shareHistory: s2, historyOpen: s3, card: 'q4-share-card.png',
    mobile: s5, dark: s6, offline: s7, avoidDesktop: 'avoid-desktop.png', avoid390: 'avoid-390.png' },
  avoid: { sawAvoid, avoidToggleOk, count: avoidCount },
  cache: { keys: cacheInfo.keys, count: cacheInfo.count },
  png: { size: png.size, name: png.name, w: cardDims.w, h: cardDims.h },
  checks,
  summary: { pass: checks.filter((c) => c.pass).length, fail: checks.filter((c) => !c.pass).length },
};
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary));
for (const c of checks) if (!c.pass) console.log('FAIL ' + c.name + ' — ' + c.detail);
for (const c of checks) if (c.pass) console.log('ok   ' + c.name + (c.detail ? ' — ' + c.detail : ''));
console.log('shots → ' + OUT);

ws.close();
proc.kill();
process.exit(report.summary.fail ? 1 : 0);
