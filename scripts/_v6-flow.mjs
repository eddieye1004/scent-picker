/**
 * _v6-flow.mjs — 导航条 / finish / restart / render / 结果页接线（一次性工具）
 *
 * 五处改动，逐处用唯一锚串定位：
 *  ① navBar：删掉已不存在的步骤 id（family/likedNotes/dislikedNotes/mood/dislikedFamilies），
 *     补 wanted/unwanted/budget/emotion/season 的分支。
 *  ② finish：候选池按预算圈定；并且不再要求 family。
 *  ③ restart：清空表补 wanted/unwanted/budget，并重置 resultView。
 *  ④ render：写底噪变量、边距仪器区的刻度。
 *  ⑤ 结果页：加「换一批」与「改一题重推」。
 */
import fs from 'node:fs';

const P = 'app.js';
let s = fs.readFileSync(P, 'utf8');
const once = (m) => {
  const n = s.split(m).length - 1;
  if (n !== 1) throw new Error(`定位串出现 ${n} 次：${m.slice(0, 50)}`);
};

/* ---------- ① navBar ---------- */
const NAV_START = "  if (stepId === 'likedNotes') {";
const NAV_END = "  /* 走到这里说明该屏的按钮形态没被上面任何一条接住";
once(NAV_START); once(NAV_END);
const a = s.indexOf(NAV_START);
const b = s.indexOf(NAV_END);
const NAV_NEW = `  /* v6 的第 3 / 4 屏（生活短语）：多选，一个都不选也能走。
     两屏的 hint 不能写成同一句 —— 「想要」是可选加分，「受不了」是更有效的排除，
     两句说反会让用户以为"这一题不重要"。 */
  if (stepId === 'wanted') {
    bar.appendChild(el('span', { class: 'hint' }, '一个都不选也能继续'));
    bar.appendChild(el('button', { class: 'btn', type: 'button', onclick: next }, '下一步 →'));
    return bar;
  }
  if (stepId === 'unwanted') {
    bar.appendChild(el('span', { class: 'hint' }, '这一题最值得花时间，但也可以跳过'));
    bar.appendChild(el('button', { class: 'btn', type: 'button', onclick: next }, '下一步 →'));
    return bar;
  }

  /* 预算 / 大方向 / 场合 / 季节 / 浓淡：都可跳过，所以按钮永远可点。
     要求"必须答完才能走"会把可跳过的问题变成门槛。

     为什么仍画一个显式的「下一步」而不是点选即自动前进：
     自动前进是 480ms 后触发的，用户点了之后若想反悔，需要一个不依赖
     "等它自己跳"的出口；而且键盘用户 Tab 到这里时自动前进已经错过了，
     没有按钮他们就卡住了。 */
  if (stepId === 'budget' || stepId === 'emotion' || stepId === 'season'
      || stepId === 'occasion' || stepId === 'concentration') {
    bar.appendChild(el('span', { class: 'hint' }, '不选也能继续'));
    bar.appendChild(el('button', { class: 'btn', type: 'button', onclick: next }, '下一步 →'));
    return bar;
  }

  /* 锚点屏：永远可点（它是可跳过的），且是最后一屏，按钮直接出结果。 */
  if (stepId === 'anchor') {
    bar.appendChild(el('span', { class: 'hint' }, '不填也能看结果'));
    bar.appendChild(el('button', {
      class: 'btn', type: 'button', onclick: (ev) => finish(ev.currentTarget),
    }, '看推荐 →'));
    return bar;
  }

`;
s = s.slice(0, a) + NAV_NEW + s.slice(b);

/* navBar 开头那段 family 专用分支（含 disabled 逻辑）已无对应步骤，删掉。
   它的特征是 `if (stepId === 'family') {` 起、到该块闭括号。 */
{
  const FS = "  if (stepId === 'family') {";
  if (s.includes(FS)) {
    const i = s.indexOf(FS);
    /* 找到与 `{` 配对的闭括号（该块内没有嵌套花括号的字符串） */
    let depth = 0; let j = i;
    for (; j < s.length; j++) {
      if (s[j] === '{') depth++;
      else if (s[j] === '}') { depth--; if (depth === 0) break; }
    }
    s = s.slice(0, i) + s.slice(j + 2);
    console.log('· 删 navBar 的 family 分支');
  }
}

