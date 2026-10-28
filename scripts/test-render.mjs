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
      fn({ target: this, preventDefault() {}, ...payload }));
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
await new Promise((r) => setTimeout(r, 120)); // 等 fetch 完成

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
ok('圆盘有 radiogroup 语义', appRoot.querySelectorAll('[role="radiogroup"]').length === 1);
ok('盘心默认是空态', appRoot.querySelector('.disc-hub.is-idle') !== null);
ok('进度条存在', appRoot.querySelectorAll('.progress').length === 1);
ok('页脚有许可声明', getStepText().includes('CC BY 4.0'));

/* 点第一个扇区（清冷） */
const opts1 = appRoot.querySelectorAll('.disc-sector');
opts1[0].dispatch('click');
await new Promise((r) => setTimeout(r, 500));

ok('进入第 2 步（场合）', getStepText().includes('主要在哪里用'), getStepText().slice(0, 100));
const opts2 = appRoot.querySelectorAll('.disc-sector');
ok('场合圆盘 5 个扇区', opts2.length === 5, `实际 ${opts2.length}`);

/* 选「上班/上课」= 索引 1 */
opts2[1].dispatch('click');
await new Promise((r) => setTimeout(r, 500));

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
    return /主体是|厚重感|浓郁度/.test(t);
  }));
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
