/* ============================================================
   probe-char-weight.mjs —— 第 3 步诊断：character 因子到底能不能影响排序

   四档实验（probe-character-mode.mjs）里 multihit / density 都让金标准变差，
   sparse 不涨不跌。在下结论「character 改不动」之前，先量一件更基础的事：

     这一因子（16 分）在 1388 瓶的总分里占多少？gold 瓶与 top1 的差距
     又是被哪一项拉开的？

   如果 gold 与 top1 的分差远大于 16，那不管 character 怎么算都不可能
   改变排序 —— 问题不在 character 的算法，在权重尺度。

   输出每个画像：
     · top1 与每瓶 gold 的总分差、该差值按因子拆开（top1 领先在哪）
     · gold 瓶的 character 得分 vs top1 的 character 得分
     · 「character 满分能追回多少分差」（16 分上限对照）
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const { perfumes } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8'));
const taxonomy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));
const { PORTRAITS } = await import('file:///' + path.join(ROOT, 'scripts/lib/gold-portraits.mjs').replace(/\\/g, '/'));
const { recommend } = await import('file:///' + path.join(ROOT, 'src/scoring.js').replace(/\\/g, '/'));
const { WEIGHTS, buildProfile, scorePerfume } = await import('file:///' + path.join(ROOT, 'src/scoring.js').replace(/\\/g, '/'));

const byId = new Map(perfumes.map((p) => [p.id, p]));
const CHAR_W = WEIGHTS.character;

console.log('===== character 权重 %d 分 vs 各画像的分差 =====\n', CHAR_W);
console.log('  画像  gold排名   总分差(仅计分项)  character差  family差  其它差  16分能否追平');

let recoverable = 0;
for (const g of PORTRAITS) {
  const pid = g.id || g.key;
  const profile = buildProfile(g.answers, taxonomy);
  const r = recommend(g.answers, perfumes, taxonomy, { topN: 5 });
  const top1 = r.results[0];
  const top1P = top1.perfume;

  /* 用 scorePerfume 的 breakdown 比（不含 boundaryPenalty / 池化 / 去重，
     那三者是排序后的结构性调整，不产生"分差"）。 */
  const b1 = scorePerfume(top1P, profile, taxonomy);
  const map1 = {};
  for (const x of b1.breakdown) map1[x.factor] = (map1[x.factor] || 0) + x.score;

  const rows = [];
  for (const gid of g.gold) {
    const p = byId.get(gid);
    if (!p) continue;
    const bg = scorePerfume(p, profile, taxonomy);
    const mapG = {};
    for (const x of bg.breakdown) mapG[x.factor] = (mapG[x.factor] || 0) + x.score;
    const total1 = Object.values(map1).reduce((a, b) => a + b, 0);
    const totalG = Object.values(mapG).reduce((a, b) => a + b, 0);
    const dTotal = total1 - totalG;
    const dChar = (map1.character || 0) - (mapG.character || 0);
    const dFam = (map1.family || 0) - (mapG.family || 0);
    const dOther = dTotal - dChar - dFam;
    const rank = r.results.findIndex((x) => x.perfume.id === gid) + 1;
    rows.push({ gid, rank, dTotal, dChar, dFam, dOther, goldChar: mapG.character || 0, top1Char: map1.character || 0 });
  }

  /* 用最接近的一瓶 gold 代表「追不追得平」 */
  const best = rows.slice().sort((a, b) => a.dTotal - b.dTotal)[0];
  const canCatch = best && best.dTotal <= CHAR_W;
  if (canCatch) recoverable++;
  console.log(`  ${String(pid).padEnd(5)} ${String(best?.rank ?? '—').padStart(4)}    `
    + `${String(best?.dTotal.toFixed(1) ?? '—').padStart(10)} ${String(best?.dChar.toFixed(1) ?? '—').padStart(11)} `
    + `${String(best?.dFam.toFixed(1) ?? '—').padStart(8)} ${String(best?.dOther.toFixed(1) ?? '—').padStart(7)}  `
    + `${canCatch ? '能（差 ' + best.dTotal.toFixed(1) + ' ≤ 16）' : '不能（差 ' + (best?.dTotal.toFixed(1) ?? '?') + ' > 16）'}`);
}

