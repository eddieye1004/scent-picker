/**
 * scoring.js — 可解释的规则打分引擎
 *
 * 设计约束（来自已确认决策）：
 *   1. 模型不参与选品。得分完全由可复算的规则产生，任何一条理由都能反推到某个答案。
 *   2. 每条候选输出 breakdown，前端把 top-2 因子直接渲染成中文理由，不做自由生成。
 *   3. 缺失字段不猜：没有价格就不做价格筛选；没有扩散度就不编扩散度。
 */

import { tokenize, matchesNote, aliasesOf, normNote, hasTokenSubsequence } from './notes.js';

export const SCHEMA_VERSION = '1.1.0';

/* ---------- 匹配度展示门槛（G6，v28）----------

   低于这么多"激活维度"时不显示百分比，改显示定性文案。

   为什么是 8：实测（scripts/probe-matchpct.mjs，40 组随机答案 × 10 个深度）
   在"库内可达上界"这个分母下，激活维度 ≥ 8 时第 1 名的百分位中位数
   落在 82–86%（8 维 86%、15 维 82%），波动可接受；
   7 维及以下时最高会飙到 99%（分母也被砍到只剩那几项，数学自洽但读起来
   像虚假承诺）。门槛设在百分比开始"虚高"的位置，宁可说「初步匹配」。 */
export const MATCH_PCT_MIN_DIMS = 8;

/* ---------- 权重配置（集中于此，便于调参与写测试） ---------- */
export const WEIGHTS = {
  familyPick: 34,      // 用户在第 1 步直接点的香型家族（香型轮盘，权重最高：这是最明确的意图）
  subfamilyHits: 18,   // 第 2 步在同一轮盘里选的子家族 / 代表香材命中
  emotionFamily: 30,   // 情绪 → 家族吻合（旧四步流程保留，见 buildProfile 的分支）
  occasionFamily: 22,  // 场合 → 家族吻合
  emotionNotes: 22,    // 情绪对应的代表香调命中（比家族更锐，解决家族过粗的问题）
  intensity: 18,       // 浓度偏好吻合
  season: 10,          // 季节吻合（可选问题）
  timeOfDay: 6,        // 时段吻合（由场合推导）
  likedNotes: 14,      // 命中喜欢的香调
  dislikedNotes: -40,  // 命中讨厌的香调（强惩罚）
  popularity: 5,       // 知名度微调，避免全是冷门怪香

  /* ---- v19：四步扩到十步后新增的五维 ----
     全部并列于既有因子，不叠加到旧权重里 —— 旧因子一项没动，
     这样「同一个人用旧四步答完」与「答满十步」的分数是可比的：
     新增维度最多再加 58 分，旧盘面满分约 108，占比 35%，是"细化"不是"改写"。 */
  character: 16,       // 性格标签命中（清冷/温暖/干净/甜…）；数据里 21 种
  concentration: 12,   // 浓度档位吻合（EDT/EDP/Extrait）；数据覆盖 87%
  longevity: 10,       // 持香时长吻合（由浓度推断，UI 必须标「推断」）
  dislikedFamily: -30, // 讨厌某个香型家族（比讨厌单个香调更粗，惩罚也更轻）
  seasonSecond: 5,     // 次选季节吻合（避免"只想夏天"和"夏天优先"同分）

  /* ---- v20：气味温度 / 甜度 / 已知锚点 ----
     锚点给 26 分，高于任何单项问卷答案（家族直选 34 是唯一比它高的）——
     因为它不是"偏好声明"而是"实际试过并且喜欢"的真实反馈（见 D47）。 */
  temperature: 14,     // 气味冷暖（warm / cool / neutral）
  sweetness: 13,       // 甜度档位（0..3）
  anchorNotes: 26,     // 与"已知喜欢的香水"的香调重合度
};

/* 浓郁度 1..5 → 家族倾向。1=最清爽，5=最浓郁 */
const INTENSITY_FAMILY = {
  1: { citrus: 1.0, fresh: 1.0, floral: 0.4, woody: 0.3, gourmand: 0.05, amber: 0.05 },
  2: { citrus: 0.85, fresh: 0.9, floral: 0.6, woody: 0.5, gourmand: 0.15, amber: 0.15 },
  3: { citrus: 0.5, fresh: 0.6, floral: 1.0, woody: 0.85, gourmand: 0.4, amber: 0.4 },
  4: { citrus: 0.2, fresh: 0.25, floral: 0.6, woody: 0.9, gourmand: 0.85, amber: 0.75 },
  5: { citrus: 0.05, fresh: 0.1, floral: 0.4, woody: 0.75, gourmand: 1.0, amber: 1.0 },
};

/* 性格标签 → 家族倾向。
   用途：用户在「你想要什么气质」那一步选了「清冷」，但库里没有一瓶
   正好带 `cold` 标签时，仍能按这组倾向给一点分，而不是 0。
   数值来自 character 在真实 400 瓶里的家族分布（比例取整后归一）。 */
const CHARACTER_FAMILY = {
  fresh:    { fresh: 1.0, citrus: 0.7, woody: 0.4 },
  clean:    { fresh: 1.0, citrus: 0.6, floral: 0.4 },
  citrusy:  { citrus: 1.0, fresh: 0.7, floral: 0.2 },
  green:    { fresh: 0.9, citrus: 0.6, woody: 0.4 },
  herbal:   { fresh: 0.8, woody: 0.6, citrus: 0.4 },
  floral:   { floral: 1.0, fresh: 0.4, gourmand: 0.2 },
  powdery:  { floral: 0.9, amber: 0.5, gourmand: 0.3 },
  musky:    { floral: 0.7, amber: 0.6, woody: 0.5 },
  fruity:   { floral: 0.7, gourmand: 0.8, citrus: 0.5 },
  sweet:    { gourmand: 1.0, amber: 0.6, floral: 0.4 },
  creamy:   { gourmand: 0.8, amber: 0.6, floral: 0.4 },
  warm:     { amber: 1.0, gourmand: 0.7, woody: 0.5 },
  spicy:    { amber: 1.0, woody: 0.6, gourmand: 0.4 },
  resinous: { amber: 1.0, woody: 0.6, gourmand: 0.3 },
  woody:    { woody: 1.0, amber: 0.5, fresh: 0.2 },
  earthy:   { woody: 1.0, amber: 0.5, fresh: 0.3 },
  smoky:    { woody: 0.9, amber: 0.8, gourmand: 0.2 },
  leathery: { woody: 0.8, amber: 0.9, smoke: 0.3 },
  salty:    { fresh: 0.8, woody: 0.5, amber: 0.3 },
  amber:    { amber: 1.0, gourmand: 0.6, woody: 0.4 },
  rich:     { amber: 0.9, gourmand: 0.9, floral: 0.4 },
};

/* ---------- 气味温度：从 character 标签推导 ----------
   数据源没有独立的"温度"字段，只能从标签推。选词依据是调香语境里
   这两个方向的典型原料，不是审美判断：
     暖：琥珀 / 香草 / 树脂 / 辛香 / 烟熏 / 皮革 / 甜 / 奶感
     凉：清新 / 洁净 / 绿感 / 柑橘 / 草本 / 咸感
   实测 400 瓶：偏暖 145 / 偏凉 90 / 中性 165（两边都占或不占）。 */
const WARM_TAGS = ['warm', 'amber', 'resinous', 'spicy', 'smoky', 'leathery', 'sweet', 'creamy'];
const COOL_TAGS = ['fresh', 'clean', 'green', 'citrusy', 'herbal', 'salty'];

