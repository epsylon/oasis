const { div, h2, p, section, button, form, a, textarea, br, input, table, tr, th, td, img, video: videoHyperaxe, audio: audioHyperaxe, span, details, summary} = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink, renderSpreadButton, renderContentActions} = require('./main_views');
const { renderTextWithStyles } = require('../backend/renderTextWithStyles');
const { config } = require('../server/SSB_server.js');
const { renderUrl } = require('../backend/renderUrl');
const opinionCategories = require('../backend/opinion_categories');
const { sanitizeHtml } = require('../backend/sanitizeHtml');

const userId = config.keys.id;

const filterButton = (mode, currentFilter) =>
  form({ method: 'GET', action: '/trending' },
    input({ type: 'hidden', name: 'filter', value: mode }),
    button(
      { type: 'submit', class: currentFilter === mode ? 'filter-btn active' : 'filter-btn' },
      String(i18n[mode + 'Button'] || mode).toUpperCase()
    )
  );

const voteLabelFor = (cat) =>
  i18n['vote' + cat.charAt(0).toUpperCase() + cat.slice(1)] || cat;

const renderTrendingCard = (item, votes, categories, seenTitles, spreadMap = new Map()) => {
  const c = item.value.content;
  const created = new Date(item.value.timestamp).toLocaleString();

  let contentHtml;

  if (c.type === 'bookmark') {
    const { url, description, lastVisit } = c;
    contentHtml = div({ class: 'trending-bookmark' },
      div({ class: 'card-section bookmark' },
        url ? h2(p(a({ href: url, target: '_blank', class: "bookmark-url" }, url))) : "",
        lastVisit
          ? div(
              { class: 'card-field' },
              span({ class: 'card-label' }, i18n.bookmarkLastVisitLabel + ':'),
              span({ class: 'card-value' }, new Date(lastVisit).toLocaleString())
            )
          : "",
        description ? [span({ class: 'card-label' }, i18n.bookmarkDescriptionLabel + ":"), p(...renderUrl(description))] : null
      )
    );
  } else if (c.type === 'image') {
    const { url, title, description } = c;
    contentHtml = div({ class: 'trending-image' },
      div({ class: 'card-section image' },
        title ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.imageTitleLabel + ':'), span({ class: 'card-value' }, title)) : "",
        description ? [span({ class: 'card-label' }, i18n.imageDescriptionLabel + ":"), p(...renderUrl(description))] : null,
        div({ class: 'card-field' }, img({ src: `/blob/${encodeURIComponent(url)}`, class: 'feed-image' }))
      )
    );
  } else if (c.type === 'audio') {
    const { url, mimeType, title, description } = c;
    contentHtml = div({ class: 'trending-audio' },
      div({ class: 'card-section audio' },
        title?.trim() ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.audioTitleLabel + ':'), span({ class: 'card-value' }, title)) : "",
        description ? [span({ class: 'card-label' }, i18n.audioDescriptionLabel + ":"), p(...renderUrl(description))] : null,
        url
          ? div({ class: 'card-field audio-container' }, audioHyperaxe({ controls: true, src: `/blob/${encodeURIComponent(url)}`, type: mimeType }))
          : div({ class: 'card-field' }, p(i18n.audioNoFile))
      )
    );
  } else if (c.type === 'video') {
    const { url, mimeType, title, description } = c;
    contentHtml = div({ class: 'trending-video' },
      div({ class: 'card-section video' },
        title?.trim() ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.videoTitleLabel + ':'), span({ class: 'card-value' }, title)) : "",
        description ? [span({ class: 'card-label' }, i18n.videoDescriptionLabel + ":"), p(...renderUrl(description))] : null,
        br(),
        url
          ? div({ class: 'card-field video-container' }, videoHyperaxe({ controls: true, src: `/blob/${encodeURIComponent(url)}`, type: mimeType, preload: 'metadata', width: '640', height: '360' }))
          : div({ class: 'card-field' }, p(i18n.videoNoFile))
      )
    );
  } else if (c.type === 'torrent') {
    const { url, title, description } = c;
    contentHtml = div({ class: 'trending-torrent' },
      div({ class: 'card-section torrent' },
        title?.trim() ? div({ class: 'card-field' }, span({ class: 'card-label' }, (i18n.torrentTitleLabel || 'Title') + ':'), span({ class: 'card-value' }, title)) : "",
        description ? [span({ class: 'card-label' }, (i18n.torrentDescriptionLabel || 'Description') + ":"), p(...renderUrl(description))] : null,
        url && url.startsWith("&")
          ? div({ class: 'card-field' }, a({ href: `/blob/${encodeURIComponent(url)}`, class: 'filter-btn' }, i18n.torrentDownload || 'Download'))
          : div({ class: 'card-field' }, p(i18n.torrentNoFile || 'No file'))
      )
    );
  } else if (c.type === 'document') {
    const { url, title, description } = c;
    const t = title?.trim();
    if (t && seenTitles.has(t)) return null;
    if (t) seenTitles.add(t);

    contentHtml = div({ class: 'trending-document' },
      div({ class: 'card-section document' },
        t ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.documentTitleLabel + ':'), span({ class: 'card-value' }, t)) : "",
        description ? [span({ class: 'card-label' }, i18n.documentDescriptionLabel + ":"), p(...renderUrl(description))] : null,
        div({ id: `pdf-container-${item.key}`, class: 'pdf-viewer-container', 'data-pdf-url': `/blob/${encodeURIComponent(url)}` })
      )
    );
  } else if (c.type === 'industry') {
    contentHtml = div({ class: 'trending-industry' },
      div({ class: 'card-section industry' },
        div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.industryName + ':'), span({ class: 'card-value' }, c.name || '')),
        c.sector ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.industrySector + ':'), span({ class: 'card-value' }, String(c.sector).toUpperCase())) : "",
        c.membershipPolicy ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.industryMembershipPolicy + ':'), span({ class: 'card-value' }, String(i18n['industryPolicy_' + c.membershipPolicy] || c.membershipPolicy).toUpperCase())) : "",
        c.description ? p(...renderUrl(c.description)) : null,
        Array.isArray(c.tags) && c.tags.length
          ? div({ class: 'card-tags' }, c.tags.map(tag => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)))
          : null
      )
    );
  } else if (c.type === 'industryBlueprint') {
    contentHtml = div({ class: 'trending-industry' },
      div({ class: 'card-section industry' },
        div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.industryBlueprint + ':'), span({ class: 'card-value' }, c.name || '')),
        c.outKind ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.industryOutputKind + ':'), span({ class: 'card-value' }, String(i18n['industryKind_' + c.outKind] || c.outKind).toUpperCase())) : "",
        c.laborHours ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.industryLaborHours + ':'), span({ class: 'card-value' }, String(c.laborHours))) : "",
        c.description ? p(...renderUrl(c.description)) : null
      )
    );
  } else if (c.type === 'housing') {
    const free = String(c.housing_type || '').toLowerCase() === 'couchsurfing';
    contentHtml = div({ class: 'trending-housing' },
      div({ class: 'card-section housing' },
        div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.title + ':'), span({ class: 'card-value' }, c.title || '')),
        c.housing_type ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.housingType + ':'), span({ class: 'card-value' }, String(i18n['housingType' + String(c.housing_type).toUpperCase()] || c.housing_type).toUpperCase())) : "",
        c.property_type ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.housingProperty + ':'), span({ class: 'card-value' }, String(i18n['housingProperty' + String(c.property_type).toUpperCase()] || c.property_type).toUpperCase())) : "",
        div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.housingPrice + ':'), span({ class: 'card-value' }, free ? (i18n.housingFree || 'FREE') : `${Number(c.price || 0).toFixed(2)} ECO`)),
        c.place ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.housingPlace + ':'), span({ class: 'card-value' }, c.place)) : "",
        Number(c.rooms) > 0 ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.housingRooms + ':'), span({ class: 'card-value' }, String(c.rooms))) : "",
        Number(c.size) > 0 ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.housingSize + ':'), span({ class: 'card-value' }, `${c.size} m²`)) : "",
        c.description ? p(...renderUrl(c.description)) : null,
        Array.isArray(c.tags) && c.tags.length
          ? div({ class: 'card-tags' }, c.tags.map(tag => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)))
          : null
      )
    );
  } else if (c.type === 'market') {
    contentHtml = div({ class: 'trending-market' },
      div({ class: 'card-section market' },
        div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.title + ':'), span({ class: 'card-value' }, c.title || '')),
        c.item_type ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.marketItemType + ':'), span({ class: 'card-value' }, String(c.item_type).toUpperCase())) : "",
        c.item_status ? div({ class: 'card-field' }, span({ class: 'card-label' }, (i18n.marketItemCondition || i18n.status) + ':'), span({ class: 'card-value' }, String(c.item_status).toUpperCase())) : "",
        div({ class: 'card-field' }, span({ class: 'card-label' }, (i18n.marketItemPrice || i18n.price) + ':'), span({ class: 'card-value' }, `${c.price} ECO`)),
        c.description ? p(...renderUrl(c.description)) : null,
        Array.isArray(c.tags) && c.tags.length
          ? div({ class: 'card-tags' }, c.tags.map(tag => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)))
          : null
      )
    );
  } else if (c.type === 'feed') {
    const { text, refeeds } = c;
    contentHtml = div({ class: 'trending-feed' },
      div({ class: 'card-section feed' },
        div({ class: 'feed-text', innerHTML: sanitizeHtml(renderTextWithStyles(text)) }),
        refeeds
            ? h2({ class: 'card-field' }, span({ class: 'card-label' }, i18n.tribeFeedRefeeds + ': '), span({ class: 'card-value' }, refeeds))
            : ""
      )
    );
  } else if (c.type === 'votes' || c.type === 'poll') {
    const { question, deadline, votes: vmap, totalVotes } = c;
    const votesList = vmap && typeof vmap === 'object'
      ? Object.entries(vmap).map(([o, cnt]) => ({ option: o, count: cnt }))
      : [];
    contentHtml = div({ class: 'trending-votes' },
      div({ class: 'card-section votes' },
        div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.voteQuestionLabel + ':'), span({ class: 'card-value' }, question)),
        div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.voteDeadline + ':'), span({ class: 'card-value' }, deadline ? new Date(deadline).toLocaleString() : '')),
        div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.voteTotalVotes + ':'), span({ class: 'card-value' }, totalVotes)),
        table(
          tr(...votesList.map(v => th(i18n[v.option] || v.option))),
          tr(...votesList.map(v => td(v.count)))
        )
      )
    );
  } else if (c.type === 'transfer') {
    const { from, to, concept, amount, deadline, status, confirmedBy = [] } = c;
    contentHtml = div({ class: 'trending-transfer' },
      div({ class: 'card-section transfer' },
        div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.concept + ':'), span({ class: 'card-value' }, concept)),
        div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.deadline + ':'), span({ class: 'card-value' }, deadline ? new Date(deadline).toLocaleString() : '')),
        div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.status + ':'), span({ class: 'card-value' }, status)),
        div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.amount + ':'), span({ class: 'card-value' }, amount)),
        div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.from + ':'), span({ class: 'card-value' }, a({ href: `/author/${encodeURIComponent(from)}`, target: '_blank' }, from))),
        div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.to + ':'), span({ class: 'card-value' }, a({ href: `/author/${encodeURIComponent(to)}`, target: '_blank' }, to))),
        h2({ class: 'card-field' }, span({ class: 'card-label' }, i18n.transfersConfirmations + ': '), span({ class: 'card-value' }, `${confirmedBy.length}/2`))
      )
    );
  } else {
    contentHtml = div({ class: 'styled-text' },
      div({ class: 'card-section styled-text-content' },
        div(
          { class: 'card-field' },
          span({ class: 'card-value', innerHTML: sanitizeHtml(renderTextWithStyles(c.title || c.name || c.text || c.description || '[no content]')) })
        )
      )
    );
  }

  const detailPaths = {
    bookmark: 'bookmarks',
    image: 'images',
    audio: 'audios',
    video: 'videos',
    torrent: 'torrents',
    document: 'documents',
    feed: 'feed',
    votes: 'votes',
    transfer: 'transfers',
    industry: 'industry',
    project: 'projects',
    report: 'reports',
    task: 'tasks',
    event: 'events',
    shopProduct: 'shops/product',
    housing: 'housing',
    market: 'market'
  };
  const detailHref = detailPaths[c.type]
    ? `/${detailPaths[c.type]}/${encodeURIComponent(item.key)}`
    : `/thread/${encodeURIComponent(item.key)}`;
  const isOwn = item.value.author && String(item.value.author) === String(userId);

  return div(
    { class: 'trending-card' + (isOwn ? ' own-content' : '') },
    div(
      { class: 'card-header activity-card-header' },
      span({ class: 'pm-exposition-chip pm-exposition-whole' },
        span({ class: 'pm-exposition-text' }, String(c.type || '').toUpperCase())
      ),
      renderContentActions(item.key, detailHref, { spread: spreadMap.get(item.key) || null })
    ),
    div(
      { class: 'card-section trending-card-body' },
      contentHtml,
      p(
        { class: 'card-footer' },
        span({ class: 'date-link' }, `${created} ${i18n.performed} `),
        userLink(item.value.author)
      ),
      (() => {
        const ops = c.opinions || {};
        const entries = Object.entries(ops).filter(([, v]) => v > 0);
        const dominantPart = (() => {
          if (!entries.length) return null;
          const maxVal = Math.max(...entries.map(([, v]) => v));
          const dominant = entries.filter(([, v]) => v === maxVal).map(([k]) => voteLabelFor(k));
          return [
            span({ class: 'trending-dominant-sep' }, '|'),
            span({ class: 'trending-dominant-text' }, `${i18n.moreVoted || 'More Voted'}: ${dominant.join(' + ')}`)
          ];
        })();
        return h2(
          `${i18n.trendingTotalOpinions || i18n.trendingTotalCount}: `,
          span({ class: 'trending-total-count' }, String(votes)),
          ...(dominantPart || [])
        );
      })(),
      details({ class: 'opinions-voting-collapse' },
        summary({ class: 'opinions-summary' },
          span({ class: 'opinions-summary-icon' }, 'ꔍ'),
          span({ class: 'opinions-summary-count' }, `(${Object.values(c.opinions || {}).reduce((s, n) => s + (Number(n) || 0), 0)})`)),
        div(
          { class: 'voting-buttons' },
          categories.map(cat =>
            form({ method: 'POST', action: `/trending/${encodeURIComponent(item.key)}/${cat}` },
              button(
                { class: 'vote-btn' },
                `${String(voteLabelFor(cat)).toUpperCase()} [${c.opinions?.[cat] || 0}]`
              )
            )
          )
        )
      )
    )
  );
};

