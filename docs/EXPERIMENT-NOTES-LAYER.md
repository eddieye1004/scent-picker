# 实验记录：notes 层贡献恒为 0 的根因诊断（第 6 步，2026-11-10）

对应 CONTROL.md 执行顺序第 6 步。派单来自 Muse（Eddie 2026-11-10 批准「按顺序做」）。
探针 `scripts/probe-notes-layer.mjs`（零副作用，可复跑）。

**结论：(c) 口径误会。无代码缺陷、无数据缺陷，因此无修复可做。生产行为不变，`src/` 零改动。**

这个 0 不是"引擎不用 notes"，而是三件事叠在一起被读成了一个 0：

1. 12 个 gold 画像的答案里**没有正分 notes 输入**（likedNotes 0/12、subfamily 0/12、
   anchor 0/12、emotion 0/12）—— 四个正分因子分子为 0，权重乘任何数都是 0 × k；
2. 唯一有输入的 notes 因子是 `dislikedNotes`（负分 −40，P01/P02），它**确实生效**；
3. 第 4 步的统计口径是「top20 内 breakdown 里 score > 0 的条目」—— 负分条目被
   `score > 0` 直接滤掉，于是 2 与 3 相加后仍显示 0.00。

---

## 1. 方法：三类根因各自的判别证据

派单要求不预设修复，先定性。三类各自的判别标准与本步实测：

| 类别 | 若成立应看到 | 实测 | 判定 |
|---|---|---|---|
| (a) 代码缺陷 | 有输入仍不出分；或字段名/取值路径对不上 | 四个正分因子**有输入即出分**（见 §2） | 排除 |
| (b) 数据问题 | `notesAll` 大面积为空；或 UI 词表与数据对不上 | 1388/1388 瓶有 notesAll；58 个 chip 无一死链（见 §3） | 排除 |
| (c) 口径误会 | notes 在其他路径生效，只是统计位置看不到 | `dislikedNotes` 生效；生产答题里点一个 chip 就换手 4/5（见 §4、§5） | **成立** |

三类都要有正反两面证据：既要证明"这一类不成立"，也要证明"这类现象真实存在"。
所以 §2 不止看 12 画像（那是反例），还人为灌入输入看引擎反应；§4 不止看贡献表，
还把 `dislikedNotes` 剥掉做 A/B。

---

## 2. (a) 排除：四个正分因子有输入即出分

各自喂入一组真实答案，统计全库 1388 瓶里有多少瓶因此拿到该因子分数：

| 因子 | 输入集合大小 | 全库出分瓶数 | 示例 |
|---|---|---|---|
| `likedNotes` | 2（bergamot, lemon） | 611 | guerlain-shalimar → 7.00（hits: bergamot） |
| `emotionNotes` | 5（冷感锚点） | 534 | guerlain-shalimar → 11.00（hits: 鸢尾） |
| `subfamilyHits` | 4（cologne 挂靠香材） | 948 | ysl-libre → 18.00（hits: 薰衣草/麝香） |
| `anchor` | 2（sandalwood, musk） | 810 | ysl-libre → 8.67（hits: 麝香） |

四项全部命中，且 `hits` 里的中文名正确回显（走 `emotionNotesZh` / `noteEntryOf.zh`）。
字段名匹配、取值路径、别名解析三条链路都通 —— 不存在"条件永假"或"取不到值"。

**最小探针（P01 / P02 逐步）**：

```
P01（family=woody，gold 5 瓶）
  ① answers: likedNotes=undefined, subfamily=undefined, anchorNotes=undefined,
             emotion=undefined, dislikedNotes=["Vanilla"]
  ② profile: emotionNotes.size=0, likedNotes.size=0, subfamilyNotes.size=0,
             anchorNotes.size=0, dislikedNotes.size=1 ["vanilla"]
  ③ gold 5 瓶的 notes 层 breakdown → 全部「无任何 notes 层条目」
  ④ 灌入 likedNotes=[sandalwood, musk] 后，同一瓶 creed-silver-mountain-water
     → likedNotes=14（立刻出分）
```

