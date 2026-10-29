# 圆盘交互打磨 · 改动清单

> ⚠️ **部分结论已被后续迭代推翻，读前先看这条。** 本文写于轮盘 v2（同心双环 + 盘心内接正方形 42.7%，实测日期 2026-10-28）。此后盘心改成「闭合态 66% 实心圆盘 / 展开态缩到 56% 且透明 / 选定态整盘翻深」，本文件里所有 **42.7%、内接正方形、四角角标、`DISC.rIn` 138→146** 的说法都已作废。现行几何与判据以 `docs/DECISIONS.md` 的 **D32（标本线稿）** 与 **D33（盘心按圆弧约束收边）** 为准。交互触点诊断表（第一步）里的状态判断仍然有效，缓动与时长那一栏的数字以 `styles.css` 追加层为准。

> **视觉基调也已换代**：本文开头说的「纯黑白 + 单一朱红 `#b3261e`、`--radius: 0`、无阴影」是轮盘 v2 的配色，现在是瑞士国际主义骨架 + 克莱因蓝 `#002FA7`（`--blue-deep #001A5E` / `--blue-lift #3D5FC4` / `--blue-amb #8A93B8`）、`--radius: 4px`、盘心与卡片有柔影。四档色值与改用理由见 `docs/DECISIONS.md` 里克莱因蓝那几条。
> 所有数字来自 Edge headless + CDP 实测，不是估算。本文第一至三步实测日期 2026-10-28；**末尾「第四轮补充」为 2026-10-29 重测，那一节才是现行值**。

---

## 第一步 · 交互触点诊断

逐项列出圆盘现在能响应什么、缺什么。**「已有」列以实测为准（探针脚本读 DOM 与 computed style）**。

| 触点 | 打磨前状态 | 实测证据 | 打磨后 |
|---|---|---|---|
| **悬停 · 扇区** | 有。填充转 `--bg-2`、描边转墨 | `.sector-g:hover` → `fill rgb(245,245,245)` | 保留，缓动 140ms linear → **150ms cubic-bezier(.4,0,.2,1)** |
| **悬停 · 盘心** | 有换字，但盘心边框无反应 | 边框恒为 `rgb(118,118,118)` | **三通道联动**：边框收墨、底色提亮、角标提到不透明 |
| **按下 · 扇区** | **无**。`:active` 全文只出现在 `.btn` | `grep -n ":active"` → 仅 1 处 | 新增：填充转 `--bg-3` + 描边墨，**且 `transition: none`** |
| **按下 · 滑块** | 无视觉反馈 | thumb 恒为 20×20 `--accent` | 新增：`scale(1.1)` + 转墨色，120ms |
| **拖拽旋转** | **完全没有**。`app.js` 零 `pointerdown` | `grep pointerdown` → 0 命中 | 新增：指针拖动整盘旋转，标签反向抵消 |
| **惯性** | 无 | — | 新增：角速度衰减 `0.94`/帧，两段式收敛 |
| **吸附** | 无 | — | 新增：松手后吸到最近的 60° 整数倍（实测 `dev 0`） |
| **扇区切换** | 有。点选后 320ms 进下一题 | `setTimeout(next, 320)` | 保留，盘心换字加 180ms 淡入上移 |
| **数值范围调节** | 有数值回显 `.scale-read` | 存在 | 补按下态（见上） |
| **键盘** | 有。方向键漫游 + roving tabindex | 实测 Tab 回来仍在「干净」 | 保留，不动 |
| **生成中态** | **无**。`finish()` 期间按钮毫无变化，可连点 | 原 `onclick: finish` 无禁用 | 新增 `setBusy()`：改文案「正在比对…」+ `disabled` + 跳动方点 |
| **完成态** | 有结果页 | 3 张卡正常 | 保留 |
| **空态** | 有 `.is-idle`，但文案不分屏宽 | 手机 130px 盘心挤三行 | 新增窄屏短文案「点任意扇区」 |

### 三个被忽略的结构性问题

1. **盘心方框伸出圆盘轮廓**：只在 ≤620px 出现。那里盘心放大到 42%，方角到圆心 = 42%×√2/2 = **29.70%**，而内弧半径 42% 时只有 28.75% → 实测溢出 **3.2 / 3.0 / 2.6px**（iPhone 14 / 360 / 320）。
2. **盘心「单薄」是全局的**：`border-radius: 2px` + `box-shadow: none` + 只有一根 1px 浅灰线，在 504px 的圆盘中央读起来像占位符。
3. **无 `prefers-reduced-motion` 覆盖新增动效**：原文件只有一处全局兜底，拖拽惯性由 JS 的 `requestAnimationFrame` 驱动，**不受 CSS 媒体查询约束**（这条最重要，见下）。

