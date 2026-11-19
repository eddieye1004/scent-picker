/**
 * _v6-steps.mjs — 把 STEPS 换成 v6 七屏（一次性工具）
 *
 * 范围：93（步骤定义注释）… 243（curSteps 闭括号）。
 * 首尾自检：首行须以 `/* ---------- 步骤定义` 开头，尾行须为 `}`。
 */
import fs from 'node:fs';

const P = 'app.js';
const out = fs.readFileSync(P, 'utf8').split('\n');

const FROM = 93;
const TO = 243;
const h = out[FROM - 1];
const t = out[TO - 1];
if (!h.startsWith('/* ---------- 步骤定义')) {
  console.error('✗ 首行不符：' + h.slice(0, 60)); process.exit(1);
}
if (t.trim() !== '}') {
  console.error('✗ 尾行不符：' + t.slice(0, 60)); process.exit(1);
}

const NEW = `/* ---------- 步骤定义（2026-11-16 v6：七屏） ----------

   ==== 这一版的题目从哪来 ====
   规格底线四条，逐条落在这里：
     · 全程无香调术语题 —— 第 3 / 4 屏问的是「生活里记得的味道」
       （刚剥开的橘子皮 / 寺庙的香灰），不是「佛手柑 / 焚香」。
       术语只活在映射表 LIFE_NOTES 里，用户点的那一头全是人话。
     · 预算前置 —— 第 1 屏，先圈池再问偏好。理由不是转化率，
       是**后六屏的每一次选择都发生在同一个候选池里**：用户不会在最后
       发现自己答了半天、池子里一半买不起。
     · 结果页保留「换一批 / 改一题重推」—— 见 renderResult。
     · 三瓶 + 前中后调 + 可反推理由 —— 引擎打分一行没动，理由仍由 breakdown 生成。

   ==== 七屏的顺序不是随意的 ====
     1 budget        先圈池（范围）
     2 emotion       **第一个大方向**，同时是背景层底噪的来源（src/ambient.js）
     3 wanted        想要的味道（生活短语，多选）
     4 unwanted      受不了的味道（同上，强惩罚 -40）
     5 occasion      场合 —— 决定浓淡与时段
     6 concentration 浓淡＋浓度（扩散场：同心环半径＝扩散距离）
     7 anchor        已知款（唯一需要认瓶子的题，可跳过）

   为什么第 2 屏必须是「大方向」而不是场合：规格 3 说底噪由第一个大方向定调。
   若场合排在它前面，底噪的起点会落在第 3 屏，前两屏之间出现一次"突然开灯"。
   而那段恰恰是用户刚决定"我想要什么感觉"的地方 —— 沉浸感要求灯先亮、再走。

   为什么「气质」退场：它与第 2 屏的大方向是同一件事的两种问法（都问"给人的感觉"）。
   七屏里留一个就够，重复问一遍只会让用户怀疑刚才那题白答。
   气质原型的信息没丢 —— 由大方向反推填充，见 applyDirectionToCharacter()。

   为什么季节退场：换季提问的数据价值最低（docs/QUESTIONNAIRE-VALUE-20261109.md
   实测榜内换人 1.13，13 维倒数第二），而它占一整屏。

   为什么「整族排除」退场：它在家族入口下实测 0/30 改变 top-3
   （scripts/probe-step6-options.mjs，2026-11-09），而 v6 已无家族入口。
   留着只会让一部人多一屏、另一部人少一屏，进度条数字对不上。
   */
const STEPS = [
  {
    id: 'budget',
    short: '预算',
    title: '你打算花多少钱？',
    help: '先圈个范围，后面六屏只在这个范围里挑。不限也行，只是候选会多很多',
    render: renderBudget,
  },
  {
    id: 'emotion',
    short: '大方向',
    title: '你希望它给人什么感觉？',
    help: '这一题定的是整程的调子 —— 后面每一屏的光、温度、底色都会跟着它走',
    render: renderDirection,
  },
  {
    id: 'wanted',
    short: '想要',
    title: '有没有特别想闻到的味道？',
    help: '不用记术语，照生活里记得的那个东西点就行。想不起来就跳过，后面还有别的维度',
    render: renderWanted,
  },
  {
    id: 'unwanted',
    short: '受不了',
    title: '有没有完全受不了的味道？',
    help: '这一题比上一题更有效：讨厌的东西没有替代品，喜欢的往往有好几个替代。想不起来就跳过',
    render: renderUnwanted,
  },
  {
    id: 'occasion',
    short: '场合',
    title: '主要什么时候用？',
    /* 任务8 B1（Eddie 2026-11-12 批准）：原文「主战场决定浓度下限」
       是两处黑话之一（POLISH-20261112.md §2 标出的候选）。
       「主战场」→「你最常在什么场合用」、「浓度下限」→「推荐的浓淡」，
       保留原句的因果结构（场合决定什么）与兜底动作（拿不准就选日常）。 */
    help: '你最常在什么场合用，决定了推荐的浓淡。选一个最像的，拿不准就选日常',
    render: renderOccasion,
  },
  {
    /* id 沿用 'concentration' 而不是新造一个 'strength'：
       ① 旧 id 'strength' 已被测试明确断言"不得复活"，复活它会让那条断言
          变成假阳性，也分不清"回滚"和"复制粘贴忘改 id"；
       ② concentration 是这一屏的真正落点（③ 留香由它推断），
          intensity 是屏内 ① 的锚点，不再是独立步骤。 */
    id: 'concentration',
    short: '浓淡',
    title: '想要多浓？',
    /* 任务8 B2（Eddie 2026-11-12 批准）：原文「香精占比」是两处黑话之二。
       改为「浓度类型」——与 short「浓淡」呼应，也与下面单选卡的文案对得上。 */
    help: '先说体感（想让人闻到多重的分量），再说浓度类型（决定留香多久）。两项都不选也能出结果',
    render: renderConcentration,
  },
  {
    id: 'anchor',
    short: '已知款',
    title: '有没有已经试过、并且喜欢的香水？',
    /* help 第一句就卸压力并把"跳过"放最前。原句把"可跳过"放在"最准"之后，
       读起来像"可跳过但跳了就亏"，会让零基础的人卡在这里。 */
    help: '不记得名字就跳过 —— 这是唯一一题需要你认得瓶子的，答不出很正常。'
      + '如果记得品牌，选一下会明显更准',
    render: renderAnchor,
  },
];

/* 当前生效的步骤表。

   v6 起**七屏固定**，没有 when 条件（v5 的「整族排除」只在情绪入口出现，
   v6 第 2 屏就是大方向，等于所有用户都走那条路，那屏已无意义 —— 见 STEPS 注释）。

   函数保留而不删：所有「第 N 步 / 共 M 步」与进度段数都必须走它，
   不许读 STEPS.length。两套数字一旦分叉，界面会显示「共 7 步」但只有 6 屏，
   用户翻到第 6 屏就出结果，会以为漏了一屏。 */
function curSteps(answers = state.answers) {
  /* answers 参数保留（调用点都在传），但 v6 无 when —— 步骤数与答案无关。
     void 掉是为了提醒下一个想加 when 的人：一旦重新引入条件，
     所有靠 S.cur({}) 断言步数的测试会一起变。 */
  void answers;
  return STEPS;
}
`;

out.splice(FROM - 1, TO - FROM + 1, ...NEW.split('\n'));
fs.writeFileSync(P, out.join('\n'));
console.log('✓ STEPS 换成 v6 七屏');
