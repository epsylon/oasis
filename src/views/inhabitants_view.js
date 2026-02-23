const { div, h2, p, section, button, form, img, a, textarea, input, br, span, strong } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const { renderUrl } = require('../backend/renderUrl');
const { getConfig } = require('../configs/config-manager');

const DEFAULT_HASH_ENC = "%260000000000000000000000000000000000000000000%3D.sha256";
const DEFAULT_HASH_PATH_RE = /\/image\/\d+\/%260000000000000000000000000000000000000000000%3D\.sha256$/;

function isDefaultImageId(v){
  if (!v) return true;
  if (typeof v === 'string') {
    if (v === DEFAULT_HASH_ENC) return true;
    if (DEFAULT_HASH_PATH_RE.test(v)) return true;
  }
  return false;
}

function toImageUrl(imgId, size=256){
  if (!imgId || isDefaultImageId(imgId)) return '/assets/images/default-avatar.png';
  if (typeof imgId === 'string' && imgId.startsWith('/image/')) {
    return imgId.replace('/image/256/','/image/'+size+'/').replace('/image/512/','/image/'+size+'/');
  }
  return `/image/${size}/${encodeURIComponent(imgId)}`;
}

function extractAboutImageId(about){
  if (!about || typeof about !== 'object') return null;
  const aimg = about.image;
  if (!aimg) return null;
  if (typeof aimg === 'string') return aimg;
  return aimg.link || aimg.url || null;
}

function resolvePhoto(photoField, size = 256) {
  if (!photoField) return '/assets/images/default-avatar.png';
  if (typeof photoField === 'string') {
    if (photoField.startsWith('/assets/')) return photoField;
    if (photoField.startsWith('/blob/')) return photoField;
    if (photoField.startsWith('/image/')) {
      if (isDefaultImageId(photoField)) return '/assets/images/default-avatar.png';
      return photoField.replace('/image/256/','/image/'+size+'/').replace('/image/512/','/image/'+size+'/');
    }
  }
  return toImageUrl(photoField, size);
}

const generateFilterButtons = (filters, currentFilter) =>
  filters.map(mode =>
    form({ method: 'GET', action: '/inhabitants' },
      input({ type: 'hidden', name: 'filter', value: mode }),
      button({
        type: 'submit',
        class: currentFilter === mode ? 'filter-btn active' : 'filter-btn'
      }, i18n[mode + 'Button'] || i18n[mode + 'SectionTitle'] || mode)
    )
  );

function lastActivityBadge(user, isMe) {
  const bucket = user && user.lastActivityBucket;
  const dotClass =
    bucket === 'green' ? 'green' : bucket === 'orange' ? 'orange' : bucket === 'red' ? 'red' : null;
  if (!dotClass) return [];
  const items = [
    span({ class: 'inhabitant-last-activity' },
      `${i18n.inhabitantActivityLevel}: `,
      span({ class: `activity-dot ${dotClass}` }, '●'))
  ];
  const currentTheme = getConfig().themes.current;
  const src = isMe ? (currentTheme === 'OasisKIT' ? 'KIT' : currentTheme === 'OasisMobile' ? 'MOBILE' : 'DESKTOP') : (user && user.deviceSource) || null;
  if (src) {
    const upper = String(src).toUpperCase();
    const deviceClass = upper === 'KIT' ? 'device-kit' : upper === 'MOBILE' ? 'device-mobile' : 'device-desktop';
    items.push(span({ class: 'inhabitant-last-activity' },
      `${i18n.deviceLabel || 'Device'}: `,
      span({ class: deviceClass }, src)));
  }
  return [div({ class: 'inhabitant-activity-group' }, ...items)];
}

