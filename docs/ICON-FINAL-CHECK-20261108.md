# 图标任务收尾核查 · 2026-11-08

> 目的：确认 24 枚图标是否还有未统一 / 未移植的对象，逐项列出；记录本轮清理范围与依据。
> 全部结论来自命令实测，复跑命令附在每节末尾。

---

## 一、检查结果：一致性全绿，三处"形态陈旧"而非"移植遗漏"

### 1.1 三方映射 24/24/24，无缺无余

| 检查项 | 方法 | 结果 |
|---|---|---|
| taxonomy 小类数 | `data/taxonomy.json` 的 `families[].subfamilies[]` | 6 族 / **24** 小类，version 2.2.0 |
| `ART_FILE` 条目 | `app.js:592-617` 正则抽 key→文件名 | **24** 对 |
| 映射缺漏 | `taxonomy - ART_FILE` | `[]` |
| 映射多余 | `ART_FILE - taxonomy` | `[]` |
| 文件名重复 | `len(values) != len(set(values))` | `False` |
| 磁盘缺文件 | `ART_FILE.values() - os.listdir(svg)` | `[]` |
| 磁盘多余文件 | `os.listdir(svg) - ART_FILE.values()` | `[]`（**恰好 24 个 svg，零残留**） |
| `app-art.js` 是否同源 | 两文件的 `ART_FILE` 块逐字符比对 | 完全一致（各 839 字符） |

**结论：没有"尚未统一"或"尚未移植"的图标。** 24 枚上色稿全部落在 `icon-specimen/svg/`，两份 app 文件指向同一张映射表，盘心 100% 走彩图通路。

### 1.2 逐枚终检（`icon-specimen/svg/` 直接审计，不再读中间工作区）

用 `audit_project_svg.py`（复用 `audit24.py` 的路径解析器，口径 `SAFE 3.30–20.70`）：

| key | 文件 | KB | 图元 | 最大描边 | 安全框 |
|---|---|---|---|---|---|
| green-floral | `floral-green-floral.svg` | 28.7 | 29 | 1.00 | OK |
| sandalwood | `woody-sandalwood.svg` | 24.4 | 23 | 0.60 | OK |
| fruity-floral | `floral-fruity-floral.svg` | 23.6 | 19 | 1.00 | OK |
| white-floral | `white-floral-a.svg` | 23.1 | 26 | 0.80 | OK |
| woody | `woody-woody.svg` | 22.6 | 22 | 0.64 | OK |
| tea | `fresh-tea.svg` | 17.7 | 50 | 0.62 | OK |
| fougere | `fresh-fougere.svg` | 17.7 | 12 | 1.00 | OK |
| rose | `floral-rose.svg` | 17.4 | 10 | 0.85 | OK |
| citrus-floral | `citrus-citrus-floral.svg` | 14.9 | 18 | 1.00 | OK |
| vetiver | `woody-vetiver.svg` | 13.9 | 39 | 0.28 | OK |
| soliflore | `floral-soliflore.svg` | 13.2 | 27 | 0.73 | OK |
| green-citrus | `green-citrus-a.svg` | 11.8 | 43 | 0.92 | OK |
| fruity-gourmand | `gourmand-fruity-gourmand.svg` | 10.7 | 12 | 0.90 | OK |
| green | `fresh-green.svg` | 9.8 | 45 | 0.92 | OK |
| vanilla-gourmand | `gourmand-vanilla-gourmand.svg` | 8.8 | 14 | 1.00 | OK |
| powdery-floral | `floral-powdery-floral.svg` | 7.9 | 57 | 0.87 | OK |
| oud | `oud-a.svg` | 6.8 | 16 | 0.72 | OK |
| resinous | `amber-resinous.svg` | 4.8 | 12 | 0.62 | OK |
| leather | `amber-leather.svg` | 4.3 | 31 | 0.92 | OK |
| incense | `amber-incense.svg` | 3.5 | 28 | 0.92 | OK |
| aromatic-citrus | `citrus-aromatic-citrus.svg` | 2.8 | 19 | 1.00 | OK |
| cologne | `citrus-cologne.svg` | 2.6 | 14 | 1.00 | OK |
| aquatic | `fresh-aquatic.svg` | 2.4 | 13 | 0.99 | OK |
| amber | `amber-amber.svg` | 2.3 | 11 | 0.92 | OK |

- **合计 295.5 KB**（预算 24×30 KB = 720 KB，用量 41%）。
- `stroke-width` **全部 ≤ 1.00**，无越界；体积 **全部 ≤ 30 KB**。
- 渲染复核（`gproject.cjs` 600px 单元 → `meas_project.py` alpha 口径）：**24/24 落在安全框内，out-of-safe = 0**。

### 1.3 三处"形态陈旧"，需你裁定（都**不是**移植遗漏）

