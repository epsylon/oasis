const { form, button, div, h2, p, section, input, select, option, img, audio: audioHyperaxe, video: videoHyperaxe, table, hr, hd, br, td, tr, a } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const moment = require("../server/node_modules/moment");
const { renderTextWithStyles } = require('../backend/renderTextWithStyles');

const searchView = ({ messages = [], blobs = {}, query = "", type = "", types = [], hashtag = null, results = {}, resultCount = "10" }) => {
  const searchInput = input({
    name: "query",
    required: false,
    type: "search",
    value: query,
    placeholder: i18n.searchPlaceholder
  });
  searchInput.setAttribute("minlength", 3);

  const contentTypes = [
    "post", "about", "curriculum", "tribe", "market", "transfer", "feed", "votes", 
    "report", "task", "event", "bookmark", "image", "audio", "video", "document", "all"
  ];

  const filterSelect = select(
    { 
      id: "search-type", 
      name: "type", 
      class: "input-select", 
      style: "position:relative; z-index:10;" 
    },
    contentTypes.map(type =>
      option({
        value: type === 'all' ? "" : type, 
        selected: (types.length === 0 && type === 'all') || types.includes(type)
      }, i18n[type + "Label"] || type.toUpperCase())
    )
  );

  const resultsPerPageSelect = select(
    { 
      id: "results-per-page", 
      name: "resultsPerPage", 
      class: "input-select", 
      style: "position:relative; z-index:10;margin-left:10px;" 
    },
    option({ value: "100", selected: resultCount === "100" }, "100"),
    option({ value: "50", selected: resultCount === "50" }, "50"),
    option({ value: "10", selected: resultCount === "10" }, "10"),
    option({ value: "all", selected: resultCount === "all" }, i18n.allTypesLabel)
  );
  
let hasDocument = false; 

const renderContentHtml = (content) => {
  switch (content.type) {
    case 'post':
      return div({ class: 'search-post' },
        content.contentWarning ? p(i18n.contentWarning + `: ${content.contentWarning}`) : null,
        content.text ? p({ innerHTML: content.text }) : null,
        content.tags && content.tags.length
           ? div(content.tags.map(tag =>
           a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
         ))
       : null
    );
    case 'about':
      return div({ class: 'search-about' },
        content.name ? h2('@', content.name) : null,
        content.description ? p(content.description) : null,
        content.image ? img({ src: `/image/64/${encodeURIComponent(content.image)}` }) : null
    );
    case 'feed':
      return div({ class: 'search-feed' },
        content.text ? h2(content.text) : null,
        div(
          h2(`${i18n.tribeFeedRefeeds}: ${content.refeeds}`)
        )
    );
    case 'event':
      return div({ class: 'search-event' },
        content.title ? h2(content.title) : null,
        content.description ? p(i18n.searchDescription + `: ${content.description}`) : null,
        content.date ? p(`${i18n.eventDate}: ${new Date(content.date).toLocaleString()}`) : null,
        content.location ? p(`${i18n.eventLocation}: ${content.location}`) : null,
        content.price ? p(`${i18n.eventPrice}: ${content.price} ECO`) : null,
        content.eventUrl ? p(`${i18n.eventUrlLabel}: `, a({ href: content.eventUrl, target: '_blank' }, content.eventUrl)) : null,
        content.organizer ? p(`${i18n.eventOrganizer}: `, a({ href: `/author/${encodeURIComponent(content.organizer)}` }, content.organizer)) : null,
        content.tags && content.tags.length
          ? div(content.tags.map(tag =>
            a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
          ))
        : null
      );
    case 'votes':
      return div({ class: 'search-vote' },
        content.question ? h2(content.question) : null,
        content.status ? p(`${i18n.voteStatus}: ${content.status}`) : null,
        content.totalVotes ? p(`${i18n.voteTotalVotes}: ${content.totalVotes}`) : null,
        content.votes && content.votes.YES ? p(`${i18n.voteYes}: ${content.votes.YES}`) : null,
        content.votes && content.votes.NO ? p(`${i18n.voteNo}: ${content.votes.NO}`) : null,
        content.votes && content.votes.ABSTENTION ? p(`${i18n.voteAbstention}: ${content.votes.ABSTENTION}`) : null,
        content.votes && content.votes.FOLLOW_MAJORITY ? p(`${i18n.voteFollowMajority}: ${content.votes.FOLLOW_MAJORITY}`) : null,
        content.tags && content.tags.length
          ? div(content.tags.map(tag =>
            a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
          ))
        : null
      );
    case 'tribe':
      return div({ class: 'search-tribe' },
        h2(content.title),
        content.description ? p(i18n.tribeDescriptionLabel + ': ' + content.description) : null,
        content.image ? img({ src: `/blob/${encodeURIComponent(content.image)}`, class: 'feed-image' }) : img({ src: '/assets/images/default-tribe.png', class: 'feed-image' }),
        p(`${i18n.location || 'Location'}: ${content.location || ''}`),
        typeof content.isLARP === 'boolean' ? p(`${i18n.isLARPLabel || 'LARP'}: ${content.isLARP ? 'Yes' : 'No'}`) : null,
        typeof content.isAnonymous === 'boolean' ? p(`${i18n.isAnonymousLabel || 'Anonymous'}: ${content.isAnonymous ? 'Yes' : 'No'}`) : null,
        Array.isArray(content.members) ? p(`${i18n.tribeMembersCount || 'Members'}: ${content.members.length}`) : null,
        content.tags && content.tags.length
          ? div(content.tags.map(tag =>
            a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
          ))
        : null
      );
    case 'audio':
      return content.url ? div({ class: 'search-audio' },
        content.title ? h2(content.title) : null,
        content.description ? p(i18n.searchDescription + `: ${content.description}`) : null,
        audioHyperaxe({ controls: true, src: `/blob/${encodeURIComponent(content.url)}`, type: content.mimeType, preload: 'metadata' }),
        content.tags && content.tags.length
          ? div(content.tags.map(tag =>
            a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
          ))
        : null
      ) : null;
    case 'image':
      return content.url ? div({ class: 'search-image' },
        content.title ? h2(content.title) : null,
        content.description ? p(i18n.searchDescription + `: ${content.description}`) : null,
        content.meme ? h2(`${i18n.trendingCategory}: ${i18n.meme}`) : null,
        img({ src: `/blob/${encodeURIComponent(content.url)}` }),
        br(),
        content.tags && content.tags.length
          ? div(content.tags.map(tag =>
            a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
          ))
        : null
      ) : null;
    case 'video':
      return content.url ? div({ class: 'search-video' },
        content.title ? h2(content.title) : null,
        content.description ? p(i18n.searchDescription + `: ${content.description}`) : null,
        videoHyperaxe({ controls: true, src: `/blob/${encodeURIComponent(content.url)}`, type: content.mimeType || 'video/mp4', width: '640', height: '360' }),
        content.tags && content.tags.length
          ? div(content.tags.map(tag =>
            a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
          ))
        : null
      ) : null;
    case 'document':
      return div({ class: 'search-document' },
        content.title ? h2(content.title) : null,
        content.description ? p(i18n.searchDescription + `: ${content.description}`) : null,
        div({
          id: `pdf-container-${content.key || content.url}`,
          class: 'pdf-viewer-container',
         'data-pdf-url': `/blob/${encodeURIComponent(content.url)}`
        }),
       content.tags && content.tags.length
          ? div(content.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
            ))
          : null
     );
    case 'market':
      return div({ class: 'search-market' },
        content.item_type ? h2(`${i18n.marketItemType}: ${content.item_type}`) : null,
        content.title ? h2(content.title) : null,
        content.description ? p(`${i18n.searchDescription}: ${content.description}`) : null,
        content.price ? p(`${i18n.searchPriceLabel}: ${content.price || 'N/A'}`) : null,
        content.status ? p(`${i18n.marketItemCondition}: ${content.status}`) : null,
        content.item_status ? p(`${i18n.marketItemCondition}: ${content.item_status}`) : null,
        content.deadline ? p(`${i18n.marketItemDeadline}: ${new Date(content.deadline).toLocaleString()}`) : null,
        typeof content.includesShipping === 'boolean' ? p(`${i18n.marketItemIncludesShipping}: ${content.includesShipping ? i18n.YESLabel : i18n.NOLabel}`) : null,
        content.seller ? p(`${i18n.marketItemSeller}: `, a({ href: `/author/${encodeURIComponent(content.seller)}` }, content.seller)) : null,
        content.image ? img({ src: `/blob/${encodeURIComponent(content.image)}`, class: 'market-image' }) : null,
        content.auctions_poll && content.auctions_poll.length > 0
          ? div({ class: 'auction-info' },
              p(i18n.marketAuctionBids),
              table({ class: 'auction-bid-table' },
                tr(
                  th(i18n.marketAuctionBidTime),
                  th(i18n.marketAuctionUser),
                  th(i18n.marketAuctionBidAmount)
                ),
                content.auctions_poll.map(bid => {
                  const [userId, bidAmount, bidTime] = bid.split(':');
                  return tr(
                    td(moment(bidTime).format('YYYY-MM-DD HH:mm:ss')),
                    td(a({ href: `/author/${encodeURIComponent(userId)}` }, userId)),
                    td(`${parseFloat(bidAmount).toFixed(6)} ECO`)
                  );
                })
              )
          )
          : null,
        content.tags && content.tags.length
          ? div(content.tags.map(tag =>
            a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
          ))
        : null
      );
    case 'bookmark':
      return div({ class: 'search-bookmark' },
        content.description ? p(content.description) : null,
        h2(content.url ? a({ href: content.url, target: '_blank' }, content.url) : null),
        content.category ? p(`${i18n.bookmarkCategory}: ${content.category}`) : null,
        content.lastVisit ? p(`${i18n.bookmarkLastVisit}: ${new Date(content.lastVisit).toLocaleString()}`) : null,
        content.tags && content.tags.length
          ? div(content.tags.map(tag =>
            a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
          ))
        : null
      );
    case 'task':
      return div({ class: 'search-task' },
       content.title ? h2(content.title) : null,
       content.description ? p(i18n.searchDescription + `: ${content.description}`) : null,
       content.startTime ? p(`${i18n.taskStartTimeLabel}: ${new Date(content.startTime).toLocaleString()}`) : null,
       content.endTime ? p(`${i18n.taskEndTimeLabel}: ${new Date(content.endTime).toLocaleString()}`) : null,
       content.priority ? p(`${i18n.searchPriorityLabel}: ${content.priority}`) : null,
       content.location ? p(`${i18n.searchLocationLabel}: ${content.location}`) : null,
       typeof content.isPublic === 'boolean' ? p(`${i18n.searchIsPublicLabel}: ${content.isPublic ? i18n.YESLabel : i18n.NOLabel}`) : null,
       Array.isArray(content.assignees)
          ? p(`${i18n.taskAssignees}: ${content.assignees.length}`)
          : null,
       content.status ? p(`${i18n.searchStatusLabel}: ${content.status}`) : null,
       content.author ? p(`${i18n.author}: `, a({ href: `/author/${encodeURIComponent(content.author)}` }, content.author)) : null,
       content.tags && content.tags.length
         ? div(content.tags.map(tag =>
            a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
           ))
         : null
     );
   case 'report':
      return div({ class: 'search-report' },
      content.title ? h2(content.title) : null,
      content.description ? p(i18n.searchDescription + `: ${content.description}`) : null,
      content.category ? p(`${i18n.searchCategoryLabel}: ${content.category}`) : null,
      content.severity ? p(`${i18n.reportsSeverity}: ${content.severity}`) : null,
      content.status ? p(`${i18n.searchStatusLabel}: ${content.status}`) : null,
      content.image ? img({ src: `/blob/${encodeURIComponent(content.image)}` }) : null,
      typeof content.confirmations === 'number' ? p(`${i18n.reportsConfirmations}: ${content.confirmations}`) : null,
      br,
      content.tags && content.tags.length
        ? div(content.tags.map(tag =>
            a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
          ))
        : null
    );
    case 'transfer':
      return div({ class: 'search-transfer' },
        p(`${i18n.transfersFrom}: `, a({ href: `/author/${encodeURIComponent(content.from)}` }, content.from)),
        p(`${i18n.transfersTo}: `, a({ href: `/author/${encodeURIComponent(content.to)}` }, content.to)),
        p(`${i18n.transfersAmount}: ${content.amount}`),
        h2(`${i18n.transfersConcept}: ${content.concept}`),
        p(`${i18n.transfersStatus}: ${content.status}`),
        content.confirmedBy && content.confirmedBy.length
          ? p(`${i18n.transfersConfirmations}: ${content.confirmedBy.length}`)
          : null,
        content.tags && content.tags.length
          ? div(content.tags.map(tag =>
            a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
          ))
        : null
      );
    case 'curriculum':
      return div({ class: 'search-curriculum' },
        content.name ? h2(content.name) : null,
        content.description ? p(content.description) : null,
        content.photo ? img({ src: `/blob/${encodeURIComponent(content.photo)}`, class: 'curriculum-photo' }) : null,
        content.location ? p(`${i18n.cvLocationLabel}: ${content.location}`) : null,
        content.status ? p(`${i18n.cvStatusLabel}: ${content.status}`) : null,
        content.preferences ? p(`${i18n.cvPreferencesLabel}: ${content.preferences}`) : null,
        Array.isArray(content.personalSkills) && content.personalSkills.length
          ? div(content.personalSkills.map(skill =>
              a({ href: `/search?query=%23${encodeURIComponent(skill)}`, class: 'tag-link' }, `#${skill}`)
            )) : null,
        Array.isArray(content.personalExperiences) && content.personalExperiences.length
          ? div(content.personalExperiences.map(exp => p(exp))) : null,
        Array.isArray(content.oasisExperiences) && content.oasisExperiences.length
          ? div(content.oasisExperiences.map(exp => p(exp))) : null,
        Array.isArray(content.oasisSkills) && content.oasisSkills.length
          ? div(content.oasisSkills.map(skill => p(skill))) : null,
        Array.isArray(content.educationExperiences) && content.educationExperiences.length
          ? div(content.educationExperiences.map(exp => p(exp))) : null,
        Array.isArray(content.educationalSkills) && content.educationalSkills.length
          ? div(content.educationalSkills.map(skill =>
              a({ href: `/search?query=%23${encodeURIComponent(skill)}`, class: 'tag-link' }, `#${skill}`)
            )) : null,
        Array.isArray(content.languages) && content.languages.length
          ? div(content.languages.map(lang => p(lang))) : null,
        Array.isArray(content.professionalExperiences) && content.professionalExperiences.length
          ? div(content.professionalExperiences.map(exp => p(exp))) : null,
       Array.isArray(content.professionalSkills) && content.professionalSkills.length
          ? div(content.professionalSkills.map(skill => p(skill))) : null
      );
    default:
      return div({ class: 'styled-text', innerHTML: renderTextWithStyles(content.text || content.description || content.title || '[no content]') });
  }
};

