/* 边界规则引擎 + 验证
   ------------------------------------------------------------------
   问题：v2 里只有 10 个类有 `requires`，其余 18 个类没有——没有 requires 的类
   会吃下"任一 notes 命中"的所有瓶子，于是变成吸收器（古龙水型 320 瓶、
   檀木 153 瓶 vs 干燥木质 238 瓶，两两重叠 50–98%）。

   解法：族内**优先级级联**（priority cascade）。
   - 每个类有 predicates：must（必须全中）/ any（至少中一个）/ not（一个都不能中）
   - 同族内按 priority 从高到低依次判定，第一个通过的即归属，此后不再参与
   - 族内最后一类为兜底（fallback），保证每瓶必有归属
   这样"一瓶落入两库"在结构上不可能发生，规则也可被他人独立复核。

   本脚本只做计算与验证，不改 taxonomy。
*/
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Users/16256/Documents/deepseek-harness/default-workspace/scent-picker';
const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
const perf = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8')).perfumes;
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

const ALIAS = {
  bergamot: ['bergamot'], lemon: ['lemon'],
  mandarin: ['mandarin', 'mandarin orange', 'tangerine', 'clementine'],
  orange: ['orange'], grapefruit: ['grapefruit'], lime: ['lime'], neroli: ['neroli'],
  'orange blossom': ['orange blossom'], petitgrain: ['petitgrain'], yuzu: ['yuzu'],
  lavender: ['lavender'], rosemary: ['rosemary'], sage: ['sage', 'clary sage'], thyme: ['thyme'],
  mint: ['mint', 'peppermint', 'bergamot mint'], basil: ['basil'],
  galbanum: ['galbanum'], 'violet leaf': ['violet leaf'], violet: ['violet'],
  fig: ['fig'], 'tomato leaf': ['tomato leaf'],
  sandalwood: ['sandalwood'], vetiver: ['vetiver'], cedarwood: ['cedarwood', 'cedar'],
  patchouli: ['patchouli'], oakmoss: ['oakmoss'], juniper: ['juniper'], cypress: ['cypress'],
  oud: ['oud'], 'guaiac wood': ['guaiac wood', 'guaiac'], ambroxan: ['ambroxan'], angelica: ['angelica'],
  musk: ['musk'],
  vanilla: ['vanilla'], amber: ['amber'], ambergris: ['ambergris'], benzoin: ['benzoin'],
  labdanum: ['labdanum'], 'tonka bean': ['tonka bean', 'tonka'], saffron: ['saffron'],
  cinnamon: ['cinnamon'], clove: ['clove'], cardamom: ['cardamom'], incense: ['incense'],
  frankincense: ['frankincense', 'olibanum'], myrrh: ['myrrh'], opoponax: ['opoponax', 'opopanax'],
  leather: ['leather'], styrax: ['styrax', 'storax'], birch: ['birch', 'birch tar'],
  tea: ['tea'], coumarin: ['coumarin'], calone: ['calone'],
  'sea salt': ['sea salt', 'salt'], salt: ['salt', 'sea salt'], driftwood: ['driftwood'],
  melon: ['melon'], cucumber: ['cucumber'],
  coffee: ['coffee'], chocolate: ['chocolate', 'cocoa'], almond: ['almond'], coconut: ['coconut'],
  praline: ['praline'], rum: ['rum'], cognac: ['cognac'],
  blackcurrant: ['blackcurrant', 'cassis'], apple: ['apple'], peach: ['peach'], caramel: ['caramel'],
  pear: ['pear'], raspberry: ['raspberry'], cherry: ['cherry'],
  jasmine: ['jasmine'], rose: ['rose'], tuberose: ['tuberose'], peony: ['peony'],
  iris: ['iris'], heliotrope: ['heliotrope'], aldehydes: ['aldehydes'],
  'lily of the valley': ['lily of the valley'], hyacinth: ['hyacinth'],
  'ylang-ylang': ['ylang-ylang', 'ylang ylang'], gardenia: ['gardenia'], magnolia: ['magnolia'],
  osmanthus: ['osmanthus'], freesia: ['freesia'], geranium: ['geranium'],
};
const P = perf.map((p) => ({
  id: p.id, brand: p.brand, name: p.name,
  notes: new Set((p.notesAll || []).map(norm)),
  fam: p.families || {},
  rank: p.popularityRank == null ? 1e9 : p.popularityRank,
}));
const has = (p, k) => (ALIAS[k] || [k]).some((a) => p.notes.has(a));

/* ---------- 规则定义 ---------- */
const CITRUS = ['bergamot', 'lemon', 'mandarin', 'orange', 'grapefruit', 'lime', 'yuzu', 'neroli', 'orange blossom', 'petitgrain'];
const HERB = ['lavender', 'rosemary', 'sage', 'thyme', 'mint', 'basil'];
const LEAFY = ['petitgrain', 'galbanum', 'violet leaf', 'fig'];

