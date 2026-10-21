#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ssbConfig = require(path.join(__dirname, '..', 'src', 'server', 'ssb_config'));
const ssbClient = require(path.join(__dirname, '..', 'src', 'server', 'node_modules', 'ssb-client'));
const pubInvites = require(path.join(__dirname, '..', 'src', 'models', 'pub_invites'));
const configManager = require(path.join(__dirname, '..', 'src', 'configs', 'config-manager'));

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
  console.error('  invites                         Show how many invites this PUB created and how many are used');
  console.error('  name <text>                     Set PUB display name');
  console.error('  announce <host> [port]          Publish a pub address (default port=8008)');
  console.error('  follow <feedId>                 Follow another PUB');
  console.error('  join <invite>                   Join another PUB with its invite code');
  console.error('  status                          Show peer / replication status');
  console.error('  gossip                          List known gossip peers');
  console.error('  peers                           List the peers connected right now');
  console.error('');
  console.error('Works with the sbot stopped too:');
  console.error('  hops [N]                        Show or set how many hops this node replicates (0-6)');
  process.exit(1);
};

if (!cmd) usage();

if (cmd === 'hops') {
  const current = (configManager.readServerConfig().friends || {}).hops;
  if (args[0] === undefined) {
    console.log(`Hops: ${Number.isFinite(current) ? current : 2}`);
    process.exit(0);
  }
  const hops = Number(args[0]);
  if (!Number.isInteger(hops) || hops < 0 || hops > 6) {
    console.error('Hops must be a whole number from 0 to 6');
    process.exit(1);
  }
  configManager.saveServerConfig({ friends: { hops } });
  console.log(`Hops: ${hops} (was ${Number.isFinite(current) ? current : 2}). Restart Oasis to apply it.`);
  process.exit(0);
}

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
        await pubInvites.announce(ssb).catch(() => null);
        break;
      }
      case 'invites': {
        if (!ssb.invite || typeof ssb.invite.list !== 'function') { console.error('This node is not a PUB'); process.exit(1); }
        const rows = await call(ssb.invite.list.bind(ssb.invite));
        const sum = pubInvites.summarize(rows);
        const single = pubInvites.summarize(rows.filter((r) => Number(r.total) === 1));
        for (const r of sum.codes) console.log(`${r.id}  used ${r.used} of ${r.total}`);
        if (single.total) console.log(`Single-use codes: used ${single.used} of ${single.total}`);
        console.log(`Total: used ${sum.used} of ${sum.total}, ${sum.total - sum.used} left`);
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
      case 'peers': {
        const pull = require(path.join(__dirname, '..', 'src', 'server', 'node_modules', 'pull-stream'));
        const list = await new Promise((res, rej) => pull(ssb.conn.peers(), pull.take(1), pull.collect((e, r) => e ? rej(e) : res(r[0] || []))));
        const rows = list.filter(([, d]) => d && d.key && d.state === 'connected').map(([addr, d]) => `${d.key}  ${String(addr).split('~')[0]}`);
        console.log(rows.length ? `\n${rows.join('\n')}\n\nConnected: ${rows.length}\n` : `\nConnected: 0\n`);
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
