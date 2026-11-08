#!/usr/bin/env node
/**
 * fetch-products.mjs — 用联盟开放平台把「香水名」变成「商品编号与推广短链」。
 *
 * 存在的理由（这是本项目佣金链路最关键的一次转向）：
 * 之前 docs/AFFILIATE-SETUP.md 断言「只能一瓶一瓶从后台复制短链」，
 * 因为转链接口要 materialId（京东 SKU）/ itemId（淘宝），而 perfumes.json
 * 里一个都没有。那个断言只在**手工**路径下成立 —— 两家的联盟 API 都有
 * **关键词搜索**接口，可以直接按「品牌 + 香名」召回商品，再取概率最高的那条。
 * 于是「人工过验证码 + 逐条复制」被替换成「跑一次脚本」。
 *
 * 它不做的事（写在这里免得被误解成偷懒）：
 *   · 不猜。`scoreMatch` 不达标就跳过这一瓶，宁可 coverage 低。
 *     覆盖率低是事实，不是 bug —— 见 docs/AFFILIATE-API.md 第六节。
 *   · 不绕风控。走官方签名接口，不碰 baxia / 滑块 / 登录态。
 *   · 不写进 data/affiliate-links.json —— 那是 gen-affiliate-links.mjs 的产出。
 *     这里只产出候选表 data/products.candidates.json，人工看一眼再合并。
 *
 * 用法：
 *   JD_UNION_KEY=xxx JD_UNION_SECRET=yyy JD_UNION_PID=zzz \
 *     node scripts/fetch-products.mjs --jd --limit 50
 *
 *   TB_APP_KEY=xxx TB_APP_SECRET=yyy TB_ADZONE_ID=123 \
 *     node scripts/fetch-products.mjs --taobao --limit 50
 *
 *   --limit N     只跑前 N 瓶（省配额，先验证流程）
 *   --ids a,b,c   只跑指定 id
 *   --dry         只打印第一瓶的请求参数与返回，不写文件
 *   --force       忽略缓存，重新请求
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  buildJdParams, unwrapJd, JD_GATEWAY,
  buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, taobaoQueryVariants,
  gmt8Timestamp, pickBest, scoreMatch,
} from './lib/union-api.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const IN_PERFUMES = path.join(ROOT, 'data/perfumes.json');
const OUT_CAND = path.join(ROOT, 'data/products.candidates.json');
/* 缓存目录必须显式建：`data/.cache/` 在 .gitignore 里，干净 clone 后不存在。
   第一次跑就崩在最后一行 `ENOENT: open .../data/.cache/union-api.json` ——
   崩溃点在写盘那一步，前面几十次接口调用全部白做，而报错文案指向
   "文件打不开"，看不出真实原因（目录不存在）。目录不存在是可预期状态，
   不该让整个进程失败。 */
const CACHE = path.join(ROOT, 'data/.cache/union-api.json');
await mkdir(path.dirname(CACHE), { recursive: true });

/* `.env.local` 读进 process.env —— 只补**未设置**的键，命令行显式传的优先。

   为什么需要它：凭证以前的用法是 `TB_APP_KEY=xxx node scripts/...`，
   在 PowerShell 里写 `TB_APP_KEY=xxx` 根本不是赋值语法（会当成命令跑），
   实际得 `$env:TB_APP_KEY="xxx"`，而且只对当前窗口有效。于是凭证被
   抄来抄去，最后散在临时脚本里 —— 这次就散在三个 probe 文件里。
   `.env.local` 已在 .gitignore（`.gitignore:72` 的 `.env.*`），
   是这套项目里唯一被设计成"放真凭证"的位置。

   解析故意做得极简：`KEY=VALUE`、`#` 注释、去引号。不引第三方依赖
   （本项目零依赖是硬约束），也不支持多行值 —— 凭证用不上。 */
