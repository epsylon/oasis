const fs = require('fs');
const os = require('os');
const path = require('path');
const { eq, ok, notOk } = require('../../helpers/assert');

const ENV = ['OASIS_TEST', 'OASIS_STATE_DIR', 'OASIS_ROOT_SSB', 'OASIS_ROOT_STATE', 'ssb_path'];

const withRoot = (fn) => {
  const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-profiles-'));
  try {
    for (const k of ENV) delete process.env[k];
    process.env.ssb_path = root;
    fs.mkdirSync(path.join(root, 'oasis'), { recursive: true });
    fs.writeFileSync(path.join(root, 'oasis', 'oasis-config.json'), JSON.stringify({ language: 'es', wallet: { url: 'http://localhost:7474', user: 'me', pass: 'secret', fee: '5' } }));
    require('../../../src/server/node_modules/ssb-keys').createSync(path.join(root, 'secret'));
    const file = require.resolve('../../../src/configs/profiles');
    delete require.cache[file];
    const profiles = require(file);
    const restart = () => {
      delete process.env.OASIS_ROOT_SSB;
      process.env.ssb_path = root;
      return profiles.activate();
    };
    return fn({ profiles, root, restart });
  } finally {
    for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    fs.rmSync(root, { recursive: true, force: true });
  }
};

