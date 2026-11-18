# 实验记录：引擎池门 v2（探索位 + 多样性缺口闸门，2026-11-18）

> 对应 `docs/EXPERIMENT-DOMINANCE.md` 的后续：那份实验证明「放宽准入」掉命中率（MAJ −1），
> 并把「27 瓶被挡的 gold 不是杠杆」钉在了地上。本轮换了个问题：**既然放宽准入无效，
> 那能不能在引擎自己没兑现多样性承诺时，只补一位？**
>
> **结论先行：已落为生产默认（`dominanceMode` 不传时生效），但命中率 ±0。**
> `GOLD MAJORITY 2/12 · STRICT 4/12` → **2/12 · 4/12（delta ±0）**；42 用例第 1 位变 **0** 例、
> 第 2 位变 **0** 例、第 3 位变 **5** 例。**本改动不提升命中率，也不降低命中率**，
> 它买的是「top3 的源家族种类 +1」，代价是第 3 张卡的显示匹配度下降 15–19 个百分点（§5）。
>
> 落在 `src/scoring.js:1048-1157`（探索位段，含注释）与 `:1117`（`pass1Filled` 记账），
> 断言 `scripts/test-scoring.mjs` E10/E11/E11b/E12。

---

## 1. 要解决的问题不是「排序错了」

第一轮多样性过滤（`src/scoring.js:1102-1117`）的判据是**源家族互异 且 品牌互异**，
注释自己写着「同一源家族、同一品牌都不许占满前三」。但这条承诺在三个族里**结构上无法兑现** ——
它们的 strict 池里 `familySource` 几乎只有一个值，第一轮永远填不满 3 席。

所以 P11 的基线三张卡全是 `Sunlit Citrus`，第 3 席本来就是「同源家族重复的妥协位」。
**问题不是「第 3 席分数不够高」，是「第 3 席根本没在履行多样性职责」。**

### 1.1 结构性根因（实测，`data/perfumes.json` 1388 瓶 + 当前 `taxonomy.json`）

| family | strict 池 | `familySource` 种类 | 最大占比 |
|---|---|---|---|
| citrus | 117 | **1** | Sunlit Citrus 100% |
| gourmand | 142 | **1** | Velvet Sweet 100% |
| woody | 243 | 2 | Wood & Root 98% |
| fresh | 162 | 3 | Green Leaf 88% |
| amber | 191 | 3 | Spice Route 60% |
| floral | 533 | 4 | White Bloom 41% |

→ `kinds < 3` 的三族（citrus / gourmand / woody）**必然**出现缺口；后三族不是。

---

## 2. 规则（伪代码级，可逐字对照实现）

```
EXPLORE = 2                                   # 0-based；生产 topN=3 的最后一席

# 段 1：三层池与降级链（原逻辑一行不动，只在 L1 支记下 strictPool）
L1 = scored.filter(entersFamilyPool(p, fam, domMode))
L2 = scored.filter(w(fam) >= 0.5)
if len(L1) >= topN:  ranked = strictPool = L1
else:                ranked = (L2 if len(L2) >= topN else scored); strictPool = None

# 段 2：候选准备（判据复用 entersFamilyPool，不另写第二份）
effMode = domMode in {'strict','relaxed','any'} ? domMode : 'strict'    # 拼错退回 strict
relaxedTail = []
if strictPool and topN > EXPLORE and effMode == 'strict':
    relaxedTail = [s for s in scored  if s not in set(strictPool)
                                       and entersFamilyPool(s.perfume, fam, 'relaxed')]

# 段 3：多样性三轮（逻辑一行不动，pass1 后多记一个数）
pass1 -> picked ; pass1Filled = len(picked)     # 第一轮：源家族互异 + 品牌互异
pass2 -> picked                                 # 允许同源家族，仍禁同品牌
pass3 -> picked                                 # 兜底填满

# 段 4：探索位插入（唯一新增行为）
if relaxedTail and pass1Filled <= EXPLORE and len(picked) > EXPLORE:
    usedBrand = { picked[i].brand        for i in 0..EXPLORE-1 }
    usedFam   = { picked[i].familySource for i in 0..EXPLORE-1 }
    cand = first s in relaxedTail  with s.brand not in usedBrand
                                    and s.familySource not in usedFam
    if cand: picked.insert(EXPLORE, cand) ; picked = picked[:topN]
```

### 2.1 三条可证明的性质

1. **前两席逐位不变**：插入点在 index 2，`picked[0]`/`picked[1]` 的对象与相对顺序不受影响。
   硬约束「第 1/2 位一分不掉」是**结构性成立**，不依赖数据（实测正序/逆序各 0/42 例第 1 位变化）。
