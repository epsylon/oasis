const { div, h2, p, section, button, form, input } = require("../server/node_modules/hyperaxe");
const { template, i18n, renderModuleStats, paged, hasRelation, RELATION_FILTERS, relationFilterLabel } = require('./main_views');
const { config } = require('../server/SSB_server.js');
const opinionCategories = require('../backend/opinion_categories');
const { renderActionCards } = require('./activity_view');

const opinionFilterLabel = (mode) => RELATION_FILTERS.includes(mode.toLowerCase()) ? relationFilterLabel(mode.toLowerCase()) :
  String(i18n[mode + 'Button'] || i18n['vote' + mode.charAt(0).toUpperCase() + mode.slice(1)] || mode).toUpperCase();

exports.opinionsView = (items, filter, spreadMap = new Map(), q = '', allItems = null, params = {}) => {
  const presentCats = new Set();
  for (const it of (Array.isArray(allItems) ? allItems : items)) {
    const ops = (it.value?.content || {}).opinions || {};
    for (const [cat, n] of Object.entries(ops)) if (Number(n) > 0) presentCats.add(cat);
  }
  items = items
    .filter(item => {
      const c = item.value?.content || item.content;
      return c && typeof c === 'object' && c.type !== 'tombstone';
    })
    .sort((a, b) => {
      if (filter === 'TOP') {
        const aVotes = (a.value.content.opinions_inhabitants || []).length;
        const bVotes = (b.value.content.opinions_inhabitants || []).length;
        return bVotes !== aVotes ? bVotes - aVotes : b.value.timestamp - a.value.timestamp;
      }
      return b.value.timestamp - a.value.timestamp;
    });

  const title = i18n.opinionsTitle;
  const emptyOps = (Array.isArray(allItems) ? allItems : items).length === 0 && !String(q || '').trim();
  const baseFilters = ['TOP', 'ALL', 'RECENT', 'MINE', 'SUPPORTED', 'REPLICATED'].filter(mode => !RELATION_FILTERS.includes(mode.toLowerCase()) || mode === filter || hasRelation(mode.toLowerCase(), Array.isArray(allItems) ? allItems : items));

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
      emptyOps ? null : div({ class: 'mode-buttons' },
        div({ class: 'column' },
          baseFilters.map(mode =>
            form({ method: 'GET', action: '/opinions' },
              input({ type: 'hidden', name: 'filter', value: mode }),
              button({ type: 'submit', class: filter === mode ? 'filter-btn active' : 'filter-btn' }, opinionFilterLabel(mode))
            )
          )
        ),
        div({ class: 'column' },
          opinionCategories.positive.slice(0, 5).filter(mode => presentCats.has(mode)).map(mode =>
            form({ method: 'GET', action: '/opinions' },
              input({ type: 'hidden', name: 'filter', value: mode }),
              button({ type: 'submit', class: filter === mode ? 'filter-btn active' : 'filter-btn' }, opinionFilterLabel(mode))
            )
          )
        ),
        div({ class: 'column' },
          opinionCategories.positive.slice(5, 10).filter(mode => presentCats.has(mode)).map(mode =>
            form({ method: 'GET', action: '/opinions' },
              input({ type: 'hidden', name: 'filter', value: mode }),
              button({ type: 'submit', class: filter === mode ? 'filter-btn active' : 'filter-btn' }, opinionFilterLabel(mode))
            )
          )
        ),
        div({ class: 'column' },
          opinionCategories.positive.slice(10, 15).filter(mode => presentCats.has(mode)).map(mode =>
            form({ method: 'GET', action: '/opinions' },
              input({ type: 'hidden', name: 'filter', value: mode }),
              button({ type: 'submit', class: filter === mode ? 'filter-btn active' : 'filter-btn' }, opinionFilterLabel(mode))
            )
          )
        )
      ,
        div({ class: 'column' },
          opinionCategories.constructive.slice(0, 5).filter(mode => presentCats.has(mode)).map(mode =>
            form({ method: 'GET', action: '/opinions' },
              input({ type: 'hidden', name: 'filter', value: mode }),
              button({ type: 'submit', class: filter === mode ? 'filter-btn active' : 'filter-btn' }, opinionFilterLabel(mode))
            )
          )
        ),
        div({ class: 'column' },
          opinionCategories.constructive.slice(5, 11).filter(mode => presentCats.has(mode)).map(mode =>
            form({ method: 'GET', action: '/opinions' },
              input({ type: 'hidden', name: 'filter', value: mode }),
              button({ type: 'submit', class: filter === mode ? 'filter-btn active' : 'filter-btn' }, opinionFilterLabel(mode))
            )
          )
        ),
        div({ class: 'column' },
          opinionCategories.moderation.slice(0, 5).filter(mode => presentCats.has(mode)).map(mode =>
            form({ method: 'GET', action: '/opinions' },
              input({ type: 'hidden', name: 'filter', value: mode }),
              button({ type: 'submit', class: filter === mode ? 'filter-btn active' : 'filter-btn' }, opinionFilterLabel(mode))
            )
          )
        ),
        div({ class: 'column' },
          opinionCategories.moderation.slice(5, 10).filter(mode => presentCats.has(mode)).map(mode =>
            form({ method: 'GET', action: '/opinions' },
              input({ type: 'hidden', name: 'filter', value: mode }),
              button({ type: 'submit', class: filter === mode ? 'filter-btn active' : 'filter-btn' }, opinionFilterLabel(mode))
            )
          )
        )
      ),
      emptyOps ? null : div({ class: 'filters activity-filter-chips activity-toolbar-row' },
        renderModuleStats(shownItems.length),
        form({ method: 'GET', action: '/opinions', class: 'filter-box' },
          input({ type: 'hidden', name: 'filter', value: filter }),
          input({ type: 'text', name: 'q', value: q, placeholder: i18n.opinionsSearchPlaceholder, class: 'filter-box__input' }),
          div({ class: 'filter-box__controls' },
            button({ type: 'submit', class: 'filter-box__button' }, i18n.searchButton)
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

