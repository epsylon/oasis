const path = require('path')
const fs = require('fs')
const { fork } = require('child_process')

const MODEL_DIR = path.join(__dirname, 'embeddings')
const MODEL_FILE = path.join(MODEL_DIR, 'onnx', 'model_quantized.onnx')
const EMBED_TIMEOUT_MS = 30000

let worker = null
let workerReady = false
let permanentFail = false
let unavailableReason = null
let seq = 0
const pending = new Map()

const isInstalled = () => {
  try {
    return fs.existsSync(MODEL_FILE)
  } catch (_) {
    return false
  }
}

const dot = (a, b) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

const norm = (a) => Math.sqrt(dot(a, a)) || 1

const cosine = (a, b) => dot(a, b) / (norm(a) * norm(b))

const settlePending = () => {
  for (const p of pending.values()) p.resolve(null)
  pending.clear()
}

const ensureWorker = () => {
  if (worker || permanentFail) return
  const child = fork(__filename, ['--embed-worker'], { silent: true })
  if (child.stdout) child.stdout.resume()
  if (child.stderr) child.stderr.resume()
  child.on('message', (msg) => {
    const p = pending.get(msg && msg.id)
    if (!p) return
    pending.delete(msg.id)
    workerReady = true
    p.resolve(Array.isArray(msg.vec) ? msg.vec : null)
  })
  child.on('error', () => {})
  child.on('exit', () => {
    settlePending()
    if (worker === child) {
      worker = null
      if (!workerReady) {
        permanentFail = true
        unavailableReason = 'embedder_native_crash'
      }
      workerReady = false
    }
  })
  worker = child
}

const embed = async (text) => {
  if (!isInstalled() || permanentFail) return null
  ensureWorker()
  const child = worker
  if (!child) return null
  const id = ++seq
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        try { child.kill() } catch (_) {}
        resolve(null)
      }
    }, EMBED_TIMEOUT_MS)
    pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v) } })
    try {
      child.send({ id, text: String(text || '').trim() })
    } catch (_) {
      pending.delete(id)
      clearTimeout(timer)
      resolve(null)
    }
  })
}

const status = () => ({
  installed: isInstalled(),
  loaded: workerReady,
  unavailableReason
})

module.exports = { embed, cosine, isInstalled, status, MODEL_DIR, MODEL_FILE }

if (process.argv[2] === '--embed-worker') {
  let pipelinePromise = null
  const ensurePipeline = async () => {
    if (pipelinePromise) return pipelinePromise
    if (!isInstalled()) return null
    pipelinePromise = (async () => {
      let mod
      try {
        const url = require('url')
        const transformersPath = path.join(__dirname, '..', 'server', 'node_modules', '@xenova', 'transformers', 'src', 'transformers.js')
        mod = await import(url.pathToFileURL(transformersPath).href)
      } catch (_) {
        return null
      }
      const { pipeline, env } = mod
      env.allowRemoteModels = false
      env.localModelPath = path.join(__dirname)
      env.cacheDir = path.join(__dirname, '.cache')
      try {
        return await pipeline('feature-extraction', 'embeddings', { quantized: true })
      } catch (_) {
        return null
      }
    })()
    return pipelinePromise
  }
  process.on('message', async (msg) => {
    let vec = null
    try {
      const fe = await ensurePipeline()
      if (fe) {
        const out = await fe(String((msg && msg.text) || ''), { pooling: 'mean', normalize: true })
        vec = Array.from(out.data)
      }
    } catch (_) {}
    try { process.send({ id: msg && msg.id, vec }) } catch (_) {}
  })
}
