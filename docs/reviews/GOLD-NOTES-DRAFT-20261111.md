# notes 专用小金标准（**定稿 2026-11-11**）

> 日期 2026-11-11 · 草案立：Eddie 2026-11-11 12:17「收口 + 另立 notes 小金标准」
> **定稿：Eddie 2026-11-11 15:29 批准按 Muse 建议定稿**
> 上游收口：`CONTROL.md` §5（12 画像金标准量程 = 家族/气质，notes 不在其量程内）
> 状态：**定稿**。8 画像名单与四点口径已定，不再议。**不接入 `check-head`**（见 §4.3）。
> `src/` 零改动；不改 `test-gold.mjs`、不改 12 画像集。

---

## 定稿：四点结论（2026-11-11，Eddie 批准）

| # | 结论 | 依据 |
|---|---|---|
| **1** | **画像取舍定稿：8 个入选**（N03/N04/N06/N07/N09/N10/N11/N12），**4 个剔除**（P01/P02/P05/P08）。**不再议。** | §2.2 / §2.3 的先验标准（字面香调词 / 约束窄至唯一解） |
| **2** | **N09 保留**（合格瓶仅 4 个也保留） | 它是本集**唯一 STRICT 通过者**（top1 命中），剔除会让本集失去唯一的正样本 |
| **3** | **合格数 4–199 的差距接受为既定事实**。报告口径定版：**逐画像结果为正报，总命中率只作参考** | §3.2 实测 50 倍差距源于 chips 稀有度（`galbanum` 20 瓶 vs `vanilla` 508 瓶），不是抽样瑕疵；聚合数会掩盖难度不一致 |
| **4** | **地板定版：暂不设地板，`test-gold-notes` 不接入 `check-head`**。理由：基线 MAJ 0/8 时地板无法触发（`max(0, 0−1) = 0`）。**测试本身保留、可单独运行**，待 MAJ 离开 0 再议地板 | §4.3 |

**口径 3 的落地形式**：`scripts/test-gold-notes.mjs` 的输出已按此改 —— **逐画像表在前（正报）**，
聚合的 MAJ/STR 明确标注为「参考」；文档 §4.1 同口径。
「逐画像为正报」这句同时写进了脚本头部注释与输出尾部，以后每次跑都按它呈现。

---

---

## 0. 为什么另立一套

12 画像金标准被证明**测不了 notes**（`CONTROL.md` §5）：它的 gold 瓶是「这瓶合这个人设吗」的
逐瓶整体判断，notes 因子是「含不含这 3 个离散香调」，两根轴不对齐，gold 命中 ≤1 个 chip 的占 78%。

本集换一个方向：**notes-first**。画像是为了「香调意图」而存在的，选瓶也**只按香调**选 ——
不是「这瓶合人设吗」，而是「这瓶含不含这几个香调、有没有踩雷香调」。
这样 gold 的判定轴与 `likedNotes` 的判定轴就是同一根。

**这套集量的东西不同**：它量「按香调选瓶的能力」，不量「按人设推荐的能力」。
两者的分不能互相替代，也不该混在一起比。

---

## 1. 选瓶规则（**先写死，选瓶在 §3 之后，不许边选边改**）

本节在跑任何选瓶代码之前定稿。事后若发现规则有误，只能在文末追加「事后异议」，不得改本节。

### 1.1 入榜充分条件（四条全过才算合格）

某瓶 P 入某画像 X 的 notes-gold 名单 ⇔ **同时满足**：

| # | 条件 | 口径 |
|---|---|---|
| **(i)** | **香调命中** | P 的 `notesAll` 含 X 的 `likedNotes` 芯片 **≥2 个** |
| **(ii)** | **不踩雷调** | P 的 `notesAll` **不含** X 的**任何** `dislikedNotes` |
| **(iii)** | **过硬冲突筛** | 沿用 `scripts/audit-gold.mjs` 的口径（见 §1.2） |
| **(iv)** | **只用原始字段** | 只用 `data/perfumes.json` 的 `notesAll` / `families` / `character` / `seasons` / `timesOfDay` / `concentration` / `popularityRank`；**禁止查看或使用当前引擎的分数、排名、breakdown** |

### 1.2 硬冲突筛的具体定义（沿用 audit-gold.mjs）

