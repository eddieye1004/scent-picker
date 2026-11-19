/**
 * _v6-mapping.mjs — 补回生活短语映射层 + 预算池 + 方向反推（一次性工具）
 *
 * 这三段在第一次编辑里写过，但后来为了恢复被误删的 1300 行做过 git checkout，
 * 一并被抹掉了。这次插在 stepHead() 之后（所有 render 之前）。
 *
 * 插入点用 `/* ---------- 圆盘选择器（第 1、2 步共用）----------` 定位 —— 它只出现 1 次。
 */
import fs from 'node:fs';

const P = 'app.js';
let s = fs.readFileSync(P, 'utf8');
const MARK = '/* ---------- 圆盘选择器（第 1、2 步共用）----------';
const n = s.split(MARK).length - 1;
if (n !== 1) throw new Error('插入点出现 ' + n + ' 次');

const BLOCK = `/* ============================================================
   生活短语映射层（2026-11-16 v6）
   ------------------------------------------------------------
   规格底线：「全程无香调术语题」。实现的唯一手段就是这个表 ——
   屏上只有短语（「刚剥开的橘子皮」），引擎只认香材（bergamot / lemon），
   两者在这一层对上。**术语不上屏**，但它没有消失：它活在映射里，
   结果页的理由还会把它翻回人话（见 zhOfPhrases）。

   ==== 短语怎么来的（不是新编题目，是对已备数据的重排）====
   每条短语都对应 data/taxonomy.json 的 noteIndex 里真实存在的条目
   （notes 字段就是那些 en 名，构建时用 normNote 对过别名）。
   分组沿用六族，但屏上不出现族名 —— 用户按"我闻到过这个东西"点，
   而不是按"这是柑橘调"点。

   ==== 每条短语都实测有货 ====
   注释里的数字是 1388 瓶里至少含其中一味原料的瓶数（node 脚本实算，
   命中口径 = notesAll 归一化后精确匹配）。低于 LIVE_NOTE_MIN 的短语
   直接不上屏 —— 与 v5 挡住「可可」是同一条规则：勾了永远推荐不出东西的
   选择，等于骗用户一次点击。 */
const LIFE_NOTES = [
  /* ---- 果皮 / 明亮的开场 ---- */
  { id: 'citrus-peel', zh: '刚剥开的橘子皮', hint: '手上那一下清亮的油', family: 'citrus',
    notes: ['bergamot', 'lemon', 'grapefruit'] },          // 661 瓶
  { id: 'green-twig', zh: '掐断的绿枝', hint: '断口的涩味，不是花的香', family: 'fresh',
    notes: ['violet leaf', 'galbanum', 'petitgrain'] },    // 100 瓶
  { id: 'cold-tea', zh: '一杯放凉的茶', hint: '不甜、有一点涩', family: 'fresh',
    notes: ['green tea'] },                                // 39 瓶
  { id: 'sea-wind', zh: '湿润的海风', hint: '空气里的水汽和一点咸', family: 'fresh',
    notes: ['marine notes'] },                             // 58 瓶
  /* ---- 花 ---- */
  { id: 'rose-garden', zh: '花园里的玫瑰', hint: '花心深处那点甜', family: 'floral',
    notes: ['rose', 'peony'] },                            // 425 瓶
  { id: 'night-white', zh: '夜里开的白花', hint: '走近才有，很远也压不住', family: 'floral',
    notes: ['jasmine', 'tuberose', 'ylang-ylang'] },       // 455 瓶
  { id: 'osmanthus', zh: '桂花糖', hint: '秋天路边那种甜', family: 'floral',
    notes: ['osmanthus'] },                                // 34 瓶
  { id: 'lotiony-powder', zh: '奶油味的粉', hint: '爽身粉、化妆盒', family: 'floral',
    notes: ['iris', 'violet'] },                           // 244 瓶
  /* ---- 甜 / 果实 ---- */
  { id: 'ripe-peach', zh: '熟透的桃子', hint: '汁水、果皮、一点酒味', family: 'gourmand',
    notes: ['peach', 'pear', 'apple'] },                   // 252 瓶
  { id: 'vanilla-ice', zh: '香草冰淇淋', hint: '冷的时候也能闻到的甜', family: 'gourmand',
    notes: ['vanilla', 'tonka bean'] },                    // 616 瓶
  /* ---- 木 / 地 ---- */
  { id: 'sunlit-wood', zh: '晒过的旧木头', hint: '干、暖、不甜', family: 'woody',
    notes: ['sandalwood', 'cedar'] },                      // 624 瓶
  { id: 'pine-wind', zh: '松林里的风', hint: '针叶、树脂、清苦', family: 'woody',
    notes: ['juniper', 'cypress'] },                       // 84 瓶
  { id: 'after-rain', zh: '雨后的土地', hint: '湿土、苔藓、树根', family: 'woody',
    notes: ['vetiver', 'patchouli', 'oakmoss'] },          // 673 瓶
  { id: 'old-medicine', zh: '古老的药木', hint: '深色木头 + 一点药味', family: 'woody',
    notes: ['oud', 'saffron'] },                           // 183 瓶
  /* ---- 树脂 / 烟 ---- */
  { id: 'incense-ash', zh: '寺庙的香灰', hint: '烟散了以后留在空气里的那层', family: 'amber',
    notes: ['incense', 'myrrh', 'frankincense'] },         // 162 瓶
  { id: 'amber-resin', zh: '琥珀色的树脂', hint: '温、稠、贴皮肤', family: 'amber',
    notes: ['amber', 'benzoin'] },                         // 606 瓶
  { id: 'leather-sofa', zh: '皮沙发', hint: '坐久了有体温的那种皮', family: 'amber',
    notes: ['leather'] },                                  // 136 瓶
  /* ---- 草本 ---- */
  { id: 'lavender-field', zh: '薰衣草田', hint: '干净、微苦、不甜', family: 'fresh',
    notes: ['lavender', 'sage'] },                         // 217 瓶
];

/* 一条短语至少要在多少瓶里出现才上屏。
   取 12：本表最低是「桂花糖」34 瓶，圈过预算之后仍能剩十来个；
   再低的（个位数）勾了也挑不出三瓶不同的，那比不提供更糟。 */
const LIVE_NOTE_MIN = 12;

/* 归一化比对走 notes.js 的 normNote，与引擎同一套 ——
   taxonomy 的 en 写法不统一（"neroli / orange blossom"、"Tonka Bean"），
   自己写一套正则会和引擎分叉。 */
let lifeNoteIndex = null;
function lifeNoteHitCount() {
  if (lifeNoteIndex) return lifeNoteIndex;
  const perfs = DATA?.perfumes || [];
  const entries = TAX?.noteIndex?.entries || [];
  /* 先把每条短语要查的 key 展开好（含别名），避免在 1388×18 的双层循环里反复 find。 */
  const keysOf = new Map();
  for (const d of LIFE_NOTES) {
    const keys = new Set();
    for (const en of d.notes) {
      const norm = normNote(en);
      keys.add(norm);
      const e = entries.find((x) => normNote(x.en) === norm || (x.aliases || []).some((a) => normNote(a) === norm));
      if (e) {
        keys.add(normNote(e.en));
        for (const a of (e.aliases || [])) keys.add(normNote(a));
      }
    }
    keysOf.set(d.id, keys);
  }
  const out = new Map();
  for (const p of perfs) {
    const bag = new Set((p.notesAll || []).map((n) => normNote(n)));
    for (const [id, keys] of keysOf) {
      for (const k of keys) {
        if (bag.has(k)) { out.set(id, (out.get(id) || 0) + 1); break; }
      }
    }
  }
  lifeNoteIndex = out;
  return out;
}

/* 上屏的短语。数据没到齐时先给全表（不让首屏空着），到齐后按实测过滤。 */
function livePhrases() {
  if (!DATA?.perfumes?.length || !TAX) return LIFE_NOTES.slice();
  const hits = lifeNoteHitCount();
  return LIFE_NOTES.filter((d) => (hits.get(d.id) || 0) >= LIVE_NOTE_MIN);
}

/* 短语 → 香材 en 列表（去重）。写进 likedNotes / dislikedNotes 的就是它。 */
function notesOfPhrases(ids) {
  const out = [];
  const seen = new Set();
  for (const id of ids || []) {
    const d = LIFE_NOTES.find((x) => x.id === id);
    for (const en of (d ? d.notes : [])) {
      const k = normNote(en);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(en);
    }
  }
  return out;
}

/* 短语 → 中文显示名。理由里回显**短语**而不是原料名 ——
   用户在屏上看到的是「刚剥开的橘子皮」，理由里就该是这句。 */
function zhOfPhrases(ids) {
  const out = {};
  for (const id of ids || []) {
    const d = LIFE_NOTES.find((x) => x.id === id);
    if (!d) continue;
    for (const en of d.notes) out[en] = d.zh;
  }
  return out;
}

/* ---------- 预算池（映射层，不碰引擎） ----------
   预算不是偏好证据，是**候选范围**。所以它不进 answers 的打分字段，
   只在调用 recommend() 之前把 perfumes 数组切一刀。引擎一行不动。

   三条降级，都让"选不出的档"退回更宽的范围而不是给空结果：
     ① 该档瓶数 < 12（topN × 4）→ 不加限制（档太窄，圈了等于没货）；
     ② 限制后引擎仍凑不满 3 瓶 → finish() 用全库重算一次；
     ③ 价位未知的瓶子：选具体档时**不参与**（不是"当作便宜"）。
   为什么要 ③：价位未知的 766 瓶里既有 200 元的也有 3000 元的。把它们塞进
   「300 元以内」，用户点开购买链接会发现价格翻十倍 —— 一次信任损耗。
   界面必须把这句话写出来，见 renderBudget 的说明行。 */
let PRICE_INDEX = null;
function priceIndex() { return PRICE_INDEX; }

function poolForBudget(perfumes, budgetId) {
  const idx = priceIndex();
  if (!idx || !budgetId || budgetId === (idx.anyId || 'any')) return perfumes;
  const ids = idx.bandOfId ? idx.bandOfId[budgetId] : null;
  if (!Array.isArray(ids) || !ids.length) return perfumes;
  const keep = new Set(ids);
  const pool = perfumes.filter((p) => keep.has(p.id));
  /* ① 档太窄：不如不圈。12 = topN(3) × 4，留足家族/品牌去重后的余量。 */
  if (pool.length < 12) return perfumes;
  return pool;
}

/* ---------- 大方向 → 气质原型（引擎的 character 因子仍按原样工作） ----------
   为什么需要这一步：v6 第 2 屏就是大方向，而 v5 的「气质」屏已退场。
   character 是引擎里权重不低的一维（16 分），缺了它等于白丢一维证据。
   这不是新信息，是把用户刚答的那句话翻译成引擎认识的字段。 */
const EMOTION_TAGS = {
  cold: { tags: ['clean', 'green', 'herbal'], neg: ['sweet', 'creamy'] },
  warm: { tags: ['warm', 'amber', 'resinous'], neg: ['green', 'salty'] },
  clean: { tags: ['clean', 'fresh', 'soapy'], neg: ['smoky', 'leathery'] },
  mysterious: { tags: ['smoky', 'leathery', 'resinous'], neg: ['clean', 'fruity'] },
  bright: { tags: ['citrusy', 'fresh', 'fruity'], neg: ['smoky', 'leathery'] },
  lazy: { tags: ['creamy', 'musky', 'powdery'], neg: ['citrusy', 'sharp'] },
};

function applyDirectionToCharacter(emotionId) {
  const t = EMOTION_TAGS[emotionId];
  state.answers.characterTags = t ? t.tags.slice() : [];
  state.answers.characterNeg = t ? t.neg.slice() : [];
  state.answers.characterPreset = null;
  /* temperature / sweetness 也由方向反推（引擎读这两维）。
     口径与 v5 的 deriveFromPreset 一致，只是来源从"七个原型"换成"六个大方向"。 */
  const T = {
    cold: { temperature: 'cool', sweetness: 0 },
    warm: { temperature: 'warm', sweetness: 2 },
    clean: { temperature: 'cool', sweetness: 1 },
    mysterious: { temperature: 'warm', sweetness: 1 },
    bright: { temperature: 'cool', sweetness: 1 },
    lazy: { temperature: 'warm', sweetness: 2 },
  }[emotionId];
  state.answers.temperature = T ? T.temperature : null;
  state.answers.sweetness = T ? T.sweetness : null;
}

`;

s = s.replace(MARK, BLOCK + MARK);
fs.writeFileSync(P, s);
console.log('✓ 映射层已补回');
