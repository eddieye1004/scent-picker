# 香调分类量化诊断依据

数据：`data/perfumes.json` 共 1228 瓶（Scento 数据集 2026-10-21 快照，CC BY 4.0）；`data/taxonomy.json` v1.0.0，6 族 32 小类。
说明：库中**没有配方百分比字段**，可用的"占比"只有 `families` 权重（0–1）与 `affinity`（族间相近度）。下表所有数字均为本机实测，可复跑 `_audit/evidence.cjs`。

## 一、族规模与原料集中度

| 族 | 归属瓶数 | 不同原料数 | Top5 原料（出现次数 / 族内占比） |
|---|---|---|---|
| 柑橘调 citrus | 425 | 249 | bergamot 198(47%) · musk 194(46%) · vanilla 113(27%) · mandarin 110(26%) · lemon 109(26%) |
| 花香调 floral | 789 | 334 | musk 322(41%) · bergamot 269(34%) · rose 268(34%) · vanilla 261(33%) · jasmine 238(30%) |
| 木质调 woody | 534 | 304 | patchouli 223(42%) · musk 209(39%) · cedarwood 202(38%) · bergamot 181(34%) · sandalwood 153(29%) |
| 东方琥珀调 amber | 519 | 285 | vanilla 227(44%) · musk 168(32%) · patchouli 153(29%) · bergamot 151(29%) · amber 146(28%) |
| 清新调 fresh | 698 | 322 | bergamot 296(42%) · musk 272(39%) · patchouli 243(35%) · cedarwood 240(34%) · vanilla 187(27%) |
| 美食调 gourmand | 340 | 256 | vanilla 182(54%) · musk 138(41%) · bergamot 90(26%) · rose 89(26%) · patchouli 84(25%) |

## 二、族间原料词表重叠（Top40 Jaccard，越高越难分）

| | citrus | floral | woody | amber | fresh | gourmand |
|---|---|---|---|---|---|---|
| **citrus** | — | 0.67 | 0.54 | 0.51 | 0.60 | 0.60 |
| **floral** | 0.67 | — | 0.60 | 0.54 | 0.67 | 0.60 |
| **woody** | 0.54 | 0.60 | — | 0.86 | 0.82 | 0.48 |
| **amber** | 0.51 | 0.54 | 0.86 | — | 0.74 | 0.54 |
| **fresh** | 0.60 | 0.67 | 0.82 | 0.74 | — | 0.48 |
| **gourmand** | 0.60 | 0.60 | 0.48 | 0.54 | 0.48 | — |

## 三、小类代表性原料的族内覆盖率

