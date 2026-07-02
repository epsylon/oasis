const { div, h2, p, section, button, form, a, span, textarea, br, input, label, select, option, img, progress, video, table, tr, td } = require("../server/node_modules/hyperaxe")
const { template, i18n, userLink, renderStateChip, renderLifespanChip, renderSpreadButton, renderOpinionsVoting } = require("./main_views")
const moment = require("../server/node_modules/moment")
const { config } = require("../server/SSB_server.js")
const { renderUrl } = require("../backend/renderUrl")
const { renderMapLocationUrl, renderMapEmbed, renderMapLocationVisitLabel } = require("./maps_view")
const opinionCategories = require("../backend/opinion_categories")
const { renderReachChip, renderClearnetUrlBlock, renderClearnetPage, renderClearnetSearchForm, renderEncryptedChip, blobUrl: cnBlobUrl, escapeHtml: cnEscapeHtml } = require("./clearnet_view")

const userId = config.keys.id
const safeArr = (v) => (Array.isArray(v) ? v : [])
const safeText = (v) => String(v || "").trim()
const voteSum = (opinions = {}) => Object.values(opinions || {}).reduce((s, n) => s + (Number(n) || 0), 0)
const sumCats = (opinions = {}, cats = []) => (cats || []).reduce((s, c) => s + (Number((opinions || {})[c]) || 0), 0)
const renderStarRating = (opinions, voterCount) => {
  const pos = sumCats(opinions, opinionCategories.positive)
  const neg = sumCats(opinions, opinionCategories.constructive) + sumCats(opinions, opinionCategories.moderation)
  const totalVotes = pos + neg
  const full = totalVotes > 0 ? Math.round((pos / totalVotes) * 5) : 0
  const stars = "\u2605".repeat(full) + "\u2606".repeat(5 - full)
  return span({ class: "shop-product-stars" }, `${stars} (${voterCount})`)
}

