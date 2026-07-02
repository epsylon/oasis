const { div, h2, p, section, button, form, a, textarea, br, input, img, span, label, select, option, video, audio, table, tr, td } = require("../server/node_modules/hyperaxe");
const { template, i18n, renderOpinionsVoting, userLink, renderStateChip, renderLifespanChip, renderEcoTax, renderSpreadButton } = require("./main_views");
const { config } = require("../server/SSB_server.js");
const moment = require("../server/node_modules/moment");
const { renderUrl } = require("../backend/renderUrl");

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

const opt = (value, isSelected, text) =>
  option(Object.assign({ value }, isSelected ? { selected: "selected" } : {}), text);

const hasAnyTemplateValue = (t) => {
  if (!t || typeof t !== "object") return false;
  return Object.values(t).some((v) => String(v || "").trim());
};

const renderCardField = (labelText, value = "") =>
  div(
    { class: "card-field" },
    span({ class: "card-label" }, labelText),
    span({ class: "card-value" }, ...renderUrl(String(value ?? "")))
  );

const renderStackedTextField = (lbl, val) =>
  String(val || "").trim()
    ? div(
        { class: "card-field card-field-stacked" },
        span({ class: "card-label" }, lbl),
        span({ class: "card-value" }, ...renderUrl(String(val)))
      )
    : null;

const renderPmButton = (recipientId) =>
  recipientId && String(recipientId) !== String(userId)
    ? form(
        { method: "GET", action: "/pm" },
        input({ type: "hidden", name: "recipients", value: recipientId }),
        button({ type: "submit", class: "filter-btn" }, i18n.privateMessage)
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
      renderStackedTextField(i18n.reportsRequestedActionLabel + ":", t.requestedAction),
      renderStackedTextField(i18n.reportsEvidenceLinksLabel + ":", t.evidenceLinks)
    );
  }

  return null;
};

