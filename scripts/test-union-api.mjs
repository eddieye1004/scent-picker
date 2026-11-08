/**
 * test-union-api.mjs — 联盟 API 客户端与匹配器的自测
 * 用法: node scripts/test-union-api.mjs
 *
 * 为什么值得单独一测：签名写错了不会有任何提示，只会回一句
 * "签名错误 / invalid signature"，而一次错误会浪费掉一整轮调用配额。
 * 这里用**固定向量**把签名钉住 —— 输入确定、输出必须逐字节相同。
 * 向量由当前实现的首次运行产出，人工核对过拼接规则（见
 * docs/AFFILIATE-API.md 第三节），此后任何改动使向量变化都必须解释清楚。
 *
 * 不联网，不发请求，不读环境变量。
 */
import {
  jdSign, buildJdParams, unwrapJd,
  taobaoSign, buildTaobaoParams, unwrapTaobao,
  gmt8Timestamp, jdValueString,
  normalizeTokens, scoreMatch, pickBest, categoryGate, taobaoQueryVariants,
} from './lib/union-api.mjs';

let pass = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) pass++;
  else failures.push(`${name}${detail ? ' :: ' + detail : ''}`);
};

const TS = '2026-11-03 13:00:00';

/* ---------- S 组：签名 ---------- */

/* S1 京东签名固定向量。
   拼串：secret + "360buy_param_json"+<json> + "app_key"+testkey + "format"json
        + "method"... + "sign_method"md5 + "timestamp"... + "v"1.0 + secret
   按 key 字典序，'360buy_param_json' 排在最前（数字小于字母）。 */
const jdP = buildJdParams({
  appKey: 'testkey',
  secret: 'testsecret',
  method: 'jd.union.open.goods.query',
  bizParams: { goodsReqDTO: { keyword: 'Creed Aventus', pageIndex: 1, pageSize: 20 } },
  timestamp: TS,
});
check('S1 京东签名向量', jdP.sign === '856B2E5425DA702504E20C9D8990BED5', jdP.sign);
check('S1 京东 bizParams 进 360buy_param_json',
  JSON.parse(jdP['360buy_param_json']).goodsReqDTO.keyword === 'Creed Aventus');
check('S1 京东签名为 32 位大写十六进制', /^[0-9A-F]{32}$/.test(jdP.sign));

/* S2 淘宝签名固定向量。空值参数必须被剔除，否则签出来是另一个值。 */
const tbP = buildTaobaoParams({
  appKey: 'testkey',
  secret: 'testsecret',
  method: 'taobao.tbk.dg.material.optional',
  biz: { q: 'Creed Aventus', adzone_id: 123456789, page_no: 1, page_size: 20, empty: '' },
  timestamp: TS,
});
check('S2 淘宝签名向量', tbP.sign === '064F73A06A1B7EF13D4520C96D86FCD1', tbP.sign);
check('S2 空值参数被剔除', !('empty' in tbP));
check('S2 签名为 32 位大写十六进制', /^[0-9A-F]{32}$/.test(tbP.sign));

/* S3 空值剔除真的影响签名（证明 S2 不是侥幸通过） */
const withEmpty = taobaoSign('testsecret', { ...tbP, empty: '' });
check('S3 带空值会算出不同签名', withEmpty !== tbP.sign, `${withEmpty} vs ${tbP.sign}`);

/* S4 签名对参数顺序不敏感（字典序排序），对值敏感 */
check('S4 顺序无关',
  jdSign('s', { a: '1', b: '2' }) === jdSign('s', { b: '2', a: '1' }));
check('S4 值敏感', jdSign('s', { a: '1' }) !== jdSign('s', { a: '2' }));
check('S4 密钥敏感', jdSign('s1', { a: '1' }) !== jdSign('s2', { a: '1' }));

/* S5 值序列化与官方 SDK 的 GetString 对齐 */
check('S5 数字转字面量', jdValueString(1) === '1');
check('S5 布尔转字面量', jdValueString(true) === 'true');
check('S5 对象走 JSON', jdValueString({ a: 1 }) === '{"a":1}');

