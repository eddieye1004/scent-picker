/**
 * ambient.js — 环境线：把答案累积成一条**连续**的氛围状态
 *
 * 为什么单独成一个模块：环境线是 v3 的第一原则（Eddie 2026-11-16 定版），
 * 它的正确性只有一件事可验 —— **累加，不是覆盖**。所以它必须是纯函数：
 * 同一份 answers 永远算出同一组数，且加一个答案只会让数值沿一个方向移动，
 * 不会把前面攒下的推翻。放在这里，test-render 与脚本都能直接调。
 *
 * 三根轴，都是有物理含义的，不是随便配的动画参数：
 *   temp    冷 ←→ 暖   （-1 凉 / +1 暖）   —— 气味体感，来自所选族/季节/场合
 *   light   暗 ←→ 亮   （ 0 暗 / +1 亮）   —— 光感，来自时段与季节
 *   weight  轻 ←→ 重   （-1 轻 / +1 重）   —— 分量，来自浓度与浓淡
 *
 * 三条纪律（改这个文件前先读）：
 *  1. **每屏只加不减**（除了清空答案）。用户在某一屏改答案时，旧值要先撤回
 *     再叠新值 —— 撤回靠「按当前 answers 全量重算」实现，绝不靠增量减，
 *     否则改一题会让环境线漂到一个从未被任何答案对应的位置。
 *  2. **幅度受限**：每轴最终夹在 [-1, 1]。不夹的话答满 9 屏后极值会到 ±3，
 *     环境色被压成一个死色，后面的屏再也看不出变化 —— 那比没有环境线更糟。
 *  3. **不出术语**：这个模块只产出数字与一句中文旁白，不产出香调名。
 */

/* 香型 → 三轴。数值来源是各族的实际体感（与 taxonomy 的 oneLine 同源描述）：
   柑橘「明亮、干净」→ 凉 + 亮 + 轻；东方琥珀「树脂、焚香」→ 暖 + 暗 + 重。
   振幅刻意不过 0.6：单一答案不该独占整条环境线，它只是"主要贡献者"。 */
export const FAMILY_AMBIENT = {
  citrus:   { temp: -0.52, light: 0.16, weight: -0.40 },
  fresh:    { temp: -0.42, light: 0.18, weight: -0.34 },
  floral:   { temp: 0.10,  light: 0.12, weight: -0.16 },
  woody:    { temp: 0.30,  light: -0.06, weight: 0.46 },
  amber:    { temp: 0.56,  light: -0.14, weight: 0.52 },
  gourmand: { temp: 0.44,  light: 0.02,  weight: 0.48 },
};

/* 场合 → 三轴。这里的 light 是**一天里什么时候用**，不是"多少光"：
   上班/上课是白天（亮），约会/正式是晚上（暗）。
   与 scoring.js 的 OCCASION_TIME 同一套判断，但那边是打分、这边是氛围，
   不合并成一个常量 —— 一处要改阈值时不连带改观感。 */
export const OCCASION_AMBIENT = {
  commute: { temp: -0.10, light: 0.20, weight: -0.04 },
  date:    { temp: 0.16,  light: -0.16, weight: 0.06 },
  daily:   { temp: 0.02,  light: 0.10, weight: -0.08 },
  formal:  { temp: 0.22,  light: -0.20, weight: 0.18 },
  outdoor: { temp: -0.24, light: 0.24, weight: -0.20 },
};

/* 季节 → 三轴。夏天「热」→ 暖 + 亮；冬天「冷风」→ 亮低、暖偏高（室内感）。
   光感取的是"这个季节的天光"，不是气温符号：夏天最亮、冬天最暗。 */
export const SEASON_AMBIENT = {
  spring: { temp: 0.02,  light: 0.10, weight: -0.04 },
  summer: { temp: -0.28, light: 0.22, weight: -0.16 },
  autumn: { temp: 0.24,  light: -0.06, weight: 0.08 },
  winter: { temp: 0.18,  light: -0.30, weight: 0.16 },
};

/* 浓度 → 重量（与 temperament 无关，只讲分量）。 */
export const CONC_WEIGHT = {
  'eau-de-cologne': -0.26,
  'eau-de-toilette': -0.12,
  'eau-de-parfum': 0.14,
  'parfum': 0.30,
  'extrait': 0.30,
  'elixir': 0.30,
};

/* 气质原型的 dims（temp/sweet/weight 各 ±1）折算进环境线。
   权重 0.5 是刻意的：气质是"综合判断"，不该压过用户具体点的那一族。 */
const MOOD_SCALE = 0.5;

function clamp1(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(-1, Math.min(1, x));
}

/**
 * 把一份答案算成环境状态。
 * @param {object} answers state.answers
 * @param {object} [hooks] { moodDims: {temp,sweet,weight} | null }
 * @returns {{temp:number, light:number, weight:number, warm:number, label:string, lit:number}}
 *   warm  = (temp+1)/2，给 CSS 用（0..1，避免负值参与 calc 百分比）
 *   lit   = (light+1)/2
 *   label = 一句中文旁白（页面直接显示，不写香调术语）
 */
