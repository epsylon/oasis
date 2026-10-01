# pull-thenable

> Converts a pull-stream to an object with .then(), usable also with async-await

```bash
npm install --save pull-thenable
```

## Usage

As a chain of then's:

```js
const pull = require('pull-stream')
const thenable = require('pull-thenable')

const stream = pull.values(['a','b']);
const source = thenable(stream);

source.then(x => {
  console.log(x); // 'a'
  return source;
}).then(x => {
  console.log(x); // 'b'
  return source;
}).then(x => {
  // not called
}, err => {
  console.log(err); // true
})
```

With async-await:

```js
const pull = require('pull-stream')
const thenable = require('pull-thenable')

const stream = pull.values(['a','b']);
const source = thenable(stream);

async function main() {
  while (true) {
    try {
      const x = await thenable(readable);
      console.log(x); // 'a'
                      // 'b'
    } catch (errOrEnd) {
      console.log(errOrEnd); // true
      return;
    }
  }
}

main();
```

## License
[MIT](https://tldrlegal.com/license/mit-license)
