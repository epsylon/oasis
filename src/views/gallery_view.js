const { div, a, span, img, video, input, button, label, br } = require("../server/node_modules/hyperaxe")
const { i18n } = require("./main_views")
const { MAX_IMAGES } = require("../models/media_gallery")

const safeArr = (v) => (Array.isArray(v) ? v : [])
const safeText = (v) => String(v == null ? "" : v).trim()

const blobIdOf = (entry) => {
  const value = safeText(entry)
  const m = value.match(/\(([^)\s]+)\)/)
  return m ? m[1] : value
}

const blobUrl = (id, size) => size
  ? `/image/${size}/${encodeURIComponent(id)}`
  : `/blob/${encodeURIComponent(id)}`

const isVideoEntry = (entry) => /\[video:[^\]]*\]\(/.test(String(entry || ""))

const imagesOf = (item) => {
  const list = safeArr(item && item.images).filter(Boolean)
  if (list.length) return list
  return item && item.image ? [item.image] : []
}

const videoOf = (item) => safeText(item && item.video)

const renderMediaThumb = (entry, alt = "") => isVideoEntry(entry)
  ? video({ controls: true, class: "gallery-image", src: blobUrl(blobIdOf(entry)) })
  : img({ src: blobUrl(blobIdOf(entry), 256), class: "gallery-image", alt })

const lightboxId = (scope, itemId, index) => `${scope}-photo-${encodeURIComponent(itemId)}-${index}`

let zoomSeq = 0
const renderZoomableImage = (src, { alt = "", imgClass = "" } = {}) => {
  if (!src) return null
  zoomSeq = (zoomSeq + 1) % 1000000
  const id = `zoom-${zoomSeq}-${String(src).replace(/[^a-zA-Z0-9]/g, "").slice(-10)}`
  return [
    a({ href: `#${id}`, class: "zoom-link" }, img({ src, class: imgClass, alt })),
    div({ id, class: "lightbox" },
      a({ href: "#", class: "lightbox-close" }, "×"),
      img({ src, class: "lightbox-image", alt })
    )
  ]
}

const renderPhotoGallery = (item, scope = "media") => {
  const list = imagesOf(item)
  const clip = videoOf(item)
  if (!list.length && !clip) return null
  const id = (item && (item.id || item.key || item.rootId)) || ""
  return div({ class: "media-gallery" },
    list.length
      ? div({ class: "gallery" },
          list.map((entry, i) =>
            isVideoEntry(entry)
              ? span({ class: "gallery-item" }, renderMediaThumb(entry))
              : a({ href: `#${lightboxId(scope, id, i)}`, class: "gallery-item" }, renderMediaThumb(entry))
          )
        )
      : null,
    list.filter(entry => !isVideoEntry(entry)).map((entry) =>
      div({ id: lightboxId(scope, id, list.indexOf(entry)), class: "lightbox" },
        a({ href: "#", class: "lightbox-close" }, "×"),
        img({ src: blobUrl(blobIdOf(entry)), class: "lightbox-image", alt: "" })
      )
    ),
    clip
      ? div({ class: "media-video media-video-centered" },
          video({ controls: true, class: "media-video-player", src: blobUrl(blobIdOf(clip)) })
        )
      : null
  )
}

const renderGalleryFields = (item = {}, isEdit = false, maxImages = MAX_IMAGES) => {
  const list = imagesOf(item)
  return [
    label(i18n.galleryImages),
    br(),
    ...list.map(entry => input({ type: "hidden", name: "keepImages", value: entry })),
    list.length < maxImages
      ? div({ class: "media-file-row" },
          input({ type: "file", name: "images", accept: "image/*", multiple: true }),
          button({ type: "submit", name: "action", value: "addPhoto", attrs: { formnovalidate: "formnovalidate" }, class: "filter-btn media-add-btn" }, i18n.galleryAddPhoto)
        )
      : null,
    br(),
    list.length
      ? [
          div({ class: "gallery media-form-gallery" },
            list.map((entry, i) =>
              span({ class: "gallery-item" },
                renderMediaThumb(entry),
                button({ type: "submit", name: "removePhoto", value: String(i), attrs: { formnovalidate: "formnovalidate" }, class: "media-remove-btn" }, i18n.galleryRemovePhoto)
              )
            )
          ),
          br()
        ]
      : null,
    br()
  ]
}

module.exports = {
  MAX_IMAGES,
  blobIdOf,
  blobUrl,
  isVideoEntry,
  imagesOf,
  videoOf,
  renderMediaThumb,
  renderPhotoGallery,
  renderGalleryFields,
  renderZoomableImage
}
