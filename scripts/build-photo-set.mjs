#!/usr/bin/env node
/**
 * 把 data/product-images.source.json 的候选图批量落成 images/*.webp，
 * 并写回 data/photos.json（页面直接读这张表）。
 *
 * 每瓶有多条候选图（白底 / 营销主图 / 小图），按顺序逐张试判据，
 * **第一张通过的就用它**，其余不再下载。
 *
 * 为什么一图多源：三档覆盖率差得远（实测 3415 个商品）——
 *   white_image   660 张  覆盖 19.3%   通过判据 73%
 *   pict_url     3415 张  覆盖 100%    通过判据 16%（多数带价签/贴纸）
 *   small_images 3113 个商品有        覆盖 91%    抽 118 张通过 52.5%
 * 只用 white_image 时 1388 瓶里只有 168 瓶有图（12%），用户在结果页看到的是
 * 「三张卡全是绘制瓶形」。三档拼起来才把覆盖率做上去。
 *
 * 为什么"不过判据就不给图"：用户明确要求「仅含香水本身，不包含任何贴图、
 * 文字或贴纸」。一张带价签的营销图塞进推荐卡，比没有图更糟 ——
 * 它会让整屏看起来像广告位，而这张卡其他部分都是认真写的。
 *
 * 用法：
 *   node scripts/build-photo-set.mjs              # 全量
 *   node scripts/build-photo-set.mjs --limit 20   # 只跑 20 瓶
 *   node scripts/build-photo-set.mjs --dry        # 只统计，不写文件
 *   node scripts/build-photo-set.mjs --rebuild    # 忽略已有照片，全部重跑
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data/product-images.source.json');
const PHOTOS = path.join(ROOT, 'data/photos.json');
const IMG_DIR = path.join(ROOT, 'images');
const TMP = path.join(ROOT, 'data/.cache/photos-raw');
const PY = process.env.PYTHON || 'F:/python.exe';
const SCRIPT = path.join(ROOT, 'scripts/build-photos.py');

const argv = process.argv.slice(2);
const LIMIT = (() => {
  const i = argv.indexOf('--limit');
  return i >= 0 ? Number(argv[i + 1]) : Infinity;
})();
const DRY = argv.includes('--dry');
const REBUILD = argv.includes('--rebuild');

/* 每瓶最多试几张候选。小图动辄七八张，全试会让下载量翻几倍；
   按「白底 → 主图 → 小图前 3 张」取前 5 张，实测够用。 */
const MAX_TRY = 5;

const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const photos = JSON.parse(fs.readFileSync(PHOTOS, 'utf8'));
photos.photos = photos.photos || {};

/* 候选表里已经没有的瓶子，它的照片必须一起作废。
   merge-product-candidates.mjs 会把判据判死的错配从候选表里删掉，
   但 photos.json 是另一张表，没人清理就会把「错商品的图」一直发给页面。 */
const srcIds = new Set(Object.keys(src.taobao || {}));
const keepCutouts = new Set(Array.isArray(photos.cutouts) ? photos.cutouts : []);
const orphaned = Object.keys(photos.photos).filter((id) => !srcIds.has(id) && !keepCutouts.has(id));
if (orphaned.length) {
  if (DRY) {
    console.log(`--dry：将清掉 ${orphaned.length} 条已不在候选表的旧照片: ${orphaned.join(', ')}`);
  } else {
    for (const id of orphaned) {
      delete photos.photos[id];
      const f = path.join(IMG_DIR, `${id}.webp`);
      try { fs.unlinkSync(f); } catch { /* 文件本来就不在 */ }
    }
    console.log(`清掉 ${orphaned.length} 条已不在候选表的旧照片: ${orphaned.join(', ')}`);
  }
}

/* 摊平成「每瓶一个候选数组」 */
const bottles = [];
for (const [id, v] of Object.entries(src.taobao || {})) {
  if (!REBUILD && photos.photos[id]) continue;   // 已有照片的跳过，避免重复劳动
  const list = [{ src: v.src, kind: v.kind || 'marketing' }, ...(v.alts || [])]
    .filter((c) => c && typeof c.src === 'string' && c.src);
  if (!list.length) continue;
  bottles.push({ id, cands: list.slice(0, MAX_TRY) });
}
const todo = bottles.slice(0, LIMIT === Infinity ? bottles.length : LIMIT);
console.log(`待处理 ${todo.length} 瓶（已有照片 ${Object.keys(photos.photos).length} 瓶${REBUILD ? '，--rebuild 全部重跑' : '，已跳过'}）`);
if (!todo.length) process.exit(0);

/* 下载。失败不致命——那张候选图不可用，还有下一张。 */
await fsp.mkdir(TMP, { recursive: true });
const staged = [];   // { bottleId, file, kind, order }
/* 下载失败的瓶子必须留名记录：一张候选都没下到 = 这瓶根本没进判据环节，
   若不记录，它既不在 pass 也不在 noPhoto 里，统计表看起来"少了几十瓶"，
   而报表给出的原因全是判据拒收 —— 读者会误以为判据太严，实际是图没下到。 */
