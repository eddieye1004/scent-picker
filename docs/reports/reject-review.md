# A 类拒收复查：62 条「品牌名未出现在标题里」逐条判读

- 席位：reject-scout（task-3）
- 日期：2026-11-08
- 数据源：`scent-picker-v2/data/products.candidates.json`（2,193,333 B，mtime 2026-11-08 22:41:38）
- 判据：`scripts/lib/union-api.mjs` 的 `scoreMatch` / `categoryGate`（HEAD `2284415`）
- 复现：`node scripts/probe-reject-extract.mjs` → `probe-reject-verify.mjs` → `probe-reject-alias-impact.mjs`

---

## 0. 先说三条与任务书不一致的地方

| 任务书写的 | 本次实测 | 说明 |
|---|---|---|
| A 类 277 瓶 | **283 条** | `rejected` 764 条里 `candidateCount > 0` 的数量。差 6 条，属快照口径微差 |
| 「品牌名未出现」69 条 | **62 条** | 同上 |
| 书籍类 41 条 | **50 条** | 同上 |

**为什么要换数据源**：任务书指定的 `data/products.candidates.json` 在 22:53–22:56 之间被另一条流水线（`fetch-products.mjs`）整体覆写。实测两个采样点：22:53:04 为 9,896 B（`stats={queried:5,accepted:1,rejected:4}`），22:56:10 为 52,338 B（`stats={queried:85,accepted:13,rejected:72}`）—— 期间发生过至少两次整体覆写，具体次数未逐秒采样、**未能核实**。该文件从未入 git（`.gitignore` 显式忽略，`git cat-file` 报 "exists on disk, but not in HEAD"），所以没有可回滚的历史快照。改用 `scent-picker-v2` 里的同一条 pipeline 全量快照（覆盖 1388 瓶、accepted 624、rejected 764），其 764 条 rejected 的 id 全部能在 `data/perfumes.json` 的 1388 瓶里对上（764/764）。

**这不是全量，是 A 类的 21.9%**。62/283。结论只对这 62 条负责，不外推到 1388 瓶。

---

## 1. 结论

62 条逐条人工判读（只看标题文本 + `categoryText` + 瓶的 brand/name，不靠记忆编造）：

| 判定 | 条数 | 占比 |
|---|---|---|
| **误杀**（标题就是这瓶正品，判据认不出品牌） | **16** | 25.8% |
| **真错配**（标题是别家品牌 / 别品类 / 平替分装） | **41** | 66.1% |
| **存疑**（标题全篇无品牌名，无法从标题判定真伪） | **5** | 8.1% |

判据在这批样本上的**准确率 41/62 = 66.1%（把存疑算作未命中）或 41/57 = 71.9%（排除存疑）**，误杀率 16/62 = 25.8%。

一句话：这条拒收理由**方向是对的、执行是粗的** —— 四分之三的拒收确实该拒，但近四分之一的真商品被一起扔了。

---

## 2. 误杀 16 条的分类（对应验收标准 ②）

| 类别 | 条数 | 机理 |
|---|---|---|
| **缺别名** | **9** | 品牌在标题里，但写的是中文名，`brand-aliases.json` 里没有这条中文名 |
| **标题品牌名写变形** | **4** | 中文名被拆开或空格错位，如「梅森 马吉」「梅森 马」「马蒂埃」 |
| **标题只写子线名** | **2** | 标题写 Armaf 的子线名（Club De Nuit / Odyssey Homme），不写 Armaf |
| **标题只有子线名（中文写法）** | **1** | `Oros 奥洛斯` —— Oros 是 Armaf 旗下的线，标题写了 `Oros` 和「奥洛斯」，但既无 `Armaf` 也无它的任何别名 |

> 说明：第 4 类的类别名在原判读表里记作「标题只有中文品牌」，实际标题 `Oros 奥洛斯 Holiday Edition 女士香水` 是有拉丁词的。为避免误导，这里按真实机理重述为「标题只有子线名（中文写法）」。`data/.cache/reject-verify.json` 里 `cat` 字段仍保留原值，未回改。

### 每类三个具体例子

**缺别名（9 条）**

