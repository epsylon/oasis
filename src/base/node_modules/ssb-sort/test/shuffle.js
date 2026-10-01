module.exports = function shuffle (ary) {
  return ary.slice().sort(function () {
    return Math.random() - 0.5
  })
}