/* ---------- 甜度：加权求值，归一到 0..1 ----------
   实测原始分 0..2.9，199 瓶 > 0。除以 2.9 归一。
   为什么用加权和而不是"命中 sweet 就是甜"：
   一瓶只有 creamy 的香草和一瓶 sweet+creamy+fruity 的糖果，
   甜度差三四倍，二分法会把它们判成同一档。 */
const SWEET_TAGS = { sweet: 1.0, creamy: 0.7, fruity: 0.5, powdery: 0.3 };
function sweetnessOf(p) {
  const ch = p.character || [];
  let v = 0;
  for (const t of ch) v += SWEET_TAGS[t] || 0;
  v += 1.2 * ((p.families || {}).gourmand || 0);
  return Math.min(1, v / 2.9);
}

/* ---------- 场合 → 时段（用于 timesOfDay 匹配） */
const OCCASION_TIME = {
  commute: 'day',
  date: 'evening',
  daily: 'day',
  formal: 'evening',
  outdoor: 'day',
};

/* ---------- 工具 ---------- */
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function emptyFamilies(taxonomy) {
  const out = {};
  for (const f of taxonomy.families) out[f.id] = 0;
  return out;
}

function familyVector(weightsByFamily) {
  // 归一化成 0..1 的向量，避免不同来源的绝对量级差异
  const max = Math.max(...Object.values(weightsByFamily), 1e-9);
  const out = {};
  for (const [k, v] of Object.entries(weightsByFamily)) out[k] = v / max;
  return out;
}

function dotLerp(a, b, wa, wb) {
  // 两个家族向量的加权和（不归一，交给阈值判断）
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = {};
  for (const k of keys) out[k] = (a[k] || 0) * wa + (b[k] || 0) * wb;
  return out;
}

/* ---------- 构建用户画像 ---------- */
export function buildProfile(answers, taxonomy) {
  // 两条入口都支持：
  //   A) answers.family（香型轮盘选家族）+ 可选 answers.subfamily
  //   B) answers.emotion（旧四步的感受词）
  // 之所以不直接删 B：test-scoring 的 106 项断言全部基于 emotion，
  // 且它仍是"完全不懂香水"的人更自然的入口。两条并存，画像里分开记。
  const family = answers.family
    ? taxonomy.families.find((f) => f.id === answers.family)
    : null;
  const emotion = answers.emotion
    ? taxonomy.emotionMap.find((e) => e.id === answers.emotion)
    : null;
  const occasion = answers.occasion
    ? taxonomy.occasionMap.find((o) => o.id === answers.occasion)
    : null;
  if (!family && !emotion) throw new Error(`缺少 family 或 emotion`);
  if (answers.occasion && !occasion) throw new Error(`未知 occasion: ${answers.occasion}`);

  const intensity = Number(answers.intensity) || 3;
  const intVec = familyVector(INTENSITY_FAMILY[intensity]);

  // 有家族直选时以它为主（权重 1），情绪为 0；否则退回情绪主导。
  const baseVec = family ? familyVector({ ...emptyFamilies(taxonomy), [family.id]: 1 })
    : familyVector(emotion.families);
  const occVec = occasion ? familyVector(occasion.families) : null;

  // 香型轮盘入口：浓淡不混进家族向量。
  // 原因：INTENSITY_FAMILY 自带家族倾向（intensity=3 时 floral 1.0 / woody 0.85），
  // 混进来等于替用户又勾了花香和木质——实测会让「只点柑橘」的前三名出现纯花香瓶。
  // 浓淡由 scorePerfume 里独立的 intensity 因子（按厚重感差值）负责，那里不带家族偏好。
  const totalVec = family
    ? (occVec ? dotLerp(baseVec, occVec, 0.78, 0.22) : baseVec)
    : (occVec ? dotLerp(dotLerp(baseVec, occVec, 0.6, 0.4), intVec, 0.7, 0.3)
              : dotLerp(baseVec, intVec, 0.7, 0.3));

  // 情绪代表香调（taxonomy 里每种情绪给了 5 个锚点香调）。
  // 这层是为了解决"家族太粗"：Aventus 被源站标成 floral 为主的 Orchard Fruit，
  // 但"清冷"要的是鸢尾/紫罗兰/柏树那种冷感，两者在家族层面区分不出来。
  // emotion 为空时（走香型轮盘入口）没有锚点香调，退回空集，
  // 让打分侧跳过 emotionNotes 这一项而不是崩掉。
  const emoNotes = new Set(((emotion?.notes) || []).map((n) => String(n).toLowerCase()));

  // 香调 id（= noteIndex 的 en）→ 条目，供 matchesNote 取 aliases。
  // 一个条目可能被多个 id 指向（如 "neroli / orange blossom"），所以按别名逐个登记。
  const noteEntryOf = new Map();
  for (const e of taxonomy.noteIndex.entries) {
    noteEntryOf.set(normNote(e.en), e);
    for (const a of aliasesOf(e)) noteEntryOf.set(a, e);
  }

  // 第 2 步选中的子家族：取其挂靠香材作为「明确的香材意图」。
  const subfamily = family && answers.subfamily
    ? (family.subfamilies || []).find((x) => x.id === answers.subfamily) || null
    : null;

  const profile = {
    family,
    subfamily,
    subfamilyNotes: new Set((subfamily?.notes || []).map((n) => String(n).toLowerCase())),
    emotion: emotion || { id: 'family-' + family.id, zh: family.zh },
    /* 这一位是给理由生成用的：香型入口下 emotion 是**合成对象**（zh 就取自家族），
       若把它当成"用户选过的感受词"写进句子，就会出现
       「主调是花香调，在你选的「花香调」里占大头」这种自指循环。
       所以显式记下"这是真的情绪入口吗"，理由侧据此换句式。 */
    emotionReal: !!emotion,
    occasion: occasion || null,
    intensity,
    families: totalVec,
    emotionNotes: emoNotes,
    emotionNotesZh: emotion?.notesZh || null,
    noteEntryOf,
    likedNotes: new Set((answers.likedNotes || []).map((n) => String(n).toLowerCase())),
    dislikedNotes: new Set((answers.dislikedNotes || []).map((n) => String(n).toLowerCase())),
    // 展示用原名：优先用调用方给的 zh 映射（界面上点的是「佛手柑」，
    // 不该在理由里回显成 bergamot），否则退回原始写法。
    likedDisplay: new Map([
      ...(answers.likedNotes || []).map((n) => [String(n).toLowerCase(), String(n)]),
      ...Object.entries(answers.likedZh || {}).map(([k, v]) => [String(k).toLowerCase(), String(v)]),
    ]),
    dislikedDisplay: new Map([
      ...(answers.dislikedNotes || []).map((n) => [String(n).toLowerCase(), String(n)]),
      ...Object.entries(answers.dislikedZh || {}).map(([k, v]) => [String(k).toLowerCase(), String(v)]),
    ]),
    preferredTime: OCCASION_TIME[answers.occasion] || null,
    season: answers.season || null,
    seasonSecond: answers.seasonSecond || null,
    /* v19 新增五维。全部允许为空 —— 旧四步流程不传这些键时行为与之前逐位一致
       （每个因子在取不到值时直接跳过，不扣分也不加分）。 */
    /* 第 6 步收的是 tags 数组（8 个人话预设 → 各自映射到数据里的多个源标签），
       所以这里有两种入口：characterTags（新）与 character（旧单值）。
       命中任一即算命中；家族回退用第一个 tag 的映射表。 */
    characterTags: Array.isArray(answers.characterTags) ? answers.characterTags : [],
    /* 气质原型的"禁止标签"（D51）。命中即扣分 —— 没有它，
       fresh 这类高频标签同时喂给好几项，实测两两重合高达 61%。 */
    characterNeg: Array.isArray(answers.characterNeg) ? answers.characterNeg : [],
    temperature: answers.temperature || null,
    sweetness: answers.sweetness != null ? Number(answers.sweetness) : null,
    /* 锚点：优先用"某瓶香水"，它的 notesAll 比手点的几个香调更完整；
       没有具体香水时才退回手点的香调集合。两者都有就用并集。 */
    anchorNotes: new Set([
      ...(answers.anchorNotes || []).map((n) => String(n).toLowerCase()),
      ...((Array.isArray(answers.anchorPerfumeNotes) ? answers.anchorPerfumeNotes : [])
        .map((n) => String(n).toLowerCase())),
    ]),
    anchorPerfumeId: answers.anchorPerfume || null,
    character: answers.character || null,
    characterFamily: (() => {
      const first = (Array.isArray(answers.characterTags) ? answers.characterTags : [])[0] || answers.character;
      return first ? (CHARACTER_FAMILY[first] || null) : null;
    })(),
    concentration: answers.concentration || null,
    longevity: answers.longevity != null ? Number(answers.longevity) : null,
    dislikedFamilies: Array.isArray(answers.dislikedFamilies) ? answers.dislikedFamilies : [],
    maxLongevityFloor: occasion?.longevityMin ?? null,
    maxSillage: occasion?.sillageMax ?? null,
  };

  /* ---------- 激活维度计数（G6）----------
     数的是"用户真正说过的维度"，用来决定要不要显示百分比。
     刻意不数 popularity（它不是用户说的，是数据自带的知名度微调）。

     口径与打分因子一一对应，数错会让门槛失效，所以逐项列出来而不是
     写成 `Object.keys(answers).length` —— 后者会把 UI 辅助字段
     （likedZh / dislikedZh / anchorPerfumeNotes）当成独立维度。

     注意这里必须先构造出对象再数：`profile` 是上面那个字面量，
     所以在 return 之前算出 activeDims 并挂上去。 */
  profile.activeDims = [
    profile.family,                                // 香型直选
    profile.subfamily,                             // 小类
    answers.emotion,                               // 情绪（旧入口；香型入口时 profile.emotion 是合成对象）
    profile.occasion,                              // 场合
    answers.intensity != null,                     // 浓淡
    answers.concentration,                         // 浓度档
    profile.longevity != null,                     // 留香
    profile.season,                                // 主季节
    profile.seasonSecond,                          // 次选季节
    profile.temperature,                           // 冷暖
    profile.sweetness != null,                     // 甜度
    profile.characterTags.length > 0 || !!answers.character,  // 气质
    profile.likedNotes.size > 0,                   // 喜欢的香调
    profile.dislikedNotes.size > 0,                // 讨厌的香调
    profile.characterNeg.length > 0,               // 气质禁止标签
    profile.anchorNotes.size > 0 || !!profile.anchorPerfumeId,  // 已知锚点
  ].filter(Boolean).length;

  return profile;
}

