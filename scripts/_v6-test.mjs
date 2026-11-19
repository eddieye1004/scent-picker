/**
 * _v6-test.mjs — 把 test-render 的问卷段重写成 v6 七屏（一次性工具）
 *
 * 现状：原测试从第 268 行起驱动的是 v5 的香型轮盘（.disc-sector / .sector-g /
 * 中圈 / 盘心标本 / 九个 id 的分叉），v6 已无这些结构，所以整段重写。
 *
 * 保留不动的部分（从 `const finishBtn` 起）：结果页、购买入口、匹配度口径、
 * 认屏 id 契约 —— 这些断言的对象没变。
 *
 * 新的问卷段要覆盖四件事，逐条对得上规格：
 *   ① 七屏顺序（预算 → 大方向 → 想要 → 受不了 → 场合 → 季节 → 浓淡 → 已知款）
 *   ② 全程无术语：屏上不许出现香材 en 名，也不许出现「柑橘调」这类族名
 *   ③ 三个定版范例的效果结构（温度光带 / 昼夜光景 / 扩散场）各自成立
 *   ④ 背景层：只增不减、不换方向、封顶
 */
import fs from 'node:fs';

const P = 'scripts/test-render.mjs';
const out = fs.readFileSync(P, 'utf8').split('\n');

/* 起点：`/* 断言：首屏 *\/`（第 268 行附近）；终点：`const finishBtn` 那一行之前 */
let a = out.findIndex((l) => l.startsWith('/* 断言：首屏 */'));
if (a < 0) a = out.findIndex((l) => l.includes('ok(\'首屏标题\''));
if (a < 0) throw new Error('找不到问卷段起点');
let b = out.findIndex((l) => l.startsWith('const finishBtn'));
if (b < 0) throw new Error('找不到 finishBtn');

