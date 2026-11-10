/**
 * test-gold.mjs — 金标准命中率（CONTROL.md §3 第 1 步）
 *
 * 每个画像 = 一组问卷答案 + 3–5 瓶「人判定推对了」的答案。
 * 断言：top3 里命中 ≥ 2 瓶（MAJORITY 模式，默认），或 top1 命中（STRICT 模式）。
 *
 * 判据来源：docs/GOLD-STANDARD-FINAL.md。
 * 金标准答案是**按原始字段（families / character / notesAll / 季节时段）人工判定**的，
 * 没有跑 recommend() 看谁排前 —— 那样等于用引擎定义正确答案，命中率恒为 100%。
 *
 * 用法:
 *   node scripts/test-gold.mjs            # 断言 + 汇总
 *   node scripts/test-gold.mjs --report   # 只打印排名明细，不做断言（调引擎时看这个）
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

const REPORT = process.argv.includes('--report');

/* 回归地板（不是目标）。
 * 引擎现在只有 16.7%，把它当"必须全过"的断言，等于每轮都红、没人会跑。
 * 所以这里只守"不许比已记录基线更差"：改动后若低于地板就红，
 * 高于地板时打印 delta，由人决定要不要把地板抬上去。
 * 地板值必须与 docs/GOLD-STANDARD-FINAL.md 的基线表一致。 */
const FLOOR_MAJORITY = 2;   // /12
const FLOOR_STRICT = 4;     // /12

/* ---------------------------------------------------------------------------
 * 12 个画像。每条 gold 都在池内，且经过 docs/GOLD-STANDARD-FINAL.md 的判定。
 * answers 用的键与 app.js 的 state.answers 同名，可直接被 buildProfile 消费。
 * ------------------------------------------------------------------------- */
