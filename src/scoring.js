/**
 * scoring.js — 可解释的规则打分引擎
 *
 * 设计约束（来自已确认决策）：
 *   1. 模型不参与选品。得分完全由可复算的规则产生，任何一条理由都能反推到某个答案。
 *   2. 每条候选输出 breakdown，前端把 top-2 因子直接渲染成中文理由，不做自由生成。
 *   3. 缺失字段不猜：没有价格就不做价格筛选；没有扩散度就不编扩散度。
 */

import { tokenize, matchesNote, aliasesOf, normNote } from './notes.js';

export const SCHEMA_VERSION = '1.1.0';

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
};

/* 浓郁度 1..5 → 家族倾向。1=最清爽，5=最浓郁 */
const INTENSITY_FAMILY = {
  1: { citrus: 1.0, fresh: 1.0, floral: 0.4, woody: 0.3, gourmand: 0.05, amber: 0.05 },
  2: { citrus: 0.85, fresh: 0.9, floral: 0.6, woody: 0.5, gourmand: 0.15, amber: 0.15 },
  3: { citrus: 0.5, fresh: 0.6, floral: 1.0, woody: 0.85, gourmand: 0.4, amber: 0.4 },
  4: { citrus: 0.2, fresh: 0.25, floral: 0.6, woody: 0.9, gourmand: 0.85, amber: 0.75 },
  5: { citrus: 0.05, fresh: 0.1, floral: 0.4, woody: 0.75, gourmand: 1.0, amber: 1.0 },
};

/* 场合 → 时段（用于 timesOfDay 匹配） */
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

  return {
    family,
    subfamily,
    subfamilyNotes: new Set((subfamily?.notes || []).map((n) => String(n).toLowerCase())),
    emotion: emotion || { id: 'family-' + family.id, zh: family.zh },
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
    maxLongevityFloor: occasion?.longevityMin ?? null,
    maxSillage: occasion?.sillageMax ?? null,
  };
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
  const famScore = clamp01(famHit / 1.2) * (WEIGHTS.emotionFamily + WEIGHTS.occasionFamily);
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
  const hitsOf = (selection) => {
    const out = [];
    for (const key of selection) {
      const entry = profile.noteEntryOf?.get(key);
      if (!entry) { out.push(key); continue; } // 没有条目时退化为 key 自身
      if (noteTokens.some((toks) => matchesNote(entry, null, toks))) out.push(key);
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
    if (sScore) breakdown.push({ factor: 'season', score: sScore, season: profile.season });
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

  // 8) 持香下限约束（场合要求）
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

  const scored = perfumes.map((p) => {
    const r = scorePerfume(p, profile, taxonomy);
    return { perfume: p, ...r };
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

  // 匹配度归一化：原始分上限是各权重之和，直接display成 109.5 会让人以为是百分制。
  const maxPossible = Object.values(WEIGHTS).reduce((a, b) => a + Math.max(0, b), 0);

  return {
    profile: {
      emotionZh: profile.emotion.zh,
      occasionZh: profile.occasion?.zh ?? null,
      familyZh: profile.family?.zh ?? null,
      subfamilyZh: profile.subfamily?.zh ?? null,
      intensity: profile.intensity,
    },
    results: picked.map((s) => ({
      ...s,
      matchPct: Math.round(clamp01(s.score / maxPossible) * 100),
      reasons: buildReasons(s, profile, taxonomy),
    })),
  };
}

/* ---------- 理由生成：只做模板拼装，不调模型 ---------- */

// 展示顺序：用户明确点名的排最前（"我说过的话被听见了"），结构性匹配其次，泛化描述垫底。
const REASON_PRIORITY = {
  familyPick: 0,       // 第 1 步香型轮盘点的家族——比什么都明确
  subfamilyHits: 1,    // 第 2 步子家族香材命中
  likedNotes: 2,
  emotionNotes: 3,
  family: 4,
  intensity: 5,
  season: 6,
  timeOfDay: 7,
  popularity: 8,
};
// 结构性因子合计权重 52（家族 30+22、浓度 18），是打分的骨架，不能让个性化理由把它们挤出去。
const STRUCTURAL_FACTORS = new Set(['family', 'familyPick', 'intensity']);
const MAX_REASONS = 3;

function reasonText(b, profile) {
  switch (b.factor) {
    case 'family':
      // 三条理由如果都用「X，正是「Y」这一类」的句式，读起来就是同一个模板填词。
      // 这里让 family 用「主调 + 占比」的事实句，跟下面两条在句型上岔开。
      // occasion 在香型轮盘入口下可能为 null，不能拼进句子。
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
      return `它在${seasonZh(b.season)}季香里被标注过，当季喷不容易出错`;
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
    default:
      return null;
  }
}

export function buildReasons(scored, profile, taxonomy) {
  const candidates = [...scored.breakdown]
    .filter((b) => b.score > 0)
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
