const { form, button, div, h2, p, section, input, label, textarea, br, a, span, select, option, img, video, table, tr, td, hr } = require("../server/node_modules/hyperaxe")
const { renderCommentsSection: renderSharedCommentsSection } = require("./comments_view");
const { renderReachChip, renderClearnetSelector, renderClearnetSwitch } = require("./clearnet_view")
const { clearnetItemHref, template, i18n, userLink, renderOpenClosedChip, renderStateChip, renderVisibilityChip, renderLifespanChip, renderEcoTax, renderSpreadButton, renderContentActions, renderOpinionsVoting, renderEngagement, renderSpreadEditWarning, renderModuleStatsBy, moduleIsEmpty, renderEcoValueChip, contentDeleteAction } = require("./main_views")
const { blobUrl, blobIdOf, isVideoEntry, imagesOf, renderMediaThumb, renderPhotoGallery, renderGalleryFields } = require("./gallery_view")
const moment = require("../server/node_modules/moment")
const { config } = require("../server/SSB_server.js")
const { renderStyledText } = require("../backend/renderStyledText")
const opinionCategories = require("../backend/opinion_categories")
const { renderMapEmbed, renderMapLocationVisitLabel } = require("./maps_view")

const userId = config.keys.id

const FILTERS = [
  { key: "RECENT", i18n: "housingFilterRecent" },
  { key: "MINE", i18n: "housingFilterMine" },
  { key: "ALL", i18n: "housingFilterAll" },
  { key: "TOP", i18n: "housingFilterTop" },
  { key: "REQUESTED", i18n: "housingFilterRequested" },
  { key: "SALE", i18n: "housingFilterSale" },
  { key: "RENT", i18n: "housingFilterRent" },
  { key: "COUCHSURFING", i18n: "housingFilterCouchsurfing" },
  { key: "OPEN", i18n: "housingFilterOpen" },
  { key: "CLOSED", i18n: "housingFilterClosed" }
]

const MAX_IMAGES = 8

const safeArr = (v) => (Array.isArray(v) ? v : [])
const safeText = (v) => String(v || "").trim()
const clearnetEligible = (item) => String(item.status || "OPEN").toUpperCase() === "OPEN" && String(item.visibility || "PUBLIC").toUpperCase() === "PUBLIC" && !item.encrypted && !item.tribeId
const housingClearnetHref = (item) => clearnetItemHref("housing", item.title, item.rootId || item.id)
const HOUSING_REACH = ["PUBLIC", "HIDDEN"]
const housingReachLabel = (v) => v === "HIDDEN" ? (i18n.visibilityHidden || "Hidden") : (i18n.visibilityPublic || "Public")

const parseNum = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."))
  return Number.isFinite(n) ? n : NaN
}

const fmtPrice = (v) => {
  const n = parseNum(v)
  return Number.isFinite(n) ? n.toFixed(2) : String(v ?? "")
}



const priceLabel = (item) => {
  if (item.housing_type === "couchsurfing") return i18n.housingFree || "FREE"
  const suffix = item.housing_type === "rent" ? ` ${i18n.housingPerMonth || "/month"}` : ""
  return `${fmtPrice(item.price)} ECO${suffix}`
}

const sumCats = (opinions = {}, cats = []) => (cats || []).reduce((s, c) => s + (Number((opinions || {})[c]) || 0), 0)

const renderStarRating = (opinions, voterCount) => {
  const pos = sumCats(opinions, opinionCategories.positive)
  const neg = sumCats(opinions, opinionCategories.constructive) + sumCats(opinions, opinionCategories.moderation)
  const total = pos + neg
  const full = total > 0 ? Math.round((pos / total) * 5) : 0
  const stars = "★".repeat(full) + "☆".repeat(5 - full)
  return span({ class: "housing-stars" }, `${stars} (${voterCount})`)
}