export function ambientOf(answers = {}, hooks = {}) {
  let t = 0;
  let l = 0;
  let w = 0;

  const fam = FAMILY_AMBIENT[answers.family];
  if (fam) { t += fam.temp; l += fam.light; w += fam.weight; }

  const occ = OCCASION_AMBIENT[answers.occasion];
  if (occ) { t += occ.temp; l += occ.light; w += occ.weight; }

  const sea = SEASON_AMBIENT[answers.season];
  if (sea) { t += sea.temp; l += sea.light; w += sea.weight; }

  const cw = CONC_WEIGHT[answers.concentration];
  if (cw != null) { w += cw; }

  /* 浓淡滑块：1..5 → -0.5..+0.5。默认值 3 贡献 0，
     所以「一路按下一步」的人环境线不动 —— 那一屏本来也没答。 */
  if (answers.intensity != null && Number.isFinite(Number(answers.intensity))) {
    w += ((Number(answers.intensity) - 3) / 4) * 0.5;
  }

  const dims = hooks.moodDims;
  if (dims) {
    t += (dims.temp || 0) * MOOD_SCALE * 0.6;
    w += (dims.weight || 0) * MOOD_SCALE * 0.6;
  }

  /* 生活情景（v3 用生活语言问，内部映射到香调）也会推一点环境线：
     选了「刚洗完澡的白衬衫」的人，环境该偏凉偏亮一点。
     幅度小（每项 0.12，最多累 0.24）—— 它是细调，不是主项。 */
  const scenePush = hooks.scenePush;
  if (scenePush) { t += clamp1(scenePush.temp || 0) * 0.3; l += clamp1(scenePush.light || 0) * 0.3; }

  const temp = clamp1(t);
  const light = clamp1(l);
  const weight = clamp1(w);

  return {
    temp,
    light,
    weight,
    warm: (temp + 1) / 2,
    lit: (light + 1) / 2,
    label: ambientLabel(temp, light, weight),
  };
}

/** 一句人话旁白：只描述此刻的氛围，不复述用户的答案（复述会变成第二份控制条）。 */
export function ambientLabel(temp, light, weight) {
  const t = temp < -0.28 ? '凉下来' : temp > 0.28 ? '暖起来' : '不冷不热';
  const l = light < -0.22 ? '光线收暗' : light > 0.22 ? '光线变亮' : '光没怎么变';
  const w = weight > 0.3 ? '分量压住了' : weight < -0.3 ? '气息轻着' : '分量刚好';
  return `${t} · ${l} · ${w}`;
}

/* ============================================================
   预算档（v3 前置到第 2 屏）
   ------------------------------------------------------------
   为什么档位是这四段、而不是「300 以下 / 300–600 / …」六段：
   价格取自 661 瓶的挂牌价快照，分位数实测 25% = 279、50% = 600、
   75% = 1240。四段正好落在这些分位附近，每段都有货：
     ≤600  278 瓶 · 600–1200 202 瓶 · 1200–2500 145 瓶 · ≥2500 几十瓶。
   段数再多，最贵那段会掉到个位数，选了就等于让候选池空掉。

   `lo/hi` 是价格区间（元），`null` 表示不设上限 / 不设下限。
   `shelf` 是该档的"货架宽度"比例，只服务界面那条尺带的视觉，
   不参与任何计算 —— 它大约是「这一档占全库的比例」，取整到 0.05。
   ============================================================ */
export const BUDGET_BANDS = [
  { id: 'b1', zh: '600 以内', lo: null, hi: 600, shelf: 0.45,
    desc: '够买到正经大牌的小容量，或是小众牌的主力款' },
  { id: 'b2', zh: '600–1200', lo: 600, hi: 1200, shelf: 0.30,
    desc: '多数商业大牌的常规容量落在这一段' },
  { id: 'b3', zh: '1200–2500', lo: 1200, hi: 2500, shelf: 0.19,
    desc: '沙龙品牌与专柜正装的主要区间' },
  { id: 'b4', zh: '2500 以上', lo: 2500, hi: null, shelf: 0.06,
    desc: '不设上限。这一段能选的瓶数最少，选它会明显收窄候选' },
];

/** 价格 → 档位 id。没有价（undefined）返回 null（调用方一律当"未知"处理）。 */
export function bandOfPrice(price) {
  if (!Number.isFinite(price) || price <= 0) return null;
  for (const b of BUDGET_BANDS) {
    const okLo = b.lo == null || price >= b.lo;
    const okHi = b.hi == null || price < b.hi;
    if (okLo && okHi) return b.id;
  }
  return null;
}

/** 档位 id → 区间。未知 id 返回 null（不要静默退到第一档）。 */
export function bandById(id) {
  return BUDGET_BANDS.find((b) => b.id === id) || null;
}

/** 一句话说清「这一档排除了什么」—— 界面常驻，避免用户以为推荐变差了。 */
export function bandExclusionNote(priceCount, totalCount) {
  if (!Number.isFinite(priceCount) || !Number.isFinite(totalCount) || totalCount <= 0) return '';
  const noPrice = totalCount - priceCount;
  if (noPrice <= 0) return '';
  return `库里有 ${noPrice} 瓶没有挂牌价，它们不参与预算筛选`;
}
