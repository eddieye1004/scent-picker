/**
 * test-category-gate.mjs — 品类闸门的三条判据互不干扰
 * 用法: node scripts/test-category-gate.mjs
 *
 * 为什么单独一测：`categoryGate` 是 `scoreMatch` 的前置闸门，
 * 它一松就会把发夹、眼镜、原版书当成香水写进公开表；
 * 它一紧就会把「标题只写英文名」的正装整族误杀。
 * 2026-11-08 加类目判据时，这两类误判同时出现过，所以逐条钉住。
 *
 * 不联网，不发请求，不读环境变量。
 */
import { categoryGate, scoreMatch } from './lib/union-api.mjs';

let pass = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) pass++;
  else failures.push(`${name}${detail ? ' :: ' + detail : ''}`);
};

/* ---------- G 组：类目判据 ---------- */

/* G1 类目是香水 → 放行，哪怕标题里一个"香水"字都没有。
   真实候选：「美国直邮Legend Spirit正品万宝龙」，
   标题判据判死，类目判据判活。 */
const g1 = categoryGate('美国直邮Legend Spirit正品万宝龙', '彩妆/香水/美妆工具/香水');
check('G1 类目是香水时放行（标题无品类词）', g1.ok, g1.reason);

/* G2 类目不是香水 → 拒，哪怕标题里有"香水"。
   真实候选：「Dior Diorissimo 发夹」挂在发饰类目下。 */
const g2 = categoryGate('Dior Diorissimo 香水发夹', '服饰配件/发饰');
check('G2 类目不是香水时拒收（标题有品类词）', !g2.ok, g2.reason);

/* G3 类目判据也救不了小样。小样在淘宝同样挂香水类目。 */
const g3 = categoryGate('Kilian 凯利安 试管香水 1.5ml', '彩妆/香水/美妆工具/香水');
check('G3 类目是香水但标题是小样，仍拒', !g3.ok, g3.reason);

/* G4 类目判据也救不了反向品类词。香水沐浴露同样挂香水类目。 */
const g4 = categoryGate('某牌香水沐浴露 500ml', '彩妆/香水/美妆工具/香水');
check('G4 类目是香水但标题是沐浴露，仍拒', !g4.ok, g4.reason);

/* G5 没有类目时回落到标题判据（京东那条链路不返回类目路径）。 */
const g5a = categoryGate('CREED 信仰 Aventus 拿破仑之水 香水 100ml', '');
const g5b = categoryGate('CREED 香皂 150g AVENTUS', '');
check('G5 无类目时回落到标题判据', g5a.ok && !g5b.ok, JSON.stringify([g5a.reason, g5b.reason]));

/* G6 scoreMatch 要把类目透传下去。传了类目、标题无品类词，也该 accept。
   这是回归守卫：`pickBest` 调 `scoreMatch` 时忘了传第 4 个参数，
   类目判据就整条失效，而测试全绿 —— 这类 bug 只有端到端能看出来。

   注意这里**必须给别名表**：标题写的是「万宝龙」，
   不给 `Montblanc → 万宝龙` 这一项，品牌判据仍然失败（见 G8）。 */
const g6 = scoreMatch({ brand: 'Montblanc', name: 'Legend Spirit' },
  '美国直邮Legend Spirit正品万宝龙', { Montblanc: ['万宝龙'] }, '彩妆/香水/美妆工具/香水');
check('G6 scoreMatch 透传类目并 accept', g6.accept, JSON.stringify(g6));

/* G7 反向：同一个标题，不传类目就拒。证明 G6 不是恰好通过的。 */
const g7 = scoreMatch({ brand: 'Montblanc', name: 'Legend Spirit' },
  '美国直邮Legend Spirit正品万宝龙', { Montblanc: ['万宝龙'] }, '');
check('G7 同一标题不传类目则拒（证明 G6 有效）', !g7.accept, JSON.stringify(g7));

/* G8 两类判据是**串联**的，类目过了不代表就能 accept。
   没有任何中文别名的品牌（实测 `Montblanc 万宝龙`、`Memo Paris 玫默`、
   `Ex Nihilo 无中生有` 都不在 data/brand-aliases.json 里）会卡在品牌这一关：
   标题是纯中文，拉丁品牌词一个都不出现。
   这是 2026-11-08 那轮 17 条「品牌名未出现在标题里」的成因。
   短期不改（补别名要逐个核实中文译名，猜错会把别牌商品写成这瓶），
   所以在这里把现状钉成断言 —— 它变红了说明别名表被补上了，该更新注释。 */
const g8 = scoreMatch({ brand: 'Montblanc', name: 'Legend Spirit' },
  '美国直邮Legend Spirit正品万宝龙', {}, '彩妆/香水/美妆工具/香水');
check('G8 无中文别名时品牌关仍拦下（已知缺口，补别名后此断言应改）',
  !g8.accept && g8.reason === '品牌名未出现在标题里', JSON.stringify(g8));

/* ---------- 输出 ---------- */
console.log('\n===== 品类闸门测试 =====');
console.log(`PASS ${pass}   FAIL ${failures.length}`);
if (failures.length) {
  console.log('\n失败明细:');
  failures.forEach((f) => console.log('  ✗ ' + f));
}
process.exitCode = failures.length === 0 ? 0 : 1;
