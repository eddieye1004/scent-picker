// probe-reject-alias-impact.mjs — 量化「补别名」对整个 A 类的影响面。
// 做法：拿 reject-sample 的 283 条 A 类行（每行都有真实 picked.title + categoryText），
// 用 scoreMatch 重新打一次分，比较「现表」与「补 12 条安全别名后的表」两版结果。
// 只读 + 只写 data/.cache/reject-alias-impact.json。不改 data/brand-aliases.json。
import fs from "node:fs";
import path from "node:path";
import { scoreMatch } from "./lib/union-api.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const rd = (p) => JSON.parse(fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), "utf8").replace(/^\uFEFF/, ""));

const sample = rd("data/.cache/reject-sample.json");
const alias = rd("data/brand-aliases.json");
const perfumes = rd("data/perfumes.json").perfumes;
const byId = new Map(perfumes.map((p) => [p.id, p]));

// 安全别名（冲突检测里异品牌命中为 0，或异品牌命中已证实是别瓶错配）
const SAFE = {
  "Maison Margiela Fragrances": ["梅森 马吉", "梅森 马"],
  "Chloé": ["蔻依"],
  "Ralph Lauren": ["拉夫劳伦"],
  "Calvin Klein": ["凯文克莱"],
  "Hugo Boss": ["雨果波士"],
  "Matière Première": ["马蒂埃"],
  "Miu Miu": ["缪缪"],
  "Mugler": ["穆格"],
  "Narciso Rodriguez": ["纳西索"],
  "Versace": ["范思哲"],
  "Armaf": ["奥洛斯"],
};

const aug = JSON.parse(JSON.stringify(alias));
for (const [brand, list] of Object.entries(SAFE)) {
  aug[brand] = [...new Set([...(aug[brand] || []), ...list])];
}

const flip = [];
const reasonsAfter = {};
let acceptedBefore = 0;
let acceptedAfter = 0;

for (const row of sample.rows) {
  const p = byId.get(row.id) || { brand: row.brand, name: row.name };
  const before = scoreMatch(p, row.title, alias, row.categoryText);
  const after = scoreMatch(p, row.title, aug, row.categoryText);
  if (before.accept) acceptedBefore++;
  if (after.accept) acceptedAfter++;
  reasonsAfter[after.reason || "(accepted)"] = (reasonsAfter[after.reason || "(accepted)"] || 0) + 1;
  if (!before.accept && after.accept) {
    flip.push({ id: row.id, brand: p.brand, name: p.name, title: row.title, beforeReason: before.reason, afterReason: after.reason });
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  aClassRows: sample.rows.length,
  acceptedBefore,
  acceptedAfter,
  flipped: flip.length,
  flipRows: flip,
  reasonsAfter,
  safeAliases: SAFE,
  note: "acceptedBefore 应该接近 0 —— A 类的定义就是「本次被拒」，重放若得分不一致说明缓存 round 与快照 round 的别名表/判据版本不同",
};

fs.writeFileSync(path.join(ROOT, "data/.cache/reject-alias-impact.json"), JSON.stringify(out, null, 2), "utf8");

console.log(`A 类 ${out.aClassRows} 条 | 现表 accept ${acceptedBefore} → 补别名后 accept ${acceptedAfter} | 翻正 ${flip.length}`);
for (const f of flip) console.log(`  + ${f.id} | ${f.brand} | ${f.title.slice(0, 62)}`);
console.log("补后理由分布:", JSON.stringify(reasonsAfter, null, 1));
