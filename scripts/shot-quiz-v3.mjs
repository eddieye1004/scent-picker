/**
 * shot-quiz-v3.mjs — 问卷 v3 逐屏截图（浅色 + 深色，桌面 + 移动）
 *
 * 口径（与 docs/DEPLOY.md 的视觉验收一致）：
 *   桌面 1440×900 / 移动 390×844，deviceScaleFactor 1，locale zh-CN。
 *   每一屏各出一张浅色、一张深色；另出"环境线对比"一组（第 3 屏 vs 第 8 屏，
 *   两张并排能看出底色连续变化）、结果页、以及移动端三张关键屏。
 *
 * 走位：用真实的点击序列走完九屏（不注入 state）—— 截图必须来自用户真能
 * 走到的路径，否则拍的是"我以为的界面"而不是"用户的界面"。
 *
 * 用法：node scripts/shot-quiz-v3.mjs <输出目录> [baseUrl]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* playwright-core 在本机不是一个装进仓里的依赖（仓库零外部依赖是硬约束）。
   它装在 WorkBuddy 的 node 工作区里。找不到就直接报错退出，不静默跳过 ——
   静默跳过会让人以为"截图已出"，实际上一张都没有。 */
const PW_CANDIDATES = [
  path.join(process.env.USERPROFILE || '', '.workbuddy', 'binaries', 'node', 'workspace', 'node_modules', 'playwright-core'),
  'playwright-core',
];
let chromium = null;
for (const p of PW_CANDIDATES) {
  try { ({ chromium } = require(p)); break; } catch { /* 继续找 */ }
}
if (!chromium) {
  console.error('✗ 找不到 playwright-core。它应装在 ~/.workbuddy/binaries/node/workspace/node_modules/');
  process.exit(1);
}

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
if (!EDGE) {
  console.error('✗ 找不到本机 Edge');
  process.exit(1);
}

const OUT = process.argv[2];
const BASE = process.argv[3] || 'http://127.0.0.1:8123';
if (!OUT) {
  console.error('用法：node scripts/shot-quiz-v3.mjs <输出目录> [baseUrl]');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

/* 九屏的 id 与"走到这一屏要做什么"。
   walk 是到达该屏之后、截图之前要做的交互（选一个选项），
   因为要拍 **选中态** —— 空屏拍出来看不出这一屏的反馈形式。 */
const STEPS = [
  { id: 'family',   pick: async (p) => { await p.locator('.disc-sector.lvl1').first().click(); await p.waitForTimeout(420); } },
  { id: 'budget',   pick: async (p) => { await p.locator('.shelf-seg').nth(2).click(); await p.waitForTimeout(260); } },
  { id: 'wanted',   pick: async (p) => { await p.locator('.scene').nth(0).click(); await p.locator('.scene').nth(8).click(); await p.waitForTimeout(320); } },
  { id: 'avoid',    pick: async (p) => { await p.locator('.scene').nth(3).click(); await p.waitForTimeout(260); } },
  { id: 'mood',     pick: async (p) => { await p.locator('.choice').nth(2).click(); await p.waitForTimeout(260); } },
  { id: 'occasion', pick: async (p) => { await p.locator('.arc-tick').nth(3).click(); await p.waitForTimeout(320); } },
  { id: 'season',   pick: async (p) => { await p.locator('.temp-band .band-seg').nth(2).click(); await p.waitForTimeout(280); } },
  { id: 'concentration', pick: async (p) => { await p.locator('.choice').nth(1).click(); await p.waitForTimeout(280); } },
  { id: 'anchor',   pick: async () => {} },
];

async function shoot(browser, { width, height, scheme, tag }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    colorScheme: scheme,
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  /* 等首屏真的画出来（loader 消失）。不等就截会拍到骨架屏。 */
  await page.waitForSelector('.disc-sector', { timeout: 15000 });
  await page.waitForTimeout(380);

  const shots = [];
  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    /* 到达该屏之后再交互 —— 第一步已经在首屏，不需要点"下一步"。 */
    if (i > 0) {
      await page.locator('.actions .btn', { hasText: '下一步' }).first().click();
      await page.waitForTimeout(420);
    }
    /* 环境的过渡是 1.15s，等它稳定再截，否则每张图都停在插值中途。 */
    await page.waitForTimeout(1180);
    await step.pick(page);
    await page.waitForTimeout(240);
    const f = path.join(OUT, `quiz-${tag}-${String(i + 1).padStart(2, '0')}-${step.id}.png`);
    await page.screenshot({ path: f, fullPage: false });
    shots.push(f);
    if (tag === 'desktop-light' || tag === 'desktop-dark') {
      /* 首屏与结果页各补一张整页图：逐屏图只拍视口，
         看不到"这一屏往下还有什么"，验收时需要两种都有。 */
      if (i === 0) {
        await page.screenshot({ path: path.join(OUT, `quiz-${tag}-00-full.png`), fullPage: true });
      }
    }
  }

  /* 结果页：末屏之后点「看推荐」。 */
  await page.locator('.actions .btn', { hasText: '看推荐' }).first().click();
  await page.waitForTimeout(900);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, `quiz-${tag}-10-result.png`), fullPage: false });
  await page.screenshot({ path: path.join(OUT, `quiz-${tag}-10-result-full.png`), fullPage: true });
  shots.push('result');

  await ctx.close();
  return { errs, shots };
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const report = {};
try {
  for (const [tag, w, h, scheme] of [
    ['desktop-light', 1440, 900, 'light'],
    ['desktop-dark', 1440, 900, 'dark'],
    ['mobile-light', 390, 844, 'light'],
    ['mobile-dark', 390, 844, 'dark'],
  ]) {
    report[tag] = await shoot(browser, { width: w, height: h, scheme, tag });
    console.log(`✓ ${tag}：${report[tag].shots.length} 张，页面错误 ${report[tag].errs.length} 条`);
  }
} finally {
  await browser.close();
}

/* 页面错误必须报出来：截图看起来正常但控制台在报错，是最容易漏的一类。
   它不算"截图失败"，但必须让人看见。 */
const allErrs = Object.entries(report).flatMap(([k, v]) => v.errs.map((e) => `${k}: ${e}`));
fs.writeFileSync(path.join(OUT, '_errors.json'), JSON.stringify(allErrs, null, 2));
if (allErrs.length) {
  console.log(`\n⚠️ 页面错误 ${allErrs.length} 条（见 _errors.json）：`);
  allErrs.slice(0, 8).forEach((e) => console.log('   ' + e));
} else {
  console.log('\n✓ 四组截图全程无 JS 错误');
}
console.log(`\n输出目录：${OUT}`);

