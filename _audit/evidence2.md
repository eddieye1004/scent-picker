## A. 各族 Top15 原料（族内占比）

| 排行 | 柑橘调 | 花香调 | 木质调 | 东方琥珀调 | 清新调 | 美食调 |
|---|---|---|---|---|---|---|
| 1 | bergamot 46.6% | musk 40.8% | patchouli 41.8% | vanilla 43.7% | bergamot 42.4% | vanilla 53.5% |
| 2 | musk 45.6% | bergamot 34.1% | musk 39.1% | musk 32.4% | musk 39.0% | musk 40.6% |
| 3 | vanilla 26.6% | rose 34.0% | cedarwood 37.8% | patchouli 29.5% | patchouli 34.8% | bergamot 26.5% |
| 4 | mandarin 25.9% | vanilla 33.1% | bergamot 33.9% | bergamot 29.1% | cedarwood 34.4% | rose 26.2% |
| 5 | lemon 25.6% | jasmine 30.2% | sandalwood 28.7% | amber 28.1% | vanilla 26.8% | patchouli 24.7% |
| 6 | rose 24.9% | patchouli 27.5% | vanilla 27.9% | tonka bean 20.8% | sandalwood 24.8% | jasmine 22.6% |
| 7 | patchouli 24.7% | sandalwood 23.8% | vetiver 26.2% | rose 20.2% | vetiver 23.4% | tonka bean 22.6% |
| 8 | cedarwood 21.9% | amber 23.7% | amber 26.2% | sandalwood 19.5% | amber 23.1% | amber 21.2% |
| 9 | amber 21.4% | cedarwood 20.5% | jasmine 21.7% | cedarwood 19.5% | jasmine 21.9% | sandalwood 17.6% |
| 10 | jasmine 21.2% | mandarin 16.5% | rose 21.5% | jasmine 17.9% | lemon 20.5% | cedarwood 17.6% |
| 11 | sandalwood 17.2% | orange blossom 15.5% | cardamom 18.2% | cardamom 15.4% | mandarin 19.8% | apple 15.0% |
| 12 | orange 12.2% | lemon 14.4% | pink pepper 15.5% | leather 14.1% | rose 19.5% | mandarin 13.5% |
| 13 | grapefruit 11.5% | vetiver 13.7% | leather 15.2% | vetiver 14.1% | lavender 17.9% | blackcurrant 12.6% |
| 14 | apple 11.1% | lavender 13.1% | pepper 14.8% | pepper 13.9% | tonka bean 13.2% | orange blossom 12.6% |
| 15 | lavender 10.8% | iris 12.4% | oakmoss 14.6% | pink pepper 13.5% | pink pepper 11.2% | peach 10.9% |

## B. 柑橘调内部的柑橘谱系覆盖

柑橘调归属 425 瓶。逐个柑橘类原料在族内的出现率：

| 柑橘原料 | 族内出现 | 占比 |
|---|---|---|
| bergamot | 198 | 46.6% |
| lemon | 111 | 26.1% |
| mandarin | 110 | 25.9% |
| orange | 103 | 24.2% |
| grapefruit | 53 | 12.5% |
| lime | 18 | 4.2% |
| neroli | 24 | 5.6% |
| orange blossom | 92 | 21.6% |
| petitgrain | 26 | 6.1% |
| yuzu | 4 | 0.9% |
| bergamot mint | 208 | 48.9% |
| blood orange | 58 | 13.6% |

至少含一个柑橘原料的瓶数：**337/425 = 79.3%**（差额是"归类为柑橘但配方里没有柑橘原料"的瓶子，即分类断点）。

其中"无任何柑橘原料、但有茉莉/玫瑰/晚香玉/芍药"的：**43 瓶（10.1%）** —— 这是用户所说"单一花香冒充柑橘谱系"的量化证据。示例：（见 data/perfumes.json）

## C. 芳香柑橘 vs 青绿柑橘 的可测量差异

| 原料 | 柑橘族内出现 | 占比 |
|---|---|---|
| lavender | 46 | 10.8% |
| rosemary | 118 | 27.8% |
| sage | 14 | 3.3% |
| clary sage | 14 | 3.3% |
| thyme | 4 | 0.9% |
| mint | 13 | 3.1% |
| basil | 8 | 1.9% |
| grapefruit | 53 | 12.5% |
| petitgrain | 26 | 6.1% |
| galbanum | 2 | 0.5% |
| violet leaf | 30 | 7.1% |
| fig leaf | 16 | 3.8% |
| green | 11 | 2.6% |
| leaf | 13 | 3.1% |

