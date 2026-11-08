/* 判据精度实验：0.6 阈值放进来的错配有多少、收紧到多少才不误杀

   已知问题（probe-brand-pool 的 13 条 PASS 里至少 5 条是错的）：
     Club de Nuit Urban Man Elixir → CLUB NUIT URBAN      （漏 Elixir）
     Club de Nuit Blue Iconic      → CLUB NUIT ICONIC     （漏 Blue）
     Tag Him Prestige              → TAG HIM              （漏 Prestige）
     The Lion's Club Majestueux    → The Lion's Club Monarque（不同款）
     Odyssey Pink Pop              → Odyssey Soda Pop     （Pink≠Soda）
     Hunter for Man                → HUNTER JUNGLE        （for/man 是停用词）

   共同点：**漏掉的那个词恰好是区分款式的那个**。系列前缀（Club de Nuit /
   Odyssey / Tag Him）在标题里一定会有，它们没有区分度。

   这个脚本把候选池落盘，然后离线比较四种判据：
     T1 现行 cover >= 0.6
     T2 cover == 1.0（所有非停用词都必须命中）
     T3 T2 + 至少 2 个非停用词（单词名太容易撞）
     T4 T2 + 末词必须命中（末词通常是款式区分词）
*/
import fs from 'node:fs';
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp, normalizeTokens, categoryGate } from './lib/union-api.mjs';

const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;
const aliases = JSON.parse(fs.readFileSync('data/brand-aliases.json', 'utf8'));
const classB = JSON.parse(fs.readFileSync('C:/Users/16256/ego/classB.json', 'utf8'));

const POOL_FILE = 'C:/Users/16256/ego/pool-raw-Armaf.json';

async function page(keyword, pageNo, pageSize = 100) {
  const params = buildTaobaoParams({
    appKey: APP_KEY, secret: SECRET,
    method: 'taobao.tbk.dg.material.optional.upgrade',
    timestamp: gmt8Timestamp(),
    biz: { q: keyword, adzone_id: ADZONE, page_no: pageNo, page_size: pageSize, platform: 2 },
  });
  const res = await fetch(TAOBAO_GATEWAY, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const node = JSON.parse(await res.text());
  if (node.error_response) return [];
  const data = unwrapTaobao(node, 'taobao.tbk.dg.material.optional.upgrade');
  return (data?.result_list?.map_data || []).map((it) => {
    const b = it.item_basic_info || {};
    const p = it.publish_info || {};
    return { title: b.title || '', categoryText: b.category_name || '', clickUrl: p.click_url || '', itemId: it.item_id };
  });
}

/* 四种判据共用同一套切词与类目门禁，只在「最终 accept」上不同 */
function judge(perfume, cand, mode) {
  const titleLower = String(cand.title || '').toLowerCase();
  const titleTokens = new Set(normalizeTokens(cand.title));
  const gate = categoryGate(cand.title, cand.categoryText);
  if (!gate.ok) return { accept: false, cover: 0, reason: gate.reason };

  const brandRaw = String(perfume.brand || '');
  const als = [brandRaw, ...(aliases[brandRaw] || [])];
  const hitOne = (a) => {
    const s = String(a || '').trim().toLowerCase();
    if (!s) return false;
    if (/[\u4e00-\u9fa5]/.test(s)) return titleLower.includes(s);
    return normalizeTokens(s).some((t) => t.length > 1 && titleTokens.has(t));
  };
  const brandHit = als.some(hitOne);

  const toks = normalizeTokens(perfume.name).filter((t) => t.length > 1 || /[\u4e00-\u9fa5]/.test(t));
  const hitToks = toks.filter((t) => titleTokens.has(t));
  const cover = toks.length ? hitToks.length / toks.length : 0;

  const want = genderOf(perfume.name); const got = genderOf(cand.title);
  const clash = (want.female && !want.male && got.male && !got.female) ||
                (want.male && !want.female && got.female && !got.male);

  let accept = false;
  if (brandHit && !clash) {
    if (mode === 'T1') accept = cover >= 0.6;
    else if (mode === 'T2') accept = cover === 1;
    else if (mode === 'T3') accept = cover === 1 && toks.length >= 2;
    else if (mode === 'T4') accept = cover === 1 && toks.length >= 2 && titleTokens.has(toks[toks.length - 1]);
  }
  return { accept, cover, toks: toks.join(','), reason: accept ? '' : 'rejected' };
}

function genderOf(s) {
  const t = String(s || '').toLowerCase();
  if (/男女/.test(t)) return { male: false, female: false };
  return {
    male: /\b(man|men|homme|males?|masculin)\b/.test(t) || /男士|男性|男款/.test(t),
    female: /\b(woman|women|femme|females?|feminin)\b/.test(t) || /女士|女性|女款/.test(t),
  };
}

function bestOf(perfume, pool, mode) {
  let best = null;
  for (const c of pool) {
    const j = judge(perfume, c, mode);
    if (!j.accept) continue;
    if (!best || j.cover > best._cover) best = { ...c, ...j, _cover: j.cover };
  }
  return best;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let pool;
  if (fs.existsSync(POOL_FILE)) {
    pool = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
    console.log(`复用已落盘候选池 ${pool.length} 条`);
  } else {
    pool = [];
    for (let pg = 1; pg <= 3; pg++) {
      for (const kw of ['阿玛芙 香水', '阿玛芙']) {
        const r = await page(kw, pg);
        await sleep(700);
        pool.push(...r);
      }
    }
    const seen = new Set();
    pool = pool.filter((c) => c.itemId && !seen.has(c.itemId) && seen.add(c.itemId));
    fs.writeFileSync(POOL_FILE, JSON.stringify(pool, null, 1));
    console.log(`采集候选池 ${pool.length} 条，已落盘`);
  }

  const bottles = classB.filter((p) => p.brand === 'Armaf');
  for (const mode of ['T1', 'T2', 'T3', 'T4']) {
    const rows = bottles.map((p) => ({ p, m: bestOf(p, pool, mode) })).filter((r) => r.m);
    console.log(`\n===== ${mode}：${rows.length}/${bottles.length} 接受 =====`);
    if (mode === 'T4' || mode === 'T3') {
      for (const r of rows) console.log('  ', r.p.name.slice(0, 34).padEnd(36), '|', String(r.m.title).slice(0, 52));
    }
  }
})();
