/* 验证一：品牌名里的重音/特殊字符是否损害召回

   Lancôme 泛搜只返回 6 条（page2 直接「无结果」），而 Amouage 返回 40 条。
   差异可能是重音符号 ê 让分词一个词都对不上。
   同时验证 & 与空格（Viktor&Rolf）、省略号等。

   判据：同一品牌，带特殊字符 vs 归一化后，返回条数与标题里品牌词命中数。
*/
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp } from './lib/union-api.mjs';

const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;

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

/* 归一化：去重音符号 + 去掉 & . ' 这些在分词里会被当分隔符的字符 */
function stripAccents(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function normalizeBrand(s) {
  return stripAccents(s).replace(/[&.''']/g, ' ').replace(/\s+/g, ' ').trim();
}

const CASES = [
  { raw: 'Lancôme', norm: 'Lancome', probe: ['lancome', 'lancôme'], alt: '兰蔻' },
  { raw: 'Frédéric Malle', norm: 'Frederic Malle', probe: ['frederic', 'frédéric'], alt: '馥马尔' },
  { raw: 'Viktor&Rolf', norm: 'Viktor Rolf', probe: ['viktor', 'rolf'], alt: '维克多' },
  { raw: 'Yves Saint Laurent', norm: 'Yves Saint Laurent', probe: ['ysl', 'saint laurent'], alt: '圣罗兰' },
  { raw: 'Byredo', norm: 'Byredo', probe: ['byredo'], alt: '柏芮朵' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('品牌'.padEnd(20), '写法'.padEnd(26), '条数', '标题含品牌词');
  for (const c of CASES) {
    const variants = [
      { label: `原文 "${c.raw} 香水"`, q: `${c.raw} 香水` },
      { label: `归一 "${c.norm} 香水"`, q: `${c.norm} 香水` },
      { label: `中文 "${c.alt} 香水"`, q: `${c.alt} 香水` },
    ];
    for (const v of variants) {
      const r = await query(v.q);
      const hit = r.titles.filter((t) => {
        const tl = stripAccents(t).toLowerCase();
        return c.probe.some((p) => tl.includes(p)) || tl.includes(c.alt);
      }).length;
      console.log(
        c.raw.padEnd(20),
        v.label.padEnd(26),
        String(r.n).padStart(4),
        `${hit}/${r.n}${r.err ? '  err=' + r.err : ''}`
      );
      await sleep(260);
    }
    console.log('');
  }
})();
