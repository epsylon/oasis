
var char = '[a-zA-Z0-9\/\+]'
var trail2 = '[AQgw]=='
var trail4 = '[AEIMQUYcgkosw048]='
var rx = '(?:' +char+ '{4})*(?:' +char+ '(?:(?:' +trail2 + ')|(?:' +char+trail4+ ')))?'
module.exports = function (prefix,suffix, length) {
  if(!Number.isInteger(length)) return new RegExp('^'+(prefix||'')+rx+(suffix||'')+'$')

  var mod = length % 3

  return new RegExp('^'+(prefix||'')+(
      char +'{'+~~((length*8)/6)+'}' + (
        mod === 0 ? ''
      : mod === 1 ? trail2
      :             trail4
      )
  )+(suffix||'')+'$')
}















