'use strict';

var defineProperties = require('define-properties');
var callBind = require('call-bind');
var isEnumerable = Object.prototype.propertyIsEnumerable;
var fnNamesConfigurable = require('functions-have-names').functionsHaveConfigurableNames();
var hasStrictMode = require('has-strict-mode')();
var gOPD = require('gopd');

var runTests = require('./tests');

module.exports = function (t) {
	var name = 'difference';
	var method = Set.prototype[name];
	var fullName = 'Set.prototype.' + name;

	t.equal(method.length, 1, fullName + ' has a length of 1');
	t.test('Function name', { skip: !fnNamesConfigurable }, function (st) {
		st.equal(method.name, name, fullName + ' has name "' + name + '"');
		st.end();
	});

	t.test('enumerability', { skip: !defineProperties.supportsDescriptors }, function (et) {
		et.equal(false, isEnumerable.call(Set.prototype, name), fullName + ' is not enumerable');
		et.end();
	});

	t.test('descriptor', { skip: !defineProperties.supportsDescriptors }, function (dt) {
		dt.deepEqual(
			gOPD(Set.prototype, name),
			{
				value: method,
				writable: true,
				enumerable: false,
				configurable: true
			},
			'descriptor is as expected'
		);
		dt.end();
	});

	t.test('bad object value', { skip: !hasStrictMode }, function (st) {
		/* eslint no-useless-call: 0 */
		st['throws'](function () { return method.call(undefined); }, TypeError, 'undefined is not an object');
		st['throws'](function () { return method.call(null); }, TypeError, 'null is not an object');
		st.end();
	});

	runTests(callBind(method), t);
};
