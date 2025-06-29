const { div, h2, p, section, button, form, a, span, textarea, br, input, label, select, option } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const moment = require("../server/node_modules/moment");
const { config } = require('../server/SSB_server.js');

const userId = config.keys.id

exports.eventView = async (events, filter, eventId) => {
  const list = Array.isArray(events) ? events : [events]
  const title =
    filter === 'mine'   ? i18n.eventMineSectionTitle :
    filter === 'create' ? i18n.eventCreateSectionTitle :
    filter === 'edit'   ? i18n.eventUpdateSectionTitle :
                          i18n.eventAllSectionTitle

  const eventToEdit = list.find(e => e.id === eventId) || {}
  const editTags = Array.isArray(eventToEdit.tags)
    ? eventToEdit.tags.filter(Boolean)
    : []

  let filtered
  if (filter === 'all') {
    filtered = list.filter(e => e.isPublic === "public")
  } else if (filter === 'mine') {
    filtered = list.filter(e => e.organizer === userId)
  } else if (filter === 'today') {
    filtered = list.filter(e => e.isPublic === "public" && moment(e.date).isSame(moment(), 'day'))
  } else if (filter === 'week') {
    filtered = list.filter(e => e.isPublic === "public" && moment(e.date).isBetween(moment(), moment().add(7, 'days'), null, '[]'))
  } else if (filter === 'month') {
    filtered = list.filter(e => e.isPublic === "public" && moment(e.date).isBetween(moment(), moment().add(1, 'month'), null, '[]'))
  } else if (filter === 'year') {
    filtered = list.filter(e => e.isPublic === "public" && moment(e.date).isBetween(moment(), moment().add(1, 'year'), null, '[]'))
  } else if (filter === 'archived') {
    filtered = list.filter(e => e.isPublic === "public" && e.status === 'CLOSED')
  } else {
    filtered = []
  }

  filtered = filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  return template(
    title,
    section(
      div({ class: "tags-header" },
        h2(i18n.eventsTitle),
        p(i18n.eventsDescription)
      ),
      div({ class: "filters" },
        form({ method: "GET", action: "/events" },
          button({ type:"submit", name:"filter", value:"all", class:filter === 'all' ? 'filter-btn active' : 'filter-btn' }, i18n.eventFilterAll),
          button({ type:"submit", name:"filter", value:"mine", class:filter === 'mine' ? 'filter-btn active' : 'filter-btn' }, i18n.eventFilterMine),
          button({ type:"submit", name:"filter", value:"today", class:filter === 'today' ? 'filter-btn active' : 'filter-btn' }, i18n.eventFilterToday),
          button({ type:"submit", name:"filter", value:"week", class:filter === 'week' ? 'filter-btn active' : 'filter-btn' }, i18n.eventFilterWeek),
          button({ type:"submit", name:"filter", value:"month", class:filter === 'month' ? 'filter-btn active' : 'filter-btn' }, i18n.eventFilterMonth),
          button({ type:"submit", name:"filter", value:"year", class:filter === 'year' ? 'filter-btn active' : 'filter-btn' }, i18n.eventFilterYear),
          button({ type:"submit", name:"filter", value:"archived", class:filter === 'archived' ? 'filter-btn active' : 'filter-btn' }, i18n.eventFilterArchived),
          button({ type:"submit", name:"filter", value:"create", class:"create-button" }, i18n.eventCreateButton)
        )
      )
    ),
    section(
      (filter === 'edit' || filter === 'create') ? (
        div({ class: "event-form" },
          form({
            action: filter === 'edit'
              ? `/events/update/${encodeURIComponent(eventId)}`
              : "/events/create",
            method: "POST"
          },  
            label(i18n.eventTitleLabel), br(),
            input({ type:"text", name:"title", id:"title", required:true,
              ...(filter==='edit'?{value:eventToEdit.title}:{})
            }), br(), br(),
            label(i18n.eventDescriptionLabel), br(),
            textarea({ name:"description", id:"description", placeholder:i18n.eventDescriptionPlaceholder}, filter === 'edit' ? eventToEdit.description : ''), br(), br(),
            label(i18n.eventDateLabel), br(),
            input({
              type: "datetime-local",
              name: "date",
              id: "date",
              required: true,
              min: moment().format("YYYY-MM-DDTHH:mm"),
              ...(filter === "edit"
                ? { value: moment(eventToEdit.date).format("YYYY-MM-DDTHH:mm") }
                : {}
              )
            }), br(), br(),
            label(i18n.eventPrivacyLabel), br(),
            select({ name:"isPublic", id:"isPublic",
              ...(filter==='edit'?{value:eventToEdit.isPublic?'public':'private'}:{})
            },
              option({ value:'public' },  i18n.eventPublic),
              option({ value:'private' }, i18n.eventPrivate)
            ), br(), br(),
            label(i18n.eventLocationLabel), br(),
            input({ type:"text", name:"location", id:"location", required:true,
              ...(filter==='edit'?{value:eventToEdit.location}:{})
            }), br(), br(),
            label(i18n.eventUrlLabel), br(),
            input({ type:"url", name:"url", id:"url", value:eventToEdit.url||"" }), br(), br(),
            label(i18n.eventPriceLabel), br(),
            input({
              type: "number",
              name: "price",
              id: "price",
              min: "0.000000",
              value: filter==='edit' ? parseFloat(eventToEdit.price||0).toFixed(6) : (0).toFixed(6),
              step: "0.000000"
            }), br(), br(),
            label(i18n.eventTagsLabel), br(),
            input({ type:"text", name:"tags", id:"tags", value: filter==='edit'? editTags.join(', '):'' }), br(), br(),
            button({ type:"submit" }, filter==='edit'? i18n.eventUpdateButton : i18n.eventCreateButton)
          )
        )
      ) : (
        div({ class:"event-list" },
          filtered.length > 0
            ? filtered.map(e => {
                const actions = []
                if (filter==='mine' && e.status==='OPEN') {
                  actions.push(
                    form({ method:"GET", action:`/events/edit/${encodeURIComponent(e.id)}` },
                      button({ type:"submit", class:"update-btn" }, i18n.eventUpdateButton)
                    )
                  )
                  actions.push(
                    form({ method:"POST", action:`/events/delete/${encodeURIComponent(e.id)}` },
                      button({ type:"submit", class:"delete-btn" }, i18n.eventDeleteButton)
                    )
                  )
                }
                if (e.status === 'OPEN') {
                  actions.push(
                    form({ method:"POST", action:`/events/attend/${encodeURIComponent(e.id)}` },
                      button({ type:"submit" },
                        e.attendees.includes(userId)
                          ? i18n.eventUnattendButton
                          : i18n.eventAttendButton
                      )
                    )
                  )
                }
                return div({ class:"event-item" },
                  actions.length ? div({ class:"event-actions" }, ...actions) : null,
                  form({ method:"GET", action:`/events/${encodeURIComponent(e.id)}` },
                    button({ type:"submit", class:"filter-btn" }, i18n.viewDetails)
                  ),
                  h2(e.title),
                  p(`${i18n.eventDescription}: ${e.description}`),
                  p(`${i18n.eventDate}: ${moment(e.date).format('YYYY/MM/DD HH:mm:ss')}`),
                  p(`${i18n.eventPrivacyLabel}: ${e.isPublic}`),
                  e.location?.trim() ? p(`${i18n.eventLocation}: ${e.location}`) : null,
                  e.url?.trim() ? p(`${i18n.eventUrlLabel}: `, a({ href: e.url }, e.url)) : null,
                  p(`${i18n.eventPriceLabel}: ${parseFloat(e.price || 0).toFixed(6)} ECO`),
                  p(`${i18n.eventAttendees}: `,
                    Array.isArray(e.attendees) && e.attendees.length
                      ? e.attendees.filter(Boolean).map((id, i) => [i > 0 ? ', ' : '', a({ href: `/author/${encodeURIComponent(id)}` }, id)]).flat()
                      : i18n.noAttendees
                  ),
                  p(`${i18n.eventCreatedAt}: ${moment(e.createdAt).format('YYYY/MM/DD HH:mm:ss')}`),
                  p(`${i18n.eventBy}: `, a({ href: `/author/${encodeURIComponent(e.organizer)}` }, e.organizer)),
                  p(`${i18n.eventStatus}: ${e.status}`),
                  e.tags && e.tags.filter(Boolean).length
                    ? div(
                        e.tags.filter(Boolean).map(tag =>
                          a({
                            href:`/search?query=%23${encodeURIComponent(tag)}`,
                            class:"tag-link",
                            style:"margin-right:0.8em;margin-bottom:0.5em;"
                          }, `#${tag}`)
                        )
                      )
                    : null,
                  div({ class: "voting-buttons" },
                    ['interesting','necessary','funny','disgusting','sensible','propaganda','adultOnly','boring','confusing','inspiring','spam'].map(category =>
                      form({ method:"POST", action:`/events/opinions/${encodeURIComponent(e.id)}/${category}` },
                        button({ class:"vote-btn" },
                          `${i18n[`vote${category.charAt(0).toUpperCase()+category.slice(1)}`]} [${e.opinions?.[category]||0}]`
                        )
                      )
                    )
                  )
                )
              })
            : p(i18n.noevents)
        )
      )
    )
  )
}

