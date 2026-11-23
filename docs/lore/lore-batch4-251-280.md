# lore-batch4-pilot30：结果卡背书语料 · 第四批试点（popularityRank 第 251–280 瓶）

> **入库注记（2026-11-23）**：本文件第 278 条已替换为 2026-11-22 裁决终版（源 `lore-batch4-278-supplement.md`，按 2025 版 Burberry Her Eau de Parfum Intense 写，supersedes 试点批的留空；裁决见 DECISIONS.md 第 149 条）。该条附带的数据债（id `burberry-her-intense` 与实际产品不符，待目录修订时处理）见 supplement 文件末尾「数据债」段，本文件不再重复。其余 29 条与下文全部文字按 2026-11-22 试点批验收终版原字节照录。下方「统计」一行所写「2 瓶标注无可靠来源」为试点批原始口径，未改写；替换后本文件实际留空 1 条（251）。

调研日期：2026-11-22。数据来源：仓库 `C:/Users/16256/work/scent-picker-v23/data/perfumes.json`（只读，未改任何仓库文件）。名单取自 `C:/Users/16256/work/.legs/direct-20261120/lore-batch4.md` 的第 251–280 瓶（原第四批全量 150 瓶为 251–400）。本次只做前 30 瓶试点，验证质量后再续批。

**统计**：30 瓶中 28 瓶有背书（名人同款 1 / 官方标语 14 / 经典故事 13），2 瓶标注「无可靠来源」文案留空（251 Afnan Turathi Blue、278 Burberry Her Intense）。

**调研与核验规则**（同前三批）：
- 每瓶 1–3 次英文 WebSearch（Exa），每次查询与返回全文逐字存盘到 `search/raw-{a..e}.txt` 作审计底账；所有 URL 均逐字取自搜索结果，无手工拼造。
- 站点拒绝抓取（403/429）但搜索摘要明确支持的，注明「仅搜索摘要佐证」。
- 名人同款须有主流媒体或品牌官方佐证（含官方广告面孔/代言，均在备注注明非私人使用声明）；论坛「平替/dupe」说法一律不采用；模特出镜拍商业广告不计名人同款。
- 「官方标语」类包含品牌官方广告语及官方产品文案原文（均在备注说明出处段落）。
- 年份/调香师等事实来源冲突的，文案回避并在备注并列说明。

**自动核验**（2026-11-22，脚本 `search/verify.ps1`、`search/verify-quotes.ps1`）：
- 结构：30 条齐全、序号/id/排名与名单一致、无越组混入，标「无可靠来源」的两条文案与来源链接确为空。
- URL：全稿 74 个链接逐一在对应 raw 文件中逐字命中，0 缺失。
- 引文：全稿 120 段引号内英文逐一回检，全部命中（其中 7 段初次未命中系省略号截断与弯/直撇号字符差异，复核后确认原文存在，非编造）。

---

### 251. afnan-turathi-blue（排名 498）
- 名称：Afnan Turathi Blue Eau de Parfum（年份未定）
- 背书类型：无可靠来源
- 文案：
- 来源链接：
- 备注：查过 Afnan 三个官方域名（afnan.com、us.afnan.com、uk.afnan.com）的 Turathi Blue 产品页，只有品牌自述式香调罗列与泛化描述，无第三方主流媒体报道、无代言人、无官方新闻稿，按第 3 批既定标准（品牌自述不构成「官方标语」级背书）判为不够。英文检索另命中 Fragrantica、Parfumo、Olfactory Ambition 博客：前两者为香评数据库，后者为个人博客，均非主流媒体；命中内容大量为 Bleu de Chanel 与 Tygar 的平替讨论，按纪律 dupe 说法一律不采用。年份存在冲突：Fragrantica 与 Olfactory Ambition 记 2021，Parfumo 记 "The release year is unknown"，故不写入文案。

### 252. ex-nihilo-outcast-blue（排名 499）
- 名称：Ex Nihilo Outcast Blue Eau de Parfum（2019）
- 背书类型：官方标语
- 文案：Ex Nihilo 官方产品页给 Outcast Blue 的定性只有一句四词标语："For punks and poets"。正文接着写这支香 "channels the rebellious energy of a new generation of artists"，灵感取自围绕品牌创作者的一群自由灵魂，蓝色被写作品牌自己的签名色。官方署名调香师 Jordi Fernández，藏红花、黑胡椒、粉红胡椒开场，雪松与铃兰居中，广藿香、岩兰草、檀香、烟草、橡苔收底，2019 年上市，另有一版 Extrait 在同一结构里加重沉香。
- 来源链接：https://us.ex-nihilo-paris.com/products/outcast-blue-eau-de-parfum ；https://www.fragrantica.com/perfume/Ex-Nihilo/Outcast-Blue-60373.html
- 备注："For punks and poets" 与 "channels the rebellious energy of a new generation of artists" 逐字取自 us.ex-nihilo-paris.com 产品页 Highlights；调香师 Jordi Fernández 亦见该页 Perfumer 栏。年份 2019 与香调金字塔另据 Fragrantica 条目核对，两处一致。文案中未加引号的部分为中文转述，不是引文。

### 253. jo-malone-wild-bluebell（排名 501）
- 名称：Jo Malone London Wild Bluebell Cologne（年份未标注）
- 背书类型：官方标语
- 文案：Jo Malone London 官网给 Wild Bluebell 的官方描述是一段意象："Luminous sapphire flowers gently blooming in a shaded, secluded woodland."。单品页把三层拆开：蓝铃花写作 "A wild flower accord, blended with notes of crisp, green leaves"，柿子注为 "A milky-peach note with clean, creamy undertones"，压尾的白麝香是 "A powdery, clean note that enhances the trail of the scent"。官网另有专文说蓝铃花在英格兰林地里只有春天极短一段时间可见，"can be seen for a very short time in spring"，香气要留住的正是这种转瞬即逝。
- 来源链接：https://www.jomalone.com/product/25946/18848/colognes/wild-bluebell-cologne ；https://www.jomalone.co.uk/product/25946/18848/colognes/wild-bluebell-cologne ；https://www.jomalone.com/our-house/our-stories/wild-blue-yonder
- 备注：四段引文逐字取自 jomalone.com 产品页 Highlights（Product Details 与香调说明段）与官网专文 wild-blue-yonder（Spring awakenings–Wild Bluebell Cologne）。英国站同款页首句作 "Vibrant sapphire blooms in a shaded woodland."，与美站措辞不同，故文案只用美站版本。官网未在该页标注这支香的上市年份，故名称栏标为年份未标注。

