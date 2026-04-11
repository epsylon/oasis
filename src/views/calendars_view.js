const { div, h2, h3, h4, p, section, button, form, a, span, br, textarea, input, label, select, option, table, tr, td, ul, li } = require("../server/node_modules/hyperaxe")
const { template, i18n } = require("./main_views")
const moment = require("../server/node_modules/moment")
const { config } = require("../server/SSB_server.js")

const userId = config.keys.id

const renderNoteText = (text) => {
  if (!text) return []
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const result = []
  let last = 0
  text.replace(urlRegex, (match, _g, offset) => {
    if (offset > last) result.push(text.slice(last, offset))
    result.push(a({ href: match, target: "_blank" }, match))
    last = offset + match.length
  })
  if (last < text.length) result.push(text.slice(last))
  return result
}

const renderCalendarFavoriteToggle = (cal, returnTo) =>
  form(
    { method: "POST", action: cal.isFavorite ? `/calendars/favorites/remove/${encodeURIComponent(cal.rootId)}` : `/calendars/favorites/add/${encodeURIComponent(cal.rootId)}` },
    returnTo ? input({ type: "hidden", name: "returnTo", value: returnTo }) : null,
    button({ type: "submit", class: "tribe-action-btn" }, cal.isFavorite ? (i18n.calendarRemoveFavorite || "Remove Favorite") : (i18n.calendarAddFavorite || "Add Favorite"))
  )

const renderModeButtons = (currentFilter) =>
  div({ class: "tribe-mode-buttons" },
    ["all", "mine", "recent", "favorites", "open", "closed"].map(f =>
      form({ method: "GET", action: "/calendars" },
        input({ type: "hidden", name: "filter", value: f }),
        button({ type: "submit", class: currentFilter === f ? "filter-btn active" : "filter-btn" },
          i18n[`calendarFilter${f.charAt(0).toUpperCase() + f.slice(1)}`] || f.toUpperCase())
      )
    ),
    form({ method: "GET", action: "/calendars" },
      input({ type: "hidden", name: "filter", value: "create" }),
      button({ type: "submit", class: "create-button" }, i18n.calendarCreate || "Create Calendar")
    )
  )

const renderStatus = (cal) => {
  if (cal.isClosed) return span({ class: "pad-status-closed" }, i18n.calendarStatusClosed || "CLOSED")
  return span({ class: "pad-status-open" }, i18n.calendarStatusOpen || "OPEN")
}

const renderCalendarCard = (cal) => {
  const href = `/calendars/${encodeURIComponent(cal.rootId)}`
  return div({ class: "tribe-card" },
    div({ class: "tribe-card-body" },
      div({ class: "tribe-card-title" },
        a({ href }, cal.title || "\u2014")
      ),
      table({ class: "tribe-info-table" },
        tr(td({ class: "tribe-info-label" }, i18n.calendarStatusLabel || "Status"), td({ class: "tribe-info-value" }, renderStatus(cal))),
        cal.deadline ? tr(td({ class: "tribe-info-label" }, i18n.calendarDeadlineLabel || "Deadline"), td({ class: "tribe-info-value" }, moment(cal.deadline).format("YYYY-MM-DD HH:mm"))) : null,
      ),
      div({ class: "tribe-card-members" },
        span({ class: "tribe-members-count calendar-participants-count" }, `${i18n.calendarParticipantsLabel || "Participants"}: ${cal.participants.length}`)
      ),
      div({ class: "visit-btn-centered" },
        a({ href, class: "filter-btn" }, i18n.calendarVisitCalendar || "Visit Calendar")
      )
    )
  )
}

const renderIntervalBlock = () =>
  div({ class: "calendar-interval-block" },
    span({ class: "calendar-interval-label" }, i18n.calendarIntervalLabel || "Interval"),
    div({ class: "calendar-interval-row" },
      input({ type: "hidden", name: "intervalWeekly", value: "0" }),
      label({ class: "calendar-interval-option" },
        input({ type: "checkbox", name: "intervalWeekly", value: "1" }),
        " ", i18n.calendarIntervalWeekly || "Weekly"
      ),
      input({ type: "hidden", name: "intervalMonthly", value: "0" }),
      label({ class: "calendar-interval-option" },
        input({ type: "checkbox", name: "intervalMonthly", value: "1" }),
        " ", i18n.calendarIntervalMonthly || "Monthly"
      ),
      input({ type: "hidden", name: "intervalYearly", value: "0" }),
      label({ class: "calendar-interval-option" },
        input({ type: "checkbox", name: "intervalYearly", value: "1" }),
        " ", i18n.calendarIntervalYearly || "Yearly"
      )
    ),
    span({ class: "calendar-interval-label calendar-interval-until" }, i18n.calendarIntervalUntil || "Until"),
    input({ type: "datetime-local", name: "intervalDeadline" }),
    br()
  )

