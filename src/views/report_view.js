const { hr, div, h2, p, section, button, form, a, textarea, br, input, img, span, label, select, option, video, audio, table, tr, td } = require("../server/node_modules/hyperaxe");
const { renderCommentsSection: renderSharedCommentsSection } = require("./comments_view");
const { template, i18n, renderOpinionsVoting, renderEngagement, userLink, renderStateChip, renderLifespanChip, renderEcoTax, renderSpreadButton, renderSpreadEditWarning, renderContentActions, renderDocumentActions, renderModuleStatsBy, moduleIsEmpty } = require("./main_views");
const { renderPhotoGallery, renderGalleryFields } = require("./gallery_view");
const { config } = require("../server/SSB_server.js");
const moment = require("../server/node_modules/moment");
const { renderStyledText } = require("../backend/renderStyledText");

const renderMediaBlob = (value, attrs = {}) => {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.startsWith('&')) return img({ src: `/blob/${encodeURIComponent(s)}`, ...attrs });
  const mVideo = s.match(/\[video:[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/);
  if (mVideo) return video({ controls: true, class: attrs.class || 'post-video', src: `/blob/${encodeURIComponent(mVideo[1])}` });
  const mAudio = s.match(/\[audio:[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/);
  if (mAudio) return audio({ controls: true, class: attrs.class || 'post-audio', src: `/blob/${encodeURIComponent(mAudio[1])}` });
  const mImg = s.match(/!\[[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/);
  if (mImg) return img({ src: `/blob/${encodeURIComponent(mImg[1])}`, class: attrs.class || 'post-image' });
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

const hasAnyTemplateValue = (t) => {
  if (!t || typeof t !== "object") return false;
  return Object.values(t).some((v) => String(v || "").trim());
};

const renderCardField = (labelText, value = "") =>
  div(
    { class: "card-field" },
    span({ class: "card-label" }, labelText),
    span({ class: "card-value" }, ...renderStyledText(String(value ?? "")))
  );

const renderStackedTextField = (lbl, val) =>
  String(val || "").trim()
    ? div(
        { class: "card-field card-field-stacked" },
        span({ class: "card-label" }, lbl),
        span({ class: "card-value" }, ...renderStyledText(String(val)))
      )
    : null;

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

const renderTemplateDetails = (report) => {
  const category = normU(report.category);
  const t = report.template && typeof report.template === "object" ? report.template : {};
  if (!hasAnyTemplateValue(t)) return null;

  const renderValueField = (lbl, val) =>
    String(val || "").trim()
      ? renderCardField(lbl, String(val))
      : null;

  if (category === "BUGS") {
    return div(
      { class: "report-template" },
      h2({ class: "report-template-title" }, i18n.reportsBugTemplateTitle),
      renderStackedTextField(i18n.reportsStepsToReproduceLabel + ":", t.stepsToReproduce),
      renderStackedTextField(i18n.reportsExpectedBehaviorLabel + ":", t.expectedBehavior),
      renderStackedTextField(i18n.reportsActualBehaviorLabel + ":", t.actualBehavior),
      renderStackedTextField(i18n.reportsEnvironmentLabel + ":", t.environment),
      renderValueField(i18n.reportsReproduceRateLabel + ":", t.reproduceRate)
    );
  }

  if (category === "FEATURES") {
    return div(
      { class: "report-template" },
      h2({ class: "report-template-title" }, i18n.reportsFeatureTemplateTitle),
      renderStackedTextField(i18n.reportsProblemStatementLabel + ":", t.problemStatement),
      renderStackedTextField(i18n.reportsUserStoryLabel + ":", t.userStory),
      renderStackedTextField(i18n.reportsAcceptanceCriteriaLabel + ":", t.acceptanceCriteria)
    );
  }

  if (category === "ABUSE") {
    return div(
      { class: "report-template" },
      h2({ class: "report-template-title" }, i18n.reportsAbuseTemplateTitle),
      renderStackedTextField(i18n.reportsWhatHappenedLabel + ":", t.whatHappened),
      renderStackedTextField(i18n.reportsReportedUserLabel + ":", t.reportedUser),
      renderStackedTextField(i18n.reportsEvidenceLinksLabel + ":", t.evidenceLinks)
    );
  }

  if (category === "CONTENT") {
    return div(
      { class: "report-template" },
      h2({ class: "report-template-title" }, i18n.reportsContentTemplateTitle),
      renderStackedTextField(i18n.reportsContentLocationLabel + ":", t.contentLocation),
      renderStackedTextField(i18n.reportsWhyInappropriateLabel + ":", t.whyInappropriate),
      renderStackedTextField(i18n.reportsEvidenceLinksLabel + ":", t.evidenceLinks)
    );
  }

  return null;
};

const renderReportCommentsSection = (reportId, comments = []) => {
  return renderSharedCommentsSection({
    action: `/reports/${encodeURIComponent(reportId)}/comments`,
    comments: comments,
    returnTo: null
  });
};

const renderTemplateForCategory = (category, templateData = {}) => {
  const cat = normU(category || "FEATURES");
  const t = templateData && typeof templateData === "object" ? templateData : {};
  const tval = (k) => String(t[k] || "");
  const reproduceRateVal = normU(t.reproduceRate || "");

  if (cat === "BUGS") {
    return div(
      { class: "report-template-block" },
      h2({ class: "report-template-title" }, i18n.reportsBugTemplateTitle),
      label(i18n.reportsStepsToReproduceLabel),
      br(),
      textarea({ maxlength: "5000", name: "stepsToReproduce", rows: "4", placeholder: i18n.reportsStepsToReproducePlaceholder }, tval("stepsToReproduce")),
      br(),
      label(i18n.reportsExpectedBehaviorLabel),
      br(),
      textarea({ maxlength: "5000", name: "expectedBehavior", rows: "3", placeholder: i18n.reportsExpectedBehaviorPlaceholder }, tval("expectedBehavior")),
      br(),
      label(i18n.reportsActualBehaviorLabel),
      br(),
      textarea({ maxlength: "5000", name: "actualBehavior", rows: "3", placeholder: i18n.reportsActualBehaviorPlaceholder }, tval("actualBehavior")),
      br(),
      label(i18n.reportsEnvironmentLabel),
      br(),
      textarea({ maxlength: "5000", name: "environment", rows: "3", placeholder: i18n.reportsEnvironmentPlaceholder }, tval("environment")),
      br(),
      label(i18n.reportsReproduceRateLabel),
      br(),
      select(
        { name: "reproduceRate" },
        opt("", !reproduceRateVal, i18n.reportsReproduceRateUnknown),
        opt("ALWAYS", reproduceRateVal === "ALWAYS", i18n.reportsReproduceRateAlways),
        opt("OFTEN", reproduceRateVal === "OFTEN", i18n.reportsReproduceRateOften),
        opt("SOMETIMES", reproduceRateVal === "SOMETIMES", i18n.reportsReproduceRateSometimes),
        opt("RARELY", reproduceRateVal === "RARELY", i18n.reportsReproduceRateRarely),
        opt("UNABLE", reproduceRateVal === "UNABLE", i18n.reportsReproduceRateUnable)
      )
    );
  }

  if (cat === "CONTENT") {
    return div(
      { class: "report-template-block" },
      h2({ class: "report-template-title" }, i18n.reportsContentTemplateTitle),
      label(i18n.reportsContentLocationLabel),
      br(),
      textarea({ maxlength: "5000", name: "contentLocation", rows: "3", placeholder: i18n.reportsContentLocationPlaceholder }, tval("contentLocation")),
      br(),
      label(i18n.reportsWhyInappropriateLabel),
      br(),
      textarea({ maxlength: "5000", name: "whyInappropriate", rows: "4", placeholder: i18n.reportsWhyInappropriatePlaceholder }, tval("whyInappropriate")),
      br(),
      label(i18n.reportsEvidenceLinksLabel),
      br(),
      textarea({ maxlength: "5000", name: "evidenceLinks", rows: "3", placeholder: i18n.reportsEvidenceLinksPlaceholder }, tval("evidenceLinks"))
    );
  }

  return div(
    { class: "report-template-block" },
    h2({ class: "report-template-title" }, i18n.reportsFeatureTemplateTitle),
    label(i18n.reportsProblemStatementLabel),
    br(),
    textarea({ maxlength: "5000", name: "problemStatement", rows: "4", placeholder: i18n.reportsProblemStatementPlaceholder }, tval("problemStatement")),
    br(),
    label(i18n.reportsUserStoryLabel),
    br(),
    textarea({ maxlength: "5000", name: "userStory", rows: "3", placeholder: i18n.reportsUserStoryPlaceholder }, tval("userStory")),
    br(),
    label(i18n.reportsAcceptanceCriteriaLabel),
    br(),
    textarea({ maxlength: "5000", name: "acceptanceCriteria", rows: "4", placeholder: i18n.reportsAcceptanceCriteriaPlaceholder }, tval("acceptanceCriteria"))
  );
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

  const chips = [
    renderReportStatusChip(report.status),
    renderReportSeverityChip(report.severity),
    renderReportCategoryChip(report.category),
    renderLifespanChip(report.lifetime, i18n)
  ].filter(Boolean);

  return div({ class: "tribe-card report-card" },
    div({ class: "card-header activity-card-header" },
      span(),
      renderContentActions(report.id, `/reports/${encodeURIComponent(report.id)}`, { spread: spreadInfo || null, author: report.author, favKind: 'reports', isFavorite: report.isFavorite, reportTitle: report.title, report: false })
    ),
    div({ class: "tribe-card-body" },
      div({ class: "shop-title-row" },
        h2({ class: "tribe-card-title" },
          a({ href: `/reports/${encodeURIComponent(report.id)}` }, report.title || i18n.reportsTitle)
        )
      ),
      chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
      div({ class: "tribe-card-members" },
        span({ class: "tribe-members-count" }, `${i18n.reportsConfirmations}: ${confirmations.length}`)
      )
    )
  );
};

const reportChipFor = (filter, censusReports) => (mode) => {
  if (mode === filter || mode === "all") return true;
  if (!Array.isArray(censusReports)) return true;
  if (mode === "top") return censusReports.length > 0;
  const dayAgoReports = Date.now() - 86400000;
  if (mode === "mine") return censusReports.some((r) => r.author === userId);
  if (mode === "recent") return censusReports.some((r) => new Date(r.createdAt).getTime() >= dayAgoReports);
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

  const selectedTemplate = reportToEdit?.template && typeof reportToEdit.template === "object" ? reportToEdit.template : {};
  const applyLabel = i18n.apply || "Apply";
  const sev = String(formData.severity || "low");
  const hiddenDescription = String(reportToEdit?.description || "");

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
          ...chipBtn("mine", i18n.reportsFilterMine),
          ...chipBtn("recent", i18n.reportsFilterRecent),
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
                    { id: "report-category-form", method: "GET", action: "/reports" },
                    input({ type: "hidden", name: "filter", value: "create" }),
                    div({ class: "apply-row" },
                      select(
                        { name: "category", class: "report-category-select" },
                        opt("FEATURES", selectedCategory === "FEATURES", i18n.reportsCategoryFeatures),
                        opt("BUGS", selectedCategory === "BUGS", i18n.reportsCategoryBugs),
                        opt("CONTENT", selectedCategory === "CONTENT", i18n.reportsCategoryContent)
                      ),
                      button({ type: "submit", class: "create-button" }, applyLabel)
                    )
                  ),
                  hr({ class: "form-sep" }),
                  h2({ class: "report-category-fixed" }, selectedCategory),
                  form(
                    { id: "report-create-form", action: "/reports/create", method: "POST", enctype: "multipart/form-data" },
                    input({ type: "hidden", name: "category", value: selectedCategory }),
                    input({ type: "hidden", name: "description", value: "" }),
                    label(i18n.reportsTitleLabel),
                    br(),
                    input({ type: "text", name: "title", maxlength: "100", required: true, value: params.prefillTitle || "" }),
                    br(),
                    renderTemplateForCategory(selectedCategory, params.draft || {}),
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
                    input({ type: "hidden", name: "description", value: hiddenDescription }),
                    label(i18n.reportsCategory),
                    br(),
                    select(
                      { name: "category", required: true },
                      opt("FEATURES", selectedCategory === "FEATURES", i18n.reportsCategoryFeatures),
                      opt("BUGS", selectedCategory === "BUGS", i18n.reportsCategoryBugs),
                      opt("CONTENT", selectedCategory === "CONTENT", i18n.reportsCategoryContent)
                    ),
                    br(),
                    renderTemplateForCategory(selectedCategory, selectedTemplate),
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
          ? div({ class: "jobs-grid" }, filtered.map((r) => renderReportCard(r, userId, filter, params.spreadMap && params.spreadMap.get(r.id))))
          : div({ class: "no-content-box" }, p(i18n.reportsNoItems))
    )
  );
};

exports.singleReportView = async (report, filter, comments = [], params = {}) => {
  const reportChip = (mode) => reportChipFor(filter, Array.isArray(params.censusList) ? params.censusList : null)(mode);
  const btnClass = (v) => (filter === v ? "filter-btn active" : "filter-btn");
  const confirmations = Array.isArray(report.confirmations) ? report.confirmations : [];
  const isAuthor = String(report.author) === String(userId);
  const details = renderTemplateDetails(report);

  const chips = [
    renderReportStatusChip(report.status),
    renderReportSeverityChip(report.severity),
    renderReportCategoryChip(report.category),
    renderLifespanChip(report.lifetime, i18n),
    renderEcoTax(report.msgSize, report.id)
  ].filter(Boolean);

  const sideActions = [];
  sideActions.push(form({ method: "POST", action: `/reports/confirm/${encodeURIComponent(report.id)}` },
    button({ type: "submit", class: "tribe-action-btn" }, i18n.reportsConfirmButton)
  ));
  const ownerActions = [];
  if (isAuthor) {
    ownerActions.push(form({ method: "GET", action: `/reports/edit/${encodeURIComponent(report.id)}` },
      button({ type: "submit", class: "tribe-action-btn" }, i18n.reportsUpdateButton)
    ));
    ownerActions.push(form({ method: "POST", action: `/reports/delete/${encodeURIComponent(report.id)}` },
      button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.reportsDeleteButton)
    ));
  }

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

  const reportSide = div({ class: "tribe-side" },
    div({ class: "card-header activity-card-header" },
      renderContentActions(report.id, null, { spread: params.spreads || null, author: report.author, favKind: 'reports', isFavorite: report.isFavorite, reportTitle: report.title, report: false })
    ),
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, report.title)
    ),
    chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
    table({ class: "tribe-info-table jobs-info-table" }, ...infoRows),
    tagsNode,
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.reportsConfirmations}: ${confirmations.length}`)
    ),
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null,
    isAuthor
      ? div({ class: "tribe-side-actions housing-status-row" },
          span({ class: "card-label" }, `${i18n.reportsStatus}: `),
          renderStateChip(normalizeStatus(report.status) === "RESOLVED" ? "mutuals" : "whole", "◆", String(report.status || "OPEN").toUpperCase()),
          renderReportStatusSetter(report)
        )
      : null,
    ownerActions.length ? div({ class: "tribe-side-actions owner-actions" }, ...ownerActions) : null,
    renderDocumentActions('reports', report.id, [
      a({ href: "/tasks?filter=create", class: "filter-btn" }, i18n.reportsCreateTaskButton)
    ])
  );

  const opinionsBar = renderOpinionsVoting('/reports/opinions', report.id, report.opinions, null, report.opinions_inhabitants);

  const reportMain = div({ class: "tribe-main" },
    details ? div({ class: "job-section" }, details) : null,
    renderPhotoGallery(report, 'report'),
    p({ class: "card-footer" },
      span({ class: "date-link" }, `${moment(report.createdAt).format("YYYY/MM/DD HH:mm")} ${i18n.performed} `),
      userLink(report.author)
    ),
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
          ...(reportChip("mine") ? [button({ type: "submit", name: "filter", value: "mine", class: btnClass("mine") }, String(i18n.reportsFilterMine).toUpperCase())] : []),
          ...(reportChip("recent") ? [button({ type: "submit", name: "filter", value: "recent", class: btnClass("recent") }, String(i18n.reportsFilterRecent).toUpperCase())] : []),
          button({ type: "submit", name: "filter", value: "top", class: btnClass("top") }, String(i18n.reportsFilterTop).toUpperCase()),
          ...(reportChip("features") ? [button({ type: "submit", name: "filter", value: "features", class: btnClass("features") }, String(i18n.reportsFilterFeatures).toUpperCase())] : []),
          ...(reportChip("bugs") ? [button({ type: "submit", name: "filter", value: "bugs", class: btnClass("bugs") }, String(i18n.reportsFilterBugs).toUpperCase())] : []),
          ...(reportChip("content") ? [button({ type: "submit", name: "filter", value: "content", class: btnClass("content") }, String(i18n.reportsFilterContent).toUpperCase())] : []),
          ...(reportChip("confirmed") ? [button({ type: "submit", name: "filter", value: "confirmed", class: btnClass("confirmed") }, String(i18n.reportsFilterConfirmed).toUpperCase())] : []),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.reportsCreateButton)
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
          ...(reportChip("sev_critical") ? [button({ type: "submit", name: "filter", value: "sev_critical", class: btnClass("sev_critical") }, String(i18n.reportsSeverityCritical).toUpperCase())] : [])
        )
      ),
      div({ class: "tribe-details" }, reportSide, reportMain)
    )
  );
};

