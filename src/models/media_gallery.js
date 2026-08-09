const MAX_IMAGES = 8

const MEDIA_MARKDOWN = /\[(image|video|audio):[^\]]*\]\(/

const blobOf = (value) => {
  let blobId = value || null
  if (blobId && /\(([^)]+)\)/.test(String(blobId))) blobId = String(blobId).match(/\(([^)]+)\)/)[1]
  return blobId || null
}

const keepMarkdown = (value, id) =>
  MEDIA_MARKDOWN.test(value) || value.startsWith("![") ? value : id

const normalizeImages = (raw, max = MAX_IMAGES) => {
  const list = Array.isArray(raw) ? raw : (raw ? [raw] : [])
  const out = []
  const seen = new Set()
  for (const entry of list) {
    const value = String(entry || "").trim()
    const id = blobOf(value)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(keepMarkdown(value, id))
    if (out.length >= max) break
  }
  return out
}

const normalizeVideo = (raw) => {
  const value = String(Array.isArray(raw) ? raw[0] || "" : raw || "").trim()
  const id = blobOf(value)
  if (!id) return ""
  return keepMarkdown(value, id)
}

const mergeGallery = (current, uploaded, removeIndex = -1, max = MAX_IMAGES) => {
  let list = normalizeImages(current, max)
  if (removeIndex >= 0) list = list.filter((_, i) => i !== removeIndex)
  return normalizeImages([...list, ...normalizeImages(uploaded, max)], max)
}

module.exports = { MAX_IMAGES, blobOf, normalizeImages, normalizeVideo, mergeGallery }