const renderCreateForm = (calendarToEdit, params) => {
  const isEdit = !!calendarToEdit
  const tribeId = (params && params.tribeId) || ""
  const now = moment().add(1, "minute").format("YYYY-MM-DDTHH:mm")
  const action = isEdit ? `/calendars/update/${encodeURIComponent(calendarToEdit.rootId)}` : "/calendars/create"
  const sectionTitle = isEdit ? (i18n.calendarUpdateSectionTitle || "Update Calendar") : (i18n.calendarCreateSectionTitle || "Create New Calendar")
  return div({ class: "div-center audio-form" },
    h2(sectionTitle),
    form({ method: "POST", action },
      tribeId ? input({ type: "hidden", name: "tribeId", value: tribeId }) : null,
      span(i18n.calendarTitleLabel || "Title"), br(),
      input({ type: "text", name: "title", required: true, placeholder: i18n.calendarTitlePlaceholder || "Calendar title...", value: calendarToEdit ? calendarToEdit.title : "" }),
      br(), br(),
      span(i18n.calendarStatusLabel || "Status"), br(),
      select({ name: "status", required: true },
        option({ value: "OPEN", ...((!calendarToEdit || calendarToEdit.status === "OPEN") ? { selected: true } : {}) }, i18n.calendarStatusOpen || "OPEN"),
        option({ value: "CLOSED", ...((calendarToEdit && calendarToEdit.status === "CLOSED") ? { selected: true } : {}) }, i18n.calendarStatusClosed || "CLOSED")
      ),
      br(), br(),
      span(i18n.calendarDeadlineLabel || "Deadline"), br(),
      input({ type: "datetime-local", name: "deadline", required: true, min: now, value: calendarToEdit && calendarToEdit.deadline ? moment(calendarToEdit.deadline).format("YYYY-MM-DDTHH:mm") : "" }),
      br(), br(),
      span(i18n.calendarTagsLabel || "Tags"), br(),
      input({ type: "text", name: "tags", placeholder: i18n.calendarTagsPlaceholder || "tag1, tag2...", value: calendarToEdit && Array.isArray(calendarToEdit.tags) ? calendarToEdit.tags.join(", ") : "" }),
      br(), br(),
      !isEdit
        ? [
            span(i18n.calendarFirstDateLabel || "Date"), br(),
            input({ type: "datetime-local", name: "firstDate", required: true, min: now }),
            br(), br(),
            span(i18n.calendarFormDescription || "Description"), br(),
            input({ type: "text", name: "firstDateLabel", placeholder: i18n.calendarDatePlaceholder || "Describe this date..." }),
            br(), br(),
            renderIntervalBlock(),
            span(i18n.calendarFirstNoteLabel || "Notes"), br(),
            textarea({ name: "firstNote", rows: "3", placeholder: i18n.calendarNotePlaceholder || "Add a note..." }),
            br(), br()
          ]
        : null,
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

exports.calendarsView = async (calendars, filter, calendarToEdit, params) => {
  const q = (params && params.q) || ""
  const showForm = filter === "create" || filter === "edit" || !!calendarToEdit
  const headerMap = {
    all: i18n.calendarAllSectionTitle || "Calendars",
    mine: i18n.calendarMineSectionTitle || "Your Calendars",
    recent: i18n.calendarRecentSectionTitle || "Recent Calendars",
    favorites: i18n.calendarFavoritesSectionTitle || "Favorites",
    open: i18n.calendarOpenSectionTitle || "Open Calendars",
    closed: i18n.calendarClosedSectionTitle || "Closed Calendars"
  }
  const headerText = headerMap[filter] || headerMap.all

  return template(
    i18n.calendarsTitle || "Calendars",
    section(
      div({ class: "tags-header" },
        h2(headerText),
        p(i18n.calendarsDescription || "Discover and manage calendars.")
      ),
      renderModeButtons(filter),
      q
        ? div({ class: "filters" },
            form({ method: "GET", action: "/calendars" },
              input({ type: "text", name: "q", value: q, placeholder: i18n.calendarSearchPlaceholder || "Search calendars..." }),
              button({ type: "submit", class: "filter-btn" }, i18n.searchButton || "Search")
            )
          )
        : null
    ),
    section(
      showForm
        ? renderCreateForm(calendarToEdit, params)
        : (calendars.length > 0
            ? div({ class: "tribe-grid" }, ...calendars.map(c => renderCalendarCard(c)))
            : p({ class: "no-content" }, i18n.calendarsNoItems || "No calendars found."))
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
    ? div({ class: "tribe-side-tags" }, ...calendar.tags.map(t => a({ href: `/search?query=%23${encodeURIComponent(t)}` }, `#${t} `)))
    : null

  const calSide = div({ class: "tribe-side" },
    h2(null, calendar.title || "\u2014"),
    div({ class: "shop-share" },
      span({ class: "tribe-info-label" }, i18n.calendarsShareUrl || "Share URL"),
      input({ type: "text", readonly: true, value: shareUrl, class: "shop-share-input" })
    ),
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count calendar-participants-count" }, `${i18n.calendarParticipantsLabel || "Participants"}: ${calendar.participants.length}`)
    ),
    table({ class: "tribe-info-table" },
      tr(td({ class: "tribe-info-label" }, i18n.calendarCreated || "Created"), td({ class: "tribe-info-value", colspan: "3" }, moment(calendar.createdAt).format("YYYY-MM-DD"))),
      tr(td({ class: "tribe-info-value", colspan: "4" }, a({ href: `/author/${encodeURIComponent(calendar.author)}`, class: "user-link" }, calendar.author))),
      tr(td({ class: "tribe-info-label" }, i18n.calendarStatusLabel || "Status"), td({ class: "tribe-info-value", colspan: "3" }, renderStatus(calendar))),
      calendar.deadline ? tr(td({ class: "tribe-info-label" }, i18n.calendarDeadlineLabel || "Deadline"), td({ class: "tribe-info-value", colspan: "3" }, moment(calendar.deadline).format("YYYY-MM-DD HH:mm"))) : null
    ),
    div({ class: "tribe-side-actions" },
      renderCalendarFavoriteToggle(calendar, shareUrl),
      isAuthor
        ? form({ method: "GET", action: "/calendars" },
            input({ type: "hidden", name: "filter", value: "edit" }),
            input({ type: "hidden", name: "id", value: calendar.rootId }),
            button({ type: "submit", class: "tribe-action-btn" }, i18n.calendarUpdate || "Update")
          )
        : null,
      isAuthor
        ? form({ method: "POST", action: `/calendars/delete/${encodeURIComponent(calendar.rootId)}` },
            button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.calendarDelete || "Delete")
          )
        : null,
      !isAuthor
        ? a({ href: `/pm?to=${encodeURIComponent(calendar.author)}`, class: "tribe-action-btn" }, "PM")
        : null,
      !isAuthor && !isParticipant
        ? form({ method: "POST", action: `/calendars/join/${encodeURIComponent(calendar.rootId)}` },
            button({ type: "submit", class: "create-button" }, i18n.calendarJoin || "Join Calendar")
          )
        : null,
      !isAuthor && isParticipant
        ? form({ method: "POST", action: `/calendars/leave/${encodeURIComponent(calendar.rootId)}` },
            button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.calendarLeave || "Leave Calendar")
          )
        : null
    ),
    tags
  )

  const minDate = now.add(1, "minute").format("YYYY-MM-DDTHH:mm")
  const canAddDate = !calClosed && (calendar.status === "OPEN" || isAuthor)

  const unifiedForm = canAddDate
    ? div({ class: "div-center audio-form" },
        h4(i18n.calendarAddEntry || "Add Entry"),
        form({ method: "POST", action: `/calendars/add-date/${encodeURIComponent(calendar.rootId)}` },
          span(i18n.calendarDateLabel || "Date"), br(),
          input({ type: "datetime-local", name: "date", required: true, min: minDate }),
          br(), br(),
          span(i18n.calendarFormDescription || "Description"), br(),
          input({ type: "text", name: "label", placeholder: i18n.calendarDatePlaceholder || "Describe this date..." }),
          br(), br(),
          renderIntervalBlock(),
          br(),
          isParticipant
            ? [
                span(i18n.calendarNoteLabel || "Note (optional)"), br(),
                textarea({ name: "text", rows: "3", placeholder: i18n.calendarNotePlaceholder || "Add a note..." }),
                br(), br()
              ]
            : null,
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
                  `${moment(d.date).format("YYYY-MM-DD HH:mm")}${d.label ? " \u2014 " + d.label : ""}`
                ),
                notes.length === 0
                  ? p({ class: "no-content" }, i18n.calendarNoNotes || "No notes.")
                  : div(null, ...notes.map(n => {
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
                            a({ href: `/author/${encodeURIComponent(n.author)}`, class: "user-link" }, shortId)
                          ),
                          span({ class: "chat-message-date" }, ` [ ${dateStr} ]`)
                        ),
                        span({ class: "chat-message-text" }, ...renderNoteText(n.text || ""))
                      )
                    }))
              )
            }))
      )
    : null

  const calMain = div({ class: "tribe-main" },
    calNav,
    grid,
    dayNotesSection,
    unifiedForm
  )

  return template(
    calendar.title || i18n.calendarsTitle || "Calendar",
    section(
      div({ class: "tags-header" },
        h2(i18n.calendarsTitle || "Calendars"),
        p(i18n.calendarsDescription || "Discover and manage calendars.")
      ),
      renderModeButtons("all")
    ),
    section(div({ class: "tribe-details" }, calSide, calMain))
  )
}