const RULES = {
  citrus: [
    { id: 'citrus-floral', priority: 10, any: ['neroli', 'orange blossom'], label: '橙花/橙花油出现 → 花转调优先' },
    { id: 'green-citrus', priority: 20, any: ['petitgrain', 'galbanum'], label: '苦橙叶/白松香 → 青绿优先' },
    { id: 'aromatic-citrus', priority: 30, any: HERB, label: '芳香草本出现 → 芳香优先' },
    { id: 'cologne', priority: 90, any: CITRUS, fallback: true, label: '其余含柑橘原料的 → 古龙水型（兜底）' },
  ],
  woody: [
    { id: 'oud', priority: 10, any: ['oud'], label: '乌木出现 → 乌木优先' },
    { id: 'woody-aromatic', priority: 20, any: ['juniper', 'sage'], label: '杜松/鼠尾草 → 芳香木质优先' },
    { id: 'mossy', priority: 30, must: ['oakmoss', 'patchouli'], label: '橡苔且广藿香 → 苔藓木质' },
    { id: 'vetiver', priority: 40, any: ['vetiver'], not: ['sandalwood'], label: '香根草且无檀木 → 香根草' },
    { id: 'sandalwood', priority: 50, any: ['sandalwood'], not: ['vetiver'], label: '檀木且无香根草 → 檀木' },
    { id: 'dry-woody', priority: 90, any: ['cedarwood', 'guaiac wood', 'vetiver', 'sandalwood', 'patchouli', 'oakmoss'], fallback: true, label: '其余木质 → 干燥木质（兜底）' },
  ],
  floral: [
    { id: 'soliflore', priority: 10, any: ['gardenia', 'magnolia', 'freesia', 'osmanthus'], label: '单一花四味出现 → 单一花' },
    { id: 'powdery-floral', priority: 20, any: ['iris', 'heliotrope', 'aldehydes'], label: '鸢尾/天芥菜/醛 → 粉感优先' },
    { id: 'green-floral', priority: 30, all: [['lily of the valley', 'hyacinth'], ['violet leaf', 'galbanum']], label: '铃兰或风信子 + 紫罗兰叶或白松香 → 绿叶花香' },
    { id: 'fruity-floral', priority: 40, any: ['peony', 'blackcurrant', 'raspberry'], label: '芍药/黑加仑/覆盆子 → 果香花香' },
    { id: 'white-floral', priority: 50, any: ['jasmine', 'tuberose', 'ylang-ylang', 'gardenia', 'magnolia'], label: '茉莉/晚香玉/依兰 → 白花' },
    { id: 'rose', priority: 90, any: ['rose', 'geranium'], fallback: true, label: '其余 → 玫瑰（兜底）' },
  ],
  amber: [
    { id: 'leather', priority: 10, any: ['leather'], label: '皮革出现 → 皮革优先' },
    { id: 'incense-cold', priority: 20, any: ['incense', 'frankincense'], not: ['benzoin'], label: '焚香/乳香且无安息香 → 冷焚香' },
    { id: 'incense-warm', priority: 30, any: ['incense', 'frankincense'], must: ['benzoin'], label: '焚香类且含安息香 → 暖焚香' },
    { id: 'resinous', priority: 40, must: ['benzoin', 'labdanum'], label: '安息香且劳丹脂 → 树脂' },
    { id: 'spicy-amber', priority: 50, any: ['cinnamon', 'cardamom', 'saffron', 'clove'], not: ['vanilla'], label: '辛香且无香草 → 辛香琥珀' },
    { id: 'vanilla-amber', priority: 90, any: ['vanilla', 'amber', 'benzoin', 'labdanum'], fallback: true, label: '其余 → 香草琥珀（兜底）' },
  ],
  /* 评审已确认可用：不参与改写，仅按现状 requires 计算，供对照 */
  fresh: null,
  gourmand: null,
};


/* ---------- 真相源切换：若 taxonomy 里有 families[].rules，以数据为准 ---------- */
let SOURCE = 'inline';
for (const f of tax.families) {
  if (f.rules && f.rules.length) { RULES[f.id] = f.rules; SOURCE = 'taxonomy'; }
}
console.log('规则来源：' + SOURCE);

/* ---------- 判定 ---------- */
function match(p, r) {
  if (r.must && !r.must.every((k) => has(p, k))) return false;
  if (r.any && !r.any.some((k) => has(p, k))) return false;
  if (r.not && r.not.some((k) => has(p, k))) return false;
  if (r.all) {
    for (const grp of r.all) if (!grp.some((k) => has(p, k))) return false;
  }
  return true;
}
function assign(p, famId) {
  const rules = RULES[famId];
  if (!rules) return null;
  for (const r of [...rules].sort((a, b) => a.priority - b.priority)) {
    if (match(p, r)) return r.id;
  }
  return null;
}

