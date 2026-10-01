# Quicktask

> Tiny microtask queue scheduler for all environments

```bash
npm install --save quicktask
```

Inspired by `yoshuawuyts/nanotask`, this function manages a queue of microtasks, but focuses on being cross environment (not just browser) and with a tiny implementation. It returns a "scheduleMicrotask" helper.

- Uses MutationObserver in the browser, supported by many browsers, including IE11.
- Uses process.nextTick in Node.js.
- Uses setTimeout otherwise.

## Usage

In JavaScript / Node.js:

```js
const quicktask = require('quicktask').default
const schedule = quicktask()

schedule(function () {
  console.log('resolved at the start of the next frame')
})
```

In TypeScript:

```typescript
import quicktask from 'quicktask';
const schedule = quicktask();

schedule(() => {
  console.log('resolved at the start of the next frame');
});
```

## API

### `const schedule = quicktask()`
Create a new Quicktask instance.

### `schedule(fn)`
Queue a function to run before the end of the current event loop.

## License
[MIT](https://tldrlegal.com/license/mit-license)
