# continuable-para

turn multiple continuables into one in parallel.

<!--
[![travis](https://travis-ci.org/dominictarr/continuable-para.png?branch=master)
](https://travis-ci.org/dominictarr/continuable-para)

[![testling](http://ci.testling.com/dominictarr/continuable-para.png)
](http://ci.testling.com/dominictarr/continuable-para)
-->
## Example

handle an array.

``` js
para([
  continuable1,
  continuable2,
  continuable3
]) (function (err, ary) {
    console.log(ary)
    //[..,..,..]
  })
```

handle an array.

``` js
para({
  A: continuable1,
  B: continuable2,
  C: continuable3
}) (function (err, ary) {
    console.log(ary)
    //{A:.., B:..., C:...}
  })
```

trains form into array by default

``` js
para(cont1, cont2, cont3) (function (err, ary) {
  console.log(ary)
  //[....]
})
```

## License

MIT
