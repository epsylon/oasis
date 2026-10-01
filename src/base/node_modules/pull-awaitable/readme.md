# pull-awaitable

> Converts a pull-stream to an Async Iterable, usable with for-await-of

```bash
npm install --save pull-awaitable
```

**NOTE!** AsyncIterables and `for-await-of` are only supported in in Node.js v10, Firefox 57+, and Chrome 66.

## Usage

```js
const pull = require('pull-stream')
const awaitable = require('pull-awaitable')

async function main() {
  const stream = pull.values(['a', 'b']);
  for await (const x of awaitable(stream)) {
    console.log(x); // 'a'
                    // 'b'
  }
}

main()
```

## License
[MIT](https://tldrlegal.com/license/mit-license)
