
/**
 * app.js — 零基础香水选择器的交互层
 *
 * 原则：
 *   1. 一屏一个问题，可后退改答案，答案实时存在内存里。
 *   2. 打分全部在 scoring.js 里完成，前端只负责渲染，不参与判断。
 *   3. 所有解释性文字来自数据或规则，不调模型、不编内容。
 */
import { recommend } from './src/scoring.js';
// normNote 把 taxonomy 里的 en 名（带空格、斜杠、大小写不统一）归一化后再比对。
// 少了它 noteZhOf() 找不到对应条目，轮盘标签会退化成一串英文原名。
import { usableEntries, normNote } from './src/notes.js';
/* 背景层（环境底噪）的算术。纯函数，独立成模块是为了让"只增不减、符号不变"
   这两条性质能被 test-render 直接调用验证 —— 截图只能证明"看起来有变化"，
   证明不了"每个方向都沿同一方向增强"。见 src/ambient.js 顶部三条纪律。 */
import { ambientOf, ambientVars } from './src/ambient.js';

const state = {
  step: 0,
  answers: {
    /* ==== 2026-11-16 问卷 v6：八屏，两层结构 ====
       规格正本 design-logic-study-20261116.md 五·补（22:56 定版）。
       与 v5 相比两处结构性改动：
         ① **预算前置到第 1 屏**（规格：预算题前置，先圈池再问偏好）；
         ② **香型轮盘退场**：那张盘的六个扇区写着「柑橘调 / 花香调 /
            东方琥珀调」，中圈是「古龙水型 / 白花」，它本身就是一道香调术语题 ——
            而规格底线是「全程无香调术语题」。学它的是设计逻辑（控件即内容、
            反馈即内容本身的变化），不是把盘的形式搬进每一屏。
       轮盘的几何=内容这条逻辑落在两处：场合（地平线的位置=时刻）、
       浓淡（同心环的半径=扩散距离）。

       family / subfamily 保留为 null 而不删：src/scoring.js 的 buildProfile
       按「family 或 emotion 二选一」取入口，v6 一律走 emotion 入口；
       删键会让 scoring 的读取变成 undefined —— 行为等价但键表分叉，留着更安全。 */
    family: null,
    subfamily: null,
    /* 第 2 屏「大方向」。值来自 TAX.emotionMap 的六个 id。
       它同时是**背景层底噪的唯一来源**（src/ambient.js 第 1 条纪律）。 */
    emotion: null,
    /* 第 1 屏预算。值 = data/price-bands.json 的 bands[].id，或 'any'。
       **刻意不进 activeDims**：它是候选范围，不是偏好证据。把它写进答案会让
       MATCH_PCT_MIN_DIMS 的门槛虚抬一维，等于拿范围冒充证据。
       它只作用于「把哪一批瓶子交给 recommend()」这一步，见 poolForBudget()。 */
    budget: 'any',
    occasion: null,
    intensity: 3,
    /* 第 3 / 4 屏：存的是生活短语 id（如 'citrus-peel'），不是香材名。
       短语在 LIFE_NOTES 里定义成"一句人话 + 它对应的香材 en 列表"，
       写进引擎的仍是那批香材 —— 术语只活在映射表里，不上屏。 */
    wanted: [],
    unwanted: [],
    likedNotes: [],
    dislikedNotes: [],
    // 英文香调名 → 中文显示名。理由里要回显用户点的中文，而不是 bergamot。
    likedZh: {},
    dislikedZh: {},
    /* v19 新增。全部默认为空 —— 一路按「下一步」跳过时，引擎侧每个新因子
       都会因为取不到值而整条跳过（不加分也不扣分）。 */
    characterPreset: null,
    characterTags: [],
    /* 气质原型的「禁止标签」。v6 起由第 2 屏的大方向反推填充
       （见 applyDirectionToCharacter）。初始值必须存在，
       否则「没答气质」与「答过又清空」在引擎侧长得一样。 */
    characterNeg: [],
    temperature: null,          // 'warm' | 'cool' | 'neutral'
    sweetness: null,            // 0..3
    anchorBrand: null,
    anchorPerfume: null,        // perfume.id
    anchorNotes: [],            // 香调 en 列表
    season: null,
    concentration: null,
    longevity: null,
    /* `longevityManual` 保留但已无写入点 —— v42 撤掉了「改」按钮，
       留香变成纯展示。留着这个键是为了让老存档不至于因为缺字段而报错；
       restart 里也一并清掉（两处键表必须一致，历史上漏过两次）。 */
    longevityManual: false,
    dislikedFamilies: [],
  },
  result: null,
  /* 结果页视图状态（不进 answers）。「换一批」靠它记第几批、以及哪些瓶子已出过。 */
  resultView: {
    round: 0,           // 第几批（0 = 第一批）
    soldOut: [],        // 前几批已展示过的 perfume id，换一批时跳过
  },
};

let DATA = null;
let TAX = null;
/* 实物图清单（id → 本地路径）。null = 还没试过，false = 试过、没有。
   与 AFF_LINKS 同一套三态语义，避免重复发请求。 */
let PHOTOS = null;
/* 已抠图（透明背景）的 id 集合。与 PHOTOS 同批加载，见 ensurePhotos()。 */
let CUTOUTS = null;

// 香调 chip 表：滤掉在 200 瓶样本里 0 命中的死选项（实测只有 可可/cocoa）。
// 每次重渲染都会调用，命中数是纯计算，缓存一份避免重复扫 200×40。
let usableCache = null;
function getUsableNotes() {
  const all = TAX.noteIndex.entries;
  if (!DATA?.perfumes?.length) return all;   // 数据未就绪时退回全表
  if (usableCache && usableCache.src === DATA.perfumes && usableCache.tax === TAX) {
    return usableCache.list;
  }
  const list = usableEntries(all, DATA.perfumes);
  usableCache = { src: DATA.perfumes, tax: TAX, list };
  return list;
}

const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v != null) n.setAttribute(k, v);
  }
  for (const k of kids.flat()) {
    if (k == null) continue;
    n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  }
  return n;
};

/* ---------- 步骤定义（2026-11-16 v6：七屏） ----------

   ==== 这一版的题目从哪来 ====
   规格底线四条，逐条落在这里：
     · 全程无香调术语题 —— 第 3 / 4 屏问的是「生活里记得的味道」
       （刚剥开的橘子皮 / 寺庙的香灰），不是「佛手柑 / 焚香」。
       术语只活在映射表 LIFE_NOTES 里，用户点的那一头全是人话。
     · 预算前置 —— 第 1 屏，先圈池再问偏好。理由不是转化率，
       是**后六屏的每一次选择都发生在同一个候选池里**：用户不会在最后
       发现自己答了半天、池子里一半买不起。
     · 结果页保留「换一批 / 改一题重推」—— 见 renderResult。
     · 三瓶 + 前中后调 + 可反推理由 —— 引擎打分一行没动，理由仍由 breakdown 生成。

   ==== 七屏的顺序不是随意的 ====
     1 budget        先圈池（范围）
     2 emotion       **第一个大方向**，同时是背景层底噪的来源（src/ambient.js）
     3 wanted        想要的味道（生活短语，多选）
     4 unwanted      受不了的味道（同上，强惩罚 -40）
     5 occasion      场合 —— 决定浓淡与时段
     6 concentration 浓淡＋浓度（扩散场：同心环半径＝扩散距离）
     7 anchor        已知款（唯一需要认瓶子的题，可跳过）

   为什么第 2 屏必须是「大方向」而不是场合：规格 3 说底噪由第一个大方向定调。
   若场合排在它前面，底噪的起点会落在第 3 屏，前两屏之间出现一次"突然开灯"。
   而那段恰恰是用户刚决定"我想要什么感觉"的地方 —— 沉浸感要求灯先亮、再走。

   为什么「气质」退场：它与第 2 屏的大方向是同一件事的两种问法（都问"给人的感觉"）。
   七屏里留一个就够，重复问一遍只会让用户怀疑刚才那题白答。
   气质原型的信息没丢 —— 由大方向反推填充，见 applyDirectionToCharacter()。

   为什么季节退场：换季提问的数据价值最低（docs/QUESTIONNAIRE-VALUE-20261109.md
   实测榜内换人 1.13，13 维倒数第二），而它占一整屏。

   为什么「整族排除」退场：它在家族入口下实测 0/30 改变 top-3
   （scripts/probe-step6-options.mjs，2026-11-09），而 v6 已无家族入口。
   留着只会让一部人多一屏、另一部人少一屏，进度条数字对不上。
   */
const STEPS = [
  {
    id: 'budget',
    short: '预算',
    title: '你打算花多少钱？',
    help: '先圈个范围，后面七屏只在这个范围里挑。不限也行，只是候选会多很多',
    render: renderBudget,
  },
  {
    id: 'emotion',
    short: '大方向',
    title: '你希望它给人什么感觉？',
    help: '这一题定的是整程的调子 —— 后面每一屏的光、温度、底色都会跟着它走。不确定就选最像的那个，不选也能继续',
    render: renderDirection,
  },
  {
    id: 'wanted',
    short: '想要',
    title: '有没有特别想闻到的味道？',
    help: '不用记术语，照生活里记得的那个东西点就行。想不起来就跳过，后面还有别的维度',
    render: renderWanted,
  },
  {
    id: 'unwanted',
    short: '受不了',
    title: '有没有完全受不了的味道？',
    help: '这一题比上一题更有效：讨厌的东西没有替代品，喜欢的往往有好几个替代。想不起来就跳过',
    render: renderUnwanted,
  },
  {
    id: 'occasion',
    short: '场合',
    title: '主要什么时候用？',
    /* 任务8 B1（Eddie 2026-11-12 批准）：原文「主战场决定浓度下限」
       是两处黑话之一（POLISH-20261112.md §2 标出的候选）。
       「主战场」→「你最常在什么场合用」、「浓度下限」→「推荐的浓淡」，
       保留原句的因果结构（场合决定什么）与兜底动作（拿不准就选日常）。 */
    help: '你最常在什么场合用，决定了推荐的浓淡。选一个最像的，拿不准就选日常；不选也能继续',
    render: renderOccasion,
  },
  {
    id: 'season',
    short: '季节',
    title: '主要在哪个季节用？',
    help: '季节决定它会不会在夏天闷、冬天散太快。不确定就跳过，不答不扣分',
    render: renderSeason,
  },
  {
    /* id 沿用 'concentration' 而不是新造一个 'strength'：
       ① 旧 id 'strength' 已被测试明确断言"不得复活"，复活它会让那条断言
          变成假阳性，也分不清"回滚"和"复制粘贴忘改 id"；
       ② concentration 是这一屏的真正落点（③ 留香由它推断），
          intensity 是屏内 ① 的锚点，不再是独立步骤。 */
    id: 'concentration',
    short: '浓淡',
    title: '想要多浓？',
    /* 任务8 B2（Eddie 2026-11-12 批准）：原文「香精占比」是两处黑话之二。
       改为「浓度类型」——与 short「浓淡」呼应，也与下面单选卡的文案对得上。 */
    help: '先说体感（想让人闻到多重的分量），再说浓度类型（决定留香多久）。两项都不选也能出结果',
    render: renderConcentration,
  },
  {
    id: 'anchor',
    short: '已知款',
    title: '有没有已经试过、并且喜欢的香水？',
    /* help 第一句就卸压力并把"跳过"放最前。原句把"可跳过"放在"最准"之后，
       读起来像"可跳过但跳了就亏"，会让零基础的人卡在这里。 */
    help: '不记得名字就跳过 —— 这是唯一一题需要你认得瓶子的，答不出很正常。'
      + '如果记得品牌，选一下会明显更准',
    render: renderAnchor,
  },
];

/* 当前生效的步骤表。

   v6 起**七屏固定**，没有 when 条件（v5 的「整族排除」只在情绪入口出现，
   v6 第 2 屏就是大方向，等于所有用户都走那条路，那屏已无意义 —— 见 STEPS 注释）。

   函数保留而不删：所有「第 N 步 / 共 M 步」与进度段数都必须走它，
   不许读 STEPS.length。两套数字一旦分叉，界面会显示「共 7 步」但只有 6 屏，
   用户翻到第 6 屏就出结果，会以为漏了一屏。 */
function curSteps(answers = state.answers) {
  /* answers 参数保留（调用点都在传），但 v6 无 when —— 步骤数与答案无关。
     void 掉是为了提醒下一个想加 when 的人：一旦重新引入条件，
     所有靠 S.cur({}) 断言步数的测试会一起变。 */
  void answers;
  return STEPS;
}


/* 把步骤下标夹进当前步骤表的合法范围。
   为什么单独抽出来：`render()` 里要用它挡越界，而「切换入口会让步骤表变短」
   这件事在测试里也必须能直接验（`__steps.clamp`），不必真的点几十次。
   `list.length` 本身是合法值 —— 它表示「结果页」。 */
function clampStep(step, len) {
  if (!Number.isFinite(step) || step < 0) return 0;
  return step > len ? len : step;
}

/* 按 step id 取「第 N 步 / 共 M 步」那一行。
   为什么要有这个函数：v19 之前每个 render 里都写 STEPS[5] 这种硬编码下标，
   中间插一屏就全部错位，而且**不报错**，只是编号显示成错的。
   改成按 id 查之后，插入/重排/合并都不用碰这十几处调用点。

   注意它必须定义在 STEPS 之后、所有 render 之前 ——
   本轮合并步骤时，重写 STEPS 的区间正好把它吃掉了，
   页面直接白屏报 "stepHead is not defined"。这类"删代码删掉相邻函数"
   的事故，测试里的 ESM import 会抛错，但浏览器只会显示加载失败，
   两种表现差很远，所以留这条注释。 */
function stepHead(id, answers = state.answers) {
  const list = curSteps(answers);
  const i = list.findIndex((x) => x.id === id);
  const st = list[i] || { kicker: '', title: '', help: '' };
  return {
    kicker: `第 ${i + 1} 步 / 共 ${list.length} 步`,
    title: st.title,
    help: st.help,
  };
}

/* ============================================================
   生活短语映射层（2026-11-16 v6）
   ------------------------------------------------------------
   规格底线：「全程无香调术语题」。实现的唯一手段就是这个表 ——
   屏上只有短语（「刚剥开的橘子皮」），引擎只认香材（bergamot / lemon），
   两者在这一层对上。**术语不上屏**，但它没有消失：它活在映射里，
   结果页的理由还会把它翻回人话（见 zhOfPhrases）。

   ==== 短语怎么来的（不是新编题目，是对已备数据的重排）====
   每条短语都对应 data/taxonomy.json 的 noteIndex 里真实存在的条目
   （notes 字段就是那些 en 名，构建时用 normNote 对过别名）。
   分组沿用六族，但屏上不出现族名 —— 用户按"我闻到过这个东西"点，
   而不是按"这是柑橘调"点。

   ==== 每条短语都实测有货 ====
   注释里的数字是 1388 瓶里至少含其中一味原料的瓶数（node 脚本实算，
   命中口径 = notesAll 归一化后精确匹配）。低于 LIVE_NOTE_MIN 的短语
   直接不上屏 —— 与 v5 挡住「可可」是同一条规则：勾了永远推荐不出东西的
   选择，等于骗用户一次点击。 */
const LIFE_NOTES = [
  /* ---- 果皮 / 明亮的开场 ---- */
  { id: 'citrus-peel', zh: '刚剥开的橘子皮', hint: '手上那一下清亮的油', family: 'citrus',
    notes: ['bergamot', 'lemon', 'grapefruit'] },          // 661 瓶
  { id: 'green-twig', zh: '掐断的绿枝', hint: '断口的涩味，不是花的香', family: 'fresh',
    notes: ['violet leaf', 'galbanum', 'petitgrain'] },    // 100 瓶
  { id: 'cold-tea', zh: '一杯放凉的茶', hint: '不甜、有一点涩', family: 'fresh',
    notes: ['green tea'] },                                // 39 瓶
  { id: 'sea-wind', zh: '湿润的海风', hint: '空气里的水汽和一点咸', family: 'fresh',
    notes: ['marine notes'] },                             // 58 瓶
  /* ---- 花 ---- */
  { id: 'rose-garden', zh: '花园里的玫瑰', hint: '花心深处那点甜', family: 'floral',
    notes: ['rose', 'peony'] },                            // 425 瓶
  { id: 'night-white', zh: '夜里开的白花', hint: '走近才有，很远也压不住', family: 'floral',
    notes: ['jasmine', 'tuberose', 'ylang-ylang'] },       // 455 瓶
  { id: 'osmanthus', zh: '桂花糖', hint: '秋天路边那种甜', family: 'floral',
    notes: ['osmanthus'] },                                // 34 瓶
  { id: 'lotiony-powder', zh: '奶油味的粉', hint: '爽身粉、化妆盒', family: 'floral',
    notes: ['iris', 'violet'] },                           // 244 瓶
  /* ---- 甜 / 果实 ---- */
  { id: 'ripe-peach', zh: '熟透的桃子', hint: '汁水、果皮、一点酒味', family: 'gourmand',
    notes: ['peach', 'pear', 'apple'] },                   // 252 瓶
  { id: 'vanilla-ice', zh: '香草冰淇淋', hint: '冷的时候也能闻到的甜', family: 'gourmand',
    notes: ['vanilla', 'tonka bean'] },                    // 616 瓶
  /* ---- 木 / 地 ---- */
  { id: 'sunlit-wood', zh: '晒过的旧木头', hint: '干、暖、不甜', family: 'woody',
    notes: ['sandalwood', 'cedar'] },                      // 624 瓶
  { id: 'pine-wind', zh: '松林里的风', hint: '针叶、树脂、清苦', family: 'woody',
    notes: ['juniper', 'cypress'] },                       // 84 瓶
  { id: 'after-rain', zh: '雨后的土地', hint: '湿土、苔藓、树根', family: 'woody',
    notes: ['vetiver', 'patchouli', 'oakmoss'] },          // 673 瓶
  { id: 'old-medicine', zh: '古老的药木', hint: '深色木头 + 一点药味', family: 'woody',
    notes: ['oud', 'saffron'] },                           // 183 瓶
  /* ---- 树脂 / 烟 ---- */
  { id: 'incense-ash', zh: '寺庙的香灰', hint: '烟散了以后留在空气里的那层', family: 'amber',
    notes: ['incense', 'myrrh', 'frankincense'] },         // 162 瓶
  { id: 'amber-resin', zh: '琥珀色的树脂', hint: '温、稠、贴皮肤', family: 'amber',
    notes: ['amber', 'benzoin'] },                         // 606 瓶
  { id: 'leather-sofa', zh: '皮沙发', hint: '坐久了有体温的那种皮', family: 'amber',
    notes: ['leather'] },                                  // 136 瓶
  /* ---- 草本 ---- */
  { id: 'lavender-field', zh: '薰衣草田', hint: '干净、微苦、不甜', family: 'fresh',
    notes: ['lavender', 'sage'] },                         // 217 瓶
];

/* 一条短语至少要在多少瓶里出现才上屏。
   取 12：本表最低是「桂花糖」34 瓶，圈过预算之后仍能剩十来个；
   再低的（个位数）勾了也挑不出三瓶不同的，那比不提供更糟。 */
const LIVE_NOTE_MIN = 12;

/* 归一化比对走 notes.js 的 normNote，与引擎同一套 ——
   taxonomy 的 en 写法不统一（"neroli / orange blossom"、"Tonka Bean"），
   自己写一套正则会和引擎分叉。 */
let lifeNoteIndex = null;
function lifeNoteHitCount() {
  if (lifeNoteIndex) return lifeNoteIndex;
  const perfs = DATA?.perfumes || [];
  const entries = TAX?.noteIndex?.entries || [];
  /* 先把每条短语要查的 key 展开好（含别名），避免在 1388×18 的双层循环里反复 find。 */
  const keysOf = new Map();
  for (const d of LIFE_NOTES) {
    const keys = new Set();
    for (const en of d.notes) {
      const norm = normNote(en);
      keys.add(norm);
      const e = entries.find((x) => normNote(x.en) === norm || (x.aliases || []).some((a) => normNote(a) === norm));
      if (e) {
        keys.add(normNote(e.en));
        for (const a of (e.aliases || [])) keys.add(normNote(a));
      }
    }
    keysOf.set(d.id, keys);
  }
  const out = new Map();
  for (const p of perfs) {
    const bag = new Set((p.notesAll || []).map((n) => normNote(n)));
    for (const [id, keys] of keysOf) {
      for (const k of keys) {
        if (bag.has(k)) { out.set(id, (out.get(id) || 0) + 1); break; }
      }
    }
  }
  lifeNoteIndex = out;
  return out;
}

/* 上屏的短语。数据没到齐时先给全表（不让首屏空着），到齐后按实测过滤。 */
function livePhrases() {
  if (!DATA?.perfumes?.length || !TAX) return LIFE_NOTES.slice();
  const hits = lifeNoteHitCount();
  return LIFE_NOTES.filter((d) => (hits.get(d.id) || 0) >= LIVE_NOTE_MIN);
}

/* 短语 → 香材 en 列表（去重）。写进 likedNotes / dislikedNotes 的就是它。 */
function notesOfPhrases(ids) {
  const out = [];
  const seen = new Set();
  for (const id of ids || []) {
    const d = LIFE_NOTES.find((x) => x.id === id);
    for (const en of (d ? d.notes : [])) {
      const k = normNote(en);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(en);
    }
  }
  return out;
}

/* 短语 → 中文显示名。理由里回显**短语**而不是原料名 ——
   用户在屏上看到的是「刚剥开的橘子皮」，理由里就该是这句。 */
function zhOfPhrases(ids) {
  const out = {};
  for (const id of ids || []) {
    const d = LIFE_NOTES.find((x) => x.id === id);
    if (!d) continue;
    for (const en of d.notes) out[en] = d.zh;
  }
  return out;
}

/* ---------- 预算池（映射层，不碰引擎） ----------
   预算不是偏好证据，是**候选范围**。所以它不进 answers 的打分字段，
   只在调用 recommend() 之前把 perfumes 数组切一刀。引擎一行不动。

   三条降级，都让"选不出的档"退回更宽的范围而不是给空结果：
     ① 该档瓶数 < 12（topN × 4）→ 不加限制（档太窄，圈了等于没货）；
     ② 限制后引擎仍凑不满 3 瓶 → finish() 用全库重算一次；
     ③ 价位未知的瓶子：选具体档时**不参与**（不是"当作便宜"）。
   为什么要 ③：价位未知的 766 瓶里既有 200 元的也有 3000 元的。把它们塞进
   「300 元以内」，用户点开购买链接会发现价格翻十倍 —— 一次信任损耗。
   界面必须把这句话写出来，见 renderBudget 的说明行。 */
let PRICE_INDEX = null;
function priceIndex() { return PRICE_INDEX; }

function poolForBudget(perfumes, budgetId) {
  const idx = priceIndex();
  if (!idx || !budgetId || budgetId === (idx.anyId || 'any')) return perfumes;
  const ids = idx.bandOfId ? idx.bandOfId[budgetId] : null;
  if (!Array.isArray(ids) || !ids.length) return perfumes;
  const keep = new Set(ids);
  const pool = perfumes.filter((p) => keep.has(p.id));
  /* ① 档太窄：不如不圈。12 = topN(3) × 4，留足家族/品牌去重后的余量。 */
  if (pool.length < 12) return perfumes;
  return pool;
}

/* ---------- 大方向 → 气质原型（引擎的 character 因子仍按原样工作） ----------
   为什么需要这一步：v6 第 2 屏就是大方向，而 v5 的「气质」屏已退场。
   character 是引擎里权重不低的一维（16 分），缺了它等于白丢一维证据。
   这不是新信息，是把用户刚答的那句话翻译成引擎认识的字段。 */
const EMOTION_TAGS = {
  cold: { tags: ['clean', 'green', 'herbal'], neg: ['sweet', 'creamy'] },
  warm: { tags: ['warm', 'amber', 'resinous'], neg: ['green', 'salty'] },
  clean: { tags: ['clean', 'fresh', 'soapy'], neg: ['smoky', 'leathery'] },
  mysterious: { tags: ['smoky', 'leathery', 'resinous'], neg: ['clean', 'fruity'] },
  bright: { tags: ['citrusy', 'fresh', 'fruity'], neg: ['smoky', 'leathery'] },
  lazy: { tags: ['creamy', 'musky', 'powdery'], neg: ['citrusy', 'sharp'] },
};

