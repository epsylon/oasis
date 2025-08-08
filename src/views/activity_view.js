const { div, h2, p, section, button, form, a, input, img, textarea, br, span, video: videoHyperaxe, audio: audioHyperaxe, table, tr, td, th } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const moment = require("../server/node_modules/moment");
const { renderUrl } = require('../backend/renderUrl');

function capitalize(str) {
  return typeof str === 'string' && str.length ? str[0].toUpperCase() + str.slice(1) : '';
}

function renderActionCards(actions, userId) {
  const validActions = actions
    .filter(action => {
      const content = action.value?.content || action.content;
      if (!content || typeof content !== 'object') return false;
      if (content.type === 'tombstone') return false;
      if (content.type === 'post' && content.private === true) return false;
      if (content.type === 'tribe' && content.isAnonymous === true) return false;
      if (content.type === 'task' && content.isPublic === "PRIVATE") return false;
      if (content.type === 'event' && content.isPublic === "private") return false;
      if (content.type === 'market') {
        if (content.stock === 0 && content.status !== 'SOLD') {
          return false; 
        }
      }
      return true;
    })
    .sort((a, b) => b.ts - a.ts);

  if (!validActions.length) {
    return div({ class: "no-actions" }, p(i18n.noActions)); 
  }
  
  const seenDocumentTitles = new Set();

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
        div({ class: 'card-section votes' }, 
          div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.question + ':'), span({ class: 'card-value' }, question)),
          div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.deadline + ':'), span({ class: 'card-value' }, deadline ? new Date(deadline).toLocaleString() : '')),
          div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.voteTotalVotes + ':'), span({ class: 'card-value' }, totalVotes)),
          table(
            tr(...votesList.map(({ option }) => th(i18n[option] || option))),
            tr(...votesList.map(({ count }) => td(count)))
          )
        )
      );
    }

    if (type === 'transfer') {
      const { from, to, concept, amount, deadline, status, confirmedBy } = content;
      cardBody.push(
        div({ class: 'card-section transfer' }, 
          div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.concept + ':'), span({ class: 'card-value' }, concept)),
          div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.amount + ':'), span({ class: 'card-value' }, amount)),
          div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.deadline + ':'), span({ class: 'card-value' }, deadline ? new Date(deadline).toLocaleString() : '')),
          div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.status + ':'), span({ class: 'card-value' }, status))
        )
      );
    }

    if (type === 'pixelia') {
       const { author } = content;
       cardBody.push(
	 div({ class: 'card-section pixelia' },
	   div({ class: 'card-field' },
	      a({ href: `/author/${encodeURIComponent(author)}`, class: 'activityVotePost' }, author)
	   )
	 )
       );
    }

    if (type === 'tribe') {
      const { title, image, description, tags, isLARP, inviteMode, isAnonymous, members } = content;
      const validTags = Array.isArray(tags) ? tags : [];
      cardBody.push(
        div({ class: 'card-section tribe' },
	h2({ class: 'tribe-title' }, 
	  a({ href: `/tribe/${encodeURIComponent(action.id)}`, class: "user-link" }, title)
	),
          typeof isAnonymous === 'boolean' ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.tribeIsAnonymousLabel+ ':'), span({ class: 'card-value' }, isAnonymous ? i18n.tribePrivate : i18n.tribePublic)) : "",      
          inviteMode ? div({ class: 'card-field' }, span({ class: 'card-label' }, (i18n.tribeModeLabel) + ':'), span({ class: 'card-value' }, inviteMode.toUpperCase())) : "",
          typeof isLARP === 'boolean' ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.tribeLARPLabel+ ':'), span({ class: 'card-value' }, isLARP ? i18n.tribeYes : i18n.tribeNo)) : "",
          Array.isArray(members) ? div({ class: 'card-field' }, span({ class: 'card-label' }, (i18n.tribeMembersCount) + ':'), span({ class: 'card-value' }, members.length)) : "",
          br(),
          image
            ? img({ src: `/blob/${encodeURIComponent(image)}`, class: 'feed-image tribe-image' })
            : img({ src: '/assets/images/default-tribe.png', class: 'feed-image tribe-image' }),
          p({ class: 'tribe-description' }, ...renderUrl(description || '')),
          validTags.length
            ? div({ class: 'card-tags' }, validTags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)))
            : ""
        )
      );
    }

    if (type === 'curriculum') {
      const { author, name, description, photo, personalSkills, oasisSkills, educationalSkills, languages, professionalSkills, status, preferences, createdAt, updatedAt} = content;
      cardBody.push(
        div({ class: 'card-section curriculum' },
          h2(a({ href: `/author/${encodeURIComponent(author)}`, class: "user-link" }, `@`, name)),
          div(
          { class: 'card-fields-container' },
	  createdAt ? 
	   div(
	    { class: 'card-field' },
	    span({ class: 'card-label' }, i18n.cvCreatedAt + ':'),
	    span({ class: 'card-value' }, moment(createdAt).format('YYYY-MM-DD HH:mm:ss'))
	  ) 
	  : "",
	  updatedAt ? 
	  div(
	    { class: 'card-field' },
	    span({ class: 'card-label' }, i18n.cvUpdatedAt + ':'),
	    span({ class: 'card-value' }, moment(updatedAt).format('YYYY-MM-DD HH:mm:ss'))
	  ) 
     	  : ""
     	  ),
          status ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.cvStatusLabel + ':'), span({ class: 'card-value' }, status)) : "",
          preferences ? div({ class: 'card-field' }, span({ class: 'card-label' }, (i18n.cvPreferencesLabel || 'Preferences') + ':'), span({ class: 'card-value' }, preferences)) : "",
          languages ? div({ class: 'card-field' }, span({ class: 'card-label' }, (i18n.cvLanguagesLabel || 'Languages') + ':'), span({ class: 'card-value' }, languages.toUpperCase())) : "",
	  photo ? 
	  [
	    br(),
	    img({ class: "cv-photo", src: `/blob/${encodeURIComponent(photo)}` }),
	    br()
	  ]
	: "",
	  p(...renderUrl(description || "")),
	  personalSkills && personalSkills.length
	  ? div({ class: 'card-tags' }, personalSkills.map(skill =>
	      a({ href: `/search?query=%23${encodeURIComponent(skill)}`, class: "tag-link" }, `#${skill}`)
	  )) : "",
	  oasisSkills && oasisSkills.length
	  ? div({ class: 'card-tags' }, oasisSkills.map(skill =>
	      a({ href: `/search?query=%23${encodeURIComponent(skill)}`, class: "tag-link" }, `#${skill}`)
	  )) : "",
	  educationalSkills && educationalSkills.length
	  ? div({ class: 'card-tags' }, educationalSkills.map(skill =>
	      a({ href: `/search?query=%23${encodeURIComponent(skill)}`, class: "tag-link" }, `#${skill}`)
	  )) : "",
	  professionalSkills && professionalSkills.length
	  ? div({ class: 'card-tags' }, professionalSkills.map(skill =>
	      a({ href: `/search?query=%23${encodeURIComponent(skill)}`, class: "tag-link" }, `#${skill}`)
	  )) : "",
        )
      );
    }

    if (type === 'image') {
      const { url } = content;
      cardBody.push(
        div({ class: 'card-section image' },    
          img({ src: `/blob/${encodeURIComponent(url)}`, class: 'feed-image img-content' })
        )
      );
    }

    if (content.type === 'audio') {
      const { url, mimeType, title } = content;
      cardBody.push(
        div({ class: 'card-section audio' }, 
          title?.trim() ? h2({ class: 'audio-title' }, title) : "",
          url
            ? div({ class: "audio-container" },
                audioHyperaxe({
                  controls: true,
                  src: `/blob/${encodeURIComponent(url)}`,
                  type: mimeType
                })
              )
            : p(i18n.audioNoFile),
        )
      );
    }

    if (type === 'video') {
      const { url, mimeType, title } = content;
      cardBody.push(
        div({ class: 'card-section video' },     
          title?.trim() ? h2({ class: 'video-title' }, title) : "",
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
            : p(i18n.videoNoFile)
        )
      );
    }

    if (type === 'document') {
      const { url, title, key } = content;
      if (title && seenDocumentTitles.has(title.trim())) {
        return null;
     }
      if (title) seenDocumentTitles.add(title.trim());
      cardBody.push(
        div({ class: 'card-section document' },      
          title?.trim() ? h2({ class: 'document-title' }, title) : "",
          div({
            id: `pdf-container-${key || url}`,
            class: 'pdf-viewer-container',
            'data-pdf-url': `/blob/${encodeURIComponent(url)}`
          })
        )
      );
    }

    if (type === 'bookmark') {
      const { url } = content;
      cardBody.push(
        div({ class: 'card-section bookmark' },       
          h2(url ? p(a({ href: url, target: '_blank', class: "bookmark-url" }, url)) : "")
        )
      );
    }

    if (type === 'event') {
      const { title, description, date, location, price, attendees, organizer, isPublic } = content;
      cardBody.push(
        div({ class: 'card-section event' },    
        div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.title + ':'), span({ class: 'card-value' }, title)),
        date ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.date + ':'), span({ class: 'card-value' }, new Date(date).toLocaleString())) : "",
        location ? div({ class: 'card-field' }, span({ class: 'card-label' }, (i18n.location || 'Location') + ':'), span({ class: 'card-value' }, location)) : "",
        typeof isPublic === 'boolean' ? div({ class: 'card-field' }, span({ class: 'card-label' }, (i18n.isPublic || 'Public') + ':'), span({ class: 'card-value' }, isPublic ? 'Yes' : 'No')) : "",
        price ? div({ class: 'card-field' }, span({ class: 'card-label' }, (i18n.price || 'Price') + ':'), span({ class: 'card-value' }, price + " ECO")) : "",
        br,
        organizer ? div({ class: 'card-field' }, span({ class: 'card-label' }, (i18n.organizer || 'Organizer') + ': '), a({ class: "user-link", href: `/author/${encodeURIComponent(organizer)}` }, organizer)) : "",
          Array.isArray(attendees) ? h2({ class: 'card-label' }, (i18n.attendees || 'Attendees') + ': ' + attendees.length) : "",   
        )
      );
    }

    if (type === 'task') {
      const { title, startTime, endTime, priority, status, author } = content;
      cardBody.push(
        div({ class: 'card-section task' },
          div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.title + ':'), span({ class: 'card-value' }, title)),
          priority ? div({ class: 'card-field' }, span({ class: 'card-label' }, (i18n.priority || 'Priority') + ':'), span({ class: 'card-value' }, priority)) : "",
          startTime ? div({ class: 'card-field' }, span({ class: 'card-label' }, (i18n.taskStartTimeLabel || 'Start') + ':'), span({ class: 'card-value' }, new Date(startTime).toLocaleString())) : "",
          endTime ? div({ class: 'card-field' }, span({ class: 'card-label' }, (i18n.taskEndTimeLabel || 'End') + ':'), span({ class: 'card-value' }, new Date(endTime).toLocaleString())) : "",
          status ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.status + ':'), span({ class: 'card-value' }, status)) : "",
        )
      );
    }

    if (type === 'feed') {
      const { renderTextWithStyles } = require('../backend/renderTextWithStyles');
      const { text, refeeds } = content;
      cardBody.push(
        div({ class: 'card-section feed' }, 
          div({ class: 'feed-text', innerHTML: renderTextWithStyles(text) }),
          h2({ class: 'card-field' }, span({ class: 'card-label' }, i18n.tribeFeedRefeeds + ': '), span({ class: 'card-label' }, refeeds))
        )
      );
    }

    if (type === 'post') {
      const { contentWarning, text } = content;
      cardBody.push(
        div({ class: 'card-section post' },
          contentWarning ? h2({ class: 'content-warning' }, contentWarning) : '',
          p({ innerHTML: text }) 
        )
      );
    }
    
    if (type === 'forum') {
        const { root, category, title, text, key } = content;
        if (!root) {
            cardBody.push(
                div({ class: 'card-section forum' },
                    div({ class: 'card-field', style: "font-size:1.12em; margin-bottom:5px;" },
                        span({ class: 'card-label', style: "font-weight:800;color:#ff9800;" }, i18n.title + ': '),
                        a({ href: `/forum/${encodeURIComponent(key || action.id)}`, style: "font-weight:800;color:#4fc3f7;" }, title)
                    ),
                )
            )
        } else {
            let parentForum = actions.find(a => a.type === 'forum' && !a.content.root && (a.id === root || a.content.key === root));
            let parentCategory = parentForum?.content?.category || '';
            let parentTitle = parentForum?.content?.title || '';
            cardBody.push(
                div({ class: 'card-section forum' },
                    div({ class: 'card-field', style: "font-size:1.12em; margin-bottom:5px;" },
                        span({ class: 'card-label', style: "font-weight:800;color:#ff9800;" }, i18n.title + ': '),
                        a({ href: `/forum/${encodeURIComponent(root)}`, style: "font-weight:800;color:#4fc3f7;" }, parentTitle)
                    ),
                    br(),
                    div({ class: 'card-field', style: 'margin-bottom:12px;' },
                        p({ style: "margin:0 0 8px 0; word-break:break-all;" }, ...renderUrl(text))
                    )
                )
            )
        }
    }

    if (type === 'vote') {
      const { vote } = content;
      cardBody.push(
        div({ class: 'card-section vote' },
           p(
        	a({ href: `/thread/${encodeURIComponent(vote.link)}#${encodeURIComponent(vote.link)}`, class: 'activityVotePost' }, vote.link)
	      )
	    )
	  );
	}

    if (type === 'about') {
      const { about, name, image } = content;
      cardBody.push(
        div({ class: 'card-section about' },
        h2(a({ href: `/author/${encodeURIComponent(about)}`, class: "user-link" }, `@`, name)),
          image
            ? img({ src: `/blob/${encodeURIComponent(image)}` })
            : img({ src: '/assets/images/default-avatar.png', alt: name })
        )
      );
    }

    if (type === 'contact') {
      const { contact } = content;
      cardBody.push(
	div({ class: 'card-section contact' },
	   p({ class: 'card-field' }, 
            a({ href: `/author/${encodeURIComponent(contact)}`, class: 'activitySpreadInhabitant2' }, contact)
	   )
	 )
      );
     }

    if (type === 'pub') {
      const { address } = content;
      const { host, key } = address;
      cardBody.push(
        div({ class: 'card-section pub' },
	   p({ class: 'card-field' },
            a({ href: `/author/${encodeURIComponent(key)}`, class: 'activitySpreadInhabitant2' }, key)
	   )
        )
      );
    }

    if (type === 'market') {
      const { item_type, title, price, status, deadline, stock, image, auctions_poll, seller } = content;
      const isSeller = seller && userId && seller === userId;
      cardBody.push(
        div({ class: 'card-section market' }, 
          div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.marketItemTitle + ':'), span({ class: 'card-value' }, title)),
          div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.marketItemType + ':'), span({ class: 'card-value' }, item_type.toUpperCase())),
          div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.marketItemStatus + ": " ), span({ class: 'card-value' }, status.toUpperCase())),
          div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.deadline + ':'), span({ class: 'card-value' }, deadline ? new Date(deadline).toLocaleString() : "")),
          div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.marketItemStock + ':'), span({ class: 'card-value' }, stock)),
          br,
          image
            ? img({ src: `/blob/${encodeURIComponent(image)}` })
            : img({ src: '/assets/images/default-market.png', alt: title }),
          br,
          div({ class: "market-card price" },
            p(`${i18n.marketItemPrice}: ${price} ECO`)
          ),
            item_type === 'auction' && status !== 'SOLD' && status !== 'DISCARDED' && !isSeller
            ? div({ class: "auction-info" },
                auctions_poll && auctions_poll.length > 0
                  ? [
                      p({ class: "auction-bid-text" }, i18n.marketAuctionBids),
                      table({ class: 'auction-bid-table' },
                        tr(
                          th(i18n.marketAuctionBidTime),
                          th(i18n.marketAuctionUser),
                          th(i18n.marketAuctionBidAmount)
                        ),
                            ...auctions_poll.map(bid => {
                            const [bidderId, bidAmount, bidTime] = bid.split(':');
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
              ) : "",
            item_type === 'exchange' && status !== 'SOLD' && status !== 'DISCARDED' && !isSeller
            ? form({ method: "POST", action: `/market/buy/${encodeURIComponent(action.id)}` },
                button({ class: "buy-btn", type: "submit" }, i18n.marketActionsBuy)
              ) : ""
        )
      );
    }

    if (type === 'report') {
      const { title, confirmations, severity, status } = content;
      cardBody.push(
        div({ class: 'card-section report' },      
          div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.title + ':'), span({ class: 'card-value' }, title)),
          status ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.status + ':'), span({ class: 'card-value' }, status)) : "",
          severity ? div({ class: 'card-field' }, span({ class: 'card-label' }, (i18n.severity || 'Severity') + ':'), span({ class: 'card-value' }, severity.toUpperCase())) : "",
          Array.isArray(confirmations) ? h2({ class: 'card-label' }, (i18n.transfersConfirmations) + ': ' + confirmations.length) : "",   
        )
      );
    }
    
    if (type === 'job') {
      const { title, job_type, tasks, location, vacants, salary, status, subscribers } = content;
      cardBody.push(
        div({ class: 'card-section report' },
            div({ class: 'card-field' },
                span({ class: 'card-label' }, i18n.title + ':'),
                span({ class: 'card-value' }, title)
            ),
            salary && div({ class: 'card-field' },
                span({ class: 'card-label' }, i18n.jobSalary + ':'),
                span({ class: 'card-value' }, salary + ' ECO')
            ),
            status && div({ class: 'card-field' },
                span({ class: 'card-label' }, i18n.jobStatus + ':'),
                span({ class: 'card-value' }, status.toUpperCase())
            ),
            job_type && div({ class: 'card-field' },
                span({ class: 'card-label' }, i18n.jobType + ':'),
                span({ class: 'card-value' }, job_type.toUpperCase())
            ),
            location && div({ class: 'card-field' },
                span({ class: 'card-label' }, i18n.jobLocation + ':'),
                span({ class: 'card-value' }, location.toUpperCase())
            ),
            vacants && div({ class: 'card-field' },
                span({ class: 'card-label' }, i18n.jobVacants + ':'),
                span({ class: 'card-value' }, vacants)
            ),
            div({ class: 'card-field' },
                span({ class: 'card-label' }, i18n.jobSubscribers + ':'),
                span({ class: 'card-value' },
                    Array.isArray(subscribers) && subscribers.length > 0
                        ? `${subscribers.length}`
                        : i18n.noSubscribers.toUpperCase()
                )
            ),
        )
      );
    }

