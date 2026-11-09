# 淘宝候选图全拒瓶调研报告

- **调研日期**：2026-11-08（当日全部实测，淘宝 CDN 图会变，数字随时间失效）
- **执行席位**：photo-scout（task-1）
- **问题**：637 瓶里有 271 瓶有淘宝候选图，却一张都没进 `data/photos.json`。这些拒收里，哪些是判据过严（可救），哪些是图真不能用？
- **判据来源**：`scripts/build-photos.py`（278 行）与 `scripts/build-photo-set.mjs`（162 行），只读未改
- **复现脚本**：`C:\Users\16256\ego\photo-scout\probe.py`（判据复刻）+ `an1..an45.py`（各类统计与联系表）
- **联系表目录**：`C:\Users\16256\ego\photo-scout\sheet\`
- **本地图库**：941 张候选原图，`C:\Users\16256\ego\photo-scout\img\<瓶id>-<idx>-<kind>.jpg`

---

## 0. 一句话结论

**这不是「判据过严」的问题，是「判据过松 + 候选源不足」两头夹的问题。**
现判据重跑能救回 123 瓶，但其中 19 瓶（15 张带文字/贴纸/水印 + 1 张错商品 + 3 张场景图）根本违反用户的硬要求，严格干净只有 **104 瓶**；剩下 148 瓶里 113 瓶是候选图里压根没有一张纯底图（换源问题），只有 3 瓶卡在 L 判据、32 瓶卡在营销图角标判据——这两个都不该放宽。

| 口径 | 瓶数 | 覆盖率（/637） |
|---|---|---|
| 现状 `photos.json` | 370 | 58.1% |
| 现判据重跑全部放行 | 493 | 77.4% |
| **其中严格干净（可落库）** | **474** | **74.4%** |
| 放宽 `u` 到 0.85 后的干净数 | 478 | 75.0%（**推断**：+6 里 4 张目视干净、2 张不合格） |
| 放宽 `u` 到 0.80 后的干净数 | 481 | 75.5%（**推断**：+9 里只核了 2 张） |

---

## 1. 拒收原因分布

### 1.1 图层面（941 张候选）

| 判据 | 拒收 | 占全部候选 | 判据原文 |
|---|---|---|---|
| `border_not_uniform` | 561 | 59.6% | 四周不是纯色底（`border_uniform < 0.92`） |
| `marketing_sticker` | 93 | 9.9% | 营销图带高饱和贴纸（`hi_sat > 0.08` 且 `kind=='marketing'`） |
| `mid_gray` | 5 | 0.5% | 底色是中间灰（`14 < L* < 88`） |
| 通过（PASS） | 282 | 30.0% | — |

分类别通过率（关键，指向解法）：

| kind | 通过 / 总数 | 通过率 |
|---|---|---|
| `white_image` | 21 / 23 | **91.3%** |
| `small_images` | 244 / 647 | 37.7% |
| `pict_url`（marketing） | 17 / 271 | **6.3%** |

### 1.2 瓶层面（271 瓶）

| 瓶状态 | 瓶数 |
|---|---|
| 至少 1 张候选现在能过 | **123** |
| 只有 `border` 拒 | 115 |
| 只有 `sticker` 拒 | 26 |
| `border` + `sticker` 都拒 | 6 |
| 只有 `mid_gray` 拒 | 1 |

148 个仍失败瓶的**唯一阻塞点**（判断「有 u≥0.92 的候选时，谁在拦」）：

| 阻塞点 | 瓶数 |
|---|---|
| 候选里没有任何一张 `u ≥ 0.92` | **113** |
| 仅被 L 判据拦（`14 < L* < 88`） | **3** |
| 仅被营销图 `hi_sat > 0.08` 拦 | **32** |

### 1.3 每类 3 个实例（均已本地下载目视核对，见 `sheet/fail-cats.png`）

**A 类 `border_not_uniform`**——场景图/九宫格/道具图

| 瓶 id | idx | kind | u | L* | 图 URL |
|---|---|---|---|---|---|
| creed-aventus | 0 | marketing | 0.164 | 57.2 | `https://img.alicdn.com/bao/uploaded/i1/390627247/O1CN01tzKyKd23PBEJsjCm3_!!390627247.jpg` |
| mfk-aqua-universalis | 1 | small | 0.916 | 100.0 | `https://img.alicdn.com/i2/143364067/O1CN01wIBNbB1fujNKJVlsh_!!143364067.png` |
| parfums-de-marly-delina | 0 | marketing | 0.770 | 79.3 | `https://img.alicdn.com/bao/uploaded/i1/263461107/O1CN01WLKLXX1K33QEas4oh_!!263461107.jpg` |

