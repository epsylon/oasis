'use strict';

var getPolyfill = require('./polyfill');
var define = require('define-properties');
var shimSet = require('es-set/shim');

module.exports = function shimSetIsSubsetOf() {
	shimSet();

	var polyfill = getPolyfill();
	define(
		Set.prototype,
		{ isSubsetOf: polyfill },
		{ isSubsetOf: function () { return Set.prototype.isSubsetOf !== polyfill; } }
	);

	return polyfill;
};
