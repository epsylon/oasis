const { div, h2, p, section, button, form, a, span, textarea, br, input, label, select, option, img, table, tr, th, td, progress, video, audio } = require("../server/node_modules/hyperaxe")
const { renderCommentsSection: renderSharedCommentsSection } = require("./comments_view");
const { template, i18n, userLink, renderStateChip, renderVisibilityChip, renderLifespanChip, renderEcoTax, renderSpreadButton, renderSpreadEditWarning, renderOpinionsVoting, renderEngagement , renderContentActions } = require("./main_views")
const opinionCategories = require("../backend/opinion_categories")
const moment = require("../server/node_modules/moment")
const { config } = require("../server/SSB_server.js")
const { renderUrl } = require("../backend/renderUrl")
const { renderMapLocationUrl, renderMapEmbed, renderMapLocationVisitLabel, renderMapEmbedWithZoom } = require("./maps_view")

const renderMediaBlob = (value, fallbackSrc = null, attrs = {}) => {
  if (!value) return fallbackSrc ? img({ src: fallbackSrc, ...attrs }) : null
  const s = String(value).trim()
  if (!s) return fallbackSrc ? img({ src: fallbackSrc, ...attrs }) : null
  if (s.startsWith('&')) return img({ src: `/blob/${encodeURIComponent(s)}`, ...attrs })
  const mVideo = s.match(/\[video:[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mVideo) return video({ controls: true, class: attrs.class || 'post-video', src: `/blob/${encodeURIComponent(mVideo[1])}` })
  const mAudio = s.match(/\[audio:[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mAudio) return audio({ controls: true, class: attrs.class || 'post-audio', src: `/blob/${encodeURIComponent(mAudio[1])}` })
  const mImg = s.match(/!\[[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mImg) return img({ src: `/blob/${encodeURIComponent(mImg[1])}`, class: attrs.class || 'post-image' })
  return fallbackSrc ? img({ src: fallbackSrc, ...attrs }) : null
}

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


const sumCats = (opinions = {}, cats = []) => (cats || []).reduce((acc, c) => acc + (Number((opinions || {})[c]) || 0), 0)

const renderStarRating = (opinions, voterCount) => {
  const pos = sumCats(opinions, opinionCategories.positive)
  const neg = sumCats(opinions, opinionCategories.constructive) + sumCats(opinions, opinionCategories.moderation)
  const total = pos + neg
  const full = total > 0 ? Math.round((pos / total) * 5) : 0
  return span({ class: "shop-product-stars" }, "★".repeat(full) + "☆".repeat(5 - full) + ` (${voterCount})`)
}

const renderCardField = (labelText, value = "") =>
  div({ class: "card-field" }, span({ class: "card-label" }, labelText), span({ class: "card-value" }, ...renderUrl(String(value))))

const renderCardFieldRich = (labelText, parts) =>
  div({ class: "card-field" }, span({ class: "card-label" }, labelText), span({ class: "card-value" }, ...(Array.isArray(parts) ? parts : [parts])))

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
  return renderSharedCommentsSection({
    action: `/market/${encodeURIComponent(itemId)}/comments`,
    comments: comments,
    returnTo: returnTo
  });
};

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
          option({ value: "FOR SALE", ...(cur === "FOR SALE" ? { selected: true } : {})}, i18n.marketFilterForSale),
          option({ value: "SOLD", ...(cur === "SOLD" ? { selected: true } : {})}, i18n.marketFilterSold),
          option({ value: "DISCARDED", ...(cur === "DISCARDED" ? { selected: true } : {})}, i18n.marketFilterDiscarded)
        ),
        button({ class: "status-btn project-control-btn", type: "submit" }, i18n.marketActionsChangeStatus)
      )
    )
  }
  return out
}

