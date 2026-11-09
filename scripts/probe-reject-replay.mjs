// probe-reject-replay.mjs — 零 API 离线重放：对 union-api 缓存里的每条候选跑 scoreMatch，
// 收集 reason === '品牌名未出现在标题里' 的全部案例。
// 只读快照文件，不碰任何共享中间产物。
import fs from "node:fs";
import path from "node:path";
import { scoreMatch } from "./lib/union-api.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const UNION = arg("--union", "data/.cache/reject-snapshot-union-api.json");
const ALIAS = arg("--alias", "data/brand-aliases.json");
const OUT = arg("--out", "data/.cache/reject-replay.json");

const readJson = (p) => JSON.parse(fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), "utf8"));

const union = readJson(UNION);
const alias = readJson(ALIAS);
const perfumes = readJson("data/perfumes.json").perfumes;
const byId = new Map(perfumes.map((p) => [p.id, p]));

const keys = Object.keys(union);
const rows = [];
let candTotal = 0;
let missingPerfume = 0;

for (const key of keys) {
  const parts = key.split(":");
  const bottleId = parts[1];
  const entry = union[key] || {};
  const perfume = byId.get(bottleId);
  if (!perfume) {
    missingPerfume++;
    continue;
  }
  for (const c of entry.candidates || []) {
    candTotal++;
    const r = scoreMatch(perfume, c.title, alias, c.categoryText);
    rows.push({
      key,
      bottleId,
      brand: perfume.brand,
      name: perfume.name,
      keyword: entry.keyword,
      title: c.title,
      categoryText: c.categoryText,
      itemId: c.itemId,
      price: c.price,
      shop: c.shop,
      reason: r.reason,
      brandHit: r.brandHit,
      nameCover: r.nameCover,
      nameVia: r.nameVia,
      accept: r.accept,
      score: r.score,
    });
  }
}

const byReason = {};
for (const r of rows) {
  const k = r.reason || "(accept)";
  byReason[k] = (byReason[k] || 0) + 1;
}

const brandMiss = rows.filter((r) => r.reason === "品牌名未出现在标题里");

// 按瓶聚合：一个瓶子只要有一条候选因品牌名缺失被拒，就记一笔
const perBottle = new Map();
for (const r of brandMiss) {
  if (!perBottle.has(r.bottleId)) perBottle.set(r.bottleId, []);
  perBottle.get(r.bottleId).push(r);
}

const out = {
  generatedAt: new Date().toISOString(),
  source: { union: UNION, alias: ALIAS },
  counts: {
    unionKeys: keys.length,
    candidates: candTotal,
    missingPerfumeKeys: missingPerfume,
    bottlesWithBrandMiss: perBottle.size,
    brandMissCandidates: brandMiss.length,
    accepted: rows.filter((r) => r.accept).length,
  },
  byReason,
  brandMiss,
  bottles: [...perBottle.entries()].map(([id, list]) => ({
    id,
    brand: list[0].brand,
    name: list[0].name,
    keyword: list[0].keyword,
    missCount: list.length,
    sampleTitles: list.slice(0, 6).map((x) => x.title),
  })),
};

fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify(out.counts, null, 2));
console.log(JSON.stringify(byReason, null, 2));