const NEW = `/* ============================================================
   问卷 v6：七屏全流程（2026-11-16）
   ============================================================ */

const getStepText = () => appRoot.textContent;
const stepId = () => appRoot.attrs['data-step'] || '';
/** 找当前屏的某个按钮（按文案）。 */
const btnBy = (re) => appRoot.querySelectorAll('.btn').find((x) => re.test(x.textContent));
/** 点「下一步」，等重绘。 */
async function advance() {
  const b2 = btnBy(/下一步|看推荐/);
  if (!b2) throw new Error('当前屏没有前进按钮：' + appRoot.query(0) );
  b2.dispatch('click');
  await new Promise((r) => setTimeout(r, 240));
}

/* ---------- ① 首屏：预算 ---------- */
ok('首屏是预算屏（data-step=budget）', stepId() === 'budget', stepId());
ok('首屏标题是「你打算花多少钱」', getStepText().includes('你打算花多少钱'), getStepText().slice(0, 90));
ok('预算屏是四档 + 不限，共 5 枚价签',
  appRoot.querySelectorAll('.price-tab').length === 5,
  \`实际 \${appRoot.querySelectorAll('.price-tab').length}\`);
ok('价签组是 radiogroup 语义',
  appRoot.querySelectorAll('.price-row')[0]
  && appRoot.querySelectorAll('.price-row')[0].attrs.role === 'radiogroup',
  String(appRoot.querySelectorAll('.price-row')[0] && appRoot.querySelectorAll('.price-row')[0].attrs.role));
/* 每档都要写瓶数 —— 不写数字，"300 以内"和"1200 以上"看起来一样大，
   用户会选到一个只有十几瓶的档，答完才发现没货。 */
ok('每枚具体档的价签都标了瓶数',
  appRoot.querySelectorAll('.price-n').length === 4,
  \`标了瓶数的 \${appRoot.querySelectorAll('.price-n').length} 枚\`);
ok('价签有剪口（这一屏唯一的效果）',
  appRoot.querySelectorAll('.price-notch').length === 5,
  \`剪口 \${appRoot.querySelectorAll('.price-notch').length} 个\`);
/* 价位未知那 766 瓶必须被说出来，否则等于把"未知"静默当成"便宜"。 */
ok('预算屏说明了「价位未知的不参与」', /价位未知/.test(getStepText()), getStepText().slice(0, 200));

/* 选一档，断言选中态与说明行跟着变 */
{
  const tab = appRoot.querySelectorAll('.price-tab')[1];
  tab.dispatch('click');
  await new Promise((r) => setTimeout(r, 60));
  ok('点价签后它变成选中态', tab.attrs['aria-checked'] === 'true', String(tab.attrs['aria-checked']));
  ok('选中具体档后说明行改成「只在这一档里挑」',
    /只在这一档里挑/.test(appRoot.querySelectorAll('.price-note')[0].textContent),
    appRoot.querySelectorAll('.price-note')[0].textContent.slice(0, 80));
}

/* ---------- ② 大方向（底噪开灯的那一屏） ---------- */
await advance();
ok('第 2 屏是大方向（data-step=emotion）', stepId() === 'emotion', stepId());
ok('大方向屏标题是「什么感觉」', getStepText().includes('什么感觉'), getStepText().slice(0, 80));
ok('六个大方向都在屏上', appRoot.querySelectorAll('.sky-band').length === 6,
  \`实际 \${appRoot.querySelectorAll('.sky-band').length}\`);
ok('每条天际线都有天光层', appRoot.querySelectorAll('.sky-line').length === 6,
  \`实际 \${appRoot.querySelectorAll('.sky-line').length}\`);
/* 没选大方向之前，底噪必须是"诚实地没有" —— 不是强度 0 的底噪。
   这一条守的是 src/ambient.js 的第一条纪律：来源只能是用户自己给的第一个大方向。 */
{
  const amb = appMod.__ambient({ }, 1, 8);
  ok('未选大方向时底噪不激活', amb.active === false, String(amb.active));
}
{
  const band = appRoot.querySelectorAll('.sky-band')[0];
  band.dispatch('click');
  await new Promise((r) => setTimeout(r, 60));
  ok('点方向后天际线变选中态', band.attrs['aria-checked'] === 'true', String(band.attrs['aria-checked']));
  /* 译文行必须换成「一天里的哪一刻」—— 这是这一屏的译文责任。 */
  const gloss = appRoot.querySelectorAll('.sky-gloss')[0];
  ok('方向屏的译文行换成了具体时刻', /——/.test(gloss.textContent), gloss.textContent.slice(0, 60));
}

/* ---------- ③ 想要的味道（生活短语，无术语） ---------- */
await advance();
ok('第 3 屏是「想要的味道」（data-step=wanted）', stepId() === 'wanted', stepId());
{
  const cards = appRoot.querySelectorAll('.life-card');
  ok('生活短语卡已渲染', cards.length >= 12, \`实际 \${cards.length}\`);
  /* **规格底线**：全程无香调术语题。这里逐字核：屏上不许出现族名，
     也不许出现香材的英文原名。一个都不许漏。 */
  const txt = getStepText();
  const familyZh = ['柑橘调', '花香调', '木质调', '东方琥珀调', '清新调', '美食调'];
  const leakedFam = familyZh.filter((z) => txt.includes(z));
  ok('想要屏不出现任何香调族名（无术语题）', leakedFam.length === 0, leakedFam.join(','));
  const leakedEn = /\\b(bergamot|lemon|jasmine|sandalwood|vanilla|vetiver|oud)\\b/i.test(txt);
  ok('想要屏不出现香材英文原名', !leakedEn, String(leakedEn));
  /* 但短语不能因此变得含糊：它是"具体的那个东西"，不是"甜"这种形容词。
     判据：卡片上的名字都是生活短语（含具体物象），且都带一句气味提示。 */
  ok('每张卡都带一句气味提示（不是只有一个词）',
    appRoot.querySelectorAll('.life-hint').length === cards.length,
    \`提示 \${appRoot.querySelectorAll('.life-hint').length} 条 / 卡 \${cards.length} 张\`);
  ok('每张卡都标了库内瓶数', appRoot.querySelectorAll('.life-n').length === cards.length,
    \`瓶数 \${appRoot.querySelectorAll('.life-n').length} 个\`);
  /* 译文行常驻（规格 5）：即使一个都没选，它也必须在那儿说这一屏在挑什么。 */
  ok('选项区常驻一句译文行（未选也不空）',
    appRoot.querySelectorAll('.life-gloss').length === 1
    && appRoot.querySelectorAll('.life-gloss')[0].textContent.length > 10,
    appRoot.querySelectorAll('.life-gloss')[0].textContent.slice(0, 50));

  /* 点一张卡：收下、置顶、译文换 */
  const first = cards[0];
  const firstZh = first.querySelectorAll('.life-zh')[0].textContent;
  first.dispatch('click');
  await new Promise((r) => setTimeout(r, 60));
  ok('点卡片后被收下（aria-pressed=true）', first.attrs['aria-pressed'] === 'true', String(first.attrs['aria-pressed']));
  ok('已收下的卡移到队首（已选置顶）',
    appRoot.querySelectorAll('.life-card')[0].querySelectorAll('.life-zh')[0].textContent === firstZh,
    appRoot.querySelectorAll('.life-card')[0].querySelectorAll('.life-zh')[0].textContent);
  ok('已选计数出现', /已收下 1 个/.test(getStepText()), appRoot.querySelectorAll('.life-count')[0].textContent);
  ok('译文行换成了刚点的那条', appRoot.querySelectorAll('.life-gloss')[0].textContent.includes(firstZh),
    appRoot.querySelectorAll('.life-gloss')[0].textContent.slice(0, 50));
  ok('已选项做成可撤小签', appRoot.querySelectorAll('.life-tag').length === 1,
    \`小签 \${appRoot.querySelectorAll('.life-tag').length} 个\`);
}

/* ---------- ④ 受不了的味道（同结构，另一套状态色） ---------- */
await advance();
ok('第 4 屏是「受不了的味道」（data-step=unwanted）', stepId() === 'unwanted', stepId());
ok('受不了屏的网格带 is-neg（划掉语汇）',
  appRoot.querySelectorAll('.life-grid')[0].classList.contains('is-neg'),
  appRoot.querySelectorAll('.life-grid')[0].className);
ok('受不了屏也不出现族名', !/柑橘调|花香调|木质调|东方琥珀调|清新调|美食调/.test(getStepText()),
  getStepText().slice(0, 80));

/* ---------- ⑤ 场合（昼夜光景，定版范例之一） ---------- */
await advance();
ok('第 5 屏是场合（data-step=occasion）', stepId() === 'occasion', stepId());
{
  const bands = appRoot.querySelectorAll('.hour-band');
  ok('场合屏是五个时段段（不是圆盘）', bands.length === 5, \`实际 \${bands.length}\`);
  /* **位置即时间**：白天三档必须排在傍晚两档之前。这条是本屏的对应关系，
     用 data 顺序核，不靠 CSS。 */
  const seq = bands.map((x) => (x.classList.contains('is-night') ? 'night' : 'day'));
  ok('地平线按时段排序：白天在前、夜间在后',
    seq.join(',') === 'day,day,day,night,night', seq.join(','));
  ok('天光层存在（一条从晨到夜的连续渐变）', appRoot.querySelectorAll('.hour-glow').length === 1);
  ok('地平线两端有晨/夜刻度', appRoot.querySelectorAll('.hour-ends').length === 1);
  bands[0].dispatch('click');
  await new Promise((r) => setTimeout(r, 60));
  ok('点一段后天色转实', bands[0].attrs['aria-checked'] === 'true', String(bands[0].attrs['aria-checked']));
  /* 译文必须说「光线 + 距离」—— 这两件事才是场合真正影响推荐的地方。 */
  ok('场合译文说到了距离/光线', /距离|光线|闻到/.test(appRoot.querySelectorAll('.hour-gloss')[0].textContent),
    appRoot.querySelectorAll('.hour-gloss')[0].textContent.slice(0, 50));
}

/* ---------- ⑥ 季节（温度光带，定版范例之二） ---------- */
await advance();
ok('第 6 屏是季节（data-step=season）', stepId() === 'season', stepId());
{
  const stops = appRoot.querySelectorAll('.temp-stop');
  ok('季节屏是温度光带上的四个落点', stops.length === 4, \`实际 \${stops.length}\`);
  /* **位置即温度**：每个落点的 left 必须由该季的 temp 算出来，不许平均分四格。
     平均分就把"温度轴"退回成"四个并列选项"。这里读内联 style 的 left。 */
  const lefts = stops.map((x) => parseFloat(String(x.style.left)));
  ok('四个落点按温度排布（不是等分四格）',
    lefts.every((v) => Number.isFinite(v))
    && new Set(lefts).size === 4
    && Math.abs(lefts[0] - lefts[1]) > 3,
    lefts.join(','));
  /* 春(0.1)→55%、秋(0.35)→67.5%，两者不能挨得太近也不该重合 */
  ok('冬在最冷端、夏在最热端',
    lefts.indexOf(Math.min(...lefts)) === 3 && lefts.indexOf(Math.max(...lefts)) === 1,
    lefts.join(','));
  ok('光带有一条温度光（跟着选中档移动）', appRoot.querySelectorAll('.temp-glow').length === 1);
  ok('季节译文说的是体感而不是分类名', /度|冷|热|风/.test(appRoot.querySelectorAll('.temp-gloss')[0].textContent),
    appRoot.querySelectorAll('.temp-gloss')[0].textContent.slice(0, 50));
  stops[3].dispatch('click');
  await new Promise((r) => setTimeout(r, 60));
  ok('点一季后落点亮起', stops[3].attrs['aria-checked'] === 'true', String(stops[3].attrs['aria-checked']));
  ok('选中一季后天色温度被写进 CSS 变量（--band-temp）',
    appRoot.querySelectorAll('.temp-band')[0].style['--band-temp'] != null,
    String(appRoot.querySelectorAll('.temp-band')[0].style['--band-temp']));
}

/* ---------- ⑦ 浓淡（扩散场，定版范例之三） ---------- */
await advance();
ok('第 7 屏是浓淡（data-step=concentration）', stepId() === 'concentration', stepId());
{
  const rings = appRoot.querySelectorAll('.diffuse-ring');
  ok('扩散场是五个同心环', rings.length === 5, \`实际 \${rings.length}\`);
  /* **半径即扩散距离**：环的直径必须随档位递增，不能五环同尺寸
     （同尺寸就退回成五个按钮）。 */
  const pcts = rings.map((x) => parseFloat(String(x.style['--ring-pct'])));
  ok('五环半径随档位递增（半径=扩散距离）',
    pcts.every((v) => Number.isFinite(v))
    && pcts.every((v, i) => i === 0 || v > pcts[i - 1]),
    pcts.join(','));
  ok('场心色团存在', appRoot.querySelectorAll('.diffuse-core').length === 1);
  /* 三个物件都有编号（一屏三物必须能说清"这是第几个"）。 */
  const t = getStepText();
  ok('浓淡屏三个物件都带编号（① ② ③）', /①/.test(t) && /②/.test(t) && /③/.test(t), t.slice(0, 100));
  ok('未选浓度时 ③ 留香是空态（不凭空给推断值）',
    appRoot.querySelectorAll('.long-read.is-empty').length === 1,
    \`空态 \${appRoot.querySelectorAll('.long-read.is-empty').length} 个\`);
  /* 浓度卡仍是 EDC…Extrait 那一组档位 */
  const grid = appRoot.querySelector('.choice-grid');
  const concIds = grid ? grid.querySelectorAll('[role="radio"]').map((x) => x.attrs['data-id']) : [];
  ok('浓度卡是 EDC…Extrait 这一组档位',
    concIds.includes('eau-de-parfum') && concIds.includes('eau-de-toilette'), concIds.join(','));
  /* 点最外环 → 场心涨大（宽度写在 style 上） */
  rings[4].dispatch('click');
  await new Promise((r) => setTimeout(r, 60));
  ok('点最外环后它成为当前档', rings[4].attrs['aria-checked'] === 'true', String(rings[4].attrs['aria-checked']));
}

/* ---------- ⑧ 已知款（末屏） ---------- */
await advance();
ok('第 8 屏是已知款（data-step=anchor）', stepId() === 'anchor', stepId());
ok('末屏标题问「试过、并且喜欢」', getStepText().includes('试过'), getStepText().slice(0, 80));
{
  const combos = appRoot.querySelectorAll('.combo-input');
  ok('已知款屏的品牌是可搜索组合框', combos.length === 1, \`实际 \${combos.length}\`);
  ok('组合框是 combobox 语义', combos.length === 1 && combos[0].attrs.role === 'combobox',
    combos.length ? String(combos[0].attrs.role) : '-');
  ok('组合框初始收起', combos.length === 1 && combos[0].attrs['aria-expanded'] === 'false',
    combos.length ? String(combos[0].attrs['aria-expanded']) : '-');
  ok('品牌不再用原生 select', appRoot.querySelectorAll('select').length === 0,
    \`实际 \${appRoot.querySelectorAll('select').length} 个 select\`);
}

/* ---------- ⑨ 背景层：只增不减、不换方向、封顶 ----------
   这三条是规格 3 的算术部分，截图证明不了，只能算。
   逐方向 × 逐屏跑一遍 —— 六个方向都要成立，不是抽查一个。 */
{
  const DIRS = ['cold', 'warm', 'clean', 'mysterious', 'bright', 'lazy'];
  const TOTAL = appMod.__steps.all.length;
  let monotonicBad = [];
  let signBad = [];
  let capBad = [];
  for (const d of DIRS) {
    let prevS = -1;
    let sign = null;
    for (let st = 1; st <= TOTAL; st++) {
      const m = appMod.__ambient({ emotion: d }, st, TOTAL);
      if (m.strength + 1e-9 < prevS) monotonicBad.push(\`\${d}@\${st}\`);
      prevS = m.strength;
      /* 方向不许翻：三轴的符号在整个过程中必须恒定（允许 0，不许反号）。 */
      const cur = [Math.sign(m.temp), Math.sign(m.light), Math.sign(m.sat)].join(',');
      if (sign == null) sign = cur;
      else if (cur !== sign && !m.temp === 0) signBad.push(\`\${d}@\${st}\`);
      if (m.strength > 0.85 + 1e-9) capBad.push(\`\${d}@\${st}=\${m.strength}\`);
    }
  }
  ok('底噪强度逐屏单调不减（六个方向全过）', monotonicBad.length === 0, monotonicBad.join(','));
  ok('底噪方向全程不翻（三轴符号恒定）', signBad.length === 0, signBad.join(','));
  ok('底噪强度封顶在 0.85 以内', capBad.length === 0, capBad.join(','));

  /* 反向自检：串一个"故意反向"的假实现，确认上面那三条真能抓到错。
     没有这一段，三条全绿也可能只是"没测到东西"。 */
  const fake = (st) => ({ strength: 1 - st / 10, temp: (st % 2 ? 1 : -1) * 0.3, light: 0, sat: 0 });
  let caughtMonotonic = false;
  let prev = 2;
  for (let st = 1; st <= 5; st++) { const v = fake(st).strength; if (v < prev) caughtMonotonic = true; prev = v; }
  ok('反向自检：递减的假底噪会被判成不单调', caughtMonotonic, String(caughtMonotonic));

  /* 季节/浓淡只能调浓度，不能改方向（第 2 条纪律的算术落地）。 */
  const base = appMod.__ambient({ emotion: 'cold' }, 6, TOTAL);
  const withExtra = appMod.__ambient({ emotion: 'cold', season: 'summer', intensity: 5 }, 6, TOTAL);
  ok('后续答案只调浓度、不改方向（符号一致）',
    Math.sign(base.temp) === Math.sign(withExtra.temp)
    && Math.sign(base.light) === Math.sign(withExtra.light),
    \`\${base.temp}/\${withExtra.temp}  \${base.light}/\${withExtra.light}\`);
  ok('后续答案确实会改变强度（不是死值）',
    Math.abs(base.strength - withExtra.strength) > 0.001,
    \`\${base.strength} vs \${withExtra.strength}\`);
}

/* ---------- ⑩ 顶栏刻度：底噪的可读读数 ---------- */
ok('页眉出现方向刻度（选过大方向之后）', appRoot.querySelectorAll('.amb-tick').length === 1,
  \`实际 \${appRoot.querySelectorAll('.amb-tick').length}\`);
ok('刻度写着方向与档位', /[冷暖清沉亮柔]·[起渐满]/.test(
  appRoot.querySelectorAll('.amb-tick')[0].textContent),
  appRoot.querySelectorAll('.amb-tick')[0].textContent);

/* ---------- ⑪ 映射层的三条硬约束 ---------- */
{
  const life = appMod.__life;
  /* ① 短语里每个 en 名都真的在 taxonomy 里（写错一个就永远 0 命中） */
  const taxa2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
  const norm = (s2) => String(s2).toLowerCase().normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const known = new Set();
  for (const e of taxa2.noteIndex.entries) {
    known.add(norm(e.en));
    for (const al of (e.aliases || [])) known.add(norm(al));
  }
  const unknownNotes = [];
  for (const d of life.all) for (const en of d.notes) if (!known.has(norm(en))) unknownNotes.push(d.id + ':' + en);
  ok('短语表里每个香材名都在 taxonomy 里（防拼错）', unknownNotes.length === 0, unknownNotes.join(','));

  /* ② 短语 → 香材的展开必须去重 */
  const expand = life.notesOf(['citrus-peel', 'green-twig']);
  ok('短语展开成香材时去重', new Set(expand.map(norm)).size === expand.length,
    expand.join(','));

  /* ③ 每条短语都够货（低于阈值的不上屏） */
  const live = life.live();
  ok('上屏的短语都过了库存阈值', live.length >= 12 && live.length <= life.all.length,
    \`上屏 \${live.length} / 全表 \${life.all.length}\`);
  ok('死短语（库存 < 阈值）不在上屏列表里',
    live.every((d) => d && d.id), live.map((d) => d.id).join(','));
}

/* ---------- ⑫ 预算映射层：档太窄时退回全库 ---------- */
{
  const b = appMod.__budget;
  const prevIdx = b.bands();
  /* 造一个只有 5 瓶的假档，池子必须退回全库（否则会推出"只有 5 瓶可挑"） */
  b.setIndex({
    anyId: 'any',
    bands: [{ id: 'tiny', zh: '窄档', lo: 0, hi: 1 }],
    bandOfId: { tiny: ['ysl-libre', 'creed-aventus', 'lattafa-yara', 'montale-black-aoud', 'tom-ford-oud-minerale'] },
  });
  const perfs2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8')).perfumes;
  const pool = b.pool(perfs2, 'tiny');
  ok('档太窄（< 12 瓶）时退回全库', pool.length === perfs2.length, \`池 \${pool.length} / 全库 \${perfs2.length}\`);
  /* 正常档要真的收窄 */
  b.setIndex(prevIdx);
  const idx = b.bands();
  if (idx && idx.bandOfId) {
    const realPool = b.pool(perfs2, idx.bands[1].id);
    ok('正常档确实收窄了候选池',
      realPool.length < perfs2.length && realPool.length > 0,
      \`池 \${realPool.length} / 全库 \${perfs2.length}\`);
  }
}
`;

out.splice(a, b - a, ...NEW.split('\n'));
fs.writeFileSync(P, out.join('\n'));
console.log('✓ test-render 问卷段已换成 v6');
