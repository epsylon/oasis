const { form, button, div, h2, p, section, input, select, option, img, audio: audioHyperaxe, video: videoHyperaxe, table, hr, hd, br, td, tr, th, a, span } = require("../server/node_modules/hyperaxe");
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
    "report", "task", "event", "bookmark", "image", "audio", "video", "document",
    "bankWallet", "bankClaim", "project", "job", "forum", "vote", "contact", "pub", "all"
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

  const getViewDetailsActionForSearch = (type, contentId, content) => {
    switch (type) {
      case 'votes': return `/votes/${encodeURIComponent(contentId)}`;
      case 'transfer': return `/transfers/${encodeURIComponent(contentId)}`;
      case 'tribe': return `/tribe/${encodeURIComponent(contentId)}`;
      case 'curriculum': return `/inhabitant/${encodeURIComponent(contentId)}`;
      case 'image': return `/images/${encodeURIComponent(contentId)}`;
      case 'audio': return `/audios/${encodeURIComponent(contentId)}`;
      case 'video': return `/videos/${encodeURIComponent(contentId)}`;
      case 'document': return `/documents/${encodeURIComponent(contentId)}`;
      case 'bookmark': return `/bookmarks/${encodeURIComponent(contentId)}`;
      case 'event': return `/events/${encodeURIComponent(contentId)}`;
      case 'task': return `/tasks/${encodeURIComponent(contentId)}`;
      case 'post': return `/thread/${encodeURIComponent(contentId)}#${encodeURIComponent(contentId)}`;
      case 'market': return `/market/${encodeURIComponent(contentId)}`;
      case 'report': return `/reports/${encodeURIComponent(contentId)}`;
      case 'project': return `/projects/${encodeURIComponent(contentId)}`;
      case 'job': return `/jobs/${encodeURIComponent(contentId)}`;
      case 'forum': return `/forum/${encodeURIComponent(contentId)}`;
      case 'vote': return content && content.vote && content.vote.link ? `/thread/${encodeURIComponent(content.vote.link)}#${encodeURIComponent(content.vote.link)}` : '#';
      case 'contact': return content && content.contact ? `/author/${encodeURIComponent(content.contact)}` : '#';
      case 'pub': return '#';
      case 'bankWallet': return `/banking`;
      case 'bankClaim': return `/banking`;
      default: return '#';
    }
  };

  let hasDocument = false;

  const renderContentHtml = (content) => {
    switch (content.type) {
      case 'post':
        return div({ class: 'search-post' },
          content.contentWarning ? h2({ class: 'card-field' }, span({ class: 'card-value' }, content.contentWarning)) : null,
          content.text ? div({ class: 'card-field' }, span({ class: 'card-value', innerHTML: content.text })) : null
        );
      case 'about':
        return div({ class: 'search-about' },
          content.name ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.name + ':'), span({ class: 'card-value' }, content.name)) : null,
          content.description ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.description + ':'), span({ class: 'card-value' }, content.description)) : null,
          content.image ? img({ src: `/image/64/${encodeURIComponent(content.image)}` }) : null
        );
      case 'feed':
        return div({ class: 'search-feed' },
          content.text ? h2({ class: 'card-field' }, span({ class: 'card-value' }, content.text)) : null,
          h2({ class: 'card-field' }, span({ class: 'card-label' }, i18n.tribeFeedRefeeds + ':'), span({ class: 'card-value' }, content.refeeds))
        );
      case 'event':
        return div({ class: 'search-event' },
          content.title ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.eventTitleLabel + ':'), span({ class: 'card-value' }, content.title)) : null,
          content.description ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.searchDescription + ':'), span({ class: 'card-value' }, content.description)) : null,
          content.date ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.eventDate + ':'), span({ class: 'card-value' }, new Date(content.date).toLocaleString())) : null,
          content.location ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.eventLocation + ':'), span({ class: 'card-value' }, content.location)) : null,
          content.isPublic ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.eventPrivacyLabel + ':'), span({ class: 'card-value' }, content.isPublic)) : null,
          content.status ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.eventStatus + ':'), span({ class: 'card-value' }, content.status)) : null,
          content.eventUrl ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.eventUrlLabel + ':'), span({ class: 'card-value' }, a({ href: content.eventUrl, target: '_blank' }, content.eventUrl))) : null,
          content.price ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.eventPrice + ':'), span({ class: 'card-value' }, content.price)) : null,
          content.tags && content.tags.length
            ? div({ class: 'card-tags' }, content.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
            ))
            : null
        );
      case 'votes':
        const votesList = content.votes && typeof content.votes === 'object'
          ? Object.entries(content.votes).map(([option, count]) => ({ option, count }))
          : [];
        return div({ class: 'search-vote' },
          br,
          content.question ? div({ class: 'card-field' },
            span({ class: 'card-label' }, i18n.voteQuestionLabel + ':' ),
            span({ class: 'card-value' }, content.question)
          ) : null,
          content.status ? div({ class: 'card-field' },
            span({ class: 'card-label' }, i18n.voteStatus + ':' ),
            span({ class: 'card-value' }, content.status)
          ) : null,
          content.deadline ? div({ class: 'card-field' },
            span({ class: 'card-label' }, i18n.voteDeadline + ':' ),
            span({ class: 'card-value' }, content.deadline ? new Date(content.deadline).toLocaleString() : '')
          ) : null,
          div({ class: 'card-field' },
            span({ class: 'card-label' }, i18n.voteTotalVotes + ':' ),
            span({ class: 'card-value' }, content.totalVotes !== undefined ? content.totalVotes : '0')
          ),
          br,
          votesList.length > 0 ? div({ class: 'card-votes' },
            table(
              tr(...votesList.map(({ option }) => th(i18n[option] || option))),
              tr(...votesList.map(({ count }) => td(count)))
            )
          ) : null
        );
      case 'tribe':
        return div({ class: 'search-tribe' },
          content.title ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.tribeTitleLabel + ':'), span({ class: 'card-value' }, content.title)) : null,
          content.isAnonymous !== undefined ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.tribeIsAnonymousLabel + ':'), span({ class: 'card-value' }, content.isAnonymous ? i18n.tribePrivate : i18n.tribePublic)) : null,
          content.inviteMode ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.tribeModeLabel + ':'), span({ class: 'card-value' }, content.inviteMode.toUpperCase())) : null,
          content.isLARP !== undefined ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.tribeLARPLabel + ':'), span({ class: 'card-value' }, content.isLARP ? i18n.tribeYes : i18n.tribeNo)) : null,
          br,
          content.image ? img({ src: `/blob/${encodeURIComponent(content.image)}`, class: 'feed-image' }) : img({ src: '/assets/images/default-tribe.png', class: 'feed-image' }),
          br,
          content.description ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.tribeDescriptionLabel + ':'), span({ class: 'card-value' }, content.description)) : null,
          content.location ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.location + ':'), span({ class: 'card-value' }, content.location)) : null,
          Array.isArray(content.members) ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.tribeMembersCount + ':'), span({ class: 'card-value' }, content.members.length)) : null,
          content.tags && content.tags.length
            ? div({ class: 'card-tags' }, content.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
            ))
            : null
        );
      case 'audio':
        return content.url ? div({ class: 'search-audio' },
          content.title ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.audioTitleLabel + ':'), span({ class: 'card-value' }, content.title)) : null,
          content.description ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.audioDescriptionLabel + ':'), span({ class: 'card-value' }, content.description)) : null,
          br,
          audioHyperaxe({ controls: true, src: `/blob/${encodeURIComponent(content.url)}`, type: content.mimeType, preload: 'metadata' }),
          br,
          content.tags && content.tags.length
            ? div({ class: 'card-tags' }, content.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
            ))
            : null
        ) : null;
      case 'image':
        return content.url ? div({ class: 'search-image' },
          content.title ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.imageTitleLabel + ':'), span({ class: 'card-value' }, content.title)) : null,
          content.description ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.imageDescriptionLabel + ':'), span({ class: 'card-value' }, content.description)) : null,
          content.meme ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.trendingCategory + ':'), span({ class: 'card-value' }, i18n.meme)) : null,
          br,
          img({ src: `/blob/${encodeURIComponent(content.url)}` }),
          br,
          content.tags && content.tags.length
            ? div({ class: 'card-tags' }, content.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
            ))
            : null
        ) : null;
      case 'video':
        return content.url ? div({ class: 'search-video' },
          content.title ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.videoTitleLabel + ':'), span({ class: 'card-value' }, content.title)) : null,
          content.description ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.videoDescriptionLabel + ':'), span({ class: 'card-value' }, content.description)) : null,
          br,
          videoHyperaxe({ controls: true, src: `/blob/${encodeURIComponent(content.url)}`, type: content.mimeType || 'video/mp4', width: '640', height: '360' }),
          br,
          content.tags && content.tags.length
            ? div({ class: 'card-tags' }, content.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
            ))
            : null
        ) : null;
      case 'document':
        return div({ class: 'search-document' },
          content.title ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.documentTitleLabel + ':'), span({ class: 'card-value' }, content.title)) : null,
          br,
          content.description ? div({ class: 'card-field' }, span({ class: 'card-value' }, content.description)) : null,
          br,
          div({
            id: `pdf-container-${content.key || content.url}`,
            class: 'pdf-viewer-container',
            'data-pdf-url': `/blob/${encodeURIComponent(content.url)}`
          }),
          br,
          content.tags && content.tags.length
            ? div({ class: 'card-tags' }, content.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
            ))
            : null
        );
      case 'market':
        return div({ class: 'search-market' },
          content.title ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.title + ':'), span({ class: 'card-value' }, content.title)) : null,
          content.description ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.searchDescription + ':'), span({ class: 'card-value' }, content.description)) : null,
          content.item_type ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.marketItemType + ':'), span({ class: 'card-value' }, content.item_type.toUpperCase())) : null,
          content.status ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.marketItemCondition + ':'), span({ class: 'card-value' }, content.status)) : null,
          content.deadline ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.marketItemDeadline + ':'), span({ class: 'card-value' }, new Date(content.deadline).toLocaleString())) : null,
          br,
          content.image ? img({ src: `/blob/${encodeURIComponent(content.image)}`, class: 'market-image' }) : null,
          br,
          content.seller ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.marketItemSeller + ':'), span({ class: 'card-value' }, a({ class: "user-link", href: `/author/${encodeURIComponent(content.seller)}` }, content.seller))) : null,
          content.stock ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.marketItemStock + ':'), span({ class: 'card-value' }, content.stock || 'N/A')) : null,
          content.price ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.searchPriceLabel + ':'), span({ class: 'card-value' }, `${content.price} ECO`)) : null,
          content.condition ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.searchDescription + ':'), span({ class: 'card-value' }, content.condition)) : null,
          content.includesShipping ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.marketItemIncludesShipping + ':'), span({ class: 'card-value' }, `${content.includesShipping ? i18n.YESLabel : i18n.NOLabel}`)) : null,
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
            ? div({ class: 'card-tags' }, content.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
            ))
            : null
        );
      case 'bookmark':
        return div({ class: 'search-bookmark' },
          content.description ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.bookmarkDescriptionLabel + ':'), span({ class: 'card-value' }, content.description)) : null,
          content.url ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.bookmarkUrlLabel + ':'), span({ class: 'card-value' }, a({ href: content.url, target: '_blank' }, content.url))) : null,
          content.category ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.bookmarkCategory + ':'), span({ class: 'card-value' }, content.category)) : null,
          content.lastVisit ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.bookmarkLastVisit + ':'), span({ class: 'card-value' }, new Date(content.lastVisit).toLocaleString())) : null,
          content.tags && content.tags.length
            ? div({ class: 'card-tags' }, content.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
            ))
            : null
        );
      case 'task':
        return div({ class: 'search-task' },
          content.title ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.taskTitleLabel + ':'), span({ class: 'card-value' }, content.title)) : null,
          content.description ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.searchDescription + ':'), span({ class: 'card-value' }, content.description)) : null,
          content.location ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.searchLocationLabel + ':'), span({ class: 'card-value' }, content.location)) : null,
          content.status ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.searchStatusLabel + ':'), span({ class: 'card-value' }, content.status)) : null,
          content.priority ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.searchPriorityLabel + ':'), span({ class: 'card-value' }, content.priority)) : null,
          typeof content.isPublic === 'boolean' ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.searchIsPublicLabel + ':'), span({ class: 'card-value' }, content.isPublic ? i18n.YESLabel : i18n.NOLabel)) : null,
          content.startTime ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.taskStartTimeLabel + ':'), span({ class: 'card-value' }, new Date(content.startTime).toLocaleString())) : null,
          content.endTime ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.taskEndTimeLabel + ':'), span({ class: 'card-value' }, new Date(content.endTime).toLocaleString())) : null,
          Array.isArray(content.assignees) ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.taskAssignees + ':'), span({ class: 'card-value' }, content.assignees.length)) : null,
          content.tags && content.tags.length
            ? div({ class: 'card-tags' }, content.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
            ))
            : null
        );
      case 'report':
        return div({ class: 'search-report' },
          content.title ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.reportsTitleLabel + ':'), span({ class: 'card-value' }, content.title)) : null,
          content.status ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.searchStatusLabel + ':'), span({ class: 'card-value' }, content.status)) : null,
          content.severity ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.reportsSeverity + ':'), span({ class: 'card-value' }, content.severity)) : null,
          content.category ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.searchCategoryLabel + ':'), span({ class: 'card-value' }, content.category)) : null,
          content.description ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.searchDescription + ':'), span({ class: 'card-value' }, content.description)) : null,
          br,
          content.image ? img({ src: `/blob/${encodeURIComponent(content.image)}` }) : null,
          br,
          typeof content.confirmations === 'number' ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.reportsConfirmations + ':'), span({ class: 'card-value' }, content.confirmations)) : null,
          content.tags && content.tags.length
            ? div({ class: 'card-tags' }, content.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
            ))
            : null
        );
      case 'transfer':
        return div({ class: 'search-transfer' },
          content.concept ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.transfersConcept + ':'), span({ class: 'card-value' }, content.concept)) : null,
          content.deadline ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.transfersDeadline + ':'), span({ class: 'card-value' }, content.deadline)) : null,
          content.status ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.transfersStatus + ':'), span({ class: 'card-value' }, content.status)) : null,
          content.amount ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.transfersAmount + ':'), span({ class: 'card-value' }, content.amount)) : null,
          br,
          content.from ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.transfersFrom + ':'), span({ class: 'card-value' }, a({ class: "user-link", href: `/author/${encodeURIComponent(content.from)}` }, content.from))) : null,
          content.to ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.transfersTo + ':'), span({ class: 'card-value' }, a({ class: "user-link", href: `/author/${encodeURIComponent(content.to)}` }, content.to))) : null,
          br,
          content.confirmedBy && content.confirmedBy.length
            ? h2({ class: 'card-field' }, span({ class: 'card-label' }, i18n.transfersConfirmations + ':'), span({ class: 'card-value' }, content.confirmedBy.length))
            : null,
          content.tags && content.tags.length
            ? div({ class: 'card-tags' }, content.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`)
            ))
            : null
        );
      case 'curriculum':
        return div({ class: 'search-curriculum' },
          content.name ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.cvNameLabel + ':'), span({ class: 'card-value' }, content.name)) : null,
          content.description ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.cvDescriptionLabel + ':'), span({ class: 'card-value' }, content.description)) : null,
          content.photo ? img({ src: `/blob/${encodeURIComponent(content.photo)}`, class: 'curriculum-photo' }) : null,
          content.location ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.cvLocationLabel + ':'), span({ class: 'card-value' }, content.location)) : null,
          content.status ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.cvStatusLabel + ':'), span({ class: 'card-value' }, content.status)) : null,
          content.preferences ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.cvPreferencesLabel + ':'), span({ class: 'card-value' }, content.preferences)) : null,
          Array.isArray(content.personalSkills) && content.personalSkills.length
            ? div({ class: 'card-field' }, content.personalSkills.map(skill =>
                a({ href: `/search?query=%23${encodeURIComponent(skill)}`, class: 'tag-link' }, `#${skill}`)
              )) : null,
          Array.isArray(content.personalExperiences) && content.personalExperiences.length
            ? div({ class: 'card-field' }, content.personalExperiences.map(exp => p(exp))) : null,
          Array.isArray(content.oasisExperiences) && content.oasisExperiences.length
            ? div({ class: 'card-field' }, content.oasisExperiences.map(exp => p(exp))) : null,
          Array.isArray(content.oasisSkills) && content.oasisSkills.length
            ? div({ class: 'card-field' }, content.oasisSkills.map(skill => p(skill))) : null,
          Array.isArray(content.educationExperiences) && content.educationExperiences.length
            ? div({ class: 'card-field' }, content.educationExperiences.map(exp => p(exp))) : null,
          Array.isArray(content.educationalSkills) && content.educationalSkills.length
            ? div({ class: 'card-field' }, content.educationalSkills.map(skill =>
                a({ href: `/search?query=%23${encodeURIComponent(skill)}`, class: 'tag-link' }, `#${skill}`)
              )) : null,
          Array.isArray(content.languages) && content.languages.length
            ? div({ class: 'card-field' }, content.languages.map(lang => p(lang))) : null,
          Array.isArray(content.professionalExperiences) && content.professionalExperiences.length
            ? div({ class: 'card-field' }, content.professionalExperiences.map(exp => p(exp))) : null,
          Array.isArray(content.professionalSkills) && content.professionalSkills.length
            ? div({ class: 'card-field' }, content.professionalSkills.map(skill => p(skill))) : null
        );
      case 'bankWallet':
        return div({ class: 'search-bank-wallet' },
          content.address ? div({ class: 'card-field' },
            span({ class: 'card-label' }, i18n.bankWalletConnected + ':' ),
            span({ class: 'card-value' }, content.address)
          ) : null
        );
      case 'bankClaim':
        return div({ class: 'search-bank-claim' },
          div({ class: 'card-field' },
            span({ class: 'card-label' }, i18n.bankUbiReceived + ':' ),
            span({ class: 'card-value' }, `${Number(content.amount || 0).toFixed(6)} ECO`)
          ),
          content.epochId ? div({ class: 'card-field' },
            span({ class: 'card-label' }, i18n.bankEpochShort + ':' ),
            span({ class: 'card-value' }, content.epochId)
          ) : null,
          content.allocationId ? div({ class: 'card-field' },
            span({ class: 'card-label' }, i18n.bankAllocId + ':' ),
            span({ class: 'card-value' }, content.allocationId)
          ) : null,
          content.txid ? div({ class: 'card-field' },
            span({ class: 'card-label' }, i18n.bankTx + ':' ),
            a({ href: `https://ecoin.03c8.net/blockexplorer/search?q=${content.txid}`, target: '_blank' }, content.txid)
          ) : null
        );
      case 'job':
        return div({ class: 'search-job' },
          content.title ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.title + ':'), span({ class: 'card-value' }, content.title)) : null,
          content.salary ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.jobSalary + ':'), span({ class: 'card-value' }, `${content.salary} ECO`)) : null,
          content.status ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.jobStatus + ':'), span({ class: 'card-value' }, content.status.toUpperCase())) : null,
          content.job_type ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.jobType + ':'), span({ class: 'card-value' }, content.job_type.toUpperCase())) : null,
          content.location ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.jobLocation + ':'), span({ class: 'card-value' }, String(content.location).toUpperCase())) : null,
          content.vacants ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.jobVacants + ':'), span({ class: 'card-value' }, content.vacants)) : null,
          Array.isArray(content.subscribers) ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.jobSubscribers + ':'), span({ class: 'card-value' }, `${content.subscribers.length}`)) : null
        );
      case 'forum':
        return div({ class: 'search-forum' },
          content.root ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.title + ':'), span({ class: 'card-value' }, content.title || '')) : div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.title + ':'), span({ class: 'card-value' }, content.title || '')),
          content.text ? div({ class: 'card-field' }, span({ class: 'card-value' }, content.text)) : null
        );
      case 'vote':
        return div({ class: 'search-vote-link' },
          content.vote && content.vote.link ? p(a({ href: `/thread/${encodeURIComponent(content.vote.link)}#${encodeURIComponent(content.vote.link)}`, class: 'activityVotePost' }, content.vote.link)) : null
        );
      case 'contact':
        return div({ class: 'search-contact' },
          content.contact ? p(a({ href: `/author/${encodeURIComponent(content.contact)}`, class: 'activitySpreadInhabitant2' }, content.contact)) : null
        );
      case 'pub':
        return div({ class: 'search-pub' },
          content.address && content.address.key ? p(a({ href: `/author/${encodeURIComponent(content.address.key)}`, class: 'activitySpreadInhabitant2' }, content.address.key)) : null
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
            author = msg.value.author || i18n.anonymous || "Anonymous";
            authorUrl = `/author/${encodeURIComponent(msg.value.author)}`;
          } else if (content.type === 'report') {
            author = content.author || i18n.anonymous || "Anonymous";
            authorUrl = `/author/${encodeURIComponent(content.author || 'Anonymous')}`;
          } else if (content.type === 'votes') {
            author = content.createdBy || i18n.anonymous || "Anonymous";
            authorUrl = `/author/${encodeURIComponent(content.createdBy || 'Anonymous')}`;
          } else {
            author = content.author;
            authorUrl = `/author/${encodeURIComponent(content.author || 'Anonymous')}`;
          }

          const contentId = msg.key;
          const detailsButton = form({ method: "GET", action: getViewDetailsActionForSearch(content.type, contentId, content) },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
          );

          return div({ class: 'result-item' }, [
            detailsButton,
            br,
            contentHtml,
            author
              ? p({ class: 'card-footer' },
               span({ class: 'date-link' }, `${created} ${i18n.performed} `),
               a({ href: authorUrl, class: 'user-link' }, `${author}`)
            ): null,
          ]);
        })
      )
    )
    : div({ class: 'no-results' }, p(i18n.noResultsFound));

  let html = template(
    hashtag ? `#${hashtag}` : i18n.searchTitle,
    section(
      div({ class: "tags-header" },
        h2(hashtag ? `#${hashtag}` : i18n.searchTitle),
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
