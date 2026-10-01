# atomic-file

store data in a file, but gaurantee there is never a partial write.

This uses a simple trick to make writes to the file system atomic:
first write the file to `{filename}~`, then `mv {filename}~ {filename}`
although it's possible a program to crash while it's part way through writing a file,
the rename operation (`mv`) can only either succeed or fail.

``` js
var AtomicFile = require('atomic-file') //default, json encoding
// var AtomicFile = require('atomic-file/buffer') //binary

var af = AtomicFile(filename)
//get the current contents
af.get(function (err, value) {
  //write a new value
  af.set(value, function (err) {

  })
})
```

note, get stores the read value in memory, so subsequent
calls to get will be instant. Successful writes will update the value.

## af = AtomicFile(filename, suffix='~', codec=json)

create a new atomic-file instance

### af.get(cb(err, value))

read the current value. will callback synchronously if the value
is already in memory.

### af.set(value, cb)

write `value` to the file atomically. will callback when it's
definitely on disk.

### af.destroy(cb)

delete the underlying file. callback when definitely deleted.

## License

MIT


