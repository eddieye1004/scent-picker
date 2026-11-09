/* 中文香名调研 第 4 步：候选池实测 + 精度判定 + 人工成本计时

   第 3b 步暴露的问题：40 瓶里 12 瓶「合格」，但其中「喷雾」「礼遇」「美国购」
   「香调自然」「中东」不是香名 —— 粗暴判据分不出香名和营销词。所以 30% 是上限，
   真实精度要另算。

   这一步换做法，也是最接近「人工建表」真实成本的做法：
     每瓶给一组中文名候选（来源分三档：A=从召回标题读出 / B=品牌官方中文名惯例 /
     C=靠推测），逐候选打接口，用「合格标题里是否含该瓶拉丁核心词」做指向校验。
     指向校验通过 = 这个名字在市场上确实指这一瓶 → 算「已核实的中文名」。
     指向校验不过 = 名字可能指同系列兄弟瓶 → 记为「未核实」。

   同时记录每瓶试了几个候选才通，作为人工建表的成本基线。
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp } from './lib/union-api.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;

const deaccent = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const CAT_OK = /香水|彩妆香水/;
const NON_PERFUME = ['身体乳', '沐浴', '洗发', '护发', '洗手液', '护手霜', '手霜', '润肤',
  '蜡烛', '香薰机', '扩香', '香皂', '汽车', '香珠', '洗衣', '发膜', '面膜', '乳液', '小样', '试用',
  '粉底', '口红', '唇膏', '唇釉', '眼霜', '面霜', '精华', '爽肤水', '护肤', '内衣', '内裤', '文胸',
  '奶茶', '酒店', '门票', '牙刷', '种子', '摆件', '帽子', '葡萄酒', '墨镜', '眼镜', '手表',
  '鞋', '裤', '衣', '包'];

/* 中文名候选。src 标注来源档：
   A = 已在本次召回标题里读到（第 3b 步的锚点标题）
   B = 品牌/香名的通行中文译法（品牌官方中文站或电商通用写法，本次未逐条开站核实）
   C = 靠推测 / 直译
*/
const CANDS = {
  'armaf-club-de-nuit-milestone': [['里程碑', 'A'], ['里程', 'A']],
  'armaf-christian-provenzano-i': [['克里斯蒂安', 'C']],
  'armaf-club-de-nuit-urban-man-elixir': [['夜店狂欢', 'A'], ['夜间俱乐部', 'A'], ['都市男士', 'C']],
  'armaf-excellus-man': [['卓越', 'C']],
  'armaf-la-rosa-gold-edition': [['金玫瑰', 'C'], ['玫瑰金', 'C']],
  'armaf-legasi-pour-femme': [['莱加西', 'C'], ['传承', 'C']],
  'armaf-momento-fleur-woman': [['花之瞬间', 'C'], ['莫门托', 'C']],
  'armaf-niche-purple-amethyst': [['紫水晶', 'C'], ['紫晶', 'C']],
  'armaf-odyssey-spectra-blue-edition': [['奥德赛', 'A'], ['光谱', 'C']],
  'armaf-oros-the-inventor-brown': [['发明家', 'C'], ['奥罗斯', 'C']],
  'armaf-q-essence-woman': [['本质', 'C'], ['精华', 'C']],
  'armaf-sehr-aleuyun-sawdaa': [['魅力之眼', 'A'], ['黑魔法', 'C']],
  'armaf-tag-him-man': [['标签', 'C'], ['标记', 'A']],
  'armaf-vanity-femme-essence-woman': [['虚荣', 'C'], ['浮华', 'C']],
  'armaf-voyage-brown-man': [['蓝色之旅', 'A'], ['远航', 'C'], ['旅程', 'C']],
  'acqua-di-parma-blu-mediterraneo-bergamotto-di-calabria': [['地中海香柠檬', 'A'], ['佛手柑', 'C'], ['卡拉布里亚', 'C']],
  'afnan-turathi-homme': [['图拉蒂', 'A'], ['图拉蒂蓝', 'A']],
  'yves-saint-laurent-la-nuit-de-lhomme': [['男士之夜', 'C'], ['夜之男', 'C'], ['蓝夜', 'C']],
  'giorgio-armani-emporio-armani-she': [['她', 'C'], ['寄情', 'A'], ['安普里奥', 'C']],
  'guerlain-mitsouko': [['蝴蝶夫人', 'B'], ['蝴蝶', 'C']],
  'prada-luna-rossa-black': [['红月', 'C'], ['露娜罗莎', 'C'], ['黑红月', 'C']],
  'trussardi-behind-the-curtain-piazza-alla-scala': [['幕后', 'C'], ['斯卡拉', 'C']],
  'gucci-rush': [['狂热', 'C'], ['拉什', 'C']],
  'dior-joy-by-dior': [['喜悦', 'C'], ['欢乐', 'C'], ['悦之欢', 'B']],
  'mancera-cedrat-boise': [['柠檬雪松', 'B'], ['雪松柠檬', 'C'], ['木质柠檬', 'C']],
  'amouage-lyric-woman': [['抒情', 'C'], [' lyric', 'C']],
  'juliette-has-a-gun-romantina': [['浪漫', 'C'], ['罗曼蒂娜', 'C']],
  'bvlgari-eau-parfumee-au-the-vert': [['绿茶', 'B'], ['白茶', 'C'], ['绿意', 'C']],
  'ajmal-dahn-al-oudh-moattaq': [['沉香', 'C'], ['达恩沉香', 'C']],
  'montale-arabians-tonka': [['阿拉伯沉香', 'B'], ['顿加', 'C']],
  'lancome-o-de-lancome': [['绿逸', 'A'], ['奥兰蔻', 'C']],
  'dolce-gabbana-k-by-dolce-gabbana': [['K男士', 'C'], ['K淡香水', 'C']],
  'nabeel-al-sharqia': [['东方', 'C'], ['沙尔基亚', 'C']],
  'tom-ford-black-orchid-reserve': [['黑兰花', 'B'], ['黑色兰花', 'C']],
  'maison-margiela-fragrances-replica-beach-walk': [['海滩漫步', 'B'], ['沙滩漫步', 'C'], ['海滩', 'C']],
  'creed-bois-du-portugal': [['葡萄牙之木', 'B'], ['葡萄牙木', 'C'], ['葡国之木', 'C']],
  'rabanne-million-gold-for-her': [['百万金砖', 'A'], ['百万金', 'A'], ['百万女士', 'C']],
  'valentino-donna-born-in-roma-coral-fantasy': [['落日小姐', 'A'], ['珊瑚幻想', 'C'], ['罗马女士', 'C']],
  'jo-malone-english-pear-and-freesia': [['英国梨', 'B'], ['英国梨与小苍兰', 'B'], ['小苍兰', 'C']],
  'nishane-wulong-cha': [['乌龙茶', 'B'], ['乌龙', 'C'], ['乌龍茶', 'C']],
};

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

