'use strict';

var OrdinarySetPrototypeOf = require('es-abstract/2024/OrdinarySetPrototypeOf');
var define = require('define-properties');
var SLOT = require('internal-slot');

var implementation = require('./implementation');
var addIterableToSet = require('./lib/set-helpers').addIterableToSet;
var support = require('./lib/support');

var SetShim;

module.exports = function getPolyfill() {
	if (
		typeof Set === 'function'
		&& !support.setCompliantConstructor()
		&& support.setUsesSameValueZero()
	) {
		var OrigSet = Set;
		if (
			!SetShim
			|| !(OrigSet === SetShim || SLOT.get(SetShim, '[[OrigSet]]') === OrigSet)
		) {
			var OrigSet$prototype = OrigSet.prototype;

			SetShim = function Set() {
				if (!(this instanceof SetShim)) {
					throw new TypeError('Constructor Set requires "new"');
				}
				if (this && SLOT.has(this, '[[SetCompliantConstructorShim]]')) {
					throw new TypeError('Bad construction');
				}
				var s = new OrigSet();
				SLOT.set(s, '[[SetCompliantConstructorShim]]', true);
				if (arguments.length > 0) {
					addIterableToSet(s, arguments[0]);
				}
				delete s.constructor;
				OrdinarySetPrototypeOf(s, SetShim.prototype);
				return s;
			};
			SLOT.set(SetShim, '[[OrigSet]]', Set);

			SetShim.prototype = OrigSet$prototype;
			define(
				SetShim.prototype,
				{ constructor: SetShim },
				{ constructor: function () { return true; } }
			);
		}

		return SetShim;
	}

	if (
		typeof Set !== 'function'
		|| support.isGoogleTranslate()
		|| support.setHasOldFirefoxInterface()
		|| !support.setHasCorrectName()
		|| !support.setKeysIsValues()
		|| !support.setSupportsChaining()
		|| !support.setUsesSameValueZero()
	) {
		return implementation;
	}

	return Set;
};
