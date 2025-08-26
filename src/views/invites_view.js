const { form, button, div, h2, p, section, ul, li, a, br, hr, input, span } = require("../server/node_modules/hyperaxe");
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
    ? pubs.filter(pubItem => !unfollowed.find(u => u.key === pubItem.key))
    : [];

  const hasError = (pubItem) => pubItem && (pubItem.error || (typeof pubItem.failure === 'number' && pubItem.failure > 0));

  const unreachableLabel = i18n.currentlyUnreachable || i18n.currentlyUnrecheable || 'ERROR!';

  const pubItems = filteredPubs.filter(pubItem => !hasError(pubItem)).map(pubItem =>
    li(
      div(
        { class: 'pub-item' },
        h2('PUB: ', pubItem.host),
        h2(`${i18n.inhabitants}: ${pubItem.announcers || 0}`),
        a({ href: encodePubLink(pubItem.key), class: 'user-link' }, pubItem.key),
        form(
          { action: '/settings/invite/unfollow', method: 'post' },
          input({ type: 'hidden', name: 'key', value: pubItem.key }),
          button({ type: 'submit' }, i18n.invitesUnfollow)
        ),
      )
    )
  );

  const unfollowedItems = unfollowed.length
    ? unfollowed.map(pubItem =>
        li(
          div(
            { class: 'pub-item' },
            h2('PUB: ', pubItem.host),
            h2(`${i18n.inhabitants}: ${pubItem.announcers || 0}`),
            a({ href: encodePubLink(pubItem.key), class: 'user-link' }, pubItem.key),
            form(
              { action: '/settings/invite/follow', method: 'post' },
              input({ type: 'hidden', name: 'key', value: pubItem.key }),
              input({ type: 'hidden', name: 'host', value: pubItem.host || '' }),
              input({ type: 'hidden', name: 'port', value: String(pubItem.port || 8008) }),
              button({ type: 'submit', disabled: hasError(pubItem) }, i18n.invitesFollow)
            ),
          )
        )
      )
    : [];

  const unreachableItems = pubs.filter(hasError).map(pubItem =>
    li(
      div(
        { class: 'pub-item' },
        h2('PUB: ', pubItem.host),
        h2(`${i18n.inhabitants}: ${pubItem.announcers || 0}`),
        a({ href: encodePubLink(pubItem.key), class: 'user-link' }, pubItem.key),
        div(
          { class: 'error-box' },
          p({ class: 'error-title' }, i18n.errorDetails),
          p({ class: 'error-pre' }, String(pubItem.error || i18n.genericError))
        ),
      )
    )
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
        br,
        hr(),
        h2(`${i18n.invitesAcceptedInvites} (${pubItems.length})`),
        pubItems.length ? ul(pubItems) : p(i18n.invitesNoFederatedPubs),
        hr(),
        h2(`${i18n.invitesUnfollowedInvites} (${unfollowedItems.length})`),
        unfollowedItems.length ? ul(unfollowedItems) : p(i18n.invitesNoUnfollowed),
        hr(),
        h2(`${i18n.invitesUnreachablePubs} (${unreachableItems.length})`),
        unreachableItems.length ? ul(unreachableItems) : p(i18n.invitesNoUnreachablePubs)
      )
    )
  );
};

exports.invitesView = invitesView;