（creed-aventus 是藤编篮子里的 6 支正装；mfk 那张是「Aqua Universalis 规格 70ml + 中文香调说明 + 同晖独家资料 抄袭必究」的图文页；delina 是白砖墙上的 1.5ml 小样。）

**B 类 `marketing_sticker`**——营销图带红色「赠品/正品保证/包税」角标

| 瓶 id | idx | kind | u | hi_sat | 图 URL |
|---|---|---|---|---|---|
| givenchy-linterdit | 0 | marketing | 1.000 | 0.286 | `https://img.alicdn.com/bao/uploaded/i1/O1CN01DpR4EzDj7SF1WPfQ_!!4611686018427384543-2-paimai.png` |
| dior-poison | 0 | marketing | 0.925 | 0.255 | `https://img.alicdn.com/bao/uploaded/i2/4066234693/O1CN01iTvIeyXFIEK1chua_!!4066234693-0-tmg_sticker.jpg` |
| rabanne-fame | 0 | marketing | 1.000 | 0.200 | `https://img.alicdn.com/bao/uploaded/i4/86092971/O1CN01h8S3of1XolimdD0Xi_!!86092971.jpg` |

（givenchy-linterdit 是「阿里资产·自营服务」红标；dior-poison 是「1元抵15元 / 双11品类周 / 包税」多角标叠图；rabanne-fame 是礼盒 + 正装图，被角标带过阈值。dior-poison 整瓶仍算可救——它另有一张干净的 small 候选；givenchy 和 rabanne-fame 没有，整瓶失败。）

**C 类 `mid_gray`**——浅灰/米色/砖墙底的样品图

| 瓶 id | idx | kind | u | L* | 图 URL |
|---|---|---|---|---|---|
| mfk-aqua-universalis | 0 | marketing | 0.936 | 68.2 | `https://img.alicdn.com/bao/uploaded/i1/143364067/TB2MNbisFXXXXaaXXXXXXXXXXXX_!!143364067.jpg` |
| byredo-bal-dafrique | 0 | marketing | 1.000 | 52.8 | `https://img.alicdn.com/bao/uploaded/i2/2763117753/O1CN01JKuTcE278vdvcT0OF_!!2763117753.jpg` |
| parfums-de-marly-delina | 3 | small | 0.927 | 79.7 | `https://img.alicdn.com/i1/263461107/O1CN01oDfdG21K33QpBWcxH_!!263461107.jpg` |

（mfk 那张瓶盖上压着红色 Authentic Universalis 印章水印；byredo 是灰底上的 2ml 小样纸盒；delina 是白砖墙前的 1.5ml 小样 + Haltane 硬盒。）

---

## 2. 逐类判定：可救 / 不可救 / 需换源