/* S6 GMT+8 时间戳：换一个时区输入，输出不变 */
check('S6 时间戳按 UTC+8',
  gmt8Timestamp(new Date('2026-11-03T05:00:00Z')) === '2026-11-03 13:00:00');
check('S6 跨日进位',
  gmt8Timestamp(new Date('2026-11-03T16:30:00Z')) === '2026-11-04 00:30:00');
check('S6 格式固定', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(gmt8Timestamp()));

/* ---------- U 组：响应解包 ---------- */

/* U1 京东两层嵌套 + 官方拼错的 responce */
const jdBody = {
  jd_union_open_goods_query_responce: {
    queryResult: JSON.stringify({ code: 200, data: [{ skuId: 1, skuName: 'X' }], totalCount: 1 }),
  },
};
const jdUn = unwrapJd(jdBody, 'jd.union.open.goods.query');
check('U1 京东 queryResult 解包', jdUn.data[0].skuId === 1);

/* U2 转链接口用 result 而不是 queryResult */
const jdBody2 = {
  jd_union_open_promotion_common_get_responce: {
    result: JSON.stringify({ code: 200, data: { clickURL: 'https://u.jd.com/x' } }),
  },
};
check('U2 京东 result 解包',
  unwrapJd(jdBody2, 'jd.union.open.promotion.common.get').data.clickURL === 'https://u.jd.com/x');

/* U3 错误响应必须抛，不能返回 undefined 让调用方静默跳过。
   用真实网关的字段形状（en_desc / zh_desc），不是编的 msg。 */
let threw = '';
try {
  unwrapJd({ error_response: { code: '21', en_desc: 'Invalid app_key', zh_desc: 'key=x \uFFFD\uFFFD' } }, 'a.b');
} catch (e) { threw = e.message; }
check('U3 京东错误抛出且带英文描述', threw.includes('Invalid app_key'), threw);

/* U3b 中文描述里的乱码字节必须被替换成 '?'，不能把 U+FFFD 直接吐给用户。
   实测依据：京东声明 charset=utf-8，但 zh_desc 混着 GBK 字节。 */
check('U3b 中文乱码被清洗', !threw.includes('\uFFFD') && threw.includes('?'), threw);

/* U4 淘宝三层嵌套：xxx_response → result_list → map_data */
const tbBody = {
  tbk_dg_material_optional_response: {
    result_list: { map_data: [{ item_id: 1, title: 'Y', click_url: 'https://uland.taobao.com/x' }] },
    total_results: 1,
  },
};
const tbUn = unwrapTaobao(tbBody, 'taobao.tbk.dg.material.optional');
check('U4 淘宝解包取到 map_data', tbUn.result_list.map_data[0].item_id === 1);

/* U5 淘宝错误响应 */
threw = '';
try { unwrapTaobao({ error_response: { code: 40002, msg: 'invalid signature', sub_msg: 'sig' } }, 'a.b'); }
catch (e) { threw = e.message; }
check('U5 淘宝错误抛出且带 sub_msg', threw.includes('sig') && threw.includes('40002'), threw);

/* ---------- M 组：关键词匹配 ---------- */

/* M1 品牌 + 香名都命中 → accept */
const m1 = scoreMatch({ brand: 'Creed', name: 'Aventus' },
  'CREED 信仰 Aventus 阿文图斯 男士香水 100ml');
check('M1 完全命中 accept', m1.accept && m1.nameCover === 1, JSON.stringify(m1));

/* M2 品牌不在标题里 → 直接拒，即使香名命中。
   这条是匹配器的核心立场：宁可 0 条，不许猜。
   真实场景：京东标题常写中文译名（"信仰/拿骚之水"），英文品牌落空。 */
const m2 = scoreMatch({ brand: 'Creed', name: 'Aventus' },
  '【官方旗舰店】信仰 拿破仑之水 男士香水 100ml');
check('M2 品牌缺失拒收', !m2.accept && m2.score === 0, JSON.stringify(m2));
check('M2 拒收理由可读', m2.reason.includes('品牌'), m2.reason);

/* M3 别名表能救回 M2 那种情况 */
const m3 = scoreMatch({ brand: 'Creed', name: 'Aventus' },
  '【官方旗舰店】信仰 拿破仑之水 男士香水 100ml', { Creed: ['信仰'] });
