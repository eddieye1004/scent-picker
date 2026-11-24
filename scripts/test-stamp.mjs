/**
 * test-stamp.mjs — 试香盖章数据层（src/stamp.js）的守门测试
 *
 * 纯数据层，不碰 DOM：只 import src/stamp.js，存储用内存版 localStorage，
 * 时间源注入固定值，所以结果可复算、不依赖真实时钟。
 *
 * 覆盖（对应任务书「验收线」逐项）：
 *   ① 五档全部能存能读回（逐档各盖一次并回读档位）；
 *   ② 同一瓶重复盖章：log 追加、计数 +1、「最近一次」跟着换；
 *   ③ 撤销：退回上一次的真实档位与时间；退到空则整条移除；
 *   ④ 存储不可用（null / 配额抛 / 取存储抛）→ 静默降级、不抛；
 *   ⑤ 键名与档案同一套前缀、四键白名单、不与档案键互相干扰；
 *   ⑥ 上限 200 拒绝而不静默丢弃；身份键归一化（宁可不合并，也不错合并）。
 *
 * 用法：node scripts/test-stamp.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createStamps, STAMP_KEY, STAMP_MAX, STAMP_TIERS, STAMP_TIER_ZH,
  STAMP_ITEM_FIELDS, STAMP_LOG_FIELDS, stampKeyOf, tierZhOf,
} from '../src/stamp.js';
import {
  HISTORY_KEY, makeHistoryRecord, addHistory, readHistory,
} from '../src/history.js';

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
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.writes++; this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

/* 隐私模式 / 配额满：setItem 直接抛。 */
class QuotaStore extends MemStore {
  setItem() { throw new Error('QuotaExceededError'); }
}

/* 时钟：每次调用前进 1000ms，保证顺序可判。 */
function clock(start = 1763700000000) {
  let t = start;
  return () => { t += 1000; return t; };
}

const BOTTLE = { name: 'Santal 33', brand: 'Le Labo' };
const OTHER = { name: 'Aventus', brand: 'Creed' };
const mk = (seed, start) => createStamps(new MemStore(seed), { now: clock(start) });

console.log('\n===== ① 约定：键名 / 五档 / 白名单 =====');
{
  ok(STAMP_KEY === 'scent-picker.tasting.v1', '键名 = scent-picker.tasting.v1', STAMP_KEY);
  /* 与档案同一套前缀：盖章是档案的一部分，不该在存储层看起来像另一个产品。 */
  ok(STAMP_KEY.startsWith('scent-picker.'),
    '键名与档案键同一套 scent-picker. 前缀（不另起孤岛前缀）', STAMP_KEY);
  ok(HISTORY_KEY === 'scent-picker.history.v1' && STAMP_KEY !== HISTORY_KEY,
    '与档案键并列但不同键（不污染档案）', `${HISTORY_KEY} vs ${STAMP_KEY}`);
  ok(STAMP_MAX === 200, '上限 = 200 瓶', String(STAMP_MAX));
  ok(STAMP_TIERS.join(',') === 'love,like,ok,meh,no', '五档 id 与顺序', STAMP_TIERS.join(','));
  ok(STAMP_TIER_ZH.love === '一闻钟情' && STAMP_TIER_ZH.like === '喜欢'
    && STAMP_TIER_ZH.ok === '还行' && STAMP_TIER_ZH.meh === '无感'
    && STAMP_TIER_ZH.no === '劝退',
    '五档中文逐字：一闻钟情 / 喜欢 / 还行 / 无感 / 劝退',
    Object.values(STAMP_TIER_ZH).join('/'));
  ok(STAMP_ITEM_FIELDS.join(',') === 'key,name,brand,log',
    '记录白名单 = key,name,brand,log', STAMP_ITEM_FIELDS.join(','));
  ok(STAMP_LOG_FIELDS.join(',') === 'tier,t',
    'log 每项白名单 = tier,t（不存日期文本、不存设备信息）', STAMP_LOG_FIELDS.join(','));

  const api = ['list', 'get', 'stamp', 'undo', 'clear'];
  const inst = createStamps(null);
  ok(api.every((n) => typeof inst[n] === 'function'),
    'API 齐全：' + api.join(' / '), api.filter((n) => typeof inst[n] !== 'function').join(','));

  ok(tierZhOf('love') === '一闻钟情' && tierZhOf('nope') === '',
    'tierZhOf：认得的档给中文、认不得的给空串（不编）', tierZhOf('nope'));
}

