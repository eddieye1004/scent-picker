/**
 * 联盟开放平台的两个客户端：京东联盟（JOS）与淘宝客（TOP）。
 *
 * 为什么单独一个模块而不是塞进 fetch-products.mjs：
 * 签名算法是**最容易写错、也最难查错**的一块（改了没反应，只回一句
 * "签名错误"）。把它做成无副作用的纯函数，就能用固定向量钉住 ——
 * 见 scripts/test-union-api.mjs。这个模块不读环境变量、不写文件、不发请求，
 * 请求由调用方（fetch-products.mjs / gen-affiliate-links.mjs）自己发。
 *
 * 两份签名规则都不是猜的，来自两家的官方 SDK 实现：
 *   · 京东  irebit/jingdong_union_go  sign.go + app.go
 *   · 淘宝  liuhengloveyou/go-top     top_client.go
 * 具体差异见 docs/AFFILIATE-API.md 第三节「签名与四个坑」。
 */
import { createHash } from 'node:crypto';

export function md5Upper(s) {
  return createHash('md5').update(s, 'utf8').digest('hex').toUpperCase();
}

/* ============ 京东联盟 ============ */

export const JD_GATEWAY = 'https://api.jd.com/routerjson';

/* 参数值的序列化必须和官方 SDK 的 GetString 逐条对齐：
   字符串原样、数字/布尔转字面量、对象/数组走 JSON。
   顺序无关（签名前会按 key 排序），但**每个值怎么变成字符串**必须一致，
   否则算出来的 sign 和服务端永远差一截。 */
