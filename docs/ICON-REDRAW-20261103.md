# 24 枚图标全量重绘与移植记录 · 2026-11-03

## 一、本次整改点（用户逐条指出的）

| # | 指出的问题 | 整改内容 |
|---|---|---|
| 1 | 茶香叶片与叶柄颜色不统一 | 叶柄 `#86AE4C`（偏黄浅一档）→ `#5F8C30`，与叶片同色系；叶柄根部内收 0.30 藏进主茎，不留端帽 |
| 2 | 茶香视觉重心偏上 | 下两片叶加宽加长（`1.78/1.74`，叶尖下探到 y 12.15/10.80）、顶叶收窄上移；主茎顶端 12.40→12.60、底端 20.42→20.10，缩短裸茎。质心 cy 11.67 → **12.90** |
| 3 | 檀木、木质"太细长"，且两者未区分 | 形态加粗（R 3.30→3.92 / 3.36→3.98），语义彻底分开：檀木＝去皮心材（浅暖 `#FBE9C6→#B98648`、8 主 6 次顺直细纹、深色心材芯断面）；木质＝带树皮原木（深褐 `#8A6234→#28180A`、5 主 4 次树皮沟 + 横向碎裂、浅色新断面 + 树皮环） |
| 4 | 檀木、木质轮廓线太粗 | 主轮廓描边 0.92 → **0.56/0.58**（生成器直接写低值，不靠 autofit 归一） |
| 5 | 檀木、木质纹理"乱"、轮廓粗糙 | 纹理改为 `groove()` 填充形状：半宽＝画布绝对单位 ÷ 当地半径（否则透视端压成楔形＝爪痕）、两端 taper 收口、条数等距化只靠粗细浓淡分主次 |
| 6 | 苦橙叶叶柄太长 | 果柄 3.25 → 1.55 单位并带微弯；随后整枚按用户要求**只留叶子**，去掉柑橘果 |
| 7 | 树脂纹理是错的 | 回退 v8 轮廓，只改纹理：3 条同心层理弧（读成 wifi）→ 1 条；3 个"暗窝+亮弧"凹坑（读成眼睛）→ 平的暗窝；左上大白椭圆斑（塑料反光）删除；新增 3 条内部流纹 |
| 8 | 乌木纹理是错的 | 回退 v8 的 13 点轮廓，只改纹理：横向三段折线（读成箭羽）→ 5 条不等距不等长连续微弧；3 个结孔 → 2 个更小更淡（去掉亮弧内环）；切缝 0.44 op0.90 → 0.30 op0.72 |
| 9 | 香根草不够细、根部不美观 | 采用**斜放捆扎草束**（9 茎 + 两道皮带 + 斜向绞纹，捆绳角度由束轴算出 `-39.8°`），去掉须根；`safety.py` 归一 k=0.999 → bbox [4.92,3.60,19.08,20.40]，14256 B。用户 m06026 已确认 |

## 二、全 24 枚的自检与收口（未大改风格/布局/结构）

仅做"线条走向与纹路细节"的轻微优化，三项硬指标统一：

1. **安全框**：`safety.py` 统一收进 3.40–20.60（原规格 3.3–20.7 更宽松，实际按内缩后的保守框收）。
   收敛 k 值：`citrus-floral 0.786`、`fougere 0.884`、`fruity-floral 0.963`、`green-floral 0.98`、`powdery-floral 0.986`、`soliflore 0.992`，其余 18 枚 k=1.000 本就合规。
   **渲染实测 bad = []**（24/24 通过）。
2. **描边**：`tidy24.py` 把 `stroke-width > 1.0` 一律夹到 1.0（修掉 fougere 1.2445 / fruity-floral 1.0905 / citrus-floral 1.1196 / green-floral 1.0206）。
3. **体积**：24 枚全部 ≤30 KB（最大 `floral-green-floral` 28.7、`woody-sandalwood` 24.7、`floral-fruity-floral` 23.6、`white-floral-a` 23.1、`woody-woody` 18.7）。`green-floral` 由 40.2 KB 降精度到 1 位小数后 **28.7 KB**。
   合计 281.3 KB / gzip 79.3 KB。

坐标统一 2 位小数、transform 3 位小数，未改任何图形结构。

## 三、移植范围与结果

