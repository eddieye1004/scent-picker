# 实物图缺口清单 · 第4批（2026-11-18）

现状：全库 1388 瓶，已有图 637 瓶，缺图 751 瓶；其中带淘宝链接（可购买、优先补）缺图 51 瓶。
本批 100 瓶：先补带淘宝链接的（51 瓶），其余 49 瓶为无链接长尾，按数据集热度排序。
排序口径同第三批：有淘宝链接优先 → popularityRank 升序 → rank 为 null 的按品牌+名称字母序排在组尾。
复算：`node scripts/gen-photo-gaps.mjs 4 --size 100 --notes docs/reports/photos-gap-batch4.notes.json`

## 上批遗留（6 瓶，必须本批补齐）

- **ajmal-aurum-elixir**（上批驳回）：第三批验收驳回：瓶身对版（AURUM ELIXIR 本尊），但抠图底部残留原墨绿背景的绿色碎边，白底上一眼可见。重找原生浅底图或重抠。
- **armaf-miss-armaf-attitude**（上批驳回）：第三批验收驳回：瓶身对版，但抠图边缘全周锯齿阶梯（原图纯黑底粗抠），低于原生干净底标准。重找或重抠。
- **kayali-lovefest-burning-cherry-48**（上批跳过）：第三批跳过：perfumeonline / fragranceoutlet / intensoud / oudstore / perfumepalace 均无货号；Kayali 官方站（hudabeauty）拒绝抓取，未找到可用实物图。
- **nina-ricci-nina-fantasy**（上批跳过）：第三批跳过：限量款，perfumeonline / fragranceoutlet / perfumepalace 均只有 Nina、Nina Illusion、Nina Rouge 等，无 Fantasy 本款。
- **issey-miyake-a-drop-dissey**（上批跳过）：第三批跳过：各渠道只有 L'Eau d'Issey 系列与 A Drop d'Issey 的其它衍生，未找到本款。另注意现图候选里有一张灰底、瓶身裁掉一半的不合格图（见 photo-report.md §3），不要拿来顶替。
- **creed-spice-and-wood**（上批跳过）：第三批跳过：Creed 官方店（creedboutique）已无 Spice and Wood（Royal Exclusives 停售），其它渠道仅 Spicebomb/Vetiver 等近似款。

