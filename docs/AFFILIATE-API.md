# 联盟开放平台 API：怎么把「香水名」变成「推广短链」

> 2026-11-03 建立。对应 `docs/DECISIONS.md` D57。
> **一句话**：把「打开后台 → 搜一瓶 → 过验证码 → 复制短链」换成「跑一次脚本」。
> 本文只写**实测过的事实**与**为什么这样写**；没能核实的段落单独标注。

---

## 一、这次推翻的旧结论

`docs/AFFILIATE-SETUP.md` 与 `docs/ANSWER-20261101.md` 里有这么一句：

> 京东给的是每瓶一条独立短链，不是可以套模板的参数化链接。所以「1228 瓶全部自动接上佣金」做不到 —— 只能一瓶一瓶拿链接。

这句话只在**手工路径**下成立。两家的联盟 API 都有**关键词搜索**接口，
能按「品牌 + 香名」召回商品列表，从中取匹配度最高的一条，再调用转链接口。
整条链路不需要打开浏览器，也就不存在验证码。

| 平台 | 搜索接口 | 输入 | 输出 |
|---|---|---|---|
| 京东 | `jd.union.open.goods.query` | `goodsReqDTO.keyword` | `skuId`、`skuName`、`materialUrl`、店铺、价格 |
| 京东 | `jd.union.open.promotion.common.get` | `promotionCodeReq.materialId`（上一步的 skuId） | `data.clickURL`（`u.jd.com` 短链） |
| 淘宝 | `taobao.tbk.dg.material.optional` | `q` 关键词 + `adzone_id` | `result_list.map_data[].click_url`（已是联盟链） |

**京东要两步、淘宝一步** —— 这不是实现差异，是两家的产品设计不同：
淘宝的物料搜索本身就带推广位，返回的 `click_url` 已经归因到你的 PID；
京东的搜索只给商品，转链要单独一次请求。

---

## 二、Scrapling 为什么不是答案（2026-11-03 实测）

被问到「能不能用 Scrapling 过验证码」时的核查结果：

