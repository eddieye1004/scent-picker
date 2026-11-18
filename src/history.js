/**
 * src/history.js — 「我的香水档案」的本地记录层
 *
 * 只做三件事：校验、截断、落盘。存储介质由调用方传入（浏览器是
 * localStorage，测试里是内存对象），模块本身不碰 window —— 所以它能在
 * node 里直接测，也不会因为隐私模式禁用存储而把页面带崩。
 *
 * 存什么（刻意只有这三项）：
 *   t        时间戳（毫秒）
 *   entry    入口类型：family = 香型圆盘，emotion = 情绪方向
 *   results  最多 3 项，每项只有 { name, brand }
 *
 * 不存回答、不存香水 id、不存设备信息，也没有任何上传路径。
 * 清空只需要删掉这一个键。
 */
export const HISTORY_KEY = 'scent-picker.history.v1';
export const HISTORY_MAX = 5;

function cleanText(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** 入口类型由「最先给出的那条入口」决定：选了圆盘就是家族入口，否则是情绪入口。 */
export function entryOf(answers = {}) {
  return answers && answers.family ? 'family' : 'emotion';
}

export function entryLabel(entry) {
  if (entry === 'family') return '香型圆盘';
  if (entry === 'emotion') return '情绪方向';
  return '未记录';
}

function normalize(v) {
  const t = Number(v && v.t);
  const entry = v && v.entry === 'family' ? 'family' : 'emotion';
  const results = (Array.isArray(v && v.results) ? v.results : [])
    .slice(0, 3)
    .map((r) => ({
      name: cleanText(r && r.name, 120),
      brand: cleanText(r && r.brand, 80),
    }))
    .filter((r) => r.name);
  return { t: Number.isFinite(t) ? t : 0, entry, results };
}

function validRecord(v) {
  if (!v || typeof v !== 'object') return false;
  if (!Number.isFinite(Number(v.t))) return false;
  if (v.entry !== 'family' && v.entry !== 'emotion') return false;
  if (!Array.isArray(v.results)) return false;
  const results = v.results.slice(0, 3).filter((r) => r && cleanText(r.name, 120));
  return results.length > 0;
}

/** 从一次推荐结果生成一条记录。只取展示出来的前 3 瓶。 */
export function makeHistoryRecord(result, answers = {}, now = Date.now()) {
  return normalize({
    t: now,
    entry: entryOf(answers),
    results: (result && Array.isArray(result.results) ? result.results : []).map((r) => ({ name: r && r.perfume && r.perfume.name, brand: r && r.perfume && r.perfume.brand })),
  });
}

export function readHistory(storage) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    /* 新记录在前。读到坏数据不抛错：一条坏记录不该让整个档案入口消失。 */
    return arr.filter(validRecord).slice(0, HISTORY_MAX).map(normalize);
  } catch {
    return [];
  }
}

export function addHistory(storage, record) {
  if (!storage || !validRecord(record)) return readHistory(storage);
  const list = [normalize(record), ...readHistory(storage)].slice(0, HISTORY_MAX);
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    /* 配额满 / 隐私模式：这次不落盘，但页面继续用。 */
  }
  return list;
}

export function clearHistory(storage) {
  if (!storage) return;
  try {
    storage.removeItem(HISTORY_KEY);
  } catch {
    /* 同上：清不掉也不影响当前结果页。 */
  }
}
