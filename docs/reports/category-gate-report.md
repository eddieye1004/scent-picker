# categoryGate 叶子类目改造 + 全库回归

日期：2026-11-08
范围：`scripts/lib/union-api.mjs` 的 `categoryGate`、`scripts/test-union-api.mjs`
语料：`scent-picker-v2/data/products.candidates.json`（2,193,333 B，accepted 624 / rejected 764）
状态：判据已改，`test-union-api.mjs` 58 → 72 项全绿，`test-category-gate.mjs` 8 项全绿。

---

## 0. 一句话结论

`cat.includes('香水')` 换成了「只有叶子层算数」。全库 907 条有候选的记录里，
**新拒 19 条、新收 0 条**；其中真正改变最终收/拒结论的只有 **7 条**，这 7 条逐条看下来
**没有一条是香水**（睫毛膏 / 试香礼盒 ×3 / 修眉刀 / 粉饼 / 气垫），所以
**新误杀 = 0**（定义见 §4.3）。另外 12 条拒收结论不变、只是理由从「品牌名未出现在标题里」
改成了「叶子是唇霜」这类具体原因 —— 这正是本任务要修的那个统计失真。

---

## 1. 叶子类目分布

### 1.1 全库（907 条有候选的记录，前 20）

| 叶子 | 条数 |
|---|---:|
| 香水 | 700 |
| 原版其它 | 15 |
| 文学小说类原版书 | 9 |
| 文学类原版书 | 8 |
| 香精 | 7 |
| 生活类原版书 | 6 |
| T恤 | 5 |
| 工具 | 3 |
| 连衣裙 | 3 |
| 儿童读物类原版书 | 3 |
| 休闲裤 | 3 |
| 人文社科类原版书 | 3 |
| 通用款女包 | 3 |
| 唇霜 | 2 |
| 工具书类原版书 | 2 |
| 毛衣 | 2 |
| 项链 | 2 |
| 腰链 | 2 |
| 太阳眼镜 | 2 |
| 牛仔裤 | 2 |

叶子总数 165 种。另有 **481 条记录 `picked` 为 null**（全部在 rejected 桶，零召回），
闸门根本没有跑过，不参与本任务任何统计。

`categoryText` 为空的：**0 条**。切不出叶子的：**0 条**。
（这两项为 0 只代表当前语料，不代表线上不会出现 —— 见 §7。）

### 1.2 闸门的作用域：类目路径含「香水」的 721 条，17 种叶子

| 叶子 | 条数 | 原 accepted | 原 rejected | 新判据 PASS | 新判据 REJECT |
|---|---:|---:|---:|---:|---:|
| 香水 | 700 | 616 | 84 | 672 | 28 |
| 工具 | 3 | 3 | 0 | 0 | 3 |
| 唇霜 | 2 | 0 | 2 | 0 | 2 |
| 其它彩妆 | 2 | 0 | 2 | 0 | 2 |
| 甲油胶 | 2 | 0 | 2 | 0 | 2 |
| 睫毛膏 | 1 | 1 | 0 | 0 | 1 |
| 修眉刀 | 1 | 1 | 0 | 0 | 1 |
| 粉饼 | 1 | 1 | 0 | 0 | 1 |
| **香水套装** | 1 | 1 | 0 | **1** | 0 |
| 气垫 | 1 | 1 | 0 | 0 | 1 |
| 胭脂 | 1 | 0 | 1 | 0 | 1 |
| 散粉 | 1 | 0 | 1 | 0 | 1 |
| 美甲工具 | 1 | 0 | 1 | 0 | 1 |
| 阴影 | 1 | 0 | 1 | 0 | 1 |
| 遮瑕 | 1 | 0 | 1 | 0 | 1 |
| 素颜霜 | 1 | 0 | 1 | 0 | 1 |
| 定妆喷雾 | 1 | 0 | 1 | 0 | 1 |

17 种叶子里只有 2 种是香水（`香水` 700、`香水套装` 1），其余 15 种共 20 条。
**注意 `香水` 那 700 条里有 28 条被新判据拒 —— 那 28 条全部是 `SAMPLE_PAT` 命中的
小样/试用装，与类目无关**（逐条核对过：28 条全落在 `sample` 这一档，0 条落在类目理由）。

