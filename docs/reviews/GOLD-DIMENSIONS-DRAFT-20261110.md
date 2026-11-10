# 金标准补维草案（likedNotes / subfamily / anchor / emotion）

> 日期 2026-11-10 · 派单：Muse 第 7 步（前半）· Eddie 2026-11-10 批准「补」
> 状态：**草案，待 Eddie 划改**。本文件不改金标准本体，不动 `scripts/lib/gold-portraits.mjs`、
> `scripts/test-gold.mjs`、`src/` 任何文件，不跑基线重测。
> 上游：`docs/GOLD-STANDARD-FINAL.md`（金标准定稿）、`docs/EXPERIMENT-NOTES-LAYER.md`（第 6 步根因）。

---

## 0. 为什么补、补哪一维

第 6 步实测：12 个画像的四个正分 notes 输入全为空（`likedNotes` 0/12、`subfamily` 0/12、
`anchor` 0/12、`emotion` 0/12），于是 `0 × 权重 = 0`，notes 层在金标准里**恒为 0 分**，
任何关于 notes 层的结论都无法被这套金标准检验。

本单只给草案，逐画像给出可填值与依据，交 Eddie 逐条划改；确认后才落 `gold-portraits.mjs`。

---

## 1. 选词口径与反循环论证声明

**可选词表**：只用问卷实际存在的 58 个 notes chip（第 6 步探针验证：`noteIndex` 60 项滤掉
0 命中的 2 项，58 个无一死链）。每个 chip 的 `en` 直接就是 `answers.likedNotes` 接受的写法，
无需转换。本草案用到的 chip 全部在这 58 个之内（见 §5 校验）。

**反循环论证的三条自约束**：

1. **只读画像定义**（人设标题 + `answers` 里的 family / 季节 / 场合 / 冷暖 / 甜度 / 强度 /
   characterTags / characterNeg / 避雷项），不读该画像 gold 瓶的 `notesAll`；
2. **不跑现行打分**，不看 `recommend()` 输出；
3. **不参照其他画像**，每个画像独立推。

**可证伪证据**：如果这组 chip 是按 gold 瓶反推的，12 个画像的 gold 覆盖率应该普遍接近满值。
实际（§4 附表）是 5/5、5/5、5/5、4/5、4/5、4/5、3/4、3/5、2/5、2/5、2/5、1/5 —— 高低极不均，
P01 只有 1/5。**这个分布本身说明词是先从定义选出来的，不是从答案倒推的。**

---

## 2. 逐画像草案

依据一栏的措辞层级（Eddie 划改时按这个判断严格度）：

- **字面**：依据是画像定义里的原词（如「皮革感」「茶香草本」）；
- **直接蕴含**：由定义两三条事实直接推出，不需经验（如「family=citrus 且避雷橙花 → 不选柑橘花香子类」）；
- **推断**：需要一步香水常识（如「皂感 → 醛」）。标了「推断」的，请重点看。

### P01 清冷感·办公室男生·怕甜

| 维度 | 拟填值 | 依据 |
|---|---|---|
| likedNotes | `cedar` 雪松 / `vetiver` 香根草 / `juniper` 杜松 | 字面：family=woody、temperature=cool、characterTags 含 woody/fresh/clean，三者都是木质调里「干、冷、不甜」的一路；characterNeg 含 sweet，故排除檀木之外的所有甜木质与香草方向 |
| subfamily | 空 | 定义只到「木质 + 清冷 + 怕甜」，未指向檀木/香根草/乌木/通用木质四档中的哪一档。**定义无依据，保持空** |
| anchor | 空 | 定义是人设，没有「已试过且喜欢的一瓶」。**定义无依据，保持空** |
| emotion | 空 | 结构不可填，见 §3 |

### P02 怕晕白花·日常女生