| 事实 | 证据 |
|---|---|
| 阿里妈妈的风控是自研 `baxia`，不是 Cloudflare | `https://pub.alimama.com/` 未登录返回 200 / 1951 字节，正文只有一个 `X`；响应体命中 `baxia` 标记 2 处 |
| Scrapling 的 `solve_cloudflare` 只覆盖 Cloudflare Turnstile / Interstitial | [官方 stealthy 参考](https://github.com/D4Vinci/Scrapling/blob/main/agent-skill/Scrapling-Skill/references/fetching/stealthy.md) 列出的三类挑战全部属于 Cloudflare 系列 |
| 绕过风控的代价落在**你的联盟账号**上 | 联盟后台有「长期无有效推广则清退」类规则；自动化过滑块属违规 |

所以它的能力与这个需求**不相交**。真正该换的是接入方式，不是抓取工具。

（顺带一条判据，写在这里免得以后再遇：`uland.taobao.com/sem/tbsearch` 与
`s.taobao.com/search` 在无 UA 伪装时返回 200 但正文含整页登录壳；
`pub.alimama.com` 只剩 1 个字符 —— 这类"200 但没内容"是登录墙的特征，
不是链接失效，别误判成站点挂了。）

---

## 三、签名：两家的规则与四个坑

两份实现的**唯一可信来源**是官方 SDK 源码，不是博客：

| 平台 | 参考实现 | 关键文件 |
|---|---|---|
| 京东 | [irebit/jingdong_union_go](https://github.com/irebit/jingdong_union_go) | `sign.go`（`GetSign`）、`app.go`（`Request`） |
| 淘宝 | [liuhengloveyou/go-top](https://github.com/liuhengloveyou/go-top) | `top_client.go`（`sign`、`Run`） |

两家的公式**同构**：

```
sign = MD5( secret + Σ(key + value，按 key 字典序排序) + secret )，转大写
```

差异在**哪些参数参与**：

| | 京东 | 淘宝 |
|---|---|---|
| 系统参数 | `method` `app_key` `format=json` `v=1.0` `sign_method=md5` `timestamp` | `method` `app_key` `format=json` `v=2.0` `sign_method=md5` `timestamp` |
| 业务参数 | **整体 JSON 化**塞进 `360buy_param_json` 一个字段 | **平铺**在同一层，与系统参数一起参与签名 |
| 网关 | `https://api.jd.com/routerjson`（POST 表单） | `https://gw.api.taobao.com/router/rest` |

四个必踩的坑：

1. **`360buy_param_json` 这个键名以数字开头**，JS 对象字面量里必须加引号，
   否则直接语法错误。这条踩过一次（`SyntaxError: Invalid or unexpected token`）。
2. **淘宝的空值参数必须提前剔除**。传 `q: ''` 会参与签名，而服务端按"未传"处理，
   于是必然 `invalid signature` —— 报错不告诉你是哪个参数。
3. **timestamp 必须是 GMT+8 的 `yyyy-MM-dd HH:mm:ss`**。UTC 或 ISO8601 一律
   `40001 invalid timestamp`。本项目要在 GitHub Actions 里跑，所以时间戳
   **显式按 UTC+8 计算**（`gmt8Timestamp()`），不依赖运行环境的 `TZ`。
4. **京东的响应键是 `..._responce`（官方拼错）**，而淘宝是 `..._response`，
   且淘宝要去掉开头的 `taobao.` 前缀。两家在这两处都不一致，不能共用一个转换函数。

签名逻辑集中在 `scripts/lib/union-api.mjs`，由 `scripts/test-union-api.mjs`
的 31 项固定向量钉住。**改这个文件必须先让那 31 项全绿**——签名写错不会有
任何提示，只会回一句"签名错误"，而每次错误都真花配额。

---

## 四、匹配：关键词搜到了，凭什么认定是同款

这是整条链路里**唯一需要判断**的环节，也是唯一可能出错的地方。
`scoreMatch()` 的判据写死成两条，都要过：

| 判据 | 阈值 | 理由 |
|---|---|---|
| 品牌命中 | 必须 | 品牌不命中 = 完全不同的东西。英文品牌按**整词**命中（避免 `Dior` 命中 `Diorama`），中文别名按**子串**命中（中文没有空格） |
| 香名覆盖率 | ≥ 0.6 | 品牌对了但香名对不上，是"同品牌别的款"，一样不能用 |

不达标就**跳过这一瓶**，不降级、不猜测。覆盖率低是事实，会如实写进
`coverage` 计数里 —— 这与项目里规则引擎的态度一致：可解释、可复算，
宁可少给一条也不给一条说不清为什么的。

### 中文标题是这个环节的主要障碍

`perfumes.json` 的 `brand` 是英文原拼写（`Creed`、`Acqua di Parma`），
而京东/淘宝的标题以中文为主。所以在匹配前需要一张别名表：
`data/brand-aliases.json`。

**那张表里的中文名由模型凭记忆整理，未经逐条核实（标注：未能核实）。**
处理方式：
- 你确认过的品牌留下，拿不准的**删掉**；
- 删掉的后果只是这瓶被拒，不会错配 —— 这是刻意选的方向。

---

## 五、怎么跑

```bash
# ① 京东：先小批量验证流程（20 瓶，约 10 秒）
JD_UNION_KEY=xxx JD_UNION_SECRET=yyy JD_UNION_PID=zzz \
  node scripts/fetch-products.mjs --jd --limit 20

# ② 看候选表，尤其 rejected 区的 reason
#    data/products.candidates.json

# ③ 并进源表（--dry 先看会写什么）
node scripts/merge-product-candidates.mjs --dry
node scripts/merge-product-candidates.mjs

# ④ 生成公开表（京东这一步会调转链接口，逐瓶 350ms）
JD_UNION_KEY=xxx JD_UNION_SECRET=yyy JD_UNION_PID=zzz \
  node scripts/gen-affiliate-links.mjs --api

# 淘宝单独一条链路（一步到位，搜索即返回联盟链）
TB_APP_KEY=xxx TB_APP_SECRET=yyy TB_ADZONE_ID=123 \
  node scripts/fetch-products.mjs --taobao --limit 20
node scripts/merge-product-candidates.mjs
node scripts/gen-affiliate-links.mjs
```

### 需要的凭证

| 平台 | 变量 | 从哪拿 |
|---|---|---|
| 京东 | `JD_UNION_KEY` / `JD_UNION_SECRET` | [union.jd.com](https://union.jd.com/) → 推广管理 → 我的工具（appKey / secretKey） |
| 京东 | `JD_UNION_PID` | 推广管理 → 推广位管理（**纯数字**那段，不是 `mm_xxx_xxx_xxx` 整串） |
| 京东 | `JD_UNION_SITE_ID` | 同上，推广位页面里的站点 ID（部分账号不需要） |
| 淘宝 | `TB_APP_KEY` / `TB_APP_SECRET` | [open.taobao.com](https://open.taobao.com/) 建应用 → 申请「淘宝客」权限组 |
| 淘宝 | `TB_ADZONE_ID` | 淘宝联盟后台 → 推广位管理（纯数字） |

**凭证只从环境变量读，不写进任何文件。** 这一点三个脚本一致。

### 没有凭证时会发生什么（实测，2026-11-03）

```
$ node scripts/fetch-products.mjs
没有可跑的平台。加 --jd 或 --taobao；两者都要就先配凭证。

$ JD_UNION_KEY=testkey JD_UNION_SECRET=wrongsecret node scripts/fetch-products.mjs --jd --limit 1 --dry
  ✗ jd/ysl-libre 京东错误 21: key=testkey 信息无效（解决方案参考: https://open.jd.com/v2/#/doc/guide?listId=533）

$ TB_APP_KEY=testkey TB_APP_SECRET=wrongsecret TB_ADZONE_ID=123 node scripts/fetch-products.mjs --taobao --limit 1 --dry
  ✗ taobao/ysl-libre 淘宝错误 29: Invalid app Key
```

两句错误都来自两家的真实网关。**但这只能证明请求格式被网关接受并进入了
解析流程，不能证明签名正确** —— 补测（同一分钟、同一网关）把 sign 改成
32 个 0、把 timestamp 改成 2020 年，京东返回的**仍是同一个 `code 21`**，
`en_desc` 一字不差。即京东**先校验 app_key，后校验签名**，key 不合法时
根本走不到验签。

所以结论要分两半写：

| 事项 | 证据强度 |
|---|---|
| 请求格式（POST 表单 + `360buy_param_json` + 系统参数）正确 | **已实测**（网关进入解析流程并给出结构化错误） |
| 签名算法正确 | **只由本地固定向量保证**（32 项测试），网关无法自证 |
| 淘宝 key 错误与签名错误是不同码 | 已实测：`29: Invalid app Key` vs 文档的 `40002 / isv.invalid-signature` |

**另一个实测细节**：京东网关声明 `Content-Type: text/plain;charset=utf-8`，
但 `zh_desc` 里混着 GBK 字节，解出来是乱码。代码里改成优先读 `en_desc`。
这不是我们编码写错 —— 是服务端自己的问题，但你排错时会先怀疑自己，所以写下来。

---

## 六、诚实的边界

| 事项 | 状态 |
|---|---|
| 请求格式与签名算法 | **格式已实测**；**签名正确性只由 32 项本地固定向量保证** |
| 关键词召回能覆盖多少瓶 | **未核实**。取决于中文别名表覆盖率与品牌热度，只有真凭证跑过才知道 |
| 京东 `siteId` 是否必填 | **未核实**。官方 SDK 里 `promotionCodeReq` 含该字段，部分文档说可省 |
| 淘宝「淘宝客」权限组是否需要备案域名 | **未核实**。各家说法不一，建应用时看权限组能不能勾就知道了 |
| 阿里妈妈滑块能否被自动化 | 不做。见第二节 |
| 每瓶都一定匹配得上 | **不会**。长尾品牌（`Ajmal`、`Afnan` 这类）中文标题稀少，覆盖率注定低 |
| `data/brand-aliases.json` 的中文名 | **未核实**（模型整理）。错了只会少一条，不会错一条 |

`coverage` 里那个分母是 1388（香水库总量），分子是真实拿到链接的条数。
**它低不是 bug，是这张表对现实的忠实记录。** 页面在拿不到 `link` 档时
会退回 `search` 档，用户不会看到假承诺。
