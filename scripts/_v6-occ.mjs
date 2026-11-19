/**
 * _v6-occ.mjs — 重写场合屏为「昼夜光景」（一次性工具）
 *
 * 范围：1593..1616（renderOccasion 全体）。首行 `function renderOccasion() {`，
 * 尾行 `}`。这一屏是规格点名的三个定版范例之一（场合题→昼夜光景）。
 *
 * 保留 buildDisc（圆盘仍在用：场合名不是术语，圆盘的分区几何在这里仍然成立），
 * 但在圆盘之外加一层**天光弧**：把五个场合按 OCCASION_TIME 的时段排成
 * 从晨到夜的连续弧，选中时那一段的天色亮起来。这是"昼夜光景"的本体。
 */
import fs from 'node:fs';

const P = 'app.js';
const out = fs.readFileSync(P, 'utf8').split('\n');
const FROM = 1593;
const TO = 1616;
if (!out[FROM - 1].startsWith('function renderOccasion()')) {
  console.error('✗ 首行不符：' + out[FROM - 1].slice(0, 60)); process.exit(1);
}
if (out[TO - 1].trim() !== '}') {
  console.error('✗ 尾行不符：' + out[TO - 1].slice(0, 60)); process.exit(1);
}

const NEW = `/* ============================================================
   第 5 屏：场合（昼夜光景）
   ------------------------------------------------------------
   ==== 内容隐喻 ====
   场合问的是"什么时候用"，那就把它画成**一天**：五个场合依时段
   从左到右排在一条地平线上 —— 上班/上课、日常/居家、运动/户外在白天，
   约会、正式场合在傍晚之后。位置的顺序就是时间的顺序，
   用户不用理解"场合"这个抽象名词，看一眼天色就知道自己在选哪一段。

   ==== 为什么保留圆盘 ====
   圆盘的成立条件是「控件几何 = 内容结构」，而场合的几何不是树，
   是一天。所以**圆心那套同心环不搬**，只留它可点、可读、可键盘操作的
   交互纪律（真实 button + radiogroup + roving tabindex + 44px 触达），
   几何交给地平线：弧段角度 = 时刻，段长 = 这段时间有多常用。

   ==== 反馈是内容本身的变化 ====
   选中一段，那段的天色由灰转实（.is-on 给一段天光渐变），
   同时下方译文换成这个场合的「光线 + 距离」描述：
   通勤是"白天的办公室里、一臂距离"，约会是"晚上、靠近才闻到"。
   不再新增控件、不弹层。
   ============================================================ */
function renderOccasion() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('occasion');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  const items = TAX && TAX.occasionMap ? TAX.occasionMap : [];

  /* 排序：按 OCCASION_TIME 的时段（day 在前、evening 在后），
     同时段内保持 taxonomy 的原始顺序。这份顺序就是地平线的顺序，
     **不由 CSS 决定** —— 位置是内容，不能靠样式排。 */
  const TIME_ORDER = { day: 0, evening: 1 };
  const ordered = items
    .map((o, i) => ({ o, i, t: TIME_ORDER[o.time] ?? 0.5 }))
    .sort((a, b) => (a.t - b.t) || (a.i - b.i))
    .map((x) => x.o);

  /* 每个场合的「光线 + 距离」译文。这两件事正是场合真正影响推荐的地方：
     时段（timesOfDay 因子 6 分）与扩散上限（maxSillage）。 */
  const SCENE = {
    commute: '白天的办公室，一臂距离 —— 要让同事闻到一点点，不能更多',
    date: '晚上，靠近才闻到 —— 距离近，所以要有记忆点',
    daily: '自己家里，不为了谁 —— 舒服优先，味道淡一点也没关系',
    formal: '晚上，正装场合 —— 要站得住，不能轻飘',
    outdoor: '白天，户外 —— 会出汗、会补喷，所以清爽比浓度重要',
  };

  const sky = el('div', { class: 'hour-sky' });
  const gloss = el('p', { class: 'hour-gloss is-idle' });

  const paint = (cur) => {
    [...sky.children].forEach((c) => {
      const on = c.getAttribute('data-occ') === cur;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-checked', String(on));
    });
    const it = ordered.find((o) => o.id === cur);
    gloss.classList.toggle('is-idle', !it);
    gloss.textContent = it
      ? \`\${SCENE[it.id] || it.desc}\`
      : '选一个最像的。拿不准就选日常 —— 它是最宽的那一档';
  };

  /* 地平线本体。用 radiogroup 托管，子项是真实 button：
     弧段的视觉由 CSS 的 .hour-band 负责，可点的是叠在上面的 button。 */
  const rail = el('div', { class: 'hour-rail', role: 'radiogroup', 'aria-label': '使用场合' });
  ordered.forEach((it, i) => {
    const on = state.answers.occasion === it.id;
    rail.appendChild(el('button', {
      class: 'hour-band' + (on ? ' is-on' : '') + (it.time === 'evening' ? ' is-night' : ''),
      type: 'button',
      role: 'radio',
      'aria-checked': String(on),
      'data-occ': it.id,
      /* roving tabindex：整组只留一个 Tab 落点，方向键在组内移动。 */
      tabindex: on || (state.answers.occasion == null && i === 0) ? '0' : '-1',
      onclick: () => {
        state.answers.occasion = it.id;
        paint(it.id);
        /* 时段也是背景层的一个输入（SEASON/intensity 之外），
           但只调浓度不改方向 —— 见 src/ambient.js 第 2 条。 */
        applyAmbient();
      },
      onkeydown: (ev) => {
        let d = 0;
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') d = 1;
        else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') d = -1;
        else return;
        ev.preventDefault();
        const to = (i + d + ordered.length) % ordered.length;
        state.answers.occasion = ordered[to].id;
        paint(ordered[to].id);
        applyAmbient();
        rail.children[to].focus();
      },
    },
      el('span', { class: 'hour-zh' }, it.zh),
      el('span', { class: 'hour-desc' }, it.desc)
    ));
  });

  sky.appendChild(el('div', { class: 'hour-glow', 'aria-hidden': 'true' }));
  sky.appendChild(rail);
  /* 晨 / 夜两个端点刻度：让"这是一条时间轴"这件事成立，
     否则五段只是五个横格子。它们是刻度，不是装饰标签。 */
  sky.appendChild(el('div', { class: 'hour-ends', 'aria-hidden': 'true' },
    el('span', {}, '早晨'), el('span', {}, '夜里')));

  paint(state.answers.occasion);
  wrap.appendChild(sky);
  wrap.appendChild(gloss);

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '为什么问场合：'),
    ' 场合决定浓度下限与时段。同一瓶香水在通勤和约会里的宽容度差得很远，'
    + ' 这一项比"你觉得自己喜欢什么"更稳定。'
  ));

  wrap.appendChild(navBar('occasion'));
  return wrap;
}
`;

out.splice(FROM - 1, TO - FROM + 1, ...NEW.split('\n'));
fs.writeFileSync(P, out.join('\n'));
console.log('✓ 场合屏改为昼夜光景');
