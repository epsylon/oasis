const cache = new Map()

const get = (feedId) => {
  if (!feedId) return null
  const entry = cache.get(String(feedId))
  return entry ? entry.name : null
}

const set = (feedId, name, ts) => {
  if (!feedId || typeof name !== 'string' || !name) return
  const id = String(feedId)
  const t = Number(ts) || 0
  const prev = cache.get(id)
  if (!prev || (prev.ts || 0) <= t) cache.set(id, { name, ts: t })
}

const has = (feedId) => !!feedId && cache.has(String(feedId))
const size = () => cache.size

module.exports = { get, set, has, size }
