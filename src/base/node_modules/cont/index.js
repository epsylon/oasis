var cont = require('continuable')

exports = module.exports = function (fun) {
  return cont.to(fun)
}

for(var k in cont)
  exports[k] = cont[k]

exports.para = require('continuable-para')
exports.series = require('continuable-series')
