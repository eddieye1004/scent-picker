# 轮盘实测归档：连点闪烁、幽灵态、图标库调研

> 2026-11-01 归档。本文把三轮实测的结论从对话里落成文档 —— 那些数据只在
> 会话上下文里存过一次，压缩后就没了。
> 每条都注明**当时的实测方法**与**后续是否已修**，方便判断哪些还能复跑。

---

## 一、C1 · 点开花香调后快速连点三个大类，中圈有没有重影

**结论：没有重影，但有 130–200ms 的黑闪。**

### 重影：不存在

| 检查项 | 实测结果 |
|---|---|
| DOM 里 `.sub-ring` 数量 | 恒为 **1** |
| 弧段数 | 随大类变化（7→5→5→4），与当前大类一致 |
| `.is-on` / `aria-checked` 数量 | 恒为 **1** |
| `ghostRingWithExit` | **0**（没有退场中的残留环） |
| 标签错位 | 无 |

### 但 60ms 级连点会黑闪

| 时刻 | 新弧段的 opacity |
|---|---|
| c2 + 60ms | min = max = **0.00** |
| c3 + 60ms | 仍 **0.00** |
| c4 + 130ms | 才回到 0.91–1.00 |

**成因**：每次重建弧段，新节点的 `arcSlideIn` 从 `opacity: 0` 起播。
连点时前一次的动画还没走完，新一批又从 0 开始 —— 中圈整体读成"黑了一下"。

**已修**（提交 `362c7d7`）：动画链路重做，`ringGrow` 的 `60%{opacity:1}`
被移除（它在 252ms 就全亮、先亮完再变大），弧段入场改成与容器同步。

**复跑方法**：`C:/Users/16256/ego/flash.cjs`（CDP rAF 采样弧段 opacity 区间）。

---

## 二、C2 · 大圈退幽灵态的动效

**结论：动效本身跑对了，但「幽灵态」这个设计被实测推翻。**

### 动效轨迹（rAF 采样，1440px）

| 时刻 | `sector-g` opacity |
|---|---|
| 12ms | 1.00 |
| 121ms | 0.899 |
| 221ms | 0.566 |
| 371ms | 0.302 |
| 421ms | 0.30 |

到 780ms 摘类时末帧已回 identity，**无跳帧**。

### 缺陷 A：D40 写的「当前大类恒为 1」是错的

`.wheel.is-open .sector-g.is-on{opacity:1}` 被 `animation` 覆盖 ——
`animation` 优先级高于普通声明，于是**当前大类也一起退到 0.30**：

| 时刻 | 当前大类的 opacity |
|---|---|
| 80ms | 0.898 |
| 300ms | 0.336 |
| 600ms | 0.30 |
| 800ms | 才跳回 1（`is-lifting` 被摘掉时） |

### 缺陷 B：幽灵态让六族退成同一种灰

六族填充在 `r=164–176` 环带的均值：

| 族 | 闭合态 | 幽灵态（强制 opacity:1 复原） |
|---|---|---|
| citrus | #f8f9e7 L\*97.44 | 复原后 L\* 极差 5.78 |
| floral | #f9edf3 L\*94.77 | |
| woody | #e7e0d7 L\*89.46 | |
| amber | #f2e9d6 L\*92.51 | |
| fresh | #e8f3ee L\*95.05 | |
| gourmand | #f9f2e9 L\*95.80 | |
| **极差** | **7.98** | 幽灵态统一压成冷灰 L\*91.66–96.52，**极差 5.14** |

环向 L\* 跳变数（r=212）：闭合态 **61** → 幽灵态 **19**。
即 opacity .30 抹掉了色相，六块退成同一种灰，只剩描边与缝可分。

**已修**（提交 `55febf5`）：幽灵态改成 `opacity: 0`（大圈真消失），
`pointer-events` 保持 `auto`（消失与可点是两件独立的事），
hover/聚焦浮回 1。

**复跑方法**：`C:/Users/16256/ego/ghostpix.cjs`（取色）、`gp2.cjs`（六族环带均值+ΔL\*）、
`bound.cjs`（环向 L\* 扫描数跳变）。

---

## 三、C3 · 小类图标库调研（6 个候选库）

**结论：不接入任何现成库。它们都是通用 UI 图标，缺香材语义。**

### 调研结果（2026-10-30 实测访问）

| 库 | stars | 许可 | 网格/线宽 | 覆盖情况 |
|---|---|---|---|---|
| [lucide](https://github.com/lucide-icons/lucide) | 25,383 | ISC | 24×24 / 2px rounded | flower、leaf、sprout、tree-pine、droplet、citrus、grape、cherry、coffee、cup-soda、flask-conical、spray-can、wind、sun、moon、flame、snowflake 均存在（逐一 200 验证）；**perfume 不存在（404）** |
| [tabler-icons](https://github.com/tabler/tabler-icons) | 22,503 | MIT | 24×24 / 2px | **perfume / spray / flower / leaf / coffee / droplet 均存在** |
| [heroicons](https://github.com/tailwindlabs/heroicons) | 23,890 | MIT | 24×24 / **1.5px** round | 316 枚，通用 UI 类，无香材特殊图标 |
| [iconoir](https://github.com/iconoir-icons/iconoir) | 4,611 | MIT | 24×24 / **1.5px** | 1,671 枚 |
| [phosphor](https://github.com/phosphor-icons/core) | 395（core 仓） | MIT | 256×256 / **填充路径** | 六档权重，每档 1,512 |
| [game-icons.net](https://game-icons.net/) | 1,367 | **CC BY 3.0（需署名）** | 512×512 / 填充 | 4,180 枚，风格厚重游戏化 |

### 为什么不接入

1. **lucide / tabler / heroicons / iconoir 都是通用 UI 图标库，缺香材语义。**
   能用的只有 flower/leaf/citrus 这类泛化形状 —— 接入等于把 24 枚香材专属线稿
   换回通用符号，与 D32（图案编码家族/小类语义）、D38（同族不撞形）方向相反。
2. **phosphor / game-icons 是填充图形**，接入会同时推翻「无填充 + 统一线宽 0.7」
   的现有线稿体系（D32 的材质感结论）。
3. 项目硬约束是零依赖、离线可用 —— 引入图标库要么 vendored（体积翻倍），
   要么走 CDN（破离线）。

### 当时的替换方案

自绘。`spec.md` 记录了从 9 枚范本反推的七条统一规则（造型/圆头/双色/层次/
纹理/留白/禁止项），后续按规则批量绘制。

**资料来源**：以上 stars 与许可均为 2026-10-30 直接访问仓库页面所得，
未经过第三方聚合站。**已核实**。

---

## 四、复跑脚本清单（均在 `C:/Users/16256/ego/`）

| 脚本 | 用途 |
|---|---|
| `flash.cjs` | 连点时弧段 opacity 区间采样 |
| `ghostpix.cjs` | 520px 截图取色 |
| `gp2.cjs` | 六族环带均值 + ΔL\* |
| （环向 L\* 扫描已并入 `gp2.cjs`；原 `bound.cjs` 未留存） | 环向 L\* 扫描数跳变 |
| `collide.cjs` | 字形框交叉检测（hub×sub / sub×sub / sub×fam） |
| `breath.cjs` | 盘心竖向留白占比 |
| `iou.cjs` | 64×64 掩膜两两 IoU |
| `marksheet.mjs` / `platesheet.mjs` | 图标对照表 SVG/PNG（`ink.cjs`、`sheet.cjs`、`render_sheet.cjs` 未留存） |
