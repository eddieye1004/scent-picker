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
import { createHash } from 'node:crypto';
import path from 'node:path';

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
   京东联盟的转链接口要 materialId（京东 SKU），而 perfumes.json
   里没有任何 SKU，只有 Scento 的溯源页。所以 --api 仍需要你先提供
   id → skuId 的映射 —— 知道香水叫什么，不等于知道它在京东的商品编号。

   淘宝客的转链接口同理需要 itemId。两家的共同瓶颈都不是接口难度，
   是**数据缺口**。 */
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
  const jd = {};
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
      if (url) jd[p.id] = url; else failed.push([p.id, JSON.stringify(j).slice(0, 120)]);
    } catch (e) { failed.push([p.id, e.message]); }
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
    console.error('一条链接都没生成 —— 不写文件（写了也是个空表，不如没有）。');
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
