/* 接口连通性体检 —— 只回答「凭证能用吗、返回结构还是不是那一套」。
   不打印任何凭证值，也不打印完整 click_url（里面带推广位参数），只打 hostname 与长度。

   用法： node scripts/probe-aff-health.mjs
*/
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp } from './lib/union-api.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

/* 与 fetch-products.mjs 同一套解析规则：只补未设置的键，命令行优先。 */
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

const need = ['TB_APP_KEY', 'TB_APP_SECRET', 'TB_ADZONE_ID'];
const miss = need.filter((k) => !process.env[k]);
console.log(`凭证键：${need.map((k) => `${k}=${process.env[k] ? 'SET' : 'MISSING'}`).join(' ')}`);
if (miss.length) { console.error('缺键，停止'); process.exit(1); }

const params = buildTaobaoParams({
  appKey: process.env.TB_APP_KEY,
  secret: process.env.TB_APP_SECRET,
  method: 'taobao.tbk.dg.material.optional.upgrade',
  timestamp: gmt8Timestamp(),
  biz: { q: '蝴蝶夫人', adzone_id: process.env.TB_ADZONE_ID, page_no: 1, page_size: 20, platform: 2 },
});
const body = new URLSearchParams();
for (const [k, v] of Object.entries(params)) body.append(k, String(v));
const t0 = Date.now();
const res = await fetch(TAOBAO_GATEWAY, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
  body,
});
const text = await res.text();
console.log(`HTTP ${res.status} · ${Date.now() - t0}ms · ${text.length}B`);
let json;
try { json = JSON.parse(text); } catch { console.log('非 JSON 返回，头 120 字：' + text.slice(0, 120)); process.exit(1); }

let node;
try { node = unwrapTaobao(json, 'taobao.tbk.dg.material.optional.upgrade'); }
catch (e) { console.log('unwrapTaobao 抛错：' + String(e.message).slice(0, 200)); process.exit(1); }

const list = node?.result_list?.map_data || [];
console.log(`map_data ${list.length} 条`);
if (list[0]) {
  const it = list[0];
  const flat = { ...it, ...(it.item_basic_info || {}), ...(it.publish_info || {}), ...(it.price_promotion_info || {}) };
  const host = (() => { try { return new URL(flat.click_url || '').hostname; } catch { return '(解析不出)'; } })();
  console.log(`首条：item_id=${it.item_id ?? '?'} title.len=${String(flat.title || '').length} ` +
    `click_url.host=${host} click_url.len=${String(flat.click_url || '').length}`);
  console.log(`category=${flat.level_one_category_name || ''}/${flat.category_name || ''}`);
}
