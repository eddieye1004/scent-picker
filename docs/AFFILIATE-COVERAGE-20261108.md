# 推广链接覆盖率实测报告（2026-11-08）

> 本文件是本轮工作的唯一结论载体。数据口径：`data/affiliate-links.json` 的 `taobao` 对象 key 数与 `data/perfumes.json` 的 1388 瓶逐一对照。

---

## 0. 结论先行

| 项 | 值 |
|---|---|
| 开工时实测（22:56，`probe-aff-baseline.mjs`） | **624 / 1388**（45.0%） |
| 期间他人提交 `74b35cd`（23:02，非本轮产出） | 637 / 1388 |
| 本轮工作树中间态（未提交，已被覆盖） | 634 / 1388 |
| **当前库内实测（`f0fcc8d` 之后）** | **641 / 1388**（46.2%） |
| 净变化（相对开工时） | **+17** |

**核心结论两条**：

1. **「品牌 + 香水家族」这个降级策略不成立。** 跑满 578 次查询命中 9 瓶，二次复核**全部 9 瓶判死**（0 通过）。淘宝返回的是同品牌的泛列表页，不是这一瓶。这条路本轮被实测证伪，不是"还没调好"。
2. **641 里含 6 条已判死但仍在库内的错配。** 本报告第 2.2 节的二次闸门共判死 17 条，其中 6 条曾从工作树删除（降到 634），但 `f0fcc8d` 的整文件重跑把它们写回来了。**真正经过复核的干净数应为 635**（641 − 6），而 634/635 都还没提交成最终态。

---

## 1. 改前 / 改后（实测数字，非估算）

```
开工实测    624/1388   node scripts/probe-aff-baseline.mjs
期间提交    637/1388   74b35cd（他人，23:02，非本轮）
中间态      634/1388   工作树，从未提交，已被 f0fcc8d 覆盖
当前库内    641/1388   f0fcc8d（23:43）+ 工作树，实测
```

**641 的构成**：624（开工） + 13（`74b35cd` 译名） + 4（`f0fcc8d` 补回缓存）= 641。本轮二次闸门判死的 6 条**已回到库内**，因为删除只发生在工作树、从未提交。

若用户裁决重新剔除这 6 条，正确结果是 **635/1388**；剔除后还需处理 26 条价格 ≤ ¥30 的试香/小样（见 §3 末尾），那时才是真正的干净数。

**备份**：`data/affiliate-links.json.bak-20261108`、`data/affiliate-links.source.json.bak-20261108`（307790 B / 306428 B，写前 `Copy-Item` 生成，可 `Copy-Item -Force` 回滚）。注意这两份备份是 637 那一版的快照，不是 641。

**备份**：`data/affiliate-links.json.bak-20261108`、`data/affiliate-links.source.json.bak-20261108`（307790 B / 306428 B，写前 `Copy-Item` 生成，可 `Copy-Item -Force` 回滚）。

---

## 2. 每条策略各触发多少条

### 2.1 淘宝关键词阶梯（764 瓶 × 最多 6 层，共 2710 次请求）

| 层 | 查询内容 | 执行次数 | 有候选 | 原始命中 | 二次复核通过 |
|---|---|---:|---:|---:|---:|
| L0 | 香名中文译名裸词 | 15 | 15 | **13** | **7** |
| L1 | 中文品牌 + 香名译名 | 2 | 2 | 1 | 1 |
| L2 | 英文香名 / 香名首词 | 751 | 282 | 1 | 0 |
| L3 | 中文品牌 + 香名首词 | 581 | 32 | 3 | 2 |
| L4 | 英文品牌 + 香名首词 | 746 | 64 | **0** | 0 |
| L5 | 中文品牌 + 香水家族 | 578 | 317 | 9 | **0** |
| — | 合计 | 2673 | — | 27 | 10 |

（另 37 次调用在拿到 stage 记录前就报错中止，计入 `requests` 总数 2710，不计入上表。）

