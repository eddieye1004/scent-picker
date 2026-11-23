#!/usr/bin/env node
/**
 * gen-photo-gaps.mjs — 生成实物图缺口清单（batch-3 口径的可复用版）
 *
 * 口径（与 photos-gap-batch3.md / .json 完全一致，2026-11-17 第三批定下）：
 *   缺口 = data/perfumes.json 全量 − data/photos.json 已有图
 *   排序 = 有淘宝联盟链接（data/affiliate-links.json 的 taobao 表）者优先；
 *          组内按 popularityRank 升序；rank 为 null 的按 品牌+名称 字母序排在组尾
 *          （此口径已用 543 张基线精确复现 batch-3 的 100 瓶清单，100/100 一致）
 *   截取 = 前 --size 瓶为一批（第三批为 100）
 *
 * 用法：
 *   node scripts/gen-photo-gaps.mjs <batchNo> [--size 100] [--out docs/reports] [--notes <file.json>]
 *
 *   --notes  遗留瓶注记文件：{ "<id>": { "status": "rejected"|"skipped", "reason": "..." } }
 *            注记里的 id 必须全部落在本批清单内，否则报错退出 ——
 *            这是「上批被拒/跳过的瓶必须进下一批」这条规则的机器守门。
 *
 * 输出：<out>/photos-gap-batch<N>.md 与 .json（两份同数据）。
 * 只读 data/ 三个文件，不写 photos.json、不下载任何图。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const batchNo = Number(argv[0]);
if (!Number.isInteger(batchNo) || batchNo < 1) {
  console.error('用法：node scripts/gen-photo-gaps.mjs <batchNo> [--size 100] [--out docs/reports] [--notes <file.json>]');
  process.exit(2);
}
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const SIZE = Number(opt('--size', '100'));
const OUT = path.resolve(ROOT, opt('--out', 'docs/reports'));
const NOTES_PATH = opt('--notes', null);

const perfumes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/perfumes.json'), 'utf8')).perfumes;
const photos = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/photos.json'), 'utf8')).photos || {};
const taobao = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/affiliate-links.json'), 'utf8')).taobao || {};

const missing = perfumes.filter((p) => !photos[p.id]);
const hasTb = (p) => Boolean(taobao[p.id]);
const byRule = (a, b) =>
  (hasTb(b) - hasTb(a))
  || ((a.popularityRank == null) - (b.popularityRank == null))
  || ((a.popularityRank ?? 0) - (b.popularityRank ?? 0))
  || a.brand.localeCompare(b.brand)
  || a.name.localeCompare(b.name);
const sorted = [...missing].sort(byRule);
const batch = sorted.slice(0, SIZE);

let notes = {};
if (NOTES_PATH) {
  notes = JSON.parse(fs.readFileSync(path.resolve(NOTES_PATH), 'utf8'));
  const batchIds = new Set(batch.map((p) => p.id));
  const absent = Object.keys(notes).filter((id) => !batchIds.has(id));
  if (absent.length) {
    console.error(`注记里的 ${absent.length} 个 id 不在本批清单内（规则要求遗留瓶必须进批）：${absent.join(', ')}`);
    process.exit(1);
  }
}

const rows = batch.map((p) => ({
  id: p.id,
  brand: p.brand,
  name: p.name,
  concentration: p.concentrationLabelZh || '',
  taobao: hasTb(p),
  popularityRank: p.popularityRank ?? null,
  ...(notes[p.id] ? { carryover: notes[p.id].status, carryover_reason: notes[p.id].reason } : {}),
}));

const withTb = rows.filter((r) => r.taobao).length;
const rejected = rows.filter((r) => r.carryover === 'rejected');
const skipped = rows.filter((r) => r.carryover === 'skipped');
const today = new Date().toISOString().slice(0, 10);

const json = {
  generatedAt: today,
  batch_no: batchNo,
  batch_size: rows.length,
  rule: '缺口=perfumes.json−photos.json；有淘宝链接优先，组内按 popularityRank 升序，null rank 按品牌+名称字母序排组尾',
  missing_total: missing.length,
  missing_with_taobao: missing.filter(hasTb).length,
  composition: {
    with_taobao: withTb,
    without_taobao: rows.length - withTb,
    carryover_rejected: rejected.length,
    carryover_skipped: skipped.length,
  },
  batch: rows,
};

const md = [];
md.push(`# 实物图缺口清单 · 第${batchNo}批（${today}）`);
md.push('');
md.push(`现状：全库 ${perfumes.length} 瓶，已有图 ${Object.keys(photos).length} 瓶，缺图 ${missing.length} 瓶；其中带淘宝链接（可购买、优先补）缺图 ${missing.filter(hasTb).length} 瓶。`);
md.push(`本批 ${rows.length} 瓶：先补带淘宝链接的（${withTb} 瓶），其余 ${rows.length - withTb} 瓶为无链接长尾，按数据集热度排序。`);
md.push('排序口径同第三批：有淘宝链接优先 → popularityRank 升序 → rank 为 null 的按品牌+名称字母序排在组尾。');
md.push(`复算：\`node scripts/gen-photo-gaps.mjs ${batchNo} --size ${SIZE}${NOTES_PATH ? ` --notes ${path.relative(ROOT, path.resolve(NOTES_PATH)).split(path.sep).join('/')}` : ''}\``);
if (rejected.length || skipped.length) {
  md.push('');
  md.push(`## 上批遗留（${rejected.length + skipped.length} 瓶，必须本批补齐）`);
  md.push('');
  for (const r of [...rejected, ...skipped]) {
    md.push(`- **${r.id}**（上批${r.carryover === 'rejected' ? '驳回' : '跳过'}）：${r.carryover_reason}`);
  }
}
md.push('');
md.push('| # | id | 品牌 | 名称 | 浓度 | 淘宝链接 | 备注 |');
md.push('|---|---|---|---|---|---|---|');
rows.forEach((r, i) => {
  const note = r.carryover ? `上批${r.carryover === 'rejected' ? '驳回' : '跳过'}` : '';
  md.push(`| ${i + 1} | ${r.id} | ${r.brand} | ${r.name} | ${r.concentration} | ${r.taobao ? '有' : '无'} | ${note} |`);
});
md.push('');

fs.mkdirSync(OUT, { recursive: true });
const base = path.join(OUT, `photos-gap-batch${batchNo}`);
fs.writeFileSync(`${base}.json`, JSON.stringify(json, null, 1) + '\n', 'utf8');
fs.writeFileSync(`${base}.md`, md.join('\n'), 'utf8');

console.log(`缺图 ${missing.length}/${perfumes.length}，带链接缺图 ${missing.filter(hasTb).length}`);
console.log(`本批 ${rows.length} 瓶 = 带链接 ${withTb} + 无链接长尾 ${rows.length - withTb}；遗留驳回 ${rejected.length}、跳过 ${skipped.length}`);
console.log(`写入 ${path.relative(ROOT, base)}.md / .json`);