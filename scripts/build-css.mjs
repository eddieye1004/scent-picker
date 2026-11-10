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

const checkOnly = process.argv.includes('--check');
if (checkOnly) {
  const inSync = cur === built;
  console.log(inSync
    ? `✓ styles.css 与源层一致（${built.length} 字节，${built.split('\n').length} 行）`
    : `✗ styles.css 与源层不同步：产物 ${cur.length} 字节 / 应为 ${built.length} 字节`);
  process.exit(inSync ? 0 : 1);
}

fs.writeFileSync(outPath, built);
console.log(`styles.css 已重建：${built.length} 字节，${built.split('\n').length} 行，${PARTS.length} 个源层`);