读法：
- **L0 是唯一有效的降级路径**，15 次查询 13 命中，复核后仍留 7 条。译名来自 `data/fragrance-aliases.json`，每条带淘宝实测证据（hits ≥ 2）。
- **L2/L4 基本无效**：英文香名 751 次仅 1 命中（且复核 fail），英文品牌+香名 746 次 0 命中。与既有结论一致 —— 淘宝上这些香水只以中文名在售。
- **L5（品牌+家族）是本次任务要求验证的重点，结论是证伪**：578 次调用、317 次有候选、9 次原始命中，**复核 0 通过**。9 条的失败理由全部是「拉丁独特词未命中」，即标题里根本没有这一瓶的款名，只有品牌 + 香调描述。
- L0 的 13 条原始命中里 6 条复核未过 —— **恰好就是被删掉的那 6 条**（罗列页 4 / flanker 1 / 套盒 1）。
- L3 的 3 条里 1 条是 `montblanc-explorer`（标题实为 Explorer **PLATINUM**，数据库中另有该瓶），从未入表。

**10 条通过复核的归属**：7 条已在表中（`74b35cd` 写入，本轮复核后保留），3 条为本轮新增（`amouage-reflection-man` / `juliette-has-a-gun-gentlewoman` / `kilian-dark-lord`）。这解释了为什么本轮净增只有 3 —— 大头已经被那次并发提交先落了地。

### 2.2 二次复核闸门（`probe-aff-verify.mjs`）

三档判定，只有前两档允许入表：

| 判定 | 条数 | 含义 |
|---|---:|---|
| `latin-all` | 2 | 标题含香名去掉品牌与系列名后的**全部**独特词 —— 强证据 |
| `cn-alias` | 8 | 中文译名整串命中，且无母瓶 / 无兄弟瓶 / 非罗列页 |
| `ambiguous` | 7 | 译名命中但存在歧义（flanker / 罗列页 / 下游款） |
| `fail` | 10 | 独特词未命中且无译名命中 |

共复核 27 条（全部 ladder winner）。其中 `latin-all` + `cn-alias` = 10 条，`ambiguous` = 7 条，`fail` = 10 条；10 + 7 + 10 = 27 ✓

复核加的三条附加检查（前两者来自 `scripts/merge-affiliate-batch.mjs:54-78` 的既有教训）：
1. **母瓶 / flanker**：本瓶是某瓶的 flanker 且译名只覆盖基础名 → 不采信。实测拦下 `carolina-herrera-good-girl-supreme`（「好女孩」+「粉色高跟」，无法区分 Supreme / Blush / 原版）。
2. **罗列页**：挖掉品牌、译名、成交话术后剩余中文字 > 14 → 判为店铺罗列页。实测拦下 4 条（剩余 15–19 字）。
3. **下游 flanker**：标题完整包含某个更长款的全名 → 判为更长款。实测拦下 `montblanc-explorer`。

---

## 3. 仍失败的原因分布（747 瓶，四类互斥）

> 口径：按当前库内 641 条算缺链 747 瓶，用 `scripts/probe-aff-causes.mjs` 重算。**注意这 747 已扣除仍在库内的 6 条错配**（它们被算作"已覆盖"，尽管是错的）；若剔除，缺链应为 753。

| 类别 | 瓶数 | 判定依据 |
|---|---:|---|
| A · 接口对该查询词返回 0 条 | **210** | 阶梯全层 0 结果；真没有这件货的推广计划 |
| B · 召回但判据拒 | **479** | 见下表细分 |
| F · 二次闸门拒收（未入表） | **10** | 接口召回且 `scoreMatch` 接受，但复核认定罗列页 / 同系列另一款 / 下游款 |
| D · 结构性不可达（合并系列） | **48** | 同品牌同系列前缀 ≥3 瓶（31 组 134 瓶），淘宝标题只写系列名 |
| 合计 | **747** | = 1388 − 641 ✓ |

F 类现有 10 条（另 7 条已被 `f0fcc8d` 写回库内，不在缺链集合里）：`armaf-club-de-nuit-milestone` / `kenzo-leau-kenzo` / `dior-dior-homme-intense` / `rabanne-million-gold-for-her` / `armaf-club-de-nuit-urban-man` / `armaf-dubai-nights-midnight` / `armaf-hunter-for-man` / `armaf-le-parfait-azure-femme` / `ysl-libre-eau-de-toilette` / `montblanc-explorer`。

### B 类细分（479）

| 拒绝理由 | 条数 |
|---|---:|
| 香名覆盖率 0% < 60% | 218 |
| 类目不是香水（`category_name` 不含「香水」） | 119 |
| 品牌名未出现在标题里 | 38 |
| 小样 / 试用装 | 38 |
| 香名覆盖率 33% | 18 |
| 性别不符（瓶名与标题男/女相反） | 14 |
| 香名覆盖率 50% | 13 |
| 非香水品类（沐浴 / 唇膏 / 身体乳 / 香皂 / 洗发） | 8 |
| 香名覆盖率 25% / 20% / 40% | 6 / 5 / 2 |