| 族 | 小类 | taxonomy 里的 notes | 族内命中瓶数 | 覆盖率 | 判定 |
|---|---|---|---|---|---|
| 柑橘调 | 古龙水型 cologne | lemon | 111/425 | 26.1% | 弱 |
| 柑橘调 | 青绿柑橘 green-citrus | grapefruit, petitgrain | 75/425 | 17.6% | 不足 |
| 柑橘调 | 柑橘花香 citrus-floral | neroli / orange blossom | 106/425 | 24.9% | 弱 |
| 柑橘调 | 芳香柑橘 aromatic-citrus | bergamot | 198/425 | 46.6% | 可辨识 |
| 花香调 | 玫瑰 rose | rose | 339/789 | 43.0% | 可辨识 |
| 花香调 | 白花 white-floral | jasmine, tuberose | 451/789 | 57.2% | 可辨识 |
| 花香调 | 果香花香 fruity-floral | peony | 48/789 | 6.1% | 不足 |
| 花香调 | 粉感花香 powdery-floral | iris, violet, aldehydes | 172/789 | 21.8% | 弱 |
| 花香调 | 绿叶花香 green-floral | lily of the valley | 71/789 | 9.0% | 不足 |
| 花香调 | 黄花 yellow-floral | ylang-ylang | 70/789 | 8.9% | 不足 |
| 花香调 | 单一花 soliflore | gardenia, magnolia, freesia, osmanthus | 110/789 | 13.9% | 不足 |
| 木质调 | 檀木 sandalwood | sandalwood | 171/534 | 32.0% | 弱 |
| 木质调 | 干燥木质 dry-woody | cedar | 202/534 | 37.8% | 弱 |
| 木质调 | 香根草 vetiver | vetiver | 140/534 | 26.2% | 弱 |
| 木质调 | 苔藓木质 mossy | patchouli, oakmoss | 259/534 | 48.5% | 可辨识 |
| 木质调 | 芳香木质 woody-aromatic | juniper, rosemary, cypress, mint | 176/534 | 33.0% | 弱 |
| 木质调 | 乌木 oud | oud | 59/534 | 11.0% | 不足 |
| 东方琥珀调 | 香草琥珀 vanilla-amber | amber | 182/519 | 35.1% | 弱 |
| 东方琥珀调 | 辛香琥珀 spicy-amber | saffron, cinnamon | 122/519 | 23.5% | 弱 |
| 东方琥珀调 | 焚香 incense | incense | 83/519 | 16.0% | 不足 |
| 东方琥珀调 | 树脂 resinous | frankincense, myrrh | 94/519 | 18.1% | 不足 |
| 东方琥珀调 | 皮革 leather | leather | 73/519 | 14.1% | 不足 |
| 清新调 | 水生 aquatic | musk | 272/698 | 39.0% | 弱 |
| 清新调 | 绿意 green | fig leaf, violet leaf, galbanum | 94/698 | 13.5% | 不足 |
| 清新调 | 馥奇 fougere | lavender, sage | 169/698 | 24.2% | 弱 |
| 清新调 | 茶香 tea | green tea | 26/698 | 3.7% | 不足 |
| 清新调 | 海洋 marine | marine notes | 0/698 | 0.0% | 不足 |
| 美食调 | 香草甜 vanilla-gourmand | vanilla, tonka bean | 214/340 | 62.9% | 可辨识 |
| 美食调 | 果味甜 fruity-gourmand | peach, apple, pear, caramel | 139/340 | 40.9% | 可辨识 |
| 美食调 | 咖啡可可 coffee-cocoa | coffee, cocoa | 19/340 | 5.6% | 不足 |
| 美食调 | 坚果杏仁 nutty | almond, coconut | 51/340 | 15.0% | 不足 |
| 美食调 | 酒香 boozy | rum, absinthe, cognac | 21/340 | 6.2% | 不足 |

## 四、小类"独有原料"数量（类内对比度来源）

| 族 | 小类 | 独有原料（仅此小类登记） | 数量 |
|---|---|---|---|
| 柑橘调 | 古龙水型 | lemon | 1 |
| 柑橘调 | 青绿柑橘 | grapefruit, petitgrain | 2 |
| 柑橘调 | 柑橘花香 | neroli / orange blossom | 1 |
| 柑橘调 | 芳香柑橘 | bergamot | 1 |
| 花香调 | 玫瑰 | rose | 1 |
| 花香调 | 白花 | jasmine, tuberose | 2 |
| 花香调 | 果香花香 | peony | 1 |
| 花香调 | 粉感花香 | iris, violet, aldehydes | 3 |
| 花香调 | 绿叶花香 | lily of the valley | 1 |
| 花香调 | 黄花 | ylang-ylang | 1 |
| 花香调 | 单一花 | gardenia, magnolia, freesia, osmanthus | 4 |
| 木质调 | 檀木 | sandalwood | 1 |
| 木质调 | 干燥木质 | cedar | 1 |
| 木质调 | 香根草 | vetiver | 1 |
| 木质调 | 苔藓木质 | patchouli, oakmoss | 2 |
| 木质调 | 芳香木质 | juniper, rosemary, cypress, mint | 4 |
| 木质调 | 乌木 | oud | 1 |
| 东方琥珀调 | 香草琥珀 | amber | 1 |
| 东方琥珀调 | 辛香琥珀 | saffron, cinnamon | 2 |
| 东方琥珀调 | 焚香 | incense | 1 |
| 东方琥珀调 | 树脂 | frankincense, myrrh | 2 |
| 东方琥珀调 | 皮革 | leather | 1 |
| 清新调 | 水生 | musk | 1 |
| 清新调 | 绿意 | fig leaf, violet leaf, galbanum | 3 |
| 清新调 | 馥奇 | lavender, sage | 2 |
| 清新调 | 茶香 | green tea | 1 |
| 清新调 | 海洋 | marine notes | 1 |
| 美食调 | 香草甜 | vanilla, tonka bean | 2 |
| 美食调 | 果味甜 | peach, apple, pear, caramel | 4 |
| 美食调 | 咖啡可可 | coffee, cocoa | 2 |
| 美食调 | 坚果杏仁 | almond, coconut | 2 |
| 美食调 | 酒香 | rum, absinthe, cognac | 3 |