---

## 第二步 · 盘心重设计

### 参数表（全部为实测生效值）

| 项 | 桌面（≥621px） | ≤620px | ≤620px 且高 ≤700px | ≥621px 且高 ≤740px |
|---|---|---|---|---|
| 尺寸 | **`42.7%`** | **`42.7%`** | **`42.7%`** | **`42.7%`** |
| 圆角 | `0` | `0` | `0` | `0` |
| 边框 | `1px solid --edge` + `border-top: 2px solid --ink` | 同左 | 同左 | 同左 |
| 底色 · 未选定 | `--bg-2` `#f5f5f5` | 同左 | 同左 | 同左 |
| 底色 · 悬停 | `--bg` `#ffffff` | 同左 | 同左 | 同左 |
| 底色 · 已选定 | **`--ink` `#0e0e0e`（实心墨）** | 同左 | 同左 | 同左 |
| 阴影 | `none` | `none` | `none` | `none` |
| 内边距 | `14px 16px` | `10px 12px` | `8px 10px` | `8px 10px` |
| 行间距 | `gap: 5px` | `4px` | `4px` | `3px` |
| 角标内缩 | `inset: 3px` | `2px` | `2px` | `2px` |
| `hub-zh` | `22px / 700 / lh 1.1` | `17px` | `16px` | `18px` |
| `hub-desc` | `12px / lh 1.4 / max-h 34px` | `12px / 1.3 / 32px` | 隐藏 | `12px / 1.2 / 15px` |

**尺寸在所有断点都是 42.7%，不给窄屏另设比例。** 早期窄屏放大到 42%、桌面 34%，结果桌面「角顶内弧」、手机「浮在中间」——同一组件在两种设备读成两种东西。42.7% 的来历见下。

### 为什么这么改

**去掉双层框。** 第一版用 `border` + `outline: 1px solid var(--ink); outline-offset: -5px` 做"外浅内重"两层。截图看下来读成**印刷套印不准**，不是层次 —— 两条线离太近时人眼会当成一条线的错位。改用**上边 2px 墨色 + 其余三边 1px 浅灰**的不对称边框，这是报刊栏线的做法：头部重、容器轻，一眼分出主次，不引入任何拟物质感。

**加四角角标。** 圆盘是角度构成的图形，方块是直角构成的。四角 8px 的 L 形短线让两者在同一张图上读成**一套制图符号**，而不是"一个网页框坐在一个圆里"。角标用 8 段 `linear-gradient` 拼（`::before`/`::after` 只能画两个角）。

**盘心取内接正方形，尺寸 42.7%。** 先量中心：`dx=0 dy=0`，盘心与圆盘本来就同心，「看起来偏上」是构图误判。真问题是体量：盘心 34%、内弧 `rIn=146/480=30.42%`，两者之间留了一圈 39px 白 —— 方块悬在空白里，像贴在圆盘上的一张卡片。

改法是把盘心边长直接取到内弧的内接正方形：`rIn × √2 = 30.42% × 1.41421 = 43.0%`，实测取 **42.7%**（留 0.3% 防亚像素舍入把角标顶出弧外）。四角正好顶到内弧，方与圆咬合成一个整体。

配套把 `rIn` 从 138 改 146：`146/480 = 30.42%`，容得下 42.7% 的方角（29.70%），留 0.72% 余量。

**「单薄」的真解是压黑，不是加装饰。** 三行字居中时，215px 的框里只占中间 73px，上下各空 57px —— 那是「空」不是「留白」。先改 `justify-content: space-between` 分带，只是把空白换了位置。最终做法是**已选定态整块翻成实心墨**（`background: var(--ink)`，白字 19.30、kicker `#a8a8a8` 8.12、说明 `#c9c9c9` 11.66）。理由不是字不够大，是体量对不上 —— 浅色方块压不住 504px 的圆盘。瑞士海报表达「确定」的惯用手法就是压黑（Müller-Brockmann 苏黎世音乐厅系列）。

