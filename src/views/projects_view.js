const { form, button, div, h2, p, section, input, label, textarea, br, a, span, select, option, img, ul, li, table, thead, tbody, tr, th, td } = require("../server/node_modules/hyperaxe")
const { template, i18n } = require('./main_views')
const moment = require("../server/node_modules/moment")
const { config } = require('../server/SSB_server.js')
const { renderUrl } = require('../backend/renderUrl')

const userId = config.keys.id

const FILTERS = [
  { key: 'ALL', i18n: 'projectFilterAll', title: 'projectAllTitle' },
  { key: 'MINE', i18n: 'projectFilterMine', title: 'projectMineTitle' },
  { key: 'ACTIVE', i18n: 'projectFilterActive', title: 'projectActiveTitle' },
  { key: 'PAUSED', i18n: 'projectFilterPaused', title: 'projectPausedTitle' },
  { key: 'COMPLETED', i18n: 'projectFilterCompleted', title: 'projectCompletedTitle' },
  { key: 'FOLLOWING', i18n: 'projectFilterFollowing', title: 'projectFollowingTitle' },
  { key: 'RECENT', i18n: 'projectFilterRecent', title: 'projectRecentTitle' },
  { key: 'TOP', i18n: 'projectFilterTop', title: 'projectTopTitle' },
  { key: 'BACKERS', i18n: 'projectFilterBackers', title: 'projectBackersLeaderboardTitle' }
]

const field = (labelText, value) =>
  div({ class: 'card-field' },
    span({ class: 'card-label' }, labelText),
    span({ class: 'card-value' }, value)
  )
  
const renderProjectCommentsSection = (projectId, comments = []) => {
  const commentsCount = Array.isArray(comments) ? comments.length : 0;

  return div({ class: 'vote-comments-section' },
    div({ class: 'comments-count' },
      span({ class: 'card-label' }, i18n.voteCommentsLabel + ': '),
      span({ class: 'card-value' }, String(commentsCount))
    ),
    div({ class: 'comment-form-wrapper' },
      h2({ class: 'comment-form-title' }, i18n.voteNewCommentLabel),
      form({
        method: 'POST',
        action: `/projects/${encodeURIComponent(projectId)}/comments`,
        class: 'comment-form'
      },
        textarea({
          id: 'comment-text',
          name: 'text',
          required: true,
          rows: 4,
          class: 'comment-textarea',
          placeholder: i18n.voteNewCommentPlaceholder
        }),
        br(),
        button({ type: 'submit', class: 'comment-submit-btn' }, i18n.voteNewCommentButton)
      )
    ),
    comments && comments.length
      ? div({ class: 'comments-list' },
          comments.map(c => {
            const author = c.value && c.value.author ? c.value.author : '';
            const ts = c.value && c.value.timestamp ? c.value.timestamp : c.timestamp;
            const absDate = ts ? moment(ts).format('YYYY/MM/DD HH:mm:ss') : '';
            const relDate = ts ? moment(ts).fromNow() : '';
            const userName = author && author.includes('@') ? author.split('@')[1] : author;
            const rootId = c.value && c.value.content ? (c.value.content.fork || c.value.content.root) : null;

            return div({ class: 'votations-comment-card' },
              span({ class: 'created-at' },
                span(i18n.createdBy),
                author
                  ? a({ href: `/author/${encodeURIComponent(author)}` }, `@${userName}`)
                  : span('(unknown)'),
                absDate ? span(' | ') : '',
                absDate ? span({ class: 'votations-comment-date' }, absDate) : '',
                relDate ? span({ class: 'votations-comment-date' }, ' | ', i18n.sendTime) : '',
                relDate && rootId
                  ? a({
                      href: `/thread/${encodeURIComponent(rootId)}#${encodeURIComponent(c.key)}`
                    }, relDate)
                  : ''
              ),
              p({
                class: 'votations-comment-text',
                innerHTML: (c.value && c.value.content && c.value.content.text) || ''
              })
            );
          })
        )
      : p({ class: 'votations-no-comments' }, i18n.voteNoCommentsYet)
  );
};  

function sumAmounts(list = []) {
  return list.reduce((s, x) => s + (parseFloat(x.amount || 0) || 0), 0)
}

