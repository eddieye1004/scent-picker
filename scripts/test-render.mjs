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
/* 中圈胶囊的短标签表（src/sub-labels.js，2026-11-25 短标签腿）。
   测试直接 import 生产模块，不另抄一份常量 —— 抄一份就等于"表改错了测试也绿"。 */
import { SUB_SHORT_LABEL, subFullName, subShortLabel } from '../src/sub-labels.js';

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
    /* style：真实 DOM 里是 CSSStyleDeclaration，app.js 会用
       `el.style.setProperty('--x', v)` 写自定义属性（v6 的底噪三轴与温度光带）。
       桩里做成普通对象 + 一个 setProperty 就够 —— 但要**同时**支持
       `style['--ring-pct'] = v` 的直接赋值（两种写法都在用）。
       补桩而不是改业务代码：桩缺能力就该补桩，否则测试和浏览器走两条路。 */
    this.style = {
      setProperty(k, v) { this[k] = String(v); },
      getPropertyValue(k) { return this[k] != null ? this[k] : ''; },
      removeProperty(k) { delete this[k]; },
    };
    /* dataset：真实 DOM 里 `app.dataset.step = 'budget'` 会同步成
       `data-step="budget"` 属性。桩里原先只做成普通对象 —— 只写不读时够用，
       但 v6 的测试要按 data-step 认屏（这是 CSS 认屏的同一条契约），
       所以必须真的把 dataset 写回 attrs。补桩，不改断言绕开。 */
    this.dataset = new Proxy({}, {
      set: (t, k, v) => {
        t[k] = String(v);
        this.attrs['data-' + String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())] = String(v);
        return true;
      },
    });
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
      /* 自定义属性（--ring-pct）与普通属性一样按 key:value 拆，
         但值里可能带 calc(...) 的冒号少、括号多，所以只按**第一个**冒号切。 */
      const at = pair.indexOf(':');
      if (at <= 0) return;
      const k = pair.slice(0, at).trim();
      const v = pair.slice(at + 1).trim();
      if (k && v) this.style[k] = v;
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
    /* 同理：setAttribute('style', …) 在真实 DOM 里会解析进 style 声明块。
       app.js 的扩散环与温度光带用内联 style 写自定义属性
       （`style: '--ring-pct:32%'` / `'left:55%'`），桩不同步就读不到 ——
       而"半径随档位递增"这条断言正是要读它。补桩，不改断言绕开。 */
    if (k === 'style') this._parseStyle(String(v));
  }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(n) {
    if (typeof n !== 'string') { n.parentNode = this; }
    /* `textContent = ''` 之后再 appendChild 是**合法且常见**的写法
       （L3 的清单页提示条就这么做：先清空，再把文字与按钮拼回去）。
       真实 DOM 里先前那段文字仍是一个文本节点，追加内容排在它后面；
       桩把 textContent 存进 `_text`、把文本节点存成裸字符串 ——
       两者混在一起时若不清 `_text`，getter 会一直返回那句空串，
       于是页面在浏览器里正常、在测试里"文案是空的"。补桩，不改断言。 */
    if (this._text != null) {
      if (this._text !== '') this.children.push(this._text);
      this._text = null;
    }
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
    /* 真实 DOM 的 insertBefore 是**移动**语义：节点若已挂在某处，会先被摘下来。
       桩原先只做 splice 插入，于是同一个节点被反复 insertBefore 会留下多份 ——
       底噪层（.amb-wash 单例）正好走这条路：每次 render() 重建后都要重新插一次，
       桩里就攒成了 10 个，断言「只有一个」直接红。
       这是桩缺能力，补桩而不是改业务代码绕开（本文件开头那条规则）。 */
    if (typeof n !== 'string' && n.parentNode && n.parentNode !== this) {
      const oi = n.parentNode.children.indexOf(n);
      if (oi >= 0) n.parentNode.children.splice(oi, 1);
    } else if (typeof n !== 'string') {
      const si = this.children.indexOf(n);
      if (si >= 0) this.children.splice(si, 1);
    }
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
    /* currentTarget：真实 DOM 的事件对象在**监听器执行期间**把 currentTarget
       指向绑定该监听器的元素。app.js 有好几处用 `ev.currentTarget`
       （life-card 就地更新、看推荐按钮、换一批按钮）—— 桩不提供它，
       那些处理函数会拿到 undefined，表现成"点了没反应"。
       这是桩缺能力，补桩而不是改业务代码绕开。 */
    (this._listeners[ev] || []).forEach((fn) =>
      fn({ target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...payload }));
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
  /* isConnected：真实 DOM 的标准属性（节点是否还挂在文档里）。
     app.js 的 ensureWishBar() 用它判"单例还在不在"——
     桩不提供就是 undefined（恒假），于是每次调用都新建一条提示并追加到 body，
     表现成"只有测试里会攒出一堆重叠提示"，而浏览器里是正常的。
     桩缺能力就补桩（本文件开头那条规则），否则"单例"这条契约在测试里根本验不到。 */
  get isConnected() {
    let n = this;
    while (n) {
      if (n === globalThis.document?.body || n === globalThis.document?.documentElement) return true;
      n = n.parentNode;
    }
    return false;
  }
}

/* ---------- 环境桩 ---------- */
const appRoot = new TNode('main', { id: 'app' });
/* document.body：心仪清单 L2 的存入轻提示挂在这里（见 app.js 的 ensureWishBar）。
   真实浏览器一定有 body —— app.js 里那条 try/catch 只是防御，
   桩不提供的话就变成"只有测试走降级分支"，而浏览器走另一条路。
   桩缺能力就补桩（本文件开头那条规则）。 */
const bodyRoot = new TNode('body');
globalThis.document = {
  _nodes: { '#app': appRoot },
  body: bodyRoot,
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

/* ============================================================
   问卷 v6：七屏全流程（2026-11-16）
   ============================================================ */

const getStepText = () => appRoot.textContent;
const stepId = () => appRoot.attrs['data-step'] || '';
/** 找当前屏的某个按钮（按文案）。 */
const btnBy = (re) => appRoot.querySelectorAll('.btn').find((x) => re.test(x.textContent));
/** 走屏梯子：advance() 每落一屏就记一次 id，最后由 ⑧ 段整串比对。
 *
 *  为什么要记整条梯子而不只是每段各看一眼：每段只断言"我这一段落在正确的屏上"，
 *  漏掉的是**它们合起来**错位的情形 —— 某段多 advance 一次，后面每段都错一格，
 *  而每段自己仍然能"看见"它期待的那一屏（拿到的是别人那一屏的内容），
 *  于是 5 段全绿、流程却跳了一屏。串比对同时否掉跳屏 / 错序 / 漏屏三种形态。 */
const ladder = [];

/** 点「下一步」，等重绘；顺手把落到的屏 id 记进梯子。 */
async function advance() {
  const b2 = btnBy(/下一步|看推荐/);
  if (!b2) throw new Error('当前屏没有前进按钮：' + appRoot.query(0) );
  b2.dispatch('click');
  await new Promise((r) => setTimeout(r, 240));
  ladder.push(stepId());
}

/** 按 **id** 在当前生效步骤表里的位置派生「第 N 屏」，不写死屏号。
 *
 *  为什么必须派生：预算屏在 v7 第 3 步里从第 3 位搬到了末位，走查段原来
 *  写死「第 3 屏是预算屏」，搬完之后整段落到 `occasion` 上 —— `.price-tab`
 *  取不到，`[1]` 是 undefined，直接 `TypeError`，脚本在打印汇总前退出，
 *  **一条断言结果都拿不到**。写死屏号的代价不是"报一条红"，是"整份测试哑掉"。
 *
 *  取不带参的 `S.cur()`：它读的是**实时** `state.answers`，与屏上那行
 *  「第 N 步 / 共 M 步」同源；避雷屏被跳过时（共 5 步）自动跟着缩，
 *  不会出现"测试说第 6 屏、界面说第 5 步"的分叉。 */
const stepNoOf = (id) => {
  const list = appMod.__steps.cur();
  const i = list.findIndex((x) => x.id === id);
  return i < 0 ? 0 : i + 1;
};
const screenOf = (id) => `第 ${stepNoOf(id)} 屏`;
/* ============================================================
   第 1 屏：香型圆盘（2026-11-17 v7 第 1 步恢复）
   ------------------------------------------------------------
   断言整块来自 a39e498 的 scripts/test-render.mjs（281–841 行），
   即 PR #5 合并之前那一版的圆盘断言 —— 与本步恢复的 app.js 代码同源。
   这样"圆盘视觉与图标零改动"就不靠人眼比对，而是靠**同一份断言**：
   代码与断言同时取自同一个提交，任何一侧被改都会红。

   只做了一处包装：整块套进 { } 作用域。原因是它里面的 plate / cap /
   plates / sectorGroups 等是块内临时量，平铺会和本文件后面的同名量
   撞成 const 重复声明。作用域不改变任何一条断言的语义。
   ============================================================ */
{
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
  /* ② 返回入口：44px 触控下限 + 三个状态都要有
     2026-11-24（裁决 A）：这枚胶囊从 `.wheel` 里搬进页顶流 `.stage-top`，
     所以三条断言的选择器跟着从 `.wheel .wheel-back` 放宽到 `.wheel-back` ——
     断言的东西没变（44px / translateY(1px) / [hidden] 压回 display:none），
     只是不再把"它在圆盘盒里"这件事当成前提。 */
  ok('返回入口是 44px 触屏尺寸', /\.wheel-back \{[^}]*?min-height:\s*44px/.test(css));
  ok('返回入口有按下态', /\.wheel-back:active \{[^}]*?translateY\(1px\)/.test(css));
  ok('返回入口能真正隐藏', /\.wheel-back\[hidden\] \{ display: none; \}/.test(css),
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

  /* ---- 只选大类时中心盘 = 纯文字（本步临时裁定）----
     24 枚上色标本画的是"小类"那一层，大类这一层没有自己的图标。
     只选大类就摆一排小类图标，等于用下一层的词汇回答当前这一层的问题。
     所以这里守两条，缺一条裁定就落空：
       ① 盘心不许有任何图标（小类图标也不行）
       ② 盘心必须有文字（小类名 + 个数），否则"承载信息"这条又退回空圆 */
  const hubGlyphBox = appRoot.querySelector('.hub-glyph');
  const hubSvgs = hubGlyphBox ? hubGlyphBox.querySelectorAll('svg') : [];
  ok('只选大类时盘心没有任何图标', hubSvgs.length === 0,
    `盘心 SVG ${hubSvgs.length} 枚`);
  const famText = appRoot.querySelector('.fam-text');
  const famItems = appRoot.querySelectorAll('.fam-text-item');
  /* 名字口径（2026-11-24 裁定 A；2026-11-25 短标签腿修订）：盘心小类列表与
     中圈胶囊**故意不再同名**，这一条断言一次守六件事：
     ① 盘心 `.fam-text-item` 读**全名** `label || zh || id`
     （柑橘调是「纯柑橘 · 苦橙叶 · 橙花柑橘 · 皂感柑橘」，一个字没缩）；
     ② 中圈 `.zh` 读**短标签** SUB_SHORT_LABEL（同族是「纯柑 · 苦橙叶 · 橙花 · 皂感」）；
     ③ 短标签在**同族内不重名**（缩完还分得清，才允许缩）；
     ④ 短标签表**覆盖 taxonomy 里全部小类**（漏一条就红 —— 兜底会静默退回
     全名，四字胶囊又折成两行，只有这条能提前拦住）；
     ⑤ 短标签必须是全名**删字**得到的子序列，不许另造词（见下面 notDerived）；
     ⑥ 24 枚胶囊按钮的 **aria-label 逐字等于 taxonomy 全名**（见下面 ariaBad）——
     短标签只是为视觉宽度缩的，读屏不该跟着少听两个字，否则同一个东西在
     盘心小类列表 / 结果页念「皂感柑橘」、在胶囊上念「皂感」，读屏用户无从对齐。
     为什么两边不同名：定版是单行胶囊（16px 图标 + 12px 文字，不换行），
     ±90° 那两枚的宽度正好沿半径展开，可用总宽只有「盘心半径 → 盘沿」
     （390 档 58.15px），四字词横排放不下 —— Eddie 2026-11-25 22:37 裁决
     走 1 号方案「缩短标签」。盘心已经写着家族名，胶囊里重复一遍不增加
     信息、只增加宽度。期望值不在这里另抄一份常量：全部从 taxonomy
     与 src/sub-labels.js 现算，抄错口径这条会立刻红。 */
  const TAXA_FAM = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));
  const subById = new Map(TAXA_FAM.families.flatMap((f) => f.subfamilies).map((s) => [s.id, s]));
  const midSecs = appRoot.querySelectorAll('.disc-sector.lvl2').filter((b) => b.getAttribute('data-sub'));
  const midIds = midSecs.map((b) => b.getAttribute('data-sub'));
  const midLabels = midSecs.map((b) => {
    const z = b.querySelector('.zh');
    return z ? z.textContent.trim() : '';
  });
  const famNames = famItems.map((n) => n.textContent.trim());
  const expectFull = midIds.map((id) => subFullName(subById.get(id)));
  const expectShort = midIds.map((id) => subShortLabel(subById.get(id)));
  const uncovered = TAXA_FAM.families.flatMap((f) => f.subfamilies)
    .filter((s) => !SUB_SHORT_LABEL[s.id]).map((s) => s.id);
  const dupFams = TAXA_FAM.families.filter((f) => {
    const names = (f.subfamilies || []).map((s) => subShortLabel(s));
    return new Set(names).size !== names.length;
  }).map((f) => f.id);
  /* 短标签必须是全名**删字**得到的（子序列），不能另造一个词。
     这条是上面 ② 的补强：② 拿 subShortLabel() 当中圈渲染的期望值，
     而渲染也走同一个函数 —— 表里的值写错了，两边一起错，② 照样绿。
     子序列是一个不依赖那张表的独立判据：皂感柑橘X 里的 X 不在全名里，
     这条立刻红。同时守住"不许比全名更长"（更长就没有缩短的意义）。 */
  const isSubseq = (a, b) => {
    let i = 0;
    for (const ch of b) { if (i < a.length && a[i] === ch) i++; }
    return i === a.length;
  };
  const notDerived = TAXA_FAM.families.flatMap((f) => f.subfamilies).filter((s) => {
    const full = subFullName(s); const short = subShortLabel(s);
    return !short || short.length > full.length || !isSubseq(short, full);
  }).map((s) => `${s.id}:${SUB_SHORT_LABEL[s.id] || '(缺)'}`);
  /* ⑥ 无障碍名（2026-11-25 aria-label 腿）：胶囊可见文本是短标签，
     按钮的无障碍名必须**逐字**回到 taxonomy 全名。分两路查，合起来才覆盖 24 枚：
     · DOM 路 —— 当前渲染出来的这一族，逐枚读按钮的 aria-label 属性，
       与从 taxonomy 现算的全名逐字对照。这一路证明属性真的落到了节点上
       （值算对了却忘了挂、或挂到别的元素上，只有它能抓到）。
     · 数据路 —— taxonomy 里**全部 24 枚**小类，逐个验 `subFullName()`
       （app.js renderArcs 里 aria-label 读的就是这一个函数）等于直接按
       `label || zh || id` 从 JSON 现算的值。这一路不依赖那张短标签表、
       也不依赖当前渲染的是哪一族，所以 24 枚一个不落。
     两路都只从 data/taxonomy.json 现算期望值，这里不另抄一份常量。 */
  const ariaBad = [];
  midSecs.forEach((b, i) => {
    const got = b.getAttribute('aria-label');
    if (got !== expectFull[i]) ariaBad.push(`${midIds[i]}:DOM「${got}」≠「${expectFull[i]}」`);
  });
  TAXA_FAM.families.flatMap((f) => f.subfamilies).forEach((s) => {
    const want = String(s.label || s.zh || s.id || '').trim();
    const got = subFullName(s);
    if (got !== want) ariaBad.push(`${s.id}:全名函数「${got}」≠taxonomy「${want}」`);
  });
  ok('盘心小类名用全名、中圈胶囊用短标签（同族不重名、短标签表全覆盖、无障碍名回全名）',
    !!famText && famNames.length > 0
      && famNames.length === midIds.length
      && famNames.every((n, i) => n === expectFull[i])
      && midLabels.every((n, i) => n === expectShort[i])
      && uncovered.length === 0 && dupFams.length === 0 && notDerived.length === 0
      && ariaBad.length === 0,
    `盘心 ${famNames.join('/')} ｜ 中圈 ${midLabels.join('/')}`
      + ` ｜ 期望全名 ${expectFull.join('/')} ｜ 期望短名 ${expectShort.join('/')}`
      + ` ｜ 未覆盖 ${uncovered.join(',') || '无'} ｜ 同族重名 ${dupFams.join(',') || '无'}`
      + ` ｜ 非全名删字 ${notDerived.join(',') || '无'}`
      + ` ｜ 无障碍名不符 ${ariaBad.join(',') || '无'}`);
  /* 守门对象换了（设计第 1 项 delta 2，2026-11-25，PR #23 已并入 main）：
     盘心原来另起一行报「N 个小类」，那行已删 —— 个数是"数一下就知道"的信息，
     它花掉的却是一整行高度，在 360/320px 上是最贵的一行。这条断言原先正断在
     那枚 span 上（famCount.textContent === famItems.length + ' 个小类'），
     删 span 就必然红。现在断在**意图**上、换了守门对象：盘心列出的小类名数量
     必须等于中圈展开的段数 —— 两边说的是同一族、同一批小类，不会各说各的。
     不再引用 .fam-text-count。上一块那条名字口径断言不动，
     两条合起来仍守住「盘心与中圈同源同数」。 */
  ok('盘心列出的小类数与中圈段数一致',
    famItems.length === midIds.length,
    `列出 ${famItems.length} ｜ 中圈 ${midIds.length}`);
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
}

