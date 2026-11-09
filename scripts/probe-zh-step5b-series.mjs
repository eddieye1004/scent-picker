/* 中文香名调研 第 5b 步：修正系列名判定 —— 排除格式词、系列集合名、品牌词

   第 5 步的判定有假阳性，已实测确认两例：
     · 娇兰 Mitsouko → 蝴蝶夫人：10 条标题全是蝴蝶夫人，只因其中 1 条带了
       Guerlain 的**经典系列集合名** Les Légendaires，就被判成 SERIES。
       蝴蝶夫人确实是 Mitsouko 的中文名（娇兰官方叫法），不该判死。
     · 祖玛珑 English Pear → 英国梨：变体只有 edc / ml 两个**格式词**，也是假阳性。

   所以判定前必须把三类词剔掉：
     ① 格式词：edc / edp / edt / ml / oz / spray / vaporisateur
     ② 系列集合名：Les Légendaires 这类"一整个产品线"的名字
     ③ 品牌词：品牌自己的拉丁名，以及标题里必然出现的品牌中文名
   剔完之后，剩下的才是"别的香水的名"。有别的香水名 → 才是真系列名。
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

/* ① 格式词 */
const FORMAT = new Set(['edc', 'edp', 'edt', 'ml', 'oz', 'spray', 'vaporisateur', 'eau', 'toilette',
  'parfum', 'perfume', 'natural', 'splash', 'refill', 'tester', 'unboxed', 'mini']);

/* ② 系列集合名：一个产品线共用的名字，不是单瓶名 */
const COLLECTION = new Set(['leslegendaires', 'legendaires', 'lartetlamatiere', 'artetlamatiere',
  'lartdelaparfumerie', 'lesexclusifs', 'exclusifs', 'lacollection', 'collection',
  'lesparfums', 'labollection', 'signature', 'heritage', 'classic', 'classics']);

/* ③ 性别词 / 通用性别后缀：men / women / homme / femme 不是"别的香水名"，
      它们只区分男女版，指的还是同一个香型。第 5b 步把它们当兄弟瓶词，
      于是 Excellus Man 被误判成 MOSTLY（其实只有 men/women 两个词）。 */
const GENDER = new Set(['men', 'women', 'man', 'woman', 'homme', 'femme', 'him', 'her', 'uom', 'uomo',
  'donna', 'pour', 'unisex', 'male', 'female', 'monsieur', 'madame']);

/* ④ 品牌自己的拉丁名（避免把品牌词当兄弟瓶名） */
const BRAND_WORDS = new Set(['armaf', 'dior', 'lancome', 'prada', 'guerlain', 'gucci', 'creed',
  'valentino', 'rabanne', 'paco', 'acqua', 'parma', 'montale', 'mancera', 'nishane', 'afnan',
  'ajmal', 'bvlgari', 'bulgari', 'trussardi', 'dolce', 'gabbana', 'tom', 'ford', 'maison',
  'margiela', 'amouage', 'juliette', 'gun', 'jo', 'malone', 'london', 'nabeel', 'yosoyl',
  'giorgio', 'armani', 'emporio', 'saint', 'laurent', 'yves']);

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

function latinWords(title, brandCn) {
  const i = title.indexOf(brandCn);
  const seg = i >= 0 ? title.slice(i + brandCn.length) : title;
  return (deaccent(seg).match(/[A-Za-z][A-Za-z'&.\-]{1,}/g) || [])
    .map((w) => w.toLowerCase().replace(/[^a-z]/g, ''))
    .filter((w) => w.length > 1);
}

const confirm = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/.cache/zh-name-confirm.json'), 'utf8'));
const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/.cache/zh-name-sample.json'), 'utf8'));
const rows = [];

for (const r of confirm) {
  const tried = (r.tried || []).filter((t) => t.pass > 0);
  if (!tried.length) continue;
  const pick = r.confirmed || tried[0];
  const cn = pick.cn;

  const res = await query(`${r.brandCn} ${cn}`);
  const passed = res.items.filter((it) => {
    const t = it.title;
    const c = it.cat || '';
    const bad = NON_PERFUME.some((w) => t.includes(w)) || NON_PERFUME.some((w) => c.includes(w));
    return t.includes(r.brandCn) && t.includes(cn) && CAT_OK.test(c) && !bad && c.trim().length > 0;
  });

  /* 只保留"可能是别的香水名"的词 */
  const foreign = new Map();
  for (const p of passed) {
    for (const w of latinWords(p.title, r.brandCn)) {
      if (FORMAT.has(w) || COLLECTION.has(w) || BRAND_WORDS.has(w) || GENDER.has(w)) continue;
      if (w.length < 3) continue;
      foreign.set(w, (foreign.get(w) || 0) + 1);
    }
  }
  const ownWords = deaccent(r.name).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w && w.length > 2);
  const ownHit = ownWords.filter((w) => [...foreign.keys()].some((f) => f.includes(w) || w.includes(f)));
  const foreignList = [...foreign.entries()].filter(([w]) => !ownWords.some((o) => w.includes(o)))
    .sort((a, b) => b[1] - a[1]);

  /* 判定：剔完噪音后还有别的香水名 → 系列名；没有 → 单瓶名（安全） */
  let verdict;
  if (!passed.length) verdict = 'NO-MATCH';
  else if (foreignList.length === 0) verdict = 'BOTTLE-SAFE';       /* 只指向这一瓶 */
  else if (foreignList.length <= 2 && foreignList.every(([, c]) => c <= 2)) verdict = 'MOSTLY';  /* 零星兄弟瓶 */
  else verdict = 'SERIES-RISK';

  rows.push({
    id: r.id, brand: r.brand, brandCn: r.brandCn, name: r.name, cn, src: pick.src,
    n: res.n, passed: passed.length,
    foreign: foreignList.slice(0, 6).map(([w, c]) => `${w}(${c})`),
    ownHit, verdict,
    titles: passed.slice(0, 3).map((x) => x.title.slice(0, 74)),
  });

  console.log(
    verdict.padEnd(12), r.brandCn.padEnd(6), (r.name.slice(0, 20) + ' → ' + cn).padEnd(34),
    `合格=${String(passed.length).padStart(3)}`,
    foreignList.length ? '兄弟瓶词:[' + foreignList.slice(0, 4).map(([w]) => w).join(',') + ']' : '无兄弟瓶词'
  );
  await sleep(230);
}

fs.writeFileSync(path.join(ROOT, 'data/.cache/zh-name-series2.json'), JSON.stringify(rows, null, 2));

const tally = {};
for (const r of rows) tally[r.verdict] = (tally[r.verdict] || 0) + 1;
console.log('\n=== 修正后判定 ===');
console.log(JSON.stringify(tally));
const safe = rows.filter((r) => ['BOTTLE-SAFE', 'MOSTLY'].includes(r.verdict));
console.log(`可安全使用：${safe.length}/${sample.length} = ${(safe.length / sample.length * 100).toFixed(1)}%`);
console.log(`有系列错配风险：${rows.filter((r) => r.verdict === 'SERIES-RISK').length}`);
