const { div, h2, p, section, button, form, a, span, textarea, br, input, label, select, option, img, table, tr, th, td, progress } = require("../server/node_modules/hyperaxe")
const { template, i18n } = require("./main_views")
const moment = require("../server/node_modules/moment")
const { config } = require("../server/SSB_server.js")
const { renderUrl } = require("../backend/renderUrl")

const userId = config.keys.id

const parseBidEntry = (raw) => {
  const s = String(raw || "").trim()
  if (!s) return null

  if (s.includes("|")) {
    const parts = s.split("|")
    if (parts.length < 3) return null
    const bidder = parts[0] || ""
    const amount = parseFloat(String(parts[1] || "").replace(",", "."))
    const time = parts.slice(2).join("|")
    if (!bidder || !Number.isFinite(amount) || !time) return null
    return { bidder, amount, time }
  }

  const first = s.indexOf(":")
  const second = s.indexOf(":", first + 1)
  if (first === -1 || second === -1) return null

  const bidder = s.slice(0, first)
  const amountStr = s.slice(first + 1, second)
  const time = s.slice(second + 1)
  const amount = parseFloat(String(amountStr || "").replace(",", "."))
  if (!bidder || !Number.isFinite(amount) || !time) return null
  return { bidder, amount, time }
}

const toNum = (v) => {
  if (v === null || v === undefined) return NaN
  const n = parseFloat(String(v).replace(",", "."))
  return Number.isFinite(n) ? n : NaN
}

const normalizeQ = (q) => String(q || "").trim().toLowerCase()

const matchesQuery = (item, q) => {
  const qq = normalizeQ(q)
  if (!qq) return true
  const title = String(item.title || "").toLowerCase()
  const tags = Array.isArray(item.tags) ? item.tags : []
  const tagStr = tags.map((t) => String(t || "").toLowerCase()).join(" ")
  return title.includes(qq) || tagStr.includes(qq)
}

const withinPrice = (item, minP, maxP) => {
  const p = toNum(item.price)
  if (!Number.isFinite(p)) return false
  if (Number.isFinite(minP) && p < minP) return false
  if (Number.isFinite(maxP) && p > maxP) return false
  return true
}

