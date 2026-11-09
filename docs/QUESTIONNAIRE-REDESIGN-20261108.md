# 问卷重设计 · 2026-11-08

对象：`scent-picker` 七步问卷（`app.js` 的 `STEPS` + `src/scoring.js` 的打分入口）
范围：本席位负责问卷结构与打分入口的一致性；不碰 `scent-picker-v2/`、不碰 `data/`、不碰 `styles*`。

## 一句话结论

七步的**屏数没有变**（测试钉死），改的是三处「屏内契约」：第 1 步补上一条此前在生产路径上完全不存在的入口（`answers.emotion`），第 5 步补浓度与浓郁度的反差提醒，第 6 步补已排除香材的回顾。打分侧修了家族因子的分母（`/1.2` → 家族入口 `/1.0`），并修掉一条会说出自指循环句的理由文案。

## 基线（本轮验收线）

我改完代码后的最后一次实测：

| 套件 | PASS | FAIL | 归谁 |
|---|---|---|---|
| test-render | 245 | 0 | 问卷（本席位） |
| test-contrast | 42 | 0 | visual |
| test-scoring | 106 | 0 | 问卷（本席位） |
| test-compliance | 10 | 0 | 数据/合规 |
| test-union-api | 72 | 0 | affiliate（仍在增，见下） |
| test-jd-web | 17 | 0 | affiliate |
| test-category-gate | 8 | 0 | 数据 |
| **合计** | **500** | **0** | |

⚠️ **`test-union-api` 是移动靶，而且漂移有确定原因，不是随机。**

我先后测到三个值：**41**（`TODO-20261108.md` 里的旧记账）→ **58**（Lead 复核时）→ **72**（收工前）。原因是 affiliate 席位同期改了 `scripts/lib/union-api.mjs`（**+92/−7**）：把类目闸门从 `cat.includes('香水')` 改成**叶子层判定**。淘宝类目路径是 `彩妆/香水/美妆工具/<叶子>`，每一层父级都带「香水」二字，旧规则把唇霜、散粉、腮红、遮瑕、甲油胶、粉饼、气垫、睫毛膏全部当香水放行。修完闸门后 `scripts/test-union-api.mjs` 同步加了 L1–L18 组断言，于是 41 → 58 → 72。

所以判据必须是：

- **锁定六套不变量，不锁定合计。** 本席位能负责的对比是 render 245 / contrast 42 / scoring 106 / compliance 10 / jd-web 17 / category-gate 8 —— 改前改后**逐套相等**。
- 合计 486 → 500 的 +14 全部来自 `test-union-api`，与本轮问卷改动无关。
- 判据写成「我这六套不被我改红」，不要写成「合计等于某个固定数」—— 后者会被并行席位改跑。Lead 已采纳这个口径作为往后跨席位验收的标准。
- 引用任何合计数字必须带测量时间：`test-union-api` 在本轮之内就漂了两次。

> `test-render` 从 246 掉到 245 不是本轮造成的：同一时段有人在 `function renderResult()` 里删了广告披露，并把 `scripts/test-render.mjs:1322` 的两条断言（「有 direct 链接时每卡挂一条『广告』披露」「披露首句是『广告』」）换成一条（「结果页不挂任何广告披露文案」）。净减 1。归属见文末「范围外」。

## 七步结构表

`scripts/test-render.mjs` 把 7 步的顺序与每屏的关键词逐条钉住，所以这张表的「结论」一列全部是「保留」。

