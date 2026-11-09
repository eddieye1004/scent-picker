// probe-links-regress.mjs — 只读取证：affiliate-links.json HEAD(637) vs 工作区(634)
// 用法: node scripts/probe-links-regress.mjs
// 不写任何文件，不改 data/。
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const rd = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

const headRaw = execSync('git show HEAD:data/affiliate-links.json', {
  cwd: ROOT,
  maxBuffer: 64 * 1024 * 1024,
});
const HEAD = JSON.parse(headRaw.toString('utf8'));
const WORK = rd('data/affiliate-links.json');
const SRC = rd('data/affiliate-links.source.json');
const CAND = rd('data/products.candidates.json');
const PERFUMES = rd('data/perfumes.json');

const short = (u) => (u == null ? null : String(u).slice(0, 96) + '…');

const hk = new Set(Object.keys(HEAD.taobao));
const wk = new Set(Object.keys(WORK.taobao));
const lost = [...hk].filter((k) => !wk.has(k)).sort();
const added = [...wk].filter((k) => !hk.has(k)).sort();
const changed = [...hk].filter((k) => wk.has(k) && HEAD.taobao[k] !== WORK.taobao[k]).sort();

console.log('=== 概览 ===');
console.log('HEAD   taobao:', hk.size, JSON.stringify(HEAD.coverage));
console.log('工作区 taobao:', wk.size, JSON.stringify(WORK.coverage));
console.log('仅HEAD有(丢):', lost.length, '| 仅工作区有(增):', added.length, '| 同key不同URL:', changed.length);
console.log('source.json taobao:', Object.keys(SRC.taobao).length);

// 名称解析表
const nameOf = new Map();
const pList = Array.isArray(PERFUMES) ? PERFUMES : (PERFUMES.perfumes ?? Object.values(PERFUMES));
for (const p of pList) if (p && p.id) nameOf.set(p.id, `${p.brand ?? '?'} — ${p.name ?? p.nameZh ?? '?'}`);

// candidates 索引
const accIdx = new Map(CAND.accepted.map((r) => [r.id, r]));
const rejIdx = new Map(CAND.rejected.map((r) => [r.id, r]));
const candOf = (id) => accIdx.get(id) ?? rejIdx.get(id) ?? null;

console.log('\n=== 丢失明细 (仅 HEAD 有) ===');
console.log('id | 名称 | HEAD URL 尾段 | 工作区状态 | candidates | source.json | picked.title');
for (const id of lost) {
  const headUrl = HEAD.taobao[id];
  const workState = WORK.taobao[id] ? '换成另一个URL: ' + short(WORK.taobao[id]) : '完全消失';
  const c = candOf(id);
  const cDesc = c ? (c.accepted ? `accepted, candidateCount=${c.candidateCount}` : `rejected, candidateCount=${c.candidateCount}, picked=${c.picked ? 'has' : 'null'}`) : '不在 candidates';
  const inSrc = SRC.taobao[id] ? '有' : '无';
  const pickedTitle = c?.picked?.title ?? '';
  console.log([id, nameOf.get(id) ?? '(名称缺失)', short(headUrl), workState, cDesc, inSrc, pickedTitle].join(' | '));
}

console.log('\n=== 新增明细 (仅工作区有) ===');
console.log('id | 名称 | 工作区 URL 尾段 | candidates.reason | picked.title');
for (const id of added) {
  const c = candOf(id);
  const reason = c ? (c.accepted ? 'accepted' : `rejected(${c.reasonCode ?? c.rejectReason ?? Object.keys(c).join('/')})`) : '不在 candidates';
  console.log([id, nameOf.get(id) ?? '(名称缺失)', short(WORK.taobao[id]), reason, c?.picked?.title ?? ''].join(' | '));
}

if (changed.length) {
  console.log('\n=== 同 key 但 URL 变了 ===');
  for (const id of changed) {
    console.log([id, short(HEAD.taobao[id]), '→', short(WORK.taobao[id])].join(' | '));
  }
}

console.log('\n=== candidates 全量结构键 ===');
const sampleAcc = CAND.accepted[0] ?? {};
const sampleRej = CAND.rejected[0] ?? {};
console.log('accepted keys:', Object.keys(sampleAcc).join(','));
console.log('rejected keys:', Object.keys(sampleRej).join(','));

console.log('\n=== rejected 原因分布 ===');
const reasonKey = ['reason', 'reasonCode', 'rejectReason', 'why', 'cause'].find((k) => k in sampleRej);
console.log('reason 字段:', reasonKey ?? '(未找到)');
const dist = new Map();
for (const r of CAND.rejected) {
  const v = reasonKey ? String(r[reasonKey]) : `candidateCount=${r.candidateCount}`;
  dist.set(v, (dist.get(v) ?? 0) + 1);
}
for (const [k, v] of [...dist].sort((a, b) => b[1] - a[1])) console.log(`  ${v}\t${k}`);

console.log('\n=== 丢失的 6 条在 rejected 里的完整记录 ===');
for (const id of lost) {
  const r = rejIdx.get(id);
  if (!r) { console.log(`-- ${id}: 不在 rejected`); continue; }
  console.log(`-- ${id} :: ${JSON.stringify(r)}`);
}

