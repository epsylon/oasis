const { form, button, div, h2, p, section, input, label, textarea, br, a, span, select, option, img, progress } = require("../server/node_modules/hyperaxe")
const { template, i18n } = require("./main_views")
const moment = require("../server/node_modules/moment")
const { config } = require("../server/SSB_server.js")
const { renderUrl } = require("../backend/renderUrl")

const userId = config.keys.id

const FILTERS = [
  { key: "ALL", i18n: "jobsFilterAll", title: "jobsAllTitle" },
  { key: "MINE", i18n: "jobsFilterMine", title: "jobsMineTitle" },
  { key: "APPLIED", i18n: "jobsFilterApplied", title: "jobsAppliedTitle" },
  { key: "REMOTE", i18n: "jobsFilterRemote", title: "jobsRemoteTitle" },
  { key: "PRESENCIAL", i18n: "jobsFilterPresencial", title: "jobsPresencialTitle" },
  { key: "FREELANCER", i18n: "jobsFilterFreelancer", title: "jobsFreelancerTitle" },
  { key: "EMPLOYEE", i18n: "jobsFilterEmployee", title: "jobsEmployeeTitle" },
  { key: "OPEN", i18n: "jobsFilterOpen", title: "jobsOpenTitle" },
  { key: "CLOSED", i18n: "jobsFilterClosed", title: "jobsClosedTitle" },
  { key: "RECENT", i18n: "jobsFilterRecent", title: "jobsRecentTitle" },
  { key: "TOP", i18n: "jobsFilterTop", title: "jobsTopTitle" },
  { key: "CV", i18n: "jobsCV", title: "jobsCVTitle" }
]

function resolvePhoto(photoField, size = 256) {
  if (typeof photoField === "string" && photoField.startsWith("/image/")) return photoField
  if (typeof photoField === "string" && /^&[A-Za-z0-9+/=]+\.sha256$/.test(photoField)) return `/image/${size}/${encodeURIComponent(photoField)}`
  return "/assets/images/default-avatar.png"
}

const safeArr = (v) => (Array.isArray(v) ? v : [])
const safeText = (v) => String(v || "").trim()

const parseNum = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."))
  return Number.isFinite(n) ? n : NaN
}

const fmtSalary = (v) => {
  const n = parseNum(v)
  return Number.isFinite(n) ? n.toFixed(6) : String(v ?? "")
}

const buildReturnTo = (filter, params = {}) => {
  const f = safeText(filter || "ALL")
  const q = safeText(params.search || params.q || "")
  const minSalary = params.minSalary ?? ""
  const maxSalary = params.maxSalary ?? ""
  const sort = safeText(params.sort || "")
  const parts = [`filter=${encodeURIComponent(f)}`]
  if (q) parts.push(`search=${encodeURIComponent(q)}`)
  if (String(minSalary) !== "") parts.push(`minSalary=${encodeURIComponent(String(minSalary))}`)
  if (String(maxSalary) !== "") parts.push(`maxSalary=${encodeURIComponent(String(maxSalary))}`)
  if (sort) parts.push(`sort=${encodeURIComponent(sort)}`)
  return `/jobs?${parts.join("&")}`
}

const renderPmButton = (recipientId) =>
  recipientId && String(recipientId) !== String(userId)
    ? form(
        { method: "GET", action: "/pm" },
        input({ type: "hidden", name: "recipients", value: recipientId }),
        button({ type: "submit", class: "filter-btn" }, i18n.privateMessage)
      )
    : null

const renderCardField = (labelText, value) =>
  div(
    { class: "card-field" },
    span({ class: "card-label" }, labelText),
    span({ class: "card-value" }, String(value ?? ""))
  )

const renderCardFieldRich = (labelText, parts) =>
  div(
    { class: "card-field" },
    span({ class: "card-label" }, labelText),
    span({ class: "card-value" }, ...(Array.isArray(parts) ? parts : [String(parts ?? "")]))
  )

const renderTags = (tags = []) => {
  const arr = safeArr(tags).map((t) => String(t || "").trim()).filter(Boolean)
  return arr.length
    ? div(
        { class: "card-tags" },
        arr.map((tag) => a({ class: "tag-link", href: `/search?query=%23${encodeURIComponent(tag)}` }, `#${tag}`))
      )
    : null
}

