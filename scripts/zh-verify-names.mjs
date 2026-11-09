/* 中文香名：从品牌池里读出候选 → 用「反向查询」做因果闭环验证
 *
 * 为什么不用「<中文品牌> <拉丁香名>」验证：那条路一定返回 0 条。
 * 实测过两次（`Yves Saint Laurent Libre` → 无结果，`Libre` → 有结果），
 * 拼品牌进查询词会把召回打成 0。
 *
 * 正确的闭环是反过来的：
 *   1. 从品牌池的标题里读到「这一瓶的中文名」（如 Club de Nuit Milestone → 里程）
 *   2. **单独**用这个中文名去搜（`里程 香水`）
 *   3. 看搜回来的标题里有没有**这一瓶的拉丁区分词**（milestone）
 *   命中了才说明「里程 = Milestone」这个对应关系在淘宝上是真的，
 *   而不是我把系列名当成了款名。
 *
 * 第 3 步就是防 zh-name-scout 报的那个坑：Prada Luna Rossa Black →「红月」，
 * 而「红月」在淘宝同时指 Carbon / Ocean / Black 三款。
 *
 * 用法：node scripts/zh-verify-names.mjs data/.cache/zh-pool-armaf.json
 */
import fs from 'node:fs';
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp } from './lib/union-api.mjs';

const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;
if (!APP_KEY || !SECRET || !ADZONE) { console.error('缺凭证'); process.exit(1); }

const FILE = process.argv[2];
if (!FILE) { console.error('用法: node scripts/zh-verify-names.mjs <pool.json>'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
/* eval 文件按品牌分文件（见 zh-judge-eval.mjs 末尾注释） */
const slug = String(data.brand).toLowerCase().replace(/[^a-z]/g, '');
const EVAL = `data/.cache/zh-judge-eval-${slug}.json`;
if (!fs.existsSync(EVAL)) {
  console.error(`缺少 ${EVAL}，先跑 node scripts/zh-judge-eval.mjs ${FILE}`);
  process.exit(1);
}
const evalRows = JSON.parse(fs.readFileSync(EVAL, 'utf8')).rows || [];

/* 只取 J4（最严档）判过的瓶 —— 中文名从它们的匹配标题里读 */
const picked = evalRows.filter((r) => r.J4 && r.id);
console.log(`${data.brand}：从 J4 通过的 ${picked.length} 瓶里读中文名`);

const FILLER = new Set(['de', 'du', 'la', 'le', 'les', 'the', 'for', 'and', 'of', 'pour', 'by', 'a',
  'an', 'edp', 'edt', 'ml', 'oz', 'spray', 'eau', 'toilette', 'parfum', 'extrait', 'cologne']);
const BRAND_CN = [data.alias, ...(data.aliasAlt || [])].filter(Boolean);
/* 全行业通用的词，不是「这一瓶的名字」 */
const GENERIC = ['香水', '香氛', '浓香', '淡香', '香精', '古龙', '正品', '持久', '留香', '小众',
  '高级', '男女士', '男士', '女士', '中性', '男香', '女香', '男款', '女款', '专用', '同款', '平替',
  '木质', '花香', '果香', '东方', '清新', '美食调', '迪拜', '阿拉伯', '美国', '香港', '直邮',
  '保税', '现货', '礼盒', '套装', '试管', '小样', '分装', '喷雾', '身体', '洗发', '沐浴',
  '补充装', '正装', '大瓶', '限量', '新版', '老版', '经典', '爆款', '热卖', '包邮', '秒发',
  '官方', '旗舰店', '专柜', '联名', '旅行装', '便携', '跨境', '外贸', '黑之黑', '闪耀'];
const GEN_RE = new RegExp(GENERIC.join('|'), 'g');

function cnCandidates(title, brandCnList) {
  let t = title;
  for (const b of brandCnList) t = t.replace(new RegExp(b, 'g'), '|');
  const out = [];
  for (const part of t.split(/[|/\s,，、+＋·・()（）\[\]【】]+/)) {
    const cn = (part.match(/[\u4e00-\u9fa5]+/g) || []).join('');
    if (cn.length < 2) continue;
    const s = cn.replace(GEN_RE, '');
    if (s.length >= 2 && s.length <= 8) out.push(s);
  }
  return out;
}

async function query(q, pageSize = 40) {
  const params = buildTaobaoParams({
    appKey: APP_KEY, secret: SECRET,
    method: 'taobao.tbk.dg.material.optional.upgrade',
    timestamp: gmt8Timestamp(),
    biz: { q, adzone_id: ADZONE, page_no: 1, page_size: pageSize, platform: 2 },
  });
  const res = await fetch(TAOBAO_GATEWAY, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const node = JSON.parse(await res.text());
  if (node.error_response) return { n: 0, titles: [], err: node.error_response.sub_msg || node.error_response.msg };
  const d = unwrapTaobao(node, 'taobao.tbk.dg.material.optional.upgrade');
  const list = d?.result_list?.map_data || [];
  return {
    n: list.length,
    titles: list.map((it) => (it.item_basic_info || {}).title || ''),
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ');

const results = [];
for (const r of picked) {
  const title = r.J4.title;
  const latin = r.toks.filter((t) => t.length >= 3);
  if (!latin.length) continue;
  const cnList = cnCandidates(title, BRAND_CN);
  if (!cnList.length) { console.log(`· ${r.name}: 标题里读不出中文名`); continue; }

  /* 逐个候选中文名做反向查询，看能不能把这一瓶的拉丁区分词搜回来 */
  const tries = [];
  for (const cn of cnList.slice(0, 2)) {
    const q = `${cn} 香水`;
    const got = await query(q);
    await sleep(650);
    const low = got.titles.map(norm);
    /* 区分词 = 最长的那个拉丁词（milestone / mirage / parfait …） */
    const key = latin.slice().sort((a, b) => b.length - a.length)[0];
    const hit = low.filter((t) => t.includes(key)).length;
    tries.push({ cn, q, n: got.n, key, hit });
  }
  const best = tries.slice().sort((a, b) => b.hit - a.hit)[0];
  const ok = best && best.hit > 0;
  results.push({ id: r.id, name: r.name, latin, best, tries, ok });
  console.log(`${ok ? '✓' : '✗'} ${r.name.padEnd(32)} cn=${best?.cn || '-'} n=${best?.n ?? 0} key=${best?.key} hit=${best?.hit ?? 0}`);
}

const good = results.filter((r) => r.ok);
console.log(`\n反向验证通过 ${good.length}/${results.length}`);
const out = `data/.cache/zh-verified-${String(data.brand).toLowerCase().replace(/[^a-z]/g, '')}.json`;
fs.writeFileSync(out, JSON.stringify({ brand: data.brand, alias: data.alias, results }, null, 1));
console.log(`写出 ${out}`);
