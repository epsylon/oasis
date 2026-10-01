# Private-Groups Spec | v1.0.0

A specification for implementing private groups in scuttlebutt.

The fundamentals of this spec are:

1. uses _envelope_ for encryption of content
2. has group_ids which are safe to share publicly
3. adding people to the group is done with group's knowledge
4. supports disclosing of message content
    - **but this leaks info about the group** (peak at other messages / authors)

## envelope encryption in scuttlebutt

In adition to the envelope-spec, there are some scuttlebutt-specific specifications

[See spec here](./encryption/README.md)


## recipient key derivation

box1 took feedIds from the `content.recps` field and directly used these for encryption.

In envelope, we instead take "ids" from `content.recps`, and map each to a key+scheme pair `{ key, scheme }` where":
- `key` is the encryption key which will be used in a `key_slot`, and 
- `scheme` is the "key management scheme" which that key is employing

Type of id            | How `key` is derived                               | `scheme`
----------------------|----------------------------------------------------|-----------------------------------------
private group id      | [a key-store](./group/group-id/README.md)          | "envelope-large-symmetric-group"
feedId (someone else) | [diff-hellman styles](./direct-messages/README.md) | "envelope-id-based-dm-converted-ed25519"
feedId (yours)        | [locally stored key](./direct-messages/README.md)  | "envelope-symmetric-key-for-self"
P.O. Box id           | [diffie-hellman styles](./po-box/README.md)        | "envelope-id-based-pobox-curve25519"

see `key-schemes.json` for the canonical list of accepted schema labels

### recipient restrictions

We talk about `key_slots` or recipients / `recps` a little interchangeably.
Let's assume `content.recps` are mapped to `key_slots` preserving their order.

:warning: The following restrictions must be followed :

1. there are max 16 slots on a message
2. if there is a group key
    - a) there is only 1 group key
    - b) the group key is in the first key_slot
3. we disallow you from making a shared DM key with yourself

More detail:
- (1) means all implementations know to look 16 slots deep when trying to unbox the msg_key
- (2.a) provides a guarentee that infomation is not leaked across groups, in particular tangle info would leak info about group memember as these ids are not cloaked in this version
- (2.a + 2.b) means we that we only need to try group keys in the first slot. If that fails, we can try DM keys on slots 1-16. (nice and fast!)
- (3) is a tight restriction which we think will help people write better apps
    - it's a step towards forward security
    - if you want to send to self, it encourages people to mint a group, which is a better practice when moving to support multi-device identities
    - _we may relax this restriction when we have more experience_

## group management

A minimal amount of agreement to make coordination easier:
- [creating a new group](./group/init/README.md)
- [adding someone to your group](./group/add-member/README.md)


---

## TODO

describe
- how all these things might be woven together
- where state is tracked off-chain (in a key-store)


## scuttlebutt private-groups spec (v2)

Could modify this spec:
1. - same
2. - same
3. - same
4. supports privacy fiendly disclosing of message content
    - all internal cypherlinks are "cloaked"

