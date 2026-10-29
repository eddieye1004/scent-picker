/**
 * test-contrast.mjs — 文字对比度守门测试
 *
 * 为什么需要这个：调色是最容易"看起来还行、实际读不清"的地方。
 * 深色主题尤其危险：低对比的灰字在设计师屏幕上"有质感"，在别人屏幕上就是看不见。
 * 把约束固化成测试，谁改色导致跌破 4.5 都会直接失败。
 *
 * 做法：从 styles.css 解析 :root 变量，对每一组「真实存在的 前景/背景 组合」
 * 重算对比度，低于 4.5 直接失败。
 *
 * 深色主题下最亮的前景底是 --bg-3（.opt:hover / .chip:hover），
 * 按最宽松的那个算，其它更深的底自然都合格。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

/* ---------- 解析 :root ----------
   必须归并**所有** :root 块，按出现顺序后者覆盖前者。
   早先只 match 第一块，导致 styles.css 末尾追加的 v3 覆盖层里的
   --accent / --radius 完全读不到，28 条断言一直在按旧色跑 —— 守门形同虚设。
   这类"守门脚本自己瞎了"的 bug 比配色错误更危险：测试是绿的，但守的是别人。 */
const VARS = {};
for (const block of CSS.matchAll(/:root\s*\{([\s\S]*?)\}/g)) {
  for (const decl of block[1].split(';')) {
    const m = decl.match(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*(?:!important)?\s*$/);
    if (m) VARS[m[1]] = m[2];   // 后出现的块覆盖先出现的
  }
}
// 兜底：--accent 必须真的被解析到 v3 的宝蓝，否则说明覆盖层没进 CSS
const ACCENT_EXPECT = '#002FA7';
if (VARS.accent && VARS.accent.toUpperCase() !== ACCENT_EXPECT) {
  console.error(`✗ :root 归并异常：--accent 解析为 ${VARS.accent}，期望 ${ACCENT_EXPECT}（v3 覆盖层，styles.css 末尾）`);
  process.exit(1);
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
  ['--ink on --bg', 'ink', 'bg', 'body 正文'],
  ['--ink on --bg-2', 'ink', 'bg-2', '结果卡正文 / .pick h3'],
  ['--ink-2 on --bg', 'ink-2', 'bg', '.lede / .q-help / .chip'],
  ['--ink-2 on --bg-2', 'ink-2', 'bg-2', '.tag / .pick-foot a'],
  ['--ink-2 on --bg-3', 'ink-2', 'bg-3', '.opt:hover 副文案'],
  ['--ink-3 on --bg', 'ink-3', 'bg', '.progress-meta / .hint / footer'],
  ['--ink-3 on --bg-2', 'ink-3', 'bg-2', '.hub-kicker / .disc-sector .en'],
  ['--ink-3 on --bg-3', 'ink-3', 'bg-3', '.opt:hover 里的 .num'],
  ['--accent on --bg', 'accent', 'bg', '.q-kicker / .eyebrow / .n'],
  ['--accent on --bg-2', 'accent', 'bg-2', '.disc-hub .hub-zh'],
  ['--warn on --bg', 'warn', 'bg', '警告型小字'],
  ['--danger on --bg', 'danger', 'bg', '.reasons li.warn'],
  ['--bg on --accent', 'bg', 'accent', '.btn 主按钮 / .chip 选中'],
  ['--bg on --danger', 'bg', 'danger', '.chip.neg 选中'],
  // ---- 克莱因蓝四档（v3 覆盖层）。宝蓝 L 只有 33%，在浅底上比朱红更沉 ----
  ['--blue on --bg（主色承载文字）', 'blue', 'bg', '.h1 em / .pick-foot a:hover'],
  ['--blue-deep on --bg（暗部）', 'blue-deep', 'bg', '.progress i.done'],
  ['--blue-lift on --bg（高光）', 'blue-lift', 'bg', '渐变起点，最小字 12px'],
  // 盘心选定态翻成实心墨块，文字全部反白。这三个是写死的十六进制，
  // 不走变量——它们在别处不会被复用，进 VARS 反而让人以为可以随便改。
  ['白 on 墨 --hub-on-ink', '#ffffff', 'ink', '.disc-hub.is-picked .hub-zh'],
  ['#a8a8a8 on 墨', '#a8a8a8', 'ink', '.disc-hub.is-picked .hub-kicker'],
  ['#c9c9c9 on 墨', '#c9c9c9', 'ink', '.disc-hub.is-picked .hub-desc'],
  ['--ink-2 on --bg-3（禁用按钮文案）', 'ink-2', 'bg-3', '.btn:disabled'],
];

