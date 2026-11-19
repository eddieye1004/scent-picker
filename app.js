
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
/* v3 新增两个纯逻辑层（零 DOM 依赖，各自文件头写了口径）：
     ambient.js  环境线三轴累加 + 预算档定义
     scenes.js   生活情景表（把香调术语换成"你闻过的东西"） */
import {
  ambientOf, BUDGET_BANDS, bandById, bandOfPrice, bandExclusionNote,
  seasonTint, seasonBandWarm, SEASON_AMBIENT as SEASON_AMBIENT_LOCAL,
} from './src/ambient.js';
import {
  LIKED_SCENES, AVOID_SCENES, sceneById, notesOfScenes, zhOfScenes,
  allSceneNotes, FAMILY_PLAIN, BUDGET_PLAIN,
} from './src/scenes.js';

const state = {
  step: 0,
  answers: {
    // 香型轮盘两个层级：family 是外圈大类，subfamily 是中圈子类（可只选到大类）
    family: null,
    subfamily: null,
    emotion: null,
    occasion: null,
    intensity: 3,
    /* v3：生活情景（scenes.js 的 id）。
       这是用户真正点的东西；likedNotes / dislikedNotes 由它们派生，
       引擎读的仍是那两个 en 数组 —— 打分侧一行没改，见 syncNotesFromScenes()。 */
    likedScenes: [],
    avoidScenes: [],
    likedNotes: [],
    dislikedNotes: [],
    // 英文香调名 → 中文显示名。理由里要回显用户点的中文，而不是 bergamot。
    likedZh: {},
    dislikedZh: {},
    /* v3：预算档（'b1'..'b4'，null = 不限）。前置到第 2 屏。
       **刻意不进 activeDims**：它是候选范围，不是偏好证据；
       写进答案会让 MATCH_PCT_MIN_DIMS 的门槛虚抬一维，拿范围冒充证据。
       它只作用于「把哪一批瓶子交给 recommend()」，见 poolForBudget()。 */
    budget: null,
    /* v19 新增。全部默认为空 —— 用户在第 2–10 步一路按「下一步」跳过时，
       引擎侧每个新因子都会因为取不到值而整条跳过（不加分也不扣分），
       行为与旧四步流程逐位一致。 */
    characterPreset: null,
    characterTags: [],
    /* 气质原型的「禁止标签」。第 3 步预选/换选都会写它（见 renderMood），
       但初始值一直缺席 —— 于是「没答气质」与「答过又清空」在引擎侧长得一样。
       补上初始值，让 restart() 与这里保持同一份键表。 */
    characterNeg: [],
    temperature: null,          // 'warm' | 'cool' | 'neutral'
    sweetness: null,            // 0..3
    anchorBrand: null,
    anchorPerfume: null,        // perfume.id
    anchorNotes: [],            // 香调 en 列表
    season: null,
    concentration: null,
    longevity: null,
    /* `longevityManual` 保留但已无写入点 —— v42 撤掉了第 5 步的「改」按钮，
       留香变成纯展示。留着这个键是为了让老存档不至于因为缺字段而报错；
       restart 里也一并清掉（两处键表必须一致，历史上漏过两次）。 */
    longevityManual: false,
    dislikedFamilies: [],
  },
  result: null,
};


let DATA = null;
let TAX = null;
/* 实物图清单（id → 本地路径）。null = 还没试过，false = 试过、没有。
   与 AFF_LINKS 同一套三态语义，避免重复发请求。 */
let PHOTOS = null;
/* 已抠图（透明背景）的 id 集合。与 PHOTOS 同批加载，见 ensurePhotos()。 */
let CUTOUTS = null;
/* v3 挂牌价表（id → 整数元）。与 PHOTOS 同一套三态语义：
   null = 还没试过，false = 试过、没有，对象 = 有。
   **没有价不等于最便宜**：预算筛选时无价的瓶直接退出候选，
   而不是回落到某个默认档（那会让用户以为"这瓶很便宜"）。
   产物由 scripts/build-prices.mjs 生成，口径写在它的文件头。 */
let PRICES = null;

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

/* ---------- 步骤定义 ----------
   ==== 2026-11-16 问卷 v3（Eddie 定版）====
   规格正本：`C:\Users\16256\work\design-logic-study-20261116.md` 第五节与「五·补」。

   v3 只改**提问语言与屏内形式**，不碰打分引擎、不碰目录数据。
   九屏，每屏仍只做一个决定（一屏一问是 2026-11-10 的既有契约，不改）：

     1 family         香型（圆盘保留，六个扇区换成生活语言，术语只做注脚）
     2 budget         预算（**前置**：先划货架边界，再问偏好）
     3 wanted         想要的味道（生活情景，不是香调名）
     4 avoid          受不了的味道（生活情景）
     5 mood           气质
     6 occasion       场合（一天的时间弧）
     7 season         季节（温度光带）
     8 concentration  浓淡 + 浓度（香气扩散场）
     9 anchor         已知款

   相对 v19 的四处结构取舍，逐条留痕：

   ① **砍掉「整族排除」这一屏**（原 dislikedFamilies）。
      它不是偏好问题，是纠错手段，而实测它是全问卷最接近无效的一项：
      docs/QUESTIONNAIRE-VALUE-20261109.md §二 排名第 13，
      榜内换人 0.34（最低）、top-1 更换 3/35。留着它等于让用户在第 8 屏
      做一个点了几乎不改变结果的决定。删掉之后 `when()` 这条动态分叉整块消失，
      步骤表变成常量 9 屏 —— 「共 N 步」不再有两套数字。

   ② **香型屏保留圆盘，但扇区文案换成生活语言**。
      Eddie 点名的三项满意项之首就是首屏圆盘交互；但它的六个标签
      「柑橘调 / 花香调 / 东方琥珀调」本身是一道术语题，与「全程无香调术语题」
      冲突。折中是**同一个物体、换语言**：主词写「刚剥开的橘子皮」这类生活描述，
      术语降为一行 12px 注脚（术语从不裸奔，但也不再是主词）。
      圆盘的几何、两层展开、盘心标本全部不动 —— 它们承载的是信息结构，不是词。

   ③ **香调两屏换成生活情景**（v3 的核心）。
      旧版第 2、3 屏是 58 个香调名的 chip 墙，出现在用户还没进入状态的位置。
      新版每格写成一件闻过的东西（"刚剥开的橘子皮"），背后挂到仓库既有的
      香调 en 上，见 src/scenes.js。引擎读的仍是 likedNotes / dislikedNotes，
      一个字段都没改 —— 变化全部落在映射层（syncNotesFromScenes）。

   ④ **预算屏新增并前置到第 2 屏**。
      它不进 answers 的打分维度（见 state 注释），只做候选池前置过滤。
      放在香型之后而不是最前：圆盘是这支产品的入口，把它挪到第 2 位
      会让首屏变成一排价签 —— 那是电商筛选器，不是"从感觉出发"。
    */
const STEPS = [
  {
    id: 'family',
    short: '香型',
    title: '哪一类味道让你闻着舒服？',
    /* help 第一句先说"不用记名字"——这一屏的主词已经换成生活语言，
       术语只是注脚，所以这句话现在是**事实陈述**而不是安慰。 */
    help: '不用记名字，看图标和那句大白话就行。转盘外圈挑大方向，中圈可以再收窄一层',
    render: renderFamily,
  },
  {
    id: 'budget',
    short: '预算',
    title: '这一瓶，你打算花多少？',
    /* 为什么先问预算：它是**范围**不是偏好，问得越晚越像在结果页推销。
       放在第 2 屏，等于在用户描述完"想要什么味道"之前先把货架宽度定下来。 */
    help: '只影响从哪一段货架里挑，不影响匹配怎么算。拿不准就选「不限」',
    render: renderBudget,
  },
  {
    id: 'wanted',
    short: '想要',
    title: '这些东西里，哪些是你想闻到的？',
    help: '都是你闻过的东西，不用记香调名。想不起来就跳过——后面还有别的维度',
    render: renderWanted,
  },
  {
    id: 'avoid',
    short: '不想要',
    title: '哪些味道你完全不想靠近？',
    /* 与上一屏的因果要写清：排除比偏好更能收窄。这是实测结论
       （docs/QUESTIONNAIRE-VALUE-20261109.md：讨厌的香调 榜内换人 2.15、
       乱序仅 0.011 —— 只做剔除不做重排，所以它值得单独一问）。 */
    help: '这一题比上一题更能收窄范围：讨厌的东西没有替代品，喜欢的往往有',
    render: renderAvoid,
  },
  {
    id: 'mood',
    short: '气质',
    title: '你希望它给人什么感觉？',
    help: '这一组讲的是它给人的感觉，不是具体味道。挑一个最像的就行',
    render: renderMood,
  },
  {
    id: 'occasion',
    short: '场合',
    title: '主要什么时候用？',
    /* 任务8 B1（Eddie 2026-11-12 批准）：原文「主战场决定浓度下限」
       是两处黑话之一（POLISH-20261112.md §2 标出的候选）。
       「主战场」→「你最常在什么场合用」、「浓度下限」→「推荐的浓淡」，
       保留原句的因果结构（场合决定什么）与兜底动作（拿不准就选日常）。 */
    help: '你最常在什么场合用，决定了推荐的浓淡。选一个最像的，拿不准就选日常',
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
    /* 2026-11-11：原 intensity / concentration 两屏合回这一屏。
       id 沿用 'concentration' 而不是新造一个 'strength'：
       ① 旧 id 'strength' 已被测试明确断言"不得复活"（test-render 的入口分叉段），
          复活它会让那条断言变成假阳性，也分不清"回滚"和"复制粘贴忘改 id"；
       ② 'concentration' 是这一屏的真正落点（③ 留香由它推断），
          而 'intensity' 变成屏内 ① 的锚点，不再是独立步骤。 */
    id: 'concentration',
    short: '浓淡',
    title: '想要多浓？',
    /* help 一句说清这一屏的两个数不是一回事，并把可跳过讲在前面 ——
       原来两屏各写一句 help，合回一屏后不能只留一句，
       否则用户会以为下面那组浓度卡是"同一题的另一种问法"。 */
    /* 任务8 B2（Eddie 2026-11-12 批准）：原文「香精占比」
       是两处黑话之二（POLISH-20261112.md §2 标出的候选）。
       改为「浓度类型」——与这一屏的 short 字段「浓淡」呼应，
       也与下面单选卡的文案（EDT/EDP 这类选项）对得上。
       注意只改这一处 help；同一屏内其它几处「香精占比」是页面内释义文字，
       它们正是用来解释这个词的，不是黑话本身，不动。 */
    help: '先说体感（想让人闻到多重的分量），再说浓度类型（决定留香多久）。两项都不选也能出结果',
    render: renderConcentration,
  },
  {
    id: 'anchor',
    short: '已知款',
    title: '有没有已经试过、并且喜欢的香水？',
    /* 一屏一问版的重写：原来的 help 是「可跳过。这一题比前面所有问题都准——
       直接拿它的香调表去找相似的气味」。第二句对"零基础"的人是**反向激励**：
       一个不懂香水的人点进来，先看到"这一题最准"，再看到"记得是哪一瓶"的
       品牌搜索框，会以为必须答、且必须记得名字，于是卡在这里或随手乱填。
       零基础人群不知道名字是常态，所以 help 第一句就要卸掉这个压力，
       并且把"跳过"放在最前面（原句放在"可跳过"之后紧接"最准"，读起来像
       "可跳过但跳了就亏"）。 */
    help: '不记得名字就跳过 —— 这是唯一一题需要你认得瓶子的，答不出很正常。'
      + '如果记得品牌，选一下会明显更准',
    render: renderAnchor,
  },
];

/* 当前生效的步骤表。
   v3 之后 STEPS 里不再有 `when()` —— 「整族排除」那一屏被删（理由见 STEPS 顶部的
   ① 条），于是九屏对所有人恒定。「共 N 步」只有一套数字，入口不再分叉。

   这个函数仍然保留，而且所有「第 N 步 / 共 M 步」与进度段数都必须继续走它，
   不许直接读 STEPS.length：将来若再加回动态屏，两处数字一旦分叉，
   界面会显示「共 8 步」但只有 7 屏，用户翻到第 7 屏就出结果，会以为漏了一屏。
   它同时是测试的取数入口（`__steps.cur`）。 */
