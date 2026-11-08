/**
 * 提交前自检：任何提交都必须能独立跑通。
 *
 * 起因（D48）：一次提交只提交了一半 —— app.js 的图标改名进了 git，
 * data/taxonomy.json 的 32→28 类留在工作区。结果是**仓库里那份 HEAD 跑不起来**：
 *
 *   $ git archive HEAD | tar -x -C /tmp/x && node scripts/test-render.mjs   （macOS/Linux）
 *   TypeError: MARKS[id] is not a function
 *
 * 而本地 `git status` 只显示 `M data/taxonomy.json`，看起来"还没提交完而已"；
 * 四套测试跑在工作区，全绿。这个失败模式在本地永远看不见，因为你看的都是工作区。
 *
 * 这个脚本把"干净导出 HEAD 再跑一遍"变成一条命令：
 *   node scripts/check-head.mjs
 *
 * 判据是「分开之后有没有任意一边跑不起来」——不是「哪个文件归哪一类」。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const NODE = process.execPath;

const SUITES = [
  ['test-render.mjs', 246],
  ['test-contrast.mjs', 42],
  ['test-scoring.mjs', 106],
  ['test-compliance.mjs', 10],
  ['test-union-api.mjs', 48],
  ['test-category-gate.mjs', 8],
  ['test-jd-web.mjs', 17],
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'head-check-'));
const exported = path.join(tmp, 'head');

try {
  fs.mkdirSync(exported, { recursive: true });

  /* 干净导出 HEAD（不含工作区改动、不含未跟踪文件）。
     不用外部 tar：Windows 的 bsdtar 收到带盘符的反斜杠路径会失败
     （实测 "Command failed: tar -x -f C:\Users\... -C C:\Users\..."）。
     改成先把 HEAD 的 blobs 全部列出来，再用 `git cat-file` 逐个取内容写盘 ——
     只依赖 git 本身，跨平台一致，也不必处理 tar 的路径转义。 */
  const listing = execFileSync('git', ['ls-tree', '-r', '-z', '--full-tree', 'HEAD'], {
    cwd: ROOT, maxBuffer: 64 * 1024 * 1024,
  }).toString('utf8');
  const entries = listing.split('\0').filter(Boolean).map((line) => {
    const [meta, name] = line.split('\t');
    const [, type, sha] = meta.split(' ');
    return { type, sha, name };
  }).filter((e) => e.type === 'blob');

  for (const e of entries) {
    const dest = path.join(exported, e.name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const buf = execFileSync('git', ['cat-file', 'blob', e.sha], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
    fs.writeFileSync(dest, buf);
  }

  const headSha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  console.log(`检查 HEAD (${headSha}) 的干净导出…\n`);

  let bad = 0;
  for (const [file, expectMin] of SUITES) {
    const p = path.join(exported, 'scripts', file);
    if (!fs.existsSync(p)) {
      console.log(`  ✗ ${file.padEnd(22)} 文件不存在`);
      bad += 1;
      continue;
    }
    let out = '';
    let crashed = null;
    try {
      out = execFileSync(NODE, [p], { cwd: exported, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      crashed = `${err.message.split('\n')[0]} ${(err.stderr || '').split('\n').find((l) => /Error|TypeError/.test(l)) || ''}`.trim();
      out = err.stdout || '';
    }
    const m = out.match(/PASS (\d+)\s+FAIL (\d+)/);
    if (!m) {
      console.log(`  ✗ ${file.padEnd(22)} 没跑出结果${crashed ? ' — ' + crashed : ''}`);
      bad += 1;
      continue;
    }
    const pass = Number(m[1]);
    const fail = Number(m[2]);
    const okCount = pass >= expectMin && fail === 0;
    if (!okCount) bad += 1;
    console.log(`  ${okCount ? '✓' : '✗'} ${file.padEnd(22)} PASS ${String(pass).padStart(3)}  FAIL ${fail}`
      + (pass < expectMin ? `  （断言数少于基线 ${expectMin}）` : ''));
  }

  console.log('');
  if (bad) {
    console.log(`✗ HEAD 有 ${bad} 套测试未通过 —— 不要在这个状态下提交或推送。`);
    console.log('  常见原因：一次改动拆成了两个提交，后一个还没进来。');
    process.exit(1);
  }
  console.log('✓ HEAD 干净导出四套测试全绿。');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