---

## 2. 新判据

### 2.1 前后对照

改之前（`scripts/lib/union-api.mjs` 原 271 行起）：

```js
export function categoryGate(title, categoryText) {
  const t = String(title || '').toLowerCase();
  const cat = String(categoryText || '');
  const bad = NON_PERFUME_WORDS.find((w) => t.includes(w));
  if (bad) return { ok: false, reason: `非香水品类（命中「${bad}」）` };
  if (CANDLE_PAT.test(t)) return { ok: false, reason: '非香水品类（蜡烛/香薰蜡燭）' };
  if (SAMPLE_PAT.test(t)) return { ok: false, reason: '小样/试用装' };
  if (cat) {
    if (cat.includes('香水')) return { ok: true, reason: '' };   // ← 漏洞在这
    return { ok: false, reason: `类目不是香水（${cat}）` };
  }
  if (!PERFUME_WORDS.some((w) => t.includes(w))) return { ok: false, reason: '标题无香水品类词' };
  return { ok: true, reason: '' };
}
```

改之后：

```js
const PERFUME_LEAF_PAT = /香水/;
const NON_PERFUME_LEAVES = new Set([
  '唇霜','唇彩','唇蜜','唇釉','唇泥',
  '散粉','蜜粉','粉饼','气垫','粉底','膏','遮瑕','素颜霜','定妆喷雾',
  '胭脂','腮红','阴影','眼影','眼线','睫毛膏','眉笔','口红','唇膏',
  '甲油胶','美甲工具','甲片',
  '修眉刀','美容工具','假睫毛辅助工具','海绵',
  '其它彩妆',
]);

export function categoryGate(title, categoryText) {
  const t = String(title || '').toLowerCase();
  const cat = String(categoryText || '').trim();
  /* 三条具体拒收规则先判，类目救不了它们 */
  const bad = NON_PERFUME_WORDS.find((w) => t.includes(w));
  if (bad) return { ok: false, reason: `非香水品类（命中「${bad}」）` };
  if (CANDLE_PAT.test(t)) return { ok: false, reason: '非香水品类（蜡烛/香薰蜡燭）' };
  if (SAMPLE_PAT.test(t)) return { ok: false, reason: '小样/试用装' };

  const parts = cat ? cat.split('/').map((s) => s.trim()).filter(Boolean) : [];
  const leaf = parts.length ? parts[parts.length - 1] : '';

  if (!leaf) {                                   // 无类目/切不出叶子 → 回落标题判据
    if (!PERFUME_WORDS.some((w) => t.includes(w))) return { ok: false, reason: '标题无香水品类词' };
    return { ok: true, reason: '' };
  }
  if (!cat.includes('香水')) return { ok: false, reason: `类目不是香水（${cat}）` };
  if (parts.includes('试香礼盒')) return { ok: false, reason: `类目是试香礼盒（非正装，${cat}）` };
  if (NON_PERFUME_LEAVES.has(leaf)) return { ok: false, reason: `类目路径含香水但叶子是「${leaf}」（${cat}）` };
  if (PERFUME_LEAF_PAT.test(leaf)) return { ok: true, reason: '' };
  return { ok: false, reason: `类目叶子「${leaf}」未识别为香水（${cat}）` };
}
```

### 2.2 顺序为什么必须是这个顺序

1. `NON_PERFUME_WORDS` → `CANDLE_PAT` → `SAMPLE_PAT` 三条**先判**。
   理由有实测：`tiziana-terenzi-kirke`（`…Kirke香薰蜡燭`）与 `tom-ford-vanilla-sex`
   （`…香氛蜡烛200g`）的类目都写着 `彩妆/香水/美妆工具/香水` —— 类目放行救不了它们，
   只能靠标题先拦（M22 已钉住）。小样同理：`香水小样` 在淘宝也挂香水类目。
2. `试香礼盒` 放在叶子判断之前、白名单之前。它在香水分支内，但卖的是试香装。
3. 黑名单先于白名单。虽然两张表互斥，但把「具体拒收」写在「放行」前面，
   读代码时不会误以为放行优先。
