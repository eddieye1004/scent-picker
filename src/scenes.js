/**
 * scenes.js — 生活情景表：用「你闻过的东西」代替「香调名」
 *
 * v3 的硬底线是**全程不出现香调术语题**。旧版的「想要的味道 / 受不了的味道」
 * 两屏是 58 个香调名的 chip 墙 —— 对零基础的人，那是一道术语测验，
 * 而且它恰好出现在第 2、3 屏，用户还没进入状态就被要求认词。
 *
 * 这里不改判断逻辑，只改**提问语言**：每一格写成一件具体的、闻过的东西，
 * 背后挂到仓库里**已经存在的**那批香调（data/taxonomy.json 的 noteIndex，
 * 经 src/notes.js 的 usableEntries 滤掉 0 命中的死选项）。
 * 用户点的是「刚剥开的橘子皮」，引擎收到的仍是 bergamot / lemon / grapefruit。
 *
 * 三条自律：
 *  1. **不发明香调**：每格 notes 里的字符串必须逐字出现在 taxonomy.noteIndex 里，
 *     scripts/test-render.mjs 有一条断言逐项核对（写错一个字符就红）。
 *  2. **一格不超过 4 味**：多了等于把整族塞进一个按钮，用户点它跟点「我全都要」
 *     没区别，区分度会掉光。
 *  3. **文案不写比喻链**：写"像刚剥开的橘子皮"，不写"如同被阳光亲吻的柑橘园"。
 *     后者是营销句，不是辨认线索。
 */

/* 想要的气味：12 格，覆盖六个族。
   `family` 只用于环境线推一点色温（不参与打分），
   `push` 是推的量（-1..1 的两轴），刻意小 —— 它是细调。 */
export const LIKED_SCENES = [
  {
    id: 'peel-citrus', zh: '刚剥开的橘子皮', family: 'citrus',
    plain: '明亮的果皮味，一进门就闻得到，散得也快',
    notes: ['bergamot', 'lemon', 'grapefruit'],
    push: { temp: -0.7, light: 0.5 },
  },
  {
    id: 'white-shirt', zh: '刚洗完澡的白衬衫', family: 'fresh',
    plain: '皂感、干净的皮肤味，不甜也不冲',
    notes: ['musk', 'aldehydes', 'neroli / orange blossom'],
    push: { temp: -0.5, light: 0.5 },
  },
  {
    id: 'iced-tea', zh: '一杯加冰的柠檬茶', family: 'fresh',
    plain: '茶底压着柠檬，凉，喝下去很清醒',
    notes: ['green tea', 'lemon', 'bergamot'],
    push: { temp: -0.6, light: 0.4 },
  },
  {
    id: 'sea-wind', zh: '海风和水汽', family: 'fresh',
    plain: '咸的、湿的，像泳池边晒干的毛巾',
    notes: ['marine notes', 'calone', 'musk'],
    push: { temp: -0.5, light: 0.3 },
  },
  {
    id: 'cut-grass', zh: '刚剪过的草地', family: 'fresh',
    plain: '青草被切断时那股生涩的绿，不是花香',
    notes: ['galbanum', 'violet leaf', 'fig leaf'],
    push: { temp: -0.6, light: 0.0 },
  },
  {
    id: 'window-flowers', zh: '晾在窗边的白花', family: 'floral',
    plain: '厚花瓣的甜香，晚上比白天明显',
    notes: ['jasmine', 'tuberose', 'lily of the valley'],
    push: { temp: 0.1, light: -0.1 },
  },
  {
    id: 'rose-garden', zh: '一整枝玫瑰', family: 'floral',
    plain: '带叶子的玫瑰，不是玫瑰香精',
    notes: ['rose', 'peony', 'magnolia'],
    push: { temp: 0.0, light: 0.0 },
  },
  {
    id: 'sunlit-wood', zh: '晒过太阳的木头', family: 'woody',
    plain: '干、暖、有一点粉尘感，像老家具',
    notes: ['cedar', 'sandalwood'],
    push: { temp: 0.4, light: 0.2 },
  },
  {
    id: 'wet-forest', zh: '雨后的土和树根', family: 'woody',
    plain: '湿土、苔藓、压碎的叶子，偏苦',
    notes: ['vetiver', 'oakmoss', 'patchouli'],
    push: { temp: 0.0, light: -0.2 },
  },
  {
    id: 'incense-temple', zh: '庙里的焚香', family: 'amber',
    plain: '烟、树脂、慢慢升上去的那种暖',
    notes: ['incense', 'myrrh', 'frankincense'],
    push: { temp: 0.6, light: -0.5 },
  },
  {
    id: 'old-leather', zh: '旧皮手套和书页', family: 'amber',
    plain: '干皮革的味道，压得住场，不甜',
    notes: ['leather', 'saffron', 'cedar'],
    push: { temp: 0.5, light: -0.4 },
  },
  {
    id: 'vanilla-ice', zh: '香草冰淇淋', family: 'gourmand',
    plain: '甜、奶、带一点香草籽的苦尾',
    notes: ['vanilla', 'tonka bean', 'caramel'],
    push: { temp: 0.5, light: 0.1 },
  },
  {
    id: 'coffee-cocoa', zh: '咖啡和烤过的坚果', family: 'gourmand',
    plain: '焦苦、微甜，不腻的那种甜',
    notes: ['coffee', 'almond', 'tonka bean'],
    push: { temp: 0.4, light: -0.2 },
  },
  {
    id: 'ripe-peach', zh: '熟透的桃子', family: 'gourmand',
    plain: '果肉很软、很甜，带一点酒气',
    notes: ['peach', 'pear', 'rum'],
    push: { temp: 0.2, light: 0.1 },
  },
];

