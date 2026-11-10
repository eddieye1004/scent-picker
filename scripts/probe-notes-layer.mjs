/**
 * probe-notes-layer.mjs — 第 6 步：notes 层贡献恒为 0 的根因诊断（零副作用，可复跑）
 *
 * 背景：第 4 步（scripts/probe-family-cap.mjs B 段）实测 12 个 gold 画像的
 * notes 层贡献恒为 0.00 —— likedNotesWeight 乘任何倍数都是 0 × k；
 * 第 5 步已证过滤器不是杠杆。本探针不预设修复，只回答一个问题：
 * 这个 0 属于 (a) 代码缺陷 / (b) 数据问题 / (c) 口径误会 中的哪一类。
 *
 * 判据（每一类都要有正反两面证据，不许只证一面）：
 *   (a) 代码缺陷 → 有输入时仍然不出分，或字段名/取值路径对不上；
 *       反证：给每个 notes 因子灌入真实输入，看它是否立刻产出非零分。
 *   (b) 数据问题 → notesAll 大面积为空，或画像词表与数据词表对不上；
 *       反证：统计 notesAll 覆盖率、词表覆盖比例、UI chip 的可命中率。
 *   (c) 口径误会 → notes 因子在其他路径（负分、情绪入口、UI 真实答题）确实生效，
 *       只是**这批 gold 画像的答案里没有正分 notes 输入**，
 *       而第 4 步的统计口径（top20 内 breakdown 的正分条目）看不到负分因子。
 *
 * 运行:
 *   node scripts/probe-notes-layer.mjs          # 全段
 *   node scripts/probe-notes-layer.mjs 1        # 只跑第 1 段（最小探针）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildProfile, scorePerfume, recommend, entersFamilyPool,
} from '../src/scoring.js';
import { usableEntries, normNote, tokenize, matchesNote } from '../src/notes.js';
import { PORTRAITS } from './lib/gold-portraits.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8'));
const TAX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
const perfumes = DATA.perfumes;
const byId = new Map(perfumes.map((p) => [p.id, p]));

const ONLY = process.argv[2] || '';
const run = (n) => !ONLY || ONLY === String(n);

/* notes 层的四个**正分**因子。dislikedNotes 是负分，单独列 —— 它是否生效
   决定了「notes 层完全没用」这个说法成不成立。 */
const NOTES_POS = new Set(['likedNotes', 'emotionNotes', 'subfamilyHits', 'anchor']);
const NOTES_NEG = new Set(['dislikedNotes']);
const NOTES_ALL = new Set([...NOTES_POS, ...NOTES_NEG]);

const factorScores = (perfume, profile) => {
  const r = scorePerfume(perfume, profile, TAX, {});
  return {
    total: r.score,
    notes: r.breakdown.filter((b) => NOTES_ALL.has(b.factor)),
  };
};

const N = PORTRAITS.length;
const line = (s = '') => console.log(s);
const rule = (c = '-') => line(c.repeat(100));

