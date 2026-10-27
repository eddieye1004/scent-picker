/**
 * test-scoring.mjs — 规则引擎自测
 * 用法: node scripts/test-scoring.mjs
 *
 * 目的：证明「可解释」不是口号 —— 每个推荐结果都必须有可复算的理由，且行为可预测。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recommend, buildProfile, scorePerfume, WEIGHTS } from '../src/scoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8'));
const TAX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
const perfumes = DATA.perfumes;

let pass = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) pass++;
  else failures.push(`${name}${detail ? ' :: ' + detail : ''}`);
};

const emotions = TAX.emotionMap.map((e) => e.id);
const occasions = TAX.occasionMap.map((o) => o.id);

/* T1 全组合（6×5=30）都能出 3 条，理由非空，三调齐全 */
for (const emotion of emotions) {
  for (const occasion of occasions) {
    const r = recommend({ emotion, occasion, intensity: 3 }, perfumes, TAX, { topN: 3 });
    check(`T1 ${emotion}/${occasion} 出3条`, r.results.length === 3, `实际${r.results.length}`);
    check(`T1 ${emotion}/${occasion} 理由非空`, r.results.every((x) => x.reasons.length > 0));
    check(`T1 ${emotion}/${occasion} 三调齐全`,
      r.results.every((x) => x.perfume.top.length && x.perfume.heart.length && x.perfume.base.length));
  }
}

/* T2 幂等：同输入两次完全一致 */
const k1 = JSON.stringify(recommend({ emotion: 'cold', occasion: 'commute', intensity: 2 }, perfumes, TAX).results.map((r) => r.perfume.id));
const k2 = JSON.stringify(recommend({ emotion: 'cold', occasion: 'commute', intensity: 2 }, perfumes, TAX).results.map((r) => r.perfume.id));
check('T2 幂等', k1 === k2, `${k1} vs ${k2}`);

/* T3 讨厌香调真的起作用 */
const baseA = recommend({ emotion: 'clean', occasion: 'commute', intensity: 2 }, perfumes, TAX);
const disA = recommend({ emotion: 'clean', occasion: 'commute', intensity: 2, dislikedNotes: ['Musk'] }, perfumes, TAX);
check('T3 讨厌香调改变结果',
  JSON.stringify(baseA.results.map((r) => r.perfume.id)) !== JSON.stringify(disA.results.map((r) => r.perfume.id)));
const muskCount = disA.results.filter((r) =>
  r.perfume.notesAll.some((n) => n.toLowerCase().includes('musk'))).length;
check('T3 排除后含Musk≤1条', muskCount <= 1, `实际${muskCount}`);

/* T4 多样性：前三不全是同一源家族 */
const dA = recommend({ emotion: 'warm', occasion: 'date', intensity: 4 }, perfumes, TAX);
const fams = dA.results.map((r) => r.perfume.familySource);
check('T4 前三源家族≥2种', new Set(fams).size >= 2, JSON.stringify(fams));

/* T5 强度单调性：厚重香在高强度偏好下得分更高 */
const heavy = perfumes.filter((p) => (p.families.amber || 0) >= 0.85);
if (heavy.length) {
  const p0 = heavy[0];
  const lo = scorePerfume(p0, buildProfile({ emotion: 'warm', occasion: 'date', intensity: 1 }, TAX), TAX).score;
  const hi = scorePerfume(p0, buildProfile({ emotion: 'warm', occasion: 'date', intensity: 5 }, TAX), TAX).score;
  check('T5 厚重香 强度5>强度1', hi > lo, `lo=${lo} hi=${hi} (${p0.name})`);
} else check('T5 无厚重样本', false);

/* T6 点名香调出现在理由里 */
const nA = recommend({ emotion: 'bright', occasion: 'outdoor', intensity: 1, likedNotes: ['Bergamot'] }, perfumes, TAX);
const hasNoteReason = nA.results.some((r) => r.reasons.some((x) => x.includes('Bergamot')));
check('T6 点名香调进理由', hasNoteReason,
  JSON.stringify(nA.results.map((r) => r.reasons)));

/* T7 权重配置健全 */
check('T7 dislikedNotes 为负', WEIGHTS.dislikedNotes < 0);

/* T8 全部可溯源 */
check('T8 全部有 sourceUrl',
  perfumes.every((p) => typeof p.sourceUrl === 'string' && p.sourceUrl.startsWith('http')));

/* T9 不存在编造字段：每瓶必须携带 CC BY 归属 */
check('T9 全部带 attribution',
  perfumes.every((p) => typeof p.attribution === 'string' && p.attribution.includes('Scento')));

/* T10 家族覆盖：每个家族至少 8 瓶可达（否则选到该情绪会空） */
const reach = {};
for (const f of TAX.families) reach[f.id] = 0;
for (const p of perfumes) for (const [fam, w] of Object.entries(p.families)) if (w >= 0.5) reach[fam]++;
for (const f of TAX.families) {
  check(`T10 ${f.zh} 可达≥8瓶`, reach[f.id] >= 8, `实际${reach[f.id]}`);
}

/* 输出 */
console.log('\n===== 测试结果 =====');
console.log(`PASS ${pass}   FAIL ${failures.length}`);
if (failures.length) {
  console.log('\n失败明细:');
  failures.forEach((f) => console.log('  ✗ ' + f));
}
console.log('\n家族可达性:', JSON.stringify(reach));
process.exitCode = failures.length === 0 ? 0 : 1;
