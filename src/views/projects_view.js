const { form, button, div, h2, p, section, input, label, textarea, br, a, span, select, option, img, ul, li, table, thead, tbody, tr, th, td, progress, video, audio } = require("../server/node_modules/hyperaxe")
const { template, i18n, userLink, renderStateChip, renderLifespanChip, renderEcoTax, renderSpreadButton } = require("./main_views")
const moment = require("../server/node_modules/moment")
const { config } = require("../server/SSB_server.js")
const { renderUrl } = require("../backend/renderUrl")
const { renderMapLocationUrl, renderMapEmbed, renderMapLocationVisitLabel, renderMapEmbedWithZoom } = require("./maps_view")
const opinionCategories = require("../backend/opinion_categories")

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
  { key: "ALL", i18n: "projectFilterAll", title: "projectAllTitle" },
  { key: "MINE", i18n: "projectFilterMine", title: "projectMineTitle" },
  { key: "APPLIED", i18n: "projectFilterApplied", title: "projectAppliedTitle" },
  { key: "ACTIVE", i18n: "projectFilterActive", title: "projectActiveTitle" },
  { key: "PAUSED", i18n: "projectFilterPaused", title: "projectPausedTitle" },
  { key: "COMPLETED", i18n: "projectFilterCompleted", title: "projectCompletedTitle" },
  { key: "FOLLOWING", i18n: "projectFilterFollowing", title: "projectFollowingTitle" },
  { key: "RECENT", i18n: "projectFilterRecent", title: "projectRecentTitle" },
  { key: "TOP", i18n: "projectFilterTop", title: "projectTopTitle" },
  { key: "BACKERS", i18n: "projectFilterBackers", title: "projectBackersLeaderboardTitle" }
]

const safeArr = (v) => (Array.isArray(v) ? v : [])
const safeText = (v) => String(v || "").trim()

const toNum = (v) => {
  const s = v === null || v === undefined ? "" : String(v)
  const n = parseFloat(s.replace(",", "."))
  return Number.isFinite(n) ? n : NaN
}

const clamp = (n, a, b) => Math.max(a, Math.min(b, n))

const sumAmounts = (list) => safeArr(list).reduce((s, x) => s + (toNum(x && x.amount) || 0), 0)

const followersCount = (p) => safeArr(p && p.followers).length
const backersCount = (p) => safeArr(p && p.backers).length
const backersTotal = (p) => sumAmounts((p && p.backers) || [])

const budgetSummary = (project) => {
  const goal = Math.max(0, toNum(project && project.goal) || 0)
  const assigned = Math.max(0, sumAmounts((project && project.bounties) || []))
  const remaining = Math.max(0, goal - assigned)
  const exceeded = assigned > goal
  return { goal, assigned, remaining, exceeded }
}

const buildReturnTo = (filter) => `/projects?filter=${encodeURIComponent(String(filter || "ALL").toUpperCase())}`

const renderCardField = (labelText, valueNode) =>
  div(
    { class: "card-field" },
    span({ class: "card-label" }, labelText),
    span({ class: "card-value" }, valueNode)
  )

const renderCardFieldRich = (labelText, children) =>
  div(
    { class: "card-field card-field-rich" },
    span({ class: "card-label" }, labelText),
    span({ class: "card-value" }, ...children)
  )

const renderProgressBlock = (labelText, valueText, value, maxValue) =>
  div(
    { class: "confirmations-block progress-block" },
    div(
      { class: "card-field" },
      span({ class: "card-label" }, labelText),
      span({ class: "card-value" }, valueText)
    ),
    progress({ class: "confirmations-progress", value: value, max: maxValue })
  )

const aggregateTopBackers = (projects) => {
  const map = new Map()
  for (const pr of safeArr(projects)) {
    const backers = safeArr(pr && pr.backers)
    for (const b of backers) {
      const uid = b && b.userId
      const amt = Math.max(0, toNum(b && b.amount) || 0)
      if (!uid) continue
      if (!map.has(uid)) map.set(uid, { userId: uid, total: 0, pledges: 0, projects: new Set() })
      const rec = map.get(uid)
      rec.total += amt
      rec.pledges += 1
      rec.projects.add(pr.id)
    }
  }
  return Array.from(map.values())
    .map((r) => ({ userId: r.userId, total: r.total, pledges: r.pledges, projects: r.projects.size }))
    .sort((a, b) => b.total - a.total)
}

