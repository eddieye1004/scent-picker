# lore-batch5-476-550：结果卡背书语料 · 第五批后半（popularityRank 第 476–550 瓶）

调研日期：2026-11-23。数据来源：仓库 C:/Users/16256/work/scent-picker-v23/data/perfumes.json（只读，未改任何仓库文件）。名单生成方法：全库 1388 瓶中 popularityRank 非空且 >0 的共 553 瓶，按 popularityRank 升序排序后取排序名次第 476–550 位（0-based 索引 475..549），对应 popularityRank 951–1181，与前半批 401–475（rank 797–950）无缝衔接、无重叠。

**统计**：见 receipt.md 与 search/final-rows.json 的机器输出。

**调研与核验规则**（同 401–475 批，逐条沿用）：
- 每瓶 1–3 次英文 WebSearch（Exa），每次查询与返回全文逐字存盘到 search/raw-{a..g}.txt 作审计底账；所有 URL 均逐字取自搜索结果的 URL: 字段，无手工拼造。
- 站点拒绝抓取（403/429）但搜索摘要明确支持的，注明「仅搜索摘要佐证」。
- 名人同款须有主流媒体或品牌官方佐证（含官方广告面孔/代言，均在备注注明）；论坛「平替/dupe」说法一律不采用；模特出镜拍商业广告不计名人同款。
- 「官方标语」类包含品牌官方广告语及官方产品文案原文（均在备注说明出处段落）。品牌自述式香调罗列不构成「官方标语」级背书。
- **Afnan 判例（2026-11-23 定）**：唯一来源是品牌自有页、页面通篇只有枚举+泛化形容词的，判「无可靠来源」，文案与来源链接留空，备注逐条写下调理由。
- 年份/调香师等事实来源冲突的，文案回避并在备注并列说明。
- **汇编不做字符规范化**：引号内英文按 raw 原字节照抄（弯撇号 ’ 不改成直撇号）。

---

### 476. al-haramain-detour-noir（排名 951）
- 名称：Al Haramain Detour Noir Eau de Parfum（年份未标注）
- 背书类型：官方标语
- 文案：Al Haramain 官方商城给 Detour Noir 的文案是一段冒险叙事，开头一句是 "Get ready for an adventure with Haramain Detour Noir Spray"，把香气说成一次进入未探明疆域的旅程。品牌 1970 年由 Kazi Abdul Haque 在麦加起家，最初做沉香贸易，这支香属其面向大众价位的产品线。2024 年印尼上市活动上，品牌全球销售主管 Abu Taher Choudhury 说这条线是为回应市场对更可负担香水的需求而推，并称消费者试用后多半直接接受。
- 来源链接：https://us.alharamainperfumes.com/en/detour-noir.html ；https://dev.alharamainperfumes.com/E-Catalog/e-catalog.pdf ；https://luxina.id/al-haramain-perkenalkan-rangkaian-fragrance-terbarunya-di-indonesia/ ；https://www.fragrantica.com/perfume/Al-Haramain-Perfumes/Detour-Noir-70748.html
- 备注：判「官方标语」而非 Afnan 下调：官方产品页除规格表外有一整句独立的场景叙事（冒险、未探明疆域），不是纯香调枚举加泛化形容词，属边界偏上；引号句逐字取自该页。品牌沿革（1970 年、Kazi Abdul Haque、沉香贸易起家）取自品牌电子目录 About Us 段，Choudhury 表态与印尼上市取自 luxina.id 2024-08-07 报道，两处均为转述非引号。年份仅 Fragrantica 记 2021（单一来源），故名称行不写。浓度 Eau de Parfum 由官方页标题与规格表证实。写作时所用名单的香调字段为空（本条名单生成取错键，事后已修正，仓库 top/heart/base 实有数据），文案未据空字段发挥，故不列香调。

### 477. caron-narcisse-noir（排名 952）
- 名称：Caron Narcisse Noir Parfum（1911）
- 背书类型：经典故事
- 文案：Narcisse Noir 是 Caron 创业期第一支大成功，1911 年推出。官方页面把它归到创始人 Ernest Daltroff 对白花的长期执念：他一生着迷于那种兼具天真与野性的花，这支香被他写成一份关于双面的自白。官方还记了一则影史逸事——1947 年 Michael Powell 与 Emeric Pressburger 的影片借它得名；三年后 Gloria Swanson 拍 Billy Wilder 的《Sunset Boulevard》，要求把片场喷满这支香。官方自己在段末补了 "True or not"，明说这是传闻。
- 来源链接：https://www.parfumscaron.com/en/products/narcisse-noir ；https://www.fragrantica.com/perfume/Caron/Narcisse-Noir-1911-5593.html
- 备注：年份 1911 由品牌页 Story 段与 Fragrantica 双向支持，调香师 Ernest Daltroff 两处一致。浓度写 Parfum，取自官方页产品类型标注，未与现行其他浓度混用。影片与 Swanson 一段是品牌自述，文案照其保留 "True or not" 的限定，不当既成事实。写作时所用名单的香调字段为空（本条名单生成取错键，事后已修正，仓库 top/heart/base 实有数据），文案未据空字段发挥，故不列香调。

### 478. eisenberg-jose（排名 953）
- 名称：Eisenberg J'Ose Eau de Parfum（年份未标注）
- 背书类型：官方标语
- 文案：Eisenberg 官网把 J'Ose 写成 "A cheeky fragrance for those who dare"，正文结尾一句是 "Dare the unexpected, dare J'OSE"。品牌博客另给了创作缘起："J'OSE is José Eisenberg's first olfactory creation."，即同名创始人的第一支作品，该文署期 2024 年 11 月 27 日。官网把同一香名分列女版与男版两个 Eau de Parfum 产品页，各写一套叙述：女版讲不受驯服、不刻意讨好的女性，男版讲不追潮流、自带磁场的人，配方口径称两者同源而配比不同。
- 来源链接：https://eisenberg.com/products/jose-eau-de-parfum-for-women ；https://eisenberg.com/blogs/eisenberg/j-ose-l-iconique
- 备注：三处引号逐字取自女版产品页与品牌博客。需注意官网对同一香名分列 Femme 与 Homme 两个 EDP 页，本条引语与浓度均取女版页，避免与男版混淆。年份未在任何来源明确到年，故名称行不写。写作时所用名单的香调字段为空（本条名单生成取错键，事后已修正，仓库 top/heart/base 实有数据），文案未据空字段发挥，故不列香调。

### 479. kenneth-cole-reaction（排名 957）
- 名称：Kenneth Cole Reaction Eau de Toilette（年份未标注）
- 背书类型：经典故事
- 文案：Reaction for Men 的上市由 WWD 在 2004 年 6 月报道，当时定档当年 9 月。Kenneth Cole 本人给这支香的定位是 "citrus with a twist"：他说自己要的是 "light and fresh" 的柑橘，但不能是可预测的那一种。报道还交代了背景——Coty 已于 2003 年 5 月从 LVMH 买下 Kenneth Cole 的香水授权，这是此后的第二支男香，品牌方指望它拉来新的客群，并把这一支当作新香水品牌线的起点。
- 来源链接：https://wwd.com/fashion-news/fashion-features/a-new-reaction-from-kenneth-cole-593699/ ；https://www.fragrantica.com/perfume/Kenneth-Cole/Reaction-2966.html
- 备注：上市年份来源冲突，故名称行留「年份未标注」：WWD 2004-06-04 报道写当年 9 月上市，Fragrantica 记 2004，Parfumo 与 parfumelore 记 2005（或为批次/再版年份）。调香师 Frank Voelkl 在 Fragrantica 与 Parfumo 一致，但 WWD 只写香精来自 Symrise 团队，故文案不点名。两句引语逐字取自 WWD 正文；WWD 另一处引语含排版残留符号，未采用。写作时所用名单的香调字段为空（本条名单生成取错键，事后已修正，仓库 top/heart/base 实有数据），文案未据空字段发挥，故不列香调。

### 480. nasomatto-duro（排名 960）
- 名称：Nasomatto Duro Extrait de Parfum（年份未标注）
- 背书类型：官方标语
- 文案：Nasomatto 官网对 Duro 只给一句意图："The fragrance aims to enhance all the manifestations of male strength."，并把这支香放在 "the project Nasomatto" 的框架里说，即每支香都是同一个计划的一段。瓶身被写进叙事：瓶盖用 Wenge 木，官网称它 "one of the strongest type of timber"，另标 "Made in Italy" 与 "Released in 2007"。经销商另转述品牌口径："Duro was the very first fragrance of Nasomatto collection."，并说明 Duro 在意大利语里就是硬的意思。品牌始终没公布香调表，Kafkaesque 2014 年的长文点明官网不列香调，并称这家香坊以 Black Afgano 闻名。
- 来源链接：https://nasomatto.com/products/duro ；https://kafkaesqueblog.com/2014/03/18/nasomatto-duro/
- 备注：判「官方标语」而非 Afnan 下调：官方页虽短，但除材质与年份信息外有一句独立的创作意图陈述与"计划"框架，Kafkaesque 亦复述该句，属边界条目，理由记此。年份 2007 仅官网自标，按库内 null 不写入名称行。香调未写：官方无表，经销商稿件互相冲突（乌木系与杏仁肉桂系两套说法并存）。写作时所用名单的香调字段为空（本条名单生成取错键，事后已修正，仓库 top/heart/base 实有数据），文案未据空字段发挥，故不列香调。

### 481. armani-si-passione（排名 965）
- 名称：Giorgio Armani Sì Passione Eau de Parfum（年份未标注）
- 背书类型：名人同款
- 文案：Sì Passione 的广告面孔是 Cate Blanchett。品牌上市通稿写，这位澳籍奥斯卡得主自 2013 年 Sì 诞生起就是它的形象；Sì Passione 推出时她与 Adwoa Aboah、Sara Sampaio 同框，平面与短片均由 Tom Munro 拍摄，色调压在品牌标志性的阿玛尼红上。2018 年 5 月的官方新闻稿宣布合作延长，Blanchett 成为 Armani Beauty 首位全球美妆代言人，从香水扩到彩妆与护肤。她本人谈及这支香时说，喜欢它深沉的感官调子与细腻层次，用起来觉得自己还有冒险的余地。Giorgio Armani 本人对 Sì 的定位是 "an irresistible combination of grace, strength and independence of spirit"。
- 来源链接：https://www.multivu.com/players/uk/8294351b-si-passione-campaign/ ；https://www.prnewswire.com/news-releases/giorgio-armani-beauty-is-pleased-to-announce-the-extension-of-its-enduring-collaboration-with-cate-blanchett-683227361.html ；https://www.harpersbazaar.com.sg/beauty/heres-what-global-beauty-ambassador-for-armani-beauty-cate-blanchett-says-si-to
- 备注：代言关系有两处独立来源（品牌 campaign 通稿与 PR Newswire 官方稿），且 Blanchett 在 Harper's BAZAAR Singapore 2019-04-30 的专访里有公开表态，符合「名人同款」，不属于模特拍商业广告。她那段自述为转述未加引号。Sì Passione 具体上市年份来源均未写明，2013 是 Sì 原作年份，不可挪用，故名称行留「年份未标注」。写作时所用名单的香调字段为空（本条名单生成取错键，事后已修正，仓库 top/heart/base 实有数据），文案未据空字段发挥，故不列香调。

### 482. byredo-la-tulipe（排名 966）
- 名称：Byredo La Tulipe Eau de Parfum（年份未标注）
- 背书类型：官方标语
- 文案：Byredo 官方产品页对 La Tulipe 的说明从季节写起："When tulips start blooming, it is the sign that Spring has sprung."，接着讲冬天结束、花园重新有了硬朗的色块与形状，并主动承认郁金香不是人们第一反应会想到的香花："Tulips may not be the first flowers you would think of as being fragrant, but a number are definitely sweet-smelling."。页面下方另列四条产品属性：79,6% natural、Floral、Genderless、Delicate Intensity，配方里的天然来源成分占 79.6%。同一支香在官方渠道还出过 7.5ml 滚珠香油，沿用同一组描述语。
- 来源链接：https://www.byredo.com/us_en/p/la-tulipe-eau-de-parfum ；https://www.byredo.com/us_en/p/la-tulipe-roll-on-perfumed-oil
- 备注：引号句与四条属性逐字取自官方产品页（us_en 版）。判「官方标语」而非下调：该页有独立成篇的季节叙事，不是香调枚举加泛化形容词。年份未在任何来源明确（Fragrantica 记 2010，单一来源），故名称行不写；Fragrantica 另称调香师为 Jérôme Epinette 与 Ben Gorham，亦属单一来源，未入文案。写作时所用名单的香调字段为空（本条名单生成取错键，事后已修正，仓库 top/heart/base 实有数据），文案未据空字段发挥，故不列香调。

### 483. molinard-habanita（排名 969）
- 名称：Molinard Habanita Eau de Parfum（年份未标注）
- 背书类型：经典故事
- 文案：Habanita 1921 年由格拉斯的家族香坊 Molinard 推出，最初不是擦在皮肤上的香水，而是用来熏香烟的：小瓶带玻璃涂棒，另有可塞进烟盒的香片，服务的是战后开始公开抽烟的新女性。因销路太好，1924 年改为个人香水，浓度提高并补上花香骨架，瓶身是 René Lalique 设计的黑色玻璃，带那圈著名的裸身仙女浮雕。战后上市时它被称作 "the most tenacious perfume in the world"。
- 来源链接：https://osmetheca.be/en/perfumes/habanita.html ；https://www.olfastory.com/en/perfume/habanita/bottle
- 备注：调香师来源冲突，故文案不点名：osmetheca 记为 Henri Bénard，Fragrantica 2021 年对 Molinard 第五代主理人 Célia Lerouge Bénard 的访谈则说 "Habanita was signed by a certain Monsieur Boucanier"，两者并列存疑。引号句 "the most tenacious perfume in the world" 逐字取自 olfastory 转述的 1924 年上市口径，Fragrantica 访谈亦以 tenacious 一词复述。名称行年份留空：1921 为原作年、1924 为皮肤香水年，库内 null，不擅定。写作时所用名单的香调字段为空（本条名单生成取错键，事后已修正，仓库 top/heart/base 实有数据），文案未据空字段发挥，故不列香调。

