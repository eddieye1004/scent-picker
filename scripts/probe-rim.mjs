/**
 * probe-rim.mjs — 找「返回胶囊」在盘口线上的无损落点（一次性选型工具）
 *
 * 判据只有一条：胶囊盒与**所有**可点标签的盒都不相交（两层都算）。
 * 标签盒是透明的，但压上去仍会让文字互相盖住 —— 所以按盒子判，不按字形。
 *
 * 做法：逐个家族进第二层，量出 6 枚 lvl1 + n 枚 lvl2 的盒子，
 * 然后在盘口线（半径 0.5）上按 1° 步长扫一圈，报出无碰撞的角度区间。
 */
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9491;
const VIEWS = [[1440, 900], [390, 844], [360, 780]];
const FAMS = ['citrus', 'floral', 'woody', 'amber', 'fresh', 'gourmand'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/Users/16256/work/.legs/edge-rim-${Date.now()}/`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900', 'about:blank'],
{ stdio: 'ignore' });

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
  pend.set(i, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return 'ERR ' + JSON.stringify(r.exceptionDetails).slice(0, 300);
  return r.result.value;
};
await send('Page.enable'); await send('Runtime.enable');

const out = {};
for (const [w, h] of VIEWS) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 620 });
  await send('Page.navigate', { url: 'http://127.0.0.1:8080/' });
  for (let i = 0; i < 120; i++) { await sleep(200); if (await ev(`!!document.querySelector('.disc-sector.lvl1')`)) break; }
  await sleep(900);

  const boxes = [];
  /* 空态：只有 lvl1 */
  boxes.push(await ev(`(() => { const wr=document.querySelector('.wheel').getBoundingClientRect();
    const f=(el)=>{const r=el.getBoundingClientRect();return {l:r.left-wr.left,t:r.top-wr.top,w:r.width,h:r.height};};
    return {state:'idle', wheel: Math.round(wr.width),
      tags:[...document.querySelectorAll('.disc-sector.lvl1')].map(f),
      back:(()=>{const b=document.querySelector('.wheel-back');return {w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height};})()}; })()`));

  for (const fam of FAMS) {
    const tb = await ev(`(() => { const g=[...document.querySelectorAll('.sector-g')].find(x=>x.getAttribute('data-fam')==='${fam}');
      const b=g.querySelector('.sector-shape').getBoundingClientRect();
      return {x:Math.round(b.left+b.width/2), y:Math.round(b.top+b.height/2)}; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: tb.x, y: tb.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tb.x, y: tb.y, button: 'left', clickCount: 1 });
    await sleep(1200);
    boxes.push(await ev(`(() => { const wr=document.querySelector('.wheel').getBoundingClientRect();
      const f=(el)=>{const r=el.getBoundingClientRect();return {l:r.left-wr.left,t:r.top-wr.top,w:r.width,h:r.height};};
      return {state:'${fam}', wheel: Math.round(wr.width),
        tags:[...document.querySelectorAll('.disc-sector.lvl1')].concat([...document.querySelectorAll('.disc-sector.lvl2')]).map(f),
        back:(()=>{const b=document.querySelector('.wheel-back');const r=b.getBoundingClientRect();return {w:r.width,h:r.height};})()}; })()`));
  }

  /* 扫角 × 半径：胶囊中心在半径 k 的圆周上，盒按实测宽高（居中）。
     宽高取"已显示"那一态的量 —— 空态里按钮是 hidden，量出来是 0×0。
     k 也扫：贴在盘口线上（k=1）时长屏与窄屏都挤不进 118px 的胶囊，
     所以要找"刚好贴在盘沿外侧、又不压任何标签"的那一档。 */
  const wheelW = boxes[0].wheel;
  const shown = boxes.find((b) => b.back.w > 0);
  const bw = shown ? shown.back.w : 118;
  const bh = shown ? shown.back.h : 44;
  const ok = [];
  for (let k = 0.86; k <= 1.42; k += 0.02) {
    for (let deg = -180; deg < 180; deg += 2) {
      const cx = wheelW / 2 + wheelW * 0.5 * k * Math.cos((deg * Math.PI) / 180);
      const cy = wheelW / 2 + wheelW * 0.5 * k * Math.sin((deg * Math.PI) / 180);
      const bl = cx - bw / 2; const bt = cy - bh / 2;
      let hit = false;
      for (const st of boxes) {
        for (const t of st.tags) {
          if (!(t.l + t.w < bl || t.l > bl + bw || t.t + t.h < bt || t.t > bt + bh)) { hit = true; break; }
        }
        if (hit) break;
      }
      /* 允许少量外溢：窄屏页面左右各有 24px 内边距，胶囊越出盘盒一点点
         仍不会撑出横向滚动（调用方要复核 docOverflowX）。
         但也不能离盘太远 —— 上限 1.42 倍半径，再远就是"漂在盘外无依附"，
         那正是缺陷 ⑧ 要修掉的样子。 */
      const slack = 24;
      if (!hit && bl >= -slack && bt >= -slack && bl + bw <= wheelW + slack && bt + bh <= wheelW + slack) {
        ok.push([k.toFixed(2), deg]);
      }
    }
  }
  out[w + 'x' + h] = { wheelW, back: [Math.round(bw), Math.round(bh)], free: ok };
}
console.log(JSON.stringify(out, null, 1));
ws.close(); proc.kill(); process.exit(0);
