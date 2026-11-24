/**
 * 把样式源层拼成 styles.css。
 *
 * 为什么需要这个脚本：styles.css 不是手写的，它由 7 个语义层按固定顺序拼成。
 * 历史上这些源层和脚本放在仓库外（C:/Users/16256/ego/），只有产物进了 git ——
 * 后果是任何克隆者改源层都会静默分叉，而测试只读产物、仍然全绿，
 * 这个失败模式在仓库内部完全看不见。现在两样东西都在仓内：
 *
 *   styles/src/10-foundation.css     设计 token / 排版基线 / 纸面与印章
 *   styles/src/20-wheel-core.css     圆盘本体（几何 / 扇形 / 盘心 / 标本）
 *   styles/src/30-wheel-refine.css   圆盘细化（三级描边 / 中圈 / 标签命中垫）
 *   styles/src/40-theme.css          深色模式 / 视口裁切 / 控件边界 / 场景屏预算
 *   styles/src/50-results.css        结果卡（瓶形 / 双渠道按钮 / 实物图 / 上色 SVG）
 *   styles/src/60-motion.css         切屏过渡与控件反馈（v34 D59）
 *   styles/src/70-final.css          字体落地 + 最终覆盖
 *   styles.css                       产物（入库，不要手改）
 *
 * ==== 2026-11-10：24 层 → 7 层（Eddie 决策的 UI 重设计第 1 步）====
 * 原先是 base + 22 个 `_wheel<N>.css`，每个数字对应一次追加补丁，最新的是 24。
 * 顺序即语义，合并时**严格保持原顺序**、不做任何重排：
 *   base → 4 → 4c → plate → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13
 *        → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22 → 23 → 24
 * 合并后产物与合并前**逐字节相同**（SHA256 前后一致，226259 字节），
 * 这正是这次合并的验收标准 —— 层改名不改行为。
 *
 * 为什么不再保留 `_wheel<N>` 这个名字：编号不携带语义，只会让下一个人
 * 接着写 `_wheel25.css`。改成"按职责"之后，新的补丁能落到正确的那一层，
 * 而不是又叠一层。历史覆盖关系（394 条声明被后续覆盖）原样保留在合并后的
 * 层内 —— 那是既有观感的一部分，合并任务不负责清理。
 *
 * 用法：
 *   node scripts/build-css.mjs          重建 styles.css
 *   node scripts/build-css.mjs --check  只校验是否同步，不同步则退出码 1
 */
import fs from 'node:fs';
import path from 'node:path';
import { minifyCss, canonicalCss } from './lib/css-minify.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SRC = path.join(ROOT, 'styles', 'src');

