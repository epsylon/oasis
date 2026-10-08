const { div, h2, p, section, button, form, a, span, br, hr, label, textarea, input, select, option, img, table, tr, td, details, summary, ul, li } = require("../server/node_modules/hyperaxe")
const { clearnetItemHref, template, i18n, userLink, renderStateChip, renderLifespanChip, renderContentActions, renderInviteQrCard, renderModuleStatsBy, moduleIsEmpty, liveClock, renderPhoneChip, contentDeleteAction } = require("./main_views")
const { renderEncryptedChip, renderTransportChip, renderReachChip, renderClearnetSelector, renderClearnetSwitch } = require("./clearnet_view")
const { renderStyledText } = require("../backend/renderStyledText")
const moment = require("../server/node_modules/moment")
const { config } = require("../server/SSB_server.js")

const userId = config.keys.id
const ROOM_MAX = 50
const MODES = ["recent", "mine", "all", "live", "open", "invite", "closed"]

const safeArr = (v) => (Array.isArray(v) ? v : [])
const roomHref = (room) => `/rooms/${encodeURIComponent(room.rootId)}`
const occOf = (params, room) => (params && params.occupancy && params.occupancy.get(room.rootId)) || null
const modeLabel = (f) => String(i18n[`roomFilter${f.charAt(0).toUpperCase() + f.slice(1)}`] || f).toUpperCase()
const ROOM_REACH = ["OPEN", "INVITE-ONLY"]
const roomReachLabel = (s) => s === "INVITE-ONLY" ? i18n.roomStatusInviteOnly : i18n.roomStatusOpen
const clearnetEligible = (room) => !!room && !room.tribeId && !room.encrypted && room.type === "OPEN" && String(room.status || "").toUpperCase() === "OPEN" && !room.isClosed
const roomClearnetHref = (room) => clearnetItemHref("rooms", room.title, room.rootId)

const renderRoomStatusChip = (room) => {
  const s = room.isClosed ? "CLOSED" : room.type
  const variant = s === "CLOSED" ? "closed" : s === "INVITE-ONLY" ? "whole" : "mutuals"
  const icon = s === "CLOSED" ? "✗" : s === "INVITE-ONLY" ? "🔑" : "✓"
  const label = s === "CLOSED" ? i18n.roomStatusClosed : s === "INVITE-ONLY" ? i18n.roomStatusInviteOnly : i18n.roomStatusOpen
  return renderStateChip(variant, icon, label)
}

const renderRoomNumberChip = (room, occ, inside) => {
  if (!room.number) return null
  if (room.line === "SWITCHBOARD" && !inside && occ && Number(occ.count) > 0) return renderPhoneChip(room.number, i18n.roomNumberHint)
  return span({ title: room.line !== "SWITCHBOARD" ? i18n.roomLineDndError : inside ? i18n.roomYouAreIn : i18n.roomNobodyInside }, renderStateChip("whole", "✆", room.number))
}
const renderRoomLineChip = (room) => room.isClosed || String(room.author) === String(userId)
  ? null
  : renderStateChip(room.line === "SWITCHBOARD" ? "mutuals" : "hidden", null, String(room.line === "SWITCHBOARD" ? i18n.roomLineSwitchboard : i18n.phoneDnd).toUpperCase())

const renderLiveChip = (occ) => occ && occ.count > 0 ? renderStateChip("mutuals", "●", `${i18n.roomLiveChip} ${occ.count}/${occ.max || ROOM_MAX}`) : null

const roomChips = (room, occ, inside = false) => [
  renderRoomStatusChip(room),
  renderEncryptedChip(i18n),
  room.type === "OPEN" && !room.tribeId ? renderTransportChip(i18n) : null,
  renderRoomNumberChip(room, occ, inside),
  renderRoomLineChip(room),
  renderLiveChip(occ),
  renderLifespanChip(room.lifetime, i18n)
].filter(Boolean)

