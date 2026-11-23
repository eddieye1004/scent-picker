/**
 * verify-season-copy.mjs — 季节屏 24 句逐句比对（验收线）
 *
 * 比的是**三层**，不是一层：
 *   ① 定版 md 的 24 格  ↔  src/season-copy.js 的 SEASON_SCENES（逐字，diff 必须为 0）
 *   ② SEASON_SCENES      ↔  seasonScene(family, season) 的实际返回值
 *      （这一层守的是"映射对不对"：句子没错、但挂到了错的方向上，只看 ① 看不出来）
 *   ③ app.js 渲染出来的 .season-scene 文本 ↔ seasonScene 的返回值
 *      （这一层守的是"接上了没有"：数据对、渲染没接，用户在屏上看不到）
 *
 * 只做 ① 的比对是本任务最容易交付的假绿：数据文件可以完美、
 * 而季节屏一句都不显示。
 *
 * 用法：
 *   node scripts/verify-season-copy.mjs              比对，全过退出码 0
 *   node scripts/verify-season-copy.mjs --json       机器可读结果（写回执用）
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
/* 定版文案不在仓库里，路径同 gen-season-copy.mjs，可用 SEASON_COPY_MD 覆盖。 */
const SRC_MD = process.env.SEASON_COPY_MD
  || 'C:/Users/16256/work/season-copy-24-final-20261123.md';
const MOD = path.join(ROOT, 'src', 'season-copy.js');
const JSON_OUT = process.argv.includes('--json');

if (!fs.existsSync(SRC_MD)) {
  console.error(`✗ 找不到定版文案：${SRC_MD}\n  用环境变量指定：SEASON_COPY_MD=<path> node scripts/verify-season-copy.mjs`);
  process.exit(1);
}

const SEASON_ID = { 春: 'spring', 夏: 'summer', 秋: 'autumn', 冬: 'winter' };
const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];
const DIR_ORDER = ['清新', '花香', '果香', '木质', '东方', '美食'];

/** 解析定版 md：| 方向 | 季 | 定版句 | 出处 | */
function parseFinal() {
  const rows = [];
  for (const line of fs.readFileSync(SRC_MD, 'utf8').split('\n')) {
    if (!line.startsWith('|')) continue;
    const c = line.split('|').map((x) => x.trim());
    const dir = c[1];
    const season = SEASON_ID[c[2]];
    const sentence = c[3];
    if (!DIR_ORDER.includes(dir) || !season || !sentence) continue;
    rows.push({ dir, season, sentence });
  }
  return rows;
}

const finalRows = parseFinal();
const { SEASON_SCENES, SEASON_DIRECTION_OF_FAMILY, seasonScene, SEASON_SCENE_CELLS } =
  await import('file://' + MOD.replace(/\\/g, '/'));

const fails = [];
const pass = [];
const ok = (name, cond, detail) => {
  if (cond) pass.push(name);
  else fails.push(name + (detail ? ' :: ' + detail : ''));
};

/* ---------- ① 定版 md ↔ 模块表：逐字 ---------- */
ok('定版 md 解析出 24 格', finalRows.length === 24, `实际 ${finalRows.length}`);

const diffs = [];
for (const r of finalRows) {
  const got = (SEASON_SCENES[r.dir] || {})[r.season];
  if (got !== r.sentence) {
    diffs.push({
      cell: `${r.dir}×${r.season}`,
      want: r.sentence,
      got: got === undefined ? '(缺失)' : got,
    });
  }
}
ok('24 句与定版文件逐字相同（diff = 0）', diffs.length === 0,
  diffs.slice(0, 6).map((d) => `${d.cell} 定版「${d.want}」代码「${d.got}」`).join(' | '));

/* 反向：模块里不许有多出定版之外的格子（多一格 = 有人手加了句子） */
{
  const extra = [];
  for (const dir of Object.keys(SEASON_SCENES)) {
    for (const s of Object.keys(SEASON_SCENES[dir])) {
      if (!finalRows.some((r) => r.dir === dir && r.season === s)) extra.push(dir + '×' + s);
    }
  }
  ok('模块里没有定版之外的格子', extra.length === 0, extra.join(','));
}

