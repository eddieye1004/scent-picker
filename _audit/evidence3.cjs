/* 第三轮证据（严格版）：修掉 has() 的双向包含匹配缺陷
   ------------------------------------------------------------------
   上一轮 has(p,k) 用了 `n.includes(k) || k.includes(n)`，导致：
     · k='frankincense' 时 k.includes('incense') 成立 → 焚香被算进乳香（83 > 全库 65）
     · k='rose' 会匹配到 'rosewood'；k='salt' 会匹配 'sea salt'
   本轮改为：严格等值 + 显式别名表，并把别名表打印出来供核对。
*/
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Users/16256/Documents/deepseek-harness/default-workspace/scent-picker';
const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));
const perf = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8')).perfumes;
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

/* 别名表：一个概念 → 允许的写法（全部小写，严格等值匹配） */
const ALIAS = {
  bergamot: ['bergamot'],
  lemon: ['lemon'],
  mandarin: ['mandarin', 'mandarin orange', 'tangerine', 'clementine'],
  orange: ['orange'],
  grapefruit: ['grapefruit'],
  lime: ['lime'],
  neroli: ['neroli'],
  'orange blossom': ['orange blossom'],
  petitgrain: ['petitgrain'],
  yuzu: ['yuzu'],
  'blood orange': ['blood orange'],
  lavender: ['lavender'],
  rosemary: ['rosemary'],
  sage: ['sage', 'clary sage'],
  thyme: ['thyme'],
  mint: ['mint', 'peppermint', 'bergamot mint'],
  basil: ['basil'],
  galbanum: ['galbanum'],
  'violet leaf': ['violet leaf'],
  'fig leaf': ['fig leaf'],
  sandalwood: ['sandalwood'],
  vetiver: ['vetiver'],
  cedarwood: ['cedarwood', 'cedar'],
  patchouli: ['patchouli'],
  oakmoss: ['oakmoss'],
  juniper: ['juniper'],
  cypress: ['cypress'],
  oud: ['oud'],
  guaiac: ['guaiac', 'guaiac wood'],
  teak: ['teak'],
  pine: ['pine', 'pine needle'],
  fir: ['fir', 'balsam fir'],
  birch: ['birch', 'birch tar'],
  cashmeran: ['cashmeran'],
  'iso e super': ['iso e super'],
  ambroxan: ['ambroxan'],
  vanilla: ['vanilla'],
  amber: ['amber'],
  ambergris: ['ambergris'],
  benzoin: ['benzoin'],
  labdanum: ['labdanum'],
  'tonka bean': ['tonka bean', 'tonka'],
  saffron: ['saffron'],
  cinnamon: ['cinnamon'],
  clove: ['clove'],
  cardamom: ['cardamom'],
  incense: ['incense'],
  frankincense: ['frankincense', 'olibanum'],
  myrrh: ['myrrh'],
  opoponax: ['opoponax', 'opopanax'],
  leather: ['leather'],
  styrax: ['styrax', 'storax'],
  'green tea': ['green tea'],
  'black tea': ['black tea'],
  tea: ['tea'],
  coumarin: ['coumarin'],
  musk: ['musk'],
  calone: ['calone'],
  aquatic: ['aquatic'],
  'sea salt': ['sea salt', 'salt'],
  salt: ['salt', 'sea salt'],
  driftwood: ['driftwood'],
  cucumber: ['cucumber'],
  melon: ['melon'],
  coffee: ['coffee'],
  cocoa: ['cocoa', 'chocolate', 'cacao'],
  caramel: ['caramel'],
  sugar: ['sugar'],
  almond: ['almond'],
  coconut: ['coconut'],
  hazelnut: ['hazelnut'],
  praline: ['praline'],
  rum: ['rum'],
  cognac: ['cognac'],
  whiskey: ['whiskey', 'whisky'],
  absinthe: ['absinthe'],
  peach: ['peach'],
  apple: ['apple'],
  pear: ['pear'],
  berry: ['berry', 'blackcurrant', 'raspberry', 'strawberry', 'blackberry'],
  cherry: ['cherry'],
  jasmine: ['jasmine'],
  rose: ['rose'],
  tuberose: ['tuberose'],
  peony: ['peony'],
  iris: ['iris'],
  violet: ['violet'],
  aldehydes: ['aldehydes'],
  'lily of the valley': ['lily of the valley'],
  'ylang-ylang': ['ylang-ylang', 'ylang ylang'],
  gardenia: ['gardenia'],
  magnolia: ['magnolia'],
  osmanthus: ['osmanthus'],
  freesia: ['freesia'],
  'pink pepper': ['pink pepper'],
  pepper: ['pepper', 'black pepper'],
  cardamomm: ['cardamom']
};

