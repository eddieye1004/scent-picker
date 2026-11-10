# 第 3 步实验：稀疏 character 标签（2026-11-10）

> 对应 `CONTROL.md` 执行顺序第 3 步「处理稀疏 character 标签（leathery/rich/salty/clean 等长尾）」。
> 纪律同第 2 步：先立可复跑测量，再改，改前改后数字入 commit。
>
> **结论先行：四档改动全部无效或更差，生产路径不动。** 但这轮量出了一件更重要的事——
> character 因子在前 20 名里已经饱和（11/12 画像的 top20 全部满分），
> 它不是推荐排序的杠杆。真正的杠杆是 family（平均 +5.80 分，7/12 画像由它决定胜负）。

## 一、要解决的是什么

`CONTROL.md` §2 的体检结论之二：气质标签稀疏。
全库 1388 瓶 / 21 个标签，频率如下（`scripts/probe-character-sparse.mjs`）：

```
843 60.7% floral     739 53.2% warm      543 39.1% citrusy   494 35.6% fresh
393 28.3% sweet      370 26.7% spicy     343 24.7% fruity    340 24.5% woody
245 17.7% earthy     237 17.1% creamy    228 16.4% herbal    178 12.8% powdery
151 10.9% resinous   107  7.7% musky     103  7.4% green      72  5.2% amber
 55  4.0% smoky       23  1.7% clean      22  1.6% salty      13  0.9% leathery
  4  0.3% rich
```

稀疏（< 60 瓶）：smoky 55 / clean 23 / salty 22 / leathery 13 / rich 4。

## 二、先量清楚：打分路径与被抹平的命中个数

`probe-character-sparse.mjs` 对 12 画像 × 1388 瓶统计 character 因子的三种结果：

| 路径 | 瓶数 | 占比 | 含义 |
|---|---|---|---|
| `tag` | 7344 | 44.1% | 硬命中，拿满 16 分 |
| `family` | 481 | 2.9% | 软回退，最高 9.6 分 |
| `none` | 8831 | 53.0% | 0 分 |

硬命中时「命中了几个 wantTag」的分布：

| 命中个数 | 瓶数 | 占比 |
|---|---|---|
| 1 个 | 5415 | 73.7% |
| 2 个 | 1855 | 25.3% |
| 3 个 | 74 | 1.0% |

**这三档拿一样的分。** 现有实现是 `wantTags.find(...)` —— 只取第一个命中就
`cScore = WEIGHTS.character`。「同时带 fresh + woody + clean」与「只带 fresh」
在打分上完全等价。

## 三、四档实验（`scripts/probe-character-mode.mjs`）

四档都由 `opts` 开关驱动，生产路径不传、行为逐位不变
（与第 2 步的 `familyDecay` 同一套做法：改前改后必须出自同一份代码）。

| 档位 | 做法 |
|---|---|
| `''` 基准 | 现状 |
| `multihit` | 每多命中一个 wantTag 加 25%，上限 1.5×（16 / 20 / 24） |
| `density` | 按 wantTags 覆盖比例：16 × (hits / wantTags.length) |
| `sparse` | 稀疏标签的软回退上限 0.6 → 1.0 |
| `fixed` | 换用 `CHARACTER_FAMILY_FIXED`（见下节） |

实测（12 画像 × 1388 瓶，走 `recommend()` 全链路）：

| 档位 | MAJORITY | STRICT | Δ |
|---|---|---|---|
| (基准) | 2/12 = 16.7% | 4/12 = 33.3% | — |
| multihit | 1/12 = 8.3% | 2/12 = 16.7% | MAJ −1 · STR −2 |
| density | 1/12 = 8.3% | 2/12 = 16.7% | MAJ −1 · STR −2 |
| sparse | 2/12 = 16.7% | 4/12 = 33.3% | 0 / 0 |
| fixed | 2/12 = 16.7% | 4/12 = 33.3% | 0 / 0 |

恶化样本（multihit / density 同）：P09 丢掉 `creed-green-irish-tweed`，
现 top3 = `bond-no-9-brooklyn` / `jo-malone-wood-sage-and-sea-salt` / `azzaro-chrome-toilette`。
另 P05 与 P09 的 top1 从命中变成不命中。

## 四、为什么全都改不动：这一项已经饱和

`scripts/probe-char-weight.mjs` 量了两件事。

**（1）杠杆测试**：把 character 项乘 k 倍后重新排序（对照是同一个简化模型的 k=1，不是
`recommend()` —— 第一版拿 `recommend()` 当基准，k=1 就报「9/12 变化」，那 9 个全是
模型差异，不是杠杆）：

```
k= 1×  变化 0/12
k= 2×  变化 0/12
k= 4×  变化 0/12
k= 8×  变化 0/12
k=16×  变化 0/12
```

