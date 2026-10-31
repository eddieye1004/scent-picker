/* 第五轮：32 小类的六维量化（输出 evidence5.md + classes.json）
   前提：perfumes.json 无 subfamily 字段，只有族级 families 权重，
   所以"每类瓶数"是代理指标（该类登记原料在族内的命中瓶数），不是官方标注。
*/
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Users/16256/Documents/deepseek-harness/default-workspace/scent-picker';
const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));
const perf = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8')).perfumes;
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

const ALIAS = {
  bergamot: ['bergamot'], lemon: ['lemon'],
  mandarin: ['mandarin', 'mandarin orange', 'tangerine', 'clementine'],
  orange: ['orange'], grapefruit: ['grapefruit'], lime: ['lime'], neroli: ['neroli'],
  'orange blossom': ['orange blossom'], petitgrain: ['petitgrain'], yuzu: ['yuzu'],
  lavender: ['lavender'], rosemary: ['rosemary'], sage: ['sage', 'clary sage'], thyme: ['thyme'],
  mint: ['mint', 'peppermint', 'bergamot mint'], basil: ['basil'], galbanum: ['galbanum'],
  'violet leaf': ['violet leaf'], 'fig leaf': ['fig leaf'], violet: ['violet'],
  sandalwood: ['sandalwood'], vetiver: ['vetiver'], cedarwood: ['cedarwood', 'cedar'], cedar: ['cedarwood', 'cedar'],
  patchouli: ['patchouli'], oakmoss: ['oakmoss'], juniper: ['juniper'], cypress: ['cypress'],
  oud: ['oud'], guaiac: ['guaiac', 'guaiac wood'], teak: ['teak'], pine: ['pine'], fir: ['fir'],
  birch: ['birch', 'birch tar'], cashmeran: ['cashmeran'], ambroxan: ['ambroxan'],
  vanilla: ['vanilla'], amber: ['amber'], ambergris: ['ambergris'], benzoin: ['benzoin'],
  labdanum: ['labdanum'], 'tonka bean': ['tonka bean', 'tonka'], saffron: ['saffron'],
  cinnamon: ['cinnamon'], clove: ['clove'], cardamom: ['cardamom'], incense: ['incense'],
  frankincense: ['frankincense', 'olibanum'], myrrh: ['myrrh'], opoponax: ['opoponax', 'opopanax'],
  leather: ['leather'], styrax: ['styrax', 'storax'], 'green tea': ['green tea'],
  'black tea': ['black tea'], tea: ['tea'], coumarin: ['coumarin'], musk: ['musk'],
  calone: ['calone'], aquatic: ['aquatic'], 'sea salt': ['sea salt', 'salt'], salt: ['salt', 'sea salt'],
  driftwood: ['driftwood'], cucumber: ['cucumber'], melon: ['melon'], coffee: ['coffee'],
  cocoa: ['cocoa', 'chocolate', 'cacao'], caramel: ['caramel'], sugar: ['sugar'],
  almond: ['almond'], coconut: ['coconut'], hazelnut: ['hazelnut'], praline: ['praline'],
  rum: ['rum'], cognac: ['cognac'], whiskey: ['whiskey', 'whisky'], absinthe: ['absinthe'],
  peach: ['peach'], apple: ['apple'], pear: ['pear'],
  berry: ['berry', 'blackcurrant', 'raspberry', 'strawberry', 'blackberry'],
  cherry: ['cherry'], jasmine: ['jasmine'], rose: ['rose'], tuberose: ['tuberose'],
  peony: ['peony'], iris: ['iris'], aldehydes: ['aldehydes'],
  'lily of the valley': ['lily of the valley'], 'ylang-ylang': ['ylang-ylang', 'ylang ylang'],
  gardenia: ['gardenia'], magnolia: ['magnolia'], osmanthus: ['osmanthus'], freesia: ['freesia'],
  'pink pepper': ['pink pepper'], pepper: ['pepper'],
};

/* 概念口径：当登记原料在库里 0 命中时，用"同一概念的宽口径"再看一次，
   用于区分"类定义查无实据"（N=0）与"概念本身不存在"（N_broad 也=0）。 */
