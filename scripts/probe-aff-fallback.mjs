/**
 * probe-aff-fallback.mjs — 任务 7：候选兜底地址在移动 UA 下到底渲染成什么样。
 *
 * 目的：现在的 `s.click.taobao.com/t?e=…` 在移动 UA 下落到
 * `login.m.taobao.com`（移动版登录页，但仍是登录墙）。要判断"换一条兜底
 * 地址能不能省掉登录墙"，就得把候选逐个用真浏览器跑一遍，而不是靠印象。
 *
 * 候选：
 *   click    当前用的联盟转链（基线）
 *   uland    带 pid 的搜索推广页（有佣金，落地是搜索结果）
 *   s.m      s.m.taobao.com 移动搜索（无佣金）
 *   detail   detail.m.tb.cn 商品详情（需要数字 itemId，本仓库没有 → 只作对照）
 *
 * 用法：node scripts/probe-aff-fallback.mjs
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

const MUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

const PID = 'mm_10963225696_3443600437_116343550064';
const Q = encodeURIComponent('Creed Aventus');

const LINKS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'affiliate-links.json'), 'utf8'));
const CLICK = (LINKS.taobao || {})['creed-aventus'];

const CASES = [
  ['click', CLICK],
  ['uland', `https://uland.taobao.com/sem/tbsearch?keyword=${Q}&pid=${encodeURIComponent(PID)}`],
  ['s.m', `https://s.m.taobao.com/h5?q=${Q}`],
];

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const rows = [];
for (const [name, url] of CASES) {
  for (const mode of ['mobile', 'desktop']) {
    const ctx = await browser.newContext(mode === 'mobile'
      ? { userAgent: MUA, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, locale: 'zh-CN' }
      : { userAgent: DUA, viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, locale: 'zh-CN' });
    const page = await ctx.newPage();
    const row = { name, mode };
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(7000);
      row.final = page.url();
      row.title = await page.title();
      const info = await page.evaluate(() => ({
        text: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 160),
        vw: window.innerWidth,
        schemes: Array.from(new Set((document.documentElement.innerHTML.match(/(?:taobao|tbopen|tmall):\/\/[^"'\s\\]{0,60}/g) || []))).slice(0, 4),
        hasLoginForm: !!document.querySelector('input[type=password], #fm-login-id'),
        hasItemList: /¥|￥/.test(document.body ? document.body.innerText : ''),
      }));
      Object.assign(row, info);
      row.verdict = /login\.m?\.?taobao\.com|havanaone/.test(row.final) ? '登录页'
        : /s\.m\.taobao\.com|main\.m\.taobao\.com|h5\.m\.taobao|m\.tb\.cn/.test(row.final) ? '移动H5'
          : /s\.taobao\.com|uland/.test(row.final) ? '网页版'
            : '其他';
    } catch (e) {
      row.error = String(e && e.message || e);
    }
    await ctx.close();
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}
await browser.close();
fs.writeFileSync(path.join(ROOT, '_probe', 'aff-fallback.json'), JSON.stringify(rows, null, 1));
console.log('\n== 汇总 ==');
for (const r of rows) console.log(`${r.name.padEnd(8)} ${r.mode.padEnd(8)} ${String(r.verdict || r.error).padEnd(8)} vw=${r.vw ?? '-'}  ${String(r.final).slice(0, 90)}`);
