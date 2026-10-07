const { form, button, div, h2, p, section, input, label, textarea, br, a, span, select, option } =
  require("../server/node_modules/hyperaxe");
const { renderCommentsSection: renderSharedCommentsSection, renderCommentsLink } = require("./comments_view");

const { clearnetItemHref, template, i18n, renderOpinionsVoting, renderEngagement, userLink, renderSpreadButton, renderEcoTax, renderLifespanChip, renderContentActions, renderSpreadEditWarning, renderModuleStats, moduleIsEmpty, contentDeleteAction } = require("./main_views");
const { renderReachChip, renderClearnetSelector, renderClearnetSwitch, renderTribeOriginChip } = require("./clearnet_view");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");
const { renderStyledText, safeExternalHref } = require("../backend/renderStyledText");

const userId = config.keys.id;

const safeArr = (v) => (Array.isArray(v) ? v : []);
const safeText = (v) => String(v || "").trim();

const buildReturnTo = (filter, params = {}) => {
  const f = safeText(filter || "all");
  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");
  const parts = [`filter=${encodeURIComponent(f)}`];
  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  if (sort) parts.push(`sort=${encodeURIComponent(sort)}`);
  return `/bookmarks?${parts.join("&")}`;
};

const renderBookmarkCommentsSection = (bookmarkId, rootId, comments = [], returnTo = null) => {
  return renderSharedCommentsSection({
    action: `/bookmarks/${encodeURIComponent(bookmarkId)}/comments`,
    comments: comments,
    returnTo: returnTo
  });
};

const renderCardField = (labelText, value) =>
  div(
    { class: "card-field" },
    span({ class: "card-label" }, labelText),
    span({ class: "card-value" }, value)
  );

