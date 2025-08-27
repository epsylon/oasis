const peersView = async ({ onlinePeers, discoveredPeers, unknownPeers }) => {
  const { form, button, div, h2, p, section, ul, li, a, hr } = require("../server/node_modules/hyperaxe");
  const { template, i18n } = require('./main_views');

  const startButton = form({ action: "/settings/conn/start", method: "post" }, button({ type: "submit" }, i18n.startNetworking));
  const restartButton = form({ action: "/settings/conn/restart", method: "post" }, button({ type: "submit" }, i18n.restartNetworking));
  const stopButton = form({ action: "/settings/conn/stop", method: "post" }, button({ type: "submit" }, i18n.stopNetworking));
  const syncButton = form({ action: "/settings/conn/sync", method: "post" }, button({ type: "submit" }, i18n.sync));
  const connButtons = [startButton, restartButton, stopButton, syncButton];

  const encodePubKey = (pubId) => {
    let core = pubId.replace(/^@/, '').replace(/\.ed25519$/, '').replace(/_/g, '/');
    if (!core.endsWith('=')) core += '=';
    return `/author/${encodeURIComponent('@' + core)}.ed25519`;
  };

  const renderInhabitants = (users, pubID) => {
    const filteredUsers = users.filter(user => user.id !== pubID);
    if (filteredUsers.length === 0) {
      return li(i18n.noDiscovered);
    }
    return filteredUsers.map((user) => {
      const userUrl = `/author/${encodeURIComponent(user.id)}`;
      return li(
        a({ href: userUrl, class:"user-link" }, `${user.id}`)
      );
    });
  };

  const renderPeer = (peerData) => {
    const peer = peerData[1];
    const { name, users, key } = peer;
    const pubUrl = encodePubKey(key);
    const inhabitants = renderInhabitants(users, peerData[0]);
    return li(
      `${i18n.pub}: ${name} `,
      a({ href: pubUrl, class:"user-link" }, `${key}`),
      inhabitants.length > 0 ? ul(inhabitants) : p(i18n.noDiscovered)
    );
  };

  const countPeers = (list) => {
    let usersTotal = 0;
    for (const item of list) {
      const users = (item[1].users || []).filter(u => u.id !== item[0]);
      usersTotal += users.length;
    }
    return list.length + usersTotal;
  };

  const onlineCount = countPeers(onlinePeers);
  const discoveredCount = countPeers(discoveredPeers);
  const unknownCount = countPeers(unknownPeers);

  return template(
    i18n.peers,
    section(
      div({ class: 'tags-header' },
        h2(i18n.peers),
        p(i18n.peerConnectionsIntro)
      ),
      div({ class: "conn-actions" }, ...connButtons),
      div({ class: "peers-list" },
        h2(`${i18n.online} (${onlineCount})`),
        onlinePeers.length > 0 ? ul(onlinePeers.map(renderPeer)) : p(i18n.noConnections),
        hr(),
        h2(`${i18n.discovered} (${discoveredCount})`),
        discoveredPeers.length > 0 ? ul(discoveredPeers.map(renderPeer)) : p(i18n.noDiscovered),
        hr(),
        h2(`${i18n.unknown} (${unknownCount})`),
        unknownPeers.length > 0 ? ul(unknownPeers.map(renderPeer)) : p(i18n.noDiscovered),
        p(i18n.connectionActionIntro)
      )
    )
  );
};

exports.peersView = peersView;
