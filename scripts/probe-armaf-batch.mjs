/* Armaf 专项：103 瓶全在 B 类，但 Armaf 在淘宝上明明很多

   上面 probe-b-tail 的 40 瓶样本里只抽到 1 瓶 Armaf，不足以判断。
   这个脚本专门测 Armaf 的 20 瓶，比较「尾部变体」和「中文品牌+品类词」两条路。
*/
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp, pickBest } from './lib/union-api.mjs';
import fs from 'node:fs';

const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;
const aliases = JSON.parse(fs.readFileSync('data/brand-aliases.json', 'utf8'));
const classB = JSON.parse(fs.readFileSync('C:/Users/16256/ego/classB.json', 'utf8'));

async function q(keyword) {
  const params = buildTaobaoParams({
    appKey: APP_KEY, secret: SECRET,
    method: 'taobao.tbk.dg.material.optional.upgrade',
    timestamp: gmt8Timestamp(),
    biz: { q: keyword, adzone_id: ADZONE, page_no: 1, page_size: 20, platform: 2 },
  });
  const res = await fetch(TAOBAO_GATEWAY, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const node = JSON.parse(await res.text());
  if (node.error_response) return { n: 0, cands: [] };
  const data = unwrapTaobao(node, 'taobao.tbk.dg.material.optional.upgrade');
  const list = data?.result_list?.map_data || [];
  return {
    n: list.length,
    cands: list.map((it) => {
      const b = it.item_basic_info || {};
      const p = it.publish_info || {};
      return { title: b.title || '', categoryText: b.category_name || '', clickUrl: p.click_url || '' };
    }),
  };
}

function tailVariants(name) {
  const w = String(name).replace(/[,(（].*$/, '').trim().split(/\s+/).filter(Boolean);
  const out = [];
  if (w.length >= 3) out.push(w.slice(-2).join(' '));
  if (w.length >= 4) out.push(w.slice(-3).join(' '));
  return out;
}

const armaf = classB.filter((p) => p.brand === 'Armaf').slice(0, 20);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let byTail = 0; let byCn = 0;
  /* 中文品牌泛搜只打一次，20 瓶共用这批候选 —— 省 19 次请求 */
  const pool = await q('阿玛芙 香水');
  await sleep(800);
  console.log(`「阿玛芙 香水」召回 ${pool.n} 条，做共用候选池\n`);

  for (const p of armaf) {
    const full = { brand: p.brand, name: p.name };
    let got = null; let how = '';

    /* A. 尾部变体 */
    for (const kw of tailVariants(p.name)) {
      const r = await q(kw);
      await sleep(700);
      if (!r.n) continue;
      const m = pickBest(full, r.cands, aliases);
      if (m && m.accept) { got = { ...m, kw }; how = 'tail'; break; }
    }

    /* B. 共用池里能不能匹配上（零额外请求） */
    if (!got && pool.n) {
      const m = pickBest(full, pool.cands, aliases);
      if (m && m.accept) { got = { ...m, kw: '阿玛芙 香水' }; how = 'pool'; }
      else if (m && m.nameCover >= 0.4) how = `pool低 cover=${m.nameCover.toFixed(2)}`;
    }

    if (got && how === 'tail') byTail++;
    if (got && how === 'pool') byCn++;
    console.log(got ? 'PASS' : 'fail', p.name.slice(0, 32).padEnd(34),
      (got ? how : how || '').padEnd(18),
      got ? `cover=${got.nameCover.toFixed(2)} | ${String(got.title).slice(0, 40)}` : '');
  }

  console.log(`\n=== Armaf ${armaf.length} 瓶：尾部变体救回 ${byTail} · 中文品牌池救回 ${byCn} ===`);
  console.log('（共用池救回是零额外请求 —— 一次「中文品牌 香水」查询即可服务该品牌全部瓶）');
})();