function applyDirectionToCharacter(emotionId) {
  const t = EMOTION_TAGS[emotionId];
  state.answers.characterTags = t ? t.tags.slice() : [];
  state.answers.characterNeg = t ? t.neg.slice() : [];
  state.answers.characterPreset = null;
  /* temperature / sweetness 也由方向反推（引擎读这两维）。
     口径与 v5 的 deriveFromPreset 一致，只是来源从"七个原型"换成"六个大方向"。 */
  const T = {
    cold: { temperature: 'cool', sweetness: 0 },
    warm: { temperature: 'warm', sweetness: 2 },
    clean: { temperature: 'cool', sweetness: 1 },
    mysterious: { temperature: 'warm', sweetness: 1 },
    bright: { temperature: 'cool', sweetness: 1 },
    lazy: { temperature: 'warm', sweetness: 2 },
  }[emotionId];
  state.answers.temperature = T ? T.temperature : null;
  state.answers.sweetness = T ? T.sweetness : null;
}


/* ---------- 构建标记 ----------
   页面里 `document.documentElement.dataset.build` 会带上它。
   用途是"这次看到的到底是哪份代码"—— 改完 app.js 如果这个值没变，
   说明浏览器还在跑缓存的旧文件，别去猜渲染逻辑。 */
const BUILD_ID = '2026-11-16-quiz-v6';

/* ---------- 上色图标（结果页实物图的降级瓶形，与盘心标本共用同一批） ----------
   24 枚上色版在 ./icon-specimen/svg/ 合计 295.6KB / gzip 80.1KB，
   按需 fetch + 内存缓存，首屏零代价；file:// 下会被 CORS 拦，必须跑 server.js。

   为什么 v6 还留这一整套：香型轮盘退场了，但**结果页**的图标与瓶子插图
   仍走这条通路（pickArt → bottleArt），而 spec 5·续 把"图标精致/呼应/美观"
   定为验收标准 —— 删掉它等于把已经合格的一项退回空白。
   v6 只是不再用它来讲香调术语。 */
const PLATE_SIZE = 24;
const PLATE_LABEL = { citrus: '柑橘', floral: '花', woody: '木质', amber: '树脂', fresh: '叶', gourmand: '果实' };
const ART_FILE = {
  'cologne': 'citrus-cologne',
  'green-citrus': 'green-citrus-a',
  'citrus-floral': 'citrus-citrus-floral',
  'aromatic-citrus': 'citrus-aromatic-citrus',
  'rose': 'floral-rose',
  'white-floral': 'white-floral-a',
  'fruity-floral': 'floral-fruity-floral',
  'powdery-floral': 'floral-powdery-floral',
  'green-floral': 'floral-green-floral',
  'soliflore': 'floral-soliflore',
  'sandalwood': 'woody-sandalwood',
  'vetiver': 'woody-vetiver',
  'oud': 'oud-a',
  'woody': 'woody-woody',
  'amber': 'amber-amber',
  'incense': 'amber-incense',
  'resinous': 'amber-resinous',
  'leather': 'amber-leather',
  'aquatic': 'fresh-aquatic',
  'green': 'fresh-green',
  'fougere': 'fresh-fougere',
  'tea': 'fresh-tea',
  'vanilla-gourmand': 'gourmand-vanilla-gourmand',
  'fruity-gourmand': 'gourmand-fruity-gourmand',
};
const ART_CACHE = new Map();
/* 已解析完成的内容单独记一份：artInner() 返回 Promise，微任务里替换图元会
   让"先画线稿、再换彩图"多出一帧 —— 实测用户能看见约 1s 的旧线稿闪现。
   ART_READY 让调用方在【同步】阶段就能判断彩图在不在。 */
const ART_READY = new Map();
function artPath(subId) {
  const f = ART_FILE[subId];
  return f ? './icon-specimen/svg/' + f + '.svg' : '';
}
function artInner(subId) {
  const p = artPath(subId);
  if (!p) return Promise.resolve('');
  if (!ART_CACHE.has(p)) {
    ART_CACHE.set(p, fetch(p).then((r) => (r.ok ? r.text() : '')).then((t) => {
      if (!t) return '';
      /* 只取 <svg> 内部内容：外层 <svg> 由我们自己造，才能挂 class 与 viewBox */
      const inner = t.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
        .replace(/<title>[\s\S]*?<\/title>/g, '');
      if (inner) ART_READY.set(p, inner);
      return inner;
    }).catch(() => ''));
  }
  return ART_CACHE.get(p);
}
/* 首屏就把 24 枚全部拉进内存（与香水库并行，不阻塞渲染）。 */
function artWarmAll() {
  Object.keys(ART_FILE).forEach((id) => { artInner(id).catch(() => {}); });
}
/* 同一枚图标可能被同时插进 DOM 的多个位置，渐变 id 必须唯一，
   否则第二次插入会引用到第一个实例的 defs。 */
let artSeq = 0;
function artNs(inner, ns) {
  return inner.replace(/id="([^"]+)"/g, (m, x) => 'id="' + x + '-' + ns + '"')
    .replace(/url\(#([^)]+)\)/g, (m, x) => 'url(#' + x + '-' + ns + ')');
}
/* 彩图已就绪就直接返回可写进 <svg> 的内部内容；没就绪返回 ''。 */
function artSvgReady(subId) {
  const inner = ART_READY.get(artPath(subId));
  return inner ? artNs(inner, 'a' + (++artSeq)) : '';
}
/* 尽早开始预热：不等 taxonomy、不等 DOMContentLoaded。 */
if (typeof window !== 'undefined') artWarmAll();

/* 香材英文名 → 中文，供代表香材行显示。找不到就退回原文。 */
function noteZhOf(en) {
  const e = TAX && TAX.noteIndex ? TAX.noteIndex.entries.find((x) => normNote(x.en) === normNote(en)) : null;
  return e ? e.zh : String(en);
}

/* ---------- 第 3 步：浓郁度 ---------- */
const INTENSITY_LABEL = {
  1: ['很淡', '只有贴很近才闻到，一两个小时后基本消失'],
  2: ['偏淡', '自己和身边人闻得到，通勤半天还在'],
  3: ['中等', '明显有香气，办公室环境刚好'],
  4: ['偏浓', '进门会被注意到，衣服上留到第二天'],
  5: ['很浓', '一两喷就够，围巾上能留好几天'],
};

/* ---------- 第 4 / 5 步：香调点名（喜欢 / 讨厌各一屏） ----------
   v19 把一个"两栏同屏"的页面拆成两屏。原因是实测出来的：
   两栏各有 40 个 chip，屏高 640px，勾完上面那栏再滚到下面时，
   已经看不到上面勾了什么；而两栏共享同一份 registry，
   一栏的动作会静默改掉另一栏的视觉 —— 用户会以为勾错了。
   拆屏之后每屏只画一栏，滚动与状态互不干扰，
   "同一香调不能既喜欢又讨厌"这条仍然由 registry 在背面守着。 */
/* ---------- v19 新增七屏 ----------
   设计前提（已核对数据源，见 D46）：400 瓶里
     有 family / subfamily / character(21) / seasons(4) / timesOfDay(3)
        / concentration(348/400) / longevityInferred(348/400) / notesAll(均 8.6 味)
     没有 price / gender / skinType / sillage —— 这四项**一律不做成筛选条件**，
     只在术语速查里作为知识讲给新手听。做了但拿不到数据的筛选，
     等于用界面假装精准，比不做更糟。
   每一屏的取舍都写在该函数开头，便于以后翻案时有据可查。 */

/* 公共：离散选项的按钮网格。用于气质、季节、浓度这些 4–8 项的单选。
   为什么不用 chips：chips 是给"40 个香调"那种多选场景的；
   五六个选项用 chips 会缩成一小块、点起来费劲，也塞不下解释文字。 */
function choiceGrid(opts, current, onPick) {
  /* 单选组的容器与子项语义。
     原来只有子项带 aria-pressed，容器是个裸 div —— 读屏会念成「切换按钮」，
     既不知道这是一组，也不知道「共几个、第几个」。
     现在容器 role=radiogroup，子项 role=radio + aria-checked。
     aria-pressed 一并保留：样式与既有测试都读它，删掉会牵连 .choice 的
     选中态判断；role=radio 上的 aria-pressed 是冗余的，但无害，
     等样式改成 .is-on 单源之后再摘。 */
  const box = el('div', { class: 'choice-grid', role: 'radiogroup' });
  opts.forEach((o) => {
    const on = current === o.id;
    const b = el('button', {
      class: 'choice' + (on ? ' is-on' : ''),
      type: 'button',
      role: 'radio',
      'aria-checked': String(on),
      'aria-pressed': String(on),
      'data-id': o.id,
      onclick: () => {
        onPick(o.id);
        /* 单选组：把状态刷到整组，而不是只改自己 ——
           只改自己时，按上一题回来会看到两个同时高亮。 */
        [...box.children].forEach((c) => {
          const mine = c.getAttribute('data-id') === o.id;
          c.classList.toggle('is-on', mine);
          c.setAttribute('aria-checked', String(mine));
          c.setAttribute('aria-pressed', String(mine));
        });
      },
    },
      el('span', { class: 'choice-zh' }, o.zh),
      o.desc ? el('span', { class: 'choice-desc' }, o.desc) : null
    );
    box.appendChild(b);
  });
  return box;
}

/* ---------- 分段控件（有序、互斥、2–5 档）----------
   为什么不是一个可选项，而是必须与 choiceGrid 并存：
   「冷暖」「甜度」这类问题是**有序的**（凉 → 暖、不甜 → 很甜），
   而 choiceGrid 是 2 列网格 —— 网格表达的是"并列的几样东西"，
   把有序档位塞进网格，第 3 档与第 4 档会被读成两件不同的事。
   实测：卡片形态下这两组各占 145px 高，而它们只需要一行。

   与 choiceGrid 的分工：
     segControl  有序、标签 2–5 字、不需要逐项说明 → 一行等宽分段
     choiceGrid  无序、需要逐项描述（浓度带香精百分比、气质带 15 字解释）

   ARIA 用 radiogroup + radio，与 choiceGrid 同一套语义，只是视觉不同。
   键盘按 WAI-ARIA 惯例：左右/上下方向键在组内移动并**立即选中**
   （这是 radio 的标准行为，不是 Tab 逐个过）。 */
function segControl(opts, current, onPick, label, onPaint) {
  const box = el('div', {
    class: 'seg',
    role: 'radiogroup',
    'aria-label': label || '',
  });
  const btns = [];
  const paint = (id) => {
    btns.forEach((b) => {
      const mine = b.getAttribute('data-id') === id;
      b.classList.toggle('is-on', mine);
      b.setAttribute('aria-checked', String(mine));
      b.setAttribute('tabindex', mine ? '0' : '-1');
    });
  };
  opts.forEach((o, i) => {
    const on = current != null && String(current) === String(o.id);
    const b = el('button', {
      class: 'seg-item' + (on ? ' is-on' : ''),
      type: 'button',
      role: 'radio',
      'aria-checked': String(on),
      'data-id': o.id,
      /* roving tabindex：整组只留一个 Tab 落点。没有选中项时第一个可聚焦。 */
      tabindex: on || (current == null && i === 0) ? '0' : '-1',
      onclick: () => {
        onPick(o.id);
        paint(String(o.id));
        if (onPaint) onPaint(o.id);
      },
      onkeydown: (ev) => {
        let d = 0;
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') d = 1;
        else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') d = -1;
        else return;
        ev.preventDefault();
        const to = (i + d + opts.length) % opts.length;
        const target = btns[to];
        onPick(opts[to].id);
        paint(String(opts[to].id));
        if (onPaint) onPaint(opts[to].id);
        target.focus();
      },
    }, o.zh);
    btns.push(b);
    box.appendChild(b);
  });
  return box;
}

/* 分段控件旁边的「这一档是什么意思」。
   分段的格子只有 2–4 个字，说明必须另找地方放；但也不能把全部档位的说明
   都摊开（那正是卡片形态占 145px 的原因）。只显示当前选中那一句，
   未选时给第一档的说明作为示例（并降低不透明度，表明"这不是你选的"）。 */
function segHint(opts, current) {
  const node = el('p', { class: 'seg-hint' });
  updateSegHint(node, opts, current);
  return node;
}

/* 点击/方向键换档后，说明文字必须跟着换。
   第一版只让 segControl 内部 paint 按钮，说明停在旧档位 —— 实测点「微甜」
   后下方仍写着「完全不甜」那句，是明确的错误信息。
   做成独立函数而不是就地重写 textContent：调用处（renderMood）的闭包
   在 segControl 之前就能持有 hint 节点，两边不必知道对方的实现。 */
function updateSegHint(node, opts, current) {
  if (!node) return;
  const idx = current == null ? 0 : opts.findIndex((o) => String(o.id) === String(current));
  const o = opts[idx < 0 ? 0 : idx];
  node.textContent = o ? o.desc : '';
  node.classList.toggle('is-idle', current == null);
}

/* ---------- 第 6 步：气质 ----------
   数据里 character 有 21 种，逐个列出来是灾难（新手不知道 "resinous" 是什么）。
   按「新手能自己判断」的标准收敛到 8 个，每个配一句人话解释，
   背后各自映射到数据里的多个标签（tags）。 */
/* ---------- 整体气质：由三维推导，不是八个并列标签 ----------

   旧版的八个预设是"八个词"：清爽干净 / 清冷疏离 / 温暖亲和 / 甜而柔软 /
   花香温柔 / 明亮有神 / 深沉神秘 / 贴肤慵懒。问题是它们**不在同一根轴上** ——
   「花香温柔」说的是原料类别，「深沉神秘」说的是氛围，「贴肤慵懒」说的是强度，
   用户没法在同一把尺子上比较。实测两两重合率最高到 47%（fresh × bright），
   即选了 A 的人里近一半也会选 B，等于给了两个几乎一样的问题。

   新版按**三个可以互相独立判断的维度**铺开，每一项都是三维空间里的一个角落：

     维度1  冷暖   凉（fresh/green/citrusy/salty） ←→ 暖（warm/amber/resinous/spicy）
     维度2  甜度   干（无 sweet/creamy）         ←→ 甜（有 sweet 或 creamy）
     维度3  轻重   轻（主家族属于 citrus/floral/fresh）←→ 重（wood/samber/gourmand）

   这三个维度用户都能独立回答，而且都能从"我最初选的气味偏好"推出来 ——
   这正是本轮的要求：新选项必须可由冷暖、甜度、初始偏好推导得出。

   **为什么是 7 项不是 8 项**：三维 2×2×2 应有 8 个角落，但实测
   「冷 + 甜 + 重」这一格在**当前 1388 瓶里只有 1 瓶**（0.1%）——
   数据撑不起一个选项。（D51 写这段时是 1228 瓶里的 12 瓶 / 1%；
   上游扩到 1479 行后这格反而更空了，结论方向没变、程度更极端。）
   同理「冷 + 甜 + 轻」与其它项的标签集合过于接近（Jaccard 距离 0.50），
   区分度不足。所以落 7 项，**不为了凑够 8 个而硬造一个选不出东西的格子**。

   每项带 tags 权重：命中的标签越多分越高，评分侧沿用现有的
   character 硬匹配 + 家族软回退（src/scoring.js:404）。 */
/* ---------- 整体气质：由三维推导的七个原型 ----------

   旧版的八个预设是"八个并列的词"：清爽干净 / 清冷疏离 / 温暖亲和 / 甜而柔软 /
   花香温柔 / 明亮有神 / 深沉神秘 / 贴肤慵懒。问题不在数量，在它们**不在一根轴上** ——
   「花香温柔」说的是原料类别，「深沉神秘」说的是氛围，「贴肤慵懒」说的是强度。
   实测旧版两两重合最高 47%（清爽干净 × 明亮有神），即选了 A 的人里近一半也会选 B。

   新版按**三个能独立判断的维度**铺开，每项是三维空间里的一个角落：
     冷暖  cool(fresh/green/citrusy/salty) ←→ warm(warm/amber/resinous/spicy)
     甜度  dry(无 sweet/creamy)            ←→ sweet(有 sweet 或 creamy)
     轻重  light(主族 citrus/floral/fresh)  ←→ heavy(主族 woody/amber/gourmand)

   关键设计：每项除 tags 外还有 **neg（禁止标签）**。命中禁止标签会按 -0.22/个 扣分。
   没有 neg 时，实测两两重合最高 61%（洁净清透 × 雨后林地）—— 比旧版还差，
   因为「fresh」这种高频标签同时喂给了好几项。加 neg 后降到 43%，并列率 33%→14%。

   **为什么是 7 项不是 8 项**：同上 —— 「冷 + 甜 + 重」这一格在 1388 瓶里
   只剩 1 瓶（0.1%），数据撑不起一个选项。不为了凑够 8 个而硬造一个
   永远选不出东西的格子。 */
const CHARACTER_PRESET = [
  { id: 'clean-clear', zh: '洁净清透',
    dims: { temp: -1, sweet: -1, weight: -1 },
    desc: '凉、干、轻。像刚洗完澡的白衬衫，或切开的一瓣青柠',
    tags: { fresh: 3, clean: 3, citrusy: 2, herbal: 1 },
    neg: ['sweet', 'resinous', 'leathery', 'smoky'] },
  { id: 'wet-forest', zh: '雨后林地',
    dims: { temp: -1, sweet: -1, weight: 1 },
    desc: '凉、干、重。湿土、树皮、压碎的叶子，不是花',
    tags: { earthy: 3, woody: 2, green: 2, herbal: 1 },
    neg: ['sweet', 'clean', 'floral'] },
  { id: 'iced-fruit', zh: '冰镇果露',
    dims: { temp: -1, sweet: 1, weight: -1 },
    desc: '凉、甜、轻。桃、梨、莓果，像刚从冰箱拿出来',
    tags: { fruity: 3, sweet: 2, citrusy: 1, floral: 1 },
    neg: ['leathery', 'smoky', 'resinous', 'earthy'] },
  { id: 'dry-herb', zh: '干爽草本',
    dims: { temp: 1, sweet: -1, weight: -1 },
    desc: '暖、干、轻。干草、香料、茶叶，干净利落不贴身',
    tags: { herbal: 3, spicy: 2, woody: 1, citrusy: 1 },
    neg: ['sweet', 'creamy', 'floral'] },
  { id: 'leather-tob', zh: '皮革烟草',
    dims: { temp: 1, sweet: -1, weight: 1 },
    desc: '暖、干、重。皮革、烟丝、旧书，有分量的那种暖',
    tags: { leathery: 3, smoky: 3, resinous: 2, woody: 1 },
    neg: ['fresh', 'citrusy', 'clean', 'fruity'] },
  { id: 'honey-white', zh: '蜜感白花',
    dims: { temp: 1, sweet: 1, weight: -1 },
    desc: '暖、甜、轻。晚香玉、茉莉、橙花，甜但不压人',
    tags: { floral: 3, creamy: 2, powdery: 2 },
    neg: ['leathery', 'smoky', 'citrusy', 'green'] },
  { id: 'caramel-amber', zh: '焦糖琥珀',
    dims: { temp: 1, sweet: 1, weight: 1 },
    desc: '暖、甜、重。香草、焦糖、树脂，一两喷就够',
    tags: { sweet: 3, creamy: 2, amber: 2, resinous: 1 },
    neg: ['fresh', 'citrusy', 'green', 'clean'] },
];

/* 把用户前面答过的三项（冷暖 / 甜度 / 初始偏好）折算成三维坐标，
   用来给这七个选项排序 —— 最贴用户已表达偏好的那项排第一、并预选中。
   这样这一屏不再是"再问一遍你喜欢什么"，而是"我们把前面几条对一下账，对吗"。

   来源：
     · 冷暖  ← state.answers.temperature（第 3 步 ②）
     · 甜度  ← state.answers.sweetness（第 3 步 ③）
     · 轻重  ← state.answers.family（第 1 步选的家族所属的重量档）
   三项都没答时返回全 0，七个选项按原顺序排，不预选。 */
const FAM_WEIGHT = {
  citrus: -1, floral: -1, fresh: -1,
  woody: 1, amber: 1, gourmand: 1,
};
function deriveDims(answers) {
  const t = answers.temperature;   // 'warm' | 'cool' | 'neutral' | undefined
  const s = answers.sweetness;     // 0..3 | undefined
  const fam = answers.family;
  const temp = t === 'cool' ? -1 : t === 'warm' ? 1 : 0;
  /* 甜度四档映射到 -1..1：0 完全不甜 → -1，3 很甜 → 1 */
  const sweet = s == null ? 0 : (Number(s) / 3) * 2 - 1;
  const weight = fam && FAM_WEIGHT[fam] != null ? FAM_WEIGHT[fam] : 0;
  return { temp, sweet, weight };
}

/* 七个选项按"与用户已答三维的距离"升序排。距离用加权平方和：
   冷暖权重 1.0（最直观）、甜度 0.8、轻重 0.6（最抽象，答得最少）。
   返回新数组，不改原常量。 */
function rankCharacterPresets(answers) {
  const d = deriveDims(answers || {});
  const W = { temp: 1.0, sweet: 0.8, weight: 0.6 };
  const scored = CHARACTER_PRESET.map((c, i) => {
    const dd = c.dims;
    let dist = 0;
    let norm = 0;
    for (const k of ['temp', 'sweet', 'weight']) {
      if (!d[k]) continue;            // 用户没答这一维 → 不参与
      dist += W[k] * ((dd[k] - d[k]) / 2) ** 2;
      norm += W[k];
    }
    return { item: c, dist: norm ? dist / norm : 0, order: i };
  });
  scored.sort((a, b) => (a.dist - b.dist) || (a.order - b.order));
  return scored.map((x) => x.item);
}

/* 从气质原型反推冷暖与甜度（v37）。
   为什么可以反推：七个原型的 dims 正好是 temp × sweet × weight 的 2×2×2 缺一格
   （见 CHARACTER_PRESET 每条定义）。选了哪个原型，冷暖与甜度就已经确定了 ——
   再单独问一遍等于把同一个信息问三次，而用户的三次回答还可以互相矛盾。

   实测（2026-11-09，150 组随机画像）：
     「只答气质」vs「气质 + 手答冷暖甜度」top-10 重叠 5.35/10、
     top-1 换 44.0% —— 差异不是来自新信息，而是来自"手答那两项能不能对上气质"。
     同一原型下，手答一致时总分 +20~22 分、手答矛盾时只 +10 分，
     即现状允许用户用②③把①的结论推翻一半，而界面上看不出来。

   映射不追求精细：
     · temp  -1 → 'cool'，+1 → 'warm'（原型里没有 neutral）
     · sweet -1 → 1（不甜），+1 → 3（很甜）；中间档 2 不产出，
       因为原型本身是二值的，硬造一个中间值等于编数据。
   这两项仍然写进 state.answers，scoring 那条路径完全不用改。 */
function deriveFromPreset(id) {
  const c = CHARACTER_PRESET.find((x) => x.id === id);
  if (!c || !c.dims) return null;
  return {
    temperature: c.dims.temp > 0 ? 'warm' : 'cool',
    sweetness: c.dims.sweet > 0 ? 3 : 1,
  };
}


/* ---------- 第 8 步：浓度 ----------
   新手最容易被浓度搞晕：EDT / EDP / Parfum 到底差在哪。
   这一屏的核心不是选项，是那张说明 —— 让用户看懂再选。
   数据覆盖 348/400，其余 52 瓶不参与这一维打分（不扣分）。 */
const CONCENTRATIONS = [
  { id: 'eau-de-cologne', zh: '古龙水 EDC', desc: '香精约 2–4%。1–3 小时，随时补喷，夏天最舒服' },
  { id: 'eau-de-toilette', zh: '淡香水 EDT', desc: '香精约 5–15%。3–5 小时，日常通勤的主力' },
  { id: 'eau-de-parfum', zh: '淡香精 EDP', desc: '香精约 15–20%。5–8 小时，一瓶顶一天' },
  { id: 'parfum', zh: '香精 Parfum', desc: '香精约 20–30%。8 小时以上，一两喷就够' },
];

/* ---------- 第 9 步：留香时长 ----------
   **这一屏的值全部是推断的。** 数据源没有持香实测字段，
   longevityInferred 是由浓度按 taxonomy.concentrationLongevity.map 推出来的。
   所以三处都标：①选项文字里带「推断」；②这段说明；③结果页理由句里
   写「按浓度推断」。三处都在，是因为这三处用户都会看到，
   任何一处漏掉都会变成"编造事实"。 */
const LONGEVITY = [
  { id: '2', zh: '2–3 小时', desc: '出门前喷，到中午基本没了。适合只想短暂闻一下' },
  { id: '3', zh: '3–5 小时', desc: '一个上午或一个下午。日常最常见' },
  { id: '4', zh: '5–8 小时', desc: '一个工作日。下班还能闻到' },
  { id: '5', zh: '8 小时以上', desc: '跨天。衣服上留到第二天，一两喷就够' },
];




/* ---------- 第 13 步：已知锚点（试过且喜欢的香水 / 味道） ----------
   **这一屏是整套问卷里信噪比最高的一个输入。**
   前面 12 屏问的都是"偏好声明"，用户对自己的偏好往往说不太准
   （新手尤其如此）；而"我试过这瓶，喜欢"是**真实反馈**。
   做法：拿到那瓶香水的 notesAll（400 瓶全覆盖，平均 8.6 味），
   去和候选池做香调重合度 —— 比任何加权都直接。

   两种输入并存：
     ① 从 102 个品牌里选（下拉），再选该品牌的瓶子 —— 适合知道自己喷什么的人；
     ② 直接点名几个香调（复用第 4 步的 chip 组件）—— 适合记不住名字、
        但记得"那个有佛手柑和雪松的"的人。
   两种可以同时用，取并集当锚点。 */
/* ---------- 可搜索组合框（E6）----------

   品牌有 133 个。原生 <select> 只能滚 —— 这是整个问卷里唯一无法用键盘
   或输入法快速到达的地方：想找 Creed 要按 c-r-e 无反应，只能用首字母跳。

   为什么不用 <input list="..."> + <datalist>：datalist 的候选项在
   Chrome/Safari/Firefox 三家的渲染、过滤规则与键盘行为都不一致，
   且无法给候选项加"已选"标记。

   这里自己拼一个：input + 列表。约束三条：
     ① 输入即过滤（大小写不敏感、支持子串）
     ② ↑↓ 导航、Enter 选中、Esc 关闭、Blur 关闭
     ③ 空结果必须给出路：「没找到？直接点下面的香调」

   ARIA 用 combobox 模式：input 上 role=combobox + aria-expanded +
   aria-controls + aria-activedescendant；列表 role=listbox，项 role=option。 */
function brandCombobox(opts) {
  const { items, placeholder, onPick, label } = opts;
  /* value 必须可变。
     第一版把它当成常量解构出来，close() 里写 `input.value = value` 想"恢复成
     已选值"，但选中之后 value 从没更新过 —— 于是选完立刻被清空，
     表现是"点了 Creed，输入框变空白，但香水下拉确实出现了 31 个选项"。
     实测抓到的就是这个：input.value='' 而 select 已经建好。 */
  let value = opts.value || '';
  const root = el('div', { class: 'combo' });
  const listId = 'combo-list-' + Math.random().toString(36).slice(2, 8);

  const input = el('input', {
    class: 'combo-input',
    type: 'text',
    role: 'combobox',
    'aria-label': label || placeholder || '',
    'aria-expanded': 'false',
    'aria-controls': listId,
    'aria-autocomplete': 'list',
    autocomplete: 'off',
    placeholder: value || placeholder || '',
    value: value || '',
  });

  const list = el('ul', { class: 'combo-list', id: listId, role: 'listbox' });
  list.style.display = 'none';

  let filtered = [];
  let active = -1;
  let opened = false;

  const setActive = (i) => {
    active = i;
    [...list.children].forEach((li, k) => {
      const on = k === i;
      li.classList.toggle('is-active', on);
      li.setAttribute('aria-selected', String(on));
    });
    if (i >= 0 && list.children[i]) {
      input.setAttribute('aria-activedescendant', list.children[i].id);
      /* 让高亮项滚进视野。block:'nearest' 不会带动整页滚动。 */
      list.children[i].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  };

  const close = () => {
    opened = false;
    list.style.display = 'none';
    input.setAttribute('aria-expanded', 'false');
    // 关掉时若输入框里是半截过滤词而不是已选项，恢复成已选值
    input.value = value || '';
  };

  const open = () => {
    opened = true;
    list.style.display = 'block';
    input.setAttribute('aria-expanded', 'true');
  };

  const render = (q) => {
    const needle = String(q || '').trim().toLowerCase();
    filtered = needle
      ? items.filter((b) => b.toLowerCase().includes(needle))
      : items;
    // 上限 60：133 项全铺开会让列表高过视口，滚动反而更难找
    const shown = filtered.slice(0, 60);
    list.innerHTML = '';
    if (!shown.length) {
      list.appendChild(el('li', { class: 'combo-empty' },
        '没找到「' + q + '」。可以直接点下面的香调，或换个拼法试试'));
      setActive(-1);
      return;
    }
    shown.forEach((b, i) => {
      list.appendChild(el('li', {
        class: 'combo-item' + (b === value ? ' is-on' : ''),
        role: 'option',
        id: listId + '-' + i,
        'aria-selected': 'false',
        onclick: () => { pick(b); },
      }, b));
    });
    // 过滤后默认高亮第一个 —— 这样「输入 + Enter」是最短路径
    setActive(needle ? 0 : -1);
  };

  const pick = (b) => {
    value = b;          /* 先更新，close() 里要用它回填 */
    input.value = b;
    onPick(b);
    close();
    input.focus();
  };

  input.addEventListener('input', () => {
    if (!opened) open();
    render(input.value);
  });
  input.addEventListener('focus', () => {
    if (!opened) { open(); render(input.value === value ? '' : input.value); }
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!opened) { open(); render(input.value); return; }
      const n = list.querySelectorAll('.combo-item').length;
      if (!n) return;
      const d = ev.key === 'ArrowDown' ? 1 : -1;
      setActive((active + d + n) % n);
      return;
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const li = list.querySelector('.combo-item.is-active');
      if (li) pick(li.textContent);
      else if (filtered.length === 1) pick(filtered[0]);
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      close();
    }
  });
  input.addEventListener('blur', () => {
    /* 用 setTimeout 而不是直接关：blur 早于点击，直接关会让点击落空。 */
    setTimeout(() => { if (opened) close(); }, 120);
  });

  root.appendChild(input);
  root.appendChild(list);
  return root;
}

