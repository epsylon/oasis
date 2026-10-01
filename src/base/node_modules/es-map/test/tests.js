'use strict';

var HasOwnProperty = require('es-abstract/2024/HasOwnProperty');
var isEnumerable = Object.prototype.propertyIsEnumerable;
var functionsHaveNames = require('functions-have-names')();
var define = require('define-properties');
var hasSymbols = require('has-symbols')();
var ArrayFrom = require('array.from');

var testMapping = function testMapping(t, map, key, value, desc) {
	if (!desc) { desc = ''; } // eslint-disable-line no-param-reassign
	t.equal(map.has(key), false, desc + ' - .has(key) returns false');
	t.equal(map.get(key), undefined, desc + ' - .get(key) returns undefined');
	t.equal(map.set(key, value), map, desc + ' - .set(key) returns the map');
	t.equal(map.get(key), value, desc + ' - .get(key) returns the value');
	t.equal(map.has(key), true, desc + ' - .has(key) returns true');
};

var entriesArray = function (map) {
	var arr = [];
	map.forEach(function (value, key) {
		arr.push([key, value]);
	});
	return arr;
};

var range = function (from, to) {
	var result = [];
	for (var value = from; value < to; value++) {
		result.push(value);
	}
	return result;
};

var prototypePropIsEnumerable = Object.prototype.propertyIsEnumerable.call(function () {}, 'prototype');
var expectNotEnumerable = function (t, object, desc) {
	if (prototypePropIsEnumerable && typeof object === 'function') {
		t.deepEqual(Object.keys(object), ['prototype'], desc);
	} else {
		t.deepEqual(Object.keys(object), [], desc);
	}
};

