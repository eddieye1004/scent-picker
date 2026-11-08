/* 别名归属的决定性验证：查「<别名> <该品牌的某个香名>」

   上一版判据（标题里要出现品牌拉丁名）证伪了两类情况：
     · 真别名但标题纯中文 —— JO MALONE 那类标题只写「祖玛珑」，查不到拉丁名
     · 真别名但拉丁名被缩写 —— YSL 标题写「YSL圣罗兰」，不含 "Yves Saint Laurent"

   所以换成因果闭环的测法：拿这个品牌在库里的一瓶香水，查「<别名> <香名>」。
   如果返回标题里**同时出现别名与该香名的拉丁写法**，那这条别名就确实指向
   这个品牌 —— 因为它和这个品牌旗下的一款具体香水同时出现。

   这比"标题里有没有品牌名"强，因为它排除掉「别名指向同行业另一个牌子」的可能。
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp } from './lib/union-api.mjs';
import { BRAND_ALIAS_ADD } from './lib/brand-alias-add.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;

const perfumesRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8'));
const perfumes = perfumesRaw.perfumes || perfumesRaw;
const byBrand = new Map();
for (const p of perfumes) {
  if (!byBrand.has(p.brand)) byBrand.set(p.brand, []);
  byBrand.get(p.brand).push(p);
}

async function query(q) {
  const params = buildTaobaoParams({
    appKey: APP_KEY, secret: SECRET,
    method: 'taobao.tbk.dg.material.optional.upgrade',
    timestamp: gmt8Timestamp(),
    biz: { q, adzone_id: ADZONE, page_no: 1, page_size: 20, platform: 2 },
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

const stripAccents = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 香名的"独特词"：去掉 of/the/a 这类虚词，取长度>=4 的拉丁词 */
const STOP = new Set(['of', 'the', 'a', 'an', 'and', 'de', 'du', 'la', 'le', 'pour', 'eau']);
function nameKeys(name) {
  return stripAccents(name).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

(async () => {
  const results = [];
  for (const [brand, aliases] of Object.entries(BRAND_ALIAS_ADD)) {
    const list = byBrand.get(brand) || [];
    // 挑一个香名足够独特的来测（独特词多、不太短）
    const probe = list
      .map((p) => ({ p, keys: nameKeys(p.name) }))
      .filter((x) => x.keys.length >= 1)
      .sort((a, b) => b.keys.length - a.keys.length)[0];
    if (!probe) { console.log(`SKIP ${brand}（库里没有可用香名）`); continue; }

    for (const alias of aliases) {
      const q = `${alias} ${probe.p.name}`;
      const r = await query(q);
      const aliasHit = r.titles.filter((t) => stripAccents(t).includes(stripAccents(alias))).length;
      const nameHit = r.titles.filter((t) => {
        const tl = stripAccents(t);
        return probe.keys.every((k) => tl.includes(k));
      }).length;
      const both = r.titles.filter((t) => {
        const tl = stripAccents(t);
        return tl.includes(stripAccents(alias)) && probe.keys.every((k) => tl.includes(k));
      }).length;
      const pass = both > 0;
      results.push({ brand, alias, perfume: probe.p.name, q, n: r.n, aliasHit, nameHit, both, pass, err: r.err || '' });
      console.log(
        pass ? 'PASS' : 'FAIL',
        brand.padEnd(28),
        alias.padEnd(16),
        `n=${String(r.n).padStart(2)}`,
        `两者同现 ${String(both).padStart(2)}`,
        `(别名${aliasHit}/香名${nameHit})`,
        `测:${probe.p.name.slice(0, 18)}`,
        r.err ? 'err=' + r.err : ''
      );
      await sleep(240);
    }
  }

  const ok = results.filter((x) => x.pass);
  const byBrandOk = {};
  for (const r of ok) { (byBrandOk[r.brand] = byBrandOk[r.brand] || []).push(r.alias); }
  console.log(`\n通过 ${ok.length}/${results.length}`);
  console.log('\n=== 可写入的别名 ===');
  console.log(JSON.stringify(byBrandOk, null, 2));
  fs.writeFileSync(path.join(ROOT, 'data/.cache/alias-crosscheck.json'), JSON.stringify(results, null, 2));
})();
