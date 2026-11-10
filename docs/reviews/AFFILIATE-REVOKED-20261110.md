# 淘宝佣金链接撤除留痕（2026-11-10）

依据 Eddie 2026-11-10 决策（见共享大脑 `DECISIONS.md`），把第二道筛查判定错配的淘宝链接从 `data/affiliate-links.json` 撤除，并把每条的瓶名与原始链接留在这里备查。

**数量与 Muse 派单的差异**：派单说「6 条」，实测是 **7 条**。`montblanc-explorer` 是第 7 条 —— 它在二次闸门里同样被判 `ambiguous`，且在提交 `463d01e`（品牌池反查法 661→668）时被一起写回了表。只删 6 条的话，`montblanc-explorer` 会继续把「Explorer PLATINUM」的商品当成 Explorer 挂在页面上，所以按 7 条处理。删完 `taobao` 从 **668 → 661**。

判定来源：`data/.cache/aff-verify-2026-11-08.json` 的 `rows`（该轮 tally：`cn-alias:8 / ambiguous:7 / fail:10 / latin-all:2`）。这 7 条的 `verdict` 全部是 `ambiguous`。白名单同时写在 `scripts/probe-aff-converge.mjs` 的 `REVOKED` 数组里。

## 撤除清单

### 1. `montale-intense-cafe` — Montale / Intense Cafe（eau-de-parfum）

标题：`montale香水蒙塔莱贪吃巧克力玫瑰暗夜沉香饱满茉莉情迷咖啡试香`

判死理由：译名命中，但标题挖掉品牌/译名/话术后还剩 **15 个中文字** —— 单品页解释不了这么多，判为罗列页（一个链接里塞了整条产品线）。

```
https://s.click.taobao.com/t?e=m%3D2%26s%3D15m%2Bo7KMxqNw4vFB6t2Z2ueEDrYVVa64juWlisr3dOdyINtkUhsv0CU3dm0cuYkMTlizbGXrYGykRjwf6gHH4uGaewGd3THxT0mrdgnOtqCoUs3A3Uoirp4WbpLD9w9sbU6PpfwCeuROYgWQLBRPVQAEJ%2BvBYqXFTXF8YGa5FnCBFtNlHKT363vBJOb600YltOJpTnm7foaHwQcXh%2FpUXr%2BdJFScP09AgzYi0ZB6fwZcdU%2BVDG3JsoqAJ4MtbTVfG4ZpBYKEb1XNYwgfVzCoeMYMXU3NNCg%2F&union_lens=lensId%3AMAPI%401794234899%400b51e3fb_144d_1a1c0bbdbea_e98b%4001%40eyJmbG9vcklkIjo4MDMwOX0ie
```

### 2. `maison-margiela-replica-beach-walk` — Maison Margiela Fragrances / Replica Beach Walk（eau-de-toilette）

标题：`梅森马吉拉香水慵懒周末10ml*3沙滩漫步田园拾取旅行套盒男女款`

判死理由：本瓶是 flanker（母瓶 Beach Walk），译名「沙滩漫步」只覆盖基础名，不含本瓶独有词 beach / walk；而且这是**套盒**（10ml×3）。

```
https://s.click.taobao.com/t?e=m%3D2%26s%3DCSCVpNeFGPFw4vFB6t2Z2ueEDrYVVa64juWlisr3dOdyINtkUhsv0CU3dm0cuYkMrpXSalKzZLykRjwf6gHH4uGaewGd3THxT0mrdgnOtqCoUs3A3Uoirp4WbpLD9w9sbU6PpfwCeuROYgWQLBRPVSEe9CRCykJTz%2B5C5pG5CjYpaoEzcoKDZX0f%2Frpf9RxaC13Gpx48fGB%2B2c4nNka8ew61WuT8Y%2F3VU9laC2K77QvJZz39pu1APtbsAS%2FzcQeEgG5y7JCNOej0f%2BXTTf1ZOD2l4PysJx%2FP&union_lens=lensId%3AMAPI%401794234900%402104ed3b_1508_1a1c0bbe036_2ee0%4001%40eyJmbG9vcklkIjo4MDMwOX0ie
```

