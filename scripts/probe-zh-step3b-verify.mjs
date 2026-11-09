/* 中文香名调研 第 3b 步：给候选抽取加卖家词黑名单，重跑 40 瓶

   第 3 步把「美国直邮」「自营」「欧洲直邮」当成中文香名了 —— 这些是卖家前缀词，
   出现在每条标题里，所以频次最高，正好把真香名压掉。
   真香名其实是存在的：Armaf Milestone → 里程碑（8 条召回）、Odyssey → 奥德赛（80 条）。
   所以这一步只做一件事：把卖家/营销词拉黑，再看通过率。

   新增第 6 项诊断（不计入五条判据，用于量化错配风险）：
     合格标题里是否同时出现该瓶的拉丁核心词 —— 出现说明这条链接确实指向这一瓶，
     而不是同系列的兄弟瓶。
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

const GENERIC = new Set(['woman', 'women', 'man', 'men', 'for', 'her', 'him', 'pour', 'femme', 'homme',
  'unisex', 'edition', 'the', 'de', 'du', 'des', 'la', 'le', 'les', 'and', 'by', 'of', 'a', 'au',
  'gold', 'black', 'blue', 'brown', 'white', 'red', 'pink', 'green', 'purple', 'silver',
  'intense', 'elixir', 'extreme', 'sport', 'profumo', 'collector', 'limited', 'reserve', 'i', 'she']);

/* 卖家 / 营销 / 品类词黑名单：这些不是香名 */
const JUNK = ['美国直邮', '欧洲直邮', '香港直邮', '日本直邮', '西班牙直邮', '澳洲直邮', '保税', '自营',
  '直邮', '正品', '包邮', '现货', '预售', '代购', '跨境', '进口', '官方', '旗舰', '专柜', '中古',
  '奢侈品', '二手', '全新', '绝版', '现货速发', '双11', '年货', '礼物', '送礼', '生日', '礼盒',
  '香水', '香氛', '淡香精', '浓香精', '淡香水', '古龙水', '香精', '中性', '女士', '男士', '女香',
  '男香', '中性香', '持久', '留香', '小样', '试用', '分装', '试管', '体验装', '大牌', '小众',
  '香水小样', '专柜正品', '外贸', '尾单', '清仓', '特价', '秒杀', '包税', '一件', '发顺丰',
  '限时', '新品', '爆款', '热卖', '断货', '难买', '稀少', '典藏', '限定', '珍藏', '简装', '散装',
  '有盒', '无盒', '带盒', '拆封', '未拆', '全套', '单品', '套装', '礼袋'];

const CAT_OK = /香水|彩妆香水/;
const NON_PERFUME = ['身体乳', '沐浴', '洗发', '护发', '洗手液', '护手霜', '手霜', '润肤',
  '蜡烛', '香薰机', '扩香', '香皂', '汽车', '香珠', '洗衣', '发膜', '面膜', '乳液', '小样', '试用',
  '粉底', '口红', '唇膏', '唇釉', '眼霜', '面霜', '精华', '爽肤水', '护肤', '内衣', '内裤', '文胸',
  '奶茶', '酒店', '门票', '牙刷', '种子', '摆件', '帽子', '葡萄酒', '墨镜', '眼镜', '手表'];

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
  const hasBrand = t.includes(brandCn);
  const hasName = t.includes(nameCn);
  const catOk = CAT_OK.test(c);
  const bad = NON_PERFUME.some((w) => t.includes(w)) || NON_PERFUME.some((w) => c.includes(w));
  return { ok: hasBrand && hasName && catOk && !bad && c.trim().length > 0,
    hasBrand, hasName, catOk, bad };
}

const isJunk = (s) => JUNK.some((j) => s === j || s.includes(j));

