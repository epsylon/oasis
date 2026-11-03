"use strict";

const { div, h2, p, section, audio, source, span, a, form, input, button, br, textarea, label, img } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink, renderCardTop, renderEngagement, paged, clearnetItemHref } = require("./main_views");
const { renderScopeChip } = require("./clearnet_view");
const moment = require("../server/node_modules/moment");

const noteColourClass = (name) => {
  const m = /^([A-G])(#?)(\d)$/.exec(String(name || ''));
  return m ? ` melody-pitch-${m[1].toLowerCase()}${m[2] ? 's' : ''} melody-oct-${m[3]}` : '';
};

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
          return a({ href: `/blockexplorer/block/${encodeURIComponent(blockId)}`, class: `melody-note-chip melody-note-chip-link${noteColourClass(noteName)}`, title: titleAttr }, ...inner);
        }
        const cls = (checkAvailability && blockId && !reachable
          ? "melody-note-chip melody-note-chip-unavailable"
          : "melody-note-chip") + noteColourClass(noteName);
        return div({ class: cls, title: titleAttr }, ...inner);
      })
    )
  );
};

exports.renderCompositionSequence = renderSequenceList;

const renderTranscodeResult = ({ stegoPayload = null, composition = [], availableIds = null, notFound, empty }) => {
  const hasStego = stegoPayload && (stegoPayload.id || stegoPayload.ts || stegoPayload.msg);
  const stegoDate = hasStego && Number.isFinite(stegoPayload.ts) ? moment(stegoPayload.ts).format("YYYY/MM/DD HH:mm") : null;
  return div({ class: "transcode-result" },
    hasStego
      ? [
          div({ class: "transcode-stego-field" },
            span({ class: "card-label" }, (i18n.audioTranscodeStegoTimestamp || "Generated at") + ": "),
            span({ class: "card-value" }, stegoDate || (i18n.audioTranscodeStegoUnknown || "—"))
          ),
          div({ class: "transcode-stego-field" },
            stegoPayload.id ? userLink(stegoPayload.id) : span({ class: "card-value" }, i18n.audioTranscodeStegoUnknown || "—")
          ),
          div({ class: "transcode-stego-field transcode-stego-msg" },
            span({ class: "card-label" }, (i18n.audioTranscodeStegoMessage || "TEXT") + ":"),
            br(),
            stegoPayload.msg
              ? p({ class: "transcode-stego-text" }, stegoPayload.msg)
              : span({ class: "card-value" }, i18n.audioTranscodeStegoEmpty || "(none)")
          )
        ]
      : p({ class: "empty" }, notFound),
    Array.isArray(composition) && composition.length ? renderSequenceList(composition, availableIds) : p({ class: "empty" }, empty)
  );
};
exports.renderTranscodeResult = renderTranscodeResult;