check('M3 别名命中品牌', m3.brandHit, JSON.stringify(m3));

/* M4 品牌命中但香名覆盖率不足 → 拒（防止把同品牌别的款算进来） */
const m4 = scoreMatch({ brand: 'Creed', name: 'Silver Mountain Water' },
  'CREED 信仰 Aventus 阿文图斯 男士香水');
check('M4 覆盖率不足拒收', !m4.accept && m4.nameCover < 0.6, JSON.stringify(m4));

/* M5 停用词不参与匹配，避免 "eau de parfum" 这种通用词制造假命中 */
check('M5 停用词被剔除',
  normalizeTokens('Aventus Eau de Parfum for Men').join(',') === 'aventus');

/* M6 中文按单字切，英文按词切（"信仰 拿破仑之水" 共 7 个汉字 → 7 个 token） */
check('M6 中英切分',
  normalizeTokens('信仰 拿破仑之水').length === 7,
  normalizeTokens('信仰 拿破仑之水').join(','));

/* M7 pickBest 在多候选中取分最高者；并列时取标题更短的。
   注意：两条都必须过品类闸门，否则失去可比性（M10-M14 之后）。 */
const best = pickBest({ brand: 'Dior', name: 'Sauvage' }, [
  { title: 'DIOR 迪奥 Sauvage 旷野 男士香水 100ml 正装', price: 900 },
  { title: 'DIOR Sauvage 香水', price: 800 },
]);
check('M7 取最高分', best && best.title === 'DIOR Sauvage 香水', best && best.title);

/* M8 候选全不达标时返回最低分那一条但 accept=false —— 调用方据此跳过 */
const none = pickBest({ brand: 'Xyz', name: 'Qqq' }, [{ title: '完全无关的商品' }]);
check('M8 全不达标 accept=false', none && none.accept === false);

/* M9 空候选不崩 */
check('M9 空候选返回 null', pickBest({ brand: 'A', name: 'B' }, []) === null);

/* M10 香皂能拿满分 —— 这是实测踩到的真问题（京东搜 CREED Aventus
   第一名是「CREED 全系列香皂150g AVENTUS」），品类闸门必须拦住 */
const m10 = scoreMatch({ brand: 'Creed', name: 'Aventus' },
  'CREED【同价双11】全系列香皂150g AVENTUS');
check('M10 香皂被品类闸门拒收', !m10.accept && m10.reason.includes('非香水'), JSON.stringify(m10));

/* M11 口红同理（搜 Dior Dune 第一名是烈艳蓝金口红） */
const m11 = scoreMatch({ brand: 'Dior', name: 'Dune' },
  '迪奥（Dior）Dior烈艳蓝金口红绒雾720唇膏 香水礼盒');
check('M11 口红被拒（含"香水"也要拒）', !m11.accept && m11.reason.includes('口红'), JSON.stringify(m11));

/* M12 小样/试用装跳过 */
const m12 = scoreMatch({ brand: 'Dior', name: 'Sauvage' },
  '迪奥 Dior Sauvage 旷野淡香水 小样 2ml 试用装');
check('M12 小样被拒', !m12.accept && m12.reason.includes('小样'), JSON.stringify(m12));

/* M13 正装香水照常通过 —— 闸门不能把该收的也挡了 */
const m13 = scoreMatch({ brand: 'Dior', name: 'Sauvage' },
  'DIOR 迪奥 Sauvage 旷野男士淡香水 100ml EDP');
check('M13 正装仍 accept', m13.accept && m13.score > 0.9, JSON.stringify(m13));

/* M14 无品类词的标题拒收（比如只写"CREED Aventus 100ml"的杂货） */
const m14 = scoreMatch({ brand: 'Creed', name: 'Aventus' },
  'CREED Aventus 100ml 男士 礼盒装');
check('M14 无品类词拒收', !m14.accept && m14.reason.includes('品类词'), JSON.stringify(m14));

/* ---------- M15–M17 中英连写的切词 ----------
   实测真 bug（2026-11-08）：原 normalizeTokens 把"含中文的整段"逐字切开，
   而淘宝/京东标题大量写成「中文品牌名 + 英文品牌名」连写，
   于是英文品牌名被切成单字母，品牌永远判不中。

   一次 30 瓶的批次里 5 条拒收、其中 3 条是这个原因。这三条固定住：
   · 拉丁串整体成一个 token
   · 中文串（不论和拉丁怎么连写）仍逐字切
   · 混排标题能回到 accept */