| 对象 | 动作 | 结果 |
|---|---|---|
| `icon-specimen/svg/*.svg` | 24 枚全量覆盖（沿用旧文件名，`ART_FILE` 映射不变） | 24/24 写入，XML 全部可解析，渐变色与 `url(#)` 无悬空引用 |
| `shots/icons-24-overview.html` / `.png` | 覆盖为最终版（标题去掉版本后缀、副标题改成本轮说明） | 581 KB / 479260 B，48 张卡（64px + 36px 两段）24 个 key 全覆盖 |
| `app-art.js` / `app.js` | 两版都改用彩色通路；线稿整块删除（2026-11-08 第二轮，见第七节） | `SUB_MARKS`/`SUB_FIT`/`PLATE_MOTIFS` 已不存在；盘心同步写彩图，不再有替换动作 |
| `data/taxonomy.json` | **未改** | v2.2.0，无 icon 字段，不含图标映射，无需替换 |
| `shots/icons-24-overview-v2…v10.{html,png}` | 移入 `shots/_superseded-20261103/`（18 个文件 / 8.9 MB） | 活动路径下不再有旧版本 |
| `icon-specimen/svg-v6`、`svg-v14-absorbed` | 移入备份目录 `scent-bak-20261103-154651/` | 项目 `icon-specimen/` 只剩 `svg/` |

备份：`C:/Users/16256/Documents/deepseek-harness/scent-bak-20261103-154651/`（含 `icon-specimen/`、`app.js`、`app-art.js`、`MANIFEST.sha256`，56 个文件）。

## 四、验证

- `node --check app-art.js` / `app.js` 均通过。
- 起 `server.js 8123` 后 `GET /icon-specimen/svg/fresh-tea.svg` 与 `/woody-woody.svg` 均 200，`index-art.html` 200。
- 整版渲染 `shots/icons-24-overview.png`（2400×3698 DPR2）目视：24 枚在 64px 与 36px 下均可读。
- 测量（alpha 口径，`meas24t.py`）：安全框 bad=[]；ink% 区间 29.4（aquatic）–87.9（leather）；质心极值 rose 9.30 / sandalwood 9.07 / woody 9.08 / fruity-gourmand 14.27（均在各枚语义允许范围内，未强行归一）。

## 五、遗留（未做，需用户裁定）

1. ~~`app.js` 的 `SUB_MARKS`/`SUB_FIT` 保留原线稿，只作兜底~~ —— **已于 2026-11-08 第二轮整块删除**，线稿不再存在（见第七节）。
2. `shots/five-check.html`、`icon-specimen/REDRAW-20261031.md`、`docs/ICON-HANDOFF-20261102-v1.md` 里仍引用已移走的 `svg-v6` / `svg-v14-absorbed` 路径，属历史文档，未改。
3. `shots/` 已于 2026-11-08 清理：从 588 个文件 / 101.5 MB（含 4 个子目录共 1442 文件 / 143.9 MB）收敛到 **40 个文件 / 7.0 MB**。备份在 `C:/Users/16256/Documents/deepseek-harness/scent-shots-bak-20261108/`（1403 文件 / 137 MB + `MANIFEST.sha256`）。保留规则与脚本见第九节。

## 六、复跑命令

```bash
P="C:/Users/16256/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe"
N="F:/deepseek/resources/runtime/primary-runtime/dependencies/node/bin/node.exe"
cd C:/Users/16256/ego/demo
"$P" safety.py cur24/*.svg            # 安全框收口
"$P" tidy24.py                        # 精度与描边收口
"$P" audit24.py                       # 解析式 bbox / 描边 / 体积
"$N" grid24t.cjs _g24t.png            # 24 枚透明网格
"$P" meas24t.py _g24t.png             # alpha 口径 bbox / ink / 质心
"$P" migrate.py                       # 写入 icon-specimen/svg/
"$N" rebuild_v10.cjs                  # 重建总览页
```

## 七、盘心改用上色 SVG（2026-11-08）

**推翻上一版的线稿重绘方案**：用户明确要求"把上色 SVG 直接挪过去，不要按线稿"。线稿方案（`marks24b.py`，24 枚 161 条 path）产物已全部回退。

**第二轮（同日）：线稿整条通路删除。** 第一版是「先画线稿、fetch 落地后替换成彩图」，实测用户能看到「先是老的、再是新的」两帧切换。修法不是加快替换，而是**不再画线稿**：

