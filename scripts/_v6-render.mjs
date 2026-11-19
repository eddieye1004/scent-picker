/**
 * _v6-render.mjs — render() 接线底噪 + 边距仪器区（一次性工具）
 *
 * 替换 3351..3393 这一段（SCENE 表 + 越界保护 + dataset 写入），
 * 换成 v6 的：
 *   · SCENE 按七屏分档（连续 cut / 焕新 settle / 结果 rise）—— 转场逐屏自选
 *   · 底噪变量写到 #app 上（applyAmbient）
 *   · 边距仪器区里那枚 .amb-tick 的刻度值
 */
import fs from 'node:fs';

const P = 'app.js';
const out = fs.readFileSync(P, 'utf8').split('\n');
const FROM = 3351;
const TO = 3393;
if (!out[FROM - 1].trim().startsWith('/* 切屏语言按屏分配')) {
  console.error('✗ 首行不符：' + out[FROM - 1].trim().slice(0, 50)); process.exit(1);
}
if (!out[TO - 1].includes("app.dataset.step = isResult")) {
  console.error('✗ 尾行不符：' + out[TO - 1].trim().slice(0, 50)); process.exit(1);
}

const NEW = `  /* ==== 转场逐屏自选（规格 4）====
     相邻屏可以连续（带元素走过去），也可以焕新（走进新房间）。
     两种都合法，判据是**这一处的体验**，不是统一公式。所以这张表逐屏写，
     不设默认值兜底 —— 漏写一屏会落成 'cut'，而 'cut' 是最弱的转场，
     它必须是被选出来的，不是被漏出来的。

       cut    零位移淡入  —— 同一段路里连续作答，位移会打断线性感
       settle 下沉 6px    —— 换轴：从"范围"进"感觉"，从"时间"进"分量"
       lift   上浮 6px    —— 收束：末屏（已知款）之后要给答案了
       rise   上浮 14px   —— 结果页（全流程唯一"给答案"的一屏）

     逐屏理由（也写在 PR 的逐屏表里）：
       budget   → settle  首屏，自己就是"进门"，下沉最有"推门"感
       emotion  → settle  换轴：从钱进感觉。**同时是底噪开灯的那一屏**
       wanted   → cut     与上一屏同属"味道偏好"这段路，连续
       unwanted → cut     同一段路的另一面
       occasion → settle  换轴：从"味道"进"什么时候"
       season   → cut     与场合同属时间轴，连续走完一年与一天
       concentration → settle 换轴：从"什么时候"进"多重的分量"
       anchor   → lift    收束屏，最后一次提问，之后是结果
       result   → rise    给答案 */
  const SCENE = {
    budget: 'settle',
    emotion: 'settle',
    wanted: 'cut',
    unwanted: 'cut',
    occasion: 'settle',
    season: 'cut',
    concentration: 'settle',
    anchor: 'lift',
  };
  const list = curSteps();
  /* 越界保护（防御性）。v6 步骤表固定 8 屏、无入口分叉，理论上 state.step
     只可能等于 length（结果页）。留着是为了让「容器长度与下标」这对不变量
     有兜底 —— 将来若重新引入条件屏，这里不会炸。
     夹到末屏而不是回第 1 步：用户刚看一眼结果，不该被扔回开头重答。 */
  state.step = clampStep(state.step, list.length);
  const isResult = state.step >= list.length;
  app.dataset.scene = isResult
    ? 'rise'
    : (SCENE[list[state.step].id] || 'cut');

  /* 步骤 id 同时写进 DOM，供 CSS 认屏。
     原先靠 \`main:has(.disc):has(.seg)\` 认"场景屏"，结果是转盘屏被一起命中，
     masthead 的下边距在那一屏被压成 6px —— 换屏时整页跳 12–22px。
     写一个显式属性，认屏就不靠"这个屏碰巧有什么元素"。 */
  app.dataset.step = isResult ? 'result' : list[state.step].id;
  /* 背景层：底噪三轴（src/ambient.js）。写在 dataset.step 之后，
     因为 ambientOf() 要用 step 算"走到第几程"。 */
  applyAmbient();`;

out.splice(FROM - 1, TO - FROM + 1, ...NEW.split('\n'));
fs.writeFileSync(P, out.join('\n'));
console.log('✓ render() 接线完成');
