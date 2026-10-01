[![Build Status](https://travis-ci.org/dotchev/cpu-percentage.svg?branch=master)](https://travis-ci.org/dotchev/cpu-percentage)
[![npm](https://img.shields.io/npm/v/cpu-percentage.svg)](https://www.npmjs.com/package/cpu-percentage)


# cpu-percentage
Get CPU usage percentage of own process

* Uses JavaScript only and node API ([process.cpuUsage](https://nodejs.org/api/process.html#process_process_cpuusage_previousvalue)). 
* No native code.
* No external processes.

**Note:** requires node 6.1 or later.

See also [cpu-gauge](https://github.com/dotchev/cpu-gauge).

## Install

```sh
npm install -S cpu-percentage
```

## Usage

In this example we measure the CPU usage while loading a text file.

```js
var usage = require('cpu-percentage');
var fs = require('fs');

var start = usage();
fs.readFile(__filename, 'utf8', function(err, data) {
  console.log(usage(start));
});
```

The result is similar to

```
{ user: 8000, system: 4000, time: 9, percent: 133.33333333333334 }
```