/* ---------- ② finish：按预算圈池 ---------- */
once("    state.result = recommend(state.answers, d.perfumes, TAX, { topN: 3 });");
s = s.replace(
  "    state.result = recommend(state.answers, d.perfumes, TAX, { topN: 3 });",
  `    /* 预算走映射层：先把 perfumes 切一刀，引擎一行不动。
       三条降级见 poolForBudget() 的注释 —— 档太窄或凑不满时退回全库，
       绝不给一个空结果。 */
    const pool = poolForBudget(d.perfumes, state.answers.budget);
    let res = recommend(state.answers, pool, TAX, { topN: 3 });
    if (!res.results || res.results.length < 3) {
      /* ② 级的兜底：圈过的池凑不满 3 瓶时用全库重算。
         宁可给一瓶价位外的，也不给"只找到 1 瓶"。 */
      res = recommend(state.answers, d.perfumes, TAX, { topN: 3 });
      res.poolFellBack = true;
    }
    state.result = res;
    state.resultView = { round: 0, soldOut: [] };`,
);

/* finish 的入口守卫：v6 只走 emotion 入口，family 已不存在。 */
once("  if (!state.answers.family && !state.answers.emotion) { state.step = 0; render(); return; }");
s = s.replace(
  "  if (!state.answers.family && !state.answers.emotion) { state.step = 0; render(); return; }",
  `  /* 唯一硬约束：必须给出大方向（第 2 屏）。它是引擎的入口
     （src/scoring.js 的 buildProfile 要求 family 或 emotion 二选一），
     也是背景层底噪的来源 —— 没有它，整程的调子和打分都无从谈起。
     这里不再检查 family：v6 已无香型轮盘，family 恒为 null。 */
  if (!state.answers.emotion) { state.step = 1; render(); return; }`,
);

/* ---------- ③ restart ---------- */
{
  const RS = '  state.answers = {';
  once(RS);
  const i = s.indexOf(RS);
  /* 找到这个对象字面量的闭括号 `  };` */
  const endMark = '\n  };';
  const j = s.indexOf(endMark, i);
  if (j < 0) throw new Error('restart 键表找不到结尾');
  s = s.slice(0, i) + `  /* 从 STEPS 重新铺一份空白答案，而不是手抄键名 ——
     v19 加字段时手抄漏过一次，漏掉的那一屏会带着上一轮的答案复现，
     用户看到的是"我明明重选了，结果没变"。
     v6 新增的三个（budget / wanted / unwanted）必须在这里，
     否则重开一局时第一批仍是上一局的第二批。 */
  state.answers = {
    family: null, subfamily: null, emotion: null, occasion: null, intensity: 3,
    budget: 'any', wanted: [], unwanted: [],
    likedNotes: [], dislikedNotes: [], likedZh: {}, dislikedZh: {},
    /* characterNeg 与 longevityManual 是前两轮漏过的：前者是气质原型的
       「禁止标签」，不清会带着上一轮的排除项进新一轮打分（用户重选气质后
       仍被扣分，且界面上看不出来）；后者是留香手动覆盖标记。 */
    characterPreset: null, characterTags: [], characterNeg: [],
    season: null,
    concentration: null, longevity: null, longevityManual: false,
    dislikedFamilies: [], temperature: null, sweetness: null,
    anchorBrand: null, anchorPerfume: null, anchorNotes: [],
  };
  /* 结果页视图状态：不清的话"换一批"会从上一局的第二批开始数。 */
  state.resultView = { round: 0, soldOut: [] };` + s.slice(j + endMark.length);
}

fs.writeFileSync(P, s);
console.log('✓ navBar / finish / restart 已接线');