function budgetSummary(project) {
  const goal = parseFloat(project.goal || 0) || 0
  const assigned = sumAmounts(project.bounties || [])
  const remaining = Math.max(0, goal - assigned)
  const exceeded = assigned > goal
  return { goal, assigned, remaining, exceeded }
}

const followersCount = (p) => Array.isArray(p.followers) ? p.followers.length : 0
const backersTotal = (p) => sumAmounts(p.backers || [])
const backersCount = (p) => Array.isArray(p.backers) ? p.backers.length : 0

function aggregateTopBackers(projects = []) {
  const map = new Map()
  for (const pr of projects) {
    const backers = Array.isArray(pr.backers) ? pr.backers : []
    for (const b of backers) {
      const uid = b.userId
      const amt = Math.max(0, parseFloat(b.amount || 0) || 0)
      if (!map.has(uid)) map.set(uid, { userId: uid, total: 0, pledges: 0, projects: new Set() })
      const rec = map.get(uid)
      rec.total += amt
      rec.pledges += 1
      rec.projects.add(pr.id)
    }
  }
  return Array.from(map.values())
    .map(r => ({ ...r, projects: r.projects.size }))
    .sort((a, b) => b.total - a.total)
}

function renderBackersLeaderboard(projects) {
  const rows = aggregateTopBackers(projects)
  if (!rows.length) return div({ class: 'backers-leaderboard empty' }, p(i18n.projectNoBackersFound))
  return div({ class: 'backers-leaderboard' },
    h2(i18n.projectBackersLeaderboardTitle),
    ...rows.slice(0, 50).map(r =>
      div({ class: 'backer-row' },
        div({ class: 'card-field' },
          span({ class: 'card-label' }, ''),
          span({ class: 'card-value' },
            a({ href: `/author/${encodeURIComponent(r.userId)}`, class: 'user-link user-pill' }, r.userId)
          )
        ),
        div({ class: 'card-field' },
          span({ class: 'card-label' }, i18n.projectBackerAmount + ':'),
          span({ class: 'card-value' }, span({ class: 'chip chip-amt' }, `${r.total} ECO`))
        ),
        div({ class: 'card-field' },
          span({ class: 'card-label' }, i18n.projectBackerPledges + ':'),
          span({ class: 'card-value' }, span({ class: 'chip chip-pledges' }, String(r.pledges)))
        ),
        div({ class: 'card-field' },
          span({ class: 'card-label' }, i18n.projectBackerProjects + ':'),
          span({ class: 'card-value' }, span({ class: 'chip chip-projects' }, String(r.projects)))
        )
      )
    )
  )
}

function renderBackers(project) {
  const backers = Array.isArray(project.backers) ? project.backers : [];
  const total = sumAmounts(backers);
  const mine = sumAmounts(backers.filter(b => b.userId === userId));

  return div({ class: 'backers-block' },
    h2(i18n.projectBackersTitle),
    div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.projectBackersTotal + ':'), span({ class: 'card-value' }, String(backers.length))),
    div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.projectBackersTotalPledged + ':'), span({ class: 'card-value' }, `${total} ECO`)),
    mine > 0 ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.projectBackersYourPledge + ':'), span({ class: 'card-value chip chip-you' }, `${mine} ECO`)) : null,
    backers.length
      ? table({ class: 'backers-table' },
          thead(
            tr(
              th(i18n.projectBackerDate || 'Date'),
              th(i18n.projectBackerAuthor || 'Author'),
              th(i18n.projectBackerAmount)
            )
          ),
          tbody(
            ...backers.slice(0, 8).map(b =>
              tr(
                td(b.at ? moment(b.at).format('YYYY/MM/DD HH:mm') : ''),
                td(a({ href: `/author/${encodeURIComponent(b.userId)}`, class: 'user-link' }, b.userId)),
                td(`${b.amount} ECO`)
              )
            )
          )
        )
      : p(i18n.projectBackersNone)
  );
}