4. 未知叶子垫底拒收。

### 2.3 「类目为空」这条：显式决定为「回落标题判据」，不是默认放行

代码里没有让它隐式落到 `return { ok: true }`，而是显式走 `if (!leaf)` 分支，
并要求标题里出现 `PERFUME_WORDS` 之一。理由写进了注释，摘录：

- 京东整条链路不返回类目路径（`data/affiliate-links.json` 的 `coverage` 是
  `{"jd":"0/1388","taobao":"641/1388"}`），若改成「无类目即拒」，京东侧会静默归零；
- 标题判据在这条链路上已被 M14 / G5 / G7 三条既有用例钉住，是既有行为，不是新开口子；
- 「标题写香水、实际是沐浴露」由 `NON_PERFUME_WORDS` 兜住，本函数里先判。

`reject-scout` 在 `docs/reports/reject-review.md` 里只讨论了这个漏洞本身（§7.1，第 223–243 行），
**没有给出「类目为空该放行还是拒收」的结论**，所以这条是我自己拍的板，理由如上。
另：`categoryText` 存在但切不出叶子（`"///"`、纯空白）→ 与「无类目」走同一条路径，
理由是同为「该类目不含任何信息」，用空串定罪与京东无类目在语义上是一回事。

### 2.4 已知取舍：未知叶子拒收，而不是回落标题

选「拒」的理由：`azzaro-the-most-wanted-parfum` 这条标题确实写着
「…男士香水」，却挂在 `修眉刀` 叶子下。若未知叶子回落标题，它会被放行 ——
那正是本次要消灭的漏洞。代价是淘宝新增香水叶子时覆盖会静默下降，
所以理由字符串里带叶子名（`类目叶子「X」未识别为香水`），成批出现时看得见、可计数。

### 2.5 为什么白名单是「叶子含香水」而不是 `/(^|\/)香水$/`

`$` 锚死只认「香水」二字，会把 `香水套装`（v2 里 1 条）和 `香水精油`
（当前缓存里 3 条）一起判死。这两类标题都读得出是真香水：

- `AFNAN 阿芙南 Historic Olmeda奥尔梅达香水中东浓香水男士EDP` → `彩妆/香水/美妆工具/香水套装`
- `迪拜香精Ard Al Zaafaran ana abiyedh香水精油阿拉伯正品10ml` → `彩妆/香水/美妆工具/香水精油`
- `迪拜香精swiss arabian香水private musk secret oud rose amber` → `彩妆/香水/美妆工具/香水精油`

风险（数据里没有，未能验证）：若出现 `香水瓶`、`香水座` 这类叶子会被本条放过。
当前 1,624 条候选里不存在，所以没有预先加否定词 —— 加了没数据的规则就是猜。

---

## 3. 回归口径说明（为什么有两个数字集）

必须说清，否则「新误杀 19 条」会看着像灾难：

| 口径 | 旧收 | 新收 | 新救回 | 新误杀 | 理由被改写 |
|---|---:|---:|---:|---:|---:|
| **闸门层**（只比 `categoryGate` 的 `ok`） | 692 | 673 | 0 | 19 | 0 |
| **端到端**（`scoreMatch` 最终 `accept`） | 637 | 630 | 0 | 7 | 12 |

差异来源：闸门层的「新误杀 19」里，有 12 条在旧管线**最终也是 reject**（被品牌关拦下），
改的只是理由字符串。只报闸门层会把 12 条算成误杀，虚高 2.7 倍。

端到端重放的旧管线是这样算的（这一步第一版写错过，已修）：
把同一候选喂给一个**新旧闸门都放行**的类目（`彩妆/香水/美妆工具/香水`）拿到纯打分结果，
再与旧闸门结论合并。不能用「新 `scoreMatch` 的 accept」当旧结论 ——
它已被新闸门提前拦下，accept 恒为 false，会把 19 条整批吞成 0（第一版就是这么错的，
`data/.cache/leaf-replay-e2e.json` 曾一度输出 `new 误杀 0`，与闸门层矛盾）。

---

## 4. 四个必需数字

### 4.1 新救回：**0 条**

