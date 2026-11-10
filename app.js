
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
     7 intensity         浓淡
     8 concentration     浓度
     9 dislikedFamilies  整族排除（仅情绪入口）
    10 anchor            已知款

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
    id: 'family',
    short: '香型',
    title: '你闻着舒服的，是哪一类味道？',
    help: '不用记名字。外圈挑大方向，中圈再收窄一层；不确定就只选外圈',
    render: renderFamily,
  },
  {
    id: 'likedNotes',
    short: '想要',
    title: '有没有特别想闻到的味道？',
    help: '点名具体香材比挑大方向更准。一个都想不起来就跳过——后面还有别的维度',
    render: renderLikedNotes,
  },
  {
    id: 'dislikedNotes',
    short: '受不了',
    title: '有没有完全受不了的味道？',
    help: '这一题比上一题更有效：讨厌的东西没有替代品，喜欢的往往有。想不起来就跳过',
    render: renderDislikedNotes,
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
    help: '主战场决定浓度下限。选一个最像的，拿不准就选日常',
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
    id: 'intensity',
    short: '浓淡',
    title: '想要多浓？',
    help: '浓淡是你想要的体感，不是香精占比 —— 那是下一题',
    render: renderIntensity,
  },
  {
    id: 'concentration',
    short: '浓度',
    title: '偏好哪种浓度？',
    help: '浓度是香精占比，决定大概能留多久。不确定就选日常最常见的淡香精',
    render: renderConcentration,
  },
  {
    id: 'dislikedFamilies',
    short: '排除',
    title: '有没有哪一类你完全不想要？',
    help: '整族划掉。比逐个香调排除更粗，但更快——不想再看到木质就整族关掉',
    render: renderDislikedFamilies,
    /* 只在**情绪入口**下出现，理由见本节顶部注释。 */
    when: (a) => !a.family,
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

/* 当前生效的步骤表。STEPS 是全集，带 when() 的项按答案动态出现：
   「整族排除」只在情绪入口下有意义（实测家族入口 0/30，见该步骤定义处的注释）。
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
     用户能数出「这是被切成几份的东西」。纯 SVG 直线，不参与命中。 */
  const TICK_N = 36;
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
      el('span', { class: 'zh' }, f.zh),
      el('span', { class: 'notes' }, (f.representativeNotes || []).slice(0, 2).map((e) => noteZhOf(e)).join('·'))
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

/* ---------- 第 10 步：整族排除 ----------
   比逐个香调排除更快，也更符合直觉：「我不想要木质」是一句话，
   而「我不要雪松、不要檀木、不要香根草…」是七次点击。
   惩罚用 -30（轻于单个香调的 -40）：整族排除确实更含糊，
   而且只在该族是这瓶的**主族**时才罚 ——「带一点雪松的柑橘」不该被误伤。 */
function renderDislikedFamilies() {
  const wrap = el('div', { class: 'fade-in' });
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, stepHead('dislikedFamilies').kicker),
    el('h2', { class: 'q-title' }, stepHead('dislikedFamilies').title),
    el('p', { class: 'q-help' }, stepHead('dislikedFamilies').help)
  ));

  /* 「可多选」必须写出来。
     这一屏是全场唯一的多选卡片组，但视觉上与第 3/4/5 步的单选卡片组一模一样
     （同一套 .choice / .choice-grid）。此前只有 aria-pressed 表达多选，
     读屏能读出"已按下/未按下"，眼睛看到的却是"这些卡只能选一个"。
     补一行组标题，同时给容器补 aria-multiselectable 让语义与视觉对齐。 */
  wrap.appendChild(el('div', { class: 'chips-label' }, '① 完全不想要的（可多选，也可以一个都不选）'));
  const box = el('div', { class: 'choice-grid', role: 'group', 'aria-multiselectable': 'true' });
  (TAX.families || []).forEach((f) => {
    const on = (state.answers.dislikedFamilies || []).includes(f.id);
    const b = el('button', {
      class: 'choice choice-neg' + (on ? ' is-on' : ''),
      type: 'button',
      'aria-pressed': String(on),
      onclick: () => {
        const arr = state.answers.dislikedFamilies || (state.answers.dislikedFamilies = []);
        const i = arr.indexOf(f.id);
        if (i >= 0) arr.splice(i, 1); else arr.push(f.id);
        const now = arr.includes(f.id);
        b.classList.toggle('is-on', now);
        b.setAttribute('aria-pressed', String(now));
      },
    },
      el('span', { class: 'choice-zh' }, f.zh),
      el('span', { class: 'choice-desc' }, f.oneLine || '')
    );
    box.appendChild(b);
  });
  wrap.appendChild(box);

  /* ② 已经点名排掉的香材 —— 只读回顾，不是第二个问题。
     第 2 步的「完全受不了」两栏在九十秒前答过，到这一屏用户通常已经忘了
     自己点过哪几个。不回顾的话，他在这里整族关掉「木质」，却忘了自己刚
     点名受不了 cedarwood（那本来已经在 -40 里），会以为系统漏听了。
     刻意不用 .choice / .choice-grid：这一屏的 .choice-grid 必须只有上面
     那一组多选（scripts/test-render.mjs:998 取的是第一个 .choice-grid），
     而且这也不是一组可点的东西。 */
  const negNotes = state.answers.dislikedNotes || [];
  if (negNotes.length) {
    const zhOf = (en) => state.answers.dislikedZh?.[en] || en;
    /* 不用新 class：styles*.css 不在本席位的写范围，凭空造一个
       .note-review 只会得到一排无样式裸文字。这里复用既有 .term-note，
       把名单拼成一句 —— 它本来就允许长句 + strong 起头。 */
    wrap.appendChild(el('div', { class: 'term-note' },
      el('strong', {}, `② 你在第 2 步已排掉 ${negNotes.length} 种：`),
      ' ' + negNotes.map(zhOf).join('、'),
      ' —— 这些已经各自扣过 -40，这里不用再关一遍。想加回来，回第 2 步「受不了的」那一栏取消勾选'
    ));
  }

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '可以一个都不选：'),
    ' 这里是「整族关掉」。只想排除具体几种香材的话，回第 2 步「受不了的」那一栏逐个点名更准。',
    '两者可以同时用：整族排除管大方向，点名香材管精确的那几种。'
  ));

  wrap.appendChild(navBar('dislikedFamilies'));
  return wrap;
}

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
   合并屏 1：香调点名（第 2 步）
   ------------------------------------------------------------
   原来拆成两屏（喜欢 / 讨厌），理由是"两栏各 40 个 chip，滚到下面忘了
   上面勾了什么"。合并靠三件事解决，而不是靠拆屏：
     ① 每栏只给 16 个常用 + 「展开全部」折叠（沿用原实现）；
     ② 每栏一枚「已选 N」计数，勾了立刻看得见；
     ③ **已勾选的 chip 置顶**——这条是本次新加的，也是合并能成立的关键。
        没有它，合并只是把两个问题塞回一屏。
   ============================================================ */