/* ---------- 单瓶打分 ---------- */
export function scorePerfume(p, profile, taxonomy) {
  const breakdown = [];
  let score = 0;

  // 1) 家族吻合
  let famHit = 0;
  let famBest = null;
  let famBestW = 0;
  for (const [fam, w] of Object.entries(p.families)) {
    const pref = profile.families[fam] || 0;
    const contribution = pref * w;
    famHit += contribution;
    if (contribution > famBestW) { famBestW = contribution; famBest = fam; }
  }
  /* 分母 = 该入口下 famHit 的**库内可达上界**，否则这一项永远拿不满。
     上界实测（1388 瓶，scripts/probe-g7-team.mjs / probe-g7-c.mjs）：
       · 香型入口、不答场合：6 个族全部精确 1.0000。
       · 香型入口、答了场合：最大 **1.1760**（fresh + daily → trussardi-riflesso）——
         场合 lerp 会把 famHit 抬到 1.0 以上，这是场合那 22 分携带的信息。
       · 旧分母 1.2：无场合最高 43.33 / 52 = **83.3%**；带场合最高 50.96 / 52 = **98.0%**。
         所以「83.3% 天花板」只对不答场合成立，不能当统一说法。
       · 情绪入口：pref 是六族全非零的向量（和≈3.2），点积上界 1.52。

     为什么按 occasion 分两档（1.18 / 1.00），而不是一律 1.0：
     一律 1.0 会让「香型入口 + 场合」这一桶里 **2846 瓶（30 组求和）撞 clamp**，
     被 clamp 吃掉的正好是 1.0→1.176 那段，也就是场合信号 —— 因子能拿满了，
     但场合维度在这些瓶上失去区分力。取 1.18 略高于真实上界 1.176，
     于是没有瓶撞顶，同时两个分支的 52 分同量纲。

     三变体实测（probe-g7-c.mjs，30 组/桶，固定种子 20261108）：
       有场合饱和瓶数  旧 1.2 / 一律 1.0 / 分档 = 0 / 2846 / **0**
       有场合 top-1 换手（vs 旧 1.2）  = 10.0% / **0.0%**
       matchPct 最大 97，未破 100
     → 分档三条闸门全过，一律 1.0 卡在饱和。

     无场合那档仍是 1.00：此时上界恰好 1.000，「主族完全命中」的瓶拿到 52 分
     正是分母取可达上界的正常结果，不是 clamp 吃信号。

     情绪入口保持 1.2 不动：若改 1.0，clean 有 204 瓶、cold+formal 有 376 瓶
     并列拿满 52，纯情绪 lazy 单独 481 瓶，全组合最高 621 瓶 —— 因子退化成常数，
     属于换打分体系而不是修分母。 */
  const famDenom = profile.family ? (profile.occasion ? 1.18 : 1.0) : 1.2;
  const famScore = clamp01(famHit / famDenom) * (WEIGHTS.emotionFamily + WEIGHTS.occasionFamily);
  score += famScore;
  if (famBest) {
    breakdown.push({
      factor: 'family',
      score: famScore,
      family: famBest,
      familyZh: taxonomy.families.find((f) => f.id === famBest)?.zh || famBest,
      weight: 1,
    });
  }

  // 1b) 香型家族直选：用户在第 1 步明确点的那个家族，权重最高。
  // 与 1) 的区别：1) 是"画像向量 × 香水向量"的点积（软匹配），
  // 这里是"你点了花香，它就是不是花香"（硬匹配）——两者分开记分，理由句式也不同。
  if (profile.family) {
    const w = (p.families || {})[profile.family.id] || 0;
    const pickScore = clamp01(w) * WEIGHTS.familyPick;
    if (pickScore > 0) {
      score += pickScore;
      // 次族：权重排第二的那个家族，用来给理由加区分度
      const others = Object.entries(p.families || {})
        .filter(([k]) => k !== profile.family.id && k !== '_')
        .sort((a, b) => b[1] - a[1]);
      const sec = others[0] && others[0][1] >= 0.25 ? others[0][0] : null;
      // 家族权重低于 0.4 说明这瓶只是"带一点"，不是用户要的那族。
      // 不压分的话前排会出现「只是带一点柑橘调，不是主角」这种自相矛盾的推荐。
      if (w < 0.4) score -= 26 * (1 - w / 0.4);
      breakdown.push({
        factor: 'familyPick',
        score: pickScore,
        family: profile.family.id,
        familyZh: profile.family.zh,
        secondaryZh: sec ? (taxonomy.families.find((f) => f.id === sec)?.zh || sec) : null,
        weight: Number(w.toFixed(2)),
      });
    }
  }

  // 香调集合：后面几步都要用，提到前面统一构造。
  // 这里预先切好 token，后面三轮匹配共用，避免同一瓶切 3 次。
  const noteTokens = (p.notesAll || []).map((n) => tokenize(n));

  // 命中判定统一走 matchesNote：按词匹配 + 显式别名，
  // 不再用双向子串（那会让 "Tuberose" 里的 rose 被当成玫瑰）。
  //
  // 两个坑（都已实测踩过）：
  //   ① noteEntryOf 的 key 是 normNote(en)（"neroli / orange blossom" →
  //      "neroli orange blossom"）+ 各个别名。UI 存进 likedNotes 的却是**原始 en**
  //      （带斜杠和小写空格的 "neroli / orange blossom"），直接 get(key) 拿不到。
  //      拿不到就会掉进下面的兜底分支 —— 而旧兜底是 `out.push(key)` 无条件判命中，
  //      后果是「橙花」这一项对全部 1388 瓶都算命中，用户点它等于没点。
  //   ② 兜底不能是"查不到就算命中"，也不能是"查不到就算没命中"：
  //      emotionMap 里的锚点写过 "tonka" / "soap" / "fig" 这种简写，别名表里没有，
  //      但它们确实是合法香调。正确做法是拿这串词本身去和瓶子的香调做 token 子序列
  //      匹配 —— 匹配不上才算没命中。
  const hitsOf = (selection) => {
    const out = [];
    for (const key of selection) {
      const entry = profile.noteEntryOf?.get(normNote(key));
      if (entry) {
        if (noteTokens.some((toks) => matchesNote(entry, null, toks))) out.push(key);
      } else {
        const needle = tokenize(key);
        if (needle.length && noteTokens.some((toks) => hasTokenSubsequence(toks, needle))) out.push(key);
      }
    }
    return out;
  };

  // 2) 情绪锚点香调命中（比家族更锐）
  const emoHits = hitsOf(profile.emotionNotes);
  if (emoHits.length) {
    const eScore = clamp01(emoHits.length / 2) * WEIGHTS.emotionNotes;
    score += eScore;
    breakdown.push({
      factor: 'emotionNotes',
      score: eScore,
      hits: emoHits.map((n) => profile.emotionNotesZh?.[n] || n),
    });
  }

  // 2b) 子家族香材命中（第 2 步选的子家族，其挂靠香材命中了几个）
  const subHits = hitsOf(profile.subfamilyNotes || []);
  if (subHits.length) {
    const sScore = clamp01(subHits.length / 2) * WEIGHTS.subfamilyHits;
    score += sScore;
    breakdown.push({
      factor: 'subfamilyHits',
      score: sScore,
      subfamilyZh: profile.subfamily?.zh || '',
      hits: subHits.map((n) => profile.noteEntryOf?.get(n)?.zh || n),
    });
  }

  // 3) 浓度/浓郁度吻合：用 family 向量里的 amber+gourmand 占比近似"厚重感"
  const heaviness = ((p.families.amber || 0) + (p.families.gourmand || 0)) /
    (Object.values(p.families).reduce((a, b) => a + b, 0) || 1);
  const targetHeaviness = (profile.intensity - 1) / 4; // 0..1
  const intScore = clamp01(1 - Math.abs(heaviness - targetHeaviness)) * WEIGHTS.intensity;
  score += intScore;
  breakdown.push({ factor: 'intensity', score: intScore, heaviness: Number(heaviness.toFixed(2)) });

  // 3) 季节
  if (profile.season && Array.isArray(p.seasons) && p.seasons.length) {
    const sScore = p.seasons.includes(profile.season) ? WEIGHTS.season : 0;
    score += sScore;
    if (sScore) {
      /* 次选也命中的话记在同一条里（见 reasonText 的 b.second）——
         单独占一条会把理由条数顶到上限，挤掉真正有区分度的因子。 */
      const both = profile.seasonSecond && p.seasons.includes(profile.seasonSecond);
      breakdown.push({
        factor: 'season', score: sScore, season: profile.season,
        second: both ? profile.seasonSecond : null,
      });
      // 次选单独那 5 分只在主季节没中时给，二者不同时计分（逻辑同 8e）
    }
  }

  // 4) 时段
  if (profile.preferredTime && Array.isArray(p.timesOfDay) && p.timesOfDay.includes(profile.preferredTime)) {
    score += WEIGHTS.timeOfDay;
    breakdown.push({ factor: 'timeOfDay', score: WEIGHTS.timeOfDay, time: profile.preferredTime });
  }

  // 5) 喜欢的香调命中
  const likedHits = hitsOf(profile.likedNotes);
  if (likedHits.length) {
    const nScore = clamp01(likedHits.length / 2) * WEIGHTS.likedNotes;
    score += nScore;
    // 理由里回显用户看到的写法（佛手柑 而非 bergamot）
    const hitsDisplay = likedHits.map((n) => profile.likedDisplay?.get(n) || n);
    breakdown.push({ factor: 'likedNotes', score: nScore, hits: hitsDisplay });
  }

  // 6) 讨厌的香调命中（强惩罚，且必须能解释为什么排除了它）
  const dislikedHits = hitsOf(profile.dislikedNotes);
  if (dislikedHits.length) {
    score += WEIGHTS.dislikedNotes;
    const dh = dislikedHits.map((n) => profile.dislikedDisplay?.get(n) || n);
    breakdown.push({ factor: 'dislikedNotes', score: WEIGHTS.dislikedNotes, hits: dh });
  }

  // 7) 知名度微调（rank 越小越知名）
  if (p.popularityRank) {
    const popScore = clamp01(1 - (p.popularityRank - 1) / 120) * WEIGHTS.popularity;
    score += popScore;
    breakdown.push({ factor: 'popularity', score: popScore, rank: p.popularityRank });
  }

  /* ---- 8) v19 新增五维 ---- */

  // 8a) 性格标签命中（硬匹配 + 软回退）
  // 硬：这瓶的 character 里真有用户点的那一个 → 满分。
  // 软：没有，但它的家族分布与这个标签的典型分布重合 → 按重合度给分。
  //     不给软回退的话，选了「清冷」而库里躺着一瓶极清冷的木质，
  //     只因为源站没打 cold 标签就得 0 分，属于数据缺陷惩罚用户。
  if (profile.characterTags.length || profile.character) {
    const ch = p.character || [];
    const wantTags = profile.characterTags.length ? profile.characterTags : [profile.character];
    const hitTag = wantTags.find((t) => ch.includes(t)) || null;
    let cScore = 0;
    let how = null;
    if (hitTag) {
      cScore = WEIGHTS.character;
      how = 'tag';
      profile.character = hitTag;   // 理由句里要说出到底命中了哪个标签
    } else if (profile.characterFamily) {
      let acc = 0;
      let tot = 0;
      for (const [fam, w] of Object.entries(profile.characterFamily)) {
        tot += w;
        acc += w * ((p.families || {})[fam] || 0);
      }
      const ratio = tot > 0 ? clamp01(acc / tot) : 0;
      // 门槛 0.5：低于它就是"沾一点"，不该拿分（与 familyPick 的 0.4 同一思路）
      if (ratio >= 0.5) { cScore = WEIGHTS.character * 0.6 * ratio; how = 'family'; }
    }
    /* 禁止标签：命中一个扣 22% 的性格分，最低归零。
       数值来自实测（scripts/probe-character.mjs）：不加这一步，七个原型
       两两重合最高 61%、并列 33%；加 -0.22/个后降到 43%、并列 14%。 */
    if (cScore > 0 && profile.characterNeg.length) {
      const bad = profile.characterNeg.filter((t) => ch.includes(t)).length;
      if (bad) cScore = Math.max(0, cScore * (1 - 0.22 * bad));
    }
    if (cScore > 0) {
      score += cScore;
      breakdown.push({ factor: 'character', score: cScore, character: profile.character, how });
    }
  }

  // 8b) 浓度档位。数据里 87% 有值（其余 13% 是 None，直接跳过不扣分）
  if (profile.concentration && p.concentration) {
    const same = p.concentration === profile.concentration;
    // 相邻档给一半：EDP↔EDT 在真实香水里经常可以互相替代，
    // 判成"完全不符"会把合理的候选排除掉。
    const neighbors = {
      'extrait': ['parfum', 'elixir', 'eau-de-parfum'],
      'parfum': ['extrait', 'elixir', 'eau-de-parfum'],
      'elixir': ['extrait', 'parfum', 'eau-de-parfum'],
      'eau-de-parfum': ['eau-de-toilette', 'parfum', 'extrait'],
      'eau-de-toilette': ['eau-de-parfum', 'eau-de-cologne'],
      'eau-de-cologne': ['eau-de-toilette'],
    };
    const near = (neighbors[profile.concentration] || []).includes(p.concentration);
    const k = same ? 1 : near ? 0.5 : 0;
    if (k > 0) {
      const cScore = WEIGHTS.concentration * k;
      score += cScore;
      breakdown.push({ factor: 'concentration', score: cScore, concentration: p.concentration, exact: same });
    }
  }

  // 8c) 持香时长。longevityInferred 是**推断值**（源站无此字段，
  // 按浓度映射而来，见 taxonomy.concentrationLongevity.note）。
  // 所以这里只给"差 1 档"少量扣分，不做硬筛选 —— UI 上必须标「推断」。
  if (profile.longevity != null && p.longevityInferred != null) {
    const d = Math.abs(p.longevityInferred - profile.longevity);
    const lScore = clamp01(1 - d / 2) * WEIGHTS.longevity;   // 差 0 档满分，差 2 档 0 分
    if (lScore > 0) {
      score += lScore;
      breakdown.push({ factor: 'longevity', score: lScore, longevity: p.longevityInferred, delta: d });
    }
  }

  // 8d) 讨厌某个香型家族。比「讨厌单个香调」粗，所以惩罚也更轻（-30 vs -40），
  // 且只在该族确实是这瓶的主族时才罚 —— "带一点雪松的柑橘"不该因为讨厌木质被排除。
  if (profile.dislikedFamilies.length) {
    const fams = Object.entries(p.families || {}).filter(([k]) => k !== '_');
    const top = fams.sort((a, b) => b[1] - a[1])[0];
    const hit = profile.dislikedFamilies.find((f) => top && top[0] === f);
    if (hit) {
      score += WEIGHTS.dislikedFamily;
      breakdown.push({
        factor: 'dislikedFamily', score: WEIGHTS.dislikedFamily,
        family: hit,
        familyZh: taxonomy.families.find((f) => f.id === hit)?.zh || hit,
      });
    }
  }

  // 8e) 次选季节：只在主季节没用上时才给这半分，
  // 避免"只想夏天"和"夏天优先"拿到同一个分数。
  if (profile.seasonSecond && Array.isArray(p.seasons) && p.seasons.length) {
    if (!(profile.season && p.seasons.includes(profile.season)) && p.seasons.includes(profile.seasonSecond)) {
      score += WEIGHTS.seasonSecond;
      breakdown.push({ factor: 'seasonSecond', score: WEIGHTS.seasonSecond, season: profile.seasonSecond });
    }
  }

  /* ---- 8f) 气味温度 ---- */
  if (profile.temperature) {
    const ch = p.character || [];
    const isWarm = ch.some((t) => WARM_TAGS.includes(t)) && !ch.some((t) => COOL_TAGS.includes(t));
    const isCool = ch.some((t) => COOL_TAGS.includes(t)) && !ch.some((t) => WARM_TAGS.includes(t));
    const mine = isWarm ? 'warm' : isCool ? 'cool' : 'neutral';
    // 用户选「中性」时，任何一瓶都不该因为这一项被拉开差距 ——
    // 全给半分，保持"这一维不参与区分"的语义。
    const k = profile.temperature === 'neutral' ? 0.5
      : (mine === profile.temperature ? 1 : (mine === 'neutral' ? 0.25 : 0));
    if (k > 0) {
      const tScore = WEIGHTS.temperature * k;
      score += tScore;
      breakdown.push({ factor: 'temperature', score: tScore, mine, want: profile.temperature });
    }
  }

  /* ---- 8g) 甜度 ---- */
  if (profile.sweetness != null) {
    const actual = sweetnessOf(p);
    const target = profile.sweetness / 3;          // 0..1
    const d = Math.abs(actual - target);
    const sScore = clamp01(1 - d) * WEIGHTS.sweetness;
    if (sScore > 0.5) {
      score += sScore;
      breakdown.push({
        factor: 'sweetness', score: sScore,
        actual: Number(actual.toFixed(2)), target: profile.sweetness,
      });
    }
  }

  /* ---- 8h) 已知锚点：与那瓶/那几个香调的重合度 ----
     这是整套问卷里唯一基于"真实反馈"的因子，权重也最高（26）。
     做法与 likedNotes 同构，但归一方式不同：
     likedNotes 是"命中几个算几个"，锚点按**重合比例**算 ——
     因为锚点可能有 8 个香调，命中 3 个就该是中等相似而不是满分。 */
  if (profile.anchorNotes.size) {
    const anchorHits = hitsOf(profile.anchorNotes);
    if (anchorHits.length) {
      /* 归一化的分母用 `max(3, size/2)`，不是常数 4。
         实测踩到：分母取 min(4, size)=4 时，锚点有 12 个香调的场合，
         几乎每瓶都能撞上 3–4 个 → 全部拿到 0.75 以上 → 变成**常数**，
         既不区分候选，也不影响排序（实测前三名一瓶没变）。
         改成 size/2 之后，12 个香调的锚点要命中 6 个才满分，
         3 个只有 0.5，这才有区分度。
         下限 3 是给"锚点只有 2–3 个香调"的情况兜底，否则一瓶命中 2 个就满分。 */
      const denom = Math.max(3, profile.anchorNotes.size / 2);
      const ratio = clamp01(anchorHits.length / denom);
      const aScore = ratio * WEIGHTS.anchorNotes;
      score += aScore;
      breakdown.push({
        factor: 'anchor', score: aScore, ratio: Number(ratio.toFixed(2)),
        hits: anchorHits.map((n) => profile.noteEntryOf?.get(n)?.zh || n),
      });
    }
  }

  // 9) 持香下限约束（场合要求）
  let longevityWarn = null;
  if (profile.maxLongevityFloor && p.longevityInferred != null) {
    if (p.longevityInferred < profile.maxLongevityFloor) {
      score -= 8;
      longevityWarn = `持香推测 ${p.longevityInferred}/5，低于「${profile.occasion.zh}」建议的 ${profile.maxLongevityFloor}/5`;
    }
  }

  return { score: Number(score.toFixed(2)), breakdown, longevityWarn };
}

