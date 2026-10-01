'use strict';

var $Set = require('es-set/polyfill')();
var $Map = require('es-map/polyfill')();
var forEach = require('for-each');
var v = require('es-value-fixtures');
var debug = require('object-inspect');
var getIterator = require('es-get-iterator');

var setEqual = function compareSetLikes(t, actual, expected, msg) {
	t.test('setlikes: ' + msg, function (st) {
		st.ok(actual instanceof expected.constructor, 'actual is an instance of the expected constructor');
		st.ok(expected instanceof actual.constructor, 'expected is an instance of the actual constructor');
		st.equal(actual.size, expected.size, 'they have the same size');

		if (actual.forEach) {
			actual.forEach(function (x) {
				st.ok(expected.has(x), debug(x) + ' (in actual) is in the expected set');
			});
		}

		if (expected.forEach) {
			expected.forEach(function (x) {
				st.ok(actual.has(x), debug(x) + ' (in expected) is in the actual set');
			});
		}

		st.end();
	});
};

module.exports = function (difference, t) {
	t.test('throws on non-set receivers', function (st) {
		forEach(v.primitives.concat(v.objects, [1, 2], new $Map(), $Set.prototype), function (nonSet) {
			st['throws'](
				function () { difference(nonSet, {}); },
				TypeError,
				debug(nonSet) + ' is not a Set'
			);
		});

		st.end();
	});

	t.test('non-Setlike `other`', function (st) {
		var set = new $Set([1, 2]);

		forEach(v.primitives, function (primitive) {
			st['throws'](
				function () { difference(set, primitive); },
				TypeError,
				debug(primitive) + ' is not a Set-like'
			);
		});

		st.test('unable to get a Set Record', function (s2t) {
			forEach(v.objects, function (nonSetlike) {
				s2t['throws'](
					function () { difference(set, nonSetlike); },
					TypeError,
					debug(nonSetlike) + ' is an Object, but is not Set-like'
				);
			});

			var nanSizedSetlike = {
				has: function () {},
				keys: function () {},
				size: NaN
			};
			s2t['throws'](
				function () { difference(set, nanSizedSetlike); },
				TypeError,
				debug(nanSizedSetlike) + ' has a NaN `.size`'
			);

			forEach(v.nonFunctions, function (nonFunction) {
				var badHas = {
					has: nonFunction,
					keys: function () {},
					size: 0
				};
				var badKeys = {
					has: function () {},
					keys: nonFunction,
					size: 0
				};

				s2t['throws'](
					function () { difference(set, badHas); },
					TypeError,
					debug(badHas) + ' has a non-callable `.has`'
				);
				s2t['throws'](
					function () { difference(set, badKeys); },
					TypeError,
					debug(badKeys) + ' has a non-callable `.keys`'
				);
			});

			s2t.end();
		});

		st.test('misbehaving `.keys`', function (s2t) {
			var setlikeThrows = {
				has: function () {},
				keys: function () { throw new SyntaxError('keys error'); },
				size: 0
			};

			s2t['throws'](
				function () { difference(set, setlikeThrows); },
				SyntaxError,
				debug(setlikeThrows) + ' throws when `.keys` is called, on purpose'
			);

			forEach(v.primitives, function (primitive) {
				var primitiveIter = {
					has: function () {},
					keys: function () { return primitive; },
					size: 0
				};
				s2t['throws'](
					function () { difference(set, primitiveIter); },
					TypeError,
					'setlike `.keys` returning ' + debug(primitive) + ' throws'
				);
			});

			forEach(v.nonFunctions, function (nonFunction) {
				var badIter = {
					has: function () {},
					keys: function () { return { next: nonFunction }; },
					size: 0
				};
				s2t['throws'](
					function () { difference(set, badIter); },
					TypeError,
					debug(badIter) + ' has a non-callable `.next`'
				);
			});

			s2t.end();
		});

		st.end();
	});

	t.test('differences', function (st) {
		var set1 = new $Set([1, 2, 3, 4, 5, 6]);
		var set2 = new $Set([4, 5, 6]);
		var result = difference(set1, set2);

		st.ok(result instanceof $Set, 'returns a Set');
		setEqual(
			st,
			result,
			new $Set([1, 2, 3]),
			'returns the receiver Set without overlapping elements from the other Set'
		);

		var set3 = new $Set([1, 2, 3]);
		var set4 = new $Set([4, 5, 6]);
		var result2 = difference(set3, set4);

		st.ok(result2 instanceof $Set, 'returns a Set');
		setEqual(
			st,
			result2,
			new $Set([1, 2, 3]),
			'returns the receiver Set since there are no overlapping elements in the other Set'
		);

		var setLikeIter = {
			has: function (x) { return x >= 0 && x % 2 === 0 && x < 10; },
			keys: function () {
				var i = 0;
				return {
					next: function fakeNext() {
						try {
							return {
								done: i >= 10,
								value: i
							};
						} finally {
							i += 2;
						}
					}
				};
			},
			size: 4
		};

		var result3 = difference(set1, setLikeIter);
		st.ok(result3 instanceof $Set, 'returns a Set when `other` is a Set-like with a manual iterator');
		setEqual(
			st,
			result3,
			new $Set([1, 3, 5]),
			'returns the difference of the two sets with a manual iterator'
		);

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/difference/add-not-called', function (st) {
		var s1 = new $Set([1, 2]);
		var s2 = new $Set([2, 3]);
		var expected = new $Set([1]);

		var getCalls = st.capture($Set.prototype, 'add');

		var combined = difference(s1, s2);

		st.deepEqual(combined, expected);
		st.ok(combined instanceof $Set, 'returns a Set');
		st.deepEqual(getCalls(), [], 'add is never called');

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/difference/allows-set-like-object', function (st) {
		var s1 = new Set([1, 2]);
		var s2 = {
			size: 2,
			has: function (x) {
				if (x === 1) { return false; }
				if (x === 2) { return true; }
				throw new EvalError('Set.prototype.difference should only call its argument’s has method with contents of this');
			},
			keys: function () {
				throw new EvalError('Set.prototype.difference should not call its argument’s keys iterator when this.size ≤ arg.size');
			}
		};
		var expected = new $Set([1]);
		var combined = difference(s1, s2);

		st.deepEqual(combined, expected);
		st.ok(combined instanceof $Set, 'returns a Set');

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/difference/combines-Map', function (st) {
		var s1 = new $Set([1, 2]);
		var m1 = new $Map([
			[2, 'two'],
			[3, 'three']
		]);
		var expected = new $Set([1]);
		var combined = difference(s1, m1);

		st.deepEqual(combined, expected);
		st.ok(combined instanceof $Set, 'returns a Set');

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/difference/combines-empty-sets', function (st) {
		var s1 = new $Set([]);
		var s2 = new $Set([1, 2]);
		var expected = new $Set([]);
		var combined = difference(s1, s2);

		st.ok(combined instanceof $Set, 'returns a Set');
		st.deepEqual(combined, expected);

		var s3 = new $Set([1, 2]);
		var s4 = new $Set([]);
		expected = new $Set([1, 2]);
		combined = difference(s3, s4);

		st.ok(combined instanceof $Set, 'returns a Set');
		st.deepEqual(combined, expected);

		var s5 = new $Set([]);
		var s6 = new $Set([]);
		expected = new $Set([]);
		combined = difference(s5, s6);
		st.ok(combined instanceof $Set, 'returns a Set');
		st.deepEqual(combined, expected);

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/difference/combines-itself', function (st) {
		var s1 = new $Set([1, 2]);
		var expected = new $Set([]);
		var combined = difference(s1, s1);

		st.ok(combined instanceof $Set, 'returns a Set');
		st.deepEqual(combined, expected);
		st.notEqual(combined, s1, 'The returned object is a new object');

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/difference/combines-same-sets', function (st) {
		var s1 = new $Set([1, 2]);
		var s2 = new $Set([1, 2]);
		var expected = new $Set([]);
		var combined = difference(s1, s2);

		st.ok(combined instanceof $Set, 'returns a Set');
		st.deepEqual(combined, expected);
		st.notEqual(combined, s1, 'The returned object is a new object');
		st.notEqual(combined, s2, 'The returned object is a new object');

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/difference/converts-negative-zero', function (st) {
		var setlikeWithMinusZero = {
			size: 1,
			has: function () {
				// impossible to avoid this call since we do not have internal set data access
				throw new EvalError('Set.prototype.difference should not call its argument’s has method when this.size > arg.size');
			},
			keys: function () {
				return getIterator([-0]);
			}
		};

		var s1 = new $Set([+0, 1]);
		var expected = new $Set([1]);
		var combined = difference(s1, setlikeWithMinusZero);

		st.ok(combined instanceof $Set, 'returns a Set');
		st.deepEqual(combined, expected);

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/difference/has-is-callable', function (st) {
		var s1 = new $Set([1, 2]);
		var s2 = {
			size: 2,
			has: undefined,
			keys: function () {
				return getIterator([2, 3]);
			}
		};

		st['throws'](
			function () { difference(s1, s2); },
			TypeError,
			'GetSetRecord throws an error when has is undefined'
		);

		s2.has = {};
		st['throws'](
			function () { difference(s1, s2); },
			TypeError,
			'GetSetRecord throws an error when has is not callable'
		);

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/difference/keys-is-callable', function (st) {
		var s1 = new $Set([1, 2]);
		var s2 = {
			size: 2,
			has: function () {},
			keys: undefined
		};

		st['throws'](
			function () { difference(s1, s2); },
			TypeError,
			'GetSetRecord throws an error when keys is undefined'
		);

		s2.keys = {};
		st['throws'](
			function () { difference(s1, s2); },
			TypeError,
			'GetSetRecord throws an error when keys is not callable'
		);

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/difference/result-order', function (st) {
		var s1 = new $Set([1, 2, 3, 4]);
		var s2 = new $Set([6, 5, 3, 2]);

		st.deepEqual(
			difference(s1, s2),
			new $Set([1, 4])
		);

		var s3 = new $Set([6, 5, 3, 2]);
		var s4 = new $Set([1, 2, 3, 4]);

		st.deepEqual(
			difference(s3, s4),
			new $Set([6, 5])
		);

		var s5 = new $Set([1, 2, 3, 4]);
		var s6 = new $Set([7, 6, 5, 3, 2]);

		st.deepEqual(
			difference(s5, s6),
			new $Set([1, 4])
		);

		var s7 = new $Set([7, 6, 5, 3, 2]);
		var s8 = new $Set([1, 2, 3, 4]);

		st.deepEqual(
			difference(s7, s8),
			new $Set([7, 6, 5])
		);

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/difference/set-like-array', function (st) {
		var s1 = new $Set([1, 2]);
		var s2 = [5, 6];
		s2.size = 3;
		s2.has = function (x) {
			if (x === 1) { return false; }
			if (x === 2) { return true; }
			throw new EvalError('Set.prototype.difference should only call its argument’s has method with contents of this');
		};
		s2.keys = function () {
			throw new EvalError('Set.prototype.difference should not call its argument’s keys iterator when this.size ≤ arg.size');
		};

		var expected = new $Set([1]);
		var combined = difference(s1, s2);

		st.ok(combined instanceof $Set, 'returns a Set');
		st.deepEqual(combined, expected);

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/difference/size-is-a-number', function (st) {
		var s1 = new $Set([1, 2]);
		var s2 = {
			size: undefined,
			has: function () {},
			keys: function () {
				return getIterator([2, 3]);
			}
		};
		st['throws'](
			function () { difference(s1, s2); },
			TypeError,
			'GetSetRecord throws an error when size is undefined'
		);

		s2.size = NaN;
		st['throws'](
			function () { difference(s1, s2); },
			TypeError,
			'GetSetRecord throws an error when size is NaN'
		);

		var coercionCalls = 0;
		s2.size = {
			valueOf: function () {
				coercionCalls += 1;
				return NaN;
			}
		};
		st['throws'](
			function () { difference(s1, s2); },
			TypeError,
			'GetSetRecord throws an error when size coerces to NaN'
		);
		st.equal(coercionCalls, 1, 'GetSetRecord coerces size');

		if (v.bigints.length > 0) {
			s2.size = BigInt(0);
			st['throws'](
				function () { difference(s1, s2); },
				TypeError,
				'GetSetRecord throws an error when size is a BigInt'
			);
		}

		s2.size = 'string';
		st['throws'](
			function () { difference(s1, s2); },
			TypeError,
			'GetSetRecord throws an error when size is a non-numeric string'
		);

		st.end();
	});

	t.test('works with a set-like of certain sizes', function (st) {
		var setLike = {
			size: Math.pow(2, 31),
			has: function () {},
			keys: function () {
				throw new Error('Unexpected call to |keys| method');
			}
		};

		st.doesNotThrow(
			function () { difference(new $Set([1]), setLike); },
			'2**31: `keys` function is not invoked'
		);

		setLike.size = Infinity;
		st.doesNotThrow(
			function () { difference(new $Set([1]), setLike); },
			'∞: `keys` function is not invoked'
		);

		st.end();
	});

	return t.comment('tests completed');
};
