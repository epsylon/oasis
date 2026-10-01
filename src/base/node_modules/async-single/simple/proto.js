
module.exports = Single

function Single (async) {
  if(!(this instanceof Single)) return new Single(async)
  this.writing = false
  this.value = null
  this.onDrain = null
  this._async = async
}

Single.prototype.write = function (value) {
  this.value = value
  if(!this.writing)
    this._write()
}

Single.prototype._write = function () {
  this.writing = true
  var value = this.value
  this.value = null
  this._async(value, this._cb.bind(this))
}

Single.prototype._cb = function () {
  this.writing = false
  if(this.value) this._write()
  else if(this.onDrain) this.onDrain()
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

