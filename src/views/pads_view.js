const { div, h2, h3, h4, p, section, button, form, a, span, br, textarea, input, label, select, option, table, tr, td } = require("../server/node_modules/hyperaxe")
const { template, i18n } = require("./main_views")
const moment = require("../server/node_modules/moment")
const { config } = require("../server/SSB_server.js")

const userId = config.keys.id

const PAD_COLOR_CLASSES = ["pad-author-color-0","pad-author-color-1","pad-author-color-2","pad-author-color-3","pad-author-color-4","pad-author-color-5","pad-author-color-6","pad-author-color-7","pad-author-color-8","pad-author-color-9"]
const memberColorClass = (members, feedId) => {
  const idx = members.indexOf(feedId)
  return idx >= 0 ? PAD_COLOR_CLASSES[idx % PAD_COLOR_CLASSES.length] : "pad-author-color-none"
}

const sliceChunksByOffset = (chunks, from, to) => {
  const out = []
  let pos = 0
  for (const c of chunks) {
    const cStart = pos
    const cEnd = pos + c.text.length
    if (cEnd <= from) { pos = cEnd; continue }
    if (cStart >= to) break
    const sliceStart = Math.max(0, from - cStart)
    const sliceEnd = Math.min(c.text.length, to - cStart)
    if (sliceEnd > sliceStart) out.push({ text: c.text.slice(sliceStart, sliceEnd), author: c.author })
    pos = cEnd
  }
  return out
}

const mergeAdjacent = (chunks) => {
  const out = []
  for (const c of chunks) {
    if (!c.text) continue
    if (out.length > 0 && out[out.length - 1].author === c.author) {
      out[out.length - 1].text += c.text
    } else {
      out.push({ ...c })
    }
  }
  return out
}

const computeAttributedChunks = (entries) => {
  if (!entries || entries.length === 0) return []
  let chunks = [{ text: entries[0].text || "", author: entries[0].author }]
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1].text || ""
    const curr = entries[i].text || ""
    const author = entries[i].author
    let start = 0
    const maxStart = Math.min(prev.length, curr.length)
    while (start < maxStart && prev.charCodeAt(start) === curr.charCodeAt(start)) start++
    let endPrev = prev.length
    let endCurr = curr.length
    while (endPrev > start && endCurr > start && prev.charCodeAt(endPrev - 1) === curr.charCodeAt(endCurr - 1)) {
      endPrev--
      endCurr--
    }
    const inserted = curr.slice(start, endCurr)
    const headChunks = sliceChunksByOffset(chunks, 0, start)
    const tailChunks = sliceChunksByOffset(chunks, endPrev, prev.length)
    const middle = inserted ? [{ text: inserted, author }] : []
    chunks = mergeAdjacent([...headChunks, ...middle, ...tailChunks])
  }
  return chunks
}

const renderStatus = (status, isClosed) => {
  if (isClosed) return span({ class: "pad-status-closed" }, i18n.padStatusClosed || "CLOSED")
  if (status === "INVITE-ONLY") return span({ class: "pad-status-invite" }, i18n.padStatusInviteOnly || "INVITE-ONLY")
  return span({ class: "pad-status-open" }, i18n.padStatusOpen || "OPEN")
}

const renderModeButtons = (currentFilter) =>
  div({ class: "tribe-mode-buttons" },
    ["all", "mine", "recent", "open", "closed"].map(f =>
      form({ method: "GET", action: "/pads" },
        input({ type: "hidden", name: "filter", value: f }),
        button({ type: "submit", class: currentFilter === f ? "filter-btn active" : "filter-btn" },
          i18n[`padFilter${f.charAt(0).toUpperCase() + f.slice(1)}`] || f.toUpperCase())
      )
    ),
    form({ method: "GET", action: "/pads" },
      input({ type: "hidden", name: "filter", value: "create" }),
      button({ type: "submit", class: "create-button" }, i18n.padCreate || "Create Pad")
    )
  )