| 类别 | 判定 | 依据 |
|---|---|---|
| **A 类 候选里没有一张纯底图（113 瓶，全部落在 border 拒收里）** | **需换源** | 113 瓶的候选构成是 274 张 small + 113 张 marketing + **仅 2 张 white**。这 113 瓶里 35 瓶连最高一张的 u 都 < 0.40，是整屏场景图/九宫格/直播截图，不是「差一点过线」。放宽阈值救不了（见 §3 的天花板）。真正的解法是补白底图：`white_image` 通过率 91.3%，marketing 只有 6.3%。 |
| **B 类 `marketing_sticker`（32 瓶）** | **不可救（按用户硬要求）** | 这 32 瓶全是营销首图带「赠品 / 正品保证 / 包税 / 法国海外仓直发」彩色角标。删除 `hi_sat` 判据能立刻多 32 瓶，但方向与该判据存在的理由完全相反——用户明确要求「营销图价签必须算不可用」，删了就是直接违反。 |
| **C 类 `mid_gray`（3 瓶）** | **不可救** | 3 瓶删 L 判据后能过，但目视全不合格：2ml 小样纸盒（byredo）、盖红印章水印的透明瓶（mfk）、1.5ml 小样 + 硬盒（delina）。见 `sheet/dropL.png`。L 判据拦的正是「浅灰/米色/砖墙底 + 小样/道具」这一类，不该动。 |
| **D 类 现判据放行的 123 瓶** | **部分可救，但判据本身过松** | 123 瓶里 **19 瓶不合格**：15 张带文字/贴纸/水印 + 1 张错商品 + 3 张场景图。严格干净只有 **104 瓶**。问题不在「过严」而在「过松」——详见 §4。 |

---

## 3. 阈值放宽的收益上限（含反事实模拟）

严格保留 L 与 hi 判据，只动 `u` 阈值：

| `u` 阈值 | 累计放行瓶 | 新增 | 覆盖（370+n）/637 |
|---|---|---|---|
| **0.92（现状）** | 123 | — | 77.4% |
| 0.90 | 125 | +2 | 77.7% |
| 0.88 | 126 | +3 | 77.9% |
| **0.85** | **129** | **+6** | 78.3% |
| 0.80 | 132 | +9 | 78.8% |
| 0.75 | 137 | +14 | 79.6% |
| 0.70 | 146 | +23 | 81.0% |

**0.85 档的 +6 瓶已逐张目视**（`sheet/new-at-085.png`，1520×840）：

- 干净可用：afnan-violet-bouquet、armaf-magnificent-jardin、armaf-miss-armaf-dazzling、calvin-klein-defy-toilette（4 张）
- 不可用：issey-miyake-a-drop-dissey（灰底、瓶身裁掉一半）、mfk-aqua-universalis（「Aqua Universalis 规格 70ml + 同晖独家资料 抄袭必究」图文页）（2 张）

→ **净收益 +4 张干净图（+0.6%）**。0.80 以下目视风险更高（新增的 lattafa-oud-mood、mfk-gentle-fluidity-gold、tiziana-terenzi-draco 未逐张核）。

**完全删判据的反事实**：

| 配置 | 放行瓶 | 覆盖 | 净评判 |
|---|---|---|---|
| 现状 | 123 | 77.4% | — |
| 删 L | 126 | 77.9% | +3 瓶全是小样/水印图 → 不划算 |
| 删 hi_sat | 155 | 82.4% | +32 瓶全是角标营销图 → 违反硬要求 |
| 删 L + hi_sat | 158 | 82.9% | 同上 |
| `u`≥0.85 + 删 L | 136 | 79.4% | 混入更多小样图 |
| `u`≥0.85 + 删 L + 删 hi | 175 | 85.6% | 覆盖率最好看，质量最差 |

**`MAX_TRY=5` 不是瓶颈**：271 瓶的候选数分布是 `{1:62, 2:18, 3:40, 4:32, 5:109, 6:10}`。只有 10 瓶有第 6 个候选，且**这 10 瓶全部已经能过**。148 个失败瓶里没有一个候选数 > 5。提高 `MAX_TRY` 救 **0 瓶**。

---

## 4. 反向问题：现判据放行的 123 瓶里，19 瓶不该过

用户的第一原则是「只含香水本身，不含任何贴图、文字、贴纸」。按这条核对，123 个 PASS 瓶里：

| 判定 | 瓶数 |
|---|---|
| 严格干净 | **104** |
| 带文字/贴纸/水印/海报 | 15 |
| 错商品（非香水） | 1 |
| 场景图（无文字但非纯底） | 3 |

### 4.1 16 张违规图逐条（15 张脏图 + 1 张错商品）

