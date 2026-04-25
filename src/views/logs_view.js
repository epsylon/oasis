const { div, h2, p, section, button, form, span, table, thead, tbody, tr, th, td, input, textarea, br, option, select } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require("./main_views");
const moment = require("../server/node_modules/moment");
const { renderUrl } = require("../backend/renderUrl");

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

const renderFilterBar = (current) =>
  div({ class: "logs-toolbar" },
    form({ method: "GET", action: "/logs", class: "logs-toolbar-inline" },
      FILTERS.map(f =>
        button({
          type: "submit", name: "filter", value: f,
          class: current === f ? "filter-btn active" : "filter-btn"
        }, filterLabel(f))
      )
    ),
    form({ method: "GET", action: "/logs", class: "logs-toolbar-inline" },
      input({ type: "hidden", name: "view", value: "create" }),
      button({ type: "submit", class: "create-button" }, i18n.logsCreate || 'Create Log')
    ),
    form({ method: "GET", action: "/logs/export", class: "logs-toolbar-inline" },
      button({ type: "submit", class: "create-button" }, i18n.logsExport || 'Export Logs')
    )
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

const renderToolbar = (current, search) =>
  div({ class: "logs-toolbar-wrap" },
    renderFilterBar(current),
    renderSearchBox(current, search)
  );

const MAX_PREVIEW = 140;

const truncate = (str) => {
  const s = String(str || '');
  if (s.length <= MAX_PREVIEW) return s;
  return s.slice(0, MAX_PREVIEW).replace(/\s+\S*$/, '') + '…';
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
        th(i18n.logsColumnLog || 'Log'),
        th(''),
        th('')
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
            form({ method: "GET", action: `/logs/view/${encodeURIComponent(item.key)}` },
              button({ type: "submit", class: "filter-btn" }, i18n.logsViewDetails || 'View Details')
            )
          ),
          td({ class: "logs-col-actions" },
            form({ method: "GET", action: `/logs/export/${encodeURIComponent(item.key)}` },
              button({ type: "submit", class: "filter-btn" }, i18n.logsExportOne || 'Export')
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
          span(i18n.logsManualPrompt || 'Write your log'), br(),
          textarea({ name: "text", rows: "8", required: true, placeholder: i18n.logsTextPlaceholder || 'Describe your experiences...' }),
          br(), br(),
          button({ type: "submit", class: "create-button" }, i18n.logsWriteButton || 'Write')
        )
      );
  return div(renderModeToggle(mode, aiModOn), inner);
};

const renderEditForm = (entry) => {
  return div({ class: "div-center audio-form" },
    h2(i18n.logsEditTitle || 'Edit Log'),
    form({ method: "POST", action: `/logs/edit/${encodeURIComponent(entry.key)}` },
      span(i18n.logsManualPrompt || 'Write your log...'), br(),
      textarea({ name: "text", rows: "8", required: true }, entry.text || ''),
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
    div({ class: "logs-detail-actions" },
      form({ method: "GET", action: "/logs" },
        button({ type: "submit", class: "filter-btn" }, i18n.walletBack || 'Back')
      ),
      form({ method: "GET", action: `/logs/export/${encodeURIComponent(entry.key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.logsExportOne || 'Export')
      ),
      form({ method: "GET", action: "/logs" },
        input({ type: "hidden", name: "view", value: "edit" }),
        input({ type: "hidden", name: "id", value: entry.key }),
        button({ type: "submit", class: "filter-btn" }, i18n.logsEdit || 'Edit')
      ),
      form({ method: "POST", action: `/logs/delete/${encodeURIComponent(entry.key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.logsDelete || 'Delete')
      )
    )
  );
};

exports.logsView = (items, filter, mode, opts = {}) => {
  const listTitle = i18n.logsTitle || 'Logs';
  const description = i18n.logsDescription || 'Record your experience in the network.';
  const view = opts.view || 'list';
  const aiModOn = !!opts.aiModOn;

  if (view === 'create') {
    const h = i18n.logsCreateTitle || 'Create Log';
    const body = section(
      div({ class: "tags-header" }, h2(h), p(description)),
      renderFilterBar(filter),
      renderCreateForm(mode, aiModOn)
    );
    return template(h, body);
  }
  if (view === 'edit' && opts.entry) {
    const h = i18n.logsEditTitle || 'Edit Log';
    const body = section(
      div({ class: "tags-header" }, h2(h), p(description)),
      renderEditForm(opts.entry)
    );
    return template(h, body);
  }
  if (view === 'detail' && opts.entry) {
    const h = i18n.logsViewTitle || 'Log';
    const body = section(
      div({ class: "tags-header" }, h2(h), p(description)),
      renderDetail(opts.entry)
    );
    return template(h, body);
  }
  const body = section(
    div({ class: "tags-header" }, h2(listTitle), p(description)),
    renderToolbar(filter, opts.search || {}),
    div({ class: "logs-list" }, renderTable(items))
  );
  return template(listTitle, body);
};
