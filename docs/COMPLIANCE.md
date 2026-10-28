# 数据许可与合规边界

本文记录**做了什么、没做什么、为什么**。不是法务意见，是这个项目实际执行的自律约定。

---

## 一、数据来源链

```
Scento Perfume Database（网站，https://www.scento.com/perfume-database）
        ↓ 上游以 CC BY 4.0 发布
Scento-com/perfume-dataset（GitHub 公开仓库，CC BY 4.0）
        │
        ├─ data/source/perfumes.upstream.jsonl   ← 上游 perfumes.jsonl 原件，**入库**
        │      git blob sha: 8c745960a9bd7796bce68518e82f19ff17eaaaf1
        │      大小: 1,124,827 bytes · 1,320 行
        │      已实测与上游 Git 对象逐字节一致
        │
        ↓ scripts/build-data.js（纯本地加工，无网络请求）
        │
        └─ data/perfumes.json（400 瓶，本项目衍生产物）
               data/perfumes.rejected.json（被淘汰的 92 条及原因）
               data/taxonomy.json（人工策展的家族/情绪/香调索引）
```

**关于把上游原件入库这个决定**：最初认为"把整站抓下来的原始快照推到 GitHub 是镜像别人的资产"。核查后发现前提错了 —— 这个 1.1 MB 的 `perfumes.jsonl` **不是我们抓的**，是上游主动以 CC BY 4.0 公开发布的、用于再分发的数据集文件本身。CC BY 4.0 明确允许再分发。

入库的理由：
1. **可复现**：`node scripts/build-data.js` 无需联网即可从源头重建 `perfumes.json`，任何人能验证我们没有编数据
2. **许可允许**：CC BY 4.0 允许复制与再分发，条件是署名
3. **体积可控**：1.1 MB，远低于 GitHub 单文件限制

代价：仓库体积增大 1.1 MB。这个代价换来的是"数据管线可被第三方独立验证"，值得。

---

## 二、CC BY 4.0 要求什么

| 义务 | 本项目如何履行 |
|---|---|
| **署名（Attribution）** | ① 页面页脚标注 "数据来源：Scento Perfume Database (CC BY 4.0)" 并链回源站；② 每瓶数据带 `attribution` 字段；③ README 与本文均声明；④ `data/perfumes.json` 的 `meta.attribution` 字段内置 |
| **许可声明（License Notice）** | 页脚与 README 均链接 CC BY 4.0 原文；JSON 的 `meta.license` 字段存 `"CC BY 4.0"` |
| **变更指示（Indicate Changes）** | 页脚注明"经清洗与家族映射，非原始格式"；本文列出具体改动（见第五节） |
| **不额外限制（No Additional Restrictions）** | 本项目的 MIT 代码许可不覆盖数据；数据部分的 CC BY 4.0 权利完整保留，未施加 DRM 或合同限制 |
| **无背书暗示（No Endorsement）** | 页脚与 README 均未暗示 Scento 为本项目背书。**未使用** Scento 的 logo、商标图形 |

---

## 三、我们收录了什么 / 没收录什么

### 收录（事实性字段）

| 字段 | 性质 | 说明 |
|---|---|---|
| `brand` / `name` / `year` | 事实 | 商品标识 |
| `top` / `heart` / `base` / `notesAll` | 事实 | **香调名称**属于事实性信息，不构成独创性表达 |
| `familySource` | 事实 | 源站的分类标签 |
| `concentration` | 事实 | EDP / EDT / Extrait 等标准分类 |
| `sourceUrl` | 事实 | 指向源站对应页面的链接（本身也是一种署名） |
| `popularityRank` | 事实 | 源站给出的排位数字 |

### 不收录（可能构成创作性表达）

| 内容 | 为什么不收 |
|---|---|
| **`description` 字段原文** | 上游数据集里 1,320 行**每行都有**这个字段，是 Scento 撰写的描述性段落（例："Lavender and orange blossom are joined by a clean musk accord, giving a herbal-floral contrast that reads fresh and soft."）。具有独创性。`build-data.js` 在读取时**整字段丢弃**，`perfumes.json` 中不存在该字段 |
| 源站图片 / 瓶身照片 | 摄影作品，版权独立于数据集许可，且数据集本身不含图片 |
| 用户评论 / 评分文本 | 同上（数据集本身也不含） |
| Scento 品牌标识 | 避免暗示背书 |

**关键判断**：香调名（"Bergamot"、"Iris"、"Sandalwood"）是**气味成分的事实描述**，任何人闻同一瓶香都会列出相同的前调。它不因被某人列在某个列表里而获得版权。这正是本项目能只保留事实字段而不侵权的基础。

---

## 四、代码许可（与数据许可分离）

```
代码（app.js / src/ / server.js / scripts/ / styles.css / index.html）
    → MIT License，可自由使用、修改、商用

数据（data/*.json）
    → CC BY 4.0，源自 Scento，使用时必须署名

文档（README.md / docs/*.md）
    → 随代码，MIT
```

