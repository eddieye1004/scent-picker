# 实验：金标准重新补维（第 9 步全链）

> 日期 2026-11-11 · 决策：Eddie 2026-11-11 11:42「按 dsh 建议全程走」
> 归因依据：`docs/reviews/GOLD-ATTRIBUTION-20261111.md` §6.2 / §6.3
> 上游：第 8 步归因（`_probe/attribution{,2..9}.mjs`）

---

## 0. 预注册：判定规则（**先写死，跑数前定稿**）

本节在**跑任何补维数之前**写定，跑完不改口径。若事后发现规则有误，只能在文末追加「事后异议」
段落，不得修改本节。

### 0.1 补维成立判据

```
补维成立 ⇔ 重跑结果 MAJ ≥ 3/12  或  STR ≥ 5/12
```

即**任一指标严格超过旧基线**（旧基线 MAJ 2/12 · STR 4/12）。

### 0.2 判定不成立时

```
若 MAJ ≤ 2 且 STR ≤ 4：
  结论 = (b) 在当前 gold 上不可修
  动作 = 停手，转 B1 需 Eddie 另行拍板；不自行启动 B1
```

### 0.3 四格口径（必须全报，不许只报合并数）

| 格 | likedNotes | subfamily | 说明 |
|---|---|---|---|
| **格1** | 无 | 无 | 应等于旧基线 2/12·4/12（自检格） |
| **格2** | 无 | 有 | 单独量 subfamily 的 delta |
| **格3** | 有 | 无 | 单独量 likedNotes 的 delta |
| **格4** | 有 | 有 | 合并态（本次实际要落盘的口径） |

四格除这两项外**答案逐字相同**。

### 0.4 干扰项约束

- `src/` 生产代码**零改动**（本链只改 `scripts/lib/gold-portraits.mjs`）。
- 八套件全绿才许提交（`test-render` / `test-contrast` / `test-scoring` / `test-compliance` /
  `test-union-api` / `test-category-gate` / `test-jd-web` + `test-gold`）。
- 提交信息必须写明命中率前后 delta（CONTROL.md §4）。

---

## 1. 阶段 1：撤补维回干净基线

### 1.1 动作

`scripts/lib/gold-portraits.mjs` 的 18 行补维 diff（`likedNotes` 12 行 + `subfamily` 6 行）
整份撤掉，回到 HEAD（`60e1aef`）版本。

撤回前先把补维版本备份到 `_probe/gold-portraits-dim20.mjs`（gitignored），以便复现对照。

### 1.2 闸门

| 检查 | 要求 | 实测 | 判定 |
|---|---|---|---|
| `git diff` 是否为空 | 空 | 空 | ✓ |
| `scripts/lib/gold-portraits.mjs` SHA256 | 应为 HEAD 版 `555A3C71…` | `555A3C717B4512C5…` | ✓ |
| test-gold MAJORITY | 2/12 | **2/12** | ✓ |
| test-gold STRICT | 4/12 | **4/12** | ✓ |
| 八套件 | 全绿 | 见 §1.3 | ✓ |

### 1.3 八套件输出（`node scripts/check-head.mjs`）

```
✓ test-render.mjs        PASS 294  FAIL 0
✓ test-contrast.mjs      PASS  42  FAIL 0
✓ test-scoring.mjs       PASS 153  FAIL 0
✓ test-compliance.mjs    PASS  10  FAIL 0
✓ test-union-api.mjs     PASS  76  FAIL 0
✓ test-category-gate.mjs PASS  10  FAIL 0
✓ test-jd-web.mjs        PASS  17  FAIL 0
✓ test-gold.mjs          GOLD MAJ 2/12  STRICT 4/12

✓ HEAD 干净导出 7 套测试 + 金标准 全绿。
```

**阶段 1 闸门通过。**