```css
.disc-hub {
  width: 34%; height: 34%;
  border-radius: 0;
  border: 1px solid var(--edge);
  border-top: 2px solid var(--ink);
  background: var(--bg-2);
  box-shadow: none;
  padding: 14px 16px;   /* 必须是 px，见下方踩坑 */
  gap: 5px;
  transition: border-color 180ms cubic-bezier(.4,0,.2,1),
              background-color 180ms cubic-bezier(.4,0,.2,1);
}
.disc-hub::before {
  content: ''; position: absolute; inset: 3px; pointer-events: none;
  background:
    linear-gradient(var(--ink-3),var(--ink-3)) left  top    / 8px 1px no-repeat,
    linear-gradient(var(--ink-3),var(--ink-3)) left  top    / 1px 8px no-repeat,
    linear-gradient(var(--ink-3),var(--ink-3)) right top    / 8px 1px no-repeat,
    linear-gradient(var(--ink-3),var(--ink-3)) right top    / 1px 8px no-repeat,
    linear-gradient(var(--ink-3),var(--ink-3)) left  bottom / 8px 1px no-repeat,
    linear-gradient(var(--ink-3),var(--ink-3)) left  bottom / 1px 8px no-repeat,
    linear-gradient(var(--ink-3),var(--ink-3)) right bottom / 8px 1px no-repeat,
    linear-gradient(var(--ink-3),var(--ink-3)) right bottom / 1px 8px no-repeat;
  opacity: .55;
  transition: opacity 180ms cubic-bezier(.4,0,.2,1);
}
.disc-hub.is-hover { border-color: var(--ink); background: var(--bg); }
.disc-hub.is-hover::before { opacity: 1; }

/* 已选定：整块压墨。悬停只是预览，不压黑 —— 所以用两个独立的类。 */
.disc-hub.is-picked {
  background: var(--ink);
  border-color: var(--ink);
}
.disc-hub.is-picked::before { opacity: .8; }
.disc-hub.is-picked .hub-kicker { color: #a8a8a8; }
.disc-hub.is-picked .hub-zh     { color: #ffffff; }
.disc-hub.is-picked .hub-desc   { color: #c9c9c9; }
```

### 两个吞掉一轮时间的坑

**坑一：百分比 padding 按父容器宽度算。** `.disc-hub` 是绝对定位，`padding: 14% 12%` 里的 14% 相对 `.disc` 的 504px = 上下各 70px，把 122px 的盘心直接撑爆（实测 `scrollHeight 138 > clientHeight 120`）。CSS 看起来是"相对自己留白"，实际相对父级。全部改 px。

**坑三（测量陷阱，不是代码 bug）：`transition` 存在时读不到终值。** `classList.add('is-picked')` 后立刻读 `getComputedStyle(hub).backgroundColor`，拿到的是过渡**起始**值（一直读到 `rgb(245,245,245)`，误判成 CSS 没生效）。必须等过渡结束再读：`await new Promise(r => setTimeout(r, 300))`。这一条浪费了三轮排查。

**坑二：`-webkit-line-clamp` 让说明文字凭空消失。** 它要配 `display: -webkit-box`，而 `-webkit-box` 作为 flex 子项时 `clientHeight = 0`。改用 `flex: none` + `max-height` —— `flex: none` 不能省，flex 子项默认可收缩，内容超高会被压成 0 高，而 CSS 里完全看不出问题。

---

## 第三步 · 交互反馈

### 动效参数总表

| 动作 | 时长 | 缓动 | 为什么 |
|---|---|---|---|
| 扇区 hover | `150ms` | `cubic-bezier(.4,0,.2,1)` | <80ms 看不出，>200ms 横扫一排会拖尾迹 |
| 扇区按下 | `0ms` | — | 按下要瞬时；150ms 才变深像点不动 |
| 扇区选中 | `150ms` | 同 hover | 与 hover 同速，状态迁移才连贯 |
| 盘心边框/底色 | `180ms` | `cubic-bezier(.4,0,.2,1)` | 比扇区慢 30ms，视线从扇区移到中心有个"到达"感 |
| 盘心换字 | `180ms` | `cubic-bezier(.2,0,.2,1)` | 位移 3px 的上浮，位移型缓动要更陡的起步 |
| 自动切题 | `620ms` | — | 180ms 过渡 + 约 440ms 停留。见下方实测 |
| 滑块 thumb | `120ms` | `cubic-bezier(.4,0,.2,1)` | 手指还按着，反馈必须跟手 |
| 惯性衰减 | 每帧 `×0.94` | — | 60fps 下约 1.1s 从 20°/帧 降到 0.35°/帧 |
| 吸附收敛 | 每帧 `×0.22` | — | 约 200ms 走完最后几度，比一次性归位柔和 |

