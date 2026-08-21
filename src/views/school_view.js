const { div, h2, h3, p, section, button, form, a, span, textarea, br, input, label, select, option, table, tr, td } = require("../server/node_modules/hyperaxe")
const { template, i18n, userLink, renderStateChip, renderContentActions, renderOpinionsVoting, renderEngagement } = require("./main_views")
const { renderCommentsSection: renderSharedCommentsSection } = require("./comments_view")
const opinionCategories = require("../backend/opinion_categories")
const { config } = require("../server/SSB_server.js")
const { renderUrl } = require("../backend/renderUrl")
const markdown = require("./markdown")
const { sanitizeHtml } = require("../backend/sanitizeHtml")
const renderMd = (text) => div({ class: "styled-text", innerHTML: sanitizeHtml(markdown(String(text || ""))) })

const userId = config.keys.id
const safeArr = (v) => (Array.isArray(v) ? v : [])
const safeText = (v) => String(v || "").trim()
const isFree = (course) => !(Number(course.price) > 0)
const sumCats = (opinions = {}, cats = []) => (cats || []).reduce((sum, cat) => sum + (Number((opinions || {})[cat]) || 0), 0)
const renderStarRating = (opinions, voterCount) => {
  const pos = sumCats(opinions, opinionCategories.positive)
  const neg = sumCats(opinions, opinionCategories.constructive) + sumCats(opinions, opinionCategories.moderation)
  const totalVotes = pos + neg
  const full = totalVotes > 0 ? Math.round((pos / totalVotes) * 5) : 0
  const stars = "\u2605".repeat(full) + "\u2606".repeat(5 - full)
  return span({ class: "shop-product-stars" }, `${stars} (${voterCount})`)
}

const renderMediaBlob = (value, fallbackSrc = null, attrs = {}) => {
  if (!value) return fallbackSrc ? require("../server/node_modules/hyperaxe").img({ src: fallbackSrc, ...attrs }) : null
  const { img } = require("../server/node_modules/hyperaxe")
  const s = String(value).trim()
  if (s.startsWith('&')) return img({ src: `/blob/${encodeURIComponent(s)}`, ...attrs })
  return fallbackSrc ? img({ src: fallbackSrc, ...attrs }) : null
}

const buildReturnTo = (filter, params = {}) => {
  const f = safeText(filter || "all")
  const q = safeText(params.q || "")
  const sort = safeText(params.sort || "recent")
  const parts = [`filter=${encodeURIComponent(f)}`]
  if (q) parts.push(`q=${encodeURIComponent(q)}`)
  if (sort) parts.push(`sort=${encodeURIComponent(sort)}`)
  return `/school?${parts.join("&")}`
}

const renderModeButtons = (currentFilter) =>
  div({ class: "tribe-mode-buttons" },
    ["all", "mine", "recent", "top", "applied", "open", "favorites"].map(f =>
      form({ method: "GET", action: "/school" },
        input({ type: "hidden", name: "filter", value: f }),
        button({ type: "submit", class: currentFilter === f ? "filter-btn active" : "filter-btn" }, i18n[`schoolFilter${f.charAt(0).toUpperCase() + f.slice(1)}`] || f.toUpperCase())
      )
    ),
    form({ method: "GET", action: "/school" },
      input({ type: "hidden", name: "filter", value: "create" }),
      button({ type: "submit", class: "create-button" }, i18n.schoolCreateButton)
    )
  )

const renderPriceChip = (course) =>
  isFree(course)
    ? renderStateChip("mutuals", "✓", i18n.schoolFree)
    : span({ class: "state-chip" }, `${Number(course.price).toFixed(2)} ECO`)

const renderCourseChips = (course) =>
  div({ class: "card-chips-row" },
    course.status === "CLOSED"
      ? renderStateChip("closed", "✗", i18n.schoolClosed)
      : renderStateChip("mutuals", "✓", i18n.schoolOngoing),
    course.visibility === "INVITE" ? renderStateChip("whole", "\uD83D\uDD11", i18n.chatStatusInviteOnly) : null,
    renderPriceChip(course)
  )

const renderCourseCard = (course, filter, params = {}) => {
  const url = `/school/course/${encodeURIComponent(course.id)}`
  return div({ class: "tribe-card" },
    div({ class: "tribe-card-image-wrapper" },
      a({ href: url },
        renderMediaBlob(course.image, '/assets/images/default-avatar.png', { class: 'tribe-card-hero-image' })
      )
    ),
    div({ class: "tribe-card-body" },
      h2({ class: "tribe-card-title" }, a({ href: url }, course.title)),
      renderStarRating(course.opinions, safeArr(course.opinions_inhabitants).length),
      renderCourseChips(course),
      course.description ? p({ class: "tribe-card-description" }, ...renderUrl(course.description)) : null,
      div({ class: "tribe-card-members" },
        span({ class: "tribe-members-count" }, `${i18n.schoolStudents}: ${course.students.length}`)
      ),
      course.startDate ? div({ class: "tribe-card-members" },
        span({ class: "tribe-members-count" }, `${i18n.schoolStartDate}: ${new Date(course.startDate).toLocaleDateString()}`)
      ) : null
    )
  )
}

