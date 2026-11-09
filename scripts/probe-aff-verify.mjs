/* 命中复核（第二道闸）—— 把阶梯结果里的每一条 winner 独立复核一遍。

   为什么需要：`scoreMatch` 的香名覆盖率是**词袋**判据，名字 3 个词命中 2 个就过 60%。
   对「系列名 + 款名」结构的香水，这会把同系列的**另一瓶**判成命中。
   仓库里已经踩过这个坑：`scripts/merge-affiliate-batch.mjs:54-78` 的注释记着
     armaf-club-de-nuit-milestone 曾被配到「夜店狂欢女士香水」。
   那边用的判据是「去掉品牌名与系列前缀后，剩下的独特词必须全部出现」。

   本脚本给出三档判定，**不是** PASS/FAIL 二值：

     latin-all      标题里出现了香名去掉品牌与系列名之后的**全部**独特词 —— 强证据。
     cn-alias       靠中文译名命中。译名是这一瓶的名字，但译名**可能只覆盖基础名**
                    （Good Girl Supreme 的译名只有「好女孩」），所以下面还要查碰撞。
     ambiguous      译名命中，但标题同样（或更）匹配同品牌的**另一瓶** —— 不许入表。

   碰撞检测：同一品牌下、香名与本瓶共享至少一个词的其它瓶，逐条算「它的独特词是否
   也全在标题里」。命中的兄弟瓶就是解释这条标题的另一个候选，此时不能靠译名认定。

   只读。用法：node scripts/probe-aff-verify.mjs [结果文件]
*/
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const rj = async (p) => JSON.parse(await readFile(path.join(ROOT, p), 'utf8'));

const file = process.argv[2] ? path.join(ROOT, process.argv[2])
  : path.join(ROOT, 'data/.cache', `aff-ladder-${new Date().toISOString().slice(0, 10)}.json`);
const ladder = JSON.parse(await readFile(file, 'utf8'));

const perfumes = (await rj('data/perfumes.json')).perfumes;
const byId = new Map(perfumes.map((p) => [p.id, p]));
const FRAG = await rj('data/fragrance-aliases.json');
const ALIASCACHE = await rj('data/brand-aliases.json');

/* 系列名 / 通用修饰词：命中它们**不证明**是这一瓶。 */
const SERIES = [
  'club de nuit', 'replica', 'aqua allegoria', "l'eau d'issey", "l'eau majeure",
  "la nuit de l'homme", "bade'e al oud", 'le parfum', "l'homme", 'la femme',
  'baiser', 'good girl', 'luna rossa', 'pour homme', 'pour femme',
];

const norm = (s) => String(s || '').toLowerCase()
  .replace(/[’‘`´]/g, "'")
  .replace(/[^\p{L}\p{N}']+/gu, ' ')
  .trim();

function uniqueWords(p) {
  const brandTokens = new Set(norm(p.brand).split(' ').filter(Boolean));
  let rest = norm(p.name);
  for (const s of SERIES) {
    rest = rest.replace(new RegExp(`(^|\\s)${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'gi'), ' ');
  }
  return rest.split(' ').filter((w) => w.length > 2 && !brandTokens.has(w) && !/^\d+$/.test(w));
}

const inTitle = (titleN, w) => titleN.includes(w);

function latinAll(p, titleN) {
  const ws = uniqueWords(p);
  if (!ws.length) return { ok: false, words: ws, miss: [] , empty: true };
  const miss = ws.filter((w) => !inTitle(titleN, w));
  return { ok: miss.length === 0, words: ws, miss };
}

function cnNames(p) {
  const f = FRAG[p.id];
  return [...new Set([...(f?.names || []), ...(f?.keywords || [])].filter(Boolean))];
}

/* 同品牌兄弟瓶：香名与本瓶共享至少一个 >2 字符词 */
function siblings(p) {
  const mine = new Set([...uniqueWords(p), ...norm(p.name).split(' ')]);
  return perfumes.filter((q) => q.id !== p.id && q.brand === p.brand)
    .filter((q) => norm(q.name).split(' ').some((w) => w.length > 2 && mine.has(w)));
}

/* **母瓶检测**：本瓶是某瓶的 flanker 时，母瓶名（去品牌后）应是本瓶名的子集。
   例：Good Girl Supreme 的母瓶是 Good Girl；Ristretto Intense Café 的母瓶是 Intense Cafe
   （反向：母瓶更长）。
   为什么必须查：译名常常只覆盖**基础名**（fragrance-aliases 里 Good Girl Supreme 的
   names 只有「好女孩」），于是「好女孩粉色高跟」这种标题会被记到 Supreme 名下，
   而它更像是 Good Girl 或 Good Girl Blush。译名不含本瓶独有词 → 不能认定。 */
