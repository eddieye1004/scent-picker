# 32 类分类体系的六维量化（evidence5）

**前提**：`perfumes.json` 无 subfamily 字段，只有族级 `families` 权重。因此"每类瓶数"是**代理指标**——该类登记原料在族内的命中瓶数，不等于官方分类。指标定义：

| 指标 | 定义 |
|---|---|
| N（瓶数） | 族内命中该类至少一个登记原料的瓶数（代理） |
| 占比 | N ÷ 该族瓶数 |
| 同质性 | 命中 ≥2 个自身登记原料的"核心瓶"占比 |
| 互斥性 | 与最相近兄弟类的重叠系数 \|A∩B\|/min(\|A\|,\|B\|)，越低越好 |
| 独占率 | 只命中本类、不命中任何兄弟类的占比 |
| 误分率 | 1 − 独占率 |

## 柑橘调 citrus（族 425 瓶 · 4 类）

| 类 | N 瓶（概念口径） | 占比 | 权重 1.00 / 0.5–0.99 / <0.5 | 核心瓶 | 独占率 | 最近兄弟(重叠) | top3 共现原料（已排除通用底料） | 代表实例 |
|---|---|---|---|---|---|---|---|---|
| 古龙水型 `cologne` | 320 | 75.3% | 87 / 146 / 87 | 53% | 14% | 芳香柑橘 99% | orange 15% · lavender 14% · apple 12% | Creed Aventus；Creed Silver Mountain Water |
| 青绿柑橘 `green-citrus` | 75 | 17.6% | 34 / 35 / 6 | 13% | 15% | 古龙水型 80% | grapefruit 65% · petitgrain 35% · neroli 16% | Versace Pour Homme；Creed Himalaya |
| 柑橘花香 `citrus-floral` | 176 | 41.4% | 53 / 65 / 58 | 18% | 17% | 古龙水型 82% | orange 30% · peach 15% · apple 14% | Creed Aventus；Creed Silver Mountain Water |
| 芳香柑橘 `aromatic-citrus` | 225 | 52.9% | 71 / 114 / 40 | 18% | 0% | 古龙水型 99% | lavender 20% · grapefruit 14% · orange 13% | Creed Aventus；Creed Silver Mountain Water |

## 花香调 floral（族 789 瓶 · 6 类）

| 类 | N 瓶（概念口径） | 占比 | 权重 1.00 / 0.5–0.99 / <0.5 | 核心瓶 | 独占率 | 最近兄弟(重叠) | top3 共现原料（已排除通用底料） | 代表实例 |
|---|---|---|---|---|---|---|---|---|
| 玫瑰 `rose` | 318 | 40.3% | 174 / 95 / 49 | 12% | 32% | 绿叶花香 75% | geranium 20% · iris 15% · ylang-ylang 12% | Guerlain Shalimar；Guerlain Mitsouko |
| 白花 `white-floral` | 287 | 36.4% | 181 / 73 / 33 | 24% | 30% | 单一花 53% | ylang-ylang 24% · tuberose 19% · iris 17% | Guerlain Shalimar；Creed Aventus |
| 果香花香 `fruity-floral` | 153 | 19.4% | 90 / 48 / 15 | 12% | 16% | 玫瑰 54% | blackcurrant 41% · peach 40% · peony 31% | Creed Aventus；Guerlain Mitsouko |
| 粉感花香 `powdery-floral` | 174 | 22.1% | 75 / 63 / 36 | 18% | 25% | 玫瑰 50% | iris 56% · violet 36% · heliotrope 18% | Guerlain Shalimar；Byredo Gypsy Water |
| 绿叶花香 `green-floral` | 83 | 10.5% | 42 / 21 / 20 | 5% | 7% | 玫瑰 75% | lily of the valley 67% · violet leaf 29% · iris 19% | Creed Green Irish Tweed；Parfums de Marly Pegasus |
| 单一花 `soliflore` | 110 | 13.9% | 86 / 18 / 6 | 11% | 17% | 白花 53% | magnolia 32% · gardenia 32% · freesia 30% | Jo Malone London English Pear & Freesia；Viktor&Rolf Flowerbomb |