const BROAD = {
  'green tea': ['green tea', 'black tea', 'tea', 'matcha'],
  'marine notes': ['marine notes', 'sea salt', 'salt', 'driftwood', 'calone', 'aquatic'],
  musk: ['musk'],
  cocoa: ['cocoa', 'chocolate', 'cacao'],
  'fig leaf': ['fig leaf', 'fig'],
};

const P = perf.map((p, i) => ({
  idx: i, id: p.id, name: p.name, brand: p.brand,
  notes: new Set((p.notesAll || []).map(norm)),
  fam: p.families || {}, ch: p.character || [], rank: p.popularityRank == null ? 1e9 : p.popularityRank,
}));
const has = (p, k) => (ALIAS[k] || [k]).some((a) => p.notes.has(a));
const allBag = new Map();
for (const p of P) for (const n of p.notes) allBag.set(n, (allBag.get(n) || 0) + 1);
const global = (k) => (ALIAS[k] || [k]).reduce((s, a) => s + (allBag.get(a) || 0), 0);
const keysOf = (notesStr) => String(notesStr).split('/').map((s) => norm(s.trim())).filter(Boolean);

const CLASSES = [];
for (const f of tax.families) {
  for (const s of f.subfamilies) {
    CLASSES.push({ fam: f.id, famZh: f.zh, id: s.id, zh: s.zh, keys: s.notes.flatMap(keysOf), desc: s.desc, tier: s.tier });
  }
}
const famBottles = {};
for (const f of tax.families) famBottles[f.id] = P.filter((p) => p.fam[f.id] > 0);

for (const c of CLASSES) {
  const fam = famBottles[c.fam];
  const set = fam.filter((p) => c.keys.some((k) => has(p, k)));
  c.N = set.length;
  c.famN = fam.length;
  c.share = c.N / fam.length;
  c.core = set.filter((p) => c.keys.filter((k) => has(p, k)).length >= 2).length;
  c.coreRate = c.N ? c.core / c.N : 0;
  const sibs = CLASSES.filter((x) => x.fam === c.fam && x.id !== c.id);
  let best = { id: null, zh: null, ov: 0, inter: 0 };
  for (const s of sibs) {
    const ss = fam.filter((p) => s.keys.some((k) => has(p, k)));
    const it = set.filter((p) => ss.includes(p)).length;
    const ov = Math.min(set.length, ss.length) ? it / Math.min(set.length, ss.length) : 0;
    if (ov > best.ov) best = { id: s.id, zh: s.zh, ov, inter: it };
  }
  c.maxOverlap = best.ov; c.nearest = best.zh || '—'; c.nearestId = best.id; c.nearestInter = best.inter;
  c.exclusive = set.filter((p) => !sibs.some((s) => s.keys.some((k) => has(p, k)))).length;
  c.exclusiveRate = c.N ? c.exclusive / c.N : 0;
  c.zeroNotes = c.keys.filter((k) => global(k) === 0);
  const broadHas = (p, k) => (BROAD[k] || ALIAS[k] || [k]).some((a) => p.notes.has(a));
  c.Nbroad = fam.filter((p) => c.keys.some((k) => broadHas(p, k))).length;
  const GENERIC = new Set(['musk', 'vanilla', 'bergamot', 'patchouli', 'cedarwood', 'rose', 'jasmine', 'sandalwood', 'amber', 'vetiver', 'lemon', 'mandarin', 'orange blossom', 'tonka bean', 'pink pepper']);
  const bag = new Map();
  for (const p of set) for (const n of p.notes) bag.set(n, (bag.get(n) || 0) + 1);
  c.top3 = [...bag.entries()].filter(([n]) => !GENERIC.has(n)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, v]) => `${n} ${(v / c.N * 100).toFixed(0)}%`);
  c.top3all = [...bag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, v]) => `${n} ${(v / c.N * 100).toFixed(0)}%`);
  c.examples = [...set].sort((a, b) => a.rank - b.rank).slice(0, 2).map((p) => `${p.brand} ${p.name}`);
  c.examplesLoose = [...set].sort((a, b) => a.rank - b.rank).slice(0, 4).map((p) => `${p.brand} ${p.name}`);
  c.w1 = set.filter((p) => p.fam[c.fam] >= 0.99).length;
  c.w05 = set.filter((p) => p.fam[c.fam] >= 0.5 && p.fam[c.fam] < 0.99).length;
  c.wLow = set.filter((p) => p.fam[c.fam] < 0.5).length;
}

