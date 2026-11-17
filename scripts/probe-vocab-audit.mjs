/**
 * 词表对齐审计：taxonomy 里每个 note 字符串，在 perfumes.json 里到底出现几次。
 *
 * 为什么需要它：taxonomy 的 notes / representativeNotes 是**人手写的**，
 * perfumes.json 的 notesAll 是**源站抓来的**。两边写法不一致时（cedar vs Cedarwood、
 * marine notes vs Sea Notes、sea salt 压根没人写），那条 note 在引擎里就是死链：
 * 用户点了、界面没反应，或者小类满分线永远够不到。
 *
 * 判据用引擎自己的那一套（notes.js 的 token 子序列 + noteIndex 别名），
 * 不用 includes —— 后者会把 Tuberose 里的 rose 算成玫瑰。
 *
 * 用法：node scripts/probe-vocab-audit.mjs [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { tokenize, matchesNote, aliasesOf, normNote, isSurfaceOf } from '../src/notes.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const taxonomy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));
const rawPerfumes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8'));
const perfumes = Array.isArray(rawPerfumes) ? rawPerfumes : rawPerfumes.perfumes;

// 每个香调条目 → 别名（与 scoring.js 的 noteEntryOf 同一构造方式）
const entryOf = new Map();
for (const e of taxonomy.noteIndex.entries) {
  entryOf.set(normNote(e.en), e);
  for (const a of aliasesOf(e)) entryOf.set(a, e);
}

const tokensCache = perfumes.map((p) => (p.notesAll || []).map((x) => tokenize(x)));

/** 一个 taxonomy note 字符串命中多少瓶：优先走 noteIndex 别名，否则退回 token 子序列 */
function countOf(note) {
  const entry = entryOf.get(normNote(note));
  let n = 0;
  if (entry) {
    for (const toks of tokensCache) if (toks.some((t) => matchesNote(entry, null, t))) n += 1;
  } else {
    for (const toks of tokensCache) if (toks.some((t) => isSurfaceOf(note, t.join(' ')))) n += 1;
  }
  return n;
}

/* 库里真实词表：归一化后的 surface → 瓶数。给"换成库内实际写法"提供候选。 */
const surfaceCount = new Map();
for (const p of perfumes) {
  for (const s of p.notesAll || []) {
    const k = normNote(s);
    if (!k) continue;
    surfaceCount.set(k, (surfaceCount.get(k) || 0) + 1);
  }
}

/* 字面命中：只认完全相同的 surface（归一化后）。
   与 countOf 的"引擎命中"分开报，是因为两者会给出相反的结论，
   而"该改成什么写法"要看的是字面值 —— 引擎命中 58 的 `marine notes`
   在库里一个字面都没有，它靠的是 noteIndex 的别名表兜住的。 */
const literalOf = (note) => surfaceCount.get(normNote(note)) || 0;

const rows = [];
const seen = new Set();
function add(where, kind, note) {
  const key = kind + '\u0000' + normNote(note);
  if (seen.has(key)) return;
  seen.add(key);
  rows.push({ where, kind, note, hits: countOf(note), literal: literalOf(note) });
}

for (const f of taxonomy.families) {
  for (const n of f.representativeNotes || []) add(`${f.id}.representativeNotes`, 'family', n);
  for (const s of f.subfamilies || []) {
    for (const n of s.notes || []) add(`${f.id}/${s.id}.notes`, 'subfamily', n);
    for (const n of s.coreNotes || []) add(`${f.id}/${s.id}.coreNotes`, 'coreNotes', n);
  }
}

const dead = rows.filter((r) => r.hits === 0);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ total: rows.length, dead, all: rows }, null, 2));
} else {
  /* 三级判据，三种修法：
     ① 字面 0 且引擎 0  → 死链，必须换写法或删
     ② 字面 0 但引擎 >0  → 靠 noteIndex 别名兜住，能跑但"按字面核对"过不了；
                          建议换成库里实际写法（别名表是兜底，不该当主路径）
     ③ 字面 >0 但引擎 0  → taxonomy 写了、库里有、引擎却不认（别名表缺），真 bug */
  const deadLink = rows.filter((r) => r.literal === 0 && r.hits === 0);
  const aliasOnly = rows.filter((r) => r.literal === 0 && r.hits > 0);
  const engineGap = rows.filter((r) => r.literal > 0 && r.hits === 0);

  console.log(`香调字符串 ${rows.length} 个（去重后）`);
  console.log(`  ① 死链（字面 0 / 引擎 0）：${deadLink.length}`);
  console.log(`  ② 仅靠别名（字面 0 / 引擎 ${'>'}0）：${aliasOnly.length}`);
  console.log(`  ③ 引擎缺口（字面 >0 / 引擎 0）：${engineGap.length}`);

  const candOf = (note) => {
    const needles = tokenize(note);
    return [...surfaceCount.entries()]
      .filter(([k]) => needles.some((nd) => nd.length > 3 && k.includes(nd)))
      .sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}(${v})`);
  };
  for (const [label, list] of [['① 死链', deadLink], ['② 仅靠别名', aliasOnly], ['③ 引擎缺口', engineGap]]) {
    if (!list.length) continue;
    console.log(`\n${label}:`);
    for (const r of list) {
      console.log(`  ✗ ${r.note.padEnd(22)} 引擎${String(r.hits).padStart(4)} 字面${String(r.literal).padStart(4)}  ${r.where}`);
      if (r.hits === 0) {
        const c = candOf(r.note);
        if (c.length) console.log(`      候选: ${c.join(', ')}`);
      }
    }
  }
  const low = rows.filter((r) => r.literal > 0 && r.literal < 6).sort((a, b) => a.literal - b.literal);
  if (low.length) {
    console.log(`\n字面低频（1–5 瓶，保留但要知情）：`);
    for (const r of low) console.log(`  · ${r.note.padEnd(22)} 字面${String(r.literal).padStart(3)}  ${r.where}`);
  }
}
