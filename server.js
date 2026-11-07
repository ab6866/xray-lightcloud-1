#!/usr/bin/env node
// Node wrapper: listens on $PORT (platform edge), serves a cover page on /,
// proxies WebSocket upgrades on /<WSPATH> to local xray on 127.0.0.1:10001.
// Plain WS inside the container; TLS is terminated by the platform edge.
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { writeConfig } = require('./setup.js');

const PORT = parseInt(process.env.PORT || '8080', 10);
const WSPATH = (process.env.WSPATH || '').replace(/^\/+/, '');
const XRAY_PORT = 10001;
if (!process.env.UUID || !WSPATH) {
  console.error('UUID and WSPATH env are required');
  process.exit(1);
}

// config.json is written at build time (node setup.js). The runtime image is
// not writable by the app user, so only write it when it is missing.
if (!fs.existsSync(path.join(__dirname, 'config.json'))) writeConfig();
const xray = spawn(path.join(__dirname, 'xray'), ['-config', path.join(__dirname, 'config.json')], { stdio: ['ignore', 'inherit', 'inherit'] });
xray.on('exit', (code) => { console.error('xray exited', code); process.exit(1); });

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><head><meta charset="utf-8"><title>OK</title></head><body><h1>OK</h1></body></html>');
    return;
  }
  // XHTTP: forward plain HTTP requests on the path to xray (packet-up mode).
  // WS: GET without Upgrade returns 400, like xray itself.
  if (req.url === '/' + WSPATH || req.url.startsWith('/' + WSPATH + '?')) {
    if (process.env.TRANSPORT === 'xhttp') {
      const proxy = http.request({ host: '127.0.0.1', port: XRAY_PORT, path: req.url, method: req.method, headers: req.headers }, (up) => { res.writeHead(up.statusCode, up.headers); up.pipe(res); });
      proxy.on('error', () => { res.writeHead(502); res.end(); });
      req.pipe(proxy);
      return;
    }
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request');
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/' + WSPATH) { socket.destroy(); return; }
  const upstream = net.connect(XRAY_PORT, '127.0.0.1', () => {
    // Forward the original HTTP upgrade request to xray.
    const headers = Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n');
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${headers}\r\n\r\n`);
    if (head && head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(PORT, '0.0.0.0', () => console.log(`wrapper listening on 0.0.0.0:${PORT}, transport=${process.env.TRANSPORT || 'ws'} path=/${WSPATH}`));
