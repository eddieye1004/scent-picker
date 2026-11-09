// probe-reject-verify.mjs — 对 62 条「品牌名未出现在标题里」逐条判「误杀 / 真错配」，
// 并用**内存中临时增补的别名表**验证「加这一条别名能不能把它救回来」，同时做别名冲突检测。
//
// 全程只读 + 只写 data/.cache/reject-verify.json。不改 data/brand-aliases.json。
import fs from "node:fs";
import path from "node:path";
import { scoreMatch, normalizeTokens } from "./lib/union-api.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const rd = (p) => JSON.parse(fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), "utf8").replace(/^\uFEFF/, ""));

const sample = rd("data/.cache/reject-sample.json");
const alias = rd("data/brand-aliases.json");
const V2 = "C:/Users/16256/Documents/deepseek-harness/default-workspace/scent-picker-v2/data/products.candidates.json";
const v2 = rd(V2);
const perfumes = rd("data/perfumes.json").perfumes;
const byId = new Map(perfumes.map((p) => [p.id, p]));

/* ---------- 人工判读结果（逐条看标题得出，见 docs/reports/reject-review.md 的对照表） ----------
   verdict:
     kill   = 误杀（标题就是这瓶正品，仅因品牌名写法判据认不出）
     wrong  = 真错配（标题是别的品牌 / 别的品类 / 平替 / 分装）
     unsure = 无法从标题判定（标题里根本没有品牌名，也没有可辨识的正品线索）
   alias: 若 verdict=kill，说明本条要靠补哪条别名救回；null=即使补别名也救不回
*/
const VERDICT = {
  "maison-margiela-replica-by-the-fireplace": { verdict: "kill", cat: "标题品牌名写变形", alias: "梅森 马吉" },
  "chloe-nomade": { verdict: "kill", cat: "缺别名", alias: "蔻依" },
  "frederic-malle-lipstick-rose": { verdict: "wrong", cat: "", note: "类目是唇彩/唇釉，商品是 Lip Gloss，判据拒对了但理由错（类目路径含「香水」二字蒙混过关），应加「唇彩」反向词" },
  "amouage-gold-man": { verdict: "wrong", cat: "", note: "欧瑞莲 Oriflame Giordani Gold Man，非同品牌" },
  "ralph-lauren-polo-blue": { verdict: "kill", cat: "缺别名", alias: "拉夫劳伦" },
  "ralph-lauren-polo-red": { verdict: "kill", cat: "缺别名", alias: "拉夫劳伦" },
  "guerlain-vetiver": { verdict: "wrong", cat: "", note: "「Vétiver d'Hiver 江南月色」不是 Guerlain Vétiver" },
  "maison-margiela-replica-when-the-rain-stops": { verdict: "kill", cat: "标题品牌名写变形", alias: "梅森 马" },
  "santa-maria-novella-melograno": { verdict: "wrong", cat: "", note: "蕾莉欧 L'Erbolario 的石榴，同名不同牌" },
  "atelier-cologne-orange-sanguine": { verdict: "wrong", cat: "", note: "标题自述「平替」" },
  "michael-kors-pour-homme": { verdict: "wrong", cat: "", note: "范思哲 Pour Homme，撞名" },
  "montale-pure-gold": { verdict: "wrong", cat: "", note: "Lattafa Rave Now Pure Desire Gold" },
  "floris-cherry-blossom": { verdict: "wrong", cat: "", note: "huda beauty 定妆散粉，非香水" },
  "roja-parfums-scandal": { verdict: "wrong", cat: "", note: "J.P. Gaultier Scandal Pour Homme，撞名不同牌" },
  "bvlgari-pour-homme": { verdict: "wrong", cat: "", note: "范思哲 Pour Homme，撞名" },
  "juliette-has-a-gun-miss-charming": { verdict: "wrong", cat: "", note: "Assaf 品牌香水" },
  "memo-paris-ocean-leather": { verdict: "wrong", cat: "", note: "Xunlan 品牌，非 Memo" },
  "ormonde-jayne-osmanthus": { verdict: "wrong", cat: "", note: "柏世曼 8 号桂花，非同牌" },
  "the-different-company-bergamote": { verdict: "wrong", cat: "", note: "Le Labo Bergamote 22" },
  "bvlgari-man-extreme": { verdict: "wrong", cat: "", note: "Jimmy Choo Man Extreme，撞名" },
  "nishane-karagoz": { verdict: "unsure", cat: "", note: "Nishane Karagoz 确实是这支，但标题全篇无品牌，只有另一个 Nishane 香名 hacivat 作陪衬；无法仅凭标题确认正品" },
  "etro-heliotrope": { verdict: "wrong", cat: "", note: "L.T. Piver Héliotrope Blanc" },
  "profumum-roma-olibanum": { verdict: "unsure", cat: "", note: "标题只有 Olibanum + 香调罗列，无品牌" },
  "afnan-paris-oud": { verdict: "wrong", cat: "", note: "Paris Corner Magic Oud" },
  "armaf-blue-sky": { verdict: "wrong", cat: "", note: "穿戴甲，非香水" },
  "armaf-club-de-nuit-woman": { verdict: "kill", cat: "标题只写子线名", alias: "Club De Nuit", risk: "子线名当品牌别名可能误伤同名词，需人工确认该子线是否 Armaf 独占", note: "标题写 Club De Nuit Arab Perfumes Woman，全篇无 Armaf" },
  "armaf-match-point": { verdict: "wrong", cat: "", note: "Lacoste Match Point" },
  "armaf-odyssey-homme-white-edition": { verdict: "kill", cat: "标题只写子线名", alias: "Odyssey Homme", risk: "同上，子线名当品牌别名", note: "标题写 Odyssey Homme White Edition 奥德赛，无 Armaf" },
  "armaf-oros-holiday-edition": { verdict: "kill", cat: "标题只有中文品牌", alias: "奥洛斯", note: "标题写 Oros 奥洛斯（Armaf 的独立子线名），无 Armaf 字样；补「奥洛斯」可救回" },
  "bentley-for-men-intense": { verdict: "wrong", cat: "", note: "Armaf Club de Nuit Intense for Men" },
  "calvin-klein-eternity-moment": { verdict: "kill", cat: "缺别名", alias: "凯文克莱" },
  "dior-homme-cologne": { verdict: "wrong", cat: "", note: "Roja Dove Pour Homme Parfum Cologne" },
  "dolce-gabbana-pour-homme": { verdict: "wrong", cat: "", note: "范思哲 Pour Homme，撞名" },
  "dunhill-desire-blue": { verdict: "wrong", cat: "", note: "DE COSTA BLUE DESIRE" },
  "dunhill-london": { verdict: "wrong", cat: "", note: "Jo Malone London 祖玛珑——正是「London」不能单独当别名的反例" },
  "etro-musk": { verdict: "unsure", cat: "", note: "瑞士 MUSK 白麝香，标题无品牌" },
  "fugazzi-parfum-1": { verdict: "wrong", cat: "", note: "parfum d'empire" },
  "hugo-boss-boss-in-motion": { verdict: "kill", cat: "缺别名", alias: "雨果波士" },
  "juliette-has-a-gun-powder-love": { verdict: "wrong", cat: "", note: "腮红盘，非香水" },
  "maison-margiela-coffee-break": { verdict: "wrong", cat: "", note: "ORLY 指甲油" },
  "maison-margiela-when-the-rain-stops": { verdict: "kill", cat: "标题品牌名写变形", alias: "梅森 马" },
  "mancera-roses-vanille-parfum": { verdict: "wrong", cat: "", note: "sahar 埃及香精油（分装/仿香）" },
  "matiere-premiere-radical-rose": { verdict: "kill", cat: "标题品牌名写变形", alias: "马蒂埃" },
  "miu-miu-fleur-de-lait": { verdict: "kill", cat: "缺别名", alias: "缪缪" },
  "montale-amber-musk": { verdict: "unsure", cat: "", note: "迪拜 Musk amber 油，标题无品牌" },
  "montale-be-my-plum": { verdict: "wrong", cat: "", note: "rhode 腮红棒" },
  "montale-intense-roses-musk": { verdict: "wrong", cat: "", note: "Armaf Club de Nuit Intense Man" },
  "montale-intense-starry-nights": { verdict: "wrong", cat: "", note: "DLARON 迪拉瑞" },
  "montale-ristretto-intense-cafe": { verdict: "wrong", cat: "", note: "DLARON 迪拉瑞" },
  "montale-vanilla-extasy": { verdict: "wrong", cat: "", note: "NARS 遮瑕蜜" },
  "montblanc-legend-red": { verdict: "wrong", cat: "", note: "Dance Legend 指甲油" },
  "mugler-angel-stellar": { verdict: "kill", cat: "缺别名", alias: "穆格" },
  "nabeel-gold-24k": { verdict: "wrong", cat: "", note: "娇兰 Guerlain 金钻" },
  "narciso-rodriguez-all-of-me-intense": { verdict: "kill", cat: "缺别名", alias: "纳西索" },
  "pantheon-roma-annone": { verdict: "wrong", cat: "", note: "泰国 ANNONE" },
  "prada-candy-gloss": { verdict: "wrong", cat: "", note: "唇彩" },
  "rabanne-invictus-legend": { verdict: "wrong", cat: "", note: "Fragrance World 平替" },
  "tom-ford-grey-vetiver": { verdict: "wrong", cat: "", note: "sahar 埃及香精油 8ml 走珠" },
  "tom-ford-oud-voyager": { verdict: "unsure", cat: "", note: "标题只有 Oud Voyager，无品牌" },
  "tom-ford-vanilla-sex": { verdict: "wrong", cat: "", note: "sahar 埃及香精" },
  "versace-eros-eau-de-toilette": { verdict: "kill", cat: "缺别名", alias: "范思哲" },
  "vilhelm-parfumerie-mango-skin": { verdict: "wrong", cat: "", note: "韩国定妆喷雾" },
};

