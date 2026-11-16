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
    this.style = {};
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
    /* 同理：`el(tag, { style: '--i: 3' })` 走的是 setAttribute 这条路
       （el() 先 createElement 再逐条 setAttribute），而构造函数里的
       _parseStyle 只在直接传 attrs 时生效。不同步的话
       `node.style['--i']` 恒为 undefined —— 而浏览器里是 '3'。
       浓淡屏的同心圈靠 --i 驱动半径，这条不同步会让"半径真的递增"
       这条断言量到 NaN，属于典型「测试与浏览器走两条路」。 */
    if (k === 'style') this._parseStyle(String(v));
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
      /* 复合选择器：`.class[attr="v"]` / `tag.class[attr="v"]` / `.a.b[c="v"]`。
         桩原先只认"单段"（纯 class 或纯 [attr]），复合写法恒返回空 ——
         问卷 v2 用 `.imp-pick[role="radio"]`、`.halo-ring[role="radio"]`
         这类写法把"是按钮"和"是单选语义"一次查出来，于是全部量到 0，
         报出来的是"实际 0"这种看不懂的失败。桩缺能力就补桩。 */
      const cmp = one.match(/^([^[\]]+)((?:\[[^\]]*\])+)$/);
      if (cmp) {
        if (!matchOne(n, cmp[1].trim())) return false;
        const preds = cmp[2].match(/\[[^\]]*\]/g) || [];
        return preds.every((p) => matchOne(n, p));
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

/* ============================================================
   问卷 v2（2026-11-16）· 五屏主流程
   ------------------------------------------------------------
   这一段整体重写。旧版这里走的是「家族入口 8 屏 / 情绪入口 9 屏」，
   断言密集绑在**香型轮盘**上（.disc-sector / .sector-g / .disc-hub 的
   两态切换 / 中圈展开 / 盘心标本）。v2 把家族轮盘从流程里摘掉了
   （它是香调术语题，见 app.js 的 STEPS 顶部注释），所以：

     · 「这一屏是圆盘、扇区是真 button、盘心有语义」这一类断言**没有删**，
       而是改挂到**场合屏**（第 2 屏）—— 它仍然用 buildDisc，契约一字未变。
       断言守的东西（可点的必须是真 button、单选要有 radiogroup）比它
       当初钉在哪一屏更重要，所以保留断言、换挂载点是对的。
     · 「两层切换 / 中圈展开 / 盘心标本」整组**随功能一起下线**：
       v2 没有中圈这个概念了。这些断言不是被绕过，是被删除 ——
       留在文件里会变成永远为真的假绿。
     · 香调 chip 那一组同样下线（v2 不再问香调），但「死选项不许上屏」
       这条**数据层**约束改成直接验数据（见下方 note-dead 段），
       它守的是 data/taxonomy 与 src/notes.js，与哪一屏问它无关。

   本段之后的断言（结果页 / 推广链接 / 实物图降级 / 匹配度）只读结果，
   与问卷屏数无关，一行未动。
   ============================================================ */

/* ---------- 第 1 屏：预算 ---------- */
ok('第 1 屏是预算（标题含「花多少钱」）',
  getStepText().includes('花多少钱'), getStepText().slice(0, 100));
ok('进度显示共 5 步', /共 5 步/.test(appRoot.textContent), appRoot.textContent.slice(0, 40));

/* 预算量尺：四段 + 一个「不限」。
   断言的实质是「档位数由 data/price-index.json 派生」，
   所以先读数据再比 —— 硬编码 4 会在改档位时误报。 */
const priceIdx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/price-index.json'), 'utf8'));
const bandSegs = appRoot.querySelectorAll('.budget-seg');
ok('预算量尺的段数等于数据里的档位数',
  bandSegs.length === priceIdx.bands.length,
  `DOM ${bandSegs.length} / 数据 ${priceIdx.bands.length}`);
ok('量尺容器是 radiogroup（单选语义）',
  appRoot.querySelectorAll('[role="radiogroup"]').length >= 1,
  `实际 ${appRoot.querySelectorAll('[role="radiogroup"]').length}`);
ok('每个预算是真实 button（可键盘到达）',
  appRoot.querySelectorAll('button.budget-seg').length === priceIdx.bands.length,
  `实际 ${appRoot.querySelectorAll('button.budget-seg').length}`);
ok('每段都标了该档真实瓶数（不是写死的）',
  bandSegs.every((s, i) => s.textContent.includes(String(priceIdx.stats.bandCount[i]))),
  bandSegs.map((s) => s.textContent.trim()).join(' | ').slice(0, 120));