function curSteps(answers = state.answers) {
  return STEPS.filter((st) => !st.when || st.when(answers));
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
   v3 · 连接感三件套（Eddie 2026-11-16 定版，规格「五·补」）
   ------------------------------------------------------------
   这一段的三个函数是「整个问卷是一段旅程，不是一屏屏表单」的实现。

     ambientStyle()   环境线：把答案算成一组 CSS 变量，写在 #app 的行内样式上
     escortBar()      标本签：已选香型的小图标，跟着用户走完每一屏
     sceneTransition() 屏间不断裂：切换时不整页淡入，而是让环境值**插值**过去

   三条都必须同时成立才算连接感，缺一条就退回"翻页"：
     · 环境线连续 —— 写在 #app 上而不是每一屏上，所以它跨屏存在、只改值；
     · 屏间有连续元素 —— 标本签在 #app 里，不随 render() 的 innerHTML 清空而消失
       （见 render()：它不 append 进 app.innerHTML 的替换范围，而是单独维护）；
     · 标本签到结果页与推荐卡图标呼应 —— 见 renderResult 的 esc-card 段。

   ⚠️ 改这里之前先读规格第五节：环境线的**唯一验收标准是"累积"**，
   不是"好看"。任何让它每屏重置（覆盖式赋值）的改法都是回归。
   ============================================================ */

/* 当前情形的环境值缓存。为什么要有缓存而不是每次重算：
   屏间过渡需要「上一屏的值 → 这一屏的值」两端，重算只能得到这一端。
   缓存同时是测试的观察点（`__ambient.last`）。 */
let ambientPrev = null;

/** 取当前答案对应的气质原型 dims（没选就是 null）。 */
function moodDimsNow() {
  const id = state.answers.characterPreset;
  if (!id) return null;
  const c = CHARACTER_PRESET.find((x) => x.id === id);
  return c ? c.dims : null;
}

/** 生活情景对环境的推力（取"想要"那一屏的均值，最多 ±0.24）。 */
function scenePushNow() {
  const ids = state.answers.likedScenes || [];
  if (!ids.length) return null;
  let t = 0;
  let l = 0;
  let n = 0;
  for (const id of ids) {
    const s = sceneById(id);
    if (!s || !s.push) continue;
    t += s.push.temp || 0;
    l += s.push.light || 0;
    n += 1;
  }
  if (!n) return null;
  return { temp: t / n, light: l / n };
}

/** 当前答案 → 环境状态（纯函数调用的薄封装，集中一处，避免散落）。 */
function currentAmbient() {
  return ambientOf(state.answers, { moodDims: moodDimsNow(), scenePush: scenePushNow() });
}

/** 环境状态 → #app 的行内 CSS 变量。命名带 `--amb-` 前缀，样式层只认这一组。 */
function ambientStyle(a) {
  /* 三个 0..100 的百分比给 CSS 直接做渐变插值位置，
     另给 warm/lit 两个 0..1 的数做透明度与色相计算。
     全部写成字符串：CSS 变量在行内样式里只能是字符串。 */
  return [
    `--amb-warm: ${a.warm.toFixed(3)}`,
    `--amb-lit: ${a.lit.toFixed(3)}`,
    `--amb-weight: ${((a.weight + 1) / 2).toFixed(3)}`,
    `--amb-temp: ${a.temp.toFixed(3)}`,
  ].join('; ');
}

/* ---------- 标本签（escort）----------
   已选香型的小图标，做成 24px 的一枚，跟着走完每一屏。
   为什么用 ART_FILE 那套上色 SVG 而不是重新画：规格第二节要求「图标优先复用/
   扩展现有香型小图标系统」，且那 24 枚已经过「36px 不看文字可辨形」的验收。
   这里只缩小到 22px 用，不新增任何图形。

   一个细节：**标本签只在真的选过香型之后出现**。没选就画一个空框，
   等于每一屏挂一个"提醒你没答"的牌子 —— 那是压力，不是陪伴。 */
const ESCORT_SIZE = 22;

/** 香型 id（家族）→ 用于标本签的小类 id（取该族第一个小类的图标）。 */
function escortSubOf(famId) {
  const fam = (TAX?.families || []).find((f) => f.id === famId);
  if (!fam) return null;
  const subs = fam.subfamilies || [];
  const chosen = state.answers.subfamily
    ? subs.find((s) => s.id === state.answers.subfamily)
    : subs[0];
  return chosen || null;
}

/* 就地刷新标本签：不重绘整屏，只把 .escort 那一块换成当前状态。
   为什么需要它：第 1 屏的 onChange 是"只改 state、不重绘"（重绘会重播
   圆盘转场），所以标本签也必须走"就地替换"这条路，不能等下一次 render()。
   若当前这一屏不该有签条（还没选香型 / 在结果页），就把旧的摘掉。 */
function syncEscort() {
  const app = $('#app');
  if (!app) return;
  const old = app.querySelector('.escort');
  const isResult = state.step >= curSteps().length;
  const fresh = isResult ? null : escortBar({});
  if (old) {
    if (fresh) old.parentNode.replaceChild(fresh, old);
    else old.remove?.();
  } else if (fresh) {
    app.insertBefore(fresh, app.firstChild);
  }
}

/**
 * 标本签条。返回 null 表示"这一屏不该有"（还没选香型）。
 * 形态取"标本柜里的签条"：一枚小图 + 生活词 + 术语注脚 + 价签，一行排开。
 * 为什么不做成浮动徽章/胶囊：那是社交产品的语言（关注、标签）。
 * 这个站的语言是图鉴与标本柜，签条应该**贴在页面上**，而不是浮在内容之上。
 * @param {{at?: 'top'|'result'}} cfg
 */
function escortBar(cfg = {}) {
  const famId = state.answers.family;
  if (!famId) return null;
  const fam = (TAX?.families || []).find((f) => f.id === famId);
  if (!fam) return null;
  const sub = escortSubOf(famId);

  const bar = el('div', {
    class: 'escort' + (cfg.at === 'result' ? ' is-result' : ''),
    'data-escort': famId,
    role: 'img',
    'aria-label': `已选香型：${fam.zh}${sub ? ' · ' + sub.zh : ''}`,
  });

  /* 图标：优先上色 SVG（与盘心同一套），没就绪时留位不画线稿（同 scentPlate 的取舍：
     线稿会先闪一帧再被替换，用户看得见）。 */
  const icon = svgEl('svg', {
    class: 'escort-art',
    viewBox: '0 0 ' + PLATE_SIZE + ' ' + PLATE_SIZE,
    'aria-hidden': 'true',
    focusable: 'false',
  });
  if (sub) {
    const ready = artSvgReady(sub.id);
    if (ready) icon.innerHTML = ready;
    else {
      artInner(sub.id).then((inner) => {
        if (!inner) return;
        icon.innerHTML = artNs(inner, 'a' + (++artSeq));
      });
    }
  }
  bar.appendChild(icon);

  /* 文字：主词用**生活语言**（与圆盘扇区同一套，见 FAMILY_PLAIN），
     术语降为后缀小字。标本签是"我带在身上的那枚标签"，
     标签上写的应该是人话。 */
  bar.appendChild(el('span', { class: 'escort-zh' }, FAMILY_PLAIN[famId] || fam.zh));
  bar.appendChild(el('span', { class: 'escort-term' }, fam.zh));

  /* 预算：选过就把价签钉在标本签右侧 —— 它是范围，与香型并列显示最省事，
     不必每屏再解释一遍。 */
  const band = bandById(state.answers.budget);
  if (band && cfg.at !== 'result') {
    bar.appendChild(el('span', { class: 'escort-price' }, band.zh));
  }

  return bar;
}
/* ---------- 圆盘选择器（第 1、2 步共用）----------
   形状用 SVG 画（扇形 + 装饰环），但"可点"的部分是绝对定位的真实 button。
   没有把交互交给 SVG：在 480×480 的坐标系里做命中测试，既拿不到浏览器的
   44px 触控保护，键盘 Tab 也进不去 —— 那样只剩"看起来能点"。
   盘心显示当前指向项的说明，指针移上去就先读一遍，再决定点不点。 */
const SVG_NS = 'http://www.w3.org/2000/svg';
// rIn 的取值由盘心的 **方角** 决定，不是方角边长决定的。
// 盘心是方块，四个角到圆心的距离 = 边长 × √2/2 ≈ 边长 × 0.7071，比方边长本身更靠外。
// 设盘心边长占盘径 p，则方角占 p×0.7071；内圆半径必须大于它，否则方角穿出内弧，
// 把整条内圆切成四段碎线（rIn=104 时就是这样），或者干脆顶出轮廓（盘心 42% 时实测溢出 3.2px）。
// 取 rIn=146：146/480 = 30.42%，容得下 42% 盘心（29.70%），留 0.72% 余量；
// 桌面盘心 34%（24.04%）余量 6.4%，约 32px——这个空隙就是盘心不"贴脸"的来源。
/* 两个盘（第 1 步的同心轮盘、第 4 步的场合盘）视框都是 480×480、圆心都在 (240,240)。
   原先各写一份极坐标函数，差别只有引用的常量名不同 —— 归一后逐字符等价（各 334 字符）。
   圆心抽成一个常量：它不可能一边改一边不改，分成两份只会掩住不一致。 */
const VB_CENTER = 240;

const DISC = { vb: 480, cx: VB_CENTER, cy: VB_CENTER, rOut: 230, rIn: 146, gapDeg: 1.6 };

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

/**
 * @param {Array<{id:string, zh:string, desc:string}>} items
 * @param {{label:string, selectedId:string|null, onPick:(item)=>void}} cfg
 */
function buildDisc(items, cfg) {
  const { label, selectedId, onPick } = cfg;
  const n = items.length;
  const stepDeg = 360 / n;
  const half = stepDeg / 2;
  // 第一个扇区正对 12 点，读起来像仪表盘而不是随机起始角
  const startBase = -90 - half;

  const root = el('div', { class: 'disc', role: 'radiogroup', 'aria-label': label });

  /* 可旋转层。SVG 与标签一起转，但标签各自反向旋转，文字始终正立。
     旋转量只由一个自定义属性 --disc-rot 驱动：每帧只写一次 style，
     6 个标签靠 calc(-1 * var(--disc-rot)) 自动跟随，不必逐个改。 */
  const rot = el('div', { class: 'disc-rot' });
  root.appendChild(rot);

  /* --- SVG：扇形 + 装饰环 --- */
  const svg = svgEl('svg', {
    class: 'disc-svg',
    viewBox: `0 0 ${DISC.vb} ${DISC.vb}`,
    'aria-hidden': 'true',
    focusable: 'false',
  });

  svg.appendChild(svgEl('circle', {
    class: 'ring-thin', cx: DISC.cx, cy: DISC.cy, r: DISC.rOut + 6,
  }));

  /* 内圈分度刻线：36 道，每 3 道（30°）加长。
     这不是装饰花纹——罗盘、日晷、量角器都长这样，因为它有用：
     用户能数出「这是被切成几份的东西」。纯 SVG 直线，不参与命中。

     V2 改法 B：节点顺序从「扇区之前」挪到「扇区之后」。
     原先它 append 在六个 sector-g 前面，于是 fills 一draw 就把它整片盖掉 ——
     display 放开后实测仍看不见（刻线在盘心之外、扇区填充之下 = 零像素）。
     SVG 没有 z-index，绘制顺序就是 DOM 顺序，所以这里必须先画扇区。 */
  const TICK_N = 36;

  svg.appendChild(svgEl('circle', {
    class: 'ring-accent', cx: DISC.cx, cy: DISC.cy, r: DISC.rIn - 16,
  }));
  // 缓慢旋转的弧：纯装饰，给"机器在运行"的暗示，不影响任何命中
  svg.appendChild(svgEl('circle', {
    class: 'ring-spin', cx: DISC.cx, cy: DISC.cy, r: DISC.rOut - 3,
  }));

  const groups = [];
  items.forEach((it, i) => {
    const a0 = startBase + i * stepDeg + DISC.gapDeg;
    const a1 = startBase + (i + 1) * stepDeg - DISC.gapDeg;
    const g = svgEl('g', { class: 'sector-g' });
    g.appendChild(svgEl('path', { class: 'sector-shape', d: annulusPath(DISC.rOut, DISC.rIn, a0, a1) }));
    svg.appendChild(g);
    groups.push(g);
  });

  /* 刻线最后画，压在扇区之上（见上）。 */
  for (let k = 0; k < TICK_N; k++) {
    const deg = -90 + (360 / TICK_N) * k;
    const major = k % 3 === 0;
    const r1 = DISC.rIn - 2;
    const r2 = DISC.rIn - (major ? 10 : 6);
    const [x1, y1] = polar(r1, deg);
    const [x2, y2] = polar(r2, deg);
    svg.appendChild(svgEl('line', {
      class: major ? 'ring-tick is-major' : 'ring-tick',
      x1, y1, x2, y2,
    }));
  }

  rot.appendChild(svg);

  /* --- 盘心：默认空态，指针移上去就换成那一条的说明 --- */
  // 三态的 kicker 要走同一句法：都是「当前这一格的语义」，只是时态不同。
  // 空态曾写「尚未选择」，跟下面那行「还没选」叠成两句同义话，盘心读起来啰嗦。
  const IDLE_KICK = '当前选择';
  const HOVER_KICK = '正在看';
  const PICK_KICK = '已选定';
  // 空态文案分长短路：手机盘心只有 146px，长句会挤成三行贴到边框。
  // 桌面 215px 宽（42.7% × 504 − 32 padding ≈ 183px），12px 中文每行约 15 字，
  // 原来的「点任意扇区，或先把指针移上去看看」16 字会折出孤字行，收短到 11 字。
  const narrow = window.matchMedia?.('(max-width: 620px)').matches;
  const IDLE_DESC = narrow ? '点任意扇区' : '点扇区，或把指针移上去';

  const hubKicker = el('div', { class: 'hub-kicker' }, IDLE_KICK);
  const hubZh = el('div', { class: 'hub-zh' }, '还没选');
  const hubDesc = el('div', { class: 'hub-desc' }, IDLE_DESC);
  const hub = el('div', { class: 'disc-hub is-idle' }, hubKicker, hubZh, hubDesc);
  root.appendChild(hub);

  // kind 默认 'pick'：mouseleave / blur 时恢复盘心，那时既没"正在看"也不是空态，
  // 而是回到"已经选了什么"。若默认 undefined，移开鼠标会让墨块退回浅色，
  // 看起来像选择被取消了。
  const showInHub = (it, kind = 'pick') => {
    const nextZh = it ? it.zh : '还没选';
    const nextDesc = it ? it.desc : IDLE_DESC;
    // 文案比较要连 kicker 一起比：只比主标题会让「空→悬停同一项」不触发动画。
    const nextKick = it ? (kind === 'hover' ? HOVER_KICK : PICK_KICK) : IDLE_KICK;
    const changed = hubZh.textContent !== nextZh || hubKicker.textContent !== nextKick;
    // 三态靠两个类组合：is-idle（没选）/ is-picked（已选定，翻墨块）/ 都没有（悬停预览）。
    // 悬停只是预览，不该把方块压黑——那会让人以为已经选定。
    hub.classList.toggle('is-idle', !it);
    hub.classList.toggle('is-picked', !!it && kind === 'pick');
    hubKicker.textContent = nextKick;
    hubZh.textContent = nextZh;
    hubDesc.textContent = nextDesc;
    // 只有文字真的换了才放动画：鼠标在同一条上反复进出不该一直闪。
    // is-swap 先移除再加，强制浏览器重新触发 keyframes（连续两次同值不会重播）。
    if (changed) {
      hub.classList.remove('is-swap');
      void hub.offsetWidth;
      hub.classList.add('is-swap');
    }
  };

  /* --- 扇区按钮：真实 button，键盘可达，触控 44px --- */
  const buttons = [];
  // 记录当前已选项，供 mouseleave / blur 回退盘心
  const pick = { current: selectedId };
  const setOn = (idx) => {
    buttons.forEach((b, j) => {
      const on = j === idx;
      b.setAttribute('aria-checked', String(on));
      // 选中项接管 tabindex=0，Tab 回到圆盘时焦点直接落在已选项上
      if (typeof idx === 'number') b.setAttribute('tabindex', on ? '0' : '-1');
      groups[j].classList.toggle('is-on', on);
    });
  };

  items.forEach((it, i) => {
    const midDeg = startBase + (i + 0.5) * stepDeg;
    // 标签落在外弧与内弧的正中间，避免贴边被裁
    const midR = (DISC.rIn + DISC.rOut) / 2;
    const [lx, ly] = polar(midR, midDeg);
    const left = (lx / DISC.vb) * 100;
    const top = (ly / DISC.vb) * 100;

    /* 扇形本体也要能点。扇区面积远大于标签（半径 104–230 的整块环形），
       只给标签挂事件等于让用户去戳一个小方块。这里把同一套行为挂到 <g> 上，
       点击、悬停、焦点三态与标签按钮完全一致。 */
    const g = groups[i];
    g.setAttribute('role', 'presentation');
    g.addEventListener('click', () => {
      pick.current = it.id;
      setOn(i);
      showInHub(it, 'pick');
      groups.forEach((x, j) => x.classList.toggle('is-hot', j === i));
      onPick(it);
    });
    g.addEventListener('mouseenter', () => {
      showInHub(it, 'hover');
      g.classList.add('is-hot');
      hub.classList.add('is-hover');
    });
    g.addEventListener('mouseleave', () => {
      const cur = items.find((x) => x.id === pick.current);
      showInHub(cur || null);
      groups.forEach((x, j) => x.classList.toggle('is-hot', items[j].id === pick.current));
      hub.classList.remove('is-hover');
    });

    const btn = el('button', {
      class: 'disc-sector',
      type: 'button',
      role: 'radio',
      'aria-checked': String(selectedId === it.id),
      tabindex: selectedId === it.id || (selectedId === null && i === 0) ? '0' : '-1',
      style: `left:${left.toFixed(2)}%;top:${top.toFixed(2)}%`,
      onclick: () => {
        pick.current = it.id;
        setOn(i);
        showInHub(it, 'pick');
        groups.forEach((g, j) => g.classList.toggle('is-hot', j === i));
        onPick(it);
      },
      // 悬停文字标签时扇形必须同步亮：按钮盖在扇形上方，只给 <g> 挂 mouseenter
      // 的话，指针落在文字上扇形是不动的，反馈就断在用户最常指的位置。
      onmouseenter: () => {
        showInHub(it, 'hover');
        hub.classList.add('is-hover');
        groups.forEach((g, j) => g.classList.toggle('is-hot', j === i));
      },
      onmouseleave: () => {
        const cur = items.find((x) => x.id === pick.current);
        showInHub(cur || null);
        groups.forEach((g, j) => g.classList.toggle('is-hot', items[j].id === pick.current));
        hub.classList.remove('is-hover');
      },
      onfocus: () => showInHub(it, 'hover'),
      onblur: () => {
        const cur = items.find((x) => x.id === pick.current);
        showInHub(cur || null);
      },
    },
      el('span', { class: 'zh' }, it.zh),
      el('span', { class: 'en' }, it.id.toUpperCase())
    );

    // 方向键在扇区之间移动 —— 圆盘用 Tab 一个个过太慢
    btn.addEventListener('keydown', (ev) => {
      let d = 0;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') d = 1;
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') d = -1;
      else return;
      ev.preventDefault();
      const to = (i + d + n) % n;
      // roving tabindex：移动焦点时同步把 tabindex=0 搬过去，
      // 否则 Tab 离开圆盘再回来，焦点会跳回第 0 项而不是你刚才停留的位置。
      buttons.forEach((b, j) => b.setAttribute('tabindex', j === to ? '0' : '-1'));
      buttons[to].focus();
    });

    rot.appendChild(btn);
    buttons.push(btn);
  });

  // 把选择结果记进 pick.current，供 mouseleave / blur 回退盘心
  pick.current = selectedId;

  /* ---------- 拖拽旋转 + 惯性 + 吸附 ----------
     设计取舍：
     1. 旋转量存在 root 的 --disc-rot 上，每帧只改一次样式属性；
        6 个标签靠 calc(-1 * var(--disc-rot)) 反向抵消，文字始终正立。
     2. 用 2.2° 角度阈值（约 6px @ 盘半径 150px）区分「拖」和「点」：
        低于阈值不动手，让 click 正常派发；超过阈值立刻 setPointerCapture，
        之后吞掉紧随的 click，避免松手时顺手选中某个扇区。
     3. 松手后先按最后两帧的角度差算角速度，逐帧衰减 0.94；
        降到 0.35°/帧 以下改用 ease-out 收进最近的扇区中线（两段式）。
        一次性归位在快松手时会「啪」地跳一下。
     4. 触屏不启用：圆盘在手机上占首屏大半，禁用默认手势会让用户
        没法在圆盘上滑页——比不能转盘更糟。手机只保留点选。
     5. prefers-reduced-motion 下完全不接管，圆盘固定不动。 */
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  if (!reduceMotion && !coarse) {
    const state = {
      rot: 0, dragging: false, moved: false,
      startAngle: 0, startRot: 0, lastAngle: 0, lastT: 0, vel: 0,
      raf: 0, pointerId: null,
    };
    const apply = (deg) => {
      state.rot = deg;
      rot.style.setProperty('--disc-rot', `${deg.toFixed(2)}deg`);
      root.style.setProperty('--disc-rot', `${deg.toFixed(2)}deg`);
    };
    // 屏幕上某点相对盘心的极角（度）
    const angleOf = (ev) => {
      const r = root.getBoundingClientRect();
      const dx = ev.clientX - (r.left + r.width / 2);
      const dy = ev.clientY - (r.top + r.height / 2);
      return (Math.atan2(dy, dx) * 180) / Math.PI;
    };
    const stopRaf = () => { if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; } };

    // 惯性 → 吸附。两段式：先自由减速，慢下来再插值归位，
    // 一次性归位会在快松手时「啪」地跳一下。
    const settle = () => {
      stopRaf();
      const step = () => {
        if (Math.abs(state.vel) > 0.35) {
          state.vel *= 0.94;
          apply(state.rot + state.vel);
          state.raf = requestAnimationFrame(step);
          return;
        }
        const target = Math.round(state.rot / stepDeg) * stepDeg;
        const delta = target - state.rot;
        if (Math.abs(delta) < 0.15) {
          apply(target);
          state.raf = 0;
          return;
        }
        apply(state.rot + delta * 0.22);
        state.raf = requestAnimationFrame(step);
      };
      state.raf = requestAnimationFrame(step);
    };

    root.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      stopRaf();
      state.dragging = true;
      state.moved = false;
      state.pointerId = ev.pointerId;
      state.startAngle = angleOf(ev);
      state.startRot = state.rot;
      state.lastAngle = state.startAngle;
      state.lastT = ev.timeStamp;
      state.vel = 0;
    });

    root.addEventListener('pointermove', (ev) => {
      if (!state.dragging) return;
      const a = angleOf(ev);
      const moved = Math.abs(a - state.startAngle);
      if (!state.moved && moved < 2.2) return;   // 约 6px @ 盘半径 150px，未达阈值
      if (!state.moved) {
        state.moved = true;
        root.setPointerCapture?.(state.pointerId);
        root.classList.add('is-dragging');
      }
      // 跨过 ±180° 时补正，否则会瞬跳一整圈
      let delta = a - state.lastAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      apply(state.rot + delta);
      const dt = ev.timeStamp - state.lastT;
      if (dt > 0) state.vel = delta * (16 / Math.max(dt, 8)) * 0.55;
      state.lastAngle = a;
      state.lastT = ev.timeStamp;
    });

    const endDrag = (ev) => {
      if (!state.dragging) return;
      state.dragging = false;
      root.classList.remove('is-dragging');
      // 拖过就吞掉随之而来的 click —— 否则松手会顺手选中某个扇区
      if (state.moved) {
        const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
        root.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => root.removeEventListener('click', swallow, { capture: true }), 0);
      }
      state.pointerId = null;
      settle();
    };
    root.addEventListener('pointerup', endDrag);
    root.addEventListener('pointercancel', endDrag);
  }

  if (selectedId) {
    const idx = items.findIndex((x) => x.id === selectedId);
    if (idx >= 0) {
      groups[idx].classList.add('is-on');
      showInHub(items[idx], 'pick');
    }
  }

  return root;
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