①②是现象，④是反证：**同一瓶、同一份代码、只改答案输入，分数就从"无条目"变成 14**。
这是 (a) 与 (c) 的分界线 —— 代码若坏了，灌输入也不会出分。

---

## 3. (b) 排除：数据与词表都完好

| 检查项 | 实测 |
|---|---|
| `notesAll` 为空/缺失的瓶 | **0 / 1388** |
| 每瓶平均香调数 | 8.7（中位 9） |
| 不同香调写法总数 | 412（只出现 1 次的 115 种） |
| UI 可选 chip | 58（`noteIndex` 60 项，滤掉 0 命中后） |
| 每个 chip 命中瓶数 | 最小 4 · 中位 82 · 最大 620 |
| chip 作为 `likedNotes` 喂入后 0 命中的 | **0** |

第 6 条是本段的关键：不只看 `usableEntries()` 报的命中数（那是 notes.js 自己的口径），
而是把每个 chip 真的走一遍 `buildProfile → scorePerfume`，验证打分路径里也能命中。
58 个全部通过 —— 不存在"界面上能点、引擎里是死链"。

顺带否掉一个可能的数据侧假设：`noteIndex` 里 `neroli / orange blossom` 带斜杠，
而 UI 存进 `likedNotes` 的是原始 en（带斜杠的写法）。实测 `noteEntryOf` 同时登记了
`normNote(en)` 与各别名，两种写法都能取到条目，**这不是 bug**（scoring.js:582 的注释
已记录过这个坑与修法）。

---

## 4. (c) 成立：负分因子在生效，只是被口径滤掉

`dislikedNotes` 是这批画像里唯一有输入的 notes 因子。它到底生不生效？

| 画像 | disliked 条数 | 全库被扣分瓶 | 被扣分瓶排名（最小/中位/最大） | 未扣分瓶中位排名 | 进 top20 |
|---|---|---|---|---|---|
| P01 | 1 | 508 | 203 / 1120 / 1388 | 514 | 0 |
| P02 | 4 | 615 | 109 / 1060 / 1388 | 521 | 0 |

扣分把 508 / 615 瓶压到中位 1100+ 名（未扣分瓶中位约 520）—— **因子在生效**。

**A/B 验证**（把 `dislikedNotes` 从答案删掉，其余不动）：

| 画像 | 带 dislikedNotes | 剥离后 | top5 换手 | top3 命中变化 |
|---|---|---|---|---|
| P01 | creed-viking, armaf-eter-desert-breeze, fugazzi-parfum-1, … | 逐位相同 | 0/5 | 0/3 → 0/3 |
| P02 | mfk-aqua-universalis, creed-acqua-fiorentina, … | creed-silver-mountain-water, mfk-aqua-universalis, … | **5/5** | 1/3 → 1/3 |

P02 五瓶全换，说明因子确实在参与排序；P01 逐位相同，是因为它讨厌的香草瓶
全在 203 名开外，扣 40 分也进不了前排。两者合起来才是完整结论：
**因子生效，但不改变这两个画像的 top3 命中数**。

**第 4 步为什么会读成 0.00**：那段代码是

```js
if (!b || typeof b.score !== 'number' || b.score <= 0) continue;   // 负分在这里被丢掉
```

统计口径只数 `score > 0` 的条目。`dislikedNotes` 恒为 −40，永远不会进入统计。
所以贡献表里"notes 层四项合计 0.00"这个读数，实际含义是
**「四个正分因子一次都没出现」**，而不是「notes 层整体没有任何作用」。
这两个命题差别很大，第 4 步的措辞把它们混成了一个。

---

## 5. 生产路径上 notes 层有杠杆

用真实 10 步答题形态（`likedNotes` 是第 2 屏，58 个 chip 可选）跑对照：

| 答案 | top1 | top5 内拿到 notes 分的瓶 | vs 无输入 top5 换手 |
|---|---|---|---|
| 无 likedNotes | moschino-funny | 0/5 | — |
| 点 1 个 chip（bergamot） | floris-no-89 | 4/5 | **4/5** |
| 点 2 个 | floris-no-89 | 4/5 | 4/5 |
| 点 4 个 | floris-no-89 | 5/5 | 4/5 |