/* ---------- 主入口 ---------- */
export function recommend(answers, perfumes, taxonomy, opts = {}) {
  const topN = opts.topN ?? 3;
  const profile = buildProfile(answers, taxonomy);

  /* ---------- G6：把 taxonomy 的族内判别规则接进打分 ----------

     v2.1.0 给四个族（citrus / floral / woody / amber）各写了一份 rules：
     族内优先级级联，priority 从小到大、第一个通过即归属，每条规则声明
     must（全中）/ any（至少一个）/ not（一个都不能中）/ always（兜底）。

     在此之前这些字段在 app.js / notes.js / scoring.js 里的引用数全是 0 ——
     审计得出的分类结论停在数据层，到不了用户侧。这里先接最确定的一条：
     互斥。即：用户选了 A 类，而这瓶香水按规则实际该归 B 类 —— 它不该排第一。

     为什么不按 rules 重判族内归属：perfumes.json 没有 subfamily 字段，
     硬重判等于把 1228 瓶的归属全部重写一遍，那是换一套打分体系（另立一轮）。
     这里只做减法：命中兄弟类判别特征、同时本类特征也成立的，乘 0.82。

     0.82 的来历：实测该系数让若干组答案里的第 1 名换成更贴的候选，
     而第 1 与第 3 之间的分差（通常 8–14 分）不会被整体翻盘。
     要改这个数请先重跑 scripts/probe-boundary.mjs 看排序变化。 */
  const boundaryPenalty = (perfume) => {
    const fam = profile.family;
    if (!fam || !Array.isArray(fam.rules)) return 1;
    const sub = profile.subfamily;
    /* 只在大圈+小圈都选了时生效：没选小类就无从判断"该归哪一类" */
    if (!sub) return 1;
    const notes = new Set((perfume.notesAll || []).map((n) => String(n).toLowerCase()));
    const has = (n) => notes.has(String(n).toLowerCase());
    const hit = (list) => (list || []).some(has);

    const passes = (r) => {
      if (!r) return false;
      if (r.always) return true;
      if (r.must && !r.must.every(has)) return false;
      if (r.not && r.not.some(has)) return false;
      if (r.any && !hit(r.any)) return false;
      return true;
    };
    const ordered = [...fam.rules].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
    const actual = ordered.find((r) => passes(r));
    if (!actual || actual.id === sub.id) return 1;
    /* 本类规则自己也没通过时不罚：数据不支持任何一类的判别特征，
       拿一条它不满足的规则惩罚它并不公平。 */
    const ownRule = fam.rules.find((r) => r.id === sub.id);
    if (!passes(ownRule)) return 1;
    return 0.82;
  };

  const scored = perfumes.map((p) => {
    const r = scorePerfume(p, profile, taxonomy);
    /* opts.boundary === false 时关闭惩罚，仅供 scripts/probe-boundary.mjs 做 A/B。 */
    const mul = opts.boundary === false ? 1 : boundaryPenalty(p);
    return { perfume: p, ...r, score: r.score * mul, boundaryMul: mul };
  }).sort((a, b) => b.score - a.score);

  // 香型轮盘入口：优先只从"真的是这一族"的瓶里挑。
  // 否则会出现"你选了柑橘调，第二名只是带一点柑橘"——推荐自己承认跑偏。
  // 阈值取 0.5：低于它基本是别的族主导、这族只是配角（实测主导权重都 >= 0.6）。
  // 三层池，逐级放宽，只有上一层凑不够 topN 才降级：
  //   L1 主导该族（权重排第一）—— 这是用户真正要的
  //   L2 该族权重 >= 0.5（次族，方向对但不是主角）
  //   L3 全部
  // 实测各家族主导瓶数：柑橘 34 / 花香 156 / 木质 82 / 琥珀 46 / 清新 49 / 美食 33，L1 均够 topN=3。
  const wOf = (s) => ((s.perfume.families || {})[profile.family.id] || 0);
  const isDominant = (s) => {
    const e = Object.entries(s.perfume.families || {})
      .filter(([k]) => k !== '_')
      .sort((a, b) => b[1] - a[1])[0];
    return !!e && e[0] === profile.family.id;
  };
  let ranked = scored;
  if (profile.family) {
    const L1 = scored.filter(isDominant);
    const L2 = scored.filter((s) => wOf(s) >= 0.5);
    ranked = L1.length >= topN ? L1 : (L2.length >= topN ? L2 : scored);
  }

  // 多样性：同一源家族、同一品牌都不许占满前三。
  // 只按家族去重不够——Byredo 有 9 瓶分散在 4 个家族，仍会霸占三席，
  // 对一个"还没入门、想对比着闻"的用户来说，三瓶同品牌等于没给选择。
  const picked = [];
  const seenFamily = new Set();
  const seenBrand = new Set();
  for (const s of ranked) {
    if (picked.length >= topN) break;
    const fam = s.perfume.familySource;
    const brand = s.perfume.brand;
    if (seenFamily.has(fam) || seenBrand.has(brand)) continue;
    seenFamily.add(fam);
    seenBrand.add(brand);
    picked.push(s);
  }
  // 第一轮放宽：允许同家族，但仍不许同品牌
  if (picked.length < topN) {
    const brandsNow = new Set(picked.map((s) => s.perfume.brand));
    for (const s of ranked) {
      if (picked.length >= topN) break;
      if (picked.includes(s)) continue;
      if (brandsNow.has(s.perfume.brand)) continue;
      brandsNow.add(s.perfume.brand);
      picked.push(s);
    }
  }
  // 最后一轮：样本太小时彻底放宽，保证一定凑够 topN
  for (const s of ranked) {
    if (picked.length >= topN) break;
    if (!picked.includes(s)) picked.push(s);
  }

  /* ---------- 匹配度归一化（G6，v28 重做）----------

     原来分母是 `WEIGHTS` 全部正项之和 = 275。这个数**不是可达上界**：

       · `family` 因子（emotionFamily 30 + occasionFamily 22 = 52）
         内部是 `clamp01(famHit / 1.2) * 52`。只选一族时向量点积最高
         1.0，除以 1.2 只剩 0.833 → 这一项**永远拿不到 52，实测库内最高 44.8**。
       · 于是"每一项都满分"的假想瓶也只有 241.5 / 275 = 88%。
       · 真实答案更远：一组七步全答的第 1 名原始分约 190，
         /275 显示 69%。**一个近乎完美的匹配被显示成 69%。**

     实测（40 组随机答案 × 10 个答题深度，scripts/probe-matchpct.mjs）：
       深度 0（只点香型）中位 35% … 深度 9 中位 69%，随答题单调递增。

     三个候选分母的实测对比（同一批答案）：

       口径                     深度0    深度9    方向
       A 现状 /275              35%      69%      单调递增 ✓ 但天花板 69%
       C /已答因子权重之和      90-99%   76%      **反向**（答得少反而高）
       F /库内逐因子可达之和    97-99%   79%      **反向**
       G 收缩修正（F 向 50%）   62%      79%      单调递增

     A 的方向对、数值失真；C 与 F 数值"合理"但方向错 —— 只点一个香型就
     标 99% 是虚假承诺，比 35% 更糟。G 两项都对，但引入两个任意系数。

     所以这里选**第四条路**，干脆修掉"分母不可达"这个根：

       ① 分母改用**本次答案的逐因子库内可达之和**（tightBound）。
          它一定 >= 任何单瓶得分（每瓶每项都不会超过该项的库内最高），
          所以百分比不会超过 100%，而且 100% 是**真的能到**的。
       ② 但分母随答案变会让"答得少反而高"，所以配一道**证据门槛**：
          激活维度 < MATCH_PCT_MIN_DIMS（6）时**不显示百分比**，
          改显示「初步匹配」。六维以上时 F 口径实测稳定在 79–86% 区间
          （深度 5 是 86%，深度 9 是 79%），波动 7 个点，可接受。

     为什么不干脆保留 275：它让"最好的一瓶"永远显示 60–70%，
     用户看到的第一反应是"这推荐不靠谱"，而问题出在分母不是算法。

     `matchPct` 为 `null` 时调用方必须显示定性文案，不许显示 0% ——
     0% 的意思是"完全不匹配"，那是另一句话。 */
  const tightBound = (() => {
    const perFactor = {};
    for (const s of scored) {
      for (const b of s.breakdown) {
        if (!b || typeof b.score !== 'number') continue;
        if (b.score <= 0) continue;
        if (b.factor === 'dislikedNotes' || b.factor === 'dislikedFamily') continue;
        if (b.score > (perFactor[b.factor] || 0)) perFactor[b.factor] = b.score;
      }
    }
    const sum = Object.values(perFactor).reduce((a, b) => a + b, 0);
    /* 兜底：极端数据下 perFactor 可能为空（全部负分），此时退回权重和，
       避免除零。正常路径不会走到这里。 */
    return sum > 0 ? sum : Object.values(WEIGHTS).reduce((a, b) => a + Math.max(0, b), 0);
  })();

  const enoughEvidence = (profile.activeDims || 0) >= MATCH_PCT_MIN_DIMS;

  return {
    profile: {
      emotionZh: profile.emotion.zh,
      occasionZh: profile.occasion?.zh ?? null,
      familyZh: profile.family?.zh ?? null,
      subfamilyZh: profile.subfamily?.zh ?? null,
      intensity: profile.intensity,
      activeDims: profile.activeDims || 0,
      matchPctShown: enoughEvidence,
    },
    results: picked.map((s) => ({
      ...s,
      matchPct: enoughEvidence ? Math.round(clamp01(s.score / tightBound) * 100) : null,
      reasons: buildReasons(s, profile, taxonomy),
    })),
  };
}

