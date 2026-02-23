const { div, h2, p, section, button, form, a, input, img, label, select, option, br, textarea, h1, span, nav, ul, li, video, audio, table, tr, td } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const { config } = require('../server/SSB_server.js');
const { renderUrl } = require('../backend/renderUrl');
const opinion_categories = require('../backend/opinion_categories.js');

const userId = config.keys.id;

const DEFAULT_HASH_ENC = "%260000000000000000000000000000000000000000000%3D.sha256";
const DEFAULT_HASH_PATH_RE = /\/image\/\d+\/%260000000000000000000000000000000000000000000%3D\.sha256$/;
const isDefaultImageId = (v) => {
  if (!v) return true;
  if (typeof v === 'string') {
    if (v === DEFAULT_HASH_ENC) return true;
    if (DEFAULT_HASH_PATH_RE.test(v)) return true;
  }
  return false;
};
const resolvePhoto = (photoField) => {
  if (!photoField) return '/assets/images/default-avatar.png';
  if (typeof photoField === 'string') {
    if (photoField.startsWith('/assets/')) return photoField;
    if (photoField.startsWith('/blob/')) return photoField;
    if (photoField.startsWith('/image/')) {
      if (isDefaultImageId(photoField)) return '/assets/images/default-avatar.png';
      return photoField;
    }
  }
  return '/assets/images/default-avatar.png';
};

const MS_PER_DAY = 86400000;
const FEED_ITEMS_PER_PAGE = 5;
const MAX_MESSAGE_LENGTH = 280;

