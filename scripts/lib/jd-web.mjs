/**
 * 京东联盟「网页版批量转链」的纯逻辑部分。
 *
 * 为什么要有这个模块：京东联盟 API 对「导购媒体」账号是死路 ——
 * promotion.common.get 返回 `code 2001701 不支持siteId用于此种方式推广,只支持网站/APP`，
 * bysubunionid.get / byunionid.get 全是 `code 403 无访问权限`，权限申请没有网页入口，
 * 只能发邮件到 cps@jd.com。而网页版「批量推广 → 我要推广 → 导购媒体推广」
 * 能直接拿到带自己 promotionId 的短链，结果是一个 GBK 编码的 CSV。
 *
 * 于是把「解析 CSV」「从候选卡片里选目标」这两块做成纯函数，
 * 浏览器操作留在 scripts/fetch-jd-web.mjs。这样 CSV 格式一变，
 * 测试能立刻抓到，不用重跑浏览器。
 */

/**
 * 解析京东批量转链 CSV（GBK 解码后的字符串）。
 *
 * 实测格式（2026-11-03，51 行样本）：
 *   表头：商品名称,商品详情页URL,月销,单价,到手价,佣金比例,佣金,联盟推广链接,优惠券领取链接
 *   数据：伊利…礼盒装<TAB>,http://item.jd.com/3311987.html<TAB>,70000<TAB>,48.5,…,https://u.jd.com/e6TgEHR<TAB>,<TAB>,
 *
 * 每个字段尾部带一个 TAB，商品名里还可能本身含逗号 —— 所以不能用 split(',')。
 * 用正则从「,http://item.jd.com/」这个锚点往两边切。
 */
export function parseJdCsv(text) {
  const rows = [];
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = line.match(
      /^(.*?)[\t\s]*,[\t\s]*(https?:\/\/item\.jd\.com\/(\d+)\.html)[\t\s]*,[\t\s]*(\d+)[\t\s]*,[\t\s]*([\d.]+)[\t\s]*,[\t\s]*([\d.]+)[\t\s]*,[\t\s]*([\d.]+)[\t\s]*,[\t\s]*([\d.]+)[\t\s]*,[\t\s]*(https:\/\/u\.jd\.com\/\w+)?[\t\s]*,[\t\s]*(https:\/\/u\.jd\.com\/\w+)?/,
    );
    if (!m) continue;
    const [, rawTitle, itemUrl, skuId, sales, price, finalPrice, commissionRate, commission, shortUrl, couponUrl] = m;
    // 表头行也会被匹配（"商品名称,商品详情页URL..."里的 URL 不是 item.jd.com），所以这里再兜一层
    if (!skuId || !shortUrl) continue;
    rows.push({
      skuId,
      title: rawTitle.trim(),
      itemUrl,
      sales30d: Number(sales),
      price: Number(price),
      finalPrice: Number(finalPrice),
      commissionRate: Number(commissionRate),
      commission: Number(commission),
      shortUrl,
      couponUrl: couponUrl || null,
    });
  }
  return rows;
}

/**
 * 从「批量推广」请求体的材料列表里还原预期条目 —— 用来核对 CSV 有没有漏行。
 * 京东的接口是异步生成文件，偶尔少几行不会报错，所以要显式比对。
 */
export function diffBatch(expectedSkuIds, csvRows) {
  const got = new Set((csvRows || []).map((r) => String(r.skuId)));
  const missing = (expectedSkuIds || []).map(String).filter((id) => !got.has(id));
  return { expected: (expectedSkuIds || []).length, got: got.size, missing };
}

/** 批量推广单次上限。实测「已选 51/60」——不是 60 因为当前页只有 51 个可选。 */
export const BATCH_LIMIT = 60;