| 瓶 id | kind | u | hi_sat | 问题 |
|---|---|---|---|---|
| armani-si-passione | small | 1.000 | 0.042 | 蓝色「正品保证 支持鉴定」横幅 |
| ex-nihilo-lust-in-paradise | small | 0.987 | 0.000 | 「CLASSIFICATION 香水分类」文字表 |
| tom-ford-oud-minerale | small | 1.000 | 0.003 | 小红书笔记截图（中文正文 + App UI） |
| maison-margiela-replica-beach-walk | marketing | 1.000 | 0.033 | 三支礼盒 + 「田田拾趣+沙滩漫步+慵懒周末」中文文案 |
| maison-margiela-beach-walk | small | 1.000 | 0.024 | 「On The Way」Nordstrom 下单页截图 |
| maison-margiela-jazz-club | small | 1.000 | 0.064 | 「REPLICA」海报 + 「爵士酒吧」中文角标 |
| lancome-idole | small | 1.000 | 0.052 | 「法国海外仓直发」角标 + 眼部特写拼图 |
| tom-ford-myrrhe-mystere | small | 1.000 | 0.070 | 「MYRRHE MYSTÈRE 隐秘没药香水」中文海报 |
| kilian-playing-with-the-devil | small | 1.000 | 0.095 | 中文香调表（前调/中调/后调） |
| frederic-malle-eau-de-magnolia | marketing | 1.000 | 0.029 | 「咩香港代购」水印 |
| kilian-musk-oud | marketing | 1.000 | 0.002 | 「阿萍香港代购 只售正品」水印 |
| acqua-di-parma-quercia | marketing | 1.000 | 0.000 | 「帕尔马之水橡木味古龙 EDC」中文品名贴纸 |
| kilian-flower-of-immortality | marketing | 1.000 | 0.038 | 「阿萍香港代购 只售正品」水印 |
| lattafa-dynasty | small | 1.000 | 0.112 | 「法国海外仓直发」角标 |
| kilian-love-dont-be-shy | small | 1.000 | 0.049 | 「香调介绍」中文图文 |
| guerlain-terracotta | white | 1.000 | 0.187 | **错商品**：Terracotta 是娇兰修容粉饼 |

3 张场景图：kilian-sacred-wood（深色木石场景）、armaf-hunter-killer-man（烟雾/粉末）、amouage-guidance-46（花瓣底色）。

### 4.2 机制：为什么两条判据一条都拦不住

1. **16 张违规图全部 `u ≥ 0.98`**（15 张正好 1.000，最差的一张 ex-nihilo-lust-in-paradise 是 0.987）。文字和贴纸都压在纯白底**内部**，四周仍是纯白——「边框纯色」这条在结构上就测不到它们。
2. **`hi_sat` 只覆盖 `kind=='marketing'`**。15 张脏图里 10 张是 `small`，压根不进这道检查（错商品那张是 `white`，同样不进）。
3. **即使是 marketing 的 5 张也漏了**：hi_sat 分别是 0.033 / 0.029 / 0.002 / 0.000 / 0.038，全部低于 0.08 阈值。原因是这道判据测的是**彩色饱和度**，而中文水印、白底黑字品名、详情页截图都是低饱和的——**它拦彩色角标有效，拦文字/水印无效**。
4. 把 `hi_sat` 扩到所有 kind 试过：多抓 4 张违规图（kilian-playing-with-the-devil、lattafa-dynasty、armaf-hunter-killer-man、amouage-guidance-46），但误杀 **41 张干净图**（123 → 78 瓶）。**不值得**。

### 4.3 用现成几何指标能不能补这道？

实测三条都失败：

| 规则 | 抓到违规 | 误杀干净图 |
|---|---|---|
| `dense ≥ 0.045` | 13/16 | 34/107 |
| `dense ≥ 0.050` | 12/16 | 29 |
| `dense ≥ 0.080` | 7/16 | 16 |
| `dense ≥ 0.045` 或 `fill < 0.25` | 14/16 | 35 |
| `red_ratio ≥ 0.03` 或 `yellow_ratio ≥ 0.10` | 7/19 | 36/104 |

