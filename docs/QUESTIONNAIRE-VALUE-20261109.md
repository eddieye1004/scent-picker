# 问卷重设计 · 每道题的实测价值（2026-11-09）

> 这份文档回答一个问题：**7 步问卷里，每道题真的改变推荐结果吗？**
> 所有数字都由 `scripts/probe-q-marginal.mjs` 实测得出，不是估的。
> 配套文档：`docs/QUESTIONNAIRE-REDESIGN-20261108.md`（结构与 A/B）。

---

## 一、方法

- 随机采样 60 组答案画像（含家族入口、情绪入口、部分答、满答的混合分布），每组先用完整答案跑一次 top-10 作为基准。
- 然后**抽掉一个维度**重跑，比较：
  - `top-1 换` —— 第 1 名换了几组
  - `榜内换人` —— 基准 top-10 里有几个位置被换成了别的瓶子（0 = 完全无影响，10 = 全换）
  - `顺序紊乱` —— top-10 内部顺序的肯德尔距离（0 = 顺序不变，0.5 = 完全颠倒）
- 判据取 `榜内换人`，不用 `top-1 换`：像「次要季节」（+5 分）这种弱因子几乎不可能翻掉第 1 名，但它能让第 4–10 名重排。只看第 1 名会严重低估弱因子的作用。

复现：`node scripts/probe-q-marginal.mjs 60`

---

## 二、结果表（60 组画像，修复后实测）

| 排名 | 维度 | 样本 | top-1 换 | 榜内换人 | 顺序紊乱 | 判定 |
|---|---|---|---|---|---|---|
| 1 | 第 1 步·小类（中圈） | 25 | 15/25 | **5.64** | 0.254 | 最强单项 |
| 2 | 第 3 步·气质原型 | 33 | 15/33 | **4.18** | 0.091 | 强 |
| 3 | 第 5 步·浓度（EDP 等） | 47 | 27/47 | **3.13** | 0.120 | 强 |
| 4 | 第 2 步·喜欢的香调 | 37 | 20/37 | 2.86 | 0.174 | 中 |
| 5 | 第 3 步·甜度 | 32 | 15/32 | 2.53 | 0.177 | 中 |
| 6 | 第 2 步·受不了的香调 | 39 | 10/39 | 2.15 | 0.011 | 中（换人多、乱序少 = 只做剔除不做重排） |
| 7 | 第 4 步·场合 | 46 | 13/46 | 2.15 | 0.136 | 中 |
| 8 | 第 3 步·气温 | 41 | 15/41 | 2.12 | 0.134 | 中 |
| 9 | 第 5 步·浓淡（1–5 体感） | 60 | 17/60 | 1.77 | 0.151 | 弱 |
| 10 | 第 5 步·留香 | 38 | 11/38 | 1.61 | 0.072 | 弱（且是浓度的函数，见下） |
| 11 | 第 4 步·季节 | 39 | 5/39 | 1.13 | 0.060 | 很弱 |
| 12 | 第 4 步·次要季节 | 30 | 2/30 | 0.73 | 0.024 | 很弱 |
| 13 | **第 6 步·整族排除** | 35 | 3/35 | **0.34** | 0.018 | **接近无效** |

---

## 三、本轮修掉的两个真实缺陷（都在这张表之前发现的）

### 缺陷 1：`WEIGHTS.longevity` 是 `undefined`，「留香」整道题从未生效

`scent-picker/src/scoring.js:44` 那一行：

```js
concentration: 12,   // 浓度档位吻合（EDT/EDP/Extrait）；数据覆盖 87%  longevity: 10,       // 持香时长吻合（由浓度推断，UI 必须标「推断」）
```

`longevity: 10,` 被上一行的行尾注释一起吞掉，从属性变成了注释文本。后果：

- `WEIGHTS.longevity === undefined`
- `clamp01(1 - d/2) * WEIGHTS.longevity` → `NaN`
- `if (lScore > 0)` 对 `NaN` 恒为 false → 因子被静默跳过，永远不进 `breakdown`

**106 项 scoring 测试一条没红**，因为没有任何一条断言检查权重表本身。

修复：把 `longevity: 10,` 拆成独立一行。修复后单瓶实测 `longevity:10.0` 出现在 `breakdown` 里。

