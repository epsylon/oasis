const { div, h2, p, section, button, form, a, textarea, br, input, img, span, label, select, option } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require("./main_views");
const { config } = require("../server/SSB_server.js");
const moment = require("../server/node_modules/moment");
const { renderUrl } = require("../backend/renderUrl");

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
        br(),
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

const renderReportOwnerActions = (report, currentFilter) => {
  const st = normalizeStatus(report && report.status ? report.status : "OPEN");

  return div(
    { class: "bookmark-actions report-actions" },
    form(
      { method: "GET", action: `/reports/edit/${encodeURIComponent(report.id)}` },
      button({ type: "submit", class: "update-btn" }, i18n.reportsUpdateButton)
    ),
    form(
      { method: "POST", action: `/reports/delete/${encodeURIComponent(report.id)}` },
      button({ type: "submit", class: "delete-btn" }, i18n.reportsDeleteButton)
    ),
    form(
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
    )
  );
};

const renderReportTopbar = (report, currentFilter, isSingle) => {
  const isAuthor = report && String(report.author) === String(userId);

  const leftActions = [];

  if (!isSingle) {
    leftActions.push(
      form(
        { method: "GET", action: `/reports/${encodeURIComponent(report.id)}` },
        input({ type: "hidden", name: "filter", value: currentFilter }),
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      )
    );
  }

  const pm = renderPmButton(report && report.author);
  if (pm) leftActions.push(pm);

  const leftNode = leftActions.length ? div({ class: "bookmark-topbar-left report-topbar-left" }, ...leftActions) : null;
  const rightNode = isAuthor ? renderReportOwnerActions(report, currentFilter) : null;

  const nodes = [];
  if (leftNode) nodes.push(leftNode);
  if (rightNode) nodes.push(rightNode);

  return nodes.length ? div({ class: isSingle ? "bookmark-topbar report-topbar-single" : "bookmark-topbar" }, ...nodes) : null;
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
          class: "comment-form"
        },
        textarea({
          id: "comment-text",
          name: "text",
          required: true,
          rows: 4,
          class: "comment-textarea",
          placeholder: i18n.voteNewCommentPlaceholder
        }),
        br(),
        button({ type: "submit", class: "comment-submit-btn" }, i18n.voteNewCommentButton)
      )
    ),
    comments && comments.length
      ? div(
          { class: "comments-list" },
          comments.map((c) => {
            const author = c.value && c.value.author ? c.value.author : "";
            const ts = c.value && c.value.timestamp ? c.value.timestamp : c.timestamp;
            const absDate = ts ? moment(ts).format("YYYY/MM/DD HH:mm:ss") : "";
            const relDate = ts ? moment(ts).fromNow() : "";
            const userName = author && author.includes("@") ? author.split("@")[1] : author;

            const content = c.value && c.value.content ? c.value.content : {};
            const root = content.fork || content.root || "";
            const text = content.text || "";

            return div(
              { class: "votations-comment-card" },
              span(
                { class: "created-at" },
                span(i18n.createdBy),
                author ? a({ href: `/author/${encodeURIComponent(author)}` }, `@${userName}`) : span("(unknown)"),
                absDate ? span(" | ") : "",
                absDate ? span({ class: "votations-comment-date" }, absDate) : "",
                relDate ? span({ class: "votations-comment-date" }, " | ", i18n.sendTime) : "",
                relDate && root ? a({ href: `/thread/${encodeURIComponent(root)}#${encodeURIComponent(c.key)}` }, relDate) : ""
              ),
              p({ class: "votations-comment-text" }, ...renderUrl(text))
            );
          })
        )
      : p({ class: "votations-no-comments" }, i18n.voteNoCommentsYet)
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