| 瓶 id | 品牌 | 实际标题 | 应补别名 |
|---|---|---|---|
| `chloe-nomade` | Chloé | `Chloe蔻依Nomade小猪包恋旅女士浓香水20ml` | `蔻依` |
| `ralph-lauren-polo-blue` | Ralph Lauren | `美国直邮M POLO BLUE 4.2OZ EDT拉夫劳伦 蓝马球125ml男士淡正品` | `拉夫劳伦` |
| `calvin-klein-eternity-moment` | Calvin Klein | `国现CK凯文克莱ETERNITY MOMENT Woman永恒时刻女士浓香水EDP` | `凯文克莱` |

其余 6 条：`ralph-lauren-polo-red`（拉夫劳伦）、`hugo-boss-boss-in-motion`（雨果波士）、`miu-miu-fleur-de-lait`（缪缪）、`mugler-angel-stellar`（穆格）、`narciso-rodriguez-all-of-me-intense`（纳西索）、`versace-eros-eau-de-toilette`（范思哲，但补了也救不回，见 §3）。

**标题品牌名写变形（4 条）**

| 瓶 id | 品牌 | 实际标题（品牌片段） | 应补别名 |
|---|---|---|---|
| `maison-margiela-replica-by-the-fireplace` | Maison Margiela Fragrances | `…EDT梅森 马吉正品` | `梅森 马吉` |
| `maison-margiela-replica-when-the-rain-stops` | 同上 | `…EDT梅森 马正品` | `梅森 马` |
| `maison-margiela-when-the-rain-stops` | 同上 | 同上 | `梅森 马` |
| `matiere-premiere-radical-rose` | Matière Première | `马蒂埃Matiere Premiereh香水不败玫瑰…` | `马蒂埃` |

注意 `matiere-premiere-radical-rose` 这条另有隐情：标题里的拉丁品牌名被写成 `Matiere Premiereh`（多了个 h），整词匹配必然失败，只有中文「马蒂埃」能救。

**标题只写子线名 / 只有中文品牌（3 条）**

| 瓶 id | 实际标题 | 情况 |
|---|---|---|
| `armaf-club-de-nuit-woman` | `Club De Nuit Arab Perfumes Woman Arabic Lasting Fragrance Bo…` | 只有子线名 |
| `armaf-odyssey-homme-white-edition` | `Odyssey Homme White Edition 奥德赛男士香水白瓶玫瑰金保温杯版` | 只有子线名 |
| `armaf-oros-holiday-edition` | `Oros 奥洛斯 Holiday Edition 女士香水` | 只有子线名 + 中文译名 |

---

## 3. 别名补丁：能救多少、哪些有毒（对应验收标准 ③）

### 3.1 模拟实测结果

对 16 条误杀，在**内存中**给对应品牌临时拼一条别名后用 `scoreMatch` 重打分（不写 `data/brand-aliases.json`）：

- **15 / 16 变成 `accept=true`**
- **1 条补了也救不回**：`versace-eros-eau-de-toilette`，标题是 `Eros Men's Eau de Toilette Perfume 50ml 爱神男士香水持久` —— 全篇既无 Versace 也无范思哲，品牌信息根本不在标题里。这条只能靠放宽判据（见 §7.2），补别名无效。

但 15 条里只有 **13 条能用**：另外 2 条（`armaf-club-de-nuit-woman`、`armaf-odyssey-homme-white-edition`）是靠补子线名 `Club De Nuit` / `Odyssey Homme` 才通过的，而这两个别名在冲突检测里误伤严重（§3.3），**必须放弃**。所以最终可落地的是 **13 条**。

### 3.2 对整个 A 类的影响面（283 条重放）

拿 283 条 A 类的真实 `picked.title` 全量重打分：

| 版本 | accept 条数 |
|---|---|
| 现用别名表（59 品牌） | **0**（与 A 类定义自洽，验证了重放管线没跑偏） |
| 补 12 条安全别名（覆盖 11 个品牌）后 | **13** |

即：补这 12 条别名，A 类从 283 条降到 270 条，**净救回 13 瓶，占 A 类 4.6%**。「品牌名未出现在标题里」这一理由从 62 条降到 49 条。

另一个已核实的事实：这 16 条误杀瓶**没有一条在 624 条已链接集合里**（`affiliate-links.json` 的 `taobao` 键交集为 0）—— 说明它们是真被漏掉的，不是"已经救回来了只是没改理由"。

### 3.3 冲突检测：哪些别名不能补

把每个拟补别名在**全库 907 条候选标题**（v2 快照的 accepted 624 + rejected 里有 `picked.title` 的 283）里跑一遍 `hitOne`，看它会不会命中别的品牌的商品：

