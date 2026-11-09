/* 中文香名候选 → 反向验证 → 生成可入库的别名条目
 *
 * 三道关（缺一不可，按顺序越来越严）：
 *   G1 区分词唯一性：这一瓶必须有一个拉丁词，在同品牌其他瓶的名字里都不出现。
 *      没有这个前提，「验证通过」是假的 —— 实测 Club de Nuit Woman 的 tokens
 *      只剩 [club, nuit]，两个词都是系列词，拿它们去反搜必然命中一堆别的款。
 *   G2 反向查询：用从标题里读到的中文名单独搜，看能不能把区分词搜回来。
 *      （不能拼品牌 —— 拼品牌一定返回 0 条，这条已踩过两次）
 *   G3 中文名不含通用词：香水/男士/正品/平替 … 命中即作废。
 *
 * 用法：node scripts/zh-collect-aliases.mjs data/.cache/zh-pool-armaf.json
 */
import fs from 'node:fs';
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp } from './lib/union-api.mjs';

const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;

const FILE = process.argv[2];
if (!FILE) { console.error('用法: node scripts/zh-collect-aliases.mjs <pool.json>'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const slug = String(data.brand).toLowerCase().replace(/[^a-z]/g, '');
const EVAL = `data/.cache/zh-judge-eval-${slug}.json`;
if (!fs.existsSync(EVAL)) { console.error(`缺 ${EVAL}，先跑 zh-judge-eval.mjs`); process.exit(1); }
const evalData = JSON.parse(fs.readFileSync(EVAL, 'utf8'));

const FILLER = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'the', 'for', 'and', 'of', 'pour',
  'by', 'a', 'an', 'edp', 'edt', 'edc', 'ml', 'oz', 'spray', 'eau', 'toilette', 'parfum',
  'extrait', 'cologne', 'perfume', 'fragrance', 'scent', 'version']);
const GENDER = new Set(['man', 'men', 'woman', 'women', 'homme', 'femme', 'male', 'female',
  'masculin', 'feminin']);
const BRAND = new Set(String(data.brand).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/)
  .filter((w) => w.length >= 3));

const toksOf = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
  .filter((t) => t.length >= 3 && !FILLER.has(t) && !GENDER.has(t) && !BRAND.has(t));

/* 性别判据与主代码同源语义：先看「男女/中性」整体词，再看各自标记 */
const MALE = /\b(man|men|homme|males?|masculin)\b/;
const FEMALE = /\b(woman|women|femme|females?|feminin)\b/;
function genderOf(s) {
  const t = String(s || '').toLowerCase();
  const both = /男女|unisex|中性/.test(t);
  return {
    m: !both && (MALE.test(t) || /男士|男性|男款/.test(t)),
    f: !both && (FEMALE.test(t) || /女士|女性|女款/.test(t)),
  };
}

/* G1：全品牌词频。出现 >=2 次的是系列词，不能当区分词。 */
const freq = {};
for (const r of evalData.rows) for (const t of new Set(toksOf(r.name))) freq[t] = (freq[t] || 0) + 1;

/* G3：中文名里的通用词**要剥掉**而不是整段作废。
   第一版用 includes 整段判废，于是「里程正品」因为含「正品」被整个丢掉，
   而「里程」正是 Club de Nuit Milestone 唯一正确的中文名。
   剥完还剩 >=2 字才算候选。 */
const GENERIC = ['香水', '香氛', '浓香', '淡香', '香精', '古龙', '正品', '持久', '留香', '小众',
  '高级', '男女士', '男士', '女士', '中性', '男香', '女香', '男款', '女款', '专用', '同款', '平替',
  '木质', '花香', '果香', '东方', '清新', '美食调', '迪拜', '阿拉伯', '美国', '香港', '直邮',
  '保税', '现货', '礼盒', '套装', '试管', '小样', '分装', '喷雾', '身体', '洗发', '沐浴',
  '补充装', '正装', '大瓶', '限量', '新版', '老版', '经典', '爆款', '热卖', '包邮', '秒发',
  '官方', '旗舰店', '专柜', '联名', '旅行装', '便携', '跨境', '外贸', '黑之黑', '闪耀', '外套',
  '金属盖', '盖装', '装男', '水中'];
const GEN_RE = new RegExp(GENERIC.sort((a, b) => b.length - a.length).join('|'), 'g');

