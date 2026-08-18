const { form, button, div, h2, p, section, input, label, br, a, span, textarea, select, option } =
  require("../server/node_modules/hyperaxe");
const { renderCommentsSection: renderSharedCommentsSection, renderCommentsLink } = require("./comments_view");

const moment = require("../server/node_modules/moment");
const { template, i18n, renderOpinionsVoting, renderEngagement, userLink, renderSpreadButton, renderEcoTax, renderLifespanChip, renderContentActions , renderSpreadEditWarning } = require("./main_views");
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
  return renderSharedCommentsSection({
    action: `/documents/${encodeURIComponent(documentKey)}/comments`,
    comments: comments,
    returnTo: returnTo
  });
};

const renderDocumentList = exports.renderDocumentList = (documents, filter, params = {}) => {
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

        const isOwn = doc.author && String(doc.author) === String(userId);
        return div(
          { class: "trending-card document-card" + (isOwn ? " own-content" : "") },
          div(
            { class: "card-header activity-card-header" },
            span(),
            renderContentActions(doc.key, `/documents/${encodeURIComponent(doc.key)}`, { spread: (params.spreadMap && params.spreadMap.get(doc.key)) || params.spreads || null, author: doc.author, favKind: 'documents', isFavorite: doc.isFavorite, reportTitle: doc.title })
          ),
          div(
            { class: "card-section document-card-body" },
            title ? h2(title) : null,
            doc.lifetime ? div({ class: "card-chips-row" }, renderLifespanChip(doc.lifetime, i18n)) : null,
            doc?.url
              ? div({ id: pdfId, class: "pdf-viewer-container", "data-pdf-url": `/blob/${encodeURIComponent(doc.url)}` })
              : p(i18n.documentNoFile),
            renderEngagement(doc.key,
              renderOpinionsVoting('/documents/opinions', doc.key, doc.opinions, returnTo, doc.opinions_inhabitants),
              renderCommentsLink({ href: `/documents/${encodeURIComponent(doc.key)}`, count: commentCount })
            ),
            br(),
            (() => {
              const createdTs = doc.createdAt ? new Date(doc.createdAt).getTime() : NaN;
              const updatedTs = doc.updatedAt ? new Date(doc.updatedAt).getTime() : NaN;
              const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

              return p(
                { class: "card-footer" },
                span({ class: "date-link" }, `${moment(doc.createdAt).format("YYYY/MM/DD HH:mm")} ${i18n.performed} `),
                userLink(doc.author),
                showUpdated
                  ? span(
                      { class: "votations-comment-date" },
                      ` | ${i18n.documentUpdatedAt}: ${moment(doc.updatedAt).format("YYYY/MM/DD HH:mm")}`
                    )
                  : null
              );
            })()
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
    params.spreadWarning || null,
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
      label(i18n.documentTitleLabel),
      br(),
      input({ type: "text", name: "title", maxlength: "100", placeholder: i18n.documentTitlePlaceholder, value: docToEdit?.title || "" }),
      br(),
      label(i18n.documentDescriptionLabel),
      br(),
      textarea({ name: "description", placeholder: i18n.documentDescriptionPlaceholder, rows: "4" }, docToEdit?.description || ""),
      br(),
      label(i18n.documentTagsLabel),
      br(),
      input({ type: "text", name: "tags", placeholder: i18n.documentTagsPlaceholder, value: tagsValue }),
      br(),
      br(),
      button({ type: "submit" }, filter === "edit" ? i18n.documentUpdateButton : i18n.documentCreateButton)
    )
  );
};