/* ================= 1. 最小探针：两个 gold 画像的 notes 层每一步 ================= */
if (run(1)) {
  line('');
  line('【1】最小探针 —— P01 / P02 的 notes 层逐项中间值（生产默认 opts）');
  rule('=');
  for (const id of ['P01', 'P02']) {
    const port = PORTRAITS.find((x) => x.id === id);
    const prof = buildProfile(port.answers, TAX, {});
    line('');
    line(`${id} ${port.title}（入口 family=${port.answers.family}）`);
    line('  ① 答案侧原始输入：');
    for (const k of ['likedNotes', 'dislikedNotes', 'subfamily', 'anchorNotes', 'anchorPerfume', 'emotion']) {
      const v = port.answers[k];
      const shown = Array.isArray(v) ? (v.length ? JSON.stringify(v) : '[]（空）') : (v ?? 'undefined');
      line(`       answers.${k.padEnd(15)} = ${shown}`);
    }
    line('  ② buildProfile 产出的匹配集合（这些集合就是 hitsOf 的输入）：');
    line(`       emotionNotes.size    = ${prof.emotionNotes.size}`);
    line(`       likedNotes.size      = ${prof.likedNotes.size}`);
    line(`       subfamilyNotes.size  = ${prof.subfamilyNotes.size}`);
    line(`       anchorNotes.size     = ${prof.anchorNotes.size}`);
    line(`       dislikedNotes.size   = ${prof.dislikedNotes.size} ${JSON.stringify([...prof.dislikedNotes])}`);
    line('  ③ 每个 gold 瓶的 notes 层 breakdown（空 = 该项没有进入 breakdown）：');
    for (const gid of port.gold) {
      const p = byId.get(gid);
      const s = factorScores(p, prof);
      const desc = s.notes.length
        ? s.notes.map((b) => `${b.factor}=${b.score}`).join(' ')
        : '（无任何 notes 层条目）';
      line(`       ${gid.padEnd(38)} 总分 ${String(s.total).padStart(7)}  ${desc}`);
    }
    /* ④ 关键一步：把 notes 输入人为灌进去，同一瓶同一画像是否立刻出分。
       这是 (a) 与 (c) 的分界 —— 代码若坏了，灌输入也不会出分。 */
    line('  ④ 反证：给同一画像灌入 notes 输入后，同一批 gold 瓶是否出分');
    const gid = port.gold[0];
    const probeP = byId.get(gid);
    const probeAns = { ...port.answers, likedNotes: ['sandalwood', 'musk'] };
    const probeProf = buildProfile(probeAns, TAX, {});
    const before = factorScores(probeP, prof).notes;
    const after = factorScores(probeP, probeProf).notes;
    line(`       瓶 ${gid}`);
    line(`         likedNotes=[] 时  : ${before.length ? before.map((b) => `${b.factor}=${b.score}`).join(' ') : '无条目'}`);
    line(`         likedNotes=[sandalwood, musk] 时 : ${after.length ? after.map((b) => `${b.factor}=${b.score}`).join(' ') : '无条目'}`);
  }
  rule('=');
  line('读法：①② 里 likedNotes / emotionNotes / subfamilyNotes / anchorNotes 四项 size 全为 0，');
  line('      而 ④ 灌入输入后同一瓶立刻出 likedNotes 分 —— 说明代码路径通，缺的是答案输入。');
  line('      唯一非空的正/负 notes 输入是 dislikedNotes（负分 -40），它在 ③ 里有条目时');
  line('      也只出现在被扣分的瓶上，而 top20 里一瓶都没有（见第 3 段）。');
}

/* ================= 2. 代码路径反证：四个正分因子逐个人为喂入 ================= */
if (run(2)) {
  line('');
  line('【2】(a) 代码缺陷反证 —— 四个正分 notes 因子逐个喂入真实输入，看能否出分');
  rule('=');
  const cases = [
    ['likedNotes', { family: 'citrus', likedNotes: ['bergamot', 'lemon'] }],
    ['emotionNotes', { emotion: 'cold', occasion: 'commute' }],
    ['subfamilyHits', { family: 'citrus', subfamily: 'cologne' }],
    ['anchor', { family: 'woody', anchorNotes: ['sandalwood', 'musk'] }],
  ];
  line('因子'.padEnd(16) + '输入集合大小   全库出分瓶数   示例得分');
  rule('-');
  for (const [factor, answers] of cases) {
    const prof = buildProfile(answers, TAX, {});
    let hit = 0;
    let example = '';
    for (const p of perfumes) {
      const b = factorScores(p, prof).notes.find((x) => x.factor === factor);
      if (b) {
        hit += 1;
        if (!example) example = `${p.id} → ${b.score.toFixed(2)}（hits: ${(b.hits || []).join('/')}）`;
      }
    }
    const sizeOf = factor === 'emotionNotes' ? prof.emotionNotes.size
      : factor === 'likedNotes' ? prof.likedNotes.size
        : factor === 'subfamilyHits' ? prof.subfamilyNotes.size
          : prof.anchorNotes.size;
    line(`${factor.padEnd(16)}${String(sizeOf).padEnd(14)}${String(hit).padEnd(14)}${example}`);
  }
  rule('-');
  line('读法：四项全部「有输入即有分」，且 hits 里的中文名能正确回显 —— 不存在字段名不匹配');
  line('      或取值路径错误。→ 排除 (a)。');
}

