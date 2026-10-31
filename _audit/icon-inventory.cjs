/* 图标盘点：28 类 ↔ SUB_MARKS / SUB_FIT / icon-specimen/svg 三方对照
   输出 _audit/icon-inventory.md
*/
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Users/16256/Documents/deepseek-harness/default-workspace/scent-picker';
const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

function block(marker) {
  const i = app.indexOf(marker);
  const b = app.indexOf('{', i);
  let d = 0;
  for (let k = b; k < app.length; k++) {
    if (app[k] === '{') d++;
    else if (app[k] === '}') { d--; if (d === 0) return app.slice(b + 1, k); }
  }
  throw new Error('block not closed: ' + marker);
}
const marBody = block('const SUB_MARKS');
const MARKS = {};
for (const m of marBody.matchAll(/^  '?([a-z][a-z-]+)'?: \(\) => [\[{]([\s\S]*?)\n  [\]},]/gm)) {
  MARKS[m[1]] = m[2];
}
const fitBody = block('const SUB_FIT');
const FITS = {};
for (const m of fitBody.matchAll(/  '?([a-z][a-z-]+)'?: \[([^\]]*)\]/g)) FITS[m[1]] = m[2];

const out = [];
const L = (s = '') => out.push(s);
L('# 图标盘点（28 类 · taxonomy v2.1）');
L('');
L('三方对照：`taxonomy.subfamilies` id ↔ `app.js SUB_MARKS` 图形 ↔ `app.js SUB_FIT` 归一化 ↔ `icon-specimen/svg` 源文件（独立样张，非运行时依赖）。');
L('');

L('## 一、总表');
L('');
L('| # | 族 | 类 | SUB_MARKS | SUB_FIT | 图形元素数 | 状态 | 说明 |');
L('|---|---|---|---|---|---|---|---|');
const NOTES = {
  'cologne': ['保留', '柠檬 + 瓶身：柑橘族的"香水本体"意象，与 v2.1 的兜底定位一致'],
  'green-citrus': ['保留', '叶 + 果：对应 petitgrain/galbanum 的"叶"语义'],
  'citrus-floral': ['保留', '橙花 + 花瓣：对应 neroli 转调'],
  'aromatic-citrus': ['保留', '果 + 草本枝：对应 lavender/rosemary 的草本'],
  'rose': ['保留', '三层花冠：玫瑰'],
  'white-floral': ['保留', '厚瓣 + 花心：白花'],
  'fruity-floral': ['保留', '花 + 果点：花下垫果'],
  'powdery-floral': ['保留', '细瓣 + 粉点：粉感'],
  'green-floral': ['保留', '花 + 茎叶：铃兰/风信子带茎'],
  'soliflore': ['保留', '单朵花 + 花苞：一种花三个部位'],
  'sandalwood': ['保留', '木段 + 刨花：檀木'],
  'dry-woody': ['保留', '干裂方块 + 裂纹：雪松/愈创木'],
  'vetiver': ['保留', '根束 + 扎带：香根草'],
  'mossy': ['保留', '木块 + 苔簇：苔藓木质'],
  'woody-aromatic': ['保留', '木块 + 针叶：杜松/鼠尾草'],
  'oud': ['保留', '料块 + 开口年轮：乌木'],
  'vanilla-amber': ['保留', '香草荚 + 琥珀滴：香草琥珀'],
  'spicy-amber': ['保留', '八角 + 肉桂棒：辛香（v2 改名，语义未变）'],
  'incense-cold': ['保留', '三支直立线香 + 香碟：冷焚香'],
  'incense-warm': ['新设计', 'v2 新增：香锥 + 底盘 + 两道短烟（与本族其它类结构不同）'],
  'resinous': ['保留', '树脂滴 + 内裹物：树脂'],
  'leather': ['保留', '皮片 + 针脚：皮革'],
  'aquatic': ['保留', '水滴 + 涟漪：水生'],
  'green': ['保留', '三叶草：绿意'],
  'fougere': ['保留', '四叶分散 + 细茎：馥奇'],
  'tea': ['保留', '一芽两叶：茶香'],
  'vanilla-gourmand': ['保留', '香草荚 + 白花：香草美食（v2 改名，语义未变）'],
  'fruity-gourmand': ['保留', '浆果簇 + 果萼：果味美食（v2 改名，语义未变）'],
};

let n = 0;
const missing = [];
for (const f of tax.families) {
  for (const s of f.subfamilies) {
    n++;
    const hasMark = !!MARKS[s.id];
    const hasFit = !!FITS[s.id];
    const els = hasMark ? (MARKS[s.id].match(/\{ tag:/g) || []).length : 0;
    const note = NOTES[s.id] || ['（无说明）', '—'];
    if (!hasMark || !hasFit) missing.push(s.id);
    L(`| ${n} | ${f.zh} | ${s.zh} \`${s.id}\` | ${hasMark ? '✓' : '✗'} | ${hasFit ? '✓' : '✗'} | ${els} | ${note[0]} | ${note[1]} |`);
  }
}
L('');
L(`合计 ${n} 类：SUB_MARKS 齐备 ${n - missing.filter((x) => !MARKS[x]).length} / ${n}，SUB_FIT 齐备 ${n - missing.filter((x) => !FITS[x]).length} / ${n}${missing.length ? '；缺失 ' + missing.join(',') : '；无缺失'}`);

L('');
L('## 二、v2.1 相对 v2 的图标影响');
L('');
L('| 变更 | 影响 | 处理 |');
L('|---|---|---|');
L('| 无（v2.1 只加 rules 与 boundary，不增删类） | 0 枚需要重绘 | 全部保留 |');
L('| 名称变化：温暖辛香 → 辛香琥珀 | 图标语义（八角+肉桂）不变 | 保留，仅文案 |');
L('| 名称变化：香草甜 → 香草美食 | 图标语义（香草荚+白花）不变 | 保留，仅文案 |');
L('| 名称变化：果味甜 → 果味美食 | 图标语义（浆果簇）不变 | 保留，仅文案 |');

L('');
L('## 三、是否需要按新规则重设图标');
L('');
L('结论：**不需要**。v2.1 的规则只改变"瓶子归到哪一类"的判定顺序，不改变任何一类的语义外延——'
  + '每类命中的是同一批原料，图标所指的对象没有变。唯一在 v2 新增的 `incense-warm` 已在 v2 时按"香锥+底盘"重绘，与 `incense-cold` 的"三支线香"在结构上不同（同族两格不撞形）。');

fs.writeFileSync(path.join(ROOT, '_audit', 'icon-inventory.md'), out.join('\n'), 'utf8');
console.log(out.join('\n'));