const renderReportCard = (report, userId, currentFilter = "all") => {
  const confirmations = Array.isArray(report.confirmations) ? report.confirmations : [];
  const commentCount = typeof report.commentCount === "number" ? report.commentCount : 0;
  const severity = normU(report.severity || "low");

  const topbar = renderReportTopbar(report, currentFilter, false);
  const details = renderTemplateDetails(report);

  return div(
    { class: "card card-section report" },
    topbar ? topbar : null,
    renderCardField(i18n.reportsTitleLabel + ":", report.title),
    renderCardField(i18n.reportsStatus + ":", report.status),
    renderCardField(i18n.reportsSeverity + ":", severity),
    renderCardField(i18n.reportsCategory + ":", report.category),
    report.image ? br() : null,
    report.image ? div({ class: "card-field" }, img({ src: `/blob/${encodeURIComponent(report.image)}`, class: "report-image" })) : null,
    report.image && details ? br() : null,
    details ? details : null,
    br(),
    renderCardField(i18n.reportsConfirmations + ":", confirmations.length),
    br(),
    form({ method: "POST", action: `/reports/confirm/${encodeURIComponent(report.id)}` }, button({ type: "submit" }, i18n.reportsConfirmButton)),
    a({ href: "/tasks?filter=create", target: "_blank" }, button({ type: "button" }, i18n.reportsCreateTaskButton)),
    br(),
    br(),
    report.tags && report.tags.length
      ? div(
          { class: "card-tags" },
          report.tags.map((tag) => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`))
        )
      : null,
    div(
      { class: "card-comments-summary" },
      span({ class: "card-label" }, i18n.voteCommentsLabel + ":"),
      span({ class: "card-value" }, String(commentCount)),
      br(),
      br(),
      form(
        { method: "GET", action: `/reports/${encodeURIComponent(report.id)}` },
        input({ type: "hidden", name: "filter", value: currentFilter }),
        button({ type: "submit", class: "filter-btn" }, i18n.voteCommentsForumButton)
      )
    ),
    br(),
    p(
      { class: "card-footer" },
      span({ class: "date-link" }, `${moment(report.createdAt).format("YYYY-MM-DD HH:mm")} ${i18n.performed} `),
      a({ class: "user-link", href: `/author/${encodeURIComponent(report.author)}` }, report.author)
    )
  );
};

exports.reportView = async (reports, filter, reportId, createCategory) => {
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
                    button({ type: "submit", class: "filter-btn" }, applyLabel)
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
                    button({ type: "submit" }, i18n.reportsCreateButton)
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
        : div(
            { class: "report-list" },
            filtered.length > 0 ? filtered.map((r) => renderReportCard(r, userId, filter)) : p(i18n.reportsNoItems)
          )
    )
  );
};

exports.singleReportView = async (report, filter, comments = []) => {
  const btnClass = (v) => (filter === v ? "filter-btn active" : "filter-btn");
  const confirmations = Array.isArray(report.confirmations) ? report.confirmations : [];
  const severity = normU(report.severity || "low");

  const topbar = renderReportTopbar(report, filter || "all", true);
  const details = renderTemplateDetails(report);

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
      div(
        { class: "card card-section report" },
        topbar ? topbar : null,
        renderCardField(i18n.reportsTitleLabel + ":", report.title),
        renderCardField(i18n.reportsStatus + ":", report.status),
        renderCardField(i18n.reportsSeverity + ":", severity),
        renderCardField(i18n.reportsCategory + ":", report.category),
        report.image ? br() : null,
        report.image ? div({ class: "card-field" }, img({ src: `/blob/${encodeURIComponent(report.image)}`, class: "report-image" })) : null,
        report.image && details ? br() : null,
        details ? details : null,
        br(),
        renderCardField(i18n.reportsConfirmations + ":", confirmations.length),
        br(),
        form({ method: "POST", action: `/reports/confirm/${encodeURIComponent(report.id)}` }, button({ type: "submit" }, i18n.reportsConfirmButton)),
        a({ href: "/tasks?filter=create", target: "_blank" }, button({ type: "button" }, i18n.reportsCreateTaskButton)),
        br(),
        br(),
        report.tags && report.tags.length
          ? div(
              { class: "card-tags" },
              report.tags.map((tag) => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`))
            )
          : null,
        br(),
        p(
          { class: "card-footer" },
          span({ class: "date-link" }, `${moment(report.createdAt).format("YYYY-MM-DD HH:mm")} ${i18n.performed} `),
          a({ class: "user-link", href: `/author/${encodeURIComponent(report.author)}` }, report.author)
        )
      ),
      renderReportCommentsSection(report.id, comments)
    )
  );
};

