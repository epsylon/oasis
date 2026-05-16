"use strict";

const { div, h2, p, section, audio, source, span, a, form, input, button, br } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink } = require("./main_views");

const renderSequenceList = (sequence) => {
  if (!sequence || sequence.length === 0) {
    return p({ class: "empty" }, i18n.melodyEmpty || "No notes yet — your blockchain has not produced any block.");
  }
  return div({ class: "melody-composition" },
    h2({ class: "melody-section-title" }, i18n.melodyCompositionTitle || "Composition"),
    div({ class: "melody-notes-grid" },
      sequence.slice(0, 256).map(n => div({ class: "melody-note-chip", title: `${n.type} · ${n.name} · ${n.durMs}ms` },
        span({ class: "melody-note-name" }, n.name),
        span({ class: "melody-note-type" }, n.type)
      ))
    )
  );
};

const renderFilters = () => div({ class: "filters" },
  form({ method: "GET", action: "/melody", class: "ui-toolbar ui-toolbar--filters" },
    button({ type: "submit", name: "filter", value: "all", class: "filter-btn active" }, i18n.melodyFilterAll || "ALL")
  )
);

exports.melodyView = ({ feedId, total, sequence }) => {
  const title = i18n.melodyTitle || "Melody";
  const description = i18n.melodyDescription || "Play the melody of your blockchain.";
  const audioHref = `/melody/audio.wav?_=${Date.now()}`;
  const body = div(
    div({ class: "melody-player-card" },
      div({ class: "melody-meta" },
        span({ class: "card-label" }, `${i18n.melodyInhabitantLabel || "Inhabitant"}: `),
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
                input({ type: "hidden", name: "r", value: String(Date.now()) }),
                button({ type: "submit", class: "filter-btn" }, i18n.melodyRegenerate || "Regenerate")
              ),
              a({ href: "/melody/audio.wav?download=1", download: "oasis-melody.wav", class: "filter-btn melody-download-btn" }, i18n.melodyDownload || "Download Melody")
            )
          )
        : p({ class: "empty" }, i18n.melodyEmpty || "No notes yet")
    ),
    renderSequenceList(sequence)
  );
  return template(
    title,
    section(
      div({ class: "tags-header" },
        h2(title),
        p(description)
      ),
      renderFilters(),
      body
    )
  );
};