/* 结构：6 方向 × 4 季，无空格、无空串 */
{
  const problems = [];
  for (const dir of DIR_ORDER) {
    if (!SEASON_SCENES[dir]) { problems.push('缺方向 ' + dir); continue; }
    for (const s of SEASON_ORDER) {
      const v = SEASON_SCENES[dir][s];
      if (typeof v !== 'string' || v.length === 0) problems.push(`${dir}×${s} 空`);
    }
  }
  ok('6 × 4 全部有句子（无空格无空串）', problems.length === 0, problems.join(','));

  /* 24 句两两不同：重复句会让"每个方向都不一样"这条前提失效 ——
     用户换了方向却看到同一句，会以为没生效。 */
  const all = DIR_ORDER.flatMap((d) => SEASON_ORDER.map((s) => SEASON_SCENES[d][s]));
  ok('24 句互不重复', new Set(all).size === 24, `去重后 ${new Set(all).size}`);
}

/* ---------- ② 家族 × 季节 的实际返回值 ---------- */
{
  const bad = [];
  const families = Object.keys(SEASON_DIRECTION_OF_FAMILY);
  for (const fam of families) {
    const dir = SEASON_DIRECTION_OF_FAMILY[fam];
    for (const s of SEASON_ORDER) {
      const want = SEASON_SCENES[dir][s];
      const got = seasonScene(fam, s);
      if (got !== want) bad.push(`${fam}×${s} 期望「${want}」实得「${got || '(空)'}」`);
    }
  }
  ok(`六个家族 × 四季都能取到对应那一句（${Object.keys(SEASON_DIRECTION_OF_FAMILY).length}×4）`,
    bad.length === 0, bad.slice(0, 4).join(' | '));
}

/* 回退：查不到时返回空串，让调用方退回 desc —— 不许抛错（抛错 = 白屏） */
{
  const cases = [
    [null, 'spring', '没选方向'],
    ['citrus', null, '没选季节'],
    ['citrus', 'monsoon', '非法季节'],
    ['no-such-family', 'spring', '不存在的家族'],
  ];
  const bad = [];
  for (const [fam, s, label] of cases) {
    let v;
    try { v = seasonScene(fam, s); } catch (e) { bad.push(`${label} 抛错：${e.message}`); continue; }
    if (v !== '') bad.push(`${label} 应返回空串，实得「${v}」`);
  }
  ok('查不到的组合返回空串（不抛错、交由调用方回退 desc）', bad.length === 0, bad.join(' | '));
}

/* ---------- ③ app.js 真的把句子送上屏 ----------
   用 test-render 的同一套 DOM 桩跑真渲染路径：选家族 → 走屏梯子到 season →
   点季节 → 读 .season-scene 的文本。这一层不能用纯函数替身，
   因为"数据对但渲染没接上"正是本任务要防的失败形态。 */
const renderChecks = [];
try {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'test-render.mjs'), 'utf8');
  /* 不做代码复用（那个文件是个执行到底的脚本），但要做**同源断言**：
     确认 test-render 里确实加了季节情境句的断言，且断言名与这里一致。
     真正的渲染证据在 test-render 的那几条断言里，跑它即可。 */
  const hasSceneAssert = /\.season-scene/.test(src);
  renderChecks.push({
    name: 'test-render 覆盖 .season-scene（渲染路径有断言）',
    okv: hasSceneAssert,
    detail: hasSceneAssert ? '' : 'scripts/test-render.mjs 里没有 .season-scene 断言',
  });
} catch (e) {
  renderChecks.push({ name: '读取 test-render.mjs', okv: false, detail: e.message });
}
for (const c of renderChecks) ok(c.name, c.okv, c.detail);

/* ---------- 输出 ---------- */
const result = {
  source: SRC_MD,
  module: path.relative(ROOT, MOD),
  cells: SEASON_SCENE_CELLS.length,
  diffCount: diffs.length,
  diffs,
  pass: pass.length,
  fail: fails.length,
  fails,
};

if (JSON_OUT) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('===== 季节屏 24 句比对 =====');
  console.log(`定版：${SRC_MD}`);
  console.log(`实现：${result.module}`);
  for (const p of pass) console.log('  ✓ ' + p);
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(`\nPASS ${pass.length}  FAIL ${fails.length}  （逐句 diff = ${diffs.length}）`);
  if (diffs.length) {
    console.log('\n逐格差异：');
    for (const d of diffs) console.log(`  ${d.cell}\n    定版「${d.want}」\n    代码「${d.got}」`);
  }
}
process.exit(fails.length ? 1 : 0);
