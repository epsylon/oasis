# separator-escape

split a string by a separator, with an escape.

you can choose both the separate and escape.

## example

``` js
//separate by , and escape by !
var sep = require('separator-escape')(',','!')
sep.stringify(['a','b','c'])
// => "a,b,c"
// escape separator
sep.stringify(['a','x,y','c'])
// => a,x!,y,b

//escape escape
sep.stringify(['a','x!y','c'])
// => a,x!!y,b

//escape escape escape separator
sep.stringify(['a','x!,y','c'])
// => a,x!!!,y,b

```

## License

MIT