const PORTRAITS = [
  {
    id: 'P01',
    title: '清冷感·办公室男生·怕甜',
    answers: {
      family: 'woody', season: 'spring', occasion: 'commute', intensity: 2,
      temperature: 'cool', dislikedNotes: ['Vanilla'], dislikedFamilies: ['gourmand'],
      characterTags: ['fresh', 'woody', 'clean'], characterNeg: ['sweet'],
    },
    gold: [
      'creed-silver-mountain-water',   // 茶+檀香+麝香，克制、贴肤、办公室安全
      'mfk-aqua-universalis',          // 柠檬+橙花+麝香，最干净的一支
      'creed-green-irish-tweed',       // 薄荷/紫罗兰叶/檀香，正装衬衫味
      'jo-malone-wood-sage-and-sea-salt', // 鼠尾草+盐，冷、干、低调
      'bvlgari-aqva-pour-homme',       // 柑橘+鼠尾草，无甜、无香草
    ],
  },
  {
    id: 'P02',
    title: '怕晕白花·日常女生',
    answers: {
      family: 'citrus', season: 'spring', occasion: 'daily', intensity: 2,
      dislikedNotes: ['Jasmine', 'Tuberose', 'Orange Blossom', 'Neroli'],
      characterTags: ['fresh', 'clean', 'citrusy'], characterNeg: ['sweet'],
    },
    gold: [
      'byredo-gypsy-water',            // 柠檬/杜松/鸢尾，无白花
      'mfk-aqua-universalis',          // 柠檬+麝香，白花风险最低的一支
      'byredo-blanche',                // 醛+牡丹+麝香，干净皂感
      'creed-green-irish-tweed',       // 绿调，完全无白花
      'nishane-wulong-cha',            // 乌龙茶+柑橘，清爽无白花
    ],
  },
  {
    id: 'P03',
    title: '温暖约会·秋冬',
    answers: {
      family: 'amber', season: 'winter', occasion: 'date', intensity: 4,
      temperature: 'warm', sweetness: 2,
      characterTags: ['warm', 'sweet', 'resinous'], characterNeg: ['fresh', 'citrusy'],
    },
    gold: [
      'kilian-angels-share',           // 干邑+肉桂+果仁糖，秋冬约会原型
      'mfk-grand-soir',                // 劳丹脂+安息香+香草，纯琥珀
      'maison-margiela-replica-by-the-fireplace', // 栗子+愈创木+香草，壁炉
      'montale-arabians-tonka',        // 乌木+零陵香豆+红糖
      'ysl-la-nuit-de-lhomme',         // 薰衣草+劳丹脂+香草，经典夜间
    ],
  },
  {
    id: 'P04',
    title: '干净皂感·上课',
    answers: {
      family: 'fresh', season: 'spring', occasion: 'commute', intensity: 1,
      temperature: 'neutral', sweetness: 0,
      characterTags: ['clean', 'musky', 'fresh'], characterNeg: ['sweet', 'resinous'],
    },
    gold: [
      'mfk-aqua-universalis',                  // 皂感柠檬麝香
      'maison-margiela-replica-lazy-sunday-morning', // 醛+白麝香，被子味
      'jo-malone-wood-sage-and-sea-salt',      // 鼠尾草+盐，干爽
      'byredo-mojave-ghost',                   // 麝香+檀香，干净不甜
      'byredo-blanche',                        // 醛+皂感，洁净天花板
    ],
  },
  {
    id: 'P05',
    title: '运动清爽·夏天白天',
    answers: {
      family: 'citrus', season: 'summer', occasion: 'outdoor', intensity: 2,
      temperature: 'cool', sweetness: 0, dislikedFamilies: ['gourmand', 'amber'],
      characterTags: ['fresh', 'citrusy', 'green'], characterNeg: ['sweet', 'warm'],
    },
    gold: [
      'mfk-aqua-universalis',     // 柑橘+麝香，夏天最不容易出错
      'versace-pour-homme',       // 佛手柑+柠檬，经典古龙
      'bvlgari-aqva-pour-homme',  // 柑橘+鼠尾草
      'nishane-wulong-cha',       // 乌龙茶+柑橘，热天清淡
      'creed-silver-mountain-water', // 茶+黑加仑+檀香
    ],
  },
  {
    id: 'P06',
    title: '神秘夜晚',
    answers: {
      family: 'amber', season: 'autumn', occasion: 'date', intensity: 4,
      temperature: 'warm', sweetness: 1,
      characterTags: ['smoky', 'resinous', 'woody'], characterNeg: ['fresh', 'citrusy'],
    },
    gold: [
      'mfk-grand-soir',            // 树脂琥珀，夜
      'montale-arabians-tonka',    // 乌木+皮革+红糖
      'mfk-oud-satin-mood',        // 玫瑰+乌木+香草
      'parfums-de-marly-herod',    // 烟草+焚香+劳丹脂
      'heeley-cardinal',           // 乳香+没药+劳丹脂，教堂感
    ],
  },
  {
    id: 'P07',
    title: '甜美不腻·果香花香',
    answers: {
      family: 'floral', season: 'spring', occasion: 'daily', intensity: 2,
      sweetness: 2, dislikedFamilies: ['gourmand'],
      characterTags: ['fruity', 'floral'], characterNeg: ['leathery', 'smoky'],
    },
    gold: [
      'lancome-idole',              // 梨+玫瑰+茉莉，甜而不腻的现代果花
      'ysl-mon-paris',              // 草莓/覆盆子+牡丹
      'salvatore-ferragamo-signorina', // 黑加仑+玫瑰+意式奶冻
      'calvin-klein-euphoria',      // 石榴+兰花
      'byredo-rose-of-no-mans-land', // 覆盆子+玫瑰，果香玫瑰
    ],
  },
  {
    id: 'P08',
    title: '正式场合·稳重',
    answers: {
      family: 'woody', season: 'autumn', occasion: 'formal', intensity: 3,
      temperature: 'neutral', sweetness: 0,
      characterTags: ['woody', 'earthy'], characterNeg: ['sweet', 'fruity'],
    },
    gold: [
      'amouage-reflection-man',   // 鸢尾+檀香+茉莉，正装白花木质
      'creed-green-irish-tweed',  // 绿+檀香，西装味
      'byredo-mojave-ghost',      // 麝香+檀香，低调
      'nishane-hacivat',          // 木质+橡苔，老派稳重
      'montale-black-aoud',       // 乌木+皮革+藏红花（不甜）
    ],
  },
  {
    id: 'P09',
    title: '茶香草本',
    answers: {
      family: 'fresh', season: 'spring', occasion: 'commute', intensity: 2,
      temperature: 'cool', sweetness: 0, dislikedFamilies: ['gourmand'],
      characterTags: ['herbal', 'green'], characterNeg: ['sweet', 'creamy'],
    },
    gold: [
      'creed-silver-mountain-water',        // 茶+黑加仑
      'creed-green-irish-tweed',            // 白松香+薄荷+马鞭草
      'jo-malone-wood-sage-and-sea-salt',   // 鼠尾草
      'nishane-wulong-cha',                 // 乌龙茶本体
      'guerlain-aqua-allegoria-herba-fresca', // 薄荷+三叶草+茶
    ],
  },
  {
    id: 'P10',
    title: '皮革感小众',
    answers: {
      family: 'amber', season: 'autumn', occasion: 'daily', intensity: 4,
      temperature: 'warm', sweetness: 0,
      characterTags: ['leathery', 'smoky'], characterNeg: ['sweet', 'clean'],
    },
    gold: [
      'kenzo-kenzo-homme',                 // 海+皮革+广藿香
      'santa-maria-novella-tabacco-toscano', // 烟草+皮革+桦木
      'profumum-roma-fumidus',             // 桦木+香根草，烟熏皮革
      'dolce-gabbana-velvet-tender-oud',   // 皮革+玫瑰+乌木
    ],
  },
  {
    id: 'P11',
    title: '夏日清凉·讨厌琥珀',
    answers: {
      family: 'citrus', season: 'summer', occasion: 'daily', intensity: 2,
      temperature: 'cool', sweetness: 0, dislikedFamilies: ['amber'],
      characterTags: ['citrusy', 'fresh'], characterNeg: ['warm', 'resinous'],
    },
    gold: [
      'mfk-aqua-universalis',   // 纯柑橘麝香，无琥珀
      'creed-silver-mountain-water', // 柑橘+茶
      'versace-pour-homme',     // 佛手柑+柠檬
      'bvlgari-aqva-pour-homme', // 柑橘+鼠尾草
      'nishane-wulong-cha',     // 柑橘+乌龙
    ],
  },
  {
    id: 'P12',
    title: '奶香柔软',
    answers: {
      family: 'floral', season: 'autumn', occasion: 'daily', intensity: 2,
      sweetness: 2, temperature: 'warm',
      characterTags: ['creamy', 'sweet'], characterNeg: ['leathery', 'smoky'],
    },
    gold: [
      'ysl-libre',                        // 薰衣草+橙花+香草，柔
      'kilian-love-dont-be-shy',          // 棉花糖+忍冬+劳丹脂
      'amouage-reflection-man',           // 鸢尾+檀香，粉质柔软
      'kilian-good-girl-gone-bad',        // 桂花+晚香玉，柔滑
      'kayali-utopia-vanilla-coco-21',    // 椰子+香草，真奶香
    ],
  },
];