const ENV_LOCAL = path.join(ROOT, '.env.local');
if (existsSync(ENV_LOCAL)) {
  const text = await readFile(ENV_LOCAL, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const eq = s.indexOf('=');
    if (eq < 1) continue;
    const k = s.slice(0, eq).trim();
    let v = s.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const WANT_JD = flag('--jd');
const WANT_TB = flag('--taobao');
const DRY = flag('--dry');
const FORCE = flag('--force');
const LIMIT = Number(opt('--limit', '0')) || 0;
const ONLY = (opt('--ids', '') || '').split(',').map((s) => s.trim()).filter(Boolean);

/* 别名表：中文最常见的译名。没有它，京东那些纯中文标题一条都匹配不上
   （实测：品牌英文名在标题里出现的比例远低于直觉）。这是**数据**，
   不是规则 —— 用户可自行追加，脚本不假设表里有什么。 */
const ALIAS_PATH = path.join(ROOT, 'data/brand-aliases.json');
let ALIAS = {};
if (existsSync(ALIAS_PATH)) {
  try { ALIAS = JSON.parse(await readFile(ALIAS_PATH, 'utf8')); }
  catch (e) { console.error(`别名表读不了，按空表继续：${e.message}`); }
}

/* ---------- 请求层：限速 + 退避 ----------
   两家都是"超了直接拒"，且拒绝也计入调用。所以宁可慢：
   京东 QPS 限制比淘宝宽，但统一按 350ms 间隔更省心。 */
const MIN_GAP_MS = Number(process.env.UNION_MIN_GAP_MS || 350);
let lastCall = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postForm(url, params) {
  const gap = MIN_GAP_MS - (Date.now() - lastCall);
  if (gap > 0) await sleep(gap);
  lastCall = Date.now();
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.append(k, String(v));
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); }
  catch { throw new Error(`返回不是 JSON：${text.slice(0, 200)}`); }
}

/* 只对"可能自己好起来"的错误重试：限流、服务端抖动。
   签名错 / 权限错重试一百次也一样，retry 只会更快烧配额。 */
async function withRetry(fn, label, retries = 3) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      const msg = String(e.message || '');
      const retryable = /QPS|限流|too many|unavailable|500|502|503|504|timeout|ECONNRESET/i.test(msg);
      if (!retryable || i >= retries) throw new Error(`${label}: ${msg}`);
      await sleep(2 ** i * 1000 + Math.random() * 300);
    }
  }
}

/* ---------- 两个平台的查询 ---------- */

async function queryJd(perfume) {
  const appKey = process.env.JD_UNION_KEY;
  const secret = process.env.JD_UNION_SECRET;
  const pid = process.env.JD_UNION_PID;
  const keyword = `${perfume.brand} ${perfume.name}`.trim();
  const params = buildJdParams({
    appKey, secret,
    method: 'jd.union.open.goods.query',
    timestamp: gmt8Timestamp(),
    bizParams: {
      goodsReqDTO: {
        keyword,
        pageIndex: 1,
        pageSize: 20,
        /* 站外推广必须带推广位，否则拿到的 clickURL 不归因 */
        pid: pid || undefined,
      },
    },
  });
  const body = await withRetry(() => postForm(JD_GATEWAY, params), `JD ${perfume.id}`);
  const data = unwrapJd(body, 'jd.union.open.goods.query');
  const candidates = (data.data || []).map((g) => ({
    platform: 'jd',
    skuId: g.skuId,
    title: g.skuName,
    price: g.priceInfo?.price ?? null,
    shop: g.shopInfo?.shopName || '',
    owner: g.owner,
  }));
  return { keyword, candidates, raw: data };
}

