/**
 * probe-result-mobile.mjs — 任务 7 端到端：真在页面里走到结果页，**用真手机的
 * 视口 + UA 点一下淘宝按钮**，把浏览器实际收到的导航地址与落地形态打出来。
 *
 * 与 probe-buy-mobile.mjs 的分工：那边测"链接本身"，这边测"页面渲染出来的
 * 按钮到底指向哪、点了之后发生什么"。两条都跑过才算验收。
 *
 * 用法：
 *   node server.js 8099 &
 *   node scripts/probe-result-mobile.mjs
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

const BASE = process.env.BASE_URL || 'http://localhost:8099';
const MUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

/** 走完流程到结果页：点一次圆盘扇区，其余屏一律点 .actions 里的最后一个 .btn。 */
async function runToResult(ctx) {
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1200);
  await page.click('button.disc-sector').catch(() => {});
  await page.waitForTimeout(600);
  for (let i = 0; i < 16; i++) {
    if (await page.$('.pick')) return page;
    const clicked = await page.evaluate(() => {
      const acts = document.querySelector('.actions');
      if (!acts) return false;
      const btns = [...acts.querySelectorAll('button.btn')]
        .filter((b) => !b.disabled && !/上一题/.test(b.textContent));
      if (!btns.length) return false;
      btns[btns.length - 1].click();
      return true;
    });
    if (!clicked) break;
    await page.waitForTimeout(900);
  }
  return page;
}

const rows = [];
for (const mode of ['mobile', 'desktop']) {
  const ctx = await browser.newContext(mode === 'mobile'
    ? { userAgent: MUA, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, locale: 'zh-CN' }
    : { userAgent: DUA, viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await runToResult(ctx);
  const row = { mode };
  row.reachedResult = !!(await page.$('.pick'));
  const info = await page.evaluate(() => {
    const tb = [...document.querySelectorAll('.buy-link')].filter((a) => a.dataset.platform === 'taobao');
    return {
      count: tb.length,
      first: tb[0] ? {
        href: tb[0].getAttribute('href'),
        target: tb[0].getAttribute('target'),
        web: tb[0].dataset.web || null,
        fallback: tb[0].dataset.fallback || null,
        hasOnclick: !!tb[0].onclick || tb[0].hasAttribute('onclick') || !!tb[0]._listeners,
        label: tb[0].textContent.replace(/\s+/g, ' ').slice(0, 24),
      } : null,
      isAppClass: tb.every((a) => a.classList.contains('is-app')),
    };
  });
  Object.assign(row, info);
  rows.push(row);
  console.log(JSON.stringify(row));
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(ROOT, '_probe', 'result-mobile.json'), JSON.stringify(rows, null, 1));
console.log('\n落盘 _probe/result-mobile.json');
