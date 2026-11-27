/* test-note-zh.mjs — 香调中文翻译表覆盖率与洁净度
 *
 * 用动态键集合而不是写死总数：任务书写的名数与实测去重数不一致，
 * 写死数字会让数据一更新就假红。真正要守的是三条代数性质：
 *   ① 译名表 ∪ 待审表 = 全库香调名集合（覆盖率 100%）
 *   ② 两表不相交（一条香调不许既"已译"又"待审"）
 *   ③ 译名都是纯中文、待审都为空值（不许蒙混过关）
 * 这样即使香库增减，测试也永远反映真实覆盖情况。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const perfumes = readJson('data/perfumes.json').perfumes;
const allNotes = new Set();
for (const p of perfumes) {
  for (const k of ['top', 'heart', 'base']) {
    if (Array.isArray(p[k])) p[k].forEach((x) => allNotes.add(String(x)));
  }
}

const zh = readJson('data/note-zh.json');
const pending = readJson('data/note-zh.pending.json');
const zhKeys = new Set(Object.keys(zh));
const pendingKeys = new Set(Object.keys(pending));

let pass = 0;
const fails = [];
const ok = (name, cond, detail) => cond ? pass++ : fails.push(name + (detail ? ' :: ' + detail : ''));

ok('香库非空', allNotes.size > 0, String(allNotes.size));
ok('译名表 ∪ 待审表 = 全库 且两表不相交（动态键集合）',
  zhKeys.size + pendingKeys.size === allNotes.size
  && [...allNotes].every((n) => zhKeys.has(n) || pendingKeys.has(n))
  && [...zhKeys].every((n) => allNotes.has(n))
  && [...pendingKeys].every((n) => allNotes.has(n))
  && [...zhKeys].every((n) => !pendingKeys.has(n)),
  '库 ' + allNotes.size + ' / 译名 ' + zhKeys.size + ' / 待审 ' + pendingKeys.size);

const notChinese = Object.entries(zh).filter(([, v]) => !/^[\u4e00-\u9fa5]+$/.test(String(v)));
ok('每条译名都是纯中文', notChinese.length === 0, notChinese.map(([k, v]) => k + '=' + v).join(', '));

const notEmptyPending = Object.entries(pending).filter(([, v]) => String(v ?? '') !== '');
ok('待审条目值一律留空（不藏机翻）', notEmptyPending.length === 0, notEmptyPending.map(([k]) => k).join(', '));

const badZh = Object.entries(zh).filter(([k, v]) => /[a-z]/i.test(k) === false || String(v).length === 0);
ok('译名表键为英文原名、值为非空中文', badZh.length === 0, badZh.map(([k]) => k).join(', '));

console.log('\n===== 香调翻译表覆盖测试 =====');
console.log('香调总数 ' + allNotes.size + ' | 已译 ' + zhKeys.size + ' | 待审 ' + pendingKeys.size);
console.log('PASS ' + pass + '  FAIL ' + fails.length);
fails.forEach((f) => console.log('  ✗ ' + f));
process.exitCode = fails.length ? 1 : 0;
