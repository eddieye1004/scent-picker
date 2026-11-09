/* 中文香名调研 第 2b 步：摸清「中文名能不能从召回标题里读出来」

   第 2 步的自动抽取失败，原因已实测：品牌池 100 条标题里拉丁香名几乎不出现
   （娇兰 38%、爱慕 4%、祖玛珑 42% 的标题含拉丁词，但含**该瓶拉丁香名**的是 0）。
   拉丁名不在标题里 → 没有锚点 → 无法把中文串配到拉丁名上。

   这一步换问法：对同一瓶试 6 种查询形状，看哪种能把「含拉丁锚点 + 中文名」
   的标题捞回来。捞回来的标题就是中文名的来源（有出处）。
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

/* 6 瓶探针：跨品牌、跨拉丁名难度（单词 / 多词 / 带重音 / 系列名） */
const PROBE = [
  { brand: 'Armaf', brandCn: '阿玛芙', name: 'Club de Nuit Milestone' },
  { brand: 'Armaf', brandCn: '阿玛芙', name: 'Odyssey Spectra Blue Edition' },
  { brand: 'Guerlain', brandCn: '娇兰', name: 'Mitsouko' },
  { brand: 'Jo Malone London', brandCn: '祖玛珑', name: 'English Pear & Freesia' },
  { brand: 'Lancôme', brandCn: '兰蔻', name: 'Ô de Lancôme' },
  { brand: 'Nishane', brandCn: '尼山', name: 'Wūlóng Chá' },
];

const out = [];
for (const p of PROBE) {
  const nm = deaccent(p.name);
  const core = nm.split(/\s+/).filter((w) => w.length > 2).slice(-1)[0] || nm;
  const shapes = [
    ['拉丁全名', nm],
    ['拉丁品牌+名', `${deaccent(p.brand)} ${nm}`],
    ['中文品牌+拉丁名', `${p.brandCn} ${nm}`],
    ['纯核心词', core],
    ['中文品牌+核心词', `${p.brandCn} ${core}`],
    ['中文品牌+系列词', `${p.brandCn} ${nm.split(/\s+/)[0]}`],
  ];
  const row = { ...p, shapes: [] };
  for (const [label, q] of shapes) {
    const r = await query(q);
    /* 锚点判据：标题里同时含该瓶拉丁核心词 & 中文品牌名 —— 这样的标题才能当来源 */
    const anchored = r.items.filter((it) => {
      const t = deaccent(it.title).toLowerCase();
      return t.includes(core.toLowerCase()) && it.title.includes(p.brandCn);
    });
    row.shapes.push({
      label, q, n: r.n, err: r.err || '',
      anchored: anchored.length,
      anchoredTitles: anchored.slice(0, 3).map((x) => x.title.slice(0, 78)),
    });
    console.log(
      label.padEnd(12), `"${q}"`.padEnd(38),
      `n=${String(r.n).padStart(3)}`, `锚点=${anchored.length}`,
      anchored[0] ? '| ' + anchored[0].title.slice(0, 42) : ''
    );
    await sleep(250);
  }
  out.push(row);
  console.log('');
}

fs.writeFileSync(path.join(ROOT, 'data/.cache/zh-name-shapes.json'), JSON.stringify(out, null, 2));
console.log('→ data/.cache/zh-name-shapes.json');
