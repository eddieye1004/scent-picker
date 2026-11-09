/* 中文香名调研 第 1 步：分层抽样 + 品牌池抓取

   目的：把「中文香名从哪来」这个问题变成可核实的数据。
   做法：先按中文品牌名查一次（每品牌 1 次调用，100 条），把标题全存下来。
   后面每一瓶的中文名候选，要么能从这些标题里读出来（有来源），
   要么标「无来源，靠推测」。

   抽样：classB 481 瓶，Armaf 103 瓶按要求抽 15，其余按瓶数比例分 25 个名额。
   写：data/.cache/zh-name-sample.json / zh-name-brandpool.json
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp } from './lib/union-api.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;

const classB = JSON.parse(fs.readFileSync('C:/Users/16256/ego/classB.json', 'utf8'));
const aliasMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/brand-aliases.json'), 'utf8'));

/* 中文品牌名：取别名表里第一条纯中文的（别名表已人工核过品牌级中文名） */
function brandCn(brand) {
  const list = aliasMap[brand] || [];
  const hit = list.find((x) => /^[\u4e00-\u9fa5]+$/.test(x));
  return hit || '';
}

/* ---- 分层抽样 ---- */
const byBrand = new Map();
for (const p of classB) {
  if (!byBrand.has(p.brand)) byBrand.set(p.brand, []);
  byBrand.get(p.brand).push(p);
}

const TARGET = 40;
const ARMAF_QUOTA = 15;
const brands = [...byBrand.entries()].sort((a, b) => b[1].length - a[1].length);
const rest = brands.filter(([b]) => b !== 'Armaf');
const restTotal = rest.reduce((s, [, v]) => s + v.length, 0);
const restQuota = TARGET - ARMAF_QUOTA;

/* 最大余数法分配，保证总和正好 40 */
const raw = rest.map(([b, v]) => ({ brand: b, n: v.length, q: (v.length / restTotal) * restQuota }));
const base = raw.map((r) => ({ ...r, k: Math.floor(r.q), rem: r.q - Math.floor(r.q) }));
let need = restQuota - base.reduce((s, r) => s + r.k, 0);
for (const r of base.slice().sort((a, b) => b.rem - a.rem)) {
  if (need <= 0) break;
  r.k += 1; need -= 1;
}

/* 每个品牌内部：等距取样（不是随机，可复现，且覆盖品牌内不同位置） */
function equallySpaced(arr, k) {
  if (k >= arr.length) return arr.slice();
  if (k === 1) return [arr[0]];
  const out = [];
  const step = (arr.length - 1) / (k - 1);
  for (let i = 0; i < k; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

const sample = [];
const arm = byBrand.get('Armaf') || [];
sample.push(...equallySpaced(arm, Math.min(ARMAF_QUOTA, arm.length)));
for (const r of base) {
  if (r.k <= 0) continue;
  sample.push(...equallySpaced(byBrand.get(r.brand), r.k));
}

const enriched = sample.map((p) => ({ ...p, brandCn: brandCn(p.brand) }));
fs.writeFileSync(path.join(ROOT, 'data/.cache/zh-name-sample.json'), JSON.stringify(enriched, null, 2));

const noCn = enriched.filter((x) => !x.brandCn);
console.log(`样本 ${enriched.length} 瓶 / 覆盖 ${new Set(enriched.map((x) => x.brand)).size} 个品牌`);
console.log(`缺中文品牌名的：${noCn.length} 瓶${noCn.length ? ' → ' + noCn.map((x) => x.brand).join(', ') : ''}`);

/* ---- 抓品牌池 ---- */
async function query(q, pageSize = 100) {
  const params = buildTaobaoParams({
    appKey: APP_KEY, secret: SECRET,
    method: 'taobao.tbk.dg.material.optional.upgrade',
    timestamp: gmt8Timestamp(),
    biz: { q, adzone_id: ADZONE, page_no: 1, page_size: pageSize, platform: 2 },
  });
  const res = await fetch(TAOBAO_GATEWAY, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const node = JSON.parse(await res.text());
  if (node.error_response) return { n: 0, err: node.error_response.sub_msg || node.error_response.msg, items: [] };
  const data = unwrapTaobao(node, 'taobao.tbk.dg.material.optional.upgrade');
  const list = data?.result_list?.map_data || [];
  return {
    n: list.length,
    items: list.map((it) => {
      const b = it.item_basic_info || {};
      return { title: b.title || '', cat: b.category_name || '', itemId: it.item_id };
    }),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pool = {};
const seenBrand = new Set();
for (const p of enriched) {
  if (!p.brandCn || seenBrand.has(p.brandCn)) continue;
  seenBrand.add(p.brandCn);
  const r = await query(p.brandCn);
  pool[p.brandCn] = { brand: p.brand, n: r.n, err: r.err || '', titles: r.items.map((x) => x.title) };
  console.log('POOL', p.brandCn.padEnd(6), `n=${String(r.n).padStart(3)}`, r.err ? 'err=' + r.err : '');
  await sleep(260);
}

fs.writeFileSync(path.join(ROOT, 'data/.cache/zh-name-brandpool.json'), JSON.stringify(pool, null, 2));
console.log(`品牌池 → data/.cache/zh-name-brandpool.json（${Object.keys(pool).length} 个品牌）`);
