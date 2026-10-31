
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
    temperature: null,          // 'warm' | 'cool' | 'neutral'
    sweetness: null,            // 0..3
    anchorBrand: null,
    anchorPerfume: null,        // perfume.id
    anchorNotes: [],            // 香调 en 列表
    season: null,
    seasonSecond: null,
    concentration: null,
    longevity: null,
    dislikedFamilies: [],
  },
  result: null,
};

let DATA = null;
let TAX = null;

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

/* ---------- 步骤定义 ---------- */
const STEPS = [
  {
    id: 'family',
    short: '香型',
    kicker: '第 1 步',
    title: '你闻着舒服的，是哪一类味道？',
    help: '不用记名字。外圈挑大方向，中圈再收窄一层；不确定就只选外圈',
    render: renderFamily,
  },
  {
    id: 'notes',
    short: '香调',
    kicker: '第 2 步',
    title: '点名具体想闻到的、和完全受不了的味道',
    help: '左边是要的，右边是不要的。排除比加分更有效——讨厌的东西没有替代品，喜欢的往往有',
    render: renderNotesCombined,
  },
  {
    id: 'mood',
    short: '气质',
    kicker: '第 3 步',
    title: '你希望它给人什么感觉？',
    help: '三组都是"感觉"，不是味道本身。可以只答一组，也可以全答',
    render: renderMood,
  },
  {
    id: 'context',
    short: '场景',
    kicker: '第 4 步',
    title: '什么时候用它？',
    help: '主战场决定浓度下限；季节决定它会不会在夏天闷、冬天散太快',
    render: renderContext,
  },
  {
    id: 'strength',
    short: '浓淡',
    kicker: '第 5 步',
    title: '想要多浓、留多久？',
    help: '浓度越高留得越久。留香那一档是按浓度推断的，不是实测值',
    render: renderStrength,
  },
  {
    id: 'dislikedFamilies',
    short: '排除',
    kicker: '第 6 步',
    title: '有没有哪一类你完全不想要？',
    help: '整族划掉。比逐个香调排除更粗，但更快——不想再看到木质就整族关掉',
    render: renderDislikedFamilies,
  },
  {
    id: 'anchor',
    short: '已知款',
    kicker: '第 7 步',
    title: '有没有已经试过、并且喜欢的香水？',
    help: '可跳过。这一屏比前面所有问题都准——直接拿它的香调表去找相似的气味',
    render: renderAnchor,
  },
];

/* 按 step id 取「第 N 步 / 共 M 步」那一行。
   为什么要有这个函数：v19 之前每个 render 里都写 STEPS[5] 这种硬编码下标，
   中间插一屏就全部错位，而且**不报错**，只是编号显示成错的。
   改成按 id 查之后，插入/重排/合并都不用碰这十几处调用点。

   注意它必须定义在 STEPS 之后、所有 render 之前 ——
   本轮合并步骤时，重写 STEPS 的区间正好把它吃掉了，
   页面直接白屏报 "stepHead is not defined"。这类"删代码删掉相邻函数"
   的事故，测试里的 ESM import 会抛错，但浏览器只会显示加载失败，
   两种表现差很远，所以留这条注释。 */
