# P0–P3 迁移执行记录 · taxonomy v1.0.0 → v2.0.0（32 类 → 28 类）

日期：2026-10-31 · 回滚点：`C:/Users/16256/ego/taxbak-20261031-131157`（taxonomy.json / app.js / test-render.mjs / DECISIONS.md + MANIFEST.sha256）· git `242372b`

> 执行中 `_audit/` 被外部进程清空过一次（13:12 之后的写入全部丢失，只有 13:12 之前的一份副本留在 `C:/Users/16256/ego/deadcode-test/_audit/`）。已从该副本恢复全部证据脚本与两份审计报告；丢失的 `migrate-v2.cjs`、`sync-icons.cjs` 与本记录已重建。**迁移结果本身没丢**——`taxonomy.json` 与 `app.js` 的改动都在盘上并已验收。

## 一、执行结果（28 类）

| 族 | 类数 | 小类 |
|---|---|---|
| 柑橘调 citrus | 4 | 古龙水型 · 青绿柑橘 · 柑橘花香 · 芳香柑橘 |
| 花香调 floral | 6 | 玫瑰 · 白花 · 果香花香 · 粉感花香 · 绿叶花香 · 单一花 |
| 木质调 woody | 6 | 檀木 · 干燥木质 · 香根草 · 苔藓木质 · 芳香木质 · 乌木 |
| 东方琥珀调 amber | 6 | 香草琥珀 · 辛香琥珀 · 冷焚香 · 暖焚香 · 树脂 · 皮革 |
| 清新调 fresh | 4 | 水生 · 绿意 · 馥奇 · 茶香 |
| 美食调 gourmand | 2 | 香草美食 · 果味美食 |

净变化：32 − 3（合并：黄花→白花、海洋→水生、坚果→香草美食）− 2（降级为标签：咖啡可可、酒香）+ 1（拆分：焚香→冷/暖）= **28**。

## 二、逐项执行

### P0

| 项 | 动作 | 变更前后 | 原料核实（全库瓶数） |
|---|---|---|---|
| 黄花 → 白花 | 删 `yellow-floral`；白花 notes 补 `ylang-ylang`；新增标签 `warm-white` | 花香 7 → 6 类；依兰那批 83 瓶并入白花 | ylang-ylang 83 |
| 芳香柑橘重定义 | notes `[bergamot]` → `[bergamot, lavender, rosemary, sage]`；`requires: [lavender, rosemary]` | 命中 225 → 收窄 **55 瓶**（两味全中仅 6） | lavender 142 / rosemary 31 / sage 71 |
| 芳香木质重定义 | notes 补 `cedarwood, rosemary`；`requires: [juniper, sage]` | 命中 230 → 收窄 **49 瓶**（全中 2） | juniper 49 / sage 71 / cedarwood 307 |

### P1

| 项 | 动作 | 变更前后 | 原料核实 |
|---|---|---|---|
| 茶香重定义 | notes `[green tea]` → `[tea, bergamot, jasmine]`；`requires: [tea, bergamot]` | 0 命中 → 收窄 **311 瓶**（全中 11） | tea 34 / bergamot 142 / jasmine 310 |
| 水生重定义 | notes `[musk]` → `[calone, melon, sea salt, driftwood]`；新增标签 `saline` | 去掉 musk（族内 39%） | calone 3 / melon 16 / driftwood 3 |
| 香草甜 → 香草美食 | 改名；notes 补 `benzoin`；`requires: [vanilla]` | 222 → 收窄 **182 瓶** | vanilla 422 / tonka 173 / benzoin 78 |
| 香草琥珀补 notes | `[amber]` → `[vanilla, benzoin, labdanum, amber]`；`requires: [vanilla]` | 340 → 227 瓶 | vanilla 422 / benzoin 78 / labdanum 75 / amber 303 |

### P2

| 项 | 动作 | 结果 |
|---|---|---|
| 海洋 → 水生 | 删 `marine`；水生新增 `saline` 标签 | 清新 5 → 4 类 |
| 坚果 → 香草美食 | 删 `nutty`；成为标签 | 美食 5 → 3 类 |
| 咖啡可可 / 酒香降级 | 删 `coffee-cocoa`、`boozy`；成为 `brewed` / `boozy` 标签 | 美食 5 → 2 类 |
| 焚香拆分 | `incense` → `incense-cold`；新增 `incense-warm`（notes `[incense, benzoin, cinnamon]`） | 琥珀 5 → 6 类；冷 46 / 暖 90（收窄口径） |

### P3