const renderBackersLeaderboard = (projects) => {
  const rows = aggregateTopBackers(projects)
  return rows.length
    ? div(
        { class: "backers-leaderboard" },
        h2(i18n.projectBackersLeaderboardTitle),
        ...rows.slice(0, 50).map((r) =>
          div(
            { class: "backer-row" },
            renderCardField(i18n.projectBackerAuthor + ":", a({ href: `/author/${encodeURIComponent(r.userId)}`, class: "user-link user-pill" }, r.userId)),
            renderCardField(i18n.projectBackerAmount + ":", span({ class: "chip chip-amt" }, `${r.total} ECO`)),
            renderCardField(i18n.projectBackerPledges + ":", span({ class: "chip chip-pledges" }, String(r.pledges))),
            renderCardField(i18n.projectBackerProjects + ":", span({ class: "chip chip-projects" }, String(r.projects)))
          )
        )
      )
    : div({ class: "backers-leaderboard empty" }, p(i18n.projectNoBackersFound))
}

const renderBudget = (project) => {
  const S = budgetSummary(project)
  const pct = S.goal > 0 ? clamp(Math.round((S.assigned / S.goal) * 100), 0, 100) : 0
  return div(
    { class: `budget-summary${S.exceeded ? " over" : ""}` },
    S.goal > 0 ? renderProgressBlock(i18n.projectBudgetAssigned + ":", `${S.assigned}/${S.goal}`, pct, 100) : null,
    S.exceeded ? p({ class: "warning" }, i18n.projectBudgetOver) : null
  )
}

const renderFollowers = (project) => {
  const followers = safeArr(project && project.followers)
  if (!followers.length) return div({ class: "followers-block" }, h2(i18n.projectFollowersTitle), p(i18n.projectFollowersNone))
  const show = followers.slice(0, 12)
  return div(
    { class: "followers-block" },
    h2(i18n.projectFollowersTitle),
    ul(show.map((uid) => li(userLink(uid)))),
    followers.length > show.length ? p(`+${followers.length - show.length} ${i18n.projectMore}`) : null
  )
}

const renderBackers = (project, filter) => {
  const backers = safeArr(project && project.backers)
  const total = sumAmounts(backers)
  const mine = sumAmounts(backers.filter((b) => b && b.userId === userId))
  const rt = `/projects/${encodeURIComponent(project.id)}?filter=${encodeURIComponent(filter || "ALL")}`

  const pending = project && project.author === userId
    ? backers.filter((b) => b && b.transferId && b.confirmed === false).slice(0, 10)
    : []

  return div(
    { class: "backers-block" },
    h2(i18n.projectBackersTitle),
    renderCardField(i18n.projectBackersTotal + ":", String(backers.length)),
    renderCardField(i18n.projectBackersTotalPledged + ":", `${total} ECO`),
    mine > 0 ? renderCardField(i18n.projectBackersYourPledge + ":", span({ class: "chip chip-you" }, `${mine} ECO`)) : null,
    backers.length
      ? table(
          { class: "backers-table" },
          thead(tr(th(i18n.projectBackerDate), th(i18n.projectBackerAuthor), th(i18n.projectBackerAmount))),
          tbody(
            ...backers.slice(0, 8).map((b) =>
              tr(
                td(b.at ? moment(b.at).format("YYYY/MM/DD HH:mm") : ""),
                td(userLink(b.userId)),
                td(`${b.amount} ECO`)
              )
            )
          )
        )
      : p(i18n.projectBackersNone),
    pending.length
      ? div(
          { class: "pending-transfers" },
          h2(i18n.projectPendingTransfersTitle),
          ...pending.map((b) =>
            div(
              { class: "card-field" },
              span({ class: "card-label" }, b.userId),
              span(
                { class: "card-value" },
                form(
                  { method: "POST", action: `/projects/confirm-transfer/${encodeURIComponent(b.transferId)}` },
                  input({ type: "hidden", name: "returnTo", value: rt }),
                  button({ type: "submit", class: "btn" }, i18n.projectConfirmTransferButton)
                )
              )
            )
          )
        )
      : null
  )
}

