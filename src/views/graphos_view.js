const h = require("../server/node_modules/hyperaxe");
const { div, h2, p, section, button, form, input, span, a } = h;
const { template, i18n } = require('./main_views');

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

const buildGraphSvg = (me, peers) => {
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
    + edges + nodes + center
    + `</svg>`;
};

const kpi = (label, value) => div({ class: 'stats-kpi' },
  div({ class: 'stats-kpi-label' }, label),
  div({ class: 'stats-kpi-value' }, String(value))
);

const legendItem = (kind, label) =>
  span({ class: 'graphos-legend-item' },
    span({ class: `graphos-legend-dot graphos-node-circle-${kind}` }),
    span(label)
  );

exports.graphosView = ({ filter, me, peers, kpis, focus = null, focusId = null, shown = null, total = null }) => {
  const title = i18n.graphos || 'Graphos';
  const description = i18n.graphosDescription || 'Interactive map of the network around you.';
  const modes = ['ALL', 'MINE'];
  const capped = Number.isFinite(shown) && Number.isFinite(total) && total > shown;

  return template(
    title,
    section(
      div({ class: 'tags-header' },
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
                button({ type: 'submit', class: filter === m ? 'filter-btn active' : 'filter-btn' }, i18n[m + 'Button'])
              )
            )
          ),
      capped
        ? p({ class: 'graphos-cap-note' }, `${i18n.graphosShowing || 'Showing'} ${shown} / ${total}`)
        : null,
      div({ class: 'graphos-legend' },
        legendItem('me', i18n.graphosYou || 'You'),
        legendItem('online', i18n.online || 'Online'),
        filter !== 'MINE' ? legendItem('discovered', i18n.discovered || 'Discovered') : null,
        filter !== 'MINE' ? legendItem('unknown', i18n.unknown || 'Unknown') : null
      ),
      div({ class: 'graphos-canvas', innerHTML: buildGraphSvg(me, peers) }),
      div({ class: 'stats-block' },
        div({ class: 'stats-grid' },
          kpi(i18n.graphosTotalNodes || 'Total nodes', kpis.total),
          kpi(i18n.online || 'Online', kpis.online),
          filter !== 'MINE' ? kpi(i18n.discovered || 'Discovered', kpis.discovered) : null,
          filter !== 'MINE' ? kpi(i18n.unknown || 'Unknown', kpis.unknown) : null
        )
      )
    )
  );
};