/* ============================================================
   第 1 屏：预算（标本签的价签行）
   ------------------------------------------------------------
   ==== 内容隐喻 ====
   预算不是"填一个数字"，是**从货架上取下一个价位区间**。
   所以交互不是输入框，是四枚价签横排：每枚写着区间与"这一档有几瓶"，
   选中时价签的下沿像被剪开一样翻起 —— 剪口是标本签的固有形态
   （挂绳穿过的地方），也是这一屏唯一属于它的效果。

   ==== 为什么候选数必须写在价签上 ====
   实测 622/1388 瓶能查到价。不写数字，"300 元以内"看起来和"1200 元以上"
   一样大；写了数字，用户立刻看见 152 vs 165 —— 四档是**等量级**的，
   不会出现"选了个只有 12 瓶的档"，也就不会出现"答完发现没货"。

   ==== 为什么价位未知的瓶子在具体档里不参与 ====
   见 poolForBudget() 的注释。这一屏的说明行必须把这句话写出来：
   用户可以接受"少了 766 瓶"，不能接受"选 300 以内却推荐 3000 元的"。
   ============================================================ */
function renderBudget() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('budget');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  const idx = priceIndex();
  const bands = idx && Array.isArray(idx.bands) ? idx.bands : [];
  const stats = idx && idx.stats ? idx.stats : null;

  const row = el('div', { class: 'price-row', role: 'radiogroup', 'aria-label': '价位区间' });
  /* 「不限 / 还不知道」永远在最后：它是退路，不该出现在第一个位置
     —— 第一个位置会被读成"推荐选项"。 */
  const opts = [...bands.map((b) => ({
    id: b.id,
    zh: b.zh,
    n: stats && stats.counts ? (stats.counts[b.id] || 0) : null,
  })), { id: (idx && idx.anyId) || 'any', zh: '不限 / 还不知道', n: null }];

  const total = stats ? stats.priced : null;
  const unknown = stats ? stats.unpriced : null;

  for (const o of opts) {
    const on = (state.answers.budget || 'any') === o.id;
    row.appendChild(el('button', {
      class: 'price-tab' + (on ? ' is-on' : ''),
      type: 'button',
      role: 'radio',
      'aria-checked': String(on),
      'data-budget': o.id,
      onclick: () => {
        state.answers.budget = o.id;
        [...row.children].forEach((c) => {
          const mine = c.getAttribute('data-budget') === o.id;
          c.classList.toggle('is-on', mine);
          c.setAttribute('aria-checked', String(mine));
        });
        paintNote();
      },
    },
      /* 剪口：一枚小三角，选中时翻起。用 span 而不是伪元素，
         因为要能被读屏忽略（aria-hidden）。 */
      el('span', { class: 'price-notch', 'aria-hidden': 'true' }),
      el('span', { class: 'price-zh' }, o.zh),
      o.n != null ? el('span', { class: 'price-n' }, o.n + ' 瓶') : null
    ));
  }
  wrap.appendChild(row);

  /* 说明行跟着选择变：选具体档说"未知价位不参与"，选不限说"全库都上"。
     这两句不能合并成一句 —— 它们说的是完全不同的事实。 */
  const note = el('p', { class: 'price-note' });
  const paintNote = () => {
    const cur = state.answers.budget || 'any';
    const isAny = cur === ((idx && idx.anyId) || 'any');
    note.classList.toggle('is-idle', isAny);
    note.textContent = isAny
      ? `全库 ${(stats ? stats.totalPerfumes : 1388)} 瓶都能挑；其中 ${unknown != null ? unknown : 766} 瓶价位未知，也会一起参与`
      : `只在这一档里挑。${unknown != null ? unknown : 766} 瓶价位未知的不参与 —— 它们在每一档都可能，混进来会推出买不起的瓶子`;
  };
  paintNote();
  wrap.appendChild(note);

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '关于这个价位：'),
    ` 价来自淘宝商品页标价，不是同规格瓶的专柜价；全库 ${(stats ? stats.totalPerfumes : 1388)} 瓶里 ${total != null ? total : 622} 瓶能查到价，`
    + ' 其余价位未知。选具体档时，价位未知的不参与；选「不限」时它们也在。'
  ));

  wrap.appendChild(navBar('budget'));
  return wrap;
}

/* ============================================================
   第 2 屏：大方向（昼夜光景）
   ------------------------------------------------------------
   ==== 内容隐喻 ====
   这一题问的不是味道，是"什么时候、什么光线下你希望被闻到"。
   所以控件是一片**天色**：六个方向各占一条地平线，从左到右是
   天光从冷到暖、从暗到亮的连续过渡 —— 位置本身在教用户"这些不是并列的六样东西，
   是同一天里的六个时刻"。

   ==== 为什么它是背景层的源头 ====
   规格 3：底噪由**第一个大方向**定调。所以这一屏在被选中的那一刻，
   要让人看见"天色定了"：选中扇区的天色向上漫开一格，成为后续所有屏的底色起点。
   这个"漫开"只做一次、只在这一屏 —— 后面各屏的底噪只加不减，不再重演。

   ==== 反馈是内容本身的变化 ====
   选中后不再新增任何控件：地平线本身抬高一档、下方那行译文换成这个方向的
   "一天里的哪一刻"。不弹层、不换容器。
   ============================================================ */
function renderDirection() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('emotion');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  const items = TAX && TAX.emotionMap ? TAX.emotionMap : [];
  const sky = el('div', { class: 'sky', role: 'radiogroup', 'aria-label': '整体方向' });
  const gloss = el('p', { class: 'sky-gloss is-idle' });

  /* 每个方向配一句"一天里的哪一刻"。这不是新内容：
     taxonomy 的 desc 是气味层面的（「像晒太阳、像羊绒衫」），
     这里补的是**时间层面**的对应，用于让"底噪定调"这件事可被感知。 */
  const MOMENT = {
    cold: '清晨六点，窗还没开',
    warm: '下午三点，阳光斜进屋里',
    clean: '刚洗完澡的浴室，灯是白的',
    mysterious: '入夜后，只开了一盏台灯',
    bright: '正午，所有东西都是清楚的',
    lazy: '周末上午，赖着没起床',
  };

  const paint = (cur) => {
    [...sky.children].forEach((c) => {
      const on = c.getAttribute('data-dir') === cur;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-checked', String(on));
    });
    const it = items.find((x) => x.id === cur);
    gloss.classList.toggle('is-idle', !it);
    gloss.textContent = it
      ? `${MOMENT[it.id] || ''} —— ${it.desc}`
      : '选一个最接近的。这一题定的是整程的调子，后面每一屏都会沿它走';
  };

  items.forEach((it) => {
    const on = state.answers.emotion === it.id;
    sky.appendChild(el('button', {
      class: 'sky-band' + (on ? ' is-on' : ''),
      type: 'button',
      role: 'radio',
      'aria-checked': String(on),
      'data-dir': it.id,
      onclick: () => {
        state.answers.emotion = it.id;
        /* 气质/冷暖/甜度由方向反推（v6 的气质屏已退场，这一维不能白丢）。 */
        applyDirectionToCharacter(it.id);
        paint(it.id);
        applyAmbient();
      },
    },
      el('span', { class: 'sky-line', 'aria-hidden': 'true' }),
      el('span', { class: 'sky-zh' }, it.zh),
      el('span', { class: 'sky-moment' }, MOMENT[it.id] || '')
    ));
  });

  paint(state.answers.emotion);
  wrap.appendChild(sky);
  wrap.appendChild(gloss);

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '为什么先问这一题：'),
    ' 它决定后面每一屏的光线与温度 —— 选「清冷」整程会越走越凉，选「温暖」会越走越暖。'
    + ' 这不是装饰：同一瓶香水在不同光线下读起来是两种东西。'
  ));

  wrap.appendChild(navBar('emotion'));
  return wrap;
}

function renderAnchor() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('anchor');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  /* 说明从"为什么这一屏最有用"改成"为什么答不出很正常"。
     原句「这一屏最有用」对零基础用户是压力：他恰恰是最不知道该答什么的那批人。
     真正该讲的信息是**为什么不知道名字是常态**（大家用完就扔瓶子），
     以及"记得牌子就够了"。 */
  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '不记得名字很正常：'),
    ' 大部分人用完就把瓶子扔了，能想起牌子已经很不容易。',
    ' 记得牌子就选牌子——哪怕记不清是哪一瓶，随便挑一支风格接近的也比空着强。'
  ));

  /* --- 输入 ①：品牌 → 香水 --- */
  const brands = [...new Set((DATA?.perfumes || []).map((p) => p.brand))].sort();
  wrap.appendChild(el('div', { class: 'chips-label' }, '我记得是哪一瓶（可选）'));

  if (!DATA?.perfumes?.length) {
    wrap.appendChild(el('p', { class: 'q-help' }, '香水库还在加载，稍等一下再选品牌'));
  } else {
    const perfumeSlot = el('div', { class: 'anchor-slot' });
    /* E6：133 个品牌换成可搜索组合框。
       原生 select 只能滚，是全场唯一无法用输入法快速到达的地方。
       换品牌要清掉已选的那瓶 —— 否则会出现"Byredo 的瓶子 + Creed 的品牌"。 */
    const selBrand = brandCombobox({
      items: brands,
      value: state.answers.anchorBrand,
      placeholder: `搜索品牌（共 ${brands.length} 个，输入几个字母即可）`,
      label: '品牌',
      onPick: (b) => {
        state.answers.anchorBrand = b || null;
        state.answers.anchorPerfume = null;
        state.answers.anchorPerfumeNotes = [];
        /* 只重建「香水下拉」那一块，不调 render() ——
           调 render() 会整页重绘：组合框失焦、下面已勾的香调 chip 全部丢状态。 */
        if (perfumeSlot) {
          perfumeSlot.innerHTML = '';
          perfumeSlot.appendChild(buildPerfumeSelect());
        }
      },
    });
    wrap.appendChild(selBrand);

    function buildPerfumeSelect() {
      const list = (DATA.perfumes || []).filter((p) => p.brand === state.answers.anchorBrand);
      return el('select', {
        class: 'anchor-select',
        'aria-label': '香水',
        onchange: (ev) => {
          state.answers.anchorPerfume = ev.target.value || null;
          /* 选中某一瓶时，把它的 notesAll 抄进答案。
             引擎侧拿这个集合算重合度 —— 比让用户自己点 8 个香调准得多，
             也是这一屏存在的意义（真实反馈 > 偏好声明）。 */
          const picked = (DATA.perfumes || []).find((x) => x.id === state.answers.anchorPerfume);
          state.answers.anchorPerfumeNotes = picked ? (picked.notesAll || []) : [];
        },
      },
        el('option', { value: '' }, `选择 ${state.answers.anchorBrand} 的哪一瓶（${list.length} 瓶）`),
        ...list.map((p) => el('option', {
          value: p.id,
          selected: state.answers.anchorPerfume === p.id ? 'selected' : null,
        }, `${p.name}${p.concentrationLabelZh ? ' · ' + p.concentrationLabelZh : ''}`))
      );
    }
    if (state.answers.anchorBrand) perfumeSlot.appendChild(buildPerfumeSelect());
    wrap.appendChild(perfumeSlot);
  }

  /* --- 输入 ②：直接点名香调 ---
     复用第 4 步的 chip 组件：这里的语义和第 4 步"我喜欢这些味道"几乎一样，
     区别只在于它是"锚点"而非"加分项" —— 锚点会和候选做重合度比对，
     而加分项只是 +14。同一个控件、两种权重，用户不需要学第二套交互。 */
  wrap.appendChild(el('div', { class: 'chips-label', style: 'margin-top:18px' },
    '或者，记得是哪几种味道（可多选）'));
  const usable = getUsableNotes();
  const box = el('div', { class: 'chips' });
  usable.slice(0, 24).forEach((n) => {
    const on = (state.answers.anchorNotes || []).includes(n.en);
    const chip = el('button', {
      class: 'chip',
      type: 'button',
      'data-anchor': n.en,
      'aria-pressed': String(on),
      onclick: () => {
        const arr = state.answers.anchorNotes || (state.answers.anchorNotes = []);
        const i = arr.indexOf(n.en);
        if (i >= 0) arr.splice(i, 1); else arr.push(n.en);
        const now = arr.includes(n.en);
        chip.classList.toggle('neg', false);
        chip.setAttribute('aria-pressed', String(now));
      },
    }, n.zh);
    box.appendChild(chip);
  });
  wrap.appendChild(box);
  wrap.appendChild(el('div', { class: 'term-note' }, '选多少都行，选得越多越接近你记忆里那瓶。'));

  wrap.appendChild(navBar('anchor'));
  return wrap;
}

/* ============================================================
   第 3 / 4 屏：想要的味道 / 受不了的味道（生活短语）
   ------------------------------------------------------------
   ==== 为什么不用香材名 ====
   规格底线：全程无香调术语题。上一版这两屏列的是「佛手柑 / 零陵香豆 /
   橡苔」—— 一个零基础用户既不认识这些词，也无法判断自己喜不喜欢。
   它们不是"选项"，是考卷。

   ==== 为什么仍然是"点名具体东西"而不是"挑一个大类" ====
   引擎侧 likedNotes 是 +14、dislikedNotes 是 **-40**。这两个因子之所以有效，
   恰恰因为它们是具体的：点「香草」只命中含香草的瓶，点「甜的」等于没点。
   所以术语必须消失，**具体性不能消失** —— 生活短语就是这两件事的交点：
   「刚剥开的橘子皮」任何一个人都能判断，同时精确对应 bergamot/lemon/grapefruit。

   ==== 交互 ====
   多选。点一张卡，它自己翻成"已收下"的样子并移到队首（已选置顶），
   下方那一行译文换成这个短语的身体经验（规格 5：选项区常驻一句生活化译文行）。
   不弹层、不换控件 —— 反馈是内容本身的变化。

   ==== 两屏共用一个渲染器 ====
   差别只有 key / 标题 / 语气 / 色调。写两个几乎相同的函数，
   下次改交互要改两遍且必然漏一处。
   ============================================================ */
function renderLifePicker(kind) {
  const neg = kind === 'unwanted';
  const key = neg ? 'unwanted' : 'wanted';
  const stepId = neg ? 'unwanted' : 'wanted';

  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead(stepId);
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  /* 库未到：短语的命中数要读香水库，没有就先给全表。
     短语表本身是静态的，先画出来；库到了也不影响已选。 */
  const items = livePhrases();

  const bar = el('div', { class: 'life-bar' });
  wrap.appendChild(bar);

  const grid = el('div', { class: 'life-grid' + (neg ? ' is-neg' : '') });
  wrap.appendChild(grid);

  /* 译文行：常驻。选了什么说什么，没选时说这一屏在挑什么 ——
     规格 5 要求它"常驻"，所以不能只在选中后出现。 */
  const gloss = el('p', { class: 'life-gloss is-idle' });
  wrap.appendChild(gloss);

  const paintBar = () => {
    const sel = state.answers[key] || [];
    bar.innerHTML = '';
    if (!sel.length) {
      bar.appendChild(el('span', { class: 'life-count is-empty' }, '还没点名任何一个'));
      return;
    }
    bar.appendChild(el('span', { class: 'life-count is-on' }, `已收下 ${sel.length} 个`));
    /* 已选的做成可撤小签：点一下取消。
       为什么不回网格里取消：网格里已选项被置顶了，选的落点与取消的落点
       是同一块区域，误触会让人反复选/取消。小签在网格外，位置稳定。 */
    for (const id of sel) {
      const d = items.find((x) => x.id === id) || LIFE_NOTES.find((x) => x.id === id);
      if (!d) continue;
      bar.appendChild(el('button', {
        class: 'life-tag', type: 'button',
        onclick: () => { togglePhrase(id); redraw(); },
        'aria-label': '取消 ' + d.zh,
      }, d.zh, el('span', { class: 'life-tag-x', 'aria-hidden': 'true' }, '×')));
    }
  };

  const paintGloss = () => {
    const sel = state.answers[key] || [];
    const last = sel.length ? LIFE_NOTES.find((x) => x.id === sel[sel.length - 1]) : null;
    gloss.classList.toggle('is-idle', !last);
    gloss.textContent = last
      ? `${last.zh} —— ${last.hint}`
      : (neg
        ? '想到哪一个点哪一个。实在想不起来就跳过，这一屏可以空着走'
        : '想到哪一个点哪一个。一个都想不起来就跳过，后面还有别的维度');
  };

  function togglePhrase(id) {
    const sel = state.answers[key] || (state.answers[key] = []);
    const i = sel.indexOf(id);
    const otherKey = neg ? 'wanted' : 'unwanted';
    if (i >= 0) {
      sel.splice(i, 1);
    } else {
      sel.push(id);
      /* 同一条短语不能既"想要"又"受不了"：从对面移除。
         否则引擎会同时拿到 +14 与 -40 两个互相打架的因子。 */
      const o = state.answers[otherKey] || [];
      const oi = o.indexOf(id);
      if (oi >= 0) o.splice(oi, 1);
    }
    syncPhrasesToNotes();
  }

  /* ==== 为什么点击是**就地改状态**、而不是重建整栏 ====
     第一版点一下就 `grid.innerHTML = ''` 再铺一遍（为了"已选置顶"）。
     两个后果都实测到了：
       ① 被点的那个节点从 DOM 里消失，焦点掉回 body —— 键盘用户点一次
          就得重新 Tab 一长串卡片，这是本仓 chip 那屏早就踩过的坑
          （见 notes 屏里 "就地更新，不重建整栏" 的注释）；
       ② 节点身份变了，任何持有旧引用的地方都读不到新状态。
     所以现在分两层：**选中态就地改**（class / aria / 计数 / 译文），
     **顺序只在那一项真的需要移动位置时才动**（用 insertBefore 搬节点，
     不重建）。同一屏里既没有长列表也没有滚动位置问题，这样最省事也最稳。 */
  const redraw = () => {
    const sel = state.answers[key] || [];
    /* 首次铺：按 items 顺序铺一遍，并给每张卡挂 data-phrase 便于后续就地查。 */
    grid.innerHTML = '';
    const ordered = [
      ...sel.map((id) => items.find((x) => x.id === id)).filter(Boolean),
      ...items.filter((x) => !sel.includes(x.id)),
    ];
    const hit = DATA?.perfumes?.length ? lifeNoteHitCount() : null;
    for (const d of ordered) {
      const on = sel.includes(d.id);
      const cnt = hit ? (hit.get(d.id) || 0) : null;
      grid.appendChild(el('button', {
        class: 'life-card' + (on ? ' is-on' : '') + (neg ? ' is-neg' : ''),
        type: 'button',
        'data-phrase': d.id,
        'aria-pressed': String(on),
        onclick: (ev) => onCardClick(d.id, ev && ev.currentTarget),
      },
        el('span', { class: 'life-zh' }, d.zh),
        el('span', { class: 'life-hint' }, d.hint),
        /* 库内命中数：不是"推荐度"，是"我们有多少瓶含这个东西"。
           写出来是为了让"点了没反应"这件事不发生 —— 看见 0 的选项就不会点。 */
        cnt != null ? el('span', { class: 'life-n', 'aria-hidden': 'true' }, String(cnt)) : null
      ));
    }
    paintBar();
    paintGloss();
  };

  /* 就地切换：改状态 → 改这一张卡自己的样子 → 需要时把它搬到队首。
     焦点留在原节点上（搬节点不会丢焦点，重建才会）。 */
  function onCardClick(id, node) {
    const sel = state.answers[key] || (state.answers[key] = []);
    const wasOn = sel.includes(id);
    togglePhrase(id);
    const nowOn = sel.includes(id);
    if (node) {
      node.classList.toggle('is-on', nowOn);
      node.setAttribute('aria-pressed', String(nowOn));
      /* 只在"刚被收下"时搬到队首；取消时不搬回原位 ——
         搬回去会让刚取消的那张跳到远处，用户找不到自己刚点的是什么。 */
      if (!wasOn && nowOn && grid.firstChild !== node) {
        grid.insertBefore(node, grid.firstChild);
      }
    }
    paintBar();
    paintGloss();
  }

  redraw();

  wrap.appendChild(el('div', { class: 'term-note' },
    neg
      ? el('strong', {}, '这一题比上一题更有效：')
      : el('strong', {}, '想不起来也没关系：'),
    neg
      ? ' 讨厌的东西没有替代品，喜欢的东西往往能找到几个相似的 —— 排除一项，比多喜欢一项更能收窄范围。'
      : ' 跳过这一屏，后面还有几屏在问别的维度。'
  ));

  wrap.appendChild(navBar(stepId));
  return wrap;
}