const buildReturnTo = (filter, params = {}) => {
  const parts = [`filter=${encodeURIComponent(safeText(filter || "ALL"))}`]
  const q = safeText(params.search || "")
  if (q) parts.push(`search=${encodeURIComponent(q)}`)
  if (String(params.minPrice ?? "") !== "") parts.push(`minPrice=${encodeURIComponent(String(params.minPrice))}`)
  if (String(params.maxPrice ?? "") !== "") parts.push(`maxPrice=${encodeURIComponent(String(params.maxPrice))}`)
  if (safeText(params.place)) parts.push(`place=${encodeURIComponent(safeText(params.place))}`)
  if (safeText(params.sort)) parts.push(`sort=${encodeURIComponent(safeText(params.sort))}`)
  return `/housing?${parts.join("&")}`
}

const renderTags = (tags = []) => {
  const arr = safeArr(tags).map(t => String(t || "").trim()).filter(Boolean)
  return arr.length
    ? div({ class: "card-tags" }, arr.map(tag => a({ class: "tag-link", href: `/search?query=%23${encodeURIComponent(tag)}` }, `#${tag}`)))
    : null
}

const renderTypeChip = (item) => {
  const t = String(item.housing_type || "").toUpperCase()
  const emoji = item.housing_type === "sale" ? "🏷" : item.housing_type === "rent" ? "🔑" : "🛋"
  return renderStateChip("whole", emoji, i18n["housingType" + t] || t)
}

const renderStatusChip = (status) => {
  const s = String(status || "").toUpperCase()
  return renderOpenClosedChip(s, {
    statusChipOPEN: i18n.housingStatusOPEN || "OPEN",
    statusChipCLOSED: i18n.housingStatusCLOSED || "CLOSED"
  })
}

const renderRequestedChip = () => renderStateChip("whole", "★", i18n.housingRequestedBadge || "REQUESTED")

const renderInfoTable = (item) => {
  const rows = []
  const pushRow = (labelText, valueNode, valueClass) =>
    rows.push(tr(
      td({ class: "tribe-info-label" }, labelText),
      td({ class: `tribe-info-value${valueClass ? " " + valueClass : ""}` }, valueNode)
    ))
  pushRow(i18n.housingProperty, i18n["housingProperty" + String(item.property_type || "").toUpperCase()] || "—")
  pushRow(i18n.housingPrice, priceLabel(item), "card-salary")
  if (item.rooms > 0) pushRow(i18n.housingRooms, String(item.rooms))
  if (item.size > 0) pushRow(i18n.housingSize, `${item.size} m²`)
  if (item.capacity > 0) pushRow(i18n.housingCapacity, String(item.capacity))
  if (item.availableFrom) pushRow(i18n.housingAvailableFrom, moment(item.availableFrom).format("YYYY/MM/DD"))
  if (item.availableTo) pushRow(i18n.housingAvailableTo, moment(item.availableTo).format("YYYY/MM/DD"))
  if (safeText(item.place)) pushRow(i18n.housingPlace, safeText(item.place))
  if (item.mapUrl) {
    const mapNode = renderMapLocationVisitLabel(item.mapUrl)
    if (mapNode) pushRow(i18n.mapLocationTitle || "Map", mapNode)
  }
  return table({ class: "tribe-info-table housing-info-table" }, ...rows)
}

const today = () => moment().format("YYYY-MM-DD")

const renderStatusRow = (item, returnTo) => {
  if (String(item.author) !== String(userId)) return null
  const isOpen = item.status === "OPEN"
  return div({ class: "tribe-side-actions housing-status-row" },
    span({ class: "card-label" }, `${i18n.housingStatus}: `),
    renderStatusChip(item.status),
    form({ method: "POST", action: `/housing/status/${encodeURIComponent(item.id)}`, class: "inline-form" },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "tribe-action-btn", type: "submit", name: "status", value: isOpen ? "CLOSED" : "OPEN" },
        isOpen ? (i18n.housingSetClosed || "Close") : (i18n.housingSetOpen || "Reopen"))
    )
  )
}

