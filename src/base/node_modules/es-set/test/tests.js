'use strict';

var HasOwnProperty = require('es-abstract/2024/HasOwnProperty');
var isEnumerable = Object.prototype.propertyIsEnumerable;
var functionsHaveNames = require('functions-have-names')();
var hasSymbols = require('has-symbols')();
var ArrayFrom = require('array.from');
var Map = require('es-map');
var getIterator = require('es-get-iterator');
var forEach = require('for-each');
var inspect = require('object-inspect');

var $Set = typeof Set === 'function' ? Set : null;

var testSet = function (t, set, key, desc) {
	// eslint-disable-next-line no-param-reassign
	if (!desc) { desc = ''; }

	t.equal(set.has(key), false, desc + ' - .has(' + inspect(key) + ') returns false');
	t.equal(set['delete'](key), false, desc + ' - .delete(' + inspect(key) + ') returns false');
	t.equal(set.add(key), set, desc + ' - .add(' + inspect(key) + ') returns the set');
	t.equal(set.has(key), true, desc + ' - .has(' + inspect(key) + ') returns true');
	t.equal(set['delete'](key), true, desc + ' - .delete(' + inspect(key) + ') returns true');
	t.equal(set.has(key), false, desc + ' - .has(' + inspect(key) + ') returns false');

	set.add(key); // add it back
};

var iterableToArray = function (set) {
	var iterator = getIterator(set);
	var elements = [];

	if (iterator) {
		var result;
		do {
			result = iterator.next();
			if (!result.done) { elements.push(result.value); }
		} while (!result.done);
	} else {
		set.forEach(function (v) {
			elements.push(v);
		});
	}

	return elements;
};

var range = function (from, to) {
	var result = [];
	for (var value = from; value < to; value++) {
		result.push(value);
	}
	return result;
};

var prototypePropIsEnumerable = isEnumerable.call(function () {}, 'prototype');
var expectNotEnumerable = function (t, object) {
	if (prototypePropIsEnumerable && typeof object === 'function') {
		t.deepEqual(Object.keys(object), ['prototype']);
	} else {
		t.deepEqual(Object.keys(object), []);
	}
};

