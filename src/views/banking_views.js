const { div, h2, p, section, button, form, a, input, span, pre, table, thead, tbody, tr, td, th, br } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require("../views/main_views");
const moment = require("../server/node_modules/moment");

const FILTER_LABELS = {
  overview: i18n.bankOverview,
  exchange: i18n.bankExchange,
  mine: i18n.mine,
  pending: i18n.pending,
  closed: i18n.closed,
  claimed: i18n.bankStatusClaimed,
  expired: i18n.bankStatusExpired,
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

const fmtEcoTime = (ms) => {
  if (!ms || ms <= 0) return `0 ${i18n.bankUnitMs || 'ms'}`;
  if (ms < 1000) return `${Number(ms).toFixed(3)} ${i18n.bankUnitMs || 'ms'}`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(2)} ${i18n.bankUnitSeconds || 'seconds'}`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(2)} ${i18n.bankUnitMinutes || 'minutes'}`;
  const h = m / 60;
  if (h < 24) return `${h.toFixed(2)} ${i18n.bankHoursOfWork || 'hours'}`;
  return `${(h / 24).toFixed(2)} ${i18n.bankUnitDays || 'days'}`;
};

const renderExchange = (ex) => {
  if (!ex) return div(p(i18n.bankExchangeNoData));
  const syncStatus = ex.isSynced ? i18n.bankingSyncStatusSynced : i18n.bankingSyncStatusOutdated;
  const syncStatusClass = ex.isSynced ? 'synced' : 'outdated';
  const ecoTimeLabel = ex.isSynced ? fmtEcoTime(ex.ecoTimeMs) : fmtEcoTime(0);
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
          kvRow(i18n.bankEcoinHours, ecoTimeLabel),
          kvRow(i18n.bankInflation, `${ex.inflationFactor.toFixed(2)}%`),
          kvRow(i18n.bankInflationMonthly, `${Number(ex.inflationMonthly || 0).toFixed(2)}%`)
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
  const availClass = s.ubiAvailability === "OK" ? "ubi-available" : "ubi-unavailable";
  const availLabel = s.ubiAvailability === "OK" ? i18n.bankUbiAvailableOk : i18n.bankUbiAvailableNo;
  return div({ class: "bank-summary" },
    table({ class: "bank-info-table" },
      tbody(
        kvRow(i18n.bankUserBalance, `${Number(s.userBalance || 0).toFixed(6)} ECO`),
        kvRow(i18n.bankPubBalance, `${Number(s.pubBalance || 0).toFixed(6)} ECO`),
        kvRow(i18n.bankUbiAvailability, span({ class: availClass }, availLabel)),
        s.pubId ? kvRow(i18n.pubIdLabel, a({ href: `/author/${encodeURIComponent(s.pubId)}`, class: "user-link" }, s.pubId)) : null,
        kvRow(i18n.bankEpoch, String(s.epochId || "-")),
        kvRow(i18n.bankPool, `${pool.toFixed(6)} ECO`),
        kvRow(i18n.bankWeightsSum, String(W.toFixed(6))),
        kvRow(i18n.bankingUserEngagementScore, String(score)),
        kvRow(i18n.bankUbiThisMonth, `${future.toFixed(6)} ECO`)
      )
    )
  );
};

const renderClaimUBIBlock = (pendingAllocation, isPub, alreadyClaimed, pubId, hasValidWallet, pubBalance, ubiAvailability) => {
  if (alreadyClaimed) return "";
  if (!pubId && !isPub) return "";
  if (!isPub && !hasValidWallet) return "";
  if (Number(pubBalance || 0) <= 0) return "";
  if (ubiAvailability !== "OK") return "";
  if (!pendingAllocation && !isPub) {
    return div({ class: "bank-claim-ubi" },
      div({ class: "bank-claim-card" },
        form({ method: "POST", action: "/banking/claim-ubi" },
          button({ type: "submit", class: "create-button bank-claim-btn" }, i18n.bankClaimUBI)
        )
      )
    );
  }
  if (!pendingAllocation) return "";
  return div({ class: "bank-claim-ubi" },
    div({ class: "bank-claim-card" },
      p(`${i18n.bankUbiThisMonth}: `, span({ class: "accent" }, `${Number(pendingAllocation.amount || 0).toFixed(6)} ECO`)),
      p(`${i18n.bankEpoch}: `, span(pendingAllocation.concept || "")),
      form({ method: "POST", action: `/banking/claim/${encodeURIComponent(pendingAllocation.id)}` },
        button({ type: "submit", class: "create-button bank-claim-btn" }, isPub ? i18n.bankClaimAndPay : i18n.bankClaimUBI)
      )
    )
  );
};

