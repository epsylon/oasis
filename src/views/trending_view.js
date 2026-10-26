const { div, h2, p, section, button, form, input } = require("../server/node_modules/hyperaxe");
const { template, i18n, renderModuleStats, paged, hasRelation, RELATION_FILTERS, relationFilterLabel } = require('./main_views');
const { config } = require('../server/SSB_server.js');
const { renderActionCards, rootTypeLabel } = require('./activity_view');

const userId = config.keys.id;

const capFirst = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const typeLabel = (type) => i18n['type' + capFirst(type)] || rootTypeLabel(type) || type;

const filterButton = (mode, currentFilter) =>
  form({ method: 'GET', action: '/trending' },
    input({ type: 'hidden', name: 'filter', value: mode }),
    button(
      { type: 'submit', class: currentFilter === mode ? 'filter-btn active' : 'filter-btn' },
      RELATION_FILTERS.includes(mode.toLowerCase()) ? relationFilterLabel(mode.toLowerCase()) : String(i18n[mode + 'Button'] || typeLabel(mode)).toUpperCase()
    )
  );

const asCardAction = (item, commentCounts) => ({
  ...item,
  id: item.key,
  type: item.value.content.type,
  author: item.value.author,
  ts: item.value.timestamp,
  content: item.value.content,
  ...(commentCounts instanceof Map ? { commentCount: commentCounts.get(item.key) || 0 } : {})
});

exports.trendingView = (items, filter, spreadMap = new Map(), q = '', allItems = null, params = {}) => {
  const title = i18n.trendingTitle;

  const baseFilters = ['TOP', 'ALL', 'RECENT', 'MINE', 'SUPPORTED', 'REPLICATED'];
  const contentFilters = [
    ['votes', 'event', 'task', 'report'],
    ['feed', 'post', 'project', 'industry', 'shopProduct', 'transfer'],
    ['audio', 'bookmark', 'document', 'file', 'image', 'torrent', 'video'],
    ['podcast', 'podcastEpisode', 'campaign', 'logisticsRoute'],
    ['wikiPage', 'map', 'industryBlueprint', 'job']
  ];

  let filteredItems = items.filter(item => {
    const c = item.value?.content || item.content;
    return c && typeof c === 'object' && c.type !== 'tombstone';
  });
  const censusItems = Array.isArray(allItems) ? allItems : filteredItems;
  const presentTypes = new Set(censusItems.map(item => (item.value?.content || item.content || {}).type).filter(Boolean));
  const emptyTrend = censusItems.length === 0 && !String(q || '').trim();
  const shownBase = baseFilters.filter(mode => !RELATION_FILTERS.includes(mode.toLowerCase()) || mode === filter || hasRelation(mode.toLowerCase(), censusItems));

  if (filter === 'MINE') {
    filteredItems = filteredItems.filter(item => item.value.author === userId);
  } else if (filter === 'SUPPORTED' || filter === 'REPLICATED') {
    filteredItems = filteredItems.filter(item => filter === 'SUPPORTED' ? item.isSupported : item.isReplicated);
  } else if (filter === 'RECENT') {
    const now = Date.now();
    filteredItems = filteredItems.filter(item => now - item.value.timestamp < 24 * 60 * 60 * 1000);
  } else if (filter === 'TOP') {
    filteredItems.sort((a, b) => (b.trendScore || 0) - (a.trendScore || 0) || b.value.timestamp - a.value.timestamp);
  } else if (contentFilters.flat().includes(filter)) {
    filteredItems = filteredItems.filter(item =>
      item.value.content.type === filter ||
      (filter === 'votes' && item.value.content.type === 'poll'));
  } else if (filter !== 'ALL') {
    filteredItems = filteredItems.filter(item => (item.trendScore || 0) > 0);
  }

  if (filter !== 'TOP') {
    filteredItems.sort((a, b) => b.value.timestamp - a.value.timestamp);
  }

  const header = div({ class: 'tags-header module-header-line' }, h2(title), p(i18n.exploreTrending));
  const seenDocs = new Set();
  const shownItems = filteredItems.filter(item => {
    const c = item.value.content || {};
    const t = c.type === 'document' ? String(c.title || '').trim() : '';
    if (!t) return true;
    if (seenDocs.has(t)) return false;
    seenDocs.add(t);
    return true;
  });
  const pageItems = paged(shownItems);
  const rendered = pageItems.length
    ? renderActionCards(pageItems.map(item => asCardAction(item, params.commentCounts)), userId, null, spreadMap, { ordered: true, favIndex: params.favIndex, opinionRoute: (id) => `/trending/${encodeURIComponent(id)}` })
    : [];
  const cards = Array.isArray(rendered) ? rendered : [];


  let html = template(
    title,
    section(
      header,
      emptyTrend ? null : div(
        { class: 'mode-buttons' },
        div({ class: 'column' }, shownBase.map(mode => filterButton(mode, filter))),
        ...contentFilters.map(row => {
          const visible = row.filter(mode => presentTypes.has(mode) || (mode === 'votes' && presentTypes.has('poll')));
          return visible.length ? div({ class: 'column' }, visible.map(mode => filterButton(mode, filter))) : null;
        })
      ),
      emptyTrend ? null : div({ class: 'filters activity-filter-chips activity-toolbar-row' },
        renderModuleStats(shownItems.length),
        form({ method: 'GET', action: '/trending', class: 'filter-box' },
          input({ type: 'hidden', name: 'filter', value: filter }),
          input({ type: 'text', name: 'q', value: q, placeholder: i18n.trendingSearchPlaceholder, class: 'filter-box__input' }),
          div({ class: 'filter-box__controls' },
            button({ type: 'submit', class: 'filter-box__button' }, i18n.searchButton)
          )
        )
      ),
      section(
        cards.length
          ? div({ class: 'trending-container' }, ...cards)
          : div({ class: 'no-results' }, p(i18n.trendingNoContentMessage))
      )
    )
  );

  return html;
};

