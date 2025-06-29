const { div, h2, p, section, button, form, a, textarea, br, input, img, span, label, select, option } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const { config } = require('../server/SSB_server.js');
const moment = require('../server/node_modules/moment');

const userId = config.keys.id;

const generateReportActions = (report, userId) => {
  return report.author === userId
    ? div({ class: "report-actions" },
        form({ method: "GET", action: `/reports/edit/${encodeURIComponent(report.id)}` },
          button({ type: "submit", class: "update-btn" }, i18n.reportsUpdateButton)
        ),
        form({ method: "POST", action: `/reports/delete/${encodeURIComponent(report.id)}` },
          button({ type: "submit", class: "delete-btn" }, i18n.reportsDeleteButton)
        ),
        form({ method: "POST", action: `/reports/status/${encodeURIComponent(report.id)}` },
          button({ type: "submit", name: "status", value: "OPEN" }, i18n.reportsStatusOpen), br(),
          button({ type: "submit", name: "status", value: "UNDER_REVIEW" }, i18n.reportsStatusUnderReview), br(),
          button({ type: "submit", name: "status", value: "RESOLVED" }, i18n.reportsStatusResolved), br(),
          button({ type: "submit", name: "status", value: "INVALID" }, i18n.reportsStatusInvalid)
        )
      )
    : null;
};

