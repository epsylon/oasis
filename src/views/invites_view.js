const { form, button, div, h2, h3, p, section, ul, li, a, br, hr, input, label, span, table, tr, td, textarea } = require("../server/node_modules/hyperaxe");
const path = require("path");
const fs = require('fs');
const { renderUrl } = require("../backend/renderUrl");
const { template, i18n } = require('./main_views');

const homedir = require('os').homedir();
const gossipPath = path.join(homedir, ".ssb", "gossip.json");
const unfollowedPath = path.join(homedir, ".ssb", "gossip_unfollowed.json");

const encodePubLink = (key) => {
  let core = String(key).replace(/^@/, '').replace(/\.ed25519$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!core.endsWith('=')) core += '=';
  return `/author/${encodeURIComponent('@' + core)}.ed25519`;
};

const snhInvitePath = path.join(__dirname, '..', 'configs', 'snh-invite-code.json');

let snhInvite = null;
try {
  snhInvite = JSON.parse(fs.readFileSync(snhInvitePath, 'utf8'));
} catch {}

const deduplicateByHost = (list) => {
  const seen = new Set();
  return list.filter(p => {
    const host = (p.host || '').replace(/:\d+$/, '');
    if (!host || seen.has(host)) return false;
    seen.add(host);
    return true;
  });
};

