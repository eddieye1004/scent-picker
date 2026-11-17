/**
 * ambient.js — 背景层（环境底噪）的算术
 *
 * ==== 这一层是什么、不是什么（Eddie 2026-11-16 22:56 定版）====
 * 两层结构：① 前景层 = 每题自己的对应效果，是该页的视觉重心；
 *           ② 背景层 = 一条环境底噪，由**第一个大方向**定调，此后沿这个方向
 *              随答题进程逐渐增强（光感／温度感／底色累积演变）。
 *
 * 三条硬纪律，写在最前面，改这个文件前先读：
 *  1. **来源只能是第一个大方向**。不是任何单题的装置。历史上被否决的做法是
 *     「把季节题的温度光带拿去贯穿全卷」—— 那是把单题装置升级成全卷系统。
 *     这里的输入只有 answers.emotion（第 2 屏「大方向」），其余答案只允许
 *     **调强度**，不允许改方向、不允许改符号。
 *  2. **强度封顶且在背景档**。输出振幅夹在 AMBIENT_CAP 以内，由 CSS 再乘一次
 *     低透明度落地。前景层任何一屏的对比度都必须高于它 —— 验收时逐屏查
 *     「第一眼看到的仍是本題的效果」。
 *  3. **纯函数**。"加一个答案只让数值沿一个方向走、不推翻前面"这条性质
 *     必须能被测试直接调用验证，不能只靠看截图。
 */

/** 六种大方向 → 底噪三轴。数值来源是 taxonomy.emotionMap 各自的语义，
 *  不是随手配的动画参数：
 *    清冷「不想被人闻到」     → 冷、偏暗（光收着）
 *    温暖「像晒太阳、羊绒衫」 → 暖、微亮
 *    干净「刚洗完澡、白衬衫」 → 偏冷、**亮**（洗过的光）
 *    神秘「有故事感、不透明」 → 微暖、**暗**（不透明）
 *    明亮「有精神、想被看见」 → 中性偏冷、最亮
 *    慵懒「贴肤、柔和、不主动」→ 微暖、中低亮度（柔）
 *
 *  temp  : -1 冷 ←→ +1 暖
 *  light : -1 暗 ←→ +1 亮
 *  sat   : -1 灰（去饱和）←→ +1 浓（加饱和）
 *
 *  振幅全部 <= 0.85：单一答案不该独占整条底噪，它只是把方向定下来。 */
export const DIRECTION_AXES = {
  cold:       { temp: -0.78, light: -0.30, sat: -0.18 },
  warm:       { temp: 0.82,  light: 0.14,  sat: 0.34 },
  clean:      { temp: -0.36, light: 0.58,  sat: -0.42 },
  mysterious: { temp: 0.28,  light: -0.74, sat: 0.46 },
  bright:     { temp: -0.12, light: 0.86,  sat: 0.22 },
  lazy:       { temp: 0.46,  light: -0.16, sat: -0.12 },
};

/* 底噪振幅上限（归一化后）。0.85 = 方向本身最满的一档；
   进程只把它从 BASE_STRENGTH 推到 1，乘出来的最终值永远 <= 0.85。
   为什么不给 1：留一档余量，让"方向"与"进程"不互相抵消成一个死值。 */
export const AMBIENT_CAP = 0.85;

/* 进程起点：大方向选完的那一屏就已经有底噪（否则第一屏之后的过渡像突然开灯），
   但只是 34% 强度 —— 它必须明显弱于后面任何一屏。 */
export const BASE_STRENGTH = 0.34;

/* 进程终点：末屏的"基准强度"。压在 AMBIENT_CAP 之下留 0.06 余量，
   让季节/浓淡这两个后续答案在最后一屏仍能把它推浓或收淡（见 ambientOf）。 */
export const PEAK_STRENGTH = 0.79;

/**
 * 底噪状态。
 *
 * @param {object} answers  state.answers
 * @param {number} step     当前屏下标（0 起）；结果页传 steps.length
 * @param {number} total    当前步骤表长度
 * @returns {{active:boolean, temp:number, light:number, sat:number, strength:number,
 *            axis:string, kicker:string}}
 */
