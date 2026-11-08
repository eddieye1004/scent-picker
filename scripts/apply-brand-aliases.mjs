/* 把 `brand-alias-add.mjs` 里验证过的别名并进 data/brand-aliases.json

   为什么需要这一步：`scripts/merge-product-candidates.mjs:96` 读的是
   `data/brand-aliases.json`，而候选表 `lib/brand-alias-add.mjs` 只是一份提案文件，
   不进这张表就一点作用都没有（本轮实测：只改提案文件，覆盖率一动不动）。

   增量已由 `eval-alias-delta.mjs` 离线重放验证：新增 accept 60 条 / 21 瓶，回归 0。
   所以这里只做合并，不做判断 —— 判断在 eval 里做过了。

   幂等：已存在的别名不重复追加。
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND_ALIAS_ADD } from './lib/brand-alias-add.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data/brand-aliases.json');

const table = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let addedBrands = 0;
let addedAliases = 0;

for (const [brand, list] of Object.entries(BRAND_ALIAS_ADD)) {
  const cur = Array.isArray(table[brand]) ? table[brand] : null;
  if (!cur) {
    table[brand] = [...list];
    addedBrands++;
    addedAliases += list.length;
    continue;
  }
  const seen = new Set(cur.map((s) => s.toLowerCase()));
  for (const a of list) {
    if (seen.has(a.toLowerCase())) continue;
    cur.push(a);
    seen.add(a.toLowerCase());
    addedAliases++;
  }
}

/* 按品牌名排序，让 diff 可读（_readme 之类的下划线键排在最前） */
const sorted = {};
for (const k of Object.keys(table).sort((a, b) => {
  if (a.startsWith('_') !== b.startsWith('_')) return a.startsWith('_') ? -1 : 1;
  return a.localeCompare(b);
})) sorted[k] = table[k];

fs.writeFileSync(FILE, JSON.stringify(sorted, null, 2) + '\n');
console.log(`新增品牌 ${addedBrands} 个 / 别名 ${addedAliases} 条；表内共 ${Object.keys(sorted).filter((k) => !k.startsWith('_')).length} 个品牌`);