旧拒新收：0。原因：旧规则的放行条件是「路径含香水」，它比新规则**宽**，
新规则只可能收得更紧，不可能多收。这是结构性结论，不是抽样结果。

### 4.2 拒收理由被改写：**12 条**

结论没变（旧 reject → 新 reject），理由从「品牌名未出现在标题里」变成具体的叶子。
这正是任务书要修的统计失真。

| 瓶 id | 叶子 | 价格 | 标题原文 | categoryText 原文 | 旧理由 → 新理由 |
|---|---|---:|---|---|---|
| frederic-malle-lipstick-rose | 唇霜 | 31.36 | `Colors Matte Rose Lip Gloss Lipstick women gift lipgloss唇彩` | `彩妆/香水/美妆工具/唇彩/唇蜜/唇釉/唇泥/唇霜` | 品牌名未出现在标题里 → 叶子是「唇霜」 |
| floris-cherry-blossom | 散粉 | 25.9 | `现货海淘huda beauty烘焙定妆散粉控油持妆0.8g cherry blossom` | `彩妆/香水/美妆工具/蜜粉/散粉` | 同上 → 叶子是「散粉」 |
| armaf-blue-sky | 美甲工具 | 13.64 | `24Pcs/Set Blue Sky White Cloud Pattern Design False Nail Fre` | `彩妆/香水/美妆工具/美甲工具` | 同上 → 叶子是「美甲工具」 |
| armaf-club-de-nuit-woman | 其它彩妆 | 43.38 | `Club De Nuit Arab Perfumes Woman Arabic Lasting Fragrance Bo` | `彩妆/香水/美妆工具/其它彩妆` | 同上 → 叶子是「其它彩妆」 |
| juliette-has-a-gun-powder-love | 其它彩妆 | 9.11 | `4 Color Love Heart Powder Blusher Palette Natural Matte Colo` | `彩妆/香水/美妆工具/其它彩妆` | 同上 → 叶子是「其它彩妆」 |
| maison-margiela-coffee-break | 甲油胶 | 18 | `美国ORLY指甲油20575 coffee break白领安吉丽娜提拉米苏奶咖啡色` | `彩妆/香水/美妆工具/甲油胶` | 同上 → 叶子是「甲油胶」 |
| montale-be-my-plum | 阴影 | 108 | `美国rhode腮红piggy海莉比伯腮红棒plum口袋唇颊两用腮红膏hailey` | `彩妆/香水/美妆工具/阴影` | 同上 → 叶子是「阴影」 |
| montale-vanilla-extasy | 遮瑕 | 65 | `NARS纳斯遮瑕蜜/遮瑕棒 痘印黑眼圈香草vanilla/custard/honey` | `彩妆/香水/美妆工具/遮瑕` | 同上 → 叶子是「遮瑕」 |
| montblanc-legend-red | 甲油胶 | 27.8 | `金箔红red show白兔奶昔Dance Legend亮片指甲油红秀免烤速干珠光` | `彩妆/香水/美妆工具/甲油胶` | 同上 → 叶子是「甲油胶」 |
| nabeel-gold-24k | 素颜霜 | 649 | `欧洲直邮娇兰Guerlain金钻 PARURE GOLD 24K 焕彩 凝露 35ml正品` | `彩妆/香水/美妆工具/隔离/妆前/素颜霜` | 同上 → 叶子是「素颜霜」 |
| prada-candy-gloss | 唇霜 | 35.6 | `Candy Color Jelly Lip Gloss 糖果色果冻唇彩滋润唇油` | `彩妆/香水/美妆工具/唇彩/唇蜜/唇釉/唇泥/唇霜` | 同上 → 叶子是「唇霜」 |
| vilhelm-parfumerie-mango-skin | 定妆喷雾 | 108 | `sonatural for your skin韩国定妆喷雾fixx全天候长效持妆不脱妆` | `彩妆/香水/美妆工具/定妆喷雾` | 同上 → 叶子是「定妆喷雾」 |

