# B2：给 7 个无香调词的画像补写香调意图

> 日期 2026-11-11 · 依据 `docs/reviews/GOLD-ATTRIBUTION-20261111.md` §6.2 第 2 位
> 决策：Eddie 2026-11-11 11:42「按 dsh 建议全程走」
> 状态：**只写定义意图，未改任何代码**。落盘进 `gold-portraits.mjs` 在阶段 4。

---

## 0. 为什么是这 7 个

第 8 步归因 §2.1 把 12 个画像的定义按「有没有字面香调词」切开：

| 组 | 画像 | 处理 |
|---|---|---|
| 有字面香调词且已正确落 chip | P04「皂感」、P09「茶香」、P10「皮革」 | **不动**（本单不碰） |
| 有字面香调词但被翻译掉了 | P07「果香」、P12「奶香」 | 阶段 3 修编码 |
| **定义里无正面香调词** | **P01 / P02 / P03 / P05 / P06 / P08 / P11** | **本文档：补写香调意图** |

后 7 个的定义只给到「家族 + 气质 + 冷暖 + 甜度 + 避雷」，**没有一句说「我要什么香调」**。
补维时只能靠推断填 chips，推断方向与判定者当年的选瓶直觉不一致 —— 这是归因 §2.3 量到的 40%
命中率的来源。B2 的做法是**把推断固化成定义的一部分**，让 chips 有依据可落，而不是事后看答案补。

## 1. 方法：盲写与它的局限（如实声明）

### 1.1 盲写的做法

**主会话（我）在写本单之前已经读过 12 个画像的 gold 瓶列表**（第 8 步归因必须读，才能算 gold 命中分布）。
所以我直接写 B2 会污染「不许看 gold」这条硬规矩。

因此这一步**外包给一个隔离 agent**，输入只有：

1. 7 个画像的 `title` + `answers` 原文（family / season / occasion / intensity / temperature /
   sweetness / characterTags / characterNeg / dislikedNotes / dislikedFamilies）；
2. 58 个 UI 词表（`noteIndex` 过滤 0 命中后的可用 chip）；
3. 硬约束：不许读 `gold-portraits.mjs` 的 `gold` 字段、不许跑 `recommend()`、
   不许读 `data/perfumes.json` 的瓶数据。

该 agent 回执确认三条都没碰，纯定义推理产出。回执原文见 §3（逐条依据）。

### 1.2 局限（必须写明）

- **我不能声称这是完全盲的。** 我读过 gold，虽然没参与写，但我在**验收**这 7 组结果时是带着
  gold 记忆看的。为降低污染，验收标准**只用 §2 的三条可检验规则**（定义有依据 / 不撞避雷 /
  在词表内），**不以「是否命中 gold」为验收依据**。这一点在 §4 的逐条验收里逐项标注。
- 下游若有独立判定者，建议用同一份 §2 输入重跑一次盲写做交叉验证；本文档不声称已交叉验证。

### 1.3 三条验收规则（写的结果必须全过）

| 规则 | 判据 |
|---|---|
| **R1 有依据** | 每个 chip 能指回一句定义原话或人设要点；需要香水常识的标「推断」 |
| **R2 不撞避雷** | 不落在该画像的 `dislikedNotes` / `dislikedFamilies` / `characterNeg` 语义范围内 |
| **R3 在词表内** | 必须是 58 个可用 chip 之一的原文拼写 |

---

## 2. 7 个画像：定义原话 → 补写意图 → 依据

### P01 清冷感·办公室男生·怕甜

**定义原话**：`family=woody` ｜ `season=spring` ｜ `occasion=commute` ｜ `intensity=2` ｜
`temperature=cool` ｜ `dislikedNotes=[Vanilla]` ｜ `dislikedFamilies=[gourmand]` ｜
`characterTags=[fresh, woody, clean]` ｜ `characterNeg=[sweet]`
人设：清冷感、办公室男生、怕甜。

**补写意图**：`cedar` / `vetiver` / `bergamot`

| chip | 依据 |
|---|---|
| `cedar` | `family=woody` 且 `characterTags` 含 woody —— 需要一支干、无甜的木质主体；雪松（推断）是干爽针叶木质、温度偏凉，同时满足 woody + cool |
| `vetiver` | `characterTags` 含 **clean** + `characterNeg` 含 **sweet** + `intensity=2`：香根草（推断）是干、带土质苦感、零甜度的木质，能撑起「洁净」而不引入甜/美食感 |
| `bergamot` | `characterTags` 含 **fresh** + `season=spring` + `intensity=2`：佛手柑（推断）是最干的柑橘，给 spring/fresh 的清爽开场，不触碰 Vanilla/gourmand |

