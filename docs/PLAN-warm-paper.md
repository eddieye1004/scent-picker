# 改法计划 · 暖纸 + 陶土迁移（未执行）

日期：2026-10-30 · 状态：**仅计划，未改任何代码**
输入：`PRODUCT.md`、`~/.dsh/skills/scent-design-tokens/reference/migration-map.md`、`F:/2026-10-28-18-59-21/HANDOFF-scent-picker.md`
现状代码：`styles.css` 3951 行（拼接产物，见下）、`app.js` 104,749 字节

---

## 0. 先报冲突（按你的要求，先指出再执行）

### 0.1 文档前提已过期，逐条对账

| 文档写法 | 仓库实测 | 影响 |
|---|---|---|
| `--bg #070b11` 深空黑 HUD | `#ffffff` 白底 | 迁移图第 1 节的「旧值」整列对不上 |
| `--accent #5ad6e8` 青色 HUD | `#002FA7` 克莱因蓝 | 同上 |
| `styles.css` 745 行 | 3951 行 | 改色面积是文档预期的 5 倍 |
| `--radius 2px → 4px` | 已经是 `4px`（v3 覆盖层，`styles.css:1408` 起的第二个 `:root`） | 圆角一项无事可做 |
| 删 `body::before` 网格底纹 / 青色辉光 / `mask-image` | **三样都不存在**（`grep body::before` 无命中） | 第 5 节第 1–3 行是空任务 |
| 大写英文小标签 12px 要删 | 仍在：`styles.css` 有 9 处 `text-transform: uppercase`，`.disc-sector .en` 在 390px 以上可见（`:390`、`:560` 窄屏隐藏） | 这一条是真任务 |
| `--maxw` 760px | `720px`（`#app.wide` 时 900px） | 文档没写这条，按文档「保留」反而会改宽 |
| `--discw` 560px | `520px` | 同上 |
| 数据 200 瓶 | 400 瓶 | 与视觉无关，仅说明文档没跟上 |

结论：**不能照文档逐行执行**，只能用它的色值表。

### 0.2 方向本身与仓库决策记录冲突

`docs/DECISIONS.md` 里这一条线是走过又回退的：

- **D20**：换成暖纸 `#f4ece0` + 朱砂 `#8c3a2c` + 衬线标题 → 用户原话「还是很 ai」
- **D22**：定瑞士国际主义，白底 `#ffffff` + 墨黑 `#0e0e0e` + `--radius: 0`，理由是「质感来自贴图，结构没变」
- **D27**：主色换克莱因蓝 `#002FA7`

`PRODUCT.md:39` 也写着「视觉语言正在迁移：深空黑 HUD / 雷达仪表盘 → 暖纸 + 大地色 + 编辑感衬线……不得自行发明新方向」——这句话写于 D20，之后 D22/D27 已经把结论推翻了，**PRODUCT.md 这一段本身是过期的**。

`migration-map.md:46` 还有一句额外的：把 Oura 的行动色 `#2a72de` 换成陶土 `#6b443d`，理由「香水语境下发冷」。这和 D27 换克莱因蓝的理由（明度 33% 才有重量感）是同一个论证方向，两个方向互斥。

**需要你确认**：这次是有意回退到 D20 的暖纸路线（并接受 D22/D27 被推翻），还是只想把陶土当作 accent 叠在当前白底上？**这个答案决定下面表里 `--bg / --bg-2 / --bg-3` 三行是改还是不改**——那三行牵动 52 处 `var()`，是整张表里最大的一块。

### 0.3 迁移图第 1 节与测试硬断言互斥

`scripts/test-contrast.mjs:35-39`：

```js
const ACCENT_EXPECT = '#002FA7';
if (VARS.accent && VARS.accent.toUpperCase() !== ACCENT_EXPECT) {
  console.error(`✗ :root 归并异常：--accent 解析为 ${VARS.accent}…`);
  process.exit(1);
}
```

