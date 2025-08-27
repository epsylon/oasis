const { div, h2, p, section, button, form, a, input, span, pre, table, thead, tbody, tr, td, th, br } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require("../views/main_views");
const moment = require("../server/node_modules/moment");

const FILTER_LABELS = {
  overview: i18n.bankOverview,
  exchange: i18n.bankExchange,
  mine: i18n.mine,
  pending: i18n.pending,
  closed: i18n.closed,
  epochs: i18n.bankEpochs,
  rules: i18n.bankRules,
  addresses: i18n.bankAddresses
};

const generateFilterButtons = (filters, currentFilter, action) =>
  div({ class: "mode-buttons-row" },
    ...filters.map(mode =>
      form({ method: "GET", action },
        input({ type: "hidden", name: "filter", value: mode }),
        button({ type: "submit", class: currentFilter === mode ? "filter-btn active" : "filter-btn" }, (FILTER_LABELS[mode] || mode).toUpperCase())
      )
    )
  );

const kvRow = (label, value) =>
  tr(td({ class: "card-label" }, label), td({ class: "card-value" }, value));
  
const fmtIndex = (value) => {
    return value ? value.toFixed(6) : "0.000000";
};

const pct = (value) => {
    if (value === undefined || value === null) return "0.000001%";
    const formattedValue = (value).toFixed(6); 
    const sign = value >= 0 ? "+" : "";
    return `${sign}${formattedValue}%`;
};

const fmtDate = (timestamp) => {
    return moment(timestamp).format('YYYY-MM-DD HH:mm:ss');
};

const renderExchange = (ex) => {
  if (!ex) return div(p(i18n.bankExchangeNoData));
  const syncStatus = ex.isSynced ? i18n.bankingSyncStatusSynced : i18n.bankingSyncStatusOutdated;
  const syncStatusClass = ex.isSynced ? 'synced' : 'outdated';
  const ecoInHours = ex.isSynced ? ex.ecoInHours : 0;
  return div(
    div({ class: "bank-summary" },
      table({ class: "bank-info-table" },
        tbody(
          kvRow(i18n.bankingSyncStatus, 
            span({ class: syncStatusClass }, syncStatus)
          ),
          kvRow(i18n.bankExchangeCurrentValue, `${fmtIndex(ex.ecoValue)} ECO`),
          kvRow(i18n.bankCurrentSupply, `${Number(ex.currentSupply || 0).toFixed(6)} ECO`),
          kvRow(i18n.bankTotalSupply, `${Number(ex.totalSupply || 0).toFixed(6)} ECO`),
          kvRow(i18n.bankEcoinHours, `${ecoInHours} ${i18n.bankHoursOfWork}`),
          kvRow(i18n.bankInflation, `${ex.inflationFactor.toFixed(2)}%`)
        )
      )
    )
  );
};

const renderOverviewSummaryTable = (s, rules) => {
  const score = Number(s.userEngagementScore || 0);
  const pool = Number(s.pool || 0);
  const W = Math.max(1, Number(s.weightsSum || 1));
  const w = 1 + score / 100;
  const cap = rules?.caps?.cap_user_epoch ?? 50;
  const future = Math.min(pool * (w / W), cap);
  return div({ class: "bank-summary" },
    table({ class: "bank-info-table" },
      tbody(
        kvRow(i18n.bankUserBalance, `${Number(s.userBalance || 0).toFixed(6)} ECO`),
        kvRow(i18n.bankPubBalance, `${Number(s.pubBalance || 0).toFixed(6)} ECO`),
        kvRow(i18n.bankEpoch, String(s.epochId || "-")),
        kvRow(i18n.bankPool, `${pool.toFixed(6)} ECO`),
        kvRow(i18n.bankWeightsSum, String(W.toFixed(6))),
        kvRow(i18n.bankingUserEngagementScore, String(score)),
        kvRow(i18n.bankingFutureUBI, `${future.toFixed(6)} ECO`)
      )
    )
  );
};

