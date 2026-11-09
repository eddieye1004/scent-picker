/* 第 1 步：抓 Armaf 品牌池，从标题里把「中文香名」抽出来
 *
 * 为什么从标题抽而不是我直接写：zh-name-scout 的结论是「拉丁名根本不在标题里，
 * 只能靠人」。但中东品牌（Armaf/Afnan/Lattafa）有一个例外——卖家习惯中英双写，
 * 且常常是「拉丁全名 + 中文品牌 + 中文香名」的固定顺序，例如：
 *   美国直邮M ARMAF CLUB NUIT MILESTONE 6.7OZ EDP阿玛芙里程正品
 *                                              ^^^^ = Milestone 的「里程」
 * 所以中文香名是真的能从标题里读出来的，不是我编的。
 *
 * 本脚本只做「发现 + 归因」，不做判定：输出「每个缺链瓶 → 它的拉丁名在哪些
 * 标题里出现过 → 那些标题里的中文残余片段」，人工（我）逐条复核。
 *
 * 用法：node scripts/zh-pool-arma.mjs [Brand] [ChineseAlias]
 */
import fs from 'node:fs';
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp } from './lib/union-api.mjs';

const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;
if (!APP_KEY || !SECRET || !ADZONE) {
  console.error('缺 TB_APP_KEY / TB_APP_SECRET / TB_ADZONE_ID');
  process.exit(1);
}

const BRAND = process.argv[2] || 'Armaf';
const ALIAS = process.argv[3] || '阿玛芙';
const OUT = `data/.cache/zh-pool-${BRAND.toLowerCase().replace(/[^a-z]/g, '')}.json`;

const perfumes = JSON.parse(fs.readFileSync('data/perfumes.json', 'utf8')).perfumes;
const links = JSON.parse(fs.readFileSync('data/affiliate-links.json', 'utf8')).taobao || {};
const missing = perfumes.filter((p) => p.brand === BRAND && !links[p.id]);
console.log(`${BRAND}：待救 ${missing.length} 瓶`);