const resultSection = Object.entries(results).length > 0
  ? Object.entries(results).map(([key, msgs]) =>
    div(
      { class: "search-result-group" },
      h2(i18n[key + "Label"] || key),
      ...msgs.map((msg) => {
        const content = msg.value.content || {};
        const created = new Date(msg.timestamp).toLocaleString();
        if (content.type === 'document') hasDocument = true;
        const contentHtml = renderContentHtml(content);
        let author;
        let authorUrl = '#';

        if (content.type === 'market') {
          author = content.seller || i18n.anonymous || "Anonymous";
          authorUrl = `/author/${encodeURIComponent(content.seller)}`;
        } else if (content.type === 'event') {
          author = content.organizer || i18n.anonymous || "Anonymous";
          authorUrl = `/author/${encodeURIComponent(content.organizer)}`;
        } else if (content.type === 'transfer') {
          author = content.from || i18n.anonymous || "Anonymous";
          authorUrl = `/author/${encodeURIComponent(content.from)}`;
        } else if (content.type === 'post' || content.type === 'about') {
          author = null;
        } else if (content.type === 'report' && content.isAnonymous) {
          author = null;
        } else {
          author = content.author || i18n.anonymous || "Anonymous";
          authorUrl = `/author/${encodeURIComponent(content.author || 'anonymous')}`;
        }

        return div({ class: 'result-item' }, [
          contentHtml,
          author
            ? p(`${i18n.author}: `, a({ href: authorUrl }, author))
            : null,
          p(`${i18n.createdAtLabel || i18n.searchCreatedAt}: ${created}`)
        ]);
      })
    )
  )
  : div({ class: 'no-results' }, p(i18n.noResultsFound));

  let html = template(
    hashtag ? `#${hashtag}` : i18n.search,
    section(
      div({ class: "tags-header" },
        h2(hashtag ? `#${hashtag}` : i18n.search),
        p(hashtag ? i18n.hashtagDescription : i18n.searchDescriptionLabel)
      ),
      form(
        { action: "/search", method: "POST", class: "search-form" },
        div({ class: "search-bar" },
          filterSelect,
          resultsPerPageSelect,
          searchInput,
          br(), br(),
          button({ type: "submit" }, i18n.searchSubmit)
        )
      )
    ),
    section(resultSection)
  );

  if (hasDocument) {
    html += `
      <script type="module" src="/js/pdf.min.mjs"></script>
      <script src="/js/pdf-viewer.js"></script>
    `;
  }

  return html;
};

exports.searchView = searchView;