### 484. maison-margiela-replica-on-a-date（排名 978）
- 名称：Maison Margiela Fragrances Replica On a Date Eau de Toilette（年份未标注）
- 背书类型：官方标语
- 文案：品牌官方对 Replica On a Date 的说明是一段完整场景："A date overlooking the magnificent vineyards of Provence, enveloped in the golden glow of a late summer’s sunset."，落句是 "On A Date is the scent of grapes and roses."。它属 Replica 的「记忆中的气味」系列，"It is a part of the Replica fragrance line inspired by pleasant memories"，官方写明调香师 Carlos Benaïm 的动机："When working on this fragrance, the perfumer Carlos Benaïm was inspired by his own cherished memories of Provence"，即他在普罗旺斯迈出香水业第一步。原料说明强调玫瑰花瓣与广藿香为可持续采购，广藿香来自巴厘岛，玫瑰花瓣来自土耳其的 Isparta。品牌另称这支香捕捉的是被阳光晒热的熟葡萄的果香，与野玫瑰那种纤细却不含糊的性格，用以还原普罗旺斯葡萄园在夏日黄昏的气息。
- 来源链接：https://www.maisonmargiela-fragrances.eu/en_GB/fragrances/discover/replica-memories/replica-on-a-date/MM086.html ；https://www.fragrantica.com/news/Maison-Margiela-REPLICA-On-a-Date-17490.html
- 备注：四处引号逐字取自官方 MM086 产品页，原文 sunset 后接句点、vineyards 一段用的是弯撇号 ’，均照抄未规范化。调香师 Carlos Benaïm 官方页与 Fragrantica 两处一致。Fragrantica 新闻称这支香「captures a day in Provence in 2014」，属系列叙事里被记住的年份而非上市年；上市年在 Fragrantica 记 2022（同一站点两处，非独立来源），故名称行留「年份未标注」。浓度 Eau de Toilette 由官方页 CONCENTRATION 栏证实。写作时所用名单的香调字段为空（本条名单生成取错键，事后已修正，仓库 top/heart/base 实有数据），文案未据空字段发挥，故不列香调。

### 485. parfums-de-marly-oajan（排名 980）
- 名称：Parfums de Marly Oajan Eau de Parfum（2013）
- 背书类型：经典故事
- 文案：Oajan 2013 年随 Parfums de Marly 的 Arabian Breed 系列面世，同批四支：Kuhuyan、Hamdani、Habdan、Oajan，当时 125ml 装定价 275 美元。品牌给的命名说法借的是一匹名马："Back in the olden days the Oajan was considered a powerful frame of war and riders nowadays do not hesitate to rely on him to win successive riding championships."，即旧时视其为战马之材，今日骑手仍靠它连胜。品牌自身的框架来自 18 世纪，创始人 Julien Sprecher 说这座香坊取意凡尔赛之外只接待国王亲信的那座城堡，并以 1743 年路易十五委托的群马雕塑为纹章原型。
- 来源链接：https://nstperfume.com/2013/12/18/parfums-de-marly-arabian-breed-collection-new-fragrances/ ；https://us.parfums-de-marly.com/pages/the-maison-our-story
- 备注：年份 2013 有两处支持：NST 2013-12-18 记该系列「Earlier this year」上市，Fragrantica 记 2013。命名说法一句逐字取自 NST 引述的品牌文案（经 osswaldnyc 转发），属二手转述品牌原话，已在正文标明是品牌说法。创始人 Julien Sprecher 与 Château de Marly 一段取自品牌官网 Our Story，1743 年路易十五委托 Guillaume Coustou 的群马雕塑亦在该页。调香师 Shyamala Maisondieu 只见于经销商与博客（scentsplit、venba），非官方，未入文案。写作时所用名单的香调字段为空（本条名单生成取错键，事后已修正，仓库 top/heart/base 实有数据），文案未据空字段发挥，故不列香调。

### 486. ariana-grande-sweet-like-candy（排名 986）
- 名称：Ariana Grande Sweet Like Candy Eau de Parfum（年份未标注）
- 背书类型：名人同款
- 文案：Sweet Like Candy 是 Ariana Grande 的第二支香水，由 LUXE Brands 操盘，首月在 Ulta 独家。Billboard 2016 年 8 月的专访里，她本人说做这支香的出发点是 "the vibe is sweet, fun and sexy"，要给歌迷的东西；品牌页则写它 "Inspired by Ariana's seductively sweet, fun and sexy personality"。她深度参与：跑香精公司、与包装设计师对稿、参加营销会，瓶子沿用上一支 Ari 的多面瓶身，整只改成哑光粉，另加一颗毛球挂饰。广告片由 Hannah Lux Davis 执导，她在片中分身扮演冰淇淋车司机等角色。
- 来源链接：https://www.billboard.com/music/music-news/making-ariana-grande-second-perfume-sweet-like-candy-7460866/ ；https://arianagrandefragrances.com/products/sweet-like-candy
- 备注：名人同款成立：她本人是冠名方与广告主演，Billboard 专访与品牌页两处独立支持，且 Teen Vogue 2016-11-18 报道可佐证广告片由 Hannah Lux Davis 执导、她本人出镜。上市年在 Billboard 报道里为 2016 年 8 月发售（Ulta 独家首月），品牌页未标年份，故名称行留「年份未标注」。浓度 Eau de Parfum 取 Ulta 商品页标注。写作时所用名单的香调字段为空（本条名单生成取错键，事后已修正，仓库 top/heart/base 实有数据），文案未据空字段发挥，故不列香调。

### 487. bvlgari-man-extreme（排名 987）
- 名称：Bvlgari Man Extreme Eau de Toilette（2013）
- 背书类型：经典故事
- 文案：Bvlgari Man Extreme 是 2013 年的男香，Fragrantica 记为调香师 Alberto Morillas 的作品，日本方面 2013 年 2 月 6 日的上市新闻稿把它写成木质调的清透男香，瓶身走金属银灰处理，取意自罗马大理石被凿削后的质感，与该品牌罗马起源的说法接得上。来源页列出的结构是佛手柑、粉红葡萄柚与仙人掌汁开场，小豆蔻、小苍兰与琥珀居中，海地香根草、木质与安息香收底；页面同时把它形容为有魅力而浓烈的一支。比同门 Man 系列其他版本，它的柑橘开场更亮，尾段偏干燥香根草。
- 来源链接：https://www.fragrantica.com/perfume/Bvlgari/Bvlgari-Man-Extreme-17373.html ；https://prtimes.jp/main/html/rd/p/000000018.000005631.html
- 备注：年份 2013 由 Fragrantica 与日本上市稿（2013-02-06 发布，写明 2 月 6 日发售）双向支持；调香师仅 Fragrantica 与 Perfumica 单方给出，未在品牌自有页复核。写作时名单香调字段为空（生成取错键，已修正），文案里的香调全部按上述来源页原文次序列出，未增补。瓶身"罗马大理石"说法来自日文新闻稿原句，已译为中文叙述，未当英文引文用。

### 488. montale-dark-purple（排名 992）
- 名称：Montale Dark Purple Eau de Parfum（2011）
- 背书类型：官方标语
- 文案：Dark Purple 是 Montale 2011 年的作品，Fragrantica 与零售商 aedes 都记调香师为 Pierre Montale。品牌自有页对这支香的描述是 "Beneath a plum-hued sky, juicy Plum and opulent Rose unfold a floral and gourmand dance, grounded in earthy Patchouli and deep Musk."，把李子与玫瑰的甜果花香和土质广藿香的重量放在一处对照，收在一句大胆而催眠的东方之旅上。页面香调为李子、橙开场，玫瑰、天竺葵、广藿香与红浆果居中，灰琥珀、柚木与白麝香收底。相比 Montale 多数只列香调的同门页面，这一页有独立的场景句，故判官方标语。
- 来源链接：https://www.montaleparfums.com/en/fruity/41-dark-purple-prune.html ；https://www.fragrantica.com/perfume/Montale/Dark-Purple-13280.html
- 备注：品牌页同时给出香调枚举与一段完整场景描写（梅紫色天空—李子—玫瑰—广藿香—麝香的叙事），属有独立文案的页面，不落入 Afnan 判例的"纯枚举＋泛化形容词"范畴，故不下调。引号内英文逐字取自 montaleparfums.com 页面正文。年份 2011 由 Fragrantica 与 aedes 产品页（CREATED 2011）两处支持。

### 489. orientica-royal-amber（排名 993）
- 名称：Orientica Royal Amber Eau de Parfum（年份未标注）
- 背书类型：官方标语
- 文案：Royal Amber 属 Orientica 的 Luxury Collection，品牌美区页把浓度标为 Eau de Parfum，香调为佛手柑与青绿开场，中段蜜瓜、菠萝、美食调与琥珀，底子是木质、香草与麝香。产品描述写 "Luxury Collection Royal Amber breaks the ice for you whether you try to or not."，接着说琥珀、蜜瓜与菠萝一路把接力棒交给香草与麝香，外面裹一层木质。这套措辞在品牌美区站与英国官方站逐字一致，说明是品牌统一文案，不是零售商自撰。
- 来源链接：https://www.orienticaperfumes.com/en-us/products/royal-amber ；https://www.orientica.co.uk/products/orientica-luxury-collection-royal-amber-80ml
- 备注：边界条目，判官方标语的理由逐条写明：其一，页面除香调三行外存在完整营销句（breaks the ice…／truly complements your pizzazz），不是纯枚举；其二，该句在两个不同地区的品牌自有站逐字相同，可确认是品牌原始文案而非渠道改写；其三，页面无创作缘起、无命名故事，故不判经典故事。未查得年份与调香师，故年份写未标注。Afnan 判例不适用（该页并非只有香调枚举＋泛化形容词）。

### 490. versace-blue-jeans（排名 995）
- 名称：Versace Blue Jeans Eau de Toilette（1994）
- 背书类型：经典故事
- 文案：Blue Jeans 1994 年 5 月先在意大利上市，同年 10 月 WWD 报道它由 Fragrance Marketing Group 引进美国，只出一个 2.5 盎司淡香水喷雾规格，定价 29.50 美元，首轮铺约一千个柜台，年底目标五千个。报道引经销商 David Alfin 的话，说这两支 Jeans 香 "very fashion-forward, youthful and spirited"，并写明 Versace 打算每隔一年半就用新香和不同颜色的牛仔名替换。Fragrantica 记调香师为 Jean-Pierre Bethouart，柑橘与罗勒开场，薰衣草、玫瑰、康乃馨居中，香草、檀香与琥珀收底。瓶为苏打水瓶形，蓝盖铁罐。
- 来源链接：https://wwd.com/fashion-news/fashion-features/feature/article-1165803-1738049/ ；https://www.fragrantica.com/perfume/Versace/Blue-Jeans-637.html
- 备注：1994 年由 WWD（1994-10-07）与 The Rose Sheet（1994-06-27，记 9 月在意大利 1300 个柜台首发）两处独立支持；WWD 原文写 "Jeans was launched in Italy last May"。引号内英文逐字取自 WWD 正文。调香师 Jean-Pierre Bethouart 见 Fragrantica 与 perfumesclub 产品页；Perfume Intelligence 对这支香的香调记法与 Fragrantica 不同（记前调玫瑰/薰衣草/天竺葵），文案采用 Fragrantica 一系，冲突已在备注并列。

### 491. billie-eilish-eilish-no-2（排名 997）
- 名称：Billie Eilish Eilish No. 2 Eau de Parfum（2022）
- 背书类型：官方标语
- 文案：Eilish No. 2 于 2022 年 11 月 18 日在品牌自营渠道首发，官方新闻稿称它 "a sultry woody floral"，并写明命名由来：数字 2 的书写形状被拿来对应瓶身与影像里的性感曲线；瓶子沿用胸、颈、锁骨的造型，这版改以深灰金属色呈现。香调为意大利佛手柑、苹果花与焚香开场，纸莎草、黑胡椒与野罂粟居中，秘鲁圣木、乌木与皮肤麝香收底。WWD 报道调香由 Takasago 完成，同一家也做过她的首支香水，配方在原创基础上加了辛香与木质。
- 来源链接：https://www.prnewswire.com/news-releases/introducing-eilish-no-2--the-dark-alluring-new-fragrance-created-by-billie-eilish-301681652.html ；https://wwd.com/beauty-industry-news/fragrance/exclusive-billie-eilish-parlux-release-no2-fragrance-1235362545/
- 备注：属本人自有品牌、本人为创作者，不按「名人同款」处理（该类型要求代言或公开使用他人产品）。引号内英文逐字取自 PR Newswire 稿件正文。上市日 2022-11-18、定价 72 美元见稿件；Takasago 见 WWD。WWD 页面标注日期为 2019-09-03 但正文写 2022 年 9 月 29 日，属该站时间戳异常，文案只用其正文事实。

### 492. dior-dior-homme-intense（排名 999）
- 名称：Dior Dior Homme Intense Eau de Parfum（年份未标注）
- 背书类型：官方标语
- 文案：Dior 官方产品页给这支香的定位句是 "Dior Homme is worn the way you wear an elegantly sharp, modern suit."，随后把香调强度归到鸢尾上，配一层琥珀色面与贵木底。香调按 Fragrantica 记为薰衣草开场，鸢尾、黄葵籽与梨居中，弗吉尼亚雪松与香根草收底；官方页另设专段讲托斯卡纳鸢尾，写根茎须先处理再干燥至少三年才取得净油，也单独交代厄瓜多尔黄葵籽的处理流程。Dior 自家的调香师 François Demachy 在科威特官方页上评它是干燥而持久的东方调。
- 来源链接：https://www.dior.com/en_int/beauty/products/dior-homme-intense-Y0479201.html ；https://www.fragrantica.com/perfume/Dior/Dior-Homme-Intense-2011-13016.html
- 备注：年份冲突，故不写：Fragrantica 与 fragrancesdb 记现版为 2011，fragrancesdb 另称配方 2007 年签定、2011 年重做，Dior 官方页未标年份——按规范并列冲突、正文回避。引号内英文逐字取自 dior.com 国际站正文。调香师 François Demachy 见 Fragrantica 与 Dior 科威特官方页（Perfumer-Creator 署名）。

### 493. juliette-has-a-gun-pear-inc（排名 1003）
- 名称：Juliette Has a Gun Pear Inc. Eau de Parfum（2021）
- 背书类型：经典故事
- 文案：Pear Inc. 2021 年 4 月上市，Fragrantica 记调香师为品牌创始人 Romano Ricci。品牌页与英国零售商页面都附了 Ricci 的第一人称说明："I designed this new fragrance thinking about the return of warm sunny days and of my favourite fruit, the Pear."，他讲小时候在果盘里注意到梨的形状格外突出，想做一支带一点美食感的清新果香麝香，当作好夏天的许诺。结构写作绿梨在前、Ambroxan 居中、麝香与 Muscenone 一类大环麝香收底，品牌把香调家族归为果香麝香。
- 来源链接：https://www.johnlewis.com/juliette-has-a-gun-pear-inc-eau-de-parfum/p5583557 ；https://www.juliettehasagun.com/en/products/pear-inc
- 备注：引号内英文逐字取自 John Lewis 产品页（与品牌页措辞一致，品牌页为第三人称改写，故引零售商页的完整第一人称版）。上市时间：合作零售商页记 Year of release 2021，theperfumegirl 记 2021 年 4 月，两处一致。调香师署名见 Fragrantica（Romano Ricci）。写作时名单香调字段为空（生成取错键，已修正），正文香调按品牌页与零售商页所标次序列出。

