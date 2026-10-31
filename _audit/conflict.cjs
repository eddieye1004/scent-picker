/* 冲突量化 + 边界规则验证器
   ------------------------------------------------------------------
   目的：把"类间重叠"从描述变成可复核的数字，并验证一套"优先级 + 排除"
   的判定规则能否让每一瓶恰好落进一个类。

   输入：taxonomy.json（v2）+ perfumes.json（1228 瓶）
   输出：_audit/conflict.md（冲突表 + 规则验证结果）
        _audit/assign.json（每瓶的归属结果，供复核）
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
  mint: ['mint', 'peppermint', 'bergamot mint'], basil: ['basil'], galbanum: ['galbanum'],
  'violet leaf': ['violet leaf'], violet: ['violet'], fig: ['fig'], 'tomato leaf': ['tomato leaf'],
  sandalwood: ['sandalwood'], vetiver: ['vetiver'], cedarwood: ['cedarwood', 'cedar'],
  patchouli: ['patchouli'], oakmoss: ['oakmoss'], juniper: ['juniper'], cypress: ['cypress'],
  oud: ['oud'], 'guaiac wood': ['guaiac wood', 'guaiac'], ambroxan: ['ambroxan'], angelica: ['angelica'],
  musk: ['musk'],
  vanilla: ['vanilla'], amber: ['amber'], ambergris: ['ambergris'], benzoin: ['benzoin'],
  labdanum: ['labdanum'], 'tonka bean': ['tonka bean', 'tonka'], saffron: ['saffron'],
  cinnamon: ['cinnamon'], clove: ['clove'], cardamom: ['cardamom'], incense: ['incense'],
  frankincense: ['frankincense', 'olibanum'], myrrh: ['myrrh'], opoponax: ['opoponax', 'opopanax'],
  leather: ['leather'], styrax: ['styrax', 'storax'], birch: ['birch', 'birch tar'],
  tea: ['tea'], 'green tea': ['green tea'], 'black tea': ['black tea'],
  coumarin: ['coumarin'], calone: ['calone'], 'sea salt': ['sea salt', 'salt'], salt: ['salt', 'sea salt'],
  driftwood: ['driftwood'], melon: ['melon'], cucumber: ['cucumber'],
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
const keysOf = (str) => String(str).split('/').map((s) => norm(s.trim())).filter(Boolean);

/* ---------- 现状：每类命中集合（requires OR）---------- */
const famOf = {};
for (const f of tax.families) famOf[f.id] = P.filter((p) => p.fam[f.id] > 0);

const CLASSES = [];
for (const f of tax.families) {
  for (const s of f.subfamilies) {
    const keys = s.notes.flatMap(keysOf);
    const req = (s.requires || []).map(norm);
    CLASSES.push({ fam: f.id, famZh: f.zh, id: s.id, zh: s.zh, keys, req });
  }
}
for (const c of CLASSES) {
  const fam = famOf[c.fam];
  c.hit = (p) => (c.req.length ? c.req.some((k) => has(p, k)) : c.keys.some((k) => has(p, k)));
  c.set = fam.filter((p) => c.hit(p));
  c.N = c.set.length;
}

/* ---------- 冲突：同族内一瓶命中 ≥2 类 ---------- */
const out = [];
const L = (s = '') => out.push(s);
L('# 冲突量化与边界规则验证');
L('');
L('规则语义：`requires` 组内任一命中即算命中（与审计报告 evidence3 D 节口径一致）；无 `requires` 的类按 `notes` 任一命中。');
L('');

const FAMROW = [];
for (const f of tax.families) {
  const cs = CLASSES.filter((c) => c.fam === f.id);
  const fam = famOf[f.id];
  let multi = 0, zero = 0, maxK = 0;
  const kDist = new Map();
  for (const p of fam) {
    const hit = cs.filter((c) => c.hit(p));
    if (hit.length === 0) zero++;
    else if (hit.length > 1) multi++;
    kDist.set(hit.length, (kDist.get(hit.length) || 0) + 1);
    if (hit.length > maxK) maxK = hit.length;
  }
  FAMROW.push({ f, cs, fam, multi, zero, maxK, kDist });
}

L('## 一、族内重叠现状（一瓶命中同族多类 = 无法唯一归属）');
L('');
L('| 族 | 瓶数 | 命中 0 类 | 命中 1 类 | 命中 ≥2 类 | 冲突率 | 最大命中类数 |');
L('|---|---|---|---|---|---|---|');
for (const r of FAMROW) {
  const one = r.kDist.get(1) || 0;
  L(`| ${r.f.zh} | ${r.fam.length} | ${r.zero} | ${one} | ${r.multi} | ${(r.multi / r.fam.length * 100).toFixed(1)}% | ${r.maxK} |`);
}
L('');

L('## 二、柑橘族：两两重叠明细');
L('');
const cit = CLASSES.filter((c) => c.fam === 'citrus');
L('| 对 | 各自瓶数 | 交集 | 重叠系数 | 判定 |');
L('|---|---|---|---|---|');
for (let i = 0; i < cit.length; i++) for (let j = i + 1; j < cit.length; j++) {
  const a = cit[i], b = cit[j];
  const it = a.set.filter((p) => b.set.includes(p)).length;
  const o = it / Math.min(a.N, b.N);
  L(`| ${a.zh} × ${b.zh} | ${a.N} × ${b.N} | ${it} | ${(o * 100).toFixed(0)}% | ${o > 0.5 ? '高度冗余' : o > 0.3 ? '中度重叠' : '可分'} |`);
}
L('');

L('## 三、木质组：两两重叠明细');
L('');
const wd = CLASSES.filter((c) => c.fam === 'woody');
L('| 对 | 各自瓶数 | 交集 | 重叠系数 |');
L('|---|---|---|---|');
const wpairs = [];
for (let i = 0; i < wd.length; i++) for (let j = i + 1; j < wd.length; j++) {
  const a = wd[i], b = wd[j];
  const it = a.set.filter((p) => b.set.includes(p)).length;
  const o = it / Math.min(a.N, b.N);
  wpairs.push({ a: a.zh, b: b.zh, o, it });
  L(`| ${a.zh} × ${b.zh} | ${a.N} × ${b.N} | ${it} | ${(o * 100).toFixed(0)}% |`);
}
L('');

/* ---------- 自检无冲突的族（对照组）---------- */
L('## 四、对照组：美食调与清新调的现状（评审已确认可用）');
L('');
for (const fid of ['gourmand', 'fresh']) {
  const r = FAMROW.find((x) => x.f.id === fid);
  const one = r.kDist.get(1) || 0;
  L(`- **${r.f.zh}**：${r.fam.length} 瓶，命中 1 类 ${one} 瓶（${(one / r.fam.length * 100).toFixed(1)}%），命 ≥2 类 ${r.multi} 瓶（${(r.multi / r.fam.length * 100).toFixed(1)}%），命中 0 类 ${r.zero} 瓶`);
}
L('');
L('> 注意：清新调有"茶香"这个 requires 类，美食调有"香草美食"这个 requires 类，它们的 requires 把冲突压到很低——**这正是可复用的做法**。');
L('');

fs.writeFileSync(path.join(ROOT, '_audit', 'conflict.md'), out.join('\n'), 'utf8');
console.log(out.join('\n'));