/* ---------- 理由生成：只做模板拼装，不调模型 ---------- */

// 展示顺序：用户明确点名的排最前（"我说过的话被听见了"），结构性匹配其次，泛化描述垫底。
const REASON_PRIORITY = {
  familyPick: 0,       // 第 1 步香型轮盘点的家族——比什么都明确
  /* 锚点排在家族直选之后、其他一切之前：
     它是"我试过这瓶并且喜欢"的真实反馈，比任何偏好声明都硬。
     排在 likedNotes(2) 之前是因为两者都讲"含某个香调"，
     但锚点讲的是"含你实际喜欢过的那瓶里的香调"，信息量更大。 */
  anchor: 1,
  subfamilyHits: 2,    // 第 2 步子家族香材命中
  likedNotes: 3,
  emotionNotes: 4,
  family: 5,
  intensity: 6,
  temperature: 7,      // 气味冷暖（本轮新增）
  sweetness: 8,        // 甜度（本轮新增）
  character: 9,        // 气质标签
  season: 10,
  timeOfDay: 11,
  concentration: 12,
  longevity: 13,
  popularity: 14,
  /* 负分项排在最后：它们解释"为什么不是某些别的"，是补充信息，
     不该挤掉"为什么是它"。但必须在表里 —— 不在表里会默认 99，
     连候选池都进不去（v20 第一版就是这么漏的）。 */
  dislikedFamily: 90,
  dislikedNotes: 91,
};
// 结构性因子合计权重 52（家族 30+22、浓度 18），是打分的骨架，不能让个性化理由把它们挤出去。
const STRUCTURAL_FACTORS = new Set(['family', 'familyPick', 'intensity']);
const MAX_REASONS = 3;

