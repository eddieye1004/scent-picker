// 生成 data/affiliate-links.json 的可选工具（双平台版，v29）
//
// **它不是构建步骤，也不是必需依赖。** 没有这张表，页面照样工作 ——
// 购买入口退回"平台搜索页"那一档（见 docs/DECISIONS.md D54/D57）。
//
// 用法：
//   node scripts/gen-affiliate-links.mjs                      # 读 data/affiliate-links.source.json
//   JD_UNION_KEY=xxx JD_UNION_SECRET=yyy node scripts/gen-affiliate-links.mjs --api
//
// 输入文件结构（data/affiliate-links.source.json）：
//   {
//     "jd":     { "<perfume.id>": "https://u.jd.com/xxxxx" },
//     "taobao": { "<perfume.id>": "https://s.click.taobao.com/xxxxx" }
//   }
//   也接受旧结构 { "platform": "jd", "links": { ... } }，会按 platform 折叠。
//
// 产出 data/affiliate-links.json（公开，不含任何密钥，可以入库）：
//   {
//     "generatedAt": "2026-11-02",
//     "coverage": { "jd": "412/1388", "taobao": "0/1388" },
//     "jd":     { "<perfume.id>": "url" },
//     "taobao": { ... }
//   }

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildJdParams, unwrapJd, gmt8Timestamp } from './lib/union-api.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const IN_PERFUMES = path.join(ROOT, 'data/perfumes.json');
const IN_SOURCE = path.join(ROOT, 'data/affiliate-links.source.json');
const OUT = path.join(ROOT, 'data/affiliate-links.json');

const PLATFORMS = ['jd', 'taobao'];
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

/* 把各种可能的输入结构归一成 { jd:{id:url}, taobao:{id:url} }。
   归一放在这里而不是让调用方各写一遍 —— 结构变过一次（v27 单平台
   → v29 双平台），下次再变时只改这一个函数。 */
function normalizeSource(raw) {
  const out = { jd: {}, taobao: {} };
  if (!raw) return out;
  /* 旧结构：{ platform:'jd', links:{...} } */
  if (raw.platform && raw.links) {
    if (PLATFORMS.includes(raw.platform)) out[raw.platform] = { ...raw.links };
    return out;
  }
  /* 新结构：按平台分组。允许每个平台再套一层 { links: {...} } */
  for (const plat of PLATFORMS) {
    const t = raw[plat];
    if (!t) continue;
    const map = t.links || t;
    if (map && typeof map === 'object') out[plat] = { ...map };
  }
  return out;
}

async function fromSourceFile(perfumes) {
  if (!existsSync(IN_SOURCE)) {
    console.error(`缺少 ${path.relative(ROOT, IN_SOURCE)}`);
    console.error('  先建这个文件，结构见本脚本开头的注释；');
    console.error('  或者用 --api 走联盟开放平台。');
    console.error('  什么都不做也可以 —— 页面会退回"平台搜索页"那一档。');
    return null;
  }
  const raw = JSON.parse(await readFile(IN_SOURCE, 'utf8'));
  const grouped = normalizeSource(raw);
  const ids = new Set(perfumes.map((p) => p.id));
  const res = { rejected: [], unknown: [] };
  for (const plat of PLATFORMS) {
    const clean = {};
    for (const [id, url] of Object.entries(grouped[plat])) {
      if (!ids.has(id)) { res.unknown.push(`${plat}:${id}`); continue; }
      const u = safeUrl(url);
      if (!u) { res.rejected.push([`${plat}:${id}`, url]); continue; }
      clean[id] = u;
    }
    grouped[plat] = clean;
  }
  return { ...grouped, ...res };
}

/* ---------- 模式 ①：联盟开放平台 API ----------
   **v30 重写。** 旧实现（v29）有三处硬伤，全部在 2026-11-03 修掉：

   ① 签名规则是错的。旧代码按 `md5(secret + "appKey" + key + "materialId" + ...)`
      手拼三项，那不是 JOS 的协议。真实规则是**对全部系统参数按 key 字典序
      拼串**（含 360buy_param_json 这一大串），前后各拼一次 secret。旧写法在
      没有凭证的年代从未被执行过，所以没暴露。
   ② 调用方式是错的。旧代码把 appKey / materialId / timestamp 直接摆在 query
      上；JOS 要求业务参数整体放进 `360buy_param_json` 这个表单字段。
   ③ 拿不到 skuId。旧代码要求 IN_SOURCE 里有 `skus` 字段，但那个字段没人写过。
      现在改成读 `data/product-skus.json` —— 由 fetch-products.mjs 用关键词
      搜索接口自动生成（这一步也是"只能手工复制短链"那个结论被推翻的地方）。

   签名逻辑统一走 scripts/lib/union-api.mjs，那份有 31 项固定向量测试钉着。 */
const IN_SKUS = path.join(ROOT, 'data/product-skus.json');