/* **必须用 `.upgrade` 那个方法名，不是 `material.optional`。**
   2026-11-08 隔离实测（同一套凭证，逐个方法调，见 probe-api2.mjs）：
     taobao.time.get                              → ok
     taobao.tbk.dg.material.optional              → 错误 11（未授权）
     taobao.tbk.dg.material.optional.upgrade      → ok，正常返回商品
     taobao.tbk.item.info.get                     → 错误 11（未授权）
   权限包 27939 授权的是 upgrade 版本，不是旧版。两个方法的 biz 参数完全一样。

   两个版本的**返回结构不同**，照旧版写会全部 undefined 而不报错：
     旧版：it.item_id / it.title / it.pict_url / it.click_url 都在 map_data[i] 上
     新版：map_data[i].{item_id, publish_info, item_basic_info}
           · item_id        → map_data[i].item_id（顶层）
           · title/pict_url → map_data[i].item_basic_info.*
           · click_url      → map_data[i].publish_info.click_url
           · 价格            → map_data[i].price_promotion_info 里（旧版是 zk_final_price）
   实测截图见 C:/Users/16256/ego/aff-20261101/probe-upgrade.json。 */
const TAOBAO_MATERIAL_METHOD = 'taobao.tbk.dg.material.optional.upgrade';

/* 淘宝返回 → 候选数组。抽出来是为了让缓存重映射能复用同一套逻辑：
   缓存里存了 raw，字段映射一改（比如这次加 whiteImage），
   老缓存不重发请求也能拿到新字段。映射只有这一份，两边不会漂移。 */
function mapTaobao(keyword, node) {
  const list = node.result_list?.map_data || [];
  const candidates = list.map((it) => {
    // 新旧结构都认：先把两个层级拍平，再取值
    const basic = it.item_basic_info || {};
    const publish = it.publish_info || {};
    const promo = it.price_promotion_info || {};
    const flat = { ...it, ...basic, ...publish, ...promo };
    return {
      platform: 'taobao',
      itemId: it.item_id ?? flat.item_id ?? flat.num_iid,
      title: flat.title || flat.short_title || '',
      price: flat.zk_final_price ?? flat.reserve_price ?? null,
      shop: flat.shop_title || flat.nick || '',
      clickUrl: flat.click_url || '',
      /* 主图要留着。联盟「营销素材」与物料接口给的都是 img.alicdn.com 上的
         推广用图 —— 这是唯一一条「平台主动授权给推广者使用」的图片来源，
         比抓电商详情页或第三方博客干净。拿到 pid 后的实物图就靠它。

         但 pict_url 与 white_image 不是一回事（2026-11-08 实测 601 张后确认）：
         · pict_url    = 营销主图，多数带红色价签、「到手N件」角标、直播贴纸
         · white_image = 白底/纯色底主图，淘宝为「白底图」规范单独提供的
         拿 pict_url 当商品图，会直接违反「仅含香水本身，不含贴纸文字」这个要求。
         两个都留着，取舍交给下游：white_image 优先（过判据率高、干净），
         pict_url 兜底（可能带角标，过不了判据就不给图）。 */
      pictUrl: flat.pict_url || '',
      whiteImage: flat.white_image || '',
      smallImages: flat.small_images?.string || [],
      couponShareUrl: flat.coupon_share_url || '',
      /* 类目路径。**这是比标题正则更硬的品类判据。**
         实测（2026-11-08，四组关键词逐条 dump）：
           · 真香水一律是 `彩妆/香水/美妆工具 > 香水`
           · 假阳性散布在 书籍/杂志/报纸 > 文学类原版书、时装凉鞋、手机保护套/壳…
         而「标题里有没有香水品类词」这条老判据会误杀两类：
           · 真正装但标题只写英文名（`美国直邮Legend Spirit正品万宝龙`）
           · 小样（标题写「试管香水」，本就该拒）
         所以两个判据并存：有 categoryText 就用它，没有才回落到标题正则
         （京东不返回类目路径，那条只能靠标题）。 */
      categoryText: `${flat.level_one_category_name || ''}/${flat.category_name || ''}`,
    };
  });
  return { keyword, candidates };
}

