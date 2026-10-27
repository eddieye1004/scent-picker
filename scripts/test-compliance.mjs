/**
 * _negative-test.mjs — 验证合规断言真的会失败
 *
 * 一个从不失败的测试等于没有测试。这里在内存里注入违规（不写盘），
 * 直接调用 runChecks，确认每条断言都能抓住对应的问题。
 *
 * 为什么不用子进程：本机沙箱禁止 child_process 的 stdio:'pipe'，
 * execFileSync 拿不到任何输出。改同进程调用，同时消除了"测试改坏真实数据"的风险。
 *
 * 用法: node scripts/_negative-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChecks } from './lib/qa-checks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const baseD = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'perfumes.json'), 'utf8'));
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'taxonomy.json'), 'utf8'));

const upstreamPath = path.join(ROOT, 'data', 'source', 'perfumes.upstream.jsonl');
const upstreamText = fs.readFileSync(upstreamPath, 'utf8');
const upstreamRawLines = upstreamText.split('\n').filter(Boolean);
const upstreamLines = upstreamRawLines.length;
const upstreamFirst = JSON.parse(upstreamRawLines[0]);

// 深拷贝，避免污染基线
const clone = (o) => JSON.parse(JSON.stringify(o));

const cases = [
  {
    name: '注入 description 字段（违反 COMPLIANCE 第三节）',
    build: () => {
      const d = clone(baseD);
      d.perfumes[0].description = 'A lovely floral scent that opens bright and settles warm.';
      return d;
    },
    expect: 'description 字段',
  },
  {
    name: '注入表达性长句但换个字段名（测 60 字符正则兜底）',
    build: () => {
      const d = clone(baseD);
      d.perfumes[1].marketing_copy =
        'Lavender and orange blossom are joined by a clean musk accord giving a herbal floral contrast.';
      return d;
    },
    expect: '连续英文',
  },
  {
    name: '删掉某瓶 attribution（违反 CC BY 4.0 署名义务）',
    build: () => {
      const d = clone(baseD);
      delete d.perfumes[2].attribution;
      return d;
    },
    expect: 'attribution',
  },
  {
    name: '清空某瓶前调（三调承诺无法兑现）',
    build: () => {
      const d = clone(baseD);
      d.perfumes[3].top = [];
      return d;
    },
    expect: '三调为空',
  },
  {
    name: '上游原件行数不对（数据管线不可复现）',
    build: () => clone(baseD),
    optsOverride: { upstreamLines: 999 },
    expect: '上游原件行数',
  },
  {
    name: '上游首条无 description（证明"丢弃描述"无从谈起）',
    build: () => clone(baseD),
    optsOverride: { upstreamFirst: { id: 'x' } },
    expect: '上游首条无 description',
  },
  {
    name: 'families 权重越界（>1）',
    build: () => {
      const d = clone(baseD);
      d.perfumes[5].families = { floral: 1.5 };
      return d;
    },
    expect: '权重越界',
  },
  {
    name: 'id 重复',
    build: () => {
      const d = clone(baseD);
      d.perfumes[6].id = d.perfumes[5].id;
      return d;
    },
    expect: 'id 有重复',
  },
  {
    name: '单一品牌占比过高（看似 200 瓶实则同一牌子）',
    build: () => {
      const d = clone(baseD);
      d.perfumes.forEach((p) => { p.brand = 'SameBrand'; });
      return d;
    },
    expect: '单一品牌占比过高',
  },
];

let pass = 0;
let fail = 0;

console.log('===== 负向测试：确认每条断言都能真的失败 =====\n');

for (const c of cases) {
  const d = c.build();
  const opts = {
    outTxt: JSON.stringify(d, null, 2),
    upstreamLines,
    upstreamFirst,
    ...(c.optsOverride || {}),
  };
  const { issues } = runChecks(d, T, opts);
  const caught = issues.some((m) => m.includes(c.expect));
  if (caught) {
    console.log(`  PASS  抓住: ${c.name}`);
    pass++;
  } else {
    console.log(`  FAIL  漏检: ${c.name}`);
    console.log(`        期望包含 "${c.expect}"，实际 issues: ${issues.length ? issues.join(' | ') : '(空)'}`);
    fail++;
  }
}

// 基线必须全绿（否则说明断言本身有假阳性）
const baseline = runChecks(baseD, T, {
  outTxt: JSON.stringify(baseD, null, 2),
  upstreamLines,
  upstreamFirst,
});
if (baseline.issues.length === 0) {
  console.log('\n  PASS  基线（未篡改数据）全部通过，断言无假阳性');
  pass++;
} else {
  console.log('\n  FAIL  基线就有问题，断言存在假阳性:');
  baseline.issues.forEach((m) => console.log('        - ' + m));
  fail++;
}

console.log(`\n===== 结果 =====\nPASS ${pass}   FAIL ${fail}`);
process.exitCode = fail === 0 ? 0 : 1;
