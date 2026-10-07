const { div, h2, h3, h4, p, section, button, form, a, span, br, textarea, input, label, select, option, table, tr, td, details, summary } = require("../server/node_modules/hyperaxe")
const { template, i18n, userLink, renderStateChip, renderLifespanChip, renderSpreadButton , renderContentActions, renderInviteQrCard, renderSubscriptionBox, renderModuleStatsBy, moduleIsEmpty, contentDeleteAction } = require("./main_views")
const { renderEncryptedChip } = require("./clearnet_view")
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

const renderPadStatusChip = (status, isClosed) => {
  const s = isClosed ? "CLOSED" : String(status || "OPEN").toUpperCase()
  const variant = s === "CLOSED" ? "closed" : s === "INVITE-ONLY" ? "whole" : "mutuals"
  const icon = s === "CLOSED" ? "✗" : s === "INVITE-ONLY" ? "🔑" : "✓"
  const label = s === "CLOSED" ? (i18n.padStatusClosed || "CLOSED")
    : s === "INVITE-ONLY" ? (i18n.padStatusInviteOnly || "INVITE-ONLY")
    : (i18n.padStatusOpen || "OPEN")
  return renderStateChip(variant, icon, label)
}

const renderModeButtons = (currentFilter, emptyMod = false, modesAvail = null) =>
  div({ class: "tribe-mode-buttons" },
    ...(emptyMod ? [] : [
    ["recent", "mine", "all", "open", "closed"].filter(f => f === "all" || f === currentFilter || (modesAvail && modesAvail[f] !== false)).map(f =>
      form({ method: "GET", action: "/pads" },
        input({ type: "hidden", name: "filter", value: f }),
        button({ type: "submit", class: currentFilter === f ? "filter-btn active" : "filter-btn" },
          i18n[`padFilter${f.charAt(0).toUpperCase() + f.slice(1)}`] || f.toUpperCase())
      )
    ),
    ]),
    form({ method: "GET", action: "/pads" },
      input({ type: "hidden", name: "filter", value: "create" }),
      button({ type: "submit", class: "create-button" }, i18n.padCreate || "Create Pad")
    )
  )