2. **闸门 = 多样性缺口本身**：`pass1Filled < 3` 意味着前三席必有源家族或品牌重复（pass1 的判据就是两者都互异）。
   而候选的 `familySource` 还要求不落在前两席已用集合里 → **生效时 top3 源家族种类必然 +1**
   （实测 5/5 例：P02/P05/P11 1→2，P01/P08 2→3）。规则不是「放宽准入」，是用 relaxed 池
   补上引擎自己没兑现的多样性承诺。
3. **不引入新阈值**：`EXPLORE=2` 来自生产 `topN=3`（`app.js:3109/3113/4300`）；
   relaxed 判据复用 `entersFamilyPool(...,'relaxed')`（`w ≥ 0.5 且 w ≥ 0.5·w_max`）。
   没有新增魔数、没有改 `WEIGHTS`、没有改 `data/taxonomy.json`。

**为什么闸门用 `pass1Filled <= EXPLORE` 而不是「分差 ≤ X 才插」**：分差阈值在本数据上等于关掉功能 ——
实测 5/5 例的分差都 ≥ 25.7 分（见 §4），任何 `X < 25` 的阈值都会让功能 0 生效。

### 2.2 边界行为（全部实测，非推断）

| 情形 | 行为 |
|---|---|
| `topN < 3` | 段 2 条件不成立，逐位等于基线（P11 `topN=1/2` 与 base 全同） |
| 池降级支（L2 / 全库） | `strictPool = null` → 不生效（兜底语义不许再动一次） |
| 情绪入口（`profile.family` 为空） | 不生效（30/30 组零变化） |
| 显式 `dominanceMode: 'relaxed' \| 'any'` | 不生效：该档池子本来就含 relaxed 瓶，再插是空操作 |
| `dominanceMode` 拼错 | 按 `strict` 处理，与 `entersFamilyPool` 的「拼错不能变成放行一切」同口径（E7/E9 守） |
| 香水库逆序 | 命中率不变（§6） |

---

## 3. 被排除的三个方向（都实测过，留证）

| 变体 | 规则 | 实测 | 判定 |
|---|---|---|---|
| v1 按分数合并 | pass1/2/3 都走 strict∪relaxed | 42 用例变 5、MAJORITY **1/12**、E8 FAIL | 证伪 |
| v1' strict 排完再排 relaxed | 同上，仅换序 | MAJORITY **1/12** | 证伪 |
| **B** pass1 只走 strict，pass2/3 合并分数序 | relaxed 只在补位轮竞争 | 42 用例变化 **0**、relaxed 进第 2/3 位 **0/12 画像** | **假功能**（本轮复跑确认：0 例变化、0/12） |

**v1 为什么掉分**：relaxed 瓶恰好带着**不同的 `familySource`**，在第一轮就满足「源家族新颖」判据、
抢到第 2 席 —— 于是前两席进了 relaxed 瓶，MAJORITY 掉 1。执行腿说的「插队成功」准确，
但插队入口是**第一轮的源家族新颖度判据**，不是分数。

**变体 B 为什么是空操作**：strict 瓶带满家族项（`familyPick 34 + subfamilyHits 18`），
relaxed 瓶（所选族权重 0.5 vs 1.0）在这一项先天落后约 21 分，实测探索位候选比它要替换的
strict 瓶低 **11.2–29.6 分**。所以任何「让 relaxed 与 strict 在补位轮按分数公平竞争」的写法
都不会触发。**功能只能靠位次保留满足，不能靠分数竞争满足。**

**E8 为什么不用改断言**：E8 要证的是「`dominanceMode` 真的接到了过滤层」。v1 让默认档输出与
显式 relaxed 档逐位相同（开关空转）才导致它红 —— 那是 v1 的形态缺陷。v2 只在第 3 席插一瓶，
显式 relaxed 档把整池从 117 瓶换成 266 瓶，两档必然不同（实测 v2g1：默认
`mfk-aqua-universalis, creed-silver-mountain-water, bvlgari-imperial` vs 显式
`mfk-aqua-universalis, bvlgari-imperial, azzaro-chrome`）。E8 语义因此更准确：
区分「默认档的窄口补位」与「显式档的整池放宽」。**E8/E9 原文一字未改。**

---

## 4. 五个变化用例逐个明细（实测）

口径：12 金标画像 + 30 组「情绪×场合」共 42 用例，`topN=3`。变化恰 5 例，**全在位次 3**。

