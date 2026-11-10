/**
 * audit-gold.mjs — 逐画像核对 GOLD-STANDARD-DRAFT 的候选（只读原始字段，不跑打分）
 *
 * 目的：给「保留 / 划掉 / 替换」提供事实依据，而不是跑一遍 recommend() 看谁排前面
 * （CONTROL.md §3 明令「不许用现行打分规则反推金标准」）。
 *
 * 用法: node scripts/audit-gold.mjs
 * 输出：每个候选的 families / character / 冲突香调命中 / 季节时段 / 浓度，
 *       以及同画像里「被划掉的空位」可用的替代候选（池内 1388 瓶按原始字段筛）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8'));
const perfumes = DATA.perfumes;
const byId = new Map(perfumes.map((p) => [p.id, p]));

/* 每画像：答案意图 + 草稿候选 + 判定用的硬条件（全部来自原始字段） */
const PORTRAITS = [
  {
    id: 'P01', title: '清冷感·办公室男生·怕甜',
    wants: { family: ['woody', 'fresh'], season: null, time: 'day', lowIntensity: true },
    reject: { notes: ['Vanilla'], character: ['sweet'], family: ['gourmand'] },
    candidates: ['creed-aventus', 'mfk-baccarat-rouge-540', 'kilian-angels-share', 'creed-silver-mountain-water', 'mfk-aqua-universalis'],
  },
  {
    id: 'P02', title: '怕晕白花·日常女生',
    wants: { family: ['citrus', 'fresh'], season: null, time: 'day', lowIntensity: null },
    reject: { notes: ['Jasmine', 'Tuberose', 'Orange Blossom'], character: [], family: [] },
    candidates: ['byredo-gypsy-water', 'parfums-de-marly-layton', 'kilian-angels-share', 'frederic-malle-portrait-of-a-lady', 'creed-silver-mountain-water'],
  },
  {
    id: 'P03', title: '温暖约会·秋冬',
    wants: { family: ['amber', 'gourmand'], season: 'winter', time: 'evening', lowIntensity: null },
    reject: { notes: [], character: [], family: [] },
    candidates: ['kilian-angels-share', 'mfk-grand-soir', 'maison-margiela-replica-by-the-fireplace', 'montale-arabians-tonka', 'ysl-la-nuit-de-lhomme'],
  },
  {
    id: 'P04', title: '干净皂感·上课',
    wants: { family: ['fresh', 'floral'], season: null, time: 'day', lowIntensity: true },
    reject: { notes: [], character: ['sweet'], family: ['gourmand'] },
    candidates: ['mfk-aqua-universalis', 'frederic-malle-musc-ravageur', 'jo-malone-wood-sage-and-sea-salt', 'byredo-mojave-ghost', 'byredo-blanche'],
  },
  {
    id: 'P05', title: '运动清爽·夏天白天',
    wants: { family: ['citrus', 'fresh'], season: 'summer', time: 'day', lowIntensity: null },
    reject: { notes: [], character: ['sweet', 'warm'], family: ['gourmand', 'amber'] },
    candidates: ['creed-aventus', 'byredo-gypsy-water', 'parfums-de-marly-layton', 'creed-silver-mountain-water', 'mfk-aqua-universalis'],
  },
  {
    id: 'P06', title: '神秘夜晚',
    wants: { family: ['amber', 'woody'], season: null, time: 'evening', lowIntensity: null },
    reject: { notes: [], character: ['fresh', 'citrusy'], family: ['citrus', 'fresh'] },
    candidates: ['mfk-grand-soir', 'montale-arabians-tonka', 'mfk-oud-satin-mood', 'givenchy-gentleman', 'parfums-de-marly-herod'],
  },
  {
    id: 'P07', title: '甜美不腻·果香花香',
    wants: { family: ['floral'], season: null, time: null, lowIntensity: null },
    reject: { notes: [], character: [], family: ['gourmand'] },
    candidates: ['lancome-idole', 'frederic-malle-carnal-flower', 'salvatore-ferragamo-signorina', 'calvin-klein-euphoria', 'frederic-malle-rose-and-cuir'],
  },
  {
    id: 'P08', title: '正式场合·稳重',
    wants: { family: ['woody'], season: null, time: 'day', lowIntensity: null },
    reject: { notes: [], character: ['sweet'], family: ['gourmand'] },
    candidates: ['creed-aventus', 'mfk-baccarat-rouge-540', 'amouage-reflection-man', 'creed-green-irish-tweed', 'byredo-mojave-ghost'],
  },
  {
    id: 'P09', title: '茶香草本',
    wants: { family: ['fresh'], season: null, time: 'day', lowIntensity: null },
    reject: { notes: [], character: ['sweet', 'creamy'], family: ['gourmand', 'amber'] },
    candidates: ['byredo-gypsy-water', 'parfums-de-marly-layton', 'creed-silver-mountain-water', 'creed-green-irish-tweed', 'jo-malone-wood-sage-and-sea-salt'],
  },
  {
    id: 'P10', title: '皮革感小众',
    wants: { family: ['amber', 'woody'], season: null, time: null, lowIntensity: null },
    reject: { notes: [], character: [], family: [] },
    mustChar: 'leathery',
    candidates: ['jo-malone-peony-and-blush-suede', 'kenzo-kenzo-homme', 'santa-maria-novella-tabacco-toscano', 'profumum-roma-fumidus', 'dolce-gabbana-velvet-tender-oud'],
  },
  {
    id: 'P11', title: '夏日清凉·讨厌琥珀',
    wants: { family: ['citrus'], season: 'summer', time: 'day', lowIntensity: null },
    reject: { notes: [], character: [], family: ['amber'] },
    candidates: ['creed-aventus', 'frederic-malle-portrait-of-a-lady', 'creed-silver-mountain-water', 'jo-malone-english-pear-and-freesia', 'mfk-aqua-universalis'],
  },
  {
    id: 'P12', title: '奶香柔软',
    wants: { family: ['floral', 'gourmand'], season: null, time: null, lowIntensity: null },
    reject: { notes: [], character: [], family: [] },
    mustChar: 'creamy',
    candidates: ['ysl-libre', 'guerlain-mitsouko', 'kilian-love-dont-be-shy', 'amouage-reflection-man', 'kilian-good-girl-gone-bad'],
  },
];

