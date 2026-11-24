/**
 * 一次性的静态检查：app.js 里用到的 wish-page / wish-ui / wishlist 标识符
 * 是不是都真的 import 了。
 *
 * 起因（2026-11-23 实测踩到）：`removableOf` 在移除处理函数里用了却没写进
 * import —— 单元套件只扫源码文本、不执行那段回调，于是 117 条断言全绿，
 * 而浏览器里一点「移除」就抛 ReferenceError：存储改了、页面没重画。
 * 这类"文本守卫看不见"的缺陷只能靠真跑或静态解析发现。
 *
 * 用法：node scripts/check-imports.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

/* 每个本地模块导出的名字（用正则从源码取，避免为了这件事造一个 AST 依赖）。 */
function exportedNames(file) {
  const t = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8');
  const out = new Set();
  for (const m of t.matchAll(/^export\s+(?:const|function|let|class)\s+(\w+)/gm)) out.add(m[1]);
  /* export { a, b as c } 形态（本项目暂时没有，留着以防将来加） */
  for (const m of t.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    m[1].split(',').forEach((piece) => {
      const name = piece.trim().split(/\s+as\s+/).pop().trim();
      if (name) out.add(name);
    });
  }
  return out;
}

/* app.js 里从每个本地模块到底 import 了哪些名字。 */
function importedFrom(file) {
  const out = new Set();
  const re = new RegExp(`import\\s*\\{([^}]+)\\}\\s*from\\s*['"]\\./src/${file}['"]`, 'g');
  for (const m of src.matchAll(re)) {
    m[1].split(',').forEach((piece) => {
      const name = piece.trim().split(/\s+as\s+/)[0].trim();
      if (name) out.add(name);
    });
  }
  return out;
}

/* 去掉注释与字符串字面量后再扫标识符：否则注释里提到一个名字就会被当成"用到"。
 *
 * ⚠️ 模板字符串的处理有过一次真缺陷（2026-11-23，本函数初版）：
 * 用 `/`[^`]*`/` 做替换，而模板字符串**可以跨行** —— 于是从文件里第一个
 * 反引号一路吃到最后一个，把中间所有代码都当成字符串抹掉了。
 * 结果是 `removableOf(stored)` 这句真实调用被抹掉、检查报绿，
 * 而浏览器里一点「移除」就抛 ReferenceError（存储改了、页面没重画）。
 * 修法：先把 `${…}` 里的表达式原样留下来（那是代码，不是字符串），
 * 再把剩下的模板文本抹掉，并且**不跨行**匹配裸模板（模板里换行极少，
 * 真跨行的模板交给转义规则兜住即可 —— 宁可少抹一点也不要多抹）。 */
function stripCommentsAndStrings(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    /* 模板字符串：先把 ${…} 挖出来换成占位符（那是**代码**，不是字符串），
       再抹掉剩下的模板文本。顺序不能反 —— 反了就会把表达式一起抹掉。 */
    .replace(/`(?:[^`\\]|\\.)*`/g, (whole) => whole.replace(/\$\{([^}]*)\}/g, (m, expr) => ` ${expr} `).replace(/`/g, "'"))
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

const code = stripCommentsAndStrings(src);

/* 只检查 app.js **确实 import 了** 的本地模块，且只查"该模块自己的专有名字"。
 *
 * 为什么不能对所有模块、所有导出名字一刀切：`wishlist.js` 导出了
 * add / remove / list / has 这类极普通的动词，而 app.js 自己也定义了
 * 同名函数（`function list(...)` 之类）或用它们当方法名 —— 文本扫描分不清
 * "这是那个导出还是本地同名函数"，会报一堆假阳性。假阳性的代价不是"多看一眼"，
 * 是会让人把这个检查关掉，于是真缺陷照样溜过去。
 * 所以判据收窄到：名字出现在 import 语句里才算"这个模块的名字"，
 * 然后看这些名字是不是都真的 import 了 —— 本质上是查"import 面与使用面一致"。
 * （`removableOf` 那次属于另一种形态：它压根没进 import 语句，见下面的 EXTRA。） */
const GUARDED = [
  /* 该模块里"名字足够独特、不会与本地函数重名"的那部分导出。
     新加模块时把它的独特名字补进来即可。 */
  ['wish-page.js', ['WISH_PAGE_MSG', 'wishListModel', 'perfumeIndex', 'priceLabelOf',
    'savedLabel', 'CLEAR_LABEL', 'CLEAR_ARM_LABEL', 'nextClearState', 'removableOf',
    'wishRowOf', 'priceBandOf']],
  ['wish-ui.js', ['WISH_MSG', 'createMemoryStore', 'createWishSession', 'wishMessage', 'wishReasonOf']],
  /* 试香盖章（2026-11-23）。stamp-ui.js 与 stamp.js 的专有名字都要在这里 ——
     上一次 `removableOf` 用了没 import 就是这么漏过去的，而这里的新模块
     恰好是"渲染层调纯逻辑层"的同一形态。 */
  ['stamp-ui.js', ['STAMP_MSG', 'createStampSession', 'stampViewOf', 'stampMessage',
    'stampTiers', 'stampKeyOf', 'stampDateLabel', 'createMemoryStore', 'STAMP_TIERS',
    'STAMP_TIER_ZH', 'STAMP_MAX']],
  /* stamp.js 只列「必须直接从它 import」的名字。stampKeyOf / STAMP_TIERS 等
     由 stamp-ui.js 转出，app.js 走的是 stamp-ui 那条 import ——
     列在这里会把它判成"用了没 import"（假阳性），所以它们的归属只写在上面那条。 */
  ['stamp.js', ['STAMP_KEY', 'STAMP_ITEM_FIELDS', 'STAMP_LOG_FIELDS', 'tierZhOf',
    'createStamps', 'stamps']],
  ['ambient.js', ['ambientOf', 'ambientVars']],
  ['avoid.js', ['buildAvoidIndex', 'avoidPlan']],
  ['share-card.js', ['buildShareModel', 'drawShareCard', 'SHARE_W', 'SHARE_H']],
];

let bad = 0;
for (const [file, names] of GUARDED) {
  const imp = importedFrom(file);
  /* 还要确认 importedFrom 真的解析到了 import 语句 —— 否则正则失配时
     `imp` 是空集，下面每条 `uses > 0 && !imp.has(name)` 都会报红，
     或反过来（本函数初版就是反过来的：它只查"已 import 的名字有没有被用"，
     于是"用了但没 import"永远查不出来，`removableOf` 那次照样假绿）。 */
  const hasImportStmt = new RegExp(`from\\s*['"]\\./src/${file}['"]`).test(src);
  if (!hasImportStmt) {
    bad += 1;
    console.log(`  ✗ src/${file}  app.js 里找不到这个模块的 import 语句（正则失配？）`);
    continue;
  }
  const missing = [];
  for (const name of names) {
    const uses = (code.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length;
    if (uses > 0 && !imp.has(name)) missing.push(name);
  }
  if (missing.length) {
    bad += 1;
    console.log(`  ✗ src/${file}  用了但没 import：${missing.join(', ')}`);
  } else {
    console.log(`  ✓ src/${file}  ${names.length} 个专有名字用得都对`);
  }
}

if (bad) {
  console.log(`\n✗ ${bad} 个模块有「用了却没 import」的标识符 —— 浏览器里会抛 ReferenceError。`);
  process.exit(1);
}
console.log('\n✓ 本地模块的 import 面与使用面一致。');
