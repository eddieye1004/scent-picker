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
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  buildJdParams, unwrapJd, JD_GATEWAY,
  buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY,
  gmt8Timestamp, pickBest, scoreMatch,
} from './lib/union-api.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const IN_PERFUMES = path.join(ROOT, 'data/perfumes.json');
const OUT_CAND = path.join(ROOT, 'data/products.candidates.json');
const CACHE = path.join(ROOT, 'data/.cache/union-api.json');

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

async function queryTaobao(perfume) {
  const appKey = process.env.TB_APP_KEY;
  const secret = process.env.TB_APP_SECRET;
  const adzone = process.env.TB_ADZONE_ID;
  const keyword = `${perfume.brand} ${perfume.name}`.trim();
  const params = buildTaobaoParams({
    appKey, secret,
    method: 'taobao.tbk.dg.material.optional',
    timestamp: gmt8Timestamp(),
    biz: { q: keyword, adzone_id: adzone, page_no: 1, page_size: 20, platform: 2 },
  });
  const body = await withRetry(() => postForm(TAOBAO_GATEWAY, params), `TB ${perfume.id}`);
  const node = unwrapTaobao(body, 'taobao.tbk.dg.material.optional');
  const list = node.result_list?.map_data || [];
  const candidates = list.map((it) => ({
    platform: 'taobao',
    itemId: it.item_id ?? it.num_iid,
    title: it.title,
    price: it.zk_final_price ?? null,
    shop: it.shop_title || it.nick || '',
    clickUrl: it.click_url || '',
  }));
  return { keyword, candidates, raw: node };
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

const results = [];
const stats = { queried: 0, accepted: 0, rejected: 0, cached: 0, failed: 0 };

for (const p of targets) {
  for (const plat of plats) {
    const ck = cacheKey(plat, p);
    let r = cache[ck];
    if (r) stats.cached++;
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