| 步 | id | 标题 | 结论 | 为什么 |
|---|---|---|---|---|
| 1 | `family` | 你闻着舒服的，是哪一类味道？ | 保留，**屏内新增情绪回退入口** | 香型轮盘要求用户认识「柑橘调 / 东方琥珀调」，而目标用户正是不认识这些词的人。此前 `answers.emotion` 在 `app.js` 里只有初始化（`app.js:21`）与 `restart`（`app.js:2983`）两处写入，**没有任何控件能给它赋值** —— `src/scoring.js:151` 明确支持的两条入口，在生产路径上只活了一条。 |
| 2 | `notes` | 点名具体想闻到的、和完全受不了的味道 | 保留 | 双栏同屏是 v22 的核心契约（`scripts/test-render.mjs:858` 钉「两栏并排」），拆回两屏会让「勾完上面忘了下面」的老问题复现。 |
| 3 | `mood` | 你希望它给人什么感觉？ | 保留 | 气质七原型由冷暖/甜度/家族三维推导后排序并预选（`scripts/test-render.mjs:1031` 断言首项必须是「焦糖琥珀」）。这三组问的确实是同一件事的不同侧面。 |
| 4 | `context` | 什么时候用它？ | 保留 | 场合决定持香下限（`src/scoring.js` 里 `maxLongevityFloor`）、季节决定候选池；两者都是「什么时候用」这一句话。 |
| 5 | `strength` | 想要多浓、留多久？ | 保留，**屏内新增浓度↔浓郁度反差提醒** | ①问体感浓淡（1–5），②问香精占比（EDC…Parfum）。两者强相关但不重合：库里有清淡的 Parfum，也有呛人的 EDT。把它们合并成一问会丢掉一个真实维度；但完全不提示又会让用户给出自相矛盾的组合。折中是**只在高反差时提醒、不预选、不联动**。 |
| 6 | `dislikedFamilies` | 有没有哪一类你完全不想要？ | 保留，**屏内新增已排除香材回顾** | 第 2 步的「完全受不了」在九十秒前答过，到这一屏用户通常已经忘了点过哪几个。不回顾的话，他在这里整族关掉「木质」，却忘了自己刚点名受不了 cedarwood（那本来已经在 −40 里），会以为系统漏听了。回顾是只读文本，不是第二组可点的卡 —— 否则这一屏就变成两个问题。 |
| 7 | `anchor` | 有没有已经试过、并且喜欢的香水？ | 保留 | 全问卷唯一基于真实反馈的因子（权重 26）。品牌用可搜索组合框（`scripts/test-render.mjs:962` 钉「恰好 1 个 `.combo-input`」）。 |

**没有新增/删除任何一步。** 这不是取舍偏好，是硬约束，见下节。

## 两条推不动的结构改造（给下一轮）

这两条都是真问题，但都卡在 `scripts/test-render.mjs` 的具体断言上，而 `scripts/` 下的已有文件不在本席位的写范围（`scent-picker-v2/` 归 visual，`docs/`、`app.js`、`src/`、新建 `probe-q-*.mjs` 归问卷）。

### ① 第 1 步「说不清」需要一条更早的分叉，而不是挤在轮盘下面

现状是把「按感觉选」放在轮盘之后。真正不认识香型词汇的用户会先被一个六扇区的大圆盘拦住，滚下去才发现有兜底。

要彻底解决得把它提成第 1 步内部的两个 tab（先选「我知道大概方向 / 我说不清」），或者在轮盘上方就给出入口。任何**改变步骤数**的做法都会被下面这条钉死：

- `scripts/test-render.mjs:940-946`
  ```js
  const stepNames = [
    [3, '给人什么感觉', 'mood'],
    [4, '什么时候用它', 'context'],
    [5, '想要多浓、留多久', 'strength'],
    [6, '完全不想要', 'dislikedFamilies'],
    [7, '试过、并且喜欢', 'anchor'],
  ];
  ```
- `scripts/test-render.mjs:956`
  ```js
  ok(`进入第 ${n} 步（${phrase}）`, getStepText().includes(phrase), getStepText().slice(0, 80));
  ```

这个循环从第 2 步开始每屏点一次「下一步」，然后断言**当前屏**的文案含指定短语。多一步或少一步，第 3–7 步的断言会整段错位，`test-render` 立刻红一片。改这一条要同时改 `app.js` 的 `STEPS`（`app.js:94-151`）和测试里的 `stepNames`，属于跨席位改动。

