/**
 * test-stamp-ui.mjs — 试香盖章 UI 层的守门测试（src/stamp-ui.js + app.js 接线）
 *
 * 两层：
 *   ① 纯逻辑（src/stamp-ui.js）：盖/撤的编排、内存兜底、展示模型
 *      （最近一次 + 共 N 次）、五句提示的逐字文案；
 *   ② 源码/产物守卫：app.js 是否把盖章位放进档案的每一瓶、五档面板是不是
 *      两段式、是否**没有**任何"盖章后自动加心仪"的联动、styles.css（产物）
 *      里是否有对应规则、以及数据层与档案层是否一个字节都没被改。
 *
 * 为什么这一套不 import app.js：app.js 是 DOM 驱动的，拉起它要一整套渲染桩
 * （见 test-render.mjs）。这里守的是**判据**与**接线**，用内存存储 + 源码扫描
 * 就能钉死，跑得也快。渲染层的断言在 test-render.mjs 的「试香盖章」段。
 *
 * 用法：node scripts/test-stamp-ui.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STAMP_KEY, STAMP_MAX, STAMP_TIERS, STAMP_TIER_ZH, createStamps,
} from '../src/stamp.js';
import {
  STAMP_MSG, createMemoryStore, createStampSession, stampMessage,
  stampViewOf, stampTiers, stampDateLabel,
} from '../src/stamp-ui.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
const fails = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + name); } else {
    fails.push(name);
    console.log('  ✗ ' + name + (detail ? ' :: ' + detail : ''));
  }
};

/* ---------- 内存存储（与 test-stamp 的 MemStore 同形） ---------- */
class MemStore {
  constructor(seed = {}) { this.map = new Map(Object.entries(seed)); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

/* 配额满 / 隐私模式：setItem 一律抛。数据层会把它报成 unavailable。 */
class QuotaStore extends MemStore {
  setItem() { throw new Error('QuotaExceededError'); }
}

function clock(start = 1763800000000) {
  let t = start;
  return () => { t += 1000; return t; };
}

const BOTTLE = { name: 'Santal 33', brand: 'Le Labo' };
const OTHER = { name: 'Aventus', brand: 'Creed' };

console.log('\n===== ① 五档清单与文案：逐字对应定版口径 =====');
{
  const tiers = stampTiers();
  ok(tiers.length === 5, '五档（不是提案里的三档）', String(tiers.length));
  ok(tiers.map((t) => t.id).join(',') === STAMP_TIERS.join(','),
    '档位顺序与数据层同源（不从 UI 另抄一份）', tiers.map((t) => t.id).join(','));
  ok(tiers.map((t) => t.zh).join('/') === '一闻钟情/喜欢/还行/无感/劝退',
    '五档中文逐字：一闻钟情 / 喜欢 / 还行 / 无感 / 劝退',
    tiers.map((t) => t.zh).join('/'));

  ok(STAMP_MSG.saved === '已盖章', '盖章提示', STAMP_MSG.saved);
  ok(STAMP_MSG.undone === '已撤销上次盖章', '撤销一枚的提示', STAMP_MSG.undone);
  ok(STAMP_MSG.removed === '已撤销这瓶的盖章', '退光后整条移除的提示', STAMP_MSG.removed);
  ok(STAMP_MSG.full === `盖章记录满了（${STAMP_MAX} 瓶），先撤销一瓶`,
    '满 200 的提示带上限且与常量同源', STAMP_MSG.full);
  ok(STAMP_MSG.unavailable === '本机存储不可用，盖章仅本次有效',
    '降级提示（与心仪 L2 同一条句式，只换动词）', STAMP_MSG.unavailable);

  /* 与心仪 L2 的口径一致性：前缀「本机存储不可用，」+ 后缀「仅本次有效」两边都有 */
  const wishUi = fs.readFileSync(path.join(ROOT, 'src', 'wish-ui.js'), 'utf8');
  ok(STAMP_MSG.unavailable.startsWith('本机存储不可用，')
    && STAMP_MSG.unavailable.endsWith('仅本次有效')
    && /本机存储不可用，收藏仅本次有效/.test(wishUi),
    '降级句与心仪 L2 的首尾逐字一致（两句只差中间的动词）',
    STAMP_MSG.unavailable);
}

console.log('\n===== ② 展示模型：只显示最近一次 + 共 N 次 =====');
{
  const none = stampViewOf(null);
  ok(none.has === false && none.count === 0 && none.countLabel === '' && none.summary === '',
    '没有记录 → 空模型（不编「未盖章」文案，由 UI 决定怎么表达）', JSON.stringify(none));
  ok(none.canUndo === false, '没有记录时不给撤销入口', String(none.canUndo));

  const one = stampViewOf({ key: 'a|b', name: 'A', brand: 'B', log: [{ tier: 'like', t: 1763800000000 }] });
  ok(one.has === true && one.count === 1, '一条记录 → has/count', `${one.has}/${one.count}`);
  ok(one.tier === 'like' && one.tierZh === '喜欢', '最近一次档位', `${one.tier}/${one.tierZh}`);
  ok(one.countLabel === '共 1 次', '计数文案「共 1 次」', one.countLabel);
  ok(/11-/.test(one.dateLabel) || /^\d\d-\d\d$/.test(one.dateLabel),
    '日期标签是 MM-DD', one.dateLabel);
  ok(one.summary.includes('喜欢') && one.summary.includes('共 1 次'),
    '一行摘要含档位与次数', one.summary);

  const many = stampViewOf({
    key: 'a|b', name: 'A', brand: 'B',
    log: [{ tier: 'ok', t: 1763800000000 }, { tier: 'love', t: 1763900000000 }],
  });
  ok(many.count === 2 && many.tier === 'love', '多次记录 → 取**末项**作最近一次',
    `${many.count}/${many.tier}`);
  ok(many.countLabel === '共 2 次' && many.summary.includes('共 2 次'),
    '次数跟着涨（共 2 次）', many.countLabel);
  /* 关键：模型里不许有历史数组 —— 调用方想铺全量也没有数据可铺 */
  ok(!Array.isArray(many.log) && !Array.isArray(many.history) && !Array.isArray(many.records),
    '展示模型**不交出**全量历史数组（任务书第 3 条：不铺全量）',
    Object.keys(many).join(','));
  ok(!('items' in many) && !('rows' in many), '模型里没有任何列表字段');

  /* 坏时间不编 */
  ok(stampDateLabel(0) === '' && stampDateLabel(NaN) === '' && stampDateLabel('x') === '',
    '坏时间 → 空串（UI 那一格不渲染，不写「时间未知」）',
    `${stampDateLabel(0)}/${stampDateLabel(NaN)}`);
}

console.log('\n===== ③ 提示判据顺序：先看成功，再说结果 =====');
{
  ok(stampMessage({ ok: true, status: 'stamped' }) === STAMP_MSG.saved, '盖章成功 → 已盖章');
  ok(stampMessage({ ok: true, status: 'undone' }) === STAMP_MSG.undone, '撤销一枚 → 已撤销上次盖章');
  ok(stampMessage({ ok: true, status: 'removed' }) === STAMP_MSG.removed, '退光 → 已撤销这瓶的盖章');
  ok(stampMessage({ ok: false, status: 'full' }) === STAMP_MSG.full, '满额被拒 → 满额提示');
  /* 满额即使当前未盖也不许说「已撤销」—— 用户刚点的是保存 */
  ok(!stampMessage({ ok: false, status: 'full' }).includes('已撤销'), '满额时不说「已撤销」');
  ok(stampMessage({ ok: true, status: 'stamped', degraded: true })
    === `${STAMP_MSG.saved}（${STAMP_MSG.unavailable}）`,
    '降级时追加「仅本次有效」', stampMessage({ ok: true, status: 'stamped', degraded: true }));
  ok(!stampMessage({ ok: true, status: 'stamped' }).includes('仅本次有效'),
    '没降级时不啰嗦');
}

console.log('\n===== ④ 会话：真存储路径（盖 / 读 / 撤销 / 计数）=====');
{
  const store = new MemStore();
  const s = createStampSession(createStamps(store, { now: clock() }), undefined, store);

  ok('初始没盖过', s.get(BOTTLE) === null && stampViewOf(s.get(BOTTLE)).has === false);

  const a = s.stamp(BOTTLE, 'like');
  ok('盖一枚 → ok 且 degraded=false',
    a.ok === true && a.status === 'stamped' && a.degraded === false, JSON.stringify(a));
  ok('回读同源（读的也是同一个存储）',
    stampViewOf(s.get(BOTTLE)).tier === 'like');

  s.stamp(BOTTLE, 'love');
  ok('再盖一次 → 计数 2、最近一次换成 love',
    stampViewOf(s.get(BOTTLE)).count === 2 && stampViewOf(s.get(BOTTLE)).tier === 'love');

  const u = s.undo(BOTTLE);
  ok('撤销 → undone、degraded=false', u.ok === true && u.status === 'undone' && u.degraded === false,
    JSON.stringify(u));
  ok('撤销后计数回到 1、档位回到 like',
    stampViewOf(s.get(BOTTLE)).count === 1 && stampViewOf(s.get(BOTTLE)).tier === 'like');

  ok('list 按最近盖过在前',
    s.list().length === 1 && s.list()[0].key === s.get(BOTTLE).key);

  s.stamp(OTHER, 'no');
  ok('两瓶各一条', s.list().length === 2, String(s.list().length));

  const cl = s.clear();
  ok('清空 → cleared 且列表空', cl.ok === true && s.list().length === 0, JSON.stringify(cl.status));
  ok('清空只删自己那个键', store.getItem(STAMP_KEY) == null);
}

console.log('\n===== ⑤ 会话：存储不可用 → 内存兜底（不许一半真一半假）=====');
{
  const realStore = new QuotaStore();
  const s = createStampSession(createStamps(realStore, { now: clock() }), undefined, realStore);

  ok('降级前 degraded=false', s.degraded() === false);
  const a = s.stamp(BOTTLE, 'love');
  ok('真存储写不进 → 换成内存介质重做同一次动作（仍然成功）',
    a.ok === true && a.degraded === true, JSON.stringify(a));
  ok('降级后 degraded=true', s.degraded() === true);
  ok('降级后回读读得到（读的也是兜底介质）',
    stampViewOf(s.get(BOTTLE)).tier === 'love');
  ok('降级时真存储里没有盖章键（没偷写磁盘）',
    realStore.getItem(STAMP_KEY) == null, String(realStore.getItem(STAMP_KEY)));

  const u = s.undo(BOTTLE);
  ok('降级下撤销也走兜底介质', u.ok === true && u.degraded === true, JSON.stringify(u));
  ok('降级下撤销确实生效（读到空）', stampViewOf(s.get(BOTTLE)).has === false);

  s.stamp(BOTTLE, 'ok');
  ok('降级下 memoryStore() 给得出一份介质', s.memoryStore() != null);
  const clean = createStampSession(createStamps(new MemStore(), { now: clock() }), undefined, new MemStore());
  ok('没降级时 memoryStore() 返回 null', clean.memoryStore() === null);

  /* 全程不抛：会话层的每一个入口都要能扛住坏存储 */
  ok('降级路径全程不抛', (() => {
    try {
      s.list(); s.get(BOTTLE); s.undo(OTHER); s.clear();
      return true;
    } catch { return false; }
  })());
}

console.log('\n===== ⑥ 会话：内存工厂可注入（测试友好，且写的是同一份 JSON 形状）=====');
{
  const mem = createMemoryStore();
  const s = createStampSession(createStamps(new QuotaStore(), { now: clock() }),
    () => createStamps(mem), new QuotaStore());
  s.stamp(BOTTLE, 'meh');
  const raw = mem.getItem(STAMP_KEY);
  ok('注入的内存介质里存的是同一个键、同一份 JSON', typeof raw === 'string' && raw.includes('"meh"'),
    String(raw).slice(0, 100));
  ok('形状与落盘逐字节同构（四键 + log 两键）',
    Object.keys(JSON.parse(raw)[0]).join(',') === 'key,name,brand,log',
    Object.keys(JSON.parse(raw)[0]).join(','));
}

console.log('\n===== ⑦ 接线守卫：app.js 真的把盖章接在档案的每一瓶上 =====');
{
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

  ok('app.js 引入数据层 src/stamp.js', /from '\.\/src\/stamp\.js'/.test(app));
  ok('app.js 引入 UI 层 src/stamp-ui.js', /from '\.\/src\/stamp-ui\.js'/.test(app));
  /* 介质必须**显式**交给数据层，不能用 src/stamp.js 那个绑 globalThis 的默认实例：
     全站其余存储走 localStorageSafe()（window.localStorage），两条路一旦分叉，
     就会"档案里有这瓶、盖章说没盖过"（本轮实测踩到，见 check-imports 那次同类事故）。 */
  ok('会话由 createStampSession 造，且真存储经 createStamps(() => localStorageSafe()) 显式绑定',
    /createStampSession\(\s*createStamps\(\(\) => localStorageSafe\(\)\)/.test(app)
    && /undefined,\s*\(\) => localStorageSafe\(\),/.test(app),
    (app.match(/const stampSession =[\s\S]{0,220}/) || [''])[0].replace(/\s+/g, ' '));
  ok('没有直接用 src/stamp.js 的默认实例（绑定 globalThis.localStorage 的那个）',
    !/from '\.\/src\/stamp\.js'/.test(app) || !/createStampSession\(stamps\b/.test(app));

  /* 主入口在档案面板的每一瓶（任务书第 2 条） */
  ok('盖章位在档案面板的瓶名行里（stampSlot 在 paintHistoryPanel 内被调用）',
    /function paintHistoryPanel\(/.test(app)
    && /stampSlot\(p, repaintPanel\)/.test(app));
  ok('瓶名行是 .qw-history-name-row（每一瓶一行，不是一个批量入口）',
    /'qw-history-name-row'/.test(app));
  ok('未盖章的入口文案是「试过？盖章」', /试过？盖章/.test(app));

  /* 五档面板：两段式 —— 点入口只开面板，选一档 + 保存才落记录 */
  ok('面板按 stampTiers() 铺五颗章（不另抄档位表）',
    /stampTiers\(\)/.test(app));
  ok('档位是 role=radio + aria-checked 的单选组',
    /role: 'radiogroup'/.test(app) && /'aria-checked'/.test(app));
  ok('没选档时「保存」不可点（单击不等于盖章）',
    /disabled: picked \? null : ''/.test(app));
  ok('保存走 session.stamp（判据不在渲染层）', /stampSession\.stamp\(bottle, picked\)/.test(app));
  ok('提示走 stampMessage（文案与状态同源）', /stampMessage\(res\)/.test(app));

  /* 已盖章状态：最近一次 + 共 N 次 */
  ok('已盖章状态由 stampViewOf 算（显示与存储同源）', /stampViewOf\(stampSession\.get\(bottle\)\)/.test(app));
  ok('chip 上显示「共 N 次」（不是全量列表）', /view\.countLabel/.test(app));
  ok('chip 带 data-stamp-count（计数可被断言与截图核对）',
    /'data-stamp-count': String\(view\.count\)/.test(app));

  /* 撤销 */
  ok('行内与面板里都有撤销（两处都走同一个 session.undo）',
    (app.match(/stampSession\.undo\(bottle\)/g) || []).length >= 2,
    String((app.match(/stampSession\.undo\(bottle\)/g) || []).length));

  /* 三条不作为 */
  ok('盖章**不**调用任何心仪写入（无 wishSession/wishlist 写入点）',
    !/stamp[\s\S]{0,600}wishSession\.(toggle|add)\(/.test(app)
    && !/stampSession\.stamp[\s\S]{0,200}wishSession/.test(app));
  ok('盖章**不**写档案键（不调用 addHistory）',
    !/stampSession[\s\S]{0,400}addHistory/.test(app));
  ok('盖章**不**参与打分（没有把档位传给 recommend）',
    !/recommend\([^)]*stamp/i.test(app) && !/tier[\s\S]{0,80}recommend\(/.test(app));
}

console.log('\n===== ⑧ 数据层与档案层零改动守卫 =====');
{
  const stamp = fs.readFileSync(path.join(ROOT, 'src', 'stamp.js'), 'utf8');
  const hist = fs.readFileSync(path.join(ROOT, 'src', 'history.js'), 'utf8');
  const wish = fs.readFileSync(path.join(ROOT, 'src', 'wishlist.js'), 'utf8');

  ok('数据层不碰 DOM', !/document\.|querySelector|classList|innerHTML/.test(
    stamp.replace(/\/\*[\s\S]*?\*\//g, ' ')));
  ok('数据层没有任何上传路径', !/fetch\(|XMLHttpRequest|sendBeacon/.test(
    stamp.replace(/\/\*[\s\S]*?\*\//g, ' ')));
  ok('数据层不 import UI 层（依赖方向 app → stamp-ui → stamp）',
    !/stamp-ui/.test(stamp.replace(/\/\*[\s\S]*?\*\//g, ' ')));

  /* 档案层的导出面一个都没变（只允许"新增字段/记录另立键"，不许改旧语义） */
  ok('src/history.js 的导出符号仍是原来那一组',
    (hist.match(/^export (const|function) (\w+)/gm) || []).join(',')
      === 'export const HISTORY_KEY,export const HISTORY_MAX,export function entryOf,export function entryLabel,export function makeHistoryRecord,export function readHistory,export function addHistory,export function clearHistory',
    (hist.match(/^export (const|function) (\w+)/gm) || []).join(','));
  ok('src/history.js 的键名与上限未变',
    hist.includes("'scent-picker.history.v1'") && /HISTORY_MAX = 5/.test(hist));
  ok('src/history.js 不再被盖章层改动（没有 tasting/stamp 字样）',
    !/tasting|stamp/i.test(hist));

  /* 心仪 L1 的三键白名单与导出面不动 */
  ok('src/wishlist.js 的三键白名单仍是 id,savedAt,reason',
    /const ITEM_FIELDS = \['id', 'savedAt', 'reason'\]/.test(wish));
  ok('src/wishlist.js 的键名未变',
    wish.includes("'sp_wishlist_v1'") && wish.includes("'sp_wishlist_owned_v1'"));
  ok('src/wishlist.js 里没有 tasting/stamp 字样（本腿没碰它）',
    !/tasting|stamp/i.test(wish));
}

console.log('\n===== ⑨ 产物守卫：styles.css 与构建脚本 =====');
{
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const src = fs.readFileSync(path.join(ROOT, 'styles', 'src', '100-stamp.css'), 'utf8');

  ok('styles.css 里有 .qw-stamp-slot 规则', /\.qw-stamp-slot/.test(css));
  ok('styles.css 里有 .qw-stamp-open 规则', /\.qw-stamp-open/.test(css));
  ok('styles.css 里有 .qw-stamp-chip 规则', /\.qw-stamp-chip/.test(css));
  ok('styles.css 里有 .qw-stamp-tier 规则与选中态', /\.qw-stamp-tier/.test(css)
    && /\.qw-stamp-tier\.is-picked/.test(css));
  ok('styles.css 里有 .qw-history-name-row 规则', /\.qw-history-name-row/.test(css));

  /* 触控 44px：五颗章与两枚状态入口都要过 */
  const must44 = ['.qw-stamp-open', '.qw-stamp-chip', '.qw-stamp-tier', '.qw-stamp-save'];
  const short = must44.filter((sel) => {
    const at = src.indexOf(sel + ' {');
    if (at < 0) return true;
    const body = src.slice(at, src.indexOf('}', at));
    return !/min-height:\s*44px/.test(body) && !/height:\s*44px/.test(body);
  });
  ok('入口/chip/五档章/保存键都 ≥44px 命中框', short.length === 0, short.join(','));

  ok('提示条与面板不挡操作（面板不是 fixed 遮罩）',
    !/\.qw-stamp-panel\s*\{[^}]*position:\s*fixed/.test(src));

  /* 字号下限 12px（test-contrast 的同一道门，这里提前拦） */
  const sizes = [...src.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => parseFloat(m[1]));
  ok('本层所有字号 ≥ 12px', sizes.every((n) => n >= 12), sizes.join(','));

  /* 零硬编码色值：全部走 token，所以 test-contrast 不需要为新组件放宽 */
  const hexes = [...src.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  ok('本层不新增硬编码色值（全走 token）', hexes.length === 0, hexes.join(','));

  /* 焦点环：每个可交互件都要有 */
  const focusables = ['.qw-stamp-open', '.qw-stamp-chip', '.qw-stamp-tier'];
  const noFocus = focusables.filter((sel) => !src.includes(`${sel}:focus-visible`));
  ok('三个可交互件都有 :focus-visible 蓝环', noFocus.length === 0, noFocus.join(','));

  /* 构建脚本要收这一层，否则再跑一次 build-css 就把它丢了 */
  const build = fs.readFileSync(path.join(ROOT, 'scripts', 'build-css.mjs'), 'utf8');
  ok('build-css 的 PARTS 里收了 100-stamp.css', /'100-stamp\.css'/.test(build));
  ok('100 层排在 99-wishlist 之后（顺序即语义）',
    build.indexOf("'100-stamp.css'") > build.indexOf("'99-wishlist.css'"),
    `${build.indexOf("'99-wishlist.css'")} → ${build.indexOf("'100-stamp.css'")}`);
}

console.log('\n===== 试香盖章 UI 层测试 =====');
console.log(`PASS ${pass}  FAIL ${fails.length}`);
if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exitCode = 1;
}