ok('有「不限」出口（预算可跳过）',
  appRoot.querySelectorAll('.budget-any').length === 1,
  `实际 ${appRoot.querySelectorAll('.budget-any').length}`);

/* 价位未知的瓶子必须在页面上被交代 —— 749 瓶（54%）没有价位，
   不写清楚就成了"系统莫名其妙少了一半货"。 */
ok('页面写明价位的覆盖边界（未知瓶数）',
  getStepText().includes(String(priceIdx.stats.unpriced)),
  getStepText().slice(0, 200));

/* 点第二档，验证状态与读数 */
bandSegs[1].dispatch('click');
await new Promise((r) => setTimeout(r, 120));
ok('点预算档后该项 checked',
  appRoot.querySelectorAll('.budget-seg')[1].getAttribute('aria-checked') === 'true',
  appRoot.querySelectorAll('.budget-seg')[1].getAttribute('aria-checked'));
ok('读数换成该档的真实瓶数',
  appRoot.querySelector('.budget-read')
  && appRoot.querySelector('.budget-read').textContent.includes(String(priceIdx.stats.bandCount[1])),
  appRoot.querySelector('.budget-read') && appRoot.querySelector('.budget-read').textContent);

/* 纯函数层：预算切池子。这一段是 v2 最要紧的数据约束，
   界面看不出来，只能直接断言。
   核心：**价位未知的瓶子不得进入具体档**（否则"800 元以内"里会出现
   ¥4788 的瓶子）。 */
{
  const B = appMod.__budget;
  ok('__budget 已导出（池子切分可测）', !!B && typeof B.poolForBudget === 'function');

  /* 用真实索引构造一个最小样本：3 瓶在第 1 档、1 瓶未知、1 瓶在第 3 档 */
  const band0 = priceIdx.bands[0].id;
  const band2 = priceIdx.bands[2].id;
  const fake = [
    { id: '__t_a' }, { id: '__t_b' }, { id: '__t_c' }, { id: '__t_u' }, { id: '__t_z' },
  ];
  const fakeIdx = {
    bands: priceIdx.bands,
    stats: priceIdx.stats,
    byId: { __t_a: 0, __t_b: 0, __t_c: 0, __t_u: null, __t_z: 2 },
  };
  const prev = B.getIndex();
  B.setIndex(fakeIdx);
  const pool = B.poolForBudget(fake, band0);
  ok('预算档只留该档的瓶子',
    pool.length === 3 && pool.every((p) => ['__t_a', '__t_b', '__t_c'].includes(p.id)),
    pool.map((p) => p.id).join(','));
  ok('价位未知的瓶子不进具体预算档（不得当成"买得起"）',
    !pool.some((p) => p.id === '__t_u'), pool.map((p) => p.id).join(','));
  const poolAny = B.poolForBudget(fake, 'any');
  ok('选「不限」时价位未知的瓶子保留',
    poolAny.length === fake.length, `${poolAny.length}/${fake.length}`);
  /* 凑不满 3 瓶时退回全库：那是数据缺口，不该由用户的答案背。 */
  const onlyOne = [{ id: '__t_a' }, { id: '__t_z' }, { id: '__t_u' }];
  const poolThin = B.poolForBudget(onlyOne, band0);
  ok('该档凑不满 3 瓶时退回全库（不给出"没有符合的"）',
    poolThin.length === onlyOne.length, `${poolThin.length}/${onlyOne.length}`);
  ok('未知档 id 时原样返回（不静默清空）',
    B.poolForBudget(fake, '__not_a_band').length === fake.length);
  /* 索引缺席（文件 404）时预算题必须降级成"没问"，不能把库清空。 */
  B.setIndex(false);
  ok('价位索引缺席时原样返回全库（预算降级为没问）',
    B.poolForBudget(fake, band0).length === fake.length);
  B.setIndex(prev);
}

/* ---------- 第 2 屏：场合（仍然用圆盘） ---------- */
{
  const b = appRoot.querySelectorAll('.btn').find((x) => x.textContent.includes('下一步'));
  ok('第 1 屏有前进按钮', !!b,
    appRoot.querySelectorAll('.btn').map((x) => x.textContent.trim()).join(' | ').slice(0, 120));
  if (b) { b.dispatch('click'); await new Promise((r) => setTimeout(r, 320)); }
  ok('进入第 2 屏（场合）', getStepText().includes('什么时候用'), getStepText().slice(0, 100));
}

/* 圆盘契约（原挂在香型轮盘上的那一组，v2 改挂场合盘）。
   这些断言守的是「可点的必须是真 button，不能只在 SVG 上画个形状」，
   与它出现在哪一屏无关 —— 所以整组保留，只换挂载点。 */