## 木质调 woody（族 534 瓶 · 6 类）

| 类 | N 瓶（概念口径） | 占比 | 权重 1.00 / 0.5–0.99 / <0.5 | 核心瓶 | 独占率 | 最近兄弟(重叠) | top3 共现原料（已排除通用底料） | 代表实例 |
|---|---|---|---|---|---|---|---|---|
| 檀木 `sandalwood` | 153 | 28.7% | 72 / 53 / 28 | 0% | 11% | 苔藓木质 69% | cardamom 18% · nutmeg 17% · oakmoss 16% | Kilian Paris Angels' Share；Frédéric Malle Portrait of a Lady |
| 干燥木质 `dry-woody` | 238 | 44.6% | 122 / 60 / 56 | 10% | 4% | 芳香木质 89% | cardamom 18% · oakmoss 18% · lavender 15% | Maison Francis Kurkdjian Baccarat Rouge 540；Parfums de Marly Layton |
| 香根草 `vetiver` | 144 | 27.0% | 81 / 42 / 21 | 2% | 7% | 苔藓木质 66% | pepper 20% · lavender 19% · leather 17% | Byredo Bal d'Afrique；Parfums de Marly Delina |
| 苔藓木质 `mossy` | 333 | 62.4% | 147 / 95 / 91 | 37% | 20% | 檀木 69% | oakmoss 23% · cardamom 18% · pepper 17% | Creed Aventus；Parfums de Marly Layton |
| 芳香木质 `woody-aromatic` | 230 | 43.1% | 115 / 58 / 57 | 13% | 2% | 干燥木质 89% | oakmoss 18% · cardamom 17% · leather 14% | Creed Aventus；Maison Francis Kurkdjian Baccarat Rouge 540 |
| 乌木 `oud` | 135 | 25.3% | 41 / 36 / 58 | 25% | 17% | 苔藓木质 63% | saffron 52% · oud 44% · labdanum 30% | Maison Francis Kurkdjian Baccarat Rouge 540；Yves Saint Laurent La Nuit de L'Homme |

## 东方琥珀调 amber（族 519 瓶 · 6 类）

| 类 | N 瓶（概念口径） | 占比 | 权重 1.00 / 0.5–0.99 / <0.5 | 核心瓶 | 独占率 | 最近兄弟(重叠) | top3 共现原料（已排除通用底料） | 代表实例 |
|---|---|---|---|---|---|---|---|---|
| 香草琥珀 `vanilla-amber` | 340 | 65.5% | 48 / 108 / 184 | 32% | 37% | 树脂 95% | cardamom 15% · labdanum 15% · saffron 14% | Guerlain Shalimar；Byredo Gypsy Water |
| 辛香琥珀 `spicy-amber` | 184 | 35.5% | 17 / 89 / 78 | 24% | 8% | 香草琥珀 67% | cardamom 43% · saffron 38% · cinnamon 35% | Parfums de Marly Layton；Kilian Paris Angels' Share |
| 冷焚香 `incense-cold` | 89 | 17.1% | 30 / 37 / 22 | 2% | 4% | 香草琥珀 71% | incense 52% · frankincense 44% · leather 27% | Byredo Gypsy Water；Parfums de Marly Herod |
| 暖焚香 `incense-warm` | 136 | 26.2% | 29 / 64 / 43 | 15% | 0% | 香草琥珀 82% | cinnamon 48% · benzoin 35% · incense 34% | Byredo Gypsy Water；Kilian Paris Angels' Share |
| 树脂 `resinous` | 100 | 19.3% | 35 / 44 / 21 | 22% | 0% | 香草琥珀 95% | labdanum 50% · benzoin 48% · myrrh 25% | Maison Francis Kurkdjian Grand Soir；Yves Saint Laurent La Nuit de L'Homme |
| 皮革 `leather` | 138 | 26.6% | 20 / 60 / 58 | 12% | 11% | 香草琥珀 67% | leather 53% · saffron 51% · oud 26% | Montale Arabians Tonka；Mancera Red Tobacco |

