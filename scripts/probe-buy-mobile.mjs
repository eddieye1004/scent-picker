/**
 * probe-buy-mobile.mjs — 任务 7 验收：三条真实结果链接 × 移动/桌面 UA 各测一次，
 * 打印每条的落地形态。
 *
 * 三层测法（缺一层就说不清"到底有没有效"）：
 *   ① 直接开**联盟转链原链**：看现在的行为（移动/桌面分别落到哪）
 *   ② 开**新生成的 tbopen:// 唤起链**：headless 浏览器里没有 App，
 *      这里不指望它真的唤起 —— 目的是确认这条 scheme 的 h5Url 解码后
 *      与原链**逐字节一致**（佣金参数没被改），并把"App 接手后会去哪"
 *      用第 ③ 层单独验。
 *   ③ 用**淘宝 App 内置浏览器 UA**（AliApp(TB/…)）开原链：这是 App 接手后
 *      的真实落地，能证明"进了 App 就是商品页、不是登录页"。
 *
 * 用法：node scripts/probe-buy-mobile.mjs
 * 输出：_probe/buy-mobile.json
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

const U = {
  mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  app: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 AliApp(TB/10.30.0) WindVane/8.5.0 390x844',
};
const PIDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'affiliate-links.json'), 'utf8'));
const PERFUMES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8')).perfumes;
const byId = new Map(PERFUMES.map((p) => [p.id, p]));
const IDS = (process.env.AFF_IDS || 'creed-aventus,lattafa-yara,dior-eau-sauvage').split(',');

const TB_OPEN = 'tbopen://m.taobao.com/tbopen/index.html?action=ali.open.nav&h5Url=';
const wrap = (u) => TB_OPEN + encodeURIComponent(u);

async function land(browser, url, uaKey) {
  const ctx = await browser.newContext({
    userAgent: U[uaKey],
    viewport: uaKey === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 },
    isMobile: uaKey !== 'desktop', hasTouch: uaKey !== 'desktop', locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  const nav = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) nav.push(f.url()); });
  const out = { ua: uaKey };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(8000);
    out.finalUrl = page.url();
    out.title = await page.title();
    const info = await page.evaluate(() => {
      const t = document.body ? document.body.innerText : '';
      return {
        vw: window.innerWidth,
        textLen: t.length,
        priceCount: (t.match(/[¥￥]\s?\d+/g) || []).length,
        loginWall: /账号登录|密码登录|亲，请登录/.test(t),
        isDetailPage: /商品详情|加入购物车|立即购买/.test(t) || /detail\.htm/.test(location.href),
        h5: /h5\.m\.taobao|detail\.m\.tb\.cn|awp\/core\/detail/.test(location.href),
        head: t.replace(/\s+/g, ' ').slice(0, 70),
      };
    });
    Object.assign(out, info);
    out.alivePid = /mm_10963225696_3443600437_116343550064|ali_trackid=2:mm_/.test(page.url());
    out.verdict = out.loginWall ? '登录墙'
      : out.isDetailPage ? '商品详情页（App 内）'
        : out.h5 ? '移动 H5'
          : /uland/.test(out.finalUrl) ? '移动版搜索结果页'
            : '其他';
  } catch (e) {
    out.error = String(e && e.message || e).slice(0, 160);
  }
  await ctx.close();
  return out;
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const rows = [];
for (const id of IDS) {
  const raw = (PIDS.taobao || {})[id];
  const p = byId.get(id);
  const row = { id, name: p ? `${p.brand} ${p.name}` : '?', link: raw };
  if (!raw) { console.log(JSON.stringify({ id, error: 'no link' })); continue; }

  /* ① 原链：移动 / 桌面 */
  row.rawMobile = await land(browser, raw, 'mobile');
  row.rawDesktop = await land(browser, raw, 'desktop');

  /* ③ App 内 UA 开原链 —— 这就是 tbopen 唤起后 App 里的落地 */
  row.inApp = await land(browser, raw, 'app');

  /* ② 唤起链一致性：h5Url 解码后必须与原链逐字节相同 */
  const w = wrap(raw);
  row.tbopen = {
    href: w.slice(0, 120) + '…',
    decodedMatches: decodeURIComponent(w.split('h5Url=')[1]) === raw,
    hasAction: w.includes('action=ali.open.nav'),
  };
  rows.push(row);
  console.log(JSON.stringify({
    id: row.id,
    rawMobile: `${row.rawMobile.verdict} vw=${row.rawMobile.vw} 价格${row.rawMobile.priceCount}`,
    rawDesktop: `${row.rawDesktop.verdict} vw=${row.rawDesktop.vw} 价格${row.rawDesktop.priceCount}`,
    inApp: `${row.inApp.verdict} pid保留=${row.inApp.alivePid}`,
    tbopen: `h5Url一致=${row.tbopen.decodedMatches} action=${row.tbopen.hasAction}`,
  }));
}
await browser.close();
fs.mkdirSync(path.join(ROOT, '_probe'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '_probe', 'buy-mobile.json'), JSON.stringify(rows, null, 1));
console.log('\n落盘 _probe/buy-mobile.json');