const renderOwnerActions = (item, returnTo) => {
  if (String(item.author) !== String(userId)) return []
  return [
    form({ method: "GET", action: `/housing/edit/${encodeURIComponent(item.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "update-btn", type: "submit" }, i18n.housingUpdateButton)
    )
  ]
}

const renderRequestToggle = (item, returnTo) => {
  if (String(item.author) === String(userId)) return null
  if (item.status !== "OPEN") return null
  const requested = safeArr(item.requests).includes(userId)
  return requested
    ? form({ method: "POST", action: `/housing/cancel/${encodeURIComponent(item.id)}` },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        button({ type: "submit", class: "filter-btn" }, i18n.housingCancelButton)
      )
    : form({ method: "POST", action: `/housing/request/${encodeURIComponent(item.id)}` },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        button({ type: "submit", class: "filter-btn" }, i18n.housingRequestButton)
      )
}

const renderHousingList = (items, filter, params = {}) => {
  const list = safeArr(items)
  if (!list.length) return p(i18n.housingNoItems)
  const returnTo = buildReturnTo(filter, params)

  return div({ class: "housing-grid" },
    list.map((item) => {
      const clip = safeText(item.video)
      const cover = imagesOf(item)[0]
      const isOwn = item.author && String(item.author) === String(userId)
      const requested = safeArr(item.requests).includes(userId)
      const chips = [
        item.visibility === "HIDDEN" ? renderVisibilityChip("HIDDEN", i18n) : null,
        renderTypeChip(item),
        renderStatusChip(item.status),
        requested ? renderRequestedChip() : null,
        renderLifespanChip(item.lifetime, i18n),
        item.clearnet === true && clearnetEligible(item) ? renderReachChip(true, i18n, housingClearnetHref(item)) : null
      ].filter(Boolean)

      return div({ class: "trending-card housing-card" + (isOwn ? " own-content" : "") },
        div({ class: "card-header activity-card-header" },
          span(),
          renderContentActions(item.id, `/housing/${encodeURIComponent(item.id)}`, { spread: params.spreadMap && params.spreadMap.get(item.id) || null, author: item.author, favKind: 'housing', isFavorite: item.isFavorite, reportTitle: item.title, returnTo, deleteAction: isOwn ? contentDeleteAction("housing", item.id) : null })
        ),
        div({ class: "card-section housing-card-body" },
          clip || (cover && isVideoEntry(cover))
            ? div({ class: "tribe-card-image-wrapper housing-card-video" },
                video({ controls: true, class: "housing-card-hero-video", src: blobUrl(blobIdOf(clip || cover)), preload: 'metadata' })
              )
            : cover
              ? div({ class: "tribe-card-image-wrapper" },
                  a({ href: `/housing/${encodeURIComponent(item.id)}` },
                    img({ src: blobUrl(blobIdOf(cover), 256), class: "tribe-card-hero-image", alt: "" })
                  )
                )
              : null,
          div({ class: "tribe-card-body" },
            div({ class: "shop-title-row" },
              h2({ class: "tribe-card-title" },
                a({ href: `/housing/${encodeURIComponent(item.id)}` }, safeText(item.title) || i18n.housingTitle)
              )
            ),
            chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
            renderStarRating(item.opinions, safeArr(item.opinions_inhabitants).length),
            div({ class: "price-chip" }, priceLabel(item)),
            safeText(item.place)
              ? div({ class: "card-field" },
                  span({ class: "card-label" }, `${i18n.housingPlace}: `),
                  span({ class: "card-value" }, safeText(item.place))
                )
              : null,
            div({ class: "tribe-card-members" },
              span({ class: "tribe-members-count" }, `${i18n.housingRequests}: ${item.requestCount || 0}`)
            ),
            imagesOf(item).length > 1
              ? div({ class: "card-field" },
                  span({ class: "card-label" }, `${i18n.galleryPhotos}: `),
                  span({ class: "card-value" }, String(imagesOf(item).length))
                )
              : null
          )
        )
      )
    })
  )
}

const renderHousingForm = (item = {}, mode = "create", maxImages = MAX_IMAGES, spreadWarning = null, params = {}) => {
  const isEdit = mode === "edit"
  const type = String(item.housing_type || "").toLowerCase()
  const reachRaw = String(params.reach || "").toUpperCase()
  const ownReach = String(item.visibility || "").toUpperCase()
  const reach = HOUSING_REACH.includes(reachRaw) ? reachRaw : (HOUSING_REACH.includes(ownReach) ? ownReach : "PUBLIC")
  const showClearnet = reach === "PUBLIC" && clearnetEligible({ ...item, visibility: reach })
  return div({ class: "div-center housing-form" },
    isEdit ? spreadWarning : null,
    form({ method: "GET", action: isEdit ? `/housing/edit/${encodeURIComponent(item.id)}` : "/housing" },
      isEdit ? null : input({ type: "hidden", name: "filter", value: "CREATE" }),
      label(i18n.visibilityLabel || "Visibility"),
      br(),
      div({ class: "apply-row" },
        select({ name: "visibility", class: "report-category-select" },
          option({ value: "PUBLIC", ...(reach === "PUBLIC" ? { selected: true } : {}) }, i18n.visibilityPublic || "Public"),
          option({ value: "HIDDEN", ...(reach === "HIDDEN" ? { selected: true } : {}) }, i18n.visibilityHidden || "Hidden")
        ),
        button({ type: "submit", class: "create-button" }, i18n.apply || "Apply")
      )
    ),
    hr({ class: "form-sep" }),
    h2({ class: "report-category-fixed" }, housingReachLabel(reach)),
    form({
      action: isEdit ? `/housing/update/${encodeURIComponent(item.id)}` : "/housing/create",
      method: "POST",
      enctype: "multipart/form-data"
    },
      input({ type: "hidden", name: "returnTo", value: "/housing?filter=MINE" }),
      input({ type: "hidden", name: "visibility", value: reach }),
      label(i18n.housingType),
      br(),
      select({ name: "housing_type", required: true },
        option({ value: "sale", selected: type === "sale" ? "selected" : undefined }, i18n.housingTypeSALE),
        option({ value: "rent", selected: type === "rent" ? "selected" : undefined }, i18n.housingTypeRENT),
        option({ value: "couchsurfing", selected: type === "couchsurfing" ? "selected" : undefined }, i18n.housingTypeCOUCHSURFING)
      ),
      br(),
      br(),
      label(i18n.housingProperty),
      br(),
      select({ name: "property_type" },
        option({ value: "apartment", ...(item.property_type === "apartment" ? { selected: true } : {})}, i18n.housingPropertyAPARTMENT),
        option({ value: "house", ...(item.property_type === "house" ? { selected: true } : {})}, i18n.housingPropertyHOUSE),
        option({ value: "room", ...(item.property_type === "room" ? { selected: true } : {})}, i18n.housingPropertyROOM),
        option({ value: "land", ...(item.property_type === "land" ? { selected: true } : {})}, i18n.housingPropertyLAND),
        option({ value: "other", ...(item.property_type === "other" ? { selected: true } : {})}, i18n.housingPropertyOTHER)
      ),
      br(),
      br(),
      label(i18n.housingTitleLabel),
      br(),
      input({ type: "text", name: "title", maxlength: "100", required: true, placeholder: i18n.housingTitlePlaceholder, value: item.title || "" }),
      br(),
      br(),
      ...renderGalleryFields(item, isEdit, maxImages),
      label(i18n.housingDescription),
      br(),
      textarea({ maxlength: "5000", name: "description", rows: "6", required: true, placeholder: i18n.housingDescriptionPlaceholder }, item.description || ""),
      br(),
      br(),
      label(i18n.housingRules),
      br(),
      textarea({ maxlength: "5000", name: "rules", rows: "4", placeholder: i18n.housingRulesPlaceholder }, item.rules || ""),
      br(),
      br(),
      label(i18n.housingPlace),
      br(),
      input({ type: "text", name: "place", placeholder: i18n.housingPlacePlaceholder, value: item.place || "" }),
      br(),
      br(),
      label(i18n.mapLocationTitle || "Map Location"),
      br(),
      input({ type: "text", name: "mapUrl", placeholder: i18n.mapUrlPlaceholder || "/maps/MAP_ID", value: item.mapUrl || "" }),
      br(),
      br(),
      label(i18n.housingPriceLabel),
      br(),
      input({ type: "number", name: "price", step: "0.01", min: "0", value: item.price || "" }),
      renderEcoValueChip(),
      br(),
      br(),
      label(i18n.housingRooms),
      br(),
      input({ type: "number", name: "rooms", min: "0", value: item.rooms || "" }),
      br(),
      br(),
      label(i18n.housingSizeLabel),
      br(),
      input({ type: "number", name: "size", step: "0.01", min: "0", value: item.size || "" }),
      br(),
      br(),
      label(i18n.housingCapacity),
      br(),
      input({ type: "number", name: "capacity", min: "0", value: item.capacity || "" }),
      br(),
      br(),
      label(i18n.housingAvailableFrom),
      br(),
      input({ type: "date", name: "availableFrom", required: true, min: today(), value: item.availableFrom ? String(item.availableFrom).slice(0, 10) : "" }),
      br(),
      br(),
      label(i18n.housingAvailableTo),
      br(),
      input({ type: "date", name: "availableTo", min: item.availableFrom ? String(item.availableFrom).slice(0, 10) : today(), value: item.availableTo ? String(item.availableTo).slice(0, 10) : "" }),
      br(),
      br(),
      label(i18n.housingTags),
      br(),
      input({ type: "text", name: "tags", placeholder: i18n.tagsPlaceholder, value: Array.isArray(item.tags) ? item.tags.join(", ") : (item.tags || "") }),
      br(),
      br(),
      ...(showClearnet ? [renderClearnetSelector(item.clearnet === true || String(item.clearnet || "") === "1", i18n), br()] : []),
      button({ type: "submit" }, isEdit ? i18n.housingUpdateButton : i18n.housingCreateButton)
    )
  )
}

const housingChip = (censusH, filter, x) => {
  const m = x.key
  if (m === filter) return true
  if (m === "TOP") return censusH.length > 0
  if (m === "MINE") return censusH.some(h => String(h.author) === String(userId))
  if (m === "RECENT") return censusH.length > 0
  if (m === "REQUESTED") return censusH.some(h => safeArr(h.requests).includes(userId))
  if (m === "SALE" || m === "RENT" || m === "COUCHSURFING") return censusH.some(h => String(h.housing_type || "").toUpperCase() === m)
  if (m === "OPEN" || m === "CLOSED") return censusH.some(h => String(h.status || "OPEN").toUpperCase() === m)
  return true
}

const renderFiltersBar = (filter, params = {}, emptyMod = false, censusH = null) =>
  div({ class: "filters" },
    form({ method: "GET", action: "/housing", class: "ui-toolbar ui-toolbar--filters" },
      input({ type: "hidden", name: "search", value: safeText(params.search || "") }),
      input({ type: "hidden", name: "minPrice", value: String(params.minPrice ?? "") }),
      input({ type: "hidden", name: "maxPrice", value: String(params.maxPrice ?? "") }),
      input({ type: "hidden", name: "place", value: safeText(params.place || "") }),
      input({ type: "hidden", name: "sort", value: safeText(params.sort || "") }),
      ...(emptyMod ? [] : (censusH ? FILTERS.filter(x => housingChip(censusH, filter, x)) : FILTERS).map(f =>
        button({ type: "submit", name: "filter", value: f.key, class: filter === f.key ? "filter-btn active" : "filter-btn" }, String(i18n[f.i18n]).toUpperCase())
      )),
      button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.housingCreateButton)
    )
  )

exports.housingView = async (items, filter = "ALL", params = {}) => {
  const search = safeText(params.search || "")
  const minPrice = params.minPrice ?? ""
  const maxPrice = params.maxPrice ?? ""
  const place = safeText(params.place || "")
  const sort = safeText(params.sort || "recent")

  const isForm = filter === "CREATE" || filter === "EDIT"
  const emptyMod = moduleIsEmpty(Array.isArray(items) ? items : [], filter, "ALL", search || place || String(minPrice || "") || String(maxPrice || ""))

  return template(
    i18n.housingTitle,
    section(
      div({ class: "tags-header module-header-line" },
        h2(i18n.housingTitle),
        p(i18n.housingDescriptionText)
      ),
      renderFiltersBar(filter, { search, minPrice, maxPrice, place, sort }, emptyMod, Array.isArray(params.censusList) ? params.censusList : (Array.isArray(items) ? items : []))
    ),
    section(
      isForm
        ? renderHousingForm(filter === "EDIT" ? (Array.isArray(items) ? items[0] : items) || {} : (params.draft || {}), filter === "EDIT" ? "edit" : "create", Number(params.maxImages) > 0 ? Number(params.maxImages) : MAX_IMAGES, await renderSpreadEditWarning(filter === "EDIT" ? ((Array.isArray(items) ? items[0] : items) || {}).id : null), params)
        : section(
            emptyMod ? null : div({ class: "housing-search activity-filter-chips activity-toolbar-row" },
              renderModuleStatsBy(items, it => String(it.status || '').toUpperCase(), [{ value: 'OPEN', label: i18n.housingFilterOpen }, { value: 'CLOSED', label: i18n.housingFilterClosed }]),
              form({ method: "GET", action: "/housing", class: "filter-box" },
                input({ type: "hidden", name: "filter", value: filter || "ALL" }),
                input({ type: "text", name: "search", value: search, placeholder: i18n.housingSearchPlaceholder, class: "filter-box__input" }),
                input({ type: "text", name: "place", value: place, placeholder: i18n.housingPlacePlaceholder, class: "filter-box__input housing-place-input" }),
                input({ type: "number", name: "minPrice", step: "0.01", min: "0", value: String(minPrice ?? ""), placeholder: i18n.housingMinPrice, class: "filter-box__number transfer-amount-input" }),
                input({ type: "number", name: "maxPrice", step: "0.01", min: "0", value: String(maxPrice ?? ""), placeholder: i18n.housingMaxPrice, class: "filter-box__number transfer-amount-input" }),
                select({ name: "sort", class: "filter-box__select" },
                    option({ value: "recent", ...(sort === "recent" ? { selected: true } : {})}, i18n.housingSortRecent),
                    option({ value: "price", ...(sort === "price" ? { selected: true } : {})}, i18n.housingSortPrice),
                    option({ value: "requests", ...(sort === "requests" ? { selected: true } : {})}, i18n.housingSortRequests),
                    option({ value: "rating", ...(sort === "rating" ? { selected: true } : {})}, i18n.housingSortRating)
                  ),
                  button({ type: "submit", class: "filter-box__button" }, i18n.housingSearchButton)
              )
            ),
            div({ class: "housing-list" }, renderHousingList(items, filter, params))
          )
    )
  )
}

const renderCommentsSection = (itemId, returnTo, comments = []) => {
  return renderSharedCommentsSection({
    action: `/housing/${encodeURIComponent(itemId)}/comments`,
    comments: comments,
    returnTo: returnTo
  });
};

exports.singleHousingView = async (item, filter = "ALL", comments = [], params = {}) => {
  const returnTo = safeText(params.returnTo) || buildReturnTo(filter, params)
  const isAuthor = String(item.author) === String(userId)
  const requested = safeArr(item.requests).includes(userId)
  const voters = safeArr(item.opinions_inhabitants)
  const canClearnet = clearnetEligible(item)
  const isClearnet = canClearnet && !!item.clearnet

  const chips = [
    item.visibility === "HIDDEN" ? renderVisibilityChip("HIDDEN", i18n) : null,
    renderTypeChip(item),
    renderStatusChip(item.status),
    requested ? renderRequestedChip() : null,
    renderLifespanChip(item.lifetime, i18n),
    renderEcoTax(item.msgSize, item.id),
    renderReachChip(isClearnet, i18n, isClearnet ? housingClearnetHref(item) : null),
    isAuthor && canClearnet ? renderClearnetSwitch("housing", item.rootId || item.id, isClearnet) : null
  ].filter(Boolean)

  const sideActions = []
  const requestToggle = renderRequestToggle(item, returnTo)
  if (requestToggle) sideActions.push(requestToggle)
  const ownerActions = renderOwnerActions(item, returnTo)

  const nextVisibility = item.visibility === "PUBLIC" ? "HIDDEN" : "PUBLIC"
  const isHidden = item.visibility === "HIDDEN"
  const visibilityRow = isAuthor
    ? div({ class: "tribe-side-actions shop-visibility-row housing-visibility-row" },
        span({ class: "card-label" }, `${i18n.visibilityLabel || "Visibility"}: `),
        isHidden
          ? renderStateChip("encrypted", "🔒", i18n.encryptedChipLabel || "E2E")
          : renderStateChip("mutuals", "👁", i18n.visibilityPublic || "PUBLIC"),
        form({ method: "POST", action: `/housing/visibility/${encodeURIComponent(item.id)}`, class: "inline-form" },
          input({ type: "hidden", name: "returnTo", value: returnTo }),
          input({ type: "hidden", name: "visibility", value: nextVisibility }),
          button({ type: "submit", class: "tribe-action-btn" },
            nextVisibility === "PUBLIC" ? (i18n.visibilityMakePublic || "Make public") : (i18n.visibilityMakeHidden || "Make hidden"))
        )
      )
    : null

  const cover = imagesOf(item)[0]
  const housingSide = div({ class: "tribe-side" },
    div({ class: "card-header activity-card-header" },
      renderContentActions(item.id, `/housing/${encodeURIComponent(item.id)}`, { spread: params.spreads || null, author: item.author, favKind: 'housing', isFavorite: item.isFavorite, reportTitle: item.title, returnTo, deleteAction: isAuthor ? contentDeleteAction("housing", item.id) : null })
    ),
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, safeText(item.title) || i18n.housingTitle)
    ),
    chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
    renderStarRating(item.opinions, voters.length),
    cover && !isVideoEntry(cover) ? img({ src: blobUrl(blobIdOf(cover), 256), class: "tribe-detail-image", alt: "" }) : null,
    renderInfoTable(item),
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.housingRequests}: ${item.requestCount || 0}`)
    ),
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null,
    renderStatusRow(item, returnTo),
    ownerActions.length ? div({ class: "tribe-side-actions owner-actions" }, ...ownerActions) : null,
    visibilityRow,
    renderTags(item.tags)
  )

  const renderSection = (titleText, bodyText) =>
    safeText(bodyText)
      ? div({ class: "job-section" },
          h2({ class: "job-section-title" }, titleText),
          p({ class: "tribe-side-description" }, ...renderStyledText(bodyText))
        )
      : null

  const housingMain = div({ class: "tribe-main" },
    renderPhotoGallery(item),
    renderSection(i18n.housingDescription, item.description),
    renderSection(i18n.housingRules, item.rules),
    item.mapUrl ? div({ class: "job-section" }, renderMapEmbed(params.mapData, item.mapUrl)) : null,
    p({ class: "card-footer" },
      span({ class: "date-link" }, `${moment(item.createdAt).format("YYYY/MM/DD HH:mm")}`),
      userLink(item.author)
    ),
    renderEngagement(item.id,
      !isAuthor && item.everRequestedByViewer
        ? renderOpinionsVoting("/housing/opinions", item.id, item.opinions, returnTo, voters)
        : null,
      renderCommentsSection(item.id, returnTo, comments)
    )
  )

  return template(
    i18n.housingTitle,
    section(
      div({ class: "tags-header module-header-line" }, h2(i18n.housingTitle), p(i18n.housingDescriptionText)),
      renderFiltersBar(filter, params),
      div({ class: "tribe-details" }, housingSide, housingMain)
    )
  )
}