## 清新调 fresh（族 698 瓶 · 4 类）

| 类 | N 瓶（概念口径） | 占比 | 权重 1.00 / 0.5–0.99 / <0.5 | 核心瓶 | 独占率 | 最近兄弟(重叠) | top3 共现原料（已排除通用底料） | 代表实例 |
|---|---|---|---|---|---|---|---|---|
| 水生 `aquatic` | 17 | 2.4% | 9 / 3 / 5 | 0% | 29% | 茶香 47% | salt 53% · mint 29% · melon 29% | Jo Malone London Wood Sage & Sea Salt；Armaf Club de Nuit Iconic |
| 绿意 `green` | 51 | 7.3% | 19 / 9 / 23 | 4% | 39% | 茶香 47% | violet leaf 41% · fig 35% · galbanum 22% | Creed Green Irish Tweed；Parfums de Marly Pegasus |
| 馥奇 `fougere` | 247 | 35.4% | 77 / 35 / 135 | 19% | 39% | 茶香 58% | lavender 51% · oakmoss 31% · cardamom 15% | Creed Aventus；Parfums de Marly Layton |
| 茶香 `tea` | 381 | 54.6% | 68 / 42 / 271 | 24% | 57% | 馥奇 58% | lavender 18% · oakmoss 14% · grapefruit 11% | Creed Aventus；Maison Francis Kurkdjian Baccarat Rouge 540 |

## 美食调 gourmand（族 340 瓶 · 2 类）

| 类 | N 瓶（概念口径） | 占比 | 权重 1.00 / 0.5–0.99 / <0.5 | 核心瓶 | 独占率 | 最近兄弟(重叠) | top3 共现原料（已排除通用底料） | 代表实例 |
|---|---|---|---|---|---|---|---|---|
| 香草美食 `vanilla-gourmand` | 222 | 65.3% | 107 / 86 / 29 | 23% | 67% | 果味美食 59% | lavender 12% · blackcurrant 11% · apple 11% | Guerlain Shalimar；Creed Aventus |
| 果味美食 `fruity-gourmand` | 124 | 36.5% | 25 / 62 / 37 | 22% | 41% | 香草美食 59% | apple 41% · blackcurrant 35% · peach 30% | Creed Aventus；Parfums de Marly Layton |

## 柑橘族三小类瓶级重叠

| 对 | 各自瓶数 | 交集 | 重叠系数 | 判定 |
|---|---|---|---|---|
| 芳香柑橘 × 青绿柑橘 | 225 × 75 | 50 | 67% | 高度冗余 |
| 芳香柑橘 × 柑橘花香 | 225 × 176 | 95 | 54% | 高度冗余 |
| 青绿柑橘 × 柑橘花香 | 75 × 176 | 33 | 44% | 中度重叠 |
| 古龙水型 × 芳香柑橘 | 320 × 225 | 222 | 99% | 高度冗余 |
| 古龙水型 × 青绿柑橘 | 320 × 75 | 60 | 80% | 高度冗余 |
| 古龙水型 × 柑橘花香 | 320 × 176 | 144 | 82% | 高度冗余 |

三小类"只属于自己"的瓶数（古龙水型作为竞争者一并计入）：芳香 **1** / 青绿 **11** / 花香 **30**。

## 木质族内部撞形

- **檀木**：N=153，最近 苔藓木质 重叠 69%（交集 106 瓶），独占率 11%
- **干燥木质**：N=238，最近 芳香木质 重叠 89%（交集 205 瓶），独占率 4%
- **香根草**：N=144，最近 苔藓木质 重叠 66%（交集 95 瓶），独占率 7%
- **苔藓木质**：N=333，最近 檀木 重叠 69%（交集 106 瓶），独占率 20%
- **芳香木质**：N=230，最近 干燥木质 重叠 89%（交集 205 瓶），独占率 2%
- **乌木**：N=135，最近 苔藓木质 重叠 63%（交集 85 瓶），独占率 17%

## 按总分排序（6 项满分 30）