> 注意：`check-head.mjs` 校验的是 **HEAD 的干净导出**（`git archive HEAD`），不是工作区。
> 因此它验证的是「撤维后与 HEAD 逐位一致」，这对阶段 1 是正确口径；
> 阶段 4 提交前须另跑**工作区**版本（见 §5.4）。

---

## 2. 阶段 2：B2 补定义（7 个无香调词画像）

### 2.1 动作与产出

`docs/reviews/GOLD-B2-DEFINITIONS-20261111.md`。逐画像「定义原话 → 补写意图 → 依据」，
7 个画像 × 3 个 chip = 21 个 chip，每个 chip 指回一句定义原话，需香调常识处标「推断」。

### 2.2 盲写方法与它的局限（如实记录）

主会话在第 8 步归因中**已读过 12 个画像的 gold 瓶列表**（算 gold 命中分布所必需）。
因此直接由主会话补写会污染「不许看 gold」这条硬规矩，改由**隔离 agent 盲写**：输入只有
`title` + `answers` 原文 + 58 词表，硬约束为不读 `gold` 字段 / 不跑 `recommend()` / 不读瓶数据。

**局限**：这不是完全盲的 —— 主会话（验收方）带着 gold 记忆在验收。为降低污染，验收只用
三条可检验规则（R1 有依据 / R2 不撞避雷 / R3 在词表内），**不以「是否命中 gold」为验收依据**。
下游如需交叉验证，建议用同一份输入另跑一次盲写比对。

### 2.3 结果（7 画像，21 chip）

| 画像 | 补写 likedNotes | 与原草案比 |
|---|---|---|
| P01 | `cedar` / `vetiver` / `bergamot` | 换掉 `juniper` |
| P02 | `bergamot` / `lemon` / `musk` | 换掉 `grapefruit`（clean 无柑橘能承担） |
| P03 | `amber` / `vanilla` / `benzoin` | 换掉 `cinnamon`（`sweetness=2` 只有 vanilla 能兑现） |
| P05 | `lemon` / `mint` / `grapefruit` | 换掉 `bergamot`+`petitgrain`（`green` 标签 → mint） |
| P06 | `incense` / `oud` / `myrrh` | **无变化**（定义三个 tag 全是香调级词汇） |
| P08 | `vetiver` / `patchouli` / `oakmoss` | 换掉 `cedar`+`sandalwood`（`earthy` → 土感三件套） |
| P11 | `bergamot` / `lemon` / `grapefruit` | 补上 `bergamot`（盲写独立推出，与阶段 3 的修正撞车） |

### 2.4 自检

R1 有依据 21/21 ✓ · R2 不撞避雷 7/7 画像逐项核对通过 ✓ · R3 在词表内 21/21 ✓。

**阶段 2 完成**（文档已落盘，编码在阶段 4 一并落）。

---

## 3. 阶段 3：修 (a) 三处编码缺陷

### 3.1 三处缺陷与归因依据

| 画像 | 缺陷（归因 §2.2） | 原草案 chips | 修法 |
|---|---|---|---|
| **P07** | 人设是「**果香**花香」，草案三个 chip 全是纯花，**一个果都没有** | `peony` / `osmanthus` / `freesia` | 落到含果香的 chip |
| **P12** | 人设是「**奶香**柔软」，草案两个白花 + 一个 tonka，白花给的是「花」不是「奶」 | `tuberose` / `gardenia` / `tonka bean` | 改落奶香类 chip |
| **P11** | 同族 P02/P05 都填了 `bergamot`，P11 漏了；且 P11 的定义（`citrus` + `cool` + fresh）**没有任何理由不填** | `lemon` / `grapefruit` / `petitgrain` | 补 `bergamot` |

### 3.2 修法与盲写（同 §2.2 的方法与局限）

同样外包给隔离 agent 盲写（只给 P07/P12 的定义原文 + 58 词表 + 两条强制回答的追问）。
回执要点：

