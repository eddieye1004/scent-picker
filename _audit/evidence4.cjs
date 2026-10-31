/* 第四轮：为每条诊断补一个"可直接写进判定依据"的实例清单
   输出 _audit/evidence4.md
*/
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Users/16256/Documents/deepseek-harness/default-workspace/scent-picker';
const perf = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8')).perfumes;
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
const P = perf.map((p) => ({
  id: p.id, name: p.name, brand: p.brand,
  notes: new Set((p.notesAll || []).map(norm)),
  top: (p.top || []).map(norm), heart: (p.heart || []).map(norm), base: (p.base || []).map(norm),
  fam: p.families || {}, ch: p.character || [], rank: p.popularityRank,
}));
const has = (p, k) => p.notes.has(k);
const pct = (a, b) => (b ? (a / b * 100).toFixed(1) + '%' : '—');
const out = [];
const L = (s = '') => out.push(s);

L('# 实例清单（用于逐条判定依据）');
L('');

/* 1. 柑橘族里"没有柑橘"的 95 瓶，按 families 权重看 citrus 是不是主族 */
const CIT = ['bergamot', 'lemon', 'mandarin', 'orange', 'blood orange', 'grapefruit', 'lime', 'yuzu', 'neroli', 'orange blossom', 'petitgrain'];
const cit = P.filter((p) => p.fam.citrus > 0);
const noCit = cit.filter((p) => !CIT.some((k) => has(p, k)));
const citDom = noCit.filter((p) => p.fam.citrus >= 0.99).length;
const citMinor = noCit.filter((p) => p.fam.citrus < 0.5).length;
L('## 1. 归为柑橘但无任何柑橘原料的瓶子');
L('');
L(`- 总数 ${noCit.length} / 425（${pct(noCit.length, 425)}）`);
L(`- 其中 citrus 权重 = 1.00（绝对主族）的：**${citDom} 瓶**`);
L(`- 其中 citrus 权重 < 0.50（更像混族）的：**${citMinor} 瓶**`);
L('');
L('按 citrus 权重排序的前 12 瓶（权重越高，分类越"自信"，但配方里越没有柑橘）：');
L('');
L('| 品牌 | 名称 | citrus 权重 | 其它族权重 | top 三味 |');
L('|---|---|---|---|---|');
const sorted = [...noCit].sort((a, b) => b.fam.citrus - a.fam.citrus);
for (const p of sorted.slice(0, 12)) {
  const other = Object.entries(p.fam).filter(([k]) => k !== 'citrus' && p.fam[k] > 0).map(([k, v]) => `${k} ${v}`).join(' / ') || '—';
  L(`| ${p.brand} | ${p.name} | ${p.fam.citrus} | ${other} | ${p.top.slice(0, 3).join(', ') || '—'} |`);
}
L('');

/* 2. 芳香柑橘 vs 青绿柑橘 的实例 */
const AROM = ['lavender', 'rosemary', 'sage', 'thyme', 'mint', 'basil'];
const GRN = ['grapefruit', 'petitgrain', 'galbanum', 'violet leaf', 'fig leaf'];
L('## 2. 芳香柑橘 / 青绿柑橘 的实例分布');
L('');
const aOnly = cit.filter((p) => AROM.some((k) => has(p, k)) && !GRN.some((k) => has(p, k)));
const gOnly = cit.filter((p) => !AROM.some((k) => has(p, k)) && GRN.some((k) => has(p, k)));
L(`- 只有芳香草本 ${aOnly.length} 瓶，示例：${aOnly.slice(0, 8).map((p) => `${p.brand} ${p.name}`).join('；')}`);
L(`- 只有青绿 ${gOnly.length} 瓶，示例：${gOnly.slice(0, 8).map((p) => `${p.brand} ${p.name}`).join('；')}`);
L('');

/* 3. 木质四类的实例：谁和谁撞 */
const wd = P.filter((p) => p.fam.woody > 0);
L('## 3. 木质调内部撞形实例');
L('');
function show(label, cond, n = 6) {
  const list = wd.filter(cond);
  L(`**${label}（${list.length} 瓶）**：${list.slice(0, n).map((p) => `${p.brand} ${p.name}`).join('；') || '—'}`);
  L('');
}
show('檀木 + 香根草同时出现', (p) => has(p, 'sandalwood') && has(p, 'vetiver'));
show('雪松 + 香根草同时出现', (p) => has(p, 'cedarwood') && has(p, 'vetiver'));
show('雪松 + 檀木同时出现', (p) => has(p, 'cedarwood') && has(p, 'sandalwood'));
show('芳香木质四味（juniper/rosemary/cypress/mint）一个都没有', (p) => !['juniper', 'rosemary', 'cypress', 'mint'].some((k) => has(p, k)));
L('木质族 534 瓶中，"芳香木质"四味至少含一个的瓶子：' + wd.filter((p) => ['juniper', 'rosemary', 'cypress', 'mint'].some((k) => has(p, k))).length + ` 瓶（${pct(wd.filter((p) => ['juniper', 'rosemary', 'cypress', 'mint'].some((k) => has(p, k))).length, wd.length)}）`);
L('');