| 维度 | 拟填值 | 依据 |
|---|---|---|
| likedNotes | `bergamot` 佛手柑 / `lemon` 柠檬 / `grapefruit` 葡萄柚 | 字面：family=citrus、characterTags 含 citrusy/fresh/clean；三者均属柑橘调的芳香柑橘/古龙/青绿柑橘三支，**都不含白花**；dislikedNotes 含 Jasmine/Tuberose/Orange Blossom/Neroli，故明确避开 citrus-floral 子类 |
| subfamily | `green-citrus` 青绿柑橘 | 直接蕴含：避雷名单里的橙花/橙花油正是 `citrus-floral` 子类的挂靠香材（taxonomy：neroli, orange blossom, jasmine, orange），该子类被避雷项整支排除；同族剩下的三支里，青绿柑橘（petitgrain/galbanum/grapefruit/violet leaf）与 characterTags 的 fresh/clean 最贴 |
| anchor | 空 | **定义无依据，保持空** |
| emotion | 空 | 结构不可填，见 §3 |

### P03 温暖约会·秋冬

| 维度 | 拟填值 | 依据 |
|---|---|---|
| likedNotes | `amber` 琥珀 / `benzoin` 安息香 / `cinnamon` 肉桂 | 字面：family=amber、temperature=warm、sweetness=2、characterTags 含 warm/sweet/resinous；三者都在 amber 族内且是「暖 + 树脂 + 微甜」的核心香材，characterNeg 含 fresh/citrusy 故不选柑橘或绿调 |
| subfamily | `resinous` 树脂 | 字面：characterTags 直接含 **resinous**，amber 族下同名子类挂靠 benzoin/labdanum/myrrh，与「温暖约会」的厚重树脂感一致 |
| anchor | 空 | **定义无依据，保持空** |
| emotion | 空 | 结构不可填，见 §3 |

### P04 干净皂感·上课

| 维度 | 拟填值 | 依据 |
|---|---|---|
| likedNotes | `musk` 麝香 / `aldehydes` 醛 / `lavender` 薰衣草 | 字面：characterTags 含 clean/musky，`musk` 直接对应 musky；标题「干净皂感」的字面实现就是醛（推断，但「皂感」在香水里基本等同于醛）；intensity=1、sweetness=0、characterNeg 含 sweet/resinous，薰衣草是 fresh/fougere 里最低甜、最「洗完澡」的一档 |
| subfamily | 空 | 「干净皂感」可指向 fougere（薰衣草/香豆素/橡苔）也可指向 aquatic（水生），定义未收窄到其中一支。**定义无依据，保持空**（备选：`fougere`，属推断，留给 Eddie 判） |
| anchor | 空 | **定义无依据，保持空** |
| emotion | 空 | 结构不可填，见 §3 |

> 注意：`aldehydes` 在数据里归 floral/powdery-floral（跨族），但「皂感」这个词在画像标题里，
> 属定义内信息，故保留。

### P05 运动清爽·夏天白天

| 维度 | 拟填值 | 依据 |
|---|---|---|
| likedNotes | `bergamot` 佛手柑 / `grapefruit` 葡萄柚 / `petitgrain` 苦橙叶 | 字面：family=citrus、season=summer、temperature=cool、sweetness=0、characterTags 含 citrusy/fresh/green；三者覆盖芳香柑橘/青绿柑橘两支，`petitgrain` 直接对应 characterTags 的 green；dislikedFamilies 含 gourmand/amber，故不选任何甜向或树脂向 |
| subfamily | `green-citrus` 青绿柑橘 | 字面：characterTags 含 **green** + family=citrus，taxonomy 里 citrus 族下唯一带 green 的子类就是 green-citrus；挂靠香材 petitgrain/galbanum/grapefruit/violet leaf 与「运动、夏天、清爽」一致 |
| anchor | 空 | **定义无依据，保持空** |
| emotion | 空 | 结构不可填，见 §3 |

### P06 神秘夜晚

| 维度 | 拟填值 | 依据 |
|---|---|---|
| likedNotes | `incense` 焚香 / `oud` 乌木 / `myrrh` 没药 | 字面：family=amber、occasion=date、characterTags 含 smoky/resinous/woody、characterNeg 含 fresh/citrusy；焚香=smoky 直指，没药=resinous 直指，乌木=woody 直指且是「夜晚、有故事感」的最典型木质 |
| subfamily | 空 | 可指向 incense（焚香）也可指向 resinous（没药三支），二者都被 characterTags 覆盖，定义未二选一。**定义无依据，保持空**（备选：`incense`，属推断，留给 Eddie 判） |
| anchor | 空 | **定义无依据，保持空** |
| emotion | 空 | 结构不可填，见 §3 |

