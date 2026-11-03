const { div, h2, p, section, form, input } = require("../server/node_modules/hyperaxe");
const { template, i18n, renderLayoutSwitch, renderModuleStats, paged, hasRelation, RELATION_FILTERS, relationFilterLabel, renderSearchButton, renderFilterFold, isFavoriteItem } = require('./main_views');
const { config } = require('../server/SSB_server.js');
const { renderActionCards, rootTypeLabel } = require('./activity_view');

const userId = config.keys.id;

const capFirst = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const typeLabel = (type) => i18n['type' + capFirst(type)] || rootTypeLabel(type) || type;

const trendingFilterLabel = (mode) => mode === 'FAVORITES' ? String(i18n.favoritesTitle).toUpperCase() : RELATION_FILTERS.includes(mode.toLowerCase()) ? relationFilterLabel(mode.toLowerCase()) : String(i18n[mode + 'Button'] || typeLabel(mode)).toUpperCase();

const asCardAction = (item, commentCounts) => ({
  ...item,
  id: item.key,
  type: item.value.content.type,
  author: item.value.author,
  ts: item.value.timestamp,
  content: item.value.content,
  ...(commentCounts instanceof Map ? { commentCount: commentCounts.get(item.key) || 0 } : {})
});

const trendingHref = (scope, kind) => `/trending?${new URLSearchParams([['filter', scope], ...(kind ? [['type', kind]] : [])]).toString()}`;

exports.trendingView = (items, filter, spreadMap = new Map(), q = '', allItems = null, params = {}) => {
  const title = i18n.trendingTitle;

  const baseFilters = ['TOP', 'ALL', 'RECENT', 'MINE', 'SUPPORTED', 'REPLICATED', 'FAVORITES'];
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
  const allTypes = contentFilters.flat();
  const scope = baseFilters.includes(filter) ? filter : 'ALL';
  const kind = allTypes.includes(filter) ? filter : (baseFilters.includes(filter) && allTypes.includes(params.type) ? params.type : null);

  if (scope === 'MINE') {
    filteredItems = filteredItems.filter(item => item.value.author === userId);
  } else if (scope === 'SUPPORTED' || scope === 'REPLICATED') {
    filteredItems = filteredItems.filter(item => scope === 'SUPPORTED' ? item.isSupported : item.isReplicated);
  } else if (scope === 'FAVORITES') {
    filteredItems = filteredItems.filter(item => isFavoriteItem(params.favIndex, item));
  } else if (scope === 'RECENT') {
    const now = Date.now();
    filteredItems = filteredItems.filter(item => now - item.value.timestamp < 24 * 60 * 60 * 1000);
  } else if (scope === 'TOP') {
    filteredItems.sort((a, b) => (b.trendScore || 0) - (a.trendScore || 0) || b.value.timestamp - a.value.timestamp);
  }
  if (kind) {
    filteredItems = filteredItems.filter(item =>
      item.value.content.type === kind ||
      (kind === 'votes' && item.value.content.type === 'poll'));
  }

  if (scope !== 'TOP') {
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
      emptyTrend ? null : renderFilterFold('trending-filters-more',
        [...shownBase, ...allTypes.filter(mode => presentTypes.has(mode) || (mode === 'votes' && presentTypes.has('poll')))]
          .map(mode => ({ value: mode, label: trendingFilterLabel(mode), href: baseFilters.includes(mode) ? trendingHref(mode, kind) : trendingHref(scope, mode === kind ? null : mode) })),
        kind ? [scope, kind] : [scope]),
      emptyTrend ? null : div({ class: 'filters activity-filter-chips activity-toolbar-row' },
        emptyTrend ? null : renderLayoutSwitch('mode-buttons'),
        renderModuleStats(shownItems.length),
        form({ method: 'GET', action: '/trending', class: 'filter-box' },
          input({ type: 'hidden', name: 'filter', value: scope }),
          kind ? input({ type: 'hidden', name: 'type', value: kind }) : null,
          input({ type: 'text', name: 'q', value: q, placeholder: i18n.trendingSearchPlaceholder, class: 'filter-box__input' }),
          div({ class: 'filter-box__controls' },
            renderSearchButton(i18n.searchButton)
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

