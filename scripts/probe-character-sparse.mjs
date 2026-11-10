/* ============================================================
   probe-character-sparse.mjs —— 第 3 步：稀疏 character 标签的测量

   为什么要先立测量再改（CONTROL.md 第 3 步的纪律）：
   家族衰减那次就是因为没先量清「谁在加分、谁被扣分」，四档跑完才
   发现衰减打中的是「副族被正确识别」的瓶子。这次先把 character
   因子的实际行为量出来，再决定改什么。

   量四件事（零接口调用，纯读 data/perfumes.json + 打分函数）：

   ① 标签频率与画像覆盖
      21 个标签的池内瓶数，以及 12 画像各自的 tags 在池里有多稀。

   ② 打分路径分布（12 画像 × 全库 1388 瓶）
      character 因子有三种结果：`tag`（硬命中）/ `family`（软回退）/
      `none`（0 分）。比例失衡就是问题所在。

   ③ 命中个数被抹平（核心嫌疑）
      现有实现是 `wantTags.find(...)` —— 只取第一个命中就满分。
      「瓶名同时带 fresh + woody + clean」与「只带 fresh」拿一样的分。
      这里统计 top10 里各瓶实际命中几个 wantTag。

   ④ 稀疏标签的硬命中率
      clean(23) / salty(22) / leathery(13) / rich(4) 在池里这么少，
      用户点它们时硬匹配几乎必然落空，只能走软回退 —— 软回退给的
      是 `16 * 0.6 * ratio`（最高 9.6），比硬命中少 40%。
      量出这个落差到底影响多少瓶子。

   用法：
     node scripts/probe-character-sparse.mjs
     node scripts/probe-character-sparse.mjs --verbose   # 逐画像 top10 明细
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

const { perfumes } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8'));
const taxonomy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));
const { PORTRAITS } = await import('file:///' + path.join(ROOT, 'scripts/lib/gold-portraits.mjs').replace(/\\/g, '/'));
const { scorePerfume, buildProfile } = await import('file:///' + path.join(ROOT, 'src/scoring.js').replace(/\\/g, '/'));

const byId = new Map(perfumes.map((p) => [p.id, p]));

/* ---------- ① 标签频率 ---------- */
const freq = {};
for (const p of perfumes) for (const t of (p.character || [])) freq[t] = (freq[t] || 0) + 1;
const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);

console.log('===== ① character 标签频率（%d 瓶 / %d 个标签）=====', perfumes.length, sorted.length);
for (const [t, n] of sorted) {
  const pct = (100 * n / perfumes.length).toFixed(1);
  const bar = '█'.repeat(Math.max(1, Math.round(n / 20)));
  console.log(`  ${String(n).padStart(5)} ${pct.padStart(5)}%  ${t.padEnd(10)} ${bar}`);
}
const SPARSE = sorted.filter(([, n]) => n < 60).map(([t, n]) => ({ tag: t, n }));
console.log(`  稀疏标签（<60 瓶）: ${SPARSE.map((s) => `${s.tag}(${s.n})`).join(' / ')}`);

/* ---------- ② 打分路径分布 + ③ 命中个数 ---------- */
const pathTally = { tag: 0, family: 0, none: 0 };
let hitCountHist = {};      // wantTag 命中个数 → 瓶数（仅 tag 路径）
const perPortrait = [];

