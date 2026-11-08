/**
 * 用京东联盟「网页版」给香水批量拿推广短链。
 *
 * 为什么不用 API：本账号是「导购媒体」类型，promotion.common.get 直接回
 * `code 2001701 不支持siteId用于此种方式推广,只支持网站/APP`，
 * bysubunionid / byunionid / position.query 全是 `code 403 无访问权限`，
 * 权限申请没有网页入口（只能发邮件 cps@jd.com）。实测 2026-11-03。
 *
 * 走的是这条：搜索卡片 → 勾选 → 批量推广 → 我要推广 → 导购媒体推广
 * → 投放推广位 → 获取推广链接 → 异步生成 GBK CSV（9 列，带 u.jd.com 短链）。
 * 请求体里明确带 promotionId=3110077372 / promotionType=3 / promotionTypeId=4109592421。
 *
 * 运行方式（必须在 ego-browser 里跑，它自带浏览器上下文）：
 *   ego-browser nodejs -e "await import('file:///.../scripts/fetch-jd-web.mjs')"
 * 环境变量：
 *   JD_TARGETS=360     处理前多少个热门（按 popularityRank 升序）
 *   JD_BATCHES=6       跑几批（每批上限 60）
 *   JD_SEARCH_GAP=800  两次搜索间隔 ms
 *   JD_DRY=1           只搜索匹配、不转链（用来先校准匹配准确率）
 *
 * 断点续跑：进度写在 data/.cache/jd-web-links.json，已成功的 id 会跳过。
 */
import fs from 'node:fs';
import path from 'node:path';
import { scoreMatch, pickBest } from './lib/union-api.mjs';
import { parseJdCsv, diffBatch, BATCH_LIMIT } from './lib/jd-web.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, 'data/.cache');
const TARGETS_FILE = path.join(CACHE, 'jd-web-targets.json');
const OUT_FILE = path.join(CACHE, 'jd-web-links.json');
const CONFIG_FILE = path.join(CACHE, 'jd-web-config.json');

/* ego-browser nodejs 既不继承 shell 环境变量、也不传 argv（实测 2026-11-03：
   JD_DRY=1 ego-browser ... 里 process.env.JD_DRY 是 undefined，
   process.argv 只有一个 ego.exe）。所以参数走配置文件，env 只作可选覆盖。 */
const cfg = (() => {
  try {
    /* PowerShell 的 Set-Content -Encoding UTF8 会写 BOM（实测 239,187,191），
       直接 JSON.parse 会抛异常 → cfg 变 {} → dry 被当成 false 真的去转链。
       必须剥掉 BOM 再解析。 */
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch { return {}; }
})();
const pick = (envKey, cfgKey, dflt) => {
  const e = process.env[envKey];
  if (e !== undefined && e !== '') return e;
  return cfg[cfgKey] !== undefined ? cfg[cfgKey] : dflt;
};

const TARGETS = Number(pick('JD_TARGETS', 'targets', 360));
const BATCHES = Number(pick('JD_BATCHES', 'batches', 6));
const GAP = Number(pick('JD_SEARCH_GAP', 'gap', 800));
const DRY = String(pick('JD_DRY', 'dry', '0')) === '1' || pick('JD_DRY', 'dry', false) === true;

const SEARCH_URL = 'https://union.jd.com/proManager/index?pageNo=1';
const MEDIA_NAME = process.env.JD_MEDIA_NAME || '香水推荐器ScentPicker';
const POSITION_NAME = process.env.JD_POSITION_NAME || '香水推荐器主站';

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 状态 ---------- */

function loadState() {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')); } catch { raw = null; }
  /* 早期 pilot 版本把 results 写成数组（[{id,...}]），这里做一次迁移，
     否则 results[t.id] 恒为 undefined，会重复处理已经转过的瓶。 */
  if (Array.isArray(raw?.results)) {
    const asMap = {};
    for (const r of raw.results) if (r?.id) asMap[r.id] = r;
    raw.results = asMap;
  }
  return {
    startedAt: raw?.startedAt || new Date().toISOString(),
    results: raw?.results && !Array.isArray(raw.results) ? raw.results : {},
    batches: Array.isArray(raw?.batches) ? raw.batches : [],
  };
}
function saveState(st) {
  st.updatedAt = new Date().toISOString();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(st, null, 1));
}

