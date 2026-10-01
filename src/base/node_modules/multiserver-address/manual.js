
var name_rx = /^[a-z\-0-9]+/g
var data_rx = /(["-9]|[<-}]|![!~:;])+/g //includes escapes

var multiserver_rx = `/
    (?:[a-z\-0-9]+) //name
    (?:\:(["-9]|[<-}]|![!~:;])+)+ //data
    (?:
      ~
      (?:[a-z\-0-9]+) //name
      (?:\:(["-9]|[<-}]|![!~:;])+)* //data
    )*
    (?:
    ;
      (?:[a-z\-0-9]+) //name
      (?:\:(["-9]|[<-}]|![!~:;])+)+ //data
      (?:
        ~
        (?:[a-z\-0-9]+)
        (?:\:(["-9]|[<-}]|![!~:;])+)*
      )*
    )*
/`

var name = `(?:[a-z\-0-9])+`
var data = `(?:["-9]|[<-}]|![!~:;])+`
var protocol = `(${name})((?:\:${data})*)`
var address = `${protocol}(?:(~)${protocol})*`
var multi = `${address}(?:(;)${address})*`

console.log('^'+multi+'$')

var multi_rx = new RegExp(multi)

module.exports = function (string) {
  return multi_rx.exec(string)
  var c = 0
  while(c < string.length) {
    var proto = []
    //extract a name
    name_rx.lastIndex = c
    match = name_rx.exec(string)
    if(!match) throw new Error('name expected!')
    c += match[0].length
    proto.push(match[0])

    //optional data
    while(string[c] === ':') {
      c ++
      data_rx.lastIndex = c
      match = data_rx.exec(string)
      console.log(c, string[c], string.substring(c), data_rx, match)
      if(!match) throw new Error('data expected!')
      c += match[0].length
      proto.push(match[0])
    }
    return proto
  }
}

console.log(module.exports('net:host.com:9800~shs:aohuentohuenth;ws:host2-com:80~shs:oercuEOAU'))