describe('profiles: several accounts on one node', (t) => {
  t('on start the account of the node moves whole into profiles, and the old place cannot be opened as a new identity', () => withRoot(({ profiles, root }) => {
    const dir = profiles.activate();
    eq(path.dirname(dir), path.join(root, 'oasis', 'profiles'));
    ok(fs.existsSync(path.join(dir, 'secret')) && JSON.parse(fs.readFileSync(path.join(dir, 'oasis', 'oasis-config.json'), 'utf8')).language === 'es');
    eq(fs.readdirSync(root).sort().join(), 'oasis,secret');
    eq(fs.readdirSync(path.join(root, 'oasis')).sort().join(), 'profiles,profiles.json');
    const log = console.error;
    console.error = () => {};
    try { eq(require('../../../src/server/node_modules/ssb-keys').loadOrCreateSync(path.join(root, 'secret')), undefined); } finally { console.error = log; }
    eq(profiles.currentKey(), path.basename(dir));
    eq(profiles.accounts().length, 1);
    eq(profiles.others().length, 0);
    eq(profiles.deletable().length, 0);
  }));

  t('a new avatar gets its own .ssb inside profiles and a copy of the settings without the wallet credentials, and the open account stays the default', () => withRoot(({ profiles, root, restart }) => {
    profiles.activate();
    const main = profiles.current();
    const created = profiles.create();
    ok(/^\.ssb-oasis_[A-Za-z0-9_-]{8}$/.test(created.key), 'the folder is named after the short id');
    eq(path.dirname(created.dir), path.join(root, 'oasis', 'profiles'));
    ok(fs.existsSync(path.join(created.dir, 'secret')));
    const cfg = JSON.parse(fs.readFileSync(path.join(created.dir, 'oasis', 'oasis-config.json'), 'utf8'));
    eq(cfg.language, 'es');
    eq(`${cfg.wallet.user}|${cfg.wallet.pass}|${cfg.wallet.url}`, '||http://localhost:7474', 'wallet credentials stay with their account, the rest of the wallet settings is kept');
    eq(profiles.defaultKey(), main.key);
    eq(restart(), main.dir, 'creating an avatar does not change the account that opens');
  }));

  t('the account travelled to becomes the default and opens on every start', () => withRoot(({ profiles, restart }) => {
    profiles.activate();
    const main = profiles.current();
    const a = profiles.create();
    const b = profiles.create();
    ok(profiles.travel(a.key));
    eq(restart(), a.dir);
    eq(profiles.defaultKey(), a.key);
    eq(restart(), a.dir, 'and it opens again on the next start');
    ok(profiles.travel(main.key));
    eq(restart(), main.dir);
    eq(profiles.currentKey(), main.key);
    ok(profiles.otherIds().has(a.id) && profiles.otherIds().has(b.id), 'the other accounts are known as mine');
    eq(restart(), main.dir);
    notOk(profiles.travel(main.key), 'no travel to the account already open');
    notOk(profiles.travel('.ssb-oasis_nothere1'), 'no travel to an unknown account');
  }));

  t('from any avatar the other accounts of the node are known as mine', () => withRoot(({ profiles, restart }) => {
    profiles.activate();
    const main = profiles.current();
    const a = profiles.create();
    ok(profiles.otherIds().has(a.id) && !profiles.otherIds().has(main.id), 'from the main account');
    ok(profiles.travel(a.key));
    eq(restart(), a.dir);
    ok(profiles.otherIds().has(main.id) && !profiles.otherIds().has(a.id), 'and from the avatar');
  }));

  t('any account but the open one can be deleted, so one always stays', () => withRoot(({ profiles, restart }) => {
    profiles.activate();
    const main = profiles.current();
    const a = profiles.create();
    const b = profiles.create();
    profiles.travel(a.key);
    restart();
    notOk(profiles.remove(a.key), 'the open account stays');
    ok(profiles.remove(main.key));
    ok(profiles.remove(b.key));
    notOk(fs.existsSync(main.dir) || fs.existsSync(b.dir));
    eq(profiles.accounts().map((p) => p.key).join(','), a.key);
  }));

  t('tests never switch accounts', () => withRoot(({ profiles, root }) => {
    process.env.OASIS_TEST = '1';
    eq(profiles.activate(), null);
    eq(process.env.ssb_path, root);
    eq(profiles.accounts().length, 0, 'no account is listed, so backups never carry or restore any');
    eq(profiles.others().length, 0);
  }));

  t('with a pinned state folder on the same disk every account keeps its state inside its own .ssb', () => withRoot(({ profiles, restart }) => {
    const pinned = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-pinned-'));
    try {
      fs.mkdirSync(path.join(pinned, 'oasis'), { recursive: true });
      fs.writeFileSync(path.join(pinned, 'oasis', 'oasis-config.json'), JSON.stringify({ language: 'eu' }));
      process.env.OASIS_STATE_DIR = pinned;
      const dir = profiles.activate();
      eq(process.env.OASIS_STATE_DIR, dir, 'the state moves into the account');
      eq(fs.readdirSync(path.join(pinned, 'oasis')).length, 0);
      const main = profiles.current();
      const a = profiles.create();
      eq(JSON.parse(fs.readFileSync(path.join(a.dir, 'oasis', 'oasis-config.json'), 'utf8')).language, 'eu', 'settings come from the account it was created from');
      ok(profiles.travel(a.key));
      process.env.OASIS_STATE_DIR = pinned;
      eq(restart(), a.dir);
      eq(process.env.OASIS_STATE_DIR, a.dir);
      ok(profiles.travel(main.key));
      process.env.OASIS_STATE_DIR = pinned;
      eq(restart(), main.dir);
      eq(process.env.OASIS_STATE_DIR, main.dir);
    } finally { fs.rmSync(pinned, { recursive: true, force: true }); }
  }));

  t('a data folder given with --path is followed too', () => withRoot(({ profiles, root }) => {
    const argv = process.argv;
    try {
      delete process.env.ssb_path;
      process.argv = [argv[0], 'backend.js', '--path', root];
      eq(profiles.rootDir(), root);
      profiles.activate();
      const a = profiles.create();
      ok(profiles.travel(a.key));
      delete process.env.OASIS_ROOT_SSB;
      process.argv = [argv[0], 'backend.js', `--path=${root}`];
      eq(profiles.activate(), a.dir);
      eq(process.argv[2], `--path=${a.dir}`, 'the argument that wins over the environment points at the avatar');
      eq(profiles.currentKey(), a.key);
    } finally { process.argv = argv; }
  }));
});