来自 `scripts/audit-gold.mjs` 的 `auditOne()` / `suggest()`，逐条对齐：

| 冲突类 | 判据 | 依据代码 |
|---|---|---|
| **忌用香调** | `notesAll` 命中任一 `dislikedNotes`（归一化后子串匹配，与 audit-gold 的 `hitNotes` 同口径） | `audit-gold.mjs:104-107` |
| **忌用家族（硬）** | `families[f] >= 0.5`（不是「沾一点」，是确实占了半壁） | `audit-gold.mjs:120` |
| **忌用气质** | `character` 含任一 `characterNeg` | `audit-gold.mjs:121` |

**未纳入硬筛的两项，及理由**：

- `mustChar`（P10 leathery / P12 creamy 那种「必须有某气质」）：**本集不用**。
  那是人设判定轴的产物，本集是 notes-first，不该用气质卡候选。
- 季节/时段：**本集不用**。理由同上 —— 本集不判「合不合场合」，只判香调。
  这两项若纳入，会让「按香调选瓶」重新混入人设判定，破坏本集的意义。

> 这是一处**与 audit-gold 的有意分歧**，写在这里避免被误读成漏做。

### 1.3 每画像目标瓶数

- 目标 **4–5 瓶**。
- **合格瓶 < 4 时不许放宽规则凑数**：照实记录「该画像合格瓶不足」，
  并建议剔除该画像，理由写清。
- 若合格瓶 > 5，按 §1.4 排序取前 5。

### 1.4 超量时的取舍顺序（**与引擎分数无关**）

合格瓶可能远超 5 瓶（例如 P02 的 `musk` df 620，命中面很大）。取前 5 的顺序：

1. **命中数多者优先**（3 个 chip > 2 个 chip）—— 这是唯一有意义的强弱区分；
2. 同命中数时，**`popularityRank` 小的优先**（知名度是数据自带字段，不是引擎分数）；
3. 仍并列时按 `id` 字典序 —— 纯为可复现。

> 明确：**不使用 `recommend()` 的输出**。`popularityRank` 是源站热度，与打分无关，
> 但为彻底避免「用引擎结果选瓶」的嫌疑，它只在第 2 顺位作 tie-break，且会在证据表里显式列出。

### 1.5 测量口径

- 用**未改动的生产 `recommend()`**（`src/scoring.js` 原样）跑本集。
- 每画像传入的答案 = 该画像的完整 `answers`（`likedNotes` 按定义开，其余字段照画像定义）。
- **subfamily 不传**：第 9 步四格实测 subfamily 单独是 −2 STR（`GOLD-REDIMENSIONS` §4.6），
  且它属于人设判定轴的产物，本集不用。
- 报 **MAJORITY（top3 命中 ≥2）/ STRICT（top1 命中）** 作为**首测基线**。
- 首测基线**是测量不是目标** —— 不许为了让数字好看而回头改 §1 的规则或 §3 的名单。

### 1.6 地板建议口径（先写方法，数出来再填值）

```
地板 = 首测值往下留一格
```

「一格」的定义：12 画像体系里一格 = 1 个画像（1/12 ≈ 8.3 个百分点）。
本集若为 n 个画像，一格 = 1/n。

理由：地板守的是「不许退化」，留一格能吸收「某个画像在边界上恰好掉一个瓶」这类噪声，
又不至于宽到放过真正的退化。**地板值等首测出来再填**，不预先写死。

### 1.7 纪律

- `src/` 生产代码零改动。
- 八套件保持全绿。
- 本集**不接入 `check-head`**（定稿结论 4）；`scripts/test-gold-notes.mjs` 保留、可单独运行。
- `scripts/test-gold-notes.mjs` 先建好能跑出首测基线，但**不提交 notes 画像定稿**。

---

## 2. 画像入选与落选

### 2.1 入选理由的两条先验标准（**先于选瓶写定**）

从 12 个画像里挑「香调意图最明确」的 8 个。判断依据只有画像定义本身，**不看合格瓶数、不看分数**：

- **标准 A「定义含字面或近字面香调词」** —— 人设标题里就有香调词，chips 可以逐字落：
  P04「皂感」、P07「果香花香」、P09「茶香草本」、P10「皮革感」、P12「奶香」。
