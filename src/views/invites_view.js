const { form, button, div, h2, h3, p, section, ul, li, a, br, hr, input, span, table, tr, td } = require("../server/node_modules/hyperaxe");
const path = require("path");
const fs = require('fs');
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

const invitesView = ({ invitesEnabled }) => {
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

  const unreachableLabel = i18n.currentlyUnreachable || i18n.currentlyUnrecheable || 'ERROR!';

  const pubTableHeader = () => tr(
    td({ class: 'card-label' }, 'PUB'),
    td({ class: 'card-label' }, i18n.invitesPort || 'Port'),
    td({ class: 'card-label' }, i18n.inhabitants),
    td({ class: 'card-label' }, 'Key'),
    td({ class: 'card-label' }, '')
  );

  const activePubs = filteredPubs.filter(pubItem => !hasError(pubItem));
  const unreachablePubs = pubs.filter(hasError);

  const renderPubTable = (items, actionFn) => table({ class: 'block-info-table' },
    pubTableHeader(),
    items.map(pubItem => tr(
      td(pubItem.host || '—'),
      td(String(pubItem.port || 8008)),
      td(String(pubItem.announcers || 0)),
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
    section(
      div({ class: 'invites-tribes' },
        h2(i18n.invitesTribesTitle),
        form(
          { action: '/tribes/join-code', method: 'post' },
          input({ name: 'inviteCode', type: 'text', placeholder: i18n.invitesTribeInviteCodePlaceholder, autofocus: true, required: true }),
          br(),
          button({ type: 'submit' }, i18n.invitesTribeJoinButton)
        )
      )
    ),
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
          span({ class: 'snh-invite-code' }, snhInvite.code)
        ) : null,
        hr(),
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
                p({ class: 'error-pre' }, String(pubItem.error || i18n.genericError))
              )
            )
          : p(i18n.invitesNoUnreachablePubs)
      )
    )
  );
};

exports.invitesView = invitesView;