### 3. `frederic-malle-rose-and-cuir` — Frédéric Malle / Rose & Cuir（eau-de-parfum）

标题：`馥马尔 FM香水 一轮玫瑰贵妇肖像非凡香根草狂野麝香革调玫瑰`

判死理由：译名命中，但标题挖掉品牌/译名/话术后还剩 **17 个中文字** —— 罗列页。

```
https://s.click.taobao.com/t?e=m%3D2%26s%3DV3CpAt%2Fet3Nw4vFB6t2Z2ueEDrYVVa64juWlisr3dOdyINtkUhsv0CU3dm0cuYkM23mv%2Bhrn0YKkRjwf6gHH4uGaewGd3THxT0mrdgnOtqCoUs3A3Uoirp4WbpLD9w9sbU6PpfwCeuROYgWQLBRPVaVW5Q1VrvBuNsWZUGdIbKknIQAUiCxuk9WrlxXdZrBaRLp6RTVrUpD8d0i53WJ0rlfOvkZX8SQRaM%2BWy3hlKOAf7EukSeIvKkhUHpunvidOBStUPjn47zyKsX40mX9fIcYl7w3%2FA2kb&union_lens=lensId%3AMAPI%401794234901%402107e733_13fd_1a1c0bbe31d_5c8d%4001%40eyJmbG9vcklkIjo4MDMwOX0ie
```

### 4. `etat-libre-dorange-fat-electrician` — Etat Libre d'Orange / Fat Electrician

标题：`解放橘郡你或像你的人赫曼如影危险同谋龙与玫瑰胖电工中性浓香水`

判死理由：译名命中，但标题挖掉品牌/译名/话术后还剩 **19 个中文字** —— 罗列页。

```
https://s.click.taobao.com/t?e=m%3D2%26s%3DHtwPxON2DBhw4vFB6t2Z2ueEDrYVVa64Dne87AjQPk9yINtkUhsv0CU3dm0cuYkMrxXXzX96Xo%2BkRjwf6gHH4uGaewGd3THxT0mrdgnOtqCoUs3A3Uoirp4WbpLD9w9sbU6PpfwCeuROYgWQLBRPVSk8%2BmrhLUDCaKOO%2BmAlQI89B4xXEGTfTarW4nxdRVom5WiUwf2zT3wvLYAKHXYPkkCtIY4tSdx8BvMETjn2E1i6BkhJ38vLihQyuybSY6S9q7iz4tAL%2BIAAzgqfpMMC%2Bnb4BtdRMpgw&union_lens=lensId%3AMAPI%401794234902%400b0847a5_153c_1a1c0bbe72c_1ed6%4001%40eyJmbG9vcklkIjo4MDMwOX0ie
```

### 5. `ex-nihilo-lust-in-paradise` — Ex Nihilo / Lust in Paradise（eau-de-parfum）

标题：`Ex Nihilo香水无中生有圣檀之召花之迷醉欲望天堂蓝色庇护试香`

判死理由：译名命中，但标题挖掉品牌/译名/话术后还剩 **16 个中文字** —— 罗列页。

```
https://s.click.taobao.com/t?e=m%3D2%26s%3DbWCW1ZUb8IZw4vFB6t2Z2ueEDrYVVa64juWlisr3dOdyINtkUhsv0CU3dm0cuYkMrxXXzX96Xo%2BkRjwf6gHH4uGaewGd3THxT0mrdgnOtqCoUs3A3Uoirp4WbpLD9w9sbU6PpfwCeuROYgWQLBRPVcn8Qv1dFKi4kgUkP73mqwYkwOXV5bSgWhnaDm0ExkhUbqLD1upXX%2FiNJgp9cQz4LlXvwLNtQ%2FjzF3821NHcDdJhfj%2F6Abr0BSCQPHN%2BXHi%2FBStUPjn47zyKsX40mX9fIcYl7w3%2FA2kb&union_lens=lensId%3AMAPI%401794234902%402107eb24_1446_1a1c0bbe893_5ec6%4001%40eyJmbG9vcklkIjo4MDMwOX0ie
```