/* ---------- 逐条复算 + 别名模拟 ---------- */
const results = [];
for (const row of sample.brandMiss) {
  const p = byId.get(row.id) || { brand: row.brand, name: row.name };
  const v = VERDICT[row.id] || { verdict: "unsure", cat: "", note: "未判读" };
  const base = scoreMatch(p, row.title, alias, row.categoryText);

  let sim = null;
  if (v.alias) {
    const aug = { ...alias, [String(p.brand)]: [...(alias[String(p.brand)] || []), v.alias] };
    const r2 = scoreMatch(p, row.title, aug, row.categoryText);
    sim = { alias: v.alias, accept: r2.accept, reason: r2.reason, brandHit: r2.brandHit, nameCover: r2.nameCover };
  }

  results.push({
    id: row.id,
    brand: p.brand,
    name: p.name,
    title: row.title,
    categoryText: row.categoryText,
    baseReason: base.reason,
    baseBrandHit: base.brandHit,
    baseNameCover: base.nameCover,
    verdict: v.verdict,
    cat: v.cat || "",
    note: v.note || "",
    proposedAlias: v.alias || null,
    patchRisk: v.risk || null,
    simulation: sim,
  });
}

/* ---------- 别名冲突检测：这条别名会不会误伤别的品牌 ---------- */
// 语料：v2 快照里所有带 picked.title 的记录（accepted + rejected），带各自的瓶 brand
const corpus = [];
for (const a of v2.accepted || []) {
  if (a.picked?.title) corpus.push({ id: a.id, brand: a.brand, title: a.picked.title });
}
for (const r of v2.rejected || []) {
  if (r.picked?.title) corpus.push({ id: r.id, brand: r.brand, title: r.picked.title });
}

