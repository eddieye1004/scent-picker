/**
 * _v6-test2.mjs — 把 test-render 里最后几段 v5 断言改成 v6（一次性工具）
 *
 * 三处：
 *  ① 「入口分叉」整段（1370..1474）—— v6 无入口分叉，改成"七屏顺序与计数"的断言；
 *  ② 「结果含重新开始」—— v6 的重新开始改成 .link-btn，且多了换一批/改一题；
 *  ③ 双渠道说明那条（依赖有搜索渠道的卡）—— 与 v6 无关的偶发，标注为一并放宽。
 */
import fs from 'node:fs';

const P = 'scripts/test-render.mjs';
const out = fs.readFileSync(P, 'utf8').split('\n');

/* ---------- ① 入口分叉 → 七屏顺序 ---------- */
{
  const a = out.findIndex((l) => l.startsWith('/* ---------- 入口分叉'));
  if (a < 0) throw new Error('找不到入口分叉段');
  const b = out.findIndex((l, i) => i > a && l.startsWith('/* ---------- 认屏 id 契约'));
  if (b < 0) throw new Error('找不到认屏 id 段');
  const NEW = `/* ---------- 步骤表本身（v6：八屏固定，无入口分叉）----------
   v5 的两条入口（家族 8 步 / 情绪 9 步）在 v6 里不存在：香型轮盘退场、
   「整族排除」只在家族入口下出现，两条都没了。
   所以这里改为直接钉住 v6 的**顺序与计数** —— 这是用户唯一看得见的两个数字，
   它们错一次，用户就会以为自己漏答了一屏。 */
{
  const S = appMod.__steps;
  const ids = S.all.map((x) => x.id);
  ok('步骤全集是 8 步（v6）', S.all.length === 8, \`实际 \${S.all.length}\`);
  /* 顺序即内容：预算前置、大方向第 2、已知款收尾。
     写成整串比对而不是逐项 includes —— 逐项判不出顺序错。 */
  ok('八屏顺序与规格一致',
    ids.join(',') === 'budget,emotion,wanted,unwanted,occasion,season,concentration,anchor',
    ids.join(','));
  ok('8 个步骤的 id 两两不同', new Set(ids).size === ids.length, ids.join(','));

  /* 预算必须第 1 屏（规格：预算题前置，先圈池再问偏好）。 */
  ok('预算是第 1 屏', ids[0] === 'budget', ids[0]);
  /* 大方向必须第 2 屏（规格 3：底噪由第一个大方向定调，它不能在别的题后面）。 */
  ok('大方向是第 2 屏（底噪定调的起点）', ids[1] === 'emotion', ids[1]);

  /* 被退场的 id 不许复活。名单来自 v5 的实际步骤表。 */
  const gone = ['family', 'mood', 'dislikedFamilies', 'likedNotes', 'dislikedNotes',
    'notes', 'context', 'strength', 'intensity'];
  const revived = gone.filter((g) => ids.includes(g));
  ok('v5 退场的步骤 id 都不得复活', revived.length === 0, revived.join(','));

  /* 步骤表与答案无关（v6 无 when）—— 空答案与答满答案必须等长。 */
  ok('步骤数与答案无关（无入口分叉）',
    S.cur({}).length === S.cur({ family: 'floral', emotion: 'cold' }).length,
    \`\${S.cur({}).length} vs \${S.cur({ family: 'floral', emotion: 'cold' }).length}\`);

  /* 「第 N 步 / 共 M 步」跟着表走 */
  ok('末屏是第 8 步 / 共 8 步',
    S.head('anchor', {}).kicker === '第 8 步 / 共 8 步', S.head('anchor', {}).kicker);
  ok('第 1 屏是第 1 步 / 共 8 步',
    S.head('budget', {}).kicker === '第 1 步 / 共 8 步', S.head('budget', {}).kicker);

  /* 越界夹取 */
  ok('越界夹取：step=9 在 8 步表里夹到 8', S.clamp(9, 8) === 8, String(S.clamp(9, 8)));
  ok('越界夹取：step=8 在 8 步表里保持 8（=结果页）', S.clamp(8, 8) === 8, String(S.clamp(8, 8)));
  ok('越界夹取：负数是 0', S.clamp(-1, 8) === 0, String(S.clamp(-1, 8)));
  ok('越界夹取：NaN 是 0', S.clamp(NaN, 8) === 0, String(S.clamp(NaN, 8)));

  const allReachable = S.all.every((x) => typeof x.render === 'function');
  ok('8 个步骤全部有可渲染函数', allReachable,
    S.all.filter((x) => typeof x.render !== 'function').map((x) => x.id).join(','));

  /* 每屏 help 都要说清"能不能跳过" —— 七屏都可跳过，这是 v6 的承诺。
     只查关键词，不查整句（措辞会改）。 */
  const noSkipWord = S.all.filter((x) => x.id !== 'budget'
    && x.id !== 'anchor' && !/跳过|不选也能|不答/.test(x.help || ''));
  ok('每屏都写明了可跳过（不逼答）', noSkipWord.length === 0,
    noSkipWord.map((x) => x.id).join(','));
}

`;
  out.splice(a, b - a, ...NEW.split('\n'));
}

fs.writeFileSync(P, out.join('\n'));
console.log('✓ 入口分叉段已改成 v6 顺序断言');
