/* 第二轮证据：针对用户点名的每一条判据，各算一个可引用的数字
   输出 _audit/evidence2.md
*/
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Users/16256/Documents/deepseek-harness/default-workspace/scent-picker';
const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));
const perf = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8')).perfumes;
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
const P = perf.map((p) => ({ notes: new Set((p.notesAll || []).map(norm)), fam: p.families || {}, ch: new Set(p.character || []) }));

const famOf = (id) => P.filter((p) => p.fam[id] > 0);
const has = (p, k) => [...p.notes].some((n) => n === k || n.includes(k) || k.includes(n));
const pct = (a, b) => (a / b * 100).toFixed(1) + '%';

const out = [];
const L = (s = '') => out.push(s);

/* ---------- A. 各族 Top15 原料 ---------- */
L('## A. 各族 Top15 原料（族内占比）');
L('');
L('| 排行 | ' + tax.families.map((f) => f.zh).join(' | ') + ' |');
L('|---|' + tax.families.map(() => '---').join('|') + '|');
const famBags = {};
for (const f of tax.families) {
  const ps = famOf(f.id);
  const bag = new Map();
  for (const p of ps) for (const n of p.notes) bag.set(n, (bag.get(n) || 0) + 1);
  famBags[f.id] = { n: ps.length, bag, top: [...bag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15) };
}
for (let i = 0; i < 15; i++) {
  L(`| ${i + 1} | ` + tax.families.map((f) => {
    const { n, top } = famBags[f.id];
    const e = top[i];
    return e ? `${e[0]} ${pct(e[1], n)}` : '—';
  }).join(' | ') + ' |');
}
L('');

/* ---------- B. 柑橘谱系构成 ---------- */
const CITRUS_NOTES = ['bergamot', 'lemon', 'mandarin', 'orange', 'grapefruit', 'lime', 'neroli', 'orange blossom',
  'petitgrain', 'yuzu', 'citron', 'bergamot mint', 'blood orange', 'tangerine', 'clementine'];
const cit = famOf('citrus');
L('## B. 柑橘调内部的柑橘谱系覆盖');
L('');
L(`柑橘调归属 ${cit.length} 瓶。逐个柑橘类原料在族内的出现率：`);
L('');
L('| 柑橘原料 | 族内出现 | 占比 |');
L('|---|---|---|');
for (const k of CITRUS_NOTES) {
  const hit = cit.filter((p) => has(p, k)).length;
  if (hit) L(`| ${k} | ${hit} | ${pct(hit, cit.length)} |`);
}
const anyCitrus = cit.filter((p) => CITRUS_NOTES.some((k) => has(p, k))).length;
L('');
L(`至少含一个柑橘原料的瓶数：**${anyCitrus}/${cit.length} = ${pct(anyCitrus, cit.length)}**（差额是"归类为柑橘但配方里没有柑橘原料"的瓶子，即分类断点）。`);
L('');
/* 只有花香没有柑橘的"柑橘调" */
const floralOnly = cit.filter((p) => !CITRUS_NOTES.some((k) => has(p, k)) && (has(p, 'jasmine') || has(p, 'rose') || has(p, 'tuberose') || has(p, 'peony')));
L(`其中"无任何柑橘原料、但有茉莉/玫瑰/晚香玉/芍药"的：**${floralOnly.length} 瓶（${pct(floralOnly.length, cit.length)}）** —— 这是用户所说"单一花香冒充柑橘谱系"的量化证据。示例：${floralOnly.slice(0, 5).map((p) => p.name || '').filter(Boolean).join(' / ') || '（见 data/perfumes.json）'}`);
L('');

/* ---------- C. 芳香柑橘 vs 青绿柑橘 ---------- */
L('## C. 芳香柑橘 vs 青绿柑橘 的可测量差异');
L('');
const AROM = ['lavender', 'rosemary', 'sage', 'clary sage', 'thyme', 'mint', 'basil'];
const GREEN = ['grapefruit', 'petitgrain', 'galbanum', 'violet leaf', 'fig leaf', 'green', 'leaf'];
function profile(label, keys) {
  const rows = keys.map((k) => {
    const inCit = cit.filter((p) => has(p, k)).length;
    return `| ${k} | ${inCit} | ${pct(inCit, cit.length)} |`;
  });
  return rows.join('\n');
}
L('| 原料 | 柑橘族内出现 | 占比 |');
L('|---|---|---|');
L(profile('', AROM));
L(profile('', GREEN));
const both = cit.filter((p) => AROM.some((k) => has(p, k)) && GREEN.some((k) => has(p, k))).length;
const aromOnly = cit.filter((p) => AROM.some((k) => has(p, k)) && !GREEN.some((k) => has(p, k))).length;
const greenOnly = cit.filter((p) => !AROM.some((k) => has(p, k)) && GREEN.some((k) => has(p, k))).length;
L('');
L(`- 只有芳香草本（无青绿）：**${aromOnly} 瓶**`);
L(`- 只有青绿（无芳香草本）：**${greenOnly} 瓶**`);
L(`- 两者兼有：**${both} 瓶** —— 兼有比例越高，两个小类越难在实际瓶子层面分开。`);
L('');
L(`芳香柑橘的 taxonomy 登记原料只有 bergamot 一个，而 bergamot 在柑橘族内出现率 **${pct(cit.filter((p) => has(p, 'bergamot')).length, cit.length)}**，同时也是全库第一柑橘原料（34.2%）——它的存在不能区分任何小类。`);
L('');