| # | id | 品牌 | 名称 | 浓度 | 淘宝链接 | 备注 |
|---|---|---|---|---|---|---|
| 1 | kayali-lovefest-burning-cherry-48 | Kayali | Love Fest Burning Cherry 48 | 淡香精 EDP | 有 | 上批跳过 |
| 2 | nina-ricci-nina-fantasy | Nina Ricci | Nina Fantasy | 淡香水 EDT | 有 | 上批跳过 |
| 3 | issey-miyake-a-drop-dissey | Issey Miyake | A Drop d'Issey | 淡香精 EDP | 有 | 上批跳过 |
| 4 | creed-spice-and-wood | Creed | Spice and Wood | 淡香精 EDP | 有 | 上批跳过 |
| 5 | ajmal-aurum-elixir | Ajmal | Aurum Elixir | 淡香精 EDP | 有 | 上批驳回 |
| 6 | armaf-miss-armaf-attitude | Armaf | Miss Armaf Attitude | 淡香精 EDP | 有 | 上批驳回 |
| 7 | azzaro-chrome-legend-toilette | Azzaro | Chrome Legend | 淡香水 EDT | 有 |  |
| 8 | azzaro-forever-wanted-elixir | Azzaro | Forever Wanted Elixir | 浓缩香精 | 有 |  |
| 9 | bvlgari-allegra-baciami | Bvlgari | Allegra Baciami | 淡香精 EDP | 有 |  |
| 10 | calvin-klein-defy-toilette | Calvin Klein | Defy | 淡香水 EDT | 有 |  |
| 11 | calvin-klein-eternity-moment | Calvin Klein | Eternity Moment | 淡香精 EDP | 有 |  |
| 12 | calvin-klein-my-euphoria | Calvin Klein | My Euphoria | 淡香精 EDP | 有 |  |
| 13 | carolina-herrera-chic | Carolina Herrera | Chic | 淡香水 EDT | 有 |  |
| 14 | clinique-happy | Clinique | Happy | 淡香精 EDP | 有 |  |
| 15 | creed-acqua-fiorentina | Creed | Acqua Fiorentina | 淡香精 EDP | 有 |  |
| 16 | creed-neroli-sauvage | Creed | Neroli Sauvage |  | 有 |  |
| 17 | creed-original-santal-parfum | Creed | Original Santal | 淡香精 EDP | 有 |  |
| 18 | creed-wind-flowers | Creed | Wind Flowers | 淡香精 EDP | 有 |  |
| 19 | dior-homme | Dior | Homme | 淡香水 EDT | 有 |  |
| 20 | dior-poison-girl | Dior | Poison Girl | 淡香精 EDP | 有 |  |
| 21 | diptyque-leau-des-hesperides | Diptyque | L'Eau des Hesperides | 淡香水 EDT | 有 |  |
| 22 | diptyque-vetyverio-toilette | Diptyque | Vetyverio | 淡香水 EDT | 有 |  |
| 23 | ellis-brooklyn-myth | Ellis Brooklyn | Myth | 淡香精 EDP | 有 |  |
| 24 | frederic-malle-the-moon | Frédéric Malle | The Moon | 淡香精 EDP | 有 |  |
| 25 | french-avenue-liquid-brun | French Avenue | Liquid Brun | 淡香精 EDP | 有 |  |
| 26 | givenchy-ange-ou-demon-parfum | Givenchy | Ange ou Démon | 淡香精 EDP | 有 |  |
| 27 | gucci-flora-gorgeous-jasmine | Gucci | Flora Gorgeous Jasmine | 淡香精 EDP | 有 |  |
| 28 | jean-paul-gaultier-la-belle-paradise-garden | Jean Paul Gaultier | La Belle Paradise Garden | 淡香精 EDP | 有 |  |
| 29 | jean-paul-gaultier-le-beau-narcisse | Jean Paul Gaultier | Le Beau Narcisse | 淡香精 EDP | 有 |  |
| 30 | jean-paul-gaultier-le-beau-paradise-garden | Jean Paul Gaultier | Le Beau Paradise Garden | 淡香精 EDP | 有 |  |
| 31 | jean-paul-gaultier-scandal-absolu | Jean Paul Gaultier | Scandal Absolu | 香水 | 有 |  |
| 32 | joop-joop-homme | Joop | Joop Homme | 淡香精 EDP | 有 |  |
| 33 | juicy-couture-viva-la-juicy-gold-couture | Juicy Couture | Viva La Juicy Gold Couture | 淡香精 EDP | 有 |  |
| 34 | kajal-lamar | Kajal | Lamar | 淡香精 EDP | 有 |  |
| 35 | kayali-eden-juicy-apple | Kayali | Eden Juicy Apple | 淡香精 EDP | 有 |  |
| 36 | kayali-elixir-11-parfum | Kayali | Elixir 11 | 淡香精 EDP | 有 |  |
| 37 | kayali-oudgasm-rose-oud | Kayali | Oudgasm Rose Oud | 淡香精 EDP | 有 |  |
| 38 | kayali-oudgasm-vanilla-oud | Kayali | Oudgasm Vanilla Oud | 淡香精 EDP | 有 |  |
| 39 | kilian-dark-lord | Kilian Paris | Dark Lord | 淡香精 EDP | 有 |  |
| 40 | maison-crivelli-musc-nurasana | Maison Crivelli | Musc Nurasana | 香精 | 有 |  |
| 41 | maison-margiela-sailing-day | Maison Margiela Fragrances | Sailing Day | 淡香水 EDT | 有 |  |
| 42 | matiere-premiere-radical-rose | Matière Première | Radical Rose | 淡香精 EDP | 有 |  |
| 43 | montale-intense-roses-musk | Montale | INTENSE Roses Musk : | 淡香精 EDP | 有 |  |
| 44 | montale-intense-starry-nights | Montale | Intense Starry Nights : | 淡香精 EDP | 有 |  |
| 45 | montale-wood-and-spices | Montale | Wood and Spices | 淡香精 EDP | 有 |  |
| 46 | narciso-rodriguez-all-of-me-intense | Narciso Rodriguez | all of me intense | 淡香精 EDP | 有 |  |
| 47 | narciso-rodriguez-for-him-bleu-noir-toilette | Narciso Rodriguez | For Him Bleu Noir | 淡香水 EDT | 有 |  |
| 48 | nasomatto-blamage | Nasomatto | Blamage | 香精 | 有 |  |
| 49 | rayhaan-pacific-aura | Rayhaan | Pacific Aura | 淡香精 EDP | 有 |  |
| 50 | tom-ford-black-lacquer | Tom Ford | Black Lacquer | 淡香精 EDP | 有 |  |
| 51 | valentino-vendetta-uomo | Valentino | Vendetta Uomo | 淡香精 EDP | 有 |  |
| 52 | amouage-honour-man | Amouage | Honour Man |  | 无 |  |
| 53 | dolce-gabbana-k-by-dolce-and-gabbana | Dolce&Gabbana | K by Dolce&Gabbana | 淡香精 EDP | 无 |  |
| 54 | viktor-rolf-spicebomb-extreme | Viktor&Rolf | Spicebomb Extreme | 淡香精 EDP | 无 |  |
| 55 | michael-kors-wonderlust | Michael Kors | Wonderlust |  | 无 |  |
| 56 | byredo-sunday-cologne | Byredo | Sunday Cologne | 淡香精 EDP | 无 |  |
| 57 | cartier-baiser-vole | Cartier | Baiser Volé | 淡香精 EDP | 无 |  |
| 58 | floris-no-89 | Floris London | No.89 | 淡香水 EDT | 无 |  |
| 59 | mancera-instant-crush | Mancera | Instant Crush | 淡香精 EDP | 无 |  |
| 60 | burberry-brit-rhythm | Burberry | Brit Rhythm | 淡香水 EDT | 无 |  |
| 61 | lacoste-l-12-12-rouge | Lacoste | L.12.12 Rouge | 淡香水 EDT | 无 |  |
| 62 | nishane-ege | Nishane | Ege | 香精 | 无 |  |
| 63 | dolce-gabbana-devotion | Dolce&Gabbana | Devotion | 淡香精 EDP | 无 |  |
| 64 | guerlain-vetiver | Guerlain | Vétiver | 淡香水 EDT | 无 |  |
| 65 | memo-paris-irish-leather | Memo Paris | Irish Leather | 淡香精 EDP | 无 |  |
| 66 | tiziana-terenzi-andromeda | Tiziana Terenzi | Andromeda | 香精 | 无 |  |
| 67 | marc-jacobs-daisy-eau-so-fresh | Marc Jacobs | Daisy Eau So Fresh | 淡香水 EDT | 无 |  |
| 68 | jo-malone-blackberry-and-bay | Jo Malone London | Blackberry & Bay |  | 无 |  |
| 69 | kenzo-kenzo-world | Kenzo | Kenzo World | 淡香精 EDP | 无 |  |
| 70 | moschino-toy-2-bubble-gum | Moschino | Toy 2 Bubble Gum | 淡香水 EDT | 无 |  |
| 71 | armani-emporio-armani-she | Giorgio Armani | Emporio Armani She | 淡香精 EDP | 无 |  |
| 72 | azzaro-wanted-by-night | Azzaro | Wanted by Night | 淡香精 EDP | 无 |  |
| 73 | davidoff-cool-water-intense | Davidoff | Cool Water Intense | 淡香精 EDP | 无 |  |
| 74 | gucci-rush | Gucci | Rush | 淡香水 EDT | 无 |  |
| 75 | heeley-cardinal | James Heeley | Cardinal | 淡香精 EDP | 无 |  |
| 76 | prada-luna-rossa-black | Prada | Luna Rossa Black | 淡香精 EDP | 无 |  |
| 77 | hugo-boss-boss-orange | Hugo Boss | Boss Orange | 淡香水 EDT | 无 |  |
| 78 | jovoy-private-label | Jovoy Paris | Private Label | 淡香精 EDP | 无 |  |
| 79 | montale-wild-aoud | Montale | Wild Aoud | 淡香精 EDP | 无 |  |
| 80 | mancera-black-gold | Mancera | Black Gold | 淡香精 EDP | 无 |  |
| 81 | montblanc-explorer-ultra-blue | Montblanc | Explorer Ultra Blue | 淡香精 EDP | 无 |  |
| 82 | nishane-nanshe | Nishane | Nanshe | 香精 | 无 |  |
| 83 | roja-parfums-danger-pour-femme | Roja Parfums | Danger Pour Femme | 香水 | 无 |  |
| 84 | amouage-lyric-woman | Amouage | Lyric Woman |  | 无 |  |
| 85 | dolce-gabbana-dolce | Dolce&Gabbana | Dolce | 淡香精 EDP | 无 |  |
| 86 | guerlain-aqua-allegoria-herba-fresca | Guerlain | Aqua Allegoria Herba Fresca | 淡香水 EDT | 无 |  |
| 87 | santa-maria-novella-acqua-della-regina | Santa Maria Novella | Acqua della Regina | 古龙水 EDC | 无 |  |
| 88 | frederic-malle-french-lover | Frédéric Malle | French Lover | 淡香精 EDP | 无 |  |
| 89 | issey-miyake-pleats-please | Issey Miyake | Pleats Please | 淡香水 EDT | 无 |  |
| 90 | michael-kors-sexy-ruby | Michael Kors | Sexy Ruby | 淡香精 EDP | 无 |  |
| 91 | zoologist-bat | Zoologist Perfumes | Bat |  | 无 |  |
| 92 | jo-malone-nectarine-blossom-and-honey | Jo Malone London | Nectarine Blossom & Honey |  | 无 |  |
| 93 | boucheron-quatre-en-rouge | Boucheron | Quatre En Rouge | 淡香精 EDP | 无 |  |
| 94 | nicolai-patchouli-intense | Nicolaï | Patchouli Intense | 淡香精 EDP | 无 |  |
| 95 | annick-goutal-petite-cherie | Annick Goutal | Petite Chérie |  | 无 |  |
| 96 | roberto-cavalli-paradiso-azzurro | Roberto Cavalli | Paradiso Azzurro | 淡香精 EDP | 无 |  |
| 97 | gucci-memoire-dune-odeur | Gucci | Memoire d'une Odeur | 淡香精 EDP | 无 |  |
| 98 | heeley-sel-marin | James Heeley | Sel Marin | 淡香精 EDP | 无 |  |
| 99 | jovoy-rouge | Jovoy Paris | Rouge Assassin | 淡香精 EDP | 无 |  |
| 100 | matiere-premiere-encens-suave | Matière Première | Encens Suave | 淡香精 EDP | 无 |  |
