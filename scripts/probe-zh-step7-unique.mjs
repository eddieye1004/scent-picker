/* 中文香名调研 第 7 步：唯一性检验 —— 这条路真正的天花板

   第 5b 步的拉丁词判定仍然放过了几个明显的系列名，肉眼一查就露馅：
     普拉达 Luna Rossa Black → 红月   合格 52 条，但标题是「红月号劲碳黑」「红月号深海蓝」
                                      —— 红月指的是 Luna Rossa 整条线，不是 Black
     宝格丽 Thé Vert → 绿茶            标题写「白茶绿茶」两种并列
     祖玛珑 English Pear → 英国梨       标题写「蓝风铃/英国梨/鼠尾草」三种并列

   根因：中文标题常常把**整个系列的中文名一起罗列**，而且不附带拉丁名。
   于是「中文名是否唯一指向这一瓶」从标题侧根本判不出来。

   这一步换一个能自动算的指标：候选中文名在合格标题里，
   有多少条是**与其他中文香名并列出现**的。并列比例高 = 系列罗列 = 不可用。
   用品牌池里已知的其他中文香名做参照（不引入外部知识）。
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp } from './lib/union-api.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;

const CAT_OK = /香水|彩妆香水/;
const NON_PERFUME = ['身体乳', '沐浴', '洗发', '护发', '洗手液', '护手霜', '手霜', '润肤',
  '蜡烛', '香薰机', '扩香', '香皂', '汽车', '香珠', '洗衣', '发膜', '面膜', '乳液', '小样', '试用',
  '粉底', '口红', '唇膏', '唇釉', '眼霜', '面霜', '精华', '爽肤水', '护肤', '内衣', '内裤', '文胸',
  '奶茶', '酒店', '门票', '牙刷', '种子', '摆件', '帽子', '葡萄酒', '墨镜', '眼镜', '手表',
  '鞋', '裤', '衣', '包', '礼盒装'];

/* 已知的中文香名（来自本次 40 瓶实测 + 品牌池），用来检测"并列罗列"。
   只用于检测共现，不用于生成新名字。 */
const KNOWN_CN = ['里程碑', '夜店狂欢', '卓越', '奥德赛', '魅力之眼', '标记', '蓝色之旅',
  '地中海香柠檬', '图拉蒂', '蝴蝶夫人', '红月', '悦之欢', '绿茶', '阿拉伯沉香', '黑兰花',
  '百万金砖', '落日小姐', '英国梨', '蓝风铃', '鼠尾草', '白茶', '乌木', '柑橘', '小苍兰',
  '劲碳黑', '深海蓝', '红月海洋', '玫瑰', '太妃咖啡', '迪拜巧克力', '橙花', '檀香', '香根草'];

async function query(q, pageSize = 100) {
  const params = buildTaobaoParams({
    appKey: APP_KEY, secret: SECRET,
    method: 'taobao.tbk.dg.material.optional.upgrade',
    timestamp: gmt8Timestamp(),
    biz: { q, adzone_id: ADZONE, page_no: 1, page_size: pageSize, platform: 2 },
  });
  const res = await fetch(TAOBAO_GATEWAY, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const node = JSON.parse(await res.text());
  if (node.error_response) return { n: 0, err: node.error_response.sub_msg || node.error_response.msg, items: [] };
  const data = unwrapTaobao(node, 'taobao.tbk.dg.material.optional.upgrade');
  const list = data?.result_list?.map_data || [];
  return {
    n: list.length,
    items: list.map((it) => {
      const b = it.item_basic_info || {};
      return { title: b.title || '', cat: b.category_name || '', itemId: it.item_id };
    }),
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const series2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/.cache/zh-name-series2.json'), 'utf8'));
const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/.cache/zh-name-sample.json'), 'utf8'));
const rows = [];

for (const r of series2) {
  const res = await query(`${r.brandCn} ${r.cn}`);
  const passed = res.items.filter((it) => {
    const t = it.title;
    const c = it.cat || '';
    const bad = NON_PERFUME.some((w) => t.includes(w)) || NON_PERFUME.some((w) => c.includes(w));
    return t.includes(r.brandCn) && t.includes(r.cn) && CAT_OK.test(c) && !bad && c.trim().length > 0;
  });

  /* 每条标题里除自己以外还出现了几个已知中文香名 */
  let coOccur = 0;
  const others = new Map();
  for (const p of passed) {
    const found = KNOWN_CN.filter((k) => k !== r.cn && p.title.includes(k));
    if (found.length) {
      coOccur++;
      for (const f of found) others.set(f, (others.get(f) || 0) + 1);
    }
  }
  const ratio = passed.length ? coOccur / passed.length : 0;

  /* 判定：并列比例 <=1/3 才算能唯一指向这一瓶 */
  let verdict;
  if (!passed.length) verdict = 'NO-MATCH';
  else if (ratio <= 0.34) verdict = 'UNIQUE';
  else if (ratio <= 0.66) verdict = 'PARTIAL';
  else verdict = 'SERIES-LIST';

  rows.push({
    id: r.id, brandCn: r.brandCn, name: r.name, cn: r.cn, src: r.src,
    passed: passed.length, coOccur, ratio: Number(ratio.toFixed(2)),
    others: [...others.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, c]) => `${k}(${c})`),
    verdict,
  });

  console.log(
    verdict.padEnd(12), r.brandCn.padEnd(6), (r.name.slice(0, 18) + ' → ' + r.cn).padEnd(32),
    `合格=${String(passed.length).padStart(3)} 并列=${String(coOccur).padStart(3)} (${(ratio * 100).toFixed(0)}%)`,
    others.size ? '[' + [...others.keys()].slice(0, 3).join(',') + ']' : ''
  );
  await sleep(230);
}

fs.writeFileSync(path.join(ROOT, 'data/.cache/zh-name-unique.json'), JSON.stringify(rows, null, 2));

const tally = {};
for (const r of rows) tally[r.verdict] = (tally[r.verdict] || 0) + 1;
const uniq = rows.filter((r) => r.verdict === 'UNIQUE');
console.log('\n=== 唯一性判定 ===');
console.log(JSON.stringify(tally));
console.log(`唯一指向这一瓶：${uniq.length}/40 = ${(uniq.length / 40 * 100).toFixed(1)}%`);
console.log(`系列罗列（不可用）：${rows.filter((r) => r.verdict === 'SERIES-LIST').length}`);
console.log(`\n可用的 ${uniq.length} 瓶：`);
for (const r of uniq) console.log(`  ${r.brandCn} ${r.name} → ${r.cn} (来源${r.src}, 合格${r.passed}条, 并列${(r.ratio * 100).toFixed(0)}%)`);