function renderPledgeBox(project, isAuthor) {
  const isActive = String(project.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
  if (!isActive || isAuthor) return null;
  return div({ class: 'pledge-box' },
    h2(i18n.projectPledgeTitle),
    form({ method: "POST", action: `/projects/pledge/${encodeURIComponent(project.id)}` },
      input({ type: "number", name: "amount", min: "0.01", step: "0.01", required: true, placeholder: i18n.projectPledgePlaceholder }),
      select({ name: "milestoneOrBounty" },
        option({ value: "" }, i18n.projectSelectMilestoneOrBounty),
        ...(project.milestones || []).map((m, idx) => option({ value: `milestone:${idx}` }, m.title)),
        ...(project.bounties || []).map((b, idx) => option({ value: `bounty:${idx}` }, b.title))
      ),
      button({ class: "btn", type: "submit" }, i18n.projectPledgeButton)
    )
  );
}

function bountyTotalsForMilestone(project, mIndex) {
  const list = (project.bounties || []).filter(b => (b.milestoneIndex ?? null) === mIndex)
  const total = sumAmounts(list)
  const done = list.filter(b => b.done).length
  return { total, count: list.length, done }
}

function renderBudget(project) {
  const S = budgetSummary(project)
  return div({ class: `budget-summary${S.exceeded ? ' over' : ''}` },
    div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.projectBudgetGoal + ':'), span({ class: 'card-value' }, `${S.goal} ECO`)),
    div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.projectBudgetAssigned + ':'), span({ class: 'card-value' }, `${S.assigned} ECO`)),
    div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.projectBudgetRemaining + ':'), span({ class: 'card-value' }, `${S.remaining} ECO`)),
    S.exceeded ? p({ class: 'warning' }, i18n.projectBudgetOver) : null
  )
}

function renderFollowers(project) {
  const followers = Array.isArray(project.followers) ? project.followers : []
  if (!followers.length) return div({ class: 'followers-block' }, h2(i18n.projectFollowersTitle), p(i18n.projectFollowersNone))
  const show = followers.slice(0, 12)
  return div({ class: 'followers-block' },
    h2(i18n.projectFollowersTitle),
    ul(show.map(uid => li(a({ href: `/author/${encodeURIComponent(uid)}`, class: 'user-link' }, uid)))),
    followers.length > show.length ? p(`+${followers.length - show.length} ${i18n.projectMore}`) : null
  )
}