const NOTE_PEEK = 16;

/* ============================================================
   一屏一问（2026-11-10）：香调拆成「想要」与「受不了」两屏
   ------------------------------------------------------------
   原来两栏同屏，唯一的复杂度是**跨栏互斥**：勾了左边要把右边同名项移除，
   而右边那栏的 DOM 不会自动知道，必须显式重画。
   拆开之后两栏永不同时存在，那段同步代码整块删掉 —— 少一处能出错的耦合。

   两屏共用一个渲染器：差别只有 key / 标题 / 语气 / 候选顺序。
   不写两个几乎相同的函数，否则下一次改 chip 行为要改两遍、且必然漏一处。
   ============================================================ */
function renderNotePicker(kind) {
  const neg = kind === 'disliked';
  const key = neg ? 'dislikedNotes' : 'likedNotes';
  const zhKey = neg ? 'dislikedZh' : 'likedZh';
  const stepId = neg ? 'dislikedNotes' : 'likedNotes';

  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead(stepId);
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  if (!DATA?.perfumes?.length) {
    ensurePerfumes()
      .then(() => { if (curSteps()[state.step]?.id === stepId) render(); })
      .catch((err) => { wrap.appendChild(el('p', { class: 'q-help' }, `香调表加载失败：${err.message}`)); });
    wrap.appendChild(el('div', { class: 'skeleton' },
      el('div', { class: 'skeleton-ring' }),
      el('p', { class: 'skeleton-note' }, '正在读取香水库……')
    ));
    wrap.appendChild(navBar(stepId));
    return wrap;
  }

  const usable = getUsableNotes();
  /* 候选顺序：`getUsableNotes()` 按家族轮转排，前 16 个只覆盖 3 个家族。
     讨厌那一屏取**尾部** 16 个 —— 否则两屏首屏内容几乎一样，
     而「讨厌」这一屏最常被点的是 gourmand / amber 里的甜腻项。 */
  const source = neg ? [...usable].reverse() : usable;

  const col = el('div', { class: 'note-col' });
  const headRow = el('div', { class: 'note-col-head' });
  const badge = el('span', { class: 'note-count' });
  headRow.append(
    el('span', { class: 'chips-label', style: 'margin:0' },
      neg ? '我受不了这些味道' : '我喜欢这些味道'),
    badge
  );
  col.appendChild(headRow);

  const box = el('div', { class: 'chips' });
  const moreBox = el('div', { class: 'chips', style: 'margin-top:8px;display:none' });
  let expanded = false;

  const chipOf = (n) => {
    const on = state.answers[key].includes(n.en);
    /* onclick 是箭头函数，没有自己的 this —— 用闭包变量持有节点本身。 */
    let chipEl = null;
    const node = el('button', {
      class: 'chip' + (neg && on ? ' neg' : ''),
      type: 'button',
      'data-col': neg ? 'disliked' : 'liked',
      'data-en': n.en,
      'aria-pressed': String(on),
      onclick: () => {
        const arr = state.answers[key];
        const otherKey = neg ? 'likedNotes' : 'dislikedNotes';
        const otherZhKey = neg ? 'likedZh' : 'dislikedZh';
        const idx = arr.indexOf(n.en);
        if (idx >= 0) {
          arr.splice(idx, 1);
          delete state.answers[zhKey][n.en];
        } else {
          arr.push(n.en);
          state.answers[zhKey][n.en] = n.zh;
          /* 同一香调不能既喜欢又讨厌（D41）。两屏分开后这条约束仍要守 ——
             用户可能在第 2 屏点了「香草」，再在第 3 屏把它点进「受不了」。
             现在只从另一栏移除，不再需要重画另一栏的 DOM（它不在这一屏上）。 */
          const oi = state.answers[otherKey].indexOf(n.en);
          if (oi >= 0) { state.answers[otherKey].splice(oi, 1); delete state.answers[otherZhKey][n.en]; }
        }
        /* 就地更新，不重建整栏：重建会丢掉被点节点的焦点，键盘用户点一次就得重 Tab。 */
        const now = idx < 0;
        if (chipEl) {
          chipEl.setAttribute('aria-pressed', String(now));
          chipEl.classList.toggle('neg', neg && now);
          if (now) box.insertBefore(chipEl, box.firstChild);
        }
        const cnt = state.answers[key].length;
        badge.textContent = cnt ? `已选 ${cnt}` : '未选';
        badge.classList.toggle('is-on', cnt > 0);
      },
    }, n.zh);
    chipEl = node;
    return node;
  };

  const redraw = () => {
    const sel = state.answers[key];
    /* 已选置顶，未选保持 source 顺序 —— 每次全部重排会让刚点的那个跳走。 */
    const ordered = [
      ...sel.map((en) => usable.find((u) => u.en === en)).filter(Boolean),
      ...source.filter((u) => !sel.includes(u.en)),
    ];
    const peek = expanded ? ordered : ordered.slice(0, NOTE_PEEK);
    const rest = expanded ? [] : ordered.slice(NOTE_PEEK);
    box.innerHTML = '';
    peek.forEach((n) => box.appendChild(chipOf(n)));
    moreBox.innerHTML = '';
    rest.forEach((n) => moreBox.appendChild(chipOf(n)));
    badge.textContent = sel.length ? `已选 ${sel.length}` : '未选';
    badge.classList.toggle('is-on', sel.length > 0);
  };

  const moreBtn = el('button', {
    type: 'button',
    class: 'btn ghost btn-more',
    onclick: () => {
      expanded = !expanded;
      moreBox.style.display = expanded ? 'flex' : 'none';
      moreBtn.textContent = expanded ? '收起' : `展开全部 ${usable.length} 个香调`;
      redraw();
    },
  }, `展开全部 ${usable.length} 个香调`);

  col.append(box, moreBox, moreBtn);
  redraw();
  wrap.appendChild(col);

  /* 说明随屏变化。两句都不是装饰 —— 实测里"跳过"与"必须答"两种误解都出现过。 */
  {
    const all = curSteps();
    const idx = all.findIndex((st) => st.id === stepId);
    const rest = idx >= 0 ? all.length - idx - 1 : 0;
    wrap.appendChild(el('div', { class: 'term-note' },
      neg
        ? el('strong', {}, '这一题比上一题更有效：')
        : el('strong', {}, '想不起来也没关系：'),
      neg
        ? ' 讨厌的东西没有替代品，喜欢的东西往往能找到几个相似的 —— 排除一项，比多喜欢一项更能收窄范围。'
        : ` 跳过这一屏，后面还有 ${rest} 屏在问别的维度。`,
      neg
        ? ''
        : ' 但如果你能想起一个明确想闻到的（比如"我想要柠檬"），命中率会明显提高。'
    ));
  }

  wrap.appendChild(navBar(stepId));
  return wrap;
}

