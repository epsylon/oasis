'use strict';

require('../auto');

var test = require('tape');

var runTests = require('./tests');

test('shimmed', function (t) {
	runTests(Set, t);

	t.end();
});
