/* 中文香名调研 第 3 步：40 瓶实测，两条路线对照

   路线 S（有来源）：中文名只允许从**召回标题里读出来** —— 先用「中文品牌 + 拉丁核心词」
     把带中英双名的标题捞回来（这种标题是唯一能把中文串锚定到拉丁名的载体），
     再从中抽中文片段当候选。抽不到 = 无来源 = 放弃该瓶。

   路线 G（靠推测）：像上一轮试点那样凭记忆给中文名。仅用于量化「不许编」这条约束
     到底损失了多少覆盖率，不写入任何结论。

   判据五条（与任务书一致）：
     ① 标题含中文品牌 ② 标题含中文香名 ③ 类目命中 /香水|彩妆香水/
     ④ 标题与类目不含周边品类词 ⑤ 类目非空
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp } from './lib/union-api.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;

/* 路线 G 的中文名：全部靠记忆推测，标注为「无来源」，只为算对照基数 */
const GUESS = {
  'guerlain-mitsouko': '蝴蝶夫人',
  'jo-malone-english-pear-and-freesia': '英国梨',
  'amouage-reflection-man': '反射',
  'mancera-cedrat-boise': '柠檬雪松',
  'tom-ford-black-orchid-reserve': '黑兰花',
  'lattafa-badee-al-oud-amethyst': '紫水晶',
  'armaf-club-de-nuit-milestone': '夜店狂欢',
  'maison-margiela-replica-by-the-fireplace': '壁炉',
};

const deaccent = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const GENERIC = new Set(['woman', 'women', 'man', 'men', 'for', 'her', 'him', 'pour', 'femme', 'homme',
  'unisex', 'edition', 'the', 'de', 'du', 'des', 'la', 'le', 'les', 'and', 'by', 'of', 'a', 'au',
  'gold', 'black', 'blue', 'brown', 'white', 'red', 'pink', 'green', 'purple', 'silver',
  'intense', 'elixir', 'extreme', 'sport', 'profumo', 'collector', 'limited', 'reserve', 'i', 'she']);

const CAT_OK = /香水|彩妆香水/;
const NON_PERFUME = ['身体乳', '沐浴', '洗发', '护发', '洗手液', '护手霜', '手霜', '润肤',
  '蜡烛', '香薰机', '扩香', '香皂', '汽车', '香珠', '洗衣', '发膜', '面膜', '乳液', '小样', '试用',
  '粉底', '口红', '唇膏', '唇釉', '眼霜', '面霜', '精华', '爽肤水', '护肤', '内衣', '内裤', '文胸',
  '奶茶', '酒店', '门票', '牙刷', '种子', '摆件', '帽子', '葡萄酒'];

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
  const catNonEmpty = c.trim().length > 0;
  return { ok: hasBrand && hasName && catOk && !bad && catNonEmpty,
    hasBrand, hasName, catOk, bad, catNonEmpty };
}

/* 从锚定标题里抽中文候选：截品牌名之后的片段，剥品类词，取 2-8 字中文串 */
const CAT_WORDS = ['香水', '香氛', '淡香精', '浓香精', '淡香水', '古龙水', '香精', '正品', '直邮',
  '代购', '小样', '试用', '分装', '免税', '官方', '旗舰', '专柜', '现货', '批', 'ml', 'EDP', 'EDT',
  '中性香', '女士', '男士', '持久', '送礼', '夜总会', '俱乐部'];

