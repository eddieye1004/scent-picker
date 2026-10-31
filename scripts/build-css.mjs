/**
 * 把样式源层拼成 styles.css。
 *
 * 为什么需要这个脚本：styles.css 不是手写的，它由 base + 11 个 `_wheel*.css`
 * 层按固定顺序拼成。历史上这些源层和脚本放在仓库外（C:/Users/16256/ego/），
 * 只有产物 styles.css 进了 git —— 后果是任何克隆者改源层都会静默分叉，
 * 而四套测试只读产物、仍然全绿，这个失败模式在仓库内部完全看不见。
 * 现在三样东西都在仓内：
 *
 *   styles/src/base.css        基础层（原 base.pre-wheel2.css）
 *   styles/src/_wheel4..12.css 逐版叠加的圆盘层
 *   styles/src/_plate.css      盘心标本层
 *   styles.css                 产物（入库，不要手改）
 *
 * 用法：
 *   node scripts/build-css.mjs          重建 styles.css
 *   node scripts/build-css.mjs --check  只校验是否同步，不同步则退出码 1
 *
 * 顺序即语义：后面的层覆盖前面的层。`cascade-audit` 实测当前有 394 条声明
 * 被后续规则覆盖、从未生效 —— 那是历史叠加的结果，改顺序会改观感，
 * 不要为了"看起来整齐"去动 PARTS。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SRC = path.join(ROOT, 'styles', 'src');

const PARTS = [
  'base.css',
  '_wheel4.css',
  '_wheel4c.css',
  '_plate.css',
  '_wheel5.css',
  '_wheel6.css',
  '_wheel7.css',
  '_wheel8.css',
  '_wheel9.css',
  '_wheel10.css',
  '_wheel11.css',
  '_wheel12.css',
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
