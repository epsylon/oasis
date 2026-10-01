'use strict';

var define = require('define-properties');
var globalThis = require('globalthis')();
var SLOT = require('internal-slot');
var getPolyfill = require('./polyfill');
var support = require('./lib/support');
var addIterableToMap = require('./lib/map-helpers').addIterableToMap;

var OrdinarySetPrototypeOf = require('es-abstract/2024/OrdinarySetPrototypeOf');
var Call = require('es-abstract/2024/Call');

var force = function () {
	return true;
};

var replaceGlobal = function (MapShim) {
	define(globalThis, { Map: MapShim }, { Map: force });
	return MapShim;
};

// eslint-disable-next-line max-lines-per-function
module.exports = function shimMap() {
	if (typeof Map !== 'function' || support.mapHasOldFirefoxInterface() || !support.mapIterationFinishes()) {
		return replaceGlobal(getPolyfill());
	}

	var OrigMap = Map;
	var OrigMap$prototype = OrigMap.prototype;
	var OrigMap$get = OrigMap$prototype.get;
	var OrigMap$has = OrigMap$prototype.has;
	var OrigMap$set = OrigMap$prototype.set;

	if (!support.mapCompliantConstructor()) {
		var MapShim = function Map() {
			if (!(this instanceof MapShim)) {
				throw new TypeError('Constructor Map requires "new"');
			}
			if (this && SLOT.has(this, '[[MapCompliantConstructorShim]]')) {
				throw new TypeError('Bad construction');
			}
			var m = new OrigMap();
			SLOT.set(m, '[[MapCompliantConstructorShim]]', true);
			if (arguments.length > 0) {
				addIterableToMap(m, arguments[0]);
			}
			delete m.constructor;
			OrdinarySetPrototypeOf(m, MapShim.prototype);
			return m;
		};
		MapShim.prototype = OrigMap$prototype;
		define(
			MapShim.prototype,
			{ constructor: MapShim },
			{ constructor: force }
		);

		replaceGlobal(MapShim);
	}

	if (!support.mapUsesSameValueZero()) {
		define(Map.prototype, {
			get: function get(k) {
				return Call(OrigMap$get, this, [k === 0 ? 0 : k]);
			},
			has: function has(k) {
				return Call(OrigMap$has, this, [k === 0 ? 0 : k]);
			},
			set: function set(k, v) {
				Call(OrigMap$set, this, [k === 0 ? 0 : k, v]);
				return this;
			}
		}, {
			get: force,
			has: force,
			set: force
		});
	} else if (!support.mapSupportsChaining()) {
		define(
			Map.prototype,
			{
				set: function set(k, v) {
					Call(OrigMap$set, this, [k, v]);
					return this;
				}
			},
			{ set: force }
		);
	}

	return globalThis.Map;
};