function renderLikedNotes() { return renderNotePicker('liked'); }
function renderDislikedNotes() { return renderNotePicker('disliked'); }

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
     这里改成真正有信息的那句：这些原型**不是**香调名，别拿它当第二个轮盘。 */
  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '这七个不是香调：'),
    ' 「雨后林地」「焦糖琥珀」是气味给人的感觉，不挂在任何单一香调上。',
    ' 同一瓶花香可以清冷，也可以甜腻。'
  ));

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

  wrap.appendChild(el('div', { class: 'chips-label' }, '整体气质（选一个）'));
  if (suggestNote) wrap.appendChild(suggestNote);
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
    }
  ));

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
function renderOccasion() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('occasion');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  wrap.appendChild(buildDisc(TAX.occasionMap, {
    label: '主要使用场合',
    selectedId: state.answers.occasion,
    onPick: (o) => { state.answers.occasion = o.id; },
  }));

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '为什么先问场合：'),
    ' 场合决定浓度下限与时段。同一瓶香水在通勤和约会里的宽容度差得很远，'
    + ' 这一项比"你觉得自己喜欢什么"更稳定。'
  ));

  wrap.appendChild(navBar('occasion'));
  return wrap;
}

/* ============================================================
   第 6 屏：季节（原「场景」屏拆出的后半）
   ------------------------------------------------------------
   季节用分段控件而不是卡片网格：4 个有序等长短词正是分段控件的语义场景。
   卡片网格（无序语法）在这里会误导成"4 个并列选择"。
   ============================================================ */
