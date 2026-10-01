'use strict';

var Set = require('../');
var test = require('tape');
var runTests = require('./tests');

test('as a function', function (t) {
	runTests(Set, t);

	t.end();
});
