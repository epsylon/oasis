const { div, h2, h3, p, section, button, form, a, span, br, textarea, input, label, select, option, img, table, tr, td, audio: audioHyperaxe, video: videoHyperaxe } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink, renderStateChip, renderContentActions, renderSubscriptionBox, renderModuleStats, renderOpinionsVoting, renderEngagement, moduleIsEmpty } = require("./main_views");
const { renderCommentsSection } = require("./comments_view");
const { renderUrl } = require("../backend/renderUrl");
const { renderReachChip } = require("./clearnet_view");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");

const userId = config.keys.id;
const BASE_FILTERS = ["ALL", "MINE", "RECENT", "TOP", "VIEWERS"];
const CATEGORIES = ["NEWS", "MUSIC", "TALK", "EDUCATION", "TECH", "CULTURE", "COMMUNITY", "OASIS", "OTHER"];
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

const cap = (s) => s.charAt(0) + s.slice(1).toLowerCase();
const filterLabel = (f) => String(i18n[`podcastFilter${cap(f)}`] || f).toUpperCase();
const catLabel = (c) => String(i18n[`podcastCategory${cap(c)}`] || c).toUpperCase();
const channelHref = (ch) => `/podcasts/${encodeURIComponent(ch.id)}`;
const episodeHref = (ep) => `/podcasts/episode/${encodeURIComponent(ep.id)}`;
const fmt = (d) => moment(d).format("YYYY/MM/DD HH:mm");
const blobSrc = (m) => `/blob/${encodeURIComponent(m.blobId)}`;

const renderTags = (tags) => (Array.isArray(tags) && tags.length)
  ? div({ class: "card-tags" }, ...tags.map(t => a({ href: `/search?query=%23${encodeURIComponent(t)}`, class: "tag-link" }, `#${t}`)))
  : null;

const renderCover = (ch, cls = "podcast-cover") => {
  if (!ch.cover || !ch.cover.blobId) return null;
  if (ch.cover.kind === "video") return videoHyperaxe({ class: cls, src: blobSrc(ch.cover), controls: true, preload: "metadata", muted: true });
  return img({ class: cls, src: blobSrc(ch.cover), alt: ch.title || "" });
};

const countsLine = (ch) => div({ class: "tribe-card-members" },
  span({ class: "tribe-members-count" }, `${i18n.podcastPlaysLabel}: ${ch.playCount || 0}`)
);
const infoTable = (item) => table({ class: "tribe-info-table jobs-info-table" },
  tr(
    td({ class: "tribe-info-label" }, i18n.createdAtLabel || "Created at"),
    td({ class: "tribe-info-value", colspan: "3" }, fmt(item.createdAt))
  ),
  tr(
    td({ class: "tribe-info-value", colspan: "4" }, userLink(item.author))
  )
);

const podcastChipFor = (mode, census) => {
  if (mode === "ALL") return true;
  if (!Array.isArray(census)) return true;
  if (mode === "MINE") return census.some(c => String(c.author) === String(userId));
  if (mode === "RECENT") return census.some(c => c.lastActivityTs >= Date.now() - RECENT_MS);
  if (mode === "TOP") return census.some(c => (c.opinionCount || 0) > 0 || (c.spreadCount || 0) > 0);
  if (mode === "VIEWERS") return census.some(c => (c.playCount || 0) > 0);
  if (CATEGORIES.includes(mode)) return census.some(c => c.category === mode);
  return census.length > 0;
};
exports.podcastChipFor = podcastChipFor;

const renderChannelCard = (ch, params = {}) =>
  div({ class: "tribe-card podcast-card" },
    div({ class: "card-header activity-card-header" },
      span(),
      renderContentActions(ch.id, channelHref(ch), { author: ch.author, favKind: "podcasts", isFavorite: ch.isFavorite, reportTitle: ch.title, spread: (params.spreadMap && params.spreadMap.get(ch.id)) || null })
    ),
    div({ class: "tribe-card-body" },
      ch.cover && ch.cover.blobId ? a({ href: channelHref(ch) }, renderCover(ch, "podcast-card-cover")) : null,
      div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, a({ href: channelHref(ch) }, ch.title || "—"))),
      div({ class: "card-chips-row" }, renderStateChip("neutral", "", catLabel(ch.category))),
      countsLine(ch)
    )
  );