const P = perf.map((p) => ({
  id: p.id, name: p.name, brand: p.brand,
  notes: new Set((p.notesAll || []).map(norm)),
  fam: p.families || {},
  ch: new Set(p.character || []),
}));

function has(p, key) {
  const al = ALIAS[key] || [key];
  for (const a of al) if (p.notes.has(a)) return true;
  return false;
}
const famOf = (id) => P.filter((p) => p.fam[id] > 0);
const pct = (a, b) => (b ? (a / b * 100).toFixed(1) + '%' : '—');

const allBag = new Map();
for (const p of P) for (const n of p.notes) allBag.set(n, (allBag.get(n) || 0) + 1);
const globalCount = (key) => {
  const al = ALIAS[key] || [key];
  let s = 0;
  for (const a of al) s += allBag.get(a) || 0;
  return s;
};

const out = [];
const L = (s = '') => out.push(s);

L('# 严格匹配版证据（v3）');
L('');
L('修正说明：v2 的 `has()` 用了双向包含匹配，导致 `frankincense` 被 `incense` 反吞（族内 83 > 全库 65）、`rose` 会命中 `rosewood`、`salt` 会命中 `sea salt`。v3 改为**严格等值 + 显式别名表**，下表所有数字均为修正值，可复跑 `_audit/evidence3.cjs`。');
L('');

/* —— A. 柑橘族 —— */
const cit = famOf('citrus');
L(`## A. 柑橘调（citrus，${cit.length} 瓶）`);
L('');
L('| 柑橘原料 | 族内 | 占比 | 全库 |');
L('|---|---|---|---|');
const CIT = ['bergamot', 'lemon', 'mandarin', 'orange', 'blood orange', 'grapefruit', 'lime', 'yuzu', 'neroli', 'orange blossom', 'petitgrain'];
for (const k of CIT) {
  const h = cit.filter((p) => has(p, k)).length;
  L(`| ${k} | ${h} | ${pct(h, cit.length)} | ${globalCount(k)} |`);
}
const anyCit = cit.filter((p) => CIT.some((k) => has(p, k))).length;
L('');
L(`含至少一个柑橘原料：**${anyCit}/${cit.length} = ${pct(anyCit, cit.length)}**；无柑橘原料：**${cit.length - anyCit} 瓶（${pct(cit.length - anyCit, cit.length)}）**。`);
L('');
L('柑橘族里的非柑橘原料（说明"花压过柑橘"）：');
L('');
L('| 原料 | 族内 | 占比 |');
L('|---|---|---|');
for (const k of ['rose', 'jasmine', 'tuberose', 'peony', 'musk', 'vanilla', 'patchouli', 'cedarwood']) {
  const h = cit.filter((p) => has(p, k)).length;
  L(`| ${k} | ${h} | ${pct(h, cit.length)} |`);
}
L('');
const floralMask = cit.filter((p) => !CIT.some((k) => has(p, k)) && ['rose', 'jasmine', 'tuberose', 'peony'].some((k) => has(p, k)));
L(`**无柑橘原料但有花香主干：${floralMask.length} 瓶（${pct(floralMask.length, cit.length)}）** —— 示例（前 6）：${floralMask.slice(0, 6).map((p) => `${p.brand} ${p.name}`).join('；')}`);
L('');
L('芳香草本 vs 青绿：');
L('');
L('| 原料 | 柑橘族内 | 占比 |');
L('|---|---|---|');
for (const k of ['lavender', 'rosemary', 'sage', 'thyme', 'mint', 'basil', 'grapefruit', 'petitgrain', 'galbanum', 'violet leaf', 'fig leaf']) {
  const h = cit.filter((p) => has(p, k)).length;
  L(`| ${k} | ${h} | ${pct(h, cit.length)} |`);
}
const AROM = ['lavender', 'rosemary', 'sage', 'thyme', 'mint', 'basil'];
const GRN = ['grapefruit', 'petitgrain', 'galbanum', 'violet leaf', 'fig leaf'];
const aromOnly = cit.filter((p) => AROM.some((k) => has(p, k)) && !GRN.some((k) => has(p, k))).length;
const greenOnly = cit.filter((p) => !AROM.some((k) => has(p, k)) && GRN.some((k) => has(p, k))).length;
const both = cit.filter((p) => AROM.some((k) => has(p, k)) && GRN.some((k) => has(p, k))).length;
const neither = cit.filter((p) => !AROM.some((k) => has(p, k)) && !GRN.some((k) => has(p, k))).length;
L('');
L(`- 只有芳香草本：${aromOnly} 瓶（${pct(aromOnly, cit.length)}）`);
L(`- 只有青绿：${greenOnly} 瓶（${pct(greenOnly, cit.length)}）`);
L(`- 两者兼有：${both} 瓶（${pct(both, cit.length)}）`);
L(`- 两者都无：${neither} 瓶（${pct(neither, cit.length)}）`);
L('');

