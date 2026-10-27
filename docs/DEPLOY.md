# 部署到 GitHub Pages

全程约 **15 分钟**。免费，不需要服务器、不需要域名。

---

## 前置检查（做之前先确认，省得到时候白折腾）

```bash
node --version      # 需要 >= 18（用到 ES Module 顶层 await 的话）
git --version       # 有就行
```

以及确认本地能跑起来：

```bash
cd scent-picker
node server.js
# 打开 http://localhost:8080，走完四步能看到三瓶结果 → 才能进入部署
```

**这一步不能跳。** Pages 上出问题很难调试，本地先跑通能省掉 80% 的坑。

---

## 一、初始化仓库

```bash
cd scent-picker
git init
git add .
git commit -m "feat: 零基础香水选择器 v1.0"
```

### 先看一眼会提交什么

```bash
git status --short
```

**必须出现在列表里的**：`index.html`、`app.js`、`styles.css`、`src/`、`data/`、`scripts/`、`docs/`、`README.md`、`server.js`

**不应该出现的**（如果出现，先加进 `.gitignore`）：

```
node_modules/
.DS_Store
Thumbs.db
*.log
```

本项目零依赖，理论上不该有 `node_modules`。如果有了，说明你中途 `npm install` 过，别提交。

---

## 二、推到 GitHub

```bash
# 先在 GitHub 网页上新建一个空仓库（不要勾选 README / .gitignore / license）
git remote add origin https://github.com/<你的用户名>/scent-picker.git
git branch -M main
git push -u origin main
```

