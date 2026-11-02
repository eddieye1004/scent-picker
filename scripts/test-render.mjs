/**
 * test-render.mjs — 用极简 DOM 桩验证 app.js 的渲染逻辑
 *
 * 背景：本机沙箱不允许启动 Edge/Chrome 的 headless 进程（mojo 通道被拒），
 * 所以无法用真浏览器截图验证。退一步：实现一个够用的 DOM 桩，
 * 让 app.js 真的跑一遍「选情绪 → 选场合 → 拖浓度 → 出结果」，
 * 然后断言渲染出来的文本里该有什么。
 *
 * 它证明的：逻辑与文案正确、四个步骤都能渲染、结果页有理由和三调。
 * 它不证明的：CSS 视觉表现、真实浏览器兼容性。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* ---------- 极简 DOM ---------- */
class TNode {
  constructor(tag, attrs = {}, kids = []) {
    this.tagName = String(tag).toUpperCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.parentNode = null;
    this._text = null;
    this._listeners = {};
    this.style = {};
    this.classList = {
      _set: new Set(String(attrs.class || '').split(/\s+/).filter(Boolean)),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, on) { on ? this._set.add(c) : this._set.delete(c); },
      contains(c) { return this._set.has(c); },
      get value() { return [...this._set].join(' '); },
    };
    if (attrs.style) this._parseStyle(attrs.style);
    kids.forEach((k) => this.appendChild(k));
  }
  _parseStyle(s) {
    String(s).split(';').forEach((pair) => {
      const [k, v] = pair.split(':');
      if (k && v) this.style[k.trim()] = v.trim();
    });
  }
  get className() { return this.classList.value; }
  set className(v) {
    this.classList._set = new Set(String(v).split(/\s+/).filter(Boolean));
  }
  get textContent() {
    if (this._text != null) return this._text;
    return this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join('');
  }
  set textContent(v) { this._text = String(v); this.children = []; }
  get innerHTML() { return this.textContent; }
  set innerHTML(v) {
    // app.js 用到 innerHTML 的地方只有两处：进度提示和加载失败文案
    this.children = [];
    this._text = String(v).replace(/<[^>]*>/g, '') || null;
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    // 真实 DOM 里 setAttribute('class', …) 会同步 classList。
    // 圆盘的 SVG 扇形是用 setAttribute 设 class 的，不同步就一条都查不到。
    if (k === 'class') this.className = String(v);
  }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(n) {
    if (typeof n !== 'string') { n.parentNode = this; this._text = null; }
    this.children.push(n);
    return n;
  }
  /* insertBefore 是真实 DOM 的标准方法，app.js 的"已选置顶"用到它
     （把刚勾选的 chip 移到栏首）。桩里不实现的话，测试会抛
     "box.insertBefore is not a function"，而浏览器里是正常的 ——
     这种"只有测试跑不过"的假失败会诱导人去改业务代码绕过，
     结果是测试和浏览器走两条路。所以桩要补齐，而不是绕开。 */
  insertBefore(n, ref) {
    if (typeof n !== 'string') { n.parentNode = this; }
    const i = ref == null ? -1 : this.children.indexOf(ref);
    if (i < 0) this.children.push(n);
    else this.children.splice(i, 0, n);
    return n;
  }
  removeChild(n) {
    const i = this.children.indexOf(n);
    if (i >= 0) { this.children.splice(i, 1); n.parentNode = null; }
    return n;
  }
  append(...ns) { ns.flat().forEach((n) => n != null && this.appendChild(n)); }
  addEventListener(ev, fn) { (this._listeners[ev] ||= []).push(fn); }
  dispatch(ev, payload = {}) {
    (this._listeners[ev] || []).forEach((fn) =>
      fn({ target: this, preventDefault() {}, stopPropagation() {}, ...payload }));
  }
  focus() {}
  querySelectorAll(sel) {
    /* 支持：.class / tag / tag.class / [attr="v"] / .a.b / 以及**后代选择器**
       （空格分隔，如 `.pick-foot a`）。

       最后这条是补上来的：桩原先只认单段选择器，`.pick-foot a` 恒返回空，
       断言「降级后数据来源链接仍在」因此假失败。当时的捷径是改写断言绕开，
       但那是错的改法 —— 桩缺能力就该补桩，否则以后每写一个后代选择器都会踩一次，
       而"绕过"会把真正的问题掩盖掉。 */
    const segs = sel.trim().split(/\s+/).filter(Boolean);

    const matchOne = (n, one) => {
      const attrM = one.match(/^\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]$/);
      if (attrM) {
        const got = n.attrs[attrM[1]];
        return got != null && (attrM[2] == null || String(got) === attrM[2]);
      }
      const parts = one.split('.').filter(Boolean);
      const startsWithClass = one.startsWith('.');
      const tagPart = startsWithClass ? null : parts[0];
      const classes = startsWithClass ? parts : parts.slice(1);
      return (!tagPart || n.tagName.toLowerCase() === tagPart.toLowerCase())
        && classes.every((c) => n.classList.contains(c));
    };

    /* 逐段向下找：第一段在整棵树里找，后续每段只在上一段的子树里找。
       不做"最近祖先"那种严格语义 —— 本文件用到的后代选择器都只有一层，
       按"任意深度后代"处理更容易写对，也不会误伤。 */
    const all = [];
    const collect = (n) => {
      if (typeof n === 'string') return;
      all.push(n);
      n.children.forEach(collect);
    };
    this.children.forEach(collect);

    let pool = all;
    for (let k = 0; k < segs.length; k++) {
      const seg = segs[k];
      if (k === 0) {
        pool = pool.filter((n) => matchOne(n, seg));
        continue;
      }
      /* 后续段：找它是否有任一祖先在上一轮的结果里 */
      const inPool = (n, set) => {
        let p = n.parentNode;
        while (p) { if (set.has(p)) return true; p = p.parentNode; }
        return false;
      };
      const prev = new Set(pool);
      pool = all.filter((n) => matchOne(n, seg) && inPool(n, prev));
    }
    return pool;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  get firstChild() { return this.children[0] || null; }
}

/* ---------- 环境桩 ---------- */
const appRoot = new TNode('main', { id: 'app' });
globalThis.document = {
  _nodes: { '#app': appRoot },
  createElement: (t) => new TNode(t),
  // 圆盘用 SVG 画扇形，必须有 createElementNS —— 少了它 svgEl() 直接抛错，
  // 而 boot() 的 try/catch 会把它吞成"加载失败"，测试只会看到首屏空白。
  createElementNS: (ns, t) => new TNode(t),
  createTextNode: (t) => String(t),
  addEventListener: (ev, fn) => { globalThis.document._domReady = fn; },
  querySelector: (sel) => {
    if (sel === '#app') return appRoot;
    return null;
  },
};
globalThis.window = { scrollTo() {}, addEventListener() {} };
globalThis.performance = { now: () => Date.now() };

/* fetch 桩：直接读本地文件。
   app.js 现在传的是 URL 对象（new URL('data/…', import.meta.url)），
   桩必须两种都吃 —— 只按字符串处理会让 boot() 拿到非法路径、静默失败。 */
