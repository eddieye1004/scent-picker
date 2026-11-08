/* 验证四：召回有货但被判据拒掉的，到底该不该拒

   `Reflection Man` 找回 14 条，上一轮判"标题无香水品类词"全部拒收。
   14 条里如果确实有 Amouage Reflection Man 正装，那拒收就是判据过严；
   如果全是小样合集/无关商品，那拒收是对的。

   判据过严的代价：用户看不到购买链接。
   判据过松的代价：把「同款小样」或「别的牌子」当成本款，用户点进去买错东西。
   两者不能靠"感觉"平衡，要逐条看。
*/
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp, scoreMatch, normalizeTokens } from './lib/union-api.mjs';

const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;

async function query(q, pageSize = 20) {
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
  if (node.error_response) return { list: [], err: node.error_response.sub_msg };
  const data = unwrapTaobao(node, 'taobao.tbk.dg.material.optional.upgrade');
  return { list: data?.result_list?.map_data || [] };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CASES = [
  { perfume: { brand: 'Amouage', name: 'Reflection Man' }, q: 'Reflection Man' },
  { perfume: { brand: 'Montale', name: 'Arabians Tonka' }, q: '蒙塔莱 阿拉伯' },
  { perfume: { brand: 'Jo Malone London', name: 'English Pear & Freesia' }, q: '祖玛珑 英国梨' },
];

(async () => {
  for (const c of CASES) {
    console.log(`\n========== ${c.perfume.brand} / ${c.perfume.name}  q="${c.q}" ==========`);
    const r = await query(c.q, 20);
    if (r.err) { console.log('  错误：' + r.err); await sleep(300); continue; }
    console.log(`  返回 ${r.list.length} 条\n`);
    for (const it of r.list) {
      const b = it.item_basic_info || {};
      const title = b.title || '';
      const sc = scoreMatch(c.perfume, title, {});
      const cat = b.category_name || '';
      const firstCat = String(cat).split(/[,，>\/]/)[0].trim();
      console.log(`  [${sc.accept ? 'OK ' : '拒 '}] ${title.slice(0, 58)}`);
      console.log(`        品牌命中=${sc.brandHit ? 'Y' : 'N'} 覆盖率=${sc.nameCover} ${sc.accept ? '' : '理由=' + sc.reason}`);
      console.log(`        类目: ${firstCat.slice(0, 40)} | 店: ${(b.shop_title || '').slice(0, 24)}`);
    }
    await sleep(300);
  }
})();