/* 性格标签的中文名。键与数据源 character 字段一一对应（21 种）。 */
const CHAR_ZH = {
  floral: '花香', warm: '温暖', citrusy: '柑橘', fresh: '清爽',
  sweet: '甜', spicy: '辛香', fruity: '果香', woody: '木质',
  earthy: '土感', creamy: '奶感', herbal: '草本', powdery: '粉感',
  resinous: '树脂', green: '绿感', musky: '麝香', amber: '琥珀',
  smoky: '烟熏', salty: '咸感', clean: '洁净', leathery: '皮革', rich: '浓郁',
};

/* 浓度的中文名。与 taxonomy.concentrationLongevity.labels 同一套说法。 */
const CONC_ZH = {
  'extrait': '香精 Extrait',
  'parfum': '香精 Parfum',
  'elixir': '精粹 Elixir',
  'eau-de-parfum': '淡香精 EDP',
  'eau-de-toilette': '淡香水 EDT',
  'eau-de-cologne': '古龙水 EDC',
};

/* 负分里"值得讲给用户听"的那几类。
   dislikedNotes 讲"含你受不了的 X"，dislikedFamily 讲"它是你划掉的那族"——
   两条都是排除理由，用户需要知道，否则会以为系统没听见他说的"不要"。
   将来若有别的负分因子（比如"超预算"），加进这个集合即可。 */
