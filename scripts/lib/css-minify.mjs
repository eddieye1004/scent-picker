/**
 * styles.css 后处理：只去注释、只压空白，不动任何一条声明与顺序。
 *
 * 为什么不用 lightningcss / cssnano 的现成 minify：
 * 实测（本机，2026-11-19）它们在本项目这份 CSS 上**不是只压空白**，
 * 而是会做规则合并与重排 ——
 *   lightningcss(minify:false) 就已经把 `.wheel.is-open .label-layer .disc-sector.lvl1::before`
 *   这条整条吃掉，花括号从 1658 掉到 1624（说明有 34 条规则被合并掉了）；
 *   测试断言数随之从 334 掉到 317 / 291（全量 minify 更狠，43 条红）。
 * 那类合并对级联顺序有风险，本腿的任务书写明「关规则合并、关去重、保持顺序」，
 * 所以这里自己做一个**可自证等价**的最窄压缩器：把两份都归一化后逐字符比对必须完全相同。
 *
 * 保留 `/*!` 开头的许可 / 来源说明块。
 *
 * 格式约束（有意为之，不是漏做）：只删行首行尾空白与空行，
 * **不**把 `{\n  display: none;\n}` 压成 `{display:none;}`。测试里有 17 条断言按
 * 「选择器 + 空格 + { + 空格 + 声明 + 空格 + }」这个形态读产物，那是测试与产物之间
 * 合法的格式契约。要再压那 25KB，得先把那 17 条断言改成不依赖空白 —— 属另一条腿。
 */
export function minifyCss(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    /* 字符串整段抄过去：url("a/…b…c") 里的斜杠星号组合不是注释 */
    if (c === '"' || c === "'") {
      const q = c;
      out += c; i++;
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue; }
        out += src[i];
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) { out += src.slice(i); break; }
      const body = src.slice(i, end + 2);
      if (body.startsWith('/*!')) out += body;   // 许可 / 字体来源说明：原样留
      else out += '\u0000';                       // 占位，逐行决定「删整行」还是「行内删」
      i = end + 2;
      continue;
    }
    out += c; i++;
  }
  /* 注释占位：独占一行 → 整行删；行内 → 就地删 */
  out = out.split('\n').map((line) => {
    if (!line.includes('\u0000')) return line;
    if (line.replace(/\u0000/g, '').trim() === '') return '';
    return line.replace(/\u0000/g, '');
  }).join('\n');
  out = out.split('\n')
    .map((l) => l.replace(/^[ \t]+/, '').replace(/[ \t]+$/, ''))
    .filter((l) => l !== '')
    .join('\n');
  return out.trim() + '\n';
}

/** 归一化：剥注释 + 空白折叠。两份归一化后相同 = 只动了注释与空白。 */
export function canonicalCss(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
}
