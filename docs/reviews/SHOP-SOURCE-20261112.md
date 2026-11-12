# 任务8：天猫换源 + 全库顺查 + 两处文案

> 日期 2026-11-12 · 基线 `19ceb67` · 派单：Eddie 2026-11-12 批准 Muse 方案
> **结论先行：B（两处文案）与 C（README/index 文案一致）已完成；A1/A2（换源）在本机不可执行 ——
> 淘宝客应用无商品级 API 权限，无法生成新链接。A3（保留 + 提示）已实现并验证。**

---

## 0. 先纠一处派单口径（影响 A2 的范围）

派单说「全库 59 瓶链接逐条过」。实测：

| 口径 | 实际数 | 依据 |
|---|---|---|
| 全库**淘宝链接条数** | **661** | `Object.keys(data/affiliate-links.json.taobao).length` |
| **59** 是什么 | 12 画像金标准的 gold **引用**数 | `PORTRAITS.flatMap(x => x.gold).length` |
| 59 去重后 | **36 瓶** | `new Set(...)` |
| 36 瓶里有淘宝链接的 | **27 瓶**（9 瓶无链接） | 逐条查 `taobao[id]` |

所以「59 瓶」实为 gold 瓶数，不是全库。本单按 **36 瓶去重**做实测审计（全库 661 条需 20+ 分钟，
且见 §2 A1/A2 已阻断，跑满也换不了源）。

---

## 1. A 部分：换源为什么做不了（这是本单最重要的结论）

### 1.1 联盟短链不含店铺信息，前端无法判断

`data/affiliate-links.source.json` 的 661 条是 **`s.click.taobao.com/t?e=…`**（加密串）。
- 短链不带店铺域名、不带 `num_iid`，**无法离线反解**「这是淘宝店还是天猫店」；
- `fetch` 该短链得到的不是 302，而是 200 + JS 跳转（实测 `location` 头为空），抓不到落地。

### 1.2 唯一能判店铺的办法：App 内 UA 打开

外部浏览器 UA（桌面 / iPhone Safari）一律落登录墙，**看不到商品页**。
只有淘宝 App 内置浏览器 UA（`AliApp(TB/10.30.0) WindVane/8.5.0`）能到商品层：

| 落地 | 判定 |
|---|---|
| `h5.m.taobao.com/awp/core/detail.htm?id=…` | 淘宝店 |
| `login.m.taobao.com/...redirectURL=https%3A%2F%2Fdetail.m.tmall.com…` | **天猫店**（登录失效重试页，`redirectURL` 暴露 tmall 域名） |

探针：`_probe/audit-shop-type.mjs`。**36 瓶实测结果：淘宝 16 · 天猫 11 · 无链接 9。**

### 1.3 生成新链接（换源的前提）—— **无权限，硬阻断**

换源必须拿到「指向淘宝店的同款商品」的联盟推广链接。这条路只有淘宝客 API 能走。
实测四个接口全部被拒：

```
taobao.tbk.dg.material.optional    => 11 isv.permission-api-package-limit
taobao.tbk.dg.optimus.material     => 11 isv.permission-api-package-limit
taobao.tbk.item.convert            => 11 isv.permission-api-package-limit
taobao.tbk.dg.newuser.order.get    => 11 isv.permission-api-package-limit
taobao.tbk.shop.get                => 40（参数错，说明该应用连这个也没开）
```

原始响应（`_probe/tbk-probe-raw.json`）：

```json
{"error_response":{"code":11,"msg":"Insufficient isv permissions",
 "sub_code":"isv.permission-api-package-limit",
 "sub_msg":"scope ids is 381 11680 11687 11741 11773 16516 27939"}}
```

**含义**：`.env.local` 里的 `TB_APP_KEY/TB_APP_SECRET/TB_ADZONE_ID` 是**有效凭据**
（签名通过、不再报 `Missing method`/`invalid signature`），但该应用**未获得淘宝客推广 API 权限包**。

> 这不是「代码没写对」：同一套 `buildTaobaoParams`/`taobaoSign` 在京东侧可用，
> 淘宝侧是应用侧权限问题，**必须由账号主在淘宝联盟后台申请权限包**，本地无法绕过。
> 更不能用别的接口「凑」一个链接 —— 那会破坏 pid 归属（本轮硬约束是不改 pid）。

### 1.4 因此 A1/A2 的处理

| 派单条目 | 状态 | 处理 |
|---|---|---|
| A1 Dior 换源 | **未执行** | 无法生成淘宝店新链接（§1.3）。改走 A3：保留原链接 + 提示 |
| A2 全库/59 瓶换源 | **未执行** | 同上。但**审计已完成**（36 瓶逐条判出店铺类型，见 §1.2） |
| A3 未换成的保留+提示 | **已实现** | 见 §3 |
| A4 换源后复测 | **不适用** | 无换源 ⇒ 无新增复测对象；但见 §4 对现存链接的复测 |

