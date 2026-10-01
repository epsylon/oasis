
module.exports = Single

function Single (async, opts) {
  if(!(this instanceof Single)) return new Single(async, opts)
  this.writing = false
  this.value = null
  this.onDrain = null
  this._async = async
  this._options = opts || {}
  this._setTimeout = opts && opts.setTimeout || function (fn, delay) { return setTimeout(fn, delay) }
}

Single.prototype.write = function (value) {
  this.value = value
  if(!this.writing)
    this._timeout()
}

Single.prototype._write = function () {
  this.writing = true
  var value = this.value
  this.value = null
  this._async(value, this._written.bind(this))
}

Single.prototype._timeout = function (delay) {
  clearTimeout(this._timer)
  this._timer = this._setTimeout(
    this._write.bind(this),
    delay == null ? Math.max(
      this._options.min,
      this._options.max - (Date.now() - this._ts)
    ) : delay
  )
}

Single.prototype._written = function () {
  this._ts = Date.now()
  this.writing = false
  if(this.value) this.write(this.value)
  else {
    if(this.onDrain) this.onDrain()
    var cb = this._cb
    this._cb = null
    if(cb) cb()
  }
}

Single.prototype.close = function (cb) {
  if(this.writing) this._cb = cb
  else if(this.value) {
    this._cb = cb
    this._timeout(0)
  }
  else cb()
}

/*
this style was the easiest to write, but I implemented
this third, so I understood the problem fairly well by now.

This still has loose disipline about events and states.
_* functions _could_ represent events, if all state updates
was moved to normal functions. that would take a few extra lines
and duplicate some code though.

and it's a different distinction from private/public.
_cb is an update.
*/