const renderReportCommentsSection = (reportId, comments = []) => {
  const commentsCount = Array.isArray(comments) ? comments.length : 0;

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
        {
          method: "POST",
          action: `/reports/${encodeURIComponent(reportId)}/comments`,
          class: "comment-form",
          enctype: "multipart/form-data"
        },
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
    (() => {
      const visibleComments = (comments || []).filter(c => {
        const t = c && c.value && c.value.content && c.value.content.text;
        return t && String(t).trim();
      });
      return visibleComments.length
      ? div(
          { class: "comments-list" },
          visibleComments.map((c) => {
            const author = c.value && c.value.author ? c.value.author : "";
            const ts = c.value && c.value.timestamp ? c.value.timestamp : c.timestamp;
            const absDate = ts ? moment(ts).format("YYYY/MM/DD HH:mm:ss") : "";
            const relDate = ts ? moment(ts).fromNow() : "";

            const content = c.value && c.value.content ? c.value.content : {};
            const root = content.fork || content.root || "";
            const text = content.text || "";

            return div(
              { class: "votations-comment-card" },
              span(
                { class: "created-at" },
                span(i18n.createdBy),
                author ? userLink(author) : span("(unknown)"),
                absDate ? span(" | ") : "",
                absDate ? span({ class: "votations-comment-date" }, absDate) : "",
                relDate ? span({ class: "votations-comment-date" }, " | ", i18n.sendTime) : "",
                relDate && root ? a({ href: `/thread/${encodeURIComponent(root)}#${encodeURIComponent(c.key)}` }, relDate) : ""
              ),
              p({ class: "votations-comment-text" }, ...renderUrl(text))
            );
          })
        )
      : p({ class: "votations-no-comments" }, i18n.voteNoCommentsYet);
    })()
  );
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
      textarea({ name: "stepsToReproduce", rows: "4", placeholder: i18n.reportsStepsToReproducePlaceholder }, tval("stepsToReproduce")),
      br(),
      br(),
      label(i18n.reportsExpectedBehaviorLabel),
      br(),
      textarea({ name: "expectedBehavior", rows: "3", placeholder: i18n.reportsExpectedBehaviorPlaceholder }, tval("expectedBehavior")),
      br(),
      br(),
      label(i18n.reportsActualBehaviorLabel),
      br(),
      textarea({ name: "actualBehavior", rows: "3", placeholder: i18n.reportsActualBehaviorPlaceholder }, tval("actualBehavior")),
      br(),
      br(),
      label(i18n.reportsEnvironmentLabel),
      br(),
      textarea({ name: "environment", rows: "3", placeholder: i18n.reportsEnvironmentPlaceholder }, tval("environment")),
      br(),
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

  if (cat === "ABUSE") {
    return div(
      { class: "report-template-block" },
      h2({ class: "report-template-title" }, i18n.reportsAbuseTemplateTitle),
      label(i18n.reportsWhatHappenedLabel),
      br(),
      textarea({ name: "whatHappened", rows: "4", placeholder: i18n.reportsWhatHappenedPlaceholder }, tval("whatHappened")),
      br(),
      br(),
      label(i18n.reportsReportedUserLabel),
      br(),
      textarea({ name: "reportedUser", rows: "2", placeholder: i18n.reportsReportedUserPlaceholder }, tval("reportedUser")),
      br(),
      br(),
      label(i18n.reportsEvidenceLinksLabel),
      br(),
      textarea({ name: "evidenceLinks", rows: "3", placeholder: i18n.reportsEvidenceLinksPlaceholder }, tval("evidenceLinks"))
    );
  }

  if (cat === "CONTENT") {
    return div(
      { class: "report-template-block" },
      h2({ class: "report-template-title" }, i18n.reportsContentTemplateTitle),
      label(i18n.reportsContentLocationLabel),
      br(),
      textarea({ name: "contentLocation", rows: "3", placeholder: i18n.reportsContentLocationPlaceholder }, tval("contentLocation")),
      br(),
      br(),
      label(i18n.reportsWhyInappropriateLabel),
      br(),
      textarea({ name: "whyInappropriate", rows: "4", placeholder: i18n.reportsWhyInappropriatePlaceholder }, tval("whyInappropriate")),
      br(),
      br(),
      label(i18n.reportsRequestedActionLabel),
      br(),
      textarea({ name: "requestedAction", rows: "3", placeholder: i18n.reportsRequestedActionPlaceholder }, tval("requestedAction")),
      br(),
      br(),
      label(i18n.reportsEvidenceLinksLabel),
      br(),
      textarea({ name: "evidenceLinks", rows: "3", placeholder: i18n.reportsEvidenceLinksPlaceholder }, tval("evidenceLinks"))
    );
  }

  return div(
    { class: "report-template-block" },
    h2({ class: "report-template-title" }, i18n.reportsFeatureTemplateTitle),
    label(i18n.reportsProblemStatementLabel),
    br(),
    textarea({ name: "problemStatement", rows: "4", placeholder: i18n.reportsProblemStatementPlaceholder }, tval("problemStatement")),
    br(),
    br(),
    label(i18n.reportsUserStoryLabel),
    br(),
    textarea({ name: "userStory", rows: "3", placeholder: i18n.reportsUserStoryPlaceholder }, tval("userStory")),
    br(),
    br(),
    label(i18n.reportsAcceptanceCriteriaLabel),
    br(),
    textarea({ name: "acceptanceCriteria", rows: "4", placeholder: i18n.reportsAcceptanceCriteriaPlaceholder }, tval("acceptanceCriteria"))
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
    div({ class: "tribe-card-body" },
      div({ class: "shop-title-row" },
        h2({ class: "tribe-card-title" },
          a({ href: `/reports/${encodeURIComponent(report.id)}` }, report.title || i18n.reportsTitle)
        )
      ),
      chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
      div({ class: "tribe-card-members" },
        span({ class: "tribe-members-count" }, `${i18n.reportsConfirmations}: ${confirmations.length}`)
      ),
      div({ class: "card-spread-centered" }, renderSpreadButton(report.id, spreadInfo)),
      div({ class: "card-visit-btn-centered" },
        form({ method: "GET", action: `/reports/${encodeURIComponent(report.id)}` },
          input({ type: "hidden", name: "filter", value: currentFilter }),
          button({ type: "submit", class: "filter-btn" }, i18n.viewReport || "View Report")
        )
      )
    )
  );
};

