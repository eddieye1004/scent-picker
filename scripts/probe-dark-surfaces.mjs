/**
 * probe-dark-surfaces.mjs — 深色下"面/线对比度"全量扫描（结果页 + about）。
 *
 * 为什么要遍历 DOM 而不是读 CSS 字面量：
 * 结果页第 1 名卡的底是 rgba(110,139,255,.14) 叠在 --bg-2 上。
 * 直接读字面量会得到 #6E8BFF / 6.06，真实观感是 #292B37 / 1.328 —— 差五倍，
 * 足以把"这处需要提亮"判成"这处很好"。所以必须按祖先链把半透明合成到底。
 *
 * 输出：所有对比度落在 1.02–1.20 的元素（按渲染后的合成色去重）。
 * 这个区间就是"面与面分不清"的区间，也是本腿深色 tier 的验收口径。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const PW = path.join(process.env.USERPROFILE || '', '.workbuddy', 'binaries', 'node', 'workspace', 'node_modules', 'playwright-core');
const { chromium } = require(PW);
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8095';

const SCAN = `(() => {
  const parse = (s) => { const m = String(s).match(/[\\d.]+/g); if (!m) return null;
    return { r:+m[0], g:+m[1], b:+m[2], a: m.length>3 ? +m[3] : 1 }; };
  const over = (f,b) => ({ r:f.r*f.a+b.r*(1-f.a), g:f.g*f.a+b.g*(1-f.a), b:f.b*f.a+b.b*(1-f.a), a:1 });
  const comp = (el, prop) => {
    const own = parse(getComputedStyle(el)[prop]); if (!own) return null;
    let acc = own, cur = el.parentElement;
    while (cur && acc.a < 1) { const p = parse(getComputedStyle(cur).backgroundColor); if (p && p.a>0) acc = over(acc,p); cur = cur.parentElement; }
    if (acc.a < 1) { const r = parse(getComputedStyle(document.documentElement).backgroundColor); if (r) acc = over(acc,r); }
    return acc;
  };
  const hex = (c) => c ? '#'+[c.r,c.g,c.b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('').toUpperCase() : null;
  const lum = (c) => { const f=(v)=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
    return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); };
  const cr = (a,b) => { const l1=lum(a),l2=lum(b); const[x,y]=l1>l2?[l1,l2]:[l2,l1]; return (x+0.05)/(y+0.05); };

  const bgP = parse(getComputedStyle(document.body).backgroundColor);
  const rootP = parse(getComputedStyle(document.documentElement).backgroundColor);
  const pageBg = (bgP && bgP.a>=1) ? bgP : (rootP || bgP);

  const seen = new Map();
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    for (const [kind, prop] of [['bg','backgroundColor'],['border-top','borderTopColor'],['border-bottom','borderBottomColor']]) {
      const w = prop==='backgroundColor' ? null : s[prop.replace('Color','Width')];
      if (w !== null && (!w || parseFloat(w) === 0)) continue;
      const c = comp(el, prop); if (!c) continue;
      const v = cr(c, pageBg);
      if (v < 1.02 || v > 1.20) continue;
      const key = hex(c) + '|' + kind;
      const sel = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '');
      if (!seen.has(key)) seen.set(key, { color: hex(c), kind, ratio: +v.toFixed(3), sel, count: 0 });
      seen.get(key).count++;
    }
  }
  return { pageBg: hex(pageBg), items: [...seen.values()].sort((a,b)=>a.ratio-b.ratio) };
})()`;

async function toResult(page) {
  await page.click('button.disc-sector').catch(() => {});
  await page.waitForTimeout(400);
  for (let i = 0; i < 18; i++) {
    if (await page.$('.pick')) break;
    const ok = await page.evaluate(() => {
      const a = document.querySelector('.actions'); if (!a) return false;
      const b = [...a.querySelectorAll('button.btn')].filter((x) => !x.disabled && !/上一题/.test(x.textContent));
      if (!b.length) return false; b[b.length - 1].click(); return true;
    });
    if (!ok) break;
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(800);
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const out = {};
for (const [name, url, drill] of [['result', BASE + '/', true], ['about', BASE + '/about.html', false]]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', locale: 'zh-CN' });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(700);
  if (drill) await toResult(page);
  const r = await page.evaluate(SCAN);
  out[name] = r;
  console.log(`\n=== ${name}  页底 ${r.pageBg} ===`);
  if (!r.items.length) console.log('  （无元素落在 1.02–1.20：面与面已可分）');
  for (const it of r.items) {
    console.log(`  ${String(it.ratio).padEnd(6)} ${it.color}  ${it.kind.padEnd(13)} ×${String(it.count).padEnd(3)} ${it.sel}`);
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(ROOT, '_probe', 'dark-surfaces.json'), JSON.stringify(out, null, 1));
const total = Object.values(out).reduce((n, r) => n + r.items.length, 0);
console.log(`\n合计落在 1.02–1.20 的（去重后）：${total} 处`);