### 254. kenzo-leau-kenzo（排名 502）
- 名称：Kenzo L'Eau Kenzo Eau de Toilette（1996）
- 背书类型：官方标语
- 文案：1996 年 3 月 8 日 WWD 报道，Kenzo 当年推两支女香，头一支的广告标语写成方程式："Take water, add some love, and you get L'Eau Par Kenzo."——水记为 H20，爱用一颗心代替。平面与海报广告由 Jean-Baptiste Mondino 拍摄，4 月起在中东、拉美与欧洲上市，9 月进亚洲。报道称香水由 Firmenich 调香师 Olivier Cresp 调配；透明瓶身要做成一滴水，白盒背面印着设计师的一首诗。时任 Parfums Kenzo 总裁 Pierre Broc 对 WWD 说，Kenzo 想回到自己的根，"Kenzo wanted to go back to his roots"。
- 来源链接：https://wwd.com/fashion-news/fashion-features/article-1129749/
- 备注：标语逐字取自 WWD 1996-03-08 报道正文（原文该句后接 "Or so goes the advertising tagline for the designer’s latest brand"）；"Kenzo wanted to go back to his roots" 为同篇 Pierre Broc 原话。调香师、香调、瓶身与包装描述均出自该篇。香名存在差异：任务给定 L'Eau Kenzo，而 WWD、Fragrantica、Parfumo 记 1996 年那支女香均作 L'Eau par Kenzo（pour Femme）；kenzoparfums.com 现售的 L'EAU KENZO 是另一条后续产品线（含 for her／for him／Florale／Boisée）。任务给定的香调（薄荷／桃／莲花／香草）与 1996 年 L'Eau par Kenzo pour Femme 一致，故判断为同一支，名称栏沿用任务数据。Kenzo 官网现售系列页亦署 Olivier Cresp，与 WWD 一致，但该页属品牌自述，未列为背书来源。

### 255. mfk-a-la-rose（排名 503）
- 名称：Maison Francis Kurkdjian À la rose Eau de Parfum（2014）
- 背书类型：经典故事
- 文案：À la rose 的名字来自 Elisabeth Vigée Le Brun 为玛丽·安托瓦内特所绘的肖像，画中王后手持一朵千叶玫瑰。品牌新闻稿写："Inspired by the story of a painting of Queen Marie Antoinette holding a Centifolia rose in her hand signed Elisabeth Vigée Le Brun"，Francis Kurkdjian 于 2014 年据此做出同名香水。官方产品页称它是 "a tribute to femininity, a declaration of love translated into a fragrance"，配方用 250 朵格拉斯千叶玫瑰与 150 朵保加利亚大马士革玫瑰，把常被看作过时的题材重做成当代的穿法。
- 来源链接：https://www.franciskurkdjian.com/us-en/p/a-la-rose-eau-de-parfum-RA128782.html ；https://cdn.uc.assets.prezly.com/e9a4a237-90a8-4b35-98c0-0ad59b64649e/-/inline/no/SENTEURSDAILLEURS_KURKDJIAN_PRESS%20RELEASE_L'EAU%20%C3%80%20LA%20ROSE%20-%20ENG.pdf
- 备注：肖像缘起一句逐字取自品牌新闻稿 PDF（Senteurs d'Ailleurs 转载的 Kurkdjian 新闻稿）；"a tribute to femininity, a declaration of love translated into a fragrance" 逐字取自 franciskurkdjian.com 产品页 Inspiration 段。玫瑰用量 250/150 见官方产品页与新闻稿两处，一致；另有访谈说法 "there are 400 roses in each bottle"，与 250+150 相符。「王后手里拿的不是王权象征而是一朵花」一句出自 flaunt.com 访谈中 Kurkdjian 原话 "I am a woman beforehand, not a queen"，该 URL 未列入来源链接，因同段内容新闻稿亦可佐证。

### 256. moschino-fresh-couture（排名 504）
- 名称：Moschino Fresh Couture Eau de Parfum（2015）
- 背书类型：官方标语
- 文案：Moschino Beauty 官方产品页把整段文案排成全大写："THE PLAYFUL BOTTLE OF FRESH COUTURE CONTRASTS WITH A SOPHISTICATED SCENT, WHERE BERGAMOT AND MANDARIN MEET EXOTIC YLANG-YLANG AND JUICY RASPBERRY."，下一句接着写 "A BLEND OF WHITE PEONY, OSMANTHUS AND SENSUAL WOODS ADDS DEPTH, CREATING A FRAGRANCE THAT IS BOTH BOLD AND DISTINCTIVE."。瓶身取的是日用清洁喷雾的形状，Debenhams 商品页把这层设计意图写成 "The concept was to juxtapose the most mundane and commonplace of products, the household cleaner, with something so precious"。Fragrantica 记其 2015 年上市，署名调香师 Alberto Morillas。
- 来源链接：https://www.moschinobeauty.com/products/fresh-couture ；https://www.fragrantica.com/perfume/Moschino/Fresh-Couture-32393.html ；https://www.debenhams.com/product/moschino-fresh-couture-eau-de-toilette_ydd03533
- 备注：两段大写引文逐字取自 moschinobeauty.com 产品页 Highlights，原文即全大写，未改大小写。瓶身设计意图一句逐字取自 Debenhams 商品页 Inspiration 段。年份 2015 与调香师 Alberto Morillas 出自 Fragrantica 条目。官方香调为前调柑橘、香柠檬、依兰，中调覆盆子、白牡丹、桂花，后调轻木、广藿香、降龙涎香醚；Fragrantica 表述略有出入，文案从官方。浓度存在冲突：任务给定 Eau de Parfum，而 moschino.com、moschinobeauty.com、Debenhams 与 Fragrantica 均标 Eau de Toilette，此处并列标出，名称栏沿用任务数据。

### 257. orto-parisi-terroni（排名 505）
- 名称：Orto Parisi Terroni Parfum（2017）
- 背书类型：经典故事
- 文案：Orto Parisi 是 Alessandro Gualtieri 在 Nasomatto 之后另立的品牌。官方传记把来由写得很具体：祖父 Vincenzo Parisi 在普利亚的花园里用木桶收集粪便去肥田，意大利语 orto 即花园，"In his garden hovered an air of infinite."。Terroni 于 2017 年推出、意大利制造，官方给它定位在土地本身——"There is something fulfilling about putting your hands in the soil – the sense of belonging to earth."。香调以覆盆子起头，转桦木、琥珀、安息香，落到愈创木、岩兰草、雪松、麝香、橡苔与香草。
- 来源链接：https://ortoparisi.com/products/terroni ；https://ortoparisi.com/pages/biography ；https://noseparis.com/en/arrivee-d-orto-parisi-chez-nose
- 备注：官方产品页提供文案原句、2017 年份与意大利制造；品牌创立故事取自官方 biography 页，Nose Paris 的进驻稿补充了「orto 意为花园」与祖父 Vincenzo Parisi 的细节，两处互相印证。调香师 Alessandro Gualtieri 由 Fragrantica 条目与 Ministry of Scent 商品页确认。香调按任务给定数据书写，Fragrantica 记中调含桦木、琥珀、安息香，Saison 另把乌木列入中调，属零售商记法差异，文案不写乌木。