**本轮处置：不做，留到下一轮（Lead 决策）。** 理由是时机不是价值 —— 当前工作区有 20 个 modified + 55 个 untracked 未提交、`scent-picker` 领先远端 2 个提交（`045b889` + `f0fcc8d`）。在一堆未提交改动上再动 `test-render`（全项目最大的一套，245 项）的断言，一旦出问题分不清是谁弄坏的。等这批提交干净、推上去之后，再单独立任务：由问卷侧写断言、visual 侧复核渲染，两边对撞。

### ② 第 6 步应该是「先看已排除的，再决定要不要整族关」的两段式

现在的顺序是「多选卡片组 → 回顾文本」。用户先做决定、后看证据。反过来更合理。

卡在这条：

- `scripts/test-render.mjs:998`
  ```js
  const g = appRoot.querySelector('.choice-grid');
  ok('第 6 步容器标了 aria-multiselectable',
    !!g && g.attrs['aria-multiselectable'] === 'true', ...);
  ```
- `scripts/test-render.mjs:1002-1003`
  ```js
  ok('第 6 步不是 radiogroup（是多选）',
    !!g && g.attrs.role !== 'radiogroup', ...);
  ```

`querySelector` 取的是**第一个** `.choice-grid`。只要在第 6 步里、多选网格之前插入任何带 `.choice-grid` 类的东西（哪怕只是想给回顾做一组只读的卡片），这三条断言就会去检查那个节点。本轮的回顾因此刻意只用 `.term-note` 纯文本，不新建 class —— 顺带也避开了「`styles*.css` 不在写范围、新 class 拿不到样式」的问题。

## 本轮改动清单（文件:行号）

### `app.js`

| 行 | 改动 | 为什么 |
|---|---|---|
| `app.js:34-37` | `state.answers` 新增 `characterNeg: []` | 第 3 步预选/换选会写它（`app.js:2455` / `app.js:2492`），但初始值一直缺席 —— 「没答气质」与「答过又清空」在引擎侧长得一样。 |
| `app.js:47-51` | `state.answers` 新增 `longevityManual: false` | 第 5 步「改 / 恢复推断值」靠它区分推断值与手改值。初始缺席时读 `=== true` 恰好为 false，行为没错，但两处键表不一致。 |
| `app.js:1469` | 轮盘 `onChange` 里加 `if (fam) state.answers.emotion = null;` | 两条入口互斥：选了家族就清情绪，否则界面两个都亮着、引擎只认家族。 |
| `app.js:1479-1509` | 轮盘之后新增「说不清香型？按感觉选一个」`segControl`（6 个情绪词，全部来自 `TAX.emotionMap`，不新造词）+ `segHint` | 打通此前完全走不通的 emotion 入口。选情绪会清掉已选家族并 `render()` 重画（轮盘要用 `selFamily=null` 重建，否则盘心还停在刚选的那族）。 |
| `app.js:2829-2836` | 新增 `function refreshNav(stepId)` | 只替换底部 `.actions` 节点，不整屏重绘。原来这段逻辑内联在 `renderFamily` 的 onChange 里，现在第 1 步有两处要刷新（选家族、选情绪），抽出来免得抄两遍。 |
| `app.js:2848-2862` | `navBar('family')` 的 `disabled` 改为 `!(family \|\| emotion)`，并分三种提示语 | 只认 `family` 时，用情绪入口的人会被灰按钮卡在第 1 步 —— 而那恰好是不认识香型词汇的用户，等于把兜底路也堵死。 |
| `app.js:2936-2940` | `finish()` 硬守卫：`if (!state.answers.family && !state.answers.emotion)` | 同上。原守卫是 `if (!state.answers.family)`，直接拦掉整条情绪路径。 |
| `app.js:1923-1941` | 第 6 步新增已排除香材回顾（`.term-note` + `<strong>`，名单用 `dislikedZh` 回显中文） | 见结构表第 6 行。刻意不用 `.choice-grid`，理由见上一节 ②。 |
| `app.js:2706-2739` | 第 5 步新增 `INTENSITY_BAND` 反差提醒（差 ≥2 档才出现，`.term-note.is-warn`） | 见结构表第 5 行。阈值取 2：差 1 档是常态，说了等于每屏挂一句废话。 |
| `app.js:2982-2992` | `restart()` 补 `characterNeg: []` 与 `longevityManual: false` | 两处键表必须一致，否则「重来一次」会带着上一轮的气质禁止标签与手动留香标记。 |