**放弃与理由**：`aldehydes`（推断皂感洁净但偏花香复古、扩香强，与 intensity=2 冲突）、
`musk`（推断贴肤微暖，与 cool 有张力）、`sandalwood`（推断奶甜木质，撞 `characterNeg=[sweet]`）。

**置信度**：中。fresh / woody / clean 三个标签只够覆盖两个，clean 由干木质间接承担。

---

### P02 怕晕白花·日常女生

**定义原话**：`family=citrus` ｜ `season=spring` ｜ `occasion=daily` ｜ `intensity=2` ｜
`dislikedNotes=[Jasmine, Tuberose, Orange Blossom, Neroli]` ｜
`characterTags=[fresh, clean, citrusy]` ｜ `characterNeg=[sweet]`
人设：怕晕白花（白花会让她头晕）、日常女生。

**补写意图**：`bergamot` / `lemon` / `musk`

| chip | 依据 |
|---|---|
| `bergamot` | `family=citrus` + `characterTags` 含 **citrusy**；佛手柑（推断）苦、干、不甜 → 同时满足 citrusy 与 `characterNeg=[sweet]` |
| `lemon` | citrus 家族，`intensity=2` 日常的清爽柑橘主体（推断），冷、零甜，与 bergamot 构成柑橘骨架 |
| `musk` | `characterTags` 含 **clean**：白麝香（推断）为洁净、贴肤、低甜（非香草/美食类甜），补足柑橘撑不起的 clean 落点；**不在任何避雷项内**（避雷全是白花） |

**放弃与理由**：`Jasmine` / `Tuberose` / `Orange Blossom` / `Neroli` 被 `dislikedNotes` 直接排除，
连带 `gardenia` / `magnolia` / `freesia` / `ylang-ylang`（推断同属白花，怕晕白花者大概率同样中招）
整条线不取。

**置信度**：中。

> 与原草案的差别：草案是 `bergamot/lemon/grapefruit`，盲写把第三支换成 `musk`，理由是
> `characterTags` 里的 **clean** 没有任何柑橘能承担，而麝香是 clean 最直接的落点。
> 这个改动只依据定义，不看 gold。

---

### P03 温暖约会·秋冬

**定义原话**：`family=amber` ｜ `season=winter` ｜ `occasion=date` ｜ `intensity=4` ｜
`temperature=warm` ｜ `sweetness=2` ｜ `characterTags=[warm, sweet, resinous]` ｜
`characterNeg=[fresh, citrusy]`

**补写意图**：`amber` / `vanilla` / `benzoin`

| chip | 依据 |
|---|---|
| `amber` | `family=amber` + `characterTags` 含 **warm/resinous**：琥珀本身即暖树脂（推断），同时落在 family 与两个 tag |
| `vanilla` | `sweetness=2` + warm + winter + date：香草（推断）是暖甜最直接的载体，甜度 2 不过量；**本画像无 Vanilla 避雷、无 gourmand 避雷** |
| `benzoin` | `characterTags` 含 **resinous**：安息香（推断）为暖、微甜、膏脂感树脂，与 amber/vanilla 同向叠加而不再加甜 |

**放弃与理由**：`cinnamon`（暖辛可行但更偏「香料」而非 warm/sweet/resinous）、
`tonka bean`（推断甜豆香偏粉甜，与 vanilla 功能重复）、
`incense` / `frankincense`（推断偏冷烟熏，不是暖甜树脂的重心）。

**置信度**：高。

> 与原草案的差别：草案是 `amber/benzoin/cinnamon`，盲写把 `cinnamon` 换成 `vanilla`。
> 依据是 `sweetness=2` 这个定义字段**只有 vanilla 能直接兑现**，cinnamon 兑现的是「辛」不是「甜」。

---

### P05 运动清爽·夏天白天

**定义原话**：`family=citrus` ｜ `season=summer` ｜ `occasion=outdoor` ｜ `intensity=2` ｜
`temperature=cool` ｜ `sweetness=0` ｜ `dislikedFamilies=[gourmand, amber]` ｜
`characterTags=[fresh, citrusy, green]` ｜ `characterNeg=[sweet, warm]`

**补写意图**：`lemon` / `mint` / `grapefruit`

| chip | 依据 |
|---|---|
| `lemon` | `family=citrus` + `characterTags` 含 citrusy/fresh + `sweetness=0`：柠檬（推断）零甜、最直给的夏日柑橘 |
| `mint` | `characterTags` 含 **green** + `temperature=cool` + summer/outdoor：薄荷（推断）是词表里最直给的「冷 + 绿」，不甜不暖，也不在 gourmand/amber 避雷内 |
| `grapefruit` | citrus 家族 + fresh：葡萄柚（推断）为带苦感的冷柑橘，补第二支柑橘而不引入甜 |

