const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeNetwork, makeNode, makeCooler, generateKeypair } = require('./mock-ssb');

const tmpRoot = path.join(os.tmpdir(), 'oasis-tests-' + process.pid);
let counter = 0;
const fresh = () => {
  counter++;
  const dir = path.join(tmpRoot, 'd-' + counter + '-' + Math.random().toString(36).slice(2));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const tribeCryptoFactory = require('../../src/models/crypto');
const realConfig = require('../../src/server/ssb_config');

const FACTORIES = {
  tribes: '../../src/models/tribes_model',
  tribesContent: '../../src/models/tribes_content_model',
  audios: '../../src/models/audios_model',
  videos: '../../src/models/videos_model',
  images: '../../src/models/images_model',
  documents: '../../src/models/documents_model',
  bookmarks: '../../src/models/bookmarking_model',
  forum: '../../src/models/forum_model',
  transfers: '../../src/models/transfers_model',
  votes: '../../src/models/votes_model',
  events: '../../src/models/events_model',
  tasks: '../../src/models/tasks_model',
  chats: '../../src/models/chats_model',
  pads: '../../src/models/pads_model',
  maps: '../../src/models/maps_model',
  torrents: '../../src/models/torrents_model',
  calendars: '../../src/models/calendars_model',
  reports: '../../src/models/reports_model',
  market: '../../src/models/market_model',
  jobs: '../../src/models/jobs_model',
  projects: '../../src/models/projects_model',
  opinions: '../../src/models/opinions_model',
  inhabitants: '../../src/models/inhabitants_model',
  parliament: '../../src/models/parliament_model',
  courts: '../../src/models/courts_model',
  shops: '../../src/models/shops_model',
  pixelia: '../../src/models/pixelia_model',
  pm: '../../src/models/pm_model',
  feed: '../../src/models/feed_model',
  tags: '../../src/models/tags_model',
  search: '../../src/models/search_model',
  trending: '../../src/models/trending_model',
  agenda: '../../src/models/agenda_model',
  cv: '../../src/models/cv_model',
  favorites: '../../src/models/favorites_model',
  banking: '../../src/models/banking_model',
  activity: '../../src/models/activity_model',
  stats: '../../src/models/stats_model',
  blockchain: '../../src/models/blockchain_model',
  larp: '../../src/models/larp_model',
  melody: '../../src/models/melody_model'
};

function loadFactory(name) {
  const p = FACTORIES[name];
  if (!p) throw new Error('Unknown factory: ' + name);
  return require(p);
}

function makePeer(network, keypair) {
  const kp = keypair || generateKeypair();
  const node = makeNode(network, kp);
  const cooler = makeCooler(node);
  const configDir = fresh();
  const tribeCrypto = tribeCryptoFactory(configDir, 'tribes');
  const chatCrypto = tribeCryptoFactory(configDir, 'chats');
  const padCrypto = tribeCryptoFactory(configDir, 'pads');
  const mapCrypto = tribeCryptoFactory(configDir, 'maps');
  const calendarCrypto = tribeCryptoFactory(configDir, 'calendars');
  const eventCrypto = tribeCryptoFactory(configDir, 'events');
  const forumCrypto = tribeCryptoFactory(configDir, 'forum');
  const baseDeps = { cooler, isPublic: false, tribeCrypto };
  const models = {};
  const requireOnce = (name) => {
    if (models[name]) return models[name];
    const f = loadFactory(name);
    let deps;
    if (name === 'tribesContent' || name === 'torrents') {
      deps = { ...baseDeps, tribesModel: requireOnce('tribes') };
    } else if (name === 'chats') {
      deps = { ...baseDeps, chatCrypto, tribesModel: requireOnce('tribes') };
    } else if (name === 'pads') {
      deps = { ...baseDeps, padCrypto, tribesModel: requireOnce('tribes') };
    } else if (name === 'maps') {
      deps = { ...baseDeps, mapCrypto, tribesModel: requireOnce('tribes') };
    } else if (name === 'calendars') {
      deps = { ...baseDeps, calendarCrypto, tribesModel: requireOnce('tribes') };
    } else if (name === 'activity' || name === 'stats' || name === 'blockchain' || name === 'larp') {
      deps = { ...baseDeps, tribesModel: requireOnce('tribes') };
    } else if (name === 'events') {
      deps = { ...baseDeps, eventCrypto, tribesModel: requireOnce('tribes') };
    } else if (name === 'forum') {
      deps = { cooler, isPublic: false, tribeCrypto, forumCrypto };
    } else if (name === 'search') {
      deps = { ...baseDeps, padsModel: requireOnce('pads'), tribesModel: requireOnce('tribes') };
    } else if (name === 'tags') {
      deps = { ...baseDeps, padsModel: requireOnce('pads'), tribesModel: requireOnce('tribes') };
    } else if (name === 'favorites') {
      deps = {
        audiosModel: requireOnce('audios'),
        bookmarksModel: requireOnce('bookmarks'),
        documentsModel: requireOnce('documents'),
        imagesModel: requireOnce('images'),
        videosModel: requireOnce('videos'),
        mapsModel: requireOnce('maps'),
        padsModel: requireOnce('pads'),
        chatsModel: requireOnce('chats'),
        calendarsModel: requireOnce('calendars'),
        torrentsModel: requireOnce('torrents')
      };
    } else if (name === 'banking') {
      deps = { services: { cooler, feed: { listAll: async () => [] }, activity: { list: async () => [] } } };
    } else if (name === 'parliament' || name === 'courts') {
      const svc = {
        tribes: requireOnce('tribes'),
        votes: requireOnce('votes'),
        inhabitants: { listInhabitants: async () => [], getLastKarmaScore: async () => 0 },
        banking: { getBankingData: async () => ({ karmaScore: 0 }) }
      };
      deps = { ...baseDeps, services: svc };
    } else if (name === 'reports') {
      deps = baseDeps;
    } else if (name === 'forum') {
      deps = { cooler, isPublic: false };
    } else {
      deps = baseDeps;
    }
    if (name === 'pads') deps.cipherModel = { encryptECB: x => x, decryptECB: x => x };
    models[name] = f(deps);
    return models[name];
  };
  return {
    keypair: kp,
    node,
    cooler,
    tribeCrypto,
    configDir,
    use(name) { return requireOnce(name); },
    setActor() { realConfig.keys = kp; }
  };
}

function makeNetworkAndPeer() {
  const network = makeNetwork();
  const peer = makePeer(network);
  peer.setActor();
  return { network, peer };
}

module.exports = { makePeer, makeNetworkAndPeer, makeNetwork, generateKeypair, fresh, realConfig };