const renderCourseForm = (filter, course = {}) => {
  const isEdit = filter === "edit"
  return div({ class: "create-tribe-form" },
    h2(isEdit ? i18n.schoolUpdateSectionTitle : i18n.schoolCreateSectionTitle),
    form({ action: isEdit ? `/school/update/${encodeURIComponent(course.id || "")}` : "/school/create", method: "POST", enctype: "multipart/form-data" },
      label(i18n.title), br,
      input({ type: "text", name: "title", maxlength: "120", required: true, placeholder: i18n.schoolCourseTitlePlaceholder, value: course.title || "" }), br(),
      label(i18n.description), br,
      textarea({ name: "description", rows: 5, required: true, placeholder: i18n.schoolCourseDescriptionPlaceholder }, course.description || ""), br,
      label(i18n.blogImage), br,
      input({ type: "file", name: "image", accept: "image/*" }), br(), br(),
      label(i18n.schoolTags), br,
      input({ type: "text", name: "tags", placeholder: i18n.schoolTagsPlaceholder, value: safeArr(course.tags).join(", ") }), br,
      label(i18n.schoolCourseType), br,
      (() => {
        const current = course.visibility === "INVITE" ? "INVITE" : (Number(course.price) > 0 ? "PAID" : "OPEN")
        return select({ name: "courseType" },
          option({ value: "OPEN", ...(current === "OPEN" ? { selected: true } : {}) }, i18n.schoolTypeOpen),
          option({ value: "PAID", ...(current === "PAID" ? { selected: true } : {}) }, i18n.schoolTypePaid),
          option({ value: "INVITE", ...(current === "INVITE" ? { selected: true } : {}) }, i18n.schoolTypeInvite)
        )
      })(), br(), br(),
      label(i18n.schoolPrice), br,
      input({ type: "number", name: "price", step: "0.000001", min: "0", value: course.price && Number(course.price) > 0 ? course.price : "0" }), br(), br(),
      label(i18n.schoolStartDate), br,
      input({ type: "date", name: "startDate", min: new Date().toISOString().slice(0, 10), value: course.startDate ? String(course.startDate).slice(0, 10) : "" }), br(),
      isEdit
        ? div(
            label(i18n.schoolStatus), br,
            select({ name: "status" },
              option({ value: "ONGOING", ...((course.status || "ONGOING") === "ONGOING" ? { selected: true } : {}) }, i18n.schoolOngoing),
              option({ value: "CLOSED", ...(course.status === "CLOSED" ? { selected: true } : {}) }, i18n.schoolClosed)
            ), br()
          )
        : null,
      br(),
      button({ type: "submit" }, isEdit ? i18n.schoolUpdate : i18n.schoolCreate)
    )
  )
}

exports.schoolView = async (courses, filter, courseToEdit = null, params = {}) => {
  const q = safeText(params.q || "")
  const sort = safeText(params.sort || "recent")
  const list = safeArr(courses)
  const title = i18n.schoolTitle
  const isForm = filter === "create" || filter === "edit"

  return template(
    title,
    section(div({ class: "tags-header" }, h2(title), p(i18n.schoolDescription))),
    section(renderModeButtons(filter)),
    !isForm
      ? section(
          div({ class: "filters" },
            form({ method: "GET", action: "/school", class: "filter-box" },
              input({ type: "hidden", name: "filter", value: filter }),
              input({ type: "text", name: "q", value: q, placeholder: i18n.schoolSearchPlaceholder, class: "filter-box__input" }),
              div({ class: "filter-box__controls" },
                select({ name: "sort", class: "filter-box__select" },
                  option({ value: "recent", ...(sort === "recent" ? { selected: true } : {}) }, i18n.documentSortRecent),
                  option({ value: "students", ...(sort === "students" ? { selected: true } : {}) }, i18n.documentSortTop),
                  option({ value: "title", ...(sort === "title" ? { selected: true } : {}) }, i18n.schoolSortTitle)
                ),
                button({ type: "submit", class: "filter-box__button" }, i18n.searchButton)
              )
            )
          )
        )
      : null,
    section(
      isForm
        ? renderCourseForm(filter, filter === "edit" ? (courseToEdit || {}) : {})
        : div({ class: "tribe-grid" },
            list.length
              ? list.map(course => renderCourseCard(course, filter, params))
              : p(i18n.schoolNoCourses)
          )
    )
  )
}