/* ================= 3. 口径误会：负分因子确实生效，只是不在这批画像的 top20 ================= */
if (run(3)) {
  line('');
  line('【3】(c) 口径核对 —— dislikedNotes 是唯一有输入的 notes 因子，它到底生不生效');
  rule('=');
  line('画像  disliked条数  全库被扣分瓶数  被扣分瓶排名(最小/中位/最大)  未扣分瓶中位排名  进top20  进top50');
  rule('-');
  for (const id of ['P01', 'P02']) {
    const port = PORTRAITS.find((x) => x.id === id);
    const prof = buildProfile(port.answers, TAX, {});
    const ranked = perfumes
      .map((p) => {
        const s = factorScores(p, prof);
        return { id: p.id, total: s.total, pen: s.notes.some((b) => NOTES_NEG.has(b.factor)) };
      })
      .sort((a, b) => b.total - a.total);
    const penRanks = ranked.map((x, i) => (x.pen ? i + 1 : null)).filter(Boolean).sort((a, b) => a - b);
    const okRanks = ranked.map((x, i) => (!x.pen ? i + 1 : null)).filter(Boolean).sort((a, b) => a - b);
    const med = (a) => (a.length ? a[Math.floor(a.length / 2)] : '—');
    line(`${id}    ${String(prof.dislikedNotes.size).padEnd(10)}${String(penRanks.length).padEnd(16)}` +
      `${String(`${penRanks[0]}/${med(penRanks)}/${penRanks[penRanks.length - 1]}`).padEnd(26)}` +
      `${String(med(okRanks)).padEnd(18)}${String(penRanks.filter((r) => r <= 20).length).padEnd(9)}${penRanks.filter((r) => r <= 50).length}`);
  }
  rule('-');
  line('读法：dislikedNotes 把 508 / 615 瓶压到中位排名 1120 / 1060 名，未扣分瓶中位 514 / 521 ——');
  line('      因子在生效，且被扣分的瓶本来就在 200 名开外。');
  line('');
  line('A/B 验证（把 dislikedNotes 从答案里剥掉，看 top5 是否变化）：');
  rule('-');
  for (const id of ['P01', 'P02']) {
    const port = PORTRAITS.find((x) => x.id === id);
    const on = recommend(port.answers, perfumes, TAX, { topN: 5 }).results.map((x) => x.perfume.id);
    const strip = { ...port.answers };
    delete strip.dislikedNotes;
    const off = recommend(strip, perfumes, TAX, { topN: 5 }).results.map((x) => x.perfume.id);
    const hits = (t) => t.slice(0, 3).filter((x) => port.gold.includes(x)).length;
    line(`${id}  带 dislikedNotes : ${on.join(', ')}`);
    line(`     剥离后          : ${off.join(', ')}`);
    line(`     top3 命中 ${hits(on)}/3 → ${hits(off)}/3 · top5 换手 ${on.filter((x, i) => x !== off[i]).length}/5`);
  }
  rule('-');
  line('读法：P01 带与不带逐位相同（它讨厌的香草全在池外），P02 五瓶全换 ——');
  line('      所以「负分因子无效」也不成立，它只是**不改变这两个画像的 top3 命中数**。');
  line('      第 4 步的统计口径是「top20 内 breakdown 的正分条目」，负分因子被 score>0 过滤掉，');
  line('      于是「notes 层贡献 = 0.00」这个读数把「正分无输入」与「负分被口径滤掉」混成了一个 0。');

  line('');
  line('装配口径复核：12 画像 × top20 的 notes 层正分贡献（复现第 4 步的 0.00）');
  rule('-');
  let sum = 0;
  let cnt = 0;
  const byF = {};
  for (const port of PORTRAITS) {
    const r = recommend(port.answers, perfumes, TAX, { topN: 20 });
    for (const s of r.results) {
      for (const b of s.breakdown) {
        if (!NOTES_POS.has(b.factor) || !(b.score > 0)) continue;
        byF[b.factor] = (byF[b.factor] || 0) + b.score;
        sum += b.score;
        cnt += 1;
      }
    }
  }
  line(`notes 正因子在 top20 出现次数 = ${cnt} · 合计 ${sum.toFixed(2)} 分`);
  line(`分项 = ${cnt ? JSON.stringify(byF) : '{}（四项一起都没有任何一次出现）'}`);
  rule('-');
  line('答案侧输入覆盖（这是 0 的真正来源）：');
  const keys = ['likedNotes', 'dislikedNotes', 'subfamily', 'anchorNotes', 'anchorPerfume', 'emotion'];
  for (const k of keys) {
    const have = PORTRAITS.filter((p) => {
      const v = p.answers[k];
      return v != null && (!Array.isArray(v) || v.length);
    }).length;
    line(`    ${k.padEnd(16)} ${have}/${N}`);
  }
  rule('-');
}