这条是**熔断**，不是断言失败。把 `--accent` 改成 `#6b443d` 会让整个测试在第 39 行退出，一条结果都不出。改色必须同步改 `ACCENT_EXPECT`，且要保住它原本的功能（守「第二个 `:root` 覆盖层有没有进 CSS」）——建议改成读 `--blue` 而不是 `--accent`，因为 `--blue` 才是 v3 覆盖层的标记位。

### 0.4 `--ink-3` 不能按文档的「换个变量用」处理

`migration-map.md:32` 说 `#6c6a64` 在 `#e8e0d2` 上只有 4.13，办法是「cream-strong 卡片里改用 `--ink-2`」。但 `test-contrast.mjs:71-72` 的 PAIRS 明确要求 `--ink-3` **同时**过 `--bg-2` 和 `--bg-3`：

```js
['--ink-3 on --bg-2', …'.hub-kicker / .disc-sector .en'],
['--ink-3 on --bg-3', …'.opt:hover 里的 .num'],
```

实测（本轮算的）：`#6c6a64` on `#efe9de` = **4.48**、on `#e8e0d2` = **4.13**，两条都挂。所以必须把 `--ink-3` 本身调深，不能靠「别用」。见下表取 `#63615b`。

### 0.5 字阶两套不兼容

`migration-map.md:85-90` 要 12 / 14 / 16 / **20** / **26** / **36**；`D25` 定的是 12 / 14 / 16 / **22** / 26 / **34** / **44**。没说明以谁为准。见第 5 节。

### 0.6 走法 A 的前提在本站不成立（详见第 6 节）

---

## 1. 基线（本轮唯一一次执行）

`node scripts/test-contrast.mjs` → **PASS 34 / FAIL 0**

关键实测值：`--accent on --bg` 10.69、`--ink on --bg` 19.30、`--ink-3 on --bg` 6.19、`--edge` 4.54、`--blue-lift on --bg` 5.78、白 on `--blue` 10.69。

另跑 `test-render` 126 / `test-scoring` 106 / `test-compliance` 10，本轮未跑（不改代码，无意义）。

---

## 2. 变量改法表

「实测」列是本轮用 WCAG 2.1 相对亮度公式重算的，不是抄文档；`on bg / bg-2 / bg-3` 分别为 `#f7f1e8` / `#efe9de` / `#e8e0d2`。

### 2.1 底色层（52 处 `var()`，**取决于 0.2 的确认**）

| 变量 | 现值 | 提议值 | 实测 on canvas | 选择器数 | 代表选择器 |
|---|---|---|---|---|---|
| `--bg` | `#ffffff` | `#f7f1e8` | — | 25 | `body`(:62)、`.chip[aria-pressed="true"]`(:737)、`.btn`(:781)、`.disc-sector[aria-checked="true"]`(:402) 反白字 |
| `--bg-2` | `#f5f5f5` | `#efe9de` | — | 16 | `.disc-hub`(:417)、`.opt:hover`(:601)、`.wheel.is-open .disc-core`(:2013)、`.wheel:not(.is-open) .sector-shape`(:2074) |
| `--bg-3` | `#e8e8e8` | `#e8e0d2` | — | 12 | `.progress i`(:138)、`.sector-g.is-hot .sector-shape`(:334)、`.btn:disabled`(:825)、`.wheel-back:active`(:2550) |
| `--line` | `#d9d9d9` | `#e1dcd3` | 1.22（装饰，须 <3） | 17 | 分隔线、虚线轨 |

### 2.2 文字层

| 变量 | 现值 | 提议值 | on canvas / card / strong | 选择器数 | 代表选择器 |
|---|---|---|---|---|---|
| `--ink` | `#0e0e0e` | `#1c1b1a` | 15.32 / 14.23 / 13.12 | 82 | `body`、`.pick h3`、盘心主词 |
| `--ink-2` | `#3d3d3d` | `#4a4741` | 8.24 / 7.66 / 7.06 | 41 | `.lede`、`.q-help`、`.chip`、`.hub-desc` |
| `--ink-3` | `#616161` | **`#63615b`**（文档的 `#6c6a64` 只有 4.82/4.48/4.13，挂两条断言） | 5.51 / 5.12 / **4.72** | 52 | `.progress-meta`(:146)、`.hub-kicker`(:513)、`.disc-sector .en`(:390)、`.plan` 标题、`.opt .num`(:604) |