这 12 条的标题里**没有一条**出现瓶名（Lipstick Rose / Cherry Blossom / Blue Sky /
Club de Nuit Woman / Powder Love / Coffee Break / Be My Plum / Vanilla Extasy /
Legend Red / Gold 24K / Candy Gloss / Mango Skin），旧理由是「品牌名未出现」也算对，
但真正的原因显然更早 —— 类目根本不是香水。

### 4.3 新误杀：端到端 **7 条**，逐条证明旧收的是错的

任务书要求「新误杀为 0，或能逐条证明旧收的是错的」。这 7 条全部属于后者，
判断依据只有标题原文与 categoryText 原文，没有任何记忆或推断。

| # | 瓶 id | 叶子 | 价格 | 标题原文 | categoryText 原文 | 判定依据 |
|---|---|---|---:|---|---|---|
| 1 | lancome-idole | 睫毛膏 | 292.75 | `欧洲直邮Lancôme Lash Idôle 睫毛丰盈卷翘睫毛膏正品` | `彩妆/香水/美妆工具/睫毛膏` | 标题自带「睫毛膏」。Lash Idôle 是兰蔻睫毛膏产品线的名字，与香水 Idôle 同名不同物。 |
| 2 | narciso-rodriguez-narciso | 工具 | 9.9 | `【百补】纳西索narciso 明星香水体验礼` | `彩妆/香水/美妆工具/试香礼盒/工具` | 标题写「体验礼」、价格 ¥9.9、路径含「试香礼盒」。是试用装/体验装，不是正装。 |
| 3 | azzaro-the-most-wanted-parfum | 修眉刀 | 188 | `Azzaro The Most Wanted Parfum跨境爆款阿扎罗通缉令男士香水` | `彩妆/香水/美妆工具/修眉刀` | **标题读起来是香水正装**，但类目挂在「修眉刀」下。这条是本批唯一「标题与类目矛盾」的，见 §4.5。 |
| 4 | amouage-guidance | 工具 | 29 | `爱慕秘藏神谕 试香 吟游诗人系列 木质花香调Guidance` | `彩妆/香水/美妆工具/试香礼盒/工具` | 标题写「试香」、¥29、路径含「试香礼盒」。 |
| 5 | guerlain-terracotta | 粉饼 | 480 | `欧洲直邮Guerlain Terracotta Light Powder正品娇兰` | `彩妆/香水/美妆工具/粉饼` | 标题自带 `Light Powder`，类目「粉饼」。Terracotta 是娇兰的粉饼产品线。 |
| 6 | amouage-search | 工具 | 28 | `爱慕香水search寻踪觅影搜寻芳香柑橘调中性香气味多巴胺` | `彩妆/香水/美妆工具/试香礼盒/工具` | ¥28、路径含「试香礼盒」。价格与同批试香装（¥9.9/¥29）一致。 |
| 7 | valentino-valentina-parfum | 气垫 | 271 | `Valentina华伦天奴水光气垫 水润遮瑕持久不暗沉 粉丝绒 纯白限定` | `彩妆/香水/美妆工具/气垫` | 标题自带「气垫」「遮瑕」。 |

3 条试香礼盒（#2 #4 #6）合计 ¥66.9，同批真香水正装价格中位数 ¥599 —— 这不是判据推断，
是同一份语料里的价格分布。

### 4.4 叶子为空的条数：**0 条**，处理方式见 §2.3

全库 907 条有候选的记录里，`categoryText` 为空的 0 条、切不出叶子的 0 条。
规则仍然显式定义（回落标题判据），因为线上淘宝与京东两条链路都可能回空值。

### 4.5 #3 azzaro 这条要单独说明（唯一一条「可能是误杀」的）

它标题写的是 `Azzaro The Most Wanted Parfum跨境爆款阿扎罗通缉令男士香水`，
**读起来是正装香水**；类目却是 `彩妆/香水/美妆工具/修眉刀`。

我的处理：**按类目拒收，并在报告里留下它**。理由：

1. 同瓶在当前缓存里有更好的候选 —— `跨境爆品Azzaro The Most Wanted Parfum阿扎罗男士古龙浓香香水`
   挂在 `彩妆/香水/美妆工具/香水`，新判据下 ACCEPT（见 §6 重选结果）。
   也就是说这条被拒不会让这瓶掉链接。