const lightboxId = (id) => 'inhabitant_' + String(id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');

const renderInhabitantCard = (user, filter, currentUserId) => {
  const isMe = user.id === currentUserId;
  return div({ class: 'inhabitant-card' },
    div({ class: 'inhabitant-left' },
      a(
         { href: `/author/${encodeURIComponent(user.id)}` },
         img({ class: 'inhabitant-photo-details', src: resolvePhoto(user.photo, 256), alt: user.name || 'Anonymous' })
      ),
      br(),
      span(`${i18n.bankingUserEngagementScore}: `),
      h2(strong(typeof user.karmaScore === 'number' ? user.karmaScore : 0)),
      ...lastActivityBadge(user, isMe)
    ),
    div({ class: 'inhabitant-details' },
      h2(user.name || 'Anonymous'),
      user.description ? p(...renderUrl(user.description)) : null,
      filter === 'MATCHSKILLS' && user.commonSkills?.length
        ? div({ class: 'matchskills' },
            p(`${i18n.commonSkills}: ${user.commonSkills.join(', ')}`),
            p(`${i18n.matchScore}: ${Math.round(user.matchScore * 100)}%`)
          )
        : null,
      filter === 'SUGGESTED' && user.mutualCount
        ? p(`${i18n.mutualFollowers}: ${user.mutualCount}`) : null,
      filter === 'blocked' && user.isBlocked
        ? p(i18n.blockedLabel) : null,
      p(a({ class: 'user-link', href: `/author/${encodeURIComponent(user.id)}` }, user.id)),
      user.ecoAddress
        ? div({ class: "eco-wallet" },
            p(`${i18n.bankWalletConnected}: `, strong(user.ecoAddress))
          )
        : div({ class: "eco-wallet" },
            p(i18n.ecoWalletNotConfigured || "ECOin Wallet not configured")
          ),
      div(
        { class: 'cv-actions' },
        !isMe
          ? form(
              { method: 'GET', action: `/inhabitant/${encodeURIComponent(user.id)}` },
              button({ type: 'submit', class: 'btn' }, i18n.inhabitantviewDetails)
            )
          : p(i18n.relationshipYou),
        !isMe
          ? form(
              { method: 'GET', action: '/pm' },
              input({ type: 'hidden', name: 'recipients', value: user.id }),
              button({ type: 'submit', class: 'btn' }, i18n.pmCreateButton)
            )
          : null
      )
    )
  );
};

const renderGalleryInhabitants = inhabitants =>
  div(
    { class: "gallery" },
    inhabitants.length
      ? inhabitants.map(u =>
          a({ href: `#${lightboxId(u.id)}`, class: "gallery-item" },
            img({ src: resolvePhoto(u.photo, 256), alt: u.name || "Anonymous", class: "gallery-image" })
          )
        )
      : p(i18n.noInhabitantsFound)
  );

const renderLightbox = inhabitants =>
  inhabitants.map(u =>
    div(
      { id: lightboxId(u.id), class: "lightbox" },
      a({ href: "#", class: "lightbox-close" }, "×"),
      img({ src: resolvePhoto(u.photo, 256), class: "lightbox-image", alt: u.name || "Anonymous" })
    )
  );

function stripAndCollectImgs(text) {
  if (!text || typeof text !== 'string') return { clean: '', imgs: [] };
  const imgs = [];
  let clean = text;
  const rawImgRe = /<img[^>]*src="([^"]+)"[^>]*>/gi;
  clean = clean.replace(rawImgRe, (_, src) => { imgs.push(src); return ''; });
  const encImgRe = /&lt;img[^&]*src=&quot;([^&]*)&quot;[^&]*&gt;/gi;
  clean = clean.replace(encImgRe, (_, src) => { imgs.push(src.replace(/&amp;/g, '&')); return ''; });
  return { clean, imgs };
}

function msgIdOf(m) {
  return m && (m.key || m.value?.key || m.value?.content?.root || m.value?.content?.branch || null);
}

