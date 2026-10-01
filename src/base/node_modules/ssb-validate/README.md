# ssb-validate

validate ssb messages, completely functionally.

this module seeks to replace ssb-feed, and contain the logic to validate ssb messages,
but this is implemented functionally, with serializable state.
this means, that the states generated when the reference implementation runs
can be extracted and used as test cases in other implementations.

## example

``` js
var validate = require('ssb-validate')
var hmac_key = null
var state = validate.initial()

var msgs = [...] //some source of messages

msgs.forEach(function (msg) {
  try {
    state = validate.append(state, hmac_key, msg)
  } catch (err) {
    console.log(err)
  }
})

writeToDatabase(state.queue, function (err) {
  if(err) throw err

  //these messages are fully accepted now, can remove them from state.
  state.queue = []
})

//state should be saved in some way it can be reconstructed
//so in the future it can be appended to starting from scratch.
```

## architecture

This module describes the validation logic for ssb messages, using a reduce style
pattern - `state = method(state, argument)` . To make it easy to test, the various
subcomponents are also exported, but the main method is `state = append(state, hmac_key, msg)`

## state

this module uses a data structure to represent the state of validation.
The structure is as follows:

``` js
{
  validated: integer,
  queued: integer,
  queue: [kvt...], //messages which have been validated and may now be written to database
  feeds: { //validation state of all feeds
    <feed_id>: {
      id: <msgId: key of last message>,
      timestamp: <timestamp of last message>,
      sequence: integer //
      queue: [kvt...]
    },...
  }
}
```
note: `kvt` here represents a msg with key calculated and a recieved timestamp assigned
`{key: hash(msg), value: msg, timestamp: timestamp()}`

## api

### state = validate.append(state, hmac_key, msg)

Append and validate a message to state. If the message is valid, it will appear at the
end of `state.queue` it may now be written to the database.

`hmac_key` is optional - if provided, messages are hmac'd with it before signing,
which can be used to create a separate network in which messages cannot be copied
to the main network. Messages compatible with the main network have `hmac_key = null`

### msg = validate.create(feed_state, keys, hmac_key, content, timestamp)

Create a message that is valid given the current state of the feed (such that it may be passed to 
`append(state, hmac_key, msg)`. `keys` is the signing key, as provided by `ssbKeys.generate()` or `ssbKeys.createOrLoadSync(filename)`

### msg_id = validate.id(msg)

Calculate the message id for a given message.

## shortcuts for js mode api

In investigating the possiblity of an entirely web based scuttlebutt,
verifying all signatures in javascript had added a lot of overhead.
(although now this is not such a problem because of crypto in fast-enough webassembly)

The following methods queues some number of messages and then validates the last signature.
It is possible that a specially constructed messages with some invalid signatures, followed
by messages with valid signatures could get accepted, but the writer doesn't have any way
to know _which_ messages will be accepted, and a 3rd party could not insert invalid messages
into another feed, because the signature that is eventually checked wouldn't point to the right
previous hash.

However, you can probably consider these methods not necessary. And they could be removed.


```
var validate = require('ssb-validate')
var hmac_key = null
var state = validate.initial()

var msgs = [...] //some source of messages

//queue messages
msgs.forEach(function (msg) {
  state = validate.queue(state, msg)
  if(state.error) console.error(state.error)
})

//validate messages

for(var feed_id in state.feeds)
  state = validate.validate(state, hmac_key, feed_id)

writeToDatabase(state.queue, function (err) {
  if(err) throw err

  //these messages are fully accepted now, can remove them from state.
  state.queue = []
})

//state should be saved in some way it can be reconstructed
//so in the future it can be appended to starting from scratch.
```

### state = validate.queue(state, msg)

Call checkInvalidCheap and if valid, append to the feed's incoming queue.
(`state.feeds[id(msg)].queue`)

The message is checked to have an incrementing `sequence`, and correct `previous` hash,
but signature is not checked. (the intention here is for when using javascript crypto,
checking every signature is expensive) however, this is not a big problem with wasm crypto.

### state = validate.validate(state, feed_id)

Check the signature of the last message in feed_id's incoming queue,
and if it is valid, append all messages in that queue.
As optimization/shortcut for javascript crypto.

### state = validate.appendOOO(state, hmac_key, msg)

This method works the same as append except that it does not check the
previous link of the message. This allows one to validate an out of
order message or a row of messages not starting from the beginning.

## internal api

The following methods are exposed for testing, but are unlikely to be used directly.

### state = validate.appendNew(state,hmac_key, keys, content, timestamp)

Wrapper around create and append. used in testing.

### state = validate.appendKVT (state, hmac_key, kvt)

Internal details of append - recently this was refactored to avoid calculating
the message id twice.

### isInvalid = validate.checkInvalidCheap (state, msg)

Perform cheap checks for message validity, but not the signature.
return false if the message is valid, and an error (with message) if it's invalid.

### isInvalid = validate.checkInvalid (state, hmac_key, msg)

Check signature, returns false if message is valid. returns an error (with message)
if the message is invalid.

## License

MIT






