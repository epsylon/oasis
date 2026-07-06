const { form, button, div, h2, p, section, input, label, textarea, br, a, span, select, option } =
  require("../server/node_modules/hyperaxe");

const { template, i18n, renderOpinionsVoting, userLink, renderSpreadButton, renderEcoTax, renderLifespanChip, renderContentActions } = require("./main_views");
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

const renderPMButton = (recipient, className = "filter-btn") => {
  const r = safeText(recipient);
  if (!r) return null;
  if (String(r) === String(userId)) return null;

  return form(
    { method: "GET", action: "/pm" },
    input({ type: "hidden", name: "recipients", value: r }),
    button({ type: "submit", class: className }, i18n.privateMessage)
  );
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
  const list = safeArr(comments).filter(c => {
    const t = c && c.value && c.value.content && c.value.content.text;
    return t && String(t).trim();
  });
  const commentsCount = list.length;

  return div(
    { class: "vote-comments-section" },
    div(
      { class: "comments-count" },
      span({ class: "card-label" }, i18n.voteCommentsLabel + ": "),
      span({ class: "card-value" }, String(commentsCount))
    ),
    div(
      { class: "comment-form-wrapper" },
      h2({ class: "comment-form-title" }, i18n.voteNewCommentLabel),
      form(
        { method: "POST", action: `/bookmarks/${encodeURIComponent(bookmarkId)}/comments`, class: "comment-form", enctype: "multipart/form-data" },
        returnTo ? input({ type: "hidden", name: "returnTo", value: returnTo }) : null,
        rootId ? input({ type: "hidden", name: "rootId", value: rootId }) : null,
        textarea({
          id: "comment-text",
          name: "text",
          rows: 4,
          class: "comment-textarea",
          placeholder: i18n.voteNewCommentPlaceholder
        }),
        div({ class: "comment-file-upload" }, label(i18n.uploadMedia), input({ type: "file", name: "blob" })),
        br(),
        button({ type: "submit", class: "comment-submit-btn" }, i18n.voteNewCommentButton)
      )
    ),
    list.length
      ? div(
          { class: "comments-list" },
          list.map((c) => {
            const author = c?.value?.author || "";
            const ts = c?.value?.timestamp || c?.timestamp;
            const absDate = ts ? moment(ts).format("YYYY/MM/DD HH:mm:ss") : "";
            const relDate = ts ? moment(ts).fromNow() : "";

            const content = c?.value?.content || {};
            const text = content.text || "";
            const threadRoot = content.fork || content.root || null;

            return div(
              { class: "votations-comment-card" },
              span(
                { class: "created-at" },
                span(i18n.createdBy),
                author ? userLink(author) : span("(unknown)"),
                absDate ? span(" | ") : "",
                absDate ? span({ class: "votations-comment-date" }, absDate) : "",
                relDate ? span({ class: "votations-comment-date" }, " | ", i18n.sendTime) : "",
                relDate && threadRoot
                  ? a({ href: `/thread/${encodeURIComponent(threadRoot)}#${encodeURIComponent(c.key)}` }, relDate)
                  : ""
              ),
              p({ class: "votations-comment-text" }, ...renderUrl(text))
            );
          })
        )
      : p({ class: "votations-no-comments" }, i18n.voteNoCommentsYet)
  );
};

const renderCardField = (labelText, value) =>
  div(
    { class: "card-field" },
    span({ class: "card-label" }, labelText),
    span({ class: "card-value" }, value)
  );

