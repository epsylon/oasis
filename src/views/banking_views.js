const { div, h2, h3, p, section, button, form, a, input, span, pre, table, thead, tbody, tr, td, th, br, strong, label } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink, formatCarbon } = require("../views/main_views");
const moment = require("../server/node_modules/moment");

const FILTER_LABELS = {
  overview: i18n.bankOverview,
  exchange: i18n.bankExchange,
  taxes: i18n.bankTaxes || "Taxes",
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

const escAttr = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildEcoValueChartSvg = (history, labels) => {
  const arr = Array.isArray(history) ? history.slice(-120) : [];
  const W = 720, H = 320;
  const padL = 56, padR = 16, padT = 16, padB = 70;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  if (arr.length < 2) {
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="bank-eco-chart-svg" preserveAspectRatio="xMidYMid meet">`
      + `<rect x="0" y="0" width="${W}" height="${H}" class="bank-eco-chart-bg" />`
      + `<text x="${W/2}" y="${H/2}" text-anchor="middle" class="bank-eco-chart-empty">${escAttr(labels.empty || 'Not enough samples yet')}</text>`
      + `</svg>`;
  }
  const values = arr.map(s => Number(s.ecoValue || 0));
  const supplies = arr.map(s => Number(s.currentSupply || 0));
  const inflations = arr.map(s => Number(s.inflationFactor || 0));
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const rangeV = maxV - minV || 1;
  const minS = Math.min(...supplies);
  const maxS = Math.max(...supplies);
  const rangeS = maxS - minS || 1;
  const minI = Math.min(...inflations);
  const maxI = Math.max(...inflations);
  const rangeI = maxI - minI || 1;
  const stepX = arr.length > 1 ? plotW / (arr.length - 1) : plotW;
  const xy = (i, v, minR, rangeR) => {
    const x = padL + i * stepX;
    const y = padT + plotH - ((v - minR) / rangeR) * plotH;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };
  const pointsValue = values.map((v, i) => xy(i, v, minV, rangeV)).join(' ');
  const pointsSupply = supplies.map((v, i) => xy(i, v, minS, rangeS)).join(' ');
  const pointsInfl = inflations.map((v, i) => xy(i, v, minI, rangeI)).join(' ');
  const tsStart = moment(arr[0].ts).format('YYYY-MM-DD HH:mm');
  const tsEnd = moment(arr[arr.length - 1].ts).format('YYYY-MM-DD HH:mm');
  const tsMid = moment(arr[Math.floor(arr.length / 2)].ts).format('YYYY-MM-DD HH:mm');
  const yTicks = 4;
  const grid = [];
  for (let i = 0; i <= yTicks; i++) {
    const y = padT + (plotH / yTicks) * i;
    grid.push(`<line x1="${padL}" x2="${W - padR}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}" class="bank-eco-chart-grid" />`);
    const val = maxV - (rangeV / yTicks) * i;
    grid.push(`<text x="${padL - 6}" y="${(y + 4).toFixed(2)}" text-anchor="end" class="bank-eco-chart-axis">${val.toFixed(4)}</text>`);
  }
  const xLabelY = padT + plotH + 16;
  const xLabels = `<text x="${padL}" y="${xLabelY}" text-anchor="start" class="bank-eco-chart-axis">${escAttr(tsStart)}</text>`
    + `<text x="${(padL + plotW/2).toFixed(2)}" y="${xLabelY}" text-anchor="middle" class="bank-eco-chart-axis">${escAttr(tsMid)}</text>`
    + `<text x="${W - padR}" y="${xLabelY}" text-anchor="end" class="bank-eco-chart-axis">${escAttr(tsEnd)}</text>`;
  const legendY = padT + plotH + 44;
  const legendBaseX = padL;
  const legend = `<g class="bank-eco-chart-legend">`
    + `<rect x="${legendBaseX}" y="${(legendY - 7).toFixed(2)}" width="14" height="3" class="bank-eco-chart-line-value-legend" />`
    + `<text x="${(legendBaseX + 18).toFixed(2)}" y="${legendY}" class="bank-eco-chart-legend-text">${escAttr(labels.value || 'Value')}</text>`
    + `<rect x="${(legendBaseX + 170).toFixed(2)}" y="${(legendY - 7).toFixed(2)}" width="14" height="3" class="bank-eco-chart-line-supply-legend" />`
    + `<text x="${(legendBaseX + 188).toFixed(2)}" y="${legendY}" class="bank-eco-chart-legend-text">${escAttr(labels.supply || 'Supply')}</text>`
    + `<rect x="${(legendBaseX + 320).toFixed(2)}" y="${(legendY - 7).toFixed(2)}" width="14" height="3" class="bank-eco-chart-line-inflation-legend" />`
    + `<text x="${(legendBaseX + 338).toFixed(2)}" y="${legendY}" class="bank-eco-chart-legend-text">${escAttr(labels.inflation || 'Inflation')}</text>`
    + `</g>`;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="bank-eco-chart-svg" preserveAspectRatio="xMidYMid meet">`
    + `<rect x="0" y="0" width="${W}" height="${H}" class="bank-eco-chart-bg" />`
    + grid.join('')
    + `<polyline points="${pointsSupply}" class="bank-eco-chart-line-supply" />`
    + `<polyline points="${pointsInfl}" class="bank-eco-chart-line-inflation" />`
    + `<polyline points="${pointsValue}" class="bank-eco-chart-line-value" />`
    + xLabels
    + legend
    + `</svg>`;
};

const renderExchange = (ex, history, taxStats) => {
  if (!ex) return div(p(i18n.bankExchangeNoData));
  const syncStatus = ex.isSynced ? i18n.bankingSyncStatusSynced : i18n.bankingSyncStatusOutdated;
  const syncStatusClass = ex.isSynced ? 'synced' : 'outdated';
  const ecoTimeLabel = ex.isSynced ? fmtEcoTime(ex.ecoTimeMs) : fmtEcoTime(0);
  const chartLabels = {
    value: i18n.bankExchangeChartValue || 'Value (ECO/h)',
    supply: i18n.bankExchangeChartSupply || 'Supply',
    inflation: i18n.bankExchangeChartInflation || 'Inflation %',
    empty: i18n.bankExchangeChartEmpty || 'Not enough samples yet — revisit later'
  };
  const hasEnoughSamples = Array.isArray(history) && history.length >= 2 && ex.isSynced;
  const totals = (taxStats && taxStats.totals) || {};
  const taxRows = taxStats ? [
    kvRow(i18n.bankExchangeEcoTaxAnnual || 'ECOin Taxes (annual)', `${Number(totals.annualEcoinTax || 0).toFixed(6)} ECO`),
    kvRow(i18n.bankExchangeEcoTaxMonthly || 'ECOin Taxes (monthly)', `${Number(totals.monthlyEcoinTax || 0).toFixed(6)} ECO`)
  ] : [];
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
          kvRow(i18n.bankInflationMonthly, `${Number(ex.inflationMonthly || 0).toFixed(2)}%`),
          ...taxRows
        )
      )
    ),
    hasEnoughSamples
      ? div({ class: "bank-eco-chart-block" },
          h2({ class: "bank-eco-chart-title" }, i18n.bankExchangeChartTitle || 'ECOin value over time'),
          div({ class: "bank-eco-chart-canvas", innerHTML: buildEcoValueChartSvg(history, chartLabels) })
        )
      : null
  );
};

