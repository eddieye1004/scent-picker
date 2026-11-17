/**
 * 一次性变换：taxonomy v2.2.0（24 小类）→ v2.3.0（22 小类）。
 *
 * 为什么用脚本而不是手改 1864 行 JSON：
 *   ① 手改 22 处 id/zh/notes 时漏一处不会有任何提示 —— 而 tests 只覆盖其中一部分；
 *   ② 本文件的 `JSON.stringify(x, null, 2) + '\n'` 与磁盘内容**逐字节相同**（已实测），
 *      所以脚本改完的 diff 只包含真实语义变化，不会混进格式化噪声。
 *
 * 幂等性：每处改动都先断言"改之前是什么"，改过再跑直接抛错，
 * 而不是静默地叠加两层改名。
 *
 * 词表对齐的判据来自 scripts/probe-vocab-audit.mjs（字面命中 / 引擎命中分列），
 * 下面 VOCAB 里记的是改动当时的实测数，方便日后复核"当时为什么这么改"。
 *
 * 用法：node _audit/apply-taxonomy-v23.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data', 'taxonomy.json');
const raw = fs.readFileSync(FILE, 'utf8');
const t = JSON.parse(raw);

if (t.version !== '2.2.0') throw new Error(`基线不是 2.2.0，实际 ${t.version}`);

const fam = (id) => {
  const f = t.families.find((x) => x.id === id);
  if (!f) throw new Error(`没有大类 ${id}`);
  return f;
};
const sub = (fid, sid) => {
  const s = (fam(fid).subfamilies || []).find((x) => x.id === sid);
  if (!s) throw new Error(`没有小类 ${fid}/${sid}`);
  return s;
};
const eq = (label, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`${label} 不是预期值：${JSON.stringify(got)} != ${JSON.stringify(want)}`);
  }
};
const take = (arr, id) => {
  const i = arr.findIndex((x) => x.id === id);
  if (i < 0) throw new Error(`要删的 ${id} 不在数组里`);
  return arr.splice(i, 1)[0];
};

const V23 = '2026-11-17';

/* ============================================================
   A1 合并：树脂 resinous → 琥珀 amber
   ============================================================ */
{
  const a = sub('amber', 'amber');
  const r = sub('amber', 'resinous');
  eq('amber 原 notes', a.notes, ['vanilla', 'benzoin', 'labdanum', 'amber', 'cinnamon', 'cardamom', 'saffron', 'clove']);
  eq('resinous 原 notes', r.notes, ['benzoin', 'labdanum', 'myrrh']);

  /* union 去重，保持"甜树脂在前、被并类的新增项在后"的次序 —— 读起来仍是先甜后树脂本体 */
  a.notes = [...new Set([...a.notes, ...r.notes])];
  a.desc = '甜暖树脂的统称：香草的奶甜、安息香与劳丹脂的膏甜、肉桂豆蔻的辛甜；乳香/没药/安息香的教堂感也归这里'
    + '，不谈烟，只谈树脂本身';
  a.descWheel = '甜暖厚实，像焦糖和冬天的毛毯，越闻越暖';
  a.boundary = {
    check: [
      '含 benzoin 且含 labdanum 的纯树脂构成，归这里（原 resinous 判据）',
      '含乳香 / 没药 / 安息香的教堂感树脂，也归这里',
      '不含前述所有特征',
    ],
    exclude: [
      '带皮革 → 皮革',
      '带焚香或烟 → 焚香',
      '无（兜底）',
    ],
    examples: [
      'MFK Grand Soir',
      'Amouage Gold Man（据库内 notes）',
    ],
  };
  a.mergedFrom = [...(a.mergedFrom || []), 'resinous'].filter((v, i, arr) => arr.indexOf(v) === i);

  take(fam('amber').subfamilies, 'resinous');
  take(fam('amber').rules, 'resinous');
}

