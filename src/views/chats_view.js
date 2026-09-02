const { div, h2, p, section, button, form, a, span, textarea, br, input, label, select, option, img, table, tr, td, ul, li, details, summary } = require("../server/node_modules/hyperaxe")
const { template, i18n, userLink, userLinkLabel, renderStateChip, renderLifespanChip, renderSpreadButton, renderContentActions, renderInviteQrCard, renderSubscriptionBox } = require("./main_views")
const { renderEncryptedChip } = require("./clearnet_view")
const { renderResults, renderBallot, outcomeOf } = require("./polls_view")
const moment = require("../server/node_modules/moment")
const { config } = require("../server/SSB_server.js")
const { renderUrl } = require("../backend/renderUrl")
const { renderZoomableImage } = require("./gallery_view")

const userId = config.keys.id
const safeArr = (v) => (Array.isArray(v) ? v : [])
const safeText = (v) => String(v || "").trim()

const CAT_BLOCK1 = ["GENERAL", "OASIS", "L.A.R.P.", "POLITICS", "TECH"]
const CAT_BLOCK2 = ["SCIENCE", "MUSIC", "ART", "GAMING", "BOOKS", "FILMS"]
const CAT_BLOCK3 = ["PHILOSOPHY", "SOCIETY", "PRIVACY", "CYBERWARFARE", "SURVIVALISM"]
const ALL_CATS = [...CAT_BLOCK1, ...CAT_BLOCK2, ...CAT_BLOCK3]

const catKey = (c) => "forumCat" + String(c || "").replace(/\./g, "").replace(/[\s-]/g, "").toUpperCase()
const catLabel = (c) => i18n[catKey(c)] || c