const renderPledgeBox = (project, filter, isAuthor) => {
  const statusUpper = String((project && project.status) || "ACTIVE").toUpperCase()
  const isActive = statusUpper === "ACTIVE"
  if (!isActive || isAuthor) return null
  const rt = `/projects/${encodeURIComponent(project.id)}?filter=${encodeURIComponent(filter || "ALL")}`

  return div(
    { class: "pledge-box" },
    h2(i18n.projectPledgeTitle),
    form(
      { method: "POST", action: `/projects/pledge/${encodeURIComponent(project.id)}` },
      input({ type: "hidden", name: "returnTo", value: rt }),
      input({ type: "number", name: "amount", min: "0.01", step: "0.01", required: true, placeholder: i18n.projectPledgePlaceholder }),
      select(
        { name: "milestoneOrBounty" },
        option({ value: "" }, i18n.projectSelectMilestoneOrBounty),
        ...safeArr(project && project.milestones).map((m, idx) => option({ value: `milestone:${idx}` }, m.title)),
        ...safeArr(project && project.bounties).map((b, idx) => option({ value: `bounty:${idx}` }, b.title))
      ),
      button({ class: "btn", type: "submit" }, i18n.projectPledgeButton)
    )
  )
}

const bountyTotalsForMilestone = (project, mIndex) => {
  const bounties = safeArr(project && project.bounties)
  const list = bounties.filter((b) => {
    const mi = b && b.milestoneIndex
    return mi === mIndex
  })
  const total = sumAmounts(list)
  const done = list.filter((b) => !!(b && b.done)).length
  return { total, count: list.length, done }
}

const renderMilestonesAndBounties = (project, filter, editable) => {
  const milestones = safeArr(project && project.milestones)
  const bounties = safeArr(project && project.bounties)
  const rt = `/projects/${encodeURIComponent(project.id)}?filter=${encodeURIComponent(filter || "ALL")}`
  const remain = budgetSummary(project).remaining

  const blocks = milestones.map((m, idx) => {
    const totals = bountyTotalsForMilestone(project, idx)
    const items = bounties.filter((b) => b && b.milestoneIndex === idx)
    const maxCount = Math.max(1, totals.count)
    const pctDone = clamp(Math.round((totals.done / maxCount) * 100), 0, 100)

    return div(
      { class: "milestone-with-bounties" },
      div(
        { class: "milestone-stats" },
        renderCardField(i18n.projectMilestoneStatus + ":", m.done ? i18n.projectMilestoneDone.toUpperCase() : i18n.projectMilestoneOpen.toUpperCase()),
        renderProgressBlock(i18n.projectBounties + ":", `${totals.done}/${totals.count} · ${totals.total} ECO`, pctDone, 100)
      ),
      div(
        { class: "milestone-head" },
        span({ class: "milestone-title" }, m.title),
        m.dueDate ? span({ class: "chip chip-due" }, `${i18n.projectMilestoneDue}: ${moment(m.dueDate).format("YYYY/MM/DD HH:mm")}`) : null,
        safeText(m.description) ? p(...renderUrl(m.description)) : null,
        editable && !m.done
          ? form(
              { method: "POST", action: `/projects/milestones/complete/${encodeURIComponent(project.id)}/${idx}` },
              input({ type: "hidden", name: "returnTo", value: rt }),
              button({ class: "btn", type: "submit" }, i18n.projectMilestoneMarkDone)
            )
          : null
      ),
      items.length
        ? ul(
            items.map((b) => {
              const globalIndex = bounties.indexOf(b)
              const statusText = b.done
                ? i18n.projectBountyDone.toUpperCase()
                : (b.claimedBy ? i18n.projectBountyClaimed.toUpperCase() : i18n.projectBountyOpen.toUpperCase())

              return li(
                { class: "bounty-item" },
                div(
                  { class: "bounty-main" },
                  span({ class: "bounty-title" }, b.title),
                  span({ class: "bounty-amount" }, `${b.amount} ECO`)
                ),
                safeText(b.description) ? p(...renderUrl(b.description)) : null,
                renderCardField(i18n.projectBountyStatus + ":", statusText),
                b.claimedBy ? renderCardField(i18n.projectBountyClaimedBy + ":", userLink(b.claimedBy)) : null,
                !editable && !b.done && !b.claimedBy && project.author !== userId
                  ? form(
                      { method: "POST", action: `/projects/bounties/claim/${encodeURIComponent(project.id)}/${globalIndex}` },
                      input({ type: "hidden", name: "returnTo", value: rt }),
                      button({ type: "submit", class: "btn" }, i18n.projectBountyClaimButton)
                    )
                  : null,
                editable && !b.done
                  ? form(
                      { method: "POST", action: `/projects/bounties/complete/${encodeURIComponent(project.id)}/${globalIndex}` },
                      input({ type: "hidden", name: "returnTo", value: rt }),
                      button({ type: "submit", class: "btn" }, i18n.projectBountyCompleteButton)
                    )
                  : null,
                editable
                  ? form(
                      { method: "POST", action: `/projects/bounties/update/${encodeURIComponent(project.id)}/${globalIndex}`, class: "bounty-update-form" },
                      input({ type: "hidden", name: "returnTo", value: rt }),
                      label(i18n.projectMilestoneSelect),
                      br(),
                      select(
                        { name: "milestoneIndex" },
                        option({ value: "", selected: b.milestoneIndex == null }, "-"),
                        ...milestones.map((m2, idx2) => option({ value: String(idx2), selected: b.milestoneIndex === idx2 }, m2.title))
                      ),
                      br(),
                      br(),
                      button({ class: "btn", type: "submit", disabled: remain <= 0 }, i18n.projectBountyCreateButton)
                    )
                  : null
              )
            })
          )
        : p(i18n.projectNoBounties)
    )
  })

  const unassigned = bounties.filter((b) => b && (b.milestoneIndex === null || b.milestoneIndex === undefined))
  const unassignedBlock = unassigned.length
    ? div(
        { class: "bounty-milestone-block" },
        h2(i18n.projectBounties),
        ul(
          unassigned.map((b) => {
            const globalIndex = bounties.indexOf(b)
            const statusText = b.done
              ? i18n.projectBountyDone.toUpperCase()
              : (b.claimedBy ? i18n.projectBountyClaimed.toUpperCase() : i18n.projectBountyOpen.toUpperCase())

            return li(
              { class: "bounty-item" },
              div(
                { class: "bounty-main" },
                span({ class: "bounty-title" }, b.title),
                span({ class: "bounty-amount" }, `${b.amount} ECO`)
              ),
              safeText(b.description) ? p(...renderUrl(b.description)) : null,
              renderCardField(i18n.projectBountyStatus + ":", statusText),
              b.claimedBy ? renderCardField(i18n.projectBountyClaimedBy + ":", userLink(b.claimedBy)) : null,
              !editable && !b.done && !b.claimedBy && project.author !== userId
                ? form(
                    { method: "POST", action: `/projects/bounties/claim/${encodeURIComponent(project.id)}/${globalIndex}` },
                    input({ type: "hidden", name: "returnTo", value: rt }),
                    button({ type: "submit", class: "btn" }, i18n.projectBountyClaimButton)
                  )
                : null,
              editable && !b.done
                ? form(
                    { method: "POST", action: `/projects/bounties/complete/${encodeURIComponent(project.id)}/${globalIndex}` },
                    input({ type: "hidden", name: "returnTo", value: rt }),
                    button({ type: "submit", class: "btn" }, i18n.projectBountyCompleteButton)
                  )
                : null
            )
          })
        )
      )
    : null

  if (blocks.length === 0 && !unassignedBlock) return null
  return div({ class: "milestones-bounties" }, ...blocks, unassignedBlock)
}

