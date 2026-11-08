/* 验证二：香名侧的重音与标点

   已知品牌侧：`Frédéric Malle 香水` 0 条，`Frederic Malle 香水` 20 条；
   `Lancôme` 6 条 → `Lancome` 20 条。说明淘宝分词对拉丁重音字符不容忍。

   香名侧同类问题更多：
     Idôle（同音符号） / Idole / 中文「偶像」
     Love, Don't Be Shy（逗号 + 撇号）
     Angels' Share（撇号）
     Portrait of a Lady（of / a 这类虚词）
     L'Air du Désert Marocain（两个撇号 + 重音）

   判据：同一款，原写法 vs 归一化 vs 去掉虚词，返回里是否有该款（看独特词）。
*/
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp } from './lib/union-api.mjs';

const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;

async function query(q) {
  const params = buildTaobaoParams({
    appKey: APP_KEY, secret: SECRET,
    method: 'taobao.tbk.dg.material.optional.upgrade',
    timestamp: gmt8Timestamp(),
    biz: { q, adzone_id: ADZONE, page_no: 1, page_size: 20, platform: 2 },
  });
  const res = await fetch(TAOBAO_GATEWAY, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const node = JSON.parse(await res.text());
  if (node.error_response) return { n: 0, err: node.error_response.sub_msg || node.error_response.msg, titles: [] };
  const data = unwrapTaobao(node, 'taobao.tbk.dg.material.optional.upgrade');
  const list = data?.result_list?.map_data || [];
  return { n: list.length, titles: list.map((it) => (it.item_basic_info || {}).title || '') };
}

function stripAccents(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
const STOP = new Set(['of', 'the', 'a', 'an', 'and', 'de', 'du', 'la', 'le', 'les', 'des']);
function coreName(s) {
  return stripAccents(s)
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w.toLowerCase()))
    .join(' ')
    .trim();
}

const CASES = [
  { zh: 'Idôle', key: ['idole'], want: 'Lancome Idole' },
  { zh: "Love, Don't Be Shy", key: ['love', 'shy'], want: 'Kilian Love Shy' },
  { zh: "Angels' Share", key: ['angels', 'share'], want: 'Kilian Angels Share' },
  { zh: 'Portrait of a Lady', key: ['portrait', 'lady'], want: 'Frederic Malle Portrait Lady' },
  { zh: "L'Air du Désert Marocain", key: ['air', 'desert', 'marocain'], want: 'Tauer Air Desert' },
  { zh: 'Baccarat Rouge 540', key: ['baccarat', 'rouge'], want: 'MFK Baccarat Rouge' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (const c of CASES) {
    const variants = [
      { label: `原香名 "${c.zh}"`, q: c.zh },
      { label: `去重音 "${stripAccents(c.zh)}"`, q: stripAccents(c.zh) },
      { label: `核心词 "${coreName(c.zh)}"`, q: coreName(c.zh) },
      { label: `品牌+核心词 "${c.want}"`, q: c.want },
      { label: `原香名+香水 "${c.zh} 香水"`, q: `${c.zh} 香水` },
    ];
    console.log(`\n=== ${c.zh}  (关键: ${c.key.join('/')}) ===`);
    for (const v of variants) {
      if (!v.q) { console.log(`  ${v.label.padEnd(34)} 跳过（空）`); continue; }
      const r = await query(v.q);
      const hit = r.titles.filter((t) => {
        const tl = stripAccents(t).toLowerCase();
        return c.key.every((k) => tl.includes(k));
      });
      const mark = hit.length ? `HIT ${hit.length}` : '';
      console.log(`  ${v.label.padEnd(34)} n=${String(r.n).padStart(2)} ${mark}${r.err ? ' err=' + r.err : ''}`);
      if (hit.length) console.log(`      -> ${hit[0].slice(0, 56)}`);
      await sleep(260);
    }
  }
})();