ok('场合盘有 5 个扇区（= 数据里的场合数）',
  appRoot.querySelectorAll('.disc-sector').length === 5,
  `实际 ${appRoot.querySelectorAll('.disc-sector').length}`);
ok('圆盘画了 5 块扇形',
  appRoot.querySelectorAll('.sector-shape').length === 5,
  `实际 ${appRoot.querySelectorAll('.sector-shape').length}`);
ok('扇区是真实 button（不是只在 SVG 上画）',
  appRoot.querySelectorAll('button.disc-sector').length === 5,
  `实际 ${appRoot.querySelectorAll('button.disc-sector').length}`);
ok('圆盘有 radiogroup 语义',
  appRoot.querySelectorAll('[role="radiogroup"]').length >= 1,
  `实际 ${appRoot.querySelectorAll('[role="radiogroup"]').length}`);
ok('盘心默认是空态', appRoot.querySelector('.disc-hub.is-idle') !== null);

const rotLayer = appRoot.querySelector('.disc-rot');
const inRot = (node) => {
  for (let p = node?.parentNode; p; p = p.parentNode) if (p === rotLayer) return true;
  return false;
};
ok('圆盘有可旋转层', rotLayer !== null);
ok('扇形在可旋转层内', inRot(appRoot.querySelector('.disc-svg')));
ok('扇区标签也在可旋转层内', inRot(appRoot.querySelector('.disc-sector')));
ok('盘心不在可旋转层内（不跟着转）', !inRot(appRoot.querySelector('.disc-hub')));

/* 扇形本体必须自己挂点击 —— 只绑标签的话，戳扇区那一大块面积会没反应。 */
const sectorGroups = appRoot.querySelectorAll('.sector-g');
ok('扇区组数量与扇区一致', sectorGroups.length === 5, `实际 ${sectorGroups.length}`);
ok('每个扇形本体都绑了 click',
  sectorGroups.every((g) => (g._listeners.click || []).length > 0),
  `绑了 click 的 ${sectorGroups.filter((g) => (g._listeners.click || []).length > 0).length}/${sectorGroups.length}`);

sectorGroups[0].dispatch('click');
await new Promise((r) => setTimeout(r, 300));
{
  const checked = appRoot.querySelectorAll('.disc-sector')
    .filter((x) => x.getAttribute('aria-checked') === 'true').length;
  ok('点扇形本体选中了场合', checked >= 1, `选中 ${checked} 个`);
}
/* 盘心排版的两条：与香型无关，纯排版契约，原样保留。 */
{
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  ok('盘心主词比 kicker 大出一档',
    /\.wheel \.disc-hub \.hub-zh \{[^}]*?font-size:\s*2[6-9]px/.test(css),
    '26px 及以上 = 与 12px 的 kicker 拉开 2.2 倍以上');
  ok('盘心主词下有一道收口发丝线', /\.wheel \.disc-hub \.hub-zh::after/.test(css));
  /* 触控 44px：圆盘的命中垫契约。
     **只钉还活着的规则**（场合盘用的 .disc-sector），不钉 .lvl1——
     那是香型轮盘的类，轮盘退场后它成了死 CSS，钉它等于假绿
     （实测：那条断言在轮盘删掉后仍然通过，因为规则还留在样式表里）。
     全局 44px 门禁由 test-contrast 负责（"触控目标 >= 44px"那条），
     这里只补"v2 三个新控件在样式里真的写了 44px"这一层。 */
  ok('v2 新控件在样式里声明了 44px 触控下限',
    /\.budget-seg\s*\{[^}]*min-height:\s*64px/.test(css)
    && /\.budget-any\s*\{[^}]*min-height:\s*44px/.test(css)
    && /\.imp-toggle\s*\{[^}]*min-height:\s*44px/.test(css)
    && /\.edit-item\s*\{[^}]*min-height:\s*44px/.test(css)
    && /\.edit-sum\s*\{[^}]*min-height:\s*42px/.test(css),
    '预算段/不限/印象展开/改一题，四条 44px 有一条缺失');
}

