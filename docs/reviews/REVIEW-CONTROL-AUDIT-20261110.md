# 复核：CONTROL.md 的体检结论与 §3 执行顺序（只读审查）

作者：lead（推广码线，2026-11-10 起转只读）
复核对象：`CONTROL.md`（Muse 2026-11-10）+ `docs/GOLD-STANDARD-DRAFT.md`
依据：HEAD = `27f3c65`，基线 `c878159`。**本文件是唯一新增内容，仓库其他文件未改。**

复核脚本放在仓库外的 `C:\Users\16256\ego\audit-*.mjs`（`audit-gold.mjs` / `audit-gold2.mjs` / `audit-control.mjs` / `audit-control2.mjs` / `audit-control3.mjs` / `audit-ties.mjs` / `audit-dislike.mjs`），
全部只读仓库、改写只落在 `os.tmpdir()`。复现：`node C:\Users\16256\ego\audit-<name>.mjs`（node 不在 PATH，需先加 `F:\deepseek\resources\runtime\primary-runtime\dependencies\node\bin`）。

---

## 0. 结论先行

| # | 结论 | 对 CONTROL 的影响 |
|---|---|---|
| 1 | 三条体检结论的**数字全部复现**（多标签中位数 3、五个稀疏气质计数、无 `test-gold.mjs`），但第 1 条的表述会误导：`citrus×winter=43` 是**旁标签**口径，按**主族**口径 citrus×winter = **0** | §2 真问题 1 成立，但要改判据 |
| 2 | §3 步骤 2 的两个候选方向，**第一个会把情况改坏**：改用主家族后，家族因子的「并列满瓶数」全面上升（floral 402→533、amber 67→191），可用分数档位从 5–12 档塌成 **2 档** | 该方向**不可执行**，有数据 |
| 3 | §3 步骤 2 的第二个方向（按家族数衰减 1/√n）**确实有效**：并列数降到 16–170，分数档位升到 11–32 | 建议作为主轴 |
| 4 | 发现一个 CONTROL 未列的**真 bug**：`dislikedFamilies` 只在被讨厌的族是该瓶**主族**时才罚。599 瓶含 amber，只有 191 瓶被罚，**68.1% 逃逸**——用户答「讨厌琥珀」仍会拿到 Gypsy Water（amber 0.5）、Khamrah（amber 0.5）、Dylan Blue（amber 0.4） | 比真问题 1 更直接导致结果「差强人意」 |
| 5 | 金标准草案里 **P09 与 P10 无法构造**：两画像的「答案设定」只有 character，而 `buildProfile` 无 family/emotion 直接 `throw new Error('缺少 family 或 emotion')` | §3 步骤 1 会被卡住，需先决定问卷是否允许纯气质入口 |

---

## 1. CONTROL §2 三条结论的复核

### 真问题 1（数据层稀释，家族多标签）—— 成立

实测（`audit-gold.mjs` §3，n=1388）：

```
标签数分布 {1:188, 2:331, 3:656, 4:183, 5:30}   → 中位数 3，满格 5（不是 6）
只挂 1 个家族：188 瓶 = 13.5%
Top 家族权重为 1.0：1114/1388；Top 家族唯一（无并列）：1388/1388
```

CONTROL 说「满格 6」——实际库里每瓶最多 5 个家族标签，6 是 taxonomy 的族数。不影响结论，仅记录口径差异。

**但 §2 的那句交叉表需要限定。** 「家族 × 季节无空格子（最小 citrus×winter = 43）」在**任何标签算命中**的口径下复现无误（`audit-control2.mjs` A1：`citrus {"spring":432,"summer":389,"autumn":408,"winter":43}`，全表最小格正是 citrus×winter=43）。
换成**主族**口径（`audit-control2.mjs` A2）就变样了：

```
citrus  {"spring":117,"summer":117,"autumn":99}      ← winter 缺格
fresh   {"spring":162,"summer":148,"autumn":150,"winter":14}
gourmand{"autumn":142,"winter":118,"spring":117,"summer":24}
```

citrus 没有任何一瓶的主族是 citrus 且适合冬天。这个区别直接决定 §2 的判断能不能用来指导修复：打分用的是 `pref[fam] * w`，`w` 是那瓶的家族权重，所以「citrus=0.15 的冬季瓶」在纯柑橘画像下只拿 0.15×52 ≈ 7.8 分，几乎等于没有。**「无空格子」在这个意义上不成立。**

### 真问题 2（气质标签稀疏）—— 精确成立

`audit-gold.mjs` §7 逐字复现 CONTROL 的五个数：

```
leathery=13  clean=23  salty=22  smoky=55  rich=4
（全库最少的六个：rich 4 / leathery 13 / salty 22 / clean 23 / smoky 55 / amber 72）
```

### 真问题 3（引擎无尺）—— 成立

`scripts/test-gold.mjs` 不存在。现有五套测试确实只验机制（`test-scoring.mjs` 132 项），没有任何「推得准」的断言。

---

## 2. §3 步骤 2 的两个候选方向：一个有数据支持，一个反向