### 258. rabanne-pure-xs（排名 506）
- 名称：Rabanne (Paco Rabanne) Pure XS Eau de Toilette（2017）
- 背书类型：经典故事
- 文案：Pure XS 于 2017 年推出，是 1993 年 Paco Rabanne XS 的后继，由 IFF 的 Anne Flipo、Caroline Dumur 与 Bruno Jovanovic 三人调配。Fragrantica 转述的新闻稿把创作意图写成 "the sensation of skin shivering with desire and burning with pleasure"：冰凉的姜开场，中段是肉桂、香草与皮革酒香，尾段落在没药与糖的燥热感上，冷与热两段互相拉扯。名字里的 XS 被读作 excess，这层 excess 与 sex 的双关在广告里被明说，也是 1993 年那支原版用过的做法。
- 来源链接：https://www.fragrantica.com/news/Paco-Rabanne-Pure-XS-9777.html ；https://www.fragrantica.com/perfume/Rabanne/Pure-XS-46038.html
- 备注：品牌官网未检到该款页面，可用材料为香评媒体 Fragrantica 的发布稿（含新闻稿原句引文、"under the license of Puig"、三位 IFF 调香师署名）与其香库条目（含 1993 年原版双关的说明、香调金字塔）。出镜者 Francisco Henriques 为模特，非名人，未用于背书。Notino 货架页香调与 Fragrantica 一致，仅作旁证，未引为来源。

### 259. jean-paul-gaultier-scandal-pour-homme（排名 511）
- 名称：Jean Paul Gaultier Scandal Pour Homme Eau de Toilette（2021）
- 背书类型：经典故事
- 文案：据 WWD 2021 年 6 月的独家报道，女香 Scandal 在 2017 年 6 月先行，男香随后接上。这也是品牌被 Puig 收归自营（2016 年）后的第一支男香——"Scandal marks the first men’s fragrance introduced by the brand since it was taken in house by Puig in 2016."。瓶身把拳击台做成近方形的厚玻璃可 refill 瓶，盖子是红金两色的王冠："Scandal’s heavy glass refillable scent bottle, which is almost square like a boxing ring, comes topped with a red-and-gold-colored crown, resembling a boxing champion’s."。外盒用红丝绒暗指拳击短裤，广告片由 Jonas Lindstroem 执导。
- 来源链接：https://wwd.com/beauty-industry-news/beauty-features/jean-paul-gaultier-launching-scandal-mens-scent-1234848311/ ；https://www.arabnews.com/node/1923556/lifestyle ；https://www.vogue.fr/vogue-hommes/promotion/jean-paul-gaultier-scandal-parfum-homme
- 备注：两段引文均逐字取自 WWD 正文。出镜的 Parker Van Noord、Imaan Hammam 是模特：Arab News 写 Van Noord "was tapped to serve as the face of the brand’s new men’s scent"，Vogue France 称其为 égérie，但商业广告面孔按纪律不计「名人同款」，故判经典故事。WWD 该段未列调香师姓名，文案不写调香师。香调部分按任务给定数据，未在文案中展开，因 WWD 段落未列香调，无冲突可并列。

### 260. nasomatto-black-afgano（排名 514）
- 名称：Nasomatto Black Afgano Parfum（2009）
- 背书类型：官方标语
- 文案：品牌官网给这支香的原话是："This bottle of perfume is part of the project Nasomatto. The fragrance aims to evoke the best quality of hashish. It is the result of a quest to arouse the effects of temporary bliss."。官网另注明瓶盖以烧过的橡木制成、意大利制造、2009 年发行。Gualtieri 在访谈里说这是六年的项目，反复调不成，最终由三百页配方累积定稿："There is a 300 page volume of formulas that finally lead to Black Afgano."。Nose Paris 的官方文稿亦写它花了六年不断试验与呼吸才做成。
- 来源链接：https://nasomatto.com/products/black-afgano ；https://www.fragrantica.com/news/Out-of-the-Bottle-Perfumer-Alessandro-Gualtieri-7948.html ；https://noseparis.com/en/a-place-of-olfactory-experimentation
- 备注：引号内英文分别逐字取自 nasomatto.com 产品页与 noseparis.com 官方文稿；「三百页配方」一句出自 Fragrantica 访谈中 Gualtieri 自述。Nose Paris 原句为 "it took six years of constant testing and research, burning and breathing, to come up with Black Afgano"。Wallpaper* 与 The Good Life Italia 另有「六年」表述，与官网口径一致，未另引。香调按任务给定数据（前调大麻、绿叶，中调树脂、木质、烟草，后调乳香、乌木），Fragrantica 条目另记藏红花、davana 等，属数据库细分差异，文案不写。

### 261. nicolai-cologne-sologne（排名 515）
- 名称：Parfums de Nicolaï Cologne Sologne Eau de Cologne（1989）
- 背书类型：经典故事
- 文案：品牌官方史页写明，Nicolaï 由调香师 Patricia de Nicolaï 与丈夫 Jean-Louis Michau 于 1989 年在巴黎创立，全部在 Palais-Royal 的实验室里调配；她是娇兰家族后人、ISIPCA 出身，官方称其为 "the first formally trained woman perfumer to establish her own house"。Cologne Sologne 同年面世，官网给它的定位是 "The perfect cologne. A chic and noble orange blossom."，配方标注含 90% 天然原料。她本人在产品页上说："Sologne was inspired by the great estates at the heart of French forests."。
- 来源链接：https://nicolaiparis.com/en-us/pages/our-history ；https://nicolaiparis.com/en/products/cologne-sologne ；https://wwd.com/beauty-industry-news/fragrance/guerlain-patricia-de-nicolai-scentxplore-niche-fragrance-1239387515/ ；https://signaturescent.studio/perfumers/patricia-de-nicolai
- 备注：任务数据把浓度记为 Parfum，但官网产品页与 Fragrantica 条目均归为 Eau de Cologne（1989），此处从来源。创立年份以官网史页 1989 为准；Fragrantica 的调香师页写 "In 1988, Patricia took a bold step and, alongside her husband Jean-Louis Michau, launched her own brand"，与官网差一年，故文案只写 1989（官网口径），WWD 亦记 1989。香调（香柠檬、橙、柠檬／橙花、薰衣草、迷迭香／广藿香、安息香、麝香）与官网 ingredients 段完全一致。Patricia 另于 2008 年获法国荣誉军团勋章、2008–2020 年任凡尔赛 Osmothèque 博物馆馆长，见 Signature Scent Studio 小传，未写入文案以免堆砌。

