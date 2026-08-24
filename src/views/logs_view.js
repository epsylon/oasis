const { div, h2, p, section, button, form, span, table, thead, tbody, tr, th, td, input, textarea, br, option, select, a, label } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require("./main_views");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");
const { renderUrl } = require("../backend/renderUrl");

const userId = config.keys.id;

const safeArr = v => Array.isArray(v) ? v : [];

const FILTERS = ["today", "week", "month", "year", "always"];

const filterLabel = (f) => {
  const map = {
    today: i18n.logsFilterToday || 'TODAY',
    week: i18n.logsFilterWeek || 'LAST WEEK',
    month: i18n.logsFilterMonth || 'LAST MONTH',
    year: i18n.logsFilterYear || 'LAST YEAR',
    always: i18n.logsFilterAlways || 'ALWAYS'
  };
  return map[f] || f.toUpperCase();
};

const renderFilterBar = (current, hasItems = true) =>
  div({ class: "activity-sub-filter" },
    form({ method: "GET", action: "/logs", class: "sub-filter-form" },
      FILTERS.map(f =>
        button({
          type: "submit", name: "filter", value: f,
          class: current === f ? "filter-btn active" : "filter-btn"
        }, String(filterLabel(f)).toUpperCase())
      )
    ),
    form({ method: "GET", action: "/logs", class: "sub-filter-form" },
      input({ type: "hidden", name: "view", value: "create" }),
      button({ type: "submit", class: "create-button" }, i18n.logsCreate || 'Create Log')
    ),
    hasItems
      ? form({ method: "GET", action: "/logs/export", class: "sub-filter-form" },
          button({ type: "submit", class: "create-button" }, i18n.logsExport || 'Export Logs')
        )
      : null
  );

const renderSearchBox = (current, search) => {
  const q = search || {};
  return div({ class: "logs-search" },
    form({ method: "GET", action: "/logs", class: "filter-box" },
      input({ type: "hidden", name: "filter", value: current || 'today' }),
      input({
        type: "text", name: "q", class: "filter-box__input",
        placeholder: i18n.logsSearchText || 'Search in logs...',
        value: q.q || ''
      }),
      div({ class: "filter-box__controls" },
        input({
          type: "date", name: "date", class: "filter-box__select",
          value: q.date || ''
        }),
        select({ name: "type", class: "filter-box__select" },
          option({ value: '', ...(q.type ? {} : { selected: true }) }, i18n.logsSearchAnyType || 'Any type'),
          option({ value: 'manual', ...(q.type === 'manual' ? { selected: true } : {}) }, i18n.logsModeManual || 'Manual'),
          option({ value: 'ai', ...(q.type === 'ai' ? { selected: true } : {}) }, i18n.logsModeAI || 'AI')
        ),
        button({ type: "submit", class: "filter-box__button" }, i18n.logsSearchButton || 'Search')
      )
    )
  );
};

const renderToolbar = (current, search, hasItems) =>
  div({ class: "logs-toolbar-wrap" },
    renderFilterBar(current, hasItems),
    renderSearchBox(current, search)
  );

const truncate = (value, max = 160) => {
  const text = String(value == null ? '' : value).trim();
  return text.length > max ? `${text.slice(0, max)}\u2026` : text;
};

const renderLogPreview = (item) => {
  const text = truncate(item.text);
  return div({ class: "logs-entry-text" }, ...renderUrl(text));
};

const renderTable = (items) => {
  if (!safeArr(items).length) return p({ class: "no-content" }, i18n.logsEmpty || 'No logs yet.');
  return table({ class: "logs-table" },
    thead(
      tr(
        th(i18n.logsColumnDate || 'Date'),
        th(i18n.logsColumnType || 'Type'),
        th({ class: "logs-col-log" }, i18n.logsColumnLog || 'Log'),
        th({ class: "logs-col-actions" }, '')
      )
    ),
    tbody(
      items.map(item =>
        tr(
          td({ class: "logs-col-date" },
            span({ class: "logs-date-day" }, moment(item.ts).format("DD/MM/YYYY")),
            ' ',
            span({ class: "logs-date-time" }, moment(item.ts).format("HH:mm"))
          ),
          td({ class: "logs-col-type" },
            span({ class: item.mode === 'ai' ? "logs-type-text logs-type-ai" : "logs-type-text logs-type-manual" },
              item.mode === 'ai' ? (i18n.logsModeAI || 'AI') : (i18n.logsModeManual || 'Manual')
            )
          ),
          td({ class: "logs-col-log" },
            item.label ? div({ class: "logs-entry-label" }, item.label) : null,
            renderLogPreview(item)
          ),
          td({ class: "logs-col-actions" },
            div({ class: "logs-row-actions" },
              form({ method: "GET", action: `/logs/view/${encodeURIComponent(item.key)}` },
                button({ type: "submit", class: "filter-btn" }, i18n.logsViewDetails || 'View Details')
              ),
              form({ method: "GET", action: `/logs/export/${encodeURIComponent(item.key)}` },
                button({ type: "submit", class: "filter-btn" }, i18n.logsExportOne || 'Export')
              )
            )
          )
        )
      )
    )
  );
};

