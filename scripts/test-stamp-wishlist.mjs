/**
 * test-stamp-wishlist.mjs — 心仪清单行盖章入口的守门测试（2026-11-23）
 *
 * 这一腿补的是 L3 时欠下的第 4 项：清单每行一个盖章入口。它**不是**
 * 第二份盖章实现 —— 面板、五档、chip、撤销、降级全走 src/stamp.js 与
 * src/stamp-ui.js 那一份，清单行只是换了个挂载点。所以这套测试守的也是
 * 三件跟"同源"有关的事：
 *
 *   ① **同一个身份键**：清单行只有 name/brand（来自 data/perfumes.json），
 *      档案每瓶也只有 name/brand —— 两处算出的键必须逐字相等，
 *      否则"同一瓶"在清单里盖的章，档案里永远读不到。
 *   ② **同一条记录**：一份存储、两个读取侧。这一侧盖章、那一侧立刻读到；
 *      这一侧撤销、那一侧立刻没有。不做任何同步逻辑（同步逻辑就是分叉的开始）。
 *   ③ **只有一份实现**：源码守卫正面钉住 app.js 里只有一个 stampPanel /
 *      一个 stampSlot，且清单行调的是同一个 stampSlot（surface='wish'）。
 *      这条守卫存在的意义：一旦有人"顺手复制一份到清单页"，档位文案、
 *      撤销语义、降级提示就会各自演化，用户在两个页面看到两套口径。
 *
 * 渲染结构（chip 长什么样、点开是不是一行五颗）在 scripts/test-render.mjs
 * 的「清单行盖章入口」段用 DOM 桩验；数据层语义在 test-stamp.mjs。
 *
 * 用法：node scripts/test-stamp-wishlist.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STAMP_KEY, STAMP_MAX, STAMP_TIERS, STAMP_TIER_ZH, createStamps, stampKeyOf,
} from '../src/stamp.js';
import { createStampSession, stampViewOf, createMemoryStore } from '../src/stamp-ui.js';
import { WISHLIST_ITEM_FIELDS, WISHLIST_MAX } from '../src/wishlist.js';
import { wishRowOf, perfumeIndex } from '../src/wish-page.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
const fails = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + name); } else {
    fails.push(name);
    console.log('  ✗ ' + name + (detail ? ' :: ' + detail : ''));
  }
};

class MemStore {
  constructor(seed = {}) { this.map = new Map(Object.entries(seed)); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}
class QuotaStore extends MemStore {
  setItem() { throw new Error('QuotaExceededError'); }
}
function clock(start = 1763900000000) {
  let t = start;
  return () => { t += 60000; return t; };
}

/* 夹具：清单行与档案行是**同一瓶**的两种说法 —— 一条来自香水库（清单侧
   按 id 现查），一条来自档案快照（只有 name/brand）。大小写与空白刻意写得
   不一样，因为真实世界里它们本来就不一样（档案存的是当年推荐时的写法）。 */
const PERFUMES = {
  meta: { source: 'fixture' },
  perfumes: [
    { id: 'creed-aventus', brand: 'Creed', name: 'Aventus' },
    { id: 'diptyque-philosykos-parfum', brand: 'Diptyque', name: 'Philosykos' },
    { id: 'unpriced-mystery', brand: 'Mystery', name: 'Ghost Bottle' },
  ],
};
const WISH_ITEM = { id: 'creed-aventus', savedAt: 1763800000000, reason: '冬天穿得住' };
const ARCHIVE_BOTTLE = { name: 'Aventus', brand: 'Creed' };

