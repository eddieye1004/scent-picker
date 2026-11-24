/**
 * test-wishlist.mjs — 心仪清单 L1 数据层的守门测试
 *
 * 纯数据层，不碰 DOM：只 import src/wishlist.js，存储用内存版 localStorage
 * （与 scripts/test-qoder-features.mjs 的 MemStore 同形），时间源注入固定值，
 * 所以结果可复算、不依赖真实时钟。
 *
 * 覆盖：增 / 删 / 切换 / 同 id 置顶更新 / 50 上限拒绝 / 三键白名单守卫 /
 *      写前重读（多标签不整表覆盖）/ 存储不可用静默降级不抛错 /
 *      已入手标记独立键存取 / 不影响 src/history.js 的「不存 id」守卫。
 *
 * 用法：node scripts/test-wishlist.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createWishlist,
  WISHLIST_KEY,
  WISHLIST_OWNED_KEY,
  WISHLIST_MAX,
  WISHLIST_ITEM_FIELDS,
} from '../src/wishlist.js';
import { makeHistoryRecord, addHistory, readHistory, HISTORY_KEY, HISTORY_MAX } from '../src/history.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fails.push(label);
    console.log('  ✗ ' + label + (detail ? ' :: ' + detail : ''));
  }
};

/* ---------- 内存版 localStorage ---------- */
class MemStore {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed));
    this.writes = 0;
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.writes++;
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}

/* 模拟隐私模式 / 配额满：setItem 直接抛。 */
class QuotaStore extends MemStore {
  setItem() {
    throw new Error('QuotaExceededError');
  }
}

/* 时钟：每次调用前进 1000ms，保证顺序可判。 */
function clock(start = 1763500000000) {
  let t = start;
  return () => {
    t += 1000;
    return t;
  };
}

const mk = (seed, start) => createWishlist(new MemStore(seed), { now: clock(start) });

console.log('\n===== 约定：键名 / 上限 / 三键白名单 =====');
{
  ok(WISHLIST_KEY === 'sp_wishlist_v1', '清单键 = sp_wishlist_v1', WISHLIST_KEY);
  ok(WISHLIST_OWNED_KEY === 'sp_wishlist_owned_v1', '已入手键 = sp_wishlist_owned_v1（独立键）', WISHLIST_OWNED_KEY);
  ok(WISHLIST_MAX === 50, '上限 = 50', String(WISHLIST_MAX));
  ok(WISHLIST_ITEM_FIELDS.join(',') === 'id,savedAt,reason', '白名单 = id,savedAt,reason', WISHLIST_ITEM_FIELDS.join(','));
  const api = ['add', 'remove', 'toggle', 'list', 'has', 'clear', 'markOwned', 'isOwned'];
  const inst = createWishlist(null);
  ok(api.every((n) => typeof inst[n] === 'function'), 'API 齐全：' + api.join(' / '), api.filter((n) => typeof inst[n] !== 'function').join(','));
}

console.log('\n===== ① 增 / 读 / 有 / 顺序（倒序）=====');
{
  const store = new MemStore();
  const w = createWishlist(store, { now: clock() });

  const a = w.add('p1', '刚剥开的橘子皮');
  ok(a.ok && a.status === 'added', '首次 add 返回 added', JSON.stringify(a.status));
  ok(w.has('p1') === true, 'has 命中刚存的 id');
  ok(w.list().length === 1, 'list 长度 1', String(w.list().length));

  const b = w.add('p2', '');
  const c = w.add('p3', '  雪松   与 苔藓  ');
  ok(w.list().map((x) => x.id).join(',') === 'p3,p2,p1', '按 savedAt 倒序（最新在前）', w.list().map((x) => x.id).join(','));
  ok(b.ok && c.ok && w.list().length === 3, '三条都在', String(w.list().length));
  ok(w.list()[0].reason === '雪松 与 苔藓', '理由清理多余空白', JSON.stringify(w.list()[0].reason));
  ok(w.list()[1].reason === '', '没给理由就存空串，不编造', JSON.stringify(w.list()[1].reason));
  ok(w.has('nope') === false, 'has 未存的 id 返回 false');
  ok(w.list().every((x) => Number.isFinite(x.savedAt) && x.savedAt > 0), '每条都有有效 savedAt');

  /* 落盘形状：三键、顺序固定、顶层是数组。 */
  const raw = JSON.parse(store.getItem(WISHLIST_KEY));
  ok(Array.isArray(raw), '落盘是数组');
  ok(raw.every((x) => Object.keys(x).join(',') === 'id,savedAt,reason'), '落盘每条恰好三键', JSON.stringify(raw[0]));
}

