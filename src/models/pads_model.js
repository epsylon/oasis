const pull = require("../server/node_modules/pull-stream")
const crypto = require("crypto")
const fs = require("fs")
const { buildValidatedTombstoneSet } = require('./tombstone_validator')
const { collabContent, openInviteOf } = require('../backend/collab_content')
const padCollab = collabContent({ membersField: 'members', undecField: 'undecryptable', contentFields: ['title', 'deadline', 'status'], listFields: ['tags', 'invites'] })
const path = require("path")
const { getConfig } = require("../configs/config-manager.js")
const logLimit = getConfig().ssbLogStream?.limit || 1000

const safeText = (v) => String(v || "").trim()
const normalizeTags = (raw) => {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(t => String(t || "").trim()).filter(Boolean)
  return String(raw).split(",").map(t => t.trim()).filter(Boolean)
}
const INVITE_SALT = "SolarNET.HuB-pads"
const INVITE_BYTES = 16
const MEMBER_COLORS = ["#e74c3c","#3498db","#2ecc71","#f39c12","#9b59b6","#1abc9c","#e67e22","#e91e63","#00bcd4","#8bc34a"]

module.exports = ({ cooler, cipherModel, tribeCrypto, padCrypto, tribesModel }) => {
  let ssb
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb }

  const ownCrypto = padCrypto || tribeCrypto
  const lookupKey = (rid) => (ownCrypto && ownCrypto.getKey(rid)) || (tribeCrypto && tribeCrypto.getKey(rid)) || null
  const lookupKeys = (rid) => {
    const a = (ownCrypto && ownCrypto.getKeys(rid)) || []
    if (a.length) return a
    return (tribeCrypto && tribeCrypto.getKeys(rid)) || []
  }
  const lookupGen = (rid) => ((ownCrypto && ownCrypto.getGen(rid)) || (tribeCrypto && tribeCrypto.getGen(rid)) || 0)

  let keyringPath = null
  let migratedToTribeCrypto = false
  const getLegacyKeyringPath = () => {
    if (!keyringPath) {
      const ssbConfig = require("../server/node_modules/ssb-config/inject")()
      keyringPath = path.join(ssbConfig.path, "pad-keys.json")
    }
    return keyringPath
  }
  const migrateLegacyKeyring = () => {
    if (migratedToTribeCrypto || !ownCrypto) { migratedToTribeCrypto = true; return }
    migratedToTribeCrypto = true
    try {
      const p = getLegacyKeyringPath()
      if (!fs.existsSync(p)) return
      const legacy = JSON.parse(fs.readFileSync(p, "utf8")) || {}
      for (const [rootId, keyHex] of Object.entries(legacy)) {
        if (rootId && keyHex && !ownCrypto.getKey(rootId)) {
          ownCrypto.setKey(rootId, keyHex, 1)
        }
      }
    } catch (_) {}
  }
  const getPadKey = (rootId) => {
    migrateLegacyKeyring()
    if (ownCrypto) return lookupKey(rootId)
    try { return JSON.parse(fs.readFileSync(getLegacyKeyringPath(), "utf8"))[rootId] || null } catch (_) { return null }
  }
  const setPadKey = (rootId, keyHex) => {
    migrateLegacyKeyring()
    if (ownCrypto) { ownCrypto.setKey(rootId, keyHex, 1); return }
    let kr = {}
    try { kr = JSON.parse(fs.readFileSync(getLegacyKeyringPath(), "utf8")) } catch (_) {}
    kr[rootId] = keyHex
    fs.writeFileSync(getLegacyKeyringPath(), JSON.stringify(kr, null, 2), "utf8")
  }

  const encryptField = (text, keyHex) => {
    const key = Buffer.from(keyHex, "hex")
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
    const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()])
    const authTag = cipher.getAuthTag()
    return iv.toString("hex") + authTag.toString("hex") + enc.toString("hex")
  }

  const decryptField = (encrypted, keyHex) => {
    try {
      const key = Buffer.from(keyHex, "hex")
      const iv = Buffer.from(encrypted.slice(0, 24), "hex")
      const authTag = Buffer.from(encrypted.slice(24, 56), "hex")
      const ciphertext = Buffer.from(encrypted.slice(56), "hex")
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
      decipher.setAuthTag(authTag)
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
    } catch (_) { return "" }
  }

  const tryDecryptField = (encrypted, keyHex) => {
    const key = Buffer.from(keyHex, "hex")
    const iv = Buffer.from(encrypted.slice(0, 24), "hex")
    const authTag = Buffer.from(encrypted.slice(24, 56), "hex")
    const ciphertext = Buffer.from(encrypted.slice(56), "hex")
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
  }

  const getTribeKeysFor = async (tribeId) => {
    if (!tribeCrypto || !tribesModel || !tribeId) return []
    try {
      const rootId = await tribesModel.getRootId(tribeId)
      const keys = tribeCrypto.getKeys(rootId) || []
      return keys
    } catch (_) { return [] }
  }

  const decryptWithKeys = (c, keys) => {
    if (!c.title || !keys.length) return null
    for (const k of keys) {
      try {
        const title = tryDecryptField(c.title, k)
        let deadline = ""
        let tagsRaw = ""
        try { deadline = c.deadline ? tryDecryptField(c.deadline, k) : "" } catch (_) {}
        try { tagsRaw = c.tags ? tryDecryptField(c.tags, k) : "" } catch (_) {}
        const ensureMemberKeys = async (ssbClient, messages, items) => {
    if (!tribeCrypto) return
    const distributed = new Map()
    for (const m of messages) {
      const c = m.value && m.value.content
      if (!c || c.type !== "tribe-keys" || !c.tribeId) continue
      const mk = c.memberKeys
      if (!mk || typeof mk !== "object") continue
      if (!distributed.has(c.tribeId)) distributed.set(c.tribeId, new Set())
      for (const id of Object.keys(mk)) distributed.get(c.tribeId).add(id)
    }
    const ssbKeys = require("../server/node_modules/ssb-keys")
    for (const item of (Array.isArray(items) ? items : [])) {
      if (!item || item.undecryptable) continue
      const rootId = item.rootId
      if (!rootId) continue
      const key = lookupKey(rootId)
      if (!key) continue
      const have = distributed.get(rootId) || new Set()
      const missing = (Array.isArray(item.members) ? item.members : []).filter(m => m && m !== ssbClient.id && !have.has(m))
      if (!missing.length) continue
      const memberKeys = {}
      for (const m of missing) {
        try { memberKeys[m] = tribeCrypto.boxKeyForMember(key, m, ssbKeys) } catch (_) {}
      }
      if (!Object.keys(memberKeys).length) continue
      await new Promise((resolve) => {
        ssbClient.publish({ type: "tribe-keys", tribeId: rootId, generation: lookupGen(rootId) || 1, memberKeys }, () => resolve())
      })
    }
  }

  return { title: safeText(title), deadline, tags: normalizeTags(tagsRaw) }
      } catch (_) {}
    }
    return null
  }

  const encryptForInvite = (padKeyHex, code, saltHex) => {
    const salt = saltHex ? Buffer.from(saltHex, "hex") : Buffer.from(INVITE_SALT)
    const derived = crypto.scryptSync(code, salt, 32)
    return encryptField(padKeyHex, derived.toString("hex"))
  }

  const decryptFromInvite = (encryptedKey, code, saltHex) => {
    const salt = saltHex ? Buffer.from(saltHex, "hex") : Buffer.from(INVITE_SALT)
    const derived = crypto.scryptSync(code, salt, 32)
    return decryptField(encryptedKey, derived.toString("hex"))
  }

  const tryDecryptPublicInviteKey = (invites) => {
    if (!Array.isArray(invites)) return null
    for (const inv of invites) {
      if (!inv || typeof inv !== "object") continue
      if (inv.public !== true) continue
      if (typeof inv.code !== "string" || typeof inv.ek !== "string") continue
      try {
        const key = decryptFromInvite(inv.ek, inv.code, inv.salt)
        if (key) return key
      } catch (_) {}
    }
    return null
  }

  const generateInviteSalt = () => crypto.randomBytes(16).toString("hex")

  const rotatePadKey = async (rootId, remainingMembers) => {
    if (!ownCrypto || !tribeCrypto || !rootId) return
    const existing = getPadKey(rootId)
    if (!existing) return
    const newKey = crypto.randomBytes(32).toString("hex")
    const newGen = ownCrypto.addNewKey(rootId, newKey)
    if (!Array.isArray(remainingMembers) || !remainingMembers.length) return
    const ssbClient = await openSsb()
    const ssbKeys = require("../server/node_modules/ssb-keys")
    const memberKeys = {}
    for (const m of remainingMembers) {
      try { memberKeys[m] = tribeCrypto.boxKeyForMember(newKey, m, ssbKeys) } catch (_) {}
    }
    if (Object.keys(memberKeys).length) {
      await new Promise((resolve) => {
        ssbClient.publish({ type: "tribe-keys", tribeId: rootId, generation: newGen, memberKeys }, () => resolve())
      })
    }
  }

  const ingestOwnTribeKeys = async () => {
    if (!ownCrypto) return
    try {
      const ssbClient = await openSsb()
      const ssbKeys = require("../server/node_modules/ssb-keys")
      const config = require("../server/ssb_config")
      const msgs = await readAll(ssbClient)
      for (const m of msgs) {
        const c = m.value && m.value.content
        if (!c || c.type !== "tribe-keys") continue
        const memberKeys = c.memberKeys
        if (!memberKeys || typeof memberKeys !== "object") continue
        const boxed = memberKeys[ssbClient.id]
        if (!boxed) continue
        try {
          const unboxed = ssbKeys.unbox(boxed, config.keys)
          const key = typeof unboxed === "string" ? unboxed : (unboxed && unboxed.toString ? unboxed.toString() : null)
          if (key && c.tribeId) ownCrypto.addNewKey(c.tribeId, key)
        } catch (_) {}
      }
    } catch (_) {}
  }

  const readAll = async (ssbClient) =>
    new Promise((resolve, reject) =>
      pull(ssbClient.createLogStream({ limit: logLimit }), pull.collect((err, msgs) => err ? reject(err) : resolve(msgs)))
    )

  const buildIndex = (messages) => {
    const tomb = new Set()
    const nodes = new Map()
    const parent = new Map()
    const child = new Map()
    const strictParent = new Map()
    const strictChild = new Map()
    const authorByKey = new Map()
    const tombRequests = []
    const memberMsgs = []

    for (const m of messages) {
      const k = m.key
      const v = m.value || {}
      const c = v.content
      if (!c) continue
      if (c.type === "tombstone" && c.target) { tombRequests.push({ target: c.target, author: v.author }); continue }
      if (c.type === "padMember" && c.target) { memberMsgs.push({ target: c.target, member: c.member, on: c.on !== false, author: v.author, ts: v.timestamp || m.timestamp || 0, code: typeof c.code === "string" ? c.code : "" }); continue }
      if (c.type === "pad") {
        nodes.set(k, { key: k, ts: v.timestamp || m.timestamp || 0, c, author: v.author })
        authorByKey.set(k, v.author)
        if (c.replaces) { parent.set(k, c.replaces); child.set(c.replaces, k) }
      }
    }

    for (const [k, node] of nodes) {
      const t = node.c.replaces
      if (t) { const orig = nodes.get(t); if (orig && orig.author === node.author) { strictParent.set(k, t); strictChild.set(t, k) } }
    }

    for (const t of tombRequests) {
      const targetAuthor = authorByKey.get(t.target)
      if (targetAuthor && t.author === targetAuthor) tomb.add(t.target)
    }

    const rootOf = (id) => { let cur = id, g = 0; while (parent.has(cur) && g++ < 100000) cur = parent.get(cur); return cur }
    const tipOf = (id) => { let cur = id, g = 0; while (child.has(cur) && g++ < 100000) cur = child.get(cur); return cur }
    const strictRootOf = (id) => { let cur = id, g = 0; while (strictParent.has(cur) && g++ < 100000) cur = strictParent.get(cur); return cur }
    const contentTipOf = (root) => {
      const rn = nodes.get(root)
      if (!rn) return root
      let cur = root, best = root, g = 0
      const seen = new Set()
      while (child.has(cur) && !seen.has(cur) && g++ < 100000) {
        seen.add(cur)
        const next = child.get(cur)
        const n = nodes.get(next)
        if (!n) break
        if (n.author === rn.author && !tomb.has(next)) best = next
        cur = next
      }
      return best
    }

    const roots = new Set()
    for (const id of nodes.keys()) roots.add(strictRootOf(id))

    const memberByRoot = new Map()
    const consumedByRoot = new Map()
    for (const mm of memberMsgs) {
      if (!nodes.has(mm.target)) continue
      const r = strictRootOf(mm.target)
      const ownerAuthor = nodes.get(r) && nodes.get(r).author
      if (!ownerAuthor) continue
      const self = mm.member === mm.author
      const byOwner = mm.author === ownerAuthor
      if (!self && !byOwner) continue
      if (!mm.member) continue
      if (!memberByRoot.has(r)) memberByRoot.set(r, new Map())
      const m2 = memberByRoot.get(r)
      const p = m2.get(mm.member)
      if (!p || mm.ts >= p.ts) m2.set(mm.member, { on: mm.on, ts: mm.ts })
      if (mm.on && mm.code) {
        if (!consumedByRoot.has(r)) consumedByRoot.set(r, new Set())
        consumedByRoot.get(r).add(mm.code)
      }
    }

    const isCodeConsumed = (root, code) => {
      if (!code) return false
      const set = consumedByRoot.get(root)
      return !!(set && set.has(code))
    }

    const resolveMembers = (root) => {
      const ownerNode = nodes.get(root)
      const oc = ownerNode ? ownerNode.c : {}
      const set = new Set(Array.isArray(oc.members) ? oc.members.filter(x => typeof x === "string" && x) : [])
      for (const [mem, st] of (memberByRoot.get(root) || new Map())) { if (st.on) set.add(mem); else set.delete(mem) }
      return [...set]
    }

    const tipByRoot = new Map()
    for (const r of roots) tipByRoot.set(r, contentTipOf(r))

    return { tomb, nodes, parent, child, rootOf, tipOf, strictRootOf, contentTipOf, tipByRoot, resolveMembers, isCodeConsumed }
  }

  const decryptPadFields = (c, rootId, tribeKeys) => {
    if (c.encrypted !== true) {
      return { title: safeText(c.title), deadline: c.deadline ? String(c.deadline) : "", tags: normalizeTags(c.tags), _undec: false }
    }
    if (c.tribeId && Array.isArray(tribeKeys) && tribeKeys.length) {
      const viaTribe = decryptWithKeys(c, tribeKeys)
      if (viaTribe) return { ...viaTribe, _undec: false }
    }
    let keyHex = getPadKey(rootId)
    if (!keyHex) keyHex = tryDecryptPublicInviteKey(c.invites)
    if (!keyHex) return { title: "", deadline: "", tags: [], _undec: true }
    const title = c.title ? decryptField(c.title, keyHex) : ""
    const deadline = c.deadline ? decryptField(c.deadline, keyHex) : ""
    const tagsRaw = c.tags ? decryptField(c.tags, keyHex) : ""
    const tags = normalizeTags(tagsRaw)
    return { title, deadline, tags, _undec: false }
  }

  const buildPad = (node, rootId, tribeKeys, members) => {
    const c = node.c || {}
    if (c.type !== "pad") return null
    const { title, deadline, tags, _undec } = decryptPadFields(c, rootId, tribeKeys)
    return {
      key: node.key,
      rootId,
      title,
      status: c.status || "OPEN",
      deadline,
      tags,
      author: c.author || node.author,
      members: Array.isArray(members) ? members : (Array.isArray(c.members) ? c.members : []),
      invites: Array.isArray(c.invites) ? c.invites : [],
      createdAt: c.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || null,
      tribeId: c.tribeId || null,
      encrypted: c.encrypted === true,
      undecryptable: !!_undec
    }
  }

  const isClosed = (pad) => {
    if (pad.status === "CLOSED") return true
    if (!pad.deadline) return false
    return new Date(pad.deadline).getTime() <= Date.now()
  }

  const collectPads = async (idx) => {
    const tribeKeyCache = new Map()
    const items = []
    for (const [rootId, tipId] of idx.tipByRoot.entries()) {
      if (idx.tomb.has(tipId)) continue
      const node = idx.nodes.get(tipId)
      if (!node || node.c.type !== "pad") continue
      let tKeys = []
      if (node.c.tribeId) {
        if (!tribeKeyCache.has(node.c.tribeId)) tribeKeyCache.set(node.c.tribeId, await getTribeKeysFor(node.c.tribeId))
        tKeys = tribeKeyCache.get(node.c.tribeId)
      }
      const pad = buildPad(node, rootId, tKeys, idx.resolveMembers(rootId))
      if (!pad) continue
      pad.isClosed = isClosed(pad)
      items.push(pad)
    }
    return items
  }

  return {
    type: "pad",

    async decryptContent(content, rootId) {
      const tKeys = content && content.tribeId ? await getTribeKeysFor(content.tribeId) : []
      return decryptPadFields(content, rootId, tKeys)
    },

    decryptContentPublicSync(content) {
      if (!content) return null
      if (content.encrypted !== true) {
        return { title: safeText(content.title), deadline: content.deadline ? String(content.deadline) : "", tags: normalizeTags(content.tags) }
      }
      if (content.tribeId) return null
      const keyHex = tryDecryptPublicInviteKey(content.invites)
      if (!keyHex) return null
      try {
        const title = content.title ? decryptField(content.title, keyHex) : ""
        const deadline = content.deadline ? decryptField(content.deadline, keyHex) : ""
        const tagsRaw = content.tags ? decryptField(content.tags, keyHex) : ""
        return { title, deadline, tags: normalizeTags(tagsRaw) }
      } catch (_) { return null }
    },

    async resolveRootId(id) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      const root = idx.strictRootOf(id)
      const tip = idx.contentTipOf(root)
      if (idx.tomb.has(tip)) throw new Error("Not found")
      return root
    },

    async resolveCurrentId(id) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      const root = idx.strictRootOf(id)
      const tip = idx.contentTipOf(root)
      if (idx.tomb.has(tip)) throw new Error("Not found")
      return tip
    },

    async createPad(title, status, deadline, tagsRaw, tribeId) {
      const ssbClient = await openSsb()
      const now = new Date().toISOString()
      const validStatus = ["OPEN", "INVITE-ONLY"].includes(String(status).toUpperCase()) ? String(status).toUpperCase() : "OPEN"
      const userId = ssbClient.id
      const tagsArr = normalizeTags(tagsRaw)

      const isPublicOpen = validStatus === "OPEN" && !tribeId
      if (isPublicOpen) {
        const content = {
          type: "pad",
          title: safeText(title),
          status: validStatus,
          deadline: deadline ? String(deadline) : "",
          tags: tagsArr,
          author: userId,
          members: [userId],
          invites: [],
          createdAt: now,
          updatedAt: now,
          encrypted: false
        }
        return new Promise((resolve, reject) => {
          ssbClient.publish(content, (err, msg) => err ? reject(err) : resolve(msg))
        })
      }

      let keyHex = null
      let usesTribeKey = false
      if (tribeId) {
        const tKeys = await getTribeKeysFor(tribeId)
        if (tKeys.length) { keyHex = tKeys[0]; usesTribeKey = true }
      }
      if (!keyHex) keyHex = crypto.randomBytes(32).toString("hex")
      const enc = (text) => encryptField(text, keyHex)

      const content = {
        type: "pad",
        title: enc(safeText(title)),
        status: validStatus,
        deadline: deadline ? enc(String(deadline)) : "",
        tags: enc(tagsArr.join(",")),
        author: userId,
        members: [userId],
        invites: [],
        createdAt: now,
        updatedAt: now,
        encrypted: true,
        ...(tribeId ? { tribeId } : {})
      }

      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, msg) => {
          if (err) return reject(err)
          if (!usesTribeKey) {
            setPadKey(msg.key, keyHex)
            if (tribeCrypto) {
              try {
                const ssbKeys = require("../server/node_modules/ssb-keys")
                const boxedKey = tribeCrypto.boxKeyForMember(keyHex, userId, ssbKeys)
                ssbClient.publish({ type: "tribe-keys", tribeId: msg.key, generation: 1, memberKeys: { [userId]: boxedKey } }, () => resolve(msg))
                return
              } catch (_) {}
            }
          }
          resolve(msg)
        })
      })
    },

    async updatePadById(id, data) {
      const tipId = await this.resolveCurrentId(id)
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const rootId = await this.resolveRootId(id)

      return new Promise(async (resolve, reject) => {
        ssbClient.get(tipId, async (err, item) => {
          if (err || !item?.content) return reject(new Error("Pad not found"))
          if (item.content.author !== userId) return reject(new Error("Not the author"))
          const c = item.content
          const isEncrypted = c.encrypted === true
          let keyHex = null
          let usesTribeKey = false
          if (isEncrypted) {
            if (c.tribeId) {
              const tKeys = await getTribeKeysFor(c.tribeId)
              if (tKeys.length) { keyHex = tKeys[0]; usesTribeKey = true }
            }
            if (!keyHex) keyHex = getPadKey(rootId)
            if (!keyHex) return reject(new Error(`Missing pad key for ${rootId} — cannot update pad`))
          }
          const enc = (text) => isEncrypted ? encryptField(text, keyHex) : text
          const tagsField = (raw) => isEncrypted ? encryptField(normalizeTags(raw).join(","), keyHex) : normalizeTags(raw)
          const updated = {
            ...c,
            title: data.title !== undefined ? enc(safeText(data.title)) : c.title,
            status: data.status !== undefined ? (["OPEN","INVITE-ONLY"].includes(String(data.status).toUpperCase()) ? String(data.status).toUpperCase() : c.status) : c.status,
            deadline: data.deadline !== undefined ? (isEncrypted ? enc(String(data.deadline)) : String(data.deadline)) : c.deadline,
            tags: data.tags !== undefined ? tagsField(data.tags) : c.tags,
            invites: data.invites !== undefined ? data.invites : c.invites,
            updatedAt: new Date().toISOString(),
            replaces: tipId
          }
          const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
          ssbClient.publish(tombstone, (e1) => {
            if (e1) return reject(e1)
            ssbClient.publish(updated, (e2, res) => {
              if (e2) return reject(e2)
              if (keyHex && !usesTribeKey) setPadKey(res.key, keyHex)
              resolve(res)
            })
          })
        })
      })
    },

    async closePadById(id) {
      const tipId = await this.resolveCurrentId(id)
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const rootId = await this.resolveRootId(id)
      return new Promise(async (resolve, reject) => {
        ssbClient.get(tipId, async (err, item) => {
          if (err || !item?.content) return reject(new Error("Pad not found"))
          if (item.content.author !== userId) return reject(new Error("Not the author"))
          const c = item.content
          let keyHex = null
          let usesTribeKey = false
          if (c.tribeId) {
            const tKeys = await getTribeKeysFor(c.tribeId)
            if (tKeys.length) { keyHex = tKeys[0]; usesTribeKey = true }
          }
          if (!keyHex) keyHex = getPadKey(rootId)
          const updated = {
            ...c,
            status: "CLOSED",
            updatedAt: new Date().toISOString(),
            replaces: tipId
          }
          const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
          ssbClient.publish(tombstone, (e1) => {
            if (e1) return reject(e1)
            ssbClient.publish(updated, (e2, res) => {
              if (e2) return reject(e2)
              if (keyHex && !usesTribeKey) setPadKey(res.key, keyHex)
              resolve(res)
            })
          })
        })
      })
    },

    async leavePad(padId) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const pad = await this.getPadById(padId)
      if (!pad) throw new Error("Pad not found")
      if (pad.author === userId) throw new Error("Author cannot leave their own pad")
      if (!Array.isArray(pad.members) || !pad.members.includes(userId)) return
      const members = pad.members.filter(m => m !== userId)
      const rootId = await this.resolveRootId(padId)
      await new Promise((resolve, reject) => {
        const content = { type: "padMember", target: rootId, member: userId, on: false, createdAt: new Date().toISOString() }
        ssbClient.publish(content, (e) => e ? reject(e) : resolve())
      })
      try { await rotatePadKey(rootId, members) } catch (_) {}
    },

    async ingestKeys() { await ingestOwnTribeKeys() },

    async pruneOrphanKeys() {
      if (!ownCrypto || typeof ownCrypto.getAllRootIds !== "function") return 0
      try {
        const ssbClient = await openSsb()
        const messages = await readAll(ssbClient)
        const live = new Set()
        const tomb = buildValidatedTombstoneSet(messages)
        for (const m of messages) {
          const c = m.value && m.value.content
          if (!c) continue
          if (c.type === "pad") live.add(m.key)
        }
        const all = ownCrypto.getAllRootIds()
        let removed = 0
        for (const rid of all) {
          if (!live.has(rid) || tomb.has(rid)) {
            try { ownCrypto.dropKey(rid); removed += 1 } catch (_) {}
          }
        }
        return removed
      } catch (_) { return 0 }
    },

    async addMemberToPad(padId, feedId, consumedCode) {
      const tipId = await this.resolveCurrentId(padId)
      const ssbClient = await openSsb()
      const rootId = await this.resolveRootId(padId)

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Pad not found"))
          const c = item.content
          if (c.encrypted === true && !c.tribeId && !getPadKey(rootId)) {
            const key = tryDecryptPublicInviteKey(c.invites)
            if (key) setPadKey(rootId, key)
          }
          const content = { type: "padMember", target: rootId, member: feedId, on: true, createdAt: new Date().toISOString(), ...(typeof consumedCode === "string" && consumedCode ? { code: consumedCode } : {}) }
          ssbClient.publish(content, (e, res) => e ? reject(e) : resolve(res))
        })
      })
    },

    async deletePadById(id) {
      const tipId = await this.resolveCurrentId(id)
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Pad not found"))
          if (item.content.author !== userId) return reject(new Error("Not the author"))
          const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
          ssbClient.publish(tombstone, (e) => e ? reject(e) : resolve())
        })
      })
    },

    async getPadById(id) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      const root = idx.strictRootOf(id)
      const tip = idx.contentTipOf(root)
      if (idx.tomb.has(tip)) return null
      const node = idx.nodes.get(tip)
      if (!node || node.c.type !== "pad") return null
      const tKeys = node.c.tribeId ? await getTribeKeysFor(node.c.tribeId) : []
      const pad = buildPad(node, root, tKeys, idx.resolveMembers(root))
      if (!pad) return null
      pad.isClosed = isClosed(pad)
      return padCollab.fold(pad, await collectPads(idx))
    },

    async listAll({ filter = "all", viewerId } = {}) {
      const ssbClient = await openSsb()
      const uid = viewerId || ssbClient.id
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      const now = Date.now()
      let list = padCollab.visibleThenCollapsed(await collectPads(idx), uid)
      if (filter === "mine") list = list.filter(p => p.author === uid)
      else if (filter === "recent") list = list.filter(p => new Date(p.createdAt).getTime() >= now - 86400000)
      else if (filter === "open") list = list.filter(p => !p.isClosed)
      else if (filter === "closed") list = list.filter(p => p.isClosed)
      list = list.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      try { await ensureMemberKeys(ssbClient, messages, list) } catch (_) {}
      return list
    },

    async generateInvite(padId, opts = {}) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const pad = await this.getPadById(padId)
      if (!pad) throw new Error("Pad not found")
      if (pad.author !== userId) throw new Error("Only the author can generate invites")
      const rootId = await this.resolveRootId(padId)
      const keyHex = getPadKey(rootId)
      const code = crypto.randomBytes(INVITE_BYTES).toString("hex")
      let invite = code
      const pubFlag = opts.public ? { public: true } : {}
      if (keyHex) {
        const inviteSalt = generateInviteSalt()
        const ek = encryptForInvite(keyHex, code, inviteSalt)
        invite = { code, ek, salt: inviteSalt, ...pubFlag }
      }
      if (opts.public && typeof invite !== "object") invite = { code, public: true }
      const invites = [...pad.invites, invite]
      await this.updatePadById(padId, { invites })
      return code
    },

    async getOpenInvite(padId) {
      return openInviteOf(await this.getPadById(padId).catch(() => null))
    },

    async generateOpenInvite(padId) {
      const pad = await this.getPadById(padId)
      if (!pad) throw new Error("Pad not found")
      const existing = (Array.isArray(pad.invites) ? pad.invites : []).find(inv => typeof inv === "object" && inv.public === true)
      if (existing) throw new Error("An open invitation already exists")
      return this.generateInvite(padId, { public: true })
    },

    async removeOpenInvite(padId) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const pad = await this.getPadById(padId)
      if (!pad) throw new Error("Pad not found")
      if (pad.author !== userId) throw new Error("Only the author can remove invites")
      const invites = (Array.isArray(pad.invites) ? pad.invites : []).filter(inv => !(typeof inv === "object" && inv.public === true))
      await this.updatePadById(padId, { invites })
    },

    async joinByInvite(code) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const pads = await this.listAll()
      let matchedPad = null
      let matchedInvite = null
      for (const p of pads) {
        for (const inv of p.invites) {
          if (typeof inv === "string" && inv === code) { matchedPad = p; matchedInvite = inv; break }
          if (typeof inv === "object" && inv.code === code) { matchedPad = p; matchedInvite = inv; break }
        }
        if (matchedPad) break
      }
      if (!matchedPad) throw new Error("Invalid or expired invite code")
      if (matchedPad.members.includes(userId)) throw new Error("Already a member")
      const isPublic = typeof matchedInvite === "object" && matchedInvite.public === true
      let resolvedRootId = await this.resolveRootId(matchedPad.rootId)
      if (!isPublic) {
        const messages = await readAll(ssbClient)
        const idx = buildIndex(messages)
        if (idx.isCodeConsumed(resolvedRootId, code)) throw new Error("Invite already used")
      }
      let padKey = null
      if (typeof matchedInvite === "object" && matchedInvite.ek) {
        padKey = decryptFromInvite(matchedInvite.ek, code, matchedInvite.salt)
        setPadKey(resolvedRootId, padKey)
      }
      await this.addMemberToPad(matchedPad.rootId, userId, isPublic ? "" : code)
      if (tribeCrypto && padKey && resolvedRootId) {
        try {
          const ssbKeys = require("../server/node_modules/ssb-keys")
          const memberKeys = {}
          try { memberKeys[userId] = tribeCrypto.boxKeyForMember(padKey, userId, ssbKeys) } catch (_) {}
          if (matchedPad.author && matchedPad.author !== userId) {
            try { memberKeys[matchedPad.author] = tribeCrypto.boxKeyForMember(padKey, matchedPad.author, ssbKeys) } catch (_) {}
          }
          if (Object.keys(memberKeys).length) {
            await new Promise((resolve) => {
              ssbClient.publish({ type: "tribe-keys", tribeId: resolvedRootId, generation: 1, memberKeys }, () => resolve())
            })
          }
        } catch (_) {}
      }
      return matchedPad.rootId
    },

    async addEntry(padId, text) {
      const ssbClient = await openSsb()
      const rootId = await this.resolveRootId(padId)
      const pad = await this.getPadById(rootId)
      const padIsEncrypted = !!(pad && pad.encrypted)
      const now = new Date().toISOString()
      const safeBody = safeText(text)

      if (!padIsEncrypted) {
        const content = {
          type: "padEntry",
          padId: rootId,
          text: safeBody,
          author: ssbClient.id,
          createdAt: now,
          encrypted: false,
          ...(pad && pad.tribeId ? { tribeId: pad.tribeId } : {})
        }
        return new Promise((resolve, reject) => {
          ssbClient.publish(content, (err, msg) => err ? reject(err) : resolve(msg))
        })
      }

      let keyHex = null
      if (pad && pad.tribeId) {
        const tKeys = await getTribeKeysFor(pad.tribeId)
        if (tKeys.length) keyHex = tKeys[0]
      }
      if (!keyHex) keyHex = getPadKey(rootId)
      if (!keyHex) throw new Error(`Missing pad key for ${rootId} — cannot publish pad entry`)
      const content = {
        type: "padEntry",
        padId: rootId,
        text: encryptField(safeBody, keyHex),
        author: ssbClient.id,
        createdAt: now,
        encrypted: true,
        ...(pad && pad.tribeId ? { tribeId: pad.tribeId } : {})
      }
      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, msg) => err ? reject(err) : resolve(msg))
      })
    },

    async getEntries(padRootId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      const wantRoot = idx.rootOf(padRootId)
      const pad = await this.getPadById(padRootId)
      const padKey = getPadKey(padRootId)
      let tribeKeys = []
      if (pad && pad.tribeId) {
        tribeKeys = await getTribeKeysFor(pad.tribeId)
      }
      const entries = []
      for (const m of messages) {
        const v = m.value || {}
        const c = v.content
        if (!c || c.type !== "padEntry") continue
        if (c.padId !== padRootId && idx.rootOf(c.padId) !== wantRoot) continue
        let text = c.text || ""
        if (c.encrypted && c.text) {
          let decoded = ""
          for (const k of tribeKeys) {
            try { decoded = tryDecryptField(c.text, k); break } catch (_) {}
          }
          if (!decoded && padKey) decoded = decryptField(c.text, padKey)
          text = decoded
        }
        entries.push({
          key: m.key,
          author: c.author || v.author,
          text,
          createdAt: c.createdAt || new Date(v.timestamp || 0).toISOString()
        })
      }
      entries.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      return entries
    },

    getMemberColor(members, feedId) {
      const idx = members.indexOf(feedId)
      return idx >= 0 ? MEMBER_COLORS[idx % MEMBER_COLORS.length] : "#888"
    }
  }
}
