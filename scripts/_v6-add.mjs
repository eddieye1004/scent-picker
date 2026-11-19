/**
 * _v6-add.mjs — 把 v6 的新屏插进 app.js（一次性工具，跑完可删）
 *
 * 插入点全部用**唯一字符串**定位（不用横幅注释，那正是上次吃错 1300 行的原因），
 * 每处插入前断言该字符串在文件里只出现 1 次。
 */
import fs from 'node:fs';

const P = 'app.js';
let src = fs.readFileSync(P, 'utf8');

function once(marker) {
  const n = src.split(marker).length - 1;
  if (n !== 1) throw new Error(`定位串出现 ${n} 次（必须恰好 1 次）：${marker.slice(0, 60)}`);
  return marker;
}

function insertBefore(marker, text, label) {
  once(marker);
  src = src.replace(marker, text + '\n' + marker);
  console.log('· 插入 ' + label);
}

function insertAfter(marker, text, label) {
  once(marker);
  src = src.replace(marker, marker + '\n' + text);
  console.log('· 插入 ' + label);
}

/* ---------- 1. 预算屏 + 大方向屏（放在 renderAnchor 之前） ---------- */
const BUDGET_AND_DIRECTION = `/* ============================================================
   第 1 屏：预算（标本签的价签行）
   ------------------------------------------------------------
   ==== 内容隐喻 ====
   预算不是"填一个数字"，是**从货架上取下一个价位区间**。
   所以交互不是输入框，是四枚价签横排：每枚写着区间与"这一档有几瓶"，
   选中时价签的下沿像被剪开一样翻起 —— 剪口是标本签的固有形态
   （挂绳穿过的地方），也是这一屏唯一属于它的效果。

   ==== 为什么候选数必须写在价签上 ====
   实测 622/1388 瓶能查到价。不写数字，"300 元以内"看起来和"1200 元以上"
   一样大；写了数字，用户立刻看见 152 vs 165 —— 四档是**等量级**的，
   不会出现"选了个只有 12 瓶的档"，也就不会出现"答完发现没货"。

   ==== 为什么价位未知的瓶子在具体档里不参与 ====
   见 poolForBudget() 的注释。这一屏的说明行必须把这句话写出来：
   用户可以接受"少了 766 瓶"，不能接受"选 300 以内却推荐 3000 元的"。
   ============================================================ */
function renderBudget() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('budget');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  const idx = priceIndex();
  const bands = idx && Array.isArray(idx.bands) ? idx.bands : [];
  const stats = idx && idx.stats ? idx.stats : null;

  const row = el('div', { class: 'price-row', role: 'radiogroup', 'aria-label': '价位区间' });
  /* 「不限 / 还不知道」永远在最后：它是退路，不该出现在第一个位置
     —— 第一个位置会被读成"推荐选项"。 */
  const opts = [...bands.map((b) => ({
    id: b.id,
    zh: b.zh,
    n: stats && stats.counts ? (stats.counts[b.id] || 0) : null,
  })), { id: (idx && idx.anyId) || 'any', zh: '不限 / 还不知道', n: null }];

  const total = stats ? stats.priced : null;
  const unknown = stats ? stats.unpriced : null;

  for (const o of opts) {
    const on = (state.answers.budget || 'any') === o.id;
    row.appendChild(el('button', {
      class: 'price-tab' + (on ? ' is-on' : ''),
      type: 'button',
      role: 'radio',
      'aria-checked': String(on),
      'data-budget': o.id,
      onclick: () => {
        state.answers.budget = o.id;
        [...row.children].forEach((c) => {
          const mine = c.getAttribute('data-budget') === o.id;
          c.classList.toggle('is-on', mine);
          c.setAttribute('aria-checked', String(mine));
        });
        paintNote();
      },
    },
      /* 剪口：一枚小三角，选中时翻起。用 span 而不是伪元素，
         因为要能被读屏忽略（aria-hidden）。 */
      el('span', { class: 'price-notch', 'aria-hidden': 'true' }),
      el('span', { class: 'price-zh' }, o.zh),
      o.n != null ? el('span', { class: 'price-n' }, o.n + ' 瓶') : null
    ));
  }
  wrap.appendChild(row);

  /* 说明行跟着选择变：选具体档说"未知价位不参与"，选不限说"全库都上"。
     这两句不能合并成一句 —— 它们说的是完全不同的事实。 */
  const note = el('p', { class: 'price-note' });
  const paintNote = () => {
    const cur = state.answers.budget || 'any';
    const isAny = cur === ((idx && idx.anyId) || 'any');
    note.classList.toggle('is-idle', isAny);
    note.textContent = isAny
      ? \`全库 \${(stats ? stats.totalPerfumes : 1388)} 瓶都能挑；其中 \${unknown != null ? unknown : 766} 瓶价位未知，也会一起参与\`
      : \`只在这一档里挑。\${unknown != null ? unknown : 766} 瓶价位未知的不参与 —— 它们在每一档都可能，混进来会推出买不起的瓶子\`;
  };
  paintNote();
  wrap.appendChild(note);

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '关于这个价位：'),
    \` 价来自淘宝商品页标价，不是同规格瓶的专柜价；全库 \${(stats ? stats.totalPerfumes : 1388)} 瓶里 \${total != null ? total : 622} 瓶能查到价，\`
    + ' 其余价位未知。选具体档时，价位未知的不参与；选「不限」时它们也在。'
  ));

  wrap.appendChild(navBar('budget'));
  return wrap;
}

/* ============================================================
   第 2 屏：大方向（昼夜光景）
   ------------------------------------------------------------
   ==== 内容隐喻 ====
   这一题问的不是味道，是"什么时候、什么光线下你希望被闻到"。
   所以控件是一片**天色**：六个方向各占一条地平线，从左到右是
   天光从冷到暖、从暗到亮的连续过渡 —— 位置本身在教用户"这些不是并列的六样东西，
   是同一天里的六个时刻"。

   ==== 为什么它是背景层的源头 ====
   规格 3：底噪由**第一个大方向**定调。所以这一屏在被选中的那一刻，
   要让人看见"天色定了"：选中扇区的天色向上漫开一格，成为后续所有屏的底色起点。
   这个"漫开"只做一次、只在这一屏 —— 后面各屏的底噪只加不减，不再重演。

   ==== 反馈是内容本身的变化 ====
   选中后不再新增任何控件：地平线本身抬高一档、下方那行译文换成这个方向的
   "一天里的哪一刻"。不弹层、不换容器。
   ============================================================ */
function renderDirection() {
  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead('emotion');
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  const items = TAX && TAX.emotionMap ? TAX.emotionMap : [];
  const sky = el('div', { class: 'sky', role: 'radiogroup', 'aria-label': '整体方向' });
  const gloss = el('p', { class: 'sky-gloss is-idle' });

  /* 每个方向配一句"一天里的哪一刻"。这不是新内容：
     taxonomy 的 desc 是气味层面的（「像晒太阳、像羊绒衫」），
     这里补的是**时间层面**的对应，用于让"底噪定调"这件事可被感知。 */
  const MOMENT = {
    cold: '清晨六点，窗还没开',
    warm: '下午三点，阳光斜进屋里',
    clean: '刚洗完澡的浴室，灯是白的',
    mysterious: '入夜后，只开了一盏台灯',
    bright: '正午，所有东西都是清楚的',
    lazy: '周末上午，赖着没起床',
  };

  const paint = (cur) => {
    [...sky.children].forEach((c) => {
      const on = c.getAttribute('data-dir') === cur;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-checked', String(on));
    });
    const it = items.find((x) => x.id === cur);
    gloss.classList.toggle('is-idle', !it);
    gloss.textContent = it
      ? \`\${MOMENT[it.id] || ''} —— \${it.desc}\`
      : '选一个最接近的。这一题定的是整程的调子，后面每一屏都会沿它走';
  };

  items.forEach((it) => {
    const on = state.answers.emotion === it.id;
    sky.appendChild(el('button', {
      class: 'sky-band' + (on ? ' is-on' : ''),
      type: 'button',
      role: 'radio',
      'aria-checked': String(on),
      'data-dir': it.id,
      onclick: () => {
        state.answers.emotion = it.id;
        /* 气质/冷暖/甜度由方向反推（v6 的气质屏已退场，这一维不能白丢）。 */
        applyDirectionToCharacter(it.id);
        paint(it.id);
        applyAmbient();
      },
    },
      el('span', { class: 'sky-line', 'aria-hidden': 'true' }),
      el('span', { class: 'sky-zh' }, it.zh),
      el('span', { class: 'sky-moment' }, MOMENT[it.id] || '')
    ));
  });

  paint(state.answers.emotion);
  wrap.appendChild(sky);
  wrap.appendChild(gloss);

  wrap.appendChild(el('div', { class: 'term-note' },
    el('strong', {}, '为什么先问这一题：'),
    ' 它决定后面每一屏的光线与温度 —— 选「清冷」整程会越走越凉，选「温暖」会越走越暖。'
    + ' 这不是装饰：同一瓶香水在不同光线下读起来是两种东西。'
  ));

  wrap.appendChild(navBar('emotion'));
  return wrap;
}
`;