/* 把短语状态同步到引擎认识的两个字段。
   这是整条映射层的唯一写入口 —— 别处不许直接写 likedNotes/dislikedNotes，
   否则漏一次同步就会出现"界面上勾了、引擎不知道"。 */
function syncPhrasesToNotes() {
  state.answers.likedNotes = notesOfPhrases(state.answers.wanted);
  state.answers.dislikedNotes = notesOfPhrases(state.answers.unwanted);
  state.answers.likedZh = zhOfPhrases(state.answers.wanted);
  state.answers.dislikedZh = zhOfPhrases(state.answers.unwanted);
}

function renderWanted() { return renderLifePicker('wanted'); }
function renderUnwanted() { return renderLifePicker('unwanted'); }


/* ============================================================
   第 5 屏：场合（昼夜光景）
   ------------------------------------------------------------
   ==== 内容隐喻 ====
   场合问的是"什么时候用"，那就把它画成**一天**：五个场合依时段
   从左到右排在一条地平线上 —— 上班/上课、日常/居家、运动/户外在白天，
   约会、正式场合在傍晚之后。位置的顺序就是时间的顺序，
   用户不用理解"场合"这个抽象名词，看一眼天色就知道自己在选哪一段。

   ==== 为什么保留圆盘 ====
   圆盘的成立条件是「控件几何 = 内容结构」，而场合的几何不是树，
   是一天。所以**圆心那套同心环不搬**，只留它可点、可读、可键盘操作的
   交互纪律（真实 button + radiogroup + roving tabindex + 44px 触达），
   几何交给地平线：弧段角度 = 时刻，段长 = 这段时间有多常用。

   ==== 反馈是内容本身的变化 ====
   选中一段，那段的天色由灰转实（.is-on 给一段天光渐变），
   同时下方译文换成这个场合的「光线 + 距离」描述：
   通勤是"白天的办公室里、一臂距离"，约会是"晚上、靠近才闻到"。
   不再新增控件、不弹层。
   ============================================================ */
function renderOccasion() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('occasion');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  const items = TAX && TAX.occasionMap ? TAX.occasionMap : [];

  /* 排序：按**时段**（白天在前、傍晚在后），同时段内保持 taxonomy 的原始顺序。
     时段取自 src/scoring.js 的 OCCASION_TIME（与引擎的 timesOfDay 因子同一份口径），
     在这里复述一次而不是 import：这一屏在库加载失败时也要能画出来。
     **这份顺序就是地平线的顺序，不由 CSS 决定** —— 位置是内容，不能靠样式排。 */
  const TIME = { commute: 'day', daily: 'day', outdoor: 'day', date: 'evening', formal: 'evening' };
  const TIME_ORDER = { day: 0, evening: 1 };
  const ordered = items
    .map((o, i) => ({ o, i, t: TIME_ORDER[TIME[o.id]] ?? 0.5, time: TIME[o.id] || 'day' }))
    .sort((a, b) => (a.t - b.t) || (a.i - b.i));

  /* 每个场合的「光线 + 距离」译文。这两件事正是场合真正影响推荐的地方：
     时段（timesOfDay 因子 6 分）与扩散上限（maxSillage）。 */
  const SCENE = {
    commute: '白天的办公室，一臂距离 —— 要让同事闻到一点点，不能更多',
    date: '晚上，靠近才闻到 —— 距离近，所以要有记忆点',
    daily: '自己家里，不为了谁 —— 舒服优先，味道淡一点也没关系',
    formal: '晚上，正装场合 —— 要站得住，不能轻飘',
    outdoor: '白天，户外 —— 会出汗、会补喷，所以清爽比浓度重要',
  };

  const sky = el('div', { class: 'hour-sky' });
  const gloss = el('p', { class: 'hour-gloss is-idle' });

  const paint = (cur) => {
    /* 必须在 rail 里找，不能在 sky 里找 —— sky 的直接子节点是
       .hour-glow / .hour-rail / .hour-ends 三块容器，段本身住在 rail 里。
       第一版写成 [...sky.children] 遍历，一个 .hour-band 都碰不到，
       于是"点一段后天色转实"永远不成立（test-render 抓到）。 */
    [...rail.children].forEach((c) => {
      const on = c.getAttribute('data-occ') === cur;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-checked', String(on));
    });
    const it = ordered.find((x) => x.o.id === cur);
    const occ = it ? it.o : null;
    gloss.classList.toggle('is-idle', !occ);
    gloss.textContent = occ
      ? `${SCENE[occ.id] || occ.desc}`
      : '选一个最像的。拿不准就选日常 —— 它是最宽的那一档';
  };

  /* 地平线本体。用 radiogroup 托管，子项是真实 button：
     弧段的视觉由 CSS 的 .hour-band 负责，可点的是叠在上面的 button。 */
  const rail = el('div', { class: 'hour-rail', role: 'radiogroup', 'aria-label': '使用场合' });
  ordered.forEach((row, i) => {
    const it = row.o;
    const on = state.answers.occasion === it.id;
    rail.appendChild(el('button', {
      class: 'hour-band' + (on ? ' is-on' : '') + (row.time === 'evening' ? ' is-night' : ''),
      type: 'button',
      role: 'radio',
      'aria-checked': String(on),
      'data-occ': it.id,
      /* roving tabindex：整组只留一个 Tab 落点，方向键在组内移动。 */
      tabindex: on || (state.answers.occasion == null && i === 0) ? '0' : '-1',
      onclick: () => {
        state.answers.occasion = it.id;
        paint(it.id);
        /* 时段也是背景层的一个输入（SEASON/intensity 之外），
           但只调浓度不改方向 —— 见 src/ambient.js 第 2 条。 */
        applyAmbient();
      },
      onkeydown: (ev) => {
        let d = 0;
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') d = 1;
        else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') d = -1;
        else return;
        ev.preventDefault();
        const to = (i + d + ordered.length) % ordered.length;
        state.answers.occasion = ordered[to].o.id;
        paint(ordered[to].o.id);
        applyAmbient();
        rail.children[to].focus();
      },
    },
      el('span', { class: 'hour-zh' }, it.zh),
      el('span', { class: 'hour-desc' }, it.desc)
    ));
  });

  sky.appendChild(el('div', { class: 'hour-glow', 'aria-hidden': 'true' }));
  sky.appendChild(rail);
  /* 晨 / 夜两个端点刻度：让"这是一条时间轴"这件事成立，
     否则五段只是五个横格子。它们是刻度，不是装饰标签。 */
  sky.appendChild(el('div', { class: 'hour-ends', 'aria-hidden': 'true' },
    el('span', {}, '早晨'), el('span', {}, '夜里')));

  paint(state.answers.occasion);
  wrap.appendChild(sky);
  wrap.appendChild(gloss);

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '为什么问场合：'),
    ' 场合决定浓度下限与时段。同一瓶香水在通勤和约会里的宽容度差得很远，'
    + ' 这一项比"你觉得自己喜欢什么"更稳定。'
  ));

  wrap.appendChild(navBar('occasion'));
  return wrap;
}



/* ============================================================
   第 6 屏：季节（温度光带）
   ------------------------------------------------------------
   ==== 内容隐喻 ====
   季节不是四个并列的名字，是**一根温度轴**：冷 ←→ 热。
   所以控件是一条从冷到热的连续光带，四个季节落在带上各自的温度位置 ——
   位置本身就是温度读数，用户不用理解"春/夏/秋/冬"作为分类名词的含义，
   只需要指"我打算在哪个温度下用它"。

   ==== 为什么这一屏是定版范例 ====
   规格 5·补：季节题→温度光带。它的成立条件是
   "效果从本題内容里长出来"：温度是季节真正影响推荐的那个量
   （引擎侧 season 因子 10 分 + 次选 5 分），所以光带的色温必须真的
   随档位变，而不是四条等宽按钮换了个颜色。
   注意：这条光带**只属于这一屏**，不许拿去当全卷底噪 ——
   全卷底噪来自第 2 屏的大方向（见 src/ambient.js 第 1 条纪律）。

   ==== 反馈是内容本身的变化 ====
   选中一档，光带整体移到那一档的温度：色相从青转橙、亮度给出"这一天有多晒"，
   下方译文换成该季节的体感（"湿冷、要压得住的风"）。
   ============================================================ */
const SEASONS = [
  { id: 'spring', zh: '春', desc: '花开、微湿。轻盈花香与绿感最合适', temp: 0.1 },
  { id: 'summer', zh: '夏', desc: '热、出汗多。要清透，浓香会闷', temp: 1 },
  { id: 'autumn', zh: '秋', desc: '干爽。木质与微甜都能上场', temp: 0.35 },
  { id: 'winter', zh: '冬', desc: '冷。需要能压住冷风的厚度', temp: -1 },
];

function renderSeason() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('season');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  /* 光带本体。--band-temp 由选中档写进（-1..1），CSS 用它算色相与亮度。
     这样"温度"是一个连续量，而不是四个开关量 —— 换成四个色块就退回按钮组了。 */
  const band = el('div', { class: 'temp-band' + (state.answers.season ? '' : ' is-idle'),
    role: 'radiogroup', 'aria-label': '主季节' });
  const glow = el('span', { class: 'temp-glow', 'aria-hidden': 'true' });
  band.appendChild(glow);

  const gloss = el('p', { class: 'temp-gloss is-idle' });

  /* 每档配一句"温度 + 身体感受"。这是译文行（规格 5），不是装饰文案：
     它把「冬」这个字翻译成"冷、要压得住的风"。 */
  const FEEL = {
    spring: '十几度，风里有水汽 —— 轻盈的花香和绿感最合适',
    summer: '三十度以上，会出汗 —— 太浓的会闷，清透才活得下来',
    autumn: '干、凉、空气薄 —— 木质和微甜都能上场',
    winter: '冷，要压得住风 —— 需要厚度，不然出门就散',
  };

  /* 停靠点先建好、再 paint —— 顺序不能反。
     paint() 要遍历四个 .temp-stop 点亮当前档；若在 appendChild 之前调用，
     那四个节点还不存在，一个都点不亮（第一版就是这个顺序，
     test-render 的"点一季后落点亮起"抓到）。所以这里先建，再 paint。 */
  const stops = [];
  SEASONS.forEach((s, i) => {
    const on = state.answers.season === s.id;
    /* 每档在光带上的位置由它的 temp 决定，**不平均分四格** ——
       平均分就把"温度轴"退回成"四个并列选项"。
       归一化：(temp + 1) / 2 → 0..1 的百分比。 */
    const pos = ((s.temp + 1) / 2) * 100;
    const stop = el('button', {
      class: 'temp-stop' + (on ? ' is-on' : ''),
      type: 'button',
      role: 'radio',
      'aria-checked': String(on),
      'data-season': s.id,
      style: 'left:' + pos.toFixed(1) + '%',
      tabindex: on || (state.answers.season == null && i === 0) ? '0' : '-1',
      onclick: () => {
        state.answers.season = s.id;
        paint(s.id);
        applyAmbient();
      },
    },
      el('span', { class: 'temp-zh' }, s.zh),
      el('span', { class: 'temp-dot', 'aria-hidden': 'true' })
    );
    stops.push(stop);
    band.appendChild(stop);
  });

  const paint = (cur) => {
    const it = SEASONS.find((s) => s.id === cur) || null;
    /* 温度写进 CSS 变量：没选时停在中间（0），不假装已经选了一档。 */
    band.style.setProperty('--band-temp', String(it ? it.temp : 0));
    band.classList.toggle('is-idle', !it);
    /* 遍历 stops 而不是 band.querySelectorAll：桩里的 querySelectorAll
       对 `.temp-stop` 支持没问题，但用静态数组更直接，也省一次树遍历。 */
    stops.forEach((n) => {
      const on = n.getAttribute('data-season') === cur;
      n.classList.toggle('is-on', on);
      n.setAttribute('aria-checked', String(on));
    });
    gloss.classList.toggle('is-idle', !it);
    gloss.textContent = it
      ? FEEL[it.id]
      : '按你打算主要在哪个季节用选一个；不确定就跳过，不答不扣分';
  };

  paint(state.answers.season);
  wrap.appendChild(band);
  wrap.appendChild(gloss);

  /* 这段数字是**用户可见**的，必须跟数据同步（1388 瓶实测，D56）。
     写错等于自拆台 —— 这类文字恰恰靠"说得具体"建立可信度。 */
  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '关于候选多少：'),
    ' 库里按季节标注为「春 1331 · 夏 840 · 秋 1357 · 冬 548」（1388 瓶中的标注覆盖数，每瓶平均标 2.9 个季节）。',
    ' 冬天能选的最少，这是数据分布，不是推荐变差了。'
  ));

  wrap.appendChild(navBar('season'));
  return wrap;
}

/* ============================================================
   第 7 屏：浓淡 + 浓度（扩散场）
   ------------------------------------------------------------
   ==== 内容隐喻 ====
   浓淡问的是"这团气味能走多远"。所以控件不是滑块，是一个**扩散场**：
   同心环从内到外是一臂 → 一桌 → 一屋 → 走廊，环的半径就是扩散距离。
   拖动穿过环时，场心的色团跟着涨大 —— 用户看到的是自己刚做的那个决定
   在空间里铺开，而不是一根条子上的数字从 2 变成 4。

   ==== 为什么浓度必须留在同一屏 ====
   浓度（香精占比）决定"这团气味能撑多久"，是同一个物理量的另一半：
   扩散距离 × 持续时间 = 分量。拆成两屏后用户看不见自己选了几个环，
   会答出"要很浓但选古龙水"这种互相打架的组合（旧版为此专门挂过跨屏提醒）。
   收进同一个场里之后，冲突变成**可见**的：内圈撑不住外圈时，
   最外那圈会虚掉并给一句提示 —— 界面自己解释矛盾，不靠文案打断。

   ==== 三个物件仍然编号 ====
   一屏里出现三个可读的东西时，必须能一眼说出"这是第几个"：
     ① 扩散到哪儿（同心环，可拖）
     ② 浓度类型（内圈那一排档位）
     ③ 大概能留多久（由 ② 推断，纯展示，不可点）
   ③ 不可点是刻意的：能改但不影响结果的控件比不给更糟
   （见 src/scoring.js 8c 段：同浓度下全库等加，对排序零贡献）。
   ============================================================ */
function renderConcentration() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('concentration');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  /* ---- ① 扩散场 ---- */
  wrap.appendChild(el('div', { class: 'chips-label' }, '① 想让它在多远的地方闻得到'));

  /* 五个环 = 五档体感。半径不是随便排的：外环面积按档位线性分配，
     否则"最外一圈"会占掉一半面积、看起来像唯一选项。 */
  const RINGS = [
    { v: 1, zh: '贴很近', hint: '只有抱着才闻到' },
    { v: 2, zh: '一臂', hint: '自己和身边人闻得到' },
    { v: 3, zh: '一桌', hint: '办公室环境刚好' },
    { v: 4, zh: '一间屋', hint: '进门会被注意到' },
    { v: 5, zh: '整条走廊', hint: '一两喷就够，围巾留好几天' },
  ];
  const field = el('div', { class: 'diffuse', role: 'radiogroup', 'aria-label': '扩散范围' });
  const core = el('div', { class: 'diffuse-core', 'aria-hidden': 'true' });
  field.appendChild(core);

  /* 状态刷新：视觉环（div，纯装饰）与命中按钮（button，真实可点）要一起亮。
     两者是分开的节点，因为它们承担不同职责 —— 环负责"这一圈在哪儿"，
     按钮负责"点这里"。合成一个节点就会回到"外环盖住内环"的老问题。 */
  const paintRings = () => {
    const v = Number(state.answers.intensity);
    [...field.querySelectorAll('.diffuse-ring')].forEach((r) => {
      const rv = Number(r.getAttribute('data-v'));
      r.classList.toggle('is-on', rv === v);
      r.classList.toggle('is-in', rv < v);
    });
    [...field.querySelectorAll('.diffuse-hit')].forEach((b) => {
      const bv = Number(b.getAttribute('data-v'));
      const on = bv === v;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
      b.setAttribute('tabindex', on ? '0' : '-1');
    });
  };

  /* 五个环 = 五个真实 button，但**按钮盒子本身不重叠**。
     第一版让每个环的 button 占满整个圆（width = --ring-pct），结果外环的盒子
     把内环整个盖住 —— 只有最外那圈收得到点击，里面四档永远点不动
     （playwright 实测：点 1/5 被 5/5 拦截）。
     现在的做法：button 只占**环带上的一个小方块**（贴在 12 点方向），
     环的视觉仍由 CSS 的 .diffuse-ring::before 画成一整圈 ——
     视觉是整圈、命中是这个环带上的一个 44px 落点。
     这样五档都点得到，而且落点位置各不相同（沿半径排开），不会互相遮挡。
     SVG 那条"整圈"的命中通路不走：在 SVG 里做命中拿不到 44px 触控保护，
     键盘也进不去（这是本仓早就记过的教训，见圆盘那段的注释）。 */
  let paintWarn = () => {};

  RINGS.forEach((r) => {
    const on = Number(state.answers.intensity) === r.v;
    /* 环的直径由档位派生：最小 32%、每档 +15%，与 RINGS 顺序一致。
       这样"往外走一档"在视觉上真的多一圈，不是一个数字变了。 */
    const pct = 32 + (r.v - 1) * 15;
    /* 落点位置：沿 12 点方向向上排开。第 v 档的圆心距 = pct/2（百分比），
       方块贴在圆的最高点内侧一点，互不重叠。 */
    const topPct = 50 - pct / 2;
    const ringNode = el('div', {
      class: 'diffuse-ring' + (on ? ' is-on' : '') + (r.v < Number(state.answers.intensity) ? ' is-in' : ''),
      'data-v': String(r.v),
      'data-pct': String(pct),
      'aria-hidden': 'true',
      style: '--ring-pct:' + pct + '%;top:' + topPct.toFixed(2) + '%',
    });
    /* φ 角上的按钮：真实可点、键盘可达、44px。它落在环带的最高点上。 */
    const btn = el('button', {
      class: 'diffuse-hit' + (on ? ' is-on' : ''),
      type: 'button',
      role: 'radio',
      'aria-checked': String(on),
      'data-v': String(r.v),
      'aria-label': r.v + ' / 5 · ' + r.zh + '：' + r.hint,
      tabindex: on ? '0' : '-1',
      style: 'top:' + topPct.toFixed(2) + '%',
      onclick: () => {
        state.answers.intensity = r.v;
        paintRings();
        paintRead();
        paintWarn();
        applyAmbient();
      },
    }, el('span', { class: 'diffuse-label' }, r.zh));
    field.appendChild(ringNode);
    field.appendChild(btn);
  });
  wrap.appendChild(field);

  const read = el('div', { class: 'diffuse-read' });
  const paintRead = () => {
    const v = Number(state.answers.intensity);
    const r = RINGS.find((x) => x.v === v) || RINGS[2];
    read.innerHTML = '';
    read.appendChild(el('b', {}, `${v} / 5 · ${r.zh}`));
    read.appendChild(el('span', {}, r.hint));
  };
  paintRings();
  paintRead();
  wrap.appendChild(read);

  /* ---- ② 浓度 + ③ 留香，同在一个横条里 ---- */
  wrap.appendChild(el('div', { class: 'chips-label', style: 'margin-top:20px' },
    '② 浓度类型（决定这团气味能撑多久，选一个）'));
  const grid = choiceGrid(CONCENTRATIONS, state.answers.concentration, (id) => {
    state.answers.concentration = id;
    const inferred = CONC_TO_LONGEVITY[id];
    if (inferred != null) state.answers.longevity = inferred;
    /* 联动重画整屏：③ 那一行与冲突提示都要跟着变。
       这一屏没有滚动长列表，重绘不丢位置；① 的值存在 state 里，也不会丢。 */
    render();
  });
  wrap.appendChild(grid);

  /* ① 与 ② 打架时提醒一句。阈值取 2 档：差 1 档是常态，说了等于每屏挂废话。
     v6 起这句话同时点亮最外那圈（.is-strained），让冲突先被**看见**、再被读到。 */
  {
    const INTENSITY_BAND = {
      'eau-de-cologne': [1, 2],
      'eau-de-toilette': [2, 3],
      'eau-de-parfum': [3, 4],
      'parfum': [4, 5],
      'extrait': [4, 5],
      'elixir': [4, 5],
    };
    const conc = state.answers.concentration;
    const band = conc ? INTENSITY_BAND[conc] : null;
    const want = Number(state.answers.intensity);
    const warn = el('div', { class: 'term-note is-warn' });
    paintWarn = () => {
      const gap = band && want ? (want < band[0] ? band[0] - want : (want > band[1] ? want - band[1] : 0)) : 0;
      /* 最外那圈在撑不住时虚掉：这是"反馈是内容本身的变化" ——
         同一个物件给出警告，不另起一条提示。 */
      const rings = [...field.querySelectorAll('.diffuse-ring')];
      rings.forEach((r) => r.classList.toggle('is-strained',
        gap >= 2 && Number(r.getAttribute('data-v')) === want));
      /* 命中按钮也要跟着标记：它在环上，警示色必须两边一致，
         否则"看到的圈"和"摸到的点"会各说一套。 */
      [...field.querySelectorAll('.diffuse-hit')].forEach((b) => {
        b.classList.toggle('is-strained', gap >= 2 && Number(b.getAttribute('data-v')) === want);
      });
      warn.innerHTML = '';
      if (gap < 2) { warn.style.display = 'none'; return; }
      warn.style.display = '';
      const concZh = (CONCENTRATIONS.find((c) => c.id === conc) || {}).zh || conc;
      warn.append(
        el('strong', {}, '① 和 ② 差得有点远：'),
        ` 你要它走到「${RINGS.find((x) => x.v === want) ? RINGS.find((x) => x.v === want).zh : want}」，`
        + `但${concZh}通常撑不到那里。`,
        ' 浓淡是体感、浓度是香精占比，两者不完全同步 —— 真想要那个距离，',
        ' 把 ② 往上调一档更稳妥；不改也能出结果，只是候选会少一些。'
      );
    };
    paintWarn();
    wrap.appendChild(warn);
  }

  /* ---- ③ 留香：由 ② 浓度推算，纯展示 ---- */
  const curLong = state.answers.longevity;
  const shownLong = curLong == null ? null : String(curLong);
  wrap.appendChild(el('div', { class: 'chips-label', style: 'margin-top:16px' },
    '③ 大概能留多久' + (shownLong == null ? '（选 ② 后自动给出）' : '（由 ② 推断）')));

  const longBox = el('div', { class: 'long-read' + (shownLong == null ? ' is-empty' : '') });
  if (shownLong == null) {
    longBox.appendChild(el('span', { class: 'long-val is-empty' }, '先选上面的 ② 浓度'));
  } else {
    const L = LONGEVITY.find((l) => String(l.id) === shownLong) || LONGEVITY[0];
    longBox.appendChild(el('span', { class: 'long-val' }, L.zh));
    longBox.appendChild(el('span', { class: 'long-desc' }, L.desc));
    longBox.appendChild(el('span', { class: 'long-tag' }, '推断'));
  }
  wrap.appendChild(longBox);

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '关于浓度与留香：'),
    ' 浓度是香精占比，比例越高留得越久，也越容易在密闭空间里让人不舒服（日常最常见的是 EDT 与 EDP）。',
    ' ③ 那一档是按 ② 推算的，不是实测 —— 同一瓶在干皮和油皮、冬天和夏天差别可以很大，',
    '所以它不参与打分。想要留得久，把 ② 选高一点的浓度就是同一个动作。'
  ));

  wrap.appendChild(navBar('concentration'));
  return wrap;
}


