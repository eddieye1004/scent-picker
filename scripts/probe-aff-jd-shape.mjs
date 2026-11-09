/* 京东转链接口的真实返回结构取证（只读，不发多次请求）。

   上一支探针发现：`jd.union.open.promotion.common.get` 返回
     jd_union_open_promotion_common_get_responce: { code: 0, getResult: "<json 字符串>" }
   而 `scripts/lib/union-api.mjs:85` 的 unwrapJd 只找 `result` / `queryResult`，
   所以它对这个方法是**抛错**的 —— 不是接口不通，是解包器没见过 `getResult`。
   这条差异直接决定京东线的结论是「不做」还是「改 3 行就能做」。

   本脚本把 getResult 拆开只打结构（键名、长度、host），不打凭证、不打完整链接。
   用法：node scripts/probe-aff-jd-shape.mjs
*/
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildJdParams, gmt8Timestamp } from './lib/union-api.mjs';

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
const SITE = process.env.JD_SITE_ID; const POS = process.env.JD_POSITION_ID;

async function raw(method, biz) {
  const params = buildJdParams({ appKey: KEY, secret: SECRET, method, timestamp: gmt8Timestamp(), bizParams: biz });
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.append(k, String(v));
  const res = await fetch('https://api.jd.com/routerjson', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' }, body,
  });
  return { status: res.status, json: await res.json() };
}

/* 转链：`siteId` 那一路被判「不支持 siteId 用于此种方式推广,只支持网站/APP」。
   按提示逐个变体试：只给 positionId / 只给 siteId / 都不给。
   能拿到 clickURL 就是通了的证据；拿不到也把业务码记下来。 */
const VARIANTS = [
  ['只给 positionId', { materialId: '1000000000000000000', positionId: POS || '' }],
  ['只给 siteId', { materialId: '1000000000000000000', siteId: SITE || '' }],
  ['都不给', { materialId: '1000000000000000000' }],
];
for (const [label, req] of VARIANTS) {
  const { status, json } = await raw('jd.union.open.promotion.common.get', { promotionCodeReq: req });
  const shell = json['jd_union_open_promotion_common_get_responce'] || {};
  console.log(`\n[${label}] HTTP ${status}  shell.code=${shell.code}`);
  let inner = shell.getResult;
  if (typeof inner === 'string') { try { inner = JSON.parse(inner); } catch { console.log(`  非 JSON：${String(inner).slice(0, 100)}`); continue; } }
  if (!inner) { console.log('  无 getResult'); continue; }
  console.log(`  业务码 ${inner.code}  ${String(inner.message ?? '').slice(0, 140)}`);
  if (inner.data?.clickURL) {
    const u = inner.data.clickURL;
    let host = '?'; try { host = new URL(u.startsWith('//') ? 'https:' + u : u).hostname; } catch { /* */ }
    console.log(`  ✓ clickURL host=${host} len=${u.length}`);
  }
  await new Promise((r) => setTimeout(r, 600));
}

/* 社交电商转链：`.env.local` 里这个站点的媒体类型是「聊天工具/微信」，
   而 promotion.common.get 明确只收「网站/APP」（业务码 2001701）。
   微信类媒体走的是 bysubunionid.get（要 subUnionId）。这是唯一还没试的分支，
   不试就给「京东不做」的结论，等于把一次配置问题写成死局。 */
for (const [label, biz] of [
  ['只给 siteId+materialId', { promotionCodeReq: { materialId: '1000000000000000000', siteId: SITE || '' } }],
  ['带 subUnionId', { promotionCodeReq: { materialId: '1000000000000000000', siteId: SITE || '', subUnionId: 'scentpicker' } }],
]) {
  try {
    const { status, json } = await raw('jd.union.open.promotion.bysubunionid.get', biz);
    const shellKey = Object.keys(json).find((k) => k.includes('bysubunionid')) || '(无对应壳)';
    const shell = json[shellKey] || {};
    console.log(`\n[bysubunionid · ${label}] HTTP ${status}  shell.code=${shell.code ?? '(无)'}`);
    let inner = shell.getResult ?? shell.result ?? shell.queryResult;
    if (typeof inner === 'string') { try { inner = JSON.parse(inner); } catch { console.log(`  非 JSON：${String(inner).slice(0, 100)}`); continue; } }
    if (!inner) { console.log(`  壳键：${Object.keys(shell).join(', ') || '(空)'} —— 无业务体`); continue; }
    console.log(`  业务码 ${inner.code}  ${String(inner.message ?? '').slice(0, 140)}`);
    if (inner.data?.clickURL) {
      const u = inner.data.clickURL;
      let host = '?'; try { host = new URL(u.startsWith('//') ? 'https:' + u : u).hostname; } catch { /* */ }
      console.log(`  ✓ clickURL host=${host} len=${u.length}`);
    }
  } catch (e) {
    console.log(`\n[bysubunionid · ${label}] 抛错：${String(e.message).slice(0, 140)}`);
  }
  await new Promise((r) => setTimeout(r, 600));
}
