#!/usr/bin/env node
/* 把采集到的联盟短链合并成 gen-affiliate-links.mjs 的输入表。
 *
 * 为什么单独一个脚本：采集是**按批**进行的（反爬要求小批量、中间人过验证），
 * 可能横跨好几天、好几个 JSON 文件。合并逻辑不属于采集，也不属于页面 ——
 * 它只做一件事：把 `batch/*.json` 里形如
 *   { id, brand, name, short, long, itemId, picked }
 * 的记录，收敛成
 *   { taobao: { "<perfume.id>": "https://m.tb.cn/..." } }
 *
 * 三条规矩：
 *   ① 只认 **m.tb.cn / s.click.taobao.com** 的链接 —— 它们是联盟签发的，
 *      带佣金归属（实测点一次报表 `点击次数 1`）。别的形似链接不收。
 *   ② `perfumes.json` 里没有的 id 一律拒收并报出来 —— 宁可少一条，
 *      不能让一个拼错的 id 悄悄流进公开表。
 *   ③ 同一个 id 出现多次时**后写覆盖**：重采的原因通常是上次抓错了商品。
 *
 * 用法：
 *   node scripts/merge-affiliate-batch.mjs <batch目录或json> [更多...]
 *   node scripts/merge-affiliate-batch.mjs --dry
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const IN_PERFUMES = path.join(ROOT, 'data/perfumes.json');
const OUT_SOURCE = path.join(ROOT, 'data/affiliate-links.source.json');

const AFF_HOSTS = ['m.tb.cn', 's.click.taobao.com', 'uland.taobao.com'];

function isAffiliateUrl(raw) {
  try {
    const u = new URL(String(raw).trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return AFF_HOSTS.some((d) => h === d || h.endsWith('.' + d));
  } catch { return false; }
}

/* 长链优先还是短链优先：短链。
   理由不是"更短" —— 长链 300 天后会失效，短链是**永久**的，
   而这张表要长期躺在仓库里。 */
function pickUrl(rec) {
  const cands = [rec.short, rec.long].filter(Boolean);
  for (const c of cands) if (isAffiliateUrl(c)) return c.trim();
  return null;
}

function collectFiles(args) {
  const out = [];
  for (const a of args) {
    if (a.startsWith('--')) continue;
    const p = path.resolve(a);
    if (!existsSync(p)) { console.error(`跳过（不存在）：${a}`); continue; }
    if (statSync(p).isDirectory()) {
      for (const f of readdirSync(p)) if (f.endsWith('.json')) out.push(path.join(p, f));
    } else out.push(p);
  }
  return out;
}

function main() {
  const dry = process.argv.includes('--dry');
  const files = collectFiles(process.argv.slice(2));
  if (!files.length) {
    console.error('用法：node scripts/merge-affiliate-batch.mjs <文件或目录> [更多...] [--dry]');
    process.exit(1);
  }

  const perfumes = JSON.parse(readFileSync(IN_PERFUMES, 'utf8'));
  const list = perfumes.perfumes || perfumes;
  const known = new Map(list.map((p) => [p.id, p]));

  const taobao = {};
  const rejected = [];
  const unknown = [];
  let total = 0;
  const seen = new Map();

  for (const f of files) {
    let arr;
    try { arr = JSON.parse(readFileSync(f, 'utf8')); } catch (e) {
      console.error(`解析失败：${path.basename(f)} — ${e.message}`); continue;
    }
    if (!Array.isArray(arr)) { console.error(`不是数组，跳过：${path.basename(f)}`); continue; }
    for (const rec of arr) {
      total++;
      if (!rec || !rec.id) { rejected.push(['(无 id)', JSON.stringify(rec).slice(0, 60)]); continue; }
      if (!known.has(rec.id)) { unknown.push(`${rec.id} (${rec.brand || '?'} ${rec.name || '?'})`); continue; }
      const url = pickUrl(rec);
      if (!url) { rejected.push([rec.id, rec.short || rec.long || '(无链接)']); continue; }
      if (seen.has(rec.id)) seen.get(rec.id).push(path.basename(f)); else seen.set(rec.id, [path.basename(f)]);
      taobao[rec.id] = url;
    }
  }

  const dup = [...seen.entries()].filter(([, fs_]) => fs_.length > 1);

  console.log(`读入 ${files.length} 个文件，记录 ${total} 条`);
  console.log(`  有效 ${Object.keys(taobao).length} 条（去重后）`);
  if (dup.length) console.log(`  重复 ${dup.length} 条（后写覆盖）：${dup.map(([id]) => id).slice(0, 5).join(', ')}${dup.length > 5 ? ' …' : ''}`);
  if (unknown.length) {
    console.log(`  未知 id ${unknown.length} 条（perfumes.json 里没有，已拒收）：`);
    for (const u of unknown.slice(0, 8)) console.log('    · ' + u);
    if (unknown.length > 8) console.log(`    … 另有 ${unknown.length - 8} 条`);
  }
  if (rejected.length) {
    console.log(`  链接不合格 ${rejected.length} 条（非联盟域名 / 空）：`);
    for (const [id, u] of rejected.slice(0, 8)) console.log(`    · ${id} → ${String(u).slice(0, 60)}`);
  }

  const coverage = `${Object.keys(taobao).length}/${list.length}`;
  console.log(`\n覆盖率：${coverage}`);

  if (dry) { console.log('\n--dry：未写文件'); return; }

  /* 合并而不是覆盖已有 source —— 采集是分批的，上一批不该被这一批冲掉。 */
  let prev = {};
  if (existsSync(OUT_SOURCE)) {
    try { prev = JSON.parse(readFileSync(OUT_SOURCE, 'utf8')); } catch {}
  }
  const merged = {
    ...prev,
    taobao: { ...(prev.taobao || {}), ...taobao },
  };
  writeFileSync(OUT_SOURCE, JSON.stringify(merged, null, 1) + '\n');
  console.log(`已写入 ${path.relative(ROOT, OUT_SOURCE)}（淘宝 ${Object.keys(merged.taobao).length} 条）`);
  console.log('下一步：node scripts/gen-affiliate-links.mjs');
}

main();
