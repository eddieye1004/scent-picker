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
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(abs).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  零基础香水选择器\n  → http://localhost:${PORT}\n\n  Ctrl+C 停止\n`);
});