> **认证提示**：2021 年后 GitHub 不再接受账号密码推送。如果报 `could not read Username` 或 `Support for password authentication was removed`，说明没配 Personal Access Token。
>
> 最省事的做法：先装 [GitHub CLI](https://cli.github.com/)，然后
> ```bash
> gh auth login          # 按提示走浏览器授权
> gh repo create scent-picker --public --source=. --push
> ```
> 第二条命令会一次性完成建仓 + 设 remote + 推送。

---

## 三、开启 Pages

### 方式 A：网页操作（推荐，看得见发生了什么）

1. 打开 `https://github.com/<用户名>/scent-picker/settings/pages`
2. **Source** 选 `Deploy from a branch`
3. **Branch** 选 `main`，目录选 **`/ (root)`**
4. 点 **Save**
5. 等 1–3 分钟，刷新页面，顶部会出现访问地址

### 方式 B：GitHub CLI 一条命令

```bash
gh api -X POST repos/<用户名>/scent-picker/pages \
  -f source[branch]=main -f source[path]=/
```

### 为什么是 root 而不是 /docs

本项目的入口 `index.html` 在根目录。如果你的仓库想用 `docs/` 作为 Pages 目录，需要把 `index.html`、`app.js`、`styles.css`、`src/`、`data/` **全部**移进 `docs/` —— 因为 Pages 只发布指定目录及其子目录，`../data/` 这种跨目录引用在 Pages 上不成立。

**别踩这个坑**：只把 `index.html` 放进 `docs/` 而把 `data/` 留在根目录，本地能跑（因为 `file://` 相对路径能跨），Pages 上 404。

---

## 四、验证部署

访问 `https://<用户名>.github.io/scent-picker/`

### 必须逐项确认

| 检查项 | 预期 | 不通过说明什么 |
|---|---|---|
| 页面加载出第一步问卷 | 看到"你想被别人闻成什么感觉" | `index.html` 路径不对，或 Pages 还没构建完 |
| 浏览器控制台无红色报错 | 干净 | 打开 F12 → Console 看 |
| 走完四步能出结果 | 出现 3 瓶卡片 | `data/` 没被发布，或 fetch 路径错误 |
| 每瓶有三调 | 前调 / 中调 / 后调 都有内容 | `app.js` 版本不对，Pages 缓存了旧版 |
| 页脚有 Scento 署名 | 见 "数据署名 Scento — ..." | **不要跳过这条**，是 CC BY 4.0 的许可义务 |
| 手机宽度下不塌 | 375px 宽能正常用 | CSS 有写响应式，需实测确认 |

### 缓存问题

Pages 有 CDN 缓存，改了代码重新推送后**可能几分钟才生效**。强制刷新：

- Windows：`Ctrl + Shift + R`
- Mac：`Cmd + Shift + R`

如果超过 10 分钟还是旧的：去 Actions 标签页看最近一次 `pages build and deployment` 是否成功。

---

## 五、路径问题（这是 Pages 上最常见的失败原因）

本地 `node server.js` 时页面在 `http://localhost:8080/`，fetch 的是 `./data/perfumes.json`。
Pages 上页面在 `https://user.github.io/scent-picker/`，fetch 的仍是 `./data/perfumes.json` → 解析为 `https://user.github.io/scent-picker/data/perfumes.json`。

**只要入口在仓库根目录，这个相对路径在两边都对。**

如果将来把站点放进子路径（比如 `docs/`），或者换成 `username.github.io/scent-picker` 这种项目页以外的形式，才需要改：

```js
// app.js 里如果出现硬编码的绝对路径，改成相对
// 错误：fetch('/data/perfumes.json')
// 正确：fetch('./data/perfumes.json')
```

**当前代码已检查过，无绝对路径。** 但如果你自己加了新文件，注意这一点。

---

## 六、常见故障对照表

| 现象 | 原因 | 修法 |
|---|---|---|
| 404 页面找不到 | Pages 未启用 / 分支选错 / 还没构建完 | 检查 Settings → Pages，等 3 分钟 |
| 页面白屏，控制台 `Failed to fetch` | 数据文件没发布，或路径错 | 直接在浏览器打开 `.../data/perfumes.json` 看能否返回 JSON |
| 页面白屏，控制台 `MIME type` 错误 | `.js` 被当成了别的类型 | Pages 对 `.js` 默认返回 `application/javascript`，通常不会。若真出现，检查是否有 `_config.yml` 干扰 |
| 样式全丢 | `styles.css` 路径错 | 打开 `.../styles.css` 确认能访问 |
| 推送报 `remote: Permission denied` | 认证问题 | 见第二节的 GitHub CLI 做法 |
| 显示的是旧版本 | CDN 缓存 | `Ctrl+Shift+R`；或等 10 分钟 |
| 改了 `data/` 但页面没变 | 浏览器缓存了 JSON | 同上；开发时可在 DevTools 里勾 Disable cache |

---

## 七、之后每次更新

```bash
git add .
git commit -m "update: 扩充数据到 300 瓶"
git push
```

Pages 会自动重新构建。**大约 1–2 分钟。**

如果改的是数据结构（字段增删），记得同时跑测试：

```bash
node scripts/test-scoring.mjs
node scripts/test-render.mjs
node scripts/qa-data.mjs
```

---

## 八、可选：换成本地预览生产构建

不需要构建步骤。如果只想模拟 Pages 的静态服务行为：

```bash
node server.js 8080
```

`server.js` 设了正确的 `Content-Type`，行为与 Pages 一致（静态文件 + 相对路径）。

**唯一的差异**：Pages 会默认加 `X-Content-Type-Options: nosniff` 等安全头，本地不会。对本项目无影响。

---

## 九、部署后建议做的一件事

把 `README.md` 里"怎么跑起来"那一节，改成先给线上地址，再给本地运行方式：

```markdown
**在线试用**：https://<用户名>.github.io/scent-picker/

**本地运行**：node server.js
```

理由：给别人的第一入口应该是能直接点的链接，不是让他先 clone。

---

**最后提醒**：部署完不要只看"页面能打开"就结束。走完一遍完整流程 —— 选清冷、选约会、滑块拉到 2、点两个喜欢的香调 —— 确认三瓶结果的**推荐理由确实提到了你选的选项**。这才是这个项目真正要交付的东西。
