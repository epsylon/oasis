let _inboxCount = 0;
let _carbonHcT = 0;
let _carbonHcH = 0;
let _lastRefresh = 0;
let _onlinePeers = null;
let _inboxUnread = null;
let _lastSyncTs = null;
let _ecoValue = null;
let _lastActivity = null;
let _maxBlockBytes = 0;
let _inhabitantCount = 0;
module.exports = {
  getInboxCount: () => _inboxCount,
  setInboxCount: (n) => { _inboxCount = n; },
  getCarbonHcT: () => _carbonHcT,
  setCarbonHcT: (n) => { _carbonHcT = n; },
  getCarbonHcH: () => _carbonHcH,
  setCarbonHcH: (n) => { _carbonHcH = n; },
  getLastRefresh: () => _lastRefresh,
  setLastRefresh: (t) => { _lastRefresh = t; },
  getOnlinePeerCount: () => _onlinePeers,
  setOnlinePeerCount: (n) => { _onlinePeers = n; },
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
  getInhabitantCount: () => _inhabitantCount,
  setInhabitantCount: (n) => { _inhabitantCount = Math.max(0, Number(n) || 0); }
};
