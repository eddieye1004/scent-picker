
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

const state = {
  step: 0,
  answers: {
    /* v5：预算（屏 1）。存档位 id 或 'any'。
       它**不进** scoring 的 activeDims：预算是范围不是偏好，把它算成
       一个"维度"等于拿范围冒充证据（MATCH_PCT_MIN_DIMS 的门槛会被虚抬）。 */
    budget: null,
    // 香型轮盘两个层级：family 是外圈大类，subfamily 是中圈子类（可只选到大类）
    family: null,
    subfamily: null,
    emotion: null,
    occasion: null,
    intensity: 3,
    likedNotes: [],
    dislikedNotes: [],
    // 英文香调名 → 中文显示名。理由里要回显用户点的中文，而不是 bergamot。
    likedZh: {},
    dislikedZh: {},
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
  /* v5 结果页的两个出口要用。batch 是当前看第几批（每批 3 瓶）；
     poolSize 是这次真正参与打分的瓶数（选了预算之后不是 1388）。 */
  batch: 0,
  poolSize: 0,
  poolFiltered: false,
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

/* ---------- 步骤定义 ----------
   ==== 2026-11-10：一屏一问（Eddie 决策：方向 B 机制 + 方向 A 骨架）====
   改动前是"一屏合并多问"：第 2 步同屏两栏香调、第 4 步同屏场合圆盘+季节、
   第 5 步同屏滑块+浓度+留香。合并是当时为了"少翻页"做的，代价是
   **一屏里塞了 2–3 个问题，用户不知道自己在答第几题**，进度条也只有 6–7 段，
   与实际要做的决定数不符。

   现在拆成一屏一问，每屏只做**一个决定**：
     1 family            香型（轮盘，外圈+中圈）
     2 likedNotes        想要的味道
     3 dislikedNotes     受不了的味道
     4 mood              气质
     5 occasion          场合
     6 season            季节
     7 concentration     浓淡 + 浓度（2026-11-11 合回一屏，见下方）
     8 dislikedFamilies  整族排除（仅情绪入口）
     9 anchor            已知款

    ==== 2026-11-11：浓淡 / 浓度两屏合回一屏（10 屏 → 9 屏）====
   Eddie 要求结果流程从 10 屏收到 9 屏，且点名「浓淡/浓度」是当初预留的最小回滚点，
   所以按原样合回去，其余 8 屏的拆法一律不动（香调两屏、场合/季节两屏都保留）。
   合并后：全集 9 屏 / 家族入口 8 屏 / 情绪入口 9 屏，用户可见的最大流程长度 = 9。

    为什么这两屏可以合：它们测的是同一件事的两个面（体感 vs 香精占比），
   是同一根轴上的 2 个数，同屏看反而更好比较 —— 拆开时用户在下一屏看不见
   上一屏拖到几档，更容易答出互相矛盾的组合（旧屏为此专门挂了跨屏提醒，
   合并后提醒就在同一屏里，指代从「上一题」改回「①」）。所以这一屏恢复 ①②③ 编号：
    ① 想要多浓（滑块，体感）
    ② 偏好哪种浓度（单选卡，香精占比）
    ③ 大概能留多久（由 ② 推断，纯展示，不参与打分）
   编号不是退步：一屏里出现三个物件时，必须能一眼说出「这是第几个决定」。

   为什么把「想要的」与「受不了的」拆开而不是留在同屏：
   同屏两栏的互斥逻辑（勾了左边要从右边移除）是这一屏唯一需要跨栏同步的状态，
   拆开后两栏永不同时存在，那段同步代码整块消失 —— 少一处能出错的地方。
   代价是多翻一页，但每页只有一个决定，翻开时不需先判断"这屏有几问"。

   为什么「整族排除」仍是按入口动态出现：
   实测（scripts/probe-step6-options.mjs，2026-11-09）家族入口 30 种组合里
   **0 种**改变 top-3 —— 候选池被 isDominant 过滤成 100% 本族，
   而扣分要求「该族 = 这瓶的主族」，排除任何别的族都打不中。
   点了没反应比不给这个入口更糟，所以只在情绪入口显示。
   */
const STEPS = [
  {
    id: 'budget',
    short: '预算',
    title: '你打算花多少钱？',
    /* 前置理由写在 renderBudget 顶部。help 只交代"这一屏决定后面从哪挑"，
       并把"不限"这个合法选项放在最后一句 —— 预算是最容易让人卡住的一题，
       不给出口就会有人随手点一个然后一路不满意。 */
    help: '先圈定范围，后面只在这一段里挑。不想限就选「不限」',
    render: renderBudget,
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
    id: 'mood',
    short: '气质',
    title: '你希望它给人什么感觉？',
    help: '这一组讲的是它给人的感觉，不是具体味道。挑一个最像的就行',
    render: renderMood,
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
          而 'intensity' 变成屏内 ① 的锚点，不再是独立步骤。
       副作用：CSS 里 32 条 `#app[data-step="context"]` 认的是旧 id，本来就
       已失效（见 styles/src/70-final.css 顶部注释），本屏合并不改变这一点，
       留给任务 2 一并修。 */
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
       注意只改这一处 help；同一屏内其它几处「香精占比」是页面内释义文字
       （第 2865/2891 行），它们正是用来解释这个词的，不是黑话本身，不动。 */
    help: '先说体感（想让人闻到多重的分量），再说浓度类型（决定留香多久）。两项都不选也能出结果',
    render: renderConcentration,
  },
  /* ==== 2026-11-16 v5：`dislikedFamilies`（整族排除）从问卷退场 ====
     它原来带着 `when: (a) => !a.family` —— 只在"用感觉选"那条入口出现，
     因为走香型轮盘时候选池已被过滤成 100% 本族，整族排除实测 0/30 改变 top-3。
     v5 把轮盘撤了，这个条件就**永远成立**，这一屏会变成每局固定出现 ——
     而它的六个选项写着「柑橘调 / 花香调 / 木质调 / 东方琥珀调 / 清新调 / 美食调」，
     正是规格第 1 条明令不许出现的香调术语题。所以整屏删除，不是隐藏。

     它承载的负向信息没有丢：气质屏每个原型各带 `neg` 标签
     （如「蜜感白花」不要 leathery / smoky / citrusy / green），
     选中即写入 `answers.characterNeg`，引擎按它扣分 —— 这是用户**判断得了**的
     否定（"我不要皮革和烟味"），而不是"我不想要木质调"这种术语否定。
     代价如实记下：粒度从"整族"降到"原型自带的几个反向标签"，比原来粗，
     但每一条都是用户读得懂的。 */
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

/* 当前生效的步骤表。STEPS 是全集，带 when() 的项按答案动态出现。
   为什么不做成常量查找表 —— 因为答案会在第 1 步被改，集合必须每次重算。

   注意：所有「第 N 步 / 共 M 步」与进度段数都必须走这个函数，
   不能再读 STEPS.length。两套数字一旦分叉，界面会显示「共 7 步」但只有 6 屏，
   用户翻到第 6 屏就出结果，会以为漏了一屏。 */
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
      /* data-id 与 dataset 一致，供 CSS 认扇区、供测试按 id 取扇区。
         原来只靠 aria-checked 与顺序判断，测试要点"约会"只能按下标猜 ——
         场合表一旦重排，那条断言就会静默地测错的扇区。 */
      'data-id': it.id,
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

/* 香材剖面标本：24 枚上色 SVG 的图鉴语言。
   为什么不用图片：需求明确不要"廉价 AI 图或扒来的劣质素材"。可离线、
   且保证每张质感一致的只有两条路 —— 自己画，或买一套统一授权的摄影。
   后者做不到离线，前者天然一致：同一视框、同一线宽、同一取色。

   为什么按「子家族」而不是按香材：实测每个小类的代表香材全部落在同一个家族里
   （白花是茉莉+晚香玉，都是 floral；果味甜是桃+苹果+梨，都是 gourmand）。
   逐味画会出来一排一模一样的图标 —— 那不是示意图，是重复。
   所以一枚放大，香材名交给旁边那行字去说。

   图形本体已全部来自 ./icon-specimen/svg/ 的上色版（见下方 ART_FILE）。

   ==== v5：它原来的宿主（香型轮盘）已从问卷退场 ====
   轮盘的六个扇区写着「柑橘调/花香调/木质调」，那张盘本身就是一道香调术语题
   （规格第 1 条禁止）。轮盘退场后，这 24 枚图标**不能跟着一起删** ——
   规格第 5 条明确要求「复用/扩展现有香型小图标系统」。所以给它换一个宿主：
   气质屏。七个气质原型各配一枚图标，映射由数据推导（见 PRESET_PLATE 的注释）。
   图标仍然承担它原来的职责：图形先于文字成立，让不认识香调词的人先认出一件东西。 */
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

/**
 * 盘心示意图。只在落到具体小项时调用 —— 大类层面没有"具体香材构成"可画。
 * 最多取 3 味：360px 视口下盘心可用宽度约 131px，4 味会挤成一条。
 */

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

/* 七个气质原型 → 一枚图鉴图标。
   ------------------------------------------------------------
   **为什么是手写表，不是算出来的**：学习笔记 ②（scent-quiz-benchmark-study.md
   第 118 行）记录过一件事 —— 按 noteIndex 的 family 字段统计，24 个子家族里
   有 12 个的代表香材跨 ≥2 个家族，另有 25 个香材名根本没有 family 映射。
   也就是说**这份数据推不出图标归属**，只能由人按语义指派。我试过用
   tags 点乘家族权重自动挑，结果三个原型都落到「檀木」（因为 woody/honey
   那几个标签在六族上普遍权重高），那是一排同形图标 —— 正是笔记里
   「无一排同形」判定要拦的失败。

   所以这张表是**按气质语义**逐个挑的，每一枚都写清为什么选它：
     洁净清透 → 水生（刚洗完澡的水感，不是花）
     雨后林地 → 香根草（湿土+根须，笔记里就是「像雨后翻开的土」）
     冰镇果露 → 果味美食（桃子苹果，冰过的那种甜）
     干爽草本 → 茶香（干草、茶叶，干净利落不贴身）
     皮革烟草 → 皮革（最不像"香"的一类，正好配这个原型）
     蜜感白花 → 白花（晚香玉茉莉，甜但不压人）
     焦糖琥珀 → 香草美食（香草荚+奶油，甜得厚重）
   七枚分别落在六个不同家族、七个子家族上，没有两枚同族 —— 满足"不成排同形"。 */
const PRESET_PLATE = {
  'clean-clear': 'aquatic',
  'wet-forest': 'vetiver',
  'iced-fruit': 'fruity-gourmand',
  'dry-herb': 'tea',
  'leather-tob': 'leather',
  'honey-white': 'white-floral',
  'caramel-amber': 'vanilla-gourmand',
};

/* 把一枚图标渲染成 DOM。与原来的 scentPlate 同一套机制（彩图已就绪就直接写，
   没就绪先占住位再填），只是不再自己算"代表香材"—— v5 是按原型指定。
   返回 null 表示这枚还没就绪且也没有占位意义，调用方应跳过。 */
function plateOf(subId) {
  const ready = artSvgReady(subId);
  const box = svgEl('svg', {
    class: 'plate-svg is-art',
    viewBox: '0 0 ' + PLATE_SIZE + ' ' + PLATE_SIZE,
    'aria-hidden': 'true', focusable: 'false',
  });
  if (ready) box.innerHTML = ready;
  else {
    /* 没就绪：等它到了再写进去（与 scentPlate 同一理由 ——
       宁可空一小会儿，也不画一个旧的再换掉）。 */
    artInner(subId).then((inner) => {
      if (inner) box.innerHTML = artNs(inner, 'a' + (++artSeq));
    });
  }
  return box;
}

/* 公共：离散选项的按钮网格。用于气质、季节、浓度这些 4–8 项的单选。
   为什么不用 chips：chips 是给"40 个香调"那种多选场景的；
   五六个选项用 chips 会缩成一小块、点起来费劲，也塞不下解释文字。

   opts[i].plate（可选）：这一项挂一枚图鉴小图标（见 PRESET_PLATE）。
   图标放在卡片左侧、与文字同一条基线，尺寸由 CSS 按 28px 给：
   它要"36px 下不看文字可辨形"，所以不能比 28 再小。
   为什么把图标做成 choiceGrid 的可选项而不是各屏自己拼卡片：
   卡片组已经是既有组件，另造一套会与它的 radiogroup / roving tabindex /
   .choice 样式三处分叉 —— 那正是"每屏各写一套"最容易出事的地方。 */
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
      class: 'choice' + (on ? ' is-on' : '') + (o.plate ? ' has-plate' : ''),
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
      o.plate ? el('span', { class: 'choice-plate', 'aria-hidden': 'true' }, o.plate) : null,
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

/* 气质原型 → 引擎的情绪入口（v5 必需的一步）。
   ------------------------------------------------------------
   为什么必须有这个映射：v5 把香型轮盘从问卷里撤了（它是术语题），
   而 `buildProfile` 的硬约束是 **family 或 emotion 至少有一个**，
   否则直接 throw。所以「气质」这一屏必须自己产出 emotion，
   否则用户答完五屏点「看推荐」会崩 —— 这是删屏带来的真实耦合，
   不是可选优化。

   怎么算的：不是手工配一张表，而是拿原型自己的 tags（标签→权重）
   去点乘 emotionMap 每条的 families（族→倾向），取最高分。
   两边都是数据文件里的既有字段，换一份 taxonomy 这个映射会自己跟着变。
   实测七个原型的结果（2026-11-16 用当前 taxonomy 跑）：
     洁净清透→干净(2.85) 雨后林地→清冷(1.80) 冰镇果露→明亮(0.70)
     干爽草本→清冷(0.90) 皮革烟草→清冷(0.90) 蜜感白花→明亮(2.10)
     焦糖琥珀→神秘(1.90)
   平局（干爽草本/皮革烟草/雨后林地在 1.6–1.8 一档）按 emotionMap 的
   声明顺序取先者，因此结果是确定的、可复算的。 */
function emotionFromPreset(id, taxonomy = TAX) {
  const c = CHARACTER_PRESET.find((x) => x.id === id);
  if (!c || !c.tags || !taxonomy || !Array.isArray(taxonomy.emotionMap)) return null;
  let bestId = null;
  let bestScore = -1;
  for (const e of taxonomy.emotionMap) {
    let s = 0;
    for (const [tag, w] of Object.entries(c.tags)) {
      if (e.families && e.families[tag] != null) s += w * e.families[tag];
    }
    if (s > bestScore) { bestScore = s; bestId = e.id; }
  }
  return bestId;
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

/* ---------- 第 10 步：整族排除 ----------
   比逐个香调排除更快，也更符合直觉：「我不想要木质」是一句话，
   而「我不要雪松、不要檀木、不要香根草…」是七次点击。
   惩罚用 -30（轻于单个香调的 -40）：整族排除确实更含糊，
   而且只在该族是这瓶的**主族**时才罚 ——「带一点雪松的柑橘」不该被误伤。 */
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

  /* 术语译文行（规格第 4 条：全卷每屏选项区常驻一句译文，选项换、译文换）。
     这一屏的"术语"不是香调词，而是**这一屏到底在拿什么做比对** ——
     用户填完之后系统做什么，比他填的时候更需要一句人话。 */
  const anchorGloss = el('p', { class: 'gloss-line is-idle' });
  const paintAnchorGloss = () => {
    const p = state.answers.anchorPerfume
      ? (DATA?.perfumes || []).find((x) => x.id === state.answers.anchorPerfume)
      : null;
    if (p) {
      anchorGloss.textContent = `会拿「${p.name}」这份香调表去库里找气味接近的，`
        + '而不是找同一瓶 —— 你要的是"像它"，不是"又是它"';
      anchorGloss.classList.remove('is-idle');
    } else if (state.answers.anchorBrand) {
      anchorGloss.textContent = `记住的是「${state.answers.anchorBrand}」这个牌子，`
        + '下一格能选到具体哪一瓶；不选就按这牌子的整体风格找';
      anchorGloss.classList.remove('is-idle');
    } else {
      anchorGloss.textContent = '填了就拿它的香调表去找相似的气味；不填也能出结果，'
        + '只是少了这条最硬的线索';
      anchorGloss.classList.add('is-idle');
    }
  };
  paintAnchorGloss();
  wrap.appendChild(anchorGloss);

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
        /* 译文行同理就地刷：换了牌子，"记住的是哪个牌子"那句必须跟着换。 */
        paintAnchorGloss();
        refreshCarriedTags();
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
          paintAnchorGloss();
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
    /* 预选也必须写 emotion：预选的语义就是"我们替你填了"，而引擎读的是
       emotion。只填 characterPreset 的话，用户不动这一屏直接下一步就会
       因为没有入口被弹回气质屏 —— 看起来像卡死，实际是漏写了一个字段。 */
    const emo = emotionFromPreset(best.id);
    if (emo) state.answers.emotion = emo;
  }
  /* 已经选过原型（比如从结果页「改一题」点回来）时，emotion 必须与之一致 ——
     否则用户改选了气质，情绪却还停在上一轮，两处互相矛盾且界面上看不出来。 */
  if (state.answers.characterPreset && !state.answers.emotion) {
    const emo = emotionFromPreset(state.answers.characterPreset);
    if (emo) state.answers.emotion = emo;
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

  /* 术语译文行（规格第 4 条：选项区常驻一句生活化译文，选项换、译文换）。
     这一屏译的是「这个气质在气味上是什么样」—— 用户挑的是感觉词，
     而引擎要的是气味方向，中间这一步必须让用户看得见，否则他不知道自己
     选「干净」为什么推来一瓶带鸢尾的粉感香水。 */
  const moodGloss = el('p', { class: 'gloss-line is-idle' },
    '挑一个最像的，这里会说清它在气味上是什么样（不用懂香调名）');
  const paintMoodGloss = (id) => {
    const c = CHARACTER_PRESET.find((x) => x.id === id);
    const emo = TAX.emotionMap.find((e) => e.id === emotionFromPreset(id));
    if (!c) return;
    moodGloss.classList.remove('is-idle');
    /* 译文只说两件用户能验证的事：气味像什么（原型 desc 的后半句）+ 它偏哪些
       具体气味（用 emotionMap 的 notesZh 中文名）。不出现"香调/家族"这类词。 */
    const noteZh = emo ? Object.values(emo.notesZh || {}).slice(0, 4).join('、') : '';
    moodGloss.textContent = c.desc + (noteZh ? ` 常见的气味是${noteZh}这类。` : '');
  };
  paintMoodGloss(state.answers.characterPreset);
  wrap.appendChild(moodGloss);
  /* ---- 气质坐标：把七张卡摆到它们真实的两个维度上 ----
     v5 给这一屏的效果从它自己的内容里长出来：每个原型都带 dims
     （temp 冷暖 × sweet 甜度，来自数据而非文案），所以这一屏可以画一张
     **两轴的坐标图**，七个原型按各自的 dims 落位，选哪个哪个亮。
     为什么这算"效果对应本題"：题目问"你希望它给人什么感觉"，
     而"感觉"在这份数据里本来就有两个可量的轴 —— 温与甜。
     坐标图让用户在选之前就看见这七个不是并列的七张牌，
     而是散在一张图上的七个位置；"洁净清透"和"焦糖琥珀"离得最远这件事，
     不用读解释也看得出来。

     它不是第二套控件：真控件仍是下面的 .choice-grid（单选组语义、
     键盘可达、既有测试都认它）。这张图 aria-hidden，纯粹是同一组数据的
     另一种投影 —— 点图上的点也走同一个 onPick，不是两条路径。 */
  const mapBox = el('div', { class: 'mood-map', 'aria-hidden': 'true' });
  /* 两条轴的中线与端点标注。轴名用生活词，不出现"香调"。 */
  mapBox.appendChild(el('span', { class: 'map-axis map-axis-x' }, '凉 → 暖'));
  mapBox.appendChild(el('span', { class: 'map-axis map-axis-y' }, '不甜 → 甜'));
  const mapDots = [];
  /* 七个原型只落在 **4 个** (temp, sweet) 象限里 —— 这把二值轴只有 4 个落点：
       (-1,-1) 洁净清透 / 雨后林地
       (-1,+1) 冰镇果露
       (+1,-1) 干爽草本 / 皮革烟草
       (+1,+1) 蜜感白花 / 焦糖琥珀
     所以同象限的几枚必须错开，否则它们会叠成一个点、点五个只能看见四个。
     错开量由"这是本象限第几个"决定，而**象限归属仍来自 dims**——
     不是随手摆的坐标。重量维（dims.weight，数据里也有）正好把同象限那几枚分开，
     所以用它当象限内的偏移量：它本身也是真实数据，不是编的。 */
  const quadrantSeen = {};
  CHARACTER_PRESET.forEach((c) => {
    const qk = c.dims.temp + ',' + c.dims.sweet;
    const nth = quadrantSeen[qk] = (quadrantSeen[qk] || 0) + 1;
    /* x = 甜度（左不甜 → 右甜），y = 温度（下凉 → 上暖，所以用 100 - …）。
       每个象限的基准点落在象限中心（25% / 75%），而不是边界 ——
       落在边界上会与轴重合，读起来像"还在两个象限之间"。
       同象限第 n 枚再按 weight 方向错开 12%。 */
    const baseX = ((c.dims.sweet + 1) / 2) * 100;
    const baseY = 100 - ((c.dims.temp + 1) / 2) * 100;
    const spread = (nth - 1) * 12;
    const x = baseX + (baseX > 50 ? -spread : spread);
    const y = baseY + (c.dims.weight > 0 ? spread : -spread);
    const dot = el('span', {
      class: 'map-dot',
      style: `left:${Math.max(6, Math.min(94, x)).toFixed(1)}%;top:${Math.max(8, Math.min(92, y)).toFixed(1)}%`,
      'data-preset': c.id,
    }, el('i', {}, c.zh));
    mapDots.push({ el: dot, id: c.id });
    mapBox.appendChild(dot);
  });
  const paintMap = () => {
    mapDots.forEach((m) => m.el.classList.toggle('is-on', m.id === state.answers.characterPreset));
  };
  paintMap();
  wrap.appendChild(mapBox);

  wrap.appendChild(choiceGrid(
    ranked.map((c) => ({
      id: c.id,
      zh: c.zh,
      desc: c.desc,
      /* 每张卡左侧挂一枚图鉴图标（PRESET_PLATE 手写指派，理由见那张表）。
         图标是装饰（aria-hidden），语义由卡片文字承担 —— 与结果页实物图
         同一条纪律：图形不承载信息，只让它更容易被认出来。 */
      plate: PRESET_PLATE[c.id] ? plateOf(PRESET_PLATE[c.id]) : null,
    })),
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
      /* v5：选了原型就等于选了情绪入口 —— 这一步很关键。
         引擎要求 family 或 emotion 至少有一个，而 v5 的问卷里没有香型轮盘了，
         所以情绪必须从气质这里长出来。映射按标签权重对 emotionMap.families
         做点积取最高分（见 emotionFromPreset 的注释），不是我拍脑袋配的。 */
      const emo = emotionFromPreset(id);
      if (emo) state.answers.emotion = emo;
      paintSuggest();
      paintMap();
      refreshCarriedTags();
      /* 术语译文行跟着换（规格第 4 条），这一屏译的是"这个气质在气味上意味着什么"。 */
      paintMoodGloss(id);
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
   v5 屏 1：预算（前置）
   ------------------------------------------------------------
   为什么前置：预算不是"第一喜欢什么"，是**先把货架划出一段**。
   后面每一屏都在这一段里挑，所以它必须排在最前面 —— 放在末尾等于
   先让用户挑完再告诉他"这些你买不起"。

   为什么这一屏用「价签行」而不是单选卡片组：
   四个价位是有序的区间（≤300 → >1500），卡片网格表达的是"四件并列的东西"，
   会把"贵"和"便宜"读成两个平行的选项。价签行是**一条数轴**，
   从左到右就是由便宜到贵，选中段变实、其余退成虚线刻度。
   ——这就是规格要求的「效果从本題内容里长出来」：价格本身是连续量，
   所以控件是量尺，不是一个胶囊组。

   数据从哪来：`data/price-bands.json`（18 KB，`scripts/build-price-bands.mjs`
   生成）。它只存了「瓶 id → 档位序号」，**不存价格**——本站既有约束是
   "不展示价格、不做比价"（docs/DECISION-AD-DISCLOSURE-20261110.md），
   档位够用。每次点是现算这一段有几瓶，不是写死的数字。

   已知边界（会显示在屏上，不藏在文档里）：
   1388 瓶里只有 637 瓶（45.9%）有价签，其余未知。选具体档时
   **未知价的瓶子不进候选池**——把"不知道多少钱"当成"很便宜"是编事实。
   选「不限」时它们全部回来。
   ============================================================ */
const BUDGET_OPTS = [
  { id: 'b1', zh: '300 以内', note: '试试水，或者买来当日常消耗' },
  { id: 'b2', zh: '300–700', note: '一瓶正经的日常主力' },
  { id: 'b3', zh: '700–1500', note: '认真挑一瓶，能撑很久' },
  { id: 'b4', zh: '1500 以上', note: '送礼或者收藏，不太看价格' },
  { id: 'any', zh: '不限', note: '还不知道，先看看有什么' },
];

/* 价签表三态，与 PHOTOS / AFF_LINKS 同一套语义：
   null = 还没试过；false = 试过、没有（文件缺失或结构不对）；对象 = 有。 */
let PRICE_BANDS = null;
let priceBandsPromise = null;
function ensurePriceBands() {
  if (PRICE_BANDS !== null) return Promise.resolve(PRICE_BANDS);
  if (!priceBandsPromise) {
    const base = new URL('./', import.meta.url);
    priceBandsPromise = fetch(new URL('data/price-bands.json', base))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        /* 只认 { 字符串: 数字 } 的扁平表。这是可被替换的文件，
           校验掉怪值比事后在中途崩掉强。 */
        const map = d && typeof d === 'object' && d.byId && typeof d.byId === 'object' ? d.byId : null;
        const out = {};
        if (map) {
          for (const [id, bi] of Object.entries(map)) {
            const n = Number(bi);
            if (typeof id === 'string' && Number.isInteger(n) && n >= 0) out[id] = n;
          }
        }
        PRICE_BANDS = Object.keys(out).length ? out : false;
        return PRICE_BANDS;
      })
      .catch(() => { PRICE_BANDS = false; return PRICE_BANDS; });
  }
  return priceBandsPromise;
}

/* 这一档里有几瓶（现算，不写死）。
   返回 null 表示"价签表还没到 / 没有"，调用方要显示"—"而不是 0 ——
   0 会被读成"这一段一瓶都没有"，与"我们不知道"是两句话。 */
function budgetCount(bandId) {
  if (!PRICE_BANDS || !DATA?.perfumes?.length) return null;
  if (bandId === 'any' || bandId == null) return DATA.perfumes.length;
  const bi = BUDGET_OPTS.findIndex((b) => b.id === bandId);
  if (bi < 0) return null;
  let n = 0;
  for (const p of DATA.perfumes) if (PRICE_BANDS[p.id] === bi) n += 1;
  return n;
}

/* 按预算把候选池切一段。**这是整个 v5 唯一动到引擎输入的地方**：
   不做打分改动，只在调 recommend() 之前过滤 perfumes 参数。
   返回 null = 不过滤（选了「不限」或没答）。 */
function budgetPool(perfumes) {
  const id = state.answers.budget;
  if (!id || id === 'any' || !PRICE_BANDS) return null;
  const bi = BUDGET_OPTS.findIndex((b) => b.id === id);
  if (bi < 0) return null;
  const kept = perfumes.filter((p) => PRICE_BANDS[p.id] === bi);
  /* 兜底：某档瓶子太少（选了档但价签表缺）时**不静默返回空池**——
     recommend 拿到空数组会抛/出怪结果。返回 null 让调用方回落到全库，
     并在结果页说明"这一段没凑够，已放宽"。 */
  return kept.length >= 3 ? kept : null;
}

function renderBudget() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('budget');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  /* 价签表是第 1 屏就要用的（读数与量尺宽度都挂在它上面），
     而它是异步的。没到时先照常画（宽度退成等分），到货后**只把量尺与读数
     重画一次**，不整屏重绘 —— 整屏重绘会把用户已经点下的那一段闪掉，
     也会让键盘焦点掉回 body。

     这条"到货再补"是必须的，不是优化：慢网下 perfumes.json 有 0.5MB，
     价签表虽然只有 18KB，但它和香水库抢同一条连接；谁先到不确定。
     不补的话，用户看到的量尺永远是等分五格、读数永远写"暂无数"，
     直到他重开这一屏 —— 而第 1 屏通常不会被重开。 */
  const priceSlot = el('div', { class: 'budget-slot' });
  wrap.appendChild(priceSlot);

  const paintBudget = () => {
    priceSlot.innerHTML = '';
    priceSlot.appendChild(buildBudgetRail());
  };
  paintBudget();
  /* 数据未到：等一次。已在缓存（常见情形）时 promise 立刻兑现，
     重画一次是无害的（内容相同）。 */
  if (!PRICE_BANDS || !DATA?.perfumes?.length) {
    Promise.all([ensurePriceBands().catch(() => {}), ensurePerfumes().catch(() => {})])
      .then(() => { if (curSteps()[state.step]?.id === 'budget') paintBudget(); })
      .catch(() => {});
  }

  /* 数据边界要上屏。这不是免责声明，是让用户知道"为什么可能挑不到"：
     46% 有价签这件事如果不讲，选了 300 以内却发现很少，用户会以为推荐坏了。 */
  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '这一段是怎么来的：'),
    ' 库里有价钱记录的约 637 瓶（其余 751 瓶我们不知道多少钱，选具体档时不参与，'
    + '选「不限」时全部参与）。价钱是电商挂牌价的粗略分档，',
    el('em', {}, '不显示具体价格、也不比价'),
    '；试香小样已剔除，免得 ¥9.9 的 1ml 分装把这一档塞满。'
  ));

  wrap.appendChild(navBar('budget'));
  return wrap;
}

