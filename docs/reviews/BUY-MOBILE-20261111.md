# 结果页购买链接：手机端唤起淘宝 App

日期：2026-11-11 ~ 2026-11-12 · 基线 f57a635 + 95953c8 · 任务 7
Eddie 2026-11-11 23:47 原话口径：**以使用者体验最便捷为基础**

---

## 1. 问题（先量，再说怎么办）

改动前，结果页所有淘宝按钮一律指向联盟转链 `s.click.taobao.com/t?e=…`。
真浏览器实测（`scripts/probe-aff-landing.mjs`，2026-11-12，本机 Edge 131）：

| UA | 最终落地 | 视口 | 价格节点 | 是否登录墙 |
|---|---|---|---|---|
| Windows 桌面 | `login.taobao.com/havanaone/login/login.htm` | 1440 | 0 | 是（桌面登录页） |
| iPhone Safari | `login.m.taobao.com/havanaone/login/login.htm` | 390 | 0 | 是（移动登录页） |

三条真实链接（Creed Aventus / Lattafa Yara / Dior Eau Sauvage）**六次访问，六次全部落在登录页**，两次桌面两次移动，行为完全一致。

**关键发现 1：链接本身是好的，问题只在"从外部浏览器进"。**
同一条链接换成淘宝 App 内置浏览器 UA（`AliApp(TB/10.30.0) WindVane/8.5.0`）：

```
https://h5.m.taobao.com/awp/core/detail.htm?id=777772188824
  &ali_trackid=2:mm_10963225696_3443600437_116343550064:1794413232196_196345895_0
```

→ **直达商品详情页**（`title=商品详情页`，有"加入购物车 / 立即购买"），
**pid 原样带在 `ali_trackid` 里**。也就是说：进 App 就有商品，留网页就被登录墙拦。

**关键发现 2：桌面版兜底页确实是"需要网页登录的桌面版"。**
`uland.taobao.com/sem/tbsearch`（现第①b档用的带 pid 搜索推广页）在 iPhone UA 下
**没有**重定向到移动版：`vw=390` 但仍是桌面版搜索结果页（顶栏"亲，请登录 / 免费注册 /
千牛卖家中心"），45 个价格节点可见、不点登录能看结果。
`s.taobao.com/search` 在同一 UA 下同理，且价格节点 0。

---

## 2. 做法

选 **`tbopen://` scheme 唤起 + 移动版 H5 兜底**。三段式，不改 pid。

```
① 唤起    tbopen://m.taobao.com/tbopen/index.html
              ?action=ali.open.nav&h5Url=<原链接 encodeURIComponent>
② 兜底    https://uland.taobao.com/sem/tbsearch?keyword=<品牌 名称>&pid=<原 pid>
③ 桌面    保持原链接不动（不唤起）
```

### 为什么是 `tbopen://` + `action=ali.open.nav`

淘宝自己 H5 → App 的跳转用的就是这条（`action=ali.open.nav` 表示"由 App 接管并
把 h5Url 当落地页"）。裸 `taobao://` 只在已登录 App 的深链上有意义，没有 action
时 App 打开后可能停在首页 —— 那不是"直达商品页"。

### 为什么 h5Url 传原链接、不重新签发

**pid 不能改**是这一轮的硬约束（佣金归属另有一条核验线）。把原链接整条塞进 h5Url
意味着 pid / `e` 参数 / `union_lens` 全部逐字节保留，App 侧走的就是原来那条转链的
归属路径 —— 实测 App 内 UA 落地时 `ali_trackid=2:mm_10963225696_...` 与原 pid 一致。

### 为什么兜底不用 `s.taobao.com/search`

见 §1 关键发现 2：它在 iPhone UA 下仍是桌面版式、零价格节点。`uland/sem/tbsearch`
是移动版式（390 宽、45 个价格节点、不登录可看）且带 pid，佣金归属与主链一致。
兜底保留商品关键词，否则"唤起失败"会变成"跳到淘宝首页"。

### 为什么唤起失败要靠定时器

`tbopen://` 在没装 App 的设备上是**静默失败**：不报错、不跳转、页面停在原地。
只靠 `href` 的话用户会以为按钮坏了。所以：

- 点击后起 1400ms 定时器，到点仍未离开页面 → 落 `data-fallback`（移动版 uland）
- `pagehide` / `blur` 任一触发 → 说明 App 接手了，撤销兜底跳转
  （不用 `beforeunload`：iOS Safari 切 App 时不保证触发）

### 什么算"手机"

`(pointer: coarse)` **或** 视口 ≤ 620px，命中任一即唤起。两个都判而不是只判 UA：
- 只用 UA：Chrome DevTools 设备模拟、部分安卓平板会漏
- 只用宽度：桌面窗口拖窄时也会唤起，那是打扰
- 所以加了 `pointer: coarse` 兜住"窄但不触屏"的误判

桌面端即使窗口拖窄，`pointer: coarse` 为 false 且宽度判定不满足两者皆真 → 走网页链接。

---

## 3. 验收：三条真实链接 × 移动/桌面 UA

`scripts/probe-buy-mobile.mjs`，2026-11-12 实测。三条都是 `data/affiliate-links.json`
里真实在用的链接（评测点：`creed-aventus` / `lattafa-yara` / `dior-eau-sauvage`）。

