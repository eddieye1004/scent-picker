/* 香调分类的量化诊断依据
   1) 每族在 1228 瓶中实际出现的原料频次（按 families 权重归属）
   2) 每个小类的 representativeNotes 在族内的覆盖率
   3) 族间原料词表 Jaccard 重叠（区分度）
   4) 小类之间"独有原料"数量（类内对比度来源）
   全部写进 _audit/evidence.md，供逐条诊断引用。
*/
const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/16256/Documents/deepseek-harness/default-workspace/scent-picker';
const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));
const perf = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8')).perfumes;

const FAM = tax.families.map((f) => f.id);
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

/* 把每个香水的 notesAll 归一化；同时记录它属于哪些族（families 权重 > 0） */
const P = perf.map((p) => ({
  notes: new Set((p.notesAll || []).map(norm)),
  fam: p.families || {},
  conc: p.concentration,
}));

/* ---- 1. 族内原料频次 ---- */
const famNoteCount = {};
for (const f of FAM) {
  const bag = new Map();
  let n = 0;
  for (const p of P) {
    if (!(p.fam[f] > 0)) continue;
    n++;
    for (const note of p.notes) bag.set(note, (bag.get(note) || 0) + 1);
  }
  famNoteCount[f] = { n, bag };
}

/* ---- 2. 小类 representative notes 的族内覆盖率 ---- */
function coverage(famId, notes) {
  const { n, bag } = famNoteCount[famId];
  const keys = notes.map((x) => norm(x));
  let hit = 0;
  for (const p of P) {
    if (!(p.fam[famId] > 0)) continue;
    if (keys.some((k) => [...p.notes].some((x) => x === k || x.includes(k) || k.includes(x)))) hit++;
  }
  return { n, hit, pct: (hit / n * 100) };
}

/* ---- 3. 族间 Jaccard（只取各族频次前 40 的原料）---- */
const topNotes = {};
for (const f of FAM) {
  const { bag } = famNoteCount[f];
  topNotes[f] = [...bag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map((x) => x[0]);
}
function jacc(a, b) {
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

const out = [];
out.push('# 香调分类量化诊断依据');
out.push('');
out.push(`数据：\`data/perfumes.json\` 共 ${perf.length} 瓶（Scento 数据集 2026-10-21 快照，CC BY 4.0）；\`data/taxonomy.json\` v${tax.version}，6 族 32 小类。`);
out.push('说明：库中**没有配方百分比字段**，可用的"占比"只有 `families` 权重（0–1）与 `affinity`（族间相近度）。下表所有数字均为本机实测，可复跑 `_audit/evidence.cjs`。');
out.push('');

out.push('## 一、族规模与原料集中度');
out.push('');
out.push('| 族 | 归属瓶数 | 不同原料数 | Top5 原料（出现次数 / 族内占比） |');
out.push('|---|---|---|---|');
for (const f of FAM) {
  const { n, bag } = famNoteCount[f];
  const top5 = [...bag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k, v]) => `${k} ${v}(${(v / n * 100).toFixed(0)}%)`).join(' · ');
  out.push(`| ${tax.families.find((x) => x.id === f).zh} ${f} | ${n} | ${bag.size} | ${top5} |`);
}
out.push('');

out.push('## 二、族间原料词表重叠（Top40 Jaccard，越高越难分）');
out.push('');
out.push('| | ' + FAM.join(' | ') + ' |');
out.push('|---|' + FAM.map(() => '---').join('|') + '|');
for (const a of FAM) {
  out.push(`| **${a}** | ` + FAM.map((b) => a === b ? '—' : jacc(topNotes[a], topNotes[b]).toFixed(2)).join(' | ') + ' |');
}
out.push('');

out.push('## 三、小类代表性原料的族内覆盖率');
out.push('');
out.push('| 族 | 小类 | taxonomy 里的 notes | 族内命中瓶数 | 覆盖率 | 判定 |');
out.push('|---|---|---|---|---|---|');
for (const f of tax.families) {
  for (const s of f.subfamilies) {
    const c = coverage(f.id, s.notes);
    const flag = c.pct >= 40 ? '可辨识' : c.pct >= 20 ? '弱' : '不足';
    out.push(`| ${f.zh} | ${s.zh} ${s.id} | ${s.notes.join(', ')} | ${c.hit}/${c.n} | ${c.pct.toFixed(1)}% | ${flag} |`);
  }
}
out.push('');

out.push('## 四、小类"独有原料"数量（类内对比度来源）');
out.push('');
out.push('| 族 | 小类 | 独有原料（仅此小类登记） | 数量 |');
out.push('|---|---|---|---|');
for (const f of tax.families) {
  const all = f.subfamilies.flatMap((s) => s.notes.map(norm));
  for (const s of f.subfamilies) {
    const mine = s.notes.map(norm);
    const own = mine.filter((x) => all.filter((y) => y === x).length === 1);
    out.push(`| ${f.zh} | ${s.zh} | ${own.length ? own.join(', ') : '（无）'} | ${own.length} |`);
  }
}
out.push('');

out.push('## 五、代表性原料在库中的实际出现次数（全库）');
out.push('');
const allBag = new Map();
for (const p of P) for (const n of p.notes) allBag.set(n, (allBag.get(n) || 0) + 1);
const probe = ['bergamot', 'lemon', 'grapefruit', 'neroli', 'orange blossom', 'lavender', 'rosemary',
  'sandalwood', 'vetiver', 'cedar', 'patchouli', 'oakmoss', 'juniper', 'cypress', 'mint', 'oud',
  'amber', 'benzoin', 'labdanum', 'vanilla', 'tonka bean', 'saffron', 'cinnamon', 'incense',
  'frankincense', 'myrrh', 'leather', 'birch tar', 'fig leaf', 'violet leaf', 'galbanum',
  'green tea', 'marine notes', 'musk', 'calone', 'coumarin', 'sage', 'coffee', 'cocoa', 'almond',
  'coconut', 'rum', 'cognac', 'peach', 'caramel'];
out.push('| 原料 | 全库出现 | 占 1228 瓶 |');
out.push('|---|---|---|');
for (const k of probe) {
  const v = allBag.get(k) || 0;
  out.push(`| ${k} | ${v} | ${(v / perf.length * 100).toFixed(1)}% |`);
}

/* 近似匹配：库里名字不完全对齐（如 Labdanum / labdanum resin）时再扫一遍 */
out.push('');
out.push('## 六、近似名扫描（包含匹配，避免因写法不同误判为 0）');
out.push('');
out.push('| 关键词 | 命中瓶数 | 示例写法 |');
out.push('|---|---|---|');
for (const k of probe) {
  const hits = [];
  for (const [n, v] of allBag) if (n.includes(k)) hits.push([n, v]);
  if (!hits.length) { out.push(`| ${k} | 0 | — |`); continue; }
  hits.sort((a, b) => b[1] - a[1]);
  const tot = hits.reduce((a, b) => a + b[1], 0);
  out.push(`| ${k} | ${tot} | ${hits.slice(0, 3).map(([n, v]) => `${n}(${v})`).join(' / ')} |`);
}

fs.writeFileSync(path.join(ROOT, '_audit', 'evidence.md'), out.join('\n'), 'utf8');
console.log('evidence.md 已生成，' + out.length + ' 行');