const renderModeButtons = (currentFilter, emptyMod = false, modesAvail = null) =>
  div({ class: "tribe-mode-buttons" },
    ...(emptyMod ? [] : [
      MODES.filter(f => f === "all" || f === currentFilter || (modesAvail && modesAvail[f] === true)).map(f =>
        form({ method: "GET", action: "/rooms" },
          input({ type: "hidden", name: "filter", value: f }),
          button({ type: "submit", class: currentFilter === f ? "filter-btn active" : "filter-btn" }, modeLabel(f))
        )
      )
    ]),
    form({ method: "GET", action: "/rooms" },
      input({ type: "hidden", name: "filter", value: "create" }),
      button({ type: "submit", class: "create-button" }, i18n.roomCreate)
    )
  )

const renderCover = (room, cls) => room.image ? img({ loading: "lazy", src: `/blob/${encodeURIComponent(room.image)}`, class: cls, alt: "" }) : null

const roomIsFull = (occ) => !!occ && occ.count >= ((occ && occ.max) || ROOM_MAX)

const joinForm = (room, occ, cls = "tribe-action-btn") => {
  const max = (occ && occ.max) || ROOM_MAX
  const count = occ ? occ.count : null
  const full = count !== null && count >= max
  return form({ method: "POST", action: `/rooms/join/${encodeURIComponent(room.rootId)}`, class: "room-join-form" },
    button({ type: "submit", class: cls, ...(full ? { disabled: true } : {}) },
      String(full ? i18n.roomFull : i18n.roomJoin).toUpperCase())
  )
}

const renderRoomItem = (room, params = {}) => {
  const occ = occOf(params, room)
  const inside = params.live && params.live.ref === room.rootId
  const canJoin = !room.isClosed && !inside && (room.type === "OPEN" || room.tribeId || String(room.author) === String(userId) || safeArr(room.members).includes(userId))
  return li({ class: "mailing-archive-item room-item" },
    div({ class: "emergency-update-head mailing-archive-head" },
      div({ class: "mailing-archive-meta" },
        canJoin && !roomIsFull(occ)
          ? form({ method: "POST", action: `/rooms/join/${encodeURIComponent(room.rootId)}`, class: "room-join-form" },
              button({ type: "submit", class: "user-link room-title-join", title: i18n.roomJoin }, room.title || "—"))
          : a({ href: roomHref(room), class: "user-link" }, room.title || "—"),
        span({ class: "card-label activity-update-counts mailing-counts" }, `👥: ${safeArr(room.members).length}`),
        ...roomChips(room, occ, inside),
        room.clearnet === true && clearnetEligible(room) ? renderReachChip(true, i18n, roomClearnetHref(room)) : null,
        inside ? renderStateChip("whole", "ꘒ", String(i18n.roomYouAreIn).toUpperCase()) : null
      ),
      renderContentActions(room.rootId, roomHref(room), { spread: (params.spreadMap && params.spreadMap.get(room.rootId)) || null, author: room.author, favKind: "rooms", isFavorite: room.isFavorite, reportTitle: room.title, deleteAction: String(room.author) === String(userId) ? contentDeleteAction("room", room.rootId) : undefined })
    )
  )
}

