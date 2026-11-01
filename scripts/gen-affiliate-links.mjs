// 生成 data/affiliate-links.json 的可选工具（阶段二）
//
// **它不是构建步骤，也不是必需依赖。** 没有这张表，页面照样工作 ——
// 购买入口退回"平台搜索页"那一档（见 docs/DECISIONS.md D54）。
//
// 用法：
//   JD_UNION_COOKIE='...' node scripts/gen-affiliate-links.mjs
//   JD_UNION_KEY=xxx JD_UNION_SECRET=yyy node scripts/gen-affiliate-links.mjs --api
//
// 两种模式：
//   ① --api  走京东联盟开放平台 API（需要 appKey / appSecret，服务端签名）
//   ② 默认   读本地已有的 id → url 映射文件（data/affiliate-links.source.json），
//             只做校验与归一，方便你手工或从后台导出后一次性导入
//
// **凭证只从环境变量读，绝不写进任何入库文件。**
// 产出的 data/affiliate-links.json 是公开的（不含任何密钥），可以入库。

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const IN_PERFUMES = path.join(ROOT, 'data/perfumes.json');
const IN_SOURCE = path.join(ROOT, 'data/affiliate-links.source.json');
const OUT = path.join(ROOT, 'data/affiliate-links.json');

const args = process.argv.slice(2);
const USE_API = args.includes('--api');

/* 只接受 http(s)。这一层是最后一道闸 —— 就算上游给了个 javascript: 或
   data: 的地址，也不许流进公开的 JSON。 */
function safeUrl(raw) {
  try {
    const u = new URL(String(raw).trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch { return null; }
}

async function loadPerfumes() {
  const d = JSON.parse(await readFile(IN_PERFUMES, 'utf8'));
  return d.perfumes || d;
}

/* ---------- 模式 ②：本地映射文件 ----------
   期望结构（你可以从联盟后台导出 CSV 后自己转）：
     { "platform": "jd", "links": { "<perfume.id>": "https://item.jd.com/xxx.html" } }
   也接受 { "<perfume.id>": "url" } 这种裸映射，省一步。 */
async function fromSourceFile(perfumes) {
  if (!existsSync(IN_SOURCE)) {
    console.error(`缺少 ${path.relative(ROOT, IN_SOURCE)}`);
    console.error('  先建这个文件，结构见本脚本开头的注释；');
    console.error('  或者用 --api 走联盟开放平台。');
    console.error('  什么都不做也可以 —— 页面会退回"平台搜索页"那一档。');
    return null;
  }
  const raw = JSON.parse(await readFile(IN_SOURCE, 'utf8'));
  const platform = raw.platform || 'jd';
  const map = raw.links || raw;
  const ids = new Set(perfumes.map((p) => p.id));
  const links = {};
  const rejected = [];
  const unknown = [];
  for (const [id, url] of Object.entries(map)) {
    if (id === 'platform' || id === 'generatedAt') continue;
    if (!ids.has(id)) { unknown.push(id); continue; }
    const u = safeUrl(url);
    if (!u) { rejected.push([id, url]); continue; }
    links[id] = u;
  }
  return { platform, links, rejected, unknown };
}

/* ---------- 模式 ①：联盟开放平台 API ----------
   京东联盟开放平台（ union.jd.com/openplatform ）的转链接口需要
   appKey + appSecret 做 MD5 签名，参数含 materialId（商品 ID）。
   但**商品 ID 我们手上没有** —— perfumes.json 里只有 Scento 的溯源页，
   没有京东 SKU。所以 --api 模式必须配一份 id → skuId 的映射
   （data/affiliate-links.source.json 的 sku 字段），否则无从发起请求。

   这不是"接口难用"，是**数据缺口**：知道香水叫什么，不等于知道
   它在京东的商品编号。这一层只能靠人工或后台导出补。 */
async function fromApi(perfumes) {
  const key = process.env.JD_UNION_KEY;
  const secret = process.env.JD_UNION_SECRET;
  if (!key || !secret) {
    console.error('--api 模式需要环境变量 JD_UNION_KEY / JD_UNION_SECRET');
    console.error('  凭证只从环境变量读，不会写进任何文件。');
    return null;
  }
  if (!existsSync(IN_SOURCE)) {
    console.error(`--api 模式仍需 ${path.relative(ROOT, IN_SOURCE)} 提供 id → skuId 映射`);
    console.error('  原因：perfumes.json 里没有京东 SKU，只有 Scento 溯源页。');
    return null;
  }
  const rawSrc = JSON.parse(await readFile(IN_SOURCE, 'utf8'));
  const skuMap = rawSrc.skus || {};
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const links = {};
  const failed = [];

  for (const p of perfumes) {
    const sku = skuMap[p.id];
    if (!sku) continue;
    const materialId = String(sku);
    /* 签名规则（京东联盟开放平台文档）：
       md5(secret + "appKey" + key + "materialId" + materialId + "timestamp" + ts + secret) */
    const sign = createHash('md5')
      .update(secret + 'appKey' + key + 'materialId' + materialId + 'timestamp' + timestamp + secret)
      .digest('hex');
    const qs = new URLSearchParams({
      appKey: key, materialId, timestamp, sign,
      /* 站外推广必须声明渠道，否则联盟后台看不到来源、也没法结算 */
      positionId: process.env.JD_UNION_PID || '',
    });
    try {
      const r = await fetch('https://api.jd.com/routerjson?' + qs, { method: 'GET' });
      const j = await r.json();
      const url = safeUrl(j?.jd_union_open_promotion_common_get_responce?.result
        || j?.data?.clickURL || '');
      if (url) links[p.id] = url; else failed.push([p.id, JSON.stringify(j).slice(0, 120)]);
    } catch (e) { failed.push([p.id, e.message]); }
  }
  return { platform: 'jd', links, failed };
}

(async () => {
  const perfumes = await loadPerfumes();
  console.log(`香水库 ${perfumes.length} 瓶`);

  const res = USE_API ? await fromApi(perfumes) : await fromSourceFile(perfumes);
  if (!res) process.exit(1);

  const n = Object.keys(res.links).length;
  if (!n) {
    console.error('一条链接都没生成 —— 不写文件（写了也是个空表，不如没有）。');
    process.exit(1);
  }

  const out = {
    platform: res.platform,
    generatedAt: new Date().toISOString().slice(0, 10),
    /* 覆盖率是给自己看的：低了说明映射不全，页面大部分会退回搜索档。
       它不是错误，只是事实。 */
    coverage: `${n}/${perfumes.length}`,
    links: res.links,
  };
  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`已写 ${path.relative(ROOT, OUT)}：${n} 条（覆盖 ${out.coverage}）`);
  if (res.rejected?.length) console.log(`拒绝的非 http(s) 链接 ${res.rejected.length} 条`);
  if (res.unknown?.length) console.log(`数据里没有的 id ${res.unknown.length} 条`);
  if (res.failed?.length) console.log(`接口失败 ${res.failed.length} 条`);
})();