### 262. nina-ricci-nina-fantasy（排名 516）
- 名称：Nina Ricci Nina Fantasy Eau de Toilette（2012）
- 背书类型：经典故事
- 文案：Nina Fantasy 是 2012 年这一季的限定版，接在 2006 年的 Nina 之后。Now Smell This 当年 1 月的报道写它是 "a flanker to the 2006 version of Nina, and is meant to be a playful scent that captures the first days of spring"，规格 50 ml 淡香水。Fragrantica 记调香师为 Olivier Cresp 与 Jacques Cavallier，香调以梨、柑橘、香柠檬开场，天芥菜与玫瑰居中，糖与香草收尾。瓶子沿用 Nina 的苹果形，这一版换成白瓷瓶身，据马耳他《独立报》，瓶身 "adorned with gold and pink Japanese Kawaii drawings"，灵感直接取自日本的 Kawaii 文化。
- 来源链接：https://nstperfume.com/2012/01/13/nina-ricci-nina-fantasy-new-fragrance/ ；https://www.fragrantica.com/perfume/Nina-Ricci/Nina-Fantasy-14228.html ；https://www.independent.com.mt/articles/2012-05-20/local-news/Nina-Fantasy-310267 ；https://www.fashion-press.net/news/3703
- 备注：年份 2012 由 NST 发布日、Fragrantica 条目与马耳他《独立报》2012-05-20 报道三方一致，日本 Fashion Press 的上市稿亦记 2012 年 5 月 2 日发售。「灵感取自日本 Kawaii 文化」一句出自 Fashion Press 的标题与正文（「日本の『Kawaii』カルチャーからヒントを得た」）。香调与任务给定数据核对：梨／柑橘、天芥菜／玫瑰、糖／香草均对得上，Fragrantica 正文另写 "Mate and brown sugar form the base"，对应任务数据的马黛茶，确认非同名歧义。差异并列：《独立报》多记茶花、粉红葡萄柚、茉莉花瓣、白麝香与琥珀；Fragrantica 后调记作 "Sugar, Vanille and Holly"；NST 记有樱花。故文案只写三方共有项。广告面孔 Florrie Arnold 为模特／歌手，属商业广告出镜，未用于背书。

### 263. byredo-slow-dance（排名 520）
- 名称：Byredo Slow Dance Eau de Parfum（2019）
- 背书类型：官方标语
- 文案：Byredo 官网把 Slow Dance 的定位写得很直白："The slow dance: A rites-of-passage moment for both girls and boys before they metamorphose into women and men."，把少年舞会上的兴奋与笨拙并置，接着是 "a heady collision of innocence and experience"。香调为红没药开场，天竺葵、劳丹脂、紫罗兰居中，广藿香与香草收底，官网标注 Intense、Woody、Genderless。Hypebae 在 2019 年 7 月的报道里称这支香由 Ben Gorham 本人创作，意在 "articulate an element of his autobiography"。
- 来源链接：https://www.byredo.com/us_en/p/slow-dance-eau-de-parfum ；https://hypebae.com/2019/7/byredo-slow-dance-fragrance-perfume-release-review ；https://perfumesociety.org/latest-launches-slow-dances-secret-glances/
- 备注：三段引文逐字取自 byredo.com 产品页 Description 段与 Hypebae 报道正文，均已在 raw 中检索命中。年份 2019 来自 Hypebae（2019-07-25）与 The Perfume Society（2019-10-14）的上市报道，官网页面本身未标年份，故年份按媒体报道记；The Perfume Society 另记 50ml 定价 110 英镑。调香师署名：官网未署名，经销商 macciocu.com 记 Nose 为 Ben Gorham，Hypebae 亦称由他本人创作，两者一致，故文案采用。

### 264. chloe-nomade-jasmin-naturel（排名 521）
- 名称：Chloé Nomade Jasmin Naturel Eau de Parfum（2022）
- 背书类型：名人同款
- 文案：2022 年 1 月，Coty 宣布英国演员 Naomi Scott 出任 Chloé Nomade 香水线的品牌代言人，广告片自 2 月起全球上线，由 Zoë Ghertner 在沙丘取景拍摄。WWD 与 Perfumer & Flavorist 都引了 Coty 奢侈品牌首席品牌官 Constantin Sklavenitis 的说法，称她出生 "at the confluence of several cultures"，与 Nomade 主张的真实、自发、姐妹情谊相合。这支 2022 年 3 月 30 日上市的版本走美食调茉莉：埃及茉莉净油、椰枣、香草与檀香，瓶身换成赭石色。
- 来源链接：https://wwd.com/beauty-industry-news/fragrance/naomi-scott-is-the-new-face-of-chloes-nomade-eau-de-parfum-naturelle-1235025375/ ；https://www.perfumerflavorist.com/fragrance/fine-fragrance/news/21977747/coty-inc-coty-announces-naomi-scott-as-brand-ambassador-of-fragrance-campaign ；https://www.fashion-headline.com/en/article/152894 ；https://www.dutyfreehunter.com/blog/chloe-unveils-nomade-naturelle-a-luxurious-new-jasmine-fragrance/
- 备注：代言关系由 WWD（2022-01-04）与 Perfumer & Flavorist（2022-01-10）双源佐证，属品牌官方公布的广告面孔，符合「名人同款」；引文 "at the confluence of several cultures" 逐字见两篇正文。两处冲突已回避不写进文案：其一，调香师署名不一致，Duty Free Hunter 记 Caroline Dumur，Perfumer & Flavorist 记 Quentin Bisch；其二，香调口径不一致，Perfumer & Flavorist 写 oakmoss、freesia、Mirabelle Liqueur（与指定香调不符，疑为沿用早期 Nomade Naturelle 资料），而 Duty Free Hunter 与 fashion-headline 均描述为美食调茉莉版本，与本瓶一致，故文案采后者。另注：该系列媒体用名在 Nomade Eau de Parfum Naturelle 与 Nomade Jasmin Naturel 之间混用。

### 265. profumum-roma-acqua-e-zucchero（排名 524）
- 名称：Profumum Roma Acqua e Zucchero Eau de Parfum（2002）
- 背书类型：经典故事
- 文案：Profumum Roma 官网的「我们是谁」页把家史写成了散文：二战后，上莫利塞 Sant'Elena 村的磨刀匠 Celestino Durante 与妻子 Luisa 迁往罗马，他在理发店与手工作坊之间学手艺，磨轮后来让位给古龙水与乳液。1996 年，Giuseppe、Luciano、Maria、Felice 四兄妹离开旧有行规自立门户，这就是 Profumum Roma。Acqua e Zucchero 于 2002 年问世，官网香调为橙花、红浆果、香草；产品页把开篇写成棉花糖与红果的爆发，末段是香草与麝香。
- 来源链接：https://www.profumum.com/en/who-we-are/ ；https://www.profumum.com/en/product/acqua-e-zucchero/
- 备注：创立史逐段对应 profumum.com/en/who-we-are 正文（磨刀匠铜像、Sant'Elena、迁往罗马、1996 年四兄妹），年份 1996 与 2002 均出自官方页面；产品页 Additional information 表列 Year 2002、Olfactory notes 为 Orange flowers / Red fruits / Vanilla，与指定香调一致。两点未写入文案：官网 STORY 段提到 musk，但香调表无麝香，故只作「末段」描述而不列为香调；创始人配偶名官网写 Luisa，经销商 Ministry of Scent 写 Lucia，取官网拼法。

