const { div, h2, p, section, button, form, a, span, textarea, br, input, label, select, option, img, progress, video, table, tr, td } = require("../server/node_modules/hyperaxe")
const { template, i18n } = require("./main_views")
const moment = require("../server/node_modules/moment")
const { config } = require("../server/SSB_server.js")
const { renderUrl } = require("../backend/renderUrl")
const { renderMapLocationUrl, renderMapEmbed, renderMapLocationVisitLabel } = require("./maps_view")
const opinionCategories = require("../backend/opinion_categories")

const userId = config.keys.id
const safeArr = (v) => (Array.isArray(v) ? v : [])
const safeText = (v) => String(v || "").trim()
const voteSum = (opinions = {}) => Object.values(opinions || {}).reduce((s, n) => s + (Number(n) || 0), 0)
const renderStarRating = (opinions, voterCount) => {
  const total = voteSum(opinions)
  const avg = voterCount > 0 ? Math.min(5, Math.round((total / voterCount) * 5) / 5) : 0
  const full = Math.floor(avg)
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

const renderShopCard = (shop, filter, params = {}) => {
  const returnTo = buildReturnTo(filter, params)
  const isAuthor = String(shop.author) === String(userId)

  return div({ class: "tribe-card" },
    div({ class: "tribe-card-image-wrapper" },
      a({ href: `/shops/${encodeURIComponent(shop.key)}` },
        renderMediaBlob(shop.image, '/assets/images/default-avatar.png', { class: 'tribe-card-hero-image' })
      ),
      form({ method: 'GET', action: `/shops/${encodeURIComponent(shop.key)}`, class: 'tribe-visit-btn-wrapper' },
        button({ type: 'submit', class: 'filter-btn' }, String(i18n.shopVisitShop || 'VISIT SHOP').toUpperCase())
      )
    ),
    div({ class: "tribe-card-body" },
      h2({ class: "tribe-card-title" }, a({ href: `/shops/${encodeURIComponent(shop.key)}` }, shop.title || i18n.shopUntitled)),
      shop.shortDescription ? p({ class: "tribe-card-description" }, shop.shortDescription) : null,
      renderMapLocationVisitLabel(shop.mapUrl),
      br(),
      table({ class: "tribe-info-table" },
        tr(
          td({ class: "tribe-info-label" }, i18n.shopStatus || "STATUS"),
          td({ class: "tribe-info-value", colspan: "3" }, shop.visibility === "CLOSED" ? i18n.shopClosed : i18n.shopOpen)
        ),
        shop.location ? tr(
          td({ class: "tribe-info-label" }, i18n.shopLocation),
          td({ class: "tribe-info-value", colspan: "3" }, ...renderUrl(shop.location))
        ) : null
      ),
      div({ class: "tribe-card-members" },
        span({ class: "tribe-members-count" }, `${i18n.shopProducts}: ${shop.productCount || 0}`)
      ),
      safeArr(shop.featuredProducts).length
        ? div({ class: "shop-featured-products" },
            safeArr(shop.featuredProducts).slice(0, 4).map(prod =>
              a({ href: `/shops/product/${encodeURIComponent(prod.key)}?shopId=${encodeURIComponent(prod.shopId)}`, class: "shop-featured-item" },
                prod.image ? renderMediaBlob(prod.image, null, { class: "shop-featured-thumb" }) : null,
                span({ class: "shop-featured-price" }, `${Number(prod.price || 0).toFixed(6)} ECO`)
              )
            )
          )
        : null
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
          actions.push(form({ method: "POST", action: `/shops/product/buy/${encodeURIComponent(product.key)}` },
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            button({ type: "submit", class: "buy-btn" }, i18n.marketActionsBuy || i18n.shopBuy)));
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
                author ? a({ href: `/author/${encodeURIComponent(author)}` }, `@${author.split("@")[1] || author}`) : span("(unknown)"),
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
      input({ type: "text", name: "url", placeholder: i18n.shopUrlPlaceholder || "https://your-shop-url.com", value: shop.url || "" }), br,
      label(i18n.shopLocation), br,
      input({ type: "text", name: "location", placeholder: i18n.shopLocationPlaceholder || "City, Country", value: shop.location || "" }), br,
      label(i18n.mapLocationTitle || "Map Location"), br,
      input({ type: "text", name: "mapUrl", placeholder: i18n.mapUrlPlaceholder || "/maps/MAP_ID", value: shop.mapUrl || "" }), br,
      label(i18n.shopTags), br,
      input({ type: "text", name: "tags", placeholder: i18n.shopTagsPlaceholder || "tag1, tag2, tag3", value: safeArr(shop.tags).join(", ") }), br,
      label(i18n.shopVisibility), br,
      select({ name: "visibility" },
        option({ value: "OPEN", selected: (shop.visibility || "OPEN") === "OPEN" }, i18n.shopOpen),
        option({ value: "CLOSED", selected: shop.visibility === "CLOSED" }, i18n.shopClosed)
      ), br(), br(),
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

  const header = div({ class: "tags-header" }, h2(title), p(i18n.shopDescription))

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
    section(header),
    section(renderModeButtons(filter)),
    section(searchBar),
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
                ? list.map(shop => renderShopCard(shop, filter, { q, sort }))
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

  const shopSide = div({ class: "tribe-side" },
    h2(shop.title || i18n.shopUntitled),
    renderMediaBlob(shop.image, '/assets/images/default-avatar.png', { class: 'tribe-detail-image' }),
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
        td({ class: "tribe-info-value", colspan: "4" }, a({ class: "user-link", href: `/author/${encodeURIComponent(shop.author)}` }, shop.author))
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
    h2({ class: "tribe-members-count" }, `${i18n.shopProducts}: ${shop.productCount || 0}`),
    shop.description ? p({ class: "tribe-side-description" }, ...renderUrl(shop.description)) : null,
    renderMapEmbed(params.mapData, shop.mapUrl),
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
        ? form({ method: "POST", action: `/shops/delete/${encodeURIComponent(shop.key)}` },
            button({ type: "submit", class: "tribe-action-btn" }, i18n.shopDelete)
          )
        : null,
      isAuthor && shop.visibility !== "CLOSED"
        ? form({ method: "POST", action: `/shops/visibility/${encodeURIComponent(shop.key)}` },
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            input({ type: "hidden", name: "visibility", value: "CLOSED" }),
            button({ type: "submit", class: "tribe-action-btn" }, i18n.shopCloseShop)
          )
        : null,
      isAuthor && shop.visibility === "CLOSED"
        ? form({ method: "POST", action: `/shops/visibility/${encodeURIComponent(shop.key)}` },
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            input({ type: "hidden", name: "visibility", value: "OPEN" }),
            button({ type: "submit", class: "tribe-action-btn" }, i18n.shopOpenShop)
          )
        : null
    ),
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
          ? form({ method: "POST", action: `/shops/product/buy/${encodeURIComponent(product.key)}` },
              input({ type: "hidden", name: "returnTo", value: returnTo }),
              button({ type: "submit", class: "buy-btn" }, i18n.marketActionsBuy || i18n.shopBuy)
            )
          : null,
        br(),
        p({ class: "card-footer" },
          span({ class: "date-link" }, moment(product.createdAt).format("YYYY-MM-DD HH:mm")),
          " ",
          a({ href: `/author/${encodeURIComponent(product.author)}`, class: "user-link" }, product.author)
        ),
        !isAuthor && safeArr(product.buyers).includes(userId) && !safeArr(product.opinions_inhabitants).includes(userId)
          ? div({ class: "voting-buttons transfer-voting-buttons" },
              opinionCategories.map(category =>
                form({ method: "POST", action: `/shops/product/opinions/${encodeURIComponent(product.key)}/${category}` },
                  input({ type: "hidden", name: "returnTo", value: returnTo }),
                  button({ class: "vote-btn" }, `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`] || category} [${product.opinions?.[category] || 0}]`)
                )
              )
            )
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