/** 香材英文名 → 中文，供外圈标签显示典型香材。找不到就退回原文。 */
function noteZhOf(en) {
  const e = TAX && TAX.noteIndex ? TAX.noteIndex.entries.find((x) => normNote(x.en) === normNote(en)) : null;
  return e ? e.zh : String(en);
}

/* 香材剖面标本：盘心那一枚图标。
   为什么不用图片：需求明确不要"廉价 AI 图或扒来的劣质素材"。可离线、
   且保证每张质感一致的只有两条路 —— 自己画，或买一套统一授权的摄影。
   后者做不到离线，前者天然一致：同一视框、同一线宽、同一取色。

   为什么只有一枚：实测每个小类的代表香材全部落在同一个家族里
   （白花是茉莉+晚香玉，都是 floral；果味甜是桃+苹果+梨，都是 gourmand）。
   逐味画会出来一排一模一样的图标 —— 那不是示意图，是重复。
   所以一枚放大；香材名交给下面那行字去说。

   图形本体已全部来自 ./icon-specimen/svg/ 的上色版（见下方 ART_FILE），
   这里只剩视框尺寸常量。 */
const PLATE_SIZE = 24;

/* 构建标记：页面里 `document.documentElement.dataset.build` 会带上它。
   用途是"这次看到的到底是哪份代码" —— 改完 app.js 如果这个值没变，
   说明浏览器还在跑缓存的旧文件，别去猜渲染逻辑。 */
const BUILD_ID = '2026-11-08-icon-art-only';

const PLATE_LABEL = { citrus: '柑橘', floral: '花', woody: '木质', amber: '树脂', fresh: '叶', gourmand: '果实' };

/* ===== 彩色图标：盘心直接用上色 SVG（2026-11-08）=====
   线稿只是兜底。24 枚上色版在 ./icon-specimen/svg/ 合计 295.6KB / gzip 80.1KB，
   按需 fetch + 内存缓存，首屏零代价；file:// 下会被 CORS 拦，必须跑 server.js。 */
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
   ART_READY 让 scentPlate() 在【同步】阶段就能判断彩图在不在，在就直接画彩图，
   线稿一次都不进 DOM。 */
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
/* 首屏就把 24 枚全部拉进内存（合计 295.6KB / gzip 80.1KB，与香水库并行，
   不阻塞渲染）。这样用户点到任何一格时彩图都已在 ART_READY 里，没有空窗期。 */
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
/* 尽早开始预热：不等 taxonomy、不等 DOMContentLoaded。
   app.js 是 module，下载执行完就已经能发请求，与数据请求并行不冲突。 */
if (typeof window !== 'undefined') artWarmAll();

function scentPlate(sub) {
  const entries = (sub.notes || [])
    .map((en) => TAX.noteIndex.entries.find((x) => normNote(x.en) === normNote(en)))
    .filter(Boolean);
  if (!entries.length) return null;

  /* 只画一枚，画得大。图标内容全部来自 ./icon-specimen/svg/ 的上色版，
     这里不再有本地线稿：线稿是过渡期的兜底，实测会先闪一帧旧图形再被替换，
     用户看得见，所以整条线稿通路连同 SUB_MARKS / PLATE_MOTIFS / SUB_FIT 一起删了。
     彩图没到时先放一个空的同位 <svg>（占住 88px 的位，不画任何东西），
     等 fetch 落地再把内容写进去 —— 既不会跳版，也不会闪旧图。 */
  const wrap = el('div', { class: 'hub-plate' });
  const box = svgEl('svg', {
    class: 'plate-svg is-art',
    viewBox: '0 0 ' + PLATE_SIZE + ' ' + PLATE_SIZE,
    'aria-hidden': 'true', focusable: 'false',
  });
  const ready = artSvgReady(sub.id);
  if (ready) box.innerHTML = ready;
  wrap.appendChild(box);
  wrap.appendChild(el('div', { class: 'plate-rule' }));
  /* 名字最多列两味。实测四味的名字在 360px 视口是 144px 宽，
     而盘心只有 156px 且是圆的 —— 一行放不下、折两行又把「换一个大类」顶出去。
     完整清单留在 aria-label 里，视觉上两味足够说明这格是哪一路气味。 */
  const capText = entries.slice(0, 2).map((e) => e.zh).join(' · ')
    + (entries.length > 2 ? ' 等' : '');
  wrap.appendChild(el('div', { class: 'plate-cap' }, capText));
  // 图形本身是装饰，语义交给屏幕阅读器读这句话，避免读出「一张图」却没有内容
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label',
    '代表香材：' + entries.map((e) => e.zh + '（' + (PLATE_LABEL[e.family] || e.family) + '）').join('、'));

  /* 当时还没到（首次进入、预热未完成）：等它到了再写进去。
     没有线稿可保留，宁可空一小会儿，也不画一个旧的再换掉。 */
  if (!ready) {
    artInner(sub.id).then((inner) => {
      if (!inner) return;
      box.innerHTML = artNs(inner, 'a' + (++artSeq));
    });
  }

  return wrap;
}

/**
 * 盘心示意图。只在落到具体小项时调用 —— 大类层面没有"具体香材构成"可画。
 * 最多取 3 味：360px 视口下盘心可用宽度约 131px，4 味会挤成一条。
 */

/**
 * @param {{
 *   families: Array, selFamily: string|null, selSub: string|null,
 *   onChange: (fam:object|null, sub:object|null)=>void
 * }} cfg
 */