const renderMediaBlob = (value, fallbackSrc = null, attrs = {}) => {
  if (!value) return fallbackSrc ? img({ src: fallbackSrc, ...attrs }) : null
  const s = String(value).trim()
  if (!s) return fallbackSrc ? img({ src: fallbackSrc, ...attrs }) : null
  if (s.startsWith('&')) return img({ src: `/blob/${encodeURIComponent(s)}`, ...attrs })
  const mVideo = s.match(/\[video:[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mVideo) return video({ controls: true, class: attrs.class || 'post-video', src: `/blob/${encodeURIComponent(mVideo[1])}` })
  const mAudio = s.match(/\[audio:[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mAudio) return audio({ controls: true, class: attrs.class || 'post-audio', src: `/blob/${encodeURIComponent(mAudio[1])}` })
  const mImg = s.match(/!\[[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mImg) return img({ src: `/blob/${encodeURIComponent(mImg[1])}`, ...attrs })
  return fallbackSrc ? img({ src: fallbackSrc, ...attrs }) : null
}

const toBlobUrl = (raw) => {
  if (!raw) return null
  const s = String(raw).trim()
  if (s.startsWith('&')) return `/blob/${encodeURIComponent(s)}`
  const m = s.match(/\((&[^)\s]+\.sha256)\s*\)/)
  return m ? `/blob/${encodeURIComponent(m[1])}` : null
}

const filterAndSortFeed = (feed, feedFilter) => {
  const parseDate = (d) => typeof d === 'string' ? Date.parse(d) : d;
  if (feedFilter === 'MINE') return feed.filter(m => m.author === userId);
  if (feedFilter === 'RECENT') {
    const last24h = Date.now() - MS_PER_DAY;
    return [...feed].filter(m => parseDate(m.createdAt) >= last24h).sort((a, b) => parseDate(b.createdAt) - parseDate(a.createdAt));
  }
  if (feedFilter === 'ALL') return [...feed].sort((a, b) => parseDate(b.createdAt) - parseDate(a.createdAt));
  if (feedFilter === 'TOP') return [...feed].sort((a, b) => (b.refeeds || 0) - (a.refeeds || 0));
  return feed;
};

const renderGallery = (sortedTribes) => {
  return div({ class: "gallery" },
    sortedTribes.length
      ? sortedTribes.map(t =>
          a({ href: `#tribe-${encodeURIComponent(t.id)}`, class: "gallery-item" },
           renderMediaBlob(t.image, '/assets/images/default-tribe.png', { alt: t.title || "", class: "gallery-image" })
          )
        )
      : p(i18n.noTribes)
  );
};

const renderLightbox = (sortedTribes) => {
  return sortedTribes.map(t =>
    div(
      { id: `tribe-${encodeURIComponent(t.id)}`, class: "lightbox" },
      a({ href: "#", class: "lightbox-close" }, "×"),
      renderMediaBlob(t.image, '/assets/images/default-tribe.png', { class: "lightbox-image", alt: t.title || "" })
    )
  );
};

exports.renderInvitePage = (inviteCode) => {
  const pageContent = div({ class: 'invite-page' },
    h2(i18n.tribeInviteCodeText, inviteCode),
    form({ method: "GET", action: `/tribes` },
      button({ type: "submit", class: "filter-btn" }, i18n.walletBack)
    ),
  );
  return template(i18n.tribeInviteMode, section(pageContent));
};

exports.tribesView = async (tribes, filter, tribeId, query = {}, allTribes = null) => {
  const now = Date.now();
  const search = (query.search || '').toLowerCase();

  const visible = (t) => !t.isAnonymous || t.members.includes(userId);
  const isMainTribe = (t) => !t.parentTribeId;
  const filtered = tribes.filter(t => {
    return (
      filter === 'all' ? visible(t) && isMainTribe(t) :
      filter === 'mine' ? t.author === userId :
      filter === 'membership' ? t.members.includes(userId) :
      filter === 'subtribes' ? visible(t) && !!t.parentTribeId :
      filter === 'recent' ? visible(t) && isMainTribe(t) && ((typeof t.createdAt === 'string' ? Date.parse(t.createdAt) : t.createdAt) >= now - MS_PER_DAY ) :
      filter === 'top' ? visible(t) && isMainTribe(t) :
      filter === 'gallery' ? visible(t) && isMainTribe(t) :
      filter === 'larp' ? visible(t) && isMainTribe(t) && t.isLARP === true :
      filter === 'create' ? true :
      filter === 'edit' ? true :
      false
    );
  });

  const searched = filter === 'create' || filter === 'edit' || !search
    ? filtered
    : filtered.filter(t =>
        (t.title && t.title.toLowerCase().includes(search)) ||
        (t.description && t.description.toLowerCase().includes(search))
      );

  const sorted = filter === 'top'
    ? [...searched].sort((a, b) => b.members.length - a.members.length)
    : [...searched].sort((a, b) => {
        const ca = typeof a.createdAt === 'string' ? Date.parse(a.createdAt) : a.createdAt;
        const cb = typeof b.createdAt === 'string' ? Date.parse(b.createdAt) : b.createdAt;
        return cb - ca;
      });

  const title =
    filter === 'recent' ? i18n.tribeRecentSectionTitle :
    filter === 'mine' ? i18n.tribeMineSectionTitle :
    filter === 'create' ? i18n.tribeCreateSectionTitle :
    filter === 'edit' ? i18n.tribeUpdateSectionTitle :
    filter === 'gallery' ? i18n.tribeGallerySectionTitle :
    filter === 'top' ? i18n.tribeTopSectionTitle :
    filter === 'larp' ? i18n.tribeLarpSectionTitle :
    filter === 'subtribes' ? (i18n.tribeSubTribes || 'SUB-TRIBES') :
    i18n.tribeAllSectionTitle;

  const header = div({ class: 'tags-header' }, h2(title), p(i18n.tribeDescription));

  const filters = div({ class: 'filters' },
    form({ method: 'GET', action: '/tribes' },
      input({ type: 'hidden', name: 'filter', value: filter }),
      input({ type: 'text', name: 'search', placeholder: i18n.searchTribesPlaceholder, value: query.search || '' }),
      br(),
      button({ type: 'submit' }, i18n.applyFilters),
      br()
    )
  );

  const modeButtons = div({ class: 'tribe-mode-buttons' },
    ['all','recent','mine','membership','subtribes','larp','top','gallery'].map(f =>
    form({ method: 'GET', action: '/tribes' },
      input({ type: 'hidden', name: 'filter', value: f }),
      button({ type: 'submit', class: filter === f ? 'filter-btn active' : 'filter-btn' },
        i18n[`tribeFilter${f.charAt(0).toUpperCase()+f.slice(1)}`]
        )
      )
    ),
    form({ method: 'GET', action: '/tribes/create' },
      button({ type: 'submit', class: 'create-button' }, i18n.tribeCreateButton)
    )
  );

  const isEdit = filter === 'edit' && tribeId;
  const tribeToEdit = isEdit ? tribes.find(t => t.id === tribeId) : {};
  const createForm = (filter === 'create' || isEdit) ? div({ class: 'create-tribe-form' },
    h2(isEdit ? i18n.updateTribeTitle : i18n.createTribeTitle),
    form({
    method: 'POST',
    action: isEdit ? `/tribes/update/${encodeURIComponent(tribeToEdit.id)}` : '/tribes/create',
    enctype: 'multipart/form-data'
    },
    label({ for: 'title' }, i18n.tribeTitleLabel),
    br,
    input({ type: 'text', name: 'title', id: 'title', required: true, placeholder: i18n.tribeTitlePlaceholder, value: tribeToEdit.title || '' }),
    br(),
    label({ for: 'description' }, i18n.tribeDescriptionLabel),
    br,
    textarea({ name: 'description', id: 'description', required: true, rows: 4, cols: 50, placeholder: i18n.tribeDescriptionPlaceholder }, tribeToEdit.description || ''),
    br,
    label({ for: 'location' }, i18n.tribeLocationLabel),
    br,
    input({ type: 'text', name: 'location', id: 'location', placeholder: i18n.tribeLocationPlaceholder, value: tribeToEdit.location || '' }),
    br,
    label({ for: 'image' }, i18n.tribeImageLabel),
    br,
    input({ type: 'file', name: 'image', id: 'image' }),
    br(), br(),
    label({ for: 'tags' }, i18n.tribeTagsLabel),
    br,
    input({ type: 'text', name: 'tags', id: 'tags', placeholder: i18n.tribeTagsPlaceholder, value: (tribeToEdit.tags || []).join(', ') }),
    br,
    label({ for: 'isAnonymous' }, i18n.tribeIsAnonymousLabel),
    br,
    select({ name: 'isAnonymous', id: 'isAnonymous' },
      option({ value: 'true', selected: tribeToEdit.isAnonymous === true ? 'selected' : undefined }, i18n.tribePrivate),
      option({ value: 'false', selected: tribeToEdit.isAnonymous === false ? 'selected' : undefined }, i18n.tribePublic)
    ),
    br(), br(),
    label({ for: 'inviteMode' }, i18n.tribeModeLabel),
    br,
    select({ name: 'inviteMode', id: 'inviteMode' },
      option({ value: 'strict', selected: tribeToEdit.inviteMode === 'strict' ? 'selected' : undefined }, i18n.tribeStrict),
      option({ value: 'open', selected: tribeToEdit.inviteMode === 'open' ? 'selected' : undefined }, i18n.tribeOpen)
    ),
    br(), br(),
    label({ for: 'isLARP' }, i18n.tribeIsLARPLabel),
    br,
    select({ name: 'isLARP', id: 'isLARP' },
      option({ value: 'false', selected: tribeToEdit.isLARP !== true ? 'selected' : undefined }, i18n.tribeNo),
      option({ value: 'true', selected: tribeToEdit.isLARP === true ? 'selected' : undefined }, i18n.tribeYes)
    ),
    br(), br(),
    button({ type: 'submit' }, isEdit ? i18n.tribeUpdateButton : i18n.tribeCreateButton)
    )
  ) : null;

  const allT = allTribes || tribes;

  const tribeCards = sorted.map(t => {
    const isMember = t.members.includes(userId);
    const subtribes = allT.filter(st => st.parentTribeId === t.id);

    const parentTribe = t.parentTribeId ? allT.find(p => p.id === t.parentTribeId) : null;

    return div({ class: 'tribe-card' },
      parentTribe
        ? div({ class: 'tribe-card-parent' },
            span({ class: 'tribe-info-label' }, i18n.tribeMainTribeLabel || 'MAIN TRIBE'),
            a({ href: `/tribe/${encodeURIComponent(parentTribe.id)}`, class: 'tribe-parent-card-link' }, parentTribe.title)
          )
        : null,
      div({ class: 'tribe-card-image-wrapper' },
        a({ href: `/tribe/${encodeURIComponent(t.id)}` },
          renderMediaBlob(t.image, '/assets/images/default-tribe.png', { class: 'tribe-card-hero-image' })
        ),
        isMember
          ? form({ method: 'GET', action: `/tribe/${encodeURIComponent(t.id)}`, class: 'tribe-visit-btn-wrapper' },
              button({ type: 'submit', class: 'filter-btn' }, String(i18n.tribeviewTribeButton || '').toUpperCase())
            )
          : null
      ),
      div({ class: 'tribe-card-body' },
        h2({ class: 'tribe-card-title' }, a({ href: `/tribe/${encodeURIComponent(t.id)}` }, t.title)),
        t.description ? p({ class: 'tribe-card-description' }, ...renderUrl(t.description)) : null,
        table({ class: 'tribe-info-table' },
          t.location ? tr(
            td({ class: 'tribe-info-label' }, i18n.tribeLocationLabel || 'LOCATION'),
            td({ class: 'tribe-info-value', colspan: '3' }, ...renderUrl(t.location))
          ) : null,
          tr(
            td({ class: 'tribe-info-label' }, i18n.tribeIsAnonymousLabel || 'STATUS'),
            td({ class: 'tribe-info-value' }, t.isAnonymous ? i18n.tribePrivate : i18n.tribePublic),
            td({ class: 'tribe-info-label' }, i18n.tribeModeLabel || 'MODE'),
            td({ class: 'tribe-info-value' }, String(inviteModeI18n()[t.inviteMode] || t.inviteMode).toUpperCase())
          ),
          tr(
            td({ class: 'tribe-info-label' }, i18n.tribeLARPLabel || 'L.A.R.P.'),
            td({ class: 'tribe-info-value', colspan: '3' }, t.isLARP ? i18n.tribeYes : i18n.tribeNo)
          )
        ),
        div({ class: 'tribe-card-subtribes' },
          span({ class: 'tribe-info-label' }, i18n.tribeSubTribes || 'SUB-TRIBES'),
          subtribes.length > 0
            ? subtribes.map(st =>
                form({ method: 'GET', action: `/tribe/${encodeURIComponent(st.id)}` },
                  button({ type: 'submit', class: 'tribe-subtribe-link' }, st.title)
                )
              )
            : span({ class: 'tribe-info-empty' }, '—')
        ),
        div({ class: 'tribe-card-members' },
          span({ class: 'tribe-members-count' }, `${i18n.tribeMembersCount}: ${t.members.length}`)
        ),
        isMember ? div({ class: 'tribe-card-actions' },
          form({ method: 'POST', action: '/tribes/generate-invite' },
            input({ type: 'hidden', name: 'tribeId', value: t.id }),
            button({ type: 'submit', class: 'tribe-action-btn' }, i18n.tribeGenerateInvite)
          ),
          form({ method: 'POST', action: `/tribes/leave/${encodeURIComponent(t.id)}` },
            button({ type: 'submit', class: 'tribe-action-btn' }, i18n.tribeLeaveButton)
          )
        ) : null,
        filter === 'mine' ? div({ class: 'tribe-actions' },
          form({ method: 'GET', action: `/tribes/edit/${encodeURIComponent(t.id)}` }, button({ type: 'submit' }, i18n.tribeUpdateButton)),
          form({ method: 'POST', action: `/tribes/delete/${encodeURIComponent(t.id)}` }, button({ type: 'submit' }, i18n.tribeDeleteButton))
        ) : null
      )
    );
  });

  return template(
    title,
    section(header),
    section(filters),
    section(modeButtons),
    section(
      (filter === 'create' || filter === 'edit')
        ? createForm
        : filter === 'gallery'
          ? renderGallery(sorted.filter(t => t.isAnonymous === false))
          : div({ class: 'tribe-grid' },
              tribeCards.length > 0 ? tribeCards : p(i18n.noTribes)
            )
     ),
    ...renderLightbox(sorted.filter(t => t.isAnonymous === false))
  );
};

const renderFeedTribeView = async (feedItems, tribe, query = {}, filter) => {
  const feed = Array.isArray(feedItems) ? feedItems : [];
  const feedFilter = (query.feedFilter || 'RECENT').toUpperCase();
  const filteredFeed = filterAndSortFeed(feed, feedFilter);
  return div({ class: 'tribe-feed-full' },
    div({ class: 'feed-actions' },
      ['TOP', 'MINE', 'ALL', 'RECENT'].map(f =>
	form({ method: 'GET', action: `/tribe/${encodeURIComponent(tribe.id)}` },
	  input({ type: 'hidden', name: 'section', value: 'feed' }),
	  input({ type: 'hidden', name: 'feedFilter', value: f }),
	  button({ type: 'submit', class: feedFilter === f ? 'filter-btn active' : 'filter-btn' }, i18n[`tribeFeedFilter${f}`])
	)
      )
    ),
    filteredFeed.length === 0
      ? p(i18n.tribeFeedEmpty)
      : div({ class: 'feed-list' },
          filteredFeed.map(m => div({ class: 'feed-item' },
            div({ class: 'feed-row' },
		div({ class: 'refeed-column' },
		  h1(`${m.refeeds || 0}`),
		  !(m.refeeds_inhabitants || []).includes(userId)
		    ? form(
			{ method: 'POST', action: `/tribe/${encodeURIComponent(tribe.id)}/refeed/${encodeURIComponent(m.id)}` },
			button({ class: 'refeed-btn' }, i18n.tribeFeedRefeed)
		      )
		    : null
		),
              div({ class: 'feed-main' },
                p(`${new Date(m.createdAt).toLocaleString()} — `, a({ class: 'user-link', href: `/author/${encodeURIComponent(m.author)}` }, m.author)),
                br,
                p(...renderUrl(m.description))
              )
            )
          ))
        )
  );
};

const sectionLink = (tribe, sectionKey, label, currentSection) =>
  form({ method: 'GET', action: `/tribe/${encodeURIComponent(tribe.id)}` },
    input({ type: 'hidden', name: 'section', value: sectionKey }),
    button({ type: 'submit', class: currentSection === sectionKey ? 'filter-btn active' : 'filter-btn' }, label)
  );

const renderSectionNav = (tribe, section) => {
  const firstGroup = [{ key: 'activity', label: i18n.tribeSectionActivity }, { key: 'inhabitants', label: i18n.tribeSectionInhabitants }];
  if (!tribe.parentTribeId) firstGroup.push({ key: 'subtribes', label: i18n.tribeSubTribes });
  const sections = [
    { items: firstGroup },
    { items: [{ key: 'votations', label: i18n.tribeSectionVotations }, { key: 'events', label: i18n.tribeSectionEvents }, { key: 'tasks', label: i18n.tribeSectionTasks }] },
    { items: [{ key: 'feed', label: i18n.tribeSectionFeed }, { key: 'forum', label: i18n.tribeSectionForum }] },
    { items: [{ key: 'images', label: i18n.tribeSectionImages || 'IMAGES' }, { key: 'audios', label: i18n.tribeSectionAudios || 'AUDIOS' }, { key: 'videos', label: i18n.tribeSectionVideos || 'VIDEOS' }, { key: 'documents', label: i18n.tribeSectionDocuments || 'DOCUMENTS' }, { key: 'bookmarks', label: i18n.tribeSectionBookmarks || 'BOOKMARKS' }] },
    { items: [{ key: 'search', label: i18n.tribeSectionSearch }] },
  ];
  return div({ class: 'tribe-section-nav', style: 'border: none;' },
    sections.map(g =>
      div({ class: 'tribe-section-group', style: 'border: none;' },
        g.items.map(s => s.href
          ? form({ method: 'GET', action: s.href },
              button({ type: 'submit', class: 'filter-btn' }, s.label)
            )
          : sectionLink(tribe, s.key, s.label, section))
      )
    )
  );
};

const statusI18n = () => ({
  'OPEN': i18n.tribeStatusOpen,
  'CLOSED': i18n.tribeStatusClosed,
  'IN-PROGRESS': i18n.tribeStatusInProgress,
});

const priorityI18n = () => ({
  'LOW': i18n.tribePriorityLow,
  'MEDIUM': i18n.tribePriorityMedium,
  'HIGH': i18n.tribePriorityHigh,
  'CRITICAL': i18n.tribePriorityCritical,
});

const inviteModeI18n = () => ({
  'strict': i18n.tribeStrict,
  'open': i18n.tribeOpen,
});

const forumCatI18n = () => ({
  'GENERAL': i18n.tribeForumCatGeneral,
  'PROPOSAL': i18n.tribeForumCatProposal,
  'QUESTION': i18n.tribeForumCatQuestion,
  'ANNOUNCEMENT': i18n.tribeForumCatAnnouncement,
});

const mediaTypeI18n = () => ({
  'all': i18n.tribeMediaFilterAll,
  'image': i18n.tribeMediaTypeImage,
  'video': i18n.tribeMediaTypeVideo,
  'audio': i18n.tribeMediaTypeAudio,
  'document': i18n.tribeMediaTypeDocument,
  'bookmark': i18n.tribeMediaTypeBookmark,
});

const taskFilterI18n = () => ({
  'all': i18n.tribeTaskFilterAll,
  'open': i18n.tribeStatusOpen,
  'in-progress': i18n.tribeStatusInProgress,
  'closed': i18n.tribeStatusClosed,
});

const statusBadge = (status) => {
  const cls = status === 'OPEN' ? 'tribe-content-status-open'
    : status === 'CLOSED' ? 'tribe-content-status-closed'
    : 'tribe-content-status-in-progress';
  return span({ class: `tribe-content-status ${cls}` }, statusI18n()[status] || status);
};

const priorityLabel = (priority) => {
  const cls = `tribe-priority-${(priority || 'low').toLowerCase()}`;
  return span({ class: cls }, priorityI18n()[priority] || (priority || '').toUpperCase());
};

const contentTypeVerb = (ct) => {
  const map = { event: i18n.tribeActivityCreated, task: i18n.tribeActivityCreated, votation: i18n.tribeActivityCreated, forum: i18n.tribeActivityPosted, 'forum-reply': i18n.tribeActivityReplied, media: i18n.tribeActivityCreated, feed: i18n.tribeActivityPosted };
  return map[ct] || i18n.tribeActivityCreated;
};

const contentTypeName = (ct) => {
  const map = { event: i18n.tribeSectionEvents, task: i18n.tribeSectionTasks, votation: i18n.tribeSectionVotations, forum: i18n.tribeSectionForum, 'forum-reply': i18n.tribeSectionForum, media: i18n.tribeSectionMedia, feed: i18n.tribeSectionFeed };
  return map[ct] || ct;
};

const activitySectionMap = {
  event: 'events', task: 'tasks', votation: 'votations',
  forum: 'forum', 'forum-reply': 'forum',
  feed: 'feed'
};

const activitySectionForItem = (item) => {
  if (item.contentType === 'media' && item.mediaType) {
    const map = { image: 'images', audio: 'audios', video: 'videos', document: 'documents', bookmark: 'bookmarks' };
    return map[item.mediaType] || 'images';
  }
  return activitySectionMap[item.contentType] || 'activity';
};

const activityMediaTypeName = (mt) => {
  const map = { image: i18n.tribeSectionImages, audio: i18n.tribeSectionAudios, video: i18n.tribeSectionVideos, document: i18n.tribeSectionDocuments, bookmark: i18n.tribeSectionBookmarks };
  return map[mt] || i18n.tribeSectionMedia || 'MEDIA';
};

const renderTribeActivitySection = (tribe, sectionData) => {
  const { activities } = sectionData || { activities: [] };
  if (activities.length === 0) return div({ class: 'tribe-content-list' }, p(i18n.tribeActivityEmpty));
  const tribeUrl = `/tribe/${encodeURIComponent(tribe.id)}`;
  return div({ class: 'tribe-content-list', style: 'gap: 16px; display: flex; flex-direction: column;' },
    activities.slice(0, 50).map(item => {
      const date = item.timestamp ? new Date(item.timestamp).toLocaleString() : '';
      const typeLabel = item.contentType === 'media' && item.mediaType
        ? activityMediaTypeName(item.mediaType)
        : contentTypeName(item.contentType);
      const headerText = item.tribeName
        ? `[${String(typeLabel).toUpperCase()} · ${item.tribeName}]`
        : `[${String(typeLabel).toUpperCase()}]`;
      const targetSection = activitySectionForItem(item);
      const blobUrl = item.contentType === 'media' ? toBlobUrl(item.image) : null;
      const mediaContent =
        item.contentType === 'media' && item.mediaType === 'image' && blobUrl
          ? a({ href: blobUrl, target: '_blank' }, img({ src: blobUrl, alt: item.title || '', class: 'tribe-media-thumb' }))
        : item.contentType === 'media' && item.mediaType === 'audio' && blobUrl
          ? audio({ src: blobUrl, controls: true, class: 'tribe-media-audio' })
        : item.contentType === 'media' && item.mediaType === 'video' && blobUrl
          ? video({ src: blobUrl, controls: true, class: 'tribe-media-thumb' })
        : item.contentType === 'media' && item.mediaType === 'document' && blobUrl
          ? a({ href: blobUrl, target: '_blank', class: 'tribe-action-btn' }, i18n.readDocument || 'Read Document')
        : item.contentType === 'media' && item.mediaType === 'bookmark' && (item.url || item.description)
          ? a({ href: item.url || item.description, target: '_blank', class: 'tribe-action-btn' }, item.url || item.description)
        : null;
      return div({ class: 'card card-rpg', style: 'padding: 12px 16px;' },
        div({ class: 'card-header' },
          h2({ class: 'card-label' }, headerText),
          form({ method: 'GET', action: tribeUrl },
            input({ type: 'hidden', name: 'section', value: targetSection }),
            button({ type: 'submit', class: 'filter-btn' }, i18n.viewDetails || 'View Details')
          )
        ),
        div({ class: 'tribe-card-body' },
          item.title ? div({ class: 'card-field' },
            span({ class: 'card-label' }, (i18n.title || 'Title') + ':'),
            span({ class: 'card-value' }, item.title)
          ) : null,
          mediaContent,
          item.description && !(item.contentType === 'media' && item.mediaType === 'bookmark' && item.description === item.url) ? p(item.description.substring(0, 200)) : null
        ),
        p({ class: 'card-footer' },
          span({ class: 'date-link' }, `${date} ${i18n.performed || ''} `),
          a({ href: `/author/${encodeURIComponent(item.author)}`, class: 'user-link' }, item.authorName || item.author)
        )
      );
    })
  );
};

const engagementScore = (item) => (item.refeeds || 0) + (Array.isArray(item.attendees) ? item.attendees.length : 0) + Object.values(item.votes || {}).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0) + (Array.isArray(item.assignees) ? item.assignees.length : 0) + (Array.isArray(item.opinions_inhabitants) ? item.opinions_inhabitants.length : 0);

const renderTribeTrendingSection = (tribe, sectionData, query) => {
  const { items, period } = sectionData || { items: [], period: 'all' };
  const tribeUrl = `/tribe/${encodeURIComponent(tribe.id)}`;
  const periodBtn = (key, label) => form({ method: 'GET', action: tribeUrl }, input({ type: 'hidden', name: 'section', value: 'trending' }), input({ type: 'hidden', name: 'period', value: key }), button({ type: 'submit', class: period === key ? 'filter-btn active' : 'filter-btn' }, label));
  return div({ class: 'tribe-content-list' },
    div({ class: 'tribe-content-header' }, h2(i18n.tribeSectionTrending)),
    div({ class: 'tribe-filter-bar' }, periodBtn('day', i18n.tribeTrendingPeriodDay), periodBtn('week', i18n.tribeTrendingPeriodWeek), periodBtn('all', i18n.tribeTrendingPeriodAll)),
    items.length === 0 ? p(i18n.tribeTrendingEmpty) :
      items.slice(0, 30).map((item, idx) => div({ class: 'tribe-content-card' },
        div({ class: 'tribe-content-meta' },
          span(`#${idx + 1}`),
          span({ class: 'tribe-badge' }, contentTypeName(item.contentType)),
          span(`${i18n.tribeTrendingEngagement}: ${engagementScore(item)}`),
          (() => { const entries = Object.entries(item.opinions || {}); if (!entries.length) return null; const top = entries.reduce((a, b) => b[1] > a[1] ? b : a); return span(`| ${i18n.tribeTopCategory}: ${i18n['opinionCat' + top[0].charAt(0).toUpperCase() + top[0].slice(1)] || top[0]}`); })()
        ),
        item.title ? h2(item.title) : item.description ? h2(item.description) : null,
        div({ class: 'tribe-content-meta' },
          item.refeeds ? span(`${i18n.tribeActivityRefeed}: ${item.refeeds}`) : null,
          Array.isArray(item.attendees) && item.attendees.length ? span(`${i18n.tribeEventAttendees}: ${item.attendees.length}`) : null
        ),
        p({ class: 'tribe-meta-label' }, a({ class: 'user-link', href: `/author/${encodeURIComponent(item.author)}` }, item.author))
      ))
  );
};

const renderTribeSearchSection = (tribe, sectionData, query) => {
  const { results } = sectionData || { results: [] };
  const sq = sectionData?.query || '';
  const tribeUrl = `/tribe/${encodeURIComponent(tribe.id)}`;
  return div({ class: 'tribe-content-list' },
    div({ class: 'tribe-content-header' }, h2(i18n.tribeSectionSearch)),
    form({ method: 'GET', action: tribeUrl, class: 'tribe-search-form' },
      input({ type: 'hidden', name: 'section', value: 'search' }),
      input({ type: 'text', name: 'q', value: sq, placeholder: i18n.tribeSearchPlaceholder, minlength: 2 }),
      button({ type: 'submit', class: 'create-button' }, i18n.tribeSectionSearch)
    ),
    sq.length > 0 && sq.length < 2 ? p(i18n.tribeSearchMinChars) : null,
    sq.length >= 2 ? div(
      h2(`${i18n.tribeSearchResults}: ${results.length}`),
      results.length === 0 ? p(i18n.tribeSearchEmpty) :
        results.map(item => div({ class: 'card card-rpg' },
          div({ class: 'card-header' },
            h2({ class: 'card-label' }, `[${String(contentTypeName(item.contentType)).toUpperCase()}]`)
          ),
          div({ class: 'card-body' },
            item.title ? div({ class: 'card-field' },
              span({ class: 'card-label' }, (i18n.title || 'Title') + ':'),
              span({ class: 'card-value' }, item.title)
            ) : null,
            item.description ? p(item.description.substring(0, 200)) : null
          ),
          p({ class: 'card-footer' },
            span({ class: 'date-link' }, new Date(item.createdAt).toLocaleDateString()),
            a({ class: 'user-link', href: `/author/${encodeURIComponent(item.author)}` }, item.author)
          )
        ))
    ) : null
  );
};

const renderOverviewSection = (tribe, query, sectionData) => {
  const feed = Array.isArray(sectionData?.feed) ? sectionData.feed : [];
  const recentFeed = [...feed]
    .sort((a, b) => (Date.parse(b.createdAt) || b._ts || 0) - (Date.parse(a.createdAt) || a._ts || 0))
    .slice(0, 5);
  const events = Array.isArray(sectionData?.events) ? sectionData.events.slice(0, 3) : [];
  const tasks = Array.isArray(sectionData?.tasks) ? sectionData.tasks.slice(0, 3) : [];

  return div({ class: 'tribe-overview-grid' },
    div({ class: 'tribe-overview-section' },
      h2(i18n.tribeSectionFeed),
      recentFeed.length === 0 ? p(i18n.tribeFeedEmpty) :
        recentFeed.map(m =>
          div({ class: 'feed-item' },
            p(`${new Date(m.createdAt).toLocaleString()} — `, a({ class: 'user-link', href: `/author/${encodeURIComponent(m.author)}` }, m.author)),
            p(...renderUrl(m.description))
          )
        )
    ),
    div({ class: 'tribe-overview-section' },
      h2(i18n.tribeSectionEvents),
      events.length === 0 ? p(i18n.tribeEventsEmpty) :
        events.map(e =>
          div({ class: 'tribe-content-card' },
            h2(e.title),
            div({ class: 'tribe-content-meta' },
              e.date ? span(e.date) : null,
              e.location ? span(e.location) : null,
              statusBadge(e.status)
            )
          )
        )
    ),
    div({ class: 'tribe-overview-section' },
      h2(i18n.tribeSectionTasks),
      tasks.length === 0 ? p(i18n.tribeTasksEmpty) :
        tasks.map(t =>
          div({ class: 'tribe-content-card' },
            h2(t.title),
            div({ class: 'tribe-content-meta' },
              priorityLabel(t.priority),
              statusBadge(t.status)
            )
          )
        )
    ),
    div({ class: 'tribe-overview-section' },
      h2(i18n.tribeSectionInhabitants),
      p(`${i18n.tribeMembersCount}: ${tribe.members.length}`),
      tribe.members.slice(0, 6).map(m =>
        a({ class: 'user-link', href: `/author/${encodeURIComponent(m)}` }, m),
      )
    )
  );
};

const renderInhabitantsSection = (tribe, members) => {
  const resolved = Array.isArray(members) ? members : [];
  if (resolved.length === 0) return p(i18n.tribeInhabitantsEmpty);
  return div({ class: 'tribe-thumb-grid' },
    resolved.map(m =>
      a({ href: `/author/${encodeURIComponent(m.id)}`, class: 'tribe-thumb-link', title: m.name || m.id },
        img({ src: resolvePhoto(m.photo), class: 'tribe-thumb-img', alt: m.name || m.id })
      )
    )
  );
};

const createButtonI18n = {
  events: () => i18n.tribeEventCreate || 'Create Event',
  tasks: () => i18n.tribeTaskCreate || 'Create Task',
  votations: () => i18n.tribeVotationCreate || 'Create Votation',
  forum: () => i18n.tribeForumCreate || 'Create Forum',
  subtribes: () => i18n.tribeSubTribesCreate || 'Create Sub-Tribe',
};

const renderCreateForm = (tribe, contentType, fields) => {
  const tribeUrl = `/tribe/${encodeURIComponent(tribe.id)}`;
  const hasFile = fields.some(f => f.type === 'file');
  const formAttrs = { method: 'POST', action: `${tribeUrl}/${contentType}/create` };
  if (hasFile) formAttrs.enctype = 'multipart/form-data';
  const btnLabel = createButtonI18n[contentType] ? createButtonI18n[contentType]() : i18n.tribeCreateButton;
  return div({ class: 'create-tribe-form' },
    form(formAttrs,
      ...fields.map(f => {
        const prefix = f.spaceBefore ? [br()] : [];
        if (f.type === 'textarea') return [...prefix, label({ for: f.name }, f.label), br, textarea({ name: f.name, id: f.name, rows: f.rows || 4, required: f.required, placeholder: f.placeholder }, ''), br()];
        if (f.type === 'select') return [...prefix, label({ for: f.name }, f.label), br, select({ name: f.name, id: f.name }, ...f.options.map(o => option({ value: o.value }, o.label))), br()];
        if (f.type === 'file') return [...prefix, label({ for: f.name }, f.label), br, input({ type: 'file', name: f.name, id: f.name, accept: f.accept || '*/*' }), br()];
        const attrs = { type: f.type || 'text', name: f.name, id: f.name, required: f.required, placeholder: f.placeholder };
        if (f.min) attrs.min = f.min;
        return [...prefix, br, label({ for: f.name }, f.label), br, input(attrs), br()];
      }).flat(),br(),
      button({ type: 'submit', class: 'create-button' }, btnLabel)
    )
  );
};

const renderEventsSection = (tribe, items, query) => {
  const events = Array.isArray(items) ? items : [];
  const action = query.action;
  const today = new Date().toISOString().split('T')[0];
  if (action === 'create') {
    return renderCreateForm(tribe, 'events', [
      { name: 'title', label: i18n.tribeEventTitle, required: true, placeholder: i18n.tribeEventTitle },
      { name: 'description', type: 'textarea', label: i18n.tribeEventDescription, required: true, placeholder: i18n.tribeEventDescription },
      { name: 'date', type: 'date', label: i18n.tribeEventDate, required: true, min: today },
      { name: 'location', label: i18n.tribeEventLocation, placeholder: i18n.tribeEventLocation },
    ]);
  }
  const tribeUrl = `/tribe/${encodeURIComponent(tribe.id)}`;
  return div({ class: 'tribe-content-list' },
    div({ class: 'tribe-content-header' },
      h2(i18n.tribeSectionEvents),
      form({ method: 'GET', action: tribeUrl },
        input({ type: 'hidden', name: 'section', value: 'events' }),
        input({ type: 'hidden', name: 'action', value: 'create' }),
        button({ type: 'submit', class: 'create-button' }, i18n.tribeEventCreate)
      )
    ),
    events.length === 0 ? p(i18n.tribeEventsEmpty) :
      events.map(e => div({ class: 'tribe-content-card' },
        h2(e.title),
        e.description ? p(...renderUrl(e.description)) : null,
        e.date ? div({ class: 'card-field' },
          span({ class: 'card-label' }, (i18n.tribeEventDate || 'Date') + ':'),
          span({ class: 'card-value' }, e.date)
        ) : null,
        e.location ? div({ class: 'card-field' },
          span({ class: 'card-label' }, (i18n.tribeEventLocation || 'Location') + ':'),
          span({ class: 'card-value' }, ...renderUrl(e.location))
        ) : null,
        div({ class: 'card-field' },
          span({ class: 'card-label' }, (i18n.tribeEventAttendees || 'Attendees') + ':'),
          span({ class: 'card-value' }, String((e.attendees || []).length))
        ),
        statusBadge(e.status),
        div({ class: 'tribe-content-actions' },
          form({ method: 'POST', action: `${tribeUrl}/events/attend/${encodeURIComponent(e.id)}` },
            button({ type: 'submit', class: 'filter-btn' },
              (e.attendees || []).includes(userId) ? i18n.tribeEventUnattend : i18n.tribeEventAttend
            )
          ),
          e.author === userId ? form({ method: 'POST', action: `${tribeUrl}/content/delete/${encodeURIComponent(e.id)}` },
            button({ type: 'submit', class: 'filter-btn' }, i18n.tribeContentDelete)
          ) : null
        )
      ))
  );
};

const renderTasksSection = (tribe, items, query) => {
  const tasks = Array.isArray(items) ? items : [];
  const action = query.action;
  const today = new Date().toISOString().split('T')[0];
  if (action === 'create') {
    return renderCreateForm(tribe, 'tasks', [
      { name: 'title', label: i18n.tribeTaskTitle, required: true, placeholder: i18n.tribeTaskTitle },
      { name: 'description', type: 'textarea', label: i18n.tribeTaskDescription, required: true, placeholder: i18n.tribeTaskDescription },
      { name: 'priority', type: 'select', label: i18n.tribeTaskPriority, options: [
        { value: 'LOW', label: i18n.tribePriorityLow }, { value: 'MEDIUM', label: i18n.tribePriorityMedium },
        { value: 'HIGH', label: i18n.tribePriorityHigh }, { value: 'CRITICAL', label: i18n.tribePriorityCritical }
      ]},
      { name: 'deadline', type: 'date', label: i18n.tribeTaskDeadline, min: today },
    ]);
  }
  const tribeUrl = `/tribe/${encodeURIComponent(tribe.id)}`;
  return div({ class: 'tribe-content-list' },
    div({ class: 'tribe-content-header' },
      h2(i18n.tribeSectionTasks),
      form({ method: 'GET', action: tribeUrl },
        input({ type: 'hidden', name: 'section', value: 'tasks' }),
        input({ type: 'hidden', name: 'action', value: 'create' }),
        button({ type: 'submit', class: 'create-button' }, i18n.tribeTaskCreate)
      )
    ),
    tasks.length === 0 ? p(i18n.tribeTasksEmpty) :
      tasks.map(t => div({ class: 'tribe-content-card' },
        h2(t.title),
        t.description ? p(...renderUrl(t.description)) : null,
        div({ class: 'card-field' },
          span({ class: 'card-label' }, (i18n.tribeTaskPriority || 'Priority') + ':'),
          priorityLabel(t.priority)
        ),
        div({ class: 'card-field' },
          span({ class: 'card-label' }, (i18n.tribeStatusLabel || 'Status') + ':'),
          statusBadge(t.status)
        ),
        div({ class: 'card-field' },
          span({ class: 'card-label' }, (i18n.tribeTaskAssignees || 'Assignees') + ':'),
          span({ class: 'card-value' }, String((t.assignees || []).length))
        ),
        br(),
        t.deadline ? div({ class: 'card-field' },
          span({ class: 'card-label' }, (i18n.tribeTaskDeadline || 'Deadline') + ':'),
          span({ class: 'card-value' }, t.deadline)
        ) : null,
        div({ class: 'tribe-content-actions' },
          form({ method: 'POST', action: `${tribeUrl}/tasks/assign/${encodeURIComponent(t.id)}` },
            button({ type: 'submit', class: 'filter-btn' },
              (t.assignees || []).includes(userId) ? i18n.tribeTaskUnassign : i18n.tribeTaskAssign
            )
          ),
          t.status !== 'IN-PROGRESS' && t.author === userId ? form({ method: 'POST', action: `${tribeUrl}/tasks/status/${encodeURIComponent(t.id)}` },
            input({ type: 'hidden', name: 'status', value: 'IN-PROGRESS' }),
            button({ type: 'submit', class: 'filter-btn' }, i18n.tribeTaskStatusInProgress)
          ) : null,
          t.status !== 'CLOSED' && t.author === userId ? form({ method: 'POST', action: `${tribeUrl}/tasks/status/${encodeURIComponent(t.id)}` },
            input({ type: 'hidden', name: 'status', value: 'CLOSED' }),
            button({ type: 'submit', class: 'filter-btn' }, i18n.tribeTaskStatusClosed)
          ) : null,
          t.author === userId ? form({ method: 'POST', action: `${tribeUrl}/content/delete/${encodeURIComponent(t.id)}` },
            button({ type: 'submit', class: 'filter-btn' }, i18n.tribeContentDelete)
          ) : null
        )
      ))
  );
};

const renderVotationsSection = (tribe, items, query) => {
  const votations = Array.isArray(items) ? items : [];
  const action = query.action;
  const today = new Date().toISOString().split('T')[0];
  if (action === 'create') {
    return div({ class: 'create-tribe-form' },
      form({ method: 'POST', action: `/tribe/${encodeURIComponent(tribe.id)}/votations/create` },
        label({ for: 'title' }, i18n.tribeVotationTitle), br,
        input({ type: 'text', name: 'title', id: 'title', required: true, placeholder: i18n.tribeVotationTitle }), br(),
        label({ for: 'description' }, i18n.tribeVotationDescription), br,
        textarea({ name: 'description', id: 'description', rows: 3, placeholder: i18n.tribeVotationDescription }, ''), br(),
        label({ for: 'deadline' }, i18n.tribeVotationDeadline), br,
        input({ type: 'date', name: 'deadline', id: 'deadline', min: today }), br(),
        br(),
        label(i18n.tribeVotationOptions), br,
        input({ type: 'text', name: 'option1', placeholder: `${i18n.tribeVotationOptionPlaceholder} 1`, required: true }), br(),
        input({ type: 'text', name: 'option2', placeholder: `${i18n.tribeVotationOptionPlaceholder} 2`, required: true }), br(),
        input({ type: 'text', name: 'option3', placeholder: `${i18n.tribeVotationOptionPlaceholder} 3` }), br(),
        input({ type: 'text', name: 'option4', placeholder: `${i18n.tribeVotationOptionPlaceholder} 4` }), br(),
        button({ type: 'submit', class: 'create-button' }, i18n.tribeVotationCreate)
      )
    );
  }
  const tribeUrl = `/tribe/${encodeURIComponent(tribe.id)}`;
  return div({ class: 'tribe-content-list' },
    div({ class: 'tribe-content-header' },
      h2(i18n.tribeSectionVotations),
      form({ method: 'GET', action: tribeUrl },
        input({ type: 'hidden', name: 'section', value: 'votations' }),
        input({ type: 'hidden', name: 'action', value: 'create' }),
        button({ type: 'submit', class: 'create-button' }, i18n.tribeVotationCreate)
      )
    ),
    votations.length === 0 ? p(i18n.tribeVotationsEmpty) :
      votations.map(v => {
        const opts = Array.isArray(v.options) ? v.options : [];
        const votes = v.votes || {};
        const totalVotes = Object.values(votes).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
        const hasVoted = Object.values(votes).some(arr => Array.isArray(arr) && arr.includes(userId));
        const isOpen = v.status === 'OPEN';

        return div({ class: 'tribe-content-card' },
          h2(v.title),
          v.description ? p(...renderUrl(v.description)) : null,
          statusBadge(v.status),
          v.deadline ? div({ class: 'card-field' },
            span({ class: 'card-label' }, (i18n.tribeVotationDeadline || 'Deadline') + ':'),
            span({ class: 'card-value' }, v.deadline)
          ) : null,
          div({ class: 'card-field' },
            span({ class: 'card-label' }, (i18n.tribeVotationResults || 'Votes') + ':'),
            span({ class: 'card-value' }, String(totalVotes))
          ),
          br(),
          div({ class: 'tribe-votation-options' },
            opts.map((opt, idx) => {
              const count = Array.isArray(votes[String(idx)]) ? votes[String(idx)].length : 0;
              const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
              const roundedPct = Math.round(pct / 5) * 5;
              return div({ class: 'tribe-votation-option' },
                span({ class: 'tribe-votation-label' }, opt),
                div({ class: 'tribe-votation-bar' },
                  div({ class: `tribe-votation-fill tribe-fill-${roundedPct}` })
                ),
                span({ class: 'tribe-votation-count' }, `${count} (${pct}%)`),
                isOpen && !hasVoted ? form({ method: 'POST', action: `${tribeUrl}/votations/${encodeURIComponent(v.id)}/vote` },
                  input({ type: 'hidden', name: 'optionIndex', value: String(idx) }),
                  button({ type: 'submit', class: 'filter-btn' }, i18n.tribeVotationVote)
                ) : null
              );
            })
          ),
          v.author === userId ? div({ class: 'tribe-content-actions' },
            isOpen ? form({ method: 'POST', action: `${tribeUrl}/votations/close/${encodeURIComponent(v.id)}` },
              button({ type: 'submit', class: 'tribe-action-btn' }, i18n.tribeVotationClose)
            ) : null,
            form({ method: 'POST', action: `${tribeUrl}/content/delete/${encodeURIComponent(v.id)}` },
              button({ type: 'submit', class: 'tribe-action-btn' }, i18n.tribeContentDelete)
            )
          ) : null
        );
      })
  );
};

const renderForumSection = (tribe, items, query) => {
  const allItems = Array.isArray(items) ? items : [];
  const threads = allItems.filter(i => i.contentType === 'forum');
  const action = query.action;
  const threadId = query.thread;
  const tribeUrl = `/tribe/${encodeURIComponent(tribe.id)}`;

  if (action === 'create') {
    return renderCreateForm(tribe, 'forum', [
      { name: 'title', label: i18n.tribeForumTitle, required: true, placeholder: i18n.tribeForumTitle },
      { name: 'description', type: 'textarea', label: i18n.tribeForumText, required: true, placeholder: i18n.tribeForumText, rows: 6 },
      { name: 'category', type: 'select', label: i18n.tribeForumCategory, options: [
        { value: 'GENERAL', label: i18n.tribeForumCatGeneral }, { value: 'PROPOSAL', label: i18n.tribeForumCatProposal },
        { value: 'QUESTION', label: i18n.tribeForumCatQuestion }, { value: 'ANNOUNCEMENT', label: i18n.tribeForumCatAnnouncement }
      ]}
    ]);
  }

  if (threadId) {
    const thread = allItems.find(i => i.id === threadId);
    const replies = allItems.filter(i => i.contentType === 'forum-reply' && i.parentId === threadId)
      .sort((a, b) => (a.refeeds || 0) - (b.refeeds || 0) !== 0 ? (b.refeeds || 0) - (a.refeeds || 0) : (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
    if (!thread) return p(i18n.tribeForumEmpty);
    const replyCount = replies.length;
    return div({ class: 'tribe-content-list' },
      form({ method: 'GET', action: tribeUrl },
        input({ type: 'hidden', name: 'section', value: 'forum' }),
        button({ type: 'submit', class: 'filter-btn' }, i18n.walletBack)
      ),
      div({ class: 'forum-card forum-thread-header' },
        div({ class: 'forum-score-col' },
          div({ class: 'forum-score-box' },
            form({ method: 'POST', action: `${tribeUrl}/forum/${encodeURIComponent(thread.id)}/refeed` },
              button({ type: 'submit', class: 'score-btn' }, '▲')
            ),
            div({ class: 'score-total' }, String(thread.refeeds || 0)),
          )
        ),
        div({ class: 'forum-main-col' },
          div({ class: 'forum-header-row' },
            thread.category ? span({ class: 'forum-category' }, `[${forumCatI18n()[thread.category] || thread.category}]`) : null,
            span({ class: 'forum-title' }, thread.title)
          ),
          div({ class: 'forum-footer' },
            span({ class: 'date-link' }, `${new Date(thread.createdAt).toLocaleString()} ${i18n.performed || ''}`),
            a({ href: `/author/${encodeURIComponent(thread.author)}`, class: 'user-link' }, thread.author)
          ),
          div({ class: 'forum-body' }, ...renderUrl(thread.description || '')),
          div({ class: 'forum-meta' },
            span({ class: 'forum-positive-votes' }, `▲: ${thread.refeeds || 0}`),
            span({ class: 'forum-messages' }, `${(i18n.forumMessages || i18n.tribeForumReplies || 'MESSAGES').toUpperCase()}: ${replyCount}`)
          )
        )
      ),
      div({ class: 'tribe-forum-reply-form' },
        form({ method: 'POST', action: `${tribeUrl}/forum/${encodeURIComponent(threadId)}/reply` },
          textarea({ name: 'description', rows: 3, required: true, placeholder: i18n.tribeForumReply }),
          br(),
          button({ type: 'submit', class: 'forum-send-btn' }, i18n.tribeForumReply)
        )
      ),
      replies.length > 0
        ? replies.map((r, idx) =>
            div({ class: `forum-comment${idx === 0 ? ' highlighted-reply' : ''}` },
              div({ class: 'comment-header' },
                span({ class: 'date-link' }, `${new Date(r.createdAt).toLocaleString()} ${i18n.performed || ''}`),
                a({ href: `/author/${encodeURIComponent(r.author)}`, class: 'user-link' }, r.author),
                div({ class: 'comment-votes' },
                  span({ class: 'forum-positive-votes' }, `▲: ${r.refeeds || 0}`)
                )
              ),
              div({ class: 'comment-body-row' },
                div({ class: 'comment-vote-col' },
                  div({ class: 'forum-score-box' },
                    form({ method: 'POST', action: `${tribeUrl}/forum/${encodeURIComponent(r.id)}/refeed` },
                      button({ type: 'submit', class: 'score-btn' }, '▲')
                    ),
                    div({ class: 'score-total' }, String(r.refeeds || 0))
                  )
                ),
                div({ class: 'comment-text-col' },
                  ...(r.description || '').split('\n').map(l => l.trim()).filter(l => l).map(l => p(...renderUrl(l)))
                )
              ),
              r.author === userId ? div({ class: 'tribe-content-actions' },
                form({ method: 'POST', action: `${tribeUrl}/content/delete/${encodeURIComponent(r.id)}` },
                  button({ type: 'submit', class: 'tribe-action-btn' }, i18n.tribeContentDelete)
                )
              ) : null
            )
          )
        : null
    );
  }

  const replyMap = new Map();
  allItems.filter(i => i.contentType === 'forum-reply').forEach(r => { replyMap.set(r.parentId, (replyMap.get(r.parentId) || 0) + 1); });
  const sortedThreads = [...threads].sort((a, b) => ((b.refeeds || 0) + (replyMap.get(b.id) || 0)) - ((a.refeeds || 0) + (replyMap.get(a.id) || 0)));

  return div({ class: 'tribe-content-list' },
    div({ class: 'tribe-content-header' },
      h2(i18n.tribeSectionForum),
      form({ method: 'GET', action: tribeUrl },
        input({ type: 'hidden', name: 'section', value: 'forum' }),
        input({ type: 'hidden', name: 'action', value: 'create' }),
        button({ type: 'submit', class: 'create-button' }, i18n.tribeForumCreate)
      )
    ),
    sortedThreads.length === 0 ? p(i18n.tribeForumEmpty) :
      div({ class: 'forum-list' },
        sortedThreads.map(t => {
          const replyCount = allItems.filter(i => i.contentType === 'forum-reply' && i.parentId === t.id).length;
          return div({ class: 'forum-card' },
            div({ class: 'forum-score-col' },
              div({ class: 'forum-score-box' },
                form({ method: 'POST', action: `${tribeUrl}/forum/${encodeURIComponent(t.id)}/refeed` },
                  button({ type: 'submit', class: 'score-btn' }, '▲')
                ),
                div({ class: 'score-total' }, String(t.refeeds || 0))
              )
            ),
            div({ class: 'forum-main-col' },
              div({ class: 'forum-header-row' },
                t.category ? span({ class: 'forum-category' }, `[${forumCatI18n()[t.category] || t.category}]`) : null,
                form({ method: 'GET', action: tribeUrl, class: 'forum-title-form' },
                  input({ type: 'hidden', name: 'section', value: 'forum' }),
                  input({ type: 'hidden', name: 'thread', value: t.id }),
                  button({ type: 'submit', class: 'forum-title' }, t.title)
                )
              ),
              t.description ? div({ class: 'forum-body' }, ...renderUrl((t.description || '').substring(0, 200))) : null,
              div({ class: 'forum-meta' },
                span({ class: 'forum-positive-votes' }, `▲: ${t.refeeds || 0}`),
                span({ class: 'forum-messages' }, `${(i18n.forumMessages || i18n.tribeForumReplies || 'MESSAGES').toUpperCase()}: ${replyCount}`),
                form({ method: 'GET', action: tribeUrl, class: 'visit-forum-form' },
                  input({ type: 'hidden', name: 'section', value: 'forum' }),
                  input({ type: 'hidden', name: 'thread', value: t.id }),
                  button({ type: 'submit', class: 'filter-btn' }, i18n.forumVisitButton || 'VISIT')
                )
              ),
              div({ class: 'forum-footer' },
                span({ class: 'date-link' }, `${new Date(t.createdAt).toLocaleString()} ${i18n.performed || ''}`),
                a({ href: `/author/${encodeURIComponent(t.author)}`, class: 'user-link' }, t.author)
              ),
              t.author === userId ? div({ class: 'forum-owner-actions' },
                form({ method: 'POST', action: `${tribeUrl}/content/delete/${encodeURIComponent(t.id)}`, class: 'forum-delete-form' },
                  button({ type: 'submit', class: 'tribe-action-btn' }, i18n.tribeContentDelete)
                )
              ) : null
            )
          );
        })
      )
  );
};

const sectionKeyForMediaType = { image: 'images', audio: 'audios', video: 'videos', document: 'documents', bookmark: 'bookmarks' };
const acceptForMediaType = { image: 'image/*', audio: 'audio/*', video: 'video/*', document: 'application/pdf,.pdf,.doc,.docx,.txt,.odt', bookmark: null };
const sectionTitleForMediaType = (mt) => {
  const map = { image: i18n.tribeSectionImages, audio: i18n.tribeSectionAudios, video: i18n.tribeSectionVideos, document: i18n.tribeSectionDocuments, bookmark: i18n.tribeSectionBookmarks };
  return map[mt] || mt;
};

const renderTribeMediaTypeSection = (tribe, items, query, mediaType) => {
  const allMedia = Array.isArray(items) ? items : [];
  const media = allMedia.filter(m => m.mediaType === mediaType);
  const action = query.action;
  const tribeUrl = `/tribe/${encodeURIComponent(tribe.id)}`;
  const sectionKey = sectionKeyForMediaType[mediaType] || 'media';
  const sTitle = sectionTitleForMediaType(mediaType);
  const createMediaLabel = {
    image: () => i18n.tribeCreateImage || 'Create Image',
    audio: () => i18n.tribeCreateAudio || 'Create Audio',
    video: () => i18n.tribeCreateVideo || 'Create Video',
    document: () => i18n.tribeCreateDocument || 'Create Document',
    bookmark: () => i18n.tribeCreateBookmark || 'Create Bookmark',
  };
  const mediaBtnLabel = createMediaLabel[mediaType] ? createMediaLabel[mediaType]() : i18n.tribeCreateButton;

  if (action === 'create') {
    if (mediaType === 'bookmark') {
      return div({ class: 'create-tribe-form' },
        form({ method: 'POST', action: `${tribeUrl}/media/upload` },
          input({ type: 'hidden', name: 'mediaType', value: 'bookmark' }),
          input({ type: 'hidden', name: 'returnSection', value: sectionKey }),
          label({ for: 'title' }, i18n.tribeMediaTitle), br,
          input({ type: 'text', name: 'title', id: 'title', required: true, placeholder: i18n.tribeMediaTitle }), br(),
          label({ for: 'url' }, i18n.bookmarkUrlLabel || 'URL'), br,
          input({ type: 'url', name: 'url', id: 'url', required: true, placeholder: 'https://' }), br(),br(),
          label({ for: 'description' }, i18n.tribeMediaDescription), br,
          textarea({ name: 'description', id: 'description', rows: 3, placeholder: i18n.tribeMediaDescription }, ''), br(),
          button({ type: 'submit', class: 'create-button' }, mediaBtnLabel)
        )
      );
    }
    return div({ class: 'create-tribe-form' },
      form({ method: 'POST', action: `${tribeUrl}/media/upload`, enctype: 'multipart/form-data' },
        input({ type: 'hidden', name: 'mediaType', value: mediaType }),
        input({ type: 'hidden', name: 'returnSection', value: sectionKey }),
        label({ for: 'title' }, i18n.tribeMediaTitle), br,
        input({ type: 'text', name: 'title', id: 'title', required: true, placeholder: i18n.tribeMediaTitle }), br(),
        label({ for: 'description' }, i18n.tribeMediaDescription), br,
        textarea({ name: 'description', id: 'description', rows: 3, placeholder: i18n.tribeMediaDescription }, ''), br(),
        label({ for: 'media' }, i18n.tribeMediaUpload), br,
        input({ type: 'file', name: 'media', id: 'media', accept: acceptForMediaType[mediaType] || '*/*', required: true }), br(), br(),
        button({ type: 'submit', class: 'create-button' }, mediaBtnLabel)
      )
    );
  }

  const mediaFooter = (m) => [
    p({ class: 'tribe-media-date' }, span({ class: 'date-link' }, new Date(m.createdAt).toLocaleString())),
    p({ class: 'tribe-media-author' }, a({ href: `/author/${encodeURIComponent(m.author)}`, class: 'user-link' }, m.author)),
    m.author === userId ? form({ method: 'POST', action: `${tribeUrl}/content/delete/${encodeURIComponent(m.id)}` },
      button({ type: 'submit', class: 'tribe-action-btn' }, i18n.tribeContentDelete)
    ) : null
  ];

  const renderMediaItem = (m) => {
    const blobUrl = toBlobUrl(m.image);
    if (mediaType === 'image') {
      return div({ class: 'tribe-media-item' },
        blobUrl ? a({ href: blobUrl, target: '_blank' }, img({ src: blobUrl, alt: m.title || '', class: 'tribe-media-thumb' })) : null,
        div({ class: 'tribe-media-item-info' },
          m.title ? h2(m.title) : null,
          m.description ? p(...renderUrl(m.description)) : null,
          ...mediaFooter(m)
        )
      );
    }
    if (mediaType === 'audio') {
      return div({ class: 'tribe-media-item' },
        blobUrl ? audio({ src: blobUrl, controls: true, class: 'tribe-media-audio' }) : p(i18n.tribeMediaEmpty),
        div({ class: 'tribe-media-item-info' },
          m.title ? h2(m.title) : null,
          m.description ? p(...renderUrl(m.description)) : null,
          ...mediaFooter(m)
        )
      );
    }
    if (mediaType === 'video') {
      return div({ class: 'tribe-media-item' },
        blobUrl ? video({ src: blobUrl, controls: true, class: 'tribe-media-thumb' }) : p(i18n.tribeMediaEmpty),
        div({ class: 'tribe-media-item-info' },
          m.title ? h2(m.title) : null,
          m.description ? p(...renderUrl(m.description)) : null,
          ...mediaFooter(m)
        )
      );
    }
    if (mediaType === 'document') {
      return div({ class: 'tribe-media-item' },
        blobUrl ? a({ href: blobUrl, target: '_blank', class: 'tribe-action-btn' }, i18n.readDocument || 'Read Document') : p(i18n.tribeMediaEmpty),
        div({ class: 'tribe-media-item-info' },
          m.title ? h2(m.title) : null,
          m.description ? p(...renderUrl(m.description)) : null,
          ...mediaFooter(m)
        )
      );
    }
    if (mediaType === 'bookmark') {
      const url = m.url || m.description || '';
      return div({ class: 'tribe-media-item' },
        div({ class: 'tribe-media-item-info' },
          m.title ? h2(m.title) : null,
          url ? div({ class: 'card-field' },
            span({ class: 'card-label' }, 'URL:'),
            a({ href: url, target: '_blank', class: 'card-value' }, url)
          ) : null,
          m.description && m.description !== url ? p(...renderUrl(m.description)) : null,
          ...mediaFooter(m)
        )
      );
    }
    return null;
  };

  return div({ class: 'tribe-content-list' },
    div({ class: 'tribe-content-header' },
      h2(sTitle),
      form({ method: 'GET', action: tribeUrl },
        input({ type: 'hidden', name: 'section', value: sectionKey }),
        input({ type: 'hidden', name: 'action', value: 'create' }),
        button({ type: 'submit', class: 'create-button' }, mediaBtnLabel)
      )
    ),
    media.length === 0 ? p(i18n.tribeMediaEmpty) :
      div({ class: 'tribe-media-grid' }, media.map(renderMediaItem))
  );
};

const renderSubTribesSection = (tribe, items, query) => {
  const action = query.action;
  const canCreate = tribe.inviteMode === 'open'
    ? tribe.members.includes(userId)
    : tribe.author === userId;

  if (action === 'create' && canCreate) {
    return renderCreateForm(tribe, 'subtribes', [
      { name: 'title', label: i18n.tribeTitleLabel, required: true, placeholder: 'Name of the sub-tribe' },
      { name: 'description', type: 'textarea', label: i18n.tribeDescriptionLabel, required: true, placeholder: 'Description of the sub-tribe' },
      { name: 'location', label: i18n.tribeLocationLabel, placeholder: 'Where is this sub-tribe located?' },
      { name: 'image', type: 'file', label: i18n.tribeImageLabel },
      { name: 'tags', label: i18n.tribeTagsLabel, placeholder: i18n.tribeTagsPlaceholder, spaceBefore: true },
      { name: 'inviteMode', type: 'select', label: i18n.tribeModeLabel, options: [
        { value: 'open', label: i18n.tribeOpen }, { value: 'strict', label: i18n.tribeStrict }
      ], spaceBefore: true },
      { name: 'isAnonymous', type: 'select', label: i18n.tribeIsAnonymousLabel, options: [
        { value: 'true', label: i18n.tribePrivate }, { value: 'false', label: i18n.tribePublic }
      ], spaceBefore: true },
      { name: 'isLARP', type: 'select', label: 'L.A.R.P.?', options: [
        { value: 'false', label: i18n.tribeNo }, { value: 'true', label: i18n.tribeYes }
      ], spaceBefore: true },
    ]);
  }

  const subTribes = Array.isArray(items) ? items : [];
  const tribeUrl = `/tribe/${encodeURIComponent(tribe.id)}`;

  return div({ class: 'tribe-content-list' },
    canCreate ? form({ method: 'GET', action: tribeUrl },
      input({ type: 'hidden', name: 'section', value: 'subtribes' }),
      input({ type: 'hidden', name: 'action', value: 'create' }),
      button({ type: 'submit', class: 'tribe-action-btn' }, i18n.tribeSubTribesCreate)
    ) : null,
    subTribes.length === 0
      ? null
      : div({ class: 'tribe-thumb-grid' },
          subTribes.map(st => {
            return a({ href: `/tribe/${encodeURIComponent(st.id)}`, class: 'tribe-thumb-link', title: st.title },
              renderMediaBlob(st.image, '/assets/images/default-tribe.png', { class: 'tribe-thumb-img', alt: st.title })
            );
          })
        )
  );
};

exports.tribeView = async (tribe, userIdParam, query, section, sectionData) => {
  if (!tribe) {
    return div({ class: 'error' }, i18n.tribeNotFound);
  }

  section = section || 'activity';
  sectionData = sectionData || {};

  const imageSrc = tribe.image;
  const pageTitle = tribe.title;

  let sectionContent;
  switch (section) {
    case 'inhabitants': sectionContent = renderInhabitantsSection(tribe, sectionData); break;
    case 'feed':
      sectionContent = div(
        query.sent ? div({ class: 'card card-rpg', style: 'padding: 12px 16px; margin-bottom: 16px; text-align: center;' },
          p({ style: 'font-weight: bold;' }, i18n.tribeFeedSent || 'Message sent successfully!')
        ) : null,
        tribe.members.includes(config.keys.id)
          ? form({ class: 'tribe-feed-compose', method: 'POST', action: `/tribe/${encodeURIComponent(tribe.id)}/message` },
              textarea({ name: 'message', rows: 4, maxlength: MAX_MESSAGE_LENGTH, placeholder: i18n.tribeFeedMessagePlaceholder }),
              button({ type: 'submit', class: 'tribe-feed-send' }, i18n.tribeFeedSend)
            )
          : null,
        await renderFeedTribeView(sectionData, tribe, query, query.filter)
      );
      break;
    case 'events': sectionContent = renderEventsSection(tribe, sectionData, query); break;
    case 'tasks': sectionContent = renderTasksSection(tribe, sectionData, query); break;
    case 'votations': sectionContent = renderVotationsSection(tribe, sectionData, query); break;
    case 'forum': sectionContent = renderForumSection(tribe, sectionData, query); break;
    case 'subtribes': sectionContent = renderSubTribesSection(tribe, sectionData, query); break;
    case 'search': sectionContent = renderTribeSearchSection(tribe, sectionData, query); break;
    case 'images': sectionContent = renderTribeMediaTypeSection(tribe, sectionData, query, 'image'); break;
    case 'audios': sectionContent = renderTribeMediaTypeSection(tribe, sectionData, query, 'audio'); break;
    case 'videos': sectionContent = renderTribeMediaTypeSection(tribe, sectionData, query, 'video'); break;
    case 'documents': sectionContent = renderTribeMediaTypeSection(tribe, sectionData, query, 'document'); break;
    case 'bookmarks': sectionContent = renderTribeMediaTypeSection(tribe, sectionData, query, 'bookmark'); break;
    case 'activity':
    default: sectionContent = renderTribeActivitySection(tribe, sectionData); break;
  }

  const subTribes = Array.isArray(tribe.subTribes) ? tribe.subTribes : [];

  const tribeDetails = div({ class: 'tribe-details' },
    div({ class: 'tribe-side' },
      tribe.parentTribe
        ? div({ class: 'tribe-parent-box' },
            h2({ class: 'tribe-info-label' }, i18n.tribeMainTribeLabel || 'MAIN TRIBE'),
            a({ href: `/tribe/${encodeURIComponent(tribe.parentTribe.id)}`, class: 'tribe-parent-link' },
              img({ src: toBlobUrl(tribe.parentTribe.image) || '/assets/images/default-tribe.png', alt: tribe.parentTribe.title, class: 'tribe-parent-image' })
            )
          )
        : null,
      h2(tribe.title),
      renderMediaBlob(imageSrc, '/assets/images/default-tribe.png', { alt: tribe.title, class: 'tribe-detail-image' }),
      table({ class: 'tribe-info-table' },
        tr(
          td({ class: 'tribe-info-label' }, i18n.tribeCreatedAt || 'CREATED'),
          td({ class: 'tribe-info-value', colspan: '3' }, new Date(tribe.createdAt).toLocaleString())
        ),
        tr(
          td({ class: 'tribe-info-value', colspan: '4' }, a({ class: 'user-link', href: `/author/${encodeURIComponent(tribe.author)}` }, tribe.author))
        ),
        tribe.location ? tr(
          td({ class: 'tribe-info-label' }, i18n.tribeLocationLabel || 'LOCATION'),
          td({ class: 'tribe-info-value', colspan: '3' }, ...renderUrl(tribe.location))
        ) : null,
        tr(
          td({ class: 'tribe-info-label' }, i18n.tribeStatusLabel || 'STATUS'),
          td({ class: 'tribe-info-value' }, String(statusI18n()[tribe.status] || i18n.tribeStatusOpen).toUpperCase()),
          td({ class: 'tribe-info-label' }, i18n.tribeModeLabel || 'MODE'),
          td({ class: 'tribe-info-value' }, String(inviteModeI18n()[tribe.inviteMode] || tribe.inviteMode).toUpperCase())
        ),
        tr(
          td({ class: 'tribe-info-label' }, i18n.tribeLARPLabel || 'L.A.R.P.'),
          td({ class: 'tribe-info-value', colspan: '3' }, tribe.isLARP ? i18n.tribeYes : i18n.tribeNo)
        )
      ),
      h2({ class: 'tribe-members-count' }, `${i18n.tribeMembersCount}: ${tribe.members.length}`),
      !tribe.parentTribeId ? div({ class: 'tribe-side-subtribes' },
        (tribe.inviteMode === 'open' || tribe.author === userId)
          ? form({ method: 'GET', action: `/tribe/${encodeURIComponent(tribe.id)}` },
              input({ type: 'hidden', name: 'section', value: 'subtribes' }),
              input({ type: 'hidden', name: 'action', value: 'create' }),
              button({ type: 'submit', class: 'tribe-action-btn' }, i18n.tribeSubTribesCreate)
            )
          : null,
        subTribes.length > 0
          ? div({ class: 'tribe-subtribes-list' },
              subTribes.map(st =>
                form({ method: 'GET', action: `/tribe/${encodeURIComponent(st.id)}` },
                  button({ type: 'submit', class: 'tribe-subtribe-link' }, st.title)
                )
              )
            )
          : null
      ) : null,
      tribe.description ? p({ class: 'tribe-side-description' }, ...renderUrl(tribe.description)) : null,
      div({ class: 'tribe-side-actions' },
        form({ method: 'POST', action: '/tribes/generate-invite' },
          input({ type: 'hidden', name: 'tribeId', value: tribe.id }),
          button({ type: 'submit', class: 'tribe-action-btn' }, i18n.tribeGenerateInvite)
        ),
        tribe.author === userId
          ? form({ method: 'GET', action: `/tribes/edit/${encodeURIComponent(tribe.id)}` },
              button({ type: 'submit', class: 'tribe-action-btn' }, i18n.tribeUpdateButton)
            )
          : null,
        tribe.author === userId
          ? form({ method: 'POST', action: `/tribes/delete/${encodeURIComponent(tribe.id)}` },
              button({ type: 'submit', class: 'tribe-action-btn' }, i18n.tribeDeleteButton)
            )
          : null,
        tribe.author !== userId
          ? form({ method: 'POST', action: `/tribes/leave/${encodeURIComponent(tribe.id)}` },
              button({ type: 'submit', class: 'tribe-action-btn' }, i18n.tribeLeaveButton)
            )
          : null
      ),
      tribe.tags && tribe.tags.filter(Boolean).length ? div({ class: 'tribe-side-tags' }, tribe.tags.filter(Boolean).map(tag =>
        a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
      )) : null,
    ),
    div({ class: 'tribe-main' },
      query.inviteCode ? div({ class: 'card card-rpg', style: 'padding: 12px 16px; margin-bottom: 16px; text-align: center;' },
        p({ style: 'font-weight: bold;' }, i18n.tribeInviteCodeText, query.inviteCode)
      ) : null,
      renderSectionNav(tribe, section),
      sectionContent
    )
  );

  return template(
    pageTitle,
    tribeDetails
  );
};

