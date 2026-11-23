/**
 * make-dist.mjs — 生成 Qoder Sites 的公开输出目录 dist/
 *
 *   node scripts/make-dist.mjs
 *
 * 只把运行时会用到的文件放进 dist：页面、脚本、样式、数据、字体、图标、
 * 24 枚标本 SVG、543 张实物图。测试、文档、源层、探测产物一律不进去。
 * 不裁剪香水数据或图片 —— 这里只做「哪些目录属于产物」的筛选。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const DIST = path.join(ROOT, 'dist');

const FILES = [
  'index.html', 'about.html',
  'app.js', 'styles.css', 'manifest.json', 'sw.js', 'pwa.js',
];
const DIRS = [
  ['src', ['scoring.js', 'notes.js', 'ambient.js', 'history.js', 'share-card.js',
    'avoid.js', 'avoid-map.js', 'season-copy.js']],
  ['data', ['perfumes.json', 'taxonomy.json', 'price-bands.json', 'photos.json',
    'affiliate-links.json', 'tmall-shops.json', 'avoid-scenarios.json']],
  ['fonts', null],
  ['icons', null],
  ['images', null],
  ['icon-specimen/svg', null],
];

const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

for (const f of FILES) copy(path.join(ROOT, f), path.join(DIST, f));
for (const [dir, only] of DIRS) {
  const src = path.join(ROOT, dir);
  if (only) {
    for (const f of only) copy(path.join(src, f), path.join(DIST, dir, f));
    continue;
  }
  fs.cpSync(src, path.join(DIST, dir), { recursive: true });
}

const walk = (d, acc = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, acc); else acc.push(p);
  }
  return acc;
};
const files = walk(DIST);
const bytes = files.reduce((s, f) => s + fs.statSync(f).size, 0);
const missing = FILES.filter((f) => !fs.existsSync(path.join(DIST, f)));

for (const f of ['index.html', 'app.js', 'styles.css', 'manifest.json', 'sw.js',
  'data/perfumes.json', 'icons/icon-192.png', 'icon-specimen/svg',
  'src/avoid.js', 'src/avoid-map.js', 'data/avoid-scenarios.json']) {
  if (!fs.existsSync(path.join(DIST, f))) missing.push(f);
}

console.log(JSON.stringify({
  dist: DIST,
  files: files.length,
  bytes,
  mib: +(bytes / 1048576).toFixed(2),
  missing,
}, null, 2));
process.exit(missing.length ? 1 : 0);