function judge(title, cat, brandCn, nameCn) {
  const t = String(title);
  const c = String(cat || '');
  const bad = NON_PERFUME.some((w) => t.includes(w)) || NON_PERFUME.some((w) => c.includes(w));
  return { ok: t.includes(brandCn) && t.includes(nameCn) && CAT_OK.test(c) && !bad && c.trim().length > 0, bad };
}

const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/.cache/zh-name-sample.json'), 'utf8'));
const rows = [];
const t0 = Date.now();

for (const b of sample) {
  const nm = deaccent(b.name);
  /* 核心词：取最后一个非常有名词（Milestone / Cedrat Boise → Boise） */
  const GENERIC = new Set(['woman', 'women', 'man', 'men', 'for', 'her', 'him', 'pour', 'femme', 'homme',
    'unisex', 'edition', 'the', 'de', 'du', 'des', 'la', 'le', 'les', 'and', 'by', 'of', 'a', 'au',
    'gold', 'black', 'blue', 'brown', 'white', 'red', 'pink', 'green', 'purple', 'silver',
    'intense', 'elixir', 'extreme', 'sport', 'profumo', 'i', 'she']);
  const words = nm.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w && w.length > 2 && !GENERIC.has(w));
  const core = words.slice(-1)[0] || nm.replace(/\s+/g, '');

  const list = CANDS[b.id] || [];
  const tried = [];
  let confirmed = null;   /* 指向校验通过 */
  let totalPass = 0;

  for (const [cn, src] of list) {
    if (!/[\u4e00-\u9fa5]/.test(cn)) continue;
    const q = `${b.brandCn} ${cn}`;
    const r = await query(q);
    const passed = r.items
      .map((it) => ({ ...it, ...judge(it.title, it.cat, b.brandCn, cn) }))
      .filter((x) => x.ok);
    const anchored = passed.filter((x) => deaccent(x.title).toLowerCase().includes(core.toLowerCase()));
    tried.push({ cn, src, q, n: r.n, pass: passed.length, anchored: anchored.length,
      sampleTitle: passed[0]?.title.slice(0, 62) || '', sampleCat: passed[0]?.cat || '' });
    totalPass += passed.length;
    if (anchored.length && !confirmed) {
      confirmed = { cn, src, pass: passed.length, anchored: anchored.length,
        title: anchored[0].title.slice(0, 62), cat: anchored[0].cat, itemId: anchored[0].itemId };
      break;
    }
    await sleep(220);
  }

  rows.push({
    id: b.id, brand: b.brand, brandCn: b.brandCn, name: b.name, core,
    candsGiven: list.map(([c, s]) => `${c}(${s})`),
    tried, confirmed,
    status: confirmed ? 'CONFIRMED' : (tried.some((x) => x.pass > 0) ? 'UNVERIFIED' : 'ZERO'),
  });

  console.log(
    (confirmed ? 'CONFIRM' : (tried.some((x) => x.pass > 0) ? 'UNVERIF' : 'ZERO   ')).padEnd(8),
    b.brandCn.padEnd(6), b.name.slice(0, 28).padEnd(30),
    confirmed ? `✔ ${confirmed.cn}(${confirmed.src}) 合格=${confirmed.pass} 指向=${confirmed.anchored}`
      : (tried.length ? `试 ${tried.map((x) => `${x.cn}:${x.pass}/${x.anchored}`).join(' ')}` : '无候选')
  );
}

const elapsed = (Date.now() - t0) / 1000;
const conf = rows.filter((r) => r.status === 'CONFIRMED');
const unv = rows.filter((r) => r.status === 'UNVERIFIED');
const zero = rows.filter((r) => r.status === 'ZERO');

fs.writeFileSync(path.join(ROOT, 'data/.cache/zh-name-confirm.json'), JSON.stringify(rows, null, 2));

console.log(`\n=== 结果 ===`);
console.log(`已核实（指向校验通过）：${conf.length}/40 = ${(conf.length / 40 * 100).toFixed(0)}%`);
console.log(`搜到但指向不可信：    ${unv.length}/40 = ${(unv.length / 40 * 100).toFixed(0)}%`);
console.log(`零召回（名字不对）：    ${zero.length}/40 = ${(zero.length / 40 * 100).toFixed(0)}%`);
const bySrc = {};
for (const c of conf) bySrc[c.confirmed.src] = (bySrc[c.confirmed.src] || 0) + 1;
console.log(`按来源档：`, JSON.stringify(bySrc));
console.log(`总耗时 ${elapsed.toFixed(0)}s，平均每瓶 ${(elapsed / 40).toFixed(1)}s`);