const SEM_FLAG = {
  'citrus:cologne': 1, 'citrus:citrus-floral': 1, 'citrus:aromatic-citrus': 1,
  'floral:soliflore': 1, 'woody:woody-aromatic': 1,
  'amber:vanilla-amber': 1, 'amber:incense': 1, 'amber:leather': 1,
  'fresh:tea': 1, 'fresh:fougere': 1, 'fresh:aquatic': 1, 'gourmand:coffee-cocoa': 1,
};
const score = {
  mutual: (v) => (v <= 0.15 ? 5 : v <= 0.30 ? 4 : v <= 0.45 ? 3 : v <= 0.60 ? 2 : 1),
  homo: (v) => (v >= 0.60 ? 5 : v >= 0.45 ? 4 : v >= 0.30 ? 3 : v >= 0.18 ? 2 : 1),
  cov: (v) => (v >= 0.28 ? 5 : v >= 0.18 ? 4 : v >= 0.10 ? 3 : v >= 0.05 ? 2 : 1),
  mis: (v) => (v <= 0.15 ? 5 : v <= 0.30 ? 4 : v <= 0.45 ? 3 : v <= 0.60 ? 2 : 1),
  dist: (v) => (v >= 0.70 ? 5 : v >= 0.50 ? 4 : v >= 0.30 ? 3 : v >= 0.15 ? 2 : 1),
};
for (const c of CLASSES) {
  let sem = 5;
  if (c.keys.length === 1) sem -= 1;
  if (c.zeroNotes.length) sem -= 2;
  if (SEM_FLAG[c.fam + ':' + c.id]) sem -= 1;
  c.S = {
    mutual: score.mutual(c.maxOverlap),
    homo: score.homo(c.coreRate),
    sem: Math.max(1, sem),
    cov: score.cov(c.share),
    mis: score.mis(1 - c.exclusiveRate),
    dist: score.dist(c.exclusiveRate),
  };
  c.total = Object.values(c.S).reduce((a, b) => a + b, 0);
}

const out = [];
const L = (s = '') => out.push(s);
L('# 32 类分类体系的六维量化（evidence5）');
L('');
L('**前提**：`perfumes.json` 无 subfamily 字段，只有族级 `families` 权重。因此"每类瓶数"是**代理指标**——该类登记原料在族内的命中瓶数，不等于官方分类。指标定义：');
L('');
L('| 指标 | 定义 |');
L('|---|---|');
L('| N（瓶数） | 族内命中该类至少一个登记原料的瓶数（代理） |');
L('| 占比 | N ÷ 该族瓶数 |');
L('| 同质性 | 命中 ≥2 个自身登记原料的"核心瓶"占比 |');
L('| 互斥性 | 与最相近兄弟类的重叠系数 \\|A∩B\\|/min(\\|A\\|,\\|B\\|)，越低越好 |');
L('| 独占率 | 只命中本类、不命中任何兄弟类的占比 |');
L('| 误分率 | 1 − 独占率 |');
L('');
for (const f of tax.families) {
  const cs = CLASSES.filter((c) => c.fam === f.id);
  L(`## ${f.zh} ${f.id}（族 ${famBottles[f.id].length} 瓶 · ${cs.length} 类）`);
  L('');
  L('| 类 | N 瓶（概念口径） | 占比 | 权重 1.00 / 0.5–0.99 / <0.5 | 核心瓶 | 独占率 | 最近兄弟(重叠) | top3 共现原料（已排除通用底料） | 代表实例 |');
  L('|---|---|---|---|---|---|---|---|---|');
  for (const c of cs) {
    L(`| ${c.zh} \`${c.id}\` | ${c.N}${c.Nbroad !== c.N ? `（${c.Nbroad}）` : ''} | ${(c.share * 100).toFixed(1)}% | ${c.w1} / ${c.w05} / ${c.wLow} | ${(c.coreRate * 100).toFixed(0)}% | ${(c.exclusiveRate * 100).toFixed(0)}% | ${c.nearest} ${(c.maxOverlap * 100).toFixed(0)}% | ${c.top3.join(' · ') || '—'} | ${c.examples.join('；') || '—'} |`);
  }
  L('');
}