### 266. davidoff-run-wild（排名 526）
- 名称：Davidoff Run Wild Eau de Parfum（2019）
- 背书类型：官方标语
- 文案：Run Wild 是 Davidoff Parfums 2019 年推出的男女对香，这瓶对应其中的女香淡香精。品牌口径称这是 "Davidoff Parfums’ boldest project since the launch of Cool Water"，灵感取自野森林与未被打扰的瀑布绿水；女香由 Aliénor Massenet 与 Emilie Coppermann 调配，主打石榴、开心果与茉莉，瓶身为浅柠檬绿的圆润玻璃瓶，线条比男香的刻面瓶型更柔和。广告片由 Terence Neale 执导，他在官方稿件中说："Tired of the monotony of the city, RUN WILD is about escape."。
- 来源链接：https://moodiedavittreport.com/run-wild-coty-unveils-new-davidoff-fragrances-for-men-and-women/ ；https://www.dutyfreehunter.com/blog/ready-break-free-davidoff-debuts-run-wild-fragrances/ ；https://www.fragrantica.com/news/Davidoff-Run-Wild-12182.html
- 备注：两段引文逐字可核：品牌定位句见 Moodie Davitt Report 正文（Coty 官方发布口径），导演引语见 Fragrantica 新品稿与 Duty Free Hunter 正文，两处一字不差。性别核对：本瓶香调（石榴、开心果、茉莉）对应女香 Eau de Parfum，男香为 Eau de Toilette 且香调是薰衣草、肉桂、冷杉香脂，故文案只写女香、不套用男香描述。出镜者模特 Tobias Sorensen 与 Madison Headrick，平面由摄影师 Lachlan Bailey 拍摄，属商业广告出镜，明确不构成「名人同款」，故本条按官方标语归类。香调层级来源有分歧（Fragrantica 记前调石榴与开心果、中调茉莉、底调百合；Notino 记前调石榴、中调开心果、底调茉莉），故文案只并列三种香材、不标前中后。

### 267. gucci-flora（排名 527）
- 名称：Gucci Flora Eau de Parfum（2010）
- 背书类型：经典故事
- 文案：Flora 图案起于 1966 年的一次委托：摩纳哥王妃 Grace 走进米兰的 Gucci 店铺，Rodolfo Gucci 请她任选一件礼物，她要一条满布花卉的丝巾。按 Kering 的品牌史文章，Rodolfo 转请插画师 Vittorio Accornero de Testa 画出 "an explosion of flowers"，首版在 1966 年 3 月的一周内完成，27 种花、逾 30 色。2005 年 Frida Giannini 把这枚图案重新启用，随后以它命名香水；2010 年上市的淡香精为柑橘、牡丹开场，桂花与玫瑰在中段，广藿香、檀香收底。
- 来源链接：https://www.kering.com/en/group/kering-highlights/gucci-flora-from-a-1960s-scarf-to-a-timeless-house-code/ ；https://wwd.com/beauty-industry-news/fragrance/gucci-fashions-a-flirtatious-fragrance-1878805/ ；https://www.fragrantica.com/perfume/Gucci/Flora-by-Gucci-Eau-de-Parfum-7610.html
- 备注：1966 年丝巾缘起、Vittorio Accornero de Testa、"an explosion of flowers"、27 种花与逾 30 色、2005 年 Giannini 复刻，逐项对应 Kering 文章正文；引文逐字取自同页。年份 2010 依 Fragrantica 的 Flora by Gucci Eau de Parfum 条目（明确写 launched in 2010），WWD 那篇为 2008-12-05 的上市前报道、讲的是先行的淡香水版本，故文案只说「随后以它命名香水」、不把 Giannini 的引语当成 2010 年 EDP 的发布语。同名版本多（EDT 与 EDP、后续 Flora Gorgeous 系列），香调已按指定数据核对为一致；指定香调含粉红胡椒，仅 talkingmakeup 一处列出，来源单薄，未写入文案。

### 268. heeley-menthe-fraiche（排名 528）
- 名称：James Heeley Menthe Fraîche Eau de Parfum（官网未标年份）
- 背书类型：官方标语
- 文案：Heeley 官网给 Menthe Fraîche 的一句定位是 "Simply fresh, like garden mint"，产品描述写 "A contemporary, ultra-fresh, natural scent."，收尾一句是 "An olfactive interlude."。官方香调为留兰香、胡椒薄荷、香柠檬、绿茶、小苍兰与白雪松，以天然喷雾形式出售 100ml、50ml、15ml 套装与 2ml 试用装，官网标价 129.17 欧元。同一页面还附两句品牌自撰的人物速写，分别以 ♂ 与 ♀ 标记，写的是使用者气质，不是代言人。
- 来源链接：https://www.jamesheeley.com/en/eau-de-parfum/21-menthe-fraiche.html ；https://www.heeley.com/en/shop/menthe-fraiche-1696
- 备注：三句引文逐字取自 jamesheeley.com 与 heeley.com 两个官方产品页的正文（两站文案一致），已在 raw 中核对。香调表以 heeley.com 版为准（Top 留兰香、胡椒薄荷、香柠檬 / Heart 绿茶、小苍兰 / Bottom 白雪松），与指定香调一致；jamesheeley.com 100ml 页只列一种薄荷。两点说明：其一，♂ 速写举例提到 American Psycho 里的 Patrick Bateman，是品牌自己的比喻，不是名人代言，全条不按「名人同款」处理；其二，官网页面未见发布年份，raw 中也无可靠年份出处，故名称处标「官网未标年份」，不猜。

### 269. maison-margiela-replica-under-the-lemon-trees（排名 529）
- 名称：Maison Margiela Fragrances Replica Under the Lemon Trees Eau de Toilette（2018）
- 背书类型：官方标语
- 文案：REPLICA 系列给每支香标一个记忆坐标，Under the Lemon Trees 标的是意大利巴勒莫，1987 年。官方文案写这支香 "transports you to the bright and refreshing sensation of a nap in the shade of the refreshing lemon tree leaves, well-deserved after a warm summer day stroll, lulled by shadows and the soft scented breeze"。前调以 calamansi 青柠、苦橙叶与小豆蔻复刻柠檬的酸亮，中调芫荽、马黛茶与绿茶勾出树荫的草叶气，后调雪松、岩蔷薇与麝香收住。调香师 Violaine Collas，2018 年 12 月上市。
- 来源链接：https://www.maisonmargiela.com/en-us/replica-under-the-lemon-trees-eau-de-toilette-S33YX0058S11720961.html ；https://www.rustanmarketingcorp.com.ph/post/maison-margiela-replica-launches-in-the-philippines ；https://nstperfume.com/2018/12/05/maison-martin-margiela-under-the-lemon-trees-new-fragrance/ ；https://perfumdle.com/en/parfum/maison-margiela-replica-under-the-lemon-trees/
- 备注：引文逐字取自 maisonmargiela.com 该产品页正文。时间地点标注 Palermo, 1987. 与调香师 Violaine Collas 出自菲律宾经销商 Rustan Marketing 的上市稿，原句为 "Violaine Collas drew inspiration from a personal memory"；该稿是品牌文案转载、非品牌自有域名，故与官方页并列标注，perfumdle 条目亦记 Perfumer: Violaine Collas。上市时间据 Now Smell This 2018-12-05 的上市报道。口径出入：NST 该文末句写 "$126 for 100 ml Eau de Parfum"，与官方标注的 Eau de Toilette 浓度不符，文案采官方浓度，不采该价格句。

