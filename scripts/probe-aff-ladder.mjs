/* 淘宝关键词降级阶梯 —— 分小批真跑，每批 ≤10 瓶，失败即停。

   为什么要有这个脚本：`fetch-products.mjs` 跑的是全量 1388 瓶、一次 4 个变体、
   写 products.candidates.json；本任务是「把缺链的那 764 瓶按阶梯再试一遍」，
   两者目标不同，混着跑会把全量候选表冲掉。

   阶梯（从最可能命中到最不可能）：
      L0  香名译名裸词          （data/fragrance-aliases.json 的 keywords）
      L1  中文品牌 + 香名译名
      L2  纯香名 / 香名首词     （英文原名，淘宝上常搜不到）
      L3  中文品牌 + 香名首词
      L4  英文品牌 + 香名首词
      L5  中文品牌 + 香水家族   ← 本轮要验证的「品牌 + 家族」降级
      L6  香水家族裸词          ← 只做对照，命中率必然极低，不放行

   **判据不放宽**：pickBest / scoreMatch 原样调用，accept 才记录。
   L5/L6 的意义是"证明它捞不回"，不是"用它捞回"。

   用法：
     node scripts/probe-aff-ladder.mjs --missing --limit 10
     node scripts/probe-aff-ladder.mjs --ids a,b,c --stages 0,1,2,3,4,5
     node scripts/probe-aff-ladder.mjs --missing --limit 10 --dry

   输出：data/.cache/aff-ladder-<日期>.json（只写这个，不碰任何公开数据）
*/
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp, pickBest } from './lib/union-api.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const rj = async (p) => JSON.parse(await readFile(path.join(ROOT, p), 'utf8'));