module.exports = function (Set, t) {
	t.test('should be a function', function (st) {
		st.equal(typeof Set, 'function');
		st.end();
	});

	t.test('has the right arity', function (st) {
		st.equal(HasOwnProperty(Set, 'length'), true);
		st.equal(Set.length, 0);
		st.end();
	});

	t.test('throws when `.call`ed with an existing instance', function (st) {
		var set = new Set();
		st['throws'](function () { Set.call(set); });
		st.end();
	});

	t.test('subclasses native Set if it exists and differs', { skip: !$Set || $Set === Set }, function (st) {
		st.ok(new Set() instanceof $Set, 'is an instance of native Set');

		st.end();
	});

	t.test('set iteration', function (st) {
		var set = new Set();

		st.equal(set.add('a'), set);
		st.equal(set.add('b'), set);
		st.equal(set.add('c'), set);
		st.equal(set.add('d'), set);

		var keys = [];
		var iterator = set.keys();
		keys.push(iterator.next().value);
		st.equal(set['delete']('a'), true);
		st.equal(set['delete']('b'), true);
		st.equal(set['delete']('c'), true);
		st.equal(set.add('e'), set);
		keys.push(iterator.next().value);
		keys.push(iterator.next().value);

		st.equal(iterator.next().done, true);
		st.equal(set.add('f'), set);
		st.equal(iterator.next().done, true);
		st.deepEqual(keys, ['a', 'd', 'e']);
		st.end();
	});

	t.test('returns the set from #add() for chaining', function (st) {
		var set = new Set();

		st.equal(set.add({}), set);
		st.end();
	});

	t.test(
		'should return false when deleting an item not in the set',
		function (st) {
			var set = new Set();

			st.equal(set.has('a'), false);
			st.equal(set['delete']('a'), false);
			st.end();
		}
	);

	t.test('should accept an iterable as argument', function (st) {
		var set = new Set();

		testSet(st, set, 'a');
		testSet(st, set, 'b');
		var set2 = new Set(set);
		st.equal(set2.has('a'), true);
		st.equal(set2.has('b'), true);
		st.deepEqual(iterableToArray(set2), ['a', 'b']);
		st.end();
	});

	t.test('accepts an array as an argument', function (st) {
		var arr = ['a', 'b', 'c'];
		var setFromArray = new Set(arr);
		st.deepEqual(iterableToArray(setFromArray), ['a', 'b', 'c']);
		st.end();
	});

	t.test('should not be callable without "new"', function (st) {
		st['throws'](Set, TypeError);
		st.end();
	});

	t.test(
		'should be subclassable',
		{ skip: !Object.setPrototypeOf },
		function (st) {
			var MySet = function MySet() {
				var actualSet = new Set(['a', 'b']);
				Object.setPrototypeOf(actualSet, MySet.prototype);
				return actualSet;
			};

			Object.setPrototypeOf(MySet, Set);
			MySet.prototype = Object.create(Set.prototype, {
				constructor: { value: MySet }
			});

			var mySet = new MySet();
			testSet(st, mySet, 'c');
			testSet(st, mySet, 'd');
			st.deepEqual(iterableToArray(mySet), ['a', 'b', 'c', 'd']);
			st.end();
		}
	);

	t.test('should has valid getter and setter calls', function (st) {
		var set = new Set();

		forEach(['add', 'has', 'delete'], function (method) {
			st.doesNotThrow(function () {
				set[method]({});
			});
		});
		st.end();
	});

	t.test('uses SameValueZero even on a Set of size > 4', function (st) {
		var firstFour = [1, 2, 3, 4];
		var fourSet = new Set(firstFour);
		st.equal(fourSet.size, 4);
		st.equal(fourSet.has(-0), false);
		st.equal(fourSet.has(0), false);

		fourSet.add(-0);

		st.equal(fourSet.size, 5);
		st.equal(fourSet.has(0), true, 'has +0');
		st.equal(fourSet.has(-0), true, 'has -0');
		st.end();
	});

	t.test('should work as expected', function (st) {
		/*
		 * Run this test twice, one with the "fast" implementation (which only
		 * allows string and numeric keys) and once with the "slow" impl.
		 */
		forEach([true, false], function (slowkeys) {
			var set = new Set();

			forEach(range(1, 20), function (number) {
				if (slowkeys) {
					testSet(st, set, {});
				}
				testSet(st, set, number);
				testSet(st, set, number / 100);
				testSet(st, set, 'key-' + number);
				testSet(st, set, String(number));
				if (slowkeys) {
					testSet(st, set, Object(String(number)));
				}
			});

			var testkeys = [+0, Infinity, -Infinity, NaN];
			if (slowkeys) {
				testkeys.push(true, false, null, undefined);
			}
			forEach(testkeys, function (number) {
				testSet(st, set, number);
				testSet(st, set, String(number));
			});
			testSet(st, set, '');

			// -0 and +0 should be the same key (Set uses SameValueZero)
			st.equal(set.has(-0), true, 'has -0');
			st.equal(set['delete'](+0), true, 'deletes +0');
			testSet(st, set, -0);
			st.equal(set.has(+0), true, 'has +0');

			// verify that properties of Object don't peek through.
			forEach([
				'hasOwnProperty',
				'constructor',
				'toString',
				'isPrototypeOf',
				'__proto__',
				'__parent__',
				'__count__'
			], function (prop) {
				testSet(st, set, prop);
			});
		});
		st.end();
	});

	t.test('#size', function (st) {
		t.test('returns the expected size', function (sst) {
			var set = new Set();

			sst.equal(set.add(1), set);
			sst.equal(set.add(5), set);
			sst.equal(set.size, 2);
			sst.end();
		});
		st.end();
	});

	t.test('#clear()', function (st) {
		st.test(
			'has the right name',
			{ skip: !functionsHaveNames },
			function (sst) {
				sst.equal(HasOwnProperty(Set.prototype.clear, 'name'), true);
				sst.equal(Set.prototype.clear.name, 'clear');
				sst.end();
			}
		);

		t.test('is not enumerable', function (sst) {
			sst.equal(isEnumerable.call(Set.prototype, 'clear'), false);
			sst.end();
		});

		t.test('has the right arity', function (sst) {
			sst.equal(HasOwnProperty(Set.prototype.clear, 'length'), true);
			sst.equal(Set.prototype.clear.length, 0);
			sst.end();
		});

		t.test('clears a Set with only primitives', function (sst) {
			var set = new Set();

			sst.equal(set.add(1), set);
			sst.equal(set.size, 1);
			sst.equal(set.add(5), set);
			sst.equal(set.size, 2);
			sst.equal(set.has(5), true);
			set.clear();
			sst.equal(set.size, 0);
			sst.equal(set.has(5), false);
			sst.end();
		});

		t.test('clears a Set with primitives and objects', function (sst) {
			var set = new Set();

			sst.equal(set.add(1), set);
			sst.equal(set.size, 1);
			var obj = {};
			sst.equal(set.add(obj), set);
			sst.equal(set.size, 2);
			sst.equal(set.has(obj), true);
			set.clear();
			sst.equal(set.size, 0);
			sst.equal(set.has(obj), false);
			sst.end();
		});
		st.end();
	});

	t.test('#keys()', function (st) {
		if (!Object.prototype.hasOwnProperty.call(Set.prototype, 'keys')) {
			st.test('exists', function (sst) {
				sst.equal(HasOwnProperty(Set.prototype, 'keys'), true);
			});
			st.end();
			return;
		}

		t.test('is the same object as #values()', function (sst) {
			sst.equal(Set.prototype.keys, Set.prototype.values);
			sst.end();
		});

		t.test('has the right name', { skip: !functionsHaveNames }, function (sst) {
			sst.equal(HasOwnProperty(Set.prototype.keys, 'name'), true);
			sst.equal(Set.prototype.keys.name, 'values');
			sst.end();
		});

		t.test('is not enumerable', function (sst) {
			sst.equal(isEnumerable.call(Set.prototype, 'keys'), false);
			sst.end();
		});

		t.test('has the right arity', function (sst) {
			sst.equal(HasOwnProperty(Set.prototype.keys, 'length'), true);
			sst.equal(Set.prototype.keys.length, 0);
			sst.end();
		});
		st.end();
	});

	t.test('#values()', function (st) {
		if (!Object.prototype.hasOwnProperty.call(Set.prototype, 'values')) {
			st.test('exists', function (sst) {
				sst.equal(HasOwnProperty(Set.prototype, 'values'), true);
			});
			st.end();
			return;
		}

		st.test('has the right name', { skip: !functionsHaveNames }, function (sst) {
			sst.equal(HasOwnProperty(Set.prototype.values, 'name'), true);
			sst.equal(Set.prototype.values.name, 'values');
			sst.end();
		});

		st.test('is not enumerable', function (sst) {
			sst.equal(isEnumerable.call(Set.prototype, 'values'), false);
			sst.end();
		});

		st.test('has the right arity', function (sst) {
			sst.equal(HasOwnProperty(Set.prototype.values, 'length'), true);
			sst.equal(Set.prototype.values.length, 0);
			sst.end();
		});

		st.test('throws when called on a non-Set', function (sst) {
			var expectedMessage = /(Method )?Set.prototype.values called on incompatible receiver |values method called on incompatible |Cannot create a Set value iterator for a non-Set object.|Set.prototype.values: 'this' is not a Set object|std_Set_iterator method called on incompatible \w+|Set.prototype.values requires that \|this\| be Set/;
			var nonSets = [
				true,
				false,
				'abc',
				NaN,
				new Map([[1, 2]]),
				{ a: true },
				[1],
				Object('abc'),
				Object(NaN)
			];
			forEach(nonSets, function (nonSet) {
				sst['throws'](
					function () {
						return Set.prototype.values.call(nonSet);
					},
					TypeError
				);
				sst['throws'](
					function () {
						return Set.prototype.values.call(nonSet);
					},
					expectedMessage
				);
			});
			sst.end();
		});
		st.end();
	});

	t.test('#entries()', function (st) {
		if (!Object.prototype.hasOwnProperty.call(Set.prototype, 'entries')) {
			st.test('exists', function (sst) {
				sst.equal(HasOwnProperty(Set.prototype, 'entries'), true);
			});
			st.end();
			return;
		}

		st.test('has the right name', { skip: !functionsHaveNames }, function (sst) {
			sst.equal(HasOwnProperty(Set.prototype.entries, 'name'), true);
			sst.equal(Set.prototype.entries.name, 'entries');
			sst.end();
		});

		st.test('is not enumerable', function (sst) {
			sst.equal(isEnumerable.call(Set.prototype, 'entries'), false);
			sst.end();
		});

		st.test('has the right arity', function (sst) {
			sst.equal(HasOwnProperty(Set.prototype.entries, 'length'), true);
			sst.equal(Set.prototype.entries.length, 0);
			sst.end();
		});
		st.end();
	});

	t.test('#has()', function (st) {
		if (!Object.prototype.hasOwnProperty.call(Set.prototype, 'has')) {
			st.test('exists', function (sst) {
				sst.equal(HasOwnProperty(Set.prototype, 'has'), true);
			});
			st.end();
			return;
		}

		st.test('has the right name', { skip: !functionsHaveNames }, function (sst) {
			sst.equal(HasOwnProperty(Set.prototype.has, 'name'), true);
			sst.equal(Set.prototype.has.name, 'has');
			sst.end();
		});

		t.test('is not enumerable', function (sst) {
			sst.equal(isEnumerable.call(Set.prototype, 'has'), false);
			sst.end();
		});

		t.test('has the right arity', function (sst) {
			sst.equal(HasOwnProperty(Set.prototype.has, 'length'), true);
			sst.equal(Set.prototype.has.length, 1);
			sst.end();
		});
		st.end();
	});

	t.test('should allow NaN values as keys', function (st) {
		var set = new Set();

		st.equal(set.has(NaN), false);
		st.equal(set.has(NaN + 1), false);
		st.equal(set.has(23), false);
		st.equal(set.add(NaN), set);
		st.equal(set.has(NaN), true);
		st.equal(set.has(NaN + 1), true);
		st.equal(set.has(23), false);
		st.end();
	});

	t.test('should not have [[Enumerable]] props', function (st) {
		expectNotEnumerable(st, Set);
		expectNotEnumerable(st, Set.prototype);
		expectNotEnumerable(st, new Set());
		st.end();
	});

	t.test('should not have an own constructor', function (st) {
		var s = new Set();
		st.equal(HasOwnProperty(s, 'constructor'), false);
		st.equal(s.constructor, Set);
		st.end();
	});

	t.test('should allow common ecmascript idioms', function (st) {
		st.equal(new Set() instanceof Set, true);
		st.equal(typeof Set.prototype.add, 'function');
		st.equal(typeof Set.prototype.has, 'function');
		st.equal(typeof Set.prototype['delete'], 'function');
		st.end();
	});

	t.test('should have a unique constructor', function (st) {
		st.notEqual(Set.prototype, Object.prototype);
		st.end();
	});

	t.test('has an iterator that works with Array.from', { skip: !hasSymbols }, function (st) {
		var values = [1, NaN, false, true, null, undefined, 'a'];

		st.test('works with the full set', function (sst) {
			sst.deepEqual(ArrayFrom(new Set(values)), values);
			sst.end();
		});

		st.test('works with Set#keys()', function (sst) {
			sst.deepEqual(ArrayFrom(new Set(values).keys()), values);
			sst.end();
		});

		st.test('works with Set#values()', function (sst) {
			sst.deepEqual(ArrayFrom(new Set(values).values()), values);
			sst.end();
		});

		st.test('works with Set#entries()', function (sst) {
			sst.deepEqual(ArrayFrom(new Set(values).entries()), [
				[1, 1],
				[NaN, NaN],
				[false, false],
				[true, true],
				[null, null],
				[undefined, undefined],
				['a', 'a']
			]);
			sst.end();
		});
		st.end();
	});

	t.test(
		'has the right default iteration function',
		{ skip: !hasSymbols },
		function (st) {
			// fixed in Webkit https://bugs.webkit.org/show_bug.cgi?id=143838
			st.equal(HasOwnProperty(Set.prototype, Symbol.iterator), true);
			st.equal(Set.prototype[Symbol.iterator], Set.prototype.values);
			st.end();
		}
	);

	t.test('should preserve insertion order', function (st) {
		var arr1 = ['d', 'a', 'b'];
		var arr2 = [3, 2, 'z', 'a', 1];
		var arr3 = [3, 2, 'z', {}, 'a', 1];

		forEach([arr1, arr2, arr3], function (array) {
			st.deepEqual(iterableToArray(new Set(array)), array);
		});
		st.end();
	});

	t.test('#forEach', function (st) {
		var getSet = function () {
			var setToIterate = new Set();
			setToIterate.add('a');
			setToIterate.add('b');
			setToIterate.add('c');
			return setToIterate;
		};

		st.test('has the right name', { skip: !functionsHaveNames }, function (sst) {
			sst.equal(HasOwnProperty(Set.prototype.forEach, 'name'), true);
			sst.equal(Set.prototype.forEach.name, 'forEach');
			sst.end();
		});

		st.test('is not enumerable', function (sst) {
			sst.equal(isEnumerable.call(Set.prototype, 'forEach'), false);
			sst.end();
		});

		st.test('has the right arity', function (sst) {
			sst.equal(HasOwnProperty(Set.prototype.forEach, 'length'), true);
			sst.equal(Set.prototype.forEach.length, 1);
			sst.end();
		});

		st.test('should be iterable via forEach', function (sst) {
			var setToIterate = getSet();

			var expectedSet = ['a', 'b', 'c'];
			var foundSet = [];
			setToIterate.forEach(function (value, alsoValue, entireSet) {
				sst.equal(entireSet, setToIterate);
				sst.equal(value, alsoValue);
				foundSet.push(value);
			});
			sst.deepEqual(foundSet, expectedSet);
			sst.end();
		});

		st.test('should iterate over empty keys', function (sst) {
			var setWithEmptyKeys = new Set();
			var expectedKeys = [{}, null, undefined, '', NaN, 0];
			forEach(expectedKeys, function (key) {
				sst.equal(setWithEmptyKeys.add(key), setWithEmptyKeys);
			});
			var foundKeys = [];
			setWithEmptyKeys.forEach(function (value, key, entireSet) {
				sst.equal(key, value); // handles NaN correctly
				sst.equal(entireSet.has(key), true);
				foundKeys.push(key);
			});
			sst.deepEqual(foundKeys, expectedKeys);
			sst.end();
		});

		st.test('should support the thisArg', function (sst) {
			var setToIterate = getSet();

			var context = function () {};
			setToIterate.forEach(function () {
				sst.equal(this, context);
			}, context);
			sst.end();
		});

		st.test('should have a length of 1', function (sst) {
			sst.equal(Set.prototype.forEach.length, 1);
			sst.end();
		});

		st.test('should not revisit modified keys', function (sst) {
			var setToIterate = getSet();

			var hasModifiedA = false;
			setToIterate.forEach(function (value, key) {
				if (!hasModifiedA && key === 'a') {
					sst.equal(setToIterate.add('a'), setToIterate);
					hasModifiedA = true;
				} else {
					sst.notEqual(key, 'a');
				}
			});
			sst.end();
		});

		st.test('visits keys added in the iterator', function (sst) {
			var setToIterate = getSet();

			var hasAdded = false;
			var hasFoundD = false;
			setToIterate.forEach(function (value, key) {
				if (!hasAdded) {
					sst.equal(setToIterate.add('d'), setToIterate);
					hasAdded = true;
				} else if (key === 'd') {
					hasFoundD = true;
				}
			});
			sst.equal(hasFoundD, true);
			sst.end();
		});

		st.test(
			'visits keys added in the iterator when there is a deletion (slow path)',
			function (sst) {
				var hasSeenFour = false;
				var setToMutate = new Set();
				sst.equal(setToMutate.add({}), setToMutate); // force use of the slow O(N) implementation
				sst.equal(setToMutate.add('0'), setToMutate);
				setToMutate.forEach(function (value, key) {
					if (key === '0') {
						sst.equal(setToMutate['delete']('0'), true);
						sst.equal(setToMutate.add('4'), setToMutate);
					} else if (key === '4') {
						hasSeenFour = true;
					}
				});
				sst.equal(hasSeenFour, true);
				sst.end();
			}
		);

		st.test(
			'visits keys added in the iterator when there is a deletion (fast path)',
			function (sst) {
				var hasSeenFour = false;
				var setToMutate = new Set();
				sst.equal(setToMutate.add('0'), setToMutate);
				setToMutate.forEach(function (value, key) {
					if (key === '0') {
						sst.equal(setToMutate['delete']('0'), true);
						sst.equal(setToMutate.add('4'), setToMutate);
					} else if (key === '4') {
						hasSeenFour = true;
					}
				});
				sst.equal(hasSeenFour, true);
				sst.end();
			}
		);

		st.test('does not visit keys deleted before a visit', function (sst) {
			var setToIterate = getSet();

			var hasVisitedC = false;
			var hasDeletedC = false;
			setToIterate.forEach(function (value, key) {
				if (key === 'c') {
					hasVisitedC = true;
				}
				if (!hasVisitedC && !hasDeletedC) {
					hasDeletedC = setToIterate['delete']('c');
					sst.equal(hasDeletedC, true);
				}
			});
			sst.equal(hasVisitedC, false);
			sst.end();
		});

		st.test('should work after deletion of the current key', function (sst) {
			var setToIterate = getSet();

			var expectedSet = { a: 'a', b: 'b', c: 'c' };
			var foundSet = {};
			setToIterate.forEach(function (value, key) {
				foundSet[key] = value;
				sst.equal(setToIterate['delete'](key), true);
			});
			sst.deepEqual(foundSet, expectedSet);
			sst.end();
		});

		st.test('should convert key -0 to +0', function (sst) {
			var zeroSet = new Set();
			var result = [];
			sst.equal(zeroSet.add(-0), zeroSet);
			zeroSet.forEach(function (key) {
				result.push(String(1 / key));
			});
			sst.equal(zeroSet.add(1), zeroSet);
			sst.equal(zeroSet.add(0), zeroSet); // shouldn't cause reordering
			zeroSet.forEach(function (key) {
				result.push(String(1 / key));
			});
			sst.equal(result.join(', '), 'Infinity, Infinity, 1');
			sst.end();
		});
		st.end();
	});

	t.test('Set.prototype.size should throw TypeError', function (st) {
		// see https://github.com/paulmillr/es6-shim/issues/176
		st['throws'](function () {
			return Set.prototype.size;
		}, TypeError);
		st['throws'](function () {
			return Set.prototype.size;
		}, TypeError);
		st.end();
	});

	t.test('SetIterator identification', function (st) {
		var fnSetValues = Set.prototype.values;
		var setSentinel = new Set(['SetSentinel']);
		var testSet1 = new Set();
		var testSetValues = testSet1.values();
		st.equal(
			testSetValues.next.call(fnSetValues.call(setSentinel)).value,
			'SetSentinel'
		);

		var testMap = new Map();
		var testMapValues = testMap.values();
		st['throws'](function () {
			return testMapValues.next.call(fnSetValues.call(setSentinel)).value;
		}, TypeError);
		st.end();
	});
};