const renderTaxes = (data, lookup) => {
  const taxStats = data.taxStats || {};
  const userTax = Number(data.userEcoinTax || 0);
  const userArchTax = Number(data.userArchTax || 0);
  const lookupBlock = lookup && lookup.block ? lookup.block : null;
  return div(
    (() => {
      const selectedTypes = Array.isArray(data.selectedTaxTypes) ? data.selectedTaxTypes : ['eco', 'arch'];
      const isOn = (t) => selectedTypes.includes(t);
      const eco = (taxStats.byType && taxStats.byType.eco) || { lifetime: 0, annual: 0, monthly: 0 };
      const arch = (taxStats.byType && taxStats.byType.arch) || { lifetime: 0, annual: 0, monthly: 0 };
      const sumField = (field) =>
        (isOn('eco') ? (eco[field] || 0) : 0) +
        (isOn('arch') ? (arch[field] || 0) : 0);
      const totalLifetime = sumField('lifetime');
      const totalAnnual = sumField('annual');
      const totalMonthly = sumField('monthly');
      const blockHidden = lookupBlock ? input({ type: 'hidden', name: 'block', value: lookupBlock }) : null;
      return [
        div({ class: "bank-summary" },
          table({ class: "bank-info-table" },
            tbody(
              kvRow(i18n.bankTaxesTotalBlocks || 'Total blocks', String(taxStats.totalBlocks || 0)),
              kvRow(i18n.bankTaxesSpan || 'Sampling span', `${Number(taxStats.spanDays || 0).toFixed(2)} days`),
              isOn('eco') ? kvRow(i18n.bankTaxesEcoTaxLifetime || 'ECO Tax (lifetime)', `${Number(eco.lifetime || 0).toFixed(6)} ECO`) : null,
              isOn('eco') ? kvRow(i18n.bankTaxesAnnualEcoin || 'ECO Tax (annual)', `${Number(eco.annual || 0).toFixed(6)} ECO`) : null,
              isOn('eco') ? kvRow(i18n.bankTaxesMonthlyEcoin || 'ECO Tax (monthly)', `${Number(eco.monthly || 0).toFixed(6)} ECO`) : null,
              isOn('arch') ? kvRow(i18n.bankTaxesArchTaxLifetime || 'ARCH Tax (lifetime)', `${Number(arch.lifetime || 0).toFixed(6)} ECO`) : null,
              isOn('arch') ? kvRow(i18n.bankTaxesArchTaxAnnual || 'ARCH Tax (annual)', `${Number(arch.annual || 0).toFixed(6)} ECO`) : null,
              isOn('arch') ? kvRow(i18n.bankTaxesArchTaxMonthly || 'ARCH Tax (monthly)', `${Number(arch.monthly || 0).toFixed(6)} ECO`) : null,
              kvRow(strong(i18n.bankTaxesTotalLifetime || 'Total (lifetime)'), strong(`${Number(totalLifetime).toFixed(6)} ECO`)),
              kvRow(strong(i18n.bankTaxesTotalAnnual || 'Total (annual)'), strong(`${Number(totalAnnual).toFixed(6)} ECO`)),
              kvRow(strong(i18n.bankTaxesTotalMonthly || 'Total (monthly)'), strong(`${Number(totalMonthly).toFixed(6)} ECO`))
            )
          ),
          br(),
          form({ method: "GET", action: "/banking", class: "bank-taxes-types-form" },
            input({ type: "hidden", name: "filter", value: "taxes" }),
            input({ type: "hidden", name: "types", value: "eco" }),
            blockHidden,
            span({ class: "bank-taxes-types-label" }, (i18n.bankTaxesTypesLabel || 'Select which taxes you want to pay') + ': '),
            label({ class: "bank-taxes-type-toggle bank-taxes-type-toggle-locked" },
              input({ type: "checkbox", checked: 'checked', disabled: 'disabled' }),
              ' ',
              (i18n.ecoTaxLabel || 'ECO Tax')
            ),
            label({ class: "bank-taxes-type-toggle" },
              input(Object.assign({ type: "checkbox", name: "types", value: "arch" }, isOn('arch') ? { checked: 'checked' } : {})),
              ' ',
              (i18n.bankTaxesArchTaxTitle || 'ARCH Tax')
            ),
            button({ type: "submit", class: "filter-btn" }, i18n.bankTaxesTypesApply || 'Set my taxes')
          )
        )
      ];
    })(),
    div({ class: "bank-summary" },
      h2(i18n.bankTaxesEcoTaxTitle || 'ECO Tax'),
      table({ class: "bank-info-table" },
        tbody(
          kvRow(i18n.bankTaxesTotalBytes || 'Total bytes', `${Number(taxStats.totalBytes || 0).toLocaleString()} B`),
          kvRow(i18n.bankTaxesTotalCarbon || 'Total carbon', formatCarbon(taxStats.totalBytes || 0)),
          kvRow(i18n.bankRulesCarbonFactor || 'Carbon factor', `${Number(0.095).toFixed(4)} g CO₂ / MiB`),
          kvRow(i18n.bankTaxesRate || 'Rate', `${Number(taxStats.ecoinPerGramCO2 || 0).toFixed(4)} ECO / g CO₂`),
          kvRow(i18n.bankTaxesUserAmount || 'Your ECO tax (price to return)', `${userTax.toFixed(6)} ECO`)
        )
      ),
      p({ class: "bank-taxes-user-note" },
        (i18n.bankTaxesUserNoteIntro || 'Your ECO tax is deducted from the surplus the network generates on top of your UBI; the base UBI value is set as an immovable minimum. The tax is never deducted from the fixed amount that corresponds to each inhabitant as UBI. The deducted funds feed the wealth-redistribution algorithm and are channeled back to other inhabitants via their UBI claims. Those other inhabitants who receive more UBI for their projects will likely have some task dedicated to helping you reduce your ECO tax. Or they may dedicate themselves to '),
        strong(i18n.bankTaxesUserNoteBold || 'reducing the ECO tax directly'),
        (i18n.bankTaxesUserNoteOutro || ', and their ongoing contribution may be required by networking consensus.')
      ),
      p({ class: "bank-taxes-user-note" }, i18n.bankTaxesUserNoteChips || 'The ECO Tax chip shown next to each item changes color (green / yellow / red) depending on the item size relative to the largest block ever seen on the network, softened by the number of active inhabitants — a larger solar-punk network distributes the load and pushes more items into the green band.'),
      p({ class: "bank-taxes-user-note" }, i18n.bankTaxesUserNoteChipsClick || 'Click any chip to inspect its block in the blockexplorer.'),
      (() => {
        const firstBlock = data.firstBlock || null;
        const sampleSize = Number(data.firstBlockSize || 0);
        const sampleHref = firstBlock
          ? `/blockexplorer?inspect=${encodeURIComponent(firstBlock)}`
          : '/blockexplorer';
        const sampleValue = sampleSize > 0 ? formatCarbon(sampleSize) : '— CO₂';
        const label = i18n.ecoTaxLabel || 'ECO Tax';
        return p({ class: "bank-taxes-example-chips" },
          a({ href: sampleHref, class: 'eco-tax-chip eco-tax-chip-low', title: label + ' · low' },
            span({ class: 'eco-tax-chip-label' }, label + ': '),
            span({ class: 'eco-tax-chip-value' }, sampleValue)
          ),
          ' ',
          a({ href: sampleHref, class: 'eco-tax-chip eco-tax-chip-mid', title: label + ' · mid' },
            span({ class: 'eco-tax-chip-label' }, label + ': '),
            span({ class: 'eco-tax-chip-value' }, sampleValue)
          ),
          ' ',
          a({ href: sampleHref, class: 'eco-tax-chip eco-tax-chip-high', title: label + ' · high' },
            span({ class: 'eco-tax-chip-label' }, label + ': '),
            span({ class: 'eco-tax-chip-value' }, sampleValue)
          )
        );
      })(),
      p({ class: "bank-taxes-user-note" }, i18n.bankTaxesUserNoteOtherParams || 'ECO Tax is currently derived from the carbon footprint of each block, but it may incorporate other parameters over time — energy spent on replication, redundant storage across peers, blob bandwidth, computational cost of decryption, mining footprint of associated transactions, or any other measurable load the network agrees to value.')
    ),
    div({ class: "bank-summary" },
      h2(i18n.bankTaxesArchTaxTitle || 'ARCH Tax'),
      table({ class: "bank-info-table" },
        tbody(
          kvRow(i18n.bankTaxesArchTaxFirstBlock || 'Your first block age', userArchTax > 0
            ? `${(userArchTax / Number(taxStats.ecoinPerDayOfHistory || 0.001)).toFixed(2)} days`
            : '—'),
          kvRow(i18n.bankTaxesArchTaxRate || 'Rate', `${Number(taxStats.ecoinPerDayOfHistory || 0).toFixed(6)} ECO / day of history`),
          kvRow(i18n.bankTaxesArchTaxUserAmount || 'Your ARCH tax (price to return)', `${userArchTax.toFixed(6)} ECO`)
        )
      ),
      p({ class: "bank-taxes-user-note" },
        (i18n.bankTaxesArchTaxNoteIntro || 'Your ARCH tax is deducted from the surplus the network generates on top of your UBI; the base UBI value is set as an immovable minimum. The tax is never deducted from the fixed amount that corresponds to each inhabitant as UBI. The deducted funds feed the wealth-redistribution algorithm and are channeled back to other inhabitants via their UBI claims. Newer inhabitants and those specifically dedicated to archival, replication and maintenance tasks will likely have some task dedicated to keeping the network archive healthy on your behalf. Or they may dedicate themselves to '),
        strong(i18n.bankTaxesArchTaxNoteBold || 'reducing the ARCH tax directly'),
        (i18n.bankTaxesArchTaxNoteOutro || ' through pruning agreements, deduplication of redundant data, and shared maintenance infrastructure, and their ongoing contribution may be required by networking consensus.')
      ),
      p({ class: "bank-taxes-user-note" }, i18n.bankTaxesArchTaxFootprintNote || 'ARCH Tax reflects the cost of growing and maintaining the network archive. It is computed from the time gap between your first published block and the newest block in the network — the longer your history has lived in the archive, the larger your share of the maintenance cost.')
    ),
  );
};

