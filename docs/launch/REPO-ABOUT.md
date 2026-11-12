# 仓库门面文案（About / Topics / 标签）

> 日期 2026-11-12 · 任务：上线包备料（Eddie 2026-11-12 批准，**只备料不发布**）
> 状态：**文案就绪，待 Muse 用别的通道落**。本机无 `gh` token，未尝试改任何仓库设置。

---

## 0. 数字口径声明（写文案前先钉死）

本文件所有数字均为 **2026-11-12 · HEAD `a78e6f9` · 本机实测**，出处逐条列在 §5。
**没有从旧文档抄任何数** —— 旧文档里有几处已失真（例如 `README.md` 仍写着
「用四个问题」，而当前实际是两套入口 8 / 9 屏；`docs/TODO-REMAINING.md` 里的
瓶数仍是老快照）。凡拿不准的，本文件不写。

**一处必须纠正的派单口径**：派单里写「59 瓶库」，实测**库是 1388 瓶**。
59 是 12 画像金标准里的人工判定答案瓶数（gold），不是香水库容量。两者不是一回事，
文案里分开写、不混用。

---

## 1. About 描述

### 1.1 中文版（建议 350 字符内，GitHub About 上限 350）

```
零基础香水选择器：不问"你喜欢什么香调"（新手答不出），而是问 8 屏能答的问题，
再从 1388 瓶库里给 3 瓶具体到名字的推荐。每瓶给前中后调 + 能反推回你某个答案的理由，
不是黑盒"猜你喜欢"。库来自 Scento 开放数据集（CC BY 4.0），带出处与许可说明。
```

### 1.2 英文版

```
A perfume picker for people who know nothing about perfume. Instead of asking
"which notes do you like" (a beginner can't answer), it asks 8 questions anyone
can answer, then picks 3 named bottles out of a 1,388-bottle library. Every pick
ships with its top/heart/base notes and a reason traceable back to one of your
answers — not a black-box "you may also like". Library from the Scento open
dataset (CC BY 4.0), with attribution and license stated in-repo.
```

### 1.3 为什么这么写（口径对齐 overseas-program-dataset 的做法）

| 做法 | 本仓库怎么落 |
|---|---|
| 描述带**可验证的实测数字** | 「1388 瓶」「8 屏」「3 瓶」全部可复跑（§5 给出命令） |
| 说清**数据来源与许可** | Scento / CC BY 4.0 / 仓库内 `README.md` 有 attribution 段 |
| 不吹「AI 推荐」「精准匹配」 | 写明是**规则打分 + 可反推理由**，且附上金标准的真实成绩（§2） |
| 敢写**没做到的部分** | §2 明写「家族/气质维度的命中率只有 2/12，notes 维度测不了」 |

**关于要不要把金标准成绩写进 About**：建议**不写进 About**（350 字符装不下，且读者
第一眼看不懂「2/12」是什么分母），但**必须写进 README 与介绍页**。
About 只放能一眼验证的事实。

---

## 2. 仓库标签建议（GitHub 的 "Releases / Packages / Languages" 旁边那排）

GitHub 的仓库标签不是自由文本，是 **Releases / Packages / Environments / Languages**
这几类自动生成的徽标。能人工影响的是前两类，本仓库两者都没有，**建议留空**：

| 标签位 | 建议 | 理由 |
|---|---|---|
| Releases | 不打 tag | 还没有版本化发布；打 `v0.1.0` 会让人以为有稳定 API |
| Packages | 无 | 不是可安装的包 |
| Languages | 自动（JS + CSS） | 无需干预 |
| License 徽标 | **自动显示 MIT** | 仓库根有 `LICENSE`，无需额外动作 |

> 如果你的意思是「给仓库打自定义标签」（不是 GitHub 原生那排），那 GitHub 没有这个功能 ——
> 等效物是 **topics**（§3）。这一点在回执里也说明，避免你以为漏做了。

---

## 3. Topics 建议清单

GitHub topics 上限 **20 个**，用小写、连字符、不带 `#`。按优先级排：

### 3.1 第一梯队（必选，6 个 —— 决定被不被搜到）

| topic | 为什么 |
|---|---|
| `perfume` | 主领域词，最大搜索面 |
| `fragrance` | 英文同义词，欧美用户主要用这个 |
| `recommendation-engine` | 技术属性，开发者会搜 |
| `questionnaire` | 交互形态，区别于「拍照识香」类产品 |
| `vanilla-js` | 技术栈，无框架是卖点之一（零构建） |
| `open-data` | 数据来自开放数据集，吸引数据侧用户 |

### 3.2 第二梯队（建议，8 个 —— 精准但搜索量小）

| topic | 为什么 |
|---|---|
| `scent` | 领域近义词 |
| `explainable-ai` | **不是 AI**，但「可解释推荐」是这个领域最贴的检索词 —— 慎用，见下 |
| `rule-based` | 更准确的技术描述（替代上一条） |
| `static-site` | 部署形态 |
| `cc-by-4` | 数据许可，便于许可合规检索 |
| `chinese` | 中文产品，中文用户会筛 |
| `no-build` | 零构建，工程卖点 |
| `accessibility` | 仓库有 43 项无障碍断言，是真实卖点 |

**关于 `explainable-ai` 的取舍（建议只留 `rule-based`）**：本项目的推荐**不是** AI/ML，
是手写权重 + 规则。挂 `explainable-ai` 会被懂行的人当成蹭词，属于**可验证性风险**。
**建议只用 `rule-based`**，并在 README 里明写「不调用任何模型」。

### 3.3 不建议用的

| topic | 为什么不用 |
|---|---|
| `machine-learning` / `llm` / `gpt` | 事实错误，本仓库零模型调用 |
| `taobao` / `affiliate` | 会把仓库导向「带货站」印象，且佣金线已冻结 |
| `awesome` / `awesome-list` | 不是清单 |