const invitesView = ({ invitesEnabled, flash }) => {
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

  const hasError = (pubItem) => pubItem && (pubItem.error || (typeof pubItem.failure === 'number' && pubItem.failure > 0));

  const sanitizeError = (err) => {
    if (!err) return i18n.genericError || 'Unknown error';
    const firstLine = String(err).split('\n')[0].replace(/^Error:\s*/, '').trim();
    return firstLine || (i18n.genericError || 'Unknown error');
  };

  const unreachableLabel = i18n.currentlyUnreachable || i18n.currentlyUnrecheable || 'ERROR!';

  const pubTableHeader = () => tr(
    td({ class: 'card-label' }, 'PUB'),
    td({ class: 'card-label' }, i18n.invitesPort || 'Port'),
    td({ class: 'card-label' }, 'Key'),
    td({ class: 'card-label' }, '')
  );

  const activePubs = filteredPubs.filter(pubItem => !hasError(pubItem));
  const unreachablePubs = pubs.filter(hasError);

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
      div({ class: 'tags-header' },
        h2(title),
        p(description)
      )
    ),
    flash === 'alreadyFederated'
      ? section(div({ class: 'message-banner' }, p(i18n.invitesAlreadyFederated || 'You are already federated with this pub.')))
      : null,
    section(
      div({ class: 'pubs-section' },
        h2(i18n.invitesPubsTitle),
        form(
          { action: '/settings/invite/accept', method: 'post' },
          input({ name: 'invite', type: 'text', placeholder: i18n.invitesPubInviteCodePlaceholder, autofocus: true, required: true }),
          br(),
          button({ type: 'submit' }, i18n.invitesAcceptInvite)
        ),
        br(),
        snhInvite ? div({ class: 'snh-invite-box' },
          h3({ class: 'snh-invite-name' }, snhInvite.name),
          p({ class: 'snh-invite-name' }, snhInvite.description),
          p({ class: 'snh-invite-name' }, renderUrl(snhInvite.url)),
          snhInvite.createdAt ? p({ class: 'snh-invite-date' }, `${i18n.statsCreatedAt || 'Created'}: ${new Date(snhInvite.createdAt).toLocaleDateString()}`) : null,
          form({ action: '/settings/invite/accept', method: 'post' },
            input({ type: 'hidden', name: 'invite', value: snhInvite.code }),
            button({ type: 'submit', class: 'filter-btn' }, snhInvite.code)
          )
        ) : null
      )
    ),
    section(
      div({ class: 'federations-section' },
        h2(i18n.invitesFederationsTitle || 'Federations'),
        div({ class: 'conn-actions invites-pubs-actions' },
          form({ action: '/invites/refresh-pubs', method: 'post' }, button({ type: 'submit' }, i18n.invitesPubsRefresh || 'Refresh')),
          form({ action: '/invites/clear-unreachable', method: 'post' }, button({ type: 'submit' }, i18n.invitesPubsClearUnreachable || 'Remove unreachable')),
          form({ action: '/invites/export-pubs', method: 'get' }, button({ type: 'submit' }, i18n.invitesPubsExport || 'Export'))
        ),
        form(
          { action: '/invites/import-pubs', method: 'post', enctype: 'multipart/form-data', class: 'peers-import-form' },
          label({ class: 'peers-import-label' }, i18n.invitesPubsImportTitle || 'Import pubs'),
          br(),
          textarea({ name: 'peerList', rows: '4', placeholder: i18n.invitesPubsImportPlaceholder || 'Paste one multiserver address or invite code per line…' }),
          br(),
          input({ type: 'file', name: 'peerFile', accept: '.txt,text/plain' }),
          br(),
          button({ type: 'submit', class: 'filter-btn' }, i18n.invitesPubsImport || 'Import')
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
        hr(),
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
        hr(),
        h2(`${i18n.invitesUnreachablePubs} (${unreachablePubs.length})`),
        unreachablePubs.length
          ? renderPubTable(unreachablePubs, pubItem =>
              div({ class: 'error-box' },
                p({ class: 'error-title' }, i18n.errorDetails),
                p({ class: 'error-pre' }, sanitizeError(pubItem.error))
              )
            )
          : p(i18n.invitesNoUnreachablePubs)
      )
    ),
    section(
      div({ class: 'invites-houses', id: 'invites-houses' },
        h2(i18n.invitesHousesTitle || 'Houses'),
        form(
          { action: '/larp/invite/redeem', method: 'post' },
          input({ type: 'hidden', name: 'returnTo', value: '/invites' }),
          input({ name: 'code', type: 'text', placeholder: i18n.invitesHouseInviteCodePlaceholder || 'House invitation code', required: true, maxlength: 32 }),
          br(),
          button({ type: 'submit' }, i18n.invitesHouseJoinButton || 'Join House')
        )
      )
    ),
    section(
      div({ class: 'invites-tribes', id: 'invites-tribes' },
        h2(i18n.invitesTribesTitle),
        form(
          { action: '/tribes/join-code', method: 'post' },
          input({ name: 'inviteCode', type: 'text', placeholder: i18n.invitesTribeInviteCodePlaceholder, required: true }),
          br(),
          button({ type: 'submit' }, i18n.invitesTribeJoinButton)
        )
      )
    ),
    section(
      div({ class: 'invites-chats', id: 'invites-chats' },
        h2(i18n.invitesChatsTitle || 'Chats'),
        form(
          { action: '/chats/join-code', method: 'post' },
          input({ name: 'code', type: 'text', placeholder: i18n.invitesChatInviteCodePlaceholder || 'Enter chat invite code', required: true }),
          br(),
          button({ type: 'submit' }, i18n.invitesChatJoinButton || 'Join Chat')
        )
      )
    ),
    section(
      div({ class: 'invites-pads', id: 'invites-pads' },
        h2(i18n.invitesPadsTitle || 'Pads'),
        form(
          { action: '/pads/join-code', method: 'post' },
          input({ name: 'code', type: 'text', placeholder: i18n.invitesPadInviteCodePlaceholder || 'Enter pad invite code', required: true }),
          br(),
          button({ type: 'submit' }, i18n.invitesPadJoinButton || 'Join Pad')
        )
      )
    ),
    section(
      div({ class: 'invites-calendars', id: 'invites-calendars' },
        h2(i18n.invitesCalendarsTitle || 'Calendars'),
        form(
          { action: '/calendars/join-code', method: 'post' },
          input({ name: 'code', type: 'text', placeholder: i18n.invitesCalendarInviteCodePlaceholder || 'Enter calendar invite code', required: true }),
          br(),
          button({ type: 'submit' }, i18n.invitesCalendarJoinButton || 'Join Calendar')
        )
      )
    ),
    section(
      div({ class: 'invites-events', id: 'invites-events' },
        h2(i18n.invitesEventsTitle || 'Events'),
        form(
          { action: '/events/join-code', method: 'post' },
          input({ name: 'code', type: 'text', placeholder: i18n.invitesEventInviteCodePlaceholder || 'Enter event invite code', required: true }),
          br(),
          button({ type: 'submit' }, i18n.invitesEventJoinButton || 'Join Event')
        )
      )
    ),
    section(
      div({ class: 'invites-forums', id: 'invites-forums' },
        h2(i18n.invitesForumsTitle || 'Forums'),
        form(
          { action: '/forum/join-code', method: 'post' },
          input({ name: 'code', type: 'text', placeholder: i18n.invitesForumInviteCodePlaceholder || 'Enter forum invite code', required: true }),
          br(),
          button({ type: 'submit' }, i18n.invitesForumJoinButton || 'Join Forum')
        )
      )
    ),
    section(
      div({ class: 'invites-maps', id: 'invites-maps' },
        h2(i18n.invitesMapsTitle || 'Maps'),
        form(
          { action: '/maps/join-code', method: 'post' },
          input({ name: 'code', type: 'text', placeholder: i18n.invitesMapInviteCodePlaceholder || 'Enter map invite code', required: true }),
          br(),
          button({ type: 'submit' }, i18n.invitesMapJoinButton || 'Join Map')
        )
      )
    ),
    section(
      div({ class: 'invites-shops', id: 'invites-shops' },
        h2(i18n.invitesShopsTitle || 'Shops'),
        form(
          { action: '/shops/join-code', method: 'post' },
          input({ name: 'code', type: 'text', placeholder: i18n.invitesShopInviteCodePlaceholder || 'Enter shop invite code', required: true }),
          br(),
          button({ type: 'submit' }, i18n.invitesShopJoinButton || 'Join Shop')
        )
      )
    ),
    section(
      div({ class: 'invites-inhabitants', id: 'invites-inhabitants' },
        h2(i18n.invitesInhabitantsTitle || 'Inhabitants'),
        form(
          { action: '/invites/inhabitant/follow', method: 'post' },
          input({ name: 'feedId', id: 'inh_oasis_id', type: 'text', placeholder: '@...=.ed25519', pattern: '@[A-Za-z0-9+/_\\-]{43}=\\.ed25519', required: true, maxlength: 56 }),
          br(),
          button({ type: 'submit' }, i18n.invitesInhabitantsFollow || 'Give Support')
        )
      )
    ),
    section(
      div({ class: 'invites-peers', id: 'invites-peers' },
        h2(i18n.peers || 'Peers'),
        p(i18n.directConnectDescription),
        form({ action: '/peers/connect', method: 'post' },
          input({ type: 'text', id: 'peer_host', name: 'host', required: true, placeholder: '192.168.1.100', pattern: '(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|[a-zA-Z0-9]([a-zA-Z0-9\\-]*[a-zA-Z0-9])?(\\.[a-zA-Z0-9]([a-zA-Z0-9\\-]*[a-zA-Z0-9])?)*)', title: i18n.peerHostValidation || 'Valid IPv4 (e.g. 192.168.1.100) or hostname (e.g. pub.example.com)', maxlength: 253 }),
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
    )
  );
};

exports.invitesView = invitesView;