console.log('\n=== 决定性证据：丢失 6 条的 HEAD URL 是否等于 candidates.accepted 的 picked.clickUrl ===');
for (const id of lost) {
  const row = accIdx.get(id);
  const picked = row?.picked ?? {};
  const pu = picked.clickUrl ? String(picked.clickUrl).replace(/^\/\//, 'https://') : null;
  console.log(`${id} | HEAD==picked.clickUrl: ${pu === HEAD.taobao[id]} | title: ${String(picked.title ?? '').slice(0, 60)}`);
}

console.log('\n=== 写入时序（mtime）===');
import { statSync } from 'node:fs';
for (const f of ['data/.cache/aff-ladder-2026-11-08.json', 'data/.cache/aff-verify-2026-11-08.json',
  'data/affiliate-links.json.bak-20261108', 'data/affiliate-links.source.json', 'data/affiliate-links.json']) {
  try {
    const s = statSync(resolve(ROOT, f));
    console.log(`  ${f}  ${s.mtime.toISOString()}`);
  } catch { console.log(`  ${f}  (缺失)`); }
}

/* 收敛脚本的硬编码删除清单 —— 丢失 6 条正来自这里 */
console.log('\n=== probe-aff-converge.mjs 的 REVOKED 清单 ===');
const conv = readFileSync(resolve(ROOT, 'scripts/probe-aff-converge.mjs'), 'utf8');
const m = conv.match(/const REVOKED = \[([\s\S]*?)\];/);
if (m) console.log(m[1].split('\n').map((s) => s.trim()).filter((s) => s.startsWith("'")).join('\n'));
else console.log('(没找到 REVOKED)');

console.log('\n=== 关键回归风险：重跑 merge-product-candidates.mjs 会不会把 6 条加回来 ===');
{
  /* merge-product-candidates.mjs:128-146 对 accepted 无条件写 source.taobao[row.id]，
     它没有二次闸门。accepted 里仍含这 6 条 → 重跑就会原样写回。 */
  const accIds = CAND.accepted.map((r) => r.id);
  const notInWork = accIds.filter((id) => !(id in WORK.taobao));
  console.log(`candidates.accepted ${accIds.length} 条，其中当前表里没有的 ${notInWork.length} 条：`);
  console.log('  ' + (notInWork.join(', ') || '(无)'));
  console.log(`推演：${Object.keys(WORK.taobao).length} + ${notInWork.length} = ${Object.keys(WORK.taobao).length + notInWork.length} 条（= 重跑 merge 后的 source.taobao）`);
  console.log('  注：实测 `node scripts/merge-product-candidates.mjs --dry` 输出「将写 … taobao 段：640 条」，与此推演一致。');
}

console.log('\n=== 残留：删除只清了 source.json + affiliate-links.json，未清 skus/images ===');
{
  const sk = rd('data/product-skus.json');
  const im = rd('data/product-images.source.json');
  const skT = sk.taobao || {};
  const imT = im.taobao || {};
  console.log(`product-skus.taobao=${Object.keys(skT).length}  product-images.taobao=${Object.keys(imT).length}`);
  for (const id of lost) {
    console.log(`  ${id} | skus 残留:${id in skT} | imgs 残留:${id in imT}`);
  }
  console.log(`  → 有图无链接的 id 共 ${Object.keys(imT).filter((k) => !(k in WORK.taobao)).length} 条`);
}

console.log('\n=== 新增 3 条的完整标题与复核判定 ===');
{
  const VERIFY = rd('data/.cache/aff-verify-2026-11-08.json');
  const LADDER = rd('data/.cache/aff-ladder-2026-11-08.json');
  const vmap = new Map((VERIFY.rows || []).map((r) => [r.id, r]));
  const wmap = new Map((LADDER.results || []).filter((r) => r.winner).map((r) => [r.id, r.winner]));
  for (const id of added) {
    const w = wmap.get(id);
    const v = vmap.get(id);
    console.log(`-- ${id}`);
    console.log(`   标题: ${w?.title ?? '(ladder 无 winner)'}`);
    console.log(`   判定: ${v?.verdict ?? '?'} | leftover=${v?.leftover ?? '?'} | why: ${v?.why ?? ''}`);
  }
}

console.log('\n=== bak 文件对比 ===');
for (const f of ['data/affiliate-links.json.bak-20261108', 'data/affiliate-links.source.json.bak-20261108']) {
  try {
    const b = rd(f);
    if (b.taobao) {
      const bk = new Set(Object.keys(b.taobao));
      const bLost = [...hk].filter((k) => !bk.has(k));
      const bAdded = [...bk].filter((k) => !hk.has(k));
      console.log(`${f}: taobao=${bk.size} coverage=${JSON.stringify(b.coverage ?? null)} 相对HEAD丢=${bLost.length} 相对HEAD增=${bAdded.length}`);
      console.log(`  相对工作区丢=${[...wk].filter((k) => !bk.has(k)).length} 增=${[...bk].filter((k) => !wk.has(k)).length}`);
    } else {
      console.log(`${f}: taobao=${Object.keys(b.taobao ?? b).length} (无coverage)`);
      const bk = new Set(Object.keys(b.taobao ?? b));
      console.log(`  相对HEAD丢=${[...hk].filter((k) => !bk.has(k)).length} 增=${[...bk].filter((k) => !hk.has(k)).length}`);
    }
  } catch (e) {
    console.log(`${f}: 读取失败 ${e.message}`);
  }
}