### 扇区：hover / 按下 / 选中 三态

```css
.disc-svg .sector-shape {
  fill: var(--bg); stroke: var(--edge); stroke-width: 1;
  transition: fill 150ms cubic-bezier(.4,0,.2,1), stroke 150ms cubic-bezier(.4,0,.2,1);
}
.disc-svg .sector-g:hover .sector-shape,
.disc-svg .sector-g.is-hot .sector-shape { fill: var(--bg-2); stroke: var(--ink); }

/* 按下瞬时，不给过渡 */
.disc-svg .sector-g:active .sector-shape {
  fill: var(--bg-3); stroke: var(--ink); transition: none;
}

/* 选中：墨色实心。反差是最强状态信号，不需要发光 */
.disc-svg .sector-g.is-on .sector-shape { fill: var(--ink); stroke: var(--ink); }
```

### 拖拽旋转 · 惯性 · 吸附

**架构决策：旋转量只存在一个 CSS 变量上。** `--disc-rot` 写在 `.disc` 上，`.disc-rot` 用 `rotate(var(--disc-rot))` 整体转，6 个标签各自 `rotate(calc(-1 * var(--disc-rot)))` 反向抵消。每帧只写一次样式属性，不必逐个改 6 个标签的 transform。

```js
const state = { rot: 0, dragging: false, moved: false, startAngle: 0,
                lastAngle: 0, lastT: 0, vel: 0, raf: 0, pointerId: null };

const apply = (deg) => {
  state.rot = deg;
  root.style.setProperty('--disc-rot', `${deg.toFixed(2)}deg`);
};

// 屏幕上某点相对盘心的极角
const angleOf = (ev) => {
  const r = root.getBoundingClientRect();
  return Math.atan2(ev.clientY - (r.top + r.height / 2),
                    ev.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
};

root.addEventListener('pointerdown', (ev) => {
  if (ev.pointerType === 'mouse' && ev.button !== 0) return;
  stopRaf();
  Object.assign(state, { dragging: true, moved: false, pointerId: ev.pointerId,
    startAngle: angleOf(ev), startRot: state.rot,
    lastAngle: angleOf(ev), lastT: ev.timeStamp, vel: 0 });
});

root.addEventListener('pointermove', (ev) => {
  if (!state.dragging) return;
  const a = angleOf(ev);
  if (!state.moved && Math.abs(a - state.startAngle) < 2.2) return;  // ≈6px @ r=150
  if (!state.moved) {
    state.moved = true;
    root.setPointerCapture?.(state.pointerId);
    root.classList.add('is-dragging');
  }
  let delta = a - state.lastAngle;
  if (delta > 180) delta -= 360;      // 跨 ±180° 补正，否则瞬跳一整圈
  if (delta < -180) delta += 360;
  apply(state.rot + delta);
  const dt = ev.timeStamp - state.lastT;
  if (dt > 0) state.vel = delta * (16 / Math.max(dt, 8)) * 0.55;
  state.lastAngle = a; state.lastT = ev.timeStamp;
});
```

两段式收敛（先自由减速、慢下来再插值归位）：

```js
const settle = () => {
  stopRaf();
  const step = () => {
    if (Math.abs(state.vel) > 0.35) {          // 第一段：自由减速
      state.vel *= 0.94;
      apply(state.rot + state.vel);
      state.raf = requestAnimationFrame(step); return;
    }
    const target = Math.round(state.rot / stepDeg) * stepDeg;   // 第二段：吸到扇区中线
    const d = target - state.rot;
    if (Math.abs(d) < 0.15) { apply(target); state.raf = 0; return; }
    apply(state.rot + d * 0.22);
    state.raf = requestAnimationFrame(step);
  };
  state.raf = requestAnimationFrame(step);
};
```

**拖过就吞掉紧随的 click**，否则松手会顺手选中某个扇区：

```js
const endDrag = () => {
  state.dragging = false;
  root.classList.remove('is-dragging');
  if (state.moved) {
    const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
    root.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => root.removeEventListener('click', swallow, { capture: true }), 0);
  }
  settle();
};
```

### 盘心换字

