/**
 * build-data.js — 把 Scento 公开数据集加工成本项目的结构化香水库
 *
 * 输入：data/source/perfumes.upstream.jsonl
 *       ↑ 上游 https://github.com/Scento-com/perfume-dataset 的 perfumes.jsonl 原件
 *       ↑ 已校验与上游逐字节一致（git blob sha 8c745960a9bd7796bce68518e82f19ff17eaaaf1，1,124,827 bytes）
 *       ↑ 该文件以 CC BY 4.0 公开发布，可再分发
 *
 * 合规原则（见 docs/COMPLIANCE.md）：
 *   1. 只取事实性字段：品牌、香名、浓度、前/中/后调名称、香调家族、季节、时段、香评人
 *   2. 丢弃 description（Scento 撰写的描述性文字，属表达性内容，不二次分发）
 *   3. 保留 url 指向原站，标注 CC BY 4.0 归属
 *   4. 只保留三层香调齐全的行（否则无法兑现"前中后调"承诺）
 *
 * 用法：node scripts/build-data.js [--limit 200]
 *
 * 注意：本脚本不含网络请求。要更新上游数据，手动下载 perfumes.jsonl 覆盖
 *      data/source/perfumes.upstream.jsonl 即可（步骤见 README 的"更新数据"）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'source', 'perfumes.upstream.jsonl');
const TAXONOMY = path.join(ROOT, 'data', 'taxonomy.json');
const OUT = path.join(ROOT, 'data', 'perfumes.json');
const REJECTS = path.join(ROOT, 'data', 'perfumes.rejected.json');

const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i > -1 ? parseInt(process.argv[i + 1], 10) : 200;
})();

function readJsonl(p) {
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l, idx) => {
    try { return JSON.parse(l); }
    catch (e) { throw new Error(`raw line ${idx + 1} 不是合法 JSON: ${e.message}`); }
  });
}

function main() {
  if (!fs.existsSync(RAW)) {
    console.error(
    `[FATAL] 缺少上游数据 ${RAW}\n` +
    `请从 https://github.com/Scento-com/perfume-dataset 下载 perfumes.jsonl，\n` +
    `另存为 data/source/perfumes.upstream.jsonl 后重跑。\n` +
    `校验：git hash-object 应为 8c745960a9bd7796bce68518e82f19ff17eaaaf1`
  );
    process.exit(1);
  }

  const taxonomy = JSON.parse(fs.readFileSync(TAXONOMY, 'utf8'));
  const familyMap = Object.fromEntries(
    taxonomy.sourceFamilyMap.entries.map((e) => [e.source, e.targets])
  );
  const longevityOf = (conc) => taxonomy.concentrationLongevity.map[conc] ?? null;

  const rows = readJsonl(RAW);
  const rejected = [];
  const accepted = [];

  for (const r of rows) {
    const reasons = [];

    const pyramidOk =
      Array.isArray(r.top_notes) && r.top_notes.length > 0 &&
      Array.isArray(r.heart_notes) && r.heart_notes.length > 0 &&
      Array.isArray(r.base_notes) && r.base_notes.length > 0;
    if (!pyramidOk) reasons.push('missing_pyramid');

    if (!r.name || !r.house) reasons.push('missing_identity');

    const targets = familyMap[r.family];
    if (!targets) reasons.push(`unmapped_family:${r.family || 'null'}`);
    const targetsSecondary = r.secondary_family ? familyMap[r.secondary_family] : null;

    if (reasons.length) {
      rejected.push({ id: r.id, name: r.name, house: r.house, reasons });
      continue;
    }

    const concentration = r.concentration || null;
    // 主家族权重 1.0；次家族按 0.5 折算合并（取较大值，不叠加）
    const merged = {};
    for (const [f, w] of Object.entries(targets)) merged[f] = Math.max(merged[f] || 0, w);
    if (targetsSecondary) {
      for (const [f, w] of Object.entries(targetsSecondary)) {
        merged[f] = Math.max(merged[f] || 0, w * 0.5);
      }
    }
    accepted.push({
      id: r.id,
      brand: r.house,
      name: r.name,
      year: r.year ?? null,
      concentration,
      concentrationLabelZh: CONC_ZH[concentration] || null,
      familySource: r.family,
      familySourceSecondary: r.secondary_family || null,
      families: merged,
      character: Array.isArray(r.character) ? r.character : [],
      seasons: Array.isArray(r.seasons) ? r.seasons : [],
      timesOfDay: Array.isArray(r.times_of_day) ? r.times_of_day : [],
      top: r.top_notes,
      heart: r.heart_notes,
      base: r.base_notes,
      notesAll: Array.isArray(r.notes) ? r.notes : [],
      // 推断字段，UI 必须标注
      longevityInferred: longevityOf(concentration),
      popularityRank: r.popularity_rank ?? null,
      sourceUrl: r.url,
      attribution: 'Scento — https://www.scento.com/perfume-database (CC BY 4.0)',
    });
  }

  // 按知名度排序取前 N（popularity_rank 1 = 最知名；null 排最后但仍参与）
  accepted.sort((a, b) => {
    const ra = a.popularityRank ?? Number.MAX_SAFE_INTEGER;
    const rb = b.popularityRank ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.id.localeCompare(b.id);
  });

  // ---- 分层抽样：先保证每个家族的最小配额，剩下按知名度补足 ----
  // 理由：纯按 popularity 排序会让 gourmand / citrus 几乎没货，前端选"甜香"就空结果。
  const MIN_PER_FAMILY = Math.max(12, Math.floor(LIMIT / taxonomy.families.length / 2));
  const primaryOf = (p) => {
    // 主家族 = 权重最高的那个
    let best = null, bw = -1;
    for (const [f, w] of Object.entries(p.families)) if (w > bw) { bw = w; best = f; }
    return best;
  };
  accepted.forEach((p) => { p._primary = primaryOf(p); });

  const buckets = {};
  for (const f of taxonomy.families) buckets[f.id] = [];
  for (const p of accepted) {
    if (buckets[p._primary]) buckets[p._primary].push(p);
  }

  const chosenIds = new Set();
  const pickedArr = [];
  for (const f of taxonomy.families) {
    const b = buckets[f.id] || [];
    for (const p of b.slice(0, MIN_PER_FAMILY)) {
      if (!chosenIds.has(p.id)) { chosenIds.add(p.id); pickedArr.push(p); }
    }
  }
  for (const p of accepted) {
    if (pickedArr.length >= LIMIT) break;
    if (!chosenIds.has(p.id)) { chosenIds.add(p.id); pickedArr.push(p); }
  }
  // 最终再按知名度排序，输出稳定
  pickedArr.sort((a, b) => {
    const ra = a.popularityRank ?? Number.MAX_SAFE_INTEGER;
    const rb = b.popularityRank ?? Number.MAX_SAFE_INTEGER;
    return ra !== rb ? ra - rb : a.id.localeCompare(b.id);
  });
  const picked = pickedArr.slice(0, LIMIT);
  picked.forEach((p) => { delete p._primary; });

  // 家族覆盖度统计（用于验证 200 瓶是否每个家族都有货）
  const coverage = {};
  for (const f of taxonomy.families) coverage[f.id] = 0;
  for (const p of picked) {
    for (const [fam, w] of Object.entries(p.families)) {
      if (w >= 0.5 && coverage[fam] !== undefined) coverage[fam]++;
    }
  }

  const out = {
    meta: {
      version: '1.0.0',
      builtAt: new Date().toISOString(),
      count: picked.length,
      sourceName: 'Scento Perfume Database',
      sourceUrl: 'https://www.scento.com/perfume-database',
      sourceRepo: 'https://github.com/Scento-com/perfume-dataset',
      sourceSnapshot: '2026-10-21',
      license: 'CC BY 4.0',
      attribution: 'Scento — https://www.scento.com/perfume-database',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      exclusions: [
        '未收录 description 原文（第三方撰写的描述性内容）',
        '未收录未满三层香调的条目',
        'longevityInferred 为按浓度推断，非数据源字段',
      ],
      familyCoverage: coverage,
    },
    perfumes: picked,
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
  fs.writeFileSync(REJECTS, JSON.stringify({
    count: rejected.length,
    reasons: rejected.reduce((m, r) => {
      r.reasons.forEach((x) => { m[x] = (m[x] || 0) + 1; });
      return m;
    }, {}),
    sample: rejected.slice(0, 20),
  }, null, 2) + '\n', 'utf8');

  console.log(`✅ 原始 ${rows.length} 条 → 合格 ${accepted.length} 条 → 入库 ${picked.length} 条`);
  console.log(`   淘汰 ${rejected.length} 条：${JSON.stringify(
    rejected.reduce((m, r) => { r.reasons.forEach((x) => { m[x] = (m[x] || 0) + 1; }); return m; }, {})
  )}`);
  console.log(`   家族覆盖：${JSON.stringify(coverage)}`);
  console.log(`   输出：${OUT}`);
}

const CONC_ZH = {
  'extrait': '香精',
  'parfum': '香水',
  'elixir': '浓缩香精',
  'eau-de-parfum': '淡香精 EDP',
  'eau-de-toilette': '淡香水 EDT',
  'eau-de-cologne': '古龙水 EDC',
};

main();