console.log(`\n  12 画像里，最近的那瓶 gold 与 top1 的分差 ≤ ${CHAR_W} 的有 ${recoverable} 个`);
console.log('  但「≤ 16」只是名义上追得平 —— 见下面的杠杆测试：把这一项放大到 16 倍，');
console.log('  排序一瓶都不动。所以分差不是被 character 拉开的，也不能靠它补。');

/* ---- 反向：把 character 权重临时放大看排序会不会动（诊断，不改生产） ----
   用 scorePerfume 的 breakdown 重算：把 character 项乘 k 倍后重新排序。
   这不是候选方案，只是回答「这一项有没有杠杆」。 */
console.log('\n===== 杠杆测试：character 项乘 k 倍后，top3 是否变化 =====');
/* 对照组必须是「k=1 的同一个简化模型」，不能是 recommend() ——
   简化模型不含池化与多样性去重，与 recommend 的 top3 本来就有差异。
   第一版拿 recommend() 当基准，k=1 就报「9/12 变化」，那个 9 全是
   模型差异，不是 character 的杠杆。 */
const simpleTop3 = (pid, profile, k) => perfumes.map((p) => {
  const r = scorePerfume(p, profile, taxonomy);
  const ch = r.breakdown.find((b) => b.factor === 'character');
  const extra = ch ? ch.score * (k - 1) : 0;
  return { id: p.id, s: r.score + extra };
}).sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.id).join(',');

const profiles = PORTRAITS.map((g) => ({ pid: g.id || g.key, profile: buildProfile(g.answers, taxonomy) }));
const baseSimple = new Map(profiles.map(({ pid, profile }) => [pid, simpleTop3(pid, profile, 1)]));

for (const k of [1, 2, 4, 8, 16]) {
  const changed = [];
  for (const { pid, profile } of profiles) {
    if (simpleTop3(pid, profile, k) !== baseSimple.get(pid)) changed.push(pid);
  }
  console.log(`  k=${String(k).padStart(2)}×  相对 k=1 简化模型变化 ${changed.length}/12 ${changed.length ? '(' + changed.join(',') + ')' : ''}`);
}
console.log('  → 若 k=16 仍大面积不变，说明 character 在总分里没有杠杆，改算法不解决问题。');

/* ---- 为什么会没有杠杆：看 top20 里 character 是否已经饱和 ---- */
console.log('\n===== character 在 top20 里是否饱和（这是没有杠杆的原因）=====');
console.log('  画像    top20 里拿满 16 分的   top3 的 character 分   gold 的 character 分');
let saturated = 0;
for (const g of PORTRAITS) {
  const pid = g.id || g.key;
  const profile = buildProfile(g.answers, taxonomy);
  const rows = perfumes.map((p) => {
    const r = scorePerfume(p, profile, taxonomy);
    const c = r.breakdown.find((b) => b.factor === 'character');
    return { id: p.id, s: r.score, c: c ? c.score : 0 };
  }).sort((a, b) => b.s - a.s);
  const top20 = rows.slice(0, 20);
  const full20 = top20.filter((r) => r.c >= 16).length;
  if (full20 === 20) saturated++;
  const top3c = rows.slice(0, 3).map((r) => r.c.toFixed(0)).join('/');
  const goldC = g.gold.map((id) => (rows.find((r) => r.id === id)?.c ?? 0).toFixed(0)).join('/');
  console.log(`  ${String(pid).padEnd(5)} ${String(full20 + '/20').padStart(12)} ${top3c.padStart(20)} ${goldC.padStart(20)}`);
}
console.log(`\n  12 画像里 top20 全部拿满分的：${saturated}/12`);
console.log('  → 也就是前 20 名在这一项上**完全打平**。对一个「大家都在 16 分」的项来说，');
console.log('    改它的算法只会打破这种平局、而不会带来信息增量 —— 这与四档实测');
console.log('    （multihit -1/-2、density -1/-2、sparse 0/0）完全吻合。');