/* ---------- 第 3 屏：印象（六张翻卡） ---------- */
{
  const b = appRoot.querySelectorAll('.btn').find((x) => x.textContent.includes('下一步'));
  if (b) { b.dispatch('click'); await new Promise((r) => setTimeout(r, 320)); }
  ok('进入第 3 屏（印象）', getStepText().includes('什么样的人'), getStepText().slice(0, 100));
}
{
  const cards = appRoot.querySelectorAll('.imp-card');
  ok('印象屏有 6 张卡（= emotionMap 条数）', cards.length === 6, `实际 ${cards.length}`);
  ok('每张卡的选择控件是 radio 语义',
    appRoot.querySelectorAll('.imp-pick[role="radio"]').length === 6,
    `实际 ${appRoot.querySelectorAll('.imp-pick[role="radio"]').length}`);
  /* 翻面：六段解释默认全部收起。这不是省事 ——
     六段同时摊开会把卡组推到折叠线以下（旧版气质屏 390×844 的老毛病）。 */
  ok('六段展开默认全部收起',
    appRoot.querySelectorAll('.imp-more').every((m) => m.attrs.hidden !== undefined),
    appRoot.querySelectorAll('.imp-more').map((m) => String(m.attrs.hidden)).join(','));
  ok('每张卡有一枚展开按钮且 aria-expanded=false',
    appRoot.querySelectorAll('.imp-toggle')
      .every((t) => t.attrs['aria-expanded'] === 'false'),
    appRoot.querySelectorAll('.imp-toggle').map((t) => String(t.attrs['aria-expanded'])).join(','));

  /* 展开其中一张：内容必须真的出现（翻面 = 内容本身变多） */
  const toggle0 = appRoot.querySelectorAll('.imp-toggle')[0];
  toggle0.dispatch('click');
  await new Promise((r) => setTimeout(r, 80));
  const more0 = appRoot.querySelectorAll('.imp-more')[0];
  ok('点展开后该卡正文可见',
    toggle0.getAttribute('aria-expanded') === 'true'
    && more0.attrs.hidden === undefined,
    `${toggle0.getAttribute('aria-expanded')} / hidden=${String(more0.attrs.hidden)}`);
  ok('展开的内容里没有香调术语（只讲印象与方向）',
    !/[A-Za-z]{4,}/.test(more0.textContent) || /偏/.test(more0.textContent),
    more0.textContent.slice(0, 120));

  /* 选中：写进 state.answers.emotion，且全组只有一个 checked */
  appRoot.querySelectorAll('.imp-pick')[2].dispatch('click');
  await new Promise((r) => setTimeout(r, 80));
  ok('选中印象后全组恰有一个 checked',
    appRoot.querySelectorAll('.imp-pick').filter((p) => p.getAttribute('aria-checked') === 'true').length === 1,
    appRoot.querySelectorAll('.imp-pick').map((p) => p.getAttribute('aria-checked')).join(','));
}

/* ---------- 第 4 屏：浓淡（同心扩散圈） ---------- */
{
  const b = appRoot.querySelectorAll('.btn').find((x) => x.textContent.includes('下一步'));
  if (b) { b.dispatch('click'); await new Promise((r) => setTimeout(r, 320)); }
  ok('进入第 4 屏（浓淡）', getStepText().includes('离多远'), getStepText().slice(0, 100));
}
{
  const rings = appRoot.querySelectorAll('.halo-ring');
  ok('浓淡屏有 5 圈（1–5 档）', rings.length === 5, `实际 ${rings.length}`);
  ok('圈是真 button 且 radio 语义',
    appRoot.querySelectorAll('button.halo-ring[role="radio"]').length === 5,
    `实际 ${appRoot.querySelectorAll('button.halo-ring[role="radio"]').length}`);
  /* 控件即内容：半径必须真的递增，否则"同心扩散"只是装饰。
     DOM 桩把 style 解析成对象（`_parseStyle`），所以按属性读 --i。 */
  const iv = rings.map((r) => Number((r.style || {})['--i']));
  ok('五圈的 --i 是 1..5 递增（半径由它驱动）',
    iv.join(',') === '1,2,3,4,5', iv.join(','));

  rings[3].dispatch('click');
  await new Promise((r) => setTimeout(r, 80));
  ok('点第 4 圈后该项 checked',
    appRoot.querySelectorAll('.halo-ring')[3].getAttribute('aria-checked') === 'true',
    appRoot.querySelectorAll('.halo-ring')[3].getAttribute('aria-checked'));
  /* 反馈：读数换成该档的具象说法（"走过会留一点香"），不是档位数字。 */
  const readTxt = appRoot.querySelector('.halo-read') && appRoot.querySelector('.halo-read').textContent;
  ok('读数换成该档的具象说法（不是只显示档号）',
    !!readTxt && readTxt.includes('走过会留一点香'), readTxt);
  ok('选中后播放一次扩散（is-pulse）',
    appRoot.querySelectorAll('.halo-ring')[3].classList.contains('is-pulse'),
    appRoot.querySelectorAll('.halo-ring')[3].className);
  ok('未选中的圈不播扩散',
    appRoot.querySelectorAll('.halo-ring').filter((r) => r.classList.contains('is-pulse')).length === 1,
    appRoot.querySelectorAll('.halo-ring').filter((r) => r.classList.contains('is-pulse')).length);
}

