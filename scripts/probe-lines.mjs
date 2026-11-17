/**
 * probe-lines.mjs — 线系分型实测（结果页 + about + 加载态）。
 *
 * 目标不是"看看有没有线"，而是回答分型表里每一型**是否真的有粗细差**：
 * 页眉粗线 / 区块分隔 / 条目线 / 数据行线 / 刻度线。
 * 同时点出"整圈包框"（四边都有 border 的容器）——那是任务要删的模板式结构。
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
  const out = { rules: [], boxes: [] };
  const named = [
    ['页眉粗线', '.masthead', 'top'],
    ['区块分隔(结果)', '.result-head', 'bottom'],
    ['区块分隔(页脚)', 'footer.foot', 'top'],
    ['条目线(base)', 'article.pick', 'top'],
    ['条目线(last)', 'article.pick:last-of-type', 'bottom'],
    ['数据行线', '.pyramid', 'top'],
    ['摘要卡头条', '.share-list', 'top'],
    ['摘要条目线', '.share-item', 'bottom'],
  ];
  for (const [label, sel, side] of named) {
    const n = document.querySelector(sel);
    if (!n) { out.rules.push({ label, sel, w: 'MISSING' }); continue; }
    const s = getComputedStyle(n);
    out.rules.push({ label, sel, w: s[side === 'top' ? 'borderTopWidth' : 'borderBottomWidth'],
      color: s[side === 'top' ? 'borderTopColor' : 'borderBottomColor'] });
  }
  /* 整圈包框：四边都有非 0 border 的可见容器 */
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 12) continue;
    const t = parseFloat(s.borderTopWidth) || 0;
    const b = parseFloat(s.borderBottomWidth) || 0;
    const l = parseFloat(s.borderLeftWidth) || 0;
    const rr = parseFloat(s.borderRightWidth) || 0;
    if (t > 0 && b > 0 && l > 0 && rr > 0) {
      const cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : el.tagName.toLowerCase();
      out.boxes.push({ sel: cls, w: [t, rr, b, l].join('/'), color: s.borderTopColor, size: Math.round(r.width) + 'x' + Math.round(r.height) });
    }
  }
  return out;
})()`;

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
for (const [name, url, drill] of [['result', BASE + '/', true], ['about', BASE + '/about.html', false]]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', locale: 'zh-CN' });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(700);
  if (drill) {
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
    await page.waitForTimeout(700);
  }
  const r = await page.evaluate(SCAN);
  console.log(`\n=== ${name} · 线系分型 ===`);
  for (const x of r.rules) console.log(`  ${x.label.padEnd(16)} ${String(x.w).padEnd(9)} ${x.color || ''}   [${x.sel}]`);
  console.log(`  --- 整圈包框 ${r.boxes.length} 处 ---`);
  for (const b of r.boxes) console.log(`    ${b.sel.padEnd(34)} ${b.w.padEnd(14)} ${b.color.padEnd(18)} ${b.size}`);
  await ctx.close();
}
await browser.close();