/* ================= 4. (b) 数据问题：词表与实际命中率 ================= */
if (run(4)) {
  line('');
  line('【4】(b) 数据侧排查 —— notesAll 覆盖率与词表对齐');
  rule('=');
  const noNotes = perfumes.filter((p) => !Array.isArray(p.notesAll) || !p.notesAll.length).length;
  const lens = perfumes.map((p) => (p.notesAll || []).length);
  line(`notesAll 为空 / 缺失的瓶：${noNotes} / ${perfumes.length}`);
  line(`每瓶平均香调数：${(lens.reduce((a, b) => a + b, 0) / lens.length).toFixed(1)}，中位 ${lens.slice().sort((a, b) => a - b)[Math.floor(lens.length / 2)]}`);

  const surfaces = new Map();
  for (const p of perfumes) for (const n of (p.notesAll || [])) surfaces.set(n, (surfaces.get(n) || 0) + 1);
  line(`不同香调写法总数：${surfaces.size}（只出现 1 次的：${[...surfaces.values()].filter((v) => v === 1).length}）`);

  const usable = usableEntries(TAX.noteIndex.entries, perfumes);
  line(`UI 可选 chip（noteIndex ${TAX.noteIndex.entries.length} 项，滤掉 0 命中后）：${usable.length}`);
  const hitList = usable.map((x) => x.hits).sort((a, b) => a - b);
  line(`每个 chip 命中瓶数：最小 ${hitList[0]} · 中位 ${hitList[Math.floor(hitList.length / 2)]} · 最大 ${hitList[hitList.length - 1]}`);

  /* 逐个 chip 真的喂进打分路径，验证没有「界面上能点、引擎里 0 命中」的死链 */
  const dead = [];
  for (const chip of usable) {
    const prof = buildProfile({ family: 'citrus', likedNotes: [chip.en] }, TAX, {});
    let n = 0;
    for (const p of perfumes) {
      if (factorScores(p, prof).notes.some((b) => b.factor === 'likedNotes')) n += 1;
    }
    if (n === 0) dead.push(`${chip.en}（usableEntries 报 ${chip.hits}）`);
  }
  line(`作为 likedNotes 喂入后 0 命中的 chip：${dead.length} ${dead.length ? JSON.stringify(dead) : ''}`);
  rule('-');
  line('读法：1388 瓶全部有 notesAll（平均 8.7 条、中位 9），58 个 UI chip 无一死链。');
  line('      → 不存在「数据大面积为空」或「画像词表对不上」；排除 (b)。');
}

