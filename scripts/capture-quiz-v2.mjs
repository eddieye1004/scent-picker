/**
 * capture-quiz-v2.mjs — 问卷 v2 逐屏截图（浅/深 × 桌面/移动）。
 *
 * 为什么单独写一个而不是改 probe-shot.mjs：那个是通用探针，本轮的验收要求是
 * **每一屏 + 两种配色 + 两种视口**，且要顺手采一份几何实测（每屏总高、
 * 主控件是否落在首屏内），这些只对 v2 有意义。
 *
 * 用法：先 `node server.js`，再
 *   node scripts/capture-quiz-v2.mjs [outDir]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PW = path.join(process.env.USERPROFILE || '',
  '.workbuddy', 'binaries', 'node', 'workspace', 'node_modules', 'playwright-core');
const { chromium } = require(PW);
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));

const OUT = process.argv[2]
  || path.join(process.env.USERPROFILE || '', 'work', '.legs', 'scent-quiz-v2-shots');
fs.mkdirSync(OUT, { recursive: true });

const BASE = 'http://127.0.0.1:8080/';

/* 五屏的 id，与 app.js 的 STEPS 顺序一致。
   截图靠 data-step 认屏，不靠文案 —— 文案会改，id 是契约。 */
const STEPS = ['budget', 'occasion', 'impression', 'intensity', 'anchor'];

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, isMobile: false },
  mobile: { width: 390, height: 844, isMobile: true },
};

/** 等首屏真的画完：预算屏的档位数是数据驱动的，出现即说明 price-index 到了。 */
async function waitReady(page) {
  await page.waitForSelector('.budget-seg', { timeout: 15000 });
  await page.waitForTimeout(450);
}

/** 走完全流程到结果页，返回沿途每屏的几何。 */
async function walk(page) {
  const geo = [];
  for (let i = 0; i < STEPS.length; i += 1) {
    const step = STEPS[i];
    const d = await page.evaluate(() => ({
      step: document.getElementById('app').dataset.step,
      bodyH: Math.round(document.body.scrollHeight),
      vh: window.innerHeight,
      // 主控件是否在首屏内（折叠线以上）
      mainInFold: (() => {
        const sel = ['.budget-rail', '.disc', '.imp-grid', '.halo', '.combo-input'];
        for (const s of sel) {
          const n = document.querySelector(s);
          if (n) {
            const r = n.getBoundingClientRect();
            return Math.round(r.bottom) <= window.innerHeight;
          }
        }
        return null;
      })(),
      // 触控目标最小值（本屏内所有 button 的最小边长）
      minBtn: (() => {
        const bs = [...document.querySelectorAll('button')];
        if (!bs.length) return null;
        return Math.round(Math.min(...bs.map((b) => {
          const r = b.getBoundingClientRect();
          return Math.min(r.width, r.height);
        })));
      })(),
    }));
    geo.push({ step, ...d });
    // 前进（最后一屏不点，留给 finish 单独处理）
    if (i < STEPS.length - 1) {
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('.actions button.btn')]
          .find((x) => /下一步/.test(x.textContent) && !x.disabled);
        if (b) b.click();
      });
      await page.waitForTimeout(360);
    }
  }
  return geo;
}