CONTROL 给的两个方向我都实现了变体并跑了同一组画像（`audit-ties.mjs`，家族权重不变、只改 famHit 的算法）：

**判据：家族因子「并列满瓶数」**——有多少瓶拿到和最好那瓶完全相同的家族分。数越大，第一步「先定家族」越没有区分力。以及**可用分数档位**（不同家族分数的个数），档位越少越像"扎堆"。

| 家族 | 现行（全标签求和） | 方向 A：只用主家族 | 方向 B：1/√n 衰减 |
|---|---|---|---|
| citrus | 117 | 117 | **16** |
| floral | 402 | **533** | **170** |
| woody | 239 | 243 | **64** |
| amber | 67 | **191** | **18** |
| fresh | 147 | 162 | **55** |
| gourmand | 142 | 142 | **66** |

| 家族 | 现行档位 | 方向 A 档位 | 方向 B 档位 |
|---|---|---|---|
| citrus | 5 | **2** | 13 |
| floral | 9 | **2** | 23 |
| woody | 9 | **2** | 26 |
| amber | 12 | **2** | 32 |
| fresh | 9 | **2** | 26 |
| gourmand | 4 | **2** | 11 |

**方向 A（改用主家族）是反向的。** 它把家族因子变成二值（主族对上 = 1.0，否则 = 0），并列数只会更多，档位从 5–12 塌到 2。woody 画像的 top-10 与现行**完全一致**，说明它连排序都没动。原因很直白：主家族本来就 1388/1388 唯一且权重多为 1.0，去掉旁标签等于扔掉信息，而不是去掉噪声。

**方向 B（1/√n）是正向的。** 并列数降到 1/3–1/8，档位升到 11–32。代价是排序会真变（woody top-10 只剩 1 条与现行重合），所以它必须配金标准回归，不能裸改。

> 这两条都属于「机制可测、方向可判」，不需要金标准就能先否掉方向 A。建议把 A 从候选中划掉，别等到金标准定稿才发现走错。

---

## 3. 一个 CONTROL 未列的真 bug：`dislikedFamilies` 只罚主族

`src/scoring.js:686-698`：

```js
if (profile.dislikedFamilies.length) {
  const fams = Object.entries(p.families || {}).filter(([k]) => k !== '_');
  const top = fams.sort((a, b) => b[1] - a[1])[0];
  const hit = profile.dislikedFamilies.find((f) => top && top[0] === f);
  if (hit) { score += WEIGHTS.dislikedFamily; ... }
}
```

注释写的理由是「带一点雪松的柑橘不该因为讨厌木质被排除」——单看这句话是对的。但配上多标签数据就成了漏洞（`audit-dislike.mjs`）：

```
含 amber 权重的瓶：599
其中「amber 不是主族」因而完全免罚：408  = 68.1%
实际被扣 -30 的瓶：191
```

逃逸样本（amber 权重都很高，用户明确答了「讨厌琥珀」）：

| 瓶 | amber 权重 | 主族 |
|---|---|---|
| `byredo-gypsy-water` | 0.5 | fresh 1.0 |
| `lattafa-khamrah` | 0.5 | gourmand 1.0 |
| `acqua-di-parma-note-di-colonia-iv` | 0.5 | —（**进了该画像 top-10**） |
| `versace-dylan-blue` | 0.4 | woody 1.0 |
| `kilian-angels-share` | 0.3 | gourmand 1.0 |
| `montale-arabians-tonka` | 0.3 | gourmand 1.0 |

`dislikedNotes` 没这个问题——它扫 `notesAll` 全表，命中即罚（含 vanilla 类 660 瓶中罚到 508 瓶 = 77%，其余是香调名写法差异，不是逻辑漏洞）。

**这一条比「多标签稀释」更该先修**：用户答的是「讨厌琥珀」，产品答的是「只要它不是主族就无所谓」。而且修法比改打分结构简单——按权重阈值罚（如 `w >= 0.4` 即扣，或按 `w` 线性扣），不动家族因子，金标准回归的面也小。

---

## 4. 金标准草案本身的问题（§3 步骤 1 会踩到）

`audit-gold.mjs` §1 / `audit-gold2.mjs`：

### 4.1 两画像无法构造

`docs/GOLD-STANDARD-DRAFT.md` 的 12 个画像里，**P09（茶香草本）与 P10（皮革感小众）的「答案设定」只给了 character**：

```
P09 spec="character=herbal/green"
P10 spec="character=leathery"
```

`audit-control3.mjs` §J 实测：`buildProfile({characterTags:['leathery']})` → `Error: 缺少 family 或 emotion`。

即：**若照草案原样写 `test-gold.mjs`，这两个画像在构造阶段就抛异常，测试跑不起来。** 需要你先定一件事——问卷是否允许「只按气质」入口？允许就要改引擎（新增纯气质档），不允许就要给这两画像补一个家族。

### 4.2 60 个槽位只覆盖 36 瓶，且严重重复

