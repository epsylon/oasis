const h = require("../server/node_modules/hyperaxe");
const { div, h2, p, section, button, form, input, span, a, table, tr, td } = h;
const { template, i18n, renderStateChip } = require('./main_views');

const TAU = Math.PI * 2;

const escAttr = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const escText = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const adaptiveLayout = (n) => {
  if (n <= 1) return { rRatio: 0.22, nodeR: 30, labelGap: 18 };
  if (n <= 3) return { rRatio: 0.28, nodeR: 26, labelGap: 16 };
  if (n <= 6) return { rRatio: 0.34, nodeR: 22, labelGap: 14 };
  if (n <= 12) return { rRatio: 0.40, nodeR: 18, labelGap: 14 };
  return { rRatio: 0.44, nodeR: 14, labelGap: 12 };
};

const buildGraphSvg = (me, peers, links = []) => {
  const W = 900;
  const H = 600;
  const cx = W / 2;
  const cy = H / 2;
  const N = Math.max(1, peers.length);
  const { rRatio, nodeR, labelGap } = adaptiveLayout(N);
  const r = Math.min(W, H) * rRatio;
  const meR = nodeR + 6;

  const positions = peers.map((peer, i) => {
    const angle = (i / N) * TAU - Math.PI / 2;
    return {
      peer,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle)
    };
  });

  const edges = positions.map(({ peer, x, y }) =>
    `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" class="graphos-edge graphos-edge-${peer.kind}" />`
  ).join('');
  const at = new Map(positions.map(({ peer, x, y }) => [peer.key, { x, y }]));
  const chords = links.filter(l => at.has(l.a) && at.has(l.b)).map(l => {
    const A = at.get(l.a), B = at.get(l.b);
    return `<line x1="${A.x.toFixed(2)}" y1="${A.y.toFixed(2)}" x2="${B.x.toFixed(2)}" y2="${B.y.toFixed(2)}" class="graphos-fed-link ${l.mutual ? 'graphos-fed-mutual' : 'graphos-fed-oneway'}" />`;
  }).join('');

  const nodes = positions.map(({ peer, x, y }) => {
    const xs = x.toFixed(2);
    const ys = y.toFixed(2);
    const labelY = (y + nodeR + labelGap).toFixed(2);
    const enc = escAttr(encodeURIComponent(peer.key));
    const centerHref = `/graphos?center=${enc}`;
    const profileHref = `/author/${enc}`;
    const name = escText(peer.name);
    return `<g class="graphos-node graphos-node-${peer.kind}">`
      + `<title>${name} (${peer.kind})</title>`
      + `<a href="${centerHref}" class="graphos-node-link">`
      + `<circle cx="${xs}" cy="${ys}" r="${nodeR}" class="graphos-node-circle graphos-node-circle-${peer.kind}" />`
      + `</a>`
      + `<a href="${profileHref}" class="graphos-node-link">`
      + `<text x="${xs}" y="${labelY}" text-anchor="middle" class="graphos-node-label">${name}</text>`
      + `</a>`
      + `</g>`;
  }).join('');

  const meLabelY = (cy + meR + labelGap + 2).toFixed(2);
  const meEnc = escAttr(encodeURIComponent(me.key));
  const meProfileHref = `/author/${meEnc}`;
  const meName = escText(me.name);
  const center = `<g class="graphos-node graphos-node-me">`
    + `<title>${meName}</title>`
    + `<a href="/graphos" class="graphos-node-link">`
    + `<circle cx="${cx}" cy="${cy}" r="${(meR + 5).toFixed(2)}" class="graphos-node-circle graphos-node-circle-online graphos-me-online-ring" />`
    + `<circle cx="${cx}" cy="${cy}" r="${meR}" class="graphos-node-circle graphos-node-circle-me" />`
    + `</a>`
    + `<a href="${meProfileHref}" class="graphos-node-link">`
    + `<text x="${cx}" y="${meLabelY}" text-anchor="middle" class="graphos-node-label graphos-node-label-me">${meName}</text>`
    + `</a>`
    + `</g>`;

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" class="graphos-svg">`
    + chords + edges + nodes + center
    + `</svg>`;
};

const kpi = (label, value) => div({ class: 'stats-kpi stats-kpi-inline' },
  span({ class: 'stats-kpi-label' }, String(label).toUpperCase()),
  span({ class: 'stats-kpi-value' }, String(value))
);