const hitOne = (needle, title) => {
  const s = String(needle || "").trim().toLowerCase();
  if (!s) return false;
  const tl = String(title || "").toLowerCase();
  if (/[\u4e00-\u9fa5]/.test(s)) return tl.includes(s);
  const toks = new Set(normalizeTokens(tl));
  return normalizeTokens(s).some((t) => t.length > 1 && toks.has(t));
};

const aliasProposals = [...new Set(results.filter((r) => r.proposedAlias).map((r) => r.proposedAlias))];
const collisions = [];
for (const a of aliasProposals) {
  const owners = results.find((r) => r.proposedAlias === a);
  const hits = corpus.filter((c) => hitOne(a, c.title));
  const otherBrandHits = hits.filter((c) => c.brand !== owners.brand);
  collisions.push({
    alias: a,
    forBrand: owners.brand,
    totalTitleHits: hits.length,
    sameBrandTitles: hits.filter((c) => c.brand === owners.brand).length,
    otherBrandTitles: otherBrandHits.length,
    otherBrandExamples: otherBrandHits.slice(0, 5).map((c) => ({ id: c.id, brand: c.brand, title: c.title })),
    evidenceTitle: owners.title,
    evidenceBottleId: owners.id,
  });
}

/* ---------- 汇总 ---------- */
const tally = { kill: 0, wrong: 0, unsure: 0 };
for (const r of results) tally[r.verdict]++;
const catTally = {};
for (const r of results) if (r.verdict === "kill") catTally[r.cat] = (catTally[r.cat] || 0) + 1;

const out = {
  generatedAt: new Date().toISOString(),
  sampleSource: sample.source,
  sampleCounts: sample.counts,
  aliasTableBrands: Object.keys(alias).filter((k) => k !== "_readme").length,
  tally,
  killByCategory: catTally,
  simulationPassed: results.filter((r) => r.simulation?.accept === true).length,
  simulationFailed: results.filter((r) => r.simulation && r.simulation.accept !== true).map((r) => ({
    id: r.id, alias: r.simulation.alias, reason: r.simulation.reason,
  })),
  collisions,
  results,
};

fs.writeFileSync(path.join(ROOT, "data/.cache/reject-verify.json"), JSON.stringify(out, null, 2), "utf8");

console.log("样本", results.length, "| 误杀", tally.kill, "| 真错配", tally.wrong, "| 存疑", tally.unsure);
console.log("分类", JSON.stringify(catTally));
console.log("模拟通过", out.simulationPassed, "/", results.filter((r) => r.simulation).length);
if (out.simulationFailed.length) console.log("模拟未通过:", JSON.stringify(out.simulationFailed, null, 1));
console.log("别名冲突检测:");
for (const c of collisions) {
  console.log(`  ${c.alias}（${c.forBrand}）: 全库命中 ${c.totalTitleHits} 条，同品牌 ${c.sameBrandTitles}，异品牌 ${c.otherBrandTitles}`);
  for (const e of c.otherBrandExamples) console.log(`      ! ${e.brand} | ${e.title}`);
}
