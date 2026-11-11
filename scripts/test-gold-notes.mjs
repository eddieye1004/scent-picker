/**
 * test-gold-notes.mjs — notes 专用小金标准（草案首测，未接入 check-head）
 *
 * 与 test-gold.mjs 的区别：
 *   - test-gold.mjs      量「12 画像人设金标准」= 家族/气质维度（CONTROL.md §5 收口）
 *   - 本脚本              量「notes-first 小金标准」= 按香调选瓶的维度
 *
 * 两套集量的是不同东西，分数不可互相比、不可互相替代。
 *
 * 选瓶规则见 docs/reviews/GOLD-NOTES-DRAFT-20261111.md §1（先定稿后选瓶）。
 * 当前状态：**草案首测**。画像名单待 Eddie 抽查后才定稿，本脚本先不接 check-head。
 *
 * 用法:
 *   node scripts/test-gold-notes.mjs            # 首测 + 汇总（不做断言）
 *   node scripts/test-gold-notes.mjs --report   # 只打印排名明细
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recommend } from '../src/scoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8'));
const TAX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
const perfumes = DATA.perfumes;
const byId = new Map(perfumes.map((p) => [p.id, p]));

/* ---------------------------------------------------------------------------
 * notes-first 画像集（草案，8 个）。
 *
 * 入选标准（先于选瓶写定，见草案 §2）：
 *   画像定义里的「香调意图」足够明确 —— 要么定义含字面/近字面香调词，
 *   要么 profile 标签本身就是香调级词汇，要么约束窄到能唯一决定香调方向。
 *
 * 每画像的 gold 由 draft §3 的规则从原始字段筛出（不由引擎分数反推）：
 *   (i) notesAll 含 likedNotes ≥2 个；(ii) 不含任何 dislikedNotes；
 *   (iii) 过硬冲突筛（audit-gold 口径：dislikedFamilies ≥0.5 / characterNeg）；
 *   (iv) 只用 data/perfumes.json 原始字段。
 *
 * ⚠ 名单待 Eddie 抽查后定稿。定稿前本文件不接入 check-head。
 * ------------------------------------------------------------------------- */
