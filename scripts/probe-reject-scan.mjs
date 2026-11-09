// probe-reject-scan.mjs — 零 API 扫描：找出「品牌名未出现在标题里」的拒收记录，输出结构化摘要
// 只读本地 JSON；不写任何已提交文件。产物：data/.cache/reject-scan.json
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

const cand = readJson("data/products.candidates.json");
const alias = readJson("data/brand-aliases.json");
const aff = readJson("data/affiliate-links.json");

const out = { generatedAt: new Date().toISOString(), sections: {} };

// 1) products.candidates.json
out.sections.candidates = {
  stats: cand.stats,
  acceptedCount: (cand.accepted || []).length,
  rejectedCount: (cand.rejected || []).length,
};

// 2) affiliate-links.json 形状
const affProbe = (v, depth = 0) => {
  if (Array.isArray(v)) return { kind: "array", len: v.length, sample: v[0] ? affProbe(v[0], depth + 1) : null };
  if (v && typeof v === "object") {
    const keys = Object.keys(v);
    return { kind: "object", keys: keys.slice(0, 12), len: keys.length, sample: keys[0] ? affProbe(v[keys[0]], depth + 1) : null };
  }
  return { kind: typeof v, value: typeof v === "string" ? v.slice(0, 80) : v };
};
out.sections.affiliateLinks = affProbe(aff);

// 3) 别名表
out.sections.brandAliases = {
  count: Object.keys(alias).filter((k) => k !== "_readme").length,
  keys: Object.keys(alias).filter((k) => k !== "_readme"),
};

fs.mkdirSync(path.join(ROOT, "data/.cache"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "data/.cache/reject-scan.json"), JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify(out, null, 2).slice(0, 6000));
