/* 诊断：泛搜召回的 20 条里，到底有没有目标款？

   上一轮 probe-keyword-ladder 显示 L3「品牌+香水」召回 8/8、命中 0/8，
   拒收原因全是「香名覆盖率 0% < 60%」。两种可能：
     A. 那 20 条里真的没有这款（货源问题）
     B. 有这款，但它在第 2 页之后（page_size 太小）
     C. 有这款，但标题写法与我们的分词对不上（判据问题）
   这三种的处置完全不同，必须先分清。
*/
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp, normalizeTokens } from './lib/union-api.mjs';

const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;

const CASES = [
  { q: 'Amouage 香水', want: ['reflection', 'man'] },
  { q: 'Montale 香水', want: ['arabians', 'tonka'] },
  { q: 'Mancera 香水', want: ['cedrat', 'boise'] },
  { q: 'Jo Malone London 香水', want: ['english', 'pear', 'freesia'] },
  { q: 'Lancôme 香水', want: ['idole'] },
];

async function query(q, pageNo = 1, pageSize = 20) {
  const params = buildTaobaoParams({
    appKey: APP_KEY, secret: SECRET,
    method: 'taobao.tbk.dg.material.optional.upgrade',
    timestamp: gmt8Timestamp(),
    biz: { q, adzone_id: ADZONE, page_no: pageNo, page_size: pageSize, platform: 2 },
  });
  const res = await fetch(TAOBAO_GATEWAY, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const node = JSON.parse(await res.text());
  if (node.error_response) return { err: node.error_response.sub_msg || node.error_response.msg, list: [] };
  const data = unwrapTaobao(node, 'taobao.tbk.dg.material.optional.upgrade');
  return { list: data?.result_list?.map_data || [] };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (const c of CASES) {
    console.log(`\n=== q="${c.q}"  want=${c.want.join('/')} ===`);
    const titles = [];
    for (const page of [1, 2]) {
      const r = await query(c.q, page);
      if (r.err) { console.log(`  page${page} error: ${r.err}`); await sleep(250); continue; }
      console.log(`  page${page} 返回 ${r.list.length} 条`);
      for (const it of r.list) {
        const t = (it.item_basic_info || {}).title || '';
        titles.push(t);
        const toks = new Set(normalizeTokens(t));
        const tl = t.toLowerCase();
        const hitWant = c.want.filter((w) => toks.has(w) || tl.includes(w));
        const mark = hitWant.length ? `HIT(${hitWant.join(',')})` : '';
        console.log(`    ${mark.padEnd(22)} ${t.slice(0, 54)}`);
      }
      await sleep(250);
    }
    const any = titles.some((t) => { const tl = t.toLowerCase(); return c.want.some((w) => tl.includes(w)); });
    console.log(`  -> 40 条里${any ? '有' : '没有'}目标香名`);
  }
})();
