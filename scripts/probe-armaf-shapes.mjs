/* Armaf 103 瓶全在 B 类，最可疑 —— 这个品牌淘宝上明明一大片。
   直接量：同一个香名，换 6 种查询写法，看哪种能召回。 */
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp } from './lib/union-api.mjs';

const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;

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
  if (node.error_response) return { n: 0, err: node.error_response.sub_msg || node.error_response.msg };
  const data = unwrapTaobao(node, 'taobao.tbk.dg.material.optional.upgrade');
  const list = data?.result_list?.map_data || [];
  return {
    n: list.length,
    titles: list.map((it) => (it.item_basic_info?.title || '').slice(0, 60)),
  };
}

const SHAPES = [
  (b, e) => e,                 // 纯英文香名
  (b, e) => `${e} 香水`,        // 香名 + 品类词
  (b, e) => `${b} ${e}`,        // 中文品牌 + 英文香名
  (b, e) => `${b}`,             // 只中文品牌
  (b, e) => `${b} 香水`,        // 中文品牌 + 品类词
  (b, e) => e.split(' ').slice(-2).join(' '), // 香名后两词（砍系列前缀）
];

const CASES = [
  ['阿玛芙', 'Club de Nuit Milestone'],
  ['阿玛芙', 'Craze Man'],
  ['阿玛芙', 'Amber Arabia Oud'],
  ['阿玛芙', 'Club de Nuit Precieux IV'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (const [cn, en] of CASES) {
    console.log(`\n=== ${cn} / ${en} ===`);
    for (const f of SHAPES) {
      const kw = f(cn, en);
      const r = await q(kw);
      const hit = (r.titles || []).filter((t) => t.toLowerCase().includes(en.split(' ')[0].toLowerCase())).length;
      console.log(
        String(r.n).padStart(4),
        `命中香名首词 ${hit}`.padStart(10),
        JSON.stringify(kw).padEnd(34),
        r.err ? 'err=' + r.err : '| ' + (r.titles[0] || '')
      );
      await sleep(700);
    }
  }
})();
