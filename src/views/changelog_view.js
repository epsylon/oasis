const { div, h2, h3, p, section, ul, li } = require("../server/node_modules/hyperaxe");
const { template, i18n, renderCountChip } = require("./main_views");

const renderEntry = (entry, current) => div({ class: current ? "changelog-card changelog-current" : "changelog-card" },
  (current ? h2 : h3)({ class: "changelog-version" }, `🌴 OASIS ${entry.version}`),
  div({ class: "changelog-date" }, renderCountChip("◷", null, entry.date)),
  ul({ class: "changelog-changes" }, ...entry.changes.map((c) => li(c)))
);

exports.changelogView = (entries = []) => {
  const [latest, ...older] = entries;
  return template(
    i18n.changelogTitle,
    section(div({ class: "tags-header module-header-line" }, h2(i18n.changelogTitle), p(i18n.changelogDescription))),
    section({ class: "changelog" },
      latest ? renderEntry(latest, true) : p({ class: "no-content" }, i18n.changelogEmpty),
      older.length ? div({ class: "changelog-grid" }, ...older.map((e) => renderEntry(e, false))) : null
    )
  );
};
