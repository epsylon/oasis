const { form, button, div, h2, p, section, ul, li, a, br, hr, input } = require("../server/node_modules/hyperaxe");
const path = require("path");
const fs = require('fs');
const { template, i18n } = require('./main_views');

const homedir = require('os').homedir();
const gossipPath = path.join(homedir, ".ssb/gossip.json");

const invitesView = ({ invitesEnabled }) => {
  let pubs = [];
  let pubsValue = "false";

  try {
    pubs = fs.readFileSync(gossipPath, "utf8");
  } catch {
    pubs = undefined;
  }

  if (pubs) {
    try {
      pubs = JSON.parse(pubs);
      if (Array.isArray(pubs) && pubs.length > 0) pubsValue = "true";
      else pubsValue = "false";
    } catch {
      pubsValue = "false";
    }
  }

  const pubItems = pubsValue === "true"
    ? pubs.map(pubItem =>
        li(
          p(`PUB: ${pubItem.host}`),
          p(`${i18n.inhabitants}: ${pubItem.announcers}`),
          a({ href: `/author/${encodeURIComponent(pubItem.key)}` }, pubItem.key),
          br,
          br
        )
      )
    : [];

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
        hr(),
        h2(`${i18n.invitesAcceptedInvites} (${pubItems.length})`),
        pubItems.length
          ? ul(pubItems)
          : p({ class: 'empty' }, i18n.invitesNoInvites)
      )
    )
  );
};

exports.invitesView = invitesView;
