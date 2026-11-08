#!/usr/bin/env node
/**
 * 把 data/product-images.source.json 里的主图 URL 批量落成 images/*.webp，
 * 并写回 data/photos.json（页面直接读这张表）。
 *
 * 流程：下载到临时目录 → 逐张过 scripts/build-photos.py 的判据 → 过的裁切存 webp
 *      → 没过的**不给图**（页面降级回绘制瓶形）。
 *
 * 为什么"不过就不给"：用户明确要求「仅含香水本身，不包含任何贴图、文字或贴纸」。
 * 一张带价签的营销图塞进推荐卡，比没有图更糟——它会让整屏看起来像广告位，
 * 而这张卡的其他部分（香调、匹配理由）都是认真写的。
 *
 * 优先级：white_image（平台白底图规范，天然干净）> pict_url（营销图，只留无贴纸的）。
 * 同一瓶两种都有时 white 先跑，过了就不再试 marketing。
 *
 * 用法：
 *   node scripts/build-photo-set.mjs            # 全量
 *   node scripts/build-photo-set.mjs --limit 20 # 先跑 20 瓶看看
 *   node scripts/build-photo-set.mjs --dry      # 只统计，不写 images/ 与 photos.json
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

const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const photos = JSON.parse(fs.readFileSync(PHOTOS, 'utf8'));
photos.photos = photos.photos || {};

/* 候选排序：white 全部先跑，再跑 marketing。
   每瓶只取第一条能过的。 */
const cands = Object.entries(src.taobao || {})
  .map(([id, v]) => ({ id, src: v.src, kind: v.kind || 'marketing' }))
  .filter((c) => c.src && !photos.photos[c.id])   // 已有照片的跳过，避免重复劳动
  .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'white' ? -1 : 1));

const todo = cands.slice(0, LIMIT === Infinity ? cands.length : LIMIT);
console.log(`候选 ${cands.length} 条（已跳过已有照片 ${Object.keys(photos.photos).length} 瓶），本轮处理 ${todo.length}`);
if (!todo.length) process.exit(0);

/* 下载。失败不致命——那一瓶就是没图，不影响其它瓶。 */
await fsp.mkdir(TMP, { recursive: true });
const staged = [];
let dlFail = 0;
for (let i = 0; i < todo.length; i++) {
  const c = todo[i];
  const f = path.join(TMP, `${c.kind}-${c.id}.bin`);
  try {
    const r = await fetch(c.src);
    if (!r.ok) { dlFail++; continue; }
    const b = Buffer.from(await r.arrayBuffer());
    // 小于 1KB 基本是错误页/占位图，不浪费后面判据的时间
    if (b.length < 1024) { dlFail++; continue; }
    await fsp.writeFile(f, b);
    staged.push({ ...c, file: f });
  } catch { dlFail++; }
  if ((i + 1) % 50 === 0) process.stdout.write(`  下载 ${i + 1}/${todo.length}\n`);
}
console.log(`下载成功 ${staged.length}，失败 ${dlFail}`);

if (!staged.length) process.exit(0);

/* 判据 + 裁切：一次 python 进程跑完（每张单开进程要 0.3s 启动开销，几百张很可观） */
const manifest = path.join(TMP, 'manifest.json');
await fsp.writeFile(manifest, JSON.stringify(staged.map((s) => ({
  id: s.id, file: s.file, kind: s.kind,
}))), 'utf8');

const outDir = DRY ? path.join(TMP, 'out') : IMG_DIR;
await fsp.mkdir(outDir, { recursive: true });

const raw = execFileSync(PY, [SCRIPT, 'batch', manifest, outDir], {
  encoding: 'utf8', maxBuffer: 256 << 20,
});
const recs = raw.trim().split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));

const pass = recs.filter((r) => r.ok);
const fail = recs.filter((r) => !r.ok);
const byKind = (k) => ({ ok: recs.filter((r) => r.kind === k && r.ok).length, all: recs.filter((r) => r.kind === k).length });
const w = byKind('white'), m = byKind('marketing');
console.log(`\n判据通过 ${pass.length}/${recs.length}`);
console.log(`  white     ${w.ok}/${w.all}`);
console.log(`  marketing ${m.ok}/${m.all}（已剔除带贴纸的）`);

const reasons = {};
for (const r of fail) {
  const k = String(r.why || '?').split('（')[0].replace(/[0-9.]+/g, 'N').slice(0, 40);
  reasons[k] = (reasons[k] || 0) + 1;
}
console.log('\n未通过的原因:');
Object.entries(reasons).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v}  ${k}`));

if (DRY) {
  console.log('\n--dry：不写 photos.json，也不动 images/。');
  process.exit(0);
}

for (const r of pass) photos.photos[r.id] = `images/${r.id}.webp`;
photos._meta = {
  count: Object.keys(photos.photos).length,
  updated: new Date().toISOString().slice(0, 10),
  note: '由 scripts/build-photo-set.mjs 生成：淘宝物料接口主图 → build-photos.py 判据 → 裁切 208×352 webp。'
    + '未通过判据的瓶子不给图，页面降级回绘制瓶形。',
};
await fsp.writeFile(PHOTOS, JSON.stringify(photos, null, 1) + '\n', 'utf8');

const bytes = pass.reduce((s, r) => s + (r.bytes || 0), 0);
console.log(`\n写入 data/photos.json：${photos._meta.count} 瓶`);
console.log(`  images/ 新增 ${pass.length} 张，共 ${(bytes / 1024).toFixed(0)} KB，均 ${(bytes / Math.max(1, pass.length) / 1024).toFixed(1)} KB`);
console.log('下一步：node scripts/build-css.mjs --check && node scripts/test-render.mjs');
