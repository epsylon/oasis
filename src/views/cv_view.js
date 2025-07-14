const { form, button, div, h2, p, section, textarea, label, input, br, img, a, select, option } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');

const generateCVBox = (label, content, className) => {
  return div({ class: `cv-box ${className}` }, 
    h2(label),
    content
  );
};

const generateTags = (tags) => {
  return tags && tags.length
    ? div(
        tags.map(tag =>
          a({
            href: `/search?query=%23${encodeURIComponent(tag)}`,
            class: "tag-link",
            style: "margin-right:0.8em;margin-bottom:0.5em;"
          }, `#${tag}`)
        )
      )
    : null;
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

          generateCVBox(i18n.cvPersonal, [
            label(i18n.cvNameLabel), br(),
            input({ type: "text", name: "name", required: true, value: cv.name || "" }), br(),
            label(i18n.cvDescriptionLabel), br(),
            textarea({ name: "description", required: true }, cv.description || ""), br(),
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
              option({ value: "AVAILABLE", selected: cv.status === "AVAILABLE FOR COLLABORATION" }, "AVAILABLE FOR COLLABORATION"),
              option({ value: "UNAVAILABLE", selected: cv.status === "NOT CURRENTLY AVAILABLE" }, "NOT CURRENTLY AVAILABLE"),
              option({ value: "LOOKING FOR WORK", selected: !cv.status || cv.status === "LOOKING FOR WORK" }, "LOOKING FOR WORK")
            ), br(), br(),
            label(i18n.cvPreferencesLabel), br(),
            select({ name: "preferences", required: true },
              option({ value: "IN PERSON", selected: cv.preferences === "IN-PERSON ONLY" }, "IN-PERSON ONLY"),
              option({ value: "REMOTE WORKING", selected: !cv.preferences || cv.preferences === "REMOTE WORKING" }, "REMOTE-WORKING")
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

  const hasPersonal = cv.contact || cv.name || cv.description || cv.photo || typeof cv.oasisContributor === "boolean" || (cv.personalSkills && cv.personalSkills.length);
  const hasPersonalExp = cv.personalExperiences;
  const hasOasis = cv.oasisExperiences || (cv.oasisSkills && cv.oasisSkills.length);
  const hasEducational = cv.educationExperiences || cv.languages || (cv.educationalSkills && cv.educationalSkills.length);
  const hasProfessional = cv.professionalExperiences || (cv.professionalSkills && cv.professionalSkills.length);
  const hasAvailability = cv.location || cv.status || cv.preferences;

  return template(
    title,
    section(
      div({ class: "tags-header" },
        h2(title),
        p(i18n.cvDescription)
      ),
      div({ class: "cv-section" },
        div({ class: "cv-item" }, ...[
          div({ class: "cv-actions" },
            form({ method: "GET", action: `/cv/edit/${encodeURIComponent(cv.id)}` },
              button({ type: "submit" }, i18n.cvEditButton)
            ),
            form({ method: "POST", action: `/cv/delete/${encodeURIComponent(cv.id)}` },
              button({ type: "submit" }, i18n.cvDeleteButton)
            )
          ),
          div({ class: "cv-meta" },
            p(`${i18n.cvCreatedAt}: ${new Date(cv.createdAt).toLocaleString()}`),
            cv.updatedAt ? p(`${i18n.cvUpdatedAt}: ${new Date(cv.updatedAt).toLocaleString()}`) : null
          ),
          hasPersonal ? div({ class: "cv-box personal" }, ...[
            cv.photo
              ? img({
                  src: `/blob/${encodeURIComponent(cv.photo)}`,
                  class: "cv-photo"
                })
              : null,
            cv.name ? h2(`${cv.name}`) : null,
            cv.contact ? p(a({ class: "user-link", href: `/author/${encodeURIComponent(cv.contact)}` }, cv.contact)) : null,
            cv.description ? p(`${cv.description}`) : null,
            cv.languages ? p(`${i18n.cvLanguagesLabel}: ${cv.languages}`) : null,
            (cv.personalSkills && cv.personalSkills.length)
              ? div(
                  cv.personalSkills.map(tag =>
                    a({
                      href: `/search?query=%23${encodeURIComponent(tag)}`,
                      class: "tag-link",
                      style: "margin-right:0.8em;margin-bottom:0.5em;"
                    }, `#${tag}`)
                  )
                )
              : null
          ]) : null,
          hasOasis ? div({ class: "cv-box oasis" }, ...[
            h2(i18n.cvOasisContributorView),
            p(`${cv.oasisExperiences}`),
            (cv.oasisSkills && cv.oasisSkills.length)
              ? div(
                  cv.oasisSkills.map(tag =>
                    a({
                      href: `/search?query=%23${encodeURIComponent(tag)}`,
                      class: "tag-link",
                      style: "margin-right:0.8em;margin-bottom:0.5em;"
                    }, `#${tag}`)
                  )
                )
              : null
          ]) : null,
          hasEducational ? div({ class: "cv-box education" }, ...[
            h2(i18n.cvEducationalView),
            cv.educationExperiences ? p(`${cv.educationExperiences}`) : null,
            (cv.educationalSkills && cv.educationalSkills.length)
              ? div(
                  cv.educationalSkills.map(tag =>
                    a({
                      href: `/search?query=%23${encodeURIComponent(tag)}`,
                      class: "tag-link",
                      style: "margin-right:0.8em;margin-bottom:0.5em;"
                    }, `#${tag}`)
                  )
                )
              : null
          ]) : null,
          hasProfessional ? div({ class: "cv-box professional" }, ...[
            h2(i18n.cvProfessionalView),
            cv.professionalExperiences ? p(`${cv.professionalExperiences}`) : null,
            (cv.professionalSkills && cv.professionalSkills.length)
              ? div(
                  cv.professionalSkills.map(tag =>
                    a({
                      href: `/search?query=%23${encodeURIComponent(tag)}`,
                      class: "tag-link",
                      style: "margin-right:0.8em;margin-bottom:0.5em;"
                    }, `#${tag}`)
                  )
                )
              : null
          ]) : null,
          hasAvailability ? div({ class: "cv-box availability" }, ...[
            h2(i18n.cvAvailabilityView),
            cv.location ? p(`${i18n.cvLocationLabel}: ${cv.location}`) : null,
            cv.status ? p(`${i18n.cvStatusLabel}: ${cv.status}`) : null,
            cv.preferences ? p(`${i18n.cvPreferencesLabel}: ${cv.preferences}`) : null
          ]) : null
        ])
      )
    )
  );
};