/* 价签量尺本体（含读数）。抽出来是因为它要能"到货后再画一次"，
   而不重绘整屏（见 renderBudget 里那段注释）。 */
function buildBudgetRail() {
  const box = el('div');

  /* 价签行本体的读数。先建出来，因为下面的渲染与点击都要写它。 */
  const readout = el('p', { class: 'budget-read', 'aria-live': 'polite' });

  const paintReadout = () => {
    const id = state.answers.budget;
    const opt = BUDGET_OPTS.find((b) => b.id === id);
    if (!opt) {
      readout.textContent = '先选一段。选完这里会显示这一段里有多少瓶可选。';
      readout.classList.add('is-idle');
      return;
    }
    readout.classList.remove('is-idle');
    const n = budgetCount(id);
    if (id === 'any') {
      readout.textContent = `全库 ${DATA?.perfumes?.length || 1388} 瓶都参与，包括那些我们还不知道价钱的。`;
      return;
    }
    readout.textContent = n == null
      ? '这一段暂时数不出来（价签表还在读），先按这一段挑。'
      : `这一段有 ${n} 瓶可选。选完之后，只在 ${opt.zh} 这一带里挑。`;
  };

  /* 价签行的几何：一条横向量尺，四段实区间 + 末端一个"不限"的开口刻度。
     每段宽度按该档真实瓶数分配 —— 用「瓶数」而不是「金额跨度」当宽度，
     因为用户关心的是"这一段里有多少可选"，而 300 与 3000 的金额跨度
     在视觉上没法等比例画（会有一段宽成整屏）。 */
  const rail = el('div', { class: 'budget-rail', role: 'radiogroup', 'aria-label': '预算区间' });
  const segs = [];
  const counts = BUDGET_OPTS.map((o) => budgetCount(o.id));
  /* 宽度权重：真实瓶数优先；读不到时退成等宽（不能因为数据没到就画成 0 宽）。
     「不限」固定占一档宽度，它是出口不是区间。 */
  const weights = BUDGET_OPTS.map((o, i) => {
    if (o.id === 'any') return 0.9;
    const n = counts[i];
    return n && n > 0 ? Math.max(0.6, n / 160) : 1;
  });

  BUDGET_OPTS.forEach((o, i) => {
    const isAny = o.id === 'any';
    const b = el('button', {
      class: 'budget-seg' + (isAny ? ' is-any' : ''),
      type: 'button',
      role: 'radio',
      'aria-checked': 'false',
      'data-id': o.id,
      'data-band': isAny ? 'any' : String(i),
      style: `--w:${weights[i].toFixed(2)}`,
    },
      el('span', { class: 'budget-zh' }, o.zh),
      /* 刻度：每段底部一道短线，长度 = 这一段的宽度（由 CSS 用 --w 撑）。
         它不是装饰，是"这一段有多宽"的唯一视觉表达 ——
         没有它，四段就是四块等宽的色块，看不出哪一段货多。 */
      el('span', { class: 'budget-tick', 'aria-hidden': 'true' })
    );
    b.addEventListener('click', () => {
      state.answers.budget = o.id;
      segs.forEach((s) => {
        const mine = s.el.getAttribute('data-id') === o.id;
        s.el.classList.toggle('is-on', mine);
        s.el.setAttribute('aria-checked', String(mine));
        s.el.setAttribute('tabindex', mine ? '0' : '-1');
      });
      rail.classList.add('has-pick');
      paintReadout();
      /* 只重画底部按钮（"下一步"文案要跟着变），不整屏重绘：
         整屏重绘会让刚点的那段闪一下，量尺读起来像被重置了。 */
      refreshNav('budget');
      /* 签条同样要刷 —— 它与底部按钮是同一批"依赖答案但不重绘整屏"的东西。 */
      refreshCarriedTags();
    });
    /* 键盘：方向键在量尺上左右走，并立即选中（radio 的标准行为）。 */
    b.addEventListener('keydown', (ev) => {
      let d = 0;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') d = 1;
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') d = -1;
      else return;
      ev.preventDefault();
      const to = (i + d + BUDGET_OPTS.length) % BUDGET_OPTS.length;
      segs[to].el.focus();
      segs[to].el.click();
    });
    if (state.answers.budget === o.id) {
      b.classList.add('is-on');
      b.setAttribute('aria-checked', 'true');
      b.setAttribute('tabindex', '0');
      rail.classList.add('has-pick');
    } else {
      b.setAttribute('tabindex', o.id === 'b1' && !state.answers.budget ? '0' : '-1');
    }
    segs.push({ el: b, opt: o });
    rail.appendChild(b);
  });
  box.appendChild(rail);

  /* 每段下面一句人话（"试试水" / "一瓶正经的日常主力"…）。
     量尺本身只有数字，数字不解释自己；这一行是规格要求的"术语必翻译"在
     本题上的落法 —— 价位不是术语，但"300–700"对没买过香水的人一样抽象。 */
  const notes = el('div', { class: 'budget-notes', 'aria-hidden': 'true' },
    ...BUDGET_OPTS.map((o) => el('span', { class: 'budget-note' + (o.id === 'any' ? ' is-any' : '') },
      el('b', {}, o.zh), o.note))
  );
  box.appendChild(notes);

  box.appendChild(readout);
  paintReadout();
  return box;
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
function renderOccasion() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('occasion');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  /* v5：场合屏保留圆盘（它是站内最好的交互），但盘下加一层**昼夜光景**。
     为什么是昼夜：场合在数据里就是一个"什么时候 + 被闻到多远"的组合
     （taxonomy 的 occasionMap 每条都带 sillageMax / longevityMin，
     scoring.js 里还有 OCCASION_TIME = 上班 day / 约会 evening …）。
     所以这一屏的效果从本題内容长出来：选哪个场合，背景就从那个时段的
     光线状态切过去 —— 上班是上午的白，约会是入夜的暖，日常是阴天的灰，
     正式场合是夜里的深蓝，运动是正午最烈的白。
     这不是装饰：它把"场合"这个抽象词变成一个你认得的时间点。 */
  const occasionLight = el('div', { class: 'occasion-light', 'aria-hidden': 'true' },
    el('span', { class: 'oc-sun' }),
    el('span', { class: 'oc-horizon' })
  );
  wrap.appendChild(occasionLight);

  /* 术语译文行（规格第 4 条：选项区常驻一句生活化译文，选项换、译文换）。
     **必须先建再挂圆盘**：buildDisc 的 onPick 闭包里要用它。
     第一版把它写在 buildDisc 之后，闭包捕获到的是 TDZ 里那个未初始化绑定，
     点击时抛 ReferenceError —— 而圆盘自己的选中态在那之前已经改完了，
     所以界面看起来"选了但底下那句没变"，很容易被当成文案没写。 */
  const occasionGloss = el('p', { class: 'gloss-line is-idle' },
    '选一个场合，这里会说清它对这个味道的要求（被闻到多远、要撑多久）');

  wrap.appendChild(buildDisc(TAX.occasionMap, {
    label: '主要使用场合',
    selectedId: state.answers.occasion,
    onPick: (o) => {
      state.answers.occasion = o.id;
      /* 盘下那句译文行跟着换：场合的术语（sillage / longevity）不裸奔，
         一条生活化译文说清"这个场合要求它被闻到多远、要撑多久"。 */
      occasionLight.setAttribute('data-time', OCCASION_LIGHT[o.id] || 'day');
      occasionLight.classList.add('has-time');
      occasionGloss.textContent = occasionGlossOf(o);
      occasionGloss.classList.remove('is-idle');
      /* 标本签必须跟着长出来。圆盘的 onPick 不重绘整屏（重绘会重播转场、
         也会把盘心状态闪掉），所以那行签条得自己刷一遍 ——
         不刷的话，用户在这一屏答完，头部的"带着走"仍只有上一屏的答案，
         看起来像这一题没被记住。 */
      refreshCarriedTags();
    },
  }));

  /* 回访时（从结果页「改一题」点回来）把已有的答案铺回译文行与光景。 */
  if (state.answers.occasion) {
    const cur = (TAX.occasionMap || []).find((x) => x.id === state.answers.occasion);
    if (cur) {
      occasionGloss.textContent = occasionGlossOf(cur);
      occasionGloss.classList.remove('is-idle');
      occasionLight.setAttribute('data-time', OCCASION_LIGHT[cur.id] || 'day');
      occasionLight.classList.add('has-time');
    }
  }
  wrap.appendChild(occasionGloss);

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '为什么先问场合：'),
    ' 场合决定浓度下限与时段。同一瓶香水在通勤和约会里的宽容度差得很远，'
    + ' 这一项比"你觉得自己喜欢什么"更稳定。'
  ));

  wrap.appendChild(navBar('occasion'));
  return wrap;
}