### 缺陷 2：带斜杠的香调名「橙花」对全库 1388 瓶都算命中

`data/taxonomy.json` 的 `noteIndex.entries` 里有一条：

```json
{"zh":"橙花","en":"neroli / orange blossom","aliases":["neroli","orange blossom"]}
```

`buildProfile` 登记 `noteEntryOf` 时用的是 `normNote(e.en)` → `"neroli orange blossom"`（斜杠变空格），
而 `app.js:2321` 存进 `likedNotes` 的是**原始 `en`**（带斜杠）→ `noteEntryOf.get(key)` 拿不到
→ 掉进 `hitsOf()` 的兜底分支，而旧兜底是 `out.push(key)`，**无条件判命中**。

后果：用户点「橙花」，全部 1388 瓶都拿到 `likedNotes` 加分，等于这一项完全无效。
更糟的是反向：点「橙花」和点任何别的香调，第 1 名可能完全不动 —— 用户会认为系统没听懂。

修复（`scent-picker/src/scoring.js:389-410`）：

```js
const hitsOf = (selection) => {
  const out = [];
  for (const key of selection) {
    const entry = profile.noteEntryOf?.get(normNote(key));
    if (entry) {
      if (noteTokens.some((toks) => matchesNote(entry, null, toks))) out.push(key);
    } else {
      const needle = tokenize(key);
      if (needle.length && noteTokens.some((toks) => hasTokenSubsequence(toks, needle))) out.push(key);
    }
  }
  return out;
};
```

两侧都要修：① 查表前先 `normNote(key)`；② 兜底不能是「查不到就算命中」，也不能是「查不到就算没命中」——
`emotionMap` 里的锚点写过 `tonka` / `soap` / `fig` 这类简写，别名表里没有，但确实是合法香调。
正确做法是拿这串词本身去做 token 子序列匹配，匹配不上才算没命中。

---

## 四、结构层面的三个发现（这是本轮最该给决策者的部分）

### 发现 1：第 6 步在「家族入口」下结构上不可能生效

`scent-picker/src/scoring.js` 的候选池逻辑：

```js
const wOf = (s) => ((s.perfume.families || {})[profile.family.id] || 0);
const isDominant = (s) => { /* 该瓶的主族 === 用户选的族 */ };
let ranked = scored;
if (profile.family) {
  const L1 = scored.filter(isDominant);
  const L2 = scored.filter((s) => wOf(s) >= 0.5);
  ranked = L1.length >= topN ? L1 : (L2.length >= topN ? L2 : scored);
}
```

选了家族之后，候选池被过滤成**只有该族主导的瓶子**。实测六个族全是 `10/10 同族`：
`citrus 10/10`、`floral 10/10`、`woody 10/10`、`amber 10/10`、`fresh 10/10`、`gourmand 10/10`。

而「整族排除」的扣分条件是：

```js
const top = fams.sort((a, b) => b[1] - a[1])[0];
const hit = profile.dislikedFamilies.find((f) => top && top[0] === f);
if (hit) { score += WEIGHTS.dislikedFamily; ... }
```

只在**该族恰好是这瓶的主族**时才扣。既然池子里 100% 都是用户自己选的那一族，
排除任何**别的**族都永远打不中。实测：

| 入口 | 不排除 | 排除"fresh" | 第 1 名换了吗 |
|---|---|---|---|
| 家族入口 `floral` | floral 10/10 | floral 10/10 | **否** |
| 情绪入口 `cold` | fresh 1 / woody 1 / amber 2 / floral 4 / citrus 1 / gourmand 1 | woody 2 / amber 2 / floral 4 / citrus 1 / gourmand 1 | **是** |

**结论**：第 6 步只在情绪入口下有真实作用。走家族入口的用户，这一屏等于白问。

三种处置，取舍在用户：

- **A 保持现状**：承认「第 6 步只在情绪入口有效」，在 UI 上对家族入口用户隐藏或置灰此步。
- **B 让它对家族入口也生效**：把扣分条件从「该族 = 主族」放宽到「该族权重 ≥ 0.5」，或者在 `isDominant` 过滤之前先做排除。这会改变排序，需重跑 A/B。
- **C 改问法**：家族入口下把第 6 步换成「除了这一族，还有别的族你也不想看吗」，明确它是在**扩大**而不是**收窄**。

