const peersView = async ({ onlinePeers, discoveredPeers, unknownPeers, lanBroadcastActive = false, technicalPeers = [], versions = {}, staleKeys = [], onionKeys = [], ownVersion = '', lastErrors = {}, paused = false }) => {
  const { form, button, div, h2, p, section, a, hr, input, label, br, span, table, tr, td, textarea, wbr } = require("../server/node_modules/hyperaxe");
  const { template, i18n, renderStateChip } = require('./main_views');
  const { NET_REASON_KEYS, canonicalKey } = require('../models/peer_health');
  const majorMinor = (v) => String(v || '').split('.').slice(0, 2).map(n => parseInt(n, 10) || 0);
  const isOutdated = (v) => {
    if (!v || !ownVersion) return false;
    const [a1, b1] = majorMinor(v), [a2, b2] = majorMinor(ownVersion);
    return a1 < a2 || (a1 === a2 && b1 < b2);
  };
  const stale = new Set(staleKeys || []);
  const outdatedKey = (k) => isOutdated((versions || {})[k]) || (!(versions || {})[k] && stale.has(k));
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
  const renderPeerRow = (peerData) => {
    const peer = peerData[1];
    const { name, users, key } = peer;
    const tor = overTor(peerData);
    const peerUrl = `/author/${encodeURIComponent(key)}`;
    const filteredUsers = (users || []).filter(u => u.id !== key);
    const userCount = Array.isArray(users) ? filteredUsers.length : null;
    return tr(
      td({ 'data-label': i18n.peerHost || 'Pub' }, a({ href: peerUrl, class: "user-link", title: name || key }, name ? shortHost(name) : key.slice(0, 20) + '…')),
      td({ 'data-label': i18n.peersOasisId || 'Oasis ID' }, a({ href: peerUrl, class: 'user-link peer-key' }, key)),
      td({ 'data-label': i18n.peersOasisVersion || 'Version' }, ...versionCell(key)),
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
    return table({ class: 'block-info-table' },
      tr(
        td({ class: 'card-label' }, i18n.peerHost || 'Pub'),
        td({ class: 'card-label' }, i18n.peersOasisId || 'Oasis ID'),
        td({ class: 'card-label' }, i18n.peersOasisVersion || 'Version'),
        td({ class: 'card-label' }, i18n.peersTorColumn),
        td({ class: 'card-label' }, i18n.peersReplicatedFeeds || 'Replicated')
      ),
      ...peers.map(renderPeerRow)
    );
  };

  const technicalRows = (technicalPeers || []).map(tp => {
    const k = tp.key || '';
    const connected = tp.state === 'connected';
    const action = connected ? 'disconnect' : 'connect';
    const btnLabel = connected ? (i18n.peerDisconnect || 'Disconnect') : (i18n.peerConnect || 'Connect');
    return tr(
      td({ 'data-label': i18n.peersOasisId }, a({ href: `/author/${encodeURIComponent(k)}`, class: 'user-link peer-key' }, k ? k.slice(0, 20) + '…' : '—')),
      onion.has(canonicalKey(tp.key)) || /\.onion$/i.test(String(tp.host || ''))
        ? td({ 'data-label': i18n.peerAddressLabel, class: 'peer-host' }, renderStateChip('fediverse', null, 'TOR'))
        : td({ 'data-label': i18n.peerAddressLabel, title: String(tp.host || ''), class: 'peer-host' }, tp.host ? shortHost(tp.host).split(/(?<=\.)/).reduce((acc, part, i) => i ? [...acc, wbr(), part] : [part], []) : '—'),
      td({ 'data-label': i18n.peerPort, class: 'peer-port' }, String(tp.port || '—')),
      td({ 'data-label': i18n.peersOasisVersion || 'Version' }, ...versionCell(k)),
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
  const refreshButton = form({ action: "/peers/refresh", method: "post" }, button({ type: "submit", class: "filter-btn" }, i18n.peerRefresh || 'Refresh'));
  const pruneButton = form({ action: "/peers/prune", method: "post" }, button({ type: "submit", class: "filter-btn" }, i18n.peerPruneIdle || 'Remove idle'));
  const exportButton = form({ action: "/peers/export", method: "get" }, button({ type: "submit", class: "filter-btn" }, i18n.peerExport || 'Export'));
  const importForm = form(
    { action: "/peers/import", method: "post", enctype: "multipart/form-data", class: "peers-import-form" },
    label({ class: 'peers-import-label' }, i18n.peerImportTitle || 'Import peer list'),
    br(),
    textarea({ name: "peerList", rows: "4", placeholder: i18n.peerImportPlaceholder || 'Paste one multiserver address per line…' }),
    br(),
    input({ type: "file", name: "peerFile", accept: ".txt,text/plain" }),
    br(),
    button({ type: "submit", class: "filter-btn" }, i18n.peerImport || 'Import')
  );

  const peersTechnicalBlock = div({ class: 'tags-header peers-technical-block' },
    h2(i18n.peerConnectionsTitle || 'Connections'),
    div({ class: "peers-pause-row" }, pauseButton, p({ class: paused ? "peers-paused-note" : "peers-pause-hint" }, paused ? i18n.peersPausedNote : i18n.peersPauseHint)),
    div({ class: "conn-actions peers-conn-actions filters" }, refreshButton, pruneButton, exportButton),
    technicalPeers.length
      ? table({ class: 'block-info-table' },
          tr(
            td({ class: 'card-label' }, i18n.peersOasisId),
            td({ class: 'card-label' }, i18n.peerAddressLabel),
            td({ class: 'card-label peer-port' }, i18n.peerPort),
            td({ class: 'card-label' }, i18n.peersOasisVersion || 'Version'),
            td({ class: 'card-label' }, i18n.peerStateLabel),
            td({ class: 'card-label' }, i18n.peerLastChangeLabel),
            td({ class: 'card-label' }, '')
          ),
          ...technicalRows
        )
      : p(i18n.peersTechnicalEmpty || 'No peers registered yet.'),
    importForm
  );

  return template(
    i18n.peers,
    section(
      div({ class: 'tags-header module-header-line' },
        h2(i18n.peers),
        p(i18n.peerConnectionsIntro)
      ),
      (onlineCount + discoveredCount + unknownCount) > 0
        ? div({ class: "peers-list" },
            div({ class: "tags-header" }, h2(`${i18n.online} (${onlineCount})`)),
            renderPeerTable(dedupOnline, 'noConnections'),
            hr(),
            div({ class: "tags-header" }, h2(`${i18n.discovered} (${discoveredCount})`)),
            renderPeerTable(dedupDiscovered, 'noDiscovered'),
            hr(),
            div({ class: "tags-header" }, h2(`${i18n.unknown} (${unknownCount})`)),
            renderPeerTable(dedupUnknown, 'noUnknownPeers')
          )
        : null,
      peersTechnicalBlock,
      p(i18n.connectionActionIntro)
    )
  );
};

exports.peersView = peersView;