L('## 柑橘族三小类瓶级重叠');
L('');
const cit = CLASSES.filter((c) => c.fam === 'citrus');
const setOf = (id) => { const c = cit.find((x) => x.id === id); return famBottles.citrus.filter((p) => c.keys.some((k) => has(p, k))); };
const A = setOf('aromatic-citrus'), G = setOf('green-citrus'), F = setOf('citrus-floral'), C = setOf('cologne');
const inter = (a, b) => a.filter((p) => b.includes(p)).length;
const ovl = (a, b) => inter(a, b) / Math.min(a.length, b.length);
L('| 对 | 各自瓶数 | 交集 | 重叠系数 | 判定 |');
L('|---|---|---|---|---|');
for (const [n1, a, n2, b] of [['芳香柑橘', A, '青绿柑橘', G], ['芳香柑橘', A, '柑橘花香', F], ['青绿柑橘', G, '柑橘花香', F], ['古龙水型', C, '芳香柑橘', A], ['古龙水型', C, '青绿柑橘', G], ['古龙水型', C, '柑橘花香', F]]) {
  const o = ovl(a, b);
  L(`| ${n1} × ${n2} | ${a.length} × ${b.length} | ${inter(a, b)} | ${(o * 100).toFixed(0)}% | ${o > 0.5 ? '高度冗余' : o > 0.3 ? '中度重叠' : '可分'} |`);
}
const onlyA = A.filter((p) => !G.includes(p) && !F.includes(p) && !C.includes(p)).length;
const onlyG = G.filter((p) => !A.includes(p) && !F.includes(p) && !C.includes(p)).length;
const onlyF = F.filter((p) => !A.includes(p) && !G.includes(p) && !C.includes(p)).length;
L('');
L(`三小类"只属于自己"的瓶数（古龙水型作为竞争者一并计入）：芳香 **${onlyA}** / 青绿 **${onlyG}** / 花香 **${onlyF}**。`);
L('');

L('## 木质族内部撞形');
L('');
for (const c of CLASSES.filter((c) => c.fam === 'woody')) {
  L(`- **${c.zh}**：N=${c.N}，最近 ${c.nearest} 重叠 ${(c.maxOverlap * 100).toFixed(0)}%（交集 ${c.nearestInter} 瓶），独占率 ${(c.exclusiveRate * 100).toFixed(0)}%`);
}
L('');

L('## 按总分排序（6 项满分 30）');
L('');
L('| 排名 | 类 | 总分 | 互斥 | 同质 | 语义 | 覆盖 | 误分 | 可辨 |');
L('|---|---|---|---|---|---|---|---|---|');
[...CLASSES].sort((a, b) => b.total - a.total).forEach((c, i) => {
  L(`| ${i + 1} | ${c.famZh}·${c.zh} | **${c.total}** | ${c.S.mutual} | ${c.S.homo} | ${c.S.sem} | ${c.S.cov} | ${c.S.mis} | ${c.S.dist} |`);
});
L('');
const avg = CLASSES.reduce((a, c) => a + c.total, 0) / CLASSES.length;
L(`平均分 **${avg.toFixed(1)}/30**。≤18 分：${CLASSES.filter((c) => c.total <= 18).map((c) => `${c.zh}(${c.total})`).join('、') || '无'}`);

fs.writeFileSync(path.join(ROOT, '_audit', 'evidence5.md'), out.join('\n'), 'utf8');
fs.writeFileSync(path.join(ROOT, '_audit', 'classes.json'), JSON.stringify(CLASSES.map((c) => ({
  fam: c.fam, famZh: c.famZh, id: c.id, zh: c.zh, N: c.N, Nbroad: c.Nbroad, famN: c.famN, share: +c.share.toFixed(4),
  coreRate: +c.coreRate.toFixed(4), exclusiveRate: +c.exclusiveRate.toFixed(4),
  maxOverlap: +c.maxOverlap.toFixed(3), nearest: c.nearest, nearestInter: c.nearestInter,
  zeroNotes: c.zeroNotes, top3: c.top3, examples: c.examplesLoose,
  w1: c.w1, w05: c.w05, wLow: c.wLow, S: c.S, total: c.total,
})), null, 1), 'utf8');
console.log('evidence5.md 已生成，' + out.length + ' 行；classes.json 已写');
console.log('平均分 ' + avg.toFixed(1));