- **标准 B「定义约束窄到能唯一决定香调方向」** —— 标题没有香调词，但 `characterTags` 本身就是
  香调级词汇，或避雷项把可选范围压到极窄：
  P03（`warm/sweet/resinous` 三个标签全是香调级 + `sweetness=2` 直指 vanilla）、
  P06（`smoky/resinous/woody` 三个全是香调级，词表里几乎一一对应）、
  P11（`citrus` + `cool` + 避雷 amber + 禁 warm/resinous，只剩冷柑橘可站）。

### 2.2 入选 8 个

| 画像 | 标题 | 入选标准 | 依据 |
|---|---|---|---|
| **P03** | 温暖约会·秋冬 | B | `characterTags` = warm/sweet/resinous；`sweetness=2` |
| **P04** | 干净皂感·上课 | A | 标题「皂感」；`characterTags` 含 musky |
| **P06** | 神秘夜晚 | B | `characterTags` = smoky/resinous/woody |
| **P07** | 甜美不腻·果香花香 | A | 标题「果香」+「花香」 |
| **P09** | 茶香草本 | A | 标题「茶香」+「草本」 |
| **P10** | 皮革感小众 | A | 标题「皮革」；`characterTags` 含 leathery |
| **P11** | 夏日清凉·讨厌琥珀 | B | 避雷 amber + 禁 warm/resinous，可选范围极窄 |
| **P12** | 奶香柔软 | A | 标题「奶香」；`characterTags` 含 creamy |

### 2.3 落选 4 个及理由

| 画像 | 标题 | 落选理由 |
|---|---|---|
| **P01** | 清冷感·办公室男生·怕甜 | 定义**零正面香调词**，只有 `family=woody` + `cool` + `clean`；「木质+清冷」能被同样合理地解读成 cedar/vetiver（干木质）或 bergamot/tea（冷柑橘茶）—— 第 8 步归因已实测这条歧义（草案 cedar/vetiver/juniper 对 gold 命中 0/5）。**意图不明确** |
| **P02** | 怕晕白花·日常女生 | 只有**否定**（4 个白花），正面只有 `family=citrus` + `clean`。clean 该落 musk 还是落 citrus 本身有分歧（B2 盲写选了 musk，但那是一步推断）。**正面意图不明确** |
| **P05** | 运动清爽·夏天白天 | `green` 标签该落 mint（字面绿）还是 petitgrain/galbanum（柑橘的绿）没有定义依据，B2 盲写自己标了「置信度 中」。**意图有歧义** |
| **P08** | 正式场合·稳重 | `woody` + `earthy` 能落 cedar/sandalwood（木质）也能落 vetiver/patchouli/oakmoss（土感），B2 盲写在这一条上与原草案分歧最大（换了两个 chip）。**意图有歧义** |

> 落选不等于这些画像没价值，只表示**它们的香调意图不足以当 notes 金标准的判定基准**。
> 它们的正确用途还是人设轴（12 画像那套）。

---

## 3. 选瓶执行结果（严格按 §1 规则）

规则在 §1 已定稿，本节只报执行结果。筛法逐画像跑全库 1388 瓶。

### 3.1 逐画像：定义与 chips、入选瓶、入选证据、合格计数

#### N03（原 P03）温暖约会·秋冬

- **定义**：`family=amber` `season=winter` `occasion=date` `intensity=4` `temperature=warm` `sweetness=2`
  `characterTags=[warm,sweet,resinous]` `characterNeg=[fresh,citrusy]`
- **chips**：`amber` / `vanilla` / `benzoin`
- **合格瓶数**：**147**（命中<2 淘汰 1126 · 踩忌用香调 0 · 忌用家族 0 · 忌用气质 115）

| 入选瓶 | 命中 | 证据 | 硬冲突筛 | pop |
|---|---|---|---|---|
| `mfk-grand-soir` | 3/3 | amber, vanilla, benzoin | 无（忌 fresh/citrusy 均未中） | #47 |
| `lattafa-khamrah` | 3/3 | amber, vanilla, benzoin | 无 | #74 |
| `mfk-oud-satin-mood` | 3/3 | amber, vanilla, benzoin | 无 | #83 |
| `nishane-ani` | 3/3 | amber, vanilla, benzoin | 无 | #109 |
| `lattafa-asad` | 3/3 | amber, vanilla, benzoin | 无 | #171 |