function buildWheel(cfg) {
  const { families, onChange } = cfg;
  let selFamily = cfg.selFamily || null;
  let selSub = cfg.selSub || null;
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
  /* 标签半径：桌面 193（r1i 158 与 r1o 228 的中线），窄屏 200 / 130。
     窄屏两个数来自 `_probe/glyph.cjs` 的网格（六组半径 × 三个视口），
     判据用 Range 量出来的**字形外框**而不是按钮盒 —— 按钮的 padding
     会把盒子撑得比字宽得多，按盒子判会把真重叠读成"还差 3px"：
       实测同样半径 193/135，按按钮盒量是「不相交」，
       按字形量在 390 上仍叠 18 px²、360 上叠 69 px²。
     200/130 在 390 与 360 上字形零交叠、最小间隙 +1.1px；
     192/130 在 320 上才零交叠，但 320 不在四视口验收集内，
     且把标签推到家族环外沿会越出盘外，所以不取。 */
  const LABEL_R = 193;
  const LABEL_R_NARROW = 200;
  /* 窄屏中圈标签半径 = 130（容器自身放大 1.43 之后 = 186 单位）。
     v15 曾经把它外移到 152，是为了避开"标签压在盘心半径 78.7px 内"；
     v16 起整个 .sub-ring 放大 1.43，152×1.43 = 217 单位会越出盘外
     （实测窄屏 3 处 outBox），所以收回 130 —— 放大后落在 186 单位，
     360 视口（盘 312px，k=0.65）实测：130 → 中心 121px + 半宽 31.5px = 152.5px，
     而盘半径 156px、四字标签右缘实际越界 3px；收到 120 后中心 111.5px、
     右缘 143px，留 13px 余量，同时内沿 80px 仍在盘心半径 72px 之外。 */
  const SUB_LABEL_R_NARROW = 120;

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
  /* ② 返回入口挪出盘心。
     原来盘心底部有一颗 12px 下划线的「换一个大类」，26px 高 ——
     低于 44px 触控下限，而且和「直接下一步」挤在同一列里，
     主操作与退路挨在一起，手指再准也会点错。
     改到盘外左上角：圆盘在方框里是个圆，四个角是空的，
     按钮落在那里既不压盘面，也不和底部那条主按钮抢位置。 */
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
  root.appendChild(backBtn);
  const hub = el('div', { class: 'disc-hub is-idle' },
    hubKicker, hubZh, hubDesc, hubGlyph, hubSkip, hubGo);
  root.appendChild(hub);

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
    g.appendChild(svgEl('path', { class: 'sector-shape', d: annulusPath(WHEEL.r1o, WHEEL.r1i, a0, a1) }));
    svg.appendChild(g);
    outerG.push(g);
  });

  /* 分度刻线 36 道（每 3 道加长）—— 见上方长注释。
     append 在这里而不是 SVG 初始化处：SVG 没有 z-index，绘制顺序就是层级，
     先画会被六个 sector-shape 的填充整片盖掉（场合屏原先就是这个顺序）。 */
  {
    const TICK_N = 36;
    for (let k = 0; k < TICK_N; k++) {
      const deg = -90 + (360 / TICK_N) * k;
      const major = k % 3 === 0;
      const r1 = WHEEL.r1i + 1;
      const r2 = WHEEL.r1i + (major ? 9 : 5);
      const [x1, y1] = polar(r1, deg);
      const [x2, y2] = polar(r2, deg);
      svg.appendChild(svgEl('line', {
        class: major ? 'ring-tick is-major' : 'ring-tick',
        x1, y1, x2, y2,
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
    const rMid = LABEL_R;
    const p = polar(rMid, midDeg);
    /* 同一个极角写两套坐标：桌面一套（left/top），窄屏一套（--nl / --nt）。
       窄屏盘心与大圈之间只剩约 330px（390 视口）或 310px（360），
       两行标签的中心距小于两个方框的半高之和就必然相交 —— 只收盒子不够，
       半径也得往里挪一档。半径是 JS 按视框算的（CSS 里拿不到
       "圆心到某一点的百分比"这种量），所以两套都在这里算好，
       窄屏那套交给 media query 用 var() 取。 */
    const pn = polar(LABEL_R_NARROW, midDeg);
    const px = (q, k) => ((q[k] / WHEEL.vb) * 100).toFixed(2);
    const btn = el('button', {
      class: 'disc-sector lvl1',
      type: 'button',
      role: 'radio',
      'aria-checked': 'false',
      'data-fam': f.id,
      tabindex: i === 0 ? '0' : '-1',
      style: '--l:' + px(p, 0) + '%;--t:' + px(p, 1) + '%;--nl:' + px(pn, 0) + '%;--nt:' + px(pn, 1) + '%;--i:' + i,
    },
      /* v3：扇区主词换成**生活语言**，术语降为一行 12px 注脚。
         为什么不是把术语删掉（Eddie 的疑问也在这里）：这一屏是香型入口，
         用户最终要拿到的是一个族；把「柑橘调」彻底删掉，用户就无法把
         眼前的图标与商品页上的分类对上。所以做法是**换主次**：
         主词写"刚剥开的橘子皮"（认脸），注脚写"柑橘调"（对账）。
         术语从不裸奔，但也不再是唯一入口 —— 这是规格第二节要求的做法。

         主词取 FAMILY_PLAIN 的第一段（逗号前），因为扇区只有 60px 宽，
         完整那句放不下（实测 390px 下会折成三行，把第二个标签压掉）。 */
      el('span', { class: 'zh' }, (FAMILY_PLAIN[f.id] || f.zh).split('、')[0]),
      el('span', { class: 'notes' }, f.zh),
      /* 第三行留给代表香材：它是"这一族里具体有什么"的唯一线索，
         但只有在窄屏收起时才完整可见（见 CSS 的 .disc-sector .notes）。 */
      el('span', { class: 'fam-sample' },
        (f.representativeNotes || []).slice(0, 2).map((e) => noteZhOf(e)).join('·'))
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
      selFamily = f.id; selSub = null; hoverFam = null; hoverSub = null;
      paint();
      onChange(f, null);
    });
    btn.addEventListener('keydown', (ev) => keyNav(ev, outerBtn, i));
    labelLayer.appendChild(btn);
    outerBtn.push(btn);

    // 扇形本体同样可点：只让标签可点的话，用户戳那一大块面积毫无反应
    const g = outerG[i];
    g.addEventListener('mouseenter', enter);
    g.addEventListener('mouseleave', leave);
    g.addEventListener('click', () => {
      selFamily = f.id; selSub = null; hoverFam = null; hoverSub = null;
      paint();
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
    const rMid = (SUB_R2O + SUB_R2I) / 2;
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
        style: '--i: ' + i + '; --n: ' + n,
      });
      g.appendChild(svgEl('path', {
        class: 'sub-arc',
        d: annulusPath(SUB_R2O, SUB_R2I, a0, a1),
      }));
      svg.appendChild(g);
      subGs.push(g);

      const px = polar(rMid, mid);
      /* 窄屏半径 = 124（实测网格的最佳值）。弧带中线是 135，
         窄屏把标签往里收 11 单位，是为了让它与家族标签之间留出
         两个半高的间隙 —— 详见 _wheel8.css 第七节的实测数字。 */
      const pxm = polar(SUB_LABEL_R_NARROW, mid);
      const btn = el('button', {
        class: 'disc-sector lvl2 sub-arc-btn',
        type: 'button',
        role: 'radio',
        'aria-checked': 'false',
        'data-sub': item.id,
        tabindex: i === 0 ? '0' : '-1',
        /* 只写定位变量与错峰变量，不写内联 left/top/transform：
           内联 left/top 会盖掉窄屏那套（--nl/--nt）的 media query，
           内联 transform 会盖掉 .disc-sector 基类的居中位移。 */
        style: '--l: ' + (px[0] / WHEEL.vb * 100).toFixed(2) + '%; --t: ' + (px[1] / WHEEL.vb * 100).toFixed(2)
          + '%; --nl: ' + (pxm[0] / WHEEL.vb * 100).toFixed(2) + '%; --nt: ' + (pxm[1] / WHEEL.vb * 100).toFixed(2)
          + '%; --i: ' + i + '; --n: ' + n,
      }, el('span', { class: 'zh' }, item.label || item.zh));
      /* 中圈标签用 label 而不是 zh：柑橘调的四个 zh 都是"××柑橘"，
         并排看分不出差别（用户 m05889 原话「我分不清它们的差异」）。
         label 是 4 字以内的直白词（纯柑橘/苦橙叶/橙花柑橘/皂感柑橘），
         zh 保留不动 —— 它仍是表单、推荐理由、无障碍名里用的正式名。 */

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
      btn.addEventListener('click', (ev) => { ev.stopPropagation(); chooseSub(fam, item); });
      /* 弧段本身也可点：文字只有 48px 宽，弧段比它大得多，
         只让文字接事件等于把可用面积缩到三分之一。 */
      g.addEventListener('mouseenter', enter);
      g.addEventListener('mouseleave', leave);
      g.addEventListener('click', (ev) => { ev.stopPropagation(); chooseSub(fam, item); });

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
    /* 悬停优先于已选：缩小后的盘六个扇区都能直接点（见 ③），
       不给预览就等于蒙眼换类。悬停时盘心先讲那个大类。 */
    const showFamId = hoverFam || selFamily;
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

    /* 正在悬停另一个大类（不是已选的那个）—— 这时盘心必须讲悬停的那一个 */
    const hoverOther = !!(hoverFam && hoverFam !== selFamily);
    const sub = (showFam && !hoverOther && selSub)
      ? (showFam.subfamilies || []).find((x) => x.id === selSub) : null;
    /* v15：hover 不再参与任何状态。
       用户的原话是「箱型选择应由左键点击确定，而非鼠标悬停或拖动位置决定，
       只有再次左键点击其他箱型时才切换」。所以盘心主词只认 selSub 一个值：
       指针划过某段只让那一段描边加深（.is-hot，纯视觉），
       盘心既不换词、也不挂 is-picked、更不写 selSub。
       这条同时修掉 v14 的一个隐患：hover 驱动 paint()，而 paint() 会被
       高频调用，一旦 hover 改状态，盘心文字就会跟着指针抖。 */
    const focusSub = sub;

    let kick;
    let zh;
    let desc;
    let idle = false;
    /* 压深只留给「具体小项」。第一层选中时盘心保持浅色，
       与第二层的浅色方格是同一档 —— 压深代表"定下来了"，不是"点到了"。 */
    let picked = false;
    if (!showFam) {
      kick = '香型轮盘'; zh = '还没选'; desc = '从外圈挑一个大类'; idle = true;
    } else if (hoverOther) {
      /* ③ 盘缩小后六个扇区都能点，盘心先报出"点一下会换到哪" */
      kick = '点一下换到'; zh = showFam.zh; desc = showFam.style || showFam.oneLine;
    } else if (focusSub) {
      picked = !!(sub && sub.id === focusSub.id);
      kick = picked ? '已选定' : '正在看';
      zh = focusSub.zh;
      desc = focusSub.descWheel || focusSub.short || focusSub.desc;
    } else {
      kick = hoverFam && !selFamily ? '正在看' : '已选定大类';
      zh = showFam.zh;
      desc = showFam.style || showFam.oneLine;
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

    /* ⑤ 图标常态与选中态要能区分开。
       常态（预览）画灰线稿、不写香材名；落到具体项后线稿转蓝、名字出现。
       原来只在"已选定"时才画，等于常态没有图标可比，也就无所谓区分。 */
    hubGlyph.innerHTML = '';
    hub.classList.toggle('has-glyph', !!focusSub);
    if (focusSub) { const plate = scentPlate(focusSub); if (plate) hubGlyph.appendChild(plate); }

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

/* ---------- 第 1 步：香型轮盘（外圈家族 + 中圈子家族）---------- */
function renderFamily() {
  const wrap = el('div', { class: 'fade-in' });

  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, stepHead('family').kicker),
    el('h2', { class: 'q-title' }, stepHead('family').title),
    el('p', { class: 'q-help' }, stepHead('family').help)
  ));

  wrap.appendChild(buildWheel({
    families: Object.values(TAX.families),
    selFamily: state.answers.family,
    selSub: state.answers.subfamily,
    onChange: (fam, sub) => {
      state.answers.family = fam ? fam.id : null;
      state.answers.subfamily = sub ? sub.id : null;
      /* 两条入口互斥：选了家族就清掉情绪，否则 buildProfile 会以家族为准，
         而界面上「用感觉选」还亮着，用户以为自己两条都算数。 */
      if (fam) state.answers.emotion = null;
      // 轮盘是两层，选完不该立刻跳走——用户可能还想在中圈再收一层。
      // 所以这里只更新家族说明区与底部按钮，前进由按钮控制。
      paintFamilyPanel(fam);
      // 底部按钮必须跟着重画：它的 disabled 与提示语都取决于"选了没有"。
      // 只改 state 不重画的话，用户选完家族按钮还是灰的，看着像坏了。
      refreshNav('family');
      /* v3：环境线必须在这一刻就动起来。
         漏了这一句的话，用户在第 1 屏选完香型看不到任何氛围变化，
         要等到按「下一步」才第一次变色 —— 那读起来是"换屏时闪了一下"，
         而不是"我的选择改变了环境"。实测就是这么发现的。 */
      applyAmbient();
      /* 标本签同理：它是"已选香型随身带"，选完就该出现在页头，
         不该等到下一屏。app.js 的 render() 会重建它，但那是整屏重绘；
         这里只补一根签条，不动轮盘（重绘会重播转场动画）。 */
      syncEscort();
    },
  }));

  /* --- 说不清？用感觉选 ---
     香型轮盘要求用户认识「柑橘调 / 东方琥珀调」这些词，而目标用户正是
     完全不认识它们的人。此前这条路是**死路**：answers.emotion 在
     app.js 里只有初始化和 restart 两处写入，没有任何控件能赋值，
     而 finish() 又硬性要求 answers.family —— 于是「按感觉选」这个引擎
     一直支持的入口，在界面上根本走不通（scoring.js:151 的两条入口只活了
     一条）。

     六个情绪词全部来自 TAX.emotionMap，不新造词。
     选情绪会清掉已选的家族并以情绪为准（反过来选家族会清掉情绪），
     两条入口永远只有一个生效 —— 这也是 buildProfile 的实际语义。

     v35 顺序调整：这一段原来排在主按钮**之前**。它不是主路径，却占了
     46px 控件 + 标题 + 说明共 147.6px，把「下一步」顶到 1440×900 的 955px
     处（视口只有 900）—— 用户必须先看完一个可选控件，才看得到唯一的主操作。
     现在先给主按钮，再给退路。叙事上也更顺：先走主路，走不通再换。 */
  wrap.appendChild(navBar('family'));

  /* 第 6 屏「整族排除」在家族入口下**不出现**（实测 0/30 组合改变 top-3，
     见 STEPS 里 dislikedFamilies 的 when）。但这里必须告诉用户它去哪了 ——
     否则从情绪入口来的用户会发现自己少了一屏，以为出了 bug；
     而家族入口的用户则完全不知道"整族划掉"这个能力存在。
     说清两件事：① 你选的大类已经天然排除了别的族；② 真想排除就去点香调。 */
  if (state.answers.family) {
    wrap.appendChild(el('div', { class: 'term-note' },
      el('strong', {}, '选了香型就等于排除了别的族：'),
      ' 候选只从你选的这一族里出，所以没有"排除整族"那一题。',
      ' 想再收窄，下一屏可以点名具体受不了的香调（比如"不要香草"）。'
    ));
  }

  wrap.appendChild(el('div', { class: 'chips-label', style: 'margin-top:24px' },
    '不想按大类选？也可以按感觉挑一个（二选一，和上面互斥）'));
  const EMO_OPTS = (TAX.emotionMap || []).map((e) => ({ id: e.id, zh: e.zh, desc: e.desc }));
  wrap.appendChild(segControl(
    EMO_OPTS,
    state.answers.emotion,
    (id) => {
      state.answers.emotion = id;
      /* 整屏重画：轮盘要用 selFamily=null 重建，否则盘心还停在刚选的那族，
         界面说「选了花香」、引擎却按情绪算。这一屏没有长列表，重绘不丢位置。 */
      state.answers.family = null;
      state.answers.subfamily = null;
      render();
    },
    '说不清香型时按感觉选'
  ));
  wrap.appendChild(segHint(EMO_OPTS, state.answers.emotion));

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

/* ---------- 第 7 步：季节 ----------
   数据里 seasons 覆盖 4 季：春 382 / 夏 254 / 秋 389 / 冬 146。
   冬季只有 146 瓶 —— 这一点必须在界面上说明，否则用户选「冬」之后
   候选池只剩三分之一，会以为推荐坏了。 */
const SEASONS = [
  { id: 'spring', zh: '春', desc: '花开、微湿。轻盈花香与绿感最合适' },
  { id: 'summer', zh: '夏', desc: '热、出汗多。要清透，浓香会闷' },
  { id: 'autumn', zh: '秋', desc: '干爽。木质与微甜都能上场' },
  { id: 'winter', zh: '冬', desc: '冷。需要能压住冷风的厚度' },
];

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

/* ---------- v3：整族排除这一屏已删（2026-11-16）----------
   原 renderDislikedFamilies 位于此处，随 STEPS 里的 dislikedFamilies 一起移除。
   删除理由见 STEPS 顶部注释 ① 条：实测它是全问卷最接近无效的一项，
   而且删掉之后步骤表不再有 when() 动态分叉，「共 N 步」只有一套数字。

   保留这条注释而不是整段删干净，是为了让下一个读代码的人知道
   "这里原来有一屏，不是漏写了" —— 以及它为什么不该回来。
   若将来要恢复：引擎侧 answers.dislikedFamilies 与 scoring 的
   dislikedFamily(-30) 权重都还在，恢复只需加回一屏渲染 + STEPS 一项。
*/

/* ---------- 第 11 步：气味温度 ----------
   这一屏问的不是天气，是气味本身的体感。
   数据侧的推导方式（实测分布，见 D47）：
     暖 = character 里含 warm/amber/resinous/spicy/smoky/leathery/sweet/creamy 任一
     凉 = 含 fresh/clean/green/citrusy/herbal/salty 任一
   400 瓶里 偏暖 145 / 偏凉 90 / 中性 165，三档够分。
   注意"中性"占 165 是最大的一档——这不是缺点，很多经典香水本来就是中间调。
   所以这一屏允许不选（跳过），不像气质那样逼用户表态。 */
const TEMPERATURES = [
  { id: 'warm', zh: '偏暖', desc: '琥珀、香草、树脂、皮革。像靠近皮肤的体温' },
  { id: 'cool', zh: '偏凉', desc: '绿叶、柑橘、草本、海水。像风吹过皮肤' },
  { id: 'neutral', zh: '中性 / 都行', desc: '不刻意偏任何一边。库里 165 瓶属于这一档' },
];

/* ---------- 第 12 步：甜度 ----------
   甜度不是独立字段，是从 character + gourmand 家族占比推出来的（见 D47）：
     sweet×1.0 + creamy×0.7 + fruity×0.5 + powdery×0.3 + gourmand占比×1.2
   实测分布：不甜(≤0.3) 183 / 微甜(0.3–1.0) 96 / 中甜(1.0–1.8) 70 / 很甜(>1.8) 51。
   四档都有货，所以四档全开 —— 少一档就会有一批用户找不到自己的位置。 */
const SWEETNESS = [
  { id: '0', zh: '完全不甜', desc: '干、苦、清爽。像茶、苔藓、雨后石头' },
  { id: '1', zh: '微甜', desc: '有一点点圆润，但说不上甜。多数木质与花香在这里' },
  { id: '2', zh: '中等甜', desc: '明确能闻出甜味，但不腻。果香与部分香草' },
  { id: '3', zh: '很甜', desc: '焦糖、香草、棉花糖。讨喜，但一两喷就够' },
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
   第 3 / 4 屏：想要的味道 · 受不了的味道（v3 生活情景）
   ------------------------------------------------------------
   这两屏是 v3 改动最大的一处。旧版是 58 个香调名的 chip 墙（`renderNotePicker`），
   对零基础的人等于一道术语测验，而且恰好出现在用户刚进状态的位置。

   新版每一格写成**一件闻过的东西**（"刚剥开的橘子皮" / "庙里的焚香"），
   背后挂到仓库既有的香调 en 上（src/scenes.js）。用户点的是生活经验，
   引擎收到的仍是 likedNotes / dislikedNotes —— 打分侧零改动。

   为什么仍保留"两屏分开"而不是合并：
   ① 排除比偏好更能收窄（实测：讨厌的香调只做剔除、乱序 0.011）；
   ② 两屏的候选来源本来就该不同（不喜欢屏不该是喜欢屏的翻版）；
   ③ 一屏一问是既有契约，合并会把两个决定塞回一屏。

   每屏的**专属环境效果**：
     想要屏 = 标本抽屉（每格是一枚抽屉把手，选中后抽屉拉开一线、
              里面那味香材的小图标亮起来）
     不想要屏 = 退潮（选中后那一格向后退、颜色褪掉，像被从台面上拿走）
   两者方向相反：一个"拉近"，一个"推开"，视觉上说明这一屏在做哪种决定。
   ------------------------------------------------------------ */

/** 把一组情景 id 同步进引擎读的两个字段（en 数组 + 中文名映射）。 */
function syncNotesFromScenes(which) {
  const liked = which === 'liked';
  const ids = liked ? (state.answers.likedScenes || []) : (state.answers.avoidScenes || []);
  const notes = notesOfScenes(ids);
  const zh = zhOfScenes(ids);
  if (liked) {
    state.answers.likedNotes = notes;
    state.answers.likedZh = zh;
    /* 同一香调不能既喜欢又讨厌（D41）。两屏分开后这条约束仍要守：
       用户在"想要"里点了含香草的一格，就要把它从"不想要"那一屏的对应格里
       清掉。清的方式是**回退到香调级**：只要该格还有别的香调没被排除，
       就留下；全被排掉了才把整格从 avoidScenes 里删。
       这样用户看到的是"我把香草要过来了"，而不是"我刚才点的那格凭空消失"。 */
    const bad = new Set(notes);
    state.answers.avoidScenes = (state.answers.avoidScenes || []).filter((id) => {
      const s = sceneById(id);
      if (!s) return false;
      return s.notes.some((n) => !bad.has(n));
    });
    const stillAvoid = new Set(notesOfScenes(state.answers.avoidScenes));
    state.answers.dislikedNotes = [...stillAvoid];
    state.answers.dislikedZh = zhOfScenes(state.answers.avoidScenes);
  } else {
    state.answers.dislikedNotes = notes;
    state.answers.dislikedZh = zh;
    const bad = new Set(notes);
    state.answers.likedScenes = (state.answers.likedScenes || []).filter((id) => {
      const s = sceneById(id);
      if (!s) return false;
      return s.notes.some((n) => !bad.has(n));
    });
    const stillWant = new Set(notesOfScenes(state.answers.likedScenes));
    state.answers.likedNotes = [...stillWant];
    state.answers.likedZh = zhOfScenes(state.answers.likedScenes);
  }
}

/* 每一格的图标：复用该格第一味香调所属小类的上色 SVG。
   为什么不用 emoji 或新画图形：规格要求「图标优先复用/扩展现有香型小图标系统」，
   而那 24 枚已经过 36px 可辨形验收。这里只按 look-up 取，不新增图形。 */
function sceneIconId(scene) {
  if (!scene || !scene.notes.length || !TAX) return null;
  const first = scene.notes[0];
  const e = TAX.noteIndex.entries.find((x) => normNote(x.en) === normNote(first));
  return e && ART_FILE[e.subfamily] ? e.subfamily : null;
}

function sceneArtNode(scene, cls) {
  const subId = sceneIconId(scene);
  const box = svgEl('svg', {
    class: cls,
    viewBox: '0 0 ' + PLATE_SIZE + ' ' + PLATE_SIZE,
    'aria-hidden': 'true',
    focusable: 'false',
  });
  if (subId) {
    const ready = artSvgReady(subId);
    if (ready) box.innerHTML = ready;
    else {
      artInner(subId).then((inner) => {
        if (!inner) return;
        box.innerHTML = artNs(inner, 'a' + (++artSeq));
      });
    }
  }
  return box;
}

/* 两屏共用一个渲染器。差别只有：key / 标题 / 语气 / 候选表 / 选中语义。
   不写两个几乎相同的函数，否则下次改格子行为要改两遍、且必然漏一处
   （旧版 renderNotePicker 也是这样合并的，理由不变）。 */
function renderScenePicker(kind) {
  const neg = kind === 'avoid';
  const stepId = neg ? 'avoid' : 'wanted';
  const listKey = neg ? 'avoidScenes' : 'likedScenes';
  const scenes = neg ? AVOID_SCENES : LIKED_SCENES;

  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead(stepId);

  /* 屏头：与其余屏同构，但这一屏多一行**译文行**——
     规格要求「每屏选项区常驻一句生活化译文行（学圆盘圆心），选项换、译文换」。
     译文行放在标题下、格子之上：用户先知道"这一屏在问什么感觉"，
     再挑具体的东西。 */
  const lead = el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  );
  const trans = el('p', { class: 'scene-trans' });
  lead.appendChild(trans);
  wrap.appendChild(lead);

  /* 译文行三态：未选 → 这一屏在问什么；选中一格 → 那一格的大白话；
     选中多格 → 它们合成的一句话。写得短，一屏只占一行。 */
  const paintTrans = () => {
    const ids = state.answers[listKey] || [];
    trans.classList.toggle('is-idle', ids.length === 0);
    if (!ids.length) {
      trans.textContent = neg
        ? '挑你躲得开的：选中的味道会从结果里被扣分，选得越准越省事'
        : '挑一两样就够。选得越多，候选越窄——但也会更像你要的那一瓶';
      return;
    }
    const names = ids.map((id) => (sceneById(id) || {}).zh).filter(Boolean);
    if (names.length === 1) {
      const s = sceneById(ids[0]);
      trans.textContent = neg
        ? `${s.zh}：${s.plain} —— 这一类会从结果里被扣掉`
        : `${s.zh}：${s.plain}`;
      return;
    }
    trans.textContent = neg
      ? `已避开 ${names.length} 类：${names.join('、')}`
      : `已选 ${names.length} 类：${names.join('、')}`;
  };
  paintTrans();

  /* 计数徽标与译文行同一行右侧：与旧版 .note-count 同一套语义（已选 N），
     但这一屏的格子总数只有 10–14 个，不需要"展开全部"折叠。 */
  const grid = el('div', {
    class: 'scene-grid' + (neg ? ' is-neg' : ''),
    role: 'group',
    'aria-multiselectable': 'true',
    'aria-label': neg ? '不想靠近的味道' : '想要的味道',
  });

  const nodes = [];
  scenes.forEach((s, i) => {
    const on = (state.answers[listKey] || []).includes(s.id);
    const cell = el('button', {
      class: 'scene' + (neg ? ' scene-neg' : '') + (on ? ' is-on' : ''),
      type: 'button',
      'data-scene': s.id,
      'aria-pressed': String(on),
      style: '--i: ' + i,
      onclick: () => {
        const arr = state.answers[listKey] || (state.answers[listKey] = []);
        const idx = arr.indexOf(s.id);
        if (idx >= 0) arr.splice(idx, 1); else arr.push(s.id);
        const now = arr.includes(s.id);
        cell.classList.toggle('is-on', now);
        cell.setAttribute('aria-pressed', String(now));
        syncNotesFromScenes(neg ? 'avoid' : 'liked');
        /* 「想要」与「不想要」互斥时会改写另一屏的数组（见 syncNotesFromScenes），
           所以这里必须把**本屏**的选中态按最新数组重刷 —— 否则用户会看到
           另一屏的操作悄悄把自己刚点的格子摘掉高亮。 */
        nodes.forEach((n) => {
          const mine = (state.answers[listKey] || []).includes(n.getAttribute('data-scene'));
          n.classList.toggle('is-on', mine);
          n.setAttribute('aria-pressed', String(mine));
        });
        paintTrans();
        /* 环境线要跟着变（选了清新则整体渐凉）—— 只重算变量，不重绘整屏。 */
        applyAmbient();
      },
    },
      /* 图形（这一格那味香材的小图标）+ 生活主词 + 一句大白话。
         图形在左、文字在右：图标是"认脸"的入口，文字是确认。 */
      sceneArtNode(s, 'scene-art'),
      el('span', { class: 'scene-body' },
        el('span', { class: 'scene-zh' }, s.zh),
        el('span', { class: 'scene-plain' }, s.plain)
      ),
      /* 选中标记：一个"拉开"的短线，克制到只有一个记号（规格：不为炫技而炫技） */
      el('span', { class: 'scene-mark', 'aria-hidden': 'true' })
    );
    nodes.push(cell);
    grid.appendChild(cell);
  });
  wrap.appendChild(grid);

  /* 说明随屏变化。两句都不是装饰 —— 实测里"跳过"与"必须答"两种误解都出现过。 */
  {
    const all = curSteps();
    const idx = all.findIndex((st) => st.id === stepId);
    const rest = idx >= 0 ? all.length - idx - 1 : 0;
    wrap.appendChild(el('div', { class: 'term-note' },
      el('strong', {}, neg ? '一个都不选也成立：' : '想不起来也没关系：'),
      neg
        ? ' 说不上来就先跳过。这一屏的候选只是"常见的不受欢迎味道"，你的雷点可能不在里面 —— 后面还有别的维度可以把范围收窄。'
        : ` 跳过这一屏，后面还有 ${rest} 屏在问别的维度。但只要能想起一样明确的，命中率会明显提高。`
    ));
  }

  wrap.appendChild(navBar(stepId));
  return wrap;
}

function renderWanted() { return renderScenePicker('wanted'); }
function renderAvoid() { return renderScenePicker('avoid'); }

/* ============================================================
   第 2 屏：预算（v3 新增，前置）
   ------------------------------------------------------------
   内容隐喻：**先划出货架的边界**。
   它不是"你有多少钱"（那是审讯），而是"我们从哪一段货架开始挑"（那是范围）。

   交互形式：一条四段式**价签行**。四段宽度按各自真实瓶数比例分配
   （BUDGET_BANDS 的 shelf 字段不参与计算，只做视觉近似）——
   几何本身就是信息：宽的段能选的瓶多，窄的段能选的少。
   这直接学圆盘的做法（控件形状 = 内容结构）。

   专属环境效果：选中一段时，那条尺带上**其余三段退成虚线**、
   选中段实心并向右延伸出一道极短的"取货"线。
   同时尺带下方那行读数换成**这一档的真实瓶数**（不是百分比）。

   为什么这一屏不显示"匹配度会不会变"这种技术话：
   用户只关心两件事 —— 这一段里有没有货、会不会把好瓶子筛掉。
   所以读数写瓶数与一句"这一段能买到什么"。
   ------------------------------------------------------------ */
function renderBudget() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('budget');
  const lead = el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  );
  /* 常驻译文行：与其余屏同一套（学圆盘圆心）。 */
  const trans = el('p', { class: 'scene-trans' });
  const paintTrans = () => {
    const band = bandById(state.answers.budget);
    trans.classList.toggle('is-idle', !band);
    trans.textContent = band
      ? `${band.zh}：${band.desc}`
      : '不选就是「不限」—— 全库 1388 瓶里凡是有挂牌价的都进候选';
  };
  paintTrans();
  lead.appendChild(trans);
  wrap.appendChild(lead);

  const all = DATA?.perfumes || [];
  const prices = PRICES || {};
  const counted = (band) => {
    if (!all.length) return null;
    let n = 0;
    for (const p of all) {
      const v = prices[p.id];
      if (!band) { n += 1; continue; }
      const bid = bandOfPrice(v);
      if (bid == null) continue;
      if (bid === band.id) n += 1;
    }
    return n;
  };

  /* 尺带：四段 + 一段「不限」。不限放在最前，因为它是默认值，
     放在末尾会让"不选"变成一个需要特意找到的隐藏选项。 */
  const track = el('div', { class: 'shelf', role: 'radiogroup', 'aria-label': '预算档位' });
  const opts = [{ id: 'any', zh: '不限', desc: '不按价格筛', shelf: 0 }, ...BUDGET_BANDS];
  const cells = [];
  const readout = el('p', { class: 'shelf-read', 'aria-live': 'polite' });

  const paintRead = () => {
    if (!all.length) {
      readout.textContent = '香水库还在读取，稍等一下这里会显示每一档的真实瓶数';
      return;
    }
    const cur = state.answers.budget;
    const band = bandById(cur);
    const n = counted(band);
    const total = all.length;
    if (!band) {
      readout.textContent = `不限：${total} 瓶全在候选里（其中 ${Object.keys(prices).length} 瓶有挂牌价）`;
      return;
    }
    /* 这一档的真实瓶数 + 一句"哪些瓶被挡在外面"。
       必须说清"没有挂牌价的瓶不参与筛选"，否则用户会以为系统漏了几百瓶。
       这句话的口径放在 ambient.js 的 bandExclusionNote —— 与结果页的
       范围声明同源，改一处两边都变（不在这里再抄一份）。 */
    const excl = bandExclusionNote(Object.keys(prices).length, total);
    readout.textContent = `${band.zh}：这一段里有 ${n} 瓶`
      + (excl ? `（${excl}）` : '');
  };

  const paintSel = () => {
    const cur = state.answers.budget;
    cells.forEach((c) => {
      const id = c.getAttribute('data-band');
      const mine = id === 'any' ? !cur : cur === id;
      c.classList.toggle('is-on', mine);
      c.setAttribute('aria-checked', String(mine));
      c.setAttribute('aria-pressed', String(mine));
    });
    paintRead();
  };

  opts.forEach((b) => {
    const isAny = b.id === 'any';
    const node = el('button', {
      class: 'shelf-seg' + (isAny ? ' is-any' : ''),
      type: 'button',
      role: 'radio',
      'aria-checked': 'false',
      'data-band': b.id,
      /* 宽度按真实瓶数比例给（不限段固定占一档宽的 1.2 倍：它是兜底选项，
         不该按"1388 瓶"撑成整条带，那会让四档挤成细缝）。 */
      style: isAny ? '--w: 1.2' : `--w: ${Math.max(0.55, b.shelf * 6).toFixed(2)}`,
      onclick: () => {
        state.answers.budget = isAny ? null : b.id;
        paintSel();
        paintTrans();
        applyAmbient();
      },
    },
      el('span', { class: 'shelf-zh' }, b.zh),
      el('span', { class: 'shelf-plain' }, isAny ? '不筛价格' : (BUDGET_PLAIN[b.id] || ''))
    );
    cells.push(node);
    track.appendChild(node);
  });
  paintSel();
  wrap.appendChild(track);
  wrap.appendChild(readout);

  /* 数据口径披露。这一段不是免责声明，它是**这支产品的诚实性**：
     价格是快照、不是实时、不是最低价。写清楚才不会让用户拿它当比价工具。 */
  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '价位是从哪来的：'),
    ' 取自淘宝/京东商品页的挂牌价快照（2026-11-09），不是实时比价，也不是最低价。',
    ' 同一瓶在不同容量、促销期、套装里差别可以很大 —— 这一屏只做粗档，不做比价。',
    ' 拿不准就选「不限」，价格不会影响匹配怎么算。'
  ));

  wrap.appendChild(navBar('budget'));
  return wrap;
}

