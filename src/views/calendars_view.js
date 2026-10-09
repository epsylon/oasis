const { div, h2, h3, h4, p, section, button, form, a, span, br, hr, textarea, input, label, select, option, table, tr, td, ul, li } = require("../server/node_modules/hyperaxe")
const { renderStyledText } = require("../backend/renderStyledText")
const { clearnetItemHref, template, i18n, userLink, renderStateChip, renderLifespanChip, renderSpreadButton , renderSpreadEditWarning, renderContentActions, renderDocumentActions, renderInviteQrCard, renderSubscriptionBox, renderModuleStatsBy, moduleIsEmpty, contentDeleteAction, paged } = require("./main_views")
const { renderMapEmbed } = require("./maps_view")
const { renderEncryptedChip, renderReachChip, renderClearnetSelector, renderClearnetSwitch } = require("./clearnet_view")
const moment = require("../server/node_modules/moment")
const { config } = require("../server/SSB_server.js")

const userId = config.keys.id
const CAL_REACH = ["OPEN", "CLOSED"]
const calReachLabel = (s) => s === "CLOSED" ? (i18n.calendarStatusClosed || "CLOSED") : (i18n.calendarStatusOpen || "OPEN")
const hasPublicInvite = (cal) => Array.isArray(cal.invites) && cal.invites.some(i => i && typeof i === "object" && i.public === true)
const clearnetEligible = (cal) => !!cal && !cal.tribeId && !cal.encrypted && String(cal.status || "").toUpperCase() === "OPEN" && !cal.isClosed && (!cal.contentEncrypted || hasPublicInvite(cal))
const calClearnetHref = (cal) => clearnetItemHref("calendars", cal.title, cal.rootId)

const renderNoteText = (text) => renderStyledText(String(text || ""))

const renderModeButtons = (currentFilter, emptyMod = false, modesAvail = null) =>
  div({ class: "tribe-mode-buttons" },
    ...(emptyMod ? [] : [
    ["recent", "mine", "all", "favorites", "open", "closed"].filter(f => f === "all" || f === currentFilter || (modesAvail && modesAvail[f] !== false)).map(f =>
      form({ method: "GET", action: "/calendars" },
        input({ type: "hidden", name: "filter", value: f }),
        button({ type: "submit", class: currentFilter === f ? "filter-btn active" : "filter-btn" },
          i18n[`calendarFilter${f.charAt(0).toUpperCase() + f.slice(1)}`] || f.toUpperCase())
      )
    ),
    ]),
    form({ method: "GET", action: "/calendars" },
      input({ type: "hidden", name: "filter", value: "create" }),
      button({ type: "submit", class: "create-button" }, i18n.calendarCreate || "Create Calendar")
    )
  )

const renderStatus = (cal) => {
  if (cal.isClosed) return span({ class: "pad-status-closed" }, i18n.calendarStatusClosed || "CLOSED")
  return span({ class: "pad-status-open" }, i18n.calendarStatusOpen || "OPEN")
}

const renderCalendarStatusChip = (cal) => {
  const isClosed = !!cal.isClosed
  const variant = isClosed ? "closed" : "mutuals"
  const icon = isClosed ? "\u2717" : "\u2713"
  const label = isClosed ? (i18n.calendarStatusClosed || "CLOSED") : (i18n.calendarStatusOpen || "OPEN")
  return renderStateChip(variant, icon, label)
}