const renderRoomForm = (room, params = {}) => {
  const tribeId = String(params.tribeId || "")
  const isEdit = !!room
  const draft = isEdit ? room : (params.draft || {})
  const reachRaw = String(params.reach || draft.status || "").toUpperCase()
  const reach = ROOM_REACH.includes(reachRaw) ? reachRaw : "OPEN"
  const withReach = !isEdit && !tribeId
  const showClearnet = isEdit ? clearnetEligible(room) : (withReach && reach === "OPEN")
  return div({ class: "div-center audio-form" },
    h2(isEdit ? i18n.roomUpdateSectionTitle : i18n.roomCreateSectionTitle),
    withReach
      ? [
          form({ method: "GET", action: "/rooms" },
            input({ type: "hidden", name: "filter", value: "create" }),
            label(i18n.roomTypeLabel), br(),
            div({ class: "apply-row" },
              select({ name: "status", class: "report-category-select" },
                ...ROOM_REACH.map(s => option({ value: s, ...(reach === s ? { selected: true } : {}) }, roomReachLabel(s)))
              ),
              button({ type: "submit", class: "create-button" }, i18n.apply || "Apply")
            )
          ),
          hr({ class: "form-sep" }),
          h2({ class: "report-category-fixed" }, roomReachLabel(reach))
        ]
      : null,
    form({ method: "POST", action: isEdit ? `/rooms/update/${encodeURIComponent(room.rootId)}` : "/rooms/create", enctype: "multipart/form-data" },
      tribeId ? input({ type: "hidden", name: "tribeId", value: tribeId }) : null,
      withReach ? input({ type: "hidden", name: "status", value: reach }) : null,
      span(i18n.title || "Title"), br(),
      input({ type: "text", name: "title", maxlength: "100", required: true, placeholder: i18n.roomTitlePlaceholder, value: draft.title || "" }), br(),
      span(i18n.roomDescriptionLabel), br(),
      textarea({ name: "description", rows: 4, maxlength: "1000", placeholder: i18n.roomDescriptionPlaceholder }, draft.description || ""), br(),
      span(i18n.uploadMedia), br(),
      input({ type: "file", name: "image", accept: "image/*" }), br(), br(),
      span(i18n.roomTagsLabel), br(),
      input({ type: "text", name: "tags", placeholder: i18n.tagsPlaceholder, value: safeArr(draft.tags).join(", ") }), br(),
      showClearnet ? renderClearnetSelector(draft.clearnet === true || String(draft.clearnet || "") === "1", i18n) : null,
      button({ type: "submit", class: "create-button" }, isEdit ? i18n.roomUpdate : i18n.roomCreate)
    )
  )
}

exports.renderRoomInvitePage = (code) =>
  template(i18n.roomInviteMode || i18n.tribeInviteCodeText,
    section(div({ class: "invite-page" },
      h2(i18n.tribeInviteCodeText, code),
      form({ method: "GET", action: "/rooms" },
        input({ type: "hidden", name: "filter", value: "all" }),
        button({ type: "submit", class: "filter-btn" }, i18n.walletBack)
      )
    ))
  )

exports.roomsView = async (rooms, filter, roomToEdit, params = {}) => {
  const list = safeArr(rooms)
  const q = String(params.q || "").trim()
  const isForm = filter === "create" || filter === "edit"
  const emptyMod = moduleIsEmpty(list, filter || "all", "all", q)
  const shown = q
    ? list.filter(r => [r.title, r.description, r.number, ...safeArr(r.tags)].some(v => String(v || "").toLowerCase().includes(q.toLowerCase())))
    : list
  return template(i18n.roomsTitle,
    section(
      div({ class: "tags-header module-header-line" }, h2(i18n.roomsTitle), p(i18n.roomsDescription)),
      renderModeButtons(filter, emptyMod, params.modesAvail || null),
      !isForm && !emptyMod
        ? div({ class: "filters activity-filter-chips activity-toolbar-row" },
            renderModuleStatsBy(shown, r => r.isClosed ? "CLOSED" : r.type, [{ value: "OPEN", label: i18n.roomStatusOpen }, { value: "INVITE-ONLY", label: i18n.roomStatusInviteOnly }, { value: "CLOSED", label: i18n.roomStatusClosed }]),
            form({ method: "GET", action: "/rooms", class: "filter-box" },
              input({ type: "hidden", name: "filter", value: filter }),
              input({ type: "text", name: "q", placeholder: i18n.roomSearchPlaceholder, value: q, class: "filter-box__input" }),
              div({ class: "filter-box__controls" }, button({ type: "submit", class: "filter-box__button" }, i18n.searchButton))
            )
          )
        : null,
      isForm
        ? renderRoomForm(filter === "edit" ? roomToEdit : null, params)
        : (shown.length
            ? ul({ class: "mailing-archive" }, ...shown.map(r => renderRoomItem(r, params)))
            : div({ class: "tribe-grid" }, p(i18n.roomsNoItems)))
    )
  )
}