### 494. mancera-roses-greedy（排名 1004）
- 名称：Mancera Roses Greedy Eau de Parfum（2012）
- 背书类型：经典故事
- 文案：Roses Greedy 2012 年 9 月上市，Now Smell This 当时报道它由巴黎的 Mancera 推出，英国先在 Selfridges 上架，60 毫升 56 英镑、120 毫升 100 英镑，浓度标为淡香精。同一篇引品牌说法 "Mancera perfumes are inspired by the art deco period, using rare and exotic materials to create a new dynamic of perfumery."，并列出玫瑰、茉莉、水生花、琥珀与香草，配柑橘、桃、椰子和黑加仑的果味，另补安息香与白麝香。Fragrantica 记调香师为 Pierre Montale，发布时间与上述报道吻合，香调三段与报道基本同构，只多记粉红胡椒在前、糖在底，这两处差异未写进正文。评论区把这支香说成蒙塔莱姊妹线的猜测，无品牌或本人证实，不采。
- 来源链接：https://nstperfume.com/2012/09/12/mancera-roses-greedy-new-perfume/ ；https://www.fragrantica.com/perfume/Mancera/Roses-Greedy-18042.html
- 备注：引号内英文逐字取自 Now Smell This 正文引用块。该篇为 2012-09-12 发布的新香快报，属香评媒体而非品牌页，Afnan 判例不适用（本条目判经典故事，依据是上市时间、渠道与调香师，不依赖广告语）。调香师 Pierre Montale 见 Fragrantica 与 aedes；Mancera 与 Montale 的关系在媒体评论里只作猜测，正文未采用。

### 495. montblanc-emblem（排名 1005）
- 名称：Montblanc Emblem Eau de Toilette（2014）
- 背书类型：官方标语
- 文案：Emblem 是 Montblanc 2014 年的男香，Fragrantica 记由 Sonia Constant 与 Olivier Pescheux 共同调制。官方产品页的开场句是 "A burst of clary sage and cardamom mixed with sparkling grapefruit immediately reveals a strong, contrasted, harmonious and charismatic fragrance."，随后写紫罗兰叶与肉桂叶那股清脆的绿色霜感，尾段落在贵木与零陵香豆的调和上，收在一句独一无二的签名里。页面标注的结构是鼠尾草、小豆蔻与葡萄柚在前，紫罗兰叶与肉桂居中，零陵香豆与贵木收底，与 Fragrantica 的记法一致。
- 来源链接：https://www.montblanc.com/en-ch/eau-de-toilette_cod23471478575779107.html ；https://www.fragrantica.com/perfume/Montblanc/Emblem-23711.html
- 备注：引号内英文逐字取自 montblanc.com 瑞士站产品页正文（同段文字在希腊站、西班牙站重复出现，属品牌统一文案）。年份 2014 见 Fragrantica；调香师 Sonia Constant 与 Olivier Pescheux 亦见 Fragrantica，品牌页未署名。品牌页只给香调与感受性句子，无创作缘起，故不判经典故事。

### 496. kilian-flower-of-immortality（排名 1011）
- 名称：Kilian Paris Flower of Immortality Eau de Parfum（2013）
- 背书类型：官方标语
- 文案：Flower of Immortality 2013 年推出，Fragrantica 记调香师为 Calice Becker。品牌页给的灵感句是 "A peach blossom floating on a crystal-clear stream"，随后把新生与春天的意象铺开：带露的白桃花、小苍兰、玫瑰与香草的柔色花束，一股油桃的果香像清溪的暗流，通向那朵花取饮的不老泉。香调写作白桃、鸢尾与零陵香豆，前调白桃与黑加仑，中调鸢尾与玫瑰。这支香归在品牌的清新系列里，该系列以柑橘、醛香或水生调打底。
- 来源链接：https://www.bykilian.com/product/19797/52755/perfume/flower-of-immortality/the-fresh ；https://www.fragrantica.com/perfume/By-Kilian/Flower-of-Immortality-17597.html
- 备注：引号内英文逐字取自 bykilian.com 产品页 Inspiration 一行。品牌页有独立的灵感句与完整场景叙事，不属 Afnan 判例情形。浓度按库内记 Eau de Parfum；需说明法国站同一产品页容量行写作 50 ml parfum，浓度标注在品牌各站点不一致，此处从库内。年份 2013 与调香师 Calice Becker 见 Fragrantica。

### 497. lancome-la-vie-est-belle-intensement（排名 1012）
- 名称：Lancôme La Vie est Belle Intensément Eau de Parfum（2020）
- 背书类型：官方标语
- 文案：Intensément 是 2020 年 2 月上市的版本，Fragrantica 的报道把开篇写成佛手柑、粉红胡椒与覆盆子，中段沙巴茉莉净油、橙花与天芥菜，底部红鸢尾、香草、广藿香、檀香与安息香。品牌澳洲站产品页直接把标语印成大写："SECRET OF THE PERFUMER: SEIZE HAPPINESS HERE AND NOW WITH LA VIE EST BELLE INTENSÉMENT"，并把首度调出的红鸢尾与香草组合列为卖点。瓶身沿用该系列的水晶微笑造型，这版灌的是浓烈的紫红汁液。
- 来源链接：https://www.lancome.com.au/perfume/la-vie-est-belle-intensement-eau-de-parfum-intense/00029-LAC.html ；https://www.fragrantica.com/news/Lancome-La-Vie-Est-Belle-Intensement-13247.html
- 备注：引号内英文逐字取自 lancome.com.au 产品页，含 É 与全大写，未作规范化。上市时间 2020 年 2 月见 Fragrantica 新闻（2020-02-04）与 Perfume Society。代言说法冲突，已回避不写：Fragrantica 称该版仍由 Julia Roberts 出镜，viaedm 则称这一版广告里她缺席、画面以瓶身为主。调香师品牌页只写 one of France's leading perfumers，未具名，故不写。

### 498. nishane-karagoz（排名 1014）
- 名称：Nishane Karagoz Extrait de Parfum（2017）
- 背书类型：官方标语
- 文案：Karagoz 属 Nishane 的 Shadow Play Trilogy 系列，官方产品页把它写成对生活顽皮一面的致意，并请使用者像土耳其影子戏角色那样乐于被注意到，原句是 "Is a tribute to playful treats of life, wittiness, straightforwardness and sincerity."。品牌写这支香以菠萝与香草的明亮开场，接橙花、茉莉、广藿香的厚实中段，再用岩兰草、沉香与琥珀收尾。官方标注浓度 Extrait de Parfum，有 50 ml 与 15 ml 两种装量，2017 年发售。
- 来源链接：https://nishane.com/product/karagoz/ ；https://www.fragrantica.com/perfume/Nishane/Karagoz-44176.html
- 备注：年份 2017 与调香师 Jorge Lee 见 Fragrantica 与 Parfumo 条目，品牌页本身未写年份。官方页有独立命名叙事（Karagöz 皮影戏角色、三支同属 Shadow Play Trilogy），不是纯香调枚举，故不适用 Afnan 下判。文案只引官方页原句，香调未自加（写作时名单香调字段为空，生成取错键已修正）。

### 499. parfums-dusita-melodie-de-lamour（排名 1015）
- 名称：Parfums Dusita Mélodie de l'Amour Extrait de Parfum（2016）
- 背书类型：经典故事
- 文案：Mélodie de l'Amour 是 Pissara Umavijani 为 Parfums Dusita 最早的三支香之一，创作缘起由她本人讲清：父亲、泰诗人 Montri Umavijani 的诗句里反复写到爱的临在，她想做一支能真正填满整个空间的香水。她自学调香，起先只是把自己最初的两支配方拿给巴黎 Jovoy 店主 François Hénin 看，并没打算卖，对方反过来劝她自立品牌。官方页面对它的定位是 "Mélodie de l'Amour is a love song with a unique Floral essence - love absolute!"，并注明它拿过 Art & Olfaction Award。2016 年上市，2017 年从五百多支参赛作品中获评年度香水。
- 来源链接：https://www.parfumsdusita.com/product-page/m%C3%A9lodie-de-l-amour ；https://www.optionstheedge.com/topic/people/pissara-umavijani-honours-her-father%E2%80%99s-life-fragrances-inspired-poems-he-wrote
- 备注：年份 2016 见 Fragrantica 与 Parfumo；颁奖细节（2017 年、逾 550 支参评）见 Options, The Edge 2024-10-11 专访；官方页只写获奖未写年份。调香师 Pissara Umavijani 三处一致。"填满空间"的表述源自她本人在 Scentissime 转载的创作说明（未列入来源链接）。

### 500. roja-parfums-reckless（排名 1017）
- 名称：Roja Parfums Reckless Pour Femme Eau de Parfum（年份未标注）
- 背书类型：官方标语
- 文案：Reckless Pour Femme 是 Roja Parfums 的女香，官方页把香气写成奶香橙花与檀香木化进香草与安息香，形成结晶糖式的甜，"Notes of creamy Neroli and Sandalwood melt into Vanilla and Benzoin to create a sparkling surprise of a crystallised sugar."，再以橙、柑橘与粉红胡椒提亮。品牌另给了一段人物设定：Reckless 的女人跟着心走，看似随性却从不草率，按自己的规矩过日子，世界只能跟上；她总能掀起下一场热闹，让人来不及想就跟上去。官方标注 75 ml、浓度 Eau de Parfum。
- 来源链接：https://rojalondon.com/products/reckless-femme-edp ；https://rojadoveperfumery.com/products/reckless-edp
- 备注：年份未标注——检索结果里只有 2021 年的 Reckless Pour Femme Essence de Parfum 有明确年份（Fragrantica），与库内 eau-de-parfum 不是同一支，故不写年份。两支常被混谈（Selfridges 与 Amaris 页面标题即 Essence de Parfum），文案只取 EDP 官方页原句。人物设定段出自 rojadoveperfumery.com 的同名 EDP 页，与官方页描述同源，属独立叙事，故判官方标语而非香调枚举。

### 501. amouage-opus-i（排名 1019）
- 名称：Amouage Opus I Eau de Parfum（2010）
- 背书类型：经典故事
- 文案：Opus I 是 Amouage 2010 年 The Library Collection 三支中的第一支，由 Daniel Maurel 调配，系列由时任创意总监 Christopher Chong 主导。官方与媒体报道的说法是：这套香以图书馆为题，向生活的艺术致意，瓶身做成书的形状，正面像一页白纸，三支均不分性别。2010 年 7 月 31 日上市，100 ml 定价 275 欧元，纽约 Aedes 先做发布。Opus I 被归为西普调，该系列后已停产。
- 来源链接：https://www.fragrantica.com/perfume/Amouage/The-Library-Collection-Opus-I-9917.html ；http://www.mimifroufrou.com/scentedsalamander/2010/06/amouage_the_library_collection.html
- 备注：年份 2010、调香师 Daniel Maurel、创意总监 Christopher Chong 三处互证（Fragrantica 条目、Fragrantica 新闻、Scented Salamander 2010-06-17）。上市日期、275 欧元定价、书形包装、Aedes 首发均出自 Scented Salamander；停产一说见 Fragrantica 条目的 Collections Discontinued 栏。原文引句 "Amouage presents a new luxury collection The Library Collection, which includes three scents - Opus I, Opus II and Opus III." 已核，因文案已密，仅作备注存证。

### 502. dolce-gabbana-the-only-one（排名 1021）
- 名称：Dolce&Gabbana The Only One Eau de Parfum（2018）
- 背书类型：名人同款
- 文案：The Only One 2018 年 8 月底上市，广告面孔是 Emilia Clarke，"Emilia Clarke is a brand ambassador for Dolce & Gabbana."，此前她与 Kit Harington 合拍过该品牌广告，这一支由她单独出演。片子拍在罗马一家小餐馆，导演 Matteo Garrone，摄影 Morelli 兄弟，她在片中唱了 1960 年代意大利流行曲 Quando, Quando, Quando；她受访时说这一支气味浓郁、留得住，也承认自己进组前已反复听过那首歌。香气围绕紫罗兰与咖啡的对立展开。
- 来源链接：https://www.businessinsider.com/emilia-clarke-new-dolce-gabbana-ad-video-2018-9 ；https://www.fragrantica.com/perfume/Dolce-Gabbana/The-Only-One-51249.html
- 备注：代言身份见 Business Insider 2018-09-04 报道与 Fragrantica 条目（The face of the campaign is actress Emilia Clarke）；导演、摄影、歌曲见 Business Insider；罗马小餐馆场景与其本人引语见 Remix Magazine 2018-10-09 专访（未列入来源链接）。Vogue 2017 那篇讲的是 The One 淡香水，不是 The Only One，未采。年份 2018 见 Fragrantica。

### 503. guerlain-terracotta（排名 1024）
- 名称：Guerlain Terracotta Eau de Toilette（2024）
- 背书类型：官方标语
- 文案：Terracotta 是 Guerlain 把招牌修容粉做成香水的产物，那罐粉本身是品牌的美妆标志，官方写明 "Guerlain Master Perfumer, Thierry Wasser, has interpreted the iconic Terracotta Powder to create fragrance that bursts with sunshine."，气味要做出阳光感，让人立刻想到遥远的异国天堂。2024 年它被收进 Les Légendaires 系列，改为 75 ml 淡香水，用 1912 年 Raymond Guerlain 设计的倒心形瓶。官方对香气的说法是佛手柑开场，中段为提亚蕾与依兰的合鸣，收在柔和的香草上。
- 来源链接：https://www.guerlain.com/ae/en-ae/p/les-legendaires-terracotta---eau-de-toilette-P014899.html ；https://www.fragrantica.com/news/GUERLAIN-Les-Legendaires-Guerlain-Collection-Terracota-Eau-de-Toilette-20981.html
- 备注：年份 2024 见 Fragrantica 条目与 2024-08-27 的 Fragrantica 新闻，品牌页未写年份。调香师 Thierry Wasser 两处一致。争议：多位 Fragrantica 用户在新闻下留言称这实际是旧款 Terracotta Le Parfum 换新瓶归入 Les Légendaires，气味未变（同日两条留言），故文案只写官方叙述、不写配方改动。倒心形瓶与 1912 年 Raymond Guerlain 见品牌页与新闻。

