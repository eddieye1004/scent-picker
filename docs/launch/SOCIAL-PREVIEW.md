# Social Preview 图（1280×640）

> 2026-11-12 · 用途：GitHub 仓库设置 → Social preview 上传位

## 文件

| 文件 | 说明 |
|---|---|
| `social-preview.png` | **成品，1280×640**，直接上传用 |
| `social-preview.html` | 源文件（1280×640 版式 + 内联 CSS） |

## 规格核对（实测）

```
node -e "const b=require('fs').readFileSync('docs/launch/social-preview.png');console.log(b.readUInt32BE(16),'x',b.readUInt32BE(20))"
→ 1280 x 640
```

GitHub 对 social preview 的建议尺寸就是 1280×640（2:1），小于 1MB。
实测 67KB，符合。

## 重出方法

```bash
# 1. 编辑 social-preview.html
# 2. 用 Playwright 以 deviceScaleFactor:1 截（用 2 会输出 2560×1280，尺寸就不对了）
node -e "
const path=require('path');const {createRequire}=require('module');
const req=createRequire(process.cwd()+'/x.js');
const PW=path.join(process.env.USERPROFILE,'.workbuddy','binaries','node','workspace','node_modules','playwright-core');
const {chromium}=req(PW);
const fs=require('fs');
const EDGE=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
(async()=>{
const b=await chromium.launch({executablePath:EDGE,headless:true});
const c=await b.newContext({viewport:{width:1280,height:640},deviceScaleFactor:1});
const p=await c.newPage();
await p.goto('file:///'+process.cwd().replace(/\\\\/g,'/')+'/docs/launch/social-preview.html',{waitUntil:'networkidle'});
await p.waitForTimeout(900);
await p.screenshot({path:'docs/launch/social-preview.png',clip:{x:0,y:0,width:1280,height:640}});
await b.close();
})();"
```

## 版式说明

视觉语言与站内同一套，不是另画一张海报：

| 元素 | 与站内的关系 |
|---|---|
| 暖纸底 `#FAF7F1` | 站内 `--bg`（`80-specimen.css` 的 `:root`） |
| 顶部墨色粗线 | 站内每屏页头的 `.masthead` 记号 |
| 衬线大标题 | 站内标题同一字体栈（Songti / NotoSC / Georgia） |
| 克莱因蓝 `#002FA7` | 站内唯一强调色（`--blue`），只用在「那一瓶」 |
| 四个数字 | `1388` 瓶库 / `8` 屏问卷 / `58` 个香调词 / `0` 次模型调用 —— 全部实测（见 `REPO-ABOUT.md` §5） |
| 右侧瓶形 | 同站内 `bottleArt()` 的方肩短颈结构，浅色液面 |

**为什么把「0 次模型调用」放进图里**：这是这个产品与「AI 推荐」类产品最大的区别，
也是唯一一个能用一句话说清、且可被验证的技术主张。

## 文字可读性

图上所有文字在缩到 640×320（GitHub 信息流实际显示尺寸）时仍需可读：

- 主标题 92px → 缩半后 46px，最粗，最稳
- 副标题 25px → 缩半后 12.5px，**刚好在可读线上**，所以副标题只用了一句两层
- 底部统计数字 34px → 17px，可读
- 统计标签 14px → 7px，**这个尺寸缩半后基本读不清**，只作为纹理存在，
  信息由数字本身承担（数字 + 数量单位已经在副标题里说过）

> 如果以后要投放到更小的显示位，建议把 4 个统计减到 2 个、标签字号提到 18px。
