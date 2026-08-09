const { form, button, div, h2, p, section, textarea, label, input, br, img, a, select, option, span, table, tr, td } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink, renderVisibilityChip, renderDocumentActions } = require('./main_views');
const { renderUrl } = require('../backend/renderUrl');

const generateCVBox = (label, content, className) => {
  return div({ class: `cv-box ${className}` }, 
    h2(label),
    content
  );
};

exports.createCVView = async (cv = {}, editMode = false) => {
  const title = editMode ? i18n.cvEditSectionTitle : i18n.cvCreateSectionTitle;

  return template(
    title,
    section(
      div({ class: "tags-header" },
        h2(title),
        p(i18n.cvDescription)
      ),
      div({ class: "cv-form" },
        form({
          method: "POST",
          action: editMode ? `/cv/update/${encodeURIComponent(cv.id)}` : "/cv/upload",
          enctype: "multipart/form-data"
        },

          div({ class: "cv-box cv-ai-box" },
            div({ class: "poll-switch" },
              input({ type: "hidden", name: "aiManaged", value: "0" }),
              label(
                input({ type: "checkbox", name: "aiManaged", value: "1", ...(cv.aiManaged === false ? {} : { checked: true }) }),
                " ", i18n.cvAiManaged
              )
            ),
            div({ class: "cv-threshold-row" },
              label({ for: "cv_match_threshold" }, `${i18n.cvMatchThreshold}: `),
              input({ type: "number", id: "cv_match_threshold", name: "matchThreshold", min: "0", max: "100", step: "5", value: String(cv.matchThreshold != null ? cv.matchThreshold : 80) })
            )
          ),

          generateCVBox(i18n.cvPersonal, [
            label(i18n.cvNameLabel), br(),
            input({ type: "text", name: "name", required: true, value: cv.name || "" }), br(),
            label(i18n.cvDescriptionLabel), br(),
            textarea({ name: "description", required: true, rows: 4  }, cv.description || ""), br(),
            label(i18n.cvLanguagesLabel), br(),
            input({ type: "text", name: "languages", value: cv.languages || "" }), br(),
            label(i18n.cvPhotoLabel), br(),
            input({ type: "file", name: "image" }), br(), br(),
            label(i18n.cvPersonalExperiencesLabel), br(),
            textarea({ name: "personalExperiences", rows: 4 }, cv.personalExperiences || ""), br(),
            label(i18n.cvPersonalSkillsLabel), br(),
            input({ type: "text", name: "personalSkills", required: true, value: (cv.personalSkills || []).join(", ") }), br()
          ], "personal"),

          generateCVBox(i18n.cvOasis, [
            label(i18n.cvOasisExperiencesLabel), br(),
            textarea({ name: "oasisExperiences", rows: 4 }, cv.oasisExperiences || ""), br(),
            label(i18n.cvOasisSkillsLabel), br(),
            input({ type: "text", name: "oasisSkills", value: (cv.oasisSkills || []).join(", ") }), br()
          ], "oasis"),

          generateCVBox(i18n.cvEducational, [
            label(i18n.cvEducationExperiencesLabel), br(),
            textarea({ name: "educationExperiences", rows: 4 }, cv.educationExperiences || ""), br(),
            label(i18n.cvEducationalSkillsLabel), br(),
            input({ type: "text", name: "educationalSkills", value: (cv.educationalSkills || []).join(", ") }), br()
          ], "education"),

          generateCVBox(i18n.cvProfessional, [
            label(i18n.cvProfessionalExperiencesLabel), br(),
            textarea({ name: "professionalExperiences", rows: 4 }, cv.professionalExperiences || ""), br(),
            label(i18n.cvProfessionalSkillsLabel), br(),
            input({ type: "text", name: "professionalSkills", value: (cv.professionalSkills || []).join(", ") }), br()
          ], "professional"),

          generateCVBox(i18n.cvAvailability, [
            label(i18n.cvLocationLabel), br(),
            input({ type: "text", name: "location", required: true, value: cv.location || "UNKNOWN" }), br(),
            label(i18n.cvStatusLabel), br(),
            select({ name: "status", required: true },
              option({ value: "AVAILABLE", ...(cv.status === "AVAILABLE FOR COLLABORATION" ? { selected: true } : {})}, "AVAILABLE FOR COLLABORATION"),
              option({ value: "UNAVAILABLE", ...(cv.status === "NOT CURRENTLY AVAILABLE" ? { selected: true } : {})}, "NOT CURRENTLY AVAILABLE"),
              option({ value: "LOOKING FOR WORK", ...(!cv.status || cv.status === "LOOKING FOR WORK" ? { selected: true } : {})}, "LOOKING FOR WORK")
            ), br(), br(),
            label(i18n.cvPreferencesLabel), br(),
            select({ name: "preferences", required: true },
              option({ value: "IN PERSON", ...(cv.preferences === "IN-PERSON ONLY" ? { selected: true } : {})}, "IN-PERSON ONLY"),
              option({ value: "REMOTE WORKING", ...(!cv.preferences || cv.preferences === "REMOTE WORKING" ? { selected: true } : {})}, "REMOTE-WORKING")
            ), br(), br(),
            label(i18n.visibilityLabel || "Visibility"), br(),
            select({ name: "visibility" },
              option({ value: "PUBLIC", ...((cv.visibility || "PUBLIC") === "PUBLIC" ? { selected: true } : {})}, i18n.visibilityPublic || "Public"),
              option({ value: "HIDDEN", ...(cv.visibility === "HIDDEN" ? { selected: true } : {})}, i18n.visibilityHidden || "Hidden")
            ), br()
          ], "availability"),

          button({ type: "submit" }, editMode ? i18n.cvUpdateButton : i18n.cvCreateButton)
        )
      )
    )
  )
};

