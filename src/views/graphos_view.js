const h = require("../server/node_modules/hyperaxe");
const RAW_HTML = Symbol.for('oasis.rawHtml');
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
    + `<a href="/graphos?filter=MINE" class="graphos-node-link">`
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

const zoomableGraph = (id, svg, stats = []) => [
  div({ class: 'graphos-legend graphos-statsbar' }, ...stats.filter(Boolean),
    a({ href: process.env.OASIS_MOBILE === '1' ? `#${id}-focus` : `#${id}`, id: `${id}-src`, class: 'tribe-action-btn graphos-zoom-btn' }, span({ class: 'graphos-zoom-icon' }, '\u2922'), ` ${String(i18n.graphosZoom || 'Enlarge').toUpperCase()}`)
  ),
  div({ class: 'graphos-canvas' },
    div({ class: 'graphos-canvas-svg', [RAW_HTML]: svg })
  ),
  div({ id, class: 'lightbox graphos-lightbox' },
    a({ href: `#${id}-src`, class: 'lightbox-close' }, '\u00d7'),
    div({ class: 'graphos-canvas-zoom' },
      div({ class: 'graphos-zoom-stage' },
        div({ class: 'graphos-zoom-svg', [RAW_HTML]: svg }),
        span({ id: `${id}-focus`, class: 'graphos-zoom-focus' })
      )
    )
  )
];

const GRAPHOS_MODES = ['MINE', 'ALL', 'FEDERATION'];
const renderGraphosModes = (filter) => div({ class: 'mode-buttons stats-mode-row' },
  GRAPHOS_MODES.map(m =>
    form({ method: 'GET', action: '/graphos' },
      input({ type: 'hidden', name: 'filter', value: m }),
      button({ type: 'submit', class: filter === m ? 'filter-btn active' : 'filter-btn' }, String(m === 'FEDERATION' ? i18n.graphosFederation : m === 'MINE' ? i18n.graphosMine : i18n[m + 'Button']).toUpperCase())
    )
  )
);

const shortLabel = (name, max = 14) => {
  const t = String(name || '');
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
};

const seedOf = (key) => {
  let h = 2166136261;
  for (const ch of String(key)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
};

const meshLayout = (nodes, links, meKey) => {
  const N = nodes.length;
  const STEP = 240;
  const idx = new Map(nodes.map((n, i) => [n.key, i]));
  const maxLevel = Math.max(1, ...nodes.map(n => Number(n.level) || 0));
  const target = nodes.map(n => n.key === meKey ? 0 : STEP * Math.max(1, Number(n.level) || 1));
  const xs = new Float64Array(N);
  const ys = new Float64Array(N);
  nodes.forEach((n, i) => {
    const h = seedOf(n.key);
    const angle = (h % 3600) / 3600 * TAU;
    const r = n.key === meKey ? 0 : target[i] * (0.85 + ((h >>> 12) % 300) / 1000);
    xs[i] = Math.cos(angle) * r;
    ys[i] = Math.sin(angle) * r;
  });
  const edges = links.filter(l => idx.has(l.a) && idx.has(l.b)).map(l => [idx.get(l.a), idx.get(l.b)]);
  const area = Math.pow(STEP * (maxLevel + 1) * 2, 2);
  const k = Math.sqrt(area / Math.max(1, N)) * 0.9;
  const meIdx = idx.has(meKey) ? idx.get(meKey) : -1;
  const ITER = 260;
  let temp = STEP;
  const dx = new Float64Array(N);
  const dy = new Float64Array(N);
  for (let it = 0; it < ITER; it++) {
    dx.fill(0); dy.fill(0);
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        let ddx = xs[i] - xs[j], ddy = ys[i] - ys[j];
        let d2 = ddx * ddx + ddy * ddy;
        if (d2 < 0.01) { ddx = 0.1; ddy = 0.1; d2 = 0.02; }
        const f = (k * k) / d2;
        dx[i] += ddx * f; dy[i] += ddy * f;
        dx[j] -= ddx * f; dy[j] -= ddy * f;
      }
    }
    for (const [a, b] of edges) {
      const ddx = xs[a] - xs[b], ddy = ys[a] - ys[b];
      const d = Math.sqrt(ddx * ddx + ddy * ddy) || 0.1;
      const f = d / k;
      dx[a] -= ddx * f; dy[a] -= ddy * f;
      dx[b] += ddx * f; dy[b] += ddy * f;
    }
    for (let i = 0; i < N; i++) {
      if (i === meIdx) continue;
      const r = Math.sqrt(xs[i] * xs[i] + ys[i] * ys[i]) || 0.1;
      const pull = (target[i] - r) * 0.9;
      dx[i] += (xs[i] / r) * pull * k / STEP * 6;
      dy[i] += (ys[i] / r) * pull * k / STEP * 6;
      const disp = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 0.1;
      const move = Math.min(disp, temp);
      xs[i] += (dx[i] / disp) * move;
      ys[i] += (dy[i] / disp) * move;
    }
    if (meIdx >= 0) { xs[meIdx] = 0; ys[meIdx] = 0; }
    temp = Math.max(2, temp * 0.985);
  }
  const maxDegree = Math.max(1, ...nodes.map(n => Number(n.degree) || 0));
  const radius = (n) => {
    const r = 5 + 19 * Math.sqrt((Number(n.degree) || 0) / maxDegree);
    return n.key === meKey ? Math.max(14, r) : r;
  };
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const ddx = xs[j] - xs[i], ddy = ys[j] - ys[i];
        const d = Math.sqrt(ddx * ddx + ddy * ddy) || 0.1;
        const min = radius(nodes[i]) + radius(nodes[j]) + 26;
        if (d >= min) continue;
        const push = (min - d) / 2;
        const ux = ddx / d, uy = ddy / d;
        if (i !== meIdx) { xs[i] -= ux * push; ys[i] -= uy * push; }
        if (j !== meIdx) { xs[j] += ux * push; ys[j] += uy * push; }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { xs, ys, radius };
};