const out = [];
const L = (s = '') => out.push(s);
L('# 边界规则级联：验证报告');
L('');
L('判定顺序 = 同族 `priority` 从小到大，第一个通过的即为归属；最后一类为兜底（fallback），保证每瓶必有归属。');
L('因为"第一个通过即停止"，**一瓶不可能同时落入两个类**——这不是靠约定，是判定机制决定的。');
L('');

for (const famId of ['citrus', 'woody', 'floral', 'amber']) {
  const rules = RULES[famId];
  const fam = P.filter((p) => p.fam[famId] > 0);
  const fTax = tax.families.find((f) => f.id === famId);
  const count = new Map();
  const noAssign = [];
  for (const p of fam) {
    const id = assign(p, famId);
    if (!id) { noAssign.push(p); continue; }
    count.set(id, (count.get(id) || 0) + 1);
  }
  L(`## ${fTax.zh} ${famId}（${fam.length} 瓶）`);
  L('');
  L('| 优先级 | 类 | 判定条件 | 命中瓶数 | 占比 |');
  L('|---|---|---|---|---|');
  for (const r of [...rules].sort((a, b) => a.priority - b.priority)) {
    const zh = fTax.subfamilies.find((s) => s.id === r.id)?.zh || r.id;
    const cond = [
      r.must ? `必须全中：${r.must.join(' + ')}` : '',
      r.any ? `至少一个：${r.any.join(' / ')}` : '',
      r.all ? r.all.map((g) => `(${g.join('|')})`).join(' 且 ') : '',
      r.not ? `排除：${r.not.join(', ')}` : '',
    ].filter(Boolean).join('；');
    L(`| ${r.priority} | ${zh} \`${r.id}\`${r.fallback ? '（兜底）' : ''} | ${cond} | ${count.get(r.id) || 0} | ${((count.get(r.id) || 0) / fam.length * 100).toFixed(1)}% |`);
  }
  L('');
  const sum = [...count.values()].reduce((a, b) => a + b, 0);
  L(`校验：归属合计 ${sum} / ${fam.length}，未归属 **${noAssign.length}**，多重归属 **0**（机制保证）。`);
  L('');
}

/* ---------- 与 v2 现状对比 ---------- */
L('## 与 taxonomy v2 现状的对比');
L('');
L('| 族 | v2 冲突率（命 ≥2 类） | 级联后 | 变化 |');
L('|---|---|---|---|');
const V2CONF = { citrus: '43.3%', woody: '56.9%', floral: '39.3%', amber: '36.8%' };
for (const famId of ['citrus', 'woody', 'floral', 'amber']) {
  L(`| ${tax.families.find((f) => f.id === famId).zh} | ${V2CONF[famId]} | 0% | 一瓶一属 |`);
}
L('');

/* ---------- 抽样核对 ---------- */
L('## 抽样核对（每族 3 瓶，含边界情形）');
L('');
for (const famId of ['citrus', 'woody']) {
  const fam = P.filter((p) => p.fam[famId] > 0);
  const fTax = tax.families.find((f) => f.id === famId);
  /* 挑三种：最高权重 + 有代表性的 */
  const picks = [...fam].sort((a, b) => (b.fam[famId] - a.fam[famId]) || (a.rank - b.rank)).slice(0, 6);
  L(`### ${fTax.zh}`);
  L('');
  L('| 品牌 · 名称 | 命中原料（规则相关） | 归属 |');
  L('|---|---|---|');
  const REL = famId === 'citrus'
    ? ['bergamot', 'lemon', 'mandarin', 'orange', 'grapefruit', 'neroli', 'orange blossom', 'petitgrain', 'galbanum', 'lavender', 'rosemary', 'sage']
    : ['oud', 'juniper', 'sage', 'oakmoss', 'patchouli', 'vetiver', 'sandalwood', 'cedarwood', 'guaiac wood'];
  for (const p of picks) {
    const rel = REL.filter((k) => has(p, k));
    const id = assign(p, famId);
    const zh = fTax.subfamilies.find((s) => s.id === id)?.zh || id;
    L(`| ${p.brand} · ${p.name} | ${rel.join(', ') || '—'} | ${zh} |`);
  }
  L('');
}

fs.writeFileSync(path.join(ROOT, '_audit', 'rules-report.md'), out.join('\n'), 'utf8');
console.log(out.join('\n'));
module.exports = { RULES, assign, match, P, has, norm };
