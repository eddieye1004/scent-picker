/* B 类救回实验：现有 4 个变体只试香名**首词**，从不试尾部

   决定性实测（probe-armaf-shapes.mjs）：
     "Club de Nuit Milestone"          → 0 条
     "Club de Nuit Milestone 香水"      → 0 条
     "阿玛芙 Club de Nuit Milestone"     → 0 条
     "Nuit Milestone"                  → 1 条，正是「ARMAF CLUB NUIT MILESTONE 6.7OZ EDP阿玛芙里程正品」
   系列前缀（Club de Nuit）是识别系列用的，不是识别这一瓶用的；
   淘宝标题里常写成 "CLUB NUIT MILESTONE"（连 de 都省），全名一个词都对不上。

   现有变体的 head 取 `name.split(/[,(（]/)[0]`，对 "Club de Nuit Milestone"
   得到的是 "Club" —— 首词在系列香里恰恰是最没有区分度的那个。

   本脚本量两件事：
     1. 尾部变体（后 2 / 后 3 词）能召回多少 B 类
     2. 召回之后能不能过 scoreMatch（召回 ≠ 接受）
*/
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp, pickBest } from './lib/union-api.mjs';
import fs from 'node:fs';

const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;

const aliases = JSON.parse(fs.readFileSync('data/brand-aliases.json', 'utf8'));
const classB = JSON.parse(fs.readFileSync('C:/Users/16256/ego/classB.json', 'utf8'));

async function q(keyword, pageSize = 20) {
  const params = buildTaobaoParams({
    appKey: APP_KEY, secret: SECRET,
    method: 'taobao.tbk.dg.material.optional.upgrade',
    timestamp: gmt8Timestamp(),
    biz: { q: keyword, adzone_id: ADZONE, page_no: 1, page_size: pageSize, platform: 2 },
  });
  const res = await fetch(TAOBAO_GATEWAY, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const node = JSON.parse(await res.text());
  if (node.error_response) return { n: 0, cands: [], err: node.error_response.sub_msg || node.error_response.msg };
  const data = unwrapTaobao(node, 'taobao.tbk.dg.material.optional.upgrade');
  const list = data?.result_list?.map_data || [];
  return {
    n: list.length,
    cands: list.map((it) => {
      const b = it.item_basic_info || {};
      const p = it.publish_info || {};
      return { title: b.title || '', categoryText: b.category_name || '', clickUrl: p.click_url || '', itemId: it.item_id };
    }),
  };
}

/* 尾部变体：砍掉前 k 个词 */
function tails(name, brand) {
  const words = String(name).replace(/[,(（].*$/, '').trim().split(/\s+/).filter(Boolean);
  const out = [];
  if (words.length >= 3) out.push(words.slice(-2).join(' '));
  if (words.length >= 4) out.push(words.slice(-3).join(' '));
  return out;
}

/* 每个品牌取前 N 瓶，保证跨品牌覆盖，避免连打同一品牌被限流 */
function sample(bottles, perBrand, limit) {
  const byBrand = new Map();
  for (const b of bottles) {
    if (!byBrand.has(b.brand)) byBrand.set(b.brand, []);
    byBrand.get(b.brand).push(b);
  }
  const out = [];
  let round = 0;
  while (out.length < limit) {
    let added = false;
    for (const [br, list] of byBrand) {
      if (round < Math.min(perBrand, list.length) && out.length < limit) {
        out.push(list[round]);
        added = true;
      }
    }
    if (!added) break;
    round++;
  }
  return out;
}

const SAMPLE = sample(classB, 2, 40);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const rows = [];
  let recall = 0; let accepted = 0;

  for (const p of SAMPLE) {
    const full = { brand: p.brand, name: p.name };
    let best = null; let usedKw = '';
    for (const kw of tails(p.name, p.brand)) {
      const r = await q(kw);
      await sleep(750);
      if (r.n === 0) continue;
      const m = pickBest(full, r.cands, aliases);
      if (m && m.accept) { best = { ...m, clickUrl: m.clickUrl, kw }; usedKw = kw; break; }
      if (!best) best = { ...m, kw };
    }
    const ok = !!(best && best.accept);
    if (best && best.nameCover > 0) recall++;
    if (ok) accepted++;
    rows.push({ id: p.id, brand: p.brand, name: p.name, kw: usedKw, ok, cover: best ? best.nameCover : 0,
      title: best ? String(best.title).slice(0, 56) : '' });
    console.log(ok ? 'PASS' : 'fail', p.brand.padEnd(22), p.name.slice(0, 30).padEnd(32),
      usedKw ? JSON.stringify(usedKw).padEnd(26) : ''.padEnd(26),
      best ? `cover=${best.nameCover.toFixed(2)}` : '', ok ? '| ' + String(best.title).slice(0, 44) : '');
  }

  console.log(`\n=== 样本 ${SAMPLE.length} 瓶：有召回 ${recall} · 能接受 ${accepted} = ${(accepted / SAMPLE.length * 100).toFixed(0)}% ===`);
  fs.writeFileSync('C:/Users/16256/ego/b-tail-probe.json', JSON.stringify(rows, null, 1));
})();
