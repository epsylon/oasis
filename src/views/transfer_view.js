const { div, h2, p, section, button, form, a, input, img, textarea, br, span, label } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const moment = require('../server/node_modules/moment');
const { config } = require('../server/SSB_server.js');

const userId = config.keys.id

const generateTransferActions = (transfer, userId) => {
  return (transfer.from === userId && transfer.status === 'UNCONFIRMED')
    ? div({ class: "transfer-actions" },
        form({ method: "GET", action: `/transfers/edit/${encodeURIComponent(transfer.id)}` },
          button({ type: "submit", class: "update-btn" }, i18n.transfersUpdateButton)
        ),
        form({ method: "POST", action: `/transfers/delete/${encodeURIComponent(transfer.id)}` },
          button({ type: "submit", class: "delete-btn" }, i18n.transfersDeleteButton)
        )
      )
    : null;
};

const generateTransferCard = (transfer, userId) => {
  return div({ class: "transfer-item" },
    div({ class: 'card-section transfer' },
      generateTransferActions(transfer, userId),
      form({ method: "GET", action: `/transfers/${encodeURIComponent(transfer.id)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      ),
      br,
      div({ class: 'card-field' },
        span({ class: 'card-label' }, `${i18n.transfersConcept}:`),
        span({ class: 'card-value' }, transfer.concept)
      ),
      div({ class: 'card-field' },
        span({ class: 'card-label' }, `${i18n.transfersDeadline}:`),
        span({ class: 'card-value' }, moment(transfer.deadline).format("YYYY-MM-DD HH:mm"))
      ),
      div({ class: 'card-field' },
        span({ class: 'card-label' }, `${i18n.transfersStatus}:`),
        span({ class: 'card-value' }, i18n[`transfersStatus${transfer.status.charAt(0) + transfer.status.slice(1).toLowerCase()}`])
      ),
      div({ class: 'card-field' },
        span({ class: 'card-label' }, `${i18n.transfersAmount}:`),
        span({ class: 'card-value' }, `${transfer.amount} ECO`)
      ),
      br,
      div({ class: 'card-field' },
        span({ class: 'card-label' }, `${i18n.transfersFrom}:`),
        span({ class: 'card-value' }, a({ class: 'user-link', href: `/author/${encodeURIComponent(transfer.from)}`, target: "_blank" }, transfer.from))
      ),
      div({ class: 'card-field' },
        span({ class: 'card-label' }, `${i18n.transfersTo}:`),
        span({ class: 'card-value' }, a({ class: 'user-link', href: `/author/${encodeURIComponent(transfer.to)}`, target: "_blank" }, transfer.to))
      ),
      br,
      h2({ class: 'card-field' },
        span({ class: 'card-label' }, `${i18n.transfersConfirmations}: `),
        span({ class: 'card-value' }, `${transfer.confirmedBy.length}/2`)
      ),
      (transfer.status === 'UNCONFIRMED' && transfer.to === userId)
        ? form({ method: "POST", action: `/transfers/confirm/${encodeURIComponent(transfer.id)}` },
            button({ type: "submit" }, i18n.transfersConfirmButton), br(), br()
          )
        : null,
      transfer.tags && transfer.tags.length
        ? div({ class: 'card-tags' },
            transfer.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right:0.8em;margin-bottom:0.5em;" }, `#${tag}`)
            )
          )
        : null, 
      br,
      p({ class: 'card-footer' },
        span({ class: 'date-link' }, `${transfer.createdAt} ${i18n.performed} `),
        a({ href: `/author/${encodeURIComponent(transfer.from)}`, class: 'user-link' }, `${transfer.from}`)
      ), 
      div({ class: "voting-buttons" },
        ["interesting", "necessary", "funny", "disgusting", "sensible", "propaganda", "adultOnly", "boring", "confusing", "inspiring", "spam"].map(category =>
          form({ method: "POST", action: `/transfers/opinions/${encodeURIComponent(transfer.id)}/${category}` },
            button({ class: "vote-btn" }, `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`]} [${transfer.opinions?.[category] || 0}]`)
          )
        )
      )
    )
  );
};

exports.transferView = async (transfers, filter, transferId) => {
  const title =
    filter === 'mine'        ? i18n.transfersMineSectionTitle :
    filter === 'pending'     ? i18n.transfersPendingSectionTitle :
    filter === 'top'         ? i18n.transfersTopSectionTitle :
    filter === 'unconfirmed' ? i18n.transfersUnconfirmedSectionTitle :
    filter === 'closed'      ? i18n.transfersClosedSectionTitle :
    filter === 'discarded'   ? i18n.transfersDiscardedSectionTitle :
                               i18n.transfersAllSectionTitle;

  let filtered =
    filter === 'mine'        ? transfers.filter(t => t.from === userId || t.to === userId) :
    filter === 'pending'     ? transfers.filter(t => t.status === 'UNCONFIRMED' && t.to === userId) :
    filter === 'top'         ? transfers.filter(t => t.status === 'CLOSED').sort((a, b) => b.amount - a.amount) :
    filter === 'unconfirmed' ? transfers.filter(t => t.status === 'UNCONFIRMED') :
    filter === 'closed'      ? transfers.filter(t => t.status === 'CLOSED') :
    filter === 'discarded'   ? transfers.filter(t => t.status === 'DISCARDED') :
                               transfers;

  if (filter !== 'top') {
    filtered = filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const isForm = filter === 'create' || filter === 'edit';
  const transferToEdit = filter === 'edit' ? transfers.find(t => t.id === transferId) || {} : {};

  return template(
    title,
    section(
      div({ class: "tags-header" }, h2(i18n.transfersTitle), p(i18n.transfersDescription)),
      div({ class: "filters" },
        form({ method: "GET", action: "/transfers" },
          button({ type: "submit", name: "filter", value: "all", class: filter === 'all' ? 'filter-btn active' : 'filter-btn' }, i18n.transfersFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === 'mine' ? 'filter-btn active' : 'filter-btn' }, i18n.transfersFilterMine),
          button({ type: "submit", name: "filter", value: "pending", class: filter === 'pending' ? 'filter-btn active' : 'filter-btn' }, i18n.transfersFilterPending),
          button({ type: "submit", name: "filter", value: "unconfirmed", class: filter === 'unconfirmed' ? 'filter-btn active' : 'filter-btn' }, i18n.transfersFilterUnconfirmed),
          button({ type: "submit", name: "filter", value: "closed", class: filter === 'closed' ? 'filter-btn active' : 'filter-btn' }, i18n.transfersFilterClosed),
          button({ type: "submit", name: "filter", value: "discarded", class: filter === 'discarded' ? 'filter-btn active' : 'filter-btn' }, i18n.transfersFilterDiscarded),
          button({ type: "submit", name: "filter", value: "top", class: filter === 'top' ? 'filter-btn active' : 'filter-btn' }, i18n.transfersFilterTop),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.transfersCreateButton)
        )
      )
    ),
    section(
      isForm
        ? div({ class: "transfer-form" },
            form({ action: filter === 'edit' ? `/transfers/update/${encodeURIComponent(transferId)}` : "/transfers/create", method: "POST" },
              label(i18n.transfersToUser), br(),
              input({ type: "text", name: "to", required: true, pattern: "^@[A-Za-z0-9+/]+={0,2}\\.ed25519$", title: i18n.transfersToUserValidation, value: transferToEdit.to || "" }), br(), br(),
              label(i18n.transfersConcept), br(),
              input({ type: "text", name: "concept", required: true, value: transferToEdit.concept || "" }), br(), br(),
              label(i18n.transfersAmount), br(),
              input({ type: "number", name: "amount", step: "0.000001", required: true, min: "0.000001", value: transferToEdit.amount || "" }), br(), br(),
              label(i18n.transfersDeadline), br(),
              input({ type: "datetime-local", name: "deadline", required: true, min: moment().format("YYYY-MM-DDTHH:mm"), value: transferToEdit.deadline ? moment(transferToEdit.deadline).format("YYYY-MM-DDTHH:mm") : "" }), br(), br(),
              label(i18n.transfersTags), br(),
              input({ type: "text", name: "tags", value: (transferToEdit.tags || []).join(", ") }), br(), br(),
              button({ type: "submit" }, filter === 'edit' ? i18n.transfersUpdateButton : i18n.transfersCreateButton)
            )
          )
        : div({ class: "transfer-list" },
            filtered.length > 0
              ? filtered.map(t => generateTransferCard(t, userId))
              : p(i18n.transfersNoItems)
          )
    )
  );
};

exports.singleTransferView = async (transfer, filter) => {
  return template(
    transfer.concept,
    section(
      div({ class: "filters" },
        form({ method: 'GET', action: '/transfers' },
          button({ type: 'submit', name: 'filter', value: 'all', class: filter === 'all' ? 'filter-btn active' : 'filter-btn' }, i18n.transfersFilterAll),
          button({ type: 'submit', name: 'filter', value: 'mine', class: filter === 'mine' ? 'filter-btn active' : 'filter-btn' }, i18n.transfersFilterMine),
          button({ type: 'submit', name: 'filter', value: 'pending', class: filter === 'pending' ? 'filter-btn active' : 'filter-btn' }, i18n.transfersFilterPending),
          button({ type: 'submit', name: 'filter', value: 'unconfirmed', class: filter === 'unconfirmed' ? 'filter-btn active' : 'filter-btn' }, i18n.transfersFilterUnconfirmed),
          button({ type: 'submit', name: 'filter', value: 'closed', class: filter === 'closed' ? 'filter-btn active' : 'filter-btn' }, i18n.transfersFilterClosed),
          button({ type: 'submit', name: 'filter', value: 'discarded', class: filter === 'discarded' ? 'filter-btn active' : 'filter-btn' }, i18n.transfersFilterDiscarded),
          button({ type: 'submit', name: 'filter', value: 'create', class: "create-button" }, i18n.transfersCreateButton)
        )
      ),
	div({ class: "tags-header" },
	  div({ class: 'card-section transfer' },
            div({ class: 'card-field' },
             span({ class: 'card-label' }, `${i18n.transfersConcept}:`),
             span({ class: 'card-value' }, transfer.concept)
            ),
            div({ class: 'card-field' },
	      span({ class: 'card-label' }, `${i18n.transfersDeadline}:`),
	      span({ class: 'card-value' }, moment(transfer.deadline).format("YYYY-MM-DD HH:mm"))
	    ),
	    div({ class: 'card-field' },
	      span({ class: 'card-label' }, `${i18n.transfersStatus}:`),
	      span({ class: 'card-value' }, i18n[`transfersStatus${transfer.status.charAt(0) + transfer.status.slice(1).toLowerCase()}`])
	    ),
	    div({ class: 'card-field' },
	      span({ class: 'card-label' }, `${i18n.transfersAmount}:`),
	      span({ class: 'card-value' }, `${transfer.amount} ECO`)
	    ),
	    br,
	    div({ class: 'card-field' },
	      span({ class: 'card-label' }, `${i18n.transfersFrom}:`),
	      span({ class: 'card-value' }, a({ class: 'user-link', href: `/author/${encodeURIComponent(transfer.from)}`, target: "_blank" }, transfer.from))
	    ),
	    div({ class: 'card-field' },
	      span({ class: 'card-label' }, `${i18n.transfersTo}:`),
	      span({ class: 'card-value' }, a({ class: 'user-link', href: `/author/${encodeURIComponent(transfer.to)}`, target: "_blank" }, transfer.to))
	    ),
            br,
	    h2({ class: 'card-field' },
	      span({ class: 'card-label' }, `${i18n.transfersConfirmations}: `),
	      span({ class: 'card-value' }, `${transfer.confirmedBy.length}/2`)
	    )
	  )
	),
      transfer.status === 'UNCONFIRMED' && transfer.to === userId
        ? form({ method: "POST", action: `/transfers/confirm/${encodeURIComponent(transfer.id)}` },
            button({ type: "submit" }, i18n.transfersConfirmButton), br(), br()
          )
        : null,
      transfer.tags && transfer.tags.length
          ? div({ class: 'card-tags' },
            transfer.tags.map(tag => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right:0.8em;margin-bottom:0.5em;" }, `#${tag}`))
          )
        : null,
       br,
       p({ class: 'card-footer' },
        span({ class: 'date-link' }, `${transfer.createdAt} ${i18n.performed} `),
        a({ href: `/author/${encodeURIComponent(transfer.from)}`, class: 'user-link' }, `${transfer.from}`)
      ),
      div({ class: "voting-buttons" },
        ["interesting", "necessary", "funny", "disgusting", "sensible", "propaganda", "adultOnly", "boring", "confusing", "inspiring", "spam"].map(category =>
          form({ method: "POST", action: `/transfers/opinions/${encodeURIComponent(transfer.id)}/${category}` },
            button({ class: "vote-btn" }, `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`]} [${transfer.opinions?.[category] || 0}]`)
          )
        )
      )
    )
  );
};