const renderFavoriteToggle = (bookmark, returnTo) =>
  form(
    {
      method: "POST",
      action: bookmark.isFavorite
        ? `/bookmarks/favorites/remove/${encodeURIComponent(bookmark.id)}`
        : `/bookmarks/favorites/add/${encodeURIComponent(bookmark.id)}`,
      class: "bookmark-favorite-form"
    },
    returnTo ? input({ type: "hidden", name: "returnTo", value: returnTo }) : null,
    button(
      { type: "submit", class: "filter-btn" },
      bookmark.isFavorite ? i18n.bookmarkRemoveFavoriteButton : i18n.bookmarkAddFavoriteButton
    )
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
            ? `${lastVisit.format("YYYY/MM/DD HH:mm:ss")} (${lastVisit.fromNow()})`
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
            renderContentActions(bookmark.id, `/bookmarks/${encodeURIComponent(bookmark.id)}`)
          ),
          div(
            { class: "card-section bookmark-card-body" },
            div(
              { class: "bookmark-topbar" },
              div(
                { class: "bookmark-topbar-left" },
                renderPMButton(bookmark.author),
                renderFavoriteToggle(bookmark, returnTo)
              ),
              div(
                { class: "bookmark-topbar-right" },
                renderBookmarkActions(filter, bookmark, params)
              )
            ),
            h2({ class: "bookmark-title" }, bookmark.category || bookmark.url || ""),
            bookmark.lifetime ? div({ class: "card-chips-row" }, renderLifespanChip(bookmark.lifetime, i18n)) : null,
            renderCardField(i18n.bookmarkUrlLabel + ":", urlLink),
            renderCardField(i18n.bookmarkLastVisitLabel + ":", lastVisitTxt),
            br,
            div(
              { class: "card-comments-summary" },
              span({ class: "card-label" }, i18n.voteCommentsLabel + ":"),
              span({ class: "card-value" }, String(commentCount)),
              br(),
              br(),
              form(
                { method: "GET", action: `/bookmarks/${encodeURIComponent(bookmark.id)}` },
                input({ type: "hidden", name: "returnTo", value: returnTo }),
                input({ type: "hidden", name: "filter", value: filter || "all" }),
                params.q ? input({ type: "hidden", name: "q", value: params.q }) : null,
                params.sort ? input({ type: "hidden", name: "sort", value: params.sort }) : null,
                button({ type: "submit", class: "filter-btn" }, i18n.voteCommentsForumButton)
              )
            ),
                        div(
              { class: "card-comments-summary feed-opinions-section" },
              div(
                { class: "comments-count" },
                span({ class: "card-label" }, (i18n.opinionsTitle || "Opinions") + ": "),
                span({ class: "card-value" }, String(Object.values(bookmark.opinions || {}).reduce((s, n) => s + (Number(n) || 0), 0)))
              ),
              renderOpinionsVoting('/bookmarks/opinions', bookmark.id, bookmark.opinions, returnTo, bookmark.opinions_inhabitants)
            ),
            div({ class: "card-spread-left" }, renderSpreadButton(bookmark.id, (params.spreadMap && params.spreadMap.get(bookmark.id)) || params.spreads)),
            (() => {
              const createdTs = bookmark.createdAt ? new Date(bookmark.createdAt).getTime() : NaN;
              const updatedTs = bookmark.updatedAt ? new Date(bookmark.updatedAt).getTime() : NaN;
              const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

              return p(
                { class: "card-footer" },
                span({ class: "date-link" }, `${moment(bookmark.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
                userLink(bookmark.author),
                showUpdated
                  ? span(
                      { class: "votations-comment-date" },
                      ` | ${i18n.bookmarkUpdatedAt}: ${moment(bookmark.updatedAt).format("YYYY/MM/DD HH:mm:ss")}`
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
      label(i18n.bookmarkCategoryLabel),
      br(),
      input({
        type: "text",
        name: "category",
        id: "category",
        placeholder: i18n.bookmarkCategoryPlaceholder,
        value: filter === "edit" ? bookmarkToEdit.category || "" : ""
      }),
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
  const title =
    filter === "mine"
      ? i18n.bookmarkMineSectionTitle
      : filter === "create"
        ? i18n.bookmarkCreateSectionTitle
        : filter === "edit"
          ? i18n.bookmarkUpdateSectionTitle
          : filter === "recent"
            ? i18n.bookmarkRecentSectionTitle
            : filter === "top"
              ? i18n.bookmarkTopSectionTitle
              : filter === "favorites"
                ? i18n.bookmarkFavoritesSectionTitle
                : i18n.bookmarkAllSectionTitle;

  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");

  const list = safeArr(bookmarks);
  const bookmarkToEdit = bookmarkId ? list.find((b) => b.id === bookmarkId) : null;
  const tags = bookmarkToEdit && Array.isArray(bookmarkToEdit.tags) ? bookmarkToEdit.tags : [];

  return template(
    title,
    section(
      div({ class: "tags-header" }, h2(title), p(i18n.bookmarkDescription)),
      (() => {
        const { renderReachChip } = require('./clearnet_view');
        const isClearnet = !!(params.viewerPrefs && params.viewerPrefs.clearnetBookmarks);
        return div({ class: "shop-title-row" }, renderReachChip(isClearnet, i18n));
      })(),
      br(),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/bookmarks", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, i18n.bookmarkFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.bookmarkFilterMine),
          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, i18n.bookmarkFilterTop),
          button({ type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" }, i18n.bookmarkFilterFavorites),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, i18n.bookmarkFilterRecent),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.bookmarkCreateButton)
        )
      )
    ),
    section(
      filter === "edit" || filter === "create"
        ? renderBookmarkForm(filter, bookmarkId, bookmarkToEdit || {}, tags, { ...params, filter })
        : section(
            div(
              { class: "bookmarks-search" },
              form(
                { method: "GET", action: "/bookmarks", class: "filter-box" },
                input({ type: "hidden", name: "filter", value: filter }),
                input({ type: "text", name: "q", value: q, placeholder: i18n.bookmarkSearchPlaceholder, class: "filter-box__input" }),
                div(
                  { class: "filter-box__controls" },
                  select(
                    { name: "sort", class: "filter-box__select" },
                    option({ value: "recent", selected: sort === "recent" }, i18n.bookmarkSortRecent),
                    option({ value: "oldest", selected: sort === "oldest" }, i18n.bookmarkSortOldest),
                    option({ value: "top", selected: sort === "top" }, i18n.bookmarkSortTop)
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
      ? `${lastVisit.format("YYYY/MM/DD HH:mm:ss")} (${lastVisit.fromNow()})`
      : i18n.noLastVisit;

  const urlLink = bookmark.url
    ? a({ href: bookmark.url, target: "_blank", rel: "noreferrer noopener", class: "bookmark-url" }, bookmark.url)
    : i18n.noUrl;

  const chips = [
    renderLifespanChip(bookmark.lifetime, i18n),
    bookmark.sizeBytes ? renderEcoTax(bookmark.sizeBytes, bookmark.id) : null
  ].filter(Boolean);

  const sideActions = [];
  sideActions.push(renderFavoriteToggle(bookmark, returnTo));
  if (bookmark.author && String(bookmark.author) !== String(userId)) {
    sideActions.push(renderPMButton(bookmark.author));
  }
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

  const bookmarkSide = div({ class: "tribe-side" },
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, bookmark.category || bookmark.url || ""),
      renderReachChip(isClearnet, i18n)
    ),
    chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
    safeText(bookmark.description)
      ? p({ class: "tribe-side-description" }, ...renderUrl(bookmark.description))
      : null,
    safeText(bookmark.category)
      ? renderCardField(i18n.bookmarkCategoryLabel + ":", safeText(bookmark.category))
      : null,
    tagsNode,
    div({ class: "card-spread-centered" }, renderSpreadButton(bookmark.id, params.spreads)),
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null
  );

  const bookmarkMain = div({ class: "tribe-main" },
    renderCardField(i18n.bookmarkUrlLabel + ":", urlLink),
    renderCardField(i18n.bookmarkLastVisitLabel + ":", lastVisitTxt),
    (() => {
      const createdTs = bookmark.createdAt ? new Date(bookmark.createdAt).getTime() : NaN;
      const updatedTs = bookmark.updatedAt ? new Date(bookmark.updatedAt).getTime() : NaN;
      const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);
      return p(
        { class: "card-footer" },
        span({ class: "date-link" }, `${moment(bookmark.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
        userLink(bookmark.author),
        showUpdated
          ? span(
              { class: "votations-comment-date" },
              ` | ${i18n.bookmarkUpdatedAt}: ${moment(bookmark.updatedAt).format("YYYY/MM/DD HH:mm:ss")}`
            )
          : null
      );
    })(),
    renderOpinionsVoting('/bookmarks/opinions', bookmark.id, bookmark.opinions, returnTo, bookmark.opinions_inhabitants),
    renderBookmarkCommentsSection(bookmark.id, bookmark.rootId, comments, returnTo)
  );

  return template(
    i18n.bookmarkTitle,
    section(
      div({ class: "tags-header" },
        h2(i18n.bookmarkAllSectionTitle || i18n.bookmarkTitle),
        p(i18n.bookmarkDescription)
      ),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/bookmarks", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, i18n.bookmarkFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.bookmarkFilterMine),
          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, i18n.bookmarkFilterTop),
          button({ type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" }, i18n.bookmarkFilterFavorites),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, i18n.bookmarkFilterRecent),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.bookmarkCreateButton)
        )
      ),
      div({ class: "tribe-details" }, bookmarkSide, bookmarkMain)
    )
  );
};

