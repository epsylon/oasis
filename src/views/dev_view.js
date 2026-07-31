const { form, button, div, h2, p, section, input, a, span, ul, li, table, thead, tbody, tr, td, th, pre, code, select, option } = require("../server/node_modules/hyperaxe")
const { template, i18n } = require("./main_views")

const FILTERS = [
  { key: "tree", href: "/dev", i18n: "devFilterFiles", fallback: "FILES" },
  { key: "map", href: "/dev/map", i18n: "devFilterModules", fallback: "MODULES" },
  { key: "translations", href: "/dev?group=translations", i18n: "devFilterTranslations", fallback: "TRANSLATIONS" },
  { key: "styles", href: "/dev?group=styles", i18n: "devFilterStyles", fallback: "STYLES" },
  { key: "tests", href: "/dev?group=tests", i18n: "devFilterTests", fallback: "TESTS" }
]

const ICONS = {
  folder: "📁",
  parent: "↰",
  ".js": "📜",
  ".mjs": "📜",
  ".json": "🧾",
  ".css": "🎨",
  ".md": "📖",
  ".sh": "⌨",
  ".html": "🌐",
  ".txt": "📄",
  ".yml": "🧾",
  ".yaml": "🧾"
}

const safeText = (v) => String(v == null ? "" : v)

const iconFor = (file) => (file.viewable ? (ICONS[file.ext] || "📄") : "📦")

