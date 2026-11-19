/**
 * _v6-diffuse.mjs — 浓淡屏改为「扩散场」（一次性工具）
 *
 * 规格 5·补 点名：浓淡题→扩散场。这是三个定版范例里最需要改的一屏 ——
 * 现状是「一根滑块 + 一组单选卡」，滑块与浓度是两件事却长得像两件无关的东西。
 *
 * 扩散场把两件事收到同一个物件上：**同心环的半径就是扩散距离**。
 * 拖外层环 = 想要多远（体感）；内圈那一档 = 浓度（香精占比，决定半径能撑多久）。
 * 圆盘的设计逻辑（几何=内容）在这里第二次成立 —— 第一次是场合的时间轴。
 *
 * 替换范围：1854..1966（renderConcentration 全体）。
 */
import fs from 'node:fs';

const P = 'app.js';
const out = fs.readFileSync(P, 'utf8').split('\n');
const FROM = 1854;
const TO = 1966;
if (!out[FROM - 1].startsWith('function renderConcentration()')) {
  console.error('✗ 首行不符：' + out[FROM - 1].slice(0, 60)); process.exit(1);
}
if (out[TO - 1].trim() !== '}') {
  console.error('✗ 尾行不符：' + out[TO - 1].slice(0, 60)); process.exit(1);
}

const NEW = `/* ============================================================
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

  const paintRings = () => {
    const v = Number(state.answers.intensity);
    [...field.querySelectorAll('.diffuse-ring')].forEach((r) => {
      const rv = Number(r.getAttribute('data-v'));
      r.classList.toggle('is-on', rv === v);
      r.classList.toggle('is-in', rv < v);
      r.setAttribute('aria-checked', String(rv === v));
    });
  };

  RINGS.forEach((r) => {
    const on = Number(state.answers.intensity) === r.v;
    /* 环的直径由档位派生：最小 30%、每档 +14%，与 RINGS 顺序一致。
       这样"往外走一档"在视觉上真的多一圈，不是一个数字变了。 */
    const pct = 32 + (r.v - 1) * 15;
    field.appendChild(el('button', {
      class: 'diffuse-ring' + (on ? ' is-on' : ''),
      type: 'button',
      role: 'radio',
      'aria-checked': String(on),
      'data-v': String(r.v),
      'aria-label': r.v + ' / 5 · ' + r.zh + '：' + r.hint,
      style: '--ring-pct:' + pct + '%',
      tabindex: on || (r.v === Number(state.answers.intensity)) ? '0' : '-1',
      onclick: () => {
        state.answers.intensity = r.v;
        paintRings();
        paintRead();
        paintWarn();
        applyAmbient();
      },
    }, el('span', { class: 'diffuse-label' }, r.zh)));
  });
  wrap.appendChild(field);

  const read = el('div', { class: 'diffuse-read' });
  const paintRead = () => {
    const v = Number(state.answers.intensity);
    const r = RINGS.find((x) => x.v === v) || RINGS[2];
    read.innerHTML = '';
    read.appendChild(el('b', {}, \`\${v} / 5 · \${r.zh}\`));
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
    const paintWarn = () => {
      const gap = band && want ? (want < band[0] ? band[0] - want : (want > band[1] ? want - band[1] : 0)) : 0;
      /* 最外那圈在撑不住时虚掉：这是"反馈是内容本身的变化" ——
         同一个物件给出警告，不另起一条提示。 */
      const rings = [...field.querySelectorAll('.diffuse-ring')];
      rings.forEach((r) => r.classList.toggle('is-strained',
        gap >= 2 && Number(r.getAttribute('data-v')) === want));
      warn.innerHTML = '';
      if (gap < 2) { warn.style.display = 'none'; return; }
      warn.style.display = '';
      const concZh = (CONCENTRATIONS.find((c) => c.id === conc) || {}).zh || conc;
      warn.append(
        el('strong', {}, '① 和 ② 差得有点远：'),
        \` 你要它走到「\${RINGS.find((x) => x.v === want) ? RINGS.find((x) => x.v === want).zh : want}」，\`
        + \`但\${concZh}通常撑不到那里。\`,
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
`;

out.splice(FROM - 1, TO - FROM + 1, ...NEW.split('\n'));
fs.writeFileSync(P, out.join('\n'));
console.log('✓ 浓淡屏改为扩散场');
