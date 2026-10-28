/**
 * app.js — 零基础香水选择器的交互层
 *
 * 原则：
 *   1. 一屏一个问题，可后退改答案，答案实时存在内存里。
 *   2. 打分全部在 scoring.js 里完成，前端只负责渲染，不参与判断。
 *   3. 所有解释性文字来自数据或规则，不调模型、不编内容。
 */
import { recommend } from './src/scoring.js';

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

/* ---------- 第 1 步：情绪 ---------- */
function renderEmotion() {
  const wrap = el('div', { class: 'fade-in' });
  wrap.append(
    el('div', { class: 'q-kicker' }, STEPS[0].kicker),
    el('h2', { class: 'q-title' }, STEPS[0].title),
    el('p', { class: 'q-help' }, STEPS[0].help)
  );

  const box = el('div', { class: 'options' });
  TAX.emotionMap.forEach((e, i) => {
    const b = el('button', {
      class: 'opt',
      type: 'button',
      'aria-pressed': String(state.answers.emotion === e.id),
      onclick: () => {
        state.answers.emotion = e.id;
        box.querySelectorAll('.opt').forEach((x) => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
        setTimeout(next, 180);
      },
    },
      el('span', { class: 'num' }, String(i + 1).padStart(2, '0')),
      el('span', { class: 'label' }, e.zh, el('span', { class: 'desc' }, e.desc)),
      el('span', { class: 'tick' }, '选它 →')
    );
    box.appendChild(b);
  });
  wrap.appendChild(box);
  wrap.appendChild(navBar('emotion'));
  return wrap;
}

/* ---------- 第 2 步：场合 ---------- */
function renderOccasion() {
  const wrap = el('div', { class: 'fade-in' });
  wrap.append(
    el('div', { class: 'q-kicker' }, STEPS[1].kicker),
    el('h2', { class: 'q-title' }, STEPS[1].title),
    el('p', { class: 'q-help' }, STEPS[1].help)
  );

  const box = el('div', { class: 'options' });
  TAX.occasionMap.forEach((o, i) => {
    const b = el('button', {
      class: 'opt',
      type: 'button',
      'aria-pressed': String(state.answers.occasion === o.id),
      onclick: () => {
        state.answers.occasion = o.id;
        box.querySelectorAll('.opt').forEach((x) => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
        setTimeout(next, 180);
      },
    },
      el('span', { class: 'num' }, String(i + 1).padStart(2, '0')),
      el('span', { class: 'label' }, o.zh, el('span', { class: 'desc' }, o.desc)),
      el('span', { class: 'tick' }, '选它 →')
    );
    box.appendChild(b);
  });
  wrap.appendChild(box);
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

  const entries = TAX.noteIndex.entries;

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
  entries.forEach((n, i) => {
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
  const common = order.map((i) => entries[i]);
  const rest = entries.filter((_, i) => !picked.has(i));

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
      moreBtn.textContent = hidden ? '收起' : `展开全部 ${entries.length} 个香调`;
    },
  }, `展开全部 ${entries.length} 个香调`);
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
      disMoreBtn.textContent = hidden ? '收起' : `展开全部 ${entries.length} 个香调`;
    },
  }, `展开全部 ${entries.length} 个香调`);
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

function finish() {
  if (!state.answers.emotion) { state.step = 0; render(); return; }
  if (!state.answers.occasion) { state.step = 1; render(); return; }
  state.result = recommend(state.answers, DATA.perfumes, TAX, { topN: 3 });
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
    )
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
  return el('footer', { class: 'foot' },
    el('div', {},
      el('strong', {}, '关于这些推荐 '),
      '选品完全由规则打分产生，不调用大模型。'
    ),
    el('div', { style: 'margin-top:8px' },
      el('strong', {}, '数据署名 '),
      // 直接取 meta.attribution，与上游 LICENSE 指定格式逐字一致，不在代码里另抄一份
      DATA.meta.attribution,
      ' · ',
      el('a', { href: DATA.meta.licenseUrl, target: '_blank', rel: 'noopener noreferrer' }, 'CC BY 4.0'),
      ' · 快照 ', DATA.meta.sourceSnapshot,
      ' · 原始数据经清洗、家族映射与字段裁剪，',
      el('em', {}, '已修改'),
      '。'
    ),
    el('div', { style: 'margin-top:8px' },
      el('strong', {}, '已知局限 '),
      '持香与扩散为按浓度推断，非实测；不含价格与购买渠道；只有 200 瓶样本，可能选不到你已经知道的那瓶。'
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

  const first = app.querySelector('.opt, input[type="range"], .chip');
  if (first && state.step < STEPS.length) first.focus({ preventScroll: true });
}

/* ---------- 启动 ---------- */
async function boot() {
  try {
    // 以本模块的位置解析数据路径，而不是以页面位置。
    // 相对 fetch('./data/…') 会随【页面】所在目录变 —— 核查页放在 /tools/
    // 下时会错找 /tools/data/ 而 404（实测踩过）。以 import.meta.url 为基就没这问题。
    const base = new URL('./', import.meta.url);
    const [d, t] = await Promise.all([
      fetch(new URL('data/perfumes.json', base)).then((r) => {
        if (!r.ok) throw new Error(`perfumes.json HTTP ${r.status}`);
        return r.json();
      }),
      fetch(new URL('data/taxonomy.json', base)).then((r) => {
        if (!r.ok) throw new Error(`taxonomy.json HTTP ${r.status}`);
        return r.json();
      }),
    ]);
    DATA = d;
    TAX = t;
    render();
  } catch (err) {
    $('#app').innerHTML = `<div class="masthead"><h1>加载失败</h1></div>
      <p class="q-help">${err.message}</p>
      <p class="hint">若你是直接双击打开的 index.html，浏览器会因 file:// 限制拒绝读取 JSON。
      请在本目录启动一个静态服务器：<br><code>node server.js</code> 然后访问 http://localhost:8080</p>`;
  }
}

document.addEventListener('DOMContentLoaded', boot);