check('M15 中英连写时拉丁串不被拆碎',
  normalizeTokens('玛丽之香Parfums de Marly珀加索斯 Pegasus香水')
    .filter((t) => /^[a-z0-9]+$/.test(t)).join(',') === 'parfums,marly,pegasus',
  normalizeTokens('玛丽之香Parfums de Marly珀加索斯 Pegasus香水').join(','));

check('M16 中文仍逐字切（含紧邻拉丁的）',
  normalizeTokens('凯利安Kilian天使之享').filter((t) => /[\u4e00-\u9fa5]/.test(t)).length === 7
  && normalizeTokens('凯利安Kilian天使之享').includes('kilian'),
  normalizeTokens('凯利安Kilian天使之享').join(','));

const m17 = scoreMatch({ brand: 'Parfums de Marly', name: 'Pegasus' },
  '玛丽之香Parfums de Marly珀加索斯 Pegasus香水香港直郵');
check('M17 中英连写标题能 accept', m17.accept && m17.nameCover === 1, JSON.stringify(m17));

/* M18 反向守卫：修复切词不能把该拒的也放过。
   lancome-idole 的真实候选是睫毛膏，viktor-rolf-flowerbomb 的是 7ML 小样。 */
const m18a = scoreMatch({ brand: 'Lancome', name: 'Idole' },
  '欧洲直邮Lancôme Lash Idôle 睫毛丰盈卷翘睫毛膏正品');
const m18b = scoreMatch({ brand: 'Viktor&Rolf', name: 'Flowerbomb' },
  'Viktor&Rolf维果罗夫香水小样Flowerbomb鲜花炸弹露水Q版香水7ML');
check('M18 切词修复后睫毛膏与小样仍被拒',
  !m18a.accept && !m18b.accept, JSON.stringify([m18a.reason, m18b.reason]));

/* M19 性别轴：`man`/`woman` 在 STOP 表里，两者 nameTokens 完全相同，
   所以「Intense Woman」会以 cover=1.00 通过男香标题的判据 ——
   这不是漏一个链接，是把男香挂到女香上。2026-11-08 实测于 Armaf 批次。 */
const m19a = scoreMatch({ brand: 'Armaf', name: 'Club de Nuit Intense Woman' },
  'Armaf阿玛芙Club de Nuit Intense Man夜店狂欢男士香水持久淡香', {}, '香水');
const m19b = scoreMatch({ brand: 'Armaf', name: 'Club de Nuit Intense Man' },
  'Armaf阿玛芙Club de Nuit Intense Man夜店狂欢男士香水持久淡香', {}, '香水');
check('M19 女香不得匹配男香标题（同名不同性别）',
  !m19a.accept && m19a.reason.includes('性别') && m19b.accept,
  JSON.stringify([m19a.reason, m19b.accept]));

/* M20 「男女」同款不算冲突：很多标题写「男女香水」表示中性。
   要求两边都明确且相反才拒，否则会把中性款全判死。
   注意标题必须含英文香名，否则会先死在覆盖率上，测不到性别这条。 */
const m20 = scoreMatch({ brand: 'Tom Ford', name: 'Black Orchid' },
  'Tom Ford汤姆福特 Black Orchid 黑兰花中性香水男女通用', {}, '香水');
check('M20 标题写「男女通用」时不构成性别冲突',
  m20.accept && m20.nameCover === 1, JSON.stringify(m20));

/* M21 标题没写性别时不构成矛盾（不认识就放行）。 */
const m21 = scoreMatch({ brand: 'Creed', name: 'Aventus' },
  'CREED AVENTUS 2.5OZ EDP简装恺芮得 拿破仑正品', {}, '香水');
check('M21 标题没写性别时放行', m21.accept, JSON.stringify(m21));

