#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
accept-photos.py — 实物图批次验收管线（batch-3 做法的可复用版）

整条管线的位置（本脚本只做第 3 步，前后各步都有现成脚本）：
  1. scripts/gen-photo-gaps.mjs      缺口清单（淘宝链接优先 → popularityRank）
  2. 找图腿交付 <id>.<ext> + manifest（id | 来源页面 | 实际像素 | 文件）
  3. scripts/accept-photos.py        本脚本：对账 + id 校验 + 判据 + 分辨率 + 报告/联系表
  4. 人工逐张目视（Muse）             定 驳回 / 跳过 / force 特批 —— 判据代替不了这一步
  5. scripts/build-photos.py batch   裁切 208×352 webp（特批走 manifest force:true）
  6. scripts/add-photos.mjs          接线进 data/photos.json
  7. test-render / test-scoring / test-contrast / test-compliance / qa-data

为什么第 4 步不可省（batch-3 实测）：96 张里 2 张判据通过但目视驳回
（ajmal-aurum-elixir 抠图绿边残留、armaf-miss-armaf-attitude 全周锯齿），
1 张判据拒收但目视特批（amouage-dia-woman 浅米色渐变底，u=0.824）。
所以本脚本的 auto_pass 只是「判据通过」，不是「验收入库」；
报告是给人看的输入，不是最终裁决。

本脚本对仓库**只读**：读 data/perfumes.json 与 data/photos.json 做校验，
不写 photos.json、不写 images/、不下载任何图。产出只有 --report 目录里的
报告与联系表。判据不在这里复刻 —— 直接调 scripts/build-photos.py check，
阈值永远只有一份（build-photos.py 顶部那组）。

用法：
  python scripts/accept-photos.py <交付文件夹> [--manifest FILE] [--report DIR]
                                [--sheet] [--force id1,id2] [--min-side 1000]

  --manifest   md（batch3-manifest.md 格式，含「跳过」区）或 json
               （[{id, source, pixels:[w,h], force, forced_because}]，跳过={id, skip:原因}）。
               不给则按文件夹里的 <id>.<ext> 自建清单，像素按文件实测。
  --report     报告输出目录（acceptance.json / acceptance.md；--sheet 再加联系表）
  --force      特批 id 列表（逗号分隔）。判据拒收但人已目视认定误杀时用，
               原拒收原因写进 forced_because，回执必须逐条点名（batch-2/3 既定机制）。
  --min-side   来源图长边下限（默认 1000）。低于线不自动拒 —— batch-3 有 10 张
               650–900px 的渠道最大原图带注记通过；这里只标 resolution_exception 供人裁决。

退出码：0 正常出报告；1 有硬伤（清单缺文件 / id 不在 perfumes.json / 重复 id /
        磁盘多出未登记图）；2 用法错误。判据拒收不算硬伤，是正常验收结果。
