const { form, button, div, h2, p, section, input, label, textarea, br, a, span, select, option, img, ul, li, table, thead, tbody, tr, th, td, progress, video, audio } = require("../server/node_modules/hyperaxe")
const { template, i18n } = require("./main_views")
const moment = require("../server/node_modules/moment")
const { config } = require("../server/SSB_server.js")
const { renderUrl } = require("../backend/renderUrl")

const renderMediaBlob = (value) => {
  if (!value) return null
  const s = String(value).trim()
  if (!s) return null
  if (s.startsWith('&')) return img({ src: `/blob/${encodeURIComponent(s)}` })
  const mVideo = s.match(/\[video:[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mVideo) return video({ controls: true, class: 'post-video', src: `/blob/${encodeURIComponent(mVideo[1])}` })
  const mAudio = s.match(/\[audio:[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mAudio) return audio({ controls: true, class: 'post-audio', src: `/blob/${encodeURIComponent(mAudio[1])}` })
  const mImg = s.match(/!\[[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mImg) return img({ src: `/blob/${encodeURIComponent(mImg[1])}`, class: 'post-image' })
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
    renderCardField(i18n.projectBudgetGoal + ":", `${S.goal} ECO`),
    renderCardField(i18n.projectBudgetAssigned + ":", `${S.assigned} ECO`),
    renderCardField(i18n.projectBudgetRemaining + ":", `${S.remaining} ECO`),
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
    ul(show.map((uid) => li(a({ href: `/author/${encodeURIComponent(uid)}`, class: "user-link" }, uid)))),
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
                td(a({ href: `/author/${encodeURIComponent(b.userId)}`, class: "user-link" }, b.userId)),
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
                b.claimedBy ? renderCardField(i18n.projectBountyClaimedBy + ":", a({ href: `/author/${encodeURIComponent(b.claimedBy)}`, class: "user-link" }, b.claimedBy)) : null,
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
              b.claimedBy ? renderCardField(i18n.projectBountyClaimedBy + ":", a({ href: `/author/${encodeURIComponent(b.claimedBy)}`, class: "user-link" }, b.claimedBy)) : null,
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

  return div({ class: "milestones-bounties" }, ...blocks, unassignedBlock)
}

const renderProjectOwnerActions = (project, returnTo, opts = {}) => {
  const statusUpper = String(project.status || "ACTIVE").toUpperCase()
  const pct = clamp(Math.round(toNum(project.progress) || 0), 0, 100)
  const isList = !!opts.list
  const rt = isList ? returnTo : `/projects/${encodeURIComponent(project.id)}?filter=${encodeURIComponent(String(opts.filter || "ALL"))}`

  return div(
    { class: "bookmark-actions project-actions" },
    form(
      { method: "GET", action: `/projects/edit/${encodeURIComponent(project.id)}` },
      button({ class: "update-btn", type: "submit" }, i18n.projectUpdateButton)
    ),
    form(
      { method: "POST", action: `/projects/delete/${encodeURIComponent(project.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "delete-btn", type: "submit" }, i18n.projectDeleteButton)
    ),
    form(
      { method: "POST", action: `/projects/status/${encodeURIComponent(project.id)}`, class: "project-control-form project-control-form--status" },
      input({ type: "hidden", name: "returnTo", value: rt }),
      select(
        { name: "status", class: "project-control-select" },
        option({ value: "ACTIVE", selected: statusUpper === "ACTIVE" }, i18n.projectStatusACTIVE),
        option({ value: "PAUSED", selected: statusUpper === "PAUSED" }, i18n.projectStatusPAUSED),
        option({ value: "COMPLETED", selected: statusUpper === "COMPLETED" }, i18n.projectStatusCOMPLETED),
        option({ value: "CANCELLED", selected: statusUpper === "CANCELLED" }, i18n.projectStatusCANCELLED)
      ),
      button({ class: "status-btn project-control-btn", type: "submit" }, i18n.projectSetStatus)
    ),
    form(
      { method: "POST", action: `/projects/progress/${encodeURIComponent(project.id)}`, class: "project-control-form project-control-form--progress" },
      input({ type: "hidden", name: "returnTo", value: rt }),
      input({ type: "number", name: "progress", min: "0", max: "100", value: pct, class: "project-control-input project-progress-input" }),
      button({ class: "status-btn project-control-btn", type: "submit" }, i18n.projectSetProgress)
    )
  )
}

const renderProjectTopbar = (project, filter, opts) => {
  const o = opts || {}
  const isSingle = !!o.single
  const isAuthor = project && project.author === userId
  const statusUpper = String((project && project.status) || "ACTIVE").toUpperCase()
  const isActive = statusUpper === "ACTIVE"

  const returnTo = isSingle
    ? `/projects/${encodeURIComponent(project.id)}?filter=${encodeURIComponent(String(filter || "ALL").toUpperCase())}`
    : buildReturnTo(filter)

  const leftActions = []

  if (!isSingle) {
    leftActions.push(
      form(
        { method: "GET", action: `/projects/${encodeURIComponent(project.id)}` },
        input({ type: "hidden", name: "filter", value: String(filter || "ALL").toUpperCase() }),
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetailsButton)
      )
    )
  }

  if (!isAuthor && project && project.author) {
    leftActions.push(
      form(
        { method: "GET", action: "/pm" },
        input({ type: "hidden", name: "recipients", value: project.author }),
        button({ type: "submit", class: "filter-btn" }, i18n.privateMessage)
      )
    )
  }

  if (!isAuthor && isActive) {
    const following = safeArr(project && project.followers).includes(userId)
    leftActions.push(
      following
        ? form(
            { method: "POST", action: `/projects/unfollow/${encodeURIComponent(project.id)}` },
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            button({ type: "submit", class: "unsubscribe-btn" }, i18n.projectUnfollowButton)
          )
        : form(
            { method: "POST", action: `/projects/follow/${encodeURIComponent(project.id)}` },
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            button({ type: "submit", class: "subscribe-btn" }, i18n.projectFollowButton)
          )
    )
  }

  const leftNode = leftActions.length ? div({ class: "bookmark-topbar-left project-topbar-left" }, ...leftActions) : null
  const rightNode = isAuthor ? renderProjectOwnerActions(project, returnTo) : null

  const nodes = []
  if (leftNode) nodes.push(leftNode)
  if (rightNode) nodes.push(rightNode)

  return nodes.length ? div({ class: isSingle ? "bookmark-topbar project-topbar-single" : "bookmark-topbar" }, ...nodes) : null
}

const renderProjectList = (projects, filter) => {
  const list = safeArr(projects)
  const returnTo = buildReturnTo(filter)

  return list.length
    ? list.map((pr) => {
        const statusUpper = String((pr && pr.status) || "ACTIVE").toUpperCase()
        const statusClass = `status-${statusUpper.toLowerCase()}`

        const pctRaw = toNum(pr && pr.progress)
        const pct = clamp(Math.round(Number.isFinite(pctRaw) ? pctRaw : 0), 0, 100)

        const goal = Math.max(0, toNum(pr && pr.goal) || 0)
        const pledged = Math.max(0, toNum(pr && pr.pledged) || 0)
        const fundingPct = goal > 0 ? clamp(Math.round((pledged / goal) * 100), 0, 100) : 0

        const mileDone = safeArr(pr && pr.milestones).filter((m) => !!(m && m.done)).length
        const mileTotal = safeArr(pr && pr.milestones).length

        const topbar = renderProjectTopbar(pr, filter, { single: false })
        const isMineAuthor = String(filter || "ALL").toUpperCase() === "MINE" && pr.author === userId

        return div(
          { class: `project-card ${statusClass}` },
          topbar ? topbar : null,
          h2(pr.title),
          pr.image ? div({ class: "activity-image-preview" }, renderMediaBlob(pr.image)) : null,
          safeText(pr.description) ? renderCardFieldRich(i18n.projectDescription + ":", renderUrl(pr.description)) : null,
          renderCardField(i18n.projectStatus + ":", i18n["projectStatus" + statusUpper] || statusUpper),
          renderProgressBlock(i18n.projectProgress + ":", `${pct}%`, pct, 100),
          renderCardField(i18n.projectGoal + ":", `${pr.goal} ECO`),
          renderCardField(i18n.projectPledged + ":", `${pr.pledged || 0} ECO`),
          renderProgressBlock(i18n.projectFunding + ":", `${fundingPct}%`, fundingPct, 100),
          renderCardField(i18n.projectMilestones + ":", `${mileDone}/${mileTotal}`),
          renderCardField(i18n.projectFollowers + ":", String(followersCount(pr))),
          renderCardField(i18n.projectBackers + ":", `${backersCount(pr)} · ${backersTotal(pr)} ECO`),
          isMineAuthor
            ? div(
                { class: "project-admin-block" },
                renderBudget(pr),
                renderMilestonesAndBounties(pr, filter, true),
                div(
                  { class: "new-milestone" },
                  h2(i18n.projectAddMilestoneTitle),
                  form(
                    { method: "POST", action: `/projects/milestones/add/${encodeURIComponent(pr.id)}` },
                    input({ type: "hidden", name: "returnTo", value: returnTo }),
                    label(i18n.projectMilestoneTitle),
                    br(),
                    input({ type: "text", name: "title", required: true }),
                    br(),
                    br(),
                    label(i18n.projectMilestoneDescription),
                    br(),
                    textarea({ name: "description", rows: "3" }),
                    br(),
                    br(),
                    label(i18n.projectMilestoneTargetPercent),
                    br(),
                    input({ type: "number", name: "targetPercent", min: "0", max: "100", step: "1", value: "0" }),
                    br(),
                    br(),
                    label(i18n.projectMilestoneDueDate),
                    br(),
                    input({
                      type: "datetime-local",
                      name: "dueDate",
                      min: moment().format("YYYY-MM-DDTHH:mm"),
                      max: pr.deadline ? moment(pr.deadline).format("YYYY-MM-DDTHH:mm") : undefined
                    }),
                    br(),
                    br(),
                    button({ class: "btn", type: "submit" }, i18n.projectMilestoneCreateButton)
                  )
                ),
                div(
                  { class: "new-bounty" },
                  h2(i18n.projectAddBountyTitle),
                  form(
                    { method: "POST", action: `/projects/bounties/add/${encodeURIComponent(pr.id)}` },
                    input({ type: "hidden", name: "returnTo", value: returnTo }),
                    label(i18n.projectBountyTitle),
                    br(),
                    input({ type: "text", name: "title", required: true }),
                    br(),
                    br(),
                    label(i18n.projectBountyAmount),
                    br(),
                    input({ type: "number", step: "0.01", name: "amount", required: true, max: String(budgetSummary(pr).remaining) }),
                    br(),
                    br(),
                    label(i18n.projectBountyDescription),
                    br(),
                    textarea({ name: "description", rows: "3" }),
                    br(),
                    br(),
                    label(i18n.projectMilestoneSelect),
                    br(),
                    select(
                      { name: "milestoneIndex" },
                      option({ value: "" }, "-"),
                      ...safeArr(pr && pr.milestones).map((m, idx) => option({ value: String(idx) }, m.title))
                    ),
                    br(),
                    br(),
                    button({ class: "btn", type: "submit", disabled: budgetSummary(pr).remaining <= 0 }, i18n.projectBountyCreateButton)
                  )
                )
              )
            : null,
            br(),
          div(
            { class: "card-comments-summary" },
            span({ class: "card-label" }, i18n.voteCommentsLabel + ":"),
            span({ class: "card-value" }, String(pr.commentCount || 0)),
            br(),
            br(),
            form({ method: "GET", action: `/projects/${encodeURIComponent(pr.id)}` }, button({ type: "submit", class: "filter-btn" }, i18n.voteCommentsForumButton))
          ),
          div(
            { class: "card-footer" },
            span({ class: "date-link" }, `${moment(pr.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
            a({ href: `/author/${encodeURIComponent(pr.author)}`, class: "user-link" }, pr.author)
          )
        )
      })
    : p(i18n.projectNoProjectsFound)
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
      br(),
      label(i18n.projectDescription),
      br(),
      textarea({ name: "description", rows: "6", required: true, placeholder: i18n.projectDescriptionPlaceholder }, pr.description || ""),
      br(),
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
      br(),
      label(i18n.projectMilestoneDescription),
      br(),
      textarea({ name: "milestoneDescription", rows: "3", placeholder: i18n.projectMilestoneDescriptionPlaceholder }),
      br(),
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

exports.projectsView = async (projectsOrForm, filter) => {
  const f = String(filter || "ALL").toUpperCase()
  const filterObj = FILTERS.find((x) => x.key === f) || FILTERS[0]
  const sectionTitle = i18n[filterObj.title] || i18n.projectAllTitle

  return template(
    i18n.projectsTitle,
    section(
      div({ class: "tags-header" }, h2(sectionTitle), p(i18n.projectsDescription)),
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
            : div({ class: "projects-list" }, renderProjectList(projectsOrForm, f))
          )
    )
  )
}

exports.singleProjectView = async (project, filter, comments) => {
  const pr = project || {}
  const f = String(filter || "ALL").toUpperCase()
  const isAuthor = pr.author === userId

  const statusUpper = String(pr.status || "ACTIVE").toUpperCase()
  const statusClass = `status-${statusUpper.toLowerCase()}`

  const pctRaw = toNum(pr.progress)
  const pct = clamp(Math.round(Number.isFinite(pctRaw) ? pctRaw : 0), 0, 100)

  const goal = Math.max(0, toNum(pr.goal) || 0)
  const pledged = Math.max(0, toNum(pr.pledged) || 0)
  const fundingPct = goal > 0 ? clamp(Math.round((pledged / goal) * 100), 0, 100) : 0

  const topbar = renderProjectTopbar(pr, f, { single: true })

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
      div(
        { class: `project-card ${statusClass}` },
        topbar ? topbar : null,
        !isAuthor && safeArr(pr.followers).includes(userId) ? p({ class: "hint" }, i18n.projectYouFollowHint) : null,
        h2(pr.title),
        pr.image ? div({ class: "activity-image-preview" }, renderMediaBlob(pr.image)) : null,
        safeText(pr.description) ? renderCardFieldRich(i18n.projectDescription + ":", renderUrl(pr.description)) : null,
        renderCardField(i18n.projectStatus + ":", i18n["projectStatus" + statusUpper] || statusUpper),
        renderProgressBlock(i18n.projectProgress + ":", `${pct}%`, pct, 100),
        renderCardField(i18n.projectGoal + ":", `${pr.goal} ECO`),
        renderCardField(i18n.projectPledged + ":", `${pr.pledged || 0} ECO`),
        renderProgressBlock(i18n.projectFunding + ":", `${fundingPct}%`, fundingPct, 100),
        div(
          { class: "social-stats" },
          renderCardField(i18n.projectFollowers + ":", String(followersCount(pr))),
          renderCardField(i18n.projectBackers + ":", `${backersCount(pr)} · ${backersTotal(pr)} ECO`)
        ),
        renderBudget(pr),
        renderMilestonesAndBounties(pr, f, isAuthor),
        renderFollowers(pr),
        br(),
        renderBackers(pr, f),
        renderPledgeBox(pr, f, isAuthor),
        div(
          { class: "card-footer" },
          span({ class: "date-link" }, `${moment(pr.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
          a({ href: `/author/${encodeURIComponent(pr.author)}`, class: "user-link" }, pr.author)
        )
      ),
      div(
        { class: "comment-form-wrapper" },
        h2({ class: "comment-form-title" }, i18n.voteNewCommentLabel),
        form(
          { method: "POST", action: `/projects/${encodeURIComponent(pr.id || pr.key)}/comments`, class: "comment-form", enctype: "multipart/form-data" },
          textarea({ id: "comment-text", name: "text", rows: 4, class: "comment-textarea", placeholder: i18n.voteNewCommentPlaceholder }),
          div({ class: "comment-file-upload" }, label(i18n.uploadMedia), input({ type: "file", name: "blob" })),
          br(),
          button({ type: "submit", class: "comment-submit-btn" }, i18n.voteNewCommentButton)
        )
      ),
      comments && comments.length
        ? div(
            { class: "comments-list" },
            comments.map((c) => {
              const author = c?.value?.author || ""
              const ts = c?.value?.timestamp || c?.timestamp
              const absDate = ts ? moment(ts).format("YYYY/MM/DD HH:mm:ss") : ""
              const relDate = ts ? moment(ts).fromNow() : ""
              return div(
                { class: "comment-card" },
                div({ class: "comment-header" }, a({ href: `/author/${encodeURIComponent(author)}`, class: "user-link" }, author)),
                div({ class: "comment-date" }, span({ title: absDate }, relDate)),
                div({ class: "comment-body" }, ...renderUrl(c?.value?.content?.text || ""))
              )
            })
          )
        : null
    )
  )
}

