# 任务 2 · 场合圆盘「新版」定位与替换（2026-11-11）

派单原文：「中间步骤的圆盘仍是旧版：先在项目内定位『优化后的新圆盘』的来源（查 scent-picker-v2 存档、
docs/reviews、历史 commit），找到后把现行圆盘组件替换为新版，交互口径（点选/回显/答案落点）保持不变。」

**结论先说**：新圆盘**找到了**，它一直都在 `styles/src/70-final.css`（原 `_wheel23.css`，D63 / v38 定案），
但自 2026-11-10 19:45 起**整体失效**——认屏选择器还写着旧步骤 id `context`，而 `be23110` 已把它改名为 `occasion`。
本次修的就是这一个字串。圆盘组件的 JS（`buildDisc()`）一行未动，交互口径零变化。

---

## 1. 查过的候选与各自证据
| # | 候选 | 位置 | 证据 | 判定 |
|---|---|---|---|---|
| 1 | `scent-picker-v2` 存档 | 同级目录，HEAD `3402fb3` | 该副本 `styles/src/` 下**没有** `_wheel23.css`；`app.js` 的 `buildDisc()` 与主线**逐字符相同**（比对第 211–330 行与主线 294–413 行，完全一致） | ✗ 不是新版的来源，只是旧状态存档 |
| 2 | `docs/reviews/` | 3 份 UI/问卷审查 | `UI-LINE-REVIEW-20261110.md:68` 明确记着「`#app .disc:not(.wheel)` → `buildDisc()` 产出 `class="disc"`」，说明当时 CSS 侧认的是**非 wheel 的 disc**；未记录任何新版组件 | ✗ 是风险清单，不是实现 |
| 3 | 历史 commit `55d238e` | `feat: 前两步改为 HUD 环形圆盘选择器` | 这是**首屏轮盘**（`buildWheel()`）的起源，不是场合盘 | ✗ 对象不对 |
| 4 | `docs/DECISIONS.md` **D63（v38）** | `## D63 · 两个圆盘按 A/F 方向重做` | 用户原话 m09539「后面一步有一个圆盘没有进行优化 还是最旧的设计」；定案 m09714「1 选A 统一颜色… 2选f」；落地记录写明「新建 `_wheel23.css`，八节：盘体/瓦片/盘心改圆/触屏反制/首屏分块/展开态/深色场合盘/深色首屏」，并列出四次自我纠错的实测数字 | ✓ **这就是新圆盘的定义与实现** |
| 5 | 当前 `styles/src/70-final.css` | 25 条 `#app[data-step="context"] …` | 内容与 D63 描述逐条对应（圆盘 `border-radius:50%`、瓦片 `#fafbfe` + 4px 缝、盘心改圆、深色对照）——**代码在，选择器错** | ✓ 新圆盘本体 |
| 6 | `styles/src/60-motion.css`（3 条）+ `40-theme.css`（4 条） | 同款 `data-step="context"` | 同一次改名波及的另外两处（盘心空态降重、场合屏纵向预算） | ✓ 一并修复 |

## 2. 根因（一条选择器，不是缺代码）

```
app.js  STEPS: { id: 'context'  →  'occasion' }     // be23110（2026-11-10 19:45）
CSS     #app[data-step="context"] .disc { … }       // 从未跟着改
```

CSS 属性选择器不匹配**不报错**，八套测试也没有一套读 `data-step` —— 于是：
代码在仓库里、D63 的验收数字也是真的，但用户看到的仍是 `10-foundation.css` 里最早那套。

## 3. 实测证据（`scripts/probe-disc.mjs`，Edge headless + getComputedStyle）

| 取值 | 修复前 | 修复后 |
|---|---|---|
| `.disc` `border-radius` | `0px` | `50%` |
| `.disc` `box-shadow` | `none` | `0 0 0 1px` 外圈 + `0 12px 34px -30px` 落影 |
| `.disc` `background` | `rgba(0,0,0,0)`（透明） | `var(--bg)` 纸底 |
| `.disc-hub` `border-radius` | `0px`（方块 + 四角 L 角标） | `50%` |
| `.disc-hub` `padding` | `14px 16px` | `0 16px`（圆内接留白） |
| `.sector-shape` `stroke-width` | `1px` | `4px`（F 方向的「缝」） |
| `.sector-shape` `stroke` | `rgb(124,116,102)` 实线 | `var(--bg)`（缝 = 盘底，不画分格线） |