const renderProjectStatusChip = (status) => {
  const s = String(status || "ACTIVE").toUpperCase()
  const variant =
    s === "ACTIVE" ? "mutuals" :
    s === "PAUSED" ? "whole" :
    s === "COMPLETED" ? "encrypted" :
    s === "CANCELLED" ? "closed" :
    "whole"
  const localized = i18n["projectStatus" + s] || s
  return renderStateChip(variant, "", localized)
}

const renderProjectList = exports.renderProjectList = (projects, filter, spreadMap = new Map()) => {
  const list = safeArr(projects)
  const currentFilter = String(filter || "ALL").toUpperCase()

  if (!list.length) return p(i18n.projectNoProjectsFound)

  return div({ class: "jobs-grid" },
    list.map((pr) => {
      const goal = Math.max(0, toNum(pr && pr.goal) || 0)
      const pledged = Math.max(0, toNum(pr && pr.pledged) || 0)
      const fundingPct = goal > 0 ? clamp(Math.round((pledged / goal) * 100), 0, 100) : 0
      const heroNode = pr.image
        ? div({ class: "tribe-card-image-wrapper" },
            a({ href: `/projects/${encodeURIComponent(pr.id)}` },
              renderMediaBlob(pr.image, { class: "tribe-card-hero-image" })
            )
          )
        : null
      const chips = [
        renderProjectStatusChip(pr.status),
        renderLifespanChip(pr.lifetime, i18n)
      ].filter(Boolean)

      return div({ class: "tribe-card project-card" },
        heroNode,
        div({ class: "tribe-card-body" },
          div({ class: "shop-title-row" },
            h2({ class: "tribe-card-title" },
              a({ href: `/projects/${encodeURIComponent(pr.id)}` }, pr.title || i18n.projectsTitle)
            )
          ),
          chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
          goal > 0
            ? div({ class: "card-date-highlight" }, `${pr.goal} ECO`)
            : null,
          goal > 0
            ? renderProgressBlock(i18n.projectFunding + ":", `${fundingPct}%`, fundingPct, 100)
            : null,
          div({ class: "tribe-card-members" },
            span({ class: "tribe-members-count" }, `${i18n.projectFollowers}: ${followersCount(pr)}`)
          ),
          div({ class: "card-spread-centered" }, renderSpreadButton(pr.id || pr.key, spreadMap.get(pr.id || pr.key))),
          div({ class: "card-visit-btn-centered" },
            form({ method: "GET", action: `/projects/${encodeURIComponent(pr.id)}` },
              input({ type: "hidden", name: "filter", value: currentFilter }),
              button({ type: "submit", class: "filter-btn" }, i18n.viewProject || i18n.viewDetailsButton || "View Project")
            )
          )
        )
      )
    })
  )
}