/** 每屏点一个选项（让"选中态"也进截图，否则截的全是空态）。 */
async function pickSomething(page, step) {
  const map = {
    budget: async () => {
      await page.click('.budget-seg:nth-child(2)');
    },
    occasion: async () => {
      /* 点 .disc-sector（真实 button），不点 .sector-g（SVG <g>）——
         <g> 被标签层压着，Playwright 会判定"被别的元素挡住"而超时。
         真实用户的命中路径也正是那个 button（app.js 的注释写过：
         可点的部分必须是真实 button，否则拿不到 44px 触控保护）。 */
      const s = await page.$$('button.disc-sector');
      if (s.length) await s[0].click();
    },
    impression: async () => {
      const t = await page.$$('.imp-toggle');
      if (t.length) await t[0].click();          // 展开第一张，展示翻面
      const p = await page.$$('.imp-pick');
      if (p.length > 1) await p[1].click();
    },
    intensity: async () => {
      /* 点第 3 档。五圈同心，Playwright 默认点元素**中心** —— 而中心恒被
         更小的圈占着，所以必须指定 position。
         点在哪：这一圈自己的下边缘内侧（环形带的下半段）——
         那里一定在它自己之内、又在更小那圈之外，是它独占的命中区。
         位置用元素自身尺寸算，不写死像素（窄屏容器只有 280px）。 */
      const sel = '.halo-ring[data-v="3"]';
      const box = await page.locator(sel).boundingBox();
      if (box) {
        await page.locator(sel).click({
          position: { x: box.width / 2, y: box.height - 8 },
        });
      }
    },
    anchor: async () => {},
  };
  if (map[step]) await map[step]();
  await page.waitForTimeout(300);
  /* 盘心换字有 180ms 的 hub-swap 淡入（`.disc-hub.is-swap`），
     选择后立刻截图会拍到**动画中段**——实测拍出来是"盘心那行字淡得几乎看不见"，
     看着像样式坏了，其实只是时机。等动画真的结束再拍。 */
  await page.waitForFunction(() => {
    const h = document.querySelector('.disc-hub');
    return !h || !h.classList.contains('is-swap');
  }, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(120);
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const report = { generatedAt: new Date().toISOString(), shots: [], geo: [] };

for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
      deviceScaleFactor: 1,
      colorScheme: scheme,
      locale: 'zh-CN',
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await waitReady(page);

    for (let i = 0; i < STEPS.length; i += 1) {
      const step = STEPS[i];
      const at = await page.evaluate(() => document.getElementById('app').dataset.step);
      if (at !== step) {
        // 兜底：用「改一题」式的直接跳转不可用（结果页才有），只能按顺序走
        await page.evaluate(() => {
          const b = [...document.querySelectorAll('.actions button.btn')]
            .find((x) => /下一步/.test(x.textContent) && !x.disabled);
          if (b) b.click();
        });
        await page.waitForTimeout(360);
      }
      await pickSomething(page, step);
      const file = path.join(OUT, `quiz-${step}-${vpName}-${scheme}.png`);
      await page.screenshot({ path: file, fullPage: true });
      report.shots.push({ step, viewport: vpName, scheme, file });
      if (i < STEPS.length - 1) {
        await page.evaluate(() => {
          const b = [...document.querySelectorAll('.actions button.btn')]
            .find((x) => /下一步/.test(x.textContent) && !x.disabled);
          if (b) b.click();
        });
        await page.waitForTimeout(360);
      }
    }

    /* 结果页：点「看推荐」 */
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.actions button.btn')]
        .find((x) => /看推荐/.test(x.textContent));
      if (b) b.click();
    });
    await page.waitForTimeout(1400);
    const resFile = path.join(OUT, `result-${vpName}-${scheme}.png`);
    await page.screenshot({ path: resFile, fullPage: true });
    report.shots.push({ step: 'result', viewport: vpName, scheme, file: resFile });

    /* 结果页的两个出口：单独截一张（展开「改一题重推」） */
    await page.evaluate(() => {
      const d = document.querySelector('.edit-wrap');
      if (d) d.open = true;
    });
    await page.waitForTimeout(300);
    const outFile = path.join(OUT, `result-outlets-${vpName}-${scheme}.png`);
    await page.screenshot({ path: outFile, fullPage: false });
    report.shots.push({ step: 'result-outlets', viewport: vpName, scheme, file: outFile });

    /* 几何：结果页与出口 */
    const resGeo = await page.evaluate(() => ({
      step: document.getElementById('app').dataset.step,
      cards: document.querySelectorAll('.pick').length,
      shareItems: document.querySelectorAll('.share-item').length,
      hasNextBatch: !!document.querySelector('[data-act="next-batch"]'),
      hasEdit: !!document.querySelector('.edit-sum'),
      editItems: document.querySelectorAll('[data-edit]').length,
      bodyH: Math.round(document.body.scrollHeight),
    }));
    report.geo.push({ viewport: vpName, scheme, ...resGeo, errors });

    if (vpName === 'desktop' && scheme === 'light') {
      // 只有一套走完整几何采集（省时间，且各套几何应一致）
      const ctx2 = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1, colorScheme: 'light', locale: 'zh-CN',
      });
      const p2 = await ctx2.newPage();
      await p2.goto(BASE, { waitUntil: 'networkidle' });
      await waitReady(p2);
      report.steps = await walk(p2);
      await ctx2.close();
    }
    await ctx.close();
  }
}

await browser.close();

fs.writeFileSync(path.join(OUT, 'capture-report.json'), JSON.stringify(report, null, 1));
console.log(`shots: ${report.shots.length} → ${OUT}`);
console.log('geo:', JSON.stringify(report.geo));
if (report.steps) console.log('steps:', JSON.stringify(report.steps));
