/**
 * apply-reject-aliases.mjs — 把 reject-scout 判读出的别名落进品牌别名表
 *
 * 来源：`docs/reports/reject-review.md` §3.4。那 12 条别名不是抄来的，
 * 是逐条从被误杀瓶子的实际召回标题里读出来的（每条都有对应标题作证）。
 *
 * 两条硬取消件（缺一不可）：
 *   ① 幂等 —— 重复跑不产生重复条目、不改已有条目的顺序；
 *   ② 落地前回归 —— 每条别名都要在全库标题语料里扫一遍，
 *      命中异品牌就拒收。别名错一条，该品牌就会被错配到别家的商品上，
 *      这比缺一条链接严重得多。
 *
 * 「子线名不能当品牌别名」：`Club De Nuit` / `Odyssey Homme` 是系列名不是品牌名，
 * 在 907 条语料里分别命中 6 / 16 条异品牌商品（Issey Miyake `NUIT d'Issey`、
 * Versace/Kenzo/JPG/Azzaro 各种 `... Homme ...`）。本脚本**不含**这两条。
 *
 * 用法:
 *   node scripts/apply-reject-aliases.mjs           # 干跑，打印将改什么 + 回归结果
 *   node scripts/apply-reject-aliases.mjs --write   # 真写 data/brand-aliases.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');

const ALIAS_PATH = path.join(ROOT, 'data/brand-aliases.json');

/* 12 条候选，逐条附证据标题。evidence 只用于人读，不参与判定。 */
const PATCH = [
  { brand: 'Maison Margiela Fragrances', aliases: ['梅森 马吉', '梅森 马'],
    evidence: ['梅森马吉 复刻 雨后清晨', '梅森 马 爵士俱乐部'], merge: true },
  { brand: 'Armaf', aliases: ['奥洛斯'],
    evidence: ['Oros 奥洛斯 Holiday Edition 女士香水'], merge: true },
  { brand: 'Chloé', aliases: ['蔻依'],
    evidence: ['Chloe蔻依Nomade小猪包恋旅女士浓香水20ml'] },
  { brand: 'Ralph Lauren', aliases: ['拉夫劳伦'],
    evidence: ['美国直邮M POLO BLUE 4.2OZ EDT拉夫劳伦 蓝马球125ml男士淡正品'] },
  { brand: 'Calvin Klein', aliases: ['凯文克莱'],
    evidence: ['国现CK凯文克莱ETERNITY MOMENT Woman永恒时刻女士浓香水EDP'] },
  { brand: 'Hugo Boss', aliases: ['雨果波士'],
    evidence: ['美国代购雨果波士动感银地球男士淡香水EDT in Motion正品'] },
  { brand: 'Matière Première', aliases: ['马蒂埃'],
    evidence: ['马蒂埃Matiere Premiereh香水不败玫瑰Radical Rose'] },
  { brand: 'Miu Miu', aliases: ['缪缪'],
    evidence: ['欧洲直邮miumiu缪缪 fleur de lait香水正品桂花'] },
  { brand: 'Mugler', aliases: ['穆格'],
    evidence: ['美国直邮W ANGEL STELLAR 0.80OZ EDP SPRAY LUMINEUSE穆格正品'] },
  { brand: 'Narciso Rodriguez', aliases: ['纳西索'],
    evidence: ['24年香 纳西索 All Of Me Intense 由我馥郁版女士香水30ml50ml'] },
  { brand: 'Versace', aliases: ['范思哲'],
    evidence: ['【丁禹兮同款】VERSACE/范思哲 POUR HOMME 同名男士香水'] },
];

/* ---------------------------------------------------------------- 语料 */

/** 从本地缓存与候选表里收集所有商品标题，带出处，用于回归。 */
function collectTitles() {
  const out = [];
  const push = (t, from, id) => {
    const s = typeof t === 'string' ? t.trim() : '';
    if (s) out.push({ title: s, from, id });
  };

  // ① 接口缓存：每个 keyword 下全部候选的 title
  const cachePath = path.join(ROOT, 'data/.cache/union-api.json');
  if (fs.existsSync(cachePath)) {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    for (const [key, node] of Object.entries(cache)) {
      const id = key.split(':')[1] || '';
      for (const c of node.candidates || []) push(c.title, 'cache', id);
    }
  }

  // ② 候选表：accepted / rejected 里的 picked.title
  const candPath = path.join(ROOT, 'data/products.candidates.json');
  if (fs.existsSync(candPath)) {
    const cd = JSON.parse(fs.readFileSync(candPath, 'utf8'));
    for (const row of [...(cd.accepted || []), ...(cd.rejected || [])]) {
      push(row?.picked?.title, 'candidates', row?.id || '');
    }
  }

  // ③ reject-scout 的只读快照（缓存被覆写后它成了唯一稳定的全量标题来源）
  for (const name of ['reject-snapshot-union-api.json', 'reject-sample.json']) {
    const p = path.join(ROOT, 'data/.cache', name);
    if (!fs.existsSync(p)) continue;
    const snap = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const [key, node] of Object.entries(snap)) {
      if (!node || typeof node !== 'object') continue;
      const id = key.split(':')[1] || '';
      for (const c of node.candidates || []) push(c.title, name, id);
    }
  }

  // ④ 22:41 的全量候选快照（accepted 624 + rejected 764）。
  //    这份文件从未入 git，且当前工作区那份已被覆写成子集，
  //    所以优先读 scent-picker-v2 里的副本 —— 它是 reject-scout 用的同一份。
  for (const cand of [
    path.resolve(ROOT, '..', 'scent-picker-v2/data/products.candidates.json'),
    candPath,
  ]) {
    if (!fs.existsSync(cand)) continue;
    const cd = JSON.parse(fs.readFileSync(cand, 'utf8'));
    const rows = [...(cd.accepted || []), ...(cd.rejected || [])];
    if (rows.length < 500) continue; // 子集不算语料
    for (const row of rows) push(row?.picked?.title, 'snapshot-v2', row?.id || '');
    break;
  }

  // 去重：同一标题只留第一条出处
  const seen = new Set();
  return out.filter((r) => {
    if (seen.has(r.title)) return false;
    seen.add(r.title);
    return true;
  });
}