const NEGATIVE_REASONS = new Set(['dislikedNotes', 'dislikedFamily']);

function reasonText(b, profile) {
  switch (b.factor) {
    case 'family':
      // 三条理由如果都用「X，正是「Y」这一类」的句式，读起来就是同一个模板填词。
      // 这里让 family 用「主调 + 占比」的事实句，跟下面两条在句型上岔开。
      /* 只有**真的情绪入口**才能说「在你选的「X」里占大头」。
         香型轮盘入口下 profile.emotion 是合成对象（zh 直接取自家族），
         照原样拼会得到「主调是花香调，在你选的「花香调」里占大头」——
         自指循环，而且和 familyPick 那句「主体就是花香调」重复。
         那种情况下改用场合做锚（famHit 含场合 lerp，说得出道理）。 */
      if (!profile.emotionReal) {
        return profile.occasion
          ? `主调是${b.familyZh}，也贴着「${profile.occasion.zh}」这一路`
          : `主调是${b.familyZh}`;
      }
      return profile.occasion
        ? `主调是${b.familyZh}，在你选的「${profile.emotion.zh}」里占大头`
        : `主调是${b.familyZh}`;
    case 'familyPick': {
      // 硬匹配：用户点的是这个家族。不能说"占 100%"——家族主权重常态就是 1.0，
      // 每瓶都报 100% 等于没信息。按权重分档，读者才知道这瓶有多"纯"。
      // 三张卡若都说「主体就是柑橘调」等于没区分度，
      // 补一本次族：「主体就是柑橘调，底下垫着清新调」。
      const rest = b.secondaryZh ? `，底下垫着${b.secondaryZh}` : '';
      if (b.weight >= 0.99) return `主体就是${b.familyZh}${rest}`;
      if (b.weight >= 0.6) return `${b.familyZh}是它的主调${rest || '，还压着别的味道'}`;
      return `只是带一点${b.familyZh}，不是主角`;
    }
    case 'subfamilyHits': {
      // 子家族挂靠香材被点中，比家族层更具体。
      // 但有些子家族本名就是那味香材（乌木 / 檀木 / 香根草），
      // 原句式会读成「乌木在里面，正是「乌木」的骨架」——同词重复，改说"主体就是它"。
      const names = b.hits.slice(0, 2).join('、');
      const same = b.hits.some((h) => h === b.subfamilyZh || b.subfamilyZh.includes(h));
      return same
        ? `主体就是${names}，${b.subfamilyZh}这一路的标准做法`
        : `${names}在里面，是「${b.subfamilyZh}」的骨架`;
    }
    case 'intensity': {
      // 原来一律写「落在这个区间」，但 targetHeaviness=(intensity-1)/4，intensity=3 时是 0.5。
      // 厚重感 0.13 与 0.5 差 0.37，说"落在区间"是假话。按差值如实分三档。
      const target = (profile.intensity - 1) / 4;
      const d = Math.abs(b.heaviness - target);
      if (d <= 0.12) return `厚重感 ${b.heaviness}，和你要的 ${profile.intensity}/5 对得上`;
      return b.heaviness < target
        ? `厚重感 ${b.heaviness}，比你要的 ${profile.intensity}/5 更清透`
        : `厚重感 ${b.heaviness}，比你要的 ${profile.intensity}/5 更压人`;
    }
    case 'season':
      /* 主季节命中的同时把次选也带上（如果都中）：
         两条各占一格会把理由条数挤爆（上限 3），
         而"春夏都能穿"本来就是一句话能说完的信息。 */
      return b.second
        ? `它同时被标了${seasonZh(b.season)}季与${seasonZh(b.second)}季香`
        : `它在${seasonZh(b.season)}季香里被标注过，当季喷不容易出错`;
    case 'timeOfDay':
      return `适合${b.time === 'day' ? '白天' : '夜晚'}使用，和你的场合一致`;
    case 'likedNotes':
      return `含你点名的 ${b.hits.slice(0, 2).join('、')}`;
    case 'emotionNotes':
      // 「这一类气味的主力」是句空话——「这一类」指代不明，读者拿不到新信息。
      // 换成点名具体香材 + 它落在哪个调，是可核对的事实。
      return `${b.hits.slice(0, 2).join('、')}在里面，是「${profile.emotion.zh}」靠的那几种味道`;
    case 'popularity':
      return `知名度排名 ${b.rank}，属于相对好买、好试的一类`;

    /* ---- v19 新增五维的理由句 ----
       原则与上面一致：说可核对的事实，不写"这一类气味的主力"那种空话。
       每条都尽量带上用户自己给过的那个词，让它能被反推。 */
    case 'character':
      if (b.how === 'tag') return `源站给它的性格标签里就有「${CHAR_ZH[b.character] || b.character}」`;
      return `没打「${CHAR_ZH[b.character] || b.character}」这个标签，但主调分布跟你说的那种气质对得上`;
    case 'concentration':
      return b.exact
        ? `浓度就是你要的${CONC_ZH[b.concentration] || b.concentration}`
        : `浓度是${CONC_ZH[b.concentration] || b.concentration}，与你选的档位相邻，日常可以互相替代`;
    case 'longevity':
      // 必须把「推断」二字写进句子：数据源没有持香字段，
      // 这一档是按浓度推出来的（taxonomy.concentrationLongevity.note 已声明）。
      return b.delta === 0
        ? `按浓度推断的持香约 ${b.longevity}/5，和你选的档位一致`
        : `按浓度推断的持香约 ${b.longevity}/5，与你选的档位相差 ${b.delta} 档`;
    case 'dislikedFamily':
      return `它不属于你划掉的${b.familyZh}——主调是别的方向`;
    case 'temperature': {
      const zh = { warm: '偏暖', cool: '偏凉', neutral: '中性' };
      if (b.want === 'neutral') return '冷热都能接受，这一项不参与区分';
      if (b.mine === 'neutral') return `它是中间调，不偏${zh[b.want]}`;
      return `${zh[b.mine]}，和你要的${zh[b.want]}一路`;
    }
    case 'sweetness': {
      const words = ['完全不甜', '微甜', '中等甜', '很甜'];
      return `甜度 ${b.actual}，你要的是「${words[b.target] || b.target}」`;
    }
    case 'anchor':
      return `含你点名那瓶里的 ${b.hits.slice(0, 3).join('、')}`;
    case 'seasonSecond':
      return `你次选的${seasonZh(b.season)}季它也标了，换季还能用`;
    default:
      return null;
  }
}