const renderMarketTopbar = (item, returnTo) => {
  const left = []
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

  const title = i18n.marketTitle

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
  const spreadWarning = filter === "edit" ? await renderSpreadEditWarning(itemEdit && (itemEdit.id || itemEdit.key)) : null

  return template(
    title,
    section(
      div({ class: "tags-header module-header-line" }, h2(i18n.marketTitle), p(i18n.marketDescription)),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/market", class: "ui-toolbar ui-toolbar--filters" },
          ...hiddenCtx,
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterAll).toUpperCase()),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterMine).toUpperCase()),
          button({ type: "submit", name: "filter", value: "exchange", class: filter === "exchange" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterItems).toUpperCase()),
          button({ type: "submit", name: "filter", value: "auctions", class: filter === "auctions" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterAuctions).toUpperCase()),
          button({ type: "submit", name: "filter", value: "mybids", class: filter === "mybids" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterMyBids).toUpperCase()),
          button({ type: "submit", name: "filter", value: "new", class: filter === "new" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterNew).toUpperCase()),
          button({ type: "submit", name: "filter", value: "used", class: filter === "used" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterUsed).toUpperCase()),
          button({ type: "submit", name: "filter", value: "broken", class: filter === "broken" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterBroken).toUpperCase()),
          button({ type: "submit", name: "filter", value: "for sale", class: filter === "for sale" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterForSale).toUpperCase()),
          button({ type: "submit", name: "filter", value: "sold", class: filter === "sold" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterSold).toUpperCase()),
          button({ type: "submit", name: "filter", value: "discarded", class: filter === "discarded" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterDiscarded).toUpperCase()),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterRecent).toUpperCase()),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.marketCreateButton)
        )
      ),
      !isFormMode
        ? div(
            { class: "market-search activity-filter-chips activity-toolbar-row" },
            form(
              { method: "GET", action: "/market", class: "filter-box" },
              input({ type: "hidden", name: "filter", value: filter || "all" }),
              input({ type: "text", name: "q", value: q, placeholder: i18n.marketSearchPlaceholder, class: "filter-box__input" }),
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
                  }),

                select(
                  { name: "sort", class: "filter-box__select" },
                  option({ value: "recent", ...(sort === "recent" ? { selected: true } : {})}, i18n.marketSortRecent),
                  option({ value: "price", ...(sort === "price" ? { selected: true } : {})}, i18n.marketSortPrice),
                  option({ value: "deadline", ...(sort === "deadline" ? { selected: true } : {})}, i18n.marketSortDeadline)
                ),
                button({ type: "submit", class: "filter-box__button" }, i18n.marketSearchButton)
              
            )
          )
        : null
    ),
    section(
      isFormMode
        ? div(
            { class: "market-form" },
            spreadWarning,
            form(
              { action: filter === "edit" ? `/market/update/${encodeURIComponent(itemEdit.id)}` : "/market/create", method: "POST", enctype: "multipart/form-data" },
              input({ type: "hidden", name: "returnTo", value: "/market?filter=mine" }),
              ((itemEdit && itemEdit.industry) || params.industry) ? input({ type: "hidden", name: "industry", value: (itemEdit && itemEdit.industry) || params.industry }) : null,
              label(i18n.marketItemType),
              br(),
              select(
                { name: "item_type", id: "item_type", required: true },
                option({ value: "auction", ...(itemEdit && itemEdit.item_type === "auction" ? { selected: true } : {})}, "Auction"),
                option({ value: "exchange", ...(itemEdit && itemEdit.item_type === "exchange" ? { selected: true } : {})}, "Exchange")
              ),
              br(),
              br(),
              label(i18n.marketItemTitle),
              br(),
              input({ type: "text", name: "title", maxlength: "100", id: "title", value: (itemEdit && itemEdit.title) || params.title || "", required: true }),
              br(),
              br(),
              label(i18n.marketItemDescription),
              br(),
              textarea({ maxlength: "5000", name: "description", id: "description", placeholder: i18n.marketItemDescriptionPlaceholder, rows: "6", required: true }, (itemEdit && itemEdit.description) || params.description || ""),
              br(),
              br(),
              label(i18n.marketCreateFormImageLabel),
              br(),
              input({ type: "file", name: "image", id: "image" }),
              br(),
              br(),
              label(i18n.marketItemStatus),
              br(),
              select(
                { name: "item_status", id: "item_status" },
                option({ value: "BROKEN", ...(itemEdit && itemEdit.item_status === "BROKEN" ? { selected: true } : {})}, "BROKEN"),
                option({ value: "USED", ...(itemEdit && itemEdit.item_status === "USED" ? { selected: true } : {})}, "USED"),
                option({ value: "NEW", ...(itemEdit && itemEdit.item_status === "NEW" ? { selected: true } : {})}, "NEW")
              ),
              br(),
              br(),
              label(i18n.marketItemStock),
              br(),
              input({ type: "number", name: "stock", id: "stock", value: (itemEdit && itemEdit.stock) || params.stock || 1, required: true, min: "1", step: "1" }),
              br(),
              br(),
              label(i18n.mapLocationTitle || "Map Location"),
              br(),
              input({ type: "text", name: "mapUrl", placeholder: i18n.mapUrlPlaceholder || "/maps/MAP_ID", value: itemEdit?.mapUrl || "" }),
              br(),
              br(),
              label(i18n.visibilityLabel || "Visibility"),
              br(),
              select(
                { name: "visibility" },
                option({ value: "PUBLIC", ...((itemEdit?.visibility || "PUBLIC") === "PUBLIC" ? { selected: true } : {})}, i18n.visibilityPublic || "Public"),
                option({ value: "HIDDEN", ...(itemEdit?.visibility === "HIDDEN" ? { selected: true } : {})}, i18n.visibilityHidden || "Hidden")
              ),
              br(),
              br(),
              label(i18n.marketItemPrice),
              br(),
              input({ type: "number", name: "price", id: "price", value: (itemEdit && itemEdit.price) || params.price || "", required: true, step: "0.000001", min: "0.000001" }),
              br(),
              br(),
              label(i18n.marketItemTags),
              br(),
              input({ type: "text", name: "tags", id: "tags", placeholder: i18n.marketItemTagsPlaceholder, value: (itemEdit && itemEdit.tags && itemEdit.tags.join(", ")) || params.tags || "" }),
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
              br(),br(),
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

                  return div({ class: "tribe-card market-tribe-card" },
                    div({ class: "tribe-card-image-wrapper" },
                      a({ href: `/market/${encodeURIComponent(item.id)}` },
                        renderMediaBlob(item.image, '/assets/images/default-market.png', { class: 'tribe-card-hero-image' })
                      )
                    ),
                    div({ class: "card-header activity-card-header" },
                      span(),
                      renderContentActions(item.id, `/market/${encodeURIComponent(item.id)}`, { spread: params.spreads || null, author: item.seller, favKind: 'market', isFavorite: item.isFavorite, reportTitle: item.title })
                    ),
                    div({ class: "tribe-card-body" },
                      div({ class: "shop-title-row" },
                        h2({ class: "tribe-card-title" }, a({ href: `/market/${encodeURIComponent(item.id)}` }, item.title))
                      ),
                      renderStarRating(item.opinions, Array.isArray(item.opinions_inhabitants) ? item.opinions_inhabitants.length : 0),
                      div({ class: "card-chips-row" },
                        String(item.visibility || "PUBLIC").toUpperCase() === "HIDDEN" ? renderVisibilityChip("HIDDEN", i18n) : null,
                        renderStateChip("encrypted", "", String(item.item_type || "").toUpperCase()),
                        item.item_status ? renderStateChip("whole", "", String(item.item_status).toUpperCase()) : null,
                        item.includesShipping ? renderStateChip("mutuals", "📦", String(i18n.marketItemIncludesShipping || "Shipping").replace(/\?$/, "").toUpperCase()) : null,
                        item.industry ? a({ href: `/industry/${encodeURIComponent(item.industry)}` }, renderStateChip("whole", "🏭", String(i18n.industryTitle || "Industry").toUpperCase())) : null,
                        renderLifespanChip(item.lifetime, i18n)
                      ),
                      div({ class: "market-card-price card-date-highlight" }, `${item.price} ECO`)
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
    section(div({ class: "tags-header module-header-line" }, h2(i18n.marketTitle), p(i18n.marketDescription))),
    section(
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/market", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "minPrice", value: minPrice ?? "" }),
          input({ type: "hidden", name: "maxPrice", value: maxPrice ?? "" }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterAll).toUpperCase()),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterMine).toUpperCase()),
          button({ type: "submit", name: "filter", value: "exchange", class: filter === "exchange" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterItems).toUpperCase()),
          button({ type: "submit", name: "filter", value: "auctions", class: filter === "auctions" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterAuctions).toUpperCase()),
          button({ type: "submit", name: "filter", value: "mybids", class: filter === "mybids" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterMyBids).toUpperCase()),
          button({ type: "submit", name: "filter", value: "new", class: filter === "new" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterNew).toUpperCase()),
          button({ type: "submit", name: "filter", value: "used", class: filter === "used" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterUsed).toUpperCase()),
          button({ type: "submit", name: "filter", value: "broken", class: filter === "broken" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterBroken).toUpperCase()),
          button({ type: "submit", name: "filter", value: "for sale", class: filter === "for sale" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterForSale).toUpperCase()),
          button({ type: "submit", name: "filter", value: "sold", class: filter === "sold" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterSold).toUpperCase()),
          button({ type: "submit", name: "filter", value: "discarded", class: filter === "discarded" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterDiscarded).toUpperCase()),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.marketFilterRecent).toUpperCase()),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.marketCreateButton)
        )
      ),
      (() => {
        const isHidden = String(item.visibility || 'PUBLIC').toUpperCase() === 'HIDDEN'
        const chips = [
          isHidden ? renderVisibilityChip("HIDDEN", i18n) : null,
          renderStateChip("encrypted", "", String(item.item_type || "").toUpperCase()),
          item.item_status ? renderStateChip("whole", "", String(item.item_status).toUpperCase()) : null,
          item.includesShipping ? renderStateChip("mutuals", "📦", String(i18n.marketItemIncludesShipping || "Shipping").replace(/\?$/, "").toUpperCase()) : null,
          item.industry ? a({ href: `/industry/${encodeURIComponent(item.industry)}` }, renderStateChip("whole", "🏭", String(i18n.industryTitle || "Industry").toUpperCase())) : null,
          renderLifespanChip(item.lifetime, i18n),
          renderEcoTax(item.msgSize, item.id)
        ].filter(Boolean)

        const tagsNode = item.tags && item.tags.length
          ? div({ class: "card-tags" }, item.tags.map((tag) => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)))
          : null

        const infoRows = []
        const pushRow = (labelText, valueNode) =>
          infoRows.push(tr(
            td({ class: "tribe-info-label" }, labelText),
            td({ class: "tribe-info-value" }, valueNode)
          ))
        pushRow(i18n.marketItemSeller, userLink(item.seller))
        if (item.shopId && item.shopTitle) pushRow(i18n.marketShopLabel || "Shop", a({ href: `/shops/${encodeURIComponent(item.shopId)}`, class: "user-link" }, item.shopTitle))
        if (item.deadline) pushRow(i18n.marketItemAvailable, moment(item.deadline).format("YYYY/MM/DD HH:mm"))

        const visibilityRow = String(item.seller) === String(userId)
          ? (() => {
              const vis = isHidden ? 'HIDDEN' : 'PUBLIC'
              const next = vis === 'PUBLIC' ? 'HIDDEN' : 'PUBLIC'
              return div({ class: "tribe-side-actions housing-status-row" },
                span({ class: "card-label" }, `${i18n.visibilityLabel || 'Visibility'}: `),
                renderVisibilityChip(vis, i18n),
                form({ method: "POST", action: `/market/visibility/${encodeURIComponent(item.id)}`, class: "inline-form" },
                  input({ type: "hidden", name: "visibility", value: next }),
                  button({ type: "submit", class: "filter-btn" },
                    next === 'PUBLIC' ? (i18n.visibilityMakePublic || 'Make public') : (i18n.visibilityMakeHidden || 'Make hidden')
                  )
                )
              )
            })()
          : null

        const marketActions = []
        if (String(item.seller) === String(userId)) {
          marketActions.push(form({ method: "GET", action: `/market/edit/${encodeURIComponent(item.id)}` },
            button({ type: "submit", class: "update-btn" }, i18n.marketUpdateButton || "Update")
          ))
          marketActions.push(form({ method: "POST", action: `/market/delete/${encodeURIComponent(item.id)}` },
            button({ type: "submit", class: "delete-btn" }, i18n.marketDeleteButton || "Delete")
          ))
        }

        const itemSide = div({ class: "tribe-side" },
          div({ class: "card-header activity-card-header" },
            renderContentActions(item.id, null, { spread: params.spreads || null, author: item.seller, favKind: 'market', isFavorite: item.isFavorite, reportTitle: item.title })
          ),
          div({ class: "shop-title-row" },
            h2({ class: "tribe-card-title" }, item.title)
          ),
          renderStarRating(item.opinions, Array.isArray(item.opinions_inhabitants) ? item.opinions_inhabitants.length : 0),
          chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
          renderMediaBlob(item.image, "/assets/images/default-market.png"),
          div({ class: "card-date-highlight" }, `${item.price} ECO`),
          renderStockBar(item.stock, maxStock),
          table({ class: "tribe-info-table jobs-info-table" }, ...infoRows),
          tagsNode,
          visibilityRow,
          marketActions.length ? div({ class: "tribe-side-actions" }, ...marketActions) : null
        )

        const itemMain = div({ class: "tribe-main" },
          item.description
            ? div({ class: "job-section" },
                h2({ class: "job-section-title" }, i18n.marketItemDescription),
                p({ class: "tribe-side-description" }, ...renderUrl(item.description))
              )
            : null,
          renderCountdownField(item),
          item.mapUrl ? div({ class: "job-section" }, renderMapEmbedWithZoom(params.mapData, item.mapUrl, `/market/${encodeURIComponent(item.id)}`, params.zoom)) : null,
          item.item_type === "auction"
            ? div(
                { class: "auction-info job-section" },
                h2({ class: "job-section-title" }, i18n.marketAuctionBids),
                parsedBids.length
                  ? table(
                      { class: "auction-bid-table" },
                      tr(th(i18n.marketAuctionBidTime), th(i18n.marketAuctionUser), th(i18n.marketAuctionBidAmount)),
                      parsedBids.map((bid) =>
                        tr(td(moment(bid.time).format("YYYY/MM/DD HH:mm")), td(a({ href: `/author/${encodeURIComponent(bid.bidder)}` }, bid.bidder)), td(`${parseFloat(bid.amount).toFixed(6)} ECO`))
                      )
                    )
                  : p({ class: "tribe-side-description" }, i18n.marketNoBids || "No bids yet"),
                item.status !== "SOLD" && item.status !== "DISCARDED" && String(item.seller) !== String(userId)
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
          renderEngagement(item.id,
            String(item.seller) !== String(userId) && item.purchasedByViewer
              ? renderOpinionsVoting("/market/opinions", item.id, item.opinions, returnTo, item.opinions_inhabitants)
              : null,
            renderMarketCommentsSection(item.id, returnTo, comments)
          )
        )

        return div({ class: "tribe-details" }, itemSide, itemMain)
      })()
    )
  )
}

