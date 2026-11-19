/**
 * _v6-add2.mjs — 用生活短语选择器替换两个「香调点名」屏（一次性工具）
 *
 * 定位用唯一字符串 `const NOTE_PEEK = 16;` 与 `function renderLikedNotes()`，
 * 两者之间（含）整段换成 renderLifePicker。先断言唯一性再写盘。
 */
import fs from 'node:fs';

const P = 'app.js';
let src = fs.readFileSync(P, 'utf8');

const START = '/* ============================================================\n   合并屏 1：香调点名（第 2 步）';
const END_MARK = "function renderDislikedNotes() { return renderNotePicker('disliked'); }";

const a = src.indexOf(START);
if (a < 0) throw new Error('找不到起点');
if (src.indexOf(START, a + 1) >= 0) throw new Error('起点不唯一');
const bMark = src.indexOf(END_MARK, a);
if (bMark < 0) throw new Error('找不到终点');
const b = bMark + END_MARK.length;

const NEW = `/* ============================================================
   第 3 / 4 屏：想要的味道 / 受不了的味道（生活短语）
   ------------------------------------------------------------
   ==== 为什么不用香材名 ====
   规格底线：全程无香调术语题。上一版这两屏列的是「佛手柑 / 零陵香豆 /
   橡苔」—— 一个零基础用户既不认识这些词，也无法判断自己喜不喜欢。
   它们不是"选项"，是考卷。

   ==== 为什么仍然是"点名具体东西"而不是"挑一个大类" ====
   引擎侧 likedNotes 是 +14、dislikedNotes 是 **-40**。这两个因子之所以有效，
   恰恰因为它们是具体的：点「香草」只命中含香草的瓶，点「甜的」等于没点。
   所以术语必须消失，**具体性不能消失** —— 生活短语就是这两件事的交点：
   「刚剥开的橘子皮」任何一个人都能判断，同时精确对应 bergamot/lemon/grapefruit。

   ==== 交互 ====
   多选。点一张卡，它自己翻成"已收下"的样子并移到队首（已选置顶），
   下方那一行译文换成这个短语的身体经验（规格 5：选项区常驻一句生活化译文行）。
   不弹层、不换控件 —— 反馈是内容本身的变化。

   ==== 两屏共用一个渲染器 ====
   差别只有 key / 标题 / 语气 / 色调。写两个几乎相同的函数，
   下次改交互要改两遍且必然漏一处。
   ============================================================ */
function renderLifePicker(kind) {
  const neg = kind === 'unwanted';
  const key = neg ? 'unwanted' : 'wanted';
  const stepId = neg ? 'unwanted' : 'wanted';

  const wrap = el('div', { class: 'fade-in' });
  const head = stepHead(stepId);
  wrap.appendChild(el('div', { class: 'stage-lead' },
    el('div', { class: 'q-kicker' }, head.kicker),
    el('h2', { class: 'q-title' }, head.title),
    el('p', { class: 'q-help' }, head.help)
  ));

  /* 库未到：短语的命中数要读香水库，没有就先给全表。
     短语表本身是静态的，先画出来；库到了也不影响已选。 */
  const items = livePhrases();

  const bar = el('div', { class: 'life-bar' });
  wrap.appendChild(bar);

  const grid = el('div', { class: 'life-grid' + (neg ? ' is-neg' : '') });
  wrap.appendChild(grid);

  /* 译文行：常驻。选了什么说什么，没选时说这一屏在挑什么 ——
     规格 5 要求它"常驻"，所以不能只在选中后出现。 */
  const gloss = el('p', { class: 'life-gloss is-idle' });
  wrap.appendChild(gloss);

  const paintBar = () => {
    const sel = state.answers[key] || [];
    bar.innerHTML = '';
    if (!sel.length) {
      bar.appendChild(el('span', { class: 'life-count is-empty' }, '还没点名任何一个'));
      return;
    }
    bar.appendChild(el('span', { class: 'life-count is-on' }, \`已收下 \${sel.length} 个\`));
    /* 已选的做成可撤小签：点一下取消。
       为什么不回网格里取消：网格里已选项被置顶了，选的落点与取消的落点
       是同一块区域，误触会让人反复选/取消。小签在网格外，位置稳定。 */
    for (const id of sel) {
      const d = items.find((x) => x.id === id) || LIFE_NOTES.find((x) => x.id === id);
      if (!d) continue;
      bar.appendChild(el('button', {
        class: 'life-tag', type: 'button',
        onclick: () => { togglePhrase(id); redraw(); },
        'aria-label': '取消 ' + d.zh,
      }, d.zh, el('span', { class: 'life-tag-x', 'aria-hidden': 'true' }, '×')));
    }
  };

  const paintGloss = () => {
    const sel = state.answers[key] || [];
    const last = sel.length ? LIFE_NOTES.find((x) => x.id === sel[sel.length - 1]) : null;
    gloss.classList.toggle('is-idle', !last);
    gloss.textContent = last
      ? \`\${last.zh} —— \${last.hint}\`
      : (neg
        ? '想到哪一个点哪一个。实在想不起来就跳过，这一屏可以空着走'
        : '想到哪一个点哪一个。一个都想不起来就跳过，后面还有别的维度');
  };

  function togglePhrase(id) {
    const sel = state.answers[key] || (state.answers[key] = []);
    const i = sel.indexOf(id);
    const otherKey = neg ? 'wanted' : 'unwanted';
    if (i >= 0) {
      sel.splice(i, 1);
    } else {
      sel.push(id);
      /* 同一条短语不能既"想要"又"受不了"：从对面移除。
         否则引擎会同时拿到 +14 与 -40 两个互相打架的因子。 */
      const o = state.answers[otherKey] || [];
      const oi = o.indexOf(id);
      if (oi >= 0) o.splice(oi, 1);
    }
    syncPhrasesToNotes();
  }

  const redraw = () => {
    const sel = state.answers[key] || [];
    grid.innerHTML = '';
    /* 已选置顶：勾了立刻看得见。这条是 v19 拆屏时留下的关键设计 ——
       没有它，选中项留在原位，用户往下滚就忘了自己勾过什么。 */
    const ordered = [
      ...sel.map((id) => items.find((x) => x.id === id)).filter(Boolean),
      ...items.filter((x) => !sel.includes(x.id)),
    ];
    const hit = DATA?.perfumes?.length ? lifeNoteHitCount() : null;
    for (const d of ordered) {
      const on = sel.includes(d.id);
      const cnt = hit ? (hit.get(d.id) || 0) : null;
      grid.appendChild(el('button', {
        class: 'life-card' + (on ? ' is-on' : '') + (neg ? ' is-neg' : ''),
        type: 'button',
        'data-phrase': d.id,
        'aria-pressed': String(on),
        onclick: () => { togglePhrase(d.id); redraw(); },
      },
        el('span', { class: 'life-zh' }, d.zh),
        el('span', { class: 'life-hint' }, d.hint),
        /* 库内命中数：不是"推荐度"，是"我们有多少瓶含这个东西"。
           写出来是为了让"点了没反应"这件事不发生 —— 看见 0 的选项就不会点。 */
        cnt != null ? el('span', { class: 'life-n', 'aria-hidden': 'true' }, String(cnt)) : null
      ));
    }
    paintBar();
    paintGloss();
  };

  redraw();

  wrap.appendChild(el('div', { class: 'term-note' },
    neg
      ? el('strong', {}, '这一题比上一题更有效：')
      : el('strong', {}, '想不起来也没关系：'),
    neg
      ? ' 讨厌的东西没有替代品，喜欢的东西往往能找到几个相似的 —— 排除一项，比多喜欢一项更能收窄范围。'
      : ' 跳过这一屏，后面还有几屏在问别的维度。'
  ));

  wrap.appendChild(navBar(stepId));
  return wrap;
}

/* 把短语状态同步到引擎认识的两个字段。
   这是整条映射层的唯一写入口 —— 别处不许直接写 likedNotes/dislikedNotes，
   否则漏一次同步就会出现"界面上勾了、引擎不知道"。 */
function syncPhrasesToNotes() {
  state.answers.likedNotes = notesOfPhrases(state.answers.wanted);
  state.answers.dislikedNotes = notesOfPhrases(state.answers.unwanted);
  state.answers.likedZh = zhOfPhrases(state.answers.wanted);
  state.answers.dislikedZh = zhOfPhrases(state.answers.unwanted);
}

function renderWanted() { return renderLifePicker('wanted'); }
function renderUnwanted() { return renderLifePicker('unwanted'); }
`;

src = src.slice(0, a) + NEW + src.slice(b);
fs.writeFileSync(P, src);
console.log('✓ 替换香调两屏为生活短语选择器');