#### N04（原 P04）干净皂感·上课

- **定义**：`family=fresh` `occasion=commute` `intensity=1` `temperature=neutral` `sweetness=0`
  `characterTags=[clean,musky,fresh]` `characterNeg=[sweet,resinous]`
- **chips**：`musk` / `aldehydes` / `lavender`
- **合格瓶数**：**63**（命中<2 淘汰 1308 · 踩忌用香调 0 · 忌用家族 0 · 忌用气质 17）

| 入选瓶 | 命中 | 证据 | 硬冲突筛 | pop |
|---|---|---|---|---|
| `armaf-orchestra-tempo-tune` | 3/3 | musk, aldehydes, lavender | 无 | — |
| `ysl-libre` | 2/3 | musk, lavender | 无 | #2 |
| `frederic-malle-musc-ravageur` | 2/3 | musk, lavender | 无 | #40 |
| `byredo-blanche` | 2/3 | musk, aldehydes | 无 | #90 |
| `maison-margiela-replica-lazy-sunday-morning` | 2/3 | musk, aldehydes | 无 | #143 |

> `aldehydes` 全库只有 20 瓶，是全词表最稀有的 chip 之一，所以只有 1 瓶能拿 3/3。

#### N06（原 P06）神秘夜晚

- **定义**：`family=amber` `season=autumn` `occasion=date` `intensity=4` `temperature=warm` `sweetness=1`
  `characterTags=[smoky,resinous,woody]` `characterNeg=[fresh,citrusy]`
- **chips**：`incense` / `oud` / `myrrh`
- **合格瓶数**：**20**（命中<2 淘汰 1366 · 踩忌用香调 0 · 忌用家族 0 · 忌用气质 2）

| 入选瓶 | 命中 | 证据 | 硬冲突筛 | pop |
|---|---|---|---|---|
| `zoologist-camel` | 3/3 | incense, oud, myrrh | 无 | #937 |
| `creed-queen-of-silk` | 3/3 | incense, oud, myrrh | 无 | — |
| `mancera-red-tobacco` | 2/3 | incense, oud | 无 | #154 |
| `nishane-afrika-olifant` | 2/3 | oud, myrrh | 无 | #559 |
| `dolce-gabbana-velvet-desert-oud` | 2/3 | incense, oud | 无 | #668 |

#### N07（原 P07）甜美不腻·果香花香

- **定义**：`family=floral` `season=spring` `sweetness=2` `dislikedFamilies=[gourmand]`
  `characterTags=[fruity,floral]` `characterNeg=[leathery,smoky]`
- **chips**：`peach` / `freesia` / `peony`
- **合格瓶数**：**16**（命中<2 淘汰 1367 · 踩忌用香调 0 · 忌用家族 5 · 忌用气质 0）

| 入选瓶 | 命中 | 证据 | 硬冲突筛 | pop |
|---|---|---|---|---|
| `cacharel-noa` | 3/3 | peach, freesia, peony | 无（主族非 gourmand） | #865 |
| `viktor-rolf-flowerbomb` | 2/3 | freesia, peony | 无 | #42 |
| `amouage-dia-woman` | 2/3 | peach, peony | 无 | #297 |
| `gucci-rush` | 2/3 | peach, freesia | 无 | #346 |
| `calvin-klein-ck-be` | 2/3 | peach, freesia | 无 | #387 |

#### N09（原 P09）茶香草本

- **定义**：`family=fresh` `occasion=commute` `temperature=cool` `sweetness=0` `dislikedFamilies=[gourmand]`
  `characterTags=[herbal,green]` `characterNeg=[sweet,creamy]`
- **chips**：`green tea` / `sage` / `galbanum`
- **合格瓶数**：**4** ⚠️（命中<2 淘汰 1383 · 踩忌用香调 0 · 忌用家族 0 · 忌用气质 1）

