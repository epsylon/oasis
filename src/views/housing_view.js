const { form, button, div, h2, p, section, input, label, textarea, br, a, span, select, option, img, video, table, tr, td } = require("../server/node_modules/hyperaxe")
const { renderCommentsSection: renderSharedCommentsSection } = require("./comments_view");
const { template, i18n, userLink, renderOpenClosedChip, renderStateChip, renderVisibilityChip, renderLifespanChip, renderEcoTax, renderSpreadButton, renderContentActions, renderOpinionsVoting, renderEngagement, renderSpreadEditWarning } = require("./main_views")
const { blobUrl, blobIdOf, isVideoEntry, imagesOf, renderMediaThumb, renderPhotoGallery, renderGalleryFields } = require("./gallery_view")
const moment = require("../server/node_modules/moment")
const { config } = require("../server/SSB_server.js")
const { renderUrl } = require("../backend/renderUrl")
const opinionCategories = require("../backend/opinion_categories")
const { renderMapEmbed, renderMapLocationVisitLabel } = require("./maps_view")

const userId = config.keys.id

const FILTERS = [
  { key: "ALL", i18n: "housingFilterAll" },
  { key: "RECENT", i18n: "housingFilterRecent" },
  { key: "MINE", i18n: "housingFilterMine" },
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
    ),
    form({ method: "POST", action: `/housing/delete/${encodeURIComponent(item.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "delete-btn", type: "submit" }, i18n.housingDeleteButton)
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

  return div({ class: "housing-grid" },
    list.map((item) => {
      const clip = safeText(item.video)
      const cover = imagesOf(item)[0]
      const isOwn = item.author && String(item.author) === String(userId)
      const requested = safeArr(item.requests).includes(userId)
      const chips = [
        renderTypeChip(item),
        renderStatusChip(item.status),
        item.visibility === "HIDDEN" ? renderVisibilityChip("HIDDEN", i18n) : null,
        requested ? renderRequestedChip() : null,
        renderLifespanChip(item.lifetime, i18n)
      ].filter(Boolean)

      return div({ class: "trending-card housing-card" + (isOwn ? " own-content" : "") },
        div({ class: "card-header activity-card-header" },
          span(),
          renderContentActions(item.id, `/housing/${encodeURIComponent(item.id)}`, { spread: params.spreadMap && params.spreadMap.get(item.id) || null, author: item.author, favKind: 'housing', isFavorite: item.isFavorite, reportTitle: item.title })
        ),
        div({ class: "card-section housing-card-body" },
          clip || (cover && isVideoEntry(cover))
            ? div({ class: "tribe-card-image-wrapper housing-card-video" },
                video({ controls: true, class: "housing-card-hero-video", src: blobUrl(blobIdOf(clip || cover)) })
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
            div({ class: "card-date-highlight" }, priceLabel(item)),
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

const renderHousingForm = (item = {}, mode = "create", maxImages = MAX_IMAGES, spreadWarning = null) => {
  const isEdit = mode === "edit"
  const type = String(item.housing_type || "").toLowerCase()
  return div({ class: "div-center housing-form" },
    form({
      action: isEdit ? `/housing/update/${encodeURIComponent(item.id)}` : "/housing/create",
      method: "POST",
      enctype: "multipart/form-data"
    },
      input({ type: "hidden", name: "returnTo", value: "/housing?filter=MINE" }),
      isEdit ? spreadWarning : null,
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
      textarea({ name: "description", rows: "6", required: true, placeholder: i18n.housingDescriptionPlaceholder }, item.description || ""),
      br(),
      br(),
      label(i18n.housingRules),
      br(),
      textarea({ name: "rules", rows: "4", placeholder: i18n.housingRulesPlaceholder }, item.rules || ""),
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
      input({ type: "date", name: "availableFrom", required: true, min: isEdit ? undefined : today(), value: item.availableFrom ? String(item.availableFrom).slice(0, 10) : "" }),
      br(),
      br(),
      label(i18n.housingAvailableTo),
      br(),
      input({ type: "date", name: "availableTo", min: item.availableFrom ? String(item.availableFrom).slice(0, 10) : today(), value: item.availableTo ? String(item.availableTo).slice(0, 10) : "" }),
      br(),
      br(),
      label(i18n.housingTags),
      br(),
      input({ type: "text", name: "tags", value: Array.isArray(item.tags) ? item.tags.join(", ") : (item.tags || "") }),
      br(),
      br(),
      label(i18n.visibilityLabel || "Visibility"),
      br(),
      select({ name: "visibility" },
        option({ value: "PUBLIC", ...((item.visibility || "PUBLIC") === "PUBLIC" ? { selected: true } : {})}, i18n.visibilityPublic || "Public"),
        option({ value: "HIDDEN", ...(item.visibility === "HIDDEN" ? { selected: true } : {})}, i18n.visibilityHidden || "Hidden")
      ),
      br(),
      br(),
      button({ type: "submit" }, isEdit ? i18n.housingUpdateButton : i18n.housingCreateButton)
    )
  )
}

const renderFiltersBar = (filter, params = {}) =>
  div({ class: "filters" },
    form({ method: "GET", action: "/housing", class: "ui-toolbar ui-toolbar--filters" },
      input({ type: "hidden", name: "search", value: safeText(params.search || "") }),
      input({ type: "hidden", name: "minPrice", value: String(params.minPrice ?? "") }),
      input({ type: "hidden", name: "maxPrice", value: String(params.maxPrice ?? "") }),
      input({ type: "hidden", name: "place", value: safeText(params.place || "") }),
      input({ type: "hidden", name: "sort", value: safeText(params.sort || "") }),
      ...FILTERS.map(f =>
        button({ type: "submit", name: "filter", value: f.key, class: filter === f.key ? "filter-btn active" : "filter-btn" }, String(i18n[f.i18n]).toUpperCase())
      ),
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

  return template(
    i18n.housingTitle,
    section(
      div({ class: "tags-header" },
        h2(i18n.housingTitle),
        p(i18n.housingDescriptionText)
      ),
      renderFiltersBar(filter, { search, minPrice, maxPrice, place, sort })
    ),
    section(
      isForm
        ? renderHousingForm(filter === "EDIT" ? (Array.isArray(items) ? items[0] : items) || {} : (params.draft || {}), filter === "EDIT" ? "edit" : "create", Number(params.maxImages) > 0 ? Number(params.maxImages) : MAX_IMAGES, await renderSpreadEditWarning(filter === "EDIT" ? ((Array.isArray(items) ? items[0] : items) || {}).id : null))
        : section(
            div({ class: "housing-search" },
              form({ method: "GET", action: "/housing", class: "filter-box" },
                input({ type: "hidden", name: "filter", value: filter || "ALL" }),
                input({ type: "text", name: "search", value: search, placeholder: i18n.housingSearchPlaceholder, class: "filter-box__input" }),
                div({ class: "filter-box__controls" },
                  input({ type: "text", name: "place", value: place, placeholder: i18n.housingPlacePlaceholder, class: "filter-box__input housing-place-input" }),
                  div({ class: "transfer-range" },
                    input({ type: "number", name: "minPrice", step: "0.01", min: "0", value: String(minPrice ?? ""), placeholder: i18n.housingMinPrice, class: "filter-box__number transfer-amount-input" }),
                    input({ type: "number", name: "maxPrice", step: "0.01", min: "0", value: String(maxPrice ?? ""), placeholder: i18n.housingMaxPrice, class: "filter-box__number transfer-amount-input" })
                  ),
                  select({ name: "sort", class: "filter-box__select" },
                    option({ value: "recent", ...(sort === "recent" ? { selected: true } : {})}, i18n.housingSortRecent),
                    option({ value: "price", ...(sort === "price" ? { selected: true } : {})}, i18n.housingSortPrice),
                    option({ value: "requests", ...(sort === "requests" ? { selected: true } : {})}, i18n.housingSortRequests),
                    option({ value: "rating", ...(sort === "rating" ? { selected: true } : {})}, i18n.housingSortRating)
                  ),
                  button({ type: "submit", class: "filter-box__button" }, i18n.housingSearchButton)
                )
              )
            ),
            br(),
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

  const chips = [
    renderTypeChip(item),
    renderStatusChip(item.status),
    item.visibility === "HIDDEN" ? renderVisibilityChip("HIDDEN", i18n) : null,
    requested ? renderRequestedChip() : null,
    renderLifespanChip(item.lifetime, i18n),
    renderEcoTax(item.msgSize, item.id)
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
      renderContentActions(item.id, null, { spread: params.spreads || null, author: item.author, favKind: 'housing', isFavorite: item.isFavorite, reportTitle: item.title })
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
          p({ class: "tribe-side-description" }, ...renderUrl(bodyText))
        )
      : null

  const housingMain = div({ class: "tribe-main" },
    renderPhotoGallery(item),
    renderSection(i18n.housingDescription, item.description),
    renderSection(i18n.housingRules, item.rules),
    item.mapUrl ? div({ class: "job-section" }, renderMapEmbed(params.mapData, item.mapUrl)) : null,
    p({ class: "card-footer" },
      span({ class: "date-link" }, `${moment(item.createdAt).format("YYYY/MM/DD HH:mm")} ${i18n.performed} `),
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
      div({ class: "tags-header" }, h2(i18n.housingTitle), p(i18n.housingDescriptionText)),
      renderFiltersBar(filter, params),
      div({ class: "tribe-details" }, housingSide, housingMain)
    )
  )
}
