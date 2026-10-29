
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
    kicker: '第 1 步 / 共 4 步',
    title: '你闻着舒服的，是哪一类味道？',
    help: '不用记名字。外圈挑大方向，中圈再收窄一层；不确定就只选外圈。',
    render: renderFamily,
  },
  {
    id: 'occasion',
    kicker: '第 2 步 / 共 4 步',
    title: '主要在哪里用？',
    help: '同一瓶香水，在办公室和约会里表现完全不同。先定主战场。',
    render: renderOccasion,
  },
  {
    id: 'intensity',
    kicker: '第 3 步 / 共 4 步',
    title: '希望它有多"浓"？',
    help: '左边是洗完澡的清透，右边是围巾上留一整天的厚重。',
    render: renderIntensity,
  },
  {
    id: 'notes',
    kicker: '第 4 步 / 共 4 步',
    title: '有没有特别喜欢或受不了的味道？',
    help: '可跳过。点名"讨厌"比点名"喜欢"更有用——排除比加分更准。',
    render: renderNotes,
  },
];

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

   为什么只有一枚：实测 38 个小类的代表香材，32/32 全落在同一个家族里
   （白花是茉莉+晚香玉，都是 floral；果味甜是桃+苹果+梨，都是 gourmand）。
   逐味画会出来一排一模一样的图标 —— 那不是示意图，是重复。
   所以图案只编码"家族"，一枚放大；香材名交给下面那行字去说。

   六种母题按家族选形，不按 32 个小类硬编码 —— 32 张手画必然走形，
   而且家族才是这枚图真正想表达的东西。 */
const PLATE_SIZE = 24;

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
const PLATE_FALLBACK = [{ tag: 'circle', attrs: { cx: 12, cy: 12, r: 7.4 } }];

const PLATE_LABEL = { citrus: '柑橘', floral: '花', woody: '木质', amber: '树脂', fresh: '叶', gourmand: '果实' };

