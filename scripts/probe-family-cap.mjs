/**
 * probe-family-cap.mjs — 第 4 步实验：家族总分封顶（A）+ notes 层加权（B）
 *
 * 背景（CONTROL.md §3 第 4 步，Muse 派单 2026-11-10）：
 *   家族三项合计 86 分（familyPick 34 + emotionFamily 30 + occasionFamily 22）。
 *   诊断实测（scripts/probe-*、docs/reviews/QUESTIONNAIRE-LINE-REVIEW-20261110.md §3.1）：
 *   这一项在整族候选池里是**常数** —— 柑橘 L1 池 117 瓶 117 瓶全拿满，
 *   木质 239/243 并列。于是同族内排序实际只由剩下约 49 分决定。
 *   假设：把家族这一项的满分从 86 压到 40–50，剩下 49 分（气质/浓淡/场合…）
 *   权重占比翻倍，排序分辨率应该变好。
 *
 * 两种压法都测（派单要求）：
 *   scale —— famScore = base * cap，等比缩小，低分瓶一起被压小
 *   hard  —— famScore = min(base * 86, cap)，只削顶部，中段保持原值
 *   两者在 base=1（饱和瓶）处相等，差别全在 0.4 < base < 1 的中段。
 *
 * B 段测 notes 层加权：likedNotes 权重若干档 + notes 层整体放大若干档。
 *   注意：12 个金标准画像**一个都没有 likedNotes / subfamily / anchor 答案**
 *   （只有 P01/P02 有 dislikedNotes），所以 B 段预期是结构性 ±0，
 *   探针会把「notes 层在 top20 里到底有没有实际得分」一并量出来，
 *   免得把「权重不够」和「根本没有输入」混为一谈。
 *
 * 全部走 src/scoring.js 的 opts 开关，不改源码常量 ——
 * 改前改后两组数字必须出自同一份代码，否则 commit 间的无关改动会混进结论。
 *
 * 用法:
 *   node scripts/probe-family-cap.mjs            # A 两法全档 + B 全档
 *   node scripts/probe-family-cap.mjs A          # 只跑 A
 *   node scripts/probe-family-cap.mjs B          # 只跑 B（自动先取 A 的最优档）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recommend } from '../src/scoring.js';
import { PORTRAITS } from './lib/gold-portraits.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8'));
const TAX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
const perfumes = DATA.perfumes;
const byId = new Map(perfumes.map((p) => [p.id, p]));

const ONLY = (process.argv.slice(2).find((a) => /^[AB]$/i.test(a)) || '').toUpperCase();
const N = PORTRAITS.length;

/* 金标准 id 必须都在池内 —— 缺一个说明香水库被换过，后面数字全部无意义 */
for (const port of PORTRAITS) {
  for (const id of port.gold) {
    if (!byId.has(id)) throw new Error(`${port.id} 的金标准 id 不在香水库里: ${id}`);
  }
}

/* 家族项满分 86 是硬事实，从 WEIGHTS 读不到合成后的值（v42 已把 familyPick 并进去），
   这里直接写死 86 并在启动时用一次实测自校验，避免以后改动悄悄漂移。 */
const FAMILY_TOTAL = 86;

function runOne(opts, pool = perfumes) {
  const rows = [];
  for (const port of PORTRAITS) {
    const r = recommend(port.answers, pool, TAX, { topN: 5, ...opts });
    const top = r.results.map((x) => x.perfume.id);
    const hits3 = top.slice(0, 3).filter((id) => port.gold.includes(id)).length;
    rows.push({ id: port.id, top, hits3, top1Hit: port.gold.includes(top[0]), maj: hits3 >= 2 });
  }
  return {
    opts,
    rows,
    maj: rows.filter((x) => x.maj).length,
    strict: rows.filter((x) => x.top1Hit).length,
  };
}

const fmt = (d) => (d > 0 ? `+${d}` : d === 0 ? '±0' : `${d}`);
const base = runOne({});
const all = [base];