const renderTags = (tags) => {
  const list = safeArr(tags).map((t) => String(t || "").trim()).filter(Boolean);
  return list.length
    ? div(
        { class: "card-tags" },
        list.map((tag) => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`))
      )
    : null;
};

const renderBookmarkList = (filteredBookmarks, filter, params = {}) => {
  const returnTo = buildReturnTo(filter, params);

  return filteredBookmarks.length
    ? filteredBookmarks.map((bookmark) => {
        const commentCount = typeof bookmark.commentCount === "number" ? bookmark.commentCount : 0;

        const lastVisit = bookmark.lastVisit ? moment(bookmark.lastVisit) : null;
        const lastVisitTxt =
          lastVisit && lastVisit.isValid()
            ? `${lastVisit.format("YYYY/MM/DD HH:mm")} (${lastVisit.fromNow()})`
            : i18n.noLastVisit;

        const urlLink = bookmark.url
          ? a({ href: safeExternalHref(bookmark.url), target: "_blank", rel: "noreferrer noopener", class: "bookmark-url" }, bookmark.url)
          : i18n.noUrl;

        const isOwn = bookmark.author && String(bookmark.author) === String(userId);
        const reachChip = bookmark.tribeOrigin ? renderTribeOriginChip(bookmark.tribeOrigin) : bookmark.clearnet === true ? renderReachChip(true, i18n, clearnetItemHref("bookmarks", bookmark.title || bookmark.url, bookmark.id)) : null;
        return div(
          { class: "trending-card bookmark-card" + (isOwn ? " own-content" : "") },
          div(
            { class: "card-header activity-card-header" },
            span(),
            bookmark.tribeOrigin
              ? renderContentActions(null, bookmark.tribeOrigin.href)
              : renderContentActions(bookmark.id, `/bookmarks/${encodeURIComponent(bookmark.id)}`, { spread: (params.spreadMap && params.spreadMap.get(bookmark.id)) || params.spreads || null, author: bookmark.author, favKind: 'bookmarks', isFavorite: bookmark.isFavorite, reportTitle: bookmark.title, deleteAction: isOwn ? contentDeleteAction('bookmark', bookmark.id) : undefined, returnTo })
          ),
          div(
            { class: "card-section bookmark-card-body" },
            h2({ class: "bookmark-title" }, bookmark.url ? urlLink : (bookmark.title || "")),
            bookmark.lifetime || reachChip ? div({ class: "card-chips-row" }, renderLifespanChip(bookmark.lifetime, i18n), reachChip) : null,
            bookmark.title && bookmark.url ? p({ class: "bookmark-subtitle" }, bookmark.title) : null,
            renderCardField(i18n.bookmarkLastVisitLabel + ":", lastVisitTxt),
            br,
            bookmark.tribeOrigin ? null : renderEngagement(bookmark.id,
              renderOpinionsVoting('/bookmarks/opinions', bookmark.id, bookmark.opinions, returnTo, bookmark.opinions_inhabitants),
              renderCommentsLink({ href: `/bookmarks/${encodeURIComponent(bookmark.id)}`, count: commentCount })
            ),
            (() => {
              const createdTs = bookmark.createdAt ? new Date(bookmark.createdAt).getTime() : NaN;
              const updatedTs = bookmark.updatedAt ? new Date(bookmark.updatedAt).getTime() : NaN;
              const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

              return p(
                { class: "card-footer" },
                span({ class: "date-link" }, `${moment(bookmark.createdAt).format("YYYY/MM/DD HH:mm")}`),
                userLink(bookmark.author),
                showUpdated
                  ? span(
                      { class: "votations-comment-date" },
                      ` | ${i18n.bookmarkUpdatedAt}: ${moment(bookmark.updatedAt).format("YYYY/MM/DD HH:mm")}`
                    )
                  : null
              );
            })()
          )
        );
      })
    : p(params.q ? i18n.bookmarkNoMatch : i18n.noBookmarks);
};

const renderBookmarkForm = (filter, bookmarkId, bookmarkToEdit, tags, params = {}) => {
  const returnFilter = filter === "create" ? "all" : params.filter || "all";
  const returnTo = params.returnTo || buildReturnTo(returnFilter, params);

  const lastVisitValue =
    bookmarkToEdit?.lastVisit && moment(bookmarkToEdit.lastVisit).isValid()
      ? moment(bookmarkToEdit.lastVisit).format("YYYY-MM-DDTHH:mm")
      : "";

  const lastVisitMax = moment().format("YYYY-MM-DDTHH:mm");

  return div(
    { class: "div-center bookmark-form" },
    params.spreadWarning || null,
    form(
      { action: filter === "edit" ? `/bookmarks/update/${encodeURIComponent(bookmarkId)}` : "/bookmarks/create", method: "POST" },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      label(i18n.bookmarkUrlLabel),
      br(),
      input({
        type: "url",
        name: "url",
        id: "url",
        required: true,
        placeholder: i18n.bookmarkUrlPlaceholder,
        value: filter === "edit" ? bookmarkToEdit.url || "" : ""
      }),
      br(),
      br(),
      label(i18n.bookmarkDescriptionLabel),
      br(),
      textarea(
        { name: "description", id: "description", placeholder: i18n.bookmarkDescriptionPlaceholder, rows: "4" },
        filter === "edit" ? bookmarkToEdit.description || "" : ""
      ),
      br(),
      label(i18n.bookmarkLastVisitLabel),
      br(),
      input({
        type: "datetime-local",
        name: "lastVisit",
        max: lastVisitMax,
        value: filter === "edit" ? lastVisitValue : ""
      }),
      br(),
      br(),
      label(i18n.bookmarkTagsLabel),
      br(),
      input({
        type: "text",
        name: "tags",
        id: "tags",
        placeholder: i18n.bookmarkTagsPlaceholder,
        value: filter === "edit" ? safeArr(tags).join(", ") : ""
      }),
      br(),
      br(),
      renderClearnetSelector(filter === "edit" ? !!bookmarkToEdit.clearnet : false, i18n),
      br(),
      button({ type: "submit" }, filter === "edit" ? i18n.bookmarkUpdateButton : i18n.bookmarkCreateButton)
    )
  );
};

const mediaChipFor = (filter, censusM) => (mode) => {
  if (mode === filter) return true;
  if (!Array.isArray(censusM)) return true;
  if (mode === "top") return censusM.some((x) => !x.tribeOrigin);
  if (mode === "mine") return censusM.some((x) => String(x.author) === String(userId));
  if (mode === "recent") return censusM.length > 0;
  if (mode === "favorites") return censusM.some((x) => x.isFavorite);
  if (mode === "bcs") return censusM.some((x) => String(x.title || "").toUpperCase().startsWith("BCS-"));
  return true;
};

exports.bookmarkView = async (bookmarks, filter = "all", bookmarkId = null, params = {}) => {
  const bookmarkEditWarning = filter === "edit" ? await renderSpreadEditWarning(bookmarkId) : null;
  const title = i18n.bookmarkTitle;

  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");

  const list = safeArr(bookmarks);
  const emptyMod = moduleIsEmpty(list, filter, "all", q);
  const mediaChip = mediaChipFor(filter, Array.isArray(params.censusList) ? params.censusList : list);
  const bookmarkToEdit = bookmarkId ? list.find((b) => b.id === bookmarkId) : null;
  const tags = bookmarkToEdit && Array.isArray(bookmarkToEdit.tags) ? bookmarkToEdit.tags : [];

  return template(
    title,
    section(
      div({ class: "tags-header module-header-line" }, h2(title), p(i18n.bookmarkDescription)),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/bookmarks", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          ...(emptyMod ? [] : [
          ...(mediaChip("recent") ? [button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.bookmarkFilterRecent).toUpperCase())] : []),
          ...(mediaChip("mine") ? [button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.bookmarkFilterMine).toUpperCase())] : []),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.bookmarkFilterAll).toUpperCase()),
          ...(mediaChip("favorites") ? [button({ type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" }, String(i18n.bookmarkFilterFavorites).toUpperCase())] : []),
          ...(mediaChip("top") ? [button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, String(i18n.bookmarkFilterTop).toUpperCase())] : []),
          ]),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.bookmarkCreateButton)
        )
      )
    ),
    section(
      filter === "edit" || filter === "create"
        ? renderBookmarkForm(filter, bookmarkId, bookmarkToEdit || {}, tags, { ...params, filter, spreadWarning: bookmarkEditWarning })
        : section(
            emptyMod ? null : div(
              { class: "bookmarks-search activity-filter-chips activity-toolbar-row" },
                renderModuleStats(list.length),
              form(
                { method: "GET", action: "/bookmarks", class: "filter-box" },
                input({ type: "hidden", name: "filter", value: filter }),
                input({ type: "text", name: "q", value: q, placeholder: i18n.bookmarkSearchPlaceholder, class: "filter-box__input" }),
                div(
                  { class: "filter-box__controls" },
                  select(
                    { name: "sort", class: "filter-box__select" },
                    option({ value: "recent", ...(sort === "recent" ? { selected: true } : {})}, i18n.bookmarkSortRecent),
                    option({ value: "oldest", ...(sort === "oldest" ? { selected: true } : {})}, i18n.bookmarkSortOldest),
                    option({ value: "top", ...(sort === "top" ? { selected: true } : {})}, i18n.bookmarkSortTop)
                  ),
                  button({ type: "submit", class: "filter-box__button" }, i18n.bookmarkSearchButton)
                )
              )
            ),
            div({ class: "bookmark-list" }, renderBookmarkList(list, filter, { q, sort, spreadMap: params.spreadMap }))
          )
    )
  );
};

exports.singleBookmarkView = async (bookmark, filter = "all", comments = [], params = {}) => {
  const mediaChip = mediaChipFor(filter, Array.isArray(params.censusList) ? params.censusList : null);
  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");
  const returnTo = params.returnTo || buildReturnTo(filter, { q, sort });

  const isAuthor = String(bookmark.author) === String(userId);
  const hasOpinions = Object.keys(bookmark.opinions || {}).length > 0;
  const isClearnet = !!bookmark.clearnet;

  const lastVisit = bookmark.lastVisit ? moment(bookmark.lastVisit) : null;
  const lastVisitTxt =
    lastVisit && lastVisit.isValid()
      ? `${lastVisit.format("YYYY/MM/DD HH:mm")} (${lastVisit.fromNow()})`
      : i18n.noLastVisit;

  const urlLink = bookmark.url
    ? a({ href: safeExternalHref(bookmark.url), target: "_blank", rel: "noreferrer noopener", class: "bookmark-url" }, bookmark.url)
    : i18n.noUrl;

  const chips = [
    renderLifespanChip(bookmark.lifetime, i18n),
    bookmark.sizeBytes ? renderEcoTax(bookmark.sizeBytes, bookmark.id) : null
  ].filter(Boolean);

  const sideActions = [];
  if (isAuthor && !hasOpinions) {
    sideActions.push(form(
      { method: "GET", action: `/bookmarks/edit/${encodeURIComponent(bookmark.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "update-btn", type: "submit" }, i18n.bookmarkUpdateButton)
    ));
  }

  const tagsNode = renderTags(bookmark.tags);

  const detailActions = div({ class: "card-header activity-card-header" },
    renderContentActions(bookmark.id, `/bookmarks/${encodeURIComponent(bookmark.id)}`, {
      author: bookmark.author,
      favKind: 'bookmarks',
      isFavorite: bookmark.isFavorite,
      spread: params.spreads || null,
      returnTo,
      reportTitle: bookmark.title,
      deleteAction: isAuthor ? contentDeleteAction('bookmark', bookmark.id) : undefined
    })
  );

  const bookmarkSide = div({ class: "tribe-side" },
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, bookmark.url ? urlLink : (bookmark.title || "")),
      renderReachChip(isClearnet, i18n, isClearnet ? clearnetItemHref("bookmarks", bookmark.title || bookmark.url, bookmark.id) : null)
    ),
    isAuthor ? renderClearnetSwitch("bookmarks", bookmark.rootId || bookmark.id, isClearnet) : null,
    bookmark.title && bookmark.url ? p({ class: "bookmark-subtitle" }, bookmark.title) : null,
    chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
    safeText(bookmark.description)
      ? p({ class: "tribe-side-description" }, ...renderStyledText(bookmark.description))
      : null,
    tagsNode,
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null
  );

  const bookmarkMain = div({ class: "tribe-main" },
    detailActions,
    renderCardField(i18n.bookmarkLastVisitLabel + ":", lastVisitTxt),
    (() => {
      const createdTs = bookmark.createdAt ? new Date(bookmark.createdAt).getTime() : NaN;
      const updatedTs = bookmark.updatedAt ? new Date(bookmark.updatedAt).getTime() : NaN;
      const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);
      return p(
        { class: "card-footer" },
        span({ class: "date-link" }, `${moment(bookmark.createdAt).format("YYYY/MM/DD HH:mm")}`),
        userLink(bookmark.author),
        showUpdated
          ? span(
              { class: "votations-comment-date" },
              ` | ${i18n.bookmarkUpdatedAt}: ${moment(bookmark.updatedAt).format("YYYY/MM/DD HH:mm")}`
            )
          : null
      );
    })(),
    renderEngagement(bookmark.id,
      renderOpinionsVoting('/bookmarks/opinions', bookmark.id, bookmark.opinions, returnTo, bookmark.opinions_inhabitants),
      renderBookmarkCommentsSection(bookmark.id, bookmark.rootId, comments, returnTo)
    )
  );

  return template(
    i18n.bookmarkTitle,
    section(
      div({ class: "tags-header module-header-line" },
        h2(i18n.bookmarkAllSectionTitle || i18n.bookmarkTitle),
        p(i18n.bookmarkDescription)
      ),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/bookmarks", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          ...(mediaChip("recent") ? [button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.bookmarkFilterRecent).toUpperCase())] : []),
          ...(mediaChip("mine") ? [button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.bookmarkFilterMine).toUpperCase())] : []),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.bookmarkFilterAll).toUpperCase()),
          ...(mediaChip("favorites") ? [button({ type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" }, String(i18n.bookmarkFilterFavorites).toUpperCase())] : []),
          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, String(i18n.bookmarkFilterTop).toUpperCase()),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.bookmarkCreateButton)
        )
      ),
      div({ class: "tribe-details" }, bookmarkSide, bookmarkMain)
    )
  );
};