/* ------------------------------------------------------------------------- */

let pass = 0;
const failures = [];
const rows = [];

for (const port of PORTRAITS) {
  for (const id of port.gold) {
    if (!byId.has(id)) throw new Error(`${port.id} 的金标准 id 不在香水库里: ${id}`);
  }
  const r = recommend(port.answers, perfumes, TAX, { topN: 5 });
  const top = r.results.map((x) => x.perfume.id);
  const top3 = top.slice(0, 3);
  const hits3 = top3.filter((id) => port.gold.includes(id));
  const top1Hit = port.gold.includes(top[0]);
  const passMajority = hits3.length >= 2;
  const passStrict = top1Hit;

  rows.push({
    id: port.id, title: port.title,
    top5: top, hits3, top1Hit, passMajority, passStrict,
    gold: port.gold,
  });

  if (REPORT) continue;
  if (passMajority) pass++;
  else failures.push(`${port.id} ${port.title} :: top3=${top3.join(',')} 命中 ${hits3.length} 瓶（需 ≥2）| gold=${port.gold.join(',')}`);
}

/* 汇总 */
const n = PORTRAITS.length;
const majN = rows.filter((x) => x.passMajority).length;
const strictN = rows.filter((x) => x.passStrict).length;

console.log('');
console.log('画像  命中(top3)  top1  top5 排名');
console.log('-'.repeat(96));
for (const x of rows) {
  const mark3 = x.passMajority ? '✓' : '✗';
  console.log(
    `${x.id}  ${mark3} ${String(x.hits3.length)}/3      ${x.top1Hit ? '✓' : '·'}    ` +
      `${x.top5.slice(0, 5).map((id, i) => `${i + 1}.${id}`).join('  ')}`,
  );
}
console.log('-'.repeat(96));
console.log(`MAJORITY（top3 命中 ≥2）: ${majN}/${n} = ${((majN / n) * 100).toFixed(1)}%`);
console.log(`STRICT  （top1 命中）   : ${strictN}/${n} = ${((strictN / n) * 100).toFixed(1)}%`);

