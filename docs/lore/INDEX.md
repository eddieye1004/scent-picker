# docs/lore/ 语料目录（INDEX）

结果卡背书语料全量清单：popularityRank 升序第 1–550 位的 550 条，按批次分 8 个文件存放。
口径：**汇编只做搬运，不做任何字符规范化**（弯撇号 ’、弯引号 “ ”、全角标点一律按源产物原字节保留）。
源产物全部在笔记本本地 `.legs` 与 Qoder 会话目录，2026-11-23 之前从未入 git；本目录是它们在仓库里的唯一副本。

## 1. 文件与条数

| 文件 | 位次 | 条数 | 有背书 | 无可靠来源（留空） | 验收/产出日期 |
|---|---|---|---|---|---|
| `lore-batch1-1-50.md` | 1–50 | 50 | 47 | 3 | 2026-11-19（Muse 抽查 8 条，非全量） |
| `lore-batch2-51-150.md` | 51–150 | 100 | 91 | 9 | 2026-11-19 |
| `lore-batch3-151-250.md` | 151–250 | 100 | 91 | 9 | 2026-11-20（独立复核重建） |
| `lore-batch4-251-280.md` | 251–280 | 30 | 29 | 1 | 2026-11-22（试点批 Pass）＋ 2026-11-22 第 278 条改判 |
| `lore-batch4-281-340.md` | 281–340 | 60 | 60 | 0 | 2026-11-22 编写／2026-11-23 补写 4 条 |
| `lore-batch4-341-400.md` | 341–400 | 60 | 60 | 0 | 2026-11-22 |
| `lore-batch5-401-475.md` | 401–475 | 75 | 71 | 4 | 2026-11-23（含 4 条 Afnan 判例下调） |
| `lore-batch5-476-550.md` | 476–550 | 75 | 72 | 3 | 2026-11-23（commit 5b5c1e1） |
| **合计** | **1–550** | **550** | **521** | **29** | — |

分四段核对（与验收线一致）：1–250 = 250 条；251–400 = 150 条；401–475 = 75 条；476–550 = 75 条。**合计 550，无缺号、无重号、无越界重叠。**

## 2. 源产物路径（逐文件溯源）

| 入库文件 | 源产物绝对路径 | 该源产物的验收/回执记录 |
|---|---|---|
| `lore-batch1-1-50.md` | `C:\Users\16256\Documents\Qoder\2026-11-19\1cb7df14\lore-batch1.md` | 无独立回执；Muse 抽查记录在共享脑 `STATE.md:163`（8/47 条，7 相符 1 不可核） |
| `lore-batch2-51-150.md` | `C:\Users\16256\Documents\Qoder\2026-11-19\a16e3ab8\lore-batch2.md` | 同目录 `q4.receipt.md`（2026-11-19 22:18） |
| `lore-batch3-151-250.md` | `C:\Users\16256\Documents\Qoder\2026-11-20\94b38b32\lore-batch3.md` | 同目录 `_verifyA-out.md`／`_verifyB-out.md`／`_urlstatus.json`；初编回执为 `2026-11-19\34c7e218\q7.receipt.md`（**非**本文件对应版） |
| `lore-batch4-251-280.md` | `C:\Users\16256\work\.legs\lore-pilot-20261122\lore-batch4-pilot30.md` | 同目录 `receipt.md`；验收记录 `STATE.md:184`（腿 run-20261122-191014-9744，Pass） |
| ↳ 其中第 278 条 | `C:\Users\16256\work\.legs\lore-pilot-20261122\lore-batch4-278-supplement.md` | 同目录 `receipt-278.md`；裁决 `DECISIONS.md:149`（Eddie 2026-11-22 批准） |
| `lore-batch4-281-340.md` | `C:\Users\16256\work\.legs\lore-b4b-20261122\lore-batch4-281-340.md` | 同目录 `receipt.md`（2026-11-23）；补写腿回执 `.legs\lore-fix-20261123\receipt.md` |
| `lore-batch4-341-400.md` | `C:\Users\16256\work\.legs\lore-b4c-20261122\lore-batch4-341-400.md` | 同目录 `receipt.md`（2026-11-22 20:24） |
| `lore-batch5-401-475.md` | `.legs\lore-b5a-20261123\lore-batch5-401-475.md` | 同目录 `receipt.md`；修正腿 `.legs\lore-fix-20261123\receipt.md` |
| `lore-batch5-476-550.md` | `.legs\lore-b5b-20261123\lore-batch5-476-550.md` | 同目录 `receipt.md`；本目录 `verify-476-550.ps1` + `evidence-476-550/verify-out.txt` |