console.log('\n===== ② 五档：逐档盖章都能回读（逐档报数）=====');
{
  for (const tier of STAMP_TIERS) {
    const store = new MemStore();
    const s = createStamps(store, { now: clock() });
    const res = s.stamp(BOTTLE, tier);
    const back = s.get(BOTTLE);
    const raw = JSON.parse(store.getItem(STAMP_KEY));
    ok(res.ok && res.status === 'stamped', `[${tier}] 盖章成功`, JSON.stringify(res.status));
    ok(back && back.log.length === 1 && back.log[0].tier === tier,
      `[${tier}] 回读档位 = ${tier}（落盘后重读，不是凭内存）`,
      back ? JSON.stringify(back.log) : '(无记录)');
    ok(tierZhOf(back.log[0].tier) === STAMP_TIER_ZH[tier],
      `[${tier}] 回读中文 = ${STAMP_TIER_ZH[tier]}`, tierZhOf(back && back.log[0].tier));
    ok(raw.length === 1 && raw[0].log[0].tier === tier,
      `[${tier}] 磁盘上的档位一致`, JSON.stringify(raw[0] && raw[0].log));
    ok(back.name === 'Santal 33' && back.brand === 'Le Labo',
      `[${tier}] 名字与品牌快照都在`, `${back && back.name}|${back && back.brand}`);
    ok(Number.isFinite(back.log[0].t) && back.log[0].t > 0,
      `[${tier}] 有时间戳`, String(back && back.log[0].t));
  }
  /* 五档全不接受乱值 */
  const s = mk();
  for (const bad of ['', null, undefined, 'LOVE', '五档', 0, {}]) {
    const r = s.stamp(BOTTLE, bad);
    ok(r.ok === false && r.status === 'invalid',
      `非法档位 ${JSON.stringify(bad)} 被拒（invalid）`, JSON.stringify(r.status));
  }
  ok(s.list().length === 0, '非法档位一条都没落盘', String(s.list().length));
}

console.log('\n===== ③ 重复盖章：log 追加、计数 +1、最近一次跟着换 =====');
{
  const store = new MemStore();
  const s = createStamps(store, { now: clock() });

  const a = s.stamp(BOTTLE, 'ok');
  const b = s.stamp(BOTTLE, 'love');
  const rec = s.get(BOTTLE);
  ok(a.ok && b.ok, '同瓶连盖两次都成功');
  ok(rec.log.length === 2, '计数 = 2（追加而不是覆盖整条）', String(rec.log.length));
  ok(rec.log[1].tier === 'love', '最近一次 = 第二次的档位', rec.log[1].tier);
  ok(rec.log[0].tier === 'ok', '第一次的档位仍留作撤销的回归点', rec.log[0].tier);
  ok(rec.log[1].t > rec.log[0].t, '新的一枚时间更新');
  ok(s.list().length === 1, '同一瓶只占一条记录（不是两条）', String(s.list().length));

  /* 第三次、第四次 */
  s.stamp(BOTTLE, 'meh');
  s.stamp(BOTTLE, 'no');
  const rec4 = s.get(BOTTLE);
  ok(rec4.log.length === 4, '连盖四次计数 = 4', String(rec4.log.length));
  ok(rec4.log.map((x) => x.tier).join(',') === 'ok,love,meh,no',
    '档位序列按盖章顺序保留（撤销要能一步步退）', rec4.log.map((x) => x.tier).join(','));
  ok(s.get(OTHER) === null, '没盖过的瓶返回 null', String(s.get(OTHER)));
  ok(s.get({ name: '', brand: 'x' }) === null, '没有瓶名 → 查不到（不编身份）');

  /* 落盘形状：四键、log 每项两键 */
  const raw = JSON.parse(store.getItem(STAMP_KEY));
  ok(raw.every((x) => Object.keys(x).join(',') === STAMP_ITEM_FIELDS.join(',')),
    '落盘每条恰好四键且键序固定', JSON.stringify(Object.keys(raw[0])));
  ok(raw[0].log.every((x) => Object.keys(x).join(',') === STAMP_LOG_FIELDS.join(',')),
    'log 每项恰好 tier,t 两键', JSON.stringify(raw[0].log[0]));
  ok(!/perfumeId|device|ua|answer/i.test(store.getItem(STAMP_KEY)),
    '记录里没有 id / 设备 / 回答字段', store.getItem(STAMP_KEY).slice(0, 120));
}