未改动：`const STEPS`（`app.js:94-151`）、`stepHead`（`app.js:163`）、以及 D59 切屏的两个 hunk（`app.dataset.scene` + `SCENE`，`git diff` 里是 `@@ -3707 +3709 @@` 与 `@@ -3712,0 +3715,18 @@`，19 增 1 删）。D59 是别人的活，本轮一行未碰。

### `src/scoring.js`

| 行 | 改动 | 为什么 |
|---|---|---|
| `src/scoring.js:332-333` | `const famDenom = profile.family ? 1.0 : 1.2;` + `famScore = clamp01(famHit / famDenom) * (emotionFamily + occasionFamily)` | 旧代码是硬编码 `/1.2`。详见下节 A/B。 |
| `src/scoring.js:215` | `profile` 新增 `emotionReal: !!emotion` | 家族入口下 `profile.emotion` 是合成对象 `{ id: 'family-' + family.id, zh: family.zh }`，把它写进句子会产生自指循环。 |
| `src/scoring.js:885-897` | `reasonText()` 的 `case 'family'` 前置分支：`if (!profile.emotionReal) { return profile.occasion ? \`主调是${b.familyZh}，也贴着「${profile.occasion.zh}」这一路\` : \`主调是${b.familyZh}\`; }` | 修自指句。原句在家族入口下会输出「主调是花香调，在你选的「花香调」里占大头」。 |

## A/B 数字表（26 组典型答案 × 6 个变体）

复现：`node scripts/probe-q-ab.mjs`（`node` 不在 PATH 时用 `F:\deepseek\resources\runtime\primary-runtime\dependencies\node\bin\node.exe`）。
探针读 `src/scoring.js` 原文 → 打字符串补丁 → 落系统临时目录 → import，因此能同时持有 6 个权重版本而不改仓库文件。

| 变体 | 分母策略 | top-1 变化率 | top-3 变化率 | 前 3 名完全没动的组 | 首名家族因子达成率 |
|---|---|---|---|---|---|
| V1 旧问卷+旧权重 | `/1.2` | — （基准） | — | — | 83.3%–92.7% |
| V2 新问卷+旧权重 | `/1.2` | 0/15（0.0%）← 对 V1 | 0/15（0.0%）← 对 V1 | 15/15 | 83.3%–100.0% |
| V3 全改 | 两条入口都 `/1.0` | 5/26（19.2%） | 9/26（34.6%） | 17/26 | 100.0% |
| V4 按瓶自重归一 | `famHit / Σp.families` | 22/26（84.6%） | 26/26（100.0%） | **0/26** | 55.6%–100.0% |
| V5 按入口可达上界 | 族 1.00 / 族+场合 1.04 / 情绪 1.52 / 情绪+场合 1.53 | 9/26（34.6%） | 14/26（53.8%） | 12/26 | 83.8%–100.0% |
| **V6 只修家族入口（采纳）** | 族 `/1.0`、情绪 `/1.2` | **1/26（3.8%）** | **3/26（11.5%）** | **23/26** | **100.0%** |

读法与取舍：

