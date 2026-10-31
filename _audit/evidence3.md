# 严格匹配版证据（v3）

修正说明：v2 的 `has()` 用了双向包含匹配，导致 `frankincense` 被 `incense` 反吞（族内 83 > 全库 65）、`rose` 会命中 `rosewood`、`salt` 会命中 `sea salt`。v3 改为**严格等值 + 显式别名表**，下表所有数字均为修正值，可复跑 `_audit/evidence3.cjs`。

## A. 柑橘调（citrus，425 瓶）

| 柑橘原料 | 族内 | 占比 | 全库 |
|---|---|---|---|
| bergamot | 198 | 46.6% | 420 |
| lemon | 109 | 25.6% | 181 |
| mandarin | 110 | 25.9% | 204 |
| orange | 52 | 12.2% | 78 |
| blood orange | 7 | 1.6% | 15 |
| grapefruit | 49 | 11.5% | 86 |
| lime | 18 | 4.2% | 26 |
| yuzu | 4 | 0.9% | 11 |
| neroli | 24 | 5.6% | 70 |
| orange blossom | 45 | 10.6% | 158 |
| petitgrain | 26 | 6.1% | 35 |

含至少一个柑橘原料：**330/425 = 77.6%**；无柑橘原料：**95 瓶（22.4%）**。

柑橘族里的非柑橘原料（说明"花压过柑橘"）：

| 原料 | 族内 | 占比 |
|---|---|---|
| rose | 106 | 24.9% |
| jasmine | 90 | 21.2% |
| tuberose | 10 | 2.4% |
| peony | 13 | 3.1% |
| musk | 194 | 45.6% |
| vanilla | 113 | 26.6% |
| patchouli | 105 | 24.7% |
| cedarwood | 93 | 21.9% |

**无柑橘原料但有花香主干：45 瓶（10.6%）** —— 示例（前 6）：Frédéric Malle Portrait of a Lady；Jo Malone London Peony & Blush Suede；Burberry Her；Carolina Herrera Very Good Girl；Rabanne Fame；Annick Goutal Petite Chérie

芳香草本 vs 青绿：

| 原料 | 柑橘族内 | 占比 |
|---|---|---|
| lavender | 46 | 10.8% |
| rosemary | 15 | 3.5% |
| sage | 14 | 3.3% |
| thyme | 4 | 0.9% |
| mint | 13 | 3.1% |
| basil | 8 | 1.9% |
| grapefruit | 49 | 11.5% |
| petitgrain | 26 | 6.1% |
| galbanum | 2 | 0.5% |
| violet leaf | 9 | 2.1% |
| fig leaf | 0 | 0.0% |

- 只有芳香草本：56 瓶（13.2%）
- 只有青绿：48 瓶（11.3%）
- 两者兼有：27 瓶（6.4%）
- 两者都无：294 瓶（69.2%）

## B. 木质调（woody，534 瓶）

| 原料 | 族内 | 占比 | 全库 |
|---|---|---|---|
| sandalwood | 153 | 28.7% | 294 |
| vetiver | 140 | 26.2% | 205 |
| cedarwood | 202 | 37.8% | 307 |
| patchouli | 223 | 41.8% | 374 |
| oakmoss | 78 | 14.6% | 110 |
| juniper | 20 | 3.7% | 49 |
| rosemary | 11 | 2.1% | 31 |
| cypress | 16 | 3.0% | 28 |
| mint | 30 | 5.6% | 56 |
| oud | 59 | 11.0% | 96 |
| guaiac | 29 | 5.4% | 35 |
| teak | 0 | 0.0% | 0 |
| pine | 5 | 0.9% | 12 |
| fir | 0 | 0.0% | 0 |
| birch | 9 | 1.7% | 13 |
| cashmeran | 17 | 3.2% | 22 |
| iso e super | 0 | 0.0% | 0 |
| ambroxan | 30 | 5.6% | 56 |