| 位置 | 改动 |
|---|---|
| `app.js` 删 | `PLATE_SW`（0.7）、`r2()`、`PLATE_MOTIFS`（6 个家族母题，2726 字符）、`SUB_MARKS`（24 个 key，14329 字符）、`SUB_FIT`（24 个 key + `_default`）、`PLATE_FALLBACK` —— 合计 **18 304 字符**，`node --check` 仍为 0 |
| `app.js` 新增 | `ART_READY`（`Map`，存已解析好的 svg 内部字符串，供**同步**查询）、`artWarmAll()`（模块顶层立即预取 24 枚，不等 `DOMContentLoaded`、不等 taxonomy）、`artSvgReady(subId)`（就绪返回内部 html，未就绪返回 `''`） |
| `scentPlate()` | 先造一个空的 `<svg class="plate-svg is-art" viewBox="0 0 24 24">` 占住 88px 的位（不会跳版），就绪就把内容 `innerHTML` 写进去；未就绪则等 `artInner()` 落地后再写同一个节点。**全程只有一个 svg 节点、只写一次内容，没有替换动作** |
| `styles.css` | 不变（`.wheel .plate-svg.is-art { fill: initial; stroke: none; stroke-width: 0; }` + 选中态覆盖仍需要，因为基类是 `fill:none`） |

净变化：`app.js` 215108 B → **189738 B**（-25370 B）。

### 实测

- `flashcheck.cjs`（点击后同一 JS 任务内采样）：24/24 点击瞬间 线稿节点 0、彩图节点 1。
- `flashcheck2.cjs`（更严：检查 svg 数量 = 1、`is-art` = true、`innerHTML.length > 0`，并在 40/120/400ms 复查内容长度）：**bad at click 0 / content changed after click 0** —— 既没有线稿，也没有"先 A 后 B"的替换。
- `coldcheck2.cjs`（禁缓存 + 限速 400KB/s + 250ms 延迟，冷启动首点 `cologne`）：点击瞬间 `{n:1, art:true, len:2677}`，预热后仍是 2677，内容未变。
- `shotart.cjs`：24/24 `art:true`，盘心 88×88；元素数 10（cologne / incense）–57（powdery-floral）。
- 窄屏（`shotnarrow.cjs`）：390 / 360 视口盘心均 **36×36**。
- 证据图：`shots/art-plates.png`（24 枚真实页面逐格截图）、`shots/art_<key>.png`（单枚）、`shots/art-narrow.png`（390/360 对照）。

### 复跑

```bash
N="F:/deepseek/resources/runtime/primary-runtime/dependencies/node/bin/node.exe"
cd C:/Users/16256/Documents/deepseek-harness/default-workspace/scent-picker
"$N" server.js 8123 &
cd C:/Users/16256/ego/demo
"$N" flashcheck2.cjs   # 断言点击瞬间即彩图、且内容不再变化（24/24）
"$N" coldcheck2.cjs    # 冷缓存 + 限速下的首点
"$N" shotart.cjs       # 逐小类截图 + 量盘心
"$N" shotnarrow.cjs    # 390/360 窄屏
```

## 八、`shots/` 清理（2026-11-08）

清理前 588 个文件／101.5 MB（含 `_old5`、`_superseded-20261103`、`_udd_art`、`_udd_nar` 四个子目录共 1442 文件／143.9 MB），清理后 **40 个文件／7.0 MB**。

### 保留规则（三条，全部可复核）

| 类别 | 内容 |
|---|---|
| A 最终交付物 | `icons-24-overview.{html,png}`、`icons-24-runtime.{html,png}`、`art-plates.png`、`art-narrow.png`、`art_<key>.png` ×24、`zoom24-five-sizes.png`、`ten-before-after.png` |
| B 文档具名引用 | `docs/` 与 `icon-specimen/` 的 `.md` 里出现过的 `shots/<文件名>`：`five-check.html`、`icons-preview.png`、`icons-16-*.png`、`icons-28-overview.png`、`marks12-dry.png`、`marks12d-fix.png` |
| C 其余全删 | 548 个文件 + 4 个子目录（含 122 张 `zz_*`、33 张 `inspect-*`、31 张 `v14/v15/v16/v17-*`、20 张 `marks*`、18 个 v2–v10 旧总览，以及两批 Playwright 用户数据目录 `_udd_art`/`_udd_nar` 共 820 文件） |

备份：`C:/Users/16256/Documents/deepseek-harness/scent-shots-bak-20261108/`（1403 文件／137 MB + `MANIFEST.sha256` 1402 行，删除前逐文件校验 SHA256 通过后才执行删除）。

### 清理后回归

- `index.html`、`index-art.html`、`shots/icons-24-overview.html`、`shots/icons-24-runtime.html`、`shots/five-check.html`、`icon-specimen/preview.html`、`icon-specimen/svg/woody-vetiver.svg` 全部 200。
- `shotart.cjs` 重跑：24/24 `art:true`，盘心 88×88 不变。

### 复跑

```bash
P="C:/Users/16256/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe"
cd C:/Users/16256/ego/demo
"$P" clean_shots.py --dry   # 只报告保留/删除清单
"$P" clean_shots.py --go    # 备份到 scent-shots-bak-<日期> 后删除
```