const renderLesson = (lesson, course, isTeacher, returnTo, isStudent = false) =>
  lesson.locked
    ? div({ class: "school-lesson school-lesson-locked" },
        h3("🔒"),
        p(i18n.schoolLessonLocked),
        div({ class: "school-lesson-meta" }, span(new Date(lesson.createdAt).toLocaleDateString()))
      )
    : div({ class: "school-lesson" },
    div({ class: "school-lesson-header" },
      h3(a({ href: `/school/lesson/${encodeURIComponent(course.id)}/${encodeURIComponent(lesson.id)}` }, lesson.unit ? `${lesson.unit} — ${lesson.title}` : lesson.title)),
      isStudent
        ? form({ method: "POST", action: `/school/lesson/complete/${encodeURIComponent(course.id)}/${encodeURIComponent(lesson.id)}` },
            input({ type: "hidden", name: "value", value: lesson.completed ? "false" : "true" }),
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            button({ type: "submit", class: lesson.completed ? "tribe-action-btn school-complete-btn school-complete-btn--done" : "tribe-action-btn school-complete-btn" }, lesson.completed ? `✓ ${i18n.schoolProgressDone}` : i18n.schoolProgressMark)
          )
        : null
    ),
    p(...renderUrl(lesson.text)),
    div({ class: "school-lesson-meta" },
      lesson.sessionDate ? span({ class: "school-session-date" }, `${i18n.schoolSessionDate}: ${new Date(lesson.sessionDate).toLocaleDateString()} · `) : null,
      span(new Date(lesson.createdAt).toLocaleDateString())
    )
  )