### 270. parfums-de-marly-godolphin（排名 530）
- 名称：Parfums de Marly Godolphin Eau de Parfum（2010）
- 背书类型：经典故事
- 文案：Godolphin 得名于阿拉伯种马 Godolphin Arabian，Fragrantica 写作 "named after the renowned stallion ancestor of so many glorious horse race winners"。品牌 2009 年由 Julien Sprecher 创立，叙事架在路易十五的马尔利城堡与官方所称的 "Perfumed Court" 上，马既是纹章也是命名规则。这支由 Michèle Saramito 调配，2010 年上市：百里香、藏红花、覆盆子开场，玫瑰、鸢尾、茉莉居中，皮革、降龙涎香醚与白木收底，官方称 "Godolphin highlights warm accents of saffron, reveals the power of noble leather"。
- 来源链接：https://parfums-de-marly.com/products/godolphin ；https://www.fragrantica.com/perfume/Parfums-de-Marly/Godolphin-11771.html ；https://us.parfums-de-marly.com/pages/la-maison ；https://www.marcgebauer.com/en/products/godolphin
- 备注：那句官方描述与香调表逐字取自 parfums-de-marly.com 产品页；born in 2009、Perfumed Court、Château de Marly 取自官方 La Maison 页。年份 2010、调香师 Michèle Saramito、以及命名来自赛马祖先一句取自 Fragrantica（另 scentsamples 与 Fragrantica 一致记 2010 / Saramito）。「第五支创作」一说出自零售商 Marc Gebauer 的产品描述 "Parfums de Marly's fifth creation, Godolphin"，非官方页，故单列。未采用：Harrods、Notino 等渠道把香调写成含 cypress、maté 的另一版列表，与官方页不一致，文案一律从官方香调表。

### 271. salvatore-ferragamo-signorina-misteriosa（排名 533）
- 名称：Salvatore Ferragamo Signorina Misteriosa Eau de Parfum（2016）
- 背书类型：经典故事
- 文案：Signorina Misteriosa 是 Signorina 系列第三支香水，WWD 2015 年 12 月报道它将于次年 2 月先在欧洲上架。据 WWD 现场稿，黑莓与橙花构成 "fresh, bitter" 的开场，晚香玉贡献 "the sensual opulence"，广藿香作心，黑香草慕斯压底；IFF 的 Sophie Labbé 与 Nicolas Beaulieu 参与调配。瓶身沿用系列方瓶，粉金底座配黑色 grosgrain Vara 蝴蝶结。授权公司 Interparfums 的产品页写 "the black bow unveils the mysterious and magnetic notes of this fruity blend"。
- 来源链接：https://wwd.com/beauty-industry-news/fragrance/feature/salvatore-ferragamo-signorina-misteriosa-10289875/ ；https://www.interparfumsinc.com/products/signorina-misteriosa ；https://www.fragrantica.com/perfume/Salvatore-Ferragamo/Signorina-Misteriosa-32646.html
- 备注：上市月份、调香师、瓶身与三句英文引文均逐字取自 WWD 2015-12-03 稿（作者 Luisa Zargani）；WWD 原文写 "will hit shelves in February"，刊发时为 2015 年 12 月，故落 2016 年 2 月，Fragrantica 亦记 "In February 2016, Salvatore Ferragamo launched another fragrance from the Signorina collection"。Interparfums 引文取自其产品页正文。未采用：WWD 提到该片由模特 Grace Hartzel 出镜并拍四分钟短片，按规范这属于模特拍商业广告，不构成名人同款，故背书类型定为经典故事，文案也不写代言。

### 272. montale-pure-gold（排名 539）
- 名称：Montale Pure Gold Eau de Parfum（2009）
- 背书类型：官方标语
- 文案：Montale 官网把 Pure Gold 写成日光下的白花与果香："Under dazzling sunlight, Egyptian White Flowers and golden Italian Fruits bloom over a silky base of Musk, Vanilla and Patchouli."。官网香调表为柑橘、香柠檬、桃、菠萝，玫瑰、广藿香、铃兰、紫罗兰，琥珀、橡苔、白麝香。Fragrantica 记其 2009 年上市，归在品牌的 Golden Selection 系列，规格为 100ml 浓香精。整体走白花加果香的明亮路线，与官网自述的 "A luminous fragrance with universal charm." 一致。
- 来源链接：https://www.montaleparfums.com/en/floral/63-pure-gold-or-brillant.html ；https://www.fragrantica.com/perfume/Montale/Pure-Gold-9225.html
- 备注：两句英文与三行香调表逐字取自 montaleparfums.com 产品页；年份 2009、Golden Selection 系列归属、100ml EDP 规格取自 Fragrantica。未采用：Harrods 页面把品牌起源写成 "After creating a range of fragrances for Saudi Arabian royalty, Pierre Montale returned to Paris"，该创始人口径在本项目第 3 批出现过争议记录，且此处仅见于零售商文案、无品牌自有出处，故不写入文案，也不把 Pierre Montale 记为调香师（Fragrantica 虽列其为 nose，但与上述争议口径纠缠，回避）。另注意 Harrods 的香调表（杏、橙花、茉莉）与官网表不同，文案从官网。

### 273. ormonde-jayne-ormonde-woman（排名 540）
- 名称：Ormonde Jayne Ormonde Woman Eau de Parfum（2002）
- 背书类型：经典故事
- 文案：Ormonde Jayne 由 Linda Pilkington 于 2002 年 11 月 30 日在伦敦创立，品牌名一半取她住的 Ormonde 路，一半取她的中间名 Jayne；Ormonde Woman 是这家屋子的第一支香水。官方产品页写它 "Beginning and ending with the unique scent of Black Hemlock absolute – rarely used in such luscious quality and quantity"，黑铁杉由此成为品牌签名材料。据创始人访谈，她按各家香精公司的「SPECIALITY OILS」清单索样，"Hemlock came in from Canada"。香调为小豆蔻、芫荽、割草，黑铁杉、紫罗兰、茉莉，岩兰草、雪松、琥珀、檀香。
- 来源链接：https://ormondejayne.com/products/ormonde-woman ；https://www.fragrantica.com/news/Interview-with-Linda-Pilkington-perfumer-and-founder-of-Ormonde-Jayne-599.html ；https://www.fragrantica.com/perfume/Ormonde-Jayne/Ormonde-Woman-4930.html
- 备注：官方引文、Linda's Notes 与香调表逐字取自 ormondejayne.com 产品页。创立日期、"Ormonde" 取路名 "Jayne" 取中间名、以及 "Her first fragrance was Ormonde Woman" 均逐字取自 Fragrantica 的 Linda Pilkington 访谈（原文 "Ormonde Jayne is a small perfumery founded by Linda Pilkington on November 30th, 2002 in London."；该页提示 archived，事实由搜索摘要正文佐证，未再抓全文）。年份 2002 另见 Fragrantica 香水条目。口径出入：调香师一项，Fragrantica 记 Geza Schoen，Basenotes 同时列 Geza Schoen 与 Linda Pilkington，故文案不点调香师姓名，仅在备注并列。

