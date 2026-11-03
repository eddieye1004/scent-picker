#!/usr/bin/env node
/**
 * merge-product-candidates.mjs — 把 fetch-products.mjs 的候选表并进
 * data/affiliate-links.source.json，让 gen-affiliate-links.mjs 直接可用。
 *
 * 为什么分两步走而不是一步到底：候选表里有大量"接受但可能选错"的行
 * （品牌命中、香名覆盖率刚过 0.6 的那种）。一步到底意味着**一次请求就改
 * 公开数据**；分两步，中间留一个可以睁眼看的 JSON，错了能改。
 *
 * 三条规矩，与 scripts/merge-affiliate-batch.mjs 完全一致：
 *   ① 只认联盟签发的链接域名（m.tb.cn / s.click.taobao.com / uland.taobao.com
 *      / u.jd.com / union-click.jd.com / 3.cn）——形似链接不收；
 *   ② perfumes.json 里没有的 id 一律拒收并报出来；
 *   ③ 同一 id 后写覆盖（重采通常是上次抓错了）。
 *
 * 用法：
 *   node scripts/merge-product-candidates.mjs            # 写文件
 *   node scripts/merge-product-candidates.mjs --dry      # 只看会写什么
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const IN_CAND = path.join(ROOT, 'data/products.candidates.json');
const IN_PERFUMES = path.join(ROOT, 'data/perfumes.json');
const IN_SOURCE = path.join(ROOT, 'data/affiliate-links.source.json');
const OUT_SKUS = path.join(ROOT, 'data/product-skus.json');

const DRY = process.argv.includes('--dry');

const AFF_HOSTS = {
  taobao: ['m.tb.cn', 's.click.taobao.com', 'uland.taobao.com', 'tmqd.me'],
  jd: ['u.jd.com', 'union-click.jd.com', '3.cn'],
};

function isAffiliateUrl(platform, raw) {
  try {
    const u = new URL(String(raw || '').trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return (AFF_HOSTS[platform] || []).some((d) => h === d || h.endsWith('.' + d));
  } catch { return false; }
}

if (!existsSync(IN_CAND)) {
  console.error(`缺少 ${path.relative(ROOT, IN_CAND)}`);
  console.error('  先跑 node scripts/fetch-products.mjs --jd --limit 20 验证流程。');
  process.exit(1);
}

const cand = JSON.parse(await readFile(IN_CAND, 'utf8'));
const perfumes = (JSON.parse(await readFile(IN_PERFUMES, 'utf8')).perfumes || []);
const ids = new Set(perfumes.map((p) => p.id));

const accepted = cand.accepted || [];
if (!accepted.length) {
  console.error('候选表里没有任何 accepted 行 —— 不写文件。');
  console.error('  常见原因：① 别名表没覆盖这些品牌；② 关键词命中太少；③ 阈值 0.6 太严。');
  console.error('  先看 data/products.candidates.json 的 rejected 区，reason 字段写了为什么被拒。');
  process.exit(1);
}

/* 读旧表，保留手工采集的部分（merge-affiliate-batch.mjs 产出的那些）。
   合并是**并集**，不是替换 —— 手工核过的链接比自动匹配的可信，
   让它被一次自动跑覆盖掉是本末倒置。 */
let source = { jd: {}, taobao: {} };
if (existsSync(IN_SOURCE)) {
  try {
    const raw = JSON.parse(await readFile(IN_SOURCE, 'utf8'));
    for (const p of ['jd', 'taobao']) if (raw[p]) source[p] = { ...raw[p] };
  } catch (e) {
    console.error(`旧表读不了，按空表继续：${e.message}`);
  }
}

const skus = existsSync(OUT_SKUS) ? JSON.parse(await readFile(OUT_SKUS, 'utf8')) : {};
skus.jd = skus.jd || {};
skus.taobao = skus.taobao || {};

const unknown = [];
const rejected = [];
let added = 0;
let skippedNoUrl = 0;

for (const row of accepted) {
  if (!ids.has(row.id)) { unknown.push(row.id); continue; }
  const picked = row.picked || {};
  if (row.platform === 'jd') {
    /* 京东这一步拿到的是 skuId + materialUrl，**不是**联盟短链。
       短链要再调一次 jd.union.open.promotion.common.get（gen-affiliate-links.mjs
       的 --api 分支干的就是这件事）。所以这里只登记 skuId，
       affiliate-links.source.json 的 jd 段不写 —— 写 materialUrl 会冒充联盟链。 */
    if (picked.skuId) { skus.jd[row.id] = String(picked.skuId); added++; }
    else rejected.push([`jd:${row.id}`, '没有 skuId']);
    continue;
  }
  /* 淘宝的 material.optional 直接返回 click_url，是真正的联盟链，可以直接落 */
  const url = picked.clickUrl;
  if (!url) { skippedNoUrl++; rejected.push([`taobao:${row.id}`, '返回里没有 click_url']); continue; }
  if (!isAffiliateUrl('taobao', url)) { rejected.push([`taobao:${row.id}`, `不是联盟域名的链接：${url.slice(0, 60)}`]); continue; }
  source.taobao[row.id] = url.trim();
  if (picked.itemId) skus.taobao[row.id] = String(picked.itemId);
  added++;
}

console.log(`候选表 ${accepted.length} 条 accepted`);
console.log(`  写入 ${added} 条（taobao 直链 + jd skuId）`);
if (skippedNoUrl) console.log(`  跳过 ${skippedNoUrl} 条：没有 click_url`);
if (rejected.length) console.log(`  拒绝 ${rejected.length} 条`);
if (unknown.length) console.log(`  数据里没有的 id ${unknown.length} 条：${unknown.slice(0, 5).join(', ')}`);

if (DRY) {
  console.log('\n--dry：不写文件。');
  console.log('  将写 affiliate-links.source.json 的 taobao 段：', Object.keys(source.taobao).length, '条');
  console.log('  将写 product-skus.json 的 jd 段：', Object.keys(skus.jd).length, '条');
  process.exit(0);
}

await writeFile(IN_SOURCE, JSON.stringify(source, null, 1) + '\n', 'utf8');
await writeFile(OUT_SKUS, JSON.stringify(skus, null, 1) + '\n', 'utf8');
console.log(`\n已写 ${path.relative(ROOT, IN_SOURCE)} / ${path.relative(ROOT, OUT_SKUS)}`);
console.log('下一步：node scripts/gen-affiliate-links.mjs');
