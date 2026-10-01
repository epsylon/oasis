# is-my-ssb-valid

Build message validators for scuttlebutt using JSON schema.
Uses `is-my-json-valid` under the hood

## Example usage

```js
const Validator = require('is-my-ssb-valid')
const profileSchema = require('ssb-profile/spec/profile/schema')

const isProfile = Validator(profileSchema)
```

```js
const A = {
  //....
}

isProfile(A)
// => true | false

console.log(isProfile.errors)
// => null | [Error]

console.log(isProfile.errorsString)
// => '' | 'data.type is required'  (example)
```

```js
const pull = require('pull-stream')

pull(
  sbot.messagesByType({ type: 'profile/person', reverse: true }),
  pull.filter(isProfile),
  pull.take(50),
  pull.collect((err, profileUpdates) => {
    // ...
  })
)
```

## API

### `Validator(schema) => isValid`

where: 
- `schema` *Object* is a JSON schema
- `extras` *Array* (optional) is an Array of additional custom validation functions.
    - These will be run _after_ the schema-based validation, and are expected to either return `true` (no problem) or an `Error` (a problem) was found.
    - any error returned be added to the `isValid.errors` and `isValid.errorsString` for you (see below)

### `isValid(msg) => Boolean`

where `msg` can be any of 
  - a full message a "full message" of form `{ key, value, timestamp }`
  - just the `value` of a message (`msg.value`)
  - just the `content` field of a message (`msg.value.content`)

If the last message tested came back invalid ("false"), then you can also check out the specific errors:
  - `isValid.errors` will be populated with those errors
  - `isValid.errorsString` will be populated with a (crudely) flattened version in case you need a String
