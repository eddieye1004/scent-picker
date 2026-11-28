
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
/* 本次 Qoder 改造的两块新逻辑都放在独立模块里：
   history.js 只碰传入的 storage，share-card.js 只碰 canvas 2D ——
   两者都不读 DOM/state，所以能在 node 里直接测，也方便以后单独替换存储层。 */
import {
  addHistory, readHistory, clearHistory, makeHistoryRecord, entryLabel,
} from './src/history.js';
import {
  buildShareModel, drawShareCard, SHARE_W, SHARE_H,
} from './src/share-card.js';
/* 第 2 步动态避雷屏（feat/quiz-v7-step2-avoid）：
   avoid-map.js 是「元素 → 场景句 → 所属香型」映射表（原 LIFE_NOTES 抽出来的），
   avoid.js 是按 perfumes.json 频次现算候选的三条硬规则。两者都不碰 DOM。 */
import { AVOID_SCENARIOS } from './src/avoid-map.js';
/* 心仪清单数据层（L1，2026-11-23）。这里只用它的公开 API 与注入点，
   不改它的任何语义 —— 存储不可用时的内存兜底写在 src/wish-ui.js，
   靠 createWishlist(storage) 这个既有注入口完成，不给数据层开洞。 */
import { wishlist } from './src/wishlist.js';
import { createWishSession, wishMessage, wishReasonOf } from './src/wish-ui.js';
/* 清单页的解析层（L3）。它只把「心仪条目 + 现有数据」算成「一行该显示什么」，
   不碰 DOM —— 所以「没有价格就不显示价格」「没有链接就不显示链接」这两条
   最容易被写成兜底值的判据，能在 node 里一格一格地验（scripts/test-wishlist-page.mjs）。 */
import {
  WISH_PAGE_MSG, wishListModel, perfumeIndex, priceLabelOf, priceBandOf, savedLabel,
  CLEAR_LABEL, CLEAR_ARM_LABEL, nextClearState, removableOf,
} from './src/wish-page.js';
/* 试香盖章（2026-11-23）。数据层 src/stamp.js 只认传入的 storage，
   编排与展示模型在 src/stamp-ui.js —— 两者都不碰 DOM，所以「五档回读」
   「重复盖章计数」「撤销退回上一次」「存储不可用降级」都能在 node 里直接验
   （scripts/test-stamp.mjs / test-stamp-ui.mjs）。这里只负责画与点。 */
import { createStamps } from './src/stamp.js';
import {
  createStampSession, stampViewOf, stampMessage, stampTiers, stampKeyOf, STAMP_MSG,
} from './src/stamp-ui.js';
import { buildAvoidIndex, avoidPlan, avoidSelection, avoidDirection } from './src/avoid.js';
/* 季节屏的「方向 × 季节」24 句（定版 2026-11-23）。抽成独立模块而不是塞进下面的
   SEASONS：那 24 句的来源是一份 md，逐字比对是这条改动的验收线，句子集中在
   一个文件里才能一眼对完。查不到组合时 seasonScene() 返回空串，renderSeason
   回退到该季原有的 desc —— 用情绪入口进来的人没有 family，那一屏必须照常渲染。 */
import { seasonScene } from './src/season-copy.js';
/* 中圈胶囊的**短标签**（Eddie 2026-11-25 22:37 裁决，1 号方案「缩短标签」）。
   只被 renderArcs 那一个渲染点消费：盘心小类列表、盘心主词、结果页、文案
   全部照旧读数据里的全名（label || zh）。表与两条边界情况见 src/sub-labels.js。
   subFullName 同源于那张表所在的模块，供胶囊的 aria-label 取全名 ——
   短标签是为**视觉宽度**缩的，读屏不该跟着少听两个字（见 renderArcs 里的注释）。 */
import { subShortLabel, subFullName } from './src/sub-labels.js';

const state = {
  step: 0,
  /* 入口路由与答案分离：null=入口二选一，family/emotion=已选界面。
     卡片点击绝不写 answers；只有进入对应屏后的真实选项才写。 */
  entry: null,
  entryMotion: false,
  answers: {
    /* ==== 2026-11-17 问卷 v7 第 1 步：圆盘回到第一屏 ====
       v6 的两处结构性改动里，② 被 Eddie 否决（"删了开屏圆盘、删了 24 个图标"），
       本步把它恢复；① 预算前置保留，只是退到第 2 屏 —— 到 v7 第 3 步③ 它更进一步
       退到末屏。两次搬动都不改口径：`poolForBudget` 只在 `finish()` 与「换一批」
       生效（两处都在最后一屏之后），"先圈池再问偏好"在引擎侧从未被破坏。

       v6 的原注释（为什么当年撤盘）留在这里当反面记录，不删：
         ① **预算前置到第 1 屏**（规格：预算题前置，先圈池再问偏好）；
         ② **香型轮盘退场**：那张盘的六个扇区写着「柑橘调 / 花香调 /
            东方琥珀调」，中圈是「古龙水型 / 白花」，它本身就是一道香调术语题 ——
            而规格底线是「全程无香调术语题」。
       ② 的论证本身没错，错在结论：盘上的六个词是"香水家族名"，
       而用户不必认识它们也能选 —— 盘心第一个状态就写着「还没选 / 从外圈挑一个大类」，
       每一块扇区下面还挂着两味具体香材（柠檬·佛手柑）。术语是**注解**，
       不是题面。真正的术语题是 v5 那两屏"点名佛手柑"的 chip 墙，那两屏仍不在。

       family / subfamily 是圆盘的落点，也是 src/scoring.js 的第一条入口
       （buildProfile 按「family 或 emotion 二选一」取入口）。
       direction 是底噪的方向（六轴 id），由 AXIS_OF_FAMILY 从 family 换算 ——
       两者分开存，是因为一个是"给引擎的口味"，一个是"给背景的光"，
       合并成一个字段会让两者互相污染。 */
    family: null,
    subfamily: null,
    /* 底噪方向。值域是 src/ambient.js 的 DIRECTION_AXES 六个键
       （cold/warm/clean/mysterious/bright/lazy）。写入点只有一个：
       renderFamily 的 onChange —— 圆盘选了家族就换算成轴。
       **不改评分**：scoring.js 不读这个键。 */
    direction: null,
    /* 首屏「按感觉选」路径。值来自 TAX.emotionMap 的六个 id。
       圆盘没有给方向时，它充当底噪来源 —— 判定写在 src/ambient.js 的
       ambientOf 里，不在这里。 */
    emotion: null,
    /* 第 1 屏预算。值 = data/price-bands.json 的 bands[].id，或 'any'。
       **刻意不进 activeDims**：它是候选范围，不是偏好证据。把它写进答案会让
       MATCH_PCT_MIN_DIMS 的门槛虚抬一维，等于拿范围冒充证据。
       它只作用于「把哪一批瓶子交给 recommend()」这一步，见 poolForBudget()。 */
    budget: 'any',
    occasion: null,
    intensity: 3,
    /* 「想要的味道 / 受不了的味道」两屏：存的是生活短语 id（如 'citrus-peel'），
       不是香材名。短语在 LIFE_NOTES 里定义成"一句人话 + 它对应的香材 en 列表"，
       写进引擎的仍是那批香材 —— 术语只活在映射表里，不上屏。

       ==== wanted：屏已撤、键保留（v7 第 3 步②）====
       「想要的味道」这一屏已按 v7 定版从流程删除，入口（STEPS / renderWanted /
       renderLifePicker / navBar / SCENE）整块清掉。但**这个键不能删**：
       ① `renderAvoid.toggle` 的互斥摘除读它（点避雷卡时从那一边摘同一条短语），
          删键会让那处从「空集」变成「undefined」；
       ② `restart()` 的键表要与 state.answers 一致（历史上漏过一次）；
       ③ `syncPhrasesToNotes` 要能把它展开成 likedNotes（恒为空集）。
       行为上删键与留空集等价（likedNotes 因子整条跳过、不加分不扣分），
       但键表分叉会埋下"重开一局带着上一轮答案"的同类事故。
       所以留键、不写入：`answers.wanted` 恒为 `[]`，`likedNotes / likedZh` 恒为空
       —— 与"用户当年跳过那一屏"逐位一致。将来若恢复这一屏，写入口接回去即可。 */
    wanted: [],
    unwanted: [],
    /* ==== 避雷屏第三态「没闻过」（2026-11-23，Eddie 批准 QW10 诊断第 1 条）====
       存的是生活短语 id，与 unwanted 同一套键。这**不是**排除项，也**不是**
       接受项：它唯一的职责是把"我确实不知道"与"我接受"区分开，让用户敢承认
       没闻过，而不是被迫在"扣 40 分"和"假装接受"之间二选一。
       所以它不参与 syncPhrasesToNotes —— dislikedNotes 只由 unwanted 展开，
       这一点由 syncPhrasesToNotes 的实现保证（它只读 unwanted），不靠调用方自觉。
       两列互斥由 src/avoid.js 的 avoidSelection 保证（不要优先）。 */
    noSmell: [],
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
    /* ==== 已知款（anchor）三个键：屏已撤，键保留 ====
       v7 定版的流程里没有"已知款"这一题，入口（STEPS / renderAnchor /
       brandsCombobox / navBar / SCENE）已整块删除。但**这三个键不能删**：
       src/scoring.js 的 anchorNotes 因子（26 分）直接读它们
       （buildProfile 的 anchorNotes / anchorPerfumeId，见 scoring.js:332-337），
       删键会让那边的读取从「空集」变成「undefined」。

       行为上两者等价（都是不加分不扣分），但 activeDims 的计数与
       profile 的键表会分叉 —— 这个仓库已经因为"加字段时漏更新 restart"
       踩过两次（见 restart 的注释）。所以留键、不写入：
       它们永远保持空，anchor 因子永远整条跳过，与 v6「用户跳过那一屏」
       逐位一致。将来若恢复这一屏，写入口接回去即可。 */
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
  /* 避雷屏当前候选的方向键（family|subfamily）。方向变了就清掉
     不在新清单里的旧「不要」，见 pruneAvoid。不进 answers：它是视图状态。 */
  avoidKey: null,
  /* ==== 清单页视图（L3，2026-11-23）====
     全站是单页 + 内存 state 的形态，没有路由表，也没有 history API ——
     结果页、问卷各屏都是"改 state 再 render()"。
     清单页沿用同一条路，理由：
       · 引入 hash 路由会多出一套需要同步的地址状态，而这一页的所有数据
         本来就在 localStorage 里，刷新后重新读一次即可；
       · 从结果页的 toast「在香水档案里看」跳过来，只需改一个字段 + 重画，
         不必把整页导航写成异步。 */
  wishPage: false,
  /* ==== 预算屏「这一档是用户自己选的吗」（Batch 5 腿 B5-3）====
     answers.budget 的缺省值是 'any'（见第 107 行），所以"值等于 any"既可能是
     "用户点了「不限 / 还不知道」"，也可能是"用户根本没点过"。
     存折未选态要不盖章、选了「不限」要盖章 —— 两者必须能分开，否则
     要么给没答的人凭空盖章（假的确认），要么选了不限反而不盖章
     （把它当成没答，与任务书"不限也原样写入并盖章"直接冲突）。
     所以另存一个**视图标记**（不进 answers，不进打分）；
     restart 里一并清掉。 */
  budgetPicked: false,
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

/* ---------- 步骤定义（2026-11-17 v7 第 1 步：圆盘回到第一屏） ----------

   ==== 这一版相对 v6 只动两处 ====
     · 第 1 屏换回香型圆盘（id 'family'），它同时是背景底噪的方向来源；
     · 末屏「已知款（anchor）」按 v7 定版撤掉 —— 定版流程里没有这一题
       （圆盘 → 避雷 → 场合 → 季节 → 浓淡 → 预算 → 结果），
       而且它要求用户认得瓶子，与"零基础"这条前提相反。
   其余七屏（budget / emotion / wanted / unwanted / occasion / season /
   concentration）与结果页一律不动 —— 后续步骤另行派工。

   ==== 六屏的顺序（feat/quiz-v7-step3-restructure 起）====
     1 family        香型圆盘 —— 定大方向，同时点燃背景底噪
     2 unwanted      动态避雷 —— 紧跟方向，只问这个方向最容易踩雷的几个
                     （src/avoid.js 现算，封顶 6 张；算不出整屏跳过 → 共 5 步）
     3 occasion      场合 —— 决定浓淡与时段
     4 season        季节 —— 2×2 方格与跟手白雾
     5 concentration 浓淡＋浓度（波纹场：人形剪影＋同心波纹，原生滑杆命中）
     6 budget        预算（末屏）—— 圈定候选池，选完即出结果

   **预算已从第 3 位搬到末位**（第 ③ 步）。搬位置不改口径：`poolForBudget` 的两个
   调用点（`finish()` 与结果页「换一批」）本来就在最后一屏之后 —— 它一直是
   "出结果那一刻才切一刀"，屏序变化对池过滤的语义与时序零影响。

   **大方向屏（emotion）不再作为独立问卷步骤**（第 ① 步）。`answers.emotion` 键保留，
   唯一写入点是首屏「按感觉选」进入的情绪控件 —— 它同时是 `finish()` 的
   入口守卫、`navBar('emotion')` 的 disabled 判定与 `src/ambient.js` 底噪兜底
   所认的键。不新增步骤 id，但感觉路径仍有完整入口。

   **「想要的味道」屏（wanted）也已删除**（第 ② 步）。`answers.wanted` 键同样保留
   且恒为 `[]` —— 见 state.answers 里那段「屏已撤、键保留」的说明。

   为什么圆盘仍是圆盘路径的第 1 步：Eddie 2026-11-17 否决 v6 的第一条就是「删了开屏圆盘」。
   开屏那张盘是这个产品唯一一处"控件即内容"—— 外圈六族、中圈 24 个小类，
   父子关系画在同一张图上。预算从第 3 屏退到末屏仍不破坏 v6 的"先圈池再问偏好"：
   `poolForBudget` 只在 `finish()` 与「换一批」生效，两处都在最后一屏之后，
   所以"先圈池"这件事在引擎侧从来没有提前发生过 —— 它一直是"出结果那一刻才切"。 

   为什么底噪的方向来源可以是圆盘：src/ambient.js 的第 1 条纪律要求
   "来源只能是第一个大方向"。圆盘选出来的家族就是第一个大方向，
   换算表见 AXIS_OF_FAMILY（六族 ↔ 六轴的最优匹配，720 种配法里最高那组）。
   圆盘没给方向时，首屏「按感觉选」可走另一条路径 —— 两个来源都写进 answers
   （direction / emotion），切换入口时清空旧路径，永远只有一个生效。

   为什么「气质」不在这一版出现：它与「大方向」是同一件事的两种问法。
   v6 里气质原型由大方向反推填充，见 applyDirectionToCharacter()，信息没丢
   —— 但本步删屏后它失去了唯一调用点（见该函数的注释）。
   */
const STEPS = [
  {
    id: 'family',
    short: '香型',
    title: '你闻着舒服的，是哪一类味道？',
    /* 文案二轮裁决第 6 条（改写）：删掉"收窄一层"这类逻辑解释，只留点哪里。 */
    help: '先点外圈选大方向；想更准再点中圈',
    render: renderFamily,
  },
  {
    /* ==== 第 2 步：动态避雷屏（feat/quiz-v7-step2-avoid）====
       旧屏是固定 18 张「不想要的元素」，排在第 5 位、与方向无关。
       现在紧跟圆盘之后：刚选完方向，立刻问这个方向里最容易踩雷的几个。
       候选由 src/avoid.js 按三条硬规则现算（本类核心不问 / 最对立不问 /
       只问相邻易混香型的模糊带），封顶 6 张，算不出整屏跳过（见 curSteps）。
       id 沿用 'unwanted'：answers.unwanted / dislikedNotes / CSS 认屏
       （#app[data-step="unwanted"]）都认这个键，换新 id 等于三处一起改。 */
    id: 'unwanted',
    short: '避雷',
    title: '这些味道里，哪个你一闻就皱眉？',
    help: '点一下＝不要；不点＝接受',
    render: renderAvoid,
  },
  {
    id: 'occasion',
    short: '场合',
    title: '主要在什么时候用？',
    /* help 自竖向时间轴改版（redesign-leg3-20261126）起**不再上屏**：
       这一屏只留标题与底栏那句「不选也能继续」（navBar 里），屏内不再重复提示。
       字符串保留在步骤表里：test-render 的「除圆盘外每屏都写明了可跳过」
       按步骤表的 help 字段核对，删字段会让那条门红。 */
    help: '选最像的场合；拿不准选日常',
    render: renderOccasion,
  },
  {
    id: 'season',
    short: '季节',
    title: '主要在哪个季节用？',
    help: '不确定就选四季通用',
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
    help: '先选体感，再选浓度类型',
    render: renderConcentration,
  },
  {
    /* ==== 第 6 步（末屏）：预算（v7 第 3 步③ 从第 3 位搬到末位）====
       搬屏不改这一屏自身的题面与计分：它仍是"圈池"那一刀，语义与时序零影响 ——
       priceIndex/poolForBudget 只在 finish() 与结果页「换一批」两个调用点生效，
       两处都在最后一屏之后（见 poolForBudget 的注释）。
       位置换了，所以 help 里"后面几屏只在这个范围里挑"这句已经不成立，改成末屏口径；
       "不限也行"四个字必须留住（test-render 的「除圆盘外每屏都写明了可跳过」
       靠 x.id !== 'budget' 排除这一屏，改文案时不要把这四个字丢掉）。 */
    id: 'budget',
    short: '预算',
    title: '你打算花多少钱？',
    help: '选预算档；选「不限」候选更多',
    render: renderBudget,
  },
];

/* ---- 动态避雷屏的候选（feat/quiz-v7-step2-avoid）----
   索引只依赖数据，一次构建；plan 依赖答案，每次现算（18 条场景，开销可忽略）。
   数据没到齐时返回 null —— 屏先占位、步骤表先按 6 屏算，
   与 livePhrases() 的「库未到先给全表」是同一种降级。 */
let avoidIndex = null;
function avoidPlanNow(answers = state.answers) {
  if (!DATA?.perfumes?.length || !TAX) return null;
  if (!avoidIndex) avoidIndex = buildAvoidIndex(DATA.perfumes, TAX);
  return avoidPlan(answers, avoidIndex, TAX);
}

/* 交给引擎的软降权名单：没上屏的低频模糊元素。数据没到 / 没方向时为空，
   recommend 收到空名单就逐位回到旧行为。 */
function avoidSoftNow() {
  return avoidPlanNow()?.softNotes || [];
}

/* 方向变了（回第 1 屏重选圆盘），上一屏点过的「不要」可能已不在新清单里。
   不清的话，引擎会带着一个界面上看不见的排除项继续打分 ——
   与 characterNeg 当年漏清是同一类事故。只在 key 真的变化时动 answers。 */
function pruneAvoid(plan) {
  if (!plan || state.avoidKey === plan.key) return;
  state.avoidKey = plan.key;
  const keep = plan.cards.map((c) => c.id);
  const before = state.answers.unwanted || [];
  /* 「没闻过」这一列同样会悬空：它是视图状态（用户对"这一屏上这几张"的表态），
     方向一变，屏上那几张就换了，旧表态必须一起清。
     用 avoidSelection 而不是手写 filter —— 它同时守"两列互斥"，
     手写两份 filter 等于把同一条不变式再实现一遍，迟早分叉。 */
  const merged = avoidSelection(
    { unwanted: before, noSmell: state.answers.noSmell || [] },
    keep,
  );
  const gone = merged.unwanted.length !== before.length
    || merged.noSmell.length !== (state.answers.noSmell || []).length;
  if (gone) {
    state.answers.unwanted = merged.unwanted;
    state.answers.noSmell = merged.noSmell;
    syncPhrasesToNotes();
  }
}

/* 当前生效的步骤表。

   所有「第 N 步 / 共 M 步」与进度段数都必须走它，不许读 STEPS.length。
   两套数字一旦分叉，界面会显示「共 6 步」但只有 5 屏，
   用户翻到第 5 屏就出结果，会以为漏了一屏。

   唯一的条件屏是第 2 步避雷：三条硬规则算不出模糊带（cards 为空）时整屏跳过，
   此时共 5 步。还没有方向（第 1 屏没点完）或数据没到时不跳 ——
   屏先占位，等方向定了再算。 */
function curSteps(answers = state.answers) {
  const plan = avoidPlanNow(answers);
  if (plan && plan.cards.length === 0) {
    if (answers === state.answers) pruneAvoid(plan);
    return STEPS.filter((s) => s.id !== 'unwanted');
  }
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
/* 表本身搬去了 src/avoid-map.js（避雷屏与「想要」屏共用同一套场景句，
   映射表要作为交付物单独生成，见 scripts/build-avoid-map.mjs）。
   每条的 zh / hint / family / notes 与搬走之前逐字相同，只多了 specimen 小图。
   这里留一个别名，下面所有读取点（livePhrases / notesOfPhrases / zhOfPhrases）
   一行不用改。 */
const LIFE_NOTES = AVOID_SCENARIOS;

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
/* 3-7b：结果页三调的中文译名表，data/note-zh.json。加载失败时留空表，
   渲染按原始英文键回退，绝不让数据问题挡住结果页。 */
let NOTE_ZH = {};
function priceIndex() { return PRICE_INDEX; }

/* 库容（瓶数）的唯一来源。所有**用户可见**的「全库 N 瓶」都必须从这里取，
   不许在文案里写死 —— 文案二轮裁决全局问题 4：1388 这类数字会随上游更新过期，
   写死就等于让屏幕替我们说错话。
   三档降级：price-bands 的 stats（与预算屏价签同源）→ 已载入的香水表长度 →
   null。调用方拿到 null 时要把数字整句省掉：宁可不说，也不说一个会过期的数。 */
function librarySize() {
  const idx = priceIndex();
  if (idx && idx.stats && Number.isFinite(idx.stats.totalPerfumes)) return idx.stats.totalPerfumes;
  if (DATA && Array.isArray(DATA.perfumes) && DATA.perfumes.length) return DATA.perfumes.length;
  return null;
}

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

/* ---------- 价签上的数与主按钮文案（预算屏重设计 leg6，2026-11-26） ----------
   口径：退回「这一档已知价 N 瓶」。
   为什么不是「符合你前面答案的有 N 瓶」：任务要求该数 = poolForBudget 去掉
   **避雷硬排除**后的余量，并先与引擎确认。实测引擎对避雷只做惩罚不做排除 ——
   dislikedNotes -40、dislikedFamily -30（src/scoring.js），命中瓶仍在池里、
   仍可能被推荐；全库没有任何「避雷硬排除」机制（avoid.js 的软降权也明言
   「不硬排除，结果池门一行不动」）。既然没有硬排除可去，「符合你前面答案」
   这个口径就无从成立，按任务退回「这一档已知价 N 瓶」。
   这个数恰好等于 poolForBudget 该档的池子大小（bandOfId[band].length，
   档 >= 12 时），与候选查询同源 —— 手算展示数与候选查询一致这条验收由此成立。 */
function bandKnownCount(budgetId) {
  const idx = priceIndex();
  if (!idx || !budgetId || budgetId === (idx.anyId || 'any')) return null;
  const c = idx.stats && idx.stats.counts ? idx.stats.counts[budgetId] : null;
  return typeof c === 'number' ? c : null;
}

/* 主按钮文案始终跟着当前选择走：N<3 的档明示「看 N 瓶 + 2 瓶稍超预算的」，
   其余（含「不限」）仍是「看推荐 →」。N<3 在当前数据下不会出现（四档都
   150+ 瓶），但判据按 N 写死，档一旦变窄就自动生效，不靠人记得改文案。 */
function budgetCtaText(budgetId) {
  const n = bandKnownCount(budgetId);
  if (n != null && n < 3) return `看 ${n} 瓶 + 2 瓶稍超预算的`;
  return '看推荐 →';
}

/* 预算放宽检测：最终结果里有没有超出所选档的瓶。
   poolForBudget 在档太窄（<12）时退回全库，引擎内部也逐级放宽族池 ——
   这些都可能让结果含档外瓶。不再悄悄放宽：数出档内/档外，结果页顶部明示。
   「不限」没有预算约束，恒返回 null（不声明放宽）。 */
function budgetRelaxInfo(results, budgetId) {
  const idx = priceIndex();
  if (!idx || !budgetId || budgetId === (idx.anyId || 'any')) return null;
  let inBand = 0;
  const overIds = [];
  for (const r of results || []) {
    const id = r && r.perfume ? r.perfume.id : null;
    const band = priceBandOf(id, idx);
    if (band && band.id === budgetId) inBand += 1;
    else overIds.push(id);
  }
  if (!overIds.length) return null;
  return { inBand, over: overIds.length, overIds, total: (results || []).length };
}

/* ---------- 大方向 → 气质原型（引擎的 character 因子仍按原样工作） ----------
   为什么需要这一步：v6 第 2 屏就是大方向，而 v5 的「气质」屏已退场。
   character 是引擎里权重不低的一维（16 分），缺了它等于白丢一维证据。
   这不是新信息，是把用户刚答的那句话翻译成引擎认识的字段。

   ⚠ v7 第 3 步起：**本函数与上面的 EMOTION_TAGS 已无任何调用点**。
   大方向屏删除后，它失去了唯一写入点，四个引擎字段（characterTags /
   characterNeg / temperature / sweetness）从此恒空 —— 引擎在取不到值时
   整条跳过、不加不减（src/scoring.js 的空值语义），与"用户当年跳过那一屏"
   逐位一致。**保留不删**，照 anchor 三键的先例（见 state.answers 上方注释）：
   将来若恢复大方向入口（或把方向接回圆盘 onChange），这张表是现成的，
   删掉它等于把口径写死。 */
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
const BUILD_ID = '2026-11-28-batch3-entry';

/* ---------- 上色图标（结果页实物图的降级瓶形，与盘心标本共用同一批） ----------
   24 枚上色版在 ./icon-specimen/svg/ 合计 295.6KB / gzip 80.1KB，
   按需 fetch + 内存缓存，首屏零代价；file:// 下会被 CORS 拦，必须跑 server.js。

   为什么 v6 还留这一整套：香型轮盘退场了，但**结果页**的图标与瓶子插图
   仍走这条通路（pickArt → bottleArt），而 spec 5·续 把"图标精致/呼应/美观"
   定为验收标准 —— 删掉它等于把已经合格的一项退回空白。
   v6 只是不再用它来讲香调术语。 */
const PLATE_SIZE = 24;
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
/* ---------- 6 枚大类图标（PR #10 抢救进主线的那一套） ----------
   与小类那 24 枚同一目录、同一 24×24 视框、同一线宽，所以两者能并排出现在
   同一块盘心上而不打架 —— 这正是"风格统一"唯一可控的实现方式（自绘、同规格）。

   为什么单独一张表而不是塞进 ART_FILE：
     ART_FILE 的键是**小类** id，`scripts/test-render.mjs` 有一条断言要求它
     "不缺格、不多余"（与 taxonomy 的 subfamilies 一一对应）。把 6 个大类 id
     混进去，那条断言立刻失败，而它守的东西（24 枚小类全覆盖）是对的。
     两张表各自对应数据里的一层，互不污染。

   文件名后缀 `-family` 是抢救时定下的（`citrus-family.svg` 与
   `citrus-cologne.svg` 之类的小类文件同目录），不是这里命名的。 */
const FAM_ART_FILE = {
  citrus: 'citrus-family',
  floral: 'floral-family',
  woody: 'woody-family',
  amber: 'amber-family',
  fresh: 'fresh-family',
  gourmand: 'gourmand-family',
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
function famArtPath(famId) {
  const f = FAM_ART_FILE[famId];
  return f ? './icon-specimen/svg/' + f + '.svg' : '';
}
/* 取图与就绪判定都按**路径**做：两张表（大类 / 小类）共用一份缓存，
   键是路径本身，所以同名冲突不可能发生，也不必写两套 fetch。 */
function artInnerPath(p) {
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
function artInner(subId) {
  return artInnerPath(artPath(subId));
}
/* ==== 24 枚标本的「启动即全量预热」已删除（性能腿，2026-11-19；批 3-2b 复核）====
   原先这里有一个 artWarmAll()，在模块求值时就把 24 个 SVG 全拉一遍，
   boot() 里还有第二处调用。首屏尚未选小类时，这 24 个请求全是前置成本。
   现在首屏仍不取小类图；用户第一次选定中圈小类时，hubSpecimenGrid()
   才并行取齐 24 枚，并写入共享缓存。之后在小类或家族间切换不再请求。
   取图通路仍是按需的：先 ART_READY 同步读取，未就绪才 artInner()。 */
/* 同一枚图标可能被同时插进 DOM 的多个位置，渐变 id 必须唯一，
   否则第二次插入会引用到第一个实例的 defs。 */
let artSeq = 0;
function artNs(inner, ns) {
  return inner.replace(/id="([^"]+)"/g, (m, x) => 'id="' + x + '-' + ns + '"')
    .replace(/url\(#([^)]+)\)/g, (m, x) => 'url(#' + x + '-' + ns + ')');
}
/* 彩图已就绪就直接返回可写进 <svg> 的内部内容；没就绪返回 ''。 */
/* 中圈胶囊里的标本图标（设计第 2 项，2026-11-25）。
   与盘心 hubSpecimenGrid、避雷卡 avoidSpecimen 走**同一条**取图通路：
   ART_FILE → artPath() → ART_CACHE / ART_READY，不新造图标、不新造通路。
   未就绪时返回空 span 而不是占位盒：CSS 用 `.sub-arc-icon:empty` 把它整个
   拿掉（display:none），于是"图没到/加载失败"两种情况的胶囊都是纯文字，
   既不留空位也不跳版；图到了才长出来，失败就永远不长。
   多个实例的渐变 id 冲突由 artNs() 规避（与盘心同一套）。 */
function subArcIcon(subId) {
  const box = el('span', { class: 'sub-arc-icon', 'aria-hidden': 'true' });
  const p = artPath(subId);
  if (!p) return box;
  const wrap = (inner) => {
    box.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">' + artNs(inner, 'a' + (++artSeq)) + '</svg>';
  };
  const ready = ART_READY.get(p);
  if (ready) { wrap(ready); return box; }
  artInnerPath(p).then((inner) => {
    /* 弧段被重建时这个 span 已经不在文档里 —— 别往废节点里写。 */
    if (!inner || !box.isConnected) return;
    wrap(inner);
  }).catch(() => { /* 取图失败：保持空 span，胶囊就是纯文字 */ });
  return box;
}
function artSvgReady(subId) {
  const inner = ART_READY.get(artPath(subId));
  return inner ? artNs(inner, 'a' + (++artSeq)) : '';
}
function famArtReady(famId) {
  const inner = ART_READY.get(famArtPath(famId));
  return inner ? artNs(inner, 'a' + (++artSeq)) : '';
}
/* 避雷墙的标本小图复用同一套彩图缓存（ART_FILE 的反向：文件名 → 子家族 id）。
   走 innerHTML 注入而不是 <img src>：个别源 SVG 带有重复的 </defs>，
   <img> 的严格 XML 解析会整张判废（破图），而注入路径与圆盘同源、实测不受影响。
   这样既不必改那 24 枚图标文件，也不会让任何一张卡露出破图占位符。 */
const ART_SUB_OF_FILE = new Map(Object.entries(ART_FILE).map(([id, f]) => [f, id]));
function avoidSpecimen(specimenPath) {
  const file = String(specimenPath).replace(/^.*\//, '').replace(/\.svg$/, '');
  const sub = ART_SUB_OF_FILE.get(file);
  const box = svgEl('svg', {
    class: 'avoid-spec', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false',
  });
  if (!sub) return box;
  const ready = artSvgReady(sub);
  if (ready) box.innerHTML = ready;
  else artInner(sub).then((inner) => { if (inner) box.innerHTML = artNs(inner, 'a' + (++artSeq)); });
  return box;
}
/* 「已选方向」锚点的图标（qoder/avoid-capsule）：与圆盘同一套上色 SVG ——
   落到小类用那 24 枚标本（artPath 通路），只选大类用 6 枚大类徽记
   （famArtPath 通路，与盘心徽章同源）。不新造图标，也不新造取图通路。 */
function anchorArt(path_) {
  const box = svgEl('svg', {
    class: 'avoid-anchor-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false',
  });
  if (!path_) return box;
  const ready = ART_READY.get(path_);
  if (ready) box.innerHTML = artNs(ready, 'a' + (++artSeq));
  else artInnerPath(path_).then((inner) => { if (inner) box.innerHTML = artNs(inner, 'a' + (++artSeq)); });
  return box;
}
/* 原先这里还有一处 `artWarmAll()`（"尽早开始预热：不等 taxonomy、不等 DOMContentLoaded"）。
   已随性能腿删除，理由见 artWarmAll 原址上方那段注释。 */

/* 香材英文名 → 中文，供代表香材行显示。找不到就退回原文。 */
function noteZhOf(en) {
  const e = TAX && TAX.noteIndex ? TAX.noteIndex.entries.find((x) => normNote(x.en) === normNote(en)) : null;
  return e ? e.zh : String(en);
}

/* ============================================================
   第 1 屏：香型轮盘（2026-11-17 v7 第 1 步，原样恢复）
   ------------------------------------------------------------
   源码出处：PR #5（v6）合并之前的主线 a39e498（= PR #3 合并点 652107e
   加 PR #4 视觉层），即**当时线上跑的那一版**。逐字节取回，不改设计、
   不改 24 枚图标。v6 把它换成预算 + 天际线两屏之后被 Eddie 否决：
   「删了开屏圆盘、删了圆盘 24 个香型图标」（quiz-structure-v7 §背景）。

   ==== 为什么必须原样，而不是"用 v6 的语言重画一张盘" ====
   盘不是装饰，它是这个产品唯一一个"控件即内容"的地方：外圈六族、
   中圈 24 个小类，父子关系画在同一张图上，用户在盘上就能看见
   「我在哪一层、往两边各还有什么」。重画一遍必然带进新的几何假设，
   而那 24 枚标本图标是按 480 视框、24×24 视框、同一线宽配的 ——
   换骨架等于让它们全部失配（README 里那三条 24px 硬限制就是为此写的）。

   ==== 与 v6 的接线只有两处（本步唯一的增量）====
    ① 底噪：选定家族 → AXIS_OF_FAMILY 给出六轴之一 → 写 answers.direction，
       src/ambient.js 拿它当"第一个大方向"，从第 1 屏就开始亮（见下方表）；
    ② 评分：family / subfamily 原样写进 answers，src/scoring.js 一行未动，
       所以推荐口径与 PR #5 之前逐位一致（test-gold 的家族画像仍是 2/12·4/12）。
   其余六屏（budget / emotion / wanted / unwanted / occasion / season /
   concentration）本步一律不动。
   ============================================================ */

/* ---------- 盘的 SVG 几何基元 ----------
   取回自 a39e498:280-316，只留轮盘用得到的四件（DISC / buildDisc 属场合屏
   旧单层盘，v6 起场合屏已换地平线，那里不需要，故不取回）。 */
const SVG_NS = 'http://www.w3.org/2000/svg';
/* 两个盘（本屏的同心轮盘、以及历史上的场合盘）视框都是 480×480、
   圆心都在 (240,240)。圆心抽成一个常量：它不可能一边改一边不改。 */
const VB_CENTER = 240;

function polar(r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [VB_CENTER + r * Math.cos(rad), VB_CENTER + r * Math.sin(rad)];
}

/** 环形扇区的 path。外弧顺时针、内弧逆时针，一次成闭合面。 */
function annulusPath(rOut, rIn, a0, a1) {
  const [x0o, y0o] = polar(rOut, a0);
  const [x1o, y1o] = polar(rOut, a1);
  const [x1i, y1i] = polar(rIn, a1);
  const [x0i, y0i] = polar(rIn, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0o.toFixed(2)} ${y0o.toFixed(2)}`
    + ` A ${rOut} ${rOut} 0 ${large} 1 ${x1o.toFixed(2)} ${y1o.toFixed(2)}`
    + ` L ${x1i.toFixed(2)} ${y1i.toFixed(2)}`
    + ` A ${rIn} ${rIn} 0 ${large} 0 ${x0i.toFixed(2)} ${y0i.toFixed(2)} Z`;
}

function svgEl(tag, attrs) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

/* ---------- 多层香型轮盘（第 1 步）----------
   为什么是同心圆而不是两页问卷：
   香水的分类本身就是树（家族 → 子家族 → 香材）。做成两页会把"我在哪一层"这个
   信息抹掉——用户翻到第 2 页就看不见自己选的是哪个大类了。
   同心圆把父子关系画在同一张图上：外圈是父亲，中圈是儿子，盘心写着当前走到哪。
   香水圈流传的「香气轮盘」（4 大组 / 13 小组）本来就是这个做法。 */
const WHEEL = {
  vb: 480,
  cx: VB_CENTER,
  cy: VB_CENTER,
  r1o: 228,
  r1i: 158,   // 外圈：6 个香型家族
  r2o: 152,
  r2i: 106,   // 中圈：所选家族的子家族
  // 盘心取中圈内接正方形：r2i=106 → 106×√2 = 149.9 → 149.9/480 = 31.2%，留余量取 30.6%
  hubPct: 30.6,
};

/* ---------- 盘心 24 小类标本网格（批 3-2b；Batch 5 B2 门控）----------
   只有当前大类下已提交的有效小类才挂载六族 24 格。网格与中圈共用 chooseSub，
   是同一步的快捷入口，不新增问卷步骤；每格复用 ART_FILE 的按需 SVG 通路。 */
function hubSpecimenGrid(families, selectedSubId, onSelect) {
  const grid = el('div', {
    class: 'hub-specimen-grid',
    id: 'wheel-specimen-grid',
    role: 'listbox',
    tabindex: '0',
    'aria-label': '24 个小类标本，当前选择：' + subFullName(
      families.flatMap((fam) => fam.subfamilies || []).find((sub) => sub.id === selectedSubId) || {}
    ) + '。方向键移动，Enter 选择',
  });
  const items = [];
  const setActive = (id) => {
    if (!id) return;
    grid.setAttribute('aria-activedescendant', id);
    items.forEach((item) => item.classList.toggle('is-keyboard-active', item.id === id));
  };
  grid.addEventListener('focus', () => {
    setActive(grid.getAttribute('aria-activedescendant') || selectedSubId || items[0]?.id);
  });
  grid.addEventListener('blur', () => {
    items.forEach((item) => item.classList.remove('is-keyboard-active'));
  });
  grid.addEventListener('keydown', (ev) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End', 'Enter', ' '];
    if (!keys.includes(ev.key)) return;
    ev.preventDefault();
    const current = Math.max(0, items.findIndex((item) => item.id === grid.getAttribute('aria-activedescendant')));
    let next = current;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = (current + 1) % items.length;
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = items.length - 1;
    setActive(items[next]?.id);
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const item = items[next];
    const fam = families.find((entry) => entry.id === item?.getAttribute('data-fam'));
    const sub = fam?.subfamilies?.find((entry) => entry.id === item?.getAttribute('data-sub'));
    if (fam && sub) onSelect(fam, sub, ev);
  });
  families.forEach((fam) => {
    (fam.subfamilies || []).forEach((sub) => {
      const item = el('div', {
        class: 'hub-specimen-item',
        id: 'hub-specimen-' + sub.id,
        role: 'option',
        'data-sub': sub.id,
        'data-fam': fam.id,
        'aria-label': subFullName(sub),
        'aria-selected': String(sub.id === selectedSubId),
        title: '选择' + subFullName(sub),
      });
      /* 24 格与中圈共用 chooseSub：它们是同一步的快捷入口，不新增问卷步骤，
         也不直接写 state 或打分。隐藏态整棵网格不挂载，因此没有透明点击区。 */
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onSelect(fam, sub, ev);
      });
      const box = svgEl('svg', {
        class: 'specimen-svg is-art',
        viewBox: '0 0 ' + PLATE_SIZE + ' ' + PLATE_SIZE,
        'aria-hidden': 'true',
        focusable: 'false',
      });
      const ready = artSvgReady(sub.id);
      if (ready) box.innerHTML = ready;
      else artInner(sub.id).then((inner) => {
        if (!inner) return;
        box.innerHTML = artNs(inner, 'a' + (++artSeq));
      });
      item.appendChild(box);
      grid.appendChild(item);
      items.push(item);
    });
  });
  setActive(selectedSubId || items[0]?.id);
  return grid;
}

/* ---------- 大类文字签（v7 第 1.5 步新增，缺陷 ③）----------
   为什么需要它：只选了大类、还没落到小类时，盘心原来只有三行文字，
   底下是一个 343px 的空圆 —— 用户看到的"最大的东西"是一块空白。
   任务书缺陷 ③ 要求"盘心要承载信息"，且授权改 app.js 里那处
   `if (focusSub) {...}`（原第 1461–1463 行）。

   ==== 为什么是纯文字，而不是小类图标 ====
   这里一度画过一段弧、摆着这一族全部小类的标本图标（.fam-glyph）。
   裁定改回纯文字，理由是**图标还没画到能承担这件事的程度**：
   24 枚上色标本画的是"小类"这一层，大类这一层没有自己的图标。
   于是只选大类时盘心摆出一排小类图标，等于用下一层的词汇回答
   当前这一层的问题 —— 用户明明还没收窄，盘心却先摊开了四件标本，
   读起来像"已经替你选好了其中一件"。裁定口径：只选大类时中心盘
   只放文字，等大类图标补齐再谈图形。

   文字放什么：这一族的小类名。名字是数据里来的，不是编的；
   盘心因此在说"这一族由这四格组成"，而不只是一句风格描述。

   ==== 为什么没有「N 个小类」那行（设计第 1 项 delta 2，2026-11-25 删）====
   原先名字下面另起一行 12px 小字报个数。删它的理由：个数是"数一下就有"
   的信息，而它花掉的是一整行高度 —— 360/320px 上盘心内高已经贴底
   （见下方图标那段的实测），这一行是最贵的一行，换来的信息最少。
   现在"有几格"由名字本身回答：名字之间是间隔点，一眼数得清。
   计数那枚 `.fam-text-count` 连同它的 CSS 一并删除，不留空位。

   ==== 小类名取哪个字段（2026-11-24 裁定 A）====
   口径 = `label || zh || id`，与中圈弧段标签（第 1711 行）、盘心主词
   （第 1924 行区）三处同源。原先是 `zh || id`，于是柑橘调这一族在
   只选大类时列出"古龙水型/青绿柑橘/柑橘花香/芳香柑橘"——与用户点中圈
   看到的"纯柑橘/苦橙叶/橙花柑橘/皂感柑橘"对不上，同一个盘心两种状态
   说两套名字。label 是 4 字以内的直白词，zh 是正式名：**数据两个字段都
   不动**，表单、推荐理由、无障碍名继续用 zh，只有盘心这两处显示改口径。 */
function familyText(fam) {
  const subs = (fam.subfamilies || []);
  if (!subs.length) return null;

  const wrap = el('div', { class: 'fam-text' });
  const list = el('div', { class: 'fam-text-list' });
  subs.forEach((s, i) => {
    if (i) {
      /* 间隔点只是排版记号，不该被读屏念成内容 */
      list.appendChild(el('span', { class: 'fam-text-sep', 'aria-hidden': 'true' }, '·'));
    }
    /* 取词口径与中圈弧段、盘心主词同源：label 优先、zh 兜底。
       柑橘调那 4 项的 zh 全是"××柑橘"，只选大类时并排列在这里分不出差别
       （与 1711 行中圈改名同一个理由）；label 缺省时回退 zh，再缺省用 id。
       数据本身不动 —— 表单、推荐理由、无障碍名里仍用 zh。 */
    list.appendChild(el('span', { class: 'fam-text-item' }, s.label || s.zh || s.id));
  });
  wrap.appendChild(list);
  return wrap;
}

/* ---------- 盘心大类徽记（2026-11-23 方向 B，Eddie 拍板）----------
   选中一个大类时，把**这一大类自己的图标**放到盘心；取消选择就恢复原样。

   图标是哪来的：`icon-specimen/svg/<fam>-family.svg`，就是 PR #10 抢救进主线
   的那 6 枚（`f0dafdf`），与小类那 24 枚同一目录、同一 24×24 视框、同一线宽。
   「与扇区上用的是同一套图」这句只有对得上文件才算数，所以路径集中在
   FAM_ART_FILE 一张表里，测试直接读它做断言，不另抄一份文件名。

   ==== 为什么它是**背衬**，而不是又一个 flex 行 ====
   盘心是圆，内容按 justify-content:center 竖排，四个断点实测：
     1440  盘心 332.6px，内高 292.6，内容 5 行用掉 227.8 → 两侧余 52.4
      390  盘心 225.7px，内高 185.7，内容 4 行用掉 141.7 → 两侧余 22
      360  盘心 205.9px，内高 165.9，内容 4 行用掉 160.3 → 余 2.8，已经贴底
      320  盘心 179.5px，内高 139.5，内容 160.3 → **已经溢出内边距**
   也就是说 390 以下再插一行（哪怕 34px）就会把内容顶出圆外、压到中圈弧段上。
   而本腿的围栏是「只动盘心这一处，既有元素与文案一律不动」——
   既不能删 .fam-text 的哪一行来腾地方，也不能把盘心放大（66% 被
   test-render 的「闭合态盘心填满内孔」守着）。
   所以图标走绝对定位的背衬层：不占 flex 空间 → 任何断点都不会溢出，
   也不改动任何既有元素的位置与字号。文字画在它上面（见 CSS 里那条
   `> *:not(.hub-emblem)` 的 z-index），主词与说明的对比度不受影响。

   什么时候出现：选中/预览某个大类、且还没落到小类时。
   落到小类时盘心已经显示 24 格小类标本，那时再叠一层徽记等于两个物体
   抢同一个位置 —— 那一路保持互斥，本腿不碰。 */
function familyEmblem(fam) {
  const box = svgEl('svg', {
    class: 'emblem-svg is-art',
    viewBox: '0 0 ' + PLATE_SIZE + ' ' + PLATE_SIZE,
    'aria-hidden': 'true',
    focusable: 'false',
  });
  const ready = famArtReady(fam.id);
  if (ready) box.innerHTML = ready;
  /* 与 hubSpecimenGrid 同一条按需通路：没就绪就等它到，到了再写进来。
     迟到的图不会写到"换掉之后"的徽记上：外层 .hub-emblem 是常驻节点，
     paint() 换族时做的是 `innerHTML = ''` —— 旧 <svg> 已经被摘下来了，
     回调写的是一个离屏节点，不影响眼前这一枚。 */
  if (!ready) {
    artInnerPath(famArtPath(fam.id)).then((inner) => {
      if (!inner) return;
      box.innerHTML = artNs(inner, 'a' + (++artSeq));
    });
  }
  return box;
}

/* 圆盘弧文字轨道的全局唯一 id（重建不重复） */
let wheelArcSeq = 0;

function buildWheel(cfg) {
  /* backHost：返回胶囊的挂载点。2026-11-24 裁决 A 之后它不在 .wheel 里了
     （那枚胶囊压住了 −120° 的中圈标签），由调用方给一个页顶流的容器把它接走。
     不给时退回老位置（root），只为兼容/自检脚本单点调用时不会抛。 */
  const { families, onChange, backHost } = cfg;
  const initialFamily = cfg.selFamily ? families.find((fam) => fam.id === cfg.selFamily) || null : null;
  let selFamily = initialFamily ? initialFamily.id : null;
  /* 恢复态也服从同一门控：旧存档里跨大类的 subfamily 是无效值，不能拿来锁住
     中圈或显示 24 格。这里只纠正轮盘的恢复输入，不清空任何有效答案。 */
  let selSub = initialFamily && (initialFamily.subfamilies || []).some((sub) => sub.id === cfg.selSub)
    ? cfg.selSub : null;
  let hoverFam = null;      // 指针停在外圈哪个家族（只改盘心预览，不改变层数）
  let hoverSub = null;

  /* ---- 三层环的半径（480 单位视框，控件半径 240）----
       盘心   46% 直径 = 220.8 单位 → 半径 110.4
       中圈   118–152（band 34）
       家族环 158–228（不缩放）
     三项数量都由实测决定，理由写在各自的注释里。 */
  /* v17 保持 118–152 不变。曾试过把内径收到 130（带宽 34→22），
     实测瓦片立起来后只有 34px 厚、点击面积掉 35%，不行 ——
     层级问题是"外沿贴死盘边 + 内沿外侧空 63px"，两者都由**容器倍率**
     决定，不该拿带宽去补。见 _wheel11.css 第一节：倍率 1.43 → 1.36。 */
  const SUB_R2I = 118;
  const SUB_R2O = 152;
  const SUB_GROOVE = 2.4;   // 凹槽比弧带每侧多出的宽度
  /* 标签落在弧带的径向中点；角度仍取该弧段的角平分线。
     不用面积质心：质心会随扇区角度向圆心收缩，2 类时甚至落进盘心。 */
  const FAM_LABEL_GAP = 2.0;

  function sectorCentroidRadius(rIn, rOut, angleDeg) {
    const h = Math.max(0.0001, angleDeg * Math.PI / 360);
    return (2 / 3)
      * ((rOut ** 3 - rIn ** 3) / (rOut ** 2 - rIn ** 2))
      * (Math.sin(h) / h);
  }

  const root = el('div', { class: 'disc wheel', role: 'group', 'aria-label': '香型轮盘' });

  /* 核心圆盘 = 第一层。初始铺满整个控件；一旦选定大类，整盘缩到 58%，
     外圈让给第二轮的小方格。
     缩小后盘里不再画六个扇区（58% 下扇区太窄，字必然溢出），改成一块实心盘，
     盘心文字直接落在盘上 —— 于是「一块盘 + 一圈方格」是一个整体，
     而不是「一块盘 + 盘心一个小方块」两个物体。 */
  const core = el('div', { class: 'disc-core' });
  const rot = el('div', { class: 'disc-rot' });
  core.appendChild(rot);
  root.appendChild(core);

  const svg = svgEl('svg', {
    class: 'disc-svg',
    viewBox: '0 0 ' + WHEEL.vb + ' ' + WHEEL.vb,
    'aria-hidden': 'true',
    focusable: 'false',
  });
  rot.appendChild(svg);
  /* ---- 渐变 defs ----
     所有渐变都在同一个 480×480 坐标系里。角度统一按"光从左上"：
     靠左上偏亮、靠右下偏暗；斜率控制在 2–3%，再多就成了金属拉丝。
     用 userSpaceOnUse 而不是 objectBoundingBox —— 后者会让每个扇形
     各自从自己的包围盒起算，同一圈上六个扇形的光向会各不相同。 */
  const defs = svgEl('defs', {});
  const mkGrad = (id, stops, x1, y1, x2, y2) => {
    const g = svgEl('linearGradient', {
      id: id,
      gradientUnits: 'userSpaceOnUse',
      x1: x1, y1: y1, x2: x2, y2: y2,
    });
    stops.forEach(([off, col]) => g.appendChild(svgEl('stop', { offset: off, 'stop-color': col })));
    defs.appendChild(g);
  };
  // 家族扇区：左上 #ffffff → 右下 #eef1f8
  mkGrad('gFam', [['0', '#ffffff'], ['0.55', '#fafbfe'], ['1', '#eef1f8']], 40, 30, 440, 450);
  // 家族扇区悬停：整体再亮一档，斜率不变
  mkGrad('gFamHot', [['0', '#ffffff'], ['0.5', '#f5f8ff'], ['1', '#e4eaf7']], 40, 30, 440, 450);
  // 中圈弧段：白 → 极浅蓝灰（下沿收暗 = 瓦片厚度）
  /* 六族同色（v37 / A 方向）。
     ------------------------------------------------------------
     上一版六族各带自己色相（#fbfcee / #fdf8fb / …），实测彼此只差
     2–4% 明度：1440 下六块看上去是同一片浅灰，色相区分**不成立**，
     唯一被看见的是底色那圈灰蓝箍 —— 也就是说六个渐变只贡献了噪点，
     没贡献信息。所以统一成纸白，分块交给 2.6px 的白缝（_wheel7.css）。

     为什么仍保留六个 id 而不是删掉改成一个：
       ① 深色层是另一套 id（gFamXxxD），选择器结构必须保持对称，
          否则 _wheel14.css 那六条 data-fam 规则会失效、深色盘直接白块；
       ② 悬停/选中三层覆盖都建立在这六条 fill 引用之上；
       ③ 留出六条 id 才能只改这里回滚到分色版本，不用碰 CSS。
     同色不等于"平"：仍保留 0% → 100% 的 2% 明暗，瓦片才有厚度。 */
  mkGrad('gFamCitrus',   [['0', '#ffffff'], ['0.58', '#fdfdff'], ['1', '#f9fafd']], 40, 30, 440, 450);
  mkGrad('gFamFloral',   [['0', '#ffffff'], ['0.58', '#fdfdff'], ['1', '#f9fafd']], 40, 30, 440, 450);
  mkGrad('gFamWoody',    [['0', '#ffffff'], ['0.58', '#fdfdff'], ['1', '#f9fafd']], 40, 30, 440, 450);
  mkGrad('gFamAmber',    [['0', '#ffffff'], ['0.58', '#fdfdff'], ['1', '#f9fafd']], 40, 30, 440, 450);
  mkGrad('gFamFresh',    [['0', '#ffffff'], ['0.58', '#fdfdff'], ['1', '#f9fafd']], 40, 30, 440, 450);
  mkGrad('gFamGourmand', [['0', '#ffffff'], ['0.58', '#fdfdff'], ['1', '#f9fafd']], 40, 30, 440, 450);

  mkGrad('gArc', [['0', '#ffffff'], ['0.62', '#fdfdff'], ['1', '#f2f5fc']], 40, 30, 440, 450);
  mkGrad('gArcHot', [['0', '#ffffff'], ['1', '#eaf0fd']], 40, 30, 440, 450);
  // 选中弧段：克莱因蓝，左上亮、右下深
  mkGrad('gArcOn', [['0', '#2249b8'], ['0.5', '#002fa7'], ['1', '#00268a']], 40, 30, 440, 450);

  /* ---- 深色模式的一套（D4）----
     上面六个家族渐变是"白纸上的 5% 明暗"，彼此只差几个色阶 ——
     白底上靠低饱和微差辨色是成立的，把同样的色压暗则不行：
     #fbfcee 乘 brightness(.26) 之后，六族色相全被抹平，
     六块退成同一种深灰（实测过，环上只剩描边能分块）。

     所以深色版不是"压暗原色"，而是**重新给六族定色**：
     在 L* 12–16 这个很窄的暗区间里，改用色相拉开距离
     （橄榄 / 藕紫 / 暖灰 / 琥珀金 / 青绿 / 铜棕），
     每族仍保留 8% 左右的同色相明暗，厚度不丢。
     六色对 --ink #f2f2f2 的对比度都在 11 以上。 */
  /* A 方向要"统一颜色"，深色层必须一起统一，否则明暗两套盘各说一套话。
     深色版取 8% 的同色明暗（#1f1f1f → #262626），分块交给 _wheel14.css 里
     的那道 --bg 描边缝 —— 与浅色层是同一个机制。 */
  mkGrad('gFamCitrusD',   [['0', '#262626'], ['0.58', '#232323'], ['1', '#1f1f1f']], 40, 30, 440, 450);
  mkGrad('gFamFloralD',   [['0', '#262626'], ['0.58', '#232323'], ['1', '#1f1f1f']], 40, 30, 440, 450);
  mkGrad('gFamWoodyD',    [['0', '#262626'], ['0.58', '#232323'], ['1', '#1f1f1f']], 40, 30, 440, 450);
  mkGrad('gFamAmberD',    [['0', '#262626'], ['0.58', '#232323'], ['1', '#1f1f1f']], 40, 30, 440, 450);
  mkGrad('gFamFreshD',    [['0', '#262626'], ['0.58', '#232323'], ['1', '#1f1f1f']], 40, 30, 440, 450);
  mkGrad('gFamGourmandD', [['0', '#262626'], ['0.58', '#232323'], ['1', '#1f1f1f']], 40, 30, 440, 450);

  // 家族扇区悬停：整族提亮一档（浅色版是"更白"，深色版是"更亮的面"）
  mkGrad('gFamHotD', [['0', '#333333'], ['0.5', '#2d2d2d'], ['1', '#262626']], 40, 30, 440, 450);

  // 中圈弧片：白瓦换成"比家族环亮一档的面" —— 靠这一点亮度反转把两层分开
  mkGrad('gArcD', [['0', '#2b2b2b'], ['0.62', '#282828'], ['1', '#242424']], 40, 30, 440, 450);
  mkGrad('gArcHotD', [['0', '#333333'], ['1', '#2c2c2c']], 40, 30, 440, 450);
  // 选中弧段：#002fa7 在 #141414 上只有 1.9:1，提亮到 #3d5fd9 一族（对深底 4.4）
  mkGrad('gArcOnD', [['0', '#5a78ee'], ['0.5', '#3d5fd9'], ['1', '#2f4cc0']], 40, 30, 440, 450);

  // 底座：径向，中心略亮、外圈收暗 = 盘面微微内凹
  const rg = svgEl('radialGradient', { id: 'gBase', gradientUnits: 'userSpaceOnUse', cx: 220, cy: 200, r: 300 });
  [['0', '#cdd3e2'], ['0.6', '#c3c9dc'], ['1', '#b9c0d6']].forEach(([o, c]) => rg.appendChild(svgEl('stop', { offset: o, 'stop-color': c })));
  defs.appendChild(rg);
  svg.appendChild(defs);


  /* 最外一道发丝线：把整个轮盘从背景里框出来。
     圆盘边缘与白底之间没有界线时，大面积留白里会"漏边"。 */
  svg.appendChild(svgEl('circle', {
    class: 'ring-thin', cx: WHEEL.cx, cy: WHEEL.cy, r: WHEEL.r1o + 8,
  }));

  /* 内圈分度刻线：36 道，每 3 道（30°）加长 —— V2 改法 B。
     ------------------------------------------------------------
     改动清单假定「几何已经在 app.js:353-365 算好，开一条 display 即可，
     零 JS 改动」。实测不成立，两条都得补：

     ① **首屏没有这些节点**。那段几何在 buildDisc()（第 4 步场合屏的
        单层盘），首屏轮盘是 buildWheel()，`.disc-svg` 下只有 ring-thin +
        6 个 sector-g。所以这里照搬同一套几何补一份。
     ② **首屏没有能落脚的空环**。闭合态盘心 `width: 66%` → 半径 166.3px
        = 158.4 视框单位，而外圈扇区内沿 `WHEEL.r1i = 158`，两者正好相切；
        r1i 之内的刻线全在盘心底下（实测 36 道零可见像素）。
        画在盘缘又会被 2.6px 的缝和盘底凹槽吃掉（3x 截图只剩几粒灰点）。
        所以画在**扇区面上、紧贴内沿**那一圈：唯一一片既露在盘心之外、
        又不在缝和标签上的空白。r1i+1 → +9/+5，最外端 167 单位，
        离标签中心 193 还有 26 单位余量。

     绘制顺序：必须 append 在六个 sector-g **之后**（SVG 没有 z-index，
     顺序就是层级）。先画会被扇区填充整片盖掉 —— 场合屏原先就是这个顺序，
     display 放开后实测仍不可见。 */

  /* --- 盘心 --- */
  const hubKicker = el('div', { class: 'hub-kicker' }, '香型轮盘');
  const hubZh = el('div', { class: 'hub-zh' }, '还没选');
  const hubDesc = el('div', { class: 'hub-desc' }, '从外圈挑一个大类');
  const hubGlyph = el('div', { class: 'hub-glyph' });
  /* 只选了大类时的快捷出口：跳过第二轮直接进下一步。
     放在盘心而不是底部按钮栏，是因为「我只想要大类」这个决定，
     正好发生在用户刚点完大类、视线还在盘心的一瞬间。 */
  const hubGo = el('button', {
    class: 'hub-go',
    type: 'button',
    onclick: (ev) => {
      ev.stopPropagation();
      const f = families.find((x) => x.id === selFamily) || null;
      onChange(f, null);
      next();
    },
  }, '直接下一步');
  /* ① 「中圈可以不选」这件事，原来只有桌面端这颗 .hub-go 在说，
     而它在 ≤620px 是 display:none —— 手机上最需要这句话的人恰好看不到。
     补一颗 .hub-skip：窄屏显示、桌面隐藏（.hub-go 说得更具体）。 */
  const hubSkip = el('button', {
    class: 'hub-skip',
    type: 'button',
    onclick: (ev) => {
      ev.stopPropagation();
      const f = families.find((x) => x.id === selFamily) || null;
      onChange(f, null);
      next();
    },
  }, '中圈可不选');
  hubSkip.hidden = true;
  hubGo.hidden = true;
  /* ② 返回入口：不在盘心上、也不在盘面上 —— 现在挂在页顶流里。
     历史：v7 把它从盘心（12px 下划线、26px 高，低于 44px 触控下限）挪到
     盘外左上角，v7 第 1.5 步又钉到 218° 盘沿上。
     钉在盘沿上的代价在 2026-11 中圈标签胶囊化之后暴露出来：展开态
     −120° 那枚标签（花香调「单一花」）被它压掉 36–46%，而圆盘上
     再没有一处能同时避开六个大类的标签（见 docs/DECISIONS.md 同轮记录）。
     所以按 Eddie 2026-11-24 01:48 裁决 A，它整体移出圆盘、进页顶流
     （.stage-top）——显隐与点击行为一个字没改，改的只是它待在哪。 */
  const backBtn = el('button', {
    class: 'wheel-back',
    type: 'button',
    onclick: (ev) => {
      ev.stopPropagation();
      selFamily = null; selSub = null; hoverFam = null; hoverSub = null;
      paint();
      onChange(null, null);
    },
  }, '← 重选大类');
  backBtn.hidden = true;
  (backHost || root).appendChild(backBtn);
  /* 未选大类时盘心唯一的一行弱提示。其余既有节点保留在 DOM 中供无障碍
     与既有自检读取，但由 CSS 在该态隐藏，视觉上只出现这一句。 */
  const hubIdleHint = el('div', { class: 'hub-idle-hint' }, '先选香调大类');
  /* 大类徽记：进入正常 flex 流，固定 64×64；不再叠在文字背后。 */
  const hubEmblem = el('div', { class: 'hub-emblem', 'aria-hidden': 'true' });
  let confirmTimer = 0;
  function confirmFamilyEmblem() {
    if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = 0; }
    hubEmblem.classList.remove('is-confirming');
    void hubEmblem.offsetWidth;
    hubEmblem.classList.add('is-confirming');
    confirmTimer = setTimeout(() => {
      hubEmblem.classList.remove('is-confirming');
      confirmTimer = 0;
    }, 180);
  }
  const hub = el('div', { class: 'disc-hub is-idle' },
    hubEmblem, hubIdleHint, hubKicker, hubZh, hubDesc, hubGlyph, hubSkip, hubGo);
  root.appendChild(hub);

  /* ---- 液态玻璃交互层（B 段）----
     两层，都只做反馈、不接事件（pointer-events:none）：
       .glass        高光，位置由 --gx/--gy 驱动，每帧跟着指针走
       .glass-ripple 点击涟漪，从落点扩散一次
     为什么不直接对扇区做 filter：扇区是 SVG 路径，filter 会让整块盘
     每帧重新光栅化（520px 盘实测掉到 30fps 以下）。这里只改渐变中心，
     属于 paint 级更新。

     **挂在 root 上，不在可旋转层 .disc-rot 里**：那一层带
     `transform: rotate(var(--disc-rot))`，高光跟着转的话，"光从左上打来"
     这件事会随盘一起歪掉。挂在 root 上则以控件盒为坐标，稳定。 */
  const glass = el('div', { class: 'glass' });
  root.appendChild(glass);
  /* 涟漪挂在 root 上（不在 rot 里）：它要以盘盒的百分比定位到点击落点，
     而 rot 是可旋转层 —— 一旦盘被转动（--disc-rot），涟漪会跟着转，
     落点就对不上指针了。 */
  const ripple = el('div', { class: 'glass-ripple' });
  root.appendChild(ripple);

  /* ---- 指针移动：高光跟着流动 ----
     写成「按帧合并」而不是每次 pointermove 直接写变量：pointermove 在
     144Hz 鼠标上每秒 144 次，每次都写两个自定义属性会让样式重算排队。
     rAF 合并之后，每帧最多一次写入，视觉上仍是连续跟随（这就是
     「禁止二值硬切换」在这一层的具体做法：位置是连续量，不是档位）。

     坐标换算成**百分比**：盘径在四个断点上从 312px 变到 520px，
     写 px 会让窄屏上的高光落错位置。rect 是 .wheel 的盒（正方形），
     所以 x/y 各自归一化到 0–100 即可。 */
  let glintRaf = 0;
  let glintX = 50;
  let glintY = 34;
  const flushGlint = () => {
    glintRaf = 0;
    glass.style.setProperty('--gx', glintX.toFixed(1) + '%');
    glass.style.setProperty('--gy', glintY.toFixed(1) + '%');
  };
  const onGlintMove = (ev) => {
    if (typeof root.getBoundingClientRect !== 'function') return;
    const r = root.getBoundingClientRect();
    if (!r || !r.width || !r.height) return;
    /* 指针在盘外的圆角区域时，把高光夹回盘内 —— 否则高光会跑到盘外面，
       盘看起来像一块被切走一角的玻璃。 */
    const nx = (ev.clientX - r.left) / r.width;
    const ny = (ev.clientY - r.top) / r.height;
    const dx = nx - 0.5;
    const dy = ny - 0.5;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const k = Math.min(1, 0.5 / dist);   // 半径 50% 之外夹回圆周
    glintX = (0.5 + dx * k) * 100;
    glintY = (0.5 + dy * k) * 100;
    root.classList.add('is-glint');
    if (!glintRaf && typeof requestAnimationFrame === 'function') {
      glintRaf = requestAnimationFrame(flushGlint);
    } else if (!glintRaf) {
      flushGlint();   // 无 rAF 的环境（测试桩）直接落值
    }
  };
  const onGlintLeave = () => {
    root.classList.remove('is-glint');
    /* 回到默认光位而不是停在最后一格：指针离开后盘上仍有一道"从左上打来"
       的光，界面不会突然变平。 */
    glintX = 50;
    glintY = 34;
    if (!glintRaf && typeof requestAnimationFrame === 'function') {
      glintRaf = requestAnimationFrame(flushGlint);
    }
  };
  /* ---- 轻按沉降：按下时整块盘往下沉，松开/落定平滑回位 ----
     （2026-11-18 去回弹，Eddie 拍板。上一版是 520ms 带过冲的
     `glassSettle`，点一下盘会先被"顶"起来 2.2% 再掉回去 —— 实物里
     没有"按下去自己长回来"这回事，所以整条过冲段删掉。）

     类挂在 `root`（.wheel）上，不挂在瓦片上：瓦片自己的 `.is-pressing`
     由弧段那套逻辑管（缩到 .93 + 描边收紧，那是"这一段被按到"），
     而这一层是"盘这个物件被按到"—— 两个层级各说各的事，叠在一起
     才是完整的按压反馈，而不是把两个量都堆到同一个元素上。

     `pointerdown` 挂在 root 上而不是逐个瓦片：大圈扇区、中圈弧段、
     标签按钮、盘心两颗胶囊都是它的后代，一次能覆盖全部入口；
     键盘 Enter 走 `keyPress` 那条路，也补一次（见下）。

     这里**不写 pointerdown 的 preventDefault**；但必须用**捕获阶段**
     （第三个参数 true），理由实测过：中圈弧段标签的 `pointerdown`
     自己带 `ev.stopPropagation()`（见下面 `btn.addEventListener
     ('pointerdown', …)`），冒泡到这里已经被掐断 —— 探针实测第二轮
     ty 恒 0，盘在该沉的时候纹丝不动。捕获阶段从 window 往下走，
     先于目标自己的监听器执行，stopPropagation 拦不到它（它只能拦
     后续的冒泡段）。下沉是纯观察，不改变任何既有判定，捕获不夺权。 */
  let pressTimer = 0;
  const diskPress = () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = 0; }
    root.classList.add('is-pressing');
  };
  const diskRelease = () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = 0; }
    root.classList.remove('is-pressing');
  };
  /* 按下后指针移出圆盘（没松手就划走了）也要复位 —— 否则盘会一直
     停在下沉态，直到下一次点别处才弹回。 */
  root.addEventListener('pointerdown', diskPress, true);
  root.addEventListener('pointerup', diskRelease, true);
  root.addEventListener('pointercancel', diskRelease, true);
  root.addEventListener('pointerleave', diskRelease, true);
  if (typeof window !== 'undefined') {
    /* 兜底与弧段的 releasePress 同源：指针在盘外抬起、窗口失焦。
       这两条用冒泡即可（window 在最外层，不需要先于任何人）。 */
    window.addEventListener('pointerup', diskRelease);
    window.addEventListener('pointercancel', diskRelease);
    window.addEventListener('blur', diskRelease);
  }
  /* 键盘路径：没有 pointer 事件，Enter / Space 触发 click 前挂一次，
     220ms 后摘 —— 与回位时长（180ms）留一点余量，键盘用户也能看到
     同一次沉降，而不是"键盘点了没反应"。 */
  const diskKeyPress = (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    diskPress();
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = setTimeout(() => { pressTimer = 0; diskRelease(); }, 220);
  };
  root.addEventListener('keydown', diskKeyPress, true);

  root.addEventListener('pointermove', onGlintMove);
  root.addEventListener('pointerleave', onGlintLeave);
  root.addEventListener('pointercancel', onGlintLeave);

  /* ---- 点击：涟漪从落点扩散 ----
     与「轻按沉降」（CSS 的 `.wheel.is-pressing` + `glassSettle`）配套：
     涟漪给起点，沉降给"这一下被接住了"的力反馈。两者都不越过终点 ——
     涟漪只淡出、不回缩；沉降只从下方贴合，不回弹。 */
  let rippleTimer = 0;
  const splash = (ev) => {
    if (typeof root.getBoundingClientRect !== 'function') return;
    const r = root.getBoundingClientRect();
    if (!r || !r.width || !r.height) return;
    const x = ev && typeof ev.clientX === 'number' ? ev.clientX : (r.left + r.width / 2);
    const y = ev && typeof ev.clientY === 'number' ? ev.clientY : (r.top + r.height / 2);
    ripple.style.setProperty('--rx', (((x - r.left) / r.width) * 100).toFixed(1) + '%');
    ripple.style.setProperty('--ry', (((y - r.top) / r.height) * 100).toFixed(1) + '%');
    ripple.classList.remove('is-on');
    /* 强制回流：连续两次点同一处时，动画要能从 0 重播（同一个类连挂两次
       浏览器不会重跑动画）。 */
    void ripple.offsetWidth;
    ripple.classList.add('is-on');
    if (rippleTimer) clearTimeout(rippleTimer);
    rippleTimer = setTimeout(() => { ripple.classList.remove('is-on'); rippleTimer = 0; }, 680);
  };

  /* ---- 盘沿几何：**已无调用者**（2026-11-24 复查反馈第 2 条）----
     这里原来叫 layoutRim()，只做一件事：把盘心的视口坐标写进
     --plate-cx/--plate-cy，给页面底纹（.plate-bg 的同心圆环）当圆心。
     Eddie 判定背景多出的圆轮装饰要全部移除，环随之删除，这段测量连同
     rAF / resize 两条接线一起删掉 —— 没有环要定圆心，留着只会让下一个
     读到它的人以为背景上还有一层。

     ==== 历史（一并留档，别再加回来）====
     2026-11-24 01:48：--bl/--bt（返回胶囊在盘沿 218° 的落点）先从这里删掉，
     胶囊搬进页顶流（.stage-top）。同一天下午，--plate-cx/cy 也删掉。 */

  /* --- 第一层：6 个家族，固定不变 --- */
  const nFam = families.length;
  const famStep = 360 / nFam;
  const famStart = -90 - famStep / 2;
  const outerG = [];
  const outerBtn = [];

  families.forEach((f, i) => {
    const a0 = famStart + i * famStep + 1.0;
    const a1 = famStart + (i + 1) * famStep - 1.0;
    /* --i 只服务一处：两层切换时六块按顺序退场/归位。
       写在 style 上而不是 nth-child 上 —— 家族数由数据决定（6），
       但同一套错峰逻辑要能照搬到中圈（4–7 段），CSS 里只认这一个变量。 */
    const g = svgEl('g', { class: 'sector-g lvl1', 'data-fam': f.id, style: '--i: ' + i });
    g.appendChild(svgEl('path', {
      class: 'sector-shape', d: annulusPath(WHEEL.r1o, WHEEL.r1i, a0, a1),
    }));
    /* 外圈只保留一层弧字。HTML 按钮仍是命中与键盘焦点层，但不再画胶囊框；
       文字沿扇区中线排布，方向随所在半盘翻转，避免下半盘倒字。 */
    const rText = (WHEEL.r1i + WHEEL.r1o) / 2;
    const upright = famStart + (i + 0.5) * famStep <= 0;
    const [tx0, ty0] = polar(rText, upright ? a0 : a1);
    const [tx1, ty1] = polar(rText, upright ? a1 : a0);
    const arcTextId = 'wheel-arc-' + (++wheelArcSeq);
    g.appendChild(svgEl('path', {
      id: arcTextId, class: 'fam-arc-guide',
      d: 'M ' + tx0.toFixed(2) + ' ' + ty0.toFixed(2)
        + ' A ' + rText + ' ' + rText + ' 0 0 ' + (upright ? '1' : '0')
        + ' ' + tx1.toFixed(2) + ' ' + ty1.toFixed(2),
      fill: 'none', stroke: 'none',
    }));
    const familyMid = midFamilyDeg(famStart, famStep, i);
    const familyMidNormalized = ((familyMid + 180) % 360 + 360) % 360 - 180;
    const isSideFamily = Math.abs(familyMidNormalized) < 75 || Math.abs(familyMidNormalized) > 105;
    const arcSide = Math.cos(familyMid * Math.PI / 180) >= 0 ? 1 : -1;
    const labelText = svgEl('text', { class: 'fam-arc-text' + (isSideFamily ? ' is-side' : ''), 'text-anchor': 'middle' });
    const tp = svgEl('textPath', { href: '#' + arcTextId, startOffset: '50%' });
    tp.textContent = f.zh;
    labelText.appendChild(tp);
    g.appendChild(labelText);
    /* 四个侧边大类继续逐字 SVG，但字心必须真的落在弧上。
       读取顺序固定为上→下：右侧角坐标随 t 增大，左侧相反；每字自身不倒转。
       字心半径 193、角间距 7.2°（弧距约 24.2 单位），旋转 ±15° 只作辅助。
       13px 字面的内沿离盘心半径 144 约 42.5 单位、外沿离盘沿 228 约 28.5 单位；
       390px 盘径下分别约 30px / 20px。相邻字心净距约 11.2 单位（约 8px）。
       未来标签变长时先缩总角跨（不缩字号、不压圈、不裁切），顶/底 textPath 不动。 */
    if (isSideFamily && [...f.zh].length > 1) {
      const uprightGroup = svgEl('g', { class: 'fam-arc-upright', 'aria-hidden': 'true' });
      const chars = [...f.zh];
      const gapDeg = Math.min(7.2, 14.4 / (chars.length - 1));
      chars.forEach((char, charIndex) => {
        const t = charIndex - (chars.length - 1) / 2;
        const angle = familyMid + arcSide * t * gapDeg;
        const [x, y] = polar(rText, angle);
        const rotation = arcSide * t * 15;
        const charText = svgEl('text', {
          class: 'fam-arc-upright-char',
          x: x.toFixed(2), y: y.toFixed(2),
          'text-anchor': 'middle',
          transform: 'rotate(' + rotation.toFixed(2) + ' ' + x.toFixed(2) + ' ' + y.toFixed(2) + ')',
        });
        charText.textContent = char;
        uprightGroup.appendChild(charText);
      });
      g.appendChild(uprightGroup);
    }
    svg.appendChild(g);
    outerG.push(g);
  });

  function midFamilyDeg(start, step, index) {
    return start + (index + .5) * step;
  }

  /* 盘口：一圈发丝线 + 六枚定位点（v7 第 1.5 步替换掉 36 道分度刻线）。
     ------------------------------------------------------------
     原来的 36 道刻线（每 3 道加长）是量具语言：它回答"这个盘有多少度"，
     而这张盘上没有任何东西需要以角度为单位读 —— 六族是均分的结果，
     不是测量结果。留着它，盘就读成仪表盘，与"标本纸面"这一套相反。
     （这就是任务书缺陷 ⑤「内圈刻度齿环像量具」。）

     换成两件东西，都只报结构不报角度：
       · plate-rim：一道发丝线 = 盘口。落在家族环外沿 228 与
         `.wheel::after` 包边 236 之间取 232 —— 两侧各留 4 单位，
         它是盘沿内侧的一道唇线，不与任何既有圆环重合。
       · plate-dot：六枚定位点，正对每个**扇区接缝**（不是中线）——
         中线已经站着标签了，接缝上放点才是在说"六块从这儿分开"。
     绘制顺序仍在六个 sector-g 之后（SVG 没有 z-index，顺序即层级）。 */
  {
    const RIM = WHEEL.r1o + 4;      // 228 + 4 = 232
    svg.appendChild(svgEl('circle', {
      class: 'plate-rim', cx: WHEEL.cx, cy: WHEEL.cy, r: RIM,
    }));
    const nFamDot = families.length;
    for (let k = 0; k < nFamDot; k++) {
      /* famStart = -90 - 半步，第 k 条接缝 = famStart + k × 步 */
      const [dx, dy] = polar(RIM, -90 - 180 / nFamDot + (360 / nFamDot) * k);
      svg.appendChild(svgEl('circle', {
        class: 'plate-dot', cx: dx.toFixed(2), cy: dy.toFixed(2), r: 2.2,
      }));
    }
  }

  const labelLayer = el('div', { class: 'label-layer', role: 'radiogroup', 'aria-label': '香型大类' });
  rot.appendChild(labelLayer);

  function keyNav(ev, list, i) {
    let d = 0;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') d = 1;
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') d = -1;
    else return;
    ev.preventDefault();
    const to = (i + d + list.length) % list.length;
    list.forEach((b, j) => b.setAttribute('tabindex', j === to ? '0' : '-1'));
    list[to].focus();
  }

  families.forEach((f, i) => {
    const midDeg = famStart + (i + 0.5) * famStep;
    const spanDeg = famStep - FAM_LABEL_GAP;
    const rMid = sectorCentroidRadius(WHEEL.r1i, WHEEL.r1o, spanDeg);
    const p = polar(rMid, midDeg);
    const px = (q, k) => ((q[k] / WHEEL.vb) * 100).toFixed(2);
    const arcUnits = WHEEL.r1o * (spanDeg * Math.PI / 180);
    const btn = el('button', {
      class: 'disc-sector lvl1' + (f.zh.length > 4 ? ' is-long' : ''),
      type: 'button',
      role: 'radio',
      'aria-checked': 'false',
      'aria-label': f.zh,
      'data-fam': f.id,
      'data-centroid-r': rMid.toFixed(4),
      'data-mid-deg': midDeg.toFixed(4),
      'data-arc-units': arcUnits.toFixed(4),
      tabindex: i === 0 ? '0' : '-1',
      style: '--l:' + px(p, 0) + '%;--t:' + px(p, 1) + '%;--nl:' + px(p, 0) + '%;--nt:' + px(p, 1)
        + '%;--arc-max:' + (arcUnits / WHEEL.vb * 100).toFixed(2) + '%;--i:' + i,
    },
      el('span', { class: 'zh' }, f.zh),
      /* 注脚按「·」拆成三段（前 / 点 / 后）：窄屏斜向扇区把它排成两行，
         横排一行会越过扇区外沿（半径 200 处弦宽约 81px，最长注脚 89px）。
         拆开后 textContent 与原来逐字相同，桌面端仍由 CSS 排成一行。 */
      (() => {
        const noteText = (f.representativeNotes || []).slice(0, 2).map((e) => noteZhOf(e)).join('·');
        const dotAt = noteText.indexOf('·');
        return el('span', { class: 'notes' },
          el('span', { class: 'notes-part' }, dotAt > 0 ? noteText.slice(0, dotAt) : noteText),
          dotAt > 0 ? el('span', { class: 'notes-dot' }, '·') : null,
          dotAt > 0 ? el('span', { class: 'notes-part' }, noteText.slice(dotAt + 1)) : null
        );
      })()
    );
    /* **中圈一旦选定小项，大圈 hover 也必须失效**。
       用户报的第二个 case：选定「香草甜」后指针移到大圈家族环，
       盘心被改成「点一下换到 柑橘调」、`is-picked` 被摘掉 —— 选中态直接丢了。
       成因与中圈那对 enter/leave 完全同源：hoverFam 会进 paint() 的
       `hoverOther` 分支，把盘心让给悬停的那个家族。
       这里在入口就挡掉，不写 hoverFam、不调 paint()。
       click 不经过这两个函数，换大类照常。 */
    const enter = () => {
      if (selSub) return;
      hoverFam = f.id; hoverSub = null; paint();
    };
    const leave = () => {
      if (selSub) return;
      hoverFam = null; paint();
    };
    btn.addEventListener('mouseenter', enter);
    btn.addEventListener('mouseleave', leave);
    btn.addEventListener('focus', enter);
    btn.addEventListener('blur', leave);
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      splash(ev);
      selFamily = f.id; selSub = null; hoverFam = null; hoverSub = null;
      paint();
      confirmFamilyEmblem();
      onChange(f, null);
    });
    btn.addEventListener('keydown', (ev) => keyNav(ev, outerBtn, i));
    labelLayer.appendChild(btn);
    outerBtn.push(btn);

    // 扇形本体同样可点：只让标签可点的话，用户戳那一大块面积毫无反应
    const g = outerG[i];
    g.addEventListener('mouseenter', enter);
    g.addEventListener('mouseleave', leave);
    g.addEventListener('click', (ev) => {
      splash(ev);
      selFamily = f.id; selSub = null; hoverFam = null; hoverSub = null;
      paint();
      confirmFamilyEmblem();
      onChange(f, null);
    });
  });

  /* --- 第二轮：一圈小方格 ---
     为什么不是同心环：环的宽度被半径卡死。360px 视口下中圈直径只剩 60px，
     44px 的触控框数学上装不进去，四字标签必然溢出。方格不随圆盘缩放，
     窄屏也能同时保住 44px 触控与一行四个字的宽度。 */
  const subRing = el('div', { class: 'sub-ring', role: 'radiogroup', 'aria-label': '子类' });
  root.appendChild(subRing);

  /* 按下态的唯一释放入口。挂在 buildWheel 作用域而不是每个弧段里：
     ① chooseSub 需要在确认时兜底释放；
     ② 弧段每次重建都会换一批节点，逐个挂全局监听会泄漏。
     这里只记录"当前按下的那一个"，换节点时旧引用自然失效。 */
  let pressedNode = null;
  function releasePress() {
    if (!pressedNode) return;
    pressedNode.g.classList.remove('is-pressing');
    pressedNode.btn.classList.remove('is-pressing');
    pressedNode = null;
  }
  /* 全局兜底：指针在弧段外抬起、或窗口失焦，都要把按下态收掉。
     `pointerup` 是唯一可靠的"这一次交互结束"的信号（click 在拖拽后不派发）。 */
  if (typeof window !== 'undefined') {
    window.addEventListener('pointerup', releasePress);
    window.addEventListener('pointercancel', releasePress);
    window.addEventListener('blur', releasePress);
  }

  /* --- 第二层：一圈弧段 ---
     三代形态的演进，每一代都在修上一代的可读性问题：
     v5「tier1 铺一圈方格 + 末尾 +N」—— 一次冒出五六个词，末尾那格还要再点一次才展开；
     v6「三格弧窗 + 左右箭头」—— 一次只看得见三项，箭头把"还有几项、转到第几项"藏起来，
        用户转两下就不知道自己在环上的哪个位置了；
     v7「全部细分类等分铺满一整圈弧段」—— 有几项、现在停在第几项、往两边各还有什么，
        一眼全在。没有箭头，也没有"转到才算选中"的中间态：点哪段就是哪段。
     为什么是弧段而不是方格：方格是贴上去的，弧段是从这块盘上切下来的 ——
     同一圆心、同一线宽、同一留白，视觉上属于同一个物件。 */
  /* 三层环的半径分配（480 单位视框，控件半径 240）：
       盘心   46% 直径 = 221 单位 → 半径 110.4
       家族盘 scale(.6) → r1o 228×.6 = 136.8（盘心之外 26.4 单位的一圈，够看出"盘还在"）
       弧段   152–226：内径离家族盘 15.2 单位的缝，外径离控件边 14 给描边与投影
     原来弧段 148–232 几乎顶满控件，外圈家族扇区被挤到只剩贴边一条，
     三层读不出主次。 */
  /* 中圈弧段的内外径。三条约束都是实测出来的：
     ① 内径必须离盘心够远。盘心 46% → r = 110.4（480 单位视框）。
        原来内径 114 只差 3.6 单位（520px 盘上约 4px），白瓦片几乎贴着白盘心，
        两者并成一块白饼，中圈只剩几道"辐条"—— 截图确认，这是
        「中圈读不出是浮起的一片片」的直接原因，不是段数不够。
        现在内径 118，与盘心隔 7.6 单位（约 8px）。
     ② 外径 < 家族环内沿 r1i = 158（展开态家族环不缩放）。152 留 6 单位。
     ③ 凹槽要比弧带更宽，两侧各露出 4 单位（约 4.3px）的槽边。
        槽与弧带同宽时，槽只在段缝里露出，整条带仍读成"一个环"；
        两侧露边之后，弧段才是"嵌在一圈槽里的瓦"。
     代价：弧带从 42 收窄到 34 单位，段上文字仍在 rMid = 135，位置不变。 */
  /* 三层环的半径分配见函数开头（SUB_R2I / SUB_R2O / LABEL_R）。
     这里只留 arc 的推导：凹槽比弧带每侧宽 SUB_GROOVE，
     段缝保证 3.4° 以内，段上文字落在弧带中线。 */
  let subItems = null;
  let subBtns = [];
  let subGs = [];   // 与 subBtns 同序的 SVG 弧段组，填充由它驱动

  /* 退场不是"立刻清空"，否则 DOM 里没有节点可播动画。
     旧实现 `subRing.innerHTML = ''` 一行抹掉七段 —— 上一版文档里写的
     「返回时中圈播消失动效」在实现层面根本不存在，只能算一句愿望。
     现在先挂 `.is-exit`（CSS 按 --n-1---i 反序收），420ms 后再清。
     420 = 220ms 动画 + (n-1)×22ms 的最长错峰 + 60ms 余量。 */
  let exitTimer = 0;
  function clearSubRing() {
    subRing.classList.remove('is-exit');
    subRing.innerHTML = '';
    subBtns = [];
    subGs = [];
    subItems = null;
    exitTimer = 0;
  }

  function buildSubRing(fam) {
    /* 先掐掉待执行的清空：用户在 420ms 内又把大类点回来时，
       定时器不能把刚建好的新节点一起删掉。 */
    if (exitTimer) { clearTimeout(exitTimer); exitTimer = 0; }
    if (!fam) {
      if (subRing.children.length) {
        subRing.classList.add('is-exit');
        /* 立刻交出选中身份：退场中的那几段不能再被点、也不该再被
           paint() 当"当前项"高亮 —— 但它们仍留在 DOM 里播动画。 */
        subBtns = [];
        subGs = [];
        subItems = null;
        exitTimer = setTimeout(clearSubRing, 420);
      }
      return;
    }
    const all = fam.subfamilies || [];
    if (!all.length) { clearSubRing(); return; }
    subRing.classList.remove('is-exit');
    subRing.innerHTML = '';
    subBtns = [];
    subGs = [];
    subItems = all;
    renderArcs(fam);
  }

  function renderArcs(fam) {
    subRing.innerHTML = '';
    subBtns = [];
    subGs = [];
    const all = subItems || [];
    const n = all.length;
    if (!n) return;
    const step = 360 / n;
    /* 段间留缝而不是画分隔线：缝里露出的是凹槽的底（.sub-channel），
       比再补一道描边更干净。缝宽 3.4°：520px 盘上约 8px，
       两侧各留 1px 白描边之后槽底仍露出 6px —— 低于这个数，
       缝会退化成「描边没对齐」而不是「瓦片之间的槽」（见 _wheel8.css 第四节）。 */
    const gap = Math.min(3.4, step * 0.075);
    const svg = svgEl('svg', {
      class: 'sub-svg',
      viewBox: '0 0 ' + WHEEL.vb + ' ' + WHEEL.vb,
      'aria-hidden': 'true',
      focusable: 'false',
    });
    const labels = el('div', { class: 'sub-labels' });

    /* 凹槽环：比弧带每侧再宽 4 单位的深色带，弧段嵌在它上面。
       没有这条槽，段间的缝透出的是盘心白（同色），七段读成一块连续白环；
       有了槽，缝里与上下两侧露出的都是槽底（比白瓦深），
       "从同一个槽里切出来、一片片嵌进去"才成立。
       stroke-width = 弧带宽 + 2×SUB_GROOVE。 */
    svg.appendChild(svgEl('circle', {
      class: 'sub-channel',
      cx: WHEEL.cx,
      cy: WHEEL.cy,
      r: (SUB_R2O + SUB_R2I) / 2,
      fill: 'none',
      'stroke-width': (SUB_R2O - SUB_R2I) + SUB_GROOVE * 2,
    }));


    all.forEach((item, i) => {
      /* -90 = 正上方，与第一层同一套角度约定（混了就会整体偏 90°） */
      const a0 = -90 + i * step + gap / 2;
      const a1 = a0 + step - gap;
      const mid = (a0 + a1) / 2;

      /* --i / --n 只服务一处：入退场错峰。
           入场按 --i 顺着铺开（第一段先到），退场按 --n-1---i 反着收（最后一段先走）——
           同一个方向进出，读起来是"一圈绕完再绕回来"，不是七段一起闪。
           写变量不写死 nth-child：段数由数据决定（4–7），CSS 里只认这两个数。 */
      const g = svgEl('g', {
        class: 'sub-g',
        'data-sub': item.id,
        'data-fam': fam.id,
        style: '--i: ' + i + '; --n: ' + n,
      });
      g.appendChild(svgEl('path', {
        class: 'sub-arc',
        d: annulusPath(SUB_R2O, SUB_R2I, a0, a1),
      }));
      /* 中圈只保留纯文字胶囊；弧字层已删除，避免胶囊上下露出重复残字。 */
      svg.appendChild(g);
      subGs.push(g);

      const spanDeg = step - gap;
      /* 弧段角平分线 × 弧带径向中点 = 标签锚点。
         sectorCentroidRadius() 是面积质心，不是弧带中点：n=2 时它给出
         r≈88，标签被 60% 盘心（r=144）整枚盖住；n=3/4 时也明显偏内。
         统一取 (118+152)/2=135，n=2/3/4/6 都保持同一几何口径。 */
      const labelR = (SUB_R2I + SUB_R2O) / 2;
      const px = polar(labelR, mid);
      const arcUnits = SUB_R2O * (spanDeg * Math.PI / 180);
      /* 胶囊长轴沿弧带切线；角度归一化到 [-90°, 90°]，避免下半盘倒字。
         批 4 指定的四枚侧边胶囊改为正字竖排，不再随切线转 90°。 */
      const isUprightPill = ['fruity-gourmand', 'vanilla-gourmand', 'green-floral', 'white-floral'].includes(item.id);
      const pillRot = isUprightPill ? 0 : ((mid + 180) % 180) - 90;
      const fullName = subFullName(item);
      const visibleName = subShortLabel(item);
      const btn = el('button', {
        class: 'disc-sector lvl2 sub-arc-btn' + (visibleName.length > 2 ? ' is-long' : '') + (isUprightPill ? ' is-upright' : ''),
        type: 'button',
        role: 'radio',
        'aria-checked': 'false',
        /* **无障碍名用全名，短标签只管视觉**（2026-11-25 无障碍名腿）。
           胶囊里写的是短标签（「皂感」），按钮的可见文本随之变短 —— 不加这一行，
           读屏念出来的也是「皂感」，而盘心小类列表、结果页、推荐理由念的都是
           「皂感柑橘」：同一件事在两个地方两个名字，读屏用户无从对齐。
           aria-label 覆盖内容算出的名字，于是可见字面仍守单行胶囊的宽度约束，
           无障碍名回到与全站一致的全名口径（`label || zh || id`，与盘心同源同函数）。
           纯属性、零渲染影响：图标 span 本来就是 aria-hidden，改前改后按钮的
           盒尺寸、字号、行数逐字段实测一致（见腿目录 a11y-base/after.json 比对）。 */
        'aria-label': fullName,
        'data-sub': item.id,
        'data-fam': fam.id,
        'data-centroid-r': labelR.toFixed(4),
        'data-mid-deg': mid.toFixed(4),
        'data-arc-units': arcUnits.toFixed(4),
        /* 该族的子类数（4–7）落到属性上，给 CSS 按"拥挤族"分档用：
           n≥6 时桌面也守 12px 字号（Eddie 2026-11-25 口径）。
           --n 是 CSS 变量，属性选择器选不到它，所以必须有一个属性镜像。
           注意它**不**用来决定"窄屏撤图标"—— 那条只看盘面宽度，
           因为径向余量由盘径决定、与族里几个子类无关。 */
        'data-n': n,
        tabindex: i === 0 ? '0' : '-1',
        /* 只写定位变量与错峰变量，不写内联 left/top/transform：
           内联 left/top 会盖掉窄屏那套（--nl/--nt）的 media query，
           内联 transform 会盖掉 .disc-sector 基类的居中位移。 */
        style: '--l: ' + (px[0] / WHEEL.vb * 100).toFixed(2) + '%; --t: ' + (px[1] / WHEEL.vb * 100).toFixed(2)
          + '%; --nl: ' + (px[0] / WHEEL.vb * 100).toFixed(2) + '%; --nt: ' + (px[1] / WHEEL.vb * 100).toFixed(2)
          + '%; --arc-max: ' + (arcUnits / WHEEL.vb * 100).toFixed(2) + '%; --pill-rot: ' + pillRot.toFixed(2) + 'deg; --i: ' + i + '; --n: ' + n,
      }, el('span', { class: 'zh', 'aria-hidden': 'true' }, visibleName));
      /* 中圈标签用短标签（src/sub-labels.js）而不是 label/zh：
         同族多个 zh 共享前缀，短标签更容易区分；定版胶囊只留文字、不换行。
         zh / label 保留不动，继续用于表单、推荐理由与无障碍全名。 */

      /* **中圈一旦有选中项，hover 一律不再产生反馈**。
         用户的要求：「中圈一旦被选定，无论鼠标移动到何处，中框的选择状态
         都不应再发生变化；要重新改变选择必须左键点击」。
         这里同时挡两件事：
           ① 不再写 hoverSub（`is-hot` 不会出现 → 没有蓝框）；
           ② 不再调 paint()（盘心不重绘 → 不闪）。
         只挡视觉不挡事件：弧段的 click 仍然照常工作。 */
      const enter = () => {
        if (selSub) return;
        hoverSub = item.id; paint();
      };
      const leave = () => {
        if (selSub) return;
        if (hoverSub === item.id) { hoverSub = null; paint(); }
      };

      /* ---- 按下态：显式类，不靠 :active ----
         `:active` 只在"指针真的按住该元素"时成立：键盘 Enter 触发、
         脚本 dispatch、触屏滑动取消，三种情况全漏，而按下态的意义
         恰恰是"告诉用户这一次点击被接住了"。所以由这里挂类、由
         pointerup / pointercancel / pointerleave 三处摘。
         挂在 `g`（弧段组）上而不是按钮上 —— 两个入口（弧段、按钮）
         要共用同一个按下视觉，挂两处会各动各的。 */
      const press = () => {
        /* 先把上一个收掉：快速连点两段时，若不收，前一段会永远停在按下态
           （它的 pointerup 早于本次 pointerdown 已经过去）。 */
        releasePress();
        pressedNode = { g, btn };
        g.classList.add('is-pressing');
        btn.classList.add('is-pressing');
      };
      const release = () => {
        if (pressedNode && pressedNode.g === g) releasePress();
      };
      /* 按下与抬起都绑在弧段组上：鼠标在按钮上按下、拖出弧段再松开时，
         pointerup 落在别的节点，只绑按钮会永远停在按下态。 */
      g.addEventListener('pointerdown', press);
      btn.addEventListener('pointerdown', (ev) => { press(); ev.stopPropagation(); });
      g.addEventListener('pointerup', release);
      g.addEventListener('pointercancel', release);
      g.addEventListener('pointerleave', release);
      /* 键盘路径没有 pointer 事件：Enter / Space 触发 click，
         在 click 前挂一次、下一个微任务摘掉，给一次同等的按压反馈。 */
      const keyPress = (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        press();
        setTimeout(release, 140);
      };

      btn.addEventListener('mouseenter', enter);
      btn.addEventListener('mouseleave', leave);
      btn.addEventListener('focus', enter);
      btn.addEventListener('blur', () => { leave(); release(); });
      btn.addEventListener('keydown', (ev) => { keyPress(ev); keyNav(ev, subBtns, subBtns.indexOf(btn)); });
      btn.addEventListener('click', (ev) => { ev.stopPropagation(); splash(ev); chooseSub(fam, item); });
      /* 弧段本身也可点：文字只有 48px 宽，弧段比它大得多，
         只让文字接事件等于把可用面积缩到三分之一。 */
      g.addEventListener('mouseenter', enter);
      g.addEventListener('mouseleave', leave);
      g.addEventListener('click', (ev) => { ev.stopPropagation(); splash(ev); chooseSub(fam, item); });

      labels.appendChild(btn);
      subBtns.push(btn);
    });

    subRing.appendChild(svg);
    subRing.appendChild(labels);
  }

  function chooseSub(fam, s) {
    /* 按下态在这里兜底释放：键盘 Enter、脚本 dispatch、以及"按下后
       指针在弧段外抬起"三种情况都不会走到弧段自己的 pointerup，
       不兜底就会永远停在 0.955（实测过：探针只派 pointerdown 时，
       弧段整整 800ms 卡在 matrix(0.955)）。 */
    releasePress();
    selFamily = fam.id;
    selSub = s.id;
    hoverFam = null;
    /* 必须显式清空：`is-hot` 是 paint() 按 hoverSub 重算的，
       若不清，锁类挂上后那一段仍带着上一帧的 is-hot，看起来像"锚在别的项上"。 */
    hoverSub = null;
    paint();
    onChange(fam, s);
  }

  /* --- 统一重绘 --- */
  let builtFor;
  /* 盘心标本网格状态：`grid` / `none`。首次选定小类时构建 24 格，
     之后切换小类只更新 is-selected，不重建 DOM。 */
  let builtGlyphKey = null;
  /* 盘心大类徽记当前画的是哪一族（方向 B）。与 builtGlyphKey 分开记：
     两者在同一帧里会走不同的门（落到小类时徽记退场、标本上场），
     共用一个 key 会让其中一路永远不重建。 */
  let builtEmblemKey = null;
  /* 上一层是不是"展开"状态。只用来判断这次 paint 是不是一次换层 ——
     hover 引起的重绘每天几十次，不能每次都重播一遍进出场动画。 */
  let wasOpen = null;
  let liftTimer = 0;

  /* 动画链总时长，单位 ms。数值必须 ≥ CSS 里最长的一条：
       进入 = 370（标签层起）+ 160（层淡出）= 530
       返回 = 240 + 5×20（最后一个文字延迟）+ 320（文字时长）= 660
     取 700 留 40ms 余量。写成常量而不是散落的 780：
     长度一旦与 CSS 脱钩，类会提前摘掉，末帧还没到就跳回原位。 */
  const LAYER_ANIM_MS = 700;
  /* 四视口实测的"中圈开始长"的时刻：进入动画 0ms 就起，但弧段要到
     100ms 才有可见尺寸。大圈必须在 100ms 前后明显退掉，否则就是
     用户报的"滞后边框"。下面这条注释留在代码里，防止以后有人把
     扇区的 delay 又调回"等文字全散完"。 */
  function paint() {
    const famById = new Map(families.map((f) => [f.id, f]));
    /* 只有"真的选了"才缩放并铺方格；悬停只改盘心预览。
       悬停就缩放会让指针划过时整个版面跳动，比少一个反馈更糟。 */
    const open = !!selFamily;
    /* 盘心优先级（指南 v2）：已选小类 > 已选家族 > hover 预览 > 空态。
       已选家族一旦确定，指针划过其它大圈只保留命中提示，不抢走盘心；
       未选时 hover 才临时预览该家族。 */
    const showFamId = selFamily || hoverFam;
    const showFam = showFamId ? famById.get(showFamId) : null;
    const builtKey = selFamily || null;
    if (builtFor !== builtKey) {
      buildSubRing(selFamily ? famById.get(selFamily) : null);
      builtFor = builtKey;
    }
    root.classList.toggle('is-open', open);

    /* ---- 换层只在这里发生 ----
       两类动画类（is-lifting / is-returning）只在这两个分支里挂，
       挂完 780ms 摘掉。之所以不写成"每次 paint 都重挂"：paint 由
       hover 高频调用，那样每划过一块扇区就把整盘重播一次。
       780 = 最长动画链（返回 120ms 起 + 300ms 文字 + n×16 错峰）加余量。

       为什么用类而不是 transitionend：测试桩只调监听器、不派发事件，
       写成状态机会让 test-render 里的断言链永远停在中间态（D39④ 同因）。 */
    if (wasOpen !== null && wasOpen !== open) {
      const cls = open ? 'is-lifting' : 'is-returning';
      root.classList.remove(open ? 'is-returning' : 'is-lifting');
      void root.offsetWidth;                  // 强制回流，同一个类连播两次时动画才会重跑
      root.classList.add(cls);
      if (liftTimer) clearTimeout(liftTimer);
      liftTimer = setTimeout(() => { root.classList.remove(cls); liftTimer = 0; }, LAYER_ANIM_MS);
    }
    wasOpen = open;

    outerG.forEach((g, i) => {
      const f = families[i];
      const on = f.id === selFamily;
      const hot = f.id === hoverFam;
      g.classList.toggle('is-on', on);
      g.classList.toggle('is-hot', hot && !on);
    });
    outerBtn.forEach((b, i) => {
      const f = families[i];
      const on = f.id === selFamily;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
      b.setAttribute('tabindex', on ? '0' : (i === 0 && !selFamily ? '0' : '-1'));
    });

    if (subItems) {
      /* "是哪一项"由 data-sub 决定，不靠下标：弧段顺序与子项顺序一致，
         但一旦以后要按命中率重排，下标对齐就会错位。 */
      /* 弧段与它上面那行字是两棵子树（SVG / HTML），状态必须同时挂到两边：
         只挂按钮的话填充不变，只挂组的话文字不变 —— 两种半亮都很难看。 */
      subBtns.forEach((b) => {
        const id = b.getAttribute('data-sub');
        const on = selSub === id;
        const hot = hoverSub === id;
        b.classList.toggle('is-on', on);
        b.classList.toggle('is-hot', hot && !on);
        b.setAttribute('aria-checked', String(on));
      });
      subGs.forEach((g) => {
        const id = g.getAttribute('data-sub');
        const on = selSub === id;
        const hot = hoverSub === id;
        g.classList.toggle('is-on', on);
        g.classList.toggle('is-hot', hot && !on);
      });
    }

    /* 已选小类是最高优先级；hover 只在大类未选定时参与预览。 */
    const selectedFam = selFamily ? famById.get(selFamily) : null;
    const sub = (selectedFam && selSub)
      ? (selectedFam.subfamilies || []).find((x) => x.id === selSub) : null;
    const focusSub = sub;

    /* 已选家族优先于 hover；只有完全未选时，hover 才临时预览家族名与图标。 */
    const hubFamily = selectedFam || null;
    const previewFam = !selectedFam ? showFam : null;
    let kick;
    let zh;
    let desc;
    let idle = false;
    let picked = false;
    if (!hubFamily && !previewFam) {
      kick = '香型轮盘'; zh = '还没选'; desc = '从外圈挑一个大类'; idle = true;
    } else if (previewFam) {
      kick = '香型轮盘'; zh = previewFam.zh; desc = '点一下选定'; idle = false;
    } else {
      picked = !!sub;
      kick = '已选定大类';
      zh = hubFamily.zh;
      desc = hubFamily.style || hubFamily.oneLine;
    }
    /* CSS 里的 `.sub-g:hover` 是纯样式钩子，JS 管不到 —— 选中之后
       指针划过去照样会让描边从 1px 变 1.4px、填充变白（实测）。
       所以给 root 挂一个锁类，_wheel7.css 里所有 hover 规则都写成
       `.wheel:not(.is-sub-locked) .sub-g:hover`，选中即整体失效。
       为什么不是删掉 hover 规则：未选中时它仍是必要的"哪里能点"提示，
       D41 明确要求悬停只给视觉提示、不改状态 —— 它不该被删，该被上锁。 */
    root.classList.toggle('is-sub-locked', !!selSub);
    hub.classList.toggle('is-idle', idle);
    hub.classList.toggle('is-picked', picked);
    /* 族 id 始终跟随已选大类，供盘心底色与 64px 族图标读取。 */
    if (hubFamily) hub.setAttribute('data-fam', hubFamily.id);
    else hub.removeAttribute('data-fam');
    // 整盘翻深由 root 上的 is-picked 驱动：加深的是盘，不是盘心方块
    root.classList.toggle('is-picked', picked);
    hub.classList.toggle('is-hover', !!(hoverFam || hoverSub) && !picked && !focusSub);
    if (hubZh.textContent !== zh || hubKicker.textContent !== kick) {
      hub.classList.remove('is-swap');
      void hub.offsetWidth;
      hub.classList.add('is-swap');
    }
    hubKicker.textContent = kick;
    hubZh.textContent = zh;
    hubDesc.textContent = desc;

    /* 小类确认后显示六族 24 格标本；空态/家族态不挂小类图形。
       网格只在首次确认时构建，之后只更新选中类，避免 hover 重绘闪帧。 */
    const glyphKey = focusSub ? 'grid' : 'none';
    if (glyphKey !== builtGlyphKey) {
      builtGlyphKey = glyphKey;
      hubGlyph.innerHTML = '';
      if (focusSub) hubGlyph.appendChild(hubSpecimenGrid(families, focusSub.id, (fam, sub, ev) => {
        splash(ev);
        chooseSub(fam, sub);
      }));
    }
    if (focusSub) {
      const grid = hubGlyph.querySelector('.hub-specimen-grid');
      const selectedName = subFullName(focusSub);
      grid.setAttribute('aria-label', '24 个小类标本，当前选择：' + selectedName + '。方向键移动，Enter 选择');
      grid.querySelectorAll('.hub-specimen-item').forEach((item) => {
        const on = item.getAttribute('data-sub') === focusSub.id;
        item.classList.toggle('is-selected', on);
        item.setAttribute('aria-selected', String(on));
        if (on) grid.setAttribute('aria-activedescendant', item.id);
      });
    }
    hub.classList.toggle('has-glyph', glyphKey !== 'none');

    /* ==== 大类徽记（方向 B，2026-11-23；批 3-2a 状态机）====
       已选小类时徽记退场，让盘心标本独占中心；否则已选家族优先，
       未选时才显示 hover 预览。手机点选与桌面 hover 走同一状态机。
       重建只在 key 变化时发生，避免 hover 高频重绘时图标闪帧。 */
    const emblemFam = !focusSub ? (showFam || null) : null;
    const emblemKey = emblemFam ? emblemFam.id : 'none';
    if (emblemKey !== builtEmblemKey) {
      builtEmblemKey = emblemKey;
      hubEmblem.innerHTML = '';
      if (emblemFam) {
        hubEmblem.appendChild(familyEmblem(emblemFam));
        /* data-fam 挂在常驻节点上而不是每次重建的那层：它同时是
           CSS 的钩子与测试的读数（"盘心上现在是谁的图标"），
           不需要去 <svg> 里翻渐变 id 才知道。 */
        hubEmblem.setAttribute('data-fam', emblemFam.id);
      } else {
        hubEmblem.removeAttribute('data-fam');
      }
    }
    hub.classList.toggle('has-emblem', emblemKey !== 'none');

    // 只选了大类时给快捷出口；已落到小项就没必要再催一次
    const canSkip = !!(selFamily && !selSub);
    hubGo.hidden = !canSkip;
    if (canSkip) {
      const f = famById.get(selFamily);
      hubGo.textContent = '就选「' + (f ? f.zh : '') + '」，下一步 →';
    }
    /* 悬停预览某个细分时，「中圈可不选」是第三遍同义出口：
       底部 navBar 已有「下一步」+ hint，盘心又出现主按钮（桌面）或
       这枚胶囊（窄屏）。窄屏实测 hub-skip 四角溢出 8.4px（390）/ 5px（360）。 */
    hubSkip.hidden = !canSkip;
    backBtn.hidden = !selFamily;
  }

  paint();
  return root;
}

/* --- 家族 → 底噪轴 ------------------------------------------------------------
   为什么需要这张表：v7 把"第一个大方向"重新交给了圆盘，而底噪（src/ambient.js）
   的三轴是按 emotionMap 的六个 id 定义的。这两套词表本来各说各的，中间必须有
   一次显式换算，否则"选了柑橘调"这件事没法变成"渐亮"。

   取值不是随手配的，是 emotionMap 自己给的家族权重上的一次**最大权匹配**：
   把六个家族与六个轴一一配对，让 ∑ weight(family, axis) 最大。
   穷举 6! = 720 种配法的结果就是这张表（scripts/test-render.mjs 每次重算一遍
   并断言表等于最优解，所以它不会悄悄退化成"看着像"）：

     citrus  → bright      0.95  柑橘是最亮的一族（emotionMap bright.citrus）
     fresh   → clean       0.95  刚洗完澡那种干净（clean.fresh）
     amber   → mysterious  0.95  暖而稠、不透明（mysterious.amber）
     woody   → cold        0.90  干、有骨架、收着（cold.woody）
     gourmand→ lazy        0.70  甜、贴肤、不主动（lazy.gourmand）
     floral  → warm        0.60  花在太阳底下的那一面（warm.floral）

   全部六格加起来 5.05 —— 在 720 种配法里最高（次优 5.00）。
   注意 floral 的 0.60 是六格里最低的一格，而它在 emotionMap 里对 bright(0.70)
   反而更高：匹配是**全局最优，不是逐族 argmax**。逐族取最大会把 citrus 与
   floral 都判给 bright（0.95 / 0.70），两个家族共用一个方向，底噪就分不出
   这两族了 —— 那正是"看起来接上了、实际没接"的形态，所以
   scripts/test-render.mjs 每次重算 720 种配法并断言本表等于最优解。 */
const AXIS_OF_FAMILY = {
  citrus: 'bright',
  floral: 'warm',
  woody: 'cold',
  amber: 'mysterious',
  fresh: 'clean',
  gourmand: 'lazy',
};

/* ---------- 首屏入口：卡片只切界面，不写答案 ---------- */
function entryIcon(kind) {
  const drawing = kind === 'emotion'
    ? '<path d="M8 26c5-1 7-6 7-11 4 3 6 7 5 12-1 7-7 12-15 11-8-1-12-7-10-14 1-5 5-9 10-11-1 6-1 10 3 13Z"/><path d="M17 13c2-5 6-7 11-6M15 8c1-3 3-5 6-6"/>'
    : '<circle cx="24" cy="24" r="5"/><path d="M24 5v9M24 34v9M5 24h9M34 24h9M10.6 10.6l6.4 6.4M31 31l6.4 6.4M37.4 10.6 31 17M17 31l-6.4 6.4"/>';
  return el('span', {
    class: 'entry-icon', 'aria-hidden': 'true',
    html: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">${drawing}</svg>`,
  });
}

function renderEntry() {
  const wrap = el('section', { class: 'entry-screen', 'aria-labelledby': 'entry-title' },
    el('h2', { class: 'q-title', id: 'entry-title' }, '你想怎么开始？'),
    el('p', { class: 'q-help' }, '两种选法都行，选一种就好'),
    el('div', { class: 'entry-choices', role: 'group', 'aria-label': '选择入口' },
      el('button', {
        class: 'entry-card', type: 'button', 'data-entry': 'emotion',
        onclick: () => chooseEntry('emotion'),
      }, entryIcon('emotion'),
         el('span', { class: 'entry-card-title' }, '按感觉选'),
         el('span', { class: 'entry-card-desc' }, '只答感受，不用懂香调')),
      el('button', {
        class: 'entry-card', type: 'button', 'data-entry': 'family',
        onclick: () => chooseEntry('family'),
      }, entryIcon('family'),
         el('span', { class: 'entry-card-title' }, '按香型圆盘'),
         el('span', { class: 'entry-card-desc' }, '在圆盘上点选香型方向'))
    )
  );
  return wrap;
}

/* 换入口时只清与路径绑定的答案；场合、季节等通用回答保留。
   避雷候选随入口重算，旧路径的「不要 / 没闻过」不可见地残留。 */
function clearPathAnswers() {
  const a = state.answers;
  a.family = null;
  a.subfamily = null;
  a.direction = null;
  a.emotion = null;
  a.unwanted = [];
  a.noSmell = [];
  a.dislikedNotes = [];
  a.dislikedZh = {};
  state.avoidKey = null;
}

function showEntry() {
  state.entry = null;
  state.entryMotion = false;
  state.step = 0;
  state.wishPage = false;
  render();
}

function chooseEntry(kind) {
  if (kind !== 'family' && kind !== 'emotion') return;
  const a = state.answers;
  const hasFamily = !!(a.family || a.subfamily || a.direction);
  const hasEmotion = !!a.emotion;
  const hasPathData = hasFamily || hasEmotion
    || (a.unwanted || []).length > 0 || (a.noSmell || []).length > 0
    || (a.dislikedNotes || []).length > 0 || Object.keys(a.dislikedZh || {}).length > 0
    || state.avoidKey !== null;
  /* 返回入口后 entry 会回到 null；此时按真实答案识别“同路径重选”，
     不能因为 entry 为 null 就把用户刚答的内容清掉。两边都有答案的异常态
     则按换路处理，清干净再进，避免两个入口同时生效。 */
  const samePath = state.entry === kind
    || (!state.entry && kind === 'family' && hasFamily && !hasEmotion)
    || (!state.entry && kind === 'emotion' && hasEmotion && !hasFamily);
  if (hasPathData && !samePath) clearPathAnswers();
  state.entry = kind;
  state.entryMotion = true;
  state.step = 0;
  render();
  /* render 已同步消费这次动效；立即置 false，避免 300ms 内作答重绘时
     再挂一次 .is-entering。CSS 的 animationend 只负责摘掉当前节点 class。 */
  state.entryMotion = false;
}

function isEmotionScreen() {
  return !state.wishPage && state.entry === 'emotion' && state.step === 0;
}

/* 原圆盘底部的六情绪选项搬到这里；选项、写入键与互斥规则不变。 */
/* ---------- 感觉页标本卡（Batch 4 腿 A）----------
   六种感觉各配一枚 24px 细线标本图样，只走 currentColor；
   选中描边/浅蓝底/六种动效由 .selection-fx + data-feeling 在 CSS 侧负责。 */
const FEELING_MARKS = {
  cold: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M4 7.5l16 9M4 16.5l16-9M9 5.5l3 2 3-2M9 18.5l3-2 3 2"/></svg>',
  warm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19"/></svg>',
  clean: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h7l4-3h7M3 12h7l4 3h7M3 17h7l4-3h7"/></svg>',
  mysterious: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M19 15.5A8 8 0 0 1 8.5 5 7.5 7.5 0 1 0 19 15.5Z"/><circle cx="17.5" cy="5.5" r=".9"/></svg>',
  bright: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="12" r="2.5"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5M5.6 5.6l3.5 3.5M14.9 14.9l3.5 3.5M18.4 5.6l-3.5 3.5M9.1 14.9l-3.5 3.5"/></svg>',
  lazy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 15c4-6 10-8 18-6M3 19c5-5 11-6 18-4M6 9c3-3 6-4 9-3"/></svg>',
};

/* 两列三行标本卡。保留 .seg / .seg-item 锚点（既有测试与样式都认它），
   只把一行等宽分段换成 2×3 网格。选中不整屏重绘：进场只播一次；
   点选的 160ms 缩放由本地 is-tapped 触发，不会被 render() 抹掉。 */
function feelingCards(opts, current, onPick, slot) {
  const box = el('div', { class: 'seg feeling-cards', role: 'radiogroup', 'aria-label': '按感觉选' });
  const btns = [];
  const paint = (id) => {
    btns.forEach((b) => {
      const mine = String(b.getAttribute('data-id')) === String(id);
      b.classList.toggle('is-on', mine);
      b.classList.remove('fx-play');
      b.setAttribute('aria-checked', String(mine));
      b.setAttribute('tabindex', mine ? '0' : '-1');
    });
    updateSegHint(slot, opts, id);
  };
  opts.forEach((o, i) => {
    const on = current != null && String(current) === String(o.id);
    const b = el('button', {
      class: 'seg-item feeling-card' + (on ? ' is-on' : ''),
      type: 'button', role: 'radio', 'aria-checked': String(on),
      'data-id': o.id, 'data-feeling': o.id,
      tabindex: on || (current == null && i === 0) ? '0' : '-1',
      onclick: () => {
        onPick(o.id);
        paint(o.id);
        b.classList.remove('is-tapped', 'fx-play');
        void b.offsetWidth;
        b.classList.add('is-tapped', 'fx-play');
      },
      onkeydown: (ev) => {
        let d = 0;
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') d = 1;
        else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') d = -1;
        else return;
        ev.preventDefault();
        const to = (i + d + opts.length) % opts.length;
        onPick(opts[to].id);
        paint(opts[to].id);
        btns[to].classList.remove('fx-play');
        void btns[to].offsetWidth;
        btns[to].classList.add('fx-play');
        btns[to].focus();
      },
    },
      el('span', { class: 'feeling-mark', 'aria-hidden': 'true', html: FEELING_MARKS[o.id] || '' }),
      el('span', { class: 'feeling-label' }, o.zh),
      el('span', { class: 'selection-fx', 'aria-hidden': 'true' })
    );
    btns.push(b);
    box.appendChild(b);
  });
  return box;
}

function renderEmotion() {
  const wrap = el('div', { class: 'emotion-screen' },
    el('div', { class: 'stage-lead' },
      el('div', { class: 'q-kicker' }, '第 1 步 / 共 ' + curSteps().length + ' 步'),
      el('h2', { class: 'q-title' }, '你现在最想要哪种感觉？'),
      el('p', { class: 'q-help' }, '不用想香调，选最接近的感受'))
  );
  const opts = (TAX.emotionMap || []).map((e) => ({ id: e.id, zh: e.zh, desc: e.desc }));
  /* #1 气味描述槽与 #2-感觉试香标签是同一个节点：只建一次，点击同步换文。 */
  const slot = el('p', { class: 'seg-hint feeling-label-slot' });
  wrap.appendChild(feelingCards(opts, state.answers.emotion, (id) => {
    state.answers.emotion = id;
    state.answers.family = null;
    state.answers.subfamily = null;
    state.answers.direction = null;
    ensurePerfumes().catch(() => {});
    applyAmbient();
    refreshNav('emotion');
  }, slot));
  wrap.appendChild(slot);
  updateSegHint(slot, opts, state.answers.emotion);
  wrap.appendChild(navBar('emotion'));
  return wrap;
}

/* ---------- 第 1 步：香型轮盘（外圈家族 + 中圈子家族）---------- */
function renderFamily() {
  const wrap = el('div', { class: 'fade-in' });

  /* ==== 背景同心圆环（曾在此挂 .plate-bg）—— 2026-11-24 复查反馈第 2 条已删 ====
     它原先是"以盘心为圆心、铺满视口的极淡同心圆环"（9614f1e 引入），
     圆心由 buildWheel 量盘心后写进 --plate-cx/--plate-cy。
     Eddie 判定页面背景多出的几圈圆轮装饰要全部移除、恢复加环之前的背景，
     所以这个节点连同它的测量代码一起删掉了。
     **盘本身没有跟着变**：六族瓦片、中圈、盘心、24 枚标本都在原位。
     要恢复的话是两条（节点 + layoutRim 的测量），别只加一条 ——
     只有节点没有圆心，环会以视口 50%/52% 为圆心，与盘错开。 */

  /* ==== 页顶流：「← 重选大类」的容器（2026-11-24 裁决 A）====
     它原来是 .wheel 的子节点、用 JS 算出的百分比钉在 218° 盘沿上。
     中圈标签胶囊化之后，那个位置在展开态压住 −120° 的标签 36–46%，
     而圆盘上没有第二个能避开六个大类标签的落点 —— 所以胶囊出盘、进这一行。

     这一行为什么是 .stage-lead 的**第一个孩子**、而不是它的前一个兄弟：
     10-foundation 在 ≤620 给 .stage-lead 写了 margin-top: 14px，它与
     .progress-meta 的 margin-bottom 是**折叠**关系（取 24）。在两者之间插一个
     空块会切断折叠，多出 14px —— 实测 390 宽 idle 页高 1451 → 1465。
     放进 stage-lead 里面就没有这段折叠可切：同一行，idle 逐像素不变。

     行的顺序在 stage-lead 内部：胶囊 → 第 1 步 → 先闻方向，
     读起来是"回上一层"在前，标题在后。 */
  const stageTop = el('div', { class: 'stage-top' });

  wrap.appendChild(el('div', { class: 'stage-lead' },
    stageTop,
    el('div', { class: 'q-kicker' }, stepHead('family').kicker),
    el('h2', { class: 'q-title' }, stepHead('family').title),
    el('p', { class: 'q-help' }, stepHead('family').help)
  ));

  /* 恢复旧会话时，跨大类的 subfamily 是无效状态。先纠正这一旧值，再交给
     buildWheel 的同一门控；不改变正常恢复、问卷顺序或打分输入。 */
  const restoredFamily = state.answers.family
    ? Object.values(TAX.families).find((fam) => fam.id === state.answers.family) || null : null;
  if (state.answers.subfamily && (!restoredFamily
    || !(restoredFamily.subfamilies || []).some((sub) => sub.id === state.answers.subfamily))) {
    state.answers.subfamily = null;
  }

  wrap.appendChild(buildWheel({
    families: Object.values(TAX.families),
    backHost: stageTop,
    selFamily: state.answers.family,
    selSub: state.answers.subfamily,
    onChange: (fam, sub) => {
      state.answers.family = fam ? fam.id : null;
      state.answers.subfamily = sub ? sub.id : null;
      /* 两条入口互斥：选了家族就清掉情绪，否则 buildProfile 会以家族为准，
         而界面上「用感觉选」还亮着，用户以为自己两条都算数。 */
      if (fam) state.answers.emotion = null;
      /* 用户已经给出方向，下一屏避雷立刻要算候选：在这里把香水库先拉起来，
         避免进了避雷屏还停在零卡占位态。仍是按需加载，不在 boot 预热。 */
      if (fam) ensurePerfumes().catch(() => {});
      /* ==== v7 第 1 步唯一的增量：把"大方向"喂给底噪 ====
         ① 方向：家族 → 六轴（AXIS_OF_FAMILY）。只写 direction，**不写
            temperature / sweetness / characterTags** —— 那三个是打分的因子，
            a39e498 的圆盘从来不写它们（当年那屏没有"气质反推"这套东西，
            它是 v6 为情绪屏新加的）。写进去就等于让"恢复圆盘"顺带改了
            推荐口径，而任务书要求「不得让恢复圆盘改变推荐结果的计算口径」。
            所以这里只点亮背景层，不碰引擎。
         ② 立刻生效：盘是"选了不跳屏"的（用户可能还要在中圈再收一层），
            所以不会经过 render()，而 applyAmbient() 只在 render() 末尾调。
            不在这里补一次，用户点完扇区会看到"什么都没发生"，
            直到按「下一步」才突然亮起来 —— 那正是"没接上"的样子。
            底噪起点的算术在 src/ambient.js 的 ambientOf 里（圆盘来源从第 1 屏起算）。
         ③ 清空：用户点「← 重选大类」时 fam 为 null，方向必须一起清掉，
            否则盘心回到"还没选"、背景却还亮着上一族的光。 */
      state.answers.direction = fam ? (AXIS_OF_FAMILY[fam.id] || null) : null;
      applyAmbient();
      // 轮盘是两层，选完不该立刻跳走——用户可能还想在中圈再收一层。
      // 所以这里只更新家族说明区与底部按钮，前进由按钮控制。
      paintFamilyPanel(fam);
      // 底部按钮必须跟着重画：它的 disabled 与提示语都取决于"选了没有"。
      // 只改 state 不重画的话，用户选完家族按钮还是灰的，看着像坏了。
      refreshNav('family');
    },
  }));

  /* 主路径先给圆盘与下一步；按感觉入口已移到首屏中央，不再藏在底部。 */
  wrap.appendChild(navBar('family'));

  /* 第 6 屏「整族排除」在家族入口下**不出现**（实测 0/30 组合改变 top-3，
     见 STEPS 里 dislikedFamilies 的 when）。但这里必须告诉用户它去哪了 ——
     否则从情绪入口来的用户会发现自己少了一屏，以为出了 bug；
     而家族入口的用户则完全不知道"整族划掉"这个能力存在。
     说清两件事：① 你选的大类已经天然排除了别的族；② 真想排除就去点香调。 */
  if (state.answers.family) {
    wrap.appendChild(el('div', { class: 'term-note' },
      '下一屏可点名不要的香调，如“不要香草”。'
    ));
  }

  // 详情放按钮之后：先让用户能立刻前进，再给"这个大类是什么"的补充阅读。
  // 反过来放的话，一选中家族说明区就把"下一步"顶到折叠线以下，
  // 桌面 1440×900 实测按钮落在 1131px 处，必须滚动才点得到。
  wrap.appendChild(familyPanel(state.answers.family));
  return wrap;
}

/** 轮盘右侧/下方的家族详情：代表香材、风格、适用场景、注意事项。 */
function familyPanel(famId) {
  const box = el('div', { class: 'fam-panel', 'aria-live': 'polite' });
  box.__paint = (fam) => {
    box.innerHTML = '';
    if (!fam) {
      box.classList.add('is-empty');
      box.appendChild(el('p', { class: 'fam-empty' }, '上面转盘里挑一个大类，这里会展开它的代表香材、风格和使用场合'));
      return;
    }
    box.classList.remove('is-empty');
    box.appendChild(el('div', { class: 'fam-head' },
      el('span', { class: 'fam-group' }, GROUP_ZH[fam.group] || ''),
      el('h3', { class: 'fam-title' }, fam.zh),
      el('span', { class: 'fam-en' }, fam.en)
    ));
    box.appendChild(el('p', { class: 'fam-style' }, fam.style || fam.oneLine));

    const rows = [
      ['代表香材', (fam.representativeNotes || []).map((n) => noteZhOf(n)).join('、')],
      ['三个特征', (fam.traits || []).join(' · ')],
      ['常用在哪', (fam.scenes || []).join(' · ')],
      ['怎么用', fam.wear || ''],
      ['谁该绕开', fam.avoid || ''],
    ];
    const dl = el('dl', { class: 'fam-rows' });
    for (const [k, v] of rows) {
      if (!v) continue;
      dl.appendChild(el('dt', {}, k));
      dl.appendChild(el('dd', {}, v));
    }
    box.appendChild(dl);
  };
  box.__paint(TAX.families.find((f) => f.id === famId) || null);
  return box;
}

function paintFamilyPanel(fam) {
  const box = document.querySelector('.fam-panel');
  if (box && box.__paint) box.__paint(fam);
}

const GROUP_ZH = { fresh: '清新系', floral: '花香系', woody: '木质系', amber: '琥珀系', gourmand: '美食系' };

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
  { id: 'eau-de-cologne', zh: '古龙水 EDC', desc: '香精浓度约 2–4%；留香 1–3 小时，随时补喷，夏天最舒服' },
  { id: 'eau-de-toilette', zh: '淡香水 EDT', desc: '香精浓度约 5–15%；留香 3–5 小时，日常通勤主力' },
  { id: 'eau-de-parfum', zh: '淡香精 EDP', desc: '香精浓度约 15–20%；留香 5–8 小时，一瓶顶一天' },
  { id: 'parfum', zh: '香精 Parfum', desc: '香精浓度约 20–30%；留香 8 小时以上，一两喷就够' },
];

/* 类型只改变散发展示，不参与打分：以“适中”档现有外圈为基准，
   EDC / EDT / EDP / Parfum = 0.6 / 0.8 / 1.0 / 1.25。
   浓度页的旧粒子场已在 Batch 5 B5 删除；这里只保留范围、透明度与 Parfum 脉冲。 */
const CONCENTRATION_FX = {
  'eau-de-cologne': { factor: .6, opacity: .35 },
  'eau-de-toilette': { factor: .8, opacity: .5 },
  'eau-de-parfum': { factor: 1, opacity: .65 },
  'parfum': { factor: 1.25, opacity: .8, pulse: true },
};

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

/* ============================================================
   第 1 屏：预算（标本签的价签行）
   ------------------------------------------------------------
   ==== 内容隐喻 ====
   预算不是"填一个数字"，是**从货架上取下一个价位区间**。
   所以交互不是输入框，是四枚价签横排：每枚写着区间与"这一档已知价几瓶"，
   选中时价签的下沿像被剪开一样翻起 —— 剪口是标本签的固有形态
   （挂绳穿过的地方），也是这一屏唯一属于它的效果。

   ==== 价签上的数（leg6 重设计，2026-11-26）====
   每枚具体档只标一个数：「已知价 N 瓶」，N = 该档已知价瓶数，等于
   poolForBudget 该档池子大小（口径与推导见 bandKnownCount）。不写数字，
   "300 元以内"看起来和"1200 元以上"一样大；写了数字，用户立刻看见
   152 vs 165 —— 四档是**等量级**的。N<3 的档标「只有 N 瓶」并变浅（is-low），
   仍可选；选中它时主按钮改成「看 N 瓶 + 2 瓶稍超预算的」（budgetCtaText）。
   622 / 1388 两个全库总数从屏上撤掉：它们与"这一档有几瓶"无关。

   ==== 为什么价位未知的瓶子在具体档里不参与 ====
   见 poolForBudget() 的注释。屏上只留一行说明把这个事实写出来：
   「价位未知的 766 瓶只在『不限』里出现」。用户可以接受"少了 766 瓶"，
   不能接受"选 300 以内却推荐 3000 元的"。结果若真的放宽了预算，
   结果页顶部明示（budgetRelaxInfo），不再悄悄放宽。
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
  const anyId = (idx && idx.anyId) || 'any';
  /* 「不限 / 还不知道」永远在最后：它是退路，不该出现在第一个位置
     —— 第一个位置会被读成"推荐选项"。
     每枚具体档只标一个数：「已知价 N 瓶」（口径见 bandKnownCount）。
     N<3 的档标「只有 N 瓶」并加 is-low 变浅，但仍可选。 */
  const opts = [...bands.map((b) => ({ id: b.id, zh: b.zh, n: bandKnownCount(b.id) })),
    { id: anyId, zh: '不限 / 还不知道', n: null }];

  /* 3-6 钱袋标尺：横向纸币带 + ¥ 水印 + 面额刻度（与 bands 一一对应）。
     纯装饰（aria-hidden）：刻度取 bands 的 lo/hi，不引入 622/1388 等全库总数。 */
  wrap.appendChild(el('div', { class: 'money-ruler', 'aria-hidden': 'true' },
    el('span', { class: 'money-watermark' }, '¥'),
    el('div', { class: 'money-scale' },
      ...bands.map((b) => el('span', { class: 'money-tick' },
        b.hi != null ? `${b.lo}–${b.hi}` : `${b.lo}+`)))));

  /* ==== 预算存折（Batch 5 腿 B5-3 重做，2026-11-28）====
     Batch 4 的存折只有一行淡标签：没有折页形态、没有账本线、没有盖章，
     选了 600–1200 元之后屏幕上没有任何"这一档被记下来了"的痕迹 ——
     Eddie 的原话是「没感觉，选了也没有签订感」。

     ==== 拆成两条，各自独立验收 ====
     (a) 折页外观（静态，看全屏原图就够）：
         暖白纸 + 折脊（两条紧邻竖线，双线即装订处）+ 账本横线
         （repeating-linear-gradient，只在折脊右侧的书写区画）
         + 右上折角。选中的档写进折页正文（.budget-passbook-value）。
         账本线与章纹都压到 --passbook-rule（比正文浅一档），
         任何一条都不许抢正文：正文用 --spec-ink 700 字重，
         线与章只用它当描边/浅底。
     (b) 选择确认反馈（动态，必须看连续录屏）：
         一次"记账"= 折页自下滑出（300ms）→ 章落下（220ms）。
         **两段在时间上重叠 100ms，但视觉上是串行的两拍**，如实写清：
           折页 t=0 起，translateY(14px)+opacity .55，300ms 线性时长，
             但缓动是 (.2,.7,.25,1)——快起慢收，t=200ms 时已走完 97%
             （实测残余位移 0.39px / 14px），肉眼已读作"到位"。
           章 t=190ms 起（delay），220ms 落完，t=410ms 整体静止。
         所以"折页先到位、章再砸下来"这个因果是真的，但**不是零重叠**：
         章起跳时折页还在走最后 3%（约 100ms 尾段）。
         为什么允许这 100ms：零重叠（章 delay 300ms）总时长会变成 520ms，
         比现在慢 110ms，而用户在这一屏的平均停留只有几秒 ——
         多出的等待换不来可读性，因为折页最后 3% 的位移本来就看不出。
         为什么不干脆并行（章 delay 0）：那样章在折页还在移动 86% 时
         就砸下来，两处同时在动，读不出"先记一笔、再盖章"的因果。
         实测时序见 _probe/b5/evidence/seq/*.timeline.json。

     ==== 状态表（六态，每态都要验）====
         未选      折页写当前值（默认「不限 / 还不知道」，即 state 的既有缺省），
                   不盖章：没有选择就没有确认，不能凭空盖一个"已记下"。
         首次选择  折页滑出 + 换值 + 盖章，三段因果可读。
         切换      值先换成新档，同一套动作重播一次（章重新砸下来）。
                   旧章不单独做退场动画：重播本身就是"旧的那枚被新的盖过去"，
                   再加一段淡出会让切换比首次选择慢一拍，而两者在语义上同级。
         返回已选  只呈现终态：折页有值、章在位，不播动画。
                   （回到这一屏不是一次新的选择，重播会把"刚才是你选的"
                   演成"刚刚有人又选了"。）
         重复点击  点已选中的那一档＝一次新的确认动作，照常盖章；
                   文案不换（值没变），但章重新落下 —— 这是"我又确认了一次"。
         快速连点  只认最后一档。

     ==== 怎么避免旧动画覆盖新值 ====
     ① 值先写、类后加：label/章文字在挂动画类之前就已经是最终值，
        动画只改 transform/opacity，不参与写值，所以"动画播到一半值被改"
        这件事在结构上不可能发生。
     ② 每次重播前 remove → 强制回流（void offsetWidth）→ add，
        浏览器会丢弃上一条未完成的 animation，不会有排队播放中间档。
     ③ 章用 `animation-fill-mode: both`，且终态由 CSS 的静态规则兜底
        （不是只靠 animationend），所以被打断时章不会停在半空。
     ④ 用递增的 data-stamp-seq 标记"这是第几次"，纯用于 DOM 侧与测试核对；
        animationend 只在序号仍是最新时才摘 is-playing，避免旧的
        animationend 摘掉新动画的类。

     ==== 「签订感」的定义 ====
     本地选择确认：值被写进折页、章落在折页上，两者与当前选择一致。
     **不新增任何承诺或提交语义**：没有服务端记录、没有"已下单"、
     没有把预算写进 localStorage，离开本屏它就只是 state.answers.budget。
     「不限 / 还不知道」同样原样写进折页并盖章 —— 它是合法答案，
     不是"没答"，所以不享受"跳过确认"的待遇。 */
  const selected = opts.find((o) => o.id === (state.answers.budget || 'any')) || opts[opts.length - 1];
  const passbookLabel = el('span', { class: 'budget-passbook-value' }, selected.zh);
  /* 章内文字：由档位数据算出紧凑写法，不从 zh 字符串里瞎截 ——
     截字符串会让「1200 元以上」变成「1200 元以」，读起来是另一个意思。
     「不限 / 还不知道」缩成「不限」：它是合法答案，占章位，但两个字就够。
     完整值始终在折页正文里，章只是它的印，不是第二处真相。 */
  const stampWordOf = (opt) => {
    if (!opt) return '';
    if (opt.id === anyId) return '不限';
    const b = bands.find((x) => x.id === opt.id);
    if (!b) return opt.zh.replace(/\s*元\s*/g, '').replace(/\s+/g, '');
    if (b.hi == null) return `≥${b.lo}`;
    if (!b.lo) return `≤${b.hi}`;
    return `${b.lo}–${b.hi}`;
  };
  const stampText = el('span', { class: 'budget-stamp-text' }, stampWordOf(selected));
  /* data-stamp-value 承载**完整值**（不是章上那串缩写）：
     「章与当前值一致」这条验收要能直接从 DOM 读，不靠看图比字。 */
  const stamp = el('span', {
    class: 'budget-stamp',
    'aria-hidden': 'true',
    'data-stamp-value': selected.zh,
  }, el('span', { class: 'budget-stamp-ring' }, stampText));
  const passbook = el('div', { class: 'budget-passbook', 'aria-hidden': 'true', 'data-stamp-seq': '0' },
    el('span', { class: 'budget-passbook-head' }, '预算'),
    passbookLabel,
    stamp);
  wrap.appendChild(el('div', { class: 'budget-passbook-slot', 'aria-hidden': 'true' }, passbook));
  const reduceMotion = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };
  /* 未选态：折页在位、写着缺省值（与价签的缺省选中态一致），但不盖章 ——
     没选择就没有确认。判据用 state.budgetPicked 而不是"值是否等于 any"：
     用户点了「不限 / 还不知道」时值是 any，但那是**选过**的，要盖章。 */
  if (!state.budgetPicked) {
    passbook.classList.add('is-unset');
  }
  let stampSeq = 0;
  const replayPassbook = (opt) => {
    stampSeq += 1;
    const seq = String(stampSeq);
    passbookLabel.textContent = opt.zh;
    stampText.textContent = stampWordOf(opt);
    stamp.setAttribute('data-stamp-value', opt.zh);
    passbook.setAttribute('data-stamp-seq', seq);
    passbook.classList.remove('is-unset');
    if (reduceMotion.matches) {
      /* 减弱动态：终态直接成立。不滑、不缩放、也不延时后才可见 ——
         值已经写进去了，章就在那儿。 */
      passbook.classList.remove('is-playing', 'is-stamping');
      return;
    }
    passbook.classList.remove('is-playing', 'is-stamping');
    void passbook.offsetWidth;
    passbook.classList.add('is-playing', 'is-stamping');
    passbook.addEventListener('animationend', function done(ev) {
      if (ev.animationName !== 'budgetPassbookSlide') return;
      passbook.removeEventListener('animationend', done);
      /* 只有序号仍是最新时才摘类：旧动画的 animationend 迟到时
         不许把新动画的类摘掉（否则新章会停在半空）。 */
      if (passbook.getAttribute('data-stamp-seq') !== seq) return;
      passbook.classList.remove('is-playing');
    });
  };

  const row = el('div', { class: 'price-row', role: 'radiogroup', 'aria-label': '价位区间' });

  /* 主按钮文案随选择走（任务第 2 条）。按钮由 navBar('budget') 画出，
     带 .js-budget-cta 钩子；这里选中后原地改文案，不整屏重画。 */
  const paintCta = () => {
    const cta = wrap.querySelector('.js-budget-cta');
    if (cta) cta.textContent = budgetCtaText(state.answers.budget || 'any');
  };
  /* 文案二轮裁决全局问题 4：数字只在有数据时说，不写死兜底值。 */
  const unknown = idx && idx.stats && idx.stats.unpriced != null ? idx.stats.unpriced : null;

  for (const o of opts) {
    const on = (state.answers.budget || 'any') === o.id;
    const low = o.n != null && o.n < 3;
    row.appendChild(el('button', {
      class: 'price-tab' + (on ? ' is-on' : '') + (low ? ' is-low' : ''),
      type: 'button',
      role: 'radio',
      'aria-checked': String(on),
      'data-budget': o.id,
      onclick: () => {
        state.answers.budget = o.id;
        state.budgetPicked = true;
        replayPassbook(o);
        [...row.children].forEach((c) => {
          const mine = c.getAttribute('data-budget') === o.id;
          c.classList.toggle('is-on', mine);
          c.setAttribute('aria-checked', String(mine));
        });
        paintCta();
      },
    },
      /* 剪口：一枚小三角，选中时翻起。用 span 而不是伪元素，
         因为要能被读屏忽略（aria-hidden）。 */
      el('span', { class: 'price-notch', 'aria-hidden': 'true' }),
      el('span', { class: 'price-coin', 'aria-hidden': 'true' }, '¥'),
      el('span', { class: 'price-zh' }, o.zh),
      o.n != null ? el('span', { class: 'price-n' }, low ? `只有 ${o.n} 瓶` : `已知价 ${o.n} 瓶`) : null
    ));
  }
  wrap.appendChild(row);

  /* 只留一行说明（任务第 3 条）：价位未知的瓶只在「不限」里出现。
     文案二轮裁决全局问题 4：有数据才报数，没有数据就不写死兜底值。
     Batch 4 腿 E：两行共用一条发丝线与短金竖线，作为卡组下方的账本脚注。 */
  const ledgerNotes = el('div', { class: 'budget-ledger-notes' });
  ledgerNotes.appendChild(el('p', { class: 'price-note' }, unknown != null
    ? `价位未知的 ${unknown} 瓶只在「不限」里出现`
    : '价位未知的瓶子只在「不限」里出现'));

  /* 3-6 纸条小字：已核实 budget 只在 poolForBudget 圈池、不进 scoringAnswers
     （src/scoring.js 无 budget），『不参与打分』属实。用独立类 .price-disclaimer，
     不占 .price-note，守住『预算屏只留一行 .price-note』的既有断言。 */
  ledgerNotes.appendChild(el('p', { class: 'price-disclaimer' }, '价格只筛范围，不参与打分'));
  wrap.appendChild(ledgerNotes);

  wrap.appendChild(navBar('budget'));
  paintCta();
  return wrap;
}


/* ============================================================
   生活短语（「想要的味道 / 受不了的味道」两屏的题面口径）
   ------------------------------------------------------------
   **渲染器已按 v7 定版删除**（feat/quiz-v7-step3-restructure 第 ② 步）：
   「想要的味道」屏的薄壳与两屏共用的生活短语渲染器一并退场，屏上不再有
   那套「已收下 / 未收下」双态卡片网格。
   剩下的避雷屏（`renderAvoid`）自绘卡片墙，读的是同一张场景句表。

   这一段规格注释放这里不删，因为它约束的是**避雷屏的题面**：
   `renderAvoid` 仍在用 `LIFE_NOTES`（= AVOID_SCENARIOS）里那批
   zh / hint，只是问法从"想要"翻成"不要"。

   ==== 为什么不用香材名 ====
   规格底线：全程无香调术语题。上一版列的是「佛手柑 / 零陵香豆 /
   橡苔」—— 一个零基础用户既不认识这些词，也无法判断自己喜不喜欢。
   它们不是"选项"，是考卷。

   ==== 为什么仍然是"点名具体东西"而不是"挑一个大类" ====
   引擎侧 likedNotes 是 +14、dislikedNotes 是 **-40**。这两个因子之所以有效，
   恰恰因为它们是具体的：点「香草」只命中含香草的瓶，点「甜的」等于没点。
   所以术语必须消失，**具体性不能消失** —— 生活短语就是这两件事的交点：
   「刚剥开的橘子皮」任何一个人都能判断，同时精确对应 bergamot/lemon/grapefruit。
   ============================================================ */


/* 把短语状态同步到引擎认识的两个字段。
   这是整条映射层的唯一写入口 —— 别处不许直接写 likedNotes/dislikedNotes，
   否则漏一次同步就会出现"界面上勾了、引擎不知道"。

   v7 第 ② 步起「想要的味道」屏已删（见上），所以 `answers.wanted` 恒为 `[]`
   → `likedNotes / likedZh` 恒为空 → 引擎的 `likedNotes` 因子整条跳过，
   与"用户当年跳过那一屏"逐位一致。键不删：`renderAvoid.toggle` 的互斥摘除
   仍读它（见该函数），删键会让那处从「空集」变成「undefined」。 */
function syncPhrasesToNotes() {
  state.answers.likedNotes = notesOfPhrases(state.answers.wanted);
  state.answers.dislikedNotes = notesOfPhrases(state.answers.unwanted);
  state.answers.likedZh = zhOfPhrases(state.answers.wanted);
  state.answers.dislikedZh = zhOfPhrases(state.answers.unwanted);
}

/* ============================================================
   第 2 屏：动态避雷（feat/quiz-v7-step2-avoid）
   ------------------------------------------------------------
   与「想要」屏共用同一套场景句（LIFE_NOTES = AVOID_SCENARIOS），
   但问法相反、候选也相反：

     · 候选不是固定 18 张，而是 src/avoid.js 按当前方向现算的模糊带，
       封顶 6 张；算不出时 curSteps() 已把整屏抽掉，走不到这里。
     · 写回的仍是 answers.unwanted → dislikedNotes（-40 硬惩罚），
       映射层的唯一写入口 syncPhrasesToNotes 不变。

   没上屏的低频模糊元素不硬排除：finish() 把 plan.softNotes 交给
   recommend 的 opts.avoidSoftNotes，引擎乘 0.94 软降权（结果池门不动）。
   ============================================================ */
function renderAvoid() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('unwanted');
  wrap.appendChild(el('div', { class: 'avoid-skip-row' },
    el('button', {
      class: 'avoid-skip',
      type: 'button',
      onclick: () => {
        state.answers.unwanted = [];
        state.answers.noSmell = [];
        syncPhrasesToNotes();
        next();
      },
    }, '都能接受，跳过这步')
  ));
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));
  wrap.appendChild(el('p', { class: 'avoid-tip' },
    '没闻过就点「没闻过」；点卡＝不要'));

  const plan = avoidPlanNow();
  /* 数据没到齐（或方向还没定）：先占位。
     ==== 性能腿（2026-11-19）：这里同时是 perfumes.json 的第一个真实消费点 ====
     avoidPlanNow() 要按香水库算模糊带，而 boot() 已不再预热香水库
     （见"启动"那一节的注释），所以这一屏自己把请求拉起来。
     加载态沿用既有的占位句（不新造 UI）；到货后**只在用户仍停在这一屏**时重画一次，
     已翻走的就不打扰。守卫条件是 `avoidPlanNow()` 真的能算出 plan ——
     方向还没定时它仍是 null，那时不该重画（重画会再进这个分支，变成自旋）。 */
  if (!plan) {
    wrap.appendChild(el('p', { class: 'avoid-empty' }, '正在按你选的方向，算最容易踩雷的几个…'));
    wrap.appendChild(navBar('unwanted'));
    ensurePerfumes()
      .then(() => {
        const app = $('#app');
        if (app && app.dataset.step === 'unwanted' && avoidPlanNow()) render();
      })
      .catch(() => { /* 库读不到：占位句留着，finish() 会如实报错 */ });
    return wrap;
  }
  pruneAvoid(plan);

  /* ---- 「已选方向」锚点（qoder/avoid-capsule，纯展示）----
     过渡元素，不是过渡页：这一屏的题是按用户刚在圆盘上选的方向现算的，
     把那个方向胶囊（图标 + 名字）原样带到屏顶，一眼接上"接着你的选择在问"。
     方向判据与出题**同源** —— avoidDirection 就是 avoidPlan 内部用的那个
     directionOf，锚点显示的方向和题目依据的方向不可能分叉。
     不新增交互：没有 onclick / href，tabindex="-1" 让它退出 Tab 序，
     名字进 aria-label（读屏能听到方向），图标与小字引导是装饰层。
     图标与盘心同一套：落到小类＝那枚代表香材标本，只选大类＝大类徽记
     （盘心徽章同款，方向 B）；情绪入口没有落点时退到大类徽记。 */
  const dir = avoidDirection(state.answers, TAX);
  const dirFam = dir ? (TAX?.families || []).find((f) => f.id === dir.family) : null;
  if (dir && dirFam) {
    const dirSub = dir.subfamily
      ? (dirFam.subfamilies || []).find((s) => s.id === dir.subfamily) : null;
    const zh = dirSub ? (dirSub.zh || dirSub.id) : (dirFam.zh || dirFam.id);
    const art = dirSub ? artPath(dirSub.id) : famArtPath(dirFam.id);
    wrap.appendChild(el('div', {
      class: 'avoid-anchor',
      'data-dir': dir.family + (dir.subfamily ? '|' + dir.subfamily : ''),
      'aria-label': '已选方向：' + zh,
      tabindex: '-1',
    },
      el('span', { class: 'avoid-anchor-kicker', 'aria-hidden': 'true' }, '已选方向'),
      anchorArt(art),
      el('span', { class: 'avoid-anchor-name' }, zh)
    ));
  }

  const wall = el('div', { class: 'avoid-wall', role: 'group', 'aria-label': '最容易踩雷的几个' });
  const count = el('p', { class: 'avoid-count' });
  const excluded = el('p', { class: 'avoid-excluded' });
  const gloss = el('p', { class: 'avoid-gloss is-idle' });

  /* 当前两列选中态的一次读取。两列互斥由 avoidSelection 保证（不要优先），
     所以界面与引擎看到的是同一份判据，不会出现"卡上标了没闻过、引擎却扣了分"。 */
  const selNow = () => avoidSelection(
    { unwanted: state.answers.unwanted || [], noSmell: state.answers.noSmell || [] },
    plan.cards.map((c) => c.id),
  );

  /* 卡片的三种视觉态（未选 / 不要 / 没闻过）统一在这里落地：
     两个开关各自 aria-pressed、卡面挂 is-on 或 is-unknown。
     点完就地改，不重建整墙（重建会让被点的节点消失、焦点掉回 body）。 */
  const paintCard = (id) => {
    const s = selNow();
    const on = s.unwanted.includes(id);
    const off = s.noSmell.includes(id);
    const row = wall.querySelector(`[data-row="${id}"]`);
    if (!row) return;
    const card = row.querySelector('.avoid-card');
    const nope = row.querySelector('.avoid-nope');
    card.classList.toggle('is-on', on);
    card.classList.toggle('is-unknown', off);
    card.setAttribute('aria-pressed', String(on));
    nope.classList.toggle('is-on', off);
    nope.setAttribute('aria-pressed', String(off));
    /* 没闻过的卡不再盖「这个不要」章 —— 两枚章叠在同一张卡上是自相矛盾的陈述。 */
    card.setAttribute('data-state', on ? 'on' : off ? 'unknown' : 'idle');
  };

  const paintMeta = () => {
    const s = selNow();
    const parts = [];
    if (s.unwanted.length) parts.push(`已标 ${s.unwanted.length} 个「这个不要」`);
    if (s.noSmell.length) parts.push(`${s.noSmell.length} 个「没闻过」`);
    count.textContent = parts.length
      ? parts.join('，')
      : '一个都没点＝这几个都接受';

    /* 已排除清单（Eddie 批准第 2 条）：把"我到底排除了什么"从记忆里搬回屏上。
       名字本身就是撤销按钮 —— 用户看到"我误伤了玫瑰"时，最短的补救路径是
       直接点这个名字，而不是先找到那张卡再点两下。 */
    excluded.textContent = '';
    /* 用 firstChild/removeChild 逐个清而不是 `textContent = ''`：
       两者语义等价，但 test-render 的 DOM 桩里 `textContent = ''` 会把 _text
       置成空串并让后续 appendChild 的文本读不回来 —— 那是桩的简化，
       不是浏览器行为。清子节点用的是标准 DOM 方法，两边都成立。 */
    while (excluded.firstChild) excluded.removeChild(excluded.firstChild);
    const names = s.unwanted
      .map((id) => LIFE_NOTES.find((x) => x.id === id))
      .filter(Boolean);
    if (!names.length) {
      excluded.classList.add('is-idle');
      excluded.textContent = '已排除：无';
    } else {
      excluded.classList.remove('is-idle');
      excluded.appendChild(document.createTextNode('已排除：'));
      names.forEach((d, i) => {
        if (i) excluded.appendChild(document.createTextNode('、'));
        excluded.appendChild(el('button', {
          class: 'avoid-undo',
          type: 'button',
          'data-undo': d.id,
          'aria-label': `取消排除「${d.zh}」`,
          onclick: () => {
            const cur = state.answers.unwanted || [];
            const at = cur.indexOf(d.id);
            if (at >= 0) cur.splice(at, 1);
            syncPhrasesToNotes();
            paintCard(d.id);
            paintMeta();
            /* 撤销后这个名字会从清单里消失：焦点不能掉回 body，
               交还给对应的那张卡（键盘用户下一步就在那里）。 */
            const back = wall.querySelector(`[data-row="${d.id}"] .avoid-card`);
            if (back && typeof back.focus === 'function') back.focus();
          },
        }, d.zh));
      });
    }

    const lastId = s.unwanted[s.unwanted.length - 1] || s.noSmell[s.noSmell.length - 1];
    const last = lastId ? LIFE_NOTES.find((x) => x.id === lastId) : null;
    const lastOff = !!(lastId && s.noSmell.includes(lastId));
    gloss.classList.toggle('is-idle', !last);
    gloss.textContent = last
      ? (lastOff
        ? `${last.zh} —— 没闻过，这条不算数`
        : `${last.zh} —— ${last.hint}`)
      : '点卡＝不要；没闻过点「没闻过」；都不点＝接受';
  };

  /* 同一条纪律（原「想要」屏的 togglePhrase 也是这一条，那屏已删）：
     同一条短语不能既「想要」又「不要」，点这边就从对面移除。
     `answers.wanted` 屏删后恒为 `[]`，所以这个互斥分支实际上永不命中 ——
     留着是因为「将来恢复那一屏」时它必须还在，删掉等于静默丢掉这条不变式。 */
  const toggle = (id) => {
    const sel = state.answers.unwanted || (state.answers.unwanted = []);
    const i = sel.indexOf(id);
    if (i >= 0) {
      sel.splice(i, 1);
    } else {
      sel.push(id);
      const o = state.answers.wanted || [];
      const oi = o.indexOf(id);
      if (oi >= 0) o.splice(oi, 1);
      /* 「不要」压过「没闻过」：同一张卡上更强的那个陈述说了算。
         不清的话会留下"标了不要、同时又标了没闻过"的矛盾态。 */
      const ns = state.answers.noSmell || (state.answers.noSmell = []);
      const ni = ns.indexOf(id);
      if (ni >= 0) ns.splice(ni, 1);
    }
    syncPhrasesToNotes();
  };

  /* 「没闻过」：只写 noSmell，不碰 unwanted / dislikedNotes。
     这是第三态的全部实现 —— 它之所以能不扣分，是因为它**根本没有**
     进入 syncPhrasesToNotes 的输入（那里只读 unwanted）。 */
  const toggleNoSmell = (id) => {
    const ns = state.answers.noSmell || (state.answers.noSmell = []);
    const i = ns.indexOf(id);
    if (i >= 0) {
      ns.splice(i, 1);
    } else {
      ns.push(id);
      const un = state.answers.unwanted || (state.answers.unwanted = []);
      const ui = un.indexOf(id);
      if (ui >= 0) un.splice(ui, 1);
    }
    syncPhrasesToNotes();
  };

  for (const c of plan.cards) {
    const on = selNow().unwanted.includes(c.id);
    const off = selNow().noSmell.includes(c.id);
    const row = el('div', {
      class: 'avoid-row',
      'data-row': c.id,
      role: 'group',
      'aria-label': c.zh,
    });
    const card = el('button', {
      class: 'avoid-card' + (on ? ' is-on' : '') + (off ? ' is-unknown' : ''),
      type: 'button',
      'data-phrase': c.id,
      'data-state': on ? 'on' : off ? 'unknown' : 'idle',
      'aria-pressed': String(on),
      onclick: () => {
        toggle(c.id);
        paintCard(c.id);
        paintMeta();
      },
    },
      /* 标本风小图：复用圆盘那 24 枚上色 SVG，不新造图标。
         aria-hidden：句意已由 zh/hint 文本完整表达。 */
      el('span', { class: 'avoid-art' }, avoidSpecimen(c.specimen),
        el('span', { class: 'avoid-mark', 'aria-hidden': 'true' }, '不要')
      ),
      el('span', { class: 'avoid-text' },
        el('span', { class: 'avoid-zh' }, c.zh),
        el('span', { class: 'avoid-hint' }, c.hint)
      )
    );
    const nope = el('button', {
      class: 'avoid-nope' + (off ? ' is-on' : ''),
      type: 'button',
      'data-phrase': c.id,
      'aria-pressed': String(off),
      title: '我没闻过这个，这条不算数',
      onclick: () => {
        toggleNoSmell(c.id);
        paintCard(c.id);
        paintMeta();
      },
    }, '没闻过');
    row.append(card, nope);
    wall.appendChild(row);
  }

  wrap.append(wall, count, excluded, gloss);
  /* 首屏就要有提示行：paintMeta 原来只在点卡时跑，于是第一次进这一屏
     count 与 gloss 都是空字符串 —— 用户得先点一下才知道"点一下＝这个不要"。
     在挂载后补一次调用即可（不是结构调整，两个节点本来就已建好）；
     顺带让"回到这一屏"时已有的选择被正确回读，而不是从空开始。 */
  paintMeta();
  wrap.appendChild(navBar('unwanted'));
  return wrap;
}


/* ============================================================
   第 5 屏：场合（竖向一天 · redesign-leg3-20261126）
   ------------------------------------------------------------
   ==== 内容隐喻 ====
   场合问的是"什么时候用"，那就把它画成**一天**：五个站点沿一条竖向
   时间轴从上到下排开 —— 上班/上课（08:00）、日常/居家（12:00）、
   运动/户外（15:00）在白天，约会（19:00）、正式场合（21:00）在傍晚之后。
   顺序取自 src/scoring.js 的 OCCASION_TIME（day 在前、evening 在后），
   位置就是时刻，用户看一眼天色就知道自己在选哪一段。

   ==== 几何 ====
   每行 64px，五行共 320px：左列是时刻 + 16px 图标，中列是轴线与站点圆点，
   右列是场合名 + 一句话（taxonomy 的 desc，一句）。390 宽下页头 ≤160px、
   底栏 72px，整屏一屏放下 —— 所以 PR #26 的屏内 sticky 题头随改版撤掉：
   没有滚动，就没有"题头滚出视口"这个问题。

   ==== 轴是天光 ====
   轴线本身是一条竖向渐变：晨白 → 午暖 → 暮橙 → 夜蓝。选中一个站点，
   轴上属于它的那一段从中心向两端亮起（.occ-seg 的 scaleY 0→1，260ms）。
   反馈是内容本身的变化，不新增控件、不弹层、不再放译文行。
   场合文案沿用定版句：通勤是"白天办公室，一臂距离"，约会是"晚上，靠近才闻到"。

   ==== 交互纪律（沿用地平线版）====
   真实 button + radiogroup + roving tabindex：整组只有一个 Tab 落点，
   且永远落在当前选中项上（未选时落在第一站）—— 焦点离开再 Tab 回来，
   回到的是选中的那一站。方向键上下（左右也认）在组内移动选择。
   ============================================================ */
function renderOccasion() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('occasion');

  /* 屏内只留标题。题号由页顶进度尺（.progress-meta）报，
     help 不再上屏（见 STEPS.occasion 的注释），底栏提示由 navBar 给。 */
  wrap.appendChild(el('div', { class: 'stage-lead occ-lead' },
    el('h2', { class: 'q-title' }, head.title)
  ));

  const items = TAX && TAX.occasionMap ? TAX.occasionMap : [];

  /* 排序：按**时段**（白天在前、傍晚在后），同时段内保持 taxonomy 的原始顺序。
     时段取自 src/scoring.js 的 OCCASION_TIME（与引擎的 timesOfDay 因子同一份口径），
     在这里复述一次而不是 import：这一屏在库加载失败时也要能画出来。
     **这份顺序就是时间轴的顺序，不由 CSS 决定** —— 位置是内容，不能靠样式排。 */
  const TIME = { commute: 'day', daily: 'day', outdoor: 'day', date: 'evening', formal: 'evening' };
  const TIME_ORDER = { day: 0, evening: 1 };
  const ordered = items
    .map((o, i) => ({ o, i, t: TIME_ORDER[TIME[o.id]] ?? 0.5 }))
    .sort((a, b) => (a.t - b.t) || (a.i - b.i));

  /* 每站的时刻读数（左列）。顺序与时刻必须同向递增 ——
     08:00 → 12:00 → 15:00 → 19:00 → 21:00，轴上位置就是这些钟点。 */
  const CLOCK = { commute: '08:00', daily: '12:00', outdoor: '15:00', date: '19:00', formal: '21:00' };
  /* 站点圆点的取色：与轴线渐变在各自时刻处的颜色一致（晨白偏灰蓝、
     午暖沙金、暮橙、夜蓝）。圆点是装饰（aria-hidden），选中态另有
     accent + aria-checked 表达，不靠这枚颜色传达状态。 */
  const TINT = { commute: '#b9c9d8', daily: '#dfc188', outdoor: '#dd9c55', date: '#d0703c', formal: '#3d4c7c' };

  /* 16px 线性图标：公文包 / 房子 / 山 / 心 / 领结。
     stroke 取 currentColor，颜色由 CSS 管（选中转 accent）。 */
  const ICON = {
    commute: [['rect', { x: 2, y: 5, width: 12, height: 8.5, rx: 1 }], ['path', { d: 'M6 5V3.2h4V5 M2 8.5h12' }]],
    daily: [['path', { d: 'M2.5 7.3 8 2.5l5.5 4.8V13.5h-11Z M6.5 13.5v-3.8h3v3.8' }]],
    outdoor: [['path', { d: 'M1.5 12.5 6 5.5l3 4.2 2-2.8 3.5 5.6Z' }], ['circle', { cx: 12.2, cy: 3.6, r: 1.4 }]],
    date: [['path', { d: 'M8 13.2C4.2 10.4 2.2 8.5 2.2 6.3 2.2 4.6 3.5 3.3 5.1 3.3c1.2 0 2.3.6 2.9 1.6.6-1 1.7-1.6 2.9-1.6 1.6 0 2.9 1.3 2.9 3 0 2.2-2 4.1-5.8 6.9Z' }]],
    formal: [['path', { d: 'M2.3 4.6 6.4 6.6v2.8L2.3 11.4Z M13.7 4.6 9.6 6.6v2.8l4.1 2Z' }], ['rect', { x: 6.4, y: 6.4, width: 3.2, height: 3.2, rx: .6 }]],
  };
  const iconOf = (id) => {
    const svg = svgEl('svg', {
      class: 'occ-ico', viewBox: '0 0 16 16', width: '16', height: '16',
      fill: 'none', stroke: 'currentColor', 'stroke-width': '1.4',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
    });
    (ICON[id] || []).forEach(([tag, attrs]) => svg.appendChild(svgEl(tag, attrs)));
    return svg;
  };

  const day = el('div', { class: 'occ-day' });
  /* 天光轴：一条从晨到夜的竖向连续渐变，铺在整条时间轴之下。
     它在 radiogroup 外面 —— 组里只有五个 radio，装饰不掺进语义组。 */
  day.appendChild(el('div', { class: 'occ-axis', 'aria-hidden': 'true' }));
  const rail = el('div', { class: 'occ-rail', role: 'radiogroup', 'aria-label': '使用场合' });

  const paint = (cur) => {
    [...rail.children].forEach((c, i) => {
      const on = c.getAttribute('data-occ') === cur;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-checked', String(on));
      /* roving tabindex 跟着选中项走：焦点离开这一组再 Tab 回来时，
         落点是当前选中的那一站（未选时是第一站），不是上一次点过的。 */
      c.setAttribute('tabindex', on || (cur == null && i === 0) ? '0' : '-1');
    });
  };

  ordered.forEach((row, i) => {
    const it = row.o;
    const on = state.answers.occasion === it.id;
    rail.appendChild(el('button', {
      class: 'occ-stop' + (on ? ' is-on' : ''),
      type: 'button',
      role: 'radio',
      'aria-checked': String(on),
      'data-occ': it.id,
      tabindex: on || (state.answers.occasion == null && i === 0) ? '0' : '-1',
      style: `--occ-tint: ${TINT[it.id] || 'var(--ink-3)'}`,
      onclick: () => {
        state.answers.occasion = it.id;
        paint(it.id);
        /* 时段也是背景层的一个输入（SEASON/intensity 之外），
           但只调浓度不改方向 —— 见 src/ambient.js 第 2 条。 */
        applyAmbient();
      },
      onkeydown: (ev) => {
        let d = 0;
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') d = 1;
        else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') d = -1;
        else return;
        ev.preventDefault();
        const to = (i + d + ordered.length) % ordered.length;
        state.answers.occasion = ordered[to].o.id;
        paint(ordered[to].o.id);
        applyAmbient();
        rail.children[to].focus();
      },
    },
      el('span', { class: 'occ-when' },
        el('span', { class: 'occ-time' }, CLOCK[it.id] || ''),
        iconOf(it.id)
      ),
      el('span', { class: 'occ-node', 'aria-hidden': 'true' },
        el('span', { class: 'occ-seg' }),
        el('span', { class: 'occ-dot' })
      ),
      el('span', { class: 'occ-text' },
        el('span', { class: 'occ-zh' }, it.zh),
        el('span', { class: 'occ-desc' }, it.desc)
      )
    ));
  });

  day.appendChild(rail);
  paint(state.answers.occasion);
  wrap.appendChild(day);

  wrap.appendChild(navBar('occasion'));
  return wrap;
}

/* ============================================================
   第 4 屏：季节（一条线拖动 + 四季全屏氛围）
   ------------------------------------------------------------
   滑块位置是 0–3 的连续值；答案是离滑块最近的一季，拖动过程中实时
   跟随，松手后吸附到停靠点。四季通用是中立位 1.5，状态值保持 null。
   背景色只插值腿 B 已落地的四组渐变色板，不另造季节色。
   下方译文换成该季节的体感（"湿冷的风，要压得住。"）
   ============================================================ */
const SEASONS = [
  {
    id: 'spring', zh: '春', desc: '花开、微湿。轻盈花香与绿感最合适',
    icon: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="3"/><path d="M16 13c-5-1-6-5-4-7 3-2 6 1 4 7Zm0 0c1-5 5-6 7-4 2 3-1 6-7 4Zm0 0c5 1 6 5 4 7-3 2-6-1-4-7Zm0 0c-1 5-5 6-7 4-2-3 1-6 7-4Z"/></svg>',
  },
  {
    id: 'summer', zh: '夏', desc: '热、出汗多。要清透，浓香会闷',
    icon: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="16" cy="16" r="6"/><path d="M16 3v4m0 18v4M3 16h4m18 0h4M6.8 6.8l2.8 2.8m12.8 12.8 2.8 2.8m0-18.4-2.8 2.8M9.6 22.4l-2.8 2.8"/></svg>',
  },
  {
    id: 'autumn', zh: '秋', desc: '干爽。木质与微甜都能上场',
    icon: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M26 5C14 5 7 10 7 18c0 4 3 7 7 7 8 0 12-9 12-20Z"/><path d="M5 28c4-8 9-13 16-18M12 19l1-6m4 3 5 1"/></svg>',
  },
  {
    id: 'winter', zh: '冬', desc: '冷。需要能压住冷风的厚度',
    icon: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13M12 6l4 4 4-4M12 26l4-4 4 4M6 14l5-1-1-5m16 10-5 1 1 5M6 18l5 1-1 5m16-10-5-1 1-5"/></svg>',
  },
];

/* 与 styles.css 的季节渐变逐字同源；dark 档只换明度，不换四季色相。 */
const SEASON_PALETTES = {
  spring: { light: ['#f6d7e5', '#e6f2dc', '#fff8f1'], dark: ['#5b3e50', '#344c3c', '#241f24'] },
  summer: { light: ['#ffe66b', '#ffb547', '#fff4d6'], dark: ['#6e571c', '#75441e', '#332b1d'] },
  autumn: { light: ['#d9944b', '#f0c58a', '#8c5b37'], dark: ['#6b4526', '#49321f', '#251b15'] },
  winter: { light: ['#dceff8', '#f7fcff', '#b7d6e8'], dark: ['#294554', '#314f62', '#172a35'] },
};
const SEASON_NEUTRAL_POSITION = 1.5;

/* 四季通用只改变季节屏的选择状态；进入评分引擎时仍映射为 null，
   与跳过季节题完全一致（尤其不能成为 activeDims 中的额外一维）。 */
const ALL_SEASON = 'all';
const scoringAnswers = (answers) => ({
  ...answers,
  season: answers.season === ALL_SEASON ? null : answers.season,
});

/* 季节屏的「重画一次」句柄（测试专用，见 renderSeason 里的赋值）。
   方向在第 1 屏改、季节在第 4 屏读，中间隔着整屏重建，所以产品路径里
   不需要这个口子；但"方向变了情境句跟着变"这条断言要能在同一屏内验，
   否则只能靠走完整流程，测起来既慢又脆。 */
let seasonRepaint = null;

function renderSeason() {
  const wrap = el('div', { class: 'fade-in season-screen' });
  const atmosphere = el('div', { class: 'season-atmosphere', 'aria-hidden': 'true' });
  wrap.appendChild(atmosphere);

  const head = stepHead('season');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  const panel = el('div', { class: 'season-panel', role: 'group', 'aria-label': '季节选择' });
  const rail = el('div', { class: 'season-rail' });
  const track = el('span', { class: 'season-track', 'aria-hidden': 'true' },
    el('span', { class: 'season-track-fill' }));
  const mist = el('span', { class: 'season-mist', 'aria-hidden': 'true' });
  const handle = el('div', {
    class: 'season-handle', role: 'slider', tabindex: '0',
    'aria-label': '季节滑块', 'aria-valuemin': '1', 'aria-valuemax': '4',
    'aria-orientation': 'horizontal',
  }, el('span', { class: 'season-handle-dot', 'aria-hidden': 'true' }));
  const grid = el('div', { class: 'season-grid', role: 'radiogroup', 'aria-label': '主季节' });
  rail.appendChild(track);
  rail.appendChild(mist);
  rail.appendChild(handle);
  rail.appendChild(grid);
  panel.appendChild(rail);

  const cells = [];
  const reduceMotion = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false, addEventListener() {} };
  const darkMotion = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : { matches: false, addEventListener() {} };
  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
  const seasonIndex = (id) => SEASONS.findIndex((season) => season.id === id);
  const isNeutralId = (id) => id == null || id === ALL_SEASON;
  let neutral = isNeutralId(state.answers.season);
  let position = neutral ? SEASON_NEUTRAL_POSITION : clamp(seasonIndex(state.answers.season), 0, 3);
  let pointer = null;
  let allCell = null;

  const rgbOf = (color) => {
    if (color && color[0] === '#') {
      const value = parseInt(color.slice(1), 16);
      return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    }
    const parts = String(color || '').match(/\d+/g);
    return parts && parts.length >= 3 ? parts.slice(0, 3).map(Number) : [243, 238, 230];
  };
  const mixColor = (a, b, t) => {
    const ca = rgbOf(a);
    const cb = rgbOf(b);
    return `rgb(${ca.map((value, index) => Math.round(value + (cb[index] - value) * t)).join(', ')})`;
  };
  const neutralPalette = () => {
    const root = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null;
    const colors = ['--bg-2', '--bg-3', '--bg'].map((name) => root ? root.getPropertyValue(name).trim() : '');
    return colors.every((color) => color && color[0] === '#')
      ? colors : ['#f3eee6', '#e8eee9', '#faf7f1'];
  };
  const applyPalette = () => {
    let colors;
    if (neutral) {
      colors = neutralPalette();
    } else {
      const left = Math.floor(position);
      const right = Math.min(left + 1, SEASONS.length - 1);
      const t = position - left;
      const mode = darkMotion.matches ? 'dark' : 'light';
      const a = SEASON_PALETTES[SEASONS[left].id][mode];
      const b = SEASON_PALETTES[SEASONS[right].id][mode];
      colors = a.map((color, index) => mixColor(color, b[index], t));
    }
    colors.forEach((color, index) => document.body.style.setProperty(`--season-bg-${index + 1}`, color));
  };
  const applyEffects = () => {
    const weights = [0, 0, 0, 0];
    if (!neutral) {
      const left = Math.floor(position);
      const right = Math.min(left + 1, SEASONS.length - 1);
      const t = position - left;
      weights[left] += 1 - t;
      weights[right] += t;
    }
    SEASONS.forEach((season, index) => {
      atmosphere.style.setProperty(`--${season.id}-weight`, weights[index].toFixed(3));
    });
    atmosphere.style.setProperty('--all-weight', neutral ? '1.000' : '0.000');
  };
  const renderPosition = () => {
    const left = 12.5 + (position / (SEASONS.length - 1)) * 75;
    rail.style.setProperty('--season-left', `${left.toFixed(3)}%`);
    rail.style.setProperty('--season-progress', String(neutral ? 0 : position / (SEASONS.length - 1)));
    rail.classList.toggle('is-neutral', neutral);
    rail.dataset.seasonPosition = position.toFixed(3);
    rail.dataset.seasonValue = neutral ? 'null' : SEASONS[Math.round(position)].id;
    handle.classList.toggle('is-neutral', neutral);
    handle.setAttribute('aria-valuenow', (position + 1).toFixed(2));
    handle.setAttribute('aria-valuetext', neutral ? '四季通用' : SEASONS[Math.round(position)].zh);
    mist.classList.toggle('is-visible', !neutral);
    applyPalette();
    applyEffects();
  };

  const gloss = el('p', { class: 'temp-gloss is-idle' });
  const scene = el('p', { class: 'season-scene' });
  scene.hidden = true;
  /* 每档配一句"温度 + 身体感受"。这是译文行（规格 5），不是装饰文案：
     它把「冬」这个字翻译成"冷风要压得住。"。 */
  const FEEL = {
    spring: '十几度，风里有水汽 —— 轻盈的花香和绿感最合适',
    summer: '三十度以上，会出汗 —— 太浓的会闷，清透才活得下来',
    autumn: '干、凉、空气薄 —— 木质和微甜都能上场',
    winter: '冷，要压得住风 —— 需要厚度，不然出门就散',
  };
  /* ---- #5 物候注记：左 40px 纵排四季小刻度（复用季节图标），右正文随季变 ----
     候选数一律取自运行时香水库；库未到时先给体感文案，到了再补实数，不编数字。 */
  const note = el('div', { class: 'phenology-note' });
  const ticks = el('div', { class: 'phenology-scale', role: 'group', 'aria-label': '四季物候刻度' });
  const noteBody = el('p', { class: 'phenology-body' });
  const tickNodes = SEASONS.map((season) => {
    const tick = el('button', {
      class: 'phenology-tick', type: 'button',
      'data-season': season.id, 'aria-label': season.zh + '季物候',
      onclick: () => choose(season.id),
    }, el('span', { class: 'phenology-icon', 'aria-hidden': 'true', html: season.icon }));
    ticks.appendChild(tick);
    return tick;
  });
  note.appendChild(ticks);
  note.appendChild(noteBody);

  const seasonCountOf = (id) => {
    if (!DATA || !Array.isArray(DATA.perfumes)) return null;
    return DATA.perfumes.reduce((n, p) => n + ((p.seasons || []).indexOf(id) >= 0 ? 1 : 0), 0);
  };
  const NOTE_ZH = { spring: '春季候选', summer: '夏季候选', autumn: '秋季候选', winter: '冬季候选' };
  const paintPhenology = (cur) => {
    const allOn = isNeutralId(cur);
    tickNodes.forEach((tick, i) => {
      const on = allOn || SEASONS[i].id === cur;
      tick.classList.toggle('is-on', on);
      tick.setAttribute('aria-pressed', String(on));
    });
    note.classList.toggle('is-all', allOn);
    note.dataset.season = allOn ? 'all' : String(cur || '');
    const it = SEASONS.find((s) => s.id === cur) || null;
    if (allOn) {
      const total = DATA && Array.isArray(DATA.perfumes) ? DATA.perfumes.length : null;
      noteBody.textContent = total == null
        ? '不限定季节，保留所有适合的香水'
        : '不限定季节，全部 ' + total + ' 瓶都在候选里';
    } else if (it) {
      const n = seasonCountOf(it.id);
      noteBody.textContent = n == null ? it.desc : '全库' + NOTE_ZH[it.id] + ' ' + n + ' 瓶';
    } else {
      noteBody.textContent = '';
    }
  };
  /* 香水库按需加载：到库后把真实候选数补回注记，不改答案也不改打分。 */
  ensurePerfumes().then(() => paintPhenology(state.answers.season)).catch(() => {});

  const paintSelection = (cur) => {
    const it = SEASONS.find((season) => season.id === cur) || null;
    const allOn = isNeutralId(cur);
    grid.classList.toggle('has-selection', !!it);
    cells.forEach((cell, index) => {
      const on = SEASONS[index].id === cur;
      cell.classList.toggle('is-on', on);
      cell.setAttribute('aria-checked', String(on));
      cell.setAttribute('tabindex', on || (!it && !allOn && index === 0) ? '0' : '-1');
    });
    allCell.classList.toggle('is-on', allOn);
    allCell.setAttribute('aria-checked', String(allOn));
    allCell.setAttribute('tabindex', allOn ? '0' : '-1');
    gloss.classList.toggle('is-idle', !it);
    gloss.textContent = it ? FEEL[it.id] : (allOn ? '不限定季节，保留所有适合的香水' : '');
    const line = it ? (seasonScene(state.answers.family, it.id) || it.desc) : '';
    scene.hidden = !line;
    scene.textContent = line;
    paintPhenology(cur);
  };
  const choose = (id) => {
    state.answers.season = id === ALL_SEASON ? null : id;
    neutral = isNeutralId(state.answers.season);
    position = neutral ? SEASON_NEUTRAL_POSITION : clamp(seasonIndex(state.answers.season), 0, 3);
    paintSelection(state.answers.season);
    renderPosition();
    applyAmbient();
  };

  /* 每类粒子固定三档尺寸、两档速度；参数表集中在这里，四季通用场景
     也复用同一套几何，不另造一套会漂移的随机规则。 */
  const particleProfiles = {
    petal: { sizes: [6, 8.5, 11], durations: [12, 19], opacities: [.42, .58, .74] },
    sunspot: { sizes: [110, 180, 250], durations: [16, 28], opacities: [.16, .24, .32] },
    leaf: { sizes: [7, 10, 13], durations: [11, 18], opacities: [.30, .46, .62] },
    snow: { sizes: [2.5, 4, 5.5], durations: [16, 25], opacities: [.36, .55, .74] },
  };
  const particle = (layer, kind, index, count) => {
    const node = el('span', { class: `season-particle season-particle-${kind}`, 'aria-hidden': 'true' });
    const profile = particleProfiles[kind];
    const sizeTier = index % profile.sizes.length;
    const speedTier = (Math.floor(index / profile.sizes.length) + index) % 2;
    const size = profile.sizes[sizeTier];
    const duration = profile.durations[speedTier];
    const opacity = profile.opacities[sizeTier];
    /* 横向按四个象限分层，每象限数量相同；纵相用互素步长铺满整个周期，
       截图与切季都不会把粒子挤在中央或同一水平线上。 */
    const quadrant = index % 4;
    const quadrantIndex = Math.floor(index / 4);
    const quadrantCount = Math.ceil((count - quadrant) / 4);
    const x = (quadrant % 2) * 50 + ((quadrantIndex + .5) / quadrantCount) * 50;
    const verticalBand = (quadrantIndex + (quadrant >= 2 ? 1 : 0)) % 2;
    const rowsInBand = Math.ceil(quadrantCount / 2);
    const bandIndex = Math.floor(quadrantIndex / 2);
    const y = 8 + verticalBand * 42 + ((bandIndex + .5) / rowsInBand) * 42;
    const phase = (((index * 17) % count) + .5) / count;
    node.style.setProperty('--x', `${x.toFixed(3)}%`);
    node.style.setProperty('--y', `${y.toFixed(3)}%`);
    node.style.setProperty('--size', `${size.toFixed(1)}px`);
    node.style.setProperty('--duration', `${duration.toFixed(1)}s`);
    node.style.setProperty('--delay', `${(-(phase * duration)).toFixed(1)}s`);
    node.style.setProperty('--drift', `${(index % 2 ? 1 : -1) * (12 + sizeTier * 10 + speedTier * 8)}px`);
    node.style.setProperty('--particle-opacity', opacity.toFixed(2));
    layer.appendChild(node);
  };
  /* v2 按实际基线翻倍：16/6/14/22 → 32/12/28/44。 */
  const effectCounts = { spring: 32, summer: 12, autumn: 28, winter: 44 };
  SEASONS.forEach((season) => {
    const layer = el('div', { class: `season-fx season-fx-${season.id}`, 'aria-hidden': 'true' });
    const count = effectCounts[season.id];
    const kind = season.id === 'spring' ? 'petal' : season.id === 'autumn' ? 'leaf' : season.id === 'winter' ? 'snow' : 'sunspot';
    for (let index = 0; index < count; index += 1) particle(layer, kind, index, count);
    atmosphere.appendChild(layer);
  });
  /* 四季通用是独立的轻量混合场景，不再借用夏季光斑；CSS 将节奏再放慢 1.5 倍。 */
  const allLayer = el('div', { class: 'season-fx season-fx-all', 'aria-hidden': 'true' });
  [['petal', 6], ['leaf', 6], ['snow', 6], ['sunspot', 4]].forEach(([kind, count]) => {
    for (let index = 0; index < count; index += 1) particle(allLayer, kind, index, count);
  });
  atmosphere.appendChild(allLayer);

  SEASONS.forEach((season, index) => {
    const on = state.answers.season === season.id;
    const cell = el('button', {
      class: 'season-cell' + (on ? ' is-on' : ''),
      type: 'button', role: 'radio', 'aria-checked': String(on),
      'data-season': season.id,
      tabindex: on || (state.answers.season == null && index === 0) ? '0' : '-1',
      onclick: (event) => {
        /* 指针操作由 rail 处理；detail=0 留给键盘与辅助技术。 */
        if (event.detail === 0 || event.detail == null) choose(season.id);
      },
      onkeydown: (event) => {
        let next = null;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index - 1;
        else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index + 1;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = SEASONS.length - 1;
        if (next == null || next < 0 || next >= SEASONS.length) return;
        event.preventDefault();
        cells[next].focus({ preventScroll: true });
        choose(SEASONS[next].id);
      },
    },
      el('span', { class: 'season-symbol', 'aria-hidden': 'true', html: season.icon }),
      el('span', { class: 'season-name' }, season.zh)
    );
    cells.push(cell);
    grid.appendChild(cell);
  });

  allCell = el('button', {
    class: 'season-cell season-cell-all season-all-chip',
    type: 'button', role: 'radio',
    'aria-checked': String(isNeutralId(state.answers.season)),
    'data-season': ALL_SEASON,
    tabindex: isNeutralId(state.answers.season) ? '0' : '-1',
    onclick: () => choose(ALL_SEASON),
    onkeydown: (event) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const target = event.key === 'ArrowUp' ? cells[SEASONS.length - 1] : cells[0];
      target.focus({ preventScroll: true });
      choose(SEASONS[target === cells[0] ? 0 : SEASONS.length - 1].id);
    },
  },
    el('span', { class: 'season-name' }, '四季通用'),
    el('span', { class: 'season-all-sub' }, '不挑季节')
  );
  grid.appendChild(allCell);

  const positionFromEvent = (event) => {
    const box = rail.getBoundingClientRect();
    const inset = box.width * .125;
    const span = Math.max(1, box.width - inset * 2);
    return clamp((event.clientX - box.left - inset) / span, 0, 1) * (SEASONS.length - 1);
  };
  const cellFromTarget = (target) => {
    const node = typeof target?.closest === 'function' ? target.closest('.season-cell') : target;
    return node && typeof node.getAttribute === 'function' ? node : null;
  };
  const restoreSelectedPosition = () => {
    neutral = isNeutralId(state.answers.season);
    position = neutral ? SEASON_NEUTRAL_POSITION : clamp(seasonIndex(state.answers.season), 0, 3);
    renderPosition();
  };
  rail.addEventListener('pointerdown', (event) => {
    if (pointer || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const cell = cellFromTarget(event.target);
    if (cell && cell.classList.contains('season-cell-all')) return;
    pointer = {
      id: event.pointerId, startX: event.clientX, startY: event.clientY,
      dragged: false, index: cells.indexOf(cell),
    };
    if (typeof rail.setPointerCapture === 'function' && event.pointerId != null) {
      rail.setPointerCapture(event.pointerId);
    }
  });
  rail.addEventListener('pointermove', (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (!pointer.dragged && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 4) {
      pointer.dragged = true;
      rail.classList.add('is-dragging');
    }
    if (!pointer.dragged) return;
    event.preventDefault();
    position = positionFromEvent(event);
    neutral = false;
    const index = clamp(Math.round(position), 0, SEASONS.length - 1);
    if (state.answers.season !== SEASONS[index].id) {
      state.answers.season = SEASONS[index].id;
      paintSelection(state.answers.season);
      applyAmbient();
    }
    renderPosition();
  });
  const endPointer = (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dragged = pointer.dragged;
    const index = pointer.index;
    pointer = null;
    rail.classList.remove('is-dragging');
    if (typeof rail.releasePointerCapture === 'function' && event.pointerId != null
      && typeof rail.hasPointerCapture === 'function' && rail.hasPointerCapture(event.pointerId)) {
      rail.releasePointerCapture(event.pointerId);
    }
    if (dragged) {
      position = clamp(Math.round(position), 0, SEASONS.length - 1);
      choose(SEASONS[position].id);
    } else if (index >= 0) {
      choose(SEASONS[index].id);
    } else {
      position = clamp(Math.round(positionFromEvent(event)), 0, SEASONS.length - 1);
      choose(SEASONS[position].id);
    }
  };
  rail.addEventListener('pointerup', endPointer);
  const cancelPointer = (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    pointer = null;
    rail.classList.remove('is-dragging');
    restoreSelectedPosition();
  };
  rail.addEventListener('pointercancel', cancelPointer);
  rail.addEventListener('lostpointercapture', cancelPointer);

  handle.addEventListener('keydown', (event) => {
    let next = null;
    if (event.key === 'ArrowLeft') next = neutral ? 1 : Math.round(position) - 1;
    else if (event.key === 'ArrowRight') next = neutral ? 2 : Math.round(position) + 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = SEASONS.length - 1;
    if (next == null || next < 0 || next >= SEASONS.length) return;
    event.preventDefault();
    choose(SEASONS[next].id);
  });

  seasonRepaint = () => {
    neutral = isNeutralId(state.answers.season);
    position = neutral ? SEASON_NEUTRAL_POSITION : clamp(seasonIndex(state.answers.season), 0, 3);
    paintSelection(state.answers.season);
    renderPosition();
  };
  paintSelection(state.answers.season);
  renderPosition();
  wrap.appendChild(panel);
  wrap.appendChild(gloss);
  wrap.appendChild(scene);

  /* 文案二轮裁决全局问题 4 / 第 45 条：统计数字不指导操作，且会随数据更新过期；
     删掉具体瓶数，只保留不带数字的分布判断。 */
  wrap.appendChild(note);

  wrap.appendChild(navBar('season'));

  if (typeof darkMotion.addEventListener === 'function') {
    darkMotion.addEventListener('change', renderPosition);
  }
  if (typeof reduceMotion.addEventListener === 'function') {
    reduceMotion.addEventListener('change', renderPosition);
  }
  return wrap;
}
/* ============================================================
   第 7 屏：浓淡 + 浓度（波纹场 + 原生滑杆）
   ------------------------------------------------------------
   ==== 内容隐喻 ====
   浓淡问的是"这团气味能走多远"。画面：中间一个人形剪影，
   周围是从他身上向外扩散的同心波纹 —— 波纹半径就是扩散距离。

   ==== 为什么换成原生滑杆 ====
   旧版把五个环做成五枚按钮，命中环带在窄屏互相遮挡
   （320/390 实测点 1/5 会被 5/5 拦住），拖动与方向键也不通。现在：
     · 命中只靠滑杆（含刻度落点）；波纹整块 aria-hidden、不可点；
     · 拖动时波纹半径跟手连续变，不按档跳；
       松手吸附到最近档，同时一次轻微波纹扩散；
     · 点刻度直接跳档，方向键左右切档 —— 三条路写同一个 state。
   读数只写白话（「适中：办公室里刚好」），不写「3/5」；
   当前档大致对应的浓度类型（EDC/EDT/EDP）收在读数下一行灰字。

   ==== 浓度类型为什么留在同一屏 ====
   浓度（香精占比）决定"这团气味能撑多久"，是同一个物理量的另一半。
   收在「按香水类型筛选」一格里；切换只写自己的 state、原地刷新散发效果，
   不整屏重绘 —— 其他屏的答案一个都不碰（不允许悄悄清空）。
   ============================================================ */
function renderConcentration() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('concentration');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  /* ---- ① 想让它在多远的地方闻得到：场景图 + 原生滑杆 ---- */
  wrap.appendChild(el('div', { class: 'chips-label' }, '想让它在多远的地方闻得到'));

  /* 五档体感 + 每档一句白话。读数只写「适中：办公室里刚好」这种话，
     不写「3/5」—— 新手要的是分量感，不是分数。 */
  const LEVELS = [
    { v: 1, zh: '贴肤', hint: '只有贴近才闻得到' },
    { v: 2, zh: '很淡', hint: '自己和身边人闻得到' },
    { v: 3, zh: '适中', hint: '办公室里刚好' },
    { v: 4, zh: '明显', hint: '进门会被注意到' },
    { v: 5, zh: '很浓', hint: '一两喷就够' },
  ];
  /* 档位 → 大致对应的浓度类型（读数下那行灰字）。2、3 两档都落在
     淡香水 EDT 的体感带里，所以「适中」对应的是 EDT 而不是 EDP。 */
  const LEVEL_CONC = {
    1: '古龙水 EDC',
    2: '淡香水 EDT',
    3: '淡香水 EDT',
    4: '淡香精 EDP',
    5: '香精 Parfum',
  };

  /* ---- 场景图：中间人形剪影，周围向外扩散的同心波纹 ----
     整块 aria-hidden + pointer-events:none —— 波纹只做展示，不可点；
     这一屏的命中只靠滑杆（含刻度落点），别处一概不收点击。 */
  const scene = el('div', { class: 'conc-scene', 'aria-hidden': 'true' });
  const glow = el('div', { class: 'conc-glow' });
  const rippleIn = el('div', { class: 'conc-ripple', 'data-r': '1' });
  const rippleMid = el('div', { class: 'conc-ripple', 'data-r': '2' });
  const rippleOut = el('div', { class: 'conc-ripple', 'data-r': '3' });
  const pulse = el('div', { class: 'conc-pulse' });
  /* 背影剪影基准：viewBox 0 0 120 180，实际占位盒 120×180。
     头 34×40、颈 22×25、肩宽 104；头底/颈顶重叠 5，颈底/肩上沿重叠 7，
     三段同色无空段。锁骨中点 (60,62)，B5 雾锚点固定在它上方 6px。
     不使用旧圆头+圆顶 blob；肩坡与上躯干轮廓让剪影一眼读作人。 */
  const figure = el('div', { class: 'conc-figure', html:
    '<svg viewBox="0 0 120 180" focusable="false">'
    + '<ellipse cx="60" cy="24" rx="17" ry="20"/>'
    + '<path d="M50 39 L70 39 L72 62 L48 62 Z"/>'
    + '<path d="M48 55 C40 57 30 61 23 69 C16 77 13 91 12 108 L8 180 L112 180 L108 108 C107 91 104 77 97 69 C90 61 80 57 72 55 C68 64 52 64 48 55 Z"/>'
    + '</svg>' });
  /* 锁骨香雾是独立表现层：画布 116×80，锚点在锁骨中点上方 6px。
     四层错位柔雾（空气 / 雾体 / 缕丝 / 柔光）共同随五档递增；
     不再叠硬圆弧或 multiply 暗核，避免靶心感与颈部暗斑。 */
  const mist = el('div', { class: 'conc-mist', html:
    '<div class="conc-mist-air"></div>'
    + '<div class="conc-mist-body"></div>'
    + '<div class="conc-mist-wisp"></div>'
    + '<div class="conc-mist-bloom"></div>' });
  scene.append(glow, rippleIn, rippleMid, rippleOut, pulse, figure, mist);

  /* 波纹直径 = 滑块档位 × 类型系数。16%（贴肤）→ 128%（铺过舞台），
     拖动时收连续值（1.00–5.00 都有），不按档跳；松手后再缓动吸附到整数档。
     CSS 的 max-width 再把所有场景层限制在视口宽减 32px。 */
  const paintScene = (v) => {
    const t = Math.min(1, Math.max(0, (Number(v) - 1) / 4));
    const fx = CONCENTRATION_FX[state.answers.concentration];
    const d = Number(((16 + t * (128 - 16)) * (fx ? fx.factor : 1)).toFixed(3));
    scene.dataset.intensity = String(Math.min(5, Math.max(1, Math.round(Number(v)))));
    glow.style.width = (d * 0.5) + '%';
    rippleIn.style.width = (d * 0.42) + '%';
    rippleMid.style.width = (d * 0.72) + '%';
    rippleOut.style.width = d + '%';
    pulse.style.width = d + '%';
  };

  /* 类型切换只改散发层：半径由 paintScene 同步，Parfum 的第四圈在这里更新；
     人物、滑杆、读数与其他答案都保持原地不动。 */
  const paintTypeEffect = () => {
    const fx = CONCENTRATION_FX[state.answers.concentration];
    const opacity = fx ? fx.opacity : 0;
    scene.style.setProperty('--conc-opacity', fx ? String(opacity) : '1');
    scene.dataset.concentrationFx = fx ? state.answers.concentration : 'none';
    pulse.classList.toggle('is-parfum', !!fx && !!fx.pulse);
  };

  /* ---- 原生滑杆：这一屏唯一的命中来源 ---- */
  const slider = el('input', {
    class: 'conc-slider',
    type: 'range',
    min: '1',
    max: '5',
    step: '1',
    value: String(state.answers.intensity),
    'aria-label': '香味浓淡',
  });

  /* 刻度：5 个落点排开在滑杆下方，点刻度直接跳档。
     它们是鼠标/触屏的捷径，不进 tab 序（tabindex=-1）、对读屏隐藏 ——
     键盘与读屏的唯一通路是滑杆本身（方向键左右、aria-valuetext 白话），
     控件语义只有一个，不会出现两套控件各说各话。 */
  const ticks = el('div', { class: 'conc-ticks' });
  const paintTicks = () => {
    const v = Number(state.answers.intensity);
    [...ticks.children].forEach((b) => {
      b.classList.toggle('is-on', Number(b.getAttribute('data-v')) === v);
    });
  };

  const read = el('div', { class: 'conc-read' });
  const concLine = el('p', { class: 'conc-conc' });
  const paintRead = () => {
    const v = Number(state.answers.intensity);
    const L = LEVELS.find((x) => x.v === v) || LEVELS[2];
    read.innerHTML = '';
    read.appendChild(el('b', {}, L.zh));
    read.appendChild(el('span', {}, '：' + L.hint));
    concLine.textContent = '大致对应：' + (LEVEL_CONC[v] || LEVEL_CONC[3]);
    slider.setAttribute('aria-valuetext', L.zh + '：' + L.hint);
    paintTicks();
  };

  /* 拖动或刻度点击接管 transform：先摘掉上一轮提交动画，避免 560ms 的
     is-committing 继续控制雾的 scale，导致拖动中不跟手。 */
  const stopPulse = () => {
    pulse.classList.remove('is-live');
    mist.classList.remove('is-committing');
  };
  /* 松手吸附时的一次轻微波纹与蓝雾扩散：摘掉 is-live 强制重排再挂回去，
     动画才能重播（0.6s / 0.56s 各一次，减少动态偏好下直接呈现静态雾晕）。 */
  const firePulse = () => {
    stopPulse();
    void pulse.offsetWidth;
    pulse.classList.add('is-live');
    mist.classList.add('is-committing');
  };

  let dragging = false;
  let dragMoved = false;
  /* 拖动：波纹半径跟手连续变。pointerdown 后浏览器把指针捕获在滑杆上，
     pointermove 全程送到这里；坐标只用来画半径，档位仍由滑杆自己量化。 */
  const valFromPointer = (clientX) => {
    const rect = slider.getBoundingClientRect();
    if (!rect || !rect.width) return null;
    const frac = (clientX - rect.left) / rect.width;
    return 1 + Math.min(1, Math.max(0, frac)) * 4;
  };
  const release = () => {
    if (!dragging) return;
    dragging = false;
    scene.classList.remove('is-dragging');
    /* 松手吸附：半径从手上的连续位置缓动到最近档（滑杆值即最近档）。 */
    paintScene(Number(slider.value));
    if (dragMoved) firePulse();
    dragMoved = false;
  };
  slider.addEventListener('pointerdown', () => {
    stopPulse();
    dragging = true;
    dragMoved = false;
    scene.classList.add('is-dragging');
  });
  slider.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    dragMoved = true;
    const v = valFromPointer(ev.clientX);
    if (v != null) paintScene(v);
  });
  slider.addEventListener('pointerup', release);
  slider.addEventListener('pointercancel', release);
  /* 键盘方向键 / 刻度点击之外的换值都走这里：档位 + 读数 + 波纹一起换。 */
  slider.addEventListener('input', (ev) => {
    const v = Number(ev.target && ev.target.value);
    if (!Number.isFinite(v)) return;
    state.answers.intensity = v;
    if (!dragging) {
      stopPulse();
      paintScene(v);
    }
    paintRead();
    applyAmbient();
  });

  LEVELS.forEach((L) => {
    ticks.appendChild(el('button', {
      class: 'conc-tick',
      type: 'button',
      'data-v': String(L.v),
      tabindex: '-1',
      'aria-hidden': 'true',
      onclick: () => {
        /* 点刻度直接跳档：滑杆值、state、读数一次到位（不带脉冲——
           轻微扩散只属于拖动松手那一下）。先取消上一轮提交动画，避免
           transform 被 is-committing 占着，档位变化只走 160ms 过渡。 */
        stopPulse();
        state.answers.intensity = L.v;
        slider.value = String(L.v);
        if (!dragging) paintScene(L.v);
        paintRead();
        applyAmbient();
      },
    }, L.zh));
  });

  paintScene(state.answers.intensity);
  paintTypeEffect();
  paintRead();
  wrap.appendChild(scene);
  wrap.appendChild(el('div', { class: 'conc-slider-wrap' }, slider, ticks));
  wrap.appendChild(read);
  wrap.appendChild(concLine);

  /* ---- ② 按香水类型筛选（EDC / EDT / EDP / Parfum） ---- */
  wrap.appendChild(el('div', { class: 'chips-label', style: 'margin-top:20px' },
    '按香水类型筛选'));
  const grid = choiceGrid(CONCENTRATIONS, state.answers.concentration, (id) => {
    state.answers.concentration = id;
    const inferred = CONC_TO_LONGEVITY[id];
    if (inferred != null) state.answers.longevity = inferred;
    /* 只写 state 并原地刷新散发效果，不整屏 render()：choiceGrid 自己会把
     选中态刷到整组；滑杆、读数与人物保持不动，其他屏的答案一个都不碰。 */
    paintScene(Number(slider.value));
    paintTypeEffect();
    firePulse();
  });
  wrap.appendChild(grid);

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


  /* 第 1 屏：香型圆盘。取回自 a39e498 的原分支，一字未改 ——
     它的 disabled 语义有明确理由（下面两条注解都是原文）：
       两条入口都算「答过了」：轮盘选家族，或下面那排「按感觉选」。
       只认 family 时，用情绪入口的人会被这个 disabled 卡在第 1 步 ——
       而那恰好是不认识香型词汇的用户，等于把兜底路也堵死。
     这也正是本步不改盘下那排「按感觉选」的原因：它是盘的兜底入口。
     大方向屏已于 v7 第 3 步删除，这排「按感觉选」现在是 `answers.emotion`
     的唯一写入点 —— 删掉它就等于把 emotion 入口整条掐断。 */
  if (stepId === 'family') {
    const byFamily = !!state.answers.family;
    const byEmotion = !!state.answers.emotion;
    const done = byFamily || byEmotion;
    bar.appendChild(el('span', { class: 'hint' }, done
      ? (byFamily ? '中圈可选，不选就按大类推荐' : '也可按感觉选；中圈可不选')
      : '先点外圈选大类，或用「按感觉选」'));
    bar.appendChild(el('button', {
      class: 'btn', type: 'button', disabled: done ? null : 'disabled',
      onclick: next,
    }, '下一步 →'));
    return bar;
  }

  /* 情绪入口不再是圆盘底部的备选控件，而是首屏二选一的一条正式路径。 */
  if (stepId === 'emotion') {
    bar.appendChild(el('span', { class: 'hint' }, state.answers.emotion ? '已按感觉确定方向' : '先选一种最接近的感受'));
    bar.appendChild(el('button', {
      class: 'btn', type: 'button', disabled: state.answers.emotion ? null : 'disabled',
      onclick: next,
    }, '下一步 →'));
    return bar;
  }

  /* 避雷屏（v7 第 2 步）：多选，一个都不点也能走。
     hint 必须说清"不点是接受"而不是"跳过" —— 这一屏的语义不是弃权，是默认接受。
     原「想要的味道」屏的同类分支已随该屏删除（v7 第 3 步②），此处只剩避雷一条。 */
  if (stepId === 'unwanted') {
    bar.appendChild(el('span', { class: 'hint' }, '点一下＝不要；不点＝接受'));
    bar.appendChild(el('button', { class: 'btn', type: 'button', onclick: next }, '下一步 →'));
    return bar;
  }

  /* 预算（末屏）/ 场合 / 季节 / 浓淡：都可跳过，所以按钮永远可点。
     要求"必须答完才能走"会把可跳过的问题变成门槛。

     为什么仍画一个显式的「下一步」而不是点选即自动前进：
     自动前进是 480ms 后触发的，用户点了之后若想反悔，需要一个不依赖
     "等它自己跳"的出口；而且键盘用户 Tab 到这里时自动前进已经错过了，
     没有按钮他们就卡住了。

     **末屏（budget）在这里就出结果**：v7 第 3 步③ 把预算从第 3 位搬到末位，
     「看推荐」出口随之换人 —— 这条分支必须排在下面那条合并分支**之前**，
     因为 navBar 自上而下短路返回：顺序写反，预算屏会拿到「下一步」，
     永远出不了结果（点「下一步」时 state.step 已到 list.length - 1，
     next() 不动，页面停在预算屏）—— 那正是"点了看推荐没反应"这一类事故。
     浓淡（concentration）已改回普通前进分支，不在这里留 finish 出口，
     否则那个 id 一旦被重排就会静默变成第二个末屏。 */
  if (stepId === 'budget') {
    bar.appendChild(el('span', { class: 'hint' }, '选「不限」也可直接看推荐'));
    bar.appendChild(el('button', {
      class: 'btn js-budget-cta', type: 'button', onclick: (ev) => finish(ev.currentTarget),
    }, budgetCtaText(state.answers.budget || 'any')));
    return bar;
  }
  if (stepId === 'concentration' || stepId === 'season' || stepId === 'occasion') {
    bar.appendChild(el('span', { class: 'hint' }, '不选也能继续'));
    bar.appendChild(el('button', { class: 'btn', type: 'button', onclick: next }, '下一步 →'));
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
  if (state.entry === 'emotion' && state.step === 0) {
    showEntry();
    return;
  }
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
  /* 唯一硬约束：必须给出一个入口 —— 香型圆盘选了家族，或者用「按感觉选」选了情绪。
     这是 a39e498 的原文判定，v7 原样恢复（v6 当年只认 emotion，因为 family
     恒为 null；现在圆盘回来了，family 才是主路径）。
     两条都给不出时才回第 1 步：那时引擎确实无从下手，recommend 会 throw。 */
  if (!state.entry || (state.entry === 'family' && !state.answers.family)
      || (state.entry === 'emotion' && !state.answers.emotion)) {
    state.step = 0;
    render();
    return;
  }
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
    /* ==== 直达链接表（性能腿 2026-11-19）：从这里开始按需加载 ====
       它原先在 boot() 里预热，但唯一消费点是结果页的购买按钮（affiliateLinks
       读 AFF_LINKS）。现在在渲染结果页之前等一次：此刻按钮已经是
       「正在比对…」的忙碌态，用户看不见任何延迟，而首屏少一个 93KB 的并发请求。
       与 ensurePhotos 同一条纪律：失败不影响结果页（加载器自己吞成 false，
       退到平台搜索页兜底）。 */
    await ensureAffLinks().catch(() => {});
    /* 预算走映射层：先把 perfumes 切一刀，引擎一行不动。
       三条降级见 poolForBudget() 的注释 —— 档太窄或凑不满时退回全库，
       绝不给一个空结果。 */
    const pool = poolForBudget(d.perfumes, state.answers.budget);
    /* 避雷屏没上屏的低频模糊元素在这里软降权（0.94），不硬排除。 */
    const avoidSoftNotes = avoidSoftNow();
    const boostIds = gapBoostIds(pool, PHOTOS, AFF_LINKS);
    const scoreInput = scoringAnswers(state.answers);
    let res = recommend(scoreInput, pool, TAX, { topN: 3, avoidSoftNotes, boostIds });
    if (!res.results || res.results.length < 3) {
      /* ② 级的兜底：圈过的池凑不满 3 瓶时用全库重算。
         宁可给一瓶价位外的，也不给"只找到 1 瓶"。 */
      res = recommend(scoreInput, d.perfumes, TAX, { topN: 3, avoidSoftNotes, boostIds });
      res.poolFellBack = true;
    }
    /* 不再悄悄放宽：把档内/档外数出来交给结果页顶部明示（leg6）。
       无论是 poolForBudget 的窄档退全库，还是引擎内部放宽，只要结果含
       档外瓶，budgetRelax 就非空，结果页会写清「只找到 X 瓶，另外 Y 瓶超出预算」。 */
    res.budgetRelax = budgetRelaxInfo(res.results, state.answers.budget);
    state.result = res;
    state.resultView = { round: 0, soldOut: [] };
    /* 本地档案只在「一次测试真正出结果」时写一条；换一批不写第二遍 ——
       它换的是同一份答案下的瓶子，不是一次新的测试。 */
    try {
      addHistory(localStorageSafe(), makeHistoryRecord(res, state.answers));
    } catch { /* 隐私模式/配额满：历史不可用，但结果页照常 */ }
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
  state.entry = null;
  state.entryMotion = false;
  /* 从 STEPS 重新铺一份空白答案，而不是手抄六个键 ——
     v19 加了 7 个字段，手抄必漏；漏掉的那一屏会带着上一轮的答案复现，
     用户看到的是"我明明重选了，结果没变"。 */
  /* 从 STEPS 重新铺一份空白答案，而不是手抄键名 ——
     v19 加字段时手抄漏过一次，漏掉的那一屏会带着上一轮的答案复现，
     用户看到的是"我明明重选了，结果没变"。
     v6 新增的三个（budget / wanted / unwanted）必须在这里，
     否则重开一局时第一批仍是上一局的第二批。
     `wanted` 的屏已按 v7 第 3 步② 删除，但键仍要清 —— 这个对象的键表必须与
     state.answers 逐键对齐（历史上两次事故都是"加字段时漏更新 restart"）。 */
  state.answers = {
    family: null, subfamily: null, direction: null, emotion: null, occasion: null, intensity: 3,
    budget: 'any', wanted: [], unwanted: [], noSmell: [],
    likedNotes: [], dislikedNotes: [], likedZh: {}, dislikedZh: {},
    /* characterNeg 与 longevityManual 是前两轮漏过的：前者是气质原型的
       「禁止标签」，不清会带着上一轮的排除项进新一轮打分（用户重选气质后
       仍被扣分，且界面上看不出来）；后者是留香手动覆盖标记。 */
    characterPreset: null, characterTags: [], characterNeg: [],
    season: null,
    concentration: null, longevity: null, longevityManual: false,
    dislikedFamilies: [], temperature: null, sweetness: null,
    /* direction 是 v7 第 1 步新增的底噪方向，必须与 state.answers 的键表一致 ——
       漏掉它，重开一局时底噪会带着上一局的方向继续走，而圆盘显示的是"还没选"。
       这正是上面那两句注释说的老毛病，所以两处一起改。 */
    anchorBrand: null, anchorPerfume: null, anchorNotes: [],
  };
  /* 结果页视图状态：不清的话"换一批"会从上一局的第二批开始数。 */
  state.resultView = { round: 0, soldOut: [] };
  state.result = null;
  /* 避雷屏的方向键也要清：不清的话新一局第一次 pruneAvoid 会误以为
     方向没变，带着上一局的 unwanted 键往下走。 */
  state.avoidKey = null;
  /* 预算屏的"用户自己选过"标记也要清（Batch 5 腿 B5-3）：
     不清的话新一局第一次进预算屏就会给一个没选过的人盖上一枚章 ——
     而那枚章的含义是"这是你选的"。 */
  state.budgetPicked = false;
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
  if (isEmotionScreen()) labels[0] = '感觉';
  /* ==== v7 第 1.5 步：第 1 屏不再显示「1 / 8」（缺陷 ⑥）====
     这一屏同时报了三遍同一个数字：分段条、`1 / 8`、`第 1 步 / 共 8 步`。
     三处都在说"你在第几步"，等于没有一处是重点。
     只留 kicker（`第 1 步 / 共 8 步`）—— 它是标本编号的语气，也是测试
     按名断言的那一处；分段条本身留着当图形（它现在是一串胶囊），
     但右侧那个数字在这一屏不再出现，左侧标签仍报"这一段是什么"。
     其余七屏不动：那一处的数字在别的屏上没有第二份。 */
  const familyStep = list[state.step] && list[state.step].id === 'family';
  const meta = el('div', { class: 'progress-meta' },
    el('span', {}, state.step >= total ? '推荐结果' : labels[state.step]),
    familyStep
      ? null
      : el('span', {}, state.step >= total ? `完成 · 共 ${total} 步` : `${state.step + 1} / ${total}`)
  );
  box.append(bar, meta);
  return box;
}

/* ---------- 腿8-B：标本条 ----------
   进度条下一条 32px 的印记带，每答一题累积一枚。点印记回到对应题修改；
   结果页展开成理由锚点（data-reason 承载那一句原文，不碰结果详情区）。 */
function renderSpecimenBar() {
  const bar = el('div', { class: 'specimen-bar', role: 'group', 'aria-label': '作答印记' });
  const list = curSteps();
  const a = state.answers;
  const emotionPath = state.entry === 'emotion';
  const marks = [
    { id: 'family', glyph: '●', label: emotionPath ? '感觉' : '香型', done: !!(a.family || a.emotion) },
    { id: 'unwanted', glyph: '✕', label: '避雷', done: (a.unwanted || []).length > 0 || (a.noSmell || []).length > 0 },
    { id: 'occasion', glyph: '◷', label: '时刻', done: !!a.occasion },
    { id: 'season', glyph: '✿', label: '季节', done: !!a.season },
    { id: 'concentration', glyph: '◉', label: '扩散', done: !!a.concentration },
    { id: 'budget', glyph: '¥', label: '价签', done: a.budget !== 'any' },
  ];
  const reasons = (state.result && state.result.results && state.result.results[0]
    && state.result.results[0].reasons) || [];
  marks.forEach((m) => {
    const idx = list.findIndex((s) => s.id === m.id);
    if (!m.done) return;
    const btn = el('button', {
      class: 'specimen-mark', type: 'button',
      'data-step-id': m.id, 'data-done': '1',
      title: '回到「' + m.label + '」修改',
    }, el('span', { class: 'specimen-glyph', 'aria-hidden': 'true' }, m.glyph),
       el('span', { class: 'specimen-name' }, m.label));
    if (state.step >= list.length && reasons.length) {
      const reason = reasons[idx % reasons.length] || '';
      btn.setAttribute('data-reason', reason);
      /* ==== 结果页的印记：理由要能被完整读到（Batch 5 腿 B5-4）====
         屏上那截理由是 CSS 伪元素（96-leg8.css 的 ::after + attr(data-reason)），
         它在这条 34px 高的横条里必然被省略号截断 —— 截断本身是接受的
         （条带只放得下一行），但被截掉的那部分不能就此消失：
           · aria-label 给出「印记名 + 完整理由 + 去处」，读屏拿到的是全句；
           · title 改成「完整理由」（原来只有「回到 X 修改」—— 那句在
             aria-label 里已经有了，标题重复一遍反而挤掉了理由）。
         于是"触屏/键盘能获得完整内容"是结构上成立的，不依赖用户去
         长按或放大。 */
      btn.setAttribute('aria-label',
        `${m.label}：${reason}（点按回到「${m.label}」修改）`);
      btn.setAttribute('title', reason);
    }
    btn.addEventListener('click', () => {
      if (idx >= 0) { state.step = idx; render(); }
    });
    bar.appendChild(btn);
  });
  return bar;
}

function renderMasthead() {
  const isResult = state.step >= curSteps().length;
  /* 清单页是独立视图，不是"结果页的延续"。
     若这里沿用 isResult 的文案，用户会在「心仪清单」上方读到
     「你的三瓶候选 / 每一瓶的理由都能反推回你刚才的选择」——
     标题在说另一页的事（实测截图里一眼就是错的）。
     所以判据排在 isResult 之前：进了清单页，页头就先认这一页。 */
  const isWish = state.wishPage === true;
  const isEntry = !isWish && state.entry === null;
  /* 腿8-B：完整封面（hero+副标+香印）只第 1 屏；第 2–6 屏用短题头。
     页头本身由 CSS sticky 固定（返回/进度/题号/问题 ≤160px）。 */
  if (!isWish && !isResult && state.step > 0) {
    const cur = curSteps()[state.step];
    return el('header', { class: 'masthead is-short' },
      el('button', { class: 'masthead-back', type: 'button', onclick: prev }, '← 返回'),
      el('h1', {}, '第 ' + (state.step + 1) + ' 步 · ' + (cur ? (cur.short || '') : '')));
  }
  /* 边距仪器区（规格 5 的"留白深度"）。
     叶标题不变，页眉右侧那枚 .amb-tick 是**这一程走到哪儿的刻度**
     （方向 + 档位，如「亮·起」）。它不算装饰：没有它，"底噪随进程增强"
     这件事就只能靠感觉，无法核对。没方向时它不出现（诚实：确实还没有方向）。

     v7 起刻度**由 applyAmbient() 统一写**，这里不造节点 —— 见本函数末尾
     那段注解。所以这里不再需要 ambActive 这个局部判定。 */
  return el('header', { class: 'masthead' },
    // 封面标题里的「第一瓶」是全站唯一的高分量蓝色。
    // 用 em 而不是 span：它承载的是语义强调（"第一瓶"才是这个产品的承诺），
    // 顺带让 .masthead h1 em 这条样式有真实落点。
    isWish
      ? el('h1', {}, '我的', el('em', {}, '心仪'), '清单')
      : isResult
        ? el('h1', {}, '你的三瓶候选')
        : el('h1', {}, '从零开始，找到', el('em', {}, '第一瓶'), '香水'),
    el('p', { class: 'lede' },
      isWish
        ? '存过的瓶子都在这台设备上，点开就能看理由、参考价和去哪买'
        : isResult
          ? '每一瓶的理由都能反推回你刚才的选择，没有一句是编的'
          /* 首屏那句 lede 原来写「转盘选香型，再定场合和浓度」（a39e498），
             v6 撤盘时改成「先说预算和想要的感觉」，v7 圆盘回来了 ——
             入口二选一后，第一件事是选走哪条路，不再预设圆盘。 */
          : isEntry
            ? '先选一种开始方式，再定场合和浓度'
            : isEmotionScreen()
              ? '先选最接近的感受，再定场合和浓度'
              : '不用懂前中后调：先选大方向，再定场合和浓度'
    ),
    /* 入口返回不写答案；真正换路径时的清空集中在 chooseEntry。 */
    !isEntry && !isWish
      ? el('button', { class: 'entry-return', type: 'button', onclick: showEntry }, '重选入口')
      : null,
    /* 印��：纯装饰（aria-hidden），字取「香」—— 这个应用唯一的主题字。 */
    el('span', { class: 'seal', 'aria-hidden': 'true' }, '香')
    /* 刻度（.amb-tick）**不在这里造** —— 它现在由 applyAmbient() 统一写
       （见 updateAmbTick）。理由：圆盘是"选了不跳屏"的，点中香型只调
       applyAmbient() 而不会重绘页眉；若刻度只由这里造，用户点完会看到
       页眉右侧一片空白、底噪却已经亮了。
       v6 的写法是"页眉自己算一次"，那时只有大方向屏会写方向、且那一屏
       紧跟一次 render，所以看不出问题；第 1 屏是底噪开灯的地方之后，
       这个顺序差就成了可见缺陷。改成一个写者，两处不会再分叉。 */
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
       "点开后看到什么"的事实说明，删了才是骗人。
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
  disclosure: '购买链接含联盟推广；成交可能产生佣金，不影响你的支付价格。',
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

/* ============================================================
   结果屏首屏 3 列比较表（腿 7a1，2026-11-26）
   ------------------------------------------------------------
   方案（tmp/scent-redesign-plan-20261126.md 腿 7）：
     3 列比较表，行依次为：瓶图或标本卡、品牌加名字（最多两行）、
     一句白话理由（引用用户的某个答案）、留香（文字）、价格、购买按钮；
     每列顶部一个标签「最贴合 / 更好入手 / 换个方向」。
     无图：族色底 + 子类图标（复用那 24 枚）+ 角标「示意 · 无实拍」，
     不使用灰色占位。

   **这一块只做首屏比较**：往下滚的详情（前中后调三段条、完整依据）
   仍是既有的 `article.pick`，本腿一个字符都不动 —— 那是腿 7b 的活。
   两处共用同一批数据（results / PHOTOS / AFF_LINKS / PRICE_INDEX），
   不新算任何一项，所以首屏与详情不会出现两个数。

   ==== 柱子的标签 ====
   方案把三个标签与列位置写在同一句里，所以按位置固定：
   第 1 列「最贴合」、第 2 列「更好入手」、第 3 列「换个方向」，
   不额外比较两瓶的图/链接去争标签（那是排序环节的事）。

   ==== 一句白话理由 ====
   从引擎已经产出的 r.breakdown 里挑**命中用户答案**的那条因子，
   翻成一句短白话；每条都带一个用户说过的词（选的香型/小类、
   点名的香材、说的季节），不出现分数，也不新造事实。
   三列按同一优先级各取一条，已用过的锚点不再给下一列。 */

/* 这一瓶该用哪枚子类图标。三步，全部走数据里已有的东西，不新造分类：
     ① 族内规则级联（与 src/scoring.js 的 boundaryPenalty 同一套判据：
        priority 升序、第一个通过即归属；规则 id 与小类 id 同名）；
     ② 规则表为空的族（fresh / gourmand）用香材重叠数取最多的一类；
     ③ 还是一格都没命中的（实测 1388 瓶里 5 瓶）取该族第一个小类。
   结果只用来选图标：卡片角标已写着「示意 · 无实拍」，它不声称自己是
   精确分类，所以 ③ 这种兜底不构成对用户的错误陈述。 */
function cmpSubfamilyOf(p) {
  const famId = dominantFamily(p);
  const fam = TAX && Array.isArray(TAX.families)
    ? TAX.families.find((f) => f.id === famId) : null;
  if (!fam) return null;
  const subs = fam.subfamilies || [];
  if (!subs.length) return null;
  const notes = new Set((p.notesAll || []).map((n) => normNote(n)));
  const has = (n) => notes.has(normNote(n));
  const hitAny = (list) => (list || []).some(has);

  if (Array.isArray(fam.rules) && fam.rules.length) {
    const passes = (r) => {
      if (!r) return false;
      if (r.always) return true;
      if (r.must && !r.must.every(has)) return false;
      if (r.not && r.not.some(has)) return false;
      if (r.any && !hitAny(r.any)) return false;
      return true;
    };
    const ordered = [...fam.rules].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
    const rule = ordered.find(passes);
    if (rule && subs.some((s) => s.id === rule.id)) return rule.id;
  }

  let best = null; let bestHit = 0;
  for (const s of subs) {
    const n = (s.notes || []).filter(has).length;
    if (n > bestHit) { bestHit = n; best = s.id; }
  }
  return best || subs[0].id;
}

/* 无实拍那一格：族色底 + 子类图标。取图与盘心、避雷卡、中圈胶囊
   走**同一条**通路（artPath → ART_CACHE / ART_READY），不新造图标、
   不新造缓存。图标没到或取图失败时返回空 span，CSS 用 :empty 整块拿掉 ——
   于是"没图"读作"一块族色纸"，而不是"一块缺了图标的白框"。 */
function cmpSpecimenIcon(subId) {
  const box = el('span', { class: 'cmp-fig-icon', 'aria-hidden': 'true' });
  const path_ = artPath(subId);
  if (!path_) return box;
  const wrap = (inner) => {
    box.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">'
      + artNs(inner, 'c' + (++artSeq)) + '</svg>';
  };
  const ready = ART_READY.get(path_);
  if (ready) { wrap(ready); return box; }
  artInnerPath(path_).then((inner) => {
    if (!inner || !box.isConnected) return;
    wrap(inner);
  }).catch(() => { /* 取图失败：保持空 span，这一格就是纯族色底 */ });
  return box;
}

/* 留香写成一句人话。数据源没有持香字段，longevityInferred 是按浓度推的
   （taxonomy.concentrationLongevity.note 已声明），所以文案必须保留"推断"
   的意思 —— 这里取的就是那张表里的同一段区间（3-5h → 3–5 小时），
   单位换算是格式，不是新数据；表里没有这一档就退到「留香未标注」。

   分两行而不是一行加括号：110px 宽下「留香 3–5 小时（按浓度推断）」
   会在"（按浓"处折行，一个词被劈成两半。拆成"值 + 一句来源"两行，
   断点落在语义边界上，而且这句来源**必须留**（见上）。 */
function cmpLongevityText(p) {
  const n = p && p.longevityInferred;
  const labels = (TAX && TAX.concentrationLongevity && TAX.concentrationLongevity.labels) || {};
  const raw = n == null ? null : labels[String(n)];
  const m = raw ? String(raw).match(/（([^）]+)）/): null;
  if (!m) return { value: '留香未标注', note: '' };
  const span = m[1]
    .replace(/^<(\d+)h$/, '不到 $1 小时')
    .replace(/^(\d+)-(\d+)h$/, '$1–$2 小时')
    .replace(/^(\d+)h\+$/, '$1 小时以上');
  return { value: '留香 ' + span, note: '按浓度推断' };
}

/* 价格：只报价位带，不编具体价。查不到就明说未标注 ——
   方案要求这一行存在，而"空着"会让三列的行高对不齐。 */
function cmpPriceText(p) {
  const label = priceLabelOf(p && p.id, priceIndex());
  return label || '价位未标注';
}

/* 从引擎已经算好的 r.breakdown 里挑一条**命中用户答案**的因子，
   翻成一句短白话。只做措辞，不改变匹配结果，也不编造没有的用户输入。
   三列按同一优先级各取一条，已用过的锚点不再给下一列。 */
const CMP_SEASON_ZH = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
const CMP_WARMTH_ZH = { warm: '暖', cool: '凉', neutral: '中间' };
const CMP_CONC_ZH = { edp: '浓香', edt: '淡香', parfum: '香精', edc: '古龙水', elf: '淡香水' };
function cmpSentenceOf(b, profile) {
  if (!b) return '';
  const names = (list) => [...new Set((list || []).filter(Boolean))].slice(0, 2).join('、');
  switch (b.factor) {
    case 'subfamilyHits':
      return b.hits && b.hits.length
        ? `你选的${b.subfamilyZh || '那一路'}，${names(b.hits)}就在这瓶里` : '';
    case 'family':
      if (!b.pickZh) return '';
      return `你选的${b.pickZh}，这瓶${b.pickWeight >= 0.99 ? '以它为主' : b.pickWeight >= 0.6 ? '主调是它' : '也带一点'}`;
    case 'likedNotes':
      return b.hits && b.hits.length ? `含你点名的${names(b.hits)}` : '';
    case 'anchor':
      return b.hits && b.hits.length ? `含你看过那瓶的${names(b.hits)}` : '';
    case 'emotionNotes':
      return b.hits && b.hits.length && profile && profile.emotionZh
        ? `你说爱「${profile.emotionZh}」，靠${names(b.hits)}` : '';
    case 'season':
      return CMP_SEASON_ZH[b.season] ? `你说${CMP_SEASON_ZH[b.season]}季，这瓶也标了${CMP_SEASON_ZH[b.season]}季` : '';
    case 'timeOfDay':
      return b.time ? `你要${b.time === 'day' ? '白天' : '夜晚'}，这瓶合适` : '';
    case 'character':
      return b.character ? `有你要的「${b.characterZh || b.character}」` : '';
    case 'concentration':
      return b.concentration ? `浓度是你要的${CMP_CONC_ZH[b.concentration] || b.concentration}` : '';
    case 'temperature':
      return b.want && b.want !== 'neutral' && b.mine
        ? `你说要${CMP_WARMTH_ZH[b.want]}的，这瓶偏${CMP_WARMTH_ZH[b.mine] || '中间'}` : '';
    case 'intensity': {
      /* 引擎原句「厚重感 0.5，比你要的 3/5 更清透」带分数，首屏一律不上数字。
         翻成新手语言：只说浓淡感受（「偏清爽，不闷」），并用「你要的」
         把这句接到用户刚才选的浓淡档，不新造事实。 */
      const want = profile && Number(profile.intensity) ? Number(profile.intensity) : 3;
      const target = (want - 1) / 4;
      const heavy = Number(b.heaviness || 0);
      if (Math.abs(heavy - target) <= 0.12) return '浓淡刚好，和你要的差不多';
      return heavy < target ? '比你要的更清爽，不闷' : '比你要的更浓郁，存在感更强';
    }
    case 'dislikedFamily':
      return b.familyZh ? `不属于你划掉的${b.familyZh}` : '';
    default:
      return '';
  }
}
const CMP_REASON_ORDER = [
  'subfamilyHits', 'family', 'likedNotes', 'anchor', 'emotionNotes',
  'season', 'timeOfDay', 'character', 'concentration', 'temperature', 'intensity', 'dislikedFamily',
];
function cmpReasonOf(r, profile, used) {
  const rows = ((r && r.breakdown) || []).filter(Boolean);
  let fallback = '';
  for (const factor of CMP_REASON_ORDER) {
    const b = rows.find((x) => x.factor === factor);
    const text = cmpSentenceOf(b, profile);
    if (!text) continue;
    if (!fallback) fallback = text;
    if (!used.has(text)) return text;
  }
  return fallback;
}

/* 这一瓶的购买入口：首屏只有一格位置，所以只出一条，挑法从"最像这一瓶"
   往下顺延 —— 商品页 > 无佣金直达页 > 平台搜索页。
   `searchLanding` 的 direct 链接（淘宝 official/market 两个渠）落地是
   **搜索结果页**，所以它必须说「搜」不能说「直达」（与详情卡同一套诚实规则）。 */
function cmpBuyOf(p, aff) {
  const links = affiliateLinks(p, aff) || [];
  const product = links.find((l) => l.kind !== 'search' && !l.searchLanding);
  if (product) {
    return {
      href: product.href, platform: product.platform, platformZh: product.platformZh,
      kind: product.kind, direct: product.kind === 'direct', isProduct: true,
      label: '直达商品',
    };
  }
  /* 没有商品页：方案点名「去淘宝搜这瓶」。走既有 platformLinks 取配置，
     不手拼 URL；淘宝配不出来时才退其它平台，文案按实际平台写。 */
  const tao = platformLinks(p, 'taobao', aff) || [];
  const l = tao[0] || links[0];
  if (!l) return null;
  return {
    href: l.href, platform: l.platform, platformZh: l.platformZh,
    kind: l.kind, direct: l.kind === 'direct', isProduct: false,
    label: `去${l.platformZh}搜这瓶`,
  };
}

/* 三列标签：方案把标签与列位置写在同一句里，按位置固定。 */
const CMP_TABS = ['最贴合', '更好入手', '换个方向'];
function cmpTabLabels(results) {
  return results.map((_, i) => CMP_TABS[i] || '');
}

/* 一格标本卡（无实拍）。族色底取自瓶子的主族，与详情卡的瓶形配色同源，
   所以同一瓶在首屏和详情里是同一个色系。 */
function cmpFigure(p) {
  const fam = dominantFamily(p);
  const sub = cmpSubfamilyOf(p);
  const specimen = () => el('figure', { class: 'cmp-fig is-specimen', 'data-fam': fam },
    cmpSpecimenIcon(sub),
    el('figcaption', { class: 'cmp-fig-tag' }, '示意 · 无实拍'));
  const src = artSourceOf(p, PHOTOS);
  if (!src) return specimen();
  const img = el('img', {
    src,
    alt: '',
    role: 'presentation',
    loading: 'lazy',
    decoding: 'async',
    draggable: 'false',
  });
  const fig = el('figure', { class: 'cmp-fig is-photo' }, img);
  /* 照片路径失效也按「无图」处理：换成族色标本卡，不留下白破图。 */
  img.addEventListener('error', () => {
    fig.replaceChildren(cmpSpecimenIcon(sub),
      el('figcaption', { class: 'cmp-fig-tag' }, '示意 · 无实拍'));
    fig.className = 'cmp-fig is-specimen';
    fig.dataset.fam = fam;
  });
  return fig;
}

/* 整张表。results 顺序即详情卡顺序（第 1 列 = 候选 01）。 */
function renderCompareTable(results, profile) {
  const aff = affiliateConfig();
  const buys = results.map((r) => cmpBuyOf(r.perfume, aff));
  const tabs = cmpTabLabels(results);
  /* 三列的理由逐列挑，已用过的那句交给下一列排除（判据见 cmpReasonOf）。 */
  const usedReasons = new Set();

  const cols = results.map((r, i) => {
    const p = r.perfume;
    const buy = buys[i];
    const reasonText = cmpReasonOf(r, profile, usedReasons);
    if (reasonText) usedReasons.add(reasonText);

    const buyNode = buy
      ? el('a', {
        class: 'cmp-buy' + (buy.isProduct ? '' : ' is-search'),
        href: buy.href,
        target: '_blank',
        rel: buy.direct ? 'sponsored noopener noreferrer' : 'noopener noreferrer',
        'data-affiliate': buy.direct ? 'true' : 'false',
        'data-kind': buy.kind,
        'data-platform': buy.platform,
        /* 首屏按钮只有 4–5 个字，把"去哪、是不是商品页"补进无障碍名 ——
           视觉上放不下的信息，读屏不该跟着丢。 */
        'aria-label': buy.isProduct
          ? `在${buy.platformZh}直达 ${p.brand} ${p.name} 的商品页（新窗口）`
          : `在${buy.platformZh}搜索 ${p.brand} ${p.name}（新窗口，搜索结果页）`,
      }, buy.label)
      : el('p', { class: 'cmp-nobuy' }, '暂无购买入口');

    const longevity = cmpLongevityText(p);

    return el('div', { class: 'cmp-col' },
      el('p', { class: 'cmp-tab' }, tabs[i]),
      cmpFigure(p),
      el('div', { class: 'cmp-names' },
        el('p', { class: 'cmp-brand' }, p.brand || ''),
        el('h3', { class: 'cmp-name', title: p.name }, p.name)),
      el('p', { class: 'cmp-reason' }, reasonText),
      el('p', { class: 'cmp-meta' },
        el('span', { class: 'cmp-sr' }, '留香'),
        longevity.value,
        longevity.note ? el('span', { class: 'cmp-meta-note' }, longevity.note) : null),
      el('p', { class: 'cmp-price' },
        el('span', { class: 'cmp-sr' }, '价格'),
        cmpPriceText(p)),
      buyNode);
  });

  return el('section', { class: 'cmp', 'aria-label': '三瓶对比' },
    el('div', { class: 'cmp-cols' }, ...cols));
}

/* ============================================================
   详情区（腿 7b，2026-11-26）：三调三段条 + 推荐依据对照表
   ------------------------------------------------------------
   首屏比较表把每瓶压到 110px：理由四行、三调只剩香材名。往下滚的详情
   回答另一件事 —— "它到底是什么味道、为什么是它"。

   ① 三段条：一条按**香材数量**分段的横条。
      为什么不给"前调 30%/中调 50%"这种权重：数据源只有香材清单，没有
      各段强度。凭空给百分比是在造一个数据源里没有的数。
      为什么不是三根独立条：同一把尺子才读得出"重心在哪一段"。
   ② 依据：每条「你答的 X → 所以推这瓶」。why 那一行直接复用首屏的
      cmpSentenceOf —— 同一事实在首屏与详情里必须是同一句，两处各写一套
      措辞迟早会一处说"更清爽"、另一处说"更浓郁"。
   ============================================================ */

/* 三段的显示名与那句白话提示，与 .pyramid 的三行一一对应。
   两处取同一份表，避免"条上写前调、表里写头香"这种自相矛盾。 */
const PD_STAGES = [
  { key: 'is-top', label: '前调', tip: '最先闻到的 15 分钟' },
  { key: 'is-mid', label: '中调', tip: '半小时后的主体' },
  { key: 'is-base', label: '后调', tip: '留在皮肤上的余味' },
];

/* 一层的香材 → 上屏用的去重列表（Batch 5 腿 B5-4）。
   键："有译名就用中文名，否则用英文名"；同一键只出一条，但把落到这个键上的
   **全部英文原名**都收进 ens —— 中文只写一次，英文一个不漏。
   为什么英文不许丢：data/note-zh.json 里有 9 组多对一译名
   （Neroli / Orange Blossom 都译「橙花」）。丢掉一个英文名，读屏与
   「英文原名保留」这条既有验收就同时失效，而且用户会以为数据里只有一味。
   两个来源的重复（多对一译名 / 上游同层同名重复）都在这一步收掉，
   见 renderResult 三调渲染那段的长注释。

   **三段条与三调表必须共用这个函数**：条上的段长要与表里列出的条数逐段相等，
   而那条相等是 test-render 的既有断言（「条和表同一份数据」）。
   两处各写一套去重逻辑，迟早会出现一条 4 味、一张表 3 味的假绿。 */
function pdNotesOf(list) {
  const byKey = new Map();
  (Array.isArray(list) ? list : []).forEach((en) => {
    const zh = NOTE_ZH[en];
    const key = zh || String(en);
    const hit = byKey.get(key);
    if (hit) {
      if (!hit.ens.includes(String(en))) hit.ens.push(String(en));
      return;
    }
    byKey.set(key, { en: String(en), zh, ens: [String(en)] });
  });
  return [...byKey.values()];
}

/* 三段条本体。aria-hidden：真实信息在下面的 .pyramid 里，
   条只是同一份数据的一张图。让它进无障碍树等于同一个事实念两遍。

   段长直接由**香材数量**决定（flex-grow: var(--g)），不在 JS 里算百分比：
   百分比要减掉 gap / 最小宽度这些固定像素才准，而一改 CSS 就得同步改 JS。
   把数量交给 flex 后，"前调 3 味 / 后调 1 味"天然就是 3:1。
   空段给 --g:0，由 CSS 的 min-width 兜住一块虚线框。

   数量取 pdNotesOf 去重后的长度（与下面那张表同一个数）—— 不去重的话，
   Calèche 的前调会画出 6 段而表里只有 5 味，「条」和「表」当场对不上。 */
function pdTrack(p) {
  const lists = [p.top, p.heart, p.base].map((l) => pdNotesOf(l));
  return el('div', { class: 'pd-track', 'aria-hidden': 'true' },
    ...PD_STAGES.map((s, i) => el('span', {
      class: 'pd-seg ' + s.key + (lists[i].length ? '' : ' is-empty'),
      style: `--g:${lists[i].length}`,
      'data-notes': String(lists[i].length),
    })));
}

/* ---- 依据的"你答的哪一题"那一行 ----
   全是用户自己的原话/原选项，不解释算法。
   拿不到原话时返回空串 —— 那一行宁可不出现，也不许编一句"根据综合评估"。 */
function pdAskOf(b, profile) {
  if (!b) return '';
  switch (b.factor) {
    case 'subfamilyHits':
      return b.subfamilyZh ? `你选的小类：${b.subfamilyZh}` : '';
    case 'family':
      return b.pickZh ? `你选的香型：${b.pickZh}`
        : (profile && profile.familyZh ? `你选的香型：${profile.familyZh}` : '');
    case 'likedNotes':
      return b.hits && b.hits.length ? `你点名想要的：${b.hits.slice(0, 2).join('、')}` : '';
    case 'anchor':
      return '你试过并喜欢的那瓶';
    case 'emotionNotes':
      return profile && profile.emotionZh ? `你选的感觉：${profile.emotionZh}` : '';
    case 'season':
      return CMP_SEASON_ZH[b.season] ? `你打算${CMP_SEASON_ZH[b.season]}天穿` : '';
    case 'timeOfDay':
      return b.time ? `你要的时段：${b.time === 'day' ? '白天' : '夜晚'}` : '';
    case 'character':
      return b.character ? `你要的气质：${b.characterZh || b.character}` : '';
    case 'concentration':
      return b.concentration ? `你选的浓度：${CMP_CONC_ZH[b.concentration] || b.concentration}` : '';
    case 'temperature':
      return b.want && b.want !== 'neutral'
        ? `你要的冷暖：偏${CMP_WARMTH_ZH[b.want] || b.want}` : '';
    case 'intensity':
      /* 只写"你选的浓淡档"，不写 3/5：详情区是新手语言区，
         分数口径由 result-head 与 .profile-line 承担，两处别混。 */
      return '你选的浓淡档';
    case 'dislikedFamily':
      return '你划掉的那一族';
    default:
      return '';
  }
}

/* ---- 依据的"所以推这瓶"那一行 ----
   与首屏 cmpSentenceOf 分开写，两处各有理由：
     · 首屏是 110px 宽的一格，句子要短到四行装得下；
     · 详情区是新手语言区，且**不许出现分数**（"厚重感 0.42""5/5"这类
       术语属于首屏之外的方法论说明，见 .profile-line）。
   结构性三条（家族 / 直选家族 / 浓淡）保留"主调是""主体就是""浓郁度"
   这些说法：它们是这张卡的骨架，读者靠这三句判断"这是不是我那一类"，
   换成一串形容词就失去可核对性（test-render 也按这三个词判骨架）。
   其余因子直接复用首屏那句话 —— 同一事实两处措辞必须一致。 */
function pdWhyOf(b, profile) {
  if (!b) return '';
  switch (b.factor) {
    case 'family': {
      if (!b.pickZh) return cmpSentenceOf(b, profile);
      const rest = b.secondaryZh ? `，底下还垫着${b.secondaryZh}` : '';
      if (b.pickWeight >= 0.99) return `这瓶的主体就是${b.pickZh}${rest}`;
      if (b.pickWeight >= 0.6) return `这瓶的主调是${b.pickZh}${rest}`;
      return `它只是带一点${b.pickZh}，不是主角`;
    }
    case 'familyPick':
      return cmpSentenceOf(b, profile) || '';
    case 'intensity': {
      /* 只说浓淡感受，不上数字。判据与 scoring 同一套（差值 0.12 分三档），
         只是把"厚重感 0.42 比你要的 5/5"翻成"比你要的更清爽"。 */
      const want = profile && Number(profile.intensity) ? Number(profile.intensity) : 3;
      const target = (want - 1) / 4;
      const heavy = Number(b.heaviness || 0);
      if (Math.abs(heavy - target) <= 0.12) return '它的浓郁度和你选的那档刚好对上';
      return heavy < target
        ? '它的浓郁度比你要的淡一些，喷上更清爽不闷'
        : '它的浓郁度比你要的重一些，存在感更强';
    }
    default:
      return cmpSentenceOf(b, profile);
  }
}

/* 依据整表。顺序沿用首屏的 CMP_REASON_ORDER（用户点名的排最前），
   同一条句子不重复出现；再补上 ⚠️ 提醒（持香与场合不搭之类），
   它们不是"为什么推它"，放在组内最后并标 warn。

   上限 3 与结果卡原有一条硬约束同值（scoring 的 MAX_REASONS）：依据是
   解释，不是清单 —— 四条以上读者会跳读，而且会让卡片在 390 下多出一屏。

   **至少一条结构性因子**（家族 / 浓淡）与 scoring 的 STRUCTURAL_FACTORS
   同义：只留"你点名想要的那味香材"会让读者以为这瓶是靠一个香材推出来的，
   而真正决定排序的是家族与浓淡。缺了就从候选里补一条进来。 */
const PD_BASIS_MAX = 3;
const PD_STRUCTURAL = new Set(['family', 'familyPick', 'intensity']);
function pdBasisOf(r, profile) {
  const rows = ((r && r.breakdown) || []).filter(Boolean);
  const picked = [];
  const seen = new Set();
  const take = (b) => {
    const ask = pdAskOf(b, profile);
    const why = pdWhyOf(b, profile);
    if (!ask || !why || seen.has(why)) return null;
    seen.add(why);
    return { factor: b.factor, ask, why, warn: false };
  };
  for (const factor of CMP_REASON_ORDER) {
    if (picked.length >= PD_BASIS_MAX) break;
    const b = rows.find((x) => x.factor === factor);
    if (!b) continue;
    const item = take(b);
    if (item) picked.push(item);
  }
  /* 补结构性：名额已满就顶掉最后一条非结构性项，再按原优先级重排。 */
  if (!picked.some((x) => PD_STRUCTURAL.has(x.factor))) {
    for (const factor of CMP_REASON_ORDER) {
      if (!PD_STRUCTURAL.has(factor)) continue;
      const b = rows.find((x) => x.factor === factor);
      if (!b) continue;
      const item = take(b);
      if (!item) continue;
      if (picked.length >= PD_BASIS_MAX) picked.pop();
      picked.push(item);
      break;
    }
    const rank = (f) => {
      const i = CMP_REASON_ORDER.indexOf(f);
      return i < 0 ? 99 : i;
    };
    picked.sort((a, b) => rank(a.factor) - rank(b.factor));
  }
  /* 提醒项从 r.reasons 取（buildReasons 用 ⚠️ 前缀标记它们），不重复算一遍
     持香逻辑 —— 那条判断在 scoring 里，前端只负责显示。
     提醒不许挤掉结构性项：顶掉的是"最后一条非结构性项"，没有就不加。 */
  ((r && r.reasons) || []).filter((t) => String(t).startsWith('⚠️')).forEach((t) => {
    const why = String(t).replace('⚠️', '').trim();
    if (!why || seen.has(why)) return;
    if (picked.length >= PD_BASIS_MAX) {
      const at = picked.map((x) => PD_STRUCTURAL.has(x.factor)).lastIndexOf(false);
      if (at < 0) return;
      picked.splice(at, 1);
    }
    seen.add(why);
    picked.push({ factor: 'warn', ask: '提醒', why, warn: true });
  });
  return picked;
}

/* 一个详情小节的标题行：12px 大写字距，与 .chips-label 同语汇。 */
function pdLabel(text) {
  return el('p', { class: 'pd-label' }, text);
}

/* ============================================================
   结果页的三样新增能力（Qoder 改造，2026-11-18）
   ------------------------------------------------------------
   ① 我的香水档案：最近 5 次结果只落 localStorage，回看/清空都在本页完成；
   ② 分享卡片 PNG：纯 canvas 画一张竖版卡，浏览器直接下载；
   ③ 两者都不联网：档案不上传，卡片不加载任何外部图。
   ============================================================ */

/** 取 localStorage 的安全入口：隐私模式/嵌入 WebView 里它可能直接抛错。 */
function localStorageSafe() {
  try {
    /* 走 window 而不是裸 localStorage：Node 24 的全局 localStorage
       在未加 --localstorage-file 时会打一条实验性警告，测试输出会被它污染。 */
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/* ============================================================
   心仪清单 · 结果页入口（L2，2026-11-23）
   ------------------------------------------------------------
   数据层在 src/wishlist.js（L1，已冻结）：它只认「存进去的那三键」，
   存储不可用时返回 status:'unavailable' 而不是抛错。这一层（app.js）
   只负责画：一颗 ♡、一次点击、一行提示。

   判断与编排全在 src/wish-ui.js（纯逻辑、不碰 DOM），这里只剩渲染：
     · 初始化与回显都读 wishIsSaved(id)（空心 = 未存，实心 = 已存）；
     · 点击 → wishSession.toggle(id, wishReasonOf(r)) → 重画 ♡ → say(...)
     · reason 取「本轮结果里引擎给的那句原文」（r.reasons[0]），不重算、不改写；
     · status:'full' / 降级提示的文案由 wishMessage() 统一给出，逐字对应任务书。
   ============================================================ */

/* 一次页面会话：真存储实例 + 内存兜底（兜底逻辑全在 src/wish-ui.js，
   那里能在 node 里直接喂内存存储测「满 50」「隐私模式」两条路径）。
   第三个参数把真存储介质**显式**交给会话：撤销移除与取消已入手这两个动作
   不在 L1 的 API 里，得自己读写那个键 —— 写谁必须由调用方指定，
   不能让会话去猜 globalThis（否则测试与浏览器走两条路，正是"测试全绿、
   线上不对"的典型成因）。 */
const wishSession = createWishSession(wishlist, undefined, () => localStorageSafe());

/** 初始化与回显都走这条：空心 = 未存，实心 = 已存。 */
function wishIsSaved(id) {
  return wishSession.has(id);
}

/**
 * 存入提示的**单例**（挂 document.body，见 renderResult 里的原因）。
 *
 * 为什么是单例而不是每次渲染新建：结果页会因「换一批」「改一题」反复重建，
 * 每次往 body 追加一条的话，翻几轮就攒出一堆重叠的旧提示；而且旧提示的
 * 定时器还会把**新**提示提前关掉（它们共用同一个 hidden 语义）。
 * 单例让"当前该显示什么"只有一个宿主。
 */
let WISH_BAR = null;
function ensureWishBar() {
  if (WISH_BAR && WISH_BAR.isConnected) return WISH_BAR;
  WISH_BAR = el('p', {
    class: 'qw-wish-bar',
    role: 'status',
    /* aria-live=polite：只在读屏空闲时播报，不打断用户正在读的卡片内容。 */
    'aria-live': 'polite',
    hidden: '',
  });
  try {
    document.body.appendChild(WISH_BAR);
  } catch {
    /* 没有 body（测试桩 / 极端环境）：结果页照常渲染，提示降级为不显示。
       提示是锦上添花，不该成为"整页白屏"的原因。 */
    WISH_BAR = null;
    return el('p', { class: 'qw-wish-bar', hidden: '', 'aria-live': 'polite' });
  }
  return WISH_BAR;
}

/**
 * 提示条**唯一**的计时器（2026-11-24 复查追加项 4）。
 *
 * 原来有三套定时器各管一段，都往同一条 .qw-wish-bar 上写：
 *   ① 结果页 sayWish（2000ms，自己一个 wishTimer）
 *   ② 清单页 sayWishPage（2000 / 撤销 5000ms，WISH_PAGE_TIMER）
 *   ③ 盖章 stampSay（2400ms，STAMP_TIMER）
 * 每一套只 clear 自己那一个，于是 A 的计时到点会去抹 **B 刚写上去的** 文案：
 * 谁最后写的并不重要，谁**先**挂上计时谁先到点，条子就被提前清空。
 * 实测症状（test-render 唯一红）：清单行撤销后 250ms 读到的是空串 ——
 * 撤销那句 2400ms 的条子被前一句遗留的计时清掉了。
 *
 * 现在只留一个计时器：写条子的函数排定它，收条子的函数取消它，
 * 「这条条子什么时候消失」永远只有一个答案。
 */
let WISH_BAR_TIMER = 0;

/** 收起提示条，并取消它身上现有的计时。 */
function hideWishBar() {
  clearTimeout(WISH_BAR_TIMER);
  WISH_BAR_TIMER = 0;
  const bar = ensureWishBar();
  if (!bar) return;
  bar.setAttribute('hidden', '');
  bar.textContent = '';
}

/** 排定「多久之后收起」。清掉上一句的计时再挂新的 —— 这是唯一入口。 */
function scheduleWishBarHide(ms) {
  clearTimeout(WISH_BAR_TIMER);
  WISH_BAR_TIMER = setTimeout(hideWishBar, ms);
}

/**
 * 一颗 ♡。空心 = 未存，实心 = 已存；点击切换存/删。
 *
 * 位置：瓶名行右端（`.pick-name-row` 的末尾）。购买按钮在卡片页脚
 * （`.pick-foot`），与这里隔着三调表、理由、标签三块 —— 一上一下两端，
 * 手滑点不到对方。这不是靠间距凑的，是两块本来就在卡片的两头。
 */
function wishHeart(p, r, say) {
  const id = String(p && p.id || '');
  const saved0 = wishIsSaved(id);
  const glyph = el('span', { class: 'qw-wish-glyph', 'aria-hidden': 'true' });
  /* 心形用内联 SVG 而不是 ♡/♥ 两个字符：字符的字形与基线由系统字体决定，
     390px 下不同设备能差出一档大小，而这里要求"可辨"是硬指标。
     SVG 的尺寸完全由 CSS 说了算，空心/实心只差一个 fill。 */
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3'
    + 'c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5'
    + 'c0 3.78-3.4 6.86-8.55 11.54L12 21.35z');
  svg.appendChild(path);
  glyph.appendChild(svg);

  const name = (p && p.name) || '这一瓶';
  const labelSaved = `从心仪清单移除${name}`;
  const labelUnsaved = `收藏${name}到心仪清单`;
  const btn = el('button', {
    class: 'qw-wish' + (saved0 ? ' is-on' : ''),
    type: 'button',
    'aria-pressed': saved0 ? 'true' : 'false',
    'aria-label': saved0 ? labelSaved : labelUnsaved,
    title: saved0 ? '从心仪清单移除' : '存入心仪清单',
    'data-wish': id,
  }, glyph);

  btn.addEventListener('click', (ev) => {
    /* 结果卡里没有卡片级点击，但 ♡ 挨着可选的文字，停一下冒泡更稳：
       将来若给卡片加了整体点击，也不会变成"存了还顺带跳走"。 */
    ev.stopPropagation();
    const res = wishSession.toggle(id, wishReasonOf(r));
    const on = wishIsSaved(id);

    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? labelSaved : labelUnsaved);
    btn.setAttribute('title', on ? '从心仪清单移除' : '存入心仪清单');
    /* 一次短脉冲：手指点在按钮上，除了心形变实心，还要有一点"收下了"的动静。 */
    btn.classList.remove('is-pop');
    void btn.offsetWidth;
    btn.classList.add('is-pop');

    say(wishMessage(res));
  });

  return btn;
}

/* 结果页摘要卡与分享 PNG 共用这一份价格档文案：
   两处必须一字不差，否则用户会以为自己下载错了卡片。 */
function currentBudgetZh() {
  const idx = priceIndex();
  const cur = state.answers.budget || 'any';
  if (!idx || cur === (idx.anyId || 'any')) return null;
  const b = (idx.bands || []).find((x) => x.id === cur);
  return b ? b.zh : null;
}

function formatHistoryTime(t) {
  const d = new Date(t);
  if (!Number.isFinite(d.getTime())) return '时间未知';
  try {
    return d.toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch {
    return d.toISOString().slice(5, 16).replace('T', ' ');
  }
}

/* ============================================================
   试香盖章（2026-11-23）
   ------------------------------------------------------------
   主入口在**香水档案的每一瓶**上（任务书第 2 条）：档案面板展开后，
   每个瓶名行右端一个轻量操作位 —— 未盖章是「试过？盖章」，
   已盖章换成状态 chip（`✓ 11-23 · 喜欢 · 共 2 次`）。

   五档口径（Eddie 2026-11-23 拍板，仓库里旧提案写的三档作废）：
     一闻钟情 / 喜欢 / 还行 / 无感 / 劝退 —— 顺序与文案都在 src/stamp.js，
     这里只按 stampTiers() 铺按钮，不另抄一份。

   三条不作为（任务书明确要求，写成注释免得下一腿顺手加上）：
     ① 盖了高档位**不**自动把该瓶加进心仪清单，不做任何一键联动；
     ② 历史**只显示最近一次 + 共 N 次**，不铺全量列表（stampViewOf 连
        数组都不交出来，调用方想铺也没有数据可铺）；
     ③ 盖章记录不参与推荐打分、不写进档案键、不改档案旧字段。

   两段式：点入口只打开面板，必须在面板里显式选一档再按「保存」才落记录 ——
   单击永远不等于盖章（与档案的两段式清空同一条克制口径）。
   ============================================================ */

/* 盖章会话：真存储是 localStorage 上的盖章实例，存储不可用时自动换一份
   页面内存介质（逻辑全在 src/stamp-ui.js，node 里可喂内存测）。
   介质**显式**交给数据层（`createStamps(() => localStorageSafe())`），
   不用 src/stamp.js 那个默认实例 —— 默认实例绑的是 globalThis.localStorage，
   而全站其余存储（档案、心仪）都走 localStorageSafe()（window.localStorage）。
   两者在浏览器里恰好是同一个对象，但一旦不是（Node 的全局 localStorage、
   嵌入 WebView 的隔离 window），档案与盖章就会落到两个不同的介质上，
   表现成"档案里有这瓶、盖章说没盖过"。写入介质只能有一个来源。 */
const stampSession = createStampSession(
  createStamps(() => localStorageSafe()),
  undefined,
  () => localStorageSafe(),
);

/**
 * 一行提示（复用档案/清单同一条单例提示条，不另造 toast）。
 * 为什么复用：全站只有一个"提示"的样子，用户不必重新学"这条会不会自己消失"。
 * 计时统一交给 scheduleWishBarHide —— 这里不再持有自己的定时器。
 */
function stampSay(msg) {
  const bar = ensureWishBar();
  if (!bar) return;
  bar.textContent = '';
  bar.appendChild(document.createTextNode(String(msg)));
  bar.removeAttribute('hidden');
  scheduleWishBarHide(2400);
}

/** 给 CSS/测试认的一个稳定身份：瓶的身份键（归一化 name|brand）。 */
function stampDataKey(bottle) {
  return stampKeyOf(bottle);
}

/**
 * 五档面板。档位按钮是 role=radio（一组互斥选项，不是五个开关）——
 * 读屏用户听到的是「单选组 试香评价」而不是五个独立按钮。
 */
function stampPanel(bottle, done) {
  const view = stampViewOf(stampSession.get(bottle));
  const name = bottle.name || '这一瓶';
  const panel = el('div', {
    class: 'qw-stamp-panel',
    role: 'group',
    'aria-label': `给${name}盖章`,
    'data-stamp-panel': stampDataKey(bottle),
  });

  panel.appendChild(el('p', { class: 'qw-stamp-hint' }, '这瓶试过之后感觉如何？'));

  let picked = view.has ? view.tier : '';
  const group = el('div', { class: 'qw-stamp-tiers', role: 'radiogroup', 'aria-label': '试香评价' });
  const btns = stampTiers().map((t) => {
    const b = el('button', {
      class: 'qw-stamp-tier' + (picked === t.id ? ' is-picked' : ''),
      type: 'button',
      role: 'radio',
      'aria-checked': picked === t.id ? 'true' : 'false',
      'data-tier': t.id,
      onclick: () => {
        picked = t.id;
        btns.forEach((x) => {
          const on = x.getAttribute('data-tier') === t.id;
          x.classList.toggle('is-picked', on);
          x.setAttribute('aria-checked', on ? 'true' : 'false');
        });
        save.removeAttribute('disabled');
      },
    }, t.zh);
    return b;
  });
  btns.forEach((b) => group.appendChild(b));
  panel.appendChild(group);

  const save = el('button', {
    class: 'btn qw-stamp-save',
    type: 'button',
    /* 没选档就按不了「保存」：空着保存等于盖一枚没有评价的章。 */
    disabled: picked ? null : '',
    onclick: () => {
      if (!picked) return;
      const res = stampSession.stamp(bottle, picked);
      stampSay(stampMessage(res));
      done();
    },
  }, '保存');

  const actions = el('div', { class: 'qw-stamp-actions' }, save,
    el('button', {
      class: 'link-btn qw-stamp-cancel',
      type: 'button',
      onclick: () => done(),
    }, '取消'));

  /* 撤销只在真的盖过时出现：没有记录却给一个「撤销」，用户点下去只会
     得到一句「已撤销」，而他其实什么都没撤销过。 */
  if (view.canUndo) {
    actions.appendChild(el('button', {
      class: 'link-btn qw-stamp-undo',
      type: 'button',
      onclick: () => {
        const res = stampSession.undo(bottle);
        stampSay(stampMessage(res));
        done();
      },
    }, '撤销上次盖章'));
  }
  panel.appendChild(actions);
  return panel;
}

/**
 * 某一瓶的盖章位：未盖 → 「试过？盖章」；已盖 → 状态 chip + 撤销。
 * 两种形态都由 stampViewOf 决定（`has`），所以"显示什么"与"存了什么"同源。
 *
 * **一处实现、两处挂载**（2026-11-23 补：心仪清单每行也要这个入口）：
 * 档案的瓶名行与清单行的盖章位行共用这同一个函数，`opts.surface` 只用来
 * 让 CSS/测试认出"这个章位挂在哪一屏"，不改变任何行为。复制一份到清单侧
 * 是这一腿最容易走上的错路 —— 那样五档文案、撤销语义、降级提示会各自演化，
 * 用户在两个页面看到两套口径。
 *
 * @param {{name:string, brand?:string}} bottle 瓶的身份（name|brand 即落盘键）
 * @param {function} repaint 动作完成后重画**所在容器**（不是整站）
 * @param {{surface?:'archive'|'wish'}} [opts]
 */
function stampSlot(bottle, repaint, opts = {}) {
  const surface = opts.surface === 'wish' ? 'wish' : 'archive';
  const slot = el('span', {
    class: 'qw-stamp-slot',
    'data-stamp-key': stampDataKey(bottle),
    'data-stamp-surface': surface,
  });
  const view = stampViewOf(stampSession.get(bottle));
  const name = bottle.name || '这一瓶';

  const openPanel = () => {
    slot.textContent = '';
    /* 面板挂在**瓶名行**上、不是挂在 slot 里（实测踩到）：slot 是
       `flex: 0 0 auto` 的窄格子，面板塞进去只能分到 130px 宽 ——
       390px 下五颗章被折成 2 列三行（截图一眼能看出来）。
       挂到行上并占满一行（CSS 里 .qw-stamp-panel 是 flex:1 1 100%），
       五档才是任务书要求的"一行五个、一眼可辨"。 */
    const host = slot.parentNode || slot;
    /* 同一行只允许一个面板：面板挂在行上（不在 slot 里），所以清 slot 清不掉
       上一次的面板 —— 先摘掉旧的，否则连点几次 chip 会叠出好几份五档按钮
       （每份都能点、都能保存，等于同一个动作有多个入口）。 */
    const stale = host.querySelectorAll ? host.querySelectorAll('.qw-stamp-panel') : [];
    for (const n of stale) {
      if (n.parentNode) n.parentNode.removeChild(n);
    }
    const panel = stampPanel(bottle, () => {
      /* 保存/取消/撤销之后整块档案面板重画：计数、chip、撤销按钮三者的
         存在与否都由存储算出，重画才不会出现"chip 变了、撤销按钮还在"。 */
      repaint();
    });
    host.appendChild(panel);
    return panel;
  };

  if (!view.has) {
    slot.appendChild(el('button', {
      class: 'qw-stamp-open',
      type: 'button',
      'aria-label': `给${name}盖章：记录试香评价`,
      onclick: openPanel,
    }, '试过？盖章'));
    return slot;
  }

  /* 已盖章：一枚 chip（日期 · 档位 · 共 N 次）。整枚可点，点开就是改档/再盖 ——
     同一瓶可以重复盖章，新盖章覆盖"最近一次"，计数 +1（任务书第 5 条）。 */
  slot.appendChild(el('button', {
    class: 'qw-stamp-chip',
    type: 'button',
    'aria-label': `修改${name}的试香记录（${view.tierZh}，${view.countLabel}）`,
    'data-stamp-count': String(view.count),
    onclick: openPanel,
  },
  el('span', { class: 'qw-stamp-tick', 'aria-hidden': 'true' }, '✓'),
  el('span', { class: 'qw-stamp-sum' }, view.summary)
  ));

  /* 撤销单独一枚小按钮：不进 panel 也能一步退回（用户刚盖错时不该先点开面板）。
     panel 里也有一枚 —— 两处都走同一个 session.undo，语义完全一致。 */
  slot.appendChild(el('button', {
    class: 'link-btn qw-stamp-undo-inline',
    type: 'button',
    'aria-label': `撤销${name}最近一次盖章`,
    onclick: () => {
      const res = stampSession.undo(bottle);
      stampSay(stampMessage(res));
      repaint();
    },
  }, '撤销'));
  return slot;
}

/** 历史面板的空态/列表/清空都在这一个函数里重画，保证计数与列表同源。 */
function paintHistoryPanel(panel, toggle) {
  panel.innerHTML = '';
  const list = readHistory(localStorageSafe());
  const setToggle = (n, open) => {
    toggle.textContent = open
      ? (n ? `收起（${n}）` : '收起')
      : (n ? `查看（${n}）` : '查看');
  };
  setToggle(list.length, true);

  if (!list.length) {
    panel.appendChild(el('p', { class: 'qw-history-empty' },
      '还没有记录。完成一次测试后，这里会显示三瓶结果。'));
    return;
  }

  const ol = el('ol', { class: 'qw-history-list' });
  /* 盖章位保存/撤销之后重画这一整块面板（不是整页）：计数、chip、撤销按钮
     三者的存在与否都由存储算出，重画才不会出现"chip 变了、撤销按钮还在"。
     只重画面板也保住了展开态与滚动位置 —— 盖个章把用户弹回页顶是很糟的。 */
  const repaintPanel = () => paintHistoryPanel(panel, toggle);
  list.forEach((h) => {
    const when = new Date(h.t);
    const meta = el('div', { class: 'qw-history-meta' },
      el('time', {
        class: 'qw-history-time',
        datetime: Number.isFinite(when.getTime()) ? when.toISOString() : '',
      }, formatHistoryTime(h.t)),
      el('span', { class: 'qw-history-entry' }, entryLabel(h.entry))
    );
    /* 每一瓶一行：左边瓶名/品牌，右端是这一瓶的盖章位（见 stampSlot）。
       盖章的**主入口就在这里**——档案是用户试完香回来唯一会打开的地方，
       而这里的每一行天然是"具体的那一瓶"，不会出现"给谁盖章"的歧义。 */
    const names = el('ul', { class: 'qw-history-names' },
      ...h.results.map((p) => el('li', { class: 'qw-history-name-row' },
        el('span', { class: 'qw-history-name' }, p.name),
        p.brand ? el('span', { class: 'qw-history-brand' }, p.brand) : null,
        stampSlot(p, repaintPanel)
      ))
    );
    ol.appendChild(el('li', { class: 'qw-history-item' }, meta, names));
  });
  panel.appendChild(ol);

  /* 清空做成两段式：第一次点只把按钮改成「再点一次确认清空」，4 秒后自动复位。
     不用 window.confirm —— 它在部分 WebView 里会阻塞整页，也和本页的视觉语言
     完全不是一套。 */
  const clear = el('button', { class: 'link-btn qw-history-clear', type: 'button' }, '清空历史');
  let armed = false;
  let timer = 0;
  clear.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      clear.textContent = '再点一次确认清空';
      timer = setTimeout(() => {
        armed = false;
        clear.textContent = '清空历史';
      }, 4000);
      return;
    }
    clearTimeout(timer);
    armed = false;
    clearHistory(localStorageSafe());
    paintHistoryPanel(panel, toggle);
  });
  panel.appendChild(el('div', { class: 'qw-history-actions' },
    clear,
    el('span', { class: 'hint' }, '只存本机，清空后无法恢复')
  ));
}

function renderHistoryBlock(opts = {}) {
  const box = el('section', { class: 'qw-history', 'aria-label': '我的香水档案' });
  const savedCount = readHistory(localStorageSafe()).length;
  const toggle = el('button', {
    class: 'btn ghost qw-history-toggle',
    type: 'button',
    'aria-expanded': 'false',
    'aria-controls': 'qw-history-panel',
  }, savedCount ? `查看（${savedCount}）` : '查看');
  const panel = el('div', {
    id: 'qw-history-panel',
    class: 'qw-history-panel',
    role: 'region',
    'aria-label': '香水档案记录',
    hidden: '',
  });

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    if (open) {
      panel.setAttribute('hidden', '');
      const n = readHistory(localStorageSafe()).length;
      toggle.textContent = n ? `查看（${n}）` : '查看';
      return;
    }
    panel.removeAttribute('hidden');
    paintHistoryPanel(panel, toggle);
  });

  box.appendChild(el('div', { class: 'qw-history-head' },
    el('p', { class: 'qw-history-label' }, '我的香水档案'),
    toggle
  ));
  /* Batch 4 腿 F：档案说明放在左侧入口整行下方，不再与「查看」挤在同一行。
     Batch 5 腿 B5-4：结果页已把这句说明搬进 .result-entry-note（与重选那一列
     对称），所以这里只在**非结果页**的挂载点保留它。resultsPage=true 时不渲染，
     否则同一句话会在结果页出现两遍（一遍在入口容器里、一遍在这里）。
     档案区块当前只从结果页挂载，保留这个开关是为了让"搬走一句说明"
     不会在别处悄悄留下一个孤儿节点。 */
  if (!opts.resultsPage) {
    box.appendChild(el('p', { class: 'qw-history-sub' }, '最近 5 次只存本机，不上传'));
  }
  /* ---- 心仪清单入口曾经挂在这里（见下方 wishEntryRow 的说明）----
     L3（2026-11-23）把它挂在档案区块内：设计稿 §7.4 要求「首页与结果页都够得着」，
     而档案区块是回访用户唯一会先看到的东西。
     2026-11-24 复查反馈第 6 条改判：入口要和「换一批 / 改一题」一起
     在首屏可达，所以它搬到结果页的吸底操作条（.result-dock）里。
     渲染逻辑一字未改，只换了挂载点 —— 见下面的 wishEntryRow()。 */
  /* 面板由结果页双入口容器单独挂载：展开时横跨整行，收起时不影响左右入口。 */
  return { box, panel, toggle };
}

/**
 * 心仪清单入口（带计数）。**一处实现、一处挂载**：现在只挂在结果页的
 * 吸底操作条里（2026-11-24 复查反馈第 6 条：三个操作原来落在第 3 屏以外）。
 *
 * 为什么带计数：没计数时用户不知道里面有没有东西，等于每次都要点进去确认。
 * 为什么单独成函数而不是留在 renderHistoryBlock：入口的挂载点变了，
 * 但文案/计数/点击一个字都不该跟着变 —— 把"渲染"和"挂在哪"分开，
 * 下一个想挪它的人只改调用点，不会顺手改文案。
 */
function wishEntryRow() {
  let wishCount = 0;
  try {
    wishCount = wishlist.list().length;
  } catch {
    wishCount = 0;
  }
  return el('div', { class: 'qw-history-wish is-dock' },
    el('button', {
      class: 'qw-wl-entry',
      type: 'button',
      'data-wish-count': String(wishCount),
      onclick: () => openWishPage(),
    },
    el('span', { class: 'qw-wl-entry-label' }, '心仪清单'),
    el('span', { class: 'qw-wl-entry-count' }, String(wishCount)),
    el('span', { class: 'qw-wl-entry-go' }, '打开 →')),
    el('span', { class: 'hint' }, wishCount
      ? '收藏只存本机；点开看理由、参考价和购买入口。'
      : '在结果页点 ♡ 收藏到这里')
  );
}

/* ---------- 进/出清单页 ----------
   两个动作都只改一个字段再重画，与结果页「换一批」同一条路。
   进页面前把香水表、链接表、实物图表拉齐（都是既有加载器，幂等）——
   清单行要现查这四样，缺一样就会少一格。 */
function openWishPage() {
  state.wishPage = true;
  WISH_SCROLL = 0;
  Promise.all([
    ensurePerfumes().catch(() => DATA),
    ensureAffLinks().catch(() => AFF_LINKS),
    ensurePhotos().catch(() => PHOTOS),
  ]).then(() => {
    if (state.wishPage) render();
  });
  render();
}

/* ============================================================
   心仪清单 · 清单页本体（L3，2026-11-23）
   ------------------------------------------------------------
   这一块只做渲染与一次点击的去向。判据全在 src/wish-page.js：
     · 哪些字段有、哪些没有（没有价格就不显示价格，没有链接就不显示链接）；
     · 空态 / 满 50 / 存储不可用三句话；
     · 清空的两段式与移除后的撤销。
   这里**不 import 任何新存储**：已入手与移除都走 L2 那个 wishSession
   背后的同一个 wishlist 实例 —— 心仪、已入手、盖章（将来）必须共用一个
   存储，另起一套就会出现"清单里有、档案里没有"的分叉。

   ---- 与结果页 ♡ 的位置关系（不是审美，是防误触）----
   结果卡上「存」在瓶名行（卡顶）、「买」在页脚（卡底），一上一下两端。
   清单行沿用同一条约定：移除与购买键分列两端，已入手在左侧信息区、
   与购买键隔着一整行的宽度。见 99-wishlist.css 里 .qw-wl-* 的注释。
   ============================================================ */

/** 清单页当前的滚动锚点：重画后回到原位，避免点一下「已入手」被弹回页顶。 */
let WISH_SCROLL = 0;

/** 已入手集合：从**会话**读（不是数据层）—— 降级时标记落在兜底介质上，
 *  直接问 wishlist 会读不到，于是用户点过之后那一行不亮。 */
function wishOwnedSet(items) {
  const set = new Set();
  for (const it of items) {
    if (wishSession.isOwned(it.id)) set.add(it.id);
  }
  return set;
}

/** 清单页的一行。五要素 + 已入手 + 移除，全部挂在 .qw-wl-row 下。 */
function wishRowNode(row, ctx) {
  const { say, repaint } = ctx;
  const li = el('li', { class: 'qw-wl-row' + (row.owned ? ' is-owned' : ''), 'data-wish-id': row.id });

  /* 盖章位的重画入口：先记住滚动位置再整页重画（与「移除」「已入手」同一条路）。
     不记的话，在清单靠下的一行盖章会被弹回页顶 —— 用户刚点的是"给这瓶盖章"，
     不该顺带丢掉他正在看的位置。 */
  const repaintKeepScroll = () => {
    WISH_SCROLL = pageScrollY();
    repaint();
  };

  /* ① 瓶图。有照片用照片（与结果卡同一个 .pick-art 走法），没有就画瓶形 ——
        两者尺寸由同一个 .qw-wl-art 盒控制，换图不会让各行基线错开。 */
  const art = el('div', { class: 'qw-wl-art' });
  if (row.photo) {
    art.appendChild(el('img', {
      src: row.photo, alt: '', role: 'presentation', loading: 'lazy', decoding: 'async', draggable: 'false',
    }));
  } else {
    /* 瓶形走既有的 bottleArt：它按 id 稳定散列出色相，所以同一瓶在结果页
       与清单页画出来是同一个颜色。没有照片时这是"同一瓶"的视觉连续性。 */
    const p = ctx.perfumeOf(row.id);
    art.appendChild(p ? bottleArt(p) : el('div', { class: 'qw-wl-art-ph' }));
  }

  const main = el('div', { class: 'qw-wl-main' });

  /* ② 品名 + 品牌 */
  main.appendChild(el('div', { class: 'qw-wl-name-row' },
    el('h3', { class: 'qw-wl-name' }, row.name),
    /* 「已入手」是**可切换**的标记，不是一次性动作 —— 点错了要能取消。
       aria-pressed 跟着状态走，读屏用户听到的是「切换按钮 已按下」。 */
    el('button', {
      class: 'qw-wl-owned' + (row.owned ? ' is-on' : ''),
      type: 'button',
      'aria-pressed': row.owned ? 'true' : 'false',
      'aria-label': row.owned ? `取消「已入手」标记：${row.name}` : `标记为已入手：${row.name}`,
      onclick: (ev) => {
        ev.stopPropagation();
        WISH_SCROLL = pageScrollY();
        const was = wishSession.isOwned(row.id);
        if (was) {
          /* 取消标记走会话（src/wish-ui.js 的 unmarkOwned）：数据层没有
             "取消单条"的公开 API，而 L1 是已验收件、不许加导出（它的守卫
             测试正面比对全部 export 名）。会话里那一份按 L1 的同一个键形状
             读写，且降级时写兜底介质 —— 不会出现「清单在内存、标记在磁盘」的分叉。 */
          const ok = wishSession.unmarkOwned(row.id);
          say(ok ? `已取消「已入手」：${row.name}` : `取消不了「已入手」：${row.name}`);
        } else {
          const res = wishSession.toggleOwned(row.id);
          say(res && res.ok ? `已标记「已入手」：${row.name}` : `标记不了「已入手」：${row.name}`);
        }
        repaint();
      },
    }, row.owned ? '已入手' : '标记已入手')
  ));

  if (row.brand) main.appendChild(el('p', { class: 'qw-wl-brand' }, row.brand));

  /* ②b 盖章位（2026-11-23 补 L3 欠的第 4 项）：**同一枚 stampSlot**，
     与档案面板逐字同一套 —— 五档文案、chip 口径、撤销语义、降级提示
     全部来自 src/stamp.js / src/stamp-ui.js 那一份实现，这里只是换个挂载点。

     bottle 只给 name/brand：盖章的身份键就是「归一化(name)|归一化(brand)」，
     所以清单里的这一瓶与档案里的同一瓶算出**同一个键**，读写的是同一条记录
     （两屏共用 scent-picker.tasting.v1，不需要任何同步逻辑）。

     **为什么不塞进上面那行瓶名**（实测踩到，390 截图一眼可见）：那一行已经有
     瓶名 + 「标记已入手」两个动作，再挤进 chip + 「撤销」会把它挤到第二行，
     于是「Aventus  /  标记已入手  /  Creed」三行的顺序整个错位 —— 品牌跑到了
     标记按钮下面。单独一行在 390 下更稳，也让"盖章"与"已入手"两个动作分开。

     **数据里查不到这瓶时不给入口**（`row.missing`）：wishRowOf 在查不到时
     把 name 退成 id（见 src/wish-page.js 第③条的注释），而 id 不是瓶名 ——
     拿它盖章会写出一条「键 = id|」的记录，档案侧那瓶永远对不上，
     等于制造一份两处都不认的孤立记录。宁可少一个入口，不写脏记录。 */
  if (!row.missing) {
    main.appendChild(el('div', { class: 'qw-wl-stamp-row' },
      stampSlot({ name: row.name, brand: row.brand }, repaintKeepScroll, { surface: 'wish' })
    ));
  }

  /* ③ 存入理由：L2 存下的那一句原文，只读展示。空就整格不出 ——
        补一句「暂无理由」是替用户编一句他没说过的话。 */
  if (row.reason) main.appendChild(el('p', { class: 'qw-wl-reason' }, row.reason));

  /* ④ 价格带（有数据才显示，标「参考价」） + 日期 */
  const meta = el('div', { class: 'qw-wl-meta' });
  if (row.price) meta.appendChild(el('span', { class: 'qw-wl-price' }, row.price));
  meta.appendChild(el('span', { class: 'qw-wl-date' }, row.savedAtLabel));
  main.appendChild(meta);
  li.appendChild(art);
  li.appendChild(main);

  /* ⑤ 购买链接（有才显示） + 移除。两个动作分列这一行的右端与底端，
        与「已入手」在左侧信息区 —— 三个动作互不相邻。 */
  const tail = el('div', { class: 'qw-wl-tail' });
  if (row.buy && row.buy.length) {
    const link = row.buy[0];
    tail.appendChild(el('a', {
      class: 'qw-wl-buy' + (link.kind === 'direct' ? '' : ' is-search'),
      href: link.href,
      target: '_blank',
      /* 与结果页同一条合规口径：有佣金关系才挂 sponsored，无佣金绝不能挂。 */
      rel: link.kind === 'direct' ? 'sponsored noopener noreferrer' : 'noopener noreferrer',
      'data-affiliate': link.kind === 'direct' ? 'true' : 'false',
      'data-kind': link.kind,
      'data-platform': link.platform,
    }, link.label));
  }
  tail.appendChild(el('button', {
    class: 'qw-wl-remove',
    type: 'button',
    'aria-label': `从心仪清单移除${row.name}`,
    onclick: (ev) => {
      ev.stopPropagation();
      WISH_SCROLL = pageScrollY();
      /* 撤销要还原的是**存储里的原条目**（含原 savedAt），而 `row` 是
         wish-page 算出来的**展示模型** —— 它的时间字段叫 savedAtLabel
         （"最近存入 11-23"），没有 savedAt。拿 row 去撤销会把 savedAt 写成 0，
         那一瓶随即掉到清单最末（实测踩到：撤销后顺序变了）。
         所以从数据层取回那一条再交给会话。 */
      const stored = (() => {
        try {
          return wishlist.list().find((x) => x.id === row.id) || null;
        } catch {
          return null;
        }
      })();
      wishlist.remove(row.id);
      /* 撤销窗口：把**原条目**留着，撤销时原样写回（含原 savedAt）。 */
      say(`已移除：${row.name}`, { undo: removableOf(stored) || removableOf({ id: row.id, savedAt: 0, reason: row.reason }) });
      repaint();
    },
  }, '移除'));
  li.appendChild(tail);
  return li;
}

function pageScrollY() {
  try {
    return typeof window !== 'undefined' && Number(window.scrollY) ? Number(window.scrollY) : 0;
  } catch {
    return 0;
  }
}

/**
 * 清单页整页。
 *
 * 三件事按顺序：先算模型（wish-page.js）、再决定要不要出三条状态提示、
 * 最后逐行渲染。**任何一个环节都不许抛到 render() 之外** ——
 * 存储坏掉时这一页要显示降级提示，而不是把整站变成错误页（任务书第 5 条）。
 */
function renderWishPage() {
  const wrap = el('div', { class: 'fade-in qw-wl-page' });

  let items = [];
  let degraded = false;
  try {
    items = wishlist.list();
    degraded = wishSession.degraded();
  } catch {
    /* 连读都抛（极端环境）：按"存储不可用"处理，与 degraded 同一条口径。 */
    items = [];
    degraded = true;
  }

  /* 香水表与链接表都是按需加载的（性能腿的既定做法，见 ensurePerfumes）。
     清单页要拿它们现查瓶名/图/价格/链接，所以这里 await 一次。
     数据没到货不能等于"瓶子丢了"：模型对查不到的 id 仍然出行（见 wishRowOf）。 */
  const repaint = () => {
    render();
    try {
      window.scrollTo(0, WISH_SCROLL);
    } catch { /* 没有 window（测试桩）：不滚即可，不影响内容 */ }
  };

  const say = (msg, opts) => sayWishPage(msg, opts, repaint);

  const build = (data, links, photos) => {
    const perfumes = perfumeIndex(data);
    const aff = affiliateConfig();
    const owned = wishOwnedSet(items);
    const model = wishListModel(items, {
      perfumes,
      priceIndex: PRICE_INDEX,
      photos: photos && typeof photos === 'object' ? photos : null,
      owned,
      degraded,
      linksOf: (id, p) => (p ? affiliateLinks(p, aff) : []),
    });

    const head = el('div', { class: 'qw-wl-head' },
      el('h2', { class: 'qw-wl-sub' },
        model.count ? `共 ${model.count} 瓶 · 存在这台设备上` : WISH_PAGE_MSG.deviceOnly),
      /* 回结果页：清单页是"档案里的一个视图"，不是全站首页，
         所以出口写「返回」而不是「首页」。 */
      el('button', {
        class: 'link-btn qw-wl-back',
        type: 'button',
        onclick: () => { state.wishPage = false; render(); },
      }, '← 返回')
    );
    wrap.appendChild(head);

    /* 降级提示：L2 已定的那句话，逐字沿用。它排在最前 ——
       "存不下"这件事会影响用户对这一页所有内容的理解。 */
    if (model.degraded) {
      wrap.appendChild(el('p', { class: 'qw-wl-note is-warn', role: 'note', 'data-note': 'unavailable' },
        WISH_PAGE_MSG.unavailable));
    }
    /* 满 50：与 L2 同一句口径，数字取 WISHLIST_MAX 不另写。 */
    if (model.full) {
      wrap.appendChild(el('p', { class: 'qw-wl-note', role: 'note', 'data-note': 'full' },
        WISH_PAGE_MSG.full));
    }

    /* ---- 空态：一句引导 + 一个回结果页的动作，不白屏 ---- */
    if (model.empty) {
      wrap.appendChild(el('div', { class: 'qw-wl-empty' },
        el('p', { class: 'qw-wl-empty-title' }, WISH_PAGE_MSG.emptyTitle),
        el('p', { class: 'qw-wl-empty-hint' }, WISH_PAGE_MSG.emptyHint),
        el('button', {
          class: 'btn qw-wl-empty-cta',
          type: 'button',
          onclick: () => { state.wishPage = false; render(); },
        }, WISH_PAGE_MSG.emptyCta)
      ));
      return wrap;
    }

    const ol = el('ol', { class: 'qw-wl-list' });
    for (const row of model.rows) {
      ol.appendChild(wishRowNode(row, { say, repaint, perfumeOf: (id) => perfumes.get(id) || null }));
    }
    wrap.appendChild(ol);

    /* 清空全部：两段式（与档案区块同一套交互），放在最下面 ——
       它代价最大，不该和逐行操作抢注意力。 */
    let armed = false;
    const clearBtn = el('button', { class: 'link-btn qw-wl-clear', type: 'button' }, CLEAR_LABEL);
    let timer = 0;
    clearBtn.addEventListener('click', () => {
      const next = nextClearState({ armed });
      if (!next.changed) {
        armed = true;
        clearBtn.textContent = next.label;
        /* 第二段视觉要能看出来（否则它和第一次点击前长得一样，
           用户不知道自己已经在确认态）—— 类名 + 文案两重信号。 */
        clearBtn.classList.add('is-armed');
        timer = setTimeout(() => {
          armed = false;
          clearBtn.textContent = CLEAR_LABEL;
          clearBtn.classList.remove('is-armed');
        }, 4000);
        return;
      }
      clearTimeout(timer);
      armed = false;
      clearBtn.classList.remove('is-armed');
      clearBtn.textContent = CLEAR_LABEL;
      WISH_SCROLL = pageScrollY();
      wishlist.clear();
      repaint();
    });
    wrap.appendChild(el('div', { class: 'qw-wl-actions' },
      clearBtn,
      el('span', { class: 'hint' }, '只存本机，清空后无法恢复')
    ));
    return wrap;
  };

  /* 数据可能还没到货。到了就重画一次；不到就按"查不到"渲染 ——
     这一页的瓶名会退成 id，但列表本身照常可读可操作，
     不会卡在空白等一个可能失败的请求。 */
  const ready = DATA && PHOTOS !== null && AFF_LINKS !== null;
  if (ready) return build(DATA, AFF_LINKS, PHOTOS);

  Promise.all([
    ensurePerfumes().catch(() => DATA),
    ensureAffLinks().catch(() => AFF_LINKS),
    ensurePhotos().catch(() => PHOTOS),
  ]).then(() => {
    if (state.wishPage) repaint();
  });

  return build(DATA, AFF_LINKS, PHOTOS);
}

/**
 * 清单页的一条提示（复用 L2 那条单例提示条，不另造 toast）。
 *
 * 为什么复用：两个页面出现两种"提示"会让"这条会不会自己消失"变成
 * 需要重新学习的事。同一条 .qw-wish-bar、同一个 hidden 语义、
 * 同样 2 秒消失 —— 只有"撤销"这一种带动作，所以它多挂一个按钮。
 */
function sayWishPage(msg, opts, onUndo) {
  const bar = ensureWishBar();
  bar.textContent = '';
  bar.appendChild(document.createTextNode(msg));
  bar.removeAttribute('hidden');

  if (opts && opts.undo) {
    /* 撤销：把原条目原样写回（savedAt 不变，位置不变）。
       按钮本身要能点 —— 而 .qw-wish-bar 是 pointer-events:none（不挡操作），
       所以这里把按钮单独放行 pointer-events:auto。
       opts.undo 是 removableOf() 的产物 { id, item }：解出 item 再写回，
       不能把外层的包裹对象直接当条目用（那样 id/savedAt 都会丢）。 */
    const item = opts.undo.item || opts.undo;
    const undoBtn = el('button', {
      class: 'qw-wl-undo',
      type: 'button',
      onclick: (ev) => {
        ev.stopPropagation();
        /* 走会话：降级时它会写到兜底介质上，与「移除」是同一个介质 ——
           否则会出现"移除是内存的事、撤销写进磁盘"这种一半真一半假的状态。
           undoRemove 保留原 savedAt，所以撤销后那瓶回到原来的位置，
           不会被顶到清单最前面（那是 add() 的语义，不是撤销的语义）。 */
        const ok = wishSession.undoRemove
          ? wishSession.undoRemove(item)
          : false;
        hideWishBar();
        if (ok) {
          if (typeof onUndo === 'function') onUndo();
        } else if (typeof onUndo === 'function') {
          /* 写不回就别假装成功：重画一次让界面与存储保持一致，
             用户看到的是"确实没回来"，而不是"消失了又出现又消失"。 */
          onUndo();
        }
      },
    }, '撤销');
    bar.appendChild(undoBtn);
    /* 撤销窗口 5 秒（设计稿 §11.1），比普通提示长 —— 它要给人留出反应时间。 */
    scheduleWishBarHide(5000);
    return;
  }

  scheduleWishBarHide(2000);
}

async function waitForShareFonts() {
  if (!document.fonts || !document.fonts.ready) return;
  await Promise.race([
    document.fonts.ready,
    new Promise((r) => setTimeout(r, 1500)),
  ]);
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('empty canvas blob'))), 'image/png');
      return;
    }
    try {
      const b64 = canvas.toDataURL('image/png').split(',')[1];
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      resolve(new Blob([bytes], { type: 'image/png' }));
    } catch (e) {
      reject(e);
    }
  });
}

function shareFileStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function exportSharePng(btn) {
  const res = state.result;
  if (!res || !res.profile) return;
  const restore = setBusy(btn, '正在生成…');
  try {
    await waitForShareFonts();
    const canvas = document.createElement('canvas');
    canvas.width = SHARE_W;
    canvas.height = SHARE_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unavailable');
    drawShareCard(ctx, buildShareModel({
      profile: res.profile,
      results: res.results,
      budgetZh: currentBudgetZh(),
    }), SHARE_W, SHARE_H);
    const blob = await canvasToBlob(canvas);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scent-picker-${shareFileStamp()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch { /* 页面已卸载 */ }
    }, 2000);
  } catch {
    restore();
    const old = btn.textContent;
    btn.textContent = '生成失败，请重试';
    setTimeout(() => { btn.textContent = old; }, 2400);
    return;
  }
  restore();
}

function renderResult() {
  const { profile, results } = state.result;
  const wrap = el('div', { class: 'fade-in' });
  /* 推广链接配置读一次，三张卡共用。配置不全时 aff.href 全为 null，
     页面就退化成纯展示 —— 与没有这个功能时完全一样。 */
  const aff = affiliateConfig();

  const head = el('div', { class: 'result-head' });
  head.append(
    /* 边距仪器区（视觉深化腿）：编号 + 状态微文，住在左侧留白里。
       研读第五节「标本图鉴的留白从不空：边距里住着编号、刻度、注脚、状态」。

       aria-hidden 是有意的：这两行是**注脚**，内容已经被
       .progress-meta（「推荐结果 / 完成 · 共 N 步」）用可读文本表达过一次。
       同一个事实念两遍对屏幕阅读器用户是噪声，所以这里只服务视觉排版。
       编号取 state.step（结果页 = 已答完的步数），与进度尺同源，不另算。 */
    el('div', { class: 'gutter-meta', 'aria-hidden': 'true' },
      el('span', { class: 'gutter-step' }, String(curSteps().length).padStart(2, '0')),
      el('span', { class: 'gutter-state' }, '标本陈列')
    ),
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
  /* Batch 4 腿 F：双入口紧跟主标题，条件摘要退到入口之后。保留
     .qw-history / .qw-history-toggle 与原面板逻辑，测试锚点不变；
     档案面板作为第三项挂在双入口网格里，展开时占满整行。 */
  /* Batch 4 腿 F 把双入口提到标题下，但只给了「档案」一侧一句说明：
     「最近 5 次只存本机，不上传」挂在 .qw-history 里，「会清空全部答案」挂在
     重选那一列里 —— 两列高度不齐时，两句说明落在不同基线上，
     读者要自己判断哪句属于哪个入口（390 档实测：左侧说明 top 283、
     右侧 top 281，看着像两行串排的注释）。
     Batch 5 腿 B5-4 把两侧结构改成对称的「入口 + 自己的说明」两个容器：
       .result-entry（标题 + 动作，上）
       .result-entry-note（这一入口的说明，下）
     两句说明各自住进自己那一列的容器里，不再共用一个网格行。
     档案面板挂在这个容器**之外**（展开时横跨整行），它不属于任何一侧。 */
  const quickEntries = el('div', { class: 'result-quick-entries' });
  const historyEntry = renderHistoryBlock({ resultsPage: true });
  const histCol = el('div', { class: 'result-entry', 'data-entry': 'history' },
    el('div', { class: 'result-entry-head' },
      el('p', { class: 'qw-history-label' }, '我的香水档案'),
      historyEntry.toggle),
    el('p', { class: 'result-entry-note' }, '最近 5 次只存本机，不上传'));
  const restartCol = el('div', { class: 'result-entry', 'data-entry': 'restart' },
    el('div', { class: 'result-entry-head' },
      el('p', { class: 'result-entry-title' }, '重开一局'),
      el('button', {
        class: 'link-btn result-restart-btn',
        type: 'button',
        onclick: restart,
      }, '从头重新答一遍')),
    el('p', { class: 'result-entry-note' }, '会清空全部答案'));
  quickEntries.append(histCol, restartCol, historyEntry.panel);
  wrap.appendChild(quickEntries);
  wrap.appendChild(head);

  /* 预算放宽声明（leg6，任务第 3 条）：结果若含档外瓶，顶部明示，不再悄悄放宽。
     档内 0 瓶 → 「这个价位暂无匹配」+「改预算」；档内 >=1 瓶 →
     「这一档只找到 X 瓶，另外 Y 瓶超出预算（价签标红）」+「换一档」。
     两个按钮都回到预算屏（goBudget），其余答案不动。 */
  const relax = state.result.budgetRelax;
  if (relax) {
    wrap.appendChild(el('div', {
      class: 'budget-relax' + (relax.inBand === 0 ? ' is-zero' : ''),
      role: 'alert',
      'data-budget-relax': String(relax.inBand),
    },
      el('span', { class: 'budget-relax-text' }, relax.inBand === 0
        ? '这个价位暂无匹配'
        : `这一档只找到 ${relax.inBand} 瓶，另外 ${relax.over} 瓶超出预算（价签标红）`),
      el('button', {
        class: 'btn ghost js-budget-change', type: 'button', onclick: goBudget,
      }, relax.inBand === 0 ? '改预算' : '换一档')
    ));
  }

  /* 首屏 3 列比较表（腿 7a1，2026-11-26）。位置在页头之后、三张详情卡之前：
     先让人一眼看出"这三瓶差在哪、下一步点哪个"，再往下才是逐瓶详情。
     详情卡（article.pick）本腿一个字未改 —— 那是腿 7b 的活。 */
  wrap.appendChild(renderCompareTable(results, state.result && state.result.profile));

  /* 存入反馈：一条**不挡操作、自动消失**的轻提示。
     为什么不用 toast 框架：本页只有这一处需要"说过就完"的短句，
     为它引入定位层、队列与堆叠规则，代价远大于收益。

     两条形态约束都是有理由的，不是随手定的：
       · `position: fixed` 贴视口底部 —— 用户点哪张卡的 ♡ 都看得见。
         若改成文档流里的一行，点第 2/3 张卡时它已经在屏幕上方，等于没提示。
       · `pointer-events: none`（见 99-wishlist.css）—— 它悬在内容之上，
         但任何点击都穿过去。这是"不挡操作"的字面实现：不是靠挪开，
         而是它根本不在命中测试里。
     另一条隐性好处：fixed 不参与布局，所以提示出现/消失时
     下面那颗购买按钮不会跳位 —— 手指还没来得及离开就换位置是最容易误触的。

     **必须挂到 document.body，不能留在结果区的 DOM 里**（实测踩到）：
     `.fade-in` / `#app[data-scene] .fade-in` 上挂着 rise-in / sceneSettleIn /
     sceneRiseIn 三个带 transform 的动画。带 transform 的祖先会成为
     fixed 定位的**包含块**，于是 `bottom: 20px` 变成"贴在那个动画块底部"——
     实测提示的 y 是 2698（视口高 900），整条落在屏幕外，用户什么都看不到。
     挂 body 之后不受任何祖先的 transform 影响，才是真的贴视口。
     （这也是把提示做成**单例**的理由：每次 render 都往 body 追加一条，
     翻几轮结果页就会攒出一堆叠在一起的旧提示。见 ensureWishBar。） */
  const wishBar = ensureWishBar();
  const sayWish = (msg) => {
    /* ---- 「在香水档案里看」要真的能点（L3，2026-11-23）----
       L2 的这句提示当时只有文字，用户读完仍不知道去哪找 —— 提示里指了
       一个地方却没有入口，等于把"存完不知道去哪找"这个问题留给用户。
       这里把 ' · ' 之后的那半句做成按钮：前半句是结果（存了没），
       后半句是去向（去哪看），两者本来就该由同一条提示给出。
       桩里没有 querySelector 分区能力也不影响：拆的是字符串，不是 DOM 结构。 */
    const parts = String(msg).split(' · ');
    wishBar.textContent = '';
    if (parts.length === 2 && /^在香水档案里看/.test(parts[1])) {
      /* 只把「在香水档案里看」这四个字做成按钮。
         降级时 wishMessage 会在整句后面追加「（本机存储不可用，收藏仅本次有效）」，
         那个括号是**说明**，不是去向 —— 整段塞进按钮会让按钮变成一句话
         （实测截图里按钮被撑成一长条，句子读起来像「点这里（存不下）」）。
         所以后半句按「在香水档案里看」+「其余」拆开，其余留在按钮外面。 */
      const tail = parts[1].slice('在香水档案里看'.length);
      wishBar.appendChild(document.createTextNode(parts[0] + ' · '));
      wishBar.appendChild(el('button', {
        class: 'qw-wish-go',
        type: 'button',
        onclick: (ev) => {
          ev.stopPropagation();
          hideWishBar();
          openWishPage();
        },
      }, '在香水档案里看'));
      if (tail) wishBar.appendChild(document.createTextNode(tail));
    } else {
      wishBar.appendChild(document.createTextNode(String(msg)));
    }
    wishBar.removeAttribute('hidden');
    /* 2000ms：够读完一行 12 字，也不至于在下一次点击前还占着位置。
       计时不再是本闭包私有的 —— 全站只有一条提示条，因此只有一份计时
       （见 scheduleWishBarHide 的注释）。 */
    scheduleWishBarHide(2000);
  };

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

    /* 每瓶可见一致的价格范围（leg6，任务验收）：标自身价位带（如「300 元以内」），
       价位未知就写「价位未知」，不编价格。超出所选档的瓶标红（is-over），
       与顶部放宽声明里的「价签标红」是同一件事的两处落点。 */
    const pBand = priceBandOf(p.id, priceIndex());
    const curBudget = state.answers.budget || 'any';
    const anyId = (priceIndex() && priceIndex().anyId) || 'any';
    const overBudget = curBudget !== anyId && !(pBand && pBand.id === curBudget);
    const priceTag = el('span', {
      class: 'price-tag' + (overBudget ? ' is-over' : ''),
      'data-price-band': pBand ? pBand.id : 'unknown',
    }, pBand ? pBand.zh : '价位未知');

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
        r.matchPct == null ? '初步匹配' : `匹配度 ${r.matchPct}%`),
      priceTag
    ));

    /* 瓶形放在名字右边，与「候选 01 / 匹配度」同一视觉带。
       为什么不做大图横跨卡宽：结果卡是规格表式的竖排文本（D38 的 Swiss 骨架），
       一张大图会把三张卡的节奏打断，也让"读理由"这件事被图片挤下去。
       88px 的小图只做"这三瓶长得不一样"的视觉锚点。 */
    const headText = el('div', { class: 'pick-head-text' });
    /* 瓶名一行：左边名字（占满剩余宽度），右端一颗 ♡。
       为什么 ♡ 在这一行而不是页脚：页脚是「去哪买」的地盘，购买按钮在
       那里贴右。存/买是两个不该挨着的动作 —— 一上一下两端，
       手指不可能在同一个动作里滑到对方（下方注释与 99-wishlist.css 有实测数）。 */
    headText.appendChild(el('div', { class: 'pick-name-row' },
      el('h3', {}, p.name),
      wishHeart(p, r, sayWish)
    ));
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

    /* ---- 详情区（腿 7b）----
      三段条压在既有 .pyramid 上方：条是"重心在哪一段"的图，紧贴着它画的
      那张表 —— 两者分开就会让人以为是两件事。不复制三调文字（理由见
      102-results-detail.css 的文件头），所以这里只加一条 track。
      依据替换掉原来的 .reasons 平铺列表：同一批因子，改成「你答的 X →
      所以推这瓶」两行对照，新手不必自己去猜"主体就是花香调"是在回答哪一题。
      容器带 data-fam，族色与首屏 .cmp-fig 同源 —— 同一瓶两处一个色系。 */
    const detail = el('section', {
      class: 'pick-detail',
      'data-fam': dominantFamily(p),
      'aria-label': `${p.brand || ''} ${p.name} 的详情`,
    });
    detail.appendChild(pdLabel('三调'));
    detail.appendChild(pdTrack(p));

    // 三调
    const dl = el('dl', { class: 'pyramid' });
    const rows = [
      ['前调', p.top, '最先闻到的 15 分钟'],
      ['中调', p.heart, '半小时后的主体'],
      ['后调', p.base, '留在皮肤上的余味'],
    ];
    /* 3-7b：按香调原始英文键查中文表；中文为主、英文作 11px 灰字附注。
       缺键（含 note-zh.pending.json 里的存疑条目）就只显示英文原名，不编译名。
       分隔仍用「、」，提示仍用全角空格开头的 span —— 下游 test-render
       靠这两个字符切段数，改标点会让「条与表同一份数据」那条断言假红。

       ==== Batch 5 腿 B5-4：同一层里的重复香材只显示一次 ====
       Eddie 真机看到「橙花、橙花」。追查结果（_probe/b5/dupnote.json）：
       两种来源，都是**数据层的重复**，不是打分或模板拼接的错：
         ① 同一层里两个不同英文名映射到同一个中文名。
            data/note-zh.json 里有 9 组这样的多对一（Neroli / Orange Blossom
            都译「橙花」，Citrus / Mandarin 都译「柑橘」，Oud / Ebony Wood
            都译「乌木」…）。两个都出中文，读起来就是「橙花、橙花」。
         ② 同一层里同一个英文名出现两次（全库 60 瓶/层）。
            上游数据集本身重复，如 ["Rose","Rose"]、["Musk","Musk"]。
       处理放在**展示层**，打分一行未改：键取「有译名就用中文名，否则用英文名」，
       同一键只写一次中文，但把落到这个键上的英文原名全部并列在附注里
       （「橙花Neroli / Orange Blossom」）。这样中文不再重复，英文一个不漏 ——
       既有验收「有译名显示中文、缺译名回退英文、英文原名保留」照旧成立。
       见 pdNotesOf()。三段条也用同一个函数，所以"条与表同一份数据"
       这条既有断言不需要改一个字 —— 两边同时收窄，仍然逐段相等。 */
    rows.forEach(([label, notes, tip]) => {
      const uniq = pdNotesOf(notes);
      const bits = [];
      uniq.forEach((u, i) => {
        if (u.zh) bits.push(u.zh);
        /* 同一中文键下的多个英文原名并列在**同一个** small 里，
           用「 / 」分隔（不是「、」）—— 「、」是香材之间的分隔符，
           拿它分同义词会让下游按「、」切段的断言把一味读成两味。 */
        bits.push(el('small', { class: 'note-en' }, u.ens.join(' / ')));
        if (i < uniq.length - 1) bits.push('、');
      });
      dl.append(
        el('dt', {}, label),
        el('dd', {}, ...bits, el('span', {}, `　${tip}`))
      );
    });
    detail.appendChild(dl);

    /* 理由：换成「你答的 → 所以」对照表，类名走 .pick-basis 而不是
       .reasons —— 两套语法共用同一批文本，混用一个类名会让
       "这段到底是对照表还是一列要点"在 DOM 层就分不清。
       profile 取自 renderResult 顶部的解构（state.result.profile），
       与首屏比较表用的是同一个对象，不另取一份。

       依据为空时**不留白**：那是"我们没有能反推到某个答案的话"，
       与"这瓶没有理由"不是一回事。用 buildReasons 的同一句兜底
       （scoring.js 那句"各维度都只是勉强及格"的原意是诚实，不是安慰），
       所以这里只说结果卡本来就会说的话。 */
    const basis = pdBasisOf(r, profile);
    detail.appendChild(pdLabel('为什么推这瓶'));
    if (basis.length) {
      const ul = el('ol', { class: 'reasons pick-basis' });
      basis.forEach((x) => {
        /* warn 只红 .basis-why（见 102 层）：连"提醒"那一行的
           标签一起染红会把中性的注脚读成警报。 */
        ul.appendChild(el('li', { class: x.warn ? 'warn' : '' },
          el('span', { class: 'basis-ask' }, x.ask),
          el('span', { class: 'basis-why' }, x.why)));
      });
      detail.appendChild(ul);
    } else {
      detail.appendChild(el('p', { class: 'basis-ask' }, (r.reasons && r.reasons[0]) || ''));
    }
    art.appendChild(detail);

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
         · 搜索兜底说明 —— 讲"点开是淘宝搜索结果，不是商品页。"，删了才是骗人。
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
        '两个入口都打开淘宝搜索；「官方旗舰店」优先自营店。'
        + '「全网」含第三方与小样；价格未排序，请自行核对。'));
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
        '此款在天猫；点开后请在天猫内搜索'));
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
    wrap.appendChild(el('p', { class: 'chips-label share-hint' }, '想发出去？下载成 PNG，或直接截这张卡'));
    card.appendChild(el('div', { class: 'share-kicker' }, 'SCENT PROFILE'));
    card.appendChild(el('h3', { class: 'share-title' }, '我的三瓶候选'));
    /* 答案摘要：只列用户真的答过的项，空值滤掉（与 result-head 同一套过滤）。
       v6 起季节屏已退场，season 永远是 null —— 那两项整段删掉，
       而不是留个恒为 null 的分支（恒 null 的代码会在下一次重构时误导人）。 */
    const budgetZh = currentBudgetZh();
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
      '从 1388 瓶中按规则打分选出，不调用大模型'
    ));
    wrap.appendChild(card);

    /* 摘要卡下方的两个本地动作：下载 PNG、翻本地档案。
       它们都只在本机完成，所以放在同一段，不混进下面的「换一批/改一题」主流程。 */
    wrap.appendChild(el('div', { class: 'qw-share-row' },
      el('button', {
        class: 'btn ghost qw-share-btn',
        type: 'button',
        onclick: (ev) => exportSharePng(ev.currentTarget),
      }, '下载分享卡片 PNG'),
      el('span', { class: 'hint' }, '在本机生成，不上传')
    ));
  }

  /* 档案与「从头重新答一遍」已移到标题下的 result-quick-entries；
     结果页底部只保留规则说明与分享区，避免入口埋在三瓶之后。 */

  return wrap;
}

/**
 * 结果页的吸底操作条（2026-11-24 复查反馈第 6 条）。
 *
 * 三个操作：心仪清单入口（带计数）/ 换一批 / 改一题重推 —— 首屏即达，
 * 不再需要滚到分享卡与档案区块之后。样式见 styles/src/97-qoder-work.css
 * 末尾那一段（纸底 + 上边线 + 向上柔影，与问卷各屏吸底的 .actions 同一套）。
 *
 * 两条结构约束，改这里之前先读：
 *   ① **必须由 render() 挂在 .fade-in 之外**。.fade-in 带进场动画的 transform，
 *      动画结束后仍是 identity matrix —— 它依然是 position:fixed 的包含块。
 *      挂在里面，条会缩成正文列宽、钉在正文列底部（实测 x=392 / w=656 /
 *      y=2446，视口高 900），看起来像"掉在页面很下面"，正是本条要修的症状。
 *   ② 内层保留 `.actions result-actions`：既沿用 .actions 的 flex 排法，
 *      也保住 test-render 里 `.result-actions .btn` 这条既有选择器。
 */
function resultDock() {
  const round = state.resultView ? state.resultView.round : 0;
  return el('div', { class: 'result-dock' },
    el('div', { class: 'actions result-actions' },
      wishEntryRow(),
      el('button', { class: 'btn', type: 'button', onclick: (ev) => reshuffle(ev.currentTarget) },
        round === 0 ? '换一批 →' : `换一批（第 ${round + 2} 组）→`),
      el('button', { class: 'btn ghost', type: 'button', onclick: (ev) => openRetune(ev.currentTarget) },
        '改一题重推'),
      el('div', { class: 'spacer' }),
      el('span', { class: 'hint' }, '换一批只换结果，答案保留；改一题只动那一屏')
    )
  );
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
    /* 与 finish() 同一份软降权名单 —— 换一批不能把避雷屏的软降权弄丢。 */
    const avoidSoftNotes = avoidSoftNow();
    const boostIds = gapBoostIds(pool, PHOTOS, AFF_LINKS);
    let res = recommend(state.answers, pool, TAX, { topN: want, avoidSoftNotes, boostIds });
    /* 先按已出过的滤，滤完不足 3 瓶就退回全库再滤一次 */
    let picked = (res.results || []).filter((r) => !view.soldOut.includes(r.perfume.id)).slice(0, 3);
    if (picked.length < 3) {
      res = recommend(state.answers, d.perfumes, TAX, { topN: want, avoidSoftNotes, boostIds });
      picked = (res.results || []).filter((r) => !view.soldOut.includes(r.perfume.id)).slice(0, 3);
    }
    /* 真的换不出新的了（库就这么大）：如实说，不假装换过。
       重置 soldOut 让用户可以重新开始一轮 —— 但按钮文案要说明这件事。 */
    if (picked.length < 3) {
      view.soldOut = [];
      res = recommend(state.answers, pool, TAX, { topN: 3, avoidSoftNotes, boostIds });
      picked = res.results || [];
      view.round = 0;
    } else {
      view.round = (view.round || 0) + 1;
    }
    state.result = { ...res, results: picked, budgetRelax: budgetRelaxInfo(picked, state.answers.budget) };
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    busy(false);
  }
}

/* ---------- 改一题：跳到某一屏，其余答案不动 ----------
   不给选择器让用户"选哪一题"：那是把一份问卷变成一张目录。
   做法是**回到最可能答错的那一屏**，点哪个回哪个 ——
   这样默认动作是"改最关键的一题"，而不是先做一次选择。

   哪一题最可能答错：**香型圆盘**（v7 起它是第 1 屏）。它同时决定两件事 ——
   候选池的族向（引擎按 family 取 profile）与整程的底噪方向；答错它，
   后面每一屏的推荐和光都会跟着偏。预算是末屏那一刀"圈池"，只影响范围、
   不影响方向，所以让位给圆盘（它按 id 取，位置变了也不用改这里）。
   这一判断写在 RETUNE_DEFAULT 里，不藏在代码中间。 */
const RETUNE_DEFAULT = 'family';
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

/* 换一档 / 改预算（leg6）：结果页放宽声明旁的按钮回到预算屏，其余答案不动。
   与 openRetune 同一条路（只改 state.step 再重画），只是目标屏固定为 budget。
   不清 state.result —— 用户改完档按「看推荐」会重算并覆盖。 */
function goBudget() {
  const list = curSteps();
  const idx = list.findIndex((x) => x.id === 'budget');
  state.step = idx >= 0 ? idx : list.length - 1;
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
        /* 第 76 条（删除）与第 77 条（改写）是页脚同一句的两半，住在这两个分支里：
           76 是「· 原始数据经清洗、家族映射与字段裁剪，」这个以逗号断在半句的
           重复说明，77 是完整的署名句。裁决要求去重并把口径统一成「香族」，
           所以这里不再另外拼一份 76 的措辞，直接把 77 的统一句接在「已修改」前
           —— 否则这个分支（meta 到货时的生产路径）会只剩一个光秃秃的「已修改」，
           CC BY 4.0 的变更说明就没了。 */
        ' · 数据经清洗、香族映射与字段裁剪，',
        el('em', {}, '已修改'),
        '。'
      )
    : el('div', { style: 'margin-top:8px' },
        el('strong', {}, '数据署名 '),
        'Scento — perfume-database · CC BY 4.0；数据经清洗、香族映射与字段裁剪，',
        el('em', {}, '已修改'),
        '。'
      );

  return el('footer', { class: 'foot' },
    /* 裁决第 78 条（删除）：「选品完全由规则打分产生，不调用大模型」与第 74 条
       （分享卡上的出处说明）重复，评审要求只留一处。留给 74，因为分享卡会离开
       本站被单独截图 —— 那句话在那里的作用更大；页脚这一段随之整块去掉，
       否则会剩一个只有「关于这些推荐」的悬空标题。 */
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
      }, '购买链接含联盟推广；成交可能产生佣金，不影响你的支付价格。')
      : null,
    el('div', { style: 'margin-top:8px' },
      el('strong', {}, '已知局限 '),
      /* 原文写「不含价格与购买渠道」—— 自 v27 起结果页就有购买入口了，
         这句话早就不成立（2026-11-10 发现）。不改会让页脚同时说
         「有推广链接」和「不含购买渠道」，自相矛盾。
         同理删掉「不展示价格」（文案二轮裁决全局问题 3 / 第 79 条）：
         第 63 条已写明「参考价和去哪买」、71/72 讲「价格未排序、请自行核对」，
         这里再说「不展示价格」就是自相矛盾。保留「不做比价」即可。 */
      '持香与扩散为按浓度推断，非实测；不做比价；库容随上游开放数据集更新，可能仍选不到你已经知道的那一瓶'
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
   hardCap 在样式层再做一次（见 styles/src/90-quiz-v6.css 的 .amb-wash），
   两处都夹是为了"只改一处也不会失控"。 */

/* ==== v6 遗留缺陷：.amb-wash 这一层从来没有被创建过（2026-11-17 发现）====
   v6 的样式层（styles/src/90-quiz-v6.css:38-101）把底噪写得很完整 ——
   三轴变量、强度闸、深色配方、12s 漂移，全部就位；但**没有任何一行 JS
   创建过 .amb-wash 这个节点**（`git grep amb-wash` 在 v6 的 app.js / index.html
   里零命中，只在 CSS 与注释里出现）。于是 v6 的"底噪"只剩两样可见物：
   #app 上的四个 CSS 变量（没人消费）与页眉那枚 .amb-tick 刻度文字。
   验收时"底噪已点燃"这件事因此无法从截图上看见 —— 这是本步必须补的。

   为什么补在这里而不是新建一条样式：底噪是**接线的一部分**（任务书第 3 条
   要求把圆盘的大方向喂给底噪系统），而这一层是那条线的末端。样式本身
   （颜色、强度、漂移、深色配方）一行不动 —— 这里只负责把节点造出来。

   为什么 z-index 用内联 -1 而不是让样式层的 0 生效：样式层假定前景内容
   有一层 `.sheet { z-index: 1 }` 托着（90-quiz-v6.css:104），而 app.js 的
   render() 从来没有输出过 .sheet —— 两条假设一起缺，正是这个缺陷的成因。
   给一条负 z-index 是**只动 JS、不动样式**的最小修法：它落在"父元素背景之上、
   正常流内容之下"，也就是底噪该待的那一层，不必给每一屏都套一层 .sheet
   （那会改掉全部七屏的 DOM 结构，超出本步范围）。
   进 DOM 的时机：applyAmbient() 在每次 render() 重建之后被调用，
   所以节点被 innerHTML='' 抹掉后会自动补回来。 */
const AMB_LAYER_ID = 'amb-wash';
/* 单例：render() 每次把 #app 清空（app.innerHTML = '' —— 真实 DOM 里那会把
   子节点连同这个层一起销毁），所以每次 applyAmbient() 都要重新挂一次。
   用模块级变量持有它而不是每次 querySelector('#amb-wash')：
   test-render 的 DOM 桩只认 .class / tag / [attr]，不认 id 选择器 ——
   写 id 查询会让"补桩"变成改被测代码的理由，那是本仓库反复反对的改法。 */
let AMB_LAYER = null;

/** 造（或取回）底噪层。 */
function ensureAmbientLayer() {
  if (AMB_LAYER) return AMB_LAYER;
  AMB_LAYER = el('div', {
    class: 'amb-wash',
    id: AMB_LAYER_ID,
    'aria-hidden': 'true',
    /* 内联覆盖样式层的 z-index: 0 —— 理由见上面那段（前景没有 .sheet 托着）。 */
    style: 'z-index:-1',
  });
  return AMB_LAYER;
}

/* ==== 刻度就地更新（v7 第 1 步补）====
   renderMasthead() 只在 render() 时决定要不要造那枚 .amb-tick，而圆盘是
   "选了不跳屏"的：点中香型只走 applyAmbient()，不重绘整页。于是刻度会
   停在"还没选"的样子 —— 页眉右侧一片空白，而底噪其实已经亮了。
   这不是 v7 引入的：v6 的大方向屏同样只调 applyAmbient()，所以它也要等到
   下一次 render 才出现刻度（test-render 的刻度断言之所以绿，是因为那时
   已经翻过屏了）。本步把它补成"跟随当前值"，因为第 1 屏就是底噪开灯的地方，
   用户点完必须立刻读到这一刻是「亮·起」还是「沉·起」。

   为什么在 applyAmbient 里补而不是在 onChange 里补：底噪的读数必须与
   底噪本身同源（同一个 amb 对象），两处各算一次就会分叉 —— 那正是
   renderMasthead 注释里记过的坑。 */
function updateAmbTick(app, amb) {
  const head = app.querySelector('.masthead');
  if (!head) return;
  let node = app.querySelector('.amb-tick');
  if (!amb.active || !amb.kicker) {
    /* 没方向就诚实地不显示（不是显示一个空刻度）。 */
    if (node && node.parentNode) node.parentNode.removeChild(node);
    return;
  }
  if (!node) {
    node = el('span', { class: 'amb-tick', 'aria-hidden': 'true' });
    head.appendChild(node);
  }
  if (node.textContent !== amb.kicker) node.textContent = amb.kicker;
}

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
  /* 节点必须先于其余内容进入 #app：它是背景，靠 z-index 站队只是兜底，
     绘制顺序上也不该压在内容后面。 */
  app.insertBefore(ensureAmbientLayer(), app.firstChild);
  updateAmbTick(app, amb);
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
       lift   上浮 6px    —— 收束后进答案（**目前无人使用**：它原本属于「已知款」
                             那一屏，该屏已按 v7 定版撤掉；留着类型说明是为了
                             将来真有"收束屏"时不必重新发明。末屏 budget 用 settle）
       rise   上浮 14px   —— 结果页（全流程唯一"给答案"的一屏）

     逐屏理由（也写在 PR 的逐屏表里）。**这张表按 id 键，不按下标** ——
     搬屏（第 ③ 步把 budget 从第 3 位搬到末位）不需要动这里，值仍按 id 取：
       family   → settle  首屏，自己就是"进门"，下沉最有"推门"感；
                          **同时是底噪开灯的那一屏**（圆盘点中即点燃）
       unwanted → cut     紧跟方向，同一段路的"不要"这一面
       occasion → settle  换轴：从"味道"进"什么时候"
       season   → cut     与场合同属时间轴，连续走完一年与一天
       concentration → settle 换轴：从"什么时候"进"多重的分量"
       budget   → settle  换轴：从"多重的分量"进"范围"。末屏仍是换挡（范围≠答案），
                          所以保留 settle 而不是 lift —— lift 是"收束后立刻给答案"，
                          这一屏之后还有一次点击，用 lift 会提前宣告结束
       result   → rise    给答案 */
  const SCENE = {
    family: 'settle',
    unwanted: 'cut',
    budget: 'settle',
    occasion: 'settle',
    season: 'cut',
    concentration: 'settle',
  };
  const list = curSteps();
  /* 入口不是问卷步骤，不参与 6 步计数；它只决定接下来渲染哪条路径。 */
  state.step = clampStep(state.step, list.length);
  const isResult = state.step >= list.length;
  const isEntry = !state.wishPage && state.entry === null;
  const emotionScreen = isEmotionScreen();
  app.dataset.scene = isEntry ? 'entry' : isResult
    ? 'rise'
    : (SCENE[list[state.step].id] || 'cut');

  /* 步骤 id 同时写进 DOM，供 CSS 认屏。
     原先靠 `main:has(.disc):has(.seg)` 认"场景屏"，结果是转盘屏被一起命中，
     masthead 的下边距在那一屏被压成 6px —— 换屏时整页跳 12–22px。
     写一个显式属性，认屏就不靠"这个屏碰巧有什么元素"。 */
  app.dataset.step = isEntry ? 'entry' : isResult ? 'result'
    : emotionScreen ? 'emotion' : list[state.step].id;

  app.innerHTML = '';
  app.appendChild(renderMasthead());
  /* 清单页是一个**顶层视图**：它没有进度尺（不是问卷的一步），
     但保留页头 —— 页头是全站的锚，去掉会让这一页看着像另一个站。 */
  if (state.wishPage) {
    app.dataset.step = 'wishlist';
    app.appendChild(renderWishPage());
    app.appendChild(renderFooter(true));
    applyAmbient();
    return;
  }
  if (isEntry) {
    app.appendChild(renderEntry());
    app.appendChild(renderFooter(false));
    applyAmbient();
  } else {
    /* 从入口进入只播放一次 300ms 上浮淡入；后续翻题沿用原逐屏转场。 */
    const flow = el('div', { class: 'entry-flow' + (state.entryMotion ? ' is-entering' : '') });
    flow.addEventListener('animationend', (ev) => {
      if (ev.animationName === 'leg8EntryIn') {
        flow.classList.remove('is-entering');
        state.entryMotion = false;
      }
    });
    flow.appendChild(renderProgress());
    flow.appendChild(renderSpecimenBar());
    if (isResult) {
      flow.appendChild(renderResult());
    } else {
      flow.appendChild(isEmotionScreen()
        ? renderEmotion()
        : list[state.step].render());
    }
    flow.appendChild(renderFooter(isResult));
    app.appendChild(flow);
  }

  /* 结果页的吸底操作条（2026-11-24 复查反馈第 6 条）。
     **必须在 .fade-in 之外**：那个容器带进场动画的 transform，动画结束
     仍是 identity matrix，依然会是 position:fixed 的包含块（见 resultDock
     的注释）。放在页脚之后，键盘顺序也是"读完内容 → 最后到操作条"。 */
  if (isResult) app.appendChild(resultDock());

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
  /* 腿8-B：新屏题干为视觉落点；先即时回顶，旧屏滚动量不泄漏。
     DOM 桩里 scrollTo 是空函数，浏览器里 instant 在 reduced-motion 下同样成立。 */
  if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  const title = app.querySelector('.q-title') || app.querySelector('.result-head h2');
  if (!title) return;
  title.setAttribute('tabindex', '-1');
  title.focus({ preventScroll: false });
}

/* ---------- 启动 ---------- */
/* 香水库（perfumes.json）与直达链接表（affiliate-links.json）自性能腿起**按需加载**：
   boot() 不再预热它们，各自在真实消费点首次用到时才发请求。

   为什么可以这么做：这两个文件都不在首屏关键路径上 ——
     · perfumes.json（1.81MB / 149KB gzip）真正的首个消费点是**第 2 屏避雷**
       （avoidPlanNow 要按香水库算模糊带）与出结果时的打分；
     · affiliate-links.json（93KB gzip）只在结果页的购买按钮上用。
   原先在 DCL 就一起拉，等于让两个非首屏文件跟 taxonomy/price-bands 抢首屏带宽
   （审计实测 price-bands 本该 275ms，被预取挤到 958ms）。

   消费点各自负责"等它到"：
     · ensurePerfumes() → 选定方向后提前取（renderFamily）、renderAvoid、finish()、reshuffle()
     · ensureAffLinks() → finish()（出结果前 await，沿用既有的「正在比对…」忙碌态）
   两个加载器本身一字未改：都是幂等的单例 promise，重复调用不会重复发请求。 */
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

/* 首屏两个必需 JSON 都可能把 fetch 或 body 读取卡住；8 秒上限覆盖整段请求，
   超时后按普通失败进入各自的降级路径，不留下永远 pending 的 Promise。 */
function fetchJsonWithTimeout(url, timeoutMs = 8000) {
  let timer;
  const request = fetch(url).then((response) => {
    if (!response.ok) throw new Error(`${url.pathname} HTTP ${response.status}`);
    return response.json();
  });
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${url.pathname} 加载超时（${timeoutMs / 1000} 秒）`));
    }, timeoutMs);
  });
  return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
}

/* taxonomy 是首屏渲染的硬依赖：第一次失败后重试一次，仍失败才交给 boot()
   的现有加载失败页。price-bands 不走重试，失败时继续用空预算降级。 */
async function fetchTaxonomyWithRetry(url) {
  try {
    return await fetchJsonWithTimeout(url);
  } catch {
    return fetchJsonWithTimeout(url).catch((err) => {
      throw new Error(`taxonomy.json 加载失败（已重试 1 次）：${err.message}`);
    });
  }
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
    /* ==== 预取风暴已砍（性能腿 2026-11-19）====
       原先这里有四路「不等它、先发请求」的预热：perfumes / affiliate-links /
       photos / 24 枚 SVG。审计实测它们在 DCL 那一刻同时起飞，
       把首屏仅有的两个必需文件（price-bands、taxonomy）挤到 958ms / 275ms 之外。
       现在四路全部移除：
         · perfumes  → 第 2 屏避雷（renderAvoid 里拉起）
         · affiliate → 出结果前（finish 里拉起）
         · SVG       → 盘心/避雷卡真实取图时（artInner 本来就会）
       仍然保留的预热只有 photos.json：它是几百字节的降级表，且挂在结果页的
       首帧判断上（见 finish 里的注解），删了会换来"先画瓶形再闪成实拍图"。

       **不要**在这里把 perfumes 加回来 —— 那会复原这次修的浪费点。 */
    ensurePhotos().catch(() => {});
    /* 价位带索引（第 1 屏预算要用）与 taxonomy 一起到位就够了 ——
       第 1 屏必须能立刻画出四枚价签，否则首屏会先空一下。

       ==== 并行化（性能腿 2026-11-19）====
       原先这两行是串行的（`await` 完 price-bands 再 `await` taxonomy），
       审计实测多付一个 RTT：price-bands 3.78s→4.74s，taxonomy 4.75s→5.03s，
       而两个文件加起来只有 18.8KB gzip。
       改成 Promise.all 并行，**到齐之后**的写入顺序与初始化调用保持原样：
       price-bands 先落 PRICE_INDEX、taxonomy 后落 TAX，然后 render() 一次。
       两条各自的降级互不牵连（price-bands 读不到只影响预算屏的价签，
       taxonomy 失败重试一次，仍失败才走 catch 的「加载失败」页）。
       两路都覆盖 fetch 与 JSON body 读取，单路上限 8 秒。 */
    /* 3-7b：中文译名表与首屏两路并行取，但不作为首屏门槛 ——
       catch 成空表后结果页按英文原名回退，读不到表不该变成「加载失败」。 */
    const [priceData, taxData, noteZhData] = await Promise.all([
      fetchJsonWithTimeout(new URL('data/price-bands.json', base)).catch(() => null),
      fetchTaxonomyWithRetry(new URL('data/taxonomy.json', base)),
      fetchJsonWithTimeout(new URL('data/note-zh.json', base)).catch(() => ({})),
    ]);
    PRICE_INDEX = priceData || null;
    TAX = taxData;
    NOTE_ZH = noteZhData || {};
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
/* 腿7a3：分差偏向用的「有图且有直达商品链接」瓶集合。
   纯函数：只读数据层已加载的 PHOTOS / AFF_LINKS，不改任何状态。
   引擎据此在 ≤2% 分差内优先选这些瓶。 */
function gapBoostIds(perfumes, photos, affLinks) {
  const ids = [];
  const aff = affiliateConfig();
  for (const p of perfumes || []) {
    if (!p || !p.id) continue;
    if (!artSourceOf(p, photos)) continue;
    /* "有链接"= 有直达商品链接：与 7a1/7a2 的判定同一条
       （搜索兜底每瓶都有，不算这里说的"有链接"）。 */
    const links = affiliateLinks(p, aff) || [];
    const hasDirect = links.some((l) => l.kind !== 'search' && !l.searchLanding);
    if (hasDirect) ids.push(p.id);
  }
  return ids;
}
/* leg7a2：首屏理由/链接的纯函数句柄，专项验证直接调，
   不必走真渲染就能逐格验「厚重感 0.5 → 偏清爽，不闷」与按钮文案。 */
export const __gap = { boostIds: gapBoostIds };
export const __cmp = {
  sentence: cmpSentenceOf,
  reason: cmpReasonOf,
  buy: cmpBuyOf,
};
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
   v6 起八屏固定、无入口分叉，但"条数"与"第 N 步 / 共 M 步"这对数字
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

/* 动态避雷层。三条硬规则（本类核心不问 / 最对立不问 / 只问模糊带）
   都只有这里取得到 —— 界面上只能看到"上了哪几张卡"，看不到"为什么没上"。
   plan 直接透传 src/avoid.js 的纯函数，测试注入 DATA/TAX 后即可复算。 */
export const __avoid = {
  scenarios: AVOID_SCENARIOS,
  plan: avoidPlanNow,
  soft: avoidSoftNow,
  /* 三态归并（2026-11-23）：两列互斥 + 只留屏上还存在的 id。
     测试要用它验"没闻过不进 unwanted、也不进 dislikedNotes"。 */
  select: avoidSelection,
  /* 这一屏真实写进 state 的两列 —— 断言"没闻过没被折算成 -40"只能从这里看，
     因为界面上两种态长得不一样，但引擎侧只有一个 dislikedNotes。 */
  picked: () => ({
    unwanted: (state.answers.unwanted || []).slice(),
    noSmell: (state.answers.noSmell || []).slice(),
    dislikedNotes: (state.answers.dislikedNotes || []).slice(),
  }),
  /* 让测试把香水库/分类表塞进来，不必真 fetch（与 __art.set 同一手法）。 */
  setData: (d) => { DATA = d; avoidIndex = null; },
  setTax: (t) => { TAX = t; avoidIndex = null; },
};

/* 预算映射层。测试要验"档太窄时退回全库"这条降级，而它只在池子上生效，
   光看界面看不出来。 */
export const __budget = {
  pool: poolForBudget,
  bands: () => priceIndex(),
  setIndex: (v) => { PRICE_INDEX = v; },
  /* leg6：价签数 / 主按钮文案 / 放宽检测都要能在 node 里手算核对，
     与候选查询同源（验收：手算展示数与候选查询一致）。 */
  knownCount: bandKnownCount,
  ctaText: budgetCtaText,
  relaxInfo: budgetRelaxInfo,
};

/* 圆盘 → 底噪轴的换算层（v7 第 1 步）。
   测试要验三件事，而这三件事都只有这里取得到：
     ① 选了家族之后 direction 真的被写进去、清空时真的被清掉；
     ② AXIS_OF_FAMILY 等于 emotionMap 上的全局最优匹配（不是手配的六个字）；
     ③ 六个家族映射到六个**不同**的轴（多族共用一轴 = 底噪分不出族）。
   ② 尤其必要：那张表上差 0.05 分肉眼完全看不出来，必须能算。 */
export const __dir = {
  axis: AXIS_OF_FAMILY,
  directionOf: (answers) => (answers && answers.family ? (AXIS_OF_FAMILY[answers.family] || null) : null),
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

/* 季节屏「方向 × 季节」那一句的取值函数（定版 2026-11-23）。
   测试要用它把"屏上那句话"与"该方向该季的那句话"对齐 ——
   断言里不该再抄一份 24 句：抄一份就等于有第二个来源，
   而本任务的验收线正是"只有一个来源、逐字一致"。 */
export { seasonScene as __seasonScene } from './src/season-copy.js';

/* 24 格的完整表（含 family 反查）。测试用它验"上屏那句 = 表里那一格"，
   不需要读仓库外的定版 md —— check-head 会把 HEAD 干净导出到临时目录，
   那种地方读不到本机路径，断言会退化成"只有本机能绿"的假门。 */
export { SEASON_SCENE_CELLS as __seasonCells } from './src/season-copy.js';

/* 问卷答案（只读用途：测试要临时把 family 置空，验"没有方向时回退 desc"
   这条降级路径。真渲染才看得见，纯函数验不到）。 */
export const __state = state;

/* 季节屏重画一次（见 renderSeason 里 seasonRepaint 的赋值与注释）。 */
export const __seasonRepaint = () => { if (seasonRepaint) seasonRepaint(); };


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