console.log('\n===== ④ 撤销：退回上一次的真实状态 / 退到空则整条移除 =====');
{
  const store = new MemStore();
  const s = createStamps(store, { now: clock() });
  s.stamp(OTHER, 'like');            // 另一瓶也有章（撤销不能连累它）
  s.stamp(BOTTLE, 'ok');
  s.stamp(BOTTLE, 'love');
  const before = s.get(BOTTLE);

  const u1 = s.undo(BOTTLE);
  const after1 = s.get(BOTTLE);
  ok(u1.ok && u1.status === 'undone', '第一次撤销 → undone', JSON.stringify(u1.status));
  ok(after1.log.length === 1, '计数回到 1', String(after1.log.length));
  ok(after1.log[0].tier === 'ok', '档位退回到上一次的「还行」（不是编的）', after1.log[0].tier);
  ok(after1.log[0].t === before.log[0].t, '时间也退回原值（不写成"现在"）',
    `${after1.log[0].t} vs ${before.log[0].t}`);
  ok(s.get(OTHER).log.length === 1 && s.get(OTHER).log[0].tier === 'like',
    '撤销这一瓶不连累另一瓶', JSON.stringify(s.get(OTHER).log));

  const u2 = s.undo(BOTTLE);
  ok(u2.ok && u2.status === 'removed', '退到空 → removed（整条移除）', JSON.stringify(u2.status));
  ok(s.get(BOTTLE) === null, '退光后这一瓶查不到（回到未盖章态）');
  ok(s.list().length === 1 && s.list()[0].key === stampKeyOf(OTHER),
    '只剩另一瓶那一条', s.list().map((x) => x.key).join(','));

  /* 没有记录时撤销：算成功（empty），不抛、不写脏数据 */
  const u3 = s.undo(BOTTLE);
  ok(u3.ok === true && u3.status === 'empty', '没盖过就撤销 → empty（幂等，不抛）',
    JSON.stringify(u3.status));
  ok(s.get(OTHER).log.length === 1, '空撤销不影响别的记录');

  /* 撤销之后再盖：计数从 1 起，不回退到历史峰值 */
  s.stamp(BOTTLE, 'meh');
  ok(s.get(BOTTLE).log.length === 1, '撤销后再盖，计数从 1 起算', String(s.get(BOTTLE).log.length));
}