exports.reportView = async (reports, filter, reportId, createCategory, params = {}) => {
  const title =
    filter === "create" ? i18n.reportsCreateButton :
    filter === "edit" ? i18n.reportsUpdateButton :
    filter === "mine" ? i18n.reportsMineSectionTitle :
    filter === "features" ? i18n.reportsFeaturesSectionTitle :
    filter === "bugs" ? i18n.reportsBugsSectionTitle :
    filter === "abuse" ? i18n.reportsAbuseSectionTitle :
    filter === "content" ? i18n.reportsContentSectionTitle :
    filter === "confirmed" ? i18n.reportsConfirmedSectionTitle :
    filter === "open" ? i18n.reportsOpenSectionTitle :
    filter === "under_review" ? i18n.reportsUnderReviewSectionTitle :
    filter === "resolved" ? i18n.reportsResolvedSectionTitle :
    filter === "invalid" ? i18n.reportsInvalidSectionTitle :
    i18n.reportsAllSectionTitle;

  let filtered = Array.isArray(reports) ? reports : [];

  if (filter === "mine") {
    filtered = filtered.filter((r) => r.author === userId);
  } else if (filter === "confirmed") {
    filtered = filtered.filter((r) => Array.isArray(r.confirmations) && r.confirmations.includes(userId));
  } else if (CATEGORY_BY_FILTER[filter]) {
    const wanted = CATEGORY_BY_FILTER[filter];
    filtered = filtered.filter((r) => normU(r.category) === wanted);
  } else if (STATUS_BY_FILTER[filter]) {
    const wanted = STATUS_BY_FILTER[filter];
    filtered = filtered.filter((r) => normalizeStatus(r.status) === wanted);
  }

  filtered = filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const reportToEdit = filter === "edit"
    ? (Array.isArray(reports) ? reports.find((r) => r.id === reportId) : null)
    : null;

  const btnClass = (v) => (filter === v ? "filter-btn active" : "filter-btn");

  const selectedCategory = normU(
    filter === "create"
      ? (createCategory || "FEATURES")
      : (reportToEdit?.category || "FEATURES")
  );

  const selectedTemplate = reportToEdit?.template && typeof reportToEdit.template === "object" ? reportToEdit.template : {};
  const applyLabel = i18n.apply || "Apply";
  const sev = String(reportToEdit?.severity || "low");
  const hiddenDescription = String(reportToEdit?.description || "");

  return template(
    title,
    section(
      div(
        { class: "tags-header" },
        h2(i18n.reportsTitle),
        p(i18n.reportsDescription)
      ),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/reports" },
          button({ type: "submit", name: "filter", value: "all", class: btnClass("all") }, i18n.reportsFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: btnClass("mine") }, i18n.reportsFilterMine),
          button({ type: "submit", name: "filter", value: "features", class: btnClass("features") }, i18n.reportsFilterFeatures),
          button({ type: "submit", name: "filter", value: "bugs", class: btnClass("bugs") }, i18n.reportsFilterBugs),
          button({ type: "submit", name: "filter", value: "abuse", class: btnClass("abuse") }, i18n.reportsFilterAbuse),
          button({ type: "submit", name: "filter", value: "content", class: btnClass("content") }, i18n.reportsFilterContent),
          button({ type: "submit", name: "filter", value: "confirmed", class: btnClass("confirmed") }, i18n.reportsFilterConfirmed),
          button({ type: "submit", name: "filter", value: "open", class: btnClass("open") }, i18n.reportsFilterOpen),
          button({ type: "submit", name: "filter", value: "under_review", class: btnClass("under_review") }, i18n.reportsFilterUnderReview),
          button({ type: "submit", name: "filter", value: "resolved", class: btnClass("resolved") }, i18n.reportsFilterResolved),
          button({ type: "submit", name: "filter", value: "invalid", class: btnClass("invalid") }, i18n.reportsFilterInvalid),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.reportsCreateButton)
        )
      )
    ),
    section(
      filter === "edit" || filter === "create"
        ? div(
            { class: "report-form" },
            filter === "create"
              ? div(
                  label(i18n.reportsTitleLabel),
                  br(),
                  input({ type: "text", name: "title", required: true, value: "", form: "report-create-form" }),
                  br(),
                  br(),
                  form(
                    { id: "report-category-form", method: "GET", action: "/reports" },
                    input({ type: "hidden", name: "filter", value: "create" }),
                    label(i18n.reportsCategory),
                    br(),
                    select(
                      { name: "category" },
                      opt("FEATURES", selectedCategory === "FEATURES", i18n.reportsCategoryFeatures),
                      opt("BUGS", selectedCategory === "BUGS", i18n.reportsCategoryBugs),
                      opt("ABUSE", selectedCategory === "ABUSE", i18n.reportsCategoryAbuse),
                      opt("CONTENT", selectedCategory === "CONTENT", i18n.reportsCategoryContent)
                    ),
                    br(),
                    br(),
                    button({ type: "submit", class: "create-button" }, applyLabel)
                  ),
                  br(),
                  h2({ class: "report-category-fixed" }, selectedCategory),
                  br(),
                  form(
                    { id: "report-create-form", action: "/reports/create", method: "POST", enctype: "multipart/form-data" },
                    input({ type: "hidden", name: "category", value: selectedCategory }),
                    input({ type: "hidden", name: "description", value: "" }),
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
                    h2({ class: "report-template-main-title" }, i18n.reportsTemplateSectionTitle),
                    renderTemplateForCategory(selectedCategory, {}),
                    label(i18n.reportsUploadFile),
                    br(),
                    input({ type: "file", name: "image" }),
                    br(),
                    br(),
                    label("Tags"),
                    br(),
                    input({ type: "text", name: "tags", value: "" }),
                    br(),
                    br(),
                    button({ type: "submit", class: "create-button" }, i18n.reportsCreateButton)
                  )
                )
              : div(
                  form(
                    { id: "report-edit-form", action: `/reports/update/${encodeURIComponent(reportId)}`, method: "POST", enctype: "multipart/form-data" },
                    label(i18n.reportsTitleLabel),
                    br(),
                    input({ type: "text", name: "title", required: true, value: reportToEdit?.title || "" }),
                    br(),
                    br(),
                    input({ type: "hidden", name: "description", value: hiddenDescription }),
                    label(i18n.reportsCategory),
                    br(),
                    select(
                      { name: "category", required: true },
                      opt("FEATURES", selectedCategory === "FEATURES", i18n.reportsCategoryFeatures),
                      opt("BUGS", selectedCategory === "BUGS", i18n.reportsCategoryBugs),
                      opt("ABUSE", selectedCategory === "ABUSE", i18n.reportsCategoryAbuse),
                      opt("CONTENT", selectedCategory === "CONTENT", i18n.reportsCategoryContent)
                    ),
                    br(),
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
                    h2({ class: "report-template-main-title" }, i18n.reportsTemplateSectionTitle),
                    renderTemplateForCategory(selectedCategory, selectedTemplate),
                    br(),
                    br(),
                    label(i18n.reportsUploadFile),
                    br(),
                    input({ type: "file", name: "image" }),
                    br(),
                    br(),
                    label("Tags"),
                    br(),
                    input({ type: "text", name: "tags", value: reportToEdit?.tags?.join(", ") || "" }),
                    br(),
                    br(),
                    button({ type: "submit" }, i18n.reportsUpdateButton)
                  )
                )
          )
        : filtered.length > 0
          ? div({ class: "jobs-grid" }, filtered.map((r) => renderReportCard(r, userId, filter, params.spreadMap && params.spreadMap.get(r.id))))
          : p(i18n.reportsNoItems)
    )
  );
};