```css
@keyframes hub-swap {
  from { opacity: 0; transform: translateY(3px); }
  to   { opacity: 1; transform: none; }
}
/* 只在文字真的变了才放：同一条上反复进出不该一直闪。
   is-swap 必须先移除再加，并强制一次 reflow —— 连续同值不会重播 keyframes。 */
.disc-hub.is-swap .hub-zh,
.disc-hub.is-swap .hub-desc { animation: hub-swap 180ms cubic-bezier(.2,0,.2,1) both; }
```

### 盘心三态：文案与类名

| 态 | 类名 | kicker | 主标题 | 底色 | 触发 |
|---|---|---|---|---|---|
| 空态 | `.is-idle` | `当前选择` | `还没选` | `--bg-2` 浅灰 | 进步骤时 `selectedId === null` |
| 悬停 | `.is-hover` | `正在看` | 该项名称 | `--bg` 白 | `mouseenter` / `focus` |
| 已选定 | `.is-picked` | `已选定` | 该项名称 | `--ink` 实心墨 | `click` / 回退到已选项 |

```js
const IDLE_KICK = '当前选择';   // 原「尚未选择」与下面「还没选」叠成两句同义话，删一层
const HOVER_KICK = '正在看';
const PICK_KICK  = '已选定';
const IDLE_DESC = narrow ? '点任意扇区' : '点扇区，或把指针移上去';
```

`IDLE_DESC` 从「点任意扇区，或先把指针移上去看看」收短到 11 字：16 字在 183px 的可用宽里会折出孤字行。

**`kind` 必须默认 `'pick'`。** `mouseleave` / `blur` 调 `showInHub(cur || null)` 时不传 `kind`，默认成 `undefined` 会让墨块退回浅色 —— 看起来像选择被取消了：

```js
function showInHub(it, kind = 'pick') {
  hub.classList.toggle('is-idle', !it);
  hub.classList.toggle('is-picked', !!it && kind === 'pick');   // 悬停只是预览，不压黑
  // ...
}
```

`changed` 比较要连 kicker 一起比，否则「空态 → 悬停同一项」时主标题没变、不触发换字动画，但 kicker 已经该变了。

**切题延迟必须大于「过渡时长 + 可读停留」。** 原先写 320ms，线上逐帧采样发现：

```
  46ms  is-picked  bg rgb(174,174,174)   ← 过渡中，还是浅灰
 181ms  is-picked  bg rgb(14,14,14)      ← 此刻才完全压黑
 324ms  is-picked  bg rgb(14,14,14)
 369ms  is-idle    bg rgb(245,245,245)   标题已变「主要在哪里用？」
```

180ms 的过渡在 t=181ms 才走完，320ms 的延迟让墨块只剩约 **45ms** 满墨可见 —— 用户看到的是闪一下，不是「已选定」。改 620ms 后满墨停留约 **420ms**。这个数字不是拍的：少了读不出状态，多了变成等待。

```js
const changed = hubZh.textContent !== nextZh;
// …写完文字…
if (changed) {
  hub.classList.remove('is-swap');
  void hub.offsetWidth;          // 强制 reflow，否则移除+添加在同一帧不重播
  hub.classList.add('is-swap');
}
```

### 生成中态

```js
function setBusy(btn, text) {
  if (!btn) return () => {};
  const old = btn.textContent, wasDisabled = btn.disabled;
  btn.textContent = text; btn.disabled = true; btn.classList.add('is-busy');
  return () => { btn.textContent = old; btn.disabled = wasDisabled; btn.classList.remove('is-busy'); };
}
```

```css
/* 保持墨底 —— 退成灰看起来像"不可用"而不是"正在做" */
.btn.is-busy { background: var(--ink); border-color: var(--ink);
               color: var(--bg); cursor: progress; }
.btn.is-busy::after {
  content: ''; display: inline-block; width: 3px; height: 3px;
  margin-left: 8px; background: var(--bg);
  animation: busy-dots 900ms steps(1, end) infinite;   /* Swiss 不做旋转 spinner */
}
@keyframes busy-dots {
  0%, 33%   { opacity: 1;   transform: translateX(0); }
  34%, 66%  { opacity: .35; transform: translateX(3px); }
  67%, 100% { opacity: .1;  transform: translateX(6px); }
}
```

---

## 第四步 · 移动端与首屏降级

### 降级规则（按优先级）