### 2.3 强调色

| 变量 | 现值 | 提议值 | 实测 | 选择器数 | 代表选择器 |
|---|---|---|---|---|---|
| `--accent` | `#002FA7` | `#6b443d` | 7.42 / 6.90 / 6.36；白字压其上 8.34 | 18 | `.hub-zh`(:521)、`.masthead .lede em`(:115)、`.progress i.now`(:145)、三处 `:focus-visible`、滑杆 thumb |
| `--accent-soft` | `#8A93B8` | `#8a7455` | 3.97 / 3.69 / 3.40 | **0 处引用**，但 `test-contrast:142` 守 `>=3` | `.sector-g.is-hot stroke`（已无实际使用者） |
| `--warn` | `#8a5a00` | `#7d5c14` | 5.48 / 5.09 / 4.70 | 0 处引用，测试守 | 警告型小字 |
| `--danger` | `#a4262c` | `#a5342f` | 5.97 / 5.55 / 5.12 | 6 | `.reasons li.warn`、`.chip.neg` |
| `--ok` | `#2f5d3a` | `#5c6f5d` | 4.81 / 4.47 / **4.12** | 0 处引用 | 只能用于 canvas 层，不可上 cream-strong |

### 2.4 四档「蓝」（名字保留，色相换陶土系，避免 41 处选择器跟着改名）

| 变量 | 现值 | 提议值 | 实测 | 选择器数 | 代表选择器 |
|---|---|---|---|---|---|
| `--blue` | `#002FA7` | `#6b443d` | 7.42 | 55 | `.masthead h1 em`(:1447)、`.btn`(:1501)、`.progress i.now`(:1476)、`.sector-g.is-on .sector-shape`(:1616/1770/2024/2975/3326/3376) |
| `--blue-deep` | `#001A5E` | `#39221e` | 13.16 | 9 | 渐变尾、`.progress i.done`(:1470)、`.btn` 渐变终点 |
| `--blue-lift` | `#3D5FC4` | `#84544a` | 5.59 / 5.19 / 4.79 | 3 | `.btn:hover` 渐变起点(:1510) |
| `--blue-amb` | `#8A93B8` | `#9c846c` | 3.15 / 2.93 / 2.70 | 4 | `.sub-ring::before`(:2350)、`.is-picked .disc-core` 激活描边(:2390)、`.sub-g.is-hot .sub-arc`(:3810) |
| `--blue-wash` | `rgba(0,47,167,.07)` | `rgba(107,68,61,.07)` | — | 7 | 选中扇区水洗底（6 处同选择器层叠） |

### 2.5 冲突点：`--blue-lift` 与白字按钮

`.btn` 是 `linear-gradient(160deg, var(--blue) 0%, var(--blue-deep) 130%)`，白字要 >=4.5。`--blue` 8.34 ✓、`--blue-lift` 5.74 ✓，两档都过；但 `--blue-amb` 2.70 **不能承载任何文字**（文档也这么写，`:33` 那四个 Oura 装饰色同一逻辑）——现在它只做 1px 描边，安全。

---

## 3. 不在 CSS 变量里、但必须一起改的硬编码色

只改变量等于改一半。以下全部写死在 JS/HTML 里：