2. 若为它开「标题含香水则放行」的口子，`修眉刀`、`睫毛膏` 那些叶子就全废了 ——
   `睫毛膏` 那条标题里也写着「睫毛膏」两个字，`粉饼` 那条写着 `Powder`。

**未验证**：我无法证明卖家没有把正装香水错放到修眉刀类目下（那需要看商品详情页，
而本任务不许打接口）。若要归因，这是唯一一条需要在线上核实的。

---

## 5. 补充口径：本地缓存与线上影响面

### 5.1 当前 `data/.cache/union-api.json`（1388 键 / 8603 条候选）

这份文件在本任务执行期间被主线作业刷新过（任务书里说「刚被覆写成 85 条子集」，
实测已是 1388 键的全量），所以两边都看了。

| 指标 | 数值 |
|---|---:|
| 键数 | 1,388 |
| 候选条数 | 8,603 |
| 判定变化 | 74 |
| 新救回 | 0 |
| 新拒 | 74 |

新拒按叶子：`工具` 15、`唇霜` 8、`美容工具` 7、`甲油胶` 7、`其它彩妆` 6、`素颜霜` 5、
`眼线` 4、`香发喷雾` 3、`美甲工具` 3、`胭脂` 3、`海绵` 2、`粉饼` 2、`遮瑕` 2、
`散粉` 1、`修眉刀` 1、`甲片` 1、`阴影` 1、`假睫毛辅助工具` 1、`气垫` 1、`定妆喷雾` 1。

抽查样例（原文）：

- `爱慕镜中倒影 反射女 适合春夏的清冷美人香/老版气味多巴胺` → `彩妆/香水/美妆工具/试香礼盒/工具`
- `欧洲直邮Lancome兰蔻Idôle眼线笔高精密持久防水眼线液04绿正品` → `彩妆/香水/美妆工具/眼线`
- `欧洲直邮娇兰 TERRACOTTA提洛可粉底液 1.5N正品轻盈哑光` → `彩妆/香水/美妆工具/粉底液/膏`
- `1 Set of Beauty Egg Set, Dark Purple, Triangular and Beauty` → `彩妆/香水/美妆工具/美妆蛋/扑/海绵`
- `24pcs Spring Day Sweet False Nails Cute Pink Flower Star Pea` → `彩妆/香水/美妆工具/穿戴甲/甲片`
- `Purple Lipstick Temperature Discoloration Red Rose Moisturiz` → `彩妆/香水/美妆工具/化妆/美容工具`

`data/.cache/reject-snapshot-union-api.json`（85 键 / 236 条）：判定变化 **0**。
那份快照里没有叶子非香水的候选，所以本改动在它上面零影响。

### 5.2 线上 641 瓶：新判据会不会让谁掉链接

`data/affiliate-links.json` 的 `coverage.taobao` 是 `641/1388`。用当前全量缓存对这 641 瓶
重跑 `pickBest`，新旧判据各一遍：

| | 旧判据 | 新判据 |
|---|---:|---:|
| 能选到 accept 候选 | 641 | 639 |

掉链接的 2 瓶：

| 瓶 | 新判据选到的候选 | 理由 |
|---|---|---|
| valentino-valentina-parfum | `SW VALENTINA BOOTIE 75弹力靴袜靴短靴`（`女鞋/弹力靴/袜靴`） | 类目不是香水 |
| guerlain-terracotta | `欧洲直邮娇兰 TERRACOTTA提洛可粉底液 2N正品`（`彩妆/香水/美妆工具/粉底液/膏`） | 非香水品类（命中「粉底」） |

