/**
 * test-contrast.mjs — 文字对比度守门测试
 *
 * 为什么需要这个：调色是最容易"看起来还行、实际读不清"的地方。
 * 我在做视觉核查时实测发现 --ink-3 只有 3.26:1、--amber 只有 3.91:1，
 * 大量 11.5–13px 的小字都用这两个色，属于 WCAG AA 不合格。
 * 光改一次不够——以后任何人再调色都会重新踩坑，所以把约束固化成测试。
 *
 * 做法：从 styles.css 解析 :root 变量，对每一组「真实存在的 前景/背景 组合」
 * 重算对比度，低于 4.5 直接失败。
 *
 * 约束底色取 --amber-wash，因为 .opt:hover 的背景就是它，
 * 这是全文最亮的文字背景，按最严的那个算，其它背景自然都合格。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

/* ---------- 解析 :root ---------- */
const rootBlock = (CSS.match(/:root\s*\{([\s\S]*?)\}/) || [])[1] || '';
const VARS = {};
for (const decl of rootBlock.split(';')) {
  const m = decl.match(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*$/);
  if (m) VARS[m[1]] = m[2];
}

/* ---------- WCAG 2.1 相对亮度 ---------- */
const toRgb = (hex) => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const relLum = (hex) => {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (fg, bg) => {
  const a = relLum(fg);
  const b = relLum(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
};

/* ---------- 断言用：CSS 里真实出现的 前景/背景 组合 ----------
   每组都写明它对应哪个选择器场景，方便以后改样式时对照。
   min 一律 4.5（AA 正文标准），不给自己放宽到大字标准。 */
const PAIRS = [
  ['--ink on --paper', 'ink', 'paper', 'body 正文'],
  ['--ink-2 on --paper', 'ink-2', 'paper', '.lede / .q-help / .chip'],
  ['--ink-3 on --paper', 'ink-3', 'paper', '.progress-meta / .hint / footer 等小字'],
  ['--ink-3 on --paper-2', 'ink-3', 'paper-2', '同上，深底'],
  ['--amber on --paper', 'amber', 'paper', '.q-kicker / .eyebrow / .n'],
  ['--ink-2 on --amber-wash', 'ink-2', 'amber-wash', '.profile-line'],
  ['--ink-3 on --amber-wash', 'ink-3', 'amber-wash', '.opt:hover 里的小字'],
  ['--amber on --amber-wash', 'amber', 'amber-wash', '.opt:hover 里的 .num/.tick'],
  ['--ink on --amber-wash', 'ink', 'amber-wash', '.opt:hover 标题'],
  ['--rose on --paper', 'rose', 'paper', '.reasons li.warn'],
  ['--paper on --ink', 'paper', 'ink', '.btn / .chip 选中'],
  ['--paper on --rose', 'paper', 'rose', '.chip.neg 选中'],
];

/* ---------- 跑 ---------- */
let pass = 0;
const fails = [];

for (const [label, fgk, bgk, where] of PAIRS) {
  const fg = VARS[fgk];
  const bg = VARS[bgk];
  if (!fg || !bg) {
    fails.push(`${label} :: CSS 变量缺失（${fgk}=${fg} ${bgk}=${bg}）`);
    continue;
  }
  const r = ratio(fg, bg);
  if (r >= 4.5) pass++;
  else fails.push(`${label} = ${r.toFixed(2)} < 4.5  (${where})  ${fg} on ${bg}`);
}

/* ---------- 完整性检查：所有承载文字的 color: var(--x) 都被上面覆盖 ----------
   防止以后新增一个 --xxx 色用在文字上却没纳入审计。 */
const TEXT_TOKENS = new Set();
for (const m of CSS.matchAll(/(?:^|;)\s*color\s*:\s*var\(--([\w-]+)\)/g)) TEXT_TOKENS.add(m[1]);
const AUDITED = new Set(PAIRS.map((p) => p[1]).concat(PAIRS.map((p) => p[2])));
const unaudited = [...TEXT_TOKENS].filter((t) => !AUDITED.has(t));
if (unaudited.length === 0) pass++;
else fails.push(`有文字色未纳入审计: ${unaudited.join(', ')}`);

/* ---------- 反向自检：故意用旧色值应该被判不合格 ----------
   如果这段跑出来"合格"，说明对比度函数本身算错了。 */
const oldInk3 = '#8c857c';
const oldAmber = '#a86b32';
const shouldFail = [
  ratio(oldInk3, VARS.paper) < 4.5,
  ratio(oldAmber, VARS.paper) < 4.5,
];
if (shouldFail.every(Boolean)) pass++;
else fails.push('对比度函数反向自检失败：旧色 #8c857c / #a86b32 应被判不合格却没判出来');

/* ---------- 字号下限：任何文字不得小于 12px ----------
   11.5px 在大写+letter-spacing 的场景下还能看，但对东亚字形偏小，
   手机上尤其吃力。锚定 12px，避免以后又悄悄加回来。 */
const SMALL = [];
for (const m of CSS.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
  const sel = m[1].trim().replace(/\s+/g, ' ').replace(/\/\*[\s\S]*?\*\//, '').trim();
  if (!sel || sel.startsWith('@')) continue;
  const f = m[2].match(/font-size\s*:\s*([\d.]+)px/);
  if (f && parseFloat(f[1]) < 12) SMALL.push(`${sel} = ${f[1]}px`);
}
if (SMALL.length === 0) pass++;
else fails.push(`存在 <12px 的文字: ${SMALL.join(' / ')}`);

/* ---------- 键盘焦点：每个可交互元素都要有 :focus-visible ----------
   只写 .opt 不写 .chip，键盘用户 Tab 到香调时就完全看不到自己在哪。 */
const INTERACTIVE = ['.opt', '.chip', '.btn', 'input[type="range"]'];
const missingFocus = INTERACTIVE.filter((sel) => !CSS.includes(`${sel}:focus-visible`));
if (missingFocus.length === 0) pass++;
else fails.push(`可交互元素缺 :focus-visible: ${missingFocus.join(', ')}`);

/* ---------- outline:none 必须落在有补偿规则的元素上 ----------
   `outline:none` 是这类问题的老源头：去掉了默认焦点环却没给替代方案。 */
const outlineNone = [];
for (const m of CSS.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
  const sel = m[1].trim().replace(/\s+/g, ' ').replace(/\/\*[\s\S]*?\*\//, '').trim();
  // 去掉注释后再判断，否则注释里提到 outline:none 也会误报
  const body = m[2].replace(/\/\*[\s\S]*?\*\//g, '');
  if (/outline\s*:\s*(none|0)/.test(body)) outlineNone.push(sel);
}
const badOutline = outlineNone.filter((sel) => !CSS.includes(`${sel}:focus-visible`));
if (badOutline.length === 0) pass++;
else fails.push(`这些规则去掉焦点环又没补偿: ${badOutline.join(', ')}`);

/* ---------- 触控目标尺寸：可点元素不得小于 44px 高 ----------
   起因：用本机 Edge 跑真实渲染后实测，.chip 只有 39px、.btn 只有 37px、
   滑块 input 只有 2px（只设了 height:2px 当轨道，命中区也一起变成 2px）。
   这些在鼠标下"能点"，在触屏上是真点不中。
   这里做静态守门：规则块必须显式声明足够的 min-height / height。 */
const TOUCH_TARGETS = [
  ['.btn', 44, '按钮'],
  ['.chip', 44, '香调标签'],
  ['input[type="range"]', 44, '浓度滑块'],
];
const touchBad = [];
for (const [sel, need, name] of TOUCH_TARGETS) {
  let got = 0;
  let from = 0;
  // 逐个定位该选择器的规则块。
  // 注意要跳过伪元素块（::-webkit-slider-thumb 里的 height:18px 是滑块小球直径，
  // 不是元素命中区），否则会取到 18px 误判。
  while (true) {
    const at = CSS.indexOf(sel, from);
    if (at === -1) break;
    from = at + sel.length;
    // 向前取选择器文本
    const prevStop = Math.max(CSS.lastIndexOf('}', at), CSS.lastIndexOf(';', at), 0);
    const selText = CSS.slice(prevStop, CSS.indexOf('{', at));
    if (/::/.test(selText)) continue;
    const open = CSS.indexOf('{', at);
    const close = CSS.indexOf('}', open);
    if (open === -1 || close === -1) break;
    // 必须先剥注释 —— 滑块块里的注释原话有"只给 height:2px"，
    // 不剥就会把注释当声明，把 44px 的块误判成 2px（本轮实测踩中）。
    const block = CSS.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '');
    const m = block.match(/(?:min-height|height)\s*:\s*([\d.]+)px/);
    if (m) got = Math.max(got, parseFloat(m[1]));
  }
  if (got < need) touchBad.push(`${name}(${sel}) = ${got || '未声明'}px < ${need}px`);
}
if (touchBad.length === 0) pass++;
else fails.push(`触控目标偏小: ${touchBad.join(' / ')}`);

/* ---------- 输出 ---------- */
console.log('===== 无障碍测试（对比度 / 字号 / 焦点）=====');
for (const [label, fgk, bgk] of PAIRS) {
  const r = ratio(VARS[fgk] || '#000000', VARS[bgk] || '#ffffff');
  console.log(`  ${r >= 4.5 ? '✓' : '✗'} ${label.padEnd(26)} ${r.toFixed(2)}`);
}
console.log(`  ${SMALL.length === 0 ? '✓' : '✗'} 字号全部 >= 12px`);
console.log(`  ${missingFocus.length === 0 ? '✓' : '✗'} 可交互元素均有 :focus-visible`);
console.log(`  ${badOutline.length === 0 ? '✓' : '✗'} 无「去掉焦点环却无补偿」的规则`);
console.log(`  ${touchBad.length === 0 ? '✓' : '✗'} 触控目标 >= 44px（按钮/标签/滑块）`);
console.log(`\nPASS ${pass}  FAIL ${fails.length}`);
fails.forEach((f) => console.log('  ✗ ' + f));
if (fails.length) process.exitCode = 1;
