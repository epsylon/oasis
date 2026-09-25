const { readTyped } = require('../models/typed_log')
const { getConfig } = require('../configs/config-manager.js')

const logLimit = getConfig().ssbLogStream?.limit || 1000

let cooler = null
let ssb = null
let opening = null

function getCooler() {
  let ssbPath = null
  try { ssbPath = require.resolve('../server/SSB_server.js') } catch {}
  if (ssbPath && require.cache[ssbPath]) {
    if (!cooler) {
      const gui = require('../client/gui.js')
      cooler = gui({ offline: false })
    }
    return cooler
  }
  return null
}

function useCooler(c) {
  cooler = c || null
  ssb = null
  opening = null
}

const DEBUG = process.env.OASIS_DEBUG === '1' || process.env.OASIS_DEBUG === 'true'
const debug = (msg) => { if (DEBUG) console.error(`[ai] ${msg}`) }

async function openSsb() {
  const c = cooler || getCooler()
  if (!c) return null
  if (ssb && ssb.closed === false) return ssb
  if (!opening) {
    debug('opening the SSB connection for the network knowledge')
    opening = c.open().then(x => { debug('SSB connection open'); return (ssb = x) }).finally(() => { opening = null })
  }
  await opening
  return ssb
}

const clip = (s, n) => String(s || '').slice(0, n)
const squash = s => String(s || '').replace(/\s+/g, ' ').trim()
const compact = s => squash(clip(s, 160))
const normalize = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N}\s]+/gu, '').trim()

function fieldsForSnippet(type, c) {
  if (type === 'aiExchange') return [c?.question, clip(squash(c?.answer || ''), 120)]
  return []
}

async function publishExchange({ q, a, ctx = [], tokens = {}, lang = '', tags = [], rating = 0 }) {
  const s = await openSsb()
  if (!s) return null
  const safeLang = String(lang || '').trim().slice(0, 8).toLowerCase()
  const safeTags = Array.isArray(tags)
    ? Array.from(new Set(tags.map(t => String(t || '').trim().slice(0, 32)).filter(Boolean))).slice(0, 10)
    : []
  const safeRating = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)))
  const content = {
    type: 'aiExchange',
    question: clip(String(q || ''), 2000),
    answer: clip(String(a || ''), 5000),
    ctx: ctx.slice(0, 12).map(x => clip(String(x || ''), 800)),
    timestamp: Date.now()
  }
  if (safeLang) content.lang = safeLang
  if (safeTags.length) content.tags = safeTags
  if (safeRating > 0) content.rating = safeRating
  return new Promise((resolve, reject) => {
    s.publish(content, (err, res) => err ? reject(err) : resolve(res))
  })
}

async function publishExchangeVote({ targetId, helpful = true }) {
  const s = await openSsb()
  if (!s || !targetId) return null
  const content = {
    type: 'aiExchangeVote',
    target: String(targetId),
    helpful: !!helpful,
    timestamp: Date.now()
  }
  return new Promise((resolve, reject) => {
    s.publish(content, (err, res) => err ? reject(err) : resolve(res))
  })
}

async function buildContext(maxItems = 100) {
  const s = await openSsb()
  if (!s) return ''
  const msgs = (await readTyped(s, ['aiExchange'], { limit: logLimit }).catch(() => null) || []).reverse()
  const lines = []
  for (const { value } of msgs) {
    const c = value && value.content || {}
    if (c.type !== 'aiExchange') continue
    const d = new Date(value.timestamp || 0).toISOString().slice(0, 10)
    const q = compact(c.question)
    const a = compact(c.answer)
    lines.push(`[${d}] (AIExchange) Q: ${q} | A: ${a}`)
    if (lines.length >= maxItems) break
  }
  if (lines.length === 0) return ''
  return `## AIEXCHANGE\n\n${lines.join('\n')}`
}

const fs = require('fs')
const VECTORS_FILE = 'AI-vectors.json'
const VECTORS_MAX = 4000
const RATING_WEIGHT = 0.03
const VOTE_WEIGHT = 0.02
const CONTEXT_MIN_SCORE = 0.35
const DIRECT_ANSWER_MIN = 0.92

const vectorsPath = () => { try { return require('../configs/state-manager').statePath(VECTORS_FILE) } catch (_) { return null } }
const readVectors = () => { try { const j = JSON.parse(fs.readFileSync(vectorsPath(), 'utf8')); return j && typeof j === 'object' ? j : {} } catch (_) { return {} } }
const writeVectors = (map) => { try { const p = vectorsPath(); if (p) fs.writeFileSync(p, JSON.stringify(map)) } catch (_) {} }

const exchangeText = (c) => clip(squash(c.question), 300)

