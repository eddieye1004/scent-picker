# 定时更新数据：机制、边界、怎么改

> 2026-11-01 建立。对应 `.github/workflows/update-data.yml` 与 `docs/DECISIONS.md` D56/D57。

---

## 一、它每周做什么

| 项 | 值 |
|---|---|
| 触发 | 每周一 03:17 UTC（北京时间 11:17），或手动 `workflow_dispatch` |
| 动作 | 从上游取 `perfumes.jsonl` → 跑管线 → 数据体检 → 四套测试 → 有变化才提交 |
| 耗时 | 通常 < 2 分钟（取数 2 个请求 + 管线 8 秒 + 四套测试约 40 秒） |
| 成本 | GitHub Actions 免费额度，公开仓库不限分钟数 |

**为什么是周一 03:17**：上游 Scento 的提交看不出规律（最近一次是 10-29 周三），
挑周一保证「新的一周开始前数据是最新的」。避开整点是为了不跟别人的定时任务
挤同一分钟排队 —— Actions 的排队延迟在整点会明显变长。

---

## 二、取数为什么走 blob API 而不是直连

这是本项目踩了很久的坑，写清楚免得以后重走：

| 通道 | 结果（2026-11-01 实测） |
|---|---|
| `raw.githubusercontent.com/.../perfumes.jsonl` | **`ECONNRESET`** —— curl 与 node https 都失败 |
| 网页抓取工具 | 截断到 199KB（约 397 行），用它覆盖等于**数据倒退** |
| `api.github.com/repos/.../contents/perfumes.jsonl` | 200，给元信息（sha + size），**不含内容** |
| **`api.github.com/repos/.../git/blobs/{sha}`** | **200，base64 完整内容** ✓ |

所以工作流走第三个 → 第四个：先问元信息拿 sha 与 size，再按 sha 取 blob，
解码后**校验字节数必须等于上游报告的 size**（不等就 fail，不静默写入）。
实测解码结果与本地文件**逐字节一致**（1,207,141 字节）。

限额：未认证 60 次/小时，用 `GITHUB_TOKEN` 是 5000/小时。本流程只发 2 个请求。

---

## 三、三个「不许发生」的约束，每条都有对应实现

### ① 数据没变时不许产生空提交

```bash
if git diff --quiet -- data/; then echo "changed=false" >> "$GITHUB_OUTPUT"; fi
```

空提交会填满提交历史，还会让 Pages 每次白重建一遍。实测大部分周次上游不变。

### ② 测试不过时不许提交

工作流里 `qa-data.mjs` 与四套测试都在提交步骤**之前**，任一失败即中止。
这不是形式 —— 上游改字段结构时管线会静默产出残缺数据，体检是最后一道闸。

### ③ 快照日期不许写死

`scripts/build-data.js` 的 `sourceSnapshot` 从**上游该文件的最近一次提交时间**取
（CI 里由工作流注入 `SCENT_SNAPSHOT` 环境变量），本地手动跑时退回文件 mtime。

写死过的后果实测过：上游 10-29 更新到 1479 条，代码里还写 `2026-10-21`，
而这个日期会在页脚与 README 里被读到 —— 等于用错日期给数据背书。

---

## 四、手动跑一次

### 本地

```bash
# 只重建（用本地已有的上游原件，不联网）
node scripts/build-data.js
node scripts/qa-data.mjs        # 体检
node scripts/test-render.mjs    # 四套
```

### 从 GitHub 网页手动触发

仓库 → Actions → 「每周更新香水库」→ `Run workflow`。
适合「刚看到上游更新了，不想等周一」。

### 强制重跑某个历史快照

```bash
git checkout <某次数据提交> -- data/source/perfumes.upstream.jsonl
node scripts/build-data.js
```

---

## 五、它**不**做的事（避免误解）

| 不做 | 原因 |
|---|---|
| 更新 taxonomy（24 类结构） | 分类是人工判断的产物（D51/D52），不能由数据自动重算 |
| 生成佣金链接 | 需要你的联盟账号，见 `docs/AFFILIATE-SETUP.md` |
| 更新 README 里的瓶数 | 会写死在多处，目前靠人工同步（见下面「已知欠缺」） |
| 提交非 `data/` 的改动 | `git add data/` 限定范围，避免把别的东西带进去 |

---

## 六、已知欠缺

### README 与页面文案里的瓶数是手写的

`README.md` 的「1388 瓶」、`app.js` 第 4 步的「春 1331 · 夏 840 …」
都是人工同步的。上游一旦再变，这些数字会与数据脱节。

**这里没有做成自动的原因**：它们是**面向读者的话**，不只是一个数字 ——
句子结构、单位、四舍五入方式都可能要调，纯模板替换容易产出别扭的文案。
但如果哪天觉得人工同步太烦，可行做法是让 `build-data.js` 在 meta 里
多输出一份 `seasonCounts`，然后页面从 meta 读，README 用占位符。

### 上游 schema 变更会直接失败，不会自愈

工作流失败时会往 `$GITHUB_STEP_SUMMARY` 写一份诊断（含本地复现命令）。
GitHub 会给你发失败通知邮件。见失败时的第一件事是看
`data/perfumes.rejected.json` 的淘汰原因分布 —— 如果 `missing_pyramid`
突然从 91 涨到几百，说明上游改了香调字段名。