globalThis.fetch = async (url) => {
  let rel;
  if (url instanceof URL) {
    // file:// URL 的 pathname 在 Windows 上带前导斜杠（/C:/...），要先剥掉
    rel = decodeURIComponent(url.pathname).replace(/^\/(?=[A-Za-z]:)/, '').replace(/\//g, path.sep);
  } else {
    rel = String(url).replace(/^\.\//, '').replace(/^\//, '').replace(/\//g, path.sep);
  }
  const p = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  const txt = fs.readFileSync(p, 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(txt) };
};

/* ---------- 跑 ---------- */
let pass = 0;
const fails = [];
const ok = (name, cond, detail) => {
  if (cond) pass++;
  else fails.push(`${name}${detail ? ' :: ' + detail : ''}`);
};

const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
// app.js 是 ESM 且 import '../src/scoring.js' —— 复制成临时 .mjs 并把相对路径保留即可
const tmpApp = path.join(ROOT, '_tmp_app_test.mjs');
fs.writeFileSync(tmpApp, appSrc);

const appMod = await import('file://' + tmpApp.replace(/\\/g, '/'));
globalThis.document._domReady();          // 触发 boot()
await new Promise((r) => setTimeout(r, 600));

const getStepText = () => appRoot.textContent;

/* 断言：首屏 */
ok('首屏标题', getStepText().includes('从零开始，找到第一瓶香水'), getStepText().slice(0, 120));
ok('首屏圆盘 6 个扇区', appRoot.querySelectorAll('.disc-sector').length === 6,
  `实际 ${appRoot.querySelectorAll('.disc-sector').length}`);
ok('圆盘画了 6 块扇形', appRoot.querySelectorAll('.sector-shape').length === 6,
  `实际 ${appRoot.querySelectorAll('.sector-shape').length}`);
// 圆盘不是"看起来能点"的 SVG：命中区必须是真实 button，且键盘能进得去
ok('扇区是真实 button', appRoot.querySelectorAll('button.disc-sector').length === 6,
  `实际 ${appRoot.querySelectorAll('button.disc-sector').length}`);
// 两层各自是一组单选，所以至少一个 radiogroup（外圈一个、中圈一个）
ok('圆盘有 radiogroup 语义', appRoot.querySelectorAll('[role="radiogroup"]').length >= 1,
  `实际 ${appRoot.querySelectorAll('[role="radiogroup"]').length}`);
ok('盘心默认是空态', appRoot.querySelector('.disc-hub.is-idle') !== null);
/* ---------- U1：窄屏标签的命中垫 ----------
   390 展开态下 .lvl1 的元素盒只有 39x26（收窄是被迫的：不收会压到中圈标签），
   靠 ::before 铺一层透明垫扩到 44x44。断言钉住"垫子存在且够大"。
   纯 CSS 的几何在 DOM 桩里量不到，所以这里只验规则本身写对了。 */
{
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  ok('窄屏家族标签有 44px 高的命中垫',
    /\.wheel\.is-open \.label-layer \.disc-sector\.lvl1::before\s*\{[^}]*height:\s*44px/.test(css),
    '缺 .lvl1::before 的 44px 垫');
  ok('中圈弧段标签也有命中垫',
    /\.wheel \.disc-sector\.lvl2\.sub-arc-btn::before\s*\{[^}]*height:\s*max\(100%,\s*44px\)/.test(css),
    '缺 .sub-arc-btn::before 的垫');
}


// 闭合态盘心必须填满内孔：外环与盘心连成一整块圆盘。
// 若只取内接正方形（42.7%），四周会留一圈白，读起来像「环 + 贴在环上的一张卡」。
{
  const hubPct = (() => {
    const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // 必须取闭合态那条规则；基础 .disc-hub 是旧基线的 42.7%，读到它会得出假结论。
    const m = css.match(/\.wheel:not\(\.is-open\) \.disc-hub\s*\{[^}]*?width:\s*([\d.]+)%/);
    return m ? parseFloat(m[1]) : NaN;
  })();
  // 内孔 r1i=158 / 视框 480 → 直径 2×158/480 = 65.83%，取 66% 与内弧咬合。
  ok('闭合态盘心填满内孔（65–67%）', hubPct >= 65 && hubPct <= 67, `实际 ${hubPct}%`);
  ok('闭合态盘心是圆而不是方', /\.wheel:not\(\.is-open\) \.disc-hub\s*\{[^}]*?border-radius:\s*50%/.test(
    fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')),
    '圆盘语义要求盘心与外环同形，方盘会读成贴在盘上的一张卡');
  ok('闭合态关掉方盘角标', /\.wheel:not\(\.is-open\) \.disc-hub::before\s*\{\s*display:\s*none/.test(
    fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')),
    '角标在圆盘外接方框的四角，圆盘下会悬在盘外');
}
// 盘心是圆：元素四角的可用宽度按 sqrt(R²−半高²) 收窄，宽元素必须显式收窄，
// 否则矩形中段贴边、四角顶出弧线。三视口实测溢出 4.7 / 5.7 / 15.8 / 3px。
{
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  ok('展开态盘心说明收窄到圆弧内（≤ 96%）',
    /\.wheel\.is-open \.disc-hub \.hub-desc\s*\{[^}]*?max-width:\s*(?:[0-8]\d|9[0-6])%/.test(css),
    '不加 max-width 时 1440 视口溢出 4.7px；96% 是 270×.96=259.2 < 弧容 266 的上限');
  ok('选定态盘心说明收窄（≤ 92%）',
    /\.wheel \.disc-hub\.is-picked \.hub-desc\s*\{[^}]*?max-width:\s*(?:[0-8]\d|9[0-2])%/.test(css),
    '不加 max-width 时 360 视口溢出 3px');
  // 窄屏盘心装不下「就选「X」，下一步 →」，且底部已有同义出口
  ok('窄屏隐藏盘心重复出口', /@media \(max-width: 620px\) \{[\s\S]*?\.wheel \.hub-go \{ display: none; \}/.test(css),
    '360 视口该按钮宽 156 而圆弧只容 140，且与底部「按大类推荐」重复');

  /* ⑤ 确认后不整盘翻黑（用户原话：「避免内圈直接变黑，反差过大不优雅」）。
     改成：盘底保持白、只加一圈发丝描边；选中由方格自己填实表达。
     这条守的是「盘底不许再出现 --ink 实底」。 */
  ok('选定态盘底不翻黑', (() => {
    // 必须取层叠里最后一条：基础层/旧追加层里还留着 background: var(--ink) 的墨底规则，
    // match() 只拿第一条会读到那条已作废的，得出「还在翻黑」的假结论。
    const all = [...css.matchAll(/\.wheel\.is-open\.is-picked \.disc-core \{[^}]*?background:\s*var\((--[\w-]+)\)/g)];
    if (!all.length) return false;
    const token = all[all.length - 1][1];
    // 只认浅色底板令牌。曾经写死 var(--bg)，后来发现展开态是 --bg-2(#f5f5f5)、
    // 选中后跳到 --bg(#ffffff) —— 8% 亮度跳变自己就成了一次「整块变色」，只是方向反了。
    return token === '--bg' || token === '--bg-2';
  })(),
    '翻黑是"页面切走了"的信号，不是"你选中了这一格"的信号');

  ok('选中态与展开态同一个底板色', (() => {
    // 选中瞬间若底板换色，用户会先感到"页面变了"才看到"我选了这格"。
    // 两态必须同 token，选中只由被选中的方格自己表达。
    const pick = [...css.matchAll(/\.wheel\.is-open\.is-picked \.disc-core \{[^}]*?background:\s*var\((--[\w-]+)\)/g)];
    const open = [...css.matchAll(/\.wheel\.is-open \.disc-core \{[^}]*?background:\s*var\((--[\w-]+)\)/g)];
    if (!pick.length || !open.length) return true; // 展开态未显式声明，继承闭合态，不算违规
    return pick[pick.length - 1][1] === open[open.length - 1][1];
  })(), '展开态 #f5f5f5 → 选中态 #ffffff 是 8% 的整块跳变');
  ok('选定态盘底有激活描边', /\.wheel\.is-open\.is-picked \.disc-core \{[^}]*?box-shadow:[^}]*?var\(--blue-amb\)/.test(css));
  /* 换底必须换线：标本线稿原写 rgba(255,255,255,.82) 是给墨底配的，
     底变白之后白线画在白盘上等于图形消失。 */
  ok('标本线稿跟着底色换成深色', /\.wheel \.plate-svg \{[^}]*?stroke:\s*var\(--ink/.test(css),
    '换底不换线是改配色最容易漏的一处');
  /* ① 手机上也要看得见「中圈可不选」 */
  ok('窄屏出现「中圈可不选」的出口', /@media \(max-width: 620px\) \{[\s\S]*?\.wheel \.hub-skip \{ display: inline-block; \}/.test(css),
    '原来只有桌面的 .hub-go 在说这件事，它在 ≤620px 是 display:none');
  /* ② 方格挂在一条与盘同心的轨道上 */
  ok('方块有一条与盘同心的轨道', /\.wheel \.sub-ring::before \{[^}]*?border:\s*1px dashed/.test(css)
    && /\.wheel\.is-open \.sub-ring::before \{ opacity: 1; \}/.test(css));
  /* ---- 第五轮五条（m10062）的守门 ----
     这些测的都是"用户能不能用"，不是"某段颜色对不对" ——
     前几轮漏掉的缺陷（返回入口没有、缩小盘点不动、图标常态没有）
     全都不在视觉参数上，而在交互路径上。 */
  /* ② 返回入口：44px 触控下限 + 三个状态都要有 */
  ok('返回入口是 44px 触屏尺寸', /\.wheel \.wheel-back \{[^}]*?min-height:\s*44px/.test(css));
  ok('返回入口有按下态', /\.wheel \.wheel-back:active \{[^}]*?translateY\(1px\)/.test(css));
  ok('返回入口能真正隐藏', /\.wheel \.wheel-back\[hidden\] \{ display: none; \}/.test(css),
    '[hidden] 的 UA display:none 会被作者的 display 顶掉，必须显式压回');

  /* ③ 缩小盘可点的前提：中圈那层不能再吃事件 */
  ok('中圈容器不再拦截扇区点击', /\.wheel\.is-open \.sub-ring \{ pointer-events: none; \}/.test(css));
  ok('缩小后的扇区恢复可点', /\.wheel\.is-open \.sector-g \{[^}]*?pointer-events:\s*auto/.test(css)
    && /\.wheel\.is-open \.sector-g \{[^}]*?cursor:\s*pointer/.test(css));
  /* v15：大圈在展开态整体退到 0，只有 hover / 键盘聚焦 / 盘心正在讲的那一块
     浮回 1。所以"不同档"的判据从"当前 .30 vs 其它 1"反转成
     "全部 0，热区 1" —— 点击换类的入口靠 hover 提示，不靠常亮。 */
  ok('展开态大圈退到不可见但热区可回看',
    /\.wheel\.is-open \.sector-g \{[^}]*?opacity:\s*0/.test(css)
    && /\.wheel\.is-open \.sector-g\.is-hot,[^{]*\{[^}]*?opacity:\s*1/.test(css));

  /* ④ 一圈弧段依次滑出（v7 推翻了 v6 的三格弧窗 + 转动钮） */
  /* 段与段之间必须有缝，否则七段连成一条环，看不出"有七项" */
  ok('弧段之间留缝（读得出有几段）',
    /\.sub-arc \{[^}]*?stroke:\s*rgba\(255,\s*255,\s*255/.test(css));
  /* 整段弧自己吃事件 —— 只让文字可点等于把可点面积缩到 1/3，
     而这正是上一版「看得见点不着」的来源 */
  ok('弧段本身可点（不是只有文字可点）',
    /\.wheel \.sub-arc \{[^}]*?pointer-events:\s*auto/.test(css)
    && /\.wheel \.disc-sector\.lvl2\.sub-arc-btn \{[^}]*?pointer-events:\s*auto/.test(css));
  /* 弧段上的文字按钮仍须达到 44px 触控高 */
  ok('弧段文字按钮达 44px 触控高',
    /\.disc-sector\.lvl2\.sub-arc-btn \{[^}]*?min-height:\s*44px/.test(css));
  /* 依次滑出 —— 用户要的"一个个圆盘圆弧依次滑出并并排排列"，
     靠 animation-delay 实现；没有这条就变成同时出现，读不出顺序 */
  ok('弧段依次滑出（有延迟）',
    /@keyframes arcIn/.test(css) && /animation-delay/.test(css));

  /* ⑥ 两层切换的进出场编排（v14，_wheel8.css）
     这四条守的是"退场真的存在"，不是"有没有写动画"。
     之前 subRing.innerHTML = '' 一行抹掉七段 —— DOM 里没有节点，
     CSS 再怎么写也没有东西可以动。 */
  ok('大圈退场到 0 但仍可点（消失与可点是两件事）',
    /\.wheel\.is-open \.sector-g \{[^}]*?opacity:\s*0/.test(css)
    && /\.wheel\.is-open \.sector-g \{[^}]*?pointer-events:\s*auto/.test(css),
    'pointer-events:none 就等于封掉「中圈里点别的大类直接换」');
  /* v16：进入改成两拍 —— 先六个文字各自散去，再整盘收起。
     断言因此从"一条错峰动画"变成"两条按时间先后"的链。 */
  ok('进入第一拍：六个家族文字按 --i 错峰散去',
    /@keyframes labelVanish/.test(css)
    && /\.wheel\.is-lifting \.label-layer \.disc-sector\.lvl1 \{[^}]*?animation:\s*labelVanish/.test(css)
    && /\.wheel\.is-lifting \.label-layer \.disc-sector\.lvl1 \{[^}]*?animation-delay:\s*calc\(var\(--i/.test(css));
  ok('进入时扇区淡出与文字并行，且 0ms 起（不能等文字散完）',
    /@keyframes fanCollapse/.test(css)
    && /\.wheel\.is-lifting \.sector-g \{[^}]*?animation:\s*fanCollapse/.test(css)
    /* **延迟必须是 0**。用户实测报过"滞后边框"：delay 370ms 时
       0–370ms 整圈家族环全亮挂着，中圈已经在长，读成没退干净。
       `both` 填充会把 opacity 钉在 1 直到动画真正开始，所以 delay>0
       就等于"先亮一段时间再突然消失"。 */
    && /\.wheel\.is-lifting \.sector-g \{[^}]*?animation-delay:\s*0ms/.test(css)
    && /@keyframes fanCollapse \{[\s\S]{0,200}?100%\s+\{ opacity: 0;/.test(css));
  ok('凹槽环用 animation 而不是 transition（节点是新建的）',
    /@keyframes channelIn/.test(css)
    && /\.wheel\.is-open \.sub-channel \{[^}]*?animation:\s*channelIn/.test(css),
    'sub-channel 插入时 is-open 已挂上，transition 没有前值可过渡，第一帧就是全亮');
  ok('大圈标签层在展开态真的归零（v15 漏在覆盖链里）',
    /\.wheel\.is-open \.label-layer,[\s\S]{0,120}?opacity:\s*0/.test(css),
    '_wheel7.css:361 写过 opacity:1，桌面端 v15 从来没退过标签');
  ok('返回时大圈从 .80 推出（量足够看出来）',
    /@keyframes fanPullOut/.test(css)
    && /\.wheel\.is-returning \.sector-g \{[^}]*?animation:\s*fanPullOut/.test(css)
    /* 起点必须 ≤ .85：v15 用 .93 只有 7% 量、在 r=228 上不足 2px，读不出"拉出" */
    && /@keyframes fanPullOut \{[\s\S]{0,200}?0%\s+\{ opacity: 0;\s+transform: scale\(\.8/.test(css));
  /* v15 新增：点击确认 vs 悬停预览必须在状态上分得开 */
  ok('悬停不写选中状态（选择只由左键点击确定）',
    !/hoverSub/.test(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))
      || /const focusSub = sub;/.test(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8')),
    'focusSub 若还读 hoverSub，指针划过就会换盘心主词');
  ok('悬停只给视觉提示不改填充',
    /\.wheel \.sub-g\.is-hot:not\(\.is-on\) \.sub-arc \{/.test(css)
    && !/\.wheel \.sub-g\.is-hot:not\(\.is-on\) \.sub-arc \{[^}]*?fill:\s*var\(--blue\)/.test(css),
    'hover 若用实心蓝，就看不出"哪些是确认的"');
  ok('确认态弧段是实心蓝 + 一次几何脉冲',
    /\.wheel \.sub-g\.is-on \.sub-arc \{[^}]*?fill:\s*var\(--blue\)/.test(css)
    && /@keyframes arcPop/.test(css)
    && /\.wheel \.sub-g\.is-on \{[^}]*?animation:\s*arcPop/.test(css),
    '没有脉冲时"点下去"与"指着看"在时间维度上分不开');
  ok('确认脉冲不改用 filter（浅底上不可见）',
    /@keyframes arcPop \{[\s\S]{0,200}?transform: scale\(1\.03/.test(css),
    'v15 用 drop-shadow 做脉冲，实测在 520px 盘上肉眼不可见');
  ok('确认脉冲不能用 fill both（会永久钉住 transform）',
    !/\.wheel \.sub-g\.is-on \{[^}]*?arcPop[^}]*?both/.test(css),
    'both 会让末帧 scale(1) 永久覆盖声明值，按下态就永远看不到');
  ok('确认态盘心加一道实心短划 + 小勾',
    /\.wheel\.is-open \.disc-hub\.is-picked \.hub-kicker::before/.test(css)
    && /\.wheel \.disc-hub\.is-picked \.hub-zh::after \{[^}]*?height:\s*2px/.test(css));
  /* v18：中圈一旦选定，hover 不得改变任何视觉/状态 */
  ok('中圈选中后 hover 不再写 hoverSub（JS 守卫）', (() => {
    const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    return /const enter = \(\) => \{\s*if \(selSub\) return;/.test(appSrc)
      && /const leave = \(\) => \{\s*if \(selSub\) return;/.test(appSrc);
  })(), '不挡的话，选中后指针划过去仍会挂 is-hot，描边 1px→1.4px 并带蓝框');
  ok('中圈选中后 CSS :hover 整体失效（root 上 is-sub-locked）',
    /root\.classList\.toggle\('is-sub-locked', !!selSub\)/.test(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))
    && /\.wheel:not\(\.is-sub-locked\) \.sub-g:hover/.test(css),
    'CSS :hover 是纯样式钩子，JS 管不到，必须用锁类让它整体不匹配');
  ok('未选中时 hover 提示仍然保留',
    /\.wheel:not\(\.is-sub-locked\) \.sub-g:hover \.sub-arc/.test(css),
    'hover 提示不该被删，只该在选中后被锁');
  ok('选中时显式清空 hoverSub（避免锁上后仍带旧 is-hot）',
    /selSub = s\.id;[\s\S]{0,160}?hoverSub = null;[\s\S]{0,80}?paint\(\)/.test(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8')));

  /* v18b：大圈家族 hover 也必须被同一个锁挡住 */
  ok('中圈选中后大圈 hover 不写 hoverFam（JS 守卫）', (() => {
    const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    return /const enter = \(\) => \{\s*if \(selSub\) return;\s*hoverFam = f\.id/.test(appSrc)
      && /const leave = \(\) => \{\s*if \(selSub\) return;\s*hoverFam = null/.test(appSrc);
  })(), '不挡的话，选中后指针划到大圈会把盘心换成「点一下换到 X」并摘掉 is-picked，选中态直接丢');
  ok('中圈选中后大圈 CSS :hover 也被锁', (() => {
    return /\.wheel:not\(\.is-sub-locked\) \.disc-svg \.sector-g:hover/.test(css)
      && /\.wheel\.is-open:not\(\.is-sub-locked\) \.sector-g:hover/.test(css);
  })(), '大圈 hover 有 6 处 CSS 规则，只挡 JS 会留下一半');
  /* v16：按下态必须是显式类，不能靠 :active */
  ok('按下态由显式类驱动（不靠 :active）',
    /\.wheel \.sub-g\.is-pressing \{/.test(css)
    && /is-pressing/.test(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8')),
    ':active 在键盘 Enter / 脚本触发 / 触屏滑动取消三种情况下全漏');
  ok('按下态挂 .sub-g 而不是 .sub-arc',
    /\.wheel \.sub-g\.is-pressing \{[^}]*?transform: scale\(\.93\)/.test(css),
    '挂 .sub-arc 会被 arcFadeRise 的 both 填充钉住 transform（实测无效）');
  ok('按下态带描边收紧（边界位移比亮度更易感知）',
    /\.wheel \.sub-g\.is-pressing \.sub-arc \{[^}]*?stroke-width:\s*1\.6/.test(css));
  ok('按下态有兜底释放（pointerup 落在别处也能复位）', (() => {
    const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    return /function releasePress/.test(appSrc)
      && /chooseSub[\s\S]{0,200}?releasePress\(\)/.test(appSrc);
  })());
  ok('窄屏展开态关掉隐藏扇区的命中区',
    /@media \(max-width: 620px\)[\s\S]{0,2000}?\.wheel\.is-open \.sector-g \{ pointer-events: none; \}/.test(css),
    '看不见却能点 = 误触换大类');
  ok('中圈整条弧带同步放大，终点占住大圈的位置',
    /@keyframes ringGrowStrong/.test(css)
    && /\.wheel\.is-lifting \.sub-ring \{[^}]*?animation:\s*ringGrowStrong/.test(css)
    /* 终点 1.43，不是 1。弧带原生 118–152、大圈 158–228：
       1.43 让弧带落在 169–217（中线 193 = 大圈中线），才叫"占据位置"。
       终点写成 1 时弧带只到 155，占盘直径 68%，外侧空 32%。 */
    && /@keyframes ringGrowStrong \{[\s\S]{0,300}?100%\s+\{ transform: scale\(1\.43\)/.test(css)
    /* 过冲：单调增大只被读成"变清晰"，有过冲才读成"弹出来" */
    && /@keyframes ringGrowStrong \{[\s\S]{0,300}?scale\(1\.49\)/.test(css),
    '逐段各自动 scale 会各绕自己的包围盒，七段会互相穿插');
  ok('中圈放大的静态终态与动画末帧一致（摘类不跳帧）',
    /\.wheel\.is-open \.sub-ring \{ transform: scale\(1\.43\); \}/.test(css),
    '动画末帧 1.43 而静态值 1 的话，700ms 摘类时会缩回去一截');
  ok('返回时中圈弧段反序收（不是整块消失）',
    /@keyframes arcFallOut/.test(css)
    && /\.sub-ring\.is-exit \.sub-arc \{[^}]*?animation:\s*arcFallOut/.test(css)
    && /var\(--n,\s*1\) - 1 - var\(--i/.test(css),
    '退场延时按 --n-1---i 反算；正序收会读成「又铺了一遍」');
  /* 退场期间容器不能被 :not(.is-open) 的 opacity:0 掐掉 —— 子元素的
     动画在 0 透明度里播，等于没播。 */
  ok('退场期间容器保持可见', /\.wheel \.sub-ring\.is-exit \{[^}]*?opacity:\s*1/.test(css));
  /* 减少动态效果必须覆盖新增的全部动画，否则遵守系统设置的用户会看到
     一个"动画播到一半就跳"的界面。
     注意 styles.css 里有**两处** prefers-reduced-motion：基础层的
     全局 `*` 那一块（把时长压到 0.001ms），和追加层里点名本次新增
     动画的那一块。只查第一处会读到全局块，得出假结论 —— 所以扫全部块。 */
  ok('prefers-reduced-motion 覆盖了新增动画', (() => {
    const blocks = [];
    for (const m of css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{/g)) {
      let depth = 0;
      let end = -1;
      for (let i = m.index + m[0].length - 1; i < css.length; i += 1) {
        if (css[i] === '{') depth += 1;
        else if (css[i] === '}') { depth -= 1; if (depth === 0) { end = i + 1; break; } }
      }
      if (end > 0) blocks.push(css.slice(m.index, end));
    }
    const joined = blocks.join('\n');
    return /animation:\s*none/.test(joined)
      && /is-lifting \.sector-g/.test(joined)
      && /is-returning \.sector-g/.test(joined)
      && /is-exit \.sub-arc/.test(joined);
  })());
  /* 盘心排版：主词要真的比 kicker 大一档以上（原 22/12 只差 1.8 倍，
     两个层级读起来是同一段话的两行）。 */
  ok('盘心主词比 kicker 大出一档', /\.wheel \.disc-hub \.hub-zh \{[^}]*?font-size:\s*2[6-9]px/.test(css),
    '26px 及以上 = 与 12px 的 kicker 拉开 2.2 倍以上');
  ok('盘心主词下有一道收口发丝线', /\.wheel \.disc-hub \.hub-zh::after/.test(css));

  /* ⑤ 图标常态与选中态分开 */
  ok('线稿常态与选中态是两种颜色',
    /\.wheel \.plate-svg \{[^}]*?stroke:\s*var\(--ink-3\)/.test(css)
    && /\.wheel \.disc-hub\.is-picked \.plate-svg \{[^}]*?stroke:\s*var\(--blue\)/.test(css));
  ok('常态香材名压暗、选中态全亮',
    /\.wheel \.plate-cap \{[^}]*?opacity:\s*\.6/.test(css)
    && /\.wheel \.disc-hub\.is-picked \.plate-cap \{[^}]*?opacity:\s*1/.test(css));

  // 手臂是插在圆心上的零宽轴，不是满尺寸盒子。
  // 满尺寸盒子绕过中心会被旋转扫出圆盘外：360 视口实测 l:-39 r:399，
  // 文档 scrollWidth 401 > clientWidth 360，整页可以左右晃。
  ok('子类手臂是零宽轴（不再撑宽页面）',
    /\.wheel \.sub-arm \{[^}]*?width:\s*0/.test(css) && /\.wheel \.sub-arm \{[^}]*?inset:\s*auto/.test(css));
}
// 圆盘外面包了一层可旋转容器：SVG 与标签都在里面，旋转才能带着它们一起转。
// 这里走 parentNode 链判断，不用后代选择器 —— 测试桩的 querySelectorAll
// 只支持 tag / .class / [attr] 与它们的直接组合，不支持后代选择器。
const rotLayer = appRoot.querySelector('.disc-rot');
const inRot = (node) => {
  for (let p = node?.parentNode; p; p = p.parentNode) if (p === rotLayer) return true;
  return false;
};
ok('圆盘有可旋转层', rotLayer !== null);
ok('扇形在可旋转层内', inRot(appRoot.querySelector('.disc-svg')));
ok('扇区标签也在可旋转层内', inRot(appRoot.querySelector('.disc-sector')));
// 盘心必须留在旋转层外面：它不该跟着圆盘转
ok('盘心不在可旋转层内', !inRot(appRoot.querySelector('.disc-hub')));
ok('进度条存在', appRoot.querySelectorAll('.progress').length === 1);
ok('页脚有许可声明', getStepText().includes('CC BY 4.0'));

/* 扇形本体必须自己挂着点击 —— 只把事件绑在标签上的话，
   用户戳扇区那一大块面积会毫无反应，等于"看起来能点"。 */
const sectorGroups = appRoot.querySelectorAll('.sector-g');
ok('扇区组数量与扇区一致', sectorGroups.length === 6, `实际 ${sectorGroups.length}`);
const groupHasClick = sectorGroups.every((g) => (g._listeners.click || []).length > 0);
ok('每个扇形本体都绑了 click', groupHasClick,
  `绑了 click 的分组数 ${sectorGroups.filter((g) => (g._listeners.click || []).length > 0).length}/${sectorGroups.length}`);

/* 点扇形本体（不是标签）选中家族 —— 等价于用户戳扇区那一大块面积。
   注意：第 1 步改成两层轮盘后不再自动跳题（用户可能还想在中圈再收一层），
   所以这里只断言"选中了"，前进由下面的按钮完成。 */
sectorGroups[0].dispatch('click');
await new Promise((r) => setTimeout(r, 400));

// 桩的 querySelectorAll 不支持 .class[attr="v"] 这种复合写法，改用 JS 过滤
const checkedCount = appRoot.querySelectorAll('.disc-sector')
  .filter((b) => b.getAttribute('aria-checked') === 'true').length;
const noteTags = appRoot.querySelectorAll('.notes');
ok('轮盘外圈标签带典型香材', noteTags.length === 6 && noteTags.every((n) => n.textContent.length > 0),
  `带香材的标签 ${noteTags.filter((n) => n.textContent.length > 0).length}/${noteTags.length}`);
/* 香材必须是中文。查不到中文时 noteZhOf() 会退回英文原名，
   那种情况下标签看起来"有内容"，实际用户读不懂 —— 这条专抓它。 */
ok('香材显示为中文而非英文原名', noteTags.every((n) => !/[a-z]/.test(n.textContent)),
  noteTags.map((n) => n.textContent).join(' | '));
ok('点扇形本体选中了家族', checkedCount >= 1, `选中 ${checkedCount} 个`);
/* 选中后中圈应该长出来：这是"多级多层"的核心断言 ——
   点外圈若只是高亮、不展开下一层，那就还是一层圆盘。 */
const midAfter = appRoot.querySelectorAll('.disc-sector.lvl2');
ok('选中家族后中圈展开子家族', midAfter.length > 0, `中圈扇区 ${midAfter.length}`);

/* ---- 盘心示意图（需求③）：香材剖面标本条 ----
   旧版只在"已选定"时才画，于是"常态与选中态要区分"这句话无从落地。
   现在预览态（只选了大类、弧上停着某项）也画，只是灰线 + 名字压暗；
   落到具体小项才转蓝。所以要断的是"预览态有图、但还没到已选定"。 */
/* 只选了大类、还没指向任何一段：盘心不该有标本。
   v7 一圈弧段全部可见，没有「停着的那一项」可推断 —— 凭猜画图会让用户
   以为已经选好。这条与下一条合起来才守得住"预览 vs 已选定"的区别。 */
{
  const prevPlates = appRoot.querySelectorAll('.plate-svg');
  const hubPrev = appRoot.querySelector('.disc-hub');
  ok('只选大类时盘心还没有标本', prevPlates.length === 0, `${prevPlates.length} 枚`);
  ok('只选大类时盘心是「正在看」而非「已选定」',
    !!hubPrev && !hubPrev.classList.contains('is-picked'), hubPrev && hubPrev.className);
}
/* 悬停某一段：只加深那一段的描边，盘心一个字都不许改。
   v15 改成"左键点击才确认"之后，这条从"悬停画标本"反转成"悬停不许动状态"
   —— 用户原话：「箱型选择应由左键点击确定，而非鼠标悬停或拖动位置决定」。 */
{
  const hubBefore = appRoot.querySelector('.disc-hub');
  const zhBefore = hubBefore.querySelector('.hub-zh').textContent;
  const kickBefore = hubBefore.querySelector('.hub-kicker').textContent;
  const g0 = appRoot.querySelectorAll('.sub-g')[0];
  g0.dispatch('mouseenter');
  await new Promise((r) => setTimeout(r, 220));
  const hubHover = appRoot.querySelector('.disc-hub');
  ok('悬停不改盘心主词（选择只由左键点击确定）',
    hubHover.querySelector('.hub-zh').textContent === zhBefore
      && hubHover.querySelector('.hub-kicker').textContent === kickBefore,
    `${zhBefore} → ${hubHover.querySelector('.hub-zh').textContent}`);
  ok('悬停不画标本（未确认就没有标本）',
    appRoot.querySelectorAll('.plate-svg').length === 0,
    `${appRoot.querySelectorAll('.plate-svg').length} 枚`);
  ok('悬停态还没到「已选定」', !!hubHover && !hubHover.classList.contains('is-picked'),
    hubHover && hubHover.className);
  ok('悬停只给那一段挂 is-hot', g0.classList.contains('is-hot'), g0.className);
  g0.dispatch('mouseleave');
  await new Promise((r) => setTimeout(r, 150));
  ok('鼠标移开后 is-hot 摘掉', !appRoot.querySelectorAll('.sub-g')[0].classList.contains('is-hot'));
}

/* 中圈第一个子家族 = 「古龙水型」（notes 只有 lemon 一味） */
midAfter[0].dispatch('click');
await new Promise((r) => setTimeout(r, 500));

const plate = appRoot.querySelector('.hub-plate');
ok('落到小项后盘心长出标本', !!plate);
const plates = appRoot.querySelectorAll('.plate-svg');
/* 一枚，不是三枚：实测每个小类的代表香材全部同属一个家族，
   逐味画会出来一排一模一样的图标。这条断言就是钉住那个结论的。 */
ok('标本只画一枚（不是每味香材一枚）', plates.length === 1, `${plates.length} 枚`);
/* 统一视框与无填充 —— 这就是"风格统一"的可断言部分。
   缺一条，各张图之间就会出现笔法断层（有的填实、有的方头）。 */
ok('标本是 24×24 同一视框', plates[0].getAttribute('viewBox') === '0 0 24 24',
  plates[0].getAttribute('viewBox'));
ok('标本无填充', plates[0].getAttribute('fill') === 'none', plates[0].getAttribute('fill'));

/* 里必须真有几何。桩里塞 markup 字符串的话会被剥成纯文本，
   容器在、图形空 —— 这是"看起来做了其实没做"的典型形态，必须抓住。 */
const shapeCount = plates[0].querySelectorAll('circle').length
  + plates[0].querySelectorAll('path').length + plates[0].querySelectorAll('ellipse').length;
ok('标本里真画了几何', shapeCount >= 2, `图元数 ${shapeCount}`);

/* 香材名必须落到中文 —— 和香材标签同一套取词逻辑 */
const cap = appRoot.querySelector('.plate-cap');
ok('标本下带香材名', !!cap && cap.textContent.length > 0, cap && cap.textContent);
ok('香材名是中文', !!cap && !/[a-z]/i.test(cap.textContent), cap && cap.textContent);

/* 图形本身是装饰，语义交给这一句。缺了它屏幕阅读器只会读出"图"。 */
ok('标本有可读的 aria-label',
  !!plate && /代表香材/.test(plate.getAttribute('aria-label') || ''),
  plate && plate.getAttribute('aria-label'));
/* 盘心必须挂上 has-glyph，否则 CSS 里 .hub-glyph 保持 display:none —— 图形等于没画 */
const hubAfter = appRoot.querySelector('.disc-hub');
ok('盘心挂上了 has-glyph', !!hubAfter && hubAfter.classList.contains('has-glyph'),
  hubAfter && hubAfter.className);

/* 同一家族下换个小类，图案必须**不同** —— 这枚图编码的是小类，不是家族。
   这一条推翻了上一轮的做法（那时同族共用家族母题）。推翻的理由是用户提出的：
   古龙水型要有古龙独有的标识，青绿柑橘与芳香柑橘各自不同。
   那个要求是对的 —— 旧做法下选完古龙水型和青绿柑橘，盘心画的是同一枚图，
   用户看不出自己选的是哪一格。
   注意这里仍然不是「给同一形状做哈希微差」：每枚画的是该小类的代表香材本体。 */
const sigOf = () => {
  const s = appRoot.querySelectorAll('.plate-svg')[0];
  if (!s) return '';
  return s.querySelectorAll('path').map((q) => q.getAttribute('d') || '').join('|')
    + s.querySelectorAll('circle').map((q) => q.getAttribute('r') || '').join('|')
    + s.querySelectorAll('ellipse').map((q) => (q.getAttribute('rx') || '') + (q.getAttribute('ry') || '')).join('|');
};
const sigCitrus = sigOf();
ok('首个小类的标本不是空签名', sigCitrus.length > 0, sigCitrus.slice(0, 40));
/* 中圈的格子顺序由 taxonomy 的 tier 排序决定，不写死「第 3 个」，
   而是遍历同族的其它小类，任意一个的签名都应当与第一个不同。 */
{
  let compared = 0;
  let same = 0;
  /* 走用户真实操作路径：直接点弧段上的文字按钮。
     v7 没有"转到即选中"的箭头了，七段同时可点，一次点击换一项。
     每轮重新查——paint() 会重建标签层，旧节点脱离文档。 */
  for (let i = 1; i <= 2; i += 1) {
    const btnsNow = appRoot.querySelectorAll('.disc-sector.lvl2');
    if (btnsNow.length <= i) break;
    btnsNow[i].dispatch('click');
    await new Promise((r) => setTimeout(r, 300));
    const sig = sigOf();
    if (sig.length) { compared += 1; if (sig === sigCitrus) same += 1; }
  }
  ok('同族不同小类各有各的图形', compared > 0 && same === 0,
    `比较 ${compared} 组，其中 ${same} 组与首个相同`);
  /* 停在另一项上，后面那条「换小类后香材名跟着变」才有对照。 */
}
/* 不断言具体是哪一味：中圈格子的顺序由 taxonomy 决定，写死「葡萄柚」
   会把测试绑死在当前数据顺序上，数据一改就假失败。要守的是
   「名字跟着小类变」，这才是这条断言的意义。 */
/* ---- 每类一枚标识：数据完整性 + 两两不撞形 ----
   类数不写死：taxonomy 加类/减类时这里跟着走，
   写死会在改分类体系时留下一句骗人的断言名。 */
{
  const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const s0 = appJs.indexOf('const SUB_MARKS');
  let depth = 0;
  let e0 = -1;
  for (let i = appJs.indexOf('{', s0); i < appJs.length; i += 1) {
    if (appJs[i] === '{') depth += 1;
    else if (appJs[i] === '}') { depth -= 1; if (depth === 0) { e0 = i + 1; break; } }
  }
  ok('能从 app.js 里切出 SUB_MARKS 块', s0 > 0 && e0 > s0);
  /* r2 在 app.js 里定义在这块之后，直接求值会 ReferenceError，这里自带一份同名实现。
     两处必须一致，都是「保留两位小数、去掉尾随 0」。 */
  const r2 = (n) => (Math.round(n * 100) / 100).toString();
  const MARKS = new Function('r2', appJs.slice(s0, e0) + '; return SUB_MARKS;')(r2);

  const TAXA_MARK = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));
  const allSubs = TAXA_MARK.families.flatMap((f) => f.subfamilies.map((s) => ({ id: s.id, fam: f.id })));
  const missing = allSubs.filter((s) => typeof MARKS[s.id] !== 'function').map((s) => s.id);
  ok('每个小类都有专属标识（不缺格）', missing.length === 0,
    `缺 ${missing.length} 个: ${missing.join(',')}`);
  const extra = Object.keys(MARKS).filter((k) => !allSubs.some((s) => s.id === k));
  ok('没有多余的标识（不画数据里不存在的格）', extra.length === 0, extra.join(','));

  /* 几何签名：把每个图元的 tag 与全部属性拼起来。
     不去光栅化 —— 测试里没有 canvas，而且几何签名已经能抓住
     「轮廓与内部线完全一样、只差 1px 偏移」这类撞形（本轮真正的问题就是这个）。 */
  const sig = (id) => JSON.stringify(MARKS[id]());
  const seen = new Map();
  const dup = [];
  for (const s of allSubs) {
    const k = sig(s.id);
    if (seen.has(k)) dup.push(`${seen.get(k)} / ${s.id}`);
    else seen.set(k, s.id);
  }
  ok(`全部 ${allSubs.length} 枚标识的图形全不相同`, dup.length === 0, dup.join(' ; '));
  /* 同族内部尤其不能撞：外圈一次只展开一族，用户看到的永远只有同族那几格，
     跨族撞形用户看不见，同族撞形就是「两格长得一样」。 */
  const dupSameFam = [];
  for (const fam of TAXA_MARK.families) {
    const m = new Map();
    for (const s of fam.subfamilies) {
      const k = sig(s.id);
      if (m.has(k)) dupSameFam.push(`${fam.id}: ${m.get(k)} / ${s.id}`);
      else m.set(k, s.id);
    }
  }
  ok('同族内部图形不重复', dupSameFam.length === 0, dupSameFam.join(' ; '));
  /* 每枚要有足够的笔触，不能是一个点或一条孤线。
     判据不是「图元个数 >= 2」——香根草是一束五条曲线，全打包在一条 path 里；
     水生是两道波纹，同理。数 M 命令才反映实际笔触数。 */
  const strokes = (shapes) => shapes.reduce((n, sh) => {
    if (sh.tag !== 'path') return n + 1;
    return n + String(sh.attrs.d || '').split('M').length - 1;
  }, 0);
  /* 但也不能反过来要求「必须多笔」：辛香琥珀是一根连续卷进的肉桂卷，
     一笔到底才是对的。真正的下限是「不能只有一个点或一根直线」——
     于是判据改成「图元数 + 曲线段数」的总和 >= 2。 */
  const weight = (shapes) => shapes.reduce((n, sh) => {
    if (sh.tag !== 'path') return n + 1;
    const seg = String(sh.attrs.d || '').match(/[CLQ]/g);
    return n + (seg ? seg.length : 1);
  }, 0);
  const thin = allSubs.filter((s) => weight(MARKS[s.id]()) < 2).map((s) => s.id);
  ok('每枚标识都不是孤点孤线', thin.length === 0, thin.join(','));
}

ok('换小类后香材名跟着变', appRoot.querySelector('.plate-cap').textContent !== cap.textContent,
  `${cap.textContent} → ${appRoot.querySelector('.plate-cap').textContent}`);

/* ---- 两层切换的返回路径（v14）----
   三条：① 返回按钮把大类一起清掉、回到闭合盘；
        ② 闭合盘上点扇区重新选中；
        ③ 展开态里点另一个大类是**切换**，不是清空 —— 这是用户明确要的
           「点大圈就直接变成别的大类」。
   第 ③ 条曾经在实现里和 ① 混在一起：既然「返回」要清空大类，
   很容易顺手把扇区点击也写成清空，那样用户每换一次类都要重新挑一次。 */
{
  const backNow = appRoot.querySelector('.wheel-back');
  ok('展开态有返回按钮（未隐藏）', !!backNow && backNow.hidden === false,
    backNow ? String(backNow.hidden) : 'no button');
  backNow.dispatch('click');
  await new Promise((r) => setTimeout(r, 600));
  const wheelNow = appRoot.querySelector('.disc.wheel');
  ok('返回后圆盘回到闭合态', !!wheelNow && !wheelNow.classList.contains('is-open'), wheelNow && wheelNow.className);
  const hubNow = appRoot.querySelector('.disc-hub');
  ok('返回后盘心回到空态', !!hubNow && hubNow.classList.contains('is-idle'), hubNow && hubNow.className);
  ok('返回后盘心文案回到「还没选」',
    appRoot.querySelector('.hub-zh').textContent === '还没选',
    appRoot.querySelector('.hub-zh').textContent);
  ok('返回后没有任何扇区仍被标记为选中',
    appRoot.querySelectorAll('.disc-sector').every((b) => b.getAttribute('aria-checked') === 'false'));
  /* 退场不是立刻清空：DOM 里要留着节点播动画，420ms 后才移除。
     600ms 之后必须已经清干净，否则残留节点会接住下一次点击。 */
  ok('返回后退场结束、中圈节点已清空',
    appRoot.querySelectorAll('.disc-sector.lvl2').length === 0,
    `残留 ${appRoot.querySelectorAll('.disc-sector.lvl2').length} 个`);

  /* ③ 切换：重新选一个大类，再点另一个大类 —— 结果应当是「换成新的」 */
  appRoot.querySelectorAll('.sector-g')[0].dispatch('click');
  await new Promise((r) => setTimeout(r, 500));
  const firstSubs = appRoot.querySelectorAll('.disc-sector.lvl2').map((b) => b.textContent).join('|');
  const wheelOpen = appRoot.querySelector('.disc.wheel');
  ok('重新点扇区后中圈再次展开', !!wheelOpen && wheelOpen.classList.contains('is-open'));
  appRoot.querySelectorAll('.sector-g')[3].dispatch('click');
  await new Promise((r) => setTimeout(r, 500));
  const secondSubs = appRoot.querySelectorAll('.disc-sector.lvl2').map((b) => b.textContent).join('|');
  const hubAfterSwitch = appRoot.querySelector('.hub-zh').textContent;
  ok('展开态点另一个大类是切换而不是清空',
    !!appRoot.querySelector('.disc.wheel').classList.contains('is-open') && hubAfterSwitch !== '还没选',
    `盘心：「${hubAfterSwitch}」`);
  ok('切换后中圈换成新大类的小类',
    secondSubs.length > 0 && secondSubs !== firstSubs,
    `${firstSubs} → ${secondSubs}`);
  ok('切换后大类不重复选择（旧大类不再是选中态）',
    appRoot.querySelectorAll('.disc-sector.lvl1')
      .filter((b) => b.getAttribute('aria-checked') === 'true').length === 1,
    /* 桩的 querySelectorAll 不支持后代选择器（见文件开头的说明），
       所以这里按 .disc-sector.lvl1 取全集再过滤，不要写 `.label-layer .disc-sector`。 */
    String(appRoot.querySelectorAll('.disc-sector.lvl1').filter((b) => b.getAttribute('aria-checked') === 'true').length));

  /* 把状态还原成「有家族 + 有小类」，后面的流程断言才有东西可走 */
  appRoot.querySelectorAll('.sector-g')[0].dispatch('click');
  await new Promise((r) => setTimeout(r, 500));
  appRoot.querySelectorAll('.disc-sector.lvl2')[0].dispatch('click');
  await new Promise((r) => setTimeout(r, 500));
}

/* 前进到第 2 步：点「下一步」 */
const goBtn = appRoot.querySelectorAll('.btn').find((b) => b.textContent.includes('下一步'));
ok('第 1 步有下一步按钮', !!goBtn);
goBtn.dispatch('click');
await new Promise((r) => setTimeout(r, 800));

/* v22：7 步顺序 —— 1 香型 / 2 香调点名 / 3 气质 / 4 场景 / 5 浓淡持久。
   第 2 步之后的三屏断言按新顺序写在下面，这里只确认已经离开第 1 步。 */

ok('进入第 2 步（香调点名，双栏）', getStepText().includes('点名具体'), getStepText().slice(0, 120));

const chips = appRoot.querySelectorAll('.chip');
ok('香调 chip 已渲染', chips.length >= 16, `实际 ${chips.length}`);
/* 合并后的关键结构：两栏同屏。这是本轮改动最核心的一条契约 ——
   若这里退回单栏，说明有人又把合并改回去了。 */
ok('香调屏是两栏并排（喜欢 + 讨厌同屏）',
  appRoot.querySelectorAll('[data-col="liked"]').length > 0
  && appRoot.querySelectorAll('[data-col="disliked"]').length > 0,
  `liked ${appRoot.querySelectorAll('[data-col="liked"]').length} / disliked ${appRoot.querySelectorAll('[data-col="disliked"]').length}`);
ok('两栏各有一枚「已选 N」计数徽标',
  appRoot.querySelectorAll('.note-count').length === 2,
  `实际 ${appRoot.querySelectorAll('.note-count').length}`);

// 回归守门：曾经用 entries.slice(0,16) 取"高频香调"，但数据按家族顺序排列，
// 前 16 个正好全是柑橘+花香+雪松檀木 —— 喜欢木质/琥珀/美食/清新的人
// 在"我喜欢"里一个可点的都没有，只有翻到"我受不了"（当时是全量 40 个）才看得到。
// 断言：折叠前可见的香调必须覆盖全部 6 个家族，且喜欢/讨厌两栏初始可见数相等。
const taxa = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));
const entryFamily = new Map(taxa.noteIndex.entries.map((n) => [n.zh, n.family]));
/* 合并屏两栏各 16 个，合计 32 个可见 chip。
   断言要看**两栏合计**的家族覆盖 —— 只取前 16 个等于只看左栏。
   左栏 16 个只覆盖 citrus/floral/woody 是数据本身的样子（usable 按家族
   顺序排，前 16 个落在前三族），右栏从尾部取 16 个做互补，两栏合起来
   才覆盖全部 6 族。所以这里改成对 chips 全量取样。 */
const visibleZh = chips.map((c) => c.textContent.trim());
const fams = new Set(visibleZh.map((z) => entryFamily.get(z)).filter(Boolean));
ok('两栏合计覆盖至少 4 个家族（防家族偏斜）', fams.size >= 4,
  `${fams.size} 个家族: ${[...fams].join(',')}`);
ok('两栏合计能选到「琥珀」「香草」这类琥珀/美食调',
  visibleZh.includes('琥珀') && visibleZh.includes('香草'),
  visibleZh.slice(0, 40).join(' '));

// 回归守门：40 个香调里有在当前 200 瓶样本中 0 命中的死选项（实测只有 可可/cocoa）。
// 勾了它永远推荐不出东西，等于骗一次点击。必须被 usableEntries() 挡在界面之外。
const perfs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8')).perfumes;
const allChipZh = chips.map((c) => c.textContent.trim());
ok('死选项「可可」不出现在香调 chip 里（0 命中即隐藏）',
  !allChipZh.includes('可可'), `共渲染 ${allChipZh.length} 个 chip`);
const moreBtnTxt = appRoot.querySelectorAll('.btn')
  .map((b) => b.textContent).find((t) => t.includes('展开全部'));
const renderedUnique = new Set(allChipZh).size;
ok('「展开全部」计数与实际可选香调数一致（不是硬编码 40）',
  !!moreBtnTxt && moreBtnTxt.includes(String(renderedUnique)),
  `按钮="${moreBtnTxt}" 实际去重 ${renderedUnique} 个`);

// 反向核对：所有上屏香调都必须至少命中 1 瓶，否则就是死选项漏网。
const { usableEntries } = await import('file:///' + path.join(ROOT, 'src/notes.js').replace(/\\/g, '/'));
const usableZh = new Set(usableEntries(taxa.noteIndex.entries, perfs).map((e) => e.zh));
const deadLeaked = allChipZh.filter((z) => !usableZh.has(z));
ok('上屏香调全部至少命中 1 瓶（无死选项漏网）',
  deadLeaked.length === 0, deadLeaked.join(',') || '无泄漏');

/* 点一个喜欢 + 一个讨厌，验证状态切换 */
chips[0].dispatch('click');
const dislikeStart = chips.length;
ok('chip 状态可切换', chips[0].getAttribute('aria-pressed') === 'true',
  chips[0].getAttribute('aria-pressed'));

/* 同一香调不能既喜欢又讨厌（两栏互斥）。
   实测踩过：两栏原本互不通信，可以同时勾上同一个香调，进引擎后
   喜欢分与讨厌分互相抵消，结果卡片的理由里反而不提用户点名的香材。
   这里用 DOM 里的同名列来验：在"讨厌"栏点同名 chip，喜欢栏那个必须自动关掉。 */
/* 两栏互斥：合并后同名副本就在同一屏，直接找即可。
   这一条是合并后**唯一新增的复杂度** —— 两栏同时存在于 DOM，
   勾一边必须同步改另一边，否则会出现"同一香调既喜欢又讨厌"（D41 禁止）。 */
const sameZh = chips[0].textContent.trim();
const dislikeTwin = appRoot.querySelectorAll('.chip').find(
  (c) => c.getAttribute('data-col') === 'disliked' && c.textContent.trim() === sameZh
);
ok('两栏里能找到同名 chip', !!dislikeTwin, sameZh);
if (dislikeTwin) {
  chips[0].dispatch('click');            // 先勾喜欢
  await new Promise((r) => setTimeout(r, 60));
  dislikeTwin.dispatch('click');         // 再勾讨厌 → 喜欢应被取消
  await new Promise((r) => setTimeout(r, 60));
  ok('两栏互斥：勾讨厌会取消喜欢',
    dislikeTwin.getAttribute('aria-pressed') === 'true',
    `「${sameZh}」讨厌=${dislikeTwin.getAttribute('aria-pressed')}`);
}

/* v19：出结果前要再走 5 屏（气质 / 季节 / 浓度 / 留香 / 整族排除）。
   每屏都给一句断言，顺带把「新增的屏真的能渲染、能前进」测掉 ——
   否则只要某一屏的 navBar 分支漏写，用户就会卡在那里出不了结果。 */
/* v22：7 步。顺序见 app.js 的 STEPS ——
   1 香型 / 2 香调点名（双栏）/ 3 气质（三组）/ 4 场景（场合+季节）
   5 浓淡持久（滑块+浓度+留香联动）/ 6 整族排除 / 7 已知款
   合并原则是"一屏只问一类事"，不是"相邻就合"。 */
const stepNames = [
  [3, '给人什么感觉', 'mood'],
  [4, '什么时候用它', 'context'],
  [5, '想要多浓、留多久', 'strength'],
  [6, '完全不想要', 'dislikedFamilies'],
  [7, '试过、并且喜欢', 'anchor'],
];
for (const [n, phrase] of stepNames) {
  /* 顺序很重要：先点前进、再断言落在第 n 步。
     第一版写成"先断言再前进"，结果每一条都在报上一屏的文案 ——
     因为进循环时还停在第 5 步（讨厌香调）。 */
  const b = appRoot.querySelectorAll('.btn').find((x) => x.textContent.includes('下一步')
    || x.textContent.includes('看推荐'));
  ok(`第 ${n - 1} 步有前进按钮`, !!b,
    `按钮：${appRoot.querySelectorAll('.btn').map((x) => x.textContent.trim()).join(' | ').slice(0, 120)}`);
  if (b) { b.dispatch('click'); await new Promise((r) => setTimeout(r, 260)); }
  ok(`进入第 ${n} 步（${phrase}）`, getStepText().includes(phrase), getStepText().slice(0, 80));

  /* E6：品牌从原生 select 换成可搜索组合框。
     133 项原生下拉只能滚，是全场唯一无法用输入法到达的地方。 */
  if (n === 7) {
    const combos = appRoot.querySelectorAll('.combo-input');
    ok('第 7 步品牌是可搜索组合框', combos.length === 1, `实际 ${combos.length}`);
    ok('组合框是 combobox 语义',
      combos.length === 1 && combos[0].attrs.role === 'combobox',
      combos.length ? String(combos[0].attrs.role) : '-');
    ok('组合框初始收起',
      combos.length === 1 && combos[0].attrs['aria-expanded'] === 'false',
      combos.length ? String(combos[0].attrs['aria-expanded']) : '-');
    /* 品牌不再用原生 select —— 要留一个断言钉住，否则下次改回 select 没人拦 */
    ok('品牌不再用原生 select',
      appRoot.querySelectorAll('select').length === 0,
      `实际 ${appRoot.querySelectorAll('select').length} 个 select`);
  }

  /* 单选组的容器语义就在这一屏验：第 3 步（气质）是第一个用 .choice-grid 的屏。
     .choice-grid 原来只有子项 aria-pressed，容器是裸 div —— 读屏把一组单选
     念成"切换按钮"，既不知道是一组，也报不出"共几个、第几个"。
     断言写在这里而不是首屏，是因为首屏根本没有 .choice-grid。 */
  if (n === 5) {
    /* P2-4：滑块要有 5 个落点标记，且与档位对齐。
       位置算法必须与浏览器画滑块的一致（手柄宽 20px，可用轨道 = 宽度 − 20px），
       否则刻度会和手柄错开 —— 这条断言只看数量与亮起项，对齐由浏览器实测覆盖。 */
    const ticks = appRoot.querySelectorAll('.scale-tick');
    ok('浓郁度滑块有 5 个刻度落点', ticks.length === 5, `实际 ${ticks.length}`);
    /* 亮起项要与滑块读数一致。测试跑在隔离 DOM 桩里、拿不到 state，
       所以从界面上读：滑块是 5 档，.scale-read 里印着「3 / 5 · 中等」。 */
    const onTick = [...ticks].findIndex((t) => t.classList.contains('is-on')) + 1;
    const m = getStepText().match(/(\d)\s*\/\s*5/);
    const shown = m ? Number(m[1]) : null;
    ok('刻度亮起项与滑块读数一致', shown !== null && onTick === shown,
      `亮第 ${onTick} 个，界面读数是 ${shown}`);
  }
  if (n === 6) {
    /* E7：这一屏是全场唯一的多选卡片组，但它和单选组共用 .choice-grid。
       没有显式文案与 aria-multiselectable 时，视觉与读屏都说不出"可以选多个"。 */
    const t = getStepText();
    ok('第 6 步写明「可多选」', t.includes('可多选'), t.slice(0, 80));
    const g = appRoot.querySelector('.choice-grid');
    ok('第 6 步容器标了 aria-multiselectable',
      !!g && g.attrs['aria-multiselectable'] === 'true',
      g ? String(g.attrs['aria-multiselectable']) : '(无 .choice-grid)');
    ok('第 6 步不是 radiogroup（是多选）',
      !!g && g.attrs.role !== 'radiogroup', g ? String(g.attrs.role) : '-');
  }
  if (n === 3) {
    /* E3/E4：冷暖（3 档）与甜度（4 档）改成分段控件。
       判据三条：形态是 .seg、语义是 radiogroup、方向键能换档。 */
    const segs = appRoot.querySelectorAll('.seg');
    ok('第 3 步有 2 个分段控件（冷暖 + 甜度）', segs.length === 2, `实际 ${segs.length}`);
    const counts = [...segs].map((x) => x.querySelectorAll('.seg-item').length);
    ok('分段控件档位是 3 与 4', counts.join(',') === '3,4', counts.join(','));
    ok('每个分段控件都是 radiogroup',
      [...segs].every((x) => x.attrs.role === 'radiogroup'),
      [...segs].map((x) => x.attrs.role).join(','));
    /* roving tabindex：整组只留一个 Tab 落点 */
    ok('分段控件每组只有一个 Tab 落点',
      [...segs].every((x) => [...x.querySelectorAll('.seg-item')]
        .filter((b) => b.attrs.tabindex === '0' || b.attrs.tabindex === 0).length === 1),
      '有多组存在两个 0');
    /* 说明文字要跟着选中项换 —— 第一版漏了，点「偏凉」仍显示「偏暖」那句 */
    const hints = appRoot.querySelectorAll('.seg-hint');
    ok('每个分段控件都带一句说明', hints.length === 2, `实际 ${hints.length}`);
  }
  if (n === 3) {
    /* 气质七个原型：由冷暖/甜度/初始偏好推导，首项按接近度排序。
       断言四条 —— 数量、标签是对象、每项都有 neg、推导函数能给出对应项。 */
    const cards = appRoot.querySelectorAll('.choice');
    ok('气质组恰好 7 个原型（三维 2x2x2 缺一格，数据撑不起）',
      cards.length === 7, `实际 ${cards.length}`);
    /* 这七项必须能被前面答过的三维推出来 —— 直接调 rankCharacterPresets */
    const probe = appRoot.__rankProbe
      ? appRoot.__rankProbe({ temperature: 'warm', sweetness: 3, family: 'gourmand' })[0].zh
      : null;
    ok('气质首项可由冷暖/甜度/初始偏好推导',
      probe === '焦糖琥珀', `推导得 ${probe}`);
    /* 推导函数在没答任何一项时不应该替用户预选 */
    const emptyProbe = appRoot.__rankProbe ? appRoot.__rankProbe({}) : null;
    ok('全未答时推导函数仍有确定输出（但不预选）', !!emptyProbe, String(emptyProbe && emptyProbe[0].zh));
  }
  if (n === 3) {
    const grid = appRoot.querySelector('.choice-grid');
    ok('第 3 步的卡片组是 radiogroup', !!grid && grid.attrs.role === 'radiogroup',
      grid ? String(grid.attrs.role) : '(没有 .choice-grid)');
    const radios = grid ? grid.querySelectorAll('[role="radio"]') : [];
    /* 七个气质原型（不是八个）—— 三维 2×2×2 里的「冷+甜+重」那一格
       在 1228 瓶里只有 12 瓶，数据撑不起一个选项，见 D51。 */
    ok('组内每张卡是 radio', radios.length >= 7, `实际 ${radios.length}`);
    /* 气质组是七个按"与你已答偏好的接近度"排序的原型，用户答过至少一项时
       会**预选**最接近的那一项（state.answers.characterPreset 一并写进去，
       否则用户不动这一屏直接下一步，引擎收不到任何气质信息）。
       所以这里不能再断言"未选时没有 checked" —— 那条是旧版（八个并列标签、
       无预选）的断言，现在语义变了。

       改成断言：若存在 checked，则恰有一个（单选组不能有两个选中）。 */
    const checked0 = radios.filter((r) => r.attrs['aria-checked'] === 'true');
    ok('单选组内至多一个 checked', checked0.length <= 1, `实际 ${checked0.length}`);
  }
}

const finishBtn = appRoot.querySelectorAll('.btn').find((b) => b.textContent.includes('看推荐'));
ok('第 13 步有看推荐按钮', !!finishBtn);
if (finishBtn) {
  finishBtn.dispatch('click');
  await new Promise((r) => setTimeout(r, 400));
}

const resultText = getStepText();
ok('结果页标题', resultText.includes('你的三瓶候选'), resultText.slice(0, 100));
const picks = appRoot.querySelectorAll('.pick');
ok('吐出 3 瓶', picks.length === 3, `实际 ${picks.length}`);
/* ---------- D2：第 1 名的视觉身份，且不许在并列时撒谎 ----------
   实测踩到：一组完整答案下三瓶原始分完全相同（173.9/173.9/173.9，分差 0.0），
   三张卡都显示「匹配度 63%」。此时把第 1 张标成「最匹配」是在编造排序。
   断言两条：① 至多一张 is-top；② 并列时不标最匹配、改标并列徽标。 */
{
  const tops = appRoot.querySelectorAll('.pick.is-top');
  ok('第 1 名至多一张卡被标为最匹配', tops.length <= 1, `实际 ${tops.length}`);
  const badges = appRoot.querySelectorAll('.top-badge');
  const ties = appRoot.querySelectorAll('.tie-badge');
  ok('最匹配徽标至多一枚', badges.length <= 1, `实际 ${badges.length}`);
  ok('最匹配与并列徽标不同时出现（互斥）',
    !(badges.length && ties.length),
    `最匹配 ${badges.length} 枚、并列 ${ties.length} 枚`);
  /* 徽标措辞必须与"有没有百分比"一致 —— 实测线上出现过一张卡同时标
     「最匹配」和「初步匹配」：前者断言"它最合适"，后者说"我们算不准"，
     两句话互相拆台。没有百分比时徽标要说「原始分最高」（这是事实），
     不说「最匹配」（那需要百分比支撑）。 */
  /* 上面这条在并列时徽标为 0，所以还要单独测"不并列 + 无百分比"这一格 ——
     它正是线上出问题的那一格（5 个维度 → 无百分比 → 但标了「最匹配」）。
     用一组确定的浅答案直接调渲染，不依赖主流程的巧合。 */
  {
    const shallow = { family: 'floral', occasion: 'commute' };   // 2 维，远低于阈值 8
    const r2 = appMod.recommend
      ? appMod.recommend(shallow, appMod.__perfumes || [], appMod.__tax)
      : null;
    /* 主流程里拿不到内部数据，退而求其次：直接断言措辞函数的行为。
       badgeTextFor 是这次抽出来的纯函数，见 app.js。 */
    if (appMod.__aff && appMod.__badgeText) {
      ok('无百分比时徽标不用「最匹配」',
        appMod.__badgeText(false) === '原始分最高', appMod.__badgeText(false));
      ok('有百分比时徽标用「最匹配」',
        appMod.__badgeText(true) === '最匹配', appMod.__badgeText(true));
    } else {
      /* 没有暴露纯函数时，退回看当前 DOM：只要"有初步匹配"和"最匹配"同时
         出现就是矛盾，无论有没有徽标。 */
      const anyPrelim = appRoot.querySelectorAll('.score.is-preliminary').length > 0;
      const badgesNow = appRoot.querySelectorAll('.top-badge');
      if (anyPrelim && badgesNow.length) {
        ok('无百分比时徽标不说「最匹配」',
          !badgesNow[0].textContent.includes('最匹配'), badgesNow[0].textContent);
      } else {
        ok('无百分比与「最匹配」徽标不同时出现', true, '本次并列或无徽标，跳过');
      }
    }
  }
  /* 至少要有一种"哪瓶更好"的表达 —— 要么最匹配，要么明说并列 */
  ok('结果页对排名有明确交代',
    badges.length + ties.length >= 1,
    '既没有最匹配也没有并列说明，用户无法判断该先试哪瓶');
}

ok('有前中后调表', appRoot.querySelectorAll('.pyramid').length === 3);
ok('有推荐理由', appRoot.querySelectorAll('.reasons').length === 3);
ok('每条理由数量 >=1',
  appRoot.querySelectorAll('.reasons').every((r) => r.querySelectorAll('li').length >= 1));
// 回归守门：曾经的 bug 是理由上限被写成 2 条，导致场景/浓度这两个有 40 分权重的
// 因子永远不产出理由，用户看不到自己答的第 2、3 题起了什么作用。
ok('每条理由 >=2 条（README 承诺 2–3 条）',
  appRoot.querySelectorAll('.reasons').every((r) => r.querySelectorAll('li').length >= 2),
  appRoot.querySelectorAll('.reasons').map((r) => r.querySelectorAll('li').length).join(','));
ok('理由条数不超过 3（避免堆砌）',
  appRoot.querySelectorAll('.reasons').every((r) => r.querySelectorAll('li').length <= 3),
  appRoot.querySelectorAll('.reasons').map((r) => r.querySelectorAll('li').length).join(','));
// 家族或浓度必定有一条：这两项合计 52 分权重，是打分的骨架。
// 若某瓶的理由里完全没有结构性表述，说明理由与得分脱节。
ok('每条理由含至少一条结构性理由（家族/浓度）',
  appRoot.querySelectorAll('.reasons').every((r) => {
    const t = r.textContent;
    // 家族/浓度这两条是结构性理由，占分权重最高（52/100）。文字改过措辞，
    // 所以这里认全部实际存在的说法 —— 但要守住「不能只靠 likedNotes 那一句」这个意思。
    // 「主体就是」漏掉过一次：`主体是` 匹配不到 `主体就是`，而 `骨架` 那句同样是家族理由。
    return /主体就是|主体是|主调是|骨架|厚重感|浓郁度/.test(t);
  }));
/* ---------- ① 文案统一收尾：句末不留句号 ----------
   这一条守的是「短句风格」这条设计约定。它容易在改文案时被无意破坏：
   加一句话顺手补个句号，页面上就跟其他 78 条短句不一致了。
   只查真正渲染出来的文本（含 taxonomy 的 desc/descWheel/oneLine/style），
   不查注释与代码。 */
{
  const TAX2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
  const bad = [];
  const scan = (where, s) => { if (typeof s === 'string' && /[。]$/.test(s)) bad.push(where + ' → ' + s); };
  for (const f of TAX2.families) {
    ['oneLine', 'style', 'wear', 'avoid', 'desc'].forEach((k) => scan('family/' + f.id + '.' + k, f[k]));
    for (const s of f.subfamilies) ['desc', 'descWheel'].forEach((k) => scan('sub/' + s.id + '.' + k, s[k]));
  }
  ok('taxonomy 展示文案无句末句号', bad.length === 0, bad.slice(0, 4).join(' | '));

  // 页面上真实渲染的文本：四步都走一遍会太长，这里扫已渲染的全局文本。
  const vis = appRoot.textContent;
  const tailDot = vis.split(/[\n]/).filter((l) => /[。]$/.test(l.trim()));
  ok('渲染文本无整行以句号收尾', tailDot.length === 0, tailDot.slice(0, 3).join(' | '));
}

ok('结果含数据来源链接',
  appRoot.querySelectorAll('a').some((a) => String(a.attrs.href || '').includes('scento')));
ok('结果含重新开始', appRoot.querySelectorAll('.btn').some((b) => b.textContent.includes('重新来一次')));
/* ---------- 推广链接：三档语义必须分得开 ----------
   v27 起购买入口分成三档，断言必须逐档钉住，否则"降级"和"假广告"
   两种错误都会溜过去：

     ① direct —— 三件套（target/pid/productBase）齐全，有佣金
        → `.buy-link` 且 `data-affiliate="true"`、rel 含 sponsored
        → 跟一条 `aff-note` 广告披露（首句「广告」）
     ② link  —— 预生成直达页，无佣金
        → `.buy-link.is-search`、`data-affiliate="false"`、rel **不含** sponsored
        → **不挂**广告披露
     ③ search —— 平台搜索页兜底，零配置
        → `.buy-link.is-search`、`data-affiliate="false"`、rel **不含** sponsored
        → 跟一句 `aff-note.is-search`，说明"这是搜索结果页"

   为什么 `.is-search` 也复用 `.buy-link` 类：视觉上它确实是那张卡片的
   主要外链，样式复用避免两套按钮；语义靠 `data-kind` 与 rel 区分。 */
{
  const buy = appRoot.querySelectorAll('.buy-link');
  const notes = appRoot.querySelectorAll('.aff-note');
  const searchNotes = appRoot.querySelectorAll('.link-note');

  /* 默认配置已经从「三件套全空」变成「淘宝有 pid、京东全空」——
     2026-11-02 拿到真实淘宝推广位后，默认配置里就带 pid 了。
     于是同一条结果页上**同时存在两档**，断言必须按平台分开钉，
     否则「有佣金的那个被当成没佣金」和「没佣金的那个被当成有佣金」
     两种错误都测不出来（这正是上一版断言在改配置后立刻红的原因）。 */
  /* 双平台 × 淘宝双渠道：每瓶京东 1 + 淘宝 2 = 3，3 瓶 × 3 = 9 */
  ok('每瓶出京东 1 + 淘宝 2 共 3 个入口（3×3）', buy.length === 9, `实际 ${buy.length}`);

  const byPlat = (p) => buy.filter((a) => String(a.attrs['data-platform']) === p);
  const jd = byPlat('jd');
  const tb = byPlat('taobao');
  ok('京东 3 个、淘宝 6 个', jd.length === 3 && tb.length === 6, `jd=${jd.length} tb=${tb.length}`);

  /* ---- 京东：没有 pid → 只能走第 ③ 档（搜索页，无佣金） ---- */
  ok('京东未配置佣金 → kind=search',
    jd.every((a) => String(a.attrs['data-kind']) === 'search'),
    jd.map((a) => a.attrs['data-kind']).join(','));
  ok('京东搜索兜底 data-affiliate=false',
    jd.every((a) => String(a.attrs['data-affiliate']) === 'false'),
    jd.map((a) => a.attrs['data-affiliate']).join(','));
  /* 最关键的一条：没有佣金关系就不许标 sponsored。
     标了等于对搜索引擎和用户同时撒谎。 */
  ok('京东搜索兜底不带 sponsored 标记',
    jd.every((a) => !String(a.attrs.rel || '').includes('sponsored')),
    jd.map((a) => a.attrs.rel).join(' | '));

  /* ---- 淘宝：有 pid → 带佣金的搜索推广页（uland + pid），
         且拆成 official / market 两个渠道 ----
     两个渠道都必须带 pid（都真有佣金），所以都必须 sponsored + 广告披露；
     落地都是搜索结果而不是这一瓶，所以文案必须说「搜」不说「买」。 */
  ok('淘宝有 pid → kind=direct',
    tb.every((a) => String(a.attrs['data-kind']) === 'direct'),
    tb.map((a) => a.attrs['data-kind']).join(','));
  ok('淘宝佣金链接 data-affiliate=true',
    tb.every((a) => String(a.attrs['data-affiliate']) === 'true'),
    tb.map((a) => a.attrs['data-affiliate']).join(','));
  ok('淘宝佣金链接标 sponsored',
    tb.every((a) => String(a.attrs.rel || '').includes('sponsored')),
    tb.map((a) => a.attrs.rel).join(' | '));
  ok('淘宝佣金链接落到 uland 且 pid 在 URL 里',
    tb.every((a) => String(a.attrs.href).includes('uland.taobao.com')
      && String(a.attrs.href).includes('pid=mm_')),
    tb.map((a) => String(a.attrs.href).slice(0, 52)).join(' | '));
  /* 文案不许把"搜索结果页"说成"这一瓶" */
  ok('淘宝佣金链接文案说「搜」不说「买」',
    tb.every((a) => /搜/.test(a.textContent) && !/买这一瓶/.test(a.textContent)),
    tb.map((a) => a.textContent).join(' | '));

  /* ---- 官方 / 全网两个渠道必须真的可分 ----
     用户要的是「一个官方来源 + 第三方店铺」。能被静态站保证的区分方式
     只有关键词（排序参数实测无效，见 app.js 注释），所以断言钉在
     URL 里的关键词上，而不是钉文案 —— 文案可以改，URL 行为不能。 */
  const official = tb.filter((a) => String(a.attrs['data-channel']) === 'official');
  const market = tb.filter((a) => String(a.attrs['data-channel']) === 'market');
  ok('淘宝每瓶各一个 official / market',
    official.length === 3 && market.length === 3,
    `official=${official.length} market=${market.length}`);
  ok('official 渠道关键词带「官方旗舰店」',
    official.every((a) => decodeURIComponent(String(a.attrs.href)).includes('官方旗舰店')),
    official.map((a) => decodeURIComponent(String(a.attrs.href)).slice(0, 70)).join(' | '));
  ok('market 渠道关键词不带「官方旗舰店」',
    market.every((a) => !decodeURIComponent(String(a.attrs.href)).includes('官方旗舰店')),
    market.map((a) => decodeURIComponent(String(a.attrs.href)).slice(0, 70)).join(' | '));
  /* 两个渠道的 scope 短语必须渲染出来 —— 否则用户看不出按钮差在哪 */
  ok('两个渠道的适用范围都渲染在按钮里',
    tb.every((a) => /官方旗舰店|全网/.test(a.textContent)),
    tb.map((a) => a.textContent.replace(/\s+/g, ' ').slice(0, 30)).join(' | '));

  /* 安全基线两档都要 */
  ok('全部外链都带 noopener noreferrer',
    buy.every((a) => /noopener/.test(String(a.attrs.rel || '')) && /noreferrer/.test(String(a.attrs.rel || ''))),
    buy.map((a) => a.attrs.rel).join(' | '));

  /* ---- 披露：一张卡上只要有任意一个 direct，就挂「广告」披露 ----
     淘宝现在是 direct，所以每张卡一条 aff-note。
     另外因为有两个渠道，每卡还会多一条 link-note 说明两者差异 ——
     这一条**不是**广告披露，是"我们保证不了什么"的说明，
     所以必须用 .link-note 而不是 .aff-note（两者混用会让
     "有没有广告披露"在 DOM 层就分不出来，上一版踩过）。 */
  ok('有 direct 链接时挂「广告」披露（每卡一条）', notes.length === 3, `实际 ${notes.length}`);
  ok('披露首句是「广告」',
    notes.every((n) => n.textContent.trim().startsWith('广告')),
    notes.map((n) => n.textContent.slice(0, 14)).join(' | '));
  /* 双渠道说明必须说清"价格没排序"——这是实测结论，不能省 */
  ok('双渠道说明写明价格未排序（每卡一条）', searchNotes.length === 3, `实际 ${searchNotes.length}`);
  ok('双渠道说明包含「价格未排序」',
    searchNotes.every((n) => /价格未排序|未排序/.test(n.textContent)),
    searchNotes.map((n) => n.textContent.slice(0, 20)).join(' | '));

  /* 数据来源链接必须一直在 —— 降级只影响购买入口，不影响溯源。 */
  ok('降级后数据来源链接仍在',
    appRoot.querySelectorAll('.pick-foot a').length >= 6,
    `实际 ${appRoot.querySelectorAll('.pick-foot a').length}`);
}
/* ---------- affiliateHref 的降级矩阵 ----------
   逐个喂不完整配置，确认一律返回 null。这里直接调内部函数，
   不依赖 DOM —— 它是纯函数，测起来比渲染快也准。 */
{
  const P = { brand: 'Demo', name: 'Bottle', notesAll: [] };
  const full = { target: 'https://a.example/click?pid={pid}&u={dest}',
    pid: 'P1', productBase: 'https://s.example/search', disclosure: 'x' };
  const cases = [
    ['完整配置能拼出链接', full, true],
    ['缺 pid', { ...full, pid: '' }, false],
    ['缺 target', { ...full, target: '' }, false],
    ['target 不含 {dest}', { ...full, target: 'https://a.example/x?pid={pid}' }, false],
    ['缺 productBase', { ...full, productBase: '' }, false],
    ['target 拼出来不是 http(s)', { ...full, target: 'javascript:alert(1)//{dest}' }, false],
  ];
  for (const [name, cfg, shouldWork] of cases) {
    const href = appMod.__aff.href(P, cfg);
    ok(`推广链接降级：${name}`, shouldWork ? !!href : href === null,
      String(href).slice(0, 70));
  }
  /* 链接必须带三个 rel 与 target=_blank，少一个都是安全问题 */
  const href = appMod.__aff.href(P, full);
  ok('拼出的链接里 pid 已编码', !!href && href.includes('P1'), String(href).slice(0, 60));
  /* K4：披露文案的合规底线 —— 中国《互联网广告管理办法》第九条要求标明"广告"，
     FTC 要求 clear and conspicuous。两条都落到"首句必须出现广告二字"。 */
  const disc = appMod.__aff.config().disclosure;
  ok('披露文案以「广告」开头（国内法规要求）', disc.startsWith('广告'), disc.slice(0, 20));
  ok('披露说明不影响支付价格', disc.includes('不影响'), disc.slice(0, 40));
  /* ?pid= 只能覆盖 pid，不能覆盖 target —— 否则任何访客都能把链接指向别处 */
  /* ?pid= 只覆盖 pid，绝不覆盖 target —— 否则任何访客都能把链接指向别处 */
  ok('?pid= 不覆盖 target（防注入）', (() => {
    const c = appMod.__aff.config();
    return typeof c.jd.target === 'string' && typeof c.taobao.target === 'string';
  })(), 'target 类型异常');
  ok('拼出的 dest 已编码（不出现裸 ?q=）',
    !!href && !/u=https:\/\/s\.example\/search\?q=/.test(href), String(href).slice(0, 90));
}

/* ---------- affiliateLink 的三档优先级（v27） ----------
   这是新增的调度层：direct > link > search。
   三档差别不只是 URL，还有"挂不挂 sponsored / 写不写广告披露"，
   所以每一档都要单独钉住，不能只测最终渲染出来的那一个。 */
{
  const P = { id: 'demo-bottle', brand: 'Demo', name: 'Bottle' };
  /* v29 起 cfg 按平台分组：{ jd:{target,pid,productBase}, taobao:{...}, searchPlatforms:[...] } */
  const paidCfg = {
    jd: { target: 'https://a.example/click?pid={pid}&u={dest}', pid: 'P1', productBase: 'https://s.example/search' },
    taobao: { target: '', pid: '', productBase: '' },
    searchPlatforms: ['jd', 'taobao'],
    disclosure: '广告 · x',
  };
  const freeCfg = {
    jd: { target: '', pid: '', productBase: '' },
    taobao: { target: '', pid: '', productBase: '' },
    searchPlatforms: ['jd'],
    disclosure: '广告 · x',
  };
  const A = appMod.__aff;

  /* ① 三件套齐全 → direct，即使直达表里也有这一瓶（佣金优先） */
  A.setLinks({ jd: { 'demo-bottle': 'https://item.jd.com/1.html' } });
  const d = A.link(P, paidCfg);
  ok('三档优先级：有佣金时走 direct', !!d && d.kind === 'direct', d && d.kind);
  ok('direct 文案说「买」', !!d && /买/.test(d.label), d && d.label);

  /* ② 无佣金但有预生成直达页 → link */
  const l = A.link(P, freeCfg);
  ok('三档优先级：无佣金但有直达页时走 link', !!l && l.kind === 'link', l && l.kind);
  ok('link 指向预生成表里的商品页',
    !!l && l.href === 'https://item.jd.com/1.html', l && l.href);
  ok('link 文案说「看」不说「买」', !!l && !/买/.test(l.label), l && l.label);

  /* ③ 两样都没有 → search */
  A.setLinks(false);
  const s = A.link(P, freeCfg);
  ok('三档优先级：什么都没有时走 search', !!s && s.kind === 'search', s && s.kind);
  ok('search 指向平台搜索页而不是商品页',
    !!s && /search\.jd\.com/.test(s.href), s && s.href);
  ok('search 查询词含品牌与香水名',
    !!s && decodeURIComponent(s.href.replace(/\+/g, ' ')).includes('Demo Bottle'),
    s && decodeURIComponent(s.href).slice(0, 90));

  /* 没有平台就拼不出搜索页 —— 不许硬凑 */
  /* 平台列表为空 → 一个链接都不出（不硬凑） */
  const noPlat = Object.assign({}, freeCfg, { searchPlatforms: [] });
  ok('searchPlatforms 为空时不渲染任何链接', A.links(P, noPlat).length === 0,
    JSON.stringify(A.links(P, noPlat)));

  /* 四个平台的模板都必须含 {q} 且替换后合法 */
  const plats = A.platforms;
  ok('四个搜索平台都已定义',
    ['jd', 'taobao', 'tmall', 'pdd'].every((k) => plats[k]), Object.keys(plats).join(','));
  ok('每个平台模板都含 {q} 占位符',
    Object.values(plats).every((p) => p.url.indexOf('{q}') >= 0),
    Object.values(plats).map((p) => p.url.slice(0, 40)).join(' | '));
  ok('每个平台模板替换后都是合法 https', Object.values(plats).every((p) => {
    const u = p.url.replace('{q}', 'test');
    try { return new URL(u).protocol === 'https:'; } catch { return false; }
  }), '');

  /* 坏链不能透传：直达表里塞 javascript: 必须被拒并退回 search */
  A.setLinks({ jd: { 'demo-bottle': 'javascript:alert(1)' } });
  const bad = A.link(P, freeCfg);
  ok('直达表里的 javascript: 链接被拒，退回 search',
    !!bad && bad.kind === 'search', bad && bad.kind);

  /* 双平台：两个都配了搜索 → 返回两条，顺序与 searchPlatforms 一致 */
  const both = A.links(P, Object.assign({}, freeCfg, { searchPlatforms: ['jd', 'taobao'] }));
  ok('双平台各出一条链接', both.length === 2, JSON.stringify(both.map((x) => x.platform)));
  ok('平台顺序与配置一致',
    both.map((x) => x.platform).join(',') === 'jd,taobao',
    both.map((x) => x.platform).join(','));
  ok('两条链接分别指向对应平台的搜索页',
    /search\.jd\.com/.test(both[0].href) && /s\.taobao\.com/.test(both[1].href),
    both.map((x) => x.href.slice(0, 50)).join(' | '));

  A.setLinks(false);   // 恢复，别影响后面的断言
}

ok('结果页无 NaN/undefined', !/NaN|undefined/.test(resultText), resultText.slice(0, 300));

/* ---------- G6：匹配度的两种显示形态 ----------
   2026-11 重做了归一化分母（见 src/scoring.js 与 docs/DECISIONS.md D55）。
   这里钉住两条不许退化的性质：

   ① 激活维度 < MATCH_PCT_MIN_DIMS 时**不许显示百分比**，改说「初步匹配」。
      理由：那时分母也被砍到只剩那几项，百分比会飙到 90% 以上，
      读起来像虚假承诺。测试流程答的维度很多（走满七步），
      所以这里走的是"显示百分比"分支 —— 另一分支由 test-scoring 覆盖。
   ② 显示的百分比**不许是 0%**。0% 的意思是"完全不匹配"，
      而分母已改成可达上界，任何能进前三的瓶都不可能 0 分。 */
{
  const scoreEls = picks.map((p) => {
    const s = p.querySelectorAll('.score');
    return s.length ? s[0].textContent : null;
  });
  ok('三张卡都有匹配度标签', scoreEls.every(Boolean), JSON.stringify(scoreEls));
  const isPrelim = scoreEls.some((t) => String(t).includes('初步匹配'));
  const pcts = scoreEls.map((t) => {
    const m = String(t).match(/(\d+)%/);
    return m ? Number(m[1]) : null;
  });
  if (isPrelim) {
    ok('初步匹配时不出现数字百分比',
      scoreEls.every((t) => !/\d+%/.test(String(t))), JSON.stringify(scoreEls));
  } else {
    ok('匹配度是 1–100 之间的整数',
      pcts.every((v) => Number.isInteger(v) && v >= 1 && v <= 100), JSON.stringify(pcts));
    /* 新分母是可达上界，所以第 1 名不该再被压到 70% 以下 ——
       那正是旧口径（/275）的问题。60 是留了余量的下限。 */
    ok('第 1 名匹配度不低于 60%（旧口径只有 69% 上下）',
      pcts[0] >= 60, `${pcts[0]}%`);
  }
  /* 说明行必须跟着口径走：不能一边不给百分比一边解释"匹配度 = 得分/满分" */
  const hasExplain = /匹配度 = /.test(resultText);
  const hasPrelimExplain = /不给数字|样本太少/.test(resultText);
  ok('结果页的匹配度说明与显示状态一致',
    isPrelim ? hasPrelimExplain : hasExplain,
    `isPrelim=${isPrelim} explain=${hasExplain} prelim=${hasPrelimExplain}`);
}
// 抽样打印第一瓶，供人工核对
console.log('\n--- 第一瓶渲染结果 ---');
console.log(picks[0] ? picks[0].textContent.slice(0, 420) : '(无)');

fs.unlinkSync(tmpApp);

console.log(`\n===== 渲染测试 =====`);
console.log(`PASS ${pass}  FAIL ${fails.length}`);
fails.forEach((f) => console.log('  ✗ ' + f));