/* ---------- 跑 ---------- */
let pass = 0;
const fails = [];

for (const [label, fgk, bgk, where] of PAIRS) {
  // 允许直接写字面量十六进制（用于反白文字这类不复用的色）。以 # 开头的当色值本身。
  const pick = (k) => (k.startsWith('#') ? k : VARS[k]);
  const fg = pick(fgk);
  const bg = pick(bgk);
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

/* ---------- 反向自检：故意用低对比色值应该被判不合格 ----------
   如果这段跑出来"合格"，说明对比度函数本身算错了。
   取的是上一版深空黑主题的两个色：--ink-3 #8595a8、--accent #5ad6e8。
   它们在黑底上分别是 6.44 与 11.47，完全合格；搬到纸底上就崩成 2.61 与 1.47。
   这正好守「整套配色搬回来但没换底色」这个坑 —— 也是本轮真实发生的事。
   注意别拿 #57534e 来测：它在中性纸底上是 6.51，测不出问题。 */
const shouldFail = [
  ratio('#8595a8', VARS.bg) < 4.5,
  ratio('#5ad6e8', VARS.bg) < 4.5,
];
if (shouldFail.every(Boolean)) pass++;
else fails.push('对比度函数反向自检失败：深空黑主题的 #8595a8 / #5ad6e8 在纸底上应被判不合格却没判出来');

/* ---------- 非文字对比度：WCAG 1.4.11 要求控件边界 >= 3:1 ----------
   文字对比度合格不代表控件看得见。圆盘扇区就是"可点区域"，
   它的边界若低于 3:1，用户根本不知道哪里能点。
   实测过一次事故：--line #21324a 只有 1.52 : 1，拿它画扇形描边等于没画。
   所以这里单独守 --edge，它才是承担控件边界的色。 */
const NON_TEXT = [
  ['--edge 扇形描边', 'edge', 'bg', '常见于 .sector-shape stroke'],
  ['--edge on --bg-2 扇形描边', 'edge', 'bg-2', '.sector-shape 落在面板底上'],
  ['--accent-soft hover 描边', 'accent-soft', 'bg', '.sector-g.is-hot stroke'],
  ['--line 装饰线（仅提示，不守门）', 'line', 'bg', '纯装饰，允许低对比'],
];
// 只有前三条要 >= 3，--line 是装饰线，列出来是为了留下实测数字。
const NON_TEXT_REQUIRED = NON_TEXT.slice(0, 3);
const ntBad = [];
for (const [label, fgk, bgk, where] of NON_TEXT_REQUIRED) {
  const fg = VARS[fgk];
  const bg = VARS[bgk];
  if (!fg || !bg) { ntBad.push(`${label} :: 变量缺失（${fgk}/${bgk}）`); continue; }
  const r = ratio(fg, bg);
  if (r >= 3) pass++;
  else ntBad.push(`${label} = ${r.toFixed(2)} < 3.0  (${where})  ${fg} on ${bg}`);
}
if (ntBad.length === 0) pass++;
else fails.push(`控件边界对比度不足: ${ntBad.join(' / ')}`);

/* 反向自检：--line 必须真的低于 3，否则说明这组检查抓不到"装饰色当边框用"这个错 */
if (ratio(VARS.line, VARS.bg) < 3) pass++;
else fails.push('--line 竟达到 3:1，那它已经不适合当"纯装饰线"用了，复核配色');

/* ---------- 环境反光色禁止承载文字 ----------
   --blue-amb #8A93B8 在白底只有 3.02，做 1px 描边够用，做文字必崩。
   它是四档蓝里唯一的"非文字"档，这条断言防止有人图省事把它用在正文。
   比对时排除注释：注释里写到这个值是很正常的（本文件自己就有）。 */
const CSS_NO_COMMENT = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
const ambAsText = [...CSS_NO_COMMENT.matchAll(/(?:^|[{;])\s*color\s*:\s*var\(--blue-amb\)/g)];
if (ambAsText.length === 0) pass++;
else fails.push(`--blue-amb（3.02:1）被用作文字色 ${ambAsText.length} 处，它只能做描边`);

/* ---------- 字号下限：任何文字不得小于 12px ----------
   11.5px 在大写+letter-spacing 的场景下还能看，但对东亚字形偏小，
   手机上尤其吃力。锚定 12px，避免以后又悄悄加回来。 */
const SMALL = [];
for (const m of CSS.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
  const sel = m[1].trim().replace(/\s+/g, ' ').replace(/\/\*[\s\S]*?\*\//, '').trim();
  if (!sel || sel.startsWith('@')) continue;
  const body = m[2].replace(/\/\*[\s\S]*?\*\//g, '');
  const f = body.match(/font-size\s*:\s*([\d.]+)px/);
  if (f && parseFloat(f[1]) < 12) SMALL.push(`${sel} = ${f[1]}px`);
}
if (SMALL.length === 0) pass++;
else fails.push(`存在 <12px 的文字: ${SMALL.join(' / ')}`);

/* ---------- 键盘焦点：每个可交互元素都要有 :focus-visible ----------
   只写 .opt 不写 .chip，键盘用户 Tab 到香调时就完全看不到自己在哪。
   圆盘的 .disc-sector 是新加的可点目标，必须一起守。 */
const INTERACTIVE = ['.opt', '.chip', '.btn', 'input[type="range"]', '.disc-sector'];
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
   验证码盘的扇区是绝对定位的按钮，尺寸不能靠布局撑，必须显式声明。 */
const TOUCH_TARGETS = [
  ['.btn', 44, '按钮'],
  ['.chip', 44, '香调标签'],
  ['input[type="range"]', 44, '浓度滑块'],
  ['.disc-sector', 44, '圆盘扇区'],
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
console.log('===== 无障碍测试（对比度 / 字号 / 焦点 / 触控）=====');
for (const [label, fgk, bgk] of PAIRS) {
  // 与判定循环用同一个 pick()，否则字面量十六进制的三行会显示成假的 ✗ 1.09
  const pick = (k) => (k.startsWith('#') ? k : VARS[k]);
  const r = ratio(pick(fgk) || '#000000', pick(bgk) || '#ffffff');
  console.log(`  ${r >= 4.5 ? '✓' : '✗'} ${label.padEnd(26)} ${r.toFixed(2)}`);
}
console.log(`  ${SMALL.length === 0 ? '✓' : '✗'} 字号全部 >= 12px`);
console.log(`  ${missingFocus.length === 0 ? '✓' : '✗'} 可交互元素均有 :focus-visible`);
console.log(`  ${badOutline.length === 0 ? '✓' : '✗'} 无「去掉焦点环却无补偿」的规则`);
console.log(`  ${touchBad.length === 0 ? '✓' : '✗'} 触控目标 >= 44px（按钮/标签/滑块/扇区）`);
console.log(`\nPASS ${pass}  FAIL ${fails.length}`);
fails.forEach((f) => console.log('  ✗ ' + f));
if (fails.length) process.exitCode = 1;
