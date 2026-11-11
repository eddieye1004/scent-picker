/**
 * probe-print.mjs — D6 实测：@media print 到底生不生效
 *
 * 为什么必须真跑：这条一直是「逻辑写了，没跑过打印预览」。CSS 的 @media print
 * 有不少陷阱 —— 变量改回去了但被后层覆盖、display:none 写在小屏分支里、
 * print-color-adjust 需要 -webkit- 前缀等。只有渲染一次才知道。
 *
 * 做法：Playwright 以 media='print' 打开结果页，逐条读计算样式，
 * 并导出一张 PDF 供人眼复核。
 *
 * 用法：node scripts/probe-print.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const PW = path.join(process.env.USERPROFILE || '', '.workbuddy', 'binaries', 'node', 'workspace', 'node_modules', 'playwright-core');
const { chromium } = require(PW);
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));

const BASE = process.env.BASE_URL || 'http://localhost:8099';
const DUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await browser.newContext({ userAgent: DUA, viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1200);
await page.click('button.disc-sector').catch(() => {});
await page.waitForTimeout(600);
for (let i = 0; i < 16; i++) {
  if (await page.$('.pick')) break;
  const clicked = await page.evaluate(() => {
    const acts = document.querySelector('.actions');
    if (!acts) return false;
    const btns = [...acts.querySelectorAll('button.btn')].filter((b) => !b.disabled && !/上一题/.test(b.textContent));
    if (!btns.length) return false;
    btns[btns.length - 1].click();
    return true;
  });
  if (!clicked) break;
  await page.waitForTimeout(900);
}
const reached = !!(await page.$('.pick'));

/* 切到 print media */
await page.emulateMedia({ media: 'print' });
await page.waitForTimeout(300);

/* 逐条读计算样式 —— 这就是「有没有生效」的硬证据 */
const probe = await page.evaluate(() => {
  const cs = (sel, prop) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return getComputedStyle(el)[prop];
  };
  const root = getComputedStyle(document.documentElement);
  const out = {
    /* ① 10-foundation: body 背景白 + progress/actions/skeleton 隐藏 */
    bodyBg: cs('body', 'backgroundColor'),
    progressDisplay: cs('.progress', 'display'),
    actionsDisplay: cs('.actions', 'display'),
    /* ② 40-theme: print 变量改回浅色 */
    rootBg: root.getPropertyValue('--bg').trim(),
    rootInk: root.getPropertyValue('--ink').trim(),
    rootBlue: root.getPropertyValue('--blue').trim(),
    /* ③ 50-results: 按钮去底色改描边 */
    buyShadow: cs('.pick-foot .buy-link', 'boxShadow'),
    buyBorder: cs('.pick-foot .buy-link', 'borderTopColor'),
    buyBg: cs('.pick-foot .buy-link', 'backgroundColor'),
    /* ④ 50-results: 实物图去背景/阴影 */
    artBg: cs('.pick-art.is-photo', 'backgroundImage'),
    artShadow: cs('.pick-art.is-photo', 'boxShadow'),
  };
  /* 统计仍可见的按钮数 —— 打印稿不该带一堆交互按钮 */
  out.visibleBuyLinks = [...document.querySelectorAll('.buy-link')]
    .filter((a) => getComputedStyle(a).display !== 'none').length;
  out.pickCount = document.querySelectorAll('article.pick').length;
  out.bodyBgComputed = getComputedStyle(document.body).backgroundColor;
  return out;
});

/* 导出 PDF 供人眼复核 */
const pdfPath = path.join(ROOT, '_probe', 'print-result.pdf');
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });

/* 同时截一张 print media 下的 PNG（比 PDF 好读） */
const pngPath = path.join(ROOT, '_probe', 'print-result.png');
await page.screenshot({ path: pngPath, fullPage: false });

console.log(JSON.stringify({
  reached,
  mediaApplied: await page.evaluate(() => matchMedia('print').matches),
  probe,
  pdf: pdfPath,
  png: pngPath,
}, null, 1));

await browser.close();