点一个香调就让 top5 换掉 4 瓶 —— 生产路径上 notes 层是有效杠杆。
第 4 步测到的 0 是**这批 gold 画像没答那一题**，不是引擎不用 notes。

**权重旋钮的双向对照**（`likedNotesWeight`，topN=5）：

| 场景 | w=14 | w=56 | w=112 |
|---|---|---|---|
| 原样（无 notes 输入） | MAJ 2/12 · STR 4/12 | MAJ 2/12 · STR 4/12 | MAJ 2/12 · STR 4/12 |
| 灌入家族代表香材 | MAJ 1/12 · STR 3/12 | MAJ 1/12 · STR 3/12 | MAJ 1/12 · STR 3/12 |

两行各自三档逐位相同，说明两件事：
① **无输入时调权重是数学空转**（0 × k）；
② **有输入时调权重也不是杠杆** —— 真正起作用的是"有没有输入"，不是"权重多大"。
第 4 步把 ① 的证据用在了 ② 的结论上，这是口径上的越界。

---

## 6. 落地：无修复

派单的落地规则是「(a) 且有最小修复」才动代码，(b) 只量化，(c) 写清生效路径结案。
本步判定 (c)，因此：

- **`src/` 零改动**，生产行为逐位不变；
- 新增 `scripts/probe-notes-layer.mjs`（只读探针，不参与生产）；
- 金标准前后值：**MAJORITY 2/12 · STRICT 4/12 → 2/12 · 4/12（±0）**，符合"无 delta"的预期。

### 6.1 顺带测到的两处结构性事实（不动，只记录）

诊断过程中量到两个与"0"无关但会影响未来调参的事实，写在这里备查：

**① `likedNotes` 在族池内是 3 档常数。** 灌入家族代表香材后，
池内 411 瓶的 `likedNotes` 得分只有 `{14.00, 7.00, 0.00}` 三个取值，
**44.5% 的瓶拿满分**。原因是 `clamp01(hits/2)` 命中 2 个即饱和，
而平均每瓶有 8.7 个香调，撞上 2 个代表香材是大概率事件。
这与第 4 步发现的"家族项在族池内是常数"是同一类问题：
**因子一旦在池内饱和，就不再有区分力**。

**② 调权重之前应先量饱和率。** 上面这个 3 档常数解释了为什么
"灌入代表香材 + 调权重"三档逐位相同 —— 权重乘以饱和的分布，
只是把所有瓶一起放大，相对顺序不变。这个教训与 `docs/EXPERIMENT-FAMILY-CAP.md`
§2.4 的"机制一"完全同构，可以直接复用那个结论。

### 6.2 不建议做的事

- **不要**为了让 gold 覆盖 notes 维度而去调引擎权重 —— §5 已证调权重无效；
- **不要**在没有新数据的情况下改 `clamp01(hits/2)` 的归一化 —— 它会同时改变
  生产路径所有点过香调的用户，属于另一次需要独立 A/B 的改动；
- **可以**考虑（另立派单）给 12 个 gold 画像补 `likedNotes` 答案，
  让金标准真正覆盖 notes 维度 —— 但这是**金标准集**的改动，不是引擎修复，
  且会改变基线数字，须经 Eddie 批准。

---

## 7. 复跑

```bash
node scripts/probe-notes-layer.mjs      # 全段
node scripts/probe-notes-layer.mjs 1    # 只跑最小探针
node scripts/probe-notes-layer.mjs 5    # 只看生产形态杠杆
```

套件（本次实测全绿）：

```
test-render         PASS 294  FAIL 0
test-contrast       PASS  42  FAIL 0
test-scoring        PASS 153  FAIL 0
test-compliance     PASS  10  FAIL 0
test-union-api      PASS  76  FAIL 0
test-category-gate  PASS  10  FAIL 0
test-jd-web         PASS  17  FAIL 0
test-gold           GOLD MAJORITY 2/12 STRICT 4/12（地板 2/4，±0）
```
