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

**七道闸（每一条都是「漏交/漏检不会静默通过」，2026-11-18 复审后加）**
  ① 申报像素必须与实测一致 —— 清单写「实际像素」就必须是实测值，不符即拒
     （此前 px 直接采信申报值，--min-side 形同虚设）。低于 --min-side 只标
     resolution_exception 供人裁决，不自动拒（batch-3 有 12 张 650–900px 的
     渠道最大原图带注记通过）。
  ② --expected 给应交付清单（docs/reports/photos-gap-batch<N>.json）时做
     差集：应交付 −（清单 ∪ 跳过）非空 → 硬伤 + 非零退出，逐条点名缺失 id。
     不给 --expected 时 summary 里明确写 expected: null（不给就等于放弃这条闸）。
  ③ 清单里 id 拼错/不存在 → 显式报错并打印原文行号与原行，不再静默丢弃
     （此前拼错的 id 被丢掉，交付文件反而被误报成「夹带」）。
  ④ 跳过只对「清单内且磁盘上没有文件」的条目有效。磁盘上存在的图一律过判据；
     既挂跳过又交了图 → skipped_but_delivered 硬伤。磁盘上未登记的文件同样过判据
     （判据结果进记录），并保留「不许夹带」硬伤。
  ⑤ --force 只在图片真的量出判据指标后才生效，且逐条记录 id + 理由，
     报告头显式计数。量不出指标（坏文件）不能用 force 洗白。
  ⑥ --report 只能落在仓库内或同级的 .legs 目录，越界退出码 2；写盘走
     *.tmp + os.replace，不留半截报告。
  ⑦ --expected 的 gap json 里带 carryover=rejected 的瓶子（上批人工验收驳回），
     本批判据再通过也只判 needs_review，不判 auto_pass —— 判据从来没拒过
     batch-3 那 2 张（绿边在瓶底、锯齿在瓶身，都不在边框带上），只靠判据放行
     等于把人的裁决抹掉。needs_review 不是硬伤，是「必须再看一眼」。

用法：
  python scripts/accept-photos.py <交付文件夹> [--manifest FILE] [--report DIR]
                                [--expected GAP.json] [--sheet]
                                [--force id1,id2] [--min-side 1000]

  --manifest   md（batch3-manifest.md 格式，含「跳过」区）或 json
               （[{id, source, pixels:[w,h], force, forced_because}]，跳过={id, skip:原因}）。
               不给则按文件夹里的 <id>.<ext> 自建清单，像素按文件实测。
  --expected   应交付清单 json（gen-photo-gaps.mjs 产出的 photos-gap-batch<N>.json，
               取其 batch[].id；也接受纯 id 字符串数组）。给了就做缺失核对。
  --report     报告输出目录（acceptance.json / acceptance.md；--sheet 再加联系表）。
               只允许仓库内或 .legs 目录。
  --force      特批 id 列表（逗号分隔）。判据拒收但人已目视认定误杀时用，
               原拒收原因写进 forced_because，回执必须逐条点名（batch-2/3 既定机制）。
               只在图片量得出判据指标时生效。
  --min-side   来源图长边下限（默认 1000）。按**实测**长边判定，低于线不自动拒
               （batch-3 有 12 张 650–900px 的渠道最大原图带注记通过），
               这里只标 resolution_exception 供人裁决。

退出码：0 正常出报告；1 有硬伤（清单缺文件 / id 不在 perfumes.json / 重复 id /
        磁盘多出未登记图 / 申报像素与实测不符 / 应交付清单缺交 / 跳过却交了图 /
        force 用在量不出指标的图上）；2 用法错误（含报告路径越界）。
        判据拒收不算硬伤，是正常验收结果。
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
DATE_RE = re.compile(r'^\d{4}-\d{1,2}-\d{1,2}$')
# 报告只允许写进仓库内，或与仓库同级的 .legs（腿的落盘惯例目录）。
REPORT_ROOTS = [ROOT, os.path.join(os.path.dirname(ROOT), '.legs')]


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


