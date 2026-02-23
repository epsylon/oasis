const peersView = async ({ onlinePeers, discoveredPeers, unknownPeers }) => {
  const { form, button, div, h2, p, section, a, hr, input, label, br, span, table, tr, td } = require("../server/node_modules/hyperaxe");
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

  const renderPeerRow = (peerData) => {
    const peer = peerData[1];
    const { name, users, key } = peer;
    const peerUrl = `/author/${encodeURIComponent(key)}`;
    const filteredUsers = (users || []).filter(u => u.id !== key);
    const userCount = filteredUsers.length || peer.announcers || 0;
    return tr(
      td(a({ href: peerUrl, class: "user-link" }, name || key.slice(0, 20) + '…')),
      td(span({ style: 'word-break:break-all;font-size:12px;color:#888;' }, key)),
      td(String(userCount))
    );
  };

  const dedupOnline = deduplicatePeers(onlinePeers);
  const dedupDiscovered = deduplicatePeers(discoveredPeers);
  const dedupUnknown = deduplicatePeers(unknownPeers);

  const countPeers = (list) => {
    let usersTotal = 0;
    for (const item of list) {
      const peerKey = item[1].key;
      const users = (item[1].users || []).filter(u => u.id !== peerKey);
      usersTotal += users.length || item[1].announcers || 0;
    }
    return list.length + usersTotal;
  };

  const onlineCount = countPeers(dedupOnline);
  const discoveredCount = countPeers(dedupDiscovered);
  const unknownCount = countPeers(dedupUnknown);

  const renderPeerTable = (peers) => {
    if (peers.length === 0) return p(i18n.noConnections || i18n.noDiscovered);
    return table({ class: 'block-info-table' },
      tr(
        td({ class: 'card-label' }, i18n.peerHost || 'Pub'),
        td({ class: 'card-label' }, 'Key'),
        td({ class: 'card-label' }, i18n.inhabitants || 'Inhabitants')
      ),
      ...peers.map(renderPeerRow)
    );
  };

  return template(
    i18n.peers,
    section(
      div({ class: 'tags-header' },
        h2(i18n.peers),
        p(i18n.peerConnectionsIntro)
      ),
      div({ class: "conn-actions" }, ...connButtons),
      div({ class: 'tags-header', style: 'margin-top:16px;' },
        h2(i18n.directConnect),
        p(i18n.directConnectDescription),
        form({ action: "/peers/connect", method: "post" },
          label({ for: "peer_host" }, i18n.peerHost), br(),
          input({ type: "text", id: "peer_host", name: "host", required: true, placeholder: "192.168.1.100", pattern: "(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|[a-zA-Z0-9]([a-zA-Z0-9\\-]*[a-zA-Z0-9])?(\\.[a-zA-Z0-9]([a-zA-Z0-9\\-]*[a-zA-Z0-9])?)*)", title: i18n.peerHostValidation || "Valid IPv4 (e.g. 192.168.1.100) or hostname (e.g. pub.example.com)", maxlength: 253 }), br(),
          label({ for: "peer_port" }, i18n.peerPort), br(),
          input({ type: "number", id: "peer_port", name: "port", placeholder: "8008", value: "8008", min: 1, max: 65535, required: true, title: i18n.peerPortValidation || "Port 1-65535" }), br(), br(),
          label({ for: "peer_key" }, i18n.peerPublicKey), br(),
          input({ type: "text", id: "peer_key", name: "key", required: true, placeholder: "@...=.ed25519", pattern: "@[A-Za-z0-9+/_\\-]{43}=\\.ed25519", title: i18n.peerKeyValidation || "SSB ed25519 public key (@<44 chars base64>=.ed25519)", maxlength: 56 }), br(), br(),
          button({ type: "submit" }, i18n.connectAndFollow)
        )
      ),
      hr(),
      div({ class: "peers-list" },
        h2(`${i18n.online} (${onlineCount})`),
        renderPeerTable(dedupOnline),
        hr(),
        h2(`${i18n.discovered} (${discoveredCount})`),
        renderPeerTable(dedupDiscovered),
        hr(),
        h2(`${i18n.unknown} (${unknownCount})`),
        renderPeerTable(dedupUnknown),
        p(i18n.connectionActionIntro)
      )
    )
  );
};

exports.peersView = peersView;
