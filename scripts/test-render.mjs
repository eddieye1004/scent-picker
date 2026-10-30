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
  append(...ns) { ns.flat().forEach((n) => n != null && this.appendChild(n)); }
  addEventListener(ev, fn) { (this._listeners[ev] ||= []).push(fn); }
  dispatch(ev, payload = {}) {
    (this._listeners[ev] || []).forEach((fn) =>
      fn({ target: this, preventDefault() {}, stopPropagation() {}, ...payload }));
  }
  focus() {}
  querySelectorAll(sel) {
    const out = [];
    // 支持三种写法：.class / tag / tag.class / [attr="v"] / .a.b
    // 圆盘用到了 .disc-sector、button.disc-sector、[role="radiogroup"]、.disc-hub.is-idle，
    // 简化桩只认单 class 的话，这些断言会全部假失败。
    const attrM = sel.match(/^\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]$/);
    const isClass = sel.startsWith('.');
    const parts = sel.split('.').filter(Boolean);
    const tagPart = sel.startsWith('.') || sel.startsWith('[') ? null : parts[0];
    const classes = sel.startsWith('.') || sel.startsWith('[') ? parts : parts.slice(1);

    const walk = (n) => {
      if (typeof n === 'string') return;
      let hit = false;
      if (attrM) {
        const got = n.attrs[attrM[1]];
        hit = got != null && (attrM[2] == null || String(got) === attrM[2]);
      } else {
        hit = (!tagPart || n.tagName.toLowerCase() === tagPart.toLowerCase())
          && classes.every((c) => n.classList.contains(c));
      }
      if (hit) out.push(n);
      n.children.forEach(walk);
    };
    this.children.forEach(walk);
    return out;
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

await import('file://' + tmpApp.replace(/\\/g, '/'));
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
/* 一枚，不是三枚：实测 38 个小类的代表香材 32/32 同属一个家族，
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
/* ---- 32 枚标识：数据完整性 + 两两不撞形 ---- */
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
  ok('32 枚标识的图形全不相同', dup.length === 0, dup.join(' ; '));
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

ok('进入第 2 步（场合）', getStepText().includes('主要在哪里用'), getStepText().slice(0, 100));
const opts2 = appRoot.querySelectorAll('.disc-sector');
ok('场合圆盘 5 个扇区', opts2.length === 5, `实际 ${opts2.length}`);

/* 选「上班/上课」= 索引 1 */
opts2[1].dispatch('click');
await new Promise((r) => setTimeout(r, 800));  // 自动切题是 620ms，必须等过它

ok('进入第 3 步（浓度）', getStepText().includes('希望它有多'), getStepText().slice(0, 100));
const slider = appRoot.querySelector('input');
ok('滑块存在', !!slider);
ok('滑块默认 3', slider && slider.attrs.value === '3', slider && slider.attrs.value);
ok('浓度说明有文字', getStepText().includes('中等'));

/* 拖到 2 */
slider.dispatch('input', { target: { value: '2' } });
await new Promise((r) => setTimeout(r, 30));
ok('拖动后文案更新', getStepText().includes('偏淡'), getStepText().slice(0, 200));

/* 进入第 4 步 */
const nextBtn = appRoot.querySelectorAll('.btn').find((b) => b.textContent.includes('上一题'));
ok('第 3 步有返回按钮', !!nextBtn);
const fwd = appRoot.querySelectorAll('.btn').find((b) => b.textContent.includes('下一步'));
ok('第 3 步有前进按钮', !!fwd);
fwd.dispatch('click');
await new Promise((r) => setTimeout(r, 300));

ok('进入第 4 步（香调）', getStepText().includes('受不了'), getStepText().slice(0, 120));
const chips = appRoot.querySelectorAll('.chip');
ok('香调 chip 已渲染', chips.length >= 16, `实际 ${chips.length}`);

// 回归守门：曾经用 entries.slice(0,16) 取"高频香调"，但数据按家族顺序排列，
// 前 16 个正好全是柑橘+花香+雪松檀木 —— 喜欢木质/琥珀/美食/清新的人
// 在"我喜欢"里一个可点的都没有，只有翻到"我受不了"（当时是全量 40 个）才看得到。
// 断言：折叠前可见的香调必须覆盖全部 6 个家族，且喜欢/讨厌两栏初始可见数相等。
const taxa = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));
const entryFamily = new Map(taxa.noteIndex.entries.map((n) => [n.zh, n.family]));
const visibleZh = chips.slice(0, 16).map((c) => c.textContent.trim());
const fams = new Set(visibleZh.map((z) => entryFamily.get(z)).filter(Boolean));
ok('首屏香调覆盖至少 4 个家族（防家族偏斜）', fams.size >= 4,
  `${fams.size} 个家族: ${[...fams].join(',')}`);
ok('首屏可选到「琥珀」「香草」这类琥珀/美食调',
  visibleZh.includes('琥珀') && visibleZh.includes('香草'), visibleZh.join(' '));

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
const sameZh = chips[0].textContent.trim();
// 按 data-col 找同名的讨厌栏副本。
// 不能拿 chips.length 当分界：chips 是静态快照，slice(自身长度) 永远是空数组，
// 第一版就是这样假失败成「未找到副本」。
const dislikeTwin = chips.find(
  (c) => c.getAttribute('data-col') === 'disliked' && c.textContent.trim() === sameZh
);
if (dislikeTwin) {
  dislikeTwin.dispatch('click');
  await new Promise((r) => setTimeout(r, 60));
  ok('两栏互斥：勾讨厌会取消喜欢', chips[0].getAttribute('aria-pressed') === 'false',
    `「${sameZh}」喜欢=${chips[0].getAttribute('aria-pressed')} 讨厌=${dislikeTwin.getAttribute('aria-pressed')}`);
  // 再点回喜欢，讨厌栏应随之取消
  chips[0].dispatch('click');
  await new Promise((r) => setTimeout(r, 60));
  ok('两栏互斥：勾喜欢会取消讨厌', dislikeTwin.getAttribute('aria-pressed') === 'false',
    `「${sameZh}」喜欢=${chips[0].getAttribute('aria-pressed')} 讨厌=${dislikeTwin.getAttribute('aria-pressed')}`);
} else {
  ok('两栏互斥可测（需讨厌栏含同名 chip）', false, `未找到「${sameZh}」的讨厌栏副本`);
}

/* 出结果 */
const finishBtn = appRoot.querySelectorAll('.btn').find((b) => b.textContent.includes('看推荐'));
ok('第 4 步有看推荐按钮', !!finishBtn);
finishBtn.dispatch('click');
await new Promise((r) => setTimeout(r, 300));

const resultText = getStepText();
ok('结果页标题', resultText.includes('你的三瓶候选'), resultText.slice(0, 100));
const picks = appRoot.querySelectorAll('.pick');
ok('吐出 3 瓶', picks.length === 3, `实际 ${picks.length}`);
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
ok('结果页无 NaN/undefined', !/NaN|undefined/.test(resultText), resultText.slice(0, 300));
// 抽样打印第一瓶，供人工核对
console.log('\n--- 第一瓶渲染结果 ---');
console.log(picks[0] ? picks[0].textContent.slice(0, 420) : '(无)');

fs.unlinkSync(tmpApp);

console.log(`\n===== 渲染测试 =====`);
console.log(`PASS ${pass}  FAIL ${fails.length}`);
fails.forEach((f) => console.log('  ✗ ' + f));
