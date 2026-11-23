/**
 * src/share-card.js — 结果页分享卡片的绘制层
 *
 * 完全是 canvas 2D 的纯绘制：不加载图片、不发请求、不读 DOM，
 * 所以画布永远不会被跨域像素污染，PNG 可以在任何浏览器里直接下载。
 *
 * 两种色值都是页面已在用的暖纸/暖墨（浅色主题那一套）：
 * 卡片本身是一张"可打印的标本标签"，不跟随页面深色模式反相 ——
 * 用户发出去的是同一张纸，不会因为对方手机是深色就变成黑底白字。
 */
export const SHARE_W = 1080;
export const SHARE_H = 1620;

const C = {
  paper: '#FAF7F1',
  ink: '#14120E',
  ink2: '#3A362F',
  ink3: '#5E584E',
  line: '#DED6C8',
  hair: '#C9C0B0',
  accent: '#002FA7',
};

/* 字体栈与页面同一套（DECISIONS D71：中文 webfont 已退场，CJK 走系统黑体）。
   canvas 的 font 只认「字体族名列表」，不能引用 CSS 变量，所以这里再写一遍 ——
   改页面栈时这两行要跟着改，否则导出的 PNG 与屏幕上看到的不一致。 */
const SANS = '"InterVar", "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';
const SERIF = '"Cambria", "Georgia", "Times New Roman", "Songti SC", "Noto Serif SC", serif';
const MONO = '"Cascadia Mono", "Consolas", "SFMono-Regular", "PingFang SC", monospace';

