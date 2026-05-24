"use strict";

const { div, h2, p, section, audio, source, span, a, form, input, button, br, textarea, label } = require("../server/node_modules/hyperaxe");
const moment = require("../server/node_modules/moment");
const { template, i18n, userLink, renderEcoTax } = require("./main_views");

const renderSequenceList = (sequence, availableIds = null) => {
  if (!sequence || sequence.length === 0) {
    return p({ class: "empty" }, i18n.melodyEmpty || "No notes yet — your blockchain has not produced any block.");
  }
  const checkAvailability = availableIds && typeof availableIds.has === 'function';
  return div({ class: "melody-composition" },
    h2({ class: "melody-section-title" }, i18n.melodyCompositionTitle || "Blockchain Composition Map"),
    div({ class: "melody-notes-grid" },
      sequence.slice(0, 256).map(n => {
        const noteName = n.name || n.n;
        const noteType = n.type || n.t;
        const noteDur = n.durMs || n.d || 0;
        const blockId = typeof n.id === 'string' ? n.id : null;
        const reachable = blockId && (!checkAvailability || availableIds.has(blockId));
        const unavailableNote = checkAvailability && blockId && !reachable
          ? ' · ' + (i18n.melodyNoteUnavailable || 'block not in your local feed')
          : '';
        const titleAttr = `${noteType} · ${noteName} · ${noteDur}ms` + (blockId ? ` · ${blockId}` : '') + unavailableNote;
        const inner = [
          span({ class: "melody-note-name" }, noteName),
          span({ class: "melody-note-type" }, noteType)
        ];
        if (reachable) {
          return a({ href: `/blockexplorer/block/${encodeURIComponent(blockId)}`, class: "melody-note-chip melody-note-chip-link", title: titleAttr }, ...inner);
        }
        const cls = checkAvailability && blockId && !reachable
          ? "melody-note-chip melody-note-chip-unavailable"
          : "melody-note-chip";
        return div({ class: cls, title: titleAttr }, ...inner);
      })
    )
  );
};

exports.renderCompositionSequence = renderSequenceList;

const renderFilters = (activeFilter) => div({ class: "filters" },
  form({ method: "GET", action: "/melody", class: "ui-toolbar ui-toolbar--filters" },
    button({ type: "submit", name: "filter", value: "mine", class: activeFilter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.melodyFilterMine || "MINE"),
    button({ type: "submit", name: "filter", value: "all", class: activeFilter === "all" ? "filter-btn active" : "filter-btn" }, i18n.melodyFilterAll || "ALL")
  )
);

const renderOwnPanel = ({ feedId, total, sequence }) => {
  const audioHref = `/melody/audio.wav?_=${Date.now()}`;
  return div(
    div({ class: "melody-player-card" },
      div({ class: "melody-meta" },
        userLink(feedId),
        span({ class: "melody-meta-sep" }, " · "),
        span({ class: "card-label" }, `${i18n.melodyTotalBlocks || "Notes"}: `),
        span({ class: "card-value" }, String(total))
      ),
      sequence && sequence.length > 0
        ? div(
            audio({ controls: true, preload: "none", class: "melody-audio" },
              source({ src: audioHref, type: "audio/wav" })
            ),
            div({ class: "melody-regen-form" },
              form({ method: "GET", action: "/melody", class: "inline-form" },
                input({ type: "hidden", name: "filter", value: "mine" }),
                input({ type: "hidden", name: "r", value: String(Date.now()) }),
                button({ type: "submit", class: "filter-btn" }, i18n.melodyRegenerate || "Regenerate")
              ),
              a({ href: "/melody/audio.wav?download=1", download: `${feedId || 'oasis'}.wav`, class: "filter-btn melody-download-btn" }, i18n.melodyDownload || "Download Melody")
            ),
            div({ class: "melody-upload-block" },
              h2({ class: "melody-section-title" }, i18n.melodyUploadBcsTitle || "Publish"),
              p({ class: "melody-upload-name-note" }, (i18n.melodyUploadBcsNameNote || "The audio will be published with the auto-generated name") + ' ', span({ class: "melody-upload-name-value" }, `BCS-${feedId || 'OASISID'}`), '.'),
              form({ method: "POST", action: "/melody/upload", class: "melody-upload-form" },
                textarea({
                  id: "melody_upload_stego",
                  name: "stegoMessage",
                  rows: "3",
                  maxlength: "280",
                  placeholder: `${i18n.melodyUploadStegoPlaceholder || "Optional."} ${i18n.melodyUploadStegoLabel || "Hidden message (steganography)"} — ${i18n.melodyUploadStegoMaxLabel || "max 280 characters"}`
                }),
                br(),
                button({ type: "submit", class: "filter-btn melody-upload-submit" }, i18n.melodyUploadBcsButton || "Publish")
              )
            )
          )
        : p({ class: "empty" }, i18n.melodyEmpty || "No notes yet")
    ),
    renderSequenceList(sequence)
  );
};

const renderBcsList = (bcsAudios) => {
  if (!bcsAudios || bcsAudios.length === 0) {
    return p({ class: "empty" }, i18n.melodyAllEmpty || "No BCS compositions from other inhabitants yet.");
  }
  return div({ class: "melody-bcs-list" },
    bcsAudios.map(a => div({ class: "melody-bcs-card" },
      div({ class: "melody-bcs-head" },
        a.title ? h2({ class: "melody-bcs-title" }, a.title) : null,
        div({ class: "melody-bcs-meta" },
          span({ class: "card-label" }, `${i18n.melodyByLabel || "By"}: `),
          userLink(a.author),
          span({ class: "melody-meta-sep" }, " · "),
          span({ class: "card-value" }, moment(a.createdAt).format("YYYY/MM/DD HH:mm:ss"))
        )
      ),
      a.url
        ? div({ class: "audio-container melody-bcs-player" },
            audio({ controls: true, preload: "metadata", src: `/blob/${encodeURIComponent(a.url)}` })
          )
        : null,
      a.description ? p({ class: "melody-bcs-desc" }, a.description) : null,
      div({ class: "melody-bcs-actions" },
        form({ method: "GET", action: `/melody/transcode/${encodeURIComponent(a.key)}` },
          button({ type: "submit", class: "filter-btn" }, i18n.audioTranscodeButton || "TRANSCODE")
        )
      )
    ))
  );
};

exports.melodyView = ({ feedId, total, sequence, filter, bcsAudios }) => {
  const title = i18n.melodyTitle || "Melody";
  const description = i18n.melodyDescription || "Play the melody of your blockchain — each block becomes a note.";
  const activeFilter = filter === "all" ? "all" : "mine";
  const body = activeFilter === "all"
    ? renderBcsList(bcsAudios)
    : renderOwnPanel({ feedId, total, sequence });

  return template(
    title,
    section(
      div({ class: "tags-header" },
        h2(title),
        p(description)
      ),
      renderFilters(activeFilter),
      body
    )
  );
};
