/* 中文香名调研 第 2 步：从品牌池标题里抽取中文香名候选

   问题：中文名到底能不能"读出来"？
   做法：对每一瓶，把拉丁香名拆成有效词（去重音、去性别词、去系列泛词），
        在品牌池标题里找拉丁词共现率 ≥2 的标题，然后把标题里**紧跟在中文品牌名
        后面、且不是品类词**的中文片段抽出来当候选。

   这一步只产候选，不做判断。通过率在第 3 步实测。
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/.cache/zh-name-sample.json'), 'utf8'));
const pool = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/.cache/zh-name-brandpool.json'), 'utf8'));

/* 去重音（Lancôme → Lancome），这是实测会让召回归零的已知坑 */
const deaccent = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/* 泛词：这些词不区分具体香型，不能用来认货 */
const GENERIC = new Set(['woman', 'women', 'man', 'men', 'for', 'her', 'him', 'pour', 'femme', 'homme',
  'unisex', 'edition', 'the', 'de', 'du', 'des', 'la', 'le', 'les', 'and', 'by', 'of', 'a', 'au',
  'gold', 'black', 'blue', 'brown', 'white', 'red', 'pink', 'green', 'purple', 'silver',
  'intense', 'elixir', 'extreme', 'sport', 'profumo', 'collector', 'limited', 'reserve']);

const CAT_WORDS = ['香水', '香氛', '淡香精', '浓香精', '淡香水', '古龙水', '香精', '正品', '直邮',
  '代购', '小样', '试用', '分装', '免税', '官方', '旗舰', '专柜', '现货', '批', 'ml'];

function nameWords(name) {
  return deaccent(name).toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && w.length > 1 && !GENERIC.has(w));
}

/* 从标题里抽取候选中文串：先定位中文品牌名，取其后到下一个非中文边界之间的中文串，
   去掉纯品类词。中文品牌名不在标题里就返回空。 */
function extractCnChunks(title, brandCn) {
  const out = [];
  let idx = title.indexOf(brandCn);
  while (idx >= 0) {
    let tail = title.slice(idx + brandCn.length);
    for (const cw of CAT_WORDS) tail = tail.split(cw).join('|');
    for (const c of tail.split(/[^一-龥]+/)) {
      const s = c.trim();
      if (s.length >= 2 && s.length <= 8) out.push(s);
    }
    idx = title.indexOf(brandCn, idx + brandCn.length);
  }
  return [...new Set(out)];
}

const rows = [];
for (const b of sample) {
  const words = nameWords(b.name);
  const titles = (pool[b.brandCn]?.titles) || [];
  const hits = [];
  for (const t of titles) {
    const tl = deaccent(t).toLowerCase();
    const hitWords = words.filter((w) => tl.includes(w));
    if (!words.length) continue;
    if (hitWords.length === words.length) {
      hits.push({ title: t, chunks: extractCnChunks(t, b.brandCn), hitWords });
    }
  }
  const chunkCount = new Map();
  for (const h of hits) for (const c of h.chunks) chunkCount.set(c, (chunkCount.get(c) || 0) + 1);
  const cands = [...chunkCount.entries()].sort((a, c) => c[1] - a[1]).slice(0, 6);

  rows.push({
    brand: b.brand, brandCn: b.brandCn, name: b.name,
    nameWords: words,
    fullHits: hits.length,
    candidates: cands.map(([c, cnt]) => ({ cn: c, titles: cnt })),
    sampleTitles: hits.slice(0, 3).map((h) => h.title.slice(0, 80)),
  });
  console.log(
    (hits.length ? 'HIT ' : 'MISS'),
    b.brandCn.padEnd(6), b.name.slice(0, 34).padEnd(36),
    `全词命中=${String(hits.length).padStart(2)}`,
    cands.length ? '→ ' + cands.slice(0, 3).map(([c, n]) => `${c}(${n})`).join(' ') : ''
  );
}

fs.writeFileSync(path.join(ROOT, 'data/.cache/zh-name-candidates.json'), JSON.stringify(rows, null, 2));
const got = rows.filter((r) => r.candidates.length);
console.log(`\n可从品牌池抽出候选的：${got.length}/${rows.length}`);