const renderProjectForm = (project, mode) => {
  const pr = project || {}
  const isEdit = mode === "edit"
  const nowLocal = moment().format("YYYY-MM-DDTHH:mm")
  const deadlineValue = pr.deadline ? moment(pr.deadline).format("YYYY-MM-DDTHH:mm") : ""
  const milestoneMax = deadlineValue || undefined
  const returnTo = "/projects?filter=MINE"

  return div(
    { class: "div-center project-form" },
    form(
      {
        action: isEdit ? `/projects/update/${encodeURIComponent(pr.id)}` : "/projects/create",
        method: "POST",
        enctype: "multipart/form-data"
      },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      label(i18n.projectTitle),
      br(),
      input({ type: "text", name: "title", required: true, placeholder: i18n.projectTitlePlaceholder, value: pr.title || "" }),
      br(),
      label(i18n.projectDescription),
      br(),
      textarea({ name: "description", rows: "6", required: true, placeholder: i18n.projectDescriptionPlaceholder }, pr.description || ""),
      br(),
      label(i18n.projectImage),
      br(),
      input({ type: "file", name: "image" }),
      br(),
      pr.image ? renderMediaBlob(pr.image) : null,
      br(),
      label(i18n.projectGoal),
      br(),
      input({ type: "number", step: "0.01", min: "0.01", name: "goal", required: true, placeholder: i18n.projectGoalPlaceholder, value: pr.goal || "" }),
      br(),
      br(),
      label(i18n.mapLocationTitle || "Map Location"),
      br(),
      input({ type: "text", name: "mapUrl", placeholder: i18n.mapUrlPlaceholder || "/maps/MAP_ID", value: pr.mapUrl || "" }),
      br(),
      br(),
      label(i18n.projectDeadline),
      br(),
      input({ type: "datetime-local", name: "deadline", id: "deadline", required: true, min: nowLocal, value: deadlineValue }),
      br(),
      br(),
      h2(i18n.projectAddMilestoneTitle),
      label(i18n.projectMilestoneTitle),
      br(),
      input({ type: "text", name: "milestoneTitle", required: true, placeholder: i18n.projectMilestoneTitlePlaceholder }),
      br(),
      label(i18n.projectMilestoneDescription),
      br(),
      textarea({ name: "milestoneDescription", rows: "3", placeholder: i18n.projectMilestoneDescriptionPlaceholder }),
      br(),
      label(i18n.projectMilestoneTargetPercent),
      br(),
      input({ type: "number", name: "milestoneTargetPercent", min: "0", max: "100", step: "1", value: "0" }),
      br(),
      br(),
      label(i18n.projectMilestoneDueDate),
      br(),
      input({ type: "datetime-local", name: "milestoneDueDate", min: nowLocal, max: milestoneMax }),
      br(),
      br(),
      button({ type: "submit" }, isEdit ? i18n.projectUpdateButton : i18n.projectCreateButton)
    )
  )
}

exports.projectsView = async (projectsOrForm, filter, _unused, params = {}) => {
  const f = String(filter || "ALL").toUpperCase()
  const filterObj = FILTERS.find((x) => x.key === f) || FILTERS[0]
  const sectionTitle = i18n[filterObj.title] || i18n.projectAllTitle
  const { renderReachChip: renderReachChipProjects } = require('./clearnet_view');
  const viewerClearnetProjects = !!(params.viewerPrefs && params.viewerPrefs.clearnetProjects);

  return template(
    i18n.projectsTitle,
    section(
      div({ class: "tags-header" },
        h2(sectionTitle),
        p(i18n.projectsDescription)
      ),
      div({ class: "shop-title-row" }, renderReachChipProjects(viewerClearnetProjects, i18n)),
      br(),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/projects", class: "ui-toolbar ui-toolbar--filters" },
          FILTERS.map((x) => button({ type: "submit", name: "filter", value: x.key, class: f === x.key ? "filter-btn active" : "filter-btn" }, i18n[x.i18n]))
            .concat(button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.projectCreateProject))
        )
      ),
      f === "CREATE" || f === "EDIT"
        ? (() => {
            const prToEdit = f === "EDIT" ? (safeArr(projectsOrForm)[0] || {}) : {}
            return renderProjectForm(prToEdit, f === "EDIT" ? "edit" : "create")
          })()
        : (f === "BACKERS"
            ? renderBackersLeaderboard(projectsOrForm)
            : div({ class: "projects-list" }, renderProjectList(projectsOrForm, f, params.spreadMap))
          )
    )
  )
}