| # | 对象 | 现状 | 为什么算遗漏 | 建议 |
|---|---|---|---|---|
| ① | `shots/icons-24-runtime.{html,png}` | 48 个 `<svg>` 全是 `fill="none"`、`url(#…)` 出现 **0 次** —— 纯线稿 | 它记录的是 **D58 已整块删除**的线稿通路。文件本身还是"最终交付物"清单成员（`docs/ICON-REDRAW-20261103.md:116`），但它描述的实现已不存在 | **改名归档**为 `icons-24-runtime-DEPRECATED-20261108.{html,png}`，并在 `ICON-REDRAW` 第 116/124 行标注"历史留档，非现行实现" |
| ② | `icon-specimen/preview.html` | 96 个 `<svg>`、标题写「全部 32 枚」，含 `dry-woody`/`woody-aromatic`/`vanilla-amber`/`spicy-amber` 等 **28 类时代**的 key | 它是 32 枚时代的标本页，被 `spec.md:91,95`、`DELIVERY-20261031.md:87,90`、`ICON-REDRAW:124` 当现行验收页引用 | **两步走**：a) 该文件保留作历史（体积 926 KB 且引用密集，删了会打断 4 篇文档的链路）；b) 用现有 `icon-specimen/svg/` 重建一版 `icon-specimen/preview-24.html`（24 枚 × 88/36/210/76 四档），作为**现行**验收页 |
| ③ | `styles-klein.css`（14.4 KB） | 只被 `docs/DECISIONS.md` 提到，两份 html 都**没加载**它 | 孤儿文件，属历史设计分支（克莱因蓝定稿） | 移到 `docs/archive/` 或直接删（DECISIONS 里已有文字记录） |

### 1.4 文档陈旧一行（已修）

`docs/TODO-REMAINING.md:13` 的 A3 关闭证据原文写「`SUB_MARKS`/`SUB_FIT`/`taxonomy` 24/24/24 双向差集为空」—— 这两个常量已在 D58 删除。**已改写**为：

> taxonomy 同步为 2.2.0 / 24 类；2026-11-08 起盘心改用上色 SVG，`ART_FILE`/`taxonomy`/`svg/` 三方 24/24/24 双向差集为空（旧的 `SUB_MARKS`/`SUB_FIT` 已随线稿通路整块删除，见 D58）

其余 4 篇提到 `SUB_MARKS` 的文档（`DECISIONS.md` 16 处、`ICON-REDRAW-20261103.md` 3 处、`REQUIREMENTS-TRACE.md` 1 处、`SUB-MARKS-REPLACE-20261101.md` 3 处）都**已明确标注为废弃/删除**，属正确记述，不动。

### 1.5 代码层残留：零

| 符号 | 在 `app.js` / `app-art.js` 的命中 |
|---|---|
| `SUB_MARKS` | 仅 **1 处，在注释里**（`app.js:672` 说明"已删"） |
| `SUB_FIT` | 同上 |
| `PLATE_MOTIFS` | 同上 |
| `PLATE_FALLBACK` / `PLATE_SW` / `r2()` | **0** |

`node --check` 两份均 **exit 0**；`scripts/test-render.mjs` **PASS 246 / FAIL 0**。

### 1.6 复跑命令

```powershell
$P = "C:/Users/16256/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe"
$N = "F:/deepseek/resources/runtime/primary-runtime/dependencies/node/bin/node.exe"
cd C:/Users/16256/ego/demo
& $P check_final.py          # 三方映射 + 磁盘文件 + 体积/描边
& $P audit_project_svg.py    # 逐枚安全框 / 描边档 / 图元数
& $N gproject.cjs _proj24.png; & $P meas_project.py   # 渲染口径复核
cd C:/Users/16256/Documents/deepseek-harness/default-workspace/scent-picker
& $N scripts/test-render.mjs; & $N scripts/test-contrast.mjs; & $N scripts/test-scoring.mjs; & $N scripts/test-compliance.mjs
& $N scripts/build-css.mjs --check
```

---

## 二、清理清单

### 2.1 已执行（本轮）

**A. `C:/Users/16256/ego/demo/`：3707 MB → 24.6 MB**

| 轮次 | 对象 | 数量 | 回收 | 判据 |
|---|---|---|---|---|
| 1 | `udd_*` 目录 | 337 个 | 3.5 GB | 内含 **0 个** `.py/.cjs/.mjs/.svg`，只有 Chrome profile 的 `.bin/.db/.log/.png/.json` —— 纯无头浏览器临时档 |
| 1 | 已淘汰中间稿目录 | 30 个（`m12*` / `r6–r14` / `c12*` / `dry*` / `p60/p61` / `diag` / `svgold` / `v4` / `w3/w4/z1` 等） | 160 MB | 每轮候选渲染，最终稿已进 `cur24/` 与项目 |
| 2 | `patch*.py` + `patch*.cjs` | 98 个 | 少量 | 每个只改过一版生成器，结果已固化进 `icons3.py`/`icons4.py`/`next10d.cjs`/`gen_or.py`/`vetvar48.py`。**保留 `patch22.cjs`**（`DELIVERY-20261031.md:84` 当可复跑命令引用） |
| 2 | 中间渲染页 / 整版 png | 38 个 | 20 MB | `_g24*` / `_m*` / `_proj*` / `_vc*` / `zoom24.html` / `dark_mode_options.html` / `picked_state_probe.html` |