const renderModeToggle = (mode, aiModOn) => {
  const isAi = mode === 'ai';
  const isManual = !mode || mode === 'manual';
  return form({ method: "GET", action: "/logs", class: "logs-mode-form" },
    input({ type: "hidden", name: "view", value: "create" }),
    div({ class: "logs-mode-group" },
      button({
        type: "submit", name: "mode", value: "manual",
        class: isManual ? "filter-btn active" : "filter-btn"
      }, i18n.logsModeManual || 'Manual'),
      aiModOn
        ? button({
            type: "submit", name: "mode", value: "ai",
            class: isAi ? "filter-btn active" : "filter-btn"
          }, i18n.logsModeAIWritten || 'AI-Assistant')
        : null
    )
  );
};

const renderCreateForm = (mode, aiModOn) => {
  const isAi = mode === 'ai' && aiModOn;
  const inner = isAi
    ? div({ class: "div-center audio-form" },
        form({ method: "POST", action: "/logs/create" },
          input({ type: "hidden", name: "mode", value: "ai" }),
          button({ type: "submit", class: "create-button" }, i18n.logsGenerateButton || 'Generate Text')
        )
      )
    : div({ class: "div-center audio-form" },
        form({ method: "POST", action: "/logs/create" },
          input({ type: "hidden", name: "mode", value: "manual" }),
          textarea({ maxlength: "5000", name: "text", rows: "8", required: true, placeholder: i18n.logsTextPlaceholder || 'Describe your experiences...' }),
          br(), br(),
          button({ type: "submit", class: "create-button" }, i18n.logsWriteButton || 'Write')
        )
      );
  return div(renderModeToggle(mode, aiModOn), inner);
};

const renderEditForm = (entry) => {
  return div({ class: "div-center audio-form" },
    h2(i18n.logsEditTitle || 'Update Log'),
    form({ method: "POST", action: `/logs/update/${encodeURIComponent(entry.key)}` },
      textarea({ maxlength: "5000", name: "text", rows: "8", required: true }, entry.text || ''),
      input({ type: "hidden", name: "label", value: entry.label || '' }),
      br(), br(),
      button({ type: "submit", class: "create-button" }, i18n.logsUpdateButton || 'Update')
    )
  );
};

const renderDetail = (entry) => {
  const headerLine = `[${moment(entry.ts).format("DD/MM/YYYY HH:mm:ss")}]:`;
  return div({ class: "div-center audio-form logs-detail" },
    h2(headerLine),
    entry.label ? div({ class: "logs-entry-label" }, entry.label) : null,
    div({ class: "logs-detail-text" }, ...renderUrl(String(entry.text || ''))),
    div({ class: "tribe-side-actions logs-detail-actions" },
      form({ method: "GET", action: "/logs" },
        button({ type: "submit", class: "tribe-action-btn" }, i18n.walletBack || 'Back')
      ),
      form({ method: "GET", action: `/logs/export/${encodeURIComponent(entry.key)}` },
        button({ type: "submit", class: "tribe-action-btn" }, i18n.generatePdf)
      ),
      form({ method: "GET", action: `/logs/edit/${encodeURIComponent(entry.key)}` },
        button({ type: "submit", class: "tribe-action-btn" }, i18n.logsEdit || 'Update')
      ),
      form({ method: "POST", action: `/logs/delete/${encodeURIComponent(entry.key)}` },
        button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.logsDelete || 'Delete')
      )
    )
  );
};


exports.logsView = (items, filter, mode, opts = {}) => {
  const listTitle = i18n.logsTitle || 'Logs';
  const description = i18n.logsDescription || 'Record your experience in the network.';
  const view = opts.view || 'list';
  const aiModOn = !!opts.aiModOn;
  const hasItems = Array.isArray(items) && items.length > 0;

  const screen = (...blocks) => template(
    listTitle,
    section(
      div({ class: "tags-header" }, h2(listTitle), p(description)),
      renderFilterBar(filter),
      ...blocks
    )
  );

  if (view === 'create') {
    return screen(renderCreateForm(mode, aiModOn));
  }
  if (view === 'edit' && opts.entry) {
    return screen(renderEditForm(opts.entry));
  }
  if (view === 'detail' && opts.entry) {
    return screen(renderDetail(opts.entry));
  }
  const body = section(
    div({ class: "tags-header" }, h2(listTitle), p(description)),
    renderToolbar(filter, opts.search || {}, hasItems),
    div({ class: "logs-list" }, renderTable(items))
  );
  return template(listTitle, body);
};
