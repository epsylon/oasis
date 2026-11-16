const fs = require('fs');
const os = require('os');
const path = require('path');
const { eq, ok } = require('../../helpers/assert');

const BASE = path.resolve(__dirname, '../../../src/server/node_modules');
const Log = require(path.join(BASE, 'async-append-only-log'));
const bipf = require(path.join(BASE, 'bipf'));
const { readOwnFeed } = require('../../../src/models/backup_model');

const ME = '@' + 'm'.repeat(43) + '=.ed25519';
const OTHER = '@' + 'o'.repeat(43) + '=.ed25519';
const record = (author, sequence, text) => bipf.allocAndEncode({ key: `%${author.slice(1, 8)}${sequence}${'x'.repeat(36)}=.sha256`, value: { author, sequence, content: { type: 'post', text } }, timestamp: sequence });

const writeLog = (dir, records) => new Promise((resolve, reject) => {
  fs.mkdirSync(path.join(dir, 'db2'), { recursive: true });
  const log = Log(path.join(dir, 'db2', 'log.bipf'), { blockSize: 64 * 1024 });
  let i = 0;
  const next = () => {
    if (i >= records.length) return log.onDrain(() => log.close(() => resolve()));
    log.append(records[i++], (err) => (err ? reject(err) : next()));
  };
  next();
});

describe('backup: the posts of the other avatars of the node', (t) => {
  t('only the avatar own messages are read from its log, in order, and the log is left untouched', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-own-feed-'));
    try {
      const big = 'y'.repeat(30000);
      await writeLog(dir, [record(ME, 2, 'two'), record(OTHER, 1, 'theirs'), record(ME, 1, big), record(ME, 3, big), record(OTHER, 2, big)]);
      const file = path.join(dir, 'db2', 'log.bipf');
      const before = fs.readFileSync(file);
      const feed = readOwnFeed(dir, ME);
      eq(feed.map((m) => m.value.sequence).join(), '1,2,3', 'records spread over more than one block are all found');
      ok(feed.every((m) => m.value.author === ME));
      ok(fs.readFileSync(file).equals(before), 'reading never writes to the other avatar log');
      eq(readOwnFeed(path.join(dir, 'missing'), ME).length, 0);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