async function fromApi(perfumes) {
  const key = process.env.JD_UNION_KEY;
  const secret = process.env.JD_UNION_SECRET;
  if (!key || !secret) {
    console.error('--api 模式需要环境变量 JD_UNION_KEY / JD_UNION_SECRET');
    console.error('  凭证只从环境变量读，不会写进任何文件。');
    return null;
  }
  /* skuId 表可能来自两处：新的 product-skus.json（自动生成），
     或旧 IN_SOURCE 里的 skus 字段（手工）。后者保留兼容，不删。 */
  let skuMap = {};
  if (existsSync(IN_SKUS)) {
    const s = JSON.parse(await readFile(IN_SKUS, 'utf8'));
    skuMap = { ...(s.jd || {}) };
  }
  if (existsSync(IN_SOURCE)) {
    const rawSrc = JSON.parse(await readFile(IN_SOURCE, 'utf8'));
    skuMap = { ...(rawSrc.skus || {}), ...skuMap };
  }
  const skuCount = Object.keys(skuMap).length;
  if (!skuCount) {
    console.error('--api 模式需要一个 id → skuId 的表，但两处都没有：');
    console.error(`  ${path.relative(ROOT, IN_SKUS)}（推荐，自动生成）`);
    console.error(`  ${path.relative(ROOT, IN_SOURCE)} 里的 skus 字段（手工）`);
    console.error('  生成方式：node scripts/fetch-products.mjs --jd');
    console.error('  原因：转链接口要 materialId（京东 SKU），而 perfumes.json 里只有 Scento 溯源页。');
    return null;
  }

  const pid = process.env.JD_UNION_PID || '';
  const jd = {};
  const failed = [];

  for (const p of perfumes) {
    const sku = skuMap[p.id];
    if (!sku) continue;
    try {
      const params = buildJdParams({
        appKey: key, secret,
        method: 'jd.union.open.promotion.common.get',
        timestamp: gmt8Timestamp(),
        bizParams: {
          promotionCodeReq: {
            materialId: String(sku),
            siteId: process.env.JD_UNION_SITE_ID || '',
            /* 站外推广必须声明渠道，否则联盟后台看不到来源、也没法结算。
               空值会被签名一起算进去 —— 这里显式给空串，与"不传"不同，
               京东对两者都接受，但空串能让下一次排查看清到底缺哪一项。 */
            positionId: pid,
          },
        },
      });
      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) body.append(k, String(v));
      const r = await fetch('https://api.jd.com/routerjson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
        body,
      });
      const j = await r.json();
      const inner = unwrapJd(j, 'jd.union.open.promotion.common.get');
      const url = safeUrl(inner?.data?.clickURL || '');
      if (url) jd[p.id] = url;
      else failed.push([p.id, JSON.stringify(inner).slice(0, 160)]);
    } catch (e) {
      failed.push([p.id, e.message]);
    }
    /* 京东限流比淘宝宽，但批量跑也不该打满 —— 350ms 间隔，1388 瓶约 8 分钟 */
    await new Promise((r2) => setTimeout(r2, 350));
  }
  return { jd, taobao: {}, rejected: [], unknown: [], failed };
}

(async () => {
  const perfumes = await loadPerfumes();
  console.log(`香水库 ${perfumes.length} 瓶`);

  const res = USE_API ? await fromApi(perfumes) : await fromSourceFile(perfumes);
  if (!res) process.exit(1);

  const coverage = {};
  let total = 0;
  for (const plat of PLATFORMS) {
    const n = Object.keys(res[plat] || {}).length;
    coverage[plat] = `${n}/${perfumes.length}`;
    total += n;
  }
  if (!total) {
    /* 一条都没成时，**先把失败原因打出来再退出**。
       否则用真凭证跑的时候只会看到"一条都没生成"，无从判断是签名错、
       权限没开、还是 SKU 表里的编号不对 —— 这三种情况的处理方式完全不同。 */
    console.error('一条链接都没生成 —— 不写文件（写了也是个空表，不如没有）。');
    if (res.failed?.length) {
      console.error(`\n接口失败 ${res.failed.length} 条，前 5 条：`);
      for (const [id, msg] of res.failed.slice(0, 5)) console.error(`  ${id}: ${msg}`);
      const first = String(res.failed[0]?.[1] || '');
      if (/sign/i.test(first)) console.error('\n提示：签名错。先跑 node scripts/test-union-api.mjs，31 项必须全绿。');
      else if (/key|appkey|权限|permission/i.test(first)) console.error('\n提示：凭证或权限问题 —— 去联盟后台核对 appKey/secret 与接口权限组。');
    }
    process.exit(1);
  }

  const out = {
    generatedAt: new Date().toISOString().slice(0, 10),
    /* 覆盖率是给自己看的：低了说明映射不全，大部分会退回搜索档。
       它不是错误，只是事实。 */
    coverage,
  };
  for (const plat of PLATFORMS) {
    if (Object.keys(res[plat] || {}).length) out[plat] = res[plat];
  }
  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`已写 ${path.relative(ROOT, OUT)}：${JSON.stringify(coverage)}`);
  if (res.rejected?.length) console.log(`拒绝的非 http(s) 链接 ${res.rejected.length} 条`);
  if (res.unknown?.length) console.log(`数据里没有的 id ${res.unknown.length} 条`);
  if (res.failed?.length) console.log(`接口失败 ${res.failed.length} 条`);
})();