console.log('\n===== ② 同 id 重复存：更新 savedAt + reason 并置顶 =====');
{
  const w = mk();
  w.add('p1', '旧理由');
  w.add('p2', '别的');
  const before = w.list().length;
  const upd = w.add('p1', '新理由');
  const ls = w.list();

  ok(upd.ok && upd.status === 'updated', '重复 add 返回 updated', JSON.stringify(upd.status));
  ok(ls.length === before, '不重复占位（长度不变 ' + before + '）', String(ls.length));
  ok(ls[0].id === 'p1', '重复存的这条被置顶', ls.map((x) => x.id).join(','));
  ok(ls[0].reason === '新理由', '理由被更新为最新一条', JSON.stringify(ls[0].reason));
  ok(ls.filter((x) => x.id === 'p1').length === 1, '同一 id 只有一条');
  ok(ls[0].savedAt > ls[1].savedAt, 'savedAt 确实变新了');

  /* 已在清单里的瓶颈不会因「满」被拒（更新不算新增）。 */
  const w2 = mk();
  for (let i = 0; i < WISHLIST_MAX; i++) w2.add('f' + i, '');
  const updAtCap = w2.add('f0', '满额后更新');
  ok(updAtCap.ok && updAtCap.status === 'updated', '满额时更新已有条目仍然成功', JSON.stringify(updAtCap.status));
  ok(w2.list().length === WISHLIST_MAX, '满额更新后长度仍是上限', String(w2.list().length));
}

console.log('\n===== ③ 删 / 切换 =====');
{
  const w = mk();
  w.add('p1', 'a');
  w.add('p2', 'b');

  const rm = w.remove('p1');
  ok(rm.ok && rm.status === 'removed', 'remove 已存在的返回 removed', JSON.stringify(rm.status));
  ok(w.has('p1') === false && w.list().length === 1, '删掉后 has=false、长度 1', String(w.list().length));

  const rmAgain = w.remove('p1');
  ok(rmAgain.ok && rmAgain.status === 'absent', 'remove 不存在的算成功（absent），不抛错', JSON.stringify(rmAgain.status));

  const t1 = w.toggle('p3', '切换理由');
  ok(t1.ok && t1.status === 'added' && w.has('p3'), 'toggle 未存过的 → 存上', JSON.stringify(t1.status));
  ok(w.list()[0].reason === '切换理由', 'toggle 存上时带上理由', JSON.stringify(w.list()[0].reason));

  const t2 = w.toggle('p3', '第二次');
  ok(t2.ok && t2.status === 'removed' && !w.has('p3'), 'toggle 已存过的 → 移掉', JSON.stringify(t2.status));

  /* toggle 幂等往返：两次切换回到原状。 */
  w.toggle('p4');
  w.toggle('p4');
  ok(!w.has('p4'), '同一 id 切换两次回到未存状态');
  ok(w.list().length === 1, '切换不影响其它条目', String(w.list().length));

  const cleared = w.clear();
  ok(cleared.ok && w.list().length === 0, 'clear 后清单为空', String(w.list().length));
  ok(w.list().length === 0, '清空后读仍是空');
}