function renderSeason() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('season');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  const seasonOpts = SEASONS;
  let seasonHint = null;
  wrap.appendChild(segControl(seasonOpts, state.answers.season, (id) => {
    state.answers.season = id;
  }, '主季节', (id) => updateSegHint(seasonHint, seasonOpts, id)));

  /* 未选时不能用 segHint 的默认行为：它会把第一项（春）那句解释当成"当前值"
     显示出来，配上 is-idle 的降级透明度，读起来像「你选了春，只是没高亮」。
     未选时说一句真正的指引，选中后才换成该季解释。 */
  seasonHint = segHint(seasonOpts, state.answers.season);
  if (state.answers.season == null) {
    seasonHint.textContent = '按你打算主要在哪个季节用选一个；不确定就跳过，不答不扣分。';
  }
  wrap.appendChild(seasonHint);

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
   第 7 屏：浓淡（原「浓淡持久」屏拆出的前半）
   ------------------------------------------------------------
   只有滑块一问了。原来同屏还有浓度与留香，三问都在说"多浓"，
   但前两问测的是两件不同的事（体感 vs 香精占比），拆开才说得清。
   ============================================================ */
function renderIntensity() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('intensity');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

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
    oninput: (ev) => { state.answers.intensity = Number(ev.target.value); updateRead(); },
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

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '浓淡与浓度的区别：'),
    ' 这一题问的是你想让别人闻到多重的分量（体感），下一题问的是香精占比（配方）。'
    + ' 两者不完全同步 —— 有清淡的香精，也有呛人的淡香水，所以分成两题问。'
  ));

  wrap.appendChild(navBar('intensity'));
  return wrap;
}