export function jdValueString(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

/* sign = MD5( secret + Σ(key + value)按 key 字典序 + secret )，转大写。
   注意与前一代实现（本仓库 v29 的 --api 分支）的差别：
   后者按 appKey/materialId/timestamp 三项手写拼接，那不是 JOS 的协议 ——
   JOS 把业务参数整体塞进 360buy_param_json，签名针对的是**全部系统参数**
   加上这一串 JSON。旧写法从未跑通过（当时没有凭证，也就没暴露）。 */
export function jdSign(secret, params) {
  const keys = Object.keys(params)
    .filter((k) => k !== 'sign' && k !== 'access_token')
    .sort();
  let raw = secret;
  for (const k of keys) raw += k + jdValueString(params[k]);
  raw += secret;
  return md5Upper(raw);
}

/* 拼一次 JOS 请求的完整参数表（含 sign）。
   bizParams 是业务对象，会被 JSON.stringify 成 360buy_param_json。 */
export function buildJdParams({ appKey, secret, method, bizParams, timestamp }) {
  const params = {
    method,
    app_key: appKey,
    format: 'json',
    v: '1.0',
    sign_method: 'md5',
    timestamp,
    /* 键名以数字开头，必须加引号 */
    '360buy_param_json': JSON.stringify(bizParams),
  };
  params.sign = jdSign(secret, params);
  return params;
}

/* JOS 的响应把真正的业务数据塞进一个**字符串字段**里，键名随接口不同：
   查询类是 queryResult，转链类是 result。字段名还要把点换成下划线，
   以及官方那个拼错的 responce（不是 response）—— 三个都不一样，
   所以不能硬编码一次就完事。 */
export function unwrapJd(body, method) {
  if (!body || typeof body !== 'object') throw new Error('京东返回不是 JSON 对象');
  if (body.error_response) {
    const e = body.error_response;
    /* **优先用 en_desc，不用 zh_desc。** 实测（2026-11-03）：京东的网关声明
       `Content-Type: text/plain;charset=utf-8`，但 zh_desc 里混着 GBK 字节
       （`key=testkey ?????\xd0\xa7（解决方案参考…`），解码出来就是乱码；
       en_desc 是纯 ASCII，永远可读。两个都带上，方便肉眼对照。 */
    const zh = e.zh_desc ? ` / ${String(e.zh_desc).replace(/\uFFFD+/g, '?')}` : '';
    throw new Error(`京东错误 ${e.code || '?'}: ${e.en_desc || e.msg || '(无英文描述)'}${zh}`);
  }
  const key = `${method.replace(/\./g, '_')}_responce`;
  const node = body[key];
  if (!node) throw new Error(`京东返回里没有 ${key}`);
  const inner = node.result || node.queryResult;
  if (!inner) throw new Error(`${key} 里既没有 result 也没有 queryResult`);
  return typeof inner === 'string' ? JSON.parse(inner) : inner;
}

/* ============ 淘宝客 ============ */

export const TAOBAO_GATEWAY = 'https://gw.api.taobao.com/router/rest';

/* sign = MD5( secret + Σ(key + value)按 key 字典序 + secret )，转大写。
   与京东同构，但有两条淘宝独有的硬约束，写错只回 "invalid signature"：
     ① 空值参数必须**提前剔除** —— 传 q:'' 参与签名，服务端按"未传"处理；
     ② timestamp 必须是 GMT+8 的 "yyyy-MM-dd HH:mm:ss"，UTC 或 ISO8601 一律
        报 40001。剔除空值放在 buildTaobaoParams 里做，签名函数不管。 */
export function taobaoSign(secret, params) {
  const keys = Object.keys(params)
    .filter((k) => k !== 'sign')
    .sort();
  const raw = keys.map((k) => k + String(params[k])).join('');
  return md5Upper(secret + raw + secret);
}

export function buildTaobaoParams({ appKey, secret, method, biz, timestamp }) {
  const params = {
    method,
    app_key: appKey,
    format: 'json',
    v: '2.0',
    sign_method: 'md5',
    timestamp,
  };
  for (const [k, v] of Object.entries(biz || {})) {
    if (v === null || v === undefined || v === '') continue; // 见上文 ①
    params[k] = v;
  }
  params.sign = taobaoSign(secret, params);
  return params;
}

/* 淘宝的响应键还要**去掉开头的 `taobao.` 前缀**：
   method `taobao.tbk.dg.material.optional` → 键 `tbk_dg_material_optional_response`。
   京东则保留 `jd.`（`jd_union_open_goods_query_responce`），两家在这一处不一致，
   不能共用一个转换函数。 */
export function unwrapTaobao(body, method) {
  if (!body || typeof body !== 'object') throw new Error('淘宝返回不是 JSON 对象');
  if (body.error_response) {
    const e = body.error_response;
    throw new Error(
      `淘宝错误 ${e.code || '?'}: ${e.msg || ''}${e.sub_msg ? ' / ' + e.sub_msg : ''}`,
    );
  }
  const short = method.replace(/^taobao\./, '');
  const key = `${short.replace(/\./g, '_')}_response`;
  const node = body[key];
  if (!node) {
    const seen = Object.keys(body).join(', ') || '(空)';
    throw new Error(`淘宝返回里没有 ${key}，实际键：${seen}`);
  }
  return node;
}

/* ============ 时间戳 ============ */

/* 两家都要求 GMT+8 的 "yyyy-MM-dd HH:mm:ss"。
   本机时区是 Asia/Shanghai，直接取本地时间正好；但脚本可能在 CI 或别的
   时区里跑（本项目已有 GitHub Actions），所以显式按 UTC+8 算，
   不依赖运行环境的 TZ。 */
export function gmt8Timestamp(d = new Date()) {
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ` +
    `${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`
  );
}

/* ============ 匹配：关键词 → 某一瓶 ============
   这一步是「知道香水叫什么」到「知道它是哪个 SKU」的桥。
   它必须是确定性的、可解释的、宁缺毋滥的 —— 与项目里打分引擎同一条原则。
   宁可返回 0 条，也不许"猜一个看起来像的"。 */

const STOP = new Set([
  'eau', 'de', 'parfum', 'toilette', 'cologne', 'edp', 'edt', 'for', 'the',
  'and', 'men', 'women', 'man', 'woman', 'ml', 'spray', 'natural', 'sprüher',
]);

export function normalizeTokens(s) {
  return String(s || '')
    .toLowerCase()
    /* 中英混排：中文按单字切、英文按词切。中文单字会有噪音（"香""水"），
       但品牌名匹配主要靠英文/别名命中，中文只用于辅助加权。 */
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .flatMap((w) => (/[\u4e00-\u9fa5]/.test(w) ? [...w] : [w]));
}

/**
 * 给一个候选标题打分。返回 { score, brandHit, nameCover, reason }。
 *
 * 判据（写死在这里，方便以后复核为什么某条被拒）：
 *   · 品牌必须命中（英文品牌词落在标题里，或经由别名表命中中文品牌名）；
 *   · 名称覆盖率 ≥ 0.6（香名的主词在标题里出现大半）；
 *   · 两条都过才算 accept。
 * 品牌不命中直接 0 分 —— JD/淘宝的标题是中文居多的，没有别名表时
 * 覆盖率会很低，这是**事实**，见 docs/AFFILIATE-API.md 第六节。
 */
/* 品类词：商品标题里必须出现其一，才算"这是一瓶香水"。
   被 M10/M11 逼出来的 —— 实测 京东搜 "CREED Aventus" 第一名是
   「CREED【同价双11】全系列香皂150g AVENTUS」，品牌和香名双满分，
   但它是香皂。搜 "Dior Dune" 第一名是「烈艳蓝金口红」。
   只靠品牌+香名覆盖率，非香水商品能拿 1.0 分。 */
const PERFUME_WORDS = [
  '香水', '香氛', '淡香精', '浓香精', '淡香水', '古龙水', '香精',
  'edp', 'edt', 'eau de parfum', 'eau de toilette', 'parfum', 'cologne', 'perfume',
];

/* 反向品类词：出现这些就是别的东西，直接判死，哪怕同时含"香水"
   （京东标题爱写"香水沐浴露"、"香水洗衣液"）。 */
const NON_PERFUME_WORDS = [
  '香皂', '沐浴', '洗发', '护发', '洗手液', '身体乳', '护手霜', '润肤',
  '口红', '唇膏', '唇釉', '粉底', '眼影', '面膜', '精华', '面霜', '洁面',
  '牙膏', '纸巾', '抽纸', '洗衣液', '柔顺剂', '香薰蜡烛', '无火香薰', '车载香',
  '剃须', '须后', '除臭', '止汗', '驱蚊', '空气清新',
];

/* 小样/试用装：单价低、佣金少、点进去体验差，直接跳过。
   只认明确的小容量（1-5ml）和典型小样词，10ml 旅行装不禁。 */
const SAMPLE_PAT = /小样|试用装|分装|试管|体验装|\b[1-5]\s*ml\b/i;

/**
 * 判断标题所属品类是否合格。返回 { ok, reason }。
 * 这是 scoreMatch 的前置闸门，单独导出是为了能写用例钉住。
 */
export function categoryGate(title) {
  const t = String(title || '').toLowerCase();
  const bad = NON_PERFUME_WORDS.find((w) => t.includes(w));
  if (bad) return { ok: false, reason: `非香水品类（命中「${bad}」）` };
  if (SAMPLE_PAT.test(t)) return { ok: false, reason: '小样/试用装' };
  if (!PERFUME_WORDS.some((w) => t.includes(w))) return { ok: false, reason: '标题无香水品类词' };
  return { ok: true, reason: '' };
}

export function scoreMatch(perfume, title, aliasMap = {}) {
  const titleLower = String(title || '').toLowerCase();
  const titleTokens = new Set(normalizeTokens(title));

  const gate = categoryGate(title);
  if (!gate.ok) {
    return { score: 0, brandHit: false, nameCover: 0, accept: false, reason: gate.reason };
  }

  const brandRaw = String(perfume?.brand || '');
  const aliases = [brandRaw, ...(aliasMap[brandRaw] || [])];
  /* 中英两种命中方式必须分开判：
     · 拉丁品牌（Creed / Dior）按**整词**命中，避免 "Dior" 命中 "Diorama"；
     · 中文别名（信仰 / 迪奥）按**子串**命中 —— 中文没有空格，
       单字切分后 "迪奥" 会变成 "迪","奥" 两个 token，整词判据永远失败。
     这条区别是被 M3 用例逼出来的：只写整词判据时中文别名一个都用不上。 */
  const hitOne = (a) => {
    const s = String(a || '').trim().toLowerCase();
    if (!s) return false;
    if (/[\u4e00-\u9fa5]/.test(s)) return titleLower.includes(s);
    return normalizeTokens(s).some((t) => t.length > 1 && titleTokens.has(t));
  };
  const brandHit = aliases.some(hitOne);

  const nameTokens = normalizeTokens(perfume?.name || '').filter((t) => t.length > 1 || /[\u4e00-\u9fa5]/.test(t));
  const hit = nameTokens.filter((t) => titleTokens.has(t)).length;
  const nameCover = nameTokens.length ? hit / nameTokens.length : 0;

  const brandScore = brandHit ? 0.5 : 0;
  const score = brandScore + 0.5 * nameCover;
  const accept = brandHit && nameCover >= 0.6;

  let reason = '';
  if (!brandHit) reason = '品牌名未出现在标题里';
  else if (!accept) reason = `香名覆盖率 ${(nameCover * 100).toFixed(0)}% < 60%`;

  return { score: Number(score.toFixed(4)), brandHit, nameCover: Number(nameCover.toFixed(4)), accept, reason };
}

/* 从一组候选里挑最好的一个。并列时取标题更短的那个 —— 更短的标题通常
   是正装而不是"XX 同款小样"，但这不是承诺，只是排序偏好。 */
export function pickBest(perfume, candidates, aliasMap = {}) {
  let best = null;
  for (const c of candidates || []) {
    const m = scoreMatch(perfume, c.title, aliasMap);
    const row = { ...c, ...m };
    if (!best) { best = row; continue; }
    if (row.score > best.score) best = row;
    else if (row.score === best.score && String(row.title).length < String(best.title).length) best = row;
  }
  return best;
}
