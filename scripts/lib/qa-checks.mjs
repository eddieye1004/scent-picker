/**
 * qa-checks.mjs — 数据体检的纯函数集合
 *
 * 抽出来的原因：负向测试需要在同一进程内调用这些断言来验证它们真的会失败。
 * 本机沙箱禁止 child_process 的 stdio:'pipe'，子进程方案跑不通。
 *
 * 每个 check 返回 { issues: string[], stats: object }
 * issues 为空 = 通过
 */

/**
 * @param {object} D        perfumes.json 的完整内容
 * @param {object} T        taxonomy.json 的完整内容
 * @param {object} opts
 * @param {string} [opts.outTxt]        perfumes.json 的原始文本（用于正则扫描）
 * @param {number|null} [opts.upstreamLines] 上游原件行数（null = 未提供/不存在）
 * @param {object|null} [opts.upstreamFirst] 上游首条解析对象（用于抽查 description）
 */
export function runChecks(D, T, opts = {}) {
  const issues = [];
  const note = (ok, msg) => { if (!ok) issues.push(msg); };
  const ps = D.perfumes;
  const outTxt = opts.outTxt ?? JSON.stringify(D);
  const upstreamLines = opts.upstreamLines ?? null;
  const upstreamFirst = opts.upstreamFirst ?? null;

  /* 1 结构完整性
     concentration / longevityInferred 是数据源本身缺口（24 瓶没标浓度），
     不是解析 bug —— 这些页面拿不到该字段，而不许编。
     所以允许 null，但缺口要能量化。 */
  const required = ['id', 'brand', 'name', 'familySource', 'families',
    'top', 'heart', 'base', 'notesAll', 'sourceUrl', 'attribution'];
  for (const p of ps) {
    for (const k of required) {
      note(p[k] !== undefined && p[k] !== null, `${p.id} 缺字段 ${k}`);
    }
  }

  /* 1b 允许为 null 的字段：只统计，缺口过大报警 */
  const noConc = ps.filter((p) => p.concentration == null);
  const noLong = ps.filter((p) => p.longevityInferred == null);
  note(noConc.length / ps.length <= 0.2,
    `浓度缺口过大: ${noConc.length}/${ps.length} (>20%)`);
  note(noLong.length === noConc.length,
    `持香缺口(${noLong.length}) 与浓度缺口(${noConc.length}) 不一致，说明推断逻辑没统一跳过`);

  /* 2 唯一性 */
  const ids = ps.map((p) => p.id);
  note(new Set(ids).size === ids.length, `id 有重复: ${ids.length - new Set(ids).size} 个`);

  /* 3 三调非空 */
  const emptyPyramid = ps.filter((p) => !p.top.length || !p.heart.length || !p.base.length);
  note(emptyPyramid.length === 0, `三调为空: ${emptyPyramid.map((p) => p.id).join(', ')}`);

  /* 4 名字非空且不是占位符 */
  const badNames = ps.filter((p) => !p.name || !p.name.trim() || /^(n\/?a|unknown|-+)$/i.test(p.name.trim()));
  note(badNames.length === 0, `名字异常: ${badNames.map((p) => p.id).join(', ')}`);

  /* 5 families 权重合法 */
  const validFams = new Set(T.families.map((f) => f.id));
  for (const p of ps) {
    const vals = Object.values(p.families || {});
    note(vals.length > 0, `${p.id} families 为空`);
    note(vals.every((v) => typeof v === 'number' && v >= 0 && v <= 1),
      `${p.id} families 权重越界: ${JSON.stringify(p.families)}`);
    const unknown = Object.keys(p.families || {}).filter((k) => !validFams.has(k));
    note(unknown.length === 0, `${p.id} 出现未知家族: ${unknown.join(',')}`);
  }

  /* 6 家族覆盖：每个家族至少 8 瓶，否则某情绪推不出东西 */
  const reach = Object.fromEntries(T.families.map((f) => [f.id, 0]));
  for (const p of ps) {
    for (const [f, w] of Object.entries(p.families)) {
      if (w >= 0.5) reach[f] = (reach[f] || 0) + 1;
    }
  }
  for (const f of T.families) {
    note(reach[f.id] >= 8, `家族 ${f.zh} 只有 ${reach[f.id]} 瓶可达（要求 >=8）`);
  }

  /* 7 可溯源 */
  const badUrl = ps.filter((p) => !/^https:\/\//.test(String(p.sourceUrl || '')));
  note(badUrl.length === 0, `sourceUrl 异常: ${badUrl.map((p) => p.id).join(', ')}`);
  const badAttr = ps.filter((p) => !String(p.attribution || '').includes('CC BY 4.0'));
  note(badAttr.length === 0, `attribution 缺 CC BY: ${badAttr.map((p) => p.id).join(', ')}`);

  /* 7b 合规硬约束：description 必须为 0
     COMPLIANCE.md 声称"上游 1320 行全部有 description，我们整字段丢弃"。
     这条不能只是文档承诺 —— 破了就是版权问题。
     直接扫原始 JSON 文本，不靠字段列表推断（防将来 rename 绕过）。 */
  note(!/"description"\s*:/.test(outTxt),
    'perfumes.json 出现 description 字段 —— 违反 COMPLIANCE.md 第三节');
  note(!/[A-Za-z][A-Za-z ,'-]{60,}/.test(outTxt),
    'perfumes.json 含 >=60 字符连续英文，疑似残留描述性原文');

  /* 7c 上游原件行数可核对（保证 build-data.js 可复现） */
  if (upstreamLines === null) {
    note(false, '缺少上游原件（data/source/perfumes.upstream.jsonl），build-data.js 无法复现');
  } else {
    note(upstreamLines === 1320, `上游原件行数 ${upstreamLines}，预期 1320`);
    note(upstreamFirst && typeof upstreamFirst.description === 'string' && upstreamFirst.description.length > 0,
      '上游首条无 description，则"丢弃描述"这条无从谈起，需复核数据源');
  }

  /* 7d 字段白名单：白名单外字段要人工过一眼 */
  const ALLOWED = new Set(['id', 'brand', 'name', 'year', 'concentration', 'concentrationLabelZh',
    'familySource', 'familySourceSecondary', 'families', 'character', 'seasons', 'timesOfDay',
    'top', 'heart', 'base', 'notesAll', 'longevityInferred', 'popularityRank', 'sourceUrl', 'attribution']);
  const extra = new Set();
  for (const p of ps) for (const k of Object.keys(p)) if (!ALLOWED.has(k)) extra.add(k);
  note(extra.size === 0, `出现白名单外字段: ${[...extra].join(', ')} —— 需确认是否含表达性内容`);

  /* 8 长尾品牌（避免其实全是 3 个牌子的变体） */
  const brandCount = {};
  for (const p of ps) brandCount[p.brand] = (brandCount[p.brand] || 0) + 1;
  const topBrand = Object.entries(brandCount).sort((a, b) => b[1] - a[1])[0];
  note(topBrand[1] / ps.length < 0.2,
    `单一品牌占比过高: ${topBrand[0]} 占 ${topBrand[1]}/${ps.length}`);

  /* 9 taxonomy 完整性 */
  for (const e of T.emotionMap) {
    note(e.id && e.zh && e.families && e.notes, `情绪 ${e.id} 字段不全`);
    note(Object.keys(e.families).length === 6, `情绪 ${e.zh} 家族向量不是 6 维`);
    note(e.notesZh && Object.keys(e.notesZh).length === e.notes.length,
      `情绪 ${e.zh} notesZh 与 notes 数量不一致`);
  }
  for (const o of T.occasionMap) {
    note(o.id && o.zh && o.families, `场合 ${o.id} 字段不全`);
  }

  /* 10 分布快照 */
  const conc = {};
  for (const p of ps) conc[p.concentration] = (conc[p.concentration] || 0) + 1;
  const srcFam = {};
  for (const p of ps) srcFam[p.familySource] = (srcFam[p.familySource] || 0) + 1;

  return {
    issues,
    stats: {
      count: ps.length,
      brands: Object.keys(brandCount).length,
      reach,
      conc,
      srcFamilyTypes: Object.keys(srcFam).length,
      topBrand,
    },
  };
}