function baseBottles(p) {
  const normName = (q) => norm(q.name).split(' ').filter(Boolean);
  const mine = new Set(normName(p));
  return perfumes.filter((q) => q.id !== p.id && q.brand === p.brand)
    .filter((q) => {
      const w = normName(q);
      return w.length > 0 && w.length < mine.size && w.every((x) => mine.has(x));
    });
}

/* **下游 flanker 检测**：本瓶是某瓶名的子集时，标题可能写的是那个更长的款。
   实测反例（本轮抓到）：`montblanc-explorer` 的 winner 标题是
   「M MONT BLANC EXPLORER PLATINUM 6.7OZ EDP万宝龙正品」——
   独特词只有 `explorer`，全中了，但那是 Explorer **Platinum**，
   数据库里另有一瓶 `montblanc-explorer-platinum`。
   所以「独特词全中」还不够：还要确认标题没有完整包含某个更长款的全名。 */
function downstreamFlankers(p) {
  const mine = norm(p.name).split(' ').filter(Boolean);
  return perfumes.filter((q) => q.id !== p.id && q.brand === p.brand)
    .filter((q) => {
      const w = norm(q.name).split(' ').filter(Boolean);
      if (w.length <= mine.length) return false;
      return mine.every((x) => w.includes(x));    // 本瓶是它的前缀子集
    });
}

/* 多款并列标题：同一标题里出现 ≥2 个兄弟瓶的名字/译名 → 那是店铺罗列，不是单品页 */
function multiScent(p, titleN) {
  const hits = siblings(p).filter((q) => {
    const names = [q.name, ...cnNames(q)];
    return names.some((n) => norm(n).length > 3 && titleN.includes(norm(n)));
  });
  return hits;
}

/* 「罗列页」可疑度：把品牌名、译名、成交话术、规格都挖掉之后，
   标题里还剩多少中文字。单品页剩下的通常是个位数；
   罗列页会把一整柜的款名怼在一起，剩几十个字。
   为什么用这个而不是维护一份款名词表：款名词表永远不全，
   而「剩太多解释不了的字」是个与词表无关的信号。
   阈值 14 是实测分布上的分界（单款 ≤12，罗列 ≥18），不是调出来的巧合。 */