function report(title, results, labelOf) {
  console.log('');
  console.log(title);
  console.log('-'.repeat(104));
  console.log('档位'.padEnd(30) + 'MAJORITY  STRICT    ΔMAJ   ΔSTR   top3 换手');
  console.log('-'.repeat(104));
  for (const r of results) {
    const dM = r.maj - base.maj;
    const dS = r.strict - base.strict;
    /* top3 换手：12 个画像里 top3 集合（不是名次）与基准不同的画像数。
       命中率 ±0 有两种完全不同的原因 ——
         「排序变了但金标准没覆盖到」（换手 > 0）
         「排序根本没变」（换手 = 0，机制性无效）
       两者对"下一步该不该继续调这个旋钮"的结论完全相反，必须分开报。 */
    const churn = r.rows.filter((x, k) => x.top.slice(0, 3).join('|') !== base.rows[k].top.slice(0, 3).join('|')).length;
    console.log(
      `${labelOf(r).padEnd(30)} ${String(`${r.maj}/${N}`).padEnd(8)} ${String(`${r.strict}/${N}`).padEnd(8)} ` +
        `${fmt(dM).padEnd(6)} ${fmt(dS).padEnd(6)} ${churn}/${N}`,
    );
  }
  console.log('-'.repeat(104));
}

function perPortraitDiff(results, labelOf) {
  const moved = results.filter((r) => r.rows.some((x, k) => x.hits3 !== base.rows[k].hits3 || x.top1Hit !== base.rows[k].top1Hit));
  console.log('');
  console.log('逐画像变化（只列与基准不同的）：');
  if (!moved.length) {
    console.log('  （所有档位与基准逐画像一致）');
    return;
  }
  for (const r of moved) {
    const parts = r.rows
      .map((x, k) => ({ id: x.id, a: base.rows[k].hits3, b: x.hits3, a1: base.rows[k].top1Hit, b1: x.top1Hit }))
      .filter((d) => d.a !== d.b || d.a1 !== d.b1)
      .map((d) => {
        const hit = d.a === d.b ? '' : `top3 ${d.a}→${d.b}`;
        const t1 = d.a1 === d.b1 ? '' : `top1 ${d.a1 ? '✓' : '·'}→${d.b1 ? '✓' : '·'}`;
        return `${d.id}(${[hit, t1].filter(Boolean).join(', ')})`;
      });
    console.log(`  ${labelOf(r).padEnd(30)} ${parts.join('  ')}`);
  }
}

/* ---------- 自校验：不答场合时（denom=1.0）饱和瓶的家族项实测值必须是 86 ---------- */
let calib = '';
{
  const r = recommend({ family: 'woody' }, perfumes, TAX, { topN: 3 });
  const fam = r.results[0].breakdown.find((b) => b.factor === 'family');
  const actual = fam ? fam.score : 0;
  if (Math.abs(actual - FAMILY_TOTAL) > 0.51) {
    throw new Error(`家族项实测 ${actual}，与假设的 ${FAMILY_TOTAL} 差太多 —— 家族公式已被改动，探针口径失效`);
  }
  /* 答了场合时 denom=1.18，满分瓶拿 86/1.18≈72.9 —— 这是「同一项在另一条分支上不满分」，
     不是缺陷，但要写进报告，否则 A 段的「封顶」会被误读成把两条分支压成同一条。 */
  const r2 = recommend(PORTRAITS[0].answers, perfumes, TAX, { topN: 3 });
  const fam2 = r2.results[0].breakdown.find((b) => b.factor === 'family');
  calib = `口径校准：不答场合 → 家族项满分 ${actual.toFixed(2)}；答了场合(denom=1.18) → ` +
    `P01 top1 实测 ${(fam2 ? fam2.score : 0).toFixed(2)}（同一项在这条分支上本就不满 86）`;
}

console.log('');
console.log(`金标准 ${N} 画像 · 香水库 ${perfumes.length} 瓶 · 家族项满分 ${FAMILY_TOTAL}`);
console.log(calib);
console.log(`基准: MAJORITY ${base.maj}/${N} · STRICT ${base.strict}/${N}`);