"""
import argparse
import json
import os
import re
import subprocess
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
KERNEL = os.path.join(ROOT, 'scripts', 'build-photos.py')
PY = sys.executable or 'python'
IMG_EXTS = {'.jpg', '.jpeg', '.png', '.webp'}
PIX_RE = re.compile(r'(\d{2,5})\s*[×xX*]\s*(\d{2,5})')
ID_RE = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)+$')


def load_repo():
    with open(os.path.join(ROOT, 'data/perfumes.json'), encoding='utf-8') as fh:
        perfumes = json.load(fh)['perfumes']
    with open(os.path.join(ROOT, 'data/photos.json'), encoding='utf-8') as fh:
        photos = json.load(fh).get('photos', {})
    return {p['id'] for p in perfumes}, set(photos.keys())


def scan_disk(folder):
    """交付文件夹里的 <id>.<ext>。下划线开头视为草稿（batch-3 的 _probe*.jpg），排除但留名。"""
    files, drafts = {}, []
    for name in sorted(os.listdir(folder)):
        ext = os.path.splitext(name)[1].lower()
        if ext not in IMG_EXTS or not os.path.isfile(os.path.join(folder, name)):
            continue
        if name.startswith('_'):
            drafts.append(name)
            continue
        stem = os.path.splitext(name)[0]
        if stem in files:
            files[stem] = None  # 同 id 多文件 → 重复，后面报硬伤
        else:
            files[stem] = os.path.join(folder, name)
    return files, drafts


def parse_manifest_md(path, perfume_ids, disk_ids):
    """batch3-manifest.md 格式：| # | id | 来源 URL | W×H | 文件名 |（3/4/5 列都认）。
    「跳过」区：- id：原因。同 id 多行时后行覆盖前行（第二轮补图覆盖第一轮）。"""
    entries, skips, overrides = {}, {}, 0
    in_skip = False
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            line = line.rstrip('\n')
            if line.startswith('#'):
                in_skip = '跳过' in line
                continue
            if in_skip:
                m = re.match(r'^-\s*([a-z0-9-]+)[：:]\s*(.+)$', line.strip())
                if m:
                    skips[m.group(1)] = m.group(2).strip()
                continue
            if not line.strip().startswith('|'):
                continue
            cells = [c.strip() for c in line.strip().strip('|').split('|')]
            if not cells or set(cells[0]) <= set('-: '):
                continue
            pid = next((c for c in cells if ID_RE.match(c) and (c in perfume_ids or c in disk_ids)), None)
            if not pid:
                continue  # 表头或无 id 行
            url = next((c for c in cells if c.startswith('http')), '')
            px = PIX_RE.search(line)
            fname = next((c for c in cells if os.path.splitext(c)[1].lower() in IMG_EXTS), '')
            if pid in entries:
                overrides += 1
            entries[pid] = {
                'id': pid, 'source': url,
                'pixels': [int(px.group(1)), int(px.group(2))] if px else None,
                'file': fname,
            }
    return entries, skips, overrides


def parse_manifest_json(path):
    entries, skips = {}, {}
    with open(path, encoding='utf-8') as fh:
        rows = json.load(fh)
    for r in rows:
        pid = r.get('id')
        if not pid:
            continue
        if r.get('skip'):
            skips[pid] = r['skip']
            continue
        px = r.get('pixels')
        if isinstance(px, str):
            m = PIX_RE.search(px)
            px = [int(m.group(1)), int(m.group(2))] if m else None
        entries[pid] = {
            'id': pid, 'source': r.get('source', ''), 'pixels': px,
            'file': r.get('file', ''),
            'force': bool(r.get('force')), 'forced_because': r.get('forced_because', ''),
        }
    return entries, skips, 0


def run_kernel(paths):
    """调 build-photos.py check（只算指标不写文件）。分块防命令行超长；
    整块失败时逐张重试，把坏文件隔离成 parse_failed 而不是炸掉整批。"""
    out = {}
    for i in range(0, len(paths), 200):
        chunk = paths[i:i + 200]
        r = subprocess.run([PY, KERNEL, 'check', *chunk], capture_output=True, text=True, encoding='utf-8')
        lines = [l for l in (r.stdout or '').splitlines() if l.startswith('{')]
        if r.returncode != 0 or len(lines) != len(chunk):
            for p in chunk:
                r1 = subprocess.run([PY, KERNEL, 'check', p], capture_output=True, text=True, encoding='utf-8')
                l1 = [l for l in (r1.stdout or '').splitlines() if l.startswith('{')]
                if r1.returncode == 0 and l1:
                    rec = json.loads(l1[0])
                    out[rec['file']] = rec
                else:
                    out[os.path.basename(p)] = {'file': os.path.basename(p), 'ok': False,
                                                'why': f'解析失败：{(r1.stderr or "").strip()[:200]}'}
        else:
            for l in lines:
                rec = json.loads(l)
                out[rec['file']] = rec
    return out


def make_sheet(records, folder, dst):
    """联系表：8 列缩略图 + id / u / L* / 判定，供人工逐张目视（batch-3 的 8 张联系表同款用途）。"""
    from PIL import Image, ImageDraw, ImageFont
    cols, cw, ih, lh = 8, 250, 300, 46
    rows = (len(records) + cols - 1) // cols
    canvas = Image.new('RGB', (cols * cw, rows * (ih + lh)), 'white')
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 13)
    except OSError:
        font = ImageFont.load_default()
    for i, rec in enumerate(records):
        cx, cy = (i % cols) * cw, (i // cols) * (ih + lh)
        path = os.path.join(folder, rec['disk_file']) if rec.get('disk_file') else None
        if path and os.path.isfile(path):
            im = Image.open(path).convert('RGB')
            im.thumbnail((cw - 16, ih - 10))
            canvas.paste(im, (cx + (cw - im.width) // 2, cy + (ih - im.height) // 2))
        verdict = rec['verdict']
        u = rec.get('border_uniform')
        lstar = rec.get('border_lstar')
        draw.text((cx + 6, cy + ih + 2), rec['id'][:34], fill='black', font=font)
        draw.text((cx + 6, cy + ih + 18),
                  f"u={u if u is not None else '?'} L*={lstar if lstar is not None else '?'} {verdict}",
                  fill={'auto_pass': '#1a7f37', 'forced_pass': '#9a6700', 'rejected_auto': '#cf222e'}.get(verdict, '#57606a'),
                  font=font)
    canvas.save(dst)


def main():
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument('folder')
    ap.add_argument('--manifest')
    ap.add_argument('--report')
    ap.add_argument('--sheet', action='store_true')
    ap.add_argument('--force', default='')
    ap.add_argument('--min-side', type=int, default=1000)
    ap.add_argument('-h', '--help', action='store_true')
    args = ap.parse_args()
    if args.help:
        print(__doc__)
        return 0
    folder = os.path.abspath(args.folder)
    if not os.path.isdir(folder):
        print(f'交付文件夹不存在：{folder}', file=sys.stderr)
        return 2
    if args.sheet and not args.report:
        print('--sheet 需要同时给 --report（联系表写进报告目录）', file=sys.stderr)
        return 2

    perfume_ids, photo_ids = load_repo()
    disk, drafts = scan_disk(folder)
    force_ids = {x.strip() for x in args.force.split(',') if x.strip()}

    overrides = 0
    if args.manifest:
        mp = os.path.abspath(args.manifest)
        if mp.lower().endswith('.json'):
            entries, skips, _ = parse_manifest_json(mp)
        else:
            entries, skips, overrides = parse_manifest_md(mp, perfume_ids, set(disk.keys()))
    else:
        entries = {pid: {'id': pid, 'source': '', 'pixels': None, 'file': os.path.basename(p)}
                   for pid, p in disk.items() if p}
        skips = {}

    # ---- 对账与校验（硬伤） ----
    problems = []
    dup_disk = [pid for pid, p in disk.items() if p is None]
    for pid in dup_disk:
        problems.append(f'{pid}：磁盘上同 id 多个图文件')
    unknown = sorted(set(entries) - perfume_ids)
    for pid in unknown:
        problems.append(f'{pid}：perfumes.json 里没有这个 id')
    missing_files = sorted(pid for pid in entries if pid not in skips and pid not in disk)
    for pid in missing_files:
        problems.append(f'{pid}：清单里有、磁盘上找不到图')
    registered = set(entries) | set(skips)
    extras = sorted(set(disk) - registered)
    for pid in extras:
        problems.append(f'{pid}：磁盘上有、清单里没登记（不许夹带）')
    for pid in sorted(force_ids - set(entries)):
        problems.append(f'{pid}：--force 指定了不在清单里的 id')

    # ---- 判据（只读）+ 分辨率 ----
    todo = [disk[pid] for pid in entries if pid in disk and disk[pid]]
    kernel = run_kernel(todo) if todo else {}
    records = []
    for pid in sorted(set(entries) | set(skips)):
        rec = {'id': pid}
        if pid in skips:
            rec.update(verdict='skipped', skip_reason=skips[pid])
            records.append(rec)
            continue
        ent = entries[pid]
        rec.update(source=ent.get('source', ''), manifest_pixels=ent.get('pixels'))
        if pid not in disk or not disk[pid]:
            rec.update(verdict='missing_file')
            records.append(rec)
            continue
        path = disk[pid]
        rec['disk_file'] = os.path.basename(path)
        k = kernel.get(os.path.basename(path), {'ok': False, 'why': '判据进程未返回该文件'})
        for key in ('border_uniform', 'border_lstar', 'hi_sat', 'fill', 'size'):
            if key in k:
                rec[key] = k[key]
        forced = pid in force_ids or ent.get('force')
        if k.get('ok'):
            rec['verdict'] = 'auto_pass'
        elif forced:
            rec['verdict'] = 'forced_pass'
            rec['forced_because'] = ent.get('forced_because') or k.get('why')
        else:
            rec['verdict'] = 'rejected_auto'
            rec['why'] = k.get('why')
        px = ent.get('pixels') or rec.get('size')
        if px and max(px) < args.min_side:
            rec['resolution_exception'] = f'长边 {max(px)} < {args.min_side}（需登记裁决，不自动拒）'
        if pid in photo_ids:
            rec['already_has_photo'] = True  # 替换已有图需另行批准，本批清单应全为新增
        records.append(rec)

    # ---- 汇总 ----
    by_verdict = {}
    for rec in records:
        by_verdict[rec['verdict']] = by_verdict.get(rec['verdict'], 0) + 1
    res_exc = [r for r in records if r.get('resolution_exception')]
    forced = [r for r in records if r['verdict'] == 'forced_pass']
    existing = [r for r in records if r.get('already_has_photo')]
    summary = {
        'delivery_folder': folder,
        'manifest': os.path.abspath(args.manifest) if args.manifest else None,
        'manifest_rows': len(entries), 'manifest_overrides': overrides,
        'disk_images': sum(1 for p in disk.values() if p), 'drafts_excluded': drafts,
        'skips_in_manifest': len(skips),
        'verdicts': by_verdict,
        'resolution_exceptions': len(res_exc),
        'forced': len(forced),
        'already_has_photo': len(existing),
        'hard_problems': problems,
        'note': 'auto_pass 只是判据通过；入库前必须人工逐张目视（batch-3 有 2 张判据过但目视驳回）。'
                '本脚本未写 photos.json、未写 images/。',
    }

    print(json.dumps(summary, ensure_ascii=False, indent=1))
    if args.report:
        rdir = os.path.abspath(args.report)
        os.makedirs(rdir, exist_ok=True)
        with open(os.path.join(rdir, 'acceptance.json'), 'w', encoding='utf-8') as fh:
            json.dump({'summary': summary, 'records': records}, fh, ensure_ascii=False, indent=1)
        md = ['# 实物图批次验收报告（判据层）', '',
              f"交付文件夹：`{folder}`", '',
              f"清单 {len(entries)} 瓶（覆盖重写 {overrides}）｜磁盘 {summary['disk_images']} 张｜跳过区 {len(skips)} 瓶｜草稿排除 {len(drafts)}", '',
              '| 判定 | 瓶数 |', '|---|---|']
        for v in ('auto_pass', 'forced_pass', 'rejected_auto', 'skipped', 'missing_file'):
            if by_verdict.get(v):
                md.append(f'| {v} | {by_verdict[v]} |')
        md += ['', f"分辨率例外（长边 < {args.min_side}）：{len(res_exc)} 瓶", '']
        for r in res_exc:
            md.append(f"- {r['id']}：{r['resolution_exception']}")
        if forced:
            md += ['', '## force 特批（回执必须逐条点名）', '']
            for r in forced:
                md.append(f"- {r['id']}：{r.get('forced_because', '')}")
        rej = [r for r in records if r['verdict'] == 'rejected_auto']
        if rej:
            md += ['', '## 判据拒收', '']
            for r in rej:
                md.append(f"- {r['id']}：{r.get('why', '')}")
        if problems:
            md += ['', '## 硬伤', ''] + [f'- {p}' for p in problems]
        md += ['', '> auto_pass ≠ 验收入库：请人工逐张目视后再走 build-photos.py batch + add-photos.mjs。', '']
        with open(os.path.join(rdir, 'acceptance.md'), 'w', encoding='utf-8') as fh:
            fh.write('\n'.join(md))
        if args.sheet:
            make_sheet([r for r in records if r.get('disk_file')], folder,
                       os.path.join(rdir, 'contact-sheet.png'))
        print(f'报告写入 {rdir}')

    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())