const renderFilters = (activeFilter) => div({ class: "filters" },
  form({ method: "GET", action: "/melody", class: "ui-toolbar ui-toolbar--filters" },
    button({ type: "submit", name: "filter", value: "mine", class: activeFilter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.melodyFilterMine || "MINE"),
    button({ type: "submit", name: "filter", value: "all", class: activeFilter === "all" ? "filter-btn active" : "filter-btn" }, i18n.melodyFilterAll || "ALL")
  )
);

const renderOwnPanel = ({ feedId, total, colours = 0, sequence }) => {
  const audioHref = `/melody/audio.wav?_=${Date.now()}`;
  return div(
    div({ class: "melody-player-card" },
      div({ class: "melody-meta" },
        userLink(feedId),
        span({ class: "melody-meta-sep" }, " · "),
        span({ class: "card-label" }, `${i18n.melodyTotalBlocks || "Notes"}: `),
        span({ class: "card-value" }, String(total)),
        span({ class: "melody-meta-sep" }, " · "),
        span({ class: "card-label" }, `${i18n.melodyTotalColours}: `),
        span({ class: "card-value" }, String(colours))
      ),
      sequence && sequence.length > 0
        ? div(
            img({ src: `/melody/image.png?_=${Date.now()}`, class: "melody-image", alt: i18n.melodyImageTitle }),
            audio({ controls: true, preload: "none", class: "melody-audio" },
              source({ src: audioHref, type: "audio/wav" })
            ),
            div({ class: "melody-regen-form" },
              form({ method: "GET", action: "/melody", class: "inline-form" },
                input({ type: "hidden", name: "filter", value: "mine" }),
                input({ type: "hidden", name: "r", value: String(Date.now()) }),
                button({ type: "submit", class: "filter-btn" }, `\u266B ${String(i18n.melodyRegenerate).toUpperCase()}`)
              ),
              a({ href: "/melody/audio.wav?download=1", download: `${feedId || 'oasis'}.wav`, class: "filter-btn melody-download-btn" }, `\u2B07 ${i18n.melodyDownload}`),
              a({ href: "/melody/image.png?download=1", download: `${feedId || 'oasis'}.png`, class: "filter-btn melody-download-btn" }, `\u2B07 ${i18n.melodyDownloadImage}`)
            ),
            div({ class: "melody-upload-block" },
              h2({ class: "melody-section-title" }, i18n.melodyUploadBcsTitle || "Publish"),
              p({ class: "melody-upload-name-note" }, i18n.melodyUploadBcsNameNote + ' ', span({ class: "melody-upload-name-value" }, `BCS-${feedId || 'OASISID'}`), '.'),
              form({ method: "POST", action: "/melody/upload", class: "melody-upload-form" },
                textarea({
                  id: "melody_upload_stego",
                  name: "stegoMessage",
                  rows: "3",
                  maxlength: "280",
                  placeholder: `${i18n.melodyUploadStegoPlaceholder || "Optional."} ${i18n.melodyUploadStegoLabel || "Hidden message (steganography)"} — ${i18n.melodyUploadStegoMaxLabel || "max 280 characters"}`
                }),
                div({ class: "melody-upload-actions" },
                  button({ type: "submit", class: "filter-btn melody-upload-submit" }, i18n.melodyPublishAudio),
                  button({ type: "submit", formaction: "/melody/upload-image", class: "filter-btn melody-upload-submit" }, i18n.melodyPublishImage)
                )
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
    bcsAudios.map(item => div({ class: "melody-bcs-card" },
      renderCardTop(item.key, `/audios/${encodeURIComponent(item.key)}`, { date: item.createdAt, chips: [renderScopeChip(item, i18n, item.clearnet === true, clearnetItemHref('audios', item.title, item.key))], author: item.author, favKind: 'audios', isFavorite: item.isFavorite, torrentFrom: { blobId: item.url, name: item.title }, reportTitle: item.title }),
      item.title
        ? div({ class: "melody-bcs-head" },
            h2({ class: "melody-bcs-title" }, item.title)
          )
        : null,
      item.url
        ? div({ class: "audio-container melody-bcs-player" },
            audio({ controls: true, preload: "metadata", src: `/blob/${encodeURIComponent(item.url)}` }),
            form({ method: "GET", action: `/melody/transcode/${encodeURIComponent(item.key)}`, class: "melody-transcode-form" },
              button({ type: "submit", class: "filter-btn" }, i18n.audioTranscodeButton || "TRANSCODE")
            )
          )
        : div({ class: "melody-bcs-actions" },
            form({ method: "GET", action: `/melody/transcode/${encodeURIComponent(item.key)}`, class: "melody-transcode-form" },
              button({ type: "submit", class: "filter-btn" }, i18n.audioTranscodeButton || "TRANSCODE")
            )
          ),
      item.description ? p({ class: "melody-bcs-desc" }, item.description) : null,
      null
    ))
  );
};

exports.melodyView = ({ feedId, total, colours = 0, sequence, filter, bcsAudios }) => {
  const title = i18n.melodyTitle || "Melody";
  const description = i18n.melodyDescription || "Play the melody of your blockchain — each block becomes a note.";
  const activeFilter = filter === "all" ? "all" : "mine";
  const body = activeFilter === "all"
    ? renderBcsList(paged(bcsAudios || []))
    : renderOwnPanel({ feedId, total, colours, sequence });

  return template(
    title,
    section(
      div({ class: "tags-header module-header-line" },
        h2(title),
        p(description)
      ),
      renderFilters(activeFilter),
      body
    )
  );
};
