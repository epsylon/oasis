# BLAKE2s

A port of Dmitry Chestnykh's typescript blake2s implementation to node.js style javascript

[![build status](https://secure.travis-ci.org/dominictarr/blake2s.png)](http://travis-ci.org/dominictarr/blake2s)

[![testling badge](https://ci.testling.com/dominictarr/blake2s.png)](https://ci.testling.com/dominictarr/blake2s)


I've left the blake2s.ts script in the source, and edited the output javascript.
I did try to bring the typescript to node.js style, using `Buffer`, `update(buffer, enc)`
but that made a lot of type errors, and in my opinion, type errors are not
really the hardest part of programming. I will be happy if someone can show
me how to correct the typescript implementation to node.js style.

## Usage

``` js
        // constructor accepts digest length in bytes
var h = new BLAKE2s(32)
        //pass encoding into update, like in node's crypto module
h.update("string or array of bytes", 'utf8')
        //request the digest encoding
h.digest('hex')

// Keyed:
var h = new BLAKE2s(32, "some key")
...
```

## Demo

[http://www.dchest.org/blake2s-js/](http://www.dchest.org/blake2s-js/)

## License

PUBLIC DOMAIN DEDICATION

Written in 2012 by Dmitry Chestnykh.

To the extent possible under law, the author have dedicated all copyright
and related and neighboring rights to this software to the public domain
worldwide. This software is distributed without any warranty.
http://creativecommons.org/publicdomain/zero/1.0/