```
12 画像 × 5 瓶 = 60 槽位，去重后仅 36 瓶
creed-silver-mountain-water ×5   （P01 P02 P05 P09 P11）
creed-aventus ×4                 （P01 P05 P08 P11）
mfk-aqua-universalis ×4          （P01 P04 P05 P11）
kilian-angels-share ×3           （P01 P02 P03）
byredo-gypsy-water ×3            （P02 P05 P09）
parfums-de-marly-layton ×3       （P02 P03 P05/P09）
```

这 6 瓶占掉 24/60 个槽位。后果：`top3 命中 ≥2` 这类断言的**通过率会被这 6 瓶的排名主导**——它们进不进 top3，能同时决定 3–5 个画像的成败。测试会变得"要么一起绿、要么一起红"，失去定位能力。

顺带：36 瓶里 31 瓶在库内 popularityRank 前 100，中位 rank 55。草案是"知名瓶抽样"，不是"库内分布抽样"。做冒烟测试够用，当金标准会高估命中率。

### 4.3 两处画像自相矛盾

| 画像 | 约束 | 违规候选 | 证据 |
|---|---|---|---|
| P01 清冷感·怕甜 | dislikedNotes=Vanilla | `kilian-angels-share` | notesAll 含 tonka bean；family gourmand=1.0 |
| P02 怕晕白花 | 讨厌 Jasmine/Tuberose/Orange Blossom | `creed-silver-mountain-water` | notesAll 含 neroli（橙花同义） |

草案开头已经写了「候选里混着明显不合适的（如 P01 里的甜暖款）——确认时直接划掉」，也就是说作者知道。但**只标了没换**，而 §3 步骤 1 要求「逐个确认或替换」。这两条必须在定稿时替换掉，否则金标准自带反例。

### 4.4 一半画像的「答案设定」写的是两个家族，但引擎只收一个

P01 `family=woody/fresh`、P02 `citrus/fresh`、P03 `amber/gourmand`、P05 `citrus/fresh`、P06 `amber/woody`、P12 `floral/gourmand` —— 6/12 是斜杠写法。`buildProfile` 的 `answers.family` 是**单个 id**（`taxonomy.families.find(f => f.id === answers.family)`）。草案没写"取哪个"。我复核时按第一个取了值，但这是**我替产品做的决定**，定稿时要显式写出来，否则每个人跑出的金标准不一样。

`audit-verify-claims.mjs` 把这条也验了——照抄草案字面值会直接抛：

```
THROW P09 as drafted (character only)      -> 缺少 family 或 emotion
THROW P10 as drafted (character only)      -> 缺少 family 或 emotion
THROW P01 dual family as literal string    -> 缺少 family 或 emotion   ("woody/fresh" 不被识别)
OK    P01 dual family, first only          -> family=woody
```

三条 THROW、两条 OK，说明「取第一个」是目前唯一能跑通的解释，但它是约定不是实现。

---

## 5. 顺带一条：668 这个覆盖数里含 6 条已判拒收

`docs/TODO-REMAINING.md` 已注明「641 含 6 条已判拒收未剔除」，但 668 这个数没重申。实测 HEAD 的 `data/affiliate-links.json`：

```
coverage = {"jd":"1/1388","taobao":"668/1388"}
已判拒收的 6 条仍在库：montale-intense-cafe / frederic-malle-rose-and-cuir /
etat-libre-dorange-fat-electrician / ex-nihilo-lust-in-paradise /
maison-margiela-replica-beach-walk / carolina-herrera-good-girl-supreme
另加 montblanc-explorer（共 7 条在 probe-aff-converge.mjs 的 REVOKED 白名单里）
```

CONTROL §1 已经冻结这条线、也说了「覆盖数不再作为目标」，所以这不影响排程。仅记录：**任何未来引用 668 / 48.1% 的地方，真实可用是 661 左右。**

---

## 6. 我建议的 §3 执行顺序调整（只是建议，决定权在你）

1. **先修 `dislikedFamilies` 的主族限制**（第 3 节）。理由：不依赖金标准、改动面小、直接对应"用户说了讨厌却还推给他"这一类体感问题。
2. **金标准定稿时先解决 4.1 与 4.4**（P09/P10 能不能构造、双家族取哪个），否则 `test-gold.mjs` 写不出来，步骤 2/3 全部无法验收。
3. **步骤 2 划掉方向 A（主家族），以方向 B（1/√n）为主轴**（第 2 节数据）。方向 A 有实测反证，不需要等金标准。
4. 4.2/4.3 的草案质量问题（重复瓶、两处自相矛盾）在定稿那一轮一并处理。

---

## 附：本文件没有主张的东西

- 没有说现行打分"准"或"不准"——没有金标准就没有这个判断，这点我和 CONTROL 一致。
- 没有测 UI / 问卷两条线（它们本轮是只读审查，我这条线也无权判）。
- `1/√n` 的收益是**机制层**（并列减少、档位变多），**不等于推荐得更准**。要证明"更准"必须过金标准；本文只证明它比"主家族"更有区分力。