/* -------------------------------------------------------------- 回归 */

/** 归一：小写、去标点、压空格。中文不切字，只做包含判断。 */
const norm = (s) => String(s).toLowerCase().replace(/[^0-9a-z\u4e00-\u9fa5]+/g, ' ').trim();
const squash = (s) => norm(s).replace(/\s+/g, '');

/**
 * 这条别名是否会命中别的品牌的商品标题。
 * 判据：标题里出现了该别名，但这瓶的 id 不属于该品牌（或标题里同时出现了另一个已知品牌）。
 * @returns {{hits:number, same:number, foreign:{title:string,id:string}[]}}
 */
function regression(alias, brand, titles, perfumeById) {
  const a = squash(alias);
  const res = { hits: 0, same: 0, foreign: [] };
  for (const { title, id } of titles) {
    if (!squash(title).includes(a)) continue;
    res.hits++;
    const owner = perfumeById.get(id);
    if (owner && owner === brand) res.same++;
    else res.foreign.push({ title, id });
  }
  return res;
}

/* ---------------------------------------------------------------- 主流程 */

const table = JSON.parse(fs.readFileSync(ALIAS_PATH, 'utf8'));
const perfumes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8')).perfumes;
const perfumeById = new Map(perfumes.map((p) => [p.id, p.brand]));
const knownBrands = new Set(perfumes.map((p) => p.brand));

const titles = collectTitles();
console.log(`标题语料 ${titles.length} 条（去重后）`);

// ① 校验：PATCH 里的 brand 必须是 perfumes.json 里真实存在的写法，
//    否则写进去是一条永远命中不了的死别名。
const badBrand = PATCH.filter((p) => !knownBrands.has(p.brand));
if (badBrand.length) {
  console.error('✗ 这些品牌名在 perfumes.json 里不存在，写入也不会生效：');
  for (const b of badBrand) console.error('   ' + b.brand);
  process.exit(1);
}

// ② 逐条回归
const accepted = [];
const rejected = [];
for (const p of PATCH) {
  for (const alias of p.aliases) {
    const r = regression(alias, p.brand, titles, perfumeById);
    if (r.foreign.length) {
      rejected.push({ brand: p.brand, alias, ...r });
    } else {
      accepted.push({ brand: p.brand, alias, hits: r.hits, same: r.same });
    }
  }
}

console.log('\n=== 回归结果（全库标题语料，异品牌命中即拒收）===');
for (const a of accepted) {
  console.log(`  ✓ ${a.brand} ← 「${a.alias}」 全库命中 ${a.hits}（同品牌 ${a.same}）`);
}
for (const r of rejected) {
  console.log(`  ✗ ${r.brand} ← 「${r.alias}」 全库命中 ${r.hits}，其中异品牌 ${r.foreign.length} 条`);
  for (const f of r.foreign.slice(0, 3)) console.log(`      · ${f.id}: ${f.title.slice(0, 60)}`);
}

// ③ 幂等合并
const before = JSON.stringify(table);
let addedKeys = 0;
let addedAliases = 0;
for (const { brand, alias } of accepted) {
  if (!Array.isArray(table[brand])) { table[brand] = []; addedKeys++; }
  if (!table[brand].includes(alias)) { table[brand].push(alias); addedAliases++; }
}

// 新增的 key 按字母序排进表里（_readme 永远第一条，不能挪动）
const readme = table._readme;
const rest = Object.keys(table).filter((k) => k !== '_readme').sort((a, b) => a.localeCompare(b));
const rebuilt = { _readme: readme };
for (const k of rest) rebuilt[k] = table[k];
const after = JSON.stringify(rebuilt);

console.log('\n=== 变更 ===');
console.log(`  新增品牌 key ${addedKeys} 个，新增别名 ${addedAliases} 条`);
console.log(`  表内品牌 ${Object.keys(rebuilt).length - 1} 个`);
if (before === JSON.stringify(rebuilt)) console.log('  内容无变化（幂等：已经落过了）');

if (!WRITE) {
  console.log('\n--干跑。加 --write 才写盘。');
  process.exit(0);
}
if (before === JSON.stringify(rebuilt)) {
  console.log('\n--无变化，不写盘。');
  process.exit(0);
}

const tmp = ALIAS_PATH + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(rebuilt, null, 2) + '\n', 'utf8');
fs.renameSync(tmp, ALIAS_PATH);
console.log(`\n已写 ${path.relative(ROOT, ALIAS_PATH)}`);
console.log('下一步：跑全量 fetch（命中缓存重算 accept）→ merge → gen-affiliate-links');
