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
     toast 的「在香水档案里看」是可点按钮）。Five 要素判据在 test-wishlist-page。
     ---- 2026-11-23 试香盖章：365 → 415（+50）----
     新增「试香盖章」整段：档案每瓶一个盖章位、五档面板两段式（点开不落记录）、
     五档文案逐字、单选组语义、保存后落盘形状、chip 显示最近一次 +「共 N 次」、
     重复盖章计数 +1、撤销两级、取消不改记录、同一行只开一个面板、
     盖高档位不自动加心仪、存储不可用的降级提示。
     ---- 2026-11-23 盖章入口补到心仪清单每行：415 → 441（+26）----
     新增「清单行盖章入口」整段（跑在档案段之前，因为档案段结尾会装一份写不进
     的存储、盖章会话一旦降级就不再回头）：清单每行一个盖章位、未盖只留入口不带
     chip、点开就是本体那五档、保存后行内出 chip 且文案与档案侧逐字相同、
     查不到的瓶子不给入口、清单侧撤销后两处同步消失。 */
  ['test-render.mjs', 574],

  /* ---- 2026-11-24 合并标定：主线 441 + B 腿季节情境句 30 + C 腿盘心图标 23
     + 避雷锚点 6 = 500，合并树实测 PASS 500 / FAIL 0。下面是冻结线各腿的增量记录。
  334 → 364（2026-11-23 B 腿：季节屏情境句）。+8 条渲染路径断言：
  情境句存在且唯一 / 上屏那句等于 seasonScene 的返回值 / 逐字等于季节表那一格
  （春与冬各一条）/ 换季跟着换 / 没有方向时退回该季 desc / 恢复方向后回到原句。
  +0 条既有断言被动 —— 那 8 条全部是新增，没有一条替换旧断言。
  注：这里刻意不读仓库外的定版 md —— check-head 把 HEAD 干净导出到临时目录再跑，
  那边读不到本机路径，断言会退化成"只有本机能绿"的假门（D48 类）。
  「与 md 逐字一致」由 scripts/verify-season-copy.mjs 单独守。

  364 → 387（2026-11-23 C 腿：盘心大类图标，方向 B）。+23 条：
  三态各一组（选中出现 / 切换跟随 / 取消恢复，共 9 条）、盘心徽记与标本互斥
  2 条、has-emblem 类 2 条、图元数与 24×24 视框 2 条、渐变 id 实例后缀 1 条、
  资产自检 7 条（映射不缺格 / 不多余 / 文件都在磁盘 / title 与族名逐字相同 /
  图元数够 / 带渐变）。
  +0 条既有断言被动。

  387 → 393（2026-11-24 qoder/avoid-capsule：避雷屏「已选方向」锚点）。+6 条：
  锚点恰好在位 1 / 名字与圆盘选择同源 1 / 族名只进 aria-label（无术语底线）1 /
  方向图标存在且是 svg 1 / 排在卡片墙之前 1 / 不是可点控件（div+tabindex=-1）1。
  +0 条既有断言被动 —— 锚点是纯展示节点，三态与出题逻辑一行未改。

  509 → 518（2026-11-26 leg5：浓淡屏改版为波纹场 + 原生滑杆）。+9 条净增：
  场景图整块 aria-hidden、人形剪影 + 三圈波纹且无 button 2 条；
  滑杆原生语义（type/min/max/step、初值、aria-valuetext 白话）3 条；
  刻度五档文案与不进 tab 序 2 条；读数白话不写 3/5、灰字「大致对应」2 条；
  旧扩散场结构不复活 1 条；点刻度跳档、波纹半径随档位、input 路径同步 3 条；
  ② 「按香水类型筛选」标题与档位 2 条；切换浓度类型不清空其他答案 3 条。
  旧扩散场（同心环/命中按钮/留香行）的 11 条断言被替换。 */
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
  /* 试香盖章数据层（2026-11-23）：五档逐档存取回读、重复盖章计数、
     撤销退回上一次的真实值、上限 200、身份键归一化、坏数据单条丢弃、
     三种存储不可用的降级、与档案键互不干扰。纯数据层，最快的一套。 */
  ['test-stamp.mjs', 118],
  /* 试香盖章 UI 层：五档文案与四句提示、展示模型只给最近一次 + 共 N 次、
     会话的内存兜底、以及「盖章不联动心仪 / 不写档案键 / 不参与打分」三条接线守卫。 */
  ['test-stamp-ui.mjs', 90],
  /* 盖章入口补到心仪清单每行（2026-11-23）：身份键同源（清单侧与档案侧算出
     同一个键）、同一条记录跨两个视图读写（盖/撤销两侧同步）、降级仍读同一份
     介质、上限与五档口径未被新入口改动、以及"只有一份实现"的源码守卫
     （一个 stampPanel、一个 stampSlot、清单行调的就是它）。 */
  ['test-stamp-wishlist.mjs', 44],
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
