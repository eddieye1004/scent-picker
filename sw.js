/* sw.js — 离线壳（Qoder 改造 3）
 *
 * 策略只有两条：
 *   ① 导航请求网络优先，断网回 index.html —— 这样用户永远先拿到最新版本；
 *   ② 静态资源（JS/CSS/字体/数据/图标/实物图）缓存优先 + 后台更新 ——
 *      首屏不再等网络，断网也能走完八屏并出结果（联网用到过的重量资产
 *      才进缓存，边界见下面 CORE 的注释）。
 *
 * 只缓存同源 GET。跨域、非 GET、chrome-extension 一律放行，不拦。
 */
/* 2026-11-19：中文 webfont 退场（DECISIONS D71），CORE 去掉
   fonts/noto-sans-sc-subset.woff2；VERSION 跟着进一位，让旧缓存整套失效 ——
   静态资源是 cache-first + ignoreSearch，只改文件不换缓存名会一直吐旧副本。
   同日 CORE 瘦身：perfumes.json 与 24 枚标本 SVG 移出预缓存 → v2-20261119b。 */
/* 2026-11-23：心仪清单 L2 上线（结果页 ♡ 入口），app.js 与 styles.css
   都变了 —— VERSION 进一位，让旧缓存整套失效。
   （这条纪律的原因见上一段：静态资源 cache-first + ignoreSearch。） */
/* 2026-11-23：试香盖章上线（档案每瓶盖章位 + 五档面板），app.js 与 styles.css
   都变了、并新增 src/stamp.js / src/stamp-ui.js 两个模块 —— VERSION 再进一位，
   两个新模块同时加进 CORE（它们是盖章的唯一实现，缺了就只剩未盖章态）。 */
/* 2026-11-23：盖章入口补到心仪清单每行（复用同一枚 stampSlot），app.js 与
   styles.css 再变一次 —— VERSION 跟着进一位。没有新增模块，CORE 不动。 */
const VERSION = 'v2-20261124a';
/* 2026-11-23（冻结线）：CORE 加入 src/season-copy.js（季节屏 24 句）。它是 app.js
   的静态导入，缺了会让整个 module 图加载失败 —— 离线时不是"少一行文案"，
   是白屏。VERSION 跟一位。
   2026-11-23（C 腿）：盘心大类图标上线，app.js 与 styles.css 都改了，
   VERSION 再跟一位。6 枚大类 SVG 与小类那 24 枚一样不进 CORE：
   它们只在选中大类时取一次，进 CORE 会让安装期多拉 40KB。
   2026-11-24（qoder/avoid-capsule）：避雷屏胶囊语言定版 + 「已选方向」锚点，
   app.js 与 styles.css 都改了，VERSION 再跟一位。锚点复用已有的小类标本/
   大类徽记 SVG，不新增预缓存资产。 */
const CACHE_PREFIX = 'scent-picker-v7-1-';
const CACHE = CACHE_PREFIX + VERSION;

/* 入口页、脚本、样式、字体、图标、小体量核心数据 —— 「打开就能用」的最小集合。
   下面这些重量资产走运行时缓存，安装期不拉：
     · 香水实物图（images/*.webp）—— 访问到哪一瓶才缓存哪一张；
     · 香水库与 24 枚标本 SVG —— 首屏都用不上：盘心在未选小类时是纯文字，
       取图只发生在悬停/避雷卡（见 app.js 的 artInner 注释），香水库的首个
       消费点是第 2 屏。fetch 处理器对未命中走网络并写入缓存，所以首次用到
       就进缓存，之后离线照样能出结果。
   代价：装完 SW 一次没联网走到第 2 屏就断网，那两样拿不到，退降级态。 */
const CORE = [
  './',
  './index.html',
  './about.html',
  './manifest.json',
  './pwa.js',
  './styles.css',
  './app.js',
  './src/scoring.js',
  './src/notes.js',
  './src/ambient.js',
  './src/history.js',
  './src/share-card.js',
  './src/avoid.js',
  './src/avoid-map.js',
  './src/stamp.js',
  './src/stamp-ui.js',
  './src/season-copy.js',
  './fonts/inter-var-latin.woff2',
  './fonts/inter-var-latin-ext.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './data/taxonomy.json',
  './data/price-bands.json',
  './data/photos.json',
  './data/affiliate-links.json',
  './data/tmall-shops.json',
  './data/avoid-scenarios.json',
];

const INDEX = new URL('./index.html', self.location.href).href;

/* 缓存键去掉 query（styles.css?v=… 与 styles.css 是同一份文件），
   否则每次版本号一变就会在缓存里多出一整套副本。 */
function cacheKey(request) {
  const u = new URL(request.url);
  u.search = '';
  u.hash = '';
  return u.href;
}

async function putFresh(cache, request, response) {
  if (!response || !response.ok) return;
  try {
    await cache.put(cacheKey(request), response.clone());
  } catch {
    /* 配额满或响应不可克隆：后台更新失败不影响本次返回。 */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* 逐项写入而不是 addAll：任何一个文件 404 都不该让整次安装失败。
       例如部署时漏了 about.html，其余资源仍然要能离线。 */
    await Promise.all(CORE.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res.ok) await cache.put(new URL(url, self.location.href).href, res);
      } catch {
        /* 单个资源失败就跳过，下次访问时还有机会补上。 */
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE)
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* 导航：网络优先。断网时回缓存的入口页；连入口页都没有才放弃。 */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(INDEX, res.clone());
        }
        return res;
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match(INDEX))
          || (await cache.match(new URL('./', self.location.href).href))
          || new Response('离线，且本机还没有缓存过页面。', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
      }
    })());
    return;
  }

  /* 静态资源：缓存优先，命中后后台更新；未命中再走网络并写入缓存。 */
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) {
      event.waitUntil(fetch(req).then((res) => putFresh(cache, req, res)).catch(() => {}));
      return hit;
    }
    try {
      const res = await fetch(req);
      await putFresh(cache, req, res);
      return res;
    } catch {
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