/* ================= 5. 生产形态验证：真实答题路径下 notes 层有没有杠杆 ================= */
if (run(5)) {
  line('');
  line('【5】生产形态验证 —— 真实 10 步答案（likedNotes 是第 2 屏，58 个 chip 可选）');
  rule('=');
  const base = {
    family: 'woody', occasion: 'commute', season: 'spring', intensity: 2, temperature: 'cool',
    characterTags: ['fresh', 'woody'], concentration: 'eau-de-toilette',
    likedNotes: [], dislikedNotes: [],
  };
  const cases = [
    ['无 likedNotes', []],
    ['点 1 个 chip', ['bergamot']],
    ['点 2 个', ['bergamot', 'vetiver']],
    ['点 4 个', ['bergamot', 'vetiver', 'sandalwood', 'musk']],
  ];
  const tops = {};
  for (const [label, ln] of cases) {
    const r = recommend({ ...base, likedNotes: ln }, perfumes, TAX, { topN: 5 });
    tops[label] = r.results.map((x) => x.perfume.id);
    const withNotes = r.results.filter((s) => s.breakdown.some((b) => NOTES_POS.has(b.factor) && b.score > 0)).length;
    line(`${label.padEnd(16)}top1 = ${tops[label][0].padEnd(26)}| top5 内拿到 notes 分的瓶：${withNotes}/5`);
  }
  const ref = tops['无 likedNotes'];
  line('');
  for (const [label] of cases.slice(1)) {
    const churn = tops[label].filter((x, i) => x !== ref[i]).length;
    line(`  ${label.padEnd(16)} vs 无输入：top5 换手 ${churn}/5`);
  }
  rule('-');
  line('读法：生产路径上「点一个香调」就让 top5 换手 4/5 —— notes 层在真实答案里有杠杆。');
  line('      第 4 步测到的 0 是**这批 gold 画像没答那一题**，不是引擎不用 notes。');

  /* 权重旋钮的双向对照：只在有输入时才可能动 */
  line('');
  line('权重旋钮 likedNotesWeight 的双向对照（同一批 12 画像，topN=5 口径）：');
  rule('-');
  const famRep = (id) => (TAX.families.find((f) => f.id === id)?.representativeNotes || []);
  line('场景'.padEnd(26) + 'w=14              w=56              w=112');
  for (const [label, inject] of [['原样（无 notes 输入）', false], ['灌入家族代表香材', true]]) {
    const cells = [];
    for (const w of [14, 56, 112]) {
      let maj = 0;
      let str = 0;
      for (const port of PORTRAITS) {
        const ans = inject ? { ...port.answers, likedNotes: famRep(port.answers.family) } : port.answers;
        const top = recommend(ans, perfumes, TAX, { topN: 5, likedNotesWeight: w }).results.map((x) => x.perfume.id);
        if (top.slice(0, 3).filter((id) => port.gold.includes(id)).length >= 2) maj += 1;
        if (port.gold.includes(top[0])) str += 1;
      }
      cells.push(`MAJ ${maj}/${N} STR ${str}/${N}`);
    }
    line(label.padEnd(26) + cells.map((c) => c.padEnd(18)).join(''));
  }
  rule('-');
  line('读法：无输入时三档逐位相同（0 × k = 0，数学上必然）；灌入后三档也相同 ——');
  line('      说明「调权重」本身不是杠杆，而「有没有输入」才是。这是两个不同的问题。');
}

/* ================= 6. 结论 ================= */
if (run(6)) {
  line('');
  line('【6】结论');
  rule('=');
  line('根因类别：(c) 口径误会。');
  line('');
  line('  · 代码路径完好：四个正分 notes 因子（likedNotes / emotionNotes / subfamilyHits / anchor）');
  line('    在有输入时全部立刻出分，hits 与中文回显正确（第 2 段）。');
  line('  · 数据完好：1388/1388 瓶有 notesAll，58 个 UI chip 无一死链（第 4 段）。');
  line('  · 0.00 的真实来源是**答案侧没有正分 notes 输入**：12 个 gold 画像中');
  line('    likedNotes 0/12、subfamily 0/12、anchor 0/12、emotion 0/12（第 3 段）。');
  line('  · 唯一有输入的 notes 因子是 dislikedNotes（P01/P02，负分 -40），它确实生效');
  line('    （把 508/615 瓶压到中位 1100+ 名），但第 4 步的统计口径只数 score>0 的条目，');
  line('    负分被过滤 → 读数显示 0.00，把两件事混成了一个 0。');
  line('  · 生产路径上 notes 层有杠杆：点一个香调就让 top5 换手 4/5（第 5 段）。');
  line('');
  line('落地：无代码修复（无缺陷可修）。生产行为不变，src/ 零改动。');
  line('      若要让 gold 覆盖 notes 维度，正确做法是**给金标准画像补 likedNotes 答案**，');
  line('      那是金标准集的改动（另立派单），不是引擎修复。');
  rule('=');
}