/* ============================================================
   A2 删两个选项；铃兰并入白花
   ============================================================ */
{
  take(fam('citrus').subfamilies, 'citrus-floral');
  take(fam('citrus').rules, 'citrus-floral');

  /* 柑橘原来的 priority 10 槽位空了：橙花/橙花油不再有专属规则，
     会一路落到兜底 cologne —— 这正是"删掉这个选项"的语义。
     cologne 的 boundary 与 desc 里对它的引用一并清掉（见下）。 */
  const cologne = sub('citrus', 'cologne');
  eq('cologne 原 boundary.exclude[0]', cologne.boundary.exclude[0], '含橙花 → 柑橘花香');
  cologne.boundary.check = [
    '不含 petitgrain / galbanum',
    '不含 lavender / rosemary / sage / thyme / mint / basil',
  ];
  cologne.boundary.exclude = [
    '含苦橙叶或白松香 → 青绿柑橘',
    '含芳香草本 → 芳香柑橘',
  ];
  /* 旧 desc 主张"柑橘+草本+极淡木质，三层都要有"，与自己的 boundary
     （不含薰衣草/迷迭香/鼠尾草）以及新的 descWheel（最经典的柑橘）直接矛盾 ——
     草本那半句是删 citrus-floral 时代之前遗留的，这里按新身份重写。 */
  cologne.desc = '最经典的一路：柠檬与佛手柑的酸亮在前、极淡的木质与麝香收尾，没有花、没有叶、没有草本';

  const gf = sub('floral', 'green-floral');
  eq('green-floral 原 notes', gf.notes, ['lily of the valley', 'hyacinth', 'violet leaf']);
  take(fam('floral').subfamilies, 'green-floral');
  take(fam('floral').rules, 'green-floral');

  const wf = sub('floral', 'white-floral');
  wf.notes = [...wf.notes, 'lily of the valley'];
  /* 规则要跟着走：铃兰原来由 green-floral（priority 30）判，那一格删了。
     若不进白花的 any 表，含铃兰的瓶子会一路掉到兜底玫瑰。 */
  const wfRule = fam('floral').rules.find((x) => x.id === 'white-floral');
  wfRule.any = [...wfRule.any, 'lily of the valley'];
  wfRule.why = '白花＝吲哚类的厚与扩；茉莉/晚香玉/依兰是三种强度，铃兰 2026-11-17 由绿叶花香并入';
  /* 旧 desc 把"栀子"列为白花代表，而栀子现在单独成了 soliflore（栀子桂花）的一号花 ——
     与新 descWheel 直接矛盾，改掉；补上刚并进来的铃兰。 */
  wf.desc = '茉莉、晚香玉、铃兰、依兰。浓郁、有存在感、易晕香；依兰是"暖白花"那一支';
  wf.boundary.check = [
    '不含前述',
    '含 jasmine / tuberose / ylang-ylang / gardenia / magnolia / lily of the valley 之一',
  ];
}

/* ============================================================
   A3 新增：美食调 coffee-cocoa
   ============================================================ */
{
  const g = fam('gourmand');
  const vg = sub('gourmand', 'vanilla-gourmand');

  /* 咖啡/巧克力原先只是 vanilla-gourmand 的一个 label（brewed，zh 恰好就叫「咖啡可可」）。
     新类独立之后那个 label 就是重复分类，删掉、归属交给新类。 */
  const brewed = (vg.labels || []).findIndex((x) => x.id === 'brewed');
  if (brewed < 0) throw new Error('vanilla-gourmand 的 brewed label 不见了');
  vg.labels.splice(brewed, 1);

  g.subfamilies.unshift({
    id: 'coffee-cocoa',
    zh: '咖啡可可',
    en: 'Coffee & Cocoa',
    desc: '现磨咖啡的焦苦加黑巧克力的苦甜：烘焙线，苦在前、甜在后，和香草美食的奶甜是两条路',
    notes: ['coffee', 'chocolate', 'cocoa'],
    descWheel: '现磨咖啡加黑巧克力，苦里带甜',
    tier: 1,
    boundary: {
      check: [
        '含 coffee / chocolate / cocoa 之一',
        '苦味在前、甜在后（香草只作收尾）',
      ],
      exclude: [
        '只有香草与零陵香豆、无咖啡/巧克力 → 香草美食',
        '果味在前、咖啡只是陪衬 → 果味美食',
      ],
      examples: [
        'Montale Chocolate Greedy（chocolate + coffee）',
        'Kilian Paris Intoxicated（coffee + cardamom + vanilla）',
      ],
    },
  });

  /* 级联规则：美食调此前**没有** rules，scoring.js 的 boundaryPenalty 读 fam.rules，
     没有就直接 return 1（不罚）。这里补齐，且**只写定版要求的那一条关系**：
       coffee-cocoa(10) 先于 vanilla-gourmand(90) —— 含 coffee/chocolate 的归咖啡可可。
     特意不写 fruity-gourmand 的中间规则：那会让「果味在前」也参与判别，
     从而顺手把选香草美食时的 336 瓶果味/焦糖瓶一起乘 0.82（实测），
     那是本次定版没要求的改动，属于顺手扩大范围。
     不写它，含苹果黑加仑但无咖啡的瓶子走兜底 vanilla-gourmand，与 v2.2 行为一致。 */
  g.rules = [
    {
      id: 'coffee-cocoa',
      priority: 10,
      any: ['coffee', 'chocolate', 'cocoa'],
      why: '含 coffee/chocolate 时优先于 vanilla-gourmand：烘焙的苦盖得住香草的奶甜，反过来不成立',
    },
    {
      id: 'vanilla-gourmand',
      priority: 90,
      always: true,
      fallback: true,
      why: '兜底：香草荚 + 零陵香豆的奶甜，无咖啡/巧克力强特征时归此',
    },
  ];
  g.rulesVersion = V23;
  g.rulesNote = fam('citrus').rulesNote;
}

