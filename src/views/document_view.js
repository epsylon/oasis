const { form, button, div, h2, p, section, input, label, br, a, span, textarea, select, option } =
  require("../server/node_modules/hyperaxe");
const { renderCommentsSection: renderSharedCommentsSection, renderCommentsLink } = require("./comments_view");

const moment = require("../server/node_modules/moment");
const { renderLicenseChip, renderLicenseSelect, renderReachChip, renderClearnetSelector, renderClearnetSwitch, renderTribeOriginChip } = require('./clearnet_view');
const { clearnetItemHref, template, i18n, renderOpinionsVoting, renderEngagement, renderEcoTax, renderLifespanChip, renderCardTop, renderCardByline, renderSpreadEditWarning, renderModuleStats, moduleIsEmpty, contentDeleteAction, paged, blobUrlOf, renderPdfDocument, renderMediaLockNote, renderEditedChip, renderDetailShare } = require("./main_views");
const { config } = require("../server/SSB_server.js");
const { renderStyledText } = require("../backend/renderStyledText");

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


const renderTags = (tags) => {
  const list = safeArr(tags).map((t) => String(t || "").trim()).filter(Boolean);
  return list.length
    ? div(
        { class: "tribe-side-tags" },
        list.map((tag) => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`))
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

const renderDocumentUpdated = (doc) => {
  const createdTs = doc.createdAt ? new Date(doc.createdAt).getTime() : NaN;
  const updatedTs = doc.updatedAt ? new Date(doc.updatedAt).getTime() : NaN;
  const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);
  return showUpdated
    ? span({ class: "votations-comment-date" }, `${i18n.documentUpdatedAt}: ${moment(doc.updatedAt).format("YYYY/MM/DD HH:mm")}`)
    : null;
};

const renderDocumentList = exports.renderDocumentList = (documents, filter, params = {}) => {
  const returnTo = buildReturnTo(filter, params);

  return documents.length
    ? documents.map((doc) => {
        const commentCount = typeof doc.commentCount === "number" ? doc.commentCount : 0;
        const title = safeText(doc.title);
        const href = `/documents/${encodeURIComponent(doc.key)}`;

        const isOwn = doc.author && String(doc.author) === String(userId);
        const byline = {
          author: doc.author,
          date: doc.createdAt,
          chips: [
            doc.tribeOrigin ? renderTribeOriginChip(doc.tribeOrigin) : doc.clearnet === true ? renderReachChip(true, i18n, clearnetItemHref('documents', doc.title, doc.key)) : null,
            renderLicenseChip(doc.license),
            ...(typeof params.titleChips === "function" ? params.titleChips(doc) : []),
            renderLifespanChip(doc.lifetime, i18n)
          ],
          bylineExtra: [renderDocumentUpdated(doc)]
        };
        const header = typeof params.headerActions === "function"
          ? div({ class: "card-header activity-card-header card-top" }, renderCardByline(byline), params.headerActions(doc))
          : doc.tribeOrigin
            ? renderCardTop(doc.key, doc.tribeOrigin.href, { ...byline, spread: (params.spreadMap && params.spreadMap.get(doc.key)) || null, reportTitle: doc.title })
            : renderCardTop(doc.key, href, { ...byline, spread: (params.spreadMap && params.spreadMap.get(doc.key)) || params.spreads || null, favKind: 'documents', torrentFrom: { blobId: doc.url, name: doc.title }, isFavorite: doc.isFavorite, reportTitle: doc.title, deleteAction: isOwn ? contentDeleteAction('document', doc.key) : undefined, returnTo });
        const titleHref = typeof params.headerActions === "function" ? null : doc.tribeOrigin ? doc.tribeOrigin.href : href;
        const engagement = typeof params.engagement === "function" ? params.engagement(doc) : null;
        return div(
          { class: "trending-card document-card" + (isOwn ? " own-content" : "") },
          header,
          div(
            { class: "card-section document-card-body" },
            title ? div({ class: "shop-title-row" }, h2(titleHref ? a({ href: titleHref, class: "card-title-link" }, title) : title)) : null,
            doc?.url
              ? renderPdfDocument(blobUrlOf(doc.url), { title: doc.title })
              : p(i18n.documentNoFile),
            ...(typeof params.bodyExtra === "function" ? params.bodyExtra(doc) : []),
            engagement
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
      (filter === "edit" && renderMediaLockNote(docToEdit)) || input({ type: "file", name: "document", accept: "application/pdf", required: filter !== "edit" }),
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
      ...renderLicenseSelect(docToEdit?.license, i18n),
      br(),
      renderClearnetSelector(filter === "edit" ? !!docToEdit?.clearnet : false, i18n),
      br(),
      button({ type: "submit" }, filter === "edit" ? i18n.documentUpdateButton : i18n.documentCreateButton)
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

exports.documentView = async (documents, filter = "all", documentId = null, params = {}) => {
  if (filter === "edit") params = { ...params, spreadWarning: await renderSpreadEditWarning(documentId) };
  const title = i18n.documentTitle;

  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");

  const list = safeArr(documents);
  const emptyMod = moduleIsEmpty(list, filter, "all", q);
  const mediaChip = mediaChipFor(filter, Array.isArray(params.censusList) ? params.censusList : list);
  const docToEdit = documentId ? list.find((d) => d.key === documentId) : null;

  const tpl = template(
    title,
    section(
      div({ class: "tags-header module-header-line" },
        h2(title),
        p(i18n.documentDescription)
      ),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/documents", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "sort", value: sort }),
          ...(emptyMod ? [] : [
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.documentFilterAll).toUpperCase()),
          ...(mediaChip("recent") ? [button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.documentFilterRecent).toUpperCase())] : []),
          ...(mediaChip("mine") ? [button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.documentFilterMine).toUpperCase())] : []),
          ...(mediaChip("favorites") ? [button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            String(i18n.documentFilterFavorites).toUpperCase()
          )] : []),
          ...(mediaChip("top") ? [button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, String(i18n.documentFilterTop).toUpperCase())] : []),
          ]),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.documentCreateButton)
        )
      )
    ),
    section(
      filter === "create" || filter === "edit"
        ? renderDocumentForm(filter, documentId, docToEdit || {}, { ...params, filter })
        : section(
            emptyMod ? null : div(
              { class: "documents-search activity-filter-chips activity-toolbar-row" },
                renderModuleStats(list.length),
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
            div({ class: "documents-list" }, renderDocumentList(paged(list), filter, { q, sort, spreadMap: params.spreadMap }))
          )
    )
  );

  return tpl;
};

exports.singleDocumentView = async (doc, filter = "all", comments = [], params = {}) => {
  const mediaChip = mediaChipFor(filter, Array.isArray(params.censusList) ? params.censusList : null);
  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");
  const returnTo = safeText(params.returnTo) || buildReturnTo(filter, { q, sort });

  const title = safeText(doc.title);
  const isAuthor = String(doc.author) === String(userId);
  const isClearnet = !!doc.clearnet;

  const chips = [
    renderLifespanChip(doc.lifetime, i18n),
    doc.sizeBytes ? renderEcoTax(doc.sizeBytes, doc.key) : null
  ].filter(Boolean);


  const tagsNode = renderTags(doc.tags);
  const href = `/documents/${encodeURIComponent(doc.key)}`;

  const docSide = div({ class: "tribe-side" },
    renderCardTop(doc.key, href, { arrow: false,
      author: doc.author,
      date: doc.createdAt,
      chips: [
        renderReachChip(isClearnet, i18n, isClearnet ? clearnetItemHref('documents', doc.title, doc.key) : null),
        renderLicenseChip(doc.license),
        ...chips
      ],
      bylineExtra: [renderEditedChip(doc.key, doc.rootId), renderDocumentUpdated(doc)],
      favKind: 'documents', torrentFrom: { blobId: doc.url, name: doc.title },
      isFavorite: doc.isFavorite,
      spread: params.spreads || null,
      returnTo: buildReturnTo(filter, { q, sort }),
      reportTitle: doc.title,
      editAction: isAuthor ? `/documents/edit/${encodeURIComponent(doc.key)}?returnTo=${encodeURIComponent(returnTo)}` : undefined,
      deleteAction: isAuthor ? contentDeleteAction('document', doc.key) : undefined
    }),
    div({ class: "shop-title-row" },
      title ? h2({ class: "tribe-card-title" }, title) : null,
      isAuthor ? renderClearnetSwitch('documents', doc.rootId || doc.key, isClearnet) : null
    ),
    renderDetailShare(doc.key, href, doc.title),
    tagsNode,
  );

  const docMain = div({ class: "tribe-main" },
    safeText(doc.description)
      ? div({ class: "job-section" }, h2({ class: "job-section-title" }, i18n.description), p({ class: "tribe-side-description" }, ...renderStyledText(doc.description)))
      : null,
    doc?.url
      ? renderPdfDocument(blobUrlOf(doc.url), { title: doc.title, preview: true })
      : p(i18n.documentNoFile),
    renderEngagement(doc.key,
      renderOpinionsVoting('/documents/opinions', doc.key, doc.opinions, returnTo, doc.opinions_inhabitants),
      renderDocumentCommentsSection(doc.key, doc.rootId || doc.key, comments, returnTo))
  );

  const tpl = template(
    i18n.documentTitle,
    section(
      div({ class: "tags-header module-header-line" },
        h2(i18n.documentAllSectionTitle || i18n.documentTitle),
        p(i18n.documentDescription)
      ),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/documents", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.documentFilterAll).toUpperCase()),
          ...(mediaChip("recent") ? [button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.documentFilterRecent).toUpperCase())] : []),
          ...(mediaChip("mine") ? [button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.documentFilterMine).toUpperCase())] : []),
          ...(mediaChip("favorites") ? [button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            String(i18n.documentFilterFavorites).toUpperCase()
          )] : []),
          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, String(i18n.documentFilterTop).toUpperCase()),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.documentCreateButton)
        )
      ),
      div({ class: "tribe-details" }, docSide, docMain)
    )
  );

  return tpl;
};

