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
    industry: require(path.join(__dirname, '..', 'src', 'models', 'industry_model'))({ cooler: sCooler }),
    cv: require(path.join(__dirname, '..', 'src', 'models', 'cv_model'))({ cooler: sCooler }),
    reports: require(path.join(__dirname, '..', 'src', 'models', 'reports_model'))({ cooler: sCooler, tribeCrypto }),
    shops: require(path.join(__dirname, '..', 'src', 'models', 'shops_model'))({ cooler: sCooler, tribeCrypto }),
    pixelia: require(path.join(__dirname, '..', 'src', 'models', 'pixelia_model'))({ cooler: sCooler, tribeCrypto }),
    torrents: require(path.join(__dirname, '..', 'src', 'models', 'torrents_model'))({ cooler: sCooler, tribeCrypto }),
    polls: require(path.join(__dirname, '..', 'src', 'models', 'polls_model'))({ cooler: sCooler, tribeCrypto }),
    blogs: require(path.join(__dirname, '..', 'src', 'models', 'blog_model'))({ cooler: sCooler }),
    housing: require(path.join(__dirname, '..', 'src', 'models', 'housing_model'))({ cooler: sCooler, tribeCrypto }),
    logs: require(path.join(__dirname, '..', 'src', 'models', 'logs_model'))({ cooler: sCooler }),
    parliament: null,
    tribes: null
  };
  const tribesModel = require(path.join(__dirname, '..', 'src', 'models', 'tribes_model'))({ cooler: sCooler, tribeCrypto });
  models.tribes = tribesModel;
  models.tribesContent = require(path.join(__dirname, '..', 'src', 'models', 'tribes_content_model'))({ cooler: sCooler, tribeCrypto, tribesModel });
  models.pads = require(path.join(__dirname, '..', 'src', 'models', 'pads_model'))({ cooler: sCooler, cipherModel: { encryptECB: x => x, decryptECB: x => x }, tribeCrypto, padCrypto, tribesModel });
  models.chats = require(path.join(__dirname, '..', 'src', 'models', 'chats_model'))({ cooler: sCooler, tribeCrypto, chatCrypto, tribesModel });
  models.calendars = require(path.join(__dirname, '..', 'src', 'models', 'calendars_model'))({ cooler: sCooler, tribeCrypto, calendarCrypto, tribesModel });
  models.maps = require(path.join(__dirname, '..', 'src', 'models', 'maps_model'))({ cooler: sCooler, tribeCrypto, mapCrypto, tribesModel });
  models.parliament = require(path.join(__dirname, '..', 'src', 'models', 'parliament_model'))({ cooler: sCooler, services: { votes: models.votes, tribes: tribesModel } });
  models.larp = require(path.join(__dirname, '..', 'src', 'models', 'larp_model'))({ cooler: sCooler, tribesModel, tribeCrypto });
  models.courts = require(path.join(__dirname, '..', 'src', 'models', 'courts_model'))({ cooler: sCooler, services: { parliament: models.parliament }, tribeCrypto });

  console.log('SEED: feed');
  for (let i = 0; i < 3; i++) {
    await step(`feed post #${i}`, () => models.feed.createFeed(`Seed feed ${hash(3)} — hello oasis #${i}`, []));
  }

  console.log('\nSEED: posts');
  const meIdEarly = (await sCooler.open()).id;
  for (let i = 0; i < 2; i++) {
    await step(`post #${i}`, () => new Promise((res, rej) => sCooler.open().then(ssb => ssb.publish({
      type: 'post',
      text: `Seed post #${i} ${hash(3)}`
    }, (e, m) => e ? rej(e) : res(m)))));
  }

  console.log('\nSEED: media');
  let seedImageKey = null;
  for (let i = 0; i < 2; i++) {
    await step(`audio ${i}`, () => models.audios.createAudio(fakeBlob('a'), pickTags(2), `Track ${hash(2)}`, `Audio dummy ${hash(3)}`, ''));
    await step(`video ${i}`, () => models.videos.createVideo(fakeBlob('v'), pickTags(2), `Vid ${hash(2)}`, `Video dummy ${hash(3)}`, ''));
    const img = await step(`image ${i}`, () => models.images.createImage(fakeBlob('i'), pickTags(2), `Pic ${hash(2)}`, `Image ${hash(3)}`, ''));
    if (img && img.key && !seedImageKey) seedImageKey = img.key;
    await step(`doc ${i}`, () => models.documents.createDocument(fakeBlob('d'), pickTags(2), `Doc ${hash(2)}`, `${longHash()}`));
    await step(`bookmark ${i}`, () => models.bookmarks.createBookmark(`https://example.com/${hash(3)}`, pickTags(2), `bookmark dummy ${hash(2)}`, new Date().toISOString()));
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
  const seedVote = await step('votation', () => models.votes.createVote(`Should we ${hash(2)}?`, futureISO(30), ['YES', 'NO', 'ABSTENTION']));

  console.log('\nSEED: events');
  await step('event', () => models.events.createEvent(`Meetup ${hash(2)}`, `Description ${longHash()}`, futureISO(14), 'remote', 0, '', [], pickTags(2), 'public', ''));

  console.log('\nSEED: tasks');
  await step('task', () => models.tasks.createTask(`Task ${hash(2)}`, `desc ${hash(4)}`, futureISO(1), futureISO(5), 'LOW', 'remote', pickTags(2), 'public'));

  console.log('\nSEED: transfers (3 categories)');
  const meId = (await sCooler.open()).id;
  await step('transfer ECONOMIC', () => models.transfers.createTransfer(meId, `Pay ${hash(2)}`, '10', futureISO(30), pickTags(2), 'ECONOMIC'));
  await step('transfer TIME', () => models.transfers.createTransfer(meId, `Help ${hash(2)}`, '2', futureISO(30), pickTags(2), 'TIME'));
  await step('transfer TRUST', () => models.transfers.createTransfer(meId, `Vouch ${hash(2)}`, '1', futureISO(30), pickTags(2), 'TRUST'));

  console.log('\nSEED: profile about');
  await step('profile name', () => new Promise((res, rej) => sCooler.open().then(ssb => ssb.publish({ type: 'about', about: meId, name: `Seed user ${hash(2)}`, description: 'Auto-generated dummy profile' }, (e, m) => e ? rej(e) : res(m)))));

  console.log('\nSEED: market (public + hidden)');
  await step('market exchange (public)', () => models.market.createItem('exchange', `Item ${hash(2)}`, `desc ${longHash()}`, null, 5, pickTags(2), 'NEW', futureISO(30), false, 1, '', {}, 'PUBLIC'));
  await step('market exchange (hidden)', () => models.market.createItem('exchange', `Hidden ${hash(2)}`, `desc ${longHash()}`, null, 7, pickTags(2), 'USED', futureISO(30), false, 1, '', {}, 'HIDDEN'));
  await step('market auction', () => models.market.createItem('auction', `Auction ${hash(2)}`, `${longHash()}`, null, 10, pickTags(2), 'USED', futureISO(30), false, 1, ''));

  console.log('\nSEED: jobs');
  await step('job', () => models.jobs.createJob({ title: `Job ${hash(2)}`, description: 'demo', location: 'remote', job_type: 'freelancer', job_time: 'partial', vacants: 1, salary: 1000, requirements: 'demo', tags: pickTags(2), status: 'OPEN' }));

  console.log('\nSEED: projects');
  await step('project', () => models.projects.createProject({ title: `Project ${hash(2)}`, description: 'demo', goal: '100', deadline: futureISO(60), tags: pickTags(2), status: 'ACTIVE' }));

  console.log('\nSEED: industry');
  const facility = await step('facility', () => models.industry.createFacility({ name: `Facility ${hash(2)}`, sector: 'hardware', description: 'demo network-owned facility', membershipPolicy: 'open', laborRate: 10, quorum: 1, majority: 0.5, tags: pickTags(3) }));
  if (facility && facility.key) {
    const blueprint = await step('blueprint', () => models.industry.createBlueprint(facility.key, { name: `Blueprint ${hash(2)}`, description: 'A sturdy demo widget, 2kg, open hardware docs included.', outKind: 'physical', laborHours: 5, materialsText: 'steel:2:12\nbolt:8:0.5' }));
    if (blueprint && blueprint.key) {
      await step('build', () => models.industry.createBuild(facility.key, { title: `Build ${hash(2)}`, notes: 'demo build', blueprintId: blueprint.key, startDate: futureISO(1).slice(0, 10), endDate: futureISO(20).slice(0, 10) }));
    }
  }

  console.log('\nSEED: reports');
  await step('report', () => models.reports.createReport(`Issue ${hash(2)}`, `report demo ${longHash()}`, 'tech', null, pickTags(2), 'low', {}));

  console.log('\nSEED: cv');
  await step('cv', () => models.cv.createCV({ name: `Seed CV ${hash(2)}`, description: 'demo curriculum', personalSkills: 'p2p, libre', professionalSkills: 'welding, coding', oasisSkills: 'seeding', educationalSkills: 'self-taught', languages: 'en, es', location: 'remote', status: 'LOOKING FOR WORK', visibility: 'PUBLIC' }, null));

  console.log('\nSEED: shops');
  const shop = await step('shop', () => models.shops.createShop(`Shop ${hash(2)}`, 'short', 'long', null, '', 'remote', pickTags(2), 'OPEN', ''));
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
  const seedChat = await step('chat', () => models.chats.createChat(`Chat ${hash(2)}`, 'demo', null, 'general', 'OPEN', pickTags(2), null));
  const seedPad = await step('pad', () => models.pads.createPad(`Pad ${hash(2)}`, 'OPEN', futureISO(30), pickTags(2), null));
  const seedCalendar = await step('calendar', () => models.calendars.createCalendar({ title: `Cal ${hash(2)}`, status: 'OPEN', deadline: futureISO(60), tags: pickTags(2), firstDate: futureISO(10), firstDateLabel: 'first', firstNote: '', tribeId: null }));
  const seedMap = await step('map (SINGLE)', () => models.maps.createMap(40.4, -3.7, 'Madrid', 'SINGLE', pickTags(2), `Map ${hash(2)}`, null, 'Puerta del Sol — kilometre zero', null));
  const seedOpenMap = await step('map (OPEN)', () => models.maps.createMap(41.4, 2.2, 'Barcelona', 'OPEN', pickTags(2), `Region ${hash(2)}`, null, 'Sagrada Família — meeting point', null));
  if (seedOpenMap && seedOpenMap.key) {
    await step('marker with note', () => models.maps.addMarker(seedOpenMap.key, 41.38, 2.17, `Beach cleanup this cycle ${hash(2)} — bring gloves`, ''));
    await step('second marker', () => models.maps.addMarker(seedOpenMap.key, 41.42, 2.22, `Community garden https://example.org/${hash(2)}`, ''));
  }

  console.log('\nSEED: tribes + content inside');
  const tribe = await step('public tribe', () => tribesModel.createTribe(`Tribe ${hash(2)}`, 'public tribe demo', null, '', pickTags(2), false, 'strict', null, 'OPEN', ''));
  if (tribe && tribe.key) {
    await step('feed inside tribe', () => models.tribesContent.create(tribe.key, 'feed', { description: `tribe feed ${longHash()}` }));
    await step('event inside tribe', () => models.tribesContent.create(tribe.key, 'event', { title: `tribe event ${hash(2)}`, description: 'demo', date: futureISO(15) }));
  }
  const priv = await step('private tribe', () => tribesModel.createTribe(`Secret ${hash(2)}`, 'private demo', null, '', pickTags(2), true, 'strict', null, 'OPEN', ''));
  if (priv && priv.key) {
    await step('feed inside private tribe', () => models.tribesContent.create(priv.key, 'feed', { description: `private demo ${longHash()}` }));
    const code = await step('generate invite', () => tribesModel.generateInvite(priv.key));
    if (code) console.log(`    (invite code: ${code})`);
  }

  console.log('\nSEED: polls');
  const seedPolls = [];
  for (const [q, opts, multiple] of [
    [`Where do we meet ${hash(2)}?`, ['Plaza', 'Park', 'Bar'], false],
    [`Which modules matter most ${hash(2)}?`, ['Forum', 'Market', 'Tribes', 'L.A.R.P.'], true]
  ]) {
    const r = await step(`poll "${q.slice(0, 24)}"`, () => models.polls.createPoll({ question: q, options: opts, multiple, deadline: futureISO(20), tags: pickTags(2) }));
    if (r && r.key) seedPolls.push({ key: r.key, option: opts[0] });
  }
  for (const p of seedPolls) {
    await step('vote on poll', () => models.polls.vote(p.key, [p.option]));
  }

  console.log('\nSEED: blogs');
  for (let i = 0; i < 2; i++) {
    await step(`blog ${i}`, () => models.blogs.createBlog({ subject: `Blog ${hash(2)}`, text: `# Seed blog\n\nSome libre content ${longHash()}.` }));
  }

  console.log('\nSEED: housing');
  const todayISO = new Date().toISOString().slice(0, 10);
  for (const [type, prop, price] of [['rent', 'apartment', 450], ['sale', 'house', 90000], ['couchsurfing', 'room', 0]]) {
    await step(`housing ${type}`, () => models.housing.createHousing({
      title: `${type} ${hash(2)}`, description: `Seeded ${type} listing ${longHash()}`,
      housing_type: type, property_type: prop, price, rooms: 2, size: 60, capacity: 3,
      availableFrom: todayISO, availableTo: futureISO(90).slice(0, 10),
      place: 'remote', tags: pickTags(2), status: 'OPEN'
    }));
  }

  console.log('\nSEED: logs');
  for (let i = 0; i < 3; i++) {
    await step(`log ${i}`, () => models.logs.createManual(`label-${hash(2)}`, `Seeded log entry ${longHash()}`));
  }

  console.log('\nSEED: larp');
  await step('join ACADEMIA', () => models.larp.publishJoin('academia'));
  await step('house post', () => models.larp.publishHousePost({ house: 'academia', text: `Seeded wall post ${hash(3)}` }));

  console.log('\nSEED: parliament');
  await step('proposal', () => models.parliament.createProposal({ title: `Proposal ${hash(2)}`, description: `Seeded motion ${longHash()}` }));

  console.log('\nSEED: courts');
  await step('case', () => models.courts.openCase({ titleBase: `Dispute ${hash(2)}`, respondentInput: meId, method: 'POPULAR' }));

  console.log('\nSEED: opinions + comments on seeded content');
  const OPINION_CATS = ['interesting', 'necessary', 'useful', 'insightful', 'funny'];
  const opinionTargets = [
    ['polls', seedPolls[0] && seedPolls[0].key],
    ['images', seedImageKey],
    ['votes', seedVote && seedVote.key]
  ].filter(([, k]) => k);
  for (const [kind, key] of opinionTargets) {
    await step(`opinion on ${kind}`, () => models[kind].createOpinion(key, OPINION_CATS[Math.floor(Math.random() * OPINION_CATS.length)]));
  }
  const commentTargets = [seedChat, seedPad, seedCalendar, seedMap].filter(x => x && x.key).slice(0, 2);
  for (const t of commentTargets) {
    await step('comment', () => new Promise((res, rej) => sCooler.open().then(ssb => ssb.publish({
      type: 'post', text: `Seeded comment ${hash(3)}`, root: t.key, branch: t.key
    }, (e, m) => e ? rej(e) : res(m)))));
  }

  console.log('\nSEED: favorites');
  const contentFavorites = require(path.join(__dirname, '..', 'src', 'backend', 'content_favorites'));
  for (const [kind, obj] of [['chats', seedChat], ['pads', seedPad], ['calendars', seedCalendar]]) {
    if (obj && obj.key) await step(`favorite ${kind}`, () => contentFavorites.addFavorite(kind, obj.key));
  }

  console.log('\nSEED: a neighbour who mentions you (mentions only count from other feeds)');
  const ssbKeys = require(path.join(__dirname, '..', 'src', 'server', 'node_modules', 'ssb-keys'));
  const validate = require(path.join(__dirname, '..', 'src', 'server', 'node_modules', 'ssb-validate'));
  const neighbour = ssbKeys.generate();
  let neighbourState = validate.initial();
  const ssbAdd = await sCooler.open();
  const publishAsNeighbour = (content) => {
    neighbourState = validate.appendNew(neighbourState, null, neighbour, content, Date.now());
    const queued = neighbourState.queue[neighbourState.queue.length - 1];
    return new Promise((res, rej) => ssbAdd.add(queued.value, (e, m) => e ? rej(e) : res(m)));
  };
  const mentionOfMe = { link: meId, name: 'you' };
  await step('neighbour profile', () => publishAsNeighbour({ type: 'about', about: neighbour.id, name: `Neighbour ${hash(2)}`, description: 'Seeded neighbour so mentions have a sender' }));
  await step('mention in a post', () => publishAsNeighbour({ type: 'post', text: `Hey [@you](${meId}), take a look at this ${hash(3)}`, mentions: [mentionOfMe] }));
  await step('mention in a feed', () => publishAsNeighbour({ type: 'feed', text: `[@you](${meId}) what do you think? ${hash(3)}`, mentions: [mentionOfMe], createdAt: new Date().toISOString() }));
  await step('mention in a report', () => publishAsNeighbour({ type: 'report', title: `Bug spotted ${hash(2)}`, description: `Reported by a neighbour, [@you](${meId}) may want to confirm.`, category: 'BUGS', severity: 'low', status: 'OPEN', tags: pickTags(2), createdAt: new Date().toISOString() }));
  if (seedChat && seedChat.key) {
    await step('mention in a comment', () => publishAsNeighbour({ type: 'post', text: `Replying here and pinging [@you](${meId})`, root: seedChat.key, branch: seedChat.key, mentions: [mentionOfMe] }));
  }

  console.log('\nSEED: spreads (publish type:spread referencing existing content)');
  const pull = require(path.join(__dirname, '..', 'src', 'server', 'node_modules', 'pull-stream'));
  const ssbOpen = await sCooler.open();
  const myFeed = ssbOpen.id;
  const myMsgs = await new Promise((resolve) => {
    pull(
      ssbOpen.createUserStream({ id: myFeed, reverse: true, limit: 100 }),
      pull.collect((err, msgs) => {
        if (err) return resolve([]);
        const SPREADABLE = new Set(['audio','video','image','document','torrent','bookmark','event','task','chat','pad','map','forum','post','feed','market','project','transfer','job','votes','vote','shop','shopProduct','report','calendar']);
        const out = [];
        for (const m of msgs || []) {
          const c = m.value && m.value.content;
          if (!c || typeof c !== 'object') continue;
          if (SPREADABLE.has(c.type)) out.push({ key: m.key, type: c.type });
        }
        resolve(out);
      })
    );
  });
  for (const m of myMsgs.slice(0, 12)) {
    await step(`spread ${m.type} ${m.key.slice(1, 9)}`,
      () => new Promise((res, rej) => ssbOpen.publish({ type: 'spread', link: m.key, expression: '🔁' }, (e, msg) => e ? rej(e) : res(msg)))
    );
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