const FAM_ZH = { citrus: '柑橘', floral: '花香', woody: '木质', amber: '琥珀', fresh: '清新', gourmand: '美食' };
const CONC_ZH = { 'eau-de-toilette': 'EDT', 'eau-de-parfum': 'EDP', 'eau-de-cologne': 'EDC', 'extrait': 'Parfum', 'parfum': 'Parfum' };

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, ' ').replace(/\s+/g, ' ').trim();

function hitNotes(p, needles) {
  const hay = p.notesAll.map(norm);
  return needles.filter((n) => hay.some((h) => h.includes(norm(n))));
}

function famList(p) {
  return Object.entries(p.families).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${FAM_ZH[k] || k}${v.toFixed(2)}`);
}

function auditOne(port, id) {
  const p = byId.get(id);
  if (!p) return { id, missing: true };
  const badNotes = hitNotes(p, port.reject.notes || []);
  const wantFams = port.wants.family || [];
  const famHit = wantFams.filter((f) => (p.families[f] || 0) > 0);
  const famMiss = wantFams.filter((f) => !(p.families[f] || 0));
  const rejFamHit = (port.reject.family || []).filter((f) => (p.families[f] || 0) >= 0.5);
  const rejCharHit = (port.reject.character || []).filter((c) => p.character.includes(c));
  const mustCharOk = port.mustChar ? p.character.includes(port.mustChar) : null;
  const seasonOk = port.wants.season ? p.seasons.includes(port.wants.season) : null;
  const timeOk = port.wants.time ? p.timesOfDay.includes(port.wants.time) : null;
  return {
    id, brand: p.brand, name: p.name, fams: famList(p), character: p.character,
    conc: CONC_ZH[p.concentration] || p.concentration,
    longevity: p.longevityInferred,
    badNotes, famHit, famMiss, rejFamHit, rejCharHit, mustCharOk, seasonOk, timeOk,
    pop: p.popularityRank,
  };
}

/* 只在「候选被划掉」时用：按原始字段在池内找替补 */
function suggest(port, exclude, need = 3) {
  const wantFams = port.wants.family || [];
  const out = [];
  for (const p of perfumes) {
    if (exclude.has(p.id)) continue;
    if (port.mustChar && !p.character.includes(port.mustChar)) continue;
    if (hitNotes(p, port.reject.notes || []).length) continue;
    if ((port.reject.family || []).some((f) => (p.families[f] || 0) >= 0.5)) continue;
    if ((port.reject.character || []).some((c) => p.character.includes(c))) continue;
    // 家族：要求主家族落在 wants 里（不是"沾一点"）
    const main = Object.entries(p.families).sort((a, b) => b[1] - a[1])[0][0];
    if (wantFams.length && !wantFams.includes(main)) continue;
    if (port.wants.season && !p.seasons.includes(port.wants.season)) continue;
    if (port.wants.time && !p.timesOfDay.includes(port.wants.time)) continue;
    out.push({ p, main });
  }
  out.sort((a, b) => (a.p.popularityRank ?? 9999) - (b.p.popularityRank ?? 9999));
  return out.slice(0, need);
}

const fmt = (x) => (x === null ? '—' : x === true ? '✓' : x === false ? '✗' : String(x));

for (const port of PORTRAITS) {
  console.log('\n' + '='.repeat(78));
  console.log(`${port.id} ${port.title}`);
  console.log(`  意图: family=${(port.wants.family || []).join('/') || '—'} season=${port.wants.season || '—'} time=${port.wants.time || '—'}${port.mustChar ? ' mustChar=' + port.mustChar : ''}`);
  if (port.reject.notes?.length) console.log(`  忌: 香调 ${port.reject.notes.join(' / ')}`);
  if (port.reject.family?.length) console.log(`  忌: 家族 ${port.reject.family.join(' / ')}  | 忌: 气质 ${(port.reject.character || []).join(' / ') || '—'}`);
  console.log('');
  for (const id of port.candidates) {
    const a = auditOne(port, id);
    if (a.missing) { console.log(`  [缺失] ${id}`); continue; }
    const flags = [];
    if (a.badNotes.length) flags.push(`含忌用香调(${a.badNotes.join(',')})`);
    if (a.rejFamHit.length) flags.push(`沾忌用家族(${a.rejFamHit.join(',')})`);
    if (a.rejCharHit.length) flags.push(`沾忌用气质(${a.rejCharHit.join(',')})`);
    if (a.mustCharOk === false) flags.push(`缺必须气质 ${port.mustChar}`);
    if (a.seasonOk === false) flags.push(`不含该季`);
    if (a.timeOk === false) flags.push(`不含该时段`);
    console.log(`  ${a.id}`);
    console.log(`     ${a.brand} — ${a.name}  [${a.conc} 持香${a.longevity} 热度#${a.pop}]`);
    console.log(`     家族 ${a.fams.join(' ')} | 气质 ${a.character.join(',')}`);
    console.log(`     命中意图家族 ${a.famHit.join('/') || '无'}${a.famMiss.length ? ' | 不含 ' + a.famMiss.join('/') : ''}  季 ${fmt(a.seasonOk)} 时 ${fmt(a.timeOk)}`);
    console.log(`     >>> ${flags.length ? '需划掉：' + flags.join('；') : '无冲突'}`);
  }

  const dead = port.candidates.filter((id) => {
    const a = auditOne(port, id);
    return !a.missing && (a.badNotes.length || a.rejFamHit.length || a.rejCharHit.length || a.mustCharOk === false);
  });
  if (dead.length) {
    console.log(`\n  --- 替补（池内按原始字段筛，排除本画像全部候选）---`);
    const ex = new Set([...port.candidates]);
    for (const s of suggest(port, ex, dead.length + 1)) {
      console.log(`  ${s.p.id}  ${s.p.brand} — ${s.p.name}  [${CONC_ZH[s.p.concentration] || s.p.concentration} #${s.p.popularityRank}]`);
      console.log(`     家族 ${famList(s.p).join(' ')} | 气质 ${s.p.character.join(',')}`);
    }
  }
}
