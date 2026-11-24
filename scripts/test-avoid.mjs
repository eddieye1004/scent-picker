/**
 * test-avoid.mjs — 动态避雷屏的三条硬规则 + 软降权 + 映射表交付物
 *
 * 纯函数测试，不碰 DOM：直接调 src/avoid.js / src/scoring.js，
 * 用真实 data/perfumes.json + data/taxonomy.json 复算。
 *
 * 任务验收要求：用三个不同方向各生成一次清单，证明
 *   ① 同向（所选小类核心元素）不出现；
 *   ② 反向（最对立香型）不出现；
 *   ③ 模糊项出现（且封顶 6 张）。
 * 另验：没上屏的模糊元素走软降权（0.94）而非硬排除、结果池门不动、
 *      算不出时返回空清单（整屏跳过）、映射表与源一致。
 *
 * 用法：node scripts/test-avoid.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAvoidIndex, avoidPlan, avoidSelection, AVOID_MIN_SIDE, AVOID_MAX_CARDS } from '../src/avoid.js';
import { AVOID_SCENARIOS, OPPOSITE_FAMILY, CONFUSABLE_FAMILY } from '../src/avoid-map.js';
import { recommend, AVOID_SOFT_MUL } from '../src/scoring.js';
import { normNote, aliasesOf } from '../src/notes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));
const perfs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8')).perfumes;

let pass = 0;
const fails = [];
const ok = (cond, label) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fails.push(label); console.log('  ✗ ' + label); }
};

/* 把一组 en 名展开成匹配 key 集（normNote + noteIndex 别名），
   与 src/avoid.js 的口径一致，用来独立复核"核心元素不相交"。 */
const entries = tax.noteIndex.entries;
function keySet(notes) {
  const keys = new Set();
  for (const en of notes) {
    const norm = normNote(en);
    keys.add(norm);
    const e = entries.find((x) => normNote(x.en) === norm || (x.aliases || []).some((a) => normNote(a) === norm));
    if (e) { keys.add(normNote(e.en)); for (const a of aliasesOf(e)) keys.add(a); }
  }
  return keys;
}
const intersects = (a, b) => { for (const k of a) if (b.has(k)) return true; return false; };

const index = buildAvoidIndex(perfs, tax);

console.log('===== 动态避雷屏：三条硬规则（三个方向）=====');

/* 三个不同方向：柑橘/古龙水型、木质/木质、花香/玫瑰。
   每个都覆盖"本类核心 + 对立极 + 模糊带"三件事。 */
const DIRECTIONS = [
  { family: 'citrus', subfamily: 'cologne' },
  { family: 'woody', subfamily: 'woody' },
  { family: 'floral', subfamily: 'rose' },
];

for (const dir of DIRECTIONS) {
  const fam = tax.families.find((f) => f.id === dir.family);
  const sub = fam.subfamilies.find((s) => s.id === dir.subfamily);
  const plan = avoidPlan({ family: dir.family, subfamily: dir.subfamily }, index, tax);
  const tag = `${fam.zh}·${sub.zh}`;

  ok(plan && Array.isArray(plan.cards), `${tag}：算得出清单`);
  const cards = plan.cards;

  /* ① 同向不出现：任何一张卡的元素都不与所选小类核心元素相交。 */
  const coreKeys = keySet(sub.notes || []);
  const ownCoreLeak = cards.filter((c) => intersects(keySet(c.notes), coreKeys));
  ok(ownCoreLeak.length === 0, `${tag}：规则① 本类核心元素不上屏${ownCoreLeak.length ? '（泄漏 ' + ownCoreLeak.map((c) => c.id).join(',') + '）' : ''}`);

  /* ② 反向不出现：没有一张卡属于最对立香型。 */
  const opposite = OPPOSITE_FAMILY[dir.family];
  const oppLeak = cards.filter((c) => c.family === opposite);
  ok(oppLeak.length === 0, `${tag}：规则② 最对立香型（${opposite}）不上屏${oppLeak.length ? '（泄漏 ' + oppLeak.map((c) => c.id).join(',') + '）' : ''}`);

  /* ③ 模糊项出现：至少一张卡，且每张卡模糊分 > 0、两侧都达阈值。 */
  ok(cards.length > 0, `${tag}：规则③ 模糊带非空（${cards.length} 张）`);
  ok(cards.every((c) => c.fuzzy > 0), `${tag}：每张卡都是模糊项（fuzzy>0）`);
  ok(cards.length <= AVOID_MAX_CARDS, `${tag}：封顶 ${AVOID_MAX_CARDS} 张（实际 ${cards.length}）`);

  /* 模糊分定义复核：fuzzy = Σ min(本侧, 邻侧)，只计两侧都 ≥ 阈值的项。 */
  const neighbors = CONFUSABLE_FAMILY[dir.family];
  const fuzzyRecomputed = cards.every((c) => {
    const m = index.counts.get(c.id);
    const own = m.get(dir.family) || 0;
    let f = 0;
    for (const n of neighbors) {
      const side = m.get(n) || 0;
      if (own >= AVOID_MIN_SIDE && side >= AVOID_MIN_SIDE) f += Math.min(own, side);
    }
    return f === c.fuzzy;
  });
  ok(fuzzyRecomputed, `${tag}：模糊分 = Σ min(本侧,邻侧) 且两侧 ≥ ${AVOID_MIN_SIDE}`);

  /* 软降权名单与上屏卡互斥：上屏的点卡走硬惩罚，没上屏的才软降权。 */
  const shownNotes = new Set();
  for (const c of cards) for (const en of c.notes) shownNotes.add(normNote(en));
  const softOverlap = plan.softNotes.filter((en) => shownNotes.has(normNote(en)));
  ok(softOverlap.length === 0, `${tag}：软降权名单与上屏卡不相交`);
}