/* 4. 琥珀族：香草 vs 琥珀 的实例 */
const am = P.filter((p) => p.fam.amber > 0);
L('## 4. 东方琥珀调：香草已压过琥珀');
L('');
const vanHeavy = am.filter((p) => has(p, 'vanilla') && !has(p, 'amber'));
L(`**有香草无琥珀（${vanHeavy.length} 瓶）**：${vanHeavy.slice(0, 8).map((p) => `${p.brand} ${p.name}`).join('；')}`);
L('');
const ambHeavy = am.filter((p) => !has(p, 'vanilla') && has(p, 'amber'));
L(`**有琥珀无香草（${ambHeavy.length} 瓶）**：${ambHeavy.slice(0, 8).map((p) => `${p.brand} ${p.name}`).join('；')}`);
L('');
L('小类"香草琥珀"的登记原料只有 amber，而族内香草出现率 43.7% > 琥珀 28.1% —— 名称与实际配方的主次颠倒。');
L('');

/* 5. 清新族：茶与绿、馥奇与水生 */
const fr = P.filter((p) => p.fam.fresh > 0);
L('## 5. 清新调：茶 / 绿 / 馥奇 / 水生');
L('');
const teaBottles = P.filter((p) => has(p, 'tea') || has(p, 'green tea') || has(p, 'black tea'));
L(`**含茶（tea / green tea / black tea）全库 ${teaBottles.length} 瓶**：${teaBottles.slice(0, 10).map((p) => `${p.brand} ${p.name}`).join('；')}`);
L('');
const fougereFull = fr.filter((p) => has(p, 'lavender') && has(p, 'oakmoss') && (has(p, 'coumarin') || has(p, 'tonka bean')));
L(`**馥奇三要素齐备（${fougereFull.length} 瓶）**：${fougereFull.map((p) => `${p.brand} ${p.name}`).join('；') || '—'}`);
L('');
const aqua = fr.filter((p) => ['calone', 'aquatic', 'sea salt', 'driftwood'].some((k) => has(p, k)));
L(`**水生信号（${aqua.length} 瓶）**：${aqua.map((p) => `${p.brand} ${p.name}`).join('；') || '—'}`);
L('');
L(`**含 musk 的清新族**：${fr.filter((p) => has(p, 'musk')).length} 瓶（${pct(fr.filter((p) => has(p, 'musk')).length, fr.length)}）—— musk 不能作为水生的标识；实际水生信号只有 ${aqua.length} 瓶（${pct(aqua.length, fr.length)}）。`);
L('');

/* 6. 美食族：香草美食 vs 香草浓度 */
const go = P.filter((p) => p.fam.gourmand > 0);
L('## 6. 美食调：香草形象');
L('');
L(`族内香草 ${go.filter((p) => has(p, 'vanilla')).length} 瓶（${pct(go.filter((p) => has(p, 'vanilla')).length, go.length)}）；其中同时有 tonka bean 的 ${go.filter((p) => has(p, 'vanilla') && has(p, 'tonka bean')).length} 瓶。`);
L('');
const goVanOnly = go.filter((p) => has(p, 'vanilla') && !has(p, 'caramel') && !has(p, 'sugar') && !has(p, 'chocolate') && !has(p, 'cocoa'));
L(`**只有香草、无焦糖/糖/可可（${goVanOnly.length} 瓶）**：${goVanOnly.slice(0, 8).map((p) => `${p.brand} ${p.name}`).join('；')}`);
L('');

/* 7. 花香族：小类代表性原料的实际覆盖率再核一遍（严格匹配） */
const fl = P.filter((p) => p.fam.floral > 0);
L('## 7. 花香调 7 个小类的登记原料覆盖率（严格匹配）');
L('');
L('| 小类 | 登记原料 | 族内命中 | 覆盖率 |');
L('|---|---|---|---|');
const FLMAP = [
  ['rose', ['rose']], ['white-floral', ['jasmine', 'tuberose']], ['fruity-floral', ['peony']],
  ['powdery-floral', ['iris', 'violet', 'aldehydes']], ['green-floral', ['lily of the valley']],
  ['yellow-floral', ['ylang-ylang']], ['soliflore', ['gardenia', 'magnolia', 'freesia', 'osmanthus']],
];
for (const [id, notes] of FLMAP) {
  const hit = fl.filter((p) => notes.some((k) => has(p, k))).length;
  L(`| ${id} | ${notes.join(', ')} | ${hit}/${fl.length} | ${pct(hit, fl.length)} |`);
}

fs.writeFileSync(path.join(ROOT, '_audit', 'evidence4.md'), out.join('\n'), 'utf8');
console.log('evidence4.md 已生成，' + out.length + ' 行');
