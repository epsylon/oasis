const ALL_MODULES = [
  'agenda', 'ai', 'aiNav', 'emergencies', 'audios', 'backup', 'banking', 'blogs', 'bookmarks', 'calendars', 'campaigns', 'chats', 'cipher',
  'courts', 'dev', 'docs', 'events', 'favorites', 'fediverse', 'feed', 'forum', 'games', 'graphos',
  'housing', 'images', 'industry', 'invites', 'jobs', 'larp', 'logistics', 'logs', 'mailing', 'maps', 'market',
  'melody', 'opinions', 'pads', 'wiki', 'parliament', 'pixelia', 'podcasts', 'polls', 'projects', 'reports', 'school', 'shops',
  'tags', 'tasks', 'torrents', 'transfers', 'trending', 'tribes', 'videos', 'votes', 'wallet'
];

const NETWORK = ['feed', 'blogs', 'tags', 'trending', 'opinions', 'pads', 'wiki', 'forum', 'maps', 'chats'];
const MEDIA = ['audios', 'bookmarks', 'docs', 'images', 'torrents', 'videos', 'podcasts'];
const OFFICE = ['agenda', 'calendars', 'campaigns', 'events', 'tasks', 'reports', 'mailing', 'favorites'];
const GOVERNANCE = ['tribes', 'larp', 'votes', 'polls', 'school', 'parliament', 'courts', 'emergencies', 'logs'];
const ECONOMY = ['banking', 'wallet', 'transfers', 'market', 'logistics', 'housing', 'jobs', 'shops', 'industry', 'projects'];

const MOBILE_MODULES = [
  'agenda', 'favorites', 'wallet', 'tribes', 'larp', 'votes', 'polls', 'events', 'calendars', 'tasks',
  'reports', 'banking', 'market', 'housing', 'jobs', 'shops', 'school', 'transfers', 'cipher', 'invites',
  'games', 'audios', 'bookmarks', 'docs', 'images', 'emergencies', 'mailing', 'logistics', 'podcasts', 'campaigns', ...NETWORK
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
      'forum', 'chats', 'pads', 'wiki', 'feed', 'tags', 'trending', 'docs', 'invites']
  },
  {
    key: 'ruling',
    theme: 'Purple-SNH',
    homePage: 'activity',
    modules: [...GOVERNANCE, ...OFFICE, 'forum', 'pads', 'wiki', 'chats', 'feed', 'blogs', 'opinions', 'tags', 'trending', 'docs', 'invites']
  },
  {
    key: 'politics',
    theme: 'Dark-SNH',
    homePage: 'trending',
    modules: ['parliament', 'courts', 'emergencies', 'votes', 'polls', 'reports', 'logs', 'forum', 'opinions', 'blogs',
      'feed', 'tags', 'trending', 'pads', 'wiki', 'chats', 'fediverse', 'tribes', 'events', 'agenda']
  },
  {
    key: 'social',
    theme: 'Clear-SNH',
    homePage: 'feed',
    modules: [...NETWORK, ...MEDIA, 'events', 'calendars', 'agenda', 'favorites', 'games', 'pixelia',
      'melody', 'tribes', 'fediverse', 'invites', 'polls', 'school', 'emergencies']
  },
  {
    key: 'business',
    theme: 'Dark-SNH',
    homePage: 'activity',
    modules: [...ECONOMY, ...OFFICE, 'forum', 'chats', 'pads', 'wiki', 'emergencies', 'docs', 'feed', 'tags', 'trending', 'invites', 'cipher']
  },
  {
    key: 'night',
    theme: 'Matrix-SNH',
    homePage: 'feed',
    modules: ['feed', 'blogs', 'opinions', 'chats', 'forum', 'tags', 'trending', 'audios', 'videos',
      'images', 'bookmarks', 'melody', 'games', 'pixelia', 'favorites', 'school']
  },
  {
    key: 'kids',
    theme: 'Clear-SNH',
    homePage: 'activity',
    modules: ['school', 'games', 'pixelia', 'melody', 'images', 'audios', 'videos', 'docs', 'bookmarks',
      'agenda', 'calendars', 'events', 'tasks', 'favorites', 'feed', 'blogs', 'chats', 'pads', 'maps',
      'tags', 'trending', 'tribes', 'larp', 'polls', 'opinions', 'invites']
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