- **P07**：`peach` / `freesia` / `peony`。回答「要果香 vs 避雷 gourmand」：
  禁的是**家族**不是「一切甜的联想」；gourmand 之所以成家族靠的是**甜点基底**（焦糖/香草/tonka/咖啡/杏仁/椰子/朗姆），
  peach 只有被甜点包裹时才落进 fruity-gourmand。做法 = **用水果、不给甜点底座**，与 freesia/peony 这种清透低甜花香捆绑。
- **P12**：`vanilla` / `sandalwood` / `ylang-ylang`。回答「会不会因为 vanilla 常见/太甜而避开」：
  **不会，定义里没有这条依据**（`dislikedFamilies` 为空、`sweetness=2` 是目标甜度不是禁用清单）。
  这才是归因 §2.2 指出的原始错误来源 —— 草案自行加了一条定义里没有的约束（「vanilla 更偏 gourmand」）。
- **P11**：`bergamot` / `lemon` / `grapefruit`，与阶段 2 的盲写结果**独立撞车**。

### 3.3 P07 的「果香 vs 避雷 gourmand」矛盾：实测证伪

盲写按语义论证说「peach 归 gourmand 是分类问题不是定义问题」。这个论证可以**用数据检验**：

| 果香 chip | 全库瓶数 | 主族 = floral | 主族 = gourmand |
|---|---|---|---|
| `peach` | 86 | **71** | **2** |
| `pear` | 94 | 56 | 12 |
| `apple` | 112 | 55 | 5 |
| `coconut` | 46 | 22 | **18** |
| `vanilla` | 508 | 216 | 103 |

**`peach` 的 86 瓶里 71 瓶主族是 floral，只有 2 瓶主族是 gourmand。**
所以「用 peach 会撞 `dislikedFamilies=[gourmand]`」在数据层**基本不成立** ——
`scoring.js` 的 `dislikedFamily` 只在**该瓶主族**命中时才扣分（§8d 注释：
「只在该族确实是这瓶的主族时才罚」），2/86 的暴露面可忽略。

反证：`coconut`（22 floral / 18 gourmand，gourmand 占 39%）才是真正会把画像推向 gourmand 的选择。
P12 因此**没有**用 coconut，改用 `vanilla` + `sandalwood`。

> 这一条是把「盲写 agent 的语义论证」升级成「数据检验过的结论」，
> 不是照抄它的说法。两条独立得出同一答案，可互相佐证。

### 3.4 三处修正的结果

| 画像 | 修正后 chips | 修的是什么 |
|---|---|---|
| P07 | `peach` / `freesia` / `peony` | 「果」终于有一个字面载体（`peach`），且实测不撞 gourmand |
| P12 | `vanilla` / `sandalwood` / `ylang-ylang` | 「奶」从白花改到 `vanilla`（奶甜本体）；`sandalwood` 给「柔软」的质地；`ylang-ylang` 让 creamy 落在 floral 家族内 |
| P11 | `bergamot` / `lemon` / `grapefruit` | 补回 `bergamot`，与同族 P02/P05 一致 |

**阶段 3 完成**。

---

## 4. 阶段 4：落盘 + 四格测量 + 判定

### 4.1 落盘的 12 个画像最终 chips

| 画像 | likedNotes | subfamily | 来源 |
|---|---|---|---|
| P01 | `cedar` / `vetiver` / `bergamot` | — | 阶段 2（B2 盲写） |
| P02 | `bergamot` / `lemon` / `musk` | `green-citrus` | 阶段 2 + 草案 sub |
| P03 | `amber` / `vanilla` / `benzoin` | `resinous` | 阶段 2 + 草案 sub |
| P04 | `musk` / `aldehydes` / `lavender` | — | **原草案保留**（字面「皂感」，归因 §2.2 判对得上） |
| P05 | `lemon` / `mint` / `grapefruit` | `green-citrus` | 阶段 2 + 草案 sub |
| P06 | `incense` / `oud` / `myrrh` | — | 阶段 2（与草案一致） |
| P07 | `peach` / `freesia` / `peony` | `fruity-floral` | **阶段 3 修正** + 草案 sub |
| P08 | `vetiver` / `patchouli` / `oakmoss` | — | 阶段 2 |
| P09 | `green tea` / `sage` / `galbanum` | `green` | **原草案保留**（字面「茶香草本」） |
| P10 | `leather` / `incense` / `saffron` | `leather` | **原草案保留**（字面「皮革」） |
| P11 | `bergamot` / `lemon` / `grapefruit` | — | **阶段 3 修正** |
| P12 | `vanilla` / `sandalwood` / `ylang-ylang` | — | **阶段 3 修正** |

