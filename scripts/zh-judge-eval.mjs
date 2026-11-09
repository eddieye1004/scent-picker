/* 离线重放：同一份品牌池，比较几种判据能救回几瓶、错几瓶
 *
 * 为什么要逐档对比：zh-name-scout 报过一个比「搜不到」更危险的失败——
 * 搜到的是**系列名**（Prada Luna Rossa Black → 「红月」，52 条里 33 条并列
 * 碳黑/深海蓝/海洋）。挂上去会把 Carbon 的链接记到 Black 头上。
 *
 * **第一版判据错了**（evidence 留在本文件末尾注释里）：STOP 表里塞了
 * man/woman/intense/black/blue 这些**区分词**，于是
 *   Club de Nuit Intense Woman → tokens 只剩 [club, nuit]
 *   Le Parfait pour Homme/Femme → tokens 只剩 [parfait]
 * 两瓶不同款的 token 完全相同，双双匹配到同一条标题，报告成「22 条全对」。
 * 这正是本项目第四次踩「STOP 表吃掉区分轴」（前三次：性别轴、蜡烛、词数<2）。
 *
 * 现在的 STOP 只去掉真正的填充词（冠词/介词/容量单位/品类词），
 * **保留一切可能区分款式的词**，包括 man/woman/intense/black/blue。
 * 品牌词单独按「已知品牌名集合」剥，不再靠手写清单。
 *
 * 用法：node scripts/zh-judge-eval.mjs data/.cache/zh-pool-armaf.json
 */
import fs from 'node:fs';

const FILE = process.argv[2];
if (!FILE) { console.error('用法: node scripts/zh-judge-eval.mjs <pool.json>'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const pool = data.pool || [];
if (!pool.length) { console.error('池里没有原文（旧格式），先重跑 zh-pool-arma.mjs'); process.exit(1); }

/* 只去填充词。任何能区分款式的词（intense / noir / gold …）都必须留。 */
const FILLER = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'the', 'for', 'and', 'of', 'pour',
  'by', 'a', 'an', 'edp', 'edt', 'edc', 'ml', 'oz', 'spray', 'eau', 'toilette', 'parfum',
  'extrait', 'cologne', 'perfume', 'fragrance', 'scent', 'version']);

/* 品牌命中判据用的两组词：拉丁名从品牌字段拆出来，中文别名从池文件里读。
   不写死 —— 这个脚本要对每个品牌跑一遍，写死就只能在 Armaf 上用。 */