**给 Eddie 的一句话**：要么让账号主去淘宝联盟申请「淘宝客-推广者-商品查询」权限包
（`taobao.tbk.item.*` 一组），要么接受「天猫店的瓶保留链接 + 提示」这个现状。
**在权限拿到之前，A1/A2 谁来都做不了**，不是执行方能力问题。

---

## 2. A 部分实际完成的东西：天猫店铺审计

`_probe/audit-shop-type.mjs` 逐瓶判定，原始记录 `_probe/audit-shop-type.json`。

### 2.1 结果（36 瓶 gold 去重）

| 类型 | 数量 | 瓶 id |
|---|---|---|
| **天猫店** | **11** | creed-green-irish-tweed、jo-malone-wood-sage-and-sea-salt、byredo-gypsy-water、byredo-blanche、mfk-grand-soir、maison-margiela-replica-by-the-fireplace、maison-margiela-replica-lazy-sunday-morning、versace-pour-homme、lancome-idole、kenzo-kenzo-homme、ysl-libre |
| 淘宝店 | 16 | （见 json） |
| 无淘宝链接 | 9 | （见 json） |

### 2.2 落成数据文件

`data/tmall-shops.json` —— 只存 `tmallIds` 数组 + 判定方法说明（`_method`）。
**它是可选增强**：文件缺失/格式错时前端退化成空集，页面行为与没有这个功能时一致。

---

## 3. A3：天猫店提示（已实现）

### 3.1 实现

- `app.js`：新增 `TMALL_IDS` + `ensureTmallShops()`（与 `ensureAffLinks()` 并行取，
  互不阻塞；失败即空集）。
- 结果页每张卡：若该瓶 id 在 `TMALL_IDS` 里**且**这张卡确实有淘宝按钮，
  在按钮组下方渲染一句：

```
此款在天猫店，点开后请在天猫内搜索
```

- 样式复用 `.link-note`（事实说明专用类，12px / `--ink-3` / 6.19:1），
  与「这些是搜索结果」「两个入口都会打开淘宝搜索结果」两处提示同一套观感。
- 加了 `data-note="tmall-shop"` 便于 DOM 层单独判定。

### 3.2 为什么只对这类瓶显示

淘宝店的链接点开直达商品页，给它加这句是**误导**。
天猫店在 App 内走的是登录失效重试页（「如未登录成功，请退出本页面，打开淘宝-我的淘宝重试」），
不提示用户会以为按钮坏了 —— 这正是任务7 里 Dior 那条的实测现象。

### 3.3 验证（`_probe/verify-tmall-note.mjs`，14 轮随机答案凑出 36 张卡）

```
卡片样本数: 36
可判定:     36    对: 36    错: 0
其中带天猫提示的: 5 张（ysl-libre ×3、jo-malone-wood-sage-and-sea-salt ×2）
```

**36/36 全对**：该显示的显示、不该显示的不显示、文案逐字一致。

---

## 4. A4：手机端唤起复测

换源没做，但**对现存链接的唤起行为做了复测**，确认任务7 的实现没被本轮改动破坏。
抽测 **5 条**（满足派单「不少于 5 条」）：

| 瓶 | App 内 UA 落地 | 属天猫清单？ | 结论 |
|---|---|---|---|
| creed-aventus | 商品详情页，pid 保留 | 否 | ✅ 唤起路径正常 |
| lattafa-yara | 商品详情页，pid 保留 | 否 | ✅ |
| dior-eau-sauvage | 登录失效重试页 | **是** | ⚠️ 天猫店，**已由 A3 提示覆盖** |
| ysl-libre | 登录失效重试页 | **是** | ⚠️ 同上 |
| byredo-gypsy-water | 登录失效重试页 | **是** | ⚠️ 同上 |

**一个自洽性证据**：`inApp=其他` 的 3 条，**恰好全部**在 `data/tmall-shops.json` 的
11 个天猫 id 里；`商品详情页` 的 2 条都不在。两套独立方法（App UA 落地判定 vs API 审计）
得到一致结果 —— 说明 §2 的天猫清单可信。

**桌面端可达性**：5 条的 desktop 分支均返回登录墙（`login.taobao.com`，价格节点 0）——
这是改动前就有的既有行为（任务7 文档已记），本轮未改变它；桌面端按钮仍是原
`s.click` 链接、`target=_blank`、可达。

---

## 5. B 部分：两处文案（已落地）

### 5.1 改动（`app.js`）

