const { a, div, h2, p, section, ul, li } = require("../server/node_modules/hyperaxe");
const { template, i18n, renderCountChip } = require("./main_views");

const versionHref = (entry) => `/changelog/${encodeURIComponent(entry.version)}`;

const renderEntry = (entry, own = true) => div({ class: own ? "changelog-card changelog-current own-content" : "changelog-card changelog-current changelog-older" },
  h2({ class: "changelog-version" }, `🌴 OASIS ${entry.version}`),
  div({ class: "changelog-date" }, renderCountChip("◷", null, entry.date)),
  ul({ class: "changelog-changes" }, ...entry.changes.map((c) => li(c)))
);

const renderLinked = (entry, own) => a({ href: versionHref(entry), class: "changelog-current-link" }, renderEntry(entry, own));

const header = () => section(div({ class: "tags-header module-header-line" }, h2(i18n.changelogTitle), p(i18n.changelogDescription)));

exports.changelogView = (entries = []) => {
  const [latest, ...older] = entries;
  return template(
    i18n.changelogTitle,
    header(),
    section({ class: "changelog" },
      latest ? renderLinked(latest, true) : p({ class: "no-content" }, i18n.changelogEmpty),
      ...older.map((entry) => renderLinked(entry, false))
    )
  );
};

exports.changelogEntryView = (entry) => template(
  `${i18n.changelogTitle} · ${entry.version}`,
  header(),
  section({ class: "changelog" }, renderEntry(entry))
);