function calculateFutureUBI(userEngagementScore, poolAmount) {
  const maxScore = 100;
  const scorePercentage = userEngagementScore / maxScore;
  const estimatedUBI = poolAmount * scorePercentage;
  return estimatedUBI;
}

const filterAllocations = (allocs, filter, userId) => {
  if (filter === "mine") return allocs.filter(a => a.to === userId && a.status === "UNCONFIRMED");
  if (filter === "pending") return allocs.filter(a => a.status === "UNCONFIRMED");
  if (filter === "closed") return allocs.filter(a => a.status === "CLOSED");
  return allocs;
};

const allocationsTable = (rows = [], userId) =>
  rows.length === 0
    ? div(p(i18n.bankNoAllocations))
    : table(
        { class: "bank-allocs" },
        thead(
          tr(
            th(i18n.bankAllocDate),
            th(i18n.bankAllocConcept),
            th(i18n.bankAllocFrom),
            th(i18n.bankAllocTo),
            th(i18n.bankAllocAmount),
            th(i18n.bankAllocStatus),
            th("")
          )
        ),
        tbody(
          ...rows.map(r =>
            tr(
              td(new Date(r.createdAt).toLocaleString()),
              td(r.concept || ""),
              td(a({ href: `/author/${encodeURIComponent(r.from)}`, class: "user-link" }, r.from)),
              td(a({ href: `/author/${encodeURIComponent(r.to)}`, class: "user-link" }, r.to)),
              td(String(Number(r.amount || 0).toFixed(6))),
              td(r.status),
              td(
                r.status === "UNCONFIRMED" && r.to === userId
                  ? form({ method: "POST", action: `/banking/claim/${encodeURIComponent(r.id)}` },
                      button({ type: "submit", class: "filter-btn" }, i18n.bankClaimNow)
                    )
                  : r.status === "CLOSED" && r.txid
                    ? a({ href: `https://ecoin.03c8.net/blockexplorer/search?q=${encodeURIComponent(r.txid)}`, target: "_blank", class: "btn-singleview" }, i18n.bankViewTx)
                    : null
              )
            )
          )
        )
      );

const renderEpochList = (epochs = []) =>
  epochs.length === 0
    ? div(p(i18n.bankNoEpochs))
    : table(
        { class: "bank-epochs" },
        thead(tr(th(i18n.bankEpochId), th(i18n.bankPool), th(i18n.bankWeightsSum), th(i18n.bankRuleHash), th(""))),
        tbody(
          ...epochs
            .sort((a, b) => String(b.id).localeCompare(String(a.id)))
            .map(e =>
              tr(
                td(e.id),
                td(String(Number(e.pool || 0).toFixed(6))),
                td(String(Number(e.weightsSum || 0).toFixed(6))),
                td(e.hash || "-"),
                td(
                  form({ method: "GET", action: `/banking/epoch/${encodeURIComponent(e.id)}` },
                    button({ type: "submit", class: "filter-btn" }, i18n.bankViewEpoch)
                  )
                )
              )
            )
        )
      );

const rulesBlock = (rules) =>
  div({ class: "bank-rules" }, pre({ class: "json-content" }, JSON.stringify(rules || {}, null, 2)));

const flashText = (key) => {
  if (key === "added") return i18n.bankAddressAdded;
  if (key === "updated") return i18n.bankAddressUpdated;
  if (key === "exists") return i18n.bankAddressExists;
  if (key === "invalid") return i18n.bankAddressInvalid;
  if (key === "deleted") return i18n.bankAddressDeleted;
  if (key === "not_found") return i18n.bankAddressNotFound;
  return "";
};

const flashBanner = (msgKey) =>
  !msgKey ? null : div({ class: "flash-banner" }, p(flashText(msgKey)));