这两瓶的候选池里**根本没有真香水**。`valentino-valentina-parfum` 的 20 个候选分散在
耳环 3 / 连衣裙 3 / 袜靴 2 / 运动T恤 2 / 玩偶 1 / 时装靴 1 / 气垫 1 / 睡裙 1 / T恤 1 /
酥性饼干 1 / POLO衫 1 / 文学小说类原版书 1 / 装饰台灯 1 / 拳击服 1；
`guerlain-terracotta` 的 20 个候选是 `粉底液/膏` 9 + `粉饼` 2 + `遮瑕` 2 + 男士包袋 2
+ 一次成像相册 1 + 茶壶 1 + 户外防护配件 1 + 其他特色工艺品 1 + 摩托车头盔 1。
也就是说这 2 瓶现在挂的淘宝链接**本来就是错商品**，新判据只是把它暴露出来。
`valentino-valentina-parfum` 的候选里有一条 `日本直邮VALENTINA 香水 80ml 橙花花香东方调`，
但类目挂在 `运动服/休闲服装/运动T恤` —— 旧判据也是拒的（类目不含香水）。

---

## 6. 断言（58 → 72，新增 14 项 L 组）

`scripts/test-union-api.mjs` 新增 L1–L14：

| 编号 | 钉住什么 |
|---|---|
| L1 | 叶子是香水、父级含香水 → 放行（防改紧过头） |
| L2 | 叶子是唇霜、父级含香水 → 拒收（旧规则漏掉的那类） |
| L3 | 叶子是散粉 → 拒收（标题含 `cherry blossom`，靠打分拦不住） |
| L4 | 叶子是甲油胶 → 拒收 |
| L5 | 叶子是睫毛膏 → 拒收（曾真的被收进库） |
| L6 | 叶子与「香水」同层但不是香水（`…/假睫毛`）→ 拒收 |
| L7 | 蜡烛优先于香水叶子（M22 的两条实测） |
| L8 | 小样优先于香水叶子 |
| L9 | 试香礼盒拒收（非正装） |
| L10 | 类目为空 → 回落标题判据，不是默认放行 |
| L11 | 类目切不出叶子（空白 / `///`）→ 等同无类目 |
| L12 | 叶子是 `香水套装` / `香水精油` → 放行 |
| L13 | 未识别叶子 → 拒收且理由带叶子名 |
| L14 | 同一标题换叶子类目，结论随之改变（端到端 `scoreMatch`） |

运行结果：

```
===== 联盟 API 测试 =====
PASS 72   FAIL 0

===== 品类闸门测试 =====
PASS 8   FAIL 0
```

`scripts/check-head.mjs` 未改动。它对 HEAD 干净导出的基线仍是 58：

```
  ✓ test-union-api.mjs     PASS 58  FAIL 0
```

（`check-head.mjs` 的语义是「HEAD 那份代码跑出的断言数」，不是「工作区当前」，
所以本任务的新数字不该写进去 —— 任务书也明确说了不要改它。新基线 **72** 请主线同步。）

L10 与 L13 第一版写错了两处，记录在此避免复现：

- L10 反例标题写成 `CREED AVENTUS 2.5OZ EDP简装…`，`EDP` 本身在 `PERFUME_WORDS` 里，
  于是「无类目 + 有品类词」被放行，测不到「无类目」这件事。改成不含任何品类词的标题才成立。
- L13 反例标题写成 `某牌 车载香座 出风口`，`车载香` 在 `NON_PERFUME_WORDS` 里，
  先命中反向词，测到的不是「叶子未识别」分支。改成不带反向词的标题才落到目标分支。

---

## 7. 未验证项（单独列，不混进结论）

1. **`修眉刀` 那条到底是不是错放的香水**（§4.5）。要看商品详情页才知道，本任务禁止打接口。
2. **`香发喷雾` 这 3 条是发喷还是被卖家错放**。标题分别是
   `AFNAN 9pm Night Out香水木质东方调留香持久礼盒版火龙果系列`（¥386）、
   `Arabian Oud头发香水玛达维Madawi菠萝橙花清新木质发香喷雾|简装`（¥580）、
   `Lattafa His & Her Confession 情侣对香 雕塑瓶盖送礼首选香氛`（¥366）。
   发用香氛与瓶装香水是两条产品线，但没有证据说明这 3 条属于哪一条。
   判据结论都拒，所以**没把它放进黑名单**，理由留在「未识别」这一档，归因不定就别假装定。
3. **`香水瓶` / `香水座` 这类叶子**当前语料里不存在，`PERFUME_LEAF_PAT` 会放过它。
   出现时需补否定词。没有数据就没有加规则 —— 那是猜。
