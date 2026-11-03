const { div, h2, p, section, form, input } = require("../server/node_modules/hyperaxe");
const { template, i18n, renderLayoutSwitch, renderModuleStats, paged, hasRelation, RELATION_FILTERS, relationFilterLabel, renderSearchButton, renderFilterFold, isFavoriteItem } = require('./main_views');
const { config } = require('../server/SSB_server.js');
const opinionCategories = require('../backend/opinion_categories');
const { renderActionCards } = require('./activity_view');

const opinionFilterLabel = (mode) => mode === 'FAVORITES' ? String(i18n.favoritesTitle).toUpperCase() : RELATION_FILTERS.includes(mode.toLowerCase()) ? relationFilterLabel(mode.toLowerCase()) :
  String(i18n[mode + 'Button'] || i18n['vote' + mode.charAt(0).toUpperCase() + mode.slice(1)] || mode).toUpperCase();

const OPINION_SCOPES = ['TOP', 'ALL', 'RECENT', 'MINE', 'SUPPORTED', 'REPLICATED', 'FAVORITES'];
const opinionsHref = (scope, category) => `/opinions?${new URLSearchParams([['filter', scope], ...(category ? [['category', category]] : [])]).toString()}`;

exports.opinionsView = (items, filter, spreadMap = new Map(), q = '', allItems = null, params = {}) => {
  const allCats = [...opinionCategories.positive, ...opinionCategories.constructive, ...opinionCategories.moderation];
  const scope = OPINION_SCOPES.includes(filter) ? filter : 'ALL';
  const category = allCats.includes(filter) ? filter : (OPINION_SCOPES.includes(filter) && allCats.includes(params.category) ? params.category : null);
  const presentCats = new Set();
  for (const it of (Array.isArray(allItems) ? allItems : items)) {
    const ops = (it.value?.content || {}).opinions || {};
    for (const [cat, n] of Object.entries(ops)) if (Number(n) > 0) presentCats.add(cat);
  }
  items = items
    .filter(item => {
      const c = item.value?.content || item.content;
      return c && typeof c === 'object' && c.type !== 'tombstone'
        && (scope !== 'FAVORITES' || isFavoriteItem(params.favIndex, item))
        && (!category || Number((c.opinions || {})[category]) > 0);
    })
    .sort((a, b) => {
      if (scope === 'TOP') {
        const aVotes = (a.value.content.opinions_inhabitants || []).length;
        const bVotes = (b.value.content.opinions_inhabitants || []).length;
        return bVotes !== aVotes ? bVotes - aVotes : b.value.timestamp - a.value.timestamp;
      }
      return b.value.timestamp - a.value.timestamp;
    });

  const title = i18n.opinionsTitle;
  const emptyOps = (Array.isArray(allItems) ? allItems : items).length === 0 && !String(q || '').trim();
  const baseFilters = OPINION_SCOPES.filter(mode => !RELATION_FILTERS.includes(mode.toLowerCase()) || mode === filter || hasRelation(mode.toLowerCase(), Array.isArray(allItems) ? allItems : items));

  const seenDocs = new Set();
  const shownItems = items.filter(item => {
    const c = item.value.content || {};
    const t = c.type === 'document' ? String(c.title || '').trim() : '';
    if (!t) return true;
    if (seenDocs.has(t)) return false;
    seenDocs.add(t);
    return true;
  });
  const pageItems = paged(shownItems);
  const rendered = pageItems.length
    ? renderActionCards(pageItems.map(item => ({
        ...item,
        id: item.key,
        type: item.value.content.type,
        author: item.value.author,
        ts: item.value.timestamp,
        content: item.value.content,
        ...(params.commentCounts instanceof Map ? { commentCount: params.commentCounts.get(item.key) || 0 } : {})
      })), config.keys.id, null, spreadMap, { ordered: true, favIndex: params.favIndex, opinionRoute: (id) => `/opinions/${encodeURIComponent(id)}` })
    : [];
  const cards = Array.isArray(rendered) ? rendered : [];

  const header = div({ class: 'tags-header module-header-line' },
    h2(title),
    p(i18n.shareYourOpinions)
  );

  const html = template(
    title,
    section(
      header,
      emptyOps ? null : renderFilterFold('opinions-filters-more',
        [...baseFilters, ...allCats.filter(mode => presentCats.has(mode))]
          .map(mode => ({ value: mode, label: opinionFilterLabel(mode), href: OPINION_SCOPES.includes(mode) ? opinionsHref(mode, category) : opinionsHref(scope, mode === category ? null : mode) })),
        category ? [scope, category] : [scope]),
      emptyOps ? null : div({ class: 'filters activity-filter-chips activity-toolbar-row' },
        emptyOps ? null : renderLayoutSwitch('mode-buttons'),
        renderModuleStats(shownItems.length),
        form({ method: 'GET', action: '/opinions', class: 'filter-box' },
          input({ type: 'hidden', name: 'filter', value: scope }),
          category ? input({ type: 'hidden', name: 'category', value: category }) : null,
          input({ type: 'text', name: 'q', value: q, placeholder: i18n.opinionsSearchPlaceholder, class: 'filter-box__input' }),
          div({ class: 'filter-box__controls' },
            renderSearchButton(i18n.searchButton)
          )
        )
      ),
      section(
        cards.length
          ? div({ class: 'opinions-container' }, ...cards)
          : div({ class: 'no-results' }, p(i18n.noOpinionsFound))
      )
    )
  );

  return html;
};