const buildNetworkSvg = (nodes, links, meKey) => {
  const PAD = 90;
  const { xs, ys, radius } = meshLayout(nodes, links, meKey);
  let extent = 300;
  for (let i = 0; i < nodes.length; i++) extent = Math.max(extent, Math.abs(xs[i]), Math.abs(ys[i]));
  const W = Math.round(2 * (extent + PAD));
  const H = W;
  const cx = W / 2;
  const cy = H / 2;
  const pos = new Map(nodes.map((n, i) => [n.key, { x: cx + xs[i], y: cy + ys[i] }]));
  const placed = [];
  const labelled = new Set();
  const boxOf = (n) => {
    const P = pos.get(n.key);
    const w = shortLabel(n.name).length * 10 + 6;
    const top = P.y + radius(n) + 2;
    return { x1: P.x - w / 2, x2: P.x + w / 2, y1: top, y2: top + 20 };
  };
  const clashes = (b) => placed.some(o => b.x1 < o.x2 && b.x2 > o.x1 && b.y1 < o.y2 && b.y2 > o.y1);
  const me = nodes.find(n => n.key === meKey);
  for (const n of [me, ...nodes.filter(x => x.key !== meKey).sort((a, b) => (b.degree || 0) - (a.degree || 0))].filter(Boolean)) {
    if (labelled.size >= 60) break;
    const b = boxOf(n);
    if (n.key !== meKey && clashes(b)) continue;
    placed.push(b);
    labelled.add(n.key);
  }
  const line = (l, cls) => {
    const A = pos.get(l.a), B = pos.get(l.b);
    return `<line x1="${A.x.toFixed(2)}" y1="${A.y.toFixed(2)}" x2="${B.x.toFixed(2)}" y2="${B.y.toFixed(2)}" class="${cls}" />`;
  };
  const shown = links.filter(l => pos.has(l.a) && pos.has(l.b));
  const isMine = (l) => l.a === meKey || l.b === meKey;
  const edges = shown.filter(l => !isMine(l)).map(l => line(l, `graphos-net-link ${l.mutual ? 'graphos-net-mutual' : 'graphos-net-oneway'}`)).join('')
    + shown.filter(isMine).map(l => line(l, `graphos-net-link graphos-net-mine${l.mutual ? '' : ' graphos-net-oneway'}`)).join('');
  const circles = nodes.map(node => {
    const P = pos.get(node.key);
    const rr = radius(node);
    const xs0 = P.x.toFixed(2);
    const ys0 = P.y.toFixed(2);
    const enc = escAttr(encodeURIComponent(node.key));
    const href = node.kind === 'me' ? '/graphos?filter=MINE' : `/graphos?center=${enc}`;
    const fill = node.replicated && (node.kind === 'reach' || node.kind === 'outside') ? 'replicated' : node.kind;
    const bothRing = node.replicated && node.kind === 'supported';
    const showLabel = labelled.has(node.key);
    const cls = `graphos-net-label${node.kind === 'me' ? ' graphos-node-label-me' : ''}`;
    return `<g class="graphos-node graphos-node-${node.kind}">`
      + `<title>${escText(node.name)} (${node.degree || 0})</title>`
      + `<a href="${href}" class="graphos-node-link">`
      + (bothRing ? `<circle cx="${xs0}" cy="${ys0}" r="${(rr + 4).toFixed(2)}" class="graphos-net-replicated-ring" />` : '')
      + `<circle cx="${xs0}" cy="${ys0}" r="${rr.toFixed(2)}" class="graphos-node-circle graphos-node-circle-${fill}" />`
      + `</a>`
      + (showLabel ? `<a href="/author/${enc}" class="graphos-node-link"><text x="${xs0}" y="${(P.y + rr + 16).toFixed(2)}" text-anchor="middle" class="${cls}">${escText(shortLabel(node.name))}</text></a>` : '')
      + `</g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" class="graphos-svg">`
    + edges + circles
    + `</svg>`;
};

const kpi = (label, value) => span({ class: 'graphos-legend-item graphos-kpi' },
  span({ class: 'stats-kpi-label' }, String(label).toUpperCase()),
  span({ class: 'stats-kpi-value' }, String(value))
);

const legendItem = (kind, label) =>
  span({ class: 'graphos-legend-item' },
    span({ class: `graphos-legend-dot graphos-node-circle-${kind}` }),
    span(label)
  );

exports.graphosView = ({ filter, me, peers, links = [], kpis, focus = null, focusId = null }) => {
  const title = i18n.graphos || 'Graphos';
  const description = i18n.graphosDescription || 'Interactive map of the network around you.';
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
              input({ type: 'hidden', name: 'filter', value: 'MINE' }),
              button({ type: 'submit', class: 'filter-btn' }, i18n.graphosBackToMine || '← My network')
            ),
            div({ class: 'graphos-focus-bar' },
              span({ class: 'graphos-focus-label' }, `${i18n.graphosViewingGraphOf || 'Viewing'}: `),
              a({ class: 'user-link', href: `/author/${encodeURIComponent(focusId || '')}` }, `@${focus}`)
            )
          ]
        : renderGraphosModes(filter),
      ...zoomableGraph('graphos-zoom', buildGraphSvg(me, peers, links), [
        kpi(i18n.graphosTotalNodes || 'Total nodes', kpis.total),
        kpi(i18n.onlinePlural || i18n.online || 'Online', kpis.online),
        kpi(i18n.discovered || 'Discovered', kpis.discovered),
        kpi(i18n.unknown || 'Unknown', kpis.unknown)
      ]),
      div({ class: 'graphos-legend' },
        legendItem('me', i18n.graphosYou || 'You'),
        legendItem('online', i18n.onlinePlural || i18n.online || 'Online'),
        legendItem('discovered', i18n.discovered || 'Discovered'),
        legendItem('unknown', i18n.unknown || 'Unknown'),
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
      renderGraphosModes('FEDERATION'),
      ...(sorted.length ? zoomableGraph('graphos-fed-zoom', buildFederationSvg(myName || '', sorted, links, ownVersion), [
        kpi(i18n.graphosFedPubs, sorted.length),
        kpi(i18n.peerStateConnected, count(r => r.state === 'connected')),
        kpi(i18n.graphosFedUnreachable, count(r => r.state === 'unreachable')),
        kpi(i18n.peerOutdated, count(outdated)),
        kpi(i18n.peerErrTor, count(r => r.transport === 'tor')),
        kpi(i18n.graphosFedLinks, links.filter(l => l.mutual).length),
        kpi(i18n.graphosFedIsolated, count(r => r.isolated))
      ]) : [p(i18n.graphosFedEmpty)]),
      div({ class: 'graphos-legend-rows' },
        div({ class: 'graphos-legend' },
          legendItem('me', i18n.graphosYou || 'You'),
          span({ class: 'graphos-legend-item' }, span({ class: 'graphos-legend-dot graphos-fed-dot-connected' }), span(i18n.peerStateConnected)),
          span({ class: 'graphos-legend-item' }, span({ class: 'graphos-legend-dot graphos-fed-dot-available' }), span(i18n.peerStateStaged)),
          span({ class: 'graphos-legend-item' }, span({ class: 'graphos-legend-dot graphos-fed-dot-unreachable' }), span(i18n.graphosFedUnreachable)),
          span({ class: 'graphos-legend-item' }, span({ class: 'graphos-legend-dot graphos-fed-dot-outdated' }), span(i18n.peerOutdated))
        ),
        div({ class: 'graphos-legend graphos-legend-lines' },
          span({ class: 'graphos-legend-item' }, span({ class: 'graphos-legend-line graphos-fed-line-mutual' }), span(i18n.graphosFedMutual)),
          span({ class: 'graphos-legend-item' }, span({ class: 'graphos-legend-line graphos-fed-line-oneway' }), span(i18n.graphosFedOneWay))
        )
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

exports.graphosNetworkView = ({ filter = 'ALL', nodes = [], links = [], kpis = {}, meKey = '', hops = 2 }) => {
  const title = i18n.graphos || 'Graphos';
  return template(
    title,
    section(
      div({ class: 'tags-header module-header-line' },
        h2(title),
        p(i18n.graphosDescription || '')
      ),
      renderGraphosModes(filter),
      ...zoomableGraph('graphos-net-zoom', buildNetworkSvg(nodes, links, meKey), [
        kpi(i18n.graphosTotalNodes || 'Total nodes', kpis.total || 0),
        kpi(i18n.graphosLegendSupported, kpis.supported || 0),
        kpi(i18n.graphosLegendReplicated, kpis.replicated || 0),
        kpi(i18n.settingsReplicationHopsLabel, kpis.reach || 0),
        kpi(i18n.graphosFedPubs, kpis.pubs || 0),
        kpi(i18n.graphosFedMutual, kpis.mutual || 0),
        kpi(i18n.graphosFedOneWay, kpis.oneway || 0)
      ]),
      div({ class: 'graphos-legend-rows' },
        div({ class: 'graphos-legend' },
          legendItem('me', i18n.graphosYou || 'You'),
          legendItem('supported', i18n.graphosLegendSupported),
          legendItem('replicated', i18n.graphosLegendReplicated),
          span({ class: 'graphos-legend-item' }, span({ class: 'graphos-legend-dot graphos-legend-both' }), span(i18n.graphosLegendBoth)),
          legendItem('reach', `${i18n.graphosLegendInHops} (${hops})`),
          legendItem('pub', i18n.graphosFedPubs),
          filter === 'ALL' ? legendItem('outside', i18n.graphosLegendOutside) : null
        ),
        div({ class: 'graphos-legend graphos-legend-lines' },
          span({ class: 'graphos-legend-item' }, span({ class: 'graphos-legend-line graphos-net-line-mine' }), span(i18n.graphosYourLinks)),
          span({ class: 'graphos-legend-item' }, span({ class: 'graphos-legend-line graphos-fed-line-mutual' }), span(i18n.graphosFedMutual)),
          span({ class: 'graphos-legend-item' }, span({ class: 'graphos-legend-line graphos-fed-line-oneway' }), span(i18n.graphosFedOneWay))
        )
      )
    )
  );
};