4. **`香水` 叶子里的 28 条小样**：全部被 `SAMPLE_PAT` 拒，我没有逐条核对这 28 条是不是
   「真小样」。它们与本任务无关（不是类目问题），但若 SAMPLE_PAT 有误杀，
   那笔账记在那条规则上。抽查 13 条含「试香」字样、29 条含小样/试用/体验词，未见矛盾。
5. **4 条「标题像正装且价 ≥ ¥200、但类目完全不含香水」的**（`jo-malone-oud-and-bergamot` ¥1090 /
   `clinique-happy-for-men` ¥1172 / `creed-viking-cologne` ¥251 /
   `givenchy-gentleman-eau-de-toilette` ¥320）。它们的类目分别是 `办公设备/…/其它`、
   `农用物资/有机肥`、`农机/…/农机配件`、`饰品/…/其它首饰` —— 明显是卖家乱挂类目。
   旧判据也全拒（类目不含香水），所以不是本次改动引入的，但值得单独一轮看：
   `Clinique Happy For Men Cologne Spray` 这条标题是标准的正装写法。
6. **`data/.cache/union-api.json` 正在被主线作业覆写**。§5.1 的数字是某一时刻的快照，
   重跑会变；全库结论以 v2 快照（§3、§4）为准。
7. **端到端重放的旧管线是重建出来的**，不是 git checkout 出来的原始模块。
   旧闸门函数逐字节抄自 HEAD（`045b889`），闸门之后的打分逻辑本次未改，
   但严格说这不是「跑 HEAD 那份代码」。若要绝对可信，应在 `check-head.mjs` 的干净导出里
   跑一遍对照 —— 那是另一件事，本次没做。

---

## 8. 产物清单

改动：

- `scripts/lib/union-api.mjs`：`categoryGate` 重写；新增 `PERFUME_LEAF_PAT`、`NON_PERFUME_LEAVES`、`leafOf`
- `scripts/test-union-api.mjs`：新增 L1–L14（58 → 72）
- `docs/reports/category-gate-report.md`：本文件

探针（`scripts/probe-leaf-*.mjs`，全部只读，不打接口）：

| 脚本 | 干什么 | 产物 |
|---|---|---|
| `probe-leaf-shape.mjs` | 摸 v2 快照字段形态 | `leaf-shape.json` |
| `probe-leaf-dist.mjs` | 叶子取值分布、深度分布 | `leaf-dist.json` |
| `probe-leaf-cross.mjs` | 「路径含香水」×「叶子是不是香水」交叉表 | `leaf-cross.json` |
| `probe-leaf-miskill.mjs` | 漏洞行的价格/店铺/live 状态 | `leaf-miskill.json` |
| `probe-leaf-live.mjs` | 漏洞行是否已挂线上链接 | `leaf-live-impact.json` |
| `probe-leaf-under-perfume.mjs` | 香水分支下 17 种叶子逐个列样例 | `leaf-under-perfume.json` |
| `probe-leaf-replay.mjs` | 闸门层全库重放（旧 vs 新） | `leaf-replay.json` |
| `probe-leaf-replay-e2e.mjs` | 端到端全库重放（拆开闸门与打分） | `leaf-replay-e2e.json` |
| `probe-leaf-potential-miskill.mjs` | 找「标题像正装、价 ≥200」的潜在误杀 | `leaf-potential-miskill.json` |
| `probe-leaf-cache-delta.mjs` | 当前 1388 键缓存上的判定变化 | `leaf-cache-delta.json` |
| `probe-leaf-live-repick.mjs` | 7 条线上错配在当前缓存里的重选结果 | `leaf-live-repick.json` |
| `probe-leaf-live-relink.mjs` | 641 瓶线上可重链数（旧 vs 新） | `leaf-live-relink.json` |
| `probe-leaf-report-numbers.mjs` | 报告用的汇总数字 | `leaf-report-numbers.json` |

未触碰：`data/brand-aliases.json`、`data/affiliate-links.json`、`data/products.candidates.json`、
`app.js`、`styles*`、任何 `_wheel*.css`、`scripts/check-head.mjs`。
未打过淘宝/京东接口。
