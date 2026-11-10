/**
 * probe-dominance.mjs — 第 5 步实验：放宽 recommend() 的 isDominant 硬过滤
 *
 * 背景（第 1–4 步实测）：`recommend()` 的 L1 池用 `isDominant` 硬过滤，
 * 判据是「该瓶 families 里权重最高的那一族，等不等于用户在第 1 步选的族」。
 * 实测（docs/EXPERIMENT-FAMILY-CAP.md §2.4）**27/59 个金标准瓶（46%）被挡在池外**，
 * 它们即使家族项拿满分也进不了候选池 —— 第 2–4 步的权重调整对这 27 瓶全部无效。
 * 这是四步里唯一没动过的最大杠杆。
 *
 * 三档（判据精确，见 src/scoring.js 的 opts.dominanceMode 注释）：
 *   T0 'strict'  现行行为（默认，不传即此）
 *   T1 'relaxed' 强次族也入池：w >= 0.5 且 w >= 0.5 * maxWeight
 *   T2 'any'     该族出现即入池（上界探针，预期淹没）
 *
 * ==== 口径（2026-11-10 修正，监督者已批准）====
 * 本探针的第一版把 topN 设成 120 去拿"完整排名"，结果 citrus 的 L1 池只有 117 瓶，
 * `L1.length >= topN` 为假 → recommend() **静默降级到 L2**（混入非主族瓶），
 * 于是 strict 基线被算成 1/12 而不是 2/12。这正是
 * docs/reviews/QUESTIONNAIRE-LINE-REVIEW-20261110.md §7 警告过的坑。
 *
 * 现在两件事严格分开，不再用同一个调用：
 *   ① 命中率（MAJORITY / STRICT）—— **固定 topN=5**，与 test-gold 完全同口径。
 *   ② 排名与池子大小 —— 用该族在该档下的池大小作为 topN（相等即 `>=` 成立，
 *      仍走 L1 路径），只用于回答"新进池的 gold 排到第几"。
 * 开跑前先过闸门：T0 必须复现 MAJORITY 2/12 · STRICT 4/12，否则直接停。
 *
 * 用法:
 *   node scripts/probe-dominance.mjs            # 闸门 + 三档全跑
 *   node scripts/probe-dominance.mjs relaxed    # 只跑指定档（闸门仍会先跑）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recommend, entersFamilyPool } from '../src/scoring.js';
import { PORTRAITS } from './lib/gold-portraits.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8'));
const TAX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
const perfumes = DATA.perfumes;
const byId = new Map(perfumes.map((p) => [p.id, p]));

const argv = process.argv.slice(2).find((a) => /^(strict|relaxed|any)$/.test(a));
const TIERS = argv ? [argv] : ['strict', 'relaxed', 'any'];
const N = PORTRAITS.length;

/* 命中率的唯一口径：与 scripts/test-gold.mjs 逐字相同（topN=5）。 */
const HIT_TOPN = 5;
/* 生产基线（docs/GOLD-STANDARD-FINAL.md / test-gold.mjs 的 FLOOR_*）。 */
const BASE_MAJ = 2;
const BASE_STR = 4;

for (const port of PORTRAITS) {
  for (const id of port.gold) {
    if (!byId.has(id)) throw new Error(`${port.id} 的金标准 id 不在香水库里: ${id}`);
  }
}

/* ---------- 入池判据 ----------
   直接复用 src/scoring.js 的 entersFamilyPool —— **不在这里另写一份**。
   第 5 步第一版探针自己写了一份判据、又用了错误的 topN 口径，
   结果 strict 基线被算成 1/12；两份实现是这类漂移的温床，
   抽成单一导出函数后，探针与引擎不可能对不上。 */
const enters = (p, fam, tier) => entersFamilyPool(p, fam, tier);

/* 该族的族池大小（按档）。同一族的画像共用同一个数。 */
function poolSizeOf(fam, tier) {
  return perfumes.filter((p) => enters(p, fam, tier)).length;
}

/* ---------- ① 命中率：固定 topN=5 ---------- */
function hitRates(tier) {
  const rows = PORTRAITS.map((port) => {
    const r = recommend(port.answers, perfumes, TAX, { topN: HIT_TOPN, dominanceMode: tier });
    const top = r.results.map((x) => x.perfume.id);
    const hits3 = top.slice(0, 3).filter((id) => port.gold.includes(id)).length;
    return {
      id: port.id, top,
      hits3,
      top1Hit: port.gold.includes(top[0]),
      maj: hits3 >= 2,
    };
  });
  return {
    tier, rows,
    maj: rows.filter((x) => x.maj).length,
    strict: rows.filter((x) => x.top1Hit).length,
  };
}

