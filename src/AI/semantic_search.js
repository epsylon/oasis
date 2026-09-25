const fs = require('fs')
const { readTyped } = require('../models/typed_log')

const VECTORS_FILE = 'AI-search-vectors.json'
const MAX_ITEMS = 4000
const MIN_SCORE = 0.42
const TEXT_MAX = 400

const TYPES = ['post', 'event', 'job', 'project', 'market', 'shop', 'shopProduct', 'tribe', 'task', 'wikiPage', 'document', 'audio', 'video', 'image', 'bookmark', 'forum', 'campaign', 'emergency', 'podcast', 'schoolCourse', 'housing', 'logisticsRoute', 'mailingList', 'curriculum', 'blog', 'report', 'poll', 'torrent']

const vectorsPath = () => { try { return require('../configs/state-manager').statePath(VECTORS_FILE) } catch (_) { return null } }
const readVectors = () => { try { const j = JSON.parse(fs.readFileSync(vectorsPath(), 'utf8')); return j && typeof j === 'object' ? j : {} } catch (_) { return {} } }
const writeVectors = (map) => { try { const p = vectorsPath(); if (p) fs.writeFileSync(p, JSON.stringify(map)) } catch (_) {} }

const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim()
const textOf = (c) => {
  if (!c || typeof c !== 'object') return ''
  if (c.encryptedPayload || c.encryptedQuestion) return ''
  const title = squash(c.title || c.name || c.question || c.subject || c.concept || '')
  const body = squash(c.description || c.text || c.body || c.contentWarning || '')
  const tags = Array.isArray(c.tags) ? c.tags.map(t => String(t || '')).join(' ') : ''
  return `${title} ${body} ${tags}`.trim().slice(0, TEXT_MAX)
}

let indexing = null

const indexOnce = async (ssb, { embed, limit }) => {
  const msgs = await readTyped(ssb, TYPES, { limit }).catch(() => [])
  const usable = msgs.filter(m => m && m.key && m.value && m.value.content && !m.value.content.replaces && textOf(m.value.content))
  const newest = usable.slice(-MAX_ITEMS)
  const cache = readVectors()
  let dirty = false
  const items = []
  for (const m of newest) {
    let v = cache[m.key]
    if (!Array.isArray(v)) {
      v = await embed(textOf(m.value.content)).catch(() => null)
      if (!v) continue
      cache[m.key] = v
      dirty = true
    }
    items.push({ msg: m, vector: v })
  }
  if (dirty) {
    const keep = new Set(newest.map(m => m.key))
    for (const key of Object.keys(cache)) if (!keep.has(key)) delete cache[key]
    writeVectors(cache)
  }
  return items
}

const search = async (ssb, query, { embed, cosine, limit = 1000, k = 20 } = {}) => {
  if (typeof embed !== 'function' || typeof cosine !== 'function' || !ssb) return []
  const q = squash(query)
  if (!q) return []
  const qv = await embed(q).catch(() => null)
  if (!qv) return []
  if (!indexing) indexing = indexOnce(ssb, { embed, limit }).finally(() => { indexing = null })
  const items = await indexing.catch(() => [])
  const scored = []
  for (const it of items) {
    const s = cosine(qv, it.vector)
    if (s >= MIN_SCORE) scored.push({ msg: it.msg, score: s })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, k)
}

module.exports = { search, textOf, TYPES, MIN_SCORE }