function stepHead(id) {
  const i = STEPS.findIndex((x) => x.id === id);
  const st = STEPS[i] || { kicker: '', title: '', help: '' };
  return {
    kicker: `第 ${i + 1} 步 / 共 ${STEPS.length} 步`,
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
const DISC = { vb: 480, cx: 240, cy: 240, rOut: 230, rIn: 146, gapDeg: 1.6 };

function polar(r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [DISC.cx + r * Math.cos(rad), DISC.cy + r * Math.sin(rad)];
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
  cx: 240,
  cy: 240,
  r1o: 228,
  r1i: 158,   // 外圈：6 个香型家族
  r2o: 152,
  r2i: 106,   // 中圈：所选家族的子家族
  // 盘心取中圈内接正方形：r2i=106 → 106×√2 = 149.9 → 149.9/480 = 31.2%，留余量取 30.6%
  hubPct: 30.6,
};

function wheelPolar(r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [WHEEL.cx + r * Math.cos(rad), WHEEL.cy + r * Math.sin(rad)];
}

function ringPath(rOut, rIn, a0, a1) {
  const [x0o, y0o] = wheelPolar(rOut, a0);
  const [x1o, y1o] = wheelPolar(rOut, a1);
  const [x1i, y1i] = wheelPolar(rIn, a1);
  const [x0i, y0i] = wheelPolar(rIn, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0o.toFixed(2)} ${y0o.toFixed(2)}`
    + ` A ${rOut} ${rOut} 0 ${large} 1 ${x1o.toFixed(2)} ${y1o.toFixed(2)}`
    + ` L ${x1i.toFixed(2)} ${y1i.toFixed(2)}`
    + ` A ${rIn} ${rIn} 0 ${large} 0 ${x0i.toFixed(2)} ${y0i.toFixed(2)} Z`;
}

/** 香材英文名 → 中文，供外圈标签显示典型香材。找不到就退回原文。 */
function noteZhOf(en) {
  const e = TAX && TAX.noteIndex ? TAX.noteIndex.entries.find((x) => normNote(x.en) === normNote(en)) : null;
  return e ? e.zh : String(en);
}

/* 香材剖面标本：把该小类的代表香材画成一枚线稿。
   为什么不用图片：需求明确不要"廉价 AI 图或扒来的劣质素材"。可离线、
   且保证每张质感一致的只有两条路 —— 自己画，或买一套统一授权的摄影。
   后者做不到离线，前者天然一致：同一视框、同一线宽、同一取色。

   为什么只有一枚：实测每个小类的代表香材全部落在同一个家族里
   （白花是茉莉+晚香玉，都是 floral；果味甜是桃+苹果+梨，都是 gourmand）。
   逐味画会出来一排一模一样的图标 —— 那不是示意图，是重复。
   所以图案只编码"家族"，一枚放大；香材名交给下面那行字去说。

   六种母题按家族选形，不按小类硬编码 —— 二十几张手画必然走形，
   而且家族才是这枚图真正想表达的东西。 */
const PLATE_SIZE = 24;
/* ⑤ 统一线宽。原来写死在 CSS 的 .plate-svg 上（.7 viewBox 单位），
   但归一化缩放之后每枚的实际粗细 = .7 × k，k 差 1.61 倍就成了两套粗细。
   → 线宽改成按 1/k 补偿后内联到图元上，这里只留基准值。 */
const PLATE_SW = 0.7;

const r2 = (n) => (Math.round(n * 100) / 100).toString();

/** 六个家族的标本母题。统一 24×24 视框、stroke 1.25、无填充、圆头端点。 */
const PLATE_MOTIFS = {
  // 柑橘横切：外皮 + 中心 + 八根等分瓤线。
  // 四根会读成瞄准镜（与木质撞形），八根才是柑橘断面的密度。
  citrus() {
    const seg = 8;
    const out = [
      { tag: 'circle', attrs: { cx: 12, cy: 12, r: 8 } },
      { tag: 'circle', attrs: { cx: 12, cy: 12, r: 2.6 } },
    ];
    for (let k = 0; k < seg; k++) {
      const a = ((k * 360) / seg - 90) * (Math.PI / 180);
      out.push({
        tag: 'path',
        attrs: {
          d: 'M' + r2(12 + 2.6 * Math.cos(a)) + ' ' + r2(12 + 2.6 * Math.sin(a))
            + 'L' + r2(12 + 8 * Math.cos(a)) + ' ' + r2(12 + 8 * Math.sin(a)),
        },
      });
    }
    return out;
  },
    // 花：同一片花瓣旋转 n 次（n=5 或 6）
  floral() {
    const petals = 5;   // 五瓣：与真实花瓣数一致，也避开六瓣显得像齿轮
    const d = 'M12 12C9.6 9.2 9.6 4.8 12 2.2C14.4 4.8 14.4 9.2 12 12Z';
    const out = [];
    for (let k = 0; k < petals; k++) {
      out.push({
        tag: 'path',
        attrs: k ? { d, transform: 'rotate(' + r2((k * 360) / petals) + ' 12 12)' } : { d },
      });
    }
    out.push({ tag: 'circle', attrs: { cx: 12, cy: 12, r: 1.6 } });
    return out;
  },
  // 木：三道同心**椭圆**年轮。
  // 椭圆而非正圆：树干截面本就不正圆，也避免与柑橘的同心结构撞形。
  // 不加裂纹 —— 24px 里任何不与圈同心的线段都会被读成螺旋的一部分（试过三次）。
  woody() {
    return [
      { tag: 'ellipse', attrs: { cx: 12, cy: 12, rx: 8, ry: 6.9 } },
      { tag: 'ellipse', attrs: { cx: 12, cy: 12, rx: 5.3, ry: 4.55 } },
      { tag: 'ellipse', attrs: { cx: 12, cy: 12, rx: 2.5, ry: 2.15 } },
    ];
  },
    // 树脂滴：水滴轮廓 + 内部一道斜向高光。
  // 上一版是「短弧 + 小圆」，两者挨在一起像一张脸 —— 24px 下任何
  // 两个相邻的圆点都会被读成眼睛。改成一道连续的开口弧，只表达"有体积"。
  amber() {
    return [
      { tag: 'path', attrs: { d: 'M12 3.2C12 3.2 18 9.6 18 13.4A6 6 0 0 1 6 13.4C6 9.6 12 3.2 12 3.2Z' } },
      { tag: 'path', attrs: { d: 'M9.1 14.6A3.1 3.1 0 0 0 12.4 17.4' } },
    ];
  },
  // 叶：主脉 + 三对或四对侧脉
  fresh() {
    const pairs = 3;   // 三对侧脉：四对在 24px 里会黏连
    let d = 'M12 5.4V18.4';
    for (let k = 0; k < pairs; k++) {
      const y = 8.2 + k * 2.6;
      const w = 3.2 - k * 0.35;
      d += 'M12 ' + r2(y) + 'L' + r2(12 - w) + ' ' + r2(y - 1.8)
        + 'M12 ' + r2(y) + 'L' + r2(12 + w) + ' ' + r2(y - 1.8);
    }
    return [
      { tag: 'path', attrs: { d: 'M12 20.2C4.6 16.2 5.4 6.4 12 3.2C18.6 6.4 19.4 16.2 12 20.2Z' } },
      { tag: 'path', attrs: { d } },
    ];
  },
  // 豆荚：斜置椭圆 + 中缝 + 一粒或两粒
  gourmand() {
    const out = [
      { tag: 'ellipse', attrs: { cx: 12, cy: 12, rx: 5.2, ry: 8, transform: 'rotate(-18 12 12)' } },
      { tag: 'path', attrs: { d: 'M12 4V20', transform: 'rotate(-18 12 12)' } },
      { tag: 'circle', attrs: { cx: 10.6, cy: 9.6, r: 1.1 } },
    ];
    out.push({ tag: 'circle', attrs: { cx: 13.4, cy: 14.2, r: 1.1 } });
    return out;
  },
};
/* 每个小类的专属标识（类数以 data/taxonomy.json 为准，现为 28）。
   推翻 D32「图案只编码家族」——用户明确要求「古龙水型用古龙独有标识，
   青绿柑橘与芳香柑橘各自不同」。这个要求是对的：旧做法下同族小类的
   标本图完全一样，用户选完看不出自己选的是哪一格。

   但不是给同一个形状做哈希微差（那种"区别"是凭空造的）。每一枚画的是
   该小类的**代表香材本体**：柠檬是横置尖椭圆，佛手柑是带颈的梨形，
   橙花是五瓣，葡萄柚是正圆厚皮分瓣 —— 区别来自数据，不来自随机数。

   24px 线稿的可辨识度有三条硬限制，是前面几轮试出来的：
     1. 两个相邻的圆点一定被读成一张脸 → 母题里不留并排小圆；
     2. 不与主形同心的线段会被读成螺旋的一部分 → 内部线必须对称或贯穿；
     3. 外轮廓差异 >> 内部细节差异 → 优先换轮廓，内部线不超过两条。

   统一 24×24 视框、无填充、stroke 由 CSS 给（0.7 viewBox 单位）、圆头端点。 */
const SUB_MARKS = {
  /* ---- 柑橘调 ---- */
  // 古龙水型：一瓶古龙水。瓶身 + 瓶颈 + 瓶盖。
  // 整套里唯一的"器物"轮廓，与其余三枚柑橘的果实轮廓不共享任何一截弧。
  cologne: () => [
    { tag: 'path', attrs: { d: 'M6.8 12.4H17.2V18.8C17.2 20.1 16.1 21.2 14.8 21.2H9.2C7.9 21.2 6.8 20.1 6.8 18.8Z' } },
    { tag: 'path', attrs: { d: 'M10.6 12.4V9.6H13.4V12.4' } },
    { tag: 'path', attrs: { d: 'M10.4 9.6H13.6V6.4H10.4Z' } },
  ],
  // 青绿柑橘：一颗青皮圆果 + 顶上一对叶。
  'green-citrus': () => [
    { tag: 'circle', attrs: { cx: 12, cy: 15.4, r: 5.8 } },
    { tag: 'path', attrs: { d: 'M12 9.6C10 8.4 7.6 8.8 6.2 10.6C8.2 11.8 10.4 11.4 12 9.6Z' } },
    { tag: 'path', attrs: { d: 'M12 9.6C14 8.4 16.4 8.8 17.8 10.6C15.8 11.8 13.6 11.4 12 9.6Z' } },
  ],
  // 柑橘花香（橙花）：上花下果，中间一段短梗。橙花长在果枝上 ——
  // 这个「花 + 梗 + 果」的竖向三段是它的识别点。
  'citrus-floral': () => {
    const petal = 'M12 7.6C10.8 5.8 10.8 3.6 12 2.2C13.2 3.6 13.2 5.8 12 7.6Z';
    const out = [];
    for (let k = 0; k < 5; k++) {
      out.push({
        tag: 'path',
        attrs: k ? { d: petal, transform: 'rotate(' + (k * 72) + ' 12 7.6)' } : { d: petal },
      });
    }
    out.push({ tag: 'path', attrs: { d: 'M12 7.8V11.4' } });
    out.push({ tag: 'circle', attrs: { cx: 12, cy: 16.6, r: 5 } });
    return out;
  },
  // 芳香柑橘（佛手柑）：梨形果 + 顶叶 + 果顶的小凹点。整颗佛手柑是梨形的，
  // 与青绿柑橘的正圆、橙花的"花+果"都不共享轮廓。
  'aromatic-citrus': () => [
    { tag: 'path', attrs: { d: 'M12 6.4C13.6 8.6 17.4 10.8 17.4 15.2C17.4 18.8 15 21.4 12 21.4C9 21.4 6.6 18.8 6.6 15.2C6.6 10.8 10.4 8.6 12 6.4Z' } },
    { tag: 'path', attrs: { d: 'M12 6.4C11 4.6 9.6 3.4 7.8 3C7.6 5 8.8 6.6 12 6.4Z' } },
    { tag: 'circle', attrs: { cx: 12, cy: 6.8, r: 0.9 } },
  ],

  /* ---- 花香调 ---- */
  // 玫瑰：五瓣外轮廓（波浪边、无整圆）+ 内部一道螺旋花心。
  // 外轮廓做成起伏的瓣边而不是正圆 —— 正圆会与咖啡豆、檀木截面撞形；
  // 内部螺旋是玫瑰的识别点（它靠"卷"不靠"瓣"）。
  rose: () => {
    const outline = 'M12 3.2C14 3.2 15.1 4.6 16.4 5.2C17.9 5.9 19.6 5.6 20.5 7.1C21.4 8.6 20.6 10.1 20.8 11.7C21 13.3 21.8 14.8 20.9 16.2C20 17.6 18.3 17.4 16.9 18.2C15.6 19 14.6 20.4 12.9 20.6C11.2 20.8 10 19.6 8.4 19.2C6.8 18.8 5.1 19.1 4.2 17.7C3.3 16.3 4.1 14.7 3.9 13.1C3.7 11.5 2.9 10 3.8 8.6C4.7 7.2 6.4 7.4 7.8 6.6C9.1 5.8 10.1 3.2 12 3.2Z';
    return [
      { tag: 'path', attrs: { d: outline } },
      { tag: 'path', attrs: { d: 'M12 12.4C12.5 11.4 13.8 11.3 14.4 12.1C15.2 13 14.8 14.7 13.6 15.3C12.1 16.1 10.1 15.4 9.4 13.8C8.6 11.9 9.4 9.7 11.3 8.8' } },
    ];
  },
  // 白花（茉莉）：五枚细长尖瓣 + 一根下垂花梗 + 一叶。
  // 与单一花在两点上分：瓣更窄、且有梗 —— 茉莉是吊在枝上的。
  'white-floral': () => {
    const petal = 'M12 12.2C10.9 9.6 10.9 6.4 12 4.2C13.1 6.4 13.1 9.6 12 12.2Z';
    const out = [];
    for (let k = 0; k < 5; k++) {
      out.push({
        tag: 'path',
        attrs: k ? { d: petal, transform: 'rotate(' + (k * 72) + ' 12 12.2)' } : { d: petal },
      });
    }
    out.push({ tag: 'path', attrs: { d: 'M12 14.6V21.2' } });
    out.push({ tag: 'path', attrs: { d: 'M12 18.6C13.8 18 14.6 16.4 14.6 14.4C12.8 14.9 12 16.5 12 18.6Z' } });
    return out;
  },
  // 果香花香（牡丹）：俯视的重瓣花 —— 六枚互相交叠的圆瓣 + 紧贴的花心。
  // 牡丹的重瓣靠"瓣与瓣交叠"：瓣端是圆的、相邻瓣彼此压住；
  // 画成尖瓣会与单一花撞形，画成同心圆会变靶心。
  'fruity-floral': () => {
    const out = [];
    for (let k = 0; k < 6; k++) {
      const a = ((k * 60 - 90) * Math.PI) / 180;
      out.push({ tag: 'circle', attrs: { cx: r2(12 + 4.6 * Math.cos(a)), cy: r2(12 + 4.6 * Math.sin(a)), r: 3.9 } });
    }
    out.push({ tag: 'circle', attrs: { cx: 12, cy: 12, r: 2.2 } });
    return out;
  },
  // 粉感花香（鸢尾）：三片下垂的圆头瓣（含中央一片）+ 上方一枚窄立瓣。
  // 用"三垂一立、下重上轻"这个侧影，与白花/单一花那种"一圈向上开"相反。
  'powdery-floral': () => {
    // 一片以 (bx,by) 为根、朝 deg 方向（0=正上方，顺时针）、长 L、最宽 w 的圆头瓣
    const petal = (bx, by, deg, L, w) => {
      const a = (deg * Math.PI) / 180;
      const ux = Math.sin(a), uy = -Math.cos(a);
      const px = Math.cos(a), py = Math.sin(a);
      const P = (t, s) => [r2(bx + ux * L * t + px * w * s), r2(by + uy * L * t + py * w * s)];
      const A = P(0.3, 1.0), B = P(0.85, 0.8), T = P(1, 0), C = P(0.85, -0.8), D = P(0.3, -1.0);
      return 'M' + r2(bx) + ' ' + r2(by)
        + 'C' + A.join(' ') + ' ' + B.join(' ') + ' ' + T.join(' ')
        + 'C' + C.join(' ') + ' ' + D.join(' ') + ' ' + r2(bx) + ' ' + r2(by) + 'Z';
    };
    return [
      { tag: 'path', attrs: { d: petal(12, 11.2, 218, 9.4, 3.0) } },
      { tag: 'path', attrs: { d: petal(12, 11.2, 270, 10.2, 3.2) } },
      { tag: 'path', attrs: { d: petal(12, 11.2, 322, 9.4, 3.0) } },
      { tag: 'path', attrs: { d: petal(12, 11.8, 0, 7.4, 1.5) } },
    ];
  },
  // 辛香琥珀：一枚八角，连同一只短柄。
  // 八角是"辛香"里唯一自带几何识别的原料：八枚舟形蓇葖围成一圈，
  // 这个轮廓与所有同心圆类（玫瑰/檀木/咖啡豆）都不共享。
  'spicy-amber': () => {
    const arms = [];
    for (let k = 0; k < 8; k++) {
      arms.push({
        tag: 'path',
        attrs: k ? { d: 'M12 12.6L12 3.6' , transform: 'rotate(' + (k * 45) + ' 12 12.6)' } : { d: 'M12 12.6L12 3.6' },
      });
    }
    return [
      ...arms,
      { tag: 'circle', attrs: { cx: 12, cy: 12.6, r: 2.6 } },
    ];
  },
  // 绿叶花香（铃兰）：弯茎上挂三枚钟形花。
  // 钟形必须"上宽下收"；画成圆点就退化成「枝上几个点」。
  'green-floral': () => [
    { tag: 'path', attrs: { d: 'M15.8 21.4C15.8 16.4 14.4 10.8 9.6 6.2' } },
    { tag: 'path', attrs: { d: 'M15 17.6C13.4 16.4 11.4 16.6 10.2 18.2C11.4 19.8 13.4 19.8 15 17.6Z' } },
    { tag: 'path', attrs: { d: 'M12.2 13.4C10.6 12.2 8.6 12.4 7.4 14C8.6 15.6 10.6 15.6 12.2 13.4Z' } },
    { tag: 'path', attrs: { d: 'M10.4 9.6C8.8 8.4 6.8 8.6 5.6 10.2C6.8 11.8 8.8 11.8 10.4 9.6Z' } },
  ],
  // 单一花：一朵五瓣正花 + 花心。整套里唯一的"最素"花形 ——
  // 别的花都靠结构（卷、梗、钟、枝、纹章）区分，留一朵正对观众的读起来不累。
  soliflore: () => {
    const petal = 'M12 12C9.6 9.2 9.6 5.8 12 3.6C14.4 5.8 14.4 9.2 12 12Z';
    const out = [];
    for (let k = 0; k < 5; k++) {
      out.push({
        tag: 'path',
        attrs: k ? { d: petal, transform: 'rotate(' + (k * 72) + ' 12 12)' } : { d: petal },
      });
    }
    out.push({ tag: 'circle', attrs: { cx: 12, cy: 12, r: 1.9 } });
    return out;
  },

  /* ---- 木质调 ---- */
  // 檀木：木料的横截面 —— 起伏的树皮外廓 + 偏心年轮 + 一道楔形裂。
  // 外廓刻意做成不规则（不是圆），否则会与咖啡豆、玫瑰撞形；
  // 年轮偏心是"木头"而非"行星"的关键。
  sandalwood: () => [
    { tag: 'path', attrs: { d: 'M12 3.4C15.6 3.4 18.4 5 19.4 8C20.4 11 20.2 14.4 19 17.2C17.8 20 15 20.8 12 20.8C9 20.8 6.2 20 5 17.2C3.8 14.4 3.6 11 4.6 8C5.6 5 8.4 3.4 12 3.4Z' } },
    { tag: 'path', attrs: { d: 'M12.8 7.2C9.8 7.6 7.6 9.8 7.4 12.8C7.2 15.8 9.4 18.2 12.4 18.2C15.2 18.2 17.4 16 17.4 13.4C17.4 11 15.4 9 13 9' } },
    { tag: 'path', attrs: { d: 'M12 12.4L14.8 15.2' } },
  ],
  // 干燥木质：一段躺着的木料 + 端面椭圆 + 两道干裂。
  // 干裂是"干"的唯一视觉证据，必须从外沿崩进去，不能悬在中间。
  'dry-woody': () => [
    { tag: 'path', attrs: { d: 'M6.6 8.6H16.4C18.4 8.6 20 10.2 20 12.2V13.4C20 15.4 18.4 17 16.4 17H6.6Z' } },
    { tag: 'ellipse', attrs: { cx: 6.6, cy: 12.8, rx: 2, ry: 4.2 } },
    { tag: 'path', attrs: { d: 'M11.6 9V12.2L9.8 14.6M15.2 9.2V11.6L16.8 13.4' } },
  ],
  // 香根草：一束被短箍束住的根 —— 方箍在上、四根向下散开。
  // 不能画"土面 + 下方根须"，那读成一棵树；这一枚上半身只有一个箍。
  vetiver: () => [
    { tag: 'path', attrs: { d: 'M8.4 4.4H15.6V8H8.4Z' } },
    { tag: 'path', attrs: { d: 'M9 8.2C7.6 11.8 6.6 16 6.2 20.6' } },
    { tag: 'path', attrs: { d: 'M10.6 8.2C10 12 9.6 16.4 9.8 21.2' } },
    { tag: 'path', attrs: { d: 'M13.4 8.2C14 12 14.4 16.4 14.2 21.2' } },
    { tag: 'path', attrs: { d: 'M15 8.2C16.4 11.8 17.4 16 17.8 20.6' } },
  ],
  // 苔藓木质：一块隆起的岩 + 坡上三簇苔。
  // 苔用"两三瓣小叶簇"而不是点阵：点阵在这个尺寸会糊成一坨脏点。
  mossy: () => [
    { tag: 'path', attrs: { d: 'M4 20.8C4 16.6 5.8 12.8 8.8 11C10.6 10 12.6 10.4 14 11.8C16 13.6 18 16.6 18 20.8Z' } },
    { tag: 'path', attrs: { d: 'M7.4 13.4C6.2 12.4 5.8 10.8 6.4 9.4C7.6 10.2 8.2 11.8 7.4 13.4Z' } },
    { tag: 'path', attrs: { d: 'M10.6 11.6C10.2 10.2 10.6 8.8 11.6 7.8C12.4 9 12.2 10.6 10.6 11.6Z' } },
    { tag: 'path', attrs: { d: 'M13.6 11.4C14.4 10.2 15.8 9.6 17.2 9.8C16.8 11.2 15.4 12 13.6 11.4Z' } },
  ],
  // 芳香木质：一根斜枝 + 两片左右相对的叶。
  // 芳香木质是"木 + 香草"的合体，枝与叶必须同时在场、各占一半。
  'woody-aromatic': () => [
    { tag: 'path', attrs: { d: 'M5.2 21.4C8 17.6 10.4 13.6 12 9.6' } },
    { tag: 'path', attrs: { d: 'M12 9.6C14.6 7.8 17.4 8 19.2 10C17.4 12 14.6 12.2 12 9.6Z' } },
    { tag: 'path', attrs: { d: 'M9.4 13.8C6.8 12.6 4.4 13.4 3.2 15.8C5.6 17 8.2 16.2 9.4 13.8Z' } },
  ],
  // 乌木（沉香）：一块不规则木料 + 一圈结脂旋纹。
  // 沉香的价值在"结油"，内部必须是旋纹而不是直纹；直纹会读成普通木纹。
  oud: () => [
    { tag: 'path', attrs: { d: 'M7 6.2L16.8 5.4L19 14.6L13.6 19.8L5.6 16.4Z' } },
    { tag: 'path', attrs: { d: 'M12.4 9.4C9.8 9.4 8 11 8 13.2C8 15.4 9.8 17 12.4 17C14.6 17 16.2 15.6 16.2 13.8C16.2 12 14.6 10.8 12.8 10.8' } },
  ],

  /* ---- 东方琥珀调 ---- */
  // 香草琥珀：一根弯曲的香草荚 + 内嵌三粒籽。
  // 荚必须"细长微弯"：直的矩形会读成巧克力棒，太宽会读成叶子。
  'vanilla-amber': () => [
    { tag: 'path', attrs: { d: 'M13.4 3.4C15.6 8 15.8 13.4 13.8 20.2C12 19.4 10.8 17.4 10.6 14.8C10.2 10.6 11.2 6.4 13.4 3.4Z' } },
    { tag: 'circle', attrs: { cx: 12.7, cy: 8.2, r: 0.8 } },
    { tag: 'circle', attrs: { cx: 12.4, cy: 12.2, r: 0.8 } },
    { tag: 'circle', attrs: { cx: 12.7, cy: 16.2, r: 0.8 } },
  ],
  // 暖焚香：香锥 + 底盘 + 两道短烟。
  // 与冷焚香的"三支直立线香"形态完全不同 —— 同族两格必须是两种结构，不是粗细差别。
  'incense-warm': () => [
    { tag: 'path', attrs: { d: 'M12 4.6C13.6 6.6 16 12 16 15.4C16 17.6 14.2 19 12 19C9.8 19 8 17.6 8 15.4C8 12 10.4 6.6 12 4.6Z' } },
    { tag: 'path', attrs: { d: 'M5.4 19.6H18.6C18.6 21 15.6 21.8 12 21.8C8.4 21.8 5.4 21 5.4 19.6Z' } },
    { tag: 'path', attrs: { d: 'M12 2.8C10.6 2 11.2 0.9 12.4 0.9M15 3.4C13.6 2.6 14.2 1.5 15.4 1.5' } },
  ],
  // 焚香：三支线香插在香碟上，其中一支冒出一缕烟。
  // 用"直立的香"而不是香炉 —— 香炉会与美食调的容器撞形。
  'incense-cold': () => [
    { tag: 'path', attrs: { d: 'M4.4 18.8H19.6C19.6 20.4 16.2 21.4 12 21.4C7.8 21.4 4.4 20.4 4.4 18.8Z' } },
    { tag: 'path', attrs: { d: 'M9 18.6V8.4M12.6 18.6V6.2M16.2 18.6V9.6' } },
    { tag: 'path', attrs: { d: 'M12.6 4.4C11.2 3.2 12.2 2.1 13.6 2.1' } },
  ],
  // 树脂：一滴琥珀，里面裹着一只小虫。
  // 琥珀与普通树脂滴的区别就是"里面有没有东西"，所以内部那枚椭圆是语义必需。
  resinous: () => [
    { tag: 'path', attrs: { d: 'M12 2.6C15.2 7 17.8 10.8 17.8 14.6C17.8 18.4 15.2 21.4 12 21.4C8.8 21.4 6.2 18.4 6.2 14.6C6.2 10.8 8.8 7 12 2.6Z' } },
    { tag: 'ellipse', attrs: { cx: 12, cy: 14.8, rx: 2, ry: 2.9 } },
    { tag: 'path', attrs: { d: 'M10.6 17.6L9.4 18.8M13.4 17.6L14.6 18.8' } },
  ],
  // 皮革：一片不规则的皮料 + 一圈虚线针脚。
  // 皮革靠"软"与"缝"认人：外形必须不规则，针脚用虚线（虚线是缝、实线是描边）。
  leather: () => [
    { tag: 'path', attrs: { d: 'M6.6 7.2C9.8 5.6 14.2 5.6 17.6 7C19 11.4 18.8 15.6 17.4 18.8C13.8 20 9.4 19.8 6.2 18.4C4.8 14.4 5.2 10.6 6.6 7.2Z' } },
    { tag: 'path', attrs: { d: 'M8.4 8.8C10.8 7.8 13.6 7.8 16 8.6C16.8 11.4 16.8 14.6 15.8 17.2C12.8 18 9.8 17.8 7.6 16.8C7.2 14 7.4 11.2 8.4 8.8Z', 'stroke-dasharray': '1 1.6' } },
  ],

  /* ---- 清新调 ---- */
  // 水生：两道错相波纹 + 一枚下落的水珠。
  // 波纹给"面"，水珠给"向下的力"；只有波纹会读成"波浪线"，不是水。
  aquatic: () => [
    { tag: 'path', attrs: { d: 'M3.4 16C5.4 13.8 7.4 13.8 9.4 16C11.4 18.2 13.4 18.2 15.4 16C17.4 13.8 19 13.8 20.6 15.6' } },
    { tag: 'path', attrs: { d: 'M3.4 20.4C5.4 18.2 7.4 18.2 9.4 20.4C11.4 22.6 13.4 22.6 15.4 20.4C17.4 18.2 19 18.2 20.6 20' } },
    { tag: 'path', attrs: { d: 'M12 2.8C13.4 5.2 14.2 7 14.2 8.2C14.2 9.6 13.2 10.6 12 10.6C10.8 10.6 9.8 9.6 9.8 8.2C9.8 7 10.6 5.2 12 2.8Z' } },
  ],
  // 绿叶：一片斜生的叶 + 主脉 + 三条侧脉。
  // 叶必须"斜"：正立的叶会与鸢尾的垂瓣、香根草的根束撞形。
  green: () => [
    { tag: 'path', attrs: { d: 'M4.4 19.6C4.4 12.6 8.8 6.8 17.6 5.4C18.6 13.6 13.8 19.2 4.4 19.6Z' } },
    { tag: 'path', attrs: { d: 'M5.8 18.4C9 15.6 12.8 12.6 17 10' } },
    { tag: 'path', attrs: { d: 'M10.6 15.1C9.8 14.3 9.2 13.3 9 12.1M13.4 12.4C12.4 11.4 11.6 10.2 11.2 8.8M16 9.9C15.4 8.9 15 7.7 14.9 6.5' } },
  ],
  // 蕨（馥奇）：一根弧形的叶轴 + 左右各四片前倾的羽叶。
  // 羽叶必须"前倾 + 越往上越短"；做成水平对称的鱼骨就变成"鱼刺"了。
  fougere: () => [
    { tag: 'path', attrs: { d: 'M10.4 21.6C10.4 16.6 11.4 11.2 14.4 6' } },
    { tag: 'path', attrs: { d: 'M11.1 18.2C9.2 17.8 7.5 18.4 6.4 19.8M11.6 14.6C9.5 14 7.6 14.6 6.4 16.1M12.4 11C10.4 10.2 8.5 10.6 7.2 12M13.4 7.8C11.7 6.8 9.9 7 8.6 8.2' } },
    { tag: 'path', attrs: { d: 'M11.1 18.2C12.9 17.4 14.5 17.7 15.7 18.9M11.6 14.6C13.4 13.7 15.1 13.9 16.3 15.1M12.4 11C14 9.9 15.7 9.9 16.9 10.9' } },
  ],
  // 茶香：一芽两叶。茶用的是"嫩芽"，所以中间那枚向上、且比两侧的叶更窄。
  tea: () => [
    { tag: 'path', attrs: { d: 'M12 20.8V10.4' } },
    { tag: 'path', attrs: { d: 'M12 10.2C12 7 12.8 4.4 14.6 2.6C15.6 5.6 15 8.4 12 10.2Z' } },
    { tag: 'path', attrs: { d: 'M11.8 12.6C9 11.8 6.4 12.8 5 15.6C8 16.6 10.8 15.4 11.8 12.6Z' } },
    { tag: 'path', attrs: { d: 'M12.2 15.2C15 14.4 17.6 15.4 19 18.2C16 19.2 13.2 18 12.2 15.2Z' } },
  ],

  /* ---- 美食调 ---- */
  // 香草甜（香草兰）：两片侧瓣 + 一片向下的唇瓣 + 花心。
  // 兰花的结构就是"唇瓣向下"，与白花、单一花的向上开正好镜像。
  'vanilla-gourmand': () => [
    { tag: 'path', attrs: { d: 'M11.4 11C9.4 10.4 7.6 8.6 6.8 6.2C9.2 6 11 7.4 11.4 11Z' } },
    { tag: 'path', attrs: { d: 'M12.6 11C14.6 10.4 16.4 8.6 17.2 6.2C14.8 6 13 7.4 12.6 11Z' } },
    { tag: 'path', attrs: { d: 'M12 11.4C13 14 13.4 16.8 13 19.8C11.4 20.2 9.8 19.6 9.2 18.2C9.4 15.6 10.4 13.2 12 11.4Z' } },
    { tag: 'circle', attrs: { cx: 12, cy: 11.4, r: 1.5 } },
  ],
  // 果味甜：两颗错开的浆果 + 各自的果梗。
  // 单颗浆果会与柑橘的果撞形，所以用"两颗 + 错位"把轮廓拉成双团。
  'fruity-gourmand': () => [
    { tag: 'circle', attrs: { cx: 8.6, cy: 15.6, r: 4.8 } },
    { tag: 'circle', attrs: { cx: 15.6, cy: 17.4, r: 3.6 } },
    { tag: 'path', attrs: { d: 'M8.6 10.6C9.6 8 11.6 6 14 4.8' } },
    { tag: 'path', attrs: { d: 'M15.6 13.6C15.8 11.4 16.6 9.8 18 8.6' } },
  ],
  // 咖啡可可：一颗咖啡豆 —— 椭圆 + 一道 S 形中缝 + 顶部一小段果柄。
};

const SUB_FIT = {
  'aquatic': [0.9091, 1.091, 0.705],
  'aromatic-citrus': [0.9511, 0.587, 0.397],
  'citrus-floral': [0.9021, 1.175, 1.265],
  'cologne': [1.1824, -2.189, -4.318],
  'dry-woody': [1.1364, -1.977, -2.545],
  'fougere': [1.1218, -1.069, -3.481],
  'fruity-floral': [1.0294, -0.353, -0.353],
  'fruity-gourmand': [1.0802, -0.423, -1.935],
  'green': [1.2324, -1.636, -3.405],
  'green-citrus': [1.4244, -5.093, -9.447],
  'green-floral': [1.1513, -0.319, -3.888],
  'incense-cold': [0.9067, 1.119, 1.346],
  'incense-warm': [0.9067, 1.119, 1.346],
  'leather': [1.2854, -3.351, -4.429],
  'mossy': [1.25, -1.75, -5.875],
  'oud': [1.2153, -2.948, -3.313],
  'powdery-floral': [1.177, 3.281, -1.182],
  'resinous': [0.9309, 0.83, 0.83],
  'rose': [0.9756, -0.049, 0.38],
  'sandalwood': [1.0057, -0.069, -0.17],
  'soliflore': [1.024, -0.288, -0.008],
  'spicy-amber': [0.9722, 0.333, -0.25],
  'tea': [0.9615, 0.462, 0.75],
  'vanilla-amber': [1.0417, -1.384, -0.292],
  'vanilla-gourmand': [1.2736, -3.284, -4.623],
  'vetiver': [1.0417, -0.5, -1.333],
  'white-floral': [1.0294, -0.353, -1.074],
  'woody-aromatic': [1.0938, -0.25, -4.278],
};

const PLATE_FALLBACK = [{ tag: 'circle', attrs: { cx: 12, cy: 12, r: 7.4 } }];

const PLATE_LABEL = { citrus: '柑橘', floral: '花', woody: '木质', amber: '树脂', fresh: '叶', gourmand: '果实' };

function scentPlate(sub) {
  const entries = (sub.notes || [])
    .map((en) => TAX.noteIndex.entries.find((x) => normNote(x.en) === normNote(en)))
    .filter(Boolean);
  if (!entries.length) return null;

  /* 只画一枚，画得大。
     原本的设想是"每味香材一枚小图标"，实测行不通：每个小类的代表香材
     全部落在同一个家族里（白花是茉莉+晚香玉，都是 floral），
     逐味画会出来一排一模一样的图标 —— 那不是示意图，是重复。
     而且三枚 22px 的小图标撑不起"示意图"这个位置，读起来还是徽标。
     所以：按家族画一枚放大的标本线稿，香材名交给下面那行小字去说。 */
  const family = entries[0].family;
  /* 先找这一格自己的标识，找不到再退回家族母题。
     每个小类各有一枚专属线稿（SUB_MARKS），家族母题（PLATE_MOTIFS）只作兜底：
     数据里新增了没来得及画的小类时，宁可退回家族图，也不要画一个假的专属图。 */
  const markFn = SUB_MARKS[sub.id];
  const shapes = markFn ? markFn() : (PLATE_MOTIFS[family] || (() => PLATE_FALLBACK))();

  const wrap = el('div', { class: 'hub-plate' });
  const svg = svgEl('svg', {
    class: 'plate-svg',
    viewBox: '0 0 ' + PLATE_SIZE + ' ' + PLATE_SIZE,
    fill: 'none',
    'aria-hidden': 'true', focusable: 'false',
  });
  /* ⑤ 归一化：先把每枚的着墨包围盒平移回中心、缩放到同一尺寸，
     再按 1/k 反向补偿线宽。不补偿的话 k=1.429 那枚线会粗到 2.6px、
     k=0.886 那枚只有 1.6px，同一份样式表读出来是两套粗细。 */
  const fit = SUB_FIT[sub.id] || SUB_FIT._default || [1, 0, 0];
  const grp = svgEl('g', {
    transform: 'translate(' + r2(fit[1]) + ' ' + r2(fit[2]) + ') scale(' + r2(fit[0]) + ')',
  });
  svg.appendChild(grp);
  shapes.forEach(({ tag, attrs }) => {
    const a = Object.entries(attrs).map(([k, v]) => [k, String(v)]);
    /* 只给真的画线的图元补线宽；circle 无 d 也照样描边，一并补 */
    a.push(['stroke-width', r2(PLATE_SW / fit[0])]);
    grp.appendChild(svgEl(tag, Object.fromEntries(a)));
  });
  wrap.appendChild(svg);
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
  /* 六族本色渐变：每一族在自己的色相内做 97% → 92% 的明暗，
     而不是六块纯色。纯色 = 绝对均匀的平面，无论色相多准都读成色块；
     同一色相内 5% 的明暗变化才让它像"一块有厚度的材料"。 */
  mkGrad('gFamCitrus',   [['0', '#fbfcee'], ['0.58', '#f5f7e2'], ['1', '#eef2d4']], 40, 30, 440, 450);
  mkGrad('gFamFloral',   [['0', '#fdf8fb'], ['0.58', '#faeef4'], ['1', '#f5e4ee']], 40, 30, 440, 450);
  mkGrad('gFamWoody',    [['0', '#f9f6f2'], ['0.58', '#f2ece4'], ['1', '#e9e1d6']], 40, 30, 440, 450);
  mkGrad('gFamAmber',    [['0', '#fdfaf0'], ['0.58', '#f8f0dd'], ['1', '#f2e6cc']], 40, 30, 440, 450);
  mkGrad('gFamFresh',    [['0', '#f2faf6'], ['0.58', '#e6f3ec'], ['1', '#d8ecdf']], 40, 30, 440, 450);
  mkGrad('gFamGourmand', [['0', '#fcf7f1'], ['0.58', '#f6ebde'], ['1', '#efdfcc']], 40, 30, 440, 450);

  mkGrad('gArc', [['0', '#ffffff'], ['0.62', '#fdfdff'], ['1', '#f2f5fc']], 40, 30, 440, 450);
  mkGrad('gArcHot', [['0', '#ffffff'], ['1', '#eaf0fd']], 40, 30, 440, 450);
  // 选中弧段：克莱因蓝，左上亮、右下深
  mkGrad('gArcOn', [['0', '#2249b8'], ['0.5', '#002fa7'], ['1', '#00268a']], 40, 30, 440, 450);
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
    g.appendChild(svgEl('path', { class: 'sector-shape', d: ringPath(WHEEL.r1o, WHEEL.r1i, a0, a1) }));
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
    const p = wheelPolar(rMid, midDeg);
    /* 同一个极角写两套坐标：桌面一套（left/top），窄屏一套（--nl / --nt）。
       窄屏盘心与大圈之间只剩约 330px（390 视口）或 310px（360），
       两行标签的中心距小于两个方框的半高之和就必然相交 —— 只收盒子不够，
       半径也得往里挪一档。半径是 JS 按视框算的（CSS 里拿不到
       "圆心到某一点的百分比"这种量），所以两套都在这里算好，
       窄屏那套交给 media query 用 var() 取。 */
    const pn = wheelPolar(LABEL_R_NARROW, midDeg);
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
        d: ringPath(SUB_R2O, SUB_R2I, a0, a1),
      }));
      svg.appendChild(g);
      subGs.push(g);

      const px = wheelPolar(rMid, mid);
      /* 窄屏半径 = 124（实测网格的最佳值）。弧带中线是 135，
         窄屏把标签往里收 11 单位，是为了让它与家族标签之间留出
         两个半高的间隙 —— 详见 _wheel8.css 第七节的实测数字。 */
      const pxm = wheelPolar(SUB_LABEL_R_NARROW, mid);
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
      }, el('span', { class: 'zh' }, item.zh));

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
      desc = focusSub.descWheel || focusSub.desc;
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
      // 轮盘是两层，选完不该立刻跳走——用户可能还想在中圈再收一层。
      // 所以这里只更新家族说明区与底部按钮，前进由按钮控制。
      paintFamilyPanel(fam);
      // 底部按钮必须跟着重画：它的 disabled 与提示语都取决于"选了没有"。
      // 只改 state 不重画的话，用户选完家族按钮还是灰的，看着像坏了。
      const old = document.querySelector('.actions');
      if (old && old.parentNode) {
        const fresh = navBar('family');
        old.parentNode.replaceChild(fresh, old);
      }
    },
  }));

  wrap.appendChild(navBar('family'));
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

/* ---------- 第 2 步：场合（同一个圆盘，5 个扇区）---------- */
function renderOccasion() {
  const wrap = el('div', { class: 'fade-in' });

  const lead = el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, stepHead('occasion').kicker),
    el('h2', { class: 'q-title' }, stepHead('occasion').title),
    el('p', { class: 'q-help' }, stepHead('occasion').help)
  );
  wrap.appendChild(lead);

  wrap.appendChild(buildDisc(TAX.occasionMap, {
    label: '主要使用场合',
    selectedId: state.answers.occasion,
    onPick: (o) => {
      state.answers.occasion = o.id;
      autoNext(620);   // 与第 1 步同一节奏，两屏的手感必须一致
    },
  }));

  wrap.appendChild(navBar('occasion'));
  return wrap;
}

/* ---------- 第 3 步：浓郁度 ---------- */
const INTENSITY_LABEL = {
  1: ['很淡', '只有贴很近才闻到，一两个小时后基本消失'],
  2: ['偏淡', '自己和身边人闻得到，通勤半天还在'],
  3: ['中等', '明显有香气，办公室环境刚好'],
  4: ['偏浓', '进门会被注意到，衣服上留到第二天'],
  5: ['很浓', '一两喷就够，围巾上能留好几天'],
};

function renderIntensity() {
  const wrap = el('div', { class: 'fade-in' });
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, stepHead('intensity').kicker),
    el('h2', { class: 'q-title' }, stepHead('intensity').title),
    el('p', { class: 'q-help' }, stepHead('intensity').help)
  ));

  const read = el('div', { class: 'scale-read' });
  const updateRead = () => {
    const v = Number(state.answers.intensity);
    const [a, b] = INTENSITY_LABEL[v];
    read.innerHTML = `<b>${v} / 5 · ${a}</b><br><span>${b}</span>`;
  };

  const input = el('input', {
    type: 'range',
    min: '1',
    max: '5',
    step: '1',
    value: String(state.answers.intensity),
    'aria-label': '浓郁度',
    oninput: (ev) => {
      state.answers.intensity = Number(ev.target.value);
      updateRead();
    },
  });

  const scale = el('div', { class: 'scale' },
    input,
    el('div', { class: 'scale-ends' },
      el('span', {}, '← 清爽 / 淡'),
      el('span', {}, '浓 / 有分量 →')
    )
  );

  updateRead();
  wrap.append(scale, read);
  wrap.appendChild(navBar('intensity'));
  return wrap;
}

/* ---------- 第 4 / 5 步：香调点名（喜欢 / 讨厌各一屏） ----------
   v19 把一个"两栏同屏"的页面拆成两屏。原因是实测出来的：
   两栏各有 40 个 chip，屏高 640px，勾完上面那栏再滚到下面时，
   已经看不到上面勾了什么；而两栏共享同一份 registry，
   一栏的动作会静默改掉另一栏的视觉 —— 用户会以为勾错了。
   拆屏之后每屏只画一栏，滚动与状态互不干扰，
   "同一香调不能既喜欢又讨厌"这条仍然由 registry 在背面守着。 */
function renderNotes(mode) {
  const idx = mode === 'likedNotes' ? 3 : 4;
  const head = stepHead(mode);
  const wrap = el('div', { class: 'fade-in' });
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  // 香调表要扫全库才知道哪些选项真的有货。库还没到时不能退回全表 ——
  // 那会把 0 命中的死选项也画出来，用户点了却推荐不出东西。
  // 改成占位 + 到货后自动重画（正常早已下完，只有慢网首访会看到）。
  if (!DATA?.perfumes?.length) {
    ensurePerfumes()
      .then(() => { if (state.step === idx) render(); })
      .catch((err) => { wrap.appendChild(el('p', { class: 'q-help' }, `香调表加载失败：${err.message}`)); });
    wrap.appendChild(el('div', { class: 'skeleton' },
      el('div', { class: 'skeleton-ring' }),
      el('p', { class: 'skeleton-note' }, '正在读取香水库……')
    ));
    wrap.appendChild(navBar(mode));
    return wrap;
  }

  // 40 个香调里有些在库里出现 0 次 —— 勾了它却永远推荐不出东西，等于骗一次点击。
  const usable = getUsableNotes();

  // 同一香调不能既"喜欢"又"讨厌"。两栏各建一个 en → chip 的登记表，
  // 勾一边时直接把另一边的 chip 关掉，不靠 DOM 结构去猜是哪一栏。
  const chipRegistry = { likedNotes: new Map(), dislikedNotes: new Map() };

  const mkChips = (list, key, neg) => {
    const zhKey = key === 'likedNotes' ? 'likedZh' : 'dislikedZh';
    const box = el('div', { class: 'chips' });
    list.forEach((n) => {
      const active = state.answers[key].includes(n.en);
      const chip = el('button', {
        class: 'chip' + (neg && active ? ' neg' : ''),
        type: 'button',
        // 标出所属栏：两栏有同名香调，测试与同步逻辑都要能分辨是哪一个，
        // 靠 DOM 顺序猜（第一个 .chips 是喜欢…）在加了隐藏折叠区之后就不成立了。
        'data-col': neg ? 'disliked' : 'liked',
        'aria-pressed': String(active),
        onclick: () => {
          const arr = state.answers[key];
          const otherKey = key === 'likedNotes' ? 'dislikedNotes' : 'likedNotes';
          const otherZh = key === 'likedNotes' ? 'dislikedZh' : 'likedZh';
          const other = state.answers[otherKey];
          const idx = arr.indexOf(n.en);
          if (idx >= 0) {
            arr.splice(idx, 1);
            delete state.answers[zhKey][n.en];
          } else {
            arr.push(n.en);
            state.answers[zhKey][n.en] = n.zh;  // 记住用户看到的中文名
            // 同一香调不能既喜欢又讨厌。之前两栏互不通信，实测可以同时勾上
            // 琥珀/香草各两次，进引擎后喜欢分与讨厌分互相抵消，理由里
            // 反而完全不提用户点名的香材 —— 用户看到的是"我明明选了它"。
            const oi = other.indexOf(n.en);
            if (oi >= 0) {
              other.splice(oi, 1);
              delete state.answers[otherZh][n.en];
            }
          }
          chip.setAttribute('aria-pressed', String(idx < 0));
          chip.classList.toggle('neg', neg && idx < 0);
          // 刚勾上时，把对面那栏同名 chip 关掉并同步它的视觉态
          if (idx < 0) {
            const twin = chipRegistry[otherKey].get(n.en);
            if (twin) {
              twin.setAttribute('aria-pressed', 'false');
              twin.classList.remove('neg');
            }
          }
        },
      }, n.zh);
      const reg = chipRegistry[key].get(n.en);
      if (reg) chipRegistry[key].set(n.en, reg); else chipRegistry[key].set(n.en, chip);
      box.appendChild(chip);
    });
    return box;
  };

  // 40 个香调一次铺开会压垮新手 → 先给 16 个，其余折叠。
  // 但不能直接 slice(0,16)：entries 按家族顺序排列，前 16 个正好全是
  // 柑橘+花香+雪松檀木，喜欢木质/琥珀/美食/清新的人一个可点的都没有。
  // 改成按家族轮流取，保证每个家族都露脸，再恢复原始顺序保持版面稳定。
  const PEEK = 16;
  const byFamily = new Map();
  usable.forEach((n, i) => {
    if (!byFamily.has(n.family)) byFamily.set(n.family, []);
    byFamily.get(n.family).push(i);
  });
  const picked = new Set();
  let round = 0;
  while (picked.size < PEEK && round < 16) {
    for (const idxs of byFamily.values()) {
      if (picked.size >= PEEK) break;
      if (idxs[round] != null) picked.add(idxs[round]);
    }
    round += 1;
  }
  const order = [...picked].sort((a, b) => a - b);
  const common = order.map((i) => usable[i]);
  const rest = usable.filter((_, i) => !picked.has(i));

  /* v19：按 mode 只画一栏。
     原来这段是"喜欢栏 + 讨厌栏"两段几乎重复的代码（各 10 行），
     拆屏后每屏只留一半 —— 但仍保留同一套骨架（16 个 + 折叠），
     因为"喜欢只看到 16 个、讨厌却有 40 个"那种不对称是坑过的（见下）。 */
  const isLiked = mode === 'likedNotes';
  const key = isLiked ? 'likedNotes' : 'dislikedNotes';
  const neg = !isLiked;

  wrap.appendChild(el('div', { class: 'chips-label' },
    isLiked ? '我喜欢这些味道' : '我受不了这些味道（更有效）'));
  wrap.appendChild(mkChips(common, key, neg));

  const moreBox = el('div', { class: 'chips', style: 'margin-top:8px;display:none' });
  moreBox.appendChild(mkChips(rest, key, neg));
  wrap.appendChild(moreBox);

  const moreBtn = el('button', {
    type: 'button',
    class: 'btn ghost btn-more',
    onclick: () => {
      const hidden = moreBox.style.display === 'none';
      moreBox.style.display = hidden ? 'flex' : 'none';
      moreBtn.textContent = hidden ? '收起' : `展开全部 ${usable.length} 个香调`;
    },
  }, `展开全部 ${usable.length} 个香调`);
  wrap.appendChild(moreBtn);

  /* 这一步的一句人话解释放在 chips 下面而不是上面：
     上面已经有 q-help，再叠一段会把 16 个 chip 推到折叠线以下，
     而这一步的主体就是那些 chip。 */
  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, isLiked ? '命名要具体：' : '排除比加分更有用：'),
    isLiked
      ? ' 「佛手柑」比「柑橘调」准，因为同一族里橘子、柠檬、柚子差别很大。库里有 56 种香调，先给 16 个最常用的。'
      : ' 勾一个你确定受不了的，比勾三个"喜欢"更能提高命中率 —— 喜欢的东西往往有替代品，讨厌的东西没有。'
  ));

  wrap.appendChild(navBar(mode));
  return wrap;
}

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
  const box = el('div', { class: 'choice-grid' });
  opts.forEach((o) => {
    const on = current === o.id;
    const b = el('button', {
      class: 'choice' + (on ? ' is-on' : ''),
      type: 'button',
      'aria-pressed': String(on),
      'data-id': o.id,
      onclick: () => {
        onPick(o.id);
        /* 单选组：把状态刷到整组，而不是只改自己 ——
           只改自己时，按上一题回来会看到两个同时高亮。 */
        [...box.children].forEach((c) => {
          const mine = c.getAttribute('data-id') === o.id;
          c.classList.toggle('is-on', mine);
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

/* ---------- 第 6 步：气质 ----------
   数据里 character 有 21 种，逐个列出来是灾难（新手不知道 "resinous" 是什么）。
   按「新手能自己判断」的标准收敛到 8 个，每个配一句人话解释，
   背后各自映射到数据里的多个标签（tags）。 */
const CHARACTER_PRESET = [
  { id: 'fresh',   zh: '清爽干净', desc: '像刚洗完澡、白衬衫。不甜、不厚', tags: ['fresh', 'clean', 'green', 'citrusy'] },
  { id: 'cold',    zh: '清冷疏离', desc: '存在感低，靠近才闻到。适合不想被注意的时候', tags: ['woody', 'earthy', 'herbal'] },
  { id: 'warm',    zh: '温暖亲和', desc: '像晒过太阳的毛衣。别人会觉得你好接近', tags: ['warm', 'amber', 'resinous'] },
  { id: 'sweet',   zh: '甜而柔软', desc: '香草、焦糖、奶油那一类。讨喜但容易过量', tags: ['sweet', 'creamy'] },
  { id: 'floral',  zh: '花香温柔', desc: '花店的气味。最常见也最不容易出错', tags: ['floral', 'powdery'] },
  { id: 'bright',  zh: '明亮有神', desc: '柑橘、绿叶。提神，适合早上出门', tags: ['citrusy', 'fruity', 'green'] },
  { id: 'mystery', zh: '深沉神秘', desc: '烟熏、树脂、皮革。有分量，不适合白天通勤', tags: ['smoky', 'leathery', 'resinous', 'spicy'] },
  { id: 'lazy',    zh: '贴肤慵懒', desc: '像皮肤本来的气味。存在感弱但耐闻', tags: ['musky', 'powdery', 'creamy'] },
];

function renderCharacter() {
  const wrap = el('div', { class: 'fade-in' });
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, stepHead('character').kicker),
    el('h2', { class: 'q-title' }, stepHead('character').title),
    el('p', { class: 'q-help' }, stepHead('character').help)
  ));

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '看不懂「香调家族」？'),
    ' 家族只说明大方向（花香 / 木质 / 柑橘…），气质说的是它给人的感觉。',
    ' 同一瓶花香，可以清冷也可以甜腻 —— 这一步就是补上那一层。'
  ));

  wrap.appendChild(choiceGrid(
    CHARACTER_PRESET.map((c) => ({ id: c.id, zh: c.zh, desc: c.desc })),
    state.answers.characterPreset,
    (id) => {
      state.answers.characterPreset = id;
      /* 引擎侧收的是标签数组，按「命中任一」给分 ——
         源站给每瓶打的标签本来就不统一，只认单一标签会漏掉太多。 */
      state.answers.characterTags = (CHARACTER_PRESET.find((c) => c.id === id) || {}).tags || [];
      autoNext(480);
    }
  ));

  wrap.appendChild(navBar('character'));
  return wrap;
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

function renderSeason() {
  const wrap = el('div', { class: 'fade-in' });
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, stepHead('season').kicker),
    el('h2', { class: 'q-title' }, stepHead('season').title),
    el('p', { class: 'q-help' }, stepHead('season').help)
  ));

  wrap.appendChild(el('div', { class: 'chips-label' }, '主季节'));
  wrap.appendChild(choiceGrid(SEASONS, state.answers.season, (id) => {
    state.answers.season = id;
    /* 主季节换了，次选若与它相同就清掉 ——
       否则会出现「主夏次夏」这种无意义组合。 */
    if (state.answers.seasonSecond === id) state.answers.seasonSecond = null;
  }));

  wrap.appendChild(el('div', { class: 'chips-label', style: 'margin-top:18px' }, '次选季节（可跳过）'));
  wrap.appendChild(choiceGrid(
    SEASONS.filter((s) => s.id !== state.answers.season),
    state.answers.seasonSecond,
    (id) => { state.answers.seasonSecond = id; }
  ));

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '关于候选多少：'),
    ' 库里 400 瓶按季节标注为「春 382 · 夏 254 · 秋 389 · 冬 146」。',
    '冬天能选的最少，这是数据本身的分布，不是推荐变差了。'
  ));

  wrap.appendChild(navBar('season'));
  return wrap;
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

function renderConcentration() {
  const wrap = el('div', { class: 'fade-in' });
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, stepHead('concentration').kicker),
    el('h2', { class: 'q-title' }, stepHead('concentration').title),
    el('p', { class: 'q-help' }, stepHead('concentration').help)
  ));

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '先看懂再选：'),
    ' 浓度就是「香精占整瓶的比例」。比例越高，留得越久，也越容易在密闭空间里让人不舒服。',
    ' 日常最常见的是 EDT 与 EDP 两种。'
  ));

  wrap.appendChild(choiceGrid(CONCENTRATIONS, state.answers.concentration, (id) => {
    state.answers.concentration = id;
    autoNext(480);
  }));

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '注意：'),
    ' 上面的百分比是行业通行区间，不是每瓶的实测值；',
    '库里有 52 瓶（13%）源站没标浓度，它们仍会出现在结果里，只是不参与这一项打分。'
  ));

  wrap.appendChild(navBar('concentration'));
  return wrap;
}

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

function renderLongevity() {
  const wrap = el('div', { class: 'fade-in' });
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, stepHead('longevity').kicker),
    el('h2', { class: 'q-title' }, stepHead('longevity').title),
    el('p', { class: 'q-help' }, stepHead('longevity').help)
  ));

  wrap.appendChild(el('div', { class: 'term-note is-warn' },
    el('strong', {}, '这一段是推断值：'),
    ' 数据源没有实测持香时长。下面的档位是按香水浓度推算的（古龙水约 2、EDT 约 3、EDP 约 4、香精约 5）。',
    '它只能用来做相对比较，不等于你身上的真实表现 —— 同一瓶在干皮和油皮、冬天和夏天，差别可以很大。'
  ));

  wrap.appendChild(choiceGrid(
    LONGEVITY.map((l) => ({ id: l.id, zh: l.zh + ' · 推断', desc: l.desc })),
    state.answers.longevity == null ? null : String(state.answers.longevity),
    (id) => { state.answers.longevity = Number(id); autoNext(480); }
  ));

  wrap.appendChild(navBar('longevity'));
  return wrap;
}

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

  const box = el('div', { class: 'choice-grid' });
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

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '可以一个都不选：'),
    ' 这里是「整族关掉」。只想排除具体几种香材的话，回第 4 / 5 步逐个点名更准。',
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

function renderTemperature() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('temperature');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '怎么判断自己是偏暖还是偏凉？'),
    ' 想两个你闻过的东西：一杯热牛奶（暖）、刚剥开的橘子皮（凉）。',
    ' 如果你喜欢"闻起来像洗完澡"，多半偏凉；喜欢"像毛衣和木头"，多半偏暖。'
  ));

  wrap.appendChild(choiceGrid(TEMPERATURES, state.answers.temperature, (id) => {
    state.answers.temperature = id;
    autoNext(480);
  }));

  wrap.appendChild(navBar('temperature'));
  return wrap;
}

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

function renderSweetness() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('sweetness');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '「晕甜」是什么意思？'),
    ' 有人闻到甜香会头晕、恶心，这很常见，不是矫情。',
    '如果你有过这种反应，直接选「完全不甜」—— 这一屏的价值就在于把这类雷提前排掉。'
  ));

  wrap.appendChild(choiceGrid(SWEETNESS, state.answers.sweetness == null ? null : String(state.answers.sweetness), (id) => {
    state.answers.sweetness = Number(id);
    autoNext(480);
  }));

  wrap.appendChild(navBar('sweetness'));
  return wrap;
}

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
function renderAnchor() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('anchor');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '为什么这一屏最有用：'),
    ' 前面问的都是"你觉得你喜欢什么"，这一屏问的是"你实际喜欢过什么"。',
    ' 两者经常不一致 —— 很多人以为自己喜欢木质，实际一直在买花香。'
  ));

  /* --- 输入 ①：品牌 → 香水 --- */
  const brands = [...new Set((DATA?.perfumes || []).map((p) => p.brand))].sort();
  wrap.appendChild(el('div', { class: 'chips-label' }, '我记得是哪一瓶（可选）'));

  if (!DATA?.perfumes?.length) {
    wrap.appendChild(el('p', { class: 'q-help' }, '香水库还在加载，稍等一下再选品牌'));
  } else {
    const perfumeSlot = el('div', { class: 'anchor-slot' });
    const selBrand = el('select', {
      class: 'anchor-select',
      'aria-label': '品牌',
      onchange: (ev) => {
        state.answers.anchorBrand = ev.target.value || null;
        // 换品牌就清掉已选的那瓶 —— 否则会留下"Byredo 的瓶子 + Creed 的品牌"这种不一致
        state.answers.anchorPerfume = null;
        state.answers.anchorPerfumeNotes = [];
        /* 只重建「香水下拉」那一块，不调 render() ——
           调 render() 会整页重绘：下拉框失焦、下面已勾的香调 chip 全部丢状态，
           用户会以为"我刚选的东西没了"。 */
        if (perfumeSlot) {
          perfumeSlot.innerHTML = '';
          perfumeSlot.appendChild(buildPerfumeSelect());
        }
      },
    },
      el('option', { value: '' }, `选择品牌（共 ${brands.length} 个）`),
      ...brands.map((b) => el('option', { value: b, selected: state.answers.anchorBrand === b ? 'selected' : null }, b))
    );
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

/* ---------- 两个薄包装：让第 4 / 5 步在 STEPS 里用零参签名 ---------- */
function renderLikedNotes() { return renderNotes('likedNotes'); }
function renderDislikedNotes() { return renderNotes('dislikedNotes'); }

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

function renderNotesCombined() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('notes');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  if (!DATA?.perfumes?.length) {
    ensurePerfumes()
      .then(() => { if (STEPS[state.step]?.id === 'notes') render(); })
      .catch((err) => { wrap.appendChild(el('p', { class: 'q-help' }, `香调表加载失败：${err.message}`)); });
    wrap.appendChild(el('div', { class: 'skeleton' },
      el('div', { class: 'skeleton-ring' }),
      el('p', { class: 'skeleton-note' }, '正在读取香水库……')
    ));
    wrap.appendChild(navBar('notes'));
    return wrap;
  }

  const usable = getUsableNotes();

  /* 两栏各自建一个"渲染函数"，勾选后只重画这一栏的 chip 顺序，
     不整页 render() —— 整页重绘会让另一栏滚回顶部，用户正在看的东西会跳走。 */
  const buildColumn = (key, neg, title) => {
    const zhKey = neg ? 'dislikedZh' : 'likedZh';
    const col = el('div', { class: 'note-col' });
    const headRow = el('div', { class: 'note-col-head' });
    const badge = el('span', { class: 'note-count' });
    headRow.append(el('span', { class: 'chips-label', style: 'margin:0' }, title), badge);
    col.appendChild(headRow);

    const box = el('div', { class: 'chips' });
    const moreBox = el('div', { class: 'chips', style: 'margin-top:8px;display:none' });
    let expanded = false;

    /* 两栏的"常用 16"必须互补，否则同一屏里两栏内容几乎一样。
       左栏（喜欢）取轮转后的前 16，右栏（讨厌）取尾部 16 ——
       实测这样两栏合并后覆盖全部 6 个家族；都取前 16 时只覆盖 3 个
       （citrus / floral / woody），右栏一打开就是左栏的镜像。 */
    const source = neg ? [...usable].reverse() : usable;

    const chipOf = (n) => {
      const on = state.answers[key].includes(n.en);
      /* onclick 是箭头函数，没有自己的 this —— 不能写 this.setAttribute。
         这里用闭包变量 chipEl 持有节点本身，在 el() 返回后赋值。 */
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
          const other = state.answers[otherKey];
          const idx = arr.indexOf(n.en);
          if (idx >= 0) {
            arr.splice(idx, 1);
            delete state.answers[zhKey][n.en];
          } else {
            arr.push(n.en);
            state.answers[zhKey][n.en] = n.zh;
            // 同一香调不能既喜欢又讨厌（D41 的既有约束，合并后仍然成立）
            const oi = other.indexOf(n.en);
            if (oi >= 0) { other.splice(oi, 1); delete state.answers[otherZhKey][n.en]; }
          }
          /* **就地更新，不重建整栏**。
             第一版在点击后调 redraw() 重建 box.innerHTML —— 后果有两个：
               ① 被点的那个 chip 节点被丢弃，焦点与 :focus-visible 全丢，
                  键盘用户点一次就得重新 Tab 一遍；
               ② 测试里 dispatch 之后拿到的旧节点读 aria-pressed 永远是 false，
                  看起来像"点击无效"。
             现在只改这一枚 chip 自己的状态与位置。 */
          const now = idx < 0;
          if (chipEl) {
            chipEl.setAttribute('aria-pressed', String(now));
            chipEl.classList.toggle('neg', neg && now);
            if (now) box.insertBefore(chipEl, box.firstChild);   // 已选置顶
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
      /* ③ 已选置顶：把已勾的按"勾选顺序"排在前面，未勾的按 families 轮转顺序。
         保持相对顺序是为了页面不抖 —— 每次点击后全部重排会让刚点的那个 chip
         跳到别处，用户会点第二次。 */
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

      // ② 计数徽标
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
    col._redraw = redraw;
    return col;
  };

  const likedCol = buildColumn('likedNotes', false, '我喜欢这些味道');
  const dislikedCol = buildColumn('dislikedNotes', true, '我受不了这些味道（更有效）');

  /* 两栏的互斥要双向生效：勾左边会改右边的状态数组，
     但右边那一栏的 DOM 不会自动知道 —— 必须显式重画它。
     这就是"两栏同屏"比"拆两屏"多出来的唯一复杂度，代价是可控的。 */
  const grid = el('div', { class: 'note-grid' }, likedCol, dislikedCol);
  wrap.appendChild(grid);

  // 每次点击后同步重画另一栏。挂在容器上统一处理，避免每个 chip 各绑一遍。
  grid.addEventListener('click', (ev) => {
    const t = ev.target.closest('.chip');
    if (!t) return;
    const mineDis = t.getAttribute('data-col') === 'disliked';
    (mineDis ? likedCol : dislikedCol)._redraw();
  });

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '都答不出来也没关系：'),
    ' 跳过这一屏，后面还有 5 屏在问别的维度。',
    ' 但如果你能想起一个明确受不了的东西（比如"我闻不了香草"），命中率会明显提高。'
  ));

  wrap.appendChild(navBar('notes'));
  return wrap;
}

/* ============================================================
   合并屏 2：气质（第 3 步）
   ------------------------------------------------------------
   气质 + 气味温度 + 甜度，三问都在说"给人的感觉"。
   合并的代价是这一屏更长，所以三组之间用分隔线与小标题明确分区，
   并且**都不强制**——只答一组也能继续。
   ============================================================ */
function renderMood() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('mood');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '看不懂「香调家族」？'),
    ' 家族只说明大方向（花香 / 木质 / 柑橘…），这一屏问的是它给人的感觉。',
    ' 同一瓶花香，可以清冷也可以甜腻 —— 这就是补上那一层。'
  ));

  // ① 气质
  wrap.appendChild(el('div', { class: 'chips-label' }, '① 整体气质（选一个）'));
  wrap.appendChild(choiceGrid(
    CHARACTER_PRESET.map((c) => ({ id: c.id, zh: c.zh, desc: c.desc })),
    state.answers.characterPreset,
    (id) => {
      state.answers.characterPreset = id;
      state.answers.characterTags = (CHARACTER_PRESET.find((c) => c.id === id) || {}).tags || [];
    }
  ));

  // ② 气味温度
  wrap.appendChild(el('div', { class: 'chips-label' }, '② 气味的冷暖（选一个，可跳过）'));
  wrap.appendChild(choiceGrid(TEMPERATURES, state.answers.temperature, (id) => {
    state.answers.temperature = id;
  }));
  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '怎么判断？'),
    ' 想两个你闻过的东西：一杯热牛奶（暖）、刚剥开的橘子皮（凉）。',
    ' 喜欢"像洗完澡"多半偏凉，喜欢"像毛衣和木头"多半偏暖。'
  ));

  // ③ 甜度
  wrap.appendChild(el('div', { class: 'chips-label' }, '③ 能接受多甜（选一个，可跳过）'));
  wrap.appendChild(choiceGrid(
    SWEETNESS,
    state.answers.sweetness == null ? null : String(state.answers.sweetness),
    (id) => { state.answers.sweetness = Number(id); }
  ));
  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '「晕甜」很常见：'),
    ' 有人闻到甜香会头晕恶心，这不是矫情。有过这种反应就直接选「完全不甜」。'
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
function renderContext() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('context');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  wrap.appendChild(el('div', { class: 'chips-label' }, '① 主战场（选一个）'));
  wrap.appendChild(buildDisc(TAX.occasionMap, {
    label: '主要使用场合',
    selectedId: state.answers.occasion,
    onPick: (o) => { state.answers.occasion = o.id; },
  }));

  wrap.appendChild(el('div', { class: 'chips-label', style: 'margin-top:18px' }, '② 主季节'));
  wrap.appendChild(choiceGrid(SEASONS, state.answers.season, (id) => {
    state.answers.season = id;
    if (state.answers.seasonSecond === id) state.answers.seasonSecond = null;
  }));

  wrap.appendChild(el('div', { class: 'chips-label', style: 'margin-top:12px' }, '次选季节（可跳过）'));
  wrap.appendChild(choiceGrid(
    SEASONS.filter((x) => x.id !== state.answers.season),
    state.answers.seasonSecond,
    (id) => { state.answers.seasonSecond = id; }
  ));

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '关于候选多少：'),
    ' 库里按季节标注为「春 382 · 夏 254 · 秋 389 · 冬 146」（1228 瓶中的占比不同，这是标注覆盖数）。',
    ' 冬天能选的最少，这是数据分布，不是推荐变差了。'
  ));

  wrap.appendChild(navBar('context'));
  return wrap;
}

/* ============================================================
   合并屏 4：浓淡持久（第 5 步）
   ------------------------------------------------------------
   浓郁度滑块 + 浓度档 + 留香时长，三问都在说"多浓、留多久"。
   **这一屏有一个联动必须做**：留香是由浓度推断的（taxonomy 的
   concentrationLongevity.map），所以选浓度时应该同步把留香那一档
   跟着填上 —— 否则用户要手填一个"系统已经能从上一问算出来"的值，
   而两者不一致时引擎会同时收到两个矛盾的约束。
   ============================================================ */
function renderStrength() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('strength');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  // ① 浓郁度滑块（沿用原实现）
  const read = el('div', { class: 'scale-read' });
  const updateRead = () => {
    const v = Number(state.answers.intensity);
    const [a, b] = INTENSITY_LABEL[v];
    read.innerHTML = `<b>${v} / 5 · ${a}</b><br><span>${b}</span>`;
  };
  wrap.appendChild(el('div', { class: 'chips-label' }, '① 你想要多浓'));
  const input = el('input', {
    type: 'range', min: '1', max: '5', step: '1',
    value: String(state.answers.intensity),
    'aria-label': '浓郁度',
    oninput: (ev) => { state.answers.intensity = Number(ev.target.value); updateRead(); },
  });
  wrap.appendChild(el('div', { class: 'scale' }, input,
    el('div', { class: 'scale-ends' },
      el('span', {}, '← 清爽 / 淡'),
      el('span', {}, '浓 / 有分量 →')
    )));
  updateRead();
  wrap.appendChild(read);

  // ② 浓度档
  wrap.appendChild(el('div', { class: 'chips-label', style: 'margin-top:16px' }, '② 浓度（决定留香，选一个）'));
  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '浓度 = 香精占比：'),
    ' 比例越高留得越久，也越容易在密闭空间里让人不舒服。',
    ' 日常最常见的是 EDT 与 EDP。'
  ));
  wrap.appendChild(choiceGrid(CONCENTRATIONS, state.answers.concentration, (id) => {
    state.answers.concentration = id;
    /* 联动：选完浓度就把留香填成推断值。
       下方 ③ 那一行的选中态要跟着变，所以直接 render() 重画整屏 ——
       这一屏没有滚动长列表，重绘不会让用户丢失位置。 */
    const inferred = CONC_TO_LONGEVITY[id];
    if (inferred != null) state.answers.longevity = inferred;
    render();
  }));

  // ③ 留香（按浓度自动给默认值，可手改）
  wrap.appendChild(el('div', { class: 'chips-label', style: 'margin-top:16px' }, '③ 留香时长'));
  const curLong = state.answers.longevity;
  wrap.appendChild(choiceGrid(
    LONGEVITY.map((l) => ({
      id: l.id,
      zh: l.zh + (curLong != null && String(curLong) === l.id ? ' · 推断' : ''),
      desc: l.desc,
    })),
    curLong == null ? null : String(curLong),
    (id) => { state.answers.longevity = Number(id); }
  ));

  wrap.appendChild(el('div', { class: 'term-note is-warn' },
    el('strong', {}, '留香的这一档是推断值：'),
    ' 数据源没有实测持香时长，上面选浓度后会自动填一个按浓度推算的档位（古龙水约 2、EDT 约 3、EDP 约 4、香精约 5）。',
    '你可以手动改成别的档，但要知道它不是实测 —— 同一瓶在干皮和油皮、冬天和夏天差别可以很大。'
  ));

  wrap.appendChild(navBar('strength'));
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
function navBar(stepId) {
  const bar = el('div', { class: 'actions' });

  if (state.step > 0) {
    bar.appendChild(el('button', {
      class: 'btn ghost', type: 'button', onclick: prev,
    }, '← 上一题'));
  }
  bar.appendChild(el('div', { class: 'spacer' }));

  if (stepId === 'family') {
    const done = !!state.answers.family;
    bar.appendChild(el('span', { class: 'hint' }, done ? '中圈可选，不选就按大类推荐' : '先在外圈挑一个大类'));
    bar.appendChild(el('button', {
      class: 'btn', type: 'button', disabled: done ? null : 'disabled',
      onclick: next,
    }, '下一步 →'));
    return bar;
  }

  if (stepId === 'notes') {
    bar.appendChild(el('span', { class: 'hint' }, '两栏都不选也能继续'));
    bar.appendChild(el('button', { class: 'btn', type: 'button', onclick: next }, '下一步 →'));
    return bar;
  }

  /* v19：新增 7 屏的前进按钮。
     其中 character / concentration / longevity 是"点选即自动前进"，
     但仍画一个显式的「下一步」——原因：自动前进是 480ms 后触发的，
     用户点了之后若想反悔，需要一个不依赖"等它自己跳"的出口；
     而且键盘用户 Tab 到这里时，自动前进已经错过了，
     没有按钮他们就卡住了（与第 3 步滑块同一个问题）。 */
  /* 合并后的三步（气质 / 场景 / 浓淡）都是"多项、可只答一部分"，
     所以按钮永远可点 —— 合并屏不该再要求"必须答完才能走"，
     那样合并反而变成了更长的门槛。 */
  if (stepId === 'mood' || stepId === 'context' || stepId === 'strength') {
    bar.appendChild(el('span', { class: 'hint' }, '答几项都行，不答也能继续'));
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
  if (state.step < STEPS.length - 1) {
    state.step += 1;
    render();
  }
}

/* 「点选即自动前进」用的延时跳转。
   为什么不能直接写 setTimeout(next, 480)：
   用户点完选项可能立刻又按了界面上的「下一步」按钮 ——
      t=0    手动 next() → 已经到下一屏
      t=480  那个定时器仍在队列里 → 又跳一屏
   结果是一次操作走了两屏，中间那屏的答案等于没答。
   这里记住排程时的 step，触发时若已经不在那一屏就直接作废。 */
function autoNext(ms) {
  const from = state.step;
  setTimeout(() => { if (state.step === from) next(); }, ms);
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
  if (!state.answers.family) { state.step = 0; render(); return; }
  // 库还没到时，这里会等它下完 —— 只有「四步全答完、但库仍在下载」才会卡到这。
  // 等待期间必须给出可见反馈：按钮换成进度文案并禁用，否则用户会连点几次。
  const busy = setBusy(btn, '正在比对…');
  try {
    const d = await ensurePerfumes();
    state.result = recommend(state.answers, d.perfumes, TAX, { topN: 3 });
    state.step = STEPS.length;
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
    characterPreset: null, characterTags: [], season: null, seasonSecond: null,
    concentration: null, longevity: null, dislikedFamilies: [],
    temperature: null, sweetness: null,
    anchorBrand: null, anchorPerfume: null, anchorNotes: [],
  };
  state.result = null;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- 渲染 ---------- */
function renderProgress() {
  const box = el('div');
  const bar = el('div', { class: 'progress' });
  const total = STEPS.length;
  for (let i = 0; i < total; i++) {
    const cls = i < state.step ? 'done' : i === state.step ? 'now' : '';
    bar.appendChild(el('i', { class: cls }));
  }
  /* v19：进度条下方那一行标签原来硬编码四项（'香型','场合','浓度','香调'）。
     步骤一扩到 10 步就会越界读到 undefined，所以改成从 STEPS 派生：
     每个步骤自己在定义里没给 short 时，退回到 kicker 里的中文。
     十段进度条本身也太密（每段只有 3px 宽），改成"每 2 段并 1 段"会更糊，
     所以保留 10 段，只把段高从 3px 收到 2px（见 _wheel12.css）。 */
  const labels = STEPS.map((st) => st.short || st.title.slice(0, 4));
  const meta = el('div', { class: 'progress-meta' },
    el('span', {}, state.step >= total ? '推荐结果' : labels[state.step]),
    el('span', {}, state.step >= total ? `完成 · 共 ${total} 步` : `${state.step + 1} / ${total}`)
  );
  box.append(bar, meta);
  return box;
}

function renderMasthead() {
  const isResult = state.step >= STEPS.length;
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

function renderResult() {
  const { profile, results } = state.result;
  const wrap = el('div', { class: 'fade-in' });

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
    el('div', { class: 'profile-line' },
      '匹配度 = 规则得分 / 满分。家族吻合 52 + 情绪锚点 22 + 浓度 18 + 香调点名 14 为主要项')
  );
  wrap.appendChild(head);

  results.forEach((r, i) => {
    const p = r.perfume;
    const art = el('article', { class: 'pick' });

    art.appendChild(el('div', { class: 'pick-rank' },
      el('span', { class: 'n' }, `候选 ${String(i + 1).padStart(2, '0')}`),
      el('span', { class: 'score' }, `匹配度 ${r.matchPct}%`)
    ));

    art.appendChild(el('h3', {}, p.name));
    // 数据源有 24 瓶没标浓度 → 不编，直接不显示那一格
    const metaBits = [p.brand];
    if (p.concentrationLabelZh) metaBits.push(p.concentrationLabelZh);
    metaBits.push(`${p.familySource} 源家族`);
    const metaNode = el('div', { class: 'meta' });
    metaBits.forEach((t, i) => {
      if (i > 0) metaNode.appendChild(el('span', { class: 'dot' }, '·'));
      metaNode.appendChild(document.createTextNode(t));
    });
    art.appendChild(metaNode);

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
    const foot = el('div', { class: 'pick-foot' }, ...tags,
      el('a', { href: p.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, '查看数据来源 ↗')
    );
    art.appendChild(foot);
    wrap.appendChild(art);
  });

  wrap.appendChild(el('div', { class: 'actions', style: 'margin-top:36px' },
    el('button', { class: 'btn', type: 'button', onclick: restart }, '重新来一次'),
    el('div', { class: 'spacer' }),
    el('span', { class: 'hint' }, '换一个答案，结果会完全不同')
  ));

  return wrap;
}

function renderFooter() {
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
    el('div', { style: 'margin-top:8px' },
      el('strong', {}, '已知局限 '),
      '持香与扩散为按浓度推断，非实测；不含价格与购买渠道；库容随上游开放数据集更新，可能仍选不到你已经知道的那一瓶'
    )
  );
}

function render() {
  const app = $('#app');
  app.innerHTML = '';
  app.appendChild(renderMasthead());
  app.appendChild(renderProgress());
  if (state.step >= STEPS.length) {
    app.appendChild(renderResult());
  } else {
    app.appendChild(STEPS[state.step].render());
  }
  app.appendChild(renderFooter());

  // 不再自动聚焦第一个扇区。
  // 原先会 focus，导致：① 新访客一进来就看见「清冷」戴着红色焦点环、盘心写着
  // 「正在看 清冷」，误以为已经选中；② 真正的空态（还没选）永远不出现；
  // ③ 焦点环在鼠标用户眼里是"选中"，与真实选择态撞车。
  // 键盘用户仍可用 Tab 进圆盘（roving tabindex 已保证进得去），不需要替他们抢焦点。
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

async function boot() {
  /* index.html 里已有静态骨架屏（不能靠这里注入 —— app.js 是 module，
     自己下载完才执行，那几秒里页面会是空的）。这里只负责抹掉它。 */
  try {
    // 以本模块的位置解析数据路径，而不是以页面位置。
    // 相对 fetch('./data/…') 会随【页面】所在目录变 —— 核查页放在 /tools/
    // 下时会错找 /tools/data/ 而 404（实测踩过）。以 import.meta.url 为基就没这问题。
    const base = new URL('./', import.meta.url);
    // 香水库不阻塞首屏：立刻发请求，但不等它
    ensurePerfumes().catch(() => {});   // 失败在用到时再抛，这里只预热
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
