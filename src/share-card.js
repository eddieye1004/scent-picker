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

const SANS = '"NotoSC", "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';
const SERIF = '"Cambria", "Georgia", "Times New Roman", "Songti SC", "Noto Serif SC", serif';
const MONO = '"Cascadia Mono", "Consolas", "SFMono-Regular", "NotoSC", monospace';

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
     主推给一块标本签底板（暖白 + 左侧主蓝条 + 上下发丝线），字号 54/28；
     备选不加底板、字号 34/23、编号退成灰墨 —— 层级靠字号与颜色，
     不靠再画一个框。只用 fillRect / 线，不引新依赖。 */
  const items = Array.isArray(model.items) ? model.items : [];
  const primary = items[0] || null;
  const alternates = items.slice(1);

  if (primary) {
    const panelY = S(372);
    const panelH = S(420);
    const px = M + S(46);
    const pw = innerW - S(92);
    ctx.fillStyle = '#FFFCF6';
    ctx.fillRect(M, panelY, innerW, panelH);
    ctx.fillStyle = C.accent;
    ctx.fillRect(M, panelY, S(6), panelH);
    rule(ctx, M, panelY, w - M, C.hair, Math.max(1, S(1)));
    rule(ctx, M, panelY + panelH, w - M, C.hair, Math.max(1, S(1)));

    ctx.fillStyle = C.accent;
    ctx.font = `${S(22)}px ${MONO}`;
    ctx.fillText(`主推 · ${primary.rank || '01'}`, px, panelY + S(72));

    ctx.fillStyle = C.ink;
    ctx.font = `${S(54)}px ${SERIF}`;
    let py = drawWrapped(ctx, primary.name, px, panelY + S(150), pw, S(62), 2);

    if (primary.brand) {
      ctx.fillStyle = C.ink3;
      ctx.font = `${S(25)}px ${SANS}`;
      ctx.fillText(primary.brand, px, py + S(14));
      py += S(38);
    }
    if (primary.reason) {
      ctx.fillStyle = C.ink2;
      ctx.font = `${S(28)}px ${SANS}`;
      drawWrapped(ctx, primary.reason, px, py + S(54), pw, S(42), 3);
    }
  }

  if (alternates.length) {
    const labelY = S(900);
    ctx.fillStyle = C.ink3;
    ctx.font = `${S(20)}px ${MONO}`;
    ctx.fillText(alternates.length > 1 ? '备选 · 另外两瓶' : '备选', M, labelY);
    rule(ctx, M, labelY + S(24), w - M, C.line, Math.max(1, S(1)));

    let ay = S(980);
    alternates.forEach((item, i) => {
      ctx.fillStyle = C.ink3;
      ctx.font = `${S(24)}px ${MONO}`;
      ctx.fillText(item.rank || String(i + 2).padStart(2, '0'), M, ay);

      const textX2 = M + S(84);
      const textW2 = innerW - S(84);
      ctx.fillStyle = C.ink;
      ctx.font = `${S(34)}px ${SERIF}`;
      const nameEnd = drawWrapped(ctx, item.name, textX2, ay, textW2, S(44), 1);

      if (item.brand) {
        ctx.fillStyle = C.ink3;
        ctx.font = `${S(22)}px ${SANS}`;
        ctx.fillText(item.brand, textX2, nameEnd + S(12));
      }
      if (item.reason) {
        ctx.fillStyle = C.ink2;
        ctx.font = `${S(23)}px ${SANS}`;
        drawWrapped(ctx, item.reason, textX2, nameEnd + S(54), textW2, S(34), 2);
      }
      ay += S(190);
      if (i < alternates.length - 1) {
        rule(ctx, M, ay - S(52), w - M, C.line, Math.max(1, S(1)));
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