| 位置 | 内容 | 问题 |
|---|---|---|
| `app.js:1105-1110` | 六族渐变 `#fbfcee…#f5e4ee` / `#f9f6f2…#e9e1d6` / `#fdfaf0…#f2e6cc` / `#f2faf6…#d8ecdf` / `#fcf7f1…#efdfcc` | 这六个是给**白底**调的。实测 L* 极差只有 **3.01**（93.57–96.58）；换到 `#f7f1e8`（L* 96.0）上，woody/gourmand 比底色还暗、citrus 比底色还亮，六块会读成「白斑 + 三块脏斑」，色相基本消失。必须重调色相而不是重算明度 |
| `app.js:1115` | `gArcOn` = `#2249b8 / #002fa7 / #00268a` | 选中弧段渐变，直接写死宝蓝 |
| `app.js:1118` | `gBase` 底座 = `#cdd3e2 / #c3c9dc / #b9c0d6` | 冷灰蓝径向底。暖纸底下这块会是全页最冷的一块，必须换暖灰 |
| `_wheel8.css:69`（拼进 `styles.css:3497`） | `.wheel .sub-channel { stroke: #97a3c1 }` 中圈凹槽槽底 | 对白瓦 2.52，对 canvas 只有 2.25。换暖灰 `#8a7455`（对白瓦 4.46）或 `#7d6849`（5.32） |
| `styles.css` 44 处 | 字面量 `#fff` / `#ffffff` | 其中一部分是白字（该留）、一部分是白底（该换），要逐个判 |
| `index.html:9,13` | `theme-color #f6f2ea`、favicon `%23a86b32` | 这两个已经是暖色系，反而是**唯一一处比 CSS 更接近目标**的地方 |

结论：`styles.css` 是拼接产物（`base.pre-wheel2.css` + `_wheel4/4c/plate/5/6/7/8/9.css`，重建脚本 `C:/Users/16256/ego/rebuild-css.mjs`），改 CSS 必须落到 `_wheel*.css` 源层再重建，直接编辑 `styles.css` 会被覆盖。

---

## 4. 删改清单（迁移图第 5 节，按实测状态重写）

| 项 | 文档要求 | 实测状态 | 本轮动作 |
|---|---|---|---|
| 44px 网格底纹 | 删 | 已不存在 | 无 |
| 青色径向辉光 | 删 | 已不存在 | 无 |
| `mask-image` 径向遮罩 | 删 | 已不存在 | 无 |
| `body::before` | 删 | 不存在 | 无 |
| 大写英文小标签 | 删或降级 | 9 处 `uppercase`；`.disc-sector .en` 仅窄屏隐藏 | 按 D22 的「中文为主」，桌面也一并 `display:none`，否则暖纸底上 12px 全大写最像 AI 生成页 |
| `-webkit-font-smoothing: antialiased` | 保留 | 保留 | 无 |

---

## 5. 字号

文档要 6 档、D25 要 7 档。现状实测分布（`grep -o "font-size:[^;}]*"`）：

```
12px×46  14px×25  16px×18  22px×13  26px×7  34px×3  44px×1
离档：13px×2（:2786 sub-arc-btn、:3010 lvl1 标签）
      盘心主词 28px(:3542) / 24px(:3581) / 19px(:3943) / 18px(:3949) 为响应式四档
```

**建议按 D25 不动**，只补两件事：①13px 那两处回 14px 或 12px；②盘心主词的 28/24/19/18 四档是上一轮为了窄屏塞进圆弧量出来的（390 视口盘心 78.7px 半径），收档会直接撞开 D41 的碰撞结论。

代价：不采用文档的 20/36 两档，就没有「编辑感衬线 display」的位置——但见第 6 节，本站本来也没这个位置。

---

## 6. 字体 —— 冲突点，单独列，不自行决定

### 6.1 文档的三个走法

| 走法 | 做法 | 代价（文档原文） |
|---|---|---|
| **A（文档推荐）** | 中文全用系统无衬线，**只有英文与数字标题用衬线** | 0 成本，离线不破 |
| B | 自托管 woff2 子集（中文只取用到的字） | 需构建步骤 |
| C | CDN 引思源宋体 / Noto Serif SC | 破「离线可用」，首屏多 1–4MB |

### 6.2 走法 A 在本站不成立

走法 A 的全部收益是「英文/数字大标题用衬线」。但本站的 display 标题只有一个：

```html
<h1>从零开始，找到第一瓶香水</h1>   <!-- index.html:24 -->
```

**纯中文，没有任何英文或数字 display 标题。** 走法 A 落地后 `--font-display` 一个字符都用不上，等于「改了字体栈但视觉零变化」。文档这句「只有英文与数字标题用衬线」是从 Oura 的英文站点照抄的，前提没迁过来。