diff 规模：**18 行**（12 行 likedNotes + 6 行 subfamily），与第 7 步草案同规模。
subfamily 沿用第 7 步的 6/12 口径，未改。

### 4.2 四格 delta（判定规则的正式依据）

| 格 | likedNotes | subfamily | **MAJ** | **STR** |
|---|---|---|---|---|
| **格1** | 无 | 无 | **2/12** | **4/12** |
| **格2** | 无 | 有 | 2/12 | **2/12** |
| **格3** | 有 | 无 | **0/12** | 2/12 |
| **格4** | 有 | 有 | **0/12** | **1/12** |

**delta 分解**：

| 对比 | MAJ | STR |
|---|---|---|
| 格1 → 格3（likedNotes 单独作用） | 2 → 0（**−2**） | 4 → 2（**−2**） |
| 格1 → 格2（subfamily 单独作用） | 2 → 2（±0） | 4 → 2（**−2**） |
| 格1 → 格4（合并） | 2 → 0（**−2**） | 4 → 1（**−3**） |

格1 = 2/12·4/12，与旧基线**逐位相同**（自检格通过）。

### 4.3 逐画像四格

| 画像 | 格1 无n无s | 格2 无n有s | 格3 有n无s | 格4 有n有s |
|---|---|---|---|---|
| P01 | 0/3 | 0/3 | 0/3 | 0/3 |
| P02 | **1/3** | 0/3 | **1/3** | 0/3 |
| P03 | 0/3 | 0/3 | 0/3 | 0/3 |
| P04 | 0/3 | 0/3 | 0/3 | 0/3 |
| P05 | **1/3** | 0/3 | 0/3 | 0/3 |
| P06 | 0/3 | 0/3 | 0/3 | 0/3 |
| P07 | 0/3 | 0/3 | 0/3 | 0/3 |
| P08 | 0/3 | 0/3 | 0/3 | 0/3 |
| **P09** | **2/3\*** | **2/3\*** | 1/3 | 1/3 |
| P10 | 0/3 | 0/3 | 0/3 | 0/3 |
| **P11** | **2/3\*** | **2/3\*** | 1/3 | 1/3 |
| P12 | 0/3 | 0/3 | 0/3 | 0/3 |

`*` = MAJ 通过。**12 个画像里只有 P09 / P11 两个曾经通过，且它们全部在「有 likedNotes」时掉到 1/3。**

### 4.4 判定结果：**不成立**

按 §0 预注册规则：

```
补维成立 ⇔ MAJ ≥ 3/12 或 STR ≥ 5/12
实测格4：MAJ = 0/12，STR = 1/12
0 < 3 且 1 < 5  →  不成立
```

且满足 §0.2 的第二条件（`MAJ ≤ 2 且 STR ≤ 4`）：

```
结论 = (b) 在当前 gold 上不可修
动作 = 停手，转 B1 需 Eddie 另行拍板；不自行启动 B1
```

**没有改口径、没有重跑挑数。** 格4 是唯一符合「按阶段 2 定义 + 阶段 3 修正重新落盘」这一
事前定义的口径，它的数就是判定依据。

### 4.5 与第 8 步归因的对照：编码修好了，结果还是负的

这是本次实验最有价值的一条：**阶段 3 把 (a) 的三处编码缺陷全修了（P07 有果、P12 有奶、P11 有 bergamot），
并且阶段 2 让 7 个画像的 chips 全部指回定义原话 —— 结果 MAJ 仍然是 0。**