const chipButtons = (modes, filter, census, labelOf) =>
  modes.filter(m => m === filter || podcastChipFor(m, census)).map(m => button({ type: "submit", name: "filter", value: m, class: filter === m ? "filter-btn active" : "filter-btn" }, labelOf(m)));

const renderFilters = (filter, q, census, emptyMod) =>
  section(
    div({ class: "filters" },
      form({ method: "GET", action: "/podcasts", class: "ui-toolbar ui-toolbar--filters" },
        input({ type: "hidden", name: "q", value: q || "" }),
        ...(emptyMod ? [] : [
          ...chipButtons(BASE_FILTERS, filter, census, filterLabel),
          ...chipButtons(CATEGORIES, filter, census, catLabel)
        ]),
        button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.podcastCreate)
      )
    )
  );

const renderChannelForm = (ch) =>
  div({ class: "div-center audio-form" },
    h2(ch ? i18n.podcastUpdateSectionTitle : i18n.podcastCreateSectionTitle),
    form({ method: "POST", action: ch ? `/podcasts/update/${encodeURIComponent(ch.id)}` : "/podcasts/create", enctype: "multipart/form-data" },
      label(i18n.podcastTitleLabel), br(),
      input({ type: "text", name: "title", maxlength: "100", required: true, placeholder: i18n.podcastTitlePlaceholder, value: ch ? ch.title : "" }), br(),
      label(i18n.podcastDescriptionLabel), br(),
      textarea({ name: "description", rows: 5, maxlength: "3000", placeholder: i18n.podcastDescriptionPlaceholder }, ch ? ch.description : ""), br(),
      label(i18n.uploadMedia), br(),
      input({ type: "file", name: "cover", accept: "image/*,video/*" }), br(), br(),
      label(i18n.podcastCategoryLabel), br(),
      select({ name: "category" }, ...CATEGORIES.map(c => option({ value: c, ...((ch ? ch.category : "TALK") === c ? { selected: true } : {}) }, catLabel(c)))), br(), br(),
      label(i18n.podcastTagsLabel), br(),
      input({ type: "text", name: "tags", maxlength: "200", placeholder: i18n.podcastTagsPlaceholder, value: ch ? ch.tags.join(", ") : "" }), br(), br(),
      button({ type: "submit", class: "create-button" }, ch ? i18n.podcastUpdate : i18n.podcastCreate)
    )
  );

const renderEpisodeForm = (ch, ep) =>
  div({ class: "div-center audio-form" },
    h2(ep ? i18n.podcastEpisodeUpdateTitle : i18n.podcastEpisodeCreateTitle),
    form({ method: "POST", action: ep ? `/podcasts/episode/update/${encodeURIComponent(ep.id)}` : `/podcasts/${encodeURIComponent(ch.id)}/episodes`, enctype: "multipart/form-data" },
      label(i18n.podcastEpisodeTitleLabel), br(),
      input({ type: "text", name: "title", maxlength: "120", required: true, placeholder: i18n.podcastEpisodeTitlePlaceholder, value: ep ? ep.title : "" }), br(),
      label(i18n.podcastEpisodeDescriptionLabel), br(),
      textarea({ name: "description", rows: 6, maxlength: "5000", placeholder: i18n.podcastEpisodeDescriptionPlaceholder }, ep ? ep.description : ""), br(),
      label(i18n.uploadMedia), br(),
      input({ type: "file", name: "media", accept: "audio/*,video/*", ...(ep ? {} : { required: true }) }), br(), br(),
      label(i18n.podcastTagsLabel), br(),
      input({ type: "text", name: "tags", maxlength: "200", placeholder: i18n.podcastTagsPlaceholder, value: ep ? ep.tags.join(", ") : "" }), br(), br(),
      button({ type: "submit", class: "create-button" }, ep ? i18n.podcastUpdate : i18n.podcastEpisodePublish)
    )
  );

