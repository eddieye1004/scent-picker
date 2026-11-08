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
 * 第四条（本轮新增）：淘宝物料接口返回的 pict_url 一并写进
 *   data/product-images.source.json，作为实物图清单的来源。
 *   图片**不在这里下载**（这里只写 JSON，不做网络 IO），
 *   下载与裁切交给 scripts/build-photos.mjs。
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
const OUT_IMGS = path.join(ROOT, 'data/product-images.source.json');

const DRY = process.argv.includes('--dry');

const AFF_HOSTS = {
  taobao: ['m.tb.cn', 's.click.taobao.com', 'uland.taobao.com', 'tmqd.me'],
  jd: ['u.jd.com', 'union-click.jd.com', '3.cn'],
};

/* 联盟接口返回的 click_url 是**协议相对地址**（`//s.click.taobao.com/t?e=...`），
   直接 `new URL()` 会抛错、被这里判成「不是联盟域名」。
   实测 2026-11-08：material.optional.upgrade 返回的两条都是这种形态，
   两条都被静默拒收，日志只说「不是联盟域名的链接」——
   看起来像域名判错了，其实是缺协议头。

   补协议头放在**入表之前**（normalizeAffUrl），不在判据里悄悄改：
   判据要能测出"给的是相对地址"，入表要的是能直接塞进 href 的绝对地址。 */
function normalizeAffUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('//')) return 'https:' + s;
  if (/^https?:\/\//i.test(s)) return s;
  return s;                      // 其余形态原样返回，交给判据拒收
}

function isAffiliateUrl(platform, raw) {
  try {
    const u = new URL(normalizeAffUrl(raw));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return (AFF_HOSTS[platform] || []).some((d) => h === d || h.endsWith('.' + d));
  } catch { return false; }
}

/* 图片地址只认阿里图床。联盟物料接口返回的就是这几个域，
   允许任意域名等于把"图从哪来"这件事交给接口返回值，
   而 data/photos.json 会被页面直接 <img src> 引用。 */
const IMG_HOSTS = ['img.alicdn.com', 'gw.alicdn.com', 'img.alicdn.net'];

function isAllowedImage(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return IMG_HOSTS.some((d) => h === d || h.endsWith('.' + d));
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

/* 图片来源表。只存 URL，不存下载结果 —— 下载是 build-photos.mjs 的活。 */
const imgs = existsSync(OUT_IMGS) ? JSON.parse(await readFile(OUT_IMGS, 'utf8')) : {};
imgs.taobao = imgs.taobao || {};
let imgAdded = 0;
let imgBad = 0;

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
  /* 淘宝的 material.optional.upgrade 直接返回 click_url，是真正的联盟链，可以直接落 */
  const url = normalizeAffUrl(picked.clickUrl);
  if (!url) { skippedNoUrl++; rejected.push([`taobao:${row.id}`, '返回里没有 click_url']); continue; }
  if (!isAffiliateUrl('taobao', url)) { rejected.push([`taobao:${row.id}`, `不是联盟域名的链接：${url.slice(0, 60)}`]); continue; }
  source.taobao[row.id] = url;
  if (picked.itemId) skus.taobao[row.id] = String(picked.itemId);
  added++;

  /* 图片：只有「链接被接受」的行才取图 —— 选错商品时它的主图也一定不对，
     给错图比不给图更糟（用户会以为这就是他问的那一瓶）。

     一图多源：候选图按「白底 > 营销主图 > 小图」排成候选数组，交给下游逐张试。
     为什么不在这里只留一张：三档的覆盖率差得远（实测 3415 个商品）——
       white_image   660 张  19.3%   通过判据 73%
       pict_url     3415 张 100%     通过判据 16%（多数带价签/贴纸）
       small_images 3113 个商品有  91%   抽 118 张通过 52.5%
     只留 white_image 会让 1388 瓶里只有 168 瓶有图（覆盖率 12%），
     而用户在页面上看到的就是「三张卡全是绘制瓶形」。
     三档拼起来才能把覆盖率做上去。

     这里只负责挑来源、排顺序，不判「干净与否」—— 判在 build-photos.py，
     因为那需要读像素，而这一步只有 URL。 */
  const cands = [];
  if (picked.whiteImage) cands.push({ src: picked.whiteImage.trim(), kind: 'white' });
  if (picked.pictUrl) cands.push({ src: picked.pictUrl.trim(), kind: 'marketing' });
  for (const u of (picked.smallImages || [])) {
    if (typeof u === 'string' && u) cands.push({ src: u.trim(), kind: 'small' });
  }
  const usable = cands.filter((c) => isAllowedImage(c.src));
  if (!usable.length) {
    imgBad++;
    if (cands.length) rejected.push([`taobao:${row.id}`, `图片域名全不在白名单：${cands[0].src.slice(0, 60)}`]);
    continue;
  }
  // 去重（small_images 里常有与主图重复的首张）
  const seenSrc = new Set();
  const uniq = usable.filter((c) => (seenSrc.has(c.src) ? false : (seenSrc.add(c.src), true)));
  imgs.taobao[row.id] = {
    src: uniq[0].src,
    kind: uniq[0].kind,
    alts: uniq.slice(1).map((c) => ({ src: c.src, kind: c.kind })),
    itemId: String(picked.itemId || ''),
    gotAt: new Date().toISOString().slice(0, 10),
  };
  imgAdded++;
}

console.log(`候选表 ${accepted.length} 条 accepted`);
console.log(`  写入 ${added} 条（taobao 直链 + jd skuId）`);
console.log(`  图片来源 ${imgAdded} 条${imgBad ? `，${imgBad} 条没有可用主图` : ''}`);
if (skippedNoUrl) console.log(`  跳过 ${skippedNoUrl} 条：没有 click_url`);
if (rejected.length) console.log(`  拒绝 ${rejected.length} 条`);
if (unknown.length) console.log(`  数据里没有的 id ${unknown.length} 条：${unknown.slice(0, 5).join(', ')}`);

if (DRY) {
  console.log('\n--dry：不写文件。');
  console.log('  将写 affiliate-links.source.json 的 taobao 段：', Object.keys(source.taobao).length, '条');
  console.log('  将写 product-skus.json 的 jd 段：', Object.keys(skus.jd).length, '条');
  console.log('  将写 product-images.source.json 的 taobao 段：', Object.keys(imgs.taobao).length, '条');
  process.exit(0);
}

await writeFile(IN_SOURCE, JSON.stringify(source, null, 1) + '\n', 'utf8');
await writeFile(OUT_SKUS, JSON.stringify(skus, null, 1) + '\n', 'utf8');
await writeFile(OUT_IMGS, JSON.stringify(imgs, null, 1) + '\n', 'utf8');
console.log(`\n已写 ${path.relative(ROOT, IN_SOURCE)} / ${path.relative(ROOT, OUT_SKUS)} / ${path.relative(ROOT, OUT_IMGS)}`);
console.log('下一步：node scripts/gen-affiliate-links.mjs');