exports.inhabitantsView = (inhabitants, filter, query, currentUserId) => {
  const title = filter === 'contacts'    ? i18n.yourContacts
               : filter === 'CVs'         ? i18n.allCVs
               : filter === 'MATCHSKILLS' ? i18n.matchSkills
               : filter === 'SUGGESTED'   ? i18n.suggestedSectionTitle
               : filter === 'blocked'     ? i18n.blockedSectionTitle
               : filter === 'GALLERY'     ? i18n.gallerySectionTitle
               : filter === 'TOP KARMA'    ? i18n.topkarmaSectionTitle
               : filter === 'TOP ACTIVITY' ? i18n.topactivitySectionTitle
               : i18n.allInhabitants;

  const showCVFilters = filter === 'CVs' || filter === 'MATCHSKILLS';
  const filters = ['all', 'TOP ACTIVITY', 'TOP KARMA', 'contacts', 'SUGGESTED', 'blocked', 'CVs', 'MATCHSKILLS', 'GALLERY'];

  return template(
    title,
    section(
      div({ class: 'tags-header' },
        h2(title),
        p(i18n.discoverPeople)
      ),
      div({ class: 'filters' },
        form({ method: 'GET', action: '/inhabitants' },
          input({ type: 'hidden', name: 'filter', value: filter }),
          input({
            type: 'text',
            name: 'search',
            placeholder: i18n.searchInhabitantsPlaceholder,
            value: (query && query.search) || ''
          }),
          showCVFilters
            ? [
                input({ type: 'text', name: 'location', placeholder: i18n.filterLocation, value: (query && query.location) || '' }),
                input({ type: 'text', name: 'language', placeholder: i18n.filterLanguage, value: (query && query.language) || '' }),
                input({ type: 'text', name: 'skills', placeholder: i18n.filterSkills, value: (query && query.skills) || '' })
              ]
            : null,
          br(),
          button({ type: 'submit' }, i18n.applyFilters)
        )
      ),
      div({ class: 'inhabitant-action' },
        ...generateFilterButtons(filters, filter)
      ),
      filter === 'GALLERY'
        ? renderGalleryInhabitants(inhabitants)
        : div({ class: 'inhabitants-list' },
            inhabitants.length
              ? inhabitants.map(user => renderInhabitantCard(user, filter, currentUserId))
              : p({ class: 'no-results' }, i18n.noInhabitantsFound)
          ),
      ...renderLightbox(inhabitants)
    )
  );
};