### 504. rasasi-shuhrah（排名 1029）
- 名称：Rasasi Shuhrah Eau de Parfum（年份未标注）
- 背书类型：官方标语
- 文案：Shuhrah 是 Rasasi 的日常线，官方商城把它拆成 FOR HIM 与 FOR HER 两支，均为 90 ml 装。男版官方描述写它把佛手柑、乳香、雪松、橡苔与沉香混进花香，"to create an fresh woody masculine scent that is uplifting and charismatic"，并说这只简洁的瓶子装的是可以天天用的香，给那种不必费力就能讨人喜欢的人。女版则写成玫瑰、小苍兰、佛手柑、铃兰、灰琥珀与麝香的组合，官方称之为对女性优雅的花香颂。
- 来源链接：https://store.rasasi.com.sa/en/brovqpy/p1632906448 ；https://store.rasasi.com.sa/en/onozpmv/p168892209
- 备注：唯一来源是 Rasasi 官方商城页面（页首自称 "Welcome to Rasasi Perfumes Official E-store."），无新闻稿、无代言人信息，故只按品牌自有文案判定。边界说明：该页除香调枚举外另有两句瓶身与人物叙事（"The simple clean bottle houses an everyday fragrance that lends a very endearing allure to a man who can charm his way effortlessly."），不属通篇枚举型，故不下调为无可靠来源。库内只写 Shuhrah 未分性别，官方实际分男版女版、同为 Eau de Parfum 90 ml，此处引男版原句。年份官方页未载明，写年份未标注。

### 505. ajmal-wisal-dhahab（排名 1033）
- 名称：Ajmal Wisal Dhahab Eau de Parfum（2015）
- 背书类型：官方标语
- 文案：Wisal Dhahab 是 Ajmal 定位男女皆宜的一支，品牌自有文案给它一句独立广告语——"Wisal Dhahab is modern masculinity bottled."，说它开场是苹果与桃子的果香爆发，中段转到带香料的花香，收在麝香、檀香与广藿香的木质底上。官方产品页写它装在描金边的瓶里，前调苹果、桃、梨、葡萄柚与柑橘，中调玫瑰、茉莉、兰花与天竺葵，后调檀香、雪松、广藿香与麝香。阿联酋官网标注 50 ml，2015 年发售。
- 来源链接：https://uk.ajmal.com/products/wisal-dhahab-perfume-1-7-fl-oz-50-ml-for-men ；https://en-ae.ajmal.com/wisal-dhahab-spray
- 备注：年份 2015 与男女皆宜见 en-ae.ajmal.com 产品页（"It was released in 2015."）；香调与描金瓶身见 uk.ajmal.com 与 sa.ajmal.com 产品页。判定边界：两支产品页基本是香调枚举加瓶身泛化形容，形态接近 Afnan 判例；不下调的唯一依据是品牌自有博客 in.ajmal.com（2025-07-11）给出的独立广告句，属品牌自有文案原句而非枚举。若只认产品页，此条应下调，一并记录。

### 506. lattafa-haya（排名 1039）
- 名称：Lattafa Haya Eau de Parfum（2022）
- 背书类型：官方标语
- 文案：Haya 是 Lattafa 2022 年推出的女香，品牌印度站把它写成 "A radiant expression of femininity"，一支 "captures the joy of spontaneity, natural beauty and blushing charm" 的香，用香槟、草莓、血橙与玫瑰开场，中段是栀子、茉莉与香草兰，收在琥珀、檀香与烤栗子的暖调上。品牌还单独解释了命名：Haya 一词指向优雅、灵动与含蓄的魅力，与这支香年轻的气质相配。官方标注浓度 EDP，100 ml 正装，另有 12 ml 旅行装与 50 ml 发香雾。
- 来源链接：https://www.lattafaindia.com/products/haya ；https://www.lattafa.my/perfumes/lattafa/haya/
- 备注：年份 2022 见 Lattafa 印度站产品页（"Introduced in 2022"）与 Fragrantica 条目。库内浓度为空，官方页明写 "ConcentrationEDP" 与 "Eau De Parfum – Natural Spray"，故补 Eau de Parfum。命名解释与产品文案出自 lattafaindia.com；香调、装量与 100 ml/12 ml/50 ml 组合见 lattafa.my 与 lattafa-usa.com。无代言人或名人关联，不判名人同款。

### 507. tauer-perfumes-cologne-du-maghreb（排名 1044）
- 名称：Tauer Perfumes Cologne du Maghreb Eau de Cologne（2021）
- 背书类型：经典故事
- 文案：Cologne du Maghreb 首版发表于 2015 年，2021 年由 Andy Tauer 重新发行，这一版比原版略浓，仍是全天然植物原料。品牌自述它按传统古龙水做法调成，"Cologne du Maghreb is crafted in a traditional cologne spirit: bright citrus oils, aromatic herbs and a refreshing natural lift."，摩洛哥的一面来自橙花、玫瑰、阿特拉斯雪松、爪哇岩兰草、岩蔷薇与劳丹脂，让清新的柑橘与草本落在干燥、带树脂感的底上。50 ml 装，在瑞士手工灌装。
- 来源链接：https://www.fragrantica.com/news/Tauer-Perfumes-Brings-Back-Cologne-Du-Maghreb-15110.html ；https://tauerperfumes.com/products/cologne-du-maghreb
- 备注：2015 首版、2021 重发、比原版略浓、百分之百天然见 Fragrantica 新闻 2021-05-31；调香师 Andy Tauer 见 Fragrantica 条目；引句与 "Made by hand in Switzerland" 见品牌官网产品页。库内浓度 eau-de-cologne 与官方 "Eau de cologne · 50 ml" 一致。2015 首版无独立页面佐证配方细节，故文案只写重发事实，不复述首版香调。

### 508. armaf-hunter-intense（排名 1047）
- 名称：Armaf Hunter Intense Eau de Parfum（年份未标注）
- 背书类型：无可靠来源
- 文案：
- 来源链接：
- 备注：查了 armaf.com 官方产品页、armaf.in、armafperfume.com 与 Fragrantica 条目，四条线索都只有香调枚举加一句泛化形容，官方页对这支的全部描述是 "A bright and invigorating fragrance that embodies effortless freshness." 之后直接列前中后调，没有独立广告语、没有创作缘起、没有命名故事、没有场景叙事，符合 Afnan 判例形态，故下调为无可靠来源，文案与来源链接留空。另有一处香调冲突并列记录：armaf.com 与 Fragrantica 记前调佛手柑、柚子、柑橘、柠檬，中调薰衣草、天竺葵、依兰、晚香玉，后调黑胡椒、小豆蔻；armaf.in 与 armafperfume.com 记前调佛手柑、柠檬、柑橘、小豆蔻，中调天竺葵、薰衣草、玫瑰、月桂胡椒，后调岩兰草、雪松、麝香、劳丹脂、广藿香；Fragrantica 条目另附 "Official ARMAF description" 一段，与后者一致。两套香调互相矛盾且都无第三方可校准，这也是不写的第二个理由。

### 509. carolina-herrera-212-sexy（排名 1048）
- 名称：Carolina Herrera 212 Sexy Eau de Toilette（2004）
- 背书类型：官方标语
- 文案：212 Sexy 归在 Carolina Herrera 的 212 系列里。Fragrantica 的条目把上市年份记为 2004 年，调香师署名 Rosendo Mateu。品牌官网对这支香的说法把它放进曼哈顿的夜色中，原句是 “captures the warm, sensual atmosphere of Manhattan nights”，紧接着写明它面向约会、浪漫晚餐与夜间外出，尾韵被形容为私密的一层。官网目前在售的是 Eau de Parfum 装，库内记录为 Eau de Toilette，两者浓度不同；另有零售商页把上市年份写成 2005 年，并把调香师记为 Alberto Morillas 与 Rosendo Mateu，与前述说法冲突，此处不采。
- 来源链接：https://www.carolinaherrera.com/ww/en/p-fragrance/212-sexy ；https://www.fragrantica.com/perfume/Carolina-Herrera/212-Sexy-306.html
- 备注：引文取自品牌官网产品页正文首段（Highlights 为完整段落，非 403 摘要）。年份与调香师来自 Fragrantica 条目正文。两处冲突已并列且均未采信第二种：官网现售 EDP 与库内 EDT 非同一浓度；romells.com 记 2005 年并多署 Alberto Morillas，与 Fragrantica 的 2004 年、Rosendo Mateu 不一致。assign 香调字段为空，正文未列任何香材。

### 510. etro-heliotrope（排名 1060）
- 名称：Etro Heliotrope Eau de Toilette（1989）
- 背书类型：官方标语
- 文案：Heliotrope 在 Etro 的产品页上被写成一支 unisex 的 Eau de Toilette，官方用两个比喻交代它的性格，原句作 “As sweet as a custard tart and as bright as a Mediterranean sunrise”，后半句接 “this unisex Eau de Toilette provides you with instant pleasure”。同页参数把香族归在 ambery、子族归在 gourmand，容量只给 100 ml，产地标 Made in Italy，没有标年份。上市年份 1989 年由 Fragrantica 条目支持，官方页本身未载，属香评库单方记录。奶味与地中海清晨这两个比喻，是这支香在品牌页上仅有的形象说明。
- 来源链接：https://www.etro.com/us-en/heliotrope-UGAA0002A5001T9994.html ；https://www.fragrantica.com/perfume/Etro/Heliotrope-4812.html
- 备注：两句引文均逐字取自 etro.com 美国站产品页 Description 段，含 ambery / gourmand 的族类标注同段可得。年份仅 Fragrantica 一处，标注为单一来源；etro.com 英国站同页与美站一字不差，属同一文本镜像，不计为第二来源。未采用任何第三方对香调结构的重述（parfumerie.com 那段把鸢尾、茉莉等未见于 assign 的香材补进去，故整段弃用）。

### 511. jo-malone-earl-grey-and-cucumber（排名 1063）
- 名称：Jo Malone London Earl Grey & Cucumber（年份未标注）
- 背书类型：官方标语
- 文案：Earl Grey & Cucumber 是 Jo Malone London 古龙水线上的产品，官方产品页只用两句话交代立意：先写 “The tradition of afternoon tea.”，再写它是 “A fragrance with a burst of bergamot, distinct to Earl Grey, and the cool succulence of crunchy cucumber.”，英国站同一段末尾另加 “Reviving and refined.”。命名里的两个元素就被这两句挂在英式下午茶的传统上，这是这支香唯一可见的命名解释。官方页给出的规格只有 100ml 与 Cologne 这一分类，未写上市年份；零售商页也未补，年份处因此标明未标注，不按该系列其他产品的年份推算。
- 来源链接：https://www.jomalone.com/product/25946/15968/colognes/earl-grey-cucumber-cologne ；https://www.jomalone.co.uk/product/25946/15968/colognes/earl-grey-cucumber-cologne
- 备注：三句引文分别取自 jomalone.com 美国站 Product Details 段与 jomalone.co.uk 同名段落。浓度：库内为 null，官方页只标 Cologne，不在 Eau de Parfum / Eau de Toilette / Parfum / Extrait de Parfum 四种全称之内，故浓度位置留空，不擅自折算成 Eau de Toilette。年份：官方页与 John Lewis 页均未给上市年份，写「年份未标注」，不猜。

### 512. orto-parisi-boccanera（排名 1066）
- 名称：Orto Parisi Boccanera Parfum（2014）
- 背书类型：官方标语
- 文案：Orto Parisi 官方产品页给 Boccanera 的定位是一段关于黑暗与吻的短句：“A fragrance that is covered with darkness, that steals the kiss and leaves a spicy aftertaste on the lips.”，并说它在气味与味道之间、爱与恐惧之间维持一种混乱的平衡。同页注明 Released in 2014，瓶盖为滚磨枪金属镶埃塞俄比亚与索马里的黑角，外盒展开是一座城市与中央的洞，产地意大利。调香师 Alessandro Gualtieri 由零售商页与 Fragrantica 条目佐证，官方产品页本身未署名。品牌全线按 parfum 浓度出品。
- 来源链接：https://ortoparisi.com/products/boccanera ；https://www.fragrantica.com/perfume/Orto-Parisi/Boccanera-24195.html
- 备注：引文与 2014 年份、瓶盖材质、包装描述均逐字取自 ortoparisi.com 产品页 Highlights 全文。调香师官方页无署名，改由 saison.com.au（官方授权零售商）与 Fragrantica 两处佐证。Boccanera 在意大利语中意为「dark mouth」的说法只见于零售商页，未写入正文，避免单源转述。

### 513. the-different-company-oriental-lounge（排名 1068）
- 名称：The Different Company Oriental Lounge Eau de Parfum（2009）
- 背书类型：经典故事
- 文案：Oriental Lounge 是 The Different Company 2009 年的作品，官方页用第一人称写它，署句为 “An Oriental-Spicy Eau de Parfum by Céline Ellena, 2009.”，年份与调香师都写在这一句里。同页的创作说明称，这支香由调香师围绕一种此前未见的搭配构想而成，把甜与苦、顺滑与辛辣的材料放在同一处，并以 “I combine modernity, talent and imagination.” 收束。品牌的立意是把它当作对既有嗅觉家族的一次全新解释，让现代感与《一千零一夜》式的东方想象同时成立。
- 来源链接：https://www.thedifferentcompany.com/en-int/products/oriental-lounge ；https://www.thedifferentcompany.com/en/products/oriental-lounge-flacon-recharge-100ml
- 备注：两句引文分别取自品牌国际站产品页第一段与英文版「I am a play of contrasts」段，逐字一致。年份 2009、调香师 Céline Ellena 在品牌页明文写出，Fragrantica 与 Ferwer 亦记同一年份，无冲突。本条判「经典故事」而非「官方标语」：品牌页有独立的创作缘起叙述（构想来源与立意），不是香调枚举加泛化形容词，不适用 Afnan 下调用例。写作时所用名单的香调字段为空（生成取错键，已修正），文案未据空字段发挥，故不写香材。

### 514. givenchy-play（排名 1072）
- 名称：Givenchy Play Eau de Toilette（2008）
- 背书类型：名人同款
- 文案：Givenchy Play 于 2008 年推出，瓶身做成 MP3 播放器的样子，乳白玻璃配金属框与橡胶按键，是这支香最直观的识别点。WWD 2009 年 7 月的报道写明 “Justin Timberlake will be the face of both Play and Play Intense fragrances.”，即他同时出任 Play 与 Play Intense 的广告面孔；同篇引 LVMH 香水化妆品北美区总裁 Pamela Baxter 的话，说选人的标准是全球认知度、此前未涉足香水领域以及诱惑力。调香由 Emilie Coppermann 与 Lucas Sieuzac 完成，Givenchy 香水创意总监 Françoise Donche 参与方向。美国上市比欧洲晚约一年。
- 来源链接：https://wwd.com/beauty-industry-news/fragrance/feature/timberlake-fronting-two-givenchy-scents-2209193-1473566/ ；https://nstperfume.com/2008/06/27/givenchy-play-new-fragrance/
- 备注：代言人判断依据是 WWD 报道原句（主流行业媒体，非博主转述），符合「名人同款」需主流媒体或官方佐证的硬条件。年份 2008 由 NST（2008-06-27 发文称当年九月上市）与 Fragrantica 两处一致；WWD 报道时点为 2009 年 7 月，讲的是美国上市，两者不矛盾。瓶身描述取自 Fragrantica 与 NST 正文。