const renderTeacherPanel = (course, certificates, returnTo) =>
  div({ class: "create-tribe-form school-teacher-panel" },
    h2(i18n.schoolTeacherPanel),
    form({ method: "POST", action: `/school/lesson/add/${encodeURIComponent(course.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      label(i18n.schoolAddLesson), br,
      input({ type: "text", name: "title", maxlength: "120", required: true, placeholder: i18n.schoolLessonTitlePlaceholder }), br(),
      textarea({ name: "text", rows: 5, required: true, placeholder: i18n.schoolLessonTextPlaceholder }), br,
      label(i18n.schoolLessonUnit), br,
      input({ type: "text", name: "unit", maxlength: "60", placeholder: i18n.schoolLessonUnitPlaceholder }), br(),
      label(i18n.schoolLessonOrder), br,
      input({ type: "number", name: "order", min: "0", step: "1" }), br(), br(),
      label(i18n.schoolSessionDate), br,
      input({ type: "date", name: "sessionDate", min: new Date().toISOString().slice(0, 10) }), br(), br(),
      button({ type: "submit" }, i18n.schoolAddLesson), br(), br()
    ),
    br(),
    course.visibility === "INVITE"
      ? div(
          form({ method: "POST", action: `/school/invite/${encodeURIComponent(course.id)}` },
            label(i18n.schoolInviteStudents), br,
            input({ type: "text", name: "students", required: true, placeholder: i18n.schoolInvitePlaceholder }), br(),
            button({ type: "submit" }, i18n.schoolInviteButton)
          ),
          course.invited.length
            ? div({ class: "school-invited-list" },
                p(`${i18n.schoolInvited}: `),
                course.invited.map(s => p(userLink(s)))
              )
            : null,
          br()
        )
      : null,
    safeArr(course.pending).length
      ? div({ class: "school-pending-list" },
          p(`${i18n.schoolPendingStudents}: `),
          course.pending.map(pen =>
            p(
              userLink(pen.author),
              pen.transferId ? span(" — ") : null,
              pen.transferId ? a({ href: `/transfers/${encodeURIComponent(pen.transferId)}` }, i18n.schoolViewBill) : null
            )
          ),
          br()
        )
      : null,
    !isFree(course) || course.visibility === "INVITE"
      ? (() => {
          const granted = safeArr(course.granted)
          const ungrantedStudents = safeArr(course.students).filter(st => !granted.includes(st))
          return ungrantedStudents.length
            ? div({ class: "school-grant-list" },
                p(`${i18n.schoolGrantAccess}: `),
                ungrantedStudents.map(st =>
                  form({ method: "POST", action: `/school/grant/${encodeURIComponent(course.id)}` },
                    input({ type: "hidden", name: "student", value: st }),
                    input({ type: "hidden", name: "returnTo", value: returnTo }),
                    button({ type: "submit", class: "filter-btn" }, `🔑 ${st.slice(0, 10)}...`)
                  )
                ),
                br()
              )
            : null
        })()
      : null,
    course.students.length
      ? form({ method: "POST", action: `/school/certificate/${encodeURIComponent(course.id)}` },
          input({ type: "hidden", name: "returnTo", value: returnTo }),
          label(i18n.schoolIssueCertificate), br,
          select({ name: "student" },
            course.students
              .filter(s => !safeArr(certificates).some(cert => cert.student === s))
              .map(s => option({ value: s }, s))
          ), br(),
          input({ type: "text", name: "text", maxlength: "200", placeholder: i18n.schoolCertificateTextPlaceholder }), br(),
          button({ type: "submit" }, i18n.schoolIssueCertificate)
        )
      : null
  )

exports.singleCourseView = async (course, lessons = [], certificates = [], params = {}) => {
  const courseApproved = params.approved === true
  const returnTo = `/school/course/${encodeURIComponent(course.id)}`
  const isTeacher = String(course.author) === String(userId)
  const isStudent = course.students.includes(userId)
  const myPending = safeArr(course.pending).find(p => p.author === userId) || null
  const isPaid = !isFree(course)
  lessons = safeArr(lessons)
  certificates = safeArr(certificates)

  const courseSide = div({ class: "tribe-side" },
    div({ class: "card-header activity-card-header" },
      renderContentActions(course.id, null, { spread: params.spreads || null, author: course.author, favKind: 'school', isFavorite: course.isFavorite, returnTo, reportTitle: course.title })
    ),
    h2({ class: "tribe-card-title" }, course.title),
    renderStarRating(course.opinions, safeArr(course.opinions_inhabitants).length),
    div({ class: "card-chips-row" },
      course.status === "CLOSED"
        ? renderStateChip("closed", "✗", i18n.schoolClosed)
        : renderStateChip("mutuals", "✓", i18n.schoolOngoing),
      course.visibility === "INVITE" ? renderStateChip("whole", "\uD83D\uDD11", i18n.chatStatusInviteOnly) : null,
      renderPriceChip(course),
      courseApproved ? renderStateChip("mutuals", "🎓", i18n.schoolApproved) : null
    ),
    renderMediaBlob(course.image, '/assets/images/default-avatar.png', { class: 'tribe-detail-image' }),
    course.description ? p({ class: "tribe-side-description" }, ...renderUrl(course.description)) : null,
    table({ class: "tribe-info-table" },
      tr(
        td({ class: "tribe-info-label" }, i18n.schoolCreatedAt),
        td({ class: "tribe-info-value", colspan: "3" }, new Date(course.createdAt).toLocaleString())
      ),
      course.startDate ? tr(
        td({ class: "tribe-info-label" }, i18n.schoolStartDate),
        td({ class: "tribe-info-value", colspan: "3" }, new Date(course.startDate).toLocaleDateString())
      ) : null,
      tr(
        td({ class: "tribe-info-label" }, i18n.schoolTeacher),
        td({ class: "tribe-info-value", colspan: "3" }, userLink(course.author))
      )
    ),
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.schoolStudents}: ${course.students.length}`)
    ),
    !isTeacher
      ? (myPending
          ? div({ class: "school-pending-block" },
              div({ class: "tribe-side-actions school-pending-row" },
                renderStateChip("closed", "⧖", i18n.schoolPendingPayment)
              ),
              myPending.transferId
                ? div({ class: "doc-export-actions" },
                    form({ method: "GET", action: `/transfers/contract/${encodeURIComponent(myPending.transferId)}`, class: "transfer-contract-form" },
                      button({ type: "submit", class: "filter-btn" }, i18n.transfersExportContract)
                    ),
                    form({ method: "POST", action: `/transfers/${encodeURIComponent(myPending.transferId)}/share` },
                      button({ type: "submit", class: "filter-btn" }, i18n.sharePm)
                    )
                  )
                : null
            )
          : !isStudent && course.status === "ONGOING" && (course.visibility === "PUBLIC" || course.invited.includes(userId))
            ? div({ class: "tribe-side-actions shop-visibility-row" },
                span({ class: "card-label" }, `${i18n.schoolEnrollLabel}: `),
                form({ method: "POST", action: `/school/enroll/${encodeURIComponent(course.id)}` },
                  button({ type: "submit", class: "tribe-action-btn" }, isPaid ? `ENROLL (${Number(course.price).toFixed(2)} ECO)` : "ENROLL")
                )
              )
            : !isStudent
              ? p(i18n.schoolInviteRequired)
              : null)
      : null,
    isTeacher
      ? div({ class: "tribe-side-actions shop-visibility-row" },
          span({ class: "card-label" }, `${i18n.schoolStatus}: `),
          course.status === "CLOSED"
            ? renderStateChip("closed", "✗", i18n.schoolClosed)
            : renderStateChip("mutuals", "✓", i18n.schoolOngoing),
          form({ method: "POST", action: `/school/status/${encodeURIComponent(course.id)}`, class: "inline-form" },
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            input({ type: "hidden", name: "status", value: course.status === "CLOSED" ? "ONGOING" : "CLOSED" }),
            button({ type: "submit", class: "tribe-action-btn" }, course.status === "CLOSED" ? i18n.schoolReopenCourse : i18n.schoolCloseCourse)
          )
        )
      : null,
    isTeacher && course.visibility === "INVITE"
      ? div({ class: "tribe-side-actions shop-visibility-row" },
          span({ class: "card-label" }, `${i18n.schoolVisibilityInvite}: `),
          form({ method: "POST", action: `/school/generate-invite/${encodeURIComponent(course.id)}` },
            button({ type: "submit", class: "tribe-action-btn" }, i18n.tribeGenerateInvite)
          )
        )
      : null,
    isTeacher
      ? div({ class: "tribe-side-actions owner-actions" },
          form({ method: "GET", action: "/school" },
            input({ type: "hidden", name: "filter", value: "edit" }),
            input({ type: "hidden", name: "courseId", value: course.id }),
            button({ type: "submit", class: "tribe-action-btn" }, i18n.chatUpdate)
          ),
          form({ method: "POST", action: `/school/delete/${encodeURIComponent(course.id)}` },
            button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.chatDelete)
          )
        )
      : null,
    course.chatId && (isTeacher || isStudent || (course.visibility === "PUBLIC" && isFree(course)))
      ? div({ class: "tribe-side-actions shop-visibility-row" },
          span({ class: "card-label" }, `${i18n.schoolCourseChat}: `),
          form({ method: "GET", action: `/chats/${encodeURIComponent(course.chatId)}` },
            button({ type: "submit", class: "tribe-action-btn" }, "JOIN")
          )
        )
      : null,
    safeArr(course.tags).length
      ? div({ class: "tribe-side-tags" }, safeArr(course.tags).map(tag => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)))
      : null,
    !isTeacher && (isStudent || myPending)
      ? div({ class: "tribe-side-actions owner-actions" },
          form({ method: "POST", action: `/school/unenroll/${encodeURIComponent(course.id)}` },
            button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.schoolUnenrollButton)
          )
        )
      : null
  )

  const myCompleted = lessons.filter(lesson => lesson.completed).length
  const progressBlock = isStudent && lessons.length
    ? p({ class: "school-progress-self" }, `${i18n.schoolProgress}: ${myCompleted}/${lessons.length}`)
    : null

  const teacherProgress = isTeacher && params.progress && Object.keys(params.progress).length
    ? div({ class: "school-progress-list" },
        h2(i18n.schoolProgress),
        Object.entries(params.progress).map(([student, done]) =>
          p(userLink(student), span(` — ${done}/${lessons.length}`))
        )
      )
    : null

  const exams = safeArr(params.exams)
  const examsBlock = (isTeacher || isStudent) && (exams.length || (isTeacher && !isFree(course)))
    ? div({ class: "school-exams" },
        h2(`${i18n.schoolExams} (${exams.length})`),
        exams.map(exam =>
          exam.locked
            ? null
            : div({ class: "school-exam" },
                h3(exam.title),
                isTeacher
                  ? div(
                      exam.questions.map((question, qi) =>
                        div({ class: "school-exam-question" },
                          p(`${qi + 1}. ${question.q}`),
                          question.options.map((opt, oi) =>
                            p({ class: oi === question.correct ? "school-exam-correct" : "school-exam-option-row" }, `${oi === question.correct ? "✓" : "·"} ${opt}`)
                          ),
                          form({ method: "POST", action: `/school/exam/question/delete/${encodeURIComponent(course.id)}/${encodeURIComponent(exam.id)}/${encodeURIComponent(question.id)}` },
                            input({ type: "hidden", name: "returnTo", value: returnTo }),
                            button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.chatDelete)
                          )
                        )
                      ),
                      form({ method: "POST", action: `/school/exam/question/add/${encodeURIComponent(course.id)}/${encodeURIComponent(exam.id)}`, class: "create-tribe-form" },
                        input({ type: "hidden", name: "returnTo", value: returnTo }),
                        label(i18n.schoolExamAddQuestion), br,
                        input({ type: "text", name: "q", required: true, maxlength: "300" }), br(),
                        input({ type: "text", name: "o1", required: true, placeholder: `${i18n.schoolExamOption} 1` }), br(),
                        input({ type: "text", name: "o2", required: true, placeholder: `${i18n.schoolExamOption} 2` }), br(),
                        input({ type: "text", name: "o3", required: true, placeholder: `${i18n.schoolExamOption} 3` }), br(),
                        input({ type: "text", name: "o4", required: true, placeholder: `${i18n.schoolExamOption} 4` }), br(),
                        label(i18n.schoolExamCorrect), br,
                        select({ name: "correct" },
                          option({ value: "0" }, `${i18n.schoolExamOption} 1`),
                          option({ value: "1" }, `${i18n.schoolExamOption} 2`),
                          option({ value: "2" }, `${i18n.schoolExamOption} 3`),
                          option({ value: "3" }, `${i18n.schoolExamOption} 4`)
                        ), br(), br(),
                        button({ type: "submit" }, i18n.schoolExamAddQuestion)
                      ),
                      exam.results.length
                        ? exam.results.map(res => p(userLink(res.author), span(` — ${res.score}/10 — ${res.passed ? i18n.schoolExamPassed : i18n.schoolExamFailed}`)))
                        : p(i18n.schoolNoScoresYet),
                      form({ method: "POST", action: `/school/exam/delete/${encodeURIComponent(course.id)}/${encodeURIComponent(exam.id)}` },
                        input({ type: "hidden", name: "returnTo", value: returnTo }),
                        button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.chatDelete)
                      )
                    )
                  : exam.myResult && (exam.myResult.passed || Date.now() - Number(exam.myResult.at || 0) < 24 * 60 * 60 * 1000)
                    ? div(
                        p(`${i18n.schoolExamScore}: ${exam.myResult.score}/10 — ${exam.myResult.passed ? i18n.schoolExamPassed : i18n.schoolExamFailed}`),
                        !exam.myResult.passed ? p({ class: "school-exam-retry" }, i18n.schoolExamRetryLater) : null
                      )
                    : form({ method: "POST", action: `/school/exam/take/${encodeURIComponent(course.id)}/${encodeURIComponent(exam.id)}` },
                        input({ type: "hidden", name: "returnTo", value: returnTo }),
                        exam.questions.map((question, qi) =>
                          div({ class: "school-exam-question" },
                            p(question.q),
                            question.options.map((opt, oi) =>
                              label({ class: "school-exam-option" },
                                input({ type: "radio", name: `q${qi}`, value: String(oi), required: true }),
                                ` ${opt}`
                              )
                            )
                          )
                        ),
                        button({ type: "submit" }, i18n.schoolExamSubmit)
                      )
              )
        ),
        isTeacher && !isFree(course)
          ? form({ method: "POST", action: `/school/exam/create/${encodeURIComponent(course.id)}` },
              input({ type: "hidden", name: "returnTo", value: returnTo }),
              label(i18n.schoolExamCreate), br,
              input({ type: "text", name: "title", maxlength: "120", required: true, placeholder: i18n.schoolExamTitlePlaceholder }), br(),
              label(i18n.schoolLessons), br,
              select({ name: "lessonId" },
                lessons.map(lesson => option({ value: lesson.id }, lesson.title || lesson.id))
              ), br(), br(),
              button({ type: "submit" }, i18n.schoolExamCreate)
            )
          : null
      )
    : null

  const lessonsBlock = div({ class: "school-lessons" },
    h2(`${i18n.schoolLessons} (${lessons.length})`),
    isTeacher || isStudent || isFree(course)
      ? (lessons.length
          ? lessons.map(lesson => renderLesson(lesson, course, isTeacher, returnTo, isStudent))
          : p(i18n.schoolNoLessons))
      : p(i18n.schoolEnrollToSee)
  )

  const certsBlock = !certificates.length ? null : div({ class: "school-certificates" },
    h2(`${i18n.schoolCertificates} (${certificates.length})`),
    certificates.length
      ? certificates.map(cert =>
          div({ class: "school-certificate" },
            span("🎓 "),
            userLink(cert.student),
            cert.text ? span(` — ${cert.text}`) : null,
            span({ class: "school-certificate-date" }, ` (${new Date(cert.createdAt).toLocaleDateString()})`)
          )
        )
      : p(i18n.schoolNoCertificates)
  )

  return template(
    course.title,
    section(div({ class: "tags-header" }, h2(i18n.schoolTitle), p(i18n.schoolDescription))),
    section(renderModeButtons("all")),
    section(
      div({ class: "tribe-details" },
        courseSide,
        div({ class: "tribe-main" },
          progressBlock,
          lessonsBlock,
          examsBlock,
          teacherProgress,
          isTeacher ? renderTeacherPanel(course, certificates, returnTo) : null,
          certsBlock,
          renderEngagement(course.id,
            isStudent && !isTeacher
              ? renderOpinionsVoting('/school/opinions', course.id, course.opinions, returnTo, course.opinions_inhabitants)
              : null,
            renderSharedCommentsSection({
              action: `/school/${encodeURIComponent(course.id)}/comments`,
              comments: safeArr(params.comments),
              returnTo
            })
          )
        )
      )
    )
  )
}

