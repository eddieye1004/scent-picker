/**
 * gold-portraits.mjs — 12 个金标准画像的唯一来源。
 *
 * 原先这 193 行写在 scripts/test-gold.mjs 里。第 2 步（家族衰减）实验需要
 * 用同一份金标准跑两种打法并对比命中率，若在探针里再抄一份，两次抄写必然走样，
 * 所以抽成模块，test-gold.mjs 与 probe-family-decay.mjs 都从这里 import。
 *
 * 每个画像 = 一组问卷答案（键名与 app.js 的 state.answers 一致，可直接被
 * buildProfile 消费）+ 3–5 瓶「人判定推对了」的答案（全部池内 id）。
 * 判定依据见 docs/GOLD-STANDARD-FINAL.md。
 */

export const PORTRAITS = [
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