exports.inhabitantsProfileView = (payload, currentUserId) => {
  const safe = payload && typeof payload === 'object' ? payload : {};
  const about = (safe.about && typeof safe.about === 'object') ? safe.about : {};
  const cv = (safe.cv && typeof safe.cv === 'object') ? safe.cv : {};
  const feed = Array.isArray(safe.feed) ? safe.feed : [];

  const viewedId = typeof safe.viewedId === 'string' ? safe.viewedId : '';
  const id = (cv && cv.author) || (about && about.about) || viewedId || '';
  const baseName = ((cv && cv.name) || (about && about.name) || '').trim();
  const name = baseName || (i18n.unnamed || 'Anonymous');
  const description = (cv && cv.description) || (about && about.description) || '';

  const listPhoto = (typeof safe.photo === 'string' && safe.photo.trim()) ? safe.photo : null;
  const rawCandidate = listPhoto || extractAboutImageId(about) || (cv && cv.photo) || null;
  const image = (
    typeof rawCandidate === 'string' &&
    rawCandidate.startsWith('/image/') &&
    !DEFAULT_HASH_PATH_RE.test(rawCandidate) &&
    rawCandidate.indexOf(DEFAULT_HASH_ENC) === -1
  )
    ? rawCandidate.replace('/image/512/','/image/256/').replace('/image/1024/','/image/256/')
    : resolvePhoto(rawCandidate, 256);

  const location = (cv && cv.location) || '';
  const languages = typeof (cv && cv.languages) === 'string'
    ? (cv.languages || '').split(',').map(x => x.trim()).filter(Boolean)
    : Array.isArray(cv && cv.languages) ? cv.languages : [];
  const skills = [
    ...((cv && cv.personalSkills) || []),
    ...((cv && cv.oasisSkills) || []),
    ...((cv && cv.educationalSkills) || []),
    ...((cv && cv.professionalSkills) || [])
  ];
  const status = (cv && cv.status) || '';
  const preferences = (cv && cv.preferences) || '';
  const createdAt = (cv && cv.createdAt) ? new Date(cv.createdAt).toLocaleString() : '';
  const isMe = id && id === currentUserId;
  const title = i18n.inhabitantProfileTitle || i18n.inhabitantviewDetails;
  const karmaScore = typeof safe.karmaScore === 'number' ? safe.karmaScore : 0;

  const providedBucket = typeof safe.lastActivityBucket === 'string' ? safe.lastActivityBucket : null;
  const dotClass = providedBucket === 'green' ? 'green' : providedBucket === 'orange' ? 'orange' : 'red';

  const detailNodes = [
    description ? p(...renderUrl(description)) : null,
    location ? p(`${i18n.locationLabel}: ${location}`) : null,
    languages.length ? p(`${i18n.languagesLabel}: ${languages.join(', ').toUpperCase()}`) : null,
    skills.length ? p(`${i18n.skillsLabel}: ${skills.join(', ')}`) : null,
    status ? p(`${i18n.statusLabel || 'Status'}: ${status}`) : null,
    preferences ? p(`${i18n.preferencesLabel || 'Preferences'}: ${preferences}`) : null,
    createdAt ? p(`${i18n.createdAtLabel || 'Created at'}: ${createdAt}`) : null
  ].filter(Boolean);

  return template(
    name,
    section(
      div({ class: 'tags-header' },
        h2(title),
        p(i18n.discoverPeople)
      ),
      div({ class: 'mode-buttons' },
        ...generateFilterButtons(['all', 'TOP ACTIVITY', 'TOP KARMA', 'contacts', 'SUGGESTED', 'blocked', 'CVs', 'MATCHSKILLS', 'GALLERY'], 'all')
      ),
      div({ class: 'inhabitant-card' },
        div({ class: 'inhabitant-left' },
          img({ class: 'inhabitant-photo-details', src: image, alt: name || 'Anonymous' }),
          h2(name || 'Anonymous'),
          span(`${i18n.bankingUserEngagementScore}: `),
          h2(strong(karmaScore)),
          ...lastActivityBadge({ lastActivityBucket: dotClass, deviceSource: safe.deviceSource }, isMe),
          (!isMe && (id || viewedId))
            ? form(
                { method: 'GET', action: '/pm' },
                input({ type: 'hidden', name: 'recipients', value: id || viewedId }),
                button({ type: 'submit', class: 'btn' }, i18n.pmCreateButton)
              )
            : null
        ),
        detailNodes.length ? div({ class: 'inhabitant-details' }, ...detailNodes) : null
      ),
      feed.length
        ? section({ class: 'profile-feed' },
            h2(i18n.latestInteractions),
            ...feed.map(m => {
              const raw = (m.value?.content?.text || '').replace(/<br\s*\/?>/g, '');
              const parts = stripAndCollectImgs(raw);
              const tid = msgIdOf(m);
              const visitBtn = tid
                ? form({ method: 'GET', action: `/thread/${encodeURIComponent(tid)}#${encodeURIComponent(tid)}` },
                    button({ type:'submit', class:'filter-btn' }, i18n.visitContent)
                  )
                : null;
              return div({ class: 'post' },
                visitBtn,
                parts.clean && parts.clean.trim() ? p(...renderUrl(parts.clean)) : null,
                ...(parts.imgs || []).map(src => img({ src, class: 'post-image', alt: 'image' }))
              );
            })
          )
        : null
    )
  );
};

exports.lastActivityBadge = lastActivityBadge;