/* ---------- 页面操作 ---------- */

/* task.pages() 是 async 的（ego-browser 实测），别当同步数组用 */
async function findPage(task) {
  const pages = await task.pages();
  for (const p of pages || []) {
    const pg = task.page(p.label);
    const url = await pg.url();
    if (/union\.jd\.com/.test(url)) return pg;
  }
  return task.page(pages[0].label);
}

const CNT_RE = /已选\s*(\d+)\s*\/\s*(\d+)/;

async function selectedCount(pg) {
  const t = await pg.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const m = t.match(CNT_RE);
  return m ? Number(m[1]) : 0;
}

async function clearSelection(pg) {
  await pg.evaluate(() => localStorage.removeItem('batchData'));
  await pg.reload();
  await pg.waitForTimeout(4200);
}

/** 搜一个关键词，返回当前页所有卡片 { skuId, title, checked } */
async function searchCards(pg, q) {
  await pg.evaluate((qq) => {
    const inp = [...document.querySelectorAll('input')].find((i) => /请输入您要搜索的商品名称或商品ID/.test(i.placeholder || ''));
    if (!inp) throw new Error('搜索框不在页面上');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    inp.focus();
    setter.call(inp, qq);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }, q);
  await pg.waitForTimeout(350);
  await pg.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /搜索全部商品/.test(x.innerText || '') && x.getBoundingClientRect().width > 0);
    if (!b) throw new Error('搜索按钮不在页面上');
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  /* 等结果真的换了：卡片里的 skuId 集合连续两次相同、且与搜索词无关的限制不管，
     只保证「有卡片 + 至少 200ms 没变化」，避免读到上一轮结果。 */
  let last = '';
  for (let i = 0; i < 24; i++) {
    await pg.waitForTimeout(350);
    const sig = await pg.evaluate(() => [...document.querySelectorAll('.card.search-card')].slice(0, 3)
      .map((c) => c.querySelector('a[title]')?.getAttribute('href') || '').join('|'));
    if (sig && sig === last) break;
    last = sig;
  }

  return await pg.evaluate(() => [...document.querySelectorAll('.card.search-card')].map((c) => {
    const a = c.querySelector('a[title]');
    const href = a?.getAttribute('href') || '';
    const m = href.match(/item\.jd\.com\/(\d+)\.html/);
    return {
      skuId: m ? m[1] : '',
      title: (a?.getAttribute('title') || '').trim(),
      checked: !!c.querySelector('.el-checkbox.is-checked'),
    };
  }).filter((x) => x.skuId && x.title));
}

async function tickCard(pg, skuId) {
  return await pg.evaluate((sku) => {
    const card = [...document.querySelectorAll('.card.search-card')]
      .find((c) => c.querySelector(`a[href*="item.jd.com/${sku}"]`));
    const cb = card && card.querySelector('.el-checkbox');
    if (!cb) return 'no-card';
    if (cb.classList.contains('is-checked')) return 'already';
    cb.click();
    return 'clicked';
  }, skuId);
}