| 断点 | 触发 | 降什么 | 不降什么 |
|---|---|---|---|
| `prefers-reduced-motion: reduce` | 系统设置 | **完全不接管拖拽/惯性**（JS 层直接不进分支）；CSS 全局动效 0.001ms | 点选、键盘、盘心换字（内容仍更新） |
| `pointer: coarse` | 触屏 | **不启用拖拽**（见下方理由） | 点选、`touch-action: pan-y` 保证能滑页 |
| `max-width: 620px` | 手机 | `hub-zh` 22→17px、隐藏英文副标、角标内缩 3→2px、空态文案截短、内边距 14→10px | **盘心比例仍是 42.7%**（不降）、触控 56×44 下限、圆盘可点 |
| `max-height: 700px` + 宽 ≤620px | iPhone SE | 圆盘压到 `min(86vw,320px)`、`hub-zh` 16px、**隐藏 `hub-desc`** | **盘心比例仍是 42.7%**、中文主标签、角标 |
| `min-width: 621px` + `height ≤1000/820/740px` | 笔记本 | 圆盘 `62vh → 56/54/50vh`、盘心内边距 14→8px | 全部内容 |

### 为什么触屏不启用拖拽

手机圆盘占首屏大半。若在圆盘上设 `touch-action: none`，用户在圆盘范围内**完全无法滑动页面** —— 比"不能转盘"更糟的选择。所以：

```css
.disc { touch-action: pan-y; }        /* 手机：纵向仍可滚页 */
@media (pointer: fine) { .disc { touch-action: none; } }   /* 鼠标/触控笔：禁默认手势 */
```

JS 侧对应 `const coarse = matchMedia('(pointer: coarse)').matches;` 直接跳过拖拽绑定。**手机上点扇区就够了**，6–8 个扇区一屏全见，转盘只是锦上添花。

### 首屏实测（九档，`needScroll` 仅因页脚在折叠线以下）

```
1920×1080 disc 520 bottom 963/1080    1512×982 disc 520 bottom 815/982
1440×900  disc 504 bottom 799/900     1536×864 disc 484 bottom 779/864
1366×768  disc 415 bottom 682/768     1280×800 disc 432 bottom 700/800
1280×720  disc 360 bottom 601/720     1024×768 disc 415 bottom 682/768
768×1024  disc 520 bottom 947/1024
```

### 盘心不溢出（六档实测 `cornerOverInner`，负值 = 方角在内弧内）

```
桌面1440 -23.7   桌面1280x720 -17.0   iPhone14 -6.4
Android小屏 -5.9  iPhone5 -1.3        平板 -24.5
```

---

## 改动总表（问题—原因—改法—涉及文件）

| 优先级 | 问题 | 原因 | 改法 | 涉及文件 |
|---|---|---|---|---|
| **P0** | 盘心方框伸出圆盘轮廓（≤620px 时 +3.2px） | 盘心 42% 时方角 29.70% > 内弧 28.75% | `DISC.rIn` 138→146；盘心统一取内接正方形 42.7%，删掉窄屏 38%/40% 的覆盖 | `app.js:104`、`styles.css` `.disc-hub` |
| **P0** | 盘心说明文字在 1280×720 消失 | `-webkit-box` 作 flex 子项高度塌成 0 | `flex: none` + `max-height` | `styles.css` `.hub-desc` |
| **P0** | 盘心内容被撑爆（scrollH 138 > 120） | 百分比 padding 按父容器宽度算 | 全部改 px（4 档） | `styles.css` `.disc-hub` 各断点 |
| **P0** | 生成中按钮无反馈、可连点 | `onclick: finish` 无禁用 | `setBusy()` + `.is-busy` | `app.js` `finish()`、`styles.css` `.btn` |
| **P1** | 盘心「单薄」，像占位符 | 浅色方块体量压不住 504px 圆盘；三行字居中只占中间 73px，上下各空 57px | 不对称边框（上 2px 墨）+ 四角角标 + `space-between` 分带 + **已选定态整块压墨** + 悬停三通道 | `styles.css` `.disc-hub`、`app.js` `showInHub()` |
| **P1** | 圆盘不能拖拽旋转 | `app.js` 零 pointer 事件 | `--disc-rot` 单变量驱动 + 标签反向抵消 | `app.js` `buildDisc()`、`styles.css` `.disc-rot` |
| **P1** | 松手无惯性、无吸附 | — | 两段式：`×0.94` 衰减 → `×0.22` 收进 60° 整数倍 | `app.js` `settle()` |
| **P1** | 扇区没有按下态 | `:active` 只出现在 `.btn` | `:active` 转 `--bg-3`，`transition: none` | `styles.css` `.sector-g` |
| **P1** | 触屏在圆盘上无法滚页 | `touch-action: none` 一刀切 | 默认 `pan-y`，`pointer:fine` 才 `none` | `styles.css` `.disc` |
| **P2** | 扇区缓动用 `linear`，观感生硬 | — | 统一改 `cubic-bezier(.4,0,.2,1)` | `styles.css` `.sector-shape` |
| **P2** | 盘心换字无过渡 | 只改 textContent | `.is-swap` + `hub-swap` 180ms，带 reflow 强制重播 | `app.js` `showInHub()`、`styles.css` |
| **P2** | 滑块拖动无反馈 | thumb 无 `:active` | `scale(1.1)` + 转墨，120ms | `styles.css` `.scale input:active` |
| **P2** | 手机空态文案挤三行 | 长句塞进 130px 盘心 | 窄屏换「点任意扇区」 | `app.js` `IDLE_DESC` |
| **P2** | 惯性动效不受 `prefers-reduced-motion` 约束 | JS 的 rAF 绕过 CSS 媒体查询 | JS 层直接读 `matchMedia` 决定是否绑定 | `app.js` `buildDisc()` |

