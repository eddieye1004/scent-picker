# 边界规则级联：验证报告

判定顺序 = 同族 `priority` 从小到大，第一个通过的即为归属；最后一类为兜底（fallback），保证每瓶必有归属。
因为"第一个通过即停止"，**一瓶不可能同时落入两个类**——这不是靠约定，是判定机制决定的。

## 柑橘调 citrus（425 瓶）

| 优先级 | 类 | 判定条件 | 命中瓶数 | 占比 |
|---|---|---|---|---|
| 10 | 柑橘花香 `citrus-floral` | 至少一个：neroli / orange blossom | 63 | 14.8% |
| 20 | 青绿柑橘 `green-citrus` | 至少一个：petitgrain / galbanum | 17 | 4.0% |
| 30 | 芳香柑橘 `aromatic-citrus` | 至少一个：lavender / rosemary / sage / thyme / mint / basil | 61 | 14.4% |
| 90 | 古龙水型 `cologne`（兜底） | 至少一个：bergamot / lemon / mandarin / orange / grapefruit / lime / yuzu / neroli / orange blossom / petitgrain | 196 | 46.1% |

校验：归属合计 337 / 425，未归属 **88**，多重归属 **0**（机制保证）。

## 木质调 woody（534 瓶）

| 优先级 | 类 | 判定条件 | 命中瓶数 | 占比 |
|---|---|---|---|---|
| 10 | 乌木 `oud` | 至少一个：oud | 59 | 11.0% |
| 20 | 芳香木质 `woody-aromatic` | 至少一个：juniper / sage | 46 | 8.6% |
| 30 | 苔藓木质 `mossy` | 必须全中：oakmoss + patchouli | 35 | 6.6% |
| 40 | 香根草 `vetiver` | 至少一个：vetiver；排除：sandalwood | 70 | 13.1% |
| 50 | 檀木 `sandalwood` | 至少一个：sandalwood；排除：vetiver | 85 | 15.9% |
| 90 | 干燥木质 `dry-woody`（兜底） | 至少一个：cedarwood / guaiac wood / vetiver / sandalwood / patchouli / oakmoss | 162 | 30.3% |

校验：归属合计 457 / 534，未归属 **77**，多重归属 **0**（机制保证）。

## 花香调 floral（789 瓶）

| 优先级 | 类 | 判定条件 | 命中瓶数 | 占比 |
|---|---|---|---|---|
| 10 | 单一花 `soliflore` | 至少一个：gardenia / magnolia / freesia / osmanthus | 110 | 13.9% |
| 20 | 粉感花香 `powdery-floral` | 至少一个：iris / heliotrope / aldehydes | 109 | 13.8% |
| 30 | 绿叶花香 `green-floral` | (lily of the valley|hyacinth) 且 (violet leaf|galbanum) | 3 | 0.4% |
| 40 | 果香花香 `fruity-floral` | 至少一个：peony / blackcurrant / raspberry | 89 | 11.3% |
| 50 | 白花 `white-floral` | 至少一个：jasmine / tuberose / ylang-ylang / gardenia / magnolia | 144 | 18.3% |
| 90 | 玫瑰 `rose`（兜底） | 至少一个：rose / geranium | 113 | 14.3% |

校验：归属合计 568 / 789，未归属 **221**，多重归属 **0**（机制保证）。

## 东方琥珀调 amber（519 瓶）

| 优先级 | 类 | 判定条件 | 命中瓶数 | 占比 |
|---|---|---|---|---|
| 10 | 皮革 `leather` | 至少一个：leather | 73 | 14.1% |
| 20 | 冷焚香 `incense-cold` | 至少一个：incense / frankincense；排除：benzoin | 54 | 10.4% |
| 30 | 暖焚香 `incense-warm` | 必须全中：benzoin；至少一个：incense / frankincense | 6 | 1.2% |
| 40 | 树脂 `resinous` | 必须全中：benzoin + labdanum | 8 | 1.5% |
| 50 | 辛香琥珀 `spicy-amber` | 至少一个：cinnamon / cardamom / saffron / clove；排除：vanilla | 74 | 14.3% |
| 90 | 香草琥珀 `vanilla-amber`（兜底） | 至少一个：vanilla / amber / benzoin / labdanum | 211 | 40.7% |

校验：归属合计 426 / 519，未归属 **93**，多重归属 **0**（机制保证）。

## 与 taxonomy v2 现状的对比

| 族 | v2 冲突率（命 ≥2 类） | 级联后 | 变化 |
|---|---|---|---|
| 柑橘调 | 43.3% | 0% | 一瓶一属 |
| 木质调 | 56.9% | 0% | 一瓶一属 |
| 花香调 | 39.3% | 0% | 一瓶一属 |
| 东方琥珀调 | 36.8% | 0% | 一瓶一属 |

## 抽样核对（每族 3 瓶，含边界情形）

### 柑橘调

| 品牌 · 名称 | 命中原料（规则相关） | 归属 |
|---|---|---|
| Creed · Silver Mountain Water | bergamot, mandarin, neroli | 柑橘花香 |
| Maison Francis Kurkdjian · Aqua Universalis | bergamot, lemon | 古龙水型 |
| Versace · Pour Homme | bergamot, lemon, neroli, petitgrain, sage | 柑橘花香 |
| Creed · Himalaya | bergamot, lemon, grapefruit | 古龙水型 |
| Roberto Cavalli · Paradiso | bergamot, mandarin | 古龙水型 |
| Montale · Red Aoud | bergamot, lemon, orange, lavender | 芳香柑橘 |

### 木质调

| 品牌 · 名称 | 命中原料（规则相关） | 归属 |
|---|---|---|
| Maison Francis Kurkdjian · Baccarat Rouge 540 | cedarwood | 干燥木质 |
| Parfums de Marly · Layton | patchouli, guaiac wood | 干燥木质 |
| Parfums de Marly · Delina | vetiver | 香根草 |
| Byredo · Mojave Ghost | vetiver, sandalwood, cedarwood | 干燥木质 |
| Maison Margiela Fragrances · Replica By the Fireplace | guaiac wood | 干燥木质 |
| Mancera · Cedrat Boise | oakmoss, patchouli | 苔藓木质 |