const eventLine = (ev) => {
  const key = ev.t === "join" ? "roomEventJoined" : ev.t === "leave" ? "roomEventLeft" : ev.t === "recStart" ? "roomEventRecStart" : "roomEventRecStop"
  const [before, after] = String(i18n[key] || "{name}").split("{name}")
  return [before, userLink(ev.id), after]
}
const renderRecChip = () => span({ class: "room-rec-chip" }, "● " + String(i18n.roomRecording).toUpperCase())
const fmtDuration = (ms) => { const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` }
const refreshLink = (room) => a({ href: roomHref(room), class: "tribe-action-btn room-refresh-btn" }, String(i18n.liveRefresh).toUpperCase())
const renderLiveControls = (room, live) => div({ class: "room-live-controls" },
  form({ method: "POST", action: "/rooms/notify", class: "phone-action-form" },
    input({ type: "hidden", name: "on", value: live.notify ? "0" : "1" }),
    button({ type: "submit", class: live.notify ? "tribe-action-btn" : "tribe-action-btn room-notify-off" }, "🔔 " + String(live.notify ? i18n.roomNotificationsOn : i18n.roomNotificationsOff).toUpperCase())
  ),
  live.notify && safeArr(live.events).length
    ? form({ method: "POST", action: "/rooms/notify/clear", class: "phone-action-form" }, button({ type: "submit", class: "tribe-action-btn" }, String(i18n.roomClearNotices).toUpperCase()))
    : null,
  form({ method: "POST", action: "/rooms/mute", class: "phone-action-form" },
    input({ type: "hidden", name: "mute", value: live.muted ? "0" : "1" }),
    input({ type: "hidden", name: "returnTo", value: roomHref(room) }),
    button({ type: "submit", class: "tribe-action-btn" }, String(live.muted ? i18n.phoneUnmute : i18n.phoneMute).toUpperCase())
  ),
  live.recording
    ? form({ method: "POST", action: "/rooms/rec/stop", class: "phone-action-form" }, button({ type: "submit", class: "tribe-action-btn danger-btn" }, String(i18n.roomRecStop).toUpperCase()))
    : form({ method: "POST", action: "/rooms/rec/start", class: "phone-action-form" }, button({ type: "submit", class: "tribe-action-btn" }, String(i18n.roomRec).toUpperCase())),
  live.recording || safeArr(live.recordingBy).length ? renderRecChip() : null,
  refreshLink(room),
  form({ method: "POST", action: "/rooms/leave", class: "phone-action-form" },
    input({ type: "hidden", name: "returnTo", value: roomHref(room) }),
    button({ type: "submit", class: "tribe-action-btn danger-btn" }, String(i18n.roomLeave).toUpperCase())
  )
)
const renderRoomEvents = (live) => live.notify && safeArr(live.events).length
  ? ul({ class: "room-events" }, ...safeArr(live.events).slice().reverse().map(ev => li({ class: "room-event" }, span({ class: "date-link" }, moment(ev.ts).format("HH:mm:ss")), span({ class: "room-event-text" }, ...eventLine(ev)))))
  : null
const renderRecordings = (recordings) => safeArr(recordings).length
  ? div({ class: "phone-block room-recordings-block" },
      h2(i18n.roomRecordings),
      ul({ class: "room-recordings" }, ...recordings.map(r => li({ class: "room-recording" },
        span({ class: "date-link" }, moment(r.at).format("YYYY/MM/DD HH:mm")),
        span({ class: "phone-call-clock" }, fmtDuration(r.durationMs)),
        a({ href: `/rooms/recordings/${encodeURIComponent(r.name)}`, class: "tribe-action-btn", download: r.name }, String(i18n.fileDownload).toUpperCase()),
        form({ method: "POST", action: `/rooms/recordings/${encodeURIComponent(r.name)}/delete`, class: "phone-action-form" },
          button({ type: "submit", class: "btn-singleview btn-delete", title: i18n.delete }, "✕"))
      )))
    )
  : null
const renderLivePanel = (room, live, occ, canJoin = false) => {
  const head = (left, controls = null) => div({ class: "room-live-head" },
    div({ class: "room-live-head-main" }, left),
    controls || refreshLink(room)
  )
  if (live) {
    const silenceForm = (id, on) => form({ method: "POST", action: "/rooms/silence", class: "phone-action-form" },
      input({ type: "hidden", name: "id", value: id }),
      input({ type: "hidden", name: "on", value: on ? "0" : "1" }),
      button({ type: "submit", class: on ? "tribe-action-btn danger-btn" : "tribe-action-btn" }, String(on ? i18n.phoneUnsilence : i18n.phoneSilence).toUpperCase())
    )
    const who = (id, speaking, muted, you, silenced = false, recording = false) => div({ class: "phone-contact room-peer" + (speaking ? " room-peer-speaking" : "") },
      speaking ? span({ class: "phone-call-icon" }, "●") : null,
      userLink(id),
      you ? span({ class: "room-peer-you" }, i18n.roomYou) : null,
      muted ? span({ class: "room-peer-muted" }, String(i18n.roomMuted).toUpperCase()) : null,
      recording ? renderRecChip() : null,
      you ? null : silenceForm(id, silenced)
    )
    return div({ class: "phone-call-panel room-live-panel" },
      head(div({ class: "card-chips-row" }, renderEncryptedChip(i18n), renderLiveChip({ count: live.count, max: live.max }), live.joinedAt ? span({ class: "phone-call-clock" }, liveClock(live.joinedAt)) : null), renderLiveControls(room, live)),
      live.secure ? null : p({ class: "room-waiting" }, i18n.roomWaitingKey),
      div({ class: "phone-contacts" },
        who(userId, live.speaking && !live.muted, live.muted, true, false, !!live.recording),
        ...safeArr(live.peers).map(pr => who(pr.id, pr.speaking && !pr.muted && !pr.silenced, pr.muted, false, !!pr.silenced, !!pr.recording))
      ),
      renderRoomEvents(live)
    )
  }
  const count = occ ? occ.count : 0
  return div({ class: "phone-block room-live-panel" },
    head(p({ class: "phone-empty" }, count > 0 ? String(i18n.roomSomeone).replace("{n}", String(count)) : i18n.roomNobody), canJoin ? div({ class: "room-live-controls" }, refreshLink(room), joinForm(room, occ)) : null)
  )
}

exports.singleRoomView = async (room, params = {}) => {
  const isAuthor = String(room.author) === String(userId)
  const isMember = safeArr(room.members).includes(userId) || (!!room.tribeId && !!room.isTribeMember)
  const restricted = !isMember && !isAuthor && room.type === "INVITE-ONLY"
  const live = params.live && params.live.ref === room.rootId ? params.live : null
  const occ = params.occ || null
  const canJoin = !restricted && !room.isClosed && params.available !== false
  const canClearnet = clearnetEligible(room)
  const isClearnet = canClearnet && room.clearnet === true

  const inviteActions = isAuthor && room.type === "INVITE-ONLY" && !room.tribeId && !room.isClosed
    ? [
        form({ method: "POST", action: `/rooms/generate-invite/${encodeURIComponent(room.rootId)}` },
          button({ type: "submit", class: "tribe-action-btn" }, i18n.tribeGenerateInvite)
        ),
        (() => {
          const openInvite = safeArr(room.invites).find(inv => typeof inv === "object" && inv && inv.public === true && inv.code)
          if (openInvite) return [
            div({ class: "tribe-open-invite" },
              span({ class: "card-label" }, i18n.tribeInviteCodeText),
              span({ class: "tribe-open-invite-code" }, openInvite.code),
              renderInviteQrCard({ qrDataUrl: `/qr-invite-code/rooms/${encodeURIComponent(openInvite.code)}` })
            ),
            form({ method: "POST", action: `/rooms/open-invite/remove/${encodeURIComponent(room.rootId)}` },
              button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.tribeRemoveInvitation)
            )
          ]
          return form({ method: "POST", action: `/rooms/open-invite/create/${encodeURIComponent(room.rootId)}` },
            button({ type: "submit", class: "tribe-action-btn" }, i18n.tribeOpenInvitation)
          )
        })()
      ].flat().filter(Boolean)
    : []

  const ownerActions = isAuthor
    ? [
        room.isClosed ? null : form({ method: "POST", action: `/rooms/close/${encodeURIComponent(room.rootId)}` },
          button({ type: "submit", class: "update-btn" }, i18n.roomClose)
        ),
        form({ method: "GET", action: "/rooms" },
          input({ type: "hidden", name: "filter", value: "edit" }),
          input({ type: "hidden", name: "id", value: room.rootId }),
          button({ type: "submit", class: "update-btn" }, i18n.roomUpdate)
        )
      ].filter(Boolean)
    : []

  const side = div({ class: "tribe-side" },
    div({ class: "card-header activity-card-header" },
      renderContentActions(room.rootId, roomHref(room), { spread: params.spreads || null, author: room.author, favKind: "rooms", isFavorite: room.isFavorite, returnTo: roomHref(room), reportTitle: room.title, deleteAction: isAuthor ? contentDeleteAction("room", room.rootId) : undefined })
    ),
    div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, restricted ? i18n.roomStatusInviteOnly : (room.title || "—"))),
    div({ class: "card-chips-row" },
      ...roomChips(room, live ? { count: live.count, max: live.max } : occ, !!live),
      canClearnet ? renderReachChip(isClearnet, i18n, isClearnet ? roomClearnetHref(room) : null) : null,
      isAuthor && canClearnet ? renderClearnetSwitch("rooms", room.rootId, isClearnet) : null
    ),
    restricted ? null : renderCover(room, "tribe-detail-image"),
    restricted || !room.description ? null : p({ class: "tribe-side-description" }, ...renderStyledText(room.description)),
    table({ class: "tribe-info-table jobs-info-table" },
      tr(
        td({ class: "tribe-info-label" }, i18n.createdAtLabel || "Created at"),
        td({ class: "tribe-info-value", colspan: "3" }, moment(room.createdAt).format("YYYY/MM/DD HH:mm"))
      ),
      restricted ? null : tr(td({ class: "tribe-info-value", colspan: "4" }, userLink(room.author)))
    ),
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.roomParticipants}: ${safeArr(room.members).length}`)
    ),
    inviteActions.length ? div({ class: "tribe-side-actions" }, ...inviteActions) : null,
    isAuthor && !room.isClosed
      ? div({ class: "tribe-side-actions housing-status-row" },
          span({ class: "card-label" }, `${i18n.statusLabel || "Status"}: `),
          renderStateChip(room.line === "SWITCHBOARD" ? "mutuals" : "hidden", "✆", String(room.line === "SWITCHBOARD" ? i18n.roomLineSwitchboard : i18n.phoneDnd).toUpperCase()),
          form({ method: "POST", action: `/rooms/line/${encodeURIComponent(room.rootId)}`, class: "inline-form" },
            button({ class: "tribe-action-btn", type: "submit", name: "line", value: room.line === "SWITCHBOARD" ? "DND" : "SWITCHBOARD" },
              String(room.line === "SWITCHBOARD" ? i18n.phoneDnd : i18n.roomLineSwitchboard).toUpperCase())
          )
        )
      : null,
    restricted
      ? div({ class: "tribe-side-actions" }, a({ class: "tribe-action-btn", href: "/invites#invites-rooms" }, i18n.tribeEnterInvite))
      : null,
    restricted || !safeArr(room.tags).length
      ? null
      : div({ class: "card-tags" }, ...room.tags.map(t => a({ href: `/search?query=%23${encodeURIComponent(t)}`, class: "tag-link" }, `#${t}`))),
    ownerActions.length ? div({ class: "tribe-side-actions owner-actions" }, ...ownerActions) : null
  )

  const main = div({ class: "tribe-main" },
    restricted
      ? p({ class: "access-denied-msg" }, i18n.roomAccessDenied)
      : [
          params.available === false ? div({ class: "pm-form-error-msg" }, p("✗ " + i18n.phoneUnavailable)) : null,
          live
            ? renderLivePanel(room, live, occ)
            : [
                renderLivePanel(room, null, occ, canJoin),
                details({ class: "pad-members-details", ...(safeArr(room.members).length <= 8 ? { open: true } : {}) },
                  summary({ class: "tribe-members-count" }, `${i18n.roomParticipants}: ${safeArr(room.members).length}`),
                  div({ class: "pad-members-chips" }, ...safeArr(room.members).map(m => span({ class: "pad-member-chip" }, userLink(m))))
                )
              ],
          renderRecordings(params.recordings)
        ]
  )

  return template(room.title || i18n.roomsTitle,
    section(div({ class: "tags-header module-header-line" }, h2(i18n.roomsTitle), p(i18n.roomsDescription)), renderModeButtons("all", false, params.modesAvail || null)),
    section(div({ class: "tribe-details" }, side, main))
  )
}

