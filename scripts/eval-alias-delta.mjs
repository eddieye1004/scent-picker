/* 别名增量评估：用已有缓存做离线重放，零 API 成本

   为什么不再打接口：
     前两轮验证都踩了同一个坑 —— 把品牌/别名拼进查询词，召回直接掉到 0
     （`taobaoQueryVariants` 注释里已写明：`Yves Saint Laurent Libre` 无结果，
     `Libre` 有结果）。所以「用查询结果验证别名」这条路本身就是错的。

   正确做法：
     查询词不变（纯香名，召回最好），只比较「旧别名表 vs 新别名表」下
     `scoreMatch` 的 accept 数。别名只影响判据侧的 brandHit，
     这是一种数据契约，不是猜测。

   数据来源：data/.cache/union-api.json
     360 个 keyword，每个 { keyword, candidates[], raw }
     candidates[i] 有 title / categoryText / itemId / clickUrl
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreMatch } from './lib/union-api.mjs';
import { BRAND_ALIAS_ADD } from './lib/brand-alias-add.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/.cache/union-api.json'), 'utf8'));
const oldAliases = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/brand-aliases.json'), 'utf8'));
const perfumesRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8'));
const perfumes = perfumesRaw.perfumes || perfumesRaw;
const byId = new Map(perfumes.map((p) => [p.id, p]));

/* 合并：旧表 + 新表（新表只补，不覆盖已有的键） */
const newAliases = { ...oldAliases };
let addedKeys = 0, addedNames = 0;
for (const [brand, list] of Object.entries(BRAND_ALIAS_ADD)) {
  const cur = newAliases[brand] || [];
  const merged = [...new Set([...cur, ...list])];
  if (merged.length > cur.length) addedKeys++;
  addedNames += merged.length - cur.length;
  newAliases[brand] = merged;
}

/* 缓存 key 形如 taobao:ysl-libre:yves saint laurent libre
   末段是查询词；要把 keyword 对回香水 id。fetch-products 的键里有 id 段。 */
function idFromCacheKey(k) {
  const parts = k.split(':');
  return parts.length >= 3 ? parts[1] : null;
}

const rows = [];
for (const [key, node] of Object.entries(cache)) {
  const id = idFromCacheKey(key);
  const p = id ? byId.get(id) : null;
  if (!p) continue;
  for (const c of node.candidates || []) {
    const a = scoreMatch(p, c.title, oldAliases, c.categoryText);
    const b = scoreMatch(p, c.title, newAliases, c.categoryText);
    if (!a.accept && b.accept) {
      rows.push({ id, brand: p.brand, name: p.name, title: c.title, itemId: c.itemId,
        oldReason: a.reason, newCover: b.nameCover });
    }
  }
}

/* 每瓶最多算一次"新增命中"（同一瓶多个候选命中，只要有一个就够） */
const bottles = new Map();
for (const r of rows) if (!bottles.has(r.id)) bottles.set(r.id, r);

console.log(`=== 别名增量（离线重放，${Object.keys(cache).length} 组关键词）===`);
console.log(`旧表品牌数 ${Object.keys(oldAliases).length} / 新表 ${Object.keys(newAliases).length}（补 ${addedKeys} 个品牌，${addedNames} 条别名）`);
console.log(`新增 accept 候选 ${rows.length} 条，涉及 ${bottles.size} 瓶\n`);

const byBrand = {};
for (const r of bottles.values()) (byBrand[r.brand] = byBrand[r.brand] || []).push(r);
for (const [brand, list] of Object.entries(byBrand).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${brand.padEnd(30)} +${list.length}`);
  for (const r of list.slice(0, 3)) {
    console.log(`    ${r.name.slice(0, 26).padEnd(28)} cover=${r.newCover}  ${r.title.slice(0, 50)}`);
  }
}

/* 反向守卫：新别名不该让原本 accept 的变 reject，也不该让别的品牌的候选被误收 */
let regressed = 0, crossBrand = 0;
for (const [key, node] of Object.entries(cache)) {
  const id = idFromCacheKey(key);
  const p = id ? byId.get(id) : null;
  if (!p) continue;
  for (const c of node.candidates || []) {
    const a = scoreMatch(p, c.title, oldAliases, c.categoryText);
    const b = scoreMatch(p, c.title, newAliases, c.categoryText);
    if (a.accept && !b.accept) { regressed++; console.log('⚠ 回归:', p.id, c.title.slice(0, 50)); }
  }
}
console.log(`\n回归（原 accept 变 reject）：${regressed}`);

fs.writeFileSync(path.join(ROOT, 'data/.cache/alias-delta.json'), JSON.stringify({
  addedBrands: addedKeys, addedAliases: addedNames,
  newAccepted: rows.length, bottlesGained: bottles.size, regressed,
  examples: [...bottles.values()].map((r) => ({ id: r.id, brand: r.brand, title: r.title.slice(0, 90), old: r.oldReason })),
}, null, 2));
console.log('明细 → data/.cache/alias-delta.json');