| 屏 | 改前 | 改后 | 行号 |
|---|---|---|---|
| 场合（`id: 'occasion'`） | `主战场决定浓度下限。选一个最像的，拿不准就选日常` | `你最常在什么场合用，决定了推荐的浓淡。选一个最像的，拿不准就选日常` | `app.js:173` |
| 浓淡（`id: 'concentration'`） | `先说体感（想让人闻到多重的分量），再说香精占比（决定留多久）。两项都不选也能出结果` | `先说体感（想让人闻到多重的分量），再说浓度类型（决定留香多久）。两项都不选也能出结果` | `app.js:205` |

### 5.2 其余 7 处文案：零改动

香型、想要的味道、受不了的味道、气质、季节、整族排除、已知款 —— 全部原样。
用 `help: '…'` 抠出来逐条比对确认（见 `scripts/test-render.mjs` 的两条新断言只针对这两处）。

### 5.3 有一处刻意没改

`app.js` 第 2865 / 2891 行还有「香精占比」字样，那是**页面内的释义文字**
（「浓度是香精占比，比例越高留得越久…」）—— 它正是用来**解释**这个词的，
不是黑话本身。改掉会让解释失去锚点。派单要求改的是 `help` 文案，故不动。

### 5.4 防回归断言（含负向验证）

`scripts/test-render.mjs` 新增 2 条，**读 `help:` 字面量**而不是整份源码 ——
代码注释里会合法引用旧文案（「原文是『主战场…』」），对整份源码查旧词会把
解释性注释判成回退（假红，第一版就踩了）。

负向验证：把场合屏改回「主战场决定浓度下限」→ `PASS 309 FAIL 1`；还原 → `PASS 310 FAIL 0`。

---

## 6. C 部分：README / index.html 文案与现行问卷对齐（已完成）

### 6.1 先数清实际屏数

| 口径 | 数 | 依据 |
|---|---|---|
| `STEPS` 数组条目 | **9** | `app.js` 的 `const STEPS = [...]`，逐项 `id` 为 family/likedNotes/dislikedNotes/mood/occasion/season/concentration/dislikedFamilies/anchor |
| **家族入口实际屏数** | **8** | `scripts/test-render.mjs:856` 断言 `/共 8 步/`；家族入口没有「整族排除」 |
| **情绪入口实际屏数** | **9** | `scripts/test-render.mjs:1916` 断言 `第 9 步 / 共 9 步` |
| UI 可选香调 chip | **58** | `src/notes.js` `usableEntries()` → 58 of 60 |

### 6.2 改前 / 改后

| 文件 | 位置 | 改前 | 改后 |
|---|---|---|---|
| `README.md` | 第 3 行 | 用**四个问题**，从…走到具体某瓶香水的名字 | 用一次问卷（**家族入口 8 屏 / 情绪入口 9 屏**），从…走到… |
| `README.md` | 步表格（第 31–38 行） | 4 行旧流程（香调写「**55 个**」、顺序为 感觉→场合→浓淡→香调） | 8 行现行流程（香型→想要→受不了→气质→场合→季节→浓淡→已知款，**58 个**可选香调）+ 一行屏数注 |
| `index.html` | `<meta name="description">` | 回答**四个问题**，得到三个… | 答完一次问卷（**8 屏**），从 **1388 瓶**库里得到三个… |

### 6.3 依据的实测数

- 屏数 8/9：`test-render.mjs` 的两条断言（上表）；
- 58 个 chip：`usableEntries()` 实测；
- 1388 瓶：`data/perfumes.json` `perfumes.length` + `meta.count`。

### 6.4 只改文案的边界

未动 `STEPS` 结构、未动任何分支逻辑、未动样式。
`README` 第 187/292 行还有「自动点完四步」字样 —— 那指**核查脚本的点击轮次**，
不是问卷屏数，按「只改与问卷屏数相关的文案」边界不动。

---

## 7. 验收

| 项 | 结果 |
|---|---|
| `test-render` | **310**（+2 文案断言），FAIL 0 |
| `test-contrast` | 43，FAIL 0 |
| `test-scoring` / `compliance` / `union-api` / `category-gate` / `jd-web` | 153 / 10 / 76 / 10 / 17，全绿 |
| `GOLD` | **2/12 · 4/12**（无回退） |
| `GOLD-NOTES` | 0/8 · 1/8（无回退） |
| `build-css --check` | 一致（237992 字节 / 7945 行） |
| 天猫提示 | 36/36 判定正确（§3.3） |
| 两处文案负向验证 | 改回旧文案 → FAIL 1；还原 → 全绿 |
| `src/` 生产代码 | **零改动**（只动 `app.js` 的文案与提示、`README.md`、`index.html`） |

---

## 8. 复跑

```bash
node _probe/tbk-methods.mjs        # 证 API 权限（四个接口全 isv.permission-api-package-limit）
node _probe/audit-shop-type.mjs    # 36 瓶逐条判淘宝/天猫
node server.js 8099 &
node _probe/verify-tmall-note.mjs  # 天猫提示 36/36
node scripts/test-render.mjs       # 310 项（含 2 条文案断言）
```
