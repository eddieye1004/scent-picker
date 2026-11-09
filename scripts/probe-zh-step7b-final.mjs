/* 中文香名调研 第 7b 步：把「香调词」从「并列香名」里剔出去 —— 定稿数字

   第 7 步的并列检测把香调词也算成了兄弟瓶名：
     柑橘 / 玫瑰 / 香根草 / 橙花 / 檀香 / 乌木 是**气味描述**，不是别的香水名。
   把它们算进并列，会把「悦之欢并列橙花(4)」这种正常标题误判成系列罗列。

   这一步按词性分两本账：
     香调词（NOTES）   —— 出现不算并列
     香名（NAMES）     —— 出现才算并列
   判完这一轮，覆盖率数字就定稿，不再调判据。
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* 香调 / 气味描述词：不是香水名 */
const NOTES = ['柑橘', '玫瑰', '香根草', '橙花', '檀香', '乌木', '沉香', '麝香', '茉莉', '广藿香',
  '雪松', '柠檬', '佛手柑', '香草', '琥珀', '皮革', '巧克力', '咖啡', '海盐', '鼠尾草'];

/* 确认是"别的香水名"的词（来自本次实测标题里读到的，不是推测） */
const OTHER_NAMES = ['蓝风铃', '白茶', '劲碳黑', '深海蓝', '红月海洋', '太妃咖啡', '迪拜巧克力',
  '夜店狂欢', '里程碑', '小苍兰', '魅夜兰花'];

const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/.cache/zh-name-unique.json'), 'utf8'));

const out = rows.map((r) => {
  /* 把 others 里属于香调词的那部分剥掉，剩下的才是真并列 */
  const realOthers = (r.others || []).filter((o) => {
    const name = o.replace(/\(\d+\)$/, '');
    return OTHER_NAMES.includes(name);
  });
  const noteOthers = (r.others || []).filter((o) => {
    const name = o.replace(/\(\d+\)$/, '');
    return NOTES.includes(name);
  });
  /* 真并列条数：按 others 里的频次还原（粗算，用于定性而非精确计数） */
  const realCount = realOthers.reduce((s, o) => s + Number((o.match(/\((\d+)\)/) || [, 0])[1]), 0);
  const ratio = r.passed ? realCount / r.passed : 0;

  let verdict;
  if (!r.passed) verdict = 'NO-MATCH';
  else if (realOthers.length === 0) verdict = 'UNIQUE';
  else if (ratio <= 0.5) verdict = 'OCCASIONAL';   /* 偶尔混着卖，主要仍指这一瓶 */
  else verdict = 'SERIES';

  return { ...r, realOthers, noteOthers, realCount, realRatio: Number(ratio.toFixed(2)), final: verdict };
});

fs.writeFileSync(path.join(ROOT, 'data/.cache/zh-name-final.json'), JSON.stringify(out, null, 2));

console.log('品牌      拉丁香名                       中文名        合格  真并列  香调词  判定');
console.log('─'.repeat(104));
for (const r of out) {
  console.log(
    r.brandCn.padEnd(8),
    r.name.slice(0, 30).padEnd(32),
    r.cn.padEnd(13),
    String(r.passed).padStart(3),
    String(r.realCount).padStart(5),
    String(r.noteOthers.length).padStart(6),
    ' ' + r.final
  );
}

const tally = {};
for (const r of out) tally[r.final] = (tally[r.final] || 0) + 1;
console.log('\n=== 定稿 ===');
console.log(JSON.stringify(tally));
const usable = out.filter((r) => ['UNIQUE', 'OCCASIONAL'].includes(r.final));
console.log(`可写入（UNIQUE + OCCASIONAL）：${usable.length}/40 = ${(usable.length / 40 * 100).toFixed(1)}%`);
console.log(`其中来源 A（从召回标题读出）的：${usable.filter((r) => r.src === 'A').length}`);
console.log(`其中来源 B（通行译法）的：${usable.filter((r) => r.src === 'B').length}`);
console.log(`其中来源 C（推测）的：${usable.filter((r) => r.src === 'C').length}`);