exports.podcastsView = async (channels, filter = "ALL", params = {}) => {
  const list = Array.isArray(channels) ? channels : [];
  const q = String(params.q || "").trim();
  const census = Array.isArray(params.censusList) ? params.censusList : list;
  const f = String(filter || "ALL").toUpperCase();
  const isForm = f === "CREATE" || f === "EDIT";
  const emptyMod = !isForm && moduleIsEmpty(census, "ALL", "ALL", q);
  return template(
    i18n.podcastsTitle,
    section(
      div({ class: "tags-header module-header-line" }, h2(i18n.podcastsTitle), p(i18n.podcastsDescription), renderReachChip(!!(params.viewerPrefs && params.viewerPrefs.clearnetPodcasts), i18n, `/c/inhabitant/${encodeURIComponent(userId)}`)),
      renderFilters(isForm ? "ALL" : f, q, isForm ? [] : census, emptyMod)
    ),
    section(
      isForm
        ? renderChannelForm(f === "EDIT" ? params.channel : null)
        : [
            emptyMod ? null : div({ class: "filters activity-filter-chips activity-toolbar-row" },
              renderModuleStats(list.length, [
                { label: i18n.podcastEpisodesLabel, count: list.reduce((s, c) => s + (c.episodeCount || 0), 0) },
                { label: i18n.podcastPlaysLabel, count: list.reduce((s, c) => s + (c.playCount || 0), 0) }
              ]),
              form({ method: "GET", action: "/podcasts", class: "filter-box" },
                input({ type: "hidden", name: "filter", value: f }),
                input({ type: "text", name: "q", value: q, placeholder: i18n.podcastSearchPlaceholder, class: "filter-box__input" }),
                div({ class: "filter-box__controls" }, button({ type: "submit", class: "filter-box__button" }, i18n.searchButton))
              )
            ),
            div({ class: "tribe-grid" }, list.length ? list.map(c => renderChannelCard(c, params)) : p(i18n.podcastNoItems))
          ]
    )
  );
};

const episodeChips = (ep) =>
  div({ class: "card-chips-row" },
    renderStateChip("neutral", "", `${i18n.podcastPlaysLabel}: ${ep.playCount || 0}`),
    ep.opinionCount > 0 ? renderStateChip("mutuals", "ꔍ", String(ep.opinionCount)) : null
  );

const episodeRow = (ch, ep) =>
  div({ class: "podcast-episode-row" },
    span({ class: "podcast-episode-number" }, `#${ep.number}`),
    div({ class: "podcast-episode-main" },
      div({ class: "emergency-update-head podcast-episode-head" },
        a({ href: episodeHref(ep), class: "podcast-episode-title" }, ep.title),
        episodeChips(ep)
      ),
      ep.description ? p({ class: "tribe-side-description" }, ...renderUrl(ep.description)) : null,
      p({ class: "card-footer" }, span({ class: "date-link" }, fmt(ep.createdAt)))
    )
  );