def measure_size(path):
    """本地实测像素。判据内核也会给 size，但内核崩了/没 Pillow 时这里是独立来源。"""
    try:
        from PIL import Image
    except ImportError:
        return None
    try:
        with Image.open(path) as im:
            return [int(im.width), int(im.height)]
    except Exception:
        return None


def resolve_id_cell(cells):
    """结构化解出 id 列：第一个 ID 形态、且不是日期/URL/文件名的单元格。
    不再用「在 perfume_ids 里才算」过滤 —— 那样拼错的 id 会被静默丢掉。"""
    for c in cells:
        if not ID_RE.match(c) or DATE_RE.match(c):
            continue
        return c
    return None


def claim_pixels(cells):
    """申报像素只从单元格里取，不从整行扫 —— 避免 CDN 路径里的 _800x800.jpg 冒充申报值。"""
    for c in cells:
        if c.startswith('http') or os.path.splitext(c)[1].lower() in IMG_EXTS:
            continue
        m = PIX_RE.search(c)
        if m:
            return [int(m.group(1)), int(m.group(2))]
    return None


def parse_manifest_md(path, perfume_ids, disk_ids):
    """batch3-manifest.md 格式：| # | id | 来源 URL | W×H | 文件名 |（3/4/5 列都认）。
    「跳过」区：- id：原因。同 id 多行时后行覆盖前行（第二轮补图覆盖第一轮）。
    返回 (entries, skips, overrides, bad_rows)；bad_rows = [(行号, 原行, 解出的 id)]，
    调用方必须把它们变成硬伤，不许静默丢弃。"""
    entries, skips, overrides = {}, {}, 0
    bad_rows = []
    in_skip = False
    with open(path, encoding='utf-8') as fh:
        for lineno, raw in enumerate(fh, 1):
            line = raw.rstrip('\n')
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
            pid = resolve_id_cell(cells)
            if not pid:
                continue  # 表头或无 id 形态的行
            url = next((c for c in cells if c.startswith('http')), '')
            fname = next((c for c in cells if os.path.splitext(c)[1].lower() in IMG_EXTS), '')
            if pid not in perfume_ids and pid not in disk_ids:
                # 拼错或已下架的 id：记下来交给调用方报错，绝不静默丢弃。
                bad_rows.append((lineno, line.strip(), pid))
            if pid in entries:
                overrides += 1
            entries[pid] = {
                'id': pid, 'source': url,
                'pixels': claim_pixels(cells),
                'file': fname,
            }
    return entries, skips, overrides, bad_rows


def parse_manifest_json(path):
    entries, skips, bad_rows = {}, {}, []
    with open(path, encoding='utf-8') as fh:
        rows = json.load(fh)
    if isinstance(rows, dict):
        rows = rows.get('photos') or rows.get('items') or rows.get('entries') or []
    for i, r in enumerate(rows, 1):
        if not isinstance(r, dict):
            bad_rows.append((i, json.dumps(r, ensure_ascii=False)[:200], ''))
            continue
        pid = r.get('id')
        if not pid or not isinstance(pid, str):
            bad_rows.append((i, json.dumps(r, ensure_ascii=False)[:200], ''))
            continue
        if r.get('skip'):
            skips[pid] = r['skip']
            continue
        px = r.get('pixels')
        if isinstance(px, str):
            m = PIX_RE.search(px)
            px = [int(m.group(1)), int(m.group(2))] if m else None
        elif isinstance(px, (list, tuple)) and len(px) == 2:
            try:
                px = [int(px[0]), int(px[1])]
            except (TypeError, ValueError):
                px = None
        else:
            px = None
        entries[pid] = {
            'id': pid, 'source': r.get('source', ''), 'pixels': px,
            'file': r.get('file', ''),
            'force': bool(r.get('force')), 'forced_because': r.get('forced_because', ''),
        }
    return entries, skips, bad_rows