1. **V1 → V2 的 0.0% 是关键证据。** 两个变体权重完全相同，只差「入口放开」。在 15 组两者都能服务的答案上，top-1 与 top-3 **一个都没变** —— 说明放开 emotion 入口只新增覆盖，不改既有行为。
2. **覆盖从 15/26 变成 26/26。** 新增可服务的 11 组全部是纯情绪入口（S15–S20、S21–S23、S25、S26），旧 `finish()` 守卫会直接把它们弹回第 1 步。
3. **V4 否决。** top-3 变化 100% 意味着换了一套排序；语义也变了 —— 分母是「这瓶自己六族权重之和」，量的是「这瓶内部有多大比例正是你要的」，与用户画像无关。
4. **V5 也不采纳。** 53.8% 的答案组前三名被换掉，理由和 V4 同类：改的是打分体系的尺度，不是修一个分母。
5. **V6 采纳。** 只把「用户把香型点准了、这一项却永远只给 83.3%」这个结构性欠分补上，26 组里 23 组排序不动。
6. **情绪入口保持 `/1.2` 是刻意的。** 情绪入口的 `pref` 是六族全非零向量（和 ≈3.2），点积上界 1.52；改成 `/1.0` 会让 204 瓶（`clean`）或 376 瓶（`cold` + `formal`）**并列拿满 52**，因子退化成常数。这是一个已记录在案的缺陷，不是遗漏 —— 修它要重做情绪入口的家族向量归一，属于下一轮。

补充数字（同一探针输出）：`family` 因子占全部权重的 52 分（`emotionFamily` 30 + `occasionFamily` 22）；每瓶 `families` 之和的范围是 1.000–2.100，1388 瓶里有 274 瓶的六族最大值不等于 1.0 —— 所以「按瓶自重归一」这类方案在数据层就注定量纲不稳。

## 为什么只修家族分母、不修情绪分母

这是后来者最容易重新踩的坑，单独留档。两处都是「家族因子分母」，看起来是同一类问题，实际不是。

| | 家族入口 | 情绪入口 |
|---|---|---|
| 旧分母 | `/1.2` | `/1.2` |
| `pref` 向量形态 | 单族为 1、其余 0（加场合 lerp 后和 ≈1.66） | 六族全非零（和 ≈3.2） |
| `famHit` 库内上界 | 1.000（family-only）/ 1.033（family+occasion） | 1.517（emotion-only）/ 1.527（emotion+occasion） |
| 旧分母造成的病 | **结构性欠分**：上限 43.3/52，即 83.3% 就是天花板 | **因子退化成常数**：`/1.2` 让 204 瓶（`clean`）/ 376 瓶（`cold`+`formal`）并列拿满 52 |
| 改成分母后 top-1 变化 | **1/26（3.8%）** | 见下 |
| 改成分母后 top-3 变化 | **3/26（11.5%）**；23/26 前三名一支不动 | **14/26（53.8%）** |
| 性质判定 | **修 bug**：把被结构扣掉的那 16.7% 补回来 | **换产品行为**：一半以上的答案组换前三名 |
| 本轮处置 | 改（`src/scoring.js:332-333`） | **不改**，缺陷记录在案 |

判据不是「变化大小好不好」，而是**这条改动在解释什么**：

- 家族入口那 16.7% 是纯粹的口径错 —— 用户把香型点准了，点积已经到库内上界 1.000，却因为分母写了 1.2 而只拿 83.3%。改完排序基本不动（23/26），符合「修一个算错的常数」的预期。
- 情绪入口的 `/1.2` 是**恰好**碰上了 1.517 这个上界，让 204–376 瓶一起顶到 52。真要修，不能只改分母 —— 得先重做情绪入口的六族向量归一化（现在是把 `emotion.families` 六个值一起做 max 归一，和 ≈3.2），否则改成 `/1.0` 只会让更多人并列满分。修完后一半以上的答案组前三名会换，这是产品行为变化，必须单独立任务、单独做 A/B、单独决策，不能夹在「修分母」里顺手做掉。

一句话：**家族分母是算错了，情绪分母是设计假设不成立。前者可以直接修，后者要先重做归一化再谈。**

## 理由文案的自指句

`reasonText()` 的 `case 'family'` 原来无条件用 `profile.emotion.zh` 拼句。家族入口下这个值是合成的 `{ id: 'family-<id>', zh: <家族中文名> }`，于是输出「主调是花香调，在你选的「花香调」里占大头」。

实测：这个因子**极少进 top-3 理由**（V2 / V3 / V6 三个变体各 26 组，自指句出现次数都是 0/26），所以默认路径上没暴露出来。但它一旦进榜就是一句错话，而且三张卡都可能出现，属于「概率低、一旦出现就是硬伤」，本轮一并修掉。