| 用例 | 基线 top3 | v2 top3 | 位次 | gold 命中 | 源家族种类 | 第 3 席：出 → 进（分差） |
|---|---|---|---|---|---|---|
| **P01** | creed-viking, armaf-eter-desert-breeze, fugazzi-parfum-1 | 同前两席 + **dolce-gabbana-k-by-dolce-and-gabbana** | 仅 3 | 0 → 0 | 2 → 3 | fugazzi-parfum-1（S／144.9／Wood & Root 96%）→ dg-k（r／118.3／Green Leaf，woody=0.5 主导 fresh=1），**26.6** |
| **P02** | mfk-aqua-universalis, creed-acqua-fiorentina, atelier-cologne-orange-sanguine | 同前两席 + **viktor-rolf-spicebomb-night-vision** | 仅 3 | 1 → 1 | 1 → 2 | atelier-cologne-orange-sanguine（S／132.5／Sunlit Citrus）→ spicebomb-night-vision（r／106.8／Green Leaf，citrus=0.5 主导 fresh=1），**25.7** |
| **P05** | mfk-aqua-universalis, nicolai-cologne-sologne, orto-parisi-bergamask | 同前两席 + **bvlgari-eau-parfumee-the-imperial** | 仅 3 | 1 → 1 | 1 → 2 | orto-parisi-bergamask（S／158.0／Sunlit Citrus 97%）→ bvlgari-imperial（r／130.6／Green Leaf，citrus=0.5 主导 fresh=1），**27.4** |
| **P08** | widian-black-ii, armaf-eter-desert-breeze, prada-les-infusions-iris | 同前两席 + **ajmal-kuro** | 仅 3 | 0 → 0 | 2 → 3 | prada-les-infusions-iris（S／150.4／Wood & Root 96%）→ ajmal-kuro（r／120.8／Amber & Resin，woody=0.5 主导 amber=1），**29.6** |
| **P11** | mfk-aqua-universalis, creed-silver-mountain-water, nicolai-cologne-sologne | 同前两席 + **bvlgari-eau-parfumee-the-imperial** | 仅 3 | **2 → 2** | 1 → 2 | nicolai-cologne-sologne（S／159.6／Sunlit Citrus 96%）→ bvlgari-imperial（r／133.8／Green Leaf），**25.7** |

S = strict 瓶，r = relaxed 瓶，分差 = 被换下瓶的分数 − 换上瓶的分数。

其余 37 例（P03/P04/P06/P07/P09/P10/P12 + 30 组情绪入口）**逐位全同基线**。

**为什么命中率 ±0 是结构性的，不是运气**：P09 与 P11 是仅有的两个 MAJORITY 通过画像，
两者的 gold 都在第 1/2 席，被换掉的 `nicolai` / `azzaro` 都不是 gold → MAJORITY 2/12 保持；
第 1 席从未被动 → STRICT 4/12 保持。

---

## 5. 必须记下的代价（实测，不美化）

**第三张卡的显示匹配度下降 15–19 个百分点：**

| 用例 | 第 3 席匹配度 | 下降 |
|---|---|---|
| P01 | 96% → 79% | −17 |
| P05 | 97% → 80% | −17 |
| P08 | 96% → 77% | −19 |
| P11 | 96% → 81% | −15 |
| P02 | 无百分比 → 无百分比 | — |

**副产物**：P01、P08 原本第三张卡的匹配度**高于**第二张（97/83/96、96/94/96），改后单调
（97/83/79、96/94/77）。

**UI 侧无风险**：`app.js:3948-3961` 的 `isTop`/`tied` 判据只比 `results[0].score` 与
`results[1].score`，前两席不变 → 徽标与「与后两瓶并列」逐位不变。卡片文案是「候选 01/02/03」，
代码里**没有**「三张卡百分比必须单调」的假设。

这个交换要不要做，是 `Q1`（待裁决），本实验只负责把代价量准。

---

## 6. 覆盖率只有 3/6 族 —— 结构性的，不是抽样巧合

family 入口 6 族 × 5 场合 × 3 强度 = 90 组，实测：

| 族 | 生效率 | 原因 |
|---|---|---|
| citrus | **15/15** | strict 池 117 瓶，`familySource` 1 种 → 缺口必然出现 |
| woody | **15/15** | 243 瓶中 Wood & Root 占 98% → 实质上单值 |
| gourmand | **15/15** | 142 瓶，`familySource` 1 种 |
| floral | 0/15 | 533 瓶，`familySource` 4 种 → 第一轮填得满 3 席，无缺口 |
| amber | 0/15 | 191 瓶，3 种（最大 60%） |
| fresh | 0/15 | 162 瓶，3 种（最大 88%） |

**覆盖率 = 「各族 strict 池的 `familySource` 单值度」的函数，与场景无关。**
后三族本来已经兑现了多样性承诺，探索位没有缺口可补 → 不生效是**正确**行为，
不是功能缺陷。要六族全覆盖只能上无闸门版（v2g2），实测会让 floral/amber/fresh
把第 3 席换成分数低 11.2–18.9 分的 relaxed 瓶，**没有多样性收益**（`Q2`，不推荐）。

