/* 覆盖率盘点：只读，不改任何文件。

   回答四件事：
     1. 当前 coverage.taobao 的分子到底是不是「不同商品数」——把 taobao 对象的
        key 与 perfumes.json 的 id 逐一对照，并核对 coverage 字符串与实数是否一致。
     2. 缺链的 764 瓶按什么分布（品牌集中度、popularityRank）。
     3. 缺链集合里有多少瓶已经有香名中文译名（fragrance-aliases.json），
        有多少品牌有中文别名（brand-aliases.json）—— 决定降级策略能覆盖谁。
     4. 已有的 624 条里，有多少条是通过「香名译名」拿到的（可判定口径：cache 里
        该 id 的 keyword 恰好等于译名关键词）。

   用法：node scripts/probe-aff-baseline.mjs
*/
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const rj = async (p) => JSON.parse(await readFile(path.join(ROOT, p), 'utf8'));

const perfumes = (await rj('data/perfumes.json')).perfumes;
const aff = await rj('data/affiliate-links.json');
const alias = await rj('data/brand-aliases.json');
const frag = await rj('data/fragrance-aliases.json');
const cand = await rj('data/products.candidates.json');

const ids = new Set(perfumes.map((p) => p.id));
const taobaoKeys = Object.keys(aff.taobao || {});
const taobaoSet = new Set(taobaoKeys);

const unknownIds = taobaoKeys.filter((k) => !ids.has(k));
const missing = perfumes.filter((p) => !taobaoSet.has(p.id));

console.log('===== 1. 覆盖率口径核对 =====');
console.log(`perfumes.json 瓶数            ${perfumes.length}`);
console.log(`taobao 对象 key 数            ${taobaoKeys.length}`);
console.log(`其中不在 perfumes.json 的     ${unknownIds.length}${unknownIds.length ? ' → ' + unknownIds.slice(0, 5).join(', ') : ''}`);
console.log(`coverage.taobao 声称          ${aff.coverage?.taobao}`);
console.log(`coverage.jd 声称              ${aff.coverage?.jd}`);
console.log(`coverage 字符串与实数一致      ${
  aff.coverage?.taobao === `${taobaoKeys.length}/${perfumes.length}` ? '是' : '否'}`);
console.log(`generatedAt                   ${aff.generatedAt}`);
console.log(`顶层键                        ${Object.keys(aff).join(', ')}`);

console.log('\n===== 2. 缺链分布 =====');
console.log(`缺链瓶数 ${missing.length}`);
const byRank = { '0-50': 0, '51-200': 0, '201-500': 0, '501-1000': 0, '>1000': 0, null: 0 };
for (const p of missing) {
  const r = p.popularityRank;
  if (r == null) byRank.null++;
  else if (r <= 50) byRank['0-50']++;
  else if (r <= 200) byRank['51-200']++;
  else if (r <= 500) byRank['201-500']++;
  else if (r <= 1000) byRank['501-1000']++;
  else byRank['>1000']++;
}
console.log('popularityRank 分布：' + Object.entries(byRank).map(([k, v]) => `${k}=${v}`).join('  '));

const brandCount = new Map();
for (const p of missing) brandCount.set(p.brand, (brandCount.get(p.brand) || 0) + 1);
const topBrands = [...brandCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log(`涉及品牌数 ${brandCount.size}；缺链最多的 15 个品牌：`);
for (const [b, n] of topBrands) console.log(`  ${n.toString().padStart(4)}  ${b}${alias[b] ? '  [有中文别名]' : ''}`);

console.log('\n===== 3. 缺链集合的可救度 =====');
const fragKinds = (id) => frag[id] || null;
const withFragAlias = missing.filter((p) => fragKinds(p.id));
console.log(`缺链里已有香名译名的              ${withFragAlias.length}：${withFragAlias.map((p) => p.id).join(', ') || '（无）'}`);
const brandsWithCn = new Set(Object.keys(alias).filter((b) => b !== '_readme'));
const missBrandCn = missing.filter((p) => brandsWithCn.has(p.brand));
console.log(`缺链里品牌有中文别名的            ${missBrandCn.length} / ${missing.length}`);

console.log('\n===== 4. 已有 624 条的来路 =====');
console.log(`fragrance-aliases 条目数 ${Object.keys(frag).filter((k) => k !== '_readme').length}`);
for (const [id, v] of Object.entries(frag)) {
  if (id === '_readme') continue;
  console.log(`  ${taobaoSet.has(id) ? '有链' : '无链'}  ${id}  kw=${(v.keywords || []).join('/')}  hits=${v.hits}`);
}

console.log('\n===== 5. products.candidates.json =====');
console.log(`generatedAt ${cand.generatedAt}  platforms ${JSON.stringify(cand.platforms)}  targets ${cand.targets}`);
console.log(`stats ${JSON.stringify(cand.stats)}`);
console.log(`accepted ${(cand.accepted || []).length}  rejected ${(cand.rejected || []).length}`);
const reasons = new Map();
for (const r of cand.rejected || []) {
  const k = r.picked?.reason || '(无 picked / 无候选)';
  reasons.set(k, (reasons.get(k) || 0) + 1);
}
for (const [k, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`);