| 入选瓶 | 命中 | 证据 | 硬冲突筛 | pop |
|---|---|---|---|---|
| `etat-libre-dorange-jasmin-et-cigarette` | 2/3 | sage, galbanum | 无 | #317 |
| `armaf-legasi-man` | 2/3 | sage, galbanum | 无 | — |
| `bentley-azure` | 2/3 | green tea, sage | 无 | — |
| `lattafa-dynasty` | 2/3 | green tea, sage | 无 | — |

**合格瓶不足的如实记录**：全库 1388 瓶里，命中 ≥2 个 chip 且不踩雷的只有 **4 瓶**，
刚好达到 §1.3 的下限（4–5 瓶）。**没有放宽规则凑第 5 瓶。**
原因是 `galbanum` 全库仅 20 瓶、`green tea` 仅 43 瓶，两个稀有 chip 同时命中极难。

> 按 §1.3，4 瓶是**下限**，不到 4 才建议剔除。N09 恰好 4，**保留但标注为「临界」**，
> 因为 4 瓶的 gold 在 MAJ 判据（top3 命中 ≥2）下意味着「一半的答案必须在 top3」，
> 容错空间比 5 瓶集小。

#### N10（原 P10）皮革感小众

- **定义**：`family=amber` `occasion=daily` `intensity=4` `temperature=warm` `sweetness=0`
  `characterTags=[leathery,smoky]` `characterNeg=[sweet,clean]`
- **chips**：`leather` / `incense` / `saffron`
- **合格瓶数**：**33**（命中<2 淘汰 1345 · 踩忌用香调 0 · 忌用家族 0 · 忌用气质 10）

| 入选瓶 | 命中 | 证据 | 硬冲突筛 | pop |
|---|---|---|---|---|
| `dolce-gabbana-velvet-desert-oud` | 3/3 | leather, incense, saffron | 无 | #668 |
| `ajmal-cherry-wood` | 3/3 | leather, incense, saffron | 无 | — |
| `amouage-overture-woman` | 3/3 | leather, incense, saffron | 无 | — |
| `pantheon-roma-pantheon-r` | 3/3 | leather, incense, saffron | 无 | — |
| `versace-dylan-blue` | 2/3 | incense, saffron | 无 | #59 |

#### N11（原 P11）夏日清凉·讨厌琥珀

- **定义**：`family=citrus` `season=summer` `temperature=cool` `sweetness=0` `dislikedFamilies=[amber]`
  `characterTags=[citrusy,fresh]` `characterNeg=[warm,resinous]`
- **chips**：`bergamot` / `lemon` / `grapefruit`
- **合格瓶数**：**99**（命中<2 淘汰 1232 · 踩忌用香调 0 · 忌用家族 21 · 忌用气质 36）

| 入选瓶 | 命中 | 证据 | 硬冲突筛 | pop |
|---|---|---|---|---|
| `creed-himalaya` | 3/3 | bergamot, lemon, grapefruit | 无 | #177 |
| `annick-goutal-eau-dhadrien` | 3/3 | bergamot, lemon, grapefruit | 无 | #337 |
| `roja-parfums-danger-pour-femme` | 3/3 | bergamot, lemon, grapefruit | 无 | #376 |
| `acqua-di-parma-colonia-essenza` | 3/3 | bergamot, lemon, grapefruit | 无 | #441 |
| `roja-parfums-oceania` | 3/3 | bergamot, lemon, grapefruit | 无 | #896 |

#### N12（原 P12）奶香柔软

- **定义**：`family=floral` `occasion=daily` `sweetness=2` `temperature=warm`
  `characterTags=[creamy,sweet]` `characterNeg=[leathery,smoky]`
- **chips**：`vanilla` / `sandalwood` / `ylang-ylang`
- **合格瓶数**：**199**（命中<2 淘汰 1186 · 踩忌用香调 0 · 忌用家族 0 · 忌用气质 3）

| 入选瓶 | 命中 | 证据 | 硬冲突筛 | pop |
|---|---|---|---|---|
| `lattafa-fakhar-rose` | 3/3 | vanilla, sandalwood, ylang-ylang | 无 | #307 |
| `roja-parfums-danger-pour-femme` | 3/3 | vanilla, sandalwood, ylang-ylang | 无 | #376 |
| `amouage-lyric-woman` | 3/3 | vanilla, sandalwood, ylang-ylang | 无 | #378 |
| `memo-paris-marfa` | 3/3 | vanilla, sandalwood, ylang-ylang | 无 | #381 |
| `roja-parfums-enigma` | 3/3 | vanilla, sandalwood, ylang-ylang | 无 | #561 |