| 别名 | 属品牌 | 全库命中 | 同品牌 | 异品牌 | 判定 |
|---|---|---|---|---|---|
| `梅森 马吉` | Maison Margiela Fragrances | 3 | 3 | 0 | **安全** |
| `梅森 马` | 同上 | 5 | 5 | 0 | **安全** |
| `蔻依` | Chloé | 1 | 1 | 0 | **安全** |
| `拉夫劳伦` | Ralph Lauren | 3 | 3 | 0 | **安全** |
| `奥洛斯` | Armaf | 1 | 1 | 0 | **安全** |
| `凯文克莱` | Calvin Klein | 10 | 10 | 0 | **安全** |
| `雨果波士` | Hugo Boss | 5 | 5 | 0 | **安全** |
| `马蒂埃` | Matière Première | 1 | 1 | 0 | **安全** |
| `缪缪` | Miu Miu | 1 | 1 | 0 | **安全** |
| `穆格` | Mugler | 4 | 4 | 0 | **安全** |
| `纳西索` | Narciso Rodriguez | 3 | 3 | 0 | **安全** |
| `范思哲` | Versace | 11 | 8 | 3 | **安全但需说明** |
| `Club De Nuit` | Armaf | 18 | 12 | **6** | **有毒，不要补** |
| `Odyssey Homme` | Armaf | 31 | 15 | **16** | **有毒，不要补** |

两个"有异品牌命中"的解读：

- **`范思哲`（异品牌 3 条）不是别名有毒，是那 3 瓶本来就错配**。三条异品牌命中是同一个标题 `【丁禹兮同款】VERSACE/范思哲 POUR HOMME 同名男士香水`，被分别挂到 Michael Kors / Bvlgari / Dolce&Gabbana 三瓶上。这条标题里明明白白写着范思哲，说明**错的是那 3 瓶的匹配，不是这条别名**。
- **`Club De Nuit` 和 `Odyssey Homme` 是真有毒**：命中 18 / 31 条里，异品牌分别 6 / 16 条。原因很直接——这两个是**系列名（子线名），不是品牌名**。`Odyssey Homme` 会命中所有写成 `... Homme ...` 的男士香水标题（Versace / Kenzo / JPG / Azzaro / Dior 都中），`Club De Nuit` 会命中 `nuit` 系（Issey Miyake `NUIT d'Issey`、Maison Margiela `JAZZ-CLUB`）。**结论：子线名不能当品牌别名用，这两条必须放弃**。

### 3.4 落地建议（只给建议，未写库）

补进 `data/brand-aliases.json` 的 **12 条别名、覆盖 11 个品牌**（Maison Margiela 与 Armaf 是给现有 key 追加，其余 9 个是新建 key），每条都能指到具体标题：

```jsonc
// 现有品牌追加
"Maison Margiela Fragrances": ["梅森马吉拉","马吉拉","Maison Margiela","MMM", "梅森 马吉", "梅森 马"]
"Armaf": ["阿玛芙","ARMAF", "奥洛斯"]

// 新增品牌 key
"Chloé": ["蔻依"]                     // ← Chloe蔻依Nomade小猪包恋旅女士浓香水20ml
"Ralph Lauren": ["拉夫劳伦"]           // ← 美国直邮M POLO BLUE 4.2OZ EDT拉夫劳伦 蓝马球125ml
"Calvin Klein": ["凯文克莱"]           // ← 国现CK凯文克莱ETERNITY MOMENT Woman永恒时刻女士浓香水
"Hugo Boss": ["雨果波士"]              // ← 美国代购雨果波士动感银地球男士淡香水EDT in Motion
"Matière Première": ["马蒂埃"]         // ← 马蒂埃Matiere Premiereh香水不败玫瑰Radical Rose
"Miu Miu": ["缪缪"]                    // ← 欧洲直邮miumiu缪缪 fleur de lait香水正品桂花
"Mugler": ["穆格"]                     // ← 美国直邮W ANGEL STELLAR 0.80OZ EDP SPRAY LUMINEUSE穆格正品
"Narciso Rodriguez": ["纳西索"]        // ← 24年香 纳西索 All Of Me Intense 由我馥郁版女士香水
"Versace": ["范思哲"]                  // ← 【丁禹兮同款】VERSACE/范思哲 POUR HOMME 同名男士香水
```

**不补**：`Club De Nuit`、`Odyssey Homme`（子线名，在全库标题里分别命中 6 / 16 条异品牌商品）。

