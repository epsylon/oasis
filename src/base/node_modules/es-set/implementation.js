'use strict';

var define = require('define-properties');
var SLOT = require('internal-slot');
var setProto = require('es-abstract/helpers/setProto');

var SetIterator = require('./lib/set-iterator');
var setHelpers = require('./lib/set-helpers');
var helpers = require('./lib/helpers');
var requireSetSlot = require('./lib/validation').requireSetSlot;
var fastkey = setHelpers.fastkey;
var setForEach = setHelpers.forEach;
var addIterableToSet = setHelpers.addIterableToSet;
var SET_ITEM = setHelpers.SET_ITEM;
var ensureSet = setHelpers.ensureSet;
var iterateStorage = setHelpers.iterateStorage;
var emptyObject = helpers.emptyObject;
var emulateES6construct = helpers.emulateES6construct;
var addIterator = helpers.addIterator;

/*
 * Creating a Map is expensive. To speed up the common case of
 * Sets containing only string or numeric keys, we use an object
 * as backing storage and lazily create a full Map only when
 * required.
 */
var SetShimPrototype;
var SetShim = function Set() {
	if (!(this instanceof Set)) {
		throw new TypeError('Constructor Set requires "new"');
	}
	if (this && SLOT.has(this, '[[es6set]]')) {
		throw new TypeError('Bad construction');
	}
	var set = emulateES6construct(this, Set, SetShimPrototype, {
		'[[es6set]]': true,
		'[[setData]]': null,
		'[[storage]]': emptyObject()
	});
	if (!SLOT.has(set, '[[es6set]]')) {
		throw new TypeError('bad set');
	}

	// Optionally initialize set from iterable
	if (arguments.length > 0) {
		addIterableToSet(set, arguments[0]);
	}
	return set;
};
SetShimPrototype = SetShim.prototype;

if (define.supportsDescriptors) {
	Object.defineProperty(SetShimPrototype, 'size', {
		configurable: true,
		enumerable: false,
		get: function () {
			requireSetSlot(this, 'size');
			var storage = SLOT.get(this, '[[storage]]');
			if (storage) {
				var size = 0;
				iterateStorage(storage, function () {
					size += 1;
				});
				return size;
			}
			ensureSet(this);
			return SLOT.get(this, '[[setData]]').size;
		}
	});
}

/* eslint-disable sort-keys */
define(SetShimPrototype, {
	add: function add(key) {
		requireSetSlot(this, 'has');
		var fkey;
		var storage = SLOT.get(this, '[[storage]]');
		if (storage && (fkey = fastkey(key)) !== null) {
			if (storage[fkey] !== SET_ITEM) {
				storage[fkey] = SET_ITEM;
			}
		} else {
			ensureSet(this);
			SLOT.get(this, '[[setData]]').set(key, key);
		}
		return this;
	},

	has: function has(key) {
		requireSetSlot(this, 'has');
		var fkey;
		var storage = SLOT.get(this, '[[storage]]');
		if (storage && (fkey = fastkey(key)) !== null) {
			return !!storage[fkey];
		}
		ensureSet(this);
		return SLOT.get(this, '[[setData]]').has(key);
	},

	'delete': function (key) {
		requireSetSlot(this, 'delete');
		var fkey;
		var storage = SLOT.get(this, '[[storage]]');
		if (storage && (fkey = fastkey(key)) !== null) {
			var hasFKey = !!storage[fkey];
			if (hasFKey) {
				delete storage[fkey];
			}
			return hasFKey;
		}
		ensureSet(this);
		return SLOT.get(this, '[[setData]]')['delete'](key);
	},

	clear: function clear() {
		requireSetSlot(this, 'clear');
		var storage = SLOT.get(this, '[[storage]]');
		if (storage) {
			SLOT.set(this, '[[storage]]', emptyObject());
		}
		var setData = SLOT.get(this, '[[setData]]');
		if (setData) {
			setData.clear();
		}
	},

	values: function values() {
		requireSetSlot(this, 'values');
		ensureSet(this);
		return new SetIterator(SLOT.get(this, '[[setData]]').values());
	},

	entries: function entries() {
		requireSetSlot(this, 'entries');
		ensureSet(this);
		return new SetIterator(SLOT.get(this, '[[setData]]').entries());
	},

	forEach: function forEach(fn) {
		requireSetSlot(this, 'forEach');
		setForEach(this, fn, arguments.length > 1 ? arguments[1] : void undefined);
	}
});
define(SetShimPrototype, { keys: SetShimPrototype.values });

addIterator(SetShimPrototype, SetShimPrototype.values);

if (typeof Set === 'function' && setProto) {
	setProto(SetShimPrototype, Set.prototype);
}

module.exports = SetShim;
