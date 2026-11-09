// probe-reject-shape.mjs — 摸清 affiliate-links.json 的层级结构与拒收理由分布
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

const aff = readJson("data/affiliate-links.json");
const cand = readJson("data/products.candidates.json");

const out = {};
out.affTopKeys = Object.keys(aff);
out.affCoverage = aff.coverage;
out.affTaobaoKind = Array.isArray(aff.taobao) ? `array(${aff.taobao.length})` : `object(${Object.keys(aff.taobao).length})`;

const keys = Array.isArray(aff.taobao) ? null : Object.keys(aff.taobao);
out.affTaobaoSampleKeys = keys ? keys.slice(0, 5) : null;
const firstKey = keys ? keys[0] : null;
const first = firstKey ? aff.taobao[firstKey] : (aff.taobao[0] || null);
const shallow = (v) => {
  if (Array.isArray(v)) return { __array: v.length, first: v[0] && typeof v[0] === "object" ? Object.keys(v[0]) : v[0] };
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v)) {
      const val = v[k];
      if (Array.isArray(val)) o[k] = { __array: val.length, firstKeys: val[0] && typeof val[0] === "object" ? Object.keys(val[0]) : undefined };
      else if (val && typeof val === "object") o[k] = { __object: Object.keys(val) };
      else o[k] = val;
    }
    return o;
  }
  return v;
};
out.affFirstEntry = firstKey ? { key: firstKey, shape: shallow(first) } : (first ? "array-mode" : null);

// 拒收理由分布（candidates.rejected）
const reasonCount = {};
for (const r of cand.rejected || []) {
  const reason = r.picked && r.picked.reason ? r.picked.reason : (r.picked === null ? "__picked_null__" : "__no_reason__");
  reasonCount[reason] = (reasonCount[reason] || 0) + 1;
}
out.candRejectReasons = reasonCount;

console.log(JSON.stringify(out, null, 2).slice(0, 7000));
