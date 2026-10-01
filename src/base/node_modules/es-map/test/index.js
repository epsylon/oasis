'use strict';

var Map = require('../');
var test = require('tape');
var runTests = require('./tests');

test('as a function', function (t) {
	runTests(Map, t);

	t.end();
});
