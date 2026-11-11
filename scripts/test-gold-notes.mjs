/**
 * test-gold-notes.mjs — notes 专用小金标准（**定稿 2026-11-11**，未接入 check-head）
 *
 * 与 test-gold.mjs 的区别：
 *   - test-gold.mjs      量「12 画像人设金标准」= 家族/气质维度（CONTROL.md §5 收口）
 *   - 本脚本              量「notes-first 小金标准」= 按香调选瓶的维度
 *
 * 两套集量的是不同东西，分数不可互相比、不可互相替代。
 *
 * 选瓶规则见 docs/reviews/GOLD-NOTES-DRAFT-20261111.md §1（先定稿后选瓶）。
 *
 * ## 报告口径（Eddie 2026-11-11 15:29 定版，改口径前先读这段）
 *
 * **逐画像结果为正报，总命中率只作参考。**
 *
 * 原因：各画像合格瓶数从 4 到 199 相差 50 倍（chips 稀有度决定的，不是抽样瑕疵）。
 * 合格瓶越多的画像，「top3 命中 ≥2」越接近随机；越少的越接近唯一解。
 * 八个画像难度并不一致，把 MAJ/STR 做算术平均会掩盖这一点。
 * 所以看这个脚本的输出，**先看逐画像那一列，再看（也只是参考）底下两个总数**。
 *
 * ## 地板：暂不设（定稿结论 4）
 *
 * 首测 MAJ 0/8，按「首测往下留一格」算出来是 max(0, 0−1) = 0，地板永远不会触发，
 * 形同虚设。待 MAJ 离开 0 再按同法重算。**本脚本不接入 check-head。**
 *
 * 用法:
 *   node scripts/test-gold-notes.mjs            # 逐画像正报 + 参考聚合
 *   node scripts/test-gold-notes.mjs --report   # 额外打印每画像 top5 与 gold 对照
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
    qualifiedCount: 147,
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
    qualifiedCount: 63,
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
    qualifiedCount: 20,
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
    qualifiedCount: 16,
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
    qualifiedCount: 4,
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
    qualifiedCount: 33,
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
    qualifiedCount: 99,
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
    qualifiedCount: 199,
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

/* 首测基线（**测量不是目标**，定稿记录）。
 * 地板：定稿结论 4 = **暂不设地板**。MAJ 0/8 时按「首测往下留一格」算出来是 0，
 * 永远不会触发，形同虚设；待 MAJ 离开 0 再按同法重算。
 * 因此本脚本**不做断言、不 exit 非零**，只报数。接入 check-head 需另立决定。 */
const BASELINE_MAJORITY = 0;   // /8 首测
const BASELINE_STRICT = 1;     // /8 首测

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
    qualifiedCount: port.qualifiedCount,
    gold: port.gold, top5: top, hits3: hits3.length, top1Hit,
    passMajority: hits3.length >= 2,
  });
}

const majN = rows.filter((x) => x.passMajority).length;
const strictN = rows.filter((x) => x.top1Hit).length;

console.log('');
console.log('notes 小金标准（定稿 2026-11-11）');
console.log('');
console.log('=== 逐画像结果（正报 —— 请看这一列）===');
console.log('画像   命中(top3)  top1  合格瓶数  chips');
console.log('-'.repeat(96));
for (const x of rows) {
  const q = String(x.qualifiedCount).padStart(6);
  console.log(
    `${x.id}   ${x.passMajority ? '✓' : '·'} ${String(x.hits3)}/3      ${x.top1Hit ? '✓' : '·'}  ${q}     ` +
      `${x.likedNotes.join('/')}`,
  );
}
console.log('-'.repeat(96));

if (REPORT) {
  console.log('\n--- 逐画像 top5 与 gold ---');
  for (const x of rows) {
    const inTop = x.gold.filter((id) => x.top5.includes(id));
    const outTop = x.gold.filter((id) => !x.top5.includes(id));
    console.log(`${x.id}: 进 top5 ${inTop.length}/${x.gold.length}${outTop.length ? ' | 掉出: ' + outTop.join(',') : ''}`);
    console.log(`     top5 = ${x.top5.join(', ')}`);
  }
}

console.log('');
console.log('=== 聚合（仅供参考，不是判定依据）===');
console.log(`MAJORITY（top3 命中 ≥2）: ${majN}/${n} = ${((majN / n) * 100).toFixed(1)}%`);
console.log(`STRICT  （top1 命中）   : ${strictN}/${n} = ${((strictN / n) * 100).toFixed(1)}%`);
console.log('');
console.log('口径：**逐画像结果为正报，总命中率只作参考。**');
console.log('      各画像合格瓶数 4–199 相差 50 倍（chips 稀有度决定），八画像难度不一致，');
console.log('      聚合数会掩盖这一点 —— 判断优劣请先看逐画像那一列。');
console.log('');
console.log(`首测基线（测量不是目标）: MAJORITY ${BASELINE_MAJORITY}/${n} · STRICT ${BASELINE_STRICT}/${n}`);
console.log('地板: 暂不设（基线 MAJ 0/8 时地板无法触发；待 MAJ 离开 0 再议）· 未接入 check-head');
/* check-head 将来若接入本脚本，读这行；格式与 test-gold.mjs 的 GOLD 行区分开 */
console.log(`GOLD-NOTES MAJORITY ${majN}/${n} STRICT ${strictN}/${n}`);