### P07 甜美不腻·果香花香

| 维度 | 拟填值 | 依据 |
|---|---|---|
| likedNotes | `peony` 牡丹 / `osmanthus` 桂花 / `freesia` 小苍兰 | 字面：family=floral、sweetness=2、characterTags 含 fruity/floral；标题「果香花香」= taxonomy 的 `fruity-floral` 子类，其挂靠香材就是 peony（牡丹）；桂花与小苍兰是花香里带清甜果感的两支；dislikedFamilies 含 gourmand，故甜度只从花里来，不引入焦糖/香草 |
| subfamily | `fruity-floral` 果香花香 | 字面：标题「果香花香」与 taxonomy 子类名**逐字相同**，挂靠香材 peony/blackcurrant/peach |
| anchor | 空 | **定义无依据，保持空** |
| emotion | 空 | 结构不可填，见 §3 |

### P08 正式场合·稳重

| 维度 | 拟填值 | 依据 |
|---|---|---|
| likedNotes | `cedar` 雪松 / `sandalwood` 檀木 / `oakmoss` 橡苔 | 字面：family=woody、occasion=formal、characterTags 含 woody/earthy、sweetness=0、characterNeg 含 sweet/fruity；雪松=woody、橡苔=earthy 都是字面对应，檀木是正式场合木质的标准答案；三者全不甜 |
| subfamily | 空 | 「正式 + 稳重」可指向 sandalwood（檀木）也可指向 woody（通用木质/橡苔），定义未收窄。**定义无依据，保持空**（备选：`woody`，因 characterTags 含 earthy 更贴橡苔，属推断，留给 Eddie 判） |
| anchor | 空 | **定义无依据，保持空** |
| emotion | 空 | 结构不可填，见 §3 |

### P09 茶香草本

| 维度 | 拟填值 | 依据 |
|---|---|---|
| likedNotes | `green tea` 绿茶 / `sage` 鼠尾草 / `galbanum` 白松香 | 字面：标题「茶香草本」→ 绿茶是茶香本体、鼠尾草是草本本体；characterTags 含 herbal/green，白松香是绿意最标准的香材；family=fresh、dislikedFamilies 含 gourmand、characterNeg 含 sweet/creamy，故不引入任何甜向 |
| subfamily | `green` 绿意 | 字面：characterTags 含 **green**，fresh 族下同名子类挂靠 violet leaf/galbanum/fig/tomato leaf，与「草本、绿」逐字对应 |
| anchor | 空 | **定义无依据，保持空** |
| emotion | 空 | 结构不可填，见 §3 |

### P10 皮革感小众

| 维度 | 拟填值 | 依据 |
|---|---|---|
| likedNotes | `leather` 皮革 / `incense` 焚香 / `saffron` 藏红花 | 字面：标题「皮革感」→ leather 逐字；characterTags 含 leathery/smoky → 焚香对应 smoky；family=amber 下 leather 子类的标准挂靠香材是 leather/birch/saffron/styrax，藏红花因此入选；sweetness=0、characterNeg 含 sweet/clean，三者都不甜 |
| subfamily | `leather` 皮革 | 字面：characterTags 含 **leathery**、标题含「皮革」，amber 族下同名子类 |
| anchor | 空 | **定义无依据，保持空** |
| emotion | 空 | 结构不可填，见 §3 |

### P11 夏日清凉·讨厌琥珀

| 维度 | 拟填值 | 依据 |
|---|---|---|
| likedNotes | `lemon` 柠檬 / `grapefruit` 葡萄柚 / `petitgrain` 苦橙叶 | 字面：family=citrus、season=summer、temperature=cool、sweetness=0、characterTags 含 citrusy/fresh、characterNeg 含 warm/resinous；dislikedFamilies 含 amber，三者都属于 citrus 族的古龙/青绿柑橘，**均不触碰琥珀**；苦橙叶是柑橘里最「清凉不甜」的一支 |
| subfamily | 空 | 定义给的是「清凉 + 讨厌琥珀」，可指向 cologne 也可指向 green-citrus，未收窄到一支。**定义无依据，保持空**（备选：`cologne`，因 lemon 是古龙水的核心，属推断） |
| anchor | 空 | **定义无依据，保持空** |
| emotion | 空 | 结构不可填，见 §3 |