const addressesToolbar = (rows = [], search = "") =>
  div({ class: "addr-toolbar" },
    div({ class: "addr-counter accent-pill" },
      span({ class: "acc-title accent" }, i18n.bankAddressTotal + ":"),
      span({ class: "acc-badge" }, String(rows.length))
    ),
    form({ method: "GET", action: "/banking", class: "addr-search" },
      input({ type: "hidden", name: "filter", value: "addresses" }),
      input({ type: "text", name: "q", placeholder: i18n.bankAddressSearch, value: search || "" }),
      br(),
      button({ type: "submit", class: "filter-btn" }, i18n.search)
    )
  );

const renderAddresses = (data, userId) => {
  const rows = data.addresses || [];
  const search = data.search || "";
  return div(
    data.flash ? flashBanner(data.flash) : null,
    addressesToolbar(rows, search),
    div({ class: "bank-addresses-stack" },
      div({ class: "addr-form-card wide" },
        h2(i18n.bankAddAddressTitle),
        form({ method: "POST", action: "/banking/addresses", class: "addr-form" },
          div({ class: "form-row" },
            span({ class: "form-label accent" }, i18n.bankAddAddressUser + ":"),
            input({
              class: "form-input xl",
              type: "text",
              name: "userId",
              required: true,
              pattern: "^@[A-Za-z0-9+/]+={0,2}\\.ed25519$",
              placeholder: "@...=.ed25519",
              id: "addr-user-id"
            })
          ),
          div({ class: "form-row" },
            span({ class: "form-label accent" }, i18n.bankAddAddressAddress + ":"),
            input({
              class: "form-input xl",
              type: "text",
              name: "address",
              required: true,
              pattern: "^[A-Za-z0-9]{20,64}$",
              placeholder: "ETQ17sBv8QFoiCPGKDQzNcDJeXmB2317HX"
            })
          ),
          div({ class: "form-actions" },
            button({ type: "submit", class: "filter-btn" }, i18n.bankAddAddressSave)
          )
        )
      ),
      div({ class: "addr-list-card" },
        rows.length === 0
          ? div(p(i18n.bankNoAddresses))
          : table(
              { class: "bank-addresses" },
              thead(
                tr(
                  th(i18n.bankUser),
                  th(i18n.bankAddress),
                  th(i18n.bankAddressSource),
                  th(i18n.bankAddressActions)
                )
              ),
              tbody(
                ...rows.map(r =>
                  tr(
                    td(a({ href: `/author/${encodeURIComponent(r.id)}`, class: "user-link" }, r.id)),
                    td(r.address),
                    td(r.source === "local" ? i18n.bankLocal : i18n.bankFromOasis),
                    td(
                      div({ class: "row-actions" },
                        r.source === "local"
                          ? form({ method: "POST", action: "/banking/addresses/delete", class: "addr-del" },
                              input({ type: "hidden", name: "userId", value: r.id }),
                              button({ type: "submit", class: "delete-btn", onclick: `return confirm(${JSON.stringify(i18n.bankAddressDeleteConfirm)})` }, i18n.bankAddressDelete)
                            )
                          : null
                      )
                    )
                  )
                )
              )
            )
      )
    )
  );
};

const renderBankingView = (data, filter, userId) =>
  template(
    i18n.banking,
    section(
      div({ class: "tags-header" }, h2(i18n.banking), p(i18n.bankingDescription)),
      generateFilterButtons(["overview","exchange","mine","pending","closed","epochs","rules","addresses"], filter, "/banking"),
      filter === "overview"
        ? div(
            renderOverviewSummaryTable(data.summary || {}, data.rules),
            allocationsTable((data.allocations || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), userId)
          )
        : filter === "exchange"
        ? renderExchange(data.exchange)
        : filter === "epochs"
        ? renderEpochList(data.epochs || [])
        : filter === "rules"
        ? rulesBlock(data.rules || {})
        : filter === "addresses"
        ? renderAddresses(data, userId)
        : allocationsTable(
            filterAllocations((data.allocations || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), filter, userId),
            userId
          )
    )
  )
  
module.exports = { renderBankingView };

