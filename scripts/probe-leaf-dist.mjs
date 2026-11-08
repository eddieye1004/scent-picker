/* 探针 1：叶子类目分布（只统计，不改判据）。
   语料：v2 全量快照（accepted 624 / rejected 764）+ 本仓 85 条缓存子集。
   对每个候选按 "/" 切 categoryText，取最后一段为叶子层，统计取值分布。
   同时统计：categoryText 空 / 只有一层 / picked 为 null 的条数。
   产物：data/.cache/leaf-dist.json */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const V2 = resolve(root, '..', 'scent-picker-v2', 'data', 'products.candidates.json');
const LOCAL = resolve(root, 'data', '.cache', 'union-api.json');
const OUT = resolve(root, 'data', '.cache', 'leaf-dist.json');

const splitLeaf = (cat) => {
  const raw = String(cat || '').trim();
  if (!raw) return { raw, depth: 0, leaf: '', parents: [] };
  const parts = raw.split('/').map((s) => s.trim()).filter(Boolean);
  return { raw, depth: parts.length, leaf: parts.length ? parts[parts.length - 1] : '', parents: parts.slice(0, -1) };
};

const rows = []; // {source, bucket, id, brand, name, title, categoryText, leaf, depth}

const v2 = JSON.parse(readFileSync(V2, 'utf8'));
for (const bucket of ['accepted', 'rejected']) {
  for (const it of v2[bucket]) {
    const p = it.picked;
    rows.push({
      source: 'v2',
      bucket,
      id: it.id,
      brand: it.brand,
      name: it.name,
      keyword: it.keyword,
      title: p?.title ?? null,
      categoryText: p?.categoryText ?? null,
      reason: p?.reason ?? null,
      hasPicked: !!p,
      ...splitLeaf(p?.categoryText),
    });
  }
}

const local = existsSync(LOCAL) ? JSON.parse(readFileSync(LOCAL, 'utf8')) : {};
let localRows = 0;
for (const [key, v] of Object.entries(local)) {
  for (const c of v.candidates || []) {
    localRows++;
    rows.push({
      source: 'local85',
      bucket: 'cache',
      id: key,
      brand: null,
      name: null,
      keyword: v.keyword,
      title: c.title ?? null,
      categoryText: c.categoryText ?? null,
      reason: c.reason ?? null,
      hasPicked: true,
      ...splitLeaf(c.categoryText),
    });
  }
}

const bump = (map, k) => map.set(k, (map.get(k) || 0) + 1);
const leafCount = new Map();
const leafCountWithPicked = new Map();
const depthCount = new Map();
let emptyCat = 0, noPicked = 0;
for (const r of rows) {
  if (!r.hasPicked) { noPicked++; continue; }
  if (!r.raw) emptyCat++;
  bump(depthCount, r.depth);
  const key = r.leaf || '(空叶子)';
  bump(leafCount, key);
  if (r.bucket === 'accepted') bump(leafCountWithPicked, key);
}

const sorted = [...leafCount.entries()].sort((a, b) => b[1] - a[1]);
out(rows, sorted, depthCount, emptyCat, noPicked, localRows, leafCountWithPicked);

function out(rows, sorted, depthCount, emptyCat, noPicked, localRows, leafCountWithPicked) {
  // 只留 60 条样例明细给后续探针用（全量明细另存）
  const payload = {
    generatedAt: new Date().toISOString(),
    sources: { v2: V2, local: LOCAL },
    counts: {
      rows: rows.length,
      v2: rows.filter((r) => r.source === 'v2').length,
      localCacheCandidates: localRows,
      hasPicked: rows.filter((r) => r.hasPicked).length,
      noPicked,
      emptyCategoryText: emptyCat,
    },
    depthDistribution: [...depthCount.entries()].sort((a, b) => a[0] - b[0]).map(([depth, n]) => ({ depth, n })),
    leafTop: sorted.slice(0, 60).map(([leaf, n]) => ({ leaf, n, nAccepted: leafCountWithPicked.get(leaf) || 0 })),
    leafTotalDistinct: sorted.length,
    rows,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');
  console.log('rows', rows.length, 'distinct leaves', sorted.length, 'emptyCat', emptyCat, 'noPicked', noPicked);
  console.log('depth:', JSON.stringify(payload.depthDistribution));
  console.log('top20:');
  for (const r of payload.leafTop.slice(0, 20)) console.log(String(r.n).padStart(5), r.leaf);
}
