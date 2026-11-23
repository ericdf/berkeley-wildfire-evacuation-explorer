#!/usr/bin/env node
// Static server that gzips every response, as GitHub Pages does (checked 2026-11-23: content-encoding gzip on HTML, JS,
// JSON and the binary terrain files), so tests/load-size.mjs can measure a checkout's transfer before it is published.
// For measurement only; use python3 tools/serve.py for everyday work.
//   node tools/serve-gzip.mjs [port] [root]     (default 8767, this checkout)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
const port = +(process.argv[2] || 8767), root = path.resolve(process.argv[3] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };
const cache = new Map();
http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  if (!cache.has(f)) cache.set(f, zlib.gzipSync(fs.readFileSync(f), { level: 6 }));
  s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'content-encoding': 'gzip', 'cache-control': 'max-age=600' });
  s.end(cache.get(f));
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/ serving ${root} gzipped`));