function scentPlate(sub) {
  const entries = (sub.notes || [])
    .map((en) => TAX.noteIndex.entries.find((x) => normNote(x.en) === normNote(en)))
    .filter(Boolean);
  if (!entries.length) return null;

  /* 只画一枚，画得大。
     原本的设想是"每味香材一枚小图标"，实测行不通：38 个小类的代表香材
     32/32 全落在同一个家族里（白花是茉莉+晚香玉，都是 floral），
     逐味画会出来一排一模一样的图标 —— 那不是示意图，是重复。
     而且三枚 22px 的小图标撑不起"示意图"这个位置，读起来还是徽标。
     所以：按家族画一枚放大的标本线稿，香材名交给下面那行小字去说。 */
  const family = entries[0].family;
  const shapes = (PLATE_MOTIFS[family] || (() => PLATE_FALLBACK))();

  const wrap = el('div', { class: 'hub-plate' });
  const svg = svgEl('svg', {
    class: 'plate-svg',
    viewBox: '0 0 ' + PLATE_SIZE + ' ' + PLATE_SIZE,
    fill: 'none',
    'aria-hidden': 'true', focusable: 'false',
  });
  shapes.forEach(({ tag, attrs }) => {
    svg.appendChild(svgEl(tag, Object.fromEntries(
      Object.entries(attrs).map(([k, v]) => [k, String(v)]))));
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
  hubGo.hidden = true;
  const hubReset = el('button', {
    class: 'hub-reset',
    type: 'button',
    onclick: (ev) => {
      ev.stopPropagation();
      selFamily = null; selSub = null; hoverFam = null; hoverSub = null;
      paint();
      onChange(null, null);
    },
  }, '换一个大类');
  hubReset.hidden = true;
  const hub = el('div', { class: 'disc-hub is-idle' },
    hubKicker, hubZh, hubDesc, hubGlyph, hubGo, hubReset);
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
    const g = svgEl('g', { class: 'sector-g lvl1', 'data-fam': f.id });
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
    const rMid = (WHEEL.r1o + WHEEL.r1i) / 2;
    const p = wheelPolar(rMid, midDeg);
    const btn = el('button', {
      class: 'disc-sector lvl1',
      type: 'button',
      role: 'radio',
      'aria-checked': 'false',
      'data-fam': f.id,
      tabindex: i === 0 ? '0' : '-1',
      style: 'left:' + ((p[0] / WHEEL.vb) * 100).toFixed(2) + '%;top:' + ((p[1] / WHEEL.vb) * 100).toFixed(2) + '%',
    },
      el('span', { class: 'zh' }, f.zh),
      el('span', { class: 'notes' }, (f.representativeNotes || []).slice(0, 2).map((e) => noteZhOf(e)).join('·'))
    );
    const enter = () => { hoverFam = f.id; hoverSub = null; paint(); };
    const leave = () => { hoverFam = null; paint(); };
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
  let subBtns = [];
  let subItems = null;

  function buildSubRing(fam) {
    subRing.innerHTML = '';
    subBtns = [];
    subItems = null;
    if (!fam) return;
    const subs = fam.subfamilies || [];
    if (!subs.length) return;
    subItems = subs;
    const step = 360 / subs.length;
    const start = -90 - step / 2;

    subs.forEach((s, i) => {
      const midDeg = start + (i + 0.5) * step;
      /* 摆位用「旋转的手臂」：手臂盒子铺满控件并绕中心转过 θ，
         方格钉在手臂顶端，于是所有方格落在同一半径的圆上；
         方格再反向转回 −θ，文字保持水平。 */
      const armDeg = midDeg + 90;
      const arm = el('div', {
        class: 'sub-arm',
        style: 'transform: rotate(' + armDeg.toFixed(2) + 'deg)',
      });
      const btn = el('button', {
        class: 'disc-sector lvl2 sub-sq',
        type: 'button',
        role: 'radio',
        'aria-checked': 'false',
        'data-sub': s.id,
        tabindex: '-1',
        style: 'transform: translate(-50%, -50%) rotate(' + (-armDeg).toFixed(2) + 'deg); --aq: ' + (-armDeg).toFixed(2) + 'deg',
      }, el('span', { class: 'zh' }, s.zh));
      const enter = () => { hoverSub = s.id; paint(); };
      const leave = () => { hoverSub = null; paint(); };
      btn.addEventListener('mouseenter', enter);
      btn.addEventListener('mouseleave', leave);
      btn.addEventListener('focus', enter);
      btn.addEventListener('blur', leave);
      btn.addEventListener('click', (ev) => { ev.stopPropagation(); chooseSub(fam, s); });
      btn.addEventListener('keydown', (ev) => keyNav(ev, subBtns, i));
      arm.appendChild(btn);
      subRing.appendChild(arm);
      subBtns.push(btn);
    });
  }

  function chooseSub(fam, s) {
    selFamily = fam.id;
    selSub = s.id;
    hoverFam = null;
    hoverSub = null;
    paint();
    onChange(fam, s);
  }

  /* --- 统一重绘 --- */
  let builtFor;
  function paint() {
    const famById = new Map(families.map((f) => [f.id, f]));
    /* 只有"真的选了"才缩放并铺方格；悬停只改盘心预览。
       悬停就缩放会让指针划过时整个版面跳动，比少一个反馈更糟。 */
    const open = !!selFamily;
    const showFamId = selFamily || hoverFam;
    const showFam = showFamId ? famById.get(showFamId) : null;
    if (builtFor !== selFamily) {
      buildSubRing(selFamily ? famById.get(selFamily) : null);
      builtFor = selFamily;
    }
    root.classList.toggle('is-open', open);

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
      subBtns.forEach((b, i) => {
        const s = subItems[i];
        const on = selSub === s.id;
        const hot = hoverSub === s.id;
        b.classList.toggle('is-on', on);
        b.classList.toggle('is-hot', hot && !on);
        b.setAttribute('aria-checked', String(on));
        b.setAttribute('tabindex', on ? '0' : (i === 0 && !selSub ? '0' : '-1'));
      });
    }

    const sub = showFam && selSub ? (showFam.subfamilies || []).find((x) => x.id === selSub) : null;
    const hovSub = showFam && hoverSub ? (showFam.subfamilies || []).find((x) => x.id === hoverSub) : null;
    const focusSub = hovSub || sub;

    let kick;
    let zh;
    let desc;
    let idle = false;
    /* 压深只留给「具体小项」。第一层选中时盘心保持浅色，
       与第二层的浅色方格是同一档 —— 压深代表"定下来了"，不是"点到了"。 */
    let picked = false;
    if (!showFam) {
      kick = '香型轮盘'; zh = '还没选'; desc = '从外圈挑一个大类'; idle = true;
    } else if (focusSub) {
      kick = hovSub ? '正在看' : '已选定';
      zh = focusSub.zh;
      desc = focusSub.descWheel || focusSub.desc;
      picked = !hovSub;
    } else {
      kick = hoverFam && !selFamily ? '正在看' : '已选定大类';
      zh = showFam.zh;
      desc = showFam.style || showFam.oneLine;
    }
    hub.classList.toggle('is-idle', idle);
    hub.classList.toggle('is-picked', picked);
    // 整盘翻深由 root 上的 is-picked 驱动：加深的是盘，不是盘心方块
    root.classList.toggle('is-picked', picked);
    hub.classList.toggle('is-hover', !!(hoverFam || hoverSub) && !picked);
    if (hubZh.textContent !== zh || hubKicker.textContent !== kick) {
      hub.classList.remove('is-swap');
      void hub.offsetWidth;
      hub.classList.add('is-swap');
    }
    hubKicker.textContent = kick;
    hubZh.textContent = zh;
    hubDesc.textContent = desc;

    // 示意图只在落到具体小项时出现：大类层面没有"具体香材构成"可画
    hubGlyph.innerHTML = '';
    hub.classList.toggle('has-glyph', !!picked);
    if (picked && sub) { const plate = scentPlate(sub); if (plate) hubGlyph.appendChild(plate); }

    // 只选了大类时给快捷出口；已落到小项就没必要再催一次
    const canSkip = !!(selFamily && !selSub);
    hubGo.hidden = !canSkip;
    if (canSkip) {
      const f = famById.get(selFamily);
      hubGo.textContent = '就选「' + (f ? f.zh : '') + '」，下一步 →';
    }
    hubReset.hidden = !selFamily;
  }

  paint();
  return root;
}

/* ---------- 第 1 步：香型轮盘（外圈家族 + 中圈子家族）---------- */
function renderFamily() {
  const wrap = el('div', { class: 'fade-in' });

  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, STEPS[0].kicker),
    el('h2', { class: 'q-title' }, STEPS[0].title),
    el('p', { class: 'q-help' }, STEPS[0].help)
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
      box.appendChild(el('p', { class: 'fam-empty' }, '上面转盘里挑一个大类，这里会展开它的代表香材、风格和使用场合。'));
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
    el('div', { class: 'q-kicker' }, STEPS[1].kicker),
    el('h2', { class: 'q-title' }, STEPS[1].title),
    el('p', { class: 'q-help' }, STEPS[1].help)
  );
  wrap.appendChild(lead);

  wrap.appendChild(buildDisc(TAX.occasionMap, {
    label: '主要使用场合',
    selectedId: state.answers.occasion,
    onPick: (o) => {
      state.answers.occasion = o.id;
      setTimeout(next, 620);   // 与第 1 步同一节奏，两屏的手感必须一致
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
  wrap.append(
    el('div', { class: 'q-kicker' }, STEPS[2].kicker),
    el('h2', { class: 'q-title' }, STEPS[2].title),
    el('p', { class: 'q-help' }, STEPS[2].help)
  );

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

/* ---------- 第 4 步：香调点名 ---------- */
function renderNotes() {
  const wrap = el('div', { class: 'fade-in' });
  wrap.append(
    el('div', { class: 'q-kicker' }, STEPS[3].kicker),
    el('h2', { class: 'q-title' }, STEPS[3].title),
    el('p', { class: 'q-help' }, STEPS[3].help)
  );

  // 香调表要扫全库才知道哪些选项真的有货。库还没到时不能退回全表 ——
  // 那会把 0 命中的死选项也画出来，用户点了却推荐不出东西。
  // 改成占位 + 到货后自动重画（正常早已下完，只有慢网首访会看到）。
  if (!DATA?.perfumes?.length) {
    ensurePerfumes()
      .then(() => { if (state.step === 3) render(); })
      .catch((err) => { wrap.appendChild(el('p', { class: 'q-help' }, `香调表加载失败：${err.message}`)); });
    wrap.appendChild(el('div', { class: 'skeleton' },
      el('div', { class: 'skeleton-ring' }),
      el('p', { class: 'skeleton-note' }, '正在读取香水库……')
    ));
    wrap.appendChild(navBar('notes'));
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

  wrap.appendChild(el('div', { class: 'chips-label' }, '我喜欢这些味道'));
  wrap.appendChild(mkChips(common, 'likedNotes', false));
  const moreBox = el('div', { class: 'chips', style: 'margin-top:8px;display:none' });
  moreBox.appendChild(mkChips(rest, 'likedNotes', false));
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

  // 讨厌栏与喜欢栏保持同一套可见范围，避免"喜欢只看到 16 个、讨厌却有 40 个"的不对称。
  wrap.appendChild(el('div', { class: 'chips-label' }, '我受不了这些味道（更有效）'));
  wrap.appendChild(mkChips(common, 'dislikedNotes', true));

  const disMoreBox = el('div', { class: 'chips', style: 'margin-top:8px;display:none' });
  disMoreBox.appendChild(mkChips(rest, 'dislikedNotes', true));
  wrap.appendChild(disMoreBox);

  const disMoreBtn = el('button', {
    type: 'button',
    class: 'btn ghost btn-more',
    onclick: () => {
      const hidden = disMoreBox.style.display === 'none';
      disMoreBox.style.display = hidden ? 'flex' : 'none';
      disMoreBtn.textContent = hidden ? '收起' : `展开全部 ${usable.length} 个香调`;
    },
  }, `展开全部 ${usable.length} 个香调`);
  wrap.appendChild(disMoreBtn);

  wrap.appendChild(navBar('notes'));
  return wrap;
}

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
    bar.appendChild(el('span', { class: 'hint' }, '不选也能看结果'));
    bar.appendChild(el('button', {
      class: 'btn', type: 'button', onclick: (ev) => finish(ev.currentTarget),
    }, '看推荐 →'));
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
function prev() {
  if (state.step > 0) {
    state.step -= 1;
    render();
  }
}

async function finish(btn) {
  if (!state.answers.family) { state.step = 0; render(); return; }
  if (!state.answers.occasion) { state.step = 1; render(); return; }
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
  state.answers = { family: null, subfamily: null, emotion: null, occasion: null, intensity: 3, likedNotes: [], dislikedNotes: [] };
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
  const labels = ['香型', '场合', '浓度', '香调'];
  const meta = el('div', { class: 'progress-meta' },
    el('span', {}, state.step >= total ? '推荐结果' : labels[state.step]),
    el('span', {}, state.step >= total ? '完成' : `${state.step + 1} / ${total}`)
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
        ? '每一瓶的理由都能反推回你刚才的选择，没有一句是编的。'
        : '不用懂前中后调。转盘选香型，再定场合和浓度，换三个具体到型号的候选。'
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
    el('div', { class: 'eyebrow' }, '基于你的四个回答'),
    el('h2', {}, `${profile.emotionZh} · ${profile.occasionZh} · 浓郁度 ${profile.intensity}/5`),
    el('p', {}, '下面三瓶分属不同家族，方便你对比着闻，而不是三瓶一个味道。'),
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
      '选品完全由规则打分产生，不调用大模型。'
    ),
    credit,
    el('div', { style: 'margin-top:8px' },
      el('strong', {}, '已知局限 '),
      '持香与扩散为按浓度推断，非实测；不含价格与购买渠道；只收录了 400 瓶样本，可能选不到你已经知道的那瓶。'
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