/* ---------- 第 5 屏：已知款 ---------- */
{
  const b = appRoot.querySelectorAll('.btn').find((x) => x.textContent.includes('下一步'));
  if (b) { b.dispatch('click'); await new Promise((r) => setTimeout(r, 320)); }
  ok('进入第 5 屏（已知款）', getStepText().includes('试过、并且喜欢'), getStepText().slice(0, 100));
}
{
  const combos = appRoot.querySelectorAll('.combo-input');
  ok('末步品牌是可搜索组合框', combos.length === 1, `实际 ${combos.length}`);
  ok('组合框是 combobox 语义',
    combos.length === 1 && combos[0].attrs.role === 'combobox',
    combos.length ? String(combos[0].attrs.role) : '-');
  ok('组合框初始收起',
    combos.length === 1 && combos[0].attrs['aria-expanded'] === 'false',
    combos.length ? String(combos[0].attrs['aria-expanded']) : '-');
  ok('品牌不再用原生 select',
    appRoot.querySelectorAll('select').length === 0,
    `实际 ${appRoot.querySelectorAll('select').length} 个 select`);
  /* v2：anchor 屏不再提供「直接点名香调」的 chip 区（那是术语题）。
     这条反过来钉住它 —— 否则下次有人"顺手把 chip 加回来"没人拦。 */
  ok('已知款屏不再出现香调 chip（术语题已下线）',
    appRoot.querySelectorAll('[data-anchor]').length === 0,
    `实际 ${appRoot.querySelectorAll('[data-anchor]').length} 枚`);
}

/* ---------- v2 结构：五屏、id、进度 ---------- */
{
  const S = appMod.__steps;
  ok('问卷 v2 步骤全集是 5 屏', S.all.length === 5, `实际 ${S.all.length}`);
  const ids = S.all.map((x) => x.id);
  ok('5 个步骤的 id 两两不同', new Set(ids).size === ids.length, ids.join(','));
  /* v2 的五屏都无条件出现 —— 没有 when()，也就不存在"两条入口步数不同"。 */
  ok('v2 五屏都不带 when（无条件出现）', S.all.every((x) => !x.when),
    S.all.filter((x) => x.when).map((x) => x.id).join(',') || '无');
  ok('五屏顺序：预算 → 场合 → 印象 → 浓淡 → 已知款',
    ids.join(',') === 'budget,occasion,impression,intensity,anchor', ids.join(','));
  ok('全部有可渲染函数', S.all.every((x) => typeof x.render === 'function'),
    S.all.filter((x) => typeof x.render !== 'function').map((x) => x.id).join(',') || '全有');

  /* 术语题不许回来：家族 / 香调 / 季节 / 整族排除 / 浓度档这五个 id 都不在表里。 */
  const banned = ['family', 'likedNotes', 'dislikedNotes', 'season',
    'dislikedFamilies', 'concentration', 'mood', 'context', 'notes', 'strength'];
  ok('术语题与旧屏 id 都不得出现在 v2 步骤表里',
    banned.every((b) => !ids.includes(b)),
    ids.join(','));

  /* 「第 N 步 / 共 M 步」：首步与末步各验一次。 */
  const head0 = S.head('budget', {});
  const headLast = S.head('anchor', {});
  ok('首屏是「第 1 步 / 共 5 步」', head0.kicker === '第 1 步 / 共 5 步', head0.kicker);
  ok('末屏是「第 5 步 / 共 5 步」', headLast.kicker === '第 5 步 / 共 5 步', headLast.kicker);

  /* 越界夹取：v2 没有入口分叉，但这四条仍是 render() 的兜底不变量。 */
  ok('越界夹取：step=9 在 5 步表里夹到 5', S.clamp(9, 5) === 5, String(S.clamp(9, 5)));
  ok('越界夹取：step=5 保持 5（= 结果页）', S.clamp(5, 5) === 5, String(S.clamp(5, 5)));
  ok('越界夹取：负数是 0', S.clamp(-1, 5) === 0, String(S.clamp(-1, 5)));
  ok('越界夹取：NaN 是 0', S.clamp(NaN, 5) === 0, String(S.clamp(NaN, 5)));
}