/* ============================================================
   A4 改名（只改 zh，id 不动）
   ============================================================ */
{
  const sf = sub('floral', 'soliflore');
  eq('soliflore 原 zh', sf.zh, '单一花');
  sf.zh = '栀子桂花';
  sf.desc = '只做一种花：栀子的奶甜与桂花的蜜甜各自单独出场，木兰与小苍兰同理，不做混花束';
  sf.descWheel = '一朵花唱主角：栀子的奶甜、桂花的蜜甜';

  const w = sub('woody', 'woody');
  eq('woody/woody 原 zh', w.zh, '木质');
  w.zh = '雪松苔藓';
  w.descWheel = '铅笔木屑的干爽加一点青苔，像刚削开的铅笔';
}

/* ============================================================
   A5 descWheel 全部 22 个小类换成定稿（逐字，不许改字）
   ============================================================ */
const WHEEL = {
  cologne: '最经典的柑橘：柠檬佛手柑的酸亮清爽，像老牌古龙水',
  'green-citrus': '青皮橘子的苦绿味，像咬开一颗没熟的橙子',
  'aromatic-citrus': '薰衣草肥皂加柑橘，像理发店的剃须水',
  rose: '新鲜玫瑰花瓣的味道，从清甜到浓艳都有',
  'white-floral': '茉莉晚香玉的浓香，存在感最强，喷一点满屋都是',
  'fruity-floral': '花香里垫着桃子和梨，甜润不腻',
  'powdery-floral': '爽身粉和粉笔的粉感，干、柔、带一点脂粉气',
  soliflore: '一朵花唱主角：栀子的奶甜、桂花的蜜甜',
  sandalwood: '奶香木头，软暖贴肤，像高级护手霜的底味',
  vetiver: '干草和泥土的苦味，像晒干的草根，带一点烟感',
  oud: '沉香味：最深最沉的木头，带药香和烟熏，像老药柜',
  woody: '铅笔木屑的干爽加一点青苔，像刚削开的铅笔',
  amber: '甜暖厚实，像焦糖和冬天的毛毯，越闻越暖',
  incense: '寺庙烧香的烟味，干、静、带灰烬感',
  leather: '皮包和皮衣的味道，带烟熏，酷而干',
  aquatic: '海水和泳池的清凉感，像刚从水里出来',
  green: '刚割的草和掐断的叶子，青绿清新',
  fougere: '老派男香：薰衣草、青苔、剃须膏的味道',
  tea: '绿茶红茶的清香，淡、净、不甜腻',
  'vanilla-gourmand': '香草冰淇淋和焦糖布丁的甜香',
  'fruity-gourmand': '水蜜桃和苹果派的果甜，甜但清爽',
  'coffee-cocoa': '现磨咖啡加黑巧克力，苦里带甜',
};
{
  const all = t.families.flatMap((f) => (f.subfamilies || []).map((s) => ({ f, s })));
  if (all.length !== 22) throw new Error(`改完应有 22 个小类，实际 ${all.length}`);
  const missing = all.filter((x) => !WHEEL[x.s.id]).map((x) => x.s.id);
  if (missing.length) throw new Error(`descWheel 定稿缺这几种：${missing.join(',')}`);
  const extra = Object.keys(WHEEL).filter((id) => !all.some((x) => x.s.id === id));
  if (extra.length) throw new Error(`descWheel 定稿多出这几种：${extra.join(',')}`);
  for (const { s } of all) s.descWheel = WHEEL[s.id];
}