exports.singleProjectView = async (project, filter, comments, params = {}) => {
  const pr = project || {}
  const f = String(filter || "ALL").toUpperCase()
  const isAuthor = pr.author === userId
  const isFollower = safeArr(pr.followers).includes(userId)

  const statusUpper = String(pr.status || "ACTIVE").toUpperCase()
  const pctRaw = toNum(pr.progress)
  const pct = clamp(Math.round(Number.isFinite(pctRaw) ? pctRaw : 0), 0, 100)
  const goal = Math.max(0, toNum(pr.goal) || 0)
  const pledged = Math.max(0, toNum(pr.pledged) || 0)
  const fundingPct = goal > 0 ? clamp(Math.round((pledged / goal) * 100), 0, 100) : 0

  const returnTo = `/projects/${encodeURIComponent(pr.id)}?filter=${encodeURIComponent(f)}`

  const chips = [
    renderProjectStatusChip(pr.status),
    isFollower ? renderStateChip("whole", "★", i18n.projectFollowing || "FOLLOWING") : null,
    renderLifespanChip(pr.lifetime, i18n),
    renderEcoTax(pr.msgSize, pr.id || pr.key)
  ].filter(Boolean)

  const sideActions = []
  if (!isAuthor && pr.author) {
    sideActions.push(form({ method: "GET", action: "/pm" },
      input({ type: "hidden", name: "recipients", value: pr.author }),
      button({ type: "submit", class: "filter-btn" }, i18n.privateMessage)
    ))
  }
  if (!isAuthor && statusUpper === "ACTIVE") {
    sideActions.push(isFollower
      ? form({ method: "POST", action: `/projects/unfollow/${encodeURIComponent(pr.id)}` },
          input({ type: "hidden", name: "returnTo", value: returnTo }),
          button({ type: "submit", class: "unsubscribe-btn" }, i18n.projectUnfollowButton)
        )
      : form({ method: "POST", action: `/projects/follow/${encodeURIComponent(pr.id)}` },
          input({ type: "hidden", name: "returnTo", value: returnTo }),
          button({ type: "submit", class: "subscribe-btn" }, i18n.projectFollowButton)
        )
    )
  }
  if (isAuthor) {
    sideActions.push(form({ method: "GET", action: `/projects/edit/${encodeURIComponent(pr.id)}` },
      button({ class: "update-btn", type: "submit" }, i18n.projectUpdateButton)
    ))
    sideActions.push(form({ method: "POST", action: `/projects/delete/${encodeURIComponent(pr.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "delete-btn", type: "submit" }, i18n.projectDeleteButton)
    ))
    sideActions.push(form(
      { method: "POST", action: `/projects/status/${encodeURIComponent(pr.id)}`, class: "project-control-form project-control-form--status" },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      select(
        { name: "status", class: "project-control-select" },
        option({ value: "ACTIVE", selected: statusUpper === "ACTIVE" }, i18n.projectStatusACTIVE),
        option({ value: "PAUSED", selected: statusUpper === "PAUSED" }, i18n.projectStatusPAUSED),
        option({ value: "COMPLETED", selected: statusUpper === "COMPLETED" }, i18n.projectStatusCOMPLETED),
        option({ value: "CANCELLED", selected: statusUpper === "CANCELLED" }, i18n.projectStatusCANCELLED)
      ),
      button({ class: "status-btn project-control-btn", type: "submit" }, i18n.projectSetStatus)
    ))
    sideActions.push(form(
      { method: "POST", action: `/projects/progress/${encodeURIComponent(pr.id)}`, class: "project-control-form project-control-form--progress" },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      input({ type: "number", name: "progress", min: "0", max: "100", value: pct, class: "project-control-input project-progress-input" }),
      button({ class: "status-btn project-control-btn", type: "submit" }, i18n.projectSetProgress)
    ))
  }

  const projectSide = div({ class: "tribe-side" },
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, pr.title)
    ),
    chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
    div({ class: "card-spread-centered" }, renderSpreadButton(pr.id || pr.key, params.spreads)),
    pr.image ? renderMediaBlob(pr.image, { class: "tribe-detail-image" }) : null,
    div({ class: "job-price-line card-salary" }, `${pr.goal || 0} ECO`),
    div({ class: "job-price-line card-salary" }, `${i18n.projectFollowers}: ${followersCount(pr)}`),
    renderProgressBlock(i18n.projectProgress + ":", `${pct}%`, pct, 100),
    goal > 0 ? renderProgressBlock(i18n.projectFunding + ":", `${fundingPct}%`, fundingPct, 100) : null
  )

  const projectMain = div({ class: "tribe-main" },
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null,
    !isAuthor && isFollower ? p({ class: "hint" }, i18n.projectYouFollowHint) : null,
    safeText(pr.description)
      ? div({ class: "job-section" },
          h2({ class: "job-section-title" }, i18n.projectDescription),
          p({ class: "tribe-side-description" }, ...renderUrl(pr.description))
        )
      : null,
    pr.mapUrl ? div({ class: "job-section" }, renderMapEmbedWithZoom(params.mapData, pr.mapUrl, `/projects/${encodeURIComponent(pr.id || pr.key)}`, params.zoom)) : null,
    renderBudget(pr),
    renderBackers(pr, f),
    renderMilestonesAndBounties(pr, f, isAuthor),
    renderFollowers(pr),
    renderPledgeBox(pr, f, isAuthor),
    div({ class: "card-footer" },
      span({ class: "date-link" }, `${moment(pr.createdAt).format("YYYY/MM/DD HH:mm")} ${i18n.performed} `),
      userLink(pr.author)
    ),
    div(
      { class: "voting-buttons" },
      opinionCategories.map((category) =>
        form(
          { method: "POST", action: `/projects/opinions/${encodeURIComponent(pr.id || pr.key)}/${category}` },
          button(
            { class: "vote-btn", type: "submit" },
            `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`] || category} [${(pr.opinions && pr.opinions[category]) ? pr.opinions[category] : 0}]`
          )
        )
      )
    ),
    div(
      { id: "comments", class: "vote-comments-section" },
      div({ class: "comment-form-wrapper" },
        h2({ class: "comment-form-title" }, i18n.voteNewCommentLabel),
        form(
          { method: "POST", action: `/projects/${encodeURIComponent(pr.id || pr.key)}/comments`, class: "comment-form", enctype: "multipart/form-data" },
          textarea({ id: "comment-text", name: "text", rows: 4, class: "comment-textarea", placeholder: i18n.voteNewCommentPlaceholder }),
          div({ class: "comment-file-upload" }, label(i18n.uploadMedia), br(), input({ type: "file", name: "blob" })),
          br(),
          button({ type: "submit", class: "comment-submit-btn" }, i18n.voteNewCommentButton)
        )
      ),
      (() => {
        const visibleComments = (comments || []).filter(c => {
          const t = c && c.value && c.value.content && c.value.content.text
          return t && String(t).trim()
        })
        return visibleComments.length
          ? div({ class: "comments-list" },
              visibleComments.map((c) => {
                const author = c?.value?.author || ""
                const ts = c?.value?.timestamp || c?.timestamp
                const absDate = ts ? moment(ts).format("YYYY/MM/DD HH:mm:ss") : ""
                const relDate = ts ? moment(ts).fromNow() : ""
                return div({ class: "comment-card" },
                  div({ class: "comment-header" }, userLink(author)),
                  div({ class: "comment-date" }, span({ title: absDate }, relDate)),
                  div({ class: "comment-body" }, ...renderUrl(c?.value?.content?.text || ""))
                )
              })
            )
          : p({ class: "votations-no-comments" }, i18n.voteNoCommentsYet)
      })()
    )
  )

  return template(
    i18n.projectsTitle,
    section(
      div({ class: "tags-header" }, h2(i18n.projectsTitle), p(i18n.projectsDescription)),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/projects", class: "ui-toolbar ui-toolbar--filters" },
          FILTERS.map((x) => button({ type: "submit", name: "filter", value: x.key, class: f === x.key ? "filter-btn active" : "filter-btn" }, i18n[x.i18n]))
            .concat(button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.projectCreateProject))
        )
      ),
      div({ class: "tribe-details" }, projectSide, projectMain)
    )
  )
}

