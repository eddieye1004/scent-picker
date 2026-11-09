// probe-reject-appendix.mjs — 由 reject-verify.json 生成 62 条判读附录表，追加到报告末尾。
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const rd = (p) => JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));

const v = rd(path.join(ROOT, "data/.cache/reject-verify.json"));
const LABEL = { kill: "误杀", wrong: "真错配", unsure: "存疑" };

const lines = [
  "",
  "---",
  "",
  "## 附录：62 条完整判读表",
  "",
  "顺序同 `data/.cache/reject-verify.json` 的 `results[]`。标题截断到 70 字，`|` 替换为 `丨`。",
  "",
  "| 瓶 id | 品牌 | 判定 | 召回标题（截断） |",
  "|---|---|---|---|",
];

for (const r of v.results) {
  const verdict = LABEL[r.verdict] || r.verdict;
  const cat = r.cat ? `（${r.cat}）` : "";
  const title = String(r.title || "").replace(/\|/g, "丨").slice(0, 70);
  lines.push(`| \`${r.id}\` | ${r.brand} | ${verdict}${cat} | ${title} |`);
}

const counts = {};
for (const r of v.results) counts[r.verdict] = (counts[r.verdict] || 0) + 1;
lines.push("");
lines.push(`合计 ${v.results.length} 条：${Object.entries(counts).map(([k, n]) => `${LABEL[k] || k} ${n}`).join(" / ")}。`);
lines.push("");

const reportPath = path.join(ROOT, "docs/reports/reject-review.md");
let report = fs.readFileSync(reportPath, "utf8");
const MARK = "## 附录：62 条完整判读表";
if (report.includes(MARK)) {
  report = report.slice(0, report.indexOf("\n---\n\n" + MARK));
  report = report.replace(/\s+$/, "") + "\n";
}
fs.writeFileSync(reportPath, report.replace(/\s+$/, "") + "\n" + lines.join("\n"), "utf8");
console.log(`appended ${v.results.length} rows to docs/reports/reject-review.md`);
