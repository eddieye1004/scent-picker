/**
 * probe-visual-leg.mjs — 视觉深化腿的截图 + 实测工具（feat/visual-specimen-system）
 *
 * 为什么不用 scripts/probe-shot.mjs：那个按"步骤序号"截问卷屏，而问卷各屏属
 * 问卷腿围栏，本腿只截**非问卷屏**（结果页 / about / 加载态），并且要一次跑完
 * 「浅 × 深 × 桌面 × 移动」四档。
 *
 * 为什么必须真走到结果页而不是注入 state：结果页 DOM 由 renderResult() 按真实
 * 作答生成（编号、分数、理由、购买组）。注入 state 会截到用户走不到的页面。
 *
 * 用法：
 *   node server.js 8095 &
 *   node scripts/probe-visual-leg.mjs <outDir> <tag>
 *
 * 输出：<outDir>/{result|about|skeleton}-{light|dark}-{desktop|mobile}.png
 *       以及实测 JSON 打到 stdout。
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

const outDir = path.resolve(process.argv[2] || path.join(ROOT, '_probe', 'visual-leg'));
const tag = process.argv[3] || 'run';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8095';
const MUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

fs.mkdirSync(outDir, { recursive: true });

async function runToResult(page) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1000);
  await page.click('button.disc-sector').catch(() => {});
  await page.waitForTimeout(500);
  for (let i = 0; i < 18; i++) {
    if (await page.$('.pick')) return true;
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
    await page.waitForTimeout(700);
  }
  return !!(await page.$('.pick'));
}

/** 实测：线系分型（四种线各自的实际 computed 宽度）+ 边距仪器区 + 深色 tier 合成色。 */
const MEASURE = `(() => {
  const rules = [];
  for (const [label, sel, side] of [
    ['页眉粗线', '.masthead', 'top'],
    ['结果区线', '.result-head', 'bottom'],
    ['条目线',   'article.pick', 'top'],
    ['页脚线',   'footer.foot', 'top'],
    ['数据行线', '.pyramid', 'top'],
  ]) {
    const n = document.querySelector(sel);
    if (!n) { rules.push({ label, sel, w: null }); continue; }
    const s = getComputedStyle(n);
    rules.push({
      label, sel,
      w: s[side === 'top' ? 'borderTopWidth' : 'borderBottomWidth'],
      color: s[side === 'top' ? 'borderTopColor' : 'borderBottomColor'],
    });
  }
  const gauges = [...document.querySelectorAll('.gutter-step, .gutter-state, .gauge-rule')]
    .map((n) => ({ cls: n.className, text: (n.textContent || '').trim().slice(0, 40), w: getComputedStyle(n).width }));
  return {
    step: document.getElementById('app')?.dataset.step || null,
    pageBg: getComputedStyle(document.body).backgroundColor,
    rules, gauges,
    bodyH: document.documentElement.scrollHeight,
  };
})()`;

const shots = [];
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const rows = [];

for (const scheme of ['light', 'dark']) {
  for (const mode of ['desktop', 'mobile']) {
    const vp = mode === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
    const ctx = await browser.newContext({
      userAgent: mode === 'mobile' ? MUA : DUA,
      viewport: vp, isMobile: mode === 'mobile', hasTouch: mode === 'mobile',
      deviceScaleFactor: 1, locale: 'zh-CN', colorScheme: scheme,
    });
    const page = await ctx.newPage();

    if (mode === 'desktop') {
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(120);
      const f = path.join(outDir, `skeleton-${scheme}-${mode}.png`);
      await page.screenshot({ path: f });
      shots.push(f);
    }

    const ok = await runToResult(page);
    await page.waitForTimeout(900);
    const f = path.join(outDir, `result-${scheme}-${mode}.png`);
    await page.screenshot({ path: f });
    shots.push(f);
    const m = await page.evaluate(MEASURE);

    await page.goto(BASE + '/about.html', { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(400);
    const a = path.join(outDir, `about-${scheme}-${mode}.png`);
    await page.screenshot({ path: a });
    shots.push(a);

    const row = { scheme, mode, reachedResult: ok, ...m };
    rows.push(row);
    console.log(JSON.stringify(row));
    await ctx.close();
  }
}

await browser.close();
fs.writeFileSync(path.join(outDir, `measure-${tag}.json`), JSON.stringify(rows, null, 1));
console.log('\n截图 ' + shots.length + ' 张 → ' + outDir);
