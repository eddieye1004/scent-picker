// probe-reject-extract.mjs — 从 scent-picker-v2 的全量快照里抽出 A 类拒收样本（只读，零 API）
//
// 为什么读 v2：主仓库 data/products.candidates.json 被别的席位用 85 瓶的跑动覆写了
// （stats.queried=85），全量结果已不在磁盘上。scent-picker-v2 里有一份 2026-11-08 22:41:38
// 写入的 1388 瓶全量快照（stats.cached=1388），是同一 pipeline 的产物，作为样本源。
//
// 输出：data/.cache/reject-sample.json（只写这一个文件）
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const SRC = process.argv[2] || "C:/Users/16256/Documents/deepseek-harness/default-workspace/scent-picker-v2/data/products.candidates.json";
const OUT = "data/.cache/reject-sample.json";

const cand = JSON.parse(fs.readFileSync(SRC, "utf8"));
const perfumes = JSON.parse(fs.readFileSync(path.join(ROOT, "data/perfumes.json"), "utf8")).perfumes;
const byId = new Map(perfumes.map((p) => [p.id, p]));

const rows = [];
for (const r of cand.rejected || []) {
  if (!r.picked) continue;
  if (!(r.candidateCount > 0)) continue; // A 类：搜到过商品
  const p = byId.get(r.id) || {};
  rows.push({
    id: r.id,
    brand: r.brand || p.brand || "",
    name: r.name || p.name || "",
    families: p.families || [],
    notesAll: p.notesAll || [],
    keyword: r.keyword,
    candidateCount: r.candidateCount,
    title: r.picked.title,
    categoryText: r.picked.categoryText,
    itemId: r.picked.itemId,
    shop: r.picked.shop,
    price: r.picked.price,
    reason: r.picked.reason,
    brandHit: r.picked.brandHit,
    nameCover: r.picked.nameCover,
    nameVia: r.picked.nameVia,
  });
}

const byReason = {};
for (const r of rows) byReason[r.reason] = (byReason[r.reason] || 0) + 1;

const books = rows.filter((r) => /书籍\/杂志\/报纸/.test(r.categoryText || ""));

const out = {
  generatedAt: new Date().toISOString(),
  source: SRC,
  sourceMeta: { generatedAt: cand.generatedAt, targets: cand.targets, stats: cand.stats },
  counts: { totalRejected: (cand.rejected || []).length, aClass: rows.length, byReason: Object.fromEntries(Object.entries(byReason).sort((a, b) => b[1] - a[1])) },
  brandMiss: rows.filter((r) => r.reason === "品牌名未出现在标题里"),
  books,
  rows,
};

fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(out, null, 2), "utf8");
console.log("A 类", rows.length, "| 品牌未命中", out.brandMiss.length, "| 书籍", books.length);
console.log(JSON.stringify(out.counts.byReason, null, 1).slice(0, 1200));
