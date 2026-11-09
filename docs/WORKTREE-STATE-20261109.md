# 工作区未提交状态（2026-11-09）

> 只记录，不改动。下面这些改动属于**「UI 视觉重新设计」任务线**，
> 不是本线（佣金 / 覆盖率 / 实物图）产生的，我一个字都没改、也没提交。
> 本线最后一次提交是 `2d67fbf`，`git rev-parse HEAD` 与 `origin/main` 完全相同。
>
> 唯一由本文件带来的变化：新增 `docs/WORKTREE-STATE-20261109.md`（就是本文件）。

## 一、当前工作区

```
 M scripts/build-css.mjs        +1   -0
 M styles.css                   (产物，由上面 5 个源层生成)
 M styles/src/_wheel13.css      +6   -2
 M styles/src/_wheel14.css      +17  -17
 M styles/src/_wheel7.css       +29  -29
 M styles/src/base.css          +2   -2
?? styles/src/_wheel23.css      348 行 / 15,864 字节
?? fonts/                       8 个 woff2（Inter 400/500/600/700 × latin / latin-ext）
```

`git diff --stat` 合计 6 files changed, 451 insertions(+), 106 deletions(-)，
其中 `styles.css` 占 452 行 —— 它只是产物，真正的改动在 5 个源层里。

## 二、各文件改了什么（从 diff 读出，未做判断）

| 文件 | 实质改动 | 对应决策号 |
|---|---|---|
| `scripts/build-css.mjs` | `PARTS` 末尾加一行 `'_wheel23.css'` | — |
| `styles/src/base.css` | 第 437 行附近：`border: 1px solid var(--edge)` → `var(--hair)`；`background: var(--bg-2)` → `var(--bg)` | — |
| `styles/src/_wheel7.css` | `.wheel` 底座 `background: #c3c9dc` → `var(--bg)`；三层落影改两层（`0 0 0 1px var(--line)` + `0 18px 44px -34px`）；`transition` 增加 `box-shadow`；家族扇区注释改为「A 方向：六族同色，分块只靠白缝」 | D59 系列 |
| `styles/src/_wheel13.css` | `.pick-buy-group` 的 `align-items: center` → `stretch` | **D66**（已在 HEAD 里） |
| `styles/src/_wheel14.css` | 深色底盘 `#0e0e0e` → `#171717`，去掉径向内凹渐变，改「纯色面 + 细勾边 + inset 亮边」 | A 方向 v37 |
| `styles/src/_wheel23.css` | 新增：第 4 步「场合」圆盘（`buildDisc()`，`app.js:250`）按 `#app[data-step="context"]` 认屏改版；盘心从方块改圆；首屏六族同色 | F 方向 v37 |
| `fonts/`（未跟踪） | 8 个 woff2：Inter 400/500/600/700 × `latin` / `latin-ext`，每档 48,256 / 85,068 B | — |

**`fonts/` 目前还没有被任何地方引用** —— 全仓 `grep "fonts/"` 与 `@font-face` 都是 0 命中
（命中的全是 `pointer-events` 里的 `fonts` 子串，别被误导读成有引用）。
它像是给「无外部字体」这条硬约束准备的本地字体，但 CSS 里还没有接上。

## 三、两处值得留意的依赖

1. **`_wheel23.css` 用了 `var(--hair)`，而 `--hair` 定义在 `_wheel22.css:35`（浅色）/ `:383`（深色）。**
   现在 `PARTS` 里 `_wheel22` 在 `_wheel23` 之前，变量在引用前已定义，是对的。
   将来若有人把 `_wheel23` 挪到 `_wheel22` 前面，这一层的 `box-shadow` 会静默失效
   （`var()` 无 fallback 时整条声明作废，不报错）。

2. **`_wheel13.css` 的 `align-items: stretch` 是 D66 的修复，D66 已经在 HEAD 里了**
   （`git show HEAD:docs/DECISIONS.md` 能搜到 D66）。所以这一行改动看起来像
   「未提交的修复」，实际是决策文档先落了、代码还留在工作区。

## 四、怎么核对它是不是我改的

```powershell
# 1. 本线的提交里不含这 6 个文件
git log --oneline 2d67fbf -1 --stat | Select-String "_wheel7|_wheel14|_wheel13|base.css|build-css"

# 2. 工作区的 mtime 全部早于本线最后一轮操作
git status --porcelain; Get-ChildItem styles/src/_wheel23.css | Select-Object LastWriteTime

# 3. 源层与产物当前是同步的（我提交时 221,584 字符 / 7,327 行）
node scripts/build-css.mjs --check
```

第 3 条的「字节数」会看到两个不同数字：脚本打的是 `built.length`
（UTF-16 码元数，221,584），`Get-Item styles.css` 给的是真实字节（313,992）。
两个都对，前者是 JS 字符串长度、后者是磁盘字节，中文一下差 40%。

## 五、我没有做的事

- 没有 `git add`、没有 `git stash`、没有 `git checkout --` 这 7 个文件。
- 没有因为 `build-css.mjs --check` 通过就去提交它们（它通过只说明
  「产物与源层一致」，与「该不该入库」是两件不同的事）。
- `docs/TODO-REMAINING.md` 也没有动 —— 并行会话在改它，我另开本文件避免冲突。