exports.documentView = async (documents, filter = "all", documentId = null, params = {}) => {
  if (filter === "edit") params = { ...params, spreadWarning: await renderSpreadEditWarning(documentId) };
  const title = i18n.documentTitle;

  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");

  const list = safeArr(documents);
  const docToEdit = documentId ? list.find((d) => d.key === documentId) : null;

  const tpl = template(
    title,
    section(
      div({ class: "tags-header" },
        h2(title),
        p(i18n.documentDescription)
      ),
      (() => {
        const { renderReachChip } = require('./clearnet_view');
        const isClearnet = !!(params.viewerPrefs && params.viewerPrefs.clearnetDocuments);
        return div({ class: "shop-title-row" }, renderReachChip(isClearnet, i18n));
      })(),
      br(),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/documents", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.documentFilterAll).toUpperCase()),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.documentFilterMine).toUpperCase()),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.documentFilterRecent).toUpperCase()),
          button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            String(i18n.documentFilterFavorites).toUpperCase()
          ),
          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, String(i18n.documentFilterTop).toUpperCase()),
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
                    option({ value: "recent", ...(sort === "recent" ? { selected: true } : {})}, i18n.documentSortRecent),
                    option({ value: "oldest", ...(sort === "oldest" ? { selected: true } : {})}, i18n.documentSortOldest),
                    option({ value: "top", ...(sort === "top" ? { selected: true } : {})}, i18n.documentSortTop)
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

  const title = safeText(doc.title);
  const pdfId = safeDomId("pdf-container-", doc.key);
  const isAuthor = String(doc.author) === String(userId);
  const hasOpinions = Object.keys(doc.opinions || {}).length > 0;
  const { renderReachChip } = require('./clearnet_view');
  const isClearnet = !!(params.authorPrefs && params.authorPrefs.clearnetDocuments);

  const chips = [
    renderLifespanChip(doc.lifetime, i18n),
    doc.sizeBytes ? renderEcoTax(doc.sizeBytes, doc.key) : null
  ].filter(Boolean);

  const sideActions = [];
  if (doc.author && String(doc.author) !== String(userId)) {
    sideActions.push(form(
      { method: "GET", action: "/pm" },
      input({ type: "hidden", name: "recipients", value: doc.author }),
      button({ type: "submit", class: "filter-btn" }, i18n.documentMessageAuthorButton)
    ));
  }
  if (isAuthor && !hasOpinions) {
    sideActions.push(form(
      { method: "GET", action: `/documents/edit/${encodeURIComponent(doc.key)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "update-btn", type: "submit" }, i18n.documentUpdateButton)
    ));
  }
  if (isAuthor) {
    sideActions.push(form(
      { method: "POST", action: `/documents/delete/${encodeURIComponent(doc.key)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "delete-btn", type: "submit" }, i18n.documentDeleteButton)
    ));
  }

  const tagsNode = renderTags(doc.tags);

  const detailActions = div({ class: "card-header activity-card-header" },
    renderContentActions(doc.key, null, {
      author: doc.author,
      favKind: 'documents',
      isFavorite: doc.isFavorite,
      spread: params.spreads || null,
      returnTo,
      reportTitle: doc.title
    })
  );

  const docSide = div({ class: "tribe-side" },
    div({ class: "shop-title-row" },
      title ? h2({ class: "tribe-card-title" }, title) : null,
      renderReachChip(isClearnet, i18n)
    ),
    chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
    safeText(doc.description)
      ? p({ class: "tribe-side-description" }, ...renderUrl(doc.description))
      : null,
    tagsNode,
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null
  );

  const docMain = div({ class: "tribe-main" },
    detailActions,
    doc?.url
      ? div({ id: pdfId, class: "pdf-viewer-container", "data-pdf-url": `/blob/${encodeURIComponent(doc.url)}` })
      : p(i18n.documentNoFile),
    (() => {
      const createdTs = doc.createdAt ? new Date(doc.createdAt).getTime() : NaN;
      const updatedTs = doc.updatedAt ? new Date(doc.updatedAt).getTime() : NaN;
      const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

      return p(
        { class: "card-footer" },
        span({ class: "date-link" }, `${moment(doc.createdAt).format("YYYY/MM/DD HH:mm")} ${i18n.performed} `),
        userLink(doc.author),
        showUpdated
          ? span(
              { class: "votations-comment-date" },
              ` | ${i18n.documentUpdatedAt}: ${moment(doc.updatedAt).format("YYYY/MM/DD HH:mm")}`
            )
          : null
      );
    })(),
    renderEngagement(doc.key,
      renderOpinionsVoting('/documents/opinions', doc.key, doc.opinions, returnTo, doc.opinions_inhabitants),
      renderDocumentCommentsSection(doc.key, doc.rootId || doc.key, comments, returnTo)
    )
  );

  const tpl = template(
    i18n.documentTitle,
    section(
      div({ class: "tags-header" },
        h2(i18n.documentAllSectionTitle || i18n.documentTitle),
        p(i18n.documentDescription)
      ),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/documents", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.documentFilterAll).toUpperCase()),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.documentFilterMine).toUpperCase()),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.documentFilterRecent).toUpperCase()),
          button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            String(i18n.documentFilterFavorites).toUpperCase()
          ),
          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, String(i18n.documentFilterTop).toUpperCase()),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.documentCreateButton)
        )
      ),
      div({ class: "tribe-details" }, docSide, docMain)
    )
  );

  return `${tpl}<script type="module" src="/js/pdf.min.mjs"></script><script src="/js/pdf-viewer.js"></script>`;
};

