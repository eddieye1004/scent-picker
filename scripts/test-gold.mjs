/**
 * test-gold.mjs — 金标准命中率（CONTROL.md §3 第 1 步）
 *
 * 每个画像 = 一组问卷答案 + 3–5 瓶「人判定推对了」的答案。
 * 断言：top3 里命中 ≥ 2 瓶（MAJORITY 模式，默认），或 top1 命中（STRICT 模式）。
 *
 * 判据来源：docs/GOLD-STANDARD-FINAL.md。
 * 金标准答案是**按原始字段（families / character / notesAll / 季节时段）人工判定**的，
 * 没有跑 recommend() 看谁排前 —— 那样等于用引擎定义正确答案，命中率恒为 100%。
 *
 * 用法:
 *   node scripts/test-gold.mjs            # 断言 + 汇总
 *   node scripts/test-gold.mjs --report   # 只打印排名明细，不做断言（调引擎时看这个）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recommend } from '../src/scoring.js';
import { PORTRAITS } from './lib/gold-portraits.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8'));
const TAX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
const perfumes = DATA.perfumes;
const byId = new Map(perfumes.map((p) => [p.id, p]));

const REPORT = process.argv.includes('--report');

/* 回归地板（不是目标）。
 * 引擎现在只有 16.7%，把它当"必须全过"的断言，等于每轮都红、没人会跑。
 * 所以这里只守"不许比已记录基线更差"：改动后若低于地板就红，
 * 高于地板时打印 delta，由人决定要不要把地板抬上去。
 * 地板值必须与 docs/GOLD-STANDARD-FINAL.md 的基线表一致。 */
const FLOOR_MAJORITY = 2;   // /12
const FLOOR_STRICT = 4;     // /12

/* ---------------------------------------------------------------------------
 * 12 个画像。每条 gold 都在池内，且经过 docs/GOLD-STANDARD-FINAL.md 的判定。
 * answers 用的键与 app.js 的 state.answers 同名，可直接被 buildProfile 消费。
 * ------------------------------------------------------------------------- */

/* ------------------------------------------------------------------------- */

let pass = 0;
const failures = [];
const rows = [];

for (const port of PORTRAITS) {
  for (const id of port.gold) {
    if (!byId.has(id)) throw new Error(`${port.id} 的金标准 id 不在香水库里: ${id}`);
  }
  const r = recommend(port.answers, perfumes, TAX, { topN: 5 });
  const top = r.results.map((x) => x.perfume.id);
  const top3 = top.slice(0, 3);
  const hits3 = top3.filter((id) => port.gold.includes(id));
  const top1Hit = port.gold.includes(top[0]);
  const passMajority = hits3.length >= 2;
  const passStrict = top1Hit;

  rows.push({
    id: port.id, title: port.title,
    top5: top, hits3, top1Hit, passMajority, passStrict,
    gold: port.gold,
  });

  if (REPORT) continue;
  if (passMajority) pass++;
  else failures.push(`${port.id} ${port.title} :: top3=${top3.join(',')} 命中 ${hits3.length} 瓶（需 ≥2）| gold=${port.gold.join(',')}`);
}

/* 汇总 */
const n = PORTRAITS.length;
const majN = rows.filter((x) => x.passMajority).length;
const strictN = rows.filter((x) => x.passStrict).length;

console.log('');
console.log('画像  命中(top3)  top1  top5 排名');
console.log('-'.repeat(96));
for (const x of rows) {
  const mark3 = x.passMajority ? '✓' : '✗';
  console.log(
    `${x.id}  ${mark3} ${String(x.hits3.length)}/3      ${x.top1Hit ? '✓' : '·'}    ` +
      `${x.top5.slice(0, 5).map((id, i) => `${i + 1}.${id}`).join('  ')}`,
  );
}
console.log('-'.repeat(96));
console.log(`MAJORITY（top3 命中 ≥2）: ${majN}/${n} = ${((majN / n) * 100).toFixed(1)}%`);
console.log(`STRICT  （top1 命中）   : ${strictN}/${n} = ${((strictN / n) * 100).toFixed(1)}%`);

if (REPORT) {
  console.log('\n--- 逐画像 gold 是否进入 top5 ---');
  for (const x of rows) {
    const inTop = x.gold.filter((id) => x.top5.includes(id));
    const outTop = x.gold.filter((id) => !x.top5.includes(id));
    console.log(`${x.id}: 进 top5 ${inTop.length}/${x.gold.length}${outTop.length ? ' | 掉出: ' + outTop.join(',') : ''}`);
  }
  process.exit(0);
}

/* 判定按「回归地板」而不是「全画像通过」：
 * 现在的引擎只到 16.7%，若要求 12/12 全过，这条测试从第一天起就是红的，
 * 红久了就没人看 —— 那比没有测试更糟。
 * 地板守的是「这次改动不许让命中率变差」，这也正是 CONTROL.md 要求的
 * 「commit 信息里写明命中率前后值，没有 delta 的打分改动不许合并」。 */
console.log('');
console.log(`地板（不许更差）: MAJORITY ≥ ${FLOOR_MAJORITY}/${n} · STRICT ≥ ${FLOOR_STRICT}/${n}`);

const dMaj = majN - FLOOR_MAJORITY;
const dStr = strictN - FLOOR_STRICT;
const fmt = (d) => (d > 0 ? `+${d}` : d === 0 ? '±0' : `${d}`);

if (failures.length) {
  console.log('');
  console.log('未达 MAJORITY 的画像（用于定位，不单条判死）：');
  for (const f of failures) console.log('  · ' + f);
}

const bad = [];
if (majN < FLOOR_MAJORITY) bad.push(`MAJORITY ${majN} < 地板 ${FLOOR_MAJORITY}（delta ${fmt(dMaj)}）`);
if (strictN < FLOOR_STRICT) bad.push(`STRICT ${strictN} < 地板 ${FLOOR_STRICT}（delta ${fmt(dStr)}）`);

if (bad.length) {
  console.log('');
  for (const b of bad) console.log('  ✗ ' + b);
  console.log(`\nRESULT: FAIL — 命中率低于已记录基线，这次改动把引擎改差了`);
  process.exit(1);
}

console.log('');
console.log(`delta: MAJORITY ${fmt(dMaj)} · STRICT ${fmt(dStr)}${dMaj > 0 || dStr > 0 ? '  ← 有提升，可考虑抬地板' : ''}`);
console.log(`RESULT: PASS ${majN}/${n} = ${((majN / n) * 100).toFixed(1)}%（地板守住了，未退化）`);
/* check-head.mjs 用这行读命中率：格式固定 "GOLD MAJORITY a/12 STRICT b/12"。
   与其它套件不同，这里不报 PASS/FAIL 条数 —— 金标准是命中率而非断言数，
   报成 "PASS 2 FAIL 10" 会让人误读成「十个画像写错了」。 */
console.log(`GOLD MAJORITY ${majN}/${n} STRICT ${strictN}/${n}`);