const renderCalendarCard = exports.renderCalendarCard = (cal, spreadInfo) => {
  const href = `/calendars/${encodeURIComponent(cal.rootId)}`
  const chips = [
    renderCalendarStatusChip(cal),
    renderEncryptedChip(i18n),
    renderLifespanChip(cal.lifetime, i18n),
    cal.clearnet === true && clearnetEligible(cal) ? renderReachChip(true, i18n, calClearnetHref(cal)) : null,
    cal.subscriptionIn === true
      ? renderStateChip("mutuals", "✉", i18n.subscriptionOn)
      : (cal.subscriptionIn === false ? renderStateChip("closed", "✉", i18n.subscriptionOff) : null)
  ].filter(Boolean)
  return div({ class: "tribe-card" },
    div({ class: "card-header activity-card-header" },
      renderContentActions(cal.rootId, href, { spread: spreadInfo || null, author: cal.author, favKind: 'calendars', isFavorite: cal.isFavorite, reportTitle: cal.title, deleteAction: String(cal.author) === String(userId) ? contentDeleteAction('calendar', cal.rootId) : undefined })
    ),
    div({ class: "tribe-card-body" },
      div({ class: "shop-title-row" },
        h2({ class: "tribe-card-title" }, a({ href }, cal.title || "\u2014"))
      ),
      chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
      cal.deadline
        ? p({ class: "job-meta-line" }, `${i18n.calendarDeadlineLabel || "Deadline"}: ${moment(cal.deadline).format("YYYY/MM/DD HH:mm")}`)
        : null,
      div({ class: "tribe-card-members" },
        span({ class: "tribe-members-count calendar-participants-count" }, `${i18n.calendarParticipantsLabel || "Participants"}: ${cal.participants.length}`)
      )
    )
  )
}

const renderIntervalBlock = (bounds = {}, current = "", until = "") => {
  const sel = (v) => (String(current || "") === v ? { selected: true } : {})
  return div({ class: "calendar-interval-block" },
    span({ class: "calendar-interval-label" }, i18n.calendarIntervalLabel || "Interval"),
    select({ name: "interval", class: "calendar-interval-select" },
      option({ value: "", ...sel("") }, i18n.calendarIntervalNone),
      option({ value: "weekly", ...sel("weekly") }, i18n.calendarIntervalWeekly || "Weekly"),
      option({ value: "monthly", ...sel("monthly") }, i18n.calendarIntervalMonthly || "Monthly"),
      option({ value: "yearly", ...sel("yearly") }, i18n.calendarIntervalYearly || "Yearly")
    ),
    span({ class: "calendar-interval-label calendar-interval-until" }, i18n.calendarIntervalUntil || "Until"),
    input({
      type: "datetime-local",
      name: "intervalDeadline",
      ...(until ? { value: until } : {}),
      ...(bounds.min ? { min: bounds.min } : {}),
      ...(bounds.max ? { max: bounds.max } : {})
    }),
    br()
  )
}