const filterAllocations = (allocs, filter, userId) => {
  if (filter === "mine") return allocs.filter(a => a.to === userId && (a.status === "UNCLAIMED" || a.status === "UNCONFIRMED"));
  if (filter === "pending") return allocs.filter(a => a.status === "UNCLAIMED" || a.status === "UNCONFIRMED");
  if (filter === "closed") return allocs.filter(a => a.status === "CLOSED");
  if (filter === "claimed") return allocs.filter(a => a.status === "CLAIMED");
  if (filter === "expired") return allocs.filter(a => a.status === "EXPIRED");
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
                (r.status === "UNCLAIMED" || r.status === "UNCONFIRMED") && r.to === userId
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
  if (key === "claimed_pending") return i18n.bankClaimedPending;
  if (key === "already_claimed") return i18n.bankAlreadyClaimedThisMonth;
  if (key === "no_pub_configured") return i18n.bankNoPubConfigured;
  if (key === "no_funds") return i18n.bankUbiAvailableNo;
  return "";
};

const flashBanner = (msgKey) =>
  !msgKey ? null : div({ class: "flash-banner" }, p(flashText(msgKey) || msgKey));

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
			form({ method: "POST", action: "/banking/addresses/delete", class: "addr-del" },
			  input({ type: "hidden", name: "userId", value: r.id }),
			  input({ type: "hidden", name: "source", value: r.source || "local" }),
			  button({ type: "submit", class: "delete-btn", onclick: `return confirm(${JSON.stringify(i18n.bankAddressDeleteConfirm)})` }, i18n.bankAddressDelete)
			)
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

const renderBankingView = (data, filter, userId, isPub) =>
  template(
    i18n.banking,
    section(
      div({ class: "tags-header" }, h2(i18n.banking), p(i18n.bankingDescription)),
      data.flash ? div({ class: "flash-banner" }, p(flashText(data.flash) || data.flash)) : null,
      generateFilterButtons(["overview","exchange","mine","pending","closed","claimed","expired","epochs","rules","addresses"], filter, "/banking"),
      filter === "overview"
        ? div(
            renderOverviewSummaryTable(data.summary || {}, data.rules),
            renderClaimUBIBlock(data.pendingUBI || null, isPub, data.alreadyClaimed, (data.summary || {}).pubId, (data.summary || {}).hasValidWallet, (data.summary || {}).pubBalance, (data.summary || {}).ubiAvailability),
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
  );

const renderSingleAllocationView = (alloc, userId) => {
  if (!alloc) return template(i18n.banking, section(div(p(i18n.bankNoAllocations))));
  return template(
    i18n.banking,
    section(
      div({ class: "tags-header" }, h2(i18n.banking)),
      div({ class: "bank-summary" },
        table({ class: "bank-info-table" },
          tbody(
            kvRow("ID", alloc.id || "-"),
            kvRow(i18n.bankAllocConcept, alloc.concept || "-"),
            kvRow(i18n.bankAllocFrom, alloc.from || "-"),
            kvRow(i18n.bankAllocTo, alloc.to || "-"),
            kvRow(i18n.bankAllocAmount, `${Number(alloc.amount || 0).toFixed(6)} ECO`),
            kvRow(i18n.bankAllocStatus, alloc.status || "-"),
            kvRow(i18n.bankAllocDate, alloc.createdAt ? fmtDate(alloc.createdAt) : "-"),
            alloc.txid ? kvRow("TxID", a({ href: `https://ecoin.03c8.net/blockexplorer/search?q=${encodeURIComponent(alloc.txid)}`, target: "_blank" }, alloc.txid)) : null
          )
        )
      ),
      alloc.status === "UNCONFIRMED" && alloc.to === userId
        ? form({ method: "POST", action: `/banking/claim/${encodeURIComponent(alloc.id)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.bankClaimNow)
          )
        : null,
      div(a({ href: "/banking", class: "filter-btn" }, i18n.bankOverview))
    )
  );
};

const renderEpochView = (epoch, allocations) => {
  if (!epoch) return template(i18n.banking, section(div(p(i18n.bankNoEpochs))));
  return template(
    i18n.banking,
    section(
      div({ class: "tags-header" }, h2(`${i18n.bankEpoch}: ${epoch.id}`)),
      div({ class: "bank-summary" },
        table({ class: "bank-info-table" },
          tbody(
            kvRow(i18n.bankEpochId, epoch.id || "-"),
            kvRow(i18n.bankPool, `${Number(epoch.pool || 0).toFixed(6)} ECO`),
            kvRow(i18n.bankWeightsSum, String(Number(epoch.weightsSum || 0).toFixed(6))),
            kvRow(i18n.bankRuleHash, epoch.hash || "-")
          )
        )
      ),
      h2(i18n.bankEpochAllocations),
      allocationsTable(allocations || [], "")
    )
  );
};

module.exports = { renderBankingView, renderSingleAllocationView, renderEpochView };