/* —— B. 木质族 —— */
const wd = famOf('woody');
L(`## B. 木质调（woody，${wd.length} 瓶）`);
L('');
L('| 原料 | 族内 | 占比 | 全库 |');
L('|---|---|---|---|');
for (const k of ['sandalwood', 'vetiver', 'cedarwood', 'patchouli', 'oakmoss', 'juniper', 'rosemary', 'cypress', 'mint', 'oud', 'guaiac', 'teak', 'pine', 'fir', 'birch', 'cashmeran', 'iso e super', 'ambroxan']) {
  const h = wd.filter((p) => has(p, k)).length;
  L(`| ${k} | ${h} | ${pct(h, wd.length)} | ${globalCount(k)} |`);
}
const sw = wd.filter((p) => has(p, 'sandalwood')).length;
const vt = wd.filter((p) => has(p, 'vetiver')).length;
const swvt = wd.filter((p) => has(p, 'sandalwood') && has(p, 'vetiver')).length;
const cd = wd.filter((p) => has(p, 'cedarwood')).length;
const cdsm = wd.filter((p) => has(p, 'cedarwood') && has(p, 'sandalwood')).length;
const cdvt = wd.filter((p) => has(p, 'cedarwood') && has(p, 'vetiver')).length;
L('');
L(`- 檀木 ${sw} 瓶 · 香根草 ${vt} 瓶 · 雪松 ${cd} 瓶`);
L(`- 檀木×香根草共现 **${swvt}** 瓶（${pct(swvt, Math.min(sw, vt))} of 较小集合）`);
L(`- 雪松×檀木共现 **${cdsm}** 瓶（${pct(cdsm, Math.min(cd, sw))}）；雪松×香根草共现 **${cdvt}** 瓶（${pct(cdvt, Math.min(cd, vt))}）`);
L('');

