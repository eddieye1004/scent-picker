/* 关键词降级探针（K1）
   对 882 瓶缺链里的样本，逐个试候选查询写法，看哪种能召回、且召回的能匹配上。

   目的不是"多搜几个词"，而是先量清楚：**这 882 瓶到底是"查询写法不对"还是"平台真没有"**。
   上一轮 taobaoQueryVariants 的四变体注释说 jo-malone/montale/mancera 全 0 是"真的没有推广计划"，
   但那句话是 360 瓶时的观察，没有对 882 瓶复核过。

   用法：
     TB_APP_KEY=.. TB_APP_SECRET=.. TB_ADZONE_ID=.. node scripts/probe-keyword-ladder.mjs [样本数]
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp,
  taobaoQueryVariants, pickBest, scoreMatch,
} from './lib/union-api.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;
if (!APP_KEY || !SECRET || !ADZONE) {
  console.error('缺环境变量 TB_APP_KEY / TB_APP_SECRET / TB_ADZONE_ID');
  process.exit(1);
}

const LIMIT = Number(process.argv[2] || 12);
const perfumesRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8'));
const perfumes = perfumesRaw.perfumes || perfumesRaw;
const aliasRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/brand-aliases.json'), 'utf8'));
const ALIAS = aliasRaw.alias || aliasRaw;

const links = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/affiliate-links.json'), 'utf8'));
const have = new Set(Object.keys(links.taobao || {}));
const missing = perfumes.filter((p) => !have.has(p.id));

const FAMILY_ZH = {
  citrus: '柑橘', floral: '花香', woody: '木质', amber: '琥珀',
  fresh: '清新', gourmand: '美食',
};
function dominantFamily(p) {
  const fams = p.families || {};
  let best = null, bestW = -1;
  for (const [k, w] of Object.entries(fams)) { if (w > bestW) { bestW = w; best = k; } }
  return best;
}

/* 候选阶梯：每一档是 (perfume) => string[]。
   顺序由"召回广度"决定 —— 越后面越泛，也越可能召回错的东西。 */
const LADDERS = [
  { id: 'L0 现有四变体', build: (p) => taobaoQueryVariants(p, ALIAS) },
  { id: 'L1 香名+香水', build: (p) => [`${p.name} 香水`] },
  { id: 'L2 中文品牌+香水', build: (p) => {
      const aliases = (ALIAS[p.brand] || []).filter((s) => /[\u4e00-\u9fa5]/.test(s));
      return aliases.length ? [`${aliases[0]} 香水`] : [];
    } },
  { id: 'L3 英文品牌+香水', build: (p) => [`${p.brand} 香水`] },
  { id: 'L4 品牌+香名', build: (p) => [`${p.brand} ${p.name}`] },
  { id: 'L5 中文品牌+香名', build: (p) => {
      const aliases = (ALIAS[p.brand] || []).filter((s) => /[\u4e00-\u9fa5]/.test(s));
      return aliases.length ? [`${aliases[0]} ${p.name}`] : [];
    } },
  { id: 'L6 香族泛搜', build: (p) => {
      const f = dominantFamily(p);
      const zh = FAMILY_ZH[f];
      return zh ? [`${zh} 香水`] : [];
    } },
];