exports.clearnetHousingView = async (item, params = {}) => {
  const { escapeHtml: esc, renderRichText, renderKindTag, renderTagChips, blobUrl: cnBlob, renderClearnetPage } = require("./clearnet_view")
  const title = esc(item.title || i18n.housingTitle)
  const point = params.mapPoint || null
  const media = imagesOf(item).map(entry => ({ src: cnBlob(entry), video: isVideoEntry(entry) })).filter(m => m.src)
  const clip = cnBlob(item.video)
  if (clip && !media.some(m => m.src === clip)) media.push({ src: clip, video: true })
  const cover = (media.find(m => !m.video) || {}).src || null
  const day = (v) => moment(v).format("YYYY/MM/DD")
  const rows = [
    [i18n.housingProperty, i18n["housingProperty" + String(item.property_type || "").toUpperCase()] || ""],
    [i18n.housingRooms, item.rooms > 0 ? String(item.rooms) : ""],
    [i18n.housingSize, item.size > 0 ? `${item.size} m²` : ""],
    [i18n.housingCapacity, item.capacity > 0 ? String(item.capacity) : ""],
    [i18n.housingAvailableFrom, item.availableFrom ? day(item.availableFrom) : ""],
    [i18n.housingAvailableTo, item.availableTo ? day(item.availableTo) : ""]
  ].filter(([, v]) => v)
  const textSection = (heading, text) => safeText(text) ? `<div class="cn-housing-section"><h2>${esc(heading)}</h2><div class="cn-housing-text">${renderRichText(text)}</div></div>` : ""
  const extraCss = `
.cn-housing-title{color:var(--fg);margin:0 0 16px 0;font-size:32px;font-weight:700}
.cn-housing-meta{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px}
.cn-housing-meta-item{background:var(--bg-sub);border:1px solid var(--border);border-radius:6px;padding:8px 14px;font-size:14px;color:var(--fg-soft);display:inline-flex;align-items:center;gap:6px}
.cn-housing-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin:0 0 20px 0}
.cn-housing-gallery img,.cn-housing-gallery video{width:100%;height:auto;display:block;border:1px solid var(--border);border-radius:6px;background:#000}
.cn-housing-info{border-collapse:collapse;margin:0 0 20px 0}
.cn-housing-info td{padding:6px 14px 6px 0;font-size:14px;color:var(--fg-soft);border-bottom:1px solid var(--border)}
.cn-housing-info td:first-child{color:var(--fg-dim);text-transform:uppercase;letter-spacing:1px;font-size:12px}
.cn-housing-section h2{color:var(--fg);font-size:18px;text-transform:uppercase;letter-spacing:2px;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--border)}
.cn-housing-text{color:var(--fg-soft);line-height:1.6;font-size:15px;word-break:break-word}
`
  const body = `
  <h1 class="cn-housing-title">${title}</h1>
  <div class="cn-housing-meta">
    <span class="cn-housing-meta-item">${renderKindTag("housing")}</span>
    <span class="cn-housing-meta-item">${esc(i18n["housingType" + String(item.housing_type || "").toUpperCase()] || item.housing_type || "")}</span>
    ${safeText(item.place) ? `<span class="cn-housing-meta-item">📍 ${esc(item.place)}</span>` : ""}
    ${point ? `<a class="cn-housing-meta-item" href="geo:${point.lat},${point.lng}">⌖ ${point.title ? `${esc(point.title)} · ` : ""}${point.lat}, ${point.lng}</a>` : ""}
    ${item.createdAt ? `<span class="cn-housing-meta-item">📅 ${esc(day(item.createdAt))}</span>` : ""}
    <span class="cn-price">${esc(priceLabel(item))}</span>
  </div>
  <hr class="cn-sep"/>
  ${media.length ? `<div class="cn-housing-gallery">${media.map(m => m.video ? `<video controls preload="metadata" src="${m.src}"></video>` : `<img src="${m.src}" alt="${title}" loading="lazy"/>`).join("")}</div>` : ""}
  ${rows.length ? `<table class="cn-housing-info">${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>` : ""}
  ${textSection(i18n.housingDescription, item.description)}
  ${textSection(i18n.housingRules, item.rules)}
  ${renderTagChips(item.tags)}
`
  return renderClearnetPage({
    title: `${item.title || i18n.housingTitle} | Oasis`,
    ogTitle: item.title || i18n.housingTitle,
    ogDescription: item.description || "",
    ogImage: cover,
    extraCss,
    body,
    hubFeedId: item.author || null
  })
}