async function queryTaobao(perfume) {
  const appKey = process.env.TB_APP_KEY;
  const secret = process.env.TB_APP_SECRET;
  const adzone = process.env.TB_ADZONE_ID;

  /* 多轮查询：按 taobaoQueryVariants 的顺序逐个试，**第一个能匹配上的就停**。
     为什么不是一次查完再合并：每个变体都是一次真实调用（计入 QPS 配额），
     360 瓶 × 4 变体 = 1440 次。先命中就收手，实测 360 瓶只用了
     198 瓶走 1 轮、20 瓶走 2 轮、其余走满，比全跑 4 轮省一半配额。

     为什么 q 里**不带品牌**：见 lib/union-api.mjs 的 taobaoQueryVariants 注释 ——
     加品牌名经常直接打成「无结果」。 */
  const variants = taobaoQueryVariants(perfume, ALIAS);
  let lastKeyword = variants[0] || '';
  let best = null;
  let bestRaw = null;

  for (const keyword of variants) {
    lastKeyword = keyword;
    const params = buildTaobaoParams({
      appKey, secret,
      method: TAOBAO_MATERIAL_METHOD,
      timestamp: gmt8Timestamp(),
      biz: { q: keyword, adzone_id: adzone, page_no: 1, page_size: 20, platform: 2 },
    });
    let body;
    try {
      body = await withRetry(() => postForm(TAOBAO_GATEWAY, params), `TB ${perfume.id}`);
    } catch (e) {
      /* 这一轮失败不该终止整瓶 —— 换个查询词可能就有结果 */
      console.error(`  · taobao/${perfume.id} q="${keyword}" ${String(e.message).slice(0, 80)}`);
      continue;
    }
    /* 「无结果是正常响应」不是异常：淘宝在没有匹配时返回
       `{"error_response":{"code":15,"sub_msg":"无结果"}}`，而不是空数组。
       unwrapTaobao 会把它当错误抛出来 —— 所以这里必须再接一层 try，
       否则第一瓶没有结果的香水就把整个进程带走。 */
    let node;
    try {
      node = unwrapTaobao(body, TAOBAO_MATERIAL_METHOD);
    } catch (e) {
      if (/无结果/.test(String(e.message))) continue;
      console.error(`  · taobao/${perfume.id} q="${keyword}" ${String(e.message).slice(0, 80)}`);
      continue;
    }
    if (!node) continue;
    const mapped = mapTaobao(keyword, node);
    const cand = pickBest(perfume, mapped.candidates, ALIAS);
    if (cand?.accept) { best = mapped; bestRaw = node; break; }
    /* 没达标也先留一份：所有变体都不达标时，这一份用来解释"为什么没命中" */
    if (!best) { best = mapped; bestRaw = node; }
  }

  if (!best) {
    return { keyword: lastKeyword, candidates: [], raw: null };
  }
  return { keyword: best.keyword, candidates: best.candidates, raw: bestRaw };
}

/* ---------- 主流程 ---------- */

function credentialsOk(plat) {
  if (plat === 'jd') {
    const miss = ['JD_UNION_KEY', 'JD_UNION_SECRET'].filter((k) => !process.env[k]);
    return miss;
  }
  const miss = ['TB_APP_KEY', 'TB_APP_SECRET', 'TB_ADZONE_ID'].filter((k) => !process.env[k]);
  return miss;
}

const perfumes = (JSON.parse(await readFile(IN_PERFUMES, 'utf8')).perfumes || []);
console.log(`香水库 ${perfumes.length} 瓶`);

const targets = ONLY.length ? perfumes.filter((p) => ONLY.includes(p.id))
  : LIMIT ? perfumes.slice(0, LIMIT) : perfumes;
console.log(`本轮目标 ${targets.length} 瓶${LIMIT ? `（--limit ${LIMIT}）` : ''}`);

