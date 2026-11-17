/**
 * add-photos.mjs — 把一批已核过的实物图增量加进 data/photos.json
 *
 * 为什么不复用 build-photo-set.mjs：那个脚本的职责是「从候选源抓图并判据筛选」，
 * 它读 data/product-images.source.json、自己下载、自己跑判据。本批 43 瓶里
 * 有 20 瓶根本不在候选表里（候选表只有淘宝物料接口的 661 瓶），
 * 还有 5 瓶的图来自补抓腿的人工核验结果 —— 它们的图**已经落盘**，
 * 不需要也不该再走一遍网络抓取。
 *
 * 所以这里只做「接线」这一件事：给定 id → 已处理的 webp 文件，把它们
 * 写进 photos.json 并维护 _meta。判据与裁切仍然由 build-photos.py 负责，
 * 本脚本不生产像素。
 *
 * 用法：
 *   node scripts/add-photos.mjs <manifest.json> [--dry]
 *   manifest = [{ "id": "creed-aventus", "webp": "images/creed-aventus.webp" }]
 *
 * 幂等：重复跑不会重复计数；已存在的 id 值不同会被覆盖（这是有意的，
 * 第二批的图是重新核过的，旧值就是错的）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PHOTOS = path.join(ROOT, 'data/photos.json');
const PERFUMES = path.join(ROOT, 'data/perfumes.json');

const argv = process.argv.slice(2);
const manifestPath = argv[0];
const DRY = argv.includes('--dry');
if (!manifestPath) {
  console.error('用法：node scripts/add-photos.mjs <manifest.json> [--dry]');
  process.exit(2);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const photos = JSON.parse(fs.readFileSync(PHOTOS, 'utf8'));
const perfumes = JSON.parse(fs.readFileSync(PERFUMES, 'utf8'));
photos.photos = photos.photos || {};

/* id 必须真的在 perfumes.json 里 —— 写进一个不存在商品的键是静默垃圾，
   页面永远读不到它，而统计会把覆盖率算高。 */
const perfumeIds = new Set(perfumes.perfumes.map((p) => p.id));

let added = 0, replaced = 0;
const problems = [];
for (const m of manifest) {
  if (!m || typeof m.id !== 'string' || typeof m.webp !== 'string') {
    problems.push(`manifest 条目形状不对：${JSON.stringify(m)}`);
    continue;
  }
  if (!perfumeIds.has(m.id)) {
    problems.push(`${m.id}：perfumes.json 里没有这个 id`);
    continue;
  }
  const abs = path.join(ROOT, m.webp);
  if (!fs.existsSync(abs)) {
    problems.push(`${m.id}：${m.webp} 不存在`);
    continue;
  }
  if (path.extname(m.webp) !== '.webp') {
    problems.push(`${m.id}：不是 .webp（${m.webp}）`);
    continue;
  }
  /* 40KB 是 test-render.mjs 里已经存在的硬线（单张图 < 40KB）。
     在这里先挡一次，好过让测试在最后一步炸。 */
  const size = fs.statSync(abs).size;
  if (size >= 40 * 1024) {
    problems.push(`${m.id}：${(size / 1024).toFixed(1)}KB 超过 40KB 硬线`);
    continue;
  }
  const rel = m.webp.split(path.sep).join('/');
  if (photos.photos[m.id]) {
    if (photos.photos[m.id] !== rel) replaced++;
  } else {
    added++;
  }
  photos.photos[m.id] = rel;
}

if (problems.length) {
  console.error(`${problems.length} 条不合格，已拒绝：`);
  problems.forEach((p) => console.error('  ' + p));
  if (problems.length === manifest.length) process.exit(1);
}

const count = Object.keys(photos.photos).length;
console.log(`新增 ${added}，替换 ${replaced}，拒绝 ${problems.length}`);
console.log(`photos.json：${count} 瓶`);

if (DRY) {
  console.log('--dry：不写文件');
  process.exit(0);
}

photos._meta = {
  ...photos._meta,
  count,
  updated: new Date().toISOString().slice(0, 10),
};
/* _meta.note 由 build-photo-set.mjs 维护，这里只在缺失时补，
   避免把那个脚本写的来源说明覆盖成假话。 */
await fs.promises.writeFile(PHOTOS, JSON.stringify(photos, null, 1) + '\n', 'utf8');
console.log(`写入 ${path.relative(ROOT, PHOTOS)}`);