### 515. jean-paul-gaultier-le-beau-le-parfum（排名 1074）
- 名称：Jean Paul Gaultier Le Beau Le Parfum Eau de Parfum（2022）
- 背书类型：官方标语
- 文案：Le Beau Le Parfum 是 Jean Paul Gaultier 为 Le Beau 线加出的浓香版本，官方页的开场句是 “Tempt your senses to disobey.”，随后把场景放在 Gaultier 的伊甸园里，说原本那个男人在这里显露最浓的一面，并把这一支称作最禁忌的一类香气，承诺的是一种提神的沉迷。同页另有一句定位：“Le Beau re-imagined with intense, intoxicating woody notes”，瓶身写成从漆黑到透蓝的渐变，瓶上唯一饰件是一片藤叶。Fragrantica 与 Basenotes 都记 2022 年、调香师 Quentin Bisch；官方标 Eau de Parfum Intense，库内记 eau-de-parfum。
- 来源链接：https://www.jeanpaulgaultier.com/us/en_US/p/range-le-beau/le-beau-le-parfum-eau-de-parfum-intense-000000000065180318 ；https://www.fragrantica.com/perfume/Jean-Paul-Gaultier/Le-Beau-Le-Parfum-72158.html
- 备注：两句引文逐字取自 jeanpaulgaultier.com 美国站产品页正文。年份 2022 与调香师 Quentin Bisch 由 Fragrantica、Basenotes 两处一致。浓度：官方写作 Eau de Parfum Intense，库内为 eau-de-parfum，名称行按库内口径写 Eau de Parfum，差异在此说明。瓶身渐变与藤叶饰件取自官方页 THE BOTTLE 段。

### 516. annick-goutal-nuit-etoilee（排名 1082）
- 名称：Annick Goutal Nuit Étoilée Eau de Toilette（2012）
- 背书类型：经典故事
- 文案：Nuit Étoilée 是 Annick Goutal 2012 年推出的中性香，品牌文案写 “From the coolness of the night to the warmth of wood”，后半句把场景落在星空下森林的辽阔里，要的是夜里独行那种清醒又发冷的感觉。调香署名 Camille Goutal 与 Isabelle Doyen，Fragrantica 与 Osmoz 都记 2012 年、Eau de Toilette 浓度，并提到深蓝瓶身分曲线与方形两种，分别对应女版与男版。Perfume Girl 转录的品牌页另称瓶身灵感来自梵高的《星夜》，该说法只有这一处二手转录，品牌现页未见对应文字，故不写入正文。
- 来源链接：https://www.fragrantica.com/perfume/Goutal/Nuit-Etoilee-14722.html ；https://www.osmoz.com/perfumes/annick-goutal/3372/nuit-etoilee
- 备注：引文出自 theperfumegirl.com 转录的 annickgoutal.com 原句，属二手转录，已在备注标明；核心事实（2012、EDT、Camille Goutal 与 Isabelle Doyen、双瓶型）由 Fragrantica 与 Osmoz 两处独立支持。名称行写 Annick Goutal 是沿用库内与 2012 年当时的品牌名。另有 2013 年 EDP 版本（parfumo 记载），与库内 EDT 非同一浓度，未混用。

### 517. byredo-eyes-closed（排名 1084）
- 名称：Byredo Eyes Closed Eau de Parfum（2022）
- 背书类型：经典故事
- 文案：Eyes Closed 是 Byredo 2022 年的作品。创始人 Ben Gorham 讲创作动机时说 “Distance and separation have been a recurring theme over the past few years”，接着说他想做一支能跨过这种割裂感的气味，并认为人若把屏幕推开、闭上眼、关掉物理世界，反而更容易与彼此同频。这段话在 AnOther 与 ifragrance 两处独立刊出，措辞一致，可交叉核对。品牌官网现版产品页已换成简短说明，不载这段话。Fragrantica 记上市年份 2022 年；调香署名官方页未单列，只有零售商页写作 Gorham 与 Jérôme Epinette 合作，属单一来源。
- 来源链接：https://www.anothermag.com/fashion-beauty/14515/byredo-eyes-closed-fragrance-alasdair-mclellan-kiss ；https://www.fragrantica.com/perfume/Byredo/Eyes-Closed-76339.html
- 备注：引文逐字取自 AnOther 报道（2022-11-11）中 Gorham 原话前半句，ifragrance 同句可对照。Jérôme Epinette 只出现在 hofeurope.com 一家零售商页，未写入正文，仅在此备注。判「经典故事」依据是创始人自述的创作缘起，非香调枚举；官方页现版只有说明段落，若仅以官网为据则接近 Afnan 情形，故不判「官方标语」。

### 518. profumum-roma-olibanum（排名 1087）
- 名称：Profumum Roma Olibanum Eau de Parfum（2006）
- 背书类型：经典故事
- 文案：Olibanum 是 Profumum Roma 常规线上的产品，名字取自乳香的另一种叫法，官方页把这个词直接落在教堂的意象上，先是三句短句：“Sacred and profound mystery and shadow.”、“The wax that runs, someone who prays.” 与 “Rumbling footsteps in the secular Gothic arches of the Saint Michel cathedral.”，随后一段把整体形容成悬浮的、浸在灵性与沉默里的气氛，底座是能带来深度与冥想感的一层，收在一种安静的分量上。官方参数表把年份写作 2006，Fragrantica 记 2007，两处不一致。浓度官方与库内都按 Eau de Parfum，另有一家零售商页写 Extrait de Parfum 并称 43%，未获品牌页印证。
- 来源链接：https://www.profumum.com/en/product/olibanum/ ；https://www.fragrantica.com/perfume/Profumum-Roma/Olibanum-4447.html
- 备注：三句引文逐字取自 profumum.com 官方产品页 Highlights 首段。年份冲突已并列：官方表 2006、Fragrantica 2007，名称行采官方 2006。浓度冲突：官方页与库内为 Eau de Parfum，parfumeriedusoleildor.com 写 Extrait de Parfum 与 43%，属单一零售商说法，不采。判「经典故事」因官方页有独立场景叙事（教堂），非纯香调枚举。

### 519. parfums-de-marly-valaya（排名 1095）
- 名称：Parfums de Marly Valaya Eau de Parfum（2023）
- 背书类型：官方标语
- 文案：Valaya 是 Parfums de Marly 2023 年推出的女香，调香师 Quentin Bisch。品牌在发布稿里的说法是 “White sheer fabric and soft light express a femininity that defies trends and eras.”，把主题定在不受潮流与年代限制的女性气质上；官方美国站产品页则写 “Valaya evokes a veil of linen caressing the skin”，落到亚麻贴肤的触感。品牌创作者 Julien Sprecher 在发布稿里补充，难点在于同时做到清透纤细与强烈外放，他把成品形容成一层贴身、像茧一样的气味，规格为 75 ml 的 Eau de Parfum 单一容量。
- 来源链接：https://www.fragrantica.com/news/Parfums-de-Marly-Valaya-17603.html ；https://us.parfums-de-marly.com/products/valaya
- 备注：两句引文分别逐字取自 Fragrantica 新闻稿（2023-01-12，含品牌原句与 Sprecher 引语）与 us.parfums-de-marly.com 产品页正文。年份 2023 由 Fragrantica 条目与新闻稿两处一致；Sprecher 的职衔在官方站页面署名处为 Founder, Creative Director。写作时所用名单的香调字段为空（生成取错键，已修正），文案未据空字段发挥，未列香材，也未引用发布稿里的分子名。

### 520. patou-colony（排名 1096）
- 名称：Jean Patou Colony Eau de Parfum（1938）
- 背书类型：经典故事
- 文案：1938 年 Jean Patou 推出 Colony，调香师是 Henri Alméras。品牌随 1984 年 Ma Collection 迷你套装发行的小册子把它写成一段时代情绪：a scent evocative of sun-ripened fruit, the melting aroma of spices and the blue-black manes of Creole girls，指的是战前的法国想借一瓶香水去更暖的太阳底下。1984 年版由时任品牌调香师 Jean Kerléo 重建。2014 年，Héritage Collection 再把 Colony 复刻一次，改由 Thomas Fontaine 调配，官方渠道今天以 Eau de Parfum 出售，但页面仍把创作年份标为 1938。NST 在复刻评测里把两版并排比较，说复刻版的菠萝比 Ma Collection 版更干、更绿。
- 来源链接：https://nstperfume.com/2015/09/07/jean-patou-colony-ma-collection-heritage-collection-fragrance-review/ ；https://www.tendance-parfums.com/en/colony-eau-de-parfum-collection-heritage-jean-patou.html
- 备注：查了 official fragrance notes、Colony 复刻与 Heritage 线资料。1938 首发、Henri Alméras 调配为 三个来源一致；NST 引 1984 年 Ma Collection 小册子原文（该段英文逐字取自 raw）。2014 Héritage 复刻与 Thomas Fontaine、Eau de Parfum 规格见 tendance-parfums 与 Fragrantica 的 Collection Heritage Colony 页（调香师标为 Thomas Fontaine）。库内年份为 null，此处 1938 指原版首发年，非 EDP 版本上市年，故在文案中点明。

### 521. ariana-grande-r-e-m（排名 1100）
- 名称：Ariana Grande R.E.M. Eau de Parfum（2020）
- 背书类型：官方标语
- 文案：R.E.M. 于 2020 年 8 月 19 日由 LUXE Brands 发新闻稿宣布上市，与 Firmenich 共同开发，官方称它把 Ariana Grande 的香水线推到「宇宙」这一层。品牌页开头是三句祈使：Dream. Envision. Escape.，随后一句 r.e.m. is limitless, empowering and encourages you to dream bigger 把整支香的叙事框定在太空与星际上；文案里出现 supernova、galaxy 这类词，新闻稿同时写明规格为三种容量的 eau de parfum spray。官方页把产品名一律写作小写 r.e.m.，与它自己的 Description 段落写法一致。
- 来源链接：https://www.prnewswire.com/news-releases/grammy-winning-and-multi-platinum-recording-artist-ariana-grande-launches-her-new-fragrance-rem-301114508.html ；https://arianagrandefragrances.com/products/r-e-m
- 备注：新闻稿（PR Newswire，2020-08-19，署名 LUXE Brands）提供发布日、与 Firmenich 合作、eau de parfum spray 三项硬信息；品牌页提供 Dream. Envision. Escape. 与 r.e.m. is limitless, empowering and encourages you to dream bigger 两句原文，均逐字取自 raw。未判「名人同款」：Ariana Grande 是品牌所有者而非代言面孔，新闻稿标题只写她「Launches Her New Fragrance」，不构成第三方名人背书。未写具体香调，因写作时名单香调字段为空（生成取错键，已修正）。

### 522. bvlgari-omnia-coral（排名 1101）
- 名称：Bvlgari Omnia Coral Eau de Toilette（2012）
- 背书类型：官方标语
- 文案：Omnia Coral 于 2012 年推出，调香师 Alberto Morillas，宝格丽官方页面给他的头衔是 Master Perfumer。产品页的首句把整支香挂在红珊瑚的意象上：Inspired by the solar vitality of red coral, Omnia Coral Eau de Toilette brings to life the luminous energy of the vibrant gemstone in a juicy and fruity signature. 同一段里，木槿被解释成只靠整日光照才开的花，因此与「给生命的光」绑在一起；官方把它归入 Floral, Fruity 家族，产地标为意大利，页面目前注明该品不在线上销售。
- 来源链接：https://www.bulgari.com/en-int/fragrances/omnia/42067.html ；https://www.fragrantica.com/perfume/Bvlgari/Omnia-Coral-14297.html
- 备注：官方页提供首句原文、Master Perfumer Alberto Morillas、家族与产地；2012 年上市取自 Fragrantica。未写香调枚举：写作时名单香调字段为空（生成取错键，已修正），官方页的三段金字塔与 Fragrantica 的名单在中调上并不一致（官方把石榴放在 dry down、Fragrantica 放在中调），故一律回避。未采用美区 product/42549 等页面，因其无独立广告语、只是同一段文案的转载。

### 523. jovoy-incident-diplomatique（排名 1104）
- 名称：Jovoy Paris Incident Diplomatique Eau de Parfum（2017）
- 背书类型：官方标语
- 文案：Incident Diplomatique 于 2017 年推出，调香师 Vanina Muracciole。Jovoy Paris 官方页把她的原话单列成一栏 Perfumer's Word：A compelling Java vetiver, combined with Australian sandalwood and oak moss and seasoned with nutmeg and mandarin. A robust, intense, unprecedented woody fragrance. 除这句之外，页面只用强度、季节、性别与昼夜四个标签交代使用场景，没有额外的命名故事或场景叙事，产品定位写作 Woody, Aromatic。官方页另给三条场景标签：全季、中性、昼夜皆可，强度栏标为 Extravagant Trail。Aedes 与 H Parfums 两家零售商把同一句原话原样转载，并署她的名字。
- 来源链接：https://www.jovoyparis.com/en/woody-perfumes/2368-incident-diplomatique.html ；https://www.aedes.com/products/incident-diplomatique-eau-de-parfum-3-4oz
- 备注：判「官方标语」而非按 Afnan 判例下调，理由：页面有一个可署名的独立引语块（Perfumer's Word），不是纯香调枚举加泛化形容词，且该引语在 Aedes 处带调香师署名复现。2017 年与 Vanina Muracciole 见 Aedes 的 ADDITIONAL INFO 与 Luckyscent、Parfumo 三处一致。未写香调：库内为空，且各家名单不完全一致（Parfumo 分列 Haitian vetiver 与 Java vetiver，Luckyscent 另列 Java Vetiver Oil）。