| 项 | 动作 |
|---|---|
| 古龙水型 | notes 补 `bergamot, lavender, musk`；desc 改三段可执行 |
| 青绿柑橘 | notes 补 `galbanum, violet leaf`；`requires: [petitgrain, galbanum]` → **27 瓶** |
| 柑橘花香 | notes 补 `jasmine, orange` |
| 玫瑰 | notes 补 `geranium, violet leaf` |
| 果香花香 | notes `[peony]` → `[peony, blackcurrant, peach]` |
| 粉感花香 | notes 补 `heliotrope`（41） |
| 绿叶花香 | notes 补 `hyacinth`（7）、`violet leaf` |
| 单一花 | desc 改"一种花的三个部位"；新增 `structure: [petal, leaf, bud]` |
| 檀木 / 干燥木质 / 香根草 / 苔藓 / 乌木 | 各加 `form` 与 `excludes`；干燥木质补 `guaiac wood, ambroxan`；香根草补 `angelica`；苔藓补 `bergamot`；乌木补 `labdanum, saffron` |
| 辛香琥珀 | `zh` 温暖辛香 → 辛香琥珀；notes 定 `cinnamon, cardamom, saffron, clove` |
| 树脂 | `[frankincense, myrrh]` → `[benzoin, labdanum, myrrh]`（乳香让给冷焚香） |
| 皮革 | notes 补 `birch, saffron, styrax` |
| 果味甜 → 果味美食 | 改名；notes `→ [blackcurrant, apple, peach, caramel]` |
| 绿意 | `fig leaf`（0 瓶）→ `fig`（27）+ `tomato leaf`（3） |
| 馥奇 | notes 补 `coumarin`（6）、`tonka bean`；`requires: [lavender, oakmoss]` |

## 三、连带修改

| 文件 | 改动 |
|---|---|
| `data/taxonomy.json` | version → 2.0.0；28 类；noteIndex 61 → 60 条（改写 10、新增 9、删 1 条重复） |
| `app.js` | `SUB_MARKS` 32 → 28（删 5 枚、`incense`→`incense-cold`、新增 `incense-warm`）；`SUB_FIT` 同步 |
| `scripts/test-render.mjs` | 无需改动（断言数据驱动：从 taxonomy 读小类，要求每类有图标且两两不撞形） |

新增 `incense-warm` 图标用"香锥 + 底盘 + 两道短烟"，与冷焚香的"三支直立线香"结构完全不同——同族两格不撞形是硬要求。

## 四、验收

| 检查 | 结果 |
|---|---|
| 小类总数 | 28 |
| `SUB_MARKS` / `SUB_FIT` / taxonomy 三方 id | 28 / 28 / 28，缺 0 多 0 |
| 登记原料 0 命中的类 | **0 个**（迁移前 2 个） |
| taxonomy 自检（id 唯一 / notes 非空 / desc ≥8 字 / noteIndex 指向存在） | 通过 |
| noteIndex 重复概念 | 0 |
| test-render | **145 PASS / 0 FAIL** |
| test-contrast | 34 PASS / 0 FAIL |
| test-scoring | 106 PASS / 0 FAIL |
| test-compliance | 10 PASS / 0 FAIL |
| qa-data | ✓ 全部通过（1228 瓶，Armaf 188 瓶 15.3%） |

迁移后 test-render 一度 144/1，失败项是"「展开全部」计数与实际可选香调数一致：按钮 59 vs 去重 58"——noteIndex 里"乳香"出现两次。删重复即 145/0。这条断言正好起了作用。

## 五、改后六维重算（`_audit/evidence5.md`）

| 指标 | 迁移前 | 迁移后 |
|---|---|---|
| 类数 | 32 | 28 |
| 平均分 | 14.3 / 30 | **14.8 / 30** |
| ≥18 分的类 | 4 | **3**（香草美食 21、水生 20、果味美食 19） |
| 登记原料 0 命中 | 2 | **0** |

**平均分几乎没涨，原因必须说清**：六维里的"同质性"要求"命中 ≥2 个自身登记原料"。把大多数类补到 3–4 个原料后，分母变大、核心瓶比例反被稀释；"互斥性"也几乎没动，因为 `requires` 用的是"组内任一命中"口径（与审计报告 evidence3 D 节的"只有芳香草本 56 瓶"一致），若按"全部命中"则 N 会压到个位数（青绿柑橘全中 1 瓶、芳香木质全中 2 瓶）。

**这轮改的是"定义能不能落地"**——desc / notes / requires / form / excludes 齐备、0 命中原料清零、noteIndex 与类 id 严格一致。分数要真上去，下一步得改评分模型。

## 六、未做 / 待验证

1. **`requires` 两种口径未定论**：现按"组内任一命中"（青绿 27 / 芳香柑橘 55），"全部命中"则只有 1 / 6 瓶。这决定改后各类真实规模。
2. **木质 `form` 只写未用**：库里没有"主调"字段，无法算准 153 瓶檀木里该迁出的部分。
3. **香草琥珀 vs 香草美食高度重叠**（227 vs 182 瓶，`requires` 都是 vanilla），族内二次判定未实现。
4. **文案未同步**：`README.md`、`docs/DECISIONS.md`、`docs/WHEEL-DESIGN.md`、`icon-specimen/spec.md` 仍写"32 类 / 32 枚"。
5. **未提交 git**：`data/taxonomy.json` 在工作树（`M`），`app.js` 改动已随 `242372b` 入库。