console.log('\n===== ⑤ 存储不可用：静默降级、不抛（三种坏法）=====');
{
  let threw = null;
  try {
    const w = createStamps(null);
    const a = w.stamp(BOTTLE, 'love');
    ok(a.ok === false && a.status === 'unavailable', 'null 存储：stamp 返回 unavailable',
      JSON.stringify(a.status));
    ok(w.list().length === 0 && w.get(BOTTLE) === null, 'null 存储：读是空、get 是 null');
    ok(w.undo(BOTTLE).status === 'unavailable', 'null 存储：undo 返回 unavailable');
    ok(w.clear().status === 'unavailable', 'null 存储：clear 返回 unavailable');
    ok(!/throw/.test(String(w.list().length)), 'null 存储：list 不抛');

    const quota = createStamps(new QuotaStore(), { now: clock() });
    const qa = quota.stamp(BOTTLE, 'love');
    ok(qa.ok === false && qa.status === 'unavailable',
      'setItem 抛配额错：stamp 返回 unavailable（不抛）', JSON.stringify(qa.status));
    ok(quota.list().length === 0, '配额错时读仍是空');

    const wG = createStamps(() => { throw new Error('SecurityError'); });
    ok(wG.list().length === 0, '取存储本身抛错 → 读空，不抛');
    ok(wG.stamp(BOTTLE, 'love').status === 'unavailable', '取存储抛错 → 写返回 unavailable');
    ok(createStamps(undefined).list().length === 0, 'undefined 存储 → 读空');
  } catch (e) {
    threw = e;
  }
  ok(threw === null, '降级路径全程没有抛出一处异常', threw && threw.message);

  /* 坏 JSON：读空、不抛，且下次写入能恢复 */
  const broken = new MemStore({ [STAMP_KEY]: '{不是 JSON' });
  const wb = createStamps(broken, { now: clock() });
  ok(wb.list().length === 0, '坏 JSON → 读空数组，不抛错');
  const rec = wb.stamp(BOTTLE, 'ok');
  ok(rec.ok && wb.get(BOTTLE).log.length === 1, '坏数据后仍能正常写入', JSON.stringify(rec.status));

  /* 脏记录：缺 log / 档位非法 / 缺 key → 单条丢弃，不丢全表 */
  const dirty = new MemStore({
    [STAMP_KEY]: JSON.stringify([
      { key: 'a|b', name: 'A', brand: 'B', log: [{ tier: 'love', t: 1 }] },
      { key: 'c|d', name: 'C', brand: 'D', log: [] },
      { key: 'e|f', name: 'E', brand: 'F', log: [{ tier: '三星', t: 1 }] },
      { name: 'G', brand: 'H', log: [{ tier: 'ok', t: 1 }] },
      { key: 'i|j', name: 'I', brand: 'J', log: [{ tier: 'ok', t: 1 }], extra: 'pct' },
    ]),
  });
  const wd = createStamps(dirty, { now: clock() });
  const kept = wd.list();
  ok(kept.length === 2, '脏数据里只有 2 条合格（单条丢弃，不丢全表）', String(kept.length));
  ok(kept.map((r) => r.key).sort().join(',') === 'a|b,i|j',
    '留下的是两条合法记录', kept.map((r) => r.key).join(','));
  wd.stamp(BOTTLE, 'love');
  ok(!/"extra"|pct/.test(dirty.getItem(STAMP_KEY)), '写入后多余键被彻底清掉',
    dirty.getItem(STAMP_KEY).slice(0, 140));
}

console.log('\n===== ⑥ 上限 200：满了拒绝新的一瓶，不静默丢弃 =====');
{
  const store = new MemStore();
  const s = createStamps(store, { now: clock() });
  for (let i = 0; i < STAMP_MAX; i++) s.stamp({ name: 'P' + i, brand: 'B' }, 'ok');
  ok(s.list().length === STAMP_MAX, `存满 ${STAMP_MAX} 瓶`, String(s.list().length));

  const oldest = s.list()[s.list().length - 1].key;
  const rej = s.stamp({ name: 'overflow', brand: 'B' }, 'love');
  ok(rej.ok === false && rej.status === 'full', '第 201 瓶被拒且状态是 full',
    JSON.stringify(rej.status));
  ok(rej.limit === STAMP_MAX, '拒绝时回带上限值，UI 可直接提示', String(rej.limit));
  ok(s.list().length === STAMP_MAX, '拒绝后长度不变（没有偷偷挤掉最旧）',
    String(s.list().length));
  ok(s.get({ name: 'overflow', brand: 'B' }) === null, '被拒的那瓶确实没进记录');
  ok(s.list().some((r) => r.key === oldest), '最旧的一条仍完好（不静默丢弃）', oldest);

  /* 满额时给**已在记录里的瓶**再盖：不算新增，必须成功（与心仪 L1 同一条） */
  const again = s.stamp({ name: 'P0', brand: 'B' }, 'meh');
  ok(again.ok && s.get({ name: 'P0', brand: 'B' }).log.length === 2,
    '满额时给已有瓶再盖仍然成功（不是新增）', JSON.stringify(again.status));
  ok(s.list().length === STAMP_MAX, '满额再盖后长度仍是上限', String(s.list().length));

  /* 撤销掉一瓶腾出位置后可以再盖 */
  s.undo({ name: 'P0', brand: 'B' });
  s.undo({ name: 'P0', brand: 'B' });
  const retry = s.stamp({ name: 'overflow', brand: 'B' }, 'love');
  ok(retry.ok, '腾出一瓶后第 201 瓶可以盖', JSON.stringify(retry.status));
}

