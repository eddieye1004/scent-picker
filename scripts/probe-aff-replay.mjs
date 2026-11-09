/* 缓存回放：不发任何请求，只用 lib 里**当前的**判据把 data/.cache/union-api.json
   里的候选重新评一遍。

   为什么要这个：`fetch-products.mjs` 命中缓存时会 remap，但 accepted 判定发生在
   当次运行里；而 data/affiliate-links.json 是另一条链（source → gen）的产物。
   于是出现「判据已升级、缓存里已有中文候候选，但公开表里还是没有这条链接」的
   状态 —— 这正是不花配额就能捞回的那部分。

   只读，不写任何文件。用法：node scripts/probe-aff-replay.mjs
*/
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pickBest, taobaoQueryVariants } from './lib/union-api.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const rj = async (p) => JSON.parse(await readFile(path.join(ROOT, p), 'utf8'));

const perfumes = (await rj('data/perfumes.json')).perfumes;
const byId = new Map(perfumes.map((p) => [p.id, p]));
const aff = await rj('data/affiliate-links.json');
const has = new Set(Object.keys(aff.taobao || {}));
const ALIAS = await rj('data/brand-aliases.json');
const FRAG = await rj('data/fragrance-aliases.json');

const CACHE = path.join(ROOT, 'data/.cache/union-api.json');
if (!existsSync(CACHE)) { console.error('没有 union-api.json 缓存'); process.exit(1); }
const cache = JSON.parse(await readFile(CACHE, 'utf8'));

function mapTaobao(node) {
  const list = node?.result_list?.map_data || [];
  return list.map((it) => {
    const flat = { ...it, ...(it.item_basic_info || {}), ...(it.publish_info || {}), ...(it.price_promotion_info || {}) };
    return {
      itemId: it.item_id ?? flat.item_id ?? flat.num_iid,
      title: flat.title || flat.short_title || '',
      clickUrl: flat.click_url || '',
      categoryText: `${flat.level_one_category_name || ''}/${flat.category_name || ''}`,
    };
  });
}

let n = 0; let accept = 0; let newAccept = 0;
console.log('id | 缓存keyword | 候选 | 现判据 | 表里已有');
for (const [ck, entry] of Object.entries(cache)) {
  const m = ck.match(/^taobao:(.+):/);
  if (!m) continue;
  const p = byId.get(m[1]);
  if (!p) continue;
  n++;
  const cands = entry.raw ? mapTaobao(entry.raw) : (entry.candidates || []);
  const frag = FRAG[p.id] || null;
  const best = pickBest(p, cands, ALIAS, frag);
  const ok = Boolean(best?.accept);
  if (ok) {
    accept++;
    if (!has.has(p.id)) newAccept++;
  }
  console.log(`${p.id} | ${entry.keyword} | ${cands.length} | ${ok ? 'ACCEPT' : '拒：' + (best?.reason || '无候选')} | ${has.has(p.id) ? '有' : '无'}`);
}

console.log(`\n缓存条目 ${n} · 现判据接受 ${accept} · 其中表里还没有的 ${newAccept}`);

/* 顺带打印：这些 id 在新的变体阶梯下，第一个查询词会是什么（不发请求） */
console.log('\n新变体阶梯前 3 个词（供真实重查用）：');
for (const [ck, entry] of Object.entries(cache)) {
  const m = ck.match(/^taobao:(.+):/);
  if (!m) continue;
  const p = byId.get(m[1]);
  if (!p || has.has(p.id)) continue;
  console.log(`  ${p.id}: ${taobaoQueryVariants(p, ALIAS, FRAG[p.id] || null).slice(0, 3).join(' | ')}`);
}
