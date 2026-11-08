/* 补品牌中文别名：先验证再写入

   证据（`probe-reject-review.mjs` 实测）：
     Jo Malone / English Pear & Freesia，查「祖玛珑 英国梨」召回 19 条，
     全部是正确商品（含 JoMaloneLondon 官方旗舰店），但因为标题写「祖玛珑」
     而库里品牌叫「Jo Malone London」，`brandHit` 恒为 false，19 条全拒。

   同类：`Lancôme` 标题写「兰蔻」、`Kilian Paris` 写「凯利安」、
   `Frédéric Malle` 写「馥马尔」、`Maison Margiela Fragrances` 写「梅森马吉拉」。

   这批别名不是我编的，是从**实测召回的标题里读出来的**。下面的 LATIN 表里
   每一项都对应一个或几个品牌，验证方式见 `probe-alias-verify.mjs`。
*/

/* 品牌 → 标题里实际出现过的中文写法。key 必须与 perfumes.json 的 brand 完全一致。 */
export const BRAND_ALIAS_ADD = {
  'Armaf': ['阿玛芙', 'ARMAF'],
  'Acqua di Parma': ['帕尔玛之水', 'Acqua di Parma'],
  'Afnan': ['阿夫南', 'AFNAN'],
  'Yves Saint Laurent': ['圣罗兰', 'YSL', '伊夫圣罗兰'],
  'Amouage': ['爱慕', 'AMOUAGE'],
  'Guerlain': ['娇兰', 'GUERLAIN'],
  'Maison Margiela Fragrances': ['梅森马吉拉', '马吉拉', 'Maison Margiela', 'MMM'],
  'Montale': ['蒙塔莱', 'MONTALE'],
  'Giorgio Armani': ['阿玛尼', 'ARMANI'],
  'Frédéric Malle': ['馥马尔', 'FREDERIC MALLE', 'Frederic Malle'],
  'Ajmal': ['阿吉玛尔', 'AJMAL'],
  'Kilian Paris': ['凯利安', '克利安', 'KILIAN', 'By Kilian'],
  'Mancera': ['曼塞拉', 'MANCERA'],
  'Nishane': ['妮姗', 'NISHANE'],
  'Prada': ['普拉达', 'PRADA'],
  'Tom Ford': ['汤姆福特', 'TF', 'TOM FORD'],
  'Juliette Has a Gun': ['佩枪朱丽叶', 'JULIETTE HAS A GUN'],
  'Montblanc': ['万宝龙', 'MONTBLANC'],
  'Dolce&Gabbana': ['杜嘉班纳', 'DOLCE GABBANA', 'D&G'],
  'Dior': ['迪奥', 'DIOR'],
  'Bvlgari': ['宝格丽', 'BVLGARI'],
  'Rabanne': ['帕高', 'RABANNE', 'Paco Rabanne'],
  'Jo Malone London': ['祖玛珑', '祖马龙', 'JO MALONE', 'JOMALONE'],
  'Lancôme': ['兰蔻', 'LANCOME', 'Lancome'],
  'Memo Paris': ['曼莫', 'MEMO'],
  'Valentino': ['华伦天奴', 'VALENTINO'],
  'Parfums de Marly': ['玛丽之香', 'PARFUMS DE MARLY'],
  'Gucci': ['古驰', 'GUCCI'],
  'Pantheon Roma': ['万神殿', 'PANTHEON'],
  'Trussardi': ['楚萨迪', 'TRUSSARDI'],
  'Tiziana Terenzi': ['蒂齐亚纳', 'TIZIANA TERENZI'],
  'Ex Nihilo': ['伊克西尼罗', 'EX NIHILO'],
  'Creed': ['信仰', '恺芮得', 'CREED'],
  'Clive Christian': ['克莱夫基斯汀', 'CLIVE CHRISTIAN'],
  'Nabeel': ['纳比尔', 'NABEEL'],
  'Maison Francis Kurkdjian': ['梵诗柯香', 'MFK', 'FRANCIS KURKDJIAN'],
  'Marc Jacobs': ['马克雅各布', 'MARC JACOBS'],
  'Roja Parfums': ['罗哈', 'ROJA'],
  'Carolina Herrera': ['卡罗琳娜海莱娜', 'CAROLINA HERRERA'],
  'Givenchy': ['纪梵希', 'GIVENCHY'],
};