console.log('\n===== 算不出 → 空清单（整屏跳过）=====');
{
  /* 全零索引：任何方向都算不出模糊带 → cards 为空、softNotes 也为空。
     这对应 curSteps() 把 unwanted 整屏抽掉的那条路。 */
  const zeroCounts = new Map(AVOID_SCENARIOS.map((d) => [d.id, new Map()]));
  const zeroKeys = new Map(AVOID_SCENARIOS.map((d) => [d.id, keySet(d.notes)]));
  const zeroIndex = { counts: zeroCounts, keysOf: zeroKeys };
  const p = avoidPlan({ family: 'citrus', subfamily: 'cologne' }, zeroIndex, tax);
  ok(p && p.cards.length === 0, '全零频次 → cards 为空（整屏跳过）');
  ok(p && p.softNotes.length === 0, '全零频次 → softNotes 也为空');
  /* 没有方向 → null（屏先占位，不跳）。 */
  ok(avoidPlan({}, index, tax) === null, '无方向 → 返回 null（占位，不跳）');
}

console.log('\n===== 引擎软降权：0.94、不硬排除、结果池门不动 =====');
{
  const dir = { family: 'citrus', subfamily: 'cologne' };
  const plan = avoidPlan(dir, index, tax);
  const soft = plan.softNotes;
  ok(soft.length > 0, `柑橘·古龙水型有软降权名单（${soft.length} 味）`);

  const N = perfs.length;
  const base = recommend(dir, perfs, tax, { topN: N });
  const softened = recommend(dir, perfs, tax, { topN: N, avoidSoftNotes: soft });

  /* 不硬排除：两次返回的瓶子集合完全一致（软降权只改排序，不删瓶）。 */
  const baseIds = new Set(base.results.map((r) => r.perfume.id));
  const softIds = new Set(softened.results.map((r) => r.perfume.id));
  const sameSet = baseIds.size === softIds.size && [...baseIds].every((id) => softIds.has(id));
  ok(sameSet, `软降权不硬排除：瓶子集合不变（${baseIds.size} 瓶）`);

  const baseScore = new Map(base.results.map((r) => [r.perfume.id, r.score]));
  const hitRows = softened.results.filter((r) => r.avoidSoftMul != null);
  ok(hitRows.length > 0, `确有瓶子被软降权（${hitRows.length} 瓶）`);
  ok(hitRows.every((r) => r.avoidSoftMul === AVOID_SOFT_MUL), `软降权系数恒为 ${AVOID_SOFT_MUL}`);
  const mulCorrect = hitRows.every((r) => {
    const b = baseScore.get(r.perfume.id);
    return b > 0 && Math.abs(r.score - b * AVOID_SOFT_MUL) < 1e-6;
  });
  ok(mulCorrect, '被软降权的瓶：新分 = 原正分 × 0.94（逐瓶复算）');

  /* 结果池门不动：第 1 位仍是 strict 主导族（柑橘），不因软降权跑偏。 */
  const top1 = softened.results[0];
  const fams = top1.perfume.families || {};
  const dominant = Object.entries(fams).sort((a, b) => b[1] - a[1])[0][0];
  ok(dominant === dir.family, `第 1 位仍 strict 主导所选族（${dominant}）`);

  /* 不传名单时逐位回到旧行为：没有 avoidSoftMul 字段、分数与 base 一致。 */
  const plain = recommend(dir, perfs, tax, { topN: 3 });
  ok(plain.results.every((r) => r.avoidSoftMul == null), '不传名单 → 无软降权字段（旧行为）');
  ok(plain.results[0].score === base.results[0].score, '不传名单 → 第 1 位分数与 base 一致');
}

