# multiserver-address

define valid [multiserver](https://github.com/ssbc/multiserver) addresses

format is:

```
name = [a-z] [a-z0-9\-]+           //name may contain lower case, digits, and -. must start with lower case.
escaped = ![!:;~]                 //special characters !:;~ may be escaped with !
data = ["-9] | [<-}] | escaped        //data field may contain any non-space character, but special characters must be escaped.
protocol = name (:data)*           //a protocol is a name and zero or more data elements
address = protocol (~ protocol )*    //an address is 1 or more protocols
multiaddress = address (; address )* //a multiaddress is 1 or more addresses!
```

## api

follows the pattern of level [codec](https://github.com/level/codec#encoding-format)

### decode (string) => data

parse a multiserver address

### encode (data) => string

reverse of `decode`

### check (string) => boolean

returns true if `string` is a valid multiserver address.
if check returns false, decode will throw if called with the same input.

## License

MIT