const renderOverviewSummaryTable = (s, rules, userEcoinTax) => {
  const score = Number(s.userEngagementScore || 0);
  const pool = Number(s.pool || 0);
  const W = Math.max(1, Number(s.weightsSum || 1));
  const w = 1 + score / 100;
  const cap = rules?.caps?.cap_user_epoch ?? 50;
  const floor = rules?.caps?.floor_user ?? 1;
  const gross = Math.max(floor, Math.min(pool * (w / W), cap));
  const surplus = Math.max(0, gross - floor);
  const tax = Number(userEcoinTax || 0);
  const future = floor + Math.max(0, surplus - tax);
  const availClass = s.ubiAvailability === "OK" ? "ubi-available" : "ubi-unavailable";
  const availLabel = s.ubiAvailability === "OK" ? i18n.bankUbiAvailableOk : i18n.bankUbiAvailableNo;
  return div({ class: "bank-summary" },
    table({ class: "bank-info-table" },
      tbody(
        kvRow(i18n.bankUserBalance, `${Number(s.userBalance || 0).toFixed(6)} ECO`),
        kvRow(i18n.bankUbiAvailability, span({ class: availClass }, availLabel)),
        s.pubId ? kvRow(i18n.pubIdLabel, userLink(s.pubId)) : null,
        kvRow(i18n.bankEpoch, String(s.epochId || "-")),
        kvRow(i18n.bankPool, `${pool.toFixed(6)} ECO`),
        kvRow(i18n.bankWeightsSum, String(W.toFixed(6))),
        kvRow(i18n.bankingUserEngagementScore, String(score)),
        kvRow(i18n.bankOverviewYourTaxes || 'Your taxes', a({ href: '/banking?filter=taxes' }, `${tax.toFixed(6)} ECO`)),
        kvRow(i18n.bankUbiThisMonth, `${future.toFixed(6)} ECO`)
      )
    )
  );
};