async function listExchanges() {
  const s = await openSsb()
  if (!s) return { exchanges: [], votes: new Map() }
  const msgs = await readTyped(s, ['aiExchange', 'aiExchangeVote'], { limit: logLimit }).catch(() => null) || []
  const exchanges = []
  const votes = new Map()
  for (const m of msgs) {
    const c = m && m.value && m.value.content || {}
    if (c.type === 'aiExchange' && c.question && c.answer) {
      exchanges.push({ key: m.key, author: m.value.author, ts: m.value.timestamp || m.timestamp || 0, question: String(c.question), answer: String(c.answer), rating: Number(c.rating) || 0, tags: Array.isArray(c.tags) ? c.tags : [], lang: c.lang || '' })
    } else if (c.type === 'aiExchangeVote' && c.target) {
      const k = String(c.target)
      const per = votes.get(k) || new Map()
      per.set(m.value.author, c.helpful !== false ? 1 : -1)
      votes.set(k, per)
    }
  }
  return { exchanges, votes }
}

const netVotes = (votes, key) => { const per = votes.get(key); if (!per) return 0; let n = 0; for (const v of per.values()) n += v; return n }

async function rankExchanges(question, { embed, cosine, k = 5 } = {}) {
  const { exchanges, votes } = await listExchanges()
  if (!exchanges.length) return []
  const scored = []
  if (typeof embed === 'function' && typeof cosine === 'function') {
    const qv = await embed(question).catch(() => null)
    if (qv) {
      const cache = readVectors()
      let dirty = false
      const newest = exchanges.slice().sort((a, b) => b.ts - a.ts).slice(0, VECTORS_MAX)
      for (const ex of newest) {
        let v = cache[ex.key]
        if (!Array.isArray(v)) {
          v = await embed(exchangeText(ex)).catch(() => null)
          if (!v) continue
          cache[ex.key] = v
          dirty = true
        }
        const sim = cosine(qv, v)
        scored.push({ ...ex, similarity: sim, votes: netVotes(votes, ex.key), score: sim + RATING_WEIGHT * ex.rating + VOTE_WEIGHT * Math.max(-5, Math.min(5, netVotes(votes, ex.key))) })
      }
      if (dirty) {
        const keep = new Set(newest.map(x => x.key))
        for (const key of Object.keys(cache)) if (!keep.has(key)) delete cache[key]
        writeVectors(cache)
      }
    }
  }
  if (!scored.length) {
    const want = normalize(question)
    const terms = want.split(' ').filter(t => t.length > 2)
    for (const ex of exchanges) {
      const text = normalize(ex.question + ' ' + ex.answer)
      const hits = terms.filter(t => text.includes(t)).length
      if (!hits) continue
      const sim = normalize(ex.question) === want ? 1 : hits / Math.max(1, terms.length)
      scored.push({ ...ex, similarity: sim, votes: netVotes(votes, ex.key), score: sim + RATING_WEIGHT * ex.rating + VOTE_WEIGHT * Math.max(-5, Math.min(5, netVotes(votes, ex.key))) })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.filter(x => x.similarity >= CONTEXT_MIN_SCORE).slice(0, k)
}

async function rankContext(question, opts = {}) {
  const top = await rankExchanges(question, opts)
  return top.map(ex => `Q: ${compact(ex.question)} | A: ${clip(squash(ex.answer), 400)}`)
}

async function getBestTrainedAnswer(question, opts = {}) {
  const top = await rankExchanges(question, { ...opts, k: 1 })
  const best = top[0]
  if (!best || best.similarity < DIRECT_ANSWER_MIN || best.votes < 0) return null
  return { answer: String(best.answer || '').trim(), ctx: [`Q: ${compact(best.question)}`], key: best.key }
}

async function exportFineTuning({ system = '' } = {}) {
  const { exchanges, votes } = await listExchanges()
  const lines = []
  for (const ex of exchanges.sort((a, b) => a.ts - b.ts)) {
    if (netVotes(votes, ex.key) < 0) continue
    const messages = []
    if (system) messages.push({ role: 'system', content: system })
    messages.push({ role: 'user', content: ex.question })
    messages.push({ role: 'assistant', content: ex.answer })
    lines.push(JSON.stringify({ messages, meta: { key: ex.key, author: ex.author, lang: ex.lang, tags: ex.tags, rating: ex.rating, helpful: netVotes(votes, ex.key), ts: ex.ts } }))
  }
  return lines.join('\n') + (lines.length ? '\n' : '')
}

module.exports = { fieldsForSnippet, buildContext, clip, publishExchange, publishExchangeVote, getBestTrainedAnswer, rankContext, rankExchanges, listExchanges, exportFineTuning, useCooler, DIRECT_ANSWER_MIN, CONTEXT_MIN_SCORE }
