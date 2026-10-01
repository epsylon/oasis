
//module.exports = function (sep, esc) {
//  sep = sep || ','
//  esc = esc || '\\'
//
//  new RegExp('([^'+sep+']|'+esc+sep+')
//}

module.exports = function (sep, esc) {
  if(sep.length != 1) throw new Error('separator must be a single char')
  if(esc.length != 1) throw new Error('escape must be a single char')

  return {
    parse: function (str) {
      var ary = []
      var cur = ''
      for(var i = 0; i < str.length; i++) {
       if(str[i] == esc && i+1 < str.length) {
          cur += str[++i]
        }
        else if(str[i] === sep) {
          ary.push(cur)
          cur = ''
        }
        else
          cur += str[i]
      }
      ary.push(cur)
      return ary

    },
    stringify: function (ary) {
      //for each item in the array.
      return ary.map(function (str) {
        var s = ''
        for(var i = 0; i < str.length; i++) {
          if(str[i] === esc || str[i] === sep)
            s += esc + str[i]
          else
            s += str[i]
        }
        return s
      }).join(sep)
    }
  }
}


