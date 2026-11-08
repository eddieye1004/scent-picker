/* 探针 0：只摸结构，不做判断。
   目的：确认 v2 全量快照 products.candidates.json 的字段形态，
   以及 categoryText 到底长什么样、在哪一层。
   输出写 data/.cache/leaf-shape.json，由人读，不参与任何判定。 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const V2 = resolve(root, '..', 'scent-picker-v2', 'data', 'products.candidates.json');
const OUT = resolve(root, 'data', '.cache', 'leaf-shape.json');

const raw = JSON.parse(readFileSync(V2, 'utf8'));
const out = { source: V2, topKeys: Object.keys(raw), shapes: {} };

for (const k of Object.keys(raw)) {
  const v = raw[k];
  if (Array.isArray(v)) {
    out.shapes[k] = { kind: 'array', count: v.length, first: v[0] ?? null };
    // 第一层的键集合，用来找 reviewed/notes 之类
    const keySets = new Map();
    for (const it of v) {
      const sig = Object.keys(it || {}).sort().join('|');
      keySets.set(sig, (keySets.get(sig) || 0) + 1);
    }
    out.shapes[k].keySigs = [...keySets.entries()].map(([sig, n]) => ({ sig, n }));
  } else {
    out.shapes[k] = { kind: typeof v, value: v };
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
console.log('wrote', OUT);
