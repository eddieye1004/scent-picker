/* 中文香名调研 第 6 步：量化「拉丁香名在淘宝标题里的可见度」

   报告的核心归因需要一个全局数字，不能只靠 6 瓶探针。
   对 40 瓶逐个查**拉丁全名**（去重音），统计：
     · 召回条数 n
     · 其中标题同时含「该瓶拉丁核心词」+「中文品牌名」的条数（= 可当锚点的标题）
   锚点为 0 意味着：即使淘宝有货，标题里也不写拉丁名 → 无法把中文名对上号。
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp } from './lib/union-api.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;

const deaccent = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const GENERIC = new Set(['woman', 'women', 'man', 'men', 'for', 'her', 'him', 'pour', 'femme', 'homme',
  'unisex', 'edition', 'the', 'de', 'du', 'des', 'la', 'le', 'les', 'and', 'by', 'of', 'a', 'au',
  'gold', 'black', 'blue', 'brown', 'white', 'red', 'pink', 'green', 'purple', 'silver',
  'intense', 'elixir', 'extreme', 'sport', 'profumo', 'i', 'she']);

async function query(q, pageSize = 100) {
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
  if (node.error_response) return { n: 0, err: node.error_response.sub_msg || node.error_response.msg, items: [] };
  const data = unwrapTaobao(node, 'taobao.tbk.dg.material.optional.upgrade');
  const list = data?.result_list?.map_data || [];
  return {
    n: list.length,
    items: list.map((it) => {
      const b = it.item_basic_info || {};
      return { title: b.title || '', cat: b.category_name || '' };
    }),
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/.cache/zh-name-sample.json'), 'utf8'));
const out = [];

for (const b of sample) {
  const nm = deaccent(b.name);
  const words = nm.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w && w.length > 2 && !GENERIC.has(w));
  const core = words.slice(-1)[0] || nm;

  const r = await query(nm);
  /* 锚点：标题同时含拉丁核心词与中文品牌名 */
  const anchor = r.items.filter((it) => {
    const t = deaccent(it.title).toLowerCase();
    return t.includes(core.toLowerCase()) && it.title.includes(b.brandCn);
  }).length;
  /* 拉丁核心词在标题里出现的条数（不看品牌） */
  const coreHit = r.items.filter((it) => deaccent(it.title).toLowerCase().includes(core.toLowerCase())).length;

  out.push({ id: b.id, brandCn: b.brandCn, name: b.name, core, q: nm, n: r.n, coreHit, anchor });
  console.log(
    (anchor ? 'ANCHOR' : 'NO-ANC').padEnd(7),
    b.brandCn.padEnd(6), b.name.slice(0, 30).padEnd(32),
    `n=${String(r.n).padStart(3)} 含核心词=${String(coreHit).padStart(3)} 锚点=${String(anchor).padStart(3)}`
  );
  await sleep(230);
}

fs.writeFileSync(path.join(ROOT, 'data/.cache/zh-name-latin-visibility.json'), JSON.stringify(out, null, 2));

const zero = out.filter((x) => x.n === 0).length;
const noAnchor = out.filter((x) => x.anchor === 0).length;
const withAnchor = out.filter((x) => x.anchor > 0).length;
console.log(`\n=== 拉丁全名查询可见度 ===`);
console.log(`零召回（拉丁名完全搜不到）：${zero}/40 = ${(zero / 40 * 100).toFixed(0)}%`);
console.log(`有召回但锚点为 0（有货却不写拉丁名）：${out.filter((x) => x.n > 0 && x.anchor === 0).length}/40`);
console.log(`有锚点（能对上中文名）：${withAnchor}/40 = ${(withAnchor / 40 * 100).toFixed(0)}%`);