function latinWords(brand) {
  return String(brand || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter((w) => w.length >= 3 && !FILLER.has(w) && !['maison', 'parfums', 'the', 'de', 'di'].includes(w));
}
const BRAND_LATIN_WORDS = latinWords(data.brand);
const BRAND_CN = [data.alias, ...(data.aliasAlt || [])].filter(Boolean);

/* 性别词不能当「必须在标题里出现」的词：卖家常写「男士/女士」而不写 man/woman，
   要求英文性别词命中会把真品全判死（实测 Craze Man 因此 cover 只有 0.50）。
   性别本身仍要判 —— 交给 genderOf 做冲突检查。 */
const GENDER_WORDS = new Set(['man', 'men', 'woman', 'women', 'homme', 'femme', 'male', 'female',
  'masculin', 'feminin']);

/* 品牌词：出现在香名里也只是重复品牌，不是款名 */
const BRAND_WORDS = new Set(['armaf', 'afnan', 'lattafa', 'creed', 'dior', 'guerlain', 'versace',
  'prada', 'tom', 'ford', 'maison', 'margiela', 'parfums', 'marly', 'acquatic', 'di', 'parma',
  'lancome', 'lancôme', 'ysl', 'yves', 'saint', 'laurent', 'montale', 'mancera', 'amouage',
  'byredo', 'nishane', 'ajmal', 'rasasi', 'khadlaj', 'ard', 'zaafaran', 'emper', 'swiss', 'arabian']);

function toks(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter((t) => t.length >= 2 && !FILLER.has(t) && !BRAND_WORDS.has(t) && !GENDER_WORDS.has(t));
}
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ');

const PERFUME_LEAF = /香水|彩妆香水/;
const NON_PERFUME = /身体乳|沐浴|洗发|护发|洗手液|护手霜|手霜|润肤|蜡烛|蜡燭|香薰机|扩香|香皂|汽车|香珠|洗衣|发膜|面膜|乳液|小样|试用|试管|分装/;

const MALE = /\b(man|men|homme|males?|masculin)\b/;
const FEMALE = /\b(woman|women|femme|females?|feminin)\b/;
function genderOf(s) {
  const t = String(s || '').toLowerCase();
  const both = /男女|unisex|中性/.test(t);
  const m = !both && (MALE.test(t) || /男士|男性|男款/.test(t));
  const f = !both && (FEMALE.test(t) || /女士|女性|女款/.test(t));
  return { m, f };
}

function catOk(c) {
  if (NON_PERFUME.test(c.title) || NON_PERFUME.test(c.cat)) return false;
  if (!c.cat) return true;
  return PERFUME_LEAF.test(c.cat);
}

const rows = [];
for (const r of data.rows) {
  const T = toks(r.name);
  if (!T.length) continue;
  const g = genderOf(r.name);
  const last = T[T.length - 1];
  const cands = [];
  for (const c of pool) {
    if (!catOk(c)) continue;
    const low = norm(c.title);
    const cn = c.title.replace(/[^\u4e00-\u9fa5]/g, '');
    const hit = T.filter((t) => low.includes(t));
    const cg = genderOf(c.title);
    const clash = (g.m && cg.f && !cg.m) || (g.f && cg.m && !cg.f);
    /* 品牌命中：拉丁品牌名出现在标题里，或中文别名出现在汉字串里。
       缺了这条，`LA ROSA POUR FEMME` 会匹配到 Guess 的 Bella Vita Rosa ——
       实测 J1 的 19 条里 3 条是别的品牌。 */
    const brandHit = BRAND_LATIN_WORDS.some((w) => low.includes(w))
      || BRAND_CN.some((b) => cn.includes(b));
    const hasGenderMark = cg.m || cg.f;
    cands.push({
      itemId: c.itemId, title: c.title, cat: c.cat, hit, clash, brandHit, hasGenderMark,
      cover: hit.length / T.length, tailHit: low.includes(last), clickUrl: c.clickUrl,
    });
  }
  const pickJ = (f) => cands.filter(f)
    .sort((a, b) => b.hit.length - a.hit.length || a.title.length - b.title.length)[0] || null;
  rows.push({
    id: r.id, name: r.name, toks: T, last, nCand: cands.length,
    J0: pickJ((c) => c.cover >= 0.6),
    J1: pickJ((c) => c.cover === 1 && !c.clash),
    J2: pickJ((c) => c.cover === 1 && c.tailHit && !c.clash),
    J3: pickJ((c) => c.cover === 1 && c.tailHit && !c.clash && c.brandHit),
    /* J4：瓶名有性别就必须在标题里也标出来。
       否则 Club de Nuit Woman（tokens 只剩 club,nuit）会匹配到
       「ClubdeNuitBling 夜之俱乐部闪耀」—— 那是另一个款。 */
    J4: pickJ((c) => c.cover === 1 && c.tailHit && !c.clash && c.brandHit
      && (!(g.m || g.f) || c.hasGenderMark)),
  });
}

const cnt = (k) => rows.filter((r) => r[k]).length;
console.log(`待救 ${rows.length} 瓶 | 池 ${pool.length} 条\n`);
console.log(`J0 现行(过半)              ${cnt('J0')}`);
console.log(`J1 全词+性别               ${cnt('J1')}`);
console.log(`J2 +末词                   ${cnt('J2')}`);
console.log(`J3 +品牌命中               ${cnt('J3')}`);
console.log(`J4 +标题须标性别           ${cnt('J4')}\n`);

for (const k of ['J3', 'J4']) {
  const list = rows.filter((r) => r[k]);
  if (!list.length) continue;
  console.log(`--- ${k}（${list.length} 条，请逐条判真假）`);
  for (const r of list) {
    const c = r[k];
    console.log(`  ${r.name}   [${r.toks.join(',')}]`);
    console.log(`    → ${c.title.slice(0, 70)}`);
    console.log(`      cover=${c.cover.toFixed(2)} tail=${c.tailHit} ${c.cat.slice(0, 34)}`);
  }
  console.log('');
}

const extra = rows.filter((r) => r.J1 && !r.J2);
console.log(`--- J1 有、J2 无（末词没命中，${extra.length} 条，最需要人看）`);
for (const r of extra) {
  console.log(`  ${r.name}  [${r.toks.join(',')}] last=${r.last}`);
  console.log(`    → ${r.J1.title.slice(0, 70)}`);
}

/* 每个品牌一个文件：共用一个 zh-judge-eval.json 时后跑的会覆盖前一个，
   下游 zh-verify-names.mjs 读到的就是别的品牌的瓶（实测踩过：Afnan 的
   eval 覆盖了 Armaf 的，反向验证只跑到 1 瓶）。 */
const OUT = `data/.cache/zh-judge-eval-${String(data.brand).toLowerCase().replace(/[^a-z]/g, '')}.json`;
fs.writeFileSync(OUT, JSON.stringify({
  file: FILE, brand: data.brand,
  counts: { J0: cnt('J0'), J1: cnt('J1'), J2: cnt('J2'), J3: cnt('J3'), J4: cnt('J4') }, rows,
}, null, 1));
console.log(`\n写出 ${OUT}`);
