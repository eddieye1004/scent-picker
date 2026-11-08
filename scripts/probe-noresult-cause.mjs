/* 验证三：「无结果」是参数问题还是库存问题

   已知 882 瓶缺链里，767 次是 API 返回 code 15「无结果」。
   在把「关键词降级」写进代码之前，必须先排除三个参数层面的可能：
     1. page_size 太小（当前 20）—— 有没有更多页？
     2. platform 参数选错（当前 2）—— 有没有别的取值能搜到？
     3. 中文/英文写法差异 —— 中文名能不能搜到？

   用三个「确认搜不到」的款做对照：Amouage Reflection Man / Montale Arabians Tonka /
   Jo Malone English Pear & Freesia。它们在英文查询下全无结果。
*/
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp } from './lib/union-api.mjs';

const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;

async function query(q, opts = {}) {
  const biz = {
    q, adzone_id: ADZONE,
    page_no: opts.pageNo || 1,
    page_size: opts.pageSize || 20,
  };
  if (opts.platform !== null) biz.platform = opts.platform ?? 2;
  if (opts.sort) biz.sort = opts.sort;

  const params = buildTaobaoParams({
    appKey: APP_KEY, secret: SECRET,
    method: 'taobao.tbk.dg.material.optional.upgrade',
    timestamp: gmt8Timestamp(),
    biz,
  });
  const res = await fetch(TAOBAO_GATEWAY, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const node = JSON.parse(await res.text());
  if (node.error_response) {
    const e = node.error_response;
    return { n: 0, err: `${e.code}/${e.sub_msg || e.msg}`, titles: [] };
  }
  const data = unwrapTaobao(node, 'taobao.tbk.dg.material.optional.upgrade');
  const list = data?.result_list?.map_data || [];
  return { n: list.length, titles: list.map((it) => (it.item_basic_info || {}).title || '') };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SCENTS = [
  { label: 'Amouage Reflection Man', qs: ['Reflection Man', '反射男士 香水', '爱慕反射男士'] },
  { label: 'Montale Arabians Tonka', qs: ['Arabians Tonka', '阿拉伯沉香 蒙塔莱', '蒙塔莱 阿拉伯'] },
  { label: 'Jo Malone English Pear', qs: ['English Pear Freesia', '祖玛珑 英国梨', '祖玛珑 英国梨与小苍兰'] },
];

(async () => {
  for (const s of SCENTS) {
    console.log(`\n========== ${s.label} ==========`);
    for (const q of s.qs) {
      // 参数维度
      const cases = [
        { label: 'page_size=20 platform=2', opts: {} },
        { label: 'page_size=100 platform=2', opts: { pageSize: 100 } },
        { label: 'platform 省略', opts: { platform: null } },
        { label: 'platform=1', opts: { platform: 1 } },
        { label: 'sort=total_sales_desc', opts: { sort: 'total_sales_desc' } },
      ];
      console.log(`  q="${q}"`);
      for (const c of cases) {
        const r = await query(q, c.opts);
        console.log(`    ${c.label.padEnd(28)} n=${String(r.n).padStart(3)} ${r.err || ''}`);
        await sleep(280);
      }
    }
  }
})();