/* 场合 → 光线状态。键与 taxonomy.occasionMap 一一对应（5 条），
   值只影响这一屏的背景光，不参与打分。 */
const OCCASION_LIGHT = {
  commute: 'morning',   // 上午的办公室白
  date: 'evening',      // 入夜，暖光
  daily: 'overcast',    // 阴天居家灰
  formal: 'night',      // 夜里，深蓝
  outdoor: 'noon',      // 正午最烈
};

/* 把「sillageMax / longevityMin」两个数翻成人话。
   数值来自 taxonomy 的真实字段，不另编：
     sillageMax 3 → 别扩散太远（同屋的人才知道）
     longevityMin 4 → 要撑得住一整天 */
function occasionGlossOf(o) {
  const far = o.sillageMax >= 4 ? '可以被隔着一个房间闻到' : '只让身边的人闻到';
  const dur = o.longevityMin >= 4
    ? '要能撑一整天，中途不补'
    : (o.longevityMin >= 3 ? '撑得住一个上午或一个下午' : '半天就够，随时补喷');
  return `${o.zh}：${far}，${dur}。${o.desc || ''}`;
}

/* ============================================================
   第 6 屏：季节（原「场景」屏拆出的后半）
   ------------------------------------------------------------
   季节用分段控件而不是卡片网格：4 个有序等长短词正是分段控件的语义场景。
   卡片网格（无序语法）在这里会误导成"4 个并列选择"。

   v5：控件从"四个等宽按钮"改成**温度光带** —— 四个季节本来就是一条连续的
   温度轴（冷 → 热 → 凉 → 冷），等宽按钮把这条轴拍平成了四件并列的东西。
   光带的长度与色温都由 SEASONS 的 temp 字段派生（数据驱动，不是画死的渐变）：
   每一段的位置由它在温度轴上的落点决定，选中的那一段把那一段温度照亮。
   ——这是规格点名的三个定版范例之一（季节题 → 温度光带）。
   ============================================================ */