const renderClaimUBIBlock = (pendingAllocation, isPub, alreadyClaimed, pubId, hasValidWallet, ubiAvailability) => {
  if (alreadyClaimed) return "";
  if (!pubId && !isPub) return "";
  if (!isPub && !hasValidWallet) return "";
  if (!isPub && ubiAvailability !== "OK") return "";
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
              td(userLink(r.from)),
              td(userLink(r.to)),
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

const rulesBlock = (rules, taxRules) => {
  const r = rules || {};
  const caps = r.caps || {};
  const tr = taxRules || {};
  const fmt = (n, d = 4) => (Number.isFinite(Number(n)) ? Number(n).toFixed(d) : "—");
  return div({ class: "bank-rules" },
    h2(i18n.bankRulesPoolTitle || "Monthly pool"),
    table({ class: "bank-info-table" },
      tbody(
        kvRow(i18n.bankRulesEpochKind || "Epoch granularity", String(r.epochKind || "MONTHLY")),
        kvRow(i18n.bankRulesAlpha || "Alpha (max share of pub balance per epoch)", `${fmt((r.alpha ?? 0) * 100, 2)} %`),
        kvRow(i18n.bankRulesReserveMin || "Reserve minimum (kept in pub balance)", `${fmt(r.reserveMin, 6)} ECO`),
        kvRow(i18n.bankRulesCapPerEpoch || "Cap per epoch (absolute)", `${fmt(r.capPerEpoch, 6)} ECO`),
        kvRow(i18n.bankRulesGraceDays || "Claim grace period", `${fmt(r.graceDays, 0)} days`)
      )
    ),
    p({ class: "bank-rules-formula" },
      strong(i18n.bankRulesPoolFormula || "Pool = min(pubBal − reserveMin, capPerEpoch, alpha × pubBal)")
    ),

    h2(i18n.bankRulesShareTitle || "Per-user share"),
    table({ class: "bank-info-table" },
      tbody(
        kvRow(i18n.bankRulesWMin || "Minimum weight (w_min)", fmt(caps.w_min, 4)),
        kvRow(i18n.bankRulesWMax || "Maximum weight (w_max)", fmt(caps.w_max, 4)),
        kvRow(i18n.bankRulesFloor || "Floor per user (gross)", `${fmt(caps.floor_user, 6)} ECO`),
        kvRow(i18n.bankRulesCapUser || "Cap per user per epoch", `${fmt(caps.cap_user_epoch, 6)} ECO`)
      )
    ),
    p({ class: "bank-rules-formula" },
      strong(i18n.bankRulesWeightFormula || "w = clamp(1 + karma/100, w_min, w_max)")
    ),
    p({ class: "bank-rules-formula" },
      strong(i18n.bankRulesShareFormula || "gross_UBI(user) = clamp(Pool × w / Σw, floor_user, cap_user_epoch)")
    ),

    h2(i18n.bankRulesKarmaTitle || "Karma (user engagement score)"),
    p({ class: "bank-rules-note" }, i18n.bankRulesKarmaNote || "Karma is derived from your actions (posts, votes, parliament/courts participation, etc.) with a time-decay factor, minus the carbon grams generated by your feed."),
    p({ class: "bank-rules-formula" },
      strong(i18n.bankRulesKarmaFormula || "karma = max(0, round(scoreFromActions − carbonGramsForUser))")
    ),

    h2(i18n.bankRulesEcoTaxTitle || "ECO Tax"),
    table({ class: "bank-info-table" },
      tbody(
        kvRow(i18n.bankRulesEcoTaxRate || "Rate", `${fmt(tr.ecoinPerGramCO2, 4)} ECO / g CO₂`),
        kvRow(i18n.bankRulesCarbonFactor || "Carbon factor", `${fmt(tr.gramsCO2PerMiB, 4)} g CO₂ / MiB`)
      )
    ),
    p({ class: "bank-rules-formula" },
      strong(i18n.bankRulesEcoTaxFormula || "ECO Tax(user) = (userBytes / 1 MiB) × 0.095 × ecoinPerGramCO2")
    ),
    p({ class: "bank-rules-note" }, i18n.bankRulesEcoTaxNote || "ECO Tax is deducted only from the surplus that the network generates above the immovable floor — the base UBI (floor_user) is never reduced. The deducted ECO are not redistributed in this epoch; they remain in the pub balance and feed the next epoch's pool through reserveMin / alpha caps."),
    h2(i18n.bankRulesChipTitle || "ECO Tax chip color band"),
    p({ class: "bank-rules-note" }, i18n.bankRulesChipNote || "Each item's chip is colored relative to the largest message ever observed in the network and softened by the number of active inhabitants — a larger network distributes the load and pushes more items into the green band."),
    p({ class: "bank-rules-formula" },
      strong(i18n.bankRulesChipFormula || "band = ratio / reducer, where ratio = sizeBytes / maxBlockBytes, reducer = 1 + log10(inhabitants). high ≥ 0.66, mid ≥ 0.33, otherwise low.")
    ),

    h2(i18n.bankRulesArchTaxTitle || "ARCH Tax"),
    table({ class: "bank-info-table" },
      tbody(
        kvRow(i18n.bankRulesArchTaxRate || "Rate", `${fmt(tr.ecoinPerDayOfHistory, 6)} ECO / day of history`)
      )
    ),
    p({ class: "bank-rules-formula" },
      strong(i18n.bankRulesArchTaxFormula || "ARCH Tax(user) = max(0, (newestBlockTs − userFirstBlockTs) / 86400000) × ecoinPerDayOfHistory")
    ),
    p({ class: "bank-rules-note" }, i18n.bankRulesArchTaxNote || "ARCH Tax reflects the long-term cost of growing and maintaining the network archive: the older your data lives in the network, the larger your share of the maintenance cost."),

    p({ class: "bank-rules-formula" },
      strong(i18n.bankRulesNetFormula || "surplus = max(0, gross_UBI − floor_user); net_UBI = floor_user + max(0, surplus − (ECO Tax + ARCH Tax))")
    )
  );
};

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
  if (key === "forbidden") return i18n.bankAddressForbidden;
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
                    td(userLink(r.id)),
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
      generateFilterButtons(["overview","exchange","taxes","mine","pending","closed","claimed","expired","epochs","rules","addresses"], filter, "/banking"),
      filter === "overview"
        ? div(
            renderOverviewSummaryTable(data.summary || {}, data.rules, data.userTotalTax || data.userEcoinTax),
            renderClaimUBIBlock(data.pendingUBI || null, isPub, data.alreadyClaimed, (data.summary || {}).pubId, (data.summary || {}).hasValidWallet, (data.summary || {}).ubiAvailability),
            allocationsTable((data.allocations || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), userId)
          )
        : filter === "exchange"
        ? renderExchange(data.exchange, data.exchangeHistory, data.taxStats)
        : filter === "taxes"
        ? renderTaxes(data, data.lookup || null)
        : filter === "epochs"
        ? renderEpochList(data.epochs || [])
        : filter === "rules"
        ? rulesBlock(data.rules || {}, data.taxRules || {})
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
