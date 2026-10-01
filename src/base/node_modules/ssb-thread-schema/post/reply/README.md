A 'reply' is message which is part of a thread responding to a root message.
Specifically not a nested reply nor a fork

NOTE
- the `root` property is pretty much canonical at this point
- the `branch` property is very rarely every called directly, it's mainly used (as far as I know) by `ssb-sort`, but no by name as that just walks the whole content looking for cypherlinks.
  - this schema does not require a `branch` field, though it is really important for causal sorting
  - not requiring it means this will not break
