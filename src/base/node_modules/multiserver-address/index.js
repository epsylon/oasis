var nearley = require('nearley')
var grammar = nearley.Grammar.fromCompiled(require('./multiserver'))

function parse (string) {
  var parser = new nearley.Parser(grammar)
  parser.feed(string)
  var a = parser.results
  if(a.length  === 0) throw new Error('unexpected end')
  return a[0]
}

exports.decode = function (address) {
  return parse(address)
}

exports.encode = function (data) {
  return data.map(function (e) {
    return e.map(function (e) {
      return e.name + (e.data.length ? ':'+e.data.join(':') : '')
    }).join('~')
  }).join(';')
}

function repeat (head, separator, tail) {
  if(!tail) tail = head
  return head + '(?:'+ separator + tail + ')*'
}

var name = '[a-z][a-z\-0-9]+'
var data = '(?:["-9]|[<-}]|![!~:;])*'
var protocol = repeat(name, ':', data)
var address = repeat(protocol, '~')
var multi = repeat(address, ';')

var multi_rx = new RegExp('^'+multi+'$')

exports.check = function (data) {
  return !!multi_rx.exec(data)
}

exports.type = 'multiaddress'

exports.buffer = false