def load_expected(path):
    """应交付清单：gen-photo-gaps.mjs 的 photos-gap-batch<N>.json（取 batch[].id），
    也接受纯 id 数组或 {ids:[...]}。
    返回 (ids_set, 原始条数, carryover)：carryover = {id: 'rejected'|'skipped'|...}，
    来自 gap json 的 carryover 字段 —— 上批人工验收驳回的瓶子，本批必须重新目视，
    不许因为「判据又过了」就自动放行（判据从来没拒过它们，是人拒的）。"""
    with open(path, encoding='utf-8') as fh:
        data = json.load(fh)
    if isinstance(data, dict):
        rows = data.get('batch') or data.get('ids') or data.get('missing') or []
    else:
        rows = data
    ids, carryover = set(), {}
    for r in rows:
        if isinstance(r, str):
            ids.add(r)
        elif isinstance(r, dict) and r.get('id'):
            ids.add(r['id'])
            if r.get('carryover'):
                carryover[r['id']] = r['carryover']
    return ids, len(rows), carryover


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
            with Image.open(path) as src:
                im = src.convert('RGB')
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


def write_atomic(path, text):
    """先写 *.tmp 再 os.replace：中途崩了也不会留下半截报告覆盖旧报告。"""
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        fh.write(text)
    os.replace(tmp, path)


def report_dir_allowed(rdir):
    n = os.path.normcase(os.path.normpath(os.path.abspath(rdir)))
    for base in REPORT_ROOTS:
        b = os.path.normcase(os.path.normpath(os.path.abspath(base)))
        if n == b or n.startswith(b + os.sep):
            return True
    return False


def usage_text():
    return ('用法：python scripts/accept-photos.py <交付文件夹> [--manifest FILE] [--report DIR]\n'
            '                                     [--expected GAP.json] [--sheet]\n'
            '                                     [--force id1,id2] [--min-side 1000]\n'
            '  -h / --help 打印完整说明。缺少 <交付文件夹> 时退 2。')


