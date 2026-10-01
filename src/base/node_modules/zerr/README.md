# ZErr

Custom JS error creator that subclasses `Error`, sets `.name` `.stack` and `.message`, and provides simple interpolation to construct error messages.

```js
var zerr = require('zerr')

// first param: error name
// second param: string template for error messages (substitutes '%' with args in constructor)
var BadParam = zerr('BadParam', '% must be a %')

// using the created error:
try { throw new BadParam('foo', 'string') }
catch (e) {
  console.log(e.name) // => 'BadParamError'
  console.log(e.message) // => 'foo must be a string'
  console.log(e.stack) // => 'BadParamError: foo must be a string\nat repl:1:13...'
  console.log(e instanceof Error) // => true
  console.log(e instanceof BadParam) // => true
}

// the `new` is optional
throw BadParam('foo', 'string')

// if no string template is given, zerr will just use the constructor's param as the message
var BadParam = zerr('BadParam')
try { throw new BadParam('foo is bad') }
catch (e) {
  console.log(e.message) // => 'foo is bad'
}

// if you pass an error as the first param to the constructor, zerr will add its stack to the stack history
// (taken from https://github.com/dominictarr/explain-error)
try { throw new BadParam(new BadParam('earlier foo was bad'), 'foo is bad') }
catch (e) {
  console.log(e.stack) /* =>
  BadPararmError: foo is bad
      at repl:1:7
    BadPararmError: earlier foo was bad
      at repl:1:15
  */
}
```