/** 批量转链：返回 CSV 文本（GBK 已解码） */
async function convertBatch(pg) {
  const ok = await pg.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /批量推广/.test(x.innerText || '') && x.getBoundingClientRect().width > 0);
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const rc = b.getBoundingClientRect();
    return { x: Math.round(rc.x + rc.width / 2), y: Math.round(rc.y + rc.height / 2) };
  });
  if (!ok) throw new Error('找不到「批量推广」按钮');
  await pg.mouse.click(ok.x, ok.y);
  await pg.waitForTimeout(1500);

  const opened = await pg.evaluate(() => {
    const li = [...document.querySelectorAll('li')].find((x) => (x.innerText || '').trim() === '我要推广' && x.getBoundingClientRect().height > 0);
    if (!li) return false;
    li.click();
    return true;
  });
  if (!opened) throw new Error('「我要推广」菜单没出现');
  await pg.waitForTimeout(3200);

  const step = async (fn, wait) => { const r = await pg.evaluate(fn); await pg.waitForTimeout(wait); return r; };

  await step(() => {
    const dlg = [...document.querySelectorAll('.el-dialog')].find((x) => x.getBoundingClientRect().height > 0 && /生成推广链接/.test(x.innerText || ''));
    const lab = dlg && [...dlg.querySelectorAll('label, .el-radio')].find((x) => (x.innerText || '').trim() === '导购媒体推广');
    lab && lab.click();
  }, 1700);

  await step(() => {
    const i = [...document.querySelectorAll('.el-dialog input')].find((x) => x.placeholder === '请选择导购媒体');
    i && (i.click(), i.focus());
  }, 1400);

  await step((name) => {
    const it = [...document.querySelectorAll('.el-select-dropdown')].filter((d) => d.getBoundingClientRect().height > 0)
      .flatMap((d) => [...d.querySelectorAll('.el-select-dropdown__item')])
      .find((x) => (x.innerText || '').trim() === name);
    it && it.click();
  }, 1900);

  await step(() => {
    const i = [...document.querySelectorAll('.el-dialog input')].find((x) => x.placeholder === '请输入推广位');
    i && (i.click(), i.focus());
  }, 1400);

  await step((name) => {
    const it = [...document.querySelectorAll('.el-select-dropdown')].filter((d) => d.getBoundingClientRect().height > 0)
      .flatMap((d) => [...d.querySelectorAll('.el-select-dropdown__item')])
      .find((x) => (x.innerText || '').trim() === name);
    it && it.click();
  }, 1900);

  /* 提交前清空抓包缓冲 —— 只认这一次的响应 */
  await pg.evaluate(() => { window.__jdCaps = []; });
  await pg.evaluate(() => {
    const dlg = [...document.querySelectorAll('.el-dialog')].find((x) => x.getBoundingClientRect().height > 0 && /生成推广链接/.test(x.innerText || ''));
    const btn = dlg && [...dlg.querySelectorAll('button')].find((b) => /获取推广链接/.test(b.innerText || ''));
    if (!btn) throw new Error('「获取推广链接」按钮没找到');
    btn.click();
  });

  /* 等 CSV URL 出现，最多 45 秒 */
  let csvUrl = '';
  for (let i = 0; i < 45; i++) {
    await pg.waitForTimeout(1000);
    csvUrl = await pg.evaluate(() => {
      const hit = (window.__jdCaps || []).find((x) => /storage\.jd\.com.*\.csv/.test(x.resp || ''));
      if (!hit) return '';
      try { return JSON.parse(hit.resp).data || ''; } catch { return ''; }
    });
    if (csvUrl) break;
  }
  if (!csvUrl) throw new Error('45 秒内没拿到 CSV 地址');

  /* CSV 在页面里 fetch（同源策略无关，storage.jd.com 允许跨域），GBK 解码 */
  const text = await pg.evaluate(async (u) => {
    const res = await fetch(u);
    const buf = await res.arrayBuffer();
    return new TextDecoder('gbk').decode(buf);
  }, csvUrl);
  return { csvUrl, text };
}

/* 装 XHR 钩子：只抓 api.m.jd.com 的响应体 */
async function installHook(pg) {
  await pg.evaluate(() => {
    if (window.__jdHooked) return;
    window.__jdHooked = true;
    window.__jdCaps = [];
    const XO = XMLHttpRequest.prototype.open;
    const XS = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u, ...r) { this.__u = u; return XO.call(this, m, u, ...r); };
    XMLHttpRequest.prototype.send = function (b) {
      const self = this;
      try {
        if (this.__u && /api\.m\.jd\.com/.test(this.__u)) {
          const rec = { resp: '' };
          window.__jdCaps.push(rec);
          self.addEventListener('load', () => { try { rec.resp = String(self.responseText); } catch { /* noop */ } });
        }
      } catch { /* noop */ }
      return XS.call(this, b);
    };
  });
}