「类目不是香水」那 119 条不是判据过严，是**判据救回来的**：召回结果里混着女装/毛呢外套、书籍/原版书、零食糕点、摩托车滤清器、吉他拨片、膨胀螺丝等。类目闸门正是为挡这些而存在的。

### D 类（结构性不可达）细节

31 组合并系列里缺链最多的：`Guerlain「aqua allegoria」×8`、`Armaf「club de」×16`、`Giorgio Armani「emporio armani」×5`、`Acqua di Parma「note di」×5`、`Armaf「profumi d'art」×5`。按品牌：Armaf 29、Guerlain 8、Giorgio Armani 7。

这些瓶即便搜到中文标题，标题也只写系列名（如「娇兰花草水语淡香水系列」），无法区分是哪一支。把它记到某一瓶名下等于 1/N 概率的错配，比留空更糟。

---

## 4. 京东线结论：**要用户登录后才能做**（不做 API 那条路）

三条路逐一实测，都是硬结论不是猜测（`scripts/probe-aff-jd-health.mjs` / `probe-aff-jd-scope.mjs` / `probe-aff-jd-shape.mjs`）：

| 路径 | 实测结果 | 判定 |
|---|---|---|
| `jd.union.open.goods.query` | `HTTP 200 · code=403 无访问权限` | 接口未授权，稳定复现 |
| `jd.union.open.promotion.common.get` | 壳 `code=0`，业务码 `2001701 不支持siteId用于此种方式推广,只支持网站/APP` | 权限**有**，但本账号媒体类型是「聊天工具/微信」，不收 |
| `jd.union.open.promotion.bysubunionid.get` | 业务码 `403 无访问权限`（带/不带 subUnionId 都是） | 社交电商这条路也没授权 |
| 网页版「批量推广 → 导购媒体推广」 | 需登录态浏览器，产出 GBK CSV（9 列，含 `u.jd.com` 短链） | **唯一可行路径** |

**结论：不做 API 这条路（权限不在自己手里，FAQ 说只能发邮件到 cps@jd.com 申请，无网页入口）；要做只能走网页版批量转链，且必须有用户的登录态浏览器。**

配套代码已就绪：`scripts/fetch-jd-web.mjs` + `scripts/lib/jd-web.mjs` + `scripts/test-jd-web.mjs`（17 项全绿），CSV 解析与批量上限（60/批）都是纯函数并有测试钉着。也就是说：**登录态一有，这条线当天就能跑，不需要再写代码。**

### 顺带发现的一个代码缺口（未修，报给 Lead）

`scripts/lib/union-api.mjs:85` 的 `unwrapJd` 只认 `node.result || node.queryResult`：

```js
const inner = node.result || node.queryResult;
if (!inner) throw new Error(`${key} 里既没有 result 也没有 queryResult`);
```

而 `jd.union.open.promotion.common.get` 的真实壳结构是 `{ code: 0, getResult: "<json 字符串>" }`。所以即使京东权限开通，这个方法在当前 lib 下会**抛错而不是返回**。修法是把 `getResult` 加进那一行（1 行改动），但该文件不在本轮写范围，故只报告不动手。

---

## 5. 测试

| 套件 | 结果 |
|---|---|
| `scripts/test-union-api.mjs` | **PASS 72 / FAIL 0**（本轮开工时 52；`74b35cd` 并入 6 项、`f0fcc8d` 并入 14 项，均非本轮改动） |
| `scripts/test-jd-web.mjs` | **PASS 17 / FAIL 0** |
| 合计 | **89** |

本轮**没有修改** `scripts/test-union-api.mjs` / `scripts/lib/union-api.mjs` / `scripts/` 下任何既有文件，上述数字是既定基线，不是本轮改动造成。

---

## 6. 本轮新增的方法与工具

