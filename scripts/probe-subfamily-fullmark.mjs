/**
 * probe-subfamily-fullmark.mjs — 验证 B 节两处引擎口径真的生效（而不是"写了没接上"）。
 *
 * 两件事必须分别证明：
 *   ① 命中归一化 t = min(2, notes 条数)：1 条 notes 的小类命中 1 条即满分；
 *      ≥2 条的小类仍然要 2 条才满分（没有被顺手改宽）。
 *   ② coreNotes：带 coreNotes 的小类，没命中主心骨时得分封顶一半；
 *      命中主心骨时按命中数正常给分。没有 coreNotes 的小类完全不受影响。
 *
 * 判据取 scorePerfume 的 breakdown.subfamilyHits —— 那是真正的计分点，
 * 不是 profile 里的中间量。造瓶子直接喂，不依赖库内某瓶恰好长什么样。
 *
 * 用法：node scripts/probe-subfamily-fullmark.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildProfile, scorePerfume, WEIGHTS } from '../src/scoring.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const TAX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));

const FULL = WEIGHTS.subfamilyHits;
let pass = 0;
const fails = [];
const ok = (name, cond, detail) => {
  if (cond) { pass += 1; return; }
  fails.push(`${name}${detail ? ' :: ' + detail : ''}`);
};

/** 造一瓶只带指定 notes 的句子，其余维度留空（每个因子取不到值就跳过） */
const mk = (notesAll) => ({
  id: 'probe-' + notesAll.join('-'), brand: 'P', name: 'probe',
  families: { citrus: 1, floral: 0, woody: 0, amber: 0, fresh: 0, gourmand: 0 },
  character: [], seasons: [], timesOfDay: [], notesAll,
  concentration: 'eau-de-parfum', popularityRank: 1000,
});

const subScore = (family, subfamily, notesAll) => {
  const prof = buildProfile({ family, subfamily }, TAX);
  const r = scorePerfume(mk(notesAll), prof, TAX);
  const b = (r.breakdown || []).find((x) => x.factor === 'subfamilyHits');
  return b ? b : null;
};

const fam = (id) => TAX.families.find((f) => f.id === id);
const sub = (fid, sid) => fam(fid).subfamilies.find((s) => s.id === sid);

/* ---------- ① 1 条 notes 的小类：命中 1 条即满分 ---------- */
{
  const s = sub('woody', 'sandalwood');
  ok('檀木只有 1 条 notes（这条断言守着场景前提）', s.notes.length === 1, `${s.notes.length} 条: ${s.notes}`);
  const b = subScore('woody', 'sandalwood', ['Sandalwood', 'Musk']);
  ok('檀木命中 1 条就拿满分（旧实现只有一半）',
    !!b && Math.abs(b.score - FULL) < 1e-9, b ? `${b.score} / 目标 ${FULL}` : '没有 subfamilyHits');
  ok('檀木的 fullAt 被归一化成 1', !!b && b.fullAt === 1, b && String(b.fullAt));
}

/* ---------- ① 反例：≥2 条 notes 的小类，1 条仍然只有一半 ---------- */
{
  const s = sub('floral', 'white-floral');
  ok('白花有 ≥2 条 notes（场景前提）', s.notes.length >= 2, `${s.notes.length} 条`);
  const b = subScore('floral', 'white-floral', ['Jasmine']);
  ok('白花只命中 1/2 时仍是半档（归一化没有把所有小类都放宽）',
    !!b && Math.abs(b.score - FULL / 2) < 1e-9, b ? `${b.score} / 目标 ${FULL / 2}` : '没有 subfamilyHits');
  ok('白花的 fullAt 仍是 2', !!b && b.fullAt === 2, b && String(b.fullAt));
  const b2 = subScore('floral', 'white-floral', ['Jasmine', 'Tuberose']);
  ok('白花命中 2 条拿满分', !!b2 && Math.abs(b2.score - FULL) < 1e-9, b2 ? `${b2.score}` : '—');
}

