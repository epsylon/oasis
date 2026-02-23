const { form, button, div, h2, p, section, input, label, br, a, span, textarea, select, option } =
  require("../server/node_modules/hyperaxe");

const moment = require("../server/node_modules/moment");
const { template, i18n } = require("./main_views");
const { config } = require("../server/SSB_server.js");
const { renderUrl } = require("../backend/renderUrl");
const opinionCategories = require("../backend/opinion_categories");

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
  return `/documents?${parts.join("&")}`;
};

const safeDomId = (prefix, key) => `${prefix}${String(key || "").replace(/[^A-Za-z0-9_-]/g, "_")}`;

const renderTags = (tags) => {
  const list = safeArr(tags).map((t) => String(t || "").trim()).filter(Boolean);
  return list.length
    ? div(
        { class: "card-tags" },
        list.map((tag) => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`))
      )
    : null;
};

const renderFavoriteToggle = (doc, returnTo) =>
  form(
    {
      method: "POST",
      action: doc.isFavorite
        ? `/documents/favorites/remove/${encodeURIComponent(doc.key)}`
        : `/documents/favorites/add/${encodeURIComponent(doc.key)}`
    },
    returnTo ? input({ type: "hidden", name: "returnTo", value: returnTo }) : null,
    button(
      { type: "submit", class: "filter-btn" },
      doc.isFavorite ? i18n.documentRemoveFavoriteButton : i18n.documentAddFavoriteButton
    )
  );

const renderDocumentActions = (filter, doc, params = {}) => {
  const returnTo = buildReturnTo(filter, params);
  const isAuthor = String(doc.author) === String(userId);
  const hasOpinions = Object.keys(doc.opinions || {}).length > 0;

  return isAuthor
    ? div(
        { class: "bookmark-actions" },
        !hasOpinions
          ? form(
              { method: "GET", action: `/documents/edit/${encodeURIComponent(doc.key)}` },
              input({ type: "hidden", name: "returnTo", value: returnTo }),
              button({ class: "update-btn", type: "submit" }, i18n.documentUpdateButton)
            )
          : null,
        form(
          { method: "POST", action: `/documents/delete/${encodeURIComponent(doc.key)}` },
          input({ type: "hidden", name: "returnTo", value: returnTo }),
          button({ class: "delete-btn", type: "submit" }, i18n.documentDeleteButton)
        )
      )
    : null;
};

const renderDocumentCommentsSection = (documentKey, rootId, comments = [], returnTo = null) => {
  const list = safeArr(comments);
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
        { method: "POST", action: `/documents/${encodeURIComponent(documentKey)}/comments`, class: "comment-form", enctype: "multipart/form-data" },
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
            const userName = author && author.includes("@") ? author.split("@")[1] : author;

            const content = c?.value?.content || {};
            const text = content.text || "";
            const threadRoot = content.fork || content.root || null;

            return div(
              { class: "votations-comment-card" },
              span(
                { class: "created-at" },
                span(i18n.createdBy),
                author ? a({ href: `/author/${encodeURIComponent(author)}` }, `@${userName}`) : span("(unknown)"),
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

const renderDocumentList = (documents, filter, params = {}) => {
  const returnTo = buildReturnTo(filter, params);

  return documents.length
    ? documents.map((doc) => {
        const commentCount = typeof doc.commentCount === "number" ? doc.commentCount : 0;
        const title = safeText(doc.title);
        const pdfId = safeDomId("pdf-container-", doc.key);

        const topbarLeft =
          doc.author && String(doc.author) !== String(userId)
            ? form(
                { method: "GET", action: "/pm" },
                input({ type: "hidden", name: "recipients", value: doc.author }),
                button({ type: "submit", class: "filter-btn" }, i18n.documentMessageAuthorButton)
              )
            : null;

        return div(
          { class: "tags-header document-card" },
          div(
            { class: "bookmark-topbar" },
            div(
              { class: "bookmark-topbar-left" },
              form(
                { method: "GET", action: `/documents/${encodeURIComponent(doc.key)}` },
                input({ type: "hidden", name: "returnTo", value: returnTo }),
                input({ type: "hidden", name: "filter", value: filter || "all" }),
                params.q ? input({ type: "hidden", name: "q", value: params.q }) : null,
                params.sort ? input({ type: "hidden", name: "sort", value: params.sort }) : null,
                button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
              ),
              renderFavoriteToggle(doc, returnTo),
              topbarLeft
            ),
            renderDocumentActions(filter, doc, params)
          ),
          title ? h2(title) : null,
          doc?.url
            ? div({ id: pdfId, class: "pdf-viewer-container", "data-pdf-url": `/blob/${encodeURIComponent(doc.url)}` })
            : p(i18n.documentNoFile),
          safeText(doc.description) ? p(...renderUrl(doc.description)) : null,
          renderTags(doc.tags),
          div(
            { class: "card-comments-summary" },
            span({ class: "card-label" }, i18n.voteCommentsLabel + ":"),
            span({ class: "card-value" }, String(commentCount)),
            br(),
            br(),
            form(
              { method: "GET", action: `/documents/${encodeURIComponent(doc.key)}` },
              input({ type: "hidden", name: "returnTo", value: returnTo }),
              input({ type: "hidden", name: "filter", value: filter || "all" }),
              params.q ? input({ type: "hidden", name: "q", value: params.q }) : null,
              params.sort ? input({ type: "hidden", name: "sort", value: params.sort }) : null,
              button({ type: "submit", class: "filter-btn" }, i18n.voteCommentsForumButton)
            )
          ),
          br(),
          (() => {
            const createdTs = doc.createdAt ? new Date(doc.createdAt).getTime() : NaN;
            const updatedTs = doc.updatedAt ? new Date(doc.updatedAt).getTime() : NaN;
            const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

            return p(
              { class: "card-footer" },
              span({ class: "date-link" }, `${moment(doc.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
              a({ href: `/author/${encodeURIComponent(doc.author)}`, class: "user-link" }, `${doc.author}`),
              showUpdated
                ? span(
                    { class: "votations-comment-date" },
                    ` | ${i18n.documentUpdatedAt}: ${moment(doc.updatedAt).format("YYYY/MM/DD HH:mm:ss")}`
                  )
                : null
            );
          })(),
          div(
            { class: "voting-buttons" },
            opinionCategories.map((category) =>
              form(
                { method: "POST", action: `/documents/opinions/${encodeURIComponent(doc.key)}/${category}` },
                input({ type: "hidden", name: "returnTo", value: returnTo }),
                button(
                  { class: "vote-btn" },
                  `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`] || category} [${doc.opinions?.[category] || 0}]`
                )
              )
            )
          )
        );
      })
    : p(params.q ? i18n.documentNoMatch : i18n.noDocuments);
};

const renderDocumentForm = (filter, documentId, docToEdit, params = {}) => {
  const returnFilter = filter === "create" ? "all" : params.filter || "all";
  const returnTo = safeText(params.returnTo) || buildReturnTo(returnFilter, params);
  const tagsValue = safeArr(docToEdit?.tags).join(", ");

  return div(
    { class: "div-center document-form" },
    form(
      {
        action: filter === "edit" ? `/documents/update/${encodeURIComponent(documentId)}` : "/documents/create",
        method: "POST",
        enctype: "multipart/form-data"
      },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      label(i18n.documentFileLabel),
      br(),
      input({ type: "file", name: "document", accept: "application/pdf", required: filter !== "edit" }),
      br(),
      br(),
      label(i18n.documentTagsLabel),
      br(),
      input({ type: "text", name: "tags", placeholder: i18n.documentTagsPlaceholder, value: tagsValue }),
      br(),
      br(),
      label(i18n.documentTitleLabel),
      br(),
      input({ type: "text", name: "title", placeholder: i18n.documentTitlePlaceholder, value: docToEdit?.title || "" }),
      br(),
      br(),
      label(i18n.documentDescriptionLabel),
      br(),
      textarea({ name: "description", placeholder: i18n.documentDescriptionPlaceholder, rows: "4" }, docToEdit?.description || ""),
      br(),
      br(),
      button({ type: "submit" }, filter === "edit" ? i18n.documentUpdateButton : i18n.documentCreateButton)
    )
  );
};

exports.documentView = async (documents, filter = "all", documentId = null, params = {}) => {
  const title =
    filter === "mine"
      ? i18n.documentMineSectionTitle
      : filter === "create"
        ? i18n.documentCreateSectionTitle
        : filter === "edit"
          ? i18n.documentUpdateSectionTitle
          : filter === "recent"
            ? i18n.documentRecentSectionTitle
            : filter === "top"
              ? i18n.documentTopSectionTitle
              : filter === "favorites"
                ? i18n.documentFavoritesSectionTitle
                : i18n.documentAllSectionTitle;

  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");

  const list = safeArr(documents);
  const docToEdit = documentId ? list.find((d) => d.key === documentId) : null;

  const tpl = template(
    title,
    section(
      div({ class: "tags-header" }, h2(title), p(i18n.documentDescription)),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/documents", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, i18n.documentFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.documentFilterMine),
          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, i18n.documentFilterTop),
          button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            i18n.documentFilterFavorites
          ),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, i18n.documentFilterRecent),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.documentCreateButton)
        )
      )
    ),
    section(
      filter === "create" || filter === "edit"
        ? renderDocumentForm(filter, documentId, docToEdit || {}, { ...params, filter })
        : section(
            div(
              { class: "documents-search" },
              form(
                { method: "GET", action: "/documents", class: "filter-box" },
                input({ type: "hidden", name: "filter", value: filter }),
                input({ type: "text", name: "q", value: q, placeholder: i18n.documentSearchPlaceholder, class: "filter-box__input" }),
                div(
                  { class: "filter-box__controls" },
                  select(
                    { name: "sort", class: "filter-box__select" },
                    option({ value: "recent", selected: sort === "recent" }, i18n.documentSortRecent),
                    option({ value: "oldest", selected: sort === "oldest" }, i18n.documentSortOldest),
                    option({ value: "top", selected: sort === "top" }, i18n.documentSortTop)
                  ),
                  button({ type: "submit", class: "filter-box__button" }, i18n.documentSearchButton)
                )
              )
            ),
            div({ class: "documents-list" }, renderDocumentList(list, filter, { q, sort }))
          )
    )
  );

  return `${tpl}<script type="module" src="/js/pdf.min.mjs"></script><script src="/js/pdf-viewer.js"></script>`;
};

exports.singleDocumentView = async (doc, filter = "all", comments = [], params = {}) => {
  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");
  const returnTo = safeText(params.returnTo) || buildReturnTo(filter, { q, sort });

  const isAuthor = String(doc.author) === String(userId);
  const hasOpinions = Object.keys(doc.opinions || {}).length > 0;

  const title = safeText(doc.title);
  const pdfId = safeDomId("pdf-container-", doc.key);

  const topbarLeft =
    doc.author && String(doc.author) !== String(userId)
      ? div(
          { class: "bookmark-topbar-left" },
          form(
            { method: "GET", action: "/pm" },
            input({ type: "hidden", name: "recipients", value: doc.author }),
            button({ type: "submit", class: "filter-btn" }, i18n.documentMessageAuthorButton)
          )
        )
      : null;

  const topbarRight = div(
    { class: "bookmark-actions" },
    renderFavoriteToggle(doc, returnTo),
    isAuthor && !hasOpinions
      ? form(
          { method: "GET", action: `/documents/edit/${encodeURIComponent(doc.key)}` },
          input({ type: "hidden", name: "returnTo", value: returnTo }),
          button({ class: "update-btn", type: "submit" }, i18n.documentUpdateButton)
        )
      : null,
    isAuthor
      ? form(
          { method: "POST", action: `/documents/delete/${encodeURIComponent(doc.key)}` },
          input({ type: "hidden", name: "returnTo", value: returnTo }),
          button({ class: "delete-btn", type: "submit" }, i18n.documentDeleteButton)
        )
      : null
  );

  const tpl = template(
    i18n.documentTitle,
    section(
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/documents", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, i18n.documentFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.documentFilterMine),
          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, i18n.documentFilterTop),
          button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            i18n.documentFilterFavorites
          ),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, i18n.documentFilterRecent),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.documentCreateButton)
        )
      ),
      div(
        { class: "bookmark-item card" },
        div({ class: "bookmark-topbar" }, topbarLeft, topbarRight),
        title ? h2(title) : null,
        doc?.url
          ? div({ id: pdfId, class: "pdf-viewer-container", "data-pdf-url": `/blob/${encodeURIComponent(doc.url)}` })
          : p(i18n.documentNoFile),
        safeText(doc.description) ? p(...renderUrl(doc.description)) : null,
        renderTags(doc.tags),
        br(),
        (() => {
          const createdTs = doc.createdAt ? new Date(doc.createdAt).getTime() : NaN;
          const updatedTs = doc.updatedAt ? new Date(doc.updatedAt).getTime() : NaN;
          const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

          return p(
            { class: "card-footer" },
            span({ class: "date-link" }, `${moment(doc.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
            a({ href: `/author/${encodeURIComponent(doc.author)}`, class: "user-link" }, `${doc.author}`),
            showUpdated
              ? span(
                  { class: "votations-comment-date" },
                  ` | ${i18n.documentUpdatedAt}: ${moment(doc.updatedAt).format("YYYY/MM/DD HH:mm:ss")}`
                )
              : null
          );
        })(),
        div(
          { class: "voting-buttons" },
          opinionCategories.map((category) =>
            form(
              { method: "POST", action: `/documents/opinions/${encodeURIComponent(doc.key)}/${category}` },
              input({ type: "hidden", name: "returnTo", value: returnTo }),
              button(
                { class: "vote-btn" },
                `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`] || category} [${doc.opinions?.[category] || 0}]`
              )
            )
          )
        )
      ),
      div({ id: "comments" }, renderDocumentCommentsSection(doc.key, doc.rootId || doc.key, comments, returnTo))
    )
  );

  return `${tpl}<script type="module" src="/js/pdf.min.mjs"></script><script src="/js/pdf-viewer.js"></script>`;
};