/* M22 蜡烛：平台类目写着「香水」也必须靠标题拦下。
   2026-11-08 在已入库的 625 条里扫出两例，两例类目都是
   「彩妆/香水/美妆工具/香水」，所以「类目优先」的规则救不了它们：
     tiziana-terenzi-kirke  …Kirke香薰蜡燭   （繁体「燭」不在词表里）
     tom-ford-vanilla-sex   …香氛蜡烛200g    （「香氛蜡烛」≠「香薰蜡烛」） */
const m22a = scoreMatch({ brand: 'Tiziana Terenzi', name: 'Kirke' },
  '蒂齐纳泰伦斯 Tiziana Terenzi罗马之南 Kirke香薰蜡燭', {}, '彩妆/香水/美妆工具/香水');
const m22b = scoreMatch({ brand: 'Tom Ford', name: 'Vanilla Sex' },
  '欧洲直邮TOM FORD汤姆福特香氛蜡烛200g #VANILLA-SEX-禁忌正品', {}, '彩妆/香水/美妆工具/香水');
check('M22 蜡烛类目写香水也拦下（含繁体与香氛蜡烛）',
  !m22a.accept && !m22b.accept && m22a.reason.includes('蜡烛'),
  JSON.stringify([m22a.reason, m22b.reason]));

/* ---------- Q 组：淘宝查询词变体 ----------
   这一组守的是 2026-11-08 那条反直觉的实测结论：**加品牌名会把结果打成 0**。
   写成测试是因为它太容易被"顺手优化"回 `${brand} ${name}` —— 那是京东的写法，
   在淘宝上等于自断召回。 */

/* Q1 纯香名必须排第一。换掉顺序，360 瓶的命中率会从 55% 掉到 40% 出头。 */
const q1 = taobaoQueryVariants({ brand: 'Byredo', name: 'Gypsy Water' }, {});
check('Q1 香名排在查询变体第一位', q1[0] === 'Gypsy Water', JSON.stringify(q1));

/* Q2 香名首词：括号/逗号之后的部分要砍掉。
   "Love, Don't Be Shy" → "Love"；带中文括号的也要认。 */
const q2 = taobaoQueryVariants({ brand: 'Kilian Paris', name: "Love, Don't Be Shy" }, {});
check('Q2 香名首词砍掉逗号之后的部分', q2.includes('Love'), JSON.stringify(q2));
const q2b = taobaoQueryVariants({ brand: 'Acqua di Parma', name: 'Colonia（经典）' }, {});
check('Q2b 香名首词认中文全角括号', q2b.includes('Colonia'), JSON.stringify(q2b));

/* Q3 中文别名只认汉字那一项，拉丁别名（如 "YSL"）不能拿去拼查询词 ——
   拿 "YSL Libre" 去搜会把中文标题全过滤掉。 */
const q3 = taobaoQueryVariants({ brand: 'Yves Saint Laurent', name: 'Libre' },
  { 'Yves Saint Laurent': ['圣罗兰', 'YSL'] });
check('Q3 中文别名变体用汉字不用拉丁别名',
  q3.includes('圣罗兰 Libre') && !q3.some((q) => q.startsWith('YSL ')), JSON.stringify(q3));

/* Q4 去重：香名本身就是单个词时，第 0 项与第 1 项相同，不能出现两次
   （重复查询是白烧一次配额）。 */
const q4 = taobaoQueryVariants({ brand: 'Creed', name: 'Aventus' }, {});
check('Q4 香名与首词相同时去重', q4.filter((q) => q === 'Aventus').length === 1, JSON.stringify(q4));

/* Q5 变体数量上限：不能无限堆。4 个是实测调优后的上限，
   再多也不会提高命中率，只会多烧配额。 */
const q5 = taobaoQueryVariants({ brand: 'Creed', name: 'Aventus' },
  { Creed: ['信仰', '恺芮得'] });
check('Q5 变体不超过 4 个', q5.length <= 4, JSON.stringify(q5));

/* Q6 品牌+香名首词作为兜底仍在列表里（少数冷门牌子只有这个写法能搜到）。 */
const q6 = taobaoQueryVariants({ brand: 'Parfums de Marly', name: 'Layton' }, {});
check('Q6 品牌+香名首词作为兜底存在',
  q6.includes('Parfums de Marly Layton'), JSON.stringify(q6));

