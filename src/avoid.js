/**
 * src/avoid.js — 第 2 步「动态避雷屏」的候选算法
 *
 * 旧屏是固定 18 张「不想要的元素」，跟用户选的方向无关。
 * 这一版按三条硬规则现算，算不出就整屏跳过：
 *
 *   ① 所选小类自己的核心元素不问 —— 用户刚在圆盘上选了古龙水型，
 *      再问「橘子皮要不要」等于怀疑他上一步白点了；
 *   ② 与所选方向最对立香型的元素不问（OPPOSITE_FAMILY）——
 *      选了柑橘就不问厚重甜腻那一极，它本来就不太可能在这个方向里；
 *   ③ 只问模糊带：一个元素**同时高频**出现在所选香型与相邻易混香型
 *      （CONFUSABLE_FAMILY）里，用户才真的可能"以为选的是 A、闻到的却是 B"。
 *      频次按 perfumes.json 实算，两侧都达到 AVOID_MIN_SIDE 才算数，
 *      模糊分 = Σ min(本侧瓶数, 邻侧瓶数)，封顶 6 张。
 *
 * 没上屏的低频模糊元素进 softNotes，由引擎软降权（scoring.js 的
 * AVOID_SOFT_MUL），不硬排除 —— 结果池门逻辑一行不动。
 *
 * 命中口径与 app.js 的 lifeNoteHitCount 完全一致：notesAll 归一化后
 * 精确匹配（normNote + noteIndex 别名展开），不另造一套匹配。
 * 每瓶按 dominant 大类（families 权重 argmax）记账 —— 与结果池
 * strict 判定同一口径，避免"屏上按 A 算、引擎按 B 算"的分叉。
 */
import { normNote } from './notes.js';
import { AVOID_SCENARIOS, OPPOSITE_FAMILY, CONFUSABLE_FAMILY } from './avoid-map.js';

/* 模糊带两侧各自的最低瓶数。取 8：低于它的"高频"在 1388 瓶里
   连零头都算不上，问它不构成"容易踩雷"，只构成噪音。 */
export const AVOID_MIN_SIDE = 8;
/* 一屏最多问几个。再多就不是"只问最容易踩雷的几个"了。 */
export const AVOID_MAX_CARDS = 6;

/* 一条场景的全部匹配 key（含 noteIndex 别名），与 lifeNoteHitCount 同款展开。 */
function keysOfScenario(d, entries) {
  const keys = new Set();
  for (const en of d.notes) {
    const norm = normNote(en);
    keys.add(norm);
    const e = entries.find((x) => normNote(x.en) === norm || (x.aliases || []).some((a) => normNote(a) === norm));
    if (e) {
      keys.add(normNote(e.en));
      for (const a of (e.aliases || [])) keys.add(normNote(a));
    }
  }
  return keys;
}

function dominantFamily(p) {
  const fams = p.families || {};
  let best = null;
  let bestW = -1;
  for (const [f, w] of Object.entries(fams)) {
    if (w > bestW) { bestW = w; best = f; }
  }
  return best;
}

/**
 * 频次索引：scenarioId → (family → 瓶数)。
 * 只依赖数据，不依赖答案 —— 一次构建，换方向不用重算。
 */
export function buildAvoidIndex(perfumes, taxonomy) {
  const entries = taxonomy?.noteIndex?.entries || [];
  const keysOf = new Map(AVOID_SCENARIOS.map((d) => [d.id, keysOfScenario(d, entries)]));
  const counts = new Map(AVOID_SCENARIOS.map((d) => [d.id, new Map()]));
  for (const p of perfumes || []) {
    const fam = dominantFamily(p);
    if (!fam) continue;
    const bag = new Set((p.notesAll || []).map((n) => normNote(n)));
    for (const [id, keys] of keysOf) {
      for (const k of keys) {
        if (bag.has(k)) {
          const m = counts.get(id);
          m.set(fam, (m.get(fam) || 0) + 1);
          break;
        }
      }
    }
  }
  return { counts, keysOf };
}

/* 情绪入口没有圆盘落点时，用 emotionMap 里权重最高的家族当方向 ——
   与 buildProfile 的 familyVector(emotion.families) 同一来源。 */
function directionOf(answers, taxonomy) {
  if (answers?.family) return { family: answers.family, subfamily: answers.subfamily || null };
  const emo = (taxonomy?.emotionMap || []).find((e) => e.id === answers?.emotion);
  if (!emo?.families) return null;
  let best = null;
  let bestW = -1;
  for (const [f, w] of Object.entries(emo.families)) {
    if (w > bestW) { bestW = w; best = f; }
  }
  return best ? { family: best, subfamily: null } : null;
}