for (const g of PORTRAITS) {
  const pid = g.id || g.key;
  const profile = buildProfile(g.answers, taxonomy);
  const wantTags = profile.characterTags.length ? profile.characterTags : (profile.character ? [profile.character] : []);

  const ranked = [];
  for (const p of perfumes) {
    const r = scorePerfume(p, profile, taxonomy);
    const ch = r.breakdown.find((b) => b.factor === 'character');
    const chTags = (p.character || []).filter((t) => wantTags.includes(t));
    ranked.push({ id: p.id, score: r.score, how: ch ? ch.how : null, cScore: ch ? ch.score : 0, hits: chTags.length, tags: chTags });
  }
  ranked.sort((a, b) => b.score - a.score);

  const tally = { tag: 0, family: 0, none: 0 };
  for (const r of ranked) tally[r.how || 'none']++;
  pathTally.tag += tally.tag; pathTally.family += tally.family; pathTally.none += tally.none;

  for (const r of ranked) if (r.how === 'tag') hitCountHist[r.hits] = (hitCountHist[r.hits] || 0) + 1;

  const top10 = ranked.slice(0, 10);
  const goldRank = (g.gold || []).map((id) => ({ id, rank: ranked.findIndex((r) => r.id === id) + 1 }));
  const goldHit = goldRank.filter((x) => x.rank > 0 && x.rank <= 3).length;
  const multiHitTop10 = top10.filter((r) => r.hits >= 2).length;
  const goldMultiHit = (g.gold || []).reduce((a, id) => {
    const ch = (byId.get(id)?.character || []).filter((t) => wantTags.includes(t));
    return a + (ch.length >= 2 ? 1 : 0);
  }, 0);

  perPortrait.push({ pid, wantTags, tally, goldHit, goldN: (g.gold || []).length, multiHitTop10, goldMultiHit, goldRank });
}

console.log('\n===== ② character 打分路径分布（12 画像 × %d 瓶）=====', perfumes.length);
const totalAll = pathTally.tag + pathTally.family + pathTally.none;
for (const k of ['tag', 'family', 'none']) {
  console.log(`  ${k.padEnd(7)} ${String(pathTally[k]).padStart(6)}  ${(100 * pathTally[k] / totalAll).toFixed(1)}%`);
}

console.log('\n===== ③ 硬命中时「命中几个 wantTag」的分布 =====');
const hitTotal = Object.values(hitCountHist).reduce((a, b) => a + b, 0);
for (const k of Object.keys(hitCountHist).sort((a, b) => a - b)) {
  console.log(`  命中 ${k} 个  ${String(hitCountHist[k]).padStart(6)} 瓶  ${(100 * hitCountHist[k] / hitTotal).toFixed(1)}%`);
}

console.log('\n===== ④ 逐画像：打分路径 / top10 多命中 / gold 多命中 =====');
console.log('  画像  wantTags                                  tag  family   none  top10多命中  gold多命中  gold进top3');
for (const r of perPortrait) {
  console.log(`  ${String(r.pid).padEnd(5)} ${r.wantTags.join(',').padEnd(38)} `
    + `${String(r.tally.tag).padStart(4)} ${String(r.tally.family).padStart(6)} ${String(r.tally.none).padStart(6)} `
    + `${String(r.multiHitTop10).padStart(10)} ${String(`${r.goldMultiHit}/${r.goldN}`).padStart(10)} ${String(`${r.goldHit}/${r.goldN}`).padStart(11)}`);
  if (VERBOSE) console.log(`        gold 排名: ${r.goldRank.map((x) => `${x.id}#${x.rank || '—'}`).join(' ')}`);
}

/* ---------- ⑤ 稀疏标签的硬命中落差 ---------- */
console.log('\n===== ⑤ 稀疏标签：点它时能硬命中多少瓶 =====');
for (const s of SPARSE) {
  /* 该标签单独作为唯一 wantTag 时，硬命中池内的瓶数就是 s.n；
     软回退给 16*0.6*ratio（最高 9.6），落差 6.4 分。 */
  console.log(`  ${s.tag.padEnd(10)} 池内 ${String(s.n).padStart(3)} 瓶 → 硬命中 ${String(s.n).padStart(3)}，其余 ${perfumes.length - s.n} 瓶只能软回退（最高 9.6 < 16）`);
}

console.log('\n===== 机器可读 =====');
console.log(`SPARSE_TAGS ${SPARSE.map((s) => s.tag).join(',')}`);
console.log(`PATH tag=${pathTally.tag} family=${pathTally.family} none=${pathTally.none}`);
console.log(`MULTI_HIT_TOP10 ${perPortrait.reduce((a, r) => a + r.multiHitTop10, 0)}`);
