[![Build Status](https://travis-ci.org/smelukov/nano-equal.svg?branch=master)](https://travis-ci.org/smelukov/nano-equal)
[![npm version](https://badge.fury.io/js/nano-equal.svg)](https://badge.fury.io/js/nano-equal)

## NanoEqual
Ultra fast and compact implementation of deep equal without any production dependencies.

### Usage
```shell
npm install nano-equal --save
```

```javascript
var nanoEqual = require('nano-equal');

if (nanoEqual(a, b)) {
    //....
}
```

### What is that?
This is a compact and fast implementation of deep equal.

Deep equal is an algorithm that comparing two values. If the values are a scalar (string, bool, number), then comparing will be performed thru === operator.

If the values are an object (object, array, function), then comparing will be performed recursively.

Following of the object properties is not important:
```javascript
var a = {prop1: 'some', prop2: 'some'};
var b = {prop2: 'some', prop1: 'some'};

nanoEqual(a, b); // true
```

But following of the array elements is important:
```javascript
var a = [1, 2, 3];
var b = [3, 2, 1];

nanoEqual(a, b); // false
```

> NaN values and some types of recursion are supported.

### Benchmark

The list below is showing the performance comparison nano-equal with other libs:

```
nanoEqual: 1362.813ms
underscore: 3791.308ms
lodash: 7830.107ms
nodejs: 8272.956ms
```
