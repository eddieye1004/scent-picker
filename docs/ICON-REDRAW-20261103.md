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
| `app.js` | **未改** | `SUB_MARKS`/`SUB_FIT` 是运行时线稿（无填充、stroke 由 CSS 给）的另一套数据，与上色 svg 独立；本轮不动 |
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

1. `app.js` 的 `SUB_MARKS`/`SUB_FIT` 仍是旧的线稿母题（如 `vetiver` 还是"一束根草"、`green-citrus` 还是"果+双叶"）。若 `index.html` 的盘心线稿要与新上色版语义一致，需另做一轮线稿重绘——这是独立工作，不在本轮 24 枚上色图范围内。
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

## 七、运行时线稿（`app.js` SUB_MARKS / SUB_FIT）· 2026-11-08

上色 svg 与运行时不加色线稿是**两套独立数据**，替换上色版不会自动更新线稿。
本轮按重绘后的造型重新授权（author）24 枚线稿，写入 `app.js`：

- 生成器 `C:/Users/16256/ego/demo/marks24b.py` → `marks24b.json`（`{marks:{key:[d…]}, fits:{key:[k,dx,dy]}}`）。
- **不能机械抽取**：早期 `mkmarks.py` 用 RDP 抽上色稿的最大填充面做线稿，24 枚在 88px 下全部不可读（只剩外轮廓）。线稿必须按每枚的构成重写，每枚 2–13 条 path，全 24 枚共 161 条。
- 归一化：最长边 = 17 viewBox 单位，包围盒中心对齐 (12,12)，`SUB_FIT` 记录 `[k, dx, dy]`；`scentPlate()` 按 `1/k` 反补偿线宽（`PLATE_SW = 0.7`）。
- 24 枚实测（真实页面 1440×900、DPR2，逐个点选小类后量 `.hub-plate .plate-svg`）：盘心全部 **88×88**，path 数 2–13，实测描边 0.58–0.74 px，`plate-cap` 文本齐全。
- 数值自检：24 枚包围盒 17.0×10.8–17.0×17.0，中心偏差 0，无越界（脚本见 `verify24b.cjs` 同目录的一次性审计）。
- 视觉对照：`shots/real-plates.png`（真实页面逐格截图，12 枚）、`shots/mkfinal.png`（24 枚 × 88/36/24 三档，直接读 `app.js` 的 SUB_MARKS 渲染）。
- `node --check app.js` 通过；`app.js` 218725 B / 4212 行（原 151936 B / 4237 行，行数减少是因为旧线稿每条图元独占一行、新线稿同格式）。
- 造型取舍（均为目视否决后定稿）：木段两端封圆弧、只留 2 条顺纹（多条横纹读成"卷纸"）；乌木改折线方料 + 4 条**竖向**顺纹（横向线读成面包）；香根草两端封口成桶形 + 8 条收在束内的草茎 + 两道紧贴的束带（散开的平行线读成竹签）；树脂一长一短两条不共心流纹（平行弧读成闭眼）；皮革三道**同向**折痕（交叉读成揉皱的纸）；焚香火星改折线簇（水滴读成柱顶的球）；粉感花用 5 片圆头花瓣（5 个分离圆读成齿轮）；香草美食奶油盘与荚交叠（分离读成"盘子加一根棒"）。
