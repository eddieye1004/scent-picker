/**
 * probe-aff-mobile.mjs — 任务 7 的实测工具：看一条淘宝转链在不同 UA 下最终落到哪里。
 *
 * 为什么要自己跟跳：`s.click.taobao.com/t?e=...` 第一跳是 200 + 一段 JS
 * （`real_jump_address` + 自动 click），curl 的 -L 完全跟不动。
 * 所以这里手动解析那一段，最多跟 5 跳，逐跳打印状态码 / content-type / 长度，
 * 并把最后一跳的 HTML 里能看出的信号（m.tb.cn / detail.m.tb / 登录 wall /
 * 唤起 scheme）抽出来。
 *
 * 用法：
 *   node scripts/probe-aff-mobile.mjs <url> [mobile|desktop]
 *   node scripts/probe-aff-mobile.mjs --sample   # 三条抽样，两个 UA 各跑一遍
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const UA = {
  mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

function classify(html, finalUrl) {
  const h = html || '';
  const marks = [];
  if (/m\.tb\.cn|main\.m\.taobao\.com|h5\.m\.taobao\.com|detail\.m\.tb\.cn/.test(h) || /m\.tb\.cn|m\.taobao\.com/.test(finalUrl)) marks.push('移动版落地');
  if (/detail\.tmall\.com|item\.taobao\.com/.test(h)) marks.push('桌面商品页');
  if (/login\.taobao\.com|passport|请登录|亲，请登录/.test(h)) marks.push('登录墙');
  if (/taobao:\/\/|tmall:\/\/|openapp|weixin:\/\//.test(h)) marks.push('内含唤起 scheme');
  if (/<meta[^>]+name="?referrer/.test(h)) marks.push('元刷新壳页');
  return marks;
}

async function hop(url, uaKey, maxHops = 5) {
  let cur = url;
  const trail = [];
  for (let i = 0; i < maxHops; i++) {
    let res;
    try {
      res = await fetch(cur, {
        redirect: 'manual',
        headers: { 'user-agent': UA[uaKey], accept: 'text/html,*/*' },
      });
    } catch (e) {
      trail.push({ hop: i + 1, url: cur, error: String(e && e.message || e) });
      break;
    }
    const loc = res.headers.get('location');
    const ct = res.headers.get('content-type') || '';
    /* 淘宝这一跳返回的 content-type 是空的（实测），所以不能靠 ct 判断要不要读 body：
       只有明确是二进制或 3xx 时才跳过。 */
    const body = (!loc && !/^(image|font|video|audio|application\/octet)/.test(ct)) ? await res.text() : '';
    trail.push({
      hop: i + 1, status: res.status, ct: ct.split(';')[0], len: body.length,
      location: loc || null, url: cur,
    });
    if (loc && /^(https?:)?\/\//.test(loc)) { cur = new URL(loc, cur).toString(); continue; }
    /* JS 跳：淘宝那一跳的 real_jump_address */
    const m = body.match(/real_jump_address\s*=\s*'([^']+)'/);
    if (m) { cur = new URL(m[1].replace(/&amp;/g, '&'), cur).toString(); trail[trail.length - 1].jsHop = true; continue; }
    /* 元刷新 */
    const mr = body.match(/http-equiv=["']?refresh["']?[^>]*url=([^"'>\s]+)/i);
    if (mr) { cur = new URL(mr[1], cur).toString(); trail[trail.length - 1].metaHop = true; continue; }
    trail[trail.length - 1].final = true;
    trail[trail.length - 1].marks = classify(body, cur);
    trail[trail.length - 1].finalUrl = cur;
    if (/window\.location\.replace\(['"]([^'"]+)['"]\)/.test(body)) {
      const w = body.match(/window\.location\.replace\(['"]([^'"]+)['"]\)/)[1];
      trail[trail.length - 1].jsReplace = w;
    }
    break;
  }
  return trail;
}

function printTrail(label, trail) {
  console.log(`\n--- ${label} ---`);
  for (const t of trail) {
    if (t.error) { console.log(`  hop${t.hop} ERROR ${t.error}`); continue; }
    console.log(`  hop${t.hop} ${t.status} ${t.ct || '-'} ${t.len}B` +
      (t.jsHop ? ' [JS跳]' : '') + (t.metaHop ? ' [meta跳]' : '') + (t.final ? ' [终点]' : ''));
    if (t.location) console.log(`        → ${t.location.slice(0, 140)}`);
    if (t.final) {
      console.log(`        最终 URL: ${String(t.finalUrl).slice(0, 160)}`);
      if (t.marks && t.marks.length) console.log(`        信号: ${t.marks.join(' / ')}`);
      if (t.jsReplace) console.log(`        再跳: ${String(t.jsReplace).slice(0, 160)}`);
    }
  }
}

const args = process.argv.slice(2);
if (args[0] === '--sample') {
  const table = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'affiliate-links.json'), 'utf8'));
  const SAMPLE = process.env.AFF_SAMPLE
    ? process.env.AFF_SAMPLE.split(',')
    : ['creed-aventus', 'lattafa-yara', 'dior-eau-sauvage'];
  for (const id of SAMPLE) {
    const u = (table.taobao || {})[id];
    if (!u) { console.log(`\n${id}: 没有淘宝链接`); continue; }
    console.log(`\n========== ${id} ==========`);
    console.log(`  原链接: ${u.slice(0, 120)}…`);
    for (const ua of ['mobile', 'desktop']) {
      printTrail(`${id} / ${ua}`, await hop(u, ua));
    }
  }
} else {
  const u = args[0];
  const ua = args[1] === 'desktop' ? 'desktop' : 'mobile';
  printTrail(`${u.slice(0, 60)}… / ${ua}`, await hop(u, ua));
}
