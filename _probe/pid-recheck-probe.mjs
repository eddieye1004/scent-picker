import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');
const require = createRequire(import.meta.url);
const pwPath = path.join(process.env.USERPROFILE || '', '.workbuddy', 'binaries', 'node', 'workspace', 'node_modules', 'playwright-core');
const { chromium } = require(pwPath);
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
if (!edge) throw new Error('Edge executable not found');
const APP_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 AliApp(TB/10.30.0) WindVane/8.5.0 390x844';
const correctPid = 'mm_10963225696_3443600437_116343550064';
const inventory = JSON.parse(fs.readFileSync(path.join(dir, 'pid-audit-url-inventory.json'), 'utf8'));
const links = JSON.parse(fs.readFileSync(path.join(root, 'data', 'affiliate-links.json'), 'utf8')).taobao;
const gold = new Set((await import('../scripts/lib/gold-portraits.mjs')).PORTRAITS.flatMap((p) => p.gold));
const all = inventory.rows.filter((r) => r.platform === 'taobao');
const goldRows = all.filter((r) => gold.has(r.id) && links[r.id]);
const sample = JSON.parse(fs.readFileSync(path.join(dir, 'pid-recheck-sample.json'), 'utf8')).sample;
if (goldRows.length !== 27 || sample.length !== 60) throw new Error('scope mismatch');
const args = process.argv.slice(2);
const groups = args.length ? args : ['gold', 'sample'];
let state = 20261113 >>> 0;
function randInt(min, max) { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return min + Math.floor(((t ^ (t >>> 14)) >>> 0) / 4294967296 * (max - min + 1)); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function sanitized(finalUrl) {
  try {
    const u = new URL(finalUrl);
    const id = u.searchParams.get('id');
    const track = u.searchParams.get('ali_trackid') || '';
    const pid = track.match(/(?:^|:)\s*(mm_[^:;,]+)/)?.[1] || null;
    return { url: `${u.protocol}//${u.host}${u.pathname}${id ? `?id=${encodeURIComponent(id)}` : ''}${pid ? `${id ? '&' : '?'}ali_trackid=2:${pid}` : ''}`, pid, trackPidPart: pid ? `2:${pid}` : null, host: u.host, path: u.pathname, hasAliTrackid: !!track };
  } catch { return { url: String(finalUrl || '').slice(0, 240), pid: null, trackPidPart: null, host: null, path: null, hasAliTrackid: false }; }
}
const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ userAgent: APP_UA, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const outPath = path.join(dir, 'pid-recheck-results.json');
let results = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : { correctPid, method: 'Task-8 App-UA landing (AliApp TB/10.30.0), ordered; each item retried at most once', startedAt: new Date().toISOString(), groups: { gold: [], sample: [] }, stopped: false, stopReason: null };
let consecutiveLoginOrRisk = 0;
let mismatch = false;
async function probe(row, group, ordinal) {
  const link = links[row.id];
  const sha256 = createHash('sha256').update(link).digest('hex');
  let attempt = 0;
  let last = null;
  for (; attempt < 2; attempt++) {
    if (attempt) await wait(randInt(5000, 6500));
    let finalUrl = '', error = null, title = '';
    try { await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 35000 }); await page.waitForTimeout(2200); finalUrl = page.url(); title = await page.title().catch(() => ''); }
    catch (e) { finalUrl = page.url(); error = String(e?.message || e).slice(0, 180); }
    const clean = sanitized(finalUrl);
    let status = '无法判定', reason = '';
    if (clean.pid) { status = '可判定'; reason = 'final ali_trackid contains PID'; }
    else if (error) reason = `navigation error: ${error}`;
    else if (/login\.m?\.taobao\.com|login\./i.test(clean.host || '')) reason = '登录墙，最终页无 ali_trackid';
    else if (/tmall\.com/i.test(clean.host || '') && /login/i.test(clean.path || '')) reason = '天猫登录失效/特殊页，最终页无 ali_trackid';
    else if (/captcha|punish|risk|verify/i.test(`${clean.host} ${clean.path} ${title}`)) reason = '风控/验证页，最终页无 ali_trackid';
    else reason = '最终页无 ali_trackid，页面不可识别';
    last = { group, id: row.id, ...(group === 'sample' ? { fullInventoryOrdinal: ordinal } : {}), shortLinkSha256: sha256, landingStatus: status, readPid: clean.pid, aliTrackidPidPart: clean.trackPidPart, verdict: clean.pid ? (clean.pid === correctPid ? '正确' : '串号') : '无法判定', reason, retryCount: attempt, checkedAt: new Date().toISOString(), finalUrl: clean.url, finalUrlType: `${clean.host || 'unknown'}${clean.path || ''}`, title: title.slice(0, 80) };
    if (clean.pid) break;
  }
  return last;
}
try {
  for (const group of groups) {
    const rows = group === 'gold' ? goldRows.map((r) => ({ id: r.id })) : sample;
    results.groups[group] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (results.groups.gold.length + results.groups.sample.length) await wait(randInt(2000, 5000));
      const r = await probe(row, group, row.fullInventoryOrdinal);
      results.groups[group].push(r);
      fs.writeFileSync(outPath, JSON.stringify(results, null, 2) + '\n');
      console.log(`${group} ${results.groups[group].length}/${rows.length} ${r.id}: ${r.verdict} ${r.readPid || r.reason}`);
      if (r.verdict === '串号') { mismatch = true; results.stopped = true; results.stopReason = `mismatch at ${group}:${r.id}; stop sampling per pre-registered decision line`; break; }
      if (!r.readPid && /登录墙|风控|验证页/.test(r.reason)) consecutiveLoginOrRisk++; else consecutiveLoginOrRisk = 0;
      if (consecutiveLoginOrRisk >= 10) { results.stopped = true; results.stopReason = '10 consecutive login-wall/risk landings; paused per brief'; break; }
    }
    if (results.stopped || mismatch) break;
  }
} finally {
  results.finishedAt = new Date().toISOString();
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2) + '\n');
  await browser.close();
}


