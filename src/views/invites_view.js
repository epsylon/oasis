const { form, button, div, h2, h3, p, section, a, br, input, label, table, tr, td, textarea } = require("../server/node_modules/hyperaxe");
const moment = require("../server/node_modules/moment");
const path = require("path");
const fs = require('fs');
const { renderStyledText } = require("../backend/renderStyledText");
const { template, i18n } = require('./main_views');

const gossipPath = path.join(require("../server/ssb_config").path, "gossip.json");
const unfollowedPath = require("../configs/state-manager").statePath("gossip_unfollowed.json");
const peerHealth = require("../models/peer_health");

const encodePubLink = (key) => {
  let core = String(key).replace(/^@/, '').replace(/\.ed25519$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!core.endsWith('=')) core += '=';
  return `/author/${encodeURIComponent('@' + core)}.ed25519`;
};

const INVITE_KIND_LABEL = {
  tribes: 'invitesTribesTitle',
  houses: 'invitesHousesTitle',
  chats: 'invitesChatsTitle',
  pads: 'invitesPadsTitle',
  rooms: 'invitesRoomsTitle',
  calendars: 'invitesCalendarsTitle',
  events: 'invitesEventsTitle',
  forum: 'invitesForumsTitle',
  school: 'invitesSchoolTitle',
  maps: 'invitesMapsTitle',
  shops: 'invitesShopsTitle',
  inhabitants: 'invitesInhabitantsTitle',
  pubs: 'invitesPubsTitle'
};

const deduplicateByHost = (list) => {
  const seen = new Set();
  return list.filter(p => {
    const host = (p.host || '').replace(/:\d+$/, '');
    if (!host || seen.has(host)) return false;
    seen.add(host);
    return true;
  });
};

const renderSuggestedPub = (entry, canJoin) => div({ class: 'snh-invite-box' },
  h3({ class: 'snh-invite-name' }, entry.name),
  p({ class: 'snh-invite-name' }, entry.description),
  p({ class: 'snh-invite-name' }, renderStyledText(entry.url)),
  entry.createdAt ? p({ class: 'snh-invite-date' }, `${i18n.statsCreatedAt || 'Created'}: ${moment(entry.createdAt).format("YYYY/MM/DD")}`) : null,
  p({ class: 'snh-invite-name snh-invite-code' }, entry.code),
  entry.invites ? p({ class: 'snh-invite-date' }, `${i18n.invitesPubUses}: ${entry.invites.used}/${entry.invites.total}`) : null,
  entry.exhausted
    ? p({ class: 'snh-invite-name' }, i18n.invitesPubExhausted)
    : canJoin
      ? form({ action: '/settings/invite/accept', method: 'post' },
          input({ type: 'hidden', name: 'invite', value: entry.code }),
          button({ type: 'submit' }, i18n.invitesAcceptInvite)
        )
      : null
);

