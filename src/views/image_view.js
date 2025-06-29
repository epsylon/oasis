const { form, button, div, h2, p, section, input, label, br, a, img } = require("../server/node_modules/hyperaxe");
const moment = require("../server/node_modules/moment");
const { template, i18n } = require('./main_views');
const { config } = require('../server/SSB_server.js');

const userId = config.keys.id

const getFilteredImages = (filter, images, userId) => {
  const now = Date.now();
  let filtered =
    filter === 'mine' ? images.filter(img => img.author === userId) :
    filter === 'recent' ? images.filter(img => new Date(img.createdAt).getTime() >= now - 86400000) :
    filter === 'meme' ? images.filter(img => img.meme) :
    filter === 'top' ? [...images].sort((a,b) => {
      const sum = o => Object.values(o || {}).reduce((s, n) => s + n, 0);
      return sum(b.opinions) - sum(a.opinions);
    }) :
    images;

  return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const renderImageActions = (filter, imgObj) => {
  return filter === 'mine' ? div({ class: "image-actions" },
    form({ method: "GET", action: `/images/edit/${encodeURIComponent(imgObj.key)}` },
      button({ class: "update-btn", type: "submit" }, i18n.imageUpdateButton)
    ),
    form({ method: "POST", action: `/images/delete/${encodeURIComponent(imgObj.key)}` },
      button({ class: "delete-btn", type: "submit" }, i18n.imageDeleteButton)
    )
  ) : null;
};

const renderImageList = (filteredImages, filter) => {
  return filteredImages.length > 0
    ? filteredImages.map(imgObj =>
        div({ class: "image-item" },
          renderImageActions(filter, imgObj),
          form({ method: "GET", action: `/images/${encodeURIComponent(imgObj.key)}` },
	    button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
	  ),  br,
          a({ href: `#img-${encodeURIComponent(imgObj.key)}` }, img({ src: `/blob/${encodeURIComponent(imgObj.url)}` })),
          br(),
          p(`${i18n.imageCreatedAt}: ${moment(imgObj.createdAt).format('YYYY/MM/DD HH:mm:ss')}`),
          p(`${i18n.imageAuthor}: `, a({ href: `/author/${encodeURIComponent(imgObj.author)}` }, imgObj.author)),
          imgObj.title ? h2(imgObj.title) : null,
          imgObj.description ? p(imgObj.description) : null,
          imgObj.tags?.length
            ? div(imgObj.tags.map(tag =>
                a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right: 0.8em; margin-bottom: 0.5em;" }, `#${tag}`)
              ))
            : null,
          div({ class: "voting-buttons" },
            ['interesting', 'necessary', 'funny', 'disgusting', 'sensible', 'propaganda', 'adultOnly', 'boring', 'confusing', 'inspiring', 'spam']
              .map(category =>
                form({ method: "POST", action: `/images/opinions/${encodeURIComponent(imgObj.key)}/${category}` },
                  button({ class: "vote-btn" },
                    `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`]} [${imgObj.opinions?.[category] || 0}]`
                  )
                )
              )
          )
        )
      )
    : div(i18n.noImages);
};

const renderImageForm = (filter, imageId, imageToEdit) => {
  return div({ class: "div-center image-form" },
    form({
      action: filter === 'edit'
        ? `/images/update/${encodeURIComponent(imageId)}`
        : "/images/create",
      method: "POST", enctype: "multipart/form-data"
    },
      label(i18n.imageFileLabel), br(),
      input({ type: "file", name: "image", required: filter !== "edit" }), br(), br(),
      imageToEdit?.url ? img({ src: `/blob/${encodeURIComponent(imageToEdit.url)}`, class: "image-detail" }) : null,
      br(),
      label(i18n.imageTagsLabel), br(),
      input({ type: "text", name: "tags", placeholder: i18n.imageTagsPlaceholder, value: imageToEdit?.tags?.join(',') || '' }), br(), br(),
      label(i18n.imageTitleLabel), br(),
      input({ type: "text", name: "title", placeholder: i18n.imageTitlePlaceholder, value: imageToEdit?.title || '' }), br(), br(),
      label(i18n.imageDescriptionLabel), br(),
      input({ type: "text", name: "description", placeholder: i18n.imageDescriptionPlaceholder, value: imageToEdit?.description || '' }), br(), br(),
      label(i18n.imageMemeLabel),
      input({ type: "checkbox", name: "meme", ...(imageToEdit?.meme ? { checked: true } : {}) }), br(), br(),
      button({ type: "submit" }, filter === 'edit' ? i18n.imageUpdateButton : i18n.imageCreateButton)
    )
  );
};

const renderGallery = (sortedImages) => {
  return div({ class: "gallery" },
    sortedImages.length
      ? sortedImages.map(imgObj =>
          a({ href: `#img-${encodeURIComponent(imgObj.key)}`, class: "gallery-item" },
            img({ src: `/blob/${encodeURIComponent(imgObj.url)}`, alt: imgObj.title || "", class: "gallery-image" })
          )
        )
      : div(i18n.noImages)
  );
};

const renderLightbox = (sortedImages) => {
  return sortedImages.map(imgObj =>
    div(
      { id: `img-${encodeURIComponent(imgObj.key)}`, class: "lightbox" },
      a({ href: "#", class: "lightbox-close" }, "×"),
      img({ src: `/blob/${encodeURIComponent(imgObj.url)}`, class: "lightbox-image", alt: imgObj.title || "" })
    )
  );
};

exports.imageView = async (images, filter, imageId) => {
  const title = filter === 'mine' ? i18n.imageMineSectionTitle :
                filter === 'create' ? i18n.imageCreateSectionTitle :
                filter === 'edit' ? i18n.imageUpdateSectionTitle :
                filter === 'gallery' ? i18n.imageGallerySectionTitle :
                filter === 'meme' ? i18n.imageMemeSectionTitle :
                filter === 'recent' ? i18n.imageRecentSectionTitle :
                filter === 'top' ? i18n.imageTopSectionTitle :
                i18n.imageAllSectionTitle;

  const filteredImages = getFilteredImages(filter, images, userId);

  const imageToEdit = images.find(img => img.key === imageId);

  return template(
    title,
    section(
      div({ class: "tags-header" },
        h2(title),
        p(i18n.imageDescription)
      ),
      div({ class: "filters" },
        form({ method: "GET", action: "/images" },
          ["all", "mine", "recent", "top", "gallery", "meme"].map(f =>
            button({
              type: "submit", name: "filter", value: f,
              class: filter === f ? "filter-btn active" : "filter-btn"
            },
              i18n[`imageFilter${f.charAt(0).toUpperCase() + f.slice(1)}`]
            )
          ),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" },
            i18n.imageCreateButton)
        )
      )
    ),
    section(
      (filter === 'create' || filter === 'edit')
        ? renderImageForm(filter, imageId, imageToEdit)
        : filter === 'gallery'
          ? renderGallery(filteredImages)
          : renderImageList(filteredImages, filter)
    ),
    ...renderLightbox(filteredImages)
  );
};

exports.singleImageView = async (image, filter) => {
  const isAuthor = image.author === userId;
  const hasOpinions = Object.keys(image.opinions || {}).length > 0; 

  return template(
    i18n.imageTitle,
    section(
      div({ class: "filters" },
        form({ method: "GET", action: "/images" },
          button({ type: "submit", name: "filter", value: "all", class: filter === 'all' ? 'filter-btn active' : 'filter-btn' }, i18n.imageFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === 'mine' ? 'filter-btn active' : 'filter-btn' }, i18n.imageFilterMine),
          button({ type: "submit", name: "filter", value: "meme", class: filter === 'meme' ? 'filter-btn active' : 'filter-btn' }, i18n.imageFilterMeme),
          button({ type: "submit", name: "filter", value: "top", class: filter === 'top' ? 'filter-btn active' : 'filter-btn' }, i18n.imageFilterTop),
          button({ type: "submit", name: "filter", value: "recent", class: filter === 'recent' ? 'filter-btn active' : 'filter-btn' }, i18n.imageFilterRecent),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.imageCreateButton)
        )
      ),
      div({ class: "tags-header" },
        h2(image.title),
        p(image.description),
        p(`${i18n.imageCreatedAt}: ${moment(image.createdAt).format('YYYY/MM/DD HH:mm:ss')}`),
        p(`${i18n.imageAuthor}: `, a({ href: `/author/${encodeURIComponent(image.author)}` }, image.author)),
        image.url ? img({ src: `/blob/${encodeURIComponent(image.url)}` }) : null,br,
        image.tags?.length
          ? div(
              image.tags.map(tag =>
                a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right: 0.8em; margin-bottom: 0.5em;" }, `#${tag}`)
              )
            )
          : null
      ),
      isAuthor ? div({ class: "image-actions" },
        !hasOpinions
          ? form({ method: "GET", action: `/images/edit/${encodeURIComponent(image.key)}` },
              button({ class: "update-btn", type: "submit" }, i18n.imageUpdateButton)
            )
          : null,
        form({ method: "POST", action: `/images/delete/${encodeURIComponent(image.key)}` },
          button({ class: "delete-btn", type: "submit" }, i18n.imageDeleteButton)
        )
      ) : null,
      div({ class: "voting-buttons" },
        ['interesting', 'necessary', 'funny', 'disgusting', 'sensible', 'propaganda', 'adultOnly', 'boring', 'confusing', 'inspiring', 'spam'].map(category =>
          form({ method: "POST", action: `/images/opinions/${encodeURIComponent(image.key)}/${category}` },
            button({ class: "vote-btn" }, `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`]} [${image.opinions?.[category] || 0}]`)
          )
        )
      )
    )
  );
};
