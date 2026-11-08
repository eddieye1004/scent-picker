#!/usr/bin/env node
/**
 * server.js — 零依赖静态服务器（不需要 npm install）
 *
 * 为什么需要它：浏览器在 file:// 协议下会用 CORS 策略拦掉 fetch('./data/*.json')，
 * 所以不能直接双击 index.html。这个文件只用 Node 内置模块，起一个本地服务。
 *
 * 用法：
 *   node server.js            → http://localhost:8080
 *   node server.js 3000       → 换端口
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname === '/') pathname = '/index.html';

  // 目录穿越防护：解析后必须仍在 ROOT 内
  const abs = path.normalize(path.join(ROOT, pathname));
  if (!abs.startsWith(ROOT)) {
    res.writeHead(403).end('403 Forbidden');
    return;
  }

  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(abs).toLowerCase();
    /* no-store 而不是 no-cache：no-cache 只要求"用前必须验证"，但本服务器
       不发光 ETag / Last-Modified，浏览器在部分情况下会直接复用本地副本，
       结果就是"改了 app.js，页面里跑的还是旧版"（实测踩过：线稿已从代码里
       删掉，浏览器仍在跑带线稿的旧 app.js，盘心先闪旧图）。
       开发用静态服务器没有带宽顾虑，一律 no-store 最省事。 */
    const noStore = ['.html', '.js', '.mjs', '.css', '.json', '.svg'].includes(ext);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': noStore ? 'no-store, must-revalidate' : 'no-cache',
    });
    fs.createReadStream(abs).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  零基础香水选择器\n  → http://localhost:${PORT}\n\n  Ctrl+C 停止\n`);
});
