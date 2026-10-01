'use strict';

var $Set = require('es-set/polyfill')();
var forEach = require('for-each');
var v = require('es-value-fixtures');
var debug = require('object-inspect');
var hasPropertyDescriptors = require('has-property-descriptors')();
var $Map = require('es-map/polyfill')();
var getIterator = require('es-get-iterator');

module.exports = function (isSubsetOf, t) {
	t.test('throws on non-set receivers', function (st) {
		forEach(v.primitives.concat(v.objects, [], new $Map()), function (nonSet) {
			st['throws'](
				function () { isSubsetOf(nonSet, {}); },
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
				function () { isSubsetOf(set, primitive); },
				TypeError,
				debug(primitive) + ' is not a Set-like'
			);
		});

		st.test('unable to get a Set Record', function (s2t) {
			forEach(v.objects, function (nonSetlike) {
				s2t['throws'](
					function () { isSubsetOf(set, nonSetlike); },
					TypeError,
					debug(nonSetlike) + ' is an Object, but is not Set-like'
				);
			});

			forEach([NaN, 'NaN'], function (nonNumber) {
				var nanSizedSetlike = {
					has: function () {},
					keys: function () {},
					size: nonNumber
				};
				s2t['throws'](
					function () { isSubsetOf(set, nanSizedSetlike); },
					TypeError,
					debug(nanSizedSetlike) + ' has a NaN `.size`'
				);
			});

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
					function () { isSubsetOf(set, badHas); },
					TypeError,
					debug(badHas) + ' has a non-callable `.has`'
				);
				s2t['throws'](
					function () { isSubsetOf(set, badKeys); },
					TypeError,
					debug(badKeys) + ' has a non-callable `.keys`'
				);
			});

			s2t.end();
		});

		st.end();
	});

	t.test('test262: setlike with equal size', function (st) {
		var setLike = {
			arr: [42, 44, 45],
			size: 3,
			keys: function () {
				return getIterator(this.arr);
			},
			has: function (key) {
				return this.arr.indexOf(key) !== -1;
			}
		};

		var firstSet = new $Set([42, 43, 45]);

		st.equal(isSubsetOf(firstSet, setLike), false);

		st.end();
	});

	t.test('test262: set method receiver is cleared', { skip: !hasPropertyDescriptors }, function (st) {
		var firstSet = new $Set([42, 43]);

		var otherSet = new $Set([42, 43, 47]);

		Object.defineProperty(otherSet, 'size', {
			get: function () {
				firstSet.clear();
				return 3;
			}
		});

		st.equal(isSubsetOf(firstSet, otherSet), true);

		st.end();
	});

	t.test('test262: set method after table transition in receiver', function (st) {
		var firstSet = new Set([42, 43, 44]);

		var setLike = {
			size: 5,
			keys: function () {
				return getIterator([0, 1, 2, 3, 4]);
			},
			has: function (key) {
				if (key === 42) {
					// Cause a table transition in the receiver.
					firstSet.clear();
				}
				// Return true so we keep iterating the transitioned receiver.
				return true;
			}
		};

		st.equal(isSubsetOf(firstSet, setLike), true);
		st.equal(firstSet.size, 0);

		st.end();
	});

	t.test('evil setlike', function (st) {
		var x = new $Set('a', 'b');
		var evil = {
			size: 3,
			has: function () {
				x['delete']('b');
				x.add('c');
				return true;
			},
			keys: function () { return getIterator([]); }
		};
		st.ok(isSubsetOf(x, evil), 'x is a subset of evil setlike');

		st.end();
	});

	t.test('subsets', function (st) {
		var set1 = new $Set([1, 2, 3]);
		var set2 = new $Set([4, 5, 6]);
		var set3 = new $Set([1, 2, 3, 4, 5, 6]);

		st.equal(
			isSubsetOf(set1, set2),
			false,
			debug(set1) + ' is not a subset of ' + debug(set2)
		);
		st.equal(
			isSubsetOf(set2, set1),
			false,
			debug(set2) + ' is not a subset of ' + debug(set1)
		);
		st.equal(
			isSubsetOf(set1, set3),
			true,
			debug(set1) + ' is a subset of ' + debug(set3)
		);
		st.equal(
			isSubsetOf(set2, set3),
			true,
			debug(set2) + ' is a subset of ' + debug(set3)
		);

		st.end();
	});

	t.test('test262: set is subset of empty index', function (st) {
		var firstSet = new $Set('a', 'b');
		var secondSet = {
			size: 3,
			has: function () {
				firstSet['delete']('b');
				firstSet.add('c');
				return true;
			},
			keys: function () {
				return { next: function () { return { done: true }; } };
			}
		};
		st.equal(isSubsetOf(firstSet, secondSet), true);

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/isSubsetOf/allows-set-like-object', function (st) {
		var s1 = new $Set([1, 2]);
		var s2 = {
			size: 2,
			has: function (x) {
				if (x === 1) { return false; }
				if (x === 2) { return true; }
				throw new EvalError("Set.prototype.isSubsetOf should only call its argument's has method with contents of this");
			},
			keys: function () {
				throw new EvalError("Set.prototype.isSubsetOf should not call its argument's keys iterator");
			}
		};

		st.equal(isSubsetOf(s1, s2), false);

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/isSubsetOf/compares-Map', function (st) {
		var s1 = new $Set([1, 2]);
		var m1 = new $Map([
			[2, 'two'],
			[3, 'three']
		]);

		st.equal(isSubsetOf(s1, m1), false);

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/isSubsetOf/compares-empty-sets', function (st) {
		var s1 = new $Set([]);
		var s2 = new $Set([1, 2]);

		st.equal(isSubsetOf(s1, s2), true);

		var s3 = new $Set([1, 2]);
		var s4 = new $Set([]);

		st.equal(isSubsetOf(s3, s4), false);

		var s5 = new $Set([]);
		var s6 = new $Set([]);

		st.equal(isSubsetOf(s5, s6), true);

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/isSubsetOf/compares-itself', function (st) {
		var s1 = new $Set([1, 2]);

		st.equal(isSubsetOf(s1, s1), true);

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/isSubsetOf/compares-same-sets', function (st) {
		var s1 = new $Set([1, 2]);
		var s2 = new $Set([1, 2]);

		st.equal(isSubsetOf(s1, s2), true);

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/isSubsetOf/has-is-callable', function (st) {
		var s1 = new $Set([1, 2]);
		var s2 = {
			size: 2,
			has: undefined,
			keys: function () {
				return getIterator([2, 3]);
			}
		};
		st['throws'](
			function () { isSubsetOf(s1, s2); },
			TypeError,
			'GetSetRecord throws an error when has is undefined'
		);

		s2.has = {};
		st['throws'](
			function () { isSubsetOf(s1, s2); },
			TypeError,
			'GetSetRecord throws an error when has is not callable'
		);

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/isSubsetOf/keys-is-callable', function (st) {
		var s1 = new $Set([1, 2]);
		var s2 = {
			size: 2,
			has: function () {},
			keys: undefined
		};
		st['throws'](
			function () { isSubsetOf(s1, s2); },
			TypeError,
			'GetSetRecord throws an error when keys is undefined'
		);

		s2.keys = {};
		st['throws'](
			function () { isSubsetOf(s1, s2); },
			TypeError,
			'GetSetRecord throws an error when keys is not callable'
		);

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/isSubsetOf/set-like-array', function (st) {
		var s1 = new $Set([1, 2]);
		var s2 = [5, 6];
		s2.size = 3;
		s2.has = function (x) {
			if (x === 1) { return true; }
			if (x === 2) { return true; }
			throw new EvalError("Set.prototype.isSubsetOf should only call its argument's has method with contents of this");
		};
		s2.keys = function () {
			throw new EvalError("Set.prototype.isSubsetOf should not call its argument's keys iterator when this.size ≤ arg.size");
		};

		st.equal(isSubsetOf(s1, s2), true);

		st.end();
	});

	t.test('test262: test/built-ins/Set/prototype/isSubsetOf/size-is-a-number', function (st) {
		var s1 = new $Set([1, 2]);
		var s2 = {
			size: undefined,
			has: function () {},
			keys: function () {
				return getIterator([2, 3]);
			}
		};

		forEach([undefined, NaN, 'string'].concat(v.bigints), function (size) {
			s2.size = size;
			st['throws'](
				function () { isSubsetOf(s1, s2); },
				TypeError,
				'GetSetRecord throws an error when size is ' + debug(size)
			);
		});

		var coercionCalls = 0;
		s2.size = {
			valueOf: function () {
				coercionCalls += 1;
				return NaN;
			}
		};
		st['throws'](
			function () { isSubsetOf(s1, s2); },
			TypeError,
			'GetSetRecord throws an error when size coerces to NaN'
		);
		st.equal(coercionCalls, 1, 'GetSetRecord coerces size');

		st.end();
	});

	t.equal(isSubsetOf(new $Set([0]), new $Set([-0])), true, 'Set(0) is a subset of Set(-0)');

	t.test('test262: test/built-ins/Set/prototype/isSubsetOf/set-like-class-mutation', function (st) {
		var baseSet = new $Set(['a', 'b', 'c']);

		var evilSetLike = {
			size: 3,
			has: function (x) {
				if (x === 'a') {
					baseSet['delete']('c');
				}
				return x === 'x' || x === 'a' || x === 'b';
			},
			keys: function () {
				throw new EvalError('Set.prototype.isSubsetOf should not call its argument’s keys iterator');
			}
		};

		var result = isSubsetOf(baseSet, evilSetLike);
		st.equal(result, true);

		var expectedNewBase = new $Set(['a', 'b']);
		st.deepEqual(baseSet, expectedNewBase);

		st.end();
	});

	return t.comment('tests completed');
};
