# 金标准定稿（CONTROL.md 第 1 步产出）

> 日期 2026-11-10 · 基线 commit `2938342` · 落成脚本 `scripts/test-gold.mjs`
> 上游草稿 `docs/GOLD-STANDARD-DRAFT.md`（Muse 用原始字段筛出，未跑现行权重）

## 一、这份文件定的是什么

12 个画像，每个画像 = 一组问卷答案 + 3–5 瓶「人判定推对了」的瓶子。
判定依据只用**原始字段**（`families` / `character` / `notesAll` / `seasons` / `timesOfDay`），
不看 `recommend()` 的输出 —— 跑了就等于用引擎定义答案，命中率恒为 100%，测了也没用。

两个判据：

| 判据 | 定义 | 含义 |
|---|---|---|
| MAJORITY | top3 里命中 ≥2 瓶 | 用户翻前三张卡，至少两张是对的 |
| STRICT | top1 命中 | 第一张卡就是对的 |

## 二、首跑基线（这是后续所有打分改动的对照）

```
MAJORITY（top3 命中≥2）: 2/12 = 16.7%
STRICT  （top1 命中）  : 4/12 = 33.3%
```

| 画像 | 场景 | top3 命中 | top1 | 引擎 top5 |
|---|---|---|---|---|
| P01 | 清冷感·办公室男生·怕甜 | 0/3 | · | creed-viking / armaf-eter-desert-breeze / fugazzi-parfum-1 / moschino-toy-2-pearl / dior-joy-by-dior |
| P02 | 怕晕白花·日常女生 | 1/3 | ✓ | mfk-aqua-universalis / creed-acqua-fiorentina / atelier-cologne-orange-sanguine / afnan-supremacy-in-heaven / armaf-dunescape |
| P03 | 温暖约会·秋冬 | 0/3 | · | zoologist-camel / byredo-havana-tonka / montale-dallachai / juliette-has-a-gun-pear-inc / parfums-de-marly-oajan |
| P04 | 干净皂感·上课 | 0/3 | · | creed-green-irish-tweed / orto-parisi-megamare / azzaro-chrome-toilette / trussardi-riflesso / maison-margiela-replica-when-the-rain-stops |
| P05 | 运动清爽·夏天白天 | 1/3 | ✓ | mfk-aqua-universalis / nicolai-cologne-sologne / orto-parisi-bergamask / roja-parfums-oceania / roberto-cavalli-paradiso |
| P06 | 神秘夜晚 | 0/3 | · | parfums-de-marly-delina-exclusif / armaf-christian-provenzano-i / afnan-edict-amberythme / jean-paul-gaultier-la-favorite / byredo-de-los-santos |
| P07 | 甜美不腻·果香花香 | 0/3 | · | dior-dune / tommy-hilfiger-tommy-girl / creed-aventus / guerlain-aqua-allegoria-florabloom / jo-malone-red-roses |
| P08 | 正式场合·稳重 | 0/3 | · | widian-black-ii / armaf-eter-desert-breeze / prada-les-infusions-iris / bentley-for-men-intense / lattafa-his-confession |
| P09 | 茶香草本 | **2/3** | ✓ | creed-green-irish-tweed / jo-malone-wood-sage-and-sea-salt / azzaro-chrome-toilette / bvlgari-eau-parfumee-the-imperial / dolce-gabbana-k-by-dolce-and-gabbana |
| P10 | 皮革感小众 | 0/3 | · | armaf-christian-provenzano-i / gucci-gucci-pour-homme / ajmal-oud-mist / nishane-afrika-olifant / bvlgari-man-extreme |
| P11 | 夏日清凉·讨厌琥珀 | **2/3** | ✓ | mfk-aqua-universalis / creed-silver-mountain-water / nicolai-cologne-sologne / orto-parisi-bergamask / roja-parfums-oceania |
| P12 | 奶香柔软 | 0/3 | · | issey-miyake-pleats-please / armaf-magnificent-satin / kilian-flower-of-immortality / jean-paul-gaultier-le-beau-paradise-garden / guerlain-shalimar |

逐画像 gold 进 top5：P01 0/5、P02 1/5、P03 0/5、P04 0/5、P05 1/5、P06 0/5、P07 0/5、P08 0/5、P09 2/5、P10 0/4、P11 2/5、P12 0/5。

## 三、从草稿到定稿：划掉了什么、为什么

`scripts/audit-gold.mjs` 只读原始字段逐条判硬冲突，划掉 7 处：