/**
 * 三态的归并（2026-11-23，Eddie 批准 QW10 诊断第一条）。
 *
 * 避雷卡多出第三态「没闻过」：不扣分也不加分。它**不能**写进 unwanted
 * （那是 -40 的硬惩罚），也不能被当成"接受"的证据（引擎侧没有 accepted 这一档，
 * 不点本来就是接受）。所以它单独存一列，只在归并时保证两件事：
 *   ① 同一个 id 不可能既「不要」又「没闻过」—— 「不要」优先（更强的陈述）；
 *   ② 已经不在屏上的 id（方向变了）直接丢弃，两个列表都丢，
 *      否则会带着界面上看不见的元素继续打分（pruneAvoid 的老事故）。
 * 纯函数，不读 state：写入口与测试共用同一份判据，避免两处各写一遍。
 *
 * @param {{unwanted?:string[], noSmell?:string[]}} sel 两列的短语 id
 * @param {string[]} cardIds 当前屏上真实存在的卡 id
 */
export function avoidSelection(sel, cardIds) {
  const onScreen = new Set(cardIds || []);
  const pick = (list, taken) => {
    const out = [];
    const seen = new Set();
    for (const id of list || []) {
      if (!onScreen.has(id) || seen.has(id) || taken.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  };
  const unwanted = pick(sel?.unwanted, new Set());
  /* 「不要」优先：已进 unwanted 的 id 不再进 noSmell，两列天然互斥。 */
  const noSmell = pick(sel?.noSmell, new Set(unwanted));
  return { unwanted, noSmell };
}

/**
 * 现算一屏的候选。
 * @returns {null|{key:string, cards:Array, softNotes:string[]}}
 *   null = 还没有方向（第 1 步没点完），屏先占位；
 *   cards 为空 = 算不出模糊带，整屏跳过（softNotes 此时也必为空）。
 */
export function avoidPlan(answers, index, taxonomy) {
  const dir = directionOf(answers, taxonomy);
  if (!dir) return null;
  const { family, subfamily } = dir;
  const key = `${family}|${subfamily || ''}`;

  /* 规则①：所选小类的核心元素（含别名）不上屏。 */
  const fam = (taxonomy?.families || []).find((f) => f.id === family);
  const sub = subfamily ? (fam?.subfamilies || []).find((s) => s.id === subfamily) : null;
  const coreKeys = new Set();
  const entries = taxonomy?.noteIndex?.entries || [];
  for (const en of (sub?.notes || [])) {
    for (const k of keysOfScenario({ notes: [en] }, entries)) coreKeys.add(k);
  }
  const hitsCore = (d) => {
    for (const k of index.keysOf.get(d.id)) if (coreKeys.has(k)) return true;
    return false;
  };

  /* 规则②：最对立那一极不问。 */
  const opposite = OPPOSITE_FAMILY[family];

  /* 规则③：模糊分。只累计两侧都 ≥ AVOID_MIN_SIDE 的项。 */
  const neighbors = CONFUSABLE_FAMILY[family] || [];
  const scored = [];
  for (const d of AVOID_SCENARIOS) {
    if (hitsCore(d)) continue;
    if (d.family === opposite) continue;
    const m = index.counts.get(d.id);
    const own = m.get(family) || 0;
    let fuzzy = 0;
    let total = own;
    for (const n of neighbors) {
      const side = m.get(n) || 0;
      total += side;
      if (own >= AVOID_MIN_SIDE && side >= AVOID_MIN_SIDE) fuzzy += Math.min(own, side);
    }
    if (fuzzy > 0) scored.push({ d, fuzzy, total });
  }

  /* 模糊分降序；同分按总频次，再同分保持表内原序（稳定，不随刷新换位）。 */
  scored.sort((a, b) => (b.fuzzy - a.fuzzy) || (b.total - a.total));
  const cards = scored.slice(0, AVOID_MAX_CARDS).map(({ d, fuzzy }) => ({ ...d, fuzzy }));

  /* 没上屏的模糊元素 → 引擎软降权。非模糊带的元素不碰。 */
  const shown = new Set(cards.map((c) => c.id));
  const softNotes = [];
  const seen = new Set();
  for (const { d } of scored) {
    if (shown.has(d.id)) continue;
    for (const en of d.notes) {
      const k = normNote(en);
      if (seen.has(k)) continue;
      seen.add(k);
      softNotes.push(en);
    }
  }

  return { key, cards, softNotes };
}
