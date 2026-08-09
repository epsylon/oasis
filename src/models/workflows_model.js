const ALL_MODULES = [
  'agenda', 'ai', 'aiNav', 'audios', 'banking', 'blogs', 'bookmarks', 'calendars', 'chats', 'cipher',
  'courts', 'dev', 'docs', 'events', 'favorites', 'fediverse', 'feed', 'forum', 'games', 'graphos',
  'housing', 'images', 'industry', 'invites', 'jobs', 'larp', 'legacy', 'logs', 'maps', 'market',
  'melody', 'opinions', 'pads', 'parliament', 'pixelia', 'polls', 'projects', 'reports', 'shops',
  'tags', 'tasks', 'torrents', 'transfers', 'trending', 'tribes', 'videos', 'votes', 'wallet'
];

const NETWORK = ['feed', 'blogs', 'tags', 'trending', 'opinions', 'pads', 'forum', 'maps', 'chats'];
const MEDIA = ['audios', 'bookmarks', 'docs', 'images', 'torrents', 'videos'];
const OFFICE = ['agenda', 'calendars', 'events', 'tasks', 'reports', 'favorites'];
const GOVERNANCE = ['tribes', 'larp', 'votes', 'polls', 'parliament', 'courts', 'logs'];
const ECONOMY = ['banking', 'wallet', 'transfers', 'market', 'housing', 'jobs', 'shops', 'industry', 'projects'];

const MOBILE_MODULES = [
  'agenda', 'favorites', 'wallet', 'tribes', 'larp', 'votes', 'polls', 'events', 'calendars', 'tasks',
  'reports', 'banking', 'market', 'housing', 'jobs', 'shops', 'transfers', 'cipher', 'invites',
  'games', 'audios', 'bookmarks', 'docs', 'images', ...NETWORK
];

const WORKFLOWS = [
  {
    key: 'default',
    theme: 'Dark-SNH',
    homePage: 'activity',
    modules: ALL_MODULES.filter(m => m !== 'aiNav')
  },
  {
    key: 'jobs',
    theme: 'Clear-SNH',
    homePage: 'activity',
    modules: [...OFFICE, 'jobs', 'projects', 'industry', 'market', 'shops', 'banking', 'wallet', 'transfers',
      'forum', 'chats', 'pads', 'feed', 'tags', 'trending', 'docs', 'invites']
  },
  {
    key: 'ruling',
    theme: 'Purple-SNH',
    homePage: 'activity',
    modules: [...GOVERNANCE, ...OFFICE, 'forum', 'pads', 'chats', 'feed', 'blogs', 'opinions', 'tags', 'trending', 'docs', 'invites']
  },
  {
    key: 'politics',
    theme: 'Dark-SNH',
    homePage: 'trending',
    modules: ['parliament', 'courts', 'votes', 'polls', 'reports', 'logs', 'forum', 'opinions', 'blogs',
      'feed', 'tags', 'trending', 'pads', 'chats', 'fediverse', 'tribes', 'events', 'agenda']
  },
  {
    key: 'social',
    theme: 'Clear-SNH',
    homePage: 'feed',
    modules: [...NETWORK, ...MEDIA, 'events', 'calendars', 'agenda', 'favorites', 'games', 'pixelia',
      'melody', 'tribes', 'fediverse', 'invites', 'polls']
  },
  {
    key: 'business',
    theme: 'Dark-SNH',
    homePage: 'activity',
    modules: [...ECONOMY, ...OFFICE, 'forum', 'chats', 'pads', 'docs', 'feed', 'tags', 'trending', 'invites', 'cipher']
  },
  {
    key: 'night',
    theme: 'Matrix-SNH',
    homePage: 'feed',
    modules: ['feed', 'blogs', 'opinions', 'chats', 'forum', 'tags', 'trending', 'audios', 'videos',
      'images', 'bookmarks', 'melody', 'games', 'pixelia', 'favorites']
  },
  {
    key: 'mobile',
    theme: 'OasisMobile',
    homePage: 'activity',
    modules: MOBILE_MODULES
  }
];

const WORKFLOW_KEYS = WORKFLOWS.map(w => w.key);

const getWorkflow = (key) => WORKFLOWS.find(w => w.key === String(key || '')) || null;

const modulesOf = (workflow) => {
  const set = new Set(workflow.modules.filter(m => ALL_MODULES.includes(m)));
  return ALL_MODULES.filter(m => set.has(m));
};

const currentWorkflow = (config) => {
  const modules = (config && config.modules) || {};
  const theme = (config && config.themes && config.themes.current) || '';
  return WORKFLOW_KEYS.find(key => {
    const w = getWorkflow(key);
    if (theme !== w.theme) return false;
    const on = new Set(modulesOf(w));
    return ALL_MODULES.every(m => (modules[`${m}Mod`] === 'on') === on.has(m));
  }) || null;
};

module.exports = {
  ALL_MODULES,
  MOBILE_MODULES,
  WORKFLOWS,
  WORKFLOW_KEYS,
  getWorkflow,
  modulesOf,
  currentWorkflow
};
