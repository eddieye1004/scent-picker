/**
 * probe-36px.mjs — 图形验收线：「36px 不看文字可辨形」的客观判据。
 *
 * 研读第五节点名立为全站图形验收线：任何图形元素小尺寸下脱离文字认不出，
 * 就是装饰，删或重画。本腿新增/改动的图形只有一类 ——
 * 结果页左缘的**边距仪器区**（1px 竖轴 + 每 8px 一道的刻度）。
 * 它是"刻度"，不是"装饰"：判据是缩到 36px 后**刻度仍然彼此分离**，
 * 糊成一条实线就等于"看不出这是尺"，按研读的说法应当删掉。
 *
 * 做法（不依赖图像库）：
 *   ① 把仪器区那一条按原生尺寸截下来；
 *   ② 在页面 canvas 里重采样到 36px 高；
 *   ③ 读回像素，沿竖直方向统计"明暗游程"（run）。
 *      游程数 >= 3 说明刻度分离；= 1 说明糊成一片。
 *
 * 用法：node scripts/probe-36px.mjs <outDir>
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
const outDir = process.argv[2] || path.join(ROOT, '_probe', 'a11y');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

async function toResult(page) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.click('button.disc-sector').catch(() => {});
  await page.waitForTimeout(400);
  for (let i = 0; i < 18; i++) {
    if (await page.$('.pick')) break;
    const ok = await page.evaluate(() => {
      const a = document.querySelector('.actions'); if (!a) return false;
      const bs = [...a.querySelectorAll('button.btn')].filter((x) => !x.disabled && !/上一题/.test(x.textContent));
      if (!bs.length) return false;
      bs[bs.length - 1].click(); return true;
    });
    if (!ok) break;
    await page.waitForTimeout(650);
  }
  await page.waitForTimeout(700);
}

const results = [];
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, locale: 'zh-CN' });
  const page = await ctx.newPage();
  await toResult(page);

  const box = await page.evaluate(() => {
    const rh = document.querySelector('.result-head');
    const r = rh.getBoundingClientRect();
    return { x: Math.floor(r.left - 22), y: Math.floor(r.top), width: 26, height: 150 };
  });

  const raw = path.join(outDir, `gutter-axis-${scheme}.png`);
  await page.screenshot({ path: raw, clip: box });
  const b64 = (await page.screenshot({ clip: box })).toString('base64');

  /* 把页面实际底色亮度交给 canvas 里那段判据，避免"猜深浅色" */
  await page.evaluate(() => {
    const c = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
    window.__bgLum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  });

  /* 在页面里重采样到 36px 高，再读像素做游程分析 */
  const analysis = await page.evaluate(async ({ b64, targetH }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
    const scale = targetH / img.height;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(img.width * scale));
    cv.height = targetH;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, cv.width, cv.height);

    /* 取竖轴所在的列：裁切框从 r.left-22 开始，轴在 -18px 处，
       所以轴落在裁切图内 x≈4。刻度宽 5px（x≈4..8）。
       沿这几列求每行**最暗值**，再做二值化游程 —— 只看轴不上正文。 */
    const X0 = 4, X1 = 9;
    const px = g.getImageData(0, 0, cv.width, cv.height).data;
    const rows = [];
    for (let y = 0; y < cv.height; y++) {
      let min = 255;
      for (let x = X0; x < Math.min(X1, cv.width); x++) {
        const i = (y * cv.width + x) * 4;
        const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        if (lum < min) min = lum;
      }
      rows.push(min);
    }
    const lo = Math.min(...rows), hi = Math.max(...rows);
    const mid = (lo + hi) / 2;
    /* 判据要区分深浅色：
       浅色 → 刻度比纸底**暗**，v <= mid 为"有刻度"；
       深色 → 刻度比页底**亮**，v >= mid 为"有刻度"。
       用 lo/hi 与页面实际底色比较来决定方向，而不是猜。 */
    const bgLum = typeof window.__bgLum === 'number' ? window.__bgLum : (lo + hi) / 2;
    const brightTicks = hi >= bgLum;   /* 刻度比底亮 */
    let runs = 0, prev = null;
    const seq = [];
    for (const v of rows) {
      const cur = brightTicks ? (v >= mid ? 1 : 0) : (v <= mid ? 1 : 0);
      seq.push(cur);
      if (prev === null || cur !== prev) runs++;
      prev = cur;
    }
    const darkRows = seq.filter((v) => v === 1).length;
    return {
      canvasW: cv.width, canvasH: cv.height,
      lo: Math.round(lo), hi: Math.round(hi), mid: Math.round(mid),
      brightTicks, runs, darkRows,
      /* 游程/2 约等于"能数出来的刻度数" */
      ticksReadable: Math.floor(runs / 2),
      pattern: seq.join(''),
    };
  }, { b64, targetH: 36 });

  const verdict = analysis.runs >= 5 ? 'pass' : (analysis.runs >= 3 ? 'weak' : 'fail');
  results.push({ scheme, ...analysis, verdict });
  console.log(`${scheme.padEnd(6)} runs=${String(analysis.runs).padEnd(3)} ticks~${String(analysis.ticksReadable).padEnd(3)} lo=${analysis.lo} hi=${analysis.hi} => ${verdict}`);
  console.log(`       pattern ${analysis.pattern}`);
  await ctx.close();
}

await browser.close();
fs.writeFileSync(path.join(outDir, 'gutter-36px.json'), JSON.stringify(results, null, 1));
console.log('\n落盘 ' + path.join(outDir, 'gutter-36px.json'));
const allPass = results.every((r) => r.verdict !== 'fail');
console.log(allPass ? '36px 辨形：通过（刻度可数）' : '36px 辨形：至少有 1 个方案糊成一片 → 按研读应删或重画');
