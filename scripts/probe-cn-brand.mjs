/* 决定性实验：767 次「无结果」能不能用「中文别名 + 香水」+ page_size=100 救回来

   已知事实（前几轮实测）：
     · 纯拉丁香名查询，淘宝经常返回 0 条（`Reflection Man` 只返回英文原版书）
     · 中文查询能救回来：`English Pear Freesia` n=0，`祖玛珑 英国梨` n=19（page_size=100 时 n=99）
     · 但「拉丁品牌 + 拉丁香名」拼查询词会把召回打成 0（`Yves Saint Laurent Libre` → 无结果）

   所以这条路的关键是：**中文品牌别名 + 香水**（不拼香名），page_size=100，
   然后在这一页里按香名匹配。问题只剩一个：一页 100 条里能不能覆盖到目标香名。

   本脚本对缺链瓶抽样，逐瓶跑三种查询，看目标香名能否出现在结果里。
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp, scoreMatch, normalizeTokens } from './lib/union-api.mjs';
import { BRAND_ALIAS_ADD } from './lib/brand-alias-add.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;

const perfumesRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8'));
const perfumes = perfumesRaw.perfumes || perfumesRaw;
const links = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/affiliate-links.json'), 'utf8'));
const have = new Set(Object.keys(links.taobao || {}));
const oldAliases = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/brand-aliases.json'), 'utf8'));

/* 抽样：缺链 + 有中文别名候选 + 按品牌分散（同一品牌只取 1 瓶） */
const missing = perfumes.filter((p) => !have.has(p.id));
const seen = new Set();
const sample = [];
for (const p of missing) {
  const cn = (BRAND_ALIAS_ADD[p.brand] || []).filter((a) => /[\u4e00-\u9fa5]/.test(a));
  if (!cn.length) continue;
  if (seen.has(p.brand)) continue;
  seen.add(p.brand);
  sample.push({ p, cn: cn[0] });
  if (sample.length >= 10) break;
}

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
      return { title: b.title || '', cat: b.category_name || '', itemId: it.item_id };
    }),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

(async () => {
  const out = [];
  for (const { p, cn } of sample) {
    const nameToks = normalizeTokens(p.name).filter((t) => t.length >= 3);
    const line = { id: p.id, brand: p.brand, name: p.name, cn };

    // A. 中文别名 + 香水，100 条
    const a = await query(`${cn} 香水`, 100);
    await sleep(260);
    // B. 中文别名 + 香水首词，100 条
    const first = p.name.split(/[\s,]+/).filter((w) => w.length >= 3)[0] || p.name;
    const b = await query(`${cn} ${first}`, 100);
    await sleep(260);

    for (const [tag, r] of [['A_cn100', a], ['B_cnfirst', b]]) {
      const hit = r.items.filter((it) => {
        const t = strip(it.title);
        return nameToks.length ? nameToks.every((k) => t.includes(strip(k))) : false;
      });
      line[tag] = { n: r.n, hit: hit.length, sample: hit.slice(0, 2).map((x) => x.title.slice(0, 60)), err: r.err || '' };
    }
    out.push(line);
    console.log(
      (line.A_cn100.hit || line.B_cnfirst.hit) ? 'HIT ' : 'miss',
      p.brand.padEnd(22), p.name.slice(0, 24).padEnd(26),
      `A n=${String(line.A_cn100.n).padStart(3)} hit=${line.A_cn100.hit}`,
      `B n=${String(line.B_cnfirst.n).padStart(3)} hit=${line.B_cnfirst.hit}`,
      line.A_cn100.err ? 'err=' + line.A_cn100.err : ''
    );
  }

  const hitCount = out.filter((x) => x.A_cn100.hit > 0 || x.B_cnfirst.hit > 0).length;
  console.log(`\n救回 ${hitCount}/${out.length} = ${(hitCount / out.length * 100).toFixed(0)}%`);
  fs.writeFileSync(path.join(ROOT, 'data/.cache/cn-brand-probe.json'), JSON.stringify(out, null, 2));
  console.log('明细 → data/.cache/cn-brand-probe.json');
})();
