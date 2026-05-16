const { div, h2, p, section, button, form, a, input, br, span, label, select, option, progress } = require("../server/node_modules/hyperaxe")
const { template, i18n, userLink} = require("./main_views")
const moment = require("../server/node_modules/moment")
const { config } = require("../server/SSB_server.js")
const opinionCategories = require("../backend/opinion_categories")

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
    { class: "transfer-item transfer-block-card" },
    div(
      { class: "card-section transfer" },
      renderCardField(`${i18n.blockchainBlockID || "Block ID"}:`,
        a({ href: `/blockexplorer/block/${encodeURIComponent(block.id)}`, class: "user-link" }, block.id)
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

const renderTransferTopbar = (transfer, filter, params = {}) => {
  const returnTo = buildReturnTo(filter, params)
  const dl = transfer.deadline ? moment(transfer.deadline) : null
  const isExpired = dl && dl.isValid() ? dl.isBefore(moment()) : false
  const isExpiringSoon = dl && dl.isValid() ? !isExpired && dl.diff(moment(), "hours") <= 24 : false
  const otherParty = transfer.from === userId ? transfer.to : transfer.from
  const isSingle = params && params.single === true

  const chips = []
  if (isExpired) chips.push(span({ class: "chip chip-warn" }, i18n.transfersExpiredBadge))

  const leftActions = []

  if (!isSingle) {
    leftActions.push(
      form(
        { method: "GET", action: `/transfers/${encodeURIComponent(transfer.id)}` },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        input({ type: "hidden", name: "filter", value: filter || "all" }),
        params.q ? input({ type: "hidden", name: "q", value: params.q }) : null,
        params.minAmount !== undefined ? input({ type: "hidden", name: "minAmount", value: String(params.minAmount ?? "") }) : null,
        params.maxAmount !== undefined ? input({ type: "hidden", name: "maxAmount", value: String(params.maxAmount ?? "") }) : null,
        params.sort ? input({ type: "hidden", name: "sort", value: params.sort }) : null,
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      )
    )
  }

  if (otherParty && String(otherParty) !== String(userId)) {
    leftActions.push(
      form(
        { method: "GET", action: "/pm" },
        input({ type: "hidden", name: "recipients", value: otherParty }),
        button({ type: "submit", class: "filter-btn" }, i18n.privateMessage)
      )
    )
  }

  const leftChildren = []
  if (chips.length) leftChildren.push(div({ class: "transfer-chips" }, ...chips))
  leftChildren.push(...leftActions.filter(Boolean))

  const ownerActions = renderOwnerActions(transfer, returnTo)
  const actionsNode = ownerActions.length ? div({ class: "bookmark-actions transfer-actions" }, ...ownerActions) : null

  const leftClass = leftChildren.length ? "bookmark-topbar-left transfer-topbar-left" : ""
  const leftNode = leftChildren.length ? div({ class: leftClass }, ...leftChildren) : null

  const topbarChildren = []
  if (leftNode) topbarChildren.push(leftNode)
  if (actionsNode) topbarChildren.push(actionsNode)

  const topbarClass = isSingle ? "bookmark-topbar transfer-topbar-single" : "bookmark-topbar"
  return topbarChildren.length ? div({ class: topbarClass }, ...topbarChildren) : null
}

const generateTransferCard = (transfer, filter, params = {}) => {
  const returnTo = buildReturnTo(filter, params)
  const confirmedBy = safeArr(transfer.confirmedBy)
  const required = transfer.from === transfer.to ? 1 : 2
  const confirmedCount = confirmedBy.length
  const isUnconfirmed = String(transfer.status || "").toUpperCase() === "UNCONFIRMED"
  const dl = transfer.deadline ? moment(transfer.deadline) : null
  const isExpired = dl && dl.isValid() ? dl.isBefore(moment()) : false
  const tags = Array.isArray(transfer.tags) ? transfer.tags.map(t => String(t).toUpperCase()) : []
  const isUbi = tags.includes("UBI")
  const showConfirm = isUnconfirmed && transfer.to === userId && !confirmedBy.includes(userId) && !isExpired

  const topbar = renderTransferTopbar(transfer, filter, params)

  return div(
    { class: "transfer-item" },
    div(
      { class: "card-section transfer" },
      topbar ? topbar : null,
      renderCardField(`${i18n.transfersConcept}:`, transfer.concept || ""),
      renderCardField(`${i18n.transfersCategory || "Category"}:`, categoryLabel(categoryOf(transfer))),
      isUbi ? null : renderCardField(`${i18n.transfersDeadline}:`, dl && dl.isValid() ? dl.format("YYYY-MM-DD HH:mm") : ""),
      renderCardField(`${i18n.transfersStatus}:`, i18n[statusKey(transfer.status)] || String(transfer.status || "")),
      br,
      categoryOf(transfer) === "TRUST" ? null : div({ class: "transfer-amount-highlight" }, renderCardField(`${i18n.transfersAmount}:`, fmtAmountWithUnit(transfer))),
      renderConfirmationsBar(confirmedCount, required),
      showConfirm
        ? form(
            { method: "POST", action: `/transfers/confirm/${encodeURIComponent(transfer.id)}` },
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            button({ type: "submit" }, i18n.transfersConfirmButton),
            br(),
            br()
          )
        : null,
      p(
        { class: "card-footer" },
        span({ class: "date-link" }, `${moment(transfer.createdAt).format("YYYY-MM-DD HH:mm")} ${i18n.performed} `),
        userLink(transfer.from),
        renderUpdatedLabel(transfer.createdAt, transfer.updatedAt)
      )
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
  const transferToEdit = normalizedFilter === "edit" ? (list.find(t => t.id === transferId) || {}) : {}
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
            div(
              { class: "transfer-list" },
              filtered.length
                ? filtered.map(t => generateTransferCard(t, normalizedFilter, { q, minAmount: minAmountRaw, maxAmount: maxAmountRaw, sort }))
                : p(q || String(minAmountRaw) || String(maxAmountRaw) ? i18n.transfersNoMatch : i18n.transfersNoItems)
            )
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
  const showConfirm = isUnconfirmed && transfer.to === userId && !confirmedBy.includes(userId) && !isExpired

  const topbar = renderTransferTopbar(transfer, normalizedFilter, { ...params, q, sort, single: true })
  const tagsNode = renderTags(transfer.tags)

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
      renderBlockInfoCard(params.block),
      div(
        { class: "transfer-item" },
        div(
          { class: "card-section transfer" },
          topbar ? topbar : null,
          renderCardField(`${i18n.transfersFrom}:`, userLink(transfer.from)),
          renderCardField(`${i18n.transfersTo}:`, userLink(transfer.to)),
          br,
          categoryOf(transfer) === "TRUST" ? null : div({ class: "transfer-amount-highlight" }, renderCardField(`${i18n.transfersAmount}:`, fmtAmountWithUnit(transfer))),
          renderCardField(`${i18n.transfersCategory || "Category"}:`, categoryLabel(categoryOf(transfer))),
          renderCardField(`${i18n.transfersConcept}:`, transfer.concept || ""),
          isUbi ? null : renderCardField(`${i18n.transfersDeadline}:`, dl && dl.isValid() ? dl.format("YYYY-MM-DD HH:mm") : ""),
          renderCardField(`${i18n.transfersStatus}:`, i18n[statusKey(transfer.status)] || String(transfer.status || "")),
          br,
          renderConfirmationsBar(confirmedCount, required),
          showConfirm
            ? form(
                { method: "POST", action: `/transfers/confirm/${encodeURIComponent(transfer.id)}` },
                input({ type: "hidden", name: "returnTo", value: returnTo }),
                button({ type: "submit" }, i18n.transfersConfirmButton),
                br(),
                br()
              )
            : null,
          tagsNode ? tagsNode : null,
          tagsNode ? br() : null,
          form(
            { method: "GET", action: `/transfers/contract/${encodeURIComponent(transfer.id)}`, class: "transfer-contract-form" },
            button({ type: "submit", class: "filter-btn" }, i18n.transfersExportContract || 'Create Contract')
          ),
          br(),
          p(
            { class: "card-footer" },
            span({ class: "date-link" }, `${moment(transfer.createdAt).format("YYYY-MM-DD HH:mm")} ${i18n.performed} `),
            userLink(transfer.from),
            renderUpdatedLabel(transfer.createdAt, transfer.updatedAt)
          ),
          div(
            { class: "voting-buttons transfer-voting-buttons" },
            opinionCategories.map(category =>
              form(
                { method: "POST", action: `/transfers/opinions/${encodeURIComponent(transfer.id)}/${category}` },
                input({ type: "hidden", name: "returnTo", value: returnTo }),
                button(
                  { class: "vote-btn" },
                  `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`] || category} [${transfer.opinions?.[category] || 0}]`
                )
              )
            )
          )
        )
      )
    )
  )
}