---

## 7. 稳健性与边界（实测）

| 检查 | 结果 |
|---|---|
| 42 用例正序 | 第 1 位变 0、第 2 位变 0、第 3 位变 5（P01/P02/P05/P08/P11） |
| 42 用例逆序 | 第 1 位变 0、第 2 位变 0、第 3 位变 5（同一组用例） |
| 金标正序 | base `2/12 · 4/12`，v2g1 `2/12 · 4/12` |
| 金标逆序 | base `2/12 · 4/12`，v2g1 `2/12 · 4/12` |
| 情绪入口 30 组 | 零变化 |
| `topN=1/2`（P11） | 与 base 逐位相同 |
| `topN=5`（金标口径，P11） | 探索瓶落在第 3 席、原第 5 席被截掉 → 金标**确实 exercised 了本功能**，不是绕过 |

**逆序为什么只要求命中率不变、不要求逐位不变**：42 用例在香水库逆序下 base 自身就有
22/42 例逐位抖动（并列分导致），两侧集合几乎相同，差异仅 P01/P11 互换。

---

## 8. 测试与基线

| 套件 | 结果 |
|---|---|
| scoring | **PASS 157 FAIL 0**（新增 E10/E11/E11b/E12 四条；E8/E9 原文未改） |
| gold | **MAJORITY 2/12 · STRICT 4/12**，`delta: MAJORITY ±0 · STRICT ±0`，exit 0 |
| render / contrast / compliance / union-api / category-gate / jd-web | 344 / 44 / 10 / 76 / 10 / 17，FAIL 全 0 |

`scripts/check-head.mjs` 的 scoring 基线已同步 `153 → 157`。

### 8.1 新增四条断言各守一件事（真假值实测）

| 断言 | 守什么 | base | v2g1 | v2g2（无闸门） |
|---|---|---|---|---|
| E10 | 前两席仍是 strict 瓶 | true | true | — |
| **E11** | **功能真的存在**（第 3 席是 relaxed 且源家族 ≥2 种） | **false** | **true** | — |
| E11b | `topN<3` 不生效 | true | true | — |
| **E12** | **闸门存在性**（无缺口不放宽，P09 三位全 strict） | — | **true** | **false** |

E11 是唯一的功能存在性判别式：base 下必假、v2g1 下必真。
E12 是闸门存在性判别式：v2g2 会红 —— 这正是它被排除的机械证据。

---

## 9. 未决（不在本文档裁决范围）

| # | 问题 | 状态 |
|---|---|---|
| Q1 | 匹配度 −15~−19pp 换源家族 +1，要不要做？ | 待 Muse/Eddie |
| Q2 | 覆盖率 3/6 族够不够？要六族全覆盖得上 v2g2（无收益换分） | 待裁决 |
| Q3 | 12 画像金标对本功能**是盲的**（MAJORITY 只读 top3 命中、STRICT 只读 top1；被换的第 3 席在 P09/P11 恰好都不是 gold）→ ±0 是结构性结果，不是「功能有效」的证据。是否建 notes 小金标 | 待裁决 |
| Q4 | 「换一批」路径（`app.js:4276-4301`，`topN = 3 + 已排除数`）下探索瓶固定在第 3 席，第二批起没有 relaxed 瓶。要不要每批都给一个探索位 | 待裁决（改则动 `app.js`，超出本次红线） |

**本文档不宣称任何命中率增益。** 12 画像金标对本功能是盲的（Q3 已说明），
所以本功能的验收只有 E10–E12 三条机制断言 —— 它们守形态，不守品味。

---

## 10. 复跑

```powershell
cd C:\Users\16256\work\scent-picker-v23
node scripts/test-scoring.mjs        # 期望 PASS 157 FAIL 0
node scripts/test-gold.mjs           # 期望 GOLD MAJORITY 2/12 STRICT 4/12
node scripts/check-head.mjs          # 干净导出 HEAD 复跑（push 前必跑）
```

离线证据（零副作用、不在仓库内）：`C:\Users\16256\work\.legs\epg2\` ——
`harness2.mjs`（命中率/42 用例/E8）、`harness3.mjs`（多样性/逆序/topN 扫描/换一批）、
`harness4.mjs`（验收线预演 + 覆盖率 + familySource 结构）、`scoring-v2g1.mjs`（推荐实现）、
`scoring-v2g2.mjs`（备选，无闸门）、`scoring-v2.mjs`（被排除的变体 B）。
规范件 `C:\Users\16256\work\.legs\pool-gate-v2-plan.md`。
