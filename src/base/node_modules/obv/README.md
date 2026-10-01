# obv

Represents a value changing in time.

Sometimes you have a sequence of values over time,
usually we use streams for this. However, in some cases,
the latest value, or the next value matters more
than the entire history of values.

For example, if you are drawing the mouse pointer,
you just need the current position, not the historical positions.

An observable is a simple way to represent these instantaniously changing values.

## Obv() => observable

returns an observable instance.

## observable(listener=function, immediate=boolean) => remove

register `listener` with the observable. `immediate` is true by default.
`listener` is called with the current value (if one has been set), set to false to disable.

A function `remove` is returned, calling this function deregisters the listener.

## observable.set(value=any)

set the current value of this observable. Any registered listeners will be called.

## observable.once(listener=function, immediate=boolean) => remove

Like the above call to `observable()` except the listener will only be triggered _once_.

This is useful for representing variables which must be set after an async operation
(say, initializing a database connection), but if the value is initalized
you can act on it immediately.

If you call `observable.once(listener, false)` that triggers at the _next_
time the value is set, which so far I have used to create live streams.

## observable.value

The current value of the observable is provided as a property.
I recommend not using null as a observable value in your program,
because it makes testing the current value awkward.

## License

MIT