const renderApplicantsProgress = (subsCount, vacants) => {
  const s = Math.max(0, Number(subsCount || 0))
  const v = Math.max(1, Number(vacants || 1))
  return div(
    { class: "confirmations-block" },
    div(
      { class: "card-field" },
      span({ class: "card-label" }, `${i18n.jobsApplicants}: `),
      span({ class: "card-value" }, `${s}/${v}`)
    ),
    progress({ class: "confirmations-progress", value: s, max: v })
  )
}

const renderSubscribers = (subs = []) => {
  const n = safeArr(subs).length
  return div(
    { class: "card-field" },
    span({ class: "card-label" }, `${i18n.jobSubscribers}:`),
    span({ class: "card-value" }, n > 0 ? String(n) : i18n.noSubscribers.toUpperCase())
  )
}

const renderUpdatedLabel = (createdAt, updatedAt) => {
  const createdTs = createdAt ? new Date(createdAt).getTime() : NaN
  const updatedTs = updatedAt ? new Date(updatedAt).getTime() : NaN
  const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs)
  return showUpdated
    ? span({ class: "votations-comment-date" }, ` | ${i18n.jobsUpdatedAt}: ${moment(updatedAt).format("YYYY/MM/DD HH:mm:ss")}`)
    : null
}

const renderJobOwnerActions = (job, returnTo) => {
  const isAuthor = String(job.author) === String(userId)
  if (!isAuthor) return []
  const isOpen = String(job.status || "").toUpperCase() === "OPEN"
  return [
    form(
      { method: "POST", action: `/jobs/status/${encodeURIComponent(job.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "status-btn", type: "submit", name: "status", value: isOpen ? "CLOSED" : "OPEN" }, isOpen ? i18n.jobSetClosed : i18n.jobSetOpen)
    ),
    form(
      { method: "GET", action: `/jobs/edit/${encodeURIComponent(job.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "update-btn", type: "submit" }, i18n.jobsUpdateButton)
    ),
    form(
      { method: "POST", action: `/jobs/delete/${encodeURIComponent(job.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "delete-btn", type: "submit" }, i18n.jobsDeleteButton)
    )
  ]
}

const renderJobTopbar = (job, filter, params = {}) => {
  const returnTo = buildReturnTo(filter, params)
  const isAuthor = String(job.author) === String(userId)
  const isOpen = String(job.status || "").toUpperCase() === "OPEN"
  const subs = safeArr(job.subscribers)
  const isSubscribed = subs.includes(userId)
  const isSingle = params && params.single === true

  const chips = []
  if (isSubscribed) chips.push(span({ class: "chip chip-you" }, i18n.jobsAppliedBadge))

  const leftActions = []

  if (!isSingle) {
    leftActions.push(
      form(
        { method: "GET", action: `/jobs/${encodeURIComponent(job.id)}` },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        input({ type: "hidden", name: "filter", value: filter || "ALL" }),
        params.search ? input({ type: "hidden", name: "search", value: params.search }) : null,
        params.minSalary !== undefined ? input({ type: "hidden", name: "minSalary", value: String(params.minSalary ?? "") }) : null,
        params.maxSalary !== undefined ? input({ type: "hidden", name: "maxSalary", value: String(params.maxSalary ?? "") }) : null,
        params.sort ? input({ type: "hidden", name: "sort", value: params.sort }) : null,
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetailsButton)
      )
    )
  }

  leftActions.push(renderPmButton(job.author))

  if (!isAuthor && isOpen) {
    leftActions.push(
      isSubscribed
        ? form(
            { method: "POST", action: `/jobs/unsubscribe/${encodeURIComponent(job.id)}` },
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            button({ type: "submit", class: "filter-btn" }, i18n.jobUnsubscribeButton)
          )
        : form(
            { method: "POST", action: `/jobs/subscribe/${encodeURIComponent(job.id)}` },
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            button({ type: "submit", class: "filter-btn" }, i18n.jobSubscribeButton)
          )
    )
  }

  const leftChildren = []
  if (chips.length) leftChildren.push(div({ class: "transfer-chips" }, ...chips))
  const leftActionNodes = leftActions.filter(Boolean)
  if (leftActionNodes.length) leftChildren.push(...leftActionNodes)

  const ownerActions = renderJobOwnerActions(job, returnTo)
  const leftNode = leftChildren.length ? div({ class: "bookmark-topbar-left transfer-topbar-left" }, ...leftChildren) : null
  const actionsNode = ownerActions.length ? div({ class: "bookmark-actions transfer-actions" }, ...ownerActions) : null

  const topbarChildren = []
  if (leftNode) topbarChildren.push(leftNode)
  if (actionsNode) topbarChildren.push(actionsNode)

  const topbarClass = isSingle ? "bookmark-topbar transfer-topbar-single" : "bookmark-topbar"
  return topbarChildren.length ? div({ class: topbarClass }, ...topbarChildren) : null
}

const renderJobList = (jobs, filter, params = {}) => {
  const returnTo = buildReturnTo(filter, params)
  const list = safeArr(jobs)

  return list.length
    ? list.map((job) => {
        const topbar = renderJobTopbar(job, filter, params)
        const subs = safeArr(job.subscribers)
        const tagsNode = renderTags(job.tags)
        const salaryText = `${fmtSalary(job.salary)} ECO`

        return div(
          { class: "job-card" },
          topbar ? topbar : null,
          safeText(job.title) ? h2(job.title) : null,
          job.image ? div({ class: "activity-image-preview" }, img({ src: `/blob/${encodeURIComponent(job.image)}` })) : null,
          tagsNode ? tagsNode : null,
          br(),
          safeText(job.description) ? renderCardFieldRich(`${i18n.jobDescription}:`, renderUrl(job.description)) : null,
          br(),
          renderApplicantsProgress(subs.length, job.vacants),
          renderSubscribers(subs),
          renderCardField(`${i18n.jobStatus}:`, i18n["jobStatus" + String(job.status || "").toUpperCase()] || String(job.status || "").toUpperCase()),
          renderCardField(`${i18n.jobLanguages}:`, String(job.languages || "").toUpperCase()),
          renderCardField(`${i18n.jobType}:`, i18n["jobType" + String(job.job_type || "").toUpperCase()] || String(job.job_type || "").toUpperCase()),
          renderCardField(`${i18n.jobLocation}:`, String(job.location || "").toUpperCase()),
          renderCardField(`${i18n.jobTime}:`, i18n["jobTime" + String(job.job_time || "").toUpperCase()] || String(job.job_time || "").toUpperCase()),
          renderCardField(`${i18n.jobVacants}:`, job.vacants),
          safeText(job.requirements) ? renderCardFieldRich(`${i18n.jobRequirements}:`, renderUrl(job.requirements)) : null,
          safeText(job.tasks) ? renderCardFieldRich(`${i18n.jobTasks}:`, renderUrl(job.tasks)) : null,
          renderCardFieldRich(`${i18n.jobSalary}:`, [span({ class: "card-salary" }, salaryText)]),
          br(),
          div(
            { class: "card-comments-summary" },
            span({ class: "card-label" }, i18n.voteCommentsLabel + ":"),
            span({ class: "card-value" }, String(job.commentCount || 0)),
            br(),
            br(),
            form(
              { method: "GET", action: `/jobs/${encodeURIComponent(job.id)}#comments` },
              input({ type: "hidden", name: "returnTo", value: returnTo }),
              input({ type: "hidden", name: "filter", value: filter || "ALL" }),
              params.search ? input({ type: "hidden", name: "search", value: params.search }) : null,
              params.minSalary !== undefined ? input({ type: "hidden", name: "minSalary", value: String(params.minSalary ?? "") }) : null,
              params.maxSalary !== undefined ? input({ type: "hidden", name: "maxSalary", value: String(params.maxSalary ?? "") }) : null,
              params.sort ? input({ type: "hidden", name: "sort", value: params.sort }) : null,
              button({ type: "submit", class: "filter-btn" }, i18n.voteCommentsForumButton)
            )
          ),
          p(
            { class: "card-footer" },
            span({ class: "date-link" }, `${moment(job.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
            a({ href: `/author/${encodeURIComponent(job.author)}`, class: "user-link" }, job.author),
            renderUpdatedLabel(job.createdAt, job.updatedAt)
          )
        )
      })
    : p(i18n.noJobsMatch || i18n.noJobsFound)
}

const renderJobForm = (job = {}, mode = "create") => {
  const isEdit = mode === "edit"
  return div(
    { class: "div-center job-form" },
    form(
      {
        action: isEdit ? `/jobs/update/${encodeURIComponent(job.id)}` : "/jobs/create",
        method: "POST",
        enctype: "multipart/form-data"
      },
      input({ type: "hidden", name: "returnTo", value: "/jobs?filter=MINE" }),
      label(i18n.jobType),
      br(),
      select(
        { name: "job_type", required: true },
        option({ value: "freelancer", selected: job.job_type === "freelancer" }, i18n.jobTypeFreelance),
        option({ value: "employee", selected: job.job_type === "employee" }, i18n.jobTypeSalary)
      ),
      br(),
      br(),
      label(i18n.jobTitle),
      br(),
      input({ type: "text", name: "title", required: true, placeholder: i18n.jobTitlePlaceholder, value: job.title || "" }),
      br(),
      br(),
      label(i18n.jobImage),
      br(),
      input({ type: "file", name: "image", accept: "image/*" }),
      br(),
      job.image ? img({ src: `/blob/${encodeURIComponent(job.image)}`, class: "existing-image" }) : null,
      br(),
      label(i18n.jobDescription),
      br(),
      textarea({ name: "description", rows: "6", required: true, placeholder: i18n.jobDescriptionPlaceholder }, job.description || ""),
      br(),
      br(),
      label(i18n.jobRequirements),
      br(),
      textarea({ name: "requirements", rows: "6", placeholder: i18n.jobRequirementsPlaceholder }, job.requirements || ""),
      br(),
      br(),
      label(i18n.jobsTagsLabel),
      br(),
      input({ type: "text", name: "tags", value: Array.isArray(job.tags) ? job.tags.join(", ") : (job.tags || "") }),
      br(),
      br(),
      label(i18n.jobLanguages),
      br(),
      input({ type: "text", name: "languages", placeholder: i18n.jobLanguagesPlaceholder, value: job.languages || "" }),
      br(),
      br(),
      label(i18n.jobTime),
      br(),
      select(
        { name: "job_time", required: true },
        option({ value: "partial", selected: job.job_time === "partial" }, i18n.jobTimePartial),
        option({ value: "complete", selected: job.job_time === "complete" }, i18n.jobTimeComplete)
      ),
      br(),
      br(),
      label(i18n.jobTasks),
      br(),
      textarea({ name: "tasks", rows: "6", placeholder: i18n.jobTasksPlaceholder }, job.tasks || ""),
      br(),
      br(),
      label(i18n.jobLocation),
      br(),
      select(
        { name: "location", required: true },
        option({ value: "remote", selected: job.location === "remote" }, i18n.jobLocationRemote),
        option({ value: "presencial", selected: job.location === "presencial" }, i18n.jobLocationPresencial)
      ),
      br(),
      br(),
      label(i18n.jobVacants),
      br(),
      input({ type: "number", name: "vacants", min: "1", placeholder: i18n.jobVacantsPlaceholder, value: job.vacants || 1, required: true }),
      br(),
      br(),
      label(i18n.jobSalary),
      br(),
      input({ type: "number", name: "salary", step: "0.000001", min: "0", placeholder: i18n.jobSalaryPlaceholder, value: job.salary || "" }),
      br(),
      br(),
      button({ type: "submit" }, isEdit ? i18n.jobsUpdateButton : i18n.createJobButton)
    )
  )
}

const renderCVList = (inhabitants) =>
  div(
    { class: "cv-list" },
    safeArr(inhabitants).length
      ? safeArr(inhabitants).map((user) => {
          const isMe = String(user.id) === String(userId)
          return div(
            { class: "inhabitant-card" },
            img({ class: "inhabitant-photo", src: resolvePhoto(user.photo) }),
            div(
              { class: "inhabitant-details" },
              h2(user.name),
              user.description ? p(...renderUrl(user.description)) : null,
              p(a({ class: "user-link", href: `/author/${encodeURIComponent(user.id)}` }, user.id)),
              div(
                { class: "cv-actions" },
                form({ method: "GET", action: `/inhabitant/${encodeURIComponent(user.id)}` }, button({ type: "submit", class: "filter-btn" }, i18n.inhabitantviewDetails)),
                !isMe ? renderPmButton(user.id) : null
              )
            )
          )
        })
      : p({ class: "no-results" }, i18n.noInhabitantsFound)
  )

exports.jobsView = async (jobsOrCVs, filter = "ALL", params = {}) => {
  const search = safeText(params.search || "")
  const minSalary = params.minSalary ?? ""
  const maxSalary = params.maxSalary ?? ""
  const sort = safeText(params.sort || "recent")

  const filterObj = FILTERS.find((f) => f.key === filter) || FILTERS[0]
  const sectionTitle = i18n[filterObj.title] || i18n.jobsTitle

  return template(
    i18n.jobsTitle,
    section(
      div({ class: "tags-header" }, h2(sectionTitle), p(i18n.jobsDescription)),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/jobs", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "search", value: search }),
          input({ type: "hidden", name: "minSalary", value: String(minSalary ?? "") }),
          input({ type: "hidden", name: "maxSalary", value: String(maxSalary ?? "") }),
          input({ type: "hidden", name: "sort", value: sort }),
          ...FILTERS.map((f) =>
            button({ type: "submit", name: "filter", value: f.key, class: filter === f.key ? "filter-btn active" : "filter-btn" }, i18n[f.i18n])
          ),
          button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.jobsCreateJob)
        )
      )
    ),
    section(
      filter === "CV"
        ? section(
            form(
              { method: "GET", action: "/jobs", class: "cv-filter-form" },
              input({ type: "hidden", name: "filter", value: "CV" }),
              input({ type: "text", name: "location", placeholder: i18n.filterLocation, value: params.location || "" }),
              input({ type: "text", name: "language", placeholder: i18n.filterLanguage, value: params.language || "" }),
              input({ type: "text", name: "skills", placeholder: i18n.filterSkills, value: params.skills || "" }),
              button({ type: "submit", class: "filter-btn" }, i18n.applyFilters)
            ),
            br(),
            renderCVList(jobsOrCVs)
          )
        : filter === "CREATE" || filter === "EDIT"
          ? (() => {
              const jobToEdit = filter === "EDIT" ? (Array.isArray(jobsOrCVs) ? jobsOrCVs[0] : {}) : {}
              return renderJobForm(jobToEdit, filter === "EDIT" ? "edit" : "create")
            })()
          : section(
              div(
                { class: "jobs-search" },
                form(
                  { method: "GET", action: "/jobs", class: "filter-box" },
                  input({ type: "hidden", name: "filter", value: filter || "ALL" }),
                  input({ type: "text", name: "search", value: search, placeholder: i18n.jobsSearchPlaceholder, class: "filter-box__input" }),
                  div(
                    { class: "filter-box__controls" },
                    div(
                      { class: "transfer-range" },
                      input({ type: "number", name: "minSalary", step: "0.000001", min: "0", value: String(minSalary ?? ""), placeholder: i18n.jobsMinSalaryLabel, class: "filter-box__number transfer-amount-input" }),
                      input({ type: "number", name: "maxSalary", step: "0.000001", min: "0", value: String(maxSalary ?? ""), placeholder: i18n.jobsMaxSalaryLabel, class: "filter-box__number transfer-amount-input" })
                    ),
                    select(
                      { name: "sort", class: "filter-box__select" },
                      option({ value: "recent", selected: sort === "recent" }, i18n.jobsSortRecent),
                      option({ value: "salary", selected: sort === "salary" }, i18n.jobsSortSalary),
                      option({ value: "subscribers", selected: sort === "subscribers" }, i18n.jobsSortSubscribers)
                    ),
                    button({ type: "submit", class: "filter-box__button" }, i18n.jobsSearchButton)
                  )
                )
              ),
              br(),
              div({ class: "jobs-list" }, renderJobList(jobsOrCVs, filter, { ...params, search, minSalary, maxSalary, sort }))
            )
    )
  )
}

const renderJobCommentsSection = (jobId, returnTo, comments = []) => {
  const list = safeArr(comments)
  const commentsCount = list.length

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
        { method: "POST", action: `/jobs/${encodeURIComponent(jobId)}/comments`, class: "comment-form" },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        textarea({ id: "comment-text", name: "text", required: true, rows: 4, class: "comment-textarea", placeholder: i18n.voteNewCommentPlaceholder }),
        br(),
        button({ type: "submit", class: "comment-submit-btn" }, i18n.voteNewCommentButton)
      )
    ),
    list.length
      ? div(
          { class: "comments-list" },
          list.map((c) => {
            const author = c?.value?.author || ""
            const ts = c?.value?.timestamp || c?.timestamp
            const absDate = ts ? moment(ts).format("YYYY/MM/DD HH:mm:ss") : ""
            const relDate = ts ? moment(ts).fromNow() : ""
            const userName = author && author.includes("@") ? author.split("@")[1] : author
            const rootId = c?.value?.content ? (c.value.content.fork || c.value.content.root) : null
            const text = c?.value?.content?.text || ""

            return div(
              { class: "votations-comment-card" },
              span(
                { class: "created-at" },
                span(i18n.createdBy),
                author ? a({ href: `/author/${encodeURIComponent(author)}` }, `@${userName}`) : span("(unknown)"),
                absDate ? span(" | ") : "",
                absDate ? span({ class: "votations-comment-date" }, absDate) : "",
                relDate ? span({ class: "votations-comment-date" }, " | ", i18n.sendTime) : "",
                relDate && rootId ? a({ href: `/thread/${encodeURIComponent(rootId)}#${encodeURIComponent(c.key)}` }, relDate) : ""
              ),
              p({ class: "votations-comment-text" }, ...renderUrl(text))
            )
          })
        )
      : p({ class: "votations-no-comments" }, i18n.voteNoCommentsYet)
  )
}