console.log('');
console.log(`金标准 ${N} 画像 · 香水库 ${perfumes.length} 瓶 · 命中率口径 topN=${HIT_TOPN}（与 test-gold 同口径）`);

/* ---------- 闸门：T0 必须复现生产基线 ---------- */
console.log('');
console.log('===== 闸门：T0 strict 必须复现生产基线 =====');
const base = hitRates('strict');
console.log(`  T0 strict 实测: MAJORITY ${base.maj}/${N} · STRICT ${base.strict}/${N}`);
console.log(`  生产基线:       MAJORITY ${BASE_MAJ}/${N} · STRICT ${BASE_STR}/${N}`);
if (base.maj !== BASE_MAJ || base.strict !== BASE_STR) {
  console.log('');
  console.log(`  ✗ 闸门未过：T0 与生产基线不符 —— 探针口径有问题，**不做任何档位对比**。`);
  console.log('    可能原因：命中率用了非 topN=5 的口径（会让 L1.length >= topN 失败并静默降级到 L2）；');
  console.log('    或香水库/金标准被改过。');
  process.exit(1);
}
console.log('  ✓ 闸门通过 —— 后续档位对比有效');

/* ---------- 三档命中率 ---------- */
const results = TIERS.includes('strict') ? [base] : [base, hitRates(argv)];
for (const t of TIERS) {
  if (!results.some((r) => r.tier === t)) results.push(hitRates(t));
}
const fmt = (d) => (d > 0 ? `+${d}` : d === 0 ? '±0' : `${d}`);

console.log('');
console.log('===== 命中率（topN=5）=====');
console.log('档位            MAJORITY   STRICT     ΔMAJ   ΔSTR   top3 换手');
console.log('-'.repeat(76));
const labelOf = (t) => (t === 'strict' ? 'T0 strict ' : t === 'relaxed' ? 'T1 relaxed' : 'T2 any    ');
for (const r of results) {
  const churn = r.rows.filter((x, k) => x.top.slice(0, 3).join('|') !== base.rows[k].top.slice(0, 3).join('|')).length;
  console.log(
    `${labelOf(r.tier).padEnd(16)}${String(`${r.maj}/${N}`).padEnd(10)} ${String(`${r.strict}/${N}`).padEnd(9)} `
    + `${fmt(r.maj - base.maj).padEnd(6)} ${fmt(r.strict - base.strict).padEnd(6)} ${churn}/${N}`,
  );
}
console.log('-'.repeat(76));

/* ---------- ② 池子大小（按族，与命中率解耦）---------- */
console.log('');
console.log('===== 池子大小（按族；strict → relaxed → any）=====');
const fams = [...new Set(PORTRAITS.map((p) => p.answers.family))];
console.log('族       strict   relaxed   any     relaxed 增幅   any 增幅');
for (const f of fams) {
  const a = poolSizeOf(f, 'strict');
  const b = poolSizeOf(f, 'relaxed');
  const c = poolSizeOf(f, 'any');
  const pct = (x, y) => `${(((y - x) / x) * 100).toFixed(0)}%`;
  console.log(`${f.padEnd(9)}${String(a).padEnd(9)}${String(b).padEnd(10)}${String(c).padEnd(8)}`
    + `${pct(a, b).padEnd(16)}${pct(a, c)}`);
}

/* ---------- ③ 27 瓶被挡 gold 的去向 ---------- */
console.log('');
const blockedAll = [];
for (const port of PORTRAITS) {
  const fam = port.answers.family;
  for (const id of port.gold) {
    const p = byId.get(id);
    if (!enters(p, fam, 'strict')) blockedAll.push({ pid: port.id, fam, id, p });
  }
}
console.log(`===== 被 strict 挡在池外的 gold：${blockedAll.length} 瓶 =====`);
for (const r of results) {
  if (r.tier === 'strict') continue;
  const inNow = blockedAll.filter((b) => enters(b.p, b.fam, r.tier));
  console.log(`  ${r.tier}: ${inNow.length}/${blockedAll.length} 瓶进池`
    + `（${inNow.map((b) => `${b.pid}:${b.id}`).join(', ') || '无'}）`);
}