| | 第 7 步草案（原） | 本次（阶段2+3 修正后） |
|---|---|---|
| P07 chips | `peony`/`osmanthus`/`freesia`（0 个果） | `peach`/`freesia`/`peony`（**有果**） |
| P12 chips | `tuberose`/`gardenia`/`tonka bean`（0 个奶香本体） | `vanilla`/`sandalwood`/`ylang-ylang`（**有奶甜本体**） |
| P11 chips | `lemon`/`grapefruit`/`petitgrain`（**漏 bergamot**） | `bergamot`/`lemon`/`grapefruit`（**补上**） |
| 7 画像依据 | 纯推断，无定义支撑 | 每个 chip 指回定义原话 |
| **MAJ / STR** | **0/12 · 0/12** | **0/12 · 1/12** |

**修编码把 STR 从 0 抬到 1，MAJ 一个都没动。** 与第 8 步归因 §5.6 的 oracle 天花板
（oracle-3 = 1/12·1/12）**完全吻合** —— 说明这次修正的效果等于「接近 oracle 的 chips」，
而 oracle 本身就只有 1/12。

**这构成 (b) 不可修的强证据**：不是我们的 chips 不够准，是「3 个离散香调」这根尺
量不出「5 瓶整体印象」这根轴（归因 §3.3）。

### 4.6 附带发现：格2 的 2/12 值得记一笔

格2（无 notes + 有 sub）是 **MAJ 2/12 · STR 2/12**：MAJ 保住 2，STR 掉 2。
说明 `subfamily` 这一项**单独看也是净负**（−2 STR）。

**因此即便将来重开补维，`subfamily` 那 6 行也不该跟着 likedNotes 一起进** ——
两份实验（第 8 步 2×2、本次四格）都独立得到了同一个数。

---

## 5. 结论与交接

### 5.1 本单最终状态

| 项 | 状态 |
|---|---|
| `scripts/lib/gold-portraits.mjs` | **已撤回 HEAD**（SHA `555A3C71…`），`git diff` 为空 |
| `src/` 生产代码 | **零改动** |
| test-gold | **2/12 · 4/12**（基线恢复） |
| 补维改动 | **未提交**（判定不成立，按令不提交） |
| 实验文档 | 本文档，**已落盘待 Eddie 决定是否入库** |
| B2 定义文档 | `docs/reviews/GOLD-B2-DEFINITIONS-20261111.md` |
| 归因文档 | `docs/reviews/GOLD-ATTRIBUTION-20261111.md` |

### 5.2 备份（gitignored，可复现）

| 文件 | 内容 |
|---|---|
| `_probe/gold-portraits-dim20.mjs` | 第 7 步补维版（原始 18 行 diff） |
| `_probe/gold-portraits-b2-v1.mjs` | 本单阶段 4 落盘版（阶段2+3 修正后） |
| `_probe/redim-4cells.mjs` / `.json` | 四格测量脚本与原始数据 |
| `_probe/attribution{,2..9}.mjs` | 第 8 步归因 9 支探针 |

### 5.3 给 Eddie 的交接口径

**判定不成立，停手。** 下一步是 B1（重选 gold 瓶）还是就此承认「金标准只能测家族/气质、测不了香调」，
需要 Eddie 定。我不自行启动 B1。

如果要重开补维，本单已经排除掉的三条路不必再走：

1. ~~改 chips 让它更贴定义~~ —— 已做到接近 oracle，仍 0/12（§4.5）
2. ~~改因子算法（权重/负向/压缩 family）~~ —— 第 8 步 §5.5 全表无效
3. ~~保留 subfamily~~ —— 两次实验独立测出它单独是 −2 STR（§4.6）

**唯一没被试过的路是 B1：改 gold 答案本身。** 但那会动到金标准本体，
旧基线 2/12·4/12 将失去可比性，必须另立派单。

