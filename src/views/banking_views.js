const { div, h2, h3, p, section, button, form, a, input, span, pre, table, thead, tbody, tr, td, th, br, strong, label, ul, li } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink, formatCarbon, renderStateChip, renderModuleStats, renderWalletChip } = require("../views/main_views");
const moment = require("../server/node_modules/moment");

const FILTER_LABELS = {
  overview: i18n.bankOverview,
  ubi: i18n.bankUbiTab,
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

const CHART_LINE_CLASSES = ["value", "supply", "inflation"];
const legendLayout = (labels, x0, maxX) => {
  const rows = [[]];
  let x = x0;
  for (const label of labels) {
    const width = 18 + String(label).length * 6.6 + 24;
    if (x + width > maxX && rows[rows.length - 1].length) { rows.push([]); x = x0; }
    rows[rows.length - 1].push({ label, x });
    x += width;
  }
  return rows;
};

const axisDecimals = (max, fallback) => {
  const m = Math.abs(Number(max) || 0);
  if (m >= 10000) return 0;
  if (m >= 100) return 2;
  return fallback;
};

const buildSeriesChartSvg = ({ series = [], xLabels = [], empty = "", yDecimals = 4, yDomain = null }) => {
  const valid = series.filter(s => Array.isArray(s.points) && s.points.length >= 2);
  const W = 720;
  const padR = 16, padT = 16;
  const first = valid[0] ? valid[0].points.map(v => Number(v) || 0) : [0];
  const yMax = yDomain ? Number(yDomain.max) : Math.max(...first);
  const yMin = yDomain ? Number(yDomain.min) : Math.min(...first);
  const decimals = axisDecimals(Math.max(Math.abs(yMax), Math.abs(yMin)), yDecimals);
  const widestLabel = Math.max(...[yMax, yMin].map(v => v.toFixed(decimals).length));
  const padL = Math.max(56, Math.round(widestLabel * 6.2) + 14);
  const legendRows = legendLayout(valid.map(s => s.label || ""), padL, W - padR);
  const padB = 54 + 16 * Math.max(1, legendRows.length);
  const H = 250 + padB;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  if (!valid.length) {
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="bank-eco-chart-svg" preserveAspectRatio="xMidYMid meet">`
      + `<rect x="0" y="0" width="${W}" height="${H}" class="bank-eco-chart-bg" />`
      + `<text x="${W/2}" y="${H/2}" text-anchor="middle" class="bank-eco-chart-empty">${escAttr(empty || 'Not enough samples yet')}</text>`
      + `</svg>`;
  }
  const lines = valid.map((s, idx) => {
    const vals = s.points.map(v => Number(v) || 0);
    const min = yDomain ? yMin : Math.min(...vals);
    const max = yDomain ? yMax : Math.max(...vals);
    const range = max - min || 1;
    const stepX = plotW / (vals.length - 1);
    const pts = vals.map((v, i) => `${(padL + i * stepX).toFixed(2)},${(padT + plotH - ((v - min) / range) * plotH).toFixed(2)}`).join(" ");
    return { cls: CHART_LINE_CLASSES[idx % CHART_LINE_CLASSES.length], label: s.label || "", pts, min, max, range };
  });
  const yTicks = 4;
  const grid = [];
  for (let i = 0; i <= yTicks; i++) {
    const y = padT + (plotH / yTicks) * i;
    grid.push(`<line x1="${padL}" x2="${W - padR}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}" class="bank-eco-chart-grid" />`);
    const val = lines[0].max - (lines[0].range / yTicks) * i;
    grid.push(`<text x="${padL - 6}" y="${(y + 4).toFixed(2)}" text-anchor="end" class="bank-eco-chart-axis">${val.toFixed(decimals)}</text>`);
  }
  const xLabelY = padT + plotH + 16;
  const [xs = "", xm = "", xe = ""] = xLabels;
  const xLabelsSvg = `<text x="${padL}" y="${xLabelY}" text-anchor="start" class="bank-eco-chart-axis">${escAttr(xs)}</text>`
    + `<text x="${(padL + plotW/2).toFixed(2)}" y="${xLabelY}" text-anchor="middle" class="bank-eco-chart-axis">${escAttr(xm)}</text>`
    + `<text x="${W - padR}" y="${xLabelY}" text-anchor="end" class="bank-eco-chart-axis">${escAttr(xe)}</text>`;
  const legendY0 = padT + plotH + 44;
  const legend = `<g class="bank-eco-chart-legend">` + legendRows.map((row, r) => row.map((item, i) => {
    const idx = legendRows.slice(0, r).reduce((acc, rr) => acc + rr.length, 0) + i;
    const l = lines[idx];
    const y = legendY0 + r * 16;
    return `<rect x="${item.x.toFixed(2)}" y="${(y - 7).toFixed(2)}" width="14" height="3" class="bank-eco-chart-line-${l.cls}-legend" />`
      + `<text x="${(item.x + 18).toFixed(2)}" y="${y}" class="bank-eco-chart-legend-text">${escAttr(l.label)}</text>`;
  }).join("")).join("") + `</g>`;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="bank-eco-chart-svg" preserveAspectRatio="xMidYMid meet">`
    + `<rect x="0" y="0" width="${W}" height="${H}" class="bank-eco-chart-bg" />`
    + grid.join("")
    + lines.slice().reverse().map(l => `<polyline points="${l.pts}" class="bank-eco-chart-line-${l.cls}" />`).join("")
    + xLabelsSvg
    + legend
    + `</svg>`;
};

const tsLabels = (arr, key) => {
  if (!arr.length) return ["", "", ""];
  const f = (x) => moment(x[key]).format("YYYY-MM-DD HH:mm");
  return [f(arr[0]), f(arr[Math.floor(arr.length / 2)]), f(arr[arr.length - 1])];
};

const buildEcoValueChartSvg = (history, labels) => {
  const arr = Array.isArray(history) ? history.slice(-120) : [];
  return buildSeriesChartSvg({
    series: [
      { label: labels.value || "Value", points: arr.map(s => Number(s.ecoValue || 0)) },
      { label: labels.supply || "Supply", points: arr.map(s => Number(s.currentSupply || 0)) },
      { label: labels.inflation || "Inflation", points: arr.map(s => Number(s.inflationFactor || 0)) }
    ],
    xLabels: tsLabels(arr, "ts"),
    empty: labels.empty
  });
};

const renderChartBlock = (id, title, svg) =>
  div({ class: "bank-eco-chart-block" },
    h2({ class: "bank-eco-chart-title" }, title),
    a({ href: `#${id}`, id: `${id}-src`, class: "bank-eco-chart-zoom-link", title: i18n.bankChartZoomHint },
      div({ class: "bank-eco-chart-canvas", innerHTML: svg })
    ),
    div({ id, class: "lightbox bank-eco-chart-lightbox" },
      a({ href: `#${id}-src`, class: "lightbox-close" }, "\u00d7"),
      div({ class: "bank-eco-chart-canvas-zoom", innerHTML: svg })
    )
  );

const renderRangedChart = (id, title, filterName, range, hasAnyData, svg) => {
  if (!hasAnyData) return null;
  return div({ class: "bank-eco-chart-block", id: `${id}-block` },
    h2({ class: "bank-eco-chart-title" }, title),
    renderRangeTabs(filterName, range, `${id}-block`),
    svg ? a({ href: `#${id}`, id: `${id}-src`, class: "bank-eco-chart-zoom-link", title: i18n.bankChartZoomHint }, div({ class: "bank-eco-chart-canvas", innerHTML: svg })) : p({ class: "bank-chart-empty-note" }, i18n.bankChartNoDataYet),
    svg ? div({ id, class: "lightbox bank-eco-chart-lightbox" }, a({ href: `#${id}-src`, class: "lightbox-close" }, "\u00d7"), div({ class: "bank-eco-chart-canvas-zoom", innerHTML: svg })) : null
  );
};

const bucketLabel = (bucket) => bucket === "month" ? i18n.bankChartPerMonth : bucket === "day" ? i18n.bankChartPerDay : i18n.bankChartPerHour;
const bucketXLabels = (pts, bucket) => {
  const fmt = (x) => bucket === "month" ? moment(x.ts).format("YYYY-MM") : bucket === "day" ? moment(x.ts).format("YYYY-MM-DD") : moment(x.ts).format("YYYY-MM-DD HH:mm");
  return pts.length ? [fmt(pts[0]), fmt(pts[Math.floor(pts.length / 2)]), fmt(pts[pts.length - 1])] : ["", "", ""];
};

const renderBucketChart = (id, title, filterName, data, field, label, decimals = 2) => {
  const pts = Array.isArray(data && data.points) ? data.points : [];
  const svg = pts.length >= 2 ? buildSeriesChartSvg({
    series: [{ label: `${label} ${bucketLabel(data.bucket)}`, points: pts.map(p => Number(p[field]) || 0) }],
    xLabels: bucketXLabels(pts, data.bucket),
    empty: i18n.bankExchangeChartEmpty, yDecimals: decimals
  }) : null;
  return renderRangedChart(id, title, filterName, (data && data.range) || "today", !!(data && data.hasAnyData), svg);
};

const renderSupplyChart = (history, range, hasAnyData, totalSupply = 0) => {
  const arr = Array.isArray(history) ? history.slice(-240) : [];
  const total = Number(totalSupply) || 0;
  const svg = arr.length >= 2 ? buildSeriesChartSvg({
    series: [{ label: i18n.bankCurrentSupply, points: arr.map(s => Number(s.currentSupply) || 0) }],
    xLabels: tsLabels(arr, "ts"),
    empty: i18n.bankExchangeChartEmpty, yDecimals: 0,
    yDomain: total > 0 ? { min: 0, max: total } : null
  }) : null;
  return renderRangedChart("eco-supply-chart", i18n.bankChartSupplyTitle, "exchange", range, !!hasAnyData, svg);
};

const renderInflationChart = (history, range, hasAnyData) => {
  const arr = Array.isArray(history) ? history.slice(-240) : [];
  const svg = arr.length >= 2 ? buildSeriesChartSvg({
    series: [{ label: i18n.bankChartInflationSeries, points: arr.map(s => Number(s.inflationFactor) || 0) }],
    xLabels: tsLabels(arr, "ts"),
    empty: i18n.bankExchangeChartEmpty, yDecimals: 2
  }) : null;
  return renderRangedChart("eco-inflation-chart", i18n.bankChartInflationTitle, "exchange", range, !!hasAnyData, svg);
};

const renderUbiCharts = (charts) => {
  const pool = Array.isArray(charts && charts.pool) ? charts.pool : [];
  const empty = i18n.bankExchangeChartEmpty;
  const poolSvg = pool.length >= 2 ? buildSeriesChartSvg({
    series: [{ label: i18n.bankChartPool, points: pool.map(x => x.balance) }],
    xLabels: tsLabels(pool, "ts"),
    empty, yDecimals: 2
  }) : null;
  const out = [
    renderBucketChart("ubi-chart-network", i18n.bankChartNetworkUbiTitle, "ubi", charts && charts.payments, "distributed", i18n.bankChartDistributed, 6),
    renderRangedChart("ubi-chart-pool", i18n.bankChartPoolTitle, "ubi", (charts && charts.poolRange) || "today", !!(charts && charts.hasPool), poolSvg)
  ].filter(Boolean);
  return out.length ? div(...out) : null;
};

const RANGES = ["today", "week", "month", "year", "5y", "all"];
const rangeLabel = (r) => ({ today: i18n.bankRangeToday, week: i18n.bankRangeWeek, month: i18n.bankRangeMonth, year: i18n.bankRangeYear, "5y": i18n.bankRangeFiveYears, all: i18n.bankRangeAll })[r] || r;
const renderRangeTabs = (filter, current, anchor) =>
  div({ class: "bank-range-tabs" },
    ...RANGES.map(r => a({ href: `/banking?filter=${filter}&range=${r}#${anchor}`, class: r === current ? "activity-chip active" : "activity-chip" }, String(rangeLabel(r)).toUpperCase()))
  );

const renderValueChart = (history, range, hasAnyData) => {
  const arr = Array.isArray(history) ? history.slice(-240) : [];
  if (!hasAnyData) return null;
  const hasTime = arr.some(s => Number(s.ecoTimeMs) > 0);
  const hasInflation = arr.some(s => Number(s.inflationFactor) > 0);
  const svg = arr.length >= 2 ? buildSeriesChartSvg({
    series: [
      { label: i18n.bankExchangeChartValue || "Value (ECO/h)", points: arr.map(s => Number(s.ecoValue || 0)) },
      ...(hasTime ? [{ label: i18n.bankChartValueHours, points: arr.map(s => Number(s.ecoTimeMs || 0) / 3600000) }] : []),
      ...(hasInflation ? [{ label: i18n.bankExchangeChartInflation || "Inflation %", points: arr.map(s => Number(s.inflationFactor || 0)) }] : [])
    ],
    xLabels: tsLabels(arr, "ts"),
    empty: i18n.bankExchangeChartEmpty
  }) : null;
  return renderRangedChart("eco-value-chart", i18n.bankChartValueTitle, "overview", range, !!hasAnyData, svg);
};

const renderWealthChart = (wealth, range) => {
  const pts = Array.isArray(wealth && wealth.points) ? wealth.points : [];
  if (!(wealth && wealth.hasAnyData)) return null;
  if (pts.length < 2) return div({ class: "bank-eco-chart-block", id: "wealth-chart-block" },
    h2({ class: "bank-eco-chart-title" }, i18n.bankChartWealthTitle),
    renderRangeTabs("exchange", range, "wealth-chart-block"),
    p({ class: "bank-chart-empty-note" }, i18n.bankChartNoDataYet)
  );
  const fmtBucket = (x) => wealth.bucket === "month" ? moment(x.ts).format("YYYY-MM") : wealth.bucket === "day" ? moment(x.ts).format("YYYY-MM-DD") : moment(x.ts).format("YYYY-MM-DD HH:mm");
  const per = wealth.bucket === "month" ? i18n.bankChartPerMonth : wealth.bucket === "day" ? i18n.bankChartPerDay : i18n.bankChartPerHour;
  const svg = buildSeriesChartSvg({
    series: [
      { label: `${i18n.bankChartDistributed} ${per}`, points: pts.map(p => p.distributed) },
      { label: `${i18n.bankChartTaxes} ${per}`, points: pts.map(p => p.taxes) }
    ],
    xLabels: [fmtBucket(pts[0]), fmtBucket(pts[Math.floor(pts.length / 2)]), fmtBucket(pts[pts.length - 1])],
    empty: i18n.bankExchangeChartEmpty, yDecimals: 2
  });
  const enough = pts.length >= 2;
  return div({ class: "bank-eco-chart-block", id: "wealth-chart-block" },
    h2({ class: "bank-eco-chart-title" }, i18n.bankChartWealthTitle),
    renderRangeTabs("exchange", range, "wealth-chart-block"),
    enough ? a({ href: "#wealth-chart", id: "wealth-chart-src", class: "bank-eco-chart-zoom-link", title: i18n.bankChartZoomHint }, div({ class: "bank-eco-chart-canvas", innerHTML: svg })) : p({ class: "bank-chart-empty-note" }, i18n.bankChartNoDataRange),
    enough ? div({ id: "wealth-chart", class: "lightbox bank-eco-chart-lightbox" }, a({ href: "#wealth-chart-src", class: "lightbox-close" }, "\u00d7"), div({ class: "bank-eco-chart-canvas-zoom", innerHTML: svg })) : null
  );
};

const renderKarmaChart = (history) => {
  const arr = Array.isArray(history && history.points) ? history.points : [];
  const svg = arr.length >= 2 ? buildSeriesChartSvg({
    series: [{ label: i18n.bankChartKarma, points: arr.map(x => x.score) }],
    xLabels: tsLabels(arr, "ts"),
    empty: i18n.bankExchangeChartEmpty, yDecimals: 0
  }) : null;
  return renderRangedChart("karma-chart", i18n.bankChartKarmaTitle, "overview", (history && history.range) || "today", !!(history && history.hasAny), svg);
};

const renderExchange = (ex, history, taxStats, wealth, range) => {
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
          kvRow(strong(i18n.bankExchangeCurrentValue), strong(`${fmtIndex(ex.ecoValue)} ECO`)),
          kvRow(strong(i18n.bankCurrentSupply), strong(`${Number(ex.currentSupply || 0).toFixed(6)} ECO`)),
          kvRow(strong(i18n.bankTotalSupply), strong(`${Number(ex.totalSupply || 0).toFixed(6)} ECO`)),
          kvRow(i18n.bankEcoinHours, ecoTimeLabel),
          kvRow(strong(i18n.bankInflation), strong(`${Number(ex.inflationFactor || 0).toFixed(2)}%`)),
          kvRow(i18n.bankInflationMonthly, `${Number(ex.inflationMonthly || 0).toFixed(2)}%`),
          kvRow(i18n.bankInflationIssuance, `${Number(ex.inflationIssuance || 0).toFixed(2)}%`),
          kvRow(strong(i18n.bankTotalUbiDistributed), strong(`${Number((wealth && wealth.totals && wealth.totals.distributed) || 0).toFixed(6)} ECO`)),
          kvRow(strong(i18n.bankTotalTaxesWithheld), strong(`${Number((wealth && wealth.totals && wealth.totals.taxes) || 0).toFixed(6)} ECO`)),
          ...taxRows
        )
      )
    ),
    renderWealthChart(wealth, (wealth && wealth.range) || range),
    renderSupplyChart(history, range, Array.isArray(history) && history.length >= 2, ex.totalSupply),
    renderInflationChart(history, range, Array.isArray(history) && history.length >= 2)
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

