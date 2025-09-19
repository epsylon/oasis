const pull = require('../server/node_modules/pull-stream')
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

async function openSsb() {
  const c = getCooler()
  if (!c) return null
  if (ssb && ssb.closed === false) return ssb
  if (!opening) opening = c.open().then(x => (ssb = x)).finally(() => { opening = null })
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

async function publishExchange({ q, a, ctx = [], tokens = {} }) {
  const s = await openSsb()
  if (!s) return null
  const content = {
    type: 'aiExchange',
    question: clip(String(q || ''), 2000),
    answer: clip(String(a || ''), 5000),
    ctx: ctx.slice(0, 12).map(x => clip(String(x || ''), 800)),
    timestamp: Date.now()
  }
  return new Promise((resolve, reject) => {
    s.publish(content, (err, res) => err ? reject(err) : resolve(res))
  })
}

async function buildContext(maxItems = 100) {
  const s = await openSsb()
  if (!s) return ''
  return new Promise((resolve) => {
    pull(
      s.createLogStream({ reverse: true, limit: logLimit }),
      pull.collect((err, msgs) => {
        if (err || !Array.isArray(msgs)) return resolve('')
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
        if (lines.length === 0) return resolve('')
        resolve(`## AIEXCHANGE\n\n${lines.join('\n')}`)
      })
    )
  })
}

async function getBestTrainedAnswer(question) {
  const s = await openSsb()
  if (!s) return null
  const want = normalize(question)
  return new Promise((resolve) => {
    pull(
      s.createLogStream({ reverse: true, limit: logLimit }),
      pull.collect((err, msgs) => {
        if (err || !Array.isArray(msgs)) return resolve(null)
        for (const { value } of msgs) {
          const c = value && value.content || {}
          if (c.type !== 'aiExchange') continue
          if (normalize(c.question) === want) {
            return resolve({ answer: String(c.answer || '').trim(), ctx: Array.isArray(c.ctx) ? c.ctx : [] })
          }
        }
        resolve(null)
      })
    )
  })
}

module.exports = { fieldsForSnippet, buildContext, clip, publishExchange, getBestTrainedAnswer }
