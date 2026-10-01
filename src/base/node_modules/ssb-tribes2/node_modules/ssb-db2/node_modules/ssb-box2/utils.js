// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

class ReadyGate {
  constructor() {
    this.waiting = new Set()
    this.ready = false
  }

  onReady(cb) {
    if (this.ready) cb()
    else this.waiting.add(cb)
  }

  setReady() {
    this.ready = true
    for (const cb of this.waiting) cb()
    this.waiting.clear()
  }
}

module.exports = { ReadyGate }
