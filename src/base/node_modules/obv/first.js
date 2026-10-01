

module.exports = function (a, b, combine) {
  var o = observer()
  var _a, _b

  function trigger (a,b) {
    o.set(combine(a, b))
  }

  if(a.value || b.value) return trigger(a.value, b.value)
  else {
    var rm_a = a(function (val) {
      trigger(_a = val, _b)
    })
    var rm_b = b(function (val) {
      trigger(_a, _b = val)
    })
}