### P12 奶香柔软

| 维度 | 拟填值 | 依据 |
|---|---|---|
| likedNotes | `tuberose` 晚香玉 / `gardenia` 栀子 / `tonka bean` 零陵香豆 | 字面：family=floral、sweetness=2、temperature=warm、characterTags 含 creamy/sweet；晚香玉与栀子都是「奶感白花」的代表（creamy 字面）；`tonka bean` 是奶甜香材的字面实现（推断：「奶香」在香水里主要落在零陵香豆/香草，此处选前者因为香草更偏 gourmand 堆甜，而 characterNeg 含 leathery/smoky 只否掉皮革烟熏，未否 gourmand） |
| subfamily | 空 | 「奶香柔软」可指向 white-floral（晚香玉/栀子）也可指向 soliflore（单一花），定义未收窄。**定义无依据，保持空**（备选：`white-floral`，属推断） |
| anchor | 空 | **定义无依据，保持空** |
| emotion | 空 | 结构不可填，见 §3 |

---

## 3. emotion 为什么 12 个全空：结构原因，不是遗漏

`emotion` 不是「没时间补」，而是**在这套问卷结构下与 12 个画像互斥**：

- `app.js:1556` —— 轮盘选中 family 时执行 `state.answers.emotion = null`（清掉情绪）；
- `app.js:1607-1608` —— 选情绪时执行 `state.answers.family = null; state.answers.subfamily = null`；
- `scoring.js:263` —— 有 family 时家族向量只取 family，emotion 只影响 `emotionNotes` 一路。

12 个画像**全部**用 `family` 入口（每个都有 `answers.family`），按上述规则 `emotion` 必为 null。
所以这一维保持空的正确写法是「结构不适用」，不是「定义无依据」。

若 Eddie 希望金标准覆盖 `emotionNotes` 这一因子，需要另外决定：是否给部分画像**改走情绪入口**
（代价是同时丢掉 family 与 subfamily 两维），这是金标准集的结构性选择，不在本草案范围内。

同理 `anchor` 12 个全空：anchor 那一步问的是「有没有已经试过、并且喜欢的香水」（`app.js:190`），
而 12 个画像定义的全是「人设 + 场合」，没有一个是「已知喜欢某瓶」的场景。补 anchor 等于新编画像，
不属于「补维」。

---

## 4. 附表：选完之后的事后诊断（**未参与挑选**）

这张表是**先定完 chip、再算的**，只用于让 Eddie 预判基线会怎么动，不是挑选依据。
它同时是 §1 反循环论证的证据：若曾按 gold 反推，这一列应该齐刷刷接近满值。

| 画像 | 拟填 chips | 该族内 ≥1 命中 | 族内 ≥2 命中（饱和率） | 全库 ≥2 命中 | gold 含任一 chip |
|---|---|---|---|---|---|
| P01 | cedar / vetiver / juniper | 302/499 | 100（20.0%） | 124 | **1/5** |
| P02 | bergamot / lemon / grapefruit | 228/266 | 85（32.0%） | 156 | 4/5 |
| P03 | amber / benzoin / cinnamon | 244/358 | 55（15.4%） | 80 | 3/5 |
| P04 | musk / aldehydes / lavender | 167/262 | 37（14.1%） | 80 | 5/5 |
| P05 | bergamot / grapefruit / petitgrain | 206/266 | 46（17.3%） | 69 | 4/5 |
| P06 | incense / oud / myrrh | 115/358 | 20（5.6%） | 22 | 4/5 |
| P07 | peony / osmanthus / freesia | 106/787 | 12（1.5%） | 13 | 2/5 |
| P08 | cedar / sandalwood / oakmoss | 342/499 | 122（24.4%） | 168 | 5/5 |
| P09 | green tea / sage / galbanum | 90/262 | 5（1.9%） | 5 | 5/5 |
| P10 | leather / incense / saffron | 155/358 | 29（8.1%） | 43 | 3/4 |
| P11 | lemon / grapefruit / petitgrain | 146/266 | 29（10.9%） | 38 | 2/5 |
| P12 | tuberose / gardenia / tonka bean | 182/787 | 23（2.9%） | 26 | 2/5 |