## 五、代表性原料在库中的实际出现次数（全库）

| 原料 | 全库出现 | 占 1228 瓶 |
|---|---|---|
| bergamot | 420 | 34.2% |
| lemon | 181 | 14.7% |
| grapefruit | 86 | 7.0% |
| neroli | 70 | 5.7% |
| orange blossom | 158 | 12.9% |
| lavender | 141 | 11.5% |
| rosemary | 31 | 2.5% |
| sandalwood | 294 | 23.9% |
| vetiver | 205 | 16.7% |
| cedar | 0 | 0.0% |
| patchouli | 374 | 30.5% |
| oakmoss | 110 | 9.0% |
| juniper | 49 | 4.0% |
| cypress | 28 | 2.3% |
| mint | 56 | 4.6% |
| oud | 96 | 7.8% |
| amber | 303 | 24.7% |
| benzoin | 78 | 6.4% |
| labdanum | 71 | 5.8% |
| vanilla | 421 | 34.3% |
| tonka bean | 173 | 14.1% |
| saffron | 93 | 7.6% |
| cinnamon | 81 | 6.6% |
| incense | 58 | 4.7% |
| frankincense | 65 | 5.3% |
| myrrh | 28 | 2.3% |
| leather | 118 | 9.6% |
| birch tar | 0 | 0.0% |
| fig leaf | 0 | 0.0% |
| violet leaf | 30 | 2.4% |
| galbanum | 14 | 1.1% |
| green tea | 0 | 0.0% |
| marine notes | 0 | 0.0% |
| musk | 494 | 40.2% |
| calone | 3 | 0.2% |
| coumarin | 6 | 0.5% |
| sage | 40 | 3.3% |
| coffee | 26 | 2.1% |
| cocoa | 0 | 0.0% |
| almond | 30 | 2.4% |
| coconut | 38 | 3.1% |
| rum | 27 | 2.2% |
| cognac | 7 | 0.6% |
| peach | 67 | 5.5% |
| caramel | 37 | 3.0% |

## 六、近似名扫描（包含匹配，避免因写法不同误判为 0）

| 关键词 | 命中瓶数 | 示例写法 |
|---|---|---|
| bergamot | 420 | bergamot(420) |
| lemon | 186 | lemon(181) / lemon sorbet(2) / lemongrass(2) |
| grapefruit | 86 | grapefruit(86) |
| neroli | 70 | neroli(70) |
| orange blossom | 158 | orange blossom(158) |
| lavender | 141 | lavender(141) |
| rosemary | 31 | rosemary(31) |
| sandalwood | 294 | sandalwood(294) |
| vetiver | 205 | vetiver(205) |
| cedar | 307 | cedarwood(307) |
| patchouli | 374 | patchouli(374) |
| oakmoss | 110 | oakmoss(110) |
| juniper | 49 | juniper(49) |
| cypress | 28 | cypress(28) |
| mint | 56 | mint(56) |
| oud | 96 | oud(96) |
| amber | 398 | amber(303) / ambergris(69) / amberwood(23) |
| benzoin | 78 | benzoin(78) |
| labdanum | 71 | labdanum(71) |
| vanilla | 422 | vanilla(421) / salty vanilla(1) |
| tonka bean | 173 | tonka bean(173) |
| saffron | 93 | saffron(93) |
| cinnamon | 81 | cinnamon(81) |
| incense | 123 | frankincense(65) / incense(58) |
| frankincense | 65 | frankincense(65) |
| myrrh | 28 | myrrh(28) |
| leather | 119 | leather(118) / marine leather(1) |
| birch tar | 0 | — |
| fig leaf | 0 | — |
| violet leaf | 30 | violet leaf(30) |
| galbanum | 14 | galbanum(14) |
| green tea | 0 | — |
| marine notes | 0 | — |
| musk | 494 | musk(494) |
| calone | 3 | calone(3) |
| coumarin | 6 | coumarin(6) |
| sage | 71 | sage(40) / clary sage(31) |
| coffee | 26 | coffee(26) |
| cocoa | 0 | — |
| almond | 33 | almond(30) / almond milk(3) |
| coconut | 38 | coconut(38) |
| rum | 27 | rum(27) |
| cognac | 7 | cognac(7) |
| peach | 70 | peach(67) / peach blossom(3) |
| caramel | 37 | caramel(37) |