const legendItem = (kind, label) =>
  span({ class: 'graphos-legend-item' },
    span({ class: `graphos-legend-dot graphos-node-circle-${kind}` }),
    span(label)
  );

exports.graphosView = ({ filter, me, peers, links = [], kpis, focus = null, focusId = null, shown = null, total = null }) => {
  const title = i18n.graphos || 'Graphos';
  const description = i18n.graphosDescription || 'Interactive map of the network around you.';
  const modes = ['ALL', 'MINE', 'FEDERATION'];
  const capped = Number.isFinite(shown) && Number.isFinite(total) && total > shown;

  return template(
    title,
    section(
      div({ class: 'tags-header module-header-line' },
        h2(title),
        p(description)
      ),
      focus
        ? [
            form({ method: 'GET', action: '/graphos', class: 'graphos-backbar' },
              button({ type: 'submit', class: 'filter-btn' }, i18n.graphosBackToMine || '← My network')
            ),
            div({ class: 'graphos-focus-bar' },
              span({ class: 'graphos-focus-label' }, `${i18n.graphosViewingGraphOf || 'Viewing'}: `),
              a({ class: 'user-link', href: `/author/${encodeURIComponent(focusId || '')}` }, `@${focus}`)
            )
          ]
        : div({ class: 'mode-buttons stats-mode-row' },
            modes.map(m =>
              form({ method: 'GET', action: '/graphos' },
                input({ type: 'hidden', name: 'filter', value: m }),
                button({ type: 'submit', class: filter === m ? 'filter-btn active' : 'filter-btn' }, String(m === 'FEDERATION' ? i18n.graphosFederation : i18n[m + 'Button']).toUpperCase())
              )
            )
          ),
      capped
        ? p({ class: 'graphos-cap-note' }, `${i18n.graphosShowing || 'Showing'} ${shown} / ${total}`)
        : null,
      div({ class: 'stats-block graphos-stats' },
        div({ class: 'stats-grid' },
          kpi(i18n.graphosTotalNodes || 'Total nodes', kpis.total),
          kpi(i18n.online || 'Online', kpis.online),
          filter !== 'MINE' ? kpi(i18n.discovered || 'Discovered', kpis.discovered) : null,
          filter !== 'MINE' ? kpi(i18n.unknown || 'Unknown', kpis.unknown) : null
        )
      ),
      div({ class: 'graphos-canvas', innerHTML: buildGraphSvg(me, peers, links) }),
      div({ class: 'graphos-legend' },
        legendItem('me', i18n.graphosYou || 'You'),
        legendItem('online', i18n.online || 'Online'),
        filter !== 'MINE' ? legendItem('discovered', i18n.discovered || 'Discovered') : null,
        filter !== 'MINE' ? legendItem('unknown', i18n.unknown || 'Unknown') : null,
        span({ class: 'graphos-legend-item' }, span({ class: 'graphos-legend-line graphos-fed-line-mutual' }), span(i18n.graphosFedMutual)),
        span({ class: 'graphos-legend-item' }, span({ class: 'graphos-legend-line graphos-fed-line-oneway' }), span(i18n.graphosFedOneWay))
      )
    )
  );
};

const majorMinor = (v) => String(v || '').split('.').slice(0, 2).map(n => parseInt(n, 10) || 0);
const olderThan = (v, own) => {
  if (!v || !own) return false;
  const [a1, b1] = majorMinor(v), [a2, b2] = majorMinor(own);
  return a1 < a2 || (a1 === a2 && b1 < b2);
};
const NET_REASON_KEYS = require('../models/peer_health').NET_REASON_KEYS;

const pubLabel = (row) => {
  const n = String(row.name || '').trim();
  if (n && n !== String(row.key).replace(/^@/, '').slice(0, 8)) return n.length > 22 ? n.slice(0, 21) + '…' : n;
  if (row.host) return row.host.length > 22 ? row.host.slice(0, 21) + '…' : row.host;
  return '@' + String(row.key).replace(/^@/, '').slice(0, 8) + '…';
};

