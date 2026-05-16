const peersView = async ({ onlinePeers, discoveredPeers, unknownPeers, lanBroadcastActive = false, technicalPeers = [] }) => {
  const { form, button, div, h2, p, section, a, hr, input, label, br, span, table, tr, td, textarea } = require("../server/node_modules/hyperaxe");
  const { template, i18n } = require('./main_views');

  const startButton = form({ action: "/settings/conn/start", method: "post" }, button({ type: "submit" }, i18n.startNetworking));
  const restartButton = form({ action: "/settings/conn/restart", method: "post" }, button({ type: "submit" }, i18n.restartNetworking));
  const stopButton = form({ action: "/settings/conn/stop", method: "post" }, button({ type: "submit" }, i18n.stopNetworking));
  const syncButton = form({ action: "/settings/conn/sync", method: "post" }, button({ type: "submit" }, i18n.sync));
  const connButtons = [startButton, restartButton, stopButton, syncButton];

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

  const renderPeerRow = (peerData) => {
    const peer = peerData[1];
    const { name, users, key } = peer;
    const peerUrl = `/author/${encodeURIComponent(key)}`;
    const filteredUsers = (users || []).filter(u => u.id !== key);
    const userCount = filteredUsers.length;
    return tr(
      td(a({ href: peerUrl, class: "user-link" }, name || key.slice(0, 20) + '…')),
      td(a({ href: peerUrl, class: 'user-link peer-key' }, key)),
      td(String(userCount))
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
        td({ class: 'card-label' }, 'Key'),
        td({ class: 'card-label' }, i18n.peersReplicatedFeeds || 'Replicated feeds')
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
      td(a({ href: `/author/${encodeURIComponent(k)}`, class: 'user-link peer-key' }, k ? k.slice(0, 20) + '…' : '—')),
      td(String(tp.host || '—')),
      td(String(tp.port || '—')),
      td(String(tp.state || tp.source || '—')),
      td(String(tp.stateChange ? new Date(tp.stateChange).toISOString().slice(0, 16).replace('T', ' ') : '—')),
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
  const refreshButton = form({ action: "/peers/refresh", method: "post" }, button({ type: "submit" }, i18n.peerRefresh || 'Refresh'));
  const pruneButton = form({ action: "/peers/prune", method: "post" }, button({ type: "submit" }, i18n.peerPruneIdle || 'Remove idle'));
  const exportButton = form({ action: "/peers/export", method: "get" }, button({ type: "submit" }, i18n.peerExport || 'Export'));
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
    div({ class: "conn-actions peers-conn-actions" }, refreshButton, pruneButton, exportButton),
    technicalPeers.length
      ? table({ class: 'block-info-table' },
          tr(
            td({ class: 'card-label' }, 'Key'),
            td({ class: 'card-label' }, 'Host'),
            td({ class: 'card-label' }, i18n.peerPort || 'Port'),
            td({ class: 'card-label' }, 'State'),
            td({ class: 'card-label' }, 'Last change'),
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
      div({ class: 'tags-header' },
        h2(i18n.peers),
        p(i18n.peerConnectionsIntro)
      ),
      div({ class: "conn-actions" }, ...connButtons),
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