const plats = [];
for (const [name, want] of [['jd', WANT_JD], ['taobao', WANT_TB]]) {
  if (!want) continue;
  const miss = credentialsOk(name);
  if (miss.length) {
    console.error(`${name}：缺环境变量 ${miss.join(' / ')}`);
    console.error('  凭证只从环境变量读，不写进任何文件。去联盟后台拿，见 docs/AFFILIATE-API.md');
    process.exitCode = 1;
    continue;
  }
  plats.push(name);
}
if (!plats.length) {
  console.error('没有可跑的平台。加 --jd 或 --taobao；两者都要就先配凭证。');
  console.error('  JD_UNION_KEY / JD_UNION_SECRET / JD_UNION_PID');
  console.error('  TB_APP_KEY / TB_APP_SECRET / TB_ADZONE_ID');
  process.exit(1);
}

/* 缓存：断点续跑用。键含 keyword，改了品牌/香名会重新取。 */
let cache = {};
if (existsSync(CACHE) && !FORCE) {
  try { cache = JSON.parse(await readFile(CACHE, 'utf8')); } catch { cache = {}; }
}
const cacheKey = (plat, p) => `${plat}:${p.id}:${p.brand} ${p.name}`.toLowerCase();

/* 缓存里存的是 { keyword, candidates, raw }。candidates 是按**当时的**
   映射逻辑拍平出来的，新增字段（比如 whiteImage）不会自己出现在老条目里 ——
   缓存命中时用旧 candidates，新字段永远是 undefined。

   这里在命中缓存时，若该条目有 raw，就用当前逻辑从 raw 重新映射一遍，
   保证「改映射不必重发请求」。raw 缺失（京东侧不走这条）则退回旧 candidates。 */
const remap = (plat, entry) => {
  if (!entry || !entry.raw) return entry;
  try {
    const fresh = plat === 'taobao' ? mapTaobao(entry.keyword, entry.raw) : entry;
    return { ...fresh, keyword: entry.keyword ?? fresh.keyword };
  } catch {
    return entry;   // raw 结构对不上就保留旧值，不比原样更差
  }
};

const results = [];
const stats = { queried: 0, accepted: 0, rejected: 0, cached: 0, failed: 0 };

for (const p of targets) {
  for (const plat of plats) {
    const ck = cacheKey(plat, p);
    let r = cache[ck];
    if (r) { stats.cached++; r = remap(plat, r); }
    else {
      try {
        r = plat === 'jd' ? await queryJd(p) : await queryTaobao(p);
        cache[ck] = r;
        stats.queried++;
      } catch (e) {
        stats.failed++;
        console.error(`  ✗ ${plat}/${p.id} ${e.message}`);
        continue;
      }
    }
    const best = pickBest(p, r.candidates, ALIAS);
    const row = {
      id: p.id,
      brand: p.brand,
      name: p.name,
      platform: plat,
      keyword: r.keyword,
      candidateCount: r.candidates.length,
      picked: best || null,
      accepted: Boolean(best?.accept),
    };
    if (row.accepted) stats.accepted++; else stats.rejected++;
    results.push(row);

    if (DRY) { console.log(JSON.stringify(row, null, 2)); break; }
  }
  if (DRY) break;
}

if (DRY) {
  console.log('\n--dry：只打印，不写文件。');
  process.exit(0);
}

await writeFile(CACHE, JSON.stringify(cache), 'utf8');

/* 写盘策略：**只写被接受的**。被拒的留在 rejected 数组里供复核，
   但绝不进 picked 通道 —— 这条与 gen-affiliate-links.mjs 的
   「一条都不合格就不写文件」是同一种态度。 */
const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  platforms: plats,
  targets: targets.length,
  stats,
  accepted: results.filter((r) => r.accepted),
  rejected: results.filter((r) => !r.accepted),
};
await writeFile(OUT_CAND, JSON.stringify(out, null, 2) + '\n', 'utf8');

console.log(`\n已写 ${path.relative(ROOT, OUT_CAND)}`);
console.log(`  请求 ${stats.queried} · 缓存命中 ${stats.cached} · 失败 ${stats.failed}`);
console.log(`  接受 ${stats.accepted} · 拒收 ${stats.rejected}（拒收明细见 rejected）`);
console.log('\n下一步：node scripts/merge-product-candidates.mjs');