- 清单落盘：`C:/Users/16256/ego/demo/CLEANUP-MANIFEST-20261108.txt`（367 行，逐目录 文件数 + 字节）。
- **保留**：`cur24/`（24 枚工作源）、`next10/`（85）、`next10v/`（77，含香根草最终稿 `vet-t3zb.svg` 出处）、`v9icons/`（24，v9 基线）、全部生成器与校验脚本。

**B. `scent-picker/docs/TODO-REMAINING.md:13`** —— 陈旧证据句改写（见 1.4）。

**C. 源码内死代码：`autoNext(ms)`**

- 定义在 `app.js:2819` 与 `app-art.js:2800`，全项目（含 `scripts/`、`docs/`）**零调用点** —— 我机械扫过 59 个函数定义，只有它 `uses <= 1`。
- 已删（含 6 行注释）：`app.js` 189479 B、`app-art.js` 170993 B；`node --check` 均 0；`test-render.mjs` 仍 246/0。
- 删它的理由不是"省 330 字节"，而是**它是一段会误导人的注释**：说明里写着"点选即自动前进"，但产品最终没有自动前进，读者会以为这是现行交互。

### 2.2 建议清理但**未动**，等你点头

| 对象 | 体量 | 为什么没直接删 |
|---|---|---|
| `scent-picker/data/.cache/photos-raw/*.bin` | **2320 个 / 378 MB** | 是 `scripts/build-photo-set.mjs:77` 的下载暂存。成品已剪成 370 张 webp 在 `images/`，但删掉后**重建图集必须重新下载全部候选图**（外部请求 + 时间）。`data/.cache/` 已在 `.gitignore:15` |
| `scent-picker/data/.cache/union-api.json` | 17.5 MB | `scripts/fetch-products.mjs:48` 的断点缓存，删了要重新拉 17 MB |
| `scent-picker/_audit/` | 32 文件 / 0.9 MB | 28 类时代审计，但 `CLASSIFICATION-AUDIT-20261031.md` 被 `taxonomy.json` 与 `DECISIONS.md` 引用，`colored-legacy.html` 被 `CONFLICTS-AND-PLAN.md` 引用 |
| `scent-picker/shots/` 40 个文件里 7 个历史件（`icons-16-*`/`icons-28-overview.png`/`marks12*`/`icons-preview.png`） | ~1.7 MB | 均被文档具名引用 |
| `styles-klein.css` | 14.4 KB | 见 1.3 ③ |
| `v6-verified.json` | 7.5 KB | 全项目零引用，像是某次验证的快照 |

**`scent-picker/` 总量 415 MB，其中 396 MB 是 `data/.cache/`** → 清掉该目录即降到 **19 MB**（这还是含 370 张 webp 与 24 枚 svg 的体积）。

### 2.3 `styles.css` 的冗余（属于下一步 UI 优化，先记账不动）

由 `scripts/build-css.mjs` 从 `styles/src/` 21 层拼装（`base.css` + `_wheel4..21` + `_plate.css`），当前 **191364 字节 / 6306 行**，与源层一致（`--check` 通过）。

| 项 | 数量 | 明细 |
|---|---|---|
| 定义了但没被 `var()` 用的自定义属性 | 5 | `--accent-soft` `--radius-lg` `--sec-fs` `--sh-card` `--stroke-l2-w` |
| CSS 里有规则、全项目找不到的元素 class | 9 | `arc-zh`(L5731) `sub-arc-label`(L5730) `ring-guide`(L1124) `hub-reset`(L1235,1251) `is-dim`(L1184-1185) `sub-arm`(L1763,1767) `sub-sq`(L1767,1779) `is-wide`(L1221,1569) `mid-layer`(L1189,1197) |
| `@media` 块 | 73 | 断点 12 种：380/400/420/620/720/621-1000/1000+ + hover/pointer/深色/减动效 |
| 同名选择器被声明 ≥4 次 | 17 组 | 最高 `.wheel .sub-arc` **11 次**、`.wheel .disc-hub` **8 次** |
| `!important` | 7 | — |
| `transition` 声明 | 68 | — |
| `@keyframes` | 31 | — |

> 注意：上表 9 个 class 里 `hub-reset`/`sub-arm`/`sub-sq`/`is-wide` 在 `scripts/test-render.mjs`、`test-contrast.mjs`、`qa-7step.mjs`、`sloplint-baseline.json` 里被**具名断言**过。删 CSS 前必须先改测试，否则 246 断言会红。

---

## 三、一句话结论

**24 枚图标已经统一、已全部移植、代码零残留**；剩下三处是"记录陈旧"（线稿总览页、32 枚标本页、克莱因蓝 css），不是功能缺口。清理已回收 **3.7 GB**，还有 **396 MB** 可回收但需要 rebuild 成本，等你决定。
