/* 把 zh-collect-aliases 的产出并进 data/fragrance-aliases.json
 *
 * 为什么单独一个脚本而不直接改 JSON：这张表的规则是「每条都要带证据」，
 * 手写进去迟早会出现没有 evidence 的条目。这里强制校验三件：
 *   ① id 在 perfumes.json 里存在
 *   ② names 非空、每个都是 >=2 字的纯中文
 *   ③ 有 evidence 且 hits >= 1（反向验证的实测命中数）
 *
 * 幂等：同 id 已存在则合并 names/keywords（去重），不覆盖已有条目的其他字段。
 *
 * 用法：node scripts/apply-zh-aliases.mjs data/.cache/zh-aliases-armaf.json [...]
 */
import fs from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) { console.error('用法: node scripts/apply-zh-aliases.mjs <zh-aliases-*.json>...'); process.exit(1); }

const PATH = 'data/fragrance-aliases.json';
const table = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const ids = new Set(JSON.parse(fs.readFileSync('data/perfumes.json', 'utf8')).perfumes.map((p) => p.id));

const isCn = (s) => /^[\u4e00-\u9fa5]{2,8}$/.test(String(s));
let added = 0, merged = 0, skipped = 0;
const notes = [];

for (const f of files) {
  if (!fs.existsSync(f)) { console.error(`跳过（不存在）${f}`); continue; }
  const src = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const a of src.accepted || []) {
    if (!ids.has(a.id)) { skipped++; notes.push(`${a.id}: 不在香水库里`); continue; }
    if (!isCn(a.cn)) { skipped++; notes.push(`${a.id}: 中文名不合规「${a.cn}」`); continue; }
    if (!a.evidence || !(a.hits >= 1 || a.cnHits >= 2)) {
      skipped++; notes.push(`${a.id}: 缺证据（hits=${a.hits} cnHits=${a.cnHits}）`); continue;
    }
    const cur = table[a.id];
    if (cur) {
      const names = [...new Set([...(cur.names || []), a.cn])];
      const kws = [...new Set([...(cur.keywords || []), a.cn])];
      cur.names = names; cur.keywords = kws;
      cur.hits = Math.max(cur.hits || 0, a.hits || 0);
      merged++;
    } else {
      table[a.id] = {
        brandCn: a.brandCn || src.alias,
        keywords: [a.cn],
        hits: a.hits || a.cnHits || 1,
        evidence: String(a.evidence).slice(0, 120),
        verifiedAt: new Date().toISOString().slice(0, 10),
        names: [a.cn],
      };
      added++;
    }
  }
}

fs.writeFileSync(PATH, JSON.stringify(table, null, 1) + '\n');
const total = Object.keys(table).filter((k) => k !== '_readme').length;
console.log(`新增 ${added} 条 / 合并 ${merged} 条 / 跳过 ${skipped} 条；表内共 ${total} 条`);
for (const n of notes) console.log('  · ' + n);
