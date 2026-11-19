/**
 * _v6-season.mjs — 插入季节屏「温度光带」并改浓淡屏为「扩散场」（一次性工具）
 *
 * 季节是规格点名的三个定版范例之一（季节题→温度光带），必须存在。
 * 它排在场合之后、浓淡之前：一年与一天是同一类尺度（都是"什么时候"），
 * 连着两屏走完时间轴，比隔开更顺；而浓淡是另一根轴（分量），换轴要换屏气。
 */
import fs from 'node:fs';

const P = 'app.js';
let src = fs.readFileSync(P, 'utf8');

const ANCHOR = '/* ============================================================\n   第 7 屏：浓淡 + 浓度（2026-11-11 由两屏合回一屏）';
const cnt = src.split(ANCHOR).length - 1;
if (cnt !== 1) throw new Error('浓淡屏横幅出现 ' + cnt + ' 次');

const SEASON = `/* ============================================================
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

  const paint = (cur) => {
    const it = SEASONS.find((s) => s.id === cur) || null;
    /* 温度写进 CSS 变量：没选时停在中间偏冷（0），不假装已经选了一档。 */
    band.style.setProperty('--band-temp', String(it ? it.temp : 0));
    band.classList.toggle('is-idle', !it);
    [...band.querySelectorAll ? band.querySelectorAll('.temp-stop') : []].forEach((n) => {
      const on = n.getAttribute('data-season') === cur;
      n.classList.toggle('is-on', on);
      n.setAttribute('aria-checked', String(on));
    });
    gloss.classList.toggle('is-idle', !it);
    gloss.textContent = it
      ? FEEL[it.id]
      : '按你打算主要在哪个季节用选一个；不确定就跳过，不答不扣分';
  };

  SEASONS.forEach((s, i) => {
    const on = state.answers.season === s.id;
    /* 每档在光带上的位置由它的 temp 决定，**不平均分四格** ——
       平均分就把"温度轴"退回成"四个并列选项"。
       归一化：(temp + 1) / 2 → 0..1 的百分比。 */
    const pos = ((s.temp + 1) / 2) * 100;
    band.appendChild(el('button', {
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
    ));
  });

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

`;

src = src.replace(ANCHOR, SEASON + ANCHOR);
fs.writeFileSync(P, src);
console.log('✓ 插入季节屏（温度光带）');
