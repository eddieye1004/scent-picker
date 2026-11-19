/**
 * _v6-splice.mjs — app.js 的 v5 → v6 问卷重写（一次性工具，跑完可删）
 *
 * 第一版按正则找锚点，把「/* ====」横幅当成终点，一次吃掉 1300 行
 * （已 git checkout 恢复）。所以这一版改成**显式行号 + 首尾自检**：
 * 每段替换前断言首行前缀、尾行内容，任何一处不符整段中止、不写盘。
 * 行号 1-based，取自 git checkout 后的干净版本（见 scripts/_anchors.txt）。
 *
 * 用法：node scripts/_v6-splice.mjs && node --check app.js
 */
import fs from 'node:fs';

const P = 'app.js';
const out = fs.readFileSync(P, 'utf8').split('\n');

/* 全部从后往前，行号不互相影响。 */
const DEL = [
  /* 季节屏：横幅注释 2821 + 函数体，到 2861 的闭括号；连尾随空行一起删 */
  { from: 2821, to: 2861, head: '/* ============================================================',
    head2: '   第 6 屏：季节', tail: '}' },
  /* 气质屏：2622 横幅 + renderMood 本体（到 2781）+ 后面两段过时横幅（到 2795） */
  { from: 2622, to: 2795, head: '/* ============================================================',
    head2: '   第 4 屏：气质（原第 3 步）', tail: '============================================================ */' },
  /* 甜度常量 2172..2183 */
  { from: 2172, to: 2182, head: '/* ---------- 第 12 步：甜度', tail: '];' },
  /* 气味温度常量 2158..2170 */
  { from: 2158, to: 2170, head: '/* ---------- 第 11 步：气味温度', tail: '];' },
  /* 整族排除屏 2086..2157 */
  { from: 2086, to: 2156, head: '/* ---------- 第 10 步：整族排除', tail: '}' },
  /* 季节常量 2051..2060 */
  { from: 2051, to: 2060, head: '/* ---------- 第 7 步：季节', tail: '];' },
];

for (const e of DEL) {
  const h = out[e.from - 1];
  const h2 = out[e.from];       // 第二行（横幅的标题行）
  const t = out[e.to - 1];
  if (!h || !h.startsWith(e.head)) {
    console.error(`✗ 首行不符：第 ${e.from} 行应为「${e.head}」\n  实际「${String(h).slice(0, 80)}」`);
    process.exit(1);
  }
  if (e.head2 && !String(h2).startsWith(e.head2)) {
    console.error(`✗ 次行不符：第 ${e.from + 1} 行应为「${e.head2}」\n  实际「${String(h2).slice(0, 80)}」`);
    process.exit(1);
  }
  if (t.trim() !== e.tail) {
    console.error(`✗ 尾行不符：第 ${e.to} 行应为「${e.tail}」\n  实际「${String(t).slice(0, 80)}」`);
    process.exit(1);
  }
  const n = e.to - e.from + 1;
  out.splice(e.from - 1, n);
  console.log(`· 删第 ${e.from}–${e.to} 行（${n} 行）：${String(h).replace(/^\/\* -+ |^\/\* =+$/g, '').slice(0, 30)}`);
}

fs.writeFileSync(P, out.join('\n'));
console.log(`✓ 删除完成，剩 ${out.length} 行`);