- 只有芳香草本（无青绿）：**126 瓶**
- 只有青绿（无芳香草本）：**63 瓶**
- 两者兼有：**54 瓶** —— 兼有比例越高，两个小类越难在实际瓶子层面分开。

芳香柑橘的 taxonomy 登记原料只有 bergamot 一个，而 bergamot 在柑橘族内出现率 **46.6%**，同时也是全库第一柑橘原料（34.2%）——它的存在不能区分任何小类。

## D. 木质调内部：檀木 / 香根草 / 干燥木质 / 苔藓 / 芳香木质

| 原料 | 木质族内出现 | 占比 | 全库出现 |
|---|---|---|---|
| sandalwood（檀木） | 171 | 32.0% | 294 |
| vetiver（香根草） | 140 | 26.2% | 205 |
| cedarwood（干燥木质(雪松)） | 221 | 41.4% | 307 |
| patchouli（苔藓木质(广藿香)） | 223 | 41.8% | 374 |
| oakmoss（苔藓木质(橡苔)） | 78 | 14.6% | 110 |
| juniper（芳香木质(杜松)） | 20 | 3.7% | 49 |
| rosemary（芳香木质(迷迭香)） | 124 | 23.2% | 31 |
| cypress（芳香木质(柏)） | 16 | 3.0% | 28 |
| mint（芳香木质(薄荷)） | 30 | 5.6% | 56 |
| oud（乌木） | 59 | 11.0% | 96 |

檀木（171 瓶）与香根草（140 瓶）共现 **43 瓶**，共现率 = 30.7%（以较小集合为分母）。

木质感"具体意象"的可用锚点（全库次数）：

| 锚点 | 全库出现 | 占 1228 |
|---|---|---|
| sandalwood | 294 | 23.9% |
| cedarwood | 307 | 25.0% |
| vetiver | 205 | 16.7% |
| patchouli | 374 | 30.5% |
| oakmoss | 110 | 9.0% |
| oud | 96 | 7.8% |
| guaiac | 35 | 2.9% |
| teak | 5 | 0.4% |
| pine | 55 | 4.5% |
| fir | 15 | 1.2% |
| birch | 16 | 1.3% |
| cashmeran | 22 | 1.8% |
| iso e super | 0 | 0.0% |
| ambroxan | 56 | 4.6% |

## E. 东方琥珀调：香草 vs 琥珀 vs 辛香 vs 焚香 vs 树脂 vs 皮革

| 原料 | 琥珀族内 | 占比 | 全库 |
|---|---|---|---|
| vanilla | 228 | 43.9% | 422 |
| amber | 182 | 35.1% | 398 |
| ambergris | 174 | 33.5% | 69 |
| benzoin | 48 | 9.2% | 78 |
| labdanum | 50 | 9.6% | 71 |
| tonka bean | 108 | 20.8% | 173 |
| saffron | 70 | 13.5% | 93 |
| cinnamon | 65 | 12.5% | 81 |
| clove | 22 | 4.2% | 35 |
| cardamom | 80 | 15.4% | 116 |
| incense | 83 | 16.0% | 123 |
| frankincense | 83 | 16.0% | 65 |
| myrrh | 25 | 4.8% | 28 |
| opoponax | 12 | 2.3% | 16 |
| leather | 73 | 14.1% | 119 |
| birch tar | 6 | 1.2% | 0 |
| styrax | 6 | 1.2% | 9 |

- 有香草无琥珀：148 瓶；有琥珀无香草：102 瓶；两者兼有：80 瓶。
- 香草在琥珀族内出现率 43.9%，而"香草琥珀"这个小类的登记原料却只有 amber —— 分类表与真实配方错位。

## F. 清新调：绿意 vs 茶香 vs 馥奇 vs 水生/海洋

