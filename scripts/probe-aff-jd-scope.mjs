/* 京东线取证：区分「没权限」和「没商品」。

   为什么要单独测：`goods.query` 报 403「无访问权限」，但那只证明**查询接口**没授权；
   转链接口（promotion.common.get）是另一个权限组，可能单独开通过。
   不测这一下就给「京东不做」的结论，等于把一次权限配置问题写成死局。

   做法：用一个明显不存在的 materialId 调转链接口。
     · 报「无访问权限」→ 该接口也没授权，这条路要后台开权限
     · 报「商品不存在 / 参数错误」→ 接口通了，只是这个 sku 不对 —— 结论完全不同

   只打错误码与文案，不打凭证。用法：node scripts/probe-aff-jd-scope.mjs
*/
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildJdParams, unwrapJd, gmt8Timestamp } from './lib/union-api.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
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

const KEY = process.env.JD_APP_KEY; const SECRET = process.env.JD_APP_SECRET;
if (!KEY || !SECRET) { console.error('缺 APP_KEY / SECRET'); process.exit(1); }

async function probe(method, biz) {
  const params = buildJdParams({ appKey: KEY, secret: SECRET, method, timestamp: gmt8Timestamp(), bizParams: biz });
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.append(k, String(v));
  const res = await fetch('https://api.jd.com/routerjson', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' }, body,
  });
  const text = await res.text();
  let j = null; try { j = JSON.parse(text); } catch { /* 非 JSON */ }
  let inner = null;
  try { inner = j ? unwrapJd(j, method) : null; }
  catch (e) {
    /* unwrapJd 抛错本身就是证据：说明响应壳在、业务体不在。
       把**壳里有什么**打出来 —— 这比"抛了个异常"能定位得多。 */
    console.log(`[${method}]`);
    console.log(`  HTTP ${res.status} · ${String(e.message).slice(0, 160)}`);
    if (j) {
      const top = Object.keys(j);
      console.log(`  响应顶层键：${top.join(', ')}`);
      for (const k of top) {
        if (k === 'error_response') { console.log(`  error_response：${JSON.stringify(j[k]).slice(0, 200)}`); continue; }
        const node = j[k];
        if (node && typeof node === 'object') {
          console.log(`  ${k} 的键：${Object.keys(node).join(', ') || '(空对象)'}`);
          if (node.code || node.message) console.log(`    code=${node.code} message=${String(node.message).slice(0, 120)}`);
        }
      }
    }
    return { code: 'unwrap-failed', msg: String(e.message) };
  }
  const code = inner?.code ?? inner?.error_response?.code ?? '?';
  const msg = inner?.message ?? inner?.code ? (inner?.message ?? inner?.code) : '(无 code/message 字段)';
  console.log(`[${method}]`);
  console.log(`  HTTP ${res.status} · code=${code} · message=${String(msg).slice(0, 120)}`);
  return { code: String(code), msg: String(msg) };
}

console.log('凭证键：APP_KEY=SET SECRET=SET\n');

/* ① 转链接口，故意给一个不存在的 sku */
await probe('jd.union.open.promotion.common.get', {
  promotionCodeReq: { materialId: '1000000000000000000', siteId: process.env.JD_SITE_ID || '', positionId: process.env.JD_POSITION_ID || '' },
});

await new Promise((r) => setTimeout(r, 600));

/* ② 再试商品查询，确认 403 是稳定的还是偶发 */
await probe('jd.union.open.goods.query', {
  goodsReqDTO: { keyword: '香水', pageIndex: 1, pageSize: 1, pid: process.env.JD_PID || undefined },
});