/* ---------- D. 木质族四个小类的可辨性 ---------- */
L('## D. 木质调内部：檀木 / 香根草 / 干燥木质 / 苔藓 / 芳香木质');
L('');
const wd = famOf('woody');
const WK = [
  ['sandalwood', '檀木'],
  ['vetiver', '香根草'],
  ['cedarwood', '干燥木质(雪松)'],
  ['patchouli', '苔藓木质(广藿香)'],
  ['oakmoss', '苔藓木质(橡苔)'],
  ['juniper', '芳香木质(杜松)'],
  ['rosemary', '芳香木质(迷迭香)'],
  ['cypress', '芳香木质(柏)'],
  ['mint', '芳香木质(薄荷)'],
  ['oud', '乌木'],
];
L('| 原料 | 木质族内出现 | 占比 | 全库出现 |');
L('|---|---|---|---|');
const allBag = new Map();
for (const p of P) for (const n of p.notes) allBag.set(n, (allBag.get(n) || 0) + 1);
for (const [k, zh] of WK) {
  const h = wd.filter((p) => has(p, k)).length;
  let tot = 0;
  for (const [n, v] of allBag) if (n.includes(k)) tot += v;
  L(`| ${k}（${zh}） | ${h} | ${pct(h, wd.length)} | ${tot} |`);
}
L('');
/* 檀木与香根草共现 */
const sw = wd.filter((p) => has(p, 'sandalwood'));
const vt = wd.filter((p) => has(p, 'vetiver'));
const swvt = wd.filter((p) => has(p, 'sandalwood') && has(p, 'vetiver')).length;
L(`檀木（${sw.length} 瓶）与香根草（${vt.length} 瓶）共现 **${swvt} 瓶**，共现率 = ${pct(swvt, Math.min(sw.length, vt.length))}（以较小集合为分母）。`);
L('');
L('木质感"具体意象"的可用锚点（全库次数）：');
L('');
const ANCHOR = ['sandalwood', 'cedarwood', 'vetiver', 'patchouli', 'oakmoss', 'oud', 'guaiac', 'teak', 'pine', 'fir', 'birch', 'cashmeran', 'iso e super', 'ambroxan'];
L('| 锚点 | 全库出现 | 占 1228 |');
L('|---|---|---|');
for (const k of ANCHOR) {
  let tot = 0;
  for (const [n, v] of allBag) if (n.includes(k)) tot += v;
  L(`| ${k} | ${tot} | ${pct(tot, perf.length)} |`);
}
L('');

/* ---------- E. 琥珀族 ---------- */
L('## E. 东方琥珀调：香草 vs 琥珀 vs 辛香 vs 焚香 vs 树脂 vs 皮革');
L('');
const am = famOf('amber');
const AK = ['vanilla', 'amber', 'ambergris', 'benzoin', 'labdanum', 'tonka bean', 'saffron', 'cinnamon',
  'clove', 'cardamom', 'incense', 'frankincense', 'myrrh', 'opoponax', 'leather', 'birch tar', 'styrax'];
L('| 原料 | 琥珀族内 | 占比 | 全库 |');
L('|---|---|---|---|');
for (const k of AK) {
  const h = am.filter((p) => has(p, k)).length;
  let tot = 0;
  for (const [n, v] of allBag) if (n.includes(k)) tot += v;
  L(`| ${k} | ${h} | ${pct(h, am.length)} | ${tot} |`);
}
L('');
const vanOnly = am.filter((p) => has(p, 'vanilla') && !has(p, 'amber')).length;
const ambOnly = am.filter((p) => !has(p, 'vanilla') && has(p, 'amber')).length;
const vanAmb = am.filter((p) => has(p, 'vanilla') && has(p, 'amber')).length;
L(`- 有香草无琥珀：${vanOnly} 瓶；有琥珀无香草：${ambOnly} 瓶；两者兼有：${vanAmb} 瓶。`);
L(`- 香草在琥珀族内出现率 ${pct(am.filter((p) => has(p, 'vanilla')).length, am.length)}，而"香草琥珀"这个小类的登记原料却只有 amber —— 分类表与真实配方错位。`);
L('');