const dlFailed = [];   // { bottleId, why }
let dlFail = 0, dlOk = 0;
for (let i = 0; i < todo.length; i++) {
  const b = todo[i];
  let got = 0;
  for (let k = 0; k < b.cands.length; k++) {
    const c = b.cands[k];
    const f = path.join(TMP, `${b.id}-${k}-${c.kind}.bin`);
    try {
      const r = await fetch(c.src);
      if (!r.ok) { dlFail++; continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      // 小于 1KB 基本是错误页/占位图，不浪费后面判据的时间
      if (buf.length < 1024) { dlFail++; continue; }
      await fsp.writeFile(f, buf);
      staged.push({ bottleId: b.id, file: f, kind: c.kind, order: k });
      dlOk++;
      got++;
    } catch { dlFail++; }
  }
  if (!got) dlFailed.push({ bottleId: b.id, why: `下载失败（${b.cands.length} 张候选全部未取到）` });
  if ((i + 1) % 40 === 0) process.stdout.write(`  下载 ${i + 1}/${todo.length} 瓶（${dlOk} 张）\n`);
}
console.log(`下载 ${dlOk} 张，失败 ${dlFail}${dlFailed.length ? `，${dlFailed.length} 瓶一张都没下到` : ''}`);

if (!staged.length) process.exit(0);

/* 判据 + 裁切：一次 python 进程跑完（每张单开进程要 0.3s 启动开销，几千张很可观）。
   文件名里带瓶 id 与序号，回来后在 JS 侧按「瓶 → 最小序号且通过」挑。 */
const manifest = path.join(TMP, 'manifest.json');
await fsp.writeFile(manifest, JSON.stringify(staged.map((s) => ({
  id: s.bottleId, file: s.file, kind: s.kind, order: s.order,
}))), 'utf8');

const outDir = DRY ? path.join(TMP, 'out') : IMG_DIR;
await fsp.mkdir(outDir, { recursive: true });

const raw = execFileSync(PY, [SCRIPT, 'batch', manifest, outDir], {
  encoding: 'utf8', maxBuffer: 512 << 20,
});
// batch 输出一行一图，id 可能与多张候选重复 → 用 order 还原顺序
const lines = raw.trim().split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
const recs = [];
for (let i = 0; i < lines.length && i < staged.length; i++) {
  recs.push({ ...lines[i], order: staged[i].order, file: staged[i].file });
}

/* 按瓶挑第一张通过的 */
const byBottle = new Map();
for (const r of recs) {
  const cur = byBottle.get(r.id);
  if (!cur) byBottle.set(r.id, r);
  else if (r.ok && (!cur.ok || r.order < cur.order)) byBottle.set(r.id, r);
}
const picked = [...byBottle.values()];
const pass = picked.filter((r) => r.ok);
/* 一张候选都没下到的瓶子不在 byBottle 里（它们连 manifest 都没进），
   显式补进 noPhoto，否则统计表少算它们、原因全归到判据头上。 */
const noPhoto = [
  ...picked.filter((r) => !r.ok),
  ...dlFailed
    .filter((d) => !byBottle.has(d.bottleId))
    .map((d) => ({ id: d.bottleId, ok: false, why: d.why })),
];

const byKind = (k) => ({ ok: recs.filter((r) => r.kind === k && r.ok).length, all: recs.filter((r) => r.kind === k).length });
const denom = picked.length + dlFailed.filter((d) => !byBottle.has(d.bottleId)).length;
console.log(`\n有图 ${pass.length}/${denom} 瓶 = ${(pass.length / Math.max(1, denom) * 100).toFixed(0)}%`);
for (const k of ['white', 'marketing', 'small']) {
  const b = byKind(k);
  if (b.all) console.log(`  ${k.padEnd(10)} 单图判据通过 ${b.ok}/${b.all} = ${(b.ok / b.all * 100).toFixed(0)}%`);
}
const kindCount = {};
for (const r of pass) kindCount[r.kind] = (kindCount[r.kind] || 0) + 1;
console.log('  最终采用来源分布:', kindCount);

const reasons = {};
for (const r of noPhoto) {
  const k = String(r.why || '?').split('（')[0].replace(/[0-9.]+/g, 'N').slice(0, 40);
  reasons[k] = (reasons[k] || 0) + 1;
}
console.log(`\n${noPhoto.length} 瓶无可用的干净图（降级绘制瓶形），原因:`);
Object.entries(reasons).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v}  ${k}`));

if (DRY) {
  console.log('\n--dry：不写 photos.json，也不动 images/。');
  process.exit(0);
}

for (const r of pass) photos.photos[r.id] = `images/${r.id}.webp`;
photos._meta = {
  count: Object.keys(photos.photos).length,
  updated: new Date().toISOString().slice(0, 10),
  note: '由 scripts/build-photo-set.mjs 生成：淘宝物料接口候选图（white_image / pict_url / small_images）'
    + ' → build-photos.py 判据（只查边框纯色 + 底色非中间灰）→ 裁切 208×352 webp。'
    + '未通过判据的瓶子不给图，页面降级回绘制瓶形。',
};
await fsp.writeFile(PHOTOS, JSON.stringify(photos, null, 1) + '\n', 'utf8');

const bytes = pass.reduce((s, r) => s + (r.bytes || 0), 0);
console.log(`\n写入 data/photos.json：${photos._meta.count} 瓶`);
console.log(`  本轮新增 ${pass.length} 张，共 ${(bytes / 1024).toFixed(0)} KB，均 ${(bytes / Math.max(1, pass.length) / 1024).toFixed(1)} KB`);
console.log('下一步：node scripts/test-render.mjs');
