'use strict';

var callBind = require('call-bind');
var define = require('define-properties');
var Call = require('es-abstract/2024/Call');
var DefinePropertyOrThrow = require('es-abstract/2024/DefinePropertyOrThrow');
var globalThis = require('globalthis')();
var hasPropertyDescriptors = require('has-property-descriptors');
var getStopIterationIterator = require('stop-iteration-iterator');

var getPolyfill = require('./polyfill');
var support = require('./lib/support');
var addIterator = require('./lib/helpers').addIterator;

var force = function () {
	return true;
};

var replaceGlobal = function (SetShim) {
	define(globalThis, { Set: SetShim }, { Set: force });
	return SetShim;
};

module.exports = function shimSet() {
	if (typeof Set === 'function') {
		if (support.isGoogleTranslate()) {
			delete Set.prototype.remove;
			delete Set.prototype.items;
			delete Set.prototype.map;
			define(Set.prototype, { keys: Set.prototype.values }, { keys: force });
		}

		if (support.setHasOldFirefoxInterface()) {
			if (typeof new Set().size === 'function' && hasPropertyDescriptors()) {
				var $size = callBind(Set.prototype.size);
				DefinePropertyOrThrow(Set.prototype, 'size', {
					'[[Configurable]]': true,
					'[[Enumerable]]': false,
					'[[Get]]': function size() {
						return $size(this);
					}
				});
			}

			var $entries = callBind(Set.prototype.entries);
			var $values = callBind(Set.prototype.values);
			define(Set.prototype, {
				entries: function entries() {
					return getStopIterationIterator($entries(this));
				},
				values: function values() {
					return getStopIterationIterator($values(this));
				}
			}, {
				entries: force,
				values: force
			});

			if (typeof Set.prototype.forEach !== 'function') {
				var $iterator = callBind(Set.prototype.iterator);
				define(
					Set.prototype,
					{
						forEach: function forEach(cb) {
							var iterator = getStopIterationIterator($iterator(this));
							var thisArg = arguments.length > 1 ? arguments[1] : void undefined;
							var cbB = callBind(cb, thisArg);
							var result = iterator.next();
							while (!result.done) {
								cbB(result.value, result.value, this);
								result = iterator.next();
							}
						}
					},
					{ forEach: force }
				);
			}
		}
	}

	var OrigSet = typeof Set === 'function' ? Set : null;
	if (
		typeof Set !== 'function'
		|| !support.setCompliantConstructor()
	) {
		OrigSet = getPolyfill();
		replaceGlobal(OrigSet);
	}

	// modify the built-in Set, which may be replaced above already:

	var OrigSet$prototype = OrigSet.prototype;
	var OrigSet$add = OrigSet$prototype.add;
	var OrigSet$has = OrigSet$prototype.has;
	var OrigSet$delete = OrigSet$prototype['delete'];

	if (!support.setUsesSameValueZero()) {
		define(OrigSet.prototype, {
			add: function add(v) {
				Call(OrigSet$add, this, [v === 0 ? 0 : v]);
				return this;
			},
			'delete': function _delete(v) {
				return Call(OrigSet$delete, this, [v === 0 ? 0 : v]);
			},
			has: function has(v) {
				return Call(OrigSet$has, this, [v === 0 ? 0 : v]);
			}
		}, {
			add: force,
			'delete': force,
			has: force
		});
	} else if (!support.setSupportsChaining()) {
		define(OrigSet.prototype, {
			add: function add(v) {
				Call(OrigSet$add, this, [v]);
				return this;
			}
		}, { add: force });
	}

	if (!support.setKeysIsValues()) {
		define(OrigSet.prototype, { keys: OrigSet.prototype.values }, { keys: force });
	}

	if (!support.setHasCorrectName()) {
		define(OrigSet.prototype, {
			has: function has(v) {
				return Call(OrigSet$has, this, v);
			}
		}, { has: force });
	}

	if (Object.getPrototypeOf) {
		// Shim incomplete iterator implementations.
		addIterator(Object.getPrototypeOf(new OrigSet().values()));
	}

	return OrigSet;
};