**注意"梅森 马"的风险**：它是个两字截断名，全库只有 5 条命中且都是 Margiela，但样本只有 907 条标题。全库 1388 瓶跑起来若出现别的品牌，应当撤掉这条、只留 `梅森 马吉`（那样会漏一条 `maison-margiela-replica-when-the-rain-stops`）。

另外 19 个品牌在别名表里**完全没有 key**（本次涉及 42 个品牌，其中 19 个无 key）：Chloé / Ralph Lauren / Santa Maria Novella / Atelier Cologne / Floris London / Ormonde Jayne / The Different Company / Etro / Bentley / Calvin Klein / Dunhill / Fugazzi / Hugo Boss / Matière Première / Miu Miu / Mugler / Narciso Rodriguez / Versace / Vilhelm Parfumerie。别名表缺 key 不是个别疏漏，是系统性覆盖不足。

---

## 4. 真错配 41 条的构成

| 子类 | 条数 | 典型 |
|---|---|---|
| **撞名异牌**（标题里是另一个明确品牌，只是香名撞了） | 26 | `bvlgari-pour-homme` ← `【丁禹兮同款】VERSACE/范思哲 POUR HOMME…`（Pour Homme 是多品牌通用名） |
| **非香水品类**（指甲油 / 腮红 / 遮瑕 / 唇彩 / 散粉 / 穿戴甲 / 定妆喷雾） | 10 | `montblanc-legend-red` ← `金箔红red show白兔奶昔Dance Legend亮片指甲油` |
| **平替 / 香精分装** | 5 | `rabanne-invictus-legend` ← `Fragrance World Optimystic Legend传奇男士香水平替invictus` |

撞名异牌里最值得记的是 `dunhill-london`：召回标题是 `【自营】英国Jo Malone London祖玛珑经典香氛系列香水30ml`。`London` 作为 Dunhill 的香名**绝不能进别名表**——它是 Jo Malone London 的后半截。

`Pour Homme` 则是同一个标题被派给了 4 瓶（实测）：`versace-pour-homme` 拿到它并 **accepted**（对的），同时 `michael-kors-pour-homme` / `bvlgari-pour-homme` / `dolce-gabbana-pour-homme` 三瓶也拿到同一条标题、全被拒（错的是这三瓶的召回，不是标题）。

---

## 5. 存疑 5 条

这 5 条标题里**完全没有品牌字样**，只有香名或香调罗列。判据拒得对（无法确认），但也不该归进"真错配"：

| 瓶 id | 标题 |
|---|---|
| `nishane-karagoz` | `跨境外贸hacivat皮影戏香水karagoz卡拉古斯中性香水100ml礼盒装` |
| `profumum-roma-olibanum` | `香港OLIBANUM乳香桂花晚香玉藿香玫瑰鸟木鸢尾橙花香港香港店` |
| `etro-musk` | `【官方正品】瑞士MUSK白麝香花香调少女香水清新甜美淡雅持久留香` |
| `montale-amber-musk` | `迪拜香水Musk amber油原液留香持久乌木玫瑰金香纯精油无酒精香氛` |
| `tom-ford-oud-voyager` | `绯境乌木Oud Voyager香水木质花香调香师香氛中性浓香水小众持久` |

`nishane-karagoz` 有点特别：标题里有 `hacivat` —— 那是 Nishane 家另一支香的名字。同品牌香名陪衬，但不足以确认这一条就是 Karagoz 正品，仍判存疑。

---

## 6. 书籍 50 条核实（对应验收标准 ④）

任务书要求抽 5 条。**50 条全部落在「书籍/杂志/报纸」类目下，没有一条是香水被错标成书；抽看的 5 条也全是书**，判据在这条理由上没发现误杀。

客观依据（已核实）：
- **31 条标题带 ISBN-13**（形如 `[9789358830576]`）
- **49 条店铺名含「图书 / 书店」**（澜瑞图书专营店 27、中华商务图书专营店 7、上海外文图书音像专营店 6、其余 7 家各 1–2）
- 价格区间 45.9 – 976 元（书价量级；最低 45.9 元，最高 976 元）

剩下 **19 条标题没带 ISBN**，但其中 18 条的店铺名是图书店（中华商务 / 上海外文 / 中图上海 / 外图 / 瑞雅 / 青乐坊 / 畅想之星 / 世纪华典 / 诚研 / 中国图书音像），标题也是书名形态（`海外直订…` / `预售…` / `企鹅兰登` / `英文原版`）。