console.log('\n===== ① 身份键同源：清单行与档案行算出同一个键 =====');
{
  const row = wishRowOf(WISH_ITEM, { perfumes: perfumeIndex(PERFUMES) });
  ok('清单行拿到 name/brand（盖章只需要这两项）',
    row.name === 'Aventus' && row.brand === 'Creed', `${row.name}/${row.brand}`);

  const fromWish = stampKeyOf({ name: row.name, brand: row.brand });
  const fromArchive = stampKeyOf(ARCHIVE_BOTTLE);
  ok('清单侧与档案侧的键逐字相等（同一瓶就是同一瓶）',
    fromWish === fromArchive && fromWish === 'aventus|creed', `${fromWish} vs ${fromArchive}`);

  /* 归一化是数据层的既有口径（NFKC + 小写 + 空白归一），这里只确认
     清单侧不需要另做一遍 —— 它把原始写法交给 stampKeyOf 就够了。 */
  ok('写法差异（全角/多余空白/大写）仍落到同一个键',
    stampKeyOf({ name: '  ＡＶＥＮＴＵＳ ', brand: 'c r e e d' })
    === stampKeyOf({ name: 'aventus', brand: 'c r e e d' }),
    `${stampKeyOf({ name: '  ＡＶＥＮＴＵＳ ', brand: 'c r e e d' })}`);

  /* 数据里查不到这瓶时 wishRowOf 把 name 退成 id —— 那不是瓶名，
     拿它盖章就是一条谁也读不到的孤立记录。app.js 因此不渲染入口，
     这里守的是"判据存在且可判"：missing 为真。 */
  const missing = wishRowOf({ id: 'ghost-id', savedAt: 1, reason: '' }, { perfumes: perfumeIndex(PERFUMES) });
  ok('查不到的瓶子 missing=true（所以清单行不给盖章入口，不写脏记录）',
    missing.missing === true && missing.name === 'ghost-id', `${missing.missing}/${missing.name}`);
  ok('查不到的瓶子若强行盖章会得到 id| 这种键（正是要避免的形态）',
    stampKeyOf({ name: missing.name, brand: missing.brand }) === 'ghost-id|',
    stampKeyOf({ name: missing.name, brand: missing.brand }));
}

console.log('\n===== ② 同一条记录：一侧盖、另一侧立刻读到 =====');
{
  const store = new MemStore();
  const stamps = createStamps(store, { now: clock() });
  const session = createStampSession(stamps, undefined, store);

  const wishBottle = { name: 'Aventus', brand: 'Creed' };
  const archiveBottle = ARCHIVE_BOTTLE;

  ok('初始两侧都读不到', stampViewOf(session.get(wishBottle)).has === false
    && stampViewOf(session.get(archiveBottle)).has === false);

  const a = session.stamp(wishBottle, 'like');
  ok('清单侧盖章成功', a.ok === true && a.status === 'stamped', JSON.stringify(a));

  const viaArchive = stampViewOf(session.get(archiveBottle));
  ok('档案侧立刻读到同一条记录（档位/次数都一致）',
    viaArchive.has === true && viaArchive.tier === 'like' && viaArchive.count === 1,
    JSON.stringify({ tier: viaArchive.tier, count: viaArchive.count }));

  ok('存储里只有一条记录（不是两瓶各一条）',
    JSON.parse(store.getItem(STAMP_KEY)).length === 1,
    String(store.getItem(STAMP_KEY)).slice(0, 120));

  /* 反向：档案侧再盖一次，清单侧读到的是"共 2 次"——
     这就是任务书要的"两处读到的是同一条记录"，而不是两份副本。 */
  session.stamp(archiveBottle, 'love');
  const viaWish = stampViewOf(session.get(wishBottle));
  ok('档案侧再盖一次 → 清单侧读到共 2 次、最近一次换成 love',
    viaWish.count === 2 && viaWish.tier === 'love', `${viaWish.count}/${viaWish.tier}`);

  /* 撤销也一样跨侧：清单侧撤销，档案侧回到上一次的真实档位。 */
  session.undo(wishBottle);
  const afterUndo = stampViewOf(session.get(archiveBottle));
  ok('清单侧撤销 → 档案侧退回「喜欢」「共 1 次」',
    afterUndo.count === 1 && afterUndo.tier === 'like', `${afterUndo.count}/${afterUndo.tier}`);

  session.undo(archiveBottle);
  ok('再撤销 → 两侧同步消失（记录整条移除，不留空壳）',
    stampViewOf(session.get(wishBottle)).has === false
    && stampViewOf(session.get(archiveBottle)).has === false
    && JSON.parse(store.getItem(STAMP_KEY)).length === 0,
    String(store.getItem(STAMP_KEY)));
}

console.log('\n===== ③ 降级时两侧仍读同一份介质（不会一半真一半假）=====');
{
  const dead = new QuotaStore();
  const session = createStampSession(createStamps(dead, { now: clock() }), undefined, dead);
  const res = session.stamp({ name: 'Aventus', brand: 'Creed' }, 'ok');
  ok('真存储写不进 → 换内存介质重做（仍然成功）', res.ok === true && res.degraded === true,
    JSON.stringify(res));
  ok('降级下档案侧也读得到同一条（get 也走兜底介质）',
    stampViewOf(session.get(ARCHIVE_BOTTLE)).tier === 'ok');
  ok('降级时没有偷写磁盘', dead.getItem(STAMP_KEY) == null, String(dead.getItem(STAMP_KEY)));
  session.undo(ARCHIVE_BOTTLE);
  ok('降级下档案侧撤销 → 清单侧同步消失',
    stampViewOf(session.get({ name: 'Aventus', brand: 'Creed' })).has === false);
}

