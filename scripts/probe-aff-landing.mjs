/**
 * probe-aff-landing.mjs — 任务 7 实测：一条淘宝转链在**移动 UA** 与**桌面 UA** 下
 * 最终落到哪种页面。
 *
 * 为什么需要真浏览器：`s.click.taobao.com/t?e=...` 的每一跳都是 200 + 一段
 * `real_jump_address` 的 JS 自动跳转（实测连跳 6 次仍是同一形态，curl 跟不动），
 * 而且"是否唤起 App / 落到移动版还是桌面版"取决于 UA、触屏能力、以及页面里
 * 有没有 `taobao://` / `tbopen://` 这类 scheme。这三件事只有真浏览器能给答案。
 *
 * 这里用本机 Edge + playwright-core（不下载 Chromium），给两种设备画像：
 *   desktop：1440×900，Windows UA，无触屏
 *   mobile ：390×844，iPhone UA，touch + mobile=true
 *
 * 用法：
 *   node scripts/probe-aff-landing.mjs            # 三条抽样 × 两种 UA
 *   node scripts/probe-aff-landing.mjs <id> ...   # 指定 perfume id
 *   AFF_URL="https://..." node scripts/probe-aff-landing.mjs --url
 * 输出：JSON（每行一条），另存 _probe/aff-landing.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const PW = process.env.PLAYWRIGHT_CORE_DIR
  || path.join(process.env.USERPROFILE || '', '.workbuddy', 'binaries', 'node', 'workspace', 'node_modules', 'playwright-core');
let chromium;
try { ({ chromium } = require(PW)); } catch (e) {
  console.error('拿不到 playwright-core：' + PW + '\n' + (e && e.message));
  process.exit(2);
}

const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge'); process.exit(2); }

const UA = {
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

const table = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'affiliate-links.json'), 'utf8'));
const args = process.argv.slice(2);
let targets;
if (args[0] === '--url') {
  targets = [['(adhoc)', process.env.AFF_URL]];
} else if (args.length) {
  targets = args.map((id) => [id, (table.taobao || {})[id]]);
} else {
  targets = ['creed-aventus', 'lattafa-yara', 'dior-eau-sauvage']
    .map((id) => [id, (table.taobao || {})[id]]);
}

function classify(finalUrl, info) {
  const u = String(finalUrl || '');
  const html = info.html || '';
  const marks = [];
  if (/login\.taobao\.com|passport\.taobao|login\.tmall/.test(u)) marks.push('登录页(桌面)');
  if (/detail\.tmall\.com|item\.taobao\.com/.test(u)) marks.push('桌面商品页');
  if (/m\.tb\.cn|main\.m\.taobao\.com|h5\.m\.taobao\.com|detail\.m\.tb\.cn/.test(u)) marks.push('移动版落地');
  if (/market\.m\.taobao\.com|s\.m\.taobao\.com/.test(u)) marks.push('移动搜索页');
  if (/taobao:\/\/|tbopen:\/\/|openapp\.m\.taobao/.test(html)) marks.push('页面内含 App scheme');
  if (info.navigatedToApp) marks.push('真发起过外部协议跳转');
  if (/请登录|亲，请登录|立即登录/.test(html)) marks.push('含登录墙文案');
  if (info.visibleText && /未找到|没有找到|抱歉/.test(info.visibleText)) marks.push('无结果');
  return marks;
}

const out = [];
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
for (const [id, url] of targets) {
  if (!url) { console.log(JSON.stringify({ id, error: 'no url' })); continue; }
  for (const mode of ['desktop', 'mobile']) {
    const ctx = await browser.newContext(mode === 'mobile'
      ? { userAgent: UA.mobile, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, locale: 'zh-CN' }
      : { userAgent: UA.desktop, viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, locale: 'zh-CN' });
    const page = await ctx.newPage();
    const rec = { id, mode, startUrl: url.slice(0, 90) + '…', navigations: [], appScheme: [] };
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) rec.navigations.push(f.url().slice(0, 200));
    });
    /* 外部协议（taobao:// 等）在 headless 里不会真的开 App，但 CDP 能截到这次尝试。
       截不到就退化为"页面里有没有 scheme"，两者都记，别混为一谈。 */
    try {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Page.enable');
      await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
    } catch { /* 没有 CDP 也能测落地形态 */ }
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(7000);
      rec.finalUrl = page.url();
      rec.title = await page.title();
      const info = await page.evaluate(() => {
        const html = document.documentElement.innerHTML.slice(0, 300000);
        return {
          html,
          vw: window.innerWidth,
          visibleText: document.body ? document.body.innerText.slice(0, 600) : '',
          hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
          schemeHits: (html.match(/taobao:\/\/[^"'\s]{0,80}/g) || []).slice(0, 5),
        };
      });
      rec.viewportWidth = info.vw;
      rec.hasViewportMeta = info.hasViewportMeta;
      rec.schemeHits = info.schemeHits;
      rec.visibleText = info.visibleText.replace(/\s+/g, ' ').slice(0, 220);
      rec.marks = classify(rec.finalUrl, info);
      rec.navCount = rec.navigations.length;
      rec.lastHops = rec.navigations.slice(-4).map((x) => x.slice(0, 120));
    } catch (e) {
      rec.error = String(e && e.message || e);
      try { rec.finalUrl = page.url(); } catch {}
    }
    await ctx.close();
    out.push(rec);
    console.log(JSON.stringify(rec));
  }
}
await browser.close();

const dir = path.join(ROOT, '_probe');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'aff-landing.json');
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log('\n== 汇总 ==');
for (const r of out) {
  console.log(`${String(r.id).padEnd(18)} ${r.mode.padEnd(8)} ${(r.marks || []).join(' / ') || '(无标记)'}`);
  console.log(`   final: ${String(r.finalUrl).slice(0, 130)}`);
}
console.log('\n落盘: ' + file);
