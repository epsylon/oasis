# increment-buffer

increment a buffer (with carry)

# Example

Useful for managing nonces when using [libsodium](https://github.com/paixaop/node-sodium)
In particular, see [Notes section regarding reusing keys](
https://download.libsodium.org/doc/secret-key_cryptography/aead.html
) (scroll to bottom)

``` js
> var inc = require('increment-buffer')
> inc(new Buffer([0, 0, 0, 0]))
<Buffer 00 00 00 01>

> //with carry...
> inc(new Buffer([0, 0, 0, 255]))
<Buffer 00 00 01 00>

> //wrap around
> inc(new Buffer([255, 255, 255, 255]))
<Buffer 00 00 00 00>
```

## License

MIT
