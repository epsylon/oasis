const { div, h2, p, section, button, form, a, span, textarea, br, input, h1 } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const { config } = require('../server/SSB_server.js');

const { renderTextWithStyles } = require('../backend/renderTextWithStyles');

const generateFilterButtons = (filters, currentFilter, action) => {
  return filters.map(mode =>
    form({ method: 'GET', action },
      input({ type: 'hidden', name: 'filter', value: mode }),
      button({ type: 'submit', class: currentFilter === mode.toLowerCase() ? 'filter-btn active' : 'filter-btn' }, i18n[mode + 'Button'] || mode)
    )
  );
};

const renderFeedCard = (feed, alreadyRefeeded, alreadyVoted) => {
  const content = feed.value.content;
  const totalVotes = Object.entries(content.opinions || {});
  const totalCount = totalVotes.reduce((sum, [, count]) => sum + count, 0);
  const createdAt = feed.value.timestamp ? new Date(feed.value.timestamp).toLocaleString() : '';

  return div({ class: 'feed-card' },
    div({ class: 'feed-row' },
      div({ class: 'refeed-column' },
        h1(`${content.refeeds || 0}`),
        !alreadyRefeeded
          ? form({ method: 'POST', action: `/feed/refeed/${encodeURIComponent(feed.key)}` },
              button({ class: 'refeed-btn' }, i18n.refeedButton)
            )
          : p(i18n.alreadyRefeeded)
      ),
      div({ class: 'feed-main' },
        div({ class: 'feed-text', innerHTML: renderTextWithStyles(content.text) }),
        h2(`${i18n.totalOpinions}: ${totalCount}`),
        p({ class: 'card-footer' },
        span({ class: 'date-link' }, `${createdAt} ${i18n.performed} `),
          a({ href: `/author/${encodeURIComponent(feed.value.author)}`, class: 'user-link' }, `${feed.value.author}`)
        )
      )
    ),
    div({ class: 'votes-wrapper' },
      totalVotes.length > 0
        ? div({ class: 'votes' },
            totalVotes.map(([category, count]) =>
              span({ class: 'vote-category' }, `${category}: ${count}`)
            )
          )
        : null,
      !alreadyVoted
        ? div({ class: 'voting-buttons' },
            ['interesting','necessary','funny','disgusting','sensible','propaganda','adultOnly','boring','confusing','inspiring','spam'].map(cat =>
              form({ method: 'POST', action: `/feed/opinions/${encodeURIComponent(feed.key)}/${cat}` },
                button({ class: 'vote-btn' }, `${i18n['vote'+cat.charAt(0).toUpperCase()+cat.slice(1)] || cat} [${content.opinions?.[cat]||0}]`)
              )
            )
          )
        : p(i18n.alreadyVoted)
    )
  );
};

exports.feedView = (feeds, filter) => {
  const title = 
    filter === 'MINE'   ? i18n.MINEButton :
    filter === 'TODAY'  ? i18n.TODAYButton :
    filter === 'TOP'    ? i18n.TOPButton :
    filter === 'CREATE' ? i18n.createFeedTitle :
    filter === 'tag'    ? i18n.filteredByTag :
                          i18n.feedTitle;

  if (filter !== 'TOP') {
    feeds = feeds.sort((a, b) => b.value.timestamp - a.value.timestamp);
  } else {
    feeds = feeds.sort((a, b) => {
      const aRefeeds = a.value.content.refeeds || 0;
      const bRefeeds = b.value.content.refeeds || 0;
      return bRefeeds - aRefeeds;
    });
  }

  const header = div({ class: 'tags-header' },
    h2(title),
    p(i18n.FeedshareYourOpinions)
  );

  return template(
    title,
    section(
      header,
      div({ class: 'mode-buttons-row' },
        generateFilterButtons(['ALL', 'MINE', 'TODAY', 'TOP'], filter, '/feed'),
        form({ method: 'GET', action: '/feed/create' },
          button({
            type: 'submit',
            class: 'create-button filter-btn'
          }, i18n.createFeedTitle || "Create Feed")
        )
      ),
      section(
        filter === 'CREATE'
          ? form({ method: 'POST', action: '/feed/create' },
              textarea({
                name: 'text',
                placeholder: i18n.feedPlaceholder,
                maxlength: 280,
                rows: 4,
                cols: 50
              }),
              br(),
              button({ type: 'submit' }, i18n.createFeedButton)
            )
          : feeds && feeds.length > 0
            ? div({ class: 'feed-container' },
                feeds.map(feed => {
                  const content = feed.value.content;
                  const alreadyRefeeded = content.refeeds_inhabitants?.includes(config.keys.id);
                  const alreadyVoted = content.opinions_inhabitants?.includes(config.keys.id);
                  return renderFeedCard(feed, alreadyRefeeded, alreadyVoted);
                })
              )
            : div({ class: 'no-results' }, p(i18n.noFeedsFound))
      )
    )
  );
};

exports.feedCreateView = () => {
  return template(
    i18n.createFeedTitle,
    section(
      div({ class: 'tags-header' },
        h2(i18n.createFeedTitle),
        p(i18n.FeedshareYourOpinions)
      ),
      div({ class: 'mode-buttons', style: 'display:flex; gap:8px; margin-bottom:24px;' },
        generateFilterButtons(['ALL', 'MINE', 'TODAY', 'TOP'], 'CREATE', '/feed')
      ),
      form({ method: 'POST', action: '/feed/create' },
        textarea({
          name: 'text',
          maxlength: '280',
          rows: 5,
          cols: 50,
          placeholder: i18n.feedPlaceholder
        }),
        br(),
        button({ type: 'submit', class: 'create-button' }, i18n.createFeedButton || 'Send Feed!')
      )
    )
  );
};

