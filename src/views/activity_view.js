const { div, h2, p, section, button, form, a, input, img, textarea, br, span, video: videoHyperaxe, audio: audioHyperaxe, table, tr, td, th } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const moment = require("../server/node_modules/moment");

function capitalize(str) {
  return typeof str === 'string' && str.length ? str[0].toUpperCase() + str.slice(1) : '';
}

function renderActionCards(actions) {
  const validActions = actions
    .filter(action => {
      const content = action.value?.content || action.content;
      if (!content || typeof content !== 'object') return false;
      if (content.type === 'tombstone') return false;
      if (content.type === 'post' && content.private === true) return false;
      if (content.type === 'tribe' && content.isAnonymous === true) return false;
      return true;
    })
    .sort((a, b) => b.ts - a.ts);

  if (!validActions.length) {
    return div({ class: "no-actions" }, p(i18n.noActions)); 
  }

  return validActions.map(action => {
    const date = action.ts ? new Date(action.ts).toLocaleString() : "";
    const userLink = action.author
      ? a({ href: `/author/${encodeURIComponent(action.author)}` }, action.author)
      : 'unknown';
    const type = action.type || 'unknown';
    const typeLabel = i18n[`type${capitalize(type)}`] || type;
    const content = action.content || {};
    const cardBody = [];

   if (type === 'votes') {
    const { question, deadline, status, votes, totalVotes } = content;
    const votesList = votes && typeof votes === 'object'
      ? Object.entries(votes).map(([option, count]) => ({ option, count }))
      : [];
    cardBody.push(
        h2({ class: 'type-label' }, `[${typeLabel}]`),
        form({ method: "GET", action: `/votes/${encodeURIComponent(action.id)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        h2(`${question}`),
        p(`${i18n.deadline}: ${deadline ? new Date(deadline).toLocaleString() : ''}`),
        h2(`${i18n.voteTotalVotes}: ${totalVotes}`),
        table(
            tr(...votesList.map(({ option }) => th(i18n[option] || option))),
            tr(...votesList.map(({ count }) => td(count)))
        )
    );
   }

    if (type === 'transfer') {
      const { from, to, concept, amount, deadline, status, tags, confirmedBy } = content;
      const validTags = Array.isArray(tags) ? tags : [];
      cardBody.push(
         h2({ class: 'type-label' }, `[${typeLabel}]`),
         form({ method: "GET", action: `/transfers/${encodeURIComponent(action.id)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
         ),
         h2(i18n.concept + ": " + concept),
         p(i18n.from + ": ", a({ href: `/author/${encodeURIComponent(from)}`, target: "_blank" }, from)),
         p(i18n.to + ": ", a({ href: `/author/${encodeURIComponent(to)}`, target: "_blank" }, to)),
         h2(i18n.amount + ": " + amount),
         p(i18n.deadline + ": " + (deadline ? new Date(deadline).toLocaleString() : "")),
         p(i18n.status + ": " + status),
         p(`${i18n.transfersConfirmations}: ${confirmedBy.length}/2`),
         validTags.length
            ? div(validTags.map(tag =>
               a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)
             ))
           : ""
      );
    }
    
    if (type === 'pixelia') {
      const { author } = content;
      cardBody.push(
         h2({ class: 'type-label' }, `[${typeLabel}]`),
         form({ method: "GET", action: `/pixelia` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
         ),
         p(`${i18n.activityPixelia} ${i18n.pixeliaBy}: `, a({ href: `/author/${encodeURIComponent(author)}` }, author)),
      );
    }

    if (type === 'tribe') {
      const { title, description, image, location, tags, isLARP, isAnonymous, members, createdAt, author } = content;
      const validTags = Array.isArray(tags) ? tags : [];
      cardBody.push(
        h2({ class: 'type-label' }, `[${typeLabel}]`),
        form({ method: "GET", action: `/tribe/${encodeURIComponent(action.id)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        h2(`${title}`),
        p(`${description || ''}`),
	image 
	  ? img({ src: `/blob/${encodeURIComponent(image)}`, class: 'feed-image' }) 
	  : img({ src: '/assets/images/default-tribe.png', class: 'feed-image' }),
        p(`${i18n.location || 'Location'}: ${location || ''}`),
        typeof isLARP === 'boolean' ? p(`LARP: ${isLARP ? 'Yes' : 'No'}`) : "",
        typeof isAnonymous === 'boolean' ? p(`Anonymous: ${isAnonymous ? 'Yes' : 'No'}`) : "",
        Array.isArray(members) ? h2(`${i18n.tribeMembersCount || 'Members'}: ${members.length}`) : "",
        createdAt ? p(`${i18n.createdAt}: ${new Date(createdAt).toLocaleString()}`) : "",
        author ? p(`${i18n.author}: `, a({ href: `/author/${encodeURIComponent(author)}` }, author)) : "",
        validTags.length
            ? div(validTags.map(tag =>
                a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)
              ))
            : ""
      );
    }

    if (type === 'curriculum') {
      const { author, name, description, photo, personalSkills, personalExperiences, oasisExperiences, oasisSkills, educationExperiences, educationalSkills, languages, professionalExperiences, professionalSkills, location, status,  preferences, createdAt} = content;
      cardBody.push(
        h2({ class: 'type-label' }, `[${typeLabel}]`),
        form({ method: "GET", action: `/inhabitant/${encodeURIComponent(action.author)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        h2(`${name}`),
        description ? p(`${i18n.description}: ${description}`) : "",
        photo ? img({ src: `/blob/${encodeURIComponent(photo)}`, class: 'feed-image' }) : "",
        location ? p(`${i18n.cvLocationLabel || 'Location'}: ${location}`) : "",
        languages ? p(`${i18n.cvLanguagesLabel || 'Languages'}: ${languages}`) : "",
        createdAt ? p(`${i18n.cvCreatedAt}: ${new Date(createdAt).toLocaleString()}`) : "".
        br,
        personalExperiences ? p(`${i18n.cvPersonalExperiencesLabel || 'Personal Experiences'}: ${personalExperiences}`) : "",
        personalSkills && personalSkills.length
            ? div(personalSkills.map(skill =>
                a({ href: `/search?query=%23${encodeURIComponent(skill)}`, class: "tag-link" }, `#${skill}`)
            )) : "",
        oasisExperiences ? p(`${i18n.cvOasisExperiencesLabel || 'Oasis Experiences'}: ${oasisExperiences}`) : "",
        oasisSkills && oasisSkills.length
            ? div(oasisSkills.map(skill =>
                a({ href: `/search?query=%23${encodeURIComponent(skill)}`, class: "tag-link" }, `#${skill}`)
            )) : "",
        educationExperiences ? p(`${i18n.cvEducationExperiencesLabel || 'Education Experiences'}: ${educationExperiences}`) : "",
        educationalSkills && educationalSkills.length
            ? div(educationalSkills.map(skill =>
                a({ href: `/search?query=%23${encodeURIComponent(skill)}`, class: "tag-link" }, `#${skill}`)
            )) : "",
        professionalExperiences ? p(`${i18n.cvProfessionalExperiencesLabel || 'Professional Experiences'}: ${professionalExperiences}`) : "",
        professionalSkills && professionalSkills.length
            ? div(professionalSkills.map(skill =>
                a({ href: `/search?query=%23${encodeURIComponent(skill)}`, class: "tag-link" }, `#${skill}`)
            )) : "",
        status ? h2(`${i18n.cvStatusLabel}: ${status}`) : "",
        preferences ? p(`${i18n.cvPreferencesLabel || 'Preferences'}: ${preferences}`) : "",
        h2(`${i18n.activityContact}: `, a({ href: `/author/${encodeURIComponent(action.author)}` }, action.author))
      );
    }

    if (type === 'image') {
      const { url, title, description, tags, meme } = content;
      const validTags = Array.isArray(tags) ? tags : [];
        cardBody.push(
        h2({ class: 'type-label' }, `[${typeLabel}]`),
        form({ method: "GET", action: `/images/${encodeURIComponent(action.id)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        title ? h2(title) : "",
        description ? p(description) : "",
        meme ? h2(`${i18n.trendingCategory}: ${i18n.meme}`) : "",
        img({ src: `/blob/${encodeURIComponent(url)}`, class: 'feed-image' }),
        br,
        validTags.length
           ? div(validTags.map(tag =>
               a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)
             ))
           : ""
      );
    }

    if (content.type === 'audio') {
      const { url, mimeType, title, description, tags } = content;
      const validTags = Array.isArray(tags) ? tags : [];
      cardBody.push(
        h2({ class: 'type-label' }, `[${typeLabel}]`),
        form({ method: "GET", action: `/audios/${encodeURIComponent(action.id)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        title?.trim() ? h2(title) : "",
        description?.trim() ? p(description) : "",
        url
          ? div({ class: "audio-container" },
              audioHyperaxe({
                controls: true,
                src: `/blob/${encodeURIComponent(url)}`,
                type: mimeType
              })
            )
          : p(i18n.audioNoFile),
        validTags.length
           ? div(validTags.map(tag =>
               a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)
             ))
           : ""
      );
    }

    if (content.type === 'video') {
      const { url, mimeType, title, description, tags } = content;
      const validTags = Array.isArray(tags) ? tags : [];
      cardBody.push(
        h2({ class: 'type-label' }, `[${typeLabel}]`),
        form({ method: "GET", action: `/videos/${encodeURIComponent(action.id)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        title?.trim() ? h2(title) : "",
        description?.trim() ? p(description) : "",
        url
          ? div({ class: "video-container" },
              videoHyperaxe({
                controls: true,
                src: `/blob/${encodeURIComponent(url)}`,
                type: mimeType,
                preload: 'metadata',
                width: '640',
                height: '360'
              })
            )
          : p(i18n.videoNoFile),
        validTags.length
           ? div(validTags.map(tag =>
               a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)
             ))
           : ""
      );
    }

    if (content.type === 'document') {
       const { url, title, description, tags, key } = content;
       const validTags = Array.isArray(tags) ? tags : [];
       cardBody.push(
        h2({ class: 'type-label' }, `[${typeLabel}]`),
        form({ method: "GET", action: `/documents/${encodeURIComponent(action.id)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        title?.trim() ? h2(title) : "",
        description?.trim() ? p(description) : "",
        div({
          id: `pdf-container-${key || url}`,
          class: 'pdf-viewer-container',
          'data-pdf-url': `/blob/${encodeURIComponent(url)}`
        }),
        tags.length
          ? div(validTags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)
            ))
          : null
      );
    }

    if (type === 'bookmark') {
      const { author, url, tags, description, category, lastVisit } = content;
      const validTags = Array.isArray(tags) ? tags : [];
      cardBody.push(
        h2({ class: 'type-label' }, `[${typeLabel}]`),
        form({ method: "GET", action: `/bookmarks/${encodeURIComponent(action.id)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        description ? p(`${description}`) : "",  
        h2(url ? p(a({ href: url, target: '_blank', class: "bookmark-url" }, url)) : ""),
        category ? p(`${i18n.bookmarkCategory}: ${category}`) : "",
        lastVisit ? p(`${i18n.bookmarkLastVisit}: ${new Date(lastVisit).toLocaleString()}`) : "",
        validTags.length
            ? div(validTags.map(tag =>
                a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)
              ))
            : ""
        );
    }

    if (type === 'event') {
        const { title, description, date, location, price, url: eventUrl, attendees, tags, organizer, status, isPublic } = content;
        const validTags = Array.isArray(tags) ? tags : [];
        cardBody.push(
          h2({ class: 'type-label' }, `[${typeLabel}]`),
          form({ method: "GET", action: `/events/${encodeURIComponent(action.id)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
          ),
            p(`${i18n.title}: ${title}`),
            description ? p(`${i18n.description}: ${description}`) : "",
            date ? p(`${i18n.date}: ${new Date(date).toLocaleString()}`) : "",
            location ? p(`${i18n.location || 'Location'}: ${location}`) : "",
            status ? p(`${i18n.status}: ${status}`) : "",
            typeof isPublic === 'boolean' ? p(`${i18n.isPublic || 'Public'}: ${isPublic ? 'Yes' : 'No'}`) : "",
            price ? p(`${i18n.price || 'Price'}: ${price} ECO`) : "",
            eventUrl ? p(`${i18n.trendingUrl}: `, a({ href: eventUrl, target: '_blank' }, eventUrl)) : "",
            organizer ? p(`${i18n.organizer || 'Organizer'}: `, a({ href: `/author/${encodeURIComponent(organizer)}` }, organizer)) : "",
            Array.isArray(attendees) ? p(`${i18n.attendees}: ${attendees.length}`) : "",
            validTags.length
            ? div(validTags.map(tag =>
               a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)
             ))
            : "",
        );
    }

    if (type === 'task') {
        const { title, description, startTime, endTime, priority, location, tags, isPublic, assignees, status, author } = content;
        const validTags = Array.isArray(tags) ? tags : [];
        cardBody.push(
          h2({ class: 'type-label' }, `[${typeLabel}]`),
          form({ method: "GET", action: `/tasks/${encodeURIComponent(action.id)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
          ),
            p(`${i18n.title}: ${title}`),
            description ? p(`${i18n.description}: ${description}`) : "",
            startTime ? p(`${i18n.startTime || 'Start'}: ${new Date(startTime).toLocaleString()}`) : "",
            endTime ? p(`${i18n.endTime || 'End'}: ${new Date(endTime).toLocaleString()}`) : "",
            priority ? p(`${i18n.priority || 'Priority'}: ${priority}`) : "",
            location ? p(`${i18n.location || 'Location'}: ${location}`) : "",
            validTags.length
             ? div(validTags.map(tag =>
               a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)
             ))
            : "",
            typeof isPublic === 'boolean' ? p(`${i18n.isPublic || 'Public'}: ${isPublic ? 'Yes' : 'No'}`) : "",
            Array.isArray(assignees) ? p(`${i18n.taskAssignees || 'Assignees'}: ${assignees.length}`) : "",
            status ? p(`${i18n.status}: ${status}`) : "",
            author ? p(`${i18n.author || 'Author'}: `, a({ href: `/author/${encodeURIComponent(author)}` }, author)) : ""
        );
    }
    
    if (type === 'feed') {
      const { text, author, createdAt, opinions, opinions_inhabitants, refeeds, refeeds_inhabitants } = content;
      cardBody.push(
        h2({ class: 'type-label' }, `[${typeLabel}]`),
        h2(text),
        p(i18n.author + ": ", a({ href: `/author/${encodeURIComponent(author)}`, target: "_blank" }, author)),
        p(i18n.createdAt + ": " + new Date(createdAt).toLocaleString()),
        h2(i18n.tribeFeedRefeeds + ": " + refeeds)
      );
    }
    
    if (type === 'post') {
      const { contentWarning, text } = content;
      cardBody.push(
        h2({ class: 'type-label' }, `[${typeLabel}]`),
        form({ method: "GET", action: `/thread/${encodeURIComponent(action.id)}#${encodeURIComponent(action.id)}` },
          button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        contentWarning ? h2(contentWarning) : '',
        p({ innerHTML: text })
      );
   }
   
   if (type === 'vote') {
     const { vote } = content;
     cardBody.push(
       h2({ class: 'type-label' }, `[${typeLabel}]`),
       p(
         a({ href: `/author/${encodeURIComponent(action.author)}` }, action.author),
         ` ${i18n.activitySpread} `,
         a({ href: `/thread/${encodeURIComponent(vote.link)}#${encodeURIComponent(vote.link)}` }, vote.link)
       )
     );
   }
   
   if (type === 'about') {
     const { about, name, description } = content;
     cardBody.push(
       h2({ class: 'type-label' }, `[${typeLabel}]`),
        form({ method: "GET", action: `/author/${encodeURIComponent(action.author)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
         ),
         h2(a({ href: `/author/${encodeURIComponent(about)}` },`@`,name)),
         p(description)
     );
   }  
   
    if (type === 'contact') {
      const { contact } = content;
      cardBody.push(
        h2({ class: 'type-label' }, `[${typeLabel}]`),
        form({ method: "GET", action: `/inhabitants` },
          button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
      p(
      `${i18n.activitySupport}: `,
      a({ href: `/author/${encodeURIComponent(action.author)}` }, action.author),
      span({ class: 'action-meta' }, " <-> "),
      a({ href: `/author/${encodeURIComponent(contact)}` }, contact)
      )
      );
    }
    
    if (type === 'pub') {
      const { address } = content;
      const { host, key } = address;
      cardBody.push(
        h2({ class: 'type-label' }, `[${typeLabel}]`),
          form({ method: "GET", action: `/invites` },
          button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
	p(
	  ` ${i18n.activityJoin}: `,
	  a({ href: `/author/${encodeURIComponent(action.author)}` }, action.author),
          span({ class: 'action-meta' }, " -> "),
	  a({ href: `/author/${encodeURIComponent(key)}` }, key),
	  ` (`,
	  host,
	  `)`
	)
      );
    }
    
    if (type === 'market') {
      const { item_type, title, description, price, tags, status, item_status, deadline, includesShipping, seller, image, auctions_poll } = content;
      const validTags = Array.isArray(tags) ? tags : [];
      cardBody.push(
        h2({ class: 'type-label' }, `[${typeLabel}]`),
        form({ method: "GET", action: `/market/${encodeURIComponent(action.id)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        p(i18n.marketItemTitle + ": " + title),
        p(i18n.marketItemDescription + ": " + description),
        image
            ? img({ src: `/blob/${encodeURIComponent(image)}` })
            : img({ src: '/assets/images/default-market.png', alt: title }),
        p(i18n.marketItemType + ": " + item_type),
        p(i18n.marketItemCondition + ": " + item_status),
        p(i18n.marketItemIncludesShipping + ": " + (includesShipping ? i18n.YESLabel : i18n.NOLabel)),
        p(i18n.deadline + ": " + (deadline ? new Date(deadline).toLocaleString() : "")),
        p(`${i18n.marketItemSeller}: `, a({ href: `/author/${encodeURIComponent(seller)}` }, seller)),
        validTags.length
           ? div(validTags.map(tag =>
               a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)
             ))
           : "",
        h2(i18n.marketItemStatus + ": " + status),
        div({ class: "market-card price" },
          p(`${i18n.marketItemPrice}: ${price} ECO`)
        ),
    );
    if (item_type === 'auction') {
        if (status !== 'SOLD' && status !== 'DISCARDED') {
            cardBody.push(
                div({ class: "auction-info" },
                    auctions_poll && auctions_poll.length > 0
                        ? [
                            p({ class: "auction-bid-text" }, i18n.marketAuctionBids),
                            table({ class: 'auction-bid-table' },
                                tr(
                                    th(i18n.marketAuctionBidTime),
                                    th(i18n.marketAuctionUser),
                                    th(i18n.marketAuctionBidAmount)
                                ),
                                auctions_poll.map(bid => {
                                    const [userId, bidAmount, bidTime] = bid.split(':');
                                    return tr(
                                        td(moment(bidTime).format('YYYY-MM-DD HH:mm:ss')),
                                        td(a({ href: `/author/${encodeURIComponent(userId)}` }, userId)),
                                        td(`${parseFloat(bidAmount).toFixed(6)} ECO`)
                                    );
                                })
                            )
                        ]
                        : p(i18n.marketNoBids),
                    form({ method: "POST", action: `/market/bid/${encodeURIComponent(action.id)}` },
                        input({ type: "number", name: "bidAmount", step: "0.000001", min: "0.000001", placeholder: i18n.marketYourBid, required: true }),
                        br(),
                        button({ class: "buy-btn", type: "submit" }, i18n.marketPlaceBidButton)
                    )
                )
            );
        }
    }
    if (item_type === 'exchange') {
        if (status !== 'SOLD' && status !== 'DISCARDED') {
            cardBody.push(
                form({ method: "POST", action: `/market/buy/${encodeURIComponent(action.id)}` },
                    button({ class: "buy-btn", type: "submit" }, i18n.marketActionsBuy)
                )
            );
        }
    }
  }

    if (type === 'report') {
        const { title, description, category, createdAt, author, image, tags, confirmations, severity, status, isAnonymous } = content;
        const validTags = Array.isArray(tags) ? tags : [];
        cardBody.push(
          h2({ class: 'type-label' }, `[${typeLabel}]`),
          form({ method: "GET", action: `/reports/${encodeURIComponent(action.id)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
          ),
            p(`${i18n.title}: ${title}`),
            description ? p(`${i18n.description}: ${description}`) : "",
            category ? p(`${i18n.category}: ${category}`) : "",
            severity ? p(`${i18n.severity || 'Severity'}: ${severity}`) : "",
            status ? p(`${i18n.status}: ${status}`) : "",
            image ? img({ src: `/blob/${encodeURIComponent(image)}`, class: 'feed-image' }) : "",
            createdAt ? p(`${i18n.reportsCreatedAt}: ${new Date(createdAt).toLocaleString()}`) : "",    
	    p(`${i18n.author || 'Author'}: `, 
		  typeof isAnonymous === 'boolean' 
		    ? (isAnonymous 
			? i18n.reportsAnonymousAuthor || 'Anonymous' 
			: a({ href: `/author/${encodeURIComponent(author)}`, target: '_blank' }, author)) 
		    : author ? a({ href: `/author/${encodeURIComponent(author)}`, target: '_blank' }, author) : ""
		),
            Array.isArray(confirmations) ? h2(`${i18n.confirmations || 'Confirmations'}: ${confirmations.length}`) : "",
            validTags.length
             ? div(validTags.map(tag =>
               a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)
             ))
             : ""
        );
    }

    return div({ class: 'action-card' },
      p({ class: 'action-meta' }, `${date} ${i18n.performed} `, userLink),
      ...cardBody
    );
  });
}

exports.activityView = (actions, filter, userId) => {
  const title = filter === 'mine' ? i18n.yourActivity : i18n.globalActivity;
  const desc = i18n.activityDesc;

  const activityTypes = [
    { type: 'recent', label: i18n.typeRecent },
    { type: 'all', label: i18n.allButton },
    { type: 'mine', label: i18n.mineButton },
    { type: 'votes', label: i18n.typeVotes },
    { type: 'event', label: i18n.typeEvent },
    { type: 'task', label: i18n.typeTask },
    { type: 'report', label: i18n.typeReport },
    { type: 'tribe', label: i18n.typeTribe },
    { type: 'about', label: i18n.typeAbout },
    { type: 'curriculum', label: i18n.typeCurriculum },
    { type: 'market', label: i18n.typeMarket },
    { type: 'transfer', label: i18n.typeTransfer },
    { type: 'feed', label: i18n.typeFeed },
    { type: 'post', label: i18n.typePost },
    { type: 'pixelia', label: i18n.typePixelia },
    { type: 'bookmark', label: i18n.typeBookmark },
    { type: 'image', label: i18n.typeImage },
    { type: 'video', label: i18n.typeVideo },
    { type: 'audio', label: i18n.typeAudio },
    { type: 'document', label: i18n.typeDocument }
  ];
  let filteredActions;
  if (filter === 'mine') {
    filteredActions = actions.filter(action => actions.author === userId && action.type !== 'tombstone');
  } else if (filter === 'recent') {
    const now = Date.now();
    filteredActions = actions.filter(action => 
      action.type !== 'tombstone' && action.ts && now - action.ts < 24 * 60 * 60 * 1000 
    );
  } else {
    filteredActions = actions.filter(action => (action.type === filter || filter === 'all') && action.type !== 'tombstone');
  }

  let html = template(
    title,
    section(
      div({ class: 'tags-header' },
        h2(i18n.activityList),
        p(desc)
        ),
        form({ method: 'GET', action: '/activity' },
          div({ class: 'mode-buttons', style: 'display:grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-bottom: 24px;' },
            div({
              style: 'display: flex; flex-direction: column; gap: 8px;'
            },
              activityTypes.slice(0, 3).map(({ type, label }) =>
                form({ method: 'GET', action: '/activity' },
                  input({ type: 'hidden', name: 'filter', value: type }),
                  button({ type: 'submit', class: filter === type ? 'filter-btn active' : 'filter-btn' }, label)
                )
              )
            ),
            div({
              style: 'display: flex; flex-direction: column; gap: 8px;'
            },
              activityTypes.slice(3, 7).map(({ type, label }) =>
                form({ method: 'GET', action: '/activity' },
                  input({ type: 'hidden', name: 'filter', value: type }),
                  button({ type: 'submit', class: filter === type ? 'filter-btn active' : 'filter-btn' }, label)
                )
              )
            ),
            div({
              style: 'display: flex; flex-direction: column; gap: 8px;'
            },
              activityTypes.slice(7, 11).map(({ type, label }) =>
                form({ method: 'GET', action: '/activity' },
                  input({ type: 'hidden', name: 'filter', value: type }),
                  button({ type: 'submit', class: filter === type ? 'filter-btn active' : 'filter-btn' }, label)
                )
              )
            ),
            div({
              style: 'display: flex; flex-direction: column; gap: 8px;'
            },
              activityTypes.slice(11, 15).map(({ type, label }) =>
                form({ method: 'GET', action: '/activity' },
                  input({ type: 'hidden', name: 'filter', value: type }),
                  button({ type: 'submit', class: filter === type ? 'filter-btn active' : 'filter-btn' }, label)
                )
              )
            ),
            div({
              style: 'display: flex; flex-direction: column; gap: 8px;'
            },
              activityTypes.slice(15, 20).map(({ type, label }) =>
                form({ method: 'GET', action: '/activity' },
                  input({ type: 'hidden', name: 'filter', value: type }),
                  button({ type: 'submit', class: filter === type ? 'filter-btn active' : 'filter-btn' }, label)
                )
              )
            )
          )
        ),
      section({ class: 'feed-container' }, renderActionCards(filteredActions))
    )
  );
  const hasDocument = actions.some(a => a && a.type === 'document');
  if (hasDocument) {
    html += `
      <script type="module" src="/js/pdf.min.mjs"></script>
      <script src="/js/pdf-viewer.js"></script>
    `;
  }
  return html;
};