return div({ class: 'card card-rpg' },
  div({ class: 'card-header' },
    h2({ class: 'card-label' }, `[${typeLabel}]`),
	type !== 'feed' && (!action.tipId || action.tipId === action.id)
	  ? form({ method: "GET", action: getViewDetailsAction(type, action) },
	      button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
	    )
	  : ''
  ),
  div({ class: 'card-body' }, ...cardBody),
  p({ class: 'card-footer' },
    span({ class: 'date-link' }, `${date} ${i18n.performed} `),
    a({ href: `/author/${encodeURIComponent(action.author)}`, class: 'user-link' }, `${action.author}`)
  )
);

  });
}

function getViewDetailsAction(type, action) {
  const id = encodeURIComponent(action.tipId || action.id);
  switch (type) {
    case 'votes': return `/votes/${id}`;
    case 'transfer': return `/transfers/${id}`;
    case 'pixelia': return `/pixelia`;
    case 'tribe': return `/tribe/${id}`;
    case 'curriculum': return `/inhabitant/${encodeURIComponent(action.author)}`;
    case 'image': return `/images/${id}`;
    case 'audio': return `/audios/${id}`;
    case 'video': return `/videos/${id}`;
    case 'forum':
      return `/forum/${encodeURIComponent(action.content?.key || action.tipId || action.id)}`;
    case 'document': return `/documents/${id}`;
    case 'bookmark': return `/bookmarks/${id}`;
    case 'event': return `/events/${id}`;
    case 'task': return `/tasks/${id}`;
    case 'about': return `/author/${encodeURIComponent(action.author)}`;
    case 'post': return `/thread/${id}#${id}`;
    case 'vote': return `/thread/${encodeURIComponent(action.content.vote.link)}#${encodeURIComponent(action.content.vote.link)}`;
    case 'contact': return `/inhabitants`;
    case 'pub': return `/invites`;
    case 'market': return `/market/${id}`;
    case 'job': return `/jobs/${id}`;
    case 'report': return `/reports/${id}`;
  }
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
    { type: 'job', label: i18n.typeJob },
    { type: 'transfer', label: i18n.typeTransfer },
    { type: 'feed', label: i18n.typeFeed },
    { type: 'post', label: i18n.typePost },
    { type: 'pixelia', label: i18n.typePixelia },
    { type: 'forum', label: i18n.typeForum },
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
              activityTypes.slice(11, 16).map(({ type, label }) =>
                form({ method: 'GET', action: '/activity' },
                  input({ type: 'hidden', name: 'filter', value: type }),
                  button({ type: 'submit', class: filter === type ? 'filter-btn active' : 'filter-btn' }, label)
                )
              )
            ),
            div({
              style: 'display: flex; flex-direction: column; gap: 8px;'
            },
              activityTypes.slice(16, 22).map(({ type, label }) =>
                form({ method: 'GET', action: '/activity' },
                  input({ type: 'hidden', name: 'filter', value: type }),
                  button({ type: 'submit', class: filter === type ? 'filter-btn active' : 'filter-btn' }, label)
                )
              )
            )
          )
        ),
       section({ class: 'feed-container' }, renderActionCards(filteredActions, userId))
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