console.log('\n===== ④ 上限 50：满了拒绝新的，不静默丢弃 =====');
{
  const w = mk();
  for (let i = 0; i < WISHLIST_MAX; i++) w.add('c' + i, 'r' + i);
  ok(w.list().length === WISHLIST_MAX, `存满 ${WISHLIST_MAX} 条`, String(w.list().length));

  const oldestId = w.list()[w.list().length - 1].id;
  const rej = w.add('overflow', '第 51 瓶');
  ok(rej.ok === false && rej.status === 'full', '第 51 条被拒且状态是 full', JSON.stringify(rej.status));
  ok(rej.limit === WISHLIST_MAX, '拒绝时回带上限值，UI 可直接提示', String(rej.limit));
  ok(w.list().length === WISHLIST_MAX, '拒绝后长度不变（没有偷偷挤掉最旧）', String(w.list().length));
  ok(w.has('overflow') === false, '被拒的那条确实没进清单');
  ok(w.has(oldestId) === true, '最旧的一条仍完好（不静默丢弃）', oldestId);

  /* 腾出一位后可以再存。 */
  w.remove(oldestId);
  const retry = w.add('overflow', '第 51 瓶');
  ok(retry.ok && retry.status === 'added', '移掉一瓶后第 51 条可以存', JSON.stringify(retry.status));
  ok(w.list().length === WISHLIST_MAX, '回到上限', String(w.list().length));
}

console.log('\n===== ⑤ 三键白名单守卫 =====');
{
  const store = new MemStore();
  const w = createWishlist(store, { now: clock() });
  w.add('p1', '理由');
  w.add('p2');
  w.toggle('p3', 'x');

  const raw = JSON.parse(store.getItem(WISHLIST_KEY));
  const extra = [];
  for (const row of raw) for (const k of Object.keys(row)) if (!WISHLIST_ITEM_FIELDS.includes(k)) extra.push(k);
  ok(extra.length === 0, '落盘元素没有三键以外的键', extra.join(','));

  /* 外部塞进来的脏键：读时被剥掉，再写时也不回流到磁盘。 */
  const dirty = new MemStore({
    [WISHLIST_KEY]: JSON.stringify([
      { id: 'd1', savedAt: 1, reason: 'ok', pct: 88, name: '不该出现', familySource: 'x' },
      { id: 'd2', savedAt: 2, reason: 'ok2', extra: { nested: true } },
    ]),
  });
  const wd = createWishlist(dirty, { now: clock() });
  ok(wd.list().every((x) => Object.keys(x).join(',') === 'id,savedAt,reason'), '读脏数据时剥掉多余键', JSON.stringify(wd.list()[0]));
  wd.add('d3', '触发重写');
  ok(!/pct|"name"|familySource|"extra"/.test(dirty.getItem(WISHLIST_KEY)), '写入后脏键被彻底清掉', dirty.getItem(WISHLIST_KEY).slice(0, 120));

  /* 对象/数组这类无法当 id 的值一律判无效，不许被 String() 成 "[object Object]" 混进来。 */
  const weird = mk();
  const objId = weird.add({ toString: () => 'obj-id' }, 'obj');
  ok(objId.ok === false && objId.status === 'invalid', '对象 id 被拒（不落成 [object Object]）', JSON.stringify(objId.status));
  ok(!/object Object/.test(JSON.stringify(weird.list())), '清单里没有 [object Object] 这种脏 id', JSON.stringify(weird.list()));
  const numId = weird.add(42, '数字 id');
  ok(numId.ok && numId.item.id === '42', '有限数字 id 被归一化成字符串', JSON.stringify(numId.item && numId.item.id));
  ok(weird.add('', 'x').ok === false, '空 id 被拒（invalid）', JSON.stringify(weird.add('', 'x').status));
  ok(weird.add('   ', 'x').ok === false, '纯空白 id 被拒（invalid）', JSON.stringify(weird.add('   ', 'x').status));
  ok(weird.has({}) === false && weird.isOwned([]) === false, 'has/isOwned 收到对象 id 返回 false，不抛');

  /* 坏 JSON：读空、不抛，且下次写入能恢复。 */
  const broken = new MemStore({ [WISHLIST_KEY]: '{不是 JSON' });
  const wb = createWishlist(broken, { now: clock() });
  ok(wb.list().length === 0, '坏 JSON → 读空数组，不抛错');
  const rec = wb.add('p9', '恢复');
  ok(rec.ok && wb.list().length === 1, '坏数据后仍能正常写入', JSON.stringify(rec.status));
}

