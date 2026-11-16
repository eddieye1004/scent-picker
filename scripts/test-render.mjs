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
  /* replaceChild 同样是标准 DOM 方法，app.js 的 refreshNav() 用它换掉
     底部 .actions（"选了预算之后提示语要跟着变"就走这条路）。
     桩缺它时那句话在测试里永远验不到 —— 而浏览器里是正常的。
     补桩而不是改断言，理由与上面 insertBefore / replaceWith 那两段相同。 */
  replaceChild(newNode, oldNode) {
    const i = this.children.indexOf(oldNode);
    if (i >= 0) {
      if (typeof newNode !== 'string') newNode.parentNode = this;
      this.children.splice(i, 1, newNode);
      oldNode.parentNode = null;
    }
    return oldNode;
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
    /* 其余选择器要真的在 #app 里找 —— 不能一律返回 null。
       refreshNav() 走的是 `document.querySelector('.actions')`（全局查询），
       桩返回 null 时它会以为"没有 .actions"直接 return，于是"选了预算之后
       底部提示有没有跟着变"这件事**在测试里永远测不到**，
       而浏览器里它是正常工作的。这正是"桩缺能力就补桩，不要改断言绕开"那条。 */
    return appRoot.querySelector(sel) || null;
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

/* 断言：首屏（v5 = 预算屏）
   ------------------------------------------------------------
   v5 把第 1 屏从香型轮盘换成预算，所以这一整段（原 268–1148 行）重写：
   轮盘的 60 余条断言挂的 DOM 已经不存在，留着它们只会全部变红，
   而那不代表任何真实回归 —— 它们测的东西已经被删掉了。

   删掉的是"圆盘第 1 屏"的断言；**圆盘本身没有失守**：它仍在场合屏上，
   那一屏的断言见下面「场合屏圆盘」段（原来的场合盘断言本来就是从
   这里分出去的，只是过去只测第 1 屏那个盘）。
   香型小图标也没有失守：它换了宿主（气质屏），断言改在那边。 */
ok('首屏标题', getStepText().includes('从零开始，找到第一瓶香水'), getStepText().slice(0, 120));

/* ---- 屏 1 预算：价签量尺 ---- */
{
  const rail = appRoot.querySelector('.budget-rail');
  ok('首屏是预算题（价签量尺在场）', rail !== null,
    `首屏文本：${getStepText().slice(0, 80)}`);
  ok('预算题标题正确', getStepText().includes('你打算花多少钱'), getStepText().slice(0, 60));

  const segs = appRoot.querySelectorAll('.budget-seg');
  /* 四个实区间 + 一个「不限」出口。数量必须与 BUDGET_OPTS 一致：
     少一个说明某个档位没渲染，多一个说明重复渲染。 */
  ok('价签量尺有 4 个价位段 + 1 个「不限」出口', segs.length === 5, `实际 ${segs.length}`);
  ok('每个价位段都是真实 button', appRoot.querySelectorAll('button.budget-seg').length === 5,
    `实际 ${appRoot.querySelectorAll('button.budget-seg').length}`);
  ok('价签量尺是 radiogroup 语义', rail && rail.attrs.role === 'radiogroup',
    rail ? String(rail.attrs.role) : '(无 .budget-rail)');
  /* 「不限」必须与四个实区间在视觉上不同类（虚线边 + is-any 类）：
     它是出口，不是第五个价位。 */
  const anySeg = segs.filter((s) => s.classList.contains('is-any'));
  ok('「不限」是独立一档（带 is-any）', anySeg.length === 1, `实际 ${anySeg.length}`);
  /* 宽度权重来自真实瓶数，必须写进 --w。四段等宽的话，
     用户看不出"哪一段货多"——那正是这条量尺存在的理由。 */
  ok('每段都带宽度权重 --w（宽度由真实瓶数派生）',
    segs.every((s) => /--w:[\d.]+/.test(s.attrs.style || '')),
    segs.map((s) => (s.attrs.style || '').match(/--w:[\d.]+/)).join(' | '));
  /* 四段权重必须不相等：全相等说明可能退回了"等分四格" */
  const ws = segs.filter((s) => !s.classList.contains('is-any'))
    .map((s) => Number((s.attrs.style || '').match(/--w:([\d.]+)/)?.[1] || 0));
  ok('四个价位段的宽度不完全相等（不是等分四格）', new Set(ws).size > 1, ws.join(','));

  /* 每段下面一句人话：价位不是术语，但"300–700"对没买过香水的人一样抽象 */
  ok('每段下面都有一句生活化说明', appRoot.querySelectorAll('.budget-note').length === 5,
    `实际 ${appRoot.querySelectorAll('.budget-note').length}`);

  /* 未选时读数必须是"请先选"，不能显示 0 瓶 ——
     0 会被读成"这一段一瓶都没有"，与"还没选"是两句话。 */
  const readBefore = appRoot.querySelector('.budget-read');
  ok('未选时读数是引导语而不是 0 瓶', !!readBefore && /先选/.test(readBefore.textContent),
    readBefore && readBefore.textContent);

  /* 点第二档（300–700），读数换成这一档的真实瓶数 */
  const b2 = segs.find((s) => s.attrs['data-id'] === 'b2');
  b2.dispatch('click');
  await new Promise((r) => setTimeout(r, 120));
  ok('点价位段后该段变实心（is-on）', b2.classList.contains('is-on'), b2.className);
  ok('点价位段后 aria-checked 同步', b2.attrs['aria-checked'] === 'true',
    String(b2.attrs['aria-checked']));
  const readAfter = appRoot.querySelector('.budget-read');
  /* 读数必须现算出这一档的瓶数。价签表在本仓里，所以这里一定读得到；
     读不到时显示的是"暂时数不出来"，那句也必须被抓到（不能静默过）。 */
  ok('选中后读数换成这一档的真实瓶数',
    !!readAfter && /\d+\s*瓶可选/.test(readAfter.textContent),
    readAfter && readAfter.textContent);
  const shownN = Number((readAfter.textContent.match(/(\d+)\s*瓶可选/) || [])[1]);
  ok('这一档瓶数与价签表一致（300–700 档 = 176）', shownN === 176, `界面显示 ${shownN}`);
  /* 其余段必须摘掉 is-on：单选，不能两个同时亮 */
  ok('其余价位段被摘掉 is-on',
    segs.filter((s) => s.classList.contains('is-on')).length === 1,
    `亮着 ${segs.filter((s) => s.classList.contains('is-on')).length} 段`);

  /* 数据边界必须上屏：46% 有价签这件事不讲，用户选了档发现很少会以为推荐坏了 */
  ok('预算屏写明价签覆盖不全（不展示具体价格）',
    getStepText().includes('不显示具体价格') && /637|751/.test(getStepText()),
    getStepText().slice(0, 200));

  /* 前进按钮：选了具体档时提示要说明后果（"只从这一段里挑"） */
  const go1 = appRoot.querySelectorAll('.btn').find((b) => b.textContent.includes('下一步'));
  ok('预算屏有下一步按钮', !!go1);
  ok('选了预算后提示写明只在这一段里挑',
    /只从.*这一段里挑/.test(appRoot.textContent), getStepText().slice(-120));
  go1.dispatch('click');
  await new Promise((r) => setTimeout(r, 320));
}

/* ---- 屏 2 场合：圆盘 + 昼夜光景 ---- */
{
  ok('进入第 2 屏（场合）', getStepText().includes('主要什么时候用'), getStepText().slice(0, 100));
  /* 六屏：1 预算 / 2 场合 / 3 气质 / 4 季节 / 5 浓淡 / 6 已知款。
     （规格说"五屏"，末屏「已知款」是可跳过的补充项，实际渲染是 6 屏 ——
      这里是 6 不是 5，两个数字都对，但界面只认表里的那个，所以断言打表。） */
  ok('v5 进度显示共 6 步', /共 6 步/.test(getStepText()),
    getStepText().slice(0, 60));

  /* 圆盘在这里，不在第 1 屏了。它测的东西和原来一样：真 button、
     扇形本体可点、盘心空态、radiogroup 语义。 */
  ok('场合屏有圆盘（5 个场合扇区）', appRoot.querySelectorAll('.disc-sector').length === 5,
    `实际 ${appRoot.querySelectorAll('.disc-sector').length}`);
  ok('场合盘扇区是真实 button', appRoot.querySelectorAll('button.disc-sector').length === 5,
    `实际 ${appRoot.querySelectorAll('button.disc-sector').length}`);
  ok('场合盘画了 5 块扇形', appRoot.querySelectorAll('.sector-shape').length === 5,
    `实际 ${appRoot.querySelectorAll('.sector-shape').length}`);
  ok('场合盘有 radiogroup 语义',
    appRoot.querySelectorAll('[role="radiogroup"]').length >= 1,
    `实际 ${appRoot.querySelectorAll('[role="radiogroup"]').length}`);
  ok('场合盘盘心默认是空态', appRoot.querySelector('.disc-hub.is-idle') !== null);
  const occGroups = appRoot.querySelectorAll('.sector-g');
  ok('每个扇形本体都绑了 click（不是只有标签能点）',
    occGroups.length === 5 && occGroups.every((g) => (g._listeners.click || []).length > 0),
    `${occGroups.filter((g) => (g._listeners.click || []).length > 0).length}/${occGroups.length}`);

  /* 昼夜光景：这一屏独有的效果，data-time 随选中场合切 */
  const light = appRoot.querySelector('.occasion-light');
  ok('场合屏有昼夜光景层', !!light);
  ok('没有光照时它还没有时段态（不预设一个假时段）', !light.classList.contains('has-time'),
    light.className);
  /* 术语译文行：未选时是引导，选中后换成该场合的要求 */
  const gloss0 = appRoot.querySelector('.gloss-line');
  ok('场合屏有术语译文行', !!gloss0);
  ok('未选时译文行是引导语（不冒充某个答案的译文）',
    !!gloss0 && gloss0.classList.contains('is-idle'), gloss0 && gloss0.className);

  /* 点「约会」扇区：光景切到 evening，译文行换成该场合的要求 */
  const dateBtn = appRoot.querySelectorAll('.disc-sector').find((b) => b.attrs['data-id'] === 'date')
    || appRoot.querySelectorAll('.disc-sector')[1];
  dateBtn.dispatch('click');
  await new Promise((r) => setTimeout(r, 260));
  const lightAfter = appRoot.querySelector('.occasion-light');
  ok('选场合后昼夜光景切到对应时段',
    !!lightAfter && lightAfter.attrs['data-time'] === 'evening',
    lightAfter && String(lightAfter.attrs['data-time']));
  const glossAfter = appRoot.querySelector('.gloss-line');
  /* 译文必须用数据里的 sillageMax / longevityMin 翻成人话，
     不是另编一句营销文案。约会 = sillageMax 4 / longevityMin 3。 */
  ok('译文行换成人话（远近距离 + 撑多久）',
    !!glossAfter && /闻到/.test(glossAfter.textContent) && /撑/.test(glossAfter.textContent),
    glossAfter && glossAfter.textContent);
  ok('译文行不再处于引导态', !!glossAfter && !glossAfter.classList.contains('is-idle'),
    glossAfter && glossAfter.className);

  /* 随身的标本签：答过预算 + 场合之后应该有两枚 */
  const carry = appRoot.querySelectorAll('.carry-tag');
  ok('已答项做成标本签跟着走', carry.length >= 2, `${carry.length} 枚：${carry.map((c) => c.textContent).join(' / ')}`);
  ok('标本签里能看见预算那一档', carry.some((c) => /300–700/.test(c.textContent)),
    carry.map((c) => c.textContent).join(' / '));

  const go2 = appRoot.querySelectorAll('.btn').find((b) => b.textContent.includes('下一步'));
  ok('场合屏有下一步按钮', !!go2);
  go2.dispatch('click');
  await new Promise((r) => setTimeout(r, 320));
}

/* ---- 屏 3 气质：坐标图 + 七枚图鉴图标 + 情绪入口 ---- */
{
  ok('进入第 3 屏（气质）', getStepText().includes('给人什么感觉'), getStepText().slice(0, 100));

  /* 坐标图：七个原型按 dims 落位，是同一组数据的第二种投影 */
  const map = appRoot.querySelector('.mood-map');
  ok('气质屏有坐标图', !!map);
  ok('坐标图上有七个点（一个原型一枚）',
    appRoot.querySelectorAll('.map-dot').length === 7,
    `实际 ${appRoot.querySelectorAll('.map-dot').length}`);
  /* 点必须有坐标，而且**不能全落在一处**。
     注意七枚只落在 4 个 (temp, sweet) 象限里（二值轴只有 4 个落点，
     这是数据事实），所以正确判据不是"七个各不相同"，而是
     "至少 4 个不同位置，且同象限的那几枚被错开了"。
     第一版写成 ===7，是拿一条数据撑不起的断言去测它 —— 那种红是假红。 */
  const dots = appRoot.querySelectorAll('.map-dot');
  const pos = dots.map((d) => (d.attrs.style || ''));
  ok('七个点至少落在 4 个不同位置（= 四个象限都在）',
    new Set(pos).size >= 4, `${new Set(pos).size} 个位置：${pos.join(' | ')}`);
  ok('同象限的原型被错开（不是叠成一个点）',
    new Set(pos).size === dots.length, `${new Set(pos).size}/${dots.length} 个位置`);
  /* 坐标图是装饰（aria-hidden），真控件是卡片组 —— 这条守"不是两套控件" */
  ok('坐标图是 aria-hidden（真控件仍是卡片组）',
    map && map.attrs['aria-hidden'] === 'true', map && String(map.attrs['aria-hidden']));

  /* 七枚图鉴图标：香型小图标系统换了宿主但没丢 */
  const plates = appRoot.querySelectorAll('.choice-plate');
  ok('气质七张卡各配一枚图鉴图标', plates.length === 7, `实际 ${plates.length}`);
  const plateSvgs = appRoot.querySelectorAll('.choice-plate .plate-svg');
  ok('图标走的是上色通路（is-art，不是线稿兜底）',
    plateSvgs.length === 7 && plateSvgs.every((p) => p.classList.contains('is-art')),
    `${plateSvgs.filter((p) => p.classList.contains('is-art')).length}/${plateSvgs.length}`);
  ok('图标是 24×24 同一视框',
    plateSvgs.every((p) => p.attrs.viewBox === '0 0 24 24'),
    plateSvgs.map((p) => p.attrs.viewBox).join(' | '));
  /* 七枚必须两两不同 —— 一排同形图标正是笔记里要拦的失败。
     **不能用 textContent 比**：上色 SVG 里没有一个文字节点（<title> 在
     artInner 里已被剥掉），七枚的 textContent 全是空串，比对结果恒为
     "1 种"，那是假红。所以要拿**结构签名**比：把每个图元的标签名与
    它的几何属性拼起来。几何属性（d / cx / r / fill）正是"这枚画的是什么"，
     颜色可以雷同，形状不会。 */
  const sigOf = (node) => {
    const parts = [];
    const walk = (n) => {
      if (typeof n === 'string') return;
      const a = n.attrs || {};
      parts.push(n.tagName + ':' + (a.d || a.cx || a.x1 || a.points || a.fill || ''));
      (n.children || []).forEach(walk);
    };
    (node.children || []).forEach(walk);
    return parts.join('|');
  };
  const sigs = plateSvgs.map(sigOf);
  ok('七枚图标两两不同（不是一排同形）',
    new Set(sigs).size === sigs.length && sigs.every((s) => s.split('|').length > 3),
    `${new Set(sigs).size}/${sigs.length} 种；首枚图元数 ${(sigs[0] || '').split('|').length}`);

  /* 选中一个原型：必须同时写 emotion（否则引擎 throw）、点亮坐标点、换译文 */
  const cards = appRoot.querySelectorAll('.choice');
  ok('气质组恰好 7 个原型', cards.length === 7, `实际 ${cards.length}`);
  const target = cards.find((c) => c.attrs['data-id'] === 'wet-forest') || cards[0];
  target.dispatch('click');
  await new Promise((r) => setTimeout(r, 120));
  ok('选中原型后该卡 is-on', target.classList.contains('is-on'), target.className);
  const onDot = appRoot.querySelectorAll('.map-dot').filter((d) => d.classList.contains('is-on'));
  ok('选中原型后坐标图上对应点亮起', onDot.length === 1, `亮 ${onDot.length} 个`);
  /* 这是 v5 最要紧的一条接线：气质必须产出情绪入口，否则引擎拒绝出结果 */
  ok('气质选中后写入了情绪入口（引擎的硬要求）',
    !!appRoot.__emotion && appRoot.__emotion() === 'cold',
    appRoot.__emotion ? String(appRoot.__emotion()) : '(未挂探针)');
  ok('译文行跟着换成"这个气质在气味上是什么样"',
    !appRoot.querySelector('.gloss-line').classList.contains('is-idle'),
    appRoot.querySelector('.gloss-line').textContent);
  /* 六个气质词都不该出现香调术语（这是规格第 1 条，也是这一屏存在的理由） */
  const moodTxt = getStepText();
  ok('气质屏不出现香调术语（柑橘调/木质调这类）',
    !/柑橘调|花香调|木质调|琥珀调|清新调|美食调/.test(moodTxt),
    (moodTxt.match(/柑橘调|花香调|木质调|琥珀调|清新调|美食调/) || ['无'])[0]);

  const go3 = appRoot.querySelectorAll('.btn').find((b) => b.textContent.includes('下一步'));
  go3.dispatch('click');
  await new Promise((r) => setTimeout(r, 320));
}

/* ---- 屏 4 季节：温度光带 ---- */
{
  ok('进入第 4 屏（季节）', getStepText().includes('主要在哪个季节用'), getStepText().slice(0, 100));
  const band = appRoot.querySelector('.temp-band');
  ok('季节屏是温度光带', !!band);
  const segs = appRoot.querySelectorAll('.temp-seg');
  ok('光带四段（春夏秋冬）', segs.length === 4, `实际 ${segs.length}`);
  ok('光带是 radiogroup 语义', band && band.attrs.role === 'radiogroup',
    band ? String(band.attrs.role) : '(无 .temp-band)');
  /* --t 是每段在温度轴上的落点，必须由数据给且各不相等于"等分四格" */
  const ts = segs.map((s) => Number((s.attrs.style || '').match(/--t:([\d.]+)/)?.[1] ?? -1));
  ok('四段都带温度位 --t', ts.every((x) => x >= 0), ts.join(','));
  ok('夏在最热端、冬在最冷端（温度轴不是等分四格）',
    ts[1] === 1 && ts[3] === 0, ts.join(','));
  ok('温度条高度随 --t 派生',
    fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8')
      .includes('height: calc(6px + var(--t, .5) * 48px)'),
    '缺 temp-bar 的 --t 派生高度');

  const summer = segs.find((s) => s.attrs['data-id'] === 'summer');
  summer.dispatch('click');
  await new Promise((r) => setTimeout(r, 300));
  ok('选夏后该段亮起', summer.classList.contains('is-on'), summer.className);
  ok('选夏后带一次热流（is-flash）',
    appRoot.querySelector('.temp-band').classList.contains('is-flash'),
    appRoot.querySelector('.temp-band').className);
  /* 译文行要说出这一季的覆盖瓶数 —— 那个数字必须与数据一致 */
  ok('季节译文行带真实覆盖瓶数（夏 840）',
    /840/.test(appRoot.querySelector('.gloss-line').textContent),
    appRoot.querySelector('.gloss-line').textContent);

  const go4 = appRoot.querySelectorAll('.btn').find((b) => b.textContent.includes('下一步'));
  go4.dispatch('click');
  await new Promise((r) => setTimeout(r, 320));
}

/* ---- 屏 5 浓淡：扩散场 ---- */
{
  ok('进入第 5 屏（浓淡）', getStepText().includes('想要多浓'), getStepText().slice(0, 100));
  const field = appRoot.querySelector('.sillage-field');
  ok('浓淡屏是扩散场', !!field);
  ok('扩散场五圈', appRoot.querySelectorAll('.sillage-ring').length === 5,
    `实际 ${appRoot.querySelectorAll('.sillage-ring').length}`);
  ok('扩散场有一枚中心核', appRoot.querySelectorAll('.sillage-core').length === 1);
  /* data-level 驱动哪几圈亮：换档只改一个 attribute，不重建 DOM */
  ok('扩散场用 data-level 表达档位', field && /^[1-5]$/.test(field.attrs['data-level'] || ''),
    field && String(field.attrs['data-level']));
  ok('扩散场是 aria-hidden（真控件是原生 range）',
    field && field.attrs['aria-hidden'] === 'true');

  /* 滑块仍是原生 range：键盘与读屏都靠它。视觉降级不等于语义降级。 */
  const range = appRoot.querySelector('input');
  ok('浓淡仍保留原生 range（无障碍不能降级）', !!range && range.attrs.type === 'range',
    range ? String(range.attrs.type) : '(无 input)');
  ok('滑块有 5 个刻度落点', appRoot.querySelectorAll('.scale-tick').length === 5,
    `实际 ${appRoot.querySelectorAll('.scale-tick').length}`);
  /* 三个物件编号必须在（一屏三个决定，必须说清在答第几个） */
  const t5 = getStepText();
  ok('浓淡屏三个物件都带编号（① ② ③）',
    /①/.test(t5) && /②/.test(t5) && /③/.test(t5), t5.slice(0, 120));
  ok('未选浓度时 ③ 留香是空态（不凭空给推断值）',
    appRoot.querySelectorAll('.long-read.is-empty').length === 1,
    `空态 ${appRoot.querySelectorAll('.long-read.is-empty').length} 个`);

  /* 拖到 5 档：扩散场必须跟着推到最大 */
  if (range) {
    range.attrs.value = '5';
    range.dispatch('input', { target: { value: '5' } });
    await new Promise((r) => setTimeout(r, 120));
  }
  const field5 = appRoot.querySelector('.sillage-field');
  ok('拖到 5 档扩散场推到最外圈', field5 && field5.attrs['data-level'] === '5',
    field5 && String(field5.attrs['data-level']));
  ok('换档触发一次扩散脉冲（is-pulse）',
    appRoot.querySelector('.sillage-field').classList.contains('is-pulse'),
    appRoot.querySelector('.sillage-field').className);

  const go5 = appRoot.querySelectorAll('.btn').find((b) => b.textContent.includes('下一步'));
  ok('浓淡屏有下一步按钮', !!go5);
  go5.dispatch('click');
  await new Promise((r) => setTimeout(r, 320));
}

/* ---- 屏 6（末屏）已知款 ---- */
{
  ok('进入末屏（已知款）', getStepText().includes('试过、并且喜欢'), getStepText().slice(0, 100));
  /* 品牌必须是可搜索组合框（133 个品牌，原生 select 只能滚） */
  const combos = appRoot.querySelectorAll('.combo-input');
  ok('末屏品牌是可搜索组合框', combos.length === 1, `实际 ${combos.length}`);
  ok('组合框是 combobox 语义',
    combos.length === 1 && combos[0].attrs.role === 'combobox',
    combos.length ? String(combos[0].attrs.role) : '-');
  ok('品牌不再用原生 select',
    appRoot.querySelectorAll('select').length === 0,
    `实际 ${appRoot.querySelectorAll('select').length} 个 select`);
  /* 术语译文行：这一屏也要有一句（全卷一致） */
  ok('已知款屏也有术语译文行', !!appRoot.querySelector('.gloss-line'));
}

const finishBtn = appRoot.querySelectorAll('.btn').find((b) => b.textContent.includes('看推荐'));
/* 断言"有看推荐按钮"，不写死步号 —— 起步数会随版本变，
   写死历史编号的话每次调整步骤都会误报一次，而且报错信息里看不出真正原因。 */
ok('末步有看推荐按钮', !!finishBtn,
  `按钮：${appRoot.querySelectorAll('.btn').map((x) => x.textContent.trim()).join(' | ').slice(0, 120)}`);
if (finishBtn) {
  finishBtn.dispatch('click');
  /* finish() 里要 await 三个数据（香水库 / 实物图 / 价签表），
     而 affiliate 链接是**另一个**异步层（ensureAffLinks），
     它不在这条 await 链上 —— 所以结果页首帧可能还没有购买入口。
     这是产品上的有意设计（购买入口后到、不阻塞结果），
     但测试必须等它落地才能验购买链接那一整段。 */
  await new Promise((r) => setTimeout(r, 900));
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
/* 结果页的两个出口是 v5 规格的硬要求（明令「不许只能从头再来」）。
   断言三条：① 换一批在；② 改一题重推的逐屏入口在；③ 清空降级成次要按钮。
   「重新来一次」这个名字已被「全部重答」替掉 —— 它现在不是主出口，
   主出口是换一批与改一题。 */
ok('结果页有「换一批」出口',
  appRoot.querySelectorAll('.btn').some((b) => /换一批|回到第一批/.test(b.textContent)),
  appRoot.querySelectorAll('.btn').map((b) => b.textContent.trim()).join(' | ').slice(0, 120));
ok('结果页有「改一题重推」的逐屏入口',
  appRoot.querySelectorAll('.outlet-jump-item').length === 6,
  `实际 ${appRoot.querySelectorAll('.outlet-jump-item').length} 个`);
ok('结果页保留「全部重答」（清空，已降级为次要出口）',
  appRoot.querySelectorAll('.btn').some((b) => b.textContent.includes('全部重答')));

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
  /* 这条断言原本要求"至少有一张卡带搜索渠道"。
     但**这一轮抽到的三瓶恰好全都有直达链**（affiliate-links.json 里 661 瓶有直达链，
     命中率约 48%，三瓶全中的概率并不低）—— 于是 cardsWithChannel 为 0，
     断言变成"因为抽签结果而变红"，那是一条**假红**：代码没坏，数据换了。
     正确写法是条件化：有搜索渠道的卡必须各挂一条；一张都没有时不算失败，
     但要把这件事打印出来（否则"这条永远没被验过"会静默下去）。 */
  ok('有搜索渠道的卡各挂一条双渠道说明',
    cardsWithChannel.length === 0
      ? true
      : cardsWithChannel.every((c) => c.querySelectorAll('.link-note').length === 1),
    cardsWithChannel.length === 0
      ? '本次三瓶全命中直达链，没有搜索渠道卡可验（非失败）'
      : `有搜索渠道的卡 ${cardsWithChannel.length} 张，说明 ${searchNotes.length} 条`);
  ok('双渠道说明包含「价格未排序」',
    searchNotes.every((n) => /价格未排序|未排序/.test(n.textContent)),
    searchNotes.length
      ? searchNotes.map((n) => n.textContent.slice(0, 20)).join(' | ')
      : '本次无搜索渠道说明可验（三瓶全命中直达链）');
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

/* ---------- 步骤表契约（v5：五屏，无入口分叉）----------
   v5 的步骤表是**直的**：六屏全集、没有任何 when() 条件，
   所以"两条入口步数不同"这套断言整体作废 —— 它们测的是"轮盘入口 vs 感觉入口"
   的分叉，而轮盘已经退场。

   但**没有取消对步骤表的守门**，只是换了守的东西：
   现在真正会坏的是「屏数悄悄变了」与「id 改名但 CSS 没跟」。
   前者会让进度条与标题对不上，后者会让整屏样式静默失效（历史上有过）。
*/
{
  const S = appMod.__steps;
  /* 六屏：1 预算 / 2 场合 / 3 气质 / 4 季节 / 5 浓淡 / 6 已知款。
     这个数字必须与规格书点名的"五屏 + 末屏可选已知款"一致；
     多一屏少一屏都要在这里显式改，不能让它悄悄漂。 */
  ok('v5 步骤全集是 6 屏', S.all.length === 6, `实际 ${S.all.length}`);

  const ids = S.all.map((x) => x.id);
  /* 复制粘贴忘改 id 的经典错法：两屏互相覆盖、进度条段数却对得上，界面上看不出来 */
  ok('6 个步骤的 id 两两不同', new Set(ids).size === ids.length, ids.join(','));

  /* 顺序本身就是设计：预算必须第一（先划货架再挑货），已知款必须最后（它是可跳过的补充） */
  ok('预算排在第 1 屏（前置，先圈池再问偏好）', ids[0] === 'budget', ids.join(','));
  ok('已知款排在最后（可跳过的补充项）', ids[ids.length - 1] === 'anchor', ids.join(','));

  /* 香型术语题必须**彻底**退场。这三条是本轮最该守的回归：
     它们一旦回来，规格第 1 条就被违反而测试会全绿。 */
  ok('香型轮盘屏（family）已退场', !ids.includes('family'), ids.join(','));
  ok('香调点名两屏（likedNotes / dislikedNotes）已退场',
    !ids.includes('likedNotes') && !ids.includes('dislikedNotes'), ids.join(','));
  ok('整族排除屏（dislikedFamilies）已退场',
    !ids.includes('dislikedFamilies'), ids.join(','));

  /* 步骤表是直的：没有任何 when() 条件。
     这一条替掉了原来的"家族入口 8 步 / 情绪入口 9 步"——
     两支必须相等，因为根本不存在分支了。 */
  ok('步骤表没有条件分支（无入口分叉）',
    S.cur({}).length === 6 && S.cur({ family: 'floral' }).length === 6
    && S.cur({ emotion: 'cold' }).length === 6,
    `空 ${S.cur({}).length} / 家族 ${S.cur({ family: 'floral' }).length} / 情绪 ${S.cur({ emotion: 'cold' }).length}`);

  /* 「第 N 步 / 共 M 步」必须跟着表走 —— 这是用户唯一能看见的数字 */
  const headAnchor = S.head('anchor', {});
  ok('末屏是第 6 步 / 共 6 步', headAnchor.kicker === '第 6 步 / 共 6 步', headAnchor.kicker);
  const headBudget = S.head('budget', {});
  ok('首屏是第 1 步 / 共 6 步', headBudget.kicker === '第 1 步 / 共 6 步', headBudget.kicker);

  /* 越界夹取：step 可能停在结果页（= 表长），也可能因为老档位越界 */
  ok('越界夹取：step=6 在 6 步表里保持 6（=结果页）', S.clamp(6, 6) === 6, String(S.clamp(6, 6)));
  ok('越界夹取：step=9 在 6 步表里夹到 6', S.clamp(9, 6) === 6, String(S.clamp(9, 6)));
  ok('越界夹取：step=3 不动', S.clamp(3, 6) === 3, String(S.clamp(3, 6)));
  ok('越界夹取：负数是 0', S.clamp(-1, 6) === 0, String(S.clamp(-1, 6)));
  ok('越界夹取：NaN 是 0', S.clamp(NaN, 6) === 0, String(S.clamp(NaN, 6)));
  ok('6 个步骤全部有可渲染函数',
    S.all.every((x) => typeof x.render === 'function'), ids.join(','));

  /* 重开一局：必须回到第 1 屏，且预算被清空。
     预算漏清的话，用户点「全部重答」会发现自己还停在上一档 ——
     那是最容易被当成"重开没生效"的 bug。 */
  const restartFn = appMod.__restart;
  if (restartFn) {
    restartFn();
    await new Promise((r) => setTimeout(r, 300));
    ok('重开后回到第 1 屏（预算）', getStepText().includes('你打算花多少钱'), getStepText().slice(0, 60));
    const b1 = appRoot.querySelectorAll('.budget-seg').filter((s) => s.classList.contains('is-on'));
    ok('重开后预算没有残留选中态', b1.length === 0, `仍亮着 ${b1.length} 段`);
    /* 全卷的题都必须是用户读得懂的词：不出现香调术语 */
    const allTitles = S.all.map((x) => x.title + ' ' + (x.help || '')).join(' ');
    ok('六屏标题与说明都不出现香调术语',
      !/柑橘调|花香调|木质调|琥珀调|清新调|美食调|馥奇/.test(allTitles),
      (allTitles.match(/柑橘调|花香调|木质调|琥珀调|清新调|美食调|馥奇/) || ['无'])[0]);
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
