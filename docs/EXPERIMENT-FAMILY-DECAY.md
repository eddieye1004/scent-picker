# 实验记录：家族命中按 1/√n 衰减（第 2 步，2026-11-10）

对应 CONTROL.md 执行顺序第 2 步「家族信号修复」。裁决来自 Muse（经 Eddie 批准）：放弃「只按主族计分」，改用 `1/√n` 衰减，n = 该瓶所挂家族数。

**结论：方案弃用。全局命中率反而下降，按裁决第 4 条停手，不回换方向。**

---

## 1. 改前 / 改后基线

金标准 `scripts/test-gold.mjs`，12 画像，香水库 1388 瓶，基线 commit `68dbc18`。

| 衰减指数 p | 衰减系数（n=2/3/4） | MAJORITY（top3 命中≥2） | STRICT（top1） | Δ |
|---|---|---|---|---|
| **0（基线）** | 1.00 / 1.00 / 1.00 | **2/12 = 16.7%** | **4/12 = 33.3%** | — |
| 0.25 | 0.84 / 0.76 / 0.71 | 1/12 = 8.3% | **5/12 = 41.7%** | MAJ −1 · STR **+1** |
| **0.5（裁决方案 1/√n）** | 0.71 / 0.58 / 0.50 | **0/12 = 0.0%** | 3/12 = 25.0% | **MAJ −2 · STR −1** |
| 1.0（1/n） | 0.50 / 0.33 / 0.25 | 0/12 = 0.0% | 3/12 = 25.0% | MAJ −2 · STR −1 |

复跑命令（零副作用，不改任何数据）：

```powershell
cd scent-picker
node scripts/probe-family-decay.mjs          # 四档全跑
node scripts/probe-family-decay.mjs 0 0.5    # 只跑指定档
```

`p=0` 与历史行为逐位一致，生产路径永远走这条。

## 2. 逐画像变化

| 画像 | p=0.25 | p=0.5 | p=1.0 |
|---|---|---|---|
| P02 怕晕白花·日常女生 | — | top3 1→0，top1 ✓→· | 同 p=0.5 |
| P03 温暖约会·秋冬 | top3 0→1，top1 ·→✓ | top3 0→1，top1 ·→✓ | 同 p=0.5 |
| P05 运动清爽·夏天白天 | top3 1→0，top1 ✓→· | top3 1→0，top1 ✓→· | 同 p=0.5 |
| P06 神秘夜晚 | top3 0→1，top1 ·→✓ | top3 0→1，top1 ·→✓ | 同 p=0.5 |
| P09 茶香草本 | — | top3 2→1 | top3 2→1 |
| P11 夏日清凉·讨厌琥珀 | top3 2→1 | top3 2→0，top1 ✓→· | 同 p=0.5 |

p=0.5 与 p=1.0 结果完全相同 —— 衰减在 p≥0.5 后已经饱和，继续加大指数只是把同一批瓶子推得更远，不会改变排序。

## 3. 为什么失败（机械原因，不是「感觉不准」）

被衰减推上前三的三瓶：

| id | families | n | 衰减系数 |
|---|---|---|---|
| `acqua-di-parma-colonia-il-profumo` | citrus 1.0, fresh 0.3 | 2 | 0.707 |
| `frederic-malle-music-for-a-while` | citrus 1.0, fresh 0.3 | 2 | 0.707 |
| `tom-ford-taormina-orange` | citrus 1.0, fresh 0.3 | 2 | 0.707 |

被压下去的 gold：

| id | families | n | 衰减系数 |
|---|---|---|---|
| `mfk-aqua-universalis` | citrus 1.0, **floral 0.5**, fresh 0.3 | **3** | **0.577** |

**衰减惩罚的正是「副族被正确识别」的瓶子。** MFK Aqua Universalis 多挂了一个 floral 0.5，是因为它确实有橙花香（`character: citrusy, floral, fresh, musky`）。在柑橘类画像（P02/P05/P11）里，这个副族对用户是**加分信息**，但 `1/√n` 只看到「挂了 3 族」就把它打到 0.577，反而比只挂 2 族的竞品低 18%。

换句话说：`1/√n` 假设「家族挂得多 = 标签稀释 = 该降权」，但这个假设在金标准上不成立 —— 数据源挂第二、第三个家族时，往往是在陈述真实的复合气味（MFK 的花香、Creed 的果香），不是在凑数。

## 4. 试过但无效的变体

**按「用户偏好非零的家族数」数 n（active 口径）**：动机是认为 count 把「瓶子属性」和「用户偏好」混在一个数里，应该只数用户点过的族。

实测四档数字与 count 口径**逐位相同**。原因：`buildProfile` 产出的 `profile.families` 是**六族全非零的软向量**，不存在「用户只点过一族」的情形：

```
P01 families: woody 0.98 / fresh 0.22 / citrus 0.20 / floral 0.12 / amber 0.07 / gourmand 0.07
P02 families: citrus 0.99 / fresh 0.22 / floral 0.18 / woody 0.18 / gourmand 0.13 / amber 0.10
P03 families: amber 0.98 / floral 0.22 / gourmand 0.20 / woody 0.15 / citrus 0.07 / fresh 0.07
```

六族恒全非零 → active 口径退化成 count。验证后删掉了 `familyDecayMode` 分支（保留无意义的分支是负债，看代码的人会以为它真能切换行为）。

## 5. 保留了什么

- `src/scoring.js` 的 `opts.familyDecay` 开关（默认 0）：为了让本实验**可复跑**，且改前改后必须出自同一份代码。代价是一行三元判断，`p=0` 时 `famDecay = 1`，乘法不改结果。
- `scripts/probe-family-decay.mjs`：四档对比 + 逐画像变化 + 恶化样本。
- `scripts/lib/gold-portraits.mjs`：12 画像抽成共享模块，`test-gold.mjs` 与所有探针读同一份，避免各抄一份而走样（`test-gold.mjs` 从 329 行降到 137 行）。

## 6. 下一步不该做什么

**不要继续调 n 的指数。** p=0.5 与 p=1.0 结果完全一致，说明这条路已经走到底了 —— 无论指数多大，被压的都是同一批「副族真实存在」的瓶子。

诊断（`_probe/q-why.mjs`）已明确：引擎把「主族命中 + 强度 + 冷暖」吃满就赢，`notesAll` 层面的区分基本没参与决策。P01 的 top1 `creed-viking` 145.8 分，理由三条全是家族/强度/冷暖；金标准 5 瓶全掉出 top5，其中 `creed-silver-mountain-water`（茶 + 黑加仑）与 `creed-viking`（薄荷 + 薰衣草）在家族层面同构，引擎分不出来。

第 2 步如果还要继续，方向应该是让 `notesAll` 参与决策，而不是在家族轴上继续加惩罚项。是否转向，等 Muse 或 Eddie 裁决。