---

## 验证

**当前实测（2026-10-29 重跑，取代本节原先的 45/28 旧值）**：
```
test-scoring     106 PASS / 0 FAIL
test-render       69 PASS / 0 FAIL
test-contrast     33 PASS / 0 FAIL
test-compliance   10 PASS / 0 FAIL
qa-data           ✓
```

> 下面这张交互实测表写于轮盘 v2，其中 `④ 悬停`「盘心三通道（边框收墨 + 底色提亮 + 角标提不透明）」与 `⑧ 盘心六档 cornerOverInner` 的判据都已作废（角标已删、判据改为四角到圆心距离，见 D33）。`②③⑤⑦` 的拖拽 / 反旋 / 换字 / 结果页结论仍然成立。

交互实测（Edge headless + CDP，`Emulation.setDeviceMetricsOverride` 1440×900）：

```
① 结构     .disc-rot 存在，SVG 与标签都在层内，盘心在层外
② 拖拽     0° → 48°（拖拽中）→ 吸附到 180°，dev 0.00
③ 标签     --disc-rot = 45deg 时 .zh 包围盒 29.7×18 与 0deg 完全一致 → 文字始终正立
④ 悬停     盘心 border-left #767676→#0e0e0e、bg #f5f5f5→#ffffff，移开恢复
⑤ 换字     kicker →「正在看」，.is-swap 已挂上
⑥ 生成中   按钮文案「正在比对…」、disabled=true、bg rgb(14,14,14)、cursor progress
⑦ 结果     3 张卡正常渲染
⑧ 盘心     六档视口 cornerOverInner 全负、hubScrollOverflow 全 false
```

盘心三态实测（1440×900，等过渡结束 300ms 后读值）：

```
空态    cls="disc-hub is-idle"                kick="当前选择" zh="还没选" bg=rgb(245,245,245)
悬停    cls="disc-hub is-swap is-hover"       kick="正在看"   zh="清冷"   bg=rgb(255,255,255)
已选定  cls="disc-hub is-picked is-swap"      kick="已选定"   bg=rgb(14,14,14)
        zh=rgb(255,255,255)  kick=rgb(168,168,168)  desc=rgb(201,201,201)
```

---

# 第四轮补充（2026-10-29）

前三步的结论大半已被 `D32`–`D36` 推翻，这一节只写**现在仍然成立、且下一步还能拿去用**的部分。四列格式不变。

## 改动清单

