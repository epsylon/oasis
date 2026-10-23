const { div, h2, p, section, button, form, a, textarea, br, input, span, label, select, option, video, audio, table, tr, td } = require("../server/node_modules/hyperaxe");
const { renderCommentsSection: renderSharedCommentsSection } = require("./comments_view");
const { template, i18n, renderOpinionsVoting, renderEngagement, renderStateChip, renderLifespanChip, renderEcoTax, renderSpreadEditWarning, renderCardTop, renderDocumentActions, renderModuleStatsBy, moduleIsEmpty, contentDeleteAction, paged, renderEditedChip, renderDetailShare } = require("./main_views");
const { renderPhotoGallery, renderGalleryFields, renderZoomableImage } = require("./gallery_view");
const { renderTribeOriginChip } = require("./clearnet_view");
const { config } = require("../server/SSB_server.js");
const { renderStyledText } = require("../backend/renderStyledText");

const renderMediaBlob = (value, attrs = {}) => {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.startsWith('&')) return renderZoomableImage(`/blob/${encodeURIComponent(s)}`, { imgClass: attrs.class || 'post-image', alt: attrs.alt || '' });
  const mVideo = s.match(/\[video:[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/);
  if (mVideo) return video({ controls: true, class: attrs.class || 'post-video', src: `/blob/${encodeURIComponent(mVideo[1])}`, preload: 'metadata' });
  const mAudio = s.match(/\[audio:[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/);
  if (mAudio) return audio({ controls: true, class: attrs.class || 'post-audio', src: `/blob/${encodeURIComponent(mAudio[1])}` });
  const mImg = s.match(/!\[[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/);
  if (mImg) return renderZoomableImage(`/blob/${encodeURIComponent(mImg[1])}`, { imgClass: attrs.class || 'post-image', alt: attrs.alt || '' });
  return null;
};

const userId = config.keys.id;

const normU = (v) => String(v || "").trim().toUpperCase();
const normalizeStatus = (v) => normU(v).replace(/\s+/g, "_").replace(/-+/g, "_");

const CATEGORY_BY_FILTER = {
  features: "FEATURES",
  bugs: "BUGS",
  abuse: "ABUSE",
  content: "CONTENT"
};

const STATUS_BY_FILTER = {
  open: "OPEN",
  under_review: "UNDER_REVIEW",
  resolved: "RESOLVED",
  invalid: "INVALID",
  closed: "CLOSED"
};

const SEVERITY_BY_FILTER = {
  sev_low: "LOW",
  sev_medium: "MEDIUM",
  sev_high: "HIGH",
  sev_critical: "CRITICAL"
};

const opt = (value, isSelected, text) =>
  option(Object.assign({ value }, isSelected ? { ...("selected" ? { selected: true } : {})} : {}), text);

const renderReportStatusSetter = (report) => {
  const st = normalizeStatus(report && report.status ? report.status : "OPEN");
  return form(
    { method: "POST", action: `/reports/status/${encodeURIComponent(report.id)}`, class: "project-control-form project-control-form--status" },
    select(
      { name: "status", class: "project-control-select" },
      opt("OPEN", st === "OPEN", i18n.reportsStatusOpen),
      opt("UNDER_REVIEW", st === "UNDER_REVIEW", i18n.reportsStatusUnderReview),
      opt("RESOLVED", st === "RESOLVED", i18n.reportsStatusResolved),
      opt("INVALID", st === "INVALID", i18n.reportsStatusInvalid),
      opt("CLOSED", st === "CLOSED", i18n.reportsStatusClosed || "CLOSED")
    ),
    button({ class: "status-btn project-control-btn", type: "submit" }, i18n.reportsSetStatus || i18n.projectSetStatus || "Set status")
  );
};

const renderReportCommentsSection = (reportId, comments = []) => {
  return renderSharedCommentsSection({
    action: `/reports/${encodeURIComponent(reportId)}/comments`,
    comments: comments,
    returnTo: null
  });
};

const renderReportStatusChip = (status) => {
  const s = normalizeStatus(status);
  const variant =
    s === "OPEN" ? "whole" :
    s === "UNDER_REVIEW" ? "lifespan-orange" :
    s === "RESOLVED" ? "mutuals" :
    s === "INVALID" ? "closed" :
    s === "CLOSED" ? "closed" :
    "whole";
  const localized =
    s === "OPEN" ? i18n.reportsStatusOpen :
    s === "UNDER_REVIEW" ? i18n.reportsStatusUnderReview :
    s === "RESOLVED" ? i18n.reportsStatusResolved :
    s === "INVALID" ? i18n.reportsStatusInvalid :
    s === "CLOSED" ? (i18n.reportsStatusClosed || "CLOSED") :
    s;
  return renderStateChip(variant, "", localized);
};

const renderReportSeverityChip = (severity) => {
  const s = String(severity || "low").toLowerCase();
  const variant =
    s === "critical" ? "closed" :
    s === "high" ? "lifespan-orange" :
    s === "medium" ? "whole" :
    "mutuals";
  const localized =
    s === "critical" ? i18n.reportsSeverityCritical :
    s === "high" ? i18n.reportsSeverityHigh :
    s === "medium" ? i18n.reportsSeverityMedium :
    i18n.reportsSeverityLow;
  return renderStateChip(variant, "⚑", localized);
};

const renderReportCategoryChip = (category) => {
  const c = normU(category);
  const localized =
    c === "FEATURES" ? i18n.reportsCategoryFeatures :
    c === "BUGS" ? i18n.reportsCategoryBugs :
    c === "ABUSE" ? i18n.reportsCategoryAbuse :
    c === "CONTENT" ? i18n.reportsCategoryContent :
    c;
  return renderStateChip("encrypted", "", localized);
};

const renderReportCard = (report, userId, currentFilter = "all", spreadInfo) => {
  const confirmations = Array.isArray(report.confirmations) ? report.confirmations : [];
  const origin = report.tribeOrigin || null;

  const chips = [
    renderReportStatusChip(report.status),
    renderReportSeverityChip(report.severity),
    origin && !report.category ? null : renderReportCategoryChip(report.category),
    renderLifespanChip(report.lifetime, i18n),
    origin ? renderTribeOriginChip(origin) : null
  ].filter(Boolean);

  const href = `/reports/${encodeURIComponent(report.id)}`;
  return div({ class: "tribe-card report-card" },
    origin
      ? renderCardTop(report.id, origin.href, { author: report.author, date: report.createdAt, chips, spread: spreadInfo || null, reportTitle: report.title })
      : renderCardTop(report.id, href, { date: report.createdAt, chips, spread: spreadInfo || null, author: report.author, favKind: 'reports', isFavorite: report.isFavorite, reportTitle: report.title, report: false, deleteAction: String(report.author) === String(userId) ? contentDeleteAction('report', report.id) : undefined }),
    div({ class: "tribe-card-body" },
      div({ class: "shop-title-row" },
        h2({ class: "tribe-card-title" },
          a({ href: origin ? origin.href : href }, report.title || i18n.reportsTitle)
        )
      ),
      origin ? null : div({ class: "tribe-card-members" },
        span({ class: "tribe-members-count" }, `${i18n.reportsConfirmations}: ${confirmations.length}`)
      ),
      null
    )
  );
};

const reportChipFor = (filter, censusReports) => (mode) => {
  if (mode === filter || mode === "all") return true;
  if (!Array.isArray(censusReports)) return true;
  if (mode === "top") return censusReports.length > 0;
  if (mode === "mine") return censusReports.some((r) => r.author === userId);
  if (mode === "recent") return censusReports.length > 0;
  if (mode === "confirmed") return censusReports.some((r) => Array.isArray(r.confirmations) && r.confirmations.includes(userId));
  if (CATEGORY_BY_FILTER[mode]) return censusReports.some((r) => normU(r.category) === CATEGORY_BY_FILTER[mode]);
  if (STATUS_BY_FILTER[mode]) return censusReports.some((r) => normalizeStatus(r.status) === STATUS_BY_FILTER[mode]);
  if (SEVERITY_BY_FILTER[mode]) return censusReports.some((r) => normU(r.severity) === SEVERITY_BY_FILTER[mode]);
  return true;
};

exports.reportView = async (reports, filter, reportId, createCategory, params = {}) => {
  const title = i18n.reportsTitle;

  let filtered = Array.isArray(reports) ? reports : [];

  const dayAgoReports = Date.now() - 86400000;
  const confirmationsOf = (r) => (Array.isArray(r.confirmations) ? r.confirmations.length : 0);
  if (filter === "mine") {
    filtered = filtered.filter((r) => r.author === userId);
  } else if (filter === "recent") {
    filtered = filtered.filter((r) => new Date(r.createdAt).getTime() >= dayAgoReports);
  } else if (filter === "confirmed") {
    filtered = filtered.filter((r) => Array.isArray(r.confirmations) && r.confirmations.includes(userId));
  } else if (filter === "top") {
    filtered = filtered.filter((r) => !r.tribeOrigin);
  } else if (CATEGORY_BY_FILTER[filter]) {
    const wanted = CATEGORY_BY_FILTER[filter];
    filtered = filtered.filter((r) => normU(r.category) === wanted);
  } else if (STATUS_BY_FILTER[filter]) {
    const wanted = STATUS_BY_FILTER[filter];
    filtered = filtered.filter((r) => normalizeStatus(r.status) === wanted);
  } else if (SEVERITY_BY_FILTER[filter]) {
    const wanted = SEVERITY_BY_FILTER[filter];
    filtered = filtered.filter((r) => normU(r.severity) === wanted);
  }

  filtered = filter === "top"
    ? filtered.sort((a, b) => confirmationsOf(b) - confirmationsOf(a) || new Date(b.createdAt) - new Date(a.createdAt))
    : filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const emptyMod = moduleIsEmpty(filtered, filter, "all", params.q);
  const censusReports = Array.isArray(reports) ? reports : [];
  const reportChip = reportChipFor(filter, censusReports);
  const chipBtn = (mode, label) => reportChip(mode)
    ? [button({ type: "submit", name: "filter", value: mode, class: btnClass(mode) }, String(label).toUpperCase())]
    : [];

  const reportToEdit = filter === "edit"
    ? (Array.isArray(reports) ? reports.find((r) => r.id === reportId) : null)
    : null;
  const formData = reportToEdit || params.draft || {};

  const btnClass = (v) => (filter === v ? "filter-btn active" : "filter-btn");

  const rawCategory = normU(
    filter === "create"
      ? (createCategory || "FEATURES")
      : (reportToEdit?.category || "FEATURES")
  );
  const selectedCategory = ["FEATURES", "BUGS", "CONTENT"].includes(rawCategory) ? rawCategory : "FEATURES";

  const sev = String(formData.severity || "low");

  return template(
    title,
    section(
      div(
        { class: "tags-header module-header-line" },
        h2(i18n.reportsTitle),
        p(i18n.reportsDescription)
      ),
      div(
        { class: "filters" },
        ...(emptyMod ? [] : [form(
          { method: "GET", action: "/reports", class: "ui-toolbar ui-toolbar--filters" },
          ...chipBtn("all", i18n.reportsFilterAll),
          ...chipBtn("recent", i18n.reportsFilterRecent),
          ...chipBtn("mine", i18n.reportsFilterMine),
          ...chipBtn("top", i18n.reportsFilterTop),
          ...chipBtn("features", i18n.reportsFilterFeatures),
          ...chipBtn("bugs", i18n.reportsFilterBugs),
          ...chipBtn("content", i18n.reportsFilterContent),
          ...chipBtn("confirmed", i18n.reportsFilterConfirmed),
        )]),
        form(
          { method: "GET", action: "/reports", class: "ui-toolbar ui-toolbar--filters reports-subfilters" },
          ...(emptyMod ? [] : [
          ...chipBtn("open", i18n.reportsFilterOpen),
          ...chipBtn("under_review", i18n.reportsFilterUnderReview),
          ...chipBtn("resolved", i18n.reportsFilterResolved),
          ...chipBtn("invalid", i18n.reportsFilterInvalid),
          ...chipBtn("sev_low", i18n.reportsSeverityLow),
          ...chipBtn("sev_medium", i18n.reportsSeverityMedium),
          ...chipBtn("sev_high", i18n.reportsSeverityHigh),
          ...chipBtn("sev_critical", i18n.reportsSeverityCritical),
          ]),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.reportsCreateButton)
        )
      ),
      filter === "edit" || filter === "create"
        ? null
        : emptyMod ? null : div({ class: "filters activity-filter-chips activity-toolbar-row" },
          renderModuleStatsBy(filtered, r => normalizeStatus(r.status || 'OPEN'), [{ value: 'OPEN', label: i18n.reportsStatusOpen }, { value: 'UNDER_REVIEW', label: i18n.reportsStatusUnderReview }, { value: 'RESOLVED', label: i18n.reportsStatusResolved }, { value: 'CLOSED', label: i18n.reportsStatusClosed }, { value: 'INVALID', label: i18n.reportsStatusInvalid }]),
            form({ method: "GET", action: "/reports", class: "filter-box" },
              input({ type: "hidden", name: "filter", value: filter }),
              input({ type: "text", name: "q", value: params.q || "", placeholder: i18n.reportsSearchPlaceholder, class: "filter-box__input" }),
              div({ class: "filter-box__controls" },
                button({ type: "submit", class: "filter-box__button" }, i18n.searchButton)
              )
            )
          )
    ),
    section(
      filter === "edit" || filter === "create"
        ? div(
            { class: "report-form" },
            filter === "edit" ? await renderSpreadEditWarning(reportToEdit && (reportToEdit.id || reportToEdit.key)) : null,
            filter === "create"
              ? [
                  form(
                    { id: "report-create-form", action: "/reports/create", method: "POST", enctype: "multipart/form-data" },
                    label(i18n.reportsTitleLabel),
                    br(),
                    input({ type: "text", name: "title", maxlength: "100", required: true, value: formData.title || params.prefillTitle || "" }),
                    br(),
                    label(i18n.description),
                    br(),
                    textarea({ name: "description", rows: "6" }, formData.description || ""),
                    br(),
                    label(i18n.reportsCategory),
                    br(),
                    select(
                      { name: "category", required: true },
                      opt("FEATURES", selectedCategory === "FEATURES", i18n.reportsCategoryFeatures),
                      opt("BUGS", selectedCategory === "BUGS", i18n.reportsCategoryBugs),
                      opt("CONTENT", selectedCategory === "CONTENT", i18n.reportsCategoryContent)
                    ),
                    br(),
                    br(),
                    ...renderGalleryFields(formData, false, 8),
                    label(i18n.uploadMedia), br(),
                    input({ type: "file", name: "blob" }), br(), br(),
                    label("Tags"),
                    br(),
                    input({ type: "text", name: "tags", placeholder: i18n.tagsPlaceholder, value: Array.isArray(formData.tags) ? formData.tags.join(", ") : (formData.tags || "") }),
                    br(),
                    label(i18n.reportsSeverity),
                    br(),
                    select(
                      { name: "severity" },
                      opt("critical", sev === "critical", i18n.reportsSeverityCritical),
                      opt("high", sev === "high", i18n.reportsSeverityHigh),
                      opt("medium", sev === "medium", i18n.reportsSeverityMedium),
                      opt("low", sev === "low", i18n.reportsSeverityLow)
                    ),
                    br(),
                    br(),
                    button({ type: "submit", class: "create-button" }, i18n.reportsCreateButton)
                  )
                ]
              : [
                  form(
                    { id: "report-edit-form", action: `/reports/update/${encodeURIComponent(reportId)}`, method: "POST", enctype: "multipart/form-data" },
                    label(i18n.reportsTitleLabel),
                    br(),
                    input({ type: "text", name: "title", maxlength: "100", required: true, value: reportToEdit?.title || "" }),
                    br(),
                    label(i18n.description),
                    br(),
                    textarea({ name: "description", rows: "6" }, reportToEdit?.description || ""),
                    br(),
                    label(i18n.reportsCategory),
                    br(),
                    select(
                      { name: "category", required: true },
                      opt("FEATURES", selectedCategory === "FEATURES", i18n.reportsCategoryFeatures),
                      opt("BUGS", selectedCategory === "BUGS", i18n.reportsCategoryBugs),
                      opt("CONTENT", selectedCategory === "CONTENT", i18n.reportsCategoryContent)
                    ),
                    br(),
                    br(),
                    ...renderGalleryFields(reportToEdit || {}, true, 8),
                    label("Tags"),
                    br(),
                    input({ type: "text", name: "tags", placeholder: i18n.tagsPlaceholder, value: reportToEdit?.tags?.join(", ") || "" }),
                    br(),
                    label(i18n.reportsSeverity),
                    br(),
                    select(
                      { name: "severity" },
                      opt("critical", sev === "critical", i18n.reportsSeverityCritical),
                      opt("high", sev === "high", i18n.reportsSeverityHigh),
                      opt("medium", sev === "medium", i18n.reportsSeverityMedium),
                      opt("low", sev === "low", i18n.reportsSeverityLow)
                    ),
                    br(),
                    br(),
                    button({ type: "submit" }, i18n.reportsUpdateButton)
                  )
                ]
          )
        : filtered.length > 0
          ? div({ class: "jobs-grid" }, paged(filtered).map((r) => renderReportCard(r, userId, filter, params.spreadMap && params.spreadMap.get(r.id))))
          : div({ class: "no-content-box" }, p(i18n.reportsNoItems))
    )
  );
};

exports.singleReportView = async (report, filter, comments = [], params = {}) => {
  const reportChip = (mode) => reportChipFor(filter, Array.isArray(params.censusList) ? params.censusList : null)(mode);
  const btnClass = (v) => (filter === v ? "filter-btn active" : "filter-btn");
  const confirmations = Array.isArray(report.confirmations) ? report.confirmations : [];
  const isAuthor = String(report.author) === String(userId);

  const chips = [
    renderReportStatusChip(report.status),
    renderReportSeverityChip(report.severity),
    renderReportCategoryChip(report.category),
    renderLifespanChip(report.lifetime, i18n),
    renderEcoTax(report.msgSize, report.id)
  ].filter(Boolean);

  const sideActions = [];
  if (!isAuthor && !confirmations.includes(userId)) sideActions.push(form({ method: "POST", action: `/reports/confirm/${encodeURIComponent(report.id)}` },
    button({ type: "submit", class: "tribe-action-btn" }, i18n.reportsConfirmButton)
  ));
  const tagsNode = report.tags && report.tags.length
    ? div({ class: "card-tags" },
        report.tags.map((tag) => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`))
      )
    : null;

  const infoRows = [];
  const pushRow = (labelText, valueNode) =>
    infoRows.push(tr(
      td({ class: "tribe-info-label" }, labelText),
      td({ class: "tribe-info-value" }, valueNode)
    ));
  pushRow(i18n.reportsStatus, report.status);
  pushRow(i18n.reportsSeverity, normU(report.severity || "low"));
  pushRow(i18n.reportsCategory, report.category);

  const statusRow = isAuthor
    ? div({ class: "tribe-side-actions housing-status-row" },
        span({ class: "card-label" }, `${i18n.reportsStatus}: `),
        renderStateChip(normalizeStatus(report.status) === "RESOLVED" ? "mutuals" : "whole", "◆", String(report.status || "OPEN").toUpperCase()),
        renderReportStatusSetter(report)
      )
    : null;

  const reportSide = div({ class: "tribe-side" },
    renderCardTop(report.id, `/reports/${encodeURIComponent(report.id)}`, { arrow: false, date: report.createdAt, chips, bylineExtra: [renderEditedChip(report.id, report.rootId)], spread: params.spreads || null, author: report.author, favKind: 'reports', isFavorite: report.isFavorite, reportTitle: report.title, report: false, returnTo: `/reports/${encodeURIComponent(report.id)}`, editAction: isAuthor ? `/reports/edit/${encodeURIComponent(report.id)}` : undefined, deleteAction: isAuthor ? contentDeleteAction('report', report.id) : undefined }),
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, report.title)
    ),
    renderDetailShare(report.id, `/reports/${encodeURIComponent(report.id)}`, report.title),
    tagsNode,
    statusRow
  );

  const opinionsBar = renderOpinionsVoting('/reports/opinions', report.id, report.opinions, null, report.opinions_inhabitants);

  const reportMain = div({ class: "tribe-main" },
    renderPhotoGallery(report, 'report'),
    String(report.description || "").trim()
      ? div({ class: "job-section" },
          h2({ class: "job-section-title" }, i18n.description),
          p({ class: "tribe-side-description" }, ...renderStyledText(String(report.description)))
        )
      : null,
    table({ class: "tribe-info-table jobs-info-table" }, ...infoRows),
    sideActions.length ? div({ class: "tribe-side-actions detail-action-row report-confirm-actions" }, ...sideActions) : null,
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.reportsConfirmations}: ${confirmations.length}`)
    ),
    renderDocumentActions('reports', report.id, [
      a({ href: "/tasks?filter=create", class: "filter-btn" }, i18n.reportsCreateTaskButton)
    ]),
    renderEngagement(report.id, opinionsBar, renderReportCommentsSection(report.id, comments))
  );

  return template(
    report.title,
    section(
      div({ class: "tags-header module-header-line" }, h2(i18n.reportsTitle), p(i18n.reportsDescription)),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/reports", class: "ui-toolbar ui-toolbar--filters" },
          button({ type: "submit", name: "filter", value: "all", class: btnClass("all") }, String(i18n.reportsFilterAll).toUpperCase()),
          ...(reportChip("recent") ? [button({ type: "submit", name: "filter", value: "recent", class: btnClass("recent") }, String(i18n.reportsFilterRecent).toUpperCase())] : []),
          ...(reportChip("mine") ? [button({ type: "submit", name: "filter", value: "mine", class: btnClass("mine") }, String(i18n.reportsFilterMine).toUpperCase())] : []),
          button({ type: "submit", name: "filter", value: "top", class: btnClass("top") }, String(i18n.reportsFilterTop).toUpperCase()),
          ...(reportChip("features") ? [button({ type: "submit", name: "filter", value: "features", class: btnClass("features") }, String(i18n.reportsFilterFeatures).toUpperCase())] : []),
          ...(reportChip("bugs") ? [button({ type: "submit", name: "filter", value: "bugs", class: btnClass("bugs") }, String(i18n.reportsFilterBugs).toUpperCase())] : []),
          ...(reportChip("content") ? [button({ type: "submit", name: "filter", value: "content", class: btnClass("content") }, String(i18n.reportsFilterContent).toUpperCase())] : []),
          ...(reportChip("confirmed") ? [button({ type: "submit", name: "filter", value: "confirmed", class: btnClass("confirmed") }, String(i18n.reportsFilterConfirmed).toUpperCase())] : [])
        ),
        form(
          { method: "GET", action: "/reports", class: "ui-toolbar ui-toolbar--filters reports-subfilters" },
          ...(reportChip("open") ? [button({ type: "submit", name: "filter", value: "open", class: btnClass("open") }, String(i18n.reportsFilterOpen).toUpperCase())] : []),
          ...(reportChip("under_review") ? [button({ type: "submit", name: "filter", value: "under_review", class: btnClass("under_review") }, String(i18n.reportsFilterUnderReview).toUpperCase())] : []),
          ...(reportChip("resolved") ? [button({ type: "submit", name: "filter", value: "resolved", class: btnClass("resolved") }, String(i18n.reportsFilterResolved).toUpperCase())] : []),
          ...(reportChip("invalid") ? [button({ type: "submit", name: "filter", value: "invalid", class: btnClass("invalid") }, String(i18n.reportsFilterInvalid).toUpperCase())] : []),
          ...(reportChip("sev_low") ? [button({ type: "submit", name: "filter", value: "sev_low", class: btnClass("sev_low") }, String(i18n.reportsSeverityLow).toUpperCase())] : []),
          ...(reportChip("sev_medium") ? [button({ type: "submit", name: "filter", value: "sev_medium", class: btnClass("sev_medium") }, String(i18n.reportsSeverityMedium).toUpperCase())] : []),
          ...(reportChip("sev_high") ? [button({ type: "submit", name: "filter", value: "sev_high", class: btnClass("sev_high") }, String(i18n.reportsSeverityHigh).toUpperCase())] : []),
          ...(reportChip("sev_critical") ? [button({ type: "submit", name: "filter", value: "sev_critical", class: btnClass("sev_critical") }, String(i18n.reportsSeverityCritical).toUpperCase())] : []),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.reportsCreateButton)
        )
      ),
      div({ class: "tribe-details" }, reportSide, reportMain)
    )
  );
};

