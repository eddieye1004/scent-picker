/**
 * probe-v23-conformance.mjs — 逐字核对 v2.3.0 的定稿项，防止"差不多就行"。
 *
 * 为什么单独一条：descWheel 22 条是**逐字定稿**（Eddie 2026-11-17），
 * 差一个字（比如"像理发店的剃须水"写成"像理发店剃须水"）在页面上一眼看不出来，
 * 但那是没按定稿交付。这条把定稿原文写进判据里硬比。
 *
 * 用法：node scripts/probe-v23-conformance.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const TAX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));

let pass = 0;
const fails = [];
const ok = (name, cond, detail) => {
  if (cond) { pass += 1; return; }
  fails.push(`${name}${detail ? ' :: ' + detail : ''}`);
};

/* 定稿原文（任务书 A5，逐字）。顺序也照定稿：六族循环、族内按数据顺序。 */
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

const all = TAX.families.flatMap((f) => (f.subfamilies || []).map((s) => ({ fam: f.id, s })));

ok('版本号 = 2.3.0', TAX.version === '2.3.0', TAX.version);
ok('小类总数 = 22', all.length === 22, String(all.length));
ok('大类仍是 6 个', TAX.families.length === 6, String(TAX.families.length));

/* 族内数量：3/5/4/3/4/3 */
{
  const dist = TAX.families.map((f) => `${f.id}:${f.subfamilies.length}`);
  ok('族内小类数 = citrus3 floral5 woody4 amber3 fresh4 gourmand3',
    JSON.stringify(dist) === JSON.stringify(['citrus:3', 'floral:5', 'woody:4', 'amber:3', 'fresh:4', 'gourmand:3']),
    dist.join(' '));
}

/* descWheel 逐字 */
{
  const bad = all.filter(({ s }) => s.descWheel !== WHEEL[s.id])
    .map(({ s }) => `${s.id}:「${s.descWheel}」≠「${WHEEL[s.id]}」`);
  ok('22 条 descWheel 与定稿逐字一致', bad.length === 0, bad.join(' ; '));
  ok('descWheel 无遗漏（22 条全在判据里）', all.every(({ s }) => WHEEL[s.id]), '');
}

/* 合并 / 删除 / 新增 / 改名的结果 */
{
  const byId = new Map(all.map(({ fam, s }) => [s.id, { fam, s }]));
  ok('resinous 已不存在', !byId.has('resinous'));
  ok('citrus-floral 已不存在', !byId.has('citrus-floral'));
  ok('green-floral 已不存在', !byId.has('green-floral'));
  ok('coffee-cocoa 存在且在 gourmand 下',
    byId.get('coffee-cocoa')?.fam === 'gourmand', byId.get('coffee-cocoa')?.fam);
  ok('coffee-cocoa 的 notes = [coffee, chocolate, cocoa]',
    JSON.stringify(byId.get('coffee-cocoa').s.notes) === JSON.stringify(['coffee', 'chocolate', 'cocoa']),
    JSON.stringify(byId.get('coffee-cocoa').s.notes));
  ok('coffee-cocoa 的 zh = 咖啡可可', byId.get('coffee-cocoa').s.zh === '咖啡可可');

  /* 琥珀并入了树脂的原料 */
  const amberNotes = byId.get('amber').s.notes;
  ok('amber 的 notes 并入了 resinous 的三味（benzoin/labdanum/myrrh 全在）',
    ['benzoin', 'labdanum', 'myrrh'].every((n) => amberNotes.includes(n)), amberNotes.join(','));
  ok('amber 的 notes 无重复', new Set(amberNotes).size === amberNotes.length, amberNotes.join(','));
  ok('amber 的 mergedFrom 记了 resinous',
    (byId.get('amber').s.mergedFrom || []).includes('resinous'),
    JSON.stringify(byId.get('amber').s.mergedFrom));
  ok('amber 的 boundary 文本提到了乳香/没药/安息香的教堂感',
    /乳香/.test(JSON.stringify(byId.get('amber').s.boundary)) && /教堂/.test(JSON.stringify(byId.get('amber').s.boundary)),
    JSON.stringify(byId.get('amber').s.boundary).slice(0, 120));

  /* 铃兰进了白花 */
  ok('white-floral 的 notes 含 lily of the valley',
    byId.get('white-floral').s.notes.includes('lily of the valley'),
    byId.get('white-floral').s.notes.join(','));

  /* 改名只改 zh，id 不动 */
  ok('soliflore 的 zh = 栀子桂花', byId.get('soliflore').s.zh === '栀子桂花', byId.get('soliflore').s.zh);
  ok('soliflore 仍在 floral 下（id 未动）', byId.get('soliflore').fam === 'floral');
  ok('woody 小类 zh = 雪松苔藓', byId.get('woody').s.zh === '雪松苔藓', byId.get('woody').s.zh);
  ok('woody 小类仍在 woody 大类下', byId.get('woody').fam === 'woody');
}