## 3. 逐文件字节状态

| 入库文件 | 字节 | 与源产物关系 |
|---|---|---|
| `lore-batch1-1-50.md` | 27,999 | **整文件字节相同**（sha256 `e43acccc…30fb3`，与源完全一致） |
| `lore-batch2-51-150.md` | 101,625 | **整文件字节相同**（`e5fc170d…8dcfd`） |
| `lore-batch3-151-250.md` | 121,562 | **整文件字节相同**（`d5b3aba9…67ffaa`） |
| `lore-batch4-251-280.md` | 51,763 | 29 条逐字节相同；**第 278 条按裁决换版**，标题下加一段「入库注记」，其余字节不动 |
| `lore-batch4-281-340.md` | 108,907 | **整文件字节相同**（`b1e73327…a212c1`） |
| `lore-batch4-341-400.md` | 80,721 | **整文件字节相同**（`357b7587…304a97`） |
| `lore-batch5-401-475.md` | 111,565 | 既有文件，未改动（`4fc95670…df79fa0`） |
| `lore-batch5-476-550.md` | 111,386 | 既有文件，未改动（`c7b95d81…5b98f92b`） |

全部文件：**LF 换行、无 BOM**（仓库 `.gitattributes` 写死 `eol=lf`）。

## 4. 已知差异与未了事项（登记，不擅自改动）

1. **第 278 条换版**：试点批原为「无可靠来源」留空；按 `DECISIONS.md:149` 裁决与 `lore-batch4-278-supplement.md` 终版，改为按 2025 版 Burberry Her Eau de Parfum Intense 写背书（官方标语）。该条附带的**数据债**（id `burberry-her-intense` 与实际产品不符）只记在 supplement 文件末尾「数据债」段，未抄入本目录。因此 `lore-batch4-251-280.md` 头部「统计」一行仍写「2 瓶…留空」，为试点批原始口径，**未改写**；实际留空 1 条。
2. **`lore-batch4-281-340.md` 头部统计与正文不符**：头部写「名人同款 5 / 官方标语 27 / 经典故事 18」，正文实测为「官方标语 33 / 经典故事 21 / 名人同款 6」（合计均 60）。以 2026-11-23 机器校验与 `receipt.md` 的 33/21/6 为准，头部那行是 16 条补写前的旧口径。按「不改写已验收内容」保留原样。
3. **第 1 批两条 Muse 抽查意见未落实**（源文件即如此）：第 32 条 Jicky 现写「率先将香兰素与香豆素入香」，抽查建议改为「将当时新发现的…入香」（首用通常归 1882 年 Houbigant Fougère Royale）；第 1 条 YSL Libre 时态建议加「此前」。见 `STATE.md:163`。**这是待办，不是本次汇编可改项。**
4. **第 1 批第 12 条备注**写「仅搜索摘要佐证」，抽查指出官网全文已可复现——备注口径偏保守，同样保留原样。

## 5. 复跑方式

本目录的字节取证脚本不在仓库内（在腿目录 `C:\Users\16256\work\.legs\lore-ingest-1400-20261123\verify.py`）。第 5 批的语义校验可原地复跑：

```powershell
pwsh -File docs/lore/verify-476-550.ps1
```