「族内瓶数」口径：`families[画像所选族] >= 0.4`（与 `scoring.js` 的「只是带一点」压分阈值一致）。

**读法（推断，需实测验证）**：`likedNotes` 的归一化是 `clamp01(hits/2)`，命中 2 个即饱和。
所以真正影响排序的不是「能不能命中」，而是**族内有多大比例的瓶子撞到 2 个**。
P07（1.5%）与 P09（1.9%）几乎不饱和，这两维补进去后区分力最强；
P02（32.0%）与 P08（24.4%）超过两成的族内瓶直接拿满分，补进去可能只是把一批瓶一起抬分，
相对顺序不变 —— 与第 6 步 §6.1「因子一旦在池内饱和，就不再有区分力」同构。
这只是粗算，实际 delta 要等落盘后跑基线才知道。

---

## 5. 校验清单（可复跑）

| 检查 | 结果 |
|---|---|
| 用到的 chip 是否都在 58 个 UI 词表内 | 是，**29 个**不同 chip，全部命中 |
| 是否有 chip 撞上该画像 `dislikedNotes` | 无（0/36） |
| 是否有 chip 撞上该画像 `dislikedFamilies` | 无（0/36） |
| 每个画像 chip 数是否在 2–4 | 是（全部 3 个） |
| 跨族 chip（数据里的 note 家族 ≠ 画像 family） | 3 处，均已在正文注明：P04 `aldehydes`(floral)、P06 `oud`(woody)、P12 `tonka bean`(gourmand) |
| 填了 subfamily 的是否真在该画像 family 下 | 是，**6 个**全部在对应族的 `subfamilies` 里 |
| 填了 subfamily 的挂靠香材是否撞 `dislikedNotes` | 无 |

**未做**：没有改 `gold-portraits.mjs` / `test-gold.mjs` / `src/`；没有跑基线。基线等 Eddie 划改确认后另行落盘。

---

## 6. 汇总：每个维度覆盖几个画像

| 维度 | 覆盖 | 明细 |
|---|---|---|
| **likedNotes** | **12/12** | 每画像 3 个 chip，共 **29 个不同 chip**（占 58 词表的 50.0%）；全部同族，3 处跨族已注明 |
| **subfamily** | **6/12** | P02 green-citrus、P03 resinous、P05 green-citrus、P07 fruity-floral、P09 green、P10 leather。其余 6 个留空，其中 5 个给了「备选但属推断」让 Eddie 判（P04 fougere、P06 incense、P08 woody、P11 cologne、P12 white-floral），P01 无备选 |
| **anchor** | **0/12** | 全部「定义无依据」——画像是人设不是「已知喜欢某瓶」；补 anchor 等于新编画像 |
| **emotion** | **0/12** | 全部「结构不适用」——12 个画像都走 family 入口，问卷里两条入口互斥（§3） |

补充说明：subfamily 实填 6 个（P02、P03、P05、P07、P09、P10），5 个留空但给了推断备选
（P04、P06、P08、P11、P12），P01 无备选。

---

## 7. 请 Eddie 划改的三个点

1. **P01 的 likedNotes**：`cedar / vetiver / juniper` 三者与 gold 5 瓶几乎不重合（1/5）。
   如果认为「清冷感·办公室男生」应该是银山水/爱尔兰绿花呢那一路，这里可能需要补
   `green tea`（茶香，与 characterTags 的 fresh 也一致）——但那是看了 gold 之后才想到的，
   **本草案没有这样填**，请示意是否破例。
2. **P04 `aldehydes` 与 P12 `tonka bean` 的跨族**：前者靠「皂感」这个词，后者靠「奶香」这个词。
   如果要求 chip 必须与画像 family 同族，这两处需替换（P04 可换 `musk/ lavender/ sage`，
   P12 可换 `tuberose/ gardenia/ iris`），替换后定义支撑会变弱（这是实话）。
3. **subfamily 的 5 个推断备选**（P04/P06/P08/P11/P12）：填了能让这一维覆盖到 11/12，
   但每个都需一步香水常识。是要「覆盖优先」还是「只保留字面依据」，请定一个口径，
   我按口径重出一版。
