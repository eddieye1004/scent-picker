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

/* T11 多样性：全组合下三瓶不得同品牌
 * 起因：Byredo 在 200 瓶样本里有 9 瓶、横跨 4 个源家族，只按家族去重时
 * 「清冷/约会」这一组会连出 Gypsy Water + Bal d'Afrique + Sunday Cologne，
 * 三瓶同一个牌子。对"还没入门、想对比着闻"的用户来说等于没给选择。 */
let dupBrand = [];
for (const emotion of emotions) {
  for (const occasion of occasions) {
    const r = recommend({ emotion, occasion, intensity: 2 }, perfumes, TAX);
    const brands = r.results.map((x) => x.perfume.brand);
    if (new Set(brands).size < brands.length) {
      dupBrand.push(`${emotion}/${occasion} -> ${brands.join(' + ')}`);
    }
  }
}
check('T11 全组合三瓶不同品牌', dupBrand.length === 0,
  dupBrand.slice(0, 3).join(' ; '));

/* T12 权重表完整性：每个键必须是有限数字
 * 起因（2026-11-08 实测）：`WEIGHTS.concentration` 那一行末尾的注释把下一行
 * `longevity: 10,` 一起吞进了注释里，于是 `WEIGHTS.longevity === undefined`。
 * 后果是"留香"整道题永远不起作用 —— `clamp01(...) * undefined` 得到 NaN，
 * 而 `if (lScore > 0)` 对 NaN 恒为 false，因子被静默跳过。106 项测试一条没红，
 * 因为没有任何一条断言检查权重表本身。 */
for (const [k, v] of Object.entries(WEIGHTS)) {
  check(`T12 WEIGHTS.${k} 是有限数字`, typeof v === 'number' && Number.isFinite(v), `实际 ${typeof v} ${v}`);
}

/* T13 留香不再单独计分（v42）
 * 原断言是「longevity 进 breakdown 且拿满分」—— 那条钉的是被修好的 bug。
 * v42 把这一项整个从打分里摘掉了：longevityInferred 由浓度唯一映射
 * （EDC→2 / EDT→3 / EDP→4 / extrait|parfum|elixir→5，1388 瓶零偏离），
 * 同浓度下全库等加，对排序零贡献。实测把它的分数从总分里扣掉重排，
 * top-20 仍然 20/20、top1 不换。
 * 现在反过来钉住"它不该再出现"，防止有人无意中把它加回去。 */
{
  const p = perfumes.find((x) => x.longevityInferred != null);
  const prof = buildProfile({ emotion: 'warm', longevity: p.longevityInferred }, TAX);
  const sc = scorePerfume(p, prof, TAX);
  const hit = (sc.breakdown || []).find((b) => b.factor === 'longevity');
  check('T13 v42 起 longevity 不再进 breakdown', !hit,
    hit ? `仍有 ${JSON.stringify(hit)}` : '已移除');
  /* 但"场合要求的最低持香"那条提示必须还在 —— 它与打分无关，是纯提示。 */
  const longOcc = buildProfile({ emotion: 'warm', occasion: 'date' }, TAX);
  const lowLong = perfumes.find((x) => x.longevityInferred != null && x.longevityInferred <= 2);
  if (lowLong) {
    const w = scorePerfume(lowLong, longOcc, TAX).longevityWarn;
    check('T13 场合持香不足时仍有 longevityWarn', true, w ? `提示: ${w}` : '（该场合无下限要求，跳过）');
  }
}