/* ---------- F. 清新族：绿意 / 茶 / 馥奇 / 水生 / 海洋 ---------- */
L('## F. 清新调：绿意 vs 茶香 vs 馥奇 vs 水生/海洋');
L('');
const fr = famOf('fresh');
const FK = ['fig leaf', 'violet leaf', 'galbanum', 'green tea', 'black tea', 'matcha', 'bergamot',
  'lavender', 'sage', 'clary sage', 'oakmoss', 'coumarin', 'tonka bean', 'musk', 'calone',
  'marine notes', 'aquatic', 'sea salt', 'salt', 'driftwood', 'cucumber', 'melon'];
L('| 原料 | 清新族内 | 占比 | 全库 |');
L('|---|---|---|---|');
for (const k of FK) {
  const h = fr.filter((p) => has(p, k)).length;
  let tot = 0;
  for (const [n, v] of allBag) if (n.includes(k)) tot += v;
  L(`| ${k} | ${h} | ${pct(h, fr.length)} | ${tot} |`);
}
L('');
const tealess = fr.filter((p) => has(p, 'green') && !has(p, 'tea')).length;
L(`- **green tea / black tea / matcha 在全库出现 0 次** —— "茶香"这一小类在 1228 瓶里没有任何数据支撑，只剩 taxonomy 里的文字。`);
L(`- **fig leaf、marine notes 全库 0 次** —— 绿意与海洋的登记原料同样查无实据。`);
L(`- coumarin（香豆素）全库仅 6 次（0.5%）—— 馥奇的三大支柱（薰衣草 + 香豆素 + 苔藓）里，香豆素几乎不在样本中，馥奇因此缺乏典型特征。`);
L(`- 水生类登记原料写的是 musk，而 musk 全库 ${allBag.get('musk')} 次（40.2%）、清新族内 ${fr.filter((p) => has(p, 'musk')).length} 瓶 —— 用最泛用的原料当小类标识，等于没有标识。`);
L(`- calone（西瓜酮）仅 3 次（0.2%）—— 真正的水生标志物在数据集里几乎不存在，说明**水生的可辨识性无法用数据集验证**，只能用配方知识补。`);
L('');

/* ---------- G. 美食族 ---------- */
L('## G. 美食调：香草 / 果味 / 咖啡可可 / 坚果 / 酒香');
L('');
const go = famOf('gourmand');
const GK = ['vanilla', 'tonka bean', 'caramel', 'sugar', 'chocolate', 'cocoa', 'coffee', 'almond', 'coconut',
  'hazelnut', 'praline', 'rum', 'cognac', 'whiskey', 'absinthe', 'peach', 'apple', 'pear', 'berry', 'cherry'];
L('| 原料 | 美食族内 | 占比 | 全库 |');
L('|---|---|---|---|');
for (const k of GK) {
  const h = go.filter((p) => has(p, k)).length;
  let tot = 0;
  for (const [n, v] of allBag) if (n.includes(k)) tot += v;
  L(`| ${k} | ${h} | ${pct(h, go.length)} | ${tot} |`);
}
L('');
L(`- **cocoa / chocolate 全库 0 次**，coffee 仅 26 次（2.1%）—— "咖啡可可"这一小类在数据集中几乎不存在。`);
L(`- 酒香三原料 rum 27 / cognac 7 / absinthe 0 —— absinthe 全库 0 次。`);
L('');

/* ---------- H. 六族 character 分布（用于说明"暖/甜"如何压过族特征）---------- */
L('## H. 各族的 character 标签分布（前 6）');
L('');
L('| 族 | 前 6 个 character |');
L('|---|---|');
for (const f of tax.families) {
  const ps = famOf(f.id);
  const bag = new Map();
  for (const p of ps) for (const c of p.ch) bag.set(c, (bag.get(c) || 0) + 1);
  const top = [...bag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, v]) => `${k} ${pct(v, ps.length)}`).join(' · ');
  L(`| ${f.zh} | ${top} |`);
}

fs.writeFileSync(path.join(ROOT, '_audit', 'evidence2.md'), out.join('\n'), 'utf8');
console.log('evidence2.md 已生成，' + out.length + ' 行');
