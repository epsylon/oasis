const path = require('path')
const fs = require('fs')

const MODEL_DIR = path.join(__dirname, 'embeddings')
const MODEL_FILE = path.join(MODEL_DIR, 'onnx', 'model_quantized.onnx')

let pipelinePromise = null
let unavailableReason = null

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

const ensurePipeline = async () => {
  if (pipelinePromise) return pipelinePromise
  if (!isInstalled()) {
    unavailableReason = 'model_not_installed'
    return null
  }
  pipelinePromise = (async () => {
    let mod
    try {
      const url = require('url')
      const transformersPath = path.join(__dirname, '..', 'server', 'node_modules', '@xenova', 'transformers', 'src', 'transformers.js')
      mod = await import(url.pathToFileURL(transformersPath).href)
    } catch (e) {
      unavailableReason = 'transformers_not_installed:' + (e && e.message ? e.message : 'unknown')
      return null
    }
    const { pipeline, env } = mod
    env.allowRemoteModels = false
    env.localModelPath = path.join(__dirname)
    env.cacheDir = path.join(__dirname, '.cache')
    try {
      const fe = await pipeline('feature-extraction', 'embeddings', { quantized: true })
      return fe
    } catch (e) {
      unavailableReason = 'load_failed:' + (e && e.message ? e.message : 'unknown')
      return null
    }
  })()
  return pipelinePromise
}

const embed = async (text) => {
  const fe = await ensurePipeline()
  if (!fe) return null
  const out = await fe(String(text || '').trim(), { pooling: 'mean', normalize: true })
  return Array.from(out.data)
}

const status = () => ({
  installed: isInstalled(),
  loaded: !!pipelinePromise,
  unavailableReason
})

module.exports = { embed, cosine, isInstalled, status, MODEL_DIR, MODEL_FILE }