| 排名 | 类 | 总分 | 互斥 | 同质 | 语义 | 覆盖 | 误分 | 可辨 |
|---|---|---|---|---|---|---|---|---|
| 1 | 美食调·香草美食 | **21** | 2 | 2 | 5 | 5 | 3 | 4 |
| 2 | 清新调·茶香 | **20** | 2 | 2 | 4 | 5 | 3 | 4 |
| 3 | 美食调·果味美食 | **19** | 2 | 2 | 5 | 5 | 2 | 3 |
| 4 | 花香调·白花 | **17** | 2 | 2 | 5 | 5 | 1 | 2 |
| 5 | 木质调·苔藓木质 | **17** | 1 | 3 | 5 | 5 | 1 | 2 |
| 6 | 东方琥珀调·香草琥珀 | **17** | 1 | 3 | 4 | 5 | 1 | 3 |
| 7 | 清新调·馥奇 | **17** | 2 | 2 | 4 | 5 | 1 | 3 |
| 8 | 柑橘调·古龙水型 | **16** | 1 | 4 | 4 | 5 | 1 | 1 |
| 9 | 花香调·玫瑰 | **16** | 1 | 1 | 5 | 5 | 1 | 3 |
| 10 | 花香调·果香花香 | **15** | 2 | 1 | 5 | 4 | 1 | 2 |
| 11 | 花香调·粉感花香 | **15** | 2 | 1 | 5 | 4 | 1 | 2 |
| 12 | 木质调·乌木 | **15** | 1 | 2 | 5 | 4 | 1 | 2 |
| 13 | 东方琥珀调·辛香琥珀 | **15** | 1 | 2 | 5 | 5 | 1 | 1 |
| 14 | 柑橘调·柑橘花香 | **14** | 1 | 1 | 4 | 5 | 1 | 2 |
| 15 | 柑橘调·芳香柑橘 | **14** | 1 | 2 | 4 | 5 | 1 | 1 |
| 16 | 木质调·干燥木质 | **14** | 1 | 1 | 5 | 5 | 1 | 1 |
| 17 | 东方琥珀调·树脂 | **14** | 1 | 2 | 5 | 4 | 1 | 1 |
| 18 | 清新调·绿意 | **14** | 2 | 1 | 5 | 2 | 1 | 3 |
| 19 | 花香调·单一花 | **13** | 2 | 1 | 4 | 3 | 1 | 2 |
| 20 | 木质调·檀木 | **13** | 1 | 1 | 4 | 5 | 1 | 1 |
| 21 | 木质调·香根草 | **13** | 1 | 1 | 5 | 4 | 1 | 1 |
| 22 | 木质调·芳香木质 | **13** | 1 | 1 | 4 | 5 | 1 | 1 |
| 23 | 东方琥珀调·暖焚香 | **13** | 1 | 1 | 5 | 4 | 1 | 1 |
| 24 | 柑橘调·青绿柑橘 | **12** | 1 | 1 | 5 | 3 | 1 | 1 |
| 25 | 花香调·绿叶花香 | **12** | 1 | 1 | 5 | 3 | 1 | 1 |
| 26 | 东方琥珀调·冷焚香 | **12** | 1 | 1 | 5 | 3 | 1 | 1 |
| 27 | 东方琥珀调·皮革 | **12** | 1 | 1 | 4 | 4 | 1 | 1 |
| 28 | 清新调·水生 | **11** | 2 | 1 | 4 | 1 | 1 | 2 |

平均分 **14.8/30**。≤18 分：古龙水型(16)、青绿柑橘(12)、柑橘花香(14)、芳香柑橘(14)、玫瑰(16)、白花(17)、果香花香(15)、粉感花香(15)、绿叶花香(12)、单一花(13)、檀木(13)、干燥木质(14)、香根草(13)、苔藓木质(17)、芳香木质(13)、乌木(15)、香草琥珀(17)、辛香琥珀(15)、冷焚香(12)、暖焚香(13)、树脂(14)、皮革(12)、水生(11)、绿意(14)、馥奇(17)