function renderSeason() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('season');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  /* ---- 温度光带 ----
     四段的位置由 SEASONS 的 temp（0 = 冷 → 1 = 热）决定，不是四等分。
     这样"夏"真的落在最热那一端、"冬"落在最冷那一端，用户在带子上看到的
     位置就是季节在温度轴上的真实位置。选中哪段，那一段的色温亮起来，
     另外三段退成同一档灰度 —— 「温度光带」说的就是这件事：
     你选了哪一段温度，就照亮哪一段，不需要读文字也知道自己选的是冷还是热。 */
  const SEASON_TEMP = { spring: 0.45, summer: 1, autumn: 0.55, winter: 0 };

  const band = el('div', { class: 'temp-band', role: 'radiogroup', 'aria-label': '主季节' });
  const bandNodes = [];
  const bandGloss = el('p', { class: 'gloss-line is-idle' },
    '选一季，这里会说清那一季适不适合这个味道（热天要清透，冷天要压得住）');

  const paintBand = (id) => {
    bandNodes.forEach((n) => {
      const mine = n.id === id;
      n.el.classList.toggle('is-on', mine);
      n.el.setAttribute('aria-checked', String(mine));
      n.el.setAttribute('tabindex', mine || (!id && n.i === 0) ? '0' : '-1');
    });
    const cur = SEASONS.find((s) => s.id === id);
    if (cur) {
      bandGloss.textContent = `${cur.zh}：${cur.desc}。库里带「${cur.zh}」标注的有 `
        + `${SEASON_COVER[cur.id]} 瓶`;
      bandGloss.classList.remove('is-idle');
    }
  };

  SEASONS.forEach((s, i) => {
    const on = state.answers.season === s.id;
    const b = el('button', {
      class: 'temp-seg' + (on ? ' is-on' : ''),
      type: 'button',
      role: 'radio',
      'aria-checked': String(on),
      'data-id': s.id,
      /* --t 是这一段在温度轴上的位置（0 冷 → 1 热），CSS 用它算色温。
         数据驱动：换一份 SEASONS 只要它带 temp，光带自己会重排。 */
      style: `--t:${SEASON_TEMP[s.id]}`,
      tabindex: on || (!state.answers.season && i === 0) ? '0' : '-1',
      onclick: () => {
        state.answers.season = s.id;
        paintBand(s.id);
        refreshCarriedTags();
        /* 让光带播一次"热流"：选中段向外散一次，只是视觉，不阻任何事。 */
        band.classList.remove('is-flash');
        void band.offsetWidth;
        band.classList.add('is-flash');
      },
      onkeydown: (ev) => {
        let d = 0;
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') d = 1;
        else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') d = -1;
        else return;
        ev.preventDefault();
        const to = (i + d + SEASONS.length) % SEASONS.length;
        bandNodes[to].el.focus();
        bandNodes[to].el.click();
      },
    },
      el('span', { class: 'temp-zh' }, s.zh),
      /* 每段自己的温度条高度 = --t。它是这条光带的"刻度"，
         不是装饰：低了就是冷，高了就是热，一眼能比。 */
      el('span', { class: 'temp-bar', 'aria-hidden': 'true' })
    );
    bandNodes.push({ el: b, id: s.id, i });
    band.appendChild(b);
  });
  if (state.answers.season) band.classList.add('has-pick');
  wrap.appendChild(band);
  paintBand(state.answers.season);

  /* 未选时不能用 segHint 的默认行为：它会把第一项（春）那句解释当成"当前值"
     显示出来，配上 is-idle 的降级透明度，读起来像「你选了春，只是没高亮」。
     未选时说一句真正的指引，选中后才换成该季解释。 */
  const seasonHint = bandGloss;
  if (state.answers.season == null) {
    seasonHint.textContent = '按你打算主要在哪个季节用选一个；不确定就跳过，不答不扣分。';
  }
  wrap.appendChild(seasonHint);

  /* 这段数字是**用户可见**的，必须跟数据同步（1388 瓶实测，D56）。
     写错等于自拆台 —— 这类文字恰恰靠"说得具体"建立可信度。 */
  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '关于候选多少：'),
    ` 库里按季节标注为「春 ${SEASON_COVER.spring} · 夏 ${SEASON_COVER.summer} · 秋 ${SEASON_COVER.autumn} · 冬 ${SEASON_COVER.winter}」（1388 瓶中的标注覆盖数，每瓶平均标 2.9 个季节）。`,
    ' 冬天能选的最少，这是数据分布，不是推荐变差了。'
  ));

  wrap.appendChild(navBar('season'));
  return wrap;
}