const renderUbiPubs = (pubs, hasValidWallet) => {
  const fmt = (ts) => Number(ts) > 0 ? moment(Number(ts)).format("YYYY/MM/DD HH:mm") : "—";
  if (!pubs.length) return div({ class: "bank-summary" }, p(i18n.bankUbiPubNone));
  return div({ class: "addr-cards ubi-pub-cards" },
    ...pubs.map(p => div({ class: "addr-card ubi-pub-card" },
      div({ class: "addr-card-head" },
        userLink(p.pubId),
        hasValidWallet && p.address
          ? div({ class: "content-actions" }, form({ method: "GET", action: "/banking/fund", class: "content-action-form" }, input({ type: "hidden", name: "pub", value: p.pubId }), button({ type: "submit", class: "btn-singleview btn-donate", title: i18n.bankDonateEco }, "\u2744")))
          : null
      ),
      div({ class: "bank-summary ubi-pub-summary" },
        table({ class: "bank-info-table" },
          tbody(
            kvRow(i18n.bankUbiAvailability, span({ class: p.available ? "ubi-tick-ok" : "ubi-tick-bad" }, p.available ? "✓" : "✗")),
            kvRow(i18n.bankUbiPool, strong(`${Number(p.balance || 0).toFixed(6)} ECO`)),
            kvRow(i18n.bankUbiLastSeen, fmt(p.timestamp)),
            kvRow(i18n.bankUbiLastPayout, fmt(p.lastPayoutAt)),
            kvRow(i18n.bankUbiPaidOut, strong(`${Number(p.paidOut || 0).toFixed(6)} ECO`))
          )
        )
      )
    ))
  );
};