const blobSrcOf = (value) => {
  const s = String(value || "").trim()
  if (s.startsWith("&")) return `/blob/${encodeURIComponent(s)}`
  const mImg = s.match(/!\[[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  return mImg ? `/blob/${encodeURIComponent(mImg[1])}` : null
}

const renderMediaBlob = (value, fallbackSrc = null, attrs = {}) => {
  if (!value) return fallbackSrc ? img({ src: fallbackSrc, ...attrs }) : null
  const s = String(value).trim()
  if (!s) return fallbackSrc ? img({ src: fallbackSrc, ...attrs }) : null
  if (s.startsWith("&")) return img({ src: `/blob/${encodeURIComponent(s)}`, ...attrs })
  const mImg = s.match(/!\[[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mImg) return img({ src: `/blob/${encodeURIComponent(mImg[1])}`, ...attrs })
  return fallbackSrc ? img({ src: fallbackSrc, ...attrs }) : null
}

const buildReturnTo = (filter, params = {}) => {
  const f = safeText(filter || "all")
  const q = safeText(params.q || "")
  const parts = [`filter=${encodeURIComponent(f)}`]
  if (q) parts.push(`q=${encodeURIComponent(q)}`)
  return `/chats?${parts.join("&")}`
}

const renderModeButtons = (currentFilter) =>
  div({ class: "tribe-mode-buttons" },
    ["all", "mine", "recent", "favorites", "open", "closed"].map(f =>
      form({ method: "GET", action: "/chats" },
        input({ type: "hidden", name: "filter", value: f }),
        button({ type: "submit", class: currentFilter === f ? "filter-btn active" : "filter-btn" }, i18n[`chatFilter${f.charAt(0).toUpperCase() + f.slice(1)}`] || f.toUpperCase())
      )
    ),
    form({ method: "GET", action: "/chats" },
      input({ type: "hidden", name: "filter", value: "create" }),
      button({ type: "submit", class: "create-button" }, i18n.chatCreate)
    )
  )

const renderChatStatusChip = (status) => {
  const s = String(status || "OPEN").toUpperCase()
  const variant = s === "CLOSED" ? "closed" : s === "INVITE-ONLY" ? "whole" : "mutuals"
  const icon = s === "CLOSED" ? "\u2717" : s === "INVITE-ONLY" ? "\uD83D\uDD11" : "\u2713"
  const label = s === "CLOSED" ? i18n.chatStatusClosed
    : s === "INVITE-ONLY" ? i18n.chatStatusInviteOnly
    : i18n.chatStatusOpen
  return renderStateChip(variant, icon, label)
}

const renderChatCard = (chat, filter, params = {}) => {
  const chips = [
    renderChatStatusChip(chat.status),
    renderEncryptedChip(i18n),
    renderLifespanChip(chat.lifetime, i18n),
    chat.subscriptionIn === true
      ? renderStateChip("mutuals", "✉", i18n.subscriptionOn)
      : (chat.subscriptionIn === false ? renderStateChip("closed", "✉", i18n.subscriptionOff) : null)
  ].filter(Boolean)
  const href = `/chats/${encodeURIComponent(chat.key)}`

  return div({ class: "tribe-card" },
    div({ class: "card-header activity-card-header" },
      renderContentActions(chat.key, href, {
        spread: params.spread || null,
        author: chat.author,
        favKind: 'chats',
        isFavorite: chat.isFavorite,
        returnTo: buildReturnTo(filter, params),
        reportTitle: chat.title
      })
    ),
    div({ class: "tribe-card-image-wrapper" },
      a({ href: `/chats/${encodeURIComponent(chat.key)}#chat-latest` },
        renderMediaBlob(chat.image, "/assets/images/default-avatar.png", { class: "tribe-card-hero-image" })
      )
    ),
    div({ class: "tribe-card-body" },
      div({ class: "shop-title-row" },
        h2({ class: "tribe-card-title" },
          a({ href: `/chats/${encodeURIComponent(chat.key)}#chat-latest` }, chat.title || i18n.chatUntitled)
        )
      ),
      chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
      chat.description ? p({ class: "tribe-card-description" }, chat.description) : null,
      div({ class: "tribe-card-members" },
        span({ class: "tribe-members-count" }, `${i18n.chatParticipants}: ${safeArr(chat.members).length}`)
      )
    )
  )
}

const renderChatForm = (filter, chat = {}, params = {}) => {
  const isEdit = filter === "edit"
  const returnTo = safeText(params.returnTo) || buildReturnTo("all")
  const tribeId = safeText(params.tribeId || "")
  return div({ class: "div-center audio-form" },
    h2(isEdit ? i18n.chatUpdate : i18n.chatCreate),
    form({ action: isEdit ? `/chats/update/${encodeURIComponent(chat.key || "")}` : "/chats/create", method: "POST", enctype: "multipart/form-data" },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      tribeId ? input({ type: "hidden", name: "tribeId", value: tribeId }) : null,
      span(i18n.title || "Title"), br(),
      input({ type: "text", name: "title", maxlength: "100", required: true, placeholder: i18n.chatTitlePlaceholder, value: chat.title || "" }), br(), br(),
      span(i18n.chatDescription), br(),
      textarea({ name: "description", rows: 4, maxlength: "1000", placeholder: i18n.chatDescriptionPlaceholder }, chat.description || ""), br(), br(),
      span(i18n.uploadMedia), br(),
      input({ type: "file", name: "image", accept: "image/*" }), br(), br(),
      span(i18n.chatCategory), br(),
      select({ name: "category" },
        ALL_CATS.map(cat =>
          option({ value: cat, ...((chat.category || "GENERAL") === cat ? { selected: true } : {}) }, catLabel(cat))
        )
      ), br(), br(),
      span(i18n.chatStatusLabel || "Status"), br(),
      select({ name: "status" },
        option({ value: "OPEN", ...((!chat.status || chat.status === "OPEN") ? { selected: true } : {}) }, i18n.chatStatusOpen),
        option({ value: "INVITE-ONLY", ...(chat.status === "INVITE-ONLY" ? { selected: true } : {}) }, i18n.chatStatusInviteOnly)
      ), br(), br(),
      span(i18n.shopTags || "Tags"), br(),
      input({ type: "text", name: "tags", placeholder: i18n.chatTagsPlaceholder, value: safeArr(chat.tags).join(", ") }), br(), br(),
      button({ type: "submit" }, isEdit ? i18n.chatUpdate : i18n.chatCreate)
    )
  )
}

const renderMessageText = (text) => {
  if (!text) return span({ class: "chat-message-text" }, "")
  const lines = String(text).split("\n")
  const nodes = []
  lines.forEach((line, idx) => {
    const rendered = renderUrl(line)
    nodes.push(...rendered)
    if (idx < lines.length - 1) nodes.push(br())
  })
  return span({ class: "chat-message-text" }, ...nodes)
}

const chatActivityTs = (c) => Math.max(
  Number(c.lastMsgAt || 0),
  Date.parse(c.updatedAt || "") || 0,
  Date.parse(c.createdAt || "") || 0
)

const renderChatTopics = (chats, activeKey) =>
  div({ class: "chat-topics" },
    div({ class: "chat-topics-head" },
      a({ href: "/chats", class: "chat-topics-title-link" }, i18n.chatsTitle),
      a({ href: "/chats?filter=create", class: "filter-btn chat-topics-new" }, "+")
    ),
    ...safeArr(chats).slice().sort((a, b) => chatActivityTs(b) - chatActivityTs(a)).map(c => {
      const key = c.rootId || c.key
      const active = activeKey && String(key) === String(activeKey)
      return a({ href: `/chats/${encodeURIComponent(key)}#chat-latest`, class: active ? "chat-topic chat-topic-active" : "chat-topic" },
        span({ class: "chat-topic-title" }, c.title || i18n.chatUntitled),
        span({ class: "chat-topic-meta" }, `${i18n.chatParticipants}: ${safeArr(c.members).length}`)
      )
    })
  )

const renderSenderLink = (author, isOwner) =>
  author
    ? a({ href: `/author/${encodeURIComponent(author)}`, class: isOwner ? "chat-bubble-sender chat-bubble-sender-owner" : "chat-bubble-sender" }, userLinkLabel(author))
    : null

const renderChatPoll = (poll, chat) => {
  const isSelf = String(poll.author) === String(userId)
  const isOwner = String(poll.author) === String(chat.author)
  const showResults = poll.hasVoted || poll.status === "CLOSED"
  return div({ class: isSelf ? "chat-bubble-row chat-bubble-row-self" : "chat-bubble-row" },
    div({ class: isSelf ? "chat-message chat-message-self chat-poll" : "chat-message chat-poll" },
    isSelf ? null : renderSenderLink(poll.author, isOwner),
    div({ class: "chat-poll-head" },
      span({ class: "chat-poll-tag" }, i18n.pollInChat),
      poll.anonymous ? span({ class: "chat-poll-tag" }, i18n.pollAnonymous) : null,
      poll.multiple ? span({ class: "chat-poll-tag" }, i18n.pollMultiple) : null,
      poll.status === "CLOSED" ? span({ class: "chat-poll-tag" }, i18n.pollStatusClosed) : null
    ),
    poll.undecryptable
      ? p({ class: "chat-poll-question" }, i18n.chatAccessDenied)
      : [
          p({ class: "chat-poll-question" }, poll.question),
          showResults ? renderResults(poll) : null,
          div({ class: "chat-poll-actions" },
            renderBallot(poll, `/chats/${encodeURIComponent(chat.key)}`, "/polls"),
            String(poll.author) === String(userId) && poll.status === "OPEN"
              ? form({ method: "POST", action: `/polls/close/${encodeURIComponent(poll.id)}` },
                  input({ type: "hidden", name: "returnTo", value: `/chats/${encodeURIComponent(chat.key)}` }),
                  button({ type: "submit", class: "filter-btn" }, i18n.pollCloseButton)
                )
              : null
          ),
          div({ class: "chat-poll-meta" },
            span({ class: "card-label" }, `${i18n.pollVoters}: `),
            span({ class: "card-value" }, String(poll.totalVoters)),
            span({ class: "card-label" }, ` · ${i18n.pollOutcome}: `),
            span({ class: "card-value" }, outcomeOf(poll))
          )
        ],
    span({ class: "chat-bubble-time" }, moment(poll.createdAt).format("HH:mm"))
    )
  )
}

const REACTIONS = [
  ["up", "👍"],
  ["heart", "❤️"],
  ["laugh", "😂"],
  ["down", "👎"]
]

const anchorIdOf = (key) => "msg-" + String(key || "").replace(/[^a-zA-Z0-9]/g, "")

const renderMessage = (msg, chat, opts = {}) => {
  const isAuthor = String(msg.author) === String(chat.author)
  const isSelf = String(msg.author) === String(userId)
  const imageSrc = blobSrcOf(msg.image)
  const imageNode = imageSrc
    ? renderZoomableImage(imageSrc, { imgClass: "chat-message-image" })
    : (msg.image ? renderMediaBlob(msg.image, null, { class: "chat-message-image" }) : null)

  const counts = (msg.reactions && msg.reactions.counts) || {}
  const mine = (msg.reactions && msg.reactions.mine) || {}
  const reactionNodes = REACTIONS.map(([code, icon]) => {
    const n = Number(counts[code] || 0)
    const label = n > 0 ? `${icon} ${n}` : icon
    if (!opts.canWrite) return n > 0 ? span({ class: "chat-react-btn" }, label) : null
    return form({ method: "POST", action: `/chats/${encodeURIComponent(chat.key)}/react`, class: "chat-react-form" },
      input({ type: "hidden", name: "target", value: msg.key }),
      input({ type: "hidden", name: "emoji", value: code }),
      button({ type: "submit", class: mine[code] ? "chat-react-btn chat-react-active" : "chat-react-btn" }, label)
    )
  }).filter(Boolean)

  const replyLink = opts.canWrite
    ? a({ href: `/chats/${encodeURIComponent(chat.key)}?reply=${encodeURIComponent(msg.key)}#chat-message-form`, class: "chat-react-btn chat-reply-btn", title: i18n.chatReply }, "↩")
    : null

  const pinBtn = opts.isChatAuthor
    ? form({ method: "POST", action: `/chats/${encodeURIComponent(chat.key)}/pin`, class: "chat-react-form chat-pin-toggle" },
        input({ type: "hidden", name: "target", value: msg.key }),
        button({ type: "submit", class: msg.pinned ? "chat-react-btn chat-react-active" : "chat-react-btn", title: msg.pinned ? i18n.chatUnpin : i18n.chatPin }, "📌")
      )
    : null

  const quoteText = String((msg.reply && msg.reply.text) || "").trim()
  const quote = msg.reply
    ? a({ href: `#${anchorIdOf(msg.replyTo)}`, class: "chat-reply-quote" },
        span({ class: "chat-reply-arrow" }, "↩ "),
        span({ class: "chat-reply-text" }, quoteText ? `${quoteText}${quoteText.length >= 120 ? "…" : ""}` : userLinkLabel(msg.reply.author))
      )
    : null

  const timeNode = span({ class: "chat-bubble-time" }, moment(msg.createdAt).format("HH:mm"))
  const actionsRow = (reactionNodes.length || replyLink)
    ? div({ class: "chat-msg-actions" }, ...reactionNodes, replyLink,
        span({ class: replyLink ? "chat-bubble-time chat-time-inline" : "chat-bubble-time chat-time-inline chat-time-push" }, moment(msg.createdAt).format("HH:mm")))
    : null

  const bubbleClass = [
    "chat-message",
    isSelf ? "chat-message-self" : (isAuthor ? "chat-message-author" : ""),
    msg.pinned ? "chat-message-pinned" : "",
    pinBtn ? "chat-has-pin-toggle" : ""
  ].filter(Boolean).join(" ")

  return div({ id: anchorIdOf(msg.key), class: isSelf ? "chat-bubble-row chat-bubble-row-self" : "chat-bubble-row" },
    div({ class: bubbleClass },
      pinBtn,
      isSelf ? null : renderSenderLink(msg.author, isAuthor),
      quote,
      renderMessageText(msg.text || ""),
      imageNode ? div({ class: "chat-message-image-wrap" }, imageNode) : null,
      actionsRow || timeNode
    )
  )
}


exports.renderChatInvitePage = (code) => {
  const pageContent = div({ class: "invite-page" },
    h2(i18n.tribeInviteCodeText, code),
    form({ method: "GET", action: "/chats" },
      input({ type: "hidden", name: "filter", value: "all" }),
      button({ type: "submit", class: "filter-btn" }, i18n.walletBack)
    )
  )
  return template(i18n.chatInviteMode || "Invite", section(pageContent))
}

exports.chatsView = async (chats, filter, chatToEdit = null, params = {}) => {
  const q = safeText(params.q || "")
  const list = safeArr(chats)

  const isForm = filter === "create" || filter === "edit"

  const headerText = i18n.chatsTitle

  if (params.workspace && !isForm) {
    return template(
      i18n.chatsTitle,
      section({ class: "chat-workspace-section" },
        div({ class: "chat-workspace" },
          renderChatTopics(list, null),
          div({ class: "chat-workspace-main chat-workspace-empty" },
            p({ class: "chat-no-messages" }, list.length ? i18n.chatPickChat : i18n.chatNoneYet)
          )
        )
      )
    )
  }

  return template(
    i18n.chatsTitle,
    section(
      div({ class: "tags-header module-header-line" },
        h2(headerText),
        p(i18n.modulesChatsDescription)
      )
    ),
    section(renderModeButtons(filter)),
    !isForm
      ? section(
          div({ class: "filters activity-filter-chips activity-toolbar-row" },
            form({ method: "GET", action: "/chats", class: "filter-box" },
              input({ type: "hidden", name: "filter", value: filter }),
              input({ type: "text", name: "q", placeholder: i18n.chatSearchPlaceholder, value: q, class: "filter-box__input" }),
              div({ class: "filter-box__controls" },
                button({ type: "submit", class: "filter-box__button" }, i18n.searchButton)
              )
            )
          )
        )
      : null,
    section(
      isForm
        ? renderChatForm(filter, filter === "edit" ? (chatToEdit || {}) : {}, params)
        : div({ class: "tribe-grid" },
            list.length
              ? list.map(chat => renderChatCard(chat, filter, { q, spread: params.spreadMap && params.spreadMap.get(chat.key) }))
              : p(i18n.chatNoItems)
          )
    )
  )
}

exports.singleChatView = async (chat, filter, messages = [], params = {}) => {
  const q = safeText(params.q || "")
  const returnTo = safeText(params.returnTo) || buildReturnTo(filter, { q })
  const isAuthor = String(chat.author) === String(userId)
  const isMember = safeArr(chat.members).includes(userId) || (!!chat.tribeId && !!chat.isTribeMember)
  const isRestrictedInviteOnly = !isMember && !isAuthor && chat.status === "INVITE-ONLY"

  const statusLabel = chat.status === "CLOSED" ? i18n.chatStatusClosed :
    chat.status === "INVITE-ONLY" ? i18n.chatStatusInviteOnly : i18n.chatStatusOpen

  const chatShares = isAuthor || isMember
  const detailChips = [
    renderChatStatusChip(chat.status),
    renderEncryptedChip(i18n),
    renderLifespanChip(chat.lifetime, i18n),
    chat.subscription && chatShares
      ? ((isAuthor || chat.subscription.subscribed === true)
          ? renderStateChip("mutuals", "✉", i18n.subscriptionOn)
          : renderStateChip("closed", "✉", i18n.subscriptionOff))
      : null
  ].filter(Boolean)
  const chatSide = div({ class: "tribe-side" },
    div({ class: "card-header activity-card-header" },
      renderContentActions(chat.key, null, { spread: params.spreads || null, author: chat.author, favKind: 'chats', isFavorite: chat.isFavorite, returnTo: params.returnTo, reportTitle: chat.title })
    ),
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, chat.title || i18n.chatUntitled)
    ),
    detailChips.length ? div({ class: "card-chips-row" }, ...detailChips) : null,
    renderMediaBlob(chat.image, "/assets/images/default-avatar.png", { class: "tribe-detail-image" }),
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.chatParticipants}: ${safeArr(chat.members).length}`)
    ),
    chat.subscription && chatShares
      ? renderSubscriptionBox({
          target: chat.rootId || chat.key,
          scope: "chats",
          subscribed: chat.subscription.subscribed === true,
          count: chat.subscription.count,
          isOwner: isAuthor,
          returnTo
        })
      : null,
    table({ class: "tribe-info-table" },
      tr(
        td({ class: "tribe-info-label" }, i18n.chatCreatedAt),
        td({ class: "tribe-info-value", colspan: "3" }, moment(chat.createdAt).format("YYYY/MM/DD HH:mm"))
      ),
      !isRestrictedInviteOnly && chat.category ? tr(
        td({ class: "tribe-info-label" }, i18n.chatCategoryLabel),
        td({ class: "tribe-info-value", colspan: "3" }, catLabel(chat.category))
      ) : null,
      isRestrictedInviteOnly ? null : tr(
        td({ class: "tribe-info-value", colspan: "4" },
          userLink(chat.author)
        )
      )
    ),
    isRestrictedInviteOnly ? null : (() => {
      const sideActionNodes = [
      isAuthor && chat.status === "INVITE-ONLY"
        ? form({ method: "POST", action: `/chats/generate-invite` },
            input({ type: "hidden", name: "chatId", value: chat.key }),
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            button({ type: "submit", class: "tribe-action-btn" }, i18n.tribeGenerateInvite)
          )
        : null,
      (() => {
        if (!(isAuthor && chat.status === "INVITE-ONLY")) return null
        const openInvite = safeArr(chat.invites).find(inv => typeof inv === "object" && inv && inv.public === true && inv.code)
        if (openInvite) return [
          div({ class: "tribe-open-invite" },
            span({ class: "card-label" }, i18n.tribeInviteCodeText),
            span({ class: "tribe-open-invite-code" }, openInvite.code),
            renderInviteQrCard({ qrDataUrl: `/qr-invite-code/${encodeURIComponent(openInvite.code)}` })
          ),
          form({ method: "POST", action: `/chats/open-invite/remove` },
            input({ type: "hidden", name: "chatId", value: chat.key }),
            button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.tribeRemoveInvitation)
          )
        ]
        return form({ method: "POST", action: `/chats/open-invite/create` },
          input({ type: "hidden", name: "chatId", value: chat.key }),
          button({ type: "submit", class: "tribe-action-btn" }, i18n.tribeOpenInvitation)
        )
      })(),
      !isAuthor && isMember
        ? form({ method: "POST", action: `/chats/leave/${encodeURIComponent(chat.key)}` },
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.tribeLeaveButton)
          )
        : null
      ].flat().filter(Boolean)
      return sideActionNodes.length ? div({ class: "tribe-side-actions" }, ...sideActionNodes) : null
    })(),
    isAuthor
      ? div({ class: "tribe-side-actions housing-status-row" },
          span({ class: "card-label" }, `${i18n.chatStatusLabel}: `),
          renderStateChip(chat.status === "CLOSED" ? "hidden" : "mutuals", chat.status === "CLOSED" ? "🔒" : "👁", String(chat.status || "OPEN").toUpperCase()),
          chat.status !== "CLOSED"
            ? form({ method: "POST", action: `/chats/close/${encodeURIComponent(chat.key)}`, class: "inline-form" },
                input({ type: "hidden", name: "returnTo", value: returnTo }),
                button({ type: "submit", class: "tribe-action-btn" }, i18n.chatClose)
              )
            : null
        )
      : null,
    !isAuthor ? null : div({ class: "tribe-side-actions owner-actions" },
      form({ method: "GET", action: `/chats/edit/${encodeURIComponent(chat.key)}` },
        button({ type: "submit", class: "tribe-action-btn" }, i18n.chatUpdate)
      ),
      form({ method: "POST", action: `/chats/delete/${encodeURIComponent(chat.key)}` },
        button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.chatDelete)
      )
    ),
    !isMember && chat.status === "INVITE-ONLY"
      ? div({ class: "chat-join-section" },
          a({ class: "tribe-action-btn", href: "/invites#invites-chats" }, i18n.tribeEnterInvite)
        )
      : null,
    !isRestrictedInviteOnly && safeArr(chat.tags).length
      ? div({ class: "tribe-side-tags" },
          safeArr(chat.tags).map(tag => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`))
        )
      : null
  )

  const msgList = safeArr(messages)
  const canWrite = (isMember || chat.status === "OPEN") && chat.status !== "CLOSED"

  const pinnedMsgs = msgList.filter(m => m.pinned).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  const replyMsg = params.reply ? msgList.find(m => String(m.key) === String(params.reply)) : null

  const chatMain = isRestrictedInviteOnly
    ? div({ class: "tribe-main chat-full-width" }, p({ class: "access-denied-msg" }, i18n.chatAccessDenied))
    : div({ class: "tribe-main chat-full-width" },
    msgList.length
      ? div({ class: "chat-jump-row" },
          pinnedMsgs.length
            ? a({ href: `#${anchorIdOf(pinnedMsgs[0].key)}`, class: "filter-btn chat-pinned-link" }, `${i18n.chatPinned} (${pinnedMsgs.length})`)
            : null,
          a({ href: "#chat-latest", class: "filter-btn chat-jump-latest" }, i18n.chatJumpLatest)
        )
      : null,
    div({ class: "chat-messages-list" },
      (() => {
        const visible = msgList
          .filter(msg => (msg.text && String(msg.text).trim()) || msg.image)
          .map(msg => ({ kind: 'message', ts: Date.parse(msg.createdAt) || 0, msg }))
        const pollItems = safeArr(params.polls).map(poll => ({
          kind: 'poll', ts: Date.parse(poll.createdAt) || 0, poll
        }))
        const stream = [...visible, ...pollItems].sort((a, b) => a.ts - b.ts)
        if (!stream.length) return p({ class: "chat-no-messages" }, i18n.chatNoMessages)
        const nodes = []
        let prevDay = null
        stream.forEach((entry, i) => {
          const day = moment(entry.ts).format("YYYY/MM/DD")
          if (day !== prevDay) {
            nodes.push(div({ class: "chat-day-separator" }, span({ class: "chat-day-chip" }, day)))
            prevDay = day
          }
          const last = i === stream.length - 1
          const node = entry.kind === 'poll'
            ? renderChatPoll(entry.poll, chat)
            : renderMessage(entry.msg, chat, { canWrite, isChatAuthor: isAuthor })
          nodes.push(last ? div({ id: "chat-latest", class: "chat-latest-anchor" }, node) : node)
        })
        return nodes
      })()
    ),
    canWrite
      ? div({ id: "chat-message-form", class: "chat-message-form" },
          replyMsg
            ? div({ class: "chat-replying-banner" },
                span({ class: "chat-reply-arrow" }, "↩ "),
                span({ class: "chat-reply-text" }, String(replyMsg.text || "").trim() ? ` ${String(replyMsg.text).trim().slice(0, 120)}` : userLinkLabel(replyMsg.author)),
                a({ href: `/chats/${encodeURIComponent(chat.key)}#chat-message-form`, class: "chat-reply-cancel", title: i18n.chatReplyCancel || "✕" }, "✕")
              )
            : null,
          form({ method: "POST", action: `/chats/${encodeURIComponent(chat.key)}/message`, enctype: "multipart/form-data" },
            input({ type: "hidden", name: "returnTo", value: `/chats/${encodeURIComponent(chat.key)}#chat-latest` }),
            replyMsg ? input({ type: "hidden", name: "replyTo", value: replyMsg.key }) : null,
            textarea({ name: "text", rows: 3, maxlength: "3000", placeholder: i18n.chatMessagePlaceholder }), br(),
            span(i18n.uploadMedia), br(),
            input({ type: "file", name: "image", accept: "image/*,video/*" }), br(), br(),
            button({ type: "submit", class: "filter-btn" }, i18n.chatSendMessage)
          )
        )
      : null,
    canWrite && params.pollsEnabled
      ? details({ class: "chat-poll-form" },
          summary({ class: "chat-poll-summary" }, i18n.pollChatCreate),
          form({ method: "POST", action: `/chats/${encodeURIComponent(chat.key)}/polls/create` },
            input({ type: "hidden", name: "returnTo", value: `/chats/${encodeURIComponent(chat.key)}` }),
            span(i18n.pollQuestion), br(),
            input({ type: "text", name: "question", required: true, maxlength: "300", placeholder: i18n.pollQuestionPlaceholder }), br(), br(),
            span(i18n.pollOptions), br(),
            textarea({ maxlength: "1000", name: "options", rows: 4, required: true, placeholder: i18n.pollOptionsPlaceholder }), br(), br(),
            div({ class: "poll-switch" },
              input({ type: "hidden", name: "anonymous", value: "0" }),
              label(input({ type: "checkbox", name: "anonymous", value: "1" }), " ", i18n.pollAnonymousLabel)
            ),
            div({ class: "poll-switch" },
              input({ type: "hidden", name: "multiple", value: "0" }),
              label(input({ type: "checkbox", name: "multiple", value: "1" }), " ", i18n.pollMultipleLabel)
            ),
            button({ type: "submit", class: "filter-btn" }, i18n.pollPublishButton)
          )
        )
      : null
  )

  if (params.workspace) {
    return template(
      chat.title || i18n.chatUntitled,
      section({ class: "chat-workspace-section" },
        div({ class: "chat-workspace" },
          renderChatTopics(safeArr(params.allChats), chat.rootId || chat.key),
          div({ class: "chat-workspace-main" },
            div({ class: "tribe-details chat-workspace-details" },
              chatSide,
              chatMain
            )
          )
        )
      )
    )
  }

  return template(
    chat.title || i18n.chatUntitled,
    section(
      div({ class: "tags-header module-header-line" },
        h2(i18n.chatsTitle),
        p(i18n.modulesChatsDescription)
      ),
      renderModeButtons(filter || "all")
    ),
    section(
      div({ class: "tribe-details" },
        chatSide,
        chatMain
      )
    )
  )
}