- 檀木 153 瓶 · 香根草 140 瓶 · 雪松 202 瓶
- 檀木×香根草共现 **40** 瓶（28.6% of 较小集合）
- 雪松×檀木共现 **67** 瓶（43.8%）；雪松×香根草共现 **69** 瓶（49.3%）

## C. 东方琥珀调（amber，519 瓶）

| 原料 | 族内 | 占比 | 全库 |
|---|---|---|---|
| vanilla | 227 | 43.7% | 421 |
| amber | 146 | 28.1% | 303 |
| ambergris | 35 | 6.7% | 69 |
| benzoin | 48 | 9.2% | 78 |
| labdanum | 50 | 9.6% | 71 |
| tonka bean | 108 | 20.8% | 173 |
| saffron | 70 | 13.5% | 93 |
| cinnamon | 65 | 12.5% | 81 |
| clove | 22 | 4.2% | 33 |
| cardamom | 80 | 15.4% | 116 |
| incense | 46 | 8.9% | 58 |
| frankincense | 39 | 7.5% | 65 |
| myrrh | 25 | 4.8% | 28 |
| opoponax | 12 | 2.3% | 16 |
| styrax | 6 | 1.2% | 9 |
| leather | 73 | 14.1% | 118 |
| birch | 6 | 1.2% | 13 |

- 香草 227 瓶（43.7%）· 琥珀（含 ambergris）146 瓶（28.1%）· 两者兼有 69 瓶
- 焚香类（incense / frankincense / myrrh 任一）：94 瓶
- 树脂类（benzoin / labdanum / opoponax / styrax 任一）：97 瓶
- 皮革：73 瓶（14.1%）；桦木焦油：6 瓶
- 辛香类（saffron / cinnamon / clove / cardamom 任一）：184 瓶

## D. 清新调（fresh，698 瓶）

| 原料 | 族内 | 占比 | 全库 |
|---|---|---|---|
| fig leaf | 0 | 0.0% | 0 |
| violet leaf | 21 | 3.0% | 30 |
| galbanum | 11 | 1.6% | 14 |
| green tea | 0 | 0.0% | 0 |
| black tea | 0 | 0.0% | 0 |
| tea | 26 | 3.7% | 34 |
| lavender | 125 | 17.9% | 141 |
| sage | 63 | 9.0% | 71 |
| oakmoss | 77 | 11.0% | 110 |
| coumarin | 3 | 0.4% | 6 |
| tonka bean | 92 | 13.2% | 173 |
| musk | 272 | 39.0% | 494 |
| calone | 2 | 0.3% | 3 |
| aquatic | 0 | 0.0% | 0 |
| sea salt | 9 | 1.3% | 10 |
| driftwood | 1 | 0.1% | 3 |
| cucumber | 1 | 0.1% | 1 |
| melon | 5 | 0.7% | 15 |

- 全库含茶（green tea / black tea / tea 任一）：**34 瓶（2.8%）**
- 清新族内"有绿无茶"：30 瓶
- 清新族内"有茶无绿"：0 瓶
- 馥奇三要素齐备（lavender + oakmoss + coumarin/tonka）：**4 瓶**
- 只缺香豆素（lavender + oakmoss 但无 coumarin/tonka）：10 瓶
- 水生信号（calone / aquatic / sea salt / driftwood 任一）：12 瓶（1.7%）

## E. 美食调（gourmand，340 瓶）

| 原料 | 族内 | 占比 | 全库 |
|---|---|---|---|
| vanilla | 182 | 53.5% | 421 |
| tonka bean | 77 | 22.6% | 173 |
| caramel | 24 | 7.1% | 37 |
| sugar | 12 | 3.5% | 14 |
| coffee | 19 | 5.6% | 26 |
| cocoa | 13 | 3.8% | 17 |
| almond | 26 | 7.6% | 30 |
| coconut | 25 | 7.4% | 38 |
| hazelnut | 3 | 0.9% | 5 |
| praline | 19 | 5.6% | 23 |
| rum | 15 | 4.4% | 27 |
| cognac | 6 | 1.8% | 7 |
| whiskey | 1 | 0.3% | 2 |
| absinthe | 1 | 0.3% | 8 |
| peach | 37 | 10.9% | 67 |
| apple | 51 | 15.0% | 85 |
| pear | 35 | 10.3% | 67 |
| berry | 73 | 21.5% | 158 |
| cherry | 9 | 2.6% | 16 |