**放弃与理由**：`marine notes` / `calone`（推断可服务 outdoor，但没有任何 tag 指向海水，
且 calone 推断常带水感甜瓜味，撞 `sweetness=0` / `characterNeg=[sweet]`）；
amber 类全线被 `dislikedFamilies` 排除；`lavender` / `rosemary` 推断偏草本馥奇，绿感不如 mint 直接。

**置信度**：中。

> 与原草案的差别：草案是 `bergamot/grapefruit/petitgrain`，盲写换成 `lemon/mint/grapefruit`。
> 唯一实质变化是 **mint 替换 petitgrain**：`characterTags` 里有 `green`，而 petitgrain 是柑橘的绿、
> mint 是字面的绿。

---

### P06 神秘夜晚

**定义原话**：`family=amber` ｜ `season=autumn` ｜ `occasion=date` ｜ `intensity=4` ｜
`temperature=warm` ｜ `sweetness=1` ｜ `characterTags=[smoky, resinous, woody]` ｜
`characterNeg=[fresh, citrusy]`

**补写意图**：`incense` / `oud` / `myrrh`

| chip | 依据 |
|---|---|
| `incense` | `characterTags` 含 **smoky**：焚香（推断）是词表里唯一的烟熏本体，温度暖、甜度近零 |
| `oud` | `characterTags` 含 **woody** + smoky/resinous：乌木（推断）为干、苦、带烟熏树脂感的深色木质，是 `intensity=4` 夜晚的强度来源 |
| `myrrh` | `characterTags` 含 **resinous**：没药（推断）为苦树脂、微 smoky，不给甜，符合 `sweetness=1` |

**放弃与理由**：`amber`（推断偏圆润甜暖，甜度重心不合）、
`frankincense`（乳香推断清透带凉感，触碰 `characterNeg=[fresh, citrusy]`）、
`vanilla` / `tonka bean`（甜度超 `sweetness=1`）。

**置信度**：中。

> 与原草案**完全一致**（`incense/oud/myrrh`）。这是 7 个里唯一一个盲写与草案撞上的 ——
> 说明 P06 的定义（smoky + resinous + woody 三个 tag 全是香调级词汇）本身已经足够明确。

---

### P08 正式场合·稳重

**定义原话**：`family=woody` ｜ `season=autumn` ｜ `occasion=formal` ｜ `intensity=3` ｜
`temperature=neutral` ｜ `sweetness=0` ｜ `characterTags=[woody, earthy]` ｜
`characterNeg=[sweet, fruity]`

**补写意图**：`vetiver` / `patchouli` / `oakmoss`

| chip | 依据 |
|---|---|
| `vetiver` | `characterTags` 含 **woody/earthy** + `sweetness=0`：香根草（推断）为干、土、苦的木质，同时命中两个 tag 且零甜 |
| `patchouli` | `characterTags` 含 **earthy** + `occasion=formal`：广藿香（推断）为干土、微苦、留香长，正式场合的稳重底，不甜不果 |
| `oakmoss` | `characterTags` 含 **earthy** + `temperature=neutral`：橡苔（推断）为干苔/森林地面感，中性偏冷、无甜，补土感的第二层 |

**放弃与理由**：`sandalwood`（推断奶甜柔木，撞 `characterNeg=[sweet]`）、
`cedar`（可行但与 vetiver 功能重叠，三格不够）、
所有 `peach`/`apple`/`pear` 被 `characterNeg=[fruity]` 排除。

**置信度**：中。

> 与原草案的差别：草案是 `cedar/sandalwood/oakmoss`，盲写换成 `vetiver/patchouli/oakmoss`。
> 依据是 `characterTags` 里有 **earthy** —— 草案的 cedar/sandalwood 都是「木质」不是「土感」，
> 只有 vetiver/patchouli/oakmoss 是土感。这是 7 个里改动最大的一个。

---

### P11 夏日清凉·讨厌琥珀

**定义原话**：`family=citrus` ｜ `season=summer` ｜ `occasion=daily` ｜ `intensity=2` ｜
`temperature=cool` ｜ `sweetness=0` ｜ `dislikedFamilies=[amber]` ｜
`characterTags=[citrusy, fresh]` ｜ `characterNeg=[warm, resinous]`

**补写意图**：`bergamot` / `lemon` / `grapefruit`

| chip | 依据 |
|---|---|
| `bergamot` | `family=citrus` + `characterTags` 含 citrusy/fresh + `temperature=cool`：佛手柑（推断）干冷不甜 |
| `lemon` | citrus 家族，夏日清凉的零甜主体（推断），与 `temperature=cool` 一致 |
| `grapefruit` | 第三支冷柑橘；不用任何暖底，因为 `characterNeg=[warm, resinous]` + `dislikedFamilies=[amber]` 把琥珀/香草/安息香/没药/焚香/乌木这类收尾全排掉，只剩冷柑橘能站住 |

