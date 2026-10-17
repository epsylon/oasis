const peersView = async ({ onlinePeers, discoveredPeers, unknownPeers, lanBroadcastActive = false, technicalPeers = [], versions = {}, staleKeys = [], onionKeys = [], ownVersion = '', lastErrors = {}, paused = false, filter = 'status', advanced = false, health = null, lan = null }) => {
  const { form, button, div, h2, p, section, a, hr, input, label, br, span, table, tr, td, textarea, wbr } = require("../server/node_modules/hyperaxe");
  const { template, i18n, renderStateChip, renderModuleStats } = require('./main_views');
  const { NET_REASON_KEYS, canonicalKey } = require('../models/peer_health');
  const majorMinor = (v) => String(v || '').split('.').slice(0, 2).map(n => parseInt(n, 10) || 0);
  const isOutdated = (v) => {
    if (!v || !ownVersion) return false;
    const [a1, b1] = majorMinor(v), [a2, b2] = majorMinor(ownVersion);
    return a1 < a2 || (a1 === a2 && b1 < b2);
  };
  const stale = new Set(staleKeys || []);
  const outdatedKey = (k) => isOutdated((versions || {})[k]) || (!(versions || {})[k] && stale.has(k));
  const knowsVersion = (keys) => keys.some(k => (versions || {})[k] || stale.has(k));
  const unspecifiedHost = (h) => /^(0\.0\.0\.0|::|\[::\])$/.test(String(h || ''));
  const versionCell = (k) => {
    const v = (versions || {})[k];
    if (!v) return [stale.has(k) ? span({ title: i18n.peerVersionUnannounced }, renderStateChip('closed', null, String(i18n.peerOutdated).toUpperCase())) : '—'];
    const old = isOutdated(v);
    return [span({ title: old ? i18n.peerOutdated : '' }, renderStateChip(old ? 'closed' : 'mutuals', null, String(v)))];
  };
  const stateCell = (tp) => {
    const st = String(tp.state || '');
    if (st === 'connected') return renderStateChip('mutuals', null, String(i18n.peerStateConnected).toUpperCase());
    if (st === 'connecting') return renderStateChip('whole', null, String(i18n.peerStateConnecting).toUpperCase());
    if (st === 'staged') return renderStateChip(outdatedKey(tp.key) ? 'whole' : 'mutuals', null, String(i18n.peerStateStaged).toUpperCase());
    const err = (lastErrors || {})[canonicalKey(tp.key)];
    return renderStateChip('hidden', null, String(i18n[err ? NET_REASON_KEYS[err.reason] : 'peerErrSilent'] || i18n.peerErrOther).toUpperCase());
  };

  const pauseButton = paused
    ? form({ action: "/peers/resume", method: "post" }, button({ type: "submit", class: "tribe-action-btn success-btn" }, String(i18n.peersResume || 'Resume').toUpperCase()))
    : form({ action: "/peers/pause", method: "post" }, button({ type: "submit", class: "tribe-action-btn danger-btn" }, String(i18n.peersPause || 'Pause').toUpperCase()));

  const deduplicatePeers = (peers) => {
    const seen = new Set();
    return peers.filter(p => {
      const key = p[1]?.key;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const sourceLabel = (src) => {
    const s = String(src || '').toLowerCase();
    if (s === 'rpc') return i18n.peerSourceRpc || 'RPC';
    if (s === 'gossip') return i18n.peerSourceGossip || 'Gossip';
    if (s === 'ebt') return i18n.peerSourceEbt || 'EBT';
    if (s === 'recent') return i18n.peerSourceRecent || 'Recent';
    if (s === 'lan') return i18n.peerSourceLan || 'LAN';
    return null;
  };

  const shortHost = (h) => {
    const s = String(h || '');
    const m = s.match(/^(?:onion:)?([a-z2-7]{16,56})\.onion(.*)$/i);
    return m ? `${m[1].slice(0, 10)}….onion${m[2]}` : s;
  };
  const onion = new Set(onionKeys || []);
  const overTor = (peerData) => /^onion:/i.test(String(peerData[0] || '')) || /\.onion$/i.test(String((peerData[1] || {}).host || '')) || onion.has(canonicalKey((peerData[1] || {}).key));
  const renderPeerRow = (peerData, showVersion) => {
    const peer = peerData[1];
    const { name, users, key } = peer;
    const tor = overTor(peerData);
    const peerUrl = `/author/${encodeURIComponent(key)}`;
    const filteredUsers = (users || []).filter(u => u.id !== key);
    const userCount = Array.isArray(users) ? filteredUsers.length : null;
    return tr(
      td({ 'data-label': i18n.peerHost || 'Pub' }, unspecifiedHost(name) ? '—' : a({ href: peerUrl, class: "user-link", title: name || key }, name ? shortHost(name) : key.slice(0, 20) + '…')),
      td({ 'data-label': i18n.peersOasisId || 'Oasis ID' }, a({ href: peerUrl, class: 'user-link peer-key' }, key)),
      showVersion ? td({ 'data-label': i18n.peersOasisVersion || 'Version' }, ...versionCell(key)) : null,
      td({ 'data-label': i18n.peersTorColumn }, tor
        ? span({ class: 'ubi-tick-ok', title: i18n.peersTorYes }, '✓')
        : span({ class: 'peer-tor-no', title: i18n.peersTorNo }, '—')),
      td({ 'data-label': i18n.peersReplicatedFeeds || 'Replicated' }, userCount == null ? '—' : String(userCount))
    );
  };

  const dedupOnline = deduplicatePeers(onlinePeers);
  const dedupDiscovered = deduplicatePeers(discoveredPeers);
  const dedupUnknown = deduplicatePeers(unknownPeers);

  const onlineCount = dedupOnline.length;
  const discoveredCount = dedupDiscovered.length;
  const unknownCount = dedupUnknown.length;

  const renderPeerTable = (peers, emptyKey) => {
    if (peers.length === 0) return p(i18n[emptyKey] || i18n.noConnections);
    const showVersion = knowsVersion(peers.map(pd => pd[1].key));
    return table({ class: 'block-info-table' },
      tr(
        td({ class: 'card-label' }, i18n.peerHost || 'Pub'),
        td({ class: 'card-label' }, i18n.peersOasisId || 'Oasis ID'),
        showVersion ? td({ class: 'card-label' }, i18n.peersOasisVersion || 'Version') : null,
        td({ class: 'card-label' }, i18n.peersTorColumn),
        td({ class: 'card-label' }, i18n.peersReplicatedFeeds || 'Replicated')
      ),
      ...peers.map(pd => renderPeerRow(pd, showVersion))
    );
  };

  const techVersion = knowsVersion((technicalPeers || []).map(tp => tp.key));
  const technicalRows = (technicalPeers || []).map(tp => {
    const k = tp.key || '';
    const connected = tp.state === 'connected';
    const action = connected ? 'disconnect' : 'connect';
    const btnLabel = connected ? (i18n.peerDisconnect || 'Disconnect') : (i18n.peerConnect || 'Connect');
    return tr(
      td({ 'data-label': i18n.peersOasisId }, a({ href: `/author/${encodeURIComponent(k)}`, class: 'user-link peer-key' }, k ? k.slice(0, 20) + '…' : '—')),
      onion.has(canonicalKey(tp.key)) || /\.onion$/i.test(String(tp.host || ''))
        ? td({ 'data-label': i18n.peerAddressLabel, class: 'peer-host' }, renderStateChip('fediverse', null, 'TOR'))
        : td({ 'data-label': i18n.peerAddressLabel, title: unspecifiedHost(tp.host) ? '' : String(tp.host || ''), class: 'peer-host' }, tp.host && !unspecifiedHost(tp.host) ? shortHost(tp.host).split(/(?<=\.)/).reduce((acc, part, i) => i ? [...acc, wbr(), part] : [part], []) : '—'),
      td({ 'data-label': i18n.peerPort, class: 'peer-port' }, String(tp.port || '—')),
      techVersion ? td({ 'data-label': i18n.peersOasisVersion || 'Version' }, ...versionCell(k)) : null,
      td({ 'data-label': i18n.peerStateLabel }, stateCell(tp)),
      td({ 'data-label': i18n.peerLastChangeLabel }, String(tp.stateChange ? new Date(tp.stateChange).toISOString().slice(0, 16).replace('T', ' ') : '—')),
      td(
        form({ method: "POST", action: `/peers/${action}`, class: "inline-form" },
          input({ type: "hidden", name: "key", value: k }),
          input({ type: "hidden", name: "host", value: String(tp.host || '') }),
          input({ type: "hidden", name: "port", value: String(tp.port || 8008) }),
          button({ type: "submit", class: "filter-btn" }, btnLabel)
        )
      )
    );
  });
  const withCount = (label, n) => Number(n) > 0 ? `${label} (${n})` : label;
  const peersToolbar = (tabName, total, segments) => {
    if (!(Number(total) > 0)) return null;
    const back = input({ type: "hidden", name: "returnTo", value: `/peers?filter=${tabName}` });
    return div({ class: 'filters activity-filter-chips activity-toolbar-row' },
      renderModuleStats(total, segments),
      div({ class: "conn-actions peers-conn-actions filter-box" },
        form({ action: "/peers/refresh", method: "post" }, back, button({ type: "submit", class: "filter-btn" }, i18n.peerRefresh || 'Refresh')),
        form({ action: "/peers/prune", method: "post" }, back, tabName === 'lan' ? input({ type: "hidden", name: "scope", value: "lan" }) : null, button({ type: "submit", class: "filter-btn" }, i18n.peerPruneIdle || 'Remove idle')),
        form({ action: "/peers/export", method: "get" }, button({ type: "submit", class: "filter-btn" }, i18n.peerExport || 'Export'))
      )
    );
  };
  const importForm = form(
    { action: "/peers/import", method: "post", enctype: "multipart/form-data", class: "peers-import-form" },
    label({ class: 'peers-import-label' }, i18n.peerImportTitle || 'Import peer list'),
    br(),
    textarea({ name: "peerList", rows: "4", placeholder: i18n.peerImportPlaceholder || 'Paste one multiserver address per line…' }),
    input({ type: "file", name: "peerFile", accept: ".txt,text/plain" }),
    br(),
    button({ type: "submit", class: "filter-btn" }, i18n.peerImport || 'Import')
  );

  const peersTechnicalBlock = div({ class: 'peers-technical-block' },
    peersToolbar('connections', technicalPeers.length, [
      { label: i18n.peerStateConnected, count: technicalPeers.filter(tp => tp.state === 'connected').length },
      { label: i18n.peerOutdated, count: technicalPeers.filter(tp => outdatedKey(tp.key)).length },
      { label: 'TOR', count: technicalPeers.filter(tp => onion.has(canonicalKey(tp.key)) || /\.onion$/i.test(String(tp.host || ''))).length }
    ]),
    div({ class: "tags-header" }, h2(withCount(i18n.peerConnectionsTitle || 'Connections', technicalPeers.length)), p(i18n.peersConnectionsHint)),
    div({ class: "peers-pause-row" }, pauseButton, p({ class: paused ? "peers-paused-note" : "peers-pause-hint" }, paused ? i18n.peersPausedNote : i18n.peersPauseHint)),
    technicalPeers.length
      ? table({ class: 'block-info-table' },
          tr(
            td({ class: 'card-label' }, i18n.peersOasisId),
            td({ class: 'card-label' }, i18n.peerAddressLabel),
            td({ class: 'card-label peer-port' }, i18n.peerPort),
            techVersion ? td({ class: 'card-label' }, i18n.peersOasisVersion || 'Version') : null,
            td({ class: 'card-label' }, i18n.peerStateLabel),
            td({ class: 'card-label' }, i18n.peerLastChangeLabel),
            td({ class: 'card-label' }, '')
          ),
          ...technicalRows
        )
      : p(i18n.peersTechnicalEmpty || 'No peers registered yet.'),
    importForm
  );

  const fmtDate = (ts) => ts ? new Date(ts).toISOString().slice(0, 16).replace('T', ' ') : '—';
  const healthRows = health && Array.isArray(health.rows) ? health.rows : [];
  const healthKind = (r) => {
    if (r.state === 'connected') return 'connected';
    if (r.dead) return 'unreachable';
    if ((Number(r.failures) || 0) > 0 || r.reason) return 'failing';
    return 'reachable';
  };
  const healthChip = (r) => {
    const k = healthKind(r);
    if (k === 'connected') return renderStateChip('mutuals', null, String(i18n.peerStateConnected).toUpperCase());
    if (k === 'unreachable') return renderStateChip('closed', null, String(i18n.graphosFedUnreachable).toUpperCase());
    if (k === 'failing') return renderStateChip('hidden', null, String(i18n[NET_REASON_KEYS[r.reason] || 'peerErrSilent'] || i18n.peerErrOther).toUpperCase());
    return renderStateChip(outdatedKey(r.key) ? 'whole' : 'mutuals', null, String(i18n.peersHealthReachable).toUpperCase());
  };
  const healthCount = (k) => healthRows.filter(r => healthKind(r) === k).length;
  const deadCount = healthRows.filter(r => r.dead).length;
  const healthVersion = knowsVersion(healthRows.map(r => r.key));
  const healthBlock = !healthRows.length ? div({ class: 'peers-list' }, p(i18n.noConnections)) : div({ class: 'peers-technical-block peers-health-block' },
    peersToolbar('health', healthRows.length, [
      { label: i18n.peersHealthReachable, count: healthCount('connected') + healthCount('reachable') },
      { label: i18n.peersHealthFailing, count: healthCount('failing') },
      { label: i18n.graphosFedUnreachable, count: deadCount },
      { label: i18n.peerOutdated, count: healthRows.filter(r => outdatedKey(r.key)).length },
      { label: 'TOR', count: healthRows.filter(r => r.tor).length }
    ]),
    div({ class: "tags-header" }, h2(withCount(i18n.peersTabHealth, healthRows.length)), p(i18n.peersHealthHint)),
    deadCount
      ? div({ class: "conn-actions peers-conn-actions filters" },
          form({ action: "/peers/clear-unreachable", method: "post" }, button({ type: "submit", class: "filter-btn" }, i18n.peersHealthForget)))
      : null,
    healthRows.length
      ? table({ class: 'block-info-table' },
          tr(
            td({ class: 'card-label' }, i18n.peerHost || 'IP'),
            td({ class: 'card-label' }, i18n.peersOasisId || 'ID'),
            td({ class: 'card-label' }, i18n.graphosFedTransport),
            td({ class: 'card-label' }, i18n.peerStateLabel),
            td({ class: 'card-label' }, i18n.peersHealthFailures),
            td({ class: 'card-label' }, i18n.peersFailingSince),
            healthVersion ? td({ class: 'card-label' }, i18n.peersOasisVersion || 'Version') : null
          ),
          ...healthRows.map(r => tr(
            r.tor
              ? td({ 'data-label': i18n.peerHost || 'IP', class: 'peer-host' }, renderStateChip('fediverse', null, 'TOR'))
              : td({ 'data-label': i18n.peerHost || 'IP', title: unspecifiedHost(r.host) ? '' : String(r.host || ''), class: 'peer-host' }, r.host && !unspecifiedHost(r.host) ? shortHost(r.host) : '—'),
            td({ 'data-label': i18n.peersOasisId || 'ID' }, a({ href: `/author/${encodeURIComponent(r.key)}`, class: 'user-link peer-key', title: r.name || r.key }, r.key)),
            td({ 'data-label': i18n.graphosFedTransport }, r.tor ? renderStateChip('fediverse', null, 'TOR') : renderStateChip('transport', null, String(i18n.graphosFedClearnet).toUpperCase())),
            td({ 'data-label': i18n.peerStateLabel }, healthChip(r)),
            td({ 'data-label': i18n.peersHealthFailures }, String(Number(r.failures) || 0)),
            td({ 'data-label': i18n.peersFailingSince }, r.failingSince ? fmtDate(r.failingSince) : '—'),
            healthVersion ? td({ 'data-label': i18n.peersOasisVersion || 'Version' }, ...versionCell(r.key)) : null
          ))
        )
      : p(i18n.noConnections)
  );

  const lanRows = lan && Array.isArray(lan.rows) ? lan.rows : [];
  const lanOn = !!(lan && lan.broadcasting);
  const lanVersion = knowsVersion(lanRows.map(r => r.key));
  const lanBlock = div({ class: 'peers-technical-block peers-lan-block' },
    peersToolbar('lan', lanRows.length, [
      { label: i18n.online, count: lanRows.filter(r => r.online).length },
      { label: i18n.peerOutdated, count: lanRows.filter(r => outdatedKey(r.key)).length }
    ]),
    div({ class: "tags-header" }, h2(withCount(i18n.peersTabLan, lanRows.length)), p(i18n.peersLanHint)),
    div({ class: "peers-pause-row" },
      p({ class: "peers-pause-hint" }, `${i18n.settingsLanTitle}: `, renderStateChip(lanOn ? 'mutuals' : 'hidden', null, String(lanOn ? i18n.modulesEnabledModulesLabel : i18n.modulesDisabledModulesLabel).toUpperCase()))
    ),
    lanRows.length
      ? table({ class: 'block-info-table' },
          tr(
            td({ class: 'card-label' }, i18n.peersOasisId || 'ID'),
            td({ class: 'card-label' }, i18n.peerStateLabel),
            td({ class: 'card-label' }, i18n.peersLanLastSeen),
            lanVersion ? td({ class: 'card-label' }, i18n.peersOasisVersion || 'Version') : null,
            td({ class: 'card-label' }, '')
          ),
          ...lanRows.map(r => tr(
            td({ 'data-label': i18n.peersOasisId || 'ID' }, a({ href: `/author/${encodeURIComponent(r.key)}`, class: 'user-link peer-key', title: r.name || r.key }, r.key)),
            td({ 'data-label': i18n.peerStateLabel }, r.online ? renderStateChip('mutuals', null, String(i18n.online).toUpperCase()) : renderStateChip('hidden', null, String(i18n.offline).toUpperCase())),
            td({ 'data-label': i18n.peersLanLastSeen }, fmtDate(r.seenAt)),
            lanVersion ? td({ 'data-label': i18n.peersOasisVersion || 'Version' }, ...versionCell(r.key)) : null,
            td(r.online ? null : form({ method: "POST", action: "/peers/lan/forget", class: "inline-form" },
              input({ type: "hidden", name: "key", value: r.key }),
              button({ type: "submit", class: "filter-btn" }, i18n.delete)
            ))
          ))
        )
      : p(i18n.peersLanEmpty)
  );

  const tabs = ['status', 'connections'].concat(advanced ? ['lan', 'health'] : []);
  const tab = tabs.includes(filter) ? filter : 'status';
  const tabLabel = { status: i18n.status || 'Status', connections: i18n.peerConnectionsTitle || 'Connections', lan: i18n.peersTabLan, health: i18n.peersTabHealth };
  const statusToolbar = peersToolbar('status', onlineCount + discoveredCount + unknownCount, [
    { label: i18n.online, count: onlineCount },
    { label: i18n.discovered, count: discoveredCount },
    { label: i18n.unknown, count: unknownCount }
  ]);
  const statusBlock = (onlineCount + discoveredCount + unknownCount) > 0
    ? div({ class: "peers-list" },
        statusToolbar,
        ...[
          [i18n.online, onlineCount, dedupOnline, 'noConnections', i18n.peersOnlineHint],
          [i18n.discovered, discoveredCount, dedupDiscovered, 'noDiscovered', i18n.peersDiscoveredHint],
          [i18n.unknown, unknownCount, dedupUnknown, 'noUnknownPeers', i18n.peersUnknownHint]
        ].filter(([, count]) => count > 0).flatMap(([title, count, list, emptyKey, hint], idx) => [
          idx ? hr() : null,
          div({ class: "tags-header" }, h2(withCount(title, count)), p(hint)),
          renderPeerTable(list, emptyKey)
        ])
      )
    : div({ class: "peers-list" }, statusToolbar, p(i18n.noConnections));

  return template(
    i18n.peers,
    section(
      div({ class: 'tags-header module-header-line' },
        h2(i18n.peers),
        p(i18n.peerConnectionsIntro)
      ),
      div({ class: 'mode-buttons-row' },
        ...tabs.map(t => a({ class: tab === t ? 'filter-btn active' : 'filter-btn', href: `/peers?filter=${t}` }, String(tabLabel[t]).toUpperCase()))
      ),
      tab === 'status' ? statusBlock : null,
      tab === 'connections' ? peersTechnicalBlock : null,
      tab === 'connections' ? p(i18n.connectionActionIntro) : null,
      tab === 'lan' ? lanBlock : null,
      tab === 'health' ? healthBlock : null
    )
  );
};

exports.peersView = peersView;
