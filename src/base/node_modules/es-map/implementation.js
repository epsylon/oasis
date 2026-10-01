'use strict';

var define = require('define-properties');
var callBound = require('call-bind/callBound');
var GetIntrinsic = require('get-intrinsic');
var SLOT = require('internal-slot');
var SameValue = require('es-abstract/2024/SameValue');
var SameValueZero = require('es-abstract/2024/SameValueZero');

var MapEntry = require('./lib/map-entry');
var MapIterator = require('./lib/map-iterator');
var mapHelpers = require('./lib/map-helpers');
var helpers = require('./lib/helpers');
var requireMapSlot = require('./lib/validation').requireMapSlot;
var fastkey = mapHelpers.fastkey;
var mapForEach = mapHelpers.forEach;
var addIterableToMap = mapHelpers.addIterableToMap;
var emptyObject = helpers.emptyObject;
var emulateES6construct = helpers.emulateES6construct;
var addIterator = helpers.addIterator;

var OrigMap = GetIntrinsic('%Map%', true);
var origMapDel = callBound('%Map.prototype.delete%', true);
var origMapGet = callBound('%Map.prototype.get%', true);
var origMapHas = callBound('%Map.prototype.has%', true);
var origMapSet = callBound('%Map.prototype.set%', true);

var MapShimPrototype;
var MapShim = function Map() {
	if (!(this instanceof Map)) {
		throw new TypeError('Constructor Map requires "new"');
	}
	if (this && SLOT.has(this, '[[es6map]]')) {
		throw new TypeError('Bad construction');
	}
	var map = emulateES6construct(this, Map, MapShimPrototype, {
		'[[es6map]]': true,
		'[[head]]': null,
		'[[map]]': OrigMap ? new OrigMap() : null,
		'[[size]]': 0,
		'[[storage]]': emptyObject()
	});

	var head = new MapEntry(null, null);
	// circular doubly-linked list.
	head.next = head;
	head.prev = head;
	SLOT.set(map, '[[head]]', head);

	// Optionally initialize map from iterable
	if (arguments.length > 0) {
		addIterableToMap(map, arguments[0]);
	}
	return map;
};
MapShimPrototype = MapShim.prototype;

if (define.supportsDescriptors) {
	Object.defineProperty(MapShimPrototype, 'size', {
		configurable: true,
		enumerable: false,
		get: function () {
			requireMapSlot(this, 'size');
			return SLOT.get(this, '[[size]]');
		}
	});
}

/* eslint-disable sort-keys */
define(MapShimPrototype, {
	get: function get(key) {
		requireMapSlot(this, 'get');
		var entry;
		var fkey = fastkey(key, true);
		if (fkey !== null) {
			// fast O(1) path
			entry = SLOT.get(this, '[[storage]]')[fkey];
			if (entry) {
				return entry.value;
			}
			return void undefined;
		}
		var map = SLOT.get(this, '[[map]]');
		if (map) {
			// fast object key path
			entry = origMapGet(map, key);
			if (entry) {
				return entry.value;
			}
			return void undefined;
		}
		var head = SLOT.get(this, '[[head]]');
		var i = head;
		while ((i = i.next) !== head) {
			if (SameValueZero(i.key, key)) {
				return i.value;
			}
		}

		return void undefined;
	},

	has: function has(key) {
		requireMapSlot(this, 'has');
		var fkey = fastkey(key, true);
		var storage = SLOT.get(this, '[[storage]]');
		if (fkey !== null) {
			// fast O(1) path
			return typeof storage[fkey] !== 'undefined';
		}
		var map = SLOT.get(this, '[[map]]');
		if (map) {
			// fast object key path
			return origMapHas(map, key);
		}
		var head = SLOT.get(this, '[[head]]');
		var i = head;
		while ((i = i.next) !== head) {
			if (SameValueZero(i.key, key)) {
				return true;
			}
		}
		return false;
	},

	set: function set(key, value) {
		requireMapSlot(this, 'set');
		var head = SLOT.get(this, '[[head]]');
		var i = head;
		var entry;
		var fkey = fastkey(key, true);
		if (fkey !== null) {
			var storage = SLOT.get(this, '[[storage]]');
			// fast O(1) path
			if (typeof storage[fkey] === 'undefined') {
				entry = new MapEntry(key, value);
				storage[fkey] = entry;
				i = head.prev;
				// fall through
			} else {
				storage[fkey].value = value;
				return this;
			}
		} else {
			var map = SLOT.get(this, '[[map]]');
			if (map) {
			// fast object key path
				if (origMapHas(map, key)) {
					origMapGet(map, key).value = value;
				} else {
					entry = new MapEntry(key, value);
					origMapSet(map, key, entry);
					i = head.prev;
				// fall through
				}
			}
		}
		while ((i = i.next) !== head) {
			if (SameValueZero(i.key, key)) {
				i.value = value;
				return this;
			}
		}
		entry = entry || new MapEntry(key, value);
		if (SameValue(-0, key)) {
			entry.key = +0; // coerce -0 to +0 in entry
		}
		entry.next = head;
		entry.prev = head.prev;
		entry.prev.next = entry;
		entry.next.prev = entry;
		SLOT.set(this, '[[size]]', SLOT.get(this, '[[size]]') + 1);
		return this;
	},

	'delete': function (key) {
		requireMapSlot(this, 'delete');
		var head = SLOT.get(this, '[[head]]');
		var i = head;
		var fkey = fastkey(key, true);
		if (fkey !== null) {
			var storage = SLOT.get(this, '[[storage]]');
			// fast O(1) path
			if (typeof storage[fkey] === 'undefined') {
				return false;
			}
			i = storage[fkey].prev;
			delete storage[fkey];
			// fall through
		} else {
			var map = SLOT.get(this, '[[map]]');
			if (map) {
			// fast object key path
				if (!origMapHas(map, key)) {
					return false;
				}
				i = origMapGet(map, key).prev;
				origMapDel(map, key);
			// fall through
			}
		}
		while ((i = i.next) !== head) {
			if (SameValueZero(i.key, key)) {
				i.key = MapEntry.empty;
				i.value = MapEntry.empty;
				i.prev.next = i.next;
				i.next.prev = i.prev;
				SLOT.set(this, '[[size]]', SLOT.get(this, '[[size]]') - 1);
				return true;
			}
		}
		return false;
	},

	clear: function clear() {
		requireMapSlot(this, 'clear');
		SLOT.set(this, '[[map]]', OrigMap ? new OrigMap() : null);
		SLOT.set(this, '[[size]]', 0);
		SLOT.set(this, '[[storage]]', emptyObject());
		var head = SLOT.get(this, '[[head]]');
		var i = head;
		var p = i.next;
		while ((i = p) !== head) {
			i.key = MapEntry.empty;
			i.value = MapEntry.empty;
			p = i.next;
			i.next = head;
			i.prev = head;
		}
		head.next = head;
		head.prev = head;
	},

	keys: function keys() {
		requireMapSlot(this, 'keys');
		return new MapIterator(this, 'key');
	},

	values: function values() {
		requireMapSlot(this, 'values');
		return new MapIterator(this, 'value');
	},

	entries: function entries() {
		requireMapSlot(this, 'entries');
		return new MapIterator(this, 'key+value');
	},

	forEach: function forEach(fn) {
		requireMapSlot(this, 'forEach');
		mapForEach(this, fn, arguments.length > 1 ? arguments[1] : void undefined);
	}
});

addIterator(MapShimPrototype, MapShimPrototype.entries);

module.exports = MapShim;