def main():
    ap = argparse.ArgumentParser(add_help=False)
    # folder 设为可选，只为了让 -h/--help 能真的打出来（此前 argparse 先因缺 folder 报错，
    # 下面那段 print(__doc__) 是不可达的死代码）。缺 folder 时仍按用法错误退 2。
    ap.add_argument('folder', nargs='?')
    ap.add_argument('--manifest')
    ap.add_argument('--report')
    ap.add_argument('--expected')
    ap.add_argument('--sheet', action='store_true')
    ap.add_argument('--force', default='')
    ap.add_argument('--min-side', type=int, default=1000)
    ap.add_argument('-h', '--help', action='store_true')
    args = ap.parse_args()
    if args.help:
        print(__doc__)
        return 0
    if not args.folder:
        print(usage_text(), file=sys.stderr)
        return 2
    folder = os.path.abspath(args.folder)
    if not os.path.isdir(folder):
        print(f'交付文件夹不存在：{folder}', file=sys.stderr)
        return 2
    if args.sheet and not args.report:
        print('--sheet 需要同时给 --report（联系表写进报告目录）', file=sys.stderr)
        return 2
    if args.report and not report_dir_allowed(args.report):
        print(f'--report 只允许写进仓库（{ROOT}）或同级 .legs 目录：{os.path.abspath(args.report)}', file=sys.stderr)
        return 2

    perfume_ids, photo_ids = load_repo()
    disk, drafts = scan_disk(folder)
    force_ids = {x.strip() for x in args.force.split(',') if x.strip()}

    overrides = 0
    bad_rows = []
    if args.manifest:
        mp = os.path.abspath(args.manifest)
        if not os.path.isfile(mp):
            print(f'清单文件不存在：{mp}', file=sys.stderr)
            return 2
        if mp.lower().endswith('.json'):
            entries, skips, bad_rows = parse_manifest_json(mp)
        else:
            entries, skips, overrides, bad_rows = parse_manifest_md(mp, perfume_ids, set(disk.keys()))
    else:
        entries = {pid: {'id': pid, 'source': '', 'pixels': None, 'file': os.path.basename(p)}
                   for pid, p in disk.items() if p}
        skips = {}

    expected, expected_rows, carryover = (None, 0, {})
    if args.expected:
        ep = os.path.abspath(args.expected)
        if not os.path.isfile(ep):
            print(f'应交付清单不存在：{ep}', file=sys.stderr)
            return 2
        expected, expected_rows, carryover = load_expected(ep)

    # ---- 对账与校验（硬伤） ----
    problems = []
    dup_disk = [pid for pid, p in disk.items() if p is None]
    for pid in dup_disk:
        problems.append(f'{pid}：磁盘上同 id 多个图文件')
    bad_row_ids = {pid for _, _, pid in bad_rows if pid}
    for lineno, text, pid in bad_rows:
        tail = f'（解出的 id：{pid}）' if pid else ''
        problems.append(f'清单第 {lineno} 行 id 对不上 perfumes.json / 磁盘文件{tail}：原文 `{text}`')
    unknown = sorted(set(entries) - perfume_ids - bad_row_ids)
    for pid in unknown:
        problems.append(f'{pid}：perfumes.json 里没有这个 id')
    bad_skips = sorted(sid for sid in skips if sid not in perfume_ids and sid not in bad_row_ids)
    for sid in bad_skips:
        problems.append(f'跳过区 id 对不上 perfumes.json：{sid}（原文理由：{skips[sid][:60]}）')
    missing_files = sorted(pid for pid in entries
                           if pid not in skips and pid not in disk and pid not in bad_row_ids)
    for pid in missing_files:
        problems.append(f'{pid}：清单里有、磁盘上找不到图')
    # 拼错行里点到的文件名：磁盘上那个真实文件是「对不上的 id」的另一半证据，
    # 不再二次扣成「夹带」—— 否则同一处缺陷被报两次，且第二次指错方向。
    typo_files = {os.path.splitext(os.path.basename(e.get('file') or ''))[0]
                  for pid, e in entries.items() if pid in bad_row_ids and e.get('file')}
    registered = set(entries) | set(skips)
    extras = sorted(pid for pid in set(disk) - registered if pid not in typo_files)
    for pid in extras:
        problems.append(f'{pid}：磁盘上有、清单里没登记（不许夹带）')
    for pid in sorted(force_ids - set(entries)):
        problems.append(f'{pid}：--force 指定了不在清单里的 id')
    # 跳过只能是「清单内且磁盘上没有文件」的条目。
    skipped_but_delivered = sorted(pid for pid in skips if pid in disk and disk[pid])
    for pid in skipped_but_delivered:
        problems.append(f'{pid}：挂了跳过、但磁盘上有这张图 —— 仍在跑判据，跳过不生效（不许用跳过绕检）')
    # 应交付清单核对：清单缺交 = 无声漏交，必须非零退出。
    missing_expected = []
    not_in_expected = []
    if expected is not None:
        declared = set(entries) | set(skips) | set(disk)
        missing_expected = sorted(expected - declared)
        if missing_expected:
            problems.append(f'应交付清单缺交 {len(missing_expected)} 瓶：' + '、'.join(missing_expected))
        for sid in sorted(sid for sid in skips if sid not in expected):
            problems.append(f'{sid}：跳过项不在应交付清单里')
        not_in_expected = sorted(declared - expected)

    # ---- 判据（只读）+ 像素核对 + 分辨率 ----
    # 磁盘上的图**全部**过判据（含未登记/挂跳过的），跳过只影响它是否算「已交」。
    todo = [p for p in disk.values() if p]
    kernel = run_kernel(todo) if todo else {}
    records = []
    pixel_mismatch = []
    carryover_rejected = []
    for pid in sorted(set(entries) | set(skips) | set(disk)):
        rec = {'id': pid}
        ent = entries.get(pid, {'id': pid, 'source': '', 'pixels': None, 'file': ''})
        rec.update(source=ent.get('source', ''), manifest_pixels=ent.get('pixels'))
        on_disk = bool(disk.get(pid))
        if pid in skips and not on_disk:
            rec.update(verdict='skipped', skip_reason=skips[pid])
            records.append(rec)
            continue
        if pid in skips and on_disk:
            rec['skip_reason'] = skips[pid]
            rec['skipped_but_delivered'] = True
        if not on_disk:
            rec.update(verdict='missing_file')
            records.append(rec)
            continue
        path = disk[pid]
        rec['disk_file'] = os.path.basename(path)
        k = kernel.get(os.path.basename(path), {'ok': False, 'why': '判据进程未返回该文件'})
        for key in ('border_uniform', 'border_lstar', 'hi_sat', 'fill', 'size'):
            if key in k:
                rec[key] = k[key]
        measured = k.get('size') or measure_size(path)
        if measured:
            rec['size'] = [int(measured[0]), int(measured[1])]
        # ① 申报像素必须等于实测像素（docstring 说的是「实际像素」，不符就是假报）。
        claim = ent.get('pixels')
        if claim and measured and (int(claim[0]), int(claim[1])) != (int(measured[0]), int(measured[1])):
            rec['verdict'] = 'rejected_auto'
            rec['why'] = f'申报像素 {claim[0]}×{claim[1]} 与实测 {measured[0]}×{measured[1]} 不符'
            pixel_mismatch.append(pid)
            problems.append(f'{pid}：申报像素 {claim[0]}×{claim[1]} ≠ 实测 {measured[0]}×{measured[1]}（申报值必须实测）')
        else:
            # ⑤ force 只在真量出判据指标后才生效；量不出指标（坏图）不许洗白。
            metrics_ok = k.get('border_uniform') is not None
            forced = bool(pid in force_ids or ent.get('force'))
            if forced and not metrics_ok:
                forced = False
                problems.append(f'{pid}：force 未生效 —— 图片量不出判据指标（{str(k.get("why"))[:80]}）')
            if k.get('ok'):
                rec['verdict'] = 'auto_pass'
            elif forced:
                rec['verdict'] = 'forced_pass'
                rec['forced_because'] = ent.get('forced_because') or k.get('why')
            else:
                rec['verdict'] = 'rejected_auto'
                rec['why'] = k.get('why')
        side = rec.get('size') or (measured if measured else claim)
        if side and max(side) < args.min_side:
            rec['resolution_exception'] = f'长边 {max(side)} < {args.min_side}（需登记裁决，不自动拒）'
        # 上批人工驳回的瓶子：判据过了也不算数，必须重新目视。
        # 判据从来没拒过 batch-3 那 2 张（绿边残留、全周锯齿都在瓶身上，不在边框带上），
        # 只靠判据放行等于把人的裁决抹掉。
        if carryover.get(pid) == 'rejected':
            rec['carryover_rejected'] = True
            if rec['verdict'] in ('auto_pass', 'forced_pass'):
                rec['verdict'] = 'needs_review'
                rec['why'] = '上批人工验收已驳回，本批须重新目视确认修复（判据通过不等于修复）'
                carryover_rejected.append(pid)
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
        'expected': os.path.abspath(args.expected) if args.expected else None,
        'expected_count': expected_rows if expected is not None else None,
        'manifest_rows': len(entries), 'manifest_overrides': overrides,
        'disk_images': len(todo), 'drafts_excluded': drafts,
        'skips_in_manifest': len(skips),
        'missing_from_expected': missing_expected,
        'not_in_expected': not_in_expected,
        'manifest_rows_unparsed': [{'line': ln, 'text': tx, 'id': pid} for ln, tx, pid in bad_rows],
        'skipped_but_delivered': skipped_but_delivered,
        'pixel_mismatch': pixel_mismatch,
        'carryover_rejected': carryover_rejected,
        'verdicts': by_verdict,
        'resolution_exceptions': len(res_exc),
        'forced': len(forced),
        'forced_ids': [{'id': r['id'], 'because': r.get('forced_because') or ''} for r in forced],
        'already_has_photo': len(existing),
        'hard_problems': problems,
        'note': 'auto_pass 只是判据通过；入库前必须人工逐张目视（batch-3 有 2 张判据过但目视驳回）。'
                '本脚本未写 photos.json、未写 images/。'
                + ('' if expected is not None else ' 未给 --expected，应交付清单核对这道闸没生效。'),
    }

    print(json.dumps(summary, ensure_ascii=False, indent=1))
    if args.report:
        rdir = os.path.abspath(args.report)
        os.makedirs(rdir, exist_ok=True)
        write_atomic(os.path.join(rdir, 'acceptance.json'),
                     json.dumps({'summary': summary, 'records': records}, ensure_ascii=False, indent=1))
        head = (f"清单 {len(entries)} 瓶（覆盖重写 {overrides}）｜磁盘 {summary['disk_images']} 张"
                f"｜跳过区 {len(skips)} 瓶｜草稿排除 {len(drafts)}｜force 特批 {len(forced)} 条"
                f"｜硬伤 {len(problems)} 条")
        md = ['# 实物图批次验收报告（判据层）', '',
              f"交付文件夹：`{folder}`", '',
              head, '']
        if expected is not None:
            md += [f"应交付清单：`{summary['expected']}`（{expected_rows} 瓶）"
                   f"｜已交 {len(set(entries) | set(skips) | set(disk))} 瓶"
                   f"｜缺交 {len(missing_expected)} 瓶", '']
            if missing_expected:
                md += ['### 缺交（应交付清单里有、清单/磁盘都没有）', '']
                md += [f'- {pid}' for pid in missing_expected] + ['']
            if not_in_expected:
                md += ['### 交了但不在应交付清单里', ''] + [f'- {pid}' for pid in not_in_expected] + ['']
        md += ['| 判定 | 瓶数 |', '|---|---|']
        for v in ('auto_pass', 'forced_pass', 'needs_review', 'rejected_auto', 'skipped', 'missing_file'):
            if by_verdict.get(v):
                md.append(f'| {v} | {by_verdict[v]} |')
        md += ['', f"分辨率例外（长边 < {args.min_side}）：{len(res_exc)} 瓶", '']
        for r in res_exc:
            md.append(f"- {r['id']}：{r['resolution_exception']}")
        if carryover_rejected:
            md += ['', f'## 上批驳回、本批须重新目视（{len(carryover_rejected)} 瓶）', '']
            for pid in carryover_rejected:
                md.append(f'- {pid}：判据通过不算修复，请看原值与原图后逐张裁决')
        if forced:
            md += ['', f'## force 特批（{len(forced)} 条，回执必须逐条点名）', '']
            for r in forced:
                md.append(f"- {r['id']}：{r.get('forced_because', '')}")
        rej = [r for r in records if r['verdict'] == 'rejected_auto']
        if rej:
            md += ['', '## 判据拒收', '']
            for r in rej:
                md.append(f"- {r['id']}：{r.get('why', '')}")
        if problems:
            md += ['', f'## 硬伤（{len(problems)} 条）', ''] + [f'- {p}' for p in problems]
        md += ['', '> auto_pass ≠ 验收入库：请人工逐张目视后再走 build-photos.py batch + add-photos.mjs。', '']
        write_atomic(os.path.join(rdir, 'acceptance.md'), '\n'.join(md))
        if args.sheet:
            make_sheet([r for r in records if r.get('disk_file')], folder,
                       os.path.join(rdir, 'contact-sheet.png'))
        print(f'报告写入 {rdir}')

    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