/* 季节标注覆盖数。放在常量里而不是每次现算，是为了让它与上面那句用户可见的
   文案有一处共同来源（改数据时只改这里，不会出现"数字和句子对不上"）。 */
const SEASON_COVER = { spring: 1331, summer: 840, autumn: 1357, winter: 548 };

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

  /* ---- ① 浓郁度：扩散场 ----
     v5 把滑块换成**扩散场**（规格点名的定版范例之一：浓淡题 → 扩散场）。
     为什么：浓淡的本质不是"一个 1–5 的数"，是"它会扩散到多远"。
     所以控件画成同一颗气味从中心向外扩的同心场：档位越高，最外那圈推得越远、
     内圈越密。用户拖的不是一个滑块手柄，是"这个气味能走多远"。
     滑块仍然保留在无障碍树里（它是原生 range，键盘与读屏都认），
     但视觉上它退成一条细轨，主角是那几圈扩散环 ——
     控件形状由这一题的物理隐喻决定，这正是圆盘那条逻辑的正确迁移。 */
  wrap.appendChild(el('div', { class: 'chips-label' }, '① 你想要多浓'));
  const diff = el('div', { class: 'sillage-field', 'aria-hidden': 'true' });
  /* 5 圈。每圈半径与透明度都由档位派生：
     档 1 只亮最内一圈，档 5 五圈全亮且最外圈推到最大。 */
  for (let k = 1; k <= 5; k++) {
    diff.appendChild(el('span', { class: 'sillage-ring', 'data-k': String(k) }));
  }
  diff.appendChild(el('span', { class: 'sillage-core' }));
  const paintField = () => {
    const v = Number(state.answers.intensity) || 3;
    diff.setAttribute('data-level', String(v));
  };
  paintField();

  const read = el('div', { class: 'scale-read' });
  const updateRead = () => {
    const v = Number(state.answers.intensity);
    const [a, b] = INTENSITY_LABEL[v];
    read.innerHTML = `<b>${v} / 5 · ${a}</b><br><span>${b}</span>`;
  };
  const input = el('input', {
    type: 'range', min: '1', max: '5', step: '1',
    value: String(state.answers.intensity),
    'aria-label': '浓郁度',
    oninput: (ev) => {
      state.answers.intensity = Number(ev.target.value);
      updateRead();
      paintField();
      /* 换档时让扩散场播一次"推出去"：这是这一屏唯一的动效，
         也只属于这一屏（别的屏没有扩散这个概念）。 */
      diff.classList.remove('is-pulse');
      void diff.offsetWidth;
      diff.classList.add('is-pulse');
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
  wrap.appendChild(diff);
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

  /* v5 屏 1 预算：默认可跳过（"不限"本身就合法，且它等价于没答）。
     选了具体档时提示改成"只在这一段里挑"，让"我选了预算会有什么后果"
     在按下去之前就看得见。 */
  if (stepId === 'budget') {
    const picked = state.answers.budget;
    const opt = BUDGET_OPTS.find((b) => b.id === picked);
    bar.appendChild(el('span', { class: 'hint' }, !opt
      ? '不选也能继续，等于不限'
      : (opt.id === 'any' ? '已设为不限' : `只从 ${opt.zh} 这一段里挑`)));
    bar.appendChild(el('button', { class: 'btn', type: 'button', onclick: next }, '下一步 →'));
    return bar;
  }

  /* ==== v5：family / likedNotes / dislikedNotes / dislikedFamilies 四条分支已删 ====
     这四屏在 v5 的步骤表里不存在了（香型轮盘与香调点名两屏退场，
     理由见 STEPS 顶部注释与「整族排除」那段）。
     留着它们的 navBar 分支会变成**永远不会被走到的死代码**，
     而且更糟：它让「这一屏该怎么给出路」这件事有四个假答案可抄，
     下一次加屏的人很可能复制到其中一条，于是新屏的按钮配错文案还不报错。 */

  /* v19 起的一个约定：可跳过的屏也画显式「下一步」——
     自动前进是延后触发的，用户点完想反悔需要一个不依赖"等它自己跳"的出口；
     键盘用户 Tab 到这里时自动前进也已经错过，没有按钮就卡住。
     一屏一问之后每屏只做一个决定且都可跳过（气质/季节/浓度都能不选），
     所以按钮永远可点 —— 要求"必须答完才能走"会把可跳过的问题变成门槛。 */
  if (stepId === 'mood' || stepId === 'season' || stepId === 'occasion'
      || stepId === 'concentration') {
    bar.appendChild(el('span', { class: 'hint' }, '不选也能继续'));
    bar.appendChild(el('button', { class: 'btn', type: 'button', onclick: next }, '下一步 →'));
    return bar;
  }

  /* 已知款屏：永远可点（可跳过），且它是最后一屏 —— 按钮直接出结果。
     这条**必须在兜底之前**：漏掉它时按钮退化成兜底那句提示且没有出路，
     用户在第 6 屏点了半天都出不来结果（实测踩到过：整条结果流程断在这里，
     20 条结果页断言连带全红）。 */
  if (stepId === 'anchor') {
    bar.appendChild(el('span', { class: 'hint' }, '不填也能看结果'));
    bar.appendChild(el('button', {
      class: 'btn', type: 'button', onclick: (ev) => finish(ev.currentTarget),
    }, '看推荐 →'));
    return bar;
  }

  /* 走到这里说明该屏的按钮形态没被上面任何一条接住 —— 只可能是新加了步骤
     却忘了在 navBar 里给出路。给一句可见的提示比留一个空 .actions 好：
     空 .actions 会让「下一步」凭空消失，用户以为卡死。 */
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
  /* 唯一硬约束：必须给出一个入口 —— 香型轮盘选了家族，或者用「按感觉选」选了情绪。
     原来只认 family，把 emotion 这条引擎早就支持的入口卡死了
     （scoring.js:151 的两条入口在生产路径上只活了一条）。
     两条都给不出时才回第 1 步：那时引擎确实无从下手，recommend 会 throw。

     v5：第 1 屏变成预算，它不产生任何情绪信息。所以兜底不再是"回第 1 屏"
     （弹到预算屏，用户改完预算仍然没有入口，会原地打转），而是送到气质屏 ——
     那一屏是唯一能独立产出入口的地方（七个原型各自映射到情绪）。 */
  if (!state.answers.family && !state.answers.emotion && !state.answers.characterPreset) {
    const list = curSteps();
    const moodIdx = list.findIndex((s) => s.id === 'mood');
    state.step = moodIdx >= 0 ? moodIdx : 0;
    render();
    return;
  }
  // 库还没到时，这里会等它下完 —— 只有「全答完、但库仍在下载」才会卡到这。
  // 等待期间必须给出可见反馈：按钮换成进度文案并禁用，否则用户会连点几次。
  const busy = setBusy(btn, '正在比对…');
  try {
    const d = await ensurePerfumes();
    /* 实物图清单在 boot 里就预热了，这里再等一次只是保证
       「有图就用图」这条判断在首帧就成立 —— 不等的话第一帧可能先画
       瓶形、下一帧才换图，视觉上是闪一下。它只有几百字节，
       而且通常早已在缓存里。失败不影响结果页。 */
    await ensurePhotos().catch(() => {});
    /* 价签表同理：预算屏的瓶数读数与候选池都挂在它上面。
       首屏就开始预热（见 boot），这里是兜底。失败不阻断。 */
    await ensurePriceBands().catch(() => {});
    recomputeResults(d.perfumes);
    state.step = curSteps().length;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    busy(false);
  }
}

/* 重算结果。抽成函数是因为「换一批」与「改一题重推」都要复用它，
   而 finish() 还要负责按钮忙碌态与滚动 —— 两件事分开，避免换一批时
   把页面滚回顶部（用户正在看第 2 批，滚回去等于走丢）。

   topN = 12 而不是 3：规格要求结果页给「换一批」，topN=3 时只有一批，
   翻不动。12 瓶按 3 瓶一批分 4 批（每批仍是"三瓶分属不同家族"）。
   引擎本来就支持 topN 参数，多样性去重逻辑对 12 瓶同样生效。
   已知代价：topN>3 时原始分不保证单调递减（docs/QUESTIONNAIRE-VALUE-20261109.md
   已记录），但界面不显示原始分、只显示匹配度，故不暴露。 */
function recomputeResults(perfumes) {
  const pool = budgetPool(perfumes) || perfumes;
  /* 记下池子有多大：结果页要写「从 N 瓶里挑」，这个数必须是真的
     （用户选了预算之后，池子不再是 1388）。 */
  state.poolSize = pool.length;
  state.poolFiltered = pool.length < perfumes.length;
  state.result = recommend(state.answers, pool, TAX, { topN: 12 });
  state.batch = 0;
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
  state.answers = {
    family: null, subfamily: null, emotion: null, occasion: null, intensity: 3,
    /* v5：预算必须一起清。漏了它，用户点「重新来一次」发现第一步还停在上次的
       档位，会以为重开没生效 —— 而预算是最该"重开会清掉"的一维
       （它是范围，不是个性偏好）。 */
    budget: null,
    likedNotes: [], dislikedNotes: [], likedZh: {}, dislikedZh: {},
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
  /* 批次与池子大小一起清。留着上一轮的第 3 批，重开后会直接看到"第 3 批"，
     而上一轮只有 2 批 —— 那是空屏。 */
  state.batch = 0;
  state.poolSize = 0;
  state.poolFiltered = false;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- 携带的标本签（呼应装置）----------
   把已答的各题压成一行小签，跟用户走完后半程。返回值 null 表示一枚都没有
   （刚进第 1 屏时）—— 那时整行不渲染，不留一条空带子。

   为什么只在这里读 state 而不各自维护 DOM：这些签是**别处的答案的副本**，
   任何一屏改了答案都必须跟着变。让它每次 render() 重算，是唯一不会分叉的做法。

   刻意不写"已答 2 / 5"这种计数：进度条已经给过这个数了，再给一遍是重复；
   这一行的作用是让人看见**内容**（300 以内 · 上班 · 干净），不是又一个进度。 */
function renderCarriedTags() {
  const a = state.answers;
  const items = [];
  const push = (label, zh) => { if (zh) items.push(el('span', { class: 'carry-tag' },
    el('b', {}, label), zh)); };

  const budget = BUDGET_OPTS.find((b) => b.id === a.budget);
  if (budget && budget.id !== 'any') push('预算', budget.zh);

  const occ = (TAX?.occasionMap || []).find((x) => x.id === a.occasion);
  if (occ) push('场合', occ.zh);

  const mood = CHARACTER_PRESET.find((c) => c.id === a.characterPreset);
  if (mood) push('气质', mood.zh);

  const season = SEASONS.find((s) => s.id === a.season);
  if (season) push('季节', season.zh + '季');

  if (a.concentration) {
    const c = CONCENTRATIONS.find((x) => x.id === a.concentration);
    if (c) push('浓淡', c.zh.split(' ')[0]);
  }

  if (!items.length) return null;
  return el('div', { class: 'carry-row', 'aria-label': '你已经答过的' },
    el('span', { class: 'carry-lead' }, '带着走'),
    ...items);
}

/* 只重画那一行签条，不整屏重绘。
   为什么需要它：有几屏的选中是"就地改状态"（圆盘的 onPick、量尺的 click），
   它们刻意不调 render()（重绘会重播转场、让盘心闪一下、让滑块失焦）。
   于是头部那行签条不会自己更新 —— 用户在这一屏答完，签条仍停在上一次渲染时
   的样子，读起来像"这一题没记住"。 */
function refreshCarriedTags() {
  const old = document.querySelector('.carry-row');
  const next = renderCarriedTags();
  if (old && old.parentNode) {
    if (next) old.parentNode.replaceChild(next, old);
    else old.parentNode.removeChild(old);
    return;
  }
  /* 原来没有这一行（答第一屏时它是空的）而现在有了：插到进度条之后。 */
  if (next) {
    const prog = document.querySelector('.progress');
    if (prog && prog.parentNode) prog.parentNode.insertBefore(next, prog.nextSibling);
  }
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
        : '不用懂前中后调。转盘选香型，再定场合和浓度，换三个具体到型号的候选'
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
  const { profile, results: all12 } = state.result;
  /* v5：结果页一次算 12 瓶、分 4 批看。这里切出当前这一批 ——
     后续所有渲染（三张卡、摘要卡、页码）都基于它，不能再读 results。 */
  const PER_BATCH = 3;
  const totalBatches = Math.max(1, Math.ceil(all12.length / PER_BATCH));
  const batch = Math.min(state.batch || 0, totalBatches - 1);
  const results = all12.slice(batch * PER_BATCH, batch * PER_BATCH + PER_BATCH);

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

  /* 预算范围声明。它不是推荐依据（不进打分），所以放在标题行里当**范围**讲，
     而不是当成一条理由。选了具体档时还要写清"这 3 瓶来自多大的池子"——
     用户看到"从 637 瓶里挑"和"从 1388 瓶里挑"，对结论的信心是不同的。 */
  {
    const bid = state.answers.budget;
    const opt = BUDGET_OPTS.find((b) => b.id === bid);
    if (opt && opt.id !== 'any' && state.poolFiltered) {
      head.appendChild(el('p', { class: 'scope-line' },
        el('strong', {}, `只在「${opt.zh}」这一段里挑`),
        `　这一档有 ${state.poolSize || 0} 瓶带价签的参与打分；`
        + '其余瓶我们不知道价钱，没有算进来（选「不限」时它们会回来）'
      ));
    } else if (opt && opt.id !== 'any') {
      /* 选了档但池子没缩小 —— 只可能是价签表没到或这一档不够 3 瓶。
         必须说出来，否则用户以为自己的预算被无视了。 */
      head.appendChild(el('p', { class: 'scope-line is-warn' },
        el('strong', {}, `「${opt.zh}」这一段没凑够 3 瓶`),
        '　已放宽到全库挑，预算没有生效。换一档或者选「不限」会更准'
      ));
    }
  }
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
      /* 这里的瓶数必须是真的池子大小。写死 1388 而用户选了 300 以内时，
         摘要卡会宣称"从 1388 瓶里选"，而实际只看了 161 瓶 —— 截图发出去
         就是一句假话，且它恰好是最容易被别人核对的那句话。 */
      `从 ${state.poolSize || (DATA?.perfumes?.length || 1388)} 瓶里按规则打分选出，选品不调用大模型`
    ));
    wrap.appendChild(card);
  }

  /* ---------- 两个出口（v5 规格明令：不许只能从头再来）----------
     ① 换一批 —— 同一份答案上翻到下一批三瓶。12 瓶分 4 批，取完回第一批。
        为什么不重新抽：重抽会改答案与结果的对应关系，用户没法比较"同一份
        回答下还有什么别的选择"，而那正是他想知道的。
     ② 改一题重推 —— 列出全部屏，点哪屏回哪屏；改完按「看推荐」重算，
        **其余答案保留**。旧版只有「重新来一次」（清空全部），改一题等于重答五题。

     两者都不是"重来"，所以都不清 state.answers。清空仍然保留在后面，
     但降级成一个次要的文字入口 —— 它是真的需要时才用的重开。 */
  const outlets = el('div', { class: 'result-outlets' });

  /* ① 换一批。只有一批时（结果不足 4 瓶）不画按钮，改画一句为什么：
     一个点了没反应的按钮比不给更糟。 */
  if (totalBatches > 1) {
    const isLast = batch >= totalBatches - 1;
    outlets.appendChild(el('div', { class: 'outlet-row' },
      el('button', {
        class: 'btn', type: 'button',
        onclick: () => {
          state.batch = isLast ? 0 : batch + 1;
          render();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
      }, isLast ? '↺ 回到第一批' : '换一批 →'),
      el('span', { class: 'outlet-meta' },
        `第 ${batch + 1} / ${totalBatches} 批 · 一共 ${all12.length} 瓶候选`)
    ));
  } else {
    outlets.appendChild(el('p', { class: 'outlet-note' },
      '这次只凑出这一批候选，没有更多可换的了 —— 放宽预算或者少答一题，池子会变大'));
  }

  /* ② 改一题重推。每一屏一行，写清"你现在这题答了什么"，
     这样用户扫一眼就知道该改哪一题，不必逐屏点进去找。 */
  {
    const list = curSteps();
    const box = el('div', { class: 'outlet-row outlet-row-col' });
    box.appendChild(el('span', { class: 'chips-label' }, '② 改一题，重新推一次（其余答案保留）'));
    const grid = el('div', { class: 'outlet-jump', role: 'group', 'aria-label': '回到某一题' });
    list.forEach((st, idx) => {
      grid.appendChild(el('button', {
        class: 'outlet-jump-item', type: 'button',
        'data-jump': st.id,
        onclick: () => {
          state.step = idx;
          /* 不清 state.result：用户在结果页与题目之间来回时，
             回退一下不改答案，原来的结果仍然有效。只有真的改答案
             （各屏的 onPick）才会在下次 finish 时被覆盖。 */
          render();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
      },
        el('span', { class: 'jump-short' }, st.short || st.id),
        el('span', { class: 'jump-answer' }, answerDigestOf(st.id))
      ));
    });
    box.appendChild(grid);
    outlets.appendChild(box);
  }

  outlets.appendChild(el('div', { class: 'outlet-row outlet-row-end' },
    el('button', { class: 'btn ghost', type: 'button', onclick: restart }, '全部重答'),
    el('span', { class: 'outlet-meta' }, '会清空所有答案，回到第一题')
  ));
  wrap.appendChild(outlets);

  return wrap;
}

/* 结果页「改一题」列表里每一项右侧那句"你答了什么"。
   必须回显**真实答案**：只写题目标签的话，五个入口长得一样，
   用户得逐个点进去才知道哪一题要改。返回 '未答' 而不是空串 ——
   空着像还没加载完。 */
function answerDigestOf(stepId) {
  const a = state.answers;
  const zhOfBudget = () => {
    const o = BUDGET_OPTS.find((b) => b.id === a.budget);
    return o ? o.zh : '未答（=不限）';
  };
  switch (stepId) {
    case 'budget': return zhOfBudget();
    case 'occasion': {
      const o = (TAX.occasionMap || []).find((x) => x.id === a.occasion);
      return o ? o.zh : '未答';
    }
    case 'mood': {
      const c = CHARACTER_PRESET.find((x) => x.id === a.characterPreset);
      return c ? c.zh : '未答';
    }
    case 'season': {
      const s = SEASONS.find((x) => x.id === a.season);
      return s ? s.zh + '季' : '未答';
    }
    case 'concentration': {
      const c = CONCENTRATIONS.find((x) => x.id === a.concentration);
      const bits = [`${a.intensity || 3}/5`];
      if (c) bits.push(c.zh.split(' ')[0]);
      return bits.join(' · ');
    }
    case 'anchor': {
      if (a.anchorPerfume) {
        const p = (DATA?.perfumes || []).find((x) => x.id === a.anchorPerfume);
        return p ? p.name : '已选一瓶';
      }
      return a.anchorBrand ? a.anchorBrand + '（未选具体那瓶）' : '未填';
    }
    default: return '未答';
  }
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
       settle 下沉 8px 淡入   —— 转换阶段的屏（首屏 / 气质 / 排除 / 结果）
       一屏一问之后，块的划分跟着新的步骤表走：
       香调两屏与场景两屏都是连续作答，给 cut；入口式与收束式的屏给 settle。 */
  const SCENE = {
    family: 'settle',
    likedNotes: 'cut',
    dislikedNotes: 'cut',
    mood: 'settle',
    occasion: 'cut',
    season: 'cut',
    /* 2026-11-11：intensity 与 concentration 合屏后只剩后者一个 id。
       保留 'concentration' 的 cut —— 它仍是连续作答的一屏；
       旧的 'intensity' 键随步骤一起删掉，留着会被读成"还有一屏没拆完"。 */
    concentration: 'cut',
    dislikedFamilies: 'settle',
    anchor: 'cut',
  };
  const list = curSteps();
  /* 越界保护（防御性，2026-11-09）。
     入口切换会让步骤表在 7 与 6 之间变化，理论上 `state.step` 可能落在新表之外。
     我核过当前 UI：改动入口的两个控件（家族轮盘、按感觉选的分段控件）都只在
     第 1 屏渲染，所以切换时 `state.step` 恒为 0，**当前一条实际可达路径都没有**。
     留着是为了让「容器长度与下标」这对不变量有兜底，将来把入口搬到别的屏也不会炸。
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

  app.innerHTML = '';
  app.appendChild(renderMasthead());
  app.appendChild(renderProgress());
  /* 标本签（呼应装置）：用户答过的每一项做成一行小签，跟着走完后半程。
     规格第 3 条说呼应是"点缀，不是贯穿装置"——所以它不占独立一块版面，
     只是进度条下面一行 12px 的签条，答过几项就有几枚，答第一屏时它是空的、
     整行不渲染。它承担的是**叙事上的回响**：翻到最后一屏时看得见
     "我这一路挑了这些"，而不只是个 3/5 的进度数字。 */
  if (!isResult) {
    const tags = renderCarriedTags();
    if (tags) app.appendChild(tags);
  }
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
    /* v5：价签表（18 KB）。预算屏是**第 1 屏**，它的读数与候选池都挂在这张表上，
       所以不能等到结果页才读 —— 不预热的话第一屏的"这一段有几瓶"永远是"—"。
       它比 taxonomy 还小，与香水库并行不抢带宽。 */
    ensurePriceBands().catch(() => {});
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
    /* v5：测试要验「选了气质就写出情绪入口」这条接线。
       它是本轮最要紧的一条隐式约定 —— 删掉香型轮盘之后，情绪是引擎唯一的
       入口来源；这条断掉时页面不会报错，只会在点「看推荐」时 throw。
       所以必须能在测试里直接读它。 */
    a.__emotion = () => state.answers.emotion;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
}
