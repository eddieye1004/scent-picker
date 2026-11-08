/* B 类零召回到底是「淘宝真没有」还是「被限流了」

   背景：481 瓶 B 类，缓存里存的是 4 个变体全返回 0 之后留下的最后一个关键词。
   但那一轮是 1028 次请求连续打了 15 分钟 —— 阿里妈妈有搜索反刷（code=17
   Ajax hit anti brush），静默降级成推荐流或空结果。所以「0 条」这个结论本身
   需要复核，否则会把限流误判成「淘宝没有」。

   这个脚本对 6 瓶已知能搜到的（试点里 PASS 过的）+ 6 瓶 B 类的做对照实测。
*/
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
  const txt = await res.text();
  let node;
  try { node = JSON.parse(txt); } catch { return { n: -1, err: 'JSON 解析失败', first: txt.slice(0, 80) }; }
  if (node.error_response) {
    const e = node.error_response;
    return { n: 0, err: `${e.code || ''} ${e.sub_msg || e.msg || ''}`.trim() };
  }
  const data = unwrapTaobao(node, 'taobao.tbk.dg.material.optional.upgrade');
  const list = data?.result_list?.map_data || [];
  return { n: list.length, first: (list[0]?.item_basic_info?.title || '').slice(0, 56) };
}

const CASES = [
  /* 对照组：试点里 10/18 命中过，说明这些查询当时是通的 */
  ['对照 娇兰 蝴蝶夫人', '娇兰 蝴蝶夫人'],
  ['对照 祖玛珑 英国梨', '祖玛珑 英国梨'],
  /* B 类原样重放：缓存里存的就是这一条，当时返回 0 */
  ['B类 Guerlain Mitsouko', 'Guerlain Mitsouko'],
  ['B类 Montale Arabians Tonka', 'Montale Arabians Tonka'],
  /* B 类只有香名的变体（变体 0/1），当时也返回 0 */
  ['B类 纯香名 Mitsouko', 'Mitsouko'],
  ['B类 纯香名 Arabians Tonka', 'Arabians Tonka'],
  /* B 类的中文写法 */
  ['B类 娇兰 蝴蝶夫人（同对照）', '娇兰 蝴蝶夫人'],
  ['B类 蒙塔莱 阿拉伯沉香（同对照）', '蒙塔莱 阿拉伯沉香'],
  /* Armaf 系列：103 瓶全在 B 类，最可疑 —— 这个品牌淘宝上明明很多 */
  ['B类 阿玛芙 夜店狂欢', '阿玛芙 夜店狂欢'],
  ['B类 阿玛芙 Club de Nuit', '阿玛芙 Club de Nuit'],
  ['B类 Armaf Club de Nuit', 'Armaf Club de Nuit'],
  ['B类 Club de Nuit Milestone', 'Club de Nuit Milestone'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (const [label, kw] of CASES) {
    const r = await q(kw);
    console.log(
      String(r.n).padStart(4),
      label.padEnd(36),
      r.err ? 'err=' + r.err : '| ' + (r.first || '（无标题）')
    );
    await sleep(900);
  }
})();