console.log('\n===== ④ 上限与五档口径未因新入口改变 =====');
{
  const store = new MemStore();
  const s = createStampSession(createStamps(store, { now: clock() }), undefined, store);
  /* 灌到上限：清单行的入口不该有任何"清单最多 50 所以盖章也最多 50"的暗示 ——
     盖章上限是 200（数据层 STAMP_MAX），与清单上限是两个数。 */
  for (let i = 0; i < STAMP_MAX; i++) s.stamp({ name: `Bottle ${i}`, brand: 'X' }, 'ok');
  const over = s.stamp({ name: 'One More', brand: 'X' }, 'like');
  ok(`满 ${STAMP_MAX} 瓶后拒绝新瓶（与清单上限 ${WISHLIST_MAX} 互不相干）`,
    over.ok === false && over.status === 'full' && STAMP_MAX !== WISHLIST_MAX,
    JSON.stringify({ status: over.status, stampMax: STAMP_MAX, wishMax: WISHLIST_MAX }));

  const again = s.stamp({ name: 'Bottle 3', brand: 'X' }, 'love');
  ok('已存在的那瓶满额时仍可再盖（上限只管新瓶）',
    again.ok === true && stampViewOf(s.get({ name: 'Bottle 3', brand: 'X' })).count === 2,
    JSON.stringify({ ok: again.ok, status: again.status }));

  ok('五档顺序与文案仍是本体那一份（清单行没另定义）',
    STAMP_TIERS.join(',') === 'love,like,ok,meh,no'
    && STAMP_TIER_ZH.love === '一闻钟情' && STAMP_TIER_ZH.no === '劝退');
  ok('键名仍是 scent-picker.tasting.v1（清单侧不另立键）',
    STAMP_KEY === 'scent-picker.tasting.v1' && store.getItem('scent-picker.tasting.v1') != null);
}