/* ============================================================
   第 4 屏：气质（原第 3 步）
   ------------------------------------------------------------
   七个原型是"气味给人的感觉"，不是香调名。
   ============================================================ */
function renderMood() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('mood');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  /* v42：这段说明原写「家族只说明大方向…这一屏问的是它给人的感觉。
     同一瓶花香，可以清冷也可以甜腻 —— 这就是补上那一层。」
     现在 help 已经说了"讲的是感觉不是味道"，再补一段等于同一句话说两遍。
     这里改成真正有信息的那句：这些原型**不是**香调名，别拿它当第二个轮盘。

     V2 改法 E：整段不是删除，是**折叠**成 <details>。
     理由（改动清单原文）：省掉它会**丢掉一段真实内容** ——
     「这七个不是香调」是 v42 专门加的澄清。但它在 390×844 上实测占 68px
     （加上 D 改法给的上下线后 82px），把第一张卡从 603 推到 617，
     而工具栏在 767 —— 7 张卡只有 2 张在工具栏之上。
     折叠后标题行只占一行小字，正文按需展开：内容还在，高度还回去。
     用原生 <details> 而不是 JS 展开：零状态、零事件、键盘默认可用，
     且打印时 <details> 默认是展开的（内容不会在纸上消失）。

     【收尾腿补齐】放置位置：**卡组之后**，不放卡组上方。
     上一轮把它折叠了但仍留在标题与卡组之间，只省下 24px（68→44），
     第一张卡 603→555，7 张里 3 张在工具栏之上，没到清单的 ≥4。
     改动清单对折叠位置写的是「放进 `.q-help` 的 <details>
     或改成卡组下方一行小字（**不放卡组上方**）」—— 后一种此前没落。
     挪到卡组之后，整块 45px（含上下线）从首屏移出，加上标签/建议合并，
     实测第一张卡 555→480，4 张完整落在工具栏之上（数字见回执）。
     内容一条没删：只是从「选之前先读一段方法论」变成「选的时候有疑问再展开」。 */
  const termNote = el('details', { class: 'term-note term-note-fold' },
    el('summary', { class: 'term-note-sum' }, '这七个不是香调'),
    el('div', { class: 'term-note-body' },
      '「雨后林地」「焦糖琥珀」是气味给人的感觉，不挂在任何单一香调上。',
      ' 同一瓶花香可以清冷，也可以甜腻。'
    )
  );

  /* ① 气质：七个原型，按"与你已答的偏好有多近"排序。

     这一屏的顺序不是固定的 —— 前面答过冷暖/甜度/初始偏好之后，
     最贴的那项会排到第一并预选。用户打开这一屏看到的是
     「我们把前面几条对了一下账，最接近的是这个」，而不是第八个并列问题。

     预选放在 state 里而不是只改 UI：characterTags 要跟着填，
     否则用户不动这一屏、直接下一步时，引擎收不到任何气质信息。 */
  const ranked = rankCharacterPresets(state.answers);
  const best = ranked[0];
  const hasEnoughSignal = (state.answers.temperature != null)
    || (state.answers.sweetness != null)
    || !!state.answers.family;
  /* 只在用户真的答过至少一项时才预选。首屏直跳过来（什么都没有）时
     不预选 —— 否则等于替他做了一个他没做的决定。 */
  if (hasEnoughSignal && !state.answers.characterPreset) {
    state.answers.characterPreset = best.id;
    state.answers.characterTags = Object.keys(best.tags || {});
    state.answers.characterNeg = best.neg || [];
  }
  /* 提示语要说的是"系统推荐哪一项"，而用户随时可能换选。
     第一版把它写死成 best.zh（排序首项），点选别的之后文字不变 ——
     实测：选「雨后林地」后提示仍是「最接近的是雨后林地」，
     用户换成「皮革烟草」时这句话就成了错的。
     改成跟随 state.answers.characterPreset：用户自己选的，
     就不再显示"最接近的是 X"（那句话此时已无意义），
     只保留"这是按你前面回答推出来的"这层信息。 */
  const suggestNote = hasEnoughSignal ? el('p', { class: 'chips-note' }) : null;
  const paintSuggest = () => {
    if (!suggestNote) return;
    const cur = state.answers.characterPreset;
    const curItem = CHARACTER_PRESET.find((c) => c.id === cur);
    if (!curItem) { suggestNote.textContent = ''; return; }
    if (cur === best.id) {
      suggestNote.textContent = '按你前面回答的冷暖与甜度，最接近的是「' + best.zh + '」——不对就换一个';
      suggestNote.classList.remove('is-chosen');
    } else {
      /* 用户已改选：说清"这一项是你自己挑的"，不再冒充系统推荐 */
      suggestNote.textContent = '你选的是「' + curItem.zh + '」（系统原本推荐「' + best.zh + '」）';
      suggestNote.classList.add('is-chosen');
    }
  };
  paintSuggest();

  /* V2 改法 E：标签与建议合成一行。
     ------------------------------------------------------------
     改前是两个块：`.chips-label`（「整体气质（选一个）」，12px + 1.2px 字距，
     独占一行 16px）在**先**，`.chips-note`（个性化建议，12px、1–2 行）在**后**。
     两件事都是「这一组在问什么」和「系统猜了哪个」，却各占一行，
     390 档实测合计 52px，还把卡片从 603 往下推。

     改后：两者放进同一个 `.chips-head` 横排容器 —— 标签保留
     （它是这一组的名字，不能删），建议行紧跟在同一行的右侧，
     整个头部从 52px 收到 36px（建议仍折两行，但不再叠在标签下面）。
     同时它站到卡组之前、标题之下：清单第 3 条要的「移到标题下方」，
     指的是建议行不该夹在卡片与标签之间当一条独立文案。

     【收尾腿补齐】上一轮只把两块的 margin 收窄（省 4px），没有真正并排，
     实测 chips-label 15.59 + chips-note 36 = 51.6px 仍在。这次改成横排。 */
  wrap.appendChild(el('div', { class: 'chips-head' },
    el('div', { class: 'chips-label' }, '整体气质（选一个）'),
    suggestNote
  ));

  /* ---- v3 专属环境效果：七格光谱 ----
     内容隐喻：七个原型不是七个并列的词，是三维空间里的一组点
     （见 CHARACTER_PRESET 的注释）。这条光谱把它们按
       · 冷暖 → 色温（暖格偏琥珀、冷格偏蓝）
       · 轻重 → 格子的高度感（用底色的深浅表达）
     摆在一条带上，让"结构"这件事**看得见**。

     它同时也是这一屏的进度指示：选中的格填实。这一点与其它屏的区别是
     ——它不新开一个物件，而是把已有的七项重新表述成一条连续的轴。
     （规格要求每屏形式各不相同：场合是弧、季节是带、浓淡是场、
      气质是光谱 —— 四个都不是同一套几何。） */
  const spectrum = el('div', { class: 'mood-spectrum', 'aria-hidden': 'true' });
  const specCells = [];
  ranked.forEach((c) => {
    const warm = c.dims && c.dims.temp > 0;
    const cell = el('span', {
      class: 'mood-chip' + (warm ? ' is-warm' : ' is-cool')
        + (state.answers.characterPreset === c.id ? ' is-on' : ''),
    });
    specCells.push({ node: cell, id: c.id });
    spectrum.appendChild(cell);
  });
  wrap.appendChild(spectrum);

  wrap.appendChild(choiceGrid(
    ranked.map((c) => ({ id: c.id, zh: c.zh, desc: c.desc })),
    state.answers.characterPreset,
    (id) => {
      state.answers.characterPreset = id;
      const picked = CHARACTER_PRESET.find((c) => c.id === id) || {};
      /* tags 是对象（标签 → 权重），旧版是数组。这里取键名给评分侧：
         src/scoring.js 的 characterTags 按"是否命中"判断，不看权重。 */
      state.answers.characterTags = Object.keys(picked.tags || {});
      state.answers.characterNeg = picked.neg || [];
      /* v37：冷暖与甜度由原型反推，不再单独问（见 deriveFromPreset 的注释）。
         写回 state.answers 是有意的：scoring 那条路径一行都不用改，
         temperature / sweetness 依旧是从 answers 里读两个字段。 */
      const d = deriveFromPreset(id);
      if (d) {
        state.answers.temperature = d.temperature;
        state.answers.sweetness = d.sweetness;
      }
      paintSuggest();
      /* v3：光谱跟着选中态走。只改 class，不重绘整屏。 */
      specCells.forEach((s) => s.node.classList.toggle('is-on', s.id === id));
      /* 环境线：气质原型的 dims 也参与推进（见 ambient.js 的 MOOD_SCALE）。 */
      applyAmbient();
    }
  ));

  /* 【收尾腿补齐】折叠块站到卡组之后（见上方长注释：
     清单要求「不放卡组上方」）。选完卡往下就是「这七个不是香调」的澄清，
     读序变成「名字与建议 → 七张卡 → 澄清 → 怎么挑」，比原来「先读方法论再选」顺。 */
  wrap.appendChild(termNote);

  /* ② 气味冷暖 与 ③ 甜度 已在 v37 合并进 ①（2026-11-09）。
     七个原型的 dims 是 temp × sweet × weight 的 2×2×2 缺一格，
     选了原型就等于答了冷暖与甜度。原来三问并存时，
     ②③ 可以推翻 ①（实测同原型下一致作答 +20~22 分、矛盾作答 +10 分），
     而界面上只显示「你选的是 X」，用户看不出自己在自相矛盾。

     删掉的还有一个副作用：这一屏原本 ①占 7 张卡 + ②③ 各一排 + 两段 term-note，
     在 390×844 下把「下一步」推到折叠线以下（visual 实测 +21.2px）。
     现在只剩一组卡片 + 一段说明。

     下面这段"怎么判断冷暖"的说明保留 —— 它现在服务于**选原型**这件事：
     用户看不懂「洁净清透 / 雨后林地」时，靠"热牛奶 vs 橘子皮"这类比喻来挑。 */
  /* v42：这段说明原来写「喜欢"像洗完澡"的挑左边那几项，喜欢"像毛衣和木头"的挑右边」——
     **位置是假的**。这一屏的卡片顺序由 rankCharacterPresets() 按已答偏好动态排，
     实测六种典型答案下首项分别是：洁净清透 / 雨后林地 / 洁净清透 / 蜜感白花 /
     洁净清透 / 皮革烟草 —— "左边那几项"每次都指向不同的东西。
     改成点名具体原型，位置无关。 */
  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '挑不准？'),
    ' 想两个你闻过的东西：一杯热牛奶（暖、甜、重）、刚剥开的橘子皮（凉、不甜、轻）。',
    ' 喜欢"像洗完澡"的看「洁净清透」，喜欢"像毛衣和木头"的看「皮革烟草」或「焦糖琥珀」。'
  ));

  wrap.appendChild(navBar('mood'));
  return wrap;
}