| 画像 | 划掉 | 硬冲突证据 |
|---|---|---|
| P01 | `creed-aventus` | gourmand 0.50，而该画像 dislikedFamilies 含 gourmand |
| P01 | `kilian-angels-share` | gourmand 1.00 + character 含 sweet，且不含 timesOfDay:day |
| P02 | `kilian-angels-share` | 不含 day |
| P05 | `creed-aventus` | 沾 gourmand |
| P05 | `byredo-gypsy-water` | 沾 amber + character 含 warm，画像要凉爽 |
| P05 | `parfums-de-marly-layton` | 沾 gourmand + sweet/warm |
| P08 | `creed-aventus` | 沾 gourmand |
| P09 | `byredo-gypsy-water` | 沾 amber |
| P09 | `parfums-de-marly-layton` | 沾 gourmand + sweet |

替补全部限池内 id，逐条理由写在 `scripts/test-gold.mjs` 的注释里。
P03 草稿候选无硬冲突，5 瓶全保留；P10 保留原 4 瓶。

## 四、**关键发现：金标准与引擎在「家族」这条轴上不一致（54.2%）**

59 个 gold 瓶子里，「主族 = 画像所选家族」只有 **32/59 = 54.2%**：

| 画像 | 意图家族 | gold 主族命中 |
|---|---|---|
| P01 | woody | 1/5 |
| P02 | citrus | 2/5 |
| P03 | amber | 2/5 |
| P04 | fresh | 1/5 |
| P05 | citrus | 4/5 |
| P06 | amber | 3/5 |
| P07 | floral | 4/5 |
| P08 | woody | 3/5 |
| P09 | fresh | 3/5 |
| P10 | amber | 1/4 |
| P11 | citrus | 4/5 |
| P12 | floral | 5/5 |

典型：P01 选 woody，但银山水主族是 citrus、wood-sage 主族是 fresh、碧蓝主族是 fresh。
家族因子占 86 分（emotionFamily 30 + occasionFamily 22 + familyPick 34），
这些瓶子在家族这一项上拿不到分，被 creed-viking（woody 1.00）稳稳压住。

**这不是引擎 bug，是 CONTROL.md §3 第 2 步「家族多标签稀释」的同一个问题在答案侧的投影**：
数据源给每瓶挂了中位数 3 个家族（Aventus 挂 5 个），「主族」本身就是一个不稳的量，
拿它当 86 分的地基，等于把推荐质量押在一个方差极大的字段上。

## 五、诊断：引擎靠什么赢，缺什么

`_probe/q-why.mjs` 展开 P01：

- answers 的 families 向量 = woody 0.98 / fresh 0.22 / citrus 0.20
- top1 `creed-viking` 145.8 分，理由「主体就是木质调，底下垫着清新调 / 厚重感 0.2 对上 / 偏凉一路」
- gold 5 瓶（银山水、水之交响、爱尔兰绿花呢、鼠尾草与海盐、碧蓝）**全部掉出 top5**

结论：现行引擎把「主族命中 + 强度匹配 + 冷暖方向」这三样吃满就赢定了，
**完全没有用到 `notesAll` 层面的区分**。银山水的茶+黑加仑与维京的薄荷+薰衣草，
在家族向量上同构（都 woody 主族 + fresh 次族），引擎分会一模一样。
`likedNotes`(14) `emotionNotes`(22) 合起来 36 分，压在 86 分的家族分底下，翻不了盘。

P03 同理：top1 `zoologist-camel`（amber 1 + gourmand 0.5，热榜第 937 位）152.4 分。

## 六、下一步（CONTROL.md 第 2 步的候选方向）

不在这份文件里预先决定，但要带着两个已知约束去选：

1. 家族分 86 是总分的最大单项，任何调整都会大范围换手 —— 必须用这份金标准量 delta。
2. gold 与 answers 在家族轴上本就不一致（54.2%），所以**单纯改主族或按 1/√n 衰减都可能把 gold 推得更远**：
   P01 的 gold 主族分别是 citrus / fresh / fresh，衰减主族权重会让 woody 瓶子优势变小，
   方向对；但 P07/P12 的 gold 主族命中 4/5 与 5/5，衰减会伤到它们。需要一次 A/B 而不是拍脑袋。

## 七、地板（不是目标）

`scripts/test-gold.mjs` 用 **回归地板** 判定，不是「12/12 全过」：

```js
const FLOOR_MAJORITY = 2;   // /12
const FLOOR_STRICT = 4;     // /12
```

理由：引擎现在只有 16.7%，要求全过等于测试从第一天起就红，红久了没人看，比没有测试更糟。
地板守的是「这次改动不许让命中率变差」，正好对上 CONTROL.md 的
「commit 信息里写明命中率前后值，没有 delta 的打分改动不许合并」。
命中率上升时脚本打印 delta 并提示可以抬地板，抬不抬由人决定。

`scripts/check-head.mjs` 已接入，用独立的 `GOLD` 判据（`minMajority: 2, minStrict: 4`），
从 `test-gold.mjs` 输出的 `GOLD MAJORITY a/12 STRICT b/12` 那一行读 ——
不与其它套件的 `PASS n / FAIL n` 混在一起，因为「PASS 2 FAIL 10」会被读成「十个画像写错了」。