/* ================= A. 家族总分封顶 ================= */
if (ONLY !== 'B') {
  const CAPS = [60, 50, 45, 40, 34, 26];
  const scaleRes = CAPS.map((c) => runOne({ familyCap: c, familyCapMode: 'scale' }));
  const hardRes = CAPS.map((c) => runOne({ familyCap: c, familyCapMode: 'hard' }));

  report('A1 等比缩放（scale）—— 家族项满分 86 → cap，base 整体等比缩小', [base, ...scaleRes],
    (r) => (r.opts.familyCap ? `scale cap=${r.opts.familyCap}` : '基准（cap=86）'));
  report('A2 硬顶（hard）—— 只削顶部，中段 base*86 保持原值', [base, ...hardRes],
    (r) => (r.opts.familyCap ? `hard  cap=${r.opts.familyCap}` : '基准（cap=86）'));

  perPortraitDiff([...scaleRes, ...hardRes],
    (r) => `${r.opts.familyCapMode} cap=${r.opts.familyCap}`);

  /* 逐画像全表（scale 三档）：命中率 ±0 时，人需要看「到底哪几个画像动了」，
     而不是只知道总数没变。 */
  console.log('');
  console.log('逐画像全表（scale：top3 命中数 / top1 是否 gold）：');
  const showCaps = [50, 45, 40];
  const pick = (cap) => scaleRes.find((r) => r.opts.familyCap === cap);
  console.log('  画像  基准            ' + showCaps.map((c) => `cap=${c}`.padEnd(12)).join(''));
  for (let k = 0; k < N; k++) {
    const b = base.rows[k];
    const cells = showCaps.map((c) => {
      const x = pick(c).rows[k];
      const mark = x.hits3 !== b.hits3 || x.top1Hit !== b.top1Hit ? '*' : ' ';
      return `${x.hits3}/3 · ${x.top1Hit ? '✓' : '·'}${mark}`.padEnd(12);
    });
    console.log(`  ${b.id}   ${`${b.hits3}/3 · ${b.top1Hit ? '✓' : '·'}`.padEnd(16)}${cells.join('')}`);
  }
  console.log('  （* 标记该画像的命中数与基准不同）');

  /* 饱和对照：cap 之后同族内还有多少瓶并列 —— 直接看「削顶到底有没有换来分辨率」 */
  console.log('');
  console.log('分辨率对照（woody 入口 topN=243，即 L1 池全量；看有多少瓶并列同一总分）：');
  for (const [mode, cap] of [['scale', 86], ['scale', 50], ['scale', 40], ['hard', 50], ['hard', 40]]) {
    const o = mode === 'scale' && cap === 86
      ? { topN: 243 }
      : { topN: 243, familyCap: cap, familyCapMode: mode };
    const res = recommend({ family: 'woody' }, perfumes, TAX, o).results;
    const buckets = {};
    for (const s of res) buckets[s.score] = (buckets[s.score] || 0) + 1;
    const worst = Math.max(...Object.values(buckets));
    console.log(
      `  ${(mode === 'scale' && cap === 86 ? '基准  ' : `${mode} ${cap}`).padEnd(11)} 不同总分 ` +
        `${String(Object.keys(buckets).length).padStart(3)} 档 · 最大并列 ${String(worst).padStart(3)} 瓶 · ` +
        `top10 = ${res.slice(0, 10).map((s) => s.score.toFixed(1)).join(' ')}`,
    );
  }
  /* hard 模式为什么会比 scale 更差：它把「base 中段」的瓶子全部顶到同一个 cap 值，
     等于在 cap 这个分位上制造一个新的大并列 —— 削了顶，却在半山腰堆了一座平台。 */

  /* ---- 结构性上限：金标准瓶有多少根本进不了 L1 池 ----
     recommend() 的 L1 过滤 `isDominant` 是**硬过滤**，与家族项拿多少分无关：
     它看的是「该瓶 families 里权重最高的那一族，等不等于用户选的族」。
     所以「把家族项从 86 压到 40」这件事，在数学上不可能把一瓶非主族金标准
     拉进候选池 —— 它只能改变池内排序。
     这一段把上限量出来，避免把「压不动」误读成「压得不够狠」。 */
  console.log('');
  console.log('结构性上限：金标准瓶进 L1 池（主族 == 所选族）的情况');
  const domOf = (p) => Object.entries(p.families || {})
    .filter(([k]) => k !== '_')
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  let goldAll = 0;
  let goldInL1 = 0;
  for (const port of PORTRAITS) {
    const fam = port.answers.family;
    const inL1 = port.gold.filter((id) => domOf(byId.get(id)) === fam).length;
    goldAll += port.gold.length;
    goldInL1 += inL1;
    console.log(`  ${port.id}（${fam}）: gold 在 L1 池 ${inL1}/${port.gold.length}`);
  }
  console.log(`  合计: ${goldInL1}/${goldAll} = ${((goldInL1 / goldAll) * 100).toFixed(1)}% —— ` +
    `其余 ${goldAll - goldInL1} 瓶即使家族项拿满分也进不了候选池，压顶帮不到它们`);

  /* 满分级金标准瓶（L1 内、家族项饱和）里，还有多少排在 top3 之外 ——
     这才是「池内排序」能争取的部分 */
  console.log('');
  console.log('池内可争取的部分（L1 内且家族项饱和的金标准瓶，实际排到第几名）：');
  for (const port of PORTRAITS) {
    const fam = port.answers.family;
    const r = recommend(port.answers, perfumes, TAX, { topN: 30 });
    const ranked = r.results.map((s) => s.perfume.id);
    const inPool = port.gold.filter((id) => domOf(byId.get(id)) === fam);
    if (!inPool.length) continue;
    const best = inPool
      .map((id) => ({ id, rank: ranked.indexOf(id) }))
      .filter((x) => x.rank >= 0)
      .sort((a, b) => a.rank - b.rank)[0];
    if (best) console.log(`  ${port.id}: L1 内最好的一瓶排第 ${best.rank + 1}（${best.id}）`);
    else console.log(`  ${port.id}: L1 内 ${inPool.length} 瓶全部排在 top30 之外`);
  }

  /* A3：细档扫描 —— 40–50 区间外还有没有稳定的收益点。
     cap=26 在 A1 里出现 STR +1，必须确认它是"稳定效应"还是"12 画像里的一次抖动"：
     若 STR +1 只在极窄的一段出现、换个 cap 就消失，就不能当结论。 */
  const SWEEP = [50, 45, 40, 34, 30, 26, 22, 18, 12, 6];
  const sweepRes = SWEEP.map((c) => runOne({ familyCap: c, familyCapMode: 'scale' }));
  report('A3 细档扫描（scale，含派单区间 40–50 之外）', [base, ...sweepRes],
    (r) => (r.opts.familyCap ? `scale cap=${r.opts.familyCap}` : '基准（cap=86）'));

  /* 翻转裕度：cap=26 让 P06 top1 翻成 gold，看它赢多少分 ——
     赢 0.1 分是并列抖动，赢 5 分才是真效应。 */
  console.log('');
  console.log('翻转裕度（cap=26 scale，P06 的 top1 为什么换了）：');
  {
    const a = recommend(PORTRAITS[5].answers, perfumes, TAX, { topN: 5 }).results;
    const b = recommend(PORTRAITS[5].answers, perfumes, TAX, { topN: 5, familyCap: 26, familyCapMode: 'scale' }).results;
    const gold = new Set(PORTRAITS[5].gold);
    console.log(`  基准 top1 = ${a[0].perfume.id}（${a[0].score.toFixed(2)}，${gold.has(a[0].perfume.id) ? 'gold' : '非 gold'}）`);
    console.log(`  cap=26 top1 = ${b[0].perfume.id}（${b[0].score.toFixed(2)}，${gold.has(b[0].perfume.id) ? 'gold' : '非 gold'}）`);
    const g = b.find((s) => gold.has(s.perfume.id));
    if (g) {
      const second = b.find((s) => s !== g);
      const margin = g.score - second.score;
      console.log(`  新 top1 领先第二名 ${margin.toFixed(2)} 分 → ${margin < 1 ? '并列抖动级，不是稳健效应' : '非抖动级'}`);
    }
  }
  /* 稳健性检验：把香水库数组顺序反转再跑一遍。
     排序是 sort((a,b) => b.score - a.score)，**同分瓶的相对顺序由输入数组顺序决定**。
     所以「换个 cap 结果不同」有两种解释：
       ① 分数真的变了（稳健，与输入顺序无关）
       ② 只是同分并列被遍历顺序决定（不稳健，反转数组就会变）
     这道检验把二者分开 —— 若某档在正序与逆序下命中率不同，该档的收益就是虚假的。 */
  console.log('');
  console.log('稳健性检验：香水库数组逆转后重跑（同分并列会因输入顺序改变而改判）');
  const revPool = [...perfumes].reverse();
  console.log('-'.repeat(104));
  console.log('档位'.padEnd(30) + '正序 MAJ/STR      逆序 MAJ/STR      判定');
  console.log('-'.repeat(104));
  for (const cap of [86, 50, 45, 40, 30, 26]) {
    const o = cap === 86 ? {} : { familyCap: cap, familyCapMode: 'scale' };
    const f = runOne(o);
    const r = runOne(o, revPool);
    const stable = f.maj === r.maj && f.strict === r.strict;
    const changed = f.rows.filter((x, k) => x.top1Hit !== r.rows[k].top1Hit).length;
    console.log(
      `${(cap === 86 ? '基准' : `scale cap=${cap}`).padEnd(30)} ` +
        `${`${f.maj}/${N} · ${f.strict}/${N}`.padEnd(18)} ${`${r.maj}/${N} · ${r.strict}/${N}`.padEnd(18)} ` +
        `${stable ? '稳健' : `不稳健（${changed} 画像 top1 翻面）`}`,
    );
  }
  console.log('-'.repeat(104));
}