/* ============================================================
   合并屏 3：场景（第 4 步）
   ------------------------------------------------------------
   场合 + 季节，两问都在说"什么时候用"。
   季节的"冬季只有 146/400"那句数据说明保留 —— 它是用户会困惑的地方。
   ============================================================ */
/* ============================================================
   第 5 屏：场合（原「场景」屏拆出的前半）
   ------------------------------------------------------------
   原来场合圆盘与季节分段控件同屏。实测 1440×900 时季节那一问的标签落在
   top=849、视口 900 —— 第二问被圆盘挤到折叠线以下，用户滚下去才知道还有一题。
   拆成两屏之后，圆盘独占一屏，不再挤任何东西。
   ============================================================ */
/* ============================================================
   第 6 屏：场合（v3 专属环境效果 = 一天的时间弧）
   ------------------------------------------------------------
   内容隐喻：场合在数据里是「被闻到多远 + 撑多久」的组合，
   而在人的经验里它首先是**一天里的某个时候**。
   所以这一屏的主控件从圆盘改成一条时间弧：
     清晨 → 白天 → 傍晚 → 夜 → 深夜
   五个场合各占弧上一个落点，移动的是"太阳"，不是高亮框。

   为什么不再用圆盘：圆盘在 v3 已经被香型屏独占（那是它的语义主场：
   分类树）。同一支问卷里两个圆盘会让"物体的身份"混淆 ——
   用户第二次看到圆盘会以为又回到香型。规格要求每屏形式各不相同。

   弧的几何是**真实**的：落点位置来自 OCCASION_ARC，那个顺序与
   src/scoring.js 的 OCCASION_TIME（时段）同一套判断。
   所以它不是装饰弧，是"把时段画出来"。
   ============================================================ */

/* 五个场合在一天里的落点（0 = 清晨，1 = 深夜）。
   顺序与 OCCASION_TIME 的 day/evening 分档一致，但更细：
   户外在清晨（最凉）、通勤在白天、居家在傍晚、约会在夜、正式在深夜。 */
const OCCASION_ARC = [
  { id: 'outdoor', pos: 0.06, when: '清晨' },
  { id: 'commute', pos: 0.30, when: '白天' },
  { id: 'daily',   pos: 0.52, when: '傍晚' },
  { id: 'date',    pos: 0.76, when: '夜里' },
  { id: 'formal',  pos: 0.96, when: '深夜' },
];

function renderOccasion() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('occasion');
  const lead = el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  );
  /* 常驻译文行（学圆盘圆心）：未选说这一屏在问什么，选中说那个场合的时段含义。 */
  const trans = el('p', { class: 'scene-trans' });
  const paintTrans = () => {
    const hit = OCCASION_ARC.find((x) => x.id === state.answers.occasion);
    const item = hit ? (TAX.occasionMap || []).find((o) => o.id === hit.id) : null;
    trans.classList.toggle('is-idle', !hit);
    trans.textContent = hit && item
      ? `${hit.when}用它 —— ${item.desc}`
      : '挑一个最像的。同一瓶香水在通勤和约会里的宽容度差得很远';
  };
  paintTrans();
  lead.appendChild(trans);
  wrap.appendChild(lead);

  /* ---- 时间弧本体 ----
     弧线用 CSS 画（.day-arc 的两层径向渐变交界），
     这里只放"太阳"与五个刻度。刻度是真实按钮（44px 命中区由 CSS 的
     ::before 垫出来），不是 SVG 里的死点。 */
  const arc = el('div', { class: 'day-arc', role: 'radiogroup', 'aria-label': '一天里的使用时段' });
  const sun = el('span', { class: 'arc-sun', 'aria-hidden': 'true' });
  const ticks = [];
  OCCASION_ARC.forEach((x) => {
    const on = state.answers.occasion === x.id;
    const item = (TAX.occasionMap || []).find((o) => o.id === x.id) || { zh: x.id, desc: '' };
    const b = el('button', {
      class: 'arc-tick' + (on ? ' is-on' : ''),
      type: 'button',
      role: 'radio',
      'aria-checked': String(on),
      'aria-label': `${x.when} · ${item.zh}`,
      'data-occasion': x.id,
      style: `--pos: ${x.pos}`,
      onclick: () => {
        state.answers.occasion = x.id;
        paintArc();
        paintTrans();
        applyAmbient();
      },
    });
    ticks.push({ node: b, pos: x.pos, id: x.id });
    arc.appendChild(b);
  });
  arc.appendChild(sun);
  wrap.appendChild(arc);

  const paintArc = () => {
    const cur = state.answers.occasion;
    const hit = OCCASION_ARC.find((x) => x.id === cur);
    ticks.forEach((t) => {
      const on = t.id === cur;
      t.node.classList.toggle('is-on', on);
      t.node.setAttribute('aria-checked', String(on));
    });
    /* 太阳只在真的选过之后出现（未选时不摆一个"默认时段"——
       那读起来像已经替用户答了）。 */
    sun.style.display = hit ? 'block' : 'none';
    if (hit) {
      sun.style.setProperty('--pos', hit.pos);
      sun.style.left = `calc(6% + ${hit.pos} * 88%)`;
    }
  };
  paintArc();

  /* 五个场合的中文名与一句解释：弧上的刻度只有位置，
     名字必须另有落处 —— 否则用户点的是五个无名点。
     用分组列表而不是卡片网格：它们在这条弧上是有序的。 */
  const list = el('div', { class: 'arc-legend' });
  OCCASION_ARC.forEach((x) => {
    const item = (TAX.occasionMap || []).find((o) => o.id === x.id);
    if (!item) return;
    list.appendChild(el('div', { class: 'arc-legend-row' },
      el('span', { class: 'arc-when' }, x.when),
      el('span', { class: 'arc-zh' }, item.zh),
      el('span', { class: 'arc-desc' }, item.desc)
    ));
  });
  wrap.appendChild(list);

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '为什么这一屏是一条时间轴：'),
    ' 场合真正影响推荐的地方是"什么时候用"——通勤在白天、约会在夜里，'
    + ' 而库里每瓶都标了时段。把它画成一天，比列五个并列的按钮更接近你实际的决定。'
  ));

  wrap.appendChild(navBar('occasion'));
  return wrap;
}

/* ============================================================
   第 7 屏：季节（v3 专属环境效果 = 温度光带）
   ------------------------------------------------------------
   内容隐喻：季节对香水的影响是**温度与光线**（夏天会闷、冬天散得快）。
   所以这一屏的主控件是一条色温带，四个季节是带上的四个刻度，
   选中哪一季，整条带就向那一端的色温倾斜。

   与场合屏的区别（必须说清，否则两屏读起来像同一套）：
     场合 = 一条线上的位置（时间，离散但有序），控件是弧 + 移动的光点；
     季节 = 一条带上的色温（连续的量），控件是色带 + 固定刻度。
   一个讲"何时"，一个讲"多冷暖"。形式不同，语义也不同。
   ============================================================ */
function renderSeason() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('season');
  const lead = el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  );
  const trans = el('p', { class: 'scene-trans' });
  const paintTrans = () => {
    const hit = SEASONS.find((s) => s.id === state.answers.season);
    trans.classList.toggle('is-idle', !hit);
    trans.textContent = hit
      ? `${hit.zh}：${hit.desc}`
      : '按你打算主要在哪个季节用选一个；不确定就跳过，不答不扣分';
  };
  paintTrans();
  lead.appendChild(trans);
  wrap.appendChild(lead);

  /* ---- 温度光带 ----
     带子本身就是控件（不是"带子指示 + 下面另有一排按钮"）。
     第一版两样都做了，实测截图上是**同一件事的两个可点控件**并排——
     用户不知道该点哪个，而且两处状态要互相同步（多一条会出错的路径）。
     现在只留带子：四段各是一个 58px 高的真实 button，名字写在段里。

     色温来自 seasonTint()（见 ambient.js）：每段一个 oklch 值，
     由该季的 temp（定色相）与 light（定明度）两根轴一起算出来。
     为什么不在 CSS 里用 color-mix 现混：四个季节的 temp 只差 <0.13，
     混出来的四段肉眼不可辨（实测 oklab 差 0.004–0.017），
     截图上是纯平一条 —— 那是效果没生效，不是克制。 */
  const band = el('div', {
    class: 'temp-band',
    role: 'radiogroup',
    'aria-label': '主季节',
  });
  const pinNodes = [];
  /* 每段的色温由 seasonTint() 直接给出（oklch），而不是让 CSS 在近邻色之间
     插值 —— 理由见 ambient.js 的 seasonTint 注释：四个季节的 temp 只差 <0.13，
     color-mix 混出来的四段肉眼不可辨。 */
  SEASONS.forEach((s, i) => {
    const on = state.answers.season === s.id;
    const b = el('button', {
      class: 'band-seg' + (on ? ' is-on' : ''),
      type: 'button',
      role: 'radio',
      'aria-checked': String(on),
      'data-season': s.id,
      style: `--i: ${i}; --seg-tint: ${seasonTint(s.id)}`,
      onclick: () => {
        /* 再点一次选中项 = 取消（季节本来就是可跳过的题，
           没有取消路径的话用户只能靠"重新来一次"清掉它）。 */
        state.answers.season = state.answers.season === s.id ? null : s.id;
        paint();
        applyAmbient();
      },
    },
      el('span', { class: 'band-zh' }, s.zh),
      el('span', { class: 'band-desc' }, s.desc)
    );
    pinNodes.push({ node: b, id: s.id });
    band.appendChild(b);
  });
  wrap.appendChild(band);

  /* 光带的"读数"：选中季节的那句解释，与带子同一行区块。
     未选时给真正的指引（不借第一项的解释冒充当前值）。 */
  const hint = el('p', { class: 'scene-trans' });
  wrap.appendChild(hint);

  function paint() {
    const cur = state.answers.season;
    band.style.setProperty('--band-warm', seasonBandWarm(cur).toFixed(3));
    band.classList.toggle('is-idle', !cur);
    pinNodes.forEach((p) => {
      const on = p.id === cur;
      p.node.classList.toggle('is-on', on);
      p.node.setAttribute('aria-checked', String(on));
    });
    const hit = SEASONS.find((s) => s.id === cur);
    hint.classList.toggle('is-idle', !hit);
    hint.textContent = hit
      ? `${hit.zh}：${hit.desc}`
      : '按你打算主要在哪个季节用选一个；不确定就跳过，不答不扣分。再点一次可以取消';
  }
  paint();

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
   第 8 屏：浓淡 + 浓度（v3 专属环境效果 = 香气扩散场）
   ------------------------------------------------------------
   内容隐喻：浓淡的物理含义是**离开皮肤多远还闻得到**。
   所以这一屏用五圈同心圆，选到第 N 档 → 前 N 圈着色，
   最外圈向外做一次性扩散脉冲。

   为什么保留滑块：五圈是**读数**，滑块是**控件**。
   把五圈做成可点（点第几圈 = 第几档）会让触控目标变成 1px 宽的圆环，
   而触控 44px 是硬约束。所以圆场只负责"看得懂"，滑块负责"改得动"。

   为什么 ② 浓度仍是单选卡：它是香精占比，与扩散距离不是同一根轴
   （有清淡的 Parfum，也有呛人的 EDT）—— 合并会丢掉一个真实维度。
   这一屏的两个决定在视觉上分开：上半是场（①），下半是卡（②③）。
   ============================================================ */