const renderOverviewSummaryTable = (s, rules, userEcoinTax, isPub = false) => {
  const ubiWired = !!s.pubId || isPub;
  const score = Number(s.userEngagementScore || 0);
  const pool = Number(s.pool || 0);
  const W = Math.max(1, Number(s.weightsSum || 1));
  const w = 1 + score / 100;
  const cap = rules?.caps?.cap_user_epoch ?? 50;
  const floor = rules?.caps?.floor_user ?? 1;
  const gross = Math.max(floor, Math.min(pool * (w / W), cap));
  const surplus = Math.max(0, gross - floor);
  const tax = Number(userEcoinTax || 0);
  const ubiOn = ubiWired && s.ubiAvailability === "OK";
  const future = ubiOn ? floor + Math.max(0, surplus - tax) : 0;
  return div({ class: "bank-summary" },
    table({ class: "bank-info-table" },
      tbody(
        kvRow(strong(i18n.bankUserBalance), strong(`${Number(s.userBalance || 0).toFixed(6)} ECO`)),
        kvRow(strong(i18n.bankIndustryBalance || "Industry Production"), a({ href: '/industry' }, strong(`${Number(s.industryNetworkTotal || 0).toFixed(6)} ECO`))),
        kvRow(i18n.bankEpoch, String(s.epochId || "-")),
        kvRow(i18n.bankPool, `${pool.toFixed(6)} ECO`),
        kvRow(i18n.bankWeightsSum, String(W.toFixed(6))),
        kvRow(strong(i18n.bankingUserEngagementScore), strong(String(score))),
        ubiWired ? kvRow(i18n.bankYourUbiMonth || 'Your UBI (this month)', `${future.toFixed(6)} ECO`) : null,
        kvRow(i18n.bankYourIndustryBalance || 'Your Industry Share', a({ href: '/industry?filter=MEMBER' }, `${Number(s.industryBalance || 0).toFixed(6)} ECO`)),
        kvRow(i18n.bankYourSchoolBalance || 'Your School Earnings', a({ href: '/school?filter=mine' }, `${Number(s.schoolBalance || 0).toFixed(6)} ECO`)),
        kvRow(i18n.bankTotalUbiDistributed, `${Number((s.wealthTotals && s.wealthTotals.distributed) || 0).toFixed(6)} ECO`),
        kvRow(i18n.bankTotalTaxesWithheld, `${Number((s.wealthTotals && s.wealthTotals.taxes) || 0).toFixed(6)} ECO`),
        kvRow(strong(i18n.bankOverviewYourTaxes || 'Total Taxes'), a({ href: '/banking?filter=taxes' }, strong(`${tax.toFixed(6)} ECO`))),
        kvRow(strong(i18n.bankYourFundsMonth || 'Total Funds'), strong(`${((ubiWired ? future : 0) + Number(s.industryBalance || 0) + Number(s.schoolBalance || 0)).toFixed(6)} ECO`))
      )
    )
  );
};