/* ---------- 抓池 ---------- */
async function page(keyword, pageNo, pageSize = 100) {
  const params = buildTaobaoParams({
    appKey: APP_KEY, secret: SECRET,
    method: 'taobao.tbk.dg.material.optional.upgrade',
    timestamp: gmt8Timestamp(),
    biz: { q: keyword, adzone_id: ADZONE, page_no: pageNo, page_size: pageSize, platform: 2 },
  });
  const res = await fetch(TAOBAO_GATEWAY, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const node = JSON.parse(await res.text());
  if (node.error_response) {
    return { n: 0, cands: [], err: node.error_response.sub_msg || node.error_response.msg };
  }
  const data = unwrapTaobao(node, 'taobao.tbk.dg.material.optional.upgrade');
  const list = data?.result_list?.map_data || [];
  return {
    n: list.length,
    cands: list.map((it) => {
      const b = it.item_basic_info || {};
      const pb = it.publish_info || {};
      return {
        title: b.title || '', categoryText: b.category_name || '',
        clickUrl: pb.click_url || '', itemId: it.item_id,
        pictUrl: b.pict_url || '', whiteImage: b.white_image || '',
        smallImages: b.small_images?.string || [],
      };
    }),
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pool = [];
const log = [];
/* 默认 3 页太少：Armaf 全库 121 瓶缺链，3 页只捞到 766 条去重商品，
   多数款根本不在池里。页数可用 PAPER_PAGES 环境变量调。 */
const PAGES = Number(process.env.PAPER_PAGES || 8);
for (const kw of [`${ALIAS} 香水`, `${ALIAS}`, `${BRAND} 香水`]) {
  for (let pg = 1; pg <= PAGES; pg++) {
    const r = await page(kw, pg);
    log.push({ kw, pg, n: r.n, err: r.err || '' });
    process.stdout.write(`  ${kw} p${pg} → ${r.n}${r.err ? ' ' + r.err : ''}\n`);
    if (!r.n) break;
    pool.push(...r.cands);
    await sleep(700);
  }
}

const seen = new Set();
const uniq = pool.filter((c) => c.itemId && !seen.has(c.itemId) && seen.add(c.itemId));
console.log(`池 ${pool.length} 条，去重 ${uniq.length} 条`);

/* ---------- 从标题里抽中文残余片段 ---------- */
/* 这些词在任何香水上都会出现，不是「这一瓶的名字」 */
const GENERIC = [
  '香水', '香氛', '浓香', '淡香', '香精', '古龙', '正品', '持久', '留香', '小众', '高级',
  '男女士', '男士', '女士', '中性', '男香', '女香', '男款', '女款', '专用', '同款', '平替',
  '木质', '花香', '果香', '东方', '清新', '美食调', '迪拜', '阿拉伯', '美国', '香港', '直邮',
  '香港直邮', '美国直邮', '欧洲直邮', '保税', '现货', '礼盒', '套装', '试管', '小样', '分装',
  '喷雾', '身体', '洗发', '沐浴', '补充装', '正装', '大瓶', '限量', '新版', '老版', '经典',
  '爆款', '热卖', '包邮', '秒发', '官方', '旗舰店', '专柜', '联名', '旅行装', '便携',
];
const GEN_RE = new RegExp(GENERIC.join('|'), 'g');

function cnSegments(title) {
  // 先去掉中文品牌名（含常见误写），剩下的中文按标点/字母切开
  let t = title.replace(new RegExp(ALIAS, 'g'), '|');
  t = t.replace(/[\u4e00-\u9fa5]*?(?:阿玛芙|奥洛斯)[\u4e00-\u9fa5]*?/g, '|');
  const parts = t.split(/[|/\s,，、+＋·・\-—()（）\[\]【】]+/);
  const out = [];
  for (const raw of parts) {
    const cn = (raw.match(/[\u4e00-\u9fa5]+/g) || []).join('');
    if (!cn || cn.length < 2) continue;
    const stripped = cn.replace(GEN_RE, '');
    if (stripped.length >= 2) out.push(stripped);
  }
  return out;
}

/* ---------- 拉丁词命中 ---------- */
const STOP = new Set(['de', 'du', 'la', 'le', 'les', 'the', 'for', 'and', 'of', 'pour', 'by', 'a', 'man', 'men', 'woman', 'women', 'edp', 'edt', 'ml', 'spray', 'eau', 'de', 'toilette', 'parfum', 'extrait', 'cologne', 'intense', 'edition', 'collection']);
function latinTokens(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

const rows = [];
for (const p of missing) {
  const toks = latinTokens(p.name);
  if (!toks.length) { rows.push({ id: p.id, name: p.name, cn: [], titles: [] }); continue; }
  const hits = [];
  for (const c of uniq) {
    const low = c.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
    const hit = toks.filter((t) => low.includes(t)).length;
    // 要求命中过半的拉丁词，且至少 2 个（单词名单独处理）
    const need = toks.length === 1 ? 1 : Math.max(2, Math.ceil(toks.length * 0.6));
    if (hit >= need) hits.push({ c, hit, segs: cnSegments(c.title) });
  }
  const segCount = {};
  for (const h of hits) for (const s of new Set(h.segs)) segCount[s] = (segCount[s] || 0) + 1;
  const cn = Object.entries(segCount).sort((a, b) => b[1] - a[1]);
  rows.push({
    id: p.id, name: p.name, toks,
    cn,
    titles: hits.slice(0, 4).map((h) => ({ t: h.c.title.slice(0, 78), hit: h.hit, segs: h.segs, itemId: h.c.itemId, cat: h.c.categoryText.slice(0, 40) })),
    nhit: hits.length,
  });
}

fs.writeFileSync(OUT, JSON.stringify({
  brand: BRAND, alias: ALIAS, log, poolSize: uniq.length, rows,
  /* 池原文一起存：同一个池要反复用不同判据重放，存下来就不用重复打接口 */
  pool: uniq.map((c) => ({
    itemId: c.itemId, title: c.title, cat: c.categoryText,
    clickUrl: c.clickUrl, pictUrl: c.pictUrl, whiteImage: c.whiteImage,
    smallImages: c.smallImages,
  })),
}, null, 1));
const withCn = rows.filter((r) => r.cn.length);
console.log(`\n${rows.length} 瓶中 ${withCn.length} 瓶能从标题里读到中文片段；写出 ${OUT}\n`);
for (const r of withCn.slice(0, 40)) {
  console.log(`${r.name}`);
  console.log(`   cn=${r.cn.slice(0, 3).map(([s, n]) => `${s}(${n})`).join(' ') }  hits=${r.nhit}`);
}
