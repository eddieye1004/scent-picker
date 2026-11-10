# UI 重设计线 · 停线交底（2026-11-10）

依据 `CONTROL.md`：UI 线自本日起**只读**，产出只落 `docs/reviews/`。
本文是该线在停线点的完整交底：已入库的东西、可复现的数字、对打分线的具体风险、未做的事。
写作期间未修改任何代码或配置。

---

## 1. 停线位置

| 项 | 值 |
|---|---|
| 基线 commit | `c878159`（2026-11-10 13:40:34，"stop-loss baseline — archive 4-line parallel state as-is"） |
| 当前 HEAD | `27f3c65`（13:41:47，仅新增 `CONTROL.md` 与 `docs/GOLD-STANDARD-DRAFT.md`） |
| 工作区 | **clean**（`git status --porcelain` 空） |
| 本线全部未提交改动 | 已随 `c878159` 原样入库，无残留 |

UI 线最后一轮（v44 / D69）**确认已进基线**：`git show c878159:styles/src/_wheel24.css` 含 4 条 `#app .disc:not(.wheel)` 规则（第 107/110/113/116 行），`docs/DECISIONS.md` 的 `## D69` 在基线版本第 3243 行。即停线点没有"改了但没存"的半成品。

---

## 2. 停线点实测（本次复跑，命令见文末）

**构建**

- `styles.css`：磁盘 **320839 字节** / **226009 字符**（UTF-8 多字节）/ **7464 行** / **24 个源层**
- `node scripts/build-css.mjs --check` → ✓ 与源层一致
- `app.js`：3212 行，内容 sha 与 `HEAD:app.js` 一致（`331df6e5…`）
- `index.html` 引用：`styles.css?v=20261110a`、`app.js?v=20261108c`

**七套测试（全绿）**

| 脚本 | 结果 |
|---|---|
| `test-render.mjs` | PASS **269** / FAIL 0 |
| `test-contrast.mjs` | PASS **42** / FAIL 0 |
| `test-scoring.mjs` | PASS **132** / FAIL 0 |
| `test-compliance.mjs` | PASS **10** / FAIL 0 |
| `test-category-gate.mjs` | PASS **10** / FAIL 0 |
| `test-union-api.mjs` | PASS **76** / FAIL 0 |
| `test-jd-web.mjs` | PASS **17** / FAIL 0 |
| **`test-gold.mjs`** | **不存在** ← 见 §4 |

`test-scoring` 是 **132** 而非历史上出现过的 133：`112152d` 的提交信息已写明"v42 删了两条针对已移除因子的断言"，数字对齐，不是退化。

---

## 3. 会话纪实里两处错误数字（已纠正，别再引用）

这两条都出现在本线此前的口头汇报里，落文档时复核发现是错的：

1. **`styles.css` 的"字节"其实是字符数。** `scripts/build-css.mjs:72/78` 打印的 `${built.length}` 是 JS 字符串长度（UTF-8 字符），不是字节。同一份文件：磁盘 320839 字节 / 打印 226009。数值本身没错，**标签错了**；引用体积时必须写明"磁盘字节"还是"字符"。这是构建脚本的措辞缺陷，不是内容缺陷，停线期不动。
2. **`shots/` 的体积。** `shots/` 合计 **213.3 MB**，其中 `shots/ui/` **203.1 MB**；`shots/ui/v37*` 十几个目录每个约 4.8 MB，是同一批中间态截图。它们全在 `.gitignore` 里（`shots/` 一行），**不入库、不影响契约**，但会一直占盘。清理属"改文件之外"的动作，需 Eddie 另行发话。

另外一条**不是**缺陷、但曾被误报为缺陷：

- 深色下「美食调」的副标签「香草·零陵香豆」右端紧贴分界弧（截图上像被切掉一半）。实测：`boxW = textW = 75.5px`，`overflow: hidden` 但**零截断**；弧线在 x≈576，文字止于 575。两者是相邻不是覆盖。此条已量证，不需修。

---

## 4. 对打分线的具体风险（这是本文的主要用途）

UI 线虽然只碰 `styles/src/`，但它有 **4 处硬依赖 `app.js` 的 DOM 契约**。打分线改 `app.js` 时若动了这些，UI 会**静默失效**——不报错、测试也未必红、只是变丑。