---

## 4. 配套：社交预览图

`docs/launch/social-preview.png`（**实测 1280×640，67KB**）—— GitHub 仓库设置里的
**Social preview** 上传位。规格、版式与站内视觉的对应关系、缩到 640×320 时的可读性
评估，见同目录 `SOCIAL-PREVIEW.md`。

图上文字：`不懂香水，也能挑到那一瓶` + `不问「你喜欢什么香调」——问 8 个你答得出的问题`
+ 四个数字 `1388 瓶香水库 / 8 屏问卷 / 58 个香调词 / 0 次模型调用`。

**「0 次模型调用」是有意放进去的**：它是这个产品与「AI 推荐」类产品最大的区别，
也是图里唯一一条可以被打开仓库验证的技术主张。

---

## 5. 每个数字的出处（可直接复跑）

| 数字 | 值 | 出处 / 命令 |
|---|---|---|
| 香水库容量 | **1388 瓶** | `node -e "console.log(require('./data/perfumes.json').perfumes.length)"` → `1388`；同文件 `meta.count = 1388`、`meta.fullPopulation = true` |
| 问卷屏数（家族入口） | **8 屏** | `scripts/test-render.mjs:856` 断言 `/共 8 步/`；`STEPS` 数组 9 项减「整族排除」后家族入口 8 屏 |
| 问卷屏数（情绪入口） | **9 屏** | `scripts/test-render.mjs:1902` 断言 `第 9 步 / 共 9 步` |
| 每次推荐瓶数 | **3 瓶** | `src/scoring.js` `recommend()` 默认 `topN = opts.topN ?? 3` |
| 每瓶平均香调数 | **8.7 条** | `node -e` 对 `perfumes.json` 的 `notesAll` 求均值 → `8.7` |
| 不同香调写法总数 | **412 种** | 同上，`notesAll` 去重后 `412` |
| UI 可选香调 chip | **58 个**（词表 60 滤掉 2 个 0 命中） | `src/notes.js` 的 `usableEntries()` 实测 `58 of 60` |
| 家族数 | **6 族** | `data/taxonomy.json` `families`：柑橘/花香/木质/东方琥珀/清新/美食 |
| 淘宝有链接覆盖 | **661 / 1388** | `data/affiliate-links.json` 的 `coverage.taobao` |
| 京东有链接覆盖 | **1 / 1388** | 同上 `coverage.jd` |
| 金标准 MAJORITY | **2 / 12** | `node scripts/test-gold.mjs` → `GOLD MAJORITY 2/12 STRICT 4/12` |
| 金标准 STRICT | **4 / 12** | 同上 |
| notes 小金标准 | **0 / 8 · 1 / 8** | `node scripts/test-gold-notes.mjs` → `GOLD-NOTES MAJORITY 0/8 STRICT 1/8` |
| 无障碍断言数 | **43 项** | `node scripts/test-contrast.mjs` → `PASS 43  FAIL 0` |
| 渲染断言数 | **306 项** | `node scripts/test-render.mjs` → `PASS 306  FAIL 0` |
| 数据许可 | **CC BY 4.0** | `data/perfumes.json` 的 `meta.license`；`README.md` 的 attribution 段 |

### 5.1 金标准的成绩怎么讲（重要：不许美化）

**2/12 与 4/12 是「人设金标准」的成绩，不是「推荐质量」的全面评价。** 讲的时候必须带上分母含义：

- **MAJORITY 2/12**：12 个人设画像里，只有 2 个能做到「推 3 瓶里有 ≥2 瓶是人工判定对的」。
- **STRICT 4/12**：12 个里有 4 个的第一瓶就是对的。

**为什么不掩盖**：这个数偏低是**已知且有诊断的** —— `CONTROL.md` §5 记录了收口结论：
这套 12 画像金标准量的是**家族/气质维度**，notes 维度不在它的量程内（判定轴不对齐）。
所以：
- 说「命中率 2/12」= **诚实但容易被误读**（读者会以为引擎很差）；
- 说「我们有个 12 画像金标准」而**不提分数** = 暗示比实际更好。

**建议写法**（介绍页与 README 用这句）：
> 「我们有一套 12 个人设画像的人工金标准用于防回退。当前 top3 命中 ≥2 的画像有 **2/12**、
> top1 命中 **4/12** —— 这个数字不高，原因已定位：这套集量的是家族与气质维度，
> 香调维度的判定轴与它不对齐（见 `CONTROL.md` §5）。它守的是「不许变差」，不是「已经很好」。」

---

## 6. 落地清单（给 Muse）

| 项 | 内容 | 通道 |
|---|---|---|
| About 描述 | §1.1 中文（或 §1.2 英文，二选一，GitHub About 只存一个） | 需 `gh` token / 网页 |
| Topics | §3.1 六个（+ §3.2 选 `rule-based` / `cc-by-4` / `accessibility` / `no-build`） | 同上 |
| Social preview | `docs/launch/social-preview.png` 上传 | 同上 |
| 仓库标签 | **不建议动**（§2） | — |
| README 更新 | **本单未做**（见 §7） | 另议 |

---

## 7. 本单未做的事（及原因）

1. **未改 README.md。** 它现在仍写「用四个问题」「55 个香调」「55 个香调」等与现状不符的内容
   （实际 8/9 屏、58 个可用 chip）。改 README 属于「仓库门面重写」，超出「About 文案」范围，
   且 README 里有大量 D 编号引用与历史记录，改动面大、需单独一轮。**建议另立一单。**
2. **未改任何 GitHub 仓库设置**（无 token，且派单明确只备料）。
3. **未生成 social preview 以外的任何图片。**