export const NOTES_PORTRAITS = [
  {
    id: 'N03',
    from: 'P03',
    title: '温暖约会·秋冬（notes-first）',
    likedNotes: ['amber', 'vanilla', 'benzoin'],
    answers: {
      family: 'amber', season: 'winter', occasion: 'date', intensity: 4,
      temperature: 'warm', sweetness: 2,
      characterTags: ['warm', 'sweet', 'resinous'], characterNeg: ['fresh', 'citrusy'],
    },
    gold: [
      'mfk-grand-soir',          // amber+vanilla+benzoin 全中
      'lattafa-khamrah',         // 3/3
      'mfk-oud-satin-mood',      // 3/3
      'nishane-ani',             // 3/3
      'lattafa-asad',            // 3/3
    ],
  },
  {
    id: 'N04',
    from: 'P04',
    title: '干净皂感·上课（notes-first）',
    likedNotes: ['musk', 'aldehydes', 'lavender'],
    answers: {
      family: 'fresh', season: 'spring', occasion: 'commute', intensity: 1,
      temperature: 'neutral', sweetness: 0,
      characterTags: ['clean', 'musky', 'fresh'], characterNeg: ['sweet', 'resinous'],
    },
    gold: [
      'armaf-orchestra-tempo-tune',                  // 3/3
      'ysl-libre',                                   // musk+lavender
      'frederic-malle-musc-ravageur',                // musk+lavender
      'byredo-blanche',                              // musk+aldehydes
      'maison-margiela-replica-lazy-sunday-morning', // musk+aldehydes
    ],
  },
  {
    id: 'N06',
    from: 'P06',
    title: '神秘夜晚（notes-first）',
    likedNotes: ['incense', 'oud', 'myrrh'],
    answers: {
      family: 'amber', season: 'autumn', occasion: 'date', intensity: 4,
      temperature: 'warm', sweetness: 1,
      characterTags: ['smoky', 'resinous', 'woody'], characterNeg: ['fresh', 'citrusy'],
    },
    gold: [
      'zoologist-camel',                    // 3/3
      'creed-queen-of-silk',                // 3/3
      'mancera-red-tobacco',                // incense+oud
      'nishane-afrika-olifant',             // oud+myrrh
      'dolce-gabbana-velvet-desert-oud',    // incense+oud
    ],
  },
  {
    id: 'N07',
    from: 'P07',
    title: '甜美不腻·果香花香（notes-first）',
    likedNotes: ['peach', 'freesia', 'peony'],
    answers: {
      family: 'floral', season: 'spring', occasion: 'daily', intensity: 2,
      sweetness: 2, dislikedFamilies: ['gourmand'],
      characterTags: ['fruity', 'floral'], characterNeg: ['leathery', 'smoky'],
    },
    gold: [
      'cacharel-noa',            // 3/3
      'viktor-rolf-flowerbomb',  // freesia+peony
      'amouage-dia-woman',       // peach+peony
      'gucci-rush',              // peach+freesia
      'calvin-klein-ck-be',      // peach+freesia
    ],
  },
  {
    id: 'N09',
    from: 'P09',
    title: '茶香草本（notes-first）',
    likedNotes: ['green tea', 'sage', 'galbanum'],
    answers: {
      family: 'fresh', season: 'spring', occasion: 'commute', intensity: 2,
      temperature: 'cool', sweetness: 0, dislikedFamilies: ['gourmand'],
      characterTags: ['herbal', 'green'], characterNeg: ['sweet', 'creamy'],
    },
    /* 合格瓶只有 4 瓶（全库 1388 里命中 ≥2 且不踩雷的只有这些）。
       按草案 §1.3「不许放宽规则凑数」，照实取 4 瓶并记录不足。 */
    gold: [
      'etat-libre-dorange-jasmin-et-cigarette', // sage+galbanum
      'armaf-legasi-man',                       // sage+galbanum
      'bentley-azure',                          // green tea+sage
      'lattafa-dynasty',                        // green tea+sage
    ],
  },
  {
    id: 'N10',
    from: 'P10',
    title: '皮革感小众（notes-first）',
    likedNotes: ['leather', 'incense', 'saffron'],
    answers: {
      family: 'amber', season: 'autumn', occasion: 'daily', intensity: 4,
      temperature: 'warm', sweetness: 0,
      characterTags: ['leathery', 'smoky'], characterNeg: ['sweet', 'clean'],
    },
    gold: [
      'dolce-gabbana-velvet-desert-oud', // 3/3
      'ajmal-cherry-wood',               // 3/3
      'amouage-overture-woman',          // 3/3
      'pantheon-roma-pantheon-r',        // 3/3
      'versace-dylan-blue',              // incense+saffron
    ],
  },
  {
    id: 'N11',
    from: 'P11',
    title: '夏日清凉·讨厌琥珀（notes-first）',
    likedNotes: ['bergamot', 'lemon', 'grapefruit'],
    answers: {
      family: 'citrus', season: 'summer', occasion: 'daily', intensity: 2,
      temperature: 'cool', sweetness: 0, dislikedFamilies: ['amber'],
      characterTags: ['citrusy', 'fresh'], characterNeg: ['warm', 'resinous'],
    },
    gold: [
      'creed-himalaya',                       // 3/3
      'annick-goutal-eau-dhadrien',           // 3/3
      'roja-parfums-danger-pour-femme',       // 3/3
      'acqua-di-parma-colonia-essenza',       // 3/3
      'roja-parfums-oceania',                 // 3/3
    ],
  },
  {
    id: 'N12',
    from: 'P12',
    title: '奶香柔软（notes-first）',
    likedNotes: ['vanilla', 'sandalwood', 'ylang-ylang'],
    answers: {
      family: 'floral', season: 'autumn', occasion: 'daily', intensity: 2,
      sweetness: 2, temperature: 'warm',
      characterTags: ['creamy', 'sweet'], characterNeg: ['leathery', 'smoky'],
    },
    gold: [
      'lattafa-fakhar-rose',                 // 3/3
      'roja-parfums-danger-pour-femme',      // 3/3
      'amouage-lyric-woman',                 // 3/3
      'memo-paris-marfa',                    // 3/3
      'roja-parfums-enigma',                 // 3/3
    ],
  },
];

