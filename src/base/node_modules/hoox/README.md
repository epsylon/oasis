# hoox

hook around a function to alter input and output.

Very simple. only 20 lines.
The example below is longer than the code.

## Example

``` js
//take an innocent function
function plus (a, b) {
  return a + b
}

//and add hooks to it.
plus = Hoox(plus)

//now you can control input and output
plus.hook(function (fn, args) {

  var value = fn.apply(null, args.map(Math.round))

  return Math.max(value, 0)
})

console.log(plus(1,3))
// 4

console.log(plus(0.8, -5))
// 0

console.log(plus(0.9, 0.9))
// 2

```

in Aspect Oriented Programming, this function would be called
an _around_ hook. I have not implemented pre, and post hooks yet,
because this is currently sufficent for my purposes.

## License

MIT