- 香草：182 瓶（53.5%）
- 咖啡或可可（coffee/cocoa/chocolate）：29 瓶（8.5%）
- 酒类（rum/cognac/whiskey/absinthe）：22 瓶（6.5%）

## F. 花香调（floral，789 瓶）

| 原料 | 族内 | 占比 | 全库 |
|---|---|---|---|
| rose | 268 | 34.0% | 331 |
| jasmine | 238 | 30.2% | 310 |
| tuberose | 54 | 6.8% | 59 |
| peony | 48 | 6.1% | 50 |
| iris | 98 | 12.4% | 128 |
| violet | 62 | 7.9% | 86 |
| aldehydes | 14 | 1.8% | 16 |
| lily of the valley | 56 | 7.1% | 66 |
| ylang-ylang | 70 | 8.9% | 83 |
| gardenia | 35 | 4.4% | 38 |
| magnolia | 35 | 4.4% | 40 |
| osmanthus | 19 | 2.4% | 24 |
| freesia | 33 | 4.2% | 36 |
| musk | 322 | 40.8% | 494 |
| vanilla | 261 | 33.1% | 421 |

## G. 族间 Top40 原料词表 Jaccard（严格等值，越高越难分）

| | citrus | floral | woody | amber | fresh | gourmand |
|---|---|---|---|---|---|---|
| **citrus** | — | 0.67 | 0.54 | 0.51 | 0.60 | 0.60 |
| **floral** | 0.67 | — | 0.60 | 0.54 | 0.67 | 0.60 |
| **woody** | 0.54 | 0.60 | — | 0.86 | 0.82 | 0.48 |
| **amber** | 0.51 | 0.54 | 0.86 | — | 0.74 | 0.54 |
| **fresh** | 0.60 | 0.67 | 0.82 | 0.74 | — | 0.48 |
| **gourmand** | 0.60 | 0.60 | 0.48 | 0.54 | 0.48 | — |

各族 Top40 词表如下（用于判断"共享词"具体是哪些）：

- **citrus**：bergamot, musk, vanilla, mandarin, lemon, rose, patchouli, cedarwood, amber, jasmine, sandalwood, orange, grapefruit, apple, lavender, vetiver, orange blossom, blackcurrant, tonka bean, peach
- **floral**：musk, bergamot, rose, vanilla, jasmine, patchouli, sandalwood, amber, cedarwood, mandarin, orange blossom, lemon, vetiver, lavender, iris, tonka bean, pink pepper, ylang-ylang, geranium, oakmoss
- **woody**：patchouli, musk, cedarwood, bergamot, sandalwood, vanilla, vetiver, amber, jasmine, rose, cardamom, pink pepper, leather, pepper, oakmoss, mandarin, saffron, lemon, cinnamon, tonka bean
- **amber**：vanilla, musk, patchouli, bergamot, amber, tonka bean, rose, sandalwood, cedarwood, jasmine, cardamom, leather, vetiver, pepper, pink pepper, saffron, iris, mandarin, cinnamon, oud
- **fresh**：bergamot, musk, patchouli, cedarwood, vanilla, sandalwood, vetiver, amber, jasmine, lemon, mandarin, rose, lavender, tonka bean, pink pepper, oakmoss, grapefruit, cardamom, orange blossom, leather
- **gourmand**：vanilla, musk, bergamot, rose, patchouli, jasmine, tonka bean, amber, sandalwood, cedarwood, apple, mandarin, blackcurrant, orange blossom, peach, pear, raspberry, lemon, lavender, pink pepper