exports.clearnetCourseView = async (course, lessons = []) => {
  const { escapeHtml: esc, blobUrl: cnBlob, renderClearnetPage } = require("./clearnet_view")
  const title = esc(course.title || "Course")
  const desc = esc(course.description || "")
  const courseImg = cnBlob(course.image)
  const visibleLessons = safeArr(lessons).filter(lesson => !lesson.locked)
  const extraCss = `
.cn-course-title{color:var(--fg);margin:0 0 16px 0;font-size:32px;font-weight:700}
.cn-course-meta{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px}
.cn-course-meta-item{background:var(--bg-sub);border:1px solid var(--border);border-radius:6px;padding:8px 14px;font-size:14px;color:var(--fg-soft);display:inline-flex;align-items:center;gap:6px}
.cn-course-img{display:block;max-width:100%;border:1px solid var(--border);border-radius:8px;margin-bottom:20px}
.cn-course-section h2{color:var(--fg);font-size:18px;text-transform:uppercase;letter-spacing:2px;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--border)}
.cn-course-section p{color:var(--fg-soft);white-space:pre-wrap;line-height:1.6;font-size:15px}
.cn-lesson{background:var(--bg-sub);border:1px solid var(--border);border-radius:8px;padding:14px 18px;margin-bottom:12px}
.cn-lesson h3{color:var(--fg);margin:0 0 8px 0;font-size:16px}
.cn-lesson p{color:var(--fg-soft);white-space:pre-wrap;line-height:1.6;font-size:14px;margin:0}
.cn-lesson-date{color:var(--fg-dim);font-size:12px;margin-top:8px}
`
  const body = `
  <h1 class="cn-course-title">${title}</h1>
  <div class="cn-course-meta">
    <span class="cn-course-meta-item">🎓 Open course</span>
    ${course.startDate ? `<span class="cn-course-meta-item">📅 ${esc(new Date(course.startDate).toISOString().slice(0, 10))}</span>` : ""}
    <span class="cn-course-meta-item">👥 ${safeArr(course.students).length} students</span>
  </div>
  ${courseImg ? `<img class="cn-course-img" src="${courseImg}" alt="${title}">` : ""}
  ${desc ? `<div class="cn-course-section"><h2>Description</h2><p>${desc}</p></div>` : ""}
  ${visibleLessons.length ? `<div class="cn-course-section"><h2>Lessons (${visibleLessons.length})</h2>${visibleLessons.map(lesson => `
  <div class="cn-lesson">
    <h3>${esc(lesson.title || "")}</h3>
    <p>${esc(lesson.text || "")}</p>
    ${lesson.sessionDate ? `<div class="cn-lesson-date">📅 ${esc(new Date(lesson.sessionDate).toISOString().slice(0, 10))}</div>` : ""}
  </div>`).join("")}</div>` : ""}
`
  return renderClearnetPage({
    title: `${course.title || "Course"} — Oasis`,
    ogTitle: course.title || "Course",
    ogDescription: course.description || "",
    ogImage: courseImg,
    extraCss,
    body,
    hubFeedId: course.author || null
  })
}

