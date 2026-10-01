# secret-stack-decorators

_TypeScript or Babel decorators that make it possible to write [secret-stack](https://github.com/ssbc/secret-stack) plugins in OOP style_

## Usage

```
npm install --save secret-stack-decorators
```

**Only supports secret-stack >=6.2.0**

In your TypeScript or Babel codebase, **import `plugin` and `muxrpc`**:

```typescript
import {plugin, muxrpc} from 'secret-stack-decorators';

@plugin('1.0.0' /* version */)
class myplugin /* name */ {
  constructor(ssb, config) {
    /* init */
  }

  // This method will not show in the resulting plugin object
  privateMethod(x, y) {
    // ...
  }

  @muxrpc('sync') /* manifest: `shout: 'sync'` */
  shout = messsage => {
    // ...
  }

  @muxrpc('duplex', {anonymous: 'allow'}) /* manifest and permissions */
  communicate() {
    // ...
  }
}

module.exports = myplugin;
```

## Example

**Before:**

```js
var plugin = {
  name: 'ebt',
  version: '1.0.0',
  manifest: {
    replicate: 'duplex',
    request: 'sync',
    block: 'sync',
    peerStatus: 'sync'
  },
  permissions: {
    anonymous: {allow: ['replicate']}
  },
  init: function (sbot, config) {
    // INITIALIZATION CODE

    return {
      replicate: function (opts) { /* ... */ },
      request: function (id, other) { /* ... */ },
      block: function (id) { /* ... */ },
      peerStatus: function (id) { /* ... */ },
    }
  }
}
```

**After:**

```typescript
@plugin('1.0.0')
class ebt {
  constructor(sbot, config) {
    // INITIALIZATION CODE
  }

  @muxrpc('duplex', {anonymous: 'allow'})
  replicate(opts) { /* ... */ }

  @muxrpc('sync')
  request(id, other) { /* ... */ }

  @muxrpc('sync')
  block(id) { /* ... */ }

  @muxrpc('sync')
  peerStatus(id) { /* ... */ }
}
```

## API

### `@plugin(version: string)`

This decorator should be placed on a class that is meant to be a secret-stack plugin. The `version` argument should be a string expressing a SemVer version.

Important: the name of the class is used as a string to register the plugin. `class foo` will be transformed to `api.foo`. This is why the class's name is usually lowercase.

### `@muxrpc(manifestType: string, permission?: object)`

The `manifestType` argument is a string, should have the value `'sync'` or `'async'` or `'source'` or `'sink'` or `'duplex'`. The optional `permission` object should have the shape `{role: 'allow' | 'deny'}`, i.e., the object's keys are names of roles (such as `anonymous` or `master`, etc), and the value can be either the string `'allow'` or the string `'deny'`.

## License

MIT