const buildFederationSvg = (myName, rows, links, ownVersion) => {
  const W = 900;
  const H = 640;
  const cx = W / 2;
  const cy = H / 2;
  const N = Math.max(1, rows.length);
  const r = Math.min(W, H) * (N <= 6 ? 0.34 : 0.42);
  const pos = new Map(rows.map((row, i) => {
    const angle = (i / N) * TAU - Math.PI / 2;
    return [row.key, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }];
  }));
  const radius = (row) => 12 + Math.min(14, Math.sqrt(row.inhabitants || 0) * 1.6);
  const fed = links.map(l => {
    const A = pos.get(l.a), B = pos.get(l.b);
    return `<line x1="${A.x.toFixed(2)}" y1="${A.y.toFixed(2)}" x2="${B.x.toFixed(2)}" y2="${B.y.toFixed(2)}" class="graphos-fed-link ${l.mutual ? 'graphos-fed-mutual' : 'graphos-fed-oneway'}" />`;
  }).join('');
  const mine = rows.filter(row => row.state === 'connected' || row.following).map(row => {
    const P = pos.get(row.key);
    return `<line x1="${cx}" y1="${cy}" x2="${P.x.toFixed(2)}" y2="${P.y.toFixed(2)}" class="${row.state === 'connected' ? 'graphos-fed-me-live' : 'graphos-fed-me-follow'}" />`;
  }).join('');
  const nodes = rows.map(row => {
    const P = pos.get(row.key);
    const rr = radius(row);
    const old = olderThan(row.version, ownVersion) || (!row.version && row.known);
    const name = escText(pubLabel(row));
    const enc = escAttr(encodeURIComponent(row.key));
    const below = (P.y + rr + 14).toFixed(2);
    return `<g class="graphos-node">`
      + `<title>${escText(row.name || row.host || row.key)}${row.version ? ' · ' + escText(row.version) : ''}</title>`
      + `<a href="/author/${enc}" class="graphos-node-link">`
      + (old ? `<circle cx="${P.x.toFixed(2)}" cy="${P.y.toFixed(2)}" r="${(rr + 5).toFixed(2)}" class="graphos-fed-outdated-ring" />` : '')
      + (row.isolated ? `<circle cx="${P.x.toFixed(2)}" cy="${P.y.toFixed(2)}" r="${(rr + (old ? 10 : 5)).toFixed(2)}" class="graphos-fed-isolated-ring" />` : '')
      + `<circle cx="${P.x.toFixed(2)}" cy="${P.y.toFixed(2)}" r="${rr.toFixed(2)}" class="graphos-node-circle graphos-fed-${row.state}" />`
      + `<text x="${P.x.toFixed(2)}" y="${below}" text-anchor="middle" class="graphos-node-label">${name}</text>`
      + (row.transport === 'tor' ? `<text x="${P.x.toFixed(2)}" y="${(Number(below) + 13).toFixed(2)}" text-anchor="middle" class="graphos-fed-tor">TOR</text>` : '')
      + `</a></g>`;
  }).join('');
  const me = `<g class="graphos-node graphos-node-me"><title>${escText(myName)}</title>`
    + `<circle cx="${cx}" cy="${cy}" r="22" class="graphos-node-circle graphos-node-circle-me" />`
    + `<text x="${cx}" y="${cy + 38}" text-anchor="middle" class="graphos-node-label graphos-node-label-me">${escText(myName)}</text></g>`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" class="graphos-svg">`
    + fed + mine + nodes + me
    + `</svg>`;
};

