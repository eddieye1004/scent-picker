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
  setAttribute(k, v) { this.attrs[k] = String(v); }
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
    const want = sel.replace(/^[.#]/, '');
    const isClass = sel.startsWith('.');
    const walk = (n) => {
      if (typeof n === 'string') return;
      const hit = isClass
        ? n.classList.contains(want)
        : n.tagName.toLowerCase() === want.toLowerCase();
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
  createTextNode: (t) => String(t),
  addEventListener: (ev, fn) => { globalThis.document._domReady = fn; },
  querySelector: (sel) => {
    if (sel === '#app') return appRoot;
    return null;
  },
};
globalThis.window = { scrollTo() {}, addEventListener() {} };
globalThis.performance = { now: () => Date.now() };

/* fetch 桩：直接读本地文件 */
globalThis.fetch = async (url) => {
  const p = path.join(ROOT, url.replace(/^\.\//, '').replace(/^\//, ''));
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
ok('首屏四个情绪选项', appRoot.querySelectorAll('.opt').length === 6,
  `实际 ${appRoot.querySelectorAll('.opt').length}`);
ok('进度条存在', appRoot.querySelectorAll('.progress').length === 1);
ok('页脚有许可声明', getStepText().includes('CC BY 4.0'));

/* 点第一个情绪（清冷） */
const opts1 = appRoot.querySelectorAll('.opt');
opts1[0].dispatch('click');
await new Promise((r) => setTimeout(r, 300));

ok('进入第 2 步（场合）', getStepText().includes('主要在哪里用'), getStepText().slice(0, 100));
const opts2 = appRoot.querySelectorAll('.opt');
ok('场合 5 个选项', opts2.length === 5, `实际 ${opts2.length}`);

/* 选「上班/上课」= 索引 1 */
opts2[1].dispatch('click');
await new Promise((r) => setTimeout(r, 300));

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