| 依赖点 | CSS 侧 | `app.js` 侧 | 打分线动了会怎样 |
|---|---|---|---|
| **步名** | `#app[data-step="context"]`（`_wheel17.css:67`、`_wheel22.css` 第七节、`_wheel23.css`） | `app.js:3945` `dataset.step = list[state.step].id` | 改 `STEPS` 里的 id 或删掉「场合」步 → 三条规则全部 no-op，场合屏盘心回到实心灰方块 |
| **圆盘类名** | `#app .disc:not(.wheel)`（`_wheel24.css` 107–116） | `buildDisc()` 产出 `class="disc"`（无 wheel） | 给场合盘加 `wheel` 类 → vh 约束失效，1366×768 下盘底 815.9 再次溢出 48px |
| **进度条列数** | `repeat(var(--steps, 7), 1fr)`（`base.css`） | `app.js:3063` `style="--steps: ${list.length}"` | 改步数不报错（走 fallback 7），但若删掉这个 style 就退回写死 4 列 → 7 步排成 4+3 两行 |
| **中圈退场时长** | `.wheel .sub-ring { 420ms }`（刻意留字面量不 token 化） | `app.js` 的 `exitTimer = setTimeout(clearSubRing, 420)` | 任何一侧单独改 → 弧带要么被 JS 提前掐断、要么 CSS 拖尾 |

另有两条软耦合，改动时同样要跑 `test-render`（269 条里有 40 余处按类名计数）：

- `render()` 写 `dataset.scene`（`app.js:3936`），三档切屏 `sceneCut`/`sceneSettle`/`sceneRise` 由 `SCENE` 映射表驱动（`app.js` 内 `SCENE` 常量）。删掉 `dataset.scene` → 全部退成 `cut`（纯淡入），不报错。
- `renderFamily()` 里 `navBar('family')` 的位置在 `segControl` **之前**（`app.js:1547`），是"先主按钮、后退路"的排布前提；挪回去会让两个按钮换序，`test-render` 不查顺序。

**建议给打分线的动作**：改 `app.js` 后除了七套测试，额外跑一次 `node scripts/build-css.mjs --check` 并肉眼过一眼 1440×900 与 1366×768 的场合屏（脚本 `C:/Users/16256/ego/demo/probe_allsteps.cjs`，只读量 CTA 是否出屏；该脚本不在仓库内，属临时探针）。

---

## 5. 本线未做的事（明确交接，避免被当成遗漏）

1. **`test-gold.mjs` 不存在** —— 这是 `CONTROL.md` 第 3 节第 1 步，属打分线职责。UI 线不代做，也不该由 UI 线给出金标准。
2. **视觉抛光的剩余项均已判定为非缺陷或已修完**：D64（选中香调白字改蓝）、D65（两条"遗留"经 `Range.getClientRects()` 复核为量错）、D66（购买组 44/48/48 → 48）、D68（字体落地 / h1 44px / 阴影四档 / 圆角两档）、D69（场合盘 vh）。
3. **未做的两项只能由 Eddie 决定**：`shots/ui/` 的 203 MB 中间态截图是否删；`docs/reviews/` 这类审查产物是否入库（当前未跟踪）。
4. **共享大脑未写入**：`CONTROL.md` §4 要求往 Shared-brain 的 `STATE.md` append 一行，但本机 `Test-Path "D:\shared-brain\.git"` = **false**，该仓库不存在，无法执行。此项需 Eddie 确认路径或授权跳过。

---

## 6. 复跑命令

```powershell
cd C:\Users\16256\Documents\deepseek-harness\default-workspace\scent-picker
$n = "F:/deepseek/resources/runtime/primary-runtime/dependencies/node/bin/node.exe"

& $n scripts/build-css.mjs --check
& $n scripts/test-render.mjs
& $n scripts/test-contrast.mjs
& $n scripts/test-scoring.mjs
& $n scripts/test-compliance.mjs
& $n scripts/test-category-gate.mjs
& $n scripts/test-union-api.mjs
& $n scripts/test-jd-web.mjs

git status --porcelain          # 应为空
git rev-parse --short HEAD      # 27f3c65
```

字节与行数的正确读法（`build-css.mjs` 打印的是字符数）：

```powershell
(Get-Item styles.css).Length                                  # 320839 磁盘字节
(Get-Content styles.css | Measure-Object -Line).Lines        # 7464 行
```

---

**署名**：UI 重设计线（DSH 会话 `697cd05c`），2026-11-10 停线。
**状态**：只读。本文之后本线不再改动任何代码、构建产物或配置。
