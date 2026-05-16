#!/usr/bin/env node
const crypto = require('crypto');
const path = require('path');

const hash = (n) => crypto.randomBytes(n || 4).toString('hex');
const longHash = () => hash(16);

const TAGS_POOL = ['music', 'tech', 'art', 'science', 'philosophy', 'p2p', 'oasis', 'libre', 'open-source', 'community', 'demo', 'seed'];
const pickTags = (n) => {
  const out = new Set();
  while (out.size < n) out.add(TAGS_POOL[Math.floor(Math.random() * TAGS_POOL.length)]);
  return [...out];
};

const fakeBlob = (prefix) => `[${prefix}](&${hash(2)}${'0'.repeat(40)}${hash(2)}.sha256)`;

const cooler = require(path.join(__dirname, '..', 'src', 'client', 'gui'));
const ssbConfig = require(path.join(__dirname, '..', 'src', 'server', 'ssb_config'));

async function open() {
  const c = cooler({ offline: ssbConfig.offline });
  return await c.open();
}

async function step(name, fn) {
  process.stdout.write(`  → ${name}... `);
  try {
    const r = await fn();
    console.log(`OK${r ? ' (' + JSON.stringify(r).slice(0, 60) + ')' : ''}`);
    return r;
  } catch (e) {
    console.log(`FAIL (${e.message})`);
    return null;
  }
}