/* 不想靠近的气味：10 格。这一题在旧版是"更有效的那个"（排除比喜欢更能收窄），
   所以格数不必与上一屏对齐 —— 它是排除清单，不是对称的另一半。
   文案要用**具体的反感点**（甜到发腻、像药水），不要写"不喜欢浓郁"。 */
export const AVOID_SCENES = [
  {
    id: 'too-sweet', zh: '甜到发腻的糖味', plain: '像打翻的糖浆，闻久了头晕',
    notes: ['vanilla', 'caramel', 'tonka bean'],
  },
  {
    id: 'soapy', zh: '洗衣粉那种皂感', plain: '干净到发假，像刚拆封的洗衣液',
    notes: ['aldehydes', 'musk'],
  },
  {
    id: 'heavy-flower', zh: '闷人的浓白花', plain: '花瓣太厚，密闭空间里压人',
    notes: ['tuberose', 'jasmine', 'gardenia'],
  },
  {
    id: 'talc', zh: '爽身粉的粉味', plain: '干、粉、像旧化妆盒',
    notes: ['iris', 'violet', 'aldehydes'],
  },
  {
    id: 'smoke', zh: '烟熏火燎', plain: '像烧过的木头或熏肉，呛',
    notes: ['incense', 'myrrh', 'oakmoss'],
  },
  {
    id: 'leather-med', zh: '药味和皮革', plain: '像药箱或旧沙发，有点冲鼻',
    notes: ['leather', 'saffron', 'oud'],
  },
  {
    id: 'syrup-fruit', zh: '果酱一样的甜', plain: '糖水煮过的水果，齁',
    notes: ['peach', 'apple', 'pear'],
  },
  {
    id: 'herbal-medicine', zh: '草本药水味', plain: '像风油精或止咳糖浆',
    notes: ['mint', 'rosemary', 'absinthe'],
  },
  {
    id: 'seaweed', zh: '海藻和湿毛巾', plain: '闷住的潮湿感，像没晾干',
    notes: ['marine notes', 'calone'],
  },
  {
    id: 'sharp-green', zh: '很冲的青草汁', plain: '掐断茎秆那股涩，冲鼻子',
    notes: ['galbanum', 'violet leaf'],
  },
];

/** 按 id 取一格（两份表都查）。 */
export function sceneById(id) {
  return LIKED_SCENES.find((s) => s.id === id)
    || AVOID_SCENES.find((s) => s.id === id)
    || null;
}

/** 一组情景 id → 香调 en 并集（保持首次出现顺序，去重）。 */
export function notesOfScenes(ids = []) {
  const out = [];
  for (const id of ids) {
    const s = sceneById(id);
    if (!s) continue;
    for (const en of s.notes) if (!out.includes(en)) out.push(en);
  }
  return out;
}

/** 一组情景 id → 中文名映射（引擎理由里要回显用户点的中文，不是 bergamot）。 */
export function zhOfScenes(ids = []) {
  const out = {};
  for (const id of ids) {
    const s = sceneById(id);
    if (!s) continue;
    /* 一格对应多味香调时，理由里用**这一格的名字**而不是香调名 ——
       用户点的是"刚剥开的橘子皮"，回显"佛手柑"就又变回术语了。 */
    for (const en of s.notes) out[en] = s.zh;
  }
  return out;
}

/** 情景表里所有香调 en，供测试核对"每一条都在 taxonomy 里"。 */
export function allSceneNotes() {
  return notesOfScenes([...LIKED_SCENES, ...AVOID_SCENES].map((s) => s.id));
}

/* ============================================================
   香型的「生活译文」（每屏常驻那句译文行，学圆盘圆心）
   ------------------------------------------------------------
   圆盘的圆心每次选中都给一句生活翻译（「刚洗完手那种干净」）。
   v3 把这句话**前置到选项上**：用户还没点，就知道「柑橘调」= 什么。
   所以这不是新增的解释文案，而是把圆盘早就做过的事搬到选项旁边。
   ============================================================ */
export const FAMILY_PLAIN = {
  citrus: '刚剥开的橘子皮、柠檬汽水',
  floral: '一整枝花，白天晚上都在开',
  woody: '锯开的木头、树皮和苔藓',
  amber: '焚香、树脂、旧皮革',
  fresh: '海风、青草、洗完澡的皮肤',
  gourmand: '香草、焦糖、烤过的坚果',
};

/* 预算档的「生活译文」：不写金额区间，写"这一段能买到什么"。 */
export const BUDGET_PLAIN = {
  b1: '第一瓶的常见预算',
  b2: '专柜正装的常规价',
  b3: '沙龙牌与礼盒',
  b4: '不设上限，选它会明显收窄',
};