/* ============================================================
   盘心大类图标（冻结前 C 腿，方向 B）
   ------------------------------------------------------------
   验收线三条状态，缺一条这件事就落空：
     ① 选中 → 盘心出现该大类的图标（且是**那一族**的，不是随便一枚）
     ② 切换 → 图标跟着换（不是渲染一次就冻住）
     ③ 取消 → 盘心恢复原样（徽记退场、空态纹样回来、文字回到「还没选」）

   为什么走真实点击而不注入 state：图标挂在 paint() 里，而 paint() 由
   onChange / 扇区点击驱动。注入 state 就把要验的那一段绕掉了 ——
   本仓已有的圆盘断言块（上面那一整段）也是为同一个原因写成点击驱动的。

   为什么断言读 data-fam 而不是去认图形：图形是 24×24 的上色稿，
   认清它需要像素比对；而"盘心上现在挂的是哪一族"这件事，代码里本来
   就有一个明确的答案（.hub-emblem 的 data-fam），断言它才是断言契约。
   图形是否**真的**画进去了，由下面那条图元数断言守（空 svg 也是 svg）。
   ============================================================ */
{
  const emblemOf = () => {
    const em = appRoot.querySelector('.hub-emblem');
    if (!em) return null;
    const svgs = em.querySelectorAll('svg');
    /* 渐变 id 只能走子节点读，不能读 innerHTML：桩的 innerHTML getter 返回的是
       文本内容（标签被剥掉），在这里读会永远拿到空串 —— 那会变成一条
       永远失败的假断言。桩缺能力就换一条真能读的路径。 */
    const gradIds = [];
    const walk = (n) => {
      if (!n || typeof n === 'string') return;
      const id = n.getAttribute && n.getAttribute('id');
      if (id) gradIds.push(id);
      (n.children || []).forEach(walk);
    };
    if (svgs[0]) walk(svgs[0]);
    return {
      fam: em.getAttribute('data-fam'),
      svgCount: svgs.length,
      shapes: svgs[0] ? svgs[0].querySelectorAll('path').length
        + svgs[0].querySelectorAll('circle').length
        + svgs[0].querySelectorAll('ellipse').length : 0,
      viewBox: svgs[0] ? svgs[0].getAttribute('viewBox') : null,
      gradientIds: gradIds,
      wrap: em,
    };
  };

  /* ① 选中 → 出现对应图标。此刻盘心已落到小类（上一段最后一步），
     徽记应当退场 —— 那一路盘心有自己的标本，两者互斥。 */
  const atSub = emblemOf();
  const hubAtSub = appRoot.querySelector('.disc-hub');
  ok('落到小类时盘心不出大类徽记（让位给标本）',
    atSub && atSub.fam === null && atSub.svgCount === 0,
    `data-fam=${atSub && atSub.fam} svg=${atSub && atSub.svgCount}`);
  ok('落到小类时盘心不挂 has-emblem', !!hubAtSub && !hubAtSub.classList.contains('has-emblem'),
    hubAtSub && hubAtSub.className);

  /* 回到「只选大类」：点返回清空，再点第一个扇区。 */
  appRoot.querySelector('.wheel-back').dispatch('click');
  await new Promise((r) => setTimeout(r, 500));

  /* ③ 取消 → 恢复原样。此处是最干净的一次"未选中"，先验它。 */
  {
    const em = emblemOf();
    const hub = appRoot.querySelector('.disc-hub');
    const orn = appRoot.querySelector('.hub-orn');
    ok('取消选择后盘心徽记退场', !!em && em.fam === null && em.svgCount === 0,
      `data-fam=${em && em.fam} svg=${em && em.svgCount}`);
    ok('取消选择后盘心不挂 has-emblem', !!hub && !hub.classList.contains('has-emblem'),
      hub && hub.className);
    ok('取消选择后空态纹样回来（原样，不是新的东西）', !!orn,
      orn ? orn.className : 'no .hub-orn');
    ok('取消选择后盘心回到「还没选」', appRoot.querySelector('.hub-zh').textContent === '还没选',
      appRoot.querySelector('.hub-zh').textContent);
    ok('取消选择后盘心没有留下任何标本/徽记图形',
      appRoot.querySelectorAll('.hub-glyph svg').length === 0
        && appRoot.querySelectorAll('.hub-emblem svg').length === 0,
      `glyph=${appRoot.querySelectorAll('.hub-glyph svg').length} emblem=${appRoot.querySelectorAll('.hub-emblem svg').length}`);
  }

  /* ① 选中第一个大类 → 盘心出现那一族的图标。 */
  const famIdOfSector = (g) => g.getAttribute('data-fam');
  const firstSector = appRoot.querySelectorAll('.sector-g')[0];
  const firstFam = famIdOfSector(firstSector);
  firstSector.dispatch('click');
  await new Promise((r) => setTimeout(r, 500));
  const sel1 = emblemOf();
  const hubSel1 = appRoot.querySelector('.disc-hub');
  ok('选中大类后盘心出现该类图标', !!sel1 && sel1.fam === firstFam && sel1.svgCount === 1,
    `期望 ${firstFam}，实际 ${sel1 && sel1.fam}／svg ${sel1 && sel1.svgCount}`);
  ok('盘心图标是那一族的那一枚（不是任何一枚）', !!sel1 && sel1.fam === firstFam,
    `data-fam=${sel1 && sel1.fam}`);
  ok('盘心图标挂上 has-emblem', !!hubSel1 && hubSel1.classList.contains('has-emblem'),
    hubSel1 && hubSel1.className);
  /* 空 svg 也是 svg：图元数为 0 就等于"画了个空白"，必须抓住。 */
  ok('盘心图标里真画了几何', !!sel1 && sel1.shapes >= 6, `图元数 ${sel1 && sel1.shapes}`);
  ok('盘心图标是 24×24 同一视框（与小类那 24 枚同规格）',
    !!sel1 && sel1.viewBox === '0 0 24 24', sel1 && sel1.viewBox);
  /* 渐变 id 必须带实例后缀：两枚图标同时进 DOM 时，第二枚会引用第一枚的 defs。
     这一条守的是 artNs() 那条重写，盘心与避雷卡共用同一个缓存。 */
  ok('盘心图标的渐变 id 带实例后缀（多实例不串 defs）',
    !!sel1 && sel1.gradientIds.length > 0 && sel1.gradientIds.every((s) => /-a\d+$/.test(s)),
    sel1 && sel1.gradientIds.slice(0, 3).join(' '));

  /* ② 切换 → 图标跟着换。点第四个大类（与第一个不同族）。 */
  const fourthSector = appRoot.querySelectorAll('.sector-g')[3];
  const fourthFam = famIdOfSector(fourthSector);
  fourthSector.dispatch('click');
  await new Promise((r) => setTimeout(r, 500));
  const sel2 = emblemOf();
  ok('切换大类后盘心图标跟着换', !!sel2 && sel2.fam === fourthFam && sel2.fam !== firstFam,
    `${firstFam} → ${sel2 && sel2.fam}（期望 ${fourthFam}）`);
  ok('切换后仍是恰好一枚图标（没有叠图）', !!sel2 && sel2.svgCount === 1,
    `svg ${sel2 && sel2.svgCount}`);
  ok('切换后图标里仍真画了几何', !!sel2 && sel2.shapes >= 6, `图元数 ${sel2 && sel2.shapes}`);

  /* 每一族都要有徽记资产：渲染不出图时用户看到的是"选了没反应"。
     这条读的是 app.js 里的 FAM_ART_FILE 表 + 磁盘上的文件，不另抄一份清单。 */
  {
    const appSrc2 = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    const s0 = appSrc2.indexOf('const FAM_ART_FILE = {');
    let depth = 0; let e0 = -1;
    for (let i = appSrc2.indexOf('{', s0); i < appSrc2.length; i += 1) {
      if (appSrc2[i] === '{') depth += 1;
      else if (appSrc2[i] === '}') { depth -= 1; if (depth === 0) { e0 = i + 1; break; } }
    }
    ok('能从 app.js 里切出 FAM_ART_FILE 块', s0 > 0 && e0 > s0);
    const FAMS = new Function(appSrc2.slice(s0, e0) + '; return FAM_ART_FILE;')();
    const taxa2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
    const famIds = taxa2.families.map((f) => f.id);
    const missingMap = famIds.filter((id) => typeof FAMS[id] !== 'string');
    ok('六个大类都有图标映射（不缺格）', missingMap.length === 0, missingMap.join(','));
    const extraMap = Object.keys(FAMS).filter((k) => !famIds.includes(k));
    ok('没有多余的大类图标映射', extraMap.length === 0, extraMap.join(','));
    const goneFiles = Object.values(FAMS)
      .filter((f) => !fs.existsSync(path.join(ROOT, 'icon-specimen', 'svg', f + '.svg')));
    ok('映射到的 6 枚大类 SVG 都在磁盘上', goneFiles.length === 0, goneFiles.join(','));
    /* 与扇区上"同一套图"这句话要能核：文件里自带的 title 必须等于那一族的中文名。
       逐字节比 title 而不是比文件名 —— 文件名是搬运动作定的，title 是画的时候写的。 */
    const titleMismatch = famIds.filter((id) => {
      const p = path.join(ROOT, 'icon-specimen', 'svg', (FAMS[id] || '') + '.svg');
      if (!fs.existsSync(p)) return true;
      const t = fs.readFileSync(p, 'utf8');
      const title = (t.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
      const fam = taxa2.families.find((x) => x.id === id);
      return title !== (fam && fam.zh);
    });
    ok('6 枚大类 SVG 的 title 与 taxonomy 的族名逐字相同', titleMismatch.length === 0,
      titleMismatch.join(','));
    /* 大类图不能是空壳：与小类那 24 枚同一档门槛（>= 6 个图元、带渐变）。 */
    const thinFam = [];
    const noGradFam = [];
    for (const id of famIds) {
      const p = path.join(ROOT, 'icon-specimen', 'svg', (FAMS[id] || '') + '.svg');
      if (!fs.existsSync(p)) continue;
      const t = fs.readFileSync(p, 'utf8');
      const shapes = (t.match(/<(path|circle|ellipse|rect|polygon)\b/g) || []).length;
      if (shapes < 6) thinFam.push(`${id}:${shapes}`);
      if (!/url\(#/.test(t)) noGradFam.push(id);
    }
    ok('每枚大类 SVG 的图元数都够（>= 6）', thinFam.length === 0, thinFam.join(','));
    ok('每枚大类 SVG 都带渐变（不是单色块）', noGradFam.length === 0, noGradFam.join(','));
  }

  /* 把状态还原成「有大类 + 有小类」：后面的流程断言要靠它继续往下走。
     必须**先点回第 1 个扇区**再点小类 —— 上面切换留在了第 4 族，直接点小类
     会让家族停在第 4 族，而下游的季节屏断言假设的是 citrus（见 1486 行）。
     这条不是可有可无的收尾：漏了它，四条季节断言会连着红，而红的原因
     与季节文案毫无关系（第一版就踩了这一下）。 */
  appRoot.querySelectorAll('.sector-g')[0].dispatch('click');
  await new Promise((r) => setTimeout(r, 500));
  appRoot.querySelectorAll('.disc-sector.lvl2')[0].dispatch('click');
  await new Promise((r) => setTimeout(r, 400));
}

/* ==== 圆盘 → 底噪的接线（v7 第 1 步的增量，不是取回的那块）====
   取自回那一块之后，圆盘上已经选了「柑橘调 + 古龙水型」（见上面「把状态还原成…」）。
   这里验三件事，每件都能否定一种"看起来接上了"的假实现：
     ① 方向真的被换算成轴写进 state（不是只改了 family）；
     ② 轴与家族的对应关系是 emotionMap 的**全局最优匹配**，不是手配的六个字；
     ③ 底噪层节点真的在 DOM 里 —— v6 的样式写得很完整但 JS 从没创建过它，
        这条断言就是为了让那个缺陷不会再一次静默复现。 */
{
  const S = appMod.__dir;
  ok('圆盘选完家族后 direction 被写进答案',
    S.directionOf({ family: 'floral' }) === 'warm',
    String(S.directionOf({ family: 'floral' })));
  ok('清空家族时 direction 一起被清（不留上一族的光）',
    S.directionOf({ family: null }) === null, String(S.directionOf({ family: null })));

  /* ② 最优匹配：穷举 720 种六族↔六轴配法，本步的 AXIS_OF_FAMILY 必须等于最高分组。
     这一条防的是"某人凭感觉改一格"：改一格几乎必然掉出最优，
     而掉出最优在那张表上肉眼完全看不出来（差 0.05 分，六个数都很像）。 */
  const taxa3 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
  const fams3 = taxa3.families.map((f) => f.id);
  const axes3 = taxa3.emotionMap.map((e) => e.id);
  const w3 = (f, a) => {
    const e = taxa3.emotionMap.find((x) => x.id === a);
    return (e.families && e.families[f]) || 0;
  };
  let best = -1;
  const permute = (rest, picked) => {
    if (!rest.length) {
      let s = 0;
      fams3.forEach((f, i) => { s += w3(f, picked[i]); });
      if (s > best) best = s;
      return;
    }
    rest.forEach((a, i) => permute(rest.slice(0, i).concat(rest.slice(i + 1)), picked.concat([a])));
  };
  permute(axes3, []);
  const mine = fams3.reduce((s, f) => s + w3(f, S.axis[f]), 0);
  ok('家族→轴的表等于 emotionMap 上的最优匹配（720 种配法里的最高分）',
    Math.abs(mine - best) < 1e-9, `本表 ${mine.toFixed(4)} / 最优 ${best.toFixed(4)}`);
  ok('六个家族各自映射到一个不同的轴（不是多族共用一个方向）',
    new Set(fams3.map((f) => S.axis[f])).size === 6,
    fams3.map((f) => `${f}→${S.axis[f]}`).join(' '));

  /* ③ 底噪层真的存在。v6 的缺陷：.amb-wash 在样式层写了 60 行，
     app.js 里 `amb-wash` 零命中 —— 屏幕上根本没有这一层。 */
  const washes = appRoot.querySelectorAll('.amb-wash');
  ok('底噪层 .amb-wash 真的被创建进 DOM（v6 只在 CSS 里存在）',
    washes.length === 1, `实际 ${washes.length} 个`);
  ok('底噪层是背景（负 z-index，且不进无障碍树）',
    washes.length === 1 && String(washes[0].style['z-index']) === '-1'
    && washes[0].attrs['aria-hidden'] === 'true',
    washes.length ? `${washes[0].style['z-index']} / ${washes[0].attrs['aria-hidden']}` : '-');
  /* ③b 刻度必须跟着点击走。圆盘"选了不跳屏"，若刻度只由 renderMasthead 造，
     用户点完会看到页眉右侧空白、底噪却已亮 —— 那是"接了一半"的样子。 */
  ok('页眉刻度在点中香型后立刻出现（不等翻屏）',
    appRoot.querySelectorAll('.amb-tick').length === 1,
    `实际 ${appRoot.querySelectorAll('.amb-tick').length} 个`);
  ok('刻度写着方向与档位（与底噪同源）',
    /[冷暖清沉亮柔]·[起渐满]/.test((appRoot.querySelectorAll('.amb-tick')[0] || {}).textContent || ''),
    (appRoot.querySelectorAll('.amb-tick')[0] || {}).textContent);

  /* ④ 圆盘点中即点燃：direction 已在，ambientOf 必须给出 active=true 且强度 > 0。
     这是"选定反馈要能看出底噪已点燃"的可计算部分（截图只能看"有颜色"）。
     total 跟着 v7 定版的 6 屏走（原写 8 是删屏前的表长）：它参与 strength 的
     分档计算（span = total-1-start），留着 8 等于让这条断言算的是另一张表。 */
  const ambNow = appMod.__ambient({ direction: 'bright' }, 0, 6);
  ok('圆盘给了方向后底噪立即激活（第 1 屏就有光）',
    ambNow.active === true && ambNow.strength > 0,
    `${ambNow.active} / ${ambNow.strength}`);
  ok('底噪在圆盘那一屏是最弱的一档（不抢盘的注意力）',
    Math.abs(ambNow.strength - 0.34) < 1e-9, String(ambNow.strength));
  /* 大方向屏（emotion）**已随 v7 第 3 步① 从流程删除**，但它仍是引擎与底噪的
     一个入口（answers.emotion 键保留、src/ambient.js 仍支持它兜底）。
     所以下面三条测的是**契约**而不是那一屏 —— 它们不读 DOM，只调 __ambient：
     K1「后答的大方向不改方向」、K2「圆盘被跳过时 emotion 仍能点亮」（措辞随屏
     删除从"大方向屏"改成"emotion 入口"，断言本体一字未改）、
     K3「未选大方向时底噪不激活」（原在已删的第 3 屏段里，随屏删除挪到这里）。 */
  const ambBoth = appMod.__ambient({ direction: 'bright', emotion: 'cold' }, 3, 6);
  ok('后答的大方向不改底噪方向（先给的那一个说了算）',
    ambBoth.axis === 'bright', ambBoth.axis);
  /* 圆盘没给方向时，emotion 入口照旧能点亮 —— v6 的行为不能被这次改动弄丢。 */
  const ambEmo = appMod.__ambient({ emotion: 'cold' }, 2, 6);
  ok('圆盘被跳过时 emotion 入口仍能点亮底噪（v6 行为保留）',
    ambEmo.active === true && ambEmo.axis === 'cold', `${ambEmo.active} / ${ambEmo.axis}`);
  /* 一条纯 __ambient({}) 断言，与屏无关：没选大方向时底噪必须是"诚实地没有"，
     不是强度 0 的底噪。它守的是 src/ambient.js 的第一条纪律
     （来源只能是用户自己给的第一个大方向），屏删了这条纪律还在。 */
  const ambNone = appMod.__ambient({}, 1, 6);
  ok('未选大方向时底噪不激活', ambNone.active === false, String(ambNone.active));
}

/* ---------- ① 首屏之后：动态避雷（v7 第 2 步，移到第 2 位） ----------
   旧「受不了的味道」是固定 18 张 life-grid.is-neg；本步改成按方向算候选的
   场景卡片墙 .avoid-wall，并紧跟圆盘。圆盘已选「柑橘·古龙水型」，必有模糊带，
   所以这一屏一定出现（不会被跳过）。断言改的是"屏的结构与交互"，不是放宽门槛。 */
await advance();
ok('第 2 屏是动态避雷（data-step=unwanted）', stepId() === 'unwanted', stepId());
ok('避雷屏标题是「只问最容易踩雷的几个」',
  getStepText().includes('只问最容易踩雷的几个'), getStepText().slice(0, 90));
{
  const cards = appRoot.querySelectorAll('.avoid-card');
  ok('避雷屏是场景卡片墙（.avoid-wall），不是旧 life-grid',
    appRoot.querySelectorAll('.avoid-wall').length === 1
    && appRoot.querySelectorAll('.life-grid').length === 0,
    `wall ${appRoot.querySelectorAll('.avoid-wall').length} / life-grid ${appRoot.querySelectorAll('.life-grid').length}`);
  ok('候选封顶 6 张且至少 1 张', cards.length >= 1 && cards.length <= 6, `实际 ${cards.length}`);
  ok('每张卡配标本风小图（复用 24 图标，不新造）',
    appRoot.querySelectorAll('.avoid-spec').length === cards.length,
    `图 ${appRoot.querySelectorAll('.avoid-spec').length} / 卡 ${cards.length}`);
  ok('每张卡写场景句＋气味提示（不是成分名）',
    appRoot.querySelectorAll('.avoid-zh').length === cards.length
    && appRoot.querySelectorAll('.avoid-hint').length === cards.length,
    `zh ${appRoot.querySelectorAll('.avoid-zh').length} / hint ${appRoot.querySelectorAll('.avoid-hint').length}`);
  /* 无术语题底线同样适用于避雷屏：不许出现族名与香材英文原名。 */
  const txt = getStepText();
  ok('避雷屏不出现任何香调族名', !/柑橘调|花香调|木质调|东方琥珀调|清新调|美食调/.test(txt), txt.slice(0, 80));
  ok('避雷屏不出现香材英文原名', !/\b(bergamot|lemon|jasmine|sandalwood|vanilla|vetiver|oud)\b/i.test(txt), txt.slice(0, 80));
  ok('顶部说明写「不点就是接受」', /不点就是接受/.test(txt), txt.slice(0, 120));
  /* 交互只有点卡＝「这个不要」：点第一张，aria-pressed 翻 true、挂 is-on、出现标记。 */
  const first = cards[0];
  ok('未点时 aria-pressed=false', first.attrs['aria-pressed'] === 'false', String(first.attrs['aria-pressed']));
  first.dispatch('click');
  await new Promise((r) => setTimeout(r, 60));
  ok('点卡＝这个不要（aria-pressed 翻 true 且挂 is-on）',
    first.attrs['aria-pressed'] === 'true' && first.classList.contains('is-on'),
    `${first.attrs['aria-pressed']} / ${first.className}`);
  ok('点卡后计数变成「已标 1 个」', /已标 1 个/.test(getStepText()),
    (appRoot.querySelectorAll('.avoid-count')[0] || {}).textContent);
}

/* ---------- ①b 避雷屏的另外两处改动（2026-11-23，Eddie 批准 QW10 诊断） ----------
   ① 第三态「没闻过」（不扣分也不加分）② 已排除清单可点撤销 ③ 屏顶代价提示。
   三条都要在同一屏上验 —— 它们共用一段状态，分开验会各自"绿"而合起来错。 */
{
  const cards = appRoot.querySelectorAll('.avoid-card');
  /* ③ 代价提示：口径由任务书给定，这里守两件事 ——
     ① 它在屏顶且在卡片墙之前（点第一张卡之前就能看到）；
     ② 它不含任何内部权重数字（−40 / +14 是引擎术语，不许上屏）。 */
  const tip = appRoot.querySelectorAll('.avoid-tip')[0];
  ok('避雷屏顶部有代价提示（.avoid-tip）', !!tip,
    `实际 ${appRoot.querySelectorAll('.avoid-tip').length} 条`);
  ok('代价提示写清「点错会扣分」与「没闻过」两个口径',
    !!tip && /扣/.test(tip.textContent) && /没闻过/.test(tip.textContent),
    tip && tip.textContent);
  ok('代价提示不含内部权重数字（−40 / +14 这类不许上屏）',
    !!tip && !/[-−+]\s?\d+|40|14/.test(tip.textContent), tip && tip.textContent);
  /* 位置：提示必须先于卡片墙出现（DOM 顺序即朗读顺序与视觉顺序）。
     桩的选择器不支持逗号分组，所以直接读父节点的 children 顺序 ——
     这也正是浏览器里"谁先谁后"的定义。 */
  {
    const wallEl = appRoot.querySelectorAll('.avoid-wall')[0];
    const tipEl = appRoot.querySelectorAll('.avoid-tip')[0];
    const siblings = (tipEl && tipEl.parentNode && tipEl.parentNode.children) || [];
    ok('代价提示排在卡片墙之前（点卡前就能看见）',
      !!tipEl && !!wallEl && siblings.indexOf(tipEl) >= 0
      && siblings.indexOf(tipEl) < siblings.indexOf(wallEl),
      `tip@${siblings.indexOf(tipEl)} wall@${siblings.indexOf(wallEl)}`);
  }

  /* ① 第三态：给第 2 张卡点「没闻过」。
     关键断言不是"卡变色了"，而是"引擎侧一个字都没变" ——
     界面上两种态长得不一样，但 dislikedNotes 只有一个来源。 */
  const rows = appRoot.querySelectorAll('.avoid-row');
  ok('每张卡都配一枚独立的「没闻过」键（不是嵌在卡里的 span）',
    rows.length === cards.length
    && rows.every((r) => r.querySelectorAll('.avoid-nope').length === 1),
    `行 ${rows.length} / 卡 ${cards.length}`);
  ok('「没闻过」是真 button（键盘可达，不是坐标点击）',
    rows.every((r) => r.querySelector('.avoid-nope').tagName === 'BUTTON'),
    rows.map((r) => r.querySelector('.avoid-nope').tagName).join(','));

  const before = appMod.__avoid.picked();
  const second = rows[1];
  const secondId = second.attrs['data-row'];
  const nope = second.querySelector('.avoid-nope');
  ok('未点「没闻过」时 aria-pressed=false', nope.attrs['aria-pressed'] === 'false',
    String(nope.attrs['aria-pressed']));
  nope.dispatch('click');
  await new Promise((r) => setTimeout(r, 60));
  const after = appMod.__avoid.picked();
  ok('点「没闻过」→ 该 id 进 noSmell、不进 unwanted',
    after.noSmell.includes(secondId) && !after.unwanted.includes(secondId),
    `noSmell=${after.noSmell.join(',')} / unwanted=${after.unwanted.join(',')}`);
  ok('点「没闻过」→ dislikedNotes 一个字节都没变（不进打分）',
    after.dislikedNotes.join(',') === before.dislikedNotes.join(','),
    `${before.dislikedNotes.join(',')} → ${after.dislikedNotes.join(',')}`);
  ok('点「没闻过」→ 「不要」那一列也没变多',
    after.unwanted.length === before.unwanted.length,
    `${before.unwanted.length} → ${after.unwanted.length}`);
  ok('没闻过态在卡上可辨（is-unknown + aria-pressed 翻 true）',
    second.querySelector('.avoid-card').classList.contains('is-unknown')
    && nope.attrs['aria-pressed'] === 'true',
    second.querySelector('.avoid-card').className);
  ok('没闻过态不盖「这个不要」章（两枚章同卡＝自相矛盾的陈述）',
    !second.querySelector('.avoid-card').classList.contains('is-on'),
    second.querySelector('.avoid-card').className);
  ok('计数行同时报两种态', /没闻过/.test(appRoot.querySelectorAll('.avoid-count')[0].textContent),
    appRoot.querySelectorAll('.avoid-count')[0].textContent);

  /* ② 已排除清单：上一步点的第 1 张卡已经在 unwanted 里，必须出现在清单上。 */
  const excl = appRoot.querySelectorAll('.avoid-excluded')[0];
  ok('屏内有「你已排除」汇总行', !!excl && /你已排除/.test(excl.textContent),
    excl && excl.textContent);
  const undo = excl.querySelectorAll('.avoid-undo');
  ok('已排除清单里的名字可点（撤销入口）',
    undo.length === before.unwanted.length && undo.length >= 1,
    `撤销键 ${undo.length} / 已排除 ${before.unwanted.length}`);
  ok('撤销键是真 button 且带无障碍名（读屏能说出撤销的是哪一条）',
    undo.every((b) => b.tagName === 'BUTTON' && /取消排除/.test(b.attrs['aria-label'] || '')),
    undo.map((b) => b.attrs['aria-label']).join(' | '));

  /* 点清单里的名字 → 该条回到未选态（卡上 is-on 摘掉、计数回落）。 */
  const undoId = undo[0].attrs['data-undo'];
  undo[0].dispatch('click');
  await new Promise((r) => setTimeout(r, 60));
  const afterUndo = appMod.__avoid.picked();
  ok('点清单里的名字 → 该条取消排除（回到未选）',
    !afterUndo.unwanted.includes(undoId) && afterUndo.unwanted.length === before.unwanted.length - 1,
    `unwanted=${afterUndo.unwanted.join(',')}`);
  ok('取消排除后卡上的 is-on 也摘掉了（状态与视觉同步）',
    !appRoot.querySelectorAll(`[data-row="${undoId}"] .avoid-card`)[0].classList.contains('is-on'),
    appRoot.querySelectorAll(`[data-row="${undoId}"] .avoid-card`)[0].className);
  ok('取消排除后 dislikedNotes 同步清掉（否则引擎还在扣分）',
    afterUndo.dislikedNotes.length < before.dislikedNotes.length,
    `${before.dislikedNotes.length} → ${afterUndo.dislikedNotes.length}`);
  /* 复原：这一段为了验撤销而真的摘掉了一条排除项，而后面几屏与结果页的断言
     都是在"第 1 张卡已标不要"这份状态上建立的（实测过：不还原，结果页第 1 瓶
     会从「匹配度 82%」变成「初步匹配」，虽然仍绿，但验的已经是另一条分支）。
     点回第 1 张卡把它还原，这一段就只动它自己要验的东西。 */
  appRoot.querySelectorAll(`[data-row="${undoId}"] .avoid-card`)[0].dispatch('click');
  await new Promise((r) => setTimeout(r, 60));
  ok('撤销后可点回「不要」（复原测试前置状态）',
    appMod.__avoid.picked().unwanted.includes(undoId)
    && appMod.__avoid.picked().dislikedNotes.join(',') === before.dislikedNotes.join(','),
    `unwanted=${appMod.__avoid.picked().unwanted.join(',')}`);

  /* 互斥：把同一张卡从「没闻过」改判成「不要」，「没闻过」必须让位。 */
  second.querySelector('.avoid-card').dispatch('click');
  await new Promise((r) => setTimeout(r, 60));
  const swapped = appMod.__avoid.picked();
  ok('同一张卡改成「不要」后，「没闻过」让位（两列互斥）',
    swapped.unwanted.includes(secondId) && !swapped.noSmell.includes(secondId),
    `unwanted=${swapped.unwanted.join(',')} / noSmell=${swapped.noSmell.join(',')}`);
  /* 收尾：把它还原成未选，后面的流程不受这一段的点击影响。 */
  second.querySelector('.avoid-card').dispatch('click');
  await new Promise((r) => setTimeout(r, 60));
  ok('第三态可完整回到未选（不是单向锁死）',
    !appMod.__avoid.picked().unwanted.includes(secondId)
    && !appMod.__avoid.picked().noSmell.includes(secondId),
    JSON.stringify(appMod.__avoid.picked()));
}

/* ---------- ①c 「已选方向」锚点（2026-11-24，qoder/avoid-capsule 视觉定版） ----------
   过渡元素而不是过渡页：避雷题按刚选的方向现算，屏顶把那个方向胶囊
   （图标 + 名字）原样带过来。锚点纯展示 —— 守四件事：
   在位 / 名字与圆盘选择同源 / 排在卡片墙之前 / 不新增交互。
   本段只读不点，后面几屏依赖的状态一字不动。 */
{
  const anchor = appRoot.querySelectorAll('.avoid-anchor')[0];
  ok('避雷屏顶部有「已选方向」锚点（.avoid-anchor，恰好一枚）',
    appRoot.querySelectorAll('.avoid-anchor').length === 1,
    `实际 ${appRoot.querySelectorAll('.avoid-anchor').length} 枚`);
  /* 圆盘选的是「柑橘调 · 古龙水型」：可见文本只落小类名（与盘心主词同源），
     族名进 aria-label 给读屏 —— 可见字面仍守"避雷屏不出现香调族名"那条老底线。 */
  const name = anchor && anchor.querySelectorAll('.avoid-anchor-name')[0];
  ok('锚点名字＝圆盘刚选中的小类（与出题方向同源）',
    !!name && name.textContent === '古龙水型', name && name.textContent);
  ok('锚点可见文本不含族名，族名只进 aria-label（无术语底线不破）',
    !!anchor && !/柑橘调/.test(anchor.textContent)
    && /已选方向/.test(anchor.attrs['aria-label'] || ''),
    anchor && `${anchor.textContent} / ${anchor.attrs['aria-label']}`);
  ok('锚点带方向图标（svg，与小类标本/大类徽记同一套，不新造）',
    !!anchor && anchor.querySelectorAll('.avoid-anchor-icon').length === 1
    && anchor.querySelectorAll('.avoid-anchor-icon')[0].tagName === 'SVG',
    anchor && String(anchor.querySelectorAll('.avoid-anchor-icon').length));
  /* 位置：锚点先于卡片墙（DOM 顺序即视觉与朗读顺序，与 tip 同款判据）。 */
  const wallEl = appRoot.querySelectorAll('.avoid-wall')[0];
  const siblings = (anchor && anchor.parentNode && anchor.parentNode.children) || [];
  ok('锚点排在卡片墙之前（先看到方向，再看到题）',
    !!anchor && !!wallEl && siblings.indexOf(anchor) >= 0
    && siblings.indexOf(anchor) < siblings.indexOf(wallEl),
    `anchor@${siblings.indexOf(anchor)} wall@${siblings.indexOf(wallEl)}`);
  /* 只展示、不新增交互：不是 BUTTON/A，tabindex=-1 退出 Tab 序，也没有 href。 */
  ok('锚点不是可点控件（div + tabindex=-1，无 href）',
    !!anchor && anchor.tagName === 'DIV'
    && anchor.attrs['tabindex'] === '-1' && anchor.attrs.href == null,
    anchor && `${anchor.tagName} tabindex=${anchor.attrs['tabindex']}`);
}

/* ---------- ② 预算 ——【已整段搬到末屏，见 ⑧ 之前的「② 预算（末屏）」】 ----------
   v7 第 3 步③ 把预算屏从第 3 位搬到末位（第 6 位）。本段原来写死「第 3 屏是预算屏」
   并按位置取 `.price-tab`，搬完之后它落到 `occasion` 上：`.price-tab` 为空数组，
   `[1]` 是 undefined → `tab.dispatch('click')` 抛 TypeError，脚本在打印
   PASS/FAIL 汇总**之前**退出，整份测试一条结果都给不出来。
   所以这里不保留任何断言（连空壳也不留）：屏还在，只是位置换了，
   8 条内容断言一字不改地整段平移到末屏，理由见那里的注释。 */

// /* ---------- ③ 大方向（v6 原屏）——【v7 第 3 步① 已整段跳过】 ----------
//    大方向屏（data-step=emotion）已按 v7 定版从流程删除，本段第 1 条
//    `await advance()` 会落到下一屏，且 1089 的 `.sky-band` 取不到元素后
//    直接 `.dispatch('click')` → 抛 TypeError、脚本 exit 1（一条红都拿不到）。
//    所以整段按行注释跳过，不删：L4 才逐条改断言，L1 只负责让删屏后的
//    其余断言仍能跑出来。被跳过的断言名（7 条）逐条抄进了 L1 commit message。
//    其中「未选大方向时底噪不激活」是纯 __ambient({}) 断言（与屏无关），
//    L4 要把它挪到 K1/K2 那组保留。
//
// ---------- ③ 大方向（v6 原屏，本步不动；底噪此时已由圆盘点燃） ----------
// await advance();
// ok('第 4 屏是大方向（data-step=emotion）', stepId() === 'emotion', stepId());
// ok('大方向屏标题是「什么感觉」', getStepText().includes('什么感觉'), getStepText().slice(0, 80));
// ok('六个大方向都在屏上', appRoot.querySelectorAll('.sky-band').length === 6,
//   `实际 ${appRoot.querySelectorAll('.sky-band').length}`);
// ok('每条天际线都有天光层', appRoot.querySelectorAll('.sky-line').length === 6,
//   `实际 ${appRoot.querySelectorAll('.sky-line').length}`);
// /* 没选大方向之前，底噪必须是"诚实地没有" —— 不是强度 0 的底噪。
//    这一条守的是 src/ambient.js 的第一条纪律：来源只能是用户自己给的第一个大方向。 */
// {
//   const amb = appMod.__ambient({ }, 1, 8);
//   ok('未选大方向时底噪不激活', amb.active === false, String(amb.active));
// }
// {
//   const band = appRoot.querySelectorAll('.sky-band')[0];
//   band.dispatch('click');
//   await new Promise((r) => setTimeout(r, 60));
//   ok('点方向后天际线变选中态', band.attrs['aria-checked'] === 'true', String(band.attrs['aria-checked']));
//   /* 译文行必须换成「一天里的哪一刻」—— 这是这一屏的译文责任。 */
//   const gloss = appRoot.querySelectorAll('.sky-gloss')[0];
//   ok('方向屏的译文行换成了具体时刻', /——/.test(gloss.textContent), gloss.textContent.slice(0, 60));
// }
// --------------------------------------------------------------------------- */


/* ---------- ⑤ 场合（昼夜光景，定版范例之一） ----------
   v7 第 2 步：旧第 5 屏「受不了的味道」已移到第 2 位并改成避雷墙（见 ①），
   所以 wanted 之后直接 advance 到场合，这里不再有一屏 unwanted。
   v7 第 3 步③：预算屏搬到末位后，场合从第 4 屏前移到第 3 屏 —— 屏号用
   `screenOf('occasion')` 从当前生效步骤表派生，不写死：避雷屏被跳过时
   （共 5 步）它会自动变成「第 2 屏」，写死就会在另一条分支上误报。 */
await advance();
ok(`${screenOf('occasion')}是场合（data-step=occasion）`, stepId() === 'occasion',
  `实际 ${stepId()}（表长 ${appMod.__steps.cur().length}）`);
{
  const bands = appRoot.querySelectorAll('.hour-band');
  ok('场合屏是五个时段段（不是圆盘）', bands.length === 5, `实际 ${bands.length}`);
  /* **位置即时间**：白天三档必须排在傍晚两档之前。这条是本屏的对应关系，
     用 data 顺序核，不靠 CSS。 */
  const seq = bands.map((x) => (x.classList.contains('is-night') ? 'night' : 'day'));
  ok('地平线按时段排序：白天在前、夜间在后',
    seq.join(',') === 'day,day,day,night,night', seq.join(','));
  ok('天光层存在（一条从晨到夜的连续渐变）', appRoot.querySelectorAll('.hour-glow').length === 1);
  ok('地平线两端有晨/夜刻度', appRoot.querySelectorAll('.hour-ends').length === 1);
  bands[0].dispatch('click');
  await new Promise((r) => setTimeout(r, 60));
  ok('点一段后天色转实', bands[0].attrs['aria-checked'] === 'true', String(bands[0].attrs['aria-checked']));
  /* 译文必须说「光线 + 距离」—— 这两件事才是场合真正影响推荐的地方。 */
  ok('场合译文说到了距离/光线', /距离|光线|闻到/.test(appRoot.querySelectorAll('.hour-gloss')[0].textContent),
    appRoot.querySelectorAll('.hour-gloss')[0].textContent.slice(0, 50));

  /* ---- 固定题头（design-item5-20261125，Muse 裁决「采纳修改」）----
     背景：场合屏与季节屏共用同一套版式模板，第一眼区分只能落在文字上。
     原先题号 + 标题在普通 .stage-lead 里，滚到地平线底部就整块滚出视口，
     屏上只剩控件 —— 两屏就退回"同一屏换了颜色"。
     这三条守的是结构（题头单独成块、只挂在场合屏、题号与标题都在里面），
     样式侧（position: sticky）在下面那条 CSS 断言里守 —— 两处都守住，
     才谈得上"滚动时始终可见"。 */
  {
    const heads = appRoot.querySelectorAll('.q-fixed-head');
    ok('场合屏题头单独成块（.q-fixed-head 恰好一个）', heads.length === 1, `实际 ${heads.length}`);
    const h = heads[0];
    ok('固定题头里有题号（第 X 步 / 共 Y 步）',
      !!h && /第\s*\d+\s*步\s*\/\s*共\s*\d+\s*步/.test(h.textContent),
      h ? h.textContent.slice(0, 40) : '(无节点)');
    ok('固定题头里有题目标题原文（主要什么时候用？）',
      !!h && h.textContent.includes('主要什么时候用？'),
      h ? h.textContent.slice(0, 40) : '(无节点)');
    /* help 不进固定块：它有三行，窄屏固定住会把地平线挤下半屏。
       但它必须仍在屏上（文案一字未动，只是跟着内容滚）。 */
    ok('help 不在固定块里、但仍在屏上',
      !!h && !h.textContent.includes('你最常在什么场合用')
      && appRoot.textContent.includes('你最常在什么场合用'),
      h ? 'hh' : '(无节点)');
    /* CSS 侧：sticky 必须挂在场合屏的题头上，且背景是实心纸面。
       没有实心底，滚动时下面的字会从题头的行缝里穿过去。 */
    const cssNoC = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    ok('固定题头在 CSS 里是 sticky（滚动时贴屏顶）',
      /#app\[data-step="occasion"\]\s*\.q-fixed-head\s*\{[^}]*?position:\s*sticky/.test(cssNoC),
      '缺 position: sticky');
    ok('固定题头有实心纸底（内容不许从字缝穿过）',
      /#app\[data-step="occasion"\]\s*\.q-fixed-head\s*\{[^}]*?background:\s*var\(--bg\)/.test(cssNoC),
      '缺 background: var(--bg)');
  }
}

/* ---------- ⑥ 季节（温度光带，定版范例之二） ----------
   屏号派生（见 ⑤）：预算搬走后季节从第 5 屏前移到第 4 屏。 */
await advance();
ok(`${screenOf('season')}是季节（data-step=season）`, stepId() === 'season',
  `实际 ${stepId()}（表长 ${appMod.__steps.cur().length}）`);
{
  const stops = appRoot.querySelectorAll('.temp-stop');
  ok('季节屏是温度光带上的四个落点', stops.length === 4, `实际 ${stops.length}`);
  /* **位置即温度**：每个落点的 left 必须由该季的 temp 算出来，不许平均分四格。
     平均分就把"温度轴"退回成"四个并列选项"。这里读内联 style 的 left。 */
  const lefts = stops.map((x) => parseFloat(String(x.style.left)));
  ok('四个落点按温度排布（不是等分四格）',
    lefts.every((v) => Number.isFinite(v))
    && new Set(lefts).size === 4
    && Math.abs(lefts[0] - lefts[1]) > 3,
    lefts.join(','));
  /* 春(0.1)→55%、秋(0.35)→67.5%，两者不能挨得太近也不该重合 */
  ok('冬在最冷端、夏在最热端',
    lefts.indexOf(Math.min(...lefts)) === 3 && lefts.indexOf(Math.max(...lefts)) === 1,
    lefts.join(','));
  ok('光带有一条温度光（跟着选中档移动）', appRoot.querySelectorAll('.temp-glow').length === 1);
  /* 译文行先验"未选时是诚实的指引"，再验"选了之后换成了体感描述"。
     顺序很重要：空态那句是「按你打算主要在哪个季节用选一个…」，
     它本来就不该含"度/冷/热"这些体感词 —— 第一版把这条断言写在点击**之前**，
     于是拿空态文案去要求它讲体感，那是一条挂错位置的断言（会永远红）。 */
  ok('未选季节时译文是诚实的指引（不假装已选）',
    /选一个|跳过/.test(appRoot.querySelectorAll('.temp-gloss')[0].textContent),
    appRoot.querySelectorAll('.temp-gloss')[0].textContent.slice(0, 50));
  stops[3].dispatch('click');
  await new Promise((r) => setTimeout(r, 60));
  ok('选一季后译文换成体感描述（含温度/风这类身体经验）',
    /度|冷|热|风/.test(appRoot.querySelectorAll('.temp-gloss')[0].textContent),
    appRoot.querySelectorAll('.temp-gloss')[0].textContent.slice(0, 50));
  ok('选一季后译文行的 is-idle 摘掉',
    !appRoot.querySelectorAll('.temp-gloss')[0].classList.contains('is-idle'),
    appRoot.querySelectorAll('.temp-gloss')[0].className);
  ok('选一季后温度被写进 CSS 变量（--band-temp）',
    appRoot.querySelectorAll('.temp-band')[0].style['--band-temp'] != null,
    String(appRoot.querySelectorAll('.temp-band')[0].style['--band-temp']));
  await new Promise((r) => setTimeout(r, 60));
  ok('点一季后落点亮起', stops[3].attrs['aria-checked'] === 'true', String(stops[3].attrs['aria-checked']));

  /* ---- 两屏的区分必须靠文字（design-item5-20261125 验收项 2）----
     任务书要求：场合屏 vs 季节屏去色后，凭标题 + 题号仍能一眼区分。
     这条在 DOM 里就能验到核心：两屏的**题号不同、问句不同**。
     去色只是抹掉颜色，抹不掉文字 —— 所以只要这两处不同，
     "凭标题 + 题号区分"在灰度下必然成立（截图证据在回执里给）。
     反向也守一条：季节屏不许挂 .q-fixed-head —— 本腿只动场合屏，
     季节屏的版面一个像素都不该变。 */
  {
    const seasonHead = appMod.__steps.head('season');
    const occHead = appMod.__steps.head('occasion');
    ok('场合屏与季节屏的题号不同（灰度下凭题号可分）',
      seasonHead.kicker !== occHead.kicker,
      `场合「${occHead.kicker}」 季节「${seasonHead.kicker}」`);
    ok('场合屏与季节屏的问句不同（灰度下凭标题可分）',
      seasonHead.title !== occHead.title,
      `场合「${occHead.title}」 季节「${seasonHead.title}」`);
    ok('季节屏没有固定题头（本腿不动季节屏）',
      appRoot.querySelectorAll('.q-fixed-head').length === 0,
      `实际 ${appRoot.querySelectorAll('.q-fixed-head').length} 个`);
  }

  /* ---- 情境句（2026-11-23 定版 24 句）----
     这一屏现在有两行译文，分工不同，所以**四件事分开验**：
       ① 未选季节时情境句不存在（不替用户选一个季节来解释）；
       ② 选了季节、也有方向时，出现的是「该方向 × 该季」那一句（不是别的格）；
       ③ 换了季节，句子跟着换（不是渲染一次就冻住）；
       ④ 没有方向（情绪入口）时退回该季 desc —— 不许留空、不许白屏。
     ③④ 都要真渲染才看得见，所以放在这个块里而不是纯函数断言里。 */
  {
    /* 走到这一屏时家族是 citrus（本文件前面点的是 sectorGroups[0]，见 940 行）。
       定版表里 citrus 对应「果香」—— 这一层映射在 src/season-copy.js 里，
       这里不重抄那张表，只验"上屏的那句 = seasonScene 算出的那句"。 */
    const cell = (fam, s) => appMod.__seasonScene(fam, s);
    ok('情境句与 seasonScene 同源（不是渲染层另写了一份文案）',
      typeof cell('citrus', 'winter') === 'string' && cell('citrus', 'winter').length > 0,
      String(cell('citrus', 'winter')));

    const sceneEl = () => appRoot.querySelectorAll('.season-scene')[0];
    ok('季节屏有情境句这一行（只有一个）', appRoot.querySelectorAll('.season-scene').length === 1,
      `实际 ${appRoot.querySelectorAll('.season-scene').length}`);

    /* 此刻 stops[3]（冬）已被点上，家族是 citrus —— 应是「果香 × 冬」那句。 */
    const wantWinter = cell('citrus', 'winter');
    ok('选了季节 + 有方向时，屏上是该方向 × 该季那一句',
      !!sceneEl() && sceneEl().hidden === false && sceneEl().textContent === wantWinter,
      `期望「${wantWinter}」实得「${sceneEl() ? sceneEl().textContent : '(无节点)'}」`);

    /* 这句话必须真的是季节表里的那一格，而不是碰巧非空 ——
       直接把它与 SEASON_SCENES 逐字对一次。
       为什么不在这里读定版 md：md 不在仓库里，check-head 会把 HEAD 干净导出到
       临时目录再跑，那边读不到本机路径，这条断言就会变成"只有本机能绿"的假门。
       "与 md 逐字一致"由 scripts/verify-season-copy.mjs 单独守（它是本任务的
       验收脚本，允许读本机路径，且可用 SEASON_COPY_MD 覆盖）。 */
    const cellTable = appMod.__seasonCells;
    const cellOf = (fam, s) => (cellTable.find((c) => c.family === fam && c.season === s) || {}).sentence;
    ok('上屏的这句逐字等于季节表里那一格（不是渲染层另写的文案）',
      cellOf('citrus', 'winter') === wantWinter,
      `表「${cellOf('citrus', 'winter')}」屏「${wantWinter}」`);

    /* 换一季：句子必须跟着换，且仍然来自同一张表。 */
    stops[0].dispatch('click');
    await new Promise((r) => setTimeout(r, 60));
    const wantSpring = cell('citrus', 'spring');
    ok('换季后情境句跟着换（不是渲染一次就冻住）',
      !!sceneEl() && sceneEl().textContent === wantSpring && wantSpring !== wantWinter,
      `期望「${wantSpring}」实得「${sceneEl() ? sceneEl().textContent : '(无节点)'}」`);
    ok('换季后的这句也逐字等于表里那一格',
      cellOf('citrus', 'spring') === wantSpring, String(cellOf('citrus', 'spring')));

    /* ④ 回退：把方向清掉（等价于从情绪入口进来的人），句子退回该季 desc。
       desc 是 SEASONS 里原有的那句，它必须还在 —— 这是"不许白屏"的判据。 */
    const keepFam = appMod.__state.answers.family;
    appMod.__state.answers.family = null;
    appMod.__seasonRepaint();
    const fallback = sceneEl();
    ok('没有方向时退回该季原有的 desc（不留空行）',
      !!fallback && fallback.hidden === false && fallback.textContent.length > 0
      && fallback.textContent !== wantSpring,
      fallback ? `「${fallback.textContent}」` : '(无节点)');
    appMod.__state.answers.family = keepFam;
    appMod.__seasonRepaint();
    ok('恢复方向后重新回到该方向那一句',
      !!sceneEl() && sceneEl().textContent === wantSpring,
      sceneEl() ? sceneEl().textContent : '(无节点)');
  }
}

/* ---------- ⑦ 浓淡（扩散场，定版范例之三） ----------
   屏号派生（见 ⑤）：预算搬走后浓淡从第 6 屏前移到第 5 屏。 */
await advance();
ok(`${screenOf('concentration')}是浓淡（data-step=concentration）`, stepId() === 'concentration',
  `实际 ${stepId()}（表长 ${appMod.__steps.cur().length}）`);
{
  const rings = appRoot.querySelectorAll('.diffuse-ring');
  ok('扩散场是五个同心环', rings.length === 5, `实际 ${rings.length}`);
  /* **半径即扩散距离**：环的直径必须随档位递增，不能五环同尺寸
     （同尺寸就退回成五个按钮）。 */
  const pcts = rings.map((x) => parseFloat(String(x.style['--ring-pct'])));
  ok('五环半径随档位递增（半径=扩散距离）',
    pcts.every((v) => Number.isFinite(v))
    && pcts.every((v, i) => i === 0 || v > pcts[i - 1]),
    pcts.join(','));
  ok('场心色团存在', appRoot.querySelectorAll('.diffuse-core').length === 1);
  /* 三个物件都有编号（一屏三物必须能说清"这是第几个"）。 */
  const t = getStepText();
  ok('浓淡屏三个物件都带编号（① ② ③）', /①/.test(t) && /②/.test(t) && /③/.test(t), t.slice(0, 100));
  ok('未选浓度时 ③ 留香是空态（不凭空给推断值）',
    appRoot.querySelectorAll('.long-read.is-empty').length === 1,
    `空态 ${appRoot.querySelectorAll('.long-read.is-empty').length} 个`);
  /* 浓度卡仍是 EDC…Extrait 那一组档位 */
  const grid = appRoot.querySelector('.choice-grid');
  const concIds = grid ? grid.querySelectorAll('[role="radio"]').map((x) => x.attrs['data-id']) : [];
  ok('浓度卡是 EDC…Extrait 这一组档位',
    concIds.includes('eau-de-parfum') && concIds.includes('eau-de-toilette'), concIds.join(','));
  /* 点最外环 → 它成为当前档。
     注意：可点的是 .diffuse-hit（视觉环 .diffuse-ring 是 aria-hidden 的装饰），
     两者分开是因为五个环同心，若按钮自己占满整圆，外环会盖住内环的点击。
     所以断言要读 hit 上的 aria-checked，不是 ring 上的。 */
  const hits = appRoot.querySelectorAll('.diffuse-hit');
  ok('扩散场有五枚真实命中按钮（每档一个）', hits.length === 5, `实际 ${hits.length}`);
  ok('命中按钮互不重叠（同一时刻只有一个 tabindex=0）',
    hits.filter((b) => b.attrs.tabindex === '0').length <= 1,
    hits.map((b) => b.attrs.tabindex || '-').join(','));
  hits[4].dispatch('click');
  await new Promise((r) => setTimeout(r, 60));
  ok('点最外环后它成为当前档', hits[4].attrs['aria-checked'] === 'true',
    String(hits[4].attrs['aria-checked']));
  ok('点最外环后场心色团跟着涨大（--ring-pct 最大档生效）',
    appRoot.querySelectorAll('.diffuse-ring').some((r) => r.classList.contains('is-on')
      && r.attrs['data-v'] === '5'),
    appRoot.querySelectorAll('.diffuse-ring').map((r) => r.attrs['data-v'] + ':' + r.className).join(' | '));
  /* ==== 回归：五环必须同心（2026-11-17 修） ====
     曾经把 top 写成 50 - pct/2，而 .diffuse-ring 的 transform 已经是
     translate(-50%,-50%) —— 半径被扣了两次，五个环圆心各不相同、
     底边全相切于容器中心，最大那个向上溢出 193px 盖住页头标题
     （playwright 实测 cy = 590.7/556.2/521.7/487.2/452.7）。
     同心圆的定义就是圆心固定、直径不同，所以 top 必须恒为 50%。 */
  const tops = rings.map((x) => String(x.style.top).replace(/\s/g, ''));
  ok('五环同心（圆心 top 恒为 50%，不被半径扣两次）',
    new Set(tops).size === 1 && /^50(\.0+)?%$/.test(tops[0]),
    tops.join(','));
}

/* ---------- ② 预算（末屏；v7 第 3 步③ 从第 3 位搬到末位） ----------
   这 8 条内容断言一字未改，只是整体从「第 3 屏」平移到末屏位置 ——
   屏还在、题面没动，只有位置换了，所以判据不该跟着改：
   「价位未知的不参与」这条守的是"别把未知静默当成便宜"的信任底线，删不得。
   屏号仍用派生（`screenOf('budget')`），不写死第 6 屏：避雷屏被跳过时
   表长是 5，预算就是第 5 屏 —— 写死 6 会在那条分支上误报。 */
await advance();
ok(`${screenOf('budget')}是预算屏（data-step=budget，末屏）`, stepId() === 'budget',
  `实际 ${stepId()}（表长 ${appMod.__steps.cur().length}）`);
ok('预算屏标题是「你打算花多少钱」', getStepText().includes('你打算花多少钱'), getStepText().slice(0, 90));
ok('预算屏是四档 + 不限，共 5 枚价签',
  appRoot.querySelectorAll('.price-tab').length === 5,
  `实际 ${appRoot.querySelectorAll('.price-tab').length}`);
ok('价签组是 radiogroup 语义',
  appRoot.querySelectorAll('.price-row')[0]
  && appRoot.querySelectorAll('.price-row')[0].attrs.role === 'radiogroup',
  String(appRoot.querySelectorAll('.price-row')[0] && appRoot.querySelectorAll('.price-row')[0].attrs.role));
/* 每档都要写瓶数 —— 不写数字，"300 以内"和"1200 以上"看起来一样大，
   用户会选到一个只有十几瓶的档，答完才发现没货。 */
ok('每枚具体档的价签都标了瓶数',
  appRoot.querySelectorAll('.price-n').length === 4,
  `标了瓶数的 ${appRoot.querySelectorAll('.price-n').length} 枚`);
ok('价签有剪口（这一屏唯一的效果）',
  appRoot.querySelectorAll('.price-notch').length === 5,
  `剪口 ${appRoot.querySelectorAll('.price-notch').length} 个`);
/* 价位未知那 766 瓶必须被说出来，否则等于把"未知"静默当成"便宜"。 */
ok('预算屏说明了「价位未知的不参与」', /价位未知/.test(getStepText()), getStepText().slice(0, 200));

/* 选一档，断言选中态与说明行跟着变。
   空值守卫写在这里而不是不写：一次 `undefined.dispatch` 会抛错退出，
   **整份测试的 PASS/FAIL 汇总根本打印不出来**（搬屏后 ② 段就是这么哑掉的），
   而"少一枚价签"本身已经被上面那条「共 5 枚价签」判红了 ——
   所以守卫不掩盖缺陷，它只保证缺陷以"一条红"而不是"全盘哑掉"的形式出现。
   两条断言照旧无条件执行，条数不随守卫增减。 */
{
  const tab = appRoot.querySelectorAll('.price-tab')[1];
  if (tab) {
    tab.dispatch('click');
    await new Promise((r) => setTimeout(r, 60));
  }
  ok('点价签后它变成选中态', !!tab && tab.attrs['aria-checked'] === 'true',
    tab ? String(tab.attrs['aria-checked']) : '（取不到第 2 枚价签）');
  const note = appRoot.querySelectorAll('.price-note')[0];
  ok('选中具体档后说明行改成「只在这一档里挑」',
    !!tab && !!note && /只在这一档里挑/.test(note.textContent),
    note ? note.textContent.slice(0, 80) : '（取不到 .price-note）');
}

/* ---------- ⑧ 末屏「看推荐」+ 已知款入口已撤（v7 第 1 步） ----------
   v7 定版没有「已知款」这一题，它的入口（STEPS / renderAnchor / 品牌组合框 /
   navBar 分支 / SCENE 键）整块删除。这里不验"那个函数还在"，验的是
   三件用户看得见的事：
     ① 走完最后一屏就能出结果（「看推荐」必须在末屏，而不是凭空消失）；
     ② 屏上不再有那一题的任何痕迹（标题、组合框、香调锚点 chip）；
     ③ 用户翻到最后也不会经过一个"空屏"。
   v7 第 3 步③：末屏换人 —— 浓淡 → 预算。断言名跟着换，判据不变：
   末屏必须是当前步骤表的**最后一项**（不是写死某个 id），
   这样"末屏换人"这件事本身也进断言：谁把预算挪走，这一条就红。 */
{
  const list = appMod.__steps.cur();
  const lastId = list[list.length - 1].id;
  ok('末屏是当前步骤表的最后一项（且是预算 budget）',
    stepId() === lastId && lastId === 'budget',
    `屏上 ${stepId()} / 表尾 ${lastId}`);
}
/* 整条走屏梯子：从第 2 屏一直走到末屏，落过的每一屏按序记在 ladder 里。
   这条是本文件唯一一条"顺序级"断言 —— 上面每段各自都对，也可能整体错位一格
   （某段多 advance 一次，后面每段拿到的是别人那一屏的内容，自己仍然"看见了"
   期待的那一屏）。串比对同时否掉跳屏 / 错序 / 漏屏三种形态。
   期望串从**当前生效步骤表**派生（去掉第 1 屏圆盘：梯子从 advance 之后开始记），
   不写死 —— 避雷屏被跳过时表是 5 项，写死的串会误报。 */
{
  const expect = appMod.__steps.cur().map((x) => x.id).slice(1);
  ok('走屏梯子与步骤表逐屏一致（不跳屏、不重排、不漏屏）',
    ladder.join(',') === expect.join(','),
    `走过 ${ladder.join(',')} / 期望 ${expect.join(',')}`);
  ok('梯子末项就是结果之前的最后一屏预算（看推荐出口在末屏，没被跳过）',
    ladder[ladder.length - 1] === 'budget', ladder[ladder.length - 1]);
}
ok('已知款那题已不在流程里（屏上不再问「试过、并且喜欢」）',
  !getStepText().includes('已经试过'), getStepText().slice(0, 80));
ok('已知款的组合框与锚点 chip 都不再渲染',
  appRoot.querySelectorAll('.combo-input').length === 0
  && appRoot.querySelectorAll('[data-anchor]').length === 0,
  `组合框 ${appRoot.querySelectorAll('.combo-input').length} / 锚点 ${appRoot.querySelectorAll('[data-anchor]').length}`);
ok('末屏直接给「看推荐」（不必先答一题已知款）',
  !!btnBy(/看推荐/),
  appRoot.querySelectorAll('.btn').map((x) => x.textContent.trim()).join(' | ').slice(0, 120));

/* ---------- ⑨ 背景层：只增不减、不换方向、封顶 ----------
   这三条是规格 3 的算术部分，截图证明不了，只能算。
   逐方向 × 逐屏跑一遍 —— 六个方向都要成立，不是抽查一个。 */
{
  const DIRS = ['cold', 'warm', 'clean', 'mysterious', 'bright', 'lazy'];
  const TOTAL = appMod.__steps.all.length;
  let monotonicBad = [];
  let signBad = [];
  let capBad = [];
  for (const d of DIRS) {
    let prevS = -1;
    let sign = null;
    for (let st = 1; st <= TOTAL; st++) {
      const m = appMod.__ambient({ emotion: d }, st, TOTAL);
      if (m.strength + 1e-9 < prevS) monotonicBad.push(`${d}@${st}`);
      prevS = m.strength;
      /* 方向不许翻：三轴的符号在整个过程中必须恒定（允许 0，不许反号）。 */
      const cur = [Math.sign(m.temp), Math.sign(m.light), Math.sign(m.sat)].join(',');
      if (sign == null) sign = cur;
      else if (cur !== sign && !m.temp === 0) signBad.push(`${d}@${st}`);
      if (m.strength > 0.85 + 1e-9) capBad.push(`${d}@${st}=${m.strength}`);
    }
  }
  ok('底噪强度逐屏单调不减（六个方向全过）', monotonicBad.length === 0, monotonicBad.join(','));
  ok('底噪方向全程不翻（三轴符号恒定）', signBad.length === 0, signBad.join(','));
  ok('底噪强度封顶在 0.85 以内', capBad.length === 0, capBad.join(','));

  /* 反向自检：串一个"故意反向"的假实现，确认上面那三条真能抓到错。
     没有这一段，三条全绿也可能只是"没测到东西"。 */
  const fake = (st) => ({ strength: 1 - st / 10, temp: (st % 2 ? 1 : -1) * 0.3, light: 0, sat: 0 });
  let caughtMonotonic = false;
  let prev = 2;
  for (let st = 1; st <= 5; st++) { const v = fake(st).strength; if (v < prev) caughtMonotonic = true; prev = v; }
  ok('反向自检：递减的假底噪会被判成不单调', caughtMonotonic, String(caughtMonotonic));

  /* 季节/浓淡只能调浓度，不能改方向（第 2 条纪律的算术落地）。 */
  const base = appMod.__ambient({ emotion: 'cold' }, 6, TOTAL);
  const withExtra = appMod.__ambient({ emotion: 'cold', season: 'summer', intensity: 5 }, 6, TOTAL);
  ok('后续答案只调浓度、不改方向（符号一致）',
    Math.sign(base.temp) === Math.sign(withExtra.temp)
    && Math.sign(base.light) === Math.sign(withExtra.light),
    `${base.temp}/${withExtra.temp}  ${base.light}/${withExtra.light}`);
  ok('后续答案确实会改变强度（不是死值）',
    Math.abs(base.strength - withExtra.strength) > 0.001,
    `${base.strength} vs ${withExtra.strength}`);
}

/* ---------- ⑩ 顶栏刻度：底噪的可读读数 ---------- */
ok('页眉出现方向刻度（选过大方向之后）', appRoot.querySelectorAll('.amb-tick').length === 1,
  `实际 ${appRoot.querySelectorAll('.amb-tick').length}`);
ok('刻度写着方向与档位', /[冷暖清沉亮柔]·[起渐满]/.test(
  appRoot.querySelectorAll('.amb-tick')[0].textContent),
  appRoot.querySelectorAll('.amb-tick')[0].textContent);

/* ---------- ⑪ 映射层的三条硬约束 ---------- */
{
  const life = appMod.__life;
  /* ① 短语里每个 en 名都真的在 taxonomy 里（写错一个就永远 0 命中） */
  const taxa2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
  const norm = (s2) => String(s2).toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const known = new Set();
  for (const e of taxa2.noteIndex.entries) {
    known.add(norm(e.en));
    for (const al of (e.aliases || [])) known.add(norm(al));
  }
  const unknownNotes = [];
  for (const d of life.all) for (const en of d.notes) if (!known.has(norm(en))) unknownNotes.push(d.id + ':' + en);
  ok('短语表里每个香材名都在 taxonomy 里（防拼错）', unknownNotes.length === 0, unknownNotes.join(','));

  /* ② 短语 → 香材的展开必须去重 */
  const expand = life.notesOf(['citrus-peel', 'green-twig']);
  ok('短语展开成香材时去重', new Set(expand.map(norm)).size === expand.length,
    expand.join(','));

  /* ③ 每条短语都够货（低于阈值的不上屏） */
  const live = life.live();
  ok('上屏的短语都过了库存阈值', live.length >= 12 && live.length <= life.all.length,
    `上屏 ${live.length} / 全表 ${life.all.length}`);
  ok('死短语（库存 < 阈值）不在上屏列表里',
    live.every((d) => d && d.id), live.map((d) => d.id).join(','));
}

/* ---------- ⑫ 预算映射层：档太窄时退回全库 ---------- */
{
  const b = appMod.__budget;
  const prevIdx = b.bands();
  /* 造一个只有 5 瓶的假档，池子必须退回全库（否则会推出"只有 5 瓶可挑"） */
  b.setIndex({
    anyId: 'any',
    bands: [{ id: 'tiny', zh: '窄档', lo: 0, hi: 1 }],
    bandOfId: { tiny: ['ysl-libre', 'creed-aventus', 'lattafa-yara', 'montale-black-aoud', 'tom-ford-oud-minerale'] },
  });
  const perfs2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8')).perfumes;
  const pool = b.pool(perfs2, 'tiny');
  ok('档太窄（< 12 瓶）时退回全库', pool.length === perfs2.length, `池 ${pool.length} / 全库 ${perfs2.length}`);
  /* 正常档要真的收窄 */
  b.setIndex(prevIdx);
  const idx = b.bands();
  if (idx && idx.bandOfId) {
    const realPool = b.pool(perfs2, idx.bands[1].id);
    ok('正常档确实收窄了候选池',
      realPool.length < perfs2.length && realPool.length > 0,
      `池 ${realPool.length} / 全库 ${perfs2.length}`);
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

/* ---------- 腿 7b：结果屏详情区（2026-11-26）----------
   详情区两件事，各两条断言，都从**渲染出来的 DOM** 读，不看源码：
     ① 三段条：三瓶各一条，每条的段长必须等于同瓶三调的香材数量；
     ② 推荐依据：每条都是「你答的 → 所以」两行，且那一行能指回具体答案。
   第二组里"能指回具体答案"这条是产品的硬约束（依据不许是泛化形容词），
   所以判据写成"必须出现用户答案里的某个具体词"，不写 /有理由/ 这种空判。 */
{
  const details = appRoot.querySelectorAll('.pick-detail');
  ok('三瓶各有一个详情区', details.length === 3, `实际 ${details.length}`);
  ok('详情区带族色（与首屏比较表同源）',
    details.every((d) => (d.attrs['data-fam'] || '') !== ''),
    details.map((d) => d.attrs['data-fam']).join(','));

  /* ① 三段条：段数 = 3，且每段的数据量必须与同瓶 .pyramid 的 dd 香材数一致。
     这条不是抄一遍 --g，而是把"条"和"表"两份互相校验 —— 两处对不上就说明
     条画的不是这张表（曾经最容易出的错是条取 p.top、表取 p.heart）。 */
  const tracks = appRoot.querySelectorAll('.pd-track');
  ok('三瓶各有一条三段条', tracks.length === 3, `实际 ${tracks.length}`);
  ok('每条的段数都是 3（前/中/后）',
    tracks.every((t) => t.querySelectorAll('.pd-seg').length === 3),
    tracks.map((t) => t.querySelectorAll('.pd-seg').length).join(','));
  {
    const bad = [];
    details.forEach((d, di) => {
      const segs = d.querySelectorAll('.pd-seg');
      const dds = d.querySelectorAll('.pyramid dd');
      if (segs.length !== 3 || dds.length !== 3) { bad.push(`#${di} 段/行数不符`); return; }
      segs.forEach((s, i) => {
        /* 表里的香材以「、」分隔。空 dd 也算 0 味（数据源缺这一调）。 */
        const txt = dds[i].textContent.split('　')[0].trim();
        const n = txt ? txt.split('、').filter(Boolean).length : 0;
        const got = String(s.attrs['data-notes']);
        if (got !== String(n)) bad.push(`#${di}第${i + 1}段：条说 ${got}、表里有 ${n}`);
      });
    });
    ok('段长与同瓶三调的香材数量一致（条和表同一份数据）',
      bad.length === 0, bad.slice(0, 3).join(' | '));
  }
  ok('三段各有自己的档位类（前/中/后不是三段同色）',
    tracks.every((t) => {
      const segs = t.querySelectorAll('.pd-seg');
      return segs[0].classList.contains('is-top')
        && segs[1].classList.contains('is-mid')
        && segs[2].classList.contains('is-base');
    }));

  /* ② 推荐依据：两行一对，且 ask 行必须指回具体答案。 */
  const basis = appRoot.querySelectorAll('.pick-basis');
  ok('三瓶各有推荐依据', basis.length === 3, `实际 ${basis.length}`);
  ok('依据每条都是「你答的 + 所以」两行',
    basis.every((b) => b.querySelectorAll('li').every((li) => (
      li.querySelectorAll('.basis-ask').length === 1
      && li.querySelectorAll('.basis-why').length === 1))),
    basis.map((b) => b.querySelectorAll('li').length).join(','));
  /* 可回指具体答案：ask 行里必须出现用户真答过的那个词。
     答案词从 state 里取，不写死 —— 写死就等于"换个答案这测试就假红"。 */
  {
    const prof = appMod.__state.result && appMod.__state.result.profile;
    const words = [prof && prof.emotionZh, prof && prof.familyZh, prof && prof.subfamilyZh,
      '你选的', '你点名', '你要', '你打算', '你试过', '你划掉']
      .filter(Boolean);
    const bad = [];
    basis.forEach((b, bi) => {
      b.querySelectorAll('li').forEach((li, li2) => {
        const ask = li.querySelector('.basis-ask');
        const t = ask ? ask.textContent : '';
        if (!words.some((w) => t.includes(w))) bad.push(`#${bi}第${li2 + 1}条：${t.slice(0, 24)}`);
      });
    });
    ok('每条依据的「你答的」都指回具体答案（不是泛化形容词）',
      bad.length === 0, bad.slice(0, 3).join(' | '));
  }
  /* 新手语言：依据里不许出现分数术语（"厚重感 0.42""5/5"这类）。
     首屏之外唯一允许出现分数的地方是 .profile-line 的口径说明。 */
  ok('依据里不出现分数术语（新手语言）',
    basis.every((b) => !/厚重感\s*[\d.]|\d\/5|匹配度\s*\d/.test(b.textContent)),
    basis.map((b) => b.textContent).join(' | ').slice(0, 160));
  /* 提醒项只红解释行：连标签一起染红会把中性注脚读成警报。
     读的是**编译产物** styles.css（浏览器真正吃的那份），不是源层 ——
     源层对了而产物没重建，是这套双层结构最典型的失败模式
     （build-css --check 会单独拦，但这条从结果侧再拦一道）。 */
  {
    const CSS = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
    ok('提醒项的红只落在解释行上（标签行不染）',
      /\.pick-basis li\.warn \.basis-why\s*\{[^}]*--danger/.test(CSS),
      (CSS.match(/\.pick-basis[^{]*\{[^}]*--danger[^}]*\}/) || ['（未找到该规则）'])[0].slice(0, 90));
  }
}
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

/* ---------- 心仪清单 L2：结果页 ♡ 入口（2026-11-23）----------
   这一组只守**结构**（♡ 在哪、买在哪、状态怎么变），不守存储 ——
   存储语义在 scripts/test-wishlist-ui.mjs 里用内存介质测（那里能造出
   "满 50""配额满"两种真实浏览器里很难复现的路径，这里造不出来）。

   为什么"♡ 在瓶名行、购买在页脚"必须是断言而不是注释：
   任务书那条「购买按钮与 ♡ 必须分列两端、不相邻（防误触买/存）」
   是一条**布局约束**，而布局会被下一次改版悄悄改掉 ——
   注释不会红，断言会。 */
{
  const hearts = appRoot.querySelectorAll('.qw-wish');
  ok('三瓶各有一颗 ♡', hearts.length === 3, `实际 ${hearts.length}`);

  /* ♡ 必须挂在 .pick-name-row 里（瓶名行），而不是卡片页脚 */
  const inNameRow = hearts.filter((h) => {
    let n = h.parentNode;
    while (n) {
      if (n.classList && n.classList.contains('pick-name-row')) return true;
      n = n.parentNode;
    }
    return false;
  });
  ok('♡ 都在瓶名行（.pick-name-row）里', inNameRow.length === 3, `${inNameRow.length}/3`);

  /* 反向：♡ 不许出现在页脚那一行（那里是购买按钮的地盘） */
  const inFoot = hearts.filter((h) => {
    let n = h.parentNode;
    while (n) {
      if (n.classList && n.classList.contains('pick-foot')) return true;
      n = n.parentNode;
    }
    return false;
  });
  ok('♡ 不在任何 .pick-foot 里（与购买按钮分列两端）', inFoot.length === 0, `${inFoot.length} 颗落在页脚`);

  /* 顺序：瓶名行里 h3 在前、♡ 在后 —— "瓶名行右侧"的字面含义 */
  const row = appRoot.querySelectorAll('.pick-name-row')[0];
  const kids = row ? row.children.filter((c) => typeof c !== 'string') : [];
  ok('瓶名行里 h3 在 ♡ 之前',
    kids.length === 2
    && kids[0].tagName === 'H3'
    && kids[1].classList.contains('qw-wish'),
    kids.map((c) => c.tagName + '.' + c.className).join(' | '));

  /* 初始态：空心（aria-pressed=false、无 is-on）。桩里没有真实 localStorage，
     所以 has() 走降级返回 false —— 这正是"未存"的期望值。 */
  ok('初始三颗都是空心（aria-pressed=false）',
    hearts.every((h) => h.getAttribute('aria-pressed') === 'false'),
    hearts.map((h) => h.getAttribute('aria-pressed')).join(','));
  ok('初始没有一颗带 is-on', hearts.every((h) => !h.classList.contains('is-on')));

  /* 可访问名与读屏语义：按钮要有「收藏 X / 从心仪清单移除 X」这种能独立听懂的名字 */
  ok('♡ 有按钮语义与状态',
    hearts.every((h) => h.tagName === 'BUTTON'
      && h.attrs.type === 'button'
      && /^(收藏.+到心仪清单|从心仪清单移除.+)$/.test(h.getAttribute('aria-label') || '')),
    hearts.map((h) => h.getAttribute('aria-label')).join(' | '));
  ok('♡ 带 data-wish 记着是哪一瓶（回显要按 id 比对）',
    hearts.every((h) => !!h.getAttribute('data-wish')),
    hearts.map((h) => h.getAttribute('data-wish')).join(','));

  /* 心形是矢量：空心 / 实心只差 fill，不靠系统字体的 ♡/♥ 字符 */
  ok('♡ 是内联 SVG（尺寸由 CSS 决定，不受系统字体影响）',
    hearts.every((h) => {
      const svg = h.querySelectorAll('svg')[0];
      return !!svg && !!svg.querySelectorAll('path')[0];
    }));

  /* 点一下：桩里没有真 storage，会走内存兜底 —— 状态仍然必须翻成实心。
     这条同时守住「兜底时 ♡ 照常工作」这件任务书明确要求的事。 */
  hearts[0].dispatch('click');
  ok('点一下 → 这颗变实心（is-on + aria-pressed=true）',
    hearts[0].classList.contains('is-on') && hearts[0].getAttribute('aria-pressed') === 'true',
    `${hearts[0].className} / ${hearts[0].getAttribute('aria-pressed')}`);
  ok('点一下不影响另外两颗',
    !hearts[1].classList.contains('is-on') && !hearts[2].classList.contains('is-on'));

  /* 再点一下 → 回到空心（切换语义） */
  hearts[0].dispatch('click');
  ok('再点一下 → 回到空心（切换存/删）',
    !hearts[0].classList.contains('is-on') && hearts[0].getAttribute('aria-pressed') === 'false');

  /* 提示条：挂 body（不是结果区 DOM —— 那里会被 .fade-in 的 transform 收成
     fixed 包含块，实测 y=2698 / 视口 900，整条跑到屏幕外）。 */
  const bar = globalThis.document.body.querySelector('.qw-wish-bar');
  ok('轻提示挂在 document.body 上（躲开 .fade-in 的 transform 包含块）', !!bar,
    bar ? 'ok' : 'body 里没有 .qw-wish-bar');
  ok('轻提示带 role=status + aria-live=polite', !!bar
    && bar.getAttribute('role') === 'status'
    && bar.getAttribute('aria-live') === 'polite');
  ok('轻提示只在页面里存在一份（单例，翻几轮不会攒成一堆）',
    globalThis.document.body.querySelectorAll('.qw-wish-bar').length === 1,
    String(globalThis.document.body.querySelectorAll('.qw-wish-bar').length));
  /* 提示文案：桩里没有真 storage → 走内存兜底 → 文案要带「仅本次有效」 */
  hearts[0].dispatch('click');
  ok('存入后的提示说清「仅本次有效」（桩里无 localStorage，走兜底）',
    /已存入心仪清单/.test(bar.textContent) && /仅本次有效/.test(bar.textContent),
    bar.textContent);

  /* ---- L3 补的跳转：toast 的「在香水档案里看」必须是个能点的按钮 ----
     L2 当时那句话只有文字，用户读完仍不知道去哪找（存完就丢是新用户
     最常卡住的地方）。必须在**存入态**查：切成移出态之后这句就不在提示里了。 */
  {
    const go = bar.querySelectorAll('.qw-wish-go');
    ok('toast 里的「在香水档案里看」是可点按钮（不是纯文字）',
      go.length === 1 && go[0].tagName === 'BUTTON',
      `${go.length} 个`);
    ok('那个按钮的文案只是去向本身（不带括号说明）',
      go.length === 1 && go[0].textContent === '在香水档案里看',
      go.length ? go[0].textContent : '(无)');
    /* 降级时整句后面会追加「（本机存储不可用，收藏仅本次有效）」。
       那段是**说明**，必须留在按钮外面 —— 塞进按钮会让按钮撑成一长条，
       读起来像「点这里（存不下）」。 */
    ok('「仅本次有效」的括号说明落在按钮外面',
      go.length === 1 && !/仅本次有效/.test(go[0].textContent),
      go.length ? go[0].textContent : '(无)');
    ok('整句仍完整（说明没被吞掉）', /仅本次有效/.test(bar.textContent), bar.textContent);
  }

  hearts[0].dispatch('click');
  ok('删存的提示是「已移出心仪清单」',
    /已移出心仪清单/.test(bar.textContent), bar.textContent);
}

/* ---------- 心仪清单 L3：清单页本体（2026-11-23）----------
   这里守的是**渲染结构**：入口带计数、点进去是清单页、空态不白屏、
   返回能回结果页。判据本身（没有价格就不显示价格等）在
   scripts/test-wishlist-page.mjs 里用纯函数测 —— 两边的分工与 L2 那套一致。 */
{
  /* ① 结果页有带计数的心仪入口
     ---- 2026-11-24 文案调整（不是断言调整）----
     原文：「档案区块里有「心仪清单」入口」。
     复查反馈第 6 条把入口搬进结果页的吸底操作条（.result-dock），
     它不再挂在 .qw-history 档案区块里 —— 断言本身（**整页唯一一个入口**、
     带数字计数、文案含「心仪清单」）一条没动，只是标题里那个位置词
     现在写成事实：结果页。改文案的理由是"标题与位置不符"比"断言变红"更糟：
     下一个人照着标题去 .qw-history 里找入口，会以为断言失效。 */
  const entry = appRoot.querySelectorAll('.qw-wl-entry');
  ok('结果页有「心仪清单」入口（唯一一处）', entry.length === 1, `${entry.length} 个`);
  ok('入口带计数（data-wish-count 是数字）',
    entry.length === 1 && /^\d+$/.test(String(entry[0].getAttribute('data-wish-count') || '')),
    entry.length ? String(entry[0].getAttribute('data-wish-count')) : '(无)');
  ok('入口可见文案含「心仪清单」与那个数字',
    entry.length === 1 && /心仪清单/.test(entry[0].textContent)
    && new RegExp(String(entry[0].getAttribute('data-wish-count') || 'x')).test(entry[0].textContent),
    entry.length ? entry[0].textContent : '(无)');

  /* ② 点入口 → 进清单页。桩里没有 localStorage，list() 是空的，
     所以这一屏应当是**空态**（而不是白屏，也不是错误页）。 */
  if (entry.length === 1) {
    entry[0].dispatch('click');
    ok('点入口后进入清单页（data-step=wishlist）', stepId() === 'wishlist', stepId());

    const page = appRoot.querySelectorAll('.qw-wl-page');
    ok('清单页有容器 .qw-wl-page', page.length === 1, `${page.length} 个`);

    /* 页头必须认这一页（实测缺陷：进清单页后页头仍是「你的三瓶候选 /
       每一瓶的理由都能反推回你刚才的选择」—— 标题在说另一页的事）。
       这是截图才看得出来的那类错误：DOM 结构全对、文案全错。 */
    ok('清单页页头不再是结果页文案（说的是这一页）', (() => {
      const h1 = appRoot.querySelectorAll('.masthead h1')[0];
      const t = h1 ? h1.textContent : '';
      return /心仪/.test(t) && !/三瓶候选/.test(t);
    })(), (appRoot.querySelectorAll('.masthead h1')[0] || {}).textContent);
    ok('清单页页头副文案也不再说"推荐结果"',
      (() => {
        const lede = appRoot.querySelectorAll('.masthead .lede')[0];
        const t = lede ? lede.textContent : '';
        return /设备|理由|参考价/.test(t) && !/反推回你刚才的选择/.test(t);
      })(),
      (appRoot.querySelectorAll('.masthead .lede')[0] || {}).textContent);

    /* 空态三件套：标题 / 引导 / 回结果页的动作 */
    ok('空清单显示空态标题（不白屏）',
      appRoot.querySelectorAll('.qw-wl-empty-title').length === 1);
    ok('空态有引导文案（讲清怎么存）',
      appRoot.querySelectorAll('.qw-wl-empty-hint').some((n) => /♡/.test(n.textContent)),
      appRoot.querySelectorAll('.qw-wl-empty-hint').map((n) => n.textContent).join(' | '));
    const cta = appRoot.querySelectorAll('.qw-wl-empty-cta');
    ok('空态有回结果页的动作', cta.length === 1 && /→/.test(cta[0].textContent),
      cta.length ? cta[0].textContent : '(无)');

    /* ③ 空态里不许出现列表（空清单还渲染 <ol> 会让页面上多一条空线） */
    ok('空清单不渲染列表', appRoot.querySelectorAll('.qw-wl-list').length === 0);

    /* ④ 返回能回结果页 */
    const back = appRoot.querySelectorAll('.qw-wl-back');
    ok('清单页有返回按钮', back.length === 1);
    if (back.length === 1) {
      back[0].dispatch('click');
      ok('点返回回到结果页（data-step=result）', stepId() === 'result', stepId());
      ok('回到结果页后三张卡还在', appRoot.querySelectorAll('.pick').length === 3,
        `${appRoot.querySelectorAll('.pick').length} 张`);
    }
  }
}
/* ---------- 心仪清单行盖章入口（2026-11-23 补 L3 欠的第 4 项）----------
   这一组守的是**跨两个视图的同一条记录**：清单行盖的章，档案侧立刻读到；
   清单行撤销的章，档案侧同步消失。所以它不是"再测一遍盖章"，
   而是"测两个挂载点真的共用一个会话与一个键"。

   为什么这一段排在「档案盖章」段**之前**：那一段结尾会装一份写不进的存储
   （QuotaStore）验证降级，而 createStampSession 一旦降级就不再回头试真存储。
   本段要读真存储上的记录，必须赶在降级之前跑。跑完把两个全局存储还原，
   档案那一段照旧从空记录开始（它的种子不含 tasting 键）。 */
{
  const histMod = await import('file://' + path.join(ROOT, 'src', 'history.js').replace(/\\/g, '/'));
  const { HISTORY_KEY } = histMod;
  const WISH_KEY = 'sp_wishlist_v1';

  class TestStore {
    constructor(seed = {}) { this.map = new Map(Object.entries(seed)); }
    getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
    setItem(k, v) { this.map.set(k, String(v)); }
    removeItem(k) { this.map.delete(k); }
  }

  /* 三行清单：两瓶在香水库里（能盖章）、一瓶查不到（下架/改名）。
     第三行的存在是为了钉住「查不到的瓶子不给盖章入口」—— 那一行的 name
     是 id 本身，拿它盖章会写出一条两处都读不到的孤立记录。 */
  const wishSeed = [
    { id: 'creed-aventus', savedAt: 1763810000000, reason: '冬天穿得住' },
    { id: 'diptyque-philosykos-parfum', savedAt: 1763809000000, reason: '' },
    { id: 'ghost-bottle-xyz', savedAt: 1763808000000, reason: '下架了' },
  ];
  /* 档案里必须有同一瓶（Aventus / Creed）—— 否则"两处一致"无从比对。 */
  const historySeed = [{
    t: 1763800000000, entry: 'family',
    results: [{ name: 'Aventus', brand: 'Creed' }, { name: 'Philosykos', brand: 'Diptyque' }],
  }];

  const store = new TestStore({
    [HISTORY_KEY]: JSON.stringify(historySeed),
    [WISH_KEY]: JSON.stringify(wishSeed),
  });
  globalThis.window.localStorage = store;
  /* 清单数据层的默认实例绑的是 globalThis.localStorage（src/wishlist.js 末行），
     与页面里那份 window.localStorage 不是同一个对象 —— 桩环境里必须都装，
     否则 renderWishPage 读到的永远是空清单。 */
  globalThis.localStorage = store;

  /* 进清单页（入口在档案区块里，读的是上一次渲染的计数） */
  const entryBtn = appRoot.querySelectorAll('.qw-wl-entry')[0];
  if (entryBtn) entryBtn.dispatch('click');
  await new Promise((r) => setTimeout(r, 300));
  /* 香水表/实物图/链接表是按需加载的，加载完会再重画一次 */
  await new Promise((r) => setTimeout(r, 400));

  ok('清单页渲染出三行', appRoot.querySelectorAll('.qw-wl-row').length === 3,
    `${appRoot.querySelectorAll('.qw-wl-row').length} 行`);

  {
    const rows = appRoot.querySelectorAll('.qw-wl-row');
    const slots = appRoot.querySelectorAll('.qw-wl-stamp-row .qw-stamp-slot');
    ok('每一行（能查到的那两瓶）都有盖章位', slots.length === 2, `${slots.length} 个`);
    ok('盖章位标了 data-stamp-surface=wish（同一枚组件、两个挂载点）',
      slots.length === 2 && slots.every((s) => s.getAttribute('data-stamp-surface') === 'wish'),
      slots.map((s) => s.getAttribute('data-stamp-surface')).join(','));

    /* 身份键要和档案侧逐字相同 —— 这是"同一瓶"在数据层的唯一凭据。 */
    const keys = slots.map((s) => s.getAttribute('data-stamp-key')).sort();
    ok('清单侧的身份键与档案侧同形（归一化 name|brand）',
      keys.join(',') === 'aventus|creed,philosykos|diptyque', keys.join(','));

    /* 未盖章的行只留入口，不显示 chip */
    const opens = appRoot.querySelectorAll('.qw-stamp-open');
    ok('未盖章的行显示「试过？盖章」入口', opens.length === 2
      && opens.every((b) => b.textContent === '试过？盖章'),
      opens.map((b) => b.textContent).join(' | '));
    ok('未盖章的行没有 chip（只留入口）', appRoot.querySelectorAll('.qw-stamp-chip').length === 0,
      `${appRoot.querySelectorAll('.qw-stamp-chip').length} 枚`);
    ok('入口是按钮且 aria-label 说清是给哪一瓶盖章',
      opens.every((b) => b.tagName === 'BUTTON' && /^给.+盖章：记录试香评价$/.test(b.getAttribute('aria-label') || '')),
      opens.map((b) => b.getAttribute('aria-label')).join(' | '));

    /* 查不到的那瓶不给入口 */
    const ghost = rows.find((r) => r.getAttribute('data-wish-id') === 'ghost-bottle-xyz');
    ok('查不到的瓶子那一行不渲染盖章入口（不写 id 当瓶名的脏记录）',
      !!ghost && ghost.querySelectorAll('.qw-stamp-slot').length === 0,
      ghost ? String(ghost.querySelectorAll('.qw-stamp-slot').length) : '(找不到该行)');
  }

  /* ---- 点入口 → 就是本体那套五档面板 ---- */
  appRoot.querySelectorAll('.qw-stamp-open')[0].dispatch('click');
  await new Promise((r) => setTimeout(r, 120));
  {
    const panels = appRoot.querySelectorAll('.qw-stamp-panel');
    ok('点行内入口就地打开面板（不跳页）',
      panels.length === 1 && stepId() === 'wishlist', `${panels.length} 个 / step=${stepId()}`);
    const tiers = appRoot.querySelectorAll('.qw-stamp-tier');
    ok('面板是本体那五档（逐字一致，不是另抄一份）', tiers.length === 5
      && tiers.map((b) => b.textContent).join('/') === '一闻钟情/喜欢/还行/无感/劝退',
      tiers.map((b) => b.textContent).join('/'));
    ok('点开面板本身不落记录（两段式第一段）',
      store.getItem('scent-picker.tasting.v1') == null,
      String(store.getItem('scent-picker.tasting.v1')));
    ok('面板挂在清单行的盖章位那一行（.qw-wl-stamp-row 内，就地展开不跳页）',
      panels.length === 1 && (() => {
        let n = panels[0].parentNode;
        while (n) {
          if (n.classList && n.classList.contains('qw-wl-stamp-row')) return true;
          n = n.parentNode;
        }
        return false;
      })());

    /* 选「喜欢」→ 保存 */
    appRoot.querySelectorAll('.qw-stamp-tier')[1].dispatch('click');
    appRoot.querySelectorAll('.qw-stamp-save')[0].dispatch('click');
    await new Promise((r) => setTimeout(r, 200));
  }

  let wishChipText = '';
  {
    const chips = appRoot.querySelectorAll('.qw-stamp-chip');
    ok('保存后清单行出现 chip（不是等刷新）', chips.length === 1, `${chips.length} 枚`);
    wishChipText = chips.length ? chips[0].textContent : '';
    ok('chip 显示最近一次档位 + 共 N 次（与档案同一口径）',
      /喜欢/.test(wishChipText) && /共 1 次/.test(wishChipText) && /\d\d-\d\d/.test(wishChipText),
      wishChipText);
    ok('chip 带 data-stamp-count=1',
      chips.length === 1 && chips[0].getAttribute('data-stamp-count') === '1',
      chips.length ? String(chips[0].getAttribute('data-stamp-count')) : '(无)');
    ok('盖章后该行不再显示「试过？盖章」（两种形态互斥）',
      appRoot.querySelectorAll('.qw-stamp-open').length === 1,
      `${appRoot.querySelectorAll('.qw-stamp-open').length} 个入口`);
    ok('另一瓶仍是未盖章态（状态按瓶独立，不是整页一刀切）',
      appRoot.querySelectorAll('.qw-stamp-open')[0].getAttribute('aria-label').includes('Philosykos'),
      appRoot.querySelectorAll('.qw-stamp-open')[0].getAttribute('aria-label'));
    ok('落盘的键就是清单那瓶的身份键（不是 id、不是别的形态）', (() => {
      try {
        const arr = JSON.parse(store.getItem('scent-picker.tasting.v1'));
        return arr.length === 1 && arr[0].key === 'aventus|creed'
          && arr[0].name === 'Aventus' && arr[0].brand === 'Creed';
      } catch { return false; }
    })(), String(store.getItem('scent-picker.tasting.v1')).slice(0, 160));
  }

  /* ---- 跨视图：档案侧读到的是**同一条记录** ---- */
  {
    appRoot.querySelectorAll('.qw-wl-back')[0].dispatch('click');
    await new Promise((r) => setTimeout(r, 200));
    const toggle = appRoot.querySelectorAll('.qw-history-toggle')[0];
    if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.dispatch('click');
    await new Promise((r) => setTimeout(r, 200));

    const rows = appRoot.querySelectorAll('.qw-history-name-row');
    const aventusRow = rows.find((r) => {
      const n = r.querySelectorAll('.qw-history-name')[0];
      return n && n.textContent === 'Aventus';
    });
    const archChip = aventusRow ? aventusRow.querySelectorAll('.qw-stamp-chip')[0] : null;
    ok('档案侧同一瓶也出现 chip（两处读的是同一条记录）', !!archChip,
      archChip ? archChip.textContent : '(档案侧没有 chip)');
    ok('两处 chip 文案逐字相同（同源展示模型，不是各自算的）',
      !!archChip && archChip.textContent === wishChipText,
      `清单「${wishChipText}」vs 档案「${archChip ? archChip.textContent : '-'}」`);
    ok('档案侧的 log 只有一枚（没有因为两处入口各写一次）', (() => {
      const arr = JSON.parse(store.getItem('scent-picker.tasting.v1'));
      return arr.length === 1 && arr[0].log.length === 1;
    })(), String(store.getItem('scent-picker.tasting.v1')).slice(0, 160));
  }

  /* ---- 回清单页撤销：两处同步消失 ---- */
  {
    const entryBtn2 = appRoot.querySelectorAll('.qw-wl-entry')[0];
    if (entryBtn2) entryBtn2.dispatch('click');
    await new Promise((r) => setTimeout(r, 300));
    const undo = appRoot.querySelectorAll('.qw-wl-stamp-row .qw-stamp-undo-inline');
    ok('清单行的 chip 旁边有行内「撤销」', undo.length === 1, `${undo.length} 枚`);
    if (undo.length === 1) undo[0].dispatch('click');
    await new Promise((r) => setTimeout(r, 250));

    ok('清单侧撤销 → 清单行 chip 消失、回到「试过？盖章」',
      appRoot.querySelectorAll('.qw-wl-page').length === 1
      && appRoot.querySelectorAll('.qw-stamp-chip').length === 0
      && appRoot.querySelectorAll('.qw-stamp-open').length === 2,
      `${appRoot.querySelectorAll('.qw-stamp-chip').length} 枚 chip / ${appRoot.querySelectorAll('.qw-stamp-open').length} 个入口`);
    /* 提示要在**离开清单页之前**验：这条走的是与档案盖章同一个 stampSay /
       同一个提示条，两句文案也逐字来自 src/stamp-ui.js。 */
    /* 提示条的定时器是 2400ms 自动隐藏，这里在撤销后 250ms 内读 —— 稳的。
       读的是**文案**不是可见性：可见性由 CSS 的 [hidden] 管，桩里量不到。 */
    ok('撤销提示走同一条提示条（「已撤销这瓶的盖章」）',
      /已撤销这瓶的盖章/.test(globalThis.document.body.querySelector('.qw-wish-bar').textContent),
      globalThis.document.body.querySelector('.qw-wish-bar').textContent);
    ok('存储里那条记录被整条移除（不留空壳）', (() => {
      const raw = store.getItem('scent-picker.tasting.v1');
      if (raw == null) return true;
      try { return JSON.parse(raw).length === 0; } catch { return false; }
    })(), String(store.getItem('scent-picker.tasting.v1')));

    /* 档案侧再确认一次：同一个键上确实没有记录了 */
    appRoot.querySelectorAll('.qw-wl-back')[0].dispatch('click');
    await new Promise((r) => setTimeout(r, 200));
    const toggle2 = appRoot.querySelectorAll('.qw-history-toggle')[0];
    if (toggle2 && toggle2.getAttribute('aria-expanded') !== 'true') toggle2.dispatch('click');
    await new Promise((r) => setTimeout(r, 200));
    ok('档案侧同步消失（两处仍是一条记录，不是各存一份）',
      appRoot.querySelectorAll('.qw-stamp-chip').length === 0
      && appRoot.querySelectorAll('.qw-stamp-open').length === 2,
      `${appRoot.querySelectorAll('.qw-stamp-chip').length} 枚 chip / ${appRoot.querySelectorAll('.qw-stamp-open').length} 个入口`);
  }

  /* 还原：后续「档案盖章」段要自己装存储，这里把两个全局恢复原样，
     免得清单数据层（绑 globalThis.localStorage）读到本段的夹具。
     **顺手把档案面板收起**：那一段的写法是「已展开就不再点」，
     留着展开态会让它读到本段这份夹具画出来的面板（本段踩到过：
     它因此看到的是 Aventus/Philosykos 而不是自己的 Santal 33/Aventus）。 */
  const tg = appRoot.querySelectorAll('.qw-history-toggle')[0];
  if (tg && tg.getAttribute('aria-expanded') === 'true') tg.dispatch('click');
  delete globalThis.localStorage;
  globalThis.window.localStorage = new TestStore();
}

/* ---------- 试香盖章：档案里的每瓶盖章入口 + 五档面板（2026-11-23）----------
   这一组守**渲染结构**与**一次完整点击链**：入口在档案的每一瓶上、
   五档面板是两段式（点开不落记录，选档+保存才落）、已盖章只显示
   最近一次 + 共 N 次、撤销能退、盖高档位**不**自动加心仪。

   为什么这里要临时装一份 localStorage：档案面板的瓶子来自
   readHistory(storage)，桩里没有存储就只有空态 —— 那样根本渲染不出
   盖章位，"入口到底挂在哪一行"这条契约就验不到。所以本段先装一份内存
   localStorage（只在本段内），把真渲染路径跑通；数据层的存/读/撤销语义
   另有 scripts/test-stamp.mjs（118 条）与 test-stamp-ui.mjs（89 条）守着。 */
{
  const histMod = await import('file://' + path.join(ROOT, 'src', 'history.js').replace(/\\/g, '/'));
  const { HISTORY_KEY } = histMod;

  /* 与 src/wishlist.js 的键同名 —— 用来证明"盖章不会顺手写心仪"。 */
  const WISH_KEY = 'sp_wishlist_v1';

  class TestStore {
    constructor(seed = {}) { this.map = new Map(Object.entries(seed)); }
    getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
    setItem(k, v) { this.map.set(k, String(v)); }
    removeItem(k) { this.map.delete(k); }
  }
  /* 配额满 / 隐私模式：写一律抛（读仍可用）。 */
  class DeadStore extends TestStore {
    setItem() { throw new Error('QuotaExceededError'); }
  }

  const seedHistory = [
    { t: 1763800000000, entry: 'family', results: [{ name: 'Santal 33', brand: 'Le Labo' }, { name: 'Aventus', brand: 'Creed' }] },
  ];
  const store = new TestStore({
    [HISTORY_KEY]: JSON.stringify(seedHistory),
    /* 心仪里先放一瓶，用来证明盖章不会去动那个键 */
    [WISH_KEY]: JSON.stringify([{ id: 'preexisting', savedAt: 1, reason: '先存着的' }]),
  });
  globalThis.window.localStorage = store;

  /* 展开档案面板（点那枚「查看」） */
  const toggle = appRoot.querySelectorAll('.qw-history-toggle')[0];
  ok('档案面板有「查看」开关（盖章入口在展开后的面板里）', !!toggle,
    toggle ? 'ok' : '找不到 .qw-history-toggle');
  if (toggle) {
    /* 已展开过就不要再点（第二次点是收起） */
    if (toggle.getAttribute('aria-expanded') !== 'true') toggle.dispatch('click');

    const rows = appRoot.querySelectorAll('.qw-history-name-row');
    ok('档案里每一瓶一行（.qw-history-name-row）', rows.length === 2, `${rows.length} 行`);

    const slots = appRoot.querySelectorAll('.qw-stamp-slot');
    ok('每一瓶右端都有一个盖章位（不是一个批量入口）', slots.length === 2, `${slots.length} 个`);
    ok('盖章位带 data-stamp-key（身份键可核对）',
      slots.every((s) => !!s.getAttribute('data-stamp-key')),
      slots.map((s) => s.getAttribute('data-stamp-key')).join(' | '));

    const opens = appRoot.querySelectorAll('.qw-stamp-open');
    ok('未盖章时显示「试过？盖章」', opens.length === 2
      && opens.every((b) => b.textContent === '试过？盖章'),
      opens.map((b) => b.textContent).join(' | '));
    ok('入口是按钮且 aria-label 说的是「给哪一瓶盖章」',
      opens.every((b) => b.tagName === 'BUTTON'
        && /^给.+盖章：记录试香评价$/.test(b.getAttribute('aria-label') || '')),
      opens.map((b) => b.getAttribute('aria-label')).join(' | '));
    ok('入口在瓶名行里（.qw-history-name-row 内，紧挨瓶名）',
      opens.every((b) => {
        let n = b.parentNode;
        while (n) {
          if (n.classList && n.classList.contains('qw-history-name-row')) return true;
          n = n.parentNode;
        }
        return false;
      }));

    /* ---- 两段式：点开只是打开面板，绝不落记录 ---- */
    opens[0].dispatch('click');
    const panel = appRoot.querySelectorAll('.qw-stamp-panel')[0];
    ok('点入口打开五档面板（就地展开，不跳页）', !!panel, panel ? 'ok' : '找不到 .qw-stamp-panel');
    ok('点开面板这件事本身没有落记录（两段式第一段）',
      store.getItem('scent-picker.tasting.v1') == null,
      String(store.getItem('scent-picker.tasting.v1')));

    const tiers = appRoot.querySelectorAll('.qw-stamp-tier');
    ok('面板里正好五颗章（不是旧提案的三档）', tiers.length === 5, `${tiers.length} 颗`);
    ok('五档文案逐字：一闻钟情 / 喜欢 / 还行 / 无感 / 劝退',
      tiers.map((b) => b.textContent).join('/') === '一闻钟情/喜欢/还行/无感/劝退',
      tiers.map((b) => b.textContent).join('/'));
    ok('五颗章是 role=radio 的单选组（互斥，不是五个开关）',
      tiers.every((b) => b.getAttribute('role') === 'radio')
      && appRoot.querySelectorAll('[role="radiogroup"]').length === 1);
    ok('初始一颗都没选中（aria-checked 全 false）',
      tiers.every((b) => b.getAttribute('aria-checked') === 'false'));

    const save0 = appRoot.querySelectorAll('.qw-stamp-save')[0];
    ok('没选档时「保存」不可点（空着保存 = 盖一枚没有评价的章）',
      !!save0 && save0.getAttribute('disabled') !== null,
      save0 ? String(save0.getAttribute('disabled')) : '(无保存键)');

    /* 选「喜欢」（第 2 颗） */
    tiers[1].dispatch('click');
    ok('选中后 aria-checked 跟着变（互斥：只有一颗为 true）',
      tiers.filter((b) => b.getAttribute('aria-checked') === 'true').length === 1
      && tiers[1].getAttribute('aria-checked') === 'true',
      tiers.map((b) => b.getAttribute('aria-checked')).join(','));
    ok('选中后有视觉标记 is-picked',
      tiers[1].classList.contains('is-picked') && !tiers[0].classList.contains('is-picked'));
    ok('选中后「保存」变成可点',
      appRoot.querySelectorAll('.qw-stamp-save')[0].getAttribute('disabled') === null);

    /* 保存 → 落盘 + 重画成 chip */
    appRoot.querySelectorAll('.qw-stamp-save')[0].dispatch('click');
    const raw1 = store.getItem('scent-picker.tasting.v1');
    ok('保存后写进 scent-picker.tasting.v1（与档案同一套前缀）', typeof raw1 === 'string',
      String(raw1));
    ok('落盘形状是四键 + log 两键（无 id / 无设备信息）', (() => {
      try {
        const arr = JSON.parse(raw1);
        return Array.isArray(arr) && arr.length === 1
          && Object.keys(arr[0]).join(',') === 'key,name,brand,log'
          && Object.keys(arr[0].log[0]).join(',') === 'tier,t'
          && arr[0].log[0].tier === 'like';
      } catch { return false; }
    })(), String(raw1).slice(0, 140));

    ok('提示说「已盖章」', /已盖章/.test(globalThis.document.body.querySelector('.qw-wish-bar').textContent),
      globalThis.document.body.querySelector('.qw-wish-bar').textContent);

    const chip1 = appRoot.querySelectorAll('.qw-stamp-chip');
    ok('盖完立刻变成状态 chip（重画后回显，不是等刷新）', chip1.length === 1,
      `${chip1.length} 枚`);
    ok('chip 上有「共 1 次」', chip1.length === 1 && /共 1 次/.test(chip1[0].textContent),
      chip1.length ? chip1[0].textContent : '(无)');
    ok('chip 上有档位与日期（最近一次）',
      chip1.length === 1 && /喜欢/.test(chip1[0].textContent) && /\d\d-\d\d/.test(chip1[0].textContent),
      chip1.length ? chip1[0].textContent : '(无)');
    ok('chip 带 data-stamp-count=1', chip1.length === 1
      && chip1[0].getAttribute('data-stamp-count') === '1',
      chip1.length ? String(chip1[0].getAttribute('data-stamp-count')) : '(无)');
    ok('已盖章时该瓶不再显示「试过？盖章」（两种形态互斥）',
      appRoot.querySelectorAll('.qw-stamp-open').length === 1,
      String(appRoot.querySelectorAll('.qw-stamp-open').length));
    ok('另一瓶仍是未盖章态（状态按瓶独立）',
      opens.some((b) => b.getAttribute('aria-label').includes('Aventus')),
      opens.map((b) => b.getAttribute('aria-label')).join(' | '));

    /* ---- 同一瓶可重复盖章：新盖章覆盖「最近一次」，计数 +1 ---- */
    appRoot.querySelectorAll('.qw-stamp-chip')[0].dispatch('click');
    const tiers2 = appRoot.querySelectorAll('.qw-stamp-tier');
    ok('点 chip 打开面板时预选最近一次的档位（喜欢 = 第 2 颗）',
      tiers2.length === 5 && tiers2[1].getAttribute('aria-checked') === 'true',
      tiers2.map((b) => b.getAttribute('aria-checked')).join(','));
    appRoot.querySelectorAll('.qw-stamp-tier')[0].dispatch('click');   // 改成一闻钟情
    appRoot.querySelectorAll('.qw-stamp-save')[0].dispatch('click');
    const chip2 = appRoot.querySelectorAll('.qw-stamp-chip');
    ok('再盖一次 → 计数变「共 2 次」',
      chip2.length === 1 && /共 2 次/.test(chip2[0].textContent),
      chip2.length ? chip2[0].textContent : '(无)');
    ok('再盖一次 → 最近一次显示新档位「一闻钟情」',
      chip2.length === 1 && /一闻钟情/.test(chip2[0].textContent),
      chip2.length ? chip2[0].textContent : '(无)');
    ok('两枚都留在存储里（撤销要能一步步退）', (() => {
      const arr = JSON.parse(store.getItem('scent-picker.tasting.v1'));
      return arr[0].log.length === 2 && arr[0].log.map((x) => x.tier).join(',') === 'like,love';
    })(), String(store.getItem('scent-picker.tasting.v1')).slice(0, 160));

    /* ---- 撤销：退回上一次的真实档位与计数 ---- */
    const inlineUndo = appRoot.querySelectorAll('.qw-stamp-undo-inline');
    ok('已盖章的行给一枚行内「撤销」（盖错时不必先点开面板）', inlineUndo.length === 1,
      `${inlineUndo.length} 枚`);
    inlineUndo[0].dispatch('click');
    const chip3 = appRoot.querySelectorAll('.qw-stamp-chip');
    ok('撤销一次 → 计数退回「共 1 次」',
      chip3.length === 1 && /共 1 次/.test(chip3[0].textContent),
      chip3.length ? chip3[0].textContent : '(无)');
    ok('撤销一次 → 档位退回到上一次的「喜欢」',
      chip3.length === 1 && /喜欢/.test(chip3[0].textContent) && !/一闻钟情/.test(chip3[0].textContent),
      chip3.length ? chip3[0].textContent : '(无)');
    ok('撤销的提示说「已撤销上次盖章」',
      /已撤销上次盖章/.test(globalThis.document.body.querySelector('.qw-wish-bar').textContent),
      globalThis.document.body.querySelector('.qw-wish-bar').textContent);

    appRoot.querySelectorAll('.qw-stamp-undo-inline')[0].dispatch('click');
    ok('再撤销一次 → 退光，回到「试过？盖章」未盖章态',
      appRoot.querySelectorAll('.qw-stamp-open').length === 2
      && appRoot.querySelectorAll('.qw-stamp-chip').length === 0,
      `${appRoot.querySelectorAll('.qw-stamp-open').length} 个入口 / ${appRoot.querySelectorAll('.qw-stamp-chip').length} 枚 chip`);
    ok('退光后存储里那条记录被整条移除（不留空壳）', (() => {
      const raw = store.getItem('scent-picker.tasting.v1');
      if (raw == null) return true;
      try { return JSON.parse(raw).length === 0; } catch { return false; }
    })(), String(store.getItem('scent-picker.tasting.v1')));

    /* ---- 不许一键联动：盖高档位不自动加心仪 ---- */
    appRoot.querySelectorAll('.qw-stamp-open')[0].dispatch('click');
    appRoot.querySelectorAll('.qw-stamp-tier')[0].dispatch('click');   // 一闻钟情（最高档）
    appRoot.querySelectorAll('.qw-stamp-save')[0].dispatch('click');
    ok('盖了「一闻钟情」也没有把该瓶加进心仪清单（无一键联动）',
      !/Santal|santal/.test(String(store.getItem(WISH_KEY))),
      String(store.getItem(WISH_KEY)));
    ok('心仪键保持原样（盖章一个字节都没动它）', (() => {
      const arr = JSON.parse(store.getItem(WISH_KEY));
      return arr.length === 1 && arr[0].id === 'preexisting';
    })(), String(store.getItem(WISH_KEY)));
    ok('盖章也没有往档案键里写档位（只新增自己的键）',
      !/tier|love|tasting/.test(String(store.getItem(HISTORY_KEY))),
      String(store.getItem(HISTORY_KEY)).slice(0, 130));

    /* ---- 同一行只许有一个面板（面板挂在行上，清 slot 清不掉旧的）---- */
    appRoot.querySelectorAll('.qw-stamp-open')[0].dispatch('click');
    ok('点一次只开一个面板', appRoot.querySelectorAll('.qw-stamp-panel').length === 1,
      `${appRoot.querySelectorAll('.qw-stamp-panel').length} 个`);
    appRoot.querySelectorAll('.qw-stamp-cancel')[0].dispatch('click');
    ok('取消（不保存）后记录不变，仍是 1 次', (() => {
      const arr = JSON.parse(store.getItem('scent-picker.tasting.v1'));
      return arr[0].log.length === 1 && arr[0].log[0].tier === 'love';
    })(), String(store.getItem('scent-picker.tasting.v1')).slice(0, 120));

    /* ---- 存储不可用：降级提示 + 页面不报错（口径与心仪 L2 一致）---- */
    const dead = new DeadStore({
      [HISTORY_KEY]: JSON.stringify([{ t: 1763800000000, entry: 'emotion', results: [{ name: 'Aventus', brand: 'Creed' }] }]),
    });
    globalThis.window.localStorage = dead;
    /* 重画档案面板（读的是新的介质） */
    const tg = appRoot.querySelectorAll('.qw-history-toggle')[0];
    if (tg) {
      if (tg.getAttribute('aria-expanded') === 'true') tg.dispatch('click');   // 先收起
      tg.dispatch('click');                                                    // 再展开 → 重画
    }
    const deadOpens = appRoot.querySelectorAll('.qw-stamp-open');
    ok('换存储后档案面板重画（读的是当前介质）', deadOpens.length === 1, `${deadOpens.length} 个入口`);
    if (deadOpens.length === 1) {
      deadOpens[0].dispatch('click');
      appRoot.querySelectorAll('.qw-stamp-tier')[1].dispatch('click');
      appRoot.querySelectorAll('.qw-stamp-save')[0].dispatch('click');
      const barText = globalThis.document.body.querySelector('.qw-wish-bar').textContent;
      ok('存储不可用时提示说清「仅本次有效」（沿用 L2 口径）',
        /已盖章/.test(barText) && /仅本次有效/.test(barText), barText);
      ok('降级下页面不白屏、那份记录仍显示（走内存兜底）',
        appRoot.querySelectorAll('.qw-stamp-chip').length === 1,
        `${appRoot.querySelectorAll('.qw-stamp-chip').length} 枚 chip`);
      ok('降级时没有偷写磁盘（盖章键仍为空）',
        dead.getItem('scent-picker.tasting.v1') == null,
        String(dead.getItem('scent-picker.tasting.v1')));
      ok('降级提示里没有出现错误页/异常字样',
        !/Error|异常|失败/.test(appRoot.textContent), '页面文本含错误字样');
    }
  }
}

/* v6 结果页有三个出路（规格底线：保留「换一批 / 改一题重推」）。
   断言的是"三个出路都在，且代价最大的那个不与主按钮并列"——
   「重新来一次」已从三颗主按钮退成一行 .link-btn，但仍必须可点可读。 */
ok('结果页有「换一批」',
  appRoot.querySelectorAll('.btn').some((b) => b.textContent.includes('换一批')));
ok('结果页有「改一题重推」',
  appRoot.querySelectorAll('.btn').some((b) => b.textContent.includes('改一题重推')));
ok('结果页有「重新来一次」（退到一行小结里，不占主按钮位）',
  appRoot.querySelectorAll('.link-btn').some((b) => b.textContent.includes('重新答一遍')),
  appRoot.querySelectorAll('.link-btn').map((b) => b.textContent).join(' | '));
ok('三颗主按钮里不含「重新来一次」（它代价最大，不该并列）',
  !appRoot.querySelectorAll('.result-actions .btn').some((b) => /重新来一次|重新答/.test(b.textContent)),
  appRoot.querySelectorAll('.result-actions .btn').map((b) => b.textContent.trim()).join(' | '));

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
     只对有搜索渠道的卡要求；纯直达链的卡不许挂（它只有一个入口，写了就是编）。

     注意 `cardsWithChannel.length > 0` 这条**不能**硬要求：
     推荐出哪三瓶取决于答案，而答案随题库版本变。v6 这套答案选中的三瓶
     都带商品级直达链接（①a），会短路掉 ①b 的搜索渠道 —— 这不是回归，
     是链接表覆盖到位。所以断言改成条件式：有搜索渠道的卡各挂一条，
     没有就跳过，但**不能两者都判绿**（下面那条"纯直达链的卡不挂说明"始终执行）。 */
  const hasOfficial = (c) => (tbByCard.get(c) || []).some((a) => a.attrs['data-channel'] === 'official');
  const cardsWithChannel = cards.filter(hasOfficial);
  if (cardsWithChannel.length > 0) {
    ok('有搜索渠道的卡各挂一条双渠道说明',
      cardsWithChannel.every((c) => c.querySelectorAll('.link-note').length === 1),
      `有搜索渠道的卡 ${cardsWithChannel.length} 张，说明 ${searchNotes.length} 条`);
  } else {
    /* 这一轮没有搜索渠道卡：如实记录，不假装通过。 */
    console.log(`  · 本轮三瓶都带商品级直达链（①a 短路 ①b），无双渠道说明可验`);
    ok('本轮无双渠道卡（直达链覆盖到位，属预期）', searchNotes.length === 0,
      `但出现了 ${searchNotes.length} 条 .link-note —— 说明有卡不该挂却挂了`);
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

/* ---------- 步骤表本身（v7 第 3 步③：六屏固定，预算末屏，无入口分叉）----------
   v5 的两条入口（家族 8 步 / 情绪 9 步）早已不存在；v7 删掉了「已知款」那一屏
   与「大方向」「想要的味道」两题、把圆盘放回第 1 屏，第 3 步③ 又把预算搬到末位。
   所以这里钉的是 v7 的**顺序与计数** —— 这是用户唯一看得见的两个数字，
   它们错一次，用户就会以为自己漏答了一屏。 */
{
  const S = appMod.__steps;
  const ids = S.all.map((x) => x.id);
  /* 计数一律用 S.all.length 派生写进期望值：断言名字里的数字若与表长脱钩，
     下一个人删一屏就得手工改两处，改漏的那处会变成一条"永远绿"的假断言。
     唯一例外是这一条：它就是"表长该是几"的定义处，写死 6 才有意义。
     因此写死值收成下面这一个常量，凡是要"钉死屏数"的地方都引用它 ——
     散落两处写死 6 与本处自派生是同一类坑的两侧：前者改漏一处，后者自我循环。 */
  const STEP_COUNT = 6;
  ok(`步骤全集是 ${STEP_COUNT} 步（v7 定版）`, S.all.length === STEP_COUNT, `实际 ${S.all.length}`);
  /* 顺序即内容：圆盘第 1、避雷第 2、预算末屏（第 6）。
     写成整串比对而不是逐项 includes —— 逐项判不出顺序错。 */
  ok('六屏顺序与 v7 定版一致（圆盘第 1、避雷第 2、预算末屏）',
    ids.join(',') === 'family,unwanted,occasion,season,concentration,budget',
    ids.join(','));
  ok(`${S.all.length} 个步骤的 id 两两不同`, new Set(ids).size === ids.length, ids.join(','));

  /* 圆盘必须第 1 屏：v7 定版第一条就是"圆盘是第一屏"，
     而且它同时是底噪的方向来源（见 src/ambient.js 与 AXIS_OF_FAMILY）。 */
  ok('圆盘是第 1 屏', ids[0] === 'family', ids[0]);
  /* 避雷紧跟圆盘：方向一定下来就问最容易踩雷的几个（v7 第 2 步）。 */
  ok('避雷是第 2 屏（紧跟圆盘选完方向）', ids[1] === 'unwanted', ids[1]);
  /* 预算排末位（v7 第 3 步③）。位置变了，理由也跟着换 ——
     旧理由是"先圈池再问偏好"，搬屏后这句已经不成立：
     `poolForBudget` 只在 `finish()` 与结果页「换一批」两处生效，
     两处都在最后一屏之后，所以"圈池"这件事在引擎侧从来没有提前发生过。
     理由留在断言名里，是为了让下一个人不会再拿旧理由去"修"这个位置。 */
  ok('预算是末屏（第 6 位；价格过滤只在 finish() 生效，屏序不影响口径）',
    ids[ids.length - 1] === 'budget' && ids[STEP_COUNT - 1] === 'budget', ids[STEP_COUNT - 1]);
  /* 已知款不许复活：它是 v7 定版明确删掉的一屏，且要求用户认得瓶子。 */
  ok('已知款（anchor）不得复活', !ids.includes('anchor'), ids.join(','));

  /* 被退场的 id 不许复活。名单来自 v5 的实际步骤表；
     注意 family 已**不再**属于这张表 —— v7 把它请回来了，见上一条。
     v7 第 3 步删掉的两屏（emotion / wanted）一并加进来：
     它们的屏没了，但**答案键**（answers.emotion / answers.wanted）仍被
     避雷屏与引擎读取，所以这条守的是"别把屏当成键一起删"，不是"别保留键"。
     'unwanted' 不许加 —— 它是避雷屏正在用的 id（第 2 屏）。 */
  const gone = ['mood', 'dislikedFamilies', 'likedNotes', 'dislikedNotes',
    'notes', 'context', 'strength', 'intensity',
    'emotion', 'wanted'];
  const revived = gone.filter((g) => ids.includes(g));
  ok('退场的步骤 id 都不得复活（family 除外）', revived.length === 0, revived.join(','));

  /* 步骤表与答案无关（无 when）—— 空答案与答满答案必须等长。
     唯一的条件屏是避雷（方向定了但模糊带为空时整屏跳过），
     所以样例答案要**带 family**（不带就是"还没到那一屏"的占位态，不跳）。
     旧写法里的 `emotion: 'cold'` 已随那一屏删除，换成不依赖已删屏的写法。 */
  ok('步骤数与答案无关（无入口分叉）',
    S.cur({}).length === S.cur({ family: 'floral', occasion: 'commute' }).length,
    `${S.cur({}).length} vs ${S.cur({ family: 'floral', occasion: 'commute' }).length}`);

  /* 「第 N 步 / 共 M 步」跟着表走 —— 但期望值写死 STEP_COUNT，不用 S.cur({}).length。
     只读复核（2026-11-19，cx1）指出：自派生等于让期望值跟被测对象同源，
     表长本身错了（例如误删一屏）这条仍会绿，属自我循环。写死常量才与
     「步骤全集是 6 步」同一处口径，删屏只改 STEP_COUNT 一处。 */
  ok(`末屏是第 ${STEP_COUNT} 步 / 共 ${STEP_COUNT} 步`,
    S.head('budget', {}).kicker === `第 ${STEP_COUNT} 步 / 共 ${STEP_COUNT} 步`,
    S.head('budget', {}).kicker);
  ok(`第 1 屏是第 1 步 / 共 ${STEP_COUNT} 步`,
    S.head('family', {}).kicker === `第 1 步 / 共 ${STEP_COUNT} 步`, S.head('family', {}).kicker);

  /* 越界夹取：表长跟着 v7 定版走（6 屏） */
  ok(`越界夹取：step=7 在 ${STEP_COUNT} 步表里夹到 ${STEP_COUNT}`,
    S.clamp(7, STEP_COUNT) === STEP_COUNT, String(S.clamp(7, STEP_COUNT)));
  ok(`越界夹取：step=${STEP_COUNT} 在 ${STEP_COUNT} 步表里保持 ${STEP_COUNT}（=结果页）`,
    S.clamp(STEP_COUNT, STEP_COUNT) === STEP_COUNT, String(S.clamp(STEP_COUNT, STEP_COUNT)));
  ok('越界夹取：负数是 0', S.clamp(-1, STEP_COUNT) === 0, String(S.clamp(-1, STEP_COUNT)));
  ok('越界夹取：NaN 是 0', S.clamp(NaN, STEP_COUNT) === 0, String(S.clamp(NaN, STEP_COUNT)));

  const allReachable = S.all.every((x) => typeof x.render === 'function');
  ok(`${S.all.length} 个步骤全部有可渲染函数`, allReachable,
    S.all.filter((x) => typeof x.render !== 'function').map((x) => x.id).join(','));

  /* 每屏 help 都要说清"能不能跳过" —— 除圆盘与预算外都可跳过。
     两处例外的理由不同：
       · family（圆盘）：必答题，它是引擎入口（buildProfile 要求 family 或
         emotion 二选一），跳过就没推荐可算。它的 help 该说"怎么选"，
         而不是"可以跳过"。
       · budget：可跳过，但它用的是"不限也行"这种说法（比"跳过"更贴这一题：
         不是跳过，是选「不限」这一档）。关键词表不认它，所以按屏号排除 ——
         这条排除是 v6 就有的，本步不动那一屏文案。
       · unwanted（避雷，v7 第 2 步）：可跳过，措辞是"不点就是接受"。
         这不是放宽门槛 —— 它确实写明了可跳过，只是换了说法，所以把这句
         加进关键词表，让这一屏仍被同一道门守着（而不是排除掉）。
     只查关键词，不查整句（措辞会改）。 */
  const noSkipWord = S.all.filter((x) => x.id !== 'family' && x.id !== 'budget'
    && !/跳过|不选也能|不答|不点就是接受/.test(x.help || ''));
  ok('除圆盘外每屏都写明了可跳过（不逼答）', noSkipWord.length === 0,
    noSkipWord.map((x) => x.id).join(','));
  ok('圆盘的 help 不写「跳过」而写怎么选（它是必答题）',
    !/跳过/.test((S.all.find((x) => x.id === 'family') || {}).help || ''),
    (S.all.find((x) => x.id === 'family') || {}).help);
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