1440 / 390 两个视口的读数一致；深色下瓦片按 D63 第七节换成 `--bg-2` / `#3a3a3a`（截图：
`shots-20261111/t2-occasion-after-dark-1440.png`）。

## 4. 改造范围

| 文件 | 改动 |
|---|---|
| `styles/src/70-final.css` | 25 处 `data-step="context"` → `"occasion"`；顶部注释改写为「这一段曾整体失效」的复盘 |
| `styles/src/60-motion.css` | 3 处同上（盘心空态降重） |
| `styles/src/40-theme.css` | 4 处同上（场合屏边距预算） |
| `styles.css` | `node scripts/build-css.mjs` 重建（产物入库） |
| `scripts/test-render.mjs` | 新增 2 条「认屏 id」契约断言，防同类改名再次静默失效 |
| `app.js` | **未改**（`buildDisc()` 与所有交互逻辑零变动） |

## 5. 交互口径确认（要求「保持不变」）

`buildDisc()` 一行未动，所以以下全部与改前逐条相同：

- 点选：扇区 `<g>` 与标签 `<button>` 两处都挂 click，键盘方向键在扇区之间移动并搬 roving tabindex；
- 回显：盘心三态（`当前选择 / 正在看 / 已选定`）、悬停换文案、`.is-swap` 动画触发条件；
- 答案落点：`onPick(item)` → `state.answers.occasion = o.id`（`renderOccasion` 的闭包）；
- ARIA：`role="radiogroup"` + 子项 `role="radio"` + `aria-checked`。

## 6. 遗留问题（不属本次范围，如实报告）

修复后场合屏圆盘在 **1366×768** 下底部与吸底动作条重叠 **59px**，其中的「正式场合 / 日常/居家」
两个标签底部（695px）被动作条（top 683px）盖住。**这不是本次修复引入的**：同一脚本在修复前
量到完全相同的数字（overlap 59px、labelMaxBottom 695px），因为重叠来自布局，与圆盘换不换皮无关。

1440×900 重叠 34px（无标签被盖）、1280×800 重叠 43px（无标签被盖）、390×844 重叠 −1px（不重叠）。

**未在本任务内修**：修它要动吸底条高度或圆盘 vh 系数，属于布局预算调整，会与任务 4 的
「卡片层级与间距节奏」撞车。已记在 `UI-POLISH-20261111.md` 的待办里。


## 7. 复跑方式

```powershell
cd C:\Users\16256\Documents\deepseek-harness\default-workspace\scent-picker
node server.js 8093                 # 另开一个终端，保持运行
node scripts/probe-disc.mjs         # 3 视口 × 明暗 × 2 屏的运行时实测表
node scripts/probe-shot.mjs docs/reviews/shots-20261111/x.png 4 1366 768   # 截场合屏
```

`probe-disc.mjs` 输出的判据（修复后应当全部满足）：

| 项 | 场合屏应有值 |
|---|---|
| `radius` | `50%` |
| `bg` | 浅色 `rgb(250, 247, 241)` / 深色 `rgb(20, 18, 14)`，不是 `rgba(0,0,0,0)` |
| `shadow` | `has`（不是 `none`） |
| `hubPad` | `0px 16px`（不是 `14px 16px`） |
| `strokeW` / `strokeColor` | `4px` / 等于盘底（缝），不是 `1px` 实线 |

若 `radius` 又变回 `0px`，先查 CSS 里的 `data-step` 值 —— 十有八九是步骤 id 又改名了。
`scripts/test-render.mjs` 末尾的「认屏 id」两条断言会在提交前拦住它。

---

**署名** [dsh] 2026-11-11