const invitesView = (opts = {}) => {
  const canJoin = opts.canJoin !== false;
  let pubs = [];
  let pubsValue = "false";
  let unfollowed = [];

  try {
    pubs = fs.readFileSync(gossipPath, "utf8");
  } catch {
    pubs = '[]';
  }

  try {
    pubs = JSON.parse(pubs);
    pubsValue = Array.isArray(pubs) && pubs.length > 0 ? "true" : "false";
  } catch {
    pubsValue = "false";
    pubs = [];
  }

  try {
    unfollowed = JSON.parse(fs.readFileSync(unfollowedPath, "utf8") || "[]");
  } catch {
    unfollowed = [];
  }

  const filteredPubs = pubsValue === "true"
    ? deduplicateByHost(pubs.filter(pubItem => !unfollowed.find(u => u.key === pubItem.key)))
    : [];

  const deadKeys = opts.deadKeys instanceof Set ? opts.deadKeys : new Set();
  const hasError = (pubItem) => !!(pubItem && deadKeys.has(peerHealth.canonicalKey(pubItem.key)));

  const pubTableHeader = () => tr(
    td({ class: 'card-label' }, 'PUB'),
    td({ class: 'card-label' }, i18n.invitesPort || 'Port'),
    td({ class: 'card-label' }, 'Key'),
    td({ class: 'card-label' }, '')
  );

  const activePubs = filteredPubs.filter(pubItem => !hasError(pubItem));
  const filter = opts.filter === 'others' ? 'others' : 'pubs';
  const suggested = Array.isArray(opts.inviteCodes) ? opts.inviteCodes : [];
  const used = (Array.isArray(opts.invitesUsed) ? opts.invitesUsed : []).filter((e) => e && typeof e.href === 'string' && e.href.startsWith('/'));

  const renderPubTable = (items, actionFn) => table({ class: 'block-info-table invites-pubs-table' },
    pubTableHeader(),
    items.map(pubItem => tr(
      td(pubItem.host || '—'),
      td(String(pubItem.port || 8008)),
      td(a({ href: encodePubLink(pubItem.key), class: 'user-link' }, pubItem.key)),
      td(actionFn(pubItem))
    ))
  );

  const title = i18n.invites;
  const description = i18n.invitesDescription;

  return template(
    title,
    section(
      div({ class: 'tags-header module-header-line' },
        h2(title),
        p(description)
      ),
      div({ class: 'mode-buttons-row' },
        a({ class: filter === 'pubs' ? 'filter-btn active' : 'filter-btn', href: '/invites?filter=pubs' }, String(i18n.invitesPubsTitle).toUpperCase()),
        a({ class: filter === 'others' ? 'filter-btn active' : 'filter-btn', href: '/invites?filter=others' }, String(i18n.invitesFilterOthers).toUpperCase())
      )
    ),
    filter === 'pubs' && suggested.length ? section(
      div({ class: 'pubs-section' },
        h2(`${i18n.invitesSuggestedPubs} (${suggested.length})`),
        ...suggested.map((entry) => renderSuggestedPub(entry, canJoin))
      )
    ) : null,
    filter === 'pubs' ? section(
      div({ class: 'pubs-section' },
        h2(i18n.invitesPubsTitle),
        p(i18n.invitesPubsHint),
        canJoin
          ? form(
              { action: '/settings/invite/accept', method: 'post' },
              input({ name: 'invite', type: 'text', placeholder: i18n.invitesPubInviteCodePlaceholder, autofocus: true, required: true }),
              br(),
              button({ type: 'submit' }, i18n.invitesAcceptInvite)
            )
          : p({ class: 'invites-join-note' }, opts.publicMode === true ? i18n.invitesJoinPubMode : i18n.invitesJoinLocalOnly)
      )
    ) : null,
    filter === 'pubs' ? section(
      div({ class: 'federations-section' },
        h2(i18n.invitesFederationsTitle || 'Federations'),
        p(i18n.invitesFederationsHint),
        div({ class: 'conn-actions invites-pubs-actions' },
          form({ action: '/invites/refresh-pubs', method: 'post' }, button({ type: 'submit' }, i18n.invitesPubsRefresh || 'Refresh')),
          form({ action: '/invites/clear-unreachable', method: 'post' }, button({ type: 'submit' }, i18n.invitesPubsClearUnreachable || 'Clean')),
          form({ action: '/invites/export-pubs', method: 'get' }, button({ type: 'submit' }, i18n.invitesPubsExport || 'Export'))
        ),
        h2(`${i18n.invitesAcceptedInvites} (${activePubs.length})`),
        activePubs.length
          ? renderPubTable(activePubs, pubItem =>
              form({ action: '/settings/invite/unfollow', method: 'post' },
                input({ type: 'hidden', name: 'key', value: pubItem.key }),
                button({ type: 'submit' }, i18n.invitesUnfollow)
              )
            )
          : p(i18n.invitesNoFederatedPubs),
        h2(`${i18n.invitesUnfollowedInvites} (${unfollowed.length})`),
        unfollowed.length
          ? renderPubTable(unfollowed, pubItem =>
              form({ action: '/settings/invite/follow', method: 'post' },
                input({ type: 'hidden', name: 'key', value: pubItem.key }),
                input({ type: 'hidden', name: 'host', value: pubItem.host || '' }),
                input({ type: 'hidden', name: 'port', value: String(pubItem.port || 8008) }),
                button({ type: 'submit', disabled: hasError(pubItem) }, i18n.invitesFollow)
              )
            )
          : p(i18n.invitesNoUnfollowed),
        form(
          { action: '/invites/import-pubs', method: 'post', enctype: 'multipart/form-data', class: 'peers-import-form' },
          label({ class: 'peers-import-label' }, i18n.invitesPubsImportTitle || 'Import pubs'),
          br(),
          textarea({ name: 'peerList', rows: '4', placeholder: i18n.invitesPubsImportPlaceholder || 'Paste one multiserver address or invite code per line…' }),
          br(),
          input({ type: 'file', name: 'peerFile', accept: '.txt,text/plain' }),
          br(),
          button({ type: 'submit' }, i18n.invitesPubsImport || 'Import')
        )
      )
    ) : null,
    filter === 'others' ? section(
      div(
        h2(i18n.invitesJoinTitle),
        p(i18n.invitesJoinHint),
        form(
          { action: '/invites/join', method: 'post' },
          input({ name: 'code', type: 'text', placeholder: i18n.invitesJoinPlaceholder, required: true }),
          br(),
          button({ type: 'submit' }, i18n.invitesJoinButton)
        ),
        h2(`${i18n.invitesUsedTitle} (${used.length})`),
        used.length
          ? table({ class: 'block-info-table invites-used-table' },
              tr(
                td({ class: 'card-label' }, i18n.invitesUsedType),
                td({ class: 'card-label' }, i18n.invitesUsedName),
                td({ class: 'card-label' }, i18n.invitesUsedDate)
              ),
              used.map((entry) => tr(
                td(INVITE_KIND_LABEL[entry.kind] ? i18n[INVITE_KIND_LABEL[entry.kind]] : entry.kind),
                td(a({ href: entry.href }, entry.title || entry.href)),
                td(moment(entry.at).format('YYYY/MM/DD HH:mm'))
              ))
            )
          : p(i18n.invitesUsedEmpty)
      )
    ) : null,
    filter === 'others' ? section(
      div(
        h2(i18n.peers || 'Peers'),
        p(i18n.directConnectDescription),
        form({ action: '/peers/connect', method: 'post' },
          input({ type: 'text', id: 'peer_host', name: 'host', required: true, placeholder: '192.168.1.100', pattern: '(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|[a-zA-Z0-9]([a-zA-Z0-9\\-]*[a-zA-Z0-9])?(\\.[a-zA-Z0-9]([a-zA-Z0-9\\-]*[a-zA-Z0-9])?)*)', title: i18n.peerHostValidation || 'Valid IPv4 (e.g. 192.168.1.100) or hostname (e.g. pub.solarnethub.com)', maxlength: 253 }),
          br(),
          label({ for: 'peer_port' }, i18n.peerPort),
          br(),
          input({ type: 'number', id: 'peer_port', name: 'port', placeholder: '8008', value: '8008', min: 1, max: 65535, required: true, title: i18n.peerPortValidation || 'Port 1-65535' }),
          br(), br(),
          label({ for: 'peer_key' }, i18n.peerPublicKey),
          br(),
          input({ type: 'text', id: 'peer_key', name: 'key', required: true, placeholder: '@...=.ed25519', pattern: '@[A-Za-z0-9+/_\\-]{43}=\\.ed25519', title: i18n.peerKeyValidation || 'SSB ed25519 public key (@<44 chars base64>=.ed25519)', maxlength: 56 }),
          br(), br(),
          button({ type: 'submit' }, i18n.connectAndFollow)
        )
      )
    ) : null
  );
};

exports.invitesView = invitesView;
exports.renderSuggestedPub = renderSuggestedPub;