/* ============================================================
   第 7 屏：浓淡 + 浓度（2026-11-11 由两屏合回一屏）
   ------------------------------------------------------------
   这一屏做两个决定，且刻意保持两个决定的分界可见：
     ① 想要多浓  —— 滑块，问的是**体感**（想让人闻到多重的分量）
     ② 偏好哪种浓度 —— 单选卡，问的是**香精占比**（决定留多久）
     ③ 大概能留多久 —— 由 ② 推断，纯展示，不参与打分
   （见 src/scoring.js 8c 段：同浓度下全库等加，对排序零贡献；
    能改但不影响结果的控件比不给更糟，所以 ③ 不可点。）

   为什么 ①② 必须同屏而不是拆两屏：它们是对同一根轴的两个数，
   拆开后用户看不见自己 ① 拖到几档，容易答出互相矛盾的组合。
   旧的两屏版为此专门挂了一句跨屏提醒；现在提醒就在同一屏里，
   指代从「上一题」改回「①」，不需要用户记上一屏。

   为什么留香仍然按浓度联动重绘整屏：这一屏没有滚动长列表，
   重绘不会让用户丢失位置，而 ③ 那一行的选中态必须跟着 ② 变。
   ============================================================ */
function renderConcentration() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('concentration');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  /* ---- ① 扩散场（v3 专属环境效果）----
     五圈同心圆是**读数**，滑块是**控件**。为什么不把圆做成可点：
     1px 的圆环拿不到 44px 触控保护（与圆盘"命中层必须是真 button"
     同一个理由）。所以这里只负责"看得懂"。

     圈数与档位的关系是**物理**的而不是装饰的：第 N 档 = 气味扩散到第 N 圈。
     范围读数直接写"离开皮肤多远还闻得到"，因为它就是这个意思。 */
  const FIELD_TEXT = {
    1: '只有抱住才闻到',
    2: '靠近才闻到',
    3: '一臂之内',
    4: '走过会留一点香',
    5: '进门就知道你在',
  };
  const field = el('div', { class: 'diffuse', 'aria-hidden': 'true' });
  const rings = [];
  for (let i = 0; i < 5; i++) {
    const r = el('span', { class: 'ring' });
    rings.push(r);
    field.appendChild(r);
  }
  const core = el('span', { class: 'field-core' }, String(Number(state.answers.intensity)));
  field.appendChild(core);
  wrap.appendChild(field);

  /* 五圈按档位点亮。抽成函数是因为滑块拖动时每帧都要调 —— 只改 class，
     不重绘整屏（重绘会让滑块失焦）。 */
  const paintField = () => {
    const v = Number(state.answers.intensity);
    rings.forEach((r, i) => r.classList.toggle('is-lit', i < v));
    core.textContent = String(v);
  };
  paintField();

  /* ---- ① 浓郁度滑块 ---- */
  wrap.appendChild(el('div', { class: 'chips-label' }, '① 你想要多浓'));
  const read = el('div', { class: 'scale-read' });
  const updateRead = () => {
    const v = Number(state.answers.intensity);
    const [a, b] = INTENSITY_LABEL[v];
    /* 读数里带上扩散场的具象说法：同一个数给两种读法
       （档位数字 + 别人能不能闻到），这一句是"术语必翻译"在这一屏的落点。 */
    read.innerHTML = `<b>${v} / 5 · ${a} · ${FIELD_TEXT[v]}</b><br><span>${b}</span>`;
  };
  const input = el('input', {
    type: 'range', min: '1', max: '5', step: '1',
    value: String(state.answers.intensity),
    'aria-label': '浓郁度',
    oninput: (ev) => {
      state.answers.intensity = Number(ev.target.value);
      updateRead();
      paintField();
      applyAmbient();
    },
  });
  /* 5 个档位要有落点标记，否则用户拖到某个位置说不出自己停在第几档。
     位置算法必须与浏览器画滑块的算法一致：手柄宽 20px，可用轨道 = 100% − 20px，
     手柄中心从 10px 起，所以第 i 档 left = 10px + i/4 × (100% − 20px)。 */
  const ticks = el('div', { class: 'scale-ticks', 'aria-hidden': 'true' },
    ...[0, 1, 2, 3, 4].map((i) => el('span', {
      class: 'scale-tick' + (Number(state.answers.intensity) === i + 1 ? ' is-on' : ''),
      style: 'left: calc(10px + ' + (i / 4) + ' * (100% - 20px));',
    }))
  );
  const scale = el('div', { class: 'scale' }, input, ticks,
    el('div', { class: 'scale-ends' },
      el('span', {}, '← 清爽 / 淡'),
      el('span', {}, '浓 / 有分量 →')
    ));
  wrap.appendChild(scale);
  /* 拖动手柄时刻度要跟着亮 —— 只改 class，不重绘整屏（重绘会让滑块失焦）。 */
  const paintTicks = () => {
    const v = Number(state.answers.intensity);
    [...ticks.children].forEach((t, i) => t.classList.toggle('is-on', v === i + 1));
  };
  input.addEventListener('input', paintTicks);
  updateRead();
  wrap.appendChild(read);

  /* ---- ② 浓度档 ---- */
  wrap.appendChild(el('div', { class: 'chips-label', style: 'margin-top:20px' },
    '② 偏好哪种浓度（决定留香，选一个）'));
  wrap.appendChild(choiceGrid(CONCENTRATIONS, state.answers.concentration, (id) => {
    state.answers.concentration = id;
    /* 联动：选完浓度就把留香填成推断值，③ 那一行要跟着变，所以重画整屏。
       重绘会让 ① 的滑块回到 state 里的值 —— 状态本就存在 state，不丢。 */
    const inferred = CONC_TO_LONGEVITY[id];
    if (inferred != null) state.answers.longevity = inferred;
    render();
  }));

  /* ① 与 ② 打架时提醒一句。阈值取 2 档：差 1 档是常态，说了等于每屏都挂废话。 */
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
    if (band && want) {
      const gap = want < band[0] ? band[0] - want : (want > band[1] ? want - band[1] : 0);
      if (gap >= 2) {
        const concZh = (CONCENTRATIONS.find((c) => c.id === conc) || {}).zh || conc;
        wrap.appendChild(el('div', { class: 'term-note is-warn' },
          el('strong', {}, '① 和 ② 差得有点远：'),
          ` 你要的是 ${want}/5（${INTENSITY_LABEL[want][0]}），但选了${concZh}。`,
          ' 浓淡是体感、浓度是香精占比，两者不完全同步 —— 真想要那个体感，',
          ' 把 ① 调回中间档更稳妥；不改也能出结果，只是候选会少一些。'
        ));
      }
    }
  }

  /* ---- ③ 留香：由 ② 浓度推算，纯展示。老存档里可能带着手动值，一并显示。 ---- */
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

  if (stepId === 'family') {
    /* 两条入口都算「答过了」：轮盘选家族，或下面那排「按感觉选」。
       只认 family 时，用情绪入口的人会被这个 disabled 卡在第 1 步 ——
       而那恰好是不认识香型词汇的用户，等于把兜底路也堵死。 */
    const byFamily = !!state.answers.family;
    const byEmotion = !!state.answers.emotion;
    const done = byFamily || byEmotion;
    bar.appendChild(el('span', { class: 'hint' }, done
      ? (byFamily ? '中圈可选，不选就按大类推荐' : '按感觉选也可以，中圈可不选')
      : '先在外圈挑一个大类，或者用下面的「按感觉选」'));
    bar.appendChild(el('button', {
      class: 'btn', type: 'button', disabled: done ? null : 'disabled',
      onclick: next,
    }, '下一步 →'));
    return bar;
  }

  /* 香调两屏：都可一个不选。措辞按屏分开 ——
     「想要」是可选加分，「不想要」是更有效的排除，两句不能说反。 */
  if (stepId === 'wanted') {
    bar.appendChild(el('span', { class: 'hint' }, '一个都不选也能继续'));
    bar.appendChild(el('button', { class: 'btn', type: 'button', onclick: next }, '下一步 →'));
    return bar;
  }
  if (stepId === 'avoid') {
    bar.appendChild(el('span', { class: 'hint' }, '这一题最值得花时间，但也可以跳过'));
    bar.appendChild(el('button', { class: 'btn', type: 'button', onclick: next }, '下一步 →'));
    return bar;
  }

  /* v3 预算屏：它是**范围**不是偏好，「不限」永远成立，所以按钮永远可点。
     提示语把默认行为说清，避免用户以为必须选一档才能走。 */
  if (stepId === 'budget') {
    bar.appendChild(el('span', { class: 'hint' },
      state.answers.budget ? '选好了，也可以改成不限' : '不选就是不限'));
    bar.appendChild(el('button', { class: 'btn', type: 'button', onclick: next }, '下一步 →'));
    return bar;
  }

  /* v19：新增 7 屏的前进按钮。
     其中 character / concentration / longevity 是"点选即自动前进"，
     但仍画一个显式的「下一步」——原因：自动前进是 480ms 后触发的，
     用户点了之后若想反悔，需要一个不依赖"等它自己跳"的出口；
     而且键盘用户 Tab 到这里时，自动前进已经错过了，
     没有按钮他们就卡住了（与第 3 步滑块同一个问题）。

     一屏一问之后，这一组里的每一屏都只有**一个**决定，且都可跳过
     （气质可以不选、季节可以不选、浓度可以不选），所以按钮永远可点 ——
     要求"必须答完才能走"会把可跳过的问题变成门槛。 */
  if (stepId === 'mood' || stepId === 'season' || stepId === 'occasion'
      || stepId === 'concentration') {
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

/* ---------- 预算 → 候选池前置过滤 ----------
   为什么在**池**这一层做，而不是在打分里加一个因子：
   预算不是偏好证据 —— 它不说明"你喜欢什么味道"，只说明"这段货架上能挑"。
   做成打分因子会让一瓶 300 元的香水仅因为便宜而排在 2000 元的更贴的那瓶前面，
   那是把价格混进了匹配度。所以它只决定**把哪一批瓶子交给 recommend()**：

     · 没选预算（null）→ 全库，逐位等同 v19 行为；
     · 选了某一档 → 只保留该档内有挂牌价的瓶；
     · **没有挂牌价 ≠ 最便宜**：无价的瓶直接退出，不回落到任何档。
       这条是本轮最容易写错的地方：回落到第一档会让用户看到一堆"其实不知道多少钱"
       的瓶子排在"600 以内"，那是对预算的伪造。

   池子被筛空时（某档 + 某族恰好没有交集）不静默返回空：
   退回全库并在结果页说明 —— 给出三瓶带说明，好过给一个空白页。 */
function poolForBudget(perfumes) {
  const band = bandById(state.answers.budget);
  if (!band) return { pool: perfumes, band: null, narrowed: false };
  const prices = PRICES && typeof PRICES === 'object' ? PRICES : {};
  const pool = perfumes.filter((p) => {
    const v = prices[p.id];
    const bid = bandOfPrice(v);
    return bid != null && bid === band.id;
  });
  if (pool.length < 3) return { pool: perfumes, band, narrowed: false };
  return { pool, band, narrowed: true };
}

/* ---------- v3：结果页两条退路 ----------
   「换一批」的语义必须是真的换三瓶，不是把同一批换个顺序。
   实现是**取 6 瓶当缓冲、每次显示 3 瓶**（recommend 的 topN 是参数）：

     · 第 1 次显示 rank 0–2，第 2 次显示 rank 3–5，第 3 次回到 0–2；
     · 排序与理由全部来自同一次 recommend —— 所以"换一批"之后看到的每一瓶，
       它的匹配度与理由仍然与答案对得上（加噪声的做法会在这里出问题）。

   为什么只缓冲 6 瓶而不是 9/12：多样性约束（同族同品牌不许占满前三）
   在 1388 瓶里让前 6 名已经跨了 3–4 个家族；再多取，第 7 名之后的家族
   与品牌重复率明显上升，"再换一批"会开始给出三瓶一个味道的组合。
   这一点在 PR 描述里写明，不假装能无限换。 */
let resultBuffer = null;
let resultCursor = 0;

function reroll() {
  /* 缓冲存在结果对象上，与那一批答案绑定；换答案（finish）会重建它。 */
  const buf = state.result && state.result.buffer;
  if (!buf || buf.length < 6) {
    /* 候选不足 6 瓶（预算筛得很窄时会发生）：退化成"没有更多可换"，
       把话说清，不要静默无反应 —— 点了没反应比没有这个按钮更糟。 */
    const bar = document.querySelector('.result-actions .hint');
    if (bar) bar.textContent = '这次的候选不够换一批（可用池子太窄），改一题或重新来一次试试';
    return;
  }
  resultCursor = (resultCursor + 3) % buf.length;
  const slice = buf.slice(resultCursor, resultCursor + 3);
  /* 不足三瓶时从头补（缓冲是 6 的倍数时不会发生，防御性保留）。 */
  while (slice.length < 3) slice.push(buf[slice.length]);
  state.result.results = slice;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* 「改一题重推」：回第 1 屏，但**不清空答案**。
   与 restart 的区别是它保留已答的其它项 —— 用户说的是"我某一项点错了"，
   不是"这套答案都不算"。回到第 1 屏而不是弹出"你要改哪一题"的菜单：
   那份菜单本身就是一道新题，而用户刚答完九屏。 */
function gotoFirst() {
  state.step = 0;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  if (!state.answers.family && !state.answers.emotion) { state.step = 0; render(); return; }
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
    /* v3：挂牌价表同样是"等了也没关系"的便利层 —— 它只有 20KB，
       而且预算屏已经渲染过它（通常早已在缓存里）。失败则 PRICES=false，
       poolForBudget 会把预算当成"没有价格数据"处理：退回全库、不伪造筛选。 */
    await ensurePrices().catch(() => {});
    /* v3：预算前置过滤。**只换池子，不换引擎** —— recommend() 的
       answers/perfumes/taxonomy 三个入参与 v19 逐位一致，
       所以"不选预算"时结果与上一版完全相同（有测试钉这一条）。 */
    const { pool, band, narrowed } = poolForBudget(d.perfumes);
    /* v3：取 6 瓶而不是 3 瓶 —— 页面每次显示 3 瓶，「换一批」翻到另一半。
       取 6 的理由与限制见 reroll() 的注释（第 7 名之后多样性开始塌）。 */
    const full = recommend(state.answers, pool, TAX, { topN: 6 });
    const six = full.results;
    resultCursor = 0;
    state.result = {
      ...full,
      /* buffer 是完整 6 瓶；results 是当前显示的那 3 瓶。 */
      buffer: six,
      results: six.slice(0, 3),
    };
    /* 把预算的落点连同结果一起存下来，结果页要用它说清"在哪个范围里挑的"。
       只有真的筛过（narrowed）才写，否则结果页不该出现一句范围声明。 */
    state.result.budgetBand = narrowed ? band : (band || null);
    state.result.budgetNarrowed = narrowed;
    state.result.poolSize = pool.length;
    state.result.librarySize = d.perfumes.length;
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
     用户看到的是"我明明重选了，结果没变"。
     v3 又加了 3 个键（likedScenes / avoidScenes / budget），同一处陷阱：
     漏掉的话「重新来一次」会带着上一轮的预算与情景格重新跑一遍，
     而那正是用户最能一眼看出来的错。 */
  state.answers = {
    family: null, subfamily: null, emotion: null, occasion: null, intensity: 3,
    likedScenes: [], avoidScenes: [],
    likedNotes: [], dislikedNotes: [], likedZh: {}, dislikedZh: {},
    budget: null,
    /* characterNeg 与 longevityManual 是前两轮漏掉的：前者是气质原型的
       「禁止标签」，不清就会带着上一轮的排除项进新一轮打分（用户重选气质后
       仍被扣分，且界面上看不出来）；后者是留香手动覆盖标记，不清会让新一轮
       明明由浓度推断、却被标成「手动」。两者都不在 restart 的键表里，
       属于「加字段时漏更新这里」的老毛病。 */
    characterPreset: null, characterTags: [], characterNeg: [],
    season: null,
    concentration: null, longevity: null, longevityManual: false,
    dislikedFamilies: [], temperature: null, sweetness: null,
    anchorBrand: null, anchorPerfume: null, anchorNotes: [],
  };
  state.result = null;
  /* 环境线也要归零：否则新一轮第 1 屏会带着上一轮末尾的暖色开场，
     而用户此时的答案全是空的 —— 环境与答案对不上，是"每屏重置"的反面错误。
     归零靠 applyAmbient（它按 state.answers 全量重算，不增量减）。 */
  ambientPrev = null;
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
        : '不用懂前中后调，全程不问香调名。九屏，从香型、预算、想要的味道一路问到场合与浓淡，换三个具体到型号的候选'
    ),
    // 印章：纯装饰（aria-hidden），字取「香」—— 这个应用唯一的主题字。
    el('span', { class: 'seal', 'aria-hidden': 'true' }, '香')
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

  /* 预算的落点（v3）。三态，三句话都不一样，不能混：
       band && narrowed     → 只在某一档里挑的（写清范围与瓶数）
       band && !narrowed    → 用户选了档，但池子被筛空、已退回全库（必须说出来）
       !band                → 不限 */
  const band = state.result.budgetBand || null;
  const narrowed = !!state.result.budgetNarrowed;
  const poolSize = state.result.poolSize;
  const libSize = state.result.librarySize;
  const kindOfBudget = band
    ? (narrowed ? `预算 ${band.zh}` : `预算 ${band.zh}（池子太小，已退回全库）`)
    : null;

  const head = el('div', { class: 'result-head' });
  head.append(
    el('div', { class: 'eyebrow' }, '基于你的回答'),
    /* 场合在第 4 步是「可跳过」的，scoring 那边把没答的情况显式降成 null
       （src/scoring.js:634 `profile.occasion?.zh ?? null`）。原来直接拼模板，
       实测会印出「清冷 · null · 浓郁度 3/5」—— 用户看到的是字面的 null。
       这里先滤掉空值再 join。不补「未指定场合」这种假默认值：
       少一段比分一段含糊话更轻。 */
    el('h2', {}, [
      profile.familyZh,
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

  /* ---------- v3：预算范围声明 ----------
     规格要求"预算题前置"必须有可见后果，否则它就成了白问一题。
     这里只说两件事：从哪一段货架挑的、那一段里有多少瓶。
     不产生"理由句"—— 它是范围声明，不是推荐依据（理由仍全部可反推到偏好答案）。 */
  if (band) {
    wrap.appendChild(el('p', { class: 'pool-note', 'data-pool': narrowed ? 'narrowed' : 'fell-back' },
      narrowed
        ? `只在「${band.zh}」这一段里挑：${poolSize} 瓶候选（全库 ${libSize} 瓶）。价格是挂牌价快照，不做比价。`
        : `你选了「${band.zh}」，但这一段里能凑出的候选太少（${poolSize} 瓶），已退回全库挑选 —— 这三瓶未必都在这一档内。`
    ));
  }

  /* ---------- v3：标本签到结果页的闭环 ----------
     规格要求「已选香型图标…到结果页与推荐卡上的图标呼应闭环」。
     做法：这一屏的标本签放大一档，并在它旁边列出这次答案的摘要 ——
     让用户看到"我一路带过来的那枚标签，就是这三瓶的来时路"。

     位置在标题之后、三张卡之前：它讲的是**你的答案**，卡片讲的是**我们的回答**。
     答案先、回答后，读序才成立。 */
  {
    const esc = escortBar({ at: 'result' });
    if (esc) {
      const echo = el('div', { class: 'esc-echo' }, esc);
      const seasonZh = profile.season
        ? ((SEASONS.find((s) => s.id === profile.season) || {}).zh || profile.season)
        : null;
      const bits = [
        profile.familyZh ? `香型 ${profile.familyZh}` : null,
        profile.subfamilyZh ? `小类 ${profile.subfamilyZh}` : null,
        kindOfBudget,
        profile.emotionZh || null,
        profile.occasionZh || null,
        seasonZh ? `${seasonZh}季` : null,
        `浓淡 ${profile.intensity}/5`,
      ].filter(Boolean);
      echo.appendChild(el('p', { class: 'esc-echo-line' }, bits.join(' · ')));
      wrap.appendChild(echo);
    }
  }

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
       季节没有 profile.seasonZh（scoring 只给了 season 的 id），
       所以这里自己查 taxonomy —— 直接写 profile.seasonZh 会是 undefined，
       被 .filter(Boolean) 静默吃掉，摘要里就少一项，而界面上看不出来。 */
    const seasonLabel = profile.season
      ? ((SEASONS.find((s) => s.id === profile.season) || {}).zh || profile.season)
      : null;
    const answerBits = [
      profile.emotionZh,
      profile.occasionZh,
      seasonLabel ? `${seasonLabel}季` : null,
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

  /* ---------- v3：结果页的两条退路（规格底线要求保留）----------
     ① 「换一批」—— 同一份答案换三瓶。
        它必须**真的换**，不能只是把顺序搬一下。做法是在 recommend 之后
        再取第 4–6 名：这需要引擎给出更多候选，而 recommend 的 topN 是调用参数
        （见 src/scoring.js），所以这里用 topN:6 取六瓶、页面每次显示三瓶。
        取 6 而不是"重新跑一遍加噪声"：加噪声会让理由与分数对不上，
        那正是这个项目一直在防的事。
     ② 「改一题重推」—— 回第 1 屏重答，但**保留已答的其它项**。
        与「重新来一次」（restart，清空全部）是两件事：
        前者是"我说错了某一项"，后者是"这套答案都不算"。

     两个按钮都用 .btn ghost：结果页的主操作是"去试这一瓶"（卡片里的购买入口），
     不该再抢一次主色。 */
  wrap.appendChild(el('div', { class: 'actions result-actions', style: 'margin-top:36px' },
    el('button', { class: 'btn', type: 'button', onclick: reroll }, '换一批 →'),
    el('button', { class: 'btn ghost', type: 'button', onclick: gotoFirst }, '改一题重推'),
    el('button', { class: 'btn ghost', type: 'button', onclick: restart }, '重新来一次'),
    el('div', { class: 'spacer' }),
    el('span', { class: 'hint' }, '换一批会从同一份答案里再挑三瓶，改一题只动你点的那一项')
  ));

  return wrap;
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
/* ---------- v3：环境线的唯一写入口 ----------
   为什么做成"只改 #app 上的四个 CSS 变量"而不是重绘什么：
   ① 环境线跨屏存在是连接感的第一条；写在内层节点上会随 render() 的
      innerHTML 清空而消失，那就退化成"每屏重置"；
   ② 只改变量 → CSS 的 transition 能真的插值过去，观感是"走过去"，
      不是"换了一张纸"。

   第一次调用时给 #app 打 `is-amb-init`：CSS 用它在首屏**关掉**过渡，
   否则用户一进页面就会看到环境色从默认值缓慢漂过去 —— 那不是演变，那是加载。 */
function applyAmbient() {
  const app = $('#app');
  if (!app) return null;
  const a = currentAmbient();
  const style = ambientStyle(a);
  const prevStyle = app.getAttribute('data-amb');
  if (prevStyle !== style) app.setAttribute('data-amb', style);
  /* 行内样式逐条写：不能用 setAttribute('style', …)，
     那会把标签里已有的其它行内属性（--amb-* 之外的东西）一并冲掉。 */
  app.style.setProperty('--amb-warm', a.warm.toFixed(3));
  app.style.setProperty('--amb-lit', a.lit.toFixed(3));
  app.style.setProperty('--amb-weight', ((a.weight + 1) / 2).toFixed(3));
  app.style.setProperty('--amb-temp', a.temp.toFixed(3));
  if (!app.classList.contains('is-amb-init')) app.classList.add('is-amb-init');
  ambientPrev = a;
  return a;
}
function render() {
  const app = $('#app');
  /* 切屏前记下焦点落在哪个可交互元素上。整页重建会把原节点连同焦点一起丢掉，
     键盘用户每走一步都要从头 Tab 穿过页头才能回到题目 —— 实测切步后
     activeElement 是 BODY。 */
  const prevFocus = document.activeElement;
  const hadFocusInside = prevFocus && prevFocus !== document.body && app.contains(prevFocus);

  /* 切屏语言按屏分配，不搞一刀切（D59）。
     三档定义在 `styles/src/_wheel22.css` 的 data-scene 段：
       cut    零位移淡入      —— 作答中的屏（用户在选择，位移会打断线性感）
       settle 下沉 8px 淡入   —— 转换阶段的屏（首屏 / 心情 / 排除）
       rise   上浮 14px 淡入  —— 结果页（全流程唯一"给答案"的一屏） */
  /* 切屏语言按屏分配（D59）。
       cut    零位移淡入      —— 作答中的屏（用户在选择，位移会打断线性感）
       settle 下沉 8px 淡入   —— 转换阶段的屏（首屏 / 气质 / 结果）
       rise   上浮 14px 淡入  —— 结果页（全流程唯一"给答案"的一屏）

       ⚠️ v3 起这三档只决定**内容块**的入退场。整页的氛围不再清空重来：
       环境线写在 #app 的 CSS 变量上，跨屏连续插值（见 applyAmbient）。
       所以「转场是走过去」由两件事共同成立 —— 内容块按档位移，
       环境值插值过去；两者都保留，缺一条就退回"翻页"。 */
  const SCENE = {
    family: 'settle',
    budget: 'cut',
    wanted: 'cut',
    avoid: 'cut',
    mood: 'settle',
    occasion: 'cut',
    season: 'cut',
    /* 2026-11-11：intensity 与 concentration 合屏后只剩后者一个 id。
       保留 'concentration' 的 cut —— 它仍是连续作答的一屏；
       旧的 'intensity' 键随步骤一起删掉，留着会被读成"还有一屏没拆完"。 */
    concentration: 'cut',
    anchor: 'cut',
  };
  const list = curSteps();
  /* 越界保护（防御性，2026-11-09）。
     入口切换会让步骤表长度变化，理论上 `state.step` 可能落在新表之外。
     夹到末屏而不是回第 1 步：用户刚改的是入口，不该被扔回开头重答。 */
  state.step = clampStep(state.step, list.length);
  const isResult = state.step >= list.length;
  app.dataset.scene = isResult
    ? 'rise'
    : (SCENE[list[state.step].id] || 'cut');

  /* 步骤 id 同时写进 DOM，供 CSS 认屏。
     原先只有 `_wheel17.css` 用 `main:has(.disc):has(.seg)` 认"场景屏"，
     结果是转盘屏（第 1 步也有 .disc + .seg 情绪段选）被一起命中，
     masthead 的 28px 下边距在那一屏被压成 6px —— 换屏时整页会跳 12–22px。
     写一个显式属性，认屏就不靠"这个屏碰巧有什么元素"。 */
  app.dataset.step = isResult ? 'result' : list[state.step].id;

  /* ---- 环境线：先算再画 ----
     必须在填充内容之前算：CSS 变量要在这批节点进 DOM 时就已到位，
     否则它们会先按旧值（或默认值）绘制一帧，然后被过渡拖过去 —— 看得见闪。 */
  applyAmbient();

  /* ---- 标本签放在 #app 里、内容块之外 ----
     这是"屏间不断裂"的落点：每一屏都在它旁边换内容，而它自己不被替换。
     已选香型为 null 时 escortBar 返回 null，整条不出现
     （空框是提醒不是陪伴，不该每屏挂一个"你还没选"的牌子）。

     ⚠️ 顺序：先清空 innerHTML，再 append 标本签，最后 append 内容。
     反过来写会把刚建好的标本签节点一起清掉 —— 那是本轮实测踩到的坑。 */
  app.innerHTML = '';
  const escort = escortBar(isResult ? { at: 'result' } : {});
  if (escort && !isResult) app.appendChild(escort);

  app.appendChild(renderMasthead());
  app.appendChild(renderProgress());
  if (isResult) {
    app.appendChild(renderResult());
  } else {
    app.appendChild(list[state.step].render());
  }
  app.appendChild(renderFooter(isResult));

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

/* 挂牌价表。与 PHOTOS 同一套三态语义，同样的"绝不阻塞首屏"原则。
   校验比 photos 更严一点：只收「正整数且落在 1–1000000」的值 ——
   这张表直接决定"这一档有几瓶"，一条脏数据会让读数变成 NaN。 */
let pricesPromise = null;
function ensurePrices() {
  if (PRICES !== null) return Promise.resolve(PRICES);
  if (!pricesPromise) {
    const base = new URL('./', import.meta.url);
    pricesPromise = fetch(new URL('data/prices.json', base))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const map = d && typeof d === 'object' && d.prices && typeof d.prices === 'object'
          ? d.prices : null;
        const out = {};
        if (map) {
          for (const [id, v] of Object.entries(map)) {
            const n = Number(v);
            if (!Number.isFinite(n) || n < 1 || n > 1000000) continue;
            out[id] = Math.round(n);
          }
        }
        PRICES = Object.keys(out).length ? out : false;
        return PRICES;
      })
      .catch(() => { PRICES = false; return PRICES; });
  }
  return pricesPromise;
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
    /* v3：挂牌价表（20KB）同样预热 —— 第 2 屏的预算读数要用它，
       不预热的话用户走到那一屏会看到"还在读取"闪一下。 */
    ensurePrices().catch(() => {});
    /* 盘心彩图：与香水库并行预热，24 枚一起拉，用户点到哪格都有现成的。 */
    artWarmAll();
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

/* 步骤表的入口分叉本身要能被测（v36）。
   为什么必须单独暴露：家族入口 6 步 / 情绪入口 7 步这件事，
   只有「点两遍第 1 步、数一遍进度条」才看得见；而 test-render 的主流程
   走的是家族入口，情绪入口那一支在常态下**一条断言都碰不到**。
   把它做成纯函数暴露出来，两条入口的分叉就都能直接验。 */
export const __steps = {
  all: STEPS,
  cur: curSteps,
  head: stepHead,
  clamp: clampStep,
};

/* 气质原型与它的推导函数。测试要验"选了原型就等于答了冷暖甜度"，
   而这条关系只能从 app.js 里取到（CHARACTER_PRESET 不导出）。 */
export const __presets = CHARACTER_PRESET;
export const __derivePreset = deriveFromPreset;

/* 重开一局。测试要验「换一批 / 改一题」必须能从干净状态走一遍，
   否则只能验到纯函数、验不到 navBar / render / 进度条。 */
export const __restart = restart;

/* v3：环境线与它的两个纯函数依赖。这三条是「连接感」唯一的可执行判据 ——
   测试要验"累积而不是覆盖"，只能直接调 ambientOf 比对两次不同答案的数值，
   读 DOM 只能读到最终色值，读不出"它是累加的"。 */
export const __ambient = {
  of: ambientOf,
  current: currentAmbient,
  style: ambientStyle,
  /* 让测试读到"上一次算出来的值"，用来验跨屏是否连续（不被重置）。 */
  prev: () => ambientPrev,
};

/* 生活情景表与预算档：测试要验「每一格挂的香调都在 taxonomy 里」，
   这是"不许另起炉灶造新题"这条硬底线的执行方式。 */
export const __scenes = {
  liked: LIKED_SCENES,
  avoid: AVOID_SCENES,
  allNotes: allSceneNotes,
  notesOf: notesOfScenes,
  zhOf: zhOfScenes,
  familyPlain: FAMILY_PLAIN,
};

export const __budget = {
  bands: BUDGET_BANDS,
  byId: bandById,
  bandOfPrice,
  exclusionNote: bandExclusionNote,
  pool: poolForBudget,
  /* 测试要能注入价格表，不必在磁盘上放真文件。 */
  setPrices: (v) => { PRICES = v; },
};

/* 结果页的两条退路。reroll 的行为（真的换三瓶、不换顺序）只能从
   状态迁移上验，读 DOM 只能看到"三瓶名字变了"，看不到它变的是哪三瓶。 */
export const __retreat = { reroll, gotoFirst };


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
