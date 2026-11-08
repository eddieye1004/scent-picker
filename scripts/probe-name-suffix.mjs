/* 决定性矩阵：拉丁香名到底怎么才能被搜到

   前一轮结论：中文品牌 + 香水（n=100）命中率 0/10 —— 品牌对了，香名不对。
   但已知一条反例：`English Pear Freesia` n=0，`祖玛珑 英国梨` n=19。
   说明救回来的关键是**中文香名**，不是中文品牌。

   我们没有中文香名（Scento 数据只有英文）。所以这一轮只测一件事：
   在拉丁香名后面加中文品类词，能不能把结果从「无结果/跑题」变成「有真品」。

   五个变体，同一批瓶：
     V1 纯香名                      （基线，已知多数失败）
     V2 香名 + 香水
     V3 香名 + 淡香水
     V4 香名 + 香精
     V5 中文品牌 + 香名              （品牌+香名，之前测过常为 0，作对照）
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp, normalizeTokens } from './lib/union-api.mjs';
import { BRAND_ALIAS_ADD } from './lib/brand-alias-add.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;

const perfumesRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8'));
const perfumes = perfumesRaw.perfumes || perfumesRaw;
const links = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/affiliate-links.json'), 'utf8'));
const have = new Set(Object.keys(links.taobao || {}));
const missing = perfumes.filter((p) => !have.has(p.id));

/* 抽样：优先选之前确认「无结果」的那几瓶（前面探针都记录过），保证测的是难例 */
const HARD = ['guerlain-mitsouko', 'jo-malone-london-english-pear-freesia', 'amouage-reflection-man',
  'montale-arabians-tonka', 'mancera-cedrat-boise', 'yves-saint-laurent-la-nuit-de-l-homme',
  'frederic-malle-lipstick-rose', 'maison-margiela-fragrances-replica-by-the-fireplace'];
const sample = [];
for (const id of HARD) { const p = perfumes.find((x) => x.id === id); if (p) sample.push(p); }
for (const p of missing) {
  if (sample.length >= 8) break;
  if (!sample.includes(p) && !have.has(p.id)) sample.push(p);
}

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
  if (node.error_response) return { n: 0, err: node.error_response.sub_msg || node.error_response.msg, titles: [] };
  const data = unwrapTaobao(node, 'taobao.tbk.dg.material.optional.upgrade');
  const list = data?.result_list?.map_data || [];
  return { n: list.length, titles: list.map((it) => (it.item_basic_info || {}).title || '') };
}

const strip = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STOP = new Set(['of', 'the', 'a', 'an', 'and', 'de', 'du', 'la', 'le', 'pour', 'eau', 'man', 'woman', 'by']);
function nameToks(name) {
  return strip(name).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

(async () => {
  const rows = [];
  for (const p of sample) {
    const toks = nameToks(p.name);
    const cn = (BRAND_ALIAS_ADD[p.brand] || []).find((a) => /[\u4e00-\u9fa5]/.test(a)) || '';
    const V = {
      V1: p.name,
      V2: `${p.name} 香水`,
      V3: `${p.name} 淡香水`,
      V4: `${p.name} 香精`,
      V5: cn ? `${cn} ${p.name}` : '',
    };
    const rec = { id: p.id, brand: p.brand, name: p.name, toks, res: {} };
    for (const [k, q] of Object.entries(V)) {
      if (!q) { rec.res[k] = { q, n: 0, hit: 0, err: 'skip' }; continue; }
      const r = await query(q, 100);
      const hit = r.titles.filter((t) => { const tl = strip(t); return toks.length > 0 && toks.every((x) => tl.includes(x)); });
      rec.res[k] = { q, n: r.n, hit: hit.length, sample: hit.slice(0, 1).map((s) => s.slice(0, 60)), err: r.err || '' };
      await sleep(230);
    }
    rows.push(rec);
    console.log(
      p.brand.padEnd(20), p.name.slice(0, 22).padEnd(24),
      Object.entries(rec.res).map(([k, v]) => `${k} n=${String(v.n).padStart(3)} h=${v.hit}`).join('  ')
    );
  }

  console.log('\n=== 各变体命中瓶数 ===');
  for (const k of ['V1', 'V2', 'V3', 'V4', 'V5']) {
    const c = rows.filter((r) => (r.res[k]?.hit || 0) > 0).length;
    console.log(`${k}: ${c}/${rows.length}`);
  }
  const anyHit = rows.filter((r) => Object.values(r.res).some((v) => v.hit > 0)).length;
  console.log(`\n任一变体命中：${anyHit}/${rows.length} = ${(anyHit / rows.length * 100).toFixed(0)}%`);
  fs.writeFileSync(path.join(ROOT, 'data/.cache/name-suffix-matrix.json'), JSON.stringify(rows, null, 2));
  console.log('明细 → data/.cache/name-suffix-matrix.json');
})();
