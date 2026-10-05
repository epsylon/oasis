let _inboxCount = 0;
let _phoneCount = 0;
let _phoneCall = null;
let _phoneRoom = null;
let _liveRooms = [];
const _dismissedLiveRooms = new Set();
let _pubIds = new Set();
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
let _matchPool = [];
let _matchIdx = -1;
let _sectionMatches = new Map();
const _dismissedSuggestions = new Set();
let _featuredEmergency = null;
let _dismissedEmergency = null;

module.exports = {
  getInboxCount: () => _inboxCount,
  setInboxCount: (n) => { _inboxCount = n; },
  getPhoneCount: () => _phoneCount,
  setPhoneCount: (n) => { _phoneCount = Number(n) || 0; },
  getPhoneCall: () => _phoneCall,
  setPhoneCall: (st) => { _phoneCall = st || null; },
  getPhoneRoom: () => _phoneRoom,
  setPhoneRoom: (st) => { _phoneRoom = st || null; },
  getLiveRooms: () => _liveRooms.filter(r => !_dismissedLiveRooms.has(r.ref)),
  setLiveRooms: (list) => {
    _liveRooms = Array.isArray(list) ? list : [];
    const live = new Set(_liveRooms.map(r => r.ref));
    for (const ref of [..._dismissedLiveRooms]) if (!live.has(ref)) _dismissedLiveRooms.delete(ref);
  },
  dismissLiveRoom: (ref) => { if (ref) _dismissedLiveRooms.add(String(ref)); },
  getPubIds: () => _pubIds,
  setPubIds: (set) => { _pubIds = set instanceof Set ? set : new Set(); },
  isPubId: (id) => _pubIds.has(String(id || '')),
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
  setMatchPool: (pool) => { _matchPool = Array.isArray(pool) ? pool.filter(m => m && m.href) : []; },
  nextBestMatch: () => {
    const avail = _matchPool.filter(m => !_dismissedSuggestions.has(m.href));
    if (!avail.length) { _bestMatch = null; return null; }
    _matchIdx = (_matchIdx + 1) % avail.length;
    _bestMatch = avail[_matchIdx];
    return _bestMatch;
  },
  setSectionMatches: (map) => { _sectionMatches = map instanceof Map ? map : new Map(); },
  getSectionMatch: (section) => (_sectionMatches.get(String(section || '')) || []).find(m => !_dismissedSuggestions.has(m.href)) || null,
  isKnownSuggestion: (href) => !!href && (_matchPool.some(m => m.href === href) || [..._sectionMatches.values()].some(list => list.some(m => m.href === href))),
  dismissSuggestion: (href) => { if (href) _dismissedSuggestions.add(href); },
  isSuggestionDismissed: (href) => _dismissedSuggestions.has(href)
};