| 原料 | 清新族内 | 占比 | 全库 |
|---|---|---|---|
| fig leaf | 18 | 2.6% | 0 |
| violet leaf | 70 | 10.0% | 30 |
| galbanum | 11 | 1.6% | 14 |
| green tea | 26 | 3.7% | 0 |
| black tea | 26 | 3.7% | 0 |
| matcha | 0 | 0.0% | 0 |
| bergamot | 296 | 42.4% | 420 |
| lavender | 125 | 17.9% | 141 |
| sage | 63 | 9.0% | 71 |
| clary sage | 63 | 9.0% | 31 |
| oakmoss | 77 | 11.0% | 110 |
| coumarin | 3 | 0.4% | 6 |
| tonka bean | 92 | 13.2% | 173 |
| musk | 272 | 39.0% | 494 |
| calone | 2 | 0.3% | 3 |
| marine notes | 0 | 0.0% | 0 |
| aquatic | 10 | 1.4% | 15 |
| sea salt | 9 | 1.3% | 0 |
| salt | 9 | 1.3% | 11 |
| driftwood | 20 | 2.9% | 3 |
| cucumber | 1 | 0.1% | 1 |
| melon | 5 | 0.7% | 15 |

- **green tea / black tea / matcha 在全库出现 0 次** —— "茶香"这一小类在 1228 瓶里没有任何数据支撑，只剩 taxonomy 里的文字。
- **fig leaf、marine notes 全库 0 次** —— 绿意与海洋的登记原料同样查无实据。
- coumarin（香豆素）全库仅 6 次（0.5%）—— 馥奇的三大支柱（薰衣草 + 香豆素 + 苔藓）里，香豆素几乎不在样本中，馥奇因此缺乏典型特征。
- 水生类登记原料写的是 musk，而 musk 全库 494 次（40.2%）、清新族内 272 瓶 —— 用最泛用的原料当小类标识，等于没有标识。
- calone（西瓜酮）仅 3 次（0.2%）—— 真正的水生标志物在数据集里几乎不存在，说明**水生的可辨识性无法用数据集验证**，只能用配方知识补。

## G. 美食调：香草 / 果味 / 咖啡可可 / 坚果 / 酒香

| 原料 | 美食族内 | 占比 | 全库 |
|---|---|---|---|
| vanilla | 183 | 53.8% | 422 |
| tonka bean | 77 | 22.6% | 173 |
| caramel | 24 | 7.1% | 37 |
| sugar | 16 | 4.7% | 21 |
| chocolate | 13 | 3.8% | 17 |
| cocoa | 0 | 0.0% | 0 |
| coffee | 19 | 5.6% | 26 |
| almond | 27 | 7.9% | 33 |
| coconut | 25 | 7.4% | 38 |
| hazelnut | 3 | 0.9% | 5 |
| praline | 19 | 5.6% | 23 |
| rum | 15 | 4.4% | 27 |
| cognac | 6 | 1.8% | 7 |
| whiskey | 0 | 0.0% | 0 |
| absinthe | 1 | 0.3% | 8 |
| peach | 39 | 11.5% | 70 |
| apple | 64 | 18.8% | 130 |
| pear | 38 | 11.2% | 72 |
| berry | 51 | 15.0% | 91 |
| cherry | 10 | 2.9% | 19 |

- **cocoa / chocolate 全库 0 次**，coffee 仅 26 次（2.1%）—— "咖啡可可"这一小类在数据集中几乎不存在。
- 酒香三原料 rum 27 / cognac 7 / absinthe 0 —— absinthe 全库 0 次。

## H. 各族的 character 标签分布（前 6）

| 族 | 前 6 个 character |
|---|---|
| 柑橘调 | citrusy 71.5% · floral 57.2% · fresh 49.2% · fruity 45.9% · warm 30.8% · sweet 21.2% |
| 花香调 | floral 74.1% · citrusy 39.7% · warm 39.4% · fresh 38.7% · fruity 31.8% · creamy 25.1% |
| 木质调 | warm 61.2% · spicy 47.8% · floral 42.5% · woody 38.2% · fresh 33.3% · citrusy 32.8% |
| 东方琥珀调 | warm 87.9% · spicy 46.2% · sweet 44.9% · floral 40.8% · citrusy 23.9% · fresh 21.0% |
| 清新调 | fresh 53.6% · citrusy 52.4% · floral 46.4% · warm 41.4% · woody 30.8% · herbal 26.8% |
| 美食调 | warm 68.2% · sweet 64.1% · floral 60.0% · fruity 56.2% · citrusy 24.7% · fresh 17.4% |