const renderMediaBlob = (value, fallbackSrc = null, attrs = {}) => {
  if (!value) return fallbackSrc ? img({ src: fallbackSrc, ...attrs }) : null
  const s = String(value).trim()
  if (!s) return fallbackSrc ? img({ src: fallbackSrc, ...attrs }) : null
  if (s.startsWith('&')) return img({ src: `/blob/${encodeURIComponent(s)}`, ...attrs })
  const mVideo = s.match(/\[video:[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mVideo) return video({ controls: true, class: attrs.class || 'post-video', src: `/blob/${encodeURIComponent(mVideo[1])}` })
  const mImg = s.match(/!\[[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mImg) return img({ src: `/blob/${encodeURIComponent(mImg[1])}`, ...attrs })
  return fallbackSrc ? img({ src: fallbackSrc, ...attrs }) : null
}

const buildReturnTo = (filter, params = {}) => {
  const f = safeText(filter || "all")
  const q = safeText(params.q || "")
  const sort = safeText(params.sort || "recent")
  const parts = [`filter=${encodeURIComponent(f)}`]
  if (q) parts.push(`q=${encodeURIComponent(q)}`)
  if (sort) parts.push(`sort=${encodeURIComponent(sort)}`)
  return `/shops?${parts.join("&")}`
}

const renderModeButtons = (currentFilter) =>
  div({ class: "tribe-mode-buttons" },
    ["all", "recent", "mine", "top", "products", "prices", "favorites"].map(f =>
      form({ method: "GET", action: "/shops" },
        input({ type: "hidden", name: "filter", value: f }),
        button({ type: "submit", class: currentFilter === f ? "filter-btn active" : "filter-btn" }, i18n[`shopFilter${f.charAt(0).toUpperCase() + f.slice(1)}`] || f.toUpperCase())
      )
    ),
    form({ method: "GET", action: "/shops/purchases" },
      button({ type: "submit", class: currentFilter === "purchases" ? "filter-btn active" : "filter-btn" }, (i18n.shopPurchasesButton || "Purchases").toUpperCase())
    ),
    form({ method: "GET", action: "/shops" },
      input({ type: "hidden", name: "filter", value: "create" }),
      button({ type: "submit", class: "create-button" }, i18n.shopUpload)
    )
  )

const renderFavoriteToggle = (shop, returnTo) =>
  form(
    { method: "POST", action: shop.isFavorite ? `/shops/favorites/remove/${encodeURIComponent(shop.key)}` : `/shops/favorites/add/${encodeURIComponent(shop.key)}` },
    returnTo ? input({ type: "hidden", name: "returnTo", value: returnTo }) : null,
    button({ type: "submit", class: "filter-btn" }, shop.isFavorite ? i18n.shopRemoveFavorite : i18n.shopAddFavorite)
  )

const renderShopCard = exports.renderShopCard = (shop, filter, params = {}) => {
  const returnTo = buildReturnTo(filter, params)
  const isAuthor = String(shop.author) === String(userId)

  return div({ class: "tribe-card" },
    div({ class: "tribe-card-image-wrapper" },
      a({ href: `/shops/${encodeURIComponent(shop.key)}` },
        renderMediaBlob(shop.image, '/assets/images/default-avatar.png', { class: 'tribe-card-hero-image' })
      )
    ),
    div({ class: "tribe-card-body" },
      div({ class: "shop-title-row" },
        h2({ class: "tribe-card-title" }, a({ href: `/shops/${encodeURIComponent(shop.key)}` }, shop.title || i18n.shopUntitled))
      ),
      div({ class: "card-chips-row" },
        shop.visibility === "CLOSED"
          ? renderStateChip("closed", "✗", i18n.shopClosed)
          : renderStateChip("mutuals", "✓", i18n.shopOpen),
        renderLifespanChip(shop.lifetime, i18n)
      ),
      div({ class: "tribe-card-members" },
        span({ class: "tribe-members-count" }, `${i18n.shopProducts}: ${shop.productCount || 0}`)
      ),
      div({ class: "card-spread-centered" }, renderSpreadButton(shop.key, params.spreadMap && params.spreadMap.get(shop.key))),
      div({ class: "card-visit-btn-centered" },
        form({ method: 'GET', action: `/shops/${encodeURIComponent(shop.key)}` },
          button({ type: 'submit', class: 'filter-btn' }, i18n.viewShop || i18n.shopVisitShop || 'View Shop')
        )
      )
    )
  )
}

const renderProductCard = (product, shopId, returnTo) => {
  const isAuthor = String(product.author) === String(userId)
  const stock = Number(product.stock) || 0
  const voterCount = safeArr(product.opinions_inhabitants).length
  const productUrl = `/shops/product/${encodeURIComponent(product.key)}?shopId=${encodeURIComponent(shopId)}`

  return div({ class: "shop-product-card" },
    product.image ? div({ class: "shop-product-media" }, a({ href: productUrl }, renderMediaBlob(product.image))) : null,
    div({ class: "shop-product-body" },
      product.shopTitle ? p(a({ href: `/shops/${encodeURIComponent(shopId)}`, class: "user-link" }, product.shopTitle)) : null,
      h2(a({ href: productUrl }, product.title || i18n.shopProductUntitled)),
      renderStarRating(product.opinions, voterCount),
      product.description ? p(...renderUrl(product.description)) : null,
      div({ class: "shop-product-price" }, `${Number(product.price || 0).toFixed(6)} ECO`),
      div({ class: "confirmations-block stock-block" },
        div({ class: "card-field" },
          span({ class: "card-label" }, `${i18n.shopProductStock}: `),
          span({ class: "card-value" }, stock > 0 ? String(stock) : i18n.shopOutOfStock)
        ),
        progress({ class: "confirmations-progress stock-progress", value: Math.min(stock, 100), max: 100 })
      ),
      (() => {
        const actions = [];
        if (!isAuthor && stock > 0) {
          actions.push(a({ href: productUrl, class: "buy-btn" }, i18n.marketActionsBuy || i18n.shopBuy));
        }
        actions.push(form({ method: "POST", action: product.isFavorite ? `/shops/favorites/remove/${encodeURIComponent(product.key)}` : `/shops/favorites/add/${encodeURIComponent(product.key)}` },
          returnTo ? input({ type: "hidden", name: "returnTo", value: returnTo }) : null,
          button({ type: "submit", class: "filter-btn" }, product.isFavorite ? i18n.shopRemoveFavorite : i18n.shopAddFavorite)));
        return actions.length ? div({ class: "shop-product-actions" }, ...actions) : null;
      })()
    )
  )
}

const renderCommentsSection = (parentId, returnTo, comments = []) => {
  const count = Array.isArray(comments) ? comments.length : 0
  return div({ class: "vote-comments-section market-comments" },
    div({ class: "comments-count" }, span({ class: "card-label" }, i18n.voteCommentsLabel + ": "), span({ class: "card-value" }, String(count))),
    div({ class: "comment-form-wrapper" },
      h2({ class: "comment-form-title" }, i18n.voteNewCommentLabel),
      form({ method: "POST", action: `/shops/${encodeURIComponent(parentId)}/comments`, class: "comment-form", enctype: "multipart/form-data" },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        textarea({ name: "text", rows: 4, class: "comment-textarea", placeholder: i18n.voteNewCommentPlaceholder }),
        div({ class: "comment-file-upload" }, label(i18n.uploadMedia), input({ type: "file", name: "blob" })),
        br(),
        button({ type: "submit", class: "comment-submit-btn" }, i18n.voteNewCommentButton)
      )
    ),
    count
      ? div({ class: "comments-list" },
          comments.map(c => {
            const author = c.value?.author || ""
            const ts = c.value?.timestamp || c.timestamp
            const text = c.value?.content?.text || ""
            const rootId = c.value?.content?.fork || c.value?.content?.root || null
            return div({ class: "votations-comment-card" },
              span({ class: "created-at" },
                span(i18n.createdBy),
                author ? userLink(author) : span("(unknown)"),
                ts ? span(" | ", span({ class: "votations-comment-date" }, moment(ts).format("YYYY/MM/DD HH:mm:ss"))) : "",
                ts && rootId ? span(" | ", a({ href: `/thread/${encodeURIComponent(rootId)}#${encodeURIComponent(c.key)}` }, moment(ts).fromNow())) : ""
              ),
              p({ class: "votations-comment-text" }, ...renderUrl(text))
            )
          })
        )
      : p({ class: "votations-no-comments" }, i18n.voteNoCommentsYet)
  )
}

const renderShopForm = (filter, shop = {}, params = {}) => {
  const isEdit = filter === "edit"
  const returnTo = safeText(params.returnTo) || buildReturnTo("all")
  return div({ class: "create-tribe-form" },
    h2(isEdit ? i18n.shopUpdateSectionTitle : i18n.shopCreateSectionTitle),
    form({ action: isEdit ? `/shops/update/${encodeURIComponent(shop.key || "")}` : "/shops/create", method: "POST", enctype: "multipart/form-data" },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      label(i18n.title || "Title"), br,
      input({ type: "text", name: "title", required: true, placeholder: i18n.shopTitlePlaceholder || "Name of your shop", value: shop.title || "" }), br(),
      label(i18n.shopShortDescription), br,
      input({ type: "text", name: "shortDescription", required: true, maxlength: 160, placeholder: i18n.shopShortDescriptionPlaceholder || "Brief description of your shop", value: shop.shortDescription || "" }), br(),
      label(i18n.description || "Description"), br,
      textarea({ name: "description", rows: 4, placeholder: i18n.shopDescriptionPlaceholder || "Detailed description of your shop" }, shop.description || ""), br,
      label(i18n.blogImage || "Upload media (max-size: 50MB)"), br,
      input({ type: "file", name: "image", accept: "image/*,video/*" }), br(), br(),
      label(i18n.shopUrl), br,
      input({ type: "text", name: "url", placeholder: "https://", value: shop.url || "" }), br,
      label(i18n.shopLocation), br,
      input({ type: "text", name: "location", placeholder: i18n.shopLocationPlaceholder || "City, Country", value: shop.location || "" }), br,
      label(i18n.mapLocationTitle || "Map Location"), br,
      input({ type: "text", name: "mapUrl", placeholder: i18n.mapUrlPlaceholder || "/maps/MAP_ID", value: shop.mapUrl || "" }), br,
      label(i18n.shopTags), br,
      input({ type: "text", name: "tags", placeholder: i18n.shopTagsPlaceholder || "tag1, tag2, tag3", value: safeArr(shop.tags).join(", ") }), br,
      isEdit ? null : label(i18n.shopVisibility),
      isEdit ? null : br,
      isEdit ? null : select({ name: "visibility" },
        option({ value: "OPEN", selected: (shop.visibility || "OPEN") === "OPEN" }, i18n.shopOpen),
        option({ value: "CLOSED", selected: shop.visibility === "CLOSED" }, i18n.shopClosed)
      ),
      isEdit ? null : br(),
      br(),
      button({ type: "submit" }, isEdit ? i18n.shopUpdate : i18n.shopCreate)
    )
  )
}

const renderProductForm = (shopId, product = {}, isEdit = false, returnTo = "") => {
  return div({ class: "create-tribe-form" },
    h2(isEdit ? i18n.shopProductUpdate : i18n.shopProductAdd),
    form({ action: isEdit ? `/shops/product/update/${encodeURIComponent(product.key || "")}` : "/shops/product/create", method: "POST", enctype: "multipart/form-data" },
      input({ type: "hidden", name: "shopId", value: shopId }),
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      label(i18n.title || "Title"), br,
      input({ type: "text", name: "title", required: true, value: product.title || "" }), br(),
      label(i18n.description || "Description"), br,
      textarea({ name: "description", rows: 4 }, product.description || ""), br,
      label(i18n.shopProductPrice), br,
      input({ type: "number", name: "price", step: "0.000001", min: "0.000001", required: true, value: product.price || "" }), br(), br(),
      label(i18n.shopProductStock), br,
      input({ type: "number", name: "stock", min: "0", value: product.stock !== undefined ? product.stock : 1 }), br(), br(),
      label(i18n.blogImage || "Upload media (max-size: 50MB)"), br,
      input({ type: "file", name: "image", accept: "image/*,video/*" }), br(), br(),
      input({ type: "hidden", name: "featured", value: "0" }),
      label(i18n.shopProductFeatured),
      input({ id: "featured", type: "checkbox", name: "featured", value: "1", class: "meme-checkbox", ...(product.featured ? { checked: true } : {}) }),
      br(),
      br(),
      ...(isEdit ? [] : [
        input({ type: "hidden", name: "sendToMarket", value: "0" }),
        label(i18n.shopSendToMarket),
        input({ id: "sendToMarket", type: "checkbox", name: "sendToMarket", value: "1", class: "meme-checkbox" }),
        br(),
        br(),
      ]),
      button({ type: "submit" }, isEdit ? i18n.shopUpdate : i18n.shopProductAdd)
    )
  )
}

exports.shopsView = async (shops, filter, shopToEdit = null, params = {}) => {
  const q = safeText(params.q || "")
  const sort = safeText(params.sort || "recent")
  const list = safeArr(shops)

  const title =
    filter === "mine" ? i18n.shopMineSectionTitle :
    filter === "recent" ? i18n.shopRecentSectionTitle :
    filter === "top" ? i18n.shopTopSectionTitle :
    filter === "products" ? i18n.shopProductsSectionTitle :
    filter === "prices" ? (i18n.shopPricesSectionTitle || "Products by Price") :
    filter === "favorites" ? i18n.shopFavoritesSectionTitle :
    filter === "create" ? i18n.shopCreateSectionTitle :
    filter === "edit" ? i18n.shopUpdateSectionTitle :
    i18n.shopAllSectionTitle

  const isForm = filter === "create" || filter === "edit"

  const viewerClearnet = !!(params.viewerPrefs && params.viewerPrefs.clearnetShops)
  const header = [
    div({ class: "tags-header" },
      h2(title),
      p(i18n.shopDescription)
    ),
    div({ class: "shop-title-row" }, renderReachChip(viewerClearnet, i18n)),
    br()
  ]

  const searchBar = div({ class: "filters" },
    form({ method: "GET", action: "/shops" },
      input({ type: "hidden", name: "filter", value: filter }),
      input({ type: "text", name: "q", placeholder: i18n.shopSearchPlaceholder, value: q }),
      br(),
      button({ type: "submit" }, i18n.search),
      br()
    )
  )

  const sortedProducts = filter === "products"
    ? [...list].sort((a, b) => safeArr(b.opinions_inhabitants).length - safeArr(a.opinions_inhabitants).length)
    : filter === "prices"
      ? [...list].sort((a, b) => Number(b.price || 0) - Number(a.price || 0))
      : list

  return template(
    title,
    section(...header),
    section(renderModeButtons(filter)),
    !isForm ? section(searchBar) : null,
    section(
      isForm
        ? renderShopForm(filter, filter === "edit" ? (shopToEdit || {}) : {}, params)
        : filter === "products" || filter === "prices"
          ? div({ class: "shop-products-grid" },
              sortedProducts.length
                ? sortedProducts.map(prod => renderProductCard(prod, prod.shopId, buildReturnTo(filter, params)))
                : p(i18n.shopNoItems)
            )
          : div({ class: "tribe-grid" },
              list.length
                ? list.map(shop => renderShopCard(shop, filter, { q, sort, spreadMap: params.spreadMap }))
                : p(i18n.shopNoItems)
            )
    )
  )
}

exports.singleShopView = async (shop, filter, products = [], comments = [], params = {}) => {
  const q = safeText(params.q || "")
  const sort = safeText(params.sort || "recent")
  const returnTo = safeText(params.returnTo) || buildReturnTo(filter, { q, sort })
  const isAuthor = String(shop.author) === String(userId)
  const fullShareUrl = `/shops/${encodeURIComponent(shop.key)}`

  const isClearnet = !!(params.authorPrefs && params.authorPrefs.clearnetShops && shop.visibility !== 'CLOSED');
  const shopSide = div({ class: "tribe-side" },
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, shop.title || i18n.shopUntitled)
    ),
    div({ class: "card-chips-row" },
      shop.visibility === "CLOSED"
        ? renderStateChip("closed", "✗", i18n.shopClosed)
        : renderStateChip("mutuals", "✓", i18n.shopOpen),
      shop.encrypted ? renderStateChip("encrypted", "🔒", i18n.encryptedChipLabel || "E2E") : null,
      renderLifespanChip(shop.lifetime, i18n),
      renderReachChip(isClearnet, i18n)
    ),
    div({ class: "card-spread-centered" }, renderSpreadButton(shop.key, params.spreads)),
    renderMediaBlob(shop.image, '/assets/images/default-avatar.png', { class: 'tribe-detail-image' }),
    shop.description ? p({ class: "tribe-side-description" }, ...renderUrl(shop.description)) : null,
    div({ class: "shop-share" },
      span({ class: "tribe-info-label" }, `${i18n.shopShareUrl}: `),
      input({ type: "text", value: fullShareUrl, readonly: true, class: "shop-share-input" })
    ),
    table({ class: "tribe-info-table" },
      tr(
        td({ class: "tribe-info-label" }, i18n.shopCreatedAt || "CREATED"),
        td({ class: "tribe-info-value", colspan: "3" }, new Date(shop.createdAt).toLocaleString())
      ),
      tr(
        td({ class: "tribe-info-value", colspan: "4" }, userLink(shop.author))
      ),
      shop.location ? tr(
        td({ class: "tribe-info-label" }, i18n.shopLocation),
        td({ class: "tribe-info-value", colspan: "3" }, ...renderUrl(shop.location))
      ) : null,
      tr(
        td({ class: "tribe-info-label" }, i18n.shopStatus || "STATUS"),
        td({ class: "tribe-info-value", colspan: "3" }, shop.visibility === "CLOSED" ? i18n.shopClosed : i18n.shopOpen)
      ),
      shop.url ? tr(
        td({ class: "tribe-info-label" }, i18n.shopUrl),
        td({ class: "tribe-info-value", colspan: "3" }, ...renderUrl(shop.url))
      ) : null
    ),
    renderMapEmbed(params.mapData, shop.mapUrl),
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.shopProducts}: ${shop.productCount || 0}`)
    ),
    div({ class: "tribe-side-actions" },
      renderFavoriteToggle(shop, returnTo),
      shop.author && String(shop.author) !== String(userId)
        ? form({ method: "GET", action: "/pm" }, input({ type: "hidden", name: "recipients", value: shop.author }), button({ type: "submit", class: "tribe-action-btn" }, i18n.privateMessage))
        : null,
      isAuthor
        ? form({ method: "GET", action: `/shops/edit/${encodeURIComponent(shop.key)}` },
            button({ type: "submit", class: "tribe-action-btn" }, i18n.shopUpdate)
          )
        : null,
      isAuthor
        ? form({ method: "GET", action: `/shops/${encodeURIComponent(shop.key)}/orders` },
            button({ type: "submit", class: "tribe-action-btn" },
              i18n.shopOrdersTitle || "Orders",
              Number(shop.pendingOrders || 0) > 0 ? span({ class: "shop-orders-badge", title: i18n.shopOrdersPending || "Pending orders" }, ` ● ${shop.pendingOrders}`) : null
            )
          )
        : null,
      isAuthor
        ? form({ method: "POST", action: `/shops/delete/${encodeURIComponent(shop.key)}` },
            button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.shopDelete)
          )
        : null
    ),
    isAuthor
      ? div({ class: "tribe-side-actions shop-visibility-row" },
          span({ class: "card-label" }, `${i18n.visibilityLabel || "Visibility"}: `),
          shop.encrypted
            ? renderStateChip("encrypted", "🔒", i18n.encryptedChipLabel || "E2E")
            : renderStateChip("mutuals", "👁", i18n.shopOpen),
          shop.encrypted
            ? form({ method: "POST", action: `/shops/generate-invite/${encodeURIComponent(shop.key)}` },
                button({ type: "submit", class: "tribe-action-btn" }, i18n.tribeGenerateInvite))
            : null,
          form({ method: "POST", action: `/shops/visibility/${encodeURIComponent(shop.key)}`, class: "inline-form" },
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            input({ type: "hidden", name: "visibility", value: shop.encrypted ? "OPEN" : "CLOSED" }),
            button({ type: "submit", class: "tribe-action-btn" },
              shop.encrypted ? i18n.shopMakePublic : i18n.shopMakePrivate))
        )
      : null,
    safeArr(shop.tags).length
      ? div({ class: "tribe-side-tags" }, safeArr(shop.tags).map(tag => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)))
      : null
  )

  const shopMain = div({ class: "tribe-main" },
    isAuthor
      ? div({ class: "shop-add-product" },
          renderProductForm(shop.rootId || shop.key, {}, false, returnTo)
        )
      : null,
    div({ class: "shop-products-grid" },
      products.length
        ? products.map(prod => renderProductCard(prod, shop.rootId || shop.key, returnTo))
        : p(i18n.shopNoProducts)
    )
  )

  return template(
    shop.title || i18n.shopTitle,
    section(renderModeButtons(filter)),
    section(
      div({ class: "tribe-details" },
        shopSide,
        shopMain
      )
    )
  )
}

exports.singleProductView = async (product, shop, comments = [], params = {}) => {
  const returnTo = safeText(params.returnTo) || `/shops/${encodeURIComponent(params.shopId || product.shopId)}`
  const isAuthor = String(product.author) === String(userId)
  const stock = Number(product.stock) || 0

  return template(
    product.title || i18n.shopProductTitle,
    section(renderModeButtons("products")),
    section(
      div({ class: "shop-detail" },
        div({ class: "bookmark-topbar transfer-topbar-single" },
          div({ class: "bookmark-topbar-left" },
            product.author && String(product.author) !== String(userId)
              ? form({ method: "GET", action: "/pm" }, input({ type: "hidden", name: "recipients", value: product.author }), button({ type: "submit", class: "filter-btn" }, i18n.privateMessage))
              : null,
            form({ method: "GET", action: `/shops/${encodeURIComponent(product.shopId)}` },
              button({ type: "submit", class: "filter-btn" }, `← ${i18n.shopBackToShop}`))
          ),
          isAuthor
            ? div({ class: "bookmark-actions transfer-actions" },
                form({ method: "GET", action: `/shops/product/edit/${encodeURIComponent(product.key)}` },
                  input({ type: "hidden", name: "shopId", value: product.shopId }),
                  input({ type: "hidden", name: "returnTo", value: returnTo }),
                  button({ class: "update-btn", type: "submit" }, i18n.shopUpdate)
                ),
                form({ method: "POST", action: `/shops/product/delete/${encodeURIComponent(product.key)}` },
                  input({ type: "hidden", name: "returnTo", value: returnTo }),
                  button({ class: "delete-btn", type: "submit" }, i18n.shopDelete)
                )
              )
            : null
        ),
        product.image ? div({ class: "shop-detail-media" }, renderMediaBlob(product.image)) : null,
        h2(product.title),
        renderStarRating(product.opinions, safeArr(product.opinions_inhabitants).length),
        product.description ? div({ class: "shop-detail-desc" }, ...renderUrl(product.description)) : null,
        div({ class: "shop-product-price" }, `${Number(product.price || 0).toFixed(6)} ECO`),
        div({ class: "confirmations-block stock-block" },
          div({ class: "card-field" },
            span({ class: "card-label" }, `${i18n.shopProductStock}: `),
            span({ class: "card-value" }, stock > 0 ? String(stock) : i18n.shopOutOfStock)
          ),
          progress({ class: "confirmations-progress stock-progress", value: Math.min(stock, 100), max: 100 })
        ),
        !isAuthor && stock > 0
          ? form({ method: "POST", action: `/shops/product/buy/${encodeURIComponent(product.key)}`, class: "shop-buy-form" },
              input({ type: "hidden", name: "returnTo", value: returnTo }),
              p({ class: "shop-buy-form-note" }, i18n.shopBuyEncryptedNote || "Your delivery details are sent encrypted only to the shop owner."),
              label(i18n.shopBuyDeliveryAddress || "Delivery address"),
              br(),
              textarea({ name: "deliveryAddress", required: true, rows: 3, placeholder: i18n.shopBuyDeliveryAddressPlaceholder || "" }),
              br(),
              br(),
              label(i18n.shopBuyContact || "Contact"),
              br(),
              input({ type: "text", name: "contact", placeholder: i18n.shopBuyContactPlaceholder || "email, phone, etc." }),
              br(),
              br(),
              label(i18n.shopBuyNotes || "Notes"),
              br(),
              textarea({ name: "notes", rows: 2, placeholder: i18n.shopBuyNotesPlaceholder || "" }),
              br(),
              br(),
              button({ type: "submit", class: "buy-btn" }, i18n.marketActionsBuy || i18n.shopBuy)
            )
          : null,
        br(),
        p({ class: "card-footer" },
          span({ class: "date-link" }, moment(product.createdAt).format("YYYY-MM-DD HH:mm")),
          " ",
          userLink(product.author)
        ),
        !isAuthor && params.canRate
          ? renderOpinionsVoting('/shops/product/opinions', product.key, product.opinions, returnTo, product.opinions_inhabitants)
          : null
      ),
      renderCommentsSection(product.key, returnTo, comments)
    )
  )
}

exports.editProductView = async (product, shopId, params = {}) => {
  const returnTo = safeText(params.returnTo) || `/shops/${encodeURIComponent(shopId)}`
  return template(
    i18n.shopProductUpdate,
    section(
      div({ class: "tags-header" }, h2(i18n.shopProductUpdate)),
      renderProductForm(shopId, product, true, returnTo)
    )
  )
}

const ORDER_STATUS_VARIANT = { PENDING: "whole", ACCEPTED: "mutuals", REJECTED: "closed", PAID: "mutuals", SHIPPED: "hidden", RECEIVED: "mutuals" }
const orderStatusChip = (st) => {
  const s = String(st || "PENDING").toUpperCase()
  const labels = {
    PENDING: i18n.shopOrderStatusPending || "Pending",
    ACCEPTED: i18n.shopOrderStatusAccepted || "Accepted",
    REJECTED: i18n.shopOrderStatusRejected || "Rejected",
    PAID: i18n.shopOrderStatusPaid || "Payment received",
    SHIPPED: i18n.shopOrderStatusShipped || "Shipped",
    RECEIVED: i18n.shopOrderStatusReceived || "Received"
  }
  return renderStateChip(ORDER_STATUS_VARIANT[s] || "whole", "", labels[s] || s)
}

exports.shopOrdersView = async (shop, orders) => {
  const sid = shop.rootId || shop.key || shop.id || ""
  const title = `${i18n.shopOrdersTitle || "Orders"}: ${shop.title || ""}`
  const statusForm = (orderId, status, label, cls) =>
    form({ method: "POST", action: `/shops/orders/${encodeURIComponent(orderId)}/status`, class: "inline-form" },
      input({ type: "hidden", name: "shopId", value: sid }),
      input({ type: "hidden", name: "status", value: status }),
      button({ type: "submit", class: cls || "tribe-action-btn" }, label)
    )
  const orderActions = (o) => {
    const s = String(o.status || "PENDING").toUpperCase()
    const acts = []
    if (s === "PENDING") {
      acts.push(statusForm(o.id, "ACCEPTED", i18n.shopOrderAccept || "Accept"))
      acts.push(statusForm(o.id, "REJECTED", i18n.shopOrderReject || "Reject", "tribe-action-btn danger-btn"))
    } else if (s === "ACCEPTED") {
      const concept = `${i18n.shopOrderInvoiceConcept || "Invoice"} — ${i18n.shopOrderContractConcept || "Shop order"}: ${o.title || ""}`
      const cHref = `/transfers?filter=create&to=${encodeURIComponent(o.buyer)}&amount=${encodeURIComponent(Number(o.price || 0).toFixed(6))}&concept=${encodeURIComponent(concept)}&category=ECONOMIC`
      acts.push(a({ href: cHref, class: "tribe-action-btn" }, i18n.shopOrderInvoice || "Invoice"))
      acts.push(statusForm(o.id, "PAID", i18n.shopOrderMarkPaid || "Payment received"))
    } else if (s === "PAID") {
      acts.push(statusForm(o.id, "SHIPPED", i18n.shopOrderMarkShipped || "Mark shipped"))
    }
    acts.push(a({ href: `/pm?recipients=${encodeURIComponent(o.buyer)}`, class: "tribe-action-btn" }, i18n.shopOrderPmBuyer || i18n.privateMessage || "PM"))
    return div({ class: "tribe-side-actions" }, ...acts)
  }
  const rows = (orders || []).map(o => div({ class: "shop-order-card card-section" },
    div({ class: "card-chips-row" }, renderEncryptedChip(i18n), orderStatusChip(o.status)),
    div({ class: "card-field" }, span({ class: "card-label" }, `${i18n.shopOrderProduct || "Product"}:`), span({ class: "card-value" }, String(o.title || o.productId || ""))),
    div({ class: "card-field" }, span({ class: "card-label" }, `${i18n.shopOrderPrice || "Price"}:`), span({ class: "card-value" }, `${Number(o.price || 0).toFixed(6)} ECO`)),
    div({ class: "card-field" }, span({ class: "card-label" }, `${i18n.shopOrderBuyer || "Buyer"}:`), userLink(o.buyer)),
    div({ class: "card-field" }, span({ class: "card-label" }, `${i18n.shopBuyDeliveryAddress || "Delivery address"}:`), span({ class: "card-value" }, String(o.deliveryAddress || ""))),
    o.contact ? div({ class: "card-field" }, span({ class: "card-label" }, `${i18n.shopBuyContact || "Contact"}:`), span({ class: "card-value" }, String(o.contact))) : null,
    o.notes ? div({ class: "card-field" }, span({ class: "card-label" }, `${i18n.shopBuyNotes || "Notes"}:`), span({ class: "card-value" }, String(o.notes))) : null,
    p({ class: "card-footer" }, span({ class: "date-link" }, moment(o.createdAt || o.ts).format("YYYY-MM-DD HH:mm"))),
    orderActions(o)
  ))
  return template(
    title,
    section(
      div({ class: "tags-header" }, h2(title), p(i18n.shopOrdersDescription || "Encrypted purchase orders received by this shop.")),
      a({ href: `/shops/${encodeURIComponent(shop.key || shop.id || "")}`, class: "filter-btn" }, i18n.goBack || "Go back")
    ),
    section(
      rows.length ? div({ class: "shop-orders-list" }, ...rows) : p(i18n.shopOrdersEmpty || "No orders yet.")
    )
  )
}

exports.myPurchasesView = async (purchases) => {
  const title = i18n.shopMyOrdersTitle || "My orders"
  const buyerActions = (o) => {
    const acts = []
    if (o.seller) acts.push(a({ href: `/pm?recipients=${encodeURIComponent(o.seller)}`, class: "tribe-action-btn" }, i18n.shopOrderPmSeller || i18n.privateMessage || "PM"))
    if (String(o.status || "PENDING").toUpperCase() === "SHIPPED") {
      acts.push(form({ method: "POST", action: `/shops/orders/${encodeURIComponent(o.id)}/status`, class: "inline-form" },
        input({ type: "hidden", name: "status", value: "RECEIVED" }),
        input({ type: "hidden", name: "returnTo", value: "/shops/purchases" }),
        button({ type: "submit", class: "tribe-action-btn" }, i18n.shopOrderConfirmReceived || "Confirm received")
      ))
    }
    return acts.length ? div({ class: "tribe-side-actions" }, ...acts) : null
  }
  const rows = (purchases || []).map(o => div({ class: "shop-order-card card-section" },
    div({ class: "card-chips-row" }, renderEncryptedChip(i18n), orderStatusChip(o.status)),
    div({ class: "card-field" }, span({ class: "card-label" }, `${i18n.shopOrderProduct || "Product"}:`), span({ class: "card-value" }, String(o.title || o.productId || ""))),
    div({ class: "card-field" }, span({ class: "card-label" }, `${i18n.shopOrderPrice || "Price"}:`), span({ class: "card-value" }, `${Number(o.price || 0).toFixed(6)} ECO`)),
    o.seller ? div({ class: "card-field" }, span({ class: "card-label" }, `${i18n.shopOrderSeller || "Seller"}:`), userLink(o.seller)) : null,
    div({ class: "card-field" }, span({ class: "card-label" }, `${i18n.shopBuyDeliveryAddress || "Delivery address"}:`), span({ class: "card-value" }, String(o.deliveryAddress || ""))),
    o.contact ? div({ class: "card-field" }, span({ class: "card-label" }, `${i18n.shopBuyContact || "Contact"}:`), span({ class: "card-value" }, String(o.contact))) : null,
    o.notes ? div({ class: "card-field" }, span({ class: "card-label" }, `${i18n.shopBuyNotes || "Notes"}:`), span({ class: "card-value" }, String(o.notes))) : null,
    p({ class: "card-footer" }, span({ class: "date-link" }, moment(o.createdAt || o.ts).format("YYYY-MM-DD HH:mm"))),
    buyerActions(o)
  ))
  return template(
    title,
    section(
      div({ class: "tags-header" }, h2(title), p(i18n.shopMyOrdersDescription || "Your encrypted purchase orders."))
    ),
    section(renderModeButtons("purchases")),
    section(
      rows.length ? div({ class: "shop-orders-list" }, ...rows) : p(i18n.shopMyOrdersEmpty || "You have no purchases yet.")
    )
  )
}

exports.clearnetShopView = async (shop, products = []) => {
  const fmtPrice = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(6) : '0.000000';
  };
  const productCards = (products || []).filter(p => Number(p.stock) > 0 || p.featured).map(prod => {
    const pImg = cnBlobUrl(prod.image);
    return `<article class="cn-product">
      ${pImg ? `<img class="cn-product-img" src="${pImg}" alt="" loading="lazy"/>` : ''}
      <h3 class="cn-product-title">${cnEscapeHtml(prod.title || '')}</h3>
      ${prod.description ? `<p class="cn-product-desc">${cnEscapeHtml(prod.description)}</p>` : ''}
      <p class="cn-product-price">${fmtPrice(prod.price)} ECO</p>
      ${Number(prod.stock) > 0 ? `<p class="cn-product-stock">Stock: ${prod.stock}</p>` : ''}
    </article>`;
  }).join('\n');
  const shopBlobUrl = cnBlobUrl(shop.image);
  const shopImg = shopBlobUrl ? `<img class="cn-shop-img" src="${shopBlobUrl}" alt="${cnEscapeHtml(shop.title || '')}"/>` : '';
  const desc = cnEscapeHtml(shop.shortDescription || shop.description || '');
  const extraCss = `
.cn-hero{display:flex;gap:24px;margin-bottom:24px;flex-wrap:wrap;align-items:flex-start}
.cn-shop-img{display:block;max-width:280px;width:100%;border:3px solid var(--fg);border-radius:8px;background:#000}
.cn-hero-body{flex:1 1 320px;min-width:0}
.cn-shop-title{color:var(--fg);margin:0 0 12px 0;font-size:32px;font-weight:700;letter-spacing:0.3px}
.cn-shop-desc{color:var(--fg-soft);margin:0 0 16px 0;font-size:15px;white-space:pre-wrap}
.cn-shop-meta{display:flex;gap:12px;flex-wrap:wrap;background:var(--bg-sub);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:13px;color:var(--fg-soft)}
.cn-shop-meta-item{display:inline-flex;align-items:center;gap:6px}
.cn-products{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
.cn-product{background:var(--bg-elev);border:1px solid var(--border);border-radius:8px;padding:16px;transition:border-color .15s ease}
.cn-product:hover{border-color:var(--fg)}
.cn-product-img{width:100%;height:180px;object-fit:cover;border-radius:6px;margin-bottom:10px;background:#000;border:1px solid var(--border)}
.cn-product-title{color:var(--fg);font-size:16px;margin:0 0 8px 0;font-weight:600}
.cn-product-desc{color:var(--fg-soft);font-size:13px;margin:0 0 10px 0;line-height:1.4}
.cn-product-price{color:var(--fg);background:var(--bg-sub);border:1px solid var(--fg);display:inline-block;padding:4px 10px;border-radius:4px;font-weight:bold;margin:0;font-size:14px}
.cn-product-stock{color:var(--fg-dim);font-size:12px;margin:8px 0 0 0;text-transform:uppercase;letter-spacing:1px}
.cn-empty{background:var(--bg-elev);border:1px dashed var(--border);border-radius:8px;padding:32px;text-align:center;color:var(--fg-dim)}
`;
  const body = `
  <div class="cn-hero">
    ${shopImg}
    <div class="cn-hero-body">
      <h1 class="cn-shop-title">${cnEscapeHtml(shop.title || '')}</h1>
      ${desc ? `<p class="cn-shop-desc">${desc}</p>` : ''}
      <div class="cn-shop-meta">
        ${shop.createdAt ? `<span class="cn-shop-meta-item">📅 ${new Date(shop.createdAt).toISOString().slice(0,10)}</span>` : ''}
        ${shop.location ? `<span class="cn-shop-meta-item">📍 ${cnEscapeHtml(shop.location)}</span>` : ''}
      </div>
    </div>
  </div>
  <h2 class="cn-section">Products</h2>
  ${productCards ? `<div class="cn-products">${productCards}</div>` : '<div class="cn-empty">No products available.</div>'}
`;
  return renderClearnetPage({
    title: `${shop.title || 'Shop'} — Oasis`,
    ogTitle: shop.title || 'Oasis',
    ogDescription: shop.shortDescription || shop.description || '',
    ogImage: shopBlobUrl,
    extraCss,
    body,
    hubFeedId: shop.author || null
  });
};

exports.renderShopInvitePage = (code) => {
  const pageContent = div({ class: "invite-page" },
    h2(i18n.tribeInviteCodeText, code),
    form({ method: "GET", action: "/shops" },
      button({ type: "submit", class: "filter-btn" }, i18n.walletBack)
    )
  );
  return template(i18n.invitesShopsTitle || "Shops", section(pageContent));
};
