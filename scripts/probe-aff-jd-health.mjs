/* 京东线单次体检 —— 只回答一个问题：联盟开放平台的转链接口在这套凭证下能不能用。

   为什么单独一个脚本：`gen-affiliate-links.mjs --api` 读的是 JD_UNION_KEY 系列键名，
   而 `.env.local` 里存的是 JD_APP_KEY 系列，名字对不上；且它要跑满 1388 瓶才会写文件。
   这里只发 1~2 次请求，打印**结论级**信息，不打凭证、不打完整 clickURL。

   用法： node scripts/probe-aff-jd-health.mjs
*/
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildJdParams, unwrapJd, gmt8Timestamp } from './lib/union-api.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

const KEY = process.env.JD_APP_KEY;
const SECRET = process.env.JD_APP_SECRET;
const SITE = process.env.JD_SITE_ID;
const POS = process.env.JD_POSITION_ID;
const PID = process.env.JD_PID;
console.log(`凭证键：APP_KEY=${KEY ? 'SET' : 'MISSING'} SECRET=${SECRET ? 'SET' : 'MISSING'} ` +
  `SITE_ID=${SITE ? 'SET' : 'MISSING'} POSITION_ID=${POS ? 'SET' : 'MISSING'} PID=${PID ? 'SET' : 'MISSING'}`);
if (!KEY || !SECRET) { console.error('缺 APP_KEY / SECRET，停止'); process.exit(1); }

async function call(method, bizParams) {
  const params = buildJdParams({ appKey: KEY, secret: SECRET, method, timestamp: gmt8Timestamp(), bizParams });
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.append(k, String(v));
  const t0 = Date.now();
  const res = await fetch('https://api.jd.com/routerjson', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
    body,
  });
  const text = await res.text();
  console.log(`\n[${method}] HTTP ${res.status} · ${Date.now() - t0}ms · ${text.length}B`);
  let json = null;
  try { json = JSON.parse(text); } catch { console.log('非 JSON：' + text.slice(0, 160)); return null; }
  const inner = unwrapJd(json, method);
  if (inner?.error_response || inner?.code) {
    console.log('错误响应：' + JSON.stringify(inner).slice(0, 300));
    return null;
  }
  return inner;
}

/* ① 商品查询：确认这套 key 有没有「京东联盟」接口权限，顺带拿一个真 skuId */
const q = await call('jd.union.open.goods.query', {
  goodsReqDTO: { keyword: '娇兰 蝴蝶夫人 香水', pageIndex: 1, pageSize: 5, pid: PID || undefined },
});
let sku = null;
if (q) {
  const data = q.data || q.result || [];
  const arr = Array.isArray(data) ? data : (data.data || []);
  console.log(`返回商品 ${arr.length} 条`);
  for (const g of arr.slice(0, 5)) {
    console.log(`  sku=${g.skuId}  ¥${g.priceInfo?.price ?? '?'}  ${String(g.skuName || '').slice(0, 40)}`);
    if (!sku) sku = String(g.skuId);
  }
  if (q.totalCount !== undefined) console.log(`totalCount=${q.totalCount}`);
}

/* ② 转链：拿到 clickURL 才算这条路真的通 */
if (sku) {
  await new Promise((r) => setTimeout(r, 600));
  const p = await call('jd.union.open.promotion.common.get', {
    promotionCodeReq: { materialId: sku, siteId: SITE || '', positionId: POS || '' },
  });
  if (p) {
    const url = p.data?.clickURL || '';
    let host = '(空)';
    try { host = new URL(url).hostname; } catch { /* 留空 */ }
    console.log(`clickURL host=${host} len=${url.length}`);
    console.log(url ? '结论：转链接口可用' : '结论：返回里没有 clickURL');
  }
} else {
  console.log('\n没拿到 skuId，跳过转链测试 —— 说明商品查询这一步就不通。');
}
