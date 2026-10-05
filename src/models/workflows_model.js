const ALL_MODULES = [
  'agenda', 'ai', 'aiNav', 'emergencies', 'audios', 'backup', 'banking', 'blogs', 'bookmarks', 'calendars', 'campaigns', 'chats', 'cipher',
  'courts', 'dev', 'docs', 'events', 'favorites', 'fediverse', 'feed', 'files', 'forum', 'games', 'graphos',
  'housing', 'images', 'industry', 'invites', 'jobs', 'larp', 'logistics', 'logs', 'mailing', 'maps', 'market',
  'melody', 'opinions', 'pads', 'wiki', 'parliament', 'phone', 'pixelia', 'podcasts', 'polls', 'projects', 'reports', 'rooms', 'school', 'shops',
  'tags', 'tasks', 'torrents', 'transfers', 'trending', 'tribes', 'videos', 'votes', 'wallet'
];

const NETWORK = ['feed', 'blogs', 'tags', 'trending', 'opinions', 'pads', 'wiki', 'forum', 'maps', 'chats', 'rooms'];
const MEDIA = ['audios', 'bookmarks', 'docs', 'files', 'images', 'torrents', 'videos', 'podcasts'];
const OFFICE = ['agenda', 'calendars', 'campaigns', 'events', 'tasks', 'reports', 'mailing', 'phone', 'favorites'];
const GOVERNANCE = ['tribes', 'larp', 'votes', 'polls', 'school', 'parliament', 'courts', 'emergencies', 'logs'];
const ECONOMY = ['banking', 'wallet', 'transfers', 'market', 'logistics', 'housing', 'jobs', 'shops', 'industry', 'projects'];

const PRESET_BASE = ['backup', 'invites', 'favorites', 'tags', 'trending', 'cipher'];
const PRESETS = {
  minimal: ['feed', 'forum', 'games', 'images', 'videos', 'audios', 'bookmarks', 'tags', 'trending', 'blogs', 'polls', 'opinions', 'cipher', 'backup'],
  social: ['agenda', 'emergencies', 'audios', 'bookmarks', 'calendars', 'campaigns', 'chats', 'cipher', 'courts', 'docs', 'events', 'favorites', 'fediverse', 'feed', 'forum', 'games', 'images', 'invites', 'larp', 'backup', 'logs', 'mailing', 'phone', 'maps', 'blogs', 'polls', 'opinions', 'pads', 'wiki', 'parliament', 'pixelia', 'podcasts', 'melody', 'projects', 'reports', 'rooms', 'school', 'tags', 'tasks', 'trending', 'tribes', 'videos', 'votes'],
  economy: ['agenda', 'emergencies', 'audios', 'bookmarks', 'calendars', 'campaigns', 'chats', 'cipher', 'courts', 'docs', 'events', 'favorites', 'fediverse', 'feed', 'forum', 'games', 'images', 'invites', 'larp', 'backup', 'logs', 'mailing', 'phone', 'maps', 'blogs', 'polls', 'opinions', 'pads', 'wiki', 'parliament', 'pixelia', 'podcasts', 'melody', 'projects', 'reports', 'rooms', 'tags', 'tasks', 'trending', 'tribes', 'videos', 'votes', 'banking', 'wallet', 'transfers', 'market', 'housing', 'jobs', 'shops', 'industry', 'school', 'logistics'],
  office: [...new Set([...OFFICE, 'votes', 'polls', 'projects', 'docs', 'pads', 'wiki', 'tribes', 'chats', 'rooms', 'feed', ...PRESET_BASE])],
  library: [...new Set([...MEDIA, 'feed', ...PRESET_BASE])],
  mobile: null,
  full: null
};

const MOBILE_MODULES = [
  'agenda', 'favorites', 'wallet', 'tribes', 'larp', 'votes', 'polls', 'events', 'calendars', 'tasks',
  'reports', 'banking', 'market', 'housing', 'jobs', 'shops', 'school', 'transfers', 'cipher', 'invites',
  'games', 'audios', 'bookmarks', 'docs', 'files', 'images', 'torrents', 'emergencies', 'mailing', 'logistics', 'podcasts', 'campaigns', ...NETWORK.filter(m => m !== 'rooms')
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
      'forum', 'chats', 'rooms', 'pads', 'wiki', 'feed', 'tags', 'trending', 'docs', 'invites']
  },
  {
    key: 'social',
    theme: 'Clear-SNH',
    homePage: 'feed',
    modules: [...NETWORK, ...MEDIA, 'events', 'calendars', 'agenda', 'favorites', 'phone', 'games', 'pixelia',
      'melody', 'tribes', 'fediverse', 'invites', 'polls', 'school', 'emergencies']
  },
  {
    key: 'business',
    theme: 'Dark-SNH',
    homePage: 'activity',
    modules: [...ECONOMY, ...OFFICE, 'forum', 'chats', 'rooms', 'pads', 'wiki', 'emergencies', 'docs', 'feed', 'tags', 'trending', 'invites', 'cipher']
  },
  {
    key: 'night',
    theme: 'Matrix-SNH',
    homePage: 'feed',
    modules: ['feed', 'blogs', 'opinions', 'chats', 'rooms', 'forum', 'tags', 'trending', 'audios', 'videos',
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
    key: 'activists',
    theme: 'Purple-SNH',
    homePage: 'activity',
    modules: [...GOVERNANCE, ...OFFICE,
      'forum', 'chats', 'rooms', 'feed', 'blogs', 'opinions', 'pads', 'wiki', 'docs', 'images', 'videos', 'audios', 'podcasts',
      'files', 'torrents', 'maps', 'cipher', 'fediverse', 'projects', 'logistics',
      'invites', 'tags', 'trending', 'backup']
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

const applyWorkflow = (cfg, workflow) => {
  const enabled = new Set(modulesOf(workflow));
  cfg.modules = cfg.modules || {};
  ALL_MODULES.forEach(mod => { cfg.modules[`${mod}Mod`] = enabled.has(mod) ? 'on' : 'off'; });
  if (workflow.theme) cfg.themes = { ...(cfg.themes || {}), current: workflow.theme };
  if (workflow.homePage) cfg.homePage = workflow.homePage;
  return cfg;
};

const FULL_WORKFLOW = { key: 'full', modules: ALL_MODULES };

const WIZARD_WORKFLOWS = ['full', 'social', 'activists', 'kids', 'night', 'jobs', 'business', 'mobile'];

const wizardWorkflow = (key) => {
  const k = String(key || '');
  if (!WIZARD_WORKFLOWS.includes(k)) return null;
  return k === 'full' ? FULL_WORKFLOW : getWorkflow(k);
};

PRESETS.mobile = MOBILE_MODULES;
PRESETS.full = ALL_MODULES;

module.exports = {
  ALL_MODULES,
  MOBILE_MODULES,
  PRESETS,
  WORKFLOWS,
  WORKFLOW_KEYS,
  getWorkflow,
  modulesOf,
  currentWorkflow,
  applyWorkflow,
  WIZARD_WORKFLOWS,
  wizardWorkflow
};
