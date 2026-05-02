const { div, h2, p, section, button, form, a, span, textarea, br, input, label, select, option, img, table, tr, td, ul, li } = require("../server/node_modules/hyperaxe")
const { template, i18n } = require("./main_views")
const moment = require("../server/node_modules/moment")
const { config } = require("../server/SSB_server.js")
const { renderUrl } = require("../backend/renderUrl")

const userId = config.keys.id
const safeArr = (v) => (Array.isArray(v) ? v : [])
const safeText = (v) => String(v || "").trim()

const CAT_BLOCK1 = ["GENERAL", "OASIS", "L.A.R.P.", "POLITICS", "TECH"]
const CAT_BLOCK2 = ["SCIENCE", "MUSIC", "ART", "GAMING", "BOOKS", "FILMS"]
const CAT_BLOCK3 = ["PHILOSOPHY", "SOCIETY", "PRIVACY", "CYBERWARFARE", "SURVIVALISM"]
const ALL_CATS = [...CAT_BLOCK1, ...CAT_BLOCK2, ...CAT_BLOCK3]

const catKey = (c) => "forumCat" + String(c || "").replace(/\./g, "").replace(/[\s-]/g, "").toUpperCase()
const catLabel = (c) => i18n[catKey(c)] || c

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

const renderChatCard = (chat, filter, params = {}) => {
  const statusLabel = chat.status === "CLOSED" ? i18n.chatStatusClosed :
    chat.status === "INVITE-ONLY" ? i18n.chatStatusInviteOnly : i18n.chatStatusOpen

  return div({ class: "tribe-card" },
    div({ class: "tribe-card-image-wrapper" },
      a({ href: `/chats/${encodeURIComponent(chat.key)}` },
        renderMediaBlob(chat.image, "/assets/images/default-avatar.png", { class: "tribe-card-hero-image" })
      )
    ),
    div({ class: "tribe-card-body" },
      h2({ class: "tribe-card-title" },
        a({ href: `/chats/${encodeURIComponent(chat.key)}` }, "\uD83D\uDD12 " + (chat.title || i18n.chatUntitled))
      ),
      chat.description ? p({ class: "tribe-card-description" }, chat.description) : null,
      br(),
      table({ class: "tribe-info-table" },
        tr(
          td({ class: "tribe-info-label" }, i18n.chatStatus),
          td({ class: "tribe-info-value", colspan: "3" }, statusLabel)
        )
      ),
      div({ class: "tribe-card-members" },
        span({ class: "tribe-members-count" }, `${i18n.chatParticipants}: ${safeArr(chat.members).length}`)
      ),
      div({ class: "visit-btn-centered" },
        a({ href: `/chats/${encodeURIComponent(chat.key)}`, class: "filter-btn" }, i18n.chatVisitChat)
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
      input({ type: "text", name: "title", required: true, placeholder: i18n.chatTitlePlaceholder, value: chat.title || "" }), br(), br(),
      span(i18n.chatDescription), br(),
      textarea({ name: "description", rows: 4, placeholder: i18n.chatDescriptionPlaceholder }, chat.description || ""), br(), br(),
      span(i18n.chatImageLabel || "Select an image file (.jpeg, .jpg, .png, .gif)"), br(),
      input({ type: "file", name: "image", accept: "image/*" }), br(), br(),
      span(i18n.chatCategory), br(),
      select({ name: "category" },
        option({ value: "" }, "\u2014"),
        ALL_CATS.map(cat =>
          option({ value: cat, ...(chat.category === cat ? { selected: true } : {}) }, catLabel(cat))
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

const renderMessage = (msg, chatAuthor) => {
  const isAuthor = String(msg.author) === String(chatAuthor)
  const isSelf = String(msg.author) === String(userId)
  const dateStr = moment(msg.createdAt).format("YYYY/MM/DD HH:mm")
  const shortId = msg.author ? "@" + msg.author.slice(1, 9) + "\u2026" : "?"
  const authorLink = msg.author
    ? a({ href: `/author/${encodeURIComponent(msg.author)}`, class: "user-link" }, shortId)
    : span("?")

  const imageNode = msg.image ? renderMediaBlob(msg.image, null, { class: "chat-message-image" }) : null

  return div({ class: isSelf ? "chat-message chat-message-self" : isAuthor ? "chat-message chat-message-author" : "chat-message" },
    div({ class: "chat-message-meta" },
      span({ class: "chat-message-sender" }, authorLink),
      span({ class: "chat-message-date" }, ` [ ${dateStr} ]`)
    ),
    imageNode ? div({ class: "chat-message-image-wrap" }, imageNode) : null,
    renderMessageText(msg.text || "")
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

  const chatHeaderMap = {
    all: i18n.chatsTitle,
    mine: i18n.chatMineSectionTitle || "Your Chats",
    recent: i18n.chatRecentTitle || "Recent Chats",
    favorites: i18n.chatFavoritesTitle || "Favorites",
    open: i18n.chatOpenTitle || "Open Chats",
    closed: i18n.chatClosedTitle || "Closed Chats"
  }
  const headerText = chatHeaderMap[filter] || i18n.chatsTitle

  return template(
    i18n.chatsTitle,
    section(
      div({ class: "tags-header" },
        h2(headerText),
        p(i18n.modulesChatsDescription)
      )
    ),
    section(renderModeButtons(filter)),
    !isForm
      ? section(
          div({ class: "filters" },
            form({ method: "GET", action: "/chats" },
              input({ type: "hidden", name: "filter", value: filter }),
              input({ type: "text", name: "q", placeholder: i18n.chatSearchPlaceholder, value: q }),
              br(),
              button({ type: "submit" }, i18n.search),
              br()
            )
          )
        )
      : null,
    section(
      isForm
        ? renderChatForm(filter, filter === "edit" ? (chatToEdit || {}) : {}, params)
        : div({ class: "tribe-grid" },
            list.length
              ? list.map(chat => renderChatCard(chat, filter, { q }))
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
  const fullShareUrl = `/chats/${encodeURIComponent(chat.key)}`
  const isRestrictedInviteOnly = !isMember && !isAuthor && chat.status === "INVITE-ONLY"

  const statusLabel = chat.status === "CLOSED" ? i18n.chatStatusClosed :
    chat.status === "INVITE-ONLY" ? i18n.chatStatusInviteOnly : i18n.chatStatusOpen

  const chatSide = div({ class: "tribe-side" },
    h2("\uD83D\uDD12 " + (chat.title || i18n.chatUntitled)),
    renderMediaBlob(chat.image, "/assets/images/default-avatar.png", { class: "tribe-detail-image" }),
    div({ class: "shop-share" },
      span({ class: "tribe-info-label" }, `${i18n.chatShareUrl}: `),
      input({ type: "text", value: fullShareUrl, readonly: true, class: "shop-share-input" })
    ),
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.chatParticipants}: ${safeArr(chat.members).length}`)
    ),
    table({ class: "tribe-info-table" },
      tr(
        td({ class: "tribe-info-label" }, i18n.chatCreatedAt),
        td({ class: "tribe-info-value", colspan: "3" }, moment(chat.createdAt).format("YYYY/MM/DD HH:mm"))
      ),
      isRestrictedInviteOnly ? null : tr(
        td({ class: "tribe-info-value", colspan: "4" },
          a({ href: `/author/${encodeURIComponent(chat.author)}`, class: "user-link" }, chat.author)
        )
      ),
      tr(
        td({ class: "tribe-info-label" }, i18n.chatStatus),
        td({ class: "tribe-info-value", colspan: "3" }, statusLabel)
      ),
      !isRestrictedInviteOnly && chat.category ? tr(
        td({ class: "tribe-info-label" }, i18n.chatCategoryLabel),
        td({ class: "tribe-info-value", colspan: "3" }, catLabel(chat.category))
      ) : null
    ),
    isRestrictedInviteOnly ? null : div({ class: "tribe-side-actions" },
      isAuthor && chat.status === "INVITE-ONLY"
        ? form({ method: "POST", action: `/chats/generate-invite` },
            input({ type: "hidden", name: "chatId", value: chat.key }),
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            button({ type: "submit", class: "tribe-action-btn" }, i18n.chatGenerateCode)
          )
        : null,
      form(
        { method: "POST", action: chat.isFavorite ? `/chats/favorites/remove/${encodeURIComponent(chat.key)}` : `/chats/favorites/add/${encodeURIComponent(chat.key)}` },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        button({ type: "submit", class: "tribe-action-btn" }, chat.isFavorite ? i18n.chatRemoveFavorite : i18n.chatAddFavorite)
      ),
      chat.author && String(chat.author) !== String(userId)
        ? form({ method: "GET", action: "/pm" },
            input({ type: "hidden", name: "recipients", value: chat.author }),
            button({ type: "submit", class: "tribe-action-btn" }, i18n.chatPM || i18n.privateMessage)
          )
        : null,
      isAuthor
        ? form({ method: "GET", action: `/chats/edit/${encodeURIComponent(chat.key)}` },
            button({ type: "submit", class: "tribe-action-btn" }, i18n.chatUpdate)
          )
        : null,
      isAuthor && chat.status !== "CLOSED"
        ? form({ method: "POST", action: `/chats/close/${encodeURIComponent(chat.key)}` },
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            button({ type: "submit", class: "tribe-action-btn" }, i18n.chatClose)
          )
        : null,
      isAuthor
        ? form({ method: "POST", action: `/chats/delete/${encodeURIComponent(chat.key)}` },
            button({ type: "submit", class: "tribe-action-btn" }, i18n.chatDelete)
          )
        : null,
      !isAuthor && isMember
        ? form({ method: "POST", action: `/chats/leave/${encodeURIComponent(chat.key)}` },
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            button({ type: "submit", class: "tribe-action-btn" }, i18n.chatLeave)
          )
        : null
    ),
    !isMember && chat.status === "INVITE-ONLY"
      ? div({ class: "chat-join-section" },
          div({ class: "chat-invite-form" },
            form({ method: "POST", action: "/chats/join-code" },
              input({ type: "hidden", name: "returnTo", value: `/chats/${encodeURIComponent(chat.key)}` }),
              label(i18n.chatInviteCodeLabel), br(),
              input({ type: "text", name: "code", required: true, placeholder: i18n.chatInviteCode }), br(), br(),
              button({ type: "submit", class: "filter-btn" }, i18n.chatJoinByInvite)
            )
          )
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

  const chatMain = isRestrictedInviteOnly
    ? div({ class: "tribe-main chat-full-width" }, p({ class: "access-denied-msg" }, i18n.chatAccessDenied))
    : div({ class: "tribe-main chat-full-width" },
    canWrite
      ? div({ class: "chat-message-form" },
          form({ method: "POST", action: `/chats/${encodeURIComponent(chat.key)}/message`, enctype: "multipart/form-data" },
            input({ type: "hidden", name: "returnTo", value: `/chats/${encodeURIComponent(chat.key)}` }),
            textarea({ name: "text", rows: 3, placeholder: i18n.chatMessagePlaceholder }), br(),
            span(i18n.chatImageLabel || "Select an image file (.jpeg, .jpg, .png, .gif)"), br(),
            input({ type: "file", name: "image", accept: "image/*" }), br(), br(),
            button({ type: "submit", class: "filter-btn" }, i18n.chatSendMessage)
          )
        )
      : null,
    div({ class: "chat-messages-list" },
      msgList.length
        ? msgList.map(msg => renderMessage(msg, chat.author))
        : p({ class: "chat-no-messages" }, i18n.chatNoMessages)
    )
  )

  return template(
    chat.title || i18n.chatUntitled,
    section(
      div({ class: "tags-header" },
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
