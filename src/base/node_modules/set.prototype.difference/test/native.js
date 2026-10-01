'use strict';

var test = require('tape');

var runTests = require('./builtin');

test('native', function (t) {
	runTests(t);

	t.end();
});