### 3.2 合格瓶数汇总（**这一列本身是重要发现**）

| 画像 | 合格瓶数 | 3/3 命中瓶数 | 备注 |
|---|---|---|---|
| N03 | 147 | 很多 | 宽 |
| N04 | 63 | 1（aldehydes 仅 20 瓶） | 中 |
| N06 | 20 | 2 | 窄 |
| N07 | 16 | 1 | 窄 |
| **N09** | **4** | **0** | **临界（刚好下限）** |
| N10 | 33 | 4 | 中 |
| N11 | 99 | 很多 | 宽 |
| N12 | 199 | 很多 | 最宽 |

**发现**：合格瓶数从 4 到 199，相差 **50 倍**。这不是抽样瑕疵，是 chips 的稀有度直接决定的
（`galbanum` 20 瓶 vs `vanilla` 508 瓶）。

**这给本集带来一个结构性问题**：合格瓶越多的画像，「top3 命中 ≥2」越接近于**随机**；
合格瓶越少的画像，越接近于**唯一解**。八个画像的难度并不一致，
MAJ/STR 的算术平均掩盖了这一点。**这一点必须在定稿前由 Eddie 一起判。**

---

## 4. 首测基线（测量，不是目标）

### 4.1 首测结果

用**未改动的生产 `recommend()`**（`src/scoring.js` 原样），`likedNotes` 按定义开、其余照画像定义、
**不传 subfamily**（§1.5）。`scripts/test-gold-notes.mjs` 可复跑。

| 画像 | top3 命中 | top1 | chips |
|---|---|---|---|
| N03 | · 0/3 | · | amber/vanilla/benzoin |
| N04 | · 1/3 | · | musk/aldehydes/lavender |
| N06 | · 0/3 | · | incense/oud/myrrh |
| N07 | · 0/3 | · | peach/freesia/peony |
| **N09** | · 1/3 | **✓** | green tea/sage/galbanum |
| N10 | · 0/3 | · | leather/incense/saffron |
| N11 | · 0/3 | · | bergamot/lemon/grapefruit |
| N12 | · 0/3 | · | vanilla/sandalwood/ylang-ylang |

```
MAJORITY（top3 命中 ≥2）: 0/8 = 0.0%
STRICT  （top1 命中）   : 1/8 = 12.5%
GOLD-NOTES MAJORITY 0/8 STRICT 1/8
```

### 4.2 首测为什么这么低：一个必须一起看的诊断

首测 0/8 很容易被读成「引擎完全不会按香调选」。但把 gold 瓶的 `likedNotes` 分拉出来看，
**结论正好相反**：

| 画像 | gold 瓶的 likedNotes 分 | top3 瓶的 likedNotes 分 |
|---|---|---|
| N03 | **14 / 14 / 14 / 14 / 14** | 14 / 7 / 14 |
| N04 | **14 / 14 / 14 / 14 / 14** | 14 / 7 / 14 |
| N06 | **14 / 14 / 14 / 14 / 14** | 14 / 0 / 14 |
| N07 | **14 / 14 / 14 / 14 / 14** | 14 / 14 / 7 |
| N09 | **14 / 14 / 14 / 14** | 14 / 7 / 0 |
| N10 | **14 / 14 / 14 / 14 / 14** | 14 / 7 / 14 |
| N11 | **14 / 14 / 14 / 14 / 14** | 14 / 14 / 14 |
| N12 | **14 / 14 / 14 / 14 / 14** | 14 / 14 / 7 |

**8 个画像、39 瓶 gold，全部拿满 14 分。** 也就是说 `likedNotes` 这一项对 gold 瓶已经给到满分了 ——
它们不是「notes 分不够」而掉出 top3，是**在 notes 满分的情况下，被 family / intensity 等其它因子挤掉**。

**这是一条硬结论**：`likedNotes` 满分为 14，且 8 个画像里 gold 与竞争者在
这一项上全部并列满分（N11 甚至 top3 三瓶全满分）——**这一项在满分级上彻底饱和，
对排序零贡献**。本集的 0/8 不是 notes 因子弱，是**它在当前 14 分的上限下无法区分**。