放到 16 倍，排序一瓶都不动。

**（2）饱和测量**：top20 里拿满 16 分的比例：

| 画像 | top20 满分 | top3 的 character 分 | gold 的 character 分 |
|---|---|---|---|
| P01–P09, P11, P12 | **20/20** | 16/16/16 | 16/16/16/16/16 |
| P10 | 9/20 | 16/16/16 | 16/16/16/16 |

**12 个画像里 11 个的前 20 名在这一项上完全打平。** 对一个「大家都在 16 分」的项，
换任何算法都只是打破平局，不会带来信息增量——这正是四档实测结果的机械解释。

**（3）那分差是谁拉开的**：把 top1 与「最好的那瓶 gold」按因子拆开
（12 画像平均，`probe-char-weight.mjs`）：

| 因子 | 平均分差（top1 − gold） | top1 赢的画像数 |
|---|---|---|
| **family** | **+5.80** | 7/12 |
| intensity | +1.31 | 4/12 |
| temperature | +0.88 | 1/12 |
| popularity | −1.15 | 0/12（gold 赢 5 次） |
| **character** | **0.00** | 0/12 |

character 的分差恒等于 0.00。family 是唯一系统性拉开差距的因子。

## 五、`CHARACTER_FAMILY` 的两处静态缺陷（已修，但无收益）

读码时发现两个与数据不符的地方，都属于「表写错了」而不是「设计选择」：

| 标签 | 旧表 | 实测（该标签瓶子的家族均值） | 问题 |
|---|---|---|---|
| `leathery` | `{woody:.8, amber:.9, smoke:.3}` | woody .32 / amber .40 / floral .17 | **`smoke` 不是合法家族键**（六族是 citrus/floral/woody/amber/fresh/gourmand）。分母算它、分子永远取 0，导致软回退上限只有 **0.850**，其余 20 个标签都是 1.000 |
| `clean` | `{fresh:1, citrus:.6, floral:.4}` | floral .37 / fresh .24 / woody .12 | 第一族写成了 fresh，实测 floral 最高 —— 软回退把 clean 指向了错的族 |

修正版 `CHARACTER_FAMILY_FIXED` 只改这五个稀疏/错向的条目，其余 16 个不动
（它们没有实测反例，动了就是拿推断替换经验值）。

**修正后命中率无变化（2/12 · 4/12，0/0）** —— 因为它在饱和项上，改了也不影响排序。
但缺陷本身是事实，已按 `opts.characterFamily === 'fixed'` 保留在代码里并加了断言
（`test-scoring.mjs` C4/C5/C6），供以后 character 真正参与排序时直接启用。

## 六、保留物

| 文件 | 作用 |
|---|---|
| `scripts/probe-character-sparse.mjs` | 标签频率 / 打分路径 / 命中个数 / 稀疏落差，零接口 |
| `scripts/probe-character-mode.mjs` | 五档实验，走 `recommend()` 全链路 |
| `scripts/probe-char-weight.mjs` | 杠杆测试 + 饱和测量 + 因子分差分解 |
| `src/scoring.js` 的 `opts.characterMode` / `opts.characterFamily` | 两个开关，默认关，生产逐位不变 |
| `scripts/test-scoring.mjs` C1–C6 | 守开关接线与默认路径不变 |
| `CHARACTER_FAMILY_FIXED` | 修正表，等 character 有杠杆时再用 |

## 七、下一步不该做什么

1. **不要再调 character 的算法**（多命中加权 / 覆盖比例 / 稀疏加权都试过，全部 ≤0）。
   它饱和了，改它只在打破平局，而且实测打得更差。
2. **不要再增大 character 的权重**。k=16 都动不了排序，说明这个项在 top20 内部
   差异为零，加权重只会让 0 变大，不会让 0 变成差异。
3. 该转向的是 **family**：它是唯一系统性拉开分差的因子（平均 +5.80，7/12 画像
   由它决定）。但第 2 步已经证明「按所挂家族数衰减」是错的方向——真正的问题
   可能是族内判别（`categoryGate` / `boundaryPenalty` 那套 rules 只用了互斥一条），
   或者主族判定本身（`familySource` 单值 vs `families` 多值的取舍）。
   这需要单独一轮测量，不在第 3 步范围内。

## 八、验收

八套全绿，生产路径逐位不变：

```
test-render    274
test-contrast   42
test-scoring   138  (132 → 138，新增 C1–C6)
test-compliance 10
test-union-api  76
test-category-gate 10
test-jd-web     17
test-gold       GOLD MAJ 2/12  STRICT 4/12   （与改动前完全相同）
```

`test-scoring` 的 6 条新断言守的是「开关接到了」与「默认路径没变」，
不是「某一档更好」——四档全都更差或持平。
