/**
 * test-wishlist-page.mjs — 心仪清单 L3「清单页本体」的守门测试
 *
 * 两层，与 L2 那套同构：
 *   ① 纯逻辑（src/wish-page.js）：一行该显示什么、没有数据时显示什么、
 *      三条状态（空 / 满 50 / 降级）怎么判、撤销与清空的状态机；
 *   ② 接线与产物守卫：app.js 真的把它接上了、styles.css 里有对应规则、
 *      L1 数据层仍然零改动。
 *
 * 为什么这一套不 import app.js 渲染清单页：清单页的 DOM 走的是 render()，
 * 拉起它要整套问卷桩（见 test-render.mjs）。这里要守的是**判据**：
 * 「没有价格就不显示价格」「查不到这瓶也要出行」这类事情，
 * 用一份手写夹具直接喂给纯函数，能一格一格验，也比渲染快一个量级。
 *
 * 用法：node scripts/test-wishlist-page.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WISHLIST_MAX, WISHLIST_ITEM_FIELDS, createWishlist } from '../src/wishlist.js';
import { createWishSession, createMemoryStore } from '../src/wish-ui.js';
import {
  WISH_PAGE_MSG, savedLabel, priceBandOf, priceLabelOf, perfumeIndex,
  wishRowOf, wishListModel, nextClearState, removableOf,
  CLEAR_LABEL, CLEAR_ARM_LABEL,
} from '../src/wish-page.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
const fails = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + name); } else {
    fails.push(name);
    console.log('  ✗ ' + name + (detail ? ' :: ' + detail : ''));
  }
};

/* ---------- 内存存储（与另两套同形） ---------- */
class MemStore {
  constructor(seed = {}) { this.map = new Map(Object.entries(seed)); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}
class QuotaStore extends MemStore {
  setItem() { throw new Error('QuotaExceededError'); }
}
function clock(start = 1763600000000) {
  let t = start;
  return () => { t += 60000; return t; };
}

/* ---------- 夹具：真实数据结构的最小切片 ----------
   刻意用**真的** price-bands 形状（bandOfId 是"带 → 瓶子们"的反向索引），
   而不是我顺手写一份"瓶子 → 带"的舒服形状 —— 夹具要是比真数据舒服，
   测试就测不到"索引方向搞反了"这个最容易犯的错。 */
const PERFUMES = {
  meta: { source: 'fixture' },
  perfumes: [
    {
      id: 'priced-a', brand: 'Armaf', name: 'Yum Yum', concentrationLabelZh: '淡香精 EDP',
      top: ['Cherry'], heart: ['Vanilla'], base: ['Musk'], families: { floral: 1 },
    },
    { id: 'priced-b', brand: 'Byredo', name: 'Super Cedar', top: [], heart: [], base: [], families: { woody: 1 } },
    /* 没有价格数据的那一瓶（真实库里 766/1388 都是这种） */
    { id: 'unpriced-c', brand: 'Diptyque', name: 'Philosykos', top: [], heart: [], base: [], families: { woody: 1 } },
  ],
};
const PRICE_INDEX = {
  bands: [
    { id: 'under300', zh: '300 元以内', lo: 0, hi: 300 },
    { id: 'b600-1200', zh: '600–1200 元', lo: 600, hi: 1200 },
  ],
  anyId: 'any',
  /* 反向索引：带 → 瓶子们。priced-a 在 600–1200，priced-b 在 300 内。 */
  bandOfId: {
    under300: ['priced-b', 'some-other-id'],
    'b600-1200': ['priced-a'],
    over1200: [],
  },
};

const ITEMS = [
  { id: 'priced-a', savedAt: 1763600000000 + 5000, reason: '主体就是柑橘调，底下垫着木质调' },
  { id: 'priced-b', savedAt: 1763600000000 + 3000, reason: '' },
  /* 不在香水库里的 id：模拟"存过但那瓶后来下架/改名" */
  { id: 'gone-x', savedAt: 1763600000000 + 1000, reason: '当时觉得像雨后的树皮' },
];

console.log('\n===== ① 行的五要素：图 / 名 / 理由 / 价格 / 链接 =====');
{
  const perfumes = perfumeIndex(PERFUMES);
  const links = [{ href: 'https://example.test/a', kind: 'direct', platform: 'taobao', label: '去淘宝买这一瓶 ↗' }];

  const row = wishRowOf(ITEMS[0], {
    perfumes,
    priceIndex: PRICE_INDEX,
    photos: { 'priced-a': 'images/priced-a.webp' },
    owned: new Set(['priced-a']),
    links,
  });

  ok('品名取自现有数据（不冗余存在清单里）', row.name === 'Yum Yum', row.name);
  ok('品牌取自现有数据', row.brand === 'Armaf', row.brand);
  ok('有照片就用照片', row.photo === 'images/priced-a.webp', String(row.photo));
  ok('理由原样展示（是 L2 存下的那一句，不重算）',
    row.reason === '主体就是柑橘调，底下垫着木质调', row.reason);
  ok('价格带标「参考价」', row.price === '参考价 600–1200 元', String(row.price));
  ok('购买链接有就带上（含 kind 供 UI 判 sponsored）',
    row.buy.length === 1 && row.buy[0].kind === 'direct');
  ok('已入手标记读出来了', row.owned === true);
  ok('这一瓶在数据里，missing 为假', row.missing === false);
  ok('日期标签写「最近存入」（不写「存入日期」）',
    /^最近存入 \d{2}-\d{2}$/.test(row.savedAtLabel), row.savedAtLabel);
}

console.log('\n===== ② 没数据就不显示 —— 不许编 =====');
{
  const perfumes = perfumeIndex(PERFUMES);

  /* 没有价格数据：price 必须是 null，UI 才整格不渲染。 */
  const noPrice = wishRowOf(ITEMS[1 - 1 + 2], { perfumes, priceIndex: PRICE_INDEX, photos: null, owned: null, links: [] });
  ok('香水库里查不到这瓶时 price 为 null（不编"价格未知"）', noPrice.price === null, String(noPrice.price));

  const unpriced = wishRowOf({ id: 'unpriced-c', savedAt: 1, reason: 'x' }, {
    perfumes, priceIndex: PRICE_INDEX, photos: null, owned: null, links: [],
  });
  ok('有这瓶但价格表里没有 → 仍是不显示价格', unpriced.price === null, String(unpriced.price));
  ok('价格表里没有时也不影响其它字段（名字照常）', unpriced.name === 'Philosykos', unpriced.name);

  const noLink = wishRowOf(ITEMS[0], { perfumes, priceIndex: PRICE_INDEX, photos: null, owned: null, links: [] });
  ok('没有现成链接时 buy 是空数组（不拼搜索页兜底）',
    Array.isArray(noLink.buy) && noLink.buy.length === 0, JSON.stringify(noLink.buy));

  const noPhoto = wishRowOf(ITEMS[0], { perfumes, priceIndex: PRICE_INDEX, photos: null, owned: null, links: [] });
  ok('没有照片时 photo 为 null（由 UI 画瓶形，不塞占位图路径）', noPhoto.photo === null);

  /* 理由为空就是空串 —— UI 那一格不渲染，不补「暂无理由」 */
  const noReason = wishRowOf(ITEMS[1], { perfumes, priceIndex: PRICE_INDEX, photos: null, owned: null, links: [] });
  ok('没存理由时是空串（不补「暂无」这类话）', noReason.reason === '', JSON.stringify(noReason.reason));
}

console.log('\n===== ③ 查不到这瓶也要出行（不丢条目） =====');
{
  const perfumes = perfumeIndex(PERFUMES);
  const gone = wishRowOf(ITEMS[2], {
    perfumes, priceIndex: PRICE_INDEX, photos: null, owned: null, links: [],
  });
  ok('数据里查不到的 id 仍然产出这一行', !!gone && gone.id === 'gone-x', JSON.stringify(gone && gone.id));
  ok('名字退回 id 本身（不用「未知香水」这类占位词）', gone.name === 'gone-x', gone.name);
  ok('missing 标为真，供 UI 决定要不要提示', gone.missing === true);
  ok('理由仍然展示（那是用户自己存的，与数据侧无关）',
    gone.reason === '当时觉得像雨后的树皮', gone.reason);
  ok('查不到时不编品牌（空串）', gone.brand === '', JSON.stringify(gone.brand));
}

console.log('\n===== ④ 价格带的索引方向：反向索引用对了没 =====');
{
  ok('priced-a 落在 600–1200', priceBandOf('priced-a', PRICE_INDEX).zh === '600–1200 元',
    String(priceBandOf('priced-a', PRICE_INDEX)));
  ok('priced-b 落在 300 以内', priceBandOf('priced-b', PRICE_INDEX).zh === '300 元以内',
    String(priceBandOf('priced-b', PRICE_INDEX)));
  ok('完 bandOfId 里没有的 id → null', priceBandOf('nope', PRICE_INDEX) === null);
  ok('价格索引本身缺失 → null，不抛', priceBandOf('priced-a', null) === null && priceBandOf('priced-a', undefined) === null);
  ok('价格索引形状坏掉（bandOfId 是数组）→ null，不抛',
    priceBandOf('priced-a', { bands: [], bandOfId: [] }) === null);
  ok('priceLabelOf 对没价格的返回 null（不是「参考价 」空壳）',
    priceLabelOf('nope', PRICE_INDEX) === null);
  ok('空 id → null', priceBandOf('', PRICE_INDEX) === null && priceBandOf(null, PRICE_INDEX) === null);

  /* 真实数据抽查：data/price-bands.json 里确实有这瓶（不是我自己编的夹具） */
  const real = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/price-bands.json'), 'utf8'));
  const realBand = priceBandOf('acqua-di-parma-fico-di-amalfi', real);
  ok('真实数据：fico-di-amalfi 查得出价位带', !!realBand && /元/.test(realBand.zh),
    String(realBand && realBand.zh));
  ok('真实数据：随便一个不在表里的 id 查不出价位带',
    priceBandOf('definitely-not-a-perfume-id', real) === null);
  /* 统计口径与 price-bands 自己的 stats 对齐 —— 反向索引没漏掉条目 */
  const idxMap = perfumeIndex(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8')));
  const priced = [...idxMap.keys()].filter((id) => priceBandOf(id, real) !== null).length;
  ok(`真实数据：能查到价位带的瓶数 = price-bands.stats.priced（${real.stats.priced}）`,
    priced === real.stats.priced, String(priced));
}

console.log('\n===== ⑤ 整页模型：空态 / 满 50 / 降级 =====');
{
  const perfumes = perfumeIndex(PERFUMES);

  const empty = wishListModel([], { perfumes, priceIndex: PRICE_INDEX, photos: null, owned: null });
  ok('空清单 → empty 为真', empty.empty === true);
  ok('空清单 → 0 行（不塞占位行）', empty.rows.length === 0);
  ok('空清单 → 不是满额', empty.full === false);
  ok('空清单有引导文案（不白屏）', WISH_PAGE_MSG.emptyTitle.length > 0 && WISH_PAGE_MSG.emptyHint.length > 0);
  ok('空态引导里有回结果页的动作', /→/.test(WISH_PAGE_MSG.emptyCta), WISH_PAGE_MSG.emptyCta);

  const model = wishListModel(ITEMS, { perfumes, priceIndex: PRICE_INDEX, photos: null, owned: new Set(['priced-b']) });
  ok('三行都在（含查不到的那瓶）', model.rows.length === 3, String(model.rows.length));
  ok('count 与 rows 同源', model.count === model.rows.length);
  ok('已入手标记只落在被标记的那行',
    model.rows.filter((r) => r.owned).map((r) => r.id).join(',') === 'priced-b',
    model.rows.filter((r) => r.owned).map((r) => r.id).join(','));
  ok('顺序沿用传入顺序（L1 已按 savedAt 倒序，这里不重排）',
    model.rows.map((r) => r.id).join(',') === 'priced-a,priced-b,gone-x',
    model.rows.map((r) => r.id).join(','));

  /* 满 50：与 L2 同一句口径、同一个常量 */
  const many = Array.from({ length: WISHLIST_MAX }, (_, i) => ({ id: 'm' + i, savedAt: 1000 + i, reason: '' }));
  const full = wishListModel(many, { perfumes, priceIndex: PRICE_INDEX, photos: null, owned: null });
  ok(`满 ${WISHLIST_MAX} 行 → full 为真`, full.full === true, String(full.count));
  ok('满额提示与 L2 同一句（含上限数字）',
    WISH_PAGE_MSG.full === `清单满了（${WISHLIST_MAX} 瓶），先移除一瓶`, WISH_PAGE_MSG.full);
  ok('差一瓶时不算满（不满额不提"满了"）',
    wishListModel(many.slice(0, WISHLIST_MAX - 1), { perfumes, priceIndex: PRICE_INDEX, photos: null, owned: null }).full === false);

  /* 降级是**独立**判据：与行数无关 */
  const deg = wishListModel([], { perfumes, priceIndex: PRICE_INDEX, photos: null, owned: null, degraded: true });
  ok('降级 + 空清单：两个状态同时成立（不互相覆盖）', deg.degraded === true && deg.empty === true);
  ok('降级提示沿用 L2 已定的那句，逐字一致',
    WISH_PAGE_MSG.unavailable === '本机存储不可用，收藏仅本次有效', WISH_PAGE_MSG.unavailable);
  ok('没降级时 degraded 为假',
    wishListModel(ITEMS, { perfumes, priceIndex: PRICE_INDEX, photos: null, owned: null }).degraded === false);
}

console.log('\n===== ⑥ linksOf 适配器：抛错不许把整页带崩 =====');
{
  const perfumes = perfumeIndex(PERFUMES);
  const m = wishListModel(ITEMS, {
    perfumes,
    priceIndex: PRICE_INDEX,
    photos: null,
    owned: null,
    linksOf: () => { throw new Error('affiliate config exploded'); },
  });
  ok('linksOf 抛错时整页照常出行', m.rows.length === 3, String(m.rows.length));
  ok('抛错的那行没有购买键（而不是整页白屏）', m.rows.every((r) => r.buy.length === 0));

  const withLinks = wishListModel(ITEMS.slice(0, 1), {
    perfumes,
    priceIndex: PRICE_INDEX,
    photos: null,
    owned: null,
    linksOf: (id, p) => (p ? [{ href: 'https://example.test/' + id, kind: 'search', platform: 'jd' }] : []),
  });
  ok('linksOf 拿到 (id, perfume) 两个参数（可按瓶拼链接）',
    withLinks.rows[0].buy.length === 1 && withLinks.rows[0].buy[0].href === 'https://example.test/priced-a',
    JSON.stringify(withLinks.rows[0].buy));
}

console.log('\n===== ⑦ 清空两段式 / 移除撤销：状态机 =====');
{
  const a = nextClearState({ armed: false });
  ok('第一次点清空 → 进入确认态，不执行', a.armed === true && a.changed === false);
  ok('确认态文案是「再点一次确认清空」', a.label === CLEAR_ARM_LABEL && CLEAR_ARM_LABEL === '再点一次确认清空', a.label);
  const b = nextClearState({ armed: true });
  ok('第二次点 → 真的清空', b.armed === false && b.changed === true);
  ok('清空后文案回到「清空清单」', b.label === CLEAR_LABEL && CLEAR_LABEL === '清空清单', b.label);
  ok('空参数不抛，按未确认态处理', nextClearState(null).armed === true);

  const rm = removableOf({ id: 'x1', savedAt: 1763600000000, reason: '理由' });
  ok('移除时留下原条目（撤销要原样写回）',
    rm && rm.id === 'x1' && rm.item.savedAt === 1763600000000 && rm.item.reason === '理由',
    JSON.stringify(rm));
  ok('没有 id 的条目返回 null（不给撤销一个空动作）', removableOf({ savedAt: 1 }) === null);

  /* ==== 真缺陷的守卫（2026-11-23 实测踩到）====
     清单行的**展示模型**里时间字段叫 savedAtLabel（"最近存入 11-23"），
     没有 savedAt。直接把展示模型当条目交给撤销，写回的 savedAt 就是
     undefined → 落成 0 → 那一瓶掉到清单最末。用户点了撤销、瓶子回来了
     却换了位置 —— 比不给撤销更让人怀疑数据。
     这条断言钉住"展示模型进来时 savedAt 是 0 而不是一个假的当前时间"，
     再配合下面那条端到端断言（原条目进来时必须保留原值）。 */
  const fromView = removableOf({ id: 'x2', savedAtLabel: '最近存入 11-23', reason: '理由' });
  ok('展示模型（只有 savedAtLabel）进来时 savedAt 落 0，不编造当前时间',
    fromView.item.savedAt === 0, String(fromView.item.savedAt));
  ok('savedAt 为负 / NaN 时也落 0', removableOf({ id: 'x3', savedAt: NaN }).item.savedAt === 0
    && removableOf({ id: 'x4', savedAt: -5 }).item.savedAt === 0);
}

console.log('\n===== ⑧ 撤销与已入手：真的落到存储上（走会话，与移除同一个介质） =====');
{
  const store = new MemStore();
  const w = createWishlist(store, { now: clock() });
  const s = createWishSession(w, undefined, store);

  w.add('p1', '一');
  w.add('p2', '二');
  const before = w.list();
  const target = before.find((x) => x.id === 'p1');

  w.remove('p1');
  ok('移除后只剩一瓶', w.list().length === 1, String(w.list().length));

  const undoOk = s.undoRemove(target);
  ok('撤销写回成功', undoOk === true);
  const after = w.list();
  ok('撤销后两瓶都回来了', after.length === 2, String(after.length));
  const back = after.find((x) => x.id === 'p1');
  ok('撤销保留原 savedAt（不刷成现在，位置不变）',
    back.savedAt === target.savedAt, `${back.savedAt} vs ${target.savedAt}`);
  ok('撤销后顺序与移除前一致（没被顶到最前）',
    after.map((x) => x.id).join(',') === before.map((x) => x.id).join(','),
    after.map((x) => x.id).join(','));
  ok('撤销后落盘仍是三键白名单',
    Object.keys(JSON.parse(store.getItem('sp_wishlist_v1'))[0]).join(',') === WISHLIST_ITEM_FIELDS.join(','));

  /* 已入手：标 / 取消 / 回显 */
  ok('未标记时 isOwned 为假', s.isOwned('p2') === false);
  const mark = s.toggleOwned('p2');
  ok('标记成功', mark.ok === true && s.isOwned('p2') === true, JSON.stringify(mark.status));
  ok('标记落在独立键上（形状是纯 id 数组）',
    Array.isArray(JSON.parse(store.getItem('sp_wishlist_owned_v1'))),
    String(store.getItem('sp_wishlist_owned_v1')));
  ok('取消标记成功', s.unmarkOwned('p2') === true && s.isOwned('p2') === false);
  ok('取消标记后独立键是空数组', store.getItem('sp_wishlist_owned_v1') === '[]',
    String(store.getItem('sp_wishlist_owned_v1')));
  ok('取消标记不动心仪清单本身', w.list().length === 2, String(w.list().length));
  ok('取消一个没标记过的 id 也不抛', s.unmarkOwned('never-marked') === true);

  /* 已入手与盖章互不干扰，与心仪也互不干扰 —— 三个键各自独立
     （盖章 2026-11-23 已实现，键 scent-picker.tasting.v1，见 test-stamp.mjs） */
  ok('心仪键与已入手键是两个键',
    store.getItem('sp_wishlist_v1') !== store.getItem('sp_wishlist_owned_v1'));
}

console.log('\n===== ⑨ 存储不可用：撤销与已入手也走兜底介质（不许一半真一半假） =====');
{
  /* 真存储写不了（隐私模式 / 配额满）：会话会切到内存介质。
     关键断言：这时「已入手」与「撤销」也不能往磁盘写 —— 否则磁盘上会
     留下内存里并不存在的记号，刷新后对不上。 */
  const realStore = new QuotaStore();
  const w = createWishlist(realStore, { now: clock() });
  const s = createWishSession(w, undefined, realStore);

  s.toggle('p1', '理由');
  ok('存不进去时降级（内存兜底）', s.degraded() === true);

  const mark = s.toggleOwned('p1');
  ok('降级下标记已入手成功', mark.ok === true && mark.degraded === true, JSON.stringify(mark));
  ok('降级下回显读得到（读的也是兜底介质）', s.isOwned('p1') === true);
  ok('降级下真存储里没有已入手键（没偷写磁盘）',
    realStore.getItem('sp_wishlist_owned_v1') == null,
    String(realStore.getItem('sp_wishlist_owned_v1')));

  ok('降级下取消标记成功', s.unmarkOwned('p1') === true && s.isOwned('p1') === false);

  /* 撤销：真存储是坏的，写回也只能落在兜底介质上 */
  const item = { id: 'p2', savedAt: 123, reason: 'x' };
  const undoOk = s.undoRemove(item);
  ok('降级下撤销成功（写进兜底介质）', undoOk === true);
  ok('降级下撤销后兜底介质里读得到这一条', s.has('p2') === true);
  ok('降级下撤销没有碰真存储的心仪键',
    realStore.getItem('sp_wishlist_v1') == null, String(realStore.getItem('sp_wishlist_v1')));

  /* 会话暴露的介质句柄：没降级时是 null，上层该用真存储 */
  const clean = createWishSession(createWishlist(new MemStore(), { now: clock() }), undefined, new MemStore());
  ok('没降级时 memoryStore() 返回 null（上层用真存储）', clean.memoryStore() === null);
  ok('降级后 memoryStore() 给得出一份介质', s.memoryStore() != null);
}

console.log('\n===== ⑩ 接线守卫：app.js 真的接到了清单页 =====');
{
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

  ok('app.js 引入 wish-page.js',
    /from '\.\/src\/wish-page\.js'/.test(app));
  ok('app.js 用 wishListModel 算整页', /wishListModel\(/.test(app));
  ok('app.js 用 priceLabelOf / savedLabel（价格与日期同源）',
    /priceLabelOf|savedLabel|priceIndex: PRICE_INDEX/.test(app));

  /* 清单页是顶层视图，走 state 而不是新建路由 */
  ok('清单页是顶层视图（render() 里有 state.wishPage 分支）',
    /if \(state\.wishPage\) \{/.test(app));
  ok('清单页有自己的 data-step（供 CSS 认屏）',
    /app\.dataset\.step = 'wishlist'/.test(app));
  ok('清单页渲染函数存在', /function renderWishPage\(\)/.test(app));

  /* 入口：档案区块里带计数 */
  ok('档案区块里有「心仪清单」入口', /class: 'qw-wl-entry'/.test(app));
  ok('入口带计数（data-wish-count + 可见数字）',
    /'data-wish-count': String\(wishCount\)/.test(app));
  ok('入口点击进清单页（openWishPage）',
    /function openWishPage\(\)/.test(app) && /onclick: \(\) => openWishPage\(\)/.test(app));

  /* L2 的 toast「在香水档案里看」必须真的能点进去 */
  ok('结果页 toast 的「在香水档案里看」是可点按钮（补 L2 未实现的跳转）',
    /class: 'qw-wish-go'/.test(app) && /openWishPage\(\)/.test(app));
  ok('toast 按钮放行 pointer-events（父级是 none）',
    /\.qw-wish-go[\s\S]{0,400}pointer-events:\s*auto/.test(fs.readFileSync(path.join(ROOT, 'styles', 'src', '99-wishlist.css'), 'utf8')));

  /* 五要素与三个动作的类名都要在渲染代码里出现 */
  ok('行渲染含瓶图 / 名字 / 理由 / 价格 / 日期',
    /qw-wl-art/.test(app) && /qw-wl-name/.test(app)
    && /qw-wl-reason/.test(app) && /qw-wl-price/.test(app) && /qw-wl-date/.test(app));
  ok('行渲染含已入手 / 购买 / 移除三个动作',
    /qw-wl-owned/.test(app) && /qw-wl-buy/.test(app) && /qw-wl-remove/.test(app));

  /* 已入手是可切换的（aria-pressed 跟着状态） */
  ok('已入手是 toggle 语义（aria-pressed 随状态）',
    /'aria-pressed': row\.owned \? 'true' : 'false'/.test(app));

  /* 移除后有撤销（设计稿 §11.1：一点即删会丢老瓶子） */
  ok('移除后给撤销条（不是一点就永久删）',
    /class: 'qw-wl-undo'/.test(app) && /undoRemove\(/.test(app));

  /* 三条状态提示都要真的渲染出来 */
  ok('降级提示会渲染（data-note=unavailable）',
    /'data-note': 'unavailable'/.test(app));
  ok('满 50 提示会渲染（data-note=full）', /'data-note': 'full'/.test(app));
  ok('空态会渲染（不白屏）', /qw-wl-empty-title/.test(app) && /qw-wl-empty-cta/.test(app));

  /* 读清单一律包在 try 里：存储坏掉时这一页要显示降级，不是错误页 */
  ok('读清单包在 try/catch 里（坏存储不把整站变成错误页）',
    /try \{\s*items = wishlist\.list\(\);/.test(app));
}

console.log('\n===== ⑪ 产物守卫：styles.css 里有清单页规则 =====');
{
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const src = fs.readFileSync(path.join(ROOT, 'styles', 'src', '99-wishlist.css'), 'utf8');

  ok('styles.css 里有 .qw-wl-page', /\.qw-wl-page/.test(css));
  ok('styles.css 里有 .qw-wl-row', /\.qw-wl-row/.test(css));
  ok('styles.css 里有 .qw-wl-owned.is-on（已入手态）', /\.qw-wl-owned\.is-on/.test(css));
  ok('styles.css 里有 .qw-wl-buy / .qw-wl-remove',
    /\.qw-wl-buy/.test(css) && /\.qw-wl-remove/.test(css));
  ok('styles.css 里有空态与入口规则',
    /\.qw-wl-empty/.test(css) && /\.qw-wl-entry/.test(css));

  /* 触控下限 44px：与 .btn / .chip / .disc-sector 同一档 */
  const pick = (sel) => {
    const i = src.indexOf(sel + ' {');
    return i < 0 ? '' : src.slice(i, src.indexOf('}', i));
  };
  const needs44 = ['.qw-wl-entry', '.qw-wl-owned', '.qw-wl-buy', '.qw-wl-remove', '.qw-wl-back', '.qw-wl-clear'];
  const thin = needs44.filter((sel) => !/min-height:\s*44px/.test(pick(sel)));
  ok('清单页所有动作件都有 min-height:44px', thin.length === 0, thin.join(','));

  /* 字号下限 12px（test-contrast 的同一道门，这里提前拦） */
  const sizes = [...src.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => parseFloat(m[1]));
  ok('本层所有字号 ≥ 12px', sizes.every((n) => n >= 12), sizes.join(','));

  /* 焦点环：与全站同一条蓝环 */
  ok('清单页动作件有 :focus-visible 蓝环',
    /\.qw-wl-entry:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--blue\)/.test(src)
    && /\.qw-wl-buy:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--blue\)/.test(src));

  /* 零硬编码色值 */
  const hexes = [...src.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  ok('本层不新增硬编码色值（全走 token）', hexes.length === 0, hexes.join(','));

  /* 窄屏：三列改两列，动作列整行下移（390 下名字不被挤成一列字） */
  ok('窄屏把动作列改到下一行', /@media \(max-width: 620px\)[\s\S]{0,900}\.qw-wl-tail[\s\S]{0,260}grid-column: 1 \/ -1/.test(src));
}

console.log('\n===== ⑫ L1 数据层仍然零改动 =====');
{
  const wl = fs.readFileSync(path.join(ROOT, 'src', 'wishlist.js'), 'utf8');
  ok('数据层导出的符号与 L1 完全一致（L3 没有为它开口子）',
    (wl.match(/^export const (\w+)/gm) || []).join(',')
      === 'export const WISHLIST_KEY,export const WISHLIST_OWNED_KEY,export const WISHLIST_MAX,export const WISHLIST_REASON_MAX,export const WISHLIST_ID_MAX,export const wishlist,export const add,export const remove,export const toggle,export const list,export const has,export const clear,export const markOwned,export const isOwned,export const WISHLIST_ITEM_FIELDS',
    (wl.match(/^export const (\w+)/gm) || []).join(','));
  ok('数据层仍然不碰 DOM', !/document\.|querySelector|classList|innerHTML/.test(wl));
  ok('三键白名单仍是 id,savedAt,reason', WISHLIST_ITEM_FIELDS.join(',') === 'id,savedAt,reason');
  ok('上限仍是 50', WISHLIST_MAX === 50);

  /* 依赖方向：wish-page 只能依赖 wishlist（拿常量），不许反向 */
  const wp = fs.readFileSync(path.join(ROOT, 'src', 'wish-page.js'), 'utf8');
  ok('wish-page 不碰 DOM（所以能在 node 里直接测）',
    !/document\.|window\.|querySelector|classList|innerHTML/.test(wp));
  ok('wish-page 不 import wish-ui（不反向依赖编排层）', !/wish-ui/.test(wp));
  ok('wish-page 只从 wishlist 取常量', /from '\.\/wishlist\.js'/.test(wp));
}

console.log('\n===== 心仪清单 L3 清单页测试 =====');
console.log(`PASS ${pass}  FAIL ${fails.length}`);
if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exitCode = 1;
}
