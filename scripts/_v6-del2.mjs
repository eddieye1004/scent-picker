/**
 * _v6-del2.mjs — 删掉已无人调用的轮盘代码（一次性工具）
 *
 * 删的是 v5 的香型轮盘：buildWheel（838–1610）、renderFamily + familyPanel +
 * paintFamilyPanel + GROUP_ZH（1612–1739）、以及 WHEEL / scentPlate / ART 那一段
 * 里只服务轮盘的部分。
 *
 * 注意 **ART_FILE / artInner / artWarmAll 必须留**：结果页的 pickArt 与盘心标本
 * 共用同一批上色 SVG，删了会让图标退化成空框。只删 buildWheel 与 renderFamily
 * 两个函数体、以及它们专用的 WHEEL 常量与 scentPlate。
 *
 * 每段仍走"首尾行自检"，不符即中止不写盘。
 */
import fs from 'node:fs';

const P = 'app.js';
const out = fs.readFileSync(P, 'utf8').split('\n');

const DEL = [
  /* 从后往前：renderFamily / familyPanel / paintFamilyPanel / GROUP_ZH
     1612 注释首行 … 1739 GROUP_ZH 那一行（含其后空行到 1740） */
  { from: 1612, to: 1740, head: '/* ---------- 第 1 步：香型轮盘', tail: '' },
  /* buildWheel 本体：838 起，到 1610 的闭括号 */
  { from: 838, to: 1610, head: 'function buildWheel(cfg) {', tail: '' },
  /* WHEEL 常量 + scentPlate 段：662 注释 … 830（scentPlate 的注释尾） */
  { from: 662, to: 830, head: '/* ---------- 多层香型轮盘（第 1 步）----------', tail: '*/' },
];

for (const e of DEL) {
  const h = out[e.from - 1];
  const t = out[e.to - 1];
  if (!h || !h.startsWith(e.head)) {
    console.error(`✗ 首行不符：第 ${e.from} 行应为「${e.head.slice(0, 40)}」\n  实际「${String(h).slice(0, 70)}」`);
    process.exit(1);
  }
  if (e.tail && t.trim() !== e.tail) {
    console.error(`✗ 尾行不符：第 ${e.to} 行应为「${e.tail}」\n  实际「${String(t).slice(0, 70)}」`);
    process.exit(1);
  }
  out.splice(e.from - 1, e.to - e.from + 1);
  console.log(`· 删第 ${e.from}–${e.to} 行（${e.to - e.from + 1} 行）：${e.head.slice(0, 34)}`);
}

fs.writeFileSync(P, out.join('\n'));
console.log(`✓ 剩 ${out.length} 行`);