const BRAND_CN = [data.alias, ...(data.aliasAlt || [])].filter(Boolean);
function cnCandidates(title) {
  let t = title;
  for (const b of BRAND_CN) t = t.replace(new RegExp(b, 'g'), '|');
  const out = [];
  for (const part of t.split(/[|/\s,，、+＋·・()（）\[\]【】]+/)) {
    const cn = (part.match(/[\u4e00-\u9fa5]+/g) || []).join('');
    if (cn.length < 2) continue;
    const stripped = cn.replace(GEN_RE, '');
    /* 长度上限 5：第一版放 8，于是「水馥郁萦绕细腻」这种把描述句切下来的碎片
       也进了候选，反向查询还能命中 —— 命中 ≠ 是名字。中文香名极少超过 5 字。 */
    if (stripped.length >= 2 && stripped.length <= 5) out.push(stripped);
  }
  return [...new Set(out)];
}

async function query(q, pageSize = 40) {
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
  if (node.error_response) return { n: 0, titles: [], err: node.error_response.sub_msg || node.error_response.msg };
  const d = unwrapTaobao(node, 'taobao.tbk.dg.material.optional.upgrade');
  const list = d?.result_list?.map_data || [];
  return { n: list.length, titles: list.map((it) => (it.item_basic_info || {}).title || '') };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ');

/* 反搜命中的**提升度**：中文名在「<中文名> 香水」的结果里占多少，
   与它在整个品牌池里占多少相比。提升不到 2 倍就说明这个词哪儿都有，
   不是这一瓶的名字（例：`夜店狂欢` 出现在 Armaf 一堆款里）。
   这一条替代了「标题里必须出现拉丁区分词」—— 实测中文标题不写拉丁名是常态
   （`里程 香水` 10 条里 0 条含 milestone，但 10 条全是里程这一款）。 */
function liftOf(cn, titles, poolTitles) {
  if (!cn || !titles.length) return { rate: 0, base: 0, lift: 0 };
  const rate = titles.filter((t) => String(t).includes(cn)).length / titles.length;
  const base = poolTitles.length
    ? poolTitles.filter((t) => String(t).includes(cn)).length / poolTitles.length
    : 0;
  return { rate, base, lift: base > 0 ? rate / base : (rate > 0 ? Infinity : 0) };
}
const POOL_TITLES = (data.pool || []).map((c) => c.title);

const accepted = [], rejected = [];
/* 品牌命中用的两组词 */
const BRAND_CN_ALL = [data.alias, ...(data.aliasAlt || [])].filter(Boolean);
const BRAND_LATIN = String(data.brand).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
  .filter((w) => w.length >= 3);
/* 同品牌其他瓶的中文名候选：反搜结果里出现它们 = 搜到的是系列，不是这一款 */
const ALL_CN = [...new Set(evalData.rows.filter((x) => x.J4).flatMap((x) => cnCandidates(x.J4.title)))];

for (const r of evalData.rows.filter((x) => x.J4)) {
  const T = toksOf(r.name);
  if (!T.length) { rejected.push({ id: r.id, name: r.name, why: '无可用拉丁词' }); continue; }
  const OTHER_CN = ALL_CN.filter((c) => !cnCandidates(r.J4.title).includes(c));

  /* G1：找一个区分词。独有词优先；没有独有词时，用「共用词 + 性别」当区分键 ——
     Mirage Man / Mirage Woman 只差性别，mirage 本身共用，但「mirage + 男」是唯一的。
     这不是放宽判据：反向验证会同时要求 token 命中**且**性别对得上。 */
  const uniq = T.filter((t) => freq[t] === 1);
  const want = genderOf(r.name);
  let key = null, needGender = null;
  if (uniq.length) {
    key = uniq.sort((a, b) => b.length - a.length)[0];
  } else {
    const shared = T.filter((t) => freq[t] >= 2).sort((a, b) => b.length - a.length)[0];
    if (shared && (want.m || want.f)) { key = shared; needGender = want.m ? 'm' : 'f'; }
  }
  if (!key) {
    rejected.push({ id: r.id, name: r.name, why: `没有区分键（tokens=${T.join(',')} 全被同品牌其他瓶共用，且瓶名未标性别）` });
    continue;
  }

  /* G3 */
  const cnList = cnCandidates(r.J4.title);
  if (!cnList.length) { rejected.push({ id: r.id, name: r.name, why: '标题里读不出非通用的中文名' }); continue; }

  /* G2 */
  let best = null;
  for (const cn of cnList.slice(0, 3)) {
    const got = await query(`${cn} 香水`);
    await sleep(650);
    const hitLatin = got.titles.filter((t) => {
      const low = norm(t);
      if (!low.includes(key)) return false;
      if (!needGender) return true;
      const g = genderOf(t);
      return needGender === 'm' ? (g.m && !g.f) : (g.f && !g.m);
    }).length;
    /* 中文标题里不写拉丁名是常态（实测 `里程 香水` 10 条里 0 条含 "milestone"，
       但全都写着「里程碑」，就是这一瓶）。
       所以第二个信号是：搜回来的标题里，**这一瓶的中文名**出现了多少条、
       且它们**不含同品牌其他瓶的中文名** —— 含了就是系列名，不是款名。 */
    const cnHit = got.titles.filter((t) => String(t).includes(cn)).length;
    const otherCn = got.titles.filter((t) => OTHER_CN.some((o) => o !== cn && String(t).includes(o))).length;
    const lf = liftOf(cn, got.titles, POOL_TITLES);
    /* 品牌关：标题含这个中文名的结果里，必须多数是本品牌。
       实测反例：`威尼斯 香水` 40 条里 8 条含「威尼斯」，但全是 Monotheme（另一个
       意大利牌子）—— 光看提升度会把它判成 Armaf Venetian Man 的名字。 */
    const withCn = got.titles.filter((t) => String(t).includes(cn));
    const brandIn = withCn.filter((t) => BRAND_CN.some((b) => String(t).includes(b))
      || BRAND_LATIN.some((w) => norm(t).includes(w))).length;
    const brandRate = withCn.length ? brandIn / withCn.length : 0;
    if (!best || hitLatin + cnHit > best.hitLatin + best.cnHit) {
      best = { cn, n: got.n, hitLatin, cnHit, otherCn, key, brandIn, brandRate, ...lf };
    }
    if (hitLatin >= 2) break;
  }
  const keyLabel = needGender ? `${key}+${needGender === 'm' ? '男' : '女'}` : key;
  /* 判据三条任一成立：
     a) 拉丁区分键在结果里出现（最强）；
     b) 中文名在该结果里出现 >=2 条，提升 >=2，且**多数结果属于本品牌**。
     品牌那一关是必须的：`威尼斯 香水` 全是 Monotheme，光看提升度过不了这一关
     就会被判成 Armaf Venetian Man 的中文名。 */
  const passLatin = best && best.hitLatin > 0;
  const passCn = best && best.cnHit >= 2 && best.lift >= 2 && best.brandRate >= 0.5;
  if (passLatin || passCn) {
    accepted.push({
      id: r.id, name: r.name, key, needGender, cn: best.cn,
      hits: best.hitLatin, cnHits: best.cnHit, otherCn: best.otherCn, n: best.n,
      via: passLatin ? 'latin' : 'cn', evidence: r.J4.title,
    });
    console.log(`✓ ${r.name.padEnd(30)} cn=${best.cn} key=${keyLabel} latin=${best.hitLatin} cn=${best.cnHit}/${best.n}${best.otherCn ? ' 混入他款' + best.otherCn : ''}`);
  } else {
    rejected.push({ id: r.id, name: r.name, why: `反向验证未通过（cn=${best?.cn} latin=${best?.hitLatin} cnHit=${best?.cnHit}/${best?.n} otherCn=${best?.otherCn} lift=${best?.lift === Infinity ? 'inf' : (best?.lift || 0).toFixed(2)} rate=${(best?.rate || 0).toFixed(2)} base=${(best?.base || 0).toFixed(2)}）` });
    console.log(`✗ ${r.name.padEnd(30)} key=${keyLabel} cn=${best?.cn} latin=${best?.hitLatin} cn=${best?.cnHit}/${best?.n}`);
  }
}

console.log(`\n${data.brand}：可入库 ${accepted.length} 条，拒 ${rejected.length} 条`);
for (const r of rejected) console.log(`   ✗ ${r.name} — ${r.why}`);
const out = `data/.cache/zh-aliases-${slug}.json`;
fs.writeFileSync(out, JSON.stringify({ brand: data.brand, alias: data.alias, accepted, rejected }, null, 1));
console.log(`\n写出 ${out}`);