/* —— C. 琥珀族 —— */
const am = famOf('amber');
L(`## C. 东方琥珀调（amber，${am.length} 瓶）`);
L('');
L('| 原料 | 族内 | 占比 | 全库 |');
L('|---|---|---|---|');
for (const k of ['vanilla', 'amber', 'ambergris', 'benzoin', 'labdanum', 'tonka bean', 'saffron', 'cinnamon', 'clove', 'cardamom', 'incense', 'frankincense', 'myrrh', 'opoponax', 'styrax', 'leather', 'birch']) {
  const h = am.filter((p) => has(p, k)).length;
  L(`| ${k} | ${h} | ${pct(h, am.length)} | ${globalCount(k)} |`);
}
const van = am.filter((p) => has(p, 'vanilla')).length;
const amb = am.filter((p) => has(p, 'amber')).length;
const vanAmb = am.filter((p) => has(p, 'vanilla') && has(p, 'amber')).length;
L('');
L(`- 香草 ${van} 瓶（${pct(van, am.length)}）· 琥珀（含 ambergris）${amb} 瓶（${pct(amb, am.length)}）· 两者兼有 ${vanAmb} 瓶`);
L(`- 焚香类（incense / frankincense / myrrh 任一）：${am.filter((p) => ['incense', 'frankincense', 'myrrh'].some((k) => has(p, k))).length} 瓶`);
L(`- 树脂类（benzoin / labdanum / opoponax / styrax 任一）：${am.filter((p) => ['benzoin', 'labdanum', 'opoponax', 'styrax'].some((k) => has(p, k))).length} 瓶`);
L(`- 皮革：${am.filter((p) => has(p, 'leather')).length} 瓶（${pct(am.filter((p) => has(p, 'leather')).length, am.length)}）；桦木焦油：${am.filter((p) => has(p, 'birch')).length} 瓶`);
L(`- 辛香类（saffron / cinnamon / clove / cardamom 任一）：${am.filter((p) => ['saffron', 'cinnamon', 'clove', 'cardamom'].some((k) => has(p, k))).length} 瓶`);
L('');

/* —— D. 清新族 —— */
const fr = famOf('fresh');
L(`## D. 清新调（fresh，${fr.length} 瓶）`);
L('');
L('| 原料 | 族内 | 占比 | 全库 |');
L('|---|---|---|---|');
for (const k of ['fig leaf', 'violet leaf', 'galbanum', 'green tea', 'black tea', 'tea', 'lavender', 'sage', 'oakmoss', 'coumarin', 'tonka bean', 'musk', 'calone', 'aquatic', 'sea salt', 'driftwood', 'cucumber', 'melon']) {
  const h = fr.filter((p) => has(p, k)).length;
  L(`| ${k} | ${h} | ${pct(h, fr.length)} | ${globalCount(k)} |`);
}
const greenTea = P.filter((p) => has(p, 'green tea') || has(p, 'black tea') || has(p, 'tea')).length;
L('');
L(`- 全库含茶（green tea / black tea / tea 任一）：**${greenTea} 瓶（${pct(greenTea, P.length)}）**`);
L(`- 清新族内"有绿无茶"：${fr.filter((p) => (has(p, 'fig leaf') || has(p, 'violet leaf') || has(p, 'galbanum')) && !has(p, 'tea') && !has(p, 'green tea') && !has(p, 'black tea')).length} 瓶`);
L(`- 清新族内"有茶无绿"：${fr.filter((p) => (has(p, 'green tea') || has(p, 'black tea')) && !(has(p, 'fig leaf') || has(p, 'violet leaf') || has(p, 'galbanum'))).length} 瓶`);
L(`- 馥奇三要素齐备（lavender + oakmoss + coumarin/tonka）：**${fr.filter((p) => has(p, 'lavender') && has(p, 'oakmoss') && (has(p, 'coumarin') || has(p, 'tonka bean'))).length} 瓶**`);
L(`- 只缺香豆素（lavender + oakmoss 但无 coumarin/tonka）：${fr.filter((p) => has(p, 'lavender') && has(p, 'oakmoss') && !has(p, 'coumarin') && !has(p, 'tonka bean')).length} 瓶`);
L(`- 水生信号（calone / aquatic / sea salt / driftwood 任一）：${fr.filter((p) => ['calone', 'aquatic', 'sea salt', 'driftwood'].some((k) => has(p, k))).length} 瓶（${pct(fr.filter((p) => ['calone', 'aquatic', 'sea salt', 'driftwood'].some((k) => has(p, k))).length, fr.length)}）`);
L('');