/* 浓度 → 推断留香的映射，与 data/taxonomy.json 的 concentrationLongevity.map 同一套。
   写在这里而不是运行时读 taxonomy：这一屏在库加载失败时也要能画出来。 */
const CONC_TO_LONGEVITY = {
  'eau-de-cologne': 2,
  'eau-de-toilette': 3,
  'eau-de-parfum': 4,
  'parfum': 5,
  'extrait': 5,
  'elixir': 5,
};

/* ---------- 导航条 ---------- */
/* 只重画底部的 .actions，不动整屏。
   为什么需要它：第 1 步的轮盘 onChange 与「按感觉选」都不整屏重绘
   （重绘会让轮盘转场动画重播、滚动位置跳走），但按钮的 disabled 与
   提示语取决于"到底答了没有"，不重画就会停在旧的灰按钮上。 */
function refreshNav(stepId) {
  const old = document.querySelector('.actions');
  if (!old || !old.parentNode) return;
  old.parentNode.replaceChild(navBar(stepId), old);
}

function navBar(stepId) {
  const bar = el('div', { class: 'actions' });

  if (state.step > 0) {
    bar.appendChild(el('button', {
      class: 'btn ghost', type: 'button', onclick: prev,
    }, '← 上一题'));
  }
  bar.appendChild(el('div', { class: 'spacer' }));


  /* v6 的第 3 / 4 屏（生活短语）：多选，一个都不选也能走。
     两屏的 hint 不能写成同一句 —— 「想要」是可选加分，「受不了」是更有效的排除，
     两句说反会让用户以为"这一题不重要"。 */
  if (stepId === 'wanted') {
    bar.appendChild(el('span', { class: 'hint' }, '一个都不选也能继续'));
    bar.appendChild(el('button', { class: 'btn', type: 'button', onclick: next }, '下一步 →'));
    return bar;
  }
  if (stepId === 'unwanted') {
    bar.appendChild(el('span', { class: 'hint' }, '这一题最值得花时间，但也可以跳过'));
    bar.appendChild(el('button', { class: 'btn', type: 'button', onclick: next }, '下一步 →'));
    return bar;
  }

  /* 预算 / 大方向 / 场合 / 季节 / 浓淡：都可跳过，所以按钮永远可点。
     要求"必须答完才能走"会把可跳过的问题变成门槛。

     为什么仍画一个显式的「下一步」而不是点选即自动前进：
     自动前进是 480ms 后触发的，用户点了之后若想反悔，需要一个不依赖
     "等它自己跳"的出口；而且键盘用户 Tab 到这里时自动前进已经错过了，
     没有按钮他们就卡住了。 */
  if (stepId === 'budget' || stepId === 'emotion' || stepId === 'season'
      || stepId === 'occasion' || stepId === 'concentration') {
    bar.appendChild(el('span', { class: 'hint' }, '不选也能继续'));
    bar.appendChild(el('button', { class: 'btn', type: 'button', onclick: next }, '下一步 →'));
    return bar;
  }

  /* 锚点屏：永远可点（它是可跳过的），且是最后一屏，按钮直接出结果。 */
  if (stepId === 'anchor') {
    bar.appendChild(el('span', { class: 'hint' }, '不填也能看结果'));
    bar.appendChild(el('button', {
      class: 'btn', type: 'button', onclick: (ev) => finish(ev.currentTarget),
    }, '看推荐 →'));
    return bar;
  }

  /* 走到这里说明该屏的按钮形态没被上面任何一条接住 —— 只可能是新加了步骤
     却忘了在 navBar 里给出路。给一句可见的提示比留一个空 .actions 好：
     空 .actions 会让「下一步」凭空消失，用户以为卡死。
     （原来这里还有一条 `stepId === 'intensity'` 的滑块专用分支；2026-11-11
      浓淡/浓度合屏后 intensity 不再是步骤 id，那条分支已成死代码，删掉。） */
  bar.appendChild(el('span', { class: 'hint' }, '点选项自动进入下一题'));
  return bar;
}

/* ---------- 流程 ---------- */
function next() {
  const list = curSteps();
  if (state.step < list.length - 1) {
    state.step += 1;
    render();
  }
}

function prev() {
  if (state.step > 0) {
    state.step -= 1;
    render();
  }
}

async function finish(btn) {
  /* 唯一硬约束：必须选过香型（第 1 步）。
     原来还有一条 `if (!state.answers.occasion) state.step = 1` —— 那是
     四步流程时代的守卫，那时第 1 步是场合。合并成 7 步后场合挪进第 4 步
     的"场景"屏、且**允许不答**，这条守卫会把用户从最后一屏静默弹回
     第 2 步（香调屏），表现得像"点了看推荐没反应"。
     缺场合只是少一个打分因子（WEIGHTS.occasionFamily），不该阻断流程。 */
  /* 唯一硬约束：必须给出一个入口 —— 香型轮盘选了家族，或者用「按感觉选」选了情绪。
     原来只认 family，把 emotion 这条引擎早就支持的入口卡死了
     （scoring.js:151 的两条入口在生产路径上只活了一条）。
     两条都给不出时才回第 1 步：那时引擎确实无从下手，recommend 会 throw。 */
  /* 唯一硬约束：必须给出大方向（第 2 屏）。它是引擎的入口
     （src/scoring.js 的 buildProfile 要求 family 或 emotion 二选一），
     也是背景层底噪的来源 —— 没有它，整程的调子和打分都无从谈起。
     这里不再检查 family：v6 已无香型轮盘，family 恒为 null。 */
  if (!state.answers.emotion) { state.step = 1; render(); return; }
  // 库还没到时，这里会等它下完 —— 只有「四步全答完、但库仍在下载」才会卡到这。
  // 等待期间必须给出可见反馈：按钮换成进度文案并禁用，否则用户会连点几次。
  const busy = setBusy(btn, '正在比对…');
  try {
    const d = await ensurePerfumes();
    /* 实物图清单在 boot 里就预热了，这里再等一次只是保证
       「有图就用图」这条判断在首帧就成立 —— 不等的话第一帧可能先画
       瓶形、下一帧才换图，视觉上是闪一下。它只有几百字节，
       而且通常早已在缓存里。失败不影响结果页。 */
    await ensurePhotos().catch(() => {});
    /* 预算走映射层：先把 perfumes 切一刀，引擎一行不动。
       三条降级见 poolForBudget() 的注释 —— 档太窄或凑不满时退回全库，
       绝不给一个空结果。 */
    const pool = poolForBudget(d.perfumes, state.answers.budget);
    let res = recommend(state.answers, pool, TAX, { topN: 3 });
    if (!res.results || res.results.length < 3) {
      /* ② 级的兜底：圈过的池凑不满 3 瓶时用全库重算。
         宁可给一瓶价位外的，也不给"只找到 1 瓶"。 */
      res = recommend(state.answers, d.perfumes, TAX, { topN: 3 });
      res.poolFellBack = true;
    }
    state.result = res;
    state.resultView = { round: 0, soldOut: [] };
    state.step = curSteps().length;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    busy(false);
  }
}

/** 把按钮切成「进行中」：改文案 + 禁用 + .is-busy。返回可恢复原状的函数。 */
function setBusy(btn, text) {
  if (!btn) return () => {};
  const old = btn.textContent;
  const disabled = btn.disabled;
  btn.textContent = text;
  btn.disabled = true;
  btn.classList.add('is-busy');
  return (restore = true) => {
    if (restore) {
      btn.textContent = old;
      btn.disabled = disabled;
      btn.classList.remove('is-busy');
    }
  };
}

