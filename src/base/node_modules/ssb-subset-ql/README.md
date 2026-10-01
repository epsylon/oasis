<!--
SPDX-FileCopyrightText: 2021 Andre 'Staltz' Medeiros

SPDX-License-Identifier: CC0-1.0
-->

# ssb-subset-ql

Utility library to parse, validate, and compare ssb-ql-0 and ssb-ql-1 queries
needed for [subset replication and index feeds](https://github.com/ssb-ngi-pointer/ssb-subset-replication-spec)
in SSB.

## Installation

**Prerequisites:**

- Requires **Node.js 10** or higher

```
npm install --save ssb-subset-ql
```

To use this library, import its utilities like this:

```js
const { QL0 } = require('ssb-subset-ql')
```

## API

### QL0

#### `validate(query)`

Takes a `query` (string or object) and checks that it satisfies the ssb-ql-0
rules. If something is wrong, it throws an error. Otherwise it returns
undefined.

#### `parse(query)`

Takes a ssb-ql-0 `query` (an object or JSON as a string), validates it, and
parses it (if necessary) to return a query object. If anything went wrong during
validation, returns null.

#### `toOperator(query[, dedicated])`

Takes a ssb-ql-0 `query` (an object or JSON as a string), validates it, parses
it (if necessary) and then converts the query to an [ssb-db2](https://github.com/ssb-ngi-pointer/ssb-db2)
operator which can be inserted inside an ssb-db2 `where()`. If anything went
wrong during validation, it throws an error.

A second optional argument, `dedicated`, is a boolean that indicates whether the
underlying database should use dedicated index files for `type` and `author`. By
default, this is `false`.

#### `stringify(query)`

Takes a ssb-ql-0 `query` (an object), validates it, and stringifies it into a
canonical (stable, unaffected by how the object was created) JSON string.
Returns the JSON string. If anything went wrong during validation, it throws an
error.

#### `isEquals(query1, query2)`

Takes two ssb-ql-0 query objects, parses both of them, and checks that they are
equivalent.

### QL1

#### `validate(query)`

Takes a `query` (string or object) and checks that it satisfies the ssb-ql-1
rules. If something is wrong, it throws an error. Otherwise it returns
undefined.

#### `parse(query)`

Takes a ssb-ql-1 `query` (an object or JSON as a string), and parses it (if
necessary) to return a query object. If anything went wrong during validation,
returns null.

#### `toOperator(query[, dedicated])`

Takes a ssb-ql-1 `query` (an object), and converts it to an [ssb-db2](https://github.com/ssb-ngi-pointer/ssb-db2)
operator which can be inserted inside an ssb-db2 `where()`.

A second optional argument, `dedicated`, is a boolean indicating whether the
underlying database should use dedicated index files. By default, it's `false`.

#### `stringify(query)`

Takes a ssb-ql-1 `query` (an object), and stringifies it as a JSON string.

#### ~~`isEquals(query1, query2)`~~

Not yet supported. Will always throw an error if you use it.

## License

LGPL-3.0