const renderClaimUBIBlock = (pendingAllocation, isPub, alreadyClaimed, pubId, hasValidWallet, ubiAvailability, alreadyRefused = false, addressPublished = false, ecoinSynced = false) => {
  if (!ecoinSynced) return "";
  if (alreadyClaimed) return "";
  if (alreadyRefused) return div({ class: "bank-claim-ubi" }, div({ class: "bank-claim-card" }, p(i18n.bankUbiRefusedThisMonth)));
  if (!pubId && !isPub) return "";
  if (!isPub && !(hasValidWallet && addressPublished)) return "";
  if (!isPub && ubiAvailability !== "OK") return "";
  if (!pendingAllocation && !isPub) {
    return div({ class: "bank-claim-ubi" },
      div({ class: "bank-claim-card" },
        div({ class: "bank-claim-actions" },
          form({ method: "POST", action: "/banking/claim-ubi" },
            button({ type: "submit", class: "create-button bank-claim-btn" }, i18n.bankClaimUBI)
          ),
          form({ method: "POST", action: "/banking/refuse-ubi" },
            button({ type: "submit", class: "delete-btn bank-claim-btn" }, i18n.bankRefuseUBI)
          )
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
              td(moment(r.createdAt).format("YYYY/MM/DD HH:mm")),
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
        thead(tr(th(i18n.bankEpochId), th(i18n.bankPool), th(i18n.bankEpochAllocations), th(""))),
        tbody(
          ...epochs
            .sort((a, b) => String(b.id).localeCompare(String(a.id)))
            .map(e =>
              tr(
                td(e.id),
                td(String(Number(e.pool || 0).toFixed(6))),
                td(String(Number(e.recipients || 0))),
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
    h2(i18n.bankRulesEligibilityTitle),
    ul({ class: "bank-rules-list" }, ...[i18n.bankRulesEligibility1, i18n.bankRulesEligibility2, i18n.bankRulesEligibility3, i18n.bankRulesEligibility4, i18n.bankRulesEligibility5, i18n.bankRulesEligibility6].map(x => li(x))),

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
  if (key === "no_pub_address") return i18n.bankNoPubAddress;
  if (key === "refused") return i18n.bankUbiRefusedThisMonth;
  if (key === "already_refused") return i18n.bankUbiRefusedThisMonth;
  if (key === "no_funds") return i18n.bankUbiAvailableNo;
  if (key === "forbidden") return i18n.bankAddressForbidden;
  return "";
};

const flashBanner = (msgKey) =>
  !msgKey ? null : div({ class: "flash-banner" }, p(flashText(msgKey) || msgKey));

const renderAddresses = (data, userId) => {
  const rows = data.addresses || [];
  const search = data.search || "";
  const hasContent = rows.length > 0 || !!search;
  return div(
    data.flash ? flashBanner(data.flash) : null,
    div({ class: "bank-summary" },
      h2(i18n.bankAddAddressTitle),
      form({ method: "POST", action: "/banking/addresses", class: "bank-form" },
        label({ for: "addr-label" }, i18n.bankAddAddressLabel), br(),
        input({ type: "text", id: "addr-label", name: "label", maxlength: "80", placeholder: i18n.bankAddAddressLabelPlaceholder }), br(),
        label({ for: "addr-user-id" }, i18n.bankAddAddressUserOptional), br(),
        input({ type: "text", id: "addr-user-id", name: "userId", pattern: "^@[A-Za-z0-9+/]+={0,2}\\.ed25519$", placeholder: "@...=.ed25519" }), br(),
        label({ for: "addr-address" }, i18n.bankAddAddressAddress), br(),
        input({ type: "text", id: "addr-address", name: "address", required: true, pattern: "^[A-Za-z0-9]{20,64}$", placeholder: "ETQ17sBv8QFoiCPGKDQzNcDJeXmB2317HX" }), br(),
        button({ type: "submit", class: "create-button" }, i18n.bankAddAddressSave)
      )
    ),
    hasContent
      ? form({ method: "GET", action: "/banking", class: "filter-box bank-addr-search" },
          input({ type: "hidden", name: "filter", value: "addresses" }),
          input({ type: "text", name: "q", placeholder: i18n.bankAddressSearch, value: search || "", class: "filter-box__input" }),
          div({ class: "filter-box__controls" }, button({ type: "submit", class: "filter-box__button" }, i18n.searchButton))
        )
      : null,
    rows.length === 0
      ? div({ class: "no-content-box" }, p(i18n.bankNoAddresses))
      : div({ class: "bank-summary" },
          renderModuleStats(rows.length, [
            { label: i18n.bankLocal, count: rows.filter(r => r.source !== "ssb").length },
            { label: i18n.bankFromOasis, count: rows.filter(r => r.source === "ssb").length }
          ]),
          table({ class: "bank-addresses" },
            thead(tr(th(i18n.bankAddAddressLabel.replace(/\s*\(.*\)\s*$/, "")), th(i18n.bankAddAddressUser), th(i18n.bankAddress), th(i18n.bankAddressSource), th(""))),
            tbody(
              ...rows.map(r => tr(
                td(r.label || (r.id ? "" : i18n.bankAddressUnnamed)),
                td(r.id ? userLink(r.id) : ""),
                td(strong({ class: "bank-address-code" }, r.address)),
                td(r.source === "ssb" ? i18n.bankFromOasis : i18n.bankLocal),
                td(r.source === "ssb" && String(r.id) !== String(userId)
                  ? ""
                  : form({ method: "POST", action: "/banking/addresses/delete", class: "addr-del" },
                      input({ type: "hidden", name: "userId", value: r.id || "" }),
                      input({ type: "hidden", name: "source", value: r.source || "local" }),
                      input({ type: "hidden", name: "entryId", value: r.entryId || "" }),
                      button({ type: "submit", class: "delete-btn" }, i18n.bankAddressDelete)
                    ))
              ))
            )
          )
        )
  );
};

const bankingFilters = (data, filter, userId) => {
  const allocs = data.allocations || [];
  const subsets = ["mine", "pending", "closed", "claimed", "expired"].filter(f => filterAllocations(allocs, f, userId).length > 0 || filter === f);
  return [
    "overview", "exchange", "ubi", "taxes",
    ...subsets,
    ...((data.epochs || []).length || filter === "epochs" || String(filter || "").startsWith("epoch:") ? ["epochs"] : []),
    "addresses", "rules"
  ];
};

const renderBankingView = (data, filter, userId, isPub) =>
  template(
    i18n.banking,
    section(
      div({ class: "tags-header module-header-line" }, h2(i18n.banking), p(i18n.bankingDescription), renderWalletChip()),
      data.flash ? div({ class: "flash-banner" }, p(flashText(data.flash) || data.flash)) : null,
      generateFilterButtons(bankingFilters(data, filter, userId), filter, "/banking"),
      filter === "overview"
        ? div(
            renderOverviewSummaryTable(data.summary || {}, data.rules, data.userTotalTax || data.userEcoinTax, isPub),
            renderValueChart(data.exchangeHistory, data.valueRange || data.range, !!data.valueHasAnyData),
            renderKarmaChart(data.karmaHistory)
          )
        : filter === "ubi"
        ? div(
            renderClaimUBIBlock(data.pendingUBI || null, isPub, data.alreadyClaimed, (data.summary || {}).pubId, (data.summary || {}).hasValidWallet, (data.summary || {}).ubiAvailability, (data.summary || {}).alreadyRefused, (data.summary || {}).addressPublished, !!(data.exchange && data.exchange.isSynced)),
            renderUbiPubs(data.ubiPubs || [], !!(data.summary || {}).hasValidWallet),
            renderUbiCharts({ ...(data.ubiCharts || {}), payments: data.ubiPayments })
          )
        : filter === "exchange"
        ? renderExchange(data.exchange, data.exchangeHistory, data.taxStats, data.wealth, data.range)
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
            alloc.txid ? kvRow(i18n.bankTx, span({ class: "bank-address-code" }, alloc.txid)) : null
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

const bankingHeader = () =>
  div({ class: "tags-header module-header-line" }, h2(i18n.banking), p(i18n.bankingDescription), renderWalletChip());

const renderEpochView = (epoch, allocations, userId = "", data = {}) => {
  const rows = allocations || [];
  return template(
    i18n.banking,
    section(
      bankingHeader(),
      generateFilterButtons(bankingFilters({ ...data, allocations: rows, epochs: data.epochs || [{}] }, "epochs", userId), "epochs", "/banking"),
      !epoch
        ? div({ class: "no-content-box" }, p(i18n.bankNoEpochs))
        : div(
            h2(`${i18n.bankEpoch}: ${epoch.id}`),
            div({ class: "bank-summary" },
              table({ class: "bank-info-table" },
                tbody(
                  kvRow(i18n.bankEpochId, epoch.id || "-"),
                  kvRow(i18n.bankPool, `${Number(epoch.pool || 0).toFixed(6)} ECO`),
                  Number.isFinite(Number(epoch.weightsSum)) && Number(epoch.weightsSum) > 0 ? kvRow(i18n.bankWeightsSum, String(Number(epoch.weightsSum).toFixed(6))) : null,
                  kvRow(i18n.bankEpochAllocations, String(rows.length)),
                  epoch.hash && epoch.hash !== "-" ? kvRow(i18n.bankRuleHash, epoch.hash) : null
                )
              )
            ),
            h2(i18n.bankEpochAllocations),
            allocationsTable(rows, userId)
          )
    )
  );
};

module.exports = { renderBankingView, renderSingleAllocationView, renderEpochView };