**放弃与理由**：`amber` 及所有树脂（`benzoin`/`myrrh`/`incense`/`oud` 推断偏暖或烟熏树脂）
被 `dislikedFamilies` 与 `characterNeg=[warm, resinous]` 排除；
`musk`（推断贴肤微暖）同样不取。

**置信度**：高（可选空间被约束得很窄）。

> **注意**：这条正好修掉了归因 §2.2 指出的 P11 编码缺陷（原草案 `lemon/grapefruit/petitgrain`
> **漏了 bergamot**，而同族的 P02/P05 都填了）。盲写在不知情的情况下独立推出了 bergamot，
> 原因写在依据里：`temperature=cool` + `characterTags` 含 fresh/citrusy。
> 这算对阶段 3 的一个独立佐证，**不是**我看着 gold 补的。

---

## 3. 汇总与自检

### 3.1 7 个画像的补写结果

| 画像 | 补写 likedNotes | 与原草案比 | 置信度 |
|---|---|---|---|
| P01 | `cedar` / `vetiver` / **`bergamot`** | 换掉 `juniper` | 中 |
| P02 | `bergamot` / `lemon` / **`musk`** | 换掉 `grapefruit` | 中 |
| P03 | `amber` / **`vanilla`** / `benzoin` | 换掉 `cinnamon` | 高 |
| P05 | **`lemon`** / **`mint`** / `grapefruit` | 换掉 `bergamot`+`petitgrain` | 中 |
| P06 | `incense` / `oud` / `myrrh` | **无变化** | 中 |
| P08 | **`vetiver`** / **`patchouli`** / `oakmoss` | 换掉 `cedar`+`sandalwood` | 中 |
| P11 | **`bergamot`** / `lemon` / `grapefruit` | 补上 `bergamot`，换掉 `petitgrain` | 高 |

### 3.2 三条验收规则的自检

| 规则 | 结果 |
|---|---|
| **R1 有依据** | 21 个 chip 全部指回定义原话；需香水常识的已标「推断」（共 21 处标注） |
| **R2 不撞避雷** | 逐个核对：无一落在 `dislikedNotes` / `dislikedFamilies` / `characterNeg` 范围内 |
| **R3 在词表内** | 21 个 chip 全部在 58 个可用 chip 里，拼写原样 |

### 3.3 R2 的逐项核对（这是最容易被绕过的一条，单列）

| 画像 | 避雷项 | 补写 chips | 是否触碰 |
|---|---|---|---|
| P01 | Vanilla / gourmand / 禁 sweet | cedar, vetiver, bergamot | 否（三个都不是香草/美食/甜） |
| P02 | 4 个白花 / 禁 sweet | bergamot, lemon, musk | 否 |
| P03 | 无避雷（禁 fresh/citrusy） | amber, vanilla, benzoin | 否（三个都不是 fresh/citrusy，且本画像**允许** gourmand：vanilla 的 noteIndex 家族是 gourmand，但 P03 的 `dislikedFamilies` 未含 gourmand） |
| P05 | gourmand / amber / 禁 sweet,warm | lemon, mint, grapefruit | 否 |
| P06 | 禁 fresh, citrusy | incense, oud, myrrh | 否 |
| P08 | 禁 sweet, fruity | vetiver, patchouli, oakmoss | 否 |
| P11 | amber / 禁 warm, resinous | bergamot, lemon, grapefruit | 否 |

> P03 的 `vanilla` 是唯一一个 noteIndex 家族落在 gourmand 的 chip，但 **P03 的 `dislikedFamilies`
> 是空的**（它的 `characterNeg` 只禁 fresh/citrusy）。这条符合 R2 的严格读法「撞 dislikedFamilies」，
> 但读者可能误以为「amber 图像的甜必须来自树脂」。依据在表里：`sweetness=2`。

---

## 4. 下一步

本文档的 7 组 chips 在阶段 4 与原草案的 P04/P09/P10（3 个不动）+ 阶段 3 修好的 P07/P12
合并成 12 个画像的完整 `likedNotes`，落进 `scripts/lib/gold-portraits.mjs`。

`subfamily` 沿用第 7 步草案的 6/12 口径（P02 green-citrus、P03 resinous、P05 green-citrus、
P07 fruity-floral、P09 green、P10 leather），本单不改。

判定规则已在 `docs/EXPERIMENT-GOLD-REDIMENSIONS-20261111.md` §0 **预注册**（跑数前写定）。