| 文件 | 作用 |
|---|---|
| `scripts/probe-aff-baseline.mjs` | 覆盖率口径核对（key 数 vs coverage 字符串、缺链分布、品牌集中度） |
| `scripts/probe-aff-health.mjs` | 淘宝接口连通性体检（只打键名与长度，不打凭证） |
| `scripts/probe-aff-ladder.mjs` | 6 层关键词阶梯，小批跑、`--resume` 断点续跑、失败即停 |
| `scripts/probe-aff-verify.mjs` | **二次闸门**：独特词全中 + 母瓶/flanker + 罗列页 + 下游 flanker |
| `scripts/probe-aff-converge.mjs` | 按复核结论删/加，写前备份，删加后自检 |
| `scripts/probe-aff-causes.mjs` | 缺链原因四分类（A/B/F/D），按可执行动作归而非按报错文案归 |
| `scripts/probe-aff-series.mjs` | 结构性不可达分析（合并系列） |
| `scripts/probe-aff-replay.mjs` | 缓存回放：不花配额，用当前判据重评已有候选 |
| `scripts/probe-aff-jd-health.mjs` / `-jd-scope.mjs` / `-jd-shape.mjs` | 京东三条路取证 |

产物缓存：`data/.cache/aff-ladder-2026-11-08.json`（764 瓶明细，累计 2710 次请求）、`data/.cache/aff-verify-2026-11-08.json`（复核判定）。

---

## 7. 给下一轮的补丁清单（建议，未执行）

二次闸门这套判据属于**入库前**的闸门，正确位置是 `scripts/merge-affiliate-batch.mjs:54-78` 的 `titleMatches()`。收紧它会重判全库 1388 条，必须单独排期并重跑，不能夹在本次交付里做。

| 目标 | 改动 | 依据 |
|---|---|---|
| `scripts/merge-affiliate-batch.mjs:67` `titleMatches()` | 增加「罗列页」判据：挖掉品牌/译名/话术后剩余中文字 > 14 则拒 | 本轮实测拦下 4 条，剩余 15/16/17/19 字 |
| 同上 | 增加「母瓶 / flanker」判据：本瓶是某瓶的 flanker 且译名只覆盖基础名则拒 | `carolina-herrera-good-girl-supreme` |
| 同上 | 增加「下游 flanker」判据：标题完整含某个更长款全名则拒 | `montblanc-explorer`（实为 Explorer Platinum） |
| `scripts/lib/union-api.mjs:85` | `node.result \|\| node.queryResult` 补上 `node.getResult` | 京东 `promotion.common.get` 真实壳结构 |

---

## 8. 未能核实 / 边界

- 淘宝接口的**长期**频率上限未测出精确值。本轮按 350ms 间隔小批跑，2710 次无一次限流报错，但这只说明该速率安全，不说明上限在哪。
- 「210 瓶接口返回 0 条」中可能仍有个别能在**未想到的查询词**下召回（例如昵称、俗称）。本轮 6 层阶梯已是可枚举的合理集合，但没有穷举。
- 京东网页版的 CSV 解析有 17 项测试，但**从未实跑过真实登录态**（`data/.cache/jd-web-config.json` 里 `"dry": true`）。它的可用性属推断，不是实测。
- `74b35cd` 的 13 瓶中，本轮复核了全部 13 条（7 通过 / 6 判死）。复核依据是标题文本 + `perfumes.json` 的款名关系，未做人工点开商品页二次确认。
- **`data/brand-aliases.json` 当前有未提交改动**（92 增 / 62 删，60 → 69 键，新增 `Calvin Klein` / `Chloé` / `Hugo Boss` / `Matière Première` / `Miu Miu` / `Mugler` / `Narciso Rodriguez` / `Ralph Lauren` / `Versace`），文件 mtime 23:28:16。**这不是本轮的写操作** —— 本轮的 `probe-aff-*.mjs` 只读该文件。归属需向 Lead 核实。
- `data/products.candidates.json` 现为 `targets 1388 / accepted 641 / rejected 747`（mtime 23:42，随 `f0fcc8d` 全量重跑更新）。本报告第 3 节的四分类来自 `scripts/probe-aff-causes.mjs` 对 764 瓶阶梯明细的重算，与它的 `rejected` 区分组口径不同，不要混用。
- **641 条 accepted 里 26 条价格 ≤ ¥30**（最低 ¥4 `juliette-has-a-gun-juliette`），是试香/小样/合集。这 26 条**未经任何闸门清理**，本轮也无权动它们；写「641 条全部是正装」是错的。
- 本报告的 641 是 `f0fcc8d` 之后的库内实数，**不是终态**：6 条已判死的错配仍在库内，等用户裁决。