/* 级联规则的引用完整性：rules 里的 id 必须都是现存小类 */
{
  const ids = new Set(all.map(({ s }) => s.id));
  const bad = [];
  for (const f of TAX.families) {
    for (const r of (f.rules || [])) {
      if (!ids.has(r.id)) bad.push(`${f.id}/rules:${r.id}`);
    }
  }
  ok('rules 里不残留被删小类的 id', bad.length === 0, bad.join(','));
  ok('noteIndex 里不残留被删小类的归属',
    TAX.noteIndex.entries.every((e) => !['citrus-floral', 'green-floral', 'resinous'].includes(e.subfamily)),
    TAX.noteIndex.entries.filter((e) => ['citrus-floral', 'green-floral', 'resinous'].includes(e.subfamily)).map((e) => e.en).join(','));

  /* gourmand 的级联次序：coffee-cocoa 必须早于 vanilla-gourmand */
  const g = TAX.families.find((f) => f.id === 'gourmand');
  ok('gourmand 已有 rules', Array.isArray(g.rules) && g.rules.length > 0, String(g.rules && g.rules.length));
  const pri = (id) => (g.rules.find((r) => r.id === id) || {}).priority;
  ok('coffee-cocoa 的 priority 小于 vanilla-gourmand（含咖啡时优先）',
    pri('coffee-cocoa') < pri('vanilla-gourmand'),
    `coffee-cocoa=${pri('coffee-cocoa')} vanilla=${pri('vanilla-gourmand')}`);
  ok('gourmand 的 rules 有一条兜底', g.rules.some((r) => r.fallback), '');
}

/* 茶香的 coreNotes */
{
  const tea = TAX.families.find((f) => f.id === 'fresh').subfamilies.find((s) => s.id === 'tea');
  ok('茶香有 coreNotes', Array.isArray(tea.coreNotes) && tea.coreNotes.length > 0, JSON.stringify(tea.coreNotes));
  ok('茶香的 coreNotes 是库内实际存在的写法（tea）',
    JSON.stringify(tea.coreNotes) === JSON.stringify(['tea']), JSON.stringify(tea.coreNotes));
  ok('茶香的 coreNotes 都包含在自身 notes 里',
    tea.coreNotes.every((n) => tea.notes.includes(n)), JSON.stringify([tea.notes, tea.coreNotes]));
}

/* 水生 notes 的对齐结果 */
{
  const aq = TAX.families.find((f) => f.id === 'fresh').subfamilies.find((s) => s.id === 'aquatic');
  ok('水生 notes 含 sea notes / aquatic accord / salt',
    ['sea notes', 'aquatic accord', 'salt'].every((n) => aq.notes.includes(n)), aq.notes.join(','));
  ok('水生 notes 已删除 sea salt', !aq.notes.includes('sea salt'), aq.notes.join(','));
  ok('水生 notes 保留了 calone / driftwood / melon',
    ['calone', 'driftwood', 'melon'].every((n) => aq.notes.includes(n)), aq.notes.join(','));
  ok('水生的 saline label 也不再挂 sea salt',
    !JSON.stringify(aq.labels || []).includes('sea salt'), JSON.stringify(aq.labels || []).slice(0, 160));
}

/* 大类 representativeNotes */
{
  const rep = (id) => TAX.families.find((f) => f.id === id).representativeNotes;
  ok('清新 representativeNotes 用 sea notes 而不是 marine notes',
    rep('fresh').includes('sea notes') && !rep('fresh').includes('marine notes'), rep('fresh').join(','));
  ok('木质 representativeNotes 用 cedarwood 而不是 cedar',
    rep('woody').includes('cedarwood') && !rep('woody').includes('cedar'), rep('woody').join(','));
  ok('柑橘 representativeNotes 已把 neroli / orange blossom 拆成两条',
    rep('citrus').includes('neroli') && rep('citrus').includes('orange blossom')
      && !rep('citrus').some((n) => n.includes('/')), rep('citrus').join(','));
}

console.log(`\nPASS ${pass}  FAIL ${fails.length}`);
if (fails.length) {
  for (const f of fails) console.log('  ✗ ' + f);
  process.exitCode = 1;
}