async function post(params) {
  const res = await fetch(TAOBAO_GATEWAY, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function query(q) {
  const params = buildTaobaoParams({
    appKey: APP_KEY, secret: SECRET,
    method: 'taobao.tbk.dg.material.optional.upgrade',
    timestamp: gmt8Timestamp(),
    biz: { q, adzone_id: ADZONE, page_no: 1, page_size: 20, platform: 2 },
  });
  const { text } = await post(params);
  let node;
  try { node = JSON.parse(text); } catch { return { ok: false, err: 'JSON 解析失败', n: 0 }; }
  if (node.error_response) {
    const m = node.error_response.sub_msg || node.error_response.msg || '';
    return { ok: false, err: m, n: 0, code: node.error_response.code };
  }
  try {
    const data = unwrapTaobao(node, 'taobao.tbk.dg.material.optional.upgrade');
    const list = data?.result_list?.map_data || [];
    return { ok: true, n: list.length, list };
  } catch (e) {
    return { ok: false, err: String(e.message).slice(0, 60), n: 0 };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 抽样：跨品牌均匀取，别全落在 Armaf 一家
  const byBrand = new Map();
  for (const p of missing) {
    if (!byBrand.has(p.brand)) byBrand.set(p.brand, []);
    byBrand.get(p.brand).push(p);
  }
  const sample = [];
  const brands = [...byBrand.keys()];
  let i = 0;
  while (sample.length < LIMIT && i < 500) {
    const b = brands[i % brands.length];
    const arr = byBrand.get(b);
    const idx = Math.floor(i / brands.length);
    if (arr[idx]) sample.push(arr[idx]);
    i++;
  }

  console.log(`库容 ${perfumes.length} | 有链 ${have.size} | 缺链 ${missing.length}`);
  console.log(`抽样 ${sample.length} 瓶（跨 ${new Set(sample.map((p) => p.brand)).size} 个品牌）\n`);

  const tally = {};   // ladderId -> { tried, recalled, accepted }
  const perBottle = [];

  for (const p of sample) {
    const row = { id: p.id, brand: p.brand, name: p.name, hits: [] };
    for (const lad of LADDERS) {
      const qs = lad.build(p).filter(Boolean);
      if (!qs.length) continue;
      const q = qs[0];
      let r;
      try { r = await query(q); } catch (e) { r = { ok: false, err: String(e.message).slice(0, 40), n: 0 }; }
      await sleep(220);

      let verdict = '无结果';
      let bestTitle = null;
      if (r.ok && r.n > 0) {
        const best = pickBest(p, r.list.map((it) => {
          const b = it.item_basic_info || {};
          return { itemId: it.item_id, title: b.title || '' };
        }), ALIAS);
        const sc = best ? scoreMatch(p, best.title, ALIAS) : null;
        verdict = sc?.accept ? 'ACCEPT' : `召回但拒（${sc?.reason || '?'}）`;
        bestTitle = best?.title ? String(best.title).slice(0, 46) : null;
      } else if (r.err) {
        verdict = `错误：${r.err}`;
      }

      tally[lad.id] = tally[lad.id] || { tried: 0, recalled: 0, accepted: 0 };
      tally[lad.id].tried++;
      if (r.ok && r.n > 0) tally[lad.id].recalled++;
      if (verdict === 'ACCEPT') tally[lad.id].accepted++;

      row.hits.push({ ladder: lad.id, q, n: r.n, verdict, title: bestTitle });
      if (verdict === 'ACCEPT') break;   // 命中就停，和线上逻辑一致
    }
    perBottle.push(row);
    const hit = row.hits.find((h) => h.verdict === 'ACCEPT');
    console.log(`${p.id.padEnd(38)} ${hit ? '✓ ' + hit.ladder : '✗ 全落空'}`);
    if (hit) console.log(`     q="${hit.q}" → ${hit.title}`);
    else for (const h of row.hits) console.log(`     ${h.ladder.padEnd(16)} q="${h.q}" ${h.verdict}`);
  }

  console.log('\n=== 各档召回与命中 ===');
  console.log('档位'.padEnd(20), '尝试', '召回', '命中');
  for (const [k, v] of Object.entries(tally)) {
    console.log(k.padEnd(20), String(v.tried).padStart(4), String(v.recalled).padStart(4), String(v.accepted).padStart(4));
  }
  const ok = perBottle.filter((r) => r.hits.some((h) => h.verdict === 'ACCEPT')).length;
  console.log(`\n样本命中 ${ok}/${perBottle.length} = ${Math.round(ok / perBottle.length * 100)}%`);

  const out = path.join(ROOT, 'data/.cache/keyword-ladder-probe.json');
  fs.writeFileSync(out, JSON.stringify(perBottle, null, 2));
  console.log('明细：' + out);
})();
