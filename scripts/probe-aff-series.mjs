/* 结构性不可达分析：为什么某些瓶**原则上**不该有直链，而不是"还没搜到"。

   假设（本轮要证伪或证实）：合并系列（同品牌同系列名，多瓶只差一个后缀）
   在淘宝中文标题里只写系列名，不写区分后缀。此时任何一条链接都只有
   1/N 的概率属于对的那一瓶 —— 这种"命中"是噪音，不是覆盖。

   判据（全部可从数据算出，不依赖主观判断）：
     ① 同品牌、同一系列前缀（去品牌、去尾词后的公共前缀）在 perfumes.json 里 >= 3 瓶
     ② 本瓶的后缀词（拉丁）在这 3+ 瓶里不唯一
   两个都成立 → 记为 hard-series。

   只读。用法：node scripts/probe-aff-series.mjs
*/
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const rj = async (p) => JSON.parse(await readFile(path.join(ROOT, p), 'utf8'));

const perfumes = (await rj('data/perfumes.json')).perfumes;
const aff = await rj('data/affiliate-links.json');
const has = new Set(Object.keys(aff.taobao || {}));

const norm = (s) => String(s || '').toLowerCase().replace(/[’‘`´]/g, "'")
  .replace(/[^\p{L}\p{N}']+/gu, ' ').trim();

/* 系列前缀 = 同品牌里，与它共享前 2 个词的其他瓶的数量最多的那个前缀。
   用「前 2 词」而不是最长公共前缀：Armaf "Club de Nuit Intense Man" 的前 2 词
   是 "club de"，够识别系列；再长就会把 "Intense Man" / "Intense Woman" 拆散。 */
const SERIES_PREFIX = 2;
function prefixOf(p) {
  const w = norm(p.name).split(' ').filter(Boolean);
  return w.length > SERIES_PREFIX ? w.slice(0, SERIES_PREFIX).join(' ') : null;
}

const groups = new Map();
for (const p of perfumes) {
  const pre = prefixOf(p);
  if (!pre) continue;
  const k = `${p.brand}||${pre}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(p);
}

const hard = new Map();          // id -> { brand, prefix, size, siblings }
for (const [k, list] of groups) {
  if (list.length < 3) continue;
  const [brand, prefix] = k.split('||');
  for (const p of list) {
    hard.set(p.id, {
      brand, prefix, size: list.length,
      siblings: list.filter((q) => q.id !== p.id).map((q) => q.name),
    });
  }
}

const missing = perfumes.filter((p) => !has.has(p.id));
const missingHard = missing.filter((p) => hard.has(p.id));
const missingSolo = missing.filter((p) => !hard.has(p.id));

console.log(`总瓶数 ${perfumes.length} · 有链 ${perfumes.length - missing.length} · 缺链 ${missing.length}`);
console.log(`\n合并系列（同品牌同系列前缀 >=3 瓶）：${[...groups.values()].filter((l) => l.length >= 3).length} 组，涉及 ${hard.size} 瓶`);
console.log(`  其中缺链 ${missingHard.length}，独占香名（非系列）缺链 ${missingSolo.length}`);

const byGroup = new Map();
for (const p of missingHard) {
  const h = hard.get(p.id);
  const k = `${h.brand}「${h.prefix}」×${h.size}`;
  byGroup.set(k, (byGroup.get(k) || 0) + 1);
}
console.log('\n缺链最多的合并系列（前 20）：');
for (const [k, v] of [...byGroup.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(`  ${String(v).padStart(4)}  ${k}`);
}

const brandOfHard = new Map();
for (const p of missingHard) {
  const b = hard.get(p.id).brand;
  brandOfHard.set(b, (brandOfHard.get(b) || 0) + 1);
}
console.log('\n按品牌（前 12）：');
for (const [b, n] of [...brandOfHard.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(n).padStart(4)}  ${b}`);
}

console.log(`\n结论口径：${missingHard.length} / ${missing.length} 的缺链瓶属于合并系列 ——`);
console.log('这些瓶即便搜到中文标题，标题也只写系列名，无法区分是哪一支；');
console.log('把它记到某一瓶名下等于 1/N 概率的错配，比留空更糟。');
