# envelope encryption

## Example

For a "classic" feed (ed25519 keys, json encoding, a messages following this spec look like:

```js
var msg = {
  key: "ssb:message/classic/THxjTGPuXvvxnbnAV7xVuVXdhDcmoNtDDN0j3UTxcd8=",
  value: {
    previous:
      "ssb:message/classic/Tq07Se6h1qwnQKbg_JTmMEjG4JP2aQAO0LM8tIoRtNk=",
    author: "ssb:feed/classic/ye-QM09iPcDJD6YvQYjoQc7sLF_IFhmNbEqgdzQo3lQ=",
    sequence: 29048,
    timestamp: 1581539387846,
    hash: "sha256",
    content: "d01U1de...cSAajGGGz9K/CoAhdjz2DzfgonOfzArB/1q/Bg==.box2", // <<<
    signature: "kPwB4e0...6oj+yjiMhuKH5iFMS8wOQCBV3SvmlAw==.sig.ed25519",
  },
};
```

Note the `msg.value.content` is of form `<base64>.box2`

See the [envelope-spec](https://github.com/ssbc/envelope-spec) for how to derive this ciphertext, noting:

- `feed_id` is a binary encoding of `msg.value.author` (see [BFE])
- `prev_msg_id` is a binary encoding of `msg.value.previous` (see [BFE])
  - if `previous` is `null`, encode the key part of `prev_msg_id` as a zero-filled buffer of the same length you'd normally have (for that type/format combo)
- the envelope-spec returns the ciphertext as a Buffer, while in this layers we:
  - encode that as a base64 encoded string
  - suffix it with `.box2` as a clear signal for unboxers

Before encryption the content of this message looked like:

```js
var content = {
  type: "announcment",
  text: "I'm having a pool party, y'all should come over Saturday!",
  recps: [
    "ssb:identity/group/g_JTmMEjG4JP2aQAO0LM8tIoRtNkTq07Se6h1qwnQKb=.cloaked", // a group_id
    "ssb:feed/classic/YjoQc7sLF_ye-QM09iPcDJdzQo3lQD6YvQIFhmNbEqg=", // a feed_id
  ],
};
```

After boxing this becomes:

```js
var ciphertext = "d01U1depQ...CoAhdjz2DzfgonOfzArB/1q/Bg==.box2";
```

Reminder: boxing takes into account further context than just the content (`feed_id` + `prev_msg_id`)

## Vectors

Scenarios:

- vector1: unboxing a message from a person you're in some groups with
- vector2: unboxing a message from a person you're in some groups with (previous: null)
- vector3: unboxing a direct message
- vector4: creating a boxed content to a group + individual

[bfe]: https://github.com/ssb-ngi-pointer/ssb-bfe-spec
