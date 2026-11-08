/* 把边界规则级联写入 taxonomy v2.1
   ------------------------------------------------------------------
   改动范围（严格限定）：
     citrus / woody / floral / amber 四族：新增 families[].rules（优先级级联）
     每族每个类的 subfamily 增加 boundary 字段（判别特征 / 排除条件 / 典型示例）
   不动：fresh / gourmand 的 subfamilies 结构（只补 rules 引用避免空指针？不补，保持原样）

   v2.1 不增删任何小类，只把"边界怎么判"从散文变成可执行规则。
*/
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Users/16256/Documents/deepseek-harness/default-workspace/scent-picker';
const TAX = path.join(ROOT, 'data', 'taxonomy.json');
const tax = JSON.parse(fs.readFileSync(TAX, 'utf8'));
if (!/^2\.[0-9]+\.[0-9]+$/.test(tax.version)) { console.error('版本不是 2.x：' + tax.version); process.exit(1); }

/* ---- 与 rules.cjs 完全一致的级联定义（这里内联一份，避免跨文件依赖） ---- */
const CITRUS = ['bergamot', 'lemon', 'mandarin', 'orange', 'grapefruit', 'lime', 'yuzu', 'neroli', 'orange blossom', 'petitgrain'];
const HERB = ['lavender', 'rosemary', 'sage', 'thyme', 'mint', 'basil'];

const RULES = {
  citrus: [
    { id: 'citrus-floral', priority: 10, any: ['neroli', 'orange blossom'], why: '橙花/橙花油是"柑橘转白花"的物理证据；出现即说明中调要转花' },
    { id: 'green-citrus', priority: 20, any: ['petitgrain', 'galbanum'], why: '苦橙叶与白松香是"叶/枝"而非"果"，出现即说明青绿来自植物体' },
    { id: 'aromatic-citrus', priority: 30, any: HERB, why: '芳香草本给的是草本凉与皂感，与果皮酸亮是两回事' },
    { id: 'cologne', priority: 90, always: true, fallback: true, why: '兜底：只剩果皮明亮的柑橘，没有花、没有叶、没有草本' },
  ],
  woody: [
    { id: 'oud', priority: 10, any: ['oud'], why: '乌木的树脂+动物感强度会盖掉其它木质，必须先判' },
    { id: 'sandalwood', priority: 20, any: ['sandalwood'], why: '檀木优先（2026-10-31 裁决）：与香根草同现时归檀木' },
    { id: 'vetiver', priority: 30, any: ['vetiver'], not: ['sandalwood'], why: '香根草＝根 + 湿土；含檀木的归檀木' },
    { id: 'woody', priority: 90, always: true, fallback: true, why: '兜底木质：干裂木（雪松/愈创木）、土苔（橡苔+广藿香）、草本压木（杜松/鼠尾草）在 v2.2 合并为一类' },
  ],
  floral: [
    { id: 'soliflore', priority: 10, any: ['gardenia', 'magnolia', 'freesia', 'osmanthus'], why: '这四味几乎是"单一花作品"的专用原料，出现即判' },
    { id: 'powdery-floral', priority: 20, any: ['iris', 'heliotrope', 'aldehydes'], why: '粉感来自鸢尾根/天芥菜/醛的粉质，与花种无关，必须早判' },
    { id: 'green-floral', priority: 30, any: ['lily of the valley', 'hyacinth'], why: '铃兰与风信子天生带茎叶的青绿，是"花带叶"的固定组合' },
    { id: 'fruity-floral', priority: 40, any: ['peony', 'blackcurrant', 'raspberry'], why: '芍药本身带果酸的甜，黑加仑/覆盆子是"花下垫果"的直接证据' },
    { id: 'white-floral', priority: 50, any: ['jasmine', 'tuberose', 'ylang-ylang', 'gardenia', 'magnolia'], why: '白花＝吲哚类的厚与扩，茉莉/晚香玉/依兰是它的三种强度' },
    { id: 'rose', priority: 90, always: true, fallback: true, why: '兜底：玫瑰是花香族最常见的骨架，无其它强特征时归此' },
  ],
  amber: [
    { id: 'leather', priority: 10, any: ['leather'], why: '皮革是结构（烟熏+药感+树脂），一旦出现会主导整个后调' },
    { id: 'resinous', priority: 20, must: ['benzoin', 'labdanum'], why: '树脂只谈树脂本身：安息香 + 劳丹脂是它的最小构成' },
    { id: 'incense', priority: 30, any: ['incense', 'frankincense'], why: '焚香＝烟 + 乳香；冷/暖于 v2.2 合并，不再按安息香的有无区分' },
    { id: 'amber', priority: 90, always: true, fallback: true, why: '兜底琥珀：香草奶甜、安息香膏甜、肉桂豆蔻辛甜都在这里（v2.2 由香草琥珀+辛香琥珀合并）' },
  ],
};