insertBefore('function renderAnchor() {', BUDGET_AND_DIRECTION, '预算屏 + 大方向屏');

/* ---------- 2. 底噪应用函数（放在 render() 之前） ---------- */
const AMBIENT = `/* ---------- 背景层：把 ambientOf() 的结果写到 #app 的 CSS 变量上 ----------
   为什么走 CSS 变量而不是直接改样式：底噪是一条**连续**的量，逐屏重算、
   逐屏写在同一个变量上，样式层只负责"怎么用这三个数"。这样调强度上限
   不必碰 JS，调方向也不必碰 CSS。
   hardCap 在样式层再做一次（见 styles/src/90-quiz-v6.css 的 .amb-layer），
   两处都夹是为了"只改一处也不会失控"。 */
function applyAmbient() {
  const app = $('#app');
  if (!app) return;
  const list = curSteps();
  const total = list.length;
  /* 结果页的 step 等于 total —— 底噪到那一屏才是满格，这是"一程走完"的收尾。 */
  const amb = ambientOf(state.answers, state.step, total);
  const vars = ambientVars(amb);
  for (const [k, v] of Object.entries(vars)) app.style.setProperty(k, v);
  app.setAttribute('data-amb', amb.active ? amb.axis : 'none');
  /* 边距仪器区里的一行微文：方向 + 档位。它替代了"装饰性小字"，
     是这一程走到哪儿的一个可读刻度。 */
  const tick = document.querySelector('.amb-tick');
  if (tick) tick.textContent = amb.kicker;
}
`;

insertBefore('function render() {', AMBIENT, 'applyAmbient');

fs.writeFileSync(P, src);
console.log('✓ 写入完成');