console.log('\n===== ⑦ 身份键：归一化按瓶合并，差异不合并（宁可不合并）=====');
{
  ok(stampKeyOf({ name: 'Santal 33', brand: 'Le Labo' }) === stampKeyOf({ name: 'santal  33 ', brand: 'le labo' }),
    '大小写/多余空白归一后是同一瓶');
  ok(stampKeyOf({ name: 'Ｓantal 33', brand: 'Le Labo' }) === stampKeyOf({ name: 'Santal 33', brand: 'Le Labo' }),
    '全角字母经 NFKC 折叠后是同一瓶');
  ok(stampKeyOf({ name: 'Santal 33', brand: '' }) !== stampKeyOf({ name: 'Santal 33', brand: 'Le Labo' }),
    '同品名不同品牌**不**合并（宁可两条，也不错合并两瓶）');
  ok(stampKeyOf({ name: 'Santal 33', brand: 'Le Labo' }) !== stampKeyOf({ name: 'Santal 33 EDP', brand: 'Le Labo' }),
    '同品牌不同品名不合并');
  ok(stampKeyOf({}) === '' && stampKeyOf(null) === '', '没有瓶名 → 空键（不允许落盘）');

  /* 落盘键里的分隔符：用 '|' 且只在两段之间出现一次 */
  const k = stampKeyOf({ name: 'a|b', brand: 'c' });
  ok(k.split('|').length >= 2 && k.endsWith('|c'), '身份键形如 name|brand', k);
}

console.log('\n===== ⑧ 与档案键互不干扰（只新增自己的键，不改旧字段）=====');
{
  const store = new MemStore();
  const s = createStamps(store, { now: clock() });
  s.stamp(BOTTLE, 'love');

  const rec = makeHistoryRecord(
    { results: [{ perfume: { id: 'x1', name: 'Santal 33', brand: 'Le Labo' }, reasons: ['因为'] }] },
    { family: 'woody' },
    1763700000000,
  );
  addHistory(store, rec);

  const hist = readHistory(store);
  ok(hist.length === 1, '档案照常写入 1 条', String(hist.length));
  ok(Object.keys(hist[0]).sort().join(',') === 'entry,results,t',
    '档案记录仍只有 t/entry/results 三键（旧字段一个没动）', Object.keys(hist[0]).join(','));
  ok(hist[0].results.every((r) => Object.keys(r).sort().join(',') === 'brand,name'),
    '档案每瓶仍只有 name/brand');
  const histRaw = store.getItem(HISTORY_KEY);
  ok(!/love|tier|tasting/.test(histRaw), '盖章的档位没有漏进档案键', histRaw);
  ok(!/因为|woody/.test(store.getItem(STAMP_KEY)), '档案的回答没有漏进盖章键');
  ok(store.getItem(STAMP_KEY) !== histRaw, '两个键各自独立存储');

  /* 反方向：清掉档案不影响盖章 */
  store.removeItem(HISTORY_KEY);
  ok(s.get(BOTTLE) != null, '清掉档案后盖章记录完好');
  /* 清掉盖章不影响档案（清空键只有自己的） */
  s.clear();
  ok(store.getItem(STAMP_KEY) == null, 'clear 只删自己那个键');
  addHistory(store, rec);
  ok(readHistory(store).length === 1, '清掉盖章后档案仍可正常读写');
}

console.log('\n===== ⑨ 源码层守卫：纯数据层、无 DOM、无上传 =====');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/stamp.js'), 'utf8');
  /* 扫代码前先剥注释：文件头那段刻意提到了 src/history.js 与心仪清单
     （用来解释"为什么用同一个前缀""为什么不联动"）——
     不剥就会把解释当成依赖，报出假阳性。假阳性的代价不是"多看一眼"，
     是会让人把这条守卫关掉。 */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  ok(src.includes("'scent-picker.tasting.v1'"), '源码里键名与约定逐字一致');
  ok(!/document\.|window\.|querySelector|classList|innerHTML/.test(code),
    '数据层不碰 DOM（无 document/window 选择器）');
  ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(code), '没有任何上传路径');
  ok(/export function createStamps/.test(src), '提供可注入存储的 createStamps 工厂（可测）');
  ok(!/from\s+'\.\/history|from\s+'\.\/stamp-ui|import\s+\{/.test(code),
    '数据层不反向依赖档案层与 UI 层（无任何 import）');
  ok(!/wishlist|心仪/.test(code), '数据层里没有任何「自动加进心仪」的联动代码');
}

console.log('\n===== 试香盖章数据层测试 =====');
console.log(`PASS ${pass}  FAIL ${fails.length}`);
if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exitCode = 1;
}