function restart() {
  state.step = 0;
  /* 从 STEPS 重新铺一份空白答案，而不是手抄六个键 ——
     v19 加了 7 个字段，手抄必漏；漏掉的那一屏会带着上一轮的答案复现，
     用户看到的是"我明明重选了，结果没变"。 */
  /* 从 STEPS 重新铺一份空白答案，而不是手抄键名 ——
     v19 加字段时手抄漏过一次，漏掉的那一屏会带着上一轮的答案复现，
     用户看到的是"我明明重选了，结果没变"。
     v6 新增的三个（budget / wanted / unwanted）必须在这里，
     否则重开一局时第一批仍是上一局的第二批。 */
  state.answers = {
    family: null, subfamily: null, emotion: null, occasion: null, intensity: 3,
    budget: 'any', wanted: [], unwanted: [],
    likedNotes: [], dislikedNotes: [], likedZh: {}, dislikedZh: {},
    /* characterNeg 与 longevityManual 是前两轮漏过的：前者是气质原型的
       「禁止标签」，不清会带着上一轮的排除项进新一轮打分（用户重选气质后
       仍被扣分，且界面上看不出来）；后者是留香手动覆盖标记。 */
    characterPreset: null, characterTags: [], characterNeg: [],
    season: null,
    concentration: null, longevity: null, longevityManual: false,
    dislikedFamilies: [], temperature: null, sweetness: null,
    anchorBrand: null, anchorPerfume: null, anchorNotes: [],
  };
  /* 结果页视图状态：不清的话"换一批"会从上一局的第二批开始数。 */
  state.resultView = { round: 0, soldOut: [] };
  state.result = null;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- 渲染 ---------- */
function renderProgress() {
  const box = el('div');
  /* 段数写进 CSS 变量：`base.css` 原本写死 `repeat(4, 1fr)`，
     7 段塞进 4 列会断成 4+3 两行 —— 整条读起来像两截虚线而不是一根进度尺。
     现在段数来自 curSteps()：家族入口 6 段、情绪入口 7 段，两套都得对。 */
  const list = curSteps();
  const bar = el('div', { class: 'progress', style: `--steps: ${list.length}` });
  const total = list.length;
  for (let i = 0; i < total; i++) {
    const cls = i < state.step ? 'done' : i === state.step ? 'now' : '';
    bar.appendChild(el('i', { class: cls }));
  }
  /* v19：进度条下方那一行标签原来硬编码四项（'香型','场合','浓度','香调'）。
     步骤一扩到 10 步就会越界读到 undefined，所以改成从步骤表派生：
     每个步骤自己在定义里没给 short 时，退回到 kicker 里的中文。
     注意 `state.step` 可能等于 total（结果页），此时 labels[state.step] 是
     undefined —— 下面的三元已经先判了 `>= total`，不会再读到它。 */
  const labels = list.map((st) => st.short || st.title.slice(0, 4));
  const meta = el('div', { class: 'progress-meta' },
    el('span', {}, state.step >= total ? '推荐结果' : labels[state.step]),
    el('span', {}, state.step >= total ? `完成 · 共 ${total} 步` : `${state.step + 1} / ${total}`)
  );
  box.append(bar, meta);
  return box;
}

function renderMasthead() {
  const isResult = state.step >= curSteps().length;
  /* 边距仪器区（规格 5 的"留白深度"）。
     叶标题不变，只在页眉右侧补一枚 .amb-tick —— 它是**这一程走到哪儿的刻度**，
     内容由 applyAmbient() 写入（方向 + 档位，如「暖·渐」）。
     它不算装饰：没有它，"底噪随进程增强"这件事就只能靠感觉，无法核对。
     没选大方向时它是空的（诚实：那时确实还没有方向）。 */
  const ambActive = state.answers && state.answers.emotion;
  return el('header', { class: 'masthead' },
    // 封面标题里的「第一瓶」是全站唯一的高分量蓝色。
    // 用 em 而不是 span：它承载的是语义强调（"第一瓶"才是这个产品的承诺），
    // 顺带让 .masthead h1 em 这条样式有真实落点。
    isResult
      ? el('h1', {}, '你的三瓶候选')
      : el('h1', {}, '从零开始，找到', el('em', {}, '第一瓶'), '香水'),
    el('p', { class: 'lede' },
      isResult
        ? '每一瓶的理由都能反推回你刚才的选择，没有一句是编的'
        /* 首屏那句 lede 原来写「转盘选香型，再定场合和浓度」—— v6 已无香型轮盘，
           继续这么说就是在页面上承诺一个不存在的东西。改成描述真实流程。 */
        : '不用懂前中后调。先说预算和想要的感觉，再挑生活里记得的味道'
    ),
    /* 印��：纯装饰（aria-hidden），字取「香」—— 这个应用唯一的主题字。 */
    el('span', { class: 'seal', 'aria-hidden': 'true' }, '香'),
    /* 刻度：只在选过大方向之后出现，此时它读得出来；之前留空，不占位。
       文字直接写在这里（而不是留给 applyAmbient 事后补）——
       页眉与底噪的计算必须用**同一个** amb 结果，否则两处会分叉：
       applyAmbient 写完刻度后若再重绘页眉，刻度就又被清空了。
       所以 renderMasthead 自己算一次，applyAmbient 只负责写 CSS 变量。 */
    ambActive ? el('span', { class: 'amb-tick', 'aria-hidden': 'true' },
      ambientOf(state.answers, state.step, curSteps().length).kicker) : null
  );
}

/* ============================================================
   推广链接配置（第四步）
   ------------------------------------------------------------
   2026-11 重做为**双平台**：京东联盟 + 淘宝联盟并行。
   为什么两个都接：同一个商品在两家都可能没有货/没有官方店，
   只给一家等于替用户做了他不该由我们做的选择。

   三个层级，从高到低（每一层都独立降级，互不影响）：

     ① direct  —— 有佣金的转链。京东与淘宝**各自独立**：
         · 京东：jd.pid + jd.target + jd.productBase
         · 淘宝：tb.pid + tb.target + tb.productBase
        两家可以只有一家齐备，页面就只出那一家的「买」按钮。
     ② link    —— 预生成的直达商品页（data/affiliate-links.json），
         structure：{ jd: {perfumeId: url}, taobao: {perfumeId: url} }
     ③ search  —— 平台搜索页，零配置兜底。两个平台都给。

   降级判据（任一不满足就**不出那一个按钮**，静默）：
     · 该平台 target 为空 / 不含 {dest}
     · 该平台 pid 为空
     · 拼出来的 URL 不是 http(s)
   —— 宁可少一个按钮，也不要给一个点不开的链接。

   披露规则（2026-11-08 修订）：
     · 页面上**不再挂任何广告披露文案**（用户明确要求删掉那句备注）。
       链接仍保留 rel="sponsored"，机器可读，人不显示。
     · 双渠道说明与搜索兜底说明**保留** —— 它们不是广告披露，是
       "点进去会看到什么"的事实说明，删了才是骗人。
     · sponsored 只标在 direct 上；search / link 一律不标
   ============================================================ */
const SEARCH_PLATFORMS = {
  jd: { zh: '京东', url: 'https://search.jd.com/Search?keyword={q}&enc=utf-8' },
  taobao: {
    zh: '淘宝',
    url: 'https://s.taobao.com/search?q={q}',
    /* 带 pid 的搜索推广页（实测 2026-11-02：pid 在跳转后仍保留）。
       这是纯静态页面唯一能拿到的**带佣金归属**的淘宝链接形态 ——
       商品转链的 e 参数要在服务端签发，前端生成不了。
       见 AFFILIATE.taobao 上方注释。 */
    paidUrl: 'https://uland.taobao.com/sem/tbsearch?keyword={q}&pid={pid}',
  },
  tmall: { zh: '天猫', url: 'https://list.tmall.com/search_product.htm?q={q}' },
  pdd: { zh: '拼多多', url: 'https://mobile.yangkeduo.com/search_result.html?search_key={q}' },
};

const AFFILIATE = {
  /* ---- 京东联盟 ----
     京东给的是**每个商品一条独立短链**（u.jd.com/XXXX），不是参数化模板。
     所以 target 的典型形态是留空、改走 ② link 层（见 docs/AFFILIATE-SETUP.md）。
     但若你的推广位支持带 {dest} 的跳转（例如自建中转页），照样能用。 */
  jd: {
    target: '',      // 含 {dest} 的转链模板
    pid: '',         // 推广位 ID
    productBase: '', // 搜索页基地址（用于拼 dest）
  },
  /* ---- 淘宝联盟 ----
     淘宝支持参数化转链，实测通过（2026-11-02）：
     `uland.taobao.com/sem/tbsearch?keyword=<q>&pid=<pid>`
     跳转后 pid 仍保留在最终 URL 里（`&pid=mm_...` 原样带着），
     页面确实返回该关键词的搜索结果 —— 所以这一条是真·带佣金的搜索推广页，
     不是普通搜索页冒充的。

     为什么用搜索推广页而不是商品转链：
       · 商品转链（`s.click.taobao.com/t?e=...`）的 e 参数是一次性签发的，
         必须在服务端调 API 换，纯静态页面无法在浏览器里生成；
         实测裸拼 `s.click.taobao.com/t?pid=...` 会掉到 taobao 首页（pid 丢失）。
       · 搜索推广页只用 pid + 关键词，可以纯前端拼。
     代价：落地是"搜这一瓶"的结果页，不是"这一瓶"的商品页 ——
     所以下面 still 标 kind='direct'（确实带佣金归属），
     但按钮文案与披露都照实说"搜"，不装作直达商品。

     2026-11-02 追加：这个 pid 会出**两个**入口（官方旗舰店 / 全网），
     靠关键词区分，见 TAOBAO_CHANNELS 上方注释。价格排序实测无效，
     所以界面上不承诺任何"最低价"。 */
  taobao: {
    target: '',
    pid: 'mm_10963225696_3443600437_116343550064',
    productBase: '',
  },
  /* 搜索兜底给哪几个平台。不需要任何注册，只要联网就能跳。
     顺序即页面上的按钮顺序 —— 京东在前，因为实测它的登录页在 302 后
     仍保留 returnUrl，用户登录完能回到自己搜的东西上（D54）。 */
  searchPlatforms: ['jd', 'taobao'],
  /* 披露文案。**2026-11-10 19:19 起改为渲染在结果页页脚一行**（Eddie 决策：
     去掉按钮角标，只留页脚声明）。字段保留，renderFooter() 用的就是这层语义
     （佣金关系 + 不影响支付价格），测试也按它断言。

     · 中国《互联网广告管理办法》第九条：要求广告"可识别"。
       本条处于**放宽解读**状态：页脚声明 + rel="sponsored" 是机器与人均可读的
       最低信号，但披露不在点击点附近，比"按钮角标"方案弱一档。
       这是 Eddie 2026-11-10 19:19 明示拍板的取舍（「还是去掉角标，只留页脚声明」），
       Muse 的反向建议已记录并被否决，代码里不再复述争议。
     · 美国 FTC 16 CFR 255：要求 clear and conspicuous，且必须在消费者
       看到链接之前或同时出现 —— 页脚是否满足这一条，属合规判断，
       不是本仓库能自行认定的，如实标注为**未核实**。 */
  disclosure: '购买链接为联盟推广链接，通过它们成交本站可能获得佣金，不影响你的支付价格。',
};

/* 读配置。运行时覆盖（window.SCENT_AFFILIATE）支持按平台给，
   也兼容旧的扁平写法（pid/target/productBase 直接在顶层）——
   旧写法按 jd 处理，这样已有的部署不会因为这次改版突然失灵。 */
function affiliateConfig() {
  const runtime = (typeof window !== 'undefined' && window.SCENT_AFFILIATE) || {};
  const pick = (plat) => {
    const rt = runtime[plat] || {};
    /* 兼容：运行时给了扁平 pid 且没给平台对象时，当京东用 */
    const flat = (plat === 'jd' && !runtime.jd && (runtime.pid || runtime.target)) ? runtime : {};
    return {
      target: rt.target || flat.target || AFFILIATE[plat].target || '',
      pid: rt.pid || flat.pid || AFFILIATE[plat].pid || '',
      productBase: rt.productBase || flat.productBase || AFFILIATE[plat].productBase || '',
    };
  };
  const out = {
    jd: pick('jd'),
    taobao: pick('taobao'),
    searchPlatforms: Array.isArray(runtime.searchPlatforms)
      ? runtime.searchPlatforms.filter((p) => SEARCH_PLATFORMS[p])
      : AFFILIATE.searchPlatforms.slice(),
    disclosure: AFFILIATE.disclosure,
  };
  /* ?pid= 只在只有一个平台需要覆盖时有意义。为了不引入歧义，
     改成 ?pid=xxx 同时覆盖两个平台的 pid —— 它本来就是给"临时换推广位"
     用的，两个平台同时换比只换一个更符合直觉。 */
  try {
    if (typeof location !== 'undefined' && location.search) {
      const q = new URLSearchParams(location.search);
      const fromUrl = q.get('pid');
      if (fromUrl) { out.jd.pid = fromUrl; out.taobao.pid = fromUrl; }
      const plat = q.get('platform');
      if (plat && SEARCH_PLATFORMS[plat]) out.searchPlatforms = [plat];
    }
  } catch { /* 取不到就算了，用配置里的 */ }
  return out;
}

/* 给一瓶香水拼**带佣金的**购买链接。返回 null 表示"不渲染佣金链接"。
   注意这条路径要求三件套齐全（target + pid + productBase），
   缺一件就返回 null —— 调用方会退回搜索页或干脆不显示。 */
/* ---------- 联盟转链域名白名单 ----------

   **为什么需要它。** `data/affiliate-links.json` 里可能同时躺着两种东西：
     ① 手工抄的商品页（`detail.tmall.com/item.htm?id=…`）—— 无佣金；
     ② 从联盟「立即推广」取的转链短链（`m.tb.cn/h.xxx`、
        `s.click.taobao.com/t?e=…`、`u.jd.com/xxx`）—— **有佣金**。
   两者在数据里长得一样（都只是一条 URL），但合规处理完全相反：
   有佣金的必须标 sponsored + 挂广告披露，无佣金的绝不能标。

   所以判据只能落在 host 上，落在"这条是谁生成的"记忆上不行 ——
   表会被人手工改，记忆不会跟着变。新增平台时往这张表里加域名即可。 */
const AFF_DIRECT_HOSTS = {
  taobao: ['m.tb.cn', 's.click.taobao.com', 'uland.taobao.com', 'tmqd.me', 'tb.cn'],
  jd: ['u.jd.com', 'union-click.jd.com', '3.cn'],
};

/* 只放行 http(s)。返回规范化后的字符串，非法则 null。
   与 scripts/gen-affiliate-links.mjs 里的 safeUrl 同源 —— 那边拦的是
   "写进公开 JSON 之前"，这边拦的是"渲染成 a[href] 之前"，两头都拦。 */
function safeHttpUrl(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/* 这条 URL 是否来自该平台的联盟转链域名。子域名也算（`u.jd.com` 的
   `img.u.jd.com` 这种会出现），所以用 endsWith 而不是全等。 */
function isAffiliateHost(plat, href) {
  const hosts = AFF_DIRECT_HOSTS[plat];
  if (!hosts || !href) return false;
  try {
    const h = new URL(href).hostname.toLowerCase();
    return hosts.some((d) => h === d || h.endsWith('.' + d));
  } catch {
    return false;
  }
}

function affiliateHref(perfume, cfg) {
  if (!cfg || !cfg.pid || !cfg.target || !cfg.target.includes('{dest}')) return null;
  if (!cfg.productBase) return null;          // 没有购买页可跳，别硬凑
  if (!perfume || !perfume.name) return null;
  try {
    const dest = new URL(cfg.productBase);
    dest.searchParams.set('q', [perfume.brand, perfume.name].filter(Boolean).join(' '));
    const href = cfg.target
      .replace('{dest}', encodeURIComponent(dest.toString()))
      .replace('{pid}', encodeURIComponent(cfg.pid))
      .replace('{name}', encodeURIComponent(perfume.name))
      .replace('{brand}', encodeURIComponent(perfume.brand || ''));
    /* 实测拼出来的是不是合法 http(s) —— 不合格就降级，不把坏链给用户 */
    const u = new URL(href);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/* ---------- 搜索页兜底：零配置就能用的那一层 ----------

   **为什么要有这一层。**
   佣金链路要求三件套齐备，而联盟注册要实名、要审核、要能给出商品页 URL。
   在那些条件凑齐之前，页面上一个购买入口都没有 —— 这不是"以后再做"，
   而是当下就没法用。搜索跳转不需要任何注册：它只是替用户少打一次字。
   没有佣金，但也没有假承诺。

   **它和佣金链接的区别是必须显式告诉用户的。**
   佣金链接指向"这一瓶"（商品页或转链），搜索链接指向"搜这一瓶的结果"。
   两者长得像但承诺不同，所以按钮文案分开写，披露也分开：
   搜索跳转不挂「广告」—— 它不是广告，挂上去反而在骗人。 */

/* 预生成的直达链接表（阶段二）。
   id → 商品页 URL。由 scripts/gen-affiliate-links.mjs 离线产出，
   密钥只在本地用、不进仓库。文件不存在时静默为空 —— 不影响任何现有行为。 */
let AFF_LINKS = null;

/* ---------- 天猫店清单（任务8 A3，2026-11-12）----------
   **为什么需要它。** `data/affiliate-links.json` 的淘宝链接是联盟短链
   （`s.click.taobao.com/t?e=…`），加密串里不含店铺信息，前端没法自己判断
   「这条是淘宝店还是天猫店」。而两者对用户的行为不同：
     · 淘宝店 → 手机端点开能唤起淘宝 App 并直达商品页；
     · 天猫店 → App 内会落到「如未登录成功，请退出本页面，打开淘宝-我的淘宝重试」
       的登录失效页（实测 `_probe/probe-buy-mobile.mjs`，Dior Eau Sauvage 那条），
       用户会以为按钮坏了。

   所以维护一份**实测得出**的天猫 id 表（`data/tmall-shops.json`），
   只对这些瓶多显示一句提示，别的瓶不受影响。

   **这张表怎么来的。** 用淘宝 App 内置浏览器 UA 开短链，看落地域名——
   外部 UA 一律落登录墙，看不到商品页，所以只有 App UA 能判。

   **它是可选增强。** 加载失败 / 文件缺失时 `TMALL_IDS` 为空集，
   页面行为与没有这个功能时逐位一致 —— 不让一个提示依赖把首屏拖下水。 */
let TMALL_IDS = new Set();

/* ---------- 淘宝的两个入口：官方旗舰店 / 全网 ----------

   **为什么要拆成两个入口，而不是一个"最优链接"。**
   用户要的是「一个官方来源 + 一到两个正品第三方店铺」。但纯静态页面
   拿不到"哪家第三方店最便宜"这个事实 —— 那需要实时抓价格，而电商
   搜索结果页在无登录态下全部先弹登录（实测 2026-11-02：京东 PC 302
   到 passport.jd.com，淘宝停在"加载中"，天猫 302 到 s.taobao.com）。

   **"价格最优"能不能靠 URL 参数保证？实测不能。**
   试过 `sort=price-asc`、`sort=price_asc`、`sortType=price_asc`、
   `s=0&sort=price-asc` 四组，uland 与 s.taobao 各跑一遍，
   前 20 个价格序列与不排序的基线**逐一相同**
   （15.57 / 18.70 / 27.44 / 20.58 / 24.60 …），没有一次升序排列。
   所以页面绝不写"最低价""最便宜"这类承诺。

   **能保证的是"把哪一类店顶上来"。**
   实测关键词差异（Creed Aventus）：
     · 裸品牌名        → 结果里没有「旗舰店」，价格 ¥11.89–26.24（小样/分装）
     · `+ 官方旗舰店`  → 出现「回头客2万CREED官方旗舰店」，价格 ¥1450 / ¥1680（正装）
   所以两个入口靠关键词区分，而不是靠排序参数：
     · official → 关键词带「官方旗舰店」，把品牌自营店顶到前部
     · market   → 裸关键词，给出全网（含第三方、含小样）

   区分方式必须让用户看得见：文案写成「官方旗舰店」与「全网比价（含第三方）」，
   不用"最优""最低"这种我们验证不了的词。 */
const TAOBAO_CHANNELS = [
  {
    id: 'official',
    /* 后缀拼在关键词尾部，不进品牌名 */
    suffix: '官方旗舰店',
    label: '搜官方店 ↗',
    scope: '官方旗舰店',
  },
  {
    id: 'market',
    suffix: '',
    label: '搜全网 ↗',
    scope: '全网（含第三方店铺）',
  },
];

/* 一个平台给这一瓶出**一组**链接。返回数组，可能为空。
   kind = 'direct'（有佣金）/ 'link'（预生成直达页）/ 'search'（平台搜索页）

   为什么改成数组：淘宝有 pid 时同一个平台要出两个入口（见上文
   TAOBAO_CHANNELS）。原来返回单个链接的写法没法表达"一平台多渠道"，
   硬塞进一个 URL 就等于替用户把两类店合并成一类。 */
function platformLinks(perfume, plat, cfg) {
  const meta = SEARCH_PLATFORMS[plat];
  if (!perfume || !perfume.name || !meta) return [];
  const out = [];

  /* ① 有佣金转链（该平台三件套齐备时才有）——它指向这一瓶本身，
        已经是最高档，不必再拆渠道。 */
  const paid = affiliateHref(perfume, cfg[plat]);
  if (paid) {
    return [{
      href: paid, kind: 'direct', platform: plat, platformZh: meta.zh,
      channel: 'product', label: `去${meta.zh}买这一瓶 ↗`,
    }];
  }

  /* ①a 预生成的**商品级**推广短链 —— 必须排在 ①b 前面。

     v33 修的真 bug：`data/affiliate-links.json` 里手采的 `m.tb.cn/h.xxx`
     此前被 ①b 永久遮蔽。淘宝配了 pid，①b 每次都命中并 return，
     第 ② 档（读表）永远走不到 —— 也就是说，无论采集多少条真短链，
     页面上一个都不会出现，用户看到的永远是搜索页兜底。

     两处都错：
       · 优先级错：商品级短链 > 搜索页，它该排前面；
       · 定性错：从联盟「立即推广」取到的短链**本身就带佣金归属**
         （实测 2026-11-02 点一次后报表 `点击次数 1`），
         而第 ② 档当年是按"手工填的无佣金直达页"写的 kind='link'。

     所以这里按 host 分流：来自联盟转链域名的算 direct（挂 sponsored +
     广告披露），其余仍按无佣金直达页处理。判据集中在 AFF_DIRECT_HOSTS，
     换平台时只改那一张表。 */
  const tableA = AFF_LINKS && AFF_LINKS[plat];
  const rawA = tableA && (tableA[perfume.id] || (tableA.links && tableA.links[perfume.id]));
  if (rawA) {
    const ua = safeHttpUrl(rawA);
    if (ua && isAffiliateHost(plat, ua)) {
      return [{
        href: ua, kind: 'direct', platform: plat, platformZh: meta.zh,
        channel: 'product', label: `去${meta.zh}买这一瓶 ↗`,
      }];
    }
  }

  /* ①b 只有 pid、没有转链模板时的「带佣金的搜索推广页」。
     淘宝实测可用（`uland.taobao.com/sem/tbsearch?keyword=&pid=`），
     它确实带佣金归属，但落地是搜索结果而不是这一瓶 ——
     所以 kind 仍是 'direct'（合规上必须挂广告披露、必须标 sponsored），
     文案却要说「搜」不说「买」。这两件事同时成立，不矛盾：
     有商业关系是事实，落地页不是商品页也是事实，两个都得说。

     淘宝在这里出**两个**入口（官方 / 全网）；其他平台只出一个。 */
  if (cfg[plat] && cfg[plat].pid && meta.paidUrl) {
    const channels = plat === 'taobao' ? TAOBAO_CHANNELS : [null];
    for (const ch of channels) {
      const parts = [perfume.brand, perfume.name, ch && ch.suffix].filter(Boolean);
      const q = parts.join(' ');
      try {
        const u = new URL(meta.paidUrl
          .replace('{q}', encodeURIComponent(q))
          .replace('{pid}', encodeURIComponent(cfg[plat].pid)));
        if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
        out.push({
          href: u.toString(), kind: 'direct', searchLanding: true,
          platform: plat, platformZh: meta.zh,
          channel: ch ? ch.id : 'market',
          scope: ch ? ch.scope : '',
          label: ch ? ch.label : `在${meta.zh}搜这一瓶 ↗`,
        });
      } catch { /* 拼坏了这一条就跳过，不影响另一条 */ }
    }
    if (out.length) return out;
  }

  /* ② 预生成的直达商品页（无佣金，但确实是这一瓶）。
     走到这里说明 ①a 已经判过"这条不是联盟转链域名"，所以它只能是
     手工抄的商品页 —— 按无佣金处理，不挂 sponsored。 */
  const table = AFF_LINKS && AFF_LINKS[plat];
  if (table) {
    const raw = table[perfume.id] || (table.links && table.links[perfume.id]);
    const u = safeHttpUrl(raw);
    if (u) {
      return [{
        href: u, kind: 'link', platform: plat, platformZh: meta.zh,
        channel: 'product', label: `去${meta.zh}看这一瓶 ↗`,
      }];
    }
  }

  /* ③ 平台搜索页 —— 零配置兜底 */
  const q = [perfume.brand, perfume.name].filter(Boolean).join(' ');
  try {
    const u = new URL(meta.url.replace('{q}', encodeURIComponent(q)));
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return [];
    return [{
      href: u.toString(), kind: 'search', platform: plat, platformZh: meta.zh,
      channel: 'market', label: `在${meta.zh}搜这一瓶 ↗`,
    }];
  } catch {
    return [];
  }
}

/* 统一出口：给一瓶香水返回它在每个启用平台上的链接数组。
   顺序跟 cfg.searchPlatforms 一致（默认 ['jd','taobao']）。
   为什么返回数组而不是单个：双平台是这一轮的需求 ——
   同一瓶在两家都可能缺货，只给一家等于替用户做了不该我们做的选择。
   现在一个平台内部也可能出两个（淘宝的官方 / 全网），所以是 flat。 */
function affiliateLinks(perfume, cfg) {
  const out = [];
  for (const plat of (cfg && cfg.searchPlatforms) || []) {
    out.push(...platformLinks(perfume, plat, cfg));
  }
  return out;
}

/* 兼容旧调用：返回第一个链接（京东优先）。测试与外部若只想要一条就用这个。 */
function affiliateLink(perfume, cfg) {
  const all = affiliateLinks(perfume, cfg);
  return all.length ? all[0] : null;
}

/* ============================================================
   手机端：唤起淘宝 App（任务 7，Eddie 2026-11-11 23:47）
   ------------------------------------------------------------
   **问题。** 原来的淘宝入口一律是 `s.click.taobao.com/t?e=…`（联盟转链）
   或 `uland.taobao.com/sem/tbsearch`（带 pid 的搜索推广页）。
   真浏览器实测（scripts/probe-aff-landing.mjs，2026-11-12）：
     · 桌面 UA → `login.taobao.com/havanaone/...` 桌面登录页
     · iPhone Safari UA → `login.m.taobao.com/havanaone/...` 移动登录页
     · **淘宝 App 内置浏览器 UA（AliApp(TB/…)）→ 直接进商品详情页**
       （`h5.m.taobao.com/awp/core/detail.htm?id=…&ali_trackid=2:mm_…`，
        pid 原样带在 ali_trackid 里）
   也就是说：链接本身带得出商品，**问题全在"从外部浏览器进"这一步被登录墙挡住**。
   用户在手机上点的正确动作是"把这瓶交给 App"，不是"在网页里登录"。

   **做法。** 手机端把淘宝按钮改成 `tbopen://` 唤起，不唤起（未装 App /
   被系统拦）再落到 H5。三段式：

     ① tbopen://m.taobao.com/tbopen/index.html?action=ali.open.nav&h5Url=<encoded>
        —— 官方 App 唤起协议。h5Url 用**原来那条链接原样传**，所以
           佣金归属（pid / ali_trackid / e 参数）一个字节都不变，
           不重新签发、不改 pid。App 打开后自己按 UA 走上面那条实测路径。
     ② 唤起失败兜底：`uland.taobao.com/sem/tbsearch?...&pid=…`
        —— 移动版式、带 pid 的搜索结果页（实测移动 UA 下 vw=390、
            有 45 个价格节点、不用登录就能看结果），不是桌面版。
     ③ 桌面端（含鼠标 + 宽屏）：**不唤起**，保持原来的网页链接 ——
        桌面点 tbopen:// 只会弹一个"选择应用"对话框，是打扰。

   **为什么不用 taobao://。** `taobao://` 只在已登录 App 的深链上有意义，
   淘宝自己在 H5 → App 的跳转里用的是 `tbopen://…action=ali.open.nav`，
   带 action 的那条才保证由 App 接管并把 h5Url 当落地页。

   **为什么不改成 m.tb.cn 短链。** 那是联盟后台"立即推广"签发的一次性短链，
   前端拼不出来，而且这一轮的约束是"不许改 pid"——换短链等于换签发源。
   实测也证明 pid 已经在现链接里带得出来（ali_trackid），不需要换。

   **一个必须说清的边界。** 本轮验证的是"链接格式 + 唤起协议 + 兜底页版式"，
   在 headless Chromium 里完成；**没有真机**。真机上的 App 唤起依赖系统
   注册的 scheme 与用户是否装了 App，这两件本地无法测 —— 所以代码里
   加了兜底，而不是假定唤起一定成功。 */
const TB_OPEN = 'tbopen://m.taobao.com/tbopen/index.html?action=ali.open.nav&h5Url=';
/* 移动端判据用**两种**信号，命中任一即算手机：
     · `(pointer: coarse)` —— 触屏
     · 视口 ≤ 620px —— 与 CSS 的手机断点同一根线（styles/src 里到处用 620）
   两个都判而不是只判 UA：平板/Chrome DevTools 的 UA 未必带 iPhone，
   而"窄屏 + 触屏"是这件事真正的判据（唤起 App 只在有 App 的设备上有意义）。
   桌面端即使窗口拖窄，`pointer: coarse` 为 false，走网页链接，不会被唤起打断。 */
function isMobileContext() {
  if (typeof window === 'undefined') return false;
  try {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    const narrow = window.matchMedia?.('(max-width: 620px)').matches;
    return !!coarse || !!narrow;
  } catch { return false; }
}

/* 把一个 http(s) 链接包成 App 唤起链接。非 http(s) 一律返回 null ——
   不让 `javascript:` 之类的字符串借道 h5Url 混进 href。 */
function tbopenHref(webUrl) {
  const safe = safeHttpUrl(webUrl);
  if (!safe) return null;
  return TB_OPEN + encodeURIComponent(safe);
}

/* 唤起失败后的**移动版**兜底。为什么不用 `s.taobao.com/search`：
   实测那条在 iPhone UA 下仍是桌面版搜索结果页（带"亲，请登录"顶栏，
   价格节点 0 个）；`uland/sem/tbsearch` 在移动 UA 下是真·移动版式
   （vw=390、有 45 个价格节点、不登录可看），且带 pid，佣金归属与主链一致。
   兜底必须**保留关键词**指向同一瓶，否则"唤起失败"就变成"跳到淘宝首页"。 */
function taobaoMobileFallback(perfume, cfg) {
  const pid = cfg && cfg.taobao && cfg.taobao.pid;
  if (!perfume || !perfume.name || !pid) return null;
  const q = [perfume.brand, perfume.name].filter(Boolean).join(' ');
  const base = SEARCH_PLATFORMS.taobao.paidUrl
    .replace('{q}', encodeURIComponent(q))
    .replace('{pid}', encodeURIComponent(pid));
  return safeHttpUrl(base);
}


/* 第 1 名徽标的措辞。抽成纯函数是为了让测试能直接钉住这两句话，
   不必依赖主流程恰好跑到不并列的状态（实测主流程跑出来就是并列，
   徽标为 0，那条断言从未触发过）。

   V3 改法 3c：无百分比时的措辞从「原始分最高」改成「最接近你答的」。
   「原始分最高」是排序实现的术语（它描述的是我们的算法，不是用户的体验）；
   「最接近你答的」把同一件事实翻译成用户的语言，且仍然只是**事实陈述**
   —— 它没说"最适合你"，说的是"在这三瓶里与你的回答最接近"。
   有百分比时仍用「最匹配」：那时有量化依据支撑这个判断。 */
function topBadgeText(hasPct) {
  return hasPct ? '最匹配' : '最接近你答的';
}

/* ---------- 结果卡上的商品图 ----------

   两级：**有实物图就用实物图，没有才画瓶形。**

   **为什么数据源里没有照片。**
   Scento（CC BY 4.0）的 `perfumes.csv` 1485 行、19 列，从 id 到 url
   全是文本，**没有任何图片字段**。上游网页确实有产品摄影
   （`imagedelivery.net` 上的 `og:image`），但那是第三方摄影作品，
   不在 CC BY 4.0 的数据许可内；而且外链图片断网或对方换 CDN 就成破图，
   破掉本项目「D05：离线可用、零外部请求」的硬约束。

   **所以实物图只能由我们自己提供。**
   清单在 `data/photos.json`（键 = 香水 id，值 = 本地相对路径）。
   为什么单独一张表：`perfumes.json` 是构建产物，每次上游更新会被整体
   重写，照片映射写进去会被抹掉。
   表里没有的 id 一律降级为绘制的瓶形 —— 缺图不是错误，是不显示照片。

   **绘制的瓶形（降级路径）。**
   每个瓶子的形状由 `id` 的哈希决定（三种剪影），颜色由主家族决定 ——
   同一瓶每次渲染完全一致，不需要任何网络请求，也不涉及任何版权。
   图形里**只有瓶身、瓶盖、液体高光**，没有文字、没有贴纸、没有背景装饰，
   符合"仅含香水本身"的要求。

   **它不是照片，也不假装是。** 卡片里它是装饰性的（`aria-hidden`），
   信息仍然全部来自文字；三者并列时你靠它一眼分辨形状与色系，
   而不是靠它辨认具体是哪一瓶。 */
const BOTTLE_TINT = {
  citrus:   { glass: '#F7F2DA', liquid: '#E3C063', deep: '#B8912F' },
  floral:   { glass: '#FBEFF4', liquid: '#E5A2BA', deep: '#BC7590' },
  woody:    { glass: '#F4EEE5', liquid: '#B98F62', deep: '#8F6840' },
  amber:    { glass: '#FCF3DF', liquid: '#D89A3C', deep: '#AC731F' },
  fresh:    { glass: '#EBF6F0', liquid: '#8CC3AE', deep: '#5F9A83' },
  gourmand: { glass: '#F9F0E4', liquid: '#C98B5C', deep: '#9E6339' },
};

/* 家族键取权重最大的那个。`families` 是 { floral: 1 } 这种映射，
   跨族（{citrus:.6, floral:.4}）时取主族 —— 瓶子只承载"色系印象"，
   不需要表达配比。 */
function dominantFamily(p) {
  const f = p && p.families;
  if (!f || typeof f !== 'object') return 'woody';
  let best = null; let bestV = -1;
  for (const [k, v] of Object.entries(f)) {
    if (typeof v === 'number' && v > bestV) { bestV = v; best = k; }
  }
  return best && BOTTLE_TINT[best] ? best : 'woody';
}

/* 稳定的字符串哈希（FNV-1a 32 位）。用它而不是 Math.random：
   同一瓶必须每次画成同一个形状，否则刷新一次结果页瓶子就换样。 */
function stableHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function bottleArt(p) {
  const t = BOTTLE_TINT[dominantFamily(p)] || BOTTLE_TINT.woody;
  const v = stableHash(String(p && p.id || p && p.name || 'x')) % 3;
  const S = `stroke="${t.deep}" stroke-width="1.4" stroke-linejoin="round"`;

  /* 三种剪影：方肩经典瓶 / 高圆柱 / 圆肚瓶。
     共用 72×108 画布，瓶子居中、底边贴 104，三张卡并排时基线一致。 */
  let body = '';
  let cap = '';
  let liquid = '';

  if (v === 0) {
    /* 方肩经典瓶 */
    cap = `<rect x="27" y="4" width="18" height="15" rx="2" fill="${t.deep}"/>`;
    body = `<path d="M30 19h12v7h10a6 6 0 0 1 6 6v66a6 6 0 0 1-6 6H26a6 6 0 0 1-6-6V32a6 6 0 0 1 6-6h10z" fill="${t.glass}" ${S}/>`;
    liquid = `<path d="M22 58h28v40a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4z" fill="${t.liquid}"/>`;
  } else if (v === 1) {
    /* 高圆柱 */
    cap = `<rect x="28" y="5" width="16" height="13" rx="2" fill="${t.deep}"/>`;
    body = `<path d="M31 18h10v6h2c6 0 10 5 10 11v57c0 6-4 8-19 8s-19-2-19-8V35c0-6 4-11 10-11h4z" transform="translate(0,0)" fill="${t.glass}" ${S}/>`;
    liquid = `<path d="M21 56h30v36c0 6-5 8-15 8s-15-2-15-8z" fill="${t.liquid}"/>`;
  } else {
    /* 圆肚瓶 */
    cap = `<rect x="29" y="4" width="14" height="12" rx="2" fill="${t.deep}"/>`;
    body = `<path d="M33 16h6v8c11 2 19 12 19 24v34c0 12-10 22-22 22S14 94 14 82V48c0-12 8-22 19-24z" fill="${t.glass}" ${S}/>`;
    /* 液体直接沿用瓶身下半段的外形（不画椭圆再用 clipPath 裁），
       少一个 defs 节点，也不用担心 clip 在测试桩里没实现。 */
    liquid = `<path d="M50 52v30c0 12-10 22-22 22S14 94 14 82V52c0 2 8 6 18 6s18-4 18-6z" fill="${t.liquid}"/>`;
  }

  /* 一道竖直高光：没有它瓶身是块平板，读不出玻璃的圆柱感。
     刻意只给一条，不加反光/加湿/雾面 —— 那是营销图的做法。 */
  const gloss = `<rect x="24" y="${v === 1 ? 40 : 38}" width="3.4" height="${v === 2 ? 26 : 34}" rx="1.7" fill="#ffffff" opacity=".55"/>`;

  return el('div', {
    class: 'pick-art',
    'aria-hidden': 'true',
    html: `<svg viewBox="0 0 72 108" role="presentation" focusable="false">${cap}${body}${liquid}${gloss}</svg>`,
  });
}

/* 结果卡右侧那一格的纯函数：**只决定"用照片还是用图形"**，不碰 DOM。
   抽出来是为了可测 —— 一张图都没有时也必须稳定返回"图形"，
   而不是靠 `pickArt()` 里那句 `if (!src)` 隐式表达。 */
function artSourceOf(p, photos) {
  const src = photos && typeof photos === 'object' ? photos[p && p.id] : null;
  return typeof src === 'string' && src ? src : null;
}

/* 这一瓶的图是不是"已抠图"（背景全透明）。
   为什么要区分：淘宝主图都是白底方图，放进深色页面会露一块白方块，
   所以 _wheel20.css 给白底图套了「白瓷底托」。但抠过图的 PNG/WebP
   本来就是透明背景，再套底托等于在透明瓶子后面画一个白框 ——
   对比图里一眼能看出来，透底最干净。

   表结构：`data/photos.json` 顶层可选的 `cutouts: [id, ...]`。
   缺这一项 = 全部按白底图处理（向后兼容，老表不用改）。 */
function isCutout(p, cutouts) {
  const id = p && p.id;
  if (!id) return false;
  if (cutouts instanceof Set) return cutouts.has(id);
  if (Array.isArray(cutouts)) return cutouts.includes(id);
  return false;
}

/* 卡片右侧那一格：有实物图就用 <img>，没有就画瓶形。
   两者尺寸由同一个 .pick-art 盒控制（见 _wheel18.css），所以换图不会
   让三张卡的基线错开。照片按 ID 查 data/photos.json —— 查表在
   ensurePhotos() 里完成，这里只读缓存。 */
function pickArt(p) {
  const src = artSourceOf(p, PHOTOS);
  if (!src) return bottleArt(p);
  /* 图本身已经"只有瓶子"（用户提供的白底实物图），所以直接铺满盒子，
     不加边框、不加阴影、不加圆角 —— 任何装饰都会让它读成"贴图"。

     用 el('img', …) 而不是 innerHTML 拼字符串：路径来自扁平的
     data/photos.json，但那是**可被替换的文件**，一旦里面出现引号就会
     把属性打断。走 setAttribute 由浏览器自己处理属性值的转义。

     alt 留空 + role=presentation：卡片里信息全在文字上，图片只做视觉锚点。
     写 alt="香水瓶" 只会让读屏用户多听四个没有信息量的字。 */
  /* is-cutout：透明背景的抠图。它要跟白底图分开 —— 白底图在深色下需要
     白瓷底托（否则露白方块），抠图需要**去掉**底托（否则白框透出来）。 */
  const cls = 'pick-art is-photo' + (isCutout(p, CUTOUTS) ? ' is-cutout' : '');
  return el('div', { class: cls },
    el('img', {
      src,
      alt: '',
      role: 'presentation',
      loading: 'lazy',
      decoding: 'async',
      draggable: 'false',
    }));
}

function renderResult() {
  const { profile, results } = state.result;
  const wrap = el('div', { class: 'fade-in' });
  /* 推广链接配置读一次，三张卡共用。配置不全时 aff.href 全为 null，
     页面就退化成纯展示 —— 与没有这个功能时完全一样。 */
  const aff = affiliateConfig();

  const head = el('div', { class: 'result-head' });
  head.append(
    el('div', { class: 'eyebrow' }, '基于你的回答'),
    /* 场合在第 4 步是「可跳过」的，scoring 那边把没答的情况显式降成 null
       （src/scoring.js:634 `profile.occasion?.zh ?? null`）。原来直接拼模板，
       实测会印出「清冷 · null · 浓郁度 3/5」—— 用户看到的是字面的 null。
       这里先滤掉空值再 join。不补「未指定场合」这种假默认值：
       少一段比分一段含糊话更轻。 */
    el('h2', {}, [
      profile.emotionZh,
      profile.occasionZh,
      `浓郁度 ${profile.intensity}/5`,
    ].filter(Boolean).join(' · ')),
    el('p', {}, '下面三瓶分属不同家族，方便你对比着闻，而不是三瓶一个味道')
    /* V3 改法 2d：匹配度的口径说明（.profile-line）从这里移到三张卡之后，
       见 results.forEach 之后那一处。原来它排在三张卡**之前**：用户还没看到
       任何一瓶，先读到一段 33px 高的方法论免责说明（移动端 54px、两行）。
       它是"这个百分比怎么来的"，只有看完结果才可能关心。 */
  );
  wrap.appendChild(head);

  results.forEach((r, i) => {
    const p = r.perfume;
    /* 第 1 名要有独立于百分比的视觉身份。
       原来三张卡用同一套样式，只有「匹配度 40% / 40% / 39%」这几个数字区分 ——
       差值 1 个百分点时说「这是最匹配的」没有说服力，用户也没法一眼看出
       该先试哪一瓶。加 is-top 后：卡头加深、左侧竖条、徽标，三重信号。
       注意不放大字号 —— 26px 的名字已经在窄屏折行，再大就断。 */
    /* 「最匹配」只在第 1 名**真的**领先时才标。
       实测踩到：一组完整答案下三瓶原始分完全相同（score 173.9 / 173.9 / 173.9，
       分差 0.0），三张卡都显示「匹配度 63%」。这时候把第一张标成「最匹配」
       是在编一个不存在的排序 —— 三瓶一样匹配，凭什么是它。

       判据用原始 score 差而不是 matchPct：matchPct 经过四舍五入，
       0.4 分的差距会被抹平；而 score 是浮点数，差多少就是多少。
       阈值 0.5 分：低于它算不上"更匹配"，读者也不会认。 */
    const topScore = results[0].score;
    const tied = results.length > 1 && Math.abs(topScore - results[1].score) < 0.5;
    const isTop = i === 0 && !tied;
    const art = el('article', { class: 'pick' + (isTop ? ' is-top' : '') });

    art.appendChild(el('div', { class: 'pick-rank' },
      el('span', { class: 'n' }, `候选 ${String(i + 1).padStart(2, '0')}`),
      /* 徽标措辞要跟着"有没有百分比"走，否则自相矛盾：
         实测线上出现过一张卡同时标「最匹配」和「初步匹配」——
         前者断言"它最合适"，后者说"我们算不准"，两句话互相拆台。
         没有百分比时改用「原始分最高」：这是**事实**（它确实是排序第一），
         而不是"最匹配"那种需要百分比支撑的判断。 */
      isTop ? el('span', { class: 'top-badge' }, topBadgeText(r.matchPct != null)) : null,
      /* 并列时把话说清楚：不是"这三个一样好"，而是"评分规则分不出高下" */
      (i === 0 && tied) ? el('span', { class: 'tie-badge' }, '与后两瓶并列') : null,
      /* 匹配度可能为 null（G6：激活维度不够时不算百分比，见 scoring.js）。
         null 与 0% 是两句完全不同的话：0% 是"完全不匹配"，null 是
         "信息不够，算不准"。所以 null 时改说「初步匹配」，绝不显示 0% ——
         显示 0% 等于告诉用户这瓶完全不合适，而实际上只是我们问得太少。 */
      el('span', { class: r.matchPct == null ? 'score is-preliminary' : 'score' },
        r.matchPct == null ? '初步匹配' : `匹配度 ${r.matchPct}%`)
    ));

    /* 瓶形放在名字右边，与「候选 01 / 匹配度」同一视觉带。
       为什么不做大图横跨卡宽：结果卡是规格表式的竖排文本（D38 的 Swiss 骨架），
       一张大图会把三张卡的节奏打断，也让"读理由"这件事被图片挤下去。
       88px 的小图只做"这三瓶长得不一样"的视觉锚点。 */
    const headText = el('div', { class: 'pick-head-text' });
    headText.appendChild(el('h3', {}, p.name));
    // 数据源有 24 瓶没标浓度 → 不编，直接不显示那一格
    const metaBits = [p.brand];
    if (p.concentrationLabelZh) metaBits.push(p.concentrationLabelZh);
    metaBits.push(`${p.familySource} 源家族`);
    const metaNode = el('div', { class: 'meta' });
    metaBits.forEach((t, i) => {
      if (i > 0) metaNode.appendChild(el('span', { class: 'dot' }, '·'));
      metaNode.appendChild(document.createTextNode(t));
    });
    headText.appendChild(metaNode);
    art.appendChild(el('div', { class: 'pick-head' }, headText, pickArt(p)));

    // 三调
    const dl = el('dl', { class: 'pyramid' });
    const rows = [
      ['前调', p.top, '最先闻到的 15 分钟'],
      ['中调', p.heart, '半小时后的主体'],
      ['后调', p.base, '留在皮肤上的余味'],
    ];
    rows.forEach(([label, notes, tip]) => {
      dl.append(
        el('dt', {}, label),
        el('dd', {}, notes.join('、'), el('span', {}, `　${tip}`))
      );
    });
    art.appendChild(dl);

    // 理由
    const ul = el('ol', { class: 'reasons' });
    r.reasons.forEach((t) => {
      ul.appendChild(el('li', { class: t.startsWith('⚠️') ? 'warn' : '' },
        t.replace('⚠️ ', '')));
    });
    art.appendChild(ul);

    // 页脚信息
    const tags = [];
    if (p.longevityInferred != null) {
      tags.push(el('span', { class: 'tag' }, `持香推断 ${p.longevityInferred}/5`));
    } else {
      tags.push(el('span', { class: 'tag' }, '持香未标注'));
    }
    tags.push(el('span', { class: 'tag' }, p.seasons && p.seasons.length
      ? `季节 ${p.seasons.join(' / ')}` : '季节未标注'));
    /* 购买入口放在理由之后、页脚之中：先让用户读到"为什么推荐它"，
       再给"去哪买" —— 顺序反了就成了先推销后解释。 */
    /* 双平台：这一瓶在每个启用平台各出一个链接。
       为什么不是"二选一"：同一瓶在京东和淘宝都可能缺货或没有官方店，
       替用户挑一家等于用我们的库存假设冒充他的选择。 */
    const buyLinks = affiliateLinks(p, aff);
    /* 三种去向，文案与安全属性各不相同：
       · direct（有佣金）→ 挂 sponsored，并跟一条「广告」披露
       · link（预生成直达页）→ 不挂 sponsored（没有商业关系）
       · search（平台搜索页）→ 不挂 sponsored，文案说「搜」不说「买」

       淘宝有 pid 时会出两条（official / market），它们的 link.scope
       分别是「官方旗舰店」与「全网（含第三方店铺）」—— 这个短语必须
       渲染出来，否则用户看不出两个按钮差在哪，只会以为我们重复了。 */
    /* 广告披露（Eddie 2026-11-10 19:19 决策：去掉按钮角标，只留页脚一行）。
       这里只标"有佣金关系"与"不影响你的支付价格"，不复述整段机制。
       位置在页脚而不是按钮上，是 Eddie 拍板的取舍 —— 见 renderFooter() 的注释。 */
    const buyEls = [];
    /* 手机端：淘宝按钮改走 tbopen:// 唤起 App（任务 7）。
       `mobile` 在这里算一次就够 —— 同一屏所有卡片用同一个判断，
       不会出现"这瓶唤起、那瓶不唤起"。 */
    const mobile = isMobileContext();
    for (const l of buyLinks) {
      const labelEl = el('span', { class: 'buy-label' }, l.label);
      /* 只有淘宝的**商品级**链接才包唤起：
         · 京东没有等价协议，也不在本轮范围（pid 为空，本来就只有搜索兜底）；
         · 淘宝的两条 channel（official / market）也包，因为它们的
           落地是"搜这一瓶"的推广页，交给 App 比留在网页更接近用户目标；
           但它们的**兜底**保持原链接本身，不需要另拼。 */
      const wrap = mobile && l.platform === 'taobao' ? tbopenHref(l.href) : null;
      const fallback = wrap ? (taobaoMobileFallback(p, aff) || l.href) : null;
      buyEls.push(el('a', {
        class: 'buy-link'
          + (l.kind === 'direct' ? '' : ' is-search')
          + (l.channel === 'official' ? ' is-official' : '')
          + (wrap ? ' is-app' : ''),
        href: wrap || l.href,
        /* 唤起链接用 _self：`tbopen://` 交给系统处理，新开标签只会留下一个
           空白页（App 关掉后回来用户看到的是一片白）。网页链接仍走 _blank，
           保持"不在本站丢上下文"的原有行为。 */
        target: wrap ? '_self' : '_blank',
        /* sponsored 只标在真有佣金关系的链接上。把 sponsored 挂在一个
           不带佣金的搜索页上是虚假标注：搜索引擎按作弊处理，
           用户也会误解成"这瓶有人在付钱推"。
           noopener / noreferrer 是安全基线，三种都必须带。 */
        rel: l.kind === 'direct'
          ? 'sponsored noopener noreferrer'
          : 'noopener noreferrer',
        'data-affiliate': l.kind === 'direct' ? 'true' : 'false',
        'data-kind': l.kind,
        'data-platform': l.platform,
        'data-channel': l.channel || 'product',
        /* 唤起失败兜底：data-web 记原始网页链接，data-fallback 记移动兜底。
           两者都写进 DOM 是为了让测试与排障能直接读到"这条按钮本来该去哪"，
           不必去猜 tbopen 里那串 encode 的内容。 */
        'data-web': wrap ? l.href : null,
        'data-fallback': fallback,
        /* 点击时先按 App 唤起走；超时没离开页面就落到兜底页。
           为什么用定时器而不是只靠 href：tbopen:// 在没有 App 的设备上
           是静默失败（不报错、不跳转），页面停在原地，用户以为按钮坏了。 */
        onclick: wrap ? (ev) => {
          const timer = setTimeout(() => {
            try { window.location.href = fallback; } catch { /* 兜底也失败就留在原地 */ }
          }, 1400);
          /* 页面失焦/隐藏说明 App 接手了，撤销兜底跳转。
             用 setTimeout 清定时器而不是靠 beforeunload：后者在 iOS Safari
             上不可靠，切到 App 时不保证触发。 */
          const cancel = () => { clearTimeout(timer); };
          window.addEventListener('pagehide', cancel, { once: true });
          window.addEventListener('blur', cancel, { once: true });
          void ev;
        } : null,
      }, l.scope
        /* 带 scope 的（淘宝两条）把范围写在按钮上方一小行，
           不塞进按钮文字 —— 按钮文字保持动作（"搜"），范围是名词。 */
        ? [el('span', { class: 'buy-scope' }, l.scope), labelEl]
        : [labelEl]));
    }

    /* 按钮组要包一层再右推。
       直接把 `margin-left:auto` 放在第一个按钮上会出问题：auto 会吃掉
       整行剩余空间，第二个按钮被顶到下一行 —— 实测 1440 下京东在右侧、
       淘宝掉到左边另起一行，看着像两个不相干的东西。
       包成容器后由容器吃 auto，两个按钮在容器内并排。 */
    const footTail = buyEls.length
      ? el('div', { class: 'pick-buy-group' }, ...buyEls)
      : null;
    const foot = el('div', { class: 'pick-foot' }, ...tags,
      el('a', { href: p.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, '查看数据来源 ↗'),
      footTail
    );
    art.appendChild(foot);
    /* 广告披露位置（Eddie 2026-11-10 19:19 决策）：**不在按钮上，只在页脚一行**。
       决策原文「还是去掉角标，只留页脚声明」。Muse 曾建议保留按钮角标（更贴近
       点击点、更接近《互联网广告管理办法》第九条"可识别"的字面要求），
       Eddie 已明确否决，此处按决定执行，不再复述争议。

       历史沿革（三段，别弄混）：
         · 2026-11-02 页脚挂整段「购买链接为推广链接」；
         · 2026-11-08 用户要求整段删掉，页面只剩 rel=sponsored；
         · 2026-11-10 15:46 加按钮角标（commit 583534a）；
         · 2026-11-10 19:19 去角标、改回页脚一行（本次）。
       页脚那一行由 renderFooter() 渲染，见其注释。

       下面两条保留，它们不是广告披露：
         · 双渠道说明 —— 讲"两个按钮差在哪、价格没排序"，删了用户会以为能比价；
         · 搜索兜底说明 —— 讲"点进去是搜索结果不是商品页"，删了才是骗人。
       两者的类名都是 link-note（.link-note 是事实说明专用），
       与页脚披露的 .aff-note 分开 —— 混用会让"这页有没有广告披露"
       在 DOM 层就分不出来，上一版踩过。 */
    const anyDirect = buyLinks.some((l) => l.kind === 'direct');
    const anySearch = buyLinks.some((l) => l.kind === 'search');
    const scoped = buyLinks.filter((l) => l.scope);
    if (scoped.length > 1) {
      /* 必须写清三件事，缺一件就会变成误导：
           ① 两个按钮的落地都是搜索结果页，不是这一瓶的商品页；
           ② 「官方旗舰店」是靠关键词把品牌自营店顶到前部，不是筛选结果；
           ③ 价格没有排序 —— 实测排序参数无效，所以不承诺"最低价"。 */
      art.appendChild(el('p', { class: 'link-note', role: 'note' },
        '两个入口都会打开淘宝搜索结果：选「官方旗舰店」会把品牌自营店排到前面，'
        + '选「全网」看所有店铺（含第三方与小样）；价格未排序，请自行核对。'));
    }
    if (!anyDirect && anySearch) {
      const plats = [...new Set(buyLinks.filter((l) => l.kind === 'search').map((l) => l.platformZh))];
      art.appendChild(el('p', { class: 'link-note', role: 'note' },
        `这些是${plats.join(' / ')}搜索结果，不是这一瓶的商品页 —— 本站尚未接入购买链接`));
    }
    /* 天猫店提示（任务8 A3）。只对这一瓶的链接确实落到天猫店时显示。
       为什么必须显示：天猫店在 App 内走的是「登录失效重试」页
       （「如未登录成功，请退出本页面，打开淘宝-我的淘宝重试」），
       不提示的话用户会以为按钮坏了。
       为什么只提示这一类：淘宝店的链接点开直达商品页，加这句是误导。

       判定来自 data/tmall-shops.json（实测产出，见该文件 _method）。
       换源失败、只能保留天猫链接的瓶才需要它 —— 这是本轮 A1/A2 的兜底。 */
    if (p && TMALL_IDS.has(String(p.id)) && buyLinks.some((l) => l.platform === 'taobao')) {
      art.appendChild(el('p', { class: 'link-note is-tmall', role: 'note', 'data-note': 'tmall-shop' },
        '此款在天猫店，点开后请在天猫内搜索'));
    }
    wrap.appendChild(art);
  });

  /* V3 改法 2d：匹配度的口径说明，移到三张卡**之后**、摘要卡与 .actions 之前。
     这一行解释的是"匹配度这个数字怎么来的"（v28 改了分母，见 scoring.js 的 G6 注释：
     原来写「规则得分 / 满分」并列出四项权重，读者会心算出「52+22+18+14 = 106，
     那怎么才 60%？」——因为分子不只这四项）。所以它写成分档说明，并且在
     信息不足时直接说清"这次不算百分比"。
     位置从卡片之前挪到之后：它是**方法论说明**，只有看完结果才可能关心；
     放在前面等于让人先读免责声明再看答案。类名保持 .profile-line，
     样式跟着从 `.result-head .profile-line` 改成独立的 `.profile-line`。 */
  wrap.appendChild(el('p', { class: 'profile-line' },
    profile.matchPctShown
      ? `匹配度 = 这瓶在你的回答上拿到的分 ÷ 本次回答理论上能拿到的最高分（共 ${profile.activeDims} 个维度参与）`
      : `这次你只回答了 ${profile.activeDims} 个维度，样本太少，百分比会虚高到 90% 以上 —— 所以这里不给数字，只按原始分排序`));

  /* ---------- 可分享的结果摘要（方向 B：截图友好的结果卡）----------
     为什么单独做一张摘要卡，而不是让用户截三张大卡：
     三张大卡纵向排开近 2000px，一次截图截不全，拼图也读不出"这是一组答案"。
     这张卡把所有关键信息压进一个屏幕内可截的框：三瓶名 + 一句话理由 + 用户
     自己的答案摘要，外加一行站名 —— 截图发出去时，接收方能看到"这是什么工具
     给出的、基于什么回答"，而不是三瓶孤零零的名字。

     内容取的都是**已经存在**的字段（profile / results / reasons），
     不新算任何东西：结果卡里的数字必须与上面三张卡完全一致，否则
     截图和页面对不上，是最难解释的那种不一致。 */
  {
    const card = el('section', {
      class: 'share-card',
      'aria-label': '可分享的结果摘要',
      'data-share': 'result-summary',
    });
    /* V3 改法 4a：给这张卡一个标题行说明它是干什么的。
       改前它是凭空出现的一张圆角小卡（`--bg-2` 底 + 1px 边 + 4px 圆角），
       与上面三张「无底无圆角、只有顶线」的结果卡语法完全不同，
       用户不知道它能存、能截图。这里只加一行 12px 的说明文字，
       不改任何视觉参数（4b「改成与结果卡同样语法」已明确否决：
       同底色时截图边缘会与背景融在一起，见 80-specimen.css 的注释）。
       复用既有的 `.chips-label`（12px + 前置一段短线），不新增组件。

       **放在卡片外面、贴着卡片上沿**，不塞进卡里：这张卡的用途就是被整张截下来，
       把「这张可以整张截下来」印进卡里，截图本身会带上这句自我指涉的话。 */
    wrap.appendChild(el('p', { class: 'chips-label share-hint' }, '想发出去？这张可以整张截下来'));
    card.appendChild(el('div', { class: 'share-kicker' }, 'SCENT PROFILE'));
    card.appendChild(el('h3', { class: 'share-title' }, '我的三瓶候选'));
    /* 答案摘要：只列用户真的答过的项，空值滤掉（与 result-head 同一套过滤）。
       v6 起季节屏已退场，season 永远是 null —— 那两项整段删掉，
       而不是留个恒为 null 的分支（恒 null 的代码会在下一次重构时误导人）。 */
    const budgetZh = (() => {
      const idx = priceIndex();
      const cur = state.answers.budget || 'any';
      if (!idx || cur === (idx.anyId || 'any')) return null;
      const b = (idx.bands || []).find((x) => x.id === cur);
      return b ? b.zh : null;
    })();
    const answerBits = [
      profile.emotionZh,
      budgetZh,
      profile.occasionZh,
      `浓郁度 ${profile.intensity}/5`,
    ].filter(Boolean);
    card.appendChild(el('p', { class: 'share-answers' }, answerBits.join(' · ')));

    const ol = el('ol', { class: 'share-list' });
    results.forEach((r, i) => {
      const p = r.perfume;
      /* 理由取第一条**可反推**的（buildReasons 已按因子权重排过），
         不做摘要改写 —— 改写会把"反推到某个答案"这条产品硬约束改丢。 */
      const reason = (r.reasons && r.reasons[0]) || '';
      ol.appendChild(el('li', { class: 'share-item' },
        el('span', { class: 'share-rank' }, String(i + 1)),
        el('span', { class: 'share-name' },
          el('strong', {}, p.name),
          el('span', { class: 'share-brand' }, p.brand || '')),
        reason ? el('span', { class: 'share-reason' }, reason) : null
      ));
    });
    card.appendChild(ol);
    card.appendChild(el('p', { class: 'share-foot' },
      '从 1388 瓶里按规则打分选出，选品不调用大模型'
    ));
    wrap.appendChild(card);
  }

  /* ==== 结果页的三个出路（规格底线：保留「换一批 / 改一题重推」）====
     为什么要三个而不是一个「重新来一次」：
       ① 换一批   —— 我方向对，但这三瓶不太对味。代价只是重算，答案全留着。
       ② 改一题   —— 我有一题答错了（通常就是刚才那一屏）。代价是回到那一屏，
                     **其余答案不动** —— 这是三者的关键区别：改一题不是重开。
       ③ 重新来一次 —— 我想从头换个思路。三者里只有它会清空一切。
     按钮顺序按代价从小到大：先给最轻的两个，把"全部重来"放最后。
     这不是转化优化，是**不必让用户为了改一件事付整程的代价**。 */
  const round = state.resultView ? state.resultView.round : 0;
  wrap.appendChild(el('div', { class: 'actions result-actions', style: 'margin-top:36px' },
    el('button', { class: 'btn', type: 'button', onclick: (ev) => reshuffle(ev.currentTarget) },
      round === 0 ? '换一批 →' : `换一批（第 ${round + 2} 组）→`),
    el('button', { class: 'btn ghost', type: 'button', onclick: (ev) => openRetune(ev.currentTarget) },
      '改一题重推'),
    el('div', { class: 'spacer' }),
    el('span', { class: 'hint' }, '换一批只换瓶子，答案全留着；改一题只动那一屏')
  ));

  /* 「重新来一次」退到一行小结里：它代价最大，不该和三颗主按钮并列抢注意力。
     但仍然必须存在 —— 想彻底换个思路的人需要它。 */
  wrap.appendChild(el('p', { class: 'result-restart' },
    '都不是你要的？',
    el('button', { class: 'link-btn', type: 'button', onclick: restart }, '从头重新答一遍'),
    '（会清空全部答案）'
  ));

  return wrap;
}

/* ---------- 换一批：同一个答案，换下一组瓶子 ----------
   实现方式：把已展示过的 id 塞进 resultView.soldOut，然后带 exclude 重算。
   为什么不用 random seed：结果必须可复算 —— 同一份答案 + 同一批 soldOut
   永远得到同一组瓶子。随机会把"为什么推这瓶"这条承诺破掉。
   topN 取 3 + 已排除数，再在结果里滤掉已排除的，这样排序本身不变，
   只是往下顺延 —— 不能靠"取 topN 之后丢掉"实现，那会越换越少。 */
async function reshuffle(btn) {
  const busy = setBusy(btn, '正在换…');
  try {
    const d = await ensurePerfumes();
    const view = state.resultView || (state.resultView = { round: 0, soldOut: [] });
    /* 把这一轮的三瓶记为已出过 */
    for (const r of (state.result || { results: [] }).results) {
      if (r && r.perfume && !view.soldOut.includes(r.perfume.id)) view.soldOut.push(r.perfume.id);
    }
    const pool = poolForBudget(d.perfumes, state.answers.budget);
    const want = 3 + view.soldOut.length;
    let res = recommend(state.answers, pool, TAX, { topN: want });
    /* 先按已出过的滤，滤完不足 3 瓶就退回全库再滤一次 */
    let picked = (res.results || []).filter((r) => !view.soldOut.includes(r.perfume.id)).slice(0, 3);
    if (picked.length < 3) {
      res = recommend(state.answers, d.perfumes, TAX, { topN: want });
      picked = (res.results || []).filter((r) => !view.soldOut.includes(r.perfume.id)).slice(0, 3);
    }
    /* 真的换不出新的了（库就这么大）：如实说，不假装换过。
       重置 soldOut 让用户可以重新开始一轮 —— 但按钮文案要说明这件事。 */
    if (picked.length < 3) {
      view.soldOut = [];
      res = recommend(state.answers, pool, TAX, { topN: 3 });
      picked = res.results || [];
      view.round = 0;
    } else {
      view.round = (view.round || 0) + 1;
    }
    state.result = { ...res, results: picked };
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    busy(false);
  }
}

/* ---------- 改一题：跳到某一屏，其余答案不动 ----------
   不给选择器让用户"选哪一题"：那是把一份问卷变成一张目录。
   做法是**回到最可能答错的那一屏**，并把其余六屏列成一行可点的小签 ——
   点哪个回哪个。这样默认动作是"改最关键的一题"，而不是先做一次选择。
   哪一题最可能答错：预算（它决定候选池，答错整组都不对）。
   这一判断写在 RETUNE_DEFAULT 里，不藏在代码中间。 */
const RETUNE_DEFAULT = 'budget';
function openRetune(btn) {
  void btn;
  const list = curSteps();
  const idx = list.findIndex((x) => x.id === RETUNE_DEFAULT);
  state.step = idx >= 0 ? idx : 0;
  /* 从结果页回到问卷时，结果先留着：用户改完一题按「看推荐」会重算并覆盖。
     这里不清 state.result —— 清了的话退回上一屏会看到空白。 */
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* onResult：只有结果页才有购买链接，所以广告披露也只在结果页出现。
   问卷各屏显示「购买链接为联盟推广链接」会指涉一屏上不存在的东西。 */
function renderFooter(onResult = false) {
  // 署名信息存在 perfumes.json 的 meta 里，而香水库是延迟加载的 ——
  // 首屏（前三步）可能还没到货。没到就先不渲染这一段，别让 undefined 崩掉整页。
  const meta = DATA?.meta;
  const credit = meta
    ? el('div', { style: 'margin-top:8px' },
        el('strong', {}, '数据署名 '),
        // 直接取 meta.attribution，与上游 LICENSE 指定格式逐字一致，不在代码里另抄一份
        meta.attribution,
        ' · ',
        el('a', { href: meta.licenseUrl, target: '_blank', rel: 'noopener noreferrer' }, 'CC BY 4.0'),
        ' · 快照 ', meta.sourceSnapshot,
        ' · 原始数据经清洗、家族映射与字段裁剪，',
        el('em', {}, '已修改'),
        '。'
      )
    : el('div', { style: 'margin-top:8px' },
        el('strong', {}, '数据署名 '),
        'Scento — perfume-database · CC BY 4.0 · 原始数据经清洗、家族映射与字段裁剪，',
        el('em', {}, '已修改'),
        '。'
      );

  return el('footer', { class: 'foot' },
    el('div', {},
      el('strong', {}, '关于这些推荐 '),
      '选品完全由规则打分产生，不调用大模型'
    ),
    credit,
    /* 广告披露（Eddie 2026-11-10 19:19 决策：「还是去掉角标，只留页脚声明」）。
       一行、不带标题、不复述佣金机制之外的东西。类名用 .aff-note ——
       它是广告披露专用类，与讲事实的 .link-note 分开，这样 DOM 层能
       单独回答「这页有没有广告披露」。
       Muse 曾建议保留按钮角标（更贴近点击点、更接近《互联网广告管理办法》
       第九条"可识别"的字面要求），Eddie 已明确否决并拍板本方案，此处按决定
       执行，不再于代码里复述争议。

       只在结果页（onResult）渲染：问卷屏上没有任何购买链接，
       在那种屏上写「购买链接为推广链接」是指涉不存在的东西。 */
    onResult
      ? el('div', {
        class: 'aff-note',
        role: 'note',
        'data-disclosure': 'affiliate-footer',
      }, '购买链接为联盟推广链接，通过它们成交本站可能获得佣金，不影响你的支付价格。')
      : null,
    el('div', { style: 'margin-top:8px' },
      el('strong', {}, '已知局限 '),
      /* 原文写「不含价格与购买渠道」—— 自 v27 起结果页就有购买入口了，
         这句话早就不成立（2026-11-10 发现）。不改会让页脚同时说
         「有推广链接」和「不含购买渠道」，自相矛盾。 */
      '持香与扩散为按浓度推断，非实测；不展示价格、不做比价；库容随上游开放数据集更新，可能仍选不到你已经知道的那一瓶'
    ),
    /* 介绍页入口（2026-11-12 上线包）。放在页脚最后一行、独立一段，
       因为它是**导航**而不是说明文字 —— 混进上面任何一段都会读成"局限之一"。
       用普通 <a> 而不是 JS 路由：介绍页是静态 HTML，直接跳转最稳，
       也不给这一屏增加任何运行时状态。 */
    el('div', { class: 'foot-nav', style: 'margin-top:10px' },
      el('a', { href: './about.html' }, '这个工具是做什么的 · 数据来源与已知局限 →')
    )
  );
}

/* ---------- 背景层：把 ambientOf() 的结果写到 #app 的 CSS 变量上 ----------
   为什么走 CSS 变量而不是直接改样式：底噪是一条**连续**的量，逐屏重算、
   逐屏写在同一个变量上，样式层只负责"怎么用这三个数"。这样调强度上限
   不必碰 JS，调方向也不必碰 CSS。
   hardCap 在样式层再做一次（见 styles/src/90-quiz-v6.css 的 .amb-layer），
   两处都夹是为了"只改一处也不会失控"。 */
function applyAmbient() {
  const app = $('#app');
  if (!app) return;
  const list = curSteps();
  const total = list.length;
  /* 结果页的 step 等于 total —— 底噪到那一屏才是满格，这是"一程走完"的收尾。 */
  const amb = ambientOf(state.answers, state.step, total);
  const vars = ambientVars(amb);
  for (const [k, v] of Object.entries(vars)) app.style.setProperty(k, v);
  app.setAttribute('data-amb', amb.active ? amb.axis : 'none');
  /* 刻度文字不在这里写 —— 它由 renderMasthead 直接算并写进节点，
     两处都写会分叉（后写的那个赢，而且顺序一改就静默失效）。
     这里只负责 CSS 三轴 + data-amb（给样式层认方向用）。 */
  void 0;
}

function render() {
  const app = $('#app');
  /* 切屏前记下焦点落在哪个可交互元素上。整页重建会把原节点连同焦点一起丢掉，
     键盘用户每走一步都要从头 Tab 穿过页头才能回到题目 —— 实测切步后
     activeElement 是 BODY。 */
  const prevFocus = document.activeElement;
  const hadFocusInside = prevFocus && prevFocus !== document.body && app.contains(prevFocus);

  /* ==== 转场逐屏自选（规格 4）====
     相邻屏可以连续（带元素走过去），也可以焕新（走进新房间）。
     两种都合法，判据是**这一处的体验**，不是统一公式。所以这张表逐屏写，
     不设默认值兜底 —— 漏写一屏会落成 'cut'，而 'cut' 是最弱的转场，
     它必须是被选出来的，不是被漏出来的。

       cut    零位移淡入  —— 同一段路里连续作答，位移会打断线性感
       settle 下沉 6px    —— 换轴：从"范围"进"感觉"，从"时间"进"分量"
       lift   上浮 6px    —— 收束：末屏（已知款）之后要给答案了
       rise   上浮 14px   —— 结果页（全流程唯一"给答案"的一屏）

     逐屏理由（也写在 PR 的逐屏表里）：
       budget   → settle  首屏，自己就是"进门"，下沉最有"推门"感
       emotion  → settle  换轴：从钱进感觉。**同时是底噪开灯的那一屏**
       wanted   → cut     与上一屏同属"味道偏好"这段路，连续
       unwanted → cut     同一段路的另一面
       occasion → settle  换轴：从"味道"进"什么时候"
       season   → cut     与场合同属时间轴，连续走完一年与一天
       concentration → settle 换轴：从"什么时候"进"多重的分量"
       anchor   → lift    收束屏，最后一次提问，之后是结果
       result   → rise    给答案 */
  const SCENE = {
    budget: 'settle',
    emotion: 'settle',
    wanted: 'cut',
    unwanted: 'cut',
    occasion: 'settle',
    season: 'cut',
    concentration: 'settle',
    anchor: 'lift',
  };
  const list = curSteps();
  /* 越界保护（防御性）。v6 步骤表固定 8 屏、无入口分叉，理论上 state.step
     只可能等于 length（结果页）。留着是为了让「容器长度与下标」这对不变量
     有兜底 —— 将来若重新引入条件屏，这里不会炸。
     夹到末屏而不是回第 1 步：用户刚看一眼结果，不该被扔回开头重答。 */
  state.step = clampStep(state.step, list.length);
  const isResult = state.step >= list.length;
  app.dataset.scene = isResult
    ? 'rise'
    : (SCENE[list[state.step].id] || 'cut');

  /* 步骤 id 同时写进 DOM，供 CSS 认屏。
     原先靠 `main:has(.disc):has(.seg)` 认"场景屏"，结果是转盘屏被一起命中，
     masthead 的下边距在那一屏被压成 6px —— 换屏时整页跳 12–22px。
     写一个显式属性，认屏就不靠"这个屏碰巧有什么元素"。 */
  app.dataset.step = isResult ? 'result' : list[state.step].id;

  app.innerHTML = '';
  app.appendChild(renderMasthead());
  app.appendChild(renderProgress());
  if (isResult) {
    app.appendChild(renderResult());
  } else {
    app.appendChild(list[state.step].render());
  }
  app.appendChild(renderFooter(isResult));

  /* 背景层：底噪三轴（src/ambient.js）。**必须放在页面重建之后** ——
     applyAmbient() 除了写 #app 上的 CSS 变量，还要把刻度文字写到
     .amb-tick 上（页眉里那枚读数）。第一版把它写在 app.innerHTML = '' 之前，
     于是它写入的是**即将被销毁的旧刻度**，新渲染出来的刻度永远是空的
     （test-render 的"刻度写着方向与档位"抓到）。
     CSS 变量写在 #app 上不受重建影响，所以两种顺序都能拿到变量 ——
     但刻度不能，所以统一挪到这里，一处生效。 */
  applyAmbient();

  /* 焦点恢复分两种情况，判据是「这次重建前焦点在不在页面里」：

     ① 首次渲染 / 焦点本来就在 body（鼠标用户点按钮后浏览器已把焦点放 body）：
        不抢焦点。原先第一版会 focus 第一个扇区，导致新访客一进来就看见
        「清冷」戴着焦点环、盘心写着「正在看 清冷」，误以为已经选中；
        真正的空态永远不出现。

     ② 焦点本来在页面内（键盘用户在按钮上按 Enter 切屏）：
        必须把它接到新屏的标题上，否则焦点掉回 body，用户得重新 Tab。
        标题加 tabindex="-1" 才能被程序聚焦，且不进 Tab 序列。 */
  if (!hadFocusInside) return;
  const title = app.querySelector('.q-title') || app.querySelector('.result-head h2');
  if (!title) return;
  title.setAttribute('tabindex', '-1');
  title.focus({ preventScroll: false });
}

/* ---------- 启动 ---------- */
/* 分两段加载，而不是等两个文件都到齐才画第一屏。
   为什么：perfumes.json 有 519KB，taxonomy.json 只有 23KB。原先是 Promise.all
   一起等，慢网实测首屏要 1.9s（4G）/ 3.1s（限速），这期间页面只有一张空白纸，
   用户会当成「网站打不开」。前三步（情绪/场合/浓度）根本用不到香水库，
   只需要 taxonomy —— 所以先把它画出来，香水库在后台继续下，到第 4 步再等。 */
let perfumesPromise = null;
function ensurePerfumes() {
  if (DATA) return Promise.resolve(DATA);
  if (!perfumesPromise) {
    const base = new URL('./', import.meta.url);
    perfumesPromise = fetch(new URL('data/perfumes.json', base))
      .then((r) => {
        if (!r.ok) throw new Error(`perfumes.json HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { DATA = d; return d; })
      .catch((err) => { perfumesPromise = null; throw err; });
  }
  return perfumesPromise;
}

/* 实物图清单。和直达链接表同一套降级语义：文件缺失 / 解析失败 / 结构不对
   一律当作"没有"，页面退到绘制瓶形，绝不阻塞首屏。
   为什么不等它：photos.json 只有几百字节，但它挂在结果页渲染路径上，
   一旦慢就等于让"看推荐"多一次 RTT。 */
let photosPromise = null;
function ensurePhotos() {
  if (PHOTOS !== null) return Promise.resolve(PHOTOS);
  if (!photosPromise) {
    const base = new URL('./', import.meta.url);
    photosPromise = fetch(new URL('data/photos.json', base))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        /* 只接受 { 字符串: 字符串 } 的扁平结构。
           顺手挡掉绝对 URL 与 javascript: —— 这张表是可被替换的文件，
           不校验等于把任意外链塞进 <img src>。 */
        const out = {};
        const map = d && typeof d === 'object' && d.photos && typeof d.photos === 'object' ? d.photos : null;
        if (map) {
          for (const [id, p] of Object.entries(map)) {
            if (typeof p !== 'string' || !p) continue;
            if (/^\s*(https?:|data:|javascript:|\/\/)/i.test(p)) continue;
            out[id] = p;
          }
        }
        PHOTOS = Object.keys(out).length ? out : false;
        /* 抠图名单：只收 photos 表里真实存在、且值仍是相对路径的 id。
           表里写了但图没了（或换了白底图）就不该再当抠图处理。 */
        const cut = Array.isArray(d && d.cutouts) ? d.cutouts : [];
        CUTOUTS = new Set(cut.filter((id) => typeof id === 'string' && out[id]));
        return PHOTOS;
      })
      .catch(() => { PHOTOS = false; return PHOTOS; });
  }
  return photosPromise;
}

/* 预生成的直达链接表（阶段二）是**可选**的：文件不存在、解析失败、
   结构不对 —— 三种情况一律当作"没有"，绝不阻塞首屏。
   它不是数据源，只是省一次平台搜索的便利层，缺了页面照常工作。 */
function ensureAffLinks() {
  if (AFF_LINKS !== null) return Promise.resolve(AFF_LINKS);
  const base = new URL('./', import.meta.url);
  /* 天猫清单与链接表**并行**取，互不阻塞：清单失败不影响链接表，
     链接表失败也不影响清单（清单单独有意义：提示句与有没有链接无关）。 */
  ensureTmallShops();
  return fetch(new URL('data/affiliate-links.json', base))
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      /* 幂等：AFF_LINKS 用 null 表示"还没试过"，用 false 表示"试过、没有"。
         这样重复调用不会反复发请求，也不会把空对象当成功。

         支持两种表结构：
           ① 新（双平台）：{ jd: {id:url}, taobao: {id:url} }
           ② 旧（平铺）：  { platform: 'jd', links: {id:url} }
         旧结构按 platform 折叠成新结构，这样已经生成过表的部署不用重跑脚本。 */
      if (!d) { AFF_LINKS = false; return AFF_LINKS; }
      const norm = {};
      if (d.platform && d.links) {
        norm[d.platform] = d.links;                       // 旧结构
      } else {
        for (const [plat, table] of Object.entries(d)) {
          if (!SEARCH_PLATFORMS[plat] || !table) continue;
          const map = table.links || table;
          if (map && typeof map === 'object' && Object.keys(map).length) norm[plat] = map;
        }
      }
      AFF_LINKS = Object.keys(norm).length ? norm : false;
      return AFF_LINKS;
    })
    .catch(() => { AFF_LINKS = false; return AFF_LINKS; });
}

/* 天猫店清单。文件缺失/格式不对一律退化成空集（不提示），
   绝不像 AFF_LINKS 那样有"三态"负担 —— 它只影响一句提示的有无。 */
let tmallPromise = null;
function ensureTmallShops() {
  if (tmallPromise) return tmallPromise;
  const base = new URL('./', import.meta.url);
  tmallPromise = fetch(new URL('data/tmall-shops.json', base))
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const list = Array.isArray(d?.tmallIds) ? d.tmallIds : [];
      TMALL_IDS = new Set(list.map((x) => String(x)));
      return TMALL_IDS;
    })
    .catch(() => { TMALL_IDS = new Set(); return TMALL_IDS; });
  return tmallPromise;
}

async function boot() {
  /* index.html 里已有静态骨架屏（不能靠这里注入 —— app.js 是 module，
     自己下载完才执行，那几秒里页面会是空的）。这里只负责抹掉它。 */
  try {
    if (typeof document !== 'undefined') document.documentElement.dataset.build = BUILD_ID;
    // 以本模块的位置解析数据路径，而不是以页面位置。
    // 相对 fetch('./data/…') 会随【页面】所在目录变 —— 核查页放在 /tools/
    // 下时会错找 /tools/data/ 而 404（实测踩过）。以 import.meta.url 为基就没这问题。
    const base = new URL('./', import.meta.url);
    // 香水库不阻塞首屏：立刻发请求，但不等它
    ensurePerfumes().catch(() => {});   // 失败在用到时再抛，这里只预热
    /* 直达链接表同样不等：它只是便利层，到结果页时再读。 */
    ensureAffLinks().catch(() => {});
    /* 实物图清单也是压到底再读的便利层，顺手预热。 */
    ensurePhotos().catch(() => {});
    /* 盘心彩图：与香水库并行预热，24 枚一起拉，用户点到哪格都有现成的。 */
    artWarmAll();
    /* 价位带索引（第 1 屏预算要用）。它与 taxonomy 一起到位就够了 ——
       第 1 屏必须能立刻画出四枚价签，否则首屏会先空一下。
       读不到就降级：预算屏只画「不限」一项，选择器不出现死选项。 */
    try {
      const pr = await fetch(new URL('data/price-bands.json', base));
      if (pr.ok) PRICE_INDEX = await pr.json();
    } catch { PRICE_INDEX = null; }
    const res = await fetch(new URL('data/taxonomy.json', base));
    if (!res.ok) throw new Error(`taxonomy.json HTTP ${res.status}`);
    TAX = await res.json();
    render();
  } catch (err) {
    $('#app').innerHTML = `<div class="masthead"><h1>加载失败</h1></div>
      <p class="q-help">${err.message}</p>
      <p class="hint">若你是直接双击打开的 index.html，浏览器会因 file:// 限制拒绝读取 JSON。
      请在本目录启动一个静态服务器：<br><code>node server.js</code> 然后访问 http://localhost:8080</p>`;
  }
}

document.addEventListener('DOMContentLoaded', boot);

/* 给测试用的内部句柄。
   测试把 app.js 复制成临时 .mjs 后 import，拿不到模块内的私有函数，
   而推广链接的降级矩阵是纯函数（不碰 DOM、不碰 state），在测试里直接调
   比渲染三张卡再 inspect 快也准。这里只暴露一个，不扩大面。 */
export const __badgeText = topBadgeText;
export const __aff = {
  config: affiliateConfig,
  href: affiliateHref,
  link: affiliateLink,
  links: affiliateLinks,
  /* 单平台的一组链接（淘宝会返回两个渠道）。测试要验"两个渠道的
     关键词差在哪"时用它，比渲染整页再抓 DOM 更直接。 */
  platformLinks,
  channels: TAOBAO_CHANNELS,
  platforms: SEARCH_PLATFORMS,
  /* 联盟转链域名的判据本身也要能被测 —— 它决定"标不标广告"，
     是这个文件里合规分量最重的一个布尔值，不能只靠渲染结果间接验。 */
  isAffiliateHost,
  affiliateHosts: AFF_DIRECT_HOSTS,
  /* 测试里可以把直达链接表塞进来，不必真去 fetch。
     传 false 表示"没有这张表"，传对象表示"有"。 */
  setLinks: (v) => { AFF_LINKS = v; },
  /* 手机端唤起（任务 7）。三个都是纯函数，测试直接调比渲染整页快：
       tbopenHref   —— 包装规则（只放行 http(s)，pid/参数原样保留）
       mobileFallback —— 唤起失败后落到的移动版兜底
       isMobile     —— 什么算"手机"（触屏或窄屏），决定包不包唤起 */
  tbopenHref,
  mobileFallback: taobaoMobileFallback,
  isMobile: isMobileContext,
  tbopenPrefix: TB_OPEN,
};

/* 实物图的降级判据。同样是纯函数，同样只为可测而暴露。 */
export const __art = {
  /* 给定一瓶和一张清单，返回该用的图路径或 null（= 该画瓶形）。
     三种"没有"都要走同一条路：undefined / false / {} ——
     ensurePhotos() 在文件缺失时写的是 false，不是 {}。 */
  sourceOf: artSourceOf,
  /* 这一瓶是不是透明抠图（决定深色下要不要白瓷底托）。 */
  isCutout,
  /* 让测试能注入清单，不必在磁盘上放真图。 */
  set: (v) => { PHOTOS = v; },
  setCutouts: (v) => { CUTOUTS = v instanceof Set ? v : new Set(Array.isArray(v) ? v : []); },
};

/* 步骤表本身要能被测。
   v6 起七屏固定、无入口分叉，但"条数"与"第 N 步 / 共 M 步"这对数字
   仍然是用户唯一能看见的计数 —— 它错一次，用户就会以为自己漏答了一屏。 */
export const __steps = {
  all: STEPS,
  cur: curSteps,
  head: stepHead,
  clamp: clampStep,
};

/* 生活短语映射层。测试要验的三件事都在这层，且都只有这里取得到：
   ① 短语表里每条都真的对应 taxonomy 里存在的香材（不许写错 en 名）；
   ② 短语 → 香材的展开是去重的；
   ③ 每条短语在 1388 瓶里都够货（否则就是骗点击的死选项）。 */
export const __life = {
  all: LIFE_NOTES,
  live: livePhrases,
  notesOf: notesOfPhrases,
  zhOf: zhOfPhrases,
  min: LIVE_NOTE_MIN,
};

/* 预算映射层。测试要验"档太窄时退回全库"这条降级，而它只在池子上生效，
   光看界面看不出来。 */
export const __budget = {
  pool: poolForBudget,
  bands: () => priceIndex(),
  setIndex: (v) => { PRICE_INDEX = v; },
};

/* 背景层（底噪）。"只增不减、不换方向"这两条性质必须能直接算，
   不能只靠人眼看截图。 */
export { ambientOf as __ambient } from './src/ambient.js';

/* 气质原型与它的推导函数。测试要验"选了原型就等于答了冷暖甜度"，
   而这条关系只能从 app.js 里取到（CHARACTER_PRESET 不导出）。 */
export const __presets = CHARACTER_PRESET;
export const __derivePreset = deriveFromPreset;

/* 重开一局。测试要验「情绪入口 7 步」必须能从干净状态走一遍，
   否则只能验到纯函数、验不到 navBar / render / 进度条。 */
export const __restart = restart;


/* 测试用：把推导函数挂到 #app 上，供 test-render 直接调用。
   它不碰 DOM 也不碰 state，是纯函数；挂一份比在测试里复制粘贴实现更可靠。 */
if (typeof document !== 'undefined') {
  const mount = () => {
    const a = document.querySelector('#app');
    if (!a) return;
    a.__rankProbe = rankCharacterPresets;
    /* v37：测试要直接验「原型 → 冷暖甜度」这条映射，
       而各屏的 render 只用得到 CHARACTER_PRESET 本身，用不着这两个句柄。
       挂在这里而不是 export，是因为测试走的是真渲染路径（读到的是 #app 元素），
       而 ESM export 拿到的是模块作用域 —— 两条都留会让人不知道该用哪个。 */
    a.__presets = CHARACTER_PRESET;
    a.__derivePreset = deriveFromPreset;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
}