function extractCands(titles, brandCn) {
  const cnt = new Map();
  for (const t of titles) {
    const parts = [];
    const i = t.indexOf(brandCn);
    if (i >= 0) parts.push(t.slice(i + brandCn.length), t.slice(0, i));
    else parts.push(t);
    for (const p of parts) {
      for (const seg of p.split(/[^一-龥]+/)) {
        const s = seg.trim();
        if (s.length < 2 || s.length > 6) continue;
        if (isJunk(s)) continue;
        cnt.set(s, (cnt.get(s) || 0) + 1);
      }
    }
  }
  return [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(([cn]) => cn);
}

/* 候选指向校验：该候选是否在同品牌的**其他**瓶里也高频出现（系列名而非香名） */
const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/.cache/zh-name-sample.json'), 'utf8'));
const results = [];

for (const b of sample) {
  const nm = deaccent(b.name);
  const words = nm.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w && w.length > 2 && !GENERIC.has(w));
  const core = words.slice(-1)[0] || nm.replace(/\s+/g, '');

  const anchors = [];
  const shapes = [
    ['中文品牌+核心词', `${b.brandCn} ${core}`],
    ['中文品牌+拉丁名', `${b.brandCn} ${nm}`],
  ];
  for (const [label, q] of shapes) {
    const r = await query(q);
    const anchored = r.items.filter((it) => {
      const t = deaccent(it.title).toLowerCase();
      return it.title.includes(b.brandCn) && (t.includes(core.toLowerCase()) || t.includes(nm.toLowerCase()));
    });
    for (const a of anchored) anchors.push(a.title);
    await sleep(240);
    if (anchors.length >= 5) break;
  }

  const cands = extractCands([...new Set(anchors)], b.brandCn).slice(0, 4);

  let sBest = null;
  const sTried = [];
  for (const cn of cands) {
    const q = `${b.brandCn} ${cn}`;
    const r = await query(q);
    const passed = r.items
      .map((it) => ({ ...it, ...judge(it.title, it.cat, b.brandCn, cn) }))
      .filter((x) => x.ok);
    /* 指向校验：合格标题里有没有该瓶拉丁核心词 */
    const anchoredPass = passed.filter((x) => deaccent(x.title).toLowerCase().includes(core.toLowerCase())).length;
    sTried.push({ cn, q, n: r.n, pass: passed.length, anchoredPass });
    if (passed.length && !sBest) {
      sBest = { cn, n: r.n, pass: passed.length, anchoredPass,
        title: passed[0].title.slice(0, 60), cat: passed[0].cat };
    }
    await sleep(240);
    if (sBest) break;
  }

  results.push({
    id: b.id, brand: b.brand, brandCn: b.brandCn, name: b.name, core,
    anchorCount: anchors.length,
    anchorSamples: [...new Set(anchors)].slice(0, 3).map((t) => t.slice(0, 76)),
    cands, sTried, sBest,
  });

  console.log(
    (sBest ? 'S-PASS' : (cands.length ? 'S-FAIL' : 'S-NOSRC')).padEnd(7),
    b.brandCn.padEnd(6), b.name.slice(0, 30).padEnd(32),
    `锚=${String(anchors.length).padStart(2)} 候选=${cands.length}`,
    sBest ? `✔ ${sBest.cn} 合格=${sBest.pass} 指向=${sBest.anchoredPass}` : (cands.length ? `✘ ${sTried.map((x) => x.cn).join('/')}` : '')
  );
}

fs.writeFileSync(path.join(ROOT, 'data/.cache/zh-name-verify2.json'), JSON.stringify(results, null, 2));

const pass = results.filter((r) => r.sBest);
const passAnchored = results.filter((r) => r.sBest && r.sBest.anchoredPass > 0);
console.log(`\n=== 路线 S 通过：${pass.length}/40 = ${(pass.length / 40 * 100).toFixed(0)}% ===`);
console.log(`    其中合格标题同时含拉丁核心词（指向可信）：${passAnchored.length}/40 = ${(passAnchored.length / 40 * 100).toFixed(0)}%`);
console.log(`    有锚点无候选：${results.filter((r) => r.anchorCount > 0 && !r.cands.length).length}`);
console.log(`    零锚点（品牌池里根本没有这瓶）：${results.filter((r) => r.anchorCount === 0).length}`);
