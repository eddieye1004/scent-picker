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
  /* v7 第 3 步删两屏（emotion / wanted）+ 预算屏搬末屏后重标定：294 → 334。
     删掉 18 条随屏消失的屏内断言（A 段）+ 12 条 L2 注释保留的 wanted 断言，
     新增顺序/计数/梯子断言（K3 底噪契约 1 条、末屏顺序 2 条、预算末屏前置 1 条）并
     把 ②⑤⑥⑦⑧ 五段的屏号改成派生。只改这一个数字，其余六套与 GOLD 段不动。
     ---- 2026-11-23 心仪清单 L2：334 → 351 ----
     新增 17 条结果页 ♡ 的**结构**断言（♡ 在瓶名行、不在页脚、h3 在前、
     初始空心、aria 语义、点一下变实心、再点回空心、提示挂 body 且是单例、
     两句提示文案）。存储语义不在这里测 —— 那是 test-wishlist-ui 的活。 */
  /* L3（2026-11-23）：351 → 365。新增 14 条清单页渲染结构断言（档案区入口带计数、
     点入口进清单页、空态三件套不白屏、空清单不渲染空列表、返回能回结果页、
     toast 的「在香水档案里看」是可点按钮）。Five 要素判据在 test-wishlist-page。 */
  ['test-render.mjs', 365],
  ['test-contrast.mjs', 42],
  ['test-scoring.mjs', 153],
  ['test-compliance.mjs', 10],
  ['test-union-api.mjs', 76],
  ['test-category-gate.mjs', 10],
  ['test-jd-web.mjs', 17],
  /* 心仪清单 L1 数据层（纯数据、无 DOM、无网络、时间源注入 → 可复算）。 */
  ['test-wishlist.mjs', 96],
  /* 心仪清单 L2 结果页入口：纯逻辑（存/删/满额/降级）+ 接线与产物守卫。
     不 import app.js（那是 test-render 的活），所以跑得比渲染套件快一个量级。 */
  ['test-wishlist-ui.mjs', 92],
  /* 心仪清单 L3 清单页：行解析（五要素 / 没数据就不显示 / 查不到也出行）+
     空态与满额与降级的判据 + 清空两段式与撤销状态机 + 接线与产物守卫。 */
  ['test-wishlist-page.mjs', 115],
];

/* 金标准套件走另一套判据：它报的是命中率，不是断言条数。
 *   GOLD MAJORITY a/12 STRICT b/12
 * 最低接受值 = CONTROL.md 基线（2/12 与 4/12）；低于它说明这次改动把引擎改差了。
 * 与 SUITES 分开，是因为 "PASS 2 FAIL 10" 会被读成「十个画像是错的」，
 * 而实际含义是「十二个画像里过了两个」—— 同一串数字，两种含义，不能混。 */
const GOLD = { file: 'test-gold.mjs', minMajority: 2, minStrict: 4, total: 12 };

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

  /* 金标准：命中率不许低于 CONTROL.md 记录的基线 */
  {
    const p = path.join(exported, 'scripts', GOLD.file);
    if (!fs.existsSync(p)) {
      console.log(`  ✗ ${GOLD.file.padEnd(22)} 文件不存在`);
      bad += 1;
    } else {
      let out = '';
      let crashed = null;
      try {
        out = execFileSync(NODE, [p], { cwd: exported, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (err) {
        crashed = `${err.message.split('\n')[0]}`.trim();
        out = err.stdout || '';
      }
      const m = out.match(/GOLD MAJORITY (\d+)\/(\d+) STRICT (\d+)\/(\d+)/);
      if (!m) {
        console.log(`  ✗ ${GOLD.file.padEnd(22)} 没跑出结果${crashed ? ' — ' + crashed : ''}`);
        bad += 1;
      } else {
        const maj = Number(m[1]);
        const str = Number(m[3]);
        const okGold = maj >= GOLD.minMajority && str >= GOLD.minStrict;
        if (!okGold) bad += 1;
        console.log(`  ${okGold ? '✓' : '✗'} ${GOLD.file.padEnd(22)} GOLD MAJ ${maj}/${GOLD.total}  STRICT ${str}/${GOLD.total}`
          + (okGold ? '' : `  （低于基线 ${GOLD.minMajority}/${GOLD.total} 与 ${GOLD.minStrict}/${GOLD.total}）`));
      }
    }
  }

  console.log('');
  if (bad) {
    console.log(`✗ HEAD 有 ${bad} 套测试未通过 —— 不要在这个状态下提交或推送。`);
    console.log('  常见原因：一次改动拆成了两个提交，后一个还没进来。');
    process.exit(1);
  }
  console.log(`✓ HEAD 干净导出 ${SUITES.length} 套测试 + 金标准 全绿。`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
