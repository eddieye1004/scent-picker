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
    foot: '从 1388 瓶里按规则打分选出 · 选品不调用大模型',
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

/** 画一段会自动换行的文字；返回下一行的 y。超出 maxLines 时在末行加省略号。 */
function drawWrapped(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const lines = wrapLines(ctx, text, maxWidth);
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines && shown.length) {
    let last = shown[shown.length - 1];
    const widthOf = (s) => (ctx.measureText ? ctx.measureText(s).width : Array.from(s).length * 18);
    while (last && widthOf(last + '…') > maxWidth) last = last.slice(0, -1);
    shown[shown.length - 1] = last + '…';
  }
  shown.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
  return y + shown.length * lineHeight;
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

  ctx.fillStyle = C.ink3;
  ctx.font = `${S(26)}px ${SANS}`;
  ctx.fillText(model.answers || '', M, S(286));

  rule(ctx, M, S(342), w - M, C.hair, Math.max(1, S(1)));

  /* ==== v2：1 瓶主推 + 2 瓶备选 ====
     结果本来就按匹配度排好：第 1 瓶是主推，第 2/3 瓶是备选。
     主推给一块标本签底板（暖白 + 左侧主蓝条 + 上下发丝线）；
     备选不加底板、编号退成灰墨 —— 层级靠字号与颜色，不靠再画一个框。
     本轮版式收敛（只动绘制层）：
     ① 底板先量行再定高，不再悬着 420px 的固定空底；
     ② 品牌 23px 贴住品名（同一名字块），理由 28px 另起一段；
     ③ 备选区从底板下沿起排，长理由换行不再撞页脚。
     只用 fillRect / 线，不引新依赖。 */
  const items = Array.isArray(model.items) ? model.items : [];
  const primary = items[0] || null;
  const alternates = items.slice(1);
  const panelY = S(372);
  let panelBottom = panelY + S(420);

  if (primary) {
    const px = M + S(46);
    const pw = innerW - S(92);
    ctx.font = `${S(54)}px ${SERIF}`;
    const nameLines = wrapLines(ctx, primary.name, pw).slice(0, 2);
    ctx.font = `${S(23)}px ${SANS}`;
    const brandLine = primary.brand ? wrapLines(ctx, primary.brand, pw)[0] : '';
    ctx.font = `${S(28)}px ${SANS}`;
    const reasonLines = primary.reason ? wrapLines(ctx, primary.reason, pw).slice(0, 3) : [];

    const nameY = panelY + S(150);
    const nameBottom = nameY + (nameLines.length - 1) * S(62);
    const brandY = nameBottom + S(40);
    const reasonY = (primary.brand ? brandY + S(60) : nameBottom + S(60));
    const reasonBottom = reasonY + Math.max(0, reasonLines.length - 1) * S(42);
    const panelH = Math.max(S(300), reasonBottom + S(52) - panelY);
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
    nameLines.forEach((line, i) => ctx.fillText(line, px, nameY + i * S(62)));

    if (brandLine) {
      ctx.fillStyle = C.ink3;
      ctx.font = `${S(23)}px ${SANS}`;
      ctx.fillText(brandLine, px, brandY);
    }
    if (reasonLines.length) {
      ctx.fillStyle = C.ink2;
      ctx.font = `${S(28)}px ${SANS}`;
      reasonLines.forEach((line, i) => ctx.fillText(line, px, reasonY + i * S(42)));
    }
  }

  if (alternates.length) {
    const labelY = panelBottom + S(96);
    ctx.fillStyle = C.ink3;
    ctx.font = `${S(20)}px ${MONO}`;
    ctx.fillText(alternates.length > 1 ? '备选 · 另外两瓶' : '备选', M, labelY);
    rule(ctx, M, labelY + S(24), w - M, C.line, Math.max(1, S(1)));

    const textX2 = M + S(84);
    const textW2 = innerW - S(84);
    let ay = labelY + S(106);
    alternates.forEach((item, i) => {
      ctx.fillStyle = C.ink3;
      ctx.font = `${S(24)}px ${MONO}`;
      ctx.fillText(item.rank || String(i + 2).padStart(2, '0'), M, ay);

      ctx.fillStyle = C.ink;
      ctx.font = `${S(34)}px ${SERIF}`;
      const nameLines = wrapLines(ctx, item.name, textW2).slice(0, 1);
      nameLines.forEach((line, j) => ctx.fillText(line, textX2, ay + j * S(44)));
      const nameEnd = ay + (nameLines.length - 1) * S(44);

      let blockBottom = nameEnd;
      if (item.brand) {
        ctx.fillStyle = C.ink3;
        ctx.font = `${S(22)}px ${SANS}`;
        ctx.fillText(wrapLines(ctx, item.brand, textW2)[0], textX2, nameEnd + S(36));
        blockBottom = nameEnd + S(36);
      }
      if (item.reason) {
        ctx.fillStyle = C.ink2;
        ctx.font = `${S(23)}px ${SANS}`;
        const reasonLines = wrapLines(ctx, item.reason, textW2).slice(0, 2);
        const reasonY = nameEnd + (item.brand ? S(76) : S(58));
        reasonLines.forEach((line, j) => ctx.fillText(line, textX2, reasonY + j * S(34)));
        blockBottom = reasonY + (reasonLines.length - 1) * S(34);
      }

      if (i < alternates.length - 1) {
        rule(ctx, M, blockBottom + S(56), w - M, C.line, Math.max(1, S(1)));
        ay = blockBottom + S(134);
      } else {
        ay = blockBottom;
      }
    });
  }

  const footTop = h - S(150);
  rule(ctx, M, footTop, w - M, C.hair, Math.max(1, S(1)));
  ctx.fillStyle = C.ink2;
  ctx.font = `${S(22)}px ${SANS}`;
  ctx.fillText(model.foot || '', M, footTop + S(46));
  ctx.fillStyle = C.ink3;
  ctx.font = `${S(19)}px ${MONO}`;
  ctx.fillText('零基础香水选择器 · 1388 瓶 · 规则可复算', M, footTop + S(86));

  ctx.restore();
}
