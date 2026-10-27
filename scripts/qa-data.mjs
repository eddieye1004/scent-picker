/**
 * qa-data.mjs — 数据质量体检（薄壳）
 * 用法: node scripts/qa-data.mjs
 *
 * 断言逻辑全部在 scripts/lib/qa-checks.mjs，这里只负责读文件、打印、设置退出码。
 * 抽出来的原因：负向测试要在同进程内调用同一套断言，验证它们真的会失败。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChecks } from './lib/qa-checks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8'));
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));
const outTxt = fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8');

// 上游原件（可能不存在）
const upstreamPath = path.join(ROOT, 'data', 'source', 'perfumes.upstream.jsonl');
let upstreamLines = null;
let upstreamFirst = null;
if (fs.existsSync(upstreamPath)) {
  const lines = fs.readFileSync(upstreamPath, 'utf8').split('\n').filter(Boolean);
  upstreamLines = lines.length;
  try { upstreamFirst = JSON.parse(lines[0]); } catch { upstreamFirst = null; }
}

const { issues, stats } = runChecks(D, T, { outTxt, upstreamLines, upstreamFirst });

console.log('===== 数据体检 =====');
console.log(`瓶数 ${stats.count} · 品牌 ${stats.brands} · 家族覆盖 ${JSON.stringify(stats.reach)}`);
console.log(`浓度分布 ${JSON.stringify(stats.conc)}`);
console.log(`源家族 ${stats.srcFamilyTypes} 类`);
console.log(`最大单一品牌 ${stats.topBrand[0]} ${stats.topBrand[1]} 瓶 (${(stats.topBrand[1] / stats.count * 100).toFixed(1)}%)`);
console.log(`数据快照 ${D.meta.sourceSnapshot} · 许可 ${D.meta.license}`);
console.log(`上游原件 ${upstreamLines ?? '缺失'} 行`);

const complianceChecks = 5; // description / 长句 / 行数 / 上游有描述 / 字段白名单
console.log(`合规断言 ${complianceChecks} 项已内置（见 lib/qa-checks.mjs 的 7b–7d）`);

console.log(issues.length === 0 ? '\n✓ 全部通过' : `\n✗ ${issues.length} 项问题:`);
issues.forEach((m) => console.log('  - ' + m));
process.exitCode = issues.length === 0 ? 0 : 1;