const renderCreateForm = (calendarToEdit, params) => {
  const isEdit = !!calendarToEdit
  const tribeId = (params && params.tribeId) || ""
  const draft = isEdit ? calendarToEdit : ((params && params.draft) || {})
  const reachRaw = String((params && params.reach) || draft.status || "").toUpperCase()
  const reach = CAL_REACH.includes(reachRaw) ? reachRaw : "OPEN"
  const showClearnet = reach === "OPEN" && !tribeId && clearnetEligible({ ...(isEdit ? calendarToEdit : {}), status: reach, isClosed: false })
  const asLocal = (v) => v ? moment(v).format("YYYY-MM-DDTHH:mm") : ""
  const now = moment().add(1, "minute").format("YYYY-MM-DDTHH:mm")
  const deadlineMax = calendarToEdit && calendarToEdit.deadline
    ? moment(calendarToEdit.deadline).format("YYYY-MM-DDTHH:mm")
    : ""
  const action = isEdit ? `/calendars/update/${encodeURIComponent(calendarToEdit.rootId)}` : "/calendars/create"
  const sectionTitle = isEdit ? (i18n.calendarUpdateSectionTitle || "Update Calendar") : (i18n.calendarCreateSectionTitle || "Create New Calendar")
  return div({ class: "div-center audio-form" },
    h2(sectionTitle),
    (params && params.spreadWarning) || null,
    form({ method: "GET", action: "/calendars" },
      input({ type: "hidden", name: "filter", value: isEdit ? "edit" : "create" }),
      isEdit ? input({ type: "hidden", name: "id", value: calendarToEdit.rootId }) : null,
      tribeId ? input({ type: "hidden", name: "tribeId", value: tribeId }) : null,
      label(i18n.calendarTypeLabel), br(),
      div({ class: "apply-row" },
        select({ name: "status", class: "report-category-select" },
          ...CAL_REACH.map(s => option({ value: s, ...(reach === s ? { selected: true } : {}) }, calReachLabel(s)))
        ),
        button({ type: "submit", class: "create-button" }, i18n.apply || "Apply")
      )
    ),
    hr({ class: "form-sep" }),
    h2({ class: "report-category-fixed" }, calReachLabel(reach)),
    form({ method: "POST", action },
      tribeId ? input({ type: "hidden", name: "tribeId", value: tribeId }) : null,
      input({ type: "hidden", name: "status", value: reach }),
      span(i18n.calendarTitleLabel || "Title"), br(),
      input({ type: "text", name: "title", maxlength: "100", required: true, placeholder: i18n.calendarTitlePlaceholder || "Calendar title...", value: draft.title || "" }),
      br(), br(),
      span(i18n.calendarDeadlineLabel || "Deadline"), br(),
      input({ type: "datetime-local", name: "deadline", required: true, min: now, value: asLocal(draft.deadline) }),
      br(), br(),
      span(i18n.calendarTagsLabel || "Tags"), br(),
      input({ type: "text", name: "tags", placeholder: i18n.calendarTagsPlaceholder || "Enter tags separated by commas", value: Array.isArray(draft.tags) ? draft.tags.join(", ") : "" }),
      br(), br(),
      span(i18n.mapLocationTitle || "Map Location"), br(),
      input({ type: "text", name: "mapUrl", placeholder: i18n.mapUrlPlaceholder || "/maps/MAP_ID", value: draft.mapUrl || "" }),
      br(), br(),
      !isEdit
        ? [
            span(i18n.calendarFirstDateLabel || "Date"), br(),
            input({ type: "datetime-local", name: "firstDate", required: true, min: now, max: deadlineMax || undefined, ...(draft.firstDate ? { value: asLocal(draft.firstDate) } : {}) }),
            br(), br(),
            span(i18n.calendarFormDescription || "Description"), br(),
            input({ type: "text", name: "firstDateLabel", placeholder: i18n.calendarDatePlaceholder || "Describe this date...", value: draft.firstDateLabel || "" }),
            br(), br(),
            span(i18n.calendarFirstNoteLabel || "Notes"), br(),
            textarea({ maxlength: "5000", name: "firstNote", rows: "3", placeholder: i18n.calendarNotePlaceholder || "Add a note..." }, draft.firstNote || ""),
            br(), br(),
            renderIntervalBlock({ min: now, max: deadlineMax || undefined }, draft.interval || "", asLocal(draft.intervalDeadline)),
            br(), br()
          ]
        : null,
      showClearnet ? renderClearnetSelector(draft.clearnet === true || String(draft.clearnet || "") === "1", i18n) : null,
      button({ type: "submit", class: "create-button" }, isEdit ? (i18n.calendarUpdate || "Update") : (i18n.calendarCreate || "Create Calendar"))
    )
  )
}