### 274. floris-cherry-blossom（排名 547）
- 名称：Floris London Cherry Blossom Eau de Parfum（2013）
- 背书类型：经典故事
- 文案：Floris 1730 年由 Juan Famenias Floris 与妻子 Elizabeth 在伦敦 St James 的 89 Jermyn Street 开店，铺面至今仍由家族后人经营。官方历史页记 1820 年取得第一份王室御用认证，名目为 "Smooth Pointed Comb Maker to HM The King George IV"，当时梳子是 Floris 的招牌；2023 年再获查尔斯三世认证，写作 "Manufacturers of Toilet Preparations to HM The King"。Cherry Blossom 于 2013 年 2 月上市，官方描述为 "A soft, feminine floral-fruity fragrance that blends delicate petals with fresh, uplifting accords."。
- 来源链接：https://www.florislondon.com/pages/our-history ；https://www.florislondon.com/blogs/news/floris-london-the-royals-a-timeless-legacy-in-british-perfumery ；https://www.florislondon.com/products/cherry-blossom-eau-de-parfum ；https://nstperfume.com/2013/02/11/floris-cherry-blossom-new-perfume/
- 备注：1730 年创业、89 Jermyn Street、1820 年第一份认证三句逐字取自官方 our-history 页；2023 年查尔斯三世认证的名目取自官方博客 Floris London & The Royals（2025-04-14）。香调与官方描述取自 Cherry Blossom 产品页。上市时间据 Now Smell This 2013-02-11 "British perfume house Floris has launched Cherry Blossom"，Fragrantica 亦记 2013，两边一致。口径出入：Jermyn Street 街区站 jermynstreet.net 另记 Floris 现持 "Perfumers to HM The Queen Elizabeth II"（1971）与 "Manufacturers of Toilet Preparations to HRH The Prince of Wales"（1984）两份认证、累计二十份，与官方博客以 1820 为第一份、2023 为最新的排序有出入，文案统一采官方口径，此处并列存疑。

### 275. juliette-has-a-gun-romantina（排名 549）
- 名称：Juliette Has a Gun Romantina Eau de Parfum（2011）
- 背书类型：经典故事
- 文案：Romantina 于 2011 年推出，是 Juliette Has a Gun 的第一支花香调。品牌由 Romano Ricci 在巴黎与格拉斯之间创立，他是 Nina Ricci 的曾孙；官网把朱丽叶写成被搬进 21 世纪、手里握枪的莎士比亚女主角，枪是香水的隐喻。关于这支香，Ricci 说自己的出发点一直是花香，落点是晚香玉加橙花，但配方仍有六成是麝香，所以并非直白的花束；他也说这支香的温柔只是表象 "its gentleness is only an appearance"，广藿香一压，底下就带出西普的骨架。
- 来源链接：https://www.juliettehasagun.com/en/pages/marque-page ；https://nstperfume.com/2011/10/28/juliette-has-a-gun-romantina-new-perfume/ ；https://moodiedavittreport.com/juliette-has-a-gun-explores-new-territory-with-romantina-fragrance/
- 备注：品牌沿革三项——在巴黎与格拉斯之间创立、Nina Ricci 曾孙、枪是香水的隐喻——均出自官网 Our story 页（原文 "Created in France between Paris and Grasse by Romano Ricci, great grandson of Nina Ricci"，"a gun, metaphor for her perfume"）。香调里那句引文逐字引自 Now Smell This 2011-10-28 报道中转述的 Romano Ricci 原话（该文标注 quote via juliettehasagun）。文案中关于出发点与配方比例的说法，来自 Ricci 接受 Moodie Davitt Report 采访的原话（"I have always wanted to do a floral fragrance"、"I have always liked tuberose, so that was the starting point, mixed with orange blossom"、"the formula is still 60% musk"），本条目以中文转述、未加引号。Fragrantica 把创作故事讲成 24 小时罗马之旅，与 NST 版本侧重不同，故未采用该细节。未查到任何名人同款或代言人证据。

### 276. mancera-coco-vanille（排名 550）
- 名称：Mancera Coco Vanille Eau de Parfum（2016）
- 背书类型：官方标语
- 文案：Mancera 官网给 Coco Vanille 的文案是 "A tropical cocoon where coconut blends with creamy vanilla."，把椰子与香草写成一处热带茧房，接着落到逃离感："Designed to evoke escape, it warms the skin with an exotic, addictive softness, reminiscent of a sunset on a deserted beach."。官方香调表分三层列出：前调椰子与白桃，中调依兰、大溪地栀子与埃及茉莉，后调木质、马达加斯加香草荚与白麝香。
- 来源链接：https://www.manceraparfums.com/en/gourmand/55-coco-vanille.html ；https://www.fragrantica.com/perfume/Mancera/Coco-Vanille-42782.html
- 备注：两段引文逐字引自 manceraparfums.com 该产品页的 Description 段。三段香调表对应官网 Head/Heart/Base notes 原文 "Coconut, White Peach"、"Ylang-Ylang, Tiare Flowers & Egyptian Jasmine"、"Woody Notes, Vanilla Pods from Madagascar & Sensual White Musk"，与任务给定香调一致。年份 2016 与调香师 Pierre Montale 仅 Fragrantica 一处，属单一来源。官网未公布代言人或名人使用记录，故背书类型只取官方标语。

### 277. montblanc-explorer-platinum（排名 551）
- 名称：Montblanc Explorer Platinum Eau de Parfum（2023）
- 背书类型：官方标语
- 文案：万宝龙官网称 Explorer Platinum "celebrates the adventure and exploration of the mountains"，规格栏三层对应得极干净：Top Note 紫罗兰叶、Heart Note 快乐鼠尾草、Base Note 雪松。要区分清楚同系列的两支：Explorer 原版是香柠檬、鼠尾草打头，落点皮革与广藿香；Explorer Ultra Blue 走海洋调、龙涎香与皮革，紫罗兰叶只作中调的一层。Platinum 没有这些转折，全支就压在紫罗兰叶的绿意、鼠尾草的草本与雪松的暖木上。Fragrantica 记其 2023 年上市，调香师 Bruno Jovanovic。
- 来源链接：https://www.montblanc.com/en-us/montblanc-explorer-platinum-eau-de-parfum-100ml-MB131294.html ；https://www.fragrantica.com/perfume/Montblanc/Explorer-Platinum-81392.html ；https://www.montblanc.com/en-us/fragrances/collection/explorer
- 备注：版本已逐项核对，不存在张冠李戴。本条目香调（紫罗兰叶／快乐鼠尾草／雪松）与官网 Platinum 产品页规格栏原文 "Top Note: Violet leaf Heart Note: Clary sage Base Note: Cedarwood"、以及 Fragrantica 的 "Top note is Violet Leaves; middle note is Clary Sage; base note is Cedarwood" 完全吻合。Ultra Blue 虽同样含紫罗兰叶，但中调是海洋调与龙涎香、基调含皮革与印尼广藿香（Fragrantica Ultra Blue 条目），结构不同，未采用其任何素材。官网 Explorer 系列合集页给出原版香调（香柠檬、Pomarose、鼠尾草／岩兰草、皮革、檀香／广藿香、Ambrofix、Akigalawood），据此写原版对比。任务提示所说的三大洲原料叙事与广告面孔属 Explorer 原版系列，Platinum 官网页未提，故不写入。年份 2023 与调香师 Bruno Jovanovic 仅 Fragrantica 单一来源。

