/* 中文香名可行性试点

   决定性事实（本轮实测）：
     Guerlain Mitsouko            拉丁 n=0   → 娇兰 蝴蝶夫人    n=10
     Montale Arabians Tonka       拉丁 n=0   → 蒙塔莱 阿拉伯沉香 n=1
     Jo Malone English Pear       拉丁 n=0   → 祖玛珑 英国梨     n=99
   → 拉丁香名在淘宝搜不到，不是商品不存在，是卖家只写中文名。

   所以提覆盖率的关键是**中文香名**，而我们的数据源（Scento CSV）只有英文名。

   这个脚本做两件事：
     1. 我自己给出中文名候选（人工判断，不是抓来的）
     2. **逐条实测核实** —— 查询后要求标题同时含中文品牌与中文香名，且
        类目必须是香水（`category_name`），并排除周边品类。核实不过的不写。

   输出只包含核实通过的条目，供后续写入 data/perfume-aliases-zh.json。
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTaobaoParams, unwrapTaobao, TAOBAO_GATEWAY, gmt8Timestamp } from './lib/union-api.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_KEY = process.env.TB_APP_KEY;
const SECRET = process.env.TB_APP_SECRET;
const ADZONE = process.env.TB_ADZONE_ID;

/* 试点：18 瓶缺链的知名香水，中文名由我给出，全部待实测 */
const PILOT = [
  { id: 'guerlain-mitsouko', brandCn: '娇兰', nameCn: '蝴蝶夫人' },
  { id: 'montale-arabians-tonka', brandCn: '蒙塔莱', nameCn: '阿拉伯沉香' },
  { id: 'jo-malone-english-pear-and-freesia', brandCn: '祖玛珑', nameCn: '英国梨' },
  { id: 'amouage-reflection-man', brandCn: '爱慕', nameCn: '反射' },
  { id: 'mancera-cedrat-boise', brandCn: '曼塞拉', nameCn: '柠檬雪松' },
  { id: 'dior-diorissimo', brandCn: '迪奥', nameCn: '迪奥小姐' },
  { id: 'creed-spice-and-wood', brandCn: '信仰', nameCn: '香料与木' },
  { id: 'tom-ford-black-orchid-reserve', brandCn: '汤姆福特', nameCn: '黑兰花' },
  { id: 'byredo-sunday-cologne', brandCn: '柏芮朵', nameCn: '星期天古龙' },
  { id: 'le-labo-neroli-36', brandCn: '勒莱柏', nameCn: '橙花36' },
  { id: 'nishane-ani', brandCn: '妮姗', nameCn: '阿尼' },
  { id: 'kilian-intoxicated', brandCn: '凯利安', nameCn: '醉人' },
  { id: 'prada-luna-rossa-black', brandCn: '普拉达', nameCn: '卢娜罗莎' },
  { id: 'versace-dylan-turquoise', brandCn: '范思哲', nameCn: '迪伦' },
  { id: 'mugler-womanity', brandCn: '穆勒', nameCn: '女人味' },
  { id: 'lattafa-badee-al-oud-amethyst', brandCn: '拉塔法', nameCn: '紫水晶' },
  { id: 'armaf-club-de-nuit-milestone', brandCn: '阿玛芙', nameCn: '夜店狂欢' },
  { id: 'maison-margiela-replica-by-the-fireplace', brandCn: '梅森马吉拉', nameCn: '壁炉' },
];

/* 类目白名单：淘宝的 category_name 比标题正则硬得多。
   第一版只看标题里有没有「香氛」二字，于是「香氛护手霜」被判成合格 ——
   那条的类目就是「护手霜」。 */
const CAT_OK = /香水|彩妆香水/;

/* 周边品类：标题或类目命中即排除 */
const NON_PERFUME = ['身体乳', '沐浴', '洗发', '护发', '洗手液', '护手霜', '手霜', '润肤',
  '蜡烛', '香薰机', '扩香', '香皂', '汽车', '香珠', '洗衣', '发膜', '面膜', '乳液', '小样', '试用'];

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
      return { title: b.title || '', cat: b.category_name || '', itemId: it.item_id,
        clickUrl: (it.publish_info || {}).click_url || '' };
    }),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 判据：标题含中文品牌 + 中文香名 + 类目是香水 + 不是周边品类 + 不是小样 */
function judge(title, cat, brandCn, nameCn) {
  const t = String(title);
  const c = String(cat || '');
  const hasBrand = t.includes(brandCn);
  const hasName = t.includes(nameCn);
  const catOk = CAT_OK.test(c);
  const bad = NON_PERFUME.some((w) => t.includes(w)) || NON_PERFUME.some((w) => c.includes(w));
  return { ok: hasBrand && hasName && catOk && !bad, hasBrand, hasName, catOk, bad };
}

(async () => {
  const out = [];
  for (const item of PILOT) {
    const q = `${item.brandCn} ${item.nameCn}`;
    const r = await query(q);
    const judged = r.items
      .map((it) => ({ ...it, ...judge(it.title, it.cat, item.brandCn, item.nameCn) }))
      .filter((x) => x.ok);
    const row = { ...item, q, n: r.n, okCount: judged.length, err: r.err || '',
      best: judged[0] ? { title: judged[0].title.slice(0, 70), itemId: judged[0].itemId, cat: judged[0].cat } : null };
    out.push(row);
    console.log(
      judged.length ? 'PASS' : 'FAIL',
      item.brandCn.padEnd(7) + item.nameCn.padEnd(9),
      `n=${String(r.n).padStart(3)} 合格=${String(judged.length).padStart(2)}`,
      r.err ? 'err=' + r.err : (judged[0] ? '| ' + judged[0].title.slice(0, 44) : '')
    );
    await sleep(240);
  }

  const pass = out.filter((x) => x.okCount > 0);
  console.log(`\n=== 试点结果：${pass.length}/${out.length} = ${(pass.length / out.length * 100).toFixed(0)}% ===`);
  fs.writeFileSync(path.join(ROOT, 'data/.cache/zh-name-pilot.json'), JSON.stringify(out, null, 2));
  console.log('明细 → data/.cache/zh-name-pilot.json');
})();