### 524. montale-starry-nights（排名 1106）
- 名称：Montale Starry Nights Eau de Parfum（2015）
- 背书类型：官方标语
- 文案：Starry Nights 于 2015 年推出，调香师是品牌创始人 Pierre Montale。蒙塔莱官方页的说明从一个比喻起头：Like stardust on the skin, Calabrian Bergamot leads to a celestial blend of Bulgarian Rose, Egyptian Jasmine and Sumatra Patchouli. 后半句用 White Musk 与粉感把画面收在 dreamy Eastern night 上。这段文字在 Harrods、希腊与意大利的授权渠道被逐字沿用，措辞一致，是品牌统一投放的产品文案而非渠道自撰；官方页另有一栏 Layering，建议与另一支蒙塔莱叠穿。
- 来源链接：https://www.montaleparfums.com/en/floral/211-starry-nights.html ；https://www.harrods.com/en-us/p/montale-starry-nights-eau-de-parfum-100ml-000000000006461806
- 备注：官方页给首句原文与 Layering 说明，Harrods 侧可交叉验证同一段文案的流传；2015 年与 Pierre Montale 取自 Fragrantica。未写香调：库内为空，且各家不一致（Harrods 与 Fragrantica 把 Apple 列进前调，蒙塔莱官方页无此条；Mazzolari 页面文字明显是机器翻译，不采）。

### 525. floris-vert-fougere（排名 1115）
- 名称：Floris London Vert Fougère Eau de Parfum（年份未标注）
- 背书类型：官方标语
- 文案：Vert Fougère 是 Floris 私藏线（Private Collection）的一支，由意大利调香师 Nicola Pozzani 与品牌调香总监 Edward Bodenham 共同完成，也是 Pozzani 为该线做的第一支作品。品牌的产品描述把香材的两端对立写成了主线：Conveying the delicate line between being understated and individuality, the fragrance envelopes the wearer with its complex and distinctive character, defined by a juxtaposition between dark green notes and smoky, velvety woody accords. 后一句用 A moody fougère 定位它，并称其在苔藓底子上加了 sparkling modernity。Bodenham 对媒体说，他构思的是一处 garden of twilight。Pozzani 自己的说法更绕，他把蕨香调解释成一对反义的结合：Revolutionary in its composition, fougère to me is a marriage made of opposites, crisp, smart freshness versus sensuous, indulgent warmth。这支香是该线里他交出的第一件作品，100 ml 定价 £120。
- 来源链接：https://www.fragrantica.com/news/New-Floris-Vert-Fougere-Eau-de-Parfum-13277.html ；https://cosmeticsbusiness.com/floris-london-extends-unisex-fragrance-line-with-new-vert-foug-re-edp--157725
- 备注：年份留空因来源冲突——Cosmetics Business 发稿日 2019-09-03、Basenotes 与 Parfumo 记 2019，Fragrantica 新闻页（2020-02-12）与 Fragrantica 香水页记 2020，无法判定，故不写年份并在文案回避。浓度写 Eau de Parfum：Fragrantica 新闻明写 The fragrance of Eau de Parfum strength，库内浓度为空但来源明说，故补上。三段引文均逐字取自 raw（Fragrantica 新闻页转载 Floris London 原文，Cosmetics Business 记 Pozzani 与 Bodenham 的分工及 garden of twilight 一语）。未写香调：库内为空。

### 526. juliette-has-a-gun-midnight-oud（排名 1117）
- 名称：Juliette Has a Gun Midnight Oud Eau de Parfum（2009）
- 背书类型：经典故事
- 文案：Midnight Oud 于 2009 年推出，是 Juliette Has a Gun 的第四支香。品牌官方页把它放回品牌史里讲：One of the first fragrance house to use Oud essence in its compositions (2008). 创作自述里，作者说前作 Lady Vengeance 与 Miss Charming 之后，他把第四支香交给「阿拉伯灵魂」，理由是中东的丰盛文化；官方页另给了一段夜宫场景——午夜、有人从宫殿逃出、暗处的影子掏出一件亮物，结果是一只瓶子。官方给它的定位是 Woody, floral, intense，家族写作 Oriental Woody，留香强度栏标 High volume，金字塔只留三层：顶是玫瑰精粹，心是乌木，底是藏红花净油。这一段场景叙事与创作自述同时挂在一个页面上，构成品牌对这支香的完整说法。
- 来源链接：https://www.juliettehasagun.com/en/products/midnight-oud-parfum ；https://www.parfumo.com/Perfumes/Juliette%5FHas%5Fa%5FGun/Midnight%5FOud
- 备注：官方页提供两处可引原文：One of the first fragrance house to use Oud essence in its compositions (2008). 与创作自述（Following Lady Vengeance, and Miss Charming, I decided to dedicate Juliette’s fourth fragrance to the Arabian soul.，弯撇号照抄）。2009 年上市见 Parfumo 与 Fragrantica 一致。未写自述作者姓名：官方页只署「The word of creator」，未点名，故不写。香调仅取官方页金字塔三项（Rose, Oud, Saffron）；Parfumo 与 Fragrantica 的名单更细且互不一致，不采。

### 527. montblanc-explorer-extreme（排名 1119）
- 名称：Montblanc Explorer Extreme Eau de Parfum（2025）
- 背书类型：官方标语
- 文案：Explorer Extreme 是万宝龙 Explorer 主线在 2025 年推出的加强版，官方产品页的开篇句直接把它接在现代男性气质上：Montblanc Explorer Extreme embodies the quintessence of modern masculinity. 紧接着的一句说明这支香怎么被「推过头」：the Explorer signature fragrance is pushed beyond intense in this extreme version, with warm amber and leathery accords. 官方只在页面上给出三段的代表香材——佛手柑、广藿香、琥珀，其余留给渠道文案发挥。零售商一侧的说法更具体，把它称作 a woody, leathery parfum，并把叙事落在「现代远行者」身上。
- 来源链接：https://www.montblanc.com/en-ie/montblanc-explorer-extreme-parfum-60-ml-MB134815VG.html ；https://www.theperfumeshop.com/montblanc/explorer-extreme/parfum-spray/p/71330PRFJU?varSel=1311163
- 备注：三句引文逐字取自 raw（前两句来自 montblanc.com 爱尔兰站产品页，第三句 a woody, leathery parfum 来自 The Perfume Shop 产品描述）。浓度存在冲突：官方产品名写作 Explorer Extreme Parfum，The Perfume Shop 标 EXPLORER EXTREME EDP，库内值为 eau-de-parfum，名称行按库内值写 Eau de Parfum，并在文案中不宣称具体浓度级别。2025 年上市见 The Perfume Shop 的 Launch date 栏与 Fragrantica 一致；调香师 Jordi Fernández 与 Antoine Maisondieu 仅 Fragrantica 一处提及，未写入文案。写作时名单香调字段为空（生成取错键，已修正），故只写官方页明确给出的三项。

### 528. lancome-tresor-midnight-rose（排名 1125）
- 名称：Lancôme Trésor Midnight Rose Eau de Parfum（2011）
- 背书类型：名人同款
- 文案：Trésor Midnight Rose 于 2011 年 9 月上市，是 1990 年 Trésor 的衍生版本，调香师 Anne Flipo。它的广告面孔是演员 Emma Watson——行业媒体在上市前的报道里写明 The face of the fragrance will be actress Emma Watson，这是品牌方公布的代言安排，不是媒体猜测。Flipo 对这支香的说明是：It embodies mischievous femininity: rose becomes playful, driven by deliciously tangy raspberry tones and voluptuous vanilla notes，也就是把原版那朵玫瑰往覆盆子与香草的方向推。瓶身沿用 Trésor 的多切面造型并拉长，颜色从粉过渡到紫。
- 来源链接：https://moodiedavittreport.com/lancome-cultivates-fragrance-pillar-with-tresor-midnight-rose/ ；https://nstperfume.com/2011/05/11/lancome-tresor-midnight-rose-new-fragrance/
- 备注：判「名人同款」依据 Moodie Davitt Report（2011-07-08）与 Now Smell This（2011-05-11）两处独立报道均指 Emma Watson 为该香代言面孔，属品牌公布的代言面孔，非模特拍商业广告、非论坛 dupe 说法。年份 2011、调香师 Anne Flipo 见 NST 更新段与 Parfumo、perfumediary 一致。瓶身描述取自 Moodie Davitt 报道原文段落。未写香调：库内为空，且 Lancôme 各地区站点给出的金字塔互相矛盾（美国站与加拿大站前中调排序不同），故回避。

### 529. nishane-sultan-vetiver（排名 1126）
- 名称：Nishane Sultan Vetiver Extrait de Parfum（2013）
- 背书类型：官方标语
- 文案：Sultan Vetiver 是 Nishane 早期作品，官方页把它归入 AROMATIC / WOODY / AMBERY，浓度标 Extrait de Parfum，50 ml 装。开篇一句讲配方：Opens on a neroli note intensified by Javanese, Haitian and Bourbon vetiver at the same pot! 紧接着是命名来由——把苏丹与国王比作长年以来的征服者，于是这支香被称作该类别里的破局者，原句为 Sultan Vetiver is the new rule breaker in its genre. 官方还给了它一句面向使用者的评语：This is a heavenly perfume for the vetiver lovers. 三句都挂在同一个产品页上，属于品牌自述而非渠道改写。
- 来源链接：https://nishane.com/product/sultan-vetiver/ ；https://www.fragrantica.com/perfume/Nishane/Sultan-Vetiver-30574.html
- 备注：判「官方标语」而非按 Afnan 判例下调，理由写在明处：该页除香调枚举之外，有独立的命名解释（苏丹/国王作为征服者的类比）与一句面向受众的定位语，不属于「只有枚举加泛化形容词」的情形，故不下调。2013 年上市见 Fragrantica；Parfumo 记 2014，存在一年差，文案只采用 Fragrantica 一处并在名称行标 2013。调香师 Jorge Lee 仅 Fragrantica 一处提及，未写入文案以防单一来源。未写香调：库内为空。

### 530. robert-piguet-futur（排名 1128）
- 名称：Robert Piguet Futur Extrait de Parfum（2009）
- 背书类型：经典故事
- 文案：Futur 原版出自 1960 年代，2009 年由 Robert Piguet 重新推出，配方交给 Givaudan 的调香师 Aurélien Guichard 调整。品牌页对这一版的说明是：Originally created in the 1960's Piguet's classic Futur was re-imagined and formulated to suggest the original romantic floral but with a modern twist. 在当年的访谈里，Guichard 说原版与新版的差别很小——The original Futur, smelled almost the same as this one. Only a very few ingredients have been replaced by more contemporary ones.，并把它描述成先青绿（突尼斯橙花油、紫罗兰叶净油、白松香）后转为茉莉与依兰的花心，最后落在弗吉尼亚雪松与海地香根草的木质尾调上。
- 来源链接：https://www.robertpiguetparfums.com/products/futur-eau-de-parfum ；http://www.sniffapaloozamagazine.com/FUTUROCT102009.html
- 备注：三处引文逐字取自 raw（品牌页两句、Sniffapalooza 杂志 2009 年 10 月访谈一句）。浓度存在冲突：库内为 extrait，名称行按库内写 Extrait de Parfum；但品牌页在售品名为 Futur Eau de Parfum，scento 数据库标 Extrait de parfum，Sniffapalooza 访谈里还提到 Futur EDP 与 futur parfum 两种浓度并存，故文案不宣称浓度、只写配方与 1960 年代原版的关系。2009 年复刻见 Fragrantica 与 fragrancevault 一致；Guichard 供职 Givaudan 见 Sniffapalooza 原文。

### 531. roja-parfums-apex（排名 1129）
- 名称：Roja Parfums Apex Pour Homme Parfum（年份未标注）
- 背书类型：经典故事
- 文案：Apex 是 Roja Dove 在 2022 年前后推出的男香，创作起点由他本人在发布会上讲明：人用气味捕食、避险、求偶，这套本能是这支香的由来，原话是 “it is these primal instincts that inspired me to create Apex.”。品牌对它的定性是清新果香西普，官方文案写它献给自然界的奇观与漫游其上的人。名称取顶点之意，与成为更好的自己那套说法绑在一起；同一款香另有 Eau de Parfum 与 Parfum 两种浓度并行销售。Roja Dove 1981 年入娇兰，2011 年自立门户，这条履历在多家外媒的发布会报道里一致。
- 来源链接：https://retailbeauty.com.au/roja-parfums-launches-primal-instinct-inspired-fragrance-apex/ ；https://rojalondon.com/products/apex-pour-homme
- 备注：年份来源冲突：Fragrantica 记 2022 年推出（https://www.fragrantica.com/perfume/Roja-Dove/Apex-72723.html），Planar Parfums 商品页记 Released 2021，Neiman Marcus 商品页发布时间记 2021 年 1 月，故名称行不写年份、文案只写 2022 年前后。引文逐字取自 retailbeauty.com.au 对 2022 年 7 月澳洲发布会报道中 Roja Dove 的发言。品牌页 rojalondon.com 同时列 100ml EDP 与 50ml Parfum，与库内 parfum 一致。

### 532. ysl-cinema（排名 1130）
- 名称：Yves Saint Laurent Cinéma Eau de Parfum（2004）
- 背书类型：官方标语
- 文案：Cinéma 于 2004 年上市，YSL 官方页面给它的定位句是 “Glamorous, seductive, startling.”，紧接一句 “a floral sophisticated and original enough for a starring role.”，灵感写成好莱坞式的华丽。名字、瓶身与广告都围绕电影明星这个意象做：上市广告由 Jean-Baptiste Mondino 拍摄，出镜的是巴西模特 Michelle Alves，穿晚装、身边围五个穿黑领结的男人。当年负责旅游零售的高管把它称作公司生命里的关键时刻，全球上市日定在 2004 年 10 月 1 日。香由 Jacques Cavallier Belletrud 调出。
- 来源链接：https://www.yslbeauty.com.au/fragrance/womens-perfume/cinema-eau-de-parfum/401YSL.html ；https://moodiedavittreport.com/yves-saint-laurent-hopes-for-starring-role-as-cinema-gets-set-for-autumn-premiere-270804/
- 备注：两条引文逐字取自 yslbeauty.com.au 产品页。年份 2004 见 Fragrantica 与 osmoz，广告与 10 月 1 日上市见 Moodie Davitt Report 2004 年 8 月稿。调香师 Fragrantica 记 Jacques Cavallier Belletrud、basenotes 记 Jacques Cavallier-Belletrud，拼写并存。Michelle Alves 属商业广告出镜模特，按规范不计入名人同款。