exports.graphosFederationView = ({ myName, rows = [], links = [], ownVersion = '' }) => {
  const title = i18n.graphos || 'Graphos';
  const ORDER = { connected: 0, available: 1, unreachable: 2, unknown: 3 };
  const sorted = rows.slice().sort((x, y) => (ORDER[x.state] - ORDER[y.state]) || (y.inhabitants - x.inhabitants) || pubLabel(x).localeCompare(pubLabel(y)));
  const outdated = (row) => olderThan(row.version, ownVersion) || (!row.version && row.known);
  const count = (fn) => sorted.filter(fn).length;
  const stateChip = (row) => {
    if (row.state === 'connected') return renderStateChip('mutuals', null, String(i18n.peerStateConnected).toUpperCase());
    if (row.state === 'available') return renderStateChip(outdated(row) ? 'whole' : 'mutuals', null, String(i18n.peerStateStaged).toUpperCase());
    if (row.state === 'unreachable') return renderStateChip('hidden', null, String(i18n[NET_REASON_KEYS[row.reason] || 'peerErrSilent'] || i18n.peerErrOther).toUpperCase());
    return renderStateChip('hidden', null, String(i18n.graphosFedNoData).toUpperCase());
  };
  const versionChip = (row) => row.version
    ? renderStateChip(outdated(row) ? 'closed' : 'mutuals', null, row.version)
    : (row.known ? span({ title: i18n.peerVersionUnannounced }, renderStateChip('closed', null, String(i18n.peerOutdated).toUpperCase())) : '—');
  const transportChip = (row) => row.transport === 'unknown' ? '—'
    : renderStateChip(row.transport === 'tor' ? 'fediverse' : 'transport', null, String(row.transport === 'tor' ? i18n.peerErrTor : row.transport === 'both' ? i18n.graphosFedBoth : i18n.graphosFedClearnet).toUpperCase());
  const linksCell = (row) => !row.known ? '—' : row.isolated ? renderStateChip('closed', null, String(i18n.graphosFedIsolated).toUpperCase()) : String(row.links);
  return template(
    title,
    section(
      div({ class: 'tags-header module-header-line' },
        h2(title),
        p(i18n.graphosDescription || '')
      ),
      div({ class: 'mode-buttons stats-mode-row' },
        ['ALL', 'MINE', 'FEDERATION'].map(m =>
          form({ method: 'GET', action: '/graphos' },
            input({ type: 'hidden', name: 'filter', value: m }),
            button({ type: 'submit', class: m === 'FEDERATION' ? 'filter-btn active' : 'filter-btn' }, String(m === 'FEDERATION' ? i18n.graphosFederation : i18n[m + 'Button']).toUpperCase())
          )
        )
      ),
      div({ class: 'stats-block graphos-stats' },
        div({ class: 'stats-grid' },
          kpi(i18n.graphosFedPubs, sorted.length),
          kpi(i18n.peerStateConnected, count(r => r.state === 'connected')),
          kpi(i18n.graphosFedUnreachable, count(r => r.state === 'unreachable')),
          kpi(i18n.peerOutdated, count(outdated)),
          kpi(i18n.peerErrTor, count(r => r.transport === 'tor')),
          kpi(i18n.graphosFedLinks, links.filter(l => l.mutual).length),
          kpi(i18n.graphosFedIsolated, count(r => r.isolated))
        )
      ),
      sorted.length ? div({ class: 'graphos-canvas', innerHTML: buildFederationSvg(myName || '', sorted, links, ownVersion) }) : p(i18n.graphosFedEmpty),
      div({ class: 'graphos-legend' },
        legendItem('me', i18n.graphosYou || 'You'),
        span({ class: 'graphos-legend-item' }, span({ class: 'graphos-legend-dot graphos-fed-dot-connected' }), span(i18n.peerStateConnected)),
        span({ class: 'graphos-legend-item' }, span({ class: 'graphos-legend-dot graphos-fed-dot-available' }), span(i18n.peerStateStaged)),
        span({ class: 'graphos-legend-item' }, span({ class: 'graphos-legend-dot graphos-fed-dot-unreachable' }), span(i18n.graphosFedUnreachable)),
        span({ class: 'graphos-legend-item' }, span({ class: 'graphos-legend-dot graphos-fed-dot-outdated' }), span(i18n.peerOutdated)),
        span({ class: 'graphos-legend-item' }, span({ class: 'graphos-legend-line graphos-fed-line-mutual' }), span(i18n.graphosFedMutual)),
        span({ class: 'graphos-legend-item' }, span({ class: 'graphos-legend-line graphos-fed-line-oneway' }), span(i18n.graphosFedOneWay))
      ),
      sorted.length ? table({ class: 'block-info-table graphos-fed-table' },
        tr(
          td({ class: 'card-label' }, 'PUB'),
          td({ class: 'card-label' }, i18n.peersOasisVersion),
          td({ class: 'card-label' }, i18n.graphosFedTransport),
          td({ class: 'card-label' }, i18n.peerStateLabel),
          td({ class: 'card-label' }, i18n.graphosFedWith),
          td({ class: 'card-label' }, i18n.graphosFedInhabitants)
        ),
        ...sorted.map(row => tr(
          td({ 'data-label': 'PUB' }, a({ href: `/author/${encodeURIComponent(row.key)}`, class: 'user-link', title: row.host || row.key }, pubLabel(row))),
          td({ 'data-label': i18n.peersOasisVersion }, versionChip(row)),
          td({ 'data-label': i18n.graphosFedTransport }, transportChip(row)),
          td({ 'data-label': i18n.peerStateLabel }, stateChip(row)),
          td({ 'data-label': i18n.graphosFedWith }, linksCell(row)),
          td({ 'data-label': i18n.graphosFedInhabitants }, row.known ? String(row.inhabitants) : '—')
        ))
      ) : null
    )
  );
};
