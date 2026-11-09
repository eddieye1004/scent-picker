/* 把阶梯跑出来的 accepted 结果并进 data/affiliate-links.source.json，
   再由 gen-affiliate-links.mjs 重新生成 data/affiliate-links.json。

   三条硬约束：
     ① 只认联盟签发的域名（m.tb.cn / s.click.taobao.com / uland.taobao.com / tmqd.me）。
        接口给的是协议相对地址 `//s.click.taobao.com/...`，先补 https: 再判。
     ② 只加不删。这一轮没有新的拒收判据，删旧条目没有依据。
     ③ 写前备份，且备份名固定带日期，可被 Copy-Item -Force 回滚。

   用法：
     node scripts/probe-aff-apply.mjs --dry     # 只报告会写什么
     node scripts/probe-aff-apply.mjs           # 真写
*/
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const rj = async (p) => JSON.parse(await readFile(path.join(ROOT, p), 'utf8'));

const DRY = process.argv.includes('--dry');
const AFF_HOSTS = ['m.tb.cn', 's.click.taobao.com', 'uland.taobao.com', 'tmqd.me'];

function normalizeAffUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  return s.startsWith('//') ? 'https:' + s : s;
}
function isAffiliateUrl(raw) {
  try {
    const u = new URL(normalizeAffUrl(raw));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return AFF_HOSTS.some((d) => h === d || h.endsWith('.' + d));
  } catch { return false; }
}

const perfumes = (await rj('data/perfumes.json')).perfumes;
const ids = new Set(perfumes.map((p) => p.id));

const LADDER = process.env.AFF_LADDER_FILE
  ? path.join(ROOT, process.env.AFF_LADDER_FILE)
  : path.join(ROOT, 'data/.cache', `aff-ladder-${new Date().toISOString().slice(0, 10)}.json`);
const VERIFY = path.join(ROOT, 'data/.cache', `aff-verify-${new Date().toISOString().slice(0, 10)}.json`);
for (const [label, f] of [['阶梯结果', LADDER], ['复核结果', VERIFY]]) {
  if (!existsSync(f)) { console.error(`没有${label}：${path.relative(ROOT, f)}`); process.exit(1); }
}
const ladder = JSON.parse(await readFile(LADDER, 'utf8'));
const verify = JSON.parse(await readFile(VERIFY, 'utf8'));

/* 只有复核判为 latin-all / cn-alias 的才入表。
   ambiguous（母瓶/兄弟瓶/罗列页）和 fail 一律不进 —— 这条闸门不在本脚本里重写，
   它来自 probe-aff-verify.mjs 的判定，避免两处判据各自漂移。 */
const OK = new Set(['latin-all', 'cn-alias']);
const verdictOf = new Map((verify.rows || []).map((r) => [r.id, r]));
console.log(`复核文件：${Object.entries(verify.tally || {}).map(([k, v]) => `${k}=${v}`).join('  ')}`);

const IN_SOURCE = path.join(ROOT, 'data/affiliate-links.source.json');
const source = await rj('data/affiliate-links.source.json');
source.taobao = source.taobao || {};
source.jd = source.jd || {};

const before = Object.keys(source.taobao).length;
const added = [];
const skipped = [];
for (const r of ladder.results || []) {
  if (!r.winner) continue;
  if (!ids.has(r.id)) { skipped.push([r.id, 'perfumes.json 里没有这个 id']); continue; }
  const v = verdictOf.get(r.id);
  if (!v || !OK.has(v.verdict)) {
    skipped.push([r.id, `复核不放行（${v ? v.verdict : '未复核'}）：${v ? v.why.slice(0, 60) : ''}`]);
    continue;
  }
  if (source.taobao[r.id]) { skipped.push([r.id, 'source 里已有，不覆盖']); continue; }
  const url = normalizeAffUrl(r.winner.clickUrl);
  if (!isAffiliateUrl(url)) { skipped.push([r.id, `不是联盟域名：${url.slice(0, 48)}`]); continue; }
  source.taobao[r.id] = url;
  added.push({ id: r.id, stage: r.winner.stage, q: r.winner.q, verdict: v.verdict,
    title: String(r.winner.title || '').slice(0, 50) });
}

console.log(`source.taobao 改前 ${before} 条 · 本次新增 ${added.length} 条 · 跳过 ${skipped.length} 条`);
for (const a of added) console.log(`  + ${a.id}  L${a.stage}「${a.q}」 ← ${a.title}`);
for (const [id, why] of skipped) console.log(`  - ${id}  ${why}`);
console.log(`预计改后 ${Object.keys(source.taobao).length} 条`);

if (DRY) { console.log('\n--dry：未写文件'); process.exit(0); }

if (!added.length) { console.log('\n没有可新增的条目，不写文件。'); process.exit(0); }

const stamp = '20261108';
for (const f of ['data/affiliate-links.source.json', 'data/affiliate-links.json']) {
  const abs = path.join(ROOT, f);
  const bak = `${abs}.bak-${stamp}`;
  if (existsSync(abs) && !existsSync(bak)) {
    await copyFile(abs, bak);
    console.log(`备份 ${path.relative(ROOT, abs)} → ${path.relative(ROOT, bak)}`);
  } else if (existsSync(bak)) {
    console.log(`备份已存在，保留不覆盖：${path.relative(ROOT, bak)}`);
  }
}

await writeFile(IN_SOURCE, JSON.stringify(source, null, 1) + '\n', 'utf8');
console.log(`\n已写 ${path.relative(ROOT, IN_SOURCE)}`);
console.log('下一步：node scripts/gen-affiliate-links.mjs');