console.log('\n===== ⑤ 接线守卫：清单行用的是**同一枚** stampSlot =====');
{
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const count = (re) => (app.match(re) || []).length;

  ok('app.js 里只有一个五档面板实现（function stampPanel）',
    count(/function stampPanel\(/g) === 1, String(count(/function stampPanel\(/g)));
  ok('app.js 里只有一个盖章位实现（function stampSlot）',
    count(/function stampSlot\(/g) === 1, String(count(/function stampSlot\(/g)));
  ok('五颗章的渲染只出现一次（.qw-stamp-tier 只铸一次）',
    count(/'qw-stamp-tier'/g) === 1, String(count(/'qw-stamp-tier'/g)));
  ok('保存动作只有一处（stampSession.stamp 只在面板里调）',
    count(/stampSession\.stamp\(/g) === 1, String(count(/stampSession\.stamp\(/g)));

  ok('清单行调用的是 stampSlot（不是另抄一份 JSX/DOM）',
    /stampSlot\(\{ name: row\.name, brand: row\.brand \}/.test(app));
  ok('清单行标了 surface=wish（同一枚组件、两个挂载点）',
    /stampSlot\(\{ name: row\.name, brand: row\.brand \}[\s\S]{0,80}surface: 'wish'/.test(app));
  ok('surface 只影响身份标记，不改行为（data-stamp-surface）',
    /'data-stamp-surface': surface/.test(app)
    && /opts\.surface === 'wish' \? 'wish' : 'archive'/.test(app));

  /* 数据里查不到的瓶子不给入口 —— 否则会用 id 当瓶名写出一条孤立记录。 */
  ok('查不到的瓶子不渲染盖章入口（row.missing 短路）',
    /if \(!row\.missing\) \{[\s\S]{0,200}stampSlot\(/.test(app));

  /* 盖章位单独一行：塞进瓶名行会把「标记已入手」挤到第二行（390 实测）。 */
  ok('盖章位单独一行（.qw-wl-stamp-row），不挤进瓶名行',
    /class: 'qw-wl-stamp-row'/.test(app));

  /* 清单行盖章后重画要保住滚动位置（与移除/已入手同一条路） */
  ok('清单侧盖章后的重画保留滚动位置',
    /const repaintKeepScroll = \(\) => \{[\s\S]{0,120}WISH_SCROLL = pageScrollY\(\);[\s\S]{0,60}repaint\(\);/.test(app));

  /* 三条不作为仍然成立：清单里盖章不许顺手改心仪、不许写档案、不许参与打分 */
  ok('清单行盖章不调用任何心仪写入',
    !/stampSlot[\s\S]{0,400}wishSession\.(toggle|toggleOwned)\(/.test(app));
  ok('清单行盖章不写档案键（不调用 addHistory）',
    !/stampSlot[\s\S]{0,400}addHistory/.test(app));
}

console.log('\n===== ⑥ 数据层零改动：stamp.js / wishlist.js 的导出面原样 =====');
{
  const stamp = fs.readFileSync(path.join(ROOT, 'src', 'stamp.js'), 'utf8');
  const wl = fs.readFileSync(path.join(ROOT, 'src', 'wishlist.js'), 'utf8');

  ok('stamp.js 导出符号与本体验收时一致',
    (stamp.match(/^export (const|function) (\w+)/gm) || []).join(',')
      === 'export const STAMP_KEY,export const STAMP_MAX,export const STAMP_NAME_MAX,export const STAMP_BRAND_MAX,export const STAMP_TIERS,export const STAMP_TIER_ZH,export const STAMP_ITEM_FIELDS,export const STAMP_LOG_FIELDS,export function stampKeyOf,export function tierZhOf,export function createStamps,export const stamps,export const list,export const get,export const stamp,export const undo,export const clear',
    (stamp.match(/^export (const|function) (\w+)/gm) || []).join(','));

  ok('stamp.js 里没有为清单新增的分支（无 wish 字样）', !/wish/i.test(stamp));
  ok('wishlist.js 三键白名单仍是 id,savedAt,reason',
    WISHLIST_ITEM_FIELDS.join(',') === 'id,savedAt,reason');
  ok('wishlist.js 里没有 tasting/stamp 字样（本腿没碰它）', !/tasting|stamp/i.test(wl));
  ok('wish-page.js 不 import 盖章层（判据层不反向依赖 UI）',
    !/stamp/i.test(fs.readFileSync(path.join(ROOT, 'src', 'wish-page.js'), 'utf8')));
}

console.log('\n===== ⑦ 产物守卫：清单行的盖章样式真的在 styles.css 里 =====');
{
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const src = fs.readFileSync(path.join(ROOT, 'styles', 'src', '100-stamp.css'), 'utf8');
  const build = fs.readFileSync(path.join(ROOT, 'scripts', 'build-css.mjs'), 'utf8');

  ok('styles.css 有 .qw-wl-stamp-row（清单侧盖章位独占一行）',
    /\.qw-wl-stamp-row\s*\{/.test(css));
  ok('styles.css 有 .qw-wl-stamp-row .qw-stamp-panel（清单行不留负边距）',
    /\.qw-wl-stamp-row\s+\.qw-stamp-panel/.test(css));
  /* 负边距归零这条是实测踩到的：档案那套 -12px 在清单行里会把面板顶出容器。
     守卫只看"归零"这件事写在清单侧，不去禁档案侧那份。 */
  ok('清单侧把面板负边距归零（否则 390 下顶出容器）',
    /\.qw-wl-stamp-row\s+\.qw-stamp-panel\s*\{[^}]*margin-left:\s*0[^}]*margin-right:\s*0/.test(src),
    '缺 margin-left/right: 0');
  ok('清单侧放开 chip 摘要的宽度（「共 N 次」不许被省略号吃掉）',
    /\.qw-wl-stamp-row\s+\.qw-stamp-sum\s*\{[^}]*max-width:\s*none/.test(src));

  /* 新增段落同样零硬编码色值、字号不低于 12px —— 与 100 层其余部分同一条门 */
  const seg = src.slice(src.indexOf('心仪清单行内的盖章位'));
  const hexes = [...seg.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  ok('新增段落零硬编码色值（全走 token）', hexes.length === 0, hexes.join(','));
  ok('新增段落没有新增字号（只调间距与宽度）', !/font-size:/.test(seg));

  ok('build-css 仍收 100-stamp.css 且排在 99 之后',
    /'100-stamp\.css'/.test(build) && build.indexOf("'100-stamp.css'") > build.indexOf("'99-wishlist.css'"));
}

console.log('\n===== 心仪清单行盖章入口测试 =====');
console.log(`PASS ${pass}  FAIL ${fails.length}`);
if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exitCode = 1;
}
