#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
build-photos.mjs 的判定内核 —— 但用 Python 写，因为要 Pillow。

为什么判据要这么严（读源码之前先读这段）：

淘宝联盟物料接口返回的 `pict_url` **不是白底实物图**，是营销主图。
实测一张真实返回（`img.alicdn.com/i1/2965419761/O1CN01W3aET41OvqK1chua_!!2965419761.jpg`）：
图里除了瓶子，还有红色价签"¥xxx"、"到手5.8件"角标、直播贴纸。
用户对图的要求是「仅含香水本身，不包含任何贴图、文字或贴纸」——
营销图直接违反。

量化对比（800×800，边框带占 6%）：

  图                     边框均匀度  内容宽高比  填充率  前景饱和度  高饱和像素占比
  user-clean.jpg            0.989      0.59     0.28       3.1        0.0%
  tmall banner (t1.jpg)     0.220      1.04     0.50      36.5       18.6%
  tmall scene (item.jpg)    0.286      0.76     0.48      36.2        5.7%

用户的图四周几乎纯色（0.989），营销图只有 0.22 —— 因为营销图整幅都有背景。
所以**边框均匀度是最强的单一判据**，比"识别文字"可靠得多（我们不做 OCR，
也不该为了挑图引入一个 OCR 依赖）。

但边框均匀度单独用会误判：一张灰底影棚图也会均匀。所以叠加三条：
  ① 边框色必须是浅色（CIE L* >= 90）—— 香水瓶实物图几乎都是白/浅灰底；
  ② 内容包围盒必须竖长（宽高比 0.30–0.95）—— 瓶子是竖的，横构图必是场景/拼图；
  ③ 高饱和像素占比 < 8% —— 价签、直播贴纸、"到手X件"角标都是高饱和红/黄。