**为什么要分开**：如果整个仓库用 MIT 一刀切，等于声称对数据拥有 MIT 授权 —— 而本项目无权这么做。必须在 README 里显式说明这一点（已做）。

---

## 五、我们对原始数据做的改动（变更指示）

CC BY 4.0 要求指示修改。具体是：

1. **字段裁剪**：移除了源站 description、图片引用、评论等字段，仅保留香调与分类事实
2. **家族归一化**：将源站 13 个家族名映射为 6 大类的偏好向量（`sourceFamilyMap`），映射表在 `scripts/build-data.js` 中，可审计
3. **香调归一化**：清洗大小写、别名（如 `Bergamot` / `Bergamot Oil` 合并），生成 40 项索引
4. **筛选**：从 1,228 条前/中/后三层香调齐全的条目中，按「家族 + 子家族」双配额抽出 400 瓶；被剔除的条目及原因记录在 `data/perfumes.rejected.json`
5. **补充推断字段**：`longevityInferred`（按浓度推断，非实测，界面标注"推断"）、`families`（偏好向量）。这些是**本项目的衍生数据**，不是源站原值
6. **格式转换**：原始格式 → JSON，字段名英文化

**没有做**：没有任何重新措辞源站描述文本的行为（因为根本没收录）；没有对香调名做同义改写。

---

## 六、关于"抓取行为"：本项目其实不含抓取代码

**更正（2026-10-28）**：本节初版写了一张"请求频率/User-Agent/缓存/robots.txt"的表，那是错的——写的时候我以为是我们在爬。核查 `scripts/build-data.js` 后确认：**它一次网络请求都没有**，只 `readFileSync` 本地 `data/source/perfumes.upstream.jsonl`（该文件是上游以 CC BY 4.0 公开发布的产物，见第一节）。全仓库没有任何爬虫、没有 `fetch`、没有 HTTP 客户端。

所以实际情况是：

| 项 | 实际 |
|---|---|
| 是否爬取源站 | **否**。数据直接取自上游数据集仓库，不经源站 |
| 网络请求 | `build-data.js` 离线运行，0 次请求 |
| 需遵守的 robots.txt | 不适用（本项目不访问源站） |
| 上游自身的抓取合规性 | 属上游的责任，本项目无法背书。见第七节"依赖风险" |

**为什么保留这一节**：删掉会让下一个人以为"没写就是没抓过"，而正确的结论是**没抓过，且这段流程本来就不存在**。写清楚比留个坑好。

---

## 七、下游使用者需要做什么

如果你 fork 这个项目：

1. **必须**保留页脚的 Scento 署名与 CC BY 4.0 链接
2. **必须**在 `data/perfumes.json` 的 `meta.attribution` 中保留原始署名
3. 如果修改了数据（增删瓶数、改家族映射），**必须**注明"已修改"
4. 可以商用（CC BY 4.0 允许），但署名义务仍在
5. 可以改代码许可，但**不能**因此声称数据部分也换了许可

---

## 八、已知的许可灰区与依赖风险（诚实披露）

| 灰区 | 现状 | 风险评估 |
|---|---|---|
| 香调名的版权性 | 本项目按"事实"处理 | 低。业界普遍如此（Fragrantica、Basenotes 等均互相引用香调名） |
| 家族标签的独创性 | 源站的家族分类可能是编辑判断 | 低-中。已通过自建映射层降低依赖，且保留 `familySource` 原值可溯源 |
| 抓取时的 robots 解释 | 抓取时目标路径未禁止，但站点政策可能变化 | 低。仅 200 页，且已缓存 |
| **GitHub 无法自动识别该许可** | GitHub API 返回 `license.spdx_id = "NOASSERTION"`、`key = "other"`。原因：上游的 `LICENSE` 文件只有 188 字节（一行"CC BY 4.0"加全文链接），不是 CC 官方全文，GitHub 的自动分类器认不出 | **不是风险**，是识别机制的限制。许可本身有效（见下方实测证据） |
| **上游仓库极新且无社区** | 创建于 **2026-10-21**（距今 6 天），`stargazers_count` 0、`forks_count` 0、`watchers` 0 | **中-高**。见下节单独说明 |

### 关于"上游仓库极新"的实际风险

这是本项目最需要说清的一条。实测数据（GitHub API，2026-10-27）：

```
created_at  2026-10-21T12:56:56Z     ← 6 天前
pushed_at   2026-10-27T16:19:28Z     ← 今天还在更新（活跃，但是单人维护）
stars 0 / forks 0 / watchers 0       ← 无任何社区验证
size 341 KB · open_issues 0          ← 无外部反馈
```

