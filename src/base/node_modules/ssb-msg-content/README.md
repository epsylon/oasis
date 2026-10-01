# ssb-msg-content

Take an ssb message object and grab just the content

## Usage

```js
var getContent = require('ssb-msg-content')

var content = getContent(msg)
```
where `msg` could be of form:
- `{ key, value }` - often provided by feed streams
- `{ author, content, timestamp }` - the raw value as provided by e.g. `sbot.get`
- `{ type, ... }` - you are already looking at the content!

outputs

```js
{
  type: String,
  ...otherProps
}
```