/* ================= B. 在 A 最优档上加 notes 层 ================= */
if (ONLY !== 'A') {
  /* A 最优档：MAJORITY 最高者，同分取 STRICT 更高者，再同分取更接近 45（区间中点）者 */
  const cands = [];
  for (const c of [60, 50, 45, 40, 34, 26]) {
    for (const mode of ['scale', 'hard']) cands.push({ c, mode, r: runOne({ familyCap: c, familyCapMode: mode }) });
  }
  cands.sort((a, b) => b.r.maj - a.r.maj || b.r.strict - a.r.strict || Math.abs(a.c - 45) - Math.abs(b.c - 45));
  const best = cands[0];
  const bestOpts = { familyCap: best.c, familyCapMode: best.mode };
  const baseA = runOne(bestOpts);
  console.log('');
  console.log(`A 最优档 = ${best.mode} cap=${best.c}（MAJ ${best.r.maj}/${N} · STR ${best.r.strict}/${N}）—— B 段全部在此档上叠加`);

  const LIKED = [14, 28, 56, 112];
  const likedRes = LIKED.map((w) => runOne({ ...bestOpts, likedNotesWeight: w }));

  /* notes 层整体放大：likedNotes / emotionNotes / subfamilyHits / anchor 都是读 notesAll 的因子，
     但它们各自的权重是常量。这里用「加权版答案」以外的方式没法统一放大 ——
     唯一能统一放大的口子是 likedNotesWeight，其余三项对这批画像是零输入，
     所以 B2 改测「把画像的家族代表香材当 likedNotes 灌进去」这一诊断档（见 B3）。
     先把 likedNotes 的档位跑完，再量 notes 层到底有没有输入。 */
  report('B1 likedNotes 权重上调（叠在 A 最优档上）', [baseA, ...likedRes],
    (r) => (r === baseA ? 'A 最优档（likedNotes=14）' : `likedNotes=${r.opts.likedNotesWeight}`));

  perPortraitDiff(likedRes, (r) => `likedNotes=${r.opts.likedNotesWeight}`);

  /* ---- 结构性事实：这批画像的 notes 层输入是不是空的 ---- */
  console.log('');
  console.log('notes 层输入盘点（12 画像的答案里有几项能喂给 notes 因子）：');
  const NOTES_INPUT_KEYS = ['likedNotes', 'subfamily', 'anchorNotes', 'anchorPerfume', 'emotion'];
  for (const port of PORTRAITS) {
    const have = NOTES_INPUT_KEYS.filter((k) => port.answers[k] != null && (!Array.isArray(port.answers[k]) || port.answers[k].length));
    if (!have.length) continue;
    console.log(`  ${port.id}: ${have.join(', ')}`);
  }
  const withNotes = PORTRAITS.filter((p) => (p.answers.likedNotes || []).length).length;
  console.log(`  有 likedNotes 的画像: ${withNotes}/${N}`);
  console.log(`  有 subfamily 的画像: ${PORTRAITS.filter((p) => p.answers.subfamily).length}/${N}`);
  console.log(`  有 anchorNotes/anchorPerfume 的画像: ${PORTRAITS.filter((p) => (p.answers.anchorNotes || []).length || p.answers.anchorPerfume).length}/${N}`);
  console.log(`  走情绪入口（有 emotionNotes）的画像: ${PORTRAITS.filter((p) => p.answers.emotion).length}/${N}`);

  /* notes 层在 top20 里的实际得分：0 分就说明「加权重」这条路在数学上是空转 */
  console.log('');
  console.log('notes 层在 top20 里的实际得分（基准路径，top20 = topN 20 的候选序列）：');
  const NOTES_FACTORS = new Set(['likedNotes', 'emotionNotes', 'subfamilyHits', 'anchor']);
  let anyNotes = 0;
  for (const port of PORTRAITS) {
    const r = recommend(port.answers, perfumes, TAX, { topN: 20 });
    const got = r.results.filter((s) => s.breakdown.some((b) => NOTES_FACTORS.has(b.factor) && b.score > 0)).length;
    if (got) anyNotes++;
    if (got) console.log(`  ${port.id}: ${got}/20 瓶拿到 notes 层分数`);
  }
  if (!anyNotes) console.log('  （12 画像的 top20 里，notes 层得分全部为 0 —— 加权重等于 0 × k）');

  /* 因子贡献全表：把「谁在真正决定排序」量化。
     口径 = 各画像 top20 的候选序列里，该因子**平均贡献分**（负分因子不计）。
     这张表是 B 段结论的硬证据：notes 层若为 0，上调权重在数学上不可能改变任何排序。 */
  console.log('');
  console.log('因子平均贡献（12 画像 × top20 候选，正分因子的均值；这是「谁在决定排序」的实测）：');
  const agg = {};
  for (const port of PORTRAITS) {
    const r = recommend(port.answers, perfumes, TAX, { topN: 20 });
    for (const s of r.results) {
      for (const b of s.breakdown) {
        if (!b || typeof b.score !== 'number' || b.score <= 0) continue;
        const a = (agg[b.factor] ||= { sum: 0, n: 0 });
        a.sum += b.score;
        a.n++;
      }
    }
  }
  const rowsAgg = Object.entries(agg)
    .map(([f, a]) => ({ f, avg: a.sum / a.n, n: a.n }))
    .sort((a, b) => b.avg - a.avg);
  for (const x of rowsAgg) {
    const tag = NOTES_FACTORS.has(x.f) ? '  ← notes 层' : '';
    console.log(`  ${x.f.padEnd(16)} 平均 ${x.avg.toFixed(2).padStart(6)} 分（覆盖 ${x.n} 个候选瓶·次）${tag}`);
  }
  const notesAvg = rowsAgg.filter((x) => NOTES_FACTORS.has(x.f)).reduce((a, x) => a + x.avg, 0);
  console.log(`  notes 层四项合计平均 ${notesAvg.toFixed(2)} 分 —— ` +
    `${notesAvg === 0 ? '权重乘多少都是 0，B 方向在数学上是空转' : '有非零贡献，权重上调理论上可改变排序'}`);

  /* ---- B3 诊断档：把第 1 步所选家族的代表香材当 likedNotes 灌进去 ----
     这是一条**诊断**，不是提给生产的方向：它改的是「问卷有没有问香调」，
     属于问卷层的改动，不在本轮权限内。放在这里只为回答一个问题 ——
     notes 层如果真的有了输入，还有没有抬升空间。 */
  console.log('');
  console.log('B3 诊断档（非生产方向）：把家族代表香材灌成 likedNotes 后，notes 层还有没有空间');
  const repRes = [];
  for (const w of [14, 28, 56]) {
    const rows = [];
    for (const port of PORTRAITS) {
      const fam = TAX.families.find((f) => f.id === port.answers.family);
      const rep = (fam?.representativeNotes || []).filter((n) => n !== 'neroli / orange blossom');
      const answers = { ...port.answers, likedNotes: rep };
      const r = recommend(answers, perfumes, TAX, { topN: 5, ...bestOpts, likedNotesWeight: w });
      const top = r.results.map((x) => x.perfume.id);
      const hits3 = top.slice(0, 3).filter((id) => port.gold.includes(id)).length;
      rows.push({ id: port.id, top, hits3, top1Hit: port.gold.includes(top[0]), maj: hits3 >= 2 });
    }
    repRes.push({ opts: { likedNotesWeight: w }, rows, maj: rows.filter((x) => x.maj).length, strict: rows.filter((x) => x.top1Hit).length });
  }
  report('B3 诊断档（家族代表香材 → likedNotes）', [baseA, ...repRes],
    (r) => (r === baseA ? 'A 最优档（无 likedNotes）' : `诊断 likedNotes=${r.opts.likedNotesWeight}`));
}

console.log('');
console.log(`FAMILY CAP base MAJORITY ${base.maj}/${N} STRICT ${base.strict}/${N}`);