const PARTS = [
  '10-foundation.css',
  '20-wheel-core.css',
  '30-wheel-refine.css',
  '40-theme.css',
  '50-results.css',
  '60-motion.css',
  '70-final.css',
  /* 方向 A「标本极简」视觉层（Eddie 2026-11-10 19:19 决策）。
     必须最后：它覆盖的是 token 与表面样式，不是布局。 */
  '80-specimen.css',
  /* 线条报告线系推广 + 边距仪器区（视觉深化腿，2026-11-16）。
     覆盖的是线条与留白结构，不引入新视觉语言。
     围栏：问卷各屏归问卷腿，本层所有选择器都挂在非问卷容器下。 */
  '90-line-system.css',
  /* 问卷 v6 两层（前景效果 + 背景底噪），Eddie 2026-11-16 22:56 定版。
     压过 80 层的表面样式（尤其深色档里"选中态要一层极淡蓝底"
     与"温度光带要压暗"这两条），而它自己不改任何 token 与文字色。
     ---- 2026-11-17 合并 main（PR #4 视觉 + PR #6 实物图）----
     两层的编号都是 90，都在 80-specimen 之后。这里把 line-system 放在前、
     quiz-v6 保持最后：quiz-v6 的原始注释要求它最后，且它要压的是 80 层表面样式。
     顺序本身对观感无影响 —— 实测两层选择器集合**完全不重叠**（quiz-v6 104 个 /
     line-system 11 个，交集 0），谁也覆盖不到谁。 */
  '90-quiz-v6.css',
  /* 问卷 v7 第 1.5 步：第 1 屏圆盘的设计层（九条缺陷 + 液态玻璃交互）。
     必须最后：它用 `#app[data-step="family"]` 这个 id 级选择器覆盖
     70-final 与 20/30 层在圆盘上的取值，且只挂在第 1 屏之下 ——
     其余七屏与结果页不受影响（那是本层唯一的围栏）。 */
  '95-quiz-v7-design.css',
  /* Qoder 改造层（2026-11-18）：结果页的历史档案与分享 PNG 下载行。
     放在最后，避免与既有层抢结果页的样式；两条选择器都带 .qw- 前缀，
     不会命中问卷各屏与圆盘。 */
  '97-qoder-work.css',
  /* 动态避雷屏（feat/quiz-v7-step2-avoid）：第 2 屏的场景卡片墙。
     放在最后；所有选择器带 .avoid- 前缀，不命中圆盘、其余问卷屏与结果页。
     文字色只取已审计 token，不引入新文字色。 */
  '98-avoid-wall.css',
  /* 心仪清单结果页入口（L2，2026-11-23）：瓶名行右端的 ♡ + 存入轻提示。
     放在最后；选择器只有 .pick-name-row / .qw-wish*，
     不命中圆盘、问卷各屏、购买按钮与档案区块。 */
  '99-wishlist.css',
  /* 试香盖章（2026-11-23）：档案面板每瓶右端的盖章位 + 五档面板。
     放在最后；选择器只有 .qw-stamp* / .qw-history-name-row，
     不命中圆盘、问卷六屏、结果卡、购买按钮与清单页。
     （97 层已占 .qw-history-*，所以这里只新增 .qw-history-name-row 一条，
     不改 97 层任何既有规则。） */
  '100-stamp.css',
];

const read = (p) => fs.readFileSync(p, 'utf8');

const missing = PARTS.filter((p) => !fs.existsSync(path.join(SRC, p)));
if (missing.length) {
  console.error(`缺少源层：${missing.join(', ')}`);
  process.exit(1);
}

const built = PARTS.map((p) => read(path.join(SRC, p))).join('');
const outPath = path.join(ROOT, 'styles.css');
const cur = fs.existsSync(outPath) ? read(outPath) : '';

/* ==== 压缩：只去注释、只压空白（性能腿 2026-11-19）====
   审计实测源产物 419KB 里 65.4% 是注释（840 段 / 274KB），gzip 后 148.8KB →
   去注释 27.4KB。这里是渲染阻塞资源，所以这一步直接换首屏传输。
   实现在 lib/css-minify.mjs，自带一条可执行证据：归一化后必须与源拼接逐字符相同。
   为什么不用现成的 lightningcss/cssnano minify：见该文件的文件头注释（会合并规则）。 */
const minified = minifyCss(built);
if (canonicalCss(minified) !== canonicalCss(built)) {
  console.error('✗ 压缩后语义不等价（归一化比对失败）—— 拒绝写出产物，源层未动。');
  process.exit(1);
}

const checkOnly = process.argv.includes('--check');
if (checkOnly) {
  const inSync = cur === minified;
  console.log(inSync
    ? `✓ styles.css 与源层一致（${minified.length} 字节，${minified.split('\n').length} 行）`
    : `✗ styles.css 与源层不同步：产物 ${cur.length} 字节 / 应为 ${minified.length} 字节`);
  process.exit(inSync ? 0 : 1);
}

fs.writeFileSync(outPath, minified);
console.log(`styles.css 已重建：${minified.length} 字节（源 ${built.length}，−${built.length - minified.length} 压缩），`
  + `${minified.split('\n').length} 行，${PARTS.length} 个源层`);