module.exports = function runTests(Map, t) {
	t.test('should has valid getter and setter calls', function (st) {
		var map = new Map();

		st.doesNotThrow(function () { map.get({}); });
		st.doesNotThrow(function () { map.set({}); });
		st.doesNotThrow(function () { map.has({}); });
		st.doesNotThrow(function () { map['delete']({}); });

		st.end();
	});

	t.test('throws when `.call`ed with an existing instance', function (st) {
		var map = new Map();
		st['throws'](function () { Map.call(map); }, 'Map can not be .called on an existing map');
		st.end();
	});

	t.test('should accept an iterable as argument', function (st) {
		var map = new Map();
		testMapping(st, map, 'a', 'b', 'add "a"->"b" to map');
		testMapping(st, map, 'c', 'd', 'add "c"->"d" to map');

		var map2;
		st.doesNotThrow(function () { map2 = new Map(map); });

		st.ok(map2 instanceof Map, 'map2 is an instance of Map');
		st.equal(map2.has('a'), true, 'map2 has "a"');
		st.equal(map2.has('c'), true, 'map2 has "c"');
		st.deepEqual(entriesArray(map2), [['a', 'b'], ['c', 'd']], 'entries are correct');

		st.end();
	});

	t.test('should throw with iterables that return primitives', function (st) {
		st['throws'](function () { return new Map('123'); }, TypeError, 'string');
		st['throws'](function () { return new Map([1, 2, 3]); }, TypeError, 'array of numbers');
		st['throws'](function () { return new Map(['1', '2', '3']); }, TypeError, 'array of strings');
		st['throws'](function () { return new Map([true]); }, TypeError, 'array of booleans');

		st.end();
	});

	t.test('should not be callable without "new"', function (st) {
		st['throws'](Map, TypeError, 'call without new');

		st.end();
	});

	t.test('should be subclassable', { skip: !Object.setPrototypeOf }, function (st) {
		var MyMap = function MyMap() {
			var testMap = new Map([['a', 'b']]);
			Object.setPrototypeOf(testMap, MyMap.prototype);
			return testMap;
		};
		Object.setPrototypeOf(MyMap, Map);
		MyMap.prototype = Object.create(Map.prototype, {
			constructor: { value: MyMap }
		});

		var myMap = new MyMap();
		testMapping(st, myMap, 'c', 'd', 'add "c"->"d" to myMap');
		st.deepEqual(entriesArray(myMap), [['a', 'b'], ['c', 'd']], 'entries are correct');

		st.end();
	});

	t.test('uses SameValueZero even on a Map of size > 4', function (st) {
		// Chrome 38-42, node 0.11/0.12, iojs 1/2 have a bug when the Map has a size > 4
		var firstFour = [[1, 0], [2, 0], [3, 0], [4, 0]];
		var fourMap = new Map(firstFour);
		st.equal(fourMap.size, 4, 'fourMap contains 4 elements');
		st.equal(fourMap.has(-0), false, 'fourMap doesn\'t contain -0');
		st.equal(fourMap.has(0), false, 'fourMap doesn\'t contain 0');

		fourMap.set(-0, fourMap);

		st.equal(fourMap.has(0), true, 'fourMap contains 0');
		st.equal(fourMap.has(-0), true, 'fourMap contains -0');

		st.end();
	});

	t.test('treats positive and negative zero the same', function (st) {
		var map = new Map();
		var value1 = {};
		var value2 = {};

		testMapping(st, map, +0, value1, 'add +0->value1 to map');
		st.equal(map.has(-0), true, 'map has -0');
		st.equal(map.get(-0), value1, '-0 corresponds to value1');
		st.equal(map.set(-0, value2), map, 'add -0->value2 to map');
		st.equal(map.get(-0), value2, '-0 corresponds to value2');
		st.equal(map.get(+0), value2, '+0 corresponds to value2');

		st.end();
	});

	t.test('should map values correctly', function (st) {
		/*
		 * Run this test twice, one with the "fast" implementation (which only
		 * allows string and numeric keys) and once with the "slow" impl.
		 */
		[true, false].forEach(function (slowkeys) {
			var map = new Map();

			range(1, 20).forEach(function (number) {
				if (slowkeys) { testMapping(st, map, number, {}, 'an integer key to the map - slowkeys:' + slowkeys); }
				testMapping(st, map, number / 100, {}, 'a rational key to map - slowkeys:' + slowkeys);
				testMapping(st, map, 'key-' + number, {}, 'a string key to map - slowkeys:' + slowkeys);
				testMapping(st, map, String(number), {}, 'a string key to map (2) - slowkeys:' + slowkeys);
				if (slowkeys) { testMapping(st, map, Object(String(number)), {}, 'an object key to map - slowkeys:' + slowkeys); }
			});

			var testkeys = [Infinity, -Infinity, NaN];
			if (slowkeys) {
				testkeys.push(true, false, null, undefined);
			}
			testkeys.forEach(function (key) {
				testMapping(st, map, key, {}, 'a ' + key + ' key to map - slowkeys:' + slowkeys);
				testMapping(st, map, String(key), {}, 'a String(' + key + ') key to map - slowkeys:' + slowkeys);
			});
			testMapping(st, map, '', {}, 'an empty string key to map - slowkeys:' + slowkeys);

			// verify that properties of Object don't peek through.
			[
				'hasOwnProperty',
				'constructor',
				'toString',
				'isPrototypeOf',
				'__proto__',
				'__parent__',
				'__count__'
			].forEach(function (key) {
				testMapping(st, map, key, {}, '"' + key + '" as a key in map');
			});
		});

		st.end();
	});

	t.test('should map empty values correctly', function (st) {
		var map = new Map();

		testMapping(st, map, {}, true, 'test {} key');
		testMapping(st, map, null, true, 'test null key');
		testMapping(st, map, undefined, true, 'test undefined key');
		testMapping(st, map, '', true, 'test "" key');
		testMapping(st, map, NaN, true, 'test NaN key');
		testMapping(st, map, 0, true, 'test 0 key');

		st.end();
	});

	t.test('should has correct querying behavior', function (st) {
		var map = new Map();
		var key = {};
		testMapping(st, map, key, 'to-be-present', 'add key to map');

		st.equal(map.has(key), true, 'has that key');
		st.equal(map.has({}), false, 'doesn\'t have a shallowly equal key');
		st.equal(map.set(key, undefined), map, 'set that key to undefined');
		st.equal(map.get(key), undefined, 'the corresponding value is undefined');
		st.equal(map.has(key), true, 'the key is still present');
		st.equal(map.has({}), false, 'the shallowly equal key is still not present');

		st.end();
	});

	t.test('should allow NaN values as keys', function (st) {
		var map = new Map();

		st.equal(map.has(NaN), false, 'NaN not present');
		st.equal(map.has(NaN + 1), false, 'different NaN not present');
		st.equal(map.has(23), false, 'different number not present');
		st.equal(map.set(NaN, 'value'), map, 'add a NaN key to the map');
		st.equal(map.has(NaN), true, 'NaN is present');
		st.equal(map.has(NaN + 1), true, 'a different NaN is present');
		st.equal(map.has(23), false, 'different number still not present');

		st.end();
	});

	t.test('should not have [[Enumerable]] props', function (st) {
		expectNotEnumerable(st, Map, 'Map doesn\'t have enumerable props');
		expectNotEnumerable(st, Map.prototype, 'Map.prototype doesn\'t have enumerable props');
		expectNotEnumerable(st, new Map(), 'new Map() doesn\'t have enumerable props');

		st.end();
	});

	t.test('should not have an own constructor', function (st) {
		var map = new Map();

		st.equal(HasOwnProperty(map, 'constructor'), false);
		st.equal(map.constructor, Map);

		st.end();
	});

	t.test('should allow common ecmascript idioms', function (st) {
		var map = new Map();

		st.ok(map instanceof Map);
		st.equal(typeof Map.prototype.get, 'function');
		st.equal(typeof Map.prototype.set, 'function');
		st.equal(typeof Map.prototype.has, 'function');
		st.equal(typeof Map.prototype['delete'], 'function');

		st.end();
	});

	t.test('should have a unique constructor', function (st) {
		st.notEqual(Map.prototype, Object.prototype);
		st.end();
	});

	t.test('#clear()', function (st) {
		st.ok(HasOwnProperty(Map.prototype, 'clear'), 'Map.prototype.clear exists');

		st.equal(Map.prototype.clear.length, 0, 'Map.prototype.clear has length of 0');

		st.test('function name', { skip: !functionsHaveNames }, function (sst) {
			sst.equal(Map.prototype.clear.name, 'clear', 'Map.prototype.clear has name "clear"');
			sst.end();
		});

		st.test('enumerability', { skip: !define.supportsDescriptors }, function (sst) {
			sst.equal(false, isEnumerable.call(Map.prototype, 'clear'), 'Math.prototype.clear is not enumerable');
			sst.end();
		});

		st.test('behavior', function (sst) {
			var map = new Map();

			sst.equal(map.set(1, 2), map);
			sst.equal(map.set(5, 2), map);
			sst.equal(map.size, 2);
			sst.equal(map.has(5), true);

			map.clear();

			sst.equal(map.size, 0);
			sst.equal(map.has(5), false);

			sst.end();
		});

		st.end();
	});

	t.test('#keys()', function (st) {
		st.ok(HasOwnProperty(Map.prototype, 'keys'), 'Map.prototype.keys exists');

		st.equal(Map.prototype.keys.length, 0, 'Map.prototype.keys has length of 0');

		st.test('function name', { skip: !functionsHaveNames }, function (sst) {
			sst.equal(Map.prototype.keys.name, 'keys', 'Map.prototype.keys has name "keys"');
			sst.end();
		});

		st.test('enumerability', { skip: !define.supportsDescriptors }, function (sst) {
			sst.equal(false, isEnumerable.call(Map.prototype, 'keys'), 'Math.prototype.keys is not enumerable');
			sst.end();
		});

		st.end();
	});

	t.test('#values()', function (st) {
		st.ok(HasOwnProperty(Map.prototype, 'values'), 'Map.prototype.values exists');

		st.equal(Map.prototype.values.length, 0, 'Map.prototype.values has length of 0');

		st.test('function name', { skip: !functionsHaveNames }, function (sst) {
			sst.equal(Map.prototype.values.name, 'values', 'Map.prototype.values has name "values"');
			sst.end();
		});

		st.test('enumerability', { skip: !define.supportsDescriptors }, function (sst) {
			sst.equal(false, isEnumerable.call(Map.prototype, 'values'), 'Math.prototype.values is not enumerable');
			sst.end();
		});

		st.end();
	});

	t.test('#entries()', function (st) {
		st.ok(HasOwnProperty(Map.prototype, 'entries'), 'Map.prototype.entries exists');

		st.equal(Map.prototype.entries.length, 0, 'Map.prototype.entties has length of 0');

		st.test('function name', { skip: !functionsHaveNames }, function (sst) {
			sst.equal(Map.prototype.entries.name, 'entries', 'Map.prototype.entties has name "entries"');
			sst.end();
		});

		st.test('enumerability', { skip: !define.supportsDescriptors }, function (sst) {
			sst.equal(false, isEnumerable.call(Map.prototype, 'entries'), 'Math.prototype.entries is not enumerable');
			sst.end();
		});

		st.end();
	});

	t.test('#size', { skip: !define.supportsDescriptors }, function (st) {
		st.test('throws TypeError when accessed directly', function (sst) {
			// see https://github.com/paulmillr/es6-shim/issues/176
			sst['throws'](function () { return Map.prototype.size; }, TypeError, 'Map.prototype.set throws (1)');
			sst['throws'](function () { return Map.prototype.size; }, TypeError, 'Map.prototype.set throws (2)');

			sst.end();
		});

		st.test('is an accessor function on the prototype', function (sst) {
			var desc = Object.getOwnPropertyDescriptor(Map.prototype, 'size');
			sst.ok(HasOwnProperty(desc, 'get'), '#size descriptor has get');
			sst.equal(typeof desc.get, 'function', '#size descriptor has a get function');
			sst.ok(!HasOwnProperty(new Map(), 'size'), '.size is not an own property of new Map(');

			sst.end();
		});

		st.end();
	});

	t.test('should return false when deleting a nonexistent key', function (st) {
		var map = new Map();

		st.equal(map.has('a'), false, 'map does not contain "a"');
		st.equal(map['delete']('a'), false, 'deleting "a" returns false');

		st.end();
	});

	t.test('should have keys, values and size props', function (st) {
		var map = new Map();

		st.equal(map.set('a', 1), map, 'add "a"->1 into the mapp');
		st.equal(map.set('b', 2), map, 'add "b"->2 into the mapp');
		st.equal(map.set('c', 3), map, 'add "c"->3 into the mapp');
		st.equal(typeof map.keys, 'function', 'map.keys is a function');
		st.equal(typeof map.values, 'function', 'map.values is a function');
		st.equal(map.size, 3, 'map.size is a 3');
		st.equal(map['delete']('a'), true, 'deleting "a" returns true');
		st.equal(map.size, 2, 'map.size is 2');

		st.end();
	});

	t.test('should have an iterator that works with native Array.from', { skip: !Array.from }, function (st) {
		var map = new Map();

		st.equal(map.set('a', 1), map, 'add "a"->1 to map');
		st.equal(map.set('b', NaN), map, 'add "b"->NaN to map');
		st.equal(map.set('c', false), map, 'add "c"->false to map');
		st.deepEqual(Array.from(map), [['a', 1], ['b', NaN], ['c', false]], 'Array.from(map) returns the entries');
		st.deepEqual(Array.from(map.keys()), ['a', 'b', 'c'], 'Array.from(map.keys()) returns the keys');
		st.deepEqual(Array.from(map.values()), [1, NaN, false], 'Array.from(map.values()) returns the values');
		st.deepEqual(Array.from(map.entries()), entriesArray(map), 'Array.from(map.entries()) returns the entries');

		st.end();
	});

	t.test('should have an iterator that works with polyfilled Array.from', { skip: !hasSymbols }, function (st) {
		var map = new Map();

		st.equal(map.set('a', 1), map, 'add "a"->1 to map');
		st.equal(map.set('b', NaN), map, 'add "b"->NaN to map');
		st.equal(map.set('c', false), map, 'add "c"->false to map');
		st.deepEqual(ArrayFrom(map), [['a', 1], ['b', NaN], ['c', false]], 'Array.from(map) returns the entries');

		st.deepEqual(ArrayFrom(map.keys()), ['a', 'b', 'c'], 'Array.from(map.keys()) returns the keys');
		st.deepEqual(ArrayFrom(map.values()), [1, NaN, false], 'Array.from(map.values()) returns the values');
		st.deepEqual(ArrayFrom(map.entries()), [['a', 1], ['b', NaN], ['c', false]], 'Array.from(map.entries()) returns the entries');

		st.end();
	});

	t.test('has the right default iteration function', { skip: !hasSymbols }, function (st) {
		// fixed in Webkit https://bugs.webkit.org/show_bug.cgi?id=143838
		st.ok(HasOwnProperty(Map.prototype, Symbol.iterator), 'Map.prototype as a [Symbol.iterator] property');
		st.equal(Map.prototype[Symbol.iterator], Map.prototype.entries, 'Map.prototype[Symbol.iterator] is Map.prototype.entries');

		st.end();
	});

	t.test('#forEach', function (st) {
		var init = function () {
			var mapToIterate = new Map();
			mapToIterate.set('a', 1);
			mapToIterate.set('b', 2);
			mapToIterate.set('c', 3);
			return mapToIterate;
		};

		st.ok(HasOwnProperty(Map.prototype, 'forEach'), 'Map.prototype.forEach exists');

		st.equal(Map.prototype.forEach.length, 1, 'Map.prototype.forEach has length of 0');

		st.test('function name', { skip: !functionsHaveNames }, function (sst) {
			sst.equal(Map.prototype.forEach.name, 'forEach', 'Map.prototype.forEach has name "forEach"');
			sst.end();
		});

		st.test('enumerability', { skip: !define.supportsDescriptors }, function (sst) {
			sst.equal(false, isEnumerable.call(Map.prototype, 'forEach'), 'Math.prototype.forEach is not enumerable');
			sst.end();
		});

		st.test('should be iterable via forEach', function (sst) {
			var expectedMap = {
				a: 1,
				b: 2,
				c: 3
			};
			var foundMap = {};
			var map = init();
			map.forEach(function (value, key, entireMap) {
				sst.equal(entireMap, map, 'the third argument to the .forEach callback is the map');
				foundMap[key] = value;
			});
			sst.deepEqual(foundMap, expectedMap, '.forEach visited all the entries');

			sst.end();
		});

		st.test('should iterate over empty keys', function (sst) {
			var mapWithEmptyKeys = new Map();
			var expectedKeys = [{}, null, undefined, '', NaN, 0];
			expectedKeys.forEach(function (key) {
				mapWithEmptyKeys.set(key, true);
			});
			var foundKeys = [];
			mapWithEmptyKeys.forEach(function (value, key, entireMap) {
				sst.equal(entireMap.get(key), value, 'the value is correct');
				foundKeys.push(key);
			});
			sst.deepEqual(foundKeys, expectedKeys, '.forEach visits empty keys');

			sst.end();
		});

		st.test('should support the thisArg', function (sst) {
			var context = {};
			init().forEach(function () {
				sst.equal(this, context, 'this === context');
			}, context);

			sst.end();
		});

		st.test('should not revisit modified keys', function (sst) {
			var mapToIterate = init();
			var hasModifiedA = false;
			mapToIterate.forEach(function (value, key) {
				if (!hasModifiedA && key === 'a') {
					mapToIterate.set('a', 4);
					hasModifiedA = true;
				} else {
					sst.notEqual(key, 'a', 'does not visit "a" again');
				}
			});

			sst.end();
		});

		st.test('visits keys added in the iterator', function (sst) {
			var mapToIterate = init();
			var hasAdded = false;
			var hasFoundD = false;
			mapToIterate.forEach(function (value, key) {
				if (!hasAdded) {
					mapToIterate.set('d', 5);
					hasAdded = true;
				} else if (key === 'd') {
					hasFoundD = true;
				}
			});
			sst.ok(hasFoundD, 'has visited d after adding it');

			sst.end();
		});

		st.test('visits keys added in the iterator when there is a deletion', function (sst) {
			var hasSeenFour = false;
			var mapToMutate = new Map();
			mapToMutate.set('0', 42);
			mapToMutate.forEach(function (value, key) {
				if (key === '0') {
					sst.ok(mapToMutate['delete']('0'), 'deletes "0"');
					mapToMutate.set('4', 'a value');
				} else if (key === '4') {
					hasSeenFour = true;
				}
			});
			sst.ok(hasSeenFour, 'has seen "4"');

			sst.end();
		});

		st.test('does not visit keys deleted before a visit', function (sst) {
			var mapToIterate = init();
			var hasVisitedC = false;
			var hasDeletedC = false;
			mapToIterate.forEach(function (value, key) {
				if (key === 'c') {
					hasVisitedC = true;
				}
				if (!hasVisitedC && !hasDeletedC) {
					hasDeletedC = mapToIterate['delete']('c');
					sst.ok(hasDeletedC, 'has deleted "c"');
				}
			});
			sst.notOk(hasVisitedC, 'has visited "c"');

			sst.end();
		});

		st.test('should work after deletion of the current key', function (sst) {
			var mapToIterate = init();
			var expectedMap = {
				a: 1,
				b: 2,
				c: 3
			};
			var foundMap = {};
			mapToIterate.forEach(function (value, key) {
				foundMap[key] = value;
				sst.ok(mapToIterate['delete'](key), 'delete the current entry');
			});
			sst.deepEqual(foundMap, expectedMap, 'visits the correct entries');

			sst.end();
		});

		st.test('should convert key -0 to +0', function (sst) {
			var zeroMap = new Map();
			var result = [];
			zeroMap.set(-0, 'a');
			zeroMap.forEach(function (value, key) {
				result.push(String(1 / key) + ' ' + value);
			});
			zeroMap.set(1, 'b');
			zeroMap.set(0, 'c'); // shouldn't cause reordering
			zeroMap.forEach(function (value, key) {
				result.push(String(1 / key) + ' ' + value);
			});
			sst.deepEqual(result, ['Infinity a', 'Infinity c', '1 b'], 'visits the entries in the correct order');

			sst.end();
		});
	});

	t.test('should preserve insertion order', function (st) {
		var convertToPairs = function (item) { return [item, true]; };
		var arr1 = ['d', 'a', 'b'];
		var arr2 = [3, 2, 'z', 'a', 1];
		var arr3 = [3, 2, 'z', {}, 'a', 1];

		[arr1, arr2, arr3].forEach(function (array, i) {
			var entries = array.map(convertToPairs);
			st.deepEqual(entriesArray(new Map(entries)), entries, 'map ' + i + ' has the correct entries');
		});

		st.end();
	});

	t.test('map iteration', function (st) {
		var map = new Map();
		map.set('a', 1);
		map.set('b', 2);
		map.set('c', 3);
		map.set('d', 4);

		var keys = [];
		var iterator = map.keys();
		keys.push(iterator.next().value);
		st.equal(map['delete']('a'), true, 'delete a');
		st.equal(map['delete']('b'), true, 'delete b');
		st.equal(map['delete']('c'), true, 'delete c');
		map.set('e');
		keys.push(iterator.next().value);
		keys.push(iterator.next().value);

		st.equal(iterator.next().done, true, 'iterator is exhausted');
		map.set('f');
		st.equal(iterator.next().done, true, 'iterator is still exhausted after adding an entry');
		st.deepEqual(keys, ['a', 'd', 'e'], 'the iterator visited the correct keys');

		st.end();
	});

	/*
	 * Disabled since we don't have Set here
	 * t.test('MapIterator identification test prototype inequality', { skip: !Object.getPrototypeOf }, function (st) {
	 *		var mapEntriesProto = Object.getPrototypeOf(new Map().entries());
	 *		var setEntriesProto = Object.getPrototypeOf(new Set().entries());
	 *		st.notEqual(mapEntriesProto, setEntriesProto);
	 *	});
	 */

	t.test('MapIterator identification', function (st) {
		var fnMapValues = Map.prototype.values;
		var mapSentinel = new Map([[1, 'MapSentinel']]);
		var testMap = new Map();
		var testMapValues = testMap.values();
		st.equal(testMapValues.next.call(fnMapValues.call(mapSentinel)).value, 'MapSentinel', 'extracts value from a different map');

		/*
		 * var testSet = new Set();
		 * var testSetValues = testSet.values();
		 * st.throws(function () {
		 * 	return testSetValues.next.call(fnMapValues.call(mapSentinel)).value;
		 * }, TypeError);
		 */

		st.end();
	});
};