console.log('\n===== 第三态「没闻过」：不进打分（2026-11-23）=====');
{
  /* 验收要求：构造一条含「没闻过」元素的路径，断言得分与该元素不存在时一致。
     这条断言必须配一个对照组，否则它是空转的 ——
     引擎不认识 noSmell 这个键，天然不加不减，光断言"相等"什么也证明不了。
     所以先证明同一元素点成「不要」时分数**真的**会变（-40），
     再证明标成「没闻过」时逐瓶分数与"这个元素根本不存在"完全一致。 */
  const dir = { family: 'citrus', subfamily: 'cologne' };
  const plan = avoidPlan(dir, index, tax);
  const card = plan.cards[0];
  ok(!!card, `对照组备料：取到一张卡（${card && card.id}）`);

  const N = perfs.length;
  const key = (r) => new Map(r.results.map((x) => [x.perfume.id, x.score]));

  const base = recommend({ ...dir }, perfs, tax, { topN: N });
  const asDislike = recommend({ ...dir, dislikedNotes: card.notes }, perfs, tax, { topN: N });
  const asNoSmell = recommend({ ...dir, noSmell: [card.id] }, perfs, tax, { topN: N });

  /* 对照：点成「不要」时，含该元素的瓶分数确实被压低（证明这条通路有牙）。 */
  const bm = key(base);
  const dm = key(asDislike);
  const moved = [...bm].filter(([id, s]) => Math.abs(dm.get(id) - s) > 1e-9).length;
  ok(moved > 0, `对照：同一元素点成「不要」后有 ${moved} 瓶分数变化（通路有牙）`);

  /* 实验：标成「没闻过」时，逐瓶分数与"这个元素不存在"完全相等。 */
  const nm = key(asNoSmell);
  const sameScore = [...bm].every(([id, s]) => Math.abs(nm.get(id) - s) < 1e-9);
  ok(sameScore, '「没闻过」的路径：逐瓶得分与「该元素不存在」完全一致');

  /* 瓶子集合与顺序也不许变 —— 只比分数会漏掉"排序被动过但分数相同"的情况。 */
  const order = (r) => r.results.map((x) => x.perfume.id).join(',');
  ok(order(base) === order(asNoSmell), '「没闻过」不改排序（瓶子集合与顺序一致）');
  ok(order(base) !== order(asDislike), '对照：点成「不要」确实改了排序');

  /* 归并层的不变式：两列互斥（不要优先）、屏外的 id 一律丢弃、顺序保持。 */
  const ids = plan.cards.map((c) => c.id);
  const s1 = avoidSelection(
    { unwanted: [ids[1], 'gone-phrase', ids[0], ids[1]], noSmell: [ids[1], ids[2], 'gone-phrase'] },
    ids,
  );
  ok(s1.unwanted.join(',') === [ids[1], ids[0]].join(','),
    `归并：unwanted 去重、保序、丢弃屏外 id（${s1.unwanted.join(',')}）`);
  ok(s1.noSmell.join(',') === ids[2],
    `归并：与 unwanted 冲突的 id 让位给「不要」（noSmell=${s1.noSmell.join(',')}）`);
  const both = new Set([...s1.unwanted, ...s1.noSmell]);
  ok(both.size === s1.unwanted.length + s1.noSmell.length, '归并：两列没有交集（互斥）');
  const s2 = avoidSelection({ unwanted: [], noSmell: [] }, ids);
  ok(s2.unwanted.length === 0 && s2.noSmell.length === 0, '归并：空输入给空输出');
  ok(avoidSelection(undefined, ids).unwanted.length === 0, '归并：undefined 也不炸（旧存档）');
}

console.log('\n===== 映射表交付物：元素→场景句→所属香型 =====');
{
  const mapPath = path.join(ROOT, 'data/avoid-scenarios.json');
  ok(fs.existsSync(mapPath), 'data/avoid-scenarios.json 存在');
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  ok(map.scenarios.length === AVOID_SCENARIOS.length, `场景数与源一致（${map.scenarios.length}）`);
  /* 每个元素都能反查到一句场景与一个所属香型，且与源逐字一致。 */
  const byId = new Map(AVOID_SCENARIOS.map((d) => [d.id, d]));
  const rowsOk = map.elements.every((row) => {
    const d = byId.get(row.scenarioId);
    return d && row.scenario === d.zh && row.family === d.family && d.notes.includes(row.note);
  });
  ok(rowsOk, '每条「元素→场景句→所属香型」都能反查到源且逐字一致');
  const noteCount = AVOID_SCENARIOS.reduce((n, d) => n + d.notes.length, 0);
  ok(map.elements.length === noteCount, `元素行数 = 源香材总数（${noteCount}）`);
  /* 场景句不许是成分名：zh 里不含任何 en 香材名（术语不上屏）。 */
  const noTerm = AVOID_SCENARIOS.every((d) => d.notes.every((en) => !d.zh.toLowerCase().includes(en.toLowerCase())));
  ok(noTerm, '场景句均为生活场景，不含成分名');
}

console.log(`\nPASS ${pass}  FAIL ${fails.length}`);
if (fails.length) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exitCode = 1; }
