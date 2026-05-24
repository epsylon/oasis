const pull = require("../server/node_modules/pull-stream")
const crypto = require("crypto")
const fs = require("fs")
const { buildValidatedTombstoneSet } = require('./tombstone_validator')
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
    const authorByKey = new Map()
    const tombRequests = []

    for (const m of messages) {
      const k = m.key
      const v = m.value || {}
      const c = v.content
      if (!c) continue
      if (c.type === "tombstone" && c.target) { tombRequests.push({ target: c.target, author: v.author }); continue }
      if (c.type === "pad") {
        nodes.set(k, { key: k, ts: v.timestamp || m.timestamp || 0, c, author: v.author })
        authorByKey.set(k, v.author)
        if (c.replaces) { parent.set(k, c.replaces); child.set(c.replaces, k) }
      }
    }

    for (const t of tombRequests) {
      const targetAuthor = authorByKey.get(t.target)
      if (targetAuthor && t.author === targetAuthor) tomb.add(t.target)
    }

    const rootOf = (id) => { let cur = id; while (parent.has(cur)) cur = parent.get(cur); return cur }
    const tipOf = (id) => { let cur = id; while (child.has(cur)) cur = child.get(cur); return cur }

    const roots = new Set()
    for (const id of nodes.keys()) roots.add(rootOf(id))
    const tipByRoot = new Map()
    for (const r of roots) tipByRoot.set(r, tipOf(r))

    return { tomb, nodes, parent, child, rootOf, tipOf, tipByRoot }
  }

  const decryptPadFields = (c, rootId, tribeKeys) => {
    if (c.encrypted !== true) {
      return { title: safeText(c.title), deadline: c.deadline ? String(c.deadline) : "", tags: normalizeTags(c.tags) }
    }
    if (c.tribeId && Array.isArray(tribeKeys) && tribeKeys.length) {
      const viaTribe = decryptWithKeys(c, tribeKeys)
      if (viaTribe) return viaTribe
    }
    const keyHex = getPadKey(rootId)
    if (!keyHex) return { title: "", deadline: "", tags: [] }
    const title = c.title ? decryptField(c.title, keyHex) : ""
    const deadline = c.deadline ? decryptField(c.deadline, keyHex) : ""
    const tagsRaw = c.tags ? decryptField(c.tags, keyHex) : ""
    const tags = normalizeTags(tagsRaw)
    return { title, deadline, tags }
  }

  const buildPad = (node, rootId, tribeKeys) => {
    const c = node.c || {}
    if (c.type !== "pad") return null
    const { title, deadline, tags } = decryptPadFields(c, rootId, tribeKeys)
    return {
      key: node.key,
      rootId,
      title,
      status: c.status || "OPEN",
      deadline,
      tags,
      author: c.author || node.author,
      members: Array.isArray(c.members) ? c.members : [],
      invites: Array.isArray(c.invites) ? c.invites : [],
      createdAt: c.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || null,
      tribeId: c.tribeId || null
    }
  }

  const isClosed = (pad) => {
    if (pad.status === "CLOSED") return true
    if (!pad.deadline) return false
    return new Date(pad.deadline).getTime() <= Date.now()
  }

  return {
    type: "pad",

    async decryptContent(content, rootId) {
      const tKeys = content && content.tribeId ? await getTribeKeysFor(content.tribeId) : []
      return decryptPadFields(content, rootId, tKeys)
    },

    async resolveRootId(id) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      let tip = id
      while (idx.child.has(tip)) tip = idx.child.get(tip)
      if (idx.tomb.has(tip)) throw new Error("Not found")
      let root = tip
      while (idx.parent.has(root)) root = idx.parent.get(root)
      return root
    },

    async resolveCurrentId(id) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      let tip = id
      while (idx.child.has(tip)) tip = idx.child.get(tip)
      if (idx.tomb.has(tip)) throw new Error("Not found")
      return tip
    },

    async createPad(title, status, deadline, tagsRaw, tribeId) {
      const ssbClient = await openSsb()
      const now = new Date().toISOString()
      const validStatus = ["OPEN", "INVITE-ONLY"].includes(String(status).toUpperCase()) ? String(status).toUpperCase() : "OPEN"

      let keyHex = null
      let usesTribeKey = false
      if (tribeId) {
        const tKeys = await getTribeKeysFor(tribeId)
        if (tKeys.length) { keyHex = tKeys[0]; usesTribeKey = true }
      }
      if (!keyHex) keyHex = crypto.randomBytes(32).toString("hex")
      const enc = (text) => encryptField(text, keyHex)

      const initialInvites = []
      if (validStatus === "OPEN" && !usesTribeKey) {
        const pubCode = crypto.randomBytes(INVITE_BYTES).toString("hex")
        const inviteSalt = generateInviteSalt()
        const ek = encryptForInvite(keyHex, pubCode, inviteSalt)
        initialInvites.push({ code: pubCode, ek, salt: inviteSalt, gen: 1, public: true })
      }

      const content = {
        type: "pad",
        title: enc(safeText(title)),
        status: validStatus,
        deadline: deadline ? enc(String(deadline)) : "",
        tags: enc(normalizeTags(tagsRaw).join(",")),
        author: ssbClient.id,
        members: [ssbClient.id],
        invites: initialInvites,
        createdAt: now,
        updatedAt: now,
        encrypted: true,
        ...(tribeId ? { tribeId } : {})
      }

      const userId = ssbClient.id
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
          let keyHex = null
          let usesTribeKey = false
          if (c.tribeId) {
            const tKeys = await getTribeKeysFor(c.tribeId)
            if (tKeys.length) { keyHex = tKeys[0]; usesTribeKey = true }
          }
          if (!keyHex) keyHex = getPadKey(rootId)
          if (!keyHex) throw new Error(`Missing pad key for ${rootId} — cannot update pad`)
          const enc = (text) => encryptField(text, keyHex)
          const updated = {
            ...c,
            title: data.title !== undefined ? enc(safeText(data.title)) : c.title,
            status: data.status !== undefined ? (["OPEN","INVITE-ONLY"].includes(String(data.status).toUpperCase()) ? String(data.status).toUpperCase() : c.status) : c.status,
            deadline: data.deadline !== undefined ? enc(String(data.deadline)) : c.deadline,
            tags: data.tags !== undefined ? enc(normalizeTags(data.tags).join(",")) : c.tags,
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
      const members = (Array.isArray(pad.members) ? pad.members : []).filter(m => m !== userId)
      if (!Array.isArray(pad.members) || !pad.members.includes(userId)) return
      const tipId = await this.resolveCurrentId(padId)
      const rootId = await this.resolveRootId(padId)
      await new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Pad not found"))
          const updated = { ...item.content, members, updatedAt: new Date().toISOString(), replaces: tipId }
          const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
          ssbClient.publish(tombstone, (e1) => {
            if (e1) return reject(e1)
            ssbClient.publish(updated, (e2) => e2 ? reject(e2) : resolve())
          })
        })
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

    async addMemberToPad(padId, feedId) {
      const tipId = await this.resolveCurrentId(padId)
      const ssbClient = await openSsb()
      const rootId = await this.resolveRootId(padId)

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Pad not found"))
          const c = item.content
          const members = Array.isArray(c.members) ? c.members : []
          if (members.includes(feedId)) return resolve()
          const updated = { ...c, members: [...members, feedId], updatedAt: new Date().toISOString(), replaces: tipId }
          const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: ssbClient.id }
          ssbClient.publish(tombstone, (e1) => {
            if (e1) return reject(e1)
            ssbClient.publish(updated, (e2, res) => {
              if (e2) return reject(e2)
              if (!c.tribeId) {
                const keyHex = getPadKey(rootId)
                if (keyHex) setPadKey(res.key, keyHex)
              }
              resolve(res)
            })
          })
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
      let tip = id
      while (idx.child.has(tip)) tip = idx.child.get(tip)
      if (idx.tomb.has(tip)) return null
      const node = idx.nodes.get(tip)
      if (!node || node.c.type !== "pad") return null
      let root = tip
      while (idx.parent.has(root)) root = idx.parent.get(root)
      const tKeys = node.c.tribeId ? await getTribeKeysFor(node.c.tribeId) : []
      const pad = buildPad(node, root, tKeys)
      if (!pad) return null
      pad.isClosed = isClosed(pad)
      return pad
    },

    async listAll({ filter = "all", viewerId } = {}) {
      const ssbClient = await openSsb()
      const uid = viewerId || ssbClient.id
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      const tribeKeyCache = new Map()
      const items = []
      for (const [rootId, tipId] of idx.tipByRoot.entries()) {
        if (idx.tomb.has(tipId)) continue
        const node = idx.nodes.get(tipId)
        if (!node || node.c.type !== "pad") continue
        let tKeys = []
        if (node.c.tribeId) {
          if (!tribeKeyCache.has(node.c.tribeId)) {
            tribeKeyCache.set(node.c.tribeId, await getTribeKeysFor(node.c.tribeId))
          }
          tKeys = tribeKeyCache.get(node.c.tribeId)
        }
        const pad = buildPad(node, rootId, tKeys)
        if (!pad) continue
        pad.isClosed = isClosed(pad)
        items.push(pad)
      }
      const now = Date.now()
      let list = items
      if (filter === "mine") list = list.filter(p => p.author === uid)
      else if (filter === "recent") list = list.filter(p => new Date(p.createdAt).getTime() >= now - 86400000)
      else if (filter === "open") list = list.filter(p => !p.isClosed)
      else if (filter === "closed") list = list.filter(p => p.isClosed)
      return list.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    },

    async generateInvite(padId) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const pad = await this.getPadById(padId)
      if (!pad) throw new Error("Pad not found")
      if (pad.author !== userId) throw new Error("Only the author can generate invites")
      const rootId = await this.resolveRootId(padId)
      const keyHex = getPadKey(rootId)
      const code = crypto.randomBytes(INVITE_BYTES).toString("hex")
      let invite = code
      if (keyHex) {
        const inviteSalt = generateInviteSalt()
        const ek = encryptForInvite(keyHex, code, inviteSalt)
        invite = { code, ek, salt: inviteSalt }
      }
      const invites = [...pad.invites, invite]
      await this.updatePadById(padId, { invites })
      return code
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
      let padKey = null
      let resolvedRootId = null
      if (typeof matchedInvite === "object" && matchedInvite.ek) {
        padKey = decryptFromInvite(matchedInvite.ek, code, matchedInvite.salt)
        resolvedRootId = await this.resolveRootId(matchedPad.rootId)
        setPadKey(resolvedRootId, padKey)
      }
      await this.addMemberToPad(matchedPad.rootId, userId)
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
      const isPublicInvite = typeof matchedInvite === "object" && matchedInvite.public === true
      const invites = isPublicInvite ? matchedPad.invites : matchedPad.invites.filter(inv => {
        if (typeof inv === "string") return inv !== code
        return inv.code !== code
      })
      const tipId = await this.resolveCurrentId(matchedPad.rootId)
      const ssbC = await openSsb()
      return new Promise((resolve, reject) => {
        ssbC.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Pad not found after join"))
          const updated = { ...item.content, invites, updatedAt: new Date().toISOString(), replaces: tipId }
          const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
          ssbC.publish(tombstone, (e1) => {
            if (e1) return reject(e1)
            ssbC.publish(updated, (e2, res) => e2 ? reject(e2) : resolve(matchedPad.rootId))
          })
        })
      })
    },

    async addEntry(padId, text) {
      const ssbClient = await openSsb()
      const rootId = await this.resolveRootId(padId)
      const pad = await this.getPadById(rootId)
      let keyHex = null
      if (pad && pad.tribeId) {
        const tKeys = await getTribeKeysFor(pad.tribeId)
        if (tKeys.length) keyHex = tKeys[0]
      }
      if (!keyHex) keyHex = getPadKey(rootId)
      if (!keyHex) throw new Error(`Missing pad key for ${rootId} — cannot publish pad entry`)
      const now = new Date().toISOString()
      const encText = encryptField(safeText(text), keyHex)
      const content = {
        type: "padEntry",
        padId: rootId,
        text: encText,
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
        if (c.padId !== padRootId) continue
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
