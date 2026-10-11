#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ssbConfig = require(path.join(__dirname, '..', 'src', 'server', 'ssb_config'));
const ssbClient = require(path.join(__dirname, '..', 'src', 'server', 'node_modules', 'ssb-client'));

const socketPath = path.join(ssbConfig.path, 'socket');
const publicInteger = (ssbConfig.keys.public || '').replace('.ed25519', '');
const remote = `unix:${socketPath}~noauth:${publicInteger}`;

const cmd = process.argv[2];
const args = process.argv.slice(3);

const usage = () => {
  console.error('Usage: sh oasis.sh <command> [args]');
  console.error('');
  console.error('PUB admin commands (sbot must be running: sh oasis.sh server):');
  console.error('  whoami                          Print this PUB id');
  console.error('  invite [N]                      Create an invite code (default uses=1)');
  console.error('  name <text>                     Set PUB display name');
  console.error('  announce <host> [port]          Publish a pub address (default port=8008)');
  console.error('  follow <feedId>                 Follow another PUB');
  console.error('  join <invite>                   Join another PUB with its invite code');
  console.error('  status                          Show peer / replication status');
  console.error('  gossip                          List known gossip peers');
  process.exit(1);
};

if (!cmd) usage();

const call = (fn, ...a) => new Promise((res, rej) => fn(...a, (e, r) => e ? rej(e) : res(r)));

const toLegacyInvite = (s) => {
  const t = String(s || '').trim();
  if (/^[^:]+:\d+:@[^~]+~[^~]+$/.test(t)) return t;
  const m = t.match(/^(?:net:)?([^:]+):(\d+)~shs:([^~]+)~invite:([^~]+)$/);
  if (!m) return t;
  let key = m[3].replace(/^@/, '');
  if (!/\.ed25519$/.test(key)) key += '.ed25519';
  return `${m[1]}:${m[2]}:@${key}~${m[4]}`;
};

const rememberPub = (code) => {
  const m = String(code || '').match(/^([^:~\s]+):(\d+):(@[A-Za-z0-9+/=_-]+\.ed25519)~/);
  if (!m) return;
  const file = path.join(ssbConfig.path, 'gossip.json');
  let pubs = [];
  try { pubs = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
  if (!Array.isArray(pubs)) pubs = [];
  if (pubs.some((p) => p && p.key === m[3])) return;
  pubs.push({ host: m[1].toLowerCase(), port: Number(m[2]) || 8008, key: m[3] });
  fs.writeFileSync(file, JSON.stringify(pubs, null, 2), 'utf8');
};

ssbClient(ssbConfig.keys, { remote, caps: ssbConfig.caps }).then(async (ssb) => {
  try {
    switch (cmd) {
      case 'whoami': {
        const r = await call(ssb.whoami.bind(ssb));
        console.log(JSON.stringify(r, null, 2));
        break;
      }
      case 'invite': {
        const uses = Math.max(1, parseInt(args[0] || '1', 10));
        const code = await call(ssb.invite.create.bind(ssb.invite), uses);
        console.log(code);
        break;
      }
      case 'name': {
        const text = String(args[0] || '');
        if (!text) { console.error('Missing name'); process.exit(1); }
        const me = await call(ssb.whoami.bind(ssb));
        const r = await call(ssb.publish.bind(ssb), { type: 'about', about: me.id, name: text });
        console.log(JSON.stringify(r, null, 2));
        break;
      }
      case 'announce': {
        const host = args[0];
        const port = parseInt(args[1] || '8008', 10);
        if (!host) { console.error('Missing host'); process.exit(1); }
        const me = await call(ssb.whoami.bind(ssb));
        const r = await call(ssb.publish.bind(ssb), { type: 'pub', address: { key: me.id, host, port } });
        console.log(JSON.stringify(r, null, 2));
        break;
      }
      case 'follow': {
        const feedId = args[0];
        if (!feedId) { console.error('Missing feedId'); process.exit(1); }
        const r = await call(ssb.publish.bind(ssb), { type: 'contact', contact: feedId, following: true });
        console.log(JSON.stringify(r, null, 2));
        break;
      }
      case 'join': {
        if (!args[0]) { console.error('Missing invite code'); process.exit(1); }
        const code = toLegacyInvite(args[0]);
        const r = await call(ssb.invite.accept.bind(ssb.invite), code);
        rememberPub(code);
        console.log(JSON.stringify(r, null, 2));
        break;
      }
      case 'status': {
        const r = await call(ssb.status.bind(ssb));
        console.log(JSON.stringify(r, null, 2));
        break;
      }
      case 'gossip': {
        const r = await call(ssb.conn.dbPeers.bind(ssb.conn));
        console.log(JSON.stringify(r, null, 2));
        break;
      }
      default:
        usage();
    }
    ssb.close();
  } catch (e) {
    console.error('Error:', e.message || e);
    process.exit(1);
  }
}).catch((e) => {
  console.error('Connection error:', e.message || e);
  console.error('Is the Oasis sbot running? (sh oasis.sh server)');
  process.exit(1);
});