/* ============================================================
   第 8 屏：浓度（原「浓淡持久」屏拆出的后半）
   ------------------------------------------------------------
   浓度档 + 由浓度推断的留香（纯展示）。留香**不参与打分**
   （见 src/scoring.js 8c 段：同浓度下全库等加，对排序零贡献），
   所以这里不用可改控件 —— 能改但不影响结果比不给更糟。
   浓度与浓淡打架时只提醒、不替用户改：它们测的确实是两件事。
   ============================================================ */
function renderConcentration() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('concentration');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  wrap.appendChild(choiceGrid(CONCENTRATIONS, state.answers.concentration, (id) => {
    state.answers.concentration = id;
    /* 联动：选完浓度就把留香填成推断值，下面那一行的展示要跟着变，
       所以重画整屏 —— 这一屏没有滚动长列表，重绘不会让用户丢失位置。 */
    const inferred = CONC_TO_LONGEVITY[id];
    if (inferred != null) state.answers.longevity = inferred;
    render();
  }));

  /* 浓度与浓淡打架时提醒一句。阈值取 2 档：差 1 档是常态，说了等于每屏都挂废话。 */
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
          el('strong', {}, '和上一题的浓淡差得有点远：'),
          ` 你要的是 ${want}/5（${INTENSITY_LABEL[want][0]}），但选了${concZh}。`,
          ' 浓淡是体感、浓度是香精占比，两者不完全同步 —— 真想要那个体感，',
          ' 回头把浓淡调回中间档更稳妥；不改也能出结果，只是候选会少一些。'
        ));
      }
    }
  }

  /* 留香：由浓度推算，纯展示。老存档里可能带着手动值，一并显示。 */
  const curLong = state.answers.longevity;
  const shownLong = curLong == null ? null : String(curLong);
  wrap.appendChild(el('div', { class: 'chips-label', style: 'margin-top:16px' },
    '大概能留多久' + (shownLong == null ? '（选浓度后自动给出）' : '（由浓度推断）')));

  const longBox = el('div', { class: 'long-read' + (shownLong == null ? ' is-empty' : '') });
  if (shownLong == null) {
    longBox.appendChild(el('span', { class: 'long-val is-empty' }, '先选上面的浓度'));
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
    ' 上面那一档是按浓度推算的，不是实测 —— 同一瓶在干皮和油皮、冬天和夏天差别可以很大，',
    '所以它不参与打分。想要留得久，选高一点的浓度就是同一个动作。'
  ));

  wrap.appendChild(navBar('concentration'));
  return wrap;
}