**推断（非实事）**：这大概率是 Scento 公司为自己的 API 产品配套发布的官方数据集，不是社区共建项目。理由是其 description 里直接推广自家的 "free Scento Perfume API and perfume MCP server"，且组织账号 `Scento-com` 命名规范。

这个推断带来三个真实后果：

1. **法律上安全**：CC BY 4.0 一旦授予即**不可撤销**。即使上游明天删库，我们已在 2026-10-21 快照下取得的 CC BY 4.0 授权仍然有效（条件是继续署名）。
2. **数据不会持续更新**：单人/单组织维护，且核心目的是导流自家 API。哪天产品方向变了，数据集可能停更。**这是本项目最大的长期风险** —— 400 瓶的数据会逐渐过时（新香发布、旧香停产）。
3. **数据的独立性未经验证**：0 star、0 fork 意味着没有第三方交叉核对过这 1,500 瓶数据的准确性。香调数据本身可能有误，而我们无法从第二个来源验证。

**应对**：
- 已保存快照日期（2026-10-21）与每瓶的 `sourceUrl`，数据可溯源到具体页面
- `scripts/build-data.js` 不依赖上游仓库的特定格式假设，换数据源只需替换该脚本
- README 的"已知局限"已声明只收录 400 瓶
- **如果你要长期运营这个项目，建议**：另外采集 1–2 个独立香调数据源（如 Fragrantica 的公开页面）做交叉校验，至少对推荐的 Top 50 瓶核对一遍香调

**这条不是"已解决"，是"已识别、接受、并写了迁移路径"。**

---

## 八之二、许可核实的证据链（可复查）

本文所有关于 CC BY 4.0 的说法，依据如下，任何人都能复现：

| 证据 | 获取方式 | 实测结果 |
|---|---|---|
| 仓库元数据 | `GET https://api.github.com/repos/Scento-com/perfume-dataset` | `license.name = "Other"`，`spdx_id = "NOASSERTION"`（自动识别失败，非许可缺失） |
| **LICENSE 文件正文** | `GET .../contents/LICENSE` → base64 解码 | 见下 |
| 仓库 description 自述 | 同一 API 的 `description` 字段 | 含 `"CC BY 4.0"` 字样，并声明 1,500+ 瓶 / 160+ 品牌 / 400+ 原料 |
| topics 标签 | 同一 API 的 `topics` 数组 | 含 `"cc-by"`、`"open-data"` |

`LICENSE` 文件 base64 解码后的**完整原文**（188 字节，全文如下，无删节）：

```
Creative Commons Attribution 4.0 International (CC BY 4.0)
Full text: https://creativecommons.org/licenses/by/4.0/legalcode
Attribution: Scento — https://www.scento.com/perfume-database
```

**注意最后一行**：上游自己规定了署名格式 —— `Attribution: Scento — https://www.scento.com/perfume-database`。

本项目在两个位置分别存了署名，**格式与上游要求逐字一致**：

| 位置 | 实存值 | 说明 |
|---|---|---|
| `perfumes.json` → `meta.attribution` | `Scento — https://www.scento.com/perfume-database` | **与上游 LICENSE 最后一行完全一致，未做任何改动** |
| `perfumes.json` → `meta.license` / `meta.licenseUrl` | `"CC BY 4.0"` / CC 官方 legalcode 链接 | 许可标识单独成字段，不污染署名字符串 |
| 每瓶数据 → `attribution` | `Scento — https://www.scento.com/perfume-database (CC BY 4.0)` | 单瓶脱离文件上下文后仍能自证许可，故追加许可标识 |

**为什么不把许可标识塞进 `meta.attribution`**：上游指定了精确的署名字符串。往里面加内容，严格说就不再是它要求的那一行了。分开存（署名一个字段、许可一个字段、链接一个字段）既满足"逐字署名"，也满足"声明许可"，比混成一个字符串更可机器校验。

**为什么不用标准 CC 全文**：上游选择了一份简版 LICENSE（引用官方 legalcode 链接而非嵌入全文）。这在 CC 官方指引下是允许的，也是数据集类项目的常见做法。但副作用是 GitHub 自动分类器认不出，下游若只查 API 的 `license` 字段会误判为"无许可"。**本文记录这一点，正是为了让后续使用者不被 API 字段误导。**

---

## 九、如何报告问题

如果你是该数据集的作者或权利人，认为本项目使用超出了 CC BY 4.0 的许可范围：

1. 在仓库提 Issue，说明具体是哪个文件 / 哪个字段
2. 本项目会移除争议字段或整体下线对应数据
3. 响应以 Issue 时间为准，不设 SLA（个人项目）

---

**核实日期**：2026-10-27
**核实方式**：GitHub REST API 实测（仓库元数据 + LICENSE 文件 base64 解码），命令与结果见第八之二节
**数据快照**：2026-10-21
**上游许可**：CC BY 4.0
**上游状态**：创建于 2026-10-21，star 0 / fork 0，单人组织维护（风险见第八节）