/* ---------- R 组：香名级中文译名（data/fragrance-aliases.json） ----------
   背景（实测 2026-11-08）：淘宝上有一批香水**只以中文名在售**，
   英文名搜不到任何结果 —— `Mitsouko`、`Arabians Tonka`、`Cedrat Boise`、
   `English Pear & Freesia` 全部 0 条；`蝴蝶夫人`、`情迷咖啡`、`香橼木`、
   `英国梨与小苍兰` 都有一堆正装。
   所以译名表不是「锦上添花」，是这 85 瓶能否覆盖的唯一开关。 */

const malt = { brand: 'Guerlain', name: 'Mitsouko' };
const maltAlias = { Guerlain: ['娇兰'] };
const fragMitsouko = { keywords: ['蝴蝶夫人'], names: ['蝴蝶夫人'] };

/* R1 裸译名必须排第一。加品牌名（哪怕中文）会把结果打成 0 ——
   实测 `祖玛珑 英国梨与小苍兰` → 0 条，`英国梨与小苍兰` → 36 条。
   这条顺序就是覆盖率从 11/16 掉到 1/5 的原因，钉住它。 */
const r1 = taobaoQueryVariants(malt, maltAlias, fragMitsouko);
check('R1 香名译名排在查询变体第一位', r1[0] === '蝴蝶夫人', JSON.stringify(r1));

/* R2 译名带品牌中文名的变体仍在（部分店铺标题确实写全称），但排在裸译名之后。 */
const r2At = r1.indexOf('娇兰 蝴蝶夫人');
check('R2 品牌中文名+译名变体存在且靠后', r2At > 0, JSON.stringify(r1));

/* R3 无语料时退回原行为：不能因为加了参数就把没有译名的香水搞崩。 */
const r3 = taobaoQueryVariants(malt, maltAlias, null);
check('R3 无香名译名时不影响原有变体', r3[0] === 'Mitsouko', JSON.stringify(r3));

/* R4 keywords 与 names 分开：`QUATRE` 是能搜到的关键词，但它不是中文译名。
   把法语词写进 names 会让 scoreMatch 的「中文译名命中」判据误判。 */
const fragQuatre = { keywords: ['QUATRE'], names: [] };
const r4 = taobaoQueryVariants({ brand: 'Boucheron', name: 'Quatre En Rouge' },
  { Boucheron: ['宝诗龙'] }, fragQuatre);
check('R4 keywords 进查询词但 names 保持空', r4.includes('QUATRE') && fragQuatre.names.length === 0,
  JSON.stringify(r4));

/* R5 scoreMatch 认中文译名：标题只有中文名时（「娇兰 蝴蝶夫人精粹30ml」），
   旧逻辑判「香名覆盖率 0%」拒收，现在应 accept 且 nameVia='cn-alias'。 */
const r5 = scoreMatch({ brand: 'Guerlain', name: 'Mitsouko' },
  '欧洲直邮Guerlain娇兰 蝴蝶夫人精粹30ml 女士浓香EDP 果香正品',
  maltAlias, '彩妆/香水/美妆工具/香水', fragMitsouko);
check('R5 中文译名命中即 accept', r5.accept === true && r5.nameVia === 'cn-alias', JSON.stringify(r5));

/* R6 译名不能替代品牌关：标题有译名但没有品牌名 → 仍然拒。
   否则「蝴蝶夫人」会匹配到同名大衣（实测淘宝真有一条「蝴蝶夫人 桑蚕丝羊绒双面呢大衣」）。 */
const r6 = scoreMatch({ brand: 'Guerlain', name: 'Mitsouko' },
  'YIKOwow 蝴蝶夫人 桑蚕丝羊绒双面呢大衣短外套 香水',
  {}, '彩妆/香水/美妆工具/香水', fragMitsouko);
check('R6 译名不能替代品牌关', r6.accept === false && r6.reason.includes('品牌'), JSON.stringify(r6));

/* ---------- 输出 ---------- */
console.log('\n===== 联盟 API 测试 =====');
console.log(`PASS ${pass}   FAIL ${failures.length}`);
if (failures.length) {
  console.log('\n失败明细:');
  failures.forEach((f) => console.log('  ✗ ' + f));
}
process.exitCode = failures.length === 0 ? 0 : 1;
