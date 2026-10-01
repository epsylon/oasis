var nearley = require('nearley')
var parser = new nearley.Parser(nearley.Grammar.fromCompiled(require('./test')))

module.exports = function (string) {
  parser.feed(string)
  return parser.results
}

console.log(JSON.stringify(module.exports ('1+2+3')))