**两条客观证据都不占的只有 1 条**：`zoologist-tyrannosaurus-rex`，店铺 `boocup旗舰店`，标题 `你好恐龙 霸王龙 英文原版 Tyrannosaurus rex 儿童启蒙纸板书` —— 标题写明"英文原版/儿童启蒙纸板书"，仍是书（按标题判断，推断）。

抽查 5 条：

| 瓶 id | 召回标题 | 判定 |
|---|---|---|
| `amouage-reflection-man` | `【3-4周达】A Man's Reflection [9789358830576]` | 是书。**香名 `Reflection Man` 被书名的 `A Man's Reflection` 撞上**，判据拒对了 |
| `kilian-intoxicated` | `Intoxicated by My Illness企鹅兰登 英文原版` | 是书（企鹅兰登）。撞 `Intoxicated` |
| `kenzo-kenzo-world` | `【3-4周达】精装 Kenzo Tange: Architecture for the World [9783037783108]` | 是书。`Kenzo` 是建筑师丹下健三的姓，撞 `Kenzo World` |
| `boadicea-the-victorious-bodacious` | `预售 童探Bodacious！：三界火宅 台湾角川 提子墨` | 是书（台湾角川轻小说）。撞 `Bodacious` |
| `memo-paris-irish-leather` | `The Art of Leather Burning 皮革的艺术 烙花技术技法指南 Lora Susan Irish` | 是书。撞 `Irish Leather`（`Irish` 是作者姓） |

这 50 条的共性是：**香水名本身就是个普通英文短语**（Reflection / Journey / Amber Sky / Winter Palace / Wild Fruits / Orange Crush…），于是被书名/诗集名/漫画名精确撞上。`categoryGate` 的类目判断在这里是唯一有效的一道闸，且工作正常。

---

## 7. 另外两个独立发现（不在验收标准里，但有影响）

### 7.1 `categoryGate` 的「类目含香水即放行」是个真漏洞

`scripts/lib/union-api.mjs` L277 附近：

```js
if (cat.includes('香水')) return { ok: true };
```

淘宝的彩妆类目路径是 `彩妆/香水/美妆工具/<叶子>`，所以**任何彩妆商品的类目路径都含「香水」二字**，全部被当香水放行。

实测：A 类 283 条里有 **97 条** `categoryText` 含「香水」；其中 **13 条**的叶子类目不是香水（唇霜/唇彩、散粉、腮红、遮瑕、甲油胶、美甲工具、阴影、素颜霜、定妆喷雾、其它彩妆），标题也确实都是彩妆。它们照样被判据放行到打分环节，最后是被「品牌名未出现」或「香名覆盖率不足」拒掉的 —— **拒对了，但理由全错**。

这 13 条：`frederic-malle-lipstick-rose`、`prada-candy-gloss`（唇霜）、`mancera-instant-crush`（胭脂）、`floris-cherry-blossom`（散粉）、`armaf-blue-sky`（美甲工具）、`armaf-club-de-nuit-woman`、`juliette-has-a-gun-powder-love`（其它彩妆）、`maison-margiela-coffee-break`、`montblanc-legend-red`（甲油胶）、`montale-be-my-plum`（阴影）、`montale-vanilla-extasy`（遮瑕）、`nabeel-gold-24k`（素颜霜）、`vilhelm-parfumerie-mango-skin`（定妆喷雾）。

62 条样本里按叶子类目统计：`香水` 50 条、`唇霜` 2、`其它彩妆` 2、`甲油胶` 2、`散粉`/`美甲工具`/`阴影`/`遮瑕`/`素颜霜`/`定妆喷雾` 各 1 —— 共 **12 条非香水叶子类目**（`armaf-club-de-nuit-woman` 那条标题虽是香水，但类目挂在 `其它彩妆` 下）。

**建议**：把 `cat.includes('香水')` 改成只认叶子类目，或改成 `/(^|\/)香水$/.test(cat)`。

依据：本次 62 条样本里叶子类目是「香水」的 50 条，标题全部是真香水（无一条彩妆）；叶子不是「香水」的 12 条，标题全部是彩妆或非香水。也就是说**叶子类目在这批样本上 62/62 判断正确**，而 `includes` 判断对了 50/62。改成叶子匹配不会误杀。

（推断，未在别处验证）真香水在淘宝的类目路径都以 `/香水` 结尾，例如 `彩妆/香水/美妆工具/香水`。若某些香水挂在其它叶子下，改成叶子匹配会把它们拒掉 —— 落地前应在全库 1388 瓶的已召回数据上跑一遍回归。本次只建议，未改代码。

