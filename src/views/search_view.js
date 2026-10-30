const { form, button, div, h2, p, section, input, label, select, option, table, td, tr } = require("../server/node_modules/hyperaxe");
const { template, i18n, renderModuleStats, paged, currentPerPage, LIST_PAGE_SIZES, pageSizeLabel } = require('./main_views');
const { config } = require("../server/SSB_server.js");
const userId = config.keys.id;

const SEARCH_SCOPES = ["", "mine", "supported", "replicated"];
const searchScopeLabel = (scope) => String(scope === "mine" ? i18n.searchScopeMine : scope === "supported" ? i18n.searchScopeSupported : scope === "replicated" ? i18n.searchScopeReplicated : i18n.allButton).toUpperCase();

const renderSearchForm = ({ action, query = "", queryName = "query", hidden = [], withScope = false, scope = "" } = {}) => {
  const searchInput = input({ id: "search_query", name: queryName, required: false, type: "search", value: query, placeholder: i18n.searchPlaceholder });
  searchInput.setAttribute("minlength", 3);
  const resultCount = currentPerPage();
  const resultsPerPageSelect = select(
    { id: "results-per-page", name: "perPage", class: "input-select search-select" },
    LIST_PAGE_SIZES.map(s => option({ value: s, selected: resultCount === s ? "selected" : undefined }, pageSizeLabel(s)))
  );
  return form(
    { action, method: "GET", class: "search-form" },
    ...hidden.map(([name, value]) => input({ type: "hidden", name, value })),
    div({ class: "search-filters-row" },
      table({ class: "search-filters-table" },
        tr(
          td({ class: 'card-label' }, label({ for: "search_from" }, i18n.searchFromLabel || "From")),
          td(input({ id: "search_from", type: "datetime-local", name: "from" }))
        ),
        tr(
          td({ class: 'card-label' }, label({ for: "search_to" }, i18n.searchToLabel || "To")),
          td(input({ id: "search_to", type: "datetime-local", name: "to" }))
        ),
        tr(
          td({ class: 'card-label' }, label({ for: "search_inhabitant" }, "Oasis ID")),
          td(input({ id: "search_inhabitant", type: "text", name: "inhabitant", placeholder: "@...=.ed25519", pattern: "@[A-Za-z0-9+/_\\-]{43}=\\.ed25519", maxlength: 56, class: "search-oasis-id" }))
        )
      ),
      table({ class: "search-filters-table" },
        tr(
          td({ class: 'card-label' }, label({ for: "search_query" }, i18n.searchQueryLabel || "Query")),
          td(searchInput)
        ),
        withScope ? tr(
          td({ class: 'card-label' }, label({ for: "search_scope" }, i18n.searchScopeLabel)),
          td(select({ id: "search_scope", name: "scope", class: "input-select search-select" },
            SEARCH_SCOPES.map(sc => option({ value: sc, ...(String(scope || "") === sc ? { selected: true } : {}) }, searchScopeLabel(sc)))
          ))
        ) : null,
        tr(
          td({ class: 'card-label' }, label({ for: "results-per-page" }, i18n.searchPerPageLabel || "Results per page")),
          td(resultsPerPageSelect)
        )
      )
    ),
    div({ class: "search-submit-row" },
      button({ type: "submit" }, i18n.searchSubmit)
    )
  );
};
exports.renderSearchForm = renderSearchForm;

const searchView = ({ messages = [], blobs = {}, query = "", type = "", types = [], hashtag = null, results = {}, resultCounts = null, spreadMap = null, favIndex = null, scope = "" }) => {

  const { renderActionCards, rootTypeLabel } = require('./activity_view');
  const typeLabel = (type) => String((type === 'comment' ? i18n.typeComment : i18n['type' + String(type || '').charAt(0).toUpperCase() + String(type || '').slice(1)] || rootTypeLabel(type)) || type || '').toUpperCase();
  const asAction = (msg) => ({
    ...msg,
    id: msg.key,
    type: msg.value.content.type,
    author: msg.value.author,
    ts: msg.value.timestamp,
    content: msg.value.content
  });
  const allActions = Object.values(results).flat().filter(msg => msg && msg.value && msg.value.content).map(asAction);
  const counts = resultCounts && typeof resultCounts === 'object'
    ? resultCounts
    : Object.fromEntries(Object.entries(results).map(([t, msgs]) => [t, Array.isArray(msgs) ? msgs.length : 0]));
  const totalResults = Object.values(counts).reduce((n, c) => n + (Number(c) || 0), 0);
  const searchBase = `/search?query=${encodeURIComponent(hashtag ? `#${hashtag}` : String(query || ''))}${scope ? `&scope=${encodeURIComponent(scope)}` : ''}`;
  const resultStats = renderModuleStats(totalResults,
    Object.entries(counts)
      .map(([t, count]) => ({ label: typeLabel(t), count: Number(count) || 0, href: `${searchBase}&type=${encodeURIComponent(t)}`, active: types.includes(t) }))
      .sort((x, y) => y.count - x.count || x.label.localeCompare(y.label)),
    null,
    { totalHref: searchBase, totalActive: types.length === 0 });
  const pageGroups = paged(Object.entries(results).flatMap(([key, msgs]) => msgs.map((msg) => [key, msg])))
    .reduce((acc, [key, msg]) => { (acc[key] = acc[key] || []).push(msg); return acc; }, {});
  const resultSection = Object.entries(results).length > 0
    ? Object.entries(pageGroups).map(([key, msgs]) =>
      div(
        { class: "search-result-group" },
        h2({ class: "job-section-title search-group-title" }, typeLabel(String((msgs[0] && msgs[0].value && msgs[0].value.content && msgs[0].value.content.type) || key || ''))),
        ...(() => {
          const cards = renderActionCards(msgs.map(asAction), userId, allActions, spreadMap instanceof Map ? spreadMap : new Map(), { ordered: true, favIndex, returnTo: `${searchBase}${types.length ? `&type=${encodeURIComponent(types[0])}` : ''}` });
          return Array.isArray(cards) ? cards : [cards];
        })()
      )
    )
    : (String(query || '').trim() || hashtag
        ? div({ class: 'no-results' }, p(i18n.noResultsFound))
        : null);

  let html = template(
    i18n.searchTitle,
    section(
      div({ class: "tags-header module-header-line" },
        h2(i18n.searchTitle),
        p(hashtag ? i18n.hashtagDescription : i18n.searchDescriptionLabel)
      ),
      renderSearchForm({ action: "/search", query, withScope: true, scope })
    ),
    section(
      resultStats ? div({ class: 'filters activity-filter-chips activity-toolbar-row search-stats-row' }, resultStats) : null,
      resultSection
    )
  );

  return html;
};

exports.searchView = searchView;

