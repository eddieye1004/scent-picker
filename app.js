/**
 * app.js — 零基础香水选择器的交互层
 *
 * 原则：
 *   1. 一屏一个问题，可后退改答案，答案实时存在内存里。
 *   2. 打分全部在 scoring.js 里完成，前端只负责渲染，不参与判断。
 *   3. 所有解释性文字来自数据或规则，不调模型、不编内容。
 */
import { recommend } from './src/scoring.js';
import { usableEntries } from './src/notes.js';

const state = {
  step: 0,
  answers: {
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
    id: 'emotion',
    kicker: '第 1 步 / 共 4 步',
    title: '你想被别人闻成什么感觉？',
    help: '不必懂香调。选一个你希望别人靠近你时的第一印象就行。',
    render: renderEmotion,
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
// rIn 取 138 而不是更小的值：盘心是一块 34% 的方块，它的四个角比边长更靠外
// （角到圆心 = 34% × √2/2 = 24.0%）。内圆半径必须大于这个数，否则方角穿出内弧，
// 把整条内圆切成四段碎线 —— 实测 rIn=104（21.7%）时就是这样，看着像渲染坏了。
// 138/480 = 28.75%，比方角 24.0% 留出 4.75% 余量。
const DISC = { vb: 480, cx: 240, cy: 240, rOut: 230, rIn: 138, gapDeg: 1.6 };

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
  root.appendChild(svg);

  /* --- 盘心：默认空态，指针移上去就换成那一条的说明 --- */
  const hubKicker = el('div', { class: 'hub-kicker' }, '尚未选择');
  const hubZh = el('div', { class: 'hub-zh' }, '还没选');
  const hubDesc = el('div', { class: 'hub-desc' }, '点任意扇区，或先把指针移上去看看');
  const hub = el('div', { class: 'disc-hub is-idle' }, hubKicker, hubZh, hubDesc);
  root.appendChild(hub);

  // kicker 要跟着状态走：悬停时写「当前选择」是错的——那时还没选。
  const IDLE_KICK = '尚未选择';
  const HOVER_KICK = '正在看';
  const PICK_KICK = '当前选择';
  const showInHub = (it, kind) => {
    if (it) {
      hub.classList.remove('is-idle');
      hubKicker.textContent = kind === 'hover' ? HOVER_KICK : PICK_KICK;
      hubZh.textContent = it.zh;
      hubDesc.textContent = it.desc;
    } else {
      hub.classList.add('is-idle');
      hubKicker.textContent = IDLE_KICK;
      hubZh.textContent = '还没选';
      hubDesc.textContent = '点任意扇区，或先把指针移上去看看';
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
    });
    g.addEventListener('mouseleave', () => {
      const cur = items.find((x) => x.id === pick.current);
      showInHub(cur || null);
      groups.forEach((x, j) => x.classList.toggle('is-hot', items[j].id === pick.current));
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
      onmouseenter: () => showInHub(it, 'hover'),
      onmouseleave: () => {
        const cur = items.find((x) => x.id === pick.current);
        showInHub(cur || null);
        groups.forEach((g, j) => g.classList.toggle('is-hot', items[j].id === pick.current));
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

    root.appendChild(btn);
    buttons.push(btn);
  });

  // 把选择结果记进 pick.current，供 mouseleave / blur 回退盘心
  pick.current = selectedId;

  if (selectedId) {
    const idx = items.findIndex((x) => x.id === selectedId);
    if (idx >= 0) {
      groups[idx].classList.add('is-on');
      showInHub(items[idx], 'pick');
    }
  }

  return root;
}

/* ---------- 第 1 步：情绪（圆盘）---------- */
function renderEmotion() {
  const wrap = el('div', { class: 'fade-in' });

  const lead = el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, STEPS[0].kicker),
    el('h2', { class: 'q-title' }, STEPS[0].title),
    el('p', { class: 'q-help' }, STEPS[0].help)
  );
  wrap.appendChild(lead);

  wrap.appendChild(buildDisc(TAX.emotionMap, {
    label: '想被闻成什么感觉',
    selectedId: state.answers.emotion,
    onPick: (e) => {
      state.answers.emotion = e.id;
      setTimeout(next, 320);   // 留一点时间让高亮动画走完再切题
    },
  }));

  wrap.appendChild(navBar('emotion'));
  return wrap;
}

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
      setTimeout(next, 320);
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

  const mkChips = (list, key, neg) => {
    const zhKey = key === 'likedNotes' ? 'likedZh' : 'dislikedZh';
    const box = el('div', { class: 'chips' });
    list.forEach((n) => {
      const active = state.answers[key].includes(n.en);
      const chip = el('button', {
        class: 'chip' + (neg && active ? ' neg' : ''),
        type: 'button',
        'aria-pressed': String(active),
        onclick: () => {
          const arr = state.answers[key];
          const idx = arr.indexOf(n.en);
          if (idx >= 0) {
            arr.splice(idx, 1);
            delete state.answers[zhKey][n.en];
          } else {
            arr.push(n.en);
            state.answers[zhKey][n.en] = n.zh;  // 记住用户看到的中文名
          }
          chip.setAttribute('aria-pressed', String(idx < 0));
          chip.classList.toggle('neg', neg && idx < 0);
        },
      }, n.zh);
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
    class: 'btn ghost',
    type: 'button',
    style: 'margin-top:14px;padding:7px 14px;font-size:13px',
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
    class: 'btn ghost',
    type: 'button',
    style: 'margin-top:10px;padding:7px 14px;font-size:13px',
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

  if (stepId === 'notes') {
    bar.appendChild(el('span', { class: 'hint' }, '不选也能看结果'));
    bar.appendChild(el('button', {
      class: 'btn', type: 'button', onclick: finish,
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

async function finish() {
  if (!state.answers.emotion) { state.step = 0; render(); return; }
  if (!state.answers.occasion) { state.step = 1; render(); return; }
  // 库还没到时，这里会等它下完 —— 只有「四步全答完、但库仍在下载」才会卡到这
  const d = await ensurePerfumes();
  state.result = recommend(state.answers, d.perfumes, TAX, { topN: 3 });
  state.step = STEPS.length;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function restart() {
  state.step = 0;
  state.answers = { emotion: null, occasion: null, intensity: 3, likedNotes: [], dislikedNotes: [] };
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
  const labels = ['情绪', '场合', '浓度', '香调'];
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
    el('h1', {}, isResult ? '你的三瓶候选' : '从零开始，找到第一瓶香水'),
    el('p', { class: 'lede' },
      isResult
        ? '每一瓶的理由都能反推回你刚才的选择，没有一句是编的。'
        : '不用懂前中后调。回答四个问题，我们会给你三个具体到型号的候选，和选它的理由。'
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

  const first = app.querySelector('.disc-sector, .opt, input[type="range"], .chip');
  if (first && state.step < STEPS.length) first.focus({ preventScroll: true });
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
