# pull-notify

Notify many listeners via pull-streams.

you could use when you might otherwise use an event emitter.
Why not just use an event emitter? EventEmitters have a weird
security contract: anyone who can listen can also emit,
and they can emit or listen to any events!

Instead, events should travel down a single channel,
and the ability to emit an event should be separated from
the ability to listen.


``` js
var Notify = require('pull-notify')

var notify = Notify()

//create a pull stream that listens on events.
//it will eventually get all events.
pull(notify.listen(), pull.drain((evt) => console.log(evt)))

notify('hello') //emit an event.

notify.end() //tell all listeners it's over.
```

listers can abort (using the normal pull-stream abort),
and that will remove them from the list.


## License

MIT
