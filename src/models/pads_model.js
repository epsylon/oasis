const pull = require("../server/node_modules/pull-stream")
const crypto = require("crypto")
const fs = require("fs")
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

module.exports = ({ cooler, cipherModel }) => {
  let ssb
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb }

  let keyringPath = null
  const getKeyring = () => {
    if (!keyringPath) {
      const ssbConfig = require("../server/node_modules/ssb-config/inject")()
      keyringPath = path.join(ssbConfig.path, "pad-keys.json")
    }
    try { return JSON.parse(fs.readFileSync(keyringPath, "utf8")) } catch (e) { return {} }
  }
  const saveKeyring = (kr) => fs.writeFileSync(keyringPath, JSON.stringify(kr, null, 2), "utf8")
  const getPadKey = (rootId) => { const kr = getKeyring(); return kr[rootId] || null }
  const setPadKey = (rootId, keyHex) => { const kr = getKeyring(); kr[rootId] = keyHex; saveKeyring(kr) }

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

  const encryptForInvite = (padKeyHex, code) => {
    const derived = crypto.scryptSync(code, INVITE_SALT, 32)
    return encryptField(padKeyHex, derived.toString("hex"))
  }

  const decryptFromInvite = (encryptedKey, code) => {
    const derived = crypto.scryptSync(code, INVITE_SALT, 32)
    return decryptField(encryptedKey, derived.toString("hex"))
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

    for (const m of messages) {
      const k = m.key
      const v = m.value || {}
      const c = v.content
      if (!c) continue
      if (c.type === "tombstone" && c.target) { tomb.add(c.target); continue }
      if (c.type === "pad") {
        nodes.set(k, { key: k, ts: v.timestamp || m.timestamp || 0, c, author: v.author })
        if (c.replaces) { parent.set(k, c.replaces); child.set(c.replaces, k) }
      }
    }

    const rootOf = (id) => { let cur = id; while (parent.has(cur)) cur = parent.get(cur); return cur }
    const tipOf = (id) => { let cur = id; while (child.has(cur)) cur = child.get(cur); return cur }

    const roots = new Set()
    for (const id of nodes.keys()) roots.add(rootOf(id))
    const tipByRoot = new Map()
    for (const r of roots) tipByRoot.set(r, tipOf(r))

    return { tomb, nodes, parent, child, rootOf, tipOf, tipByRoot }
  }

  const decryptPadFields = (c, rootId) => {
    const keyHex = getPadKey(rootId)
    if (!keyHex) return { title: "", deadline: "", tags: [] }
    const title = c.title ? decryptField(c.title, keyHex) : ""
    const deadline = c.deadline ? decryptField(c.deadline, keyHex) : ""
    const tagsRaw = c.tags ? decryptField(c.tags, keyHex) : ""
    const tags = normalizeTags(tagsRaw)
    return { title, deadline, tags }
  }

  const buildPad = (node, rootId) => {
    const c = node.c || {}
    if (c.type !== "pad") return null
    const { title, deadline, tags } = decryptPadFields(c, rootId)
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

    decryptContent(content, rootId) {
      return decryptPadFields(content, rootId)
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
      const keyHex = crypto.randomBytes(32).toString("hex")

      const encrypt = (text) => {
        const key = Buffer.from(keyHex, "hex")
        const iv = crypto.randomBytes(12)
        const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
        const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()])
        const authTag = cipher.getAuthTag()
        return iv.toString("hex") + authTag.toString("hex") + enc.toString("hex")
      }

      const content = {
        type: "pad",
        title: encrypt(safeText(title)),
        status: validStatus,
        deadline: deadline ? encrypt(String(deadline)) : "",
        tags: encrypt(normalizeTags(tagsRaw).join(",")),
        author: ssbClient.id,
        members: [ssbClient.id],
        invites: [],
        createdAt: now,
        updatedAt: now,
        encrypted: true,
        ...(tribeId ? { tribeId } : {})
      }

      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, msg) => {
          if (err) return reject(err)
          setPadKey(msg.key, keyHex)
          resolve(msg)
        })
      })
    },

    async updatePadById(id, data) {
      const tipId = await this.resolveCurrentId(id)
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const rootId = await this.resolveRootId(id)
      const keyHex = getPadKey(rootId)

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Pad not found"))
          if (item.content.author !== userId) return reject(new Error("Not the author"))
          const c = item.content
          const enc = (text) => keyHex ? encryptField(text, keyHex) : text
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
              if (keyHex) setPadKey(res.key, keyHex)
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
      const keyHex = getPadKey(rootId)
      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Pad not found"))
          if (item.content.author !== userId) return reject(new Error("Not the author"))
          const c = item.content
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
              if (keyHex) setPadKey(res.key, keyHex)
              resolve(res)
            })
          })
        })
      })
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
              const keyHex = getPadKey(rootId)
              if (keyHex) setPadKey(res.key, keyHex)
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
      const pad = buildPad(node, root)
      if (!pad) return null
      pad.isClosed = isClosed(pad)
      return pad
    },

    async listAll({ filter = "all", viewerId } = {}) {
      const ssbClient = await openSsb()
      const uid = viewerId || ssbClient.id
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      const items = []
      for (const [rootId, tipId] of idx.tipByRoot.entries()) {
        if (idx.tomb.has(tipId)) continue
        const node = idx.nodes.get(tipId)
        if (!node || node.c.type !== "pad") continue
        const pad = buildPad(node, rootId)
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
        const ek = encryptForInvite(keyHex, code)
        invite = { code, ek }
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
      if (typeof matchedInvite === "object" && matchedInvite.ek) {
        const padKey = decryptFromInvite(matchedInvite.ek, code)
        const rootId = await this.resolveRootId(matchedPad.rootId)
        setPadKey(rootId, padKey)
      }
      await this.addMemberToPad(matchedPad.rootId, userId)
      const invites = matchedPad.invites.filter(inv => {
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
      const keyHex = getPadKey(rootId)
      const now = new Date().toISOString()
      const encText = keyHex ? encryptField(safeText(text), keyHex) : safeText(text)
      const content = {
        type: "padEntry",
        padId: rootId,
        text: encText,
        author: ssbClient.id,
        createdAt: now,
        encrypted: !!keyHex
      }
      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, msg) => err ? reject(err) : resolve(msg))
      })
    },

    async getEntries(padRootId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const keyHex = getPadKey(padRootId)
      const entries = []
      for (const m of messages) {
        const v = m.value || {}
        const c = v.content
        if (!c || c.type !== "padEntry") continue
        if (c.padId !== padRootId) continue
        const text = (keyHex && c.encrypted) ? decryptField(c.text, keyHex) : (c.text || "")
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