(async () => {
  console.log('Oasis seeder — generating dummy content...\n');
  await open();

  const tribeCrypto    = require(path.join(__dirname, '..', 'src', 'models', 'crypto'))(ssbConfig.path, 'tribes');
  const chatCrypto     = require(path.join(__dirname, '..', 'src', 'models', 'crypto'))(ssbConfig.path, 'chats');
  const padCrypto      = require(path.join(__dirname, '..', 'src', 'models', 'crypto'))(ssbConfig.path, 'pads');
  const mapCrypto      = require(path.join(__dirname, '..', 'src', 'models', 'crypto'))(ssbConfig.path, 'maps');
  const calendarCrypto = require(path.join(__dirname, '..', 'src', 'models', 'crypto'))(ssbConfig.path, 'calendars');
  const sCooler = require(path.join(__dirname, '..', 'src', 'client', 'gui'))({ offline: ssbConfig.offline });

  const models = {
    feed: require(path.join(__dirname, '..', 'src', 'models', 'feed_model'))({ cooler: sCooler }),
    audios: require(path.join(__dirname, '..', 'src', 'models', 'audios_model'))({ cooler: sCooler, tribeCrypto }),
    videos: require(path.join(__dirname, '..', 'src', 'models', 'videos_model'))({ cooler: sCooler, tribeCrypto }),
    images: require(path.join(__dirname, '..', 'src', 'models', 'images_model'))({ cooler: sCooler, tribeCrypto }),
    documents: require(path.join(__dirname, '..', 'src', 'models', 'documents_model'))({ cooler: sCooler, tribeCrypto }),
    bookmarks: require(path.join(__dirname, '..', 'src', 'models', 'bookmarking_model'))({ cooler: sCooler, tribeCrypto }),
    forum: require(path.join(__dirname, '..', 'src', 'models', 'forum_model'))({ cooler: sCooler }),
    transfers: require(path.join(__dirname, '..', 'src', 'models', 'transfers_model'))({ cooler: sCooler, tribeCrypto }),
    votes: require(path.join(__dirname, '..', 'src', 'models', 'votes_model'))({ cooler: sCooler, tribeCrypto }),
    events: require(path.join(__dirname, '..', 'src', 'models', 'events_model'))({ cooler: sCooler }),
    tasks: require(path.join(__dirname, '..', 'src', 'models', 'tasks_model'))({ cooler: sCooler, tribeCrypto }),
    market: require(path.join(__dirname, '..', 'src', 'models', 'market_model'))({ cooler: sCooler, tribeCrypto }),
    jobs: require(path.join(__dirname, '..', 'src', 'models', 'jobs_model'))({ cooler: sCooler, tribeCrypto }),
    projects: require(path.join(__dirname, '..', 'src', 'models', 'projects_model'))({ cooler: sCooler, tribeCrypto }),
    reports: require(path.join(__dirname, '..', 'src', 'models', 'reports_model'))({ cooler: sCooler, tribeCrypto }),
    shops: require(path.join(__dirname, '..', 'src', 'models', 'shops_model'))({ cooler: sCooler, tribeCrypto }),
    pixelia: require(path.join(__dirname, '..', 'src', 'models', 'pixelia_model'))({ cooler: sCooler, tribeCrypto }),
    torrents: require(path.join(__dirname, '..', 'src', 'models', 'torrents_model'))({ cooler: sCooler, tribeCrypto }),
    tribes: null
  };
  const tribesModel = require(path.join(__dirname, '..', 'src', 'models', 'tribes_model'))({ cooler: sCooler, tribeCrypto });
  models.tribes = tribesModel;
  models.tribesContent = require(path.join(__dirname, '..', 'src', 'models', 'tribes_content_model'))({ cooler: sCooler, tribeCrypto, tribesModel });
  models.pads = require(path.join(__dirname, '..', 'src', 'models', 'pads_model'))({ cooler: sCooler, cipherModel: { encryptECB: x => x, decryptECB: x => x }, tribeCrypto, padCrypto, tribesModel });
  models.chats = require(path.join(__dirname, '..', 'src', 'models', 'chats_model'))({ cooler: sCooler, tribeCrypto, chatCrypto, tribesModel });
  models.calendars = require(path.join(__dirname, '..', 'src', 'models', 'calendars_model'))({ cooler: sCooler, tribeCrypto, calendarCrypto, tribesModel });
  models.maps = require(path.join(__dirname, '..', 'src', 'models', 'maps_model'))({ cooler: sCooler, tribeCrypto, mapCrypto, tribesModel });

  console.log('SEED: feed');
  for (let i = 0; i < 3; i++) {
    await step(`feed post #${i}`, () => models.feed.createFeed(`Seed feed ${hash(3)} — hello oasis #${i}`, []));
  }

  console.log('\nSEED: posts (with self-mention so /mentions has content)');
  const meIdEarly = (await sCooler.open()).id;
  for (let i = 0; i < 2; i++) {
    const text = `Hello [@me](${meIdEarly}) — seed post #${i} ${hash(3)}`;
    await step(`post mentioning self #${i}`, () => new Promise((res, rej) => sCooler.open().then(ssb => ssb.publish({
      type: 'post',
      text,
      mentions: [{ link: meIdEarly, name: 'me' }]
    }, (e, m) => e ? rej(e) : res(m)))));
  }

  console.log('\nSEED: media');
  for (let i = 0; i < 2; i++) {
    await step(`audio ${i}`, () => models.audios.createAudio(fakeBlob('a'), pickTags(2), `Track ${hash(2)}`, `Audio dummy ${hash(3)}`, ''));
    await step(`video ${i}`, () => models.videos.createVideo(fakeBlob('v'), pickTags(2), `Vid ${hash(2)}`, `Video dummy ${hash(3)}`, ''));
    await step(`image ${i}`, () => models.images.createImage(fakeBlob('i'), pickTags(2), `Pic ${hash(2)}`, `Image ${hash(3)}`, false, ''));
    await step(`doc ${i}`, () => models.documents.createDocument(fakeBlob('d'), pickTags(2), `Doc ${hash(2)}`, `${longHash()}`));
    await step(`bookmark ${i}`, () => models.bookmarks.createBookmark(`https://example.com/${hash(3)}`, pickTags(2), `bookmark dummy ${hash(2)}`, 'demo', new Date().toISOString()));
  }

  console.log('\nSEED: forum');
  const forumIds = [];
  for (let i = 0; i < 2; i++) {
    const r = await step(`forum thread ${i}`, () => models.forum.createForum('general', `Topic ${hash(3)}`, `Forum body ${longHash()}`));
    if (r && r.key) forumIds.push(r.key);
  }
  for (const fid of forumIds) {
    await step(`forum reply`, () => models.forum.addMessageToForum(fid, { text: `reply ${hash(2)}`, category: 'general', title: 'reply' }));
  }

  console.log('\nSEED: votes');
  await step('votation', () => models.votes.createVote(`Should we ${hash(2)}?`, futureISO(30), ['YES', 'NO', 'ABSTENTION']));

  console.log('\nSEED: events');
  await step('event', () => models.events.createEvent(`Meetup ${hash(2)}`, `Description ${longHash()}`, futureISO(14), 'remote', 0, '', [], ['demo'], 'public', ''));

  console.log('\nSEED: tasks');
  await step('task', () => models.tasks.createTask(`Task ${hash(2)}`, `desc ${hash(4)}`, futureISO(1), futureISO(5), 'LOW', 'remote', ['demo'], 'public'));

  console.log('\nSEED: transfers (3 categories)');
  const meId = (await sCooler.open()).id;
  await step('transfer ECONOMIC', () => models.transfers.createTransfer(meId, `Pay ${hash(2)}`, '10', futureISO(30), ['demo'], 'ECONOMIC'));
  await step('transfer TIME', () => models.transfers.createTransfer(meId, `Help ${hash(2)}`, '2', futureISO(30), ['demo'], 'TIME'));
  await step('transfer TRUST', () => models.transfers.createTransfer(meId, `Vouch ${hash(2)}`, '1', futureISO(30), ['demo'], 'TRUST'));

  console.log('\nSEED: profile about');
  await step('profile name', () => new Promise((res, rej) => sCooler.open().then(ssb => ssb.publish({ type: 'about', about: meId, name: `Seed user ${hash(2)}`, description: 'Auto-generated dummy profile' }, (e, m) => e ? rej(e) : res(m)))));

  console.log('\nSEED: market (public + hidden)');
  await step('market exchange (public)', () => models.market.createItem('exchange', `Item ${hash(2)}`, `desc ${longHash()}`, null, 5, ['demo'], 'NEW', futureISO(30), false, 1, '', {}, 'PUBLIC'));
  await step('market exchange (hidden)', () => models.market.createItem('exchange', `Hidden ${hash(2)}`, `desc ${longHash()}`, null, 7, ['demo'], 'USED', futureISO(30), false, 1, '', {}, 'HIDDEN'));
  await step('market auction', () => models.market.createItem('auction', `Auction ${hash(2)}`, `${longHash()}`, null, 10, ['demo'], 'USED', futureISO(30), false, 1, ''));

  console.log('\nSEED: jobs');
  await step('job', () => models.jobs.createJob({ title: `Job ${hash(2)}`, description: 'demo', location: 'remote', job_type: 'freelancer', job_time: 'partial', vacants: 1, salary: 1000, requirements: 'demo', tags: ['demo'], status: 'OPEN' }));

  console.log('\nSEED: projects');
  await step('project', () => models.projects.createProject({ title: `Project ${hash(2)}`, description: 'demo', goal: '100', deadline: futureISO(60), tags: ['demo'], status: 'ACTIVE' }));

  console.log('\nSEED: reports');
  await step('report', () => models.reports.createReport(`Issue ${hash(2)}`, `report demo ${longHash()}`, 'tech', null, ['demo'], 'low', {}));

  console.log('\nSEED: shops');
  const shop = await step('shop', () => models.shops.createShop(`Shop ${hash(2)}`, 'short', 'long', null, '', 'remote', ['demo'], 'OPEN', ''));
  if (shop && shop.key) {
    await step('shop product', () => models.shops.createProduct(shop.key, `Product ${hash(2)}`, 'desc', null, 5, 10, false));
  }

  console.log('\nSEED: torrents');
  await step('torrent', () => models.torrents.createTorrent(fakeBlob('t'), pickTags(2), `Torrent ${hash(2)}`, `${longHash()}`, 1000, null));

  console.log('\nSEED: pixelia');
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(Math.random() * 50) + 1;
    const y = Math.floor(Math.random() * 200) + 1;
    const col = `#${hash(3)}`;
    await step(`pixel (${x},${y})`, () => models.pixelia.paintPixel(x, y, col));
  }

  console.log('\nSEED: standalone chats / pads / calendars / maps');
  await step('chat', () => models.chats.createChat(`Chat ${hash(2)}`, 'demo', null, 'general', 'OPEN', ['demo'], null));
  await step('pad', () => models.pads.createPad(`Pad ${hash(2)}`, 'OPEN', futureISO(30), ['demo'], null));
  await step('calendar', () => models.calendars.createCalendar({ title: `Cal ${hash(2)}`, status: 'OPEN', deadline: futureISO(60), tags: ['demo'], firstDate: futureISO(10), firstDateLabel: 'first', firstNote: '', tribeId: null }));
  await step('map (SINGLE)', () => models.maps.createMap(40.4, -3.7, 'Madrid', 'SINGLE', ['demo'], `Map ${hash(2)}`, null, 'pin', null));

  console.log('\nSEED: tribes + content inside');
  const tribe = await step('public tribe', () => tribesModel.createTribe(`Tribe ${hash(2)}`, 'public tribe demo', null, '', ['demo'], false, false, 'strict', null, 'OPEN', ''));
  if (tribe && tribe.key) {
    await step('feed inside tribe', () => models.tribesContent.create(tribe.key, 'feed', { description: `tribe feed ${longHash()}` }));
    await step('event inside tribe', () => models.tribesContent.create(tribe.key, 'event', { title: `tribe event ${hash(2)}`, description: 'demo', date: futureISO(15) }));
  }
  const priv = await step('private tribe', () => tribesModel.createTribe(`Secret ${hash(2)}`, 'private demo', null, '', ['demo'], false, true, 'strict', null, 'OPEN', ''));
  if (priv && priv.key) {
    await step('feed inside private tribe', () => models.tribesContent.create(priv.key, 'feed', { description: `private demo ${longHash()}` }));
    const code = await step('generate invite', () => tribesModel.generateInvite(priv.key));
    if (code) console.log(`    (invite code: ${code})`);
  }

  console.log('\nDONE. Boot oasis (sh oasis.sh) to visually inspect the seeded content.');
  process.exit(0);
})().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

function futureISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
