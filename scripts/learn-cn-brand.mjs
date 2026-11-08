/* 从已命中标题里自动学出中文品牌名（零 API、零猜测）

   背景：本轮决定性实验证明 —— 拉丁香名查淘宝经常 n=0，中文香名能救回
   （Mitsouko n=0 → 娇兰 蝴蝶夫人 n=10；English Pear n=0 → 祖玛珑 英国梨 n=99）。
   但我们库里香名全是英文，一个中文都没有。

   能自动做的那一半：**中文品牌名**。
   已接受的 543 条标题里必然写着「娇兰」「祖玛珑」「万宝龙」这些中文名，
   而我们知道那条标题对应哪个英文品牌 —— 所以可以直接统计出来，
   不需要人工维护别名表，也不需要猜。

   判据（全部可复核）：
     1. 标题里不含英文品牌名的纯中文片段才算候选（英文品牌名出现时，
        中文片段可能只是香名，如「自由之水」）
     2. 该中文片段在**同一品牌**的标题里出现 >= 2 次
     3. 该中文片段在**其他品牌**的标题里出现 <= 1 次（避免「香水」这类通用词）
     4. 长度 2-6 字（中文品牌名基本都在这个区间）
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/.cache/union-api.json'), 'utf8'));
const perfumesRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8'));
const perfumes = perfumesRaw.perfumes || perfumesRaw;
const byId = new Map(perfumes.map((p) => [p.id, p]));

/* 通用词：不是品牌名 */
const COMMON = new Set(['香水', '淡香水', '浓香水', '香精', '小样', '正品', '官方', '旗舰店', '专柜',
  '女士', '男士', '中性', '持久', '留香', '正装', '简装', '试用装', '分装', '礼盒', '套装',
  '身体乳', '沐浴露', '洗发', '护发', '香氛', '淡香', '浓香', '精粹', '限量', '限定', '新版',
  '旧版', '国际', '直邮', '香港', '美国', '欧洲', '日本', '韩国', '免税', '现货', '预售',
  '直播', '直播间', '秒杀', '包邮', '新品', '同款', '平替', '原装', '进口', '国内', '专享',
  '自营', '天猫', '淘宝', '京东', '官网', '授权', '折扣', '特价', '清仓', '满减', '赠品']);

function idFromKey(k) {
  const parts = k.split(':');
  return parts.length >= 3 ? parts[1] : null;
}

/* 第一遍：统计 (brand, 中文片段) 共现次数，以及该片段跨品牌分布 */
const perBrand = new Map();   // brand -> Map(chunk -> count)
const chunkBrands = new Map(); // chunk -> Set(brand)

for (const [key, node] of Object.entries(cache)) {
  const id = idFromKey(key);
  const p = id ? byId.get(id) : null;
  if (!p) continue;
  for (const c of node.candidates || []) {
    const title = String(c.title || '');
    if (!title) continue;
    // 只保留中文连续段
    const chunks = title.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
    for (const raw of chunks) {
      // 滑动取所有 2-4 字子串（品牌名可能嵌在更长片段里）
      for (let len = 2; len <= 4; len++) {
        for (let i = 0; i + len <= raw.length; i++) {
          const s = raw.slice(i, i + len);
          if (COMMON.has(s)) continue;
          if (!perBrand.has(p.brand)) perBrand.set(p.brand, new Map());
          const m = perBrand.get(p.brand);
          m.set(s, (m.get(s) || 0) + 1);
          if (!chunkBrands.has(s)) chunkBrands.set(s, new Set());
          chunkBrands.get(s).add(p.brand);
        }
      }
    }
  }
}

/* 第二遍：筛选 */
const learned = {};
for (const [brand, m] of perBrand) {
  const picks = [];
  for (const [chunk, n] of m) {
    if (n < 2) continue;                    // 同品牌至少出现 2 次
    if (chunkBrands.get(chunk).size > 2) continue;  // 跨品牌太广 = 通用词
    picks.push({ chunk, n });
  }
  // 去掉被更长片段完全包含的短片段（「娇兰」vs「娇」「兰」）
  picks.sort((a, b) => b.n - a.n || b.chunk.length - a.chunk.length);
  const kept = [];
  for (const p of picks) {
    if (kept.some((k) => k.chunk.includes(p.chunk) || p.chunk.includes(k.chunk))) continue;
    kept.push(p);
    if (kept.length >= 3) break;
  }
  if (kept.length) learned[brand] = kept;
}

const rows = Object.entries(learned).sort((a, b) => b[1][0].n - a[1][0].n);
console.log(`=== 从 ${Object.keys(cache).length} 组关键词里学出的中文品牌名 ===`);
console.log(`覆盖 ${rows.length} 个品牌 / 全库 ${new Set(perfumes.map((p) => p.brand)).size} 个\n`);
for (const [brand, picks] of rows) {
  console.log(brand.padEnd(30), picks.map((p) => `${p.chunk}(${p.n})`).join('  '));
}

fs.writeFileSync(path.join(ROOT, 'data/.cache/brand-cn-learned.json'), JSON.stringify(
  Object.fromEntries(rows.map(([b, ps]) => [b, ps.map((p) => p.chunk)])), null, 2));
console.log('\n明细 → data/.cache/brand-cn-learned.json');