console.log('\n===== ⑥ 写前重读：多标签不整表覆盖 =====');
{
  const store = new MemStore();
  const tabA = createWishlist(store, { now: clock(1763500000000) });
  const tabB = createWishlist(store, { now: clock(1763600000000) });

  tabA.add('a1', '标签A先存');
  /* 标签B 的实例是在 A 写入之前就创建好的，手上没有缓存 —— 它必须重读。 */
  tabB.add('b1', '标签B后存');

  const ids = JSON.parse(store.getItem(WISHLIST_KEY)).map((x) => x.id);
  ok(ids.includes('a1') && ids.includes('b1'), '两个标签的写入都保住了（A 的表没被整表覆盖）', ids.join(','));
  ok(tabA.list().length === 2, 'A 侧读到的也是 2 条', String(tabA.list().length));

  /* 同一实例连续写也不丢：第二次写基于第一次的结果。 */
  tabA.add('a2', '');
  ok(tabA.list().length === 3, '连续写入累积而非覆盖', String(tabA.list().length));

  /* 外部（另一个标签）已写满时，本标签拒绝而不是覆盖。 */
  const store2 = new MemStore();
  const t1 = createWishlist(store2, { now: clock() });
  const t2 = createWishlist(store2, { now: clock(1763700000000) });
  for (let i = 0; i < WISHLIST_MAX; i++) t1.add('z' + i);
  const full = t2.add('zz', '满了');
  ok(full.status === 'full', '另一标签写满后，本标签新增被拒（重读生效）', JSON.stringify(full.status));
  ok(JSON.parse(store2.getItem(WISHLIST_KEY)).length === WISHLIST_MAX, '被拒时磁盘保持原样', String(JSON.parse(store2.getItem(WISHLIST_KEY)).length));
}

console.log('\n===== ⑦ 存储不可用：静默降级，API 返回失败状态、不抛 =====');
{
  let threw = null;
  try {
    const w = createWishlist(null);
    const a = w.add('p1', 'x');
    ok(a.ok === false && a.status === 'unavailable', 'null 存储：add 返回 unavailable', JSON.stringify(a.status));
    ok(w.list().length === 0 && w.has('p1') === false, 'null 存储：读是空、has 是 false');
    ok(w.remove('p1').status === 'unavailable', 'null 存储：remove 返回 unavailable');
    ok(w.toggle('p1').status !== 'added', 'null 存储：toggle 不会假装成功', JSON.stringify(w.toggle('p1').status));
    ok(w.clear().status === 'unavailable', 'null 存储：clear 返回 unavailable');
    ok(w.markOwned('p1').status === 'unavailable' && w.isOwned('p1') === false, 'null 存储：已入手标记也是 unavailable');

    const quota = createWishlist(new QuotaStore(), { now: clock() });
    const qa = quota.add('p1', 'x');
    ok(qa.ok === false && qa.status === 'unavailable', 'setItem 抛配额错：add 返回 unavailable（不抛）', JSON.stringify(qa.status));
    ok(quota.list().length === 0, '配额错时读仍是空');

    /* 取存储本身抛错（某些浏览器直接访问 localStorage 就抛）。 */
    const wG = createWishlist(() => { throw new Error('SecurityError'); });
    ok(wG.list().length === 0, '取存储抛错 → 读空，不抛');
    ok(wG.add('p1').status === 'unavailable', '取存储抛错 → 写返回 unavailable');

    ok(createWishlist(undefined).list().length === 0, 'undefined 存储 → 读空');
  } catch (e) {
    threw = e;
  }
  ok(threw === null, '降级路径全程没有抛出一处异常', threw && threw.message);
}