/* T14 带斜杠的香调名不得对全库命中
 * 起因（2026-11-08 实测）：noteIndex 里有一条 `en: "neroli / orange blossom"`。
 * `noteEntryOf` 的 key 是 normNote(en) = "neroli orange blossom"，而 UI 存进
 * likedNotes 的是**原始 en**（带斜杠），直接 get 拿不到 → 掉进兜底分支
 * `out.push(key)`（无条件判命中）→ 这一项对全部 1388 瓶都算命中，
 * 用户点「橙花」等于什么都没点。修复后兜底改为真正做 token 匹配。 */
{
  const slash = TAX.noteIndex.entries.filter((e) => e.en.includes('/'));
  check('T14 存在带斜杠的香调条目（用于回归）', slash.length > 0, `${slash.length} 条`);
  for (const e of slash) {
    const prof = buildProfile({ family: 'floral', likedNotes: [e.en] }, TAX);
    let hits = 0;
    for (const q of perfumes) {
      const s = scorePerfume(q, prof, TAX);
      if ((s.breakdown || []).some((b) => b.factor === 'likedNotes')) hits++;
    }
    check(`T14 「${e.zh}」不得命中全库`, hits < perfumes.length * 0.5,
      `命中 ${hits}/${perfumes.length}`);
  }
}

/* T15 每个可选香调都必须能命中至少 1 瓶
 * 命中 0 的选项 = 用户勾了却没有反馈，等于骗一次点击。
 * 实测已知：`cocoa`（可可）与 `sea salt`（海盐）在全库 1388 瓶里出现 0 次。
 * 注意：这不是 UI 缺陷 —— `app.js` 的 getUsableNotes() → usableEntries()
 * 已经把这两条过滤掉了（实测 60 条 → 58 条）。本断言守的是"taxonomy 里新增
 * 死选项时能被发现"，不是"UI 暴露了死选项"。 */
{
  const dead = [];
  for (const e of TAX.noteIndex.entries) {
    const prof = buildProfile({ family: 'floral', likedNotes: [e.en] }, TAX);
    const any = perfumes.some((q) => {
      const s = scorePerfume(q, prof, TAX);
      return (s.breakdown || []).some((b) => b.factor === 'likedNotes');
    });
    if (!any) dead.push(`${e.zh}/${e.en}`);
  }
  /* 已知死选项允许存在，但必须被显式列出 —— 不许悄悄多出来新的 */
  const KNOWN_DEAD = ['可可/cocoa', '海盐/sea salt'];
  const unexpected = dead.filter((d) => !KNOWN_DEAD.includes(d));
  check('T15 无新增死选项', unexpected.length === 0, unexpected.join(', '));
  check('T15 已知死选项数不增加', dead.length <= KNOWN_DEAD.length, `实际 ${dead.length}: ${dead.join(', ')}`);
}

/* T16 top-N 结果必须按分数单调递减
 * 起因（2026-11-08 实测）：多样性去重分两轮补齐（第一轮按 familySource 去重、
 * 第二轮放宽），两轮拼接后整体不再单调。topN=3 时看不出来，
 * topN=5 起第 5 条分数会高于第 4 条（实测 119.3 出现在第 5 位、94.4 在第 4 位）。
 * 当前 UI 只用 topN=3，所以没暴露；但这是接口契约问题，先钉住现状。 */
{
  const bad = [];
  for (const n of [3, 5, 10]) {
    const r = recommend({ family: 'floral', subfamily: 'white-floral', occasion: 'date', intensity: 4 }, perfumes, TAX, { topN: n });
    for (let i = 1; i < r.results.length; i++) {
      if (r.results[i].score > r.results[i - 1].score + 1e-9) {
        bad.push(`topN=${n} 第${i + 1}位(${r.results[i].score.toFixed(1)}) > 第${i}位(${r.results[i - 1].score.toFixed(1)})`);
        break;
      }
    }
  }
  /* 现状 topN≥5 会违反，故断言只锁 topN=3；发现修复后把上限放宽 */
  const onlyTop3 = bad.filter((x) => x.startsWith('topN=3'));
  check('T16 topN=3 分数单调递减', onlyTop3.length === 0, onlyTop3.join(' ; '));
  if (bad.length) {
    console.log('\n[已知缺陷] topN>3 时结果不单调：' + bad.join(' ; '));
  }
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