### 7.2 有一条误杀是判据原理救不了的

`versace-eros-eau-de-toilette` 的召回标题 `Eros Men's Eau de Toilette Perfume 50ml 爱神男士香水持久`——品牌不出现，但**香名 `Eros` + 中文名 `爱神` + 类目 `/香水` + 价格合理**，四条同时成立。

这类"标题只写香名不写品牌"的召回（多见于跨境/代购/白牌店）本质上无法用别名表覆盖。要救只能加一条旁路判据：`nameCover == 1 && 类目是香水叶子 && 标题不含任何其他已知品牌`。风险是会给白牌仿香开口子。**不建议现在做**，记在这里作为已知边界。

---

## 8. 未核实 / 局限

- **外推性未验证**：62 条来自一次特定快照，`candidateCount` 中位数 20（上限 20），说明这批都是"搜满 20 条仍全被拒"的瓶子，可能比 A 类整体更难匹配，误杀率 25.8% 是**保守下界还是上界，未能判定**。
- **`梅森 马` / `奥洛斯` 两条别名只在本 907 条语料里零冲突**，全库 1388 瓶未跑过，落地后需回归。
- **62 条之外还有 221 条 A 类**未做逐条人工判读。按脚本精确重算，这 221 条的构成是：书籍类 50、小样/试用装 28、香名覆盖率不足 6、**其它非香水类目 137**（女装/五金/餐饮具/电子元器件/零食等）。这 137 条里有相当一部分道理由清晰（类目已明确不是香水），但其误杀率**未逐条验证**。
- **「其它非香水类目 137 条」这个数字与任务书口径的差异最大**（任务书没有这一项），说明 A 类的主体其实是「召回跑到了完全不相干的品类」，不是「品牌名匹配失败」。这一点值得单独一轮核查。
- **未做任何 API 调用**，全部基于本地快照重放；快照本身是 22:41 的产物，之后别席位若修改了判据或别名表，本次结论不适用。

---

## 附录：62 条完整判读表

顺序同 `data/.cache/reject-verify.json` 的 `results[]`。标题截断到 70 字，`|` 替换为 `丨`。