const renderMonthGrid = (year, month, datesMap, calendarId) => {
  const DAY_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startPad = (firstDay.getDay() + 6) % 7
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`

  const headerCells = DAY_NAMES.map(d => div({ class: "calendar-day-header" }, d))
  const cells = []

  for (let i = 0; i < startPad; i++) cells.push(div({ class: "calendar-day calendar-day-empty" }, " "))

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    const marked = datesMap && datesMap[dateStr] && datesMap[dateStr].length > 0
    if (marked) {
      cells.push(
        div({ class: "calendar-day calendar-day-marked" },
          a({ href: `/calendars/${encodeURIComponent(calendarId)}?month=${monthStr}&day=${dateStr}` }, String(day))
        )
      )
    } else {
      cells.push(div({ class: "calendar-day" }, String(day)))
    }
  }

  return div({ class: "calendar-grid" }, ...headerCells, ...cells)
}

exports.renderCalendarInvitePage = (code) => {
  const pageContent = div({ class: "invite-page" },
    h2(i18n.tribeInviteCodeText, code),
    form({ method: "GET", action: "/calendars" },
      input({ type: "hidden", name: "filter", value: "all" }),
      button({ type: "submit", class: "filter-btn" }, i18n.walletBack)
    )
  )
  return template(i18n.calendarGenerateInvite || "Invite", section(pageContent))
}

exports.calendarsView = async (calendars, filter, calendarToEdit, params) => {
  if (calendarToEdit) params = { ...(params || {}), spreadWarning: await renderSpreadEditWarning(calendarToEdit.id || calendarToEdit.key || calendarToEdit.rootId) };
  const q = (params && params.q) || ""
  const showForm = filter === "create" || filter === "edit" || !!calendarToEdit
  const emptyMod = moduleIsEmpty(Array.isArray(calendars) ? calendars : [], filter || "all", "all", q)
  const headerText = i18n.calendarsTitle || "Calendars"

  return template(
    i18n.calendarsTitle || "Calendars",
    section(
      div({ class: "tags-header module-header-line" },
        h2(headerText),
        p(i18n.calendarsDescription || "Discover and manage calendars.")
      ),
      renderModeButtons(filter, emptyMod, (params && params.modesAvail) || null),
      showForm || emptyMod
        ? null
        : div({ class: "filters activity-filter-chips activity-toolbar-row" },
          renderModuleStatsBy(calendars, c => c.isClosed ? 'CLOSED' : String(c.status || 'OPEN').toUpperCase(), [{ value: 'OPEN', label: i18n.calendarStatusOpen }, { value: 'CLOSED', label: i18n.calendarStatusClosed }]),
            form({ method: "GET", action: "/calendars", class: "filter-box" },
              input({ type: "hidden", name: "filter", value: filter }),
              input({ type: "text", name: "q", value: q, placeholder: i18n.calendarSearchPlaceholder || "Search calendars...", class: "filter-box__input" }),
              div({ class: "filter-box__controls" },
                button({ type: "submit", class: "filter-box__button" }, i18n.searchButton)
              )
            )
          )
    ),
    section(
      showForm
        ? renderCreateForm(calendarToEdit, params)
        : (calendars.length > 0
            ? div({ class: "tribe-grid" }, ...paged(calendars).map(c => renderCalendarCard(c, params && params.spreadMap && params.spreadMap.get(c.rootId))))
            : div({ class: "no-content-box" }, p({ class: "no-content" }, i18n.calendarsNoItems || "No calendars found.")))
    )
  )
}

exports.singleCalendarView = async (calendar, dates, notesByDate, params) => {
  const { month: monthStr, day: selectedDay } = params || {}
  const isAuthor = calendar.author === userId
  const isParticipant = calendar.participants.includes(userId)
  const calClosed = calendar.isClosed
  const shareUrl = `/calendars/${encodeURIComponent(calendar.rootId)}`

  const now = moment()
  const currentMonth = monthStr ? moment(monthStr, "YYYY-MM") : now.clone().startOf("month")
  const prevMonth = currentMonth.clone().subtract(1, "month").format("YYYY-MM")
  const nextMonth = currentMonth.clone().add(1, "month").format("YYYY-MM")
  const year = currentMonth.year()
  const month = currentMonth.month()

  const datesMap = {}
  for (const d of dates) {
    const dayKey = moment(d.date).format("YYYY-MM-DD")
    if (!datesMap[dayKey]) datesMap[dayKey] = []
    datesMap[dayKey].push(d)
  }

  const tags = Array.isArray(calendar.tags) && calendar.tags.length > 0
    ? div({ class: "tribe-side-tags" }, ...calendar.tags.map(t => a({ href: `/search?query=%23${encodeURIComponent(t)}`, class: "tag-link" }, `#${t}`)))
    : null

  const subscriptionIn = isAuthor || (calendar.subscription && calendar.subscription.subscribed === true)
  const canClearnet = clearnetEligible(calendar)
  const isClearnet = canClearnet && calendar.clearnet === true
  const detailChips = [
    renderCalendarStatusChip(calendar),
    renderEncryptedChip(i18n),
    renderLifespanChip(calendar.lifetime, i18n),
    canClearnet ? renderReachChip(isClearnet, i18n, isClearnet ? calClearnetHref(calendar) : null) : null,
    isAuthor && canClearnet ? renderClearnetSwitch("calendars", calendar.rootId, isClearnet) : null,
    (isAuthor || isParticipant)
      ? renderStateChip(subscriptionIn ? "mutuals" : "closed", "✉", subscriptionIn ? i18n.subscriptionOn : i18n.subscriptionOff)
      : null
  ].filter(Boolean)
  const calSide = div({ class: "tribe-side" },
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, calendar.title || "\u2014")
    ),
    detailChips.length ? div({ class: "card-chips-row" }, ...detailChips) : null,
    table({ class: "tribe-info-table" },
      tr(td({ class: "tribe-info-label" }, i18n.calendarCreated || "Created"), td({ class: "tribe-info-value", colspan: "3" }, moment(calendar.createdAt).format("YYYY/MM/DD HH:mm"))),
      calendar.deadline ? tr(td({ class: "tribe-info-label" }, i18n.calendarDeadlineLabel || "Deadline"), td({ class: "tribe-info-value", colspan: "3" }, moment(calendar.deadline).format("YYYY/MM/DD HH:mm"))) : null,
      tr(td({ class: "tribe-info-label" }, i18n.calendarStatusLabel || "Status"), td({ class: "tribe-info-value", colspan: "3" }, renderStatus(calendar))),
      tr(td({ class: "tribe-info-value", colspan: "4" }, userLink(calendar.author)))
    ),
    tags,
    renderMapEmbed(params && params.mapData, calendar.mapUrl),
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count calendar-participants-count" }, `${i18n.calendarParticipantsLabel || "Participants"}: ${calendar.participants.length}`)
    ),
    div({ class: "tribe-side-actions calendar-invite-actions" },
      isAuthor && calendar.status !== "OPEN"
        ? form({ method: "POST", action: `/calendars/generate-invite/${encodeURIComponent(calendar.rootId)}` },
            button({ type: "submit", class: "tribe-action-btn" }, i18n.tribeGenerateInvite)
          )
        : null,
      (() => {
        if (!(isAuthor && !calendar.tribeId)) return null
        const invs = Array.isArray(calendar.invites) ? calendar.invites : []
        const openInvite = invs.find(inv => typeof inv === "object" && inv && inv.public === true && inv.code)
        if (openInvite) return div({ class: "calendar-open-invite-block" },
          div({ class: "tribe-open-invite" },
            span({ class: "card-label" }, i18n.tribeInviteCodeText),
            span({ class: "tribe-open-invite-code" }, openInvite.code),
            renderInviteQrCard({ qrDataUrl: `/qr-invite-code/calendars/${encodeURIComponent(openInvite.code)}` })
          ),
          form({ method: "POST", action: `/calendars/open-invite/remove/${encodeURIComponent(calendar.rootId)}` },
            button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.tribeRemoveInvitation)
          )
        )
        return form({ method: "POST", action: `/calendars/open-invite/create/${encodeURIComponent(calendar.rootId)}` },
          button({ type: "submit", class: "tribe-action-btn" }, i18n.tribeOpenInvitation)
        )
      })(),
      !isAuthor && !isParticipant && calendar.status === "OPEN"
        ? form({ method: "POST", action: `/calendars/join/${encodeURIComponent(calendar.rootId)}` },
            button({ type: "submit", class: "create-button" }, i18n.calendarJoin || "Join Calendar")
          )
        : null,
      !isAuthor && !isParticipant && calendar.status !== "OPEN"
        ? a({ class: "tribe-action-btn", href: "/invites#invites-calendars" }, i18n.tribeEnterInvite)
        : null,
      !isAuthor && isParticipant
        ? form({ method: "POST", action: `/calendars/leave/${encodeURIComponent(calendar.rootId)}` },
            button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.tribeLeaveButton)
          )
        : null
    ),
    (calendar.subscription && (isAuthor || isParticipant))
      ? renderSubscriptionBox({
          target: calendar.rootId || calendar.key,
          scope: "calendars",
          subscribed: calendar.subscription.subscribed === true,
          count: calendar.subscription.count,
          isOwner: isAuthor,
          returnTo: shareUrl
        })
      : null,
    isAuthor
      ? div({ class: "tribe-side-actions calendar-owner-actions" },
          form({ method: "GET", action: "/calendars" },
            input({ type: "hidden", name: "filter", value: "edit" }),
            input({ type: "hidden", name: "id", value: calendar.rootId }),
            button({ type: "submit", class: "tribe-action-btn" }, i18n.calendarUpdate || "Update")
          )
        )
      : null,
    renderDocumentActions('calendars', calendar.rootId)
  )

  const minDate = now.add(1, "minute").format("YYYY-MM-DDTHH:mm")
  const calMax = calendar.deadline ? moment(calendar.deadline).format("YYYY-MM-DDTHH:mm") : ""
  const canAddDate = !calClosed && (calendar.status === "OPEN" || isAuthor)

  const unifiedForm = canAddDate
    ? div({ class: "div-center audio-form" },
        form({ method: "POST", action: `/calendars/add-date/${encodeURIComponent(calendar.rootId)}` },
          span(i18n.calendarDateLabel || "Date"), br(),
          input({ type: "datetime-local", name: "date", required: true, min: minDate, max: calMax || undefined }),
          br(), br(),
          span(i18n.calendarFormDescription || "Description"), br(),
          input({ type: "text", name: "label", placeholder: i18n.calendarDatePlaceholder || "Describe this date..." }),
          br(), br(),
          isParticipant
            ? [
                span(i18n.calendarNoteLabel), br(),
                textarea({ maxlength: "5000", name: "text", rows: "3", placeholder: i18n.calendarNotePlaceholder || "Add a note..." }),
                br(), br()
              ]
            : null,
          renderIntervalBlock({ min: minDate, max: calMax || undefined }),
          br(),
          button({ type: "submit", class: "create-button" }, i18n.calendarAddEntry || "Add Entry")
        )
      )
    : null

  const monthLabel = currentMonth.format("MMMM YYYY")
  const calNav = div({ class: "calendar-nav" },
    a({ href: `${shareUrl}?month=${prevMonth}`, class: "filter-btn" }, i18n.calendarMonthPrev || "\u2190 Prev"),
    span({ class: "tribe-info-label" }, monthLabel),
    a({ href: `${shareUrl}?month=${nextMonth}`, class: "filter-btn" }, i18n.calendarMonthNext || "Next \u2192")
  )

  const grid = renderMonthGrid(year, month, datesMap, calendar.rootId)

  const dayEntries = selectedDay
    ? dates.filter(d => moment(d.date).format("YYYY-MM-DD") === selectedDay)
    : []

  const dayNotesSection = selectedDay
    ? div({ class: "calendar-day-notes" },
        h4(`${selectedDay}${dayEntries.length > 0 && dayEntries[0].label ? " \u2014 " + dayEntries[0].label : ""}`),
        dayEntries.length === 0
          ? p({ class: "no-content" }, i18n.calendarNoDates || "No dates added yet.")
          : div(null, ...dayEntries.map(d => {
              const notes = (notesByDate && notesByDate[d.key]) ? notesByDate[d.key] : []
              return div({ class: "calendar-date-item" },
                (isAuthor || String(d.author) === String(userId))
                  ? form({ method: "POST", action: `/calendars/delete-date/${encodeURIComponent(d.key)}`, class: "calendar-date-delete" },
                      input({ type: "hidden", name: "calendarId", value: calendar.rootId }),
                      button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.calendarDeleteDate || "Delete Date")
                    )
                  : null,
                div({ class: "calendar-date-item-header" },
                  `${moment(d.date).format("YYYY/MM/DD HH:mm")}${d.label ? " \u2014 " + d.label : ""}`
                ),
                (() => {
                  const visibleNotes = notes.filter(n => n.text && String(n.text).trim())
                  return visibleNotes.length === 0
                    ? p({ class: "no-content" }, i18n.calendarNoNotes || "No notes.")
                    : div(null, ...visibleNotes.map(n => {
                      const isSelf = String(n.author) === String(userId)
                      const dateStr = moment(n.createdAt).format("YYYY/MM/DD HH:mm")
                      const shortId = n.author ? "@" + n.author.slice(1, 9) + "\u2026" : "?"
                      return div({ class: (isSelf ? "chat-message chat-message-self" : "chat-message") + " calendar-note-card" },
                        isSelf
                          ? form({ method: "POST", action: `/calendars/delete-note/${encodeURIComponent(n.key)}`, class: "calendar-note-delete" },
                              input({ type: "hidden", name: "calendarId", value: calendar.rootId }),
                              button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.calendarDeleteNote || "Delete")
                            )
                          : null,
                        div({ class: "chat-message-meta" },
                          span({ class: "chat-message-sender" },
                            userLink(n.author)
                          ),
                          span({ class: "chat-message-date" }, ` [ ${dateStr} ]`)
                        ),
                        span({ class: "chat-message-text" }, ...renderNoteText(n.text || ""))
                      )
                    }))
                })()
              )
            }))
      )
    : null

  const calMain = div({ class: "tribe-main" },
    div({ class: "card-header activity-card-header" },
      renderContentActions(calendar.rootId, shareUrl, {
        author: calendar.author,
        favKind: 'calendars',
        isFavorite: calendar.isFavorite,
        spread: (params && params.spreads) || null,
        returnTo: shareUrl,
        reportTitle: calendar.title,
        deleteAction: isAuthor ? contentDeleteAction('calendar', calendar.rootId) : undefined
      })
    ),

    calNav,
    grid,
    dayNotesSection,
    unifiedForm
  )

  return template(
    calendar.title || i18n.calendarsTitle || "Calendar",
    section(
      div({ class: "tags-header module-header-line" },
        h2(i18n.calendarsTitle || "Calendars"),
        p(i18n.calendarsDescription || "Discover and manage calendars.")
      ),
      renderModeButtons("all", false, (params && params.modesAvail) || null)
    ),
    section(div({ class: "tribe-details" }, calSide, calMain))
  )
}

