let _inboxCount = 0;
let _inboxPmCount = 0;
let _inboxNotifCount = 0;
let _carbonHcT = 0;
let _walletReady = false;
let _donatableAuthors = new Set();
let _carbonHcH = 0;
let _lastRefresh = 0;
let _onlinePeers = null;
let _syncedPeers = null;
let _inboxUnread = null;
let _lastSyncTs = null;
let _ecoValue = null;
let _lastActivity = null;
let _maxBlockBytes = 0;
let _inhabitantCount = 0;
let _tribesCount = 0;
let _mentionsCount = 0;
let _mentionsTotal = 0;
let _bestMatch = null;
let _dismissedSuggestion = null;
let _featuredEmergency = null;
let _dismissedEmergency = null;

module.exports = {
  getInboxCount: () => _inboxCount,
  setInboxCount: (n) => { _inboxCount = n; },
  getInboxPmCount: () => _inboxPmCount,
  setInboxPmCount: (n) => { _inboxPmCount = n; },
  getInboxNotifCount: () => _inboxNotifCount,
  setInboxNotifCount: (n) => { _inboxNotifCount = n; },
  getCarbonHcT: () => _carbonHcT,
  setCarbonHcT: (n) => { _carbonHcT = n; },
  getDonatableAuthors: () => _donatableAuthors,
  setDonatableAuthors: (set) => { _donatableAuthors = set instanceof Set ? set : new Set(); },
  getWalletReady: () => _walletReady,
  setWalletReady: (v) => { _walletReady = !!v; },
  getCarbonHcH: () => _carbonHcH,
  setCarbonHcH: (n) => { _carbonHcH = n; },
  getLastRefresh: () => _lastRefresh,
  setLastRefresh: (t) => { _lastRefresh = t; },
  getOnlinePeerCount: () => _onlinePeers,
  setOnlinePeerCount: (n) => { _onlinePeers = n; },
  getSyncedPeerCount: () => _syncedPeers,
  setSyncedPeerCount: (n) => { _syncedPeers = Math.max(0, Number(n) || 0); },
  getInboxUnreadCount: () => _inboxUnread,
  setInboxUnreadCount: (n) => { _inboxUnread = n; },
  getLastSyncTs: () => _lastSyncTs,
  setLastSyncTs: (t) => { _lastSyncTs = t; },
  getEcoValue: () => _ecoValue,
  setEcoValue: (v) => { _ecoValue = v; },
  getLastActivity: () => _lastActivity,
  setLastActivity: (a) => { _lastActivity = a; },
  getMaxBlockBytes: () => _maxBlockBytes,
  setMaxBlockBytes: (n) => { if (Number(n) > _maxBlockBytes) _maxBlockBytes = Number(n); },
  getMentionsTotal: () => _mentionsTotal,
  setMentionsTotal: (n) => { _mentionsTotal = Math.max(0, Number(n) || 0); },
  getMentionsCount: () => _mentionsCount,
  setMentionsCount: (n) => { _mentionsCount = Math.max(0, Number(n) || 0); },
  getInhabitantCount: () => _inhabitantCount,
  setInhabitantCount: (n) => { _inhabitantCount = Math.max(0, Number(n) || 0); },
  getTribesCount: () => _tribesCount,
  setTribesCount: (n) => { _tribesCount = Math.max(0, Number(n) || 0); },
  getFeaturedEmergency: () => _featuredEmergency,
  setFeaturedEmergency: (a) => { _featuredEmergency = a || null; },
  getDismissedEmergency: () => _dismissedEmergency,
  setDismissedEmergency: (id) => { _dismissedEmergency = id || null; },
  getBestMatch: () => _bestMatch,
  setBestMatch: (m) => { _bestMatch = m || null; },
  getDismissedSuggestion: () => _dismissedSuggestion,
  setDismissedSuggestion: (href) => { _dismissedSuggestion = href || null; }
};