这与第 8 步归因 §5.6 的天花板（oracle chips 也上不去）是同一件事的另一个侧面。

> **重要**：这不是说本集没用。它第一次把「notes 因子在满分端饱和」这件事**量化到 39/39 瓶** ——
> 而 12 画像集因为 gold 命中普遍 ≤1 个，反而看不到这个现象。

### 4.3 地板建议

按 §1.6 的方法「首测往下留一格」：

```
一格 = 1/8 = 12.5 个百分点
MAJORITY 首测 0/8 → 往下留一格 = max(0, 0−1) = 0/8
STRICT   首测 1/8 → 往下留一格 = max(0, 1−1) = 0/8
```

**但首测就是 0 时，「往下留一格」会得到 0/8，这个地板等于没有**（永远不会红）。
所以照 §1.6 的字面算法得出的地板是 **0/8 · 0/8，不可用**，理由写清：

- 地板的作用是「守退化」。首测为 0 时，任何负向改动都不会被这个地板挡住 —— 它形同虚设。
- 因此建议：**先不要给本集设地板**。等首测值离开 0（例如引擎改动后 MAJ 升到 ≥1），
  再按「首测往下留一格」重新算。在那之前，`check-head` 不应接入本集。

**若 Eddie 仍要一个可用的守门值**，替代方案是守 STR：
`STRICT ≥ 1/8`（即守住 N09 这一瓶）。这至少能挡住「连唯一通过的那个都丢了」的退化。
但 1/8 的样本量太小，统计意义弱，我更倾向「暂不设地板」。

### 4.4 本集当前状态

| 项 | 状态 |
|---|---|
| 画像名单 | **定稿 8 个**（2026-11-11 Eddie 批准，不再议） |
| `scripts/test-gold-notes.mjs` | 已建、可跑、能出 `GOLD-NOTES MAJORITY …` 行 |
| 是否接入 `check-head` | **否**（按派单要求） |
| 是否改了 `test-gold.mjs` 或 12 画像集 | **否** |
| `src/` 生产代码 | **零改动** |

---

## 5. 四点裁定结果（原「请 Eddie 抽查」，2026-11-11 已定稿）

| # | 原问题 | **裁定** |
|---|---|---|
| 1 | 8 个画像的取舍（P01/P02/P05/P08 落选理由是「意图有歧义」） | **照草案定稿**：8 入选、4 剔除，**不再议** |
| 2 | N09 只有 4 瓶，保留还是按「临界」剔除 | **保留**（本集唯一 STRICT 通过者）；剔除会让本集失去唯一正样本 |
| 3 | 合格瓶数 4–199 的 50 倍差距是否接受 | **接受为既定事实**（源于 chips 稀有度，非抽样瑕疵）。报告口径定版：**逐画像结果为正报，总命中率只作参考** |
| 4 | 地板：暂不设 / 守 `STRICT ≥ 1/8` | **暂不设地板，不接入 `check-head`**。理由：基线 MAJ 0/8 时地板无法触发。测试保留、可单独运行，待 MAJ 离开 0 再议 |

落地：`CONTROL.md` §5 与 `docs/DECISIONS.md`（D 编号见其记录）各有一条定版记录；
`scripts/test-gold-notes.mjs` 的输出按口径 3 重排（逐画像在前为正报，聚合标注为参考）。

---

## 6. 纪律自查

| 项 | 结果 |
|---|---|
| 选瓶规则先写死再选 | ✓ §1 在跑数前定稿 |
| 只用 `data/perfumes.json` 原始字段 | ✓ 选瓶脚本不 import `scoring.js`，只复用 `notes.js` 的纯匹配函数 |
| 未查看引擎分数/排名选瓶 | ✓ §1.4 只用「命中数 → popularityRank → id」，且 tie-break 显式列出 |
| 合格瓶 <4 时未放宽规则 | ✓ N09 恰 4 瓶，未凑第 5 |
| `src/` 零改动 | ✓ |
| 未接入 check-head / 未改 12 画像集 | ✓ |
| 八套件 | ✓ 定稿后复跑全绿 294/42/153/10/76/10/17 + GOLD 2/12·4/12 |