const generateReportCard = (report, userId) => {
  return div({ class: "report-item" },
    generateReportActions(report, userId),
    h2(report.title),
    form({ method: 'GET', action: `/reports/${encodeURIComponent(report.id)}` },
      button({ type: 'submit', class: 'filter-btn' }, i18n.viewDetails)
    ),
    p(`${i18n.reportsCategory}: ${report.category}`),
    p(`${i18n.reportsSeverity}: ${report.severity}`),
    p(`${i18n.reportsStatus}: ${report.status}`),
    p(`${i18n.reportsDescriptionLabel}: ${report.description}`),
    report.image ? img({ src: `/blob/${encodeURIComponent(report.image)}`, class: "report-image" }) : p(i18n.reportsNoFile),
    p(`${i18n.reportsCreatedAt}: ${moment(report.createdAt).format('YYYY-MM-DD HH:mm')}`),
    p(`${i18n.reportsCreatedBy}: `,
      report.isAnonymous
        ? span({ class: "anonymous-label" }, i18n.reportsAnonymousAuthor)
        : a({ href: `/author/${encodeURIComponent(report.author)}` }, report.author)
    ),
    p(`${i18n.reportsConfirmations}: ${report.confirmations.length}`),
    form({ method: "POST", action: `/reports/confirm/${encodeURIComponent(report.id)}` },
      button({ type: "submit" }, i18n.reportsConfirmButton)
    ),

    a({ href: "/tasks?filter=create", target: "_blank" }, button({ type: "button" }, i18n.reportsCreateTaskButton)), br(), br(),
    report.tags && report.tags.length
      ? div(
          report.tags.map(tag =>
            a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right:0.8em;" }, `#${tag}`)
          )
        ) : null,
    div({ class: "voting-buttons" },
      ["interesting", "necessary", "funny", "disgusting", "sensible", "propaganda", "adultOnly", "boring", "confusing", "inspiring", "spam"].map(category =>
        form({ method: "POST", action: `/reports/opinions/${encodeURIComponent(report.id)}/${category}` },
          button({ class: "vote-btn" }, `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`]} [${report.opinions?.[category] || 0}]`)
        )
      )
    )
  );
};

exports.reportView = async (reports, filter, reportId) => {
  const title =
    filter === 'mine' ? i18n.reportsMineSectionTitle :
    filter === 'features' ? i18n.reportsFeaturesSectionTitle :
    filter === 'bugs' ? i18n.reportsBugsSectionTitle :
    filter === 'abuse' ? i18n.reportsAbuseSectionTitle :
    filter === 'content' ? i18n.reportsContentSectionTitle :
    filter === 'confirmed' ? i18n.reportsConfirmedSectionTitle :
    filter === 'open' ? i18n.reportsOpenSectionTitle :
    filter === 'under_review' ? i18n.reportsUnderReviewSectionTitle :
    filter === 'resolved' ? i18n.reportsResolvedSectionTitle :
    filter === 'invalid' ? i18n.reportsInvalidSectionTitle :
    i18n.reportsAllSectionTitle;

  let filtered =
    filter === 'mine' ? reports.filter(r => r.author === userId) : reports;

  filtered = filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const reportToEdit = filter === 'edit' ? reports.find(r => r.id === reportId) : null;

  return template(
    title,
    section(
      div({ class: "tags-header" },
        h2(i18n.reportsTitle),
        p(i18n.reportsDescription)
      ),
      div({ class: "filters" },
        form({ method: "GET", action: "/reports" },
          button({ type: "submit", name: "filter", value: "all", class: "filter-btn" }, i18n.reportsFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: "filter-btn" }, i18n.reportsFilterMine),
          button({ type: "submit", name: "filter", value: "features", class: "filter-btn" }, i18n.reportsFilterFeatures),
          button({ type: "submit", name: "filter", value: "bugs", class: "filter-btn" }, i18n.reportsFilterBugs),
          button({ type: "submit", name: "filter", value: "abuse", class: "filter-btn" }, i18n.reportsFilterAbuse),
          button({ type: "submit", name: "filter", value: "content", class: "filter-btn" }, i18n.reportsFilterContent),
          button({ type: "submit", name: "filter", value: "confirmed", class: "filter-btn" }, i18n.reportsFilterConfirmed),
          button({ type: "submit", name: "filter", value: "open", class: "filter-btn" }, i18n.reportsFilterOpen),
          button({ type: "submit", name: "filter", value: "under_review", class: "filter-btn" }, i18n.reportsFilterUnderReview),
          button({ type: "submit", name: "filter", value: "resolved", class: "filter-btn" }, i18n.reportsFilterResolved),
          button({ type: "submit", name: "filter", value: "invalid", class: "filter-btn" }, i18n.reportsFilterInvalid),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.reportsCreateButton)
        )
      )
    ),
    section(
      filter === 'edit' || filter === 'create'
        ? div({ class: "report-form" },
            form({ action: filter === 'edit' ? `/reports/update/${encodeURIComponent(reportId)}` : "/reports/create", method: "POST", enctype: "multipart/form-data" },
              label(i18n.reportsTitleLabel), br(),
              input({ type: "text", name: "title", required: true, value: reportToEdit?.title || '' }), br(), br(),

              label(i18n.reportsDescriptionLabel), br(),
              textarea({ name: "description", required: true }, reportToEdit?.description || ''), br(), br(),

              label(i18n.reportsCategory), br(),
              select({ name: "category", required: true },
                option({ value: "FEATURES", selected: reportToEdit?.category === 'FEATURES' }, i18n.reportsCategoryFeatures),
                option({ value: "BUGS", selected: reportToEdit?.category === 'BUGS' }, i18n.reportsCategoryBugs),
                option({ value: "ABUSE", selected: reportToEdit?.category === 'ABUSE' }, i18n.reportsCategoryAbuse),
                option({ value: "CONTENT", selected: reportToEdit?.category === 'CONTENT' }, i18n.reportsCategoryContent)
              ), br(), br(),

              label(i18n.reportsSeverity), br(),
              select({ name: "severity" },
                option({ value: "low", selected: reportToEdit?.severity === 'low' }, i18n.reportsSeverityLow),
                option({ value: "medium", selected: reportToEdit?.severity === 'medium' }, i18n.reportsSeverityMedium),
                option({ value: "high", selected: reportToEdit?.severity === 'high' }, i18n.reportsSeverityHigh),
                option({ value: "critical", selected: reportToEdit?.severity === 'critical' }, i18n.reportsSeverityCritical)
              ), br(), br(),

              label(i18n.reportsUploadFile), br(),
              input({ type: "file", name: "image" }), br(), br(),

              label("Tags"), br(),
              input({ type: "text", name: "tags", value: reportToEdit?.tags?.join(', ') || '' }), br(), br(),

              label(i18n.reportsAnonymityOption),
              input({ type: "checkbox", name: "isAnonymous", checked: reportToEdit?.isAnonymous || false }), br(), br(),

              button({ type: "submit" }, filter === 'edit' ? i18n.reportsUpdateButton : i18n.reportsCreateButton)
            )
          )
        : div({ class: "report-list" },
            filtered.length > 0 ? filtered.map(r => generateReportCard(r, userId)) : p(i18n.reportsNoItems)
       )
     )
  );
};

exports.singleReportView = async (report, filter) => {
  return template(
    report.title,
    section(
      div({ class: "filters" },
        form({ method: 'GET', action: '/reports' },
          button({ type: 'submit', name: 'filter', value: 'all', class: filter === 'all' ? 'filter-btn active' : 'filter-btn' }, i18n.reportsFilterAll),
          button({ type: 'submit', name: 'filter', value: 'mine', class: filter === 'mine' ? 'filter-btn active' : 'filter-btn' }, i18n.reportsFilterMine),
          button({ type: 'submit', name: 'filter', value: 'features', class: filter === 'features' ? 'filter-btn active' : 'filter-btn' }, i18n.reportsFilterFeatures),
          button({ type: 'submit', name: 'filter', value: 'bugs', class: filter === 'bugs' ? 'filter-btn active' : 'filter-btn' }, i18n.reportsFilterBugs),
          button({ type: 'submit', name: 'filter', value: 'abuse', class: filter === 'abuse' ? 'filter-btn active' : 'filter-btn' }, i18n.reportsFilterAbuse),
          button({ type: 'submit', name: 'filter', value: 'content', class: filter === 'content' ? 'filter-btn active' : 'filter-btn' }, i18n.reportsFilterContent),
          button({ type: 'submit', name: 'filter', value: 'confirmed', class: filter === 'confirmed' ? 'filter-btn active' : 'filter-btn' }, i18n.reportsFilterConfirmed),
          button({ type: 'submit', name: 'filter', value: 'open', class: filter === 'open' ? 'filter-btn active' : 'filter-btn' }, i18n.reportsFilterOpen),
          button({ type: 'submit', name: 'filter', value: 'under_review', class: filter === 'under_review' ? 'filter-btn active' : 'filter-btn' }, i18n.reportsFilterUnderReview),
          button({ type: 'submit', name: 'filter', value: 'resolved', class: filter === 'resolved' ? 'filter-btn active' : 'filter-btn' }, i18n.reportsFilterResolved),
          button({ type: 'submit', name: 'filter', value: 'invalid', class: filter === 'invalid' ? 'filter-btn active' : 'filter-btn' }, i18n.reportsFilterInvalid),
          button({ type: 'submit', name: 'filter', value: 'create', class: "create-button" }, i18n.reportsCreateButton)
        )
      ),
      div({ class: "tags-header" },
        h2(report.title),
        p(report.description),
        p(`${i18n.reportsCategory}: ${report.category}`),
        p(`${i18n.reportsSeverity}: ${report.severity}`),
        p(`${i18n.reportsStatus}: ${report.status}`),
        report.image ? img({ src: `/blob/${encodeURIComponent(report.image)}`, class: "report-image" }) : p(i18n.reportsNoFile),
        p(`${i18n.reportsCreatedAt}: ${moment(report.createdAt).format('YYYY-MM-DD HH:mm')}`),
        p(`${i18n.reportsCreatedBy}: `,
          report.isAnonymous
            ? span({ class: "anonymous-label" }, i18n.reportsAnonymousAuthor)
            : a({ href: `/author/${encodeURIComponent(report.author)}` }, report.author)
        ),
        p(`${i18n.reportsConfirmations}: ${report.confirmations.length}`),
        report.tags && report.tags.length
          ? div(
              report.tags.map(tag =>
                a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right:0.8em;" }, `#${tag}`)
              )
            )
          : null
      ),
      div({ class: "report-actions" },
        form({ method: "POST", action: `/reports/confirm/${encodeURIComponent(report.id)}` },
          button({ type: "submit" }, i18n.reportsConfirmButton)
        ),
        a({ href: "/tasks?filter=create", target: "_blank" }, button({ type: "button" }, i18n.reportsCreateTaskButton))
      )
    )
  );
};
