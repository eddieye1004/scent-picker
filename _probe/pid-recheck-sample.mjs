import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');
const seed = 20261113;
const inventory = JSON.parse(fs.readFileSync(path.join(dir, 'pid-audit-url-inventory.json'), 'utf8'));
const perfumes = JSON.parse(fs.readFileSync(path.join(root, 'data', 'perfumes.json'), 'utf8')).perfumes;
const byId = new Map(perfumes.map((p) => [p.id, p]));
const gold = new Set((await import('../scripts/lib/gold-portraits.mjs')).PORTRAITS.flatMap((p) => p.gold));
const rows = inventory.rows.filter((r) => r.platform === 'taobao');
const pool = rows.filter((r) => !gold.has(r.id));
if (rows.length !== 661 || pool.length !== 634) throw new Error(`unexpected scope rows=${rows.length} pool=${pool.length}`);
let state = seed >>> 0;
function random() { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const shuffled = [...pool];
for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
const selected = shuffled.slice(0, 60);
const sample = selected.map((r) => ({ id: r.id, fullInventoryOrdinal: rows.findIndex((x) => x.id === r.id) + 1, link: JSON.parse(fs.readFileSync(path.join(root, 'data', 'affiliate-links.json'), 'utf8')).taobao[r.id], linkSha256: r.urlSha256, name: byId.get(r.id)?.name ?? null }));
const payload = { seed, algorithm: 'mulberry32-seeded Fisher-Yates', population: 634, sampleSize: 60, generatedAt: new Date().toISOString(), sample };
fs.writeFileSync(path.join(dir, 'pid-recheck-sample.json'), JSON.stringify(payload, null, 2) + '\n');
console.log(`Saved ${sample.length} sample ids before landing checks. First: ${sample[0].id} ordinal ${sample[0].fullInventoryOrdinal}`);
