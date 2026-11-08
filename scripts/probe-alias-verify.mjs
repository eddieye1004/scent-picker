/* 逐条验证候选别名：这个中文名确实指向这个品牌吗？

   为什么必须先验证再写进 `brand-aliases.json`：
   别名表是"品牌判据"的输入。写错一条的后果不是少几个链接，而是**把别的牌子
   的商品当成本款** —— 用户点进去买错东西，比不给链接差得多。

   验证方式（纯实测，不靠记忆）：
     查 `<别名> 香水`，取回 20 条标题，然后看
       ① 标题里出现该别名的比例（别名本身是不是真词）
       ② 标题里出现该品牌拉丁名的比例（别名是不是指向这个品牌）
   ② ≥ 30% 才算通过 —— 结果里可能混进同类竞品，所以不要求 100%。

   用法：node scripts/probe-alias-verify.mjs
*/
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp } from './lib/union-api.mjs';
import { BRAND_ALIAS_ADD } from './lib/brand-alias-add.mjs';

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

const stripAccents = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 拉丁品牌名在标题里可能被简写：取第一个实词做弱判据 */
const STOP = new Set(['de', 'di', 'has', 'a', 'the', 'parfums', 'paris', 'fragrances', 'london', 'maison', 'pour']);
function latinKey(brand) {
  return stripAccents(brand).toLowerCase()
    .split(/[^a-z]+/).filter((w) => w && w.length >= 3 && !STOP.has(w));
}

(async () => {
  const rows = [];
  for (const [brand, aliases] of Object.entries(BRAND_ALIAS_ADD)) {
    const lat = latinKey(brand);
    for (const alias of aliases) {
      const isHan = /[\u4e00-\u9fa5]/.test(alias);
      const r = await query(`${alias} 香水`);
      const n = r.n;
      const hitAlias = r.titles.filter((t) => t.includes(alias) || stripAccents(t).toLowerCase().includes(stripAccents(alias).toLowerCase())).length;
      const hitLatin = r.titles.filter((t) => {
        const tl = stripAccents(t).toLowerCase();
        return lat.some((w) => tl.includes(w));
      }).length;
      const aliasRate = n ? hitAlias / n : 0;
      const latinRate = n ? hitLatin / n : 0;
      const pass = n > 0 && aliasRate >= 0.5 && (isHan ? latinRate >= 0.3 : true);
      rows.push({ brand, alias, isHan, n, aliasRate, latinRate, pass, err: r.err || '' });
      const flag = pass ? 'PASS' : 'FAIL';
      console.log(
        flag,
        brand.padEnd(28),
        alias.padEnd(14),
        `n=${String(n).padStart(2)}`,
        `别名命中 ${(aliasRate * 100).toFixed(0).padStart(3)}%`,
        `拉丁名 ${(latinRate * 100).toFixed(0).padStart(3)}%`,
        r.err ? 'err=' + r.err : ''
      );
      await sleep(240);
    }
  }
  const ok = rows.filter((r) => r.pass);
  console.log(`\n通过 ${ok.length}/${rows.length}`);
  console.log('\n=== 通过的别名（可写入 brand-aliases.json）===');
  const byBrand = {};
  for (const r of ok) { (byBrand[r.brand] = byBrand[r.brand] || []).push(r.alias); }
  console.log(JSON.stringify(byBrand, null, 2));
  console.log('\n=== 未通过的（不要写入）===');
  for (const r of rows.filter((x) => !x.pass)) {
    console.log(`${r.brand.padEnd(28)} ${r.alias.padEnd(14)} n=${r.n} 别名${(r.aliasRate * 100).toFixed(0)}% 拉丁${(r.latinRate * 100).toFixed(0)}%`);
  }
})();
