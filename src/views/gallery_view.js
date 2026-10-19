const { div, a, span, img, video, input, button, label, br } = require("../server/node_modules/hyperaxe")
const { i18n, renderIcon, renderMediaLockNote } = require("./main_views")
const { MAX_IMAGES } = require("../models/media_gallery")

const safeArr = (v) => (Array.isArray(v) ? v : [])
const safeText = (v) => String(v == null ? "" : v).trim()
const downloadHref = (src) => `${src}${String(src).includes("?") ? "&" : "?"}download=1`

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
  ? video({ controls: true, class: "gallery-image", src: blobUrl(blobIdOf(entry)), preload: 'metadata' })
  : img({ src: blobUrl(blobIdOf(entry), 256), class: "gallery-image", alt })

const lightboxId = (scope, itemId, index) => `${scope}-photo-${encodeURIComponent(itemId)}-${index}`

let zoomSeq = 0
const renderZoomableImage = (src, { alt = "", imgClass = "", linkClass = "", thumb = null, full = false } = {}) => {
  if (!src) return null
  zoomSeq = (zoomSeq + 1) % 1000000
  const id = `zoom-${zoomSeq}-${String(src).replace(/[^a-zA-Z0-9]/g, "").slice(-10)}`
  return [
    a({ href: `#${id}`, id: `${id}-src`, class: linkClass ? `zoom-link ${linkClass}` : "zoom-link" }, img({ src: thumb || src, class: imgClass, alt, loading: "lazy" })),
    div({ id, class: full ? "lightbox live-lightbox" : "lightbox" },
      a({ href: downloadHref(src), class: "lightbox-download", title: i18n.fileShareDownload || "Download" }, "⤓"),
      a({ href: `#${id}-src`, class: "lightbox-close" }, "×"),
      full ? a({ href: `#${id}-full`, class: "live-fullscreen-btn", title: i18n.liveFullscreen }, renderIcon("fullscreen")) : null,
      img({ src, class: "lightbox-image", alt, loading: "lazy" })
    ),
    full
      ? div({ id: `${id}-full`, class: "lightbox live-lightbox live-fullscreen" },
          a({ href: `#${id}`, class: "lightbox-close" }, "×"),
          a({ href: `#${id}`, class: "lightbox-image-link" }, img({ src, class: "lightbox-image", alt, loading: "lazy" }))
        )
      : null
  ]
}

const renderDownloadButton = (src, name = "") => src
  ? a({ href: `${downloadHref(src)}${name ? `&name=${encodeURIComponent(name)}` : ""}`, class: "filter-btn media-download-btn" }, `⤓ ${i18n.fileShareDownload || "Download"}`)
  : null

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
              : a({ href: `#${lightboxId(scope, id, i)}`, id: `${lightboxId(scope, id, i)}-src`, class: "gallery-item" }, renderMediaThumb(entry))
          )
        )
      : null,
    list.filter(entry => !isVideoEntry(entry)).map((entry) =>
      div({ id: lightboxId(scope, id, list.indexOf(entry)), class: "lightbox" },
        a({ href: downloadHref(blobUrl(blobIdOf(entry))), class: "lightbox-download", title: i18n.fileShareDownload || "Download" }, "⤓"),
        a({ href: `#${lightboxId(scope, id, list.indexOf(entry))}-src`, class: "lightbox-close" }, "×"),
        img({ src: blobUrl(blobIdOf(entry)), class: "lightbox-image", alt: "" })
      )
    ),
    clip
      ? div({ class: "media-video media-video-centered" },
          video({ controls: true, class: "media-video-player", src: blobUrl(blobIdOf(clip)), preload: 'metadata' })
        )
      : null
  )
}

const renderGalleryFields = (item = {}, isEdit = false, maxImages = MAX_IMAGES) => {
  const list = imagesOf(item)
  const lock = isEdit ? renderMediaLockNote(item) : null
  return [
    label(i18n.galleryImages),
    br(),
    ...list.map(entry => input({ type: "hidden", name: "keepImages", value: entry })),
    lock || (list.length < maxImages
      ? div({ class: "media-file-row" },
          input({ type: "file", name: "images", accept: "image/*", multiple: true }),
          button({ type: "submit", name: "action", value: "addPhoto", attrs: { formnovalidate: "formnovalidate" }, class: "filter-btn media-add-btn" }, i18n.galleryAddPhoto)
        )
      : null),
    br(),
    list.length
      ? [
          div({ class: "gallery media-form-gallery" },
            list.map((entry, i) =>
              span({ class: "gallery-item" },
                renderMediaThumb(entry),
                lock ? null : button({ type: "submit", name: "removePhoto", value: String(i), attrs: { formnovalidate: "formnovalidate" }, class: "media-remove-btn" }, i18n.galleryRemovePhoto)
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
  renderZoomableImage,
  renderDownloadButton,
  downloadHref
}