### 533. memo-paris-cap-camarat（排名 1137）
- 名称：Memo Paris Cap Camarat Eau de Parfum（2026）
- 背书类型：官方标语
- 文案：Cap Camarat 是 Memo Paris 自 2026 年 3 月 16 日起铺货的新香，归入 Fleurs Bohèmes 花系列，也是这家巴黎香水屋第一次拿普罗旺斯的海岸地点做题。官方文案的原句是 “Cap Camarat inspires a fragrance like a smile in the sun.”，后面接着写灯塔守着海面、松林与浪声，说整支香想留住阳光落在皮肤上的感觉。同批还请意大利插画师 Olimpia Zagnoli 做视觉，出了联名瓶、托特包与旅行香水盒，常规版与联名版同为 Eau de Parfum 浓度。
- 来源链接：https://www.memoparis.com/products/cap-camarat-eau-de-parfum-75ml ；https://www.fragrantica.com/news/Memo-Paris-Launch-Cap-Camarat-24591.html
- 备注：引文逐字取自 memoparis.com 官方产品页，英、法、美三站同段文案。上市时间、系列归属与 Olimpia Zagnoli 联名见 Fragrantica 新闻 2026 年 3 月稿。调香师一职只有零售站 redolia 与聚合站 myolfy 提到 Nadège Le Garlantezec，缺权威出处，未写入文案。

### 534. narciso-rodriguez-cristal（排名 1139）
- 名称：Narciso Rodriguez Cristal Eau de Parfum（2022）
- 背书类型：经典故事
- 文案：Cristal 于 2022 年 5 月 1 日上市，是 NARCISO 线的衍生，官方把它写成对内在光的一次处理：水晶切面如何散光，香气就如何做明暗对照。调香师 Natalie Gracia-Cetto 的说法是 “I wanted this perfume to honor femininity by illuminating the floral, the freshness, and the musky, woody sensuality with a soft and radiant light”。用料上有两条可查的交代：佛手柑取自意大利的伦理采购，玫瑰用蒸馏水回收的上循环工艺提取，品牌称全配方逾 85% 成分来自天然来源。新闻稿注明来源为资生堂。
- 来源链接：https://www.fragrantica.com/news/Narciso-Rodriguez-Narciso-Eau-de-Parfum-Cristal-16456.html ；https://www.narcisorodriguezparfums.com/en/narciso-rodriguez-narciso/Narciso-Cristal.html
- 备注：调香师、上循环玫瑰与意大利佛手柑出自 Fragrantica 新闻稿（该稿注明来源 Shiseido press release），引文即该稿转引的 Gracia-Cetto 原话。天然来源逾 85%、瓶身与光的说法取自品牌官网页。官网页把名称写作 NARCISO eau de parfum cristal，库内香名记为 Cristal，未改。

### 535. ajmal-dahn-al-oudh-moattaq（排名 1145）
- 名称：Ajmal Dahn Al Oudh Moattaq（年份未标注）
- 背书类型：无可靠来源
- 文案：
- 来源链接：
- 备注：查了品牌官网两处商品页（sa.ajmal.com、en-ae.ajmal.com）与 Fragrantica 条目。官网对这支香通篇只有香调枚举（前、中、后三调一律写 Oud）加泛化形容，如 a fragrance for kings、one of the most exclusive perfumes in the world、epitomizes the legend of Oudh，另有熟成 20 年、印度阿萨姆沉香的物料说法；没有独立广告语、没有创作缘起、没有命名故事、没有上市年份与调香师。按 Afnan 判例判为无可靠来源。另记两处冲突：官网另一页 Mukhallat Dahn Al Oudh Moattaq 给出玫瑰、茉莉、檀香、藏红花前调，属另一支香；Fragrantica 评论区亦直指该条目所列香调属于 Mukhallat 而非本支纯沉香。故文案与来源链接留空。

### 536. lattafa-eclaire（排名 1150）
- 名称：Lattafa Eclaire Eau de Parfum（2024）
- 背书类型：官方标语
- 文案：Eclaire 于 2024 年上市，官方描述把它写成一段被焦糖、蜂蜜与花香缠住的白日梦，原句是 “This fragrance is a luminous gourmand named after the French masterpiece of a dessert.”。命名上品牌给了两处交代：一处说取自那道法式甜点，另一处说 éclair 兼指闪电与欢愉，取的是短暂、亮一下就没的那层意思。定位写成给想被安慰的人用的甜香，落点是夜晚与私下的场合。100ml 装，印度、美国、摩洛哥三地分站的英文文案基本一致。
- 来源链接：https://www.lattafaindia.com/products/eclaire ；https://www.fragrantica.com/perfume/Lattafa-Perfumes/Eclaire-93628.html
- 备注：引文与命名解释逐字取自 lattafaindia.com 商品页（美国、摩洛哥分站同段英文）。2024 年上市见 Fragrantica 条目；浓度库内为空，按 lattafa-usa 商品名 100ML Edp Spray 与摩洛哥站说明补 Eau de Parfum。

### 537. marc-jacobs-daisy-ever-so-fresh（排名 1152）
- 名称：Marc Jacobs Daisy Ever So Fresh Eau de Parfum（2022）
- 背书类型：官方标语
- 文案：Daisy Ever So Fresh 于 2022 年 8 月上市，官方描述原句是 “Sparkling. Vibrant. Energising.”，接着写它 “a bouquet of juicy citrus notes that capture the whimsical feeling of dappled sunshine”，并称它是 Daisy 线里最持久的一支。广告由 Alasdair McLellan 全片用胶片拍摄，场地在圣巴巴拉一处农场，出镜的是模特 Kaia Gerber、Jelixa Reyes 与 Bomi，画面是正午草地、遍地雏菊与橙色蝴蝶。日本市场另做限量发售，8 月 31 日上架，买 75ml 送 4ml 迷你。瓶身沿用 Eau So Fresh 的形，做高做瘦，金色盖上绕六朵橙色雏菊。
- 来源链接：https://www.johnlewis.com/marc-jacobs-daisy-ever-so-fresh-eau-de-parfum/p6300867 ；https://www.vanityfair.com/style/2022/08/kaia-gerber-interview-marc-jacobs-daisy-summer-guide
- 备注：两条引文逐字取自 johnlewis 商品页的产品描述。农场取景、全片胶片与 McLellan 见 Vanity Fair 2022 年 8 月稿；正午草地、蝴蝶与另两位出镜者见日本 PR Times 新闻稿（https://prtimes.jp/main/html/rd/p/000000467.000003907.html），该稿称 Kaia Gerber 为 campaign muse。她属广告出镜模特，按规范不计入名人同款，故判官方标语。

### 538. tauer-perfumes-orange-star（排名 1155）
- 名称：Tauer Perfumes Orange Star Eau de Parfum（2010）
- 背书类型：经典故事
- 文案：Orange Star 是 Andy Tauer 的第九支香水，2010 年 5 月由 WWD 报道上市，报道原句是 “Orange Star, Tauer’s ninth fragrance, differs from his previous fragrances because it’s fresher and relies more on citrus”，定位上是把他此前偏厚重的路线往清新一侧推一步。品牌页写它 “Made by hand in Switzerland”，50ml 装，官方自述的骨架是柑橘的亮、干净的橙花心，以及零陵香豆、香草与龙涎香垫出的软尾。官方页把甜度标为低到中等，存在感标为中等。
- 来源链接：https://wwd.com/beauty-industry-news/beauty-features/beauty-radar-screen-may-13-2010-3071178/ ；https://tauerperfumes.com/products/orange-star
- 备注：年份与第九支之说见 WWD 2010 年 5 月 13 日稿；Fragrantica 记 launched in 2010、调香师 Andy Tauer。品牌页仅作产品自述引用。WWD 所列中调含 violet 与 lily of the valley，与品牌页现列的中调（柠檬草、橙花）不一致，故文案不铺排具体香调。

### 539. viktor-rolf-eau-de-toilette-spicebomb-fresh（排名 1157）
- 名称：Viktor&Rolf Spicebomb Fresh Eau de Toilette（年份未标注）
- 背书类型：官方标语
- 文案：Spicebomb Fresh 是 Spicebomb 的清爽版，官方页如今把它归入 discontinued，原句是 “Spicebomb Fresh captures a lighter, fresher, more vibrant iteration of the classic eau.”，下一句写它 “cools down like a splash of water before exploding into seductive spice”。品牌把原版 Spicebomb 的年份写作 2012，手雷形瓶身出自 Fabien Baron 之手，专为夏季版整瓶做成冰封色。2015 年纽约时报的男香专题里，Viktor Horsting 说瓶子概念来得很快，做的是把它调成一件精致的诱惑武器。上市年份各家记载不一，名称行留空。
- 来源链接：https://us.viktor-rolf.com/discontinued-fragrances/spicebomb-fresh-VKR_035.html ；https://www.nytimes.com/2015/04/03/fashion/mens-style/the-new-mens-fragrances-aggressively-packaged.html?smid=tw-share
- 备注：两条引文逐字取自 us.viktor-rolf.com 该产品页。年份冲突：edtedp 记 Year Released 2014，nzfragrance 记 Release Date 2017，官方页未写年份，Fragrantica 把同款记作 Spicebomb Eau Fraiche 2014，故名称行不写年份。香调亦冲突（官方 key notes 与 notino 列出的前中后调不同），文案不列香调。Fabien Baron 设计瓶身见 perfumemaster 2014 年报道。

### 540. diptyque-volutes（排名 1161）
- 名称：Diptyque Volutes Eau de Parfum（2012）
- 背书类型：经典故事
- 文案：Volutes 的来处是创始人之一 Yves Coueslant 的童年记忆，官方页写：“1930: an ocean liner bound for Saigon.”，接着是穿晚装的女人靠在舷梯边、手里夹着烟嘴，休息厅里乐队继续演奏。品牌说这支香唤起的就是那段记忆，原句把气味点成 “Mild tobacco, the powdery scent of make-up”。记忆里的烟来自三十年代埃及的 Khedive 牌，官网页特意交代它是甜而带果香的烟草。香由 Fabrice Pellegrin 调出，2012 年以 Eau de Parfum 上市。
- 来源链接：https://diptyqueparis.com/en-eu/products/eau-de-parfum-volutes-volutep75cv1 ；https://www.fragrantica.com/perfume/Diptyque/Volutes-Eau-de-Parfum-49101.html
- 备注：两条引文逐字取自 diptyqueparis.com 官网页。年份 2012 与调香师 Fabrice Pellegrin 见 Fragrantica 与 Parfumo。官网页另有 “one belonging to Yves Coueslant, one of the founders of the Maison” 一句，创始人之说由此成立。

### 541. issey-miyake-leau-dissey-pure（排名 1165）
- 名称：Issey Miyake L'Eau d'Issey Pure Eau de Toilette（2017）
- 背书类型：官方标语
- 文案：三宅一生官方站点 MIYAKE DESIGN STUDIO 对这支香的说明是「L’EAU D’ISSEY PURE is a fragrance inspired by a drop of water, precious and unique.」，把它定义成一滴珍贵而独一无二的水。同一页写明香水出自调香师 Dominique Ropion，瓶身由 Todd Bracher 设计，2016 年首发；2017 年 4 月改以 Eau de Toilette 浓度重发，容量 50 与 90 毫升，配方构成与 Eau de Parfum 版相同，只是香精用量更低，气味更轻更软。品牌还说明瓶形沿用 1992 年原版的细长锥体，瓶顶晶体像一滴水顺着瓶身滑落。
- 来源链接：https://mds.isseymiyake.com/mds/en/product/ ；https://www.fragrantica.com/news/Issey-Miyake-L-Eau-d-Issey-Pure-Eau-de-Toilette-8699.html
- 备注：均来自本组 raw-g.txt。「L’EAU D’ISSEY PURE is a fragrance inspired by a drop of water, precious and unique.」「Fragrance by perfumer Dominique Ropion」「Bottle designed by Todd Bracher」出自 mds.isseymiyake.com/mds/en/product/ 的 Highlights（弯撇号照抄）。2017 年改版与 50/90 毫升出自 Fragrantica 新闻页：原文「In 2017, L'Eau d'Issey Pure will be reintroduced in a new concentration: L'Eau d'Issey Pure Eau de Toilette.」「available from April 2017 in 50 and 90 ml bottles」。库内年份为 null，名称行的 2017 即指 EDT 版发行年，非首版年份；首版 EDP 为 2016 年（MDS 官方页与 Fragrantica 商品页一致）。浓度以库内 eau-de-toilette 为准。assign 未给香调，故文案不写香调。

### 542. afnan-rare-carbon（排名 1169）
- 名称：Afnan Rare Carbon（年份未标注）
- 背书类型：无可靠来源
- 文案：
- 来源链接：
- 备注：查到三类可用来源，均不构成硬背书。① 品牌自有页 afnan.com/products/rare-carbon：正文为「Rare Carbon Pour Homme epitomizes sophistication and strength.」，其后整段只有香调枚举（皮革、紫罗兰叶、肉桂、肉豆蔻／玫瑰、紫罗兰、雪松、沉香／香根草、檀香、琥珀）加泛化形容词，没有独立广告语、没有创作缘起、没有命名故事、没有场景叙事；按 SPEC 的 Afnan 判例（该判例原形正是 Afnan 品牌页），不可判「官方标语」，下调为无可靠来源。② Fragrantica 商品页仅记「Rare Carbon was launched in 2020.」与香调，无叙事。③ Amazon、BoohooMAN 属零售商，文案与品牌页逐字相同，无新增信息。香调按名单留空（写作时该字段因取键错误为空，已修正），文案与来源链接按规范留空，不编造。

### 543. etro-vicolo-fiori（排名 1171）
- 名称：Etro Vicolo Fiori Eau de Toilette（1996）
- 背书类型：经典故事
- 文案：Etro 官方把 Vicolo Fiori 描述为「A tender tribute to the first Etro store in Milan's old Brera District.」，即献给米兰老布拉雷区第一家 Etro 门店的致意；Fragrantica 则把香名解作「Flower Street」，说这支香是离开城市、让感官松下来的一个出口。品牌资料记录它 1996 年推出，官方页称气味是一场「a charming, quirky encounter between florals and the essence of the city」，把花香与城市气息并置。瓶身为透明玻璃，银色瓶盖与瓶底压着品牌标志性的佩斯利纹，100 毫升装另配同花纹的钟形盒。
- 来源链接：https://www.etro.com/us-en/vicolo-fiori-UGAA0010A5001T9994.html ；https://www.fragrantica.com/perfume/Etro/Vicolo-Fiori-3153.html
- 备注：引文逐字取自 raw-g.txt：etro.com 产品页「A tender tribute to the first Etro store in Milan's old Brera District.」「a charming, quirky encounter between florals and the essence of the city」；Fragrantica 页「Vicolo Fiori represents a break from the city and relaxation for the senses in the “Flower Street”.」「Vicolo Fiori was launched in 1996.」。库内年份为 null，1996 出自 Fragrantica 商品页（单一句陈述，未在品牌页交叉到），故属单一来源。浓度冲突：etro.com 现售页标题与 Product Details 标「Eau de Parfum」，notino 与 lovenmour 列 Eau de Toilette，库内为 eau-de-toilette，名称行从库内。官方页未标 100 毫升以外规格。香调按 assign 留空，文案不列香调。