const renderMaterial = (material, course, isTeacher) => {
  const { img, video, audio } = require("../server/node_modules/hyperaxe")
  const m = String(material.media || "")
  const ref = m.match(/\[(image|audio|video|pdf|torrent):([^\]]*)\]\(\s*(&[^)\s]+\.sha256)\s*\)/) || m.match(/^!?\[([^\]]*)\]\(\s*(&[^)\s]+\.sha256)\s*\)$/m)
  let body
  if (material.locked) body = p(i18n.schoolLessonLocked)
  else if (ref && ref.length === 4) {
    const kind = ref[1], name = ref[2], blobId = ref[3]
    const url = `/blob/${encodeURIComponent(blobId)}`
    if (kind === "pdf") body = div({ class: "pdf-viewer-container", id: `pdf-${material.id.slice(1, 9)}`, "data-pdf-url": url }, a({ href: url }, `📎 ${name || "PDF"}`))
    else if (kind === "image") body = img({ src: url, alt: name, class: "school-material-image" })
    else if (kind === "video") body = video({ controls: true, src: url, class: "post-video" })
    else if (kind === "audio") body = audio({ controls: true, src: url })
    else body = p(a({ href: url }, `📎 ${name || blobId}`))
  } else if (ref) {
    body = p(a({ href: `/blob/${encodeURIComponent(ref[2])}` }, `📎 ${ref[1] || ref[2]}`))
  } else {
    body = renderMd(m)
  }
  return div({ class: "school-material" },
    body,
    material.caption ? p({ class: "school-material-caption" }, material.caption) : null,
    isTeacher
      ? form({ method: "POST", action: `/school/lesson/media/delete/${encodeURIComponent(course.id)}/${encodeURIComponent(material.lessonId)}/${encodeURIComponent(material.id)}` },
          button({ type: "submit", class: "tribe-action-btn danger-btn" }, "DELETE")
        )
      : null
  )
}