const sortItems = (items, sort) => {
  const s = String(sort || "recent")
  if (s === "price") return items.slice().sort((a, b) => toNum(a.price) - toNum(b.price))
  if (s === "deadline") {
    return items.slice().sort((a, b) => {
      const ad = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY
      const bd = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY
      return ad - bd
    })
  }
  return items.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

const buildReturnTo = (filter, q, minPrice, maxPrice, sort) => {
  const params = []
  if (filter) params.push(`filter=${encodeURIComponent(filter)}`)
  if (q) params.push(`q=${encodeURIComponent(q)}`)
  if (minPrice !== undefined && minPrice !== null && String(minPrice) !== "") params.push(`minPrice=${encodeURIComponent(String(minPrice))}`)
  if (maxPrice !== undefined && maxPrice !== null && String(maxPrice) !== "") params.push(`maxPrice=${encodeURIComponent(String(maxPrice))}`)
  if (sort) params.push(`sort=${encodeURIComponent(sort)}`)
  return `/market${params.length ? `?${params.join("&")}` : ""}`
}

const renderCardField = (labelText, value = "") =>
  div({ class: "card-field" }, span({ class: "card-label" }, labelText), span({ class: "card-value" }, ...renderUrl(String(value))))

const renderCardFieldRich = (labelText, parts) =>
  div({ class: "card-field" }, span({ class: "card-label" }, labelText), span({ class: "card-value" }, ...(Array.isArray(parts) ? parts : [parts])))

const renderPmButton = (recipientId) =>
  recipientId && String(recipientId) !== String(userId)
    ? form({ method: "GET", action: "/pm" }, input({ type: "hidden", name: "recipients", value: recipientId }), button({ type: "submit", class: "filter-btn" }, i18n.privateMessage))
    : null

const renderStockBar = (stockValue, maxValue) => {
  const s = Math.max(0, Number(stockValue || 0))
  const m = Math.max(1, Number(maxValue || s || 1))
  return div(
    { class: "confirmations-block stock-block" },
    div(
      { class: "card-field" },
      span({ class: "card-label" }, `${i18n.marketItemStock}: `),
      span({ class: "card-value" }, s > 0 ? `${s}/${m}` : i18n.marketOutOfStock)
    ),
    progress({ class: "confirmations-progress stock-progress", value: Math.min(s, m), max: m })
  )
}

const renderMarketCommentsSection = (itemId, returnTo, comments = []) => {
  const commentsCount = Array.isArray(comments) ? comments.length : 0

  return div(
    { class: "vote-comments-section market-comments" },
    div({ class: "comments-count" }, span({ class: "card-label" }, i18n.voteCommentsLabel + ": "), span({ class: "card-value" }, String(commentsCount))),
    div(
      { class: "comment-form-wrapper" },
      h2({ class: "comment-form-title" }, i18n.voteNewCommentLabel),
      form(
        { method: "POST", action: `/market/${encodeURIComponent(itemId)}/comments`, class: "comment-form" },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        textarea({ id: "comment-text", name: "text", required: true, rows: 4, class: "comment-textarea", placeholder: i18n.voteNewCommentPlaceholder }),
        br(),
        button({ type: "submit", class: "comment-submit-btn" }, i18n.voteNewCommentButton)
      )
    ),
    comments && comments.length
      ? div(
          { class: "comments-list" },
          comments.map((c) => {
            const author = c.value && c.value.author ? c.value.author : ""
            const ts = c.value && c.value.timestamp ? c.value.timestamp : c.timestamp
            const absDate = ts ? moment(ts).format("YYYY/MM/DD HH:mm:ss") : ""
            const relDate = ts ? moment(ts).fromNow() : ""
            const userName = author && author.includes("@") ? author.split("@")[1] : author
            const rootId = c.value && c.value.content ? c.value.content.fork || c.value.content.root : null
            const text = c.value && c.value.content && c.value.content.text ? c.value.content.text : ""

            return div(
              { class: "votations-comment-card" },
              span(
                { class: "created-at" },
                span(i18n.createdBy),
                author ? a({ href: `/author/${encodeURIComponent(author)}` }, `@${userName}`) : span("(unknown)"),
                absDate ? span(" | ") : "",
                absDate ? span({ class: "votations-comment-date" }, absDate) : "",
                relDate ? span({ class: "votations-comment-date" }, " | ", i18n.sendTime) : "",
                relDate && rootId ? a({ href: `/thread/${encodeURIComponent(rootId)}#${encodeURIComponent(c.key)}` }, relDate) : ""
              ),
              p({ class: "votations-comment-text" }, ...renderUrl(text))
            )
          })
        )
      : p({ class: "votations-no-comments" }, i18n.voteNoCommentsYet)
  )
}

const isMyBidItem = (item) => {
  const polls = Array.isArray(item.auctions_poll) ? item.auctions_poll : []
  for (const x of polls) {
    const b = parseBidEntry(x)
    if (b && b.bidder === userId) return true
  }
  return false
}

const auctionCountdownParts = (deadline) => {
  if (!deadline) return null
  const dl = moment(deadline)
  if (!dl.isValid()) return null
  const now = moment()
  const rel = dl.fromNow()
  if (dl.isAfter(now)) return { label: i18n.marketAuctionEndsIn, rel }
  return { label: i18n.marketAuctionEnded, rel }
}

const renderCountdownField = (item) => {
  const cd = item && (item.item_type === "auction" || item.item_type === "exchange") ? auctionCountdownParts(item.deadline) : null
  if (!cd) return null
  return renderCardFieldRich(`${cd.label}:`, [span({ class: "countdown-strong" }, cd.rel)])
}

const normStatus = (s) => String(s || "").toUpperCase().replace(/_/g, " ").replace(/\s+/g, " ").trim()

const renderMarketOwnerActions = (item, returnTo) => {
  const polls = Array.isArray(item.auctions_poll) ? item.auctions_poll : []
  const canUpdate = item.status !== "SOLD" && item.status !== "DISCARDED" && polls.length === 0
  const cur = normStatus(item.status || "FOR SALE")
  const canChange = cur !== "SOLD" && cur !== "DISCARDED"
  const out = []
  if (canUpdate) {
    out.push(
      form(
        { method: "GET", action: `/market/edit/${encodeURIComponent(item.id)}` },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        button({ class: "update-btn", type: "submit" }, i18n.marketActionsUpdate)
      )
    )
  }
  out.push(
    form(
      { method: "POST", action: `/market/delete/${encodeURIComponent(item.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "delete-btn", type: "submit" }, i18n.marketActionsDelete)
    )
  )
  if (canChange) {
    out.push(
      form(
        { method: "POST", action: `/market/status/${encodeURIComponent(item.id)}`, class: "project-control-form project-control-form--status" },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        select(
          { name: "status", class: "project-control-select" },
          option({ value: "FOR SALE", selected: cur === "FOR SALE" }, i18n.marketFilterForSale),
          option({ value: "SOLD", selected: cur === "SOLD" }, i18n.marketFilterSold),
          option({ value: "DISCARDED", selected: cur === "DISCARDED" }, i18n.marketFilterDiscarded)
        ),
        button({ class: "status-btn project-control-btn", type: "submit" }, i18n.marketActionsChangeStatus)
      )
    )
  }
  return out
}

const renderMarketTopbar = (item, returnTo) => {
  const left = [renderPmButton(item && item.seller)].filter(Boolean)
  const right = item && String(item.seller) === String(userId) ? renderMarketOwnerActions(item, returnTo) : []
  const leftNode = left.length ? div({ class: "bookmark-topbar-left transfer-topbar-left" }, ...left) : null
  const rightNode = right.length ? div({ class: "bookmark-actions transfer-actions" }, ...right) : null
  const children = []
  if (leftNode) children.push(leftNode)
  if (rightNode) children.push(rightNode)
  return children.length ? div({ class: "bookmark-topbar transfer-topbar-single" }, ...children) : null
}

exports.marketView = async (items, filter, itemToEdit = null, params = {}) => {
  const list = Array.isArray(items) ? items : []
  const q = params.q || ""
  const minPrice = params.minPrice
  const maxPrice = params.maxPrice
  const sort = params.sort || "recent"

  let title = i18n.marketAllSectionTitle
  switch (filter) {
    case "mine":
      title = i18n.marketMineSectionTitle
      break
    case "create":
      title = i18n.marketCreateSectionTitle
      break
    case "edit":
      title = i18n.marketUpdateSectionTitle
      break
    case "mybids":
      title = i18n.marketFilterMyBids
      break
  }

  let filtered = []
  switch (filter) {
    case "all":
      filtered = list
      break
    case "mine":
      filtered = list.filter((e) => e.seller === userId)
      break
    case "exchange":
      filtered = list.filter((e) => e.item_type === "exchange" && e.status === "FOR SALE")
      break
    case "auctions":
      filtered = list.filter((e) => e.item_type === "auction" && e.status === "FOR SALE")
      break
    case "new":
      filtered = list.filter((e) => e.item_status === "NEW" && e.status === "FOR SALE")
      break
    case "used":
      filtered = list.filter((e) => e.item_status === "USED" && e.status === "FOR SALE")
      break
    case "broken":
      filtered = list.filter((e) => e.item_status === "BROKEN" && e.status === "FOR SALE")
      break
    case "for sale":
      filtered = list.filter((e) => e.status === "FOR SALE")
      break
    case "sold":
      filtered = list.filter((e) => e.status === "SOLD")
      break
    case "discarded":
      filtered = list.filter((e) => e.status === "DISCARDED")
      break
    case "recent": {
      const oneDayAgo = moment().subtract(1, "days").toISOString()
      filtered = list.filter((e) => e.status === "FOR SALE" && String(e.createdAt || "") >= oneDayAgo)
      break
    }
    case "mybids":
      filtered = list.filter((e) => String(e.item_type || "").toLowerCase() === "auction").filter(isMyBidItem)
      break
    default:
      filtered = list
      break
  }

  const minP = toNum(minPrice)
  const maxP = toNum(maxPrice)
  filtered = filtered.filter((it) => matchesQuery(it, q)).filter((it) => withinPrice(it, minP, maxP))
  filtered = sortItems(filtered, sort)

  const returnTo = buildReturnTo(filter, q, minPrice, maxPrice, sort)
  const itemEdit = itemToEdit || {}

  const hiddenCtx = [
    input({ type: "hidden", name: "q", value: q }),
    input({ type: "hidden", name: "minPrice", value: minPrice ?? "" }),
    input({ type: "hidden", name: "maxPrice", value: maxPrice ?? "" }),
    input({ type: "hidden", name: "sort", value: sort })
  ]

  const isFormMode = filter === "create" || filter === "edit"

  return template(
    title,
    section(
      div({ class: "tags-header" }, h2(i18n.marketTitle), p(i18n.marketDescription)),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/market", class: "ui-toolbar ui-toolbar--filters" },
          ...hiddenCtx,
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterMine),
          button({ type: "submit", name: "filter", value: "exchange", class: filter === "exchange" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterItems),
          button({ type: "submit", name: "filter", value: "auctions", class: filter === "auctions" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterAuctions),
          button({ type: "submit", name: "filter", value: "mybids", class: filter === "mybids" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterMyBids),
          button({ type: "submit", name: "filter", value: "new", class: filter === "new" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterNew),
          button({ type: "submit", name: "filter", value: "used", class: filter === "used" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterUsed),
          button({ type: "submit", name: "filter", value: "broken", class: filter === "broken" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterBroken),
          button({ type: "submit", name: "filter", value: "for sale", class: filter === "for sale" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterForSale),
          button({ type: "submit", name: "filter", value: "sold", class: filter === "sold" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterSold),
          button({ type: "submit", name: "filter", value: "discarded", class: filter === "discarded" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterDiscarded),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterRecent),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.marketCreateButton)
        )
      ),
      !isFormMode
        ? div(
            { class: "market-search" },
            form(
              { method: "GET", action: "/market", class: "filter-box" },
              input({ type: "hidden", name: "filter", value: filter || "all" }),
              input({ type: "text", name: "q", value: q, placeholder: i18n.marketSearchPlaceholder, class: "filter-box__input" }),
              div(
                { class: "filter-box__controls" },
                div(
                  { class: "transfer-range" },
                  input({
                    type: "number",
                    name: "minPrice",
                    step: "0.000001",
                    min: "0",
                    value: String(minPrice ?? ""),
                    placeholder: i18n.marketMinPriceLabel,
                    class: "filter-box__number transfer-amount-input"
                  }),
                  input({
                    type: "number",
                    name: "maxPrice",
                    step: "0.000001",
                    min: "0",
                    value: String(maxPrice ?? ""),
                    placeholder: i18n.marketMaxPriceLabel,
                    class: "filter-box__number transfer-amount-input"
                  })
                ),
                select(
                  { name: "sort", class: "filter-box__select" },
                  option({ value: "recent", selected: sort === "recent" }, i18n.marketSortRecent),
                  option({ value: "price", selected: sort === "price" }, i18n.marketSortPrice),
                  option({ value: "deadline", selected: sort === "deadline" }, i18n.marketSortDeadline)
                ),
                button({ type: "submit", class: "filter-box__button" }, i18n.marketSearchButton)
              )
            )
          )
        : null
    ),
    section(
      isFormMode
        ? div(
            { class: "market-form" },
            form(
              { action: filter === "edit" ? `/market/update/${encodeURIComponent(itemEdit.id)}` : "/market/create", method: "POST", enctype: "multipart/form-data" },
              input({ type: "hidden", name: "returnTo", value: "/market?filter=mine" }),
              label(i18n.marketItemType),
              br(),
              select(
                { name: "item_type", id: "item_type", required: true },
                option({ value: "auction", selected: itemEdit && itemEdit.item_type === "auction" }, "Auction"),
                option({ value: "exchange", selected: itemEdit && itemEdit.item_type === "exchange" }, "Exchange")
              ),
              br(),
              br(),
              label(i18n.marketItemTitle),
              br(),
              input({ type: "text", name: "title", id: "title", value: (itemEdit && itemEdit.title) || "", required: true }),
              br(),
              br(),
              label(i18n.marketItemDescription),
              br(),
              textarea({ name: "description", id: "description", placeholder: i18n.marketItemDescriptionPlaceholder, rows: "6", required: true }, (itemEdit && itemEdit.description) || ""),
              br(),
              br(),
              label(i18n.marketCreateFormImageLabel),
              br(),
              input({ type: "file", name: "image", id: "image", accept: "image/*" }),
              br(),
              br(),
              label(i18n.marketItemStatus),
              br(),
              select(
                { name: "item_status", id: "item_status" },
                option({ value: "BROKEN", selected: itemEdit && itemEdit.item_status === "BROKEN" }, "BROKEN"),
                option({ value: "USED", selected: itemEdit && itemEdit.item_status === "USED" }, "USED"),
                option({ value: "NEW", selected: itemEdit && itemEdit.item_status === "NEW" }, "NEW")
              ),
              br(),
              br(),
              label(i18n.marketItemStock),
              br(),
              input({ type: "number", name: "stock", id: "stock", value: (itemEdit && itemEdit.stock) || 1, required: true, min: "1", step: "1" }),
              br(),
              br(),
              label(i18n.marketItemPrice),
              br(),
              input({ type: "number", name: "price", id: "price", value: (itemEdit && itemEdit.price) || "", required: true, step: "0.000001", min: "0.000001" }),
              br(),
              br(),
              label(i18n.marketItemTags),
              br(),
              input({ type: "text", name: "tags", id: "tags", placeholder: i18n.marketItemTagsPlaceholder, value: (itemEdit && itemEdit.tags && itemEdit.tags.join(", ")) || "" }),
              br(),
              br(),
              label(i18n.marketItemDeadline),
              br(),
              input({
                type: "datetime-local",
                name: "deadline",
                id: "deadline",
                required: true,
                min: moment().format("YYYY-MM-DDTHH:mm"),
                value: itemEdit && itemEdit.deadline ? moment(itemEdit.deadline).format("YYYY-MM-DDTHH:mm") : ""
              }),
              br(),
              br(),
              input({ type: "hidden", name: "includesShipping", value: "0" }),
              label(i18n.marketItemIncludesShipping),
              br(),
              input({
                id: "includesShipping-checkbox",
                type: "checkbox",
                name: "includesShipping",
                value: "1",
                class: "meme-checkbox",
                ...(itemEdit && itemEdit.includesShipping ? { checked: true } : {})
              }),
              br(),
              br(),
              button({ type: "submit" }, filter === "edit" ? i18n.marketUpdateButton : i18n.marketCreateButton)
            )
          )
        : div(
            { class: "market-grid" },
            filtered.length > 0
              ? filtered.map((item) => {
                  const polls = Array.isArray(item.auctions_poll) ? item.auctions_poll : []
                  const parsedBids = polls.map(parseBidEntry).filter(Boolean).sort((a, b) => new Date(b.time) - new Date(a.time))
                  const myBid = item.item_type === "auction" ? parsedBids.some((b) => b.bidder === userId) : false
                  const maxStock = item.initialStock || item.stockMax || item.stock || 1
                  const stockLeft = Number(item.stock || 0)
                  const isOwner = String(item.seller) === String(userId)

                  const actionNodesRaw = isOwner
                    ? renderMarketOwnerActions(item, "/market?filter=mine")
                    : [
                        item.status !== "SOLD" && item.status !== "DISCARDED" && item.item_type === "auction"
                          ? form(
                              { method: "POST", action: `/market/bid/${encodeURIComponent(item.id)}` },
                              input({ type: "hidden", name: "returnTo", value: returnTo }),
                              input({ type: "number", name: "bidAmount", step: "0.000001", min: "0.000001", placeholder: i18n.marketYourBid, required: true }),
                              br(),
                              button({ class: "buy-btn", type: "submit" }, i18n.marketPlaceBidButton)
                            )
                          : null,
                        item.status === "FOR SALE" && item.item_type !== "auction" && !isOwner && stockLeft > 0
                          ? form(
                              { method: "POST", action: `/market/buy/${encodeURIComponent(item.id)}` },
                              input({ type: "hidden", name: "returnTo", value: "/inbox?filter=sent" }),
                              input({ type: "hidden", name: "buyerId", value: userId }),
                              button({ class: "buy-btn", type: "submit" }, i18n.marketActionsBuy)
                            )
                          : null
                      ].filter(Boolean)

                  const actionNodes = Array.isArray(actionNodesRaw) ? actionNodesRaw.filter(Boolean) : []
                  const buttonsBlock =
                    actionNodes.length > 0
                      ? div(
                          { class: "market-card buttons" },
                          div({ style: "display:flex;gap:8px;flex-wrap:wrap;align-items:center;" }, ...actionNodes)
                        )
                      : stockLeft <= 0
                        ? div(
                            { class: "market-card buttons" },
                            div({ class: "card-field" }, span({ class: "card-value" }, i18n.marketOutOfStock))
                          )
                        : null

                  return div(
                    { class: "market-item" },
                    div(
                      { class: "market-card left-col" },
                      div(
                        { style: "display:flex;gap:8px;flex-wrap:wrap;align-items:center;" },
                        form(
                          { method: "GET", action: `/market/${encodeURIComponent(item.id)}` },
                          input({ type: "hidden", name: "returnTo", value: returnTo }),
                          input({ type: "hidden", name: "filter", value: filter || "all" }),
                          input({ type: "hidden", name: "q", value: q }),
                          input({ type: "hidden", name: "minPrice", value: String(minPrice ?? "") }),
                          input({ type: "hidden", name: "maxPrice", value: String(maxPrice ?? "") }),
                          input({ type: "hidden", name: "sort", value: sort }),
                          button({ class: "filter-btn", type: "submit" }, i18n.viewDetails)
                        ),
                        renderPmButton(item.seller),
                        myBid ? span({ class: "chip chip-you" }, i18n.marketMyBidBadge) : null
                      ),
                      h2({ class: "market-card type" }, `${i18n.marketItemType}: ${String(item.item_type || "").toUpperCase()}`),
                      h2(item.title),
                      renderCardField(`${i18n.marketItemStatus}:`, item.status),
                      renderCountdownField(item),
                      item.deadline ? renderCardField(`${i18n.marketItemAvailable}:`, moment(item.deadline).format("YYYY/MM/DD HH:mm:ss")) : null,
                      br(),
                      br(),
                      div(
                        { class: "market-card image" },
                        item.image ? img({ src: `/blob/${encodeURIComponent(item.image)}` }) : img({ src: "/assets/images/default-market.png", alt: item.title })
                      ),
                      p(...renderUrl(item.description)),
                      item.tags && item.tags.filter(Boolean).length
                        ? div(
                            { class: "card-tags" },
                            item.tags
                              .filter(Boolean)
                              .map((tag) => a({ class: "tag-link", href: `/search?query=%23${encodeURIComponent(tag)}` }, `#${tag}`))
                          )
                        : null
                    ),
                    div(
                      { class: "market-card right-col" },
                      div({ class: "market-card price" }, renderCardField(`${i18n.marketItemPrice}:`, `${item.price} ECO`)),
                      renderCardField(`${i18n.marketItemCondition}:`, item.item_status),
                      renderCardField(`${i18n.marketItemIncludesShipping}:`, item.includesShipping ? i18n.YESLabel : i18n.NOLabel),
                      br(),
                      renderStockBar(item.stock, maxStock),
                      item.item_type === "auction" && parsedBids.length > 0
                        ? div(
                            { class: "auction-info" },
                            p({ class: "auction-bid-text" }, i18n.marketAuctionBids),
                            table(
                              { class: "auction-bid-table" },
                              tr(th(i18n.marketAuctionBidTime), th(i18n.marketAuctionUser), th(i18n.marketAuctionBidAmount)),
                              parsedBids.map((bid) =>
                                tr(
                                  td(moment(bid.time).format("YYYY-MM-DD HH:mm:ss")),
                                  td(a({ href: `/author/${encodeURIComponent(bid.bidder)}` }, bid.bidder)),
                                  td(`${parseFloat(bid.amount).toFixed(6)} ECO`)
                                )
                              )
                            )
                          )
                        : null,
                      br(),
                      br(),
                      div(
                        { class: "card-comments-summary" },
                        span({ class: "card-label" }, i18n.voteCommentsLabel + ":"),
                        span({ class: "card-value" }, String(item.commentCount || 0)),
                        br(),
                        br(),
                        form(
                          { method: "GET", action: `/market/${encodeURIComponent(item.id)}` },
                          input({ type: "hidden", name: "returnTo", value: returnTo }),
                          input({ type: "hidden", name: "filter", value: filter || "all" }),
                          input({ type: "hidden", name: "q", value: q }),
                          input({ type: "hidden", name: "minPrice", value: String(minPrice ?? "") }),
                          input({ type: "hidden", name: "maxPrice", value: String(maxPrice ?? "") }),
                          input({ type: "hidden", name: "sort", value: sort }),
                          button({ type: "submit", class: "filter-btn" }, i18n.voteCommentsForumButton)
                        )
                      ),
                      buttonsBlock
                    )
                  )
                })
              : p(i18n.marketNoItemsMatch || i18n.marketNoItems)
          )
    )
  )
}