/* ---------- ④ 新进池 gold 的最好排名 ----------
   排名测量用该族在该档下的池大小作 topN —— 相等即 `L1.length >= topN` 成立，
   仍走 L1 路径；这是唯一能"看见整族排名"且不触发降级的取值。 */
console.log('');
console.log('===== 新进池 gold 的排名（topN = 该族池大小，走 L1 路径）=====');
for (const r of results) {
  if (r.tier === 'strict') continue;
  const lines = [];
  for (const port of PORTRAITS) {
    const fam = port.answers.family;
    const fresh = blockedAll.filter((b) => b.pid === port.id && enters(b.p, fam, r.tier));
    if (!fresh.length) continue;
    const poolN = poolSizeOf(fam, r.tier);
    const ranked = recommend(port.answers, perfumes, TAX, { topN: poolN, dominanceMode: r.tier }).results
      .map((x) => x.perfume.id);
    const best = fresh
      .map((b) => ({ id: b.id, rank: ranked.indexOf(b.id) }))
      .filter((x) => x.rank >= 0)
      .sort((a, b2) => a.rank - b2.rank)[0];
    lines.push(`    ${port.id}: ${fresh.length} 瓶进池，最好排第 ${best ? best.rank + 1 : '?'} 名`
      + `${best ? `（${best.id}）` : ''} / 池 ${poolN} 瓶`);
  }
  console.log(`  ${r.tier}:`);
  console.log(lines.length ? lines.join('\n') : '    （没有新进池的 gold）');
}

/* ---------- ④' 决定性对照：全库排序下这些 gold 排第几 ----------
   这一步回答的是本实验的核心问题 ——「挡路的是过滤器，还是分数？」
   做法：传 topN = perfumes.length，使 `L1.length >= topN` 为假、`L2.length >= topN`
   也为假，recommend() 落到 L3（`ranked = scored`，全部 1388 瓶参与排序）。
   这是刻意使用降级路径，不是口径错误：我们要的正是"没有任何族过滤时它排第几"。

   判读：
     · 若这些瓶在全库排序下仍排 100 名开外 → 过滤器不是约束，**分数**才是；
       放宽过滤只会把一堆低分瓶放进池子，挤掉原本的第一名（T1/T2 的 MAJ −1 即此）。
     · 若有些瓶全库排序进得了 top3 → 那才是"被过滤器压住"的真候选，
       值得为它单独设计准入而不是整体放宽。 */
console.log('');
console.log('===== 决定性对照：无族过滤（L3 全库 1388 瓶）时，被挡 gold 排第几 =====');
{
  const perPortrait = new Map();
  for (const port of PORTRAITS) {
    const fam = port.answers.family;
    const mine = blockedAll.filter((b) => b.pid === port.id && b.fam === fam);
    if (!mine.length) continue;
    /* topN = 全库大小 → 必然降级到 L3（scored 全量排序），与档位无关。 */
    const ranked = recommend(port.answers, perfumes, TAX, { topN: perfumes.length }).results
      .map((x) => x.perfume.id);
    perPortrait.set(port.id, mine.map((b) => ({ id: b.id, rank: ranked.indexOf(b.id) })));
  }
  let bestOverall = { rank: Infinity, id: null, pid: null };
  let inTop3 = 0;
  let inTop20 = 0;
  let total = 0;
  for (const [pid, arr] of perPortrait) {
    const shown = arr
      .sort((a, b) => a.rank - b.rank)
      .map((x) => `${x.id}:第${x.rank + 1}名`);
    console.log(`  ${pid}: ${shown.join('  ')}`);
    for (const x of arr) {
      total++;
      if (x.rank >= 0 && x.rank < 3) inTop3++;
      if (x.rank >= 0 && x.rank < 20) inTop20++;
      if (x.rank >= 0 && x.rank < bestOverall.rank) bestOverall = { rank: x.rank, id: x.id, pid };
    }
  }
  console.log('');
  console.log(`  合计 ${total} 瓶：全库排序进 top3 的 ${inTop3} 瓶、进 top20 的 ${inTop20} 瓶`);
  console.log(`  最好的一瓶：${bestOverall.pid} 的 ${bestOverall.id}，全库第 ${bestOverall.rank + 1} 名`);
  console.log('  → 判读：若进 top3 的是 0 瓶，则"46% 被挡"是个真事实但不是杠杆 ——'
    + ' 这些瓶即使无过滤参与排序也进不了前三，问题在分数不在过滤器。');
}