exports.singleLessonView = async (course, lesson, materials = [], params = {}) => {
  const isTeacher = String(course.author) === String(userId)
  const isStudent = course.students.includes(userId)
  const courseUrl = `/school/course/${encodeURIComponent(course.id)}`
  const lessonUrl = `/school/lesson/${encodeURIComponent(course.id)}/${encodeURIComponent(lesson.id)}`

  const lessonSide = div({ class: "tribe-side" },
    div({ class: "card-header activity-card-header" },
      renderContentActions(lesson.id, courseUrl, { author: course.author, reportTitle: lesson.title || course.title })
    ),
    h2({ class: "tribe-card-title" }, a({ href: courseUrl }, course.title)),
    renderCourseChips(course),
    renderMediaBlob(course.image, '/assets/images/default-avatar.png', { class: 'tribe-detail-image' }),
    table({ class: "tribe-info-table" },
      lesson.unit ? tr(
        td({ class: "tribe-info-label" }, i18n.schoolLessonUnit),
        td({ class: "tribe-info-value", colspan: "3" }, lesson.unit)
      ) : null,
      lesson.sessionDate ? tr(
        td({ class: "tribe-info-label" }, i18n.schoolSessionDate),
        td({ class: "tribe-info-value", colspan: "3" }, new Date(lesson.sessionDate).toLocaleDateString())
      ) : null,
      tr(
        td({ class: "tribe-info-label" }, i18n.schoolTeacher),
        td({ class: "tribe-info-value", colspan: "3" }, userLink(course.author))
      )
    ),
    isStudent
      ? div({ class: "tribe-side-actions" },
          form({ method: "POST", action: `/school/lesson/complete/${encodeURIComponent(course.id)}/${encodeURIComponent(lesson.id)}` },
            input({ type: "hidden", name: "value", value: lesson.completed ? "false" : "true" }),
            input({ type: "hidden", name: "returnTo", value: lessonUrl }),
            button({ type: "submit", class: "tribe-action-btn" }, lesson.completed ? `✓ ${i18n.schoolProgressDone}` : i18n.schoolProgressMark)
          )
        )
      : null,
    isTeacher
      ? div({ class: "tribe-side-actions owner-actions" },
          form({ method: "GET", action: lessonUrl },
            input({ type: "hidden", name: "edit", value: "1" }),
            button({ type: "submit", class: "tribe-action-btn" }, i18n.chatUpdate)
          ),
          form({ method: "POST", action: `/school/lesson/delete/${encodeURIComponent(course.id)}/${encodeURIComponent(lesson.id)}` },
            input({ type: "hidden", name: "returnTo", value: courseUrl }),
            button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.chatDelete)
          )
        )
      : null
  )

  const lessonMain = div({ class: "tribe-main" },
    params.edit && isTeacher
      ? div({ class: "create-tribe-form" },
          h2(i18n.chatUpdate),
          form({ method: "POST", action: `/school/lesson/update/${encodeURIComponent(course.id)}/${encodeURIComponent(lesson.id)}` },
            label(i18n.title), br,
            input({ type: "text", name: "title", maxlength: "120", required: true, value: lesson.title || "" }), br(),
            textarea({ name: "text", rows: 5, required: true }, lesson.text || ""), br,
            label(i18n.schoolLessonUnit), br,
            input({ type: "text", name: "unit", maxlength: "60", value: lesson.unit || "" }), br(),
            label(i18n.schoolLessonOrder), br,
            input({ type: "number", name: "order", min: "0", step: "1", value: lesson.order != null ? String(lesson.order) : "" }), br(), br(),
            label(i18n.schoolSessionDate), br,
            input({ type: "date", name: "sessionDate", min: new Date().toISOString().slice(0, 10), value: lesson.sessionDate ? String(lesson.sessionDate).slice(0, 10) : "" }), br(), br(),
            button({ type: "submit" }, i18n.chatUpdate)
          )
        )
      : div({ class: "school-lesson" },
      h2(lesson.title),
      renderMd(lesson.text)
    ),
    div({ class: "school-materials" },
      h2(`${i18n.schoolMaterials} (${safeArr(materials).length})`),
      safeArr(materials).length
        ? materials.map(material => renderMaterial(material, course, isTeacher))
        : p(i18n.schoolNoMaterials)
    ),
    isTeacher
      ? div({ class: "create-tribe-form" },
          h2(i18n.schoolAddMaterial),
          form({ method: "POST", action: `/school/lesson/media/${encodeURIComponent(course.id)}/${encodeURIComponent(lesson.id)}`, enctype: "multipart/form-data" },
            label(i18n.blogImage), br,
            input({ type: "file", name: "files", multiple: true, accept: "image/*,video/*,audio/*,application/pdf,.md,.txt,.epub,.zip" }), br(), br(),
            label(i18n.title), br,
            input({ type: "text", name: "caption", maxlength: "120" }), br(), br(),
            label(i18n.description), br,
            textarea({ name: "text", rows: 3, placeholder: i18n.schoolMaterialTextPlaceholder }), br,
            button({ type: "submit" }, i18n.schoolAddMaterial)
          )
        )
      : null
  )

  const tpl = template(
    lesson.title,
    section(div({ class: "tags-header" }, h2(i18n.schoolTitle), p(i18n.schoolDescription))),
    section(renderModeButtons("all")),
    section(div({ class: "tribe-details" }, lessonSide, lessonMain))
  )
  const hasPdf = safeArr(materials).some(m => !m.locked && /\[pdf:/.test(String(m.media || "")))
  return hasPdf ? `${tpl}<script type="module" src="/js/pdf.min.mjs"></script><script src="/js/pdf-viewer.js"></script>` : tpl
}

exports.schoolInvitePage = (code) => {
  return template(
    i18n.schoolTitle,
    section(
      div({ class: "invite-page" },
        h2(i18n.tribeInviteCodeText, " ", code),
        form({ method: "GET", action: "/school" },
          button({ type: "submit", class: "filter-btn" }, i18n.walletBack)
        )
      )
    )
  )
}
