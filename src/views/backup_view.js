const { div, h2, h3, p, section, button, form, a, span, br, hr, input, label, select, option, pre, img, ul, li, strong, progress } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require("./main_views");
const moment = require("../server/node_modules/moment");
const crypto = require("crypto");

const generateRandomPassword = (length = 32) => crypto.randomBytes(length).toString("hex").slice(0, length);
const fmt = (d) => moment(d).format("YYYY/MM/DD HH:mm");
const humanBytes = (n) => {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const BACKUP_TYPES = ["RECOVERY", "KEYS", "FULL", "RESTORE"];
const typeLabel = (t) => String(i18n[`backupType${t.charAt(0) + t.slice(1).toLowerCase()}`] || t).toUpperCase();
const normalizeType = (t) => (BACKUP_TYPES.includes(String(t || "").toUpperCase()) ? String(t).toUpperCase() : "RECOVERY");

const renderTypeFilters = (type) =>
  div({ class: "filters" },
    form({ method: "GET", action: "/backup", class: "ui-toolbar ui-toolbar--filters" },
      ...BACKUP_TYPES.map(t => button({ type: "submit", name: "type", value: t, class: type === t ? "filter-btn active" : "filter-btn" }, typeLabel(t)))
    )
  );

const renderRandomPassword = () => p({ id: "randomPassword" }, h2({ class: "generated-password" }, generateRandomPassword()));

const renderRecovery = (kit) => kit
  ? div({ class: "backup-kit" },
      p({ class: "backup-warning backup-kit-warning" }, `⚠ ${i18n.backupKitWarning}`),
      p({ class: "backup-kit-line" }, strong(`${i18n.backupKitId}: `), span({ class: "backup-kit-id" }, kit.id || "—")),
      p({ class: "backup-kit-line" }, strong(`${i18n.backupKitDate}: `), fmt(kit.createdAt)),
      div({ class: "backup-kit-qr" }, img({ src: "/backup/recovery-kit/qr.png", alt: i18n.backupKitQrAlt, class: "backup-kit-qr-img" })),
      pre({ class: "backup-kit-secret" }, kit.secret),
      ul({ class: "backup-kit-steps" },
        li(i18n.backupKitStep1),
        li(i18n.backupKitStep2),
        li(i18n.backupKitStep3)
      ),
      div({ class: "doc-export-actions doc-export-left" },
        form({ method: "GET", action: "/backup/recovery-kit/pdf" }, button({ type: "submit", class: "filter-btn" }, i18n.backupKitPdfButton))
      )
    )
  : p({ class: "backup-warning" }, i18n.backupKitPageDescription);

const renderKeysExport = () =>
  div({ class: "backup-section" },
    renderRandomPassword(),
    p(i18n.exportDescription),
    form({ action: "/backup/keys/export", method: "POST", id: "exportForm" },
      label(i18n.exportPasswordLabel), br(),
      input({ type: "password", name: "password", id: "password", required: true, placeholder: i18n.exportPasswordPlaceholder, minlength: 32 }), br(),
      p({ class: "file-info" }, i18n.fileInfo),
      button({ type: "submit" }, i18n.backupKeysExportButton)
    )
  );

const renderFullBackup = (options) => {
  const opt = options || {};
  const sinceValue = opt.sinceTs ? moment(opt.sinceTs).format("YYYY-MM-DD") : "";
  return div({ class: "backup-section" },
    renderRandomPassword(),
    form({ method: "POST", action: "/backup/export" },
      label(i18n.backupScopeLabel), br(),
      select({ name: "scope" },
        option({ value: "all", ...(opt.scope !== "mine" ? { selected: true } : {}) }, i18n.backupScopeAll),
        option({ value: "mine", ...(opt.scope === "mine" ? { selected: true } : {}) }, i18n.backupScopeMine)
      ), br(), br(),
      label(i18n.backupSinceLabel), br(),
      input({ type: "date", name: "since", value: sinceValue }), br(), br(),
      label(i18n.exportPasswordLabel), br(),
      input({ type: "password", name: "password", required: true, placeholder: i18n.exportPasswordPlaceholder, minlength: 32 }), br(),
      p({ class: "file-info" }, i18n.backupFileInfo),
      button({ type: "submit" }, i18n.backupExportButton)
    )
  );
};

const restoreSummary = (r) =>
  `${i18n.backupRestoredMessages}: ${r.messages} · ${i18n.backupRestoredSkipped}: ${r.skipped} · ${i18n.backupRestoredBlobs}: ${r.blobs}${r.forked ? ` · ${i18n.backupRestoredForked}: ${r.forked}` : ""}${r.failed ? ` · ${i18n.backupRestoredFailed}: ${r.failed}` : ""}`;

const renderRestoreStatus = (job) => {
  if (!job) return null;
  if (job.running) {
    const elapsed = Math.max(0, Math.round((Date.now() - Date.parse(job.startedAt)) / 1000));
    const pct = Math.max(0, Math.min(100, Number((job.progress || {}).percent) || 0));
    return div({ class: "backup-restored" },
      p({ class: "backup-warning" }, `⏳ ${i18n.backupRestoreRunning}`),
      div({ class: "indexing-progress-block" },
        progress({ value: String(pct), max: "100", class: "indexing-progress" }),
        p({ class: "indexing-percent" }, strong(`${pct.toFixed(1)} %`))
      ),
      p(`${restoreSummary(job.progress || {})} · ${i18n.backupRestoreElapsed}: ${elapsed}s`)
    );
  }
  if (job.error) return div({ class: "backup-restored" }, p({ class: "backup-warning" }, `✗ ${i18n.backupRestoreFailedLine} ${job.error}`));
  const r = job.result || {};
  const mine = (r.forks || []).some(f => f.mine);
  return div({ class: "backup-restored" },
    p(`✓ ${i18n.backupRestoredLine} ${restoreSummary(r)}`),
    mine ? p({ class: "backup-warning" }, `⚠ ${i18n.backupRestoreForkMine}`) : null
  );
};

const renderRestore = (job) =>
  div({ class: "backup-section" },
    renderRestoreStatus(job),
    job && job.running ? null : form({ method: "POST", action: "/backup/import", enctype: "multipart/form-data" },
      input({ type: "file", name: "uploadedFile", required: true, accept: ".oasisbk" }), br(), br(),
      p(i18n.backupRestorePassword),
      input({ type: "password", name: "importPassword", required: true, placeholder: i18n.importPasswordPlaceholder, minlength: 32 }), br(),
      button({ type: "submit" }, i18n.backupRestoreButton)
    ),
    br(),
    p(i18n.importDescription),
    form({ action: "/backup/keys/import", method: "POST", enctype: "multipart/form-data" },
      input({ type: "file", name: "uploadedFile", required: true }), br(), br(),
      p(i18n.passwordImport),
      input({ type: "password", name: "importPassword", required: true, placeholder: i18n.importPasswordPlaceholder, minlength: 32 }), br(),
      button({ type: "submit" }, i18n.backupKeysImportButton)
    )
  );

exports.backupView = async ({ type = "RECOVERY", options = null, restoreJob = null, kit = null } = {}) => {
  const t = normalizeType(type);
  const body = t === "RECOVERY" ? renderRecovery(kit)
    : t === "KEYS" ? renderKeysExport()
    : t === "FULL" ? renderFullBackup(options)
    : renderRestore(restoreJob);
  const html = template(
    i18n.backupTitle,
    section(
      div({ class: "tags-header module-header-line" }, h2(i18n.backupTitle), p(i18n.backupDescription)),
      renderTypeFilters(t)
    ),
    section(
      div({ class: "div-center backup-wrap" }, body)
    )
  );
  return restoreJob && restoreJob.running ? html.replace('</head>', '<meta http-equiv="refresh" content="5"></head>') : html;
};

exports.recoveryKitView = async (kit) => exports.backupView({ type: "RECOVERY", kit });

exports.renderVerificationReport = (report) => {
  if (!report) return null;
  const feed = report.feed || {};
  const blobs = report.blobs || {};
  const line = (ok, text) => li({ class: ok ? "backup-check-ok" : "backup-check-bad" }, `${ok ? "✓" : "✗"} ${text}`);
  return div({ class: "backup-verification" },
    p({ class: "backup-hint" }, `${fmt(report.checkedAt)} · ${report.tookMs} ms · ${i18n.verificationTotalMessages}: ${report.totalMessages}`),
    ul(
      line(feed.ok, `${i18n.verificationFeed}: ${feed.messages} ${i18n.verificationMessages}, ${i18n.verificationLastSequence} ${feed.lastSequence}`),
      feed.gaps && feed.gaps.length ? li({ class: "backup-check-bad" }, `✗ ${i18n.verificationGaps}: ${feed.gaps.map(g => `${g.expected}→${g.found}`).join(", ")}`) : null,
      feed.brokenLinks && feed.brokenLinks.length ? li({ class: "backup-check-bad" }, `✗ ${i18n.verificationBrokenLinks}: ${feed.brokenLinks.join(", ")}`) : null,
      feed.badHashes && feed.badHashes.length ? li({ class: "backup-check-bad" }, `✗ ${i18n.verificationBadHashes}: ${feed.badHashes.join(", ")}`) : null,
      feed.badSignatures && feed.badSignatures.length ? li({ class: "backup-check-bad" }, `✗ ${i18n.verificationBadSignatures}: ${feed.badSignatures.join(", ")}`) : null,
      feed.duplicates && feed.duplicates.length ? li({ class: "backup-check-bad" }, `✗ ${i18n.verificationDuplicates}: ${feed.duplicates.join(", ")}`) : null,
      line(!report.forkCount, `${i18n.verificationForks}: ${report.forkCount}`),
      ...(report.forks || []).map(f => li({ class: "backup-check-bad backup-fork" }, `${f.mine ? "⚠ " : ""}${f.author} · ${f.points.map(pt => `#${pt.sequence} (${pt.keys.length})`).join(", ")}`)),
      blobs.listed
        ? line(!blobs.missing, `${i18n.verificationBlobs}: ${blobs.present} ${i18n.verificationBlobsPresent}, ${blobs.referenced} ${i18n.verificationBlobsReferenced}, ${blobs.orphan} ${i18n.verificationBlobsOrphan} (${humanBytes(blobs.orphanBytes)}), ${blobs.missing} ${i18n.verificationBlobsMissing}`)
        : li(`· ${i18n.verificationBlobsUnavailable}`)
    )
  );
};