/* --- 凭证：与 fetch-products.mjs 同一套极简解析，只补未设置的键 --- */
const ENV_LOCAL = path.join(ROOT, '.env.local');
if (existsSync(ENV_LOCAL)) {
  const text = await readFile(ENV_LOCAL, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const eq = s.indexOf('=');
    if (eq < 1) continue;
    const k = s.slice(0, eq).trim();
    let v = s.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
for (const k of ['TB_APP_KEY', 'TB_APP_SECRET', 'TB_ADZONE_ID']) {
  if (!process.env[k]) { console.error(`缺环境变量 ${k}（键名，值从不打印）`); process.exit(1); }
}

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const DRY = flag('--dry');
const RESUME = flag('--resume');
const LIMIT = Number(opt('--limit', '0')) || 0;
const ONLY = (opt('--ids', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const STAGES = (opt('--stages', '0,1,2,3,4,5') || '').split(',').map(Number);
const GAP = Number(process.env.UNION_MIN_GAP_MS || 350);

const perfumes = (await rj('data/perfumes.json')).perfumes;
const byId = new Map(perfumes.map((p) => [p.id, p]));
const ALIAS = await rj('data/brand-aliases.json');
const FRAG = await rj('data/fragrance-aliases.json');
const aff = await rj('data/affiliate-links.json');
const have = new Set(Object.keys(aff.taobao || {}));

/* 香水家族的中文说法。这是**本脚本的对照假设**，不是数据表 ——
   L5/L6 就是拿来证伪它的，所以不值得单独维护一份映射表。 */
const FAMILY_ZH = {
  citrus: '柑橘调', floral: '花香调', woody: '木质调',
  amber: '东方琥珀调', fresh: '清新调', gourmand: '美食调',
};
function primaryFamily(p) {
  const f = p.families || {};
  let best = null; let w = -1;
  for (const [k, v] of Object.entries(f)) if (Number(v) > w) { w = Number(v); best = k; }
  return best;
}

function branches(p) {
  const frag = FRAG[p.id] || null;
  const bn = String(p.brand || '').trim();
  const cnBrand = (ALIAS[bn] || []).find((s) => /[\u4e00-\u9fa5]/.test(s)) || '';
  const nm = String(p.name || '').trim();
  const head = nm.split(/[,(（]/)[0].trim();
  const kw = (frag?.keywords || []).filter(Boolean);
  const fam = primaryFamily(p);
  const famZh = FAMILY_ZH[fam] || '';
  const L = [
    kw,                                                    // L0 译名裸词
    kw.map((k) => (cnBrand ? `${cnBrand} ${k}` : '')),      // L1 中文品牌+译名
    [nm, head],                                            // L2 英文香名
    [cnBrand ? `${cnBrand} ${head}` : ''],                 // L3 中文品牌+香名首词
    [bn ? `${bn} ${head}` : ''],                           // L4 英文品牌+香名首词
    [cnBrand && famZh ? `${cnBrand} ${famZh}` : ''],       // L5 中文品牌+家族
    [famZh],                                               // L6 家族裸词
  ];
  return L.map((qs, i) => ({
    stage: i,
    queries: [...new Set(qs.map((q) => String(q || '').trim()).filter(Boolean))],
  }));
}

function mapTaobao(node) {
  const list = node?.result_list?.map_data || [];
  return list.map((it) => {
    const flat = { ...it, ...(it.item_basic_info || {}), ...(it.publish_info || {}), ...(it.price_promotion_info || {}) };
    return {
      platform: 'taobao',
      itemId: it.item_id ?? flat.item_id ?? flat.num_iid,
      title: flat.title || flat.short_title || '',
      price: flat.zk_final_price ?? null,
      shop: flat.shop_title || flat.nick || '',
      clickUrl: flat.click_url || '',
      pictUrl: flat.pict_url || '',
      whiteImage: flat.white_image || '',
      categoryText: `${flat.level_one_category_name || ''}/${flat.category_name || ''}`,
    };
  });
}

let lastCall = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function query(q) {
  const gap = GAP - (Date.now() - lastCall);
  if (gap > 0) await sleep(gap);
  lastCall = Date.now();
  const params = buildTaobaoParams({
    appKey: process.env.TB_APP_KEY, secret: process.env.TB_APP_SECRET,
    method: 'taobao.tbk.dg.material.optional.upgrade',
    timestamp: gmt8Timestamp(),
    biz: { q, adzone_id: process.env.TB_ADZONE_ID, page_no: 1, page_size: 20, platform: 2 },
  });
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.append(k, String(v));
  const res = await fetch(TAOBAO_GATEWAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
  const json = JSON.parse(text);
  try {
    return mapTaobao(unwrapTaobao(json, 'taobao.tbk.dg.material.optional.upgrade'));
  } catch (e) {
    if (/无结果/.test(String(e.message))) return [];       // 正常响应，不是错误
    throw e;
  }
}

/* 断点续跑：--resume 会把当天缓存里已经跑过的 id 跳过。
   为什么必须要有：这个阶梯最坏情况一瓶 7 个查询，764 瓶是 5300 次调用。
   中途被限流打断时不重跑已完成的，才能继续小批推进。 */
const CACHE_PREV = path.join(ROOT, 'data/.cache', `aff-ladder-${new Date().toISOString().slice(0, 10)}.json`);
let done = new Set();
if (RESUME && existsSync(CACHE_PREV)) {
  try {
    const prev = await rj(path.relative(ROOT, CACHE_PREV));
    done = new Set((prev.results || []).map((r) => r.id));
    console.log(`续跑：跳过已完成的 ${done.size} 瓶`);
  } catch { /* 缓存坏了就当没续跑 */ }
}

/* 选目标：--ids 优先；否则取缺链的那批，按 popularityRank 升序（有名气的先试） */
let targets;
if (ONLY.length) targets = ONLY.map((id) => byId.get(id)).filter(Boolean);
else {
  targets = perfumes.filter((p) => !have.has(p.id) && !done.has(p.id))
    .sort((a, b) => (a.popularityRank ?? 1e9) - (b.popularityRank ?? 1e9));
}
if (LIMIT) targets = targets.slice(0, LIMIT);
console.log(`目标 ${targets.length} 瓶 · 阶梯 ${STAGES.join(',')} · 间隔 ${GAP}ms`);

const results = [];
const statOf = new Map();
let reqCount = 0;

for (const p of targets) {
  const frag = FRAG[p.id] || null;
  const rec = { id: p.id, brand: p.brand, name: p.name, popularityRank: p.popularityRank ?? null, stages: [] };
  let winner = null;

  try {
    for (const b of branches(p)) {
      if (!STAGES.includes(b.stage)) continue;
      if (winner) break;
      for (const q of b.queries) {
        const cands = await query(q);
        reqCount++;
        if (!cands.length) { rec.stages.push({ stage: b.stage, q, n: 0, verdict: '无结果' }); continue; }
        const best = pickBest(p, cands, ALIAS, frag);
        const ok = Boolean(best?.accept);
        rec.stages.push({
          stage: b.stage, q, n: cands.length, verdict: ok ? 'ACCEPT' : `拒：${best?.reason || '无候选'}`,
          title: best?.title ? String(best.title).slice(0, 60) : null,
        });
        if (ok) {
          winner = { stage: b.stage, q, itemId: best.itemId, title: best.title, clickUrl: best.clickUrl,
            categoryText: best.categoryText, price: best.price, nameVia: best.nameVia };
          break;
        }
      }
    }
  } catch (e) {
    /* 失败即停：接口报错（限流/凭证/网络）不该继续烧配额 */
    console.error(`✗ 中止于 ${p.id}：${String(e.message).slice(0, 200)}`);
    rec.aborted = String(e.message).slice(0, 200);
    results.push(rec);
    break;
  }

  rec.winner = winner;
  results.push(rec);
  const tag = winner ? `ACCEPT@L${winner.stage} 「${winner.q}」` : '未命中';
  console.log(`${winner ? '✓' : '·'} ${p.id}  rank=${p.popularityRank ?? '-'}  ${tag}`);
  const k = winner ? `L${winner.stage}` : '未命中';
  statOf.set(k, (statOf.get(k) || 0) + 1);
}

const accepted = results.filter((r) => r.winner);
console.log(`\n请求 ${reqCount} 次 · 目标 ${targets.length} 瓶 · 命中 ${accepted.length}`);
console.log('命中阶梯分布：' + ([...statOf.entries()].sort().map(([k, v]) => `${k}=${v}`).join('  ') || '（无）'));

/* 未命中的原因分布——按**最后一条有候选的判定**归类，而不是"无结果" */
const reasonOf = new Map();
for (const r of results.filter((x) => !x.winner)) {
  const withCand = [...r.stages].reverse().find((s) => s.n > 0);
  const k = withCand ? withCand.verdict.replace(/：.*$/, '') : '全部阶梯无结果';
  const kk = withCand && /^拒：/.test(withCand.verdict) ? withCand.verdict : k;
  reasonOf.set(kk, (reasonOf.get(kk) || 0) + 1);
}
console.log('\n未命中的最后一层原因：');
for (const [k, v] of [...reasonOf.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);

/* 阶梯级视角：每一层的命中数 / 出现次数（证明 L5/L6 捞不回） */
const byStage = new Map();
for (const r of results) for (const s of r.stages) {
  const cur = byStage.get(s.stage) || { runs: 0, hits: 0 };
  cur.runs++; if (s.verdict === 'ACCEPT') cur.hits++;
  byStage.set(s.stage, cur);
}
console.log('\n分层统计（阶段 / 查询次数 / 命中）：');
for (const [st, v] of [...byStage.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  L${st}  ${String(v.runs).padStart(4)}  ${String(v.hits).padStart(3)}`);
}

if (DRY) { console.log('\n--dry：不写缓存文件'); process.exit(0); }

const CACHE_OUT = CACHE_PREV;
await mkdir(path.dirname(CACHE_OUT), { recursive: true });
let prev = { results: [] };
if (existsSync(CACHE_OUT)) { try { prev = await rj(path.relative(ROOT, CACHE_OUT)); } catch { /* 空 */ } }
const merged = new Map((prev.results || []).map((r) => [r.id, r]));
for (const r of results) merged.set(r.id, r);     // 新结果覆盖旧结果
const out = {
  generatedAt: new Date().toISOString(),
  stages: STAGES,
  requests: (prev.requests || 0) + reqCount,
  results: [...merged.values()],
};
await writeFile(CACHE_OUT, JSON.stringify(out, null, 1) + '\n', 'utf8');
console.log(`\n已写 ${path.relative(ROOT, CACHE_OUT)}（累计 ${out.results.length} 瓶）`);
console.log('下一步：node scripts/probe-aff-merge.mjs');