exports.singleChannelView = async (ch, params = {}) => {
  const isAuthor = String(ch.author) === String(userId);
  const href = channelHref(ch);
  const census = Array.isArray(params.censusList) ? params.censusList : [];
  const mode = String(params.mode || "").toUpperCase();
  const ownerActions = isAuthor
    ? [
        form({ method: "GET", action: "/podcasts" }, input({ type: "hidden", name: "filter", value: "edit" }), input({ type: "hidden", name: "id", value: ch.id }), button({ type: "submit", class: "update-btn" }, i18n.podcastUpdate)),
        form({ method: "POST", action: `/podcasts/delete/${encodeURIComponent(ch.id)}` }, button({ type: "submit", class: "delete-btn" }, i18n.podcastDelete))
      ]
    : [];
  const allEpisodes = Array.isArray(ch.episodes) ? ch.episodes.slice().reverse() : [];
  const episodeFilter = String(params.episodes || "").toUpperCase() === "VIEWERS" && allEpisodes.some(e => (e.playCount || 0) > 0) ? "VIEWERS" : "RECENT";
  const episodes = episodeFilter === "VIEWERS" ? allEpisodes.slice().sort((x, y) => (y.playCount || 0) - (x.playCount || 0) || y.publishedTs - x.publishedTs) : allEpisodes;
  const episodeModes = ["RECENT", ...(allEpisodes.some(e => (e.playCount || 0) > 0) ? ["VIEWERS"] : [])];
  const episodeChipsRow = allEpisodes.length
    ? div({ class: "activity-sub-filter" },
        ...episodeModes.map(m => form({ class: "sub-filter-form", method: "GET", action: `${href}#episodes` },
          input({ type: "hidden", name: "episodes", value: m }),
          button({ type: "submit", class: episodeFilter === m ? "filter-btn active" : "filter-btn" }, filterLabel(m))
        ))
      )
    : null;
  const side = div({ class: "tribe-side" },
    div({ class: "card-header activity-card-header" },
      renderContentActions(ch.id, null, { author: ch.author, favKind: "podcasts", isFavorite: ch.isFavorite, reportTitle: ch.title, spread: params.spread || null })
    ),
    div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, ch.title), renderReachChip(!!(params.authorPrefs && params.authorPrefs.clearnetPodcasts), i18n, `/c/podcasts/${encodeURIComponent(ch.id)}`)),
    div({ class: "card-chips-row" }, renderStateChip("neutral", "", catLabel(ch.category))),
    ch.cover && ch.cover.blobId ? a({ href: channelHref(ch), class: "podcast-cover-link" }, renderCover(ch, "podcast-cover podcast-cover-large")) : null,
    ch.description ? p({ class: "tribe-side-description" }, ...renderUrl(ch.description)) : null,
    infoTable(ch),
    countsLine(ch),
    isAuthor
      ? div({ class: "tribe-side-actions podcast-episode-add" },
          form({ method: "GET", action: href }, input({ type: "hidden", name: "mode", value: "episode" }), button({ type: "submit", class: "tribe-action-btn" }, String(i18n.podcastEpisodeAdd).toUpperCase()))
        )
      : null,
    renderTags(ch.tags),
    ownerActions.length ? div({ class: "tribe-side-actions owner-actions" }, ...ownerActions) : null,
    params.subscription
      ? renderSubscriptionBox({ target: ch.id, scope: "podcasts", subscribed: params.subscription.subscribed, count: params.subscription.count, isOwner: isAuthor, returnTo: href, canWrite: isAuthor })
      : null
  );
  const main = div({ class: "tribe-main" },
    isAuthor && mode === "EPISODE" ? renderEpisodeForm(ch, null) : null,
    allEpisodes.length
      ? div({ class: "podcast-featured" },
          div({ class: "emergency-update-head podcast-episode-head" },
            h2({ class: "tribe-card-title" }, a({ href: episodeHref(allEpisodes[0]) }, `#${allEpisodes[0].number} · ${allEpisodes[0].title}`)),
            episodeChips(allEpisodes[0])
          ),
          renderPlayer(allEpisodes[0]),
          allEpisodes[0].description ? p({ class: "tribe-side-description" }, ...renderUrl(allEpisodes[0].description)) : null,
          p({ class: "card-footer" }, span({ class: "date-link" }, fmt(allEpisodes[0].createdAt)))
        )
      : null,
    div({ class: "card-section podcast-episodes", id: "episodes" },
      h3(`${i18n.podcastEpisodesTitle} (${episodes.length})`),
      episodeChipsRow,
      episodes.length ? div({ class: "podcast-episode-list" }, ...episodes.map(ep => episodeRow(ch, ep))) : p(i18n.podcastNoEpisodes)
    ),
    renderEngagement(ch.id,
      renderOpinionsVoting("/podcasts/opinions", ch.id, ch.opinions, href, ch.opinions_inhabitants),
      renderCommentsSection({ action: `/podcasts/${encodeURIComponent(ch.id)}/comments`, comments: params.comments || [], returnTo: href })
    )
  );
  return template(
    ch.title,
    section(div({ class: "tags-header module-header-line" }, h2(i18n.podcastsTitle), p(i18n.podcastsDescription)), renderFilters("ALL", "", census, census.length === 0)),
    section(div({ class: "tribe-details" }, side, main))
  );
};