export function buildReasons(scored, profile, taxonomy) {
  /* v19：负分因子也必须能进理由。
     原过滤是 `score > 0`，于是 dislikedNotes（-40）与 dislikedFamily（-30）
     永远产不出句子 —— 但"它不属于你划掉的木质"恰恰是用户最想知道的那条，
     也是"理由必须能反推到某个答案"这条产品原则的直接落点。
     改成：正分因子照旧，负分因子只在它**真的命中了某个用户答案**时入选
     （命中才有 breakdown 条目，所以这里只需放行，不需要额外判断）。 */
  const candidates = [...scored.breakdown]
    .filter((b) => b.score > 0 || b.score <= 0 && NEGATIVE_REASONS.has(b.factor))
    // popularity 分数下限 5 分权重，得分 <2.5 说明排名很靠后，"好买"这句话就不成立
    .filter((b) => !(b.factor === 'popularity' && b.score < 2.5))
    .sort((a, b) => {
      const pa = REASON_PRIORITY[a.factor] ?? 99;
      const pb = REASON_PRIORITY[b.factor] ?? 99;
      return pa !== pb ? pa - pb : b.score - a.score;
    });

  // 先决定"哪些因子入选"：必须含一条结构性理由，再按优先级补满。
  const chosen = [];
  // familyPick（你点了什么族）与 family（画像向量点积出的主调）说的常是同一件事，
  // 两条都给就是复读。有 familyPick 时丢掉 family。
  const hasPick = candidates.some((b) => b.factor === 'familyPick');
  const pool = hasPick ? candidates.filter((b) => b.factor !== 'family') : candidates;
  const bestStructural = pool.find((b) => STRUCTURAL_FACTORS.has(b.factor));
  if (bestStructural) chosen.push(bestStructural);
  for (const b of pool) {
    if (chosen.length >= MAX_REASONS) break;
    if (chosen.includes(b)) continue;
    chosen.push(b);
  }

  // 再按展示优先级排序——入选集合与输出顺序是两件事。
  chosen.sort((a, b) => {
    const pa = REASON_PRIORITY[a.factor] ?? 99;
    const pb = REASON_PRIORITY[b.factor] ?? 99;
    return pa !== pb ? pa - pb : b.score - a.score;
  });

  const out = chosen.map((b) => reasonText(b, profile)).filter(Boolean);

  if (scored.longevityWarn) out.push(`⚠️ ${scored.longevityWarn}`);
  if (!out.length) out.push('各维度都只是勉强及格，属于兜底推荐');
  return out;
}

function seasonZh(s) {
  return { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }[s] || s;
}
