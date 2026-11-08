/**
 * scripts/lib/jd-web.mjs 的固定向量测试。
 * CSV 样本来自 2026-11-03 15:38 实测下载的真实文件（GBK 解码后），
 * 不是编的 —— 格式一变这里立刻红。
 */
import { parseJdCsv, diffBatch, BATCH_LIMIT } from './lib/jd-web.mjs';

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; return; }
  failures.push(name + (detail ? ' :: ' + detail : ''));
}

/* 真实 CSV 前 4 行（含表头），制表符用 \t 表示，末尾都带一个 \t */
const CSV = [
  '商品名称,商品详情页URL,月销,单价,到手价,佣金比例,佣金,联盟推广链接,优惠券领取链接',
  '伊利【新鲜日期】安慕希常温原味酸奶205g*16盒 礼盒装\t,http://item.jd.com/3311987.html\t,70000\t,48.5\t,33.9\t,11.3\t,3.83\t,https://u.jd.com/e6TgEHR\t,\t,',
  '京鲜生山东双色水果五彩椒 净重3斤单果100克 生吃甜椒起 源头直发\t,http://item.jd.com/4116406.html\t,20000\t,16.8\t,12.8\t,9\t,1.15\t,https://u.jd.com/egTbAAh\t,https://u.jd.com/erT8F4W\t,',
  '蔻驰（COACH）纽约淡香水女士30ml双十一生日礼物白玫瑰礼盒送女友大牌女士香氛\t,http://item.jd.com/100016778976.html\t,900\t,298.9\t,298.9\t,4\t,11.96\t,https://u.jd.com/erTr7Zs\t,\t,',
].join('\n');

const rows = parseJdCsv(CSV);

/* J1 表头行必须被跳过 —— 用 split(',') 的实现会在这里炸 */
check('J1 表头被跳过', rows.length === 3, `rows=${rows.length}`);

/* J2 字段全部解对 */
const r0 = rows[0];
check('J2 skuId', r0.skuId === '3311987', r0.skuId);
check('J2 标题完整保留（含全角括号）', r0.title === '伊利【新鲜日期】安慕希常温原味酸奶205g*16盒 礼盒装', r0.title);
check('J2 月销/单价/到手价', r0.sales30d === 70000 && r0.price === 48.5 && r0.finalPrice === 33.9, JSON.stringify(r0));
check('J2 佣金比例与金额', r0.commissionRate === 11.3 && r0.commission === 3.83, JSON.stringify(r0));
check('J2 短链', r0.shortUrl === 'https://u.jd.com/e6TgEHR', r0.shortUrl);
check('J2 无优惠券时为 null', r0.couponUrl === null, String(r0.couponUrl));

/* J3 有优惠券的行要带出来 */
check('J3 优惠券链接', rows[1].couponUrl === 'https://u.jd.com/erT8F4W', String(rows[1].couponUrl));

/* J4 中文品牌名（"蔻驰（COACH）"）不被切坏 */
check('J4 中文括号标题', rows[2].title.startsWith('蔻驰（COACH）纽约淡香水'), rows[2].title);

/* J5 空文本 / 只有表头不崩 */
check('J5 空输入返回空数组', parseJdCsv('').length === 0);
check('J5 只有表头返回空', parseJdCsv(CSV.split('\n')[0]).length === 0);
check('J5 null 不崩', parseJdCsv(null).length === 0);

/* J6 没有短链的行不算有效行（京东偶尔给空链接） */
const noLink = '某某香水 100ml\t,http://item.jd.com/999.html\t,10\t,100\t,90\t,5\t,4.5\t,\t,\t,';
check('J6 无短链行被丢弃', parseJdCsv(noLink).length === 0);

/* J7 diffBatch 能发现少行 —— 京东异步生成 CSV 偶尔静默少几条 */
const d = diffBatch(['3311987', '4116406', '100016778976', '555'], rows);
check('J7 统计正确', d.expected === 4 && d.got === 3, JSON.stringify(d));
check('J7 缺行被列出', d.missing.length === 1 && d.missing[0] === '555', JSON.stringify(d.missing));

/* J8 一条不缺时 missing 为空 */
const d2 = diffBatch(['3311987', '4116406'], rows);
check('J8 无缺行', d2.missing.length === 0, JSON.stringify(d2));

/* J9 上限常量与实测一致 */
check('J9 BATCH_LIMIT=60', BATCH_LIMIT === 60, String(BATCH_LIMIT));

console.log('\n===== 京东网页版 CSV 解析测试 =====');
console.log(`PASS ${pass}   FAIL ${failures.length}`);
if (failures.length) {
  console.log('\n失败明细:');
  failures.forEach((f) => console.log('  ✗ ' + f));
}
process.exitCode = failures.length === 0 ? 0 : 1;