### 发现 2：「留香」是「浓度」的确定性函数，第 5 步问了两次同一件事

`data/taxonomy.json` 的 `concentrationLongevity.map`：

```
extrait → 5    parfum → 5    elixir → 5
eau-de-parfum → 4    eau-de-toilette → 3    eau-de-cologne → 2
```

全库实测：**每个浓度档对应的 `longevityInferred` 是唯一值，没有任何一瓶偏离**：

| 浓度 | longevityInferred 取值集合 |
|---|---|
| eau-de-cologne | `[2]` |
| eau-de-toilette | `[3]` |
| eau-de-parfum | `[4]` |
| extrait / parfum / elixir | `[5]` |

`app.js:2701-2702` 也已经做了联动：用户选浓度就自动填留香。所以「留香」这一项
（权重 10）和「浓度」这一项（权重 12）打的分**高度同源** —— 两题合计 22 分，
实际只传递了一个维度的信息。

它现在还有 1.61 的榜内换人，不是因为独立，而是因为 5 档映射与 3 档浓度不同粒度
（extrait / parfum / elixir 在浓度上区分，在留香上合并）。

**处置**：这是「冗余」不是「无效」，优先级低于第 6 步。真要简化，
应当把留香并入浓度（用户选 extrait 就自动是 5 档留香），把 10 分让给别的维度。

### 发现 3：两个香调选项是死选项（0 命中），但**已经被 UI 拦住了**

实测 60 个可选香调，各自能命中多少瓶：

| 香调 | 命中瓶数 |
|---|---|
| `cocoa`（可可） | **0 / 1388** |
| `sea salt`（海盐） | **0 / 1388** |
| `calone`（西瓜酮） | 4 |
| `cognac`（干邑） | 7 |
| `coumarin`（香豆素） | 8 |
| `absinthe`（苦艾） | 10 |

前两个在源数据里从来没出现过（`cocoa` 0 次、`sea salt` 0 次）。

**但这不是 bug，系统已经处理了。** `app.js:66-75` 的 `getUsableNotes()` 调
`src/notes.js` 的 `usableEntries()`，后者用 `countHits()` 逐条统计命中数，
`.filter((r) => r.hits > 0)` 把这两条挡掉。实测：

```
noteIndex 全表 60 → 可用 58
cocoa 在可用表里? false
sea salt 在可用表里? false
被过滤掉的: 可可/cocoa, 海盐/sea salt
```

所以用户在界面上根本选不到它们。**这一条只是记录下来，不需要动。**
（我第一版文档把它写成「UI 里这两个选项仍在」，那是错的 —— 我用 `buildProfile`
直接喂 `en` 绕过了 UI 过滤，误判成 UI 缺陷。）

顺带：`src/notes.js:89-90` 的注释里已经点名了这个 cocoa 案例，
说明这条设计是刻意做的，不是碰巧。

---

## 五、本轮改了什么

| 文件:行号 | 改动 | 为什么 |
|---|---|---|
| `scent-picker/src/scoring.js:43-45` | `concentration` 行的行尾注释拆开，`longevity: 10,` 独立成行 | 修 `WEIGHTS.longevity === undefined` |
| `scent-picker/src/scoring.js:389-410` | `hitsOf()` 查表前 `normNote(key)`；兜底从「无条件命中」改为 token 子序列匹配 | 修「橙花」对全库命中 |
| `scent-picker/src/scoring.js:10` | import 增加 `hasTokenSubsequence` | 上一条依赖 |
| `scent-picker/scripts/test-scoring.mjs` | 新增 T12–T16 五组断言（27 项） | 这两类 bug 原来测试抓不到 |
| `scent-picker/scripts/check-head.mjs:27` | `['test-scoring.mjs', 106]` → `133` | 基线同步 |
| `scent-picker/scripts/probe-q-marginal.mjs` | 新建 | 本文档全部数字的来源 |
| `scent-picker/scripts/probe-q-value.mjs` | 新建（早期版本，用 6 组手写画像，结论偏保守，保留作对照） | — |

### 新增断言明细

