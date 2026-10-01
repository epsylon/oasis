
var Unparse = require('nearley/lib/unparse')
var nearley = require('nearley')
var grammar = nearley.Grammar.fromCompiled(require('../multiserver'))

function unparse (string) {
  return Unparse(grammar, grammar.ParserStart)
//  parser.feed(string)
//  var a = parser.results
//  if(a.length  === 0) throw new Error('unexpected end')
//  return a[0]
}

console.log(
  Unparse(grammar, grammar.ParserStart, null)
)
