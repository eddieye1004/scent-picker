/**
 * scoring.js — 可解释的规则打分引擎
 *
 * 设计约束（来自已确认决策）：
 *   1. 模型不参与选品。得分完全由可复算的规则产生，任何一条理由都能反推到某个答案。
 *   2. 每条候选输出 breakdown，前端把 top-2 因子直接渲染成中文理由，不做自由生成。
 *   3. 缺失字段不猜：没有价格就不做价格筛选；没有扩散度就不编扩散度。
 */

export const SCHEMA_VERSION = '1.0.0';

/* ---------- 权重配置（集中于此，便于调参与写测试） ---------- */
export const WEIGHTS = {
  emotionFamily: 30,   // 情绪 → 家族吻合
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
  const emotion = taxonomy.emotionMap.find((e) => e.id === answers.emotion);
  const occasion = taxonomy.occasionMap.find((o) => o.id === answers.occasion);
  if (!emotion) throw new Error(`未知 emotion: ${answers.emotion}`);
  if (!occasion) throw new Error(`未知 occasion: ${answers.occasion}`);

  const intensity = Number(answers.intensity) || 3;
  const emoVec = familyVector(emotion.families);
  const occVec = familyVector(occasion.families);
  const intVec = familyVector(INTENSITY_FAMILY[intensity]);

  // 三者按权重合成总分向量
  const totalVec = dotLerp(dotLerp(emoVec, occVec, 0.6, 0.4), intVec, 0.7, 0.3);

  // 情绪代表香调（taxonomy 里每种情绪给了 5 个锚点香调）。
  // 这层是为了解决"家族太粗"：Aventus 被源站标成 floral 为主的 Orchard Fruit，
  // 但"清冷"要的是鸢尾/紫罗兰/柏树那种冷感，两者在家族层面区分不出来。
  const emoNotes = new Set((emotion.notes || []).map((n) => String(n).toLowerCase()));

  return {
    emotion,
    occasion,
    intensity,
    families: totalVec,
    emotionNotes: emoNotes,
    emotionNotesZh: emotion.notesZh || null,
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
    maxLongevityFloor: occasion.longevityMin ?? null,
    maxSillage: occasion.sillageMax ?? null,
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

  // 香调集合：后面几步都要用，提到前面统一构造
  const pNotes = (p.notesAll || []).map((n) => String(n).toLowerCase());
  const noteSet = new Set(pNotes);

  // 2) 情绪锚点香调命中（比家族更锐）
  const emoHits = [...profile.emotionNotes].filter((n) =>
    [...noteSet].some((pn) => pn.includes(n) || n.includes(pn))
  );
  if (emoHits.length) {
    const eScore = clamp01(emoHits.length / 2) * WEIGHTS.emotionNotes;
    score += eScore;
    breakdown.push({
      factor: 'emotionNotes',
      score: eScore,
      hits: emoHits.map((n) => profile.emotionNotesZh?.[n] || n),
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
  const likedHits = [...profile.likedNotes].filter((n) =>
    [...noteSet].some((pn) => pn.includes(n) || n.includes(pn))
  );
  if (likedHits.length) {
    const nScore = clamp01(likedHits.length / 2) * WEIGHTS.likedNotes;
    score += nScore;
    // 理由里回显用户看到的写法（佛手柑 而非 bergamot）
    const hitsDisplay = likedHits.map((n) => profile.likedDisplay?.get(n) || n);
    breakdown.push({ factor: 'likedNotes', score: nScore, hits: hitsDisplay });
  }

  // 6) 讨厌的香调命中（强惩罚，且必须能解释为什么排除了它）
  const dislikedHits = [...profile.dislikedNotes].filter((n) =>
    [...noteSet].some((pn) => pn.includes(n) || n.includes(pn))
  );
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

  // 多样性：同一源家族、同一品牌都不许占满前三。
  // 只按家族去重不够——Byredo 有 9 瓶分散在 4 个家族，仍会霸占三席，
  // 对一个"还没入门、想对比着闻"的用户来说，三瓶同品牌等于没给选择。
  const picked = [];
  const seenFamily = new Set();
  const seenBrand = new Set();
  for (const s of scored) {
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
    for (const s of scored) {
      if (picked.length >= topN) break;
      if (picked.includes(s)) continue;
      if (brandsNow.has(s.perfume.brand)) continue;
      brandsNow.add(s.perfume.brand);
      picked.push(s);
    }
  }
  // 最后一轮：样本太小时彻底放宽，保证一定凑够 topN
  for (const s of scored) {
    if (picked.length >= topN) break;
    if (!picked.includes(s)) picked.push(s);
  }

  // 匹配度归一化：原始分上限是各权重之和，直接display成 109.5 会让人以为是百分制。
  const maxPossible = Object.values(WEIGHTS).reduce((a, b) => a + Math.max(0, b), 0);

  return {
    profile: {
      emotionZh: profile.emotion.zh,
      occasionZh: profile.occasion.zh,
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
export function buildReasons(scored, profile, taxonomy) {
  // 优先级：用户明确点名的 > 结构性匹配 > 泛化描述
  // 理由：用户最想看到的是"我说过的那句话被听见了"，命中香调必须排进前二。
  const PRIORITY = { likedNotes: 1, emotionNotes: 2, family: 3, intensity: 4, season: 5, timeOfDay: 6, popularity: 7 };

  const sorted = [...scored.breakdown]
    .filter((b) => b.score > 0)
    .sort((a, b) => {
      const pa = PRIORITY[a.factor] ?? 99;
      const pb = PRIORITY[b.factor] ?? 99;
      return pa !== pb ? pa - pb : b.score - a.score;
    });

  const out = [];
  for (const b of sorted) {
    if (out.length >= 2) break;
    switch (b.factor) {
      case 'family':
        out.push(`你选了「${profile.emotion.zh}」+「${profile.occasion.zh}」，这瓶的主体是${b.familyZh}`);
        break;
      case 'intensity':
        out.push(`浓郁度 ${profile.intensity}/5 的偏好下，它的厚重感 ${b.heaviness} 落在这个区间`);
        break;
      case 'season':
        out.push(`它在${seasonZh(b.season)}季香里被标注过，当季喷不容易出错`);
        break;
      case 'timeOfDay':
        out.push(`适合${b.time === 'day' ? '白天' : '夜晚'}使用，和你的场合一致`);
        break;
      case 'likedNotes':
        out.push(`含你点名的 ${b.hits.slice(0, 2).join('、')}`);
        break;
      case 'emotionNotes':
        out.push(`里面有${b.hits.slice(0, 2).join('、')}，正是「${profile.emotion.zh}」这一类气味的主力`);
        break;
      case 'popularity':
        out.push(`知名度排名 ${b.rank}，属于相对好买、好试的一类`);
        break;
      default:
        break;
    }
  }

  if (scored.longevityWarn) out.push(`⚠️ ${scored.longevityWarn}`);
  if (!out.length) out.push('各维度都只是勉强及格，属于兜底推荐');
  return out;
}

function seasonZh(s) {
  return { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }[s] || s;
}