const NOISE = [
  '香水', '香氛', '正品', '包邮', '现货', '直邮', '保税', '礼盒', '礼物', '送礼',
  '女士', '男士', '女香', '男香', '中性', '浓香', '淡香', '精粹', '香精', '淡香水',
  '双11', '双十一', '狂欢', '限时', '直播', '间', '生日', '情人节', '秒杀', '特价',
  '官方', '旗舰', '专柜', '简装', '大瓶', '小瓶', '旅行', '套盒', '套装', '试香',
  '篇', '款', '系列', '新款', '热卖', '爆款', '真品', '代购', '直营', '海外',
];
function unexplainedCjk(p, title) {
  let t = String(title || '');
  const strip = [p.brand, ...(ALIASCACHE[p.brand] || []), p.name, ...cnNames(p),
    ...(FRAG[p.id]?.keywords || [])].filter(Boolean);
  for (const s of strip) t = t.split(s).join(' ');
  for (const s of NOISE) t = t.split(s).join(' ');
  t = t.replace(/[A-Za-z0-9%./*+\-]+/g, ' ').replace(/[^\u4e00-\u9fa5]/g, ' ');
  return t.replace(/\s+/g, '').length;
}

const rows = [];
for (const r of ladder.results || []) {
  if (!r.winner) continue;
  const p = byId.get(r.id);
  if (!p) continue;
  const titleN = norm(r.winner.title || '');
  const latin = latinAll(p, titleN);
  const cn = cnNames(p);
  const cnHit = cn.some((n) => titleN.includes(norm(n)));

  let verdict; let why;
  const downstreamHit = downstreamFlankers(p).filter((q) => latinAll(q, titleN).ok);
  if (downstreamHit.length) {
    /* 这条必须先判：唯一独特词全中的情况下，如果标题也完整包含某个更长款的全名，
       那条更长的才是标题所指的货。 */
    verdict = 'ambiguous';
    why = `标题完整包含更长款的全名：${downstreamHit.map((q) => `${q.id}(${q.name})`).join(', ')} —— 不是本瓶`;
  } else if (latin.ok) { verdict = 'latin-all'; why = `独特词全中：${latin.words.join(', ')}`; }
  else if (cnHit) {
    /* 三道附加检查，任何一条不过就不能靠译名认定 */
    const bases = baseBottles(p);
    const baseTitles = bases.filter((q) => latinAll(q, titleN).ok || cnNames(q).some((n) => titleN.includes(norm(n))));
    const clash = siblings(p).filter((q) => latinAll(q, titleN).ok);
    const multi = multiScent(p, titleN);

    if (baseTitles.length) {
      verdict = 'ambiguous';
      why = `译名「${cn.join('/')}」命中，但它是母瓶的名字 —— 标题同样匹配 ${baseTitles.map((q) => `${q.id}(${q.name})`).join(', ')}；本瓶独有词 ${latin.miss.join(', ')} 一个都没出现`;
    } else if (bases.length) {
      /* 本瓶是 flanker（数据库里有它的母瓶），而译名**只覆盖基础名**：
         例 Good Girl Supreme 的译名就是「好女孩」，标题里多出来的「粉色高跟」
         不在我们的译名里，无法证明是 Supreme 而不是 Good Girl / Blush。
         这种情况下译名单独不构成证据 —— flanker 必须有拉丁词证据。 */
      verdict = 'ambiguous';
      why = `本瓶是 flanker（母瓶：${bases.map((q) => q.name).join(', ')}），而译名「${cn.join('/')}」只覆盖基础名，不含本瓶独有词 ${latin.miss.join(', ')} —— 译名单独不够`;
    } else if (clash.length) {
      verdict = 'ambiguous';
      why = `译名「${cn.join('/')}」命中，但标题同样满足兄弟瓶：${clash.map((q) => `${q.id}(${q.name})`).join(', ')}`;
    } else if (multi.length >= 2) {
      verdict = 'ambiguous';
      why = `标题里同时出现 ${multi.length} 个同品牌款名（${multi.slice(0, 3).map((q) => q.name).join(' / ')}）—— 是店铺罗列页，不是这一瓶`;
    } else if (unexplainedCjk(p, r.winner.title) > 14) {
      verdict = 'ambiguous';
      why = `译名命中，但标题挖掉品牌/译名/话术后还剩 ${unexplainedCjk(p, r.winner.title)} 个中文字 —— 单品页解释不了这么多，判为罗列页`;
    } else {
      verdict = 'cn-alias';
      why = `译名「${cn.join('/')}」整串出现在标题里；同品牌无母瓶/兄弟瓶命中（拉丁词缺：${latin.miss.join(', ') || '无'}）`;
    }
  } else {
    verdict = 'fail';
    why = `拉丁独特词未命中：${latin.miss.join(', ')}；也没有译名命中`;
  }
  rows.push({ id: p.id, name: p.name, stage: r.winner.stage, q: r.winner.q, title: r.winner.title, verdict, why,
    leftover: unexplainedCjk(p, r.winner.title) });
}

const tally = new Map();
for (const r of rows) tally.set(r.verdict, (tally.get(r.verdict) || 0) + 1);

for (const r of rows) {
  console.log(`[${r.verdict}]  L${r.stage}  ${r.id}  「${r.name}」`);
  console.log(`   q=「${r.q}」  标题：${String(r.title || '').slice(0, 62)}`);
  console.log(`   ${r.why}  （剩余中文字 ${r.leftover}）`);
}
console.log('\n' + [...tally.entries()].map(([k, v]) => `${k}=${v}`).join('  '));
const okIds = rows.filter((r) => r.verdict === 'latin-all' || r.verdict === 'cn-alias').map((r) => r.id);
const badIds = rows.filter((r) => r.verdict === 'ambiguous' || r.verdict === 'fail').map((r) => r.id);
console.log(`\n可入表 ${okIds.length}：${okIds.join(', ') || '（无）'}`);
console.log(`不入表 ${badIds.length}：${badIds.join(', ') || '（无）'}`);

/* 落盘给 probe-aff-apply.mjs 用。判据只在这一处定义，apply 不再自己判一遍 —— */
import { writeFile, mkdir } from 'node:fs/promises';
const OUT = path.join(ROOT, 'data/.cache', `aff-verify-${new Date().toISOString().slice(0, 10)}.json`);
await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: path.relative(ROOT, file),
  tally: Object.fromEntries(tally),
  rows,
}, null, 1) + '\n', 'utf8');
console.log(`\n已写 ${path.relative(ROOT, OUT)}`);
