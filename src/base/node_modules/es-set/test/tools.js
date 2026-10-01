'use strict';

var test = require('tape');
var keys = require('object-keys');

var $Set = require('../polyfill')();

var tools = require('../tools');

test('tools', function (t) {
	t.deepEqual(keys(tools), ['add', 'delete', 'forEach', 'has', 'size'], 'should have expected functions');

	var set = new $Set([1, 2]);

	t.ok(tools.has(set, 2), 'has should return true for existing key');
	t.notOk(tools.has(set, 3), 'has should return false for non-existing key');
	t.equal(tools.size(set), 2, 'size should return the expected count');

	tools.add(set, 3);
	t.ok(tools.has(set, 3), 'has should return true for added key');
	t.equal(tools.size(set), 3, 'size should return the expected count');

	tools['delete'](set, 2);
	t.notOk(tools.has(set, 2), 'has should return false for deleted key');

	t.equal(tools.size(set), 2, 'size should return the expected count');

	t.test('forEach', function (st) {
		st.plan(3 * 2);
		var expecteds = [1, 3];

		tools.forEach(set, function (value, key, collection) {
			st.equal(collection, set, 'forEach should pass the collection as the third argument');
			st.equal(value, key, 'forEach should pass the same value as both arguments');
			var expectedValue = expecteds.shift();
			st.equal(value, expectedValue, 'forEach should produce the expected value: ' + expectedValue);
		});

		st.end();
	});

	t.end();
});