### 278. burberry-her-intense（排名 554）
- 名称：Burberry Her Eau de Parfum Intense（2025）
- 背书类型：官方标语
- 文案：Burberry 官方产品页称这支香是 "a vibrant, gourmand fragrance for women"，同段写明它如何加浓："Her Eau de Parfum Intense amplifies Her’s signature scent with fruity notes of wild strawberry and orange blossom, rounded with warm, ambery wood."。上市稿把香调分三层：野草莓、橙花、琥珀木，与库内记录一致。2025 年 1 月 1 日上架，瓶身换成更深的哑光漆粉，广告由 Mario Sorrenti 拍摄 Fran Summers。
- 来源链接：https://us.burberry.com/burberry-her-eau-de-parfum-intense-50ml-p40848101 ；https://www.dutyfreehunter.com/blog/free-your-spirit-burberry-unveils-new-her-eau-de-parfum-intense/
- 备注：两段英文引文均逐字出自 us.burberry.com 产品页（`burberry-her-eau-de-parfum-intense-50ml-p40848101`）的 Product Details 段，raw-e.txt 第 690–692 行。香调三层的原文取自 Duty Free Hunter 2025-01-07 上市稿的 Olfactive Notes 段（raw-e.txt 第 719 行）："Top notes: Wild strawberry"、"Heart notes: Orange Blossom accord"、"Base notes: Ambery wood" 三段各自逐字，原稿以换行分隔，本文为了可读用顿号并列，其中带斜杠的合并写法是我的拼读标注、不当作连续引文。上架日期与渠道同稿原文 "Available from January 1st on Burberry.com, in Burberry stores and from select retailers"，raw-e.txt 第 729 行。广告面孔 Fran Summers、摄影师 Mario Sorrenti 见同稿 About the Campaign 段（第 723 行），Moodie Davitt Report（2025-01-07）与 GTR Magazine（2025-01-07）同记，两家均为品牌新闻稿改写，故只作事实陈述、未按「名人同款」定级。**版本与 id 冲突**：2019 年版 Her Intense 官方原文为 "Dark and fruity, the original Eau de Parfum is intensified with notes of blackberry, intoxicating jasmine and warm benzoin."（pl.burberry.com 商品页 p40809161，raw-e.txt 第 626 行），Parfumo 同记 2019 年版黑莓／茉莉／安息香、调香师 Francis Kurkdjian（第 575–589 行）；Olfastory 明确指出两版命名混淆："The name invites confusion with Her Intense, a 2019 flanker built on blackberry, jasmine and benzoin"（raw-e.txt 第 742 行）。因此本条只写 2025 版内容，不掺 2019 版的事实；id `burberry-her-intense` 与产品名不符一事记入文末数据债。未加引号的中文均为转述，不是引文；来源未明说的（如 2025 版调香师姓名）一律不写。

### 279. kilian-back-to-black（排名 557）
- 名称：Kilian Paris Back to Black, aphrodisiac Eau de Parfum（2009）
- 背书类型：官方标语
- 文案：Kilian 官网写这支香的灵感是 "Rekindle small fires in the darkest of nights"，香气本身是 "Languid honey laced with sweet spices"，蓝洋甘菊与雪松被烟裹住，尾调再用檀香接出一个美食调的烟草和谐。官网标的主香调是雪松、焚香、蜂蜜，调香师署名为 Calice Becker。创始人 Kilian Hennessy 出身法国干邑世家，官网把他的创作根子系在童年酒窖的气味上："From the dark cognac cellars of his childhood memories"；官网另一处写他生于 "one of France’s most illustrious dynasties in fine liquors"。
- 来源链接：https://www.bykilian.com/product/19797/50774/perfume/back-to-black-aphrodisiac/the-smokes ；https://www.bykilian.com/about-kilian-paris ；https://www.fragrantica.com/designers/By-Kilian.html
- 备注：四段引文（灵感句、"Languid honey laced with sweet spices"、"From the dark cognac cellars..."、"one of France’s most illustrious dynasties in fine liquors"）与调香师署名 "Perfumer: Calice Becker"、"Main notes: Cedarwood, Incense, Honey" 均逐字引自 bykilian.com 的 Back to Black, aphrodisiac 产品页与 About KILIAN PARIS 页传记段。"Blue camomile and cedarwood are veiled in smoke." 为中文转述、未加引号。系列归属存疑并在文案中回避：官网该产品页把此香归入 The Smokes 家族，Fragrantica 设计师页则把它列在 2009 年、L'Oeuvre noire 系列下，两处口径不一，故文案不写系列名，但 aphrodisiac 副名保留在名称里。年份 2009 见 Fragrantica 设计师页与 Surrender to Chance（该站另记 2009 年上市、Calice Becker），官网未标年份。未查到名人同款。

### 280. lancome-la-nuit-tresor（排名 558）
- 名称：Lancôme La Nuit Trésor Eau de Parfum（2015）
- 背书类型：官方标语
- 文案：兰蔻官网称 La Nuit Trésor 是 "a sultry, smoldering perfume for women"，并点明它是品牌第一支 "Gourmand Woody Fruity & Floral" 香水，原句写 "This new fragrance is Lancôme’s first ‘Gourmand Woody Fruity & Floral’ perfume"。官方香调表：前调荔枝与覆盆子，中调大马士革玫瑰精萃与焚香，后调塔希提香草兰净油、果仁糖、广藿香与纸莎草。瓶身按黑钻石切面做，颈上系一枚黑色缎面玫瑰。这支香 2015 年 2 月上市，广告面孔是 Penélope Cruz。
- 来源链接：https://www.lancome-usa.com/fragrance/fragrance-by-collection/tresor/la-nuit-tresor-eau-de-parfum/102607.html ；https://www.beautyscene.net/fragrances-for-women/lancome-la-nuit-tresor/ ；https://www.theperfumegirl.com/perfumes/fragrances/lancome/la-nuit-tresor/
- 备注：引文逐字引自 lancome-usa.com 产品页 Description 段。香调表为同页原文 "Top Note: Lychee, Raspberry Middle Note: Rose Damascena Essence, Incense Base Note: Absolute Vanilla Orchid Tahitensis, Praline, Patchouli, Papyrus"，与任务给定香调一致。瓶身细节来自同页 Bottle 段（黑钻石形、黑色缎面玫瑰颈饰）。版本已核对：本条目对应 2015 年原版，广告面孔 Penélope Cruz 亦属原版——BeautyScene 2014-12-09 上市稿原文 "The faces of the campaign are Penélope Cruz and Ilay Kurelović and the photo was signed by Mert Alas and Marcus Piggott"，Perfume Girl 同记 2015 年 2 月上市；à la Folie、Le Parfum 等 flanker 的代言信息一概未采用。调香师一项来源冲突：BeautyScene 与 Perfume Girl 写 Christophe Raynaud 与 Amandine Marie（Clerc-Marie），Parfumo 多列 Honorine Blanc，官网未署名，故文案不写调香师。Penélope Cruz 属品牌广告面孔、非其公开自述使用，按规范不计为名人同款。
