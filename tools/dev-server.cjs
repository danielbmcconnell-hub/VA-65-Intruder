'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function createServer() {
  return http.createServer((request, response) => {
    let relative;
    try { relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { response.writeHead(400); response.end('Invalid URL'); return; }
    const file = path.resolve(root, '.' + relative + (relative.endsWith('/') ? 'index.html' : ''));
    const rel = path.relative(root, file);
    // The development server never exposes Git, references, test output or tooling.
    if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).some(part => part.startsWith('.')) ||
      !(['index.html'].includes(rel) || rel.startsWith('assets' + path.sep))) {
      response.writeHead(404); response.end('Not found'); return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) { response.writeHead(404); response.end('Not found'); return; }
      response.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      if (request.method === 'HEAD') response.end();
      else fs.createReadStream(file).pipe(response);
    });
  });
}
module.exports = { createServer, root };
if (require.main === module) {
  const port = Number(process.env.PORT || 8000), host = process.env.HOST || '127.0.0.1';
  const server = createServer();
  server.listen(port, host, () => console.log(`Intruder development server: http://${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