exports.renderTribeRoomsSection = (tribe, rooms, occupancy, live, toolbar = null) => {
  const items = safeArr(rooms)
  const createBtn = form({ method: "GET", action: "/rooms" },
    input({ type: "hidden", name: "filter", value: "create" }),
    input({ type: "hidden", name: "tribeId", value: tribe.id }),
    button({ type: "submit", class: "create-button" }, i18n.tribeRoomCreate))
  const head = toolbar || div({ class: "tribe-content-header" }, h2(i18n.tribeSectionRooms), createBtn)
  if (!items.length) return div({ class: "tribe-content-list" }, head, div({ class: "no-content-box" }, p(i18n.tribeRoomsEmpty)))
  return div({ class: "tribe-content-list" },
    head,
    ul({ class: "mailing-archive" }, ...items.map(r => renderRoomItem(r, { occupancy, live })))
  )
}

exports.renderRoomItem = renderRoomItem
exports.roomStatsBy = (rooms) => renderModuleStatsBy(safeArr(rooms), r => r.isClosed ? "CLOSED" : r.type, [{ value: "OPEN", label: i18n.roomStatusOpen }, { value: "INVITE-ONLY", label: i18n.roomStatusInviteOnly }, { value: "CLOSED", label: i18n.roomStatusClosed }])

