const { div, h2, p, section, button, form, a, span, textarea, br, input, label, select, option, img, hr, table, tr, th, td } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const moment = require("../server/node_modules/moment");
const { config } = require('../server/SSB_server.js');
const { renderUrl } = require('../backend/renderUrl');

const userId = config.keys.id;

const renderCardField = (labelText, value) =>
  div({ class: 'card-field' },
    span({ class: 'card-label' }, labelText),
    span({ class: 'card-value' }, ...renderUrl(value))
  );

exports.marketView = async (items, filter, itemToEdit = null) => {
  const list = Array.isArray(items) ? items : [];
  let title = i18n.marketAllSectionTitle;

  switch (filter) {
    case 'mine':
      title = i18n.marketMineSectionTitle;
      break;
    case 'create':
      title = i18n.marketCreateSectionTitle;
      break;
    case 'edit':
      title = i18n.marketUpdateSectionTitle;
      break;
  }

  let filtered = [];

  switch (filter) {
    case 'all':
      filtered = list;
      break;
    case 'mine':
      filtered = list.filter(e => e.seller === userId);
      break;
    case 'exchange':
      filtered = list.filter(e => e.item_type === 'exchange' && e.status === 'FOR SALE');
      break;
    case 'auctions':
      filtered = list.filter(e => e.item_type === 'auction' && e.status === 'FOR SALE');
      break;
    case 'new':
      filtered = list.filter(e => e.item_status === 'NEW' && e.status === 'FOR SALE');
      break;
    case 'used':
      filtered = list.filter(e => e.item_status === 'USED' && e.status === 'FOR SALE');
      break;
    case 'broken':
      filtered = list.filter(e => e.item_status === 'BROKEN' && e.status === 'FOR SALE');
      break;
    case 'for sale':
      filtered = list.filter(e => e.status === 'FOR SALE');
      break;
    case 'sold':
      filtered = list.filter(e => e.status === 'SOLD');
      break;
    case 'discarded':
      filtered = list.filter(e => e.status === 'DISCARDED');
      break;
    case 'recent':
      const oneDayAgo = moment().subtract(1, 'days').toISOString();
      filtered = list.filter(e => e.status === 'FOR SALE' && e.createdAt >= oneDayAgo);
      break;
    default:
      break;
  }

  filtered = filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return template(
    title,
    section(
      div({ class: "tags-header" },
        h2(i18n.marketTitle),
        p(i18n.marketDescription)
      ),
      div({ class: "filters" },
        form({ method: "GET", action: "/market" },
          button({ type:"submit", name:"filter", value:"all", class:filter === 'all' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterAll),
          button({ type:"submit", name:"filter", value:"mine", class:filter === 'mine' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterMine),
          button({ type:"submit", name:"filter", value:"exchange", class:filter === 'exchange' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterItems),
          button({ type:"submit", name:"filter", value:"auctions", class:filter === 'auctions' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterAuctions),
          button({ type:"submit", name:"filter", value:"new", class:filter === 'new' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterNew),
          button({ type:"submit", name:"filter", value:"used", class:filter === 'used' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterUsed),
          button({ type:"submit", name:"filter", value:"broken", class:filter === 'broken' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterBroken),
          button({ type:"submit", name:"filter", value:"for sale", class:filter === 'for sale' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterForSale),
          button({ type:"submit", name:"filter", value:"sold", class:filter === 'sold' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterSold),
          button({ type:"submit", name:"filter", value:"discarded", class:filter === 'discarded' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterDiscarded),
          button({ type:"submit", name:"filter", value:"recent", class:filter === 'recent' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterRecent),
          button({ type:"submit", name:"filter", value:"create", class:"create-button" }, i18n.marketCreateButton)
        )
      )
    ),
    section(
      (filter === 'create' || filter === 'edit') ? (
        div({ class: "market-form" },
          form({
            action: filter === 'edit' ? `/market/update/${encodeURIComponent(itemToEdit.id)}` : "/market/create",
            method: "POST",
            enctype: "multipart/form-data"
          },
            label(i18n.marketItemType), br(),
            select({ name: "item_type", id: "item_type", required: true },
              option({ value: "auction", selected: itemToEdit?.item_type === 'auction' ? true : false }, "Auction"),
              option({ value: "exchange", selected: itemToEdit?.item_type === 'exchange' ? true : false }, "Exchange")
            ), br(), br(),
            
            label(i18n.marketItemTitle), br(),
            input({ type: "text", name: "title", id: "title", value: itemToEdit?.title || '', required: true }), br(), br(),
            
            label(i18n.marketItemDescription), br(),
            textarea({ name: "description", id: "description", placeholder: i18n.marketItemDescriptionPlaceholder, rows:"6", innerHTML: itemToEdit?.description || '', required: true }), br(), br(),
            
            label(i18n.marketCreateFormImageLabel), br(),
            input({ type: "file", name: "image", id: "image", accept: "image/*" }), br(), br(),
            
            label(i18n.marketItemStatus), br(),
            select({ name: "item_status", id: "item_status" },
              option({ value: "BROKEN", selected: itemToEdit?.item_status === 'BROKEN' ? true : false }, "BROKEN"),
              option({ value: "USED", selected: itemToEdit?.item_status === 'USED' ? true : false }, "USED"),
              option({ value: "NEW", selected: itemToEdit?.item_status === 'NEW' ? true : false }, "NEW")
            ), br(), br(),
            
            label(i18n.marketItemStock), br(),
	    input({ 
	      type: "number", 
	      name: "stock", 
	      id: "stock", 
	      value: itemToEdit?.stock || 1, 
	      required: true, 
	      min: "1", 
	      step: "1" 
	    }), br(), br(),
            
            label(i18n.marketItemPrice), br(),
            input({ type: "number", name: "price", id: "price", value: itemToEdit?.price || '', required: true, step: "0.000001", min: "0.000001" }), br(), br(),
            
            label(i18n.marketItemTags), br(),
            input({ type: "text", name: "tags", id: "tags", placeholder: i18n.marketItemTagsPlaceholder, value: itemToEdit?.tags?.join(', ') || '' }), br(), br(),
            
            label(i18n.marketItemDeadline), br(),
            input({
              type: "datetime-local",
              name: "deadline",
              id: "deadline",
              required: true,
              min: moment().format("YYYY-MM-DDTHH:mm"),
              value: itemToEdit?.deadline ? moment(itemToEdit.deadline).format("YYYY-MM-DDTHH:mm") : ''
            }), br(), br(),
            
            label(i18n.marketItemIncludesShipping), br(),
            input({ type: "checkbox", name: "includesShipping", id: "includesShipping", checked: itemToEdit?.includesShipping }), br(), br(),

            button({ type: "submit" }, filter === 'edit' ? i18n.marketUpdateButton : i18n.marketCreateButton)
          )
        )
      ) : (
	div({ class: "market-grid" },
	  filtered.length > 0
	    ? filtered.map((item, index) =>     
	      div({ class: "market-item" }, 
		div({ class: "market-card left-col" },
		  form({ method: "GET", action: `/market/${encodeURIComponent(item.id)}` },
		      button({ class: "filter-btn", type: "submit" }, i18n.viewDetails)
		  ),
		  h2({ class: "market-card type" }, `${i18n.marketItemType}: ${item.item_type.toUpperCase()}`),
		  h2(item.title),
		  renderCardField(`${i18n.marketItemStatus}:`, item.status),
		  item.deadline ? renderCardField(`${i18n.marketItemAvailable}:`, moment(item.deadline).format('YYYY/MM/DD HH:mm:ss')) : null,
		  br,br,
		  div({ class: "market-card image" },
		    item.image
		      ? img({ src: `/blob/${encodeURIComponent(item.image)}` })
		      : img({ src: '/assets/images/default-market.png', alt: item.title })
		  ),
		  p(...renderUrl(item.description)),
		  item.tags && item.tags.filter(Boolean).length
		    ? div({ class: 'card-tags' }, item.tags.filter(Boolean).map(tag =>
		        a({ class: "tag-link", href: `/search?query=%23${encodeURIComponent(tag)}` },
		          `#${tag}`)
		      ))
		    : null,
		),
		div({ class: "market-card right-col" },
		  renderCardField(`${i18n.marketItemStock}:`, item.stock > 0 ? item.stock : i18n.marketOutOfStock),
		  div({ class: "market-card price" },
		    renderCardField(`${i18n.marketItemPrice}:`, `${item.price} ECO`),
		  ),
		  renderCardField(`${i18n.marketItemCondition}:`, item.item_status),
		  renderCardField(`${i18n.marketItemIncludesShipping}:`, item.includesShipping ? i18n.YESLabel : i18n.NOLabel),
		  renderCardField(`${i18n.marketItemSeller}:`),
		  div({ class: "market-card image" }, 
		  div({ class: 'card-field' },
		    a({ class: 'user-link', href: `/author/${encodeURIComponent(item.seller)}` }, item.seller)
		  )),
		  item.item_type === 'auction' && item.auctions_poll.length > 0
		  ? div({ class: "auction-info" },
		      p({ class: "auction-bid-text" }, i18n.marketAuctionBids),
		      table({ class: 'auction-bid-table' },
		        tr(
		          th(i18n.marketAuctionBidTime),
		          th(i18n.marketAuctionUser),
		          th(i18n.marketAuctionBidAmount)
		        ),
		        item.auctions_poll.map(bid => {
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
		  div({ class: "market-card buttons" },
		    (filter === 'mine') ? [
		      form({ method: "POST", action: `/market/delete/${encodeURIComponent(item.id)}` },
		        button({ class: "delete-btn", type: "submit" }, i18n.marketActionsDelete)
		      ),
		      (item.status !== 'SOLD' && item.status !== 'DISCARDED' && item.auctions_poll.length === 0) 
		        ? form({ method: "GET", action: `/market/edit/${encodeURIComponent(item.id)}` },
		        button({ class: "update-btn", type: "submit" }, i18n.marketActionsUpdate)
		      )
		        : null,
		      (item.status === 'FOR SALE') 
		        ? form({ method: "POST", action: `/market/sold/${encodeURIComponent(item.id)}` },
		        button({ class: "sold-btn", type: "submit" }, i18n.marketActionsSold)
		      )
		        : null
		    ] : [
		      (item.status !== 'SOLD' && item.status !== 'DISCARDED')
		        ? (item.item_type === 'auction'
		          ? form({ method: "POST", action: `/market/bid/${encodeURIComponent(item.id)}` },
		              input({ type: "number", name: "bidAmount", step:"0.000001", min:"0.000001", placeholder: i18n.marketYourBid, required: true }),
		              br,
		              button({ class: "buy-btn", type: "submit" }, i18n.marketPlaceBidButton)
		            )
		          : form({ method: "POST", action: `/market/buy/${encodeURIComponent(item.id)}` },
		              input({ type: "hidden", name: "buyerId", value: userId }),
		              button({ class: "buy-btn", type: "submit" }, i18n.marketActionsBuy)
		            )
		        )
		        : null
		    ]
		  )
		)
	      )
	    )
	  : p(i18n.marketNoItems)
	)
      )
    )
  );
};

exports.singleMarketView = async (item, filter) => {
  return template(
    item.title,
    section(
      div({ class: "filters" },
        form({ method: 'GET', action: '/market' },
          button({ type: 'submit', name: 'filter', value: 'all', class: filter === 'all' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterAll),
          button({ type: 'submit', name: 'filter', value: 'mine', class: filter === 'mine' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterMine),
          button({ type: 'submit', name: 'filter', value: 'exchange', class: filter === 'exchange' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterItems),
          button({ type: 'submit', name: 'filter', value: 'auctions', class: filter === 'auctions' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterAuctions),
          button({ type: 'submit', name: 'filter', value: 'new', class: filter === 'new' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterNew),
          button({ type: 'submit', name: 'filter', value: 'used', class: filter === 'used' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterUsed),
          button({ type: 'submit', name: 'filter', value: 'broken', class: filter === 'broken' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterBroken),
          button({ type: 'submit', name: 'filter', value: 'for sale', class: filter === 'for sale' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterForSale),
          button({ type: 'submit', name: 'filter', value: 'sold', class: filter === 'sold' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterSold),
          button({ type: 'submit', name: 'filter', value: 'discarded', class: filter === 'discarded' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterDiscarded),
          button({ type: 'submit', name: 'filter', value: 'recent', class: filter === 'recent' ? 'filter-btn active' : 'filter-btn' }, i18n.marketFilterRecent),
          button({ type: 'submit', name: 'filter', value: 'create', class: "create-button" }, i18n.marketCreateButton)
        )
      ),
      div({ class: "tags-header" },
        h2(item.title),
        renderCardField(`${i18n.marketItemType}:`, `${item.item_type.toUpperCase()}`),
        renderCardField(`${i18n.marketItemStatus}:`, item.status),
        renderCardField(`${i18n.marketItemCondition}:`, item.item_status),
        br,
        div({ class: "market-item image" },
          item.image
            ? img({ src: `/blob/${encodeURIComponent(item.image)}` })
            : img({ src: '/assets/images/default-market.png', alt: item.title })
        ),
        renderCardField(`${i18n.marketItemDescription}:`),
        p(...renderUrl(item.description)),   
        item.tags && item.tags.length
          ? div({ class: 'card-tags' },
              item.tags.map(tag =>
                a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)
              )
            )
          : null,
          br,
        renderCardField(`${i18n.marketItemPrice}:`),
        br,
        div({ class: 'card-label' },
          h2(`${item.price} ECO`),
          ),
        br,
        renderCardField(`${i18n.marketItemStock}:`, item.stock > 0 ? item.stock : i18n.marketOutOfStock),
        renderCardField(`${i18n.marketItemIncludesShipping}:`, `${item.includesShipping ? i18n.YESLabel : i18n.NOLabel}`),
        item.deadline ? renderCardField(`${i18n.marketItemAvailable}:`, `${moment(item.deadline).format('YYYY/MM/DD HH:mm:ss')}`) : null,
        renderCardField(`${i18n.marketItemSeller}:`),
        br,
	div({ class: 'card-field' },
	  a({ class: 'user-link', href: `/author/${encodeURIComponent(item.seller)}` }, item.seller)
	)
      ),
      item.item_type === 'auction' 
        ? div({ class: "auction-info" },
            p({ class: "auction-bid-text" }, i18n.marketAuctionBids),
            table({ class: 'auction-bid-table' },
              tr(
                th(i18n.marketAuctionBidTime),
                th(i18n.marketAuctionUser),
                th(i18n.marketAuctionBidAmount)
              ),
              item.auctions_poll.map(bid => {
                const [userId, bidAmount, bidTime] = bid.split(':');
                return tr(
                  td(moment(bidTime).format('YYYY-MM-DD HH:mm:ss')),
                  td(a({ href: `/author/${encodeURIComponent(userId)}` }, userId)),
                  td(`${parseFloat(bidAmount).toFixed(6)} ECO`)
                );
              })
            ),
            item.status !== 'SOLD' && item.status !== 'DISCARDED'
              ? form({ method: "POST", action: `/market/bid/${encodeURIComponent(item.id)}` },
                  input({ type: "number", name: "bidAmount", step: "0.000001", min: "0.000001", placeholder: i18n.marketYourBid, required: true }),
                  br(),
                  button({ class: "buy-btn", type: "submit" }, i18n.marketPlaceBidButton)
                )
              : null
          )
        : null,
      div({ class: "market-item actions" },
        (filter === 'mine' && item.status !== 'SOLD' && item.status !== 'DISCARDED' && item.seller === userId && item.item_type !== 'auction') ||
        (item.status === 'FOR SALE' && item.item_type !== 'auction' && item.seller === userId) ||
        (item.status === 'FOR SALE' && item.item_type === 'exchange') ||
        (item.status !== 'SOLD' && item.status !== 'DISCARDED' && item.item_type !== 'auction' && item.seller !== userId)
          ? [
              (filter === 'mine' && item.status !== 'SOLD' && item.status !== 'DISCARDED' && item.seller === userId && item.item_type !== 'auction')
                ? form({ method: "POST", action: `/market/delete/${encodeURIComponent(item.id)}` },
                    button({ class: "delete-btn", type: "submit" }, i18n.marketActionsDelete)
                  )
                : null,
              (item.status === 'FOR SALE' && item.item_type !== 'auction' && item.seller === userId)
                ? form({ method: "POST", action: `/market/sold/${encodeURIComponent(item.id)}` },
                    button({ class: "sold-btn", type: "submit" }, i18n.marketActionsSold)
                  )
                : null,
              (item.status === 'FOR SALE' && item.item_type === 'exchange')
                ? form({ method: "POST", action: `/market/buy/${encodeURIComponent(item.id)}` },
                    button({ class: "buy-btn", type: "submit" }, i18n.marketActionsBuy)
                  )
                : null,
              (item.status !== 'SOLD' && item.status !== 'DISCARDED' && item.item_type !== 'auction' && item.seller !== userId)
                ? form({ method: "POST", action: `/market/buy/${encodeURIComponent(item.id)}` },
                    button({ class: "buy-btn", type: "submit" }, i18n.marketActionsBuy)
                  )
                : null
            ]
          : null
      )
    )
  );
};