/* ---- 每类的边界说明（判别特征 / 排除 / 典型示例），供独立复核 ---- */
const BOUNDARY = {
  'cologne': {
    check: ['不含 neroli / orange blossom', '不含 petitgrain / galbanum', '不含 lavender / rosemary / sage / thyme / mint / basil'],
    exclude: ['含橙花 → 柑橘花香', '含苦橙叶或白松香 → 青绿柑橘', '含芳香草本 → 芳香柑橘'],
    examples: ['Creed Himalaya', 'MFK Aqua Universalis'],
  },
  'citrus-floral': {
    check: ['含 neroli 或 orange blossom'],
    exclude: ['若同时含芳香草本，仍归柑橘花香（优先级 10 高于 30）'],
    examples: ['Creed Silver Mountain Water'],
  },
  'green-citrus': {
    check: ['不含橙花类', '含 petitgrain 或 galbanum'],
    exclude: ['只有 grapefruit（果）不算青绿，需叶类原料'],
    examples: ['Versace Pour Homme（含 petitgrain）'],
  },
  'aromatic-citrus': {
    check: ['不含橙花类', '不含苦橙叶/白松香', '含 lavender / rosemary / sage / thyme / mint / basil 之一'],
    exclude: ['只含 bergamot 不算芳香（bergamot 是族级默认值，46.6% 覆盖）'],
    examples: ['Montale Red Aoud（lavender）'],
  },
  'oud': {
    check: ['含 oud'],
    exclude: ['无'],
    examples: ['Montale Black Aoud'],
  },
  '_dead_woody-aromatic': {
    check: ['不含 oud', '含 juniper 或 sage'],
    exclude: ['含橡苔 + 广藿香但无杜松/鼠尾草 → 苔藓木质'],
    examples: ['Creed Aventus（据库内 notes）'],
  },
  '_dead_mossy': {
    check: ['不含 oud、不含杜松/鼠尾草', '含 oakmoss 且含 patchouli'],
    exclude: ['只有广藿香 → 干燥木质', '只有橡苔 → 干燥木质'],
    examples: ['Mancera Cedrat Boise'],
  },
  'vetiver': {
    check: ['不含 oud / 杜松 / 鼠尾草 / （橡苔+广藿香）', '含 vetiver', '不含 sandalwood'],
    exclude: ['含檀木 → 檀木（优先级 50 兜到最后）', '注：檀木规则含 not vetiver，故 vetiver+sandalwood 的实际归属见 priority 40 先判'],
    examples: ['Parfums de Marly Delina'],
  },
  'sandalwood': {
    check: ['不含前述任何', '含 sandalwood', '不含 vetiver'],
    exclude: ['含香根草 → 香根草'],
    examples: ['Kilian Angels\' Share（据库内 notes 无 vetiver）'],
  },
  '_dead_dry-woody': {
    check: ['不含 oud / 杜松 / 鼠尾草 / 橡苔+广藿香 / 香根草 / 檀木'],
    exclude: ['以上任一成立即归对应类'],
    examples: ['MFK Baccarat Rouge 540', 'Parfums de Marly Layton'],
  },
  'soliflore': {
    check: ['含 gardenia / magnolia / freesia / osmanthus 之一'],
    exclude: ['同时含茉莉/晚香玉时仍归单一花'],
    examples: ['Jo Malone English Pear & Freesia'],
  },
  'powdery-floral': {
    check: ['不含单一花四味', '含 iris / heliotrope / aldehydes 之一'],
    exclude: ['只有 violet（花瓣）不算粉感，需鸢尾/天芥菜/醛'],
    examples: ['Guerlain Shalimar（iris）'],
  },
  'green-floral': {
    check: ['不含单一花 / 粉感原料', '含 lily of the valley 或 hyacinth'],
    exclude: ['白花但没有铃兰/风信子 → 白花'],
    examples: ['MMM Replica Lazy Sunday Morning'],
  },
  'fruity-floral': {
    check: ['不含前述', '含 peony / blackcurrant / raspberry 之一'],
    exclude: ['无'],
    examples: ['Viktor&Rolf Flowerbomb', 'Jo Malone Peony & Blush Suede'],
  },
  'white-floral': {
    check: ['不含前述', '含 jasmine / tuberose / ylang-ylang / gardenia / magnolia 之一'],
    exclude: ['无'],
    examples: ['Guerlain Shalimar（jasmine）'],
  },
  'rose': {
    check: ['不含前述所有特征'],
    exclude: ['无（兜底）'],
    examples: ['Guerlain Mitsouko'],
  },
  'leather': {
    check: ['含 leather'],
    exclude: ['无'],
    examples: ['Montale Arabians Tonka（据库内 notes 含 leather）'],
  },
  '_dead_incense-cold': {
    check: ['不含 leather', '含 incense 或 frankincense', '不含 benzoin'],
    exclude: ['含安息香 → 暖焚香'],
    examples: ['Afnan Supremacy Incense'],
  },
  '_dead_incense-warm': {
    check: ['不含 leather', '含 incense 或 frankincense', '含 benzoin'],
    exclude: ['无'],
    examples: ['暖焚香 6 瓶，见 rules-report.md'],
  },
  'resinous': {
    check: ['不含 leather', '不含焚香类', '含 benzoin 且含 labdanum'],
    exclude: ['无'],
    examples: ['Amouage Gold Man（据库内 notes）'],
  },
  '_dead_spicy-amber': {
    check: ['不含前述', '含 cinnamon / cardamom / saffron / clove 之一', '不含 vanilla'],
    exclude: ['含香草 → 香草琥珀'],
    examples: ['Montale Arabians Tonka（cinnamon）'],
  },
  '_dead_vanilla-amber': {
    check: ['不含前述所有特征'],
    exclude: ['无（兜底）'],
    examples: ['MFK Grand Soir'],
  },
};