/* ============================================================
   A6 desc / oneLine：其余小类只在与新 descWheel 直接矛盾时才动
   ============================================================ */
{
  /* 茶香：旧 desc 明说"不是绿茶的清新"，新 descWheel 却写"绿茶红茶的清香"——
     这是直接矛盾，重写。同时补 coreNotes（B2 的口径数据），
     值取库内实际存在的茶本味词：green tea / black tea 字面 0，只有 tea 有 38 瓶。 */
  const tea = sub('fresh', 'tea');
  eq('tea 原 desc 首句', tea.desc.slice(0, 6), '伯爵茶结构：');
  tea.desc = '茶叶的干薄为骨、佛手柑为面、茉莉为尾：绿茶的清与红茶的醇都在这一支，讲究干与净，不是糖水';
  tea.coreNotes = ['tea'];

  /* 水生：删 sea salt（字面 0 / 引擎 0 的死链），补库内实际写法。
     五条里三条是库里逐字存在的 surface：sea notes 30 / aquatic accord 17 / salt 12；
     calone 4、melon 19、driftwood 4 保留。 */
  const aq = sub('fresh', 'aquatic');
  eq('aquatic 原 notes', aq.notes, ['calone', 'melon', 'sea salt', 'driftwood']);
  aq.notes = ['calone', 'melon', 'sea notes', 'aquatic accord', 'salt', 'driftwood'];
  /* label 里也挂着一份 sea salt，同步换掉，否则"已删的词"还活在同一份数据里 */
  const saline = (aq.labels || []).find((x) => x.id === 'saline');
  eq('saline label 原 notes', saline.notes, ['sea salt', 'driftwood']);
  saline.notes = ['salt', 'driftwood'];
  /* desc 里的"melone"是拼写变体（库内是 melon），且"盐"现在有了正字 salt */
  aq.desc = '西瓜酮类的海水／泳池感：calone 与 melon 给水感，salt 给皮肤上的干盐粒';
}

/* ============================================================
   A7 词表对齐：大类 representativeNotes
   ============================================================ */
{
  const citrus = fam('citrus');
  eq('citrus 原 representativeNotes', citrus.representativeNotes, ['bergamot', 'lemon', 'neroli / orange blossom']);
  /* 带斜杠的写法不是库内的任何一条 surface（字面 0），拆成两条 ——
     两条在库里各自逐字存在：neroli 84 / orange blossom 205。 */
  citrus.representativeNotes = ['bergamot', 'lemon', 'neroli', 'orange blossom'];

  const woody = fam('woody');
  eq('woody 原 representativeNotes', woody.representativeNotes, ['patchouli', 'cedar', 'sandalwood']);
  /* cedar 字面 0（库内一律写 Cedarwood，380 瓶） */
  woody.representativeNotes = ['patchouli', 'cedarwood', 'sandalwood'];

  const fresh = fam('fresh');
  eq('fresh 原 representativeNotes', fresh.representativeNotes, ['lavender', 'green tea', 'marine notes']);
  /* marine notes 字面 0（库内写 Sea Notes 30 / Aquatic Accord 17 / Salt 12）→ 换成 sea notes；
     green tea 字面 0（库内一律写 Tea，38 瓶）→ 换成 tea，与 noteIndex 的 en 仍是同一条目。 */
  fresh.representativeNotes = ['lavender', 'sea notes', 'tea'];
}

