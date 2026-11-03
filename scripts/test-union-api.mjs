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
  normalizeTokens, scoreMatch, pickBest,
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

/* M7 pickBest 在多候选中取分最高者；并列时取标题更短的 */
const best = pickBest({ brand: 'Dior', name: 'Sauvage' }, [
  { title: 'DIOR 迪奥 Sauvage 旷野 男士香水 100ml 正装', price: 900 },
  { title: 'DIOR Sauvage', price: 800 },
]);
check('M7 取最高分', best && best.title === 'DIOR Sauvage', best && best.title);

/* M8 候选全不达标时返回最低分那一条但 accept=false —— 调用方据此跳过 */
const none = pickBest({ brand: 'Xyz', name: 'Qqq' }, [{ title: '完全无关的商品' }]);
check('M8 全不达标 accept=false', none && none.accept === false);

/* M9 空候选不崩 */
check('M9 空候选返回 null', pickBest({ brand: 'A', name: 'B' }, []) === null);

/* ---------- 输出 ---------- */
console.log('\n===== 联盟 API 测试 =====');
console.log(`PASS ${pass}   FAIL ${failures.length}`);
if (failures.length) {
  console.log('\n失败明细:');
  failures.forEach((f) => console.log('  ✗ ' + f));
}
process.exitCode = failures.length === 0 ? 0 : 1;