exports.cvView = async (cv) => {
  const title = i18n.cvTitle;

  if (!cv) {
    return template(
      title,
      section(
        div({ class: "tags-header" },
          h2(title),
          p(i18n.cvDescription)
        ),
        div({ class: "no-cv" },
          p(i18n.cvNoCV),
          form({ method: "GET", action: "/cv/create" },
            button({ type: "submit" }, i18n.cvCreateButton)
          )
        )
      )
    )
  }

  const skills = (list) => (Array.isArray(list) ? list.filter(Boolean) : []);
  const allSkills = [
    ...skills(cv.personalSkills),
    ...skills(cv.educationalSkills),
    ...skills(cv.professionalSkills),
    ...skills(cv.oasisSkills)
  ];
  const uniqueSkills = Array.from(new Set(allSkills));

  const renderSkillTags = (list) => skills(list).length
    ? div({ class: "card-tags" },
        skills(list).map(tag =>
          a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`))
      )
    : null;

  const renderBlock = (heading, body, list) => (body || skills(list).length)
    ? div({ class: "cv-box" },
        h2({ class: "job-section-title" }, heading),
        body ? p({ class: "tribe-side-description" }, ...renderUrl(String(body))) : null,
        renderSkillTags(list)
      )
    : null;

  const vis = (cv.visibility || 'PUBLIC').toUpperCase() === 'HIDDEN' ? 'HIDDEN' : 'PUBLIC';
  const nextVis = vis === 'PUBLIC' ? 'HIDDEN' : 'PUBLIC';

  const infoRows = [];
  const pushRow = (labelText, valueNode) =>
    infoRows.push(tr(
      td({ class: "tribe-info-label" }, labelText),
      td({ class: "tribe-info-value" }, valueNode)
    ));
  if (cv.location) pushRow(i18n.cvLocationLabel, cv.location);
  if (cv.status) pushRow(i18n.cvStatusLabel, cv.status);
  if (cv.preferences) pushRow(i18n.cvPreferencesLabel, cv.preferences);
  if (cv.languages) pushRow(i18n.cvLanguagesLabel, String(cv.languages).toUpperCase());
  pushRow(i18n.cvAiManaged, cv.aiManaged === false ? i18n.switchOff : `${i18n.switchOn} · ${cv.matchThreshold != null ? cv.matchThreshold : 80}%`);
  pushRow(i18n.cvCreatedAt, new Date(cv.createdAt).toLocaleString());
  if (cv.updatedAt) pushRow(i18n.cvUpdatedAt, new Date(cv.updatedAt).toLocaleString());

  const cvSide = div({ class: "tribe-side" },
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, cv.name || i18n.unnamed || 'Anonymous')
    ),
    cv.photo
      ? img({ src: `/blob/${encodeURIComponent(cv.photo)}`, class: "cv-photo tribe-detail-image" })
      : null,
    (cv.contact || cv.author)
      ? div({ class: 'profile-qr' },
          a({ href: `/author/${encodeURIComponent(cv.contact || cv.author)}` },
            img({ class: 'profile-qr-img', src: `/qr/${encodeURIComponent(cv.contact || cv.author)}?size=240`, alt: 'QR' })))
      : null,
    cv.contact ? p(userLink(cv.contact)) : null,
    table({ class: "tribe-info-table jobs-info-table" }, ...infoRows),
    uniqueSkills.length
      ? div({ class: "tribe-card-members" },
          span({ class: "tribe-members-count" }, `${i18n.cvSkillsCount}: ${uniqueSkills.length}`)
        )
      : null,
    div({ class: "tribe-side-actions cv-visibility-row housing-status-row" },
      span({ class: "card-label" }, `${i18n.visibilityLabel || 'Visibility'}: `),
      renderVisibilityChip(vis, i18n),
      form({ method: "POST", action: `/cv/visibility/${encodeURIComponent(cv.id)}`, class: "inline-form" },
        input({ type: "hidden", name: "visibility", value: nextVis }),
        button({ type: "submit", class: "filter-btn" },
          nextVis === 'PUBLIC' ? (i18n.visibilityMakePublic || 'Make public') : (i18n.visibilityMakeHidden || 'Make hidden')
        )
      )
    ),
    div({ class: "tribe-side-actions" },
      form({ method: "GET", action: `/cv/edit/${encodeURIComponent(cv.id)}` },
        button({ type: "submit", class: "update-btn" }, i18n.cvEditButton)
      ),
      form({ method: "POST", action: `/cv/delete/${encodeURIComponent(cv.id)}` },
        button({ type: "submit", class: "delete-btn" }, i18n.cvDeleteButton)
      )
    ),
    renderDocumentActions('cv', null)
  );

  const cvMain = div({ class: "tribe-main" },
    cv.description
      ? div({ class: "job-section" },
          h2({ class: "job-section-title" }, i18n.cvDescriptionLabel),
          p({ class: "tribe-side-description" }, ...renderUrl(String(cv.description)))
        )
      : null,
    renderBlock(i18n.cvPersonal, cv.personalExperiences, cv.personalSkills),
    renderBlock(i18n.cvEducationalView, cv.educationExperiences, cv.educationalSkills),
    renderBlock(i18n.cvProfessionalView, cv.professionalExperiences, cv.professionalSkills),
    renderBlock(i18n.cvOasisContributorView, cv.oasisExperiences, cv.oasisSkills)
  );

  return template(
    title,
    section(
      div({ class: "tags-header" },
        h2(title),
        p(i18n.cvDescription)
      ),
      div({ class: "tribe-details" }, cvSide, cvMain)
    )
  );
};