function renderStrength() {
  /* 兼容层：旧 id `strength` 已拆成 intensity / concentration。
     SCENE 表里还有引用，正常渲染路径不会再走到它。 */
  return renderIntensity();
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
     「想要」是可选加分，「受不了」是更有效的排除，两句不能说反。 */
  if (stepId === 'likedNotes') {
    bar.appendChild(el('span', { class: 'hint' }, '一个都不选也能继续'));
    bar.appendChild(el('button', { class: 'btn', type: 'button', onclick: next }, '下一步 →'));
    return bar;
  }
  if (stepId === 'dislikedNotes') {
    bar.appendChild(el('span', { class: 'hint' }, '这一题最值得花时间，但也可以跳过'));
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
      || stepId === 'intensity' || stepId === 'concentration') {
    bar.appendChild(el('span', { class: 'hint' }, '不选也能继续'));
    bar.appendChild(el('button', { class: 'btn', type: 'button', onclick: next }, '下一步 →'));
    return bar;
  }

  /* 季节与整族排除：两项都允许"一个都不选"，所以按钮永远可点。 */
  /* 锚点屏：永远可点（它是可跳过的），且是最后一屏，按钮直接出结果。 */
  if (stepId === 'anchor') {
    bar.appendChild(el('span', { class: 'hint' }, '不填也能看结果'));
    bar.appendChild(el('button', {
      class: 'btn', type: 'button', onclick: (ev) => finish(ev.currentTarget),
    }, '看推荐 →'));
    return bar;
  }

  if (stepId === 'dislikedFamilies') {
    bar.appendChild(el('span', { class: 'hint' }, '不选也能继续'));
    bar.appendChild(el('button', { class: 'btn', type: 'button', onclick: next }, '下一步 →'));
    return bar;
  }

  // 情绪和场合点选即自动前进；浓度是滑块，没有"点一下"这个动作，
  // 必须给显式的前进按钮，否则用户会卡在第 3 步。
  if (stepId === 'intensity') {
    bar.appendChild(el('button', {
      class: 'btn', type: 'button', onclick: next,
    }, '下一步 →'));
  } else {
    bar.appendChild(el('span', { class: 'hint' }, '点选项自动进入下一题'));
  }
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
    state.result = recommend(state.answers, d.perfumes, TAX, { topN: 3 });
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
  state.answers = {
    family: null, subfamily: null, emotion: null, occasion: null, intensity: 3,
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

/* 第 1 名徽标的措辞。抽成纯函数是为了让测试能直接钉住这两句话，
   不必依赖主流程恰好跑到不并列的状态（实测主流程跑出来就是并列，
   徽标为 0，那条断言从未触发过）。 */
function topBadgeText(hasPct) {
  return hasPct ? '最匹配' : '原始分最高';
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
    el('p', {}, '下面三瓶分属不同家族，方便你对比着闻，而不是三瓶一个味道'),
    /* 这一行解释匹配度的口径。v28 改了分母（见 scoring.js 的 G6 注释），
       原来写「规则得分 / 满分」并列出四项权重，读者会自己去心算出
       「52+22+18+14 = 106，那怎么才 60%？」——因为分子不只这四项。
       改成分档说明，并且**在信息不足时**直接说清"这次不算百分比"，
       比挂一个 60% 让人猜要诚实。 */
    el('div', { class: 'profile-line' },
      profile.matchPctShown
        ? `匹配度 = 这瓶在你的回答上拿到的分 ÷ 本次回答理论上能拿到的最高分（共 ${profile.activeDims} 个维度参与）`
        : `这次你只回答了 ${profile.activeDims} 个维度，样本太少，百分比会虚高到 90% 以上 —— 所以这里不给数字，只按原始分排序`)
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
    for (const l of buyLinks) {
      const labelEl = el('span', { class: 'buy-label' }, l.label);
      buyEls.push(el('a', {
        class: 'buy-link'
          + (l.kind === 'direct' ? '' : ' is-search')
          + (l.channel === 'official' ? ' is-official' : ''),
        href: l.href,
        target: '_blank',
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
    wrap.appendChild(art);
  });

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

  wrap.appendChild(el('div', { class: 'actions', style: 'margin-top:36px' },
    el('button', { class: 'btn', type: 'button', onclick: restart }, '重新来一次'),
    el('div', { class: 'spacer' }),
    el('span', { class: 'hint' }, '换一个答案，结果会完全不同')
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
    intensity: 'cut',
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
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
}