exports.singleMarketView = async (item, filter, comments = [], params = {}) => {
  const polls = Array.isArray(item.auctions_poll) ? item.auctions_poll : []
  const parsedBids = polls.map(parseBidEntry).filter(Boolean).sort((a, b) => new Date(b.time) - new Date(a.time))
  const q = params.q || ""
  const minPrice = params.minPrice
  const maxPrice = params.maxPrice
  const sort = params.sort || "recent"
  const returnTo = params.returnTo || buildReturnTo(filter, q, minPrice, maxPrice, sort)
  const topbar = renderMarketTopbar(item, returnTo)
  const stockLeft = Number(item.stock || 0)
  const showBuy = item.status === "FOR SALE" && item.item_type !== "auction" && String(item.seller) !== String(userId) && stockLeft > 0
  const maxStock = item.initialStock || item.stockMax || item.stock || 1

  return template(
    item.title,
    section(
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/market", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "minPrice", value: minPrice ?? "" }),
          input({ type: "hidden", name: "maxPrice", value: maxPrice ?? "" }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterMine),
          button({ type: "submit", name: "filter", value: "exchange", class: filter === "exchange" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterItems),
          button({ type: "submit", name: "filter", value: "auctions", class: filter === "auctions" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterAuctions),
          button({ type: "submit", name: "filter", value: "mybids", class: filter === "mybids" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterMyBids),
          button({ type: "submit", name: "filter", value: "new", class: filter === "new" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterNew),
          button({ type: "submit", name: "filter", value: "used", class: filter === "used" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterUsed),
          button({ type: "submit", name: "filter", value: "broken", class: filter === "broken" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterBroken),
          button({ type: "submit", name: "filter", value: "for sale", class: filter === "for sale" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterForSale),
          button({ type: "submit", name: "filter", value: "sold", class: filter === "sold" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterSold),
          button({ type: "submit", name: "filter", value: "discarded", class: filter === "discarded" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterDiscarded),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, i18n.marketFilterRecent),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.marketCreateButton)
        )
      ),
      div(
        { class: "tags-header" },
        topbar ? topbar : null,
        h2(item.title),
        renderCardField(`${i18n.marketItemType}:`, `${String(item.item_type || "").toUpperCase()}`),
        renderCardField(`${i18n.marketItemStatus}:`, item.status),
        renderCountdownField(item),
        renderCardField(`${i18n.marketItemCondition}:`, item.item_status),
        br(),
        div(
          { class: "market-item image" },
          item.image ? img({ src: `/blob/${encodeURIComponent(item.image)}` }) : img({ src: "/assets/images/default-market.png", alt: item.title })
        ),
        renderCardField(`${i18n.marketItemDescription}:`, ""),
        p(...renderUrl(item.description)),
        item.tags && item.tags.length
          ? div({ class: "card-tags" }, item.tags.map((tag) => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)))
          : null,
        br(),
        renderCardField(`${i18n.marketItemPrice}:`, ""),
        br(),
        div({ class: "card-label" }, h2(`${item.price} ECO`)),
        br(),
        renderStockBar(item.stock, maxStock),
        br(),
        renderCardField(`${i18n.marketItemIncludesShipping}:`, `${item.includesShipping ? i18n.YESLabel : i18n.NOLabel}`),
        item.deadline ? renderCardField(`${i18n.marketItemAvailable}:`, `${moment(item.deadline).format("YYYY/MM/DD HH:mm:ss")}`) : null,
        renderCardFieldRich(`${i18n.marketItemSeller}:`, [a({ class: "user-link", href: `/author/${encodeURIComponent(item.seller)}` }, item.seller)])
      ),
      item.item_type === "auction"
        ? div(
            { class: "auction-info" },
            p({ class: "auction-bid-text" }, i18n.marketAuctionBids),
            parsedBids.length
              ? table(
                  { class: "auction-bid-table" },
                  tr(th(i18n.marketAuctionBidTime), th(i18n.marketAuctionUser), th(i18n.marketAuctionBidAmount)),
                  parsedBids.map((bid) =>
                    tr(td(moment(bid.time).format("YYYY-MM-DD HH:mm:ss")), td(a({ href: `/author/${encodeURIComponent(bid.bidder)}` }, bid.bidder)), td(`${parseFloat(bid.amount).toFixed(6)} ECO`))
                  )
                )
              : null,
            item.status !== "SOLD" && item.status !== "DISCARDED"
              ? form(
                  { method: "POST", action: `/market/bid/${encodeURIComponent(item.id)}` },
                  input({ type: "hidden", name: "returnTo", value: returnTo }),
                  input({ type: "number", name: "bidAmount", step: "0.000001", min: "0.000001", placeholder: i18n.marketYourBid, required: true }),
                  br(),
                  button({ class: "buy-btn", type: "submit" }, i18n.marketPlaceBidButton)
                )
              : null
          )
        : null,
      showBuy
        ? div(
            { class: "market-item actions" },
            form(
              { method: "POST", action: `/market/buy/${encodeURIComponent(item.id)}` },
              input({ type: "hidden", name: "returnTo", value: "/inbox?filter=sent" }),
              button({ class: "buy-btn", type: "submit" }, i18n.marketActionsBuy)
            )
          )
        : null,
      renderMarketCommentsSection(item.id, returnTo, comments)
    )
  )
}

