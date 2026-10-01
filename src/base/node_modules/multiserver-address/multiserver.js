// Generated automatically by nearley, version 2.15.1
// http://github.com/Hardmath123/nearley
(function () {
function id(x) { return x[0]; }
var grammar = {
    Lexer: undefined,
    ParserRules: [
    {"name": "multiaddress$ebnf$1", "symbols": []},
    {"name": "multiaddress$ebnf$1$subexpression$1", "symbols": [{"literal":";"}, "address"]},
    {"name": "multiaddress$ebnf$1", "symbols": ["multiaddress$ebnf$1", "multiaddress$ebnf$1$subexpression$1"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "multiaddress", "symbols": ["address", "multiaddress$ebnf$1"], "postprocess": d => [d[0]].concat(d[1].map(function (e) { return e[1] }))},
    {"name": "address$ebnf$1", "symbols": []},
    {"name": "address$ebnf$1$subexpression$1", "symbols": [{"literal":"~"}, "protocol"]},
    {"name": "address$ebnf$1", "symbols": ["address$ebnf$1", "address$ebnf$1$subexpression$1"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "address", "symbols": ["protocol", "address$ebnf$1"], "postprocess": d => [d[0]].concat(d[1].map(function (e) { return e[1] }))},
    {"name": "protocol$ebnf$1", "symbols": []},
    {"name": "protocol$ebnf$1$subexpression$1", "symbols": [{"literal":":"}, "data"]},
    {"name": "protocol$ebnf$1", "symbols": ["protocol$ebnf$1", "protocol$ebnf$1$subexpression$1"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "protocol", "symbols": ["name", "protocol$ebnf$1"], "postprocess": (d) => { return {name: d[0], data: d[1].map(e =>  e[1] )} }},
    {"name": "name$ebnf$1", "symbols": [/[a-z\-0-9]/]},
    {"name": "name$ebnf$1", "symbols": ["name$ebnf$1", /[a-z\-0-9]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "name", "symbols": [/[a-z]/, "name$ebnf$1"], "postprocess": d => d[0]+d[1].join('')},
    {"name": "data$ebnf$1", "symbols": []},
    {"name": "data$ebnf$1$subexpression$1", "symbols": ["char"]},
    {"name": "data$ebnf$1$subexpression$1", "symbols": ["escaped_char"]},
    {"name": "data$ebnf$1", "symbols": ["data$ebnf$1", "data$ebnf$1$subexpression$1"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "data", "symbols": ["data$ebnf$1"], "postprocess": d => d[0].join('')},
    {"name": "char", "symbols": [/["-9]/]},
    {"name": "char", "symbols": [/[<-}]/], "postprocess": d => d[0]},
    {"name": "escaped_char$subexpression$1$string$1", "symbols": [{"literal":"!"}, {"literal":"!"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "escaped_char$subexpression$1", "symbols": ["escaped_char$subexpression$1$string$1"]},
    {"name": "escaped_char$subexpression$1$string$2", "symbols": [{"literal":"!"}, {"literal":"~"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "escaped_char$subexpression$1", "symbols": ["escaped_char$subexpression$1$string$2"]},
    {"name": "escaped_char$subexpression$1$string$3", "symbols": [{"literal":"!"}, {"literal":":"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "escaped_char$subexpression$1", "symbols": ["escaped_char$subexpression$1$string$3"]},
    {"name": "escaped_char$subexpression$1$string$4", "symbols": [{"literal":"!"}, {"literal":";"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "escaped_char$subexpression$1", "symbols": ["escaped_char$subexpression$1$string$4"]},
    {"name": "escaped_char", "symbols": ["escaped_char$subexpression$1"], "postprocess": d => d[0][0][1]}
]
  , ParserStart: "multiaddress"
}
if (typeof module !== 'undefined'&& typeof module.exports !== 'undefined') {
   module.exports = grammar;
} else {
   window.grammar = grammar;
}
})();
