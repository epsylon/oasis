# pull-async

create source [`pull-stream`](https://pull-stream.github.io) from async callback (more specifically, a [_continuable_](https://github.com/Raynos/continuable))

```shell
npm install --save pull-async
```

if you want to resolve multiple values, use [`pull-defer`](https://github.com/pull-stream/pull-defer).

## example

```js
const pull = require('pull-stream')
const xhr = require('xhr')

pull(
  pullAsync((cb) => {
    xhr.get('/things', cb)
  }),
  pull.log()
)
// [{...}, {...}, {...}, ...]
```

## usage

### `pullAsync = require('pull-async')`

### `source = pullAsync(continuable)`

a [_continuable_](https://github.com/Raynos/continuable) is a function that takes in a single argument: an error-first `callback`.

returns a source stream that will resolve the continuable into a single error or value, then end the stream.

## source

```js
function pullAsync (continuable) {
  var done
  return function (abort, cb) {
    if (abort) return cb(abort)
    if (done) return cb(true)
    continuable(function (err, data) {
      done = true
      cb(err, data)
    })
  }
}
```

## license

The Apache License

Copyright &copy; 2016 Michael Williams

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