/* ---------- 逐画像变化 ---------- */
console.log('');
console.log('===== 逐画像变化（只列与 T0 不同的）=====');
let any = false;
for (const r of results) {
  if (r.tier === 'strict') continue;
  const diffs = r.rows
    .map((x, k) => ({ id: x.id, a: base.rows[k].hits3, b: x.hits3, a1: base.rows[k].top1Hit, b1: x.top1Hit }))
    .filter((d) => d.a !== d.b || d.a1 !== d.b1)
    .map((d) => {
      const hit = d.a === d.b ? '' : `top3 ${d.a}→${d.b}`;
      const t1 = d.a1 === d.b1 ? '' : `top1 ${d.a1 ? '✓' : '·'}→${d.b1 ? '✓' : '·'}`;
      return `${d.id}(${[hit, t1].filter(Boolean).join(', ')})`;
    });
  if (!diffs.length) continue;
  any = true;
  console.log(`  ${r.tier}: ${diffs.join('  ')}`);
}
if (!any) console.log('  （各档与 T0 逐画像一致）');

/* ---------- 翻转裕度 ---------- */
console.log('');
console.log('===== 翻转裕度（新翻上 top1 的 gold 领先第二名多少分；<1 分视为抖动）=====');
for (const r of results) {
  if (r.tier === 'strict') continue;
  const fresh = r.rows.filter((x, k) => x.top1Hit && !base.rows[k].top1Hit);
  if (!fresh.length) { console.log(`  ${r.tier}: 没有新翻上 top1 的画像`); continue; }
  for (const x of fresh) {
    const port = PORTRAITS.find((p) => p.id === x.id);
    const res = recommend(port.answers, perfumes, TAX, { topN: HIT_TOPN, dominanceMode: r.tier }).results;
    const first = res[0];
    const second = res.find((s) => s.perfume.id !== first.perfume.id);
    const margin = second ? first.score - second.score : NaN;
    console.log(`  ${r.tier} ${x.id}: top1=${first.perfume.id} 领先 ${margin.toFixed(2)} 分`
      + ` → ${margin < 1 ? '抖动级' : '非抖动级'}`);
  }
}
/* 反向：T0 原有 top1 命中但该档丢失的画像 —— "另一个不能掉"的判据要用它。 */
console.log('');
console.log('===== 丢失项（T0 top1 命中、该档不再命中）=====');
for (const r of results) {
  if (r.tier === 'strict') continue;
  const lost = r.rows.filter((x, k) => base.rows[k].top1Hit && !x.top1Hit).map((x) => x.id);
  console.log(`  ${r.tier}: ${lost.length ? lost.join(', ') : '（无）'}`);
}

/* ---------- 稳健性：香水库数组逆转 ---------- */
console.log('');
console.log('===== 稳健性检验（香水库数组逆转后重跑；命中率仍是 topN=5）=====');
const revPool = [...perfumes].reverse();
console.log('-'.repeat(78));
for (const tier of results.map((r) => r.tier)) {
  const fwd = results.find((r) => r.tier === tier);
  const revRows = PORTRAITS.map((port) => {
    const r = recommend(port.answers, revPool, TAX, { topN: HIT_TOPN, dominanceMode: tier });
    const top = r.results.map((x) => x.perfume.id);
    return {
      hits3: top.slice(0, 3).filter((id) => port.gold.includes(id)).length,
      top1Hit: port.gold.includes(top[0]),
    };
  });
  const revMaj = revRows.filter((x) => x.hits3 >= 2).length;
  const revStr = revRows.filter((x) => x.top1Hit).length;
  const stable = revMaj === fwd.maj && revStr === fwd.strict;
  console.log(`${labelOf(tier).padEnd(16)}正序 ${fwd.maj}/${N}·${fwd.strict}/${N}   `
    + `逆序 ${revMaj}/${N}·${revStr}/${N}   ${stable ? '稳健' : '不稳健'}`);
}
console.log('-'.repeat(78));

console.log('');
console.log(`DOMINANCE base(strict, topN=${HIT_TOPN}) MAJORITY ${base.maj}/${N} STRICT ${base.strict}/${N}`);