const fmtSize = (bytes) => {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const fmtCount = (n) => String(Number(n) || 0)

const fileHref = (path, from) => `/dev/file?path=${encodeURIComponent(path)}${from ? `&from=${from}` : ""}`
const dirHref = (path) => (path ? `/dev?path=${encodeURIComponent(path)}` : "/dev")

const renderHeader = (active) => [
  div({ class: "tags-header" },
    h2(i18n.devTitle || "Developer"),
    p(i18n.devDescription || "Explore the source code running on this node.")
  ),
  div({ class: "filters" },
    div({ class: "ui-toolbar ui-toolbar--filters dev-toolbar" },
      FILTERS.map(f => a({
        class: active === f.key ? "filter-btn active" : "filter-btn",
        href: f.href
      }, i18n[f.i18n] || f.fallback))
    )
  )
]

const groupLabel = (key) => {
  const f = FILTERS.find(x => x.key === key)
  return f ? (i18n[f.i18n] || f.fallback) : String(key || "")
}

const renderPathRow = (parents, currentIsFile, group) => (group
  ? div({ class: "dev-breadcrumb" },
      a({ href: "/dev" }, i18n.devRoot || "root"),
      span({ class: "dev-breadcrumb-sep" }, " / "),
      span({ class: "dev-breadcrumb-current" }, groupLabel(group)))
  : renderBreadcrumb(parents, currentIsFile))

const renderStats = (stats) => {
  const bit = (labelKey, fallback, value) => [
    span({ class: "dev-label" }, `${i18n[labelKey] || fallback}: `),
    span(String(value))
  ]
  return div({ class: "dev-stats" },
    p(
      ...bit("devVersion", "Version", stats.version || "-"), span({ class: "dev-sep" }, " · "),
      ...bit("devNodeVersion", "Node", stats.node || "-"), span({ class: "dev-sep" }, " · "),
      ...bit("devStatsFiles", "Files", fmtCount(stats.files)), span({ class: "dev-sep" }, " · "),
      ...bit("devStatsLines", "Lines", fmtCount(stats.lines)), span({ class: "dev-sep" }, " · "),
      ...bit("devStatsModules", "Modules", fmtCount(stats.modules)), span({ class: "dev-sep" }, " · "),
      ...bit("devStatsLanguages", "Languages", fmtCount(stats.languages)), span({ class: "dev-sep" }, " · "),
      ...bit("devStatsTests", "Test suites", fmtCount(stats.testMods))
    )
  )
}

const renderBreadcrumb = (parents, currentIsFile) => div({ class: "dev-breadcrumb" },
  a({ href: "/dev" }, i18n.devRoot || "root"),
  (parents || []).map((seg, idx) => [
    span({ class: "dev-breadcrumb-sep" }, " / "),
    (currentIsFile && idx === parents.length - 1)
      ? span({ class: "dev-breadcrumb-current" }, safeText(seg.name))
      : a({ href: dirHref(seg.path) }, safeText(seg.name))
  ])
)

const renderSearchForm = (query, ext) => div({ class: "dev-search" },
  form({ method: "GET", action: "/dev/search", class: "filter-box" },
    input({ type: "text", name: "q", value: safeText(query), placeholder: i18n.devSearchPlaceholder || "Text to find in the code", minlength: "2", required: true, class: "filter-box__input" }),
    div({ class: "filter-box__controls" },
      select({ name: "ext", class: "filter-box__select" },
        option({ value: "", ...(ext ? {} : { selected: true }) }, i18n.devAnyExtension || "Any file"),
        [".js", ".json", ".css", ".md", ".sh"].map(x => option({ value: x, ...(ext === x ? { selected: true } : {}) }, x))
      ),
      button({ type: "submit", class: "filter-btn" }, i18n.devFilterSearch || "SEARCH")
    )
  )
)

const renderDesktop = (tree) => {
  const dirs = (tree && tree.dirs) || []
  const files = (tree && tree.files) || []
  const parents = (tree && tree.parents) || []
  const items = []
  if (tree.path) {
    const up = parents.length > 1 ? parents[parents.length - 2].path : ""
    items.push(a({ class: "dev-icon dev-icon-up", href: dirHref(up) },
      span({ class: "dev-icon-glyph" }, ICONS.parent),
      span({ class: "dev-icon-name" }, ".."),
      span({ class: "dev-icon-meta" }, i18n.devParentFolder || "Parent folder")
    ))
  }
  for (const d of dirs) {
    items.push(a({ class: "dev-icon", href: dirHref(d.path) },
      span({ class: "dev-icon-glyph" }, ICONS.folder),
      span({ class: "dev-icon-name" }, safeText(d.name)),
      span({ class: "dev-icon-meta" }, i18n.devOpenFolder || "open")
    ))
  }
  for (const f of files) {
    const glyph = span({ class: "dev-icon-glyph" }, iconFor(f))
    const name = span({ class: "dev-icon-name" }, safeText(f.name))
    const meta = span({ class: "dev-icon-meta" }, f.viewable ? fmtSize(f.size) : (i18n.devNotViewable || "not viewable"))
    items.push(f.viewable
      ? a({ class: "dev-icon", href: fileHref(f.path) }, glyph, name, meta)
      : div({ class: "dev-icon dev-icon-off" }, glyph, name, meta))
  }
  if (!items.length) return p({ class: "dev-hint" }, i18n.devEmptyFolder || "This folder is empty.")
  return div({ class: "dev-desktop" }, ...items)
}

const renderPager = (file) => div({ class: "dev-pager" },
  file.hasPrev
    ? a({ class: "filter-btn", href: fileHref(file.path, Math.max(1, file.from - file.pageLines)) }, i18n.devPrevPage || "Previous lines")
    : null,
  file.hasNext
    ? a({ class: "filter-btn", href: fileHref(file.path, file.to + 1) }, i18n.devNextPage || "Next lines")
    : null
)

exports.devTreeView = async (tree, stats, active) => {
  return template(
    i18n.devTitle || "Developer",
    section(
      ...renderHeader(active || (tree.group ? tree.group : "tree")),
      renderStats(stats),
      renderSearchForm("", ""),
      renderPathRow(tree.parents, false, tree.group),
      renderDesktop(tree)
    )
  )
}

exports.devFileView = async (file) => {
  const reportTitle = `${file.path}:${file.from}`
  const reportDescription = `${i18n.devReportContext || "Found while reading the Oasis source code"}: /${file.path} (${i18n.devLine || "line"} ${file.from})`
  const taskTitle = `${i18n.devTaskPrefix || "Review"} ${file.path}`
  return template(
    i18n.devTitle || "Developer",
    section(
      ...renderHeader("tree"),
      renderPathRow(file.parents, true, null),
      div({ class: "dev-file-head" },
        span({ class: "dev-icon-glyph dev-file-glyph" }, iconFor({ ext: `.${String(file.name).split('.').pop()}`, viewable: true })),
        h2({ class: "dev-file-name" }, safeText(file.name))
      ),
      div({ class: "dev-file-meta" },
        p(
          span({ class: "dev-label" }, `${i18n.devStatsLines || "Lines"}: `), fmtCount(file.totalLines),
          span({ class: "dev-sep" }, " · "),
          span({ class: "dev-label" }, `${i18n.devSize || "Size"}: `), fmtSize(file.size),
          span({ class: "dev-sep" }, " · "),
          span({ class: "dev-label" }, `${i18n.devShowing || "Showing"}: `), `${fmtCount(file.from)}-${fmtCount(file.to)}`
        )
      ),
      div({ class: "dev-actions" },
        form({ method: "GET", action: "/reports" },
          input({ type: "hidden", name: "filter", value: "create" }),
          input({ type: "hidden", name: "category", value: "BUGS" }),
          input({ type: "hidden", name: "title", value: reportTitle }),
          input({ type: "hidden", name: "description", value: reportDescription }),
          button({ type: "submit", class: "filter-btn" }, i18n.devReportBug || "Report Bug")
        ),
        form({ method: "GET", action: "/tasks" },
          input({ type: "hidden", name: "filter", value: "create" }),
          input({ type: "hidden", name: "title", value: taskTitle }),
          input({ type: "hidden", name: "description", value: reportDescription }),
          button({ type: "submit", class: "filter-btn" }, i18n.devCreateTask || "Create Task")
        ),
        form({ method: "GET", action: "/dev/raw" },
          input({ type: "hidden", name: "path", value: file.path }),
          button({ type: "submit", class: "filter-btn" }, i18n.devRaw || "RAW")
        )
      ),
      div({ class: "dev-code" },
        table({ class: "dev-code-table" },
          tbody(
            file.lines.map(l => tr({ id: `L${l.n}`, class: "dev-code-row" },
              td({ class: "dev-code-num" }, a({ href: `${fileHref(file.path, file.from)}#L${l.n}` }, String(l.n))),
              td({ class: "dev-code-line" }, pre(code(safeText(l.text))))
            ))
          )
        )
      ),
      renderPager(file)
    )
  )
}

exports.devSearchView = async (result, ext) => {
  const results = (result && result.results) || []
  return template(
    i18n.devTitle || "Developer",
    section(
      ...renderHeader("search"),
      renderSearchForm(result.query, ext),
      result.query
        ? p({ class: "dev-hint" }, `${fmtCount(results.length)}${result.truncated ? "+" : ""} ${i18n.devMatches || "matches"} · ${fmtCount(result.scanned)} ${i18n.devFilesScanned || "files scanned"}`)
        : null,
      results.length
        ? ul({ class: "dev-list dev-results" },
            results.map(r => li({ class: "dev-entry" },
              div({ class: "dev-result-head" },
                span({ class: "dev-icon-glyph dev-result-glyph" }, ICONS[`.${r.path.split('.').pop()}`] || "📄"),
                a({ href: `${fileHref(r.path, Math.max(1, r.line - 20))}#L${r.line}` }, `${safeText(r.path)}:${r.line}`)
              ),
              div({ class: "dev-result-text" }, pre(code(safeText(r.text))))
            ))
          )
        : (result.query ? p({ class: "dev-hint" }, i18n.devNoResults || "No matches, yet.") : null)
    )
  )
}

exports.devMapView = async (modules) => {
  return template(
    i18n.devTitle || "Developer",
    section(
      ...renderHeader("map"),
      div({ class: "dev-listing" },
        table({ class: "dev-table" },
          thead(tr(
            th(i18n.devColModule || "Module"),
            th(i18n.devColState || "State"),
            th(i18n.devColModel || "Model"),
            th(i18n.devColView || "View"),
            th(i18n.devColRoutes || "Routes"),
            th(i18n.devColTests || "Tests")
          )),
          tbody(
            (modules || []).map(m => tr(
              td(safeText(m.name)),
              td(m.enabled ? (i18n.devOn || "on") : (i18n.devOff || "off")),
              td(m.model ? a({ href: fileHref(m.model) }, safeText(m.model)) : span({ class: "dev-hint" }, "-")),
              td(m.view ? a({ href: fileHref(m.view) }, safeText(m.view)) : span({ class: "dev-hint" }, "-")),
              td(String(m.routes || 0)),
              td(m.tests ? a({ href: dirHref(m.tests) }, safeText(m.tests)) : span({ class: "dev-hint" }, "-"))
            ))
          )
        )
      )
    )
  )
}
