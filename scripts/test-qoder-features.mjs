/**
 * test-qoder-features.mjs — 本次三项改造的守门测试
 *
 * 覆盖：
 *   ① 本地档案：只存时间/入口/三瓶名，最多 5 条，坏数据不炸；
 *   ② 分享卡片：模型字段、理由摘要、canvas 绘制调用；
 *   ③ PWA：manifest 字段/图标尺寸、SW 预缓存清单、入口接线。
 *
 * 不覆盖：真实浏览器里的 PNG 编码与安装横幅 —— 那两项由
 * scripts/verify-qoder-features.mjs（Edge CDP）负责。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HISTORY_KEY, HISTORY_MAX, entryOf, entryLabel,
  makeHistoryRecord, readHistory, addHistory, clearHistory,
} from '../src/history.js';
import {
  SHARE_W, SHARE_H, summarizeReason, buildShareModel, drawShareCard,
} from '../src/share-card.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0;
const fails = [];
const ok = (name, cond, detail) => {
  if (cond) pass++;
  else fails.push(`${name}${detail ? ' :: ' + detail : ''}`);
};

/* ---------- 内存版 localStorage ---------- */
class MemStore {
  constructor(seed = {}) { this.map = new Map(Object.entries(seed)); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

const sample = (names = ['A', 'B', 'C']) => ({
  results: names.map((name, i) => ({
    perfume: { id: `p${i}`, name, brand: `brand-${i}`, familySource: 'x' },
    reasons: [`因为${name}`],
  })),
  profile: {},
});

/* ---------- ① 本地档案 ---------- */
{
  ok('入口类型：选了圆盘就是家族入口', entryOf({ family: 'floral', emotion: 'cold' }) === 'family');
  ok('入口类型：没选圆盘就是情绪入口', entryOf({ family: null, emotion: 'cold' }) === 'emotion');
  ok('入口文案：家族/情绪都有中文标签',
    entryLabel('family') === '香型圆盘' && entryLabel('emotion') === '情绪方向');

  const store = new MemStore();
  const rec = makeHistoryRecord(sample(), { family: 'citrus' }, 1763500000000);
  ok('记录里只有 t / entry / results 三个键',
    JSON.stringify(Object.keys(rec).sort()) === JSON.stringify(['entry', 'results', 't']),
    Object.keys(rec).join(','));
  ok('记录里每瓶只有 name / brand',
    rec.results.every((r) => Object.keys(r).sort().join(',') === 'brand,name'),
    JSON.stringify(rec.results[0] || {}));
  ok('记录不包含香水 id / 回答 / 设备信息',
    !/p0|p1|p2|floral|user|device/i.test(JSON.stringify(rec.results)),
    JSON.stringify(rec.results));
  ok('三瓶结果名与顺序原样保留',
    rec.results.map((r) => r.name).join(',') === 'A,B,C');

  addHistory(store, rec);
  ok('第一次写入后能读回 1 条', readHistory(store).length === 1);
  ok('读回的键就是约定的存储键', store.getItem(HISTORY_KEY) != null);

  for (let i = 0; i < 7; i++) {
    addHistory(store, makeHistoryRecord(sample([`N${i}`, 'B', 'C']), { family: 'x' }, 1763500000000 + i));
  }
  const kept = readHistory(store);
  ok(`最多保留 ${HISTORY_MAX} 条`, kept.length === HISTORY_MAX, String(kept.length));
  ok('最新一条在最前', kept[0].results[0].name === 'N6', kept[0].results[0].name);

  clearHistory(store);
  ok('清空后读到空数组', readHistory(store).length === 0 && store.getItem(HISTORY_KEY) == null);

  store.setItem(HISTORY_KEY, '{不是 JSON');
  ok('坏 JSON 不抛错、返回空数组', readHistory(store).length === 0);

  store.setItem(HISTORY_KEY, JSON.stringify([{ t: 'x' }, { t: 1, entry: 'family', results: [] }]));
  ok('缺字段的旧记录被过滤', readHistory(store).length === 0);

  ok('没有 storage（隐私模式）时读是空、写不抛',
    readHistory(null).length === 0 && addHistory(null, rec).length === 0);
}

/* ---------- ② 分享卡片 ---------- */
{
  ok('卡片是竖版 1080×1620', SHARE_W === 1080 && SHARE_H === 1620);
  ok('理由摘要去掉警告标记', summarizeReason('⚠️ 含你点名的橘子皮。后半句') === '含你点名的橘子皮');
  ok('理由摘要只取第一句', summarizeReason('第一句。第二句') === '第一句');
  ok('理由摘要去掉重复的顿号段',
    summarizeReason('含你点名的 刚剥开的橘子皮、刚剥开的橘子皮') === '含你点名的 刚剥开的橘子皮',
    summarizeReason('含你点名的 刚剥开的橘子皮、刚剥开的橘子皮'));
  const long = summarizeReason('香'.repeat(100));
  ok('过长的理由会被截断并加省略号', long.length === 73 && long.endsWith('…'), String(long.length));

  const model = buildShareModel({
    profile: { emotionZh: '清冷', occasionZh: '日常', intensity: 3 },
    budgetZh: '300-600 元',
    results: [
      { perfume: { name: 'A', brand: 'BA' }, reasons: ['⚠️ 第一句。第二句'] },
      { perfume: { name: 'B', brand: 'BB' }, reasons: ['理由 B'] },
      { perfume: { name: 'C', brand: 'BC' }, reasons: [] },
      { perfume: { name: 'D', brand: 'BD' }, reasons: ['不该出现'] },
    ],
  });
  ok('分享模型只取前 3 瓶', model.items.length === 3, String(model.items.length));
  ok('分享模型保留答案摘要', model.answers === '清冷 · 300-600 元 · 日常 · 浓郁度 3/5', model.answers);
  ok('分享模型保留第一句理由且去掉警告', model.items[0].reason === '第一句', model.items[0].reason);
  ok('没有理由时不编造', model.items[2].reason === '');

  /* 假 2D context：只记录绘制调用。measureText 用字符宽度近似，
     足以验证换行/省略号路径不会抛。 */
  const calls = [];
  const ctx = {
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    fillRect(...a) { calls.push(['fillRect', ...a]); },
    beginPath() { calls.push(['beginPath']); },
    moveTo(...a) { calls.push(['moveTo', ...a]); },
    lineTo(...a) { calls.push(['lineTo', ...a]); },
    stroke() { calls.push(['stroke']); },
    fillText(t, x, y) { calls.push(['fillText', String(t), x, y]); },
    measureText(t) { return { width: Array.from(String(t)).length * 16 }; },
    set fillStyle(v) { calls.push(['fillStyle', v]); },
    set font(v) { calls.push(['font', v]); },
    set textBaseline(v) { calls.push(['textBaseline', v]); },
    set textAlign(v) { calls.push(['textAlign', v]); },
    set strokeStyle(v) { calls.push(['strokeStyle', v]); },
    set lineWidth(v) { calls.push(['lineWidth', v]); },
  };
  drawShareCard(ctx, model, SHARE_W, SHARE_H);
  const texts = calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  ok('绘制时调用了 save/restore', calls.some((c) => c[0] === 'save') && calls.some((c) => c[0] === 'restore'));
  ok('三瓶名字都被画进卡片', ['A', 'B', 'C'].every((n) => texts.includes(n)), texts.join('|'));
  ok('答案摘要被画进卡片', texts.includes(model.answers));
  ok('页脚声明被画进卡片', texts.includes(model.foot));
  ok('没有横线时不会把 D 画进去', !texts.includes('D'));
  ok('卡片底色是暖纸（#FAF7F1）', calls.some((c) => c[0] === 'fillStyle' && c[1] === '#FAF7F1'));
}

/* ---------- ③ PWA ---------- */
{
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  ok('manifest：name / short_name', !!manifest.name && !!manifest.short_name);
  ok('manifest：display = standalone', manifest.display === 'standalone');
  ok('manifest：start_url / scope 都是相对入口', manifest.start_url === './' && manifest.scope === './');
  ok('manifest：theme_color 是暖纸色', /^#[0-9A-Fa-f]{6}$/.test(manifest.theme_color));

  const pngSize = (file) => {
    const b = fs.readFileSync(file);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  };
  for (const icon of manifest.icons) {
    const file = path.join(ROOT, icon.src.replace(/^\.\//, ''));
    ok(`manifest 图标存在：${icon.src}`, fs.existsSync(file));
    if (fs.existsSync(file)) {
      const { w, h } = pngSize(file);
      ok(`图标尺寸与声明一致：${icon.src} ${icon.sizes}`, `${w}x${h}` === icon.sizes, `${w}x${h}`);
    }
  }
  ok('manifest 有 maskable 图标', manifest.icons.some((i) => i.purpose === 'maskable'));

  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  for (const asset of ['index.html', 'styles.css', 'app.js', 'manifest.json',
    'src/scoring.js', 'src/history.js', 'src/share-card.js',
    'data/perfumes.json', 'data/taxonomy.json', 'icon-specimen/svg/woody-woody.svg']) {
    ok(`SW 预缓存了 ${asset}`, sw.includes(asset));
  }
  ok('SW 有导航回退到 index.html', sw.includes('INDEX') && sw.includes('match(INDEX)'));
  ok('SW 只处理同源 GET', sw.includes("req.method !== 'GET'") && sw.includes('url.origin !== self.location.origin'));
  ok('SW 会清理旧版本缓存', sw.includes('caches.delete'));

  const pwa = fs.readFileSync(path.join(ROOT, 'pwa.js'), 'utf8');
  ok('pwa.js 注册的是 ./sw.js', pwa.includes("register('./sw.js'"));

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok('index.html 接了 manifest', html.includes('rel="manifest" href="./manifest.json"'));
  ok('index.html 接了 pwa.js', html.includes('src="./pwa.js'));
  ok('index.html 有 apple-touch-icon', html.includes('rel="apple-touch-icon"'));
  ok('index.html 的脚本/样式版本号已更新', html.includes('app.js?v=20261118a') && html.includes('styles.css?v=20261118a'));
}

/* ---------- 入口接线 ---------- */
{
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  ok('app.js 引入 history 模块', app.includes("from './src/history.js'"));
  ok('app.js 引入 share-card 模块', app.includes("from './src/share-card.js'"));
  ok('出结果时写入本地档案', /addHistory\(localStorageSafe\(\), makeHistoryRecord\(res, state\.answers\)\)/.test(app));
  ok('结果页有下载 PNG 按钮', app.includes('下载分享卡片 PNG') && app.includes('exportSharePng'));
  ok('结果页有档案入口', app.includes('renderHistoryBlock') && app.includes('我的香水档案'));
  ok('PNG 用 toBlob，不请求外部接口', app.includes('canvas.toBlob'));

  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  ok('样式层已包含档案/分享组件', css.includes('.qw-history') && css.includes('.qw-share-row'));
}

console.log('\n===== Qoder 改造测试 =====');
console.log(`PASS ${pass}  FAIL ${fails.length}`);
fails.forEach((f) => console.log('  ✗ ' + f));
if (fails.length) process.exitCode = 1;