### 6.3 本机字体实测（`InstalledFontCollection`，295 个族）

| 栈里的名字 | 装了吗 |
|---|---|
| `Instrument Serif` | **没有** |
| `Inter` | **没有** |
| `PingFang SC` | 没有（macOS 专属） |
| `Source Han Sans SC` | 没有 |
| `Songti SC` | 没有（macOS 专属） |
| `Microsoft YaHei` | 没有这个精确名，只有 `Microsoft YaHei UI` |
| `Georgia` | 有 |
| `Times New Roman` | 有 |
| `Noto Serif SC` | **有**（`NotoSerifSC-VF.ttf`，可变字重） |
| `SimSun` | 有（`simsun.ttc`，`SimSun-ExtB/ExtG` 另装） |

即：文档给的 A 栈里，中文兜底 `PingFang SC` / `Source Han Sans SC` 本机一个都没有，实际会落到 `Microsoft YaHei UI`→`Arial`；`Instrument Serif` 也没有，会落到 `Georgia`。**「可直接用，全是系统字体或已装」这句是错的。**

### 6.4 三个可选走法，代价由你定

**A′ 只换衬线给数字，中文一个字不动**
`--font-display: Georgia, "Times New Roman", "Noto Serif SC", serif`，只给 `h1 em`（现在是克莱因蓝渐变那块）、`.progress-meta` 的数字、`.pick h2` 的英文名用。
代价：视觉增益极低（本站数字招牌很少）；0 风险。

**B′ 中文标题用真衬线（本机已有 Noto Serif SC）**
`--font-display: "Noto Serif SC", SimSun, serif` 用在 `h1`、`.q-title`、`.result-head h2`。
代价：①`Noto Serif SC` 是可变字体，单文件几十 MB 级别挂在系统里，浏览器渲染大字要枚举字重，首屏有可感延迟（未实测，标注「推断」）；②只有本机装了，换一台 Windows 就回退到 `SimSun`，14px 以下横画会糊——而 D22 明确写了「宋体在 14px 以下横画会糊」所以选了黑体；③直接推翻 D22 的「层级靠尺寸和字重，不靠换族」。

**C′ 自托管子集**
本站 UI 中文唯一字 **448 个**（`index.html` + `app.js` 字符串里统计）。思源宋体子集化 448 字约 150–250KB woff2（推断，需实测）。
代价：需要引入构建步骤—— PROJECT.md 硬约束第 2 条「无构建步骤」被破；且 `index.html` 要加 `@font-face`，离线可用保住（字体进仓库），但仓库体积 +200KB 级别。

### 6.5 我的建议（不代替你定）

**A′**。理由：D22 已经论证过「换族会同时推翻 D22 与 D25 的结论」；本站唯一的 display 文本是纯中文，衬线的收益天花板很低；而 C′ 会破「无构建步骤」这条比「无外部字体」更难松的约束。

但如果你要的就是「编辑感衬线」这个气质本身，那 A′ 等于没做，得直接上 B′ 或 C′——**这个答案决定要不要动 `index.html` 与仓库结构，是三条路里唯一会超出 CSS 范围的**。

---

## 7. 执行顺序（等你确认 0.2 与 6.5 之后）

1. 改 `test-contrast.mjs`：`ACCENT_EXPECT` 换成守 `--blue`（保住它原本的功能）
2. 改 `_wheel*.css` 源层的 `:root` 覆盖层 → 跑 `rebuild-css.mjs` → 校验 `styles.css` 与拼接结果一致
3. 改 `app.js:1105-1118` 六族渐变 / `gArcOn` / `gBase`
4. 逐个判 `styles.css` 里的 44 处字面量白
5. `docs/DECISIONS.md` 新增 D42，记录「D20 暖纸路线二次启用 + D22/D27 被覆盖」的判断依据
6. 四套测试 + 四视口（1440/1366/390/360）碰撞与溢出复测 + 截图

预计：只改色约 2 小时；含字体 B′/C′ 再加 1–3 小时。