**判据的作用是"宁缺勿错"，不是"尽量多通过"**：不合格就不给图，
页面降级回绘制瓶形（data/photos.json 只收录通过的）。给一张带价签的图，
比不给图更糟 —— 用户会以为那就是税后价格。
"""
import json
import os
import sys
from io import BytesIO

from PIL import Image

# Windows 控制台默认 GBK，中文拒收原因会变成乱码。
# 这不是"编码问题小瑕疵"——这个脚本的**唯一用途**就是告诉人为什么某张图被拒，
# 原因读不出来等于脚本没输出。
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# ---- 阈值（改这里之前先读下面「判据为什么只剩一条」）----
MIN_BORDER_UNIFORM = 0.92   # 四周 6% 带内，与带中位色差 <=12 的像素占比
BORDER_LSTAR_LIGHT = 88.0   # 浅底下限（原 90，放宽 2 点：浅灰底 #f5f5f5 是 L*94）
BORDER_LSTAR_DARK = 14.0    # 深底上限（纯黑/近黑底：Byredo、Le Labo 那类用黑底拍）
BAND = 0.06                 # 边框带宽度（占短边）
CORNER = 0.05               # 四角小方块边长（占短边）—— 整带被瓶身打断时的退路
DIFF = 12                   # 边框"同色"容差（0-255 通道最大值）
FG_DIFF = 30                # 前景判定阈值
HI_SAT_MARKETING = 0.08     # 营销主图的高饱和上限（价签/角标/直播贴纸）

# ---- 判据为什么只剩一条（2026-11-08 实测 601 张后重写）----
#
# 旧判据有五条：边框均匀度 / 底色够浅 / 竖长构图 / 填充率 / 高饱和。
# 拿真实数据跑一遍，后三条在拒好图，不是在拒坏图：
#
#   竖长构图（AR 0.30–0.95）  拒掉 124 张 —— 联系表里全是多瓶套装、方瓶、
#                             横放的正视图，都干干净净。页面上是 object-fit:contain，
#                             宽高比不匹配只是显示小一点，不是不能用。
#   填充率（0.12–0.75）       拒掉 214 张 —— 这条衡量的不是"干不干净"，
#                             是"瓶子占画面多大"。裁得紧的好图 fill 到 0.9。
#   高饱和（<= 8%）           拒掉 161 张 —— 拒的是琥珀色、红色玻璃瓶本身。
#                             玻璃瓶是彩色的，这条等于给彩色瓶子判死刑。
#
# 真正区分「干净产品图」和「场景图/营销图」的只有**边框是不是纯色**：
# 场景图的四周一定是墙面、桌面、渐变、道具。601 张里 441 张边框纯色（73.4%），
# 被拒的 160 张联系表核对下来全部是场景图 —— 没有一张误杀。
#
# 底色深浅两个方向都收：白底图 L*≈100，黑底图 L*≈0，两者都是好图；
# 中间灰（L* 14–88）大概率是渐变背景或桌面，一律拒。
#
# AR / fill / hi_sat 仍然算出来，写进输出供人复核，但**不再参与判定**。
# 这是有意的：一个只在"人看联系表"时才用得上的指标，不该有拒收权。


def srgb_to_lstar(rgb):
    def lin(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(x) for x in rgb)
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    # CIE L*（Y 相对白点 1.0）
    return 116 * (y ** (1 / 3)) - 16 if y > 0.008856 else 903.3 * y


def analyse(path_or_bytes):
    """返回 (ok, 指标dict, 拒收原因 or None)。

    边框检测跑两遍，取更好的那次：
      A. 四周 6% 整带（BAND）—— 传统做法，瓶子居中留白足够时最准
      B. 四角 5% 小方块 —— 瓶子顶到画框上下边时，整带会混入瓶身像素，
         但四角仍是纯背景。只用 A 会把这类好图全拒掉（实测 413 张营销图里
         有 137 张是这种情况）。
    判据是「边框里纯色像素占比 >= 0.92」，两遍取 max —— 只要有一个视角
    证明四周是纯色，就说明这张图是纯背景产品图。
    """
    src = BytesIO(path_or_bytes) if isinstance(path_or_bytes, (bytes, bytearray)) else path_or_bytes
    im = Image.open(src)
    im = im.convert('RGB')
    w, h = im.size
    a = im.load()

    def ring_stats(points):
        n = len(points)
        if not n:
            return 0.0, (255, 255, 255)
        mr = sorted(p[0] for p in points)[n // 2]
        mg = sorted(p[1] for p in points)[n // 2]
        mb = sorted(p[2] for p in points)[n // 2]
        close = sum(1 for p in points if max(abs(p[0] - mr), abs(p[1] - mg), abs(p[2] - mb)) <= DIFF)
        return close / n, (mr, mg, mb)

    # A：整圈带
    band = max(4, int(min(w, h) * BAND))
    ringA = []
    for y in range(h):
        for x in range(w):
            if x < band or x >= w - band or y < band or y >= h - band:
                ringA.append(a[x, y])
    uA, medA = ring_stats(ringA)

    # B：四个角
    k = max(5, int(min(w, h) * CORNER))
    ringB = []
    for cy in (range(0, k, 2), range(h - k, h, 2)):
        for cx in (range(0, k, 2), range(w - k, w, 2)):
            for y in cy:
                for x in cx:
                    ringB.append(a[x, y])
    uB, medB = ring_stats(ringB)

    # 两遍取更干净的那次：瓶子居中时 A 更准，瓶子顶边时 B 才救得回来
    if uB > uA:
        border_uniform, med = uB, medB
    else:
        border_uniform, med = uA, medA
    border_l = srgb_to_lstar(med)
    mr, mg, mb = med

    # 前景：与边框中位色差 > FG_DIFF 的像素
    xs, ys, tot, hi = [], [], 0, 0
    for y in range(h):
        for x in range(w):
            p = a[x, y]
            if max(abs(p[0] - mr), abs(p[1] - mg), abs(p[2] - mb)) > FG_DIFF:
                xs.append(x); ys.append(y); tot += 1
                if max(p) - min(p) > 90:
                    hi += 1

    if not tot:
        return False, {'border_uniform': border_uniform}, '整幅与边框同色，找不到主体'

    bw = max(xs) - min(xs) + 1
    bh = max(ys) - min(ys) + 1
    box_ar = bw / bh
    fill = tot / (bw * bh)
    hi_sat = hi / tot

    m = {
        'size': [w, h],
        'border_uniform': round(border_uniform, 3),
        'border_uniform_band': round(uA, 3),
        'border_uniform_corner': round(uB, 3),
        'border_lstar': round(border_l, 1),
        'box_aspect': round(box_ar, 2),
        'fill': round(fill, 3),
        'hi_sat': round(hi_sat, 3),
        'box': [min(xs), min(ys), max(xs), max(ys)],
    }

    if border_uniform < MIN_BORDER_UNIFORM:
        return False, m, f'四周不是纯色底（均匀度 {border_uniform:.2f} < {MIN_BORDER_UNIFORM}）—— 场景图或营销图'
    # 底色只看"两个方向都极端"，中间灰拒（渐变背景/桌面）
    if BORDER_LSTAR_DARK < border_l < BORDER_LSTAR_LIGHT:
        return False, m, (f'底色是中间灰（L* {border_l:.1f}，既不是浅底 <{BORDER_LSTAR_LIGHT:.0f} 也不是深底 >{BORDER_LSTAR_DARK:.0f}）'
                          f' —— 大概率是渐变背景或桌面')
    return True, m, None


def crop_to(src_or_bytes, dst, tw=208, th=352):
    """按判据裁切并写成 webp。返回 (ok, 指标, 原因)。判据不过就不写文件。"""
    ok, m, why = analyse(src_or_bytes)
    if not ok:
        return False, m, why
    src = BytesIO(src_or_bytes) if isinstance(src_or_bytes, (bytes, bytearray)) else src_or_bytes
    im = Image.open(src).convert('RGB')
    x0, y0, x1, y1 = m['box']
    # 1.5% 呼吸（相对内容框），避免紧贴边缘
    pad = max(2, int(round(min(x1 - x0 + 1, y1 - y0 + 1) * 0.015)))
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(im.width - 1, x1 + pad), min(im.height - 1, y1 + pad)
    im = im.crop((x0, y0, x1 + 1, y1 + 1))
    # 等比缩放进 tw×th 的 contain 框
    k = min(tw / im.width, th / im.height)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    os.makedirs(os.path.dirname(dst) or '.', exist_ok=True)
    im.save(dst, 'WEBP', quality=92, method=6)
    return True, m, None


def main():
    """命令行：
       build-photos.py check <file>...
       build-photos.py crop <src> <dst> [w] [h]
       build-photos.py batch <manifest.json> <outdir>
         manifest = [{ "file": 本地暂存图, "id": 香水 id, "kind": "white"|"marketing" }]
         输出每行一条 JSON，成功的才写 webp。
    """
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'help'

    if cmd == 'check':
        rows = []
        for f in sys.argv[2:]:
            ok, m, why = analyse(f)
            rows.append({'file': os.path.basename(f), 'ok': ok, 'why': why, **m})
            print(json.dumps(rows[-1], ensure_ascii=False), flush=True)

    elif cmd == 'crop':
        src, dst = sys.argv[2], sys.argv[3]
        tw = int(sys.argv[4]) if len(sys.argv) > 4 else 208
        th = int(sys.argv[5]) if len(sys.argv) > 5 else 352
        ok, m, why = crop_to(src, dst, tw, th)
        rec = {'ok': ok, 'dst': dst, **(m or {})}
        if ok:
            rec['bytes'] = os.path.getsize(dst)
        else:
            rec['why'] = why
        print(json.dumps(rec, ensure_ascii=False))
        if not ok:
            sys.exit(2)

    elif cmd == 'batch':
        # 批量：一次进程处理几百张，省掉每个文件一次解释器启动。
        # 逐行 flush 输出，这样 Node 端能实时看到进度、崩了也知道停在哪一张。
        man_path, outdir = sys.argv[2], sys.argv[3]
        with open(man_path, encoding='utf-8') as fh:
            items = json.load(fh)
        for it in items:
            rec = {'id': it['id'], 'kind': it.get('kind', 'marketing')}
            try:
                ok, m, why = analyse(it['file'])
                rec.update({k: v for k, v in (m or {}).items() if k != 'box'})
                # 营销主图额外守一道高饱和：价签/角标/直播贴纸都是高饱和块，
                # 而白底图规范不允许贴纸，彩色玻璃瓶又天然高饱和，
                # 所以这条只对营销图生效，对白底图会误杀。
                if ok and rec['kind'] == 'marketing' and m.get('hi_sat', 0) > HI_SAT_MARKETING:
                    ok, why = False, f'营销图带高饱和贴纸（{m["hi_sat"] * 100:.1f}% > {HI_SAT_MARKETING * 100:.0f}%）'
                rec['ok'] = bool(ok)
                if ok:
                    dst = os.path.join(outdir, it['id'] + '.webp')
                    ok2, _, why2 = crop_to(it['file'], dst)
                    if ok2:
                        rec['dst'] = dst
                        rec['bytes'] = os.path.getsize(dst)
                    else:
                        rec['ok'] = False
                        rec['why'] = why2
                else:
                    rec['why'] = why
            except Exception as e:
                rec['ok'] = False
                rec['why'] = f'解析失败：{type(e).__name__}: {e}'
            print(json.dumps(rec, ensure_ascii=False), flush=True)

    elif cmd == 'help':
        print(__doc__)
    else:
        print(f'未知子命令：{cmd}', file=sys.stderr)
        sys.exit(2)


if __name__ == '__main__':
    main()