/* —— E. 美食族 —— */
const go = famOf('gourmand');
L(`## E. 美食调（gourmand，${go.length} 瓶）`);
L('');
L('| 原料 | 族内 | 占比 | 全库 |');
L('|---|---|---|---|');
for (const k of ['vanilla', 'tonka bean', 'caramel', 'sugar', 'coffee', 'cocoa', 'almond', 'coconut', 'hazelnut', 'praline', 'rum', 'cognac', 'whiskey', 'absinthe', 'peach', 'apple', 'pear', 'berry', 'cherry']) {
  const h = go.filter((p) => has(p, k)).length;
  L(`| ${k} | ${h} | ${pct(h, go.length)} | ${globalCount(k)} |`);
}
L('');
L(`- 香草：${go.filter((p) => has(p, 'vanilla')).length} 瓶（${pct(go.filter((p) => has(p, 'vanilla')).length, go.length)}）`);
L(`- 咖啡或可可（coffee/cocoa/chocolate）：${go.filter((p) => has(p, 'coffee') || has(p, 'cocoa')).length} 瓶（${pct(go.filter((p) => has(p, 'coffee') || has(p, 'cocoa')).length, go.length)}）`);
L(`- 酒类（rum/cognac/whiskey/absinthe）：${go.filter((p) => ['rum', 'cognac', 'whiskey', 'absinthe'].some((k) => has(p, k))).length} 瓶（${pct(go.filter((p) => ['rum', 'cognac', 'whiskey', 'absinthe'].some((k) => has(p, k))).length, go.length)}）`);
L('');

/* —— F. 花香族各小类 —— */
const fl = famOf('floral');
L(`## F. 花香调（floral，${fl.length} 瓶）`);
L('');
L('| 原料 | 族内 | 占比 | 全库 |');
L('|---|---|---|---|');
for (const k of ['rose', 'jasmine', 'tuberose', 'peony', 'iris', 'violet', 'aldehydes', 'lily of the valley', 'ylang-ylang', 'gardenia', 'magnolia', 'osmanthus', 'freesia', 'musk', 'vanilla']) {
  const h = fl.filter((p) => has(p, k)).length;
  L(`| ${k} | ${h} | ${pct(h, fl.length)} | ${globalCount(k)} |`);
}
L('');

/* —— G. 族间 Jaccard（严格词表版本，Top40）—— */
const FAM = tax.families.map((f) => f.id);
const topNotes = {};
for (const f of FAM) {
  const ps = famOf(f);
  const bag = new Map();
  for (const p of ps) for (const n of p.notes) bag.set(n, (bag.get(n) || 0) + 1);
  topNotes[f] = [...bag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map((x) => x[0]);
}
L('## G. 族间 Top40 原料词表 Jaccard（严格等值，越高越难分）');
L('');
L('| | ' + FAM.join(' | ') + ' |');
L('|---|' + FAM.map(() => '---').join('|') + '|');
for (const a of FAM) {
  L(`| **${a}** | ` + FAM.map((b) => {
    if (a === b) return '—';
    const A = new Set(topNotes[a]), B = new Set(topNotes[b]);
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    return (inter / (A.size + B.size - inter)).toFixed(2);
  }).join(' | ') + ' |');
}
L('');
L('各族 Top40 词表如下（用于判断"共享词"具体是哪些）：');
L('');
for (const f of FAM) L(`- **${f}**：${topNotes[f].slice(0, 20).join(', ')}`);
L('');

fs.writeFileSync(path.join(ROOT, '_audit', 'evidence3.md'), out.join('\n'), 'utf8');
console.log('evidence3.md 已生成，' + out.length + ' 行');