const renderPlayer = (ep) => {
  if (!ep.media || !ep.media.blobId) return p(i18n.audioNoFile);
  if (ep.media.kind === "video") return div({ class: "podcast-player video-container video-container-row" }, videoHyperaxe({ controls: true, src: blobSrc(ep.media), preload: "metadata", class: "podcast-video" }));
  return div({ class: "podcast-player audio-container" }, audioHyperaxe({ controls: true, src: blobSrc(ep.media), preload: "metadata" }));
};

exports.singleEpisodeView = async (ep, params = {}) => {
  const ch = ep.channel || { id: ep.channelId, title: "", author: ep.author, episodes: [] };
  const isAuthor = String(ep.author) === String(userId);
  const href = episodeHref(ep);
  const census = Array.isArray(params.censusList) ? params.censusList : [];
  const played = Array.isArray(ep.listeners) && ep.listeners.includes(userId);
  const mode = String(params.mode || "").toUpperCase();
  const headActions = [
    played
      ? span({ class: "status supporting" }, `✓ ${i18n.podcastPlayed}`)
      : form({ method: "POST", action: `/podcasts/episode/${encodeURIComponent(ep.id)}/play` }, button({ type: "submit", class: "tribe-action-btn" }, String(i18n.podcastMarkPlayed).toUpperCase()))
  ].filter(Boolean);
  const ownerActions = isAuthor
    ? [
        form({ method: "GET", action: href }, input({ type: "hidden", name: "mode", value: "edit" }), button({ type: "submit", class: "update-btn" }, i18n.podcastUpdate)),
        form({ method: "POST", action: `/podcasts/episode/delete/${encodeURIComponent(ep.id)}` }, button({ type: "submit", class: "delete-btn" }, i18n.podcastDelete))
      ]
    : [];
  const side = div({ class: "tribe-side" },
    div({ class: "card-header activity-card-header" },
      renderContentActions(ep.id, null, { author: ep.author, favKind: "podcasts", isFavorite: ep.isFavorite, reportTitle: ep.title, spread: params.spread || null })
    ),
    div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, a({ href: channelHref(ch), class: "user-link" }, ch.title || i18n.podcastsTitle)), renderReachChip(!!(params.authorPrefs && params.authorPrefs.clearnetPodcasts), i18n, `/c/podcasts/${encodeURIComponent(ch.id)}`)),
    ch.cover && ch.cover.blobId ? a({ href: channelHref(ch), class: "podcast-cover-link" }, renderCover(ch, "podcast-cover podcast-cover-large")) : null,
    ep.description ? p({ class: "tribe-side-description" }, ...renderUrl(ep.description)) : null,
    infoTable(ep),
    renderTags(ep.tags),
    ownerActions.length ? div({ class: "tribe-side-actions owner-actions" }, ...ownerActions) : null
  );
  const main = div({ class: "tribe-main" },
    div({ class: "emergency-update-head podcast-episode-head" },
      div({ class: "podcast-episode-head-left" },
        h2({ class: "tribe-card-title" }, `#${ep.number} · ${ep.title}`),
        episodeChips(ep)
      ),
      headActions.length ? div({ class: "tribe-side-actions emergency-update-actions" }, ...headActions) : null
    ),
    renderPlayer(ep),
    renderEngagement(ep.id,
      renderOpinionsVoting("/podcasts/opinions", ep.id, ep.opinions, href, ep.opinions_inhabitants),
      renderCommentsSection({ action: `/podcasts/episode/${encodeURIComponent(ep.id)}/comments`, comments: params.comments || [], returnTo: href })
    ),
    isAuthor && mode === "EDIT" ? renderEpisodeForm(ch, ep) : null
  );
  return template(
    ep.title,
    section(div({ class: "tags-header module-header-line" }, h2(i18n.podcastsTitle), p(i18n.podcastsDescription)), renderFilters("ALL", "", census, census.length === 0)),
    section(div({ class: "tribe-details" }, side, main))
  );
};
