const { form, button, div, h2, p, section, input, label, textarea, br, a, span, select, option, img, progress, video, audio, table, tr, td } = require("../server/node_modules/hyperaxe")
const { template, i18n, userLink, renderStateChip, renderOpenClosedChip, renderVisibilityChip, renderLifespanChip, renderEcoTax, renderSpreadButton, renderContentActions } = require("./main_views")
const moment = require("../server/node_modules/moment")
const { config } = require("../server/SSB_server.js")
const { renderUrl } = require("../backend/renderUrl")
const { renderMapLocationUrl, renderMapEmbed, renderMapLocationVisitLabel } = require("./maps_view")

const renderMediaBlob = (value, attrs = {}) => {
  if (!value) return null
  const s = String(value).trim()
  if (!s) return null
  if (s.startsWith('&')) return img({ src: `/blob/${encodeURIComponent(s)}`, ...attrs })
  const mVideo = s.match(/\[video:[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mVideo) return video({ controls: true, class: attrs.class || 'post-video', src: `/blob/${encodeURIComponent(mVideo[1])}` })
  const mAudio = s.match(/\[audio:[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mAudio) return audio({ controls: true, class: attrs.class || 'post-audio', src: `/blob/${encodeURIComponent(mAudio[1])}` })
  const mImg = s.match(/!\[[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mImg) return img({ src: `/blob/${encodeURIComponent(mImg[1])}`, class: attrs.class || 'post-image' })
  return null
}

const userId = config.keys.id

const FILTERS = [
  { key: "ALL", i18n: "jobsFilterAll", title: "jobsAllTitle" },
  { key: "MINE", i18n: "jobsFilterMine", title: "jobsMineTitle" },
  { key: "APPLIED", i18n: "jobsFilterApplied", title: "jobsAppliedTitle" },
  { key: "REMOTE", i18n: "jobsFilterRemote", title: "jobsRemoteTitle" },
  { key: "PRESENCIAL", i18n: "jobsFilterPresencial", title: "jobsPresencialTitle" },
  { key: "FREELANCER", i18n: "jobsFilterFreelancer", title: "jobsFreelancerTitle" },
  { key: "EMPLOYEE", i18n: "jobsFilterEmployee", title: "jobsEmployeeTitle" },
  { key: "EXCHANGE", i18n: "jobsFilterExchange", title: "jobsExchangeTitle" },
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
  const colorClass = s < v ? "applicants-under" : s === v ? "applicants-at" : "applicants-over"
  return div(
    { class: "confirmations-block" },
    div(
      { class: "card-field" },
      span({ class: "card-label" }, `${i18n.jobsApplicants}: `),
      span({ class: `card-value ${colorClass}` }, `${s}/${v}`)
    ),
    progress({ class: "confirmations-progress", value: s, max: v })
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

const renderJobStatusChip = (status) => {
  const s = String(status || "").toUpperCase()
  const localized = i18n["jobStatus" + s]
  return renderOpenClosedChip(s, { statusChipOPEN: localized || "OPEN", statusChipCLOSED: localized || "CLOSED" })
}

const renderJobAppliedChip = () =>
  renderStateChip("whole", "★", i18n.jobsAppliedBadge)

const renderJobHiddenChip = () =>
  renderVisibilityChip("HIDDEN", i18n)

const renderJobApplyToggle = (job, returnTo) => {
  const isAuthor = String(job.author) === String(userId)
  const isOpen = String(job.status || "").toUpperCase() === "OPEN"
  if (isAuthor || !isOpen) return null
  const isSubscribed = safeArr(job.subscribers).includes(userId)
  return isSubscribed
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
}

const renderJobInfoTable = (job, opts = {}) => {
  const rows = []
  const typeLabel = i18n["jobType" + String(job.job_type || "").toUpperCase()] || String(job.job_type || "").toUpperCase()
  const locLabel = String(job.location || "").toUpperCase()
  const timeLabel = i18n["jobTime" + String(job.job_time || "").toUpperCase()] || String(job.job_time || "").toUpperCase()
  const langLabel = String(job.languages || "").toUpperCase()
  const pushRow = (labelText, valueNode, valueClass) =>
    rows.push(tr(
      td({ class: "tribe-info-label" }, labelText),
      td({ class: `tribe-info-value${valueClass ? " " + valueClass : ""}` }, valueNode)
    ))
  pushRow(i18n.jobType, typeLabel || "—")
  pushRow(i18n.jobLocation, locLabel || "—")
  pushRow(i18n.jobTime, timeLabel || "—")
  if (String(job.job_type || "").toLowerCase() !== "exchange") {
    pushRow(i18n.jobSalary, `${fmtSalary(job.salary)} ECO`, "card-salary")
  }
  if (opts.includeVacants) pushRow(i18n.jobVacants, String(job.vacants ?? 1))
  if (job.mapUrl) {
    const mapNode = renderMapLocationVisitLabel(job.mapUrl)
    if (mapNode) pushRow(i18n.mapLocationTitle || "Map", mapNode)
  }
  return table({ class: "tribe-info-table jobs-info-table" }, ...rows)
}

const renderJobExtraDetails = (job) => {
  const langLabel = String(job.languages || "").toUpperCase()
  const isExchange = String(job.job_type || "").toLowerCase() === "exchange"
  const skill = safeText(job.exchangeSkill)
  if (!langLabel && !isExchange) return null
  const rows = []
  const pushRow = (labelText, valueNode) =>
    rows.push(tr(
      td({ class: "tribe-info-label" }, labelText),
      td({ class: "tribe-info-value" }, valueNode)
    ))
  if (langLabel) pushRow(i18n.jobLanguages, langLabel)
  if (isExchange) {
    pushRow(i18n.jobsHoursOffered || "Hours offered", `${Number(job.hoursOffered) || 0} h`)
    pushRow(i18n.jobsHoursRequested || "Hours requested", `${Number(job.hoursRequested) || 0} h`)
    if (skill) pushRow(i18n.jobsExchangeSkill || "Skill", skill)
  }
  return table({ class: "tribe-info-table jobs-info-table" }, ...rows)
}

const renderJobList = exports.renderJobList = (jobs, filter, params = {}) => {
  const list = safeArr(jobs)

  if (!list.length) return p(i18n.noJobsMatch || i18n.noJobsFound)

  return div({ class: "jobs-grid" },
    list.map((job) => {
      const subs = safeArr(job.subscribers)
      const isSubscribed = subs.includes(userId)
      const heroNode = job.image
        ? div({ class: "tribe-card-image-wrapper" },
            a({ href: `/jobs/${encodeURIComponent(job.id)}` },
              renderMediaBlob(job.image, { class: "tribe-card-hero-image" })
            )
          )
        : null
      const isHidden = String(job.visibility || "PUBLIC").toUpperCase() === "HIDDEN"
      const chips = [
        renderJobStatusChip(job.status),
        isHidden ? renderJobHiddenChip() : null,
        isSubscribed ? renderJobAppliedChip() : null,
        renderLifespanChip(job.lifetime, i18n)
      ].filter(Boolean)
      const isExchange = String(job.job_type || "").toLowerCase() === "exchange"
      const compensationText = isExchange
        ? `${Number(job.hoursOffered) || 0}h ⇄ ${Number(job.hoursRequested) || 0}h`
        : `${fmtSalary(job.salary)} ECO`

      const isOwn = job.author && String(job.author) === String(userId)
      return div({ class: "trending-card job-card" + (isOwn ? " own-content" : "") },
        div(
          { class: "card-header activity-card-header" },
          span(),
          renderContentActions(job.id, `/jobs/${encodeURIComponent(job.id)}`)
        ),
        div({ class: "card-section job-card-body" },
          heroNode,
          div({ class: "tribe-card-body" },
            div({ class: "shop-title-row" },
              h2({ class: "tribe-card-title" },
                a({ href: `/jobs/${encodeURIComponent(job.id)}` }, safeText(job.title) || i18n.jobsTitle)
              )
            ),
            chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
            div({ class: "card-date-highlight" }, compensationText),
            div({ class: "tribe-card-members" },
              span({ class: "tribe-members-count" }, `${i18n.jobSubscribers}: ${subs.length}`)
            ),
            div({ class: "card-spread-centered" }, renderSpreadButton(job.id, params.spreadMap && params.spreadMap.get(job.id)))
          )
        )
      )
    })
  )
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
        option({ value: "freelancer", selected: job.job_type === "freelancer" ? "selected" : undefined }, i18n.jobTypeFreelance),
        option({ value: "employee", selected: job.job_type === "employee" ? "selected" : undefined }, i18n.jobTypeSalary),
        option({ value: "exchange", selected: job.job_type === "exchange" ? "selected" : undefined }, i18n.jobTypeExchange || "Hour exchange")
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
      input({ type: "file", name: "image" }),
      br(),
      job.image ? renderMediaBlob(job.image) : null,
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
      label(i18n.mapLocationTitle || "Map Location"),
      br(),
      input({ type: "text", name: "mapUrl", placeholder: i18n.mapUrlPlaceholder || "/maps/MAP_ID", value: job.mapUrl || "" }),
      br(),
      br(),
      label(i18n.visibilityLabel || "Visibility"),
      br(),
      select(
        { name: "visibility" },
        option({ value: "PUBLIC", selected: (job.visibility || "PUBLIC") === "PUBLIC" }, i18n.visibilityPublic || "Public"),
        option({ value: "HIDDEN", selected: job.visibility === "HIDDEN" }, i18n.visibilityHidden || "Hidden")
      ),
      br(),
      br(),
      label(i18n.jobVacants),
      br(),
      input({ type: "number", name: "vacants", min: "1", placeholder: i18n.jobVacantsPlaceholder, value: job.vacants || 1, required: true }),
      br(),
      br(),
      String(job.job_type || "").toLowerCase() !== "exchange"
        ? [
            label(i18n.jobSalary),
            br(),
            input({ type: "number", name: "salary", step: "0.000001", min: "0", value: job.salary || "" }),
            br(),
            br()
          ]
        : null,
      String(job.job_type || "").toLowerCase() === "exchange"
        ? [
            label(i18n.jobsHoursOffered || "Hours offered"),
            br(),
            input({ type: "number", name: "hoursOffered", step: "0.5", min: "0", value: job.hoursOffered || "" }),
            br(),
            br(),
            label(i18n.jobsHoursRequested || "Hours requested in return"),
            br(),
            input({ type: "number", name: "hoursRequested", step: "0.5", min: "0", value: job.hoursRequested || "" }),
            br(),
            br(),
            label(i18n.jobsExchangeSkill || "Skill wanted in exchange"),
            br(),
            input({ type: "text", name: "exchangeSkill", value: job.exchangeSkill || "" }),
            br(),
            br()
          ]
        : null,
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
            div(
              { class: "inhabitant-left" },
              a({ href: `/author/${encodeURIComponent(user.id)}` },
                img({ class: "inhabitant-photo", src: resolvePhoto(user.photo) })
              ),
              h2(user.name),
              user.id
                ? a({ href: `/author/${encodeURIComponent(user.id)}`, class: 'inhabitant-qr-link' },
                    img({ class: 'inhabitant-qr-small', src: `/qr/${encodeURIComponent(user.id)}?size=96`, alt: 'QR' }))
                : null
            ),
            div(
              { class: "inhabitant-details" },
              user.description ? p(...renderUrl(user.description)) : null,
              p(userLink(user.id)),
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
  const { renderReachChip: renderReachChipJobs } = require('./clearnet_view');
  const viewerClearnet = !!(params.viewerPrefs && params.viewerPrefs.clearnetJobs)

  return template(
    i18n.jobsTitle,
    section(
      div({ class: "tags-header" },
        h2(sectionTitle),
        p(i18n.jobsDescription)
      ),
      div({ class: "shop-title-row" }, renderReachChipJobs(viewerClearnet, i18n)),
      br(),
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
              div({ class: "cv-filter-submit" },
                button({ type: "submit", class: "filter-btn" }, i18n.applyFilters)
              )
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
  const list = safeArr(comments).filter(c => {
    const t = c && c.value && c.value.content && c.value.content.text
    return t && String(t).trim()
  })
  const commentsCount = list.length

  return div(
    { id: "comments", class: "vote-comments-section" },
    div(
      { class: "comments-count" },
      span({ class: "card-label" }, i18n.voteCommentsLabel + ": "),
      span({ class: "card-value" }, String(commentsCount))
    ),
    div(
      { class: "comment-form-wrapper" },
      h2({ class: "comment-form-title" }, i18n.voteNewCommentLabel),
      form(
        { method: "POST", action: `/jobs/${encodeURIComponent(jobId)}/comments`, class: "comment-form", enctype: "multipart/form-data" },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        textarea({ id: "comment-text", name: "text", rows: 4, class: "comment-textarea", placeholder: i18n.voteNewCommentPlaceholder }),
        div({ class: "comment-file-upload" }, label(i18n.uploadMedia), input({ type: "file", name: "blob" })),
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
                author ? userLink(author) : span("(unknown)"),
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

const renderCandidates = (candidates, jobId) => {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  return div(
    { class: "job-candidates" },
    h2(i18n.jobsCandidatesTitle || "Suggested candidates"),
    p(i18n.jobsCandidatesDescription || "Inhabitants with skills matching your job. Send them a private message to invite them."),
    div(
      { class: "inhabitants-list" },
      candidates.map(c => div(
        { class: "inhabitant-card" },
        div(
          { class: "inhabitant-left" },
          a({ href: `/author/${encodeURIComponent(c.id)}` },
            img({ class: "inhabitant-photo", src: resolvePhoto(c.photo) })
          ),
          h2(c.name || 'Anonymous'),
          c.id
            ? a({ href: `/author/${encodeURIComponent(c.id)}`, class: 'inhabitant-qr-link' },
                img({ class: 'inhabitant-qr-small', src: `/qr/${encodeURIComponent(c.id)}?size=96`, alt: 'QR' }))
            : null
        ),
        div(
          { class: "inhabitant-details" },
          c.description ? p(...renderUrl(c.description)) : null,
          p(userLink(c.id)),
          div({ class: "matchskills" },
            p(`${i18n.matchScore || 'Match score'}: ${Math.round(c.matchScore * 100)}%`),
            p(`${i18n.commonSkills || 'Common skills'}: ${(c.commonSkills || []).join(', ')}`)
          ),
          c.location ? p(`${i18n.locationLabel || 'Location'}: ${c.location}`) : null,
          c.status ? p(`${i18n.statusLabel || 'Status'}: ${c.status}`) : null,
          c.preferences ? p(`${i18n.preferencesLabel || 'Preferences'}: ${c.preferences}`) : null,
          div({ class: "cv-actions" },
            form({ method: 'GET', action: `/inhabitant/${encodeURIComponent(c.id)}` },
              button({ type: 'submit', class: 'filter-btn' }, i18n.inhabitantviewDetails)
            ),
            form({ method: 'GET', action: '/pm' },
              input({ type: 'hidden', name: 'recipients', value: c.id }),
              input({ type: 'hidden', name: 'subject', value: `${i18n.jobsTitle || 'Job'}: ${job.title || ''}`.slice(0, 150) }),
              input({ type: 'hidden', name: 'text', value: `${i18n.jobsCandidatesPmBody || 'Hi, I think your profile matches my job opening'}: /jobs/${jobId}` }),
              button({ type: 'submit', class: 'filter-btn' }, i18n.pmCreateButton || 'Send PM')
            )
          )
        )
      ))
    )
  );
};

exports.singleJobsView = async (job, filter = "ALL", comments = [], params = {}) => {
  const returnTo = safeText(params.returnTo) || buildReturnTo(filter, params)
  const subs = safeArr(job.subscribers)
  const tagsNode = renderTags(job.tags)
  const isAuthor = String(job.author) === String(userId)
  const isSubscribed = subs.includes(userId)
  const { renderReachChip } = require('./clearnet_view')
  const isClearnet = !!(params.authorPrefs && params.authorPrefs.clearnetJobs && String(job.status || '').toUpperCase() !== 'CLOSED' && String(job.visibility || 'PUBLIC').toUpperCase() !== 'HIDDEN')
  const candidatesBlock = isAuthor ? renderCandidates(params.candidates || [], job.id) : null

  const ownerActions = renderJobOwnerActions(job, returnTo)
  const applyToggle = renderJobApplyToggle(job, returnTo)
  const pmBtn = renderPmButton(job.author)
  const visibility = (job.visibility || 'PUBLIC').toUpperCase() === 'HIDDEN' ? 'HIDDEN' : 'PUBLIC'
  const chips = [
    renderJobStatusChip(job.status),
    visibility === 'HIDDEN' ? renderJobHiddenChip() : null,
    isSubscribed ? renderJobAppliedChip() : null,
    renderLifespanChip(job.lifetime, i18n),
    renderEcoTax(job.msgSize, job.id),
    renderReachChip(isClearnet, i18n)
  ].filter(Boolean)

  const nextVisibility = visibility === 'PUBLIC' ? 'HIDDEN' : 'PUBLIC'
  const visibilityRow = isAuthor
    ? div({ class: "tribe-side-actions" },
        span({ class: "card-label" }, `${i18n.visibilityLabel || 'Visibility'}: `),
        renderVisibilityChip(visibility, i18n),
        form({ method: "POST", action: `/jobs/visibility/${encodeURIComponent(job.id)}`, class: "inline-form" },
          input({ type: "hidden", name: "visibility", value: nextVisibility }),
          button({ type: "submit", class: "filter-btn" },
            nextVisibility === 'PUBLIC' ? (i18n.visibilityMakePublic || 'Make public') : (i18n.visibilityMakeHidden || 'Make hidden')
          )
        )
      )
    : null

  const sideActions = []
  if (applyToggle) sideActions.push(applyToggle)
  if (pmBtn) sideActions.push(pmBtn)
  for (const a of ownerActions) sideActions.push(a)

  const jobSide = div({ class: "tribe-side" },
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, safeText(job.title) || i18n.jobsTitle)
    ),
    chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
    div({ class: "card-spread-centered" }, renderSpreadButton(job.id, params.spreads)),
    job.image
      ? renderMediaBlob(job.image, { class: "tribe-detail-image" })
      : null,
    renderJobInfoTable(job, { includeVacants: true, includeSubscribers: false }),
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.jobSubscribers}: ${subs.length}`)
    ),
    sideActions.length
      ? div({ class: "tribe-side-actions" }, ...sideActions)
      : null,
    visibilityRow,
    tagsNode
  )

  const renderJobSection = (titleText, bodyText) =>
    safeText(bodyText)
      ? div({ class: "job-section" },
          h2({ class: "job-section-title" }, titleText),
          p({ class: "tribe-side-description" }, ...renderUrl(bodyText))
        )
      : null

  const extraDetailsTable = renderJobExtraDetails(job)
  const jobMain = div({ class: "tribe-main" },
    renderJobSection(i18n.jobDescription, job.description),
    renderJobSection(i18n.jobRequirements, job.requirements),
    extraDetailsTable ? div({ class: "job-section" }, extraDetailsTable) : null,
    renderJobSection(i18n.jobTasks, job.tasks),
    job.mapUrl ? div({ class: "job-section" }, renderMapEmbed(params.mapData, job.mapUrl)) : null,
    p({ class: "card-footer" },
      span({ class: "date-link" }, `${moment(job.createdAt).format("YYYY/MM/DD HH:mm")} ${i18n.performed} `),
      userLink(job.author),
      renderUpdatedLabel(job.createdAt, job.updatedAt)
    ),
    candidatesBlock ? candidatesBlock : null,
    renderJobCommentsSection(job.id, returnTo, comments)
  )

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
      div({ class: "tribe-details" }, jobSide, jobMain)
    )
  )
}

exports.clearnetJobView = async (job) => {
  const { escapeHtml: esc, blobUrl: cnBlob, renderClearnetPage } = require('./clearnet_view');
  const title = esc(job.title || 'Job');
  const desc = esc(job.description || '');
  const req = esc(job.requirements || '');
  const lang = esc(String(job.languages || '').toUpperCase());
  const loc = esc(String(job.location || '').toUpperCase());
  const jobType = String(job.job_type || '').toLowerCase();
  const jobTypeLabel = jobType === 'exchange' ? 'Hour exchange' : jobType === 'employee' ? 'Employee' : 'Freelancer';
  let compensation = '';
  if (jobType === 'exchange') {
    compensation = `${Number(job.hoursOffered || 0)}h offered · ${Number(job.hoursRequested || 0)}h requested`;
    if (job.exchangeSkill) compensation += ` · ${esc(job.exchangeSkill)}`;
  } else {
    compensation = `${parseFloat(job.salary || 0).toFixed(2)} ECO`;
  }
  const jobImg = cnBlob(job.image);
  const extraCss = `
.cn-job-title{color:var(--fg);margin:0 0 16px 0;font-size:32px;font-weight:700}
.cn-job-meta{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px}
.cn-job-meta-item{background:var(--bg-sub);border:1px solid var(--border);border-radius:6px;padding:8px 14px;font-size:14px;color:var(--fg-soft);display:inline-flex;align-items:center;gap:6px}
.cn-job-comp{background:var(--bg-sub);border:1px solid var(--fg);color:var(--fg);padding:8px 16px;border-radius:6px;font-weight:600;display:inline-block;margin-bottom:20px}
.cn-job-img{display:block;max-width:100%;border:1px solid var(--border);border-radius:8px;margin-bottom:20px}
.cn-job-section h2{color:var(--fg);font-size:18px;text-transform:uppercase;letter-spacing:2px;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--border)}
.cn-job-section p{color:var(--fg-soft);white-space:pre-wrap;line-height:1.6;font-size:15px}
`;
  const body = `
  <h1 class="cn-job-title">${title}</h1>
  <div class="cn-job-meta">
    <span class="cn-job-meta-item">💼 ${jobTypeLabel}</span>
    ${job.createdAt ? `<span class="cn-job-meta-item">📅 ${esc(new Date(job.createdAt).toISOString().slice(0,10))}</span>` : ''}
    ${loc ? `<span class="cn-job-meta-item">📍 ${loc}</span>` : ''}
    ${lang ? `<span class="cn-job-meta-item">🗣 ${lang}</span>` : ''}
  </div>
  <div class="cn-job-comp">${compensation}</div>
  ${jobImg ? `<img class="cn-job-img" src="${jobImg}" alt="${title}"/>` : ''}
  ${desc ? `<div class="cn-job-section"><h2>Description</h2><p>${desc}</p></div>` : ''}
  ${req ? `<div class="cn-job-section"><h2>Requirements</h2><p>${req}</p></div>` : ''}
`;
  return renderClearnetPage({
    title: `${job.title || 'Job'} — Oasis`,
    ogTitle: job.title || 'Job',
    ogDescription: job.description || '',
    ogImage: jobImg,
    extraCss,
    body,
    hubFeedId: job.author || null
  });
};