违规图与干净图的 `fill` 中位数是 0.57 vs 0.76、`dense` 中位数 0.068 vs 0.032，**分布重叠严重**，单阈值切不开。

**结论：要么引入真 OCR，要么人工过目。** 本机 OCR 现状（已实测）：

```
tesseract / pytesseract / easyocr / paddleocr / cnocr / rapidocr-onnxruntime / onnxruntime  → 全部 import 失败
Windows.Media.Ocr  → AvailableRecognizerLanguages 返回空列表
```

---

## 5. 另一个更重要的发现：真正的瓶颈不是判据

| 事实 | 数字 | 含义 |
|---|---|---|
| 123 个可救瓶里，上一轮 build **manifest 里根本没出现过** | **106 瓶（86%）** | 不是判据拒的，是那一轮 pipeline 没抓到它们（下载失败/小于 1KB 静默跳过，`build-photo-set.mjs:83` 不记原因） |
| 严格干净的 104 瓶里，上一轮没跑过 | **88 瓶** | 同上 |
| 134 个跑过且全拒的瓶里，现在能过 | 17 瓶 | 这部分是 CDN 换图换出来的 |
| 271 瓶里 manifest 完全没出现 | 137 瓶 | — |

**CDN 会换图（已核实）**：同一 URL 连续 4 次请求 md5 完全一致（不是随机出图），但 16:xx build 时抓的 `.bin` 与 23:xx 现在抓的字节、尺寸、内容都不同。典型：`armaf-connoisseur-man` idx0 从 750×750（u=0.131 拒）变成 1000×1000（u=1.000 过）。**上一轮 `.bin` 缓存不能当现在的真值。**

**抓图方式不影响结论（反证已做）**：用官方同款 Node `fetch`（无自定义 UA）抓 65 张对照，判据结论 **65/65 完全一致，0 分歧**（24 张字节相同、41 张字节不同但像素判定不变）。排除「我抓图方式特殊导致失真」。

---

## 6. 建议（按性价比排序，不落地，只给方案）

| # | 建议 | 预估收益 | 成本/风险 |
|---|---|---|---|
| **1** | **重跑 `build-photo-set.mjs` 全量，不做判据改动** | **+104 瓶（58.1% → 74.4%）** | 零风险。`--rebuild` 一次即可，但要先修 `:83` 那个静默跳过——不记原因就永远不知道哪 137 瓶被漏了 |
| **2** | 补齐 `white_image` 候选（`alibaba.wholesale.image.search` 或 `taobao.item.seller.get` 的 white 字段） | 113 个「无纯底图」瓶里绝大多数只能靠它；white 通过率 91.3% | 需外部 API 调用；这 113 瓶每瓶加 1–2 张 white 候选，保守估计能救 30–50 瓶 |
| **3** | 给 PASS 集加一道**人工过目**（或装 `rapidocr-onnxruntime` 加 OCR 门） | 拦掉 19 张违规图，避免贴纸/水印/错商品图进前端 | 123 张人工过目约 20–30 分钟；OCR 需 `pip install rapidocr-onnxruntime`（约 80MB） |
| **4** | 把 `u` 阈值放到 0.85（可选，一次性补数） | +6 瓶，其中 4 张干净 | 必须配人工复检 6 张；0.80 以下不建议 |
| **5** | 修 `build-photo-set.mjs:83`：下载失败/小于 1KB 时把原因写进 manifest | 让「静默掉出候选表」变成可诊断的 | 小改动，但要改已提交文件——需另一个席位做 |
| — | ~~删 L 判据~~ | +3 瓶，全是小样/水印图 | **不建议** |
| — | ~~删 `hi_sat` 判据~~ | +32 瓶，全是角标营销图 | **明确否决**，违反用户硬要求 |
| — | ~~提高 `MAX_TRY`~~ | **0 瓶** | 无意义 |

---