function renderMilestonesAndBounties(project, editable = false) {
  const milestones = project.milestones || [];
  const bounties = project.bounties || [];
  const unassigned = bounties.filter(b => b.milestoneIndex == null);

  const blocks = milestones.map((m, idx) => {
    const { total, count, done } = bountyTotalsForMilestone(project, idx);
    const items = bounties.filter(b => b.milestoneIndex === idx);
    return div({ class: 'milestone-with-bounties' },
      div({ class: 'milestone-stats' },
          div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.projectMilestoneStatus + ':'), span({ class: 'card-value' }, m.done ? i18n.projectMilestoneDone.toUpperCase() : i18n.projectMilestoneOpen.toUpperCase())),
          div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.projectBounties + ':'), span({ class: 'card-value' }, `${done}/${count} · ${total} ECO`))
        ),
      div({ class: 'milestone-head' },
          span({ class: 'milestone-title' }, m.title),
          m.dueDate ? span({ class: 'chip chip-due' }, `${i18n.projectMilestoneDue}: ${moment(m.dueDate).format('YYYY/MM/DD HH:mm')}`) : null,
          m.description ? p(...renderUrl(m.description)) : null,
        (editable && !m.done) ? form({ method: 'POST', action: `/projects/milestones/complete/${encodeURIComponent(project.id)}/${idx}` },
          button({ class: 'btn', type: 'submit' }, i18n.projectMilestoneMarkDone)
        ) : null
      ),
      items.length
        ? ul(items.map(b => {
            const globalIndex = bounties.indexOf(b);
            return li({ class: 'bounty-item' },
              field(i18n.projectBountyStatus + ':', b.done ? i18n.projectBountyDone.toUpperCase() : (b.claimedBy ? i18n.projectBountyClaimed.toUpperCase() : i18n.projectBountyOpen.toUpperCase())),
              br,
              div({ class: 'bounty-main' },
                span({ class: 'bounty-title' }, b.title),
                span({ class: 'bounty-amount' }, `${b.amount} ECO`)
              ),
              b.description ? p(...renderUrl(b.description)) : null,
              b.claimedBy ? field(i18n.projectBountyClaimedBy + ':', a({ href: `/author/${encodeURIComponent(b.claimedBy)}`, class: 'user-link' }, b.claimedBy)) : null,
              (!editable && !b.done && !b.claimedBy && project.author !== userId)
                ? form({ method: 'POST', action: `/projects/bounties/claim/${encodeURIComponent(project.id)}/${globalIndex}` },
                    button({ type: 'submit', class: 'btn' }, i18n.projectBountyClaimButton)
                  ) : null,
              (editable && !b.done)
                ? form({ method: 'POST', action: `/projects/bounties/complete/${encodeURIComponent(project.id)}/${globalIndex}` },
                    button({ type: 'submit', class: 'btn' }, i18n.projectBountyCompleteButton)
                  ) : null
            )
          }))
        : p(i18n.projectNoBounties)
    );
  });

  const unassignedBlock = unassigned.length
    ? div({ class: 'bounty-milestone-block' },
        h2(`${i18n.projectBounties} — ${i18n.projectMilestoneOpen} (no milestone)`),
        ul(unassigned.map(b => {
          const globalIndex = bounties.indexOf(b);
          return li({ class: 'bounty-item' },
            div({ class: 'bounty-main' },
              span({ class: 'bounty-title' }, b.title),
              span({ class: 'bounty-amount' }, `${b.amount} ECO`)
            ),
            b.description ? p(...renderUrl(b.description)) : null,
            field(i18n.projectBountyStatus + ':', b.done ? i18n.projectBountyDone : (b.claimedBy ? i18n.projectBountyClaimed : i18n.projectBountyOpen)),
            b.claimedBy ? field(i18n.projectBountyClaimedBy + ':', a({ href: `/author/${encodeURIComponent(b.claimedBy)}`, class: 'user-link' }, b.claimedBy)) : null,
            (!editable && !b.done && !b.claimedBy && project.author !== userId)
              ? form({ method: 'POST', action: `/projects/bounties/claim/${encodeURIComponent(project.id)}/${globalIndex}` },
                  button({ type: 'submit', class: 'btn' }, i18n.projectBountyClaimButton)
                ) : null,
            (editable && !b.done)
              ? form({ method: 'POST', action: `/projects/bounties/complete/${encodeURIComponent(project.id)}/${globalIndex}` },
                  button({ type: 'submit', class: 'btn' }, i18n.projectBountyCompleteButton)
                ) : null,
            editable ? form({ method: 'POST', action: `/projects/bounties/update/${encodeURIComponent(project.id)}/${globalIndex}` },
              label(i18n.projectMilestoneSelect), br(),
              select({ name: 'milestoneIndex' },
                option({ value: '', selected: b.milestoneIndex == null }, '-'),
                ...(project.milestones || []).map((m, idx) =>
                  option({ value: String(idx), selected: b.milestoneIndex === idx }, m.title)
                )
              ),
              button({ class: 'btn', type: 'submit' }, i18n.projectBountyCreateButton)
            ) : null
          )
        }))
      )
    : null;

  return div({ class: 'milestones-bounties' }, ...blocks, unassignedBlock);
}