### 6. `carolina-herrera-good-girl-supreme` — Carolina Herrera / Good Girl Supreme（eau-de-parfum）

标题：`香港直邮Carolina Herrera 卡罗琳娜埃莱拉 好女孩粉色高跟正品`

判死理由：本瓶是 flanker（母瓶 Good Girl），译名「好女孩」不含本瓶独有词 supreme。

```
https://s.click.taobao.com/t?e=m%3D2%26s%3D3VKjcLYgcVZw4vFB6t2Z2ueEDrYVVa64Dne87AjQPk9yINtkUhsv0CU3dm0cuYkMhz6M2VAQ5P2kRjwf6gHH4uGaewGd3THxT0mrdgnOtqCoUs3A3Uoirp4WbpLD9w9sbU6PpfwCeuROYgWQLBRPVYUrSLA3U2bNTMZEyvkDwY5jrlKfc0zikeX7PmV7eESoUAazkdsftNnpXXF%2FdT%2FsMqXMqc%2F9FV5Rc%2BdiPtMCialja7r9rJOrf6COVROwWwAOm7Qq2vjWSFYf5W4j%2FyHVESuxFpKfmfnMomfkDJRs%2BhU%3D&union_lens=lensId%3AMAPI%401794234905%402107ef1e_1510_1a1c0bbf262_660e%4001%40eyJmbG9vcklkIjo4MDMwOX0ie
```

### 7. `montblanc-explorer` — Montblanc / Explorer（eau-de-parfum）〔派单之外的第 7 条〕

标题：`美国直邮M MONT BLANC EXPLORER PLATINUM 6.7OZ EDP万宝龙正品`

判死理由：标题完整包含更长款的全名 `montblanc-explorer-platinum`（Explorer Platinum）—— 买到记成 Explorer 就是错瓶。

```
https://s.click.taobao.com/t?e=m%3D2%26s%3DfTjEGPf8SSNw4vFB6t2Z2ueEDrYVVa64Dne87AjQPk9yINtkUhsv0M7IVQhduZelmOBYHCj3evCkRjwf6gHH4uGaewGd3THxT0mrdgnOtqCoUs3A3Uoirp4WbpLD9w9sbU6PpfwCeuROYgWQLBRPVfY%2FG7ZsxSbX42idEqlJStRJEyKRric4VN2NIODj%2FlWfhnhXWxBrYLjptvTGdFcY%2BKtyYuvO3PxU2CanZ1NckKzOfXWNCt8QyXpu17UTdLUq5u10U26kBG30f%2BXTTf1ZOD2l4PysJx%2FP&union_lens=lensId%3AMAPI%401794151628%40213f0b4e_14ab_1a1bbc53dab_7510%4001%40eyJmbG9vcklkIjo4MDMwOX0ie
```

## 撤除后这些瓶的表现

这 7 瓶从「有直达链」变成「无直达链」。页面逻辑不变：`platformLinks()` 找不到直达链就走两条淘宝搜索渠道（`official` / `market`），即站内搜索兜底 —— 用户仍能从卡片点到淘宝搜这一款，只是不再是「买这一瓶」的直达入口，也不再带 `rel="sponsored"`（搜索页无佣金关系，本来就不标）。

## 复跑

```powershell
cd scent-picker
node scripts/probe-aff-converge.mjs --dry    # 只报告，确认 7 条确实在表里
node scripts/probe-aff-converge.mjs --write  # 真删（source 表 + 公开表）
```

注意该脚本只处理 `data/affiliate-links.source.json`（被 `.gitignore:66` 忽略的中间产物）。本轮改的是公开产物 `data/affiliate-links.json`，删完要跑 `node scripts/gen-affiliate-links.mjs` 保持一致，否则下次重新生成会把删掉的链接写回来。
