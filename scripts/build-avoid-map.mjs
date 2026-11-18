/**
 * build-avoid-map.mjs — 生成「元素 → 场景句 → 所属香型」映射表交付物
 *
 * 来源是 src/avoid-map.js（唯一事实源），不在这里另抄一份场景句。
 * 产物 data/avoid-scenarios.json 有两张表：
 *   scenarios —— 每条场景句一行（id / 场景句 / 提示 / 所属香型 / 元素列表 / 标本图）；
 *   elements  —— 每个元素一行（元素 en / 元素中文 / 它属于哪句场景 / 所属香型），
 *               这就是任务要的那张「元素→场景句→所属香型」对照表。
 * 另附三条硬规则用到的两张关系表（对立 / 相邻易混）与两个阈值，便于核对。
 *
 * 用法：node scripts/build-avoid-map.mjs
 * 校验：node scripts/build-avoid-map.mjs --check（产物与源不一致则退出码 1）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AVOID_SCENARIOS, OPPOSITE_FAMILY, CONFUSABLE_FAMILY } from '../src/avoid-map.js';
import { AVOID_MIN_SIDE, AVOID_MAX_CARDS } from '../src/avoid.js';
import { normNote, aliasesOf } from '../src/notes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));

const familyZh = Object.fromEntries(tax.families.map((f) => [f.id, f.zh]));

/* 元素中文名：按 normNote(en) + 别名查 noteIndex。查不到就退回 en 原名
   （marine notes / green tea 这类在 noteIndex 里没有独立条目）。 */
const zhOfNote = new Map();
for (const e of tax.noteIndex.entries) {
  zhOfNote.set(normNote(e.en), e.zh);
  for (const a of aliasesOf(e)) if (!zhOfNote.has(a)) zhOfNote.set(a, e.zh);
}

const scenarios = AVOID_SCENARIOS.map((d) => ({
  id: d.id,
  scenario: d.zh,
  hint: d.hint,
  family: d.family,
  familyZh: familyZh[d.family] || d.family,
  notes: d.notes,
  specimen: d.specimen,
}));

const elements = [];
for (const d of AVOID_SCENARIOS) {
  for (const en of d.notes) {
    elements.push({
      note: en,
      noteZh: zhOfNote.get(normNote(en)) || en,
      scenario: d.zh,
      scenarioId: d.id,
      family: d.family,
      familyZh: familyZh[d.family] || d.family,
    });
  }
}

const out = {
  version: '1.0.0',
  generatedFrom: 'src/avoid-map.js',
  note: '元素→场景句→所属香型。屏上只有场景句（scenario），元素 en 名只活在映射里交给引擎。',
  rules: {
    ownCore: '所选小类自己的核心元素不问',
    opposite: '与所选方向最对立香型的元素不问',
    fuzzy: '只问同时高频出现在相邻易混香型的模糊带元素',
    minSide: AVOID_MIN_SIDE,
    maxCards: AVOID_MAX_CARDS,
    oppositeFamily: OPPOSITE_FAMILY,
    confusableFamily: CONFUSABLE_FAMILY,
  },
  scenarios,
  elements,
};

const json = JSON.stringify(out, null, 2) + '\n';
const outPath = path.join(ROOT, 'data/avoid-scenarios.json');

if (process.argv.includes('--check')) {
  const cur = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
  const ok = cur === json;
  console.log(ok
    ? `✓ data/avoid-scenarios.json 与源一致（${scenarios.length} 场景 / ${elements.length} 元素）`
    : '✗ data/avoid-scenarios.json 与 src/avoid-map.js 不同步，请重跑 build-avoid-map.mjs');
  process.exit(ok ? 0 : 1);
}

fs.writeFileSync(outPath, json);
console.log(`data/avoid-scenarios.json 已生成：${scenarios.length} 条场景 / ${elements.length} 个元素`);