exports.clearnetRoomView = async (room) => {
  const { escapeHtml: esc, renderKindTag, renderClearnetPage } = require("./clearnet_view")
  const name = room.title || i18n.cnKindRoom
  const extraCss = `
.cn-room-title{color:var(--fg);margin:0 0 16px 0;font-size:32px;font-weight:700;word-break:break-word}
.cn-room-meta{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.cn-room-number{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--fg);border-radius:10px;padding:4px 12px;font-size:16px;font-weight:600;color:var(--fg);background:var(--bg-sub)}
.cn-room-number .pm-exposition-icon{font-size:18px;line-height:1}
.cn-room-number .pm-exposition-text{line-height:1;letter-spacing:1px;font-family:monospace}
`
  const body = `
  <h1 class="cn-room-title">${esc(name)}</h1>
  <div class="cn-room-meta">
    ${renderKindTag("room")}
    ${room.number ? `<span class="pm-exposition-chip pm-exposition-whole cn-room-number"><span class="pm-exposition-icon">✆</span><span class="pm-exposition-text">${esc(room.number)}</span></span>` : ""}
  </div>
`
  return renderClearnetPage({
    title: `${name} | Oasis`,
    ogTitle: name,
    ogDescription: "",
    extraCss,
    body,
    hubFeedId: room.author || null
  })
}

exports.roomModesFromCensus = (census, me, occupancy) => {
  const list = safeArr(census)
  return {
    mine: list.some(x => String(x.author) === String(me)),
    recent: list.length > 0,
    live: list.some(x => { const o = occupancy && occupancy.get(x.rootId); return !!(o && o.count > 0) }),
    open: list.some(x => x.type === "OPEN" && !x.isClosed),
    invite: list.some(x => x.type === "INVITE-ONLY" && !x.isClosed),
    closed: list.some(x => x.isClosed)
  }
}
