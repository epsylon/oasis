const { form, button, div, h2, p, section, ul, li, a, br } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');

const peersView = async ({ peers }) => {
  const startButton = form(
    { action: "/settings/conn/start", method: "post" },
    button({ type: "submit" }, i18n.startNetworking)
  );

  const restartButton = form(
    { action: "/settings/conn/restart", method: "post" },
    button({ type: "submit" }, i18n.restartNetworking)
  );

  const stopButton = form(
    { action: "/settings/conn/stop", method: "post" },
    button({ type: "submit" }, i18n.stopNetworking)
  );

  const syncButton = form(
    { action: "/settings/conn/sync", method: "post" },
    button({ type: "submit" }, i18n.sync)
  );

  const connButtons = [startButton, restartButton, stopButton, syncButton];

  const connectedPeers = (peers || []).filter(([, data]) => data.state === "connected");

  const peerList = connectedPeers.map(([, data]) =>
    li(
      data.name, br,
      a({ href: `/author/${encodeURIComponent(data.key)}` }, data.key), br, br
    )
  );

  return template(
    i18n.peers,
    section(
      div({ class: 'tags-header' },
        h2(i18n.peers),
        p(i18n.peerConnectionsIntro)
      ),
      div({ class: "conn-actions" },
        ...connButtons
      ),
      div({ class: "peers-list" },
        h2(`${i18n.online} (${connectedPeers.length})`),
        connectedPeers.length > 0
          ? ul(peerList)
          : p(i18n.noConnections),
        p(i18n.connectionActionIntro)
      )
    )
  );
};

exports.peersView = peersView;
