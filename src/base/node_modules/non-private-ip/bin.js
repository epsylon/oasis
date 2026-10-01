#!/usr/bin/env node
var nonPrivate = require('.')

if(!module.parent) {
  console.log(nonPrivate.all)
}
