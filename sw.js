/* sw.js — 离线壳（Qoder 改造 3）
 *
 * 策略只有两条：
 *   ① 导航请求网络优先，断网回 index.html —— 这样用户永远先拿到最新版本；
 *   ② 静态资源（JS/CSS/字体/数据/图标/实物图）缓存优先 + 后台更新 ——
 *      首屏不再等网络，断网也能走完八屏并出结果。
 *
 * 只缓存同源 GET。跨域、非 GET、chrome-extension 一律放行，不拦。
 */
/* 2026-11-19：中文 webfont 退场（DECISIONS D71），CORE 去掉
   fonts/noto-sans-sc-subset.woff2；VERSION 跟着进一位，让旧缓存整套失效 ——
   静态资源是 cache-first + ignoreSearch，只改文件不换缓存名会一直吐旧副本。 */
const VERSION = 'v2-20261119a';
const CACHE_PREFIX = 'scent-picker-v7-1-';
const CACHE = CACHE_PREFIX + VERSION;

/* 入口页、脚本、样式、字体、图标、核心数据，以及圆盘盘心的 24 枚标本 SVG。
   这些是「打开就能用」的最小集合；香水实物图（images/*.webp）走运行时缓存，
   访问到哪一瓶才缓存哪一张。 */
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
  './fonts/inter-var-latin.woff2',
  './fonts/inter-var-latin-ext.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './data/taxonomy.json',
  './data/perfumes.json',
  './data/price-bands.json',
  './data/photos.json',
  './data/affiliate-links.json',
  './data/tmall-shops.json',
  './data/avoid-scenarios.json',
  './icon-specimen/svg/amber-amber.svg',
  './icon-specimen/svg/amber-incense.svg',
  './icon-specimen/svg/amber-leather.svg',
  './icon-specimen/svg/amber-resinous.svg',
  './icon-specimen/svg/citrus-aromatic-citrus.svg',
  './icon-specimen/svg/citrus-citrus-floral.svg',
  './icon-specimen/svg/citrus-cologne.svg',
  './icon-specimen/svg/floral-fruity-floral.svg',
  './icon-specimen/svg/floral-green-floral.svg',
  './icon-specimen/svg/floral-powdery-floral.svg',
  './icon-specimen/svg/floral-rose.svg',
  './icon-specimen/svg/floral-soliflore.svg',
  './icon-specimen/svg/fresh-aquatic.svg',
  './icon-specimen/svg/fresh-fougere.svg',
  './icon-specimen/svg/fresh-green.svg',
  './icon-specimen/svg/fresh-tea.svg',
  './icon-specimen/svg/gourmand-fruity-gourmand.svg',
  './icon-specimen/svg/gourmand-vanilla-gourmand.svg',
  './icon-specimen/svg/green-citrus-a.svg',
  './icon-specimen/svg/oud-a.svg',
  './icon-specimen/svg/white-floral-a.svg',
  './icon-specimen/svg/woody-sandalwood.svg',
  './icon-specimen/svg/woody-vetiver.svg',
  './icon-specimen/svg/woody-woody.svg',
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