/* ============================================================
   A7 续：noteIndex 的两处连带
   ============================================================ */
{
  /* ① 被删的三个小类在 noteIndex 里有归属，别留悬挂引用：
        neroli / orange blossom → cologne（橙花不再有专属格，落兜底）
        lily of the valley      → white-floral（A2 明确并入）
        frankincense / myrrh    → incense（resinous 并入 amber；烟与树脂一路） */
  const ent = (en) => {
    const e = t.noteIndex.entries.find((x) => x.en === en);
    if (!e) throw new Error(`noteIndex 没有 ${en}`);
    return e;
  };
  eq('noteIndex neroli 原归属', ent('neroli / orange blossom').subfamily, 'citrus-floral');
  ent('neroli / orange blossom').subfamily = 'cologne';
  eq('noteIndex lily of the valley 原归属', ent('lily of the valley').subfamily, 'green-floral');
  ent('lily of the valley').subfamily = 'white-floral';
  eq('noteIndex frankincense 原归属', ent('frankincense').subfamily, 'resinous');
  ent('frankincense').subfamily = 'incense';
  eq('noteIndex myrrh 原归属', ent('myrrh').subfamily, 'resinous');
  ent('myrrh').subfamily = 'incense';

  /* ② cocoa 是全库唯一 0 命中的活香调条目（字面 0 / 引擎 0）。
     库内这一味写作 Chocolate（25 瓶），按 notes.js 的既定做法（Cedarwood / Tea
     都用 aliases 显式列出）加别名；不动 en（en 承载中文名「可可」，
     动它会连带改掉 chip 文案与 coffee-cocoa 的词表写法）。 */
  const cocoa = ent('cocoa');
  if ((cocoa.aliases || []).length) throw new Error('cocoa 已有 aliases，不要重复加');
  cocoa.aliases = ['chocolate'];

  /* ③ coffee-cocoa 的 notes 里保留 cocoa 这个 id 是为了让引擎的词表里留住「可可」
     这一味的入口；它与 chocolate 指向同一批瓶（别名），所以去重后实为两味。 */
}

/* ============================================================
   版本与说明
   ============================================================ */
{
  t.version = '2.3.0';
  t.updated = V23;
  t.mergeNote = 'v2.3 依 2026-11-17 审计（D/F/G/H 节）定版：树脂→琥珀、删柑橘花香与绿叶花香'
    + '（铃兰并入白花）、新增咖啡可可。24 类 → 22 类；木质的 woody 改名"雪松苔藓"、'
    + '单一花改名"栀子桂花"（id 不动）；全部 22 条 descWheel 换新手口语版；note 词表按 perfumes.json 实际写法对齐。';
  t.note = [
    t.note.split(' | ')[0],
    '2026-10-31 v2.0.0：按 _audit/CLASSIFICATION-AUDIT-20261031.md 的 P0–P3 处置执行，32 类 → 28 类（合并 3、降级 2、拆分 1），并同步 noteIndex 与全部 notes。',
    '2026-10-31 v2.1.0：四族（citrus/woody/floral/amber）新增优先级级联 rules 与每类 boundary；不增删小类，fresh/gourmand 结构未动。',
    '2026-11-01 v2.2.0：合并冷/暖焚香→焚香、香草/辛香琥珀→琥珀、芳香木质/苔藓木质/干燥木质→木质（24 类）。规则表同步重写；木质新增 sandalwood 优先于 vetiver 的显式次序。',
    '2026-11-17 v2.3.0：树脂→琥珀（24→22）；删柑橘花香与绿叶花香（铃兰并入白花）；新增咖啡可可并给美食调补第一份级联 rules（coffee/chocolate 优先于 vanilla-gourmand）；soliflore→「栀子桂花」、woody/woody→「雪松苔藓」（只改 zh，id 不动）；22 条 descWheel 全部换新手口语版；note 词表按 perfumes.json 实际写法对齐（sea salt 删除、cedar→cedarwood、marine notes→sea notes、neroli / orange blossom 拆两条、cocoa 加 chocolate 别名）；茶香新增 coreNotes。',
  ].join(' | ');
}

/* 四个原本带 rulesVersion 的大类同步到本次定版日；gourmand 新增规则表也标同一天。 */
for (const id of ['citrus', 'floral', 'woody', 'amber', 'gourmand']) {
  const f = fam(id);
  if (f.rules) f.rulesVersion = V23;
}

fs.writeFileSync(FILE, JSON.stringify(t, null, 2) + '\n');
console.log('✓ taxonomy.json → 2.3.0');
console.log('  小类数：', t.families.reduce((n, f) => n + (f.subfamilies || []).length, 0));
for (const f of t.families) console.log(`  ${f.id.padEnd(9)} ${(f.subfamilies || []).length} 类  rules=${f.rules ? f.rules.length : '—'}  rv=${f.rulesVersion || '—'}`);