### 544. jo-malone-basil-and-neroli（排名 1174）
- 名称：Jo Malone London Basil & Neroli（2016）
- 背书类型：官方标语
- 文案：Jo Malone London 官网的 Basil & Neroli 产品文案是「Flirtatious neroli with a delicious wink of basil, quintessentially British and always playful.」，英国站写作「Flirt with oh-so floral neroli and a delicious wink of basil.」。品牌新闻稿给这支香的小标题是「A London lark」，整支香被写成伦敦人那种轻快、带玩心的姿态，附在后面的还有一句「Fresh, fun, full of adventure.」，另一处零售页转录的开头是「London at its most fashionably young and fun.」，把伦敦写成它最时髦年轻的一面。新闻稿注明 2016 年 9 月起发售，署名的调香师是 Master Perfumer Anne Flipo，她的原话是「A fresh, sophisticated, sensual floral with green facets—stunning in its simplicity.」，强调这支香靠简单取胜。同香型另有固体香膏版本在售。
- 来源链接：https://www.jomalone.com/product/25946/43297/colognes/basil-neroli-cologne ；https://jo-malone.prezly.com/jo-malone-london-london-lark--basil--neroli ；https://www.jomalone.com.au/product/25946/43297/colognes/basil-neroli-cologne
- 备注：引文逐字取自 raw-g.txt：jomalone.com 页「Flirtatious neroli with a delicious wink of basil, quintessentially British and always playful.」；jomalone.com.au 与 jomalone.eu 页「Flirt with oh-so floral neroli and a delicious wink of basil.」「Quintessentially British, always playful.」；prezly 官方新闻稿页「The Basil & Neroli Collection」「Available from September 2016」（原文分两行，此处拆成两段引文，不合并成一句）「A London lark」「Master Perfumer Anne Flipo」「A fresh, sophisticated, sensual floral with green facets—stunning in its simplicity.」（破折号为原文 em dash，照抄）。库内年份为 null，名称行的 2016 取自新闻稿的 September 2016 发售时间。浓度：库内为 null，官方从产品页到新闻稿一律称 Cologne，未出现 Eau de Toilette／Eau de Parfum 字样，按规范浓度位置留空。香调按 assign 留空，文案不列香调。

### 545. orto-parisi-seminalis（排名 1176）
- 名称：Orto Parisi Seminalis Parfum（2016）
- 背书类型：官方标语
- 文案：Orto Parisi 官方页对 Seminalis 的说明是「Seminalis is our first stimulus in a fragrance bottle. An aromatic aldehyde which helps sperm to locate the ovum, biological proof of olfactive attraction. Life initiated by smell.」，把气味直接写成生命的起点。官方细节写明瓶盖用滚磨银金属与半透明胶木制成，象征新生命发生时释放的体液；外盒展开是一座城，中心留着一个无限深的洞。页面标注「Released in 2016」，规格为 50 毫升 Parfum。品牌不公布完整香调表，巴黎 Nose 与纽约零售商 Emanuel 都把作品归到调香师 Alessandro Gualtieri 名下。
- 来源链接：https://ortoparisi.com/products/seminalis ；https://emanuelnewyork.com/products/seminalis
- 备注：引文逐字取自 raw-g.txt：ortoparisi.com 页「Seminalis is our first stimulus in a fragrance bottle. An aromatic aldehyde which helps sperm to locate the ovum, biological proof of olfactive attraction. Life initiated by smell.」「The Seminalis cap is made of tumbled silver metal with semitransparent bakelite, symbolizing the body fluids that are released when new life happens.」「All Orto Parisi fragrances are hidden in a box that opens up into a metropolis and reveals an infinite hole at the center.」「Released in 2016」。判断依据：该页除香调外还有独立的产品概念叙事（首因、bourgeonal 与嗅觉吸引），不属 Afnan 判例的纯枚举页，故可判官方标语。「Orto Parisi does not publish official note pyramids」出自 bloomperfume 页。调香师名出自 emanuelnewyork「Master perfumer Alessandro Gualtieri」（品牌自有页未署名，属零售商佐证）。库内年份为 null，2016 取官方页 Released in 2016。浓度取库内 parfum，官方标 Parfum。香调按 assign 留空，文案不列香调。

### 546. rabanne-million-gold-for-her（排名 1177）
- 名称：Rabanne Million Gold For Her Eau de Parfum（2024）
- 背书类型：官方标语
- 文案：Rabanne 给这支香的宣传语是「It should cost a billion to look this good」，落到产品说明里成了一句「It should cost a billion to look this good with Million Gold for HER Eau de Parfum.」。它被定位成品牌首支「grand floral」女香，2024 年上市，与同名男香 Million Gold 同期发布。文案把气味写作一条三段推进的线：先是玫瑰，中段是白花束，收尾是矿物麝香；香调表由 Pear、Rose、Lavender 起头，中段 Ylang Ylang 与 Jasmine，底部 Vanilla、Musk、Moss。瓶身沿用 1 Million 家族的 XL 链环造型，做成多切面金色。
- 来源链接：https://www.sephora.com/product/1-million-for-her-eau-de-parfum-P514732 ；https://www.fragrantica.com/perfume/Rabanne/Million-Gold-For-Her-95640.html ；https://www.theperfumeshop.com/rabanne/million-gold-for-her/eau-de-parfum-spray/p/20790EDPJU?varSel=1300243 ；https://www.pamper.my/news/beauty/body/rabanne-launches-million-gold-and-million-gold-for-her/
- 备注：引文逐字取自 raw-g.txt：Sephora 产品页「It should cost a billion to look this good with Million Gold for HER Eau de Parfum.」；The Perfume Shop 页「The first grand floral fragrance, Million Gold for Her perfume.」「Launch date」「2024」；Fragrantica「Million Gold For Her was launched in 2024.」及香调金字塔。⚠ 口径说明：该广告语只见于 Sephora 的零售页文案转载，本组未检索到 rabanne.com 官方原文页，故属「零售商转录的品牌文案」，非品牌官网直证。库内年份为 null，2024 由 Fragrantica 与 The Perfume Shop 两处一致支持。调香师（Suzy Le Helley、Alienor Massenet、Loc Dong、Nathalie Benareau）出自 Fragrantica，未写入文案以免单一来源。品牌 2023 年起由 Paco Rabanne 更名 Rabanne，本条不展开。

### 547. the-different-company-sel-de-vetiver（排名 1178）
- 名称：The Different Company Sel de Vétiver Eau de Parfum（2006）
- 背书类型：经典故事
- 文案：品牌官网把这支香写成第一人称的自述：「I am a fleeting image, glimpsed on a day of all-too-rare rain, somewhere in Africa, lulled by the sound of voodoo incantations and the mystery of dancers who let themselves go until exhaustion…」缘起是一块被调香师在指间捻开的香根草，散出干而苦的气味；页面接着说它有时是燃烧的，也让人想起落雨的气味、彩色 madras 布料留下的麝香尾调，以及香料。它自述是一种既咸又甜、既感性又清新的和声，像在海里游过之后的皮肤，一种「wet-dry」的矛盾触感。官方标注为「A Woody-Aromatic Eau de Parfum by Céline Ellena, 2006」，是品牌第六支香水，也是 Céline Ellena 为该品牌做的第二支。
- 来源链接：https://www.thedifferentcompany.com/en/products/sel-de-vetiver ；https://nstperfume.com/2006/03/31/the-different-company-sel-de-vetiver-estee-lauder-pure-white-linen-john-varvatos-vintage-other-new-fragrances/
- 备注：引文逐字取自 raw-g.txt：官方页「A Woody-Aromatic Eau de Parfum by Céline Ellena, 2006」「I am a fleeting image, glimpsed on a day of all-too-rare rain, somewhere in Africa, lulled by the sound of voodoo incantations and the mystery of dancers who let themselves go until exhaustion…」（省略号为原文，含全角 …）；NST 2006-03-31 帖「The Different Company has launched its sixth perfume, Sel de Vetiver.」「It is the second entry in the line from perfumer Celine Ellena」。年份 2006 三方一致（官方页、NST 发帖时间、Fragrantica「Sel de Vetiver was launched in 2006.」）。判断依据：官方页有完整创作缘起与第一人称叙事，不属 Afnan 判例的纯枚举页，故判经典故事而非官方标语。香调按 assign 留空，文案不列香调（官方页所列香调仅用于核对，未写入）。

### 548. van-cleef-arpels-collection-extraordinaire-santal-blanc（排名 1179）
- 名称：Van Cleef & Arpels Collection Extraordinaire Santal Blanc Eau de Parfum（年份未标注）
- 背书类型：官方标语
- 文案：梵克雅宝官网给 Santal Blanc 的定位句是「An impression of pure white: this is the premise for Santal Blanc, which exalts the creamiest facets of sandalwood by combining them with milky fig and smooth musk.」——以「纯白」为整支香的出发点，把檀香最乳脂的一面托起来，再配牛奶感的无花果与柔滑麝香。官方香调列为前调 Mandarin、Fig milk，中调 Violet、Sandalwood，后调 Musks、Tonka bean。法国 Sephora 页面补上这条产品线的立意：Collection Extraordinaire 以「白」为主题，价值落在克制与嗅觉上的精纯，瓶身因此做成通体无瑕的白。该页还引了调香师 Michel Almairac 的自述，说他想要复现一种柔滑、可抚的木油触感。
- 来源链接：https://www.vancleefarpels.com/en/collections/fragrances/collection-extraordinaire/vcarp6b100---santal-blanc.html ；https://www.sephora.fr/p/collection-extraordinaire-santal-blanc---eau-de-parfum-P10043010.html
- 备注：引文逐字取自 raw-g.txt：vancleefarpels.com 产品页「An impression of pure white: this is the premise for Santal Blanc, which exalts the creamiest facets of sandalwood by combining them with milky fig and smooth musk.」「Top notes: Mandarin, Fig milk Heart notes: Violet, Sandalwood Base notes: Musks, Tonka bean」。判断依据：官方页有一句独立的产品立意句（非纯香调枚举），故判官方标语而非按 Afnan 判例下调；此为边界条目，理由记录在此。年份：库内 null，官网产品页与 Neiman Marcus 页均未标年份，仅 Fragrantica 记「Santal Blanc was launched in 2019.」，属单一来源，故写年份未标注，不在文案断言。调香师 Michel Almairac 见 Fragrantica 与 Sephora FR 署名，未写入文案。香调仅照官方页转述，未自加。

### 549. al-haramain-oudh-36（排名 1180）
- 名称：Al Haramain Oudh 36 Eau de Parfum（年份未标注）
- 背书类型：官方标语
- 文案：Al Haramain 官方店铺对 Oudh 36 的说明是一段带叙事的产品文案：「Here is the king; whose kingship is immortal surpassing the time. The king of wood – Oudh, meets its mysterious queen Rose in the most mesmerizing way.」——把沉香称作木中之王，玫瑰是它神秘的皇后，两者在一次「最迷人的方式」里相遇，文案接着说这是两个世界的调配：一边奢华刚硬，一边柔软感性。官方店铺页列 75 毫升喷雾装，页面另列香调：前调豆蔻、天竺葵、雪松，中调玫瑰、藏红花、沉香，后调劳丹脂、檀香、麝香。
- 来源链接：https://shop.alharamainperfumes.com/bangladesh/product/oudh-36-al-haramain-perfumes ；https://www.fragrantica.com/perfume/Al-Haramain-Perfumes/Oudh-36-53256.html
- 备注：引文逐字取自 raw-g.txt：官方店铺页「Here is the king; whose kingship is immortal surpassing the time.」「The king of wood – Oudh, meets its mysterious queen Rose in the most mesmerizing way.」「A noble blend of two different worlds – one with luxurious tough and other with sensuous soft」（原文破折号照抄）。边界判断：该页确有独立于香调之外的叙事文案（王／后的拟人框架），故不按 Afnan 判例下调，判官方标语；但文案整体仍偏泛化修辞，属边界条目，理由记录在此。年份：库内 null；Parfumo 明写「The release year is unknown.」，官方店铺页与 Fragrantica 均无年份，故写年份未标注。浓度：库内 eau-de-parfum，官方店铺页仅写「Spray 75 ML」未标浓度，名称行从库内。⚠ 香调冲突：官方店铺页列豆蔻／天竺葵／雪松与藏红花、沉香，Fragrantica 列劳丹脂／依兰／天竺葵与广藿香、安息香；文案只转述官方店铺页那套，冲突在此并列。写作时所用名单的香调字段为空（生成取错键，已修正），文案香调未自加。

### 550. caron-fleur-de-rocaille（排名 1181）
- 名称：Caron Fleur de Rocaille Eau de Parfum（年份未标注）
- 背书类型：经典故事
- 文案：Caron 官网把 Fleur de Rocaille 归入「The Romantics Floral」，开篇是一段人格化的描述：「Fleur de Rocaille is the airy imprint of an independent soul.」——写一个不愿被过滤地活着的灵魂，外表像丁香花瓣一样纤弱，内里却向更辽阔的地界走；她敏感、克制、温和，也明亮到让每个角落都听见。这支香是 1934 年经典 Fleurs de Rocaille 的当代版本，香名本身即是一组对照：花的柔软（Fleur）与岩的坚硬（Rocaille）。官方香调列前调 Gardenia、Orange blossom，中调 Rose、Lily of the valley，后调 Cedar、Sandalwood；官网另按栀子与丁香两条线索拆解原料。
- 来源链接：https://www.parfumscaron.com/en/products/fleur-de-rocaille ；https://theperfumehouse.com/products/fleur-de-rocaille
- 备注：引文逐字取自 raw-g.txt：parfumscaron.com 页「The Romantics Floral」「Fleur de Rocaille is the airy imprint of an independent soul.」「Top notes: Gardenia, Orange blossom」「Heart notes: Rose, Lily of the valley」「Base notes: Cedar, Sandalwood」；theperfumehouse 页「A contemporary version of the timeless classic Fleurs de Rocaille (1934), which reflects youth, vivacity and spontaneity, Fleur de Rocaille contrasts between the soft fresh delicacy of a flower (Fleur) and the hard strength of rocks (Rocaille).」「Perfumer(s): André Girodroux & Elke Doerrier」。判断依据：官方页有完整人格化叙事与主题说明，判经典故事。⚠ 1934 属前身 Fleurs de Rocaille 的年份，不是本条这支的年份；本条年份库内 null，官方页未标，故写年份未标注（网上另有 1993 说法，本组未检索到可引来源，不写）。浓度：库内 null，官方页标题下明写「Eau de Parfum」，故填 Eau de Parfum。调香师名出自 theperfumehouse（非官方页），未写入文案。