| 商品 | 移动 UA（改动前） | 桌面 UA（改动前） | App 内 UA（唤起后） | h5Url 一致性 |
|---|---|---|---|---|
| Creed Aventus | 登录墙 `login.m.taobao.com`，价格 0 | 登录墙 `login.taobao.com`，价格 0 | **商品详情页**，pid 保留 | ✓ 逐字节相同 |
| Lattafa Yara | 登录墙 `login.m.taobao.com`，价格 0 | 登录墙 `login.taobao.com`，价格 0 | **商品详情页**，pid 保留 | ✓ 逐字节相同 |
| Dior Eau Sauvage | 登录墙 `login.m.taobao.com`，价格 0 | 登录墙 `login.taobao.com`，价格 0 | **App 内登录失效页**（判定 `其他`），pid 保留 **false** | ✓ 逐字节相同 |

**三条里 2/3 达标，1 条必须照实说不达标。** 逐条口径以 `scripts/probe-buy-mobile.mjs`
的 `verdict` 字段为准（复跑命令见 §5，原始记录 `_probe/buy-mobile.json`）：

- Creed / Lattafa：`verdict = 商品详情页（App 内）`，`alivePid = true` —— **达标**
  （移动 UA 下唤起 App 后直达商品页，不再落网页登录页）。
- **Dior：`verdict = 其他`，`alivePid = false` —— 不达标。** 原始落地是
  `login.m.taobao.com/havanaone/login/login.htm?...&redirectURL=https%3A%2F%2Fdetail.m.tmall.com%3A443%2Fitem.htm%2F...login_jump...`，
  页面文案「如未登录成功，请退出本页面，打开淘宝-我的淘宝重试」，标题「登录」。
  探针的 `loginWall` 判为 `false`（因为它不是标准登录墙页面结构），但**用户实际看到的仍是一个登录页**。
  这是**天猫商品页在 App 内的一条登录失效重试路径**，不是桌面版登录墙：
  `redirectURL` 指向 `detail.m.tmall.com`（天猫移动详情），用户"退出本页面重进"可走通。
  差异来自链接本身指向**天猫店**（Dior 官方旗舰店）而非淘宝店，**不是唤起格式的问题** ——
  同一条链接在改用 tbopen 前后行为一致，换格式救不了它。

> **为什么不修。** 修它要么改 Dior 那条链接的签发源（越界，且本轮硬约束是"不许改 pid"），
> 要么在天猫店场景下另做一套唤起——那是另一条线。所以本轮照实记 2/3，不把它算成达标。
> 若 Eddie 要求 3/3，需要先决定"天猫店商品是否单独处理"。

同一批链接的按钮渲染（`scripts/probe-result-mobile.mjs`，真跑完 9 屏到结果页）：

| 环境 | 淘宝按钮 href | target | data-web | data-fallback |
|---|---|---|---|---|
| 移动（390×844，iPhone UA） | `tbopen://…action=ali.open.nav&h5Url=…` | `_self` | 原 `s.click` 链接 | `uland…pid=mm_…` |
| 桌面（1440×900，Win UA） | 原 `s.click` 链接 | `_blank` | null | null |

### 兜底定时器的行为验证（不是读属性，是真点）

`probe-result-mobile.mjs` 输出里有 `hasOnclick: false`，**这个读数会误导** ——
`app.js:83` 的 `el()` 对 `on*` 属性走的是 `addEventListener`，不会在元素上留下 `onclick`
DOM 属性，所以 `hasOnclick` 恒为 false，与"有没有绑"无关。

改用行为验证（`_probe/verify-fallback.mjs`）：monkey-patch `setTimeout` 记录注册，
在手机视口下 `dispatchEvent` 点击淘宝按钮，观察定时器与最终 URL。实测：

```
timersRegistered : 1
timerDelays      : [1400]
has1400          : true
urlAfter（1.6s 后）: https://uland.taobao.com/sem/tbsearch?keyword=Maison%20Francis%20Kurkdjian%20Aqua%20Universalis&pid=mm_10963225696_…&q=…
verdict          : 定时器已注册（兜底逻辑生效）
```

**结论：兜底真的会触发、真的会跳到 uland 移动版兜底页。** 这条是行为级证据，
不是"看代码觉得应该有"。

---

## 4. 未核实（必须在回执里带着）

1. **真机唤起未测。** 本机没有 iOS / Android 真机，headless Chromium 不会真的打开 App。
   已确认的是：scheme 格式正确、h5Url 内容正确、App 内 UA 落地正确、兜底可用。
   **真机上系统是否会弹"打开淘宝？"、以及未装 App 时 1400ms 兜底是否够快，需要真机确认。**
2. **pid 归属未变这一点只在 URL 层核实**（`ali_trackid` 与原 pid 相同）。
   报表侧的归因仍需淘宝联盟后台或 API 记录，属于另一条核验线，本轮不做承诺。
3. **1400ms 是经验值**，未在真机上调优；慢机型可能需要更长。

---

## 5. 复跑

```bash
node scripts/probe-buy-mobile.mjs      # 三条真实链接 × 移动/桌面/App 内 UA
node server.js 8099 &
node scripts/probe-result-mobile.mjs   # 真跑流程到结果页，读按钮实际 href
node scripts/probe-aff-landing.mjs     # 落地形态总览（改动前基线）
```
