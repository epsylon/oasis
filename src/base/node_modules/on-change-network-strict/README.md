# on-change-network-strict

**A fork of `on-change-network` that "uses strict" JS.**

Call a listener whenever the network interface changes.
I.e. detect when the local user has changed to another wifi network.

## example

``` js
require('on-change-network-strict')(function () {
  console.log('wifi changed')
})
```

## License

MIT