function extractCands(titles, brandCn) {
  const cnt = new Map();
  for (const t of titles) {
    let tail = t.slice(t.indexOf(brandCn) + brandCn.length);
    for (const w of CAT_WORDS) tail = tail.split(w).join('|');
    for (const c of tail.split(/[^一-龥]+/)) {
      const s = c.trim();
      if (s.length >= 2 && s.length <= 6) cnt.set(s, (cnt.get(s) || 0) + 1);
    }
    /* 也在品牌名之前的片段里找（「…里程碑 Armaf阿玛芙」这种写法） */
    const head = t.slice(0, t.indexOf(brandCn));
    for (const c of head.split(/[^一-龥]+/)) {
      const s = c.trim();
      if (s.length >= 2 && s.length <= 6) cnt.set(s, (cnt.get(s) || 0) + 1);
    }
  }
  return [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(([cn]) => cn);
}

const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/.cache/zh-name-sample.json'), 'utf8'));
const results = [];

for (const b of sample) {
  const nm = deaccent(b.name);
  const words = nm.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w && w.length > 2 && !GENERIC.has(w));
  const core = words.slice(-1)[0] || nm.replace(/\s+/g, '');

  /* --- 路线 S：找锚点 --- */
  const anchors = [];
  const tried = [];
  const shapes = [
    ['中文品牌+核心词', `${b.brandCn} ${core}`],
    ['中文品牌+拉丁名', `${b.brandCn} ${nm}`],
  ];
  for (const [label, q] of shapes) {
    if (!q.trim() || q.includes('undefined')) continue;
    const r = await query(q);
    tried.push({ label, q, n: r.n, err: r.err || '' });
    const anchored = r.items.filter((it) => {
      const t = deaccent(it.title).toLowerCase();
      return it.title.includes(b.brandCn) && (t.includes(core.toLowerCase()) || t.includes(nm.toLowerCase()));
    });
    for (const a of anchored) anchors.push(a.title);
    await sleep(240);
    if (anchors.length >= 5) break;
  }

  const cands = extractCands([...new Set(anchors)], b.brandCn).slice(0, 4);

  /* --- 路线 S 实测：逐候选打一次「中文品牌 中文名」 --- */
  let sBest = null;
  const sTried = [];
  for (const cn of cands) {
    const q = `${b.brandCn} ${cn}`;
    const r = await query(q);
    const passed = r.items
      .map((it) => ({ ...it, ...judge(it.title, it.cat, b.brandCn, cn) }))
      .filter((x) => x.ok);
    sTried.push({ cn, q, n: r.n, pass: passed.length });
    if (passed.length && !sBest) sBest = { cn, n: r.n, pass: passed.length,
      title: passed[0].title.slice(0, 60), cat: passed[0].cat, itemId: passed[0].itemId };
    await sleep(240);
    if (sBest) break;
  }

  /* --- 路线 G 对照：凭记忆给的中文名 --- */
  let gBest = null;
  const gName = GUESS[b.id];
  if (gName) {
    const q = `${b.brandCn} ${gName}`;
    const r = await query(q);
    const passed = r.items
      .map((it) => ({ ...it, ...judge(it.title, it.cat, b.brandCn, gName) }))
      .filter((x) => x.ok);
    if (passed.length) gBest = { cn: gName, n: r.n, pass: passed.length, title: passed[0].title.slice(0, 60) };
    await sleep(240);
  }

  const row = {
    id: b.id, brand: b.brand, brandCn: b.brandCn, name: b.name, core,
    anchorCount: anchors.length,
    anchorSamples: [...new Set(anchors)].slice(0, 3).map((t) => t.slice(0, 76)),
    tried, cands, sTried, sBest,
    gName: gName || null, gBest,
  };
  results.push(row);

  const mark = sBest ? 'S-PASS' : (cands.length ? 'S-FAIL' : 'S-NOSRC');
  console.log(
    mark.padEnd(7),
    b.brandCn.padEnd(6), b.name.slice(0, 30).padEnd(32),
    `锚=${String(anchors.length).padStart(2)} 候选=${cands.length}`,
    sBest ? `✔ ${sBest.cn} (合格${sBest.pass})` : (cands.length ? `✘ 试过:${sTried.map((x) => x.cn).join('/')}` : ''),
    gBest ? ` [推测✔ ${gBest.cn}]` : ''
  );
}

fs.writeFileSync(path.join(ROOT, 'data/.cache/zh-name-verify.json'), JSON.stringify(results, null, 2));

const sPass = results.filter((r) => r.sBest);
const sSrc = results.filter((r) => r.cands.length);
const gPass = results.filter((r) => r.gBest);
console.log(`\n=== 路线 S（有来源）通过：${sPass.length}/${results.length} = ${(sPass.length / results.length * 100).toFixed(0)}% ===`);
console.log(`    其中能从标题读出候选的：${sSrc.length}/${results.length}；读出但判据不过：${sSrc.length - sPass.length}`);
console.log(`=== 路线 G（凭记忆，仅 ${Object.keys(GUESS).length} 瓶有值）通过：${gPass.length}/${Object.keys(GUESS).length} ===`);