const REPORT = process.argv.includes('--report');
const n = NOTES_PORTRAITS.length;

/* 首测基线与地板（草案，未定稿）。
 * 首测值 = 本文件第一次跑出来的数，是**测量不是目标**。
 * 地板 = 首测往下留一格（一格 = 1/n）。见草案 §1.6。
 *
 * ⚠ 当前是草案：地板按首测填，尚未接入 check-head。
 *    Eddie 抽查名单定稿后才把这份画像集与地板同步进 CONTROL.md。 */
const BASELINE_MAJORITY = 0;   // /8 首测
const BASELINE_STRICT = 1;     // /8 首测
const FLOOR_MAJORITY = Math.max(0, BASELINE_MAJORITY - 1); // /8 往下留一格
const FLOOR_STRICT = Math.max(0, BASELINE_STRICT - 1);

const rows = [];
for (const port of NOTES_PORTRAITS) {
  for (const id of port.gold) {
    if (!byId.has(id)) throw new Error(`${port.id} 的 gold id 不在香水库里: ${id}`);
  }
  /* subfamily 不传：第 9 步四格实测 subfamily 单独 −2 STR，且属人设判定轴（草案 §1.5） */
  const ans = { ...port.answers, likedNotes: port.likedNotes };
  const r = recommend(ans, perfumes, TAX, { topN: 5 });
  const top = r.results.map((x) => x.perfume.id);
  const top3 = top.slice(0, 3);
  const hits3 = top3.filter((id) => port.gold.includes(id));
  const top1Hit = port.gold.includes(top[0]);
  rows.push({
    id: port.id, from: port.from, title: port.title, likedNotes: port.likedNotes,
    gold: port.gold, top5: top, hits3: hits3.length, top1Hit,
    passMajority: hits3.length >= 2,
  });
}

const majN = rows.filter((x) => x.passMajority).length;
const strictN = rows.filter((x) => x.top1Hit).length;

console.log('');
console.log('notes 小金标准（草案首测）');
console.log('画像   命中(top3)  top1  chips');
console.log('-'.repeat(96));
for (const x of rows) {
  console.log(
    `${x.id}   ${x.passMajority ? '✓' : '·'} ${String(x.hits3)}/3      ${x.top1Hit ? '✓' : '·'}    ` +
      `${x.likedNotes.join('/')}`,
  );
}
console.log('-'.repeat(96));
console.log(`MAJORITY（top3 命中 ≥2）: ${majN}/${n} = ${((majN / n) * 100).toFixed(1)}%`);
console.log(`STRICT  （top1 命中）   : ${strictN}/${n} = ${((strictN / n) * 100).toFixed(1)}%`);

if (REPORT) {
  console.log('\n--- 逐画像 top5 与 gold ---');
  for (const x of rows) {
    const inTop = x.gold.filter((id) => x.top5.includes(id));
    const outTop = x.gold.filter((id) => !x.top5.includes(id));
    console.log(`${x.id}: 进 top5 ${inTop.length}/${x.gold.length}${outTop.length ? ' | 掉出: ' + outTop.join(',') : ''}`);
    console.log(`     top5 = ${x.top5.join(', ')}`);
  }
  process.exit(0);
}

console.log('');
console.log(`首测基线（记录用，不是目标）: MAJORITY ${BASELINE_MAJORITY}/${n} · STRICT ${BASELINE_STRICT}/${n}`);
console.log(`地板建议（首测往下留一格）: MAJORITY ≥ ${FLOOR_MAJORITY}/${n} · STRICT ≥ ${FLOOR_STRICT}/${n}`);
console.log('状态: 草案，未接入 check-head（等 Eddie 抽查名单后定稿）');
/* check-head 将来接本脚本时读这行；格式与 test-gold.mjs 的 GOLD 行区分开 */
console.log(`GOLD-NOTES MAJORITY ${majN}/${n} STRICT ${strictN}/${n}`);
