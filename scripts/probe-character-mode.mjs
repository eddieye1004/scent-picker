/* ============================================================
   probe-character-mode.mjs —— 第 3 步：character 因子四档实验（零接口调用）

   对应 CONTROL.md 第 3 步「处理稀疏 character 标签」。四档都由
   `scorePerfume(p, profile, taxonomy, { characterMode })` 开关驱动，
   生产路径保持 `''`（历史行为逐位一致），与第 2 步的 familyDecay 同一套做法：
   改前改后必须出自同一份代码，否则 commit 间的无关改动会混进结论。

   档位：
     ''          基准（find 首命中满分 / 软回退 0.6 上限）
     'multihit'  多命中加权：命中 1/2/3 个 wantTag → 16 / 20 / 24（上限 1.5×）
     'density'   按 wantTags 覆盖比例：16 × (hits / wantTags.length)
     'sparse'    稀疏标签软回退上限 0.6 → 1.0（clean/salty/leathery/smoky/rich）
     'fixed'     换用 CHARACTER_FAMILY_FIXED：修 leathery 的死键 smoke、
                 clean 第一族 fresh→floral，另三个稀疏标签按实测重排

   结论（2026-11-10 实测，12 画像 × 1388 瓶）：
     multihit 1/12·2/12（−1/−2） density 1/12·2/12（−1/−2）
     sparse   2/12·4/12（0/0）    fixed   2/12·4/12（0/0）
   前三档都改不动，因为 character 在 top20 里已经饱和：12 画像中有 11 个
   的 top20 **全部**拿满 16 分（probe-char-weight.mjs 实测）。前 20 名在这一项
   上完全打平，改算法只会打破平局、不带来信息增量。真正拉开分差的是 family
   （top1 对最好 gold 平均 +5.80 分，7/12 个画像由它决定胜负）。

   输出：每档的 MAJORITY / STRICT / Δ / 逐画像变化，以及恶化样本
   （基准 top3 里有 gold、换档后掉出去的画像）。

   用法：
     node scripts/probe-character-mode.mjs
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const { perfumes } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8'));
const taxonomy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));
const { PORTRAITS } = await import('file:///' + path.join(ROOT, 'scripts/lib/gold-portraits.mjs').replace(/\\/g, '/'));
const { recommend } = await import('file:///' + path.join(ROOT, 'src/scoring.js').replace(/\\/g, '/'));

const MODES = ['', 'multihit', 'density', 'sparse', 'fixed'];

/* 必须走 recommend() 而不是自己 scorePerfume 排序 —— 这条踩过一次。
   scorePerfume 只是"单瓶原始分"，recommend() 后面还有三层：
     ① boundaryPenalty ×0.82（选了大圈+小圈时的互斥惩罚）
     ② 家族三层池 L1 主导 / L2 权重>=0.5 / L3 全部
     ③ 多样性去重（同 familySource、同 brand 不许占满前三）
   只用 scorePerfume 排序时基准是 MAJORITY 1/12，而 test-gold 报 2/12 ——
   差的那一个画像正是被 ②③ 改过序的。基准对不上，delta 就没有意义。 */
function run(mode) {
  const out = { mode, per: {}, majority: 0, strict: 0 };
  for (const g of PORTRAITS) {
    const pid = g.id || g.key;
    const r = recommend(g.answers, perfumes, taxonomy, {
      topN: 5,
      ...(mode === 'fixed' ? { characterFamily: 'fixed' } : (mode ? { characterMode: mode } : {})),
    });
    const order = r.results.map((x) => x.perfume.id);
    const top3 = order.slice(0, 3);
    const gold = g.gold || [];
    const hitsTop3 = gold.filter((id) => top3.includes(id)).length;
    const okMaj = hitsTop3 >= 2;
    const okStr = gold.includes(order[0]);
    if (okMaj) out.majority++;
    if (okStr) out.strict++;
    out.per[pid] = { order, top3, hitsTop3, okMaj, okStr, gold };
  }
  return out;
}

const base = run('');
const results = MODES.map((m) => (m === '' ? base : run(m)));

console.log('===== character 因子四档实测（12 画像 × %d 瓶）=====', perfumes.length);
console.log('  档位         MAJORITY      STRICT        Δ');
for (const r of results) {
  const name = r.mode || '(基准)';
  const dMaj = r.majority - base.majority;
  const dStr = r.strict - base.strict;
  const delta = r.mode === '' ? '—' : `MAJ ${dMaj >= 0 ? '+' : ''}${dMaj} · STR ${dStr >= 0 ? '+' : ''}${dStr}`;
  console.log(`  ${name.padEnd(11)} ${String(`${r.majority}/12`).padStart(6)} ${String((100 * r.majority / 12).toFixed(1) + '%').padStart(8)}`
    + `   ${String(`${r.strict}/12`).padStart(6)} ${String((100 * r.strict / 12).toFixed(1) + '%').padStart(8)}   ${delta}`);
}

console.log('\n===== 逐画像变化（只列有变化的）=====');
for (const r of results) {
  if (r.mode === '') continue;
  const changed = [];
  for (const g of PORTRAITS) {
    const pid = g.id || g.key;
    const b = base.per[pid];
    const n = r.per[pid];
    if (b.hitsTop3 === n.hitsTop3 && b.okStr === n.okStr) continue;
    changed.push(`${pid} top3命中 ${b.hitsTop3}→${n.hitsTop3}${b.okStr !== n.okStr ? ` / top1 ${b.okStr ? '✓' : '·'}→${n.okStr ? '✓' : '·'}` : ''}`);
  }
  console.log(`  ${r.mode.padEnd(9)} ${changed.length ? changed.join('；') : '无变化'}`);
}

console.log('\n===== 恶化样本（基准 top3 有 gold、换档后掉出）=====');
for (const r of results) {
  if (r.mode === '') continue;
  const worse = [];
  for (const g of PORTRAITS) {
    const pid = g.id || g.key;
    const b = base.per[pid];
    const n = r.per[pid];
    if (b.hitsTop3 > n.hitsTop3) {
      const lost = b.gold.filter((id) => b.top3.includes(id) && !n.top3.includes(id));
      worse.push(`${pid} 丢掉 ${lost.join(',')}；现 top3 = ${n.top3.join(' / ')}`);
    }
  }
  console.log(`  ${r.mode.padEnd(9)} ${worse.length ? worse.join('\n            ') : '无'}`);
}

console.log('\n===== 机器可读 =====');
console.log(`GOLD BASE MAJORITY ${base.majority}/12 STRICT ${base.strict}/12`);
for (const r of results) {
  if (r.mode === '') continue;
  console.log(`GOLD ${r.mode.toUpperCase()} MAJORITY ${r.majority}/12 STRICT ${r.strict}/12`);
}
