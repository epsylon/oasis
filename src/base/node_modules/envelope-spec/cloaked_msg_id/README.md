# Cloaked Message Id

The envelope spec defines the "cloaked" id for any TFK _message_ as:

```js
var info = ["cloaked_msg_id", msg_id]
var cloaked_id = HKDF.Expand(read_key, encode(info), 32)
```

where:
- `msg_id` is the publicly readable id for the message which has been enveloped, in [TFK format][TFK]
- `read_key` is the "read capability" key for the enveloped message (Note this is not the `msg_key`)
- `encode` is SLP encode (see [encoding/slp.md][SLP])
- `cloaked_id` is the obfuscated `msg_id`
    - this is just 32 byte id, **not a TFK encoded id**

## Design

The intention is that anyone who has the ability to _read_ a particular message should also be able to
refernce the message safely in a public setting without revealing which message they were talking about
to those who can't read the message.

This means we have a safe "handle" which we can use in all contexts without leaking data about 
e.g. who was involved a particular private communication.


[SLP]: ../encoding/slp.md
[TFK]: ../encoding/tfk.md