console.log('\n===== ⑧ 已入手标记：独立键、互不影响 =====');
{
  const store = new MemStore();
  const w = createWishlist(store, { now: clock() });

  const m = w.markOwned('p1');
  ok(m.ok && m.status === 'marked' && w.isOwned('p1'), 'markOwned 后 isOwned 为真', JSON.stringify(m.status));
  ok(w.isOwned('p2') === false, '未标记的 id 为假');
  ok(store.getItem(WISHLIST_OWNED_KEY) === '["p1"]', '已入手落在独立键，形状是纯 id 数组', store.getItem(WISHLIST_OWNED_KEY));
  ok(store.getItem(WISHLIST_KEY) == null, '标记已入手不会创建/改写清单键');

  const m2 = w.markOwned('p1');
  ok(m2.ok && m2.status === 'exists', '重复标记幂等（exists）', JSON.stringify(m2.status));
  ok(JSON.parse(store.getItem(WISHLIST_OWNED_KEY)).length === 1, '重复标记不产生重复项');

  w.add('p1', '同时也在心仪里');
  ok(w.isOwned('p1') && w.has('p1'), '同一瓶可以同时「在心仪里」和「已入手」');

  w.clear();
  ok(w.isOwned('p1') === true, '清空心仪不动已入手标记');
  ok(JSON.parse(store.getItem(WISHLIST_OWNED_KEY)).length === 1, '已入手键在 clear 后完好');

  w.clearOwned();
  ok(w.isOwned('p1') === false, 'clearOwned 单独清掉已入手标记');
  ok(store.getItem(WISHLIST_KEY) != null || w.list().length === 0, '清已入手不影响清单键的独立性');

  /* 已入手键里的脏值（对象/重复/空/布尔）被归一化：只留字符串与有限数字。 */
  const dirty = new MemStore({ [WISHLIST_OWNED_KEY]: JSON.stringify(['a', 'a', '', { id: 'b' }, null, 'c', 7, true]) });
  const wd = createWishlist(dirty, { now: clock() });
  const owned = JSON.parse(wd.markOwned('d').ok ? dirty.getItem(WISHLIST_OWNED_KEY) : '[]');
  ok(owned.join(',') === 'a,c,7,d', '已入手键读时去重、丢非标量、保持顺序', owned.join(','));
  ok(!/object Object|null|true/.test(owned.join(',')), '已入手键里没有脏值');
}

console.log('\n===== ⑨ 不影响 src/history.js 的「不存 id」守卫 =====');
{
  const store = new MemStore();
  const w = createWishlist(store, { now: clock() });
  w.add('perfume-abc', '心仪理由');
  w.markOwned('perfume-abc');

  /* 档案模块照旧写自己的键，两键互不干扰。 */
  const rec = makeHistoryRecord(
    { results: [{ perfume: { id: 'perfume-abc', name: 'A', brand: 'BA' }, reasons: ['因为 A'] }] },
    { family: 'citrus' },
    1763500000000,
  );
  addHistory(store, rec);

  const hist = readHistory(store);
  ok(hist.length === 1, '档案仍能正常写入 1 条', String(hist.length));
  ok(Object.keys(hist[0]).sort().join(',') === 'entry,results,t', '档案记录仍只有 t/entry/results 三键', Object.keys(hist[0]).join(','));
  ok(hist[0].results.every((r) => Object.keys(r).sort().join(',') === 'brand,name'), '档案每瓶仍只有 name/brand');
  const histRaw = store.getItem(HISTORY_KEY);
  ok(!/perfume-abc/.test(histRaw), '心仪的香水 id 没有漏进档案键', histRaw);
  ok(!/心仪理由/.test(histRaw), '心仪的理由没有漏进档案键');
  ok(store.getItem(WISHLIST_KEY) !== histRaw, '两个键各自独立存储');
  ok(HISTORY_MAX === 5 && JSON.parse(store.getItem(WISHLIST_KEY)).length === 1, '档案上限 5 / 心仪 1 条，互不影响');

  /* 反方向：清掉档案不影响心仪。 */
  store.removeItem(HISTORY_KEY);
  ok(w.list().length === 1 && w.has('perfume-abc'), '清掉档案后心仪完好');
}

console.log('\n===== ⑩ 源码层守卫：纯数据层、键名写死、不碰 DOM =====');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/wishlist.js'), 'utf8');
  ok(src.includes("'sp_wishlist_v1'") && src.includes("'sp_wishlist_owned_v1'"), '源码里键名与约定逐字一致');
  ok(!/document\.|window\.|querySelector|classList|innerHTML/.test(src), '数据层不碰 DOM（无 document/window 选择器）');
  ok(!/fetch\(|XMLHttpRequest|navigator\.sendBeacon/.test(src), '没有任何上传路径');
  ok(/export function createWishlist/.test(src), '提供可注入存储的 createWishlist 工厂（可测）');
  ok(!/src\/history/.test(src), '数据层不反向依赖档案模块');
}

console.log('\n===== 心仪清单 L1 数据层测试 =====');
console.log(`PASS ${pass}  FAIL ${fails.length}`);
if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exitCode = 1;
}
