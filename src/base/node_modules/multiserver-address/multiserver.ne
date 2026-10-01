multiaddress -> address (";" address ):* {% d => [d[0]].concat(d[1].map(function (e) { return e[1] })) %}

address -> protocol ("~" protocol):* {% d => [d[0]].concat(d[1].map(function (e) { return e[1] })) %}

protocol -> name  (":" data):* {% (d) => { return {name: d[0], data: d[1].map(e =>  e[1] )} } %}

name -> [a-z] [a-z\-0-9]:+ {% d => d[0]+d[1].join('') %}

data -> (char | escaped_char ):* {% d => d[0].join('') %}

char -> ["-9] | [<-}] {% d => d[0] %}

escaped_char -> ( "!!" | "!~" | "!:" | "!;") {% d => d[0][0][1] %}

