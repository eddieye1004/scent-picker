/* 按复核结论收敛数据：删掉二次闸门判死的条目，再加入放行的新条目。

   判据只来自 data/.cache/aff-verify-<date>.json（probe-aff-verify.mjs 的产出），
   本脚本不自己判任何一条 —— 判据写两处必然漂移。

   删除清单是**显式**的（下面 REVOKED），不是"凡是复核没通过就删"：
   复核只覆盖跑过的那批，而 source 里有 637 条是历轮积累的，
   不在这批里的一律不动。

   用法：node scripts/probe-aff-converge.mjs --dry | --write
*/
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const rj = async (p) => JSON.parse(await readFile(path.join(ROOT, p), 'utf8'));
const WRITE = process.argv.includes('--write');

/* 二次闸门判死、且由 Lead 裁决删除的条目。每条的标题原文与判据见
   docs/AFFILIATE-COVERAGE-20261108.md 的「二次闸门修正」一节。 */
const REVOKED = [
  'montale-intense-cafe',
  'maison-margiela-replica-beach-walk',
  'frederic-malle-rose-and-cuir',
  'etat-libre-dorange-fat-electrician',
  'ex-nihilo-lust-in-paradise',
  'carolina-herrera-good-girl-supreme',
  'montblanc-explorer',          // 标题实为 Explorer PLATINUM，本轮复核新抓到的
];

const AFF_HOSTS = ['m.tb.cn', 's.click.taobao.com', 'uland.taobao.com', 'tmqd.me'];
const normalizeAffUrl = (raw) => {
  const s = String(raw || '').trim();
  return s.startsWith('//') ? 'https:' + s : s;
};
const isAffiliateUrl = (raw) => {
  try {
    const u = new URL(normalizeAffUrl(raw));
    const h = u.hostname.toLowerCase();
    return (u.protocol === 'https:' || u.protocol === 'http:') && AFF_HOSTS.some((d) => h === d || h.endsWith('.' + d));
  } catch { return false; }
};

const perfumes = (await rj('data/perfumes.json')).perfumes;
const ids = new Set(perfumes.map((p) => p.id));
const source = await rj('data/affiliate-links.source.json');
source.taobao = source.taobao || {};

const VERIFY = path.join(ROOT, 'data/.cache', `aff-verify-${new Date().toISOString().slice(0, 10)}.json`);
const verify = existsSync(VERIFY) ? JSON.parse(await readFile(VERIFY, 'utf8')) : { rows: [], tally: {} };
const byVerdict = new Map((verify.rows || []).map((r) => [r.id, r]));
const LADDER = path.join(ROOT, 'data/.cache', `aff-ladder-${new Date().toISOString().slice(0, 10)}.json`);
const ladder = existsSync(LADDER) ? JSON.parse(await readFile(LADDER, 'utf8')) : { results: [] };
const winnerOf = new Map((ladder.results || []).filter((r) => r.winner).map((r) => [r.id, r.winner]));

console.log(`复核文件：${Object.entries(verify.tally || {}).map(([k, v]) => `${k}=${v}`).join('  ') || '（无）'}`);

const before = Object.keys(source.taobao).length;
const removed = [];
for (const id of REVOKED) {
  if (!source.taobao[id]) { console.log(`  · ${id}  source 里本来就没有，跳过`); continue; }
  delete source.taobao[id];
  removed.push(id);
}

const OK = new Set(['latin-all', 'cn-alias']);
const added = []; const skipped = [];
for (const [id, w] of winnerOf) {
  if (source.taobao[id]) continue;                       // 已有（含刚删的）不再加回
  if (!ids.has(id)) { skipped.push([id, 'perfumes.json 无此 id']); continue; }
  const v = byVerdict.get(id);
  if (!v || !OK.has(v.verdict)) { continue; }            // 复核不放行或未复核
  const url = normalizeAffUrl(w.clickUrl);
  if (!isAffiliateUrl(url)) { skipped.push([id, `非联盟域名：${url.slice(0, 48)}`]); continue; }
  source.taobao[id] = url;
  added.push({ id, verdict: v.verdict, stage: w.stage, q: w.q, title: String(w.title || '').slice(0, 48) });
}

const after = Object.keys(source.taobao).length;
console.log(`\nsource.taobao：改前 ${before} → 删 ${removed.length} → 加 ${added.length} → 改后 ${after}`);
for (const id of removed) console.log(`  - ${id}`);
for (const a of added) console.log(`  + ${a.id}  [${a.verdict}] L${a.stage}「${a.q}」 ← ${a.title}`);
for (const [id, w] of skipped) console.log(`  ! ${id}  ${w}`);

/* 一致性自检：每条新增的 id 都能在 source 里查到，且 URL 是联盟域名 */
const bad = added.filter((a) => !isAffiliateUrl(source.taobao[a.id]));
if (bad.length) { console.error(`\n✗ ${bad.length} 条新增自检不通过，中止`); process.exit(1); }

if (!WRITE) { console.log('\n--dry：未写文件（加 --write 才写）'); process.exit(0); }

await writeFile(path.join(ROOT, 'data/affiliate-links.source.json'),
  JSON.stringify(source, null, 1) + '\n', 'utf8');
console.log(`\n已写 data/affiliate-links.source.json（${after} 条）`);
console.log('下一步：node scripts/gen-affiliate-links.mjs');