const renderProjectList = (projects, filter) => 
  projects.length > 0 ? projects.map(pr => {
    const isMineFilter = String(filter).toUpperCase() === 'MINE';
    const isAuthor = pr.author === userId;
    const statusUpper = String(pr.status || 'ACTIVE').toUpperCase();
    const isActive = statusUpper === 'ACTIVE';
    const pct = parseFloat(pr.progress || 0) || 0;
    const ratio = pr.goal ? Math.min(100, Math.round((parseFloat(pr.pledged || 0) / parseFloat(pr.goal)) * 100)) : 0;
    const mileDone = (pr.milestones || []).filter(m => m.done).length;
    const mileTotal = (pr.milestones || []).length;
    const statusClass = `status-${statusUpper.toLowerCase()}`;
    const remain = budgetSummary(pr).remaining;
    const followers = Array.isArray(pr.followers) ? pr.followers.length : 0;
    const backers = Array.isArray(pr.backers) ? pr.backers.length : 0;


    return div({ class: `project-card ${statusClass}` },
      isMineFilter && isAuthor ? div({ class: "project-actions" },
        form({ method: "GET", action: `/projects/edit/${encodeURIComponent(pr.id)}` },
          button({ class: "update-btn", type: "submit" }, i18n.projectUpdateButton)
        ),
        form({ method: "POST", action: `/projects/delete/${encodeURIComponent(pr.id)}` },
          button({ class: "delete-btn", type: "submit" }, i18n.projectDeleteButton)
        ),
        form({ method: "POST", action: `/projects/status/${encodeURIComponent(pr.id)}`, style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;" },
          select({ name: "status", onChange: "this.form.submit()" },
            option({ value: "ACTIVE", selected: statusUpper === 'ACTIVE' }, i18n.projectStatusACTIVE),
            option({ value: "PAUSED", selected: statusUpper === 'PAUSED' }, i18n.projectStatusPAUSED),
            option({ value: "COMPLETED", selected: statusUpper === 'COMPLETED' }, i18n.projectStatusCOMPLETED),
            option({ value: "CANCELLED", selected: statusUpper === 'CANCELLED' }, i18n.projectStatusCANCELLED)
          ),
          button({ class: "status-btn", type: "submit" }, i18n.projectSetStatus)
        ),
        form({ method: "POST", action: `/projects/progress/${encodeURIComponent(pr.id)}`, style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;" },
          input({ type: "number", name: "progress", min: "0", max: "100", value: pct }),
          button({ class: "status-btn", type: "submit" }, i18n.projectSetProgress)
        )
      ) : null,
      div({ class: 'project-actions' },
        !isMineFilter && !isAuthor && isActive ? (Array.isArray(pr.followers) && pr.followers.includes(userId) ?
          form({ method: "POST", action: `/projects/unfollow/${encodeURIComponent(pr.id)}` },
            button({ type: "submit", class: "unsubscribe-btn" }, i18n.projectUnfollowButton)
          ) :
          form({ method: "POST", action: `/projects/follow/${encodeURIComponent(pr.id)}` },
            button({ type: "submit", class: "subscribe-btn" }, i18n.projectFollowButton)
          )
        ) : null,
        form({ method: "GET", action: `/projects/${encodeURIComponent(pr.id)}` },
          button({ type: "submit", class: "filter-btn" }, i18n.viewDetailsButton)
        ),
      ),
      br(),
      h2(pr.title),
      pr.image ? div({ class: 'activity-image-preview' }, img({ src: `/blob/${encodeURIComponent(pr.image)}` })) : null,
      field(i18n.projectDescription + ':', ''), p(...renderUrl(pr.description)),
      field(i18n.projectStatus + ':', i18n['projectStatus' + statusUpper] || statusUpper),
      field(i18n.projectProgress + ':', `${pct}%`),
      field(i18n.projectGoal + ':'), br(),
      div({ class: 'card-label' }, h2(`${pr.goal} ECO`)), br(),
      field(i18n.projectPledged + ':', `${pr.pledged || 0} ECO`),
      field(i18n.projectFunding + ':', `${ratio}%`),
      field(i18n.projectMilestones + ':', `${mileDone}/${mileTotal}`),
      field(i18n.projectFollowers + ':', String(followersCount(pr))),
      field(i18n.projectBackers + ':', `${backersCount(pr)} · ${backersTotal(pr)} ECO`), br(),
      isMineFilter && isAuthor ? [
        renderBudget(pr),
        renderMilestonesAndBounties(pr, true),
        div({ class: 'new-milestone' },
          h2(i18n.projectAddMilestoneTitle),
          form({ method: 'POST', action: `/projects/milestones/add/${encodeURIComponent(pr.id)}` },
            label(i18n.projectMilestoneTitle), br(),
            input({ type: 'text', name: 'title', required: true }), br(), br(),
            label(i18n.projectMilestoneDescription), br(),
            textarea({ name: 'description', rows: '3' }), br(), br(),
            label(i18n.projectMilestoneTargetPercent), br(),
            input({ type: 'number', name: 'targetPercent', min: '0', max: '100', step: '1', value: '0' }), br(), br(),
            label(i18n.projectMilestoneDueDate), br(),
            input({ type: 'datetime-local', name: 'dueDate', min: moment().format("YYYY-MM-DDTHH:mm"), max: pr.deadline ? moment(pr.deadline).format("YYYY-MM-DDTHH:mm") : undefined }), br(), br(),
            button({ class: 'btn', type: 'submit' }, i18n.projectMilestoneCreateButton)
          )
        ),
        div({ class: 'new-bounty' },
          h2(i18n.projectAddBountyTitle),
          form({ method: "POST", action: `/projects/bounties/add/${encodeURIComponent(pr.id)}` },
            label(i18n.projectBountyTitle), br(),
            input({ type: "text", name: "title", required: true }), br(), br(),
            label(i18n.projectBountyAmount), br(),
            input({ type: "number", step: "0.01", name: "amount", required: true, max: String(budgetSummary(pr).remaining) }), br(), br(),
            label(i18n.projectBountyDescription), br(),
            textarea({ name: "description", rows: "3" }), br(), br(),
            label(i18n.projectMilestoneSelect), br(),
            select({ name: 'milestoneIndex' },
              option({ value: '' }, '-'),
              ...(pr.milestones || []).map((m, idx) =>
                option({ value: String(idx) }, m.title)
              )
            ), br(), br(),
            button({ class: 'btn', type: 'submit', disabled: remain <= 0 }, remain > 0 ? i18n.projectBountyCreateButton : 'No remaining budget')
          )
        )
      ] : null,
      div({ class: 'card-comments-summary' },
        span({ class: 'card-label' }, i18n.voteCommentsLabel + ':'),
        span({ class: 'card-value' }, String(pr.commentCount || 0)),
        br(), br(),
        form({ method: 'GET', action: `/projects/${encodeURIComponent(pr.id)}` },
          button({ type: 'submit', class: 'filter-btn' }, i18n.voteCommentsForumButton)
        )
      ),

      div({ class: 'card-footer' },
        span({ class: 'date-link' }, `${moment(pr.createdAt).format('YYYY/MM/DD HH:mm:ss')} ${i18n.performed} `),
        a({ href: `/author/${encodeURIComponent(pr.author)}`, class: 'user-link' }, pr.author)
      )
    )
  }) : p(i18n.projectNoProjectsFound)

const renderProjectForm = (project = {}, mode='create') => {
  const isEdit = mode === 'edit'
  const nowLocal = moment().format("YYYY-MM-DDTHH:mm")
  const deadlineValue = project.deadline ? moment(project.deadline).format("YYYY-MM-DDTHH:mm") : ''
  const milestoneMax = deadlineValue || undefined

  return div({ class: "div-center project-form" },
    form({
      action: isEdit ? `/projects/update/${encodeURIComponent(project.id)}` : "/projects/create",
      method: "POST",
      enctype: "multipart/form-data"
    },
      label(i18n.projectTitle), br(),
      input({ type: "text", name: "title", required: true, placeholder: i18n.projectTitlePlaceholder, value: project.title || "" }), br(), br(),
      label(i18n.projectDescription), br(),
      textarea({ name: "description", rows: "6", required: true, placeholder: i18n.projectDescriptionPlaceholder }, project.description || ""), br(), br(),
      label(i18n.projectImage), br(),
      input({ type: "file", name: "image", accept: "image/*" }), br(),
      project.image ? img({ src: `/blob/${encodeURIComponent(project.image)}`, class: 'existing-image' }) : null, br(),
      label(i18n.projectGoal), br(),
      input({ type: "number", step: "0.01", min: "0.01", name: "goal", required: true, placeholder: i18n.projectGoalPlaceholder, value: project.goal || "" }), br(), br(),
      label(i18n.projectDeadline), br(),
      input({ type: "datetime-local", name: "deadline", id: "deadline", required: true, min: nowLocal, value: deadlineValue }), br(), br(),
      h2(i18n.projectAddMilestoneTitle),
      label(i18n.projectMilestoneTitle), br(),
      input({ type: "text", name: "milestoneTitle", required: true, placeholder: i18n.projectMilestoneTitlePlaceholder }), br(), br(),
      label(i18n.projectMilestoneDescription), br(),
      textarea({ name: "milestoneDescription", rows: "3", placeholder: i18n.projectMilestoneDescriptionPlaceholder }), br(), br(),
      label(i18n.projectMilestoneTargetPercent), br(),
      input({ type: "number", name: "milestoneTargetPercent", min: "0", max: "100", step: "1", value: "0" }), br(), br(),
      label(i18n.projectMilestoneDueDate), br(),
      input({ type: "datetime-local", name: "milestoneDueDate", min: nowLocal, max: milestoneMax }), br(), br(),
      button({ type: "submit" }, isEdit ? i18n.projectUpdateButton : i18n.projectCreateButton)
    )
  )
}

exports.projectsView = async (projectsOrForm, filter="ALL") => {
  const filterObj = FILTERS.find(f => f.key === filter) || FILTERS[0]
  const sectionTitle = i18n[filterObj.title] || i18n.projectAllTitle
  return template(
    i18n.projectsTitle,
    section(
      div({ class: "tags-header" }, h2(sectionTitle), p(i18n.projectsDescription)),
      div({ class: "filters" },
        form({ method: "GET", action: "/projects", style: "display:flex;gap:12px;" },
          FILTERS.map(f =>
            button({ type: "submit", name: "filter", value: f.key, class: filter === f.key ? "filter-btn active" : "filter-btn" }, i18n[f.i18n])
          ).concat(button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.projectCreateProject))
        )
      ),
      filter === 'CREATE' || filter === 'EDIT'
        ? (() => {
            const prToEdit = filter === 'EDIT' ? projectsOrForm[0] : {}
            return renderProjectForm(prToEdit, filter === 'EDIT' ? 'edit' : 'create')
          })()
        : (filter === 'BACKERS'
            ? renderBackersLeaderboard(projectsOrForm)
            : div({ class: "projects-list" }, renderProjectList(projectsOrForm, filter))
          )
    )
  )
}

exports.singleProjectView = async (project, filter="ALL", comments = []) => {
  const isAuthor = project.author === userId
  const statusUpper = String(project.status || 'ACTIVE').toUpperCase()
  const isActive = statusUpper === 'ACTIVE'
  const statusClass = `status-${statusUpper.toLowerCase()}`
  const ratio = project.goal ? Math.min(100, Math.round((parseFloat(project.pledged || 0) / parseFloat(project.goal)) * 100)) : 0
  const remain = budgetSummary(project).remaining

  return template(
    i18n.projectsTitle,
    section(
      div({ class: "tags-header" }, h2(i18n.projectsTitle), p(i18n.projectsDescription)),
      div({ class: "filters" },
        form({ method: "GET", action: "/projects", style: "display:flex;gap:12px;" },
          FILTERS.map(f =>
            button({ type: "submit", name: "filter", value: f.key, class: filter === f.key ? "filter-btn active" : "filter-btn" }, i18n[f.i18n])
          ).concat(button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.projectCreateProject))
        )
      ),
      div({ class: `project-card ${statusClass}` },
        isAuthor ? div({ class: "project-actions" },
          form({ method: "GET", action: `/projects/edit/${encodeURIComponent(project.id)}` },
            button({ class: "update-btn", type: "submit" }, i18n.projectUpdateButton)
          ),
          form({ method: "POST", action: `/projects/delete/${encodeURIComponent(project.id)}` },
            button({ class: "delete-btn", type: "submit" }, i18n.projectDeleteButton)
          ),
          form({ method: "POST", action: `/projects/status/${encodeURIComponent(project.id)}`, style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;" },
            select({ name: "status" },
              option({ value: "ACTIVE", selected: statusUpper === 'ACTIVE' }, i18n.projectStatusACTIVE),
              option({ value: "PAUSED", selected: statusUpper === 'PAUSED' }, i18n.projectStatusPAUSED),
              option({ value: "COMPLETED", selected: statusUpper === 'COMPLETED' }, i18n.projectStatusCOMPLETED),
              option({ value: "CANCELLED", selected: statusUpper === 'CANCELLED' }, i18n.projectStatusCANCELLED)
            ),
            button({ class: "status-btn", type: "submit" }, i18n.projectSetStatus)
          ),
          form({ method: "POST", action: `/projects/progress/${encodeURIComponent(project.id)}`, style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;" },
            input({ type: "number", name: "progress", min: "0", max: "100", value: project.progress || 0 }),
            button({ class: "status-btn", type: "submit" }, i18n.projectSetProgress)
          )
        ) : null,
	(!isAuthor && Array.isArray(project.followers) && project.followers.includes(userId)) 
	  ? div({ class: 'hint' }, p({ class: 'hint' }, i18n.projectYouFollowHint)) 
	  : null,
        h2(project.title),
        project.image ? div({ class: 'activity-image-preview' }, img({ src: `/blob/${encodeURIComponent(project.image)}` })) : null,
        field(i18n.projectDescription + ':', ''), p(...renderUrl(project.description)),
        field(i18n.projectStatus + ':', i18n['projectStatus' + statusUpper] || statusUpper),
        field(i18n.projectGoal + ':'), br(),
        div({ class: 'card-label' }, h2(`${project.goal} ECO`)), br(),
	field(i18n.projectPledged + ':', `${project.pledged || 0} ECO`),
	field(i18n.projectFunding + ':', `${ratio}%`),
        field(i18n.projectProgress + ':', `${project.progress || 0}%`), br(),
        div({ class: 'social-stats' },
          field(i18n.projectFollowers + ':', String(followersCount(project))),
          field(i18n.projectBackers + ':', `${backersCount(project)} · ${backersTotal(project)} ECO`)
        ),
        renderBudget(project),
        renderMilestonesAndBounties(project, isAuthor),
        renderFollowers(project, isAuthor),
        (!isAuthor && isActive) ? (Array.isArray(project.followers) && project.followers.includes(userId) ?
          form({ method: "POST", action: `/projects/unfollow/${encodeURIComponent(project.id)}` },
            button({ class: "filter-btn", type: "submit" }, i18n.projectUnfollowButton)
          ) :
          form({ method: "POST", action: `/projects/follow/${encodeURIComponent(project.id)}` },
            button({ class: "filter-btn", type: "submit" }, i18n.projectFollowButton)
          )
        ) : null,
        br(),
        renderBackers(project),
        renderPledgeBox(project, isAuthor), 
        isAuthor ? div({ class: 'new-milestone' },
          h2(i18n.projectAddMilestoneTitle),
          form({ method: 'POST', action: `/projects/milestones/add/${encodeURIComponent(project.id)}` },
            label(i18n.projectMilestoneTitle), br(),
            input({ type: 'text', name: 'title', required: true }), br(), br(),
            label(i18n.projectMilestoneDescription), br(),
            textarea({ name: 'description', rows: '3' }), br(), br(),
            label(i18n.projectMilestoneTargetPercent), br(),
            input({ type: 'number', name: 'targetPercent', min: '0', max: '100', step: '1', value: '0' }), br(), br(),
            label(i18n.projectMilestoneDueDate), br(),
            input({ type: 'datetime-local', name: 'dueDate', min: moment().format("YYYY-MM-DDTHH:mm"), max: project.deadline ? moment(project.deadline).format("YYYY-MM-DDTHH:mm") : undefined }), br(), br(),
            button({ class: 'btn', type: 'submit' }, i18n.projectMilestoneCreateButton)
          )
        ) : null,
        isAuthor ? div({ class: 'new-bounty' },
          h2(i18n.projectAddBountyTitle),
          form({ method: "POST", action: `/projects/bounties/add/${encodeURIComponent(project.id)}` },
            label(i18n.projectBountyTitle), br(),
            input({ type: "text", name: "title", required: true }), br(), br(),
            label(i18n.projectBountyAmount), br(),
            input({ type: "number", step: "0.01", name: "amount", required: true, max: String(budgetSummary(project).remaining) }), br(), br(),
            label(i18n.projectBountyDescription), br(),
            textarea({ name: "description", rows: "3" }), br(), br(),
            label(i18n.projectMilestoneSelect), br(),
            select({ name: 'milestoneIndex' },
              option({ value: '' }, '-'),
              ...(project.milestones || []).map((m, idx) =>
                option({ value: String(idx) }, m.title)
              )
            ), br(), br(),
            button({ class: 'btn submit-bounty', type: 'submit' }, remain > 0 ? i18n.projectBountyCreateButton : i18n.projectNoRemainingBudget)
          )
        ) : null,
                div({ class: 'card-footer' },
          span({ class: 'date-link' }, `${moment(project.createdAt).format('YYYY/MM/DD HH:mm:ss')} ${i18n.performed} `),
          a({ href: `/author/${encodeURIComponent(project.author)}`, class: 'user-link' }, project.author)
        )
      ),
      renderProjectCommentsSection(project.id, comments)
    )
  )
}