## 未验证与已知缺陷

| 项 | 状态 |
|---|---|
| 情绪入口家族因子 `/1.2` 导致 204–376 瓶并列满分 | **已知缺陷，本轮不改**。修它需要重做情绪入口的六族向量归一，会让 53.8% 的答案组排序变化，属于换打分体系。 |
| 第 1 步兜底入口的位置（轮盘之下） | **已改进但非最优**。彻底解决需要改为步骤内的分叉，卡在 `scripts/test-render.mjs:940-946` 与 `:956`，见「两条推不动的结构改造」①。 |
| 第 6 步「先决策后看证据」的顺序 | **未改**。卡在 `scripts/test-render.mjs:998` 与 `:1002-1003`，见 ②。 |
| 第 5 步 `INTENSITY_BAND` 的档位映射（`app.js:2716-2723`） | **待验证的硬规则**：现在的六档映射（`eau-de-cologne` [1,2] / `eau-de-toilette` [2,3] / `eau-de-parfum` [3,4] / `parfum`·`extrait`·`elixir` [4,5]）是我按常识 + `CONCENTRATIONS` 各档文案定的，**没有数据支撑**。验证方法：读 `data/perfumes.json` 的 `concentration` 字段，与 `src/scoring.js` 里同一套「厚重感」算法（`heaviness = (amber + gourmand) / Σfamilies`）交叉，按浓度分组算厚重感的 p10 / p50 / p90；若某浓度的 p10–p90 区间与现映射偏差 ≥1 档，就按实测区间重写这张表。在跑完之前，它只当提示阈值用，不要拿它做筛选或扣分。 |
| 视觉层（`.term-note.is-warn` 在问卷页的实际观感） | **未在浏览器里看过**。我只确认了该 class 已存在于 `styles.css`（第 5 步留香说明本来就用它），没有实拍。已转给 visual 一并验证。 |
| 页面在 390×844 下第 1 步的高度 | **未实测，已转给 visual**（本项最要紧）。新增一排 6 档 `segControl` + 一行 hint 会让第 1 步更高，「下一步」按钮可能被推到折叠线以下 —— 原来这个位置在 1440×900 下的实测值是 1131px。 |
| `docs/QUESTIONNAIRE-REDESIGN-20261108.md` 自身 | **曾被我的一次 PowerShell 重写清空成 0 字节，已重写**。原因是 `[IO.File]::ReadAllText` 用了相对路径失败、`$s` 为 null，随后 `WriteAllText` 照写。教训：改这类文件一律用绝对路径，写完校验字节数。 |

## 范围外（发现但未动）

- `function renderResult()` 里的广告披露被删（`app.js` 的 hunk 落在 `@@ -3627,7 +3629,13 @@`、`@@ -3637,4 +3645,2 @@`、`@@ -3644,9 +3650,5 @@`），`scripts/test-render.mjs:1322` 的断言同步反转。**不是本席位改的**：本席位的写范围里没有 `scripts/` 下已有文件；时间线（`app.js` mtime 23:22:17 / `test-render.mjs` 23:22:40 / `scripts/.tmp-make-disclosure-blob.mjs` 23:23:47）指向推广侧的写入。合规影响见 `docs/DECISIONS.md` 的 D54。

## 复现命令

```powershell
$node = "F:\deepseek\resources\runtime\primary-runtime\dependencies\node\bin\node.exe"
cd scent-picker
& $node scripts\probe-q-ab.mjs          # A/B 六变体
& $node scripts\test-render.mjs         # 245
& $node scripts\test-scoring.mjs        # 106（输出为 `PASS 106   FAIL 0`，三个空格）
& $node scripts\test-contrast.mjs       # 42
& $node scripts\test-compliance.mjs     # 10
& $node scripts\test-union-api.mjs      # 58
& $node scripts\test-jd-web.mjs         # 17
& $node scripts\test-category-gate.mjs  # 8
```