exports.singleJobsView = async (job, filter = "ALL", comments = [], params = {}) => {
  const returnTo = safeText(params.returnTo) || buildReturnTo(filter, params)
  const topbar = renderJobTopbar(job, filter, { ...params, single: true })
  const subs = safeArr(job.subscribers)
  const tagsNode = renderTags(job.tags)
  const salaryText = `${fmtSalary(job.salary)} ECO`

  return template(
    i18n.jobsTitle,
    section(
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/jobs", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "search", value: safeText(params.search || "") }),
          input({ type: "hidden", name: "minSalary", value: String(params.minSalary ?? "") }),
          input({ type: "hidden", name: "maxSalary", value: String(params.maxSalary ?? "") }),
          input({ type: "hidden", name: "sort", value: safeText(params.sort || "recent") }),
          ...FILTERS.map((f) =>
            button({ type: "submit", name: "filter", value: f.key, class: filter === f.key ? "filter-btn active" : "filter-btn" }, i18n[f.i18n])
          ),
          button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.jobsCreateJob)
        )
      ),
      div(
        { class: "job-card" },
        topbar ? topbar : null,
        safeText(job.title) ? h2(job.title) : null,
        job.image ? div({ class: "activity-image-preview" }, img({ src: `/blob/${encodeURIComponent(job.image)}` })) : null,
        tagsNode ? tagsNode : null,
        br(),
        safeText(job.description) ? renderCardFieldRich(`${i18n.jobDescription}:`, renderUrl(job.description)) : null,
        br(),
        renderApplicantsProgress(subs.length, job.vacants),
        renderSubscribers(subs),
        renderCardField(`${i18n.jobStatus}:`, i18n["jobStatus" + String(job.status || "").toUpperCase()] || String(job.status || "").toUpperCase()),
        renderCardField(`${i18n.jobLanguages}:`, String(job.languages || "").toUpperCase()),
        renderCardField(`${i18n.jobType}:`, i18n["jobType" + String(job.job_type || "").toUpperCase()] || String(job.job_type || "").toUpperCase()),
        renderCardField(`${i18n.jobLocation}:`, String(job.location || "").toUpperCase()),
        renderCardField(`${i18n.jobTime}:`, i18n["jobTime" + String(job.job_time || "").toUpperCase()] || String(job.job_time || "").toUpperCase()),
        renderCardField(`${i18n.jobVacants}:`, job.vacants),
        safeText(job.requirements) ? renderCardFieldRich(`${i18n.jobRequirements}:`, renderUrl(job.requirements)) : null,
        safeText(job.tasks) ? renderCardFieldRich(`${i18n.jobTasks}:`, renderUrl(job.tasks)) : null,
        renderCardFieldRich(`${i18n.jobSalary}:`, [span({ class: "card-salary" }, salaryText)]),
        br(),
        p(
          { class: "card-footer" },
          span({ class: "date-link" }, `${moment(job.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
          a({ href: `/author/${encodeURIComponent(job.author)}`, class: "user-link" }, job.author),
          renderUpdatedLabel(job.createdAt, job.updatedAt)
        )
      ),
      div({ id: "comments" }, renderJobCommentsSection(job.id, returnTo, comments))
    )
  )
}

