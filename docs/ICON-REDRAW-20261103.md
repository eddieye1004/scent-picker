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
| `app-art.js` | 只改一行注释里的体积数字（236KB/74.6KB → 281.3KB/79.3KB） | 逻辑零改动；`node --check` 通过 |
| `app.js` | 追加彩色通路（2026-11-08，见第七节） | `SUB_MARKS`/`SUB_FIT` 仍保持原线稿（兜底用）；盘心改为 fetch 上色 svg 后替换 |
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

1. `app.js` 的 `SUB_MARKS`/`SUB_FIT` 保留原线稿，只作兜底（上色 svg 加载失败时显示）。盘心正稿已改用上色 svg（第七节）。
2. `shots/five-check.html`、`icon-specimen/REDRAW-20261031.md`、`docs/ICON-HANDOFF-20261102-v1.md` 里仍引用已移走的 `svg-v6` / `svg-v14-absorbed` 路径，属历史文档，未改。
3. `shots/_superseded-20261103/`（8.9 MB）与 `shots/` 里大量探测图（合计 99 MB / 549 文件）尚未清，确认后可整批删除。

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

**推翻上一版的线稿重绘方案**：用户明确要求"把上色 SVG 直接挪过去，不要按线稿"。线稿方案（`marks24b.py`，24 枚 161 条 path）产物已全部回退，`SUB_MARKS`/`SUB_FIT` 恢复为备份原版（剪掉新加两段后与 `scent-bak-20261103-154651/app.js` 逐字节相同，`cur3 == bak ? True`）。

### 实现

| 位置 | 改动 |
|---|---|
| `app.js` 新插入（`function scentPlate(sub)` 之前） | `ART_FILE`（24 对 key→旧文件名）、`ART_CACHE`、`artInner(subId)`（fetch `./icon-specimen/svg/<file>.svg`，剥外层 `<svg>` 与 `<title>`）、`artSeq`、`artNs(inner, ns)`（给 id 与 `url(#…)` 加 `-<ns>` 后缀，避免 24 枚同页 id 冲突） |
| `scentPlate()` 尾部（`return wrap;` 前） | `artInner(sub.id).then(...)` 造 `svg.plate-svg.is-art` 并替换掉线稿；**加载失败保留线稿，绝不空着** |
| `styles.css` | `.wheel .plate-svg.is-art { fill: initial; stroke: none; stroke-width: 0; }` 及选中态覆盖——否则基类 `fill:none` 会把多色图糊成单色轮廓 |

净增 2593 B（`app.js` 213114 B vs 备份 214756 B），`node --check` = 0。

### 实测（`shotart.cjs`，真实页面 1440×900 DPR2，逐个点选 24 个小类）

- **24/24 `art:true`，盘心全部 88×88**；元素数 10（cologne / incense）–57（powdery-floral），`tea` 50、`green` 45、`green-citrus` 43、`vetiver` 39。
- 窄屏（`shotnarrow.cjs`）：390 / 360 视口盘心均 **36×36**；`plate-cap` 在 390 显示、360 隐藏（既有断点，非本轮引入）。
- 证据图：`shots/art-plates.png`（24 枚真实页面逐格截图，1260×952）、`shots/art_<key>.png`（单枚）、`shots/art-narrow.png`（390/360 对照）。

### 复跑

```bash
N="F:/deepseek/resources/runtime/primary-runtime/dependencies/node/bin/node.exe"
P="C:/Users/16256/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe"
cd C:/Users/16256/Documents/deepseek-harness/default-workspace/scent-picker
"$N" server.js 8123 &
cd C:/Users/16256/ego/demo
"$N" shotart.cjs        # 逐小类截图 + 量盘心
"$N" shotnarrow.cjs     # 390/360 窄屏
"$P" verify_only_art.py # 断言只动了彩色通路
```