/* ---------- 主流程 ---------- */

const targets = JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf8')).slice(0, TARGETS);
const aliases = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/brand-aliases.json'), 'utf8'));
const state = loadState();

const task = await taskSpace(0);
const pg = await findPage(task);
await pg.goto(SEARCH_URL, { waitUntil: 'domcontentloaded' });
await pg.waitForTimeout(4500);
await installHook(pg);

const todo = targets.filter((t) => !state.results[t.id]);
log(`目标 ${targets.length} 瓶，已完成 ${targets.length - todo.length}，待处理 ${todo.length}`);

let batchNo = state.batches.length;
let pending = []; // [{ id, skuId }]
let accepted = 0, rejected = 0;

async function flush(reason) {
  if (!pending.length) return;
  batchNo++;
  const want = pending.map((p) => p.skuId);
  log(`第 ${batchNo} 批：${pending.length} 条，开始转链（${reason}）`);
  const { csvUrl, text } = await convertBatch(pg);
  const rows = parseJdCsv(text);
  const bySku = new Map(rows.map((r) => [String(r.skuId), r]));
  const d = diffBatch(want, rows);
  let hit = 0;
  for (const p of pending) {
    const r = bySku.get(String(p.skuId));
    if (!r) continue;
    state.results[p.id] = {
      skuId: p.skuId,
      matchedTitle: p.matchedTitle,
      csvTitle: r.title,
      shortUrl: r.shortUrl,
      couponUrl: r.couponUrl,
      price: r.price,
      finalPrice: r.finalPrice,
      commissionRate: r.commissionRate,
      commission: r.commission,
      sales30d: r.sales30d,
      batch: batchNo,
    };
    hit++;
  }
  state.batches.push({
    batch: batchNo,
    wanted: want.length,
    got: rows.length,
    saved: hit,
    missing: d.missing,
    csvUrl,
    at: new Date().toISOString(),
  });
  saveState(state);
  log(`第 ${batchNo} 批完成：CSV ${rows.length} 行，落库 ${hit}，缺 ${d.missing.length}`);
  pending = [];
  await clearSelection(pg);
}

let idx = 0;
for (const t of todo) {
  idx++;
  if (batchNo >= BATCHES) break;

  const q = `${t.brand} ${t.name}`;
  let cards = [];
  try {
    cards = await searchCards(pg, q);
  } catch (e) {
    log(`✗ ${t.id} 搜索失败：${e.message}`);
    continue;
  }
  const best = pickBest(t, cards, aliases);
  const verdict = best && best.accept ? '✓' : '✗';
  if (!best || !best.accept) {
    rejected++;
    log(`${verdict} ${t.id}  ${cards.length}候选  ${best ? best.score : 0}  ${best ? best.reason : '无候选'}`);
    await sleep(GAP);
    continue;
  }
  accepted++;
  log(`${verdict} ${t.id}  → ${best.skuId}  ${best.title.slice(0, 34)}`);

  if (DRY) { await sleep(GAP); continue; }

  const tick = await tickCard(pg, best.skuId);
  if (tick === 'no-card') {
    log(`  ! 卡片找不到，跳过`);
    await sleep(GAP);
    continue;
  }
  pending.push({ id: t.id, skuId: best.skuId, matchedTitle: best.title });

  const n = await selectedCount(pg);
  if (n >= BATCH_LIMIT) await flush('满 60');
  await sleep(GAP);
}

if (!DRY && pending.length) await flush('目标跑完');

log(`结束：接受 ${accepted}，拒绝 ${rejected}，已落库 ${Object.keys(state.results).length} 瓶`);
if (accepted && !DRY) log(`匹配准确率（接受/尝试）= ${((accepted / (accepted + rejected)) * 100).toFixed(1)}%`);
