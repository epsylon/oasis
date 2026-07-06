const { div, h2, p, section, button, form, a, input, br, span, label, select, option, progress, table, tr, td } = require("../server/node_modules/hyperaxe")
const { template, i18n, renderOpinionsVoting, userLink, renderStateChip, renderLifespanChip, renderEcoTax, renderSpreadButton, renderContentActions } = require("./main_views")
const moment = require("../server/node_modules/moment")
const { config } = require("../server/SSB_server.js")

const userId = config.keys.id

const safeArr = (v) => (Array.isArray(v) ? v : [])
const safeText = (v) => String(v || "").trim()

const parseNum = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."))
  return Number.isFinite(n) ? n : NaN
}

const fmtAmount = (v) => {
  const n = parseNum(v)
  return Number.isFinite(n) ? n.toFixed(6) : String(v ?? "")
}

const categoryOf = (t) => {
  const c = String(t?.category || "ECONOMIC").toUpperCase()
  return ["ECONOMIC", "TIME", "TRUST"].includes(c) ? c : "ECONOMIC"
}

const fmtAmountWithUnit = (transfer) => {
  const amt = fmtAmount(transfer.amount)
  const cat = categoryOf(transfer)
  const unit = cat === "TIME" ? (i18n.transfersUnitHours || "h")
             : cat === "TRUST" ? (i18n.transfersUnitTrust || "trust")
             : (i18n.transfersUnitEco || "ECO")
  return `${amt} ${unit}`
}

const categoryLabel = (cat) => (
  cat === "TIME" ? (i18n.transfersCategoryTime || "Time") :
  cat === "TRUST" ? (i18n.transfersCategoryTrust || "Trust") :
  (i18n.transfersCategoryEconomic || "Economic")
)

const buildReturnTo = (filter, params = {}) => {
  const f = safeText(filter || "all")
  const q = safeText(params.q || "")
  const minAmount = params.minAmount ?? ""
  const maxAmount = params.maxAmount ?? ""
  const sort = safeText(params.sort || "")
  const parts = [`filter=${encodeURIComponent(f)}`]
  if (q) parts.push(`q=${encodeURIComponent(q)}`)
  if (String(minAmount) !== "") parts.push(`minAmount=${encodeURIComponent(String(minAmount))}`)
  if (String(maxAmount) !== "") parts.push(`maxAmount=${encodeURIComponent(String(maxAmount))}`)
  if (sort) parts.push(`sort=${encodeURIComponent(sort)}`)
  return `/transfers?${parts.join("&")}`
}

const statusKey = (s) => {
  const up = String(s || "").toUpperCase()
  const pretty = up.charAt(0) + up.slice(1).toLowerCase()
  return `transfersStatus${pretty}`
}