## 7. 目视核对证据（验收④）

抽 20 张实际下载到本地、拼成联系表逐张核对：

**`C:\Users\16256\ego\photo-scout\sheet\sample20-verify.png`**（1800×1616，20 格，每格标 `tag / u / L / hi / kind`）

抽样构成：从 271 瓶里「现判据能放行」的 123 瓶中抽 20 张 —— 判据说通过，我去看图对不对。结果：

| 目视判定 | 张数 | 瓶 id |
|---|---|---|
| CLEAN（干净可用，判据对） | 12 | dior-poison、creed-absolu-aventus、kilian-angels-share-paradis、lattafa-asad、nishane-afrika-olifant、montblanc-legend-spirit、acqua-di-parma-fico-di-amalfi、byredo-la-tulipe、prada-paradoxe-virtual-flower、valentino-uomo-born-in-roma-yellow-dream、narciso-rodriguez-narciso-rouge、creed-aventus-for-her |
| DIRTY（判据放行了脏图） | 6 | armani-si-passione、ex-nihilo-lust-in-paradise、tom-ford-oud-minerale、maison-margiela-replica-beach-walk、lancome-idole、kilian-musk-oud |
| WRONG（判据放行了错商品） | 1 | guerlain-terracotta |
| SCENE（判据放行了场景图） | 1 | kilian-sacred-wood |

**20 张里 8 张判据判错（40%）**。这就是「19/123 不合格」结论的直接来源——是逐张看出来的，不是推断。全量核对的结果在 `sheet/passers-all19.png`（19 个违规瓶的 43 张放行候选全在这里）。

补充证据表：

| 文件 | 尺寸 | 内容 |
|---|---|---|
| `sheet/sample20-verify.png` | 1800×1616 | **20 张抽样核对（验收④主证据）** |
| `sheet/passers-all19.png` | 2100×2380 | 19 个违规瓶的**全部** 43 张放行候选（证明不是「选图选歪了」） |
| `sheet/fail-cats.png` | 1380×1536 | 3 类拒收各 3 个实例 + 原始 URL |
| `sheet/dropL.png` | 1380×988 | 删 L 判据才能过的 3 张（全不合格） |
| `sheet/new-at-085.png` | 1520×840 | `u` 放到 0.85 新增的 6 张（4 干净 / 2 不合格） |
| `sheet/build-vs-now.png` | 3040×406 | 上一轮 `.bin` 与现在同 URL 的逐瓶对比（CDN 换图证据） |
| `sheet/pass-a.png` / `pass-b.png` | 1600×1776 | 123 个 PASS 瓶全量 |
| `sheet/near-a.png` | 1600×1776 | 65 个「差一点」瓶，按 u 降序 |

---

## 8. 未核实项

| 项 | 状态 | 核实方法 |
|---|---|---|
| 本机装 OCR 后的实际拦截率 | **未能核实** | 需先 `pip install rapidocr-onnxruntime`，再对 123 张跑一遍，人工标 20 张算 precision/recall |
| 补 `white_image` 候选的真实可获量 | **推断** | 保守估计 30–50 瓶，需实测 API 能返回多少白底图 |
| 淘宝 CDN 换图的周期 | **未能核实** | 只测了 7 小时窗口（16:xx vs 23:xx）。什么时候换、换几次，需定时采样 |
| `u` 放到 0.80 的 3 张新图质量 | **未逐张核** | 已在 §3 标出，做之前需目视 |
| 137 瓶「上一轮没抓到」的具体失败原因 | **未能核实** | manifest 不记失败原因，只能复现时加日志 |

---

## 9. 与任务书不一致的地方

| 任务书写 | 本次实测 | 说明 |
|---|---|---|
| 258 瓶 | **271 瓶** | 分母从 624 变 637 后重算：637 − 370 = 271。其中 13 瓶是另一条线救回的新链 |
| 「全部被 build-photos.py 拒收」 | **134 瓶被拒收，137 瓶上一轮没跑到** | 137 瓶的候选图根本没进过判据，不能算「被拒」 |
