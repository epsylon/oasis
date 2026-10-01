'use strict';

var test = require('tape');
var callBind = require('call-bind');

var implementation = require('../implementation');
var runTests = require('./tests');

var bound = callBind(implementation);

test('as a function', function (t) {
	t.test('bad Promise/this value', function (st) {
		// eslint-disable-next-line no-useless-call
		st['throws'](function () { implementation.call(undefined); }, TypeError, 'undefined is not an object');

		// eslint-disable-next-line no-useless-call
		st['throws'](function () { implementation.call(null); }, TypeError, 'null is not an object');
		st.end();
	});

	runTests(bound, t);

	t.end();
});
