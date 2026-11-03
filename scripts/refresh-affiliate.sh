#!/usr/bin/env bash
# refresh-affiliate.sh — 权限到手后的一条命令流水线
#
# 为什么要有这个脚本：整条链有四步，每一步的产物是下一步的输入，
# 中间任何一步漏跑都会得到"看起来成功但数据没变"的结果
# （例如只跑 fetch 没跑 merge，affiliate-links.json 一条都不会多）。
# 把顺序固化成脚本，比记四条命令可靠。
#
# 用法：
#   bash scripts/refresh-affiliate.sh           # 全量（1388 瓶，约 20-40 分钟）
#   bash scripts/refresh-affiliate.sh 20        # 只前 20 瓶，验证用
#   bash scripts/refresh-affiliate.sh 20 --dry  # 只看会写什么
#
# 凭证只从环境变量读，脚本里不出现任何密钥：
#   TB_APP_KEY / TB_APP_SECRET / TB_ADZONE_ID
#   JD_UNION_KEY / JD_UNION_SECRET / JD_UNION_PID（可选）
set -euo pipefail
cd "$(dirname "$0")/.."

NODE="${NODE:-F:/deepseek/resources/runtime/primary-runtime/dependencies/node/bin/node.exe}"
PY="${PY:-/f/python.exe}"

LIMIT="${1:-}"
EXTRA="${2:-}"

if [ -n "$LIMIT" ] && ! [ "$LIMIT" -eq "$LIMIT" ] 2>/dev/null; then
  EXTRA="$LIMIT"; LIMIT=""
fi

LIMIT_ARG=""
[ -n "$LIMIT" ] && LIMIT_ARG="--limit $LIMIT"

echo "== 1/4 取候选（联盟开放平台）=="
"$NODE" scripts/fetch-products.mjs --taobao $LIMIT_ARG $EXTRA

echo
echo "== 2/4 合并候选（链接 + 主图 URL）=="
"$NODE" scripts/merge-product-candidates.mjs $EXTRA

echo
echo "== 3/4 生成公开链接表 =="
"$NODE" scripts/gen-affiliate-links.mjs

echo
echo "== 4/4 统计 =="
"$NODE" -e '
const fs = require("fs");
const read = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const perf = read("data/perfumes.json", { perfumes: [] }).perfumes || [];
const links = read("data/affiliate-links.json", { taobao: {}, jd: {} });
const imgs = read("data/product-images.source.json", { taobao: {} });
const photos = read("data/photos.json", { photos: {} });
const t = Object.keys(links.taobao || {}).length;
const j = Object.keys(links.jd || {}).length;
console.log("  库容        " + perf.length);
console.log("  淘宝链接    " + t + " / " + perf.length + "  (" + (t / perf.length * 100).toFixed(1) + "%)");
console.log("  京东链接    " + j + " / " + perf.length + "  (" + (j / perf.length * 100).toFixed(1) + "%)");
console.log("  待处理主图  " + Object.keys(imgs.taobao || {}).length);
console.log("  已入库照片  " + Object.keys(photos.photos || {}).length);
'
echo
echo "下一步（可选）：把主图 URL 逐张过判据 + 裁切"
echo "  $PY scripts/build-photos.py fetch        # 下载并筛（尚未实现批量模式）"
echo "  单张：$PY scripts/build-photos.py check <url-or-file>"