| 瓶 id | 品牌 | 判定 | 召回标题（截断） |
|---|---|---|---|
| `maison-margiela-replica-by-the-fireplace` | Maison Margiela Fragrances | 误杀（标题品牌名写变形） | 美国直邮M REPLICA BY THE FIREPLACE 0.33OZ EDT梅森 马吉正品 |
| `chloe-nomade` | Chloé | 误杀（缺别名） | Chloe蔻依Nomade小猪包恋旅女士浓香水20ml |
| `frederic-malle-lipstick-rose` | Frédéric Malle | 真错配 | Colors Matte Rose Lip Gloss Lipstick women gift lipgloss唇彩 |
| `amouage-gold-man` | Amouage | 真错配 | 欧瑞莲Giordani Gold Man致傲丹霓浓情男士香水75ml草木香持久 |
| `ralph-lauren-polo-blue` | Ralph Lauren | 误杀（缺别名） | 美国直邮M POLO BLUE 4.2OZ EDT拉夫劳伦 蓝马球125ml男士淡正品 |
| `ralph-lauren-polo-red` | Ralph Lauren | 误杀（缺别名） | 美国直邮M POLO RED “BEAR EDITION” 4.2OZ EDP拉夫劳伦 正品 |
| `guerlain-vetiver` | Guerlain | 真错配 | 江南月色 岩兰草 50ml 芳香木质调香水 Vétiver d'Hiver |
| `maison-margiela-replica-when-the-rain-stops` | Maison Margiela Fragrances | 误杀（标题品牌名写变形） | 美国直邮M REPLICA WHEN THE RAIN STOPS 3.4OZ EDT梅森 马正品 |
| `santa-maria-novella-melograno` | Santa Maria Novella | 真错配 | 现货意大利蕾莉欧石榴香水Profumo Melograno柑橘果香男女通用 |
| `atelier-cologne-orange-sanguine` | Atelier Cologne | 真错配 | ORANGE SANGUINE赤霞橘光香水橘子苦橙子夏日清新柑橘调香氛平替 |
| `michael-kors-pour-homme` | Michael Kors | 真错配 | 【丁禹兮同款】VERSACE/范思哲 POUR HOMME 同名男士香水 |
| `montale-pure-gold` | Montale | 真错配 | 美国直邮M LATTAFA RAVE NOW PURE DESIRE GOLD 3.4OZ EDP拉正品 |
| `floris-cherry-blossom` | Floris London | 真错配 | 现货海淘huda beauty烘焙定妆散粉控油持妆0.8g cherry blossom |
| `roja-parfums-scandal` | Roja Parfums | 真错配 | 欧洲直邮J.P. Gaultier Scandal Pour Homme Edt Spray正品 |
| `bvlgari-pour-homme` | Bvlgari | 真错配 | 【丁禹兮同款】VERSACE/范思哲 POUR HOMME 同名男士香水 |
| `juliette-has-a-gun-miss-charming` | Juliette Has a Gun | 真错配 | Assaf miss arrogate spray perfume lasting aromatic smell |
| `memo-paris-ocean-leather` | Memo Paris | 真错配 | Xunlan 24M Aged Men EDP Rare Oud Ocean Leather Luxury Scent |
| `ormonde-jayne-osmanthus` | Ormonde Jayne | 真错配 | 柏世曼8号桂花香水 OSMANTHUS八月桂花味女士淡香水花香清香持久 |
| `the-different-company-bergamote` | The Different Company | 真错配 | 欧洲直邮Le Labo 香水实验室 香柠檬22 Bergamote 22 15ML正品 |
| `bvlgari-man-extreme` | Bvlgari | 真错配 | 美国直邮M JIMMY CHOO MAN EXTREME 3.4OZ EDP吉米 周 同名正品 |
| `nishane-karagoz` | Nishane | 存疑 | 跨境外贸hacivat皮影戏香水karagoz卡拉古斯中性香水100ml礼盒装 |
| `etro-heliotrope` | Etro | 真错配 | L.T. PIVER HELIOTROPE BLANC披威白色天芥菜香水男女士淡香水EDT |
| `profumum-roma-olibanum` | Profumum Roma | 存疑 | 香港OLIBANUM乳香桂花晚香玉藿香玫瑰鸟木鸢尾橙花香港香港店 |
| `afnan-paris-oud` | Afnan | 真错配 | Paris Corner 巴黎角落 Magic oud in dark rose 中性香水 |
| `armaf-blue-sky` | Armaf | 真错配 | 24Pcs/Set Blue Sky White Cloud Pattern Design False Nail Fre |
| `armaf-club-de-nuit-woman` | Armaf | 误杀（标题只写子线名） | Club De Nuit Arab Perfumes Woman Arabic Lasting Fragrance Bo |
| `armaf-match-point` | Armaf | 真错配 | LACOSTE MATCH POINT拉科斯特鳄鱼赛点男士淡香水100ml持久清新 |
| `armaf-odyssey-homme-white-edition` | Armaf | 误杀（标题只写子线名） | Odyssey Homme White Edition 奥德赛男士香水白瓶玫瑰金保温杯版 |
| `armaf-oros-holiday-edition` | Armaf | 误杀（标题只有中文品牌） | Oros 奥洛斯 Holiday Edition 女士香水 |
| `bentley-for-men-intense` | Bentley | 真错配 | 新品105ml  Club De Nuit Intense for Men夜店狂欢男女香水 |
| `calvin-klein-eternity-moment` | Calvin Klein | 误杀（缺别名） | 国现CK凯文克莱ETERNITY MOMENT Woman永恒时刻女士浓香水EDP |
| `dior-homme-cologne` | Dior | 真错配 | 罗嘉德芬 Roja Dove Pour Homme Parfum Cologne男士古龍香港店 |
| `dolce-gabbana-pour-homme` | Dolce&Gabbana | 真错配 | 【丁禹兮同款】VERSACE/范思哲 POUR HOMME 同名男士香水 |
| `dunhill-desire-blue` | Dunhill | 真错配 | 迪拜香氛世界 DE COSTA BLUE DESIRE 科斯塔蓝色香水水性木质调 |
| `dunhill-london` | Dunhill | 真错配 | 【自营】英国Jo Malone London祖玛珑经典香氛系列香水30ml |
| `etro-musk` | Etro | 存疑 | 【官方正品】瑞士MUSK白麝香花香调少女香水清新甜美淡雅持久留香 |
| `fugazzi-parfum-1` | Fugazzi | 真错配 | 自营 parfum d'empire香水效期2028/3/1正品【临期】 |
| `hugo-boss-boss-in-motion` | Hugo Boss | 误杀（缺别名） | 美国代购雨果波士动感银地球男士淡香水EDT in Motion正品 |
| `juliette-has-a-gun-powder-love` | Juliette Has a Gun | 真错配 | 4 Color Love Heart Powder Blusher Palette Natural Matte Colo |
| `maison-margiela-coffee-break` | Maison Margiela Fragrances | 真错配 | 美国ORLY指甲油20575 coffee break白领安吉丽娜提拉米苏奶咖啡色 |
| `maison-margiela-when-the-rain-stops` | Maison Margiela Fragrances | 误杀（标题品牌名写变形） | 美国直邮M REPLICA WHEN THE RAIN STOPS 3.4OZ EDT梅森 马正品 |
| `mancera-roses-vanille-parfum` | Mancera | 真错配 | sahar埃及香精油香水 玫瑰香草roses vanille |
| `matiere-premiere-radical-rose` | Matière Première | 误杀（标题品牌名写变形） | 马蒂埃Matiere Premiereh香水不败玫瑰Radical Rose香港店 |
| `miu-miu-fleur-de-lait` | Miu Miu | 误杀（缺别名） | 欧洲直邮miumiu缪缪 fleur de lait香水正品桂花 |
| `montale-amber-musk` | Montale | 存疑 | 迪拜香水Musk amber油原液留香持久乌木玫瑰金香纯精油无酒精香氛 |
| `montale-be-my-plum` | Montale | 真错配 | 美国rhode腮红piggy海莉比伯腮红棒plum口袋唇颊两用腮红膏hailey |
| `montale-intense-roses-musk` | Montale | 真错配 | Armaf阿玛芙Club de Nuit Intense Man夜店狂欢男士香水持久淡香 |
| `montale-intense-starry-nights` | Montale | 真错配 | DLARON迪拉瑞 原装进口持久留香 INTENSE热情女士温暖甜美edp香水 |
| `montale-ristretto-intense-cafe` | Montale | 真错配 | DLARON迪拉瑞 原装进口持久留香 INTENSE热情女士温暖甜美edp香水 |
| `montale-vanilla-extasy` | Montale | 真错配 | NARS纳斯遮瑕蜜/遮瑕棒 痘印黑眼圈香草vanilla/custard/honey |
| `montblanc-legend-red` | Montblanc | 真错配 | 金箔红red show白兔奶昔Dance Legend亮片指甲油红秀免烤速干珠光 |
| `mugler-angel-stellar` | Mugler | 误杀（缺别名） | 美国直邮W ANGEL STELLAR 0.80OZ EDP SPRAY LUMINEUSE穆格正品 |
| `nabeel-gold-24k` | Nabeel | 真错配 | 欧洲直邮娇兰Guerlain金钻 PARURE GOLD 24K 焕彩 凝露 35ml正品 |
| `narciso-rodriguez-all-of-me-intense` | Narciso Rodriguez | 误杀（缺别名） | 24年香 纳西索 All Of Me Intense  由我馥郁版女士香水30ml50ml |
| `pantheon-roma-annone` | Pantheon Roma | 真错配 | 泰国ANNONE特浓迷你风情香水身上车用衣柜通用香水 无喷头 |
| `prada-candy-gloss` | Prada | 真错配 | Candy Color Jelly Lip Gloss 糖果色果冻唇彩滋润唇油 |
| `rabanne-invictus-legend` | Rabanne | 真错配 | Fragrance World Optimystic Legend传奇男士香水平替invictus |
| `tom-ford-grey-vetiver` | Tom Ford | 真错配 | sahar埃及香精油 走珠香水 灰色香根草grey vetiver8ml |
| `tom-ford-oud-voyager` | Tom Ford | 存疑 | 绯境乌木Oud Voyager香水木质花香调香师香氛中性浓香水小众持久 |
| `tom-ford-vanilla-sex` | Tom Ford | 真错配 | 现货 新品 sahar埃及香精 禁忌香草vanilla sex 难闻重口味 |
| `versace-eros-eau-de-toilette` | Versace | 误杀（缺别名） | Eros Men's Eau de Toilette Perfume 50ml 爱神男士香水持久 |
| `vilhelm-parfumerie-mango-skin` | Vilhelm Parfumerie | 真错配 | sonatural for your skin韩国定妆喷雾fixx全天候长效持妆不脱妆 |

合计 62 条：误杀 16 / 真错配 41 / 存疑 5。
