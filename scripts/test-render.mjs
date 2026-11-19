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

/* ---------- 极简 SVG markup → TNode ----------
   只为 innerHTML 服务：盘心写进来的是 24 枚上色 SVG 的内部内容。
   认三种形态：自闭合 <tag .../>、开标签 <tag ...>、闭标签 </tag>。
   属性只按 `k="v"` / `k='v'` 取，够覆盖上色稿用到的全部属性。 */
function parseStubMarkup(src, parent) {
  const out = [];
  const stack = [{ node: { children: out, tagName: '#ROOT', attrs: {}, parentNode: parent }, name: '#ROOT' }];
  const re = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[5] != null) {
      const txt = m[5];
      if (txt.trim()) stack[stack.length - 1].node.children.push(txt);
      continue;
    }
    const [, closing, name, attrsRaw, selfClose] = m;
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs = {};
    const ar = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
    let a;
    while ((a = ar.exec(attrsRaw || ''))) attrs[a[1]] = a[2];
    const node = new TNode(name, attrs);
    node.parentNode = stack[stack.length - 1].node === parent ? parent : stack[stack.length - 1].node;
    stack[stack.length - 1].node.children.push(node);
    if (!selfClose) stack.push({ node, name });
  }
  return out;
}

/* ---------- 极简 DOM ---------- */
class TNode {
  constructor(tag, attrs = {}, kids = []) {
    this.tagName = String(tag).toUpperCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.parentNode = null;
    this._text = null;
    this._listeners = {};
    /* style 必须带 setProperty / removeProperty —— v3 的环境线用
       `#app.style.setProperty('--amb-warm', …)` 写 CSS 变量（那是标准 DOM API，
       也是"只改变量、不重绘"这条设计的落点）。桩里只有普通对象时，
       render() 会在第一屏就抛 TypeError，被 boot() 的 try/catch 吞成
       「加载失败」—— 测试只会看到空白页，看不出真正原因（本轮实测踩到）。
       按仓库既有纪律：桩缺能力就补桩，不能改业务代码为桩让路。 */
    this.style = {
      setProperty(k, v) { this[k] = String(v); },
      removeProperty(k) { delete this[k]; },
      getPropertyValue(k) { return this[k] ?? ''; },
    };
    /* dataset：app.js 用 `documentElement.dataset.build` 写构建标记。
       桩里做成普通对象就够 —— 只写不读，不需要往属性上映射 data-*。 */
    this.dataset = {};
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
    /* 早先这里只 strip 标签留纯文本 —— 因为 app.js 只有两处 innerHTML。
       现在盘心写的是整段上色 SVG 的 markup，strip 掉就什么都查不到了，
       于是补一个极简解析器：够认 <tag attr="v"/> 与嵌套，
       能重建出 path / circle / ellipse / g / defs 这几类节点。
       桩缺能力就补桩，不能改断言绕开 —— 否则测试和浏览器走两条路。 */
    this.children = parseStubMarkup(String(v), this);
    this._text = null;
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
  /* replaceChild / remove 是标准 DOM 方法，v3 的 syncEscort() 用到它
     （第 1 屏选完香型要**就地**换掉标本签，而不是重绘整屏 ——
     重绘会重播圆盘的转场动画）。桩里不实现就抛 TypeError，
     而浏览器里是正常的；按仓库纪律：桩缺能力就补桩，不改业务代码绕开。 */
  replaceChild(n, ref) {
    const i = this.children.indexOf(ref);
    if (typeof n !== 'string') n.parentNode = this;
    if (i >= 0) { this.children[i] = n; ref.parentNode = null; }
    return ref;
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
  /* replaceWith 与 insertBefore 同理：app.js:1098 `old.replaceWith(art)` 是
     标准 DOM 方法，桩里没有就抛 "old.replaceWith is not a function"。
     它只在 artInner() 的 promise 兑现后触发，所以本地跑常常"过了"，
     而 check-head 导出 HEAD 跑就红 —— 这类「时序决定红绿」的假失败
     比没有断言更浪费人：会让人去改业务代码绕开它。 */
  replaceWith(n) {
    const i = this.parentNode ? this.parentNode.children.indexOf(this) : -1;
    if (typeof n !== 'string') n.parentNode = this.parentNode;
    if (i >= 0) this.parentNode.children.splice(i, 1, n);
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
  /* app.js 在 boot() 里往 documentElement.dataset.build 写构建标记。
     桩缺 documentElement 会抛，被 boot() 的 try/catch 吞成"加载失败"，
     测试就只能看到空白页 —— 桩要补齐，不能让被测代码为桩让路。 */
  documentElement: new TNode('html'),
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
  /* text() 是后加的：盘心现在直接 fetch 上色 svg 并读 .text()。
     桩只实现 json() 时 artInner() 会抛、被 catch 成 ''，盘心静默变空白。 */
  try {
    const txt = fs.readFileSync(p, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(txt), text: async () => txt };
  } catch (e) {
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  }
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

  /* ⑥ 两层切换的进出场编排（v14，原 _wheel8.css，2026-11-10 并入 20-wheel-core.css）
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
    '_wheel7.css:361 写过 opacity:1（该层已并入 20-wheel-core.css），桌面端 v15 从来没退过标签');
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
/* 统一视框 —— 这就是"风格统一"的可断言部分。
   上色稿自带自己的 fill / stroke，所以外框不再要求 fill="none"，
   而是要求它挂 is-art 且真的把上色内容写了进去（见下面 shapeCount）。 */
ok('标本是 24×24 同一视框', plates[0].getAttribute('viewBox') === '0 0 24 24',
  plates[0].getAttribute('viewBox'));
ok('标本走的是上色通路（is-art）', plates[0].classList.contains('is-art'), plates[0].className);

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
/* ---- 每类一枚图标：数据完整性 + 两两不重复 ----
   线稿（SUB_MARKS / SUB_FIT）已于 2026-11-08 整块删除，盘心直接用
   icon-specimen/svg/ 里的上色稿。所以这里改成校验 ART_FILE 这张映射表，
   外加"每个映射到的文件真的存在、真的是 SVG、图元足够"。 */
{
  const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const s0 = appJs.indexOf('const ART_FILE = {');
  let depth = 0;
  let e0 = -1;
  for (let i = appJs.indexOf('{', s0); i < appJs.length; i += 1) {
    if (appJs[i] === '{') depth += 1;
    else if (appJs[i] === '}') { depth -= 1; if (depth === 0) { e0 = i + 1; break; } }
  }
  ok('能从 app.js 里切出 ART_FILE 块', s0 > 0 && e0 > s0);
  const ART = new Function(appJs.slice(s0, e0) + '; return ART_FILE;')();

  const TAXA_MARK = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));
  const allSubs = TAXA_MARK.families.flatMap((f) => f.subfamilies.map((s) => ({ id: s.id, fam: f.id })));
  const missing = allSubs.filter((s) => typeof ART[s.id] !== 'string').map((s) => s.id);
  ok('每个小类都有对应的上色 SVG（不缺格）', missing.length === 0,
    `缺 ${missing.length} 个: ${missing.join(',')}`);
  const extra = Object.keys(ART).filter((k) => !allSubs.some((s) => s.id === k));
  ok('没有多余的上色映射（不指向数据里不存在的格）', extra.length === 0, extra.join(','));

  /* 每个映射必须落到一个真实、可解析、图元足够的 svg 文件。
     「文件在」不够 —— 空 svg 也能 200，那等于盘心画了个空白。 */
  const files = allSubs.map((s) => ({ id: s.id, p: 'icon-specimen/svg/' + ART[s.id] + '.svg' }));
  const gone = files.filter((f) => !fs.existsSync(path.join(ROOT, f.p))).map((f) => f.id);
  ok('映射到的 SVG 文件都在磁盘上', gone.length === 0, gone.join(','));

  const thin = [];
  const noGrad = [];
  files.forEach((f) => {
    const full = path.join(ROOT, f.p);
    if (!fs.existsSync(full)) return;
    const svgTxt = fs.readFileSync(full, 'utf8');
    const shapes = (svgTxt.match(/<(path|circle|ellipse|rect|polygon)\b/g) || []).length;
    if (shapes < 6) thin.push(`${f.id}:${shapes}`);
    if (!/url\(#/.test(svgTxt)) noGrad.push(f.id);
  });
  ok('每枚上色 SVG 的图元数都够（>= 6）', thin.length === 0, thin.join(','));
  ok('每枚上色 SVG 都带渐变（不是单色块）', noGrad.length === 0, noGrad.join(','));

  /* 上色稿之间不重复：直接比文件字节。同一份文件被映射给两格是典型手误。 */
  const seenF = new Map();
  const dupF = [];
  files.forEach((f) => {
    const full = path.join(ROOT, f.p);
    if (!fs.existsSync(full)) return;
    const k = fs.readFileSync(full, 'utf8');
    if (seenF.has(k)) dupF.push(`${seenF.get(k)} / ${f.id}`);
    else seenF.set(k, f.id);
  });
  ok('全部上色 SVG 两两不同', dupF.length === 0, dupF.join(' ; '));
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

/* ======== 一屏一问 · v3 九屏（2026-11-16）========
   1 香型 / 2 预算 / 3 想要 / 4 不想要 / 5 气质 / 6 场合 / 7 季节 / 8 浓淡 / 9 已知款

   v3 的两处结构变化都直接改了这一段的数字，逐条写清为什么：
   ① **预算前置到第 2 屏**（规格「预算题前置」）：所以第 2 屏不再是"想要的味道"。
   ② **「整族排除」这一屏被删**：步骤表不再有 when() 动态分叉，
      九屏对所有人恒定 —— 所以原来那套"家族入口 8 步 / 情绪入口 9 步"
      的双数字断言整组作废，换成"恒为 9 步"。
      这不是把断言放松：双数字本身的**目的**是"两套数字必须一致"，
      而现在只有一套数字，一致性由"恒等 9"直接守住，比原来更硬。 */

ok('进入第 2 步（预算）', getStepText().includes('打算花多少'), getStepText().slice(0, 140));
ok('v3：进度显示共 9 步', /共 9 步/.test(appRoot.textContent),
  appRoot.textContent.slice(0, 40));

/* ---- 预算屏（第 2 屏）----
   规格把它前置，所以这里逐条钉住"它真的在第一屏之后、并且可跳过"。 */
{
  const segs = appRoot.querySelectorAll('.shelf-seg');
  ok('v3 预算屏：一条尺带上有「不限」+ 四个价位档', segs.length === 5,
    `实际 ${segs.length} 段`);
  const ids = segs.map((s) => s.getAttribute('data-band'));
  ok('v3 预算屏：不限在最前（默认值不该藏在末尾）', ids[0] === 'any', ids.join(','));
  ok('v3 预算屏：四档 id 与 ambient.js 的 BUDGET_BANDS 一致',
    ['b1', 'b2', 'b3', 'b4'].every((x) => ids.includes(x)), ids.join(','));

  /* 未选时不说"你选了第一档"：读数要老实说这是不限。
     这类"空态当默认值"的错在本项目历史上出现过（圆盘盘心空态）。 */
  const read0 = appRoot.querySelector('.shelf-read');
  ok('v3 预算屏：未选时读数是「不限」而不是某一档',
    !!read0 && /不限/.test(read0.textContent), read0 ? read0.textContent.slice(0, 60) : '(无读数)');

  /* 点一档：读数必须换成**这一档的真实瓶数**（不是百分比、不是硬编码）。 */
  segs[1].dispatch('click');
  await new Promise((r) => setTimeout(r, 60));
  const read1 = appRoot.querySelector('.shelf-read');
  const m = read1 ? read1.textContent.match(/(\d+)\s*瓶/) : null;
  ok('v3 预算屏：选中后读数给出这一档的真实瓶数', !!m && Number(m[1]) > 0,
    read1 ? read1.textContent.slice(0, 80) : '(无读数)');
  ok('v3 预算屏：读数不是百分比（价格档不冒充匹配度）',
    !!read1 && !/%/.test(read1.textContent), read1 ? read1.textContent : '');
  ok('v3 预算屏：选中一段后恰有一段是 checked',
    segs.filter((s) => s.getAttribute('aria-checked') === 'true').length === 1,
    String(segs.filter((s) => s.getAttribute('aria-checked') === 'true').length));
  /* 退回不限，后面的屏按"不筛价格"走 —— 否则整条主流程会被某一档绑住，
     而这一段的目的是验结构，不是验某一档都能凑够三瓶。 */
  segs[0].dispatch('click');
  await new Promise((r) => setTimeout(r, 60));
}

/* ---- 两处黑话文案已改（任务8 B，Eddie 2026-11-12 批准）----
   原文出自 POLISH-20261112.md §2 标出的两个候选：
     场合屏「主战场决定浓度下限」、浓淡屏「香精占比」。

   **读源码而不是读 DOM**：这两句分别在场合屏与浓淡屏，而这里只走到第 2 屏，
   DOM 里根本没有它们 —— 用 DOM 断言会恒真（找不到旧词 = 通过），
   那是一条假绿。直接对 app.js 的 STEPS 文案做文本断言，才真能抓到回退。

   同时钉"新文案在"：只钉"旧词不在"的话，把整句删掉也会通过。 */
{
  const src = appSrc;
  /* 只对 help 字面量做断言，不对整份源码做 includes：
     代码注释里会合法地引用旧文案（"原文是「主战场…」，改成…"）——
     对整份源码查旧词，会把这种解释性注释判成回退，那是假红。
     这里把 help 值抠出来再判。 */
  const helpValues = [...src.matchAll(/help: '([^']*)'/g)].map((m) => m[1]);
  const helpAll = helpValues.join('\n');
  ok('场合屏帮助文案已改为「最常在什么场合用…决定了推荐的浓淡」',
    helpAll.includes('你最常在什么场合用，决定了推荐的浓淡')
    && !helpAll.includes('主战场')
    && !helpAll.includes('浓度下限'),
    helpValues.find((h) => h.includes('场合')) || '(未找到)');
  ok('浓淡屏帮助文案已用「浓度类型」替掉「香精占比」',
    helpAll.includes('再说浓度类型（决定留香多久）')
    && !helpAll.includes('香精占比'),
    helpValues.find((h) => h.includes('体感')) || '(未找到)');
}

/* ======== v3：香调术语题已被生活情景取代 ========
   这是本轮最该被守住的一条底线（规格「全程无香调术语题」）。
   判据不是"没有 .chip"（那只是实现细节），而是两条同时成立：
     ① 上屏的每个选项都是 scenes.js 里的**生活词**；
     ② 它们背后挂的香调全部真实存在于 taxonomy 且至少命中 1 瓶
        —— 即"不许发明整套新题"，用户点的东西必须真能筛出瓶子。 */
{
  /* 第 3 屏：想要的味道 */
  const b = appRoot.querySelectorAll('.btn').find((x) => x.textContent.includes('下一步'));
  ok('第 2 步有前进按钮', !!b,
    appRoot.querySelectorAll('.btn').map((x) => x.textContent.trim()).join(' | ').slice(0, 120));
  if (b) { b.dispatch('click'); await new Promise((r) => setTimeout(r, 320)); }

  ok('进入第 3 步（想要的味道）', getStepText().includes('想闻到的'), getStepText().slice(0, 120));

  const cells = appRoot.querySelectorAll('.scene');
  ok('v3 「想要」屏是生活情景格子（不是香调 chip 墙）', cells.length > 0 && appRoot.querySelectorAll('.chip').length === 0,
    `情景格 ${cells.length} 个 / chip ${appRoot.querySelectorAll('.chip').length} 个`);

  /* 每一格的主词必须来自 LIKED_SCENES（用导出表比对，不硬编码字符串）。 */
  const S = appMod.__scenes;
  const likedZh = new Set(S.liked.map((s) => s.zh));
  const shown = cells.map((c) => {
    const zhNode = c.querySelectorAll('.scene-zh')[0];
    return zhNode ? zhNode.textContent.trim() : '';
  });
  ok('v3 「想要」屏每格主词都来自 scenes.js（没有临时编题）',
    shown.length > 0 && shown.every((z) => likedZh.has(z)),
    shown.filter((z) => !likedZh.has(z)).join(' / ') || shown.slice(0, 4).join(' / '));

  /* 底线：每格挂着的那味香调必须在 taxonomy 里、且至少命中 1 瓶。
     用一个都不存在的表比对，才能抓到"写错一个字符导致 0 命中"
     —— 这类错不会报错，只会让用户点了没反应。 */
  const { matchesNote, tokenize, normNote } = await import(
    'file:///' + path.join(ROOT, 'src/notes.js').replace(/\\/g, '/'));
  const perfs0 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8')).perfumes;
  const taxa0 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));
  const entryByEn = new Map(taxa0.noteIndex.entries.map((e) => [normNote(e.en), e]));
  const tokCache = perfs0.map((p) => (p.notesAll || []).map((x) => tokenize(x)));
  const hitsOf = (en) => {
    const e = entryByEn.get(normNote(en));
    if (!e) return -1;
    let n = 0;
    for (const toks of tokCache) if (toks.some((t) => matchesNote(e, null, t))) n += 1;
    return n;
  };
  const deadScenes = [];
  for (const s of [...S.liked, ...S.avoid]) {
    for (const en of s.notes) if (hitsOf(en) <= 0) deadScenes.push(`${s.id}:${en}`);
  }
  ok('v3 情景表里每一味香调都真实存在且至少命中 1 瓶（无死格）',
    deadScenes.length === 0, deadScenes.join(', ') || `共核对 ${S.allNotes().length} 味`);

  /* 一格不超过 4 味：多了等于"我全都要"，区分度会掉光。 */
  const tooMany = [...S.liked, ...S.avoid].filter((s) => s.notes.length > 4).map((s) => s.id);
  ok('v3 每格挂不超过 4 味香调（多了就退化成"我全都要"）',
    tooMany.length === 0, tooMany.join(',') || '全部 ≤4');

  /* 点一格：译文行要换成那一格的大白话（学圆盘圆心那句） */
  const transBefore = (appRoot.querySelector('.scene-trans') || {}).textContent || '';
  cells[0].dispatch('click');
  await new Promise((r) => setTimeout(r, 80));
  const transAfter = (appRoot.querySelector('.scene-trans') || {}).textContent || '';
  ok('v3 选中一格后译文行跟着换（不是静态说明）',
    transAfter !== transBefore && transAfter.length > 0,
    `${transBefore.slice(0, 30)} → ${transAfter.slice(0, 30)}`);
  ok('v3 选中的格标了 aria-pressed',
    appRoot.querySelectorAll('.scene').some((c) => c.getAttribute('aria-pressed') === 'true'));

  /* 环境线：选了清新系应当往"凉"走。这一条直接调纯函数，
     不读 DOM —— 读色值只能看到最终值，验不出"是累加还是覆盖"。 */
  const amb = appMod.__ambient;
  const cool = amb.of({ family: 'citrus' });
  const warm = amb.of({ family: 'amber' });
  ok('v3 环境线：选柑橘比选琥珀更凉（同一函数、只差一个答案）',
    cool.temp < warm.temp, `citrus ${cool.temp.toFixed(2)} vs amber ${warm.temp.toFixed(2)}`);
  ok('v3 环境线：选琥珀比选柑橘更暖更重',
    warm.weight > cool.weight, `amber ${warm.weight.toFixed(2)} vs citrus ${cool.weight.toFixed(2)}`);
  /* 累积而不是覆盖：在柑橘之上再加一个"夏天"，应当比只有柑橘**更凉**。 */
  const coolSummer = amb.of({ family: 'citrus', season: 'summer' });
  ok('v3 环境线是累积的（加一个夏天答案，不会把前面的答案推翻）',
    coolSummer.temp <= cool.temp + 1e-9 && coolSummer.light >= cool.light,
    `citrus ${cool.temp.toFixed(2)}/${cool.light.toFixed(2)} → +summer ${coolSummer.temp.toFixed(2)}/${coolSummer.light.toFixed(2)}`);
  /* 幅度必须夹在 [-1,1]：答满九屏也不许超出，否则色值会被压成死色。 */
  const extreme = amb.of({
    family: 'amber', occasion: 'formal', season: 'autumn', concentration: 'parfum', intensity: 5,
  }, { moodDims: { temp: 1, sweet: 1, weight: 1 }, scenePush: { temp: 1, light: -1 } });
  ok('v3 环境线三轴都夹在 [-1,1]（答满也不越界）',
    Math.abs(extreme.temp) <= 1 && Math.abs(extreme.light) <= 1 && Math.abs(extreme.weight) <= 1,
    `${extreme.temp.toFixed(2)}/${extreme.light.toFixed(2)}/${extreme.weight.toFixed(2)}`);

  /* ---- 第 4 屏：不想要 ---- */
  const b2 = appRoot.querySelectorAll('.btn').find((x) => x.textContent.includes('下一步'));
  ok('第 3 步有前进按钮', !!b2);
  if (b2) { b2.dispatch('click'); await new Promise((r) => setTimeout(r, 320)); }
  ok('进入第 4 步（不想要的味道）', getStepText().includes('不想靠近'), getStepText().slice(0, 120));
  const negCells = appRoot.querySelectorAll('.scene');
  ok('v3 「不想要」屏也是生活情景，且与上一屏不是同一批',
    negCells.length > 0 && negCells.length !== cells.length,
    `不想要 ${negCells.length} 格 / 想要 ${cells.length} 格`);
  ok('v3 「不想要」屏挂了多选语义（它不是单选）',
    appRoot.querySelector('.scene-grid')
    && appRoot.querySelector('.scene-grid').getAttribute('aria-multiselectable') === 'true',
    (appRoot.querySelector('.scene-grid') || {}).getAttribute
      ? String(appRoot.querySelector('.scene-grid').getAttribute('aria-multiselectable')) : '(无)');
}

/* ======== 第 5–9 屏（v3：气质 / 场合 / 季节 / 浓淡 / 已知款）========
   与 v19 相比只剩一处位移：预算插在第 2 屏，于是原来第 2 屏之后的每一屏
   都往后挪一位；「整族排除」整屏删除。编号与短语在这里同步更新。 */
const stepNames = [
  [5, '给人什么感觉', 'mood'],
  [6, '主要什么时候用', 'occasion'],
  [7, '主要在哪个季节用', 'season'],
  [8, '想要多浓', 'concentration'],
  [9, '试过、并且喜欢', 'anchor'],
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
     133 项原生下拉只能滚，是全场唯一无法用输入法到达的地方。
     一屏一问之后 anchor 是第 8 步（家族入口，浓淡+浓度合屏后）。 */
  if (n === 9) { /* v3: anchor 从第 8 屏挪到第 9 屏（预算前置） */
    const combos = appRoot.querySelectorAll('.combo-input');
    ok('末步品牌是可搜索组合框', combos.length === 1, `实际 ${combos.length}`);
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
  if (n === 8) { /* v3: 浓淡从第 7 屏挪到第 8 屏（预算前置） */
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

    /* 2026-11-11 合屏：浓淡与浓度必须是**同一屏**，且 ③ 留香仍在。
       这三条钉的是"合回去了"，而不是"顺序碰巧对"：
         · 滑块（①）与浓度卡（②）同时存在于本屏；
         · 三项编号 ①②③ 都出现 —— 一屏三个物件必须有编号，否则用户说不清在答第几个；
         · ③ 在未选浓度时是空态（不能凭空显示一个推断值）。 */
    const grid = appRoot.querySelector('.choice-grid');
    const concIds = grid ? grid.querySelectorAll('[role="radio"]').map((x) => x.attrs['data-id']) : [];
    ok('合屏后 ① 滑块与 ② 浓度卡同屏',
      ticks.length === 5 && concIds.length >= 4, `滑块 ${ticks.length} 个刻度 / 浓度卡 ${concIds.length} 张`);
    ok('浓度卡是 EDC…Extrait 这一组档位',
      concIds.includes('eau-de-parfum') && concIds.includes('eau-de-toilette'),
      concIds.join(','));
    const stepTxt = getStepText();
    ok('合屏后三个物件都带编号（① ② ③）',
      /①/.test(stepTxt) && /②/.test(stepTxt) && /③/.test(stepTxt),
      stepTxt.slice(0, 120));
    ok('未选浓度时 ③ 留香是空态（不凭空给推断值）',
      appRoot.querySelectorAll('.long-read.is-empty').length === 1,
      `空态 ${appRoot.querySelectorAll('.long-read.is-empty').length} 个`);
  }
  /* 「整族排除」那三条 aria 断言已从这里移走 ——
     家族入口下这一屏不再出现（app.js 的 STEPS[].when）。它们现在挂在
     文件末尾的「v36 入口分叉」段，在情绪入口下重新跑一遍。
     留在原处会让这条循环在 n===6（现在是 anchor 屏）时去查 .choice-grid，
     报「(无 .choice-grid)」—— 那不是回归，是断言挂错了入口。 */
  if (n === 5) { /* v3: 气质从第 4 屏挪到第 5 屏（预算前置） */
    /* v37：冷暖与甜度已合并进「整体气质」那一组卡片（见 app.js 的 deriveFromPreset）。
       这一屏不再有分段控件，所以原来的四条 .seg 断言整组作废。
       替换成三条钉住"合并后仍然能表达这两维"的断言：
       ① 七个原型各有 dims；② 选了原型就写回 temperature/sweetness；
       ③ 不再有第二、三个独立控件。 */
    const segs = appRoot.querySelectorAll('.seg');
    ok('v37 第 3 步不再有冷暖/甜度分段控件', segs.length === 0, `实际 ${segs.length}`);

    const presets = appRoot.__presets || [];
    ok('v37 七个原型都带 dims（temp/sweet/weight）',
      presets.length === 7 && presets.every((c) => c.dims
        && typeof c.dims.temp === 'number'
        && typeof c.dims.sweet === 'number'
        && typeof c.dims.weight === 'number'),
      presets.map((c) => (c.dims ? `${c.id}:${c.dims.temp}/${c.dims.sweet}` : `${c.id}:无`)).join(' '));

    /* dims 必须真的映射到 temperature/sweetness，且七个原型两两不同 ——
       若两个原型推出同一组冷暖甜度，说明映射写漏了。 */
    if (appRoot.__derivePreset) {
      const derived = presets.map((c) => {
        const d = appRoot.__derivePreset(c.id);
        return d ? `${d.temperature}/${d.sweetness}` : 'null';
      });
      ok('v37 每个原型都能推出冷暖与甜度',
        derived.every((x) => x !== 'null'), derived.join(' '));
      /* temp 是二值、sweet 是二值 → 最多种组合 2×2 = 4 种。
         七个原型正好铺满这 4 种（缺的那一格是"冷+甜+重"，
         1228 瓶里只有 12 瓶，数据撑不起一个选项，见 D51）。
         断言取 4 而不是 3 —— 我第一版凭"2×2×2 缺一格"的印象写了 3，
         实际缺的那格在 weight 维度，不在 temp×sweet 平面上。 */
      const uniq = [...new Set(derived)];
      ok('v37 原型到冷暖甜度的映射铺满 4 种组合（2×2）',
        uniq.length === 4, `${uniq.length} 种: ${uniq.sort().join(' ')}`);
      ok('v37 冷暖甜度映射随原型变化（不是常量）',
        new Set(presets.map((c) => c.dims.temp)).size === 2
        && new Set(presets.map((c) => c.dims.sweet)).size === 2,
        `temp 取值 ${[...new Set(presets.map((c) => c.dims.temp))].join(',')} / `
        + `sweet 取值 ${[...new Set(presets.map((c) => c.dims.sweet))].join(',')}`);
    }
  }
  if (n === 5) { /* v3: 气质从第 4 屏挪到第 5 屏（预算前置） */
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
  if (n === 5) { /* v3: 气质从第 4 屏挪到第 5 屏（预算前置） */
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
/* 断言"有看推荐按钮"，不写死步号 —— v36 起步数按入口变（家族 6 / 情绪 7），
   写死「第 13 步」这种历史遗留编号，每次调整步骤都会误报一次，
   而且报错信息里看不出真正的原因（它只是在数一个已经不存在的编号）。 */
ok('末步有看推荐按钮', !!finishBtn,
  `按钮：${appRoot.querySelectorAll('.btn').map((x) => x.textContent.trim()).join(' | ').slice(0, 120)}`);
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
       badgeTextFor 是这次抽出来的纯函数，见 app.js。

       **V3 改法 3c 同步（2026-11-14）**：无百分比时的文案按
       docs/visual-spec-changelist-20261114.md 的 3c 从「原始分最高」改成
       「最接近你答的」——「原始分最高」是排序实现的术语，描述的是我们的算法，
       不是用户能理解的事。这里只同步这一个字面量，**断言的意图一字未改**：
       仍然是「有百分比才允许说最匹配，没有时必须说一句只陈述事实的话」。
       若将来再改文案，改这一行即可，不要放宽成 /最匹配/ 的否定式 ——
       那样「最接近你答的」被改成「最匹配」也不会红。 */
    if (appMod.__aff && appMod.__badgeText) {
      ok('无百分比时徽标不用「最匹配」',
        appMod.__badgeText(false) === '最接近你答的', appMod.__badgeText(false));
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

/* ---------- v3：结果页两条退路（规格底线要求保留）----------
   ① 换一批     —— 同一份答案换三瓶，且**真的换**（不是把顺序搬一下）
   ② 改一题重推 —— 回第 1 屏但保留已答项（与"重新来一次"是两件事）

   判据为什么落在"名字变了"而不是"按钮存在"：
   按钮存在是零信息量（它总是存在）。真正会坏的是 reroll() 里那段
   游标推进 —— 如果它推错了或者 buffer 只有 3 瓶，用户点下去三瓶名字
   一个都不变，而按钮看着完全正常。 */{
  const btns = appRoot.querySelectorAll('.btn').map((b) => b.textContent.trim());
  ok('v3：结果页有「换一批」', btns.some((t) => t.includes('换一批')), btns.join(' | '));
  ok('v3：结果页有「改一题重推」', btns.some((t) => t.includes('改一题')), btns.join(' | '));

  const namesNow = () => appRoot.querySelectorAll('.pick h3').map((h) => h.textContent.trim());
  const before = namesNow();
  const rerollBtn = appRoot.querySelectorAll('.btn').find((b) => b.textContent.includes('换一批'));
  if (rerollBtn) {
    rerollBtn.dispatch('click');
    await new Promise((r) => setTimeout(r, 400));
    const after = namesNow();
    ok('v3：换一批真的换掉了三瓶（不是只换顺序）',
      after.length === 3 && after.some((n) => !before.includes(n)),
      `${before.join('/')} → ${after.join('/')}`);
    /* 换完之后理由必须仍在 —— 换一批如果只换名字不换理由，
       用户会看到"瓶子变了但理由还是上一瓶的"，那是最难解释的错。 */
    ok('v3：换一批之后每张卡仍有理由与三调',
      appRoot.querySelectorAll('.reasons').length === 3
      && appRoot.querySelectorAll('.pyramid').length === 3,
      `理由 ${appRoot.querySelectorAll('.reasons').length} / 三调 ${appRoot.querySelectorAll('.pyramid').length}`);
  }

  /* 改一题：回第 1 屏，且**保留**已答项（判据是回到第一屏时香型仍选中）。 */
  const gotoBtn = appRoot.querySelectorAll('.btn').find((b) => b.textContent.includes('改一题'));
  if (gotoBtn) {
    gotoBtn.dispatch('click');
    await new Promise((r) => setTimeout(r, 400));
    ok('v3：改一题重推回到第 1 屏',
      getStepText().includes('哪一类味道'), getStepText().slice(0, 80));
    ok('v3：改一题重推保留已答的香型（不是清空重来）',
      appRoot.querySelectorAll('.disc-sector')
        .some((b) => b.getAttribute('aria-checked') === 'true'),
      '回到第 1 屏时香型未保持选中 —— 那是 restart 的语义，不是"改一题"');
    /* 回到结果页，后面的断言还要用（走一遍剩余步骤即可）。 */
    let guard = 0;
    while (guard++ < 14) {
      const b = appRoot.querySelectorAll('.btn').find((x) => x.textContent.includes('下一步'));
      if (!b) break;
      b.dispatch('click');
      await new Promise((r) => setTimeout(r, 160));
    }
    const fin2 = appRoot.querySelectorAll('.btn').find((x) => x.textContent.includes('看推荐'));
    if (fin2) { fin2.dispatch('click'); await new Promise((r) => setTimeout(r, 600)); }
    ok('v3：改一题后仍能重新出结果', appRoot.querySelectorAll('.pick').length === 3,
      `实际 ${appRoot.querySelectorAll('.pick').length} 张卡`);
  }
}

/* ---------- 可分享的结果摘要卡（方向 B：截图友好）----------
   这张卡是"一屏截得下、截图能自证"的载体。四条断言分别守：
     ① 存在且只有一张（多了说明结果页被重绘两次）
     ② 三瓶全在里面（少一瓶就说明 results 与卡不同步）
     ③ 每瓶都带一句理由（没有理由就退化成三个名字，产品硬约束丢了）
     ④ 带"按规则打分 / 不调用大模型"的出处说明（截图离开站点后仍可自证） */
{
  const cards = appRoot.querySelectorAll('[data-share="result-summary"]');
  ok('结果页有一张可分享摘要卡', cards.length === 1, `实际 ${cards.length} 张`);
  if (cards.length === 1) {
    const items = cards[0].querySelectorAll('.share-item');
    ok('摘要卡里正好三瓶', items.length === 3, `实际 ${items.length}`);
    const withReason = items.filter((it) => {
      const r = it.querySelectorAll('.share-reason');
      return r.length === 1 && r[0].textContent.trim().length > 0;
    });
    ok('摘要卡每瓶都带一句理由（截图后仍能反推）',
      withReason.length === items.length, `${withReason.length}/${items.length} 瓶有理由`);
    const rankNums = items.map((it) => it.querySelectorAll('.share-rank')[0].textContent.trim());
    ok('摘要卡名次是 1/2/3 且有序',
      rankNums.join(',') === '1,2,3', rankNums.join(','));
    const foot = cards[0].querySelectorAll('.share-foot')[0];
    ok('摘要卡带出处说明（离开站点后仍可自证）',
      !!foot && /规则打分/.test(foot.textContent) && /大模型/.test(foot.textContent),
      foot ? foot.textContent.slice(0, 40) : '(无 .share-foot)');
    /* 摘要卡的名次必须与上面三张大卡一致 —— 不一致是最难解释的那种 bug：
       同一页两处说不同的话。这里只验第一名的名字出现在摘要卡首位。 */
    const firstName = cards[0].querySelectorAll('.share-name strong')[0];
    const firstCardName = appRoot.querySelectorAll('.pick h3')[0];
    ok('摘要卡第一名与结果卡第一名一致',
      !!firstName && !!firstCardName
        && firstCardName.textContent.includes(firstName.textContent.trim()),
      `摘要「${firstName ? firstName.textContent : '-'}」vs 卡「${firstCardName ? firstCardName.textContent.slice(0, 20) : '-'}」`);
  }
}
/* ---------- 推广链接：三档语义必须分得开 ----------
   v27 起购买入口分成三档，断言必须逐档钉住，否则"降级"和"假广告"
   两种错误都会溜过去：

     ① direct —— 三件套（target/pid/productBase）齐全，有佣金
        → `.buy-link` 且 `data-affiliate="true"`、rel 含 sponsored
        → 页面上**不挂**任何广告披露（2026-11-08 起按用户要求删除）
     ② link  —— 预生成直达页，无佣金
        → `.buy-link.is-search`、`data-affiliate="false"`、rel **不含** sponsored
        → **不挂**广告披露
     ③ search —— 平台搜索页兜底，零配置
        → `.buy-link.is-search`、`data-affiliate="false"`、rel **不含** sponsored
        → 跟一句 `.link-note`，说明"这是搜索结果页"

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
  /* 数量断言从「每瓶固定 3 个」改成**按瓶分组的结构不变量**。
     原因（2026-11-08）：淘宝物料接口打通后，`data/affiliate-links.json`
     里真有几百条直达短链了，样例里某瓶一旦命中就会从「2 条搜索渠道」
     变成「1 条直达链」—— 这是设计意图（direct > search），不是回归。
     把总数钉死，等于让数据变好就把测试变红。

     改成钉三条不变量，任何一条破了都是真错：
       ① 每瓶至少 1 个淘宝入口；
       ② 淘宝入口要么「直达链」，要么「official + market 成对」；
       ③ 直达链与搜索链的文案各自成立（不能说反）。 */
  const byPlat = (p) => buy.filter((a) => String(a.attrs['data-platform']) === p);
  const jd = byPlat('jd');
  const tb = byPlat('taobao');
  const tbByCard = new Map();
  const cardOf = (a) => {
    let n = a.parentNode;
    while (n && !(n.classList && n.classList.contains('pick'))) n = n.parentNode;
    return n;
  };
  for (const a of tb) {
    const c = cardOf(a);
    if (!c) continue;
    if (!tbByCard.has(c)) tbByCard.set(c, []);
    tbByCard.get(c).push(a);
  }
  ok('每瓶至少 1 个淘宝入口', tbByCard.size === 3 && [...tbByCard.values()].every((v) => v.length >= 1),
    `卡片 ${tbByCard.size} 张，入口数 ${[...tbByCard.values()].map((v) => v.length).join(',')}`);

  /* 三档 channel 的实际取值（app.js:3608/3635/3680/3692）：
       product  → 直达这一瓶（真实短链或商品页）
       official / market → 两条搜索渠道
     先前用「有没有 data-channel」分档是错的 —— product 也带这个属性，
     结果直达链被算进搜索渠道，三条断言连带红。 */
  const SEARCH_CH = new Set(['official', 'market']);
  const directTb = tb.filter((a) => !SEARCH_CH.has(String(a.attrs['data-channel'])));
  const channelTb = tb.filter((a) => SEARCH_CH.has(String(a.attrs['data-channel'])));
  ok('淘宝入口要么直达链、要么 official+market 成对',
    [...tbByCard.values()].every((v) => {
      const ch = v.filter((a) => SEARCH_CH.has(String(a.attrs['data-channel'])));
      if (ch.length === 0) return true;                       // 全是直达链
      const hasO = ch.some((a) => a.attrs['data-channel'] === 'official');
      const hasM = ch.some((a) => a.attrs['data-channel'] === 'market');
      return hasO && hasM;                                    // 有搜索就两条一起有
    }),
    [...tbByCard.values()].map((v) => v.map((a) => a.attrs['data-channel'] || '?').join('+')).join(' | '));

  /* 直达链是「这一瓶」的商品页，搜索链是「搜索结果页」——
     两种落地的事实不同，文案不能混。混了就是撒谎。 */
  ok('直达链文案说「买这一瓶」不说「搜」',
    directTb.every((a) => /买这一瓶/.test(a.textContent) && !/搜/.test(a.textContent)),
    directTb.map((a) => a.textContent.replace(/\s+/g, ' ')).join(' | '));
  ok('搜索链文案说「搜」不说「买这一瓶」',
    channelTb.every((a) => /搜/.test(a.textContent) && !/买这一瓶/.test(a.textContent)),
    channelTb.map((a) => a.textContent.replace(/\s+/g, ' ')).join(' | '));
  ok('直达链落地在联盟转链域名上',
    directTb.every((a) => appMod.__aff.isAffiliateHost('taobao', String(a.attrs.href))),
    directTb.map((a) => String(a.attrs.href).slice(0, 46)).join(' | '));

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
  /* ---- 淘宝：有 pid → 带佣金，kind 一律 direct（直达链与搜索推广页都算） ---- */
  ok('淘宝有 pid → kind=direct',
    tb.every((a) => String(a.attrs['data-kind']) === 'direct'),
    tb.map((a) => a.attrs['data-kind']).join(','));
  ok('淘宝佣金链接 data-affiliate=true',
    tb.every((a) => String(a.attrs['data-affiliate']) === 'true'),
    tb.map((a) => a.attrs['data-affiliate']).join(','));
  ok('淘宝佣金链接标 sponsored',
    tb.every((a) => String(a.attrs.rel || '').includes('sponsored')),
    tb.map((a) => a.attrs.rel).join(' | '));
  /* 搜索渠道必须落到 uland 且带 pid；直达链走的是转链域名，没有 uland 的 pid 参数，
     所以这条只对 channelTb 生效（对 tb 全体断言时，一旦某瓶命中直达链就红）。 */
  ok('搜索渠道落到 uland 且 pid 在 URL 里',
    channelTb.every((a) => String(a.attrs.href).includes('uland.taobao.com')
      && String(a.attrs.href).includes('pid=mm_')),
    channelTb.map((a) => String(a.attrs.href).slice(0, 52)).join(' | '));

  /* ---- 官方 / 全网两个渠道必须真的可分 ----
     用户要的是「一个官方来源 + 第三方店铺」。能被静态站保证的区分方式
     只有关键词（排序参数实测无效，见 app.js 注释），所以断言钉在
     URL 里的关键词上，而不是钉文案 —— 文案可以改，URL 行为不能。 */
  const official = tb.filter((a) => String(a.attrs['data-channel']) === 'official');
  const market = tb.filter((a) => String(a.attrs['data-channel']) === 'market');
  ok('official 与 market 数量相等（成对出现）',
    official.length === market.length,
    `official=${official.length} market=${market.length}`);
  ok('official 渠道关键词带「官方旗舰店」',
    official.every((a) => decodeURIComponent(String(a.attrs.href)).includes('官方旗舰店')),
    official.map((a) => decodeURIComponent(String(a.attrs.href)).slice(0, 70)).join(' | '));
  ok('market 渠道关键词不带「官方旗舰店」',
    market.every((a) => !decodeURIComponent(String(a.attrs.href)).includes('官方旗舰店')),
    market.map((a) => decodeURIComponent(String(a.attrs.href)).slice(0, 70)).join(' | '));
  /* 两个渠道的 scope 短语必须渲染出来 —— 否则用户看不出按钮差在哪 */
  ok('两个渠道的适用范围都渲染在按钮里',
    channelTb.every((a) => /官方旗舰店|全网/.test(a.textContent)),
    channelTb.map((a) => a.textContent.replace(/\s+/g, ' ').slice(0, 30)).join(' | '));

  /* 安全基线两档都要 */
  ok('全部外链都带 noopener noreferrer',
    buy.every((a) => /noopener/.test(String(a.attrs.rel || '')) && /noreferrer/.test(String(a.attrs.rel || ''))),
    buy.map((a) => a.attrs.rel).join(' | '));

  /* ---- 手机端唤起淘宝 App（任务 7，Eddie 2026-11-11 23:47）----
     验收口径是"手机上点结果页的购买链接，必须唤起淘宝 App 直达商品页，
     不许落到需要网页登录的桌面版"。这里分三层钉：

       ① 包装规则：tbopenHref 只放行 http(s)，且把原链接**原样**放进 h5Url
          （pid / e 参数一个字节都不能丢，否则佣金归属就变了）
       ② 兜底：唤起失败落到移动版 uland（带 pid、带关键词），不是桌面 s.taobao
       ③ 渲染：手机上淘宝按钮 href 是 tbopen://，桌面上仍是原网页链接

     这三条都是纯函数 + DOM 属性，能在这里测；真机唤起本地测不了，
     已写进 docs/reviews/BUY-MOBILE-20261111.md 的"未核实"一节。 */
  {
    const A = appMod.__aff;
    ok('tbopen 包装把原链接完整放进 h5Url',
      (() => {
        const src = 'https://s.click.taobao.com/t?e=abc%2Bdef&pid=mm_1_2_3';
        const wrapped = A.tbopenHref(src);
        if (!wrapped) return false;
        const inner = decodeURIComponent(wrapped.split('h5Url=')[1]);
        return inner === src;
      })(),
      String(A.tbopenHref('https://s.click.taobao.com/t?e=abc')).slice(0, 80));

    ok('tbopen 包装带 action=ali.open.nav（App 接管的必要参数）',
      /action=ali\.open\.nav/.test(String(A.tbopenHref('https://s.click.taobao.com/t?e=x'))),
      String(A.tbopenHref('https://s.click.taobao.com/t?e=x')).slice(0, 90));

    /* 非 http(s) 不许借道 —— 否则 javascript: 能混进 href */
    ok('tbopen 拒绝非 http(s) 输入',
      A.tbopenHref('javascript:alert(1)') === null
      && A.tbopenHref('taobao://x') === null
      && A.tbopenHref('') === null,
      String(A.tbopenHref('javascript:alert(1)')));

    /* 兜底必须是**移动版**：uland 的 sem/tbsearch 在 iPhone UA 下实测
       vw=390、有价格节点；而 s.taobao.com/search 在同一 UA 下仍是桌面版式。
       所以这条断言钉的是"兜底落在 uland"，不是随便一条淘宝链接。 */
    const fb = A.mobileFallback({ brand: 'Creed', name: 'Aventus' }, A.config());
    ok('唤起失败的兜底是移动版 uland 且带 pid',
      !!fb && fb.includes('uland.taobao.com/sem/tbsearch') && fb.includes('pid=mm_'),
      String(fb).slice(0, 90));
    ok('兜底保留商品关键词（不是跳到淘宝首页）',
      !!fb && decodeURIComponent(fb).includes('Creed') && decodeURIComponent(fb).includes('Aventus'),
      decodeURIComponent(String(fb)).slice(0, 80));
    ok('兜底不是桌面搜索结果页 s.taobao.com/search',
      !!fb && !/s\.taobao\.com\/search/.test(fb),
      String(fb).slice(0, 60));

    /* 渲染侧：测试桩没有 matchMedia，isMobileContext() 返回 false，
       所以这里走的是**桌面路径** —— 正好用来钉"桌面不唤起"。 */
    ok('桌面渲染不包 tbopen（按钮仍是原网页链接）',
      buy.every((a) => !String(a.attrs.href).startsWith('tbopen://')),
      buy.map((a) => String(a.attrs.href).slice(0, 26)).join(' | '));

    /* 手机路径用纯函数直接验：把同一条链接包起来，看 href 形态。
       这一段不依赖渲染，所以不受测试桩缺 matchMedia 的影响。 */
    const tbLink = A.links({ brand: 'Creed', name: 'Aventus' }, A.config())
      .filter((l) => l.platform === 'taobao');
    ok('淘宝入口都能被包成 tbopen:// 且内容不变',
      tbLink.length > 0 && tbLink.every((l) => {
        const w = A.tbopenHref(l.href);
        return !!w && w.startsWith('tbopen://') && decodeURIComponent(w.split('h5Url=')[1]) === l.href;
      }),
      tbLink.map((l) => String(l.href).slice(0, 40)).join(' | '));
  }

  /* ---- 披露：2026-11-10 19:19 起改为**页脚一行**，按钮上不再挂角标 ----
     沿革（四段，每次都是 Eddie 拍板，别把名字记混）：
       2026-11-02 页脚挂整段「购买链接为推广链接」
       2026-11-08 用户要求整段删掉，页面只剩 rel=sponsored
       2026-11-10 15:46 加按钮角标（commit 583534a）
       2026-11-10 19:19 去角标、改回页脚一行（本次，决策原文「还是去掉角标，
                        只留页脚声明」）
     所以断言从「有佣金关系的按钮必须有角标」反转成：
       · 按钮内**不许**再有任何 .aff-note 角标
       · 页脚必须有且只有一条 .aff-note 披露，且写明佣金与不影响支付价格
       · rel=sponsored 不变（机器可读信号保留）

     同时钉住保留的两条说明（它们不是广告披露，是事实说明）：
       · 双渠道说明：讲两个按钮差在哪、价格没排序
       · 搜索兜底说明：讲点进去是搜索结果不是商品页
     两者都用 .link-note。 */
  const cards = [...appRoot.querySelectorAll('.pick')];
  const directBuy = buy.filter((a) => a.attrs['data-kind'] === 'direct');
  const nonDirectBuy = buy.filter((a) => a.attrs['data-kind'] !== 'direct');
  /* 按钮内的角标单独数：notes 是**全页** .aff-note（现在含页脚那一条），
     直接拿 notes.length 判按钮会误伤。 */
  const badgeInBuy = buy.reduce((n, a) => n + a.querySelectorAll('.aff-note').length, 0);
  ok('按钮上不再挂「广告」角标（Eddie 2026-11-10 19:19 决策）',
    badgeInBuy === 0,
    `仍有 ${badgeInBuy} 枚 .aff-note 挂在按钮内`);
  /* 页脚披露：类名 .aff-note，且在 .foot 里 —— 这是唯一允许出现广告披露的位置。 */
  const footDisclosure = appRoot.querySelectorAll('footer.foot .aff-note');
  ok('结果页页脚有且只有一行广告披露',
    footDisclosure.length === 1,
    `实际 ${footDisclosure.length} 行`);
  ok('页脚披露写明「佣金」与「不影响支付价格」', (() => {
    const t = (footDisclosure[0] || {}).textContent || '';
    return /佣金/.test(t) && /不影响/.test(t);
  })(), ((footDisclosure[0] || {}).textContent || '').slice(0, 40));
  /* 披露只在结果页渲染（问卷屏没有任何购买链接）。DOM 桩支持有限，
     这里钉住可判定的两点：披露带机器可读标记，且全页 .aff-note 只此一处。 */
  ok('页脚披露带机器可读标记',
    footDisclosure.length === 1 && footDisclosure[0].attrs['data-disclosure'] === 'affiliate-footer',
    String((footDisclosure[0] || {}).attrs && footDisclosure[0].attrs['data-disclosure']));
  ok('全页 .aff-note 只有页脚那一条（按钮内已清零）',
    badgeInBuy === 0 && appRoot.querySelectorAll('.aff-note').length === 1,
    `按钮内 ${badgeInBuy} 枚，全页 ${appRoot.querySelectorAll('.aff-note').length} 条`);
  /* sponsored 是机器可读信号，与页面文案无关，必须照旧。 */
  ok('有佣金关系的按钮仍带 rel=sponsored（机器可读信号不变）',
    directBuy.length > 0 && directBuy.every((a) => String(a.attrs.rel || '').includes('sponsored')),
    directBuy.map((a) => a.attrs.rel).join(' | '));

  /* ---- 介绍页入口（2026-11-12 上线包）----
     介绍页 about.html 是静态文件，app.js 只负责给出入口。
     这里钉两件事：
       ① 页脚里确实有一枚指向 about.html 的链接（删了会让介绍页变成孤岛）；
       ② 它不在 .aff-note 里 —— 导航链接混进广告披露段落会被读成披露内容的一部分。 */
  const aboutLinks = appRoot.querySelectorAll('footer.foot a')
    .filter((a) => /about\.html/.test(String(a.attrs.href || '')));
  ok('页脚有指向介绍页 about.html 的入口',
    aboutLinks.length >= 1,
    `实际 ${aboutLinks.length} 枚`);
  ok('介绍页入口不在广告披露段落内',
    aboutLinks.every((a) => !String(a.attrs.class || '').includes('aff-note')),
    aboutLinks.map((a) => a.attrs.class).join(' | '));
  /* 双渠道说明必须说清"价格没排序"——这是实测结论，不能省。
     只对有搜索渠道的卡要求；纯直达链的卡不许挂（它只有一个入口，写了就是编）。 */
  /* 测试桩的 querySelector 不支持属性选择器（已知限制，见文件头注释），
     所以"这卡有没有搜索渠道"从 buy 列表按卡分组判，不用 DOM 选择器。 */
  const hasOfficial = (c) => (tbByCard.get(c) || []).some((a) => a.attrs['data-channel'] === 'official');
  const cardsWithChannel = cards.filter(hasOfficial);
  /* ⚠️ 断言从「必须存在至少一张有搜索渠道的卡」改成**条件式**（v3，2026-11-16）。
     原因不是放宽，是这条原写法本来就会随数据变好而变红 ——
     这正是本文件其它地方反复记录的坑（见上面"数量断言从每瓶固定 3 个
     改成结构不变量"那段注释，同一个教训）。

     实测：`data/affiliate-links.json` 的淘宝覆盖已到 661/1388，
     本轮问卷改动换了推荐的取向之后，跑出来的三瓶恰好都命中直达链 ——
     于是"有搜索渠道的卡"变成 0 张，而**页面上没有任何一处错误**：
     三张卡各有一条直达链、不挂双渠道说明，完全符合规则。
     原断言在这种情况下红，是在要求"数据别太好"。

     改成守**真正会造成伤害的那一侧**：只要某张卡挂了双渠道说明，
     它就必须真的有 official+market 一对渠道；反之有渠道就必须挂且只挂一条。
     两个方向都保留，只是不再要求"本次运行必须出现这种卡"。 */
  ok('有搜索渠道的卡各挂一条双渠道说明（无此类卡时该条不适用）',
    cardsWithChannel.every((c) => c.querySelectorAll('.link-note').length === 1),
    `有搜索渠道的卡 ${cardsWithChannel.length} 张，说明 ${searchNotes.length} 条`
      + (cardsWithChannel.length === 0 ? '（本次三瓶都走直达链，无搜索渠道卡）' : ''));
  /* 反向：挂了双渠道说明的卡，必须真的成对出现 official+market ——
     这是"写了就是编"那一侧的守门，与上面互为反向。 */
  {
    const cardsWithNote = cards.filter((c) => c.querySelectorAll('.link-note').length > 0);
    const bad = cardsWithNote.filter((c) => {
      const ch = (tbByCard.get(c) || [])
        .filter((a) => SEARCH_CH.has(String(a.attrs['data-channel'])))
        .map((a) => a.attrs['data-channel']);
      return !(ch.includes('official') && ch.includes('market'));
    });
    ok('挂了双渠道说明的卡，必须真有 official+market 一对渠道',
      bad.length === 0, `${bad.length} 张卡挂说明但没有成对渠道`);
  }
  ok('双渠道说明包含「价格未排序」',
    searchNotes.every((n) => /价格未排序|未排序/.test(n.textContent)),
    searchNotes.map((n) => n.textContent.slice(0, 20)).join(' | '));
  const cardsDirectOnly = cards.filter((c) => !hasOfficial(c));
  ok('只有直达链的卡不挂双渠道说明',
    cardsDirectOnly.every((c) => c.querySelectorAll('.link-note').length === 0),
    `纯直达链卡 ${cardsDirectOnly.length} 张`);

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
  /* K4：披露文案的合规底线。**口径已随 2026-11-10 19:19 决策改变**：
     原文案要求以「广告」二字开头（《互联网广告管理办法》第九条的字面读法）。
     Eddie 拍板改为页脚声明后，文案不再以「广告」开头 —— 这是**明知放宽**的
     选择，所以断言改成守新文案必须成立的三件事：
       · 说明这是「推广/联盟」关系（用户能识别商业性质）
       · 说明本站可能获得「佣金」
       · 说明不影响支付价格
     不再断言「以广告开头」：那条已经与拍板后的实现相反，留着等于逼下一个人
     在"测试绿"和"按决定执行"之间二选一。 */
  const disc = appMod.__aff.config().disclosure;
  ok('披露文案说明这是推广/联盟关系', /联盟推广链接|推广链接/.test(disc), disc.slice(0, 30));
  ok('披露文案写明可能获得佣金', disc.includes('佣金'), disc.slice(0, 40));
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

  /* ②b 直达表里放的是**联盟转链短链** → 必须升到 direct，且排在搜索页前面。

     修的是一个真 bug：淘宝配了 pid 之后，①b（带 pid 的搜索推广页）
     每次都命中并 return，第 ② 档永远走不到 —— 手采的真短链一条都显示
     不出来。而真短链本身就带佣金归属（实测点一次报表 `点击次数 1`），
     按 kind='link' 处理会漏标 sponsored + 漏挂广告披露，是合规问题
     而不只是显示问题。

     判据是 host，不是"这条是谁生的"：表会被人手工改，记忆不跟着变。 */
  A.setLinks({ jd: { 'demo-bottle': 'https://u.jd.com/abcdefg' } });
  const jdShort = A.link(P, freeCfg);
  ok('直达表里的联盟短链升为 direct（京东）',
    !!jdShort && jdShort.kind === 'direct', jdShort && jdShort.kind);
  ok('联盟短链文案说「买」', !!jdShort && /买/.test(jdShort.label), jdShort && jdShort.label);

  A.setLinks({ taobao: { 'demo-bottle': 'https://m.tb.cn/h.jSdRTjU' } });
  const tbShort = A.link(P, Object.assign({}, freeCfg, { searchPlatforms: ['taobao'] }));
  ok('直达表里的联盟短链升为 direct（淘宝）',
    !!tbShort && tbShort.kind === 'direct', tbShort && tbShort.kind);
  ok('淘宝短链优先于带 pid 的搜索推广页',
    !!tbShort && /m\.tb\.cn/.test(tbShort.href), tbShort && tbShort.href);

  /* 反向：非联盟域名的商品页仍按 link 处理，不许误升。
     漏这一条会让所有手工抄的天猫商品页被标成"广告"。 */
  A.setLinks({ taobao: { 'demo-bottle': 'https://detail.tmall.com/item.htm?id=1' } });
  const tmallPlain = A.link(P, Object.assign({}, freeCfg, { searchPlatforms: ['taobao'] }));
  ok('非联盟域名的商品页仍是 link（不误标广告）',
    !!tmallPlain && tmallPlain.kind === 'link', tmallPlain && tmallPlain.kind);

  /* 子域名要认：`img.u.jd.com` 这种会出现，用全等会漏 */
  A.setLinks({ jd: { 'demo-bottle': 'https://img.u.jd.com/x.jpg' } });
  ok('联盟域名判据认子域名',
    A.isAffiliateHost && A.isAffiliateHost('jd', 'https://img.u.jd.com/x.jpg') === true);

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

/* ---------- 商品实物图的降级矩阵（v32） ----------
   用户要求"用商品实物图而非示意图"。数据源没有任何图片字段，
   所以照片只能靠自己往 `data/photos.json` 里加，一张一张补。

   这里钉的不是"照片好不好看"，而是**降级不许出岔子**：
   表里没有这一瓶时，必须回到绘制瓶形，且不许把任意外链当图用。
   上一版（v31）只有绘制瓶形，所以这四条以前一条都钉不住。 */
{
  const ART = appMod.__art;
  const P1 = { id: 'diptyque-eau-rose-toilette' };
  const P2 = { id: 'demo-bottle' };

  /* ① 有映射 → 用照片 */
  ART.set({ 'diptyque-eau-rose-toilette': 'images/x.jpg' });
  ok('实物图：表里有这一瓶时返回其路径',
    ART.sourceOf(P1, { 'diptyque-eau-rose-toilette': 'images/x.jpg' }) === 'images/x.jpg',
    ART.sourceOf(P1, { 'diptyque-eau-rose-toilette': 'images/x.jpg' }));

  /* ② 没映射 → 画瓶形（返回 null 即走 bottleArt） */
  ok('实物图：表里没有这一瓶时降级为瓶形',
    ART.sourceOf(P2, { 'diptyque-eau-rose-toilette': 'images/x.jpg' }) === null,
    ART.sourceOf(P2, { 'diptyque-eau-rose-toilette': 'images/x.jpg' }));

  /* ③ 整张表缺失（ensurePhotos 失败时写的是 false）→ 也要降级，不许抛 */
  ok('实物图：清单为 false 时降级为瓶形', ART.sourceOf(P1, false) === null, ART.sourceOf(P1, false));
  ok('实物图：清单为 null 时降级为瓶形', ART.sourceOf(P1, null) === null, ART.sourceOf(P1, null));
  ok('实物图：清单为空对象时降级为瓶形', ART.sourceOf(P1, {}) === null, ART.sourceOf(P1, {}));

  /* ④ 空串 / 非字符串不算"有图" —— 否则会渲染出 <img src="">，
        浏览器会把当前页面地址当图片再请求一次 */
  ok('实物图：空字符串不进 <img>', ART.sourceOf(P1, { 'diptyque-eau-rose-toilette': '' }) === null, '');
  ok('实物图：非字符串值不进 <img>', ART.sourceOf(P1, { 'diptyque-eau-rose-toilette': 123 }) === null, '123');

  /* ⑤ 仓库里的清单必须是合法 JSON、结构必须是 { photos: {...} }，
        且每条值都是仓库内的相对路径 —— 不许出现 http(s) 外链
        （外链会破 D05「离线可用、零外部请求」）。 */
  const pj = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'photos.json'), 'utf8'));
  ok('photos.json 有 photos 对象', !!pj.photos && typeof pj.photos === 'object',
    Object.keys(pj).join(','));
  const vals = Object.values(pj.photos || {});
  ok('photos.json 的值全是不带协议的相对路径',
    vals.every((v) => typeof v === 'string' && !/^([a-z]+:)?\/\//i.test(v)),
    vals.join(' | '));
  ok('photos.json 里每个文件都真实存在',
    vals.every((v) => fs.existsSync(path.join(ROOT, v))),
    vals.join(' | '));

  /* ⑥ 成品图集的规模与体积（v33 加了 scripts/build-photo-set.mjs 自动生成）。
     这三条钉的是"图集有没有被意外清空/撑爆"，不是"图好不好看"：
     · 覆盖数：自动生成后至少 300 瓶（实测 370，来自 white/pict/small 三档候选）。
       掉到一百多说明又退回了"只用 white_image"那条路（那版只有 168 瓶，
       页面上三张卡几乎全是绘制瓶形 —— 用户就是这么发现的）。
     · 体积：单张 < 40KB（实测均 8.8KB）。超了说明判据漏了场景图 ——
       场景图裁完仍带大面积背景，webp 压不下去。
     · 格式：必须是 webp。png/jpg 会带 EXIF 方向标记与体积。 */
  const filesOk = vals.filter((v) => fs.existsSync(path.join(ROOT, v)));
  ok('photos.json 覆盖至少 300 瓶', filesOk.length >= 300, `实际 ${filesOk.length}`);
  const sizes = filesOk.map((v) => fs.statSync(path.join(ROOT, v)).size);
  const tooBig = filesOk.filter((v, i) => sizes[i] > 40 * 1024);
  ok('photos.json 单张图 < 40KB', tooBig.length === 0,
    tooBig.length ? `${tooBig.length} 张超限，最大 ${Math.max(...sizes)}B` : `最大 ${Math.max(...sizes)}B`);
  ok('photos.json 的值全是 .webp', filesOk.every((v) => v.endsWith('.webp')),
    filesOk.filter((v) => !v.endsWith('.webp')).join(' | '));

  /* ⑦ 透明抠图名单（v37，用户报 212 VIP 用了错图之后）。
     白底图在深色页面需要白瓷底托，抠图需要**去掉**底托 ——
     两套处理必须分得开，否则抠图后面会多一个白框。
     钉三件事：名单里的 id 必须真实存在、默认没有名单时代码不崩、
     CSS 里确实有撤掉底托的那条规则。 */
  const cjs = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const cut = Array.isArray(pj.cutouts) ? pj.cutouts : [];
  ok('cutouts 里的 id 都在 photos 表里',
    cut.every((id) => typeof id === 'string' && !!pj.photos[id]),
    cut.filter((id) => !pj.photos[id]).join(' | '));
  ok('cutouts 里的图是透明底（单张 < 40KB 且是 webp）',
    cut.every((id) => pj.photos[id].endsWith('.webp')
      && fs.existsSync(path.join(ROOT, pj.photos[id]))
      && fs.statSync(path.join(ROOT, pj.photos[id])).size < 40 * 1024),
    cut.map((id) => pj.photos[id]).join(' | '));
  ok('没有 cutouts 字段时判据不崩（老表向后兼容）',
    ART.isCutout({ id: 'x' }, null) === false && ART.isCutout({ id: 'x' }, []) === false
    && ART.isCutout({}, ['x']) === false);
  ok('抠图判定按 id 精确匹配，不做前缀/包含',
    ART.isCutout({ id: 'carolina-herrera-212-vip' }, ['carolina-herrera-212-vip']) === true
    && ART.isCutout({ id: 'carolina-herrera-212-vip-black' }, ['carolina-herrera-212-vip']) === false,
    '212-vip-black 不能因为前缀相同被当成抠图');
  ok('深色下抠图撤掉白瓷底托',
    /\.pick-art\.is-photo\.is-cutout\s*\{[^}]*background:\s*none/.test(cjs)
    && /\.pick-art\.is-photo\.is-cutout\s*\{[^}]*box-shadow:\s*none/.test(cjs),
    '缺 .is-cutout 的底托撤销规则，抠图后面会多一个白框');
  ok('浅色下抠图也去掉 padding（与白底图严格同高）',
    /\.pick-art\.is-photo\.is-cutout\s*\{\s*padding:\s*0/.test(cjs));

  ART.set(null);   // 恢复"还没试过"，别影响后面的断言
  ART.setCutouts(null);
}

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

/* ---------- 步骤表契约（v3：九屏恒定，不再有入口分叉）----------
   v19 时这里测的是「家族入口 8 步 / 情绪入口 9 步」两条数字必须一致。

   v3 删掉了唯一那屏带 when() 的「整族排除」，于是分叉消失、九屏对所有人恒定。
   所以这一段的判据也从"两套数字一致"改成**更硬的一条**：任何答案下都是 9 步。
   这不是把断言放松 —— 原来双数字的**目的**就是"用户看到的步数不会与屏数对不上"，
   现在只有一套数字，恒等 9 直接守住它，且多了一条"不许偷偷加回动态屏"。

   代价（如实记录）：情绪入口那条遍历在这一段里失效了 —— 它原来是为了走到
   「整族排除」而写的，那一屏没了。所以替换成"按感觉选之后仍然 9 步、仍能一路
   走到末屏"，验的是同一件事（入口切换不会让步数与屏数分叉），不是删掉。 */
{
  const S = appMod.__steps;
  ok('v3：步骤全集是 9 屏', S.all.length === 9, `实际 ${S.all.length}`);
  ok('v3：全集里不再有「整族排除」（实测最接近无效的一项，已按规格删除）',
    !S.all.some((x) => x.id === 'dislikedFamilies'),
    S.all.map((x) => x.id).join(','));
  /* 复制粘贴后忘改 id 是最常见的一类：两个步骤互相覆盖、
     进度条段数却对得上，从界面上完全看不出来。 */
  const ids = S.all.map((x) => x.id);
  ok('v3：9 个步骤的 id 两两不同', new Set(ids).size === ids.length, ids.join(','));
  /* 顺序是用户能看见的东西：预算必须在第 2 位（规格「预算题前置」），
     香型必须在第 1 位（圆盘是入口）。这两条钉的是位置，不是"碰巧"。 */
  ok('v3：香型在第 1 屏、预算在第 2 屏（预算题前置）',
    ids[0] === 'family' && ids[1] === 'budget', ids.join(','));
  ok('v3：末屏是已知款（收束在真实反馈上）', ids[ids.length - 1] === 'anchor', ids.join(','));

  /* 核心契约：任何答案下都 9 步。这四条合起来等价于"没有动态屏了"。 */
  const byFam = S.cur({ family: 'floral' });
  const byEmo = S.cur({ emotion: 'cold' });
  const empty = S.cur({});
  const both = S.cur({ family: 'woody', emotion: 'warm', budget: 'b2' });
  ok('v3：家族入口也是 9 步（不再缩短）', byFam.length === 9, `实际 ${byFam.length}`);
  ok('v3：情绪入口是 9 步', byEmo.length === 9, `实际 ${byEmo.length}`);
  ok('v3：未答任何入口时仍是 9 步', empty.length === 9, `实际 ${empty.length}`);
  ok('v3：两条入口同时有值时仍是 9 步（没有 when() 会重复或吞屏）',
    both.length === 9, `实际 ${both.length}`);

  /* 集合里到底有哪几屏 —— 顺序再变它们仍该绿。 */
  const has = (arr, id) => arr.some((x) => x.id === id);
  ok('v3：香调仍是「想要」「不想要」两屏（生活情景，但仍是两个决定）',
    has(byFam, 'wanted') && has(byFam, 'avoid'), byFam.map((x) => x.id).join(','));
  ok('v3：旧香调屏 id（likedNotes / dislikedNotes）不再作为步骤存在',
    !has(byFam, 'likedNotes') && !has(byFam, 'dislikedNotes'),
    byFam.map((x) => x.id).join(','));
  ok('v3：场景仍是「场合」「季节」两屏',
    has(byFam, 'occasion') && has(byFam, 'season'), byFam.map((x) => x.id).join(','));
  /* 浓淡/浓度合回一屏是 2026-11-11 的决定，v3 不动它。 */
  ok('v3：浓淡与浓度仍合成一屏（只剩 concentration）',
    has(byFam, 'concentration') && !has(byFam, 'intensity'),
    byFam.map((x) => x.id).join(','));
  ok('v3：旧 id（notes / context / strength / intensity）都不得复活',
    !has(byFam, 'notes') && !has(byFam, 'context') && !has(byFam, 'strength')
    && !has(byFam, 'intensity'), byFam.map((x) => x.id).join(','));
  ok('v3：每个步骤都有可渲染函数', S.all.every((x) => typeof x.render === 'function'),
    S.all.filter((x) => typeof x.render !== 'function').map((x) => x.id).join(','));

  /* 「第 N 步 / 共 M 步」必须只读步骤表 —— 这是用户唯一能看见的数字。
     注意 head() 必须显式传 answers，否则每次都读 state.answers，测出来永远相等。 */
  const headFam = S.head('anchor', { family: 'floral' });
  const headEmo = S.head('anchor', { emotion: 'cold' });
  ok('v3：末屏在任一入口下都是「第 9 步 / 共 9 步」',
    headFam.kicker === '第 9 步 / 共 9 步' && headEmo.kicker === '第 9 步 / 共 9 步',
    `${headFam.kicker} vs ${headEmo.kicker}`);
  const headBudget = S.head('budget', {});
  ok('v3：预算屏显示「第 2 步 / 共 9 步」', headBudget.kicker === '第 2 步 / 共 9 步',
    headBudget.kicker);

  /* 越界夹取。v3 之后长度恒定，但这层保护仍要留：它守的是
     「容器长度与下标」这对不变量，将来若加回动态屏不会炸。 */
  ok('越界夹取：step=9 在 9 步表里保持 9（=结果页）', S.clamp(9, 9) === 9, String(S.clamp(9, 9)));
  ok('越界夹取：step=12 在 9 步表里夹到 9', S.clamp(12, 9) === 9, String(S.clamp(12, 9)));
  ok('越界夹取：step=3 不动', S.clamp(3, 9) === 3, String(S.clamp(3, 9)));
  ok('越界夹取：负数是 0', S.clamp(-1, 9) === 0, String(S.clamp(-1, 9)));
  ok('越界夹取：NaN 是 0', S.clamp(NaN, 9) === 0, String(S.clamp(NaN, 9)));

  /* 情绪入口真的走一遍：重开一局 → 按感觉选 → 一路点到末屏。
     不能只验纯函数，那样 navBar / render / 进度条任何一处漏改都测不到。 */
  const restartFn = appMod.__restart;
  if (restartFn) {
    restartFn();
    await new Promise((r) => setTimeout(r, 300));
    const emoSeg = appRoot.querySelectorAll('.seg').find((s) => s.attrs['aria-label']
      && /感觉/.test(s.attrs['aria-label']));
    const seg = emoSeg || appRoot.querySelectorAll('.seg')[0];
    const emoItem = seg ? seg.querySelectorAll('.seg-item')[0] : null;
    ok('第 1 步有「按感觉选」分段控件', !!emoItem);
    if (emoItem) {
      emoItem.dispatch('click');
      await new Promise((r) => setTimeout(r, 300));
      ok('v3：按感觉选之后仍显示「共 9 步」（入口不改变步数）',
        /共 9 步/.test(appRoot.textContent), appRoot.textContent.slice(0, 60));
      /* 一路点到末屏。v3 的末屏是「有没有已经试过」那一屏。 */
      let guard = 0;
      while (guard++ < 14) {
        const b = appRoot.querySelectorAll('.btn').find((x) => x.textContent.includes('下一步'));
        if (!b) break;
        b.dispatch('click');
        await new Promise((r) => setTimeout(r, 180));
        if (getStepText().includes('已经试过')) break;
      }
      const t = getStepText();
      ok('v3：情绪入口能一路走到末屏（试过、并且喜欢）', t.includes('已经试过'), t.slice(0, 80));
      /* 末屏必须能出结果 —— 「换一批 / 改一题」的前置是这里真的有一份结果。 */
      const fin = appRoot.querySelectorAll('.btn').find((x) => x.textContent.includes('看推荐'));
      ok('v3：情绪入口的末屏有「看推荐」', !!fin);
      if (fin) {
        fin.dispatch('click');
        await new Promise((r) => setTimeout(r, 600));
        ok('v3：情绪入口能出结果（三瓶）',
          appRoot.querySelectorAll('.pick').length === 3,
          `实际 ${appRoot.querySelectorAll('.pick').length} 张卡`);
      }
    }
  }
}

/* ---------- 认屏 id 契约（2026-11-11 任务 2）----------
   CSS 用 `#app[data-step="<步骤 id>"]` 认屏。这是一条**跨文件契约**：
   app.js 的 STEPS 提供 id，styles/src/*.css 消费它。任何一侧单独改名都
   **不会报错**，只会让那一整段样式静默失效 —— `be23110` 把 `context` 改成
   `occasion` 时 CSS 没跟着改，场合屏的新圆盘因此整整三天没生效，
   而八套测试全绿（没有任何一套读 data-step）。

   这条断言把契约变成可执行的：styles.css 里出现过的每个 data-step 值，
   必须都是 app.js 里真实存在的步骤 id（或 'result'）。
   反向不查 —— 不是每一屏都需要专属样式，那不算错。 */
{
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  /* 先剥注释再扫：注释里会**故意**提到旧 id（用来记录这次的教训），
     不剥离会把"解释为什么改名"的文字当成悬空选择器。 */
  const cssNoComment = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const used = new Set([...cssNoComment.matchAll(/data-step="([a-zA-Z]+)"/g)].map((m) => m[1]));
  const known = new Set([...appMod.__steps.all.map((x) => x.id), 'result']);
  const dangling = [...used].filter((v) => !known.has(v));
  ok('认屏 id：CSS 里出现的 data-step 值都是真实步骤 id（防改名后样式静默失效）',
    dangling.length === 0,
    dangling.length ? `悬空：${dangling.join(',')}（app.js 现有 ${[...known].join(',')}）` : `用到 ${[...used].join(',')}`);
  /* 场合屏那段是这次修复的对象，单独钉住它真的被认到 ——
     上面那条只保证"id 存在"，不保证"那套规则还在"。 */
  ok('认屏 id：场合屏那套圆盘样式仍挂在 occasion 上',
    used.has('occasion'),
    `现有 ${[...used].join(',')}`);
}

fs.unlinkSync(tmpApp);

console.log(`\n===== 渲染测试 =====`);
console.log(`PASS ${pass}  FAIL ${fails.length}`);
fails.forEach((f) => console.log('  ✗ ' + f));
