const { div, h2, p, section, button, form, img, a, textarea, input, span, strong } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink, renderUserSensors, renderContentActions, renderRelationshipBlock } = require('./main_views');
const { renderZoomableImage } = require('./gallery_view');
const { renderContentStats } = require('./clearnet_view');
const { renderUrl } = require('../backend/renderUrl');
const { getConfig } = require('../configs/config-manager');

const DEFAULT_HASH_ENC = "%260000000000000000000000000000000000000000000%3D.sha256";
const DEFAULT_HASH_PATH_RE = /\/image\/\d+\/%260000000000000000000000000000000000000000000%3D\.sha256$/;

const formatCarbonValue = (g) => {
  const n = Number(g) || 0;
  if (!n) return '0 µg CO₂';
  if (n >= 1) return `${n.toFixed(2)} g CO₂`;
  const mg = n * 1000;
  if (mg >= 1) return `${mg.toFixed(2)} mg CO₂`;
  return `${(mg * 1000).toFixed(2)} µg CO₂`;
};

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
      return photoField.replace('/image/256/','/image/'+size+'/').replace('/image/512/','/image/'+size+'/') + '?fallback=avatar';
    }
  }
  return toImageUrl(photoField, size) + '?fallback=avatar';
}

const filterLabel = (mode) =>
  String(i18n[mode + 'Button'] || i18n[mode + 'SectionTitle'] || mode).toUpperCase();

const generateFilterButtons = (filters, currentFilter, labelOf = filterLabel) =>
  filters.map(mode =>
    form({ method: 'GET', action: '/inhabitants' },
      input({ type: 'hidden', name: 'filter', value: mode }),
      button({
        type: 'submit',
        class: currentFilter === mode ? 'filter-btn active' : 'filter-btn'
      }, labelOf(mode))
    )
  );

const MAIN_FILTERS = ['all', 'TOP', 'contacts', 'blocked', 'CVs', 'SUGGESTED', 'GALLERY'];