exports.singleEventView = async (event, filter) => {
  return template(
    event.title,
    section(
      div({ class: "filters" },
        form({ method: 'GET', action: '/events' },
          button({ type: 'submit', name: 'filter', value: 'all', class: filter === 'all' ? 'filter-btn active' : 'filter-btn' }, i18n.eventFilterAll),
          button({ type: 'submit', name: 'filter', value: 'mine', class: filter === 'mine' ? 'filter-btn active' : 'filter-btn' }, i18n.eventFilterMine),
          button({ type: 'submit', name: 'filter', value: 'today', class: filter === 'today' ? 'filter-btn active' : 'filter-btn' }, i18n.eventFilterToday),
          button({ type: 'submit', name: 'filter', value: 'week', class: filter === 'week' ? 'filter-btn active' : 'filter-btn' }, i18n.eventFilterWeek),
          button({ type: 'submit', name: 'filter', value: 'month', class: filter === 'month' ? 'filter-btn active' : 'filter-btn' }, i18n.eventFilterMonth),
          button({ type: 'submit', name: 'filter', value: 'year', class: filter === 'year' ? 'filter-btn active' : 'filter-btn' }, i18n.eventFilterYear),
          button({ type: 'submit', name: 'filter', value: 'archived', class: filter === 'archived' ? 'filter-btn active' : 'filter-btn' }, i18n.eventFilterArchived),
          button({ type: 'submit', name: 'filter', value: 'create', class: "create-button" }, i18n.eventCreateButton)
        )
      ),
      div({ class: "tags-header" },
        h2(event.title),
        p(event.description),
        p(`${i18n.eventDate}: ${moment(event.date).format('YYYY/MM/DD HH:mm:ss')}`),
        p(`${i18n.eventLocation}: ${event.location}`),
        p(`${i18n.eventUrlLabel}: `, a({ href: event.url }, event.url)),
        p(`${i18n.eventPriceLabel}: ${parseFloat(event.price || 0).toFixed(6)} ECO`),
        p(`${i18n.eventAttendees}: `,
          Array.isArray(event.attendees) && event.attendees.length
            ? event.attendees.map((id, i) => [i > 0 ? ', ' : '', a({ href: `/author/${encodeURIComponent(id)}` }, id)]).flat()
            : i18n.noAttendees
        ),
        p(`${i18n.eventCreatedAt}: ${moment(event.createdAt).format('YYYY/MM/DD HH:mm:ss')}`),
        p(`${i18n.eventBy}: `, a({ href: `/author/${encodeURIComponent(event.organizer)}` }, event.organizer)),
        p(`${i18n.eventStatus}: ${event.status}`),
        event.tags && event.tags.length
          ? div(
              event.tags.map(tag => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`))
            )
          : null
      ),
      div({ class: "event-actions" },
        form({ method: "POST", action: `/events/attend/${encodeURIComponent(event.id)}` },
          button({ type: "submit" },
            event.attendees.includes(userId)
              ? i18n.eventUnattendButton
              : i18n.eventAttendButton
          )
        )
      )
    )
  );
};
