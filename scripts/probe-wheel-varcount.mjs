/**
 * probe-wheel-varcount.mjs — 第二层轮盘对"每大类小类数可变"的适配验证。
 *
 * 为什么需要单独一条：v7 的中圈是从"六族 × 固定几格"那版改过来的，
 * 代码里有几处**看起来**跟 4 有关（`Math.min(3.4, …)`、标签半径、`--n`），
 * 但没有任何测试按"不同段数"跑过 —— test-render 只走柑橘那一族（改前 4 段）。
 * taxonomy v2.3.0 之后六族分别是 3/5/4/3/4/3 段，5 段此前**从未被渲染过**。
 *
 * 这条探针直接吃 app.js 的 buildWheel 输出的几何值（弧段角度、标签坐标），
 * 不做像素截图 —— 判据是"角度和是否闭合、相邻标签是否重叠"，
 * 这两个用数字就能判，不需要浏览器。
 *
 * 用法：node scripts/probe-wheel-varcount.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const TAX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));

/* 与 app.js renderArcs 完全同一套算式（那里是内联的，这里按同一公式复算）。
   刻意不 import app.js：那需要整套 DOM 桩，而这里要验的只是几何，
   复算一遍能把"公式"与"DOM 装配"分开 —— 公式错和装配错不该混成一个红。 */
const SUB_R2I = 118;
const SUB_R2O = 152;
const SUB_LABEL_R_NARROW = 120;
const VB = 480;
const CX = 240;
const CY = 240;

const polar = (r, deg) => {
  const rad = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
};

const arcsOf = (n) => {
  const step = 360 / n;
  const gap = Math.min(3.4, step * 0.075);
  const rMid = (SUB_R2O + SUB_R2I) / 2;
  return Array.from({ length: n }, (_, i) => {
    const a0 = -90 + i * step + gap / 2;
    const a1 = a0 + step - gap;
    const mid = (a0 + a1) / 2;
    return {
      i,
      a0,
      a1,
      mid,
      sweep: a1 - a0,
      label: polar(rMid, mid),
      labelNarrow: polar(SUB_LABEL_R_NARROW, mid),
    };
  });
};

let pass = 0;
const fails = [];
const ok = (name, cond, detail) => {
  if (cond) { pass += 1; return; }
  fails.push(`${name}${detail ? ' :: ' + detail : ''}`);
};

/* 标签是 4 个汉字，14px/600。窄屏标签在 --nl/--nt 也就是 SUB_LABEL_R_NARROW 上。
   估宽：4 字 × 14px ≈ 56px 盒宽（含 padding 8×2 已由 nowrap+min-width 44 兜住）。
   真要判的是**相邻标签圆心距**够不够并排放：≥ 一个标签宽就不算叠。 */
const LABEL_W = 56;

for (const f of TAX.families) {
  const n = f.subfamilies.length;
  const arcs = arcsOf(n);
  const zh = f.subfamilies.map((s) => s.zh);

  ok(`${f.id} 弧段数 = 小类数（${n}）`, arcs.length === n);

  /* ① 各段首尾相接、整圈闭合：a0 递增 step，最后一段的 a1 回到第一段的 a0 - gap。
     这条抓的是"段数变了但角度还按 4 段算"那类错。 */
  const step = 360 / n;
  const contiguous = arcs.every((a, i) => {
    const next0 = i + 1 < n ? arcs[i + 1].a0 : arcs[0].a0 + 360;
    return Math.abs((next0 - a.a1) - Math.min(3.4, step * 0.075)) < 1e-9;
  });
  ok(`${f.id} 整圈首尾相接（缝宽一致）`, contiguous,
    arcs.map((a) => `${a.a0.toFixed(1)}→${a.a1.toFixed(1)}`).join(' '));

  /* ② 每段都够宽、点得到：sweep 对应的弧长（rMid 处）要远大于 44px 的点击下限。
     实测 5 段时 sweep≈68.4°，弧长 135×(68.4π/180) ≈ 161 视框单位，
     在 520px 盘上 161×520/480 ≈ 175px，绰绰有余。这里只守一个下界。 */
  const rMid = (SUB_R2O + SUB_R2I) / 2;
  const minArc = Math.min(...arcs.map((a) => a.sweep * Math.PI / 180 * rMid));
  ok(`${f.id} 最窄弧段的弧长 ≥ 44（点击垫的下限）`, minArc >= 44,
    `最窄 ${minArc.toFixed(1)} 视框单位`);

  /* ③ 相邻标签不重叠：窄屏半径上的圆心距 × (520/480) 是屏上距离。 */
  const dists = arcs.map((a, i) => {
    const b = arcs[(i + 1) % n];
    return Math.hypot(b.labelNarrow[0] - a.labelNarrow[0], b.labelNarrow[1] - a.labelNarrow[1]);
  });
  const minDist = Math.min(...dists);
  ok(`${f.id} 相邻标签圆心距 ≥ 标签宽（${n} 段）`, minDist * (520 / 480) >= LABEL_W,
    `最小 ${(minDist * (520 / 480)).toFixed(1)}px / 需 ${LABEL_W}px ; ${zh.join('/')}`);

  /* ④ 标签中心两两不同：重算错了会出现两段共用一个坐标。 */
  const keys = new Set(arcs.map((a) => a.label.map((v) => v.toFixed(3)).join(',')));
  ok(`${f.id} 每个标签位置唯一`, keys.size === n, `${keys.size}/${n}`);
}

/* ⑤ 段数分布就是定版的 3/5/4/3/4/3 —— 若有人改动 taxonomy 的类数，这条会提醒重跑本探针。 */
{
  const dist = TAX.families.map((f) => f.subfamilies.length);
  ok('六族段数 = 3/5/4/3/4/3（taxonomy v2.3.0 定版）',
    JSON.stringify(dist) === JSON.stringify([3, 5, 4, 3, 4, 3]), JSON.stringify(dist));
  ok('出现过的段数集合 = {3,4,5}（中圈此前只跑过 4，5 从未被渲染）',
    JSON.stringify([...new Set(dist)].sort()) === JSON.stringify([3, 4, 5]),
    JSON.stringify([...new Set(dist)].sort()));
}

/* ⑥ 代码里不许再按固定段数写死：扫 app.js 的中圈装配段。
   抓的是 `=== 4` / `[0,1,2,3]` / `nth-child(4)` 这类。 */
{
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const start = app.indexOf('function renderArcs(');
  const end = app.indexOf('function chooseSub(');
  const body = app.slice(start, end);
  ok('能从 app.js 切出 renderArcs', start > 0 && end > start);
  ok('renderArcs 里没有写死段数的比较',
    !/===\s*4\b|!==\s*4\b|\[\s*0\s*,\s*1\s*,\s*2\s*,\s*3\s*\]/.test(body),
    (body.match(/===\s*4\b|!==\s*4\b|\[\s*0\s*,\s*1\s*,\s*2\s*,\s*3\s*\]/g) || []).join(','));
  ok('renderArcs 的步长由 n 算（360 / n）', /360\s*\/\s*n/.test(body));
}

console.log(`\nPASS ${pass}  FAIL ${fails.length}`);
if (fails.length) {
  for (const f of fails) console.log('  ✗ ' + f);
  process.exitCode = 1;
}
