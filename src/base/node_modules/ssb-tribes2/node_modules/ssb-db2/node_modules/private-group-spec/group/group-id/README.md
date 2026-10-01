# Group Id

We want to be able to mention a group without revealing info about it.
We'll also use this `group_id` in the `recps` field, and when we go to publish a message,
map that `group_id` into that groups symmetric key (`group_key`) which we then use for envelope encryption

**Properties we want**
- leaks nothing about the group _e.g. who started it, where it started_
- can be used by those who know about the group to look up the associated key

## Definition

The `group_id` is defined as the cloaked message id (see `envelope-spec/cloaked_id/README.md`)
for the `group/init` message which started the group.

## Example

```
%g/JTmMEjG4JP2aQAO0LM8tIoRtNkTq07Se6h1qwnQKb=.cloaked
```

## Using `group_id`

Because what this id is referencing is obfuscated, it's safe to use in public 
(e.g. refernece or link to it from a public post)

We also use this in the `content.recps` field of classic messages.

```js
var content = {
  //...
  recps: [
    '%g/JTmMEjG4JP2aQAO0LM8tIoRtNkTq07Se6h1qwnQKb=.cloaked', // << a cloaked group_id
    '@YjoQc7sLF/ye+QM09iPcDJdzQo3lQD6YvQIFhmNbEqg=.ed25519'
  ]
}
```


This provides a _little_ obfuscation about the group for any recipients of the message,
but primarily the primary intention is to make this the canonical (safe) reference handle for a group.
This make it less likely for programmers to be tempted to reference the root message id and copy
that to an unsafe (public) context.

### Mapping a `group_id` to a `group_key`

If we're using `group_id` in `recps`, then we need a way to map this to the key we'll use for boxing.

When you're entrusted with access to a private group, you will receive:
- the location of the initial message for that group
- the `group_key` for that group

This will allow you to derive the `group_id` for that group (using definition above).
You will need to keep an index which will allow you map `group_id` to `group_key` so that when you see
a `recps` field containing the cloaked `group_id` you'll know which shared key to include in envelope `recp_keys`


## Design Considerations

1. the parts you could identify a group uniquely by are: 
    - it's initialisation message
      - the public id of this message is knowable by all
      - the `msg_key` for this message is only know to people in the group
      - the `read_key` is known to anyone who can read the message (in group or been given permission)
    - it's private `group_key` for decrypting all messages
2. the above defintion uses the more general "cloaked message id" spec, and has the advantages:
    - it is not derived from the `group_key`, so this could later be cycled (potentially)
    - anyone who can read the init message can reference the group, without being able to read the whole group history (you only need the read capability for the group init messsage)
3. this means the `group_id` is bound to the feed
    - it can't be set / determined until a group initialisation message is published