const renderPadCard = (pad, filter) => {
  const returnTo = `/pads?filter=${encodeURIComponent(filter || "all")}`
  return div({ class: "tribe-card" },
    div({ class: "tribe-card-body" },
      h2({ class: "tribe-card-title" },
        span(null, "\uD83D\uDD12 "),
        a({ href: `/pads/${encodeURIComponent(pad.rootId)}` }, pad.title || "\u2014")
      ),
      table({ class: "tribe-info-table" },
        tr(td(i18n.padStatusLabel || "Status"), td(renderStatus(pad.status, pad.isClosed))),
        tr(td(i18n.padDeadlineLabel || "Deadline"), td(pad.deadline ? moment(pad.deadline).format("YYYY-MM-DD HH:mm") : "\u2014"))
      ),
      div({ class: "tribe-card-members" },
        span({ class: "tribe-members-count" }, `${i18n.padMembersLabel || "Members"}: ${pad.members.length}`)
      ),
      div({ class: "visit-btn-centered" },
        a({ href: `/pads/${encodeURIComponent(pad.rootId)}`, class: "filter-btn" }, i18n.padVisitPad || "Visit Pad")
      )
    )
  )
}

const renderCreateForm = (padToEdit, params) => {
  const tribeId = (params && params.tribeId) || ""
  return div({ class: "div-center audio-form" },
    h2(padToEdit ? (i18n.padUpdateSectionTitle || "Update Pad") : (i18n.padCreateSectionTitle || "Create New Pad")),
    form({
      method: "POST",
      action: padToEdit ? `/pads/update/${encodeURIComponent(padToEdit.rootId)}` : "/pads/create"
    },
      tribeId ? input({ type: "hidden", name: "tribeId", value: tribeId }) : null,
      span(i18n.padTitleLabel || "Title"), require("../server/node_modules/hyperaxe").br(),
      input({ type: "text", name: "title", value: padToEdit ? padToEdit.title : "", placeholder: i18n.padTitlePlaceholder || "Enter pad title...", required: true }),
      require("../server/node_modules/hyperaxe").br(), require("../server/node_modules/hyperaxe").br(),
      span(i18n.padStatusLabel || "Status"), require("../server/node_modules/hyperaxe").br(),
      select({ name: "status" },
        ["OPEN", "INVITE-ONLY"].map(s =>
          option({ value: s, ...(padToEdit && padToEdit.status === s ? { selected: true } : {}) }, s)
        )
      ),
      require("../server/node_modules/hyperaxe").br(), require("../server/node_modules/hyperaxe").br(),
      span(i18n.padDeadlineLabel || "Deadline"), require("../server/node_modules/hyperaxe").br(),
      input({
        type: "datetime-local",
        name: "deadline",
        value: padToEdit && padToEdit.deadline ? moment(padToEdit.deadline).format("YYYY-MM-DDTHH:mm") : "",
        min: moment().format("YYYY-MM-DDTHH:mm")
      }),
      require("../server/node_modules/hyperaxe").br(), require("../server/node_modules/hyperaxe").br(),
      span(i18n.padTagsLabel || "Tags"), require("../server/node_modules/hyperaxe").br(),
      input({ type: "text", name: "tags", value: padToEdit ? padToEdit.tags.join(", ") : "", placeholder: i18n.padTagsPlaceholder || "tag1, tag2, ..." }),
      require("../server/node_modules/hyperaxe").br(), require("../server/node_modules/hyperaxe").br(),
      button({ type: "submit", class: "create-button" }, padToEdit ? (i18n.padUpdate || "Update Pad") : (i18n.padCreate || "Create Pad"))
    )
  )
}

exports.padsView = async (pads, filter, padToEdit, params) => {
  const q = String((params && params.q) || "").trim()
  const isForm = filter === "create" || filter === "edit"
  const headerMap = {
    all: i18n.padAllSectionTitle || "Pads",
    mine: i18n.padMineSectionTitle || "Your Pads",
    recent: i18n.padRecentSectionTitle || "Recent Pads",
    open: i18n.padOpenSectionTitle || "Open Pads",
    closed: i18n.padClosedSectionTitle || "Closed Pads"
  }
  const headerText = headerMap[filter] || headerMap.all

  const filteredPads = q
    ? pads.filter(pd => String(pd.title || "").toLowerCase().includes(q.toLowerCase()))
    : pads

  const body = div({ class: "main-column" },
    div({ class: "tags-header" },
      h2(headerText),
      p(i18n.padsDescription || "Manage collaborative encrypted text editors in your network.")
    ),
    renderModeButtons(filter),
    !isForm
      ? div({ class: "filters" },
          form({ method: "GET", action: "/pads" },
            input({ type: "hidden", name: "filter", value: filter }),
            input({ type: "text", name: "q", placeholder: i18n.padSearchPlaceholder || "Search pads...", value: q }),
            br(),
            button({ type: "submit" }, i18n.search),
            br()
          )
        )
      : null,
    isForm
      ? renderCreateForm(padToEdit, params)
      : div(
          filteredPads.length === 0
            ? p({ class: "no-content" }, i18n.padsNoItems || "No pads found.")
            : div({ class: "tribe-grid" }, ...filteredPads.map(pd => renderPadCard(pd, filter)))
        )
  )

  return template(i18n.padsTitle || "Pads", body)
}