exports.trendingView = (items, filter, categories = opinionCategories, spreadMap = new Map()) => {
  const seenDocumentTitles = new Set();
  const title = i18n.trendingTitle;

  const baseFilters = ['ALL', 'MINE', 'RECENT', 'TOP'];
  const contentFilters = [
    ['votes', 'event', 'task', 'report'],
    ['feed', 'project', 'industry', 'shopProduct', 'transfer'],
    ['audio', 'bookmark', 'document', 'image', 'torrent', 'video']
  ];

  let filteredItems = items.filter(item => {
    const c = item.value?.content || item.content;
    return c && typeof c === 'object' && c.type !== 'tombstone';
  });

  if (filter === 'MINE') {
    filteredItems = filteredItems.filter(item => item.value.author === userId);
  } else if (filter === 'RECENT') {
    const now = Date.now();
    filteredItems = filteredItems.filter(item => now - item.value.timestamp < 24 * 60 * 60 * 1000);
  } else if (filter === 'TOP') {
    filteredItems.sort((a, b) => {
      const aVotes = (a.value.content.opinions_inhabitants || []).length;
      const bVotes = (b.value.content.opinions_inhabitants || []).length;
      return bVotes !== aVotes ? bVotes - aVotes : b.value.timestamp - a.value.timestamp;
    });
  } else if (contentFilters.flat().includes(filter)) {
    filteredItems = filteredItems.filter(item =>
      item.value.content.type === filter ||
      (filter === 'votes' && item.value.content.type === 'poll'));
  } else if (filter !== 'ALL') {
    filteredItems = filteredItems.filter(item => (item.value.content.opinions_inhabitants || []).length > 0);
  }

  if (filter !== 'TOP') {
    filteredItems.sort((a, b) => b.value.timestamp - a.value.timestamp);
  }

  const header = div({ class: 'tags-header' }, h2(title), p(i18n.exploreTrending));
  const cards = filteredItems
    .map(item =>
      renderTrendingCard(
        item,
        Object.values(item.value.content.opinions || {}).reduce((s, n) => s + (n || 0), 0),
        categories,
        seenDocumentTitles,
        spreadMap
      )
    )
    .filter(Boolean);

  const hasDocument = filteredItems.some(item => item.value.content.type === 'document');

  let html = template(
    title,
    section(
      header,
      div(
        { class: 'mode-buttons' },
        div({ class: 'column' }, baseFilters.map(mode => filterButton(mode, filter))),
        ...contentFilters.map(row =>
          div({ class: 'column' }, row.map(mode => filterButton(mode, filter)))
        )
      ),
      section(
        cards.length
          ? div({ class: 'trending-container' }, ...cards)
          : div({ class: 'no-results' }, p(i18n.trendingNoContentMessage))
      )
    )
  );

  if (hasDocument) {
    html += `
      <script type="module" src="/js/pdf.min.mjs"></script>
      <script src="/js/pdf-viewer.js"></script>
    `;
  }

  return html;
};