if (REPORT) {
  console.log('\n--- 逐画像 gold 是否进入 top5 ---');
  for (const x of rows) {
    const inTop = x.gold.filter((id) => x.top5.includes(id));
    const outTop = x.gold.filter((id) => !x.top5.includes(id));
    console.log(`${x.id}: 进 top5 ${inTop.length}/${x.gold.length}${outTop.length ? ' | 掉出: ' + outTop.join(',') : ''}`);
  }
  process.exit(0);
}

/* 判定按「回归地板」而不是「全画像通过」：
 * 现在的引擎只到 16.7%，若要求 12/12 全过，这条测试从第一天起就是红的，
 * 红久了就没人看 —— 那比没有测试更糟。
 * 地板守的是「这次改动不许让命中率变差」，这也正是 CONTROL.md 要求的
 * 「commit 信息里写明命中率前后值，没有 delta 的打分改动不许合并」。 */
console.log('');
console.log(`地板（不许更差）: MAJORITY ≥ ${FLOOR_MAJORITY}/${n} · STRICT ≥ ${FLOOR_STRICT}/${n}`);

const dMaj = majN - FLOOR_MAJORITY;
const dStr = strictN - FLOOR_STRICT;
const fmt = (d) => (d > 0 ? `+${d}` : d === 0 ? '±0' : `${d}`);

if (failures.length) {
  console.log('');
  console.log('未达 MAJORITY 的画像（用于定位，不单条判死）：');
  for (const f of failures) console.log('  · ' + f);
}

const bad = [];
if (majN < FLOOR_MAJORITY) bad.push(`MAJORITY ${majN} < 地板 ${FLOOR_MAJORITY}（delta ${fmt(dMaj)}）`);
if (strictN < FLOOR_STRICT) bad.push(`STRICT ${strictN} < 地板 ${FLOOR_STRICT}（delta ${fmt(dStr)}）`);

if (bad.length) {
  console.log('');
  for (const b of bad) console.log('  ✗ ' + b);
  console.log(`\nRESULT: FAIL — 命中率低于已记录基线，这次改动把引擎改差了`);
  process.exit(1);
}

console.log('');
console.log(`delta: MAJORITY ${fmt(dMaj)} · STRICT ${fmt(dStr)}${dMaj > 0 || dStr > 0 ? '  ← 有提升，可考虑抬地板' : ''}`);
console.log(`RESULT: PASS ${majN}/${n} = ${((majN / n) * 100).toFixed(1)}%（地板守住了，未退化）`);
/* check-head.mjs 用这行读命中率：格式固定 "GOLD MAJORITY a/12 STRICT b/12"。
   与其它套件不同，这里不报 PASS/FAIL 条数 —— 金标准是命中率而非断言数，
   报成 "PASS 2 FAIL 10" 会让人误读成「十个画像写错了」。 */
console.log(`GOLD MAJORITY ${majN}/${n} STRICT ${strictN}/${n}`);