- **T12**（19 项）：`WEIGHTS` 每个键必须是有限数字 + `longevity > 0`。
- **T13**（2 项）：留香吻合时 `longevity` 必须进 `breakdown` 且拿到满分。
- **T14**（2 项）：带斜杠的香调（`neroli / orange blossom`）不得命中超过半库。
- **T15**（2 项）：每个可选香调至少命中 1 瓶；已知死选项（cocoa / sea salt）白名单化，不许新增。
- **T16**（1 项）：`topN=3` 时结果分数单调递减（`topN>3` 已知不单调，只打印警告不断言）。

---

## 六、测试基线（本轮实测，2026-11-09 00:03）

| 套件 | PASS | FAIL |
|---|---|---|
| test-render | 245 | 0 |
| test-contrast | 42 | 0 |
| test-scoring | **133**（原 106，+27） | 0 |
| test-compliance | 10 | 0 |
| test-union-api | 72 | 0 |
| test-jd-web | 17 | 0 |
| test-category-gate | 8 | 0 |
| **合计** | **527** | **0** |

**判据仍是「锁定六套不变量，不锁定合计」** —— `test-union-api` 本轮内已从 41 漂到 58 再漂到 72（另一席位改了类目闸门），合计数字不可靠。本轮能负责的是：`render 245 / contrast 42 / compliance 10 / jd-web 17 / category-gate 8` 五套一字未变，`scoring` 从 106 增到 133 全是新增断言。

---

## 七、已知缺陷与未验证项

| 项 | 状态 |
|---|---|
| `topN > 3` 时结果不按分数单调递减 | **已知**。多样性去重分两轮补齐（第一轮按 `familySource` 去重、第二轮放宽），拼接后不再单调。实测 `topN=5`：第 5 位 119.3 > 第 4 位 94.4。**当前 UI 只用 `topN=3`，未暴露**。T16 只锁 `topN=3`，`topN>3` 打印警告。 |
| 第 6 步在家族入口下无效 | **已知，见第四节发现 1**。三种处置待选，属产品决策。 |
| 留香与浓度信息冗余 | **已知，见第四节发现 2**。低优先级。 |
| `cocoa` / `sea salt` 是死选项（0 命中） | **不是缺陷，已被 UI 过滤**。见第四节发现 3：`getUsableNotes()` → `usableEntries()` 实测把 60 条过滤到 58 条，用户在界面上选不到。无需处理。 |
| 第 5 步 `INTENSITY_BAND` 档位映射（`app.js:2716-2723`） | **待验证的硬规则**。现在的六档映射是按常识 + `CONCENTRATIONS` 文案定的，无数据支撑。验证方法：读 `perfumes.json` 的 `concentration` 与同一套厚重感算法交叉，按浓度分组算厚重感 p10/p50/p90；偏差 ≥1 档则按实测区间重写。跑完前只当提示阈值用，不做筛选或扣分。 |
| 情绪入口 `/1.2` 让 204–376 瓶并列满分 | **已知缺陷，本轮刻意不改**。改它会换掉 53.8% 答案组的前三名，属换打分体系。详见 `docs/QUESTIONNAIRE-REDESIGN-20261108.md` 的「为什么只修家族分母、不修情绪分母」。 |
| `scripts/check-head.mjs` 有一段 mojibake | **本次顺手记下，未修**。该文件注释区有 GBK 乱码字符（不影响执行，`U+FFFD` 计数为 0 是因为它在写盘时已被替换成别的字符）。属既有问题。 |
| 6 组手写画像版探针（`probe-q-value.mjs`）结论偏保守 | 保留作对照。它的样本选择会放大某些维度的作用（例如手写画像的气质标签恰好与榜单匹配），只在 60 组随机版不可用时参考。 |

---

## 八、复现命令

```powershell
$node = "F:\deepseek\resources\runtime\primary-runtime\dependencies\node\bin\node.exe"
cd C:\Users\16256\Documents\deepseek-harness\default-workspace\scent-picker

& $node scripts\probe-q-marginal.mjs 60   # 本文档第二节那张表
& $node scripts\probe-q-value.mjs          # 6 组手写画像版（对照）
& $node scripts\probe-q-ab.mjs             # 权重 A/B 六变体（见另一份文档）
& $node scripts\test-scoring.mjs           # 133 / 0
```