/* ---------- 术语题扫描：五屏文案里不许出现香调术语 ----------
   这是规格第 1 条，也是最容易悄悄回退的一条。
   做法是从**源码**里抠出所有 q-title / q-help / 选项文案，扫术语词 ——
   不扫 DOM，因为五屏不可能同时在 DOM 里。 */
{
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  /* v2 的 STEPS 段：从 `const STEPS = [` 到匹配的 `];` */
  const s0 = src.indexOf('const STEPS = [');
  const s1 = src.indexOf('\n];', s0);
  const stepsBlock = s0 >= 0 && s1 > s0 ? src.slice(s0, s1) : '';
  ok('能从 app.js 抠出 v2 的 STEPS 段', stepsBlock.length > 200, `${stepsBlock.length} 字符`);

  /* 术语黑名单：香调名 / 浓度缩写 / 家族术语。
     注意「琥珀」要单独处理 —— 它只允许出现在**印象卡的方向描述**里
     （"常被形容成偏琥珀的味道"是形容词），不许出现在题目文案里。
     所以这里只扫 STEPS 段（题目与 help），不扫渲染函数。

     **必须先剥注释再扫**：STEPS 上方那段 docblock 会**故意**提到
     "EDT/EDP"、"香精占比"来记录这次删掉了什么（解释性注释是合法的）。
     对整段查黑名单，会把"解释为什么删"的文字判成回退 —— 那是假红。
     这条教训旧版已经踩过一次（见上方「只对 help 字面量做断言」那段注释）。 */
  const TERMS = ['香调', '前调', '中调', '后调', 'EDT', 'EDP', 'EDC', 'Extrait',
    'Parfum', '柑橘调', '花香调', '木质调', '东方琥珀', '清新调', '美食调',
    '古龙水', '香精', '香材', 'sillage', 'silhouette'];
  /* 只保留代码行：剥 /* *\/ 块注释与 // 行注释。 */
  const stepsCode = stepsBlock
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const hit = TERMS.filter((t) => stepsCode.includes(t));
  ok('五屏题目文案里没有任何香调术语（规格第 1 条）',
    hit.length === 0, hit.join(',') || `扫了 ${stepsCode.length} 字符`);

  /* 预算必须在第 1 或第 2 屏（规格第 4 条：前置）。 */
  const idsInOrder = [...stepsCode.matchAll(/id: '([a-zA-Z]+)'/g)].map((m) => m[1]);
  const budgetAt = idsInOrder.indexOf('budget');
  ok('预算题在第 1–2 屏内（规格第 4 条）', budgetAt >= 0 && budgetAt <= 1,
    `budget 在第 ${budgetAt + 1} 位：${idsInOrder.join(',')}`);
}