/* ---------- ② coreNotes：茶香没命中茶本味 → 封顶一半 ---------- */
{
  const s = sub('fresh', 'tea');
  ok('茶香带 coreNotes 且值为 tea', JSON.stringify(s.coreNotes) === JSON.stringify(['tea']),
    JSON.stringify(s.coreNotes));

  /* 只命中 bergamot + jasmine：命中数够 2（本该满分），但都不是茶本味 */
  const noCore = subScore('fresh', 'tea', ['Bergamot', 'Jasmine']);
  ok('茶香只命中佛手柑+茉莉（无茶）→ 封顶一半',
    !!noCore && Math.abs(noCore.score - FULL / 2) < 1e-9,
    noCore ? `${noCore.score} / 上限 ${FULL / 2}` : '没有 subfamilyHits');
  ok('茶香无主心骨时 breakdown 记 coreHit=false', !!noCore && noCore.coreHit === false,
    noCore && String(noCore.coreHit));

  /* 命中 tea 本身：主心骨到位，按命中数正常给分 */
  const withCore = subScore('fresh', 'tea', ['Tea', 'Bergamot']);
  ok('茶香命中 tea 后拿满分（不再被封顶）',
    !!withCore && Math.abs(withCore.score - FULL) < 1e-9,
    withCore ? `${withCore.score}` : '没有 subfamilyHits');
  ok('茶香有主心骨时 breakdown 记 coreHit=true', !!withCore && withCore.coreHit === true,
    withCore && String(withCore.coreHit));

  /* 只命中 tea 一条：一半命中数 × 主心骨到位 —— 仍是半档，但原因不同 */
  const oneOnly = subScore('fresh', 'tea', ['Tea']);
  ok('茶香只命中 tea 一条 → 半档（命中数不足，不是主心骨不足）',
    !!oneOnly && Math.abs(oneOnly.score - FULL / 2) < 1e-9 && oneOnly.coreHit === true,
    oneOnly ? `${oneOnly.score} core=${oneOnly.coreHit}` : '—');
}

/* ---------- ② 没有 coreNotes 的小类必须完全不受影响 ---------- */
{
  const withCore = TAX.families.flatMap((f) => (f.subfamilies || [])
    .filter((s) => (s.coreNotes || []).length).map((s) => f.id + '/' + s.id));
  ok('coreNotes 目前只有茶香一格（机制通用，但只给该给的那一格）',
    JSON.stringify(withCore) === JSON.stringify(['fresh/tea']), withCore.join(','));

  const b = subScore('citrus', 'green-citrus', ['Petitgrain', 'Galbanum']);
  ok('无 coreNotes 的小类命中足额仍是满分（机制不外溢）',
    !!b && Math.abs(b.score - FULL) < 1e-9 && b.coreHit === null,
    b ? `${b.score} core=${b.coreHit}` : '—');
}

/* ---------- 不许按 id 写死：把 coreNotes 换到别的小类，行为要跟着走 ---------- */
{
  const t2 = JSON.parse(JSON.stringify(TAX));
  const g = t2.families.find((f) => f.id === 'citrus').subfamilies.find((s) => s.id === 'green-citrus');
  g.coreNotes = ['petitgrain'];
  const prof = buildProfile({ family: 'citrus', subfamily: 'green-citrus' }, t2);
  const r = scorePerfume(mk(['Galbanum', 'Grapefruit']), prof, t2);
  const b = (r.breakdown || []).find((x) => x.factor === 'subfamilyHits');
  ok('把 coreNotes 挪到青绿柑橘后，没命中 petitgrain 就封顶一半（不是写死 tea）',
    !!b && Math.abs(b.score - FULL / 2) < 1e-9, b ? `${b.score}` : '—');
}

console.log(`\nPASS ${pass}  FAIL ${fails.length}`);
if (fails.length) {
  for (const f of fails) console.log('  ✗ ' + f);
  process.exitCode = 1;
}
