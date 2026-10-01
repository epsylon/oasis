'use strict';

var functionsHaveNames = require('functions-have-names');

var valueOrFalseIfThrows = function (cb) {
	return function () {
		try {
			return cb();
		} catch (_) {
			return false;
		}
	};
};

/*
 * special-case force removal of wildly invalid Set implementation in Google Translate iframes
 * see https://github.com/paulmillr/es6-shim/issues/438 / https://twitter.com/ljharb/status/849335573114363904
 */
exports.isGoogleTranslate = function () {
	return (
		!!Set.prototype['delete'] && Set.prototype.remove && Set.prototype.items && Set.prototype.map && Array.isArray(new Set().keys)
	);
};

exports.setUsesSameValueZero = function () {
	if (!Set.prototype['delete'] || !Set.prototype.add || !Set.prototype.has) {
		return false;
	}
	// Chrome 38-42, node 0.11/0.12, iojs 1/2 also have a bug when the Set has a size > 4
	// eslint-disable-next-line no-magic-numbers
	var s = new Set([1, 2, 3, 4]);
	s['delete'](0);
	s.add(-0);
	if (!s.has(0)) {
		return false;
	}

	// iojs 2.5 passes the normalizes -0 to 0 when adding it, but not when using .has()
	// eslint-disable-next-line no-magic-numbers
	s = new Set([1, 2, 3, 4]);
	s['delete'](-0);
	s.add(0);
	return s.has(-0);
};

exports.setSupportsChaining = function () {
	var testSet = new Set();
	return testSet.add(1) === testSet;
};

var setSupportsSubclassing = valueOrFalseIfThrows(function () {
	// without Object.setPrototypeOf, subclassing is not possible anyway
	if (!Object.setPrototypeOf) {
		return true;
	}

	var Sub = function Subclass(arg) {
		var o = new Set(arg);
		Object.setPrototypeOf(o, Subclass.prototype);
		return o;
	};
	Object.setPrototypeOf(Sub, Set);
	Object.setPrototypeOf(Sub.prototype, Set.prototype);

	var s = new Sub([]);
	s.add(1, 2);
	return s instanceof Sub;
});

// In Firefox 25 at least, Map and Set are callable without "new"
var setRequiresNew = function () {
	try {
		// eslint-disable-next-line new-cap
		return !(Set() instanceof Set);
	} catch (e) {
		return e instanceof TypeError;
	}
};

exports.setCompliantConstructor = function () {
	return Set.length === 0 && setSupportsSubclassing() && setRequiresNew();
};

exports.setKeysIsValues = function () {
	// Fixed in WebKit with https://bugs.webkit.org/show_bug.cgi?id=144190
	return Set.prototype.keys === Set.prototype.values;
};

exports.setHasCorrectName = function () {
	// We can't fix it anyway
	if (!functionsHaveNames) {
		return true;
	}

	// Microsoft Edge v0.11.10074.0 is missing a name on Set#has
	return Set.prototype.has.name === 'has';
};
/*
 * In Firefox < 23, Set#size is a function.
 * In Firefox < 24, Set#entries/keys/values do not exist: https://bugzilla.mozilla.org/show_bug.cgi?id=869996
 * In Firefox 24, Map and Set do not implement forEach
 */
exports.setHasOldFirefoxInterface = function () {
	return (
		new Set().size !== 0 || typeof Set.prototype.values !== 'function' || typeof Set.prototype.forEach !== 'function'
	);
};