exports.singlePadView = async (pad, entries, params) => {
  const isAuthor = String(pad.author) === String(userId)
  const isMember = pad.members.includes(userId)
  const padClosed = pad.isClosed
  const returnTo = `/pads/${encodeURIComponent(pad.rootId)}`

  const shareUrl = `/pads/${encodeURIComponent(pad.rootId)}`

  const tags = Array.isArray(pad.tags) && pad.tags.length > 0
    ? div({ class: "tribe-side-tags" }, ...pad.tags.map(t => a({ href: `/search?query=%23${encodeURIComponent(t)}` }, `#${t}`)))
    : null

  const padSide = div({ class: "tribe-side" },
    h2(null,
      span(null, "\uD83D\uDD12 "),
      pad.title || "\u2014"
    ),
    div({ class: "shop-share" },
      span({ class: "tribe-info-label" }, i18n.padShareUrl || "Share URL"),
      input({ type: "text", readonly: true, value: shareUrl, class: "shop-share-input" })
    ),
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.padMembersLabel || "Members"}: ${pad.members.length}`)
    ),
    table({ class: "tribe-info-table" },
      tr(td({ class: "tribe-info-label" }, i18n.padCreated || "Created"), td({ class: "tribe-info-value", colspan: "3" }, moment(pad.createdAt).format("YYYY-MM-DD"))),
      tr(td({ class: "tribe-info-value", colspan: "4" }, a({ href: `/author/${encodeURIComponent(pad.author)}`, class: "user-link" }, pad.author))),
      tr(td({ class: "tribe-info-label" }, i18n.padStatusLabel || "Status"), td({ class: "tribe-info-value", colspan: "3" }, renderStatus(pad.status, padClosed))),
      tr(td({ class: "tribe-info-label" }, i18n.padDeadlineLabel || "Deadline"), td({ class: "tribe-info-value", colspan: "3" }, pad.deadline ? moment(pad.deadline).format("YYYY-MM-DD HH:mm") : "\u2014"))
    ),
    div({ class: "tribe-side-actions" },
      isAuthor
        ? form({ method: "POST", action: `/pads/generate-invite/${encodeURIComponent(pad.rootId)}` },
            button({ type: "submit", class: "tribe-action-btn" }, i18n.padGenerateCode || "Generate Code")
          )
        : null,
      form(
        { method: "POST", action: pad.isFavorite ? `/pads/favorites/remove/${encodeURIComponent(pad.key)}` : `/pads/favorites/add/${encodeURIComponent(pad.key)}` },
        returnTo ? input({ type: "hidden", name: "returnTo", value: returnTo }) : null,
        button({ type: "submit", class: "tribe-action-btn" }, pad.isFavorite ? (i18n.padRemoveFavorite || "Remove Favorite") : (i18n.padAddFavorite || "Add Favorite"))
      ),
      !isAuthor
        ? a({ href: `/pm?to=${encodeURIComponent(pad.author)}`, class: "tribe-action-btn" }, "PM")
        : null,
      isAuthor
        ? form({ method: "GET", action: "/pads" },
            input({ type: "hidden", name: "filter", value: "edit" }),
            input({ type: "hidden", name: "id", value: pad.rootId }),
            button({ type: "submit", class: "tribe-action-btn" }, i18n.padUpdate || "Update")
          )
        : null,
      isAuthor && pad.status !== "CLOSED" && !padClosed
        ? form({ method: "POST", action: `/pads/close/${encodeURIComponent(pad.rootId)}` },
            button({ type: "submit", class: "tribe-action-btn" }, i18n.padClose || "Close Pad")
          )
        : null,
      isAuthor
        ? form({ method: "POST", action: `/pads/delete/${encodeURIComponent(pad.rootId)}` },
            button({ type: "submit", class: "tribe-action-btn" }, i18n.padDelete || "Delete")
          )
        : null
    ),
    !isAuthor && pad.status === "INVITE-ONLY" && !isMember
      ? div({ class: "pad-invite-section" },
          form({ method: "POST", action: "/pads/join-code" },
            label(i18n.padInviteCodeLabel || "Invite Code"),
            input({ type: "text", name: "code", placeholder: i18n.padInviteCodePlaceholder || "Enter invite code..." }),
            button({ type: "submit", class: "filter-btn" }, i18n.padValidateInvite || "Validate")
          )
        )
      : null,
    (!isAuthor && (pad.status === "OPEN" || isMember) && !padClosed)
      ? form({ method: "POST", action: `/pads/join/${encodeURIComponent(pad.rootId)}` },
          button({ type: "submit", class: "create-button" }, i18n.padStartEditing || "START EDITING!")
        )
      : null,
    tags,
    params.inviteCode
      ? div({ class: "pad-invite-section" },
          p(i18n.padInviteGenerated || "Invite Code Generated"),
          input({ type: "text", readonly: true, value: params.inviteCode })
        )
      : null
  )

  let canonicalEntries = entries
  if (params.selectedVersion) {
    const idx = entries.findIndex(e => e.key === params.selectedVersion.key)
    if (idx >= 0) canonicalEntries = entries.slice(0, idx + 1)
  }
  const chunks = computeAttributedChunks(canonicalEntries)
  const lastEntry = canonicalEntries.length > 0 ? canonicalEntries[canonicalEntries.length - 1] : null
  const currentText = lastEntry ? lastEntry.text : ""

  const coloredView = chunks.length > 0
    ? div({ class: "pad-readonly-colored" },
        ...chunks.map(c =>
          span({ class: "pad-author-span " + memberColorClass(pad.members, c.author) }, c.text)
        )
      )
    : p(i18n.padNoEntries || "No entries yet.")

  const editorArea = isMember && !padClosed && !params.selectedVersion
    ? div({ class: "pad-editor-area" },
        coloredView,
        form({ method: "POST", action: `/pads/entry/${encodeURIComponent(pad.rootId)}` },
          textarea({ name: "text", rows: "12", class: "pad-editor-white", placeholder: i18n.padEditorPlaceholder || "Start writing..." }, currentText),
          button({ type: "submit", class: "create-button" }, i18n.padSubmitEntry || "Submit")
        )
      )
    : div({ class: "pad-editor-area" },
        params.selectedVersion
          ? div({ class: "pad-viewer-back" },
              a({ href: `/pads/${encodeURIComponent(pad.rootId)}`, class: "filter-btn" },
                "\u2190 " + (i18n.padBackToEditor || "Back to editor"))
            )
          : null,
        coloredView
      )

  const versionList = entries.length > 0
    ? div({ class: "pad-version-list" },
        h4(i18n.padVersionHistory || "Version History"),
        ...entries.slice().reverse().map((e, idx) =>
          div({ class: "pad-version-item" },
            span({ class: "pad-version-date" }, moment(e.createdAt).format("YYYY-MM-DD HH:mm")),
            span({ class: "pad-version-author" },
              span({ class: "pad-author-swatch " + memberColorClass(pad.members, e.author) }),
              a({ href: `/author/${encodeURIComponent(e.author)}`, class: "user-link" }, "@" + e.author.slice(1, 9) + "\u2026")
            ),
            a({ href: `/pads/${encodeURIComponent(pad.rootId)}?version=${encodeURIComponent(e.key || idx)}`, class: "pad-version-link" }, i18n.padVersionView || "View")
          )
        )
      )
    : null

  const padMain = div({ class: "tribe-main" },
    div({ class: "pad-main-layout" },
      div({ class: "pad-main-left" },
        div({ class: "pad-editor-container" }, editorArea)
      ),
      versionList ? div({ class: "pad-main-right" }, versionList) : null
    )
  )

  return template(
    pad.title || i18n.padsTitle || "Pad",
    section(
      div({ class: "tags-header" },
        h2(i18n.padsTitle || "Pads"),
        p(i18n.padsDescription || "Manage collaborative encrypted text editors in your network.")
      ),
      renderModeButtons("all")
    ),
    section(div({ class: "tribe-details" }, padSide, padMain))
  )
}