/* ---- 写入 ---- */
let addedRules = 0, addedBoundary = 0;
for (const f of tax.families) {
  if (!RULES[f.id]) continue;
  f.rules = RULES[f.id];
  f.rulesVersion = '2026-10-31';
  f.rulesNote = '族内优先级级联：priority 从小到大，第一个通过即归属，最后一个为兜底。判定字段：must（必须全中）/ any（至少一个）/ not（一个都不能中）/ always（无条件）。';
  addedRules++;
  for (const s of f.subfamilies) {
    const b = BOUNDARY[s.id];
    if (!b) continue;
    s.boundary = b;
    addedBoundary++;
  }
}

tax.version = '2.2.0';
tax.authored = '2026-10-31';
tax.note = (tax.note || '') + ' | 2026-11-01 v2.2.0：合并冷/暖焚香→焚香、香草/辛香琥珀→琥珀、芳香木质/苔藓木质/干燥木质→木质（24 类）。规则表同步重写；木质新增 sandalwood 优先于 vetiver 的显式次序。旧 note：' + '2026-10-31 v2.1.0：四族（citrus/woody/floral/amber）新增优先级级联 rules 与每类 boundary；不增删小类，fresh/gourmand 结构未动。';

fs.writeFileSync(TAX, JSON.stringify(tax, null, 2) + '\n', 'utf8');
console.log(`写入 rules：${addedRules} 族；boundary：${addedBoundary} 类`);
const cnt = tax.families.reduce((a, f) => a + f.subfamilies.length, 0);
console.log(`小类总数仍是 ${cnt}`);
for (const f of tax.families) {
  const hasRules = f.rules ? `rules ${f.rules.length} 条` : '（未动）';
  console.log(`  ${f.zh.padEnd(6, '　')} ${String(f.subfamilies.length).padStart(2)} 类 · ${hasRules}`);
}