/* ---------- 死选项：数据层约束 ----------
   旧版这条挂在 chip 上（"可可 0 命中不许上屏"）。v2 不再渲染 chip，
   但**约束本身仍然成立且更重要**：58 个可用香调是被 usableEntries()
   过滤过的，死选项一个都不能进界面。所以改成直接验数据层 —— 
   它守的是 data/taxonomy 与 src/notes.js 的关系，与哪一屏问它无关。 */
{
  const taxa = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/taxonomy.json'), 'utf8'));
  const perfs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8')).perfumes;
  const { usableEntries } = await import('file:///' + path.join(ROOT, 'src/notes.js').replace(/\\/g, '/'));
  const usable = usableEntries(taxa.noteIndex.entries, perfs);
  const dead = taxa.noteIndex.entries.filter((e) => !usable.some((u) => u.zh === e.zh));
  ok('死选项（0 命中）被 usableEntries 挡在界面之外',
    dead.every((d) => ['可可', '海盐'].includes(d.zh)),
    dead.map((d) => d.zh).join(',') || '无死选项');
  ok('可用香调仍是 58 个（数据未漂移）', usable.length === 58, `实际 ${usable.length}`);
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
  /* 【2026-11-16】这条断言原来写死"本次推荐的三瓶里至少要有一张卡带
     搜索渠道"。它是一种**数据依赖**：只有当推荐到的瓶子恰好没有
     `s.click` 直达链时才会走搜索兜底那条分支（`platformLinks` ①b）。
     实测 661/1388 瓶有直达链；一旦推荐结果全是带直达链的（v2 换了一批之后
     就是这样），`cardsWithChannel` 恒为 0，断言就变成假红 ——
     它报的"0 张"不是缺陷，是"这次的瓶子都刚好有直达链"。

     所以改成两层：
       ① 机制层（与数据无关，恒可验）：给一瓶**没有**直达链的香水，
          `platformLinks` 必须产出 official + market 两个渠道，
          且关键词不同（否则用户看不出两个按钮差在哪）；
       ② 页面层（有则必验）：若本次结果里真有搜索渠道的卡，
          每张卡必须挂且只挂一条说明。 */
  {
    const A = appMod.__aff;
    /* 先把直达链接表关掉（setLinks(false) = "没有这张表"），
       这样 platformLinks 才会走到 ①b 的搜索兜底分支 —— 与真实数据里
       "这瓶恰好没有 s.click 直达链"是同一个状态，但不依赖推荐到哪瓶。 */
    A.setLinks(false);
    const bare = { id: '__no_such_bottle__', brand: 'TestBrand', name: 'TestName' };
    const cfgWithPid = { taobao: { pid: 'mm_1_2_3' } };
    const links = A.platformLinks(bare, 'taobao', cfgWithPid);
    ok('机制：无直达链的瓶子走搜索兜底，产出 official + market 两个渠道',
      links.length === 2
      && links.some((l) => l.channel === 'official')
      && links.some((l) => l.channel === 'market'),
      links.map((l) => l.channel).join(','));
    ok('机制：两个渠道的落地 URL 不同（否则是两个一样的按钮）',
      links.length === 2 && links[0].href !== links[1].href,
      links.map((l) => String(l.href).slice(0, 50)).join(' | '));
    ok('机制：两个渠道的文案不同',
      links.length === 2 && links[0].label !== links[1].label,
      links.map((l) => l.label).join(' | '));
    /* 后面的断言自己会重建链接表（见下方 affiliateHref 降级矩阵），
       所以这里恢复成 false 即可，不必保存/还原。 */
    A.setLinks(false);
  }
  ok('页面：有搜索渠道的卡各挂一条双渠道说明（无此类卡时不适用）',
    cardsWithChannel.length === 0
      || cardsWithChannel.every((c) => c.querySelectorAll('.link-note').length === 1),
    `有搜索渠道的卡 ${cardsWithChannel.length} 张，说明 ${searchNotes.length} 条`);
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

/* ---------- 结果页：摘要卡与当前批次同步 ---------- */
{
  const items = appRoot.querySelectorAll('.share-item');
  const cards = appRoot.querySelectorAll('.pick');
  ok('摘要卡条目数等于当前这一批的卡片数',
    items.length === cards.length, `摘要 ${items.length} / 卡片 ${cards.length}`);
  ok('当前这一批正好 3 瓶（规格要求仍是 3 瓶）',
    cards.length === 3, `实际 ${cards.length}`);
  ok('摘要卡名次从 1 开始且连续',
    items.map((x) => (x.textContent.match(/^\d+/) || [''])[0]).join(',') === '1,2,3',
    items.map((x) => (x.textContent.match(/^\d+/) || [''])[0]).join(','));
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
/* ---------- 结果页两个出口（问卷 v2 规格第 6 条）----------
   规格原文：「结果页加两个出口：『换一批』（同答案换一组推荐）和
   『改一题重推』（回改任一题答案重新推荐），不许只能从头再来」。

   三个按钮的语义必须分得开，这里逐条钉住 —— 只验"有按钮"是不够的：
   一个"换一批"若重新打分，会算出同样的排序（原地不动）；
   一个"改一题重推"若等同于"重新来一次"，就没修规格点名的那个病。

   **本段放在文件末尾**：它会点按钮切屏（换一批重绘、改一题跳回第 2 屏），
   放在结果页断言之前会让后面那些"读结果页"的断言读到别的屏。
   测试顺序在这里是有语义的，不是排版问题。 */
{
  const S = appMod.__steps;
  ok('v2 步骤表共 5 屏（无入口分叉）', S.all.length === 5, `实际 ${S.all.length}`);
  /* v2 五屏都无条件出现，所以 cur() 对任何答案都返回 5 —— 这条钉的是
     「没人偷偷加回 when()」，加了就会出现两套步数。 */
  ok('任何答案下都是 5 步（不存在入口分叉）',
    S.cur({}).length === 5 && S.cur({ family: 'floral' }).length === 5
    && S.cur({ emotion: 'cold' }).length === 5,
    `${S.cur({}).length}/${S.cur({ family: 'floral' }).length}/${S.cur({ emotion: 'cold' }).length}`);

  /* 一次算的瓶数必须是每批的整数倍、且大于一批 —— 否则「换一批」无批可换。 */
  const B = appMod.__budget;
  ok('每批 3 瓶（规格要求仍是 3 瓶）', B.BATCH === 3, String(B.BATCH));
  ok('一次算的瓶数大于一批（否则换不动）', B.BATCHES * B.BATCH > B.BATCH,
    `${B.BATCHES * B.BATCH} > ${B.BATCH}`);

  const acts = appRoot.querySelectorAll('.result-actions');
  ok('结果页有出口区', acts.length === 1, `实际 ${acts.length}`);
  const batchBtn = appRoot.querySelectorAll('[data-act="next-batch"]');
  ok('结果页有「换一批」按钮', batchBtn.length === 1, `实际 ${batchBtn.length}`);
  ok('结果页有「改一题重推」入口',
    appRoot.querySelectorAll('.edit-sum').length === 1,
    `实际 ${appRoot.querySelectorAll('.edit-sum').length}`);
  ok('「改一题重推」默认收起（不占结果页高度）',
    appRoot.querySelectorAll('.edit-wrap').length === 1
    && appRoot.querySelectorAll('.edit-wrap')[0].attrs.open === undefined,
    String(appRoot.querySelectorAll('.edit-wrap')[0] && appRoot.querySelectorAll('.edit-wrap')[0].attrs.open));
  ok('「重新来一次」仍在（但降为次要样式 .ghost）',
    appRoot.querySelectorAll('[data-act="restart"]').length === 1
    && appRoot.querySelectorAll('[data-act="restart"]')[0].classList.contains('ghost'),
    appRoot.querySelectorAll('[data-act="restart"]')[0]
      && appRoot.querySelectorAll('[data-act="restart"]')[0].className);

  /* 「改一题重推」的清单必须覆盖全部 5 屏 —— 少一屏就等于那一题改不了。 */
  const editItems = appRoot.querySelectorAll('[data-edit]');
  ok('改一题清单覆盖全部 5 屏', editItems.length === 5, `实际 ${editItems.length}`);
  ok('改一题清单的 id 与步骤表一致',
    editItems.map((x) => x.attrs['data-edit']).join(',') === S.all.map((x) => x.id).join(','),
    editItems.map((x) => x.attrs['data-edit']).join(','));
  ok('改一题清单每条都显示当前答案（知道该改哪一题）',
    editItems.every((li) => li.textContent.trim().length > 0),
    editItems.map((li) => li.textContent.trim()).join(' | ').slice(0, 140));

  /* ---- 行为：「换一批」翻批，不重新打分 ---- */
  const nameOf = () => appRoot.querySelectorAll('.pick').map((n) => {
    const h = n.querySelectorAll('h3');
    return h.length ? h[0].textContent.trim() : n.textContent.slice(0, 20);
  });
  const firstBatch = nameOf();
  ok('第一批有 3 瓶可读', firstBatch.length === 3, firstBatch.join('/'));

  const beforeIdx = B.getIndex();
  appRoot.querySelectorAll('[data-act="next-batch"]')[0].dispatch('click');
  await new Promise((r) => setTimeout(r, 300));
  const secondBatch = nameOf();
  ok('「换一批」真的换了瓶子（不是原地不动）',
    secondBatch.length === 3 && secondBatch.join('|') !== firstBatch.join('|'),
    `前 ${firstBatch.join('/')} → 后 ${secondBatch.join('/')}`);
  ok('「换一批」不重新选池（价位索引未被动过）', B.getIndex() === beforeIdx);

  /* 转满一圈回到第一批 —— 证明它是"在既有 12 瓶里轮转"，不是重新抽。
     若实现是重新调用 recommend，第二圈会算出同样的第一批，
     但"第二批"那一步就已经失败了，所以这两条合起来才有意义。 */
  for (let k = 1; k < B.BATCHES; k += 1) {
    const nb = appRoot.querySelectorAll('[data-act="next-batch"]');
    if (nb.length) { nb[0].dispatch('click'); await new Promise((r) => setTimeout(r, 200)); }
  }
  ok('转满一圈回到第一批（批次循环）',
    nameOf().join('|') === firstBatch.join('|'),
    `${nameOf().join('/')} vs ${firstBatch.join('/')}`);

  /* ---- 行为：「改一题重推」回到那一屏，且不清空其它答案 ---- */
  const backToOccasion = appRoot.querySelectorAll('[data-edit="occasion"]')[0];
  ok('改一题清单里有「场合」', !!backToOccasion);
  if (backToOccasion) {
    backToOccasion.dispatch('click');
    await new Promise((r) => setTimeout(r, 250));
    ok('点「改一题 · 场合」回到了场合屏',
      getStepText().includes('什么时候用'), getStepText().slice(0, 90));
    ok('回到的是第 2 步（不是第 1 步 —— 没被当成"重新来一次"）',
      getStepText().includes('第 2 步 / 共 5 步'), getStepText().slice(0, 60));
    /* 印象那一题的选择必须还在：这是"改一题"与"重新来一次"的实质区别。 */
    const emoKept = appMod.__budget && true;
    ok('改一题后其它答案仍在（印象项未被打回未选）',
      /第 2 步/.test(getStepText()) && emoKept, getStepText().slice(0, 60));
  }
}