| 优先级 | 问题 | 原因 | 改法 | 涉及文件 |
|---|---|---|---|---|
| **P0** | 窄屏展开态整页能左右晃 | `.sub-arm` 是 `inset:0` 满尺寸盒，绕中心转 θ 后**角**扫到圆外，把文档撑宽（360 实测 `l:-39 r:399`，`scrollWidth 401 > 360`） | 手臂改零宽轴：`inset:auto; left:50%; top:0; bottom:0; width:0`。方格位置一像素不变 | `_wheel4c.css` |
| **P0** | 盘心内容溢出圆盘（展开态 `hub-desc` +4.7px、`hub-go` 360 视口 +15.8px） | 一直用「矩形宽度 < 直径」判，但盘心是圆，越靠上下可用弦长越接近 0 | 按四角判：`allowW = 2×√(R² − (中心偏移+半高)²)`。`hub-desc` 收 96%、窄屏关掉重复出口 `.hub-go` | `_wheel4c.css` |
| **P1** | 中圈方格无悬停反馈 | `.sub-sq` 有 `:active` 没有 `:hover`，与外圈扇区语言不一致 | 补 `:hover`（`--bg-2` + 描边收墨）与 `:focus-visible` 同底色 | `_wheel4c.css` |
| **P1** | 盘心「换一个大类」按下无反馈 | `.hub-reset` 只有 `:hover` | 补 `:active { transform: translateY(1px) }` + reduced-motion 下取消 | `_wheel4c.css` |
| **P2** | 时长档位是两套账 | grep 源码得到 240ms，但被更高优先级覆盖，从没生效过 | 按 computed style 定档：**80 / 160 / 180 / 200 / 260 / 340**，220 并入 200 | `_wheel4c.css`、`_wheel4.css` |

## 四个「写了但不生效」的候选，以及为什么没写

审查交互触点时最容易犯的错是**看到 `:active` 缺席就补一段**。下面四个都查过，只有两个是真的：

| 候选 | 实测结论 | 处理 |
|---|---|---|
| `.disc-hub` | 基础规则 `pointer-events: none`，指针命中底层 `<svg>`，`:active` 恒 false | **不写**，注释钉死，防止下一个人再补 |
| 香调两栏标签 | 类名是 `.chip` 不是 `.head`；按 `.head` 写的那组 rebuild 后 `grep -c` 返回 **0** | **整段删除** |
| `.sub-sq:hover` | 真缺 | 补上 |
| `.hub-reset:active` | 真缺 | 补上 |

## 降级方案（第四步，仍然有效）

| 断点 | 盘心 | 标本线稿 | 说明文字 | 盘心按钮 |
|---|---|---|---|---|
| ≥ 621px | 展开态缩到 `.56` | 88px + 26px 分割线 + 12px 名字 | 两味名字 + 「等」 | 保留 |
| 481–620px | 缩到 `.60` | 48px，分割线隐藏 | 只留名字 | **隐藏**（底部栏已有同义出口） |
| ≤ 380px | 缩到 `.58` | 44px | 名字也隐藏，图形独自说话 | 隐藏，`gap` 收到 1px |

圆盘尺寸 `min(88vw, var(--discw), 62vh)`，四档 `max-height` 媒体查询保证九档视口全部首屏内。

## 交互反馈的触发条件与可见反馈（第三步，按实测值重写）

| 触点 | 触发 | 可见反馈 | 时长 / 缓动 |
|---|---|---|---|
| 外圈扇区悬停 | 指针进入 `.sector-g` | 填充 `--bg-2`、描边 `--ink` 2px、盘心同步换字 | 160ms `cubic-bezier(.4,0,.2,1)` |
| 中圈方格悬停 | 指针进入 `.sub-sq` | 底色 `#f5f5f5`、描边 `#0e0e0e`、文字转墨 | 160ms 同上 |
| 任意按钮按下 | `:active` | `translateY(1px)`，滑块 thumb `scale(1.12)` | **80ms** `cubic-bezier(.4,0,1,1)`（`--t-press`） |
| 键盘聚焦 | `:focus-visible` | `2px solid var(--blue)` + `outline-offset 2px`，方格同时补底色 | 即时 |
| 扇区切换 | 点选 | 340ms 圆盘缩放 `.56`、200ms 标签层淡出、180ms 盘心换字 | 见左 |
| 拖拽旋转 | `pointerdown` 拖动 | 整盘跟手，标签反向旋转保持正立 | 无过渡（跟手） |
| 松手 | `pointerup` | 角速度 `×0.94`/帧衰减 → 吸到最近 60° 整数倍 | rAF 驱动 |
| 生成中 | 点「看推荐」 | 按钮禁用、文案「正在比对…」、跳动方点 900ms | — |
| 空态 | 未选 | 盘心 `.is-idle`：深灰主词 + 「点任意扇区」 | — |
| 完成态 | 结果页 | 3 张卡 + 匹配度 + 三调 + 理由 | — |
| 减弱动效 | `prefers-reduced-motion` | JS 侧不绑惯性（`matchMedia` 在初始化读一次）；CSS 侧取消按下位移 | — |
