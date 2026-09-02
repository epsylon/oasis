const { form, button, div, h2, p, section, input, label, textarea, br, a, span, select, option } =
  require("../server/node_modules/hyperaxe");
const { renderCommentsSection: renderSharedCommentsSection, renderCommentsLink } = require("./comments_view");

const { template, i18n, renderOpinionsVoting, renderEngagement, userLink, renderSpreadButton, renderEcoTax, renderLifespanChip, renderContentActions, renderSpreadEditWarning } = require("./main_views");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");
const { renderUrl } = require("../backend/renderUrl");

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

const renderBookmarkActions = (filter, bookmark, params = {}) => {
  const returnTo = buildReturnTo(filter, params);
  const isAuthor = String(bookmark.author) === String(userId);
  const hasOpinions = Object.keys(bookmark.opinions || {}).length > 0;

  return isAuthor
    ? div(
        { class: "bookmark-actions" },
        !hasOpinions
          ? form(
              { method: "GET", action: `/bookmarks/edit/${encodeURIComponent(bookmark.id)}` },
              input({ type: "hidden", name: "returnTo", value: returnTo }),
              button({ class: "update-btn", type: "submit" }, i18n.bookmarkUpdateButton)
            )
          : null,
        form(
          { method: "POST", action: `/bookmarks/delete/${encodeURIComponent(bookmark.id)}` },
          input({ type: "hidden", name: "returnTo", value: returnTo }),
          button({ class: "delete-btn", type: "submit" }, i18n.bookmarkDeleteButton)
        )
      )
    : null;
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
          ? a({ href: bookmark.url, target: "_blank", rel: "noreferrer noopener", class: "bookmark-url" }, bookmark.url)
          : i18n.noUrl;

        const isOwn = bookmark.author && String(bookmark.author) === String(userId);
        return div(
          { class: "trending-card bookmark-card" + (isOwn ? " own-content" : "") },
          div(
            { class: "card-header activity-card-header" },
            span(),
            renderContentActions(bookmark.id, `/bookmarks/${encodeURIComponent(bookmark.id)}`, { spread: (params.spreadMap && params.spreadMap.get(bookmark.id)) || params.spreads || null, author: bookmark.author, favKind: 'bookmarks', isFavorite: bookmark.isFavorite, reportTitle: bookmark.title })
          ),
          div(
            { class: "card-section bookmark-card-body" },
            h2({ class: "bookmark-title" }, bookmark.url ? urlLink : (bookmark.title || "")),
            bookmark.lifetime ? div({ class: "card-chips-row" }, renderLifespanChip(bookmark.lifetime, i18n)) : null,
            bookmark.title && bookmark.url ? p({ class: "bookmark-subtitle" }, bookmark.title) : null,
            renderCardField(i18n.bookmarkLastVisitLabel + ":", lastVisitTxt),
            br,
            renderEngagement(bookmark.id,
              renderOpinionsVoting('/bookmarks/opinions', bookmark.id, bookmark.opinions, returnTo, bookmark.opinions_inhabitants),
              renderCommentsLink({ href: `/bookmarks/${encodeURIComponent(bookmark.id)}`, count: commentCount })
            ),
            (() => {
              const createdTs = bookmark.createdAt ? new Date(bookmark.createdAt).getTime() : NaN;
              const updatedTs = bookmark.updatedAt ? new Date(bookmark.updatedAt).getTime() : NaN;
              const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

              return p(
                { class: "card-footer" },
                span({ class: "date-link" }, `${moment(bookmark.createdAt).format("YYYY/MM/DD HH:mm")} ${i18n.performed} `),
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
      button({ type: "submit" }, filter === "edit" ? i18n.bookmarkUpdateButton : i18n.bookmarkCreateButton)
    )
  );
};

exports.bookmarkView = async (bookmarks, filter = "all", bookmarkId = null, params = {}) => {
  const bookmarkEditWarning = filter === "edit" ? await renderSpreadEditWarning(bookmarkId) : null;
  const title = i18n.bookmarkTitle;

  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");

  const list = safeArr(bookmarks);
  const bookmarkToEdit = bookmarkId ? list.find((b) => b.id === bookmarkId) : null;
  const tags = bookmarkToEdit && Array.isArray(bookmarkToEdit.tags) ? bookmarkToEdit.tags : [];

  return template(
    title,
    section(
      div({ class: "tags-header module-header-line" }, h2(title), p(i18n.bookmarkDescription),
        (() => {
          const { renderReachChip } = require('./clearnet_view');
          const isClearnet = !!(params.viewerPrefs && params.viewerPrefs.clearnetBookmarks);
          return renderReachChip(isClearnet, i18n);
        })()
      ),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/bookmarks", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.bookmarkFilterAll).toUpperCase()),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.bookmarkFilterMine).toUpperCase()),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.bookmarkFilterRecent).toUpperCase()),
          button({ type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" }, String(i18n.bookmarkFilterFavorites).toUpperCase()),
          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, String(i18n.bookmarkFilterTop).toUpperCase()),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.bookmarkCreateButton)
        )
      )
    ),
    section(
      filter === "edit" || filter === "create"
        ? renderBookmarkForm(filter, bookmarkId, bookmarkToEdit || {}, tags, { ...params, filter, spreadWarning: bookmarkEditWarning })
        : section(
            div(
              { class: "bookmarks-search activity-filter-chips activity-toolbar-row" },
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
            div({ class: "bookmark-list" }, renderBookmarkList(list, filter, { q, sort }))
          )
    )
  );
};

exports.singleBookmarkView = async (bookmark, filter = "all", comments = [], params = {}) => {
  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");
  const returnTo = params.returnTo || buildReturnTo(filter, { q, sort });

  const isAuthor = String(bookmark.author) === String(userId);
  const hasOpinions = Object.keys(bookmark.opinions || {}).length > 0;
  const { renderReachChip } = require('./clearnet_view');
  const isClearnet = !!(params.authorPrefs && params.authorPrefs.clearnetBookmarks);

  const lastVisit = bookmark.lastVisit ? moment(bookmark.lastVisit) : null;
  const lastVisitTxt =
    lastVisit && lastVisit.isValid()
      ? `${lastVisit.format("YYYY/MM/DD HH:mm")} (${lastVisit.fromNow()})`
      : i18n.noLastVisit;

  const urlLink = bookmark.url
    ? a({ href: bookmark.url, target: "_blank", rel: "noreferrer noopener", class: "bookmark-url" }, bookmark.url)
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
  if (isAuthor) {
    sideActions.push(form(
      { method: "POST", action: `/bookmarks/delete/${encodeURIComponent(bookmark.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "delete-btn", type: "submit" }, i18n.bookmarkDeleteButton)
    ));
  }

  const tagsNode = renderTags(bookmark.tags);

  const detailActions = div({ class: "card-header activity-card-header" },
    renderContentActions(bookmark.id, null, {
      author: bookmark.author,
      favKind: 'bookmarks',
      isFavorite: bookmark.isFavorite,
      spread: params.spreads || null,
      returnTo,
      reportTitle: bookmark.title
    })
  );

  const bookmarkSide = div({ class: "tribe-side" },
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, bookmark.url ? urlLink : (bookmark.title || "")),
      renderReachChip(isClearnet, i18n)
    ),
    bookmark.title && bookmark.url ? p({ class: "bookmark-subtitle" }, bookmark.title) : null,
    chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
    safeText(bookmark.description)
      ? p({ class: "tribe-side-description" }, ...renderUrl(bookmark.description))
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
        span({ class: "date-link" }, `${moment(bookmark.createdAt).format("YYYY/MM/DD HH:mm")} ${i18n.performed} `),
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
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.bookmarkFilterAll).toUpperCase()),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.bookmarkFilterMine).toUpperCase()),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.bookmarkFilterRecent).toUpperCase()),
          button({ type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" }, String(i18n.bookmarkFilterFavorites).toUpperCase()),
          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, String(i18n.bookmarkFilterTop).toUpperCase()),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.bookmarkCreateButton)
        )
      ),
      div({ class: "tribe-details" }, bookmarkSide, bookmarkMain)
    )
  );
};