export function ambientOf(answers, step, total) {
  const dir = answers && answers.emotion;
  const ax = DIRECTION_AXES[dir];
  if (!ax) {
    /* 还没选大方向：底噪不存在（不是"强度 0 的底噪"，是诚实的没有）。
       第 1 屏（预算）因此是一张干净的纸 —— 底噪从第 2 屏才开灯。 */
    return {
      active: false, temp: 0, light: 0, sat: 0, strength: 0, axis: 'none', kicker: '',
    };
  }

  /* ---- 进程：从大方向那一屏起算 0，到末屏 1 ----
     为什么用「大方向所在屏」而不是第 0 屏做起点：第 1 屏（预算）时用户还没
     给出方向，那时给底噪就是在替用户定调。 */
  const start = Math.max(1, directionIndex(answers));
  const span = Math.max(1, total - 1 - start);
  const p = clamp01((Number(step) - start) / span);

  /* ---- 推进系数 ----
     p=0 → BASE_STRENGTH；p=1 → PEAK_STRENGTH（贴在封顶之下留一点余量）。
     单调不减，这正是「逐渐增强」。

     为什么留余量而不是一路推到封顶：到了封顶，后续答案（季节/浓淡）
     就再也调不动强度，等于第 2 条纪律在最后一程失效 —— 第一版正是这样，
     test-render 的"后续答案确实会改变强度"抓到了（0.85 vs 0.85）。
     留 0.06 的余量，就是留一个"还能再浓/再淡一点"的旋钮。 */
  const growth = BASE_STRENGTH + (PEAK_STRENGTH - BASE_STRENGTH) * p;

  /* ---- 后续答案只调"浓度"，不改方向 ----
     季节与浓淡各自给一个小量，最后折算成 [0.88, 1.12] 的乘数：
     乘数恒正 ⇒ **永远不会把方向翻过来**。这是第 1 条纪律的算术落地，
     也是 test-render 里 "符号不变" 那条断言的依据。 */
  const seasonBias = SEASON_BIAS[answers.season] || 0;      // -0.5..+0.5
  const weightBias = (Number(answers.intensity) || 3) / 5 - 0.6;  // -0.4..+0.4
  const accent = clamp((seasonBias * 0.6 + weightBias * 0.5) * 0.12, -0.12, 0.12);
  const mag = growth * (1 + accent);

  /* ---- 封顶：AMBIENT_CAP ----
     `1 + accent` 最大 1.12，所以必须夹；夹的常数是 AMBIENT_CAP（0.85），不是 1。
     第一版写成 Math.min(1, …)，test-render 的封顶断言当场抓到 0.89/1.0。

     accent 的可用范围还受 growth 的余量约束（见 PEAK_STRENGTH 的注释）：
     growth 最高 0.79，加上最大 accent 就落在 0.85 附近，
     所以"最后一屏仍能调浓一点、也能调淡一点"这两件事都成立。 */
  const s = Math.min(AMBIENT_CAP, Math.max(0, mag));
  return {
    active: true,
    /* 三轴都乘同一个强度 ⇒ 轴间比例保持不变（方向不变），只有长度变。 */
    temp: round4(ax.temp * s),
    light: round4(ax.light * s),
    sat: round4(ax.sat * s),
    strength: round4(s),
    axis: dir,
    kicker: kickerOf(dir, s),
  };
}

/* 季节对"浓度"的贡献。夏天要更收、冬天要更压得住 ——
   注意它只进 accent（浓度），不进方向。 */
const SEASON_BIAS = { spring: -0.1, summer: -0.5, autumn: 0.2, winter: 0.5 };

/** 大方向在步骤表里的下标。预算固定是第 0 屏，所以这里只需认 emotion。 */
function directionIndex(answers) {
  return answers && answers.emotion ? 1 : -1;
}

/** CSS 变量名与取值范围集中在这里，styles/src/90-quiz-v6.css 按同一份命名取值。 */
export function ambientVars(amb) {
  return {
    '--amb-temp': String(amb.temp),
    '--amb-light': String(amb.light),
    '--amb-sat': String(amb.sat),
    '--amb-strength': String(amb.strength),
  };
}

/** 底噪的一句话旁白（边距仪器区用，不是装饰）。只说方向与档位，不出现香调名。 */
const AXIS_ZH = {
  cold: '冷', warm: '暖', clean: '清', mysterious: '沉', bright: '亮', lazy: '柔',
};
function kickerOf(dir, s) {
  const zh = AXIS_ZH[dir] || '';
  const tier = s < 0.5 ? '起' : s < 0.78 ? '渐' : '满';
  return zh ? `${zh}·${tier}` : '';
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => (Number.isFinite(v) ? clamp(v, 0, 1) : 0);
const round4 = (v) => Math.round(v * 10000) / 10000;