exports.clearnetProjectView = async (project) => {
  const { escapeHtml: esc, blobUrl: cnBlob, renderClearnetPage } = require('./clearnet_view');
  const pr = project || {};
  const title = esc(pr.title || 'Project');
  const desc = esc(pr.description || '');
  const goal = Math.max(0, toNum(pr.goal) || 0);
  const pledged = Math.max(0, toNum(pr.pledged) || 0);
  const fundingPct = goal > 0 ? Math.min(100, Math.round((pledged / goal) * 100)) : 0;
  const status = String(pr.status || 'ACTIVE').toUpperCase();
  const projectImg = cnBlob(pr.image);
  const deadline = pr.deadline ? new Date(pr.deadline).toISOString().slice(0, 10) : '';
  const milestones = Array.isArray(pr.milestones) ? pr.milestones.slice(0, 10) : [];
  const milestonesBlock = milestones.length
    ? `<div class="cn-prj-section"><h2>Milestones</h2><ol class="cn-prj-ms">${milestones.map(m => `<li>${esc(m.title || '')}${m.targetPercent ? ` <span class="cn-prj-pct">— ${m.targetPercent}%</span>` : ''}</li>`).join('')}</ol></div>`
    : '';
  const extraCss = `
.cn-prj-title{color:var(--fg);margin:0 0 12px 0;font-size:32px;font-weight:700}
.cn-prj-status{display:inline-block;background:var(--bg-sub);border:1px solid var(--fg);color:var(--fg);padding:6px 12px;border-radius:6px;font-weight:600;text-transform:uppercase;letter-spacing:1px;font-size:12px;margin-bottom:16px}
.cn-prj-img{display:block;max-width:100%;border:1px solid var(--border);border-radius:8px;margin-bottom:20px}
.cn-prj-funding{background:var(--bg-sub);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:20px}
.cn-prj-funding-label{color:var(--fg-dim);font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.cn-prj-funding-amount{color:var(--fg);font-size:18px;font-weight:700;margin-bottom:8px}
.cn-prj-bar{height:8px;background:#000;border-radius:4px;overflow:hidden}
.cn-prj-bar-fill{height:100%;background:var(--fg);border-radius:4px}
.cn-prj-section{margin-top:24px}
.cn-prj-section h2{color:var(--fg);font-size:18px;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px;padding-bottom:6px;border-bottom:1px solid var(--border)}
.cn-prj-section p{color:var(--fg-soft);white-space:pre-wrap;line-height:1.6;font-size:15px;margin:0}
.cn-prj-ms{padding-left:22px;margin:0;color:var(--fg-soft);line-height:1.7}
.cn-prj-pct{color:var(--fg-dim);font-size:13px}
.cn-prj-deadline{color:var(--fg-dim);font-size:13px;margin-top:8px}
.cn-prj-meta{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
.cn-prj-date,.cn-prj-idmeta{background:var(--bg-sub);border:1px solid var(--border);border-radius:6px;padding:6px 12px;font-size:13px;color:var(--fg-soft)}
.cn-prj-idmeta{font-family:monospace;font-size:11px;word-break:break-all}
`;
  const body = `
  <h1 class="cn-prj-title">${title}</h1>
  <div class="cn-prj-meta">
    <span class="cn-prj-status">${esc(status)}</span>
    ${pr.createdAt ? `<span class="cn-prj-date">📅 ${esc(new Date(pr.createdAt).toISOString().slice(0,10))}</span>` : ''}
  </div>
  ${projectImg ? `<img class="cn-prj-img" src="${projectImg}" alt="${title}"/>` : ''}
  ${goal > 0 ? `
  <div class="cn-prj-funding">
    <div class="cn-prj-funding-label">Funding</div>
    <div class="cn-prj-funding-amount">${pledged.toFixed(2)} / ${goal.toFixed(2)} ECO · ${fundingPct}%</div>
    <div class="cn-prj-bar"><div class="cn-prj-bar-fill" style="width:${fundingPct}%"></div></div>
    ${deadline ? `<div class="cn-prj-deadline">Deadline: ${deadline}</div>` : ''}
  </div>` : ''}
  ${desc ? `<div class="cn-prj-section"><h2>Description</h2><p>${desc}</p></div>` : ''}
  ${milestonesBlock}
`;
  return renderClearnetPage({
    title: `${pr.title || 'Project'} — Oasis`,
    ogTitle: pr.title || 'Project',
    ogDescription: pr.description || '',
    ogImage: projectImg,
    extraCss,
    body,
    hubFeedId: pr.author || null
  });
};