exports.singleReportView = async (report, filter, comments = [], params = {}) => {
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
  const pm = renderPmButton(report.author);
  if (pm) sideActions.push(pm);
  sideActions.push(form({ method: "POST", action: `/reports/confirm/${encodeURIComponent(report.id)}` },
    button({ type: "submit", class: "filter-btn" }, i18n.reportsConfirmButton)
  ));
  sideActions.push(a({ href: "/tasks?filter=create", target: "_blank" },
    button({ type: "button", class: "filter-btn" }, i18n.reportsCreateTaskButton)
  ));
  if (isAuthor) {
    sideActions.push(renderReportStatusSetter(report));
    sideActions.push(form({ method: "GET", action: `/reports/edit/${encodeURIComponent(report.id)}` },
      button({ type: "submit", class: "update-btn" }, i18n.reportsUpdateButton)
    ));
    sideActions.push(form({ method: "POST", action: `/reports/delete/${encodeURIComponent(report.id)}` },
      button({ type: "submit", class: "delete-btn" }, i18n.reportsDeleteButton)
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
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, report.title)
    ),
    chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
    div({ class: "card-spread-centered" }, renderSpreadButton(report.id, params.spreads)),
    table({ class: "tribe-info-table jobs-info-table" }, ...infoRows),
    tagsNode,
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.reportsConfirmations}: ${confirmations.length}`)
    ),
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null
  );

  const opinionsBar = renderOpinionsVoting('/reports/opinions', report.id, report.opinions, null, report.opinions_inhabitants);

  const reportMain = div({ class: "tribe-main" },
    (details || report.image) ? div({ class: "job-section" },
      details || null,
      report.image ? renderMediaBlob(report.image, { class: "report-detail-image" }) : null
    ) : null,
    p({ class: "card-footer" },
      span({ class: "date-link" }, `${moment(report.createdAt).format("YYYY/MM/DD HH:mm")} ${i18n.performed} `),
      userLink(report.author)
    ),
    opinionsBar,
    renderReportCommentsSection(report.id, comments)
  );

  return template(
    report.title,
    section(
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/reports" },
          button({ type: "submit", name: "filter", value: "all", class: btnClass("all") }, i18n.reportsFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: btnClass("mine") }, i18n.reportsFilterMine),
          button({ type: "submit", name: "filter", value: "features", class: btnClass("features") }, i18n.reportsFilterFeatures),
          button({ type: "submit", name: "filter", value: "bugs", class: btnClass("bugs") }, i18n.reportsFilterBugs),
          button({ type: "submit", name: "filter", value: "abuse", class: btnClass("abuse") }, i18n.reportsFilterAbuse),
          button({ type: "submit", name: "filter", value: "content", class: btnClass("content") }, i18n.reportsFilterContent),
          button({ type: "submit", name: "filter", value: "confirmed", class: btnClass("confirmed") }, i18n.reportsFilterConfirmed),
          button({ type: "submit", name: "filter", value: "open", class: btnClass("open") }, i18n.reportsFilterOpen),
          button({ type: "submit", name: "filter", value: "under_review", class: btnClass("under_review") }, i18n.reportsFilterUnderReview),
          button({ type: "submit", name: "filter", value: "resolved", class: btnClass("resolved") }, i18n.reportsFilterResolved),
          button({ type: "submit", name: "filter", value: "invalid", class: btnClass("invalid") }, i18n.reportsFilterInvalid),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.reportsCreateButton)
        )
      ),
      div({ class: "tribe-details" }, reportSide, reportMain)
    )
  );
};

