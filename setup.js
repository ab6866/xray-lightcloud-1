#!/usr/bin/env node
// Download official xray-core release and write config.json from env.
// Env: UUID (required), WSPATH (required, no leading slash), PORT (platform port, default 8080)
// Xray internal port is fixed 10001 on 127.0.0.1; Node wrapper on $PORT proxies WS upgrades to it.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const BIN = path.join(ROOT, 'xray');
const XRAY_URL = 'https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip';

function writeConfig() {
  const uuid = process.env.UUID;
  const wspath = (process.env.WSPATH || '').replace(/^\/+/, '');
  if (!uuid) throw new Error('UUID env is required');
  if (!wspath) throw new Error('WSPATH env is required');
  const config = {
    log: { loglevel: 'warning' },
    dns: { servers: ['1.1.1.1', '8.8.8.8', 'localhost'] },
    inbounds: [
      {
        port: 10001,
        listen: '127.0.0.1',
        protocol: 'vless',
        settings: { clients: [{ id: uuid }], decryption: 'none' },
        streamSettings: (process.env.TRANSPORT === 'xhttp') ? { network: 'xhttp', xhttpSettings: { path: '/' + wspath, mode: 'packet-up' } } : { network: 'ws', wsSettings: { path: '/' + wspath } }
      }
    ],
    outbounds: [
      { protocol: 'freedom', tag: 'direct' },
      { protocol: 'blackhole', tag: 'blocked' }
    ]
  };
  fs.writeFileSync(path.join(ROOT, 'config.json'), JSON.stringify(config, null, 2));
  console.log('config.json written, transport=' + (process.env.TRANSPORT || 'ws') + ' path=/' + wspath);
}

function main() {
  if (!fs.existsSync(BIN)) {
    console.log('downloading xray from', XRAY_URL);
    execSync(`curl -L -o ${path.join(ROOT, 'xray.zip')} ${XRAY_URL}`, { stdio: 'inherit' });
    execSync(`unzip -o ${path.join(ROOT, 'xray.zip')} xray -d ${ROOT}`, { stdio: 'inherit' });
    execSync(`chmod +x ${BIN}`, { stdio: 'inherit' });
    try { fs.unlinkSync(path.join(ROOT, 'xray.zip')); } catch {}
  } else {
    console.log('xray binary already present');
  }
  writeConfig();
}

if (require.main === module) main();
module.exports = { writeConfig };
