/* 品牌池匹配：一次查询服务整个品牌，而不是一瓶四查

   思路来自两条实测：
     1. `阿玛芙 香水` 能召回 20 条（page_size=20 的上限），里面就有真品；
     2. 逐瓶 query 的尾部变体只救回 1/20，成本却是 40 次请求。

   如果 page_size=100 翻三页能拿到该品牌 200–300 条商品，
   那 103 瓶 Armaf 只需要 3 次请求，而不是 400 次。

   本脚本先量 Armaf：品牌池能覆盖 103 瓶里的多少瓶。
   匹配仍然走同一套 scoreMatch（含性别冲突判据），召回不等于接受。
*/
import fs from 'node:fs';
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp, pickBest } from './lib/union-api.mjs';

const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;
const aliases = JSON.parse(fs.readFileSync('data/brand-aliases.json', 'utf8'));
const classB = JSON.parse(fs.readFileSync('C:/Users/16256/ego/classB.json', 'utf8'));

async function page(keyword, pageNo, pageSize = 100) {
  const params = buildTaobaoParams({
    appKey: APP_KEY, secret: SECRET,
    method: 'taobao.tbk.dg.material.optional.upgrade',
    timestamp: gmt8Timestamp(),
    biz: { q: keyword, adzone_id: ADZONE, page_no: pageNo, page_size: pageSize, platform: 2 },
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
      return { title: b.title || '', categoryText: b.category_name || '',
        clickUrl: p.click_url || '', itemId: it.item_id,
        pictUrl: b.pict_url || '', whiteImage: b.white_image || '',
        smallImages: b.small_images?.string || [] };
    }),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BRAND = process.argv[2] || 'Armaf';
const ALIAS = process.argv[3] || '阿玛芙';
const bottles = classB.filter((p) => p.brand === BRAND);

(async () => {
  const pool = [];
  for (let pg = 1; pg <= 3; pg++) {
    for (const kw of [`${ALIAS} 香水`, `${ALIAS}`]) {
      const r = await page(kw, pg);
      await sleep(700);
      if (!r.n) { if (pg > 1) break; continue; }
      pool.push(...r.cands);
    }
    if (pool.length && pg === 1) continue;
  }

  /* 去重：同一 itemId 只留一条 */
  const seen = new Set();
  const uniq = pool.filter((c) => c.itemId && !seen.has(c.itemId) && seen.add(c.itemId));
  console.log(`${BRAND}：品牌池 ${pool.length} 条，去重后 ${uniq.length} 条；待匹配 ${bottles.length} 瓶\n`);

  let ok = 0;
  const rows = [];
  for (const p of bottles) {
    const m = pickBest({ brand: p.brand, name: p.name }, uniq, aliases);
    const pass = !!(m && m.accept);
    if (pass) ok++;
    rows.push({ id: p.id, name: p.name, ok: pass, cover: m ? m.nameCover : 0,
      reason: m ? m.reason : '', title: m ? String(m.title).slice(0, 60) : '', clickUrl: m?.clickUrl || '' });
    if (pass) console.log('PASS', p.name.slice(0, 34).padEnd(36), `cover=${m.nameCover.toFixed(2)} |`, String(m.title).slice(0, 46));
  }

  console.log(`\n=== ${BRAND}：${ok}/${bottles.length} = ${(ok / bottles.length * 100).toFixed(0)}% ===`);
  console.log(`（成本：品牌池 3 页 ≈ 6 次请求；逐瓶四变体是 ${bottles.length * 4} 次）`);
  fs.writeFileSync(`C:/Users/16256/ego/pool-${BRAND.replace(/\W/g, '')}.json`, JSON.stringify(rows, null, 1));
})();
