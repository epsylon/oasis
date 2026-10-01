# ssb-invite-client

Plugin to accept pub invites on the client side. This is fork of [ssb-invite](https://github.com/ssbc/ssb-invite) which is lighter to run on clients.

## API

### `ssb.invite.accept(invite, cb)` ("async" muxrpc API)

Connects to the server encoded in the invite, claims the invite via RPC with that server, and then optionally publishes a "follow" `contact` message if the server accepted the invite code.

The `invite` is either a string or an object. If it's an object, then it should be of the shape `{invite, shouldPublish}`, where `invite` is a string, and `shouldPublish` is a boolean which dictates whether or not a `contact` message will be published after the invite is claimed. The default value for `shouldPublish` in case it's not specified is `false`.

The callback `cb` is called with an error in the 1st argument if the procedure failed, or called with `cb(null, true)` if the procedure succeeded.

## License

MIT