const renderTags = (tags = []) => {
  const arr = safeArr(tags).map(t => String(t || "").trim()).filter(Boolean)
  return arr.length
    ? div(
        { class: "card-tags" },
        arr.map(tag => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`))
      )
    : null
}

const renderCardField = (labelText, valueNode) =>
  div(
    { class: "card-field" },
    span({ class: "card-label" }, labelText),
    span({ class: "card-value" }, valueNode)
  )

const formatBlockSize = (bytes) => {
  const n = Number(bytes || 0)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(2)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

const renderBlockInfoCard = (block) => {
  if (!block || !block.id) return null
  return div(
    { class: "transfer-block-card" },
    div({ class: "card-field" },
      span({ class: "card-label" }, `${i18n.blockchainBlockID || "Block ID"}: `),
      span({ class: "card-value" },
        a({ href: `/blockexplorer/block/${encodeURIComponent(block.id)}` }, block.id)
      )
    )
  )
}

const renderConfirmationsBar = (confirmedCount, required) => {
  const req = Math.max(1, Number(required || 2))
  const cc = Math.max(0, Number(confirmedCount || 0))
  return div(
    { class: "confirmations-block" },
    div({ class: "card-field" },
      span({ class: "card-label" }, `${i18n.transfersConfirmations}: `),
      span({ class: "card-value" }, `${cc}/${req}`)
    ),
    progress({ class: "confirmations-progress", value: cc, max: req })
  )
}

const renderOwnerActions = (transfer, returnTo) => {
  const canEdit = transfer.from === userId && String(transfer.status || "").toUpperCase() === "UNCONFIRMED"
  if (!canEdit) return []
  return [
    form(
      { method: "GET", action: `/transfers/edit/${encodeURIComponent(transfer.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ type: "submit", class: "update-btn" }, i18n.transfersUpdateButton)
    ),
    form(
      { method: "POST", action: `/transfers/delete/${encodeURIComponent(transfer.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ type: "submit", class: "delete-btn" }, i18n.transfersDeleteButton)
    )
  ]
}

const renderUpdatedLabel = (createdAt, updatedAt) => {
  const createdTs = createdAt ? new Date(createdAt).getTime() : NaN
  const updatedTs = updatedAt ? new Date(updatedAt).getTime() : NaN
  const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs)
  return showUpdated
    ? span({ class: "votations-comment-date" }, ` | ${i18n.transfersUpdatedAt}: ${moment(updatedAt).format("YYYY-MM-DD HH:mm")}`)
    : null
}


const renderTransferStatusChip = (status) => {
  const up = String(status || "").toUpperCase()
  const variant =
    up === "CLOSED" ? "mutuals" :
    up === "DISCARDED" ? "closed" :
    "whole"
  const icon = up === "CLOSED" ? "✓" : up === "DISCARDED" ? "✗" : "↻"
  return renderStateChip(variant, icon, i18n[statusKey(up)] || up)
}

const renderTransferCategoryChip = (cat) =>
  renderStateChip("encrypted", "", categoryLabel(cat))

const generateTransferCard = (transfer, filter, params = {}) => {
  const confirmedBy = safeArr(transfer.confirmedBy)
  const required = transfer.from === transfer.to ? 1 : 2
  const confirmedCount = confirmedBy.length
  const dl = transfer.deadline ? moment(transfer.deadline) : null
  const isExpired = dl && dl.isValid() ? dl.isBefore(moment()) : false
  const tags = Array.isArray(transfer.tags) ? transfer.tags.map(t => String(t).toUpperCase()) : []
  const isUbi = tags.includes("UBI")
  const cat = categoryOf(transfer)

  const chips = [
    renderTransferStatusChip(transfer.status),
    isUbi ? renderStateChip("mutuals", "🎁", "UBI") : null,
    isExpired ? renderStateChip("closed", "⏰", i18n.transfersExpiredBadge) : null,
    renderLifespanChip(transfer.lifetime, i18n)
  ].filter(Boolean)

  const otherParty = transfer.from === userId ? transfer.to : transfer.from
  const partyDir = transfer.from === userId ? "→" : "←"
  const returnTo = buildReturnTo(filter, params)

  const isOwn = transfer.from && String(transfer.from) === String(userId)
  return div({ class: "trending-card transfer-card" + (isOwn ? " own-content" : "") },
    div(
      { class: "card-header activity-card-header" },
      span(),
      renderContentActions(transfer.id, `/transfers/${encodeURIComponent(transfer.id)}`)
    ),
    div({ class: "card-section transfer-card-body" },
      div({ class: "shop-title-row" },
        h2({ class: "tribe-card-title" },
          a({ href: `/transfers/${encodeURIComponent(transfer.id)}` }, transfer.concept || i18n.transfersTitle)
        )
      ),
      chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
      !isUbi && dl && dl.isValid()
        ? p({ class: "card-date-highlight" }, dl.format("YYYY-MM-DD HH:mm"))
        : null,
      cat !== "TRUST"
        ? div({ class: "job-price-line card-salary" }, fmtAmountWithUnit(transfer))
        : null,
      div({ class: "tribe-card-members" },
        span({ class: "tribe-members-count" }, `${i18n.transfersConfirmations}: ${confirmedCount}/${required}`)
      ),
            div(
        { class: "card-comments-summary feed-opinions-section" },
        div(
          { class: "comments-count" },
          span({ class: "card-label" }, (i18n.opinionsTitle || "Opinions") + ": "),
          span({ class: "card-value" }, String(Object.values(transfer.opinions || {}).reduce((s, n) => s + (Number(n) || 0), 0)))
        ),
        renderOpinionsVoting('/transfers/opinions', transfer.id, transfer.opinions, returnTo, transfer.opinions_inhabitants)
      ),
      div({ class: "card-spread-centered" }, renderSpreadButton(transfer.id, params.spreadMap && params.spreadMap.get(transfer.id)))
    )
  )
}

exports.transferView = async (transfers, filter, transferId, params = {}) => {
  const normalizedFilter = filter === "favs" ? "all" : (filter || "all")

  const title =
    normalizedFilter === "mine"        ? i18n.transfersMineSectionTitle :
    normalizedFilter === "ubi"         ? i18n.transfersUBISectionTitle :
    normalizedFilter === "pending"     ? i18n.transfersPendingSectionTitle :
    normalizedFilter === "top"         ? i18n.transfersTopSectionTitle :
    normalizedFilter === "unconfirmed" ? i18n.transfersUnconfirmedSectionTitle :
    normalizedFilter === "closed"      ? i18n.transfersClosedSectionTitle :
    normalizedFilter === "discarded"   ? i18n.transfersDiscardedSectionTitle :
    normalizedFilter === "create"      ? i18n.transfersCreateSectionTitle :
    normalizedFilter === "edit"        ? i18n.transfersUpdateSectionTitle :
    normalizedFilter === "economic"    ? (i18n.transfersEconomicSectionTitle || (i18n.transfersCategoryEconomic + " " + i18n.transfersTitle)) :
    normalizedFilter === "time"        ? (i18n.transfersTimeSectionTitle || (i18n.transfersCategoryTime + " " + i18n.transfersTitle)) :
    normalizedFilter === "trust"       ? (i18n.transfersTrustSectionTitle || (i18n.transfersCategoryTrust + " " + i18n.transfersTitle)) :
                                        i18n.transfersAllSectionTitle

  const q = safeText(params.q || "")
  const minAmountRaw = params.minAmount ?? ""
  const maxAmountRaw = params.maxAmount ?? ""
  const minAmount = parseNum(minAmountRaw)
  const maxAmount = parseNum(maxAmountRaw)
  const sort = safeText(params.sort || "recent")

  const list = safeArr(transfers)

  let filtered =
    normalizedFilter === "mine"        ? list.filter(t => t.from === userId || t.to === userId) :
    normalizedFilter === "ubi"         ? list.filter(t => safeArr(t.tags).some(tag => String(tag).toUpperCase() === "UBI")) :
    normalizedFilter === "pending"     ? list.filter(t => String(t.status || "").toUpperCase() === "UNCONFIRMED" && t.to === userId && !safeArr(t.confirmedBy).includes(userId)) :
    normalizedFilter === "top"         ? list.filter(t => String(t.status || "").toUpperCase() === "CLOSED") :
    normalizedFilter === "unconfirmed" ? list.filter(t => String(t.status || "").toUpperCase() === "UNCONFIRMED") :
    normalizedFilter === "closed"      ? list.filter(t => String(t.status || "").toUpperCase() === "CLOSED") :
    normalizedFilter === "discarded"   ? list.filter(t => String(t.status || "").toUpperCase() === "DISCARDED") :
    normalizedFilter === "economic"    ? list.filter(t => categoryOf(t) === "ECONOMIC") :
    normalizedFilter === "time"        ? list.filter(t => categoryOf(t) === "TIME") :
    normalizedFilter === "trust"       ? list.filter(t => categoryOf(t) === "TRUST") :
    normalizedFilter === "market"      ? list :
                                        list

  if (q) {
    const qq = q.toLowerCase()
    filtered = filtered.filter(t => {
      const concept = String(t.concept || "").toLowerCase()
      const tags = safeArr(t.tags).join(" ").toLowerCase()
      const from = String(t.from || "").toLowerCase()
      const to = String(t.to || "").toLowerCase()
      return concept.includes(qq) || tags.includes(qq) || from.includes(qq) || to.includes(qq)
    })
  }

  if (Number.isFinite(minAmount)) filtered = filtered.filter(t => parseNum(t.amount) >= minAmount)
  if (Number.isFinite(maxAmount)) filtered = filtered.filter(t => parseNum(t.amount) <= maxAmount)

  if (normalizedFilter === "top" || sort === "amount") {
    filtered = filtered.sort((a, b) => parseNum(b.amount) - parseNum(a.amount))
  } else if (sort === "deadline") {
    filtered = filtered.sort((a, b) => new Date(a.deadline || 0) - new Date(b.deadline || 0))
  } else {
    filtered = filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }

  const isForm = normalizedFilter === "create" || normalizedFilter === "edit"
  const transferToEdit = normalizedFilter === "edit" ? (list.find(t => t.id === transferId) || {}) : (params.prefill || {})
  const returnToForForm = buildReturnTo("all", {})
  const validCategories = ["ECONOMIC", "TIME", "TRUST"]
  const paramCategoryRaw = safeText(params.category || "").toUpperCase()
  const selectedCategory =
    transferToEdit.category && validCategories.includes(transferToEdit.category)
      ? transferToEdit.category
      : (validCategories.includes(paramCategoryRaw) ? paramCategoryRaw : "ECONOMIC")
  const amountUnitLabel =
    selectedCategory === "TIME" ? (i18n.transfersUnitHours || "h") :
    selectedCategory === "TRUST" ? (i18n.transfersUnitTrust || "trust") :
    (i18n.transfersUnitEco || "ECO")

  return template(
    title,
    section(
      div({ class: "tags-header" }, h2(title), p(i18n.transfersDescription)),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/transfers", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "minAmount", value: String(minAmountRaw ?? "") }),
          input({ type: "hidden", name: "maxAmount", value: String(maxAmountRaw ?? "") }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: normalizedFilter === "all" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: normalizedFilter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterMine),
          button({ type: "submit", name: "filter", value: "ubi", class: normalizedFilter === "ubi" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterUBI),
          button({ type: "submit", name: "filter", value: "economic", class: normalizedFilter === "economic" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterEconomic || (i18n.transfersCategoryEconomic || "ECONOMIC")),
          button({ type: "submit", name: "filter", value: "time", class: normalizedFilter === "time" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterTime || (i18n.transfersCategoryTime || "TIME")),
          button({ type: "submit", name: "filter", value: "trust", class: normalizedFilter === "trust" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterTrust || (i18n.transfersCategoryTrust || "TRUST")),
          button({ type: "submit", name: "filter", value: "market", class: normalizedFilter === "market" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterMarket),
          button({ type: "submit", name: "filter", value: "pending", class: normalizedFilter === "pending" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterPending),
          button({ type: "submit", name: "filter", value: "unconfirmed", class: normalizedFilter === "unconfirmed" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterUnconfirmed),
          button({ type: "submit", name: "filter", value: "closed", class: normalizedFilter === "closed" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterClosed),
          button({ type: "submit", name: "filter", value: "discarded", class: normalizedFilter === "discarded" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterDiscarded),
          button({ type: "submit", name: "filter", value: "top", class: normalizedFilter === "top" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterTop),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.transfersCreateButton)
        )
      )
    ),
    section(
      isForm
        ? div(
            { class: "transfer-form" },
            normalizedFilter === "create"
              ? form(
                  { method: "GET", action: "/transfers", class: "transfer-category-picker" },
                  input({ type: "hidden", name: "filter", value: "create" }),
                  label(i18n.transfersCategory || "Category"),
                  br(),
                  select(
                    { name: "category", class: "transfer-category-select" },
                    option({ value: "ECONOMIC", selected: selectedCategory === "ECONOMIC" ? "selected" : undefined }, i18n.transfersCategoryEconomic || "Economic"),
                    option({ value: "TIME", selected: selectedCategory === "TIME" ? "selected" : undefined }, i18n.transfersCategoryTime || "Time"),
                    option({ value: "TRUST", selected: selectedCategory === "TRUST" ? "selected" : undefined }, i18n.transfersCategoryTrust || "Trust")
                  ),
                  " ",
                  button({ type: "submit", class: "filter-btn" }, i18n.transfersCategoryApply || "Apply"),
                  br(), br()
                )
              : null,
            form(
              { action: normalizedFilter === "edit" ? `/transfers/update/${encodeURIComponent(transferId)}` : "/transfers/create", method: "POST" },
              input({ type: "hidden", name: "returnTo", value: returnToForForm }),
              normalizedFilter === "create" ? input({ type: "hidden", name: "category", value: selectedCategory }) : null,
              label(i18n.transfersToUser),
              br(),
              input({ type: "text", name: "to", required: true, pattern: "^@[A-Za-z0-9+/]+={0,2}\\.ed25519$", title: i18n.transfersToUserValidation, value: transferToEdit.to || "" }),
              br(),
              label(i18n.transfersConcept),
              br(),
              input({ type: "text", name: "concept", required: true, value: transferToEdit.concept || "" }),
              br(),
              normalizedFilter === "edit"
                ? [
                    label(i18n.transfersCategory || "Category"),
                    br(),
                    select(
                      { name: "category", required: true },
                      option({ value: "ECONOMIC", selected: selectedCategory === "ECONOMIC" ? "selected" : undefined }, i18n.transfersCategoryEconomic || "Economic"),
                      option({ value: "TIME", selected: selectedCategory === "TIME" ? "selected" : undefined }, i18n.transfersCategoryTime || "Time"),
                      option({ value: "TRUST", selected: selectedCategory === "TRUST" ? "selected" : undefined }, i18n.transfersCategoryTrust || "Trust")
                    ),
                    br(), br()
                  ]
                : null,
              selectedCategory === "TRUST"
                ? input({ type: "hidden", name: "amount", value: "1" })
                : [
                    label(`${i18n.transfersAmount} (${amountUnitLabel})`),
                    br(),
                    input({ type: "number", name: "amount", step: "0.000001", required: true, min: "0.000001", value: transferToEdit.amount || "" }),
                    br(), br()
                  ],
              label(i18n.transfersDeadline),
              br(),
              input({ type: "datetime-local", name: "deadline", required: true, min: moment().format("YYYY-MM-DDTHH:mm"), value: transferToEdit.deadline ? moment(transferToEdit.deadline).format("YYYY-MM-DDTHH:mm") : "" }),
              br(),
              br(),
              label(i18n.transfersTags),
              br(),
              input({ type: "text", name: "tags", value: safeArr(transferToEdit.tags).join(", ") }),
              br(),
              br(),
              button({ type: "submit" }, normalizedFilter === "edit" ? i18n.transfersUpdateButton : i18n.transfersCreateButton)
            )
          )
        : section(
            div(
              { class: "transfers-search" },
              form(
                { method: "GET", action: "/transfers", class: "filter-box" },
                input({ type: "hidden", name: "filter", value: normalizedFilter || "all" }),
                input({ type: "text", name: "q", value: q, placeholder: i18n.transfersSearchPlaceholder, class: "filter-box__input" }),
                div(
                  { class: "filter-box__controls" },
                  div(
                    { class: "transfer-range" },
                    input({ type: "number", name: "minAmount", step: "0.000001", min: "0", value: String(minAmountRaw ?? ""), placeholder: i18n.transfersMinAmountLabel, class: "filter-box__number transfer-amount-input" }),
                    input({ type: "number", name: "maxAmount", step: "0.000001", min: "0", value: String(maxAmountRaw ?? ""), placeholder: i18n.transfersMaxAmountLabel, class: "filter-box__number transfer-amount-input" })
                  ),
                  select(
                    { name: "sort", class: "filter-box__select" },
                    option({ value: "recent", selected: sort === "recent" ? "selected" : undefined }, i18n.transfersSortRecent),
                    option({ value: "amount", selected: sort === "amount" ? "selected" : undefined }, i18n.transfersSortAmount),
                    option({ value: "deadline", selected: sort === "deadline" ? "selected" : undefined }, i18n.transfersSortDeadline)
                  ),
                  button({ type: "submit", class: "filter-box__button" }, i18n.transfersSearchButton)
                )
              )
            ),
            br(),
            filtered.length
              ? div({ class: "jobs-grid" },
                  filtered.map(t => generateTransferCard(t, normalizedFilter, { q, minAmount: minAmountRaw, maxAmount: maxAmountRaw, sort, spreadMap: params.spreadMap }))
                )
              : p(q || String(minAmountRaw) || String(maxAmountRaw) ? i18n.transfersNoMatch : i18n.transfersNoItems)
          )
    )
  )
}

exports.singleTransferView = async (transfer, filter, params = {}) => {
  const normalizedFilter = filter === "favs" ? "all" : (filter || "all")
  const q = safeText(params.q || "")
  const sort = safeText(params.sort || "recent")
  const returnTo = safeText(params.returnTo) || buildReturnTo(normalizedFilter, { ...params, q, sort })

  const confirmedBy = safeArr(transfer.confirmedBy)
  const required = transfer.from === transfer.to ? 1 : 2
  const confirmedCount = confirmedBy.length
  const isUnconfirmed = String(transfer.status || "").toUpperCase() === "UNCONFIRMED"
  const dl = transfer.deadline ? moment(transfer.deadline) : null
  const isExpired = dl && dl.isValid() ? dl.isBefore(moment()) : false
  const tags = Array.isArray(transfer.tags) ? transfer.tags.map(t => String(t).toUpperCase()) : []
  const isUbi = tags.includes("UBI")
  const showConfirm = isUnconfirmed && transfer.to === userId && !confirmedBy.includes(userId) && !isExpired && !tags.includes("PENDING")

  const tagsNode = renderTags(transfer.tags)
  const cat = categoryOf(transfer)
  const otherParty = transfer.from === userId ? transfer.to : transfer.from
  const chips = [
    renderTransferStatusChip(transfer.status),
    isUbi ? renderStateChip("mutuals", "🎁", "UBI") : null,
    isExpired ? renderStateChip("closed", "⏰", i18n.transfersExpiredBadge) : null,
    renderLifespanChip(transfer.lifetime, i18n)
  ].filter(Boolean)

  const sideActions = []
  if (otherParty && String(otherParty) !== String(userId)) {
    sideActions.push(form({ method: "GET", action: "/pm" },
      input({ type: "hidden", name: "recipients", value: otherParty }),
      button({ type: "submit", class: "filter-btn" }, i18n.privateMessage)
    ))
  }
  if (showConfirm) {
    sideActions.push(form({ method: "POST", action: `/transfers/confirm/${encodeURIComponent(transfer.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ type: "submit", class: "filter-btn" }, i18n.transfersConfirmButton)
    ))
  }
  const canEdit = transfer.from === userId && String(transfer.status || "").toUpperCase() === "UNCONFIRMED"
  if (canEdit) {
    sideActions.push(form({ method: "GET", action: `/transfers/edit/${encodeURIComponent(transfer.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ type: "submit", class: "update-btn" }, i18n.transfersUpdateButton)
    ))
    sideActions.push(form({ method: "POST", action: `/transfers/delete/${encodeURIComponent(transfer.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ type: "submit", class: "delete-btn" }, i18n.transfersDeleteButton)
    ))
  }
  sideActions.push(form({ method: "GET", action: `/transfers/contract/${encodeURIComponent(transfer.id)}`, class: "transfer-contract-form" },
    button({ type: "submit", class: "filter-btn" }, i18n.transfersExportContract || 'Create Contract')
  ))

  const infoRows = []
  const pushRow = (labelText, valueNode) =>
    infoRows.push(tr(
      td({ class: "tribe-info-label" }, labelText),
      td({ class: "tribe-info-value" }, valueNode)
    ))
  pushRow(i18n.transfersFrom, userLink(transfer.from))
  pushRow(i18n.transfersTo, userLink(transfer.to))
  if (cat !== "TRUST") pushRow(i18n.transfersAmount, fmtAmountWithUnit(transfer))
  pushRow(i18n.transfersCategory || "Category", categoryLabel(cat))
  if (!isUbi) pushRow(i18n.transfersDeadline, dl && dl.isValid() ? dl.format("YYYY-MM-DD HH:mm") : "")
  pushRow(i18n.transfersStatus, i18n[statusKey(transfer.status)] || String(transfer.status || ""))

  const transferSide = div({ class: "tribe-side" },
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, transfer.concept || i18n.transfersTitle)
    ),
    chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
    div({ class: "card-spread-centered" }, renderSpreadButton(transfer.id, params.spreads)),
    tagsNode,
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.transfersConfirmations}: ${confirmedCount}/${required}`)
    ),
    params.block && params.block.id
      ? div({ class: "card-field" },
          span({ class: "card-label" }, `${i18n.blockchainBlockID || "Block ID"}: `),
          span({ class: "card-value" }, a({ class: "user-link", href: `/blockexplorer/block/${encodeURIComponent(params.block.id)}` }, params.block.id))
        )
      : null,
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null
  )

  const transferMain = div({ class: "tribe-main" },
    div({ class: "job-section" },
      div({ class: "card-field" },
        span({ class: "card-label" }, `${i18n.transfersFrom}: `),
        span({ class: "card-value" }, userLink(transfer.from))
      ),
      div({ class: "card-field" },
        span({ class: "card-label" }, `${i18n.transfersTo}: `),
        span({ class: "card-value" }, userLink(transfer.to))
      ),
      cat !== "TRUST" ? div({ class: "card-field" },
        span({ class: "card-label" }, `${i18n.transfersAmount}: `),
        span({ class: "card-value card-salary" }, fmtAmountWithUnit(transfer))
      ) : null,
      div({ class: "card-field" },
        span({ class: "card-label" }, `${i18n.transfersCategory || "Category"}: `),
        span({ class: "card-value" }, categoryLabel(cat))
      ),
      div({ class: "card-field" },
        span({ class: "card-label" }, `${i18n.transfersConcept}: `),
        span({ class: "card-value" }, transfer.concept || "")
      ),
      !isUbi && dl && dl.isValid() ? div({ class: "card-field" },
        span({ class: "card-label" }, `${i18n.transfersDeadline}: `),
        span({ class: "card-value" }, dl.format("YYYY-MM-DD HH:mm"))
      ) : null,
      div({ class: "card-field" },
        span({ class: "card-label" }, `${i18n.transfersStatus}: `),
        span({ class: "card-value" }, i18n[statusKey(transfer.status)] || String(transfer.status || ""))
      )
    ),
    p({ class: "card-footer" },
      span({ class: "date-link" }, `${moment(transfer.createdAt).format("YYYY-MM-DD HH:mm")} ${i18n.performed} `),
      userLink(transfer.from),
      renderUpdatedLabel(transfer.createdAt, transfer.updatedAt)
    ),
    renderOpinionsVoting('/transfers/opinions', transfer.id, transfer.opinions, returnTo, transfer.opinions_inhabitants)
  )

  return template(
    transfer.concept,
    section(
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/transfers", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "minAmount", value: String(params.minAmount ?? "") }),
          input({ type: "hidden", name: "maxAmount", value: String(params.maxAmount ?? "") }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: normalizedFilter === "all" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: normalizedFilter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterMine),
          button({ type: "submit", name: "filter", value: "ubi", class: normalizedFilter === "ubi" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterUBI),
          button({ type: "submit", name: "filter", value: "economic", class: normalizedFilter === "economic" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterEconomic || (i18n.transfersCategoryEconomic || "ECONOMIC")),
          button({ type: "submit", name: "filter", value: "time", class: normalizedFilter === "time" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterTime || (i18n.transfersCategoryTime || "TIME")),
          button({ type: "submit", name: "filter", value: "trust", class: normalizedFilter === "trust" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterTrust || (i18n.transfersCategoryTrust || "TRUST")),
          button({ type: "submit", name: "filter", value: "market", class: normalizedFilter === "market" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterMarket),
          button({ type: "submit", name: "filter", value: "pending", class: normalizedFilter === "pending" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterPending),
          button({ type: "submit", name: "filter", value: "unconfirmed", class: normalizedFilter === "unconfirmed" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterUnconfirmed),
          button({ type: "submit", name: "filter", value: "closed", class: normalizedFilter === "closed" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterClosed),
          button({ type: "submit", name: "filter", value: "discarded", class: normalizedFilter === "discarded" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterDiscarded),
          button({ type: "submit", name: "filter", value: "top", class: normalizedFilter === "top" ? "filter-btn active" : "filter-btn" }, i18n.transfersFilterTop),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.transfersCreateButton)
        )
      ),
      div({ class: "tribe-details" }, transferSide, transferMain)
    )
  )
}