const renderMainFilters = (filter, isTop) =>
  div({ class: 'inhabitant-action' },
    ...MAIN_FILTERS.map(mode =>
      form({ method: 'GET', action: '/inhabitants' },
        input({ type: 'hidden', name: 'filter', value: mode === 'TOP' ? 'TOP ACTIVITY' : mode }),
        button({
          type: 'submit',
          class: (mode === 'TOP' ? isTop : filter === mode) ? 'filter-btn active' : 'filter-btn'
        }, mode === 'TOP'
            ? String(i18n.topSectionTitle || 'TOP').toUpperCase()
            : filterLabel(mode))
      )
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
  const src = isMe ? (currentTheme === 'OasisKIT' ? 'KIT' : (currentTheme === 'OasisMobile' || process.env.OASIS_MOBILE === '1') ? 'MOBILE' : 'DESKTOP') : (user && user.deviceSource) || null;
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

const cvField = (labelText, value) => value
  ? div({ class: 'card-field' },
      span({ class: 'card-label' }, `${labelText}: `),
      span({ class: 'card-value' }, value)
    )
  : null;

const renderCvFields = (user) => {
  const languages = Array.isArray(user.languages) ? user.languages.filter(Boolean) : [];
  const skills = Array.isArray(user.skills) ? user.skills.filter(Boolean) : [];
  const fields = [
    cvField(i18n.locationLabel, user.location),
    cvField(i18n.languagesLabel, languages.length ? languages.join(', ').toUpperCase() : ''),
    cvField(i18n.skillsLabel, skills.length ? skills.join(', ') : ''),
    cvField(i18n.statusLabel || 'Status', user.status),
    cvField(i18n.preferencesLabel || 'Preferences', user.preferences),
    cvField(i18n.createdAtLabel || 'Created at', user.createdAt ? new Date(user.createdAt).toLocaleString() : '')
  ].filter(Boolean);
  return fields.length ? div({ class: 'cv-card-fields' }, ...fields) : null;
};

const renderInhabitantCard = (user, filter, currentUserId, fediverseConfigured) => {
  const isMe = user.id === currentUserId;
  const raw = user.visibilityPrefs || {};
  const clearnetSubKeys = ['clearnetShops','clearnetJobs','clearnetEvents','clearnetProjects','clearnetPosts','clearnetAudios','clearnetVideos','clearnetImages','clearnetDocuments','clearnetTorrents','clearnetBookmarks'];
  const hasClearnet = raw.clearnet === true || clearnetSubKeys.some(k => raw[k] === true);
  const prefs = {
    activity: raw.activity === true,
    device:   raw.device   === true,
    karma:    raw.karma !== false,
    ubi:      raw.ubi      === true,
    wallet:   raw.wallet   === true,
    ecoTax:   raw.ecoTax   !== false,
    larpSign: raw.larpSign === true,
    gpg:      raw.gpg      === true,
    clearnet: hasClearnet,
    fediverse: raw.fediverse === true,
    fediverseHandle: typeof raw.fediverseHandle === 'string' ? raw.fediverseHandle : ''
  };
  return div({ class: 'trending-card inhabitants-card' + (isMe ? ' own-content' : '') },
    div(
      { class: 'card-header activity-card-header' },
      span(),
      renderContentActions(user.id, `/inhabitant/${encodeURIComponent(user.id)}`, { author: user.id })
    ),
    div({ class: 'card-section inhabitants-card-body' },
      div({ class: 'inhabitant-card' },
    div({ class: 'inhabitant-left' },
      a(
         { href: `/author/${encodeURIComponent(user.id)}` },
         img({ class: 'inhabitant-photo-details', src: resolvePhoto(user.photo, 256), alt: user.name || 'Anonymous' })
      ),
      ...renderUserSensors({
        isMe, fediverseConfigured, prefs, id: user.id,
        karmaScore: user.karmaScore, carbonGrams: user.carbonGrams,
        deviceSource: user.deviceSource, activityBucket: user.lastActivityBucket,
        gpgFingerprint: user.gpgFingerprint, ecoAddress: user.ecoAddress,
        estimatedUBI: user.estimatedUBI, lastClaimedDate: user.lastClaimedDate, totalClaimed: user.totalClaimed,
        larpHouse: user.larpHouse, stats: user.stats
      }, { relationshipNode: isMe ? span({ class: 'status you' }, i18n.relationshipYou) : null, excludeContent: true }),
      filter === 'CVs'
        ? div(
            { class: 'cv-actions doc-export-actions' },
            form(
              { method: 'GET', action: `/cv/pdf/${encodeURIComponent(user.id)}` },
              button({ type: 'submit', class: 'filter-btn' }, i18n.generatePdf)
            ),
            form(
              { method: 'POST', action: `/cv/share/${encodeURIComponent(user.id)}` },
              button({ type: 'submit', class: 'filter-btn' }, i18n.sharePm)
            )
          )
        : null,
      !isMe
        ? div(
            { class: 'inhabitant-user-actions' },
            div({ class: 'inhabitant-relationship' }, renderRelationshipBlock(user.relationship || {}, user.id))
          )
        : null
    ),
    div({ class: 'inhabitant-details' },
      h2(user.name || 'Anonymous'),
      user.description ? p(...renderUrl(user.description)) : null,
      filter === 'CVs' ? renderCvFields(user) : null,
      filter === 'SUGGESTED' && (user.followsYou || user.commonSkills?.length || user.mutualCount)
        ? div({ class: 'suggested-meta' },
            user.followsYou ? span({ class: 'suggested-badge' }, i18n.suggestedFollowsYou || 'Follows you') : null,
            user.commonSkills?.length
              ? p(`${i18n.commonSkills || 'Common skills'}: ${user.commonSkills.join(', ')}`)
              : null,
            user.mutualCount ? p(`${i18n.mutualFollowers}: ${user.mutualCount}`) : null
          )
        : null,
      filter === 'blocked' && user.isBlocked
        ? p(i18n.blockedLabel) : null,
      p(userLink(user.id)),
      renderContentStats(user.stats, i18n)
    )
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

exports.inhabitantsView = (inhabitants, filter, query, currentUserId, fediverseConfigured) => {
  const title = i18n.allInhabitants;

  const showCVFilters = filter === 'CVs';
  const TOP_FILTERS = ['TOP ACTIVITY', 'TOP INACTIVITY', 'TOP KARMA', 'TOP ECO'];
  const isTop = TOP_FILTERS.includes(filter);

  return template(
    title,
    section(
      div({ class: 'tags-header module-header-line' },
        h2(title),
        p(i18n.discoverPeople)
      ),
      renderMainFilters(filter, isTop),
      isTop
        ? div({ class: 'inhabitant-action inhabitant-subfilters' },
            ...generateFilterButtons(TOP_FILTERS, filter, (mode) => filterLabel(mode).replace(/^TOP\s+/, ''))
          )
        : null,
      div({ class: 'filters activity-filter-chips activity-toolbar-row' },
        form({ method: 'GET', action: '/inhabitants', class: 'filter-box' },
          input({ type: 'hidden', name: 'filter', value: filter }),
          input({
            type: 'text',
            name: 'search',
            placeholder: i18n.searchInhabitantsPlaceholder,
            value: (query && query.search) || '',
            class: 'filter-box__input'
          }),
          div({ class: 'filter-box__controls' },
            showCVFilters
              ? [
                  input({ type: 'text', name: 'location', placeholder: i18n.filterLocation, value: (query && query.location) || '', class: 'filter-box__number' }),
                  input({ type: 'text', name: 'language', placeholder: i18n.filterLanguage, value: (query && query.language) || '', class: 'filter-box__number' }),
                  input({ type: 'text', name: 'skills', placeholder: i18n.filterSkills, value: (query && query.skills) || '', class: 'filter-box__number' })
                ]
              : null,
            button({ type: 'submit', class: 'filter-box__button' }, i18n.searchButton)
          )
        )
      ),
      filter === 'GALLERY'
        ? renderGalleryInhabitants(inhabitants)
        : div({ class: 'inhabitants-list' },
            inhabitants.length
              ? inhabitants.map(user => renderInhabitantCard(user, filter, currentUserId, fediverseConfigured))
              : p({ class: 'no-results' }, i18n.noInhabitantsFound)
          ),
      ...renderLightbox(inhabitants)
    )
  );
};

exports.inhabitantsProfileView = (payload, currentUserId, fediverseConfigured) => {
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
  const estimatedUBI = typeof safe.estimatedUBI === 'number' ? safe.estimatedUBI : 0;
  const lastClaimedDate = safe.lastClaimedDate || null;
  const totalClaimed = typeof safe.totalClaimed === 'number' ? safe.totalClaimed : 0;
  const ecoAddress = typeof safe.ecoAddress === 'string' ? safe.ecoAddress : null;
  const rawPrefs = safe.visibilityPrefs || {};
  const clearnetSubKeys = ['clearnetShops','clearnetJobs','clearnetEvents','clearnetProjects','clearnetPosts','clearnetAudios','clearnetVideos','clearnetImages','clearnetDocuments','clearnetTorrents','clearnetBookmarks'];
  const prefs = {
    activity: rawPrefs.activity === true,
    device:   rawPrefs.device   === true,
    karma:    rawPrefs.karma !== false,
    ubi:      rawPrefs.ubi      === true,
    wallet:   rawPrefs.wallet   === true,
    ecoTax:   rawPrefs.ecoTax   !== false,
    larpSign: rawPrefs.larpSign === true,
    gpg:      rawPrefs.gpg      === true,
    clearnet: rawPrefs.clearnet === true || clearnetSubKeys.some(k => rawPrefs[k] === true),
    fediverse: rawPrefs.fediverse === true,
    fediverseHandle: typeof rawPrefs.fediverseHandle === 'string' ? rawPrefs.fediverseHandle : ''
  };
  const gpgFingerprint = String(safe.gpgFingerprint || '');
  const carbonGrams = typeof safe.carbonGrams === 'number' ? safe.carbonGrams : 0;
  const larpHouse = (safe.larpHouse && safe.larpHouse.key) ? safe.larpHouse : null;

  const providedBucket = typeof safe.lastActivityBucket === 'string' ? safe.lastActivityBucket : null;
  const dotClass = providedBucket === 'green' ? 'green' : providedBucket === 'orange' ? 'orange' : 'red';

  const fieldNodes = [
    cvField(i18n.locationLabel, location),
    cvField(i18n.languagesLabel, languages.length ? languages.join(', ').toUpperCase() : ''),
    cvField(i18n.skillsLabel, skills.length ? skills.join(', ') : ''),
    cvField(i18n.statusLabel || 'Status', status),
    cvField(i18n.preferencesLabel || 'Preferences', preferences),
    cvField(i18n.createdAtLabel || 'Created at', createdAt)
  ].filter(Boolean);

  const detailNodes = [
    description ? p(...renderUrl(description)) : null,
    fieldNodes.length ? div({ class: 'cv-card-fields' }, ...fieldNodes) : null
  ].filter(Boolean);

  return template(
    name,
    section(
      div({ class: 'tags-header module-header-line' },
        h2(title),
        p(i18n.discoverPeople)
      ),
      renderMainFilters('all', false),
      div({ class: 'inhabitant-card' },
        div({ class: 'inhabitant-left' },
          img({ class: 'inhabitant-photo-details', src: image, alt: name || 'Anonymous' }),
          h2(name || 'Anonymous'),
          safe.oasisVersion ? div({ class: 'profile-side-version' }, '🌴 ' + (i18n.oasisVersionLabel || 'Oasis Version') + ': ', strong(safe.oasisVersion)) : null,
          ...renderUserSensors({
            isMe, fediverseConfigured, prefs, id: id || viewedId,
            karmaScore, carbonGrams, deviceSource: safe.deviceSource, activityBucket: providedBucket,
            gpgFingerprint, ecoAddress, estimatedUBI, lastClaimedDate, totalClaimed,
            larpHouse, stats: safe.stats
          }, { excludeContent: true }),
          (!isMe && (id || viewedId))
            ? div({ class: 'cv-actions doc-export-actions' },
                form(
                  { method: 'GET', action: '/pm' },
                  input({ type: 'hidden', name: 'recipients', value: id || viewedId }),
                  button({ type: 'submit', class: 'filter-btn' }, i18n.pmCreateButton)
                )
              )
            : null,
          (!isMe && (id || viewedId) && safe.relationship)
            ? div({ class: 'inhabitant-relationship' }, renderRelationshipBlock(safe.relationship, id || viewedId))
            : null
        ),
        (() => {
          const feedNodes = feed.length
            ? [ section({ class: 'profile-feed' },
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
                      ...(parts.imgs || []).map(src => renderZoomableImage(src, { imgClass: 'post-image', alt: 'image' }))
                    );
                  })
                ) ]
            : [];
          const contentStatsNode = renderContentStats(safe.stats, i18n);
          const rightNodes = [...detailNodes, contentStatsNode, ...feedNodes].filter(Boolean);
          return rightNodes.length ? div({ class: 'inhabitant-details' }, ...rightNodes) : null;
        })()
      )
    )
  );
};

exports.lastActivityBadge = lastActivityBadge;
exports.resolvePhoto = resolvePhoto;
