/**
 * src/avoid-map.js — 避雷屏的映射层（元素 → 场景句 → 所属香型）
 *
 * 这张表原先住在 app.js 里叫 LIFE_NOTES（v6 的生活短语层）。
 * 第 2 步把它抽出来，是因为避雷屏和「想要」屏共用同一套场景句：
 * 屏上永远只有生活里的那个东西（「刚剥开的橘子皮」），香材 en 名
 * 只活在 notes 字段里，交给引擎。术语不上屏这条底线不变。
 *
 * 每条的 zh / hint / family / notes 与抽出来之前逐字相同；
 * 新增的 specimen 是标本风小图，复用 icon-specimen/svg 里已有的 24 枚，
 * 不新造图标。
 *
 * 两张关系表是避雷屏三条硬规则里的②和③的依据：
 *   OPPOSITE_FAMILY   —— 每个香型最对立的那一极（选古龙水型就不问厚重甜腻）；
 *   CONFUSABLE_FAMILY —— 相邻易混香型（模糊带只在这些边界上算）。
 * 配对理由写在各自注释里；改配对前先跑 scripts/test-avoid.mjs。
 */

export const AVOID_SCENARIOS = [
  /* ---- 果皮 / 明亮的开场 ---- */
  { id: 'citrus-peel', zh: '刚剥开的橘子皮', hint: '手上那一下清亮的油', family: 'citrus',
    notes: ['bergamot', 'lemon', 'grapefruit'], specimen: 'icon-specimen/svg/citrus-cologne.svg' },
  { id: 'green-twig', zh: '掐断的绿枝', hint: '断口的涩味，不是花的香', family: 'fresh',
    notes: ['violet leaf', 'galbanum', 'petitgrain'], specimen: 'icon-specimen/svg/fresh-green.svg' },
  { id: 'cold-tea', zh: '一杯放凉的茶', hint: '不甜、有一点涩', family: 'fresh',
    notes: ['green tea'], specimen: 'icon-specimen/svg/fresh-tea.svg' },
  { id: 'sea-wind', zh: '湿润的海风', hint: '空气里的水汽和一点咸', family: 'fresh',
    notes: ['marine notes'], specimen: 'icon-specimen/svg/fresh-aquatic.svg' },
  /* ---- 花 ---- */
  { id: 'rose-garden', zh: '花园里的玫瑰', hint: '花心深处那点甜', family: 'floral',
    notes: ['rose', 'peony'], specimen: 'icon-specimen/svg/floral-rose.svg' },
  { id: 'night-white', zh: '夜里开的白花', hint: '走近才有，很远也压不住', family: 'floral',
    notes: ['jasmine', 'tuberose', 'ylang-ylang'], specimen: 'icon-specimen/svg/white-floral-a.svg' },
  { id: 'osmanthus', zh: '桂花糖', hint: '秋天路边那种甜', family: 'floral',
    notes: ['osmanthus'], specimen: 'icon-specimen/svg/floral-fruity-floral.svg' },
  { id: 'lotiony-powder', zh: '奶油味的粉', hint: '爽身粉、化妆盒', family: 'floral',
    notes: ['iris', 'violet'], specimen: 'icon-specimen/svg/floral-powdery-floral.svg' },
  /* ---- 甜 / 果实 ---- */
  { id: 'ripe-peach', zh: '熟透的桃子', hint: '汁水、果皮、一点酒味', family: 'gourmand',
    notes: ['peach', 'pear', 'apple'], specimen: 'icon-specimen/svg/gourmand-fruity-gourmand.svg' },
  { id: 'vanilla-ice', zh: '香草冰淇淋', hint: '冷的时候也能闻到的甜', family: 'gourmand',
    notes: ['vanilla', 'tonka bean'], specimen: 'icon-specimen/svg/gourmand-vanilla-gourmand.svg' },
  /* ---- 木 / 地 ---- */
  { id: 'sunlit-wood', zh: '晒过的旧木头', hint: '干、暖、不甜', family: 'woody',
    notes: ['sandalwood', 'cedar'], specimen: 'icon-specimen/svg/woody-sandalwood.svg' },
  { id: 'pine-wind', zh: '松林里的风', hint: '针叶、树脂、清苦', family: 'woody',
    notes: ['juniper', 'cypress'], specimen: 'icon-specimen/svg/woody-woody.svg' },
  { id: 'after-rain', zh: '雨后的土地', hint: '湿土、苔藓、树根', family: 'woody',
    notes: ['vetiver', 'patchouli', 'oakmoss'], specimen: 'icon-specimen/svg/woody-vetiver.svg' },
  { id: 'old-medicine', zh: '古老的药木', hint: '深色木头 + 一点药味', family: 'woody',
    notes: ['oud', 'saffron'], specimen: 'icon-specimen/svg/oud-a.svg' },
  /* ---- 树脂 / 烟 ---- */
  { id: 'incense-ash', zh: '寺庙的香灰', hint: '烟散了以后留在空气里的那层', family: 'amber',
    notes: ['incense', 'myrrh', 'frankincense'], specimen: 'icon-specimen/svg/amber-incense.svg' },
  { id: 'amber-resin', zh: '琥珀色的树脂', hint: '温、稠、贴皮肤', family: 'amber',
    notes: ['amber', 'benzoin'], specimen: 'icon-specimen/svg/amber-resinous.svg' },
  { id: 'leather-sofa', zh: '皮沙发', hint: '坐久了有体温的那种皮', family: 'amber',
    notes: ['leather'], specimen: 'icon-specimen/svg/amber-leather.svg' },
  /* ---- 草本 ---- */
  { id: 'lavender-field', zh: '薰衣草田', hint: '干净、微苦、不甜', family: 'fresh',
    notes: ['lavender', 'sage'], specimen: 'icon-specimen/svg/fresh-fougere.svg' },
];

/* 规则②：最对立的那一极。三组对立都是"体感相反"而不是"名字相反"：
     柑橘（酸亮挥发）↔ 美食（厚甜贴肤）
     清新（冷绿水汽）↔ 琥珀（暖稠树脂）
     花香（花瓣展开）↔ 木质（干收敛）
   选了古龙水型（柑橘）就不问香草冰淇淋那一极 —— 它本来就不太可能
   出现在这个方向里，问了等于浪费一次点击。 */
export const OPPOSITE_FAMILY = {
  citrus: 'gourmand',
  gourmand: 'citrus',
  fresh: 'amber',
  amber: 'fresh',
  floral: 'woody',
  woody: 'floral',
};

/* 规则③：相邻易混香型。模糊带只在这些边界上算 ——
   一个元素同时高频出现在边界两侧，用户才真的分不清它算哪边，
   也才真的可能"以为选的是 A、闻到的却是 B"。
     柑橘 ↔ 清新：古龙/青绿柑橘与芳香/绿叶都"亮、干净"，最常混；
     清新 ↔ 花香：绿叶花香与茶香白花之间隔着一条很窄的线；
     花香 ↔ 美食：桂花/果甜花香与果甜美食共享"甜"的那一半；
     美食 ↔ 琥珀：香草甜与树脂甜都是暖甜，贴肤之后难分；
     琥珀 ↔ 木质：树脂暖木与干木共享木头底。 */
export const CONFUSABLE_FAMILY = {
  citrus: ['fresh'],
  fresh: ['citrus', 'floral'],
  floral: ['fresh', 'gourmand'],
  gourmand: ['floral', 'amber'],
  amber: ['gourmand', 'woody'],
  woody: ['amber'],
};