/** 把理由压成"一句"：去掉警告标记，取第一个句号前的部分，过长再截。 */
export function summarizeReason(text, max = 72) {
  const clean = String(text == null ? '' : text)
    .replace(/^⚠️\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  let first = clean.split(/[。！？!?]/)[0].trim() || clean;
  /* 打分层偶尔会把同一条命中写两遍（"含你点名的 A、A"）。
     发出去的卡片上重复一遍中文短语很显眼，这里按顿号段去重；
     只有多段时才动，单段理由原样保留。 */
  const parts = first.split('、');
  if (parts.length > 1) {
    const kept = [];
    for (const p of parts) {
      const k = p.trim();
      if (kept.some((x) => x === k || x.endsWith(k))) continue;
      kept.push(k);
    }
    first = kept.join('、');
  }
  const chars = Array.from(first);
  return chars.length > max ? chars.slice(0, max).join('') + '…' : first;
}

/**
 * 只从已有字段取值，不新算任何东西 —— PNG 里的三瓶名和理由必须与
 * 页面上那张摘要卡完全一致，否则用户会对不上自己刚看到的结果。
 */
export function buildShareModel({ profile = {}, results = [], budgetZh = null } = {}) {
  const bits = [
    profile.emotionZh,
    budgetZh,
    profile.occasionZh,
    profile.intensity != null ? `浓郁度 ${profile.intensity}/5` : null,
  ].filter(Boolean);
  return {
    kicker: 'SCENT PROFILE',
    title: '我的三瓶候选',
    answers: bits.join(' · '),
    items: (Array.isArray(results) ? results : []).slice(0, 3).map((r, i) => {
      const p = (r && r.perfume) || {};
      return {
        rank: String(i + 1).padStart(2, '0'),
        name: String(p.name || '').trim(),
        brand: String(p.brand || '').trim(),
        reason: summarizeReason(r && r.reasons && r.reasons[0]),
      };
    }).filter((x) => x.name),
    foot: '这 3 瓶从 1388 瓶里按规则打分选出，没让大模型插手',
  };
}

/** 按字符切行，同时尽量不把英文单词从中间劈开。 */
function wrapLines(ctx, text, maxWidth) {
  const tokens = String(text || '').match(/[A-Za-z0-9][A-Za-z0-9'’._-]*|\s+|[\s\S]/gu) || [];
  const lines = [];
  let line = '';
  const widthOf = (s) => (ctx.measureText ? ctx.measureText(s).width : Array.from(s).length * 18);
  for (const tok of tokens) {
    const next = line + tok;
    if (line && widthOf(next) > maxWidth) {
      lines.push(line.trimEnd());
      line = tok.trimStart();
    } else {
      line = next;
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

/** 切行后只保留前 maxLines 行；被截断时在末行加省略号（不会把整词切掉半截再续行）。 */
function clipLines(ctx, text, maxWidth, maxLines) {
  const lines = wrapLines(ctx, text, maxWidth);
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines && shown.length) {
    const widthOf = (s) => (ctx.measureText ? ctx.measureText(s).width : Array.from(s).length * 18);
    let last = shown[shown.length - 1];
    while (last && widthOf(last + '…') > maxWidth) last = last.slice(0, -1);
    shown[shown.length - 1] = last + '…';
  }
  return shown;
}

function drawLines(ctx, lines, x, y, lineHeight) {
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

function rule(ctx, x1, y, x2, color = C.line, width = 1) {
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

/**
 * 在给定 2D 上下文里画完整张卡。尺寸参数默认就是 1080×1620，
 * 传别的尺寸会按同一套边距比例缩放，测试里可以用小画布验证调用序列。
 */
export function drawShareCard(ctx, model, w = SHARE_W, h = SHARE_H) {
  const scale = Math.min(w / SHARE_W, h / SHARE_H);
  const S = (n) => Math.round(n * scale);
  const M = S(88);
  const innerW = w - M * 2;

  ctx.save();
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, w, h);

  /* 顶部一条粗墨线：与页面 masthead 的 8px 顶线同源，截图/打印都认得出。 */
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, w, S(14));

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  ctx.fillStyle = C.ink3;
  ctx.font = `${S(22)}px ${MONO}`;
  ctx.fillText(model.kicker || 'SCENT PROFILE', M, S(138));

  ctx.fillStyle = C.ink;
  ctx.font = `${S(64)}px ${SERIF}`;
  ctx.fillText(model.title || '我的三瓶候选', M, S(224));

  /* 答案行正常一行放下；极少数长组合（上限预算 + 长场合）会顶到右边线，
     这里把字号往下收一档，而不是折行去挤下面那条粗线。 */
  const answers = String(model.answers || '');
  const widthOf = (s) => (ctx.measureText ? ctx.measureText(s).width : Array.from(s).length * (S(26) * 0.6));
  let answerSize = S(26);
  ctx.font = `${answerSize}px ${SANS}`;
  while (answerSize > S(19) && widthOf(answers) > innerW) {
    answerSize -= S(2);
    ctx.font = `${answerSize}px ${SANS}`;
  }
  ctx.fillStyle = C.ink3;
  ctx.fillText(answers, M, S(286));

  rule(ctx, M, S(342), w - M, C.hair, Math.max(1, S(1)));

  /* ==== v2：1 瓶主推 + 2 瓶备选 ====
     结果本来就按匹配度排好：第 1 瓶是主推，第 2/3 瓶是备选。
     主推给一块标本签底板（暖白 + 左侧主蓝条 + 上下发丝线）。
     层级靠字号、颜色与「间距分组」：
       品名 54 衬线墨色 > 理由 27 墨色二级 > 品牌 23 灰色（贴住品名，算同一个名字块）；
     底板高度跟着内容走，1 行名与 2 行名不再共用 420px，
     理由末尾不会悬在一大片空底板上。只用 fillRect / 线，不引新依赖。 */
  const items = Array.isArray(model.items) ? model.items : [];
  const primary = items[0] || null;
  const alternates = items.slice(1);
  const px = M + S(46);
  const pw = innerW - S(92);
  const panelY = S(372);
  let panelBottom = panelY + S(340);

  if (primary) {
    ctx.font = `${S(54)}px ${SERIF}`;
    const nameLines = clipLines(ctx, primary.name, pw, 2);
    let brandLines = [];
    if (primary.brand) {
      ctx.font = `${S(23)}px ${SANS}`;
      brandLines = clipLines(ctx, primary.brand, pw, 1);
    }
    let reasonLines = [];
    if (primary.reason) {
      ctx.font = `${S(27)}px ${SANS}`;
      reasonLines = clipLines(ctx, primary.reason, pw, 3);
    }

    const nameY = panelY + S(150);
    const nameBottom = nameY + (nameLines.length - 1) * S(62);
    const brandY = nameBottom + S(58);
    const reasonY = brandLines.length ? brandY + S(56) : nameBottom + S(56);
    const reasonBottom = reasonY + Math.max(0, reasonLines.length - 1) * S(43);
    const panelH = Math.max(S(320), Math.min(S(540), reasonBottom + S(54) - panelY));
    panelBottom = panelY + panelH;

    ctx.fillStyle = '#FFFCF6';
    ctx.fillRect(M, panelY, innerW, panelH);
    ctx.fillStyle = C.accent;
    ctx.fillRect(M, panelY, S(6), panelH);
    rule(ctx, M, panelY, w - M, C.hair, Math.max(1, S(1)));
    rule(ctx, M, panelBottom, w - M, C.hair, Math.max(1, S(1)));

    ctx.fillStyle = C.accent;
    ctx.font = `${S(22)}px ${MONO}`;
    ctx.fillText(`主推 · ${primary.rank || '01'}`, px, panelY + S(72));

    ctx.fillStyle = C.ink;
    ctx.font = `${S(54)}px ${SERIF}`;
    drawLines(ctx, nameLines, px, nameY, S(62));

    if (brandLines.length) {
      ctx.fillStyle = C.ink3;
      ctx.font = `${S(23)}px ${SANS}`;
      drawLines(ctx, brandLines, px, brandY, S(30));
    }
    if (reasonLines.length) {
      ctx.fillStyle = C.ink2;
      ctx.font = `${S(27)}px ${SANS}`;
      drawLines(ctx, reasonLines, px, reasonY, S(43));
    }
  }

  const footTopMax = h - S(150);
  let contentBottom = panelBottom;

  if (alternates.length) {
    const labelY = panelBottom + S(108);
    ctx.fillStyle = C.ink3;
    ctx.font = `${S(20)}px ${MONO}`;
    ctx.fillText(alternates.length > 1 ? '备选 · 另外两瓶' : '备选', M, labelY);
    rule(ctx, M, labelY + S(24), w - M, C.line, Math.max(1, S(1)));

    /* 备选块先量高度再落位：条与条之间用固定 120px 的呼吸位，
       页脚则跟着内容走（见下方 footTop），不让空白全堆在最后一条和页脚之间。 */
    const textX2 = M + S(84);
    const textW2 = innerW - S(84);
    const blocks = alternates.map((item) => {
      let nameLines = [];
      if (item.name) {
        ctx.font = `${S(34)}px ${SERIF}`;
        nameLines = clipLines(ctx, item.name, textW2, 1);
      }
      let brandLines = [];
      if (item.brand) {
        ctx.font = `${S(21)}px ${SANS}`;
        brandLines = clipLines(ctx, item.brand, textW2, 1);
      }
      let reasonLines = [];
      if (item.reason) {
        ctx.font = `${S(23)}px ${SANS}`;
        reasonLines = clipLines(ctx, item.reason, textW2, 2);
      }
      const reasonY = brandLines.length ? S(100) : S(64);
      const bottom = reasonLines.length
        ? reasonY + (reasonLines.length - 1) * S(34) + S(24)
        : (brandLines.length ? S(84) : S(34));
      return { item, nameLines, brandLines, reasonLines, reasonY, height: bottom };
    });

    const gap = S(120);
    let ay = labelY + S(76);

    blocks.forEach((b, i) => {
      ctx.fillStyle = C.ink3;
      ctx.font = `${S(24)}px ${MONO}`;
      ctx.fillText(b.item.rank || String(i + 2).padStart(2, '0'), M, ay);

      ctx.fillStyle = C.ink;
      ctx.font = `${S(34)}px ${SERIF}`;
      drawLines(ctx, b.nameLines, textX2, ay, S(44));

      if (b.brandLines.length) {
        ctx.fillStyle = C.ink3;
        ctx.font = `${S(21)}px ${SANS}`;
        drawLines(ctx, b.brandLines, textX2, ay + S(56), S(30));
      }
      if (b.reasonLines.length) {
        ctx.fillStyle = C.ink2;
        ctx.font = `${S(23)}px ${SANS}`;
        drawLines(ctx, b.reasonLines, textX2, ay + b.reasonY, S(34));
      }

      ay += b.height;
      contentBottom = ay;
      if (i < blocks.length - 1) {
        rule(ctx, M, ay + gap / 2, w - M, C.line, Math.max(1, S(1)));
        ay += gap;
      }
    });
  }

  /* 三瓶齐时，页脚浮在最后一条理由下方约 150px，而不是钉死在卡底 ——
     理由只有一两行时，底部就不会出现一大块空场；瓶数不足时仍钉在卡底。 */
  const footTop = alternates.length >= 2
    ? Math.min(footTopMax, contentBottom + S(150))
    : footTopMax;
  rule(ctx, M, footTop, w - M, C.hair, Math.max(1, S(1)));
  ctx.fillStyle = C.ink2;
  ctx.font = `${S(22)}px ${SANS}`;
  ctx.fillText(model.foot || '', M, footTop + S(46));
  ctx.fillStyle = C.ink3;
  ctx.font = `${S(19)}px ${MONO}`;
  ctx.fillText('零基础香水选择器 · 按感觉挑就行', M, footTop + S(86));

  ctx.restore();
}