exports.clearnetCalendarView = async (calendar, dates, notesByDate = {}) => {
  const { escapeHtml: esc, renderRichText, renderKindTag, renderTagChips, renderClearnetPage } = require("./clearnet_view")
  const name = calendar.title || i18n.calendarTitle
  const fmt = (v) => esc(moment(v).format("YYYY/MM/DD HH:mm"))
  const entries = []
  const byKey = new Map()
  for (const d of Array.isArray(dates) ? dates : []) {
    if (!byKey.has(d.key)) {
      const entry = { key: d.key, label: d.label || "", when: [] }
      byKey.set(d.key, entry)
      entries.push(entry)
    }
    byKey.get(d.key).when.push(d.date)
  }
  const entriesHtml = entries.map(e => {
    const notes = (notesByDate[e.key] || []).filter(n => n && String(n.text || "").trim())
    return `<div class="cn-cal-entry">
      ${e.label ? `<div class="cn-cal-entry-label">${esc(e.label)}</div>` : ""}
      <div class="cn-cal-dates">${e.when.map(w => `<span class="cn-detail">📅 ${fmt(w)}</span>`).join("")}</div>
      ${notes.map(n => `<p class="cn-cal-note">${renderRichText(n.text)}</p>`).join("")}
    </div>`
  }).join("")
  const extraCss = `
.cn-cal-title{color:var(--fg);margin:0 0 16px 0;font-size:32px;font-weight:700;word-break:break-word}
.cn-cal-meta{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px}
.cn-cal-entry{border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin:12px 0;background:var(--bg-elev)}
.cn-cal-entry-label{color:var(--fg);font-weight:600;font-size:16px;margin-bottom:8px;word-break:break-word}
.cn-cal-dates{display:flex;flex-wrap:wrap;gap:6px}
.cn-cal-note{color:var(--fg-soft);line-height:1.5;margin:10px 0 0 0;word-break:break-word}
.cn-cal-empty{color:var(--fg-dim)}
`
  const body = `
  <h1 class="cn-cal-title">${esc(name)}</h1>
  <div class="cn-cal-meta">
    ${renderKindTag("calendar")}
    ${calendar.deadline ? `<span class="cn-detail">⏳ ${esc(i18n.calendarDeadlineLabel || "Deadline")}: ${fmt(calendar.deadline)}</span>` : ""}
  </div>
  ${renderTagChips(calendar.tags)}
  <hr class="cn-sep"/>
  ${entriesHtml || `<p class="cn-cal-empty">${esc(i18n.calendarNoDates || "No dates added yet.")}</p>`}
`
  return renderClearnetPage({
    title: `${name} | Oasis`,
    ogTitle: name,
    ogDescription: "",
    extraCss,
    body,
    hubFeedId: calendar.author || null
  })
}

exports.renderIntervalBlock = renderIntervalBlock
