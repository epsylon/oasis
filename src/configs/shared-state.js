let _inboxCount = 0;
let _carbonHcT = 0;
let _carbonHcH = 0;
let _lastRefresh = 0;
module.exports = {
  getInboxCount: () => _inboxCount,
  setInboxCount: (n) => { _inboxCount = n; },
  getCarbonHcT: () => _carbonHcT,
  setCarbonHcT: (n) => { _carbonHcT = n; },
  getCarbonHcH: () => _carbonHcH,
  setCarbonHcH: (n) => { _carbonHcH = n; },
  getLastRefresh: () => _lastRefresh,
  setLastRefresh: (t) => { _lastRefresh = t; }
};
