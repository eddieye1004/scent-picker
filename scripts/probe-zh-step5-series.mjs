/* 中文香名调研 第 5 步：区分「单瓶名」和「系列名」—— 这是这条路真正致命的缺陷

   第 4 步的「指向校验」要求合格标题里含该瓶拉丁核心词。这个指标有偏：
   第 2b 步已经实测出拉丁名几乎不出现在标题里，所以它把一批**正确**的中文名
   （蝴蝶夫人、英国梨）也判成了「不可信」。

   这一步换成真正该问的问题：这个中文名指的是**这一瓶**，还是**整个系列**？
   判法：拿该中文名召回的全部合格标题，看里面出现了多少种不同的拉丁香名/系列后缀。
     · 只有一种 → 单瓶名，安全
     · 多种 → 系列名，挂上去会把同系列的兄弟瓶错配给这一瓶（比漏掉更糟）

   这和库里已有的判据一致：AFFILIATE-API.md 记过 Club de Nuit / Odyssey 这类系列香
   拉丁名搜不到，原因就是它们只有系列级的中文名。
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp } from './lib/union-api.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;

const CAT_OK = /香水|彩妆香水/;
const NON_PERFUME = ['身体乳', '沐浴', '洗发', '护发', '洗手液', '护手霜', '手霜', '润肤',
  '蜡烛', '香薰机', '扩香', '香皂', '汽车', '香珠', '洗衣', '发膜', '面膜', '乳液', '小样', '试用',
  '粉底', '口红', '唇膏', '唇釉', '眼霜', '面霜', '精华', '爽肤水', '护肤', '内衣', '内裤', '文胸',
  '奶茶', '酒店', '门票', '牙刷', '种子', '摆件', '帽子', '葡萄酒', '墨镜', '眼镜', '手表',
  '鞋', '裤', '衣', '包', '礼盒装'];

async function query(q, pageSize = 100) {
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
  if (node.error_response) return { n: 0, err: node.error_response.sub_msg || node.error_response.msg, items: [] };
  const data = unwrapTaobao(node, 'taobao.tbk.dg.material.optional.upgrade');
  const list = data?.result_list?.map_data || [];
  return {
    n: list.length,
    items: list.map((it) => {
      const b = it.item_basic_info || {};
      return { title: b.title || '', cat: b.category_name || '', itemId: it.item_id };
    }),
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const deaccent = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/* 第 4 步确认过的 13 瓶 + 6 瓶 UNVERIF，全部拿来做系列名判定 */
const confirm = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/.cache/zh-name-confirm.json'), 'utf8'));
const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/.cache/zh-name-sample.json'), 'utf8'));

/* 系列名判定：把合格标题里的拉丁串抠出来，看有几种不同的"香名形态" */
function latinTail(title, brandCn) {
  const i = title.indexOf(brandCn);
  const seg = i >= 0 ? title.slice(i + brandCn.length) : title;
  const words = (deaccent(seg).match(/[A-Za-z][A-Za-z'&.\-]{2,}/g) || [])
    .map((w) => w.toLowerCase())
    .filter((w) => !['edp', 'edt', 'parfum', 'ml', 'oz', 'eau', 'de', 'toilette', 'spray'].includes(w));
  return words;
}

const rows = [];

for (const r of confirm) {
  /* 取第 4 步试过且有合格标题的那个中文名（第一个 pass>0 的） */
  const tried = (r.tried || []).filter((t) => t.pass > 0);
  if (!tried.length) continue;
  const pick = r.confirmed || tried[0];
  const cn = pick.cn;

  /* 重新查一次，拿全量合格标题（第 4 步只存了样例） */
  const q = `${r.brandCn} ${cn}`;
  const res = await query(q);
  const passed = res.items.filter((it) => {
    const t = it.title;
    const c = it.cat || '';
    const bad = NON_PERFUME.some((w) => t.includes(w)) || NON_PERFUME.some((w) => c.includes(w));
    return t.includes(r.brandCn) && t.includes(cn) && CAT_OK.test(c) && !bad && c.trim().length > 0;
  });

  /* 统计这批标题里出现的拉丁香名变体 */
  const variants = new Map();
  for (const p of passed) {
    for (const w of latinTail(p.title, r.brandCn)) variants.set(w, (variants.get(w) || 0) + 1);
  }
  const variantList = [...variants.entries()].sort((a, b) => b[1] - a[1]);

  /* 该瓶自己的拉丁词是否在其中 */
  const ownWords = deaccent(r.name).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w && w.length > 2);
  const ownHit = ownWords.filter((w) => variants.has(w));
  const foreignWords = variantList.filter(([w]) => !ownWords.includes(w));

  /* 三分类 */
  let verdict;
  if (!passed.length) verdict = 'NO-MATCH';
  else if (ownHit.length && foreignWords.length === 0) verdict = 'BOTTLE';     /* 只指向这一瓶 */
  else if (ownHit.length && foreignWords.length) verdict = 'MIXED';            /* 混了兄弟瓶 */
  else if (!ownHit.length && variantList.length === 0) verdict = 'CN-ONLY';    /* 标题纯中文，无法判系 */
  else verdict = 'SERIES';                                                     /* 只有别人的拉丁名 */

  rows.push({
    id: r.id, brand: r.brand, brandCn: r.brandCn, name: r.name, cn, src: pick.src,
    n: res.n, passed: passed.length,
    variants: variantList.slice(0, 8).map(([w, c]) => `${w}(${c})`),
    ownHit, foreignCount: foreignWords.length,
    verdict,
    passedTitles: passed.slice(0, 4).map((x) => x.title.slice(0, 72)),
  });

  console.log(
    verdict.padEnd(9), r.brandCn.padEnd(6), (r.name.slice(0, 22) + ' → ' + cn).padEnd(38),
    `合格=${String(passed.length).padStart(3)}`,
    `拉丁变体=${variantList.length}`,
    variantList.length ? '[' + variantList.slice(0, 4).map(([w]) => w).join(',') + ']' : '[纯中文]'
  );
  await sleep(230);
}

fs.writeFileSync(path.join(ROOT, 'data/.cache/zh-name-series.json'), JSON.stringify(rows, null, 2));

const tally = {};
for (const r of rows) tally[r.verdict] = (tally[r.verdict] || 0) + 1;
console.log('\n=== 单瓶名 / 系列名 判定 ===');
console.log(JSON.stringify(tally));
const bottle = rows.filter((r) => r.verdict === 'BOTTLE' || r.verdict === 'CN-ONLY');
console.log(`可安全使用（BOTTLE + CN-ONLY）：${bottle.length}/${sample.length} = ${(bottle.length / sample.length * 100).toFixed(1)}%`);
console.log(`有错配风险（SERIES + MIXED）：${rows.filter((r) => ['SERIES', 'MIXED'].includes(r.verdict)).length}`);