const renderPadCard = (pad, filter, spreadInfo) => {
  const chips = [
    renderPadStatusChip(pad.status, pad.isClosed),
    renderEncryptedChip(i18n),
    renderLifespanChip(pad.lifetime, i18n),
    pad.subscriptionIn === true
      ? renderStateChip("mutuals", "✉", i18n.subscriptionOn)
      : (pad.subscriptionIn === false ? renderStateChip("closed", "✉", i18n.subscriptionOff) : null)
  ].filter(Boolean)
  return div({ class: "tribe-card" },
    div({ class: "card-header activity-card-header" },
      span(),
      renderContentActions(pad.rootId || pad.key, `/pads/${encodeURIComponent(pad.rootId)}`, { spread: spreadInfo || null, author: pad.author, favKind: 'pads', isFavorite: pad.isFavorite, reportTitle: pad.title, deleteAction: String(pad.author) === String(userId) ? contentDeleteAction('pad', pad.rootId || pad.key) : undefined })
    ),
    div({ class: "tribe-card-body" },
      div({ class: "shop-title-row" },
        h2({ class: "tribe-card-title" },
          a({ href: `/pads/${encodeURIComponent(pad.rootId)}` }, pad.title || "\u2014")
        )
      ),
      chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
      pad.deadline
        ? p({ class: "job-meta-line" }, `${i18n.padDeadlineLabel || "Deadline"}: ${moment(pad.deadline).format("YYYY/MM/DD HH:mm")}`)
        : null,
      div({ class: "tribe-card-members" },
        span({ class: "tribe-members-count" }, `${i18n.padMembersLabel || "Members"}: ${pad.members.length}`)
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
      input({ type: "text", name: "title", maxlength: "100", value: padToEdit ? padToEdit.title : "", placeholder: i18n.padTitlePlaceholder || "Enter pad title...", required: true }),
      require("../server/node_modules/hyperaxe").br(), require("../server/node_modules/hyperaxe").br(),
      span(i18n.padTypeLabel), require("../server/node_modules/hyperaxe").br(),
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
      input({ type: "text", name: "tags", value: padToEdit ? padToEdit.tags.join(", ") : "", placeholder: i18n.padTagsPlaceholder || "Enter tags separated by commas" }),
      require("../server/node_modules/hyperaxe").br(), require("../server/node_modules/hyperaxe").br(),
      button({ type: "submit", class: "create-button" }, padToEdit ? (i18n.padUpdate || "Update Pad") : (i18n.padCreate || "Create Pad"))
    )
  )
}

exports.renderPadInvitePage = (code) => {
  const pageContent = div({ class: "invite-page" },
    h2(i18n.tribeInviteCodeText, code),
    form({ method: "GET", action: "/pads" },
      input({ type: "hidden", name: "filter", value: "all" }),
      button({ type: "submit", class: "filter-btn" }, i18n.walletBack)
    )
  )
  return template(i18n.padInviteMode || "Invite", section(pageContent))
}

exports.padsView = async (pads, filter, padToEdit, params) => {
  const q = String((params && params.q) || "").trim()
  const isForm = filter === "create" || filter === "edit"
  const headerText = i18n.padsTitle
  const emptyMod = moduleIsEmpty(Array.isArray(pads) ? pads : [], filter || "all", "all", q)

  const filteredPads = q
    ? pads.filter(pd => String(pd.title || "").toLowerCase().includes(q.toLowerCase()))
    : pads

  const body = section(
    div({ class: "tags-header module-header-line" },
      h2(headerText),
      p(i18n.padsDescription || "Manage collaborative encrypted text editors in your network.")
    ),
    renderModeButtons(filter, emptyMod, (params && params.modesAvail) || null),
    !isForm && !emptyMod
      ? div({ class: "filters activity-filter-chips activity-toolbar-row" },
        renderModuleStatsBy(filteredPads, pd => pd.isClosed ? 'CLOSED' : String(pd.status || 'OPEN').toUpperCase(), [{ value: 'OPEN', label: i18n.padStatusOpen }, { value: 'INVITE-ONLY', label: i18n.padStatusInviteOnly }, { value: 'CLOSED', label: i18n.padStatusClosed }]),
          form({ method: "GET", action: "/pads", class: "filter-box" },
            input({ type: "hidden", name: "filter", value: filter }),
            input({ type: "text", name: "q", placeholder: i18n.padSearchPlaceholder || "Search pads...", value: q, class: "filter-box__input" }),
            div({ class: "filter-box__controls" },
              button({ type: "submit", class: "filter-box__button" }, i18n.searchButton)
            )
          )
        )
      : null,
    isForm
      ? renderCreateForm(padToEdit, params)
      : div(
          filteredPads.length === 0
            ? p({ class: "no-content" }, i18n.padsNoItems || "No pads found.")
            : div({ class: "tribe-grid pads-grid" }, ...filteredPads.map(pd => renderPadCard(pd, filter, params && params.spreadMap && params.spreadMap.get(pd.rootId))))
        )
  )

  return template(i18n.padsTitle || "Pads", body)
}

exports.singlePadView = async (pad, entries, params) => {
  const isAuthor = String(pad.author) === String(userId)
  const isMember = pad.members.includes(userId) || (!!pad.tribeId && !!pad.isTribeMember)
  const padClosed = pad.isClosed
  const returnTo = `/pads/${encodeURIComponent(pad.rootId)}`
  const isRestrictedInviteOnly = !isMember && !isAuthor && pad.status === "INVITE-ONLY"

  const tags = !isRestrictedInviteOnly && Array.isArray(pad.tags) && pad.tags.length > 0
    ? div({ class: "tribe-side-tags" }, ...pad.tags.map(t => a({ href: `/search?query=%23${encodeURIComponent(t)}`, class: "tag-link" }, `#${t}`)))
    : null

  const sharesPad = isAuthor || (pad.members || []).includes(userId)
  const subscriptionIn = isAuthor || (pad.subscription && pad.subscription.subscribed === true)
  const detailChips = [
    renderPadStatusChip(pad.status, padClosed),
    renderEncryptedChip(i18n),
    renderLifespanChip(pad.lifetime, i18n),
    sharesPad
      ? renderStateChip(subscriptionIn ? "mutuals" : "closed", "✉", subscriptionIn ? i18n.subscriptionOn : i18n.subscriptionOff)
      : null
  ].filter(Boolean)
  const inviteActions = [
    isAuthor && pad.status === "INVITE-ONLY"
      ? form({ method: "POST", action: `/pads/generate-invite/${encodeURIComponent(pad.rootId)}` },
          button({ type: "submit", class: "tribe-action-btn" }, i18n.tribeGenerateInvite)
        )
      : null,
    (() => {
      if (!(isAuthor && pad.status === "INVITE-ONLY")) return null
      const invs = Array.isArray(pad.invites) ? pad.invites : []
      const openInvite = invs.find(inv => typeof inv === "object" && inv && inv.public === true && inv.code)
      if (openInvite) return [
        div({ class: "tribe-open-invite" },
          span({ class: "card-label" }, i18n.tribeInviteCodeText),
          span({ class: "tribe-open-invite-code" }, openInvite.code),
          renderInviteQrCard({ qrDataUrl: `/qr-invite-code/pads/${encodeURIComponent(openInvite.code)}` })
        ),
        form({ method: "POST", action: `/pads/open-invite/remove/${encodeURIComponent(pad.rootId)}` },
          button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.tribeRemoveInvitation)
        )
      ]
      return form({ method: "POST", action: `/pads/open-invite/create/${encodeURIComponent(pad.rootId)}` },
        button({ type: "submit", class: "tribe-action-btn" }, i18n.tribeOpenInvitation)
      )
    })()
  ].filter(Boolean)

  const topButtons = isRestrictedInviteOnly ? [] : [
    !isAuthor && !isMember && pad.status === "OPEN" && !padClosed
      ? form({ method: "POST", action: `/pads/join/${encodeURIComponent(pad.rootId)}` },
          button({ type: "submit", class: "update-btn" }, i18n.padStartEditing || "EDIT")
        )
      : null,
    form({ method: "GET", action: `/pads/${encodeURIComponent(pad.rootId)}/pdf` },
      button({ type: "submit", class: "update-btn" }, i18n.generatePdf || "Generate PDF")
    ),
    isAuthor && pad.status !== "CLOSED" && !padClosed
      ? form({ method: "POST", action: `/pads/close/${encodeURIComponent(pad.rootId)}` },
          button({ type: "submit", class: "update-btn" }, i18n.padClose || "Close")
        )
      : null,
    isAuthor
      ? form({ method: "GET", action: "/pads" },
          input({ type: "hidden", name: "filter", value: "edit" }),
          input({ type: "hidden", name: "id", value: pad.rootId }),
          button({ type: "submit", class: "update-btn" }, i18n.padUpdate || "Update")
        )
      : null
  ].filter(Boolean)

  const padSide = div({ class: "tribe-side" },
    div({ class: "tribe-side-actions wiki-actions-top pad-actions-top" },
      span({ class: "wiki-actions-left" },
        div({ class: "card-header activity-card-header" },
          renderContentActions(pad.rootId, returnTo, {
            author: pad.author,
            favKind: 'pads',
            isFavorite: pad.isFavorite,
            spread: (params && params.spreads) || null,
            returnTo,
            reportTitle: pad.title,
            deleteAction: isAuthor ? contentDeleteAction('pad', pad.rootId) : undefined
          })
        )
      ),
      ...topButtons
    ),
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, pad.title || "\u2014")
    ),
    detailChips.length ? div({ class: "card-chips-row" }, ...detailChips) : null,
    div({ class: "pad-meta" },
      span({ class: "card-label" }, `${i18n.padCreated || "Created"}: `),
      span(moment(pad.createdAt).format("YYYY/MM/DD HH:mm")),
      (isRestrictedInviteOnly || !pad.deadline) ? null : span({ class: "card-label" }, `${i18n.padDeadlineLabel || "Deadline"}: `),
      (isRestrictedInviteOnly || !pad.deadline) ? null : span(moment(pad.deadline).format("YYYY/MM/DD HH:mm")),
      isRestrictedInviteOnly ? null : userLink(pad.author)
    ),
    tags,
    (isRestrictedInviteOnly || !inviteActions.length) ? null : div({ class: "tribe-side-actions" }, ...inviteActions),
    (pad.subscription && sharesPad)
      ? renderSubscriptionBox({
          target: pad.rootId || pad.key,
          scope: "pads",
          subscribed: pad.subscription.subscribed === true,
          count: pad.subscription.count,
          isOwner: isAuthor,
          returnTo
        })
      : null,
    !isAuthor && pad.status === "INVITE-ONLY" && !isMember
      ? div({ class: "pad-invite-section" },
          a({ class: "tribe-action-btn", href: "/invites#invites-pads" }, i18n.tribeEnterInvite)
        )
      : null,
    details({ class: "pad-members-details", ...(pad.members.length <= 8 ? { open: true } : {}) },
      summary({ class: "tribe-members-count" }, `${i18n.padMembersLabel || "Members"}: ${pad.members.length}`),
      div({ class: "pad-members-chips" },
        ...pad.members.map(m => span({ class: "pad-member-chip" }, span({ class: "pad-author-swatch " + memberColorClass(pad.members, m) }), userLink(m)))
      )
    )
  )

  let canonicalEntries = entries
  if (params.selectedVersion) {
    const idx = entries.findIndex(e => e.key === params.selectedVersion.key)
    if (idx >= 0) canonicalEntries = entries.slice(0, idx + 1)
  }
  const chunks = computeAttributedChunks(canonicalEntries)
  const lastEntry = canonicalEntries.length > 0 ? canonicalEntries[canonicalEntries.length - 1] : null
  const currentText = lastEntry ? lastEntry.text : ""

  const linesOfChunks = (list) => {
    const rows = [[]]
    for (const c of list) {
      const parts = String(c.text || "").split("\n")
      parts.forEach((part, i) => {
        if (i > 0) rows.push([])
        if (part) rows[rows.length - 1].push({ text: part, author: c.author })
      })
    }
    return rows
  }
  const renderNumbered = (list, minRows = 0) => {
    const rows = linesOfChunks(list)
    while (rows.length < minRows) rows.push([])
    return table({ class: "pad-lines" },
      ...rows.map((segs, i) => tr({ id: `L${i + 1}` },
        td({ class: "pad-line-num" }, a({ href: `#L${i + 1}` }, String(i + 1))),
        td({ class: "pad-line-text" }, segs.length
          ? segs.map(sg => span({ class: "pad-author-span " + memberColorClass(pad.members, sg.author) }, sg.text))
          : (i === 0 && !list.length ? span({ class: "pad-line-placeholder" }, i18n.padNoEntries || "No entries yet.") : " "))
      ))
    )
  }
  const documentView = div({ class: "pad-document" }, renderNumbered(chunks, 24))
  const attributionView = chunks.length > 0
    ? details({ class: "pad-attribution" },
        summary(i18n.padAttributionView || "By author"),
        div({ class: "pad-readonly-colored" }, renderNumbered(chunks))
      )
    : null
  const lineCount = String(currentText || "").split("\n").length
  const editorRows = Math.max(24, lineCount + 12)
  const gutter = div({ class: "pad-gutter" }, Array.from({ length: editorRows }, (_, i) => String(i + 1)).join("\n"))

  const visibleEntries = entries.filter(e => e.text && String(e.text).trim())
  const selectedKey = params.selectedVersion ? params.selectedVersion.key : null
  const historyPanel = visibleEntries.length > 0
    ? div({ class: "pad-history" },
        h4(i18n.padVersionHistory || "Version History"),
        ...visibleEntries.slice().reverse().map((e, idx) =>
          div({ class: "pad-history-item" },
            a({ href: `/pads/${encodeURIComponent(pad.rootId)}?version=${encodeURIComponent(e.key || idx)}`, class: "pad-version-link" + (selectedKey && e.key === selectedKey ? " active" : ""), title: i18n.padVersionView || "View" }, moment(e.createdAt).format("YYYY/MM/DD HH:mm")),
            span({ class: "pad-author-swatch " + memberColorClass(pad.members, e.author) }),
            userLink(e.author)
          )
        )
      )
    : null
  const sidePanels = [historyPanel].filter(Boolean)

  const editorArea = isMember && !padClosed && !params.selectedVersion
    ? div({ class: "pad-workspace" },
        div({ class: "pad-workspace-main" },
          form({ method: "POST", action: `/pads/entry/${encodeURIComponent(pad.rootId)}` },
            div({ class: "pad-editor-wrap" },
              gutter,
              textarea({ maxlength: "3000", name: "text", rows: String(editorRows), class: "pad-editor", placeholder: i18n.padEditorPlaceholder || "Start writing...", wrap: "off" }, currentText)
            ),
            div({ class: "pad-editor-bar" },
              button({ type: "submit", class: "create-button" }, i18n.padSubmitEntry || "Submit")
            )
          ),
          attributionView
        ),
        sidePanels.length ? div({ class: "pad-workspace-side" }, ...sidePanels) : null
      )
    : div({ class: "pad-workspace" },
        div({ class: "pad-workspace-main" },
          params.selectedVersion
            ? div({ class: "pad-viewer-back" },
                a({ href: `/pads/${encodeURIComponent(pad.rootId)}`, class: "filter-btn" },
                  "\u2190 " + (i18n.padBackToEditor || "Back to editor"))
              )
            : null,
          documentView
        ),
        sidePanels.length ? div({ class: "pad-workspace-side" }, ...sidePanels) : null
      )

  const padMain = isRestrictedInviteOnly
    ? div({ class: "tribe-main" }, p({ class: "access-denied-msg" }, i18n.padAccessDenied))
    : div({ class: "tribe-main" }, editorArea)

  return template(
    pad.title || i18n.padsTitle || "Pad",
    section(
      div({ class: "tags-header module-header-line" },
        h2(i18n.padsTitle || "Pads"),
        p(i18n.padsDescription || "Manage collaborative encrypted text editors in your network.")
      ),
      renderModeButtons("all", false, (params && params.modesAvail) || null)
    ),
    section(div({ class: "tribe-details pad-page" }, padSide, padMain))
